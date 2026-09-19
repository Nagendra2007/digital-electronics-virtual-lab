/**
 * 74-series logic gate packages.
 *
 * Every entry carries the real DIP pinout from the device's datasheet: the pin
 * numbers below are the pins you would count on the physical part, and the
 * simulation reads and drives exactly those pins.
 */
import { and, nand, nor, not, or, xnor, xor } from '../logic';
import type { ComponentModel, NetValue, PinDef, TruthTable } from '../types';

type Op = 'and' | 'or' | 'nand' | 'nor' | 'xor' | 'xnor' | 'not';

const OPS: Record<Op, (...v: NetValue[]) => NetValue> = {
  and,
  or,
  nand,
  nor,
  xor,
  xnor,
  not: (a) => not(a),
};

const OP_TEXT: Record<Op, string> = {
  and: 'Y = A · B',
  or: 'Y = A + B',
  nand: 'Y = (A · B)̅',
  nor: 'Y = (A + B)̅',
  xor: 'Y = A ⊕ B',
  xnor: 'Y = (A ⊕ B)̅',
  not: 'Y = A̅',
};

const LETTERS = ['A', 'B', 'C', 'D'];

interface GateSpec {
  /** Input pin numbers, in datasheet order (A, B, C, D). */
  in: number[];
  /** Output pin number. */
  out: number;
}

interface GateICSpec {
  id: string;
  name: string;
  op: Op;
  pkg: 'DIP14' | 'DIP16';
  vcc: number;
  gnd: number;
  nc?: number[];
  gates: GateSpec[];
  description: string;
  keywords?: string[];
  notes?: string[];
}

/** Build the per-gate truth table for a gate package. */
function gateTruthTable(op: Op, arity: number): TruthTable {
  const fn = OPS[op];
  const names = LETTERS.slice(0, arity);
  const rows: string[][] = [];
  for (let i = 0; i < 1 << arity; i++) {
    const bits: NetValue[] = [];
    // Bit order: first named input is the most significant column, so the
    // table reads the way it is printed in a lab manual.
    for (let b = 0; b < arity; b++) bits.push(((i >> (arity - 1 - b)) & 1) as 0 | 1);
    rows.push([...bits.map(String), String(fn(...bits))]);
  }
  return {
    headers: [...names, 'Y'],
    rows,
    note: `${OP_TEXT[op]} — applies to every gate in the package.`,
  };
}

export function gateIC(spec: GateICSpec): ComponentModel {
  const size = spec.pkg === 'DIP14' ? 14 : 16;
  const pins: PinDef[] = [
    { n: spec.vcc, name: 'VCC', kind: 'power', fn: '+5 V supply' },
    { n: spec.gnd, name: 'GND', kind: 'ground', fn: '0 V (ground) return' },
  ];

  spec.gates.forEach((g, gi) => {
    const group = `Gate ${gi + 1}`;
    g.in.forEach((p, ii) => {
      pins.push({
        n: p,
        name: `${gi + 1}${LETTERS[ii]}`,
        kind: 'input',
        fn: `${group} input ${LETTERS[ii]}`,
        group,
      });
    });
    pins.push({
      n: g.out,
      name: `${gi + 1}Y`,
      kind: 'output',
      fn: `${group} output`,
      group,
    });
  });

  for (const p of spec.nc ?? []) {
    pins.push({ n: p, name: 'NC', kind: 'nc', fn: 'No internal connection' });
  }

  pins.sort((a, b) => a.n - b.n);

  if (pins.length !== size) {
    throw new Error(`${spec.id}: described ${pins.length} pins but package has ${size}`);
  }

  const fn = OPS[spec.op];
  const arity = spec.gates[0].in.length;

  return {
    type: `ic:${spec.id}`,
    label: spec.id,
    name: spec.name,
    category: 'gate',
    description: spec.description,
    pins,
    pkg: spec.pkg,
    vccPin: spec.vcc,
    gndPin: spec.gnd,
    needsPower: true,
    truthTable: gateTruthTable(spec.op, arity),
    notes: [
      `${spec.gates.length} independent gate${spec.gates.length > 1 ? 's' : ''} in one package, ${OP_TEXT[spec.op]}.`,
      `Pin ${spec.vcc} is VCC and pin ${spec.gnd} is GND — both must be wired or the package produces nothing.`,
      ...(spec.notes ?? []),
    ],
    keywords: [spec.op, 'gate', `74LS${spec.id.slice(2)}`, ...(spec.keywords ?? [])],
    evaluate(ctx) {
      for (const g of spec.gates) {
        const inputs = g.in.map((p) => ctx.read(p));
        ctx.write(g.out, fn(...inputs));
      }
    },
  };
}

export const GATE_ICS: ComponentModel[] = [
  gateIC({
    id: '7400',
    name: 'Quad 2-input NAND gate',
    op: 'nand',
    pkg: 'DIP14',
    vcc: 14,
    gnd: 7,
    gates: [
      { in: [1, 2], out: 3 },
      { in: [4, 5], out: 6 },
      { in: [9, 10], out: 8 },
      { in: [12, 13], out: 11 },
    ],
    description:
      'Four independent 2-input NAND gates. The NAND is a universal gate: AND, OR, NOT, XOR and every other function can be built from NAND gates alone.',
    keywords: ['universal', 'nand'],
  }),
  gateIC({
    id: '7402',
    name: 'Quad 2-input NOR gate',
    op: 'nor',
    pkg: 'DIP14',
    vcc: 14,
    gnd: 7,
    gates: [
      { in: [2, 3], out: 1 },
      { in: [5, 6], out: 4 },
      { in: [8, 9], out: 10 },
      { in: [11, 12], out: 13 },
    ],
    description:
      'Four independent 2-input NOR gates. Note the unusual pinout: on the 7402 the gate OUTPUT comes first (pin 1), then the two inputs - the opposite of the 7400 family layout.',
    notes: ['Watch the pinout: outputs are on pins 1, 4, 10 and 13, not pins 3, 6, 8 and 11.'],
    keywords: ['universal', 'nor'],
  }),
  gateIC({
    id: '7404',
    name: 'Hex inverter (NOT gate)',
    op: 'not',
    pkg: 'DIP14',
    vcc: 14,
    gnd: 7,
    gates: [
      { in: [1], out: 2 },
      { in: [3], out: 4 },
      { in: [5], out: 6 },
      { in: [9], out: 8 },
      { in: [11], out: 10 },
      { in: [13], out: 12 },
    ],
    description: 'Six independent inverters. Each output is the logical complement of its input.',
    keywords: ['inverter', 'not'],
  }),
  gateIC({
    id: '7408',
    name: 'Quad 2-input AND gate',
    op: 'and',
    pkg: 'DIP14',
    vcc: 14,
    gnd: 7,
    gates: [
      { in: [1, 2], out: 3 },
      { in: [4, 5], out: 6 },
      { in: [9, 10], out: 8 },
      { in: [12, 13], out: 11 },
    ],
    description: 'Four independent 2-input AND gates. The output is HIGH only when both inputs are HIGH.',
  }),
  gateIC({
    id: '7432',
    name: 'Quad 2-input OR gate',
    op: 'or',
    pkg: 'DIP14',
    vcc: 14,
    gnd: 7,
    gates: [
      { in: [1, 2], out: 3 },
      { in: [4, 5], out: 6 },
      { in: [9, 10], out: 8 },
      { in: [12, 13], out: 11 },
    ],
    description: 'Four independent 2-input OR gates. The output is HIGH when either input is HIGH.',
  }),
  gateIC({
    id: '7486',
    name: 'Quad 2-input XOR gate',
    op: 'xor',
    pkg: 'DIP14',
    vcc: 14,
    gnd: 7,
    gates: [
      { in: [1, 2], out: 3 },
      { in: [4, 5], out: 6 },
      { in: [9, 10], out: 8 },
      { in: [12, 13], out: 11 },
    ],
    description:
      'Four independent 2-input exclusive-OR gates. The output is HIGH when the inputs differ - the sum bit of a half adder, and a controllable inverter.',
    keywords: ['exclusive or', 'parity', 'half adder'],
  }),
  gateIC({
    id: '7410',
    name: 'Triple 3-input NAND gate',
    op: 'nand',
    pkg: 'DIP14',
    vcc: 14,
    gnd: 7,
    gates: [
      { in: [1, 2, 13], out: 12 },
      { in: [3, 4, 5], out: 6 },
      { in: [9, 10, 11], out: 8 },
    ],
    description: 'Three independent 3-input NAND gates.',
    notes: ['Gate 1 is split across the package: inputs on pins 1, 2 and 13 with its output on pin 12.'],
  }),
  gateIC({
    id: '7411',
    name: 'Triple 3-input AND gate',
    op: 'and',
    pkg: 'DIP14',
    vcc: 14,
    gnd: 7,
    gates: [
      { in: [1, 2, 13], out: 12 },
      { in: [3, 4, 5], out: 6 },
      { in: [9, 10, 11], out: 8 },
    ],
    description: 'Three independent 3-input AND gates. Same pin arrangement as the 7410.',
  }),
  gateIC({
    id: '7427',
    name: 'Triple 3-input NOR gate',
    op: 'nor',
    pkg: 'DIP14',
    vcc: 14,
    gnd: 7,
    gates: [
      { in: [1, 2, 13], out: 12 },
      { in: [3, 4, 5], out: 6 },
      { in: [9, 10, 11], out: 8 },
    ],
    description: 'Three independent 3-input NOR gates.',
  }),
  gateIC({
    id: '7420',
    name: 'Dual 4-input NAND gate',
    op: 'nand',
    pkg: 'DIP14',
    vcc: 14,
    gnd: 7,
    nc: [3, 11],
    gates: [
      { in: [1, 2, 4, 5], out: 6 },
      { in: [9, 10, 12, 13], out: 8 },
    ],
    description: 'Two independent 4-input NAND gates. Pins 3 and 11 are not connected inside the package.',
  }),
  gateIC({
    id: '7421',
    name: 'Dual 4-input AND gate',
    op: 'and',
    pkg: 'DIP14',
    vcc: 14,
    gnd: 7,
    nc: [3, 11],
    gates: [
      { in: [1, 2, 4, 5], out: 6 },
      { in: [9, 10, 12, 13], out: 8 },
    ],
    description: 'Two independent 4-input AND gates. Same pin arrangement as the 7420.',
  }),
  gateIC({
    id: '7413',
    name: 'Dual 4-input Schmitt-trigger NAND gate',
    op: 'nand',
    pkg: 'DIP14',
    vcc: 14,
    gnd: 7,
    nc: [3, 11],
    gates: [
      { in: [1, 2, 4, 5], out: 6 },
      { in: [9, 10, 12, 13], out: 8 },
    ],
    description:
      'Two 4-input NAND gates with Schmitt-trigger inputs. On real hardware the hysteresis cleans up slow or noisy edges; logically it behaves as a 4-input NAND, which is what this simulation models.',
    notes: [
      'Schmitt hysteresis is an analogue property. In a digital simulation the logic function is identical to the 7420.',
    ],
    keywords: ['schmitt', 'hysteresis', 'debounce'],
  }),
];
