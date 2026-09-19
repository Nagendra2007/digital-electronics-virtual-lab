/**
 * Flip-flops, counters and shift registers.
 *
 * Edge detection uses the engine's delta-step semantics: every component is
 * evaluated once per delta step, so comparing the clock level against the level
 * seen on the previous step is exactly an edge.
 *
 * Power-on state: these models come up with all outputs LOW. A real 74-series
 * device powers up in an unpredictable state, which is why every lab sheet tells
 * you to clear the device before you trust it - the CLR/reset pins here behave
 * like the real ones.
 */
import { and, bitOf, bitsToInt, not } from '../logic';
import type { ComponentModel, EvalCtx, NetValue, PinDef } from '../types';

const P = (
  n: number,
  name: string,
  kind: PinDef['kind'],
  fn: string,
  extra: Partial<PinDef> = {},
): PinDef => ({ n, name, kind, fn, ...extra });

const VCC = (n: number) => P(n, 'VCC', 'power', '+5 V supply');
const GND = (n: number) => P(n, 'GND', 'ground', '0 V (ground) return');
const NC = (n: number) => P(n, 'NC', 'nc', 'No internal connection');

/**
 * Remember the clock level and report whether the requested edge just happened.
 * Must be called on every evaluation so the stored level stays current.
 */
function edge(
  state: Record<string, any>,
  key: string,
  clk: NetValue,
  kind: 'rise' | 'fall',
): boolean {
  const prev = state[key] as NetValue | undefined;
  state[key] = clk;
  if (kind === 'rise') return prev === 0 && clk === 1;
  return prev === 1 && clk === 0;
}

/** Write an integer (or 'X') onto a list of output pins, LSB first. */
function writeCount(ctx: EvalCtx, pins: number[], n: number | 'X') {
  for (let i = 0; i < pins.length; i++) {
    ctx.write(pins[i], n === 'X' ? 'X' : bitOf(n, i));
  }
}

// ---------------------------------------------------------------------------
// 7474 - dual D-type flip-flop, positive edge triggered
// ---------------------------------------------------------------------------
const ic7474: ComponentModel = {
  type: 'ic:7474',
  label: '7474',
  name: 'Dual D-type flip-flop with preset and clear',
  category: 'flipflop',
  pkg: 'DIP14',
  vccPin: 14,
  gndPin: 7,
  needsPower: true,
  description:
    'Two independent D flip-flops. On each LOW-to-HIGH clock edge the level on D is transferred to Q. Preset and clear are asynchronous and override the clock.',
  notes: [
    'Triggered on the RISING edge of CLK.',
    'PRE and CLR are active LOW and asynchronous. Tie them HIGH (to VCC) when you are not using them, otherwise the flip-flop never leaves reset - and a floating pin gives an undefined output here.',
    'Holding PRE and CLR both LOW forces Q and Q̅ both HIGH, which is not a valid flip-flop state.',
    'Wire Q̅ back to D to make a T flip-flop that toggles on every clock.',
  ],
  keywords: ['d flip flop', 'dff', 'latch', 'register', 't flip flop'],
  pins: [
    P(1, '1CLR', 'input', 'Flip-flop 1 clear, active LOW, asynchronous', { activeLow: true, group: 'FF1' }),
    P(2, '1D', 'input', 'Flip-flop 1 data input', { group: 'FF1' }),
    P(3, '1CLK', 'clock', 'Flip-flop 1 clock, rising edge', { group: 'FF1' }),
    P(4, '1PRE', 'input', 'Flip-flop 1 preset, active LOW, asynchronous', { activeLow: true, group: 'FF1' }),
    P(5, '1Q', 'output', 'Flip-flop 1 output', { group: 'FF1' }),
    P(6, '1Q̅', 'output', 'Flip-flop 1 complement output', { group: 'FF1' }),
    GND(7),
    P(8, '2Q̅', 'output', 'Flip-flop 2 complement output', { group: 'FF2' }),
    P(9, '2Q', 'output', 'Flip-flop 2 output', { group: 'FF2' }),
    P(10, '2PRE', 'input', 'Flip-flop 2 preset, active LOW, asynchronous', { activeLow: true, group: 'FF2' }),
    P(11, '2CLK', 'clock', 'Flip-flop 2 clock, rising edge', { group: 'FF2' }),
    P(12, '2D', 'input', 'Flip-flop 2 data input', { group: 'FF2' }),
    P(13, '2CLR', 'input', 'Flip-flop 2 clear, active LOW, asynchronous', { activeLow: true, group: 'FF2' }),
    VCC(14),
  ],
  truthTable: {
    headers: ['PRE', 'CLR', 'CLK', 'D', 'Q', 'Q̅'],
    rows: [
      ['0', '1', 'X', 'X', '1', '0'],
      ['1', '0', 'X', 'X', '0', '1'],
      ['0', '0', 'X', 'X', '1', '1'],
      ['1', '1', '↑', '0', '0', '1'],
      ['1', '1', '↑', '1', '1', '0'],
      ['1', '1', '0 / 1', 'X', 'hold', 'hold'],
    ],
    note: 'PRE and CLR are active LOW and beat the clock.',
  },
  initState: () => ({ q1: 0 as NetValue, q2: 0 as NetValue }),
  evaluate(ctx) {
    const ff = (
      key: 'q1' | 'q2',
      ck: string,
      clrPin: number,
      prePin: number,
      clkPin: number,
      dPin: number,
      qPin: number,
      qbPin: number,
    ) => {
      const rise = edge(ctx.state, ck, ctx.read(clkPin), 'rise');
      const pre = ctx.read(prePin);
      const clr = ctx.read(clrPin);
      let q = ctx.state[key] as NetValue;
      let qb: NetValue;

      if (pre === 0 && clr === 0) {
        q = 1;
        qb = 1; // invalid state: both outputs HIGH
      } else if (pre === 0) {
        q = 1;
        qb = 0;
      } else if (clr === 0) {
        q = 0;
        qb = 1;
      } else if (pre === 1 && clr === 1) {
        if (rise) q = ctx.read(dPin);
        qb = not(q);
      } else {
        q = 'X'; // preset or clear at an unknown level
        qb = 'X';
      }
      ctx.state[key] = q;
      ctx.write(qPin, q);
      ctx.write(qbPin, qb);
    };
    ff('q1', 'c1', 1, 4, 3, 2, 5, 6);
    ff('q2', 'c2', 13, 10, 11, 12, 9, 8);
  },
};

// ---------------------------------------------------------------------------
// 7476 - dual JK flip-flop
// ---------------------------------------------------------------------------
const ic7476: ComponentModel = {
  type: 'ic:7476',
  label: '7476',
  name: 'Dual JK flip-flop with preset and clear',
  category: 'flipflop',
  pkg: 'DIP16',
  vccPin: 5,
  gndPin: 13,
  needsPower: true,
  description:
    'Two independent JK flip-flops - the most flexible of the flip-flops. J and K choose between hold, set, reset and toggle on every clock edge.',
  notes: [
    'Careful: power is NOT on the corner pins. VCC is pin 5 and GND is pin 13.',
    'This model triggers on the FALLING edge of CLK, like the 74LS76. (The original 7476 is a pulse-triggered master-slave device that samples J and K while the clock is HIGH and updates the output when it falls.)',
    'PRE and CLR are active LOW and asynchronous - tie them HIGH when unused.',
    'J = K = 1 toggles the output on every clock: that is the T flip-flop used to build counters.',
  ],
  keywords: ['jk flip flop', 'toggle', 'master slave', 't flip flop'],
  pins: [
    P(1, '1CLK', 'clock', 'Flip-flop 1 clock, falling edge', { group: 'FF1' }),
    P(2, '1PRE', 'input', 'Flip-flop 1 preset, active LOW', { activeLow: true, group: 'FF1' }),
    P(3, '1CLR', 'input', 'Flip-flop 1 clear, active LOW', { activeLow: true, group: 'FF1' }),
    P(4, '1J', 'input', 'Flip-flop 1 J input', { group: 'FF1' }),
    VCC(5),
    P(6, '2CLK', 'clock', 'Flip-flop 2 clock, falling edge', { group: 'FF2' }),
    P(7, '2PRE', 'input', 'Flip-flop 2 preset, active LOW', { activeLow: true, group: 'FF2' }),
    P(8, '2CLR', 'input', 'Flip-flop 2 clear, active LOW', { activeLow: true, group: 'FF2' }),
    P(9, '2J', 'input', 'Flip-flop 2 J input', { group: 'FF2' }),
    P(10, '2Q̅', 'output', 'Flip-flop 2 complement output', { group: 'FF2' }),
    P(11, '2Q', 'output', 'Flip-flop 2 output', { group: 'FF2' }),
    P(12, '2K', 'input', 'Flip-flop 2 K input', { group: 'FF2' }),
    GND(13),
    P(14, '1Q̅', 'output', 'Flip-flop 1 complement output', { group: 'FF1' }),
    P(15, '1Q', 'output', 'Flip-flop 1 output', { group: 'FF1' }),
    P(16, '1K', 'input', 'Flip-flop 1 K input', { group: 'FF1' }),
  ],
  truthTable: {
    headers: ['PRE', 'CLR', 'CLK', 'J', 'K', 'Q after clock'],
    rows: [
      ['0', '1', 'X', 'X', 'X', '1 (set)'],
      ['1', '0', 'X', 'X', 'X', '0 (clear)'],
      ['1', '1', '↓', '0', '0', 'Q (hold)'],
      ['1', '1', '↓', '0', '1', '0 (reset)'],
      ['1', '1', '↓', '1', '0', '1 (set)'],
      ['1', '1', '↓', '1', '1', 'Q̅ (toggle)'],
    ],
  },
  initState: () => ({ q1: 0 as NetValue, q2: 0 as NetValue }),
  evaluate(ctx) {
    const ff = (
      key: 'q1' | 'q2',
      ck: string,
      clkPin: number,
      prePin: number,
      clrPin: number,
      jPin: number,
      kPin: number,
      qPin: number,
      qbPin: number,
    ) => {
      const fall = edge(ctx.state, ck, ctx.read(clkPin), 'fall');
      const pre = ctx.read(prePin);
      const clr = ctx.read(clrPin);
      let q = ctx.state[key] as NetValue;
      let qb: NetValue;

      if (pre === 0 && clr === 0) {
        q = 1;
        qb = 1;
      } else if (pre === 0) {
        q = 1;
        qb = 0;
      } else if (clr === 0) {
        q = 0;
        qb = 1;
      } else if (pre === 1 && clr === 1) {
        if (fall) {
          const j = ctx.read(jPin);
          const k = ctx.read(kPin);
          if (j === 'X' || k === 'X') q = 'X';
          else if (j === 0 && k === 0) {
            /* hold */
          } else if (j === 0 && k === 1) q = 0;
          else if (j === 1 && k === 0) q = 1;
          else q = not(q);
        }
        qb = not(q);
      } else {
        q = 'X';
        qb = 'X';
      }
      ctx.state[key] = q;
      ctx.write(qPin, q);
      ctx.write(qbPin, qb);
    };
    ff('q1', 'c1', 1, 2, 3, 4, 16, 15, 14);
    ff('q2', 'c2', 6, 7, 8, 9, 12, 11, 10);
  },
};

// ---------------------------------------------------------------------------
// 74175 - quad D flip-flop with common clock and clear
// ---------------------------------------------------------------------------
const ic74175: ComponentModel = {
  type: 'ic:74175',
  label: '74175',
  name: 'Quad D-type flip-flop with clear',
  category: 'register',
  pkg: 'DIP16',
  vccPin: 16,
  gndPin: 8,
  needsPower: true,
  description:
    'Four D flip-flops sharing one clock and one clear - a 4-bit storage register. Both true and complement outputs are brought out.',
  notes: [
    'All four flip-flops are clocked together on the RISING edge of CLK (pin 9).',
    'CLR (pin 1) is active LOW and asynchronous; tie it HIGH for normal operation.',
  ],
  keywords: ['register', 'quad d', '4 bit storage'],
  pins: [
    P(1, 'CLR', 'input', 'Common clear, active LOW, asynchronous', { activeLow: true }),
    P(2, '1Q', 'output', 'Flip-flop 1 output', { group: 'FF1' }),
    P(3, '1Q̅', 'output', 'Flip-flop 1 complement output', { group: 'FF1' }),
    P(4, '1D', 'input', 'Flip-flop 1 data input', { group: 'FF1' }),
    P(5, '2D', 'input', 'Flip-flop 2 data input', { group: 'FF2' }),
    P(6, '2Q̅', 'output', 'Flip-flop 2 complement output', { group: 'FF2' }),
    P(7, '2Q', 'output', 'Flip-flop 2 output', { group: 'FF2' }),
    GND(8),
    P(9, 'CLK', 'clock', 'Common clock, rising edge'),
    P(10, '3Q', 'output', 'Flip-flop 3 output', { group: 'FF3' }),
    P(11, '3Q̅', 'output', 'Flip-flop 3 complement output', { group: 'FF3' }),
    P(12, '3D', 'input', 'Flip-flop 3 data input', { group: 'FF3' }),
    P(13, '4D', 'input', 'Flip-flop 4 data input', { group: 'FF4' }),
    P(14, '4Q̅', 'output', 'Flip-flop 4 complement output', { group: 'FF4' }),
    P(15, '4Q', 'output', 'Flip-flop 4 output', { group: 'FF4' }),
    VCC(16),
  ],
  truthTable: {
    headers: ['CLR', 'CLK', 'D', 'Q'],
    rows: [
      ['0', 'X', 'X', '0'],
      ['1', '↑', '0', '0'],
      ['1', '↑', '1', '1'],
      ['1', '0 / 1', 'X', 'hold'],
    ],
  },
  initState: () => ({ q: [0, 0, 0, 0] as NetValue[] }),
  evaluate(ctx) {
    const rise = edge(ctx.state, 'clk', ctx.read(9), 'rise');
    const clr = ctx.read(1);
    const D = [4, 5, 12, 13];
    const Q = [2, 7, 10, 15];
    const QB = [3, 6, 11, 14];
    const q = ctx.state.q as NetValue[];

    for (let i = 0; i < 4; i++) {
      if (clr === 0) q[i] = 0;
      else if (clr === 'X') q[i] = 'X';
      else if (rise) q[i] = ctx.read(D[i]);
      ctx.write(Q[i], q[i]);
      ctx.write(QB[i], not(q[i]));
    }
  },
};

// ---------------------------------------------------------------------------
// 74173 - 4-bit D register with 3-state outputs
// ---------------------------------------------------------------------------
const ic74173: ComponentModel = {
  type: 'ic:74173',
  label: '74173',
  name: '4-bit D-type register with 3-state outputs',
  category: 'register',
  pkg: 'DIP16',
  vccPin: 16,
  gndPin: 8,
  needsPower: true,
  description:
    'A 4-bit register with gated data inputs and 3-state outputs, designed to sit directly on a bus: when the output controls are HIGH the outputs go to high impedance and release the bus.',
  notes: [
    'Data is loaded on the RISING clock edge only while BOTH data-enable pins G1 and G2 are LOW. Otherwise the register holds.',
    'CLR (pin 15) is active HIGH. This model clocks the clear in on the rising edge (synchronous clear).',
    'Output controls M (pin 1) and N (pin 2) are active LOW: with either one HIGH the Q outputs float (high impedance).',
    'A floating bus line is shown as X here - that is genuinely what a released 3-state bus does without a pull-up.',
  ],
  keywords: ['register', 'tri-state', 'three state', 'bus', '4 bit'],
  pins: [
    P(1, 'M', 'input', 'Output control, active LOW', { activeLow: true }),
    P(2, 'N', 'input', 'Output control, active LOW', { activeLow: true }),
    P(3, '1Q', 'output', 'Register output bit 1 (3-state)'),
    P(4, '2Q', 'output', 'Register output bit 2 (3-state)'),
    P(5, '3Q', 'output', 'Register output bit 3 (3-state)'),
    P(6, '4Q', 'output', 'Register output bit 4 (3-state)'),
    P(7, 'CLK', 'clock', 'Clock, rising edge'),
    GND(8),
    P(9, 'G1', 'input', 'Data enable 1, active LOW', { activeLow: true }),
    P(10, 'G2', 'input', 'Data enable 2, active LOW', { activeLow: true }),
    P(11, '4D', 'input', 'Data input bit 4'),
    P(12, '3D', 'input', 'Data input bit 3'),
    P(13, '2D', 'input', 'Data input bit 2'),
    P(14, '1D', 'input', 'Data input bit 1'),
    P(15, 'CLR', 'input', 'Clear, active HIGH'),
    VCC(16),
  ],
  truthTable: {
    headers: ['CLR', 'G1', 'G2', 'CLK', 'Q'],
    rows: [
      ['1', 'X', 'X', '↑', '0'],
      ['0', '0', '0', '↑', 'D'],
      ['0', '1', 'X', '↑', 'hold'],
      ['0', 'X', '1', '↑', 'hold'],
    ],
    note: 'With M or N HIGH the outputs are in high impedance whatever the register holds.',
  },
  initState: () => ({ q: [0, 0, 0, 0] as NetValue[] }),
  evaluate(ctx) {
    const rise = edge(ctx.state, 'clk', ctx.read(7), 'rise');
    const q = ctx.state.q as NetValue[];
    const D = [14, 13, 12, 11];
    const Q = [3, 4, 5, 6];

    if (rise) {
      const clr = ctx.read(15);
      const enable = and(not(ctx.read(9)), not(ctx.read(10)));
      if (clr === 1) for (let i = 0; i < 4; i++) q[i] = 0;
      else if (clr === 'X') for (let i = 0; i < 4; i++) q[i] = 'X';
      else if (enable === 1) for (let i = 0; i < 4; i++) q[i] = ctx.read(D[i]);
      else if (enable === 'X') for (let i = 0; i < 4; i++) q[i] = 'X';
    }

    const oe = and(not(ctx.read(1)), not(ctx.read(2)));
    for (let i = 0; i < 4; i++) {
      ctx.write(Q[i], oe === 1 ? q[i] : oe === 0 ? 'Z' : 'X');
    }
  },
};

// ---------------------------------------------------------------------------
// 74161 / 74163 - 4-bit synchronous binary counters
// ---------------------------------------------------------------------------
function binaryCounter(id: '74161' | '74163'): ComponentModel {
  const syncClear = id === '74163';
  return {
    type: `ic:${id}`,
    label: id,
    name:
      id === '74161'
        ? '4-bit synchronous binary counter (asynchronous clear)'
        : '4-bit synchronous binary counter (synchronous clear)',
    category: 'counter',
    pkg: 'DIP16',
    vccPin: 16,
    gndPin: 8,
    needsPower: true,
    description:
      'A presettable 4-bit binary counter. All four flip-flops are clocked together, so the outputs change at the same instant - no ripple delay. The ripple carry output makes it easy to cascade counters.',
    notes: [
      'Counts on the RISING edge of CLK when both enables ENP and ENT are HIGH.',
      'LOAD is active LOW and synchronous: with LOAD LOW the next clock edge copies A, B, C, D into the counter.',
      syncClear
        ? 'CLR (pin 1) is active LOW and SYNCHRONOUS - it only takes effect on a clock edge. That is the only difference from the 74161.'
        : 'CLR (pin 1) is active LOW and ASYNCHRONOUS - it clears the counter the moment it goes LOW, without a clock edge.',
      'RCO goes HIGH when the count reaches 15 and ENT is HIGH.',
      'For normal free-running counting: CLR HIGH, LOAD HIGH, ENP and ENT HIGH.',
    ],
    keywords: ['counter', 'binary counter', 'synchronous', 'rco', 'presettable'],
    pins: [
      P(1, 'CLR', 'input', syncClear ? 'Clear, active LOW, synchronous' : 'Clear, active LOW, asynchronous', {
        activeLow: true,
      }),
      P(2, 'CLK', 'clock', 'Clock, rising edge'),
      P(3, 'A', 'input', 'Parallel data input A (LSB)'),
      P(4, 'B', 'input', 'Parallel data input B'),
      P(5, 'C', 'input', 'Parallel data input C'),
      P(6, 'D', 'input', 'Parallel data input D (MSB)'),
      P(7, 'ENP', 'input', 'Count enable P'),
      GND(8),
      P(9, 'LOAD', 'input', 'Parallel load, active LOW, synchronous', { activeLow: true }),
      P(10, 'ENT', 'input', 'Count enable T (also gates RCO)'),
      P(11, 'QD', 'output', 'Counter output D (MSB)'),
      P(12, 'QC', 'output', 'Counter output C'),
      P(13, 'QB', 'output', 'Counter output B'),
      P(14, 'QA', 'output', 'Counter output A (LSB)'),
      P(15, 'RCO', 'output', 'Ripple carry out: HIGH at count 15 when ENT is HIGH'),
      VCC(16),
    ],
    truthTable: {
      headers: ['CLR', 'LOAD', 'ENP', 'ENT', 'CLK', 'Action'],
      rows: [
        ['0', 'X', 'X', 'X', syncClear ? '↑' : 'X', 'Count = 0'],
        ['1', '0', 'X', 'X', '↑', 'Load D C B A'],
        ['1', '1', '1', '1', '↑', 'Count + 1'],
        ['1', '1', '0', 'X', '↑', 'Hold'],
        ['1', '1', 'X', '0', '↑', 'Hold'],
      ],
    },
    initState: () => ({ n: 0 as number | 'X' }),
    evaluate(ctx) {
      const rise = edge(ctx.state, 'clk', ctx.read(2), 'rise');
      const clr = ctx.read(1);
      const Q = [14, 13, 12, 11];
      let n = ctx.state.n as number | 'X';

      if (!syncClear && clr === 0) {
        n = 0;
      } else if (!syncClear && clr === 'X') {
        n = 'X';
      } else if (rise) {
        if (syncClear && clr === 0) {
          n = 0;
        } else if (syncClear && clr === 'X') {
          n = 'X';
        } else {
          const load = ctx.read(9);
          if (load === 0) {
            const v = bitsToInt([ctx.read(3), ctx.read(4), ctx.read(5), ctx.read(6)]);
            n = v < 0 ? 'X' : v;
          } else if (load === 'X') {
            n = 'X';
          } else {
            const en = and(ctx.read(7), ctx.read(10));
            if (en === 1) n = n === 'X' ? 'X' : (n + 1) % 16;
            else if (en === 'X') n = 'X';
          }
        }
      }

      ctx.state.n = n;
      writeCount(ctx, Q, n);
      const ent = ctx.read(10);
      ctx.write(15, n === 'X' || ent === 'X' ? 'X' : and(ent, n === 15 ? 1 : 0));
    },
  };
}

// ---------------------------------------------------------------------------
// 74164 - 8-bit serial-in parallel-out shift register
// ---------------------------------------------------------------------------
const ic74164: ComponentModel = {
  type: 'ic:74164',
  label: '74164',
  name: '8-bit serial-in, parallel-out shift register',
  category: 'register',
  pkg: 'DIP14',
  vccPin: 14,
  gndPin: 7,
  needsPower: true,
  description:
    'Shifts serial data in one bit per clock and presents all eight bits in parallel. The two serial inputs are ANDed together, so one of them doubles as a serial enable.',
  notes: [
    'Data shifts on the RISING edge of CLK. The bit entering QA is A AND B.',
    'CLR (pin 9) is active LOW and asynchronous: tie it HIGH to shift, pulse it LOW to empty the register.',
    'Tie B HIGH and feed your data into A for a plain serial input.',
  ],
  keywords: ['shift register', 'sipo', 'serial in parallel out'],
  pins: [
    P(1, 'A', 'input', 'Serial data input A'),
    P(2, 'B', 'input', 'Serial data input B (ANDed with A)'),
    P(3, 'QA', 'output', 'Output bit A (first stage)'),
    P(4, 'QB', 'output', 'Output bit B'),
    P(5, 'QC', 'output', 'Output bit C'),
    P(6, 'QD', 'output', 'Output bit D'),
    GND(7),
    P(8, 'CLK', 'clock', 'Clock, rising edge'),
    P(9, 'CLR', 'input', 'Clear, active LOW, asynchronous', { activeLow: true }),
    P(10, 'QE', 'output', 'Output bit E'),
    P(11, 'QF', 'output', 'Output bit F'),
    P(12, 'QG', 'output', 'Output bit G'),
    P(13, 'QH', 'output', 'Output bit H (last stage)'),
    VCC(14),
  ],
  truthTable: {
    headers: ['CLR', 'CLK', 'A', 'B', 'QA', 'QB ... QH'],
    rows: [
      ['0', 'X', 'X', 'X', '0', 'all 0'],
      ['1', '↑', '1', '1', '1', 'shifted right'],
      ['1', '↑', '0', 'X', '0', 'shifted right'],
      ['1', '↑', 'X', '0', '0', 'shifted right'],
    ],
  },
  initState: () => ({ q: [0, 0, 0, 0, 0, 0, 0, 0] as NetValue[] }),
  evaluate(ctx) {
    const rise = edge(ctx.state, 'clk', ctx.read(8), 'rise');
    const clr = ctx.read(9);
    const Q = [3, 4, 5, 6, 10, 11, 12, 13];
    let q = ctx.state.q as NetValue[];

    if (clr === 0) q = [0, 0, 0, 0, 0, 0, 0, 0];
    else if (clr === 'X') q = q.map(() => 'X' as NetValue);
    else if (rise) q = [and(ctx.read(1), ctx.read(2)), ...q.slice(0, 7)];

    ctx.state.q = q;
    for (let i = 0; i < 8; i++) ctx.write(Q[i], q[i]);
  },
};

// ---------------------------------------------------------------------------
// 74165 - 8-bit parallel-in serial-out shift register
// ---------------------------------------------------------------------------
const ic74165: ComponentModel = {
  type: 'ic:74165',
  label: '74165',
  name: '8-bit parallel-in, serial-out shift register',
  category: 'register',
  pkg: 'DIP16',
  vccPin: 16,
  gndPin: 8,
  needsPower: true,
  description:
    'Loads eight parallel bits and clocks them out one at a time on QH - the standard way to read many switches over a single wire.',
  notes: [
    'SH/LD (pin 1) LOW loads A..H immediately, without a clock. Take it HIGH to shift.',
    'Data shifts on the RISING edge of CLK while CLK INH (pin 15) is LOW.',
    'SER (pin 10) is the bit shifted into the A end; QH (pin 9) is the bit leaving.',
  ],
  keywords: ['shift register', 'piso', 'parallel in serial out'],
  pins: [
    P(1, 'SH/LD', 'input', 'Shift (HIGH) or asynchronous parallel load (LOW)', { activeLow: true }),
    P(2, 'CLK', 'clock', 'Clock, rising edge'),
    P(3, 'E', 'input', 'Parallel input E'),
    P(4, 'F', 'input', 'Parallel input F'),
    P(5, 'G', 'input', 'Parallel input G'),
    P(6, 'H', 'input', 'Parallel input H (last out)'),
    P(7, 'Q̅H', 'output', 'Complement of the serial output', { activeLow: true }),
    GND(8),
    P(9, 'QH', 'output', 'Serial output'),
    P(10, 'SER', 'input', 'Serial data input'),
    P(11, 'A', 'input', 'Parallel input A (first out)'),
    P(12, 'B', 'input', 'Parallel input B'),
    P(13, 'C', 'input', 'Parallel input C'),
    P(14, 'D', 'input', 'Parallel input D'),
    P(15, 'CLK INH', 'input', 'Clock inhibit: HIGH blocks the clock'),
    VCC(16),
  ],
  truthTable: {
    headers: ['SH/LD', 'CLK INH', 'CLK', 'Action'],
    rows: [
      ['0', 'X', 'X', 'Load A..H (asynchronous)'],
      ['1', '0', '↑', 'Shift towards QH, SER enters'],
      ['1', '1', 'X', 'Hold'],
    ],
  },
  initState: () => ({ q: [0, 0, 0, 0, 0, 0, 0, 0] as NetValue[] }),
  evaluate(ctx) {
    const rise = edge(ctx.state, 'clk', ctx.read(2), 'rise');
    const shld = ctx.read(1);
    const inh = ctx.read(15);
    let q = ctx.state.q as NetValue[];
    const PAR = [11, 12, 13, 14, 3, 4, 5, 6]; // A..H

    if (shld === 0) q = PAR.map((p) => ctx.read(p));
    else if (shld === 'X') q = q.map(() => 'X' as NetValue);
    else if (rise && inh === 0) q = [ctx.read(10), ...q.slice(0, 7)];
    else if (rise && inh === 'X') q = q.map(() => 'X' as NetValue);

    ctx.state.q = q;
    ctx.write(9, q[7]);
    ctx.write(7, not(q[7]));
  },
};

// ---------------------------------------------------------------------------
// 7490 - decade counter
// ---------------------------------------------------------------------------
const ic7490: ComponentModel = {
  type: 'ic:7490',
  label: '7490',
  name: 'Decade counter (divide-by-2 and divide-by-5)',
  category: 'counter',
  pkg: 'DIP14',
  vccPin: 5,
  gndPin: 10,
  needsPower: true,
  description:
    'A ripple counter built as two independent sections: a divide-by-2 (QA) and a divide-by-5 (QB, QC, QD). Wire QA into CKB and the whole chip counts 0 to 9 in BCD.',
  notes: [
    'Careful: power is NOT on the corner pins. VCC is pin 5 and GND is pin 10.',
    'Both sections trigger on the FALLING edge of their clock.',
    'For a BCD decade counter, connect QA (pin 12) to CKB (pin 1) and clock into CKA (pin 14).',
    'Reset to 0 needs R0(1) AND R0(2) HIGH. Reset to 9 needs R9(1) AND R9(2) HIGH, which overrides R0.',
    'For counting, hold the reset pins LOW - tie them to GND.',
  ],
  keywords: ['decade counter', 'bcd counter', 'divide by 10', 'ripple'],
  pins: [
    P(1, 'CKB', 'clock', 'Clock for the divide-by-5 section, falling edge'),
    P(2, 'R0(1)', 'input', 'Reset-to-zero input 1, active HIGH'),
    P(3, 'R0(2)', 'input', 'Reset-to-zero input 2, active HIGH'),
    NC(4),
    VCC(5),
    P(6, 'R9(1)', 'input', 'Reset-to-nine input 1, active HIGH'),
    P(7, 'R9(2)', 'input', 'Reset-to-nine input 2, active HIGH'),
    P(8, 'QC', 'output', 'Counter output C (weight 4)'),
    P(9, 'QB', 'output', 'Counter output B (weight 2)'),
    GND(10),
    P(11, 'QD', 'output', 'Counter output D (weight 8)'),
    P(12, 'QA', 'output', 'Divide-by-2 output (weight 1)'),
    NC(13),
    P(14, 'CKA', 'clock', 'Clock for the divide-by-2 section, falling edge'),
  ],
  truthTable: {
    headers: ['Count', 'QD', 'QC', 'QB', 'QA'],
    rows: [
      ['0', '0', '0', '0', '0'],
      ['1', '0', '0', '0', '1'],
      ['2', '0', '0', '1', '0'],
      ['3', '0', '0', '1', '1'],
      ['4', '0', '1', '0', '0'],
      ['5', '0', '1', '0', '1'],
      ['6', '0', '1', '1', '0'],
      ['7', '0', '1', '1', '1'],
      ['8', '1', '0', '0', '0'],
      ['9', '1', '0', '0', '1'],
    ],
    note: 'BCD sequence with QA wired to CKB.',
  },
  initState: () => ({ a: 0 as NetValue, bcd: 0 as number | 'X' }),
  evaluate(ctx) {
    const fallA = edge(ctx.state, 'cka', ctx.read(14), 'fall');
    const fallB = edge(ctx.state, 'ckb', ctx.read(1), 'fall');
    const r0 = and(ctx.read(2), ctx.read(3));
    const r9 = and(ctx.read(6), ctx.read(7));

    let a = ctx.state.a as NetValue;
    let n = ctx.state.bcd as number | 'X'; // divide-by-5 section, 0..4

    if (r9 === 1) {
      a = 1;
      n = 4; // QD=1, QB=QC=0 -> the "9" state
    } else if (r9 === 'X' || r0 === 'X') {
      a = 'X';
      n = 'X';
    } else if (r0 === 1) {
      a = 0;
      n = 0;
    } else {
      if (fallA) a = not(a);
      if (fallB) n = n === 'X' ? 'X' : (n + 1) % 5;
    }

    ctx.state.a = a;
    ctx.state.bcd = n;
    ctx.write(12, a);
    // The divide-by-5 section counts 0,1,2,3,4 on QB,QC,QD.
    ctx.write(9, n === 'X' ? 'X' : bitOf(n, 0));
    ctx.write(8, n === 'X' ? 'X' : bitOf(n, 1));
    ctx.write(11, n === 'X' ? 'X' : bitOf(n, 2));
  },
};

// ---------------------------------------------------------------------------
// 7493 - 4-bit binary ripple counter
// ---------------------------------------------------------------------------
const ic7493: ComponentModel = {
  type: 'ic:7493',
  label: '7493',
  name: '4-bit binary ripple counter',
  category: 'counter',
  pkg: 'DIP14',
  vccPin: 5,
  gndPin: 10,
  needsPower: true,
  description:
    'A divide-by-2 section (QA) plus a divide-by-8 section (QB, QC, QD). Connect QA to CKB and it counts 0 to 15 in binary.',
  notes: [
    'Careful: power is NOT on the corner pins. VCC is pin 5 and GND is pin 10.',
    'Both sections trigger on the FALLING edge of their clock.',
    'For a 4-bit binary counter, connect QA (pin 12) to CKB (pin 1) and clock into CKA (pin 14).',
    'R0(1) AND R0(2) HIGH resets the counter to 0; hold them LOW to count.',
    'Ripple counters change one flip-flop after another, so the outputs are briefly wrong right after a clock edge. The logic analyzer shows this as a staircase of edges.',
  ],
  keywords: ['binary counter', 'ripple counter', 'divide by 16', 'mod 16'],
  pins: [
    P(1, 'CKB', 'clock', 'Clock for the divide-by-8 section, falling edge'),
    P(2, 'R0(1)', 'input', 'Reset input 1, active HIGH'),
    P(3, 'R0(2)', 'input', 'Reset input 2, active HIGH'),
    NC(4),
    VCC(5),
    NC(6),
    NC(7),
    P(8, 'QC', 'output', 'Counter output C (weight 4)'),
    P(9, 'QB', 'output', 'Counter output B (weight 2)'),
    GND(10),
    P(11, 'QD', 'output', 'Counter output D (weight 8)'),
    P(12, 'QA', 'output', 'Divide-by-2 output (weight 1)'),
    NC(13),
    P(14, 'CKA', 'clock', 'Clock for the divide-by-2 section, falling edge'),
  ],
  truthTable: {
    headers: ['Count', 'QD', 'QC', 'QB', 'QA'],
    rows: [
      ['0', '0', '0', '0', '0'],
      ['1', '0', '0', '0', '1'],
      ['2', '0', '0', '1', '0'],
      ['3', '0', '0', '1', '1'],
      ['7', '0', '1', '1', '1'],
      ['8', '1', '0', '0', '0'],
      ['15', '1', '1', '1', '1'],
    ],
    note: 'Binary sequence with QA wired to CKB; the counter rolls over from 15 to 0.',
  },
  initState: () => ({ a: 0 as NetValue, n: 0 as number | 'X' }),
  evaluate(ctx) {
    const fallA = edge(ctx.state, 'cka', ctx.read(14), 'fall');
    const fallB = edge(ctx.state, 'ckb', ctx.read(1), 'fall');
    const r0 = and(ctx.read(2), ctx.read(3));

    let a = ctx.state.a as NetValue;
    let n = ctx.state.n as number | 'X'; // divide-by-8 section, 0..7

    if (r0 === 1) {
      a = 0;
      n = 0;
    } else if (r0 === 'X') {
      a = 'X';
      n = 'X';
    } else {
      if (fallA) a = not(a);
      if (fallB) n = n === 'X' ? 'X' : (n + 1) % 8;
    }

    ctx.state.a = a;
    ctx.state.n = n;
    ctx.write(12, a);
    ctx.write(9, n === 'X' ? 'X' : bitOf(n, 0));
    ctx.write(8, n === 'X' ? 'X' : bitOf(n, 1));
    ctx.write(11, n === 'X' ? 'X' : bitOf(n, 2));
  },
};

export const SEQUENTIAL_ICS: ComponentModel[] = [
  ic7474,
  ic7476,
  ic74175,
  ic74173,
  binaryCounter('74161'),
  binaryCounter('74163'),
  ic74164,
  ic74165,
  ic7490,
  ic7493,
];
