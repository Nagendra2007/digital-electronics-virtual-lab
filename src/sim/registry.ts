/**
 * The parts bin: every model the lab knows about, plus the helpers used to put
 * one on the bench. Adding an IC is a matter of adding it to one of the arrays
 * in `ics/` - nothing else in the app needs to change.
 */
import { BB_W, breadboard } from './breadboard';
import { DEVICES } from './devices';
import { COMBINATIONAL_ICS } from './ics/combinational';
import { GATE_ICS } from './ics/gates';
import { SEQUENTIAL_ICS } from './ics/sequential';
import { defaultSettings } from './types';
import type { Category, Circuit, ComponentModel, PlacedComponent } from './types';

export const IC_MODELS: ComponentModel[] = [...GATE_ICS, ...COMBINATIONAL_ICS, ...SEQUENTIAL_ICS];
export const ALL_MODELS: ComponentModel[] = [...IC_MODELS, ...DEVICES, breadboard];

export const MODELS = new Map(ALL_MODELS.map((m) => [m.type, m]));

export const getModel = (type: string): ComponentModel | undefined => MODELS.get(type);

/**
 * A breadboard lies flat on the bench and every part placed on it is seated
 * against its hole grid, so it does not turn - you move yourself around a real
 * one, not the board. Everything else rotates.
 */
export const canRotate = (model: ComponentModel): boolean => model.category !== 'board';

/** Put any board that was turned in an older saved bench back flat. */
export function normaliseBoards(circuit: Circuit): Circuit {
  for (const c of circuit.components) {
    const model = getModel(c.type);
    if (model && !canRotate(model)) c.rot = 0;
  }
  return circuit;
}

export const CATEGORY_LABELS: Record<Category, string> = {
  gate: 'Logic gates',
  decoder: 'Decoders',
  encoder: 'Encoders',
  mux: 'Multiplexers',
  flipflop: 'Flip-flops',
  counter: 'Counters',
  register: 'Registers & shift registers',
  display: 'Displays & drivers',
  source: 'Power & clock',
  io: 'Inputs & outputs',
  passive: 'Passives',
  board: 'Boards',
};

export const LIBRARY_ORDER: Category[] = [
  'io',
  'source',
  'gate',
  'flipflop',
  'counter',
  'register',
  'mux',
  'decoder',
  'encoder',
  'display',
  'passive',
  'board',
];

export function searchModels(query: string, category?: Category | 'all'): ComponentModel[] {
  const q = query.trim().toLowerCase();
  return ALL_MODELS.filter((m) => {
    if (category && category !== 'all' && m.category !== category) return false;
    if (!q) return true;
    const hay = [m.label, m.name, m.type, m.description, ...(m.keywords ?? [])]
      .join(' ')
      .toLowerCase();
    return hay.includes(q);
  });
}

let seq = 0;
export function uid(prefix = 'c'): string {
  seq += 1;
  return `${prefix}${Date.now().toString(36).slice(-4)}${seq.toString(36)}`;
}

const DESIGNATOR: Partial<Record<string, string>> = {
  led: 'L',
  switch: 'S',
  pushbutton: 'B',
  clock: 'CLK',
  seg7: 'DS',
  resistor: 'R',
  pullup: 'RP',
  pulldown: 'RP',
  probe: 'P',
  vcc: 'V',
  gnd: 'G',
  writer: 'W',
  reader: 'RD',
  breadboard: 'BB',
};

/** U1, U2, ... for ICs; L1, S1, ... for everything else. */
export function nextDesignator(circuit: Circuit, model: ComponentModel): string {
  const prefix = model.type.startsWith('ic:') ? 'U' : (DESIGNATOR[model.type] ?? 'X');
  let n = 1;
  const taken = new Set(circuit.components.map((c) => c.label));
  while (taken.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}

export function createComponent(
  type: string,
  x: number,
  y: number,
  circuit?: Circuit,
  rot: PlacedComponent['rot'] = 0,
): PlacedComponent | null {
  const model = getModel(type);
  if (!model) return null;
  const comp: PlacedComponent = {
    id: uid(),
    type,
    x,
    y,
    rot,
    props: structuredClone(model.defaultProps ?? {}),
  };
  if (circuit) comp.label = nextDesignator(circuit, model);
  return comp;
}

/**
 * Where the fixed furniture of the bench lives: the breadboard in the middle,
 * the two trainer panels either side of it and the supply above it - the same
 * arrangement as the kit on a lab desk.
 */
export const BENCH = {
  board: { x: 260, y: 140 },
  writer: { x: 30, y: 180 },
  reader: { x: 260 + BB_W + 30, y: 180 },
  vcc: { x: 330, y: 60 },
  gnd: { x: 470, y: 60 },
  clock: { x: 30, y: 440 },
};

/** A blank bench that already has the trainer modules on it, like a real kit. */
export function newCircuit(name = 'Untitled circuit'): Circuit {
  const circuit: Circuit = {
    id: uid('ckt'),
    name,
    components: [],
    wires: [],
    settings: defaultSettings(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const add = (type: string, x: number, y: number) => {
    const c = createComponent(type, x, y, circuit);
    if (c) circuit.components.push(c);
  };
  // Laid out around the space a breadboard takes, so turning the board on does
  // not push anything aside and the bench frames neatly on any screen.
  add('writer', BENCH.writer.x, BENCH.writer.y);
  add('reader', BENCH.reader.x, BENCH.reader.y);
  add('vcc', BENCH.vcc.x, BENCH.vcc.y);
  add('gnd', BENCH.gnd.x, BENCH.gnd.y);
  return circuit;
}

/** Sanity check used by the test suite: a DIP must describe all of its pins. */
export function auditModel(model: ComponentModel): string[] {
  const problems: string[] = [];
  const expected = model.pkg === 'DIP14' ? 14 : model.pkg === 'DIP16' ? 16 : model.pins.length;
  const seen = new Set<number>();
  for (const p of model.pins) {
    if (seen.has(p.n)) problems.push(`${model.label}: pin ${p.n} is described twice`);
    seen.add(p.n);
  }
  if (model.pkg !== 'module') {
    for (let i = 1; i <= expected; i++) {
      if (!seen.has(i)) problems.push(`${model.label}: pin ${i} is missing`);
    }
    if (model.vccPin === undefined) problems.push(`${model.label}: no VCC pin declared`);
    if (model.gndPin === undefined) problems.push(`${model.label}: no GND pin declared`);
  }
  return problems;
}
