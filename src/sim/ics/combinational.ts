/**
 * MSI combinational parts: decoders, encoders, multiplexers, adders and the
 * 7447 seven-segment driver. Pin numbers follow the standard 74-series
 * datasheets; active-LOW pins are marked so the UI can draw the overbar.
 */
import { and, bitsToInt, not, or, xor } from '../logic';
import type { ComponentModel, NetValue, PinDef } from '../types';

const P = (
  n: number,
  name: string,
  kind: PinDef['kind'],
  fn: string,
  extra: Partial<PinDef> = {},
): PinDef => ({ n, name, kind, fn, ...extra });

const VCC = (n: number) => P(n, 'VCC', 'power', '+5 V supply');
const GND = (n: number) => P(n, 'GND', 'ground', '0 V (ground) return');

/** Drive every pin in `pins` with `v`. */
function writeAll(
  ctx: { write: (p: number, v: NetValue) => void },
  pins: number[],
  v: NetValue,
) {
  for (const p of pins) ctx.write(p, v);
}

// ---------------------------------------------------------------------------
// 74138 - 3-to-8 line decoder / demultiplexer
// ---------------------------------------------------------------------------
const Y138 = [15, 14, 13, 12, 11, 10, 9, 7]; // Y0..Y7

const ic74138: ComponentModel = {
  type: 'ic:74138',
  label: '74138',
  name: '3-to-8 line decoder / demultiplexer',
  category: 'decoder',
  pkg: 'DIP16',
  vccPin: 16,
  gndPin: 8,
  needsPower: true,
  description:
    'Decodes a 3-bit address into one of eight active-LOW outputs. With G1 held HIGH it also works as a 1-to-8 demultiplexer: feed data into G2A (or G2B) and it appears, inverted, on the addressed output.',
  notes: [
    'Outputs are active LOW: the selected output goes LOW, all others stay HIGH.',
    'Enable condition: G1 = HIGH and both G2A and G2B = LOW. Otherwise all eight outputs are HIGH.',
    'C is the most significant select bit (pin 3), A is the least significant (pin 1).',
  ],
  keywords: ['demultiplexer', 'demux', 'address decoder', '3 to 8'],
  pins: [
    P(1, 'A', 'input', 'Select input A (LSB)'),
    P(2, 'B', 'input', 'Select input B'),
    P(3, 'C', 'input', 'Select input C (MSB)'),
    P(4, 'G2A', 'input', 'Enable input, active LOW', { activeLow: true }),
    P(5, 'G2B', 'input', 'Enable input, active LOW', { activeLow: true }),
    P(6, 'G1', 'input', 'Enable input, active HIGH'),
    P(7, 'Y7', 'output', 'Decoded output 7, active LOW', { activeLow: true }),
    GND(8),
    P(9, 'Y6', 'output', 'Decoded output 6, active LOW', { activeLow: true }),
    P(10, 'Y5', 'output', 'Decoded output 5, active LOW', { activeLow: true }),
    P(11, 'Y4', 'output', 'Decoded output 4, active LOW', { activeLow: true }),
    P(12, 'Y3', 'output', 'Decoded output 3, active LOW', { activeLow: true }),
    P(13, 'Y2', 'output', 'Decoded output 2, active LOW', { activeLow: true }),
    P(14, 'Y1', 'output', 'Decoded output 1, active LOW', { activeLow: true }),
    P(15, 'Y0', 'output', 'Decoded output 0, active LOW', { activeLow: true }),
    VCC(16),
  ],
  truthTable: {
    headers: ['G1', 'G2A', 'G2B', 'C', 'B', 'A', 'LOW output'],
    rows: [
      ['0', 'X', 'X', 'X', 'X', 'X', 'none (all HIGH)'],
      ['X', '1', 'X', 'X', 'X', 'X', 'none (all HIGH)'],
      ['X', 'X', '1', 'X', 'X', 'X', 'none (all HIGH)'],
      ['1', '0', '0', '0', '0', '0', 'Y0'],
      ['1', '0', '0', '0', '0', '1', 'Y1'],
      ['1', '0', '0', '0', '1', '0', 'Y2'],
      ['1', '0', '0', '0', '1', '1', 'Y3'],
      ['1', '0', '0', '1', '0', '0', 'Y4'],
      ['1', '0', '0', '1', '0', '1', 'Y5'],
      ['1', '0', '0', '1', '1', '0', 'Y6'],
      ['1', '0', '0', '1', '1', '1', 'Y7'],
    ],
    note: 'Exactly one output is LOW at a time while the chip is enabled.',
  },
  evaluate(ctx) {
    const enable = and(ctx.read(6), not(ctx.read(4)), not(ctx.read(5)));
    if (enable === 0) {
      writeAll(ctx, Y138, 1);
      return;
    }
    const sel = bitsToInt([ctx.read(1), ctx.read(2), ctx.read(3)]);
    if (enable === 'X' || sel < 0) {
      writeAll(ctx, Y138, 'X');
      return;
    }
    writeAll(ctx, Y138, 1);
    ctx.write(Y138[sel], 0);
  },
};

// ---------------------------------------------------------------------------
// 74139 - dual 2-to-4 line decoder
// ---------------------------------------------------------------------------
const ic74139: ComponentModel = {
  type: 'ic:74139',
  label: '74139',
  name: 'Dual 2-to-4 line decoder / demultiplexer',
  category: 'decoder',
  pkg: 'DIP16',
  vccPin: 16,
  gndPin: 8,
  needsPower: true,
  description:
    'Two completely independent 2-to-4 decoders in one package. Each half has its own active-LOW enable and four active-LOW outputs.',
  notes: [
    'Outputs are active LOW. When a half is disabled (G = HIGH) all four of its outputs are HIGH.',
    'B is the most significant select bit of each half.',
  ],
  keywords: ['demux', '2 to 4', 'dual decoder'],
  pins: [
    P(1, '1G', 'input', 'Decoder 1 enable, active LOW', { activeLow: true, group: 'Decoder 1' }),
    P(2, '1A', 'input', 'Decoder 1 select A (LSB)', { group: 'Decoder 1' }),
    P(3, '1B', 'input', 'Decoder 1 select B (MSB)', { group: 'Decoder 1' }),
    P(4, '1Y0', 'output', 'Decoder 1 output 0, active LOW', { activeLow: true, group: 'Decoder 1' }),
    P(5, '1Y1', 'output', 'Decoder 1 output 1, active LOW', { activeLow: true, group: 'Decoder 1' }),
    P(6, '1Y2', 'output', 'Decoder 1 output 2, active LOW', { activeLow: true, group: 'Decoder 1' }),
    P(7, '1Y3', 'output', 'Decoder 1 output 3, active LOW', { activeLow: true, group: 'Decoder 1' }),
    GND(8),
    P(9, '2Y3', 'output', 'Decoder 2 output 3, active LOW', { activeLow: true, group: 'Decoder 2' }),
    P(10, '2Y2', 'output', 'Decoder 2 output 2, active LOW', { activeLow: true, group: 'Decoder 2' }),
    P(11, '2Y1', 'output', 'Decoder 2 output 1, active LOW', { activeLow: true, group: 'Decoder 2' }),
    P(12, '2Y0', 'output', 'Decoder 2 output 0, active LOW', { activeLow: true, group: 'Decoder 2' }),
    P(13, '2B', 'input', 'Decoder 2 select B (MSB)', { group: 'Decoder 2' }),
    P(14, '2A', 'input', 'Decoder 2 select A (LSB)', { group: 'Decoder 2' }),
    P(15, '2G', 'input', 'Decoder 2 enable, active LOW', { activeLow: true, group: 'Decoder 2' }),
    VCC(16),
  ],
  truthTable: {
    headers: ['G', 'B', 'A', 'LOW output'],
    rows: [
      ['1', 'X', 'X', 'none (all HIGH)'],
      ['0', '0', '0', 'Y0'],
      ['0', '0', '1', 'Y1'],
      ['0', '1', '0', 'Y2'],
      ['0', '1', '1', 'Y3'],
    ],
    note: 'Each half behaves identically.',
  },
  evaluate(ctx) {
    const half = (g: number, a: number, b: number, outs: number[]) => {
      const en = ctx.read(g);
      if (en === 1) {
        writeAll(ctx, outs, 1);
        return;
      }
      const sel = bitsToInt([ctx.read(a), ctx.read(b)]);
      if (en === 'X' || sel < 0) {
        writeAll(ctx, outs, 'X');
        return;
      }
      writeAll(ctx, outs, 1);
      ctx.write(outs[sel], 0);
    };
    half(1, 2, 3, [4, 5, 6, 7]);
    half(15, 14, 13, [12, 11, 10, 9]);
  },
};

// ---------------------------------------------------------------------------
// 74148 - 8-to-3 priority encoder
// ---------------------------------------------------------------------------
const I148 = [10, 11, 12, 13, 1, 2, 3, 4]; // I0..I7
const A148 = [9, 7, 6]; // A0, A1, A2 (all active LOW)

const ic74148: ComponentModel = {
  type: 'ic:74148',
  label: '74148',
  name: '8-to-3 priority encoder',
  category: 'encoder',
  pkg: 'DIP16',
  vccPin: 16,
  gndPin: 8,
  needsPower: true,
  description:
    'Encodes eight active-LOW inputs into a 3-bit active-LOW binary code. It is a priority encoder: if several inputs are LOW at once, the highest-numbered one wins, which is what makes it safe to use when more than one key can be pressed.',
  notes: [
    'Inputs and outputs are all active LOW. The code on A2..A0 is the COMPLEMENT of the input number.',
    'EI (pin 5) must be LOW for the chip to do anything.',
    'GS goes LOW when the chip is enabled and at least one input is LOW.',
    'EO goes LOW when the chip is enabled and no input is active - used to cascade encoders.',
  ],
  keywords: ['priority encoder', '8 to 3', 'gs', 'eo'],
  pins: [
    P(1, 'I4', 'input', 'Data input 4, active LOW', { activeLow: true }),
    P(2, 'I5', 'input', 'Data input 5, active LOW', { activeLow: true }),
    P(3, 'I6', 'input', 'Data input 6, active LOW', { activeLow: true }),
    P(4, 'I7', 'input', 'Data input 7, active LOW (highest priority)', { activeLow: true }),
    P(5, 'EI', 'input', 'Enable input, active LOW', { activeLow: true }),
    P(6, 'A2', 'output', 'Encoded output bit 2, active LOW', { activeLow: true }),
    P(7, 'A1', 'output', 'Encoded output bit 1, active LOW', { activeLow: true }),
    GND(8),
    P(9, 'A0', 'output', 'Encoded output bit 0, active LOW', { activeLow: true }),
    P(10, 'I0', 'input', 'Data input 0, active LOW (lowest priority)', { activeLow: true }),
    P(11, 'I1', 'input', 'Data input 1, active LOW', { activeLow: true }),
    P(12, 'I2', 'input', 'Data input 2, active LOW', { activeLow: true }),
    P(13, 'I3', 'input', 'Data input 3, active LOW', { activeLow: true }),
    P(14, 'GS', 'output', 'Group select: LOW when any input is active', { activeLow: true }),
    P(15, 'EO', 'output', 'Enable output: LOW when enabled and no input is active', { activeLow: true }),
    VCC(16),
  ],
  truthTable: {
    headers: ['EI', 'Highest LOW input', 'A2', 'A1', 'A0', 'GS', 'EO'],
    rows: [
      ['1', 'X', '1', '1', '1', '1', '1'],
      ['0', 'none', '1', '1', '1', '1', '0'],
      ['0', 'I0', '1', '1', '1', '0', '1'],
      ['0', 'I1', '1', '1', '0', '0', '1'],
      ['0', 'I2', '1', '0', '1', '0', '1'],
      ['0', 'I3', '1', '0', '0', '0', '1'],
      ['0', 'I4', '0', '1', '1', '0', '1'],
      ['0', 'I5', '0', '1', '0', '0', '1'],
      ['0', 'I6', '0', '0', '1', '0', '1'],
      ['0', 'I7', '0', '0', '0', '0', '1'],
    ],
    note: 'A2..A0 carry the complement of the active input number.',
  },
  evaluate(ctx) {
    const ei = ctx.read(5);
    if (ei === 1) {
      writeAll(ctx, [...A148, 14, 15], 1);
      return;
    }
    if (ei === 'X') {
      writeAll(ctx, [...A148, 14, 15], 'X');
      return;
    }
    // Scan from the highest priority input downwards.
    for (let i = 7; i >= 0; i--) {
      const v = ctx.read(I148[i]);
      if (v === 'X') {
        // A higher-priority input of unknown level makes the whole code unknown.
        writeAll(ctx, [...A148, 14, 15], 'X');
        return;
      }
      if (v === 0) {
        for (let b = 0; b < 3; b++) ctx.write(A148[b], (((i >> b) & 1) ^ 1) as 0 | 1);
        ctx.write(14, 0); // GS
        ctx.write(15, 1); // EO
        return;
      }
    }
    writeAll(ctx, A148, 1);
    ctx.write(14, 1);
    ctx.write(15, 0);
  },
};

// ---------------------------------------------------------------------------
// 74151 - 8-to-1 multiplexer
// ---------------------------------------------------------------------------
const D151 = [4, 3, 2, 1, 15, 14, 13, 12]; // D0..D7

const ic74151: ComponentModel = {
  type: 'ic:74151',
  label: '74151',
  name: '8-to-1 data selector / multiplexer',
  category: 'mux',
  pkg: 'DIP16',
  vccPin: 16,
  gndPin: 8,
  needsPower: true,
  description:
    'Routes one of eight data inputs to the output, chosen by the 3-bit address on C, B and A. Both the true output Y and its complement W are provided. A single 74151 can implement any 3-variable Boolean function.',
  notes: [
    'Strobe G (pin 7) must be LOW to enable the chip. With G HIGH, Y = LOW and W = HIGH regardless of the data.',
    'A (pin 11) is the least significant address bit, C (pin 9) the most significant.',
  ],
  keywords: ['mux', 'data selector', '8 to 1'],
  pins: [
    P(1, 'D3', 'input', 'Data input 3'),
    P(2, 'D2', 'input', 'Data input 2'),
    P(3, 'D1', 'input', 'Data input 1'),
    P(4, 'D0', 'input', 'Data input 0'),
    P(5, 'Y', 'output', 'Multiplexer output'),
    P(6, 'W', 'output', 'Complement of Y', { activeLow: true }),
    P(7, 'G', 'input', 'Strobe / enable, active LOW', { activeLow: true }),
    GND(8),
    P(9, 'C', 'input', 'Address input C (MSB)'),
    P(10, 'B', 'input', 'Address input B'),
    P(11, 'A', 'input', 'Address input A (LSB)'),
    P(12, 'D7', 'input', 'Data input 7'),
    P(13, 'D6', 'input', 'Data input 6'),
    P(14, 'D5', 'input', 'Data input 5'),
    P(15, 'D4', 'input', 'Data input 4'),
    VCC(16),
  ],
  truthTable: {
    headers: ['G', 'C', 'B', 'A', 'Y', 'W'],
    rows: [
      ['1', 'X', 'X', 'X', '0', '1'],
      ['0', '0', '0', '0', 'D0', 'D0̅'],
      ['0', '0', '0', '1', 'D1', 'D1̅'],
      ['0', '0', '1', '0', 'D2', 'D2̅'],
      ['0', '0', '1', '1', 'D3', 'D3̅'],
      ['0', '1', '0', '0', 'D4', 'D4̅'],
      ['0', '1', '0', '1', 'D5', 'D5̅'],
      ['0', '1', '1', '0', 'D6', 'D6̅'],
      ['0', '1', '1', '1', 'D7', 'D7̅'],
    ],
  },
  evaluate(ctx) {
    const g = ctx.read(7);
    if (g === 1) {
      ctx.write(5, 0);
      ctx.write(6, 1);
      return;
    }
    const sel = bitsToInt([ctx.read(11), ctx.read(10), ctx.read(9)]);
    if (g === 'X' || sel < 0) {
      ctx.write(5, 'X');
      ctx.write(6, 'X');
      return;
    }
    const y = ctx.read(D151[sel]);
    ctx.write(5, y);
    ctx.write(6, not(y));
  },
};

// ---------------------------------------------------------------------------
// 74153 - dual 4-to-1 multiplexer
// ---------------------------------------------------------------------------
const ic74153: ComponentModel = {
  type: 'ic:74153',
  label: '74153',
  name: 'Dual 4-to-1 data selector / multiplexer',
  category: 'mux',
  pkg: 'DIP16',
  vccPin: 16,
  gndPin: 8,
  needsPower: true,
  description:
    'Two 4-to-1 multiplexers that share one pair of select lines, so both halves always select the same numbered input. Each half has its own strobe and output.',
  notes: [
    'Select inputs are shared: A (pin 14) is the LSB, B (pin 2) the MSB.',
    'Each strobe is active LOW. A disabled half forces its output LOW.',
  ],
  keywords: ['mux', '4 to 1', 'dual multiplexer'],
  pins: [
    P(1, '1G', 'input', 'Strobe for half 1, active LOW', { activeLow: true, group: 'MUX 1' }),
    P(2, 'B', 'input', 'Common select input B (MSB)'),
    P(3, '1C3', 'input', 'Half 1 data input 3', { group: 'MUX 1' }),
    P(4, '1C2', 'input', 'Half 1 data input 2', { group: 'MUX 1' }),
    P(5, '1C1', 'input', 'Half 1 data input 1', { group: 'MUX 1' }),
    P(6, '1C0', 'input', 'Half 1 data input 0', { group: 'MUX 1' }),
    P(7, '1Y', 'output', 'Half 1 output', { group: 'MUX 1' }),
    GND(8),
    P(9, '2Y', 'output', 'Half 2 output', { group: 'MUX 2' }),
    P(10, '2C0', 'input', 'Half 2 data input 0', { group: 'MUX 2' }),
    P(11, '2C1', 'input', 'Half 2 data input 1', { group: 'MUX 2' }),
    P(12, '2C2', 'input', 'Half 2 data input 2', { group: 'MUX 2' }),
    P(13, '2C3', 'input', 'Half 2 data input 3', { group: 'MUX 2' }),
    P(14, 'A', 'input', 'Common select input A (LSB)'),
    P(15, '2G', 'input', 'Strobe for half 2, active LOW', { activeLow: true, group: 'MUX 2' }),
    VCC(16),
  ],
  truthTable: {
    headers: ['G', 'B', 'A', 'Y'],
    rows: [
      ['1', 'X', 'X', '0'],
      ['0', '0', '0', 'C0'],
      ['0', '0', '1', 'C1'],
      ['0', '1', '0', 'C2'],
      ['0', '1', '1', 'C3'],
    ],
  },
  evaluate(ctx) {
    const sel = bitsToInt([ctx.read(14), ctx.read(2)]);
    const half = (g: number, data: number[], out: number) => {
      const en = ctx.read(g);
      if (en === 1) {
        ctx.write(out, 0);
        return;
      }
      if (en === 'X' || sel < 0) {
        ctx.write(out, 'X');
        return;
      }
      ctx.write(out, ctx.read(data[sel]));
    };
    half(1, [6, 5, 4, 3], 7);
    half(15, [10, 11, 12, 13], 9);
  },
};

// ---------------------------------------------------------------------------
// 74157 - quad 2-to-1 multiplexer
// ---------------------------------------------------------------------------
const ic74157: ComponentModel = {
  type: 'ic:74157',
  label: '74157',
  name: 'Quad 2-to-1 data selector / multiplexer',
  category: 'mux',
  pkg: 'DIP16',
  vccPin: 16,
  gndPin: 8,
  needsPower: true,
  description:
    'Selects between two 4-bit words with a single select line - the classic way to feed a register or ALU from one of two sources.',
  notes: [
    'Select (pin 1) LOW routes the A inputs to the outputs; HIGH routes the B inputs.',
    'Strobe G (pin 15) is active LOW; with it HIGH all four outputs are forced LOW.',
  ],
  keywords: ['mux', '2 to 1', 'quad', 'data selector'],
  pins: [
    P(1, 'S', 'input', 'Select: LOW = A inputs, HIGH = B inputs'),
    P(2, '1A', 'input', 'Channel 1 input A', { group: 'MUX 1' }),
    P(3, '1B', 'input', 'Channel 1 input B', { group: 'MUX 1' }),
    P(4, '1Y', 'output', 'Channel 1 output', { group: 'MUX 1' }),
    P(5, '2A', 'input', 'Channel 2 input A', { group: 'MUX 2' }),
    P(6, '2B', 'input', 'Channel 2 input B', { group: 'MUX 2' }),
    P(7, '2Y', 'output', 'Channel 2 output', { group: 'MUX 2' }),
    GND(8),
    P(9, '4Y', 'output', 'Channel 4 output', { group: 'MUX 4' }),
    P(10, '4B', 'input', 'Channel 4 input B', { group: 'MUX 4' }),
    P(11, '4A', 'input', 'Channel 4 input A', { group: 'MUX 4' }),
    P(12, '3Y', 'output', 'Channel 3 output', { group: 'MUX 3' }),
    P(13, '3B', 'input', 'Channel 3 input B', { group: 'MUX 3' }),
    P(14, '3A', 'input', 'Channel 3 input A', { group: 'MUX 3' }),
    P(15, 'G', 'input', 'Strobe / enable, active LOW', { activeLow: true }),
    VCC(16),
  ],
  truthTable: {
    headers: ['G', 'S', 'Y'],
    rows: [
      ['1', 'X', '0'],
      ['0', '0', 'A'],
      ['0', '1', 'B'],
    ],
  },
  evaluate(ctx) {
    const g = ctx.read(15);
    const s = ctx.read(1);
    const chans: [number, number, number][] = [
      [2, 3, 4],
      [5, 6, 7],
      [14, 13, 12],
      [11, 10, 9],
    ];
    for (const [a, b, y] of chans) {
      if (g === 1) ctx.write(y, 0);
      else if (g === 'X' || s === 'X') ctx.write(y, 'X');
      else ctx.write(y, s === 0 ? ctx.read(a) : ctx.read(b));
    }
  },
};

// ---------------------------------------------------------------------------
// 7483 - 4-bit binary full adder
// ---------------------------------------------------------------------------
const ic7483: ComponentModel = {
  type: 'ic:7483',
  label: '7483',
  name: '4-bit binary full adder with fast carry',
  category: 'gate',
  pkg: 'DIP16',
  vccPin: 5,
  gndPin: 12,
  needsPower: true,
  description:
    'Adds two 4-bit numbers plus a carry-in and produces a 4-bit sum and a carry-out. Internally it is four full adders with look-ahead carry.',
  notes: [
    'Careful: this package does NOT use the usual corner pins for power. VCC is pin 5 and GND is pin 12.',
    'A1/B1/Σ1 are the least significant bits; A4/B4/Σ4 the most significant.',
    'For subtraction, feed B through XOR gates and tie C0 HIGH to form the twos complement.',
  ],
  keywords: ['adder', 'full adder', 'sum', 'carry', '4 bit'],
  pins: [
    P(1, 'A4', 'input', 'Operand A bit 4 (MSB)'),
    P(2, 'Σ3', 'output', 'Sum bit 3'),
    P(3, 'A3', 'input', 'Operand A bit 3'),
    P(4, 'B3', 'input', 'Operand B bit 3'),
    VCC(5),
    P(6, 'Σ2', 'output', 'Sum bit 2'),
    P(7, 'B2', 'input', 'Operand B bit 2'),
    P(8, 'A2', 'input', 'Operand A bit 2'),
    P(9, 'Σ1', 'output', 'Sum bit 1 (LSB)'),
    P(10, 'A1', 'input', 'Operand A bit 1 (LSB)'),
    P(11, 'B1', 'input', 'Operand B bit 1 (LSB)'),
    GND(12),
    P(13, 'C0', 'input', 'Carry in'),
    P(14, 'C4', 'output', 'Carry out'),
    P(15, 'Σ4', 'output', 'Sum bit 4 (MSB)'),
    P(16, 'B4', 'input', 'Operand B bit 4 (MSB)'),
  ],
  truthTable: {
    headers: ['A', 'B', 'Cin', 'Sum', 'Cout'],
    rows: [
      ['0', '0', '0', '0', '0'],
      ['0', '0', '1', '1', '0'],
      ['0', '1', '0', '1', '0'],
      ['0', '1', '1', '0', '1'],
      ['1', '0', '0', '1', '0'],
      ['1', '0', '1', '0', '1'],
      ['1', '1', '0', '0', '1'],
      ['1', '1', '1', '1', '1'],
    ],
    note: 'Per-bit behaviour; the carry ripples from bit 1 to bit 4 internally.',
  },
  evaluate(ctx) {
    const A = [10, 8, 3, 1];
    const B = [11, 7, 4, 16];
    const S = [9, 6, 2, 15];
    let carry: NetValue = ctx.read(13);
    for (let i = 0; i < 4; i++) {
      const a = ctx.read(A[i]);
      const b = ctx.read(B[i]);
      ctx.write(S[i], xor(a, b, carry));
      // Carry out of a full adder is the majority of its three inputs.
      carry = or(and(a, b), and(b, carry), and(a, carry));
    }
    ctx.write(14, carry);
  },
};

// ---------------------------------------------------------------------------
// 7447 - BCD to seven-segment decoder / driver
// ---------------------------------------------------------------------------
/** Segment patterns a..g for inputs 0-15, exactly as the 7447 drives them. */
const SEG7447: number[][] = [
  [1, 1, 1, 1, 1, 1, 0], // 0
  [0, 1, 1, 0, 0, 0, 0], // 1
  [1, 1, 0, 1, 1, 0, 1], // 2
  [1, 1, 1, 1, 0, 0, 1], // 3
  [0, 1, 1, 0, 0, 1, 1], // 4
  [1, 0, 1, 1, 0, 1, 1], // 5
  [0, 0, 1, 1, 1, 1, 1], // 6  (the 7447 leaves segment a off)
  [1, 1, 1, 0, 0, 0, 0], // 7
  [1, 1, 1, 1, 1, 1, 1], // 8
  [1, 1, 1, 0, 0, 1, 1], // 9  (the 7447 leaves segment d off)
  [0, 0, 0, 1, 1, 0, 1], // 10
  [0, 0, 1, 1, 0, 0, 1], // 11
  [0, 1, 0, 0, 0, 1, 1], // 12
  [1, 0, 0, 1, 0, 1, 1], // 13
  [0, 0, 0, 1, 1, 1, 1], // 14
  [0, 0, 0, 0, 0, 0, 0], // 15 (blank)
];

const SEGPINS = [13, 12, 11, 10, 9, 15, 14]; // a, b, c, d, e, f, g

const ic7447: ComponentModel = {
  type: 'ic:7447',
  label: '7447',
  name: 'BCD to 7-segment decoder / driver',
  category: 'display',
  pkg: 'DIP16',
  vccPin: 16,
  gndPin: 8,
  needsPower: true,
  description:
    'Converts a 4-bit BCD number into the seven segment drives for a display. Outputs are active LOW and can sink lamp current directly, so it is used with COMMON-ANODE displays.',
  notes: [
    'Outputs a..g are active LOW: a segment lights when its output pin is LOW.',
    'Use a COMMON-ANODE display (common pin to +5 V) with a series resistor per segment.',
    'LT (pin 3) LOW lights every segment - the lamp test.',
    'RBI (pin 5) LOW blanks a leading zero.',
    'BI (pin 4) LOW blanks the whole digit. This model treats pin 4 as the blanking input only; the ripple-blanking output behaviour of that pin is not simulated.',
    'Inputs 10-15 produce the unique patterns shown on the 7447 datasheet, not blanks.',
  ],
  keywords: ['seven segment', 'bcd', 'display driver', '7 segment'],
  pins: [
    P(1, 'B', 'input', 'BCD input B (weight 2)'),
    P(2, 'C', 'input', 'BCD input C (weight 4)'),
    P(3, 'LT', 'input', 'Lamp test, active LOW', { activeLow: true }),
    P(4, 'BI', 'input', 'Blanking input, active LOW', { activeLow: true }),
    P(5, 'RBI', 'input', 'Ripple blanking input, active LOW', { activeLow: true }),
    P(6, 'D', 'input', 'BCD input D (weight 8, MSB)'),
    P(7, 'A', 'input', 'BCD input A (weight 1, LSB)'),
    GND(8),
    P(9, 'e', 'output', 'Segment e drive, active LOW', { activeLow: true }),
    P(10, 'd', 'output', 'Segment d drive, active LOW', { activeLow: true }),
    P(11, 'c', 'output', 'Segment c drive, active LOW', { activeLow: true }),
    P(12, 'b', 'output', 'Segment b drive, active LOW', { activeLow: true }),
    P(13, 'a', 'output', 'Segment a drive, active LOW', { activeLow: true }),
    P(14, 'g', 'output', 'Segment g drive, active LOW', { activeLow: true }),
    P(15, 'f', 'output', 'Segment f drive, active LOW', { activeLow: true }),
    VCC(16),
  ],
  truthTable: {
    headers: ['D', 'C', 'B', 'A', 'Display'],
    rows: [
      ['0', '0', '0', '0', '0'],
      ['0', '0', '0', '1', '1'],
      ['0', '0', '1', '0', '2'],
      ['0', '0', '1', '1', '3'],
      ['0', '1', '0', '0', '4'],
      ['0', '1', '0', '1', '5'],
      ['0', '1', '1', '0', '6'],
      ['0', '1', '1', '1', '7'],
      ['1', '0', '0', '0', '8'],
      ['1', '0', '0', '1', '9'],
      ['1', '0', '1', '0', 'pattern 10'],
      ['1', '1', '1', '1', 'blank'],
    ],
    note: 'Segment outputs are LOW for a lit segment.',
  },
  evaluate(ctx) {
    const bi = ctx.read(4);
    if (bi === 0) {
      writeAll(ctx, SEGPINS, 1); // every segment off
      return;
    }
    const lt = ctx.read(3);
    if (bi === 1 && lt === 0) {
      writeAll(ctx, SEGPINS, 0); // lamp test: every segment on
      return;
    }
    const n = bitsToInt([ctx.read(7), ctx.read(1), ctx.read(2), ctx.read(6)]);
    if (n < 0 || bi === 'X' || lt === 'X') {
      writeAll(ctx, SEGPINS, 'X');
      return;
    }
    if (n === 0 && ctx.read(5) === 0) {
      writeAll(ctx, SEGPINS, 1); // ripple-blanked leading zero
      return;
    }
    const pattern = SEG7447[n];
    for (let i = 0; i < 7; i++) ctx.write(SEGPINS[i], (pattern[i] ? 0 : 1) as 0 | 1);
  },
};

export const COMBINATIONAL_ICS: ComponentModel[] = [
  ic74138,
  ic74139,
  ic74148,
  ic74151,
  ic74153,
  ic74157,
  ic7483,
  ic7447,
];
