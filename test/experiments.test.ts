/**
 * End-to-end checks of the experiment verifier: build the circuit the way the
 * experiment sheet describes, and the checker must pass it; build it wrong and
 * the checker must catch it.
 */
import { describe, expect, it } from 'vitest';
import { Bench } from './helpers';
import { EXPERIMENTS, getExperiment } from '../src/data/experiments';
import { runCheck } from '../src/sim/verify';
import { detectInputs, detectOutputs, generateTruthTable } from '../src/sim/truthtable';

const check = (id: string) => getExperiment(id)!.check!;

describe('experiment library', () => {
  it('has twenty numbered experiments', () => {
    expect(EXPERIMENTS).toHaveLength(20);
    expect(EXPERIMENTS.map((e) => e.number)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1),
    );
  });

  it('every experiment lists parts, a procedure and an expectation', () => {
    for (const e of EXPERIMENTS) {
      expect(e.parts.length, `${e.id} parts`).toBeGreaterThan(0);
      expect(e.procedure.length, `${e.id} procedure`).toBeGreaterThan(2);
      expect(e.pinConfig.length, `${e.id} pin configuration`).toBeGreaterThan(1);
      expect(e.expected.length, `${e.id} expected result`).toBeGreaterThan(10);
      expect(e.check, `${e.id} has a machine check`).toBeTruthy();
    }
  });
});

describe('experiment 6 - half adder', () => {
  const build = () => {
    const b = new Bench();
    const x = b.add('ic:7486');
    const a = b.add('ic:7408');
    b.power(x).power(a);
    b.drive(x, 1, 0).drive(x, 2, 1);
    b.drive(a, 1, 0).drive(a, 2, 1);
    return { b, x, a };
  };

  it('passes when SUM and CARRY are on the right channels', () => {
    const { b, x, a } = build();
    b.sense(x, 3, 0); // SUM -> R8
    b.sense(a, 3, 1); // CARRY -> R9
    const result = runCheck(b.circuit, check('exp06'));
    expect(result.problems).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.passed).toBe(4);
  });

  it('fails when SUM and CARRY are swapped', () => {
    const { b, x, a } = build();
    b.sense(x, 3, 1);
    b.sense(a, 3, 0);
    const result = runCheck(b.circuit, check('exp06'));
    expect(result.ok).toBe(false);
    expect(result.passed).toBeLessThan(result.total);
  });

  it('reports the missing wire rather than a wall of wrong rows', () => {
    const { b, x } = build();
    b.sense(x, 3, 0); // only SUM wired
    const result = runCheck(b.circuit, check('exp06'));
    expect(result.ok).toBe(false);
    expect(result.problems.some((p) => p.includes('R9'))).toBe(true);
  });

  it('generates the half adder truth table from the built circuit', () => {
    const { b, x, a } = build();
    b.sense(x, 3, 0);
    b.sense(a, 3, 1);
    const inputs = detectInputs(b.circuit, b.engine);
    const outputs = detectOutputs(b.circuit, b.engine);
    expect(inputs.map((i) => i.label)).toEqual(['D0', 'D1']);
    expect(outputs.map((o) => o.label)).toEqual(['R8', 'R9']);

    const table = generateTruthTable(b.circuit, inputs, outputs);
    expect(table.rows.map((r) => r.outputs)).toEqual([
      [0, 0],
      [1, 0],
      [1, 0],
      [0, 1],
    ]);
  });
});

describe('experiment 7 - full adder', () => {
  it('passes when built from two half adders and an OR gate', () => {
    const b = new Bench();
    const x = b.add('ic:7486');
    const a = b.add('ic:7408');
    const o = b.add('ic:7432');
    b.power(x).power(a).power(o);

    b.drive(x, 1, 0).drive(x, 2, 1); // first XOR: A, B
    b.drive(a, 1, 0).drive(a, 2, 1); // first AND: A, B
    b.wire(x, 3, x, 4).drive(x, 5, 2); // second XOR: A^B, Cin
    b.wire(x, 3, a, 4).drive(a, 5, 2); // second AND: A^B, Cin
    b.wire(a, 3, o, 1).wire(a, 6, o, 2); // OR the carries

    b.sense(x, 6, 0); // SUM -> R8
    b.sense(o, 3, 1); // COUT -> R9

    const result = runCheck(b.circuit, check('exp07'));
    expect(result.problems).toEqual([]);
    expect(result.ok, JSON.stringify(result.rows.filter((r) => !r.pass))).toBe(true);
    expect(result.total).toBe(8);
  });
});

describe('experiment 15 - SR latch', () => {
  it('passes when the cross-coupling wires are in place', () => {
    const b = new Bench();
    const ic = b.add('ic:7400');
    b.power(ic);
    b.drive(ic, 1, 0).drive(ic, 4, 1);
    b.wire(ic, 3, ic, 5).wire(ic, 6, ic, 2);
    b.sense(ic, 3, 0).sense(ic, 6, 1);

    const result = runCheck(b.circuit, check('exp15'));
    expect(result.ok, JSON.stringify(result.rows.filter((r) => !r.pass))).toBe(true);
  });

  it('fails without the cross-coupling, because nothing remembers', () => {
    const b = new Bench();
    const ic = b.add('ic:7400');
    b.power(ic);
    b.drive(ic, 1, 0).drive(ic, 4, 1);
    b.high(ic, 2).high(ic, 5); // plain NAND gates, no feedback
    b.sense(ic, 3, 0).sense(ic, 6, 1);

    const result = runCheck(b.circuit, check('exp15'));
    expect(result.ok).toBe(false);
  });
});

describe('experiment 17 - D flip-flop', () => {
  it('passes when PRE and CLR are tied HIGH and the clock is wired', () => {
    const b = new Bench();
    const ic = b.add('ic:7474');
    b.power(ic);
    b.high(ic, 1).high(ic, 4);
    b.drive(ic, 2, 0).drive(ic, 3, 1);
    b.sense(ic, 5, 0).sense(ic, 6, 1);

    const result = runCheck(b.circuit, check('exp17'));
    expect(result.ok, JSON.stringify(result.rows.filter((r) => !r.pass))).toBe(true);
  });

  it('fails when CLR is left floating', () => {
    const b = new Bench();
    const ic = b.add('ic:7474');
    b.power(ic);
    b.high(ic, 4); // PRE tied, CLR forgotten
    b.drive(ic, 2, 0).drive(ic, 3, 1);
    b.sense(ic, 5, 0).sense(ic, 6, 1);

    const result = runCheck(b.circuit, check('exp17'));
    expect(result.ok).toBe(false);
  });
});

describe('experiment 19 - counter', () => {
  it('passes when QA is chained into CKB and the resets are held LOW', () => {
    const b = new Bench();
    const ic = b.add('ic:7493');
    b.power(ic);
    b.low(ic, 2).low(ic, 3);
    b.wire(ic, 12, ic, 1);
    b.drive(ic, 14, 0);
    b.sense(ic, 12, 0).sense(ic, 9, 1).sense(ic, 8, 2).sense(ic, 11, 3);

    const result = runCheck(b.circuit, check('exp19'));
    expect(result.ok, JSON.stringify(result.rows.filter((r) => !r.pass))).toBe(true);
  });

  it('fails when QA is not chained into CKB', () => {
    const b = new Bench();
    const ic = b.add('ic:7493');
    b.power(ic);
    b.low(ic, 2).low(ic, 3);
    b.low(ic, 1); // CKB tied LOW instead of chained
    b.drive(ic, 14, 0);
    b.sense(ic, 12, 0).sense(ic, 9, 1).sense(ic, 8, 2).sense(ic, 11, 3);

    const result = runCheck(b.circuit, check('exp19'));
    expect(result.ok).toBe(false);
  });
});

describe('experiment 20 - shift register', () => {
  it('passes when the 1 walks along the outputs', () => {
    const b = new Bench();
    const ic = b.add('ic:74164');
    b.power(ic);
    b.high(ic, 9).high(ic, 2);
    b.drive(ic, 1, 0).drive(ic, 8, 1);
    b.sense(ic, 3, 0).sense(ic, 4, 1).sense(ic, 5, 2).sense(ic, 6, 3);

    const result = runCheck(b.circuit, check('exp20'));
    expect(result.ok, JSON.stringify(result.rows.filter((r) => !r.pass))).toBe(true);
  });
});

describe('experiment 12 - demultiplexer', () => {
  it('passes with the 74138 enabled and all eight outputs wired', () => {
    const b = new Bench();
    const ic = b.add('ic:74138');
    b.power(ic);
    b.high(ic, 6).low(ic, 4).low(ic, 5);
    b.drive(ic, 1, 0).drive(ic, 2, 1).drive(ic, 3, 2);
    [15, 14, 13, 12, 11, 10, 9, 7].forEach((pin, i) => b.sense(ic, pin, i));

    const result = runCheck(b.circuit, check('exp12'));
    expect(result.ok, JSON.stringify(result.rows.filter((r) => !r.pass))).toBe(true);
  });

  it('fails when the chip is left disabled', () => {
    const b = new Bench();
    const ic = b.add('ic:74138');
    b.power(ic);
    b.low(ic, 6).low(ic, 4).low(ic, 5); // G1 LOW: never enabled
    b.drive(ic, 1, 0).drive(ic, 2, 1).drive(ic, 3, 2);
    [15, 14, 13, 12, 11, 10, 9, 7].forEach((pin, i) => b.sense(ic, pin, i));

    const result = runCheck(b.circuit, check('exp12'));
    expect(result.ok).toBe(false);
  });
});
