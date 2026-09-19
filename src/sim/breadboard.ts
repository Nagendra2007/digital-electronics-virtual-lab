/**
 * The solderless breadboard.
 *
 * Every hole is a real pin of this component, and the strips behind the holes
 * are declared as internal bonds - so the netlist treats a breadboard exactly
 * like the piece of hardware it is: five holes in a column are one node, and
 * each power rail is one long node that is dead until you wire power to it.
 */
import { DIP_W, PIN_PITCH, boardLayouts } from './geometry';
import type { ComponentModel, PinDef } from './types';
import type { Layout, PinPos } from './geometry';

/**
 * A full-width board: 36 columns is five 14-pin packages side by side with room
 * to wire between them, and the dead space above and below the banks is kept
 * tight so the board can be drawn large on screen.
 */
export const BB_COLS = 36;
const MARGIN_X = 30;

export const BB_ROWS = {
  railTopPlus: 20,
  railTopMinus: 40,
  bankTop: 68, // row A; B..E follow at PIN_PITCH
  bankBottom: 68 + 4 * PIN_PITCH + DIP_W, // row F, one DIP width below row E
  railBotPlus: 0, // filled in below
  railBotMinus: 0,
};
BB_ROWS.railBotPlus = BB_ROWS.bankBottom + 4 * PIN_PITCH + 24;
BB_ROWS.railBotMinus = BB_ROWS.railBotPlus + PIN_PITCH;

export const BB_W = MARGIN_X * 2 + (BB_COLS - 1) * PIN_PITCH;
export const BB_H = BB_ROWS.railBotMinus + 20;

export const ROW_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];

/** Pin numbers are laid out in blocks so the maths stays simple. */
export const BB = {
  railTopPlus: (c: number) => 1 + c,
  railTopMinus: (c: number) => 1 + BB_COLS + c,
  /** row 0..4 = A..E */
  bankTop: (row: number, c: number) => 1 + 2 * BB_COLS + row * BB_COLS + c,
  /** row 0..4 = F..J */
  bankBottom: (row: number, c: number) => 1 + 7 * BB_COLS + row * BB_COLS + c,
  railBotPlus: (c: number) => 1 + 12 * BB_COLS + c,
  railBotMinus: (c: number) => 1 + 13 * BB_COLS + c,
  total: 14 * BB_COLS,
};

export const holeX = (c: number) => MARGIN_X + c * PIN_PITCH;

export function holeY(pin: number): number {
  const i = pin - 1;
  const block = Math.floor(i / BB_COLS);
  if (block === 0) return BB_ROWS.railTopPlus;
  if (block === 1) return BB_ROWS.railTopMinus;
  if (block >= 2 && block <= 6) return BB_ROWS.bankTop + (block - 2) * PIN_PITCH;
  if (block >= 7 && block <= 11) return BB_ROWS.bankBottom + (block - 7) * PIN_PITCH;
  if (block === 12) return BB_ROWS.railBotPlus;
  return BB_ROWS.railBotMinus;
}

export const holeCol = (pin: number) => (pin - 1) % BB_COLS;

function holeName(pin: number): string {
  const i = pin - 1;
  const block = Math.floor(i / BB_COLS);
  const col = (i % BB_COLS) + 1;
  if (block === 0) return `+ rail ${col} (top)`;
  if (block === 1) return `- rail ${col} (top)`;
  if (block === 12) return `+ rail ${col} (bottom)`;
  if (block === 13) return `- rail ${col} (bottom)`;
  const row = block <= 6 ? ROW_LETTERS[block - 2] : ROW_LETTERS[block - 7 + 5];
  return `${row}${col}`;
}

function holeFn(pin: number): string {
  const block = Math.floor((pin - 1) / BB_COLS);
  if (block === 0 || block === 12) return 'Power rail - the whole red line is one node';
  if (block === 1 || block === 13) return 'Ground rail - the whole blue line is one node';
  const col = ((pin - 1) % BB_COLS) + 1;
  const half = block <= 6 ? 'upper' : 'lower';
  return `Terminal strip: all five holes of column ${col} in the ${half} bank are one node`;
}

const pins: PinDef[] = Array.from({ length: BB.total }, (_, i) => ({
  n: i + 1,
  name: holeName(i + 1),
  kind: 'hole' as const,
  fn: holeFn(i + 1),
}));

const bonds: number[][] = (() => {
  const out: number[][] = [];
  const rail = (f: (c: number) => number) =>
    out.push(Array.from({ length: BB_COLS }, (_, c) => f(c)));
  rail(BB.railTopPlus);
  rail(BB.railTopMinus);
  rail(BB.railBotPlus);
  rail(BB.railBotMinus);
  for (let c = 0; c < BB_COLS; c++) {
    out.push([0, 1, 2, 3, 4].map((r) => BB.bankTop(r, c)));
    out.push([0, 1, 2, 3, 4].map((r) => BB.bankBottom(r, c)));
  }
  return out;
})();

const layout: Layout = {
  w: BB_W,
  h: BB_H,
  bodyX: 0,
  bodyY: 0,
  bodyW: BB_W,
  bodyH: BB_H,
  pins: pins.map<PinPos>((p) => ({
    n: p.n,
    x: holeX(holeCol(p.n)),
    y: holeY(p.n),
    side: 'T',
  })),
};

boardLayouts.set('breadboard:default', layout);

export const breadboard: ComponentModel = {
  type: 'breadboard',
  label: 'BREADBOARD',
  name: 'Solderless breadboard',
  category: 'board',
  pkg: 'module',
  needsPower: false,
  description:
    'A standard solderless breadboard. The four long rails are the power buses; in the middle, each column of five holes is one node, and the two banks are separated by the centre channel that a DIP package straddles.',
  notes: [
    'The rails are NOT powered until you wire a VCC and a GND component to them - exactly like a real bench.',
    'Drop an IC so that its pins land in the row of holes on each side of the centre channel, then wire from the free holes of those columns.',
    'The centre channel here is drawn wide enough for the IC body and its pin names to stay readable.',
    'Holes in the same column of the same bank are the same node: a wire in any of them reaches the IC pin.',
  ],
  keywords: ['breadboard', 'protoboard', 'strip', 'rail', 'board'],
  pins,
  internalBonds: () => bonds,
  evaluate() {
    /* passive: connectivity comes from the internal bonds */
  },
};
