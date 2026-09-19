/**
 * Decoders, encoders, multiplexers, the 4-bit adder and the 7447, each driven
 * through its real enable and select pins.
 */
import { describe, expect, it } from 'vitest';
import { Bench } from './helpers';

describe('74138 3-to-8 decoder', () => {
  const build = () => {
    const b = new Bench();
    const ic = b.add('ic:74138');
    b.power(ic);
    b.high(ic, 6); // G1
    b.low(ic, 4).low(ic, 5); // G2A, G2B
    b.drive(ic, 1, 0).drive(ic, 2, 1).drive(ic, 3, 2); // A, B, C
    return { b, ic };
  };
  const Y = [15, 14, 13, 12, 11, 10, 9, 7];

  it('pulls exactly one output LOW for each address', () => {
    const { b, ic } = build();
    for (let addr = 0; addr < 8; addr++) {
      const bits = [addr & 1, (addr >> 1) & 1, (addr >> 2) & 1] as (0 | 1)[];
      const outs = b.row(bits, ic, Y);
      expect(outs.filter((v) => v === 0).length, `address ${addr}`).toBe(1);
      expect(outs[addr], `Y${addr} for address ${addr}`).toBe(0);
    }
  });

  it('holds every output HIGH when it is disabled', () => {
    const b = new Bench();
    const ic = b.add('ic:74138');
    b.power(ic);
    b.low(ic, 6); // G1 LOW = disabled
    b.low(ic, 4).low(ic, 5);
    b.drive(ic, 1, 0).drive(ic, 2, 1).drive(ic, 3, 2);
    expect(b.row([1, 0, 1], ic, Y)).toEqual([1, 1, 1, 1, 1, 1, 1, 1]);
  });
});

describe('74139 dual 2-to-4 decoder', () => {
  it('decodes both halves independently', () => {
    const b = new Bench();
    const ic = b.add('ic:74139');
    b.power(ic);
    b.low(ic, 1).low(ic, 15); // both halves enabled
    b.drive(ic, 2, 0).drive(ic, 3, 1); // half 1: A, B
    b.drive(ic, 14, 2).drive(ic, 13, 3); // half 2: A, B

    b.setBits([1, 0, 0, 1]).run(3); // half 1 -> 1, half 2 -> 2
    expect(b.reads(ic, [4, 5, 6, 7])).toEqual([1, 0, 1, 1]);
    expect(b.reads(ic, [12, 11, 10, 9])).toEqual([1, 1, 0, 1]);
  });
});

describe('74148 priority encoder', () => {
  it('encodes the highest active input and ignores the lower ones', () => {
    const b = new Bench();
    const ic = b.add('ic:74148');
    b.power(ic);
    b.low(ic, 5); // EI active
    const I = [10, 11, 12, 13, 1, 2, 3, 4];
    I.forEach((pin, i) => b.drive(ic, pin, i));

    // Inputs are active LOW, so 1 means "not pressed".
    const all = [1, 1, 1, 1, 1, 1, 1, 1] as (0 | 1)[];
    for (let n = 0; n < 8; n++) {
      const bits = [...all];
      bits[n] = 0;
      const [a0, a1, a2] = b.row(bits, ic, [9, 7, 6]);
      const code = (Number(a2) << 2) | (Number(a1) << 1) | Number(a0);
      expect(code ^ 0b111, `input I${n}`).toBe(n);
      expect(b.read(ic, 14), 'GS while an input is active').toBe(0);
    }

    // I3 and I5 together: 5 wins.
    const bits = [...all];
    bits[3] = 0;
    bits[5] = 0;
    const [a0, a1, a2] = b.row(bits, ic, [9, 7, 6]);
    expect(((Number(a2) << 2) | (Number(a1) << 1) | Number(a0)) ^ 0b111).toBe(5);
  });

  it('reports no active input on EO', () => {
    const b = new Bench();
    const ic = b.add('ic:74148');
    b.power(ic);
    b.low(ic, 5);
    [10, 11, 12, 13, 1, 2, 3, 4].forEach((pin) => b.high(ic, pin));
    b.run(3);
    expect(b.read(ic, 15)).toBe(0); // EO LOW: enabled, nothing pressed
    expect(b.read(ic, 14)).toBe(1); // GS HIGH
  });
});

describe('74151 8-to-1 multiplexer', () => {
  it('routes the addressed data input to Y and its complement to W', () => {
    const b = new Bench();
    const ic = b.add('ic:74151');
    b.power(ic);
    b.low(ic, 7); // strobe enabled
    const D = [4, 3, 2, 1, 15, 14, 13, 12];
    // Data pattern 1,0,1,1,0,0,1,0 wired as hard levels.
    const pattern = [1, 0, 1, 1, 0, 0, 1, 0];
    pattern.forEach((v, i) => (v ? b.high(ic, D[i]) : b.low(ic, D[i])));
    b.drive(ic, 11, 0).drive(ic, 10, 1).drive(ic, 9, 2); // A, B, C

    for (let addr = 0; addr < 8; addr++) {
      const bits = [addr & 1, (addr >> 1) & 1, (addr >> 2) & 1] as (0 | 1)[];
      const [y, w] = b.row(bits, ic, [5, 6]);
      expect(y, `Y for address ${addr}`).toBe(pattern[addr]);
      expect(w, `W for address ${addr}`).toBe(pattern[addr] ? 0 : 1);
    }
  });

  it('forces Y LOW when the strobe is HIGH', () => {
    const b = new Bench();
    const ic = b.add('ic:74151');
    b.power(ic);
    b.high(ic, 7);
    [4, 3, 2, 1, 15, 14, 13, 12].forEach((p) => b.high(ic, p));
    b.low(ic, 11).low(ic, 10).low(ic, 9);
    b.run(3);
    expect(b.read(ic, 5)).toBe(0);
    expect(b.read(ic, 6)).toBe(1);
  });
});

describe('74153 dual 4-to-1 multiplexer', () => {
  it('selects the same numbered input in both halves', () => {
    const b = new Bench();
    const ic = b.add('ic:74153');
    b.power(ic);
    b.low(ic, 1).low(ic, 15);
    // Half 1: C0..C3 = 1,0,0,1   Half 2: C0..C3 = 0,1,0,1
    [6, 5, 4, 3].forEach((p, i) => ([1, 0, 0, 1][i] ? b.high(ic, p) : b.low(ic, p)));
    [10, 11, 12, 13].forEach((p, i) => ([0, 1, 0, 1][i] ? b.high(ic, p) : b.low(ic, p)));
    b.drive(ic, 14, 0).drive(ic, 2, 1); // A (LSB), B (MSB)

    const expect1 = [1, 0, 0, 1];
    const expect2 = [0, 1, 0, 1];
    for (let sel = 0; sel < 4; sel++) {
      const bits = [sel & 1, (sel >> 1) & 1] as (0 | 1)[];
      const [y1, y2] = b.row(bits, ic, [7, 9]);
      expect(y1, `half 1, select ${sel}`).toBe(expect1[sel]);
      expect(y2, `half 2, select ${sel}`).toBe(expect2[sel]);
    }
  });
});

describe('74157 quad 2-to-1 multiplexer', () => {
  it('switches all four channels together', () => {
    const b = new Bench();
    const ic = b.add('ic:74157');
    b.power(ic);
    b.low(ic, 15); // strobe enabled
    b.drive(ic, 1, 0); // select
    // A word = 1010, B word = 0101
    [2, 5, 14, 11].forEach((p, i) => ([1, 0, 1, 0][i] ? b.high(ic, p) : b.low(ic, p)));
    [3, 6, 13, 10].forEach((p, i) => ([0, 1, 0, 1][i] ? b.high(ic, p) : b.low(ic, p)));

    expect(b.row([0], ic, [4, 7, 12, 9])).toEqual([1, 0, 1, 0]);
    expect(b.row([1], ic, [4, 7, 12, 9])).toEqual([0, 1, 0, 1]);
  });
});

describe('7483 4-bit adder', () => {
  it('adds every pair of 4-bit numbers', () => {
    const b = new Bench();
    const ic = b.add('ic:7483');
    b.power(ic);
    b.low(ic, 13); // carry in = 0
    const A = [10, 8, 3, 1];
    const B = [11, 7, 4, 16];
    A.forEach((p, i) => b.drive(ic, p, i));
    B.forEach((p, i) => b.drive(ic, p, i + 4));

    for (const [x, y] of [
      [0, 0],
      [1, 1],
      [3, 5],
      [9, 6],
      [15, 1],
      [15, 15],
      [7, 8],
    ]) {
      const bits = [
        ...[0, 1, 2, 3].map((i) => ((x >> i) & 1) as 0 | 1),
        ...[0, 1, 2, 3].map((i) => ((y >> i) & 1) as 0 | 1),
      ];
      const outs = b.row(bits, ic, [9, 6, 2, 15, 14]);
      const sum =
        Number(outs[0]) + Number(outs[1]) * 2 + Number(outs[2]) * 4 + Number(outs[3]) * 8 + Number(outs[4]) * 16;
      expect(sum, `${x} + ${y}`).toBe(x + y);
    }
  });

  it('honours the carry in', () => {
    const b = new Bench();
    const ic = b.add('ic:7483');
    b.power(ic);
    b.high(ic, 13);
    [10, 8, 3, 1].forEach((p) => b.low(ic, p));
    [11, 7, 4, 16].forEach((p) => b.low(ic, p));
    b.run(4);
    expect(b.reads(ic, [9, 6, 2, 15, 14])).toEqual([1, 0, 0, 0, 0]);
  });
});

describe('7447 seven-segment decoder', () => {
  const SEG = [13, 12, 11, 10, 9, 15, 14]; // a b c d e f g, active LOW

  it('drives the right segments for each digit', () => {
    const b = new Bench();
    const ic = b.add('ic:7447');
    b.power(ic);
    b.high(ic, 3).high(ic, 4).high(ic, 5); // LT, BI, RBI inactive
    [7, 1, 2, 6].forEach((p, i) => b.drive(ic, p, i)); // A B C D

    const onFor = (n: number) => {
      const bits = [0, 1, 2, 3].map((i) => ((n >> i) & 1) as 0 | 1);
      return b.row(bits, ic, SEG).map((v) => (v === 0 ? 1 : 0));
    };

    expect(onFor(0), 'digit 0').toEqual([1, 1, 1, 1, 1, 1, 0]);
    expect(onFor(1), 'digit 1').toEqual([0, 1, 1, 0, 0, 0, 0]);
    expect(onFor(7), 'digit 7').toEqual([1, 1, 1, 0, 0, 0, 0]);
    expect(onFor(8), 'digit 8').toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('lamp test lights every segment and blanking clears them', () => {
    const b = new Bench();
    const ic = b.add('ic:7447');
    b.power(ic);
    b.high(ic, 5);
    b.drive(ic, 3, 0); // LT
    b.drive(ic, 4, 1); // BI
    [7, 1, 2, 6].forEach((p) => b.low(ic, p));

    b.setBits([0, 1]).run(3); // LT low, BI high
    expect(b.reads(ic, SEG)).toEqual([0, 0, 0, 0, 0, 0, 0]);

    b.setBits([1, 0]).run(3); // BI low
    expect(b.reads(ic, SEG)).toEqual([1, 1, 1, 1, 1, 1, 1]);
  });

  it('drives a common-anode display through the segment pins', () => {
    const b = new Bench();
    const ic = b.add('ic:7447');
    const ds = b.add('seg7');
    b.power(ic);
    b.high(ic, 3).high(ic, 4).high(ic, 5);
    [7, 1, 2, 6].forEach((p, i) => b.drive(ic, p, i));
    SEG.forEach((p, i) => b.wire(ic, p, ds, i + 1));
    b.wire(ds, 9, b.vcc, 1); // common anode to +5 V

    b.setBits([1, 0, 0, 0]).run(4); // digit 1
    expect(b.engine.stateOf(ds).segs.slice(0, 7)).toEqual([
      false, true, true, false, false, false, false,
    ]);
  });
});
