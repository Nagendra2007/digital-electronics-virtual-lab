/**
 * Engine behaviour: propagation, power, floating inputs, shorts, latches,
 * oscillation and the breadboard's electrical strips.
 */
import { describe, expect, it } from 'vitest';
import { Bench } from './helpers';
import { validate } from '../src/sim/validate';
import { BB, BB_ROWS, holeX } from '../src/sim/breadboard';
import { PIN_PITCH } from '../src/sim/geometry';

describe('wire propagation', () => {
  it('carries a level through two packages', () => {
    const b = new Bench();
    const and1 = b.add('ic:7408');
    const inv = b.add('ic:7404');
    b.power(and1).power(inv);
    b.drive(and1, 1, 0).drive(and1, 2, 1);
    b.wire(and1, 3, inv, 1); // AND output into the inverter

    expect(b.row([1, 1], inv, [2])).toEqual([0]);
    expect(b.row([1, 0], inv, [2])).toEqual([1]);
    expect(b.row([0, 0], inv, [2])).toEqual([1]);
  });

  it('one output can feed several inputs', () => {
    const b = new Bench();
    const ic = b.add('ic:7408');
    b.power(ic);
    b.drive(ic, 1, 0).drive(ic, 2, 1);
    b.wire(ic, 3, ic, 4).wire(ic, 3, ic, 5); // fan out to the second gate

    b.set(0, 1).set(1, 1).run(3);
    expect(b.read(ic, 3)).toBe(1);
    expect(b.read(ic, 6)).toBe(1);
  });
});

describe('floating inputs', () => {
  it('leaves the output undefined when an input is not wired', () => {
    const b = new Bench();
    const ic = b.add('ic:7408');
    b.power(ic);
    b.drive(ic, 1, 0);
    b.set(0, 1).run(2);

    expect(b.read(ic, 2)).toBe('X');
    expect(b.read(ic, 3)).toBe('X');
  });

  it('still resolves when the floating input cannot change the answer', () => {
    // A 0 on one input of an AND gate forces the output LOW whatever the other
    // input does - the same reason a real gate would give you a valid 0 here.
    const b = new Bench();
    const ic = b.add('ic:7408');
    b.power(ic);
    b.drive(ic, 1, 0);
    b.set(0, 0).run(2);
    expect(b.read(ic, 3)).toBe(0);
  });

  it('reads a floating input as 0 in simplified mode', () => {
    const b = new Bench('pulldown');
    const ic = b.add('ic:7432');
    b.power(ic);
    b.drive(ic, 1, 0);
    b.set(0, 1).run(2);
    expect(b.read(ic, 3)).toBe(1);
    b.set(0, 0).run(2);
    expect(b.read(ic, 3)).toBe(0);
  });

  it('a pull-up resistor gives a floating input a defined level', () => {
    const b = new Bench();
    const ic = b.add('ic:7408');
    const pu = b.add('pullup');
    b.power(ic);
    b.drive(ic, 1, 0);
    b.wire(ic, 2, pu, 1);
    b.set(0, 1).run(3);
    expect(b.read(ic, 2)).toBe(1);
    expect(b.read(ic, 3)).toBe(1);
  });

  it('a real output beats a pull-up on the same node', () => {
    const b = new Bench();
    const ic = b.add('ic:7408');
    const pu = b.add('pullup');
    b.power(ic);
    b.drive(ic, 1, 0).drive(ic, 2, 1);
    b.wire(ic, 3, pu, 1);
    b.set(0, 0).set(1, 1).run(3);
    expect(b.read(ic, 3)).toBe(0);
  });
});

describe('power', () => {
  it('produces nothing until VCC and GND are wired', () => {
    const b = new Bench();
    const ic = b.add('ic:7408');
    b.drive(ic, 1, 0).drive(ic, 2, 1);
    b.set(0, 1).set(1, 1).run(3);
    expect(b.read(ic, 3)).toBe('X');

    const issues = validate(b.engine, b.circuit);
    expect(issues.some((i) => i.id.startsWith('vcc-missing'))).toBe(true);
    expect(issues.some((i) => i.id.startsWith('gnd-missing'))).toBe(true);

    b.power(ic).run(3);
    expect(b.read(ic, 3)).toBe(1);
    const after = validate(b.engine, b.circuit);
    expect(after.some((i) => i.id.startsWith('vcc-ok'))).toBe(true);
    expect(after.some((i) => i.id.startsWith('gnd-ok'))).toBe(true);
  });

  it('reports VCC and GND swapped', () => {
    const b = new Bench();
    const ic = b.add('ic:7408');
    b.wire(ic, 14, b.gnd, 1).wire(ic, 7, b.vcc, 1);
    b.run(2);
    const issues = validate(b.engine, b.circuit);
    expect(issues.some((i) => i.id.startsWith('vcc-wrong'))).toBe(true);
    expect(issues.some((i) => i.id.startsWith('gnd-wrong'))).toBe(true);
  });
});

describe('invalid connections', () => {
  it('flags VCC wired straight to GND', () => {
    const b = new Bench();
    b.wire(b.vcc, 1, b.gnd, 1);
    b.run(1);
    const issues = validate(b.engine, b.circuit);
    const short = issues.find((i) => i.id.startsWith('short:'));
    expect(short?.level).toBe('error');
    expect(short?.message).toMatch(/short circuit/i);
  });

  it('flags two outputs tied together', () => {
    const b = new Bench();
    const ic = b.add('ic:7408');
    b.power(ic);
    b.wire(ic, 3, ic, 6); // two gate outputs on one node
    b.run(2);
    const issues = validate(b.engine, b.circuit);
    expect(issues.some((i) => i.id.startsWith('clash:'))).toBe(true);
  });

  it('flags an output tied to a supply rail', () => {
    const b = new Bench();
    const ic = b.add('ic:7432');
    b.power(ic);
    b.wire(ic, 3, b.vcc, 1);
    b.run(2);
    const issues = validate(b.engine, b.circuit);
    expect(issues.some((i) => i.id.startsWith('out-to-rail:'))).toBe(true);
  });

  it('makes a contested node undefined', () => {
    const b = new Bench();
    const ic = b.add('ic:7408');
    b.power(ic);
    b.drive(ic, 1, 0).drive(ic, 2, 1);
    b.wire(ic, 3, b.gnd, 1); // gate drives HIGH into a hard 0
    b.set(0, 1).set(1, 1).run(3);
    expect(b.read(ic, 3)).toBe('X');
  });
});

describe('latches and oscillation', () => {
  it('a pair of cross-coupled NAND gates latches', () => {
    const b = new Bench();
    const ic = b.add('ic:7400');
    b.power(ic);
    b.drive(ic, 1, 0); // S (active low)
    b.drive(ic, 4, 1); // R (active low)
    b.wire(ic, 3, ic, 5); // Q  -> gate 2 input
    b.wire(ic, 6, ic, 2); // Q' -> gate 1 input

    b.set(0, 0).set(1, 1).run(6); // set
    expect(b.read(ic, 3)).toBe(1);
    expect(b.read(ic, 6)).toBe(0);

    b.set(0, 1).run(6); // both inactive: the latch must remember
    expect(b.read(ic, 3)).toBe(1);
    expect(b.read(ic, 6)).toBe(0);

    b.set(1, 0).run(6); // reset
    expect(b.read(ic, 3)).toBe(0);
    expect(b.read(ic, 6)).toBe(1);

    b.set(1, 1).run(6); // remember the reset
    expect(b.read(ic, 3)).toBe(0);
  });

  it('detects a ring oscillator instead of hanging', () => {
    const b = new Bench();
    const ic = b.add('ic:7400');
    b.power(ic);
    b.drive(ic, 1, 0); // enable
    b.high(ic, 4).high(ic, 9);
    b.wire(ic, 3, ic, 5);
    b.wire(ic, 6, ic, 10);
    b.wire(ic, 8, ic, 2); // close the loop: three inversions

    b.set(0, 0).run(4); // held: the ring is broken by the enable
    expect(b.engine.last.oscillating).toBe(false);

    b.set(0, 1);
    b.engine.settle();
    expect(b.engine.last.oscillating).toBe(true);
    expect(b.engine.last.unstableNets.length).toBeGreaterThan(0);
  });
});

describe('breadboard', () => {
  it('connects the five holes of a terminal strip, and nothing else', () => {
    const b = new Bench();
    const board = b.add('breadboard');
    b.comp(board).x = 0;
    b.comp(board).y = 0;

    // Two holes in the same upper-bank column are one node...
    b.wire(board, BB.bankTop(0, 3), b.writer, 1);
    b.engine.rebuild(b.circuit);
    b.set(0, 1).run(2);
    expect(b.read(board, BB.bankTop(4, 3))).toBe(1);
    // ...while the neighbouring column is untouched.
    expect(b.read(board, BB.bankTop(0, 4))).toBe('X');
    // ...and so is the same column in the lower bank.
    expect(b.read(board, BB.bankBottom(0, 3))).toBe('X');
  });

  it('runs the whole length of a power rail', () => {
    const b = new Bench();
    const board = b.add('breadboard');
    b.comp(board).x = 0;
    b.comp(board).y = 0;
    b.wire(board, BB.railTopPlus(0), b.vcc, 1);
    b.engine.rebuild(b.circuit);
    b.run(2);
    expect(b.read(board, BB.railTopPlus(20))).toBe(1);
    expect(b.read(board, BB.railTopMinus(20))).toBe('X');
  });

  it('makes contact with an IC whose legs sit in the holes', () => {
    const b = new Bench();
    const board = b.add('breadboard');
    b.comp(board).x = 0;
    b.comp(board).y = 0;

    // A DIP laid across the centre channel: pins 1-7 in row E, 8-14 in row F.
    const ic = b.add('ic:7408', 90);
    b.comp(ic).x = holeX(7) - 145; // so pin 1 lands in column 8
    b.comp(ic).y = BB_ROWS.bankTop + 4 * PIN_PITCH; // row E
    b.engine.rebuild(b.circuit);

    // Pin 1 lands in column 8 of the upper bank, so any hole of that column
    // reaches it - that is how you wire a real breadboard.
    b.wire(board, BB.bankTop(0, 7), b.writer, 1);
    b.engine.rebuild(b.circuit);
    b.set(0, 1).run(2);
    expect(b.read(ic, 1)).toBe(1);

    // Pin 14 is VCC and sits in the lower bank, column 8.
    b.wire(board, BB.bankBottom(4, 7), b.vcc, 1);
    b.engine.rebuild(b.circuit);
    b.run(2);
    expect(b.read(ic, 14)).toBe(1);
  });
});

describe('passives', () => {
  it('a series resistor passes the level straight through', () => {
    const b = new Bench();
    const r = b.add('resistor');
    const led = b.add('led');
    b.wire(b.writer, 1, r, 1);
    b.wire(r, 2, led, 1);
    b.wire(led, 2, b.gnd, 1);
    b.set(0, 1).run(2);
    expect(b.read(led, 1)).toBe(1);
    expect(b.engine.stateOf(led).on).toBe(true);

    b.set(0, 0).run(2);
    expect(b.engine.stateOf(led).on).toBe(false);
  });

  it('an LED with a floating cathode does not light', () => {
    const b = new Bench();
    const led = b.add('led');
    b.wire(b.writer, 1, led, 1);
    b.set(0, 1).run(2);
    expect(b.engine.stateOf(led).on).toBe(false);
    const issues = validate(b.engine, b.circuit);
    expect(issues.some((i) => i.id.startsWith('led:'))).toBe(true);
  });
});

describe('switches and clock', () => {
  it('a toggle switch between VCC and GND makes a real logic level', () => {
    const b = new Bench();
    const sw = b.add('switch');
    b.wire(sw, 1, b.vcc, 1);
    b.wire(sw, 3, b.gnd, 1);
    b.run(2);
    expect(b.read(sw, 2)).toBe(0);

    b.comp(sw).props = { ...b.comp(sw).props, pos: 'a' };
    b.engine.rebuild(b.circuit);
    b.run(2);
    expect(b.read(sw, 2)).toBe(1);
  });

  it('the clock generator produces edges as time advances', () => {
    const b = new Bench();
    const clk = b.add('clock');
    b.comp(clk).props = { freq: 1, duty: 50, running: true, mode: 'auto', level: 0 };
    b.engine.rebuild(b.circuit);

    b.engine.time = 0;
    b.run(1);
    expect(b.read(clk, 1)).toBe(1); // first half of the period is HIGH
    b.tick(600);
    expect(b.read(clk, 1)).toBe(0);
    b.tick(600);
    expect(b.read(clk, 1)).toBe(1);
  });

  it('a manual clock only moves when it is told to', () => {
    const b = new Bench();
    const clk = b.add('clock');
    b.comp(clk).props = { mode: 'manual', level: 0, running: false, freq: 1, duty: 50 };
    b.engine.rebuild(b.circuit);
    b.tick(5000);
    expect(b.read(clk, 1)).toBe(0);
    b.comp(clk).props = { ...b.comp(clk).props, level: 1 };
    b.engine.rebuild(b.circuit);
    b.run(1);
    expect(b.read(clk, 1)).toBe(1);
  });
});
