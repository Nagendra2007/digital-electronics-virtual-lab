/**
 * Every gate package is checked against its own truth table, driven through
 * real wires from a Digital Writer and read back off its output pin.
 */
import { describe, expect, it } from 'vitest';
import { Bench } from './helpers';
import { GATE_ICS } from '../src/sim/ics/gates';
import { ALL_MODELS, auditModel } from '../src/sim/registry';
import { and, nand, nor, not, or, xnor, xor } from '../src/sim/logic';
import type { NetValue } from '../src/sim/types';

const OPS: Record<string, (...v: NetValue[]) => NetValue> = {
  '7400': nand,
  '7402': nor,
  '7404': (a) => not(a),
  '7408': and,
  '7432': or,
  '7486': xor,
  '7410': nand,
  '7411': and,
  '7427': nor,
  '7420': nand,
  '7421': and,
  '7413': nand,
};

/** Input/output pins of each gate, straight from the datasheet pinout. */
const GATES: Record<string, { in: number[]; out: number }[]> = {
  '7400': [
    { in: [1, 2], out: 3 },
    { in: [4, 5], out: 6 },
    { in: [9, 10], out: 8 },
    { in: [12, 13], out: 11 },
  ],
  '7402': [
    { in: [2, 3], out: 1 },
    { in: [5, 6], out: 4 },
    { in: [8, 9], out: 10 },
    { in: [11, 12], out: 13 },
  ],
  '7404': [
    { in: [1], out: 2 },
    { in: [3], out: 4 },
    { in: [5], out: 6 },
    { in: [9], out: 8 },
    { in: [11], out: 10 },
    { in: [13], out: 12 },
  ],
  '7408': [
    { in: [1, 2], out: 3 },
    { in: [4, 5], out: 6 },
    { in: [9, 10], out: 8 },
    { in: [12, 13], out: 11 },
  ],
  '7432': [
    { in: [1, 2], out: 3 },
    { in: [4, 5], out: 6 },
    { in: [9, 10], out: 8 },
    { in: [12, 13], out: 11 },
  ],
  '7486': [
    { in: [1, 2], out: 3 },
    { in: [4, 5], out: 6 },
    { in: [9, 10], out: 8 },
    { in: [12, 13], out: 11 },
  ],
  '7410': [
    { in: [1, 2, 13], out: 12 },
    { in: [3, 4, 5], out: 6 },
    { in: [9, 10, 11], out: 8 },
  ],
  '7411': [
    { in: [1, 2, 13], out: 12 },
    { in: [3, 4, 5], out: 6 },
    { in: [9, 10, 11], out: 8 },
  ],
  '7427': [
    { in: [1, 2, 13], out: 12 },
    { in: [3, 4, 5], out: 6 },
    { in: [9, 10, 11], out: 8 },
  ],
  '7420': [
    { in: [1, 2, 4, 5], out: 6 },
    { in: [9, 10, 12, 13], out: 8 },
  ],
  '7421': [
    { in: [1, 2, 4, 5], out: 6 },
    { in: [9, 10, 12, 13], out: 8 },
  ],
  '7413': [
    { in: [1, 2, 4, 5], out: 6 },
    { in: [9, 10, 12, 13], out: 8 },
  ],
};

describe('gate packages', () => {
  for (const model of GATE_ICS) {
    const id = model.label;
    const op = OPS[id];
    const gates = GATES[id];

    it(`${id} - every gate matches ${model.name}`, () => {
      gates.forEach((gate, gi) => {
        const b = new Bench();
        const ic = b.add(model.type);
        b.power(ic);
        gate.in.forEach((pin, i) => b.drive(ic, pin, i));

        const n = gate.in.length;
        for (let combo = 0; combo < 1 << n; combo++) {
          const bits = Array.from({ length: n }, (_, i) => ((combo >> i) & 1) as 0 | 1);
          const [y] = b.row(bits, ic, [gate.out]);
          const expected = op(...bits);
          expect(
            y,
            `${id} gate ${gi + 1} (pins ${gate.in.join(',')} -> ${gate.out}) with inputs ${bits.join('')}`,
          ).toBe(expected);
        }
      });
    });
  }

  it('XNOR built from a 7486 and a 7404 behaves as XNOR', () => {
    const b = new Bench();
    const xorIc = b.add('ic:7486');
    const notIc = b.add('ic:7404');
    b.power(xorIc).power(notIc);
    b.drive(xorIc, 1, 0).drive(xorIc, 2, 1);
    b.wire(xorIc, 3, notIc, 1);

    for (const [a, bb] of [
      [0, 0],
      [0, 1],
      [1, 0],
      [1, 1],
    ] as const) {
      const [y] = b.row([a, bb], notIc, [2]);
      expect(y, `XNOR of ${a},${bb}`).toBe(xnor(a, bb));
    }
  });
});

describe('package definitions', () => {
  it('every package describes all of its pins', () => {
    const problems = ALL_MODELS.flatMap(auditModel);
    expect(problems).toEqual([]);
  });

  it('no package has two pins with the same number', () => {
    for (const m of ALL_MODELS) {
      const nums = m.pins.map((p) => p.n);
      expect(new Set(nums).size, `${m.label} has duplicate pin numbers`).toBe(nums.length);
    }
  });
});
