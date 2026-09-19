/**
 * Flip-flops, counters and shift registers - clocked with real edges from a
 * writer channel, exactly as a student would with a debounced push button.
 */
import { describe, expect, it } from 'vitest';
import { Bench } from './helpers';

describe('7474 D flip-flop', () => {
  const build = () => {
    const b = new Bench();
    const ic = b.add('ic:7474');
    b.power(ic);
    b.high(ic, 1).high(ic, 4); // CLR and PRE inactive
    b.drive(ic, 2, 0); // D
    b.drive(ic, 3, 1); // CLK
    return { b, ic };
  };

  it('loads D on the rising clock edge and holds between edges', () => {
    const { b, ic } = build();
    b.set(1, 0).set(0, 1).run(3);
    expect(b.read(ic, 5), 'Q before the first edge').toBe(0);

    b.pulse(1);
    expect(b.read(ic, 5)).toBe(1);
    expect(b.read(ic, 6)).toBe(0);

    b.set(0, 0).run(3); // change D with the clock LOW
    expect(b.read(ic, 5), 'Q must not follow D between edges').toBe(1);

    b.pulse(1);
    expect(b.read(ic, 5)).toBe(0);
    expect(b.read(ic, 6)).toBe(1);
  });

  it('clears asynchronously, without a clock edge', () => {
    const { b, ic } = build();
    b.set(0, 1).pulse(1);
    expect(b.read(ic, 5)).toBe(1);

    const clr = b.add('writer');
    void clr;
    b.circuit.wires = b.circuit.wires.filter((w) => !(w.a.c === ic && w.a.p === 1) && !(w.b.c === ic && w.b.p === 1));
    b.drive(ic, 1, 2); // CLR from channel 2
    b.set(2, 0).run(3);
    expect(b.read(ic, 5), 'CLR LOW must clear Q immediately').toBe(0);
    b.set(2, 1).run(3);
    expect(b.read(ic, 5)).toBe(0);
  });

  it('becomes a T flip-flop when Q-bar is fed back to D', () => {
    const b = new Bench();
    const ic = b.add('ic:7474');
    b.power(ic);
    b.high(ic, 1).high(ic, 4);
    b.wire(ic, 6, ic, 2); // Q' -> D
    b.drive(ic, 3, 0); // CLK

    b.set(0, 0).run(3);
    const seen: unknown[] = [];
    for (let i = 0; i < 4; i++) {
      b.pulse(0);
      seen.push(b.read(ic, 5));
    }
    expect(seen).toEqual([1, 0, 1, 0]);
  });
});

describe('7476 JK flip-flop', () => {
  const build = () => {
    const b = new Bench();
    const ic = b.add('ic:7476');
    b.power(ic);
    b.high(ic, 2).high(ic, 3); // PRE, CLR inactive
    b.drive(ic, 4, 0); // J
    b.drive(ic, 16, 1); // K
    b.drive(ic, 1, 2); // CLK
    return { b, ic };
  };

  it('holds, sets, resets and toggles', () => {
    const { b, ic } = build();
    const clock = () => {
      b.set(2, 1).run(3);
      b.set(2, 0).run(3); // falling edge
    };

    b.set(0, 1).set(1, 0); // J=1 K=0 -> set
    clock();
    expect(b.read(ic, 15)).toBe(1);
    expect(b.read(ic, 14)).toBe(0);

    b.set(0, 0).set(1, 0); // hold
    clock();
    expect(b.read(ic, 15)).toBe(1);

    b.set(0, 0).set(1, 1); // reset
    clock();
    expect(b.read(ic, 15)).toBe(0);

    b.set(0, 1).set(1, 1); // toggle
    clock();
    expect(b.read(ic, 15)).toBe(1);
    clock();
    expect(b.read(ic, 15)).toBe(0);
  });

  it('does not trigger on the rising edge', () => {
    const { b, ic } = build();
    b.set(0, 1).set(1, 1).set(2, 0).run(3);
    const before = b.read(ic, 15);
    b.set(2, 1).run(3); // rising edge only
    expect(b.read(ic, 15)).toBe(before);
  });
});

describe('7493 binary ripple counter', () => {
  it('counts 0 to 15 with QA wired into CKB', () => {
    const b = new Bench();
    const ic = b.add('ic:7493');
    b.power(ic);
    b.low(ic, 2).low(ic, 3); // resets held off
    b.wire(ic, 12, ic, 1); // QA -> CKB
    b.drive(ic, 14, 0); // CKA

    b.set(0, 0).run(3);
    const value = () =>
      Number(b.read(ic, 12)) + Number(b.read(ic, 9)) * 2 + Number(b.read(ic, 8)) * 4 + Number(b.read(ic, 11)) * 8;

    expect(value()).toBe(0);
    for (let n = 1; n <= 16; n++) {
      b.pulse(0, 4);
      expect(value(), `after ${n} clock pulses`).toBe(n % 16);
    }
  });

  it('resets when both R0 pins go HIGH', () => {
    const b = new Bench();
    const ic = b.add('ic:7493');
    b.power(ic);
    b.wire(ic, 12, ic, 1);
    b.drive(ic, 14, 0);
    b.drive(ic, 2, 1).drive(ic, 3, 2);

    b.set(1, 0).set(2, 0).run(2);
    b.pulse(0, 4);
    b.pulse(0, 4);
    b.pulse(0, 4);
    expect(b.read(ic, 9)).toBe(1); // count = 3

    b.set(1, 1).set(2, 1).run(3);
    expect(b.reads(ic, [12, 9, 8, 11])).toEqual([0, 0, 0, 0]);
  });
});

describe('7490 decade counter', () => {
  it('counts 0 to 9 then rolls over', () => {
    const b = new Bench();
    const ic = b.add('ic:7490');
    b.power(ic);
    b.low(ic, 2).low(ic, 3).low(ic, 6).low(ic, 7); // all resets off
    b.wire(ic, 12, ic, 1); // QA -> CKB
    b.drive(ic, 14, 0);

    const value = () =>
      Number(b.read(ic, 12)) + Number(b.read(ic, 9)) * 2 + Number(b.read(ic, 8)) * 4 + Number(b.read(ic, 11)) * 8;

    b.set(0, 0).run(3);
    expect(value()).toBe(0);
    for (let n = 1; n <= 12; n++) {
      b.pulse(0, 4);
      expect(value(), `after ${n} clock pulses`).toBe(n % 10);
    }
  });

  it('jumps to 9 when both R9 pins go HIGH', () => {
    const b = new Bench();
    const ic = b.add('ic:7490');
    b.power(ic);
    b.low(ic, 2).low(ic, 3);
    b.wire(ic, 12, ic, 1);
    b.drive(ic, 14, 0);
    b.drive(ic, 6, 1).drive(ic, 7, 2);

    b.set(1, 1).set(2, 1).run(3);
    expect(b.reads(ic, [12, 9, 8, 11])).toEqual([1, 0, 0, 1]);
  });
});

describe('74161 synchronous counter', () => {
  const build = () => {
    const b = new Bench();
    const ic = b.add('ic:74161');
    b.power(ic);
    b.high(ic, 1); // CLR inactive
    b.high(ic, 9); // LOAD inactive
    b.high(ic, 7).high(ic, 10); // ENP, ENT
    b.drive(ic, 2, 0); // CLK
    return { b, ic };
  };
  const value = (b: Bench, ic: string) =>
    Number(b.read(ic, 14)) + Number(b.read(ic, 13)) * 2 + Number(b.read(ic, 12)) * 4 + Number(b.read(ic, 11)) * 8;

  it('counts up on the rising edge and raises RCO at 15', () => {
    const { b, ic } = build();
    b.set(0, 0).run(3);
    expect(value(b, ic)).toBe(0);
    for (let n = 1; n <= 15; n++) {
      b.pulse(0);
      expect(value(b, ic), `pulse ${n}`).toBe(n);
    }
    expect(b.read(ic, 15), 'RCO at count 15').toBe(1);
    b.pulse(0);
    expect(value(b, ic)).toBe(0);
    expect(b.read(ic, 15)).toBe(0);
  });

  it('loads the parallel inputs synchronously', () => {
    const b = new Bench();
    const ic = b.add('ic:74161');
    b.power(ic);
    b.high(ic, 1).high(ic, 7).high(ic, 10);
    b.drive(ic, 2, 0); // CLK
    b.drive(ic, 9, 1); // LOAD
    b.high(ic, 3).low(ic, 4).high(ic, 5).low(ic, 6); // load value 0101 = 5

    b.set(1, 1).set(0, 0).run(3);
    b.pulse(0);
    expect(value(b, ic), 'counting with LOAD inactive').toBe(1);

    b.set(1, 0).run(2); // LOAD asserted
    expect(value(b, ic), 'load is synchronous: nothing yet').toBe(1);
    b.pulse(0);
    expect(value(b, ic)).toBe(5);
  });

  it('clears asynchronously', () => {
    const { b, ic } = build();
    b.pulse(0);
    b.pulse(0);
    expect(value(b, ic)).toBe(2);

    b.circuit.wires = b.circuit.wires.filter((w) => !(w.a.c === ic && w.a.p === 1) && !(w.b.c === ic && w.b.p === 1));
    b.drive(ic, 1, 3);
    b.set(3, 0).run(3);
    expect(value(b, ic)).toBe(0);
  });
});

describe('74163 synchronous counter', () => {
  it('clears only on a clock edge', () => {
    const b = new Bench();
    const ic = b.add('ic:74163');
    b.power(ic);
    b.high(ic, 9).high(ic, 7).high(ic, 10);
    b.drive(ic, 2, 0); // CLK
    b.drive(ic, 1, 1); // CLR

    b.set(1, 1).set(0, 0).run(3);
    b.pulse(0);
    b.pulse(0);
    const value = () =>
      Number(b.read(ic, 14)) + Number(b.read(ic, 13)) * 2 + Number(b.read(ic, 12)) * 4 + Number(b.read(ic, 11)) * 8;
    expect(value()).toBe(2);

    b.set(1, 0).run(3);
    expect(value(), 'synchronous clear waits for the clock').toBe(2);
    b.pulse(0);
    expect(value()).toBe(0);
  });
});

describe('74164 shift register', () => {
  it('shifts serial data along and clears asynchronously', () => {
    const b = new Bench();
    const ic = b.add('ic:74164');
    b.power(ic);
    b.high(ic, 9); // CLR inactive
    b.high(ic, 2); // B tied HIGH, data on A
    b.drive(ic, 1, 0); // A
    b.drive(ic, 8, 1); // CLK

    const Q = [3, 4, 5, 6, 10, 11, 12, 13];
    b.set(1, 0).set(0, 1).run(3);
    b.pulse(1);
    expect(b.reads(ic, Q)).toEqual([1, 0, 0, 0, 0, 0, 0, 0]);

    b.set(0, 0).run(2);
    b.pulse(1);
    expect(b.reads(ic, Q)).toEqual([0, 1, 0, 0, 0, 0, 0, 0]);

    b.set(0, 1).run(2);
    b.pulse(1);
    b.pulse(1);
    expect(b.reads(ic, Q)).toEqual([1, 1, 0, 1, 0, 0, 0, 0]);
  });
});

describe('74165 parallel-in serial-out register', () => {
  it('loads the parallel word and clocks it out on QH', () => {
    const b = new Bench();
    const ic = b.add('ic:74165');
    b.power(ic);
    b.low(ic, 15); // clock inhibit off
    b.low(ic, 10); // serial input 0
    b.drive(ic, 1, 0); // SH/LD
    b.drive(ic, 2, 1); // CLK

    // Parallel word A..H = 1 0 1 1 0 0 0 1
    const PAR = [11, 12, 13, 14, 3, 4, 5, 6];
    [1, 0, 1, 1, 0, 0, 0, 1].forEach((v, i) => (v ? b.high(ic, PAR[i]) : b.low(ic, PAR[i])));

    b.set(1, 0).set(0, 0).run(3); // SH/LD LOW = load
    expect(b.read(ic, 9), 'QH is the H bit right after loading').toBe(1);

    b.set(0, 1).run(2); // back to shift mode
    const out: unknown[] = [];
    for (let i = 0; i < 7; i++) {
      b.pulse(1);
      out.push(b.read(ic, 9));
    }
    // Shifting towards QH brings out G, F, E, D, C, B, A.
    expect(out).toEqual([0, 0, 0, 1, 1, 0, 1]);
  });
});

describe('74175 quad D register', () => {
  it('stores four bits on one clock edge', () => {
    const b = new Bench();
    const ic = b.add('ic:74175');
    b.power(ic);
    b.high(ic, 1); // CLR inactive
    b.drive(ic, 9, 0); // CLK
    [4, 5, 12, 13].forEach((p, i) => b.drive(ic, p, i + 1)); // D1..D4

    b.setBits([0, 1, 0, 1, 1]).run(3); // clk low, D = 1,0,1,1
    b.pulse(0);
    expect(b.reads(ic, [2, 7, 10, 15])).toEqual([1, 0, 1, 1]);
    expect(b.reads(ic, [3, 6, 11, 14])).toEqual([0, 1, 0, 0]);
  });
});

describe('74173 register with 3-state outputs', () => {
  it('releases the bus when the output controls are HIGH', () => {
    const b = new Bench();
    const ic = b.add('ic:74173');
    b.power(ic);
    b.low(ic, 9).low(ic, 10); // data enables active
    b.low(ic, 15); // CLR inactive (active HIGH part)
    b.drive(ic, 7, 0); // CLK
    b.drive(ic, 1, 1); // M
    b.low(ic, 2); // N
    [14, 13, 12, 11].forEach((p, i) => (i % 2 === 0 ? b.high(ic, p) : b.low(ic, p)));

    b.set(1, 0).set(0, 0).run(3); // outputs enabled
    b.pulse(0);
    expect(b.reads(ic, [3, 4, 5, 6])).toEqual([1, 0, 1, 0]);

    b.set(1, 1).run(3); // M HIGH: outputs float
    expect(b.reads(ic, [3, 4, 5, 6])).toEqual(['X', 'X', 'X', 'X']);
  });
});
