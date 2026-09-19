/**
 * The practical syllabus.
 *
 * Each experiment states what to build and how to wire it up to the trainer's
 * Digital Writer and Digital Reader, and carries a machine-checkable expectation
 * so the lab can test the student's own wiring against the real truth table.
 *
 * Nothing here builds the circuit: "Start experiment" only puts the required
 * parts on the bench, exactly like being handed a tray of ICs.
 */
import type { TruthTable } from '../sim/types';

export interface PartRequirement {
  type: string;
  qty: number;
  note?: string;
}

/** Drive these writer channels, read those reader channels, compare. */
export interface CombinationalCheck {
  kind: 'combinational';
  inputs: string[];
  outputs: string[];
  /** One row per test: input values first, then the expected outputs. */
  rows: (0 | 1)[][];
}

export interface SequenceStep {
  /** Writer channels to set before this step. */
  set?: Record<string, 0 | 1>;
  /** Writer channel to pulse LOW-HIGH-LOW (one full clock cycle). */
  pulse?: string;
  /** Reader channels that must hold these values after the step. */
  expect?: Record<string, 0 | 1>;
  note: string;
}

export interface SequentialCheck {
  kind: 'sequential';
  inputs: string[];
  outputs: string[];
  steps: SequenceStep[];
}

export type ExperimentCheck = CombinationalCheck | SequentialCheck;

export interface Experiment {
  id: string;
  number: number;
  title: string;
  objective: string;
  theory: string;
  parts: PartRequirement[];
  requirements: string[];
  pinConfig: string[];
  procedure: string[];
  truthTable?: TruthTable;
  expected: string;
  check?: ExperimentCheck;
  tips?: string[];
}

// --- small helpers so the tables below stay readable ------------------------

/** All input combinations, first column varying slowest (A is the MSB). */
function combos(n: number): (0 | 1)[][] {
  return Array.from(
    { length: 1 << n },
    (_, i) => Array.from({ length: n }, (_, b) => ((i >> (n - 1 - b)) & 1) as 0 | 1),
  );
}

function rowsFrom(n: number, fn: (bits: (0 | 1)[]) => (0 | 1)[]): (0 | 1)[][] {
  return combos(n).map((bits) => [...bits, ...fn(bits)]);
}

function tableFrom(
  headers: string[],
  n: number,
  fn: (bits: (0 | 1)[]) => (0 | 1)[],
  note?: string,
): TruthTable {
  return {
    headers,
    rows: rowsFrom(n, fn).map((r) => r.map(String)),
    note,
  };
}

const POWER_NOTE =
  'Every IC needs its own supply: VCC to pin 14 (or pin 16 / pin 5, check the package) and GND to pin 7 (or pin 8 / pin 12 / pin 10).';

export const EXPERIMENTS: Experiment[] = [
  {
    id: 'exp01',
    number: 1,
    title: 'Verify AND, OR and NOT gates',
    objective:
      'Wire up the three basic gates and confirm from measurements that each one behaves exactly as its truth table says.',
    theory:
      'AND gives a 1 only when every input is 1. OR gives a 1 when any input is 1. NOT gives the complement of its single input. These three are functionally complete: any Boolean function can be written using only AND, OR and NOT.',
    parts: [
      { type: 'ic:7408', qty: 1, note: 'Quad 2-input AND' },
      { type: 'ic:7432', qty: 1, note: 'Quad 2-input OR' },
      { type: 'ic:7404', qty: 1, note: 'Hex inverter' },
    ],
    requirements: [
      'Power all three packages from VCC and GND.',
      'Use one gate from each package.',
      'Share the same two input switches between the AND and the OR gate so you can compare them directly.',
    ],
    pinConfig: [
      'D0 to 7408 pin 1, D1 to 7408 pin 2, 7408 pin 3 to R8 (AND output).',
      'D0 to 7432 pin 1, D1 to 7432 pin 2, 7432 pin 3 to R9 (OR output).',
      'D2 to 7404 pin 1, 7404 pin 2 to R10 (NOT output).',
      POWER_NOTE,
    ],
    procedure: [
      'Place the 7408, 7432 and 7404 on the bench.',
      'Connect VCC and GND to every package first - a TTL chip does nothing without them.',
      'Wire the inputs from the Digital Writer and the outputs to the Digital Reader as listed above.',
      'Press Run, then step D0, D1 and D2 through all eight combinations.',
      'Record R8, R9 and R10 for each combination and compare with the truth table.',
    ],
    truthTable: tableFrom(
      ['D0 (A)', 'D1 (B)', 'D2 (C)', 'R8 = A.B', 'R9 = A+B', 'R10 = C̅'],
      3,
      ([a, b, c]) => [(a && b ? 1 : 0), (a || b ? 1 : 0), (c ? 0 : 1)],
    ),
    expected:
      'R8 is HIGH only for D0 = D1 = 1. R9 is HIGH whenever either input is HIGH. R10 is always the opposite of D2.',
    check: {
      kind: 'combinational',
      inputs: ['D0', 'D1', 'D2'],
      outputs: ['R8', 'R9', 'R10'],
      rows: rowsFrom(3, ([a, b, c]) => [
        (a && b ? 1 : 0) as 0 | 1,
        (a || b ? 1 : 0) as 0 | 1,
        (c ? 0 : 1) as 0 | 1,
      ]),
    },
    tips: [
      'If an output reads X, look for a floating input or a missing supply wire before suspecting the gate.',
      'The unused gates in each package can be left alone, but on real hardware their inputs should be tied off.',
    ],
  },
  {
    id: 'exp02',
    number: 2,
    title: 'Verify NAND and NOR gates',
    objective:
      'Verify the two universal gates and see that each is the inversion of the gate it is named after.',
    theory:
      'NAND is AND followed by an inverter, NOR is OR followed by an inverter. Either one on its own is enough to build every other gate, which is why almost all real logic is made from them.',
    parts: [
      { type: 'ic:7400', qty: 1, note: 'Quad 2-input NAND' },
      { type: 'ic:7402', qty: 1, note: 'Quad 2-input NOR' },
    ],
    requirements: [
      'Power both packages.',
      'Watch the 7402 pinout - its outputs are on pins 1, 4, 10 and 13, not where the 7400 puts them.',
    ],
    pinConfig: [
      'D0 to 7400 pin 1, D1 to 7400 pin 2, 7400 pin 3 to R8 (NAND output).',
      'D0 to 7402 pin 2, D1 to 7402 pin 3, 7402 pin 1 to R9 (NOR output).',
      POWER_NOTE,
    ],
    procedure: [
      'Place and power the 7400 and the 7402.',
      'Wire gate 1 of each package to D0 and D1.',
      'Bring the NAND output to R8 and the NOR output to R9.',
      'Work through all four input combinations and record the outputs.',
    ],
    truthTable: tableFrom(
      ['D0 (A)', 'D1 (B)', 'R8 = (A.B)̅', 'R9 = (A+B)̅'],
      2,
      ([a, b]) => [(a && b ? 0 : 1), (a || b ? 0 : 1)],
    ),
    expected: 'R8 is LOW only when both inputs are HIGH. R9 is HIGH only when both inputs are LOW.',
    check: {
      kind: 'combinational',
      inputs: ['D0', 'D1'],
      outputs: ['R8', 'R9'],
      rows: rowsFrom(2, ([a, b]) => [
        (a && b ? 0 : 1) as 0 | 1,
        (a || b ? 0 : 1) as 0 | 1,
      ]),
    },
    tips: ['Wiring the 7402 as if it were a 7400 is the single most common mistake in this experiment.'],
  },
  {
    id: 'exp03',
    number: 3,
    title: 'Verify XOR and XNOR gates',
    objective:
      'Verify the exclusive-OR gate and build an exclusive-NOR from it, confirming both truth tables.',
    theory:
      'XOR outputs 1 when its inputs differ - it is the "not equal" gate, and the sum bit of a half adder. Inverting it gives XNOR, the equality or comparator gate.',
    parts: [
      { type: 'ic:7486', qty: 1, note: 'Quad 2-input XOR' },
      { type: 'ic:7404', qty: 1, note: 'Hex inverter, to make the XNOR' },
    ],
    requirements: [
      'Power both packages.',
      'Take the XOR output to R8 and also into an inverter; the inverter output is the XNOR and goes to R9.',
    ],
    pinConfig: [
      'D0 to 7486 pin 1, D1 to 7486 pin 2.',
      '7486 pin 3 to R8, and the same pin 3 to 7404 pin 1.',
      '7404 pin 2 to R9 (XNOR output).',
      POWER_NOTE,
    ],
    procedure: [
      'Place and power the 7486 and the 7404.',
      'Wire the XOR inputs to D0 and D1.',
      'Take pin 3 to R8 and to the inverter input - one output pin may feed several inputs.',
      'Step through the four combinations and record both outputs.',
    ],
    truthTable: tableFrom(
      ['D0 (A)', 'D1 (B)', 'R8 = A⊕B', 'R9 = (A⊕B)̅'],
      2,
      ([a, b]) => [(a !== b ? 1 : 0), (a !== b ? 0 : 1)],
    ),
    expected: 'R8 is HIGH when the inputs differ; R9 is HIGH when they are the same.',
    check: {
      kind: 'combinational',
      inputs: ['D0', 'D1'],
      outputs: ['R8', 'R9'],
      rows: rowsFrom(2, ([a, b]) => [
        (a !== b ? 1 : 0) as 0 | 1,
        (a !== b ? 0 : 1) as 0 | 1,
      ]),
    },
    tips: ['R8 and R9 must always be opposites. If they ever agree, one of the two wires is on the wrong pin.'],
  },
  {
    id: 'exp04',
    number: 4,
    title: 'Implement the basic gates using NAND gates only',
    objective:
      'Build NOT, AND and OR using nothing but 7400 NAND gates, proving that NAND is a universal gate.',
    theory:
      'Tie the two inputs of a NAND together and it inverts. Follow a NAND with an inverter and you get AND. Invert both inputs before a NAND and, by De Morgan, you get OR: (A̅ . B̅)̅ = A + B.',
    parts: [{ type: 'ic:7400', qty: 2, note: 'Two packages: eight NAND gates in total' }],
    requirements: [
      'Power both 7400 packages.',
      'NOT: one NAND with both inputs joined to D0.',
      'AND: a NAND on D0, D1 followed by a second NAND wired as an inverter.',
      'OR: invert D0 and D1 separately, then feed both inverted signals into a third NAND.',
    ],
    pinConfig: [
      'NOT: D0 to pins 1 and 2 of the first 7400; pin 3 to R8.',
      'AND: D0 to pin 4, D1 to pin 5; pin 6 to pins 9 and 10; pin 8 to R9.',
      'OR: D0 to pins 12 and 13 of the first package, D1 to pins 1 and 2 of the second package.',
      'Take pin 11 (first package) and pin 3 (second package) into pins 4 and 5 of the second package; pin 6 to R10.',
      POWER_NOTE,
    ],
    procedure: [
      'Place two 7400 packages and power both.',
      'Build the inverter first and confirm it on R8 before going further.',
      'Add the AND, then the OR.',
      'Verify all three outputs against the truth table.',
    ],
    truthTable: tableFrom(
      ['D0 (A)', 'D1 (B)', 'R8 = A̅', 'R9 = A.B', 'R10 = A+B'],
      2,
      ([a, b]) => [(a ? 0 : 1), (a && b ? 1 : 0), (a || b ? 1 : 0)],
    ),
    expected:
      'R8 follows the inverse of D0, R9 behaves as a genuine AND gate and R10 as a genuine OR gate - all made from NAND gates only.',
    check: {
      kind: 'combinational',
      inputs: ['D0', 'D1'],
      outputs: ['R8', 'R9', 'R10'],
      rows: rowsFrom(2, ([a, b]) => [
        (a ? 0 : 1) as 0 | 1,
        (a && b ? 1 : 0) as 0 | 1,
        (a || b ? 1 : 0) as 0 | 1,
      ]),
    },
    tips: [
      'A NAND with both inputs tied together is the cheapest inverter there is.',
      'Build and test one function at a time - debugging all three at once is painful.',
    ],
  },
  {
    id: 'exp05',
    number: 5,
    title: 'Implement the basic gates using NOR gates only',
    objective: 'Build NOT, OR and AND from 7402 NOR gates alone.',
    theory:
      'A NOR with its inputs joined inverts. NOR followed by an inverter gives OR. Inverting both inputs before a NOR gives AND, since (A̅ + B̅)̅ = A . B.',
    parts: [{ type: 'ic:7402', qty: 2, note: 'Two packages: eight NOR gates in total' }],
    requirements: [
      'Power both 7402 packages.',
      'Remember the 7402 layout: output first, then the two inputs.',
      'NOT: one NOR with both inputs joined.',
      'OR: NOR followed by an inverting NOR.',
      'AND: invert both inputs, then NOR them together.',
    ],
    pinConfig: [
      'NOT: D0 to pins 2 and 3 of the first 7402; pin 1 to R8.',
      'OR: D0 to pin 5, D1 to pin 6; pin 4 to pins 8 and 9; pin 10 to R9.',
      'AND: D0 to pins 11 and 12 (first package), D1 to pins 2 and 3 (second package).',
      'Take pin 13 (first package) and pin 1 (second package) into pins 5 and 6 of the second package; pin 4 to R10.',
      POWER_NOTE,
    ],
    procedure: [
      'Place two 7402 packages and power both.',
      'Build the inverter, then the OR, then the AND.',
      'Check each output as you go.',
    ],
    truthTable: tableFrom(
      ['D0 (A)', 'D1 (B)', 'R8 = A̅', 'R9 = A+B', 'R10 = A.B'],
      2,
      ([a, b]) => [(a ? 0 : 1), (a || b ? 1 : 0), (a && b ? 1 : 0)],
    ),
    expected: 'The NOR network reproduces NOT, OR and AND exactly.',
    check: {
      kind: 'combinational',
      inputs: ['D0', 'D1'],
      outputs: ['R8', 'R9', 'R10'],
      rows: rowsFrom(2, ([a, b]) => [
        (a ? 0 : 1) as 0 | 1,
        (a || b ? 1 : 0) as 0 | 1,
        (a && b ? 1 : 0) as 0 | 1,
      ]),
    },
    tips: ['Compare this with experiment 4: NAND and NOR are mirror images of each other under De Morgan.'],
  },
  {
    id: 'exp06',
    number: 6,
    title: 'Half adder',
    objective: 'Build a half adder from an XOR and an AND gate and verify its sum and carry.',
    theory:
      'A half adder adds two bits: SUM = A ⊕ B and CARRY = A . B. It is "half" because it has nowhere to accept a carry coming in from a lower stage.',
    parts: [
      { type: 'ic:7486', qty: 1, note: 'XOR for the sum' },
      { type: 'ic:7408', qty: 1, note: 'AND for the carry' },
    ],
    requirements: [
      'Power both packages.',
      'Feed the same two inputs into both the XOR and the AND gate.',
    ],
    pinConfig: [
      'D0 to 7486 pin 1 and 7408 pin 1.',
      'D1 to 7486 pin 2 and 7408 pin 2.',
      '7486 pin 3 to R8 (SUM).',
      '7408 pin 3 to R9 (CARRY).',
      POWER_NOTE,
    ],
    procedure: [
      'Place and power the 7486 and the 7408.',
      'Wire D0 and D1 to both gates - one writer channel can feed several inputs.',
      'Bring SUM to R8 and CARRY to R9.',
      'Verify all four combinations.',
    ],
    truthTable: tableFrom(
      ['D0 (A)', 'D1 (B)', 'R8 (SUM)', 'R9 (CARRY)'],
      2,
      ([a, b]) => [(a !== b ? 1 : 0), (a && b ? 1 : 0)],
    ),
    expected: '1 + 1 gives SUM = 0 with CARRY = 1, which is binary 10.',
    check: {
      kind: 'combinational',
      inputs: ['D0', 'D1'],
      outputs: ['R8', 'R9'],
      rows: rowsFrom(2, ([a, b]) => [
        (a !== b ? 1 : 0) as 0 | 1,
        (a && b ? 1 : 0) as 0 | 1,
      ]),
    },
  },
  {
    id: 'exp07',
    number: 7,
    title: 'Full adder',
    objective:
      'Build a full adder from two half adders and an OR gate, and verify it over all eight input combinations.',
    theory:
      'A full adder adds three bits: A, B and a carry in. SUM = A ⊕ B ⊕ Cin, and COUT = A.B + Cin.(A ⊕ B). Chain n of them and you have an n-bit adder.',
    parts: [
      { type: 'ic:7486', qty: 1, note: 'Two XOR gates' },
      { type: 'ic:7408', qty: 1, note: 'Two AND gates' },
      { type: 'ic:7432', qty: 1, note: 'One OR gate' },
    ],
    requirements: [
      'Power all three packages.',
      'First half adder: D0 and D1.',
      'Second half adder: the first sum and D2 (the carry in).',
      'OR the two carry terms together for the final carry out.',
    ],
    pinConfig: [
      'D0 to 7486 pin 1 and 7408 pin 1; D1 to 7486 pin 2 and 7408 pin 2.',
      '7486 pin 3 (first sum) to 7486 pin 4 and to 7408 pin 4.',
      'D2 (carry in) to 7486 pin 5 and 7408 pin 5.',
      '7486 pin 6 to R8 (SUM).',
      '7408 pin 3 and 7408 pin 6 to 7432 pins 1 and 2; 7432 pin 3 to R9 (CARRY OUT).',
      POWER_NOTE,
    ],
    procedure: [
      'Build and test the first half adder on its own.',
      'Add the second half adder driven by the first sum and the carry in.',
      'OR the two carry outputs and bring the result to R9.',
      'Verify all eight combinations.',
    ],
    truthTable: tableFrom(
      ['D0 (A)', 'D1 (B)', 'D2 (Cin)', 'R8 (SUM)', 'R9 (COUT)'],
      3,
      ([a, b, c]) => [
        ((a ^ b ^ c) as 0 | 1),
        ((a + b + c >= 2 ? 1 : 0) as 0 | 1),
      ],
    ),
    expected: 'SUM is the parity of the three inputs; COUT is HIGH when two or more inputs are HIGH.',
    check: {
      kind: 'combinational',
      inputs: ['D0', 'D1', 'D2'],
      outputs: ['R8', 'R9'],
      rows: rowsFrom(3, ([a, b, c]) => [
        ((a ^ b ^ c) as 0 | 1),
        ((a + b + c >= 2 ? 1 : 0) as 0 | 1),
      ]),
    },
    tips: ['The carry out is a majority vote: it is 1 whenever at least two of the three inputs are 1.'],
  },
  {
    id: 'exp08',
    number: 8,
    title: 'Half subtractor',
    objective: 'Build a half subtractor and verify its difference and borrow outputs.',
    theory:
      'A half subtractor computes A − B for single bits: DIFFERENCE = A ⊕ B and BORROW = A̅ . B. The borrow is 1 only when you take 1 away from 0.',
    parts: [
      { type: 'ic:7486', qty: 1, note: 'XOR for the difference' },
      { type: 'ic:7404', qty: 1, note: 'Inverter for A' },
      { type: 'ic:7408', qty: 1, note: 'AND for the borrow' },
    ],
    requirements: [
      'Power all three packages.',
      'The borrow needs A inverted before the AND gate - that is the only difference from a half adder.',
    ],
    pinConfig: [
      'D0 (A) to 7486 pin 1 and 7404 pin 1.',
      'D1 (B) to 7486 pin 2 and 7408 pin 2.',
      '7404 pin 2 (A inverted) to 7408 pin 1.',
      '7486 pin 3 to R8 (DIFFERENCE), 7408 pin 3 to R9 (BORROW).',
      POWER_NOTE,
    ],
    procedure: [
      'Place and power the three packages.',
      'Wire the XOR for the difference first and check it.',
      'Add the inverter and the AND gate for the borrow.',
      'Verify all four combinations.',
    ],
    truthTable: tableFrom(
      ['D0 (A)', 'D1 (B)', 'R8 (DIFF)', 'R9 (BORROW)'],
      2,
      ([a, b]) => [(a !== b ? 1 : 0), (!a && b ? 1 : 0)],
    ),
    expected: 'Only 0 − 1 produces a borrow.',
    check: {
      kind: 'combinational',
      inputs: ['D0', 'D1'],
      outputs: ['R8', 'R9'],
      rows: rowsFrom(2, ([a, b]) => [
        (a !== b ? 1 : 0) as 0 | 1,
        (!a && b ? 1 : 0) as 0 | 1,
      ]),
    },
    tips: ['Compare with the half adder: same difference/sum output, but the carry becomes a borrow with A inverted.'],
  },
  {
    id: 'exp09',
    number: 9,
    title: 'Full subtractor',
    objective: 'Build a full subtractor that also accepts a borrow in, and verify all eight rows.',
    theory:
      'DIFFERENCE = A ⊕ B ⊕ Bin. BORROW OUT = A̅.B + A̅.Bin + B.Bin - the borrow propagates whenever the bits you are subtracting are larger than what you have.',
    parts: [
      { type: 'ic:7486', qty: 1 },
      { type: 'ic:7404', qty: 1 },
      { type: 'ic:7408', qty: 1 },
      { type: 'ic:7432', qty: 1 },
    ],
    requirements: [
      'Power all four packages.',
      'Difference: XOR all three inputs together with two XOR gates.',
      'Borrow: AND terms for A̅.B and A̅.Bin and B.Bin, then OR them.',
    ],
    pinConfig: [
      'D0 = A, D1 = B, D2 = Borrow in.',
      'First XOR: D0 and D1 into 7486 pins 1, 2; output pin 3.',
      'Second XOR: pin 3 and D2 into 7486 pins 4, 5; pin 6 to R8 (DIFFERENCE).',
      'Invert A with the 7404 and use it for the two AND terms that need A̅.',
      'OR the three AND outputs together; the result goes to R9 (BORROW OUT).',
      POWER_NOTE,
    ],
    procedure: [
      'Build the difference path first and verify it is the parity of the three inputs.',
      'Build each borrow term separately and check it before ORing them.',
      'Verify the complete table.',
    ],
    truthTable: tableFrom(
      ['D0 (A)', 'D1 (B)', 'D2 (Bin)', 'R8 (DIFF)', 'R9 (BOUT)'],
      3,
      ([a, b, c]) => [
        ((a ^ b ^ c) as 0 | 1),
        (((!a && b) || (!a && c) || (b && c) ? 1 : 0) as 0 | 1),
      ],
    ),
    expected: 'The borrow out is HIGH for A B Bin = 001, 010, 011 and 111.',
    check: {
      kind: 'combinational',
      inputs: ['D0', 'D1', 'D2'],
      outputs: ['R8', 'R9'],
      rows: rowsFrom(3, ([a, b, c]) => [
        ((a ^ b ^ c) as 0 | 1),
        (((!a && b) || (!a && c) || (b && c) ? 1 : 0) as 0 | 1),
      ]),
    },
  },
  {
    id: 'exp10',
    number: 10,
    title: '4-bit binary adder',
    objective: 'Add two 4-bit numbers with a 7483 and read the 5-bit result.',
    theory:
      'The 7483 contains four full adders with look-ahead carry, so all four sum bits appear after roughly one gate delay rather than rippling. The fifth output bit is the carry out.',
    parts: [{ type: 'ic:7483', qty: 1, note: 'VCC is pin 5 and GND is pin 12 on this package' }],
    requirements: [
      'Power the package - pin 5 to VCC and pin 12 to GND, NOT the corner pins.',
      'Tie the carry in (pin 13) to GND for plain addition.',
      'Drive A1..A4 from D0..D3 and B1..B4 from D4..D7.',
    ],
    pinConfig: [
      'A1 = pin 10, A2 = pin 8, A3 = pin 3, A4 = pin 1 from D0, D1, D2, D3.',
      'B1 = pin 11, B2 = pin 7, B3 = pin 4, B4 = pin 16 from D4, D5, D6, D7.',
      'C0 = pin 13 to GND.',
      'Σ1 = pin 9 to R8, Σ2 = pin 6 to R9, Σ3 = pin 2 to R10, Σ4 = pin 15 to R11, C4 = pin 14 to R12.',
    ],
    procedure: [
      'Place the 7483 and connect pin 5 to VCC and pin 12 to GND.',
      'Tie the carry in LOW.',
      'Wire both 4-bit operands and all five outputs.',
      'Try 3 + 5, 9 + 6 and 15 + 15, and check the result each time.',
    ],
    truthTable: {
      headers: ['A', 'B', 'R11 R10 R9 R8 (sum)', 'R12 (carry)'],
      rows: [
        ['0000', '0000', '0000', '0'],
        ['0011', '0101', '1000', '0'],
        ['1001', '0110', '1111', '0'],
        ['1111', '0001', '0000', '1'],
        ['1111', '1111', '1110', '1'],
      ],
      note: 'The five outputs together form the 5-bit sum, R12 being the most significant bit.',
    },
    expected: 'The value on R12..R8 always equals A + B.',
    check: {
      kind: 'combinational',
      inputs: ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'],
      outputs: ['R8', 'R9', 'R10', 'R11', 'R12'],
      rows: [
        [0, 0, 1, 1].concat([0, 0, 0, 0]).concat([1, 1, 0, 0, 0]) as (0 | 1)[],
        [1, 1, 0, 0].concat([1, 0, 1, 0]).concat([0, 1, 0, 1, 0]) as (0 | 1)[],
        [1, 0, 0, 1].concat([0, 1, 1, 0]).concat([1, 1, 1, 1, 0]) as (0 | 1)[],
        [1, 1, 1, 1].concat([1, 0, 0, 0]).concat([0, 0, 0, 0, 1]) as (0 | 1)[],
        [1, 1, 1, 1].concat([1, 1, 1, 1]).concat([0, 1, 1, 1, 1]) as (0 | 1)[],
        [0, 0, 0, 0].concat([0, 0, 0, 0]).concat([0, 0, 0, 0, 0]) as (0 | 1)[],
      ],
    },
    tips: [
      'D0 is the least significant bit of A: the writer channels read left to right as A1, A2, A3, A4.',
      'If every sum bit is X, check pin 5 and pin 12 - this package does not use the corner pins for power.',
    ],
  },
  {
    id: 'exp11',
    number: 11,
    title: 'Multiplexer',
    objective: 'Use a 74151 to select one of eight data inputs and confirm the addressing.',
    theory:
      'A multiplexer is an electronic rotary switch: the binary address on C, B, A picks which data input reaches the output. It is how one wire carries many signals in turn.',
    parts: [{ type: 'ic:74151', qty: 1, note: '8-to-1 multiplexer' }],
    requirements: [
      'Power the package and tie the strobe (pin 7) LOW so the chip is enabled.',
      'Wire the eight data inputs to a fixed pattern: D0, D2, D4, D6 to VCC and D1, D3, D5, D7 to GND.',
      'Drive the address lines A, B, C from writer channels D0, D1, D2.',
    ],
    pinConfig: [
      'Address: A = pin 11 from D0, B = pin 10 from D1, C = pin 9 from D2.',
      'Strobe G = pin 7 to GND.',
      'Data: pin 4 (D0), pin 2 (D2), pin 15 (D4), pin 13 (D6) to VCC.',
      'Data: pin 3 (D1), pin 1 (D3), pin 14 (D5), pin 12 (D7) to GND.',
      'Output Y = pin 5 to R8; complement W = pin 6 to R9.',
    ],
    procedure: [
      'Place and power the 74151, then tie the strobe LOW.',
      'Set up the alternating data pattern with VCC and GND wires.',
      'Step the address from 000 to 111 and record Y.',
      'Confirm that Y follows the data input the address points at.',
    ],
    truthTable: {
      headers: ['D2 (C)', 'D1 (B)', 'D0 (A)', 'Selected input', 'R8 (Y)', 'R9 (W)'],
      rows: [
        ['0', '0', '0', 'D0 = 1', '1', '0'],
        ['0', '0', '1', 'D1 = 0', '0', '1'],
        ['0', '1', '0', 'D2 = 1', '1', '0'],
        ['0', '1', '1', 'D3 = 0', '0', '1'],
        ['1', '0', '0', 'D4 = 1', '1', '0'],
        ['1', '0', '1', 'D5 = 0', '0', '1'],
        ['1', '1', '0', 'D6 = 1', '1', '0'],
        ['1', '1', '1', 'D7 = 0', '0', '1'],
      ],
    },
    expected: 'Y is HIGH for every even address and LOW for every odd one, and W is always its complement.',
    check: {
      kind: 'combinational',
      inputs: ['D0', 'D1', 'D2'],
      outputs: ['R8', 'R9'],
      // D0 is address bit A (the LSB), so Y is simply the inverse of A here.
      rows: rowsFrom(3, ([a]) => [(a ? 0 : 1) as 0 | 1, (a ? 1 : 0) as 0 | 1]),
    },
    tips: ['Leave the strobe floating and every output goes undefined - the chip has no idea whether it is enabled.'],
  },
  {
    id: 'exp12',
    number: 12,
    title: 'Demultiplexer',
    objective: 'Use a 74138 as a 1-to-8 demultiplexer / decoder and watch one output go LOW at a time.',
    theory:
      'A demultiplexer is a multiplexer run backwards: the address chooses which of the eight outputs the data reaches. With the data input held active, the same chip is a 3-to-8 decoder.',
    parts: [{ type: 'ic:74138', qty: 1, note: '3-to-8 decoder / demultiplexer' }],
    requirements: [
      'Power the package.',
      'Enable it: G1 (pin 6) to VCC, G2A (pin 4) and G2B (pin 5) to GND.',
      'Drive the address A, B, C from D0, D1, D2 and bring all eight outputs to R8..R15.',
    ],
    pinConfig: [
      'A = pin 1 from D0, B = pin 2 from D1, C = pin 3 from D2.',
      'G1 = pin 6 to VCC; G2A = pin 4 and G2B = pin 5 to GND.',
      'Y0 = pin 15 to R8, Y1 = pin 14 to R9, Y2 = pin 13 to R10, Y3 = pin 12 to R11.',
      'Y4 = pin 11 to R12, Y5 = pin 10 to R13, Y6 = pin 9 to R14, Y7 = pin 7 to R15.',
    ],
    procedure: [
      'Place and power the 74138 and set up the three enable pins.',
      'Wire the address inputs and all eight outputs.',
      'Step the address through 0 to 7 and note which reader channel goes LOW.',
    ],
    truthTable: {
      headers: ['D2 (C)', 'D1 (B)', 'D0 (A)', 'LOW output'],
      rows: [
        ['0', '0', '0', 'R8  (Y0)'],
        ['0', '0', '1', 'R9  (Y1)'],
        ['0', '1', '0', 'R10 (Y2)'],
        ['0', '1', '1', 'R11 (Y3)'],
        ['1', '0', '0', 'R12 (Y4)'],
        ['1', '0', '1', 'R13 (Y5)'],
        ['1', '1', '0', 'R14 (Y6)'],
        ['1', '1', '1', 'R15 (Y7)'],
      ],
      note: 'Outputs are active LOW: the addressed one is 0 and all the others are 1.',
    },
    expected: 'Exactly one reader channel is LOW at any time, and it steps along as the address increases.',
    check: {
      kind: 'combinational',
      inputs: ['D0', 'D1', 'D2'],
      outputs: ['R8', 'R9', 'R10', 'R11', 'R12', 'R13', 'R14', 'R15'],
      rows: rowsFrom(3, ([a, b, c]) => {
        const addr = (c << 2) | (b << 1) | a;
        return Array.from({ length: 8 }, (_, i) => (i === addr ? 0 : 1)) as (0 | 1)[];
      }),
    },
  },
  {
    id: 'exp13',
    number: 13,
    title: 'Encoder',
    objective:
      'Use a 74148 priority encoder to turn eight input lines into a 3-bit code, and see priority resolve two simultaneous inputs.',
    theory:
      'An encoder is the opposite of a decoder. A priority encoder also settles the ambiguity of several inputs being active at once by reporting only the highest-numbered one.',
    parts: [{ type: 'ic:74148', qty: 1, note: '8-to-3 priority encoder, active-LOW in and out' }],
    requirements: [
      'Power the package and tie EI (pin 5) LOW to enable it.',
      'Drive I0..I7 from D0..D7. Remember the inputs are active LOW, so a channel set to 0 is the "pressed" one.',
      'Bring A0, A1, A2 and GS to the reader.',
    ],
    pinConfig: [
      'I0 = pin 10, I1 = pin 11, I2 = pin 12, I3 = pin 13 from D0..D3.',
      'I4 = pin 1, I5 = pin 2, I6 = pin 3, I7 = pin 4 from D4..D7.',
      'EI = pin 5 to GND.',
      'A0 = pin 9 to R8, A1 = pin 7 to R9, A2 = pin 6 to R10, GS = pin 14 to R11.',
    ],
    procedure: [
      'Place and power the 74148 and tie EI LOW.',
      'Set all eight writer channels HIGH (no input active) and note that GS stays HIGH.',
      'Pull one channel LOW at a time and read the code on R10 R9 R8.',
      'Now pull two channels LOW together and confirm the higher one wins.',
    ],
    truthTable: {
      headers: ['Active input', 'R10 (A2)', 'R9 (A1)', 'R8 (A0)', 'R11 (GS)'],
      rows: [
        ['none', '1', '1', '1', '1'],
        ['I0', '1', '1', '1', '0'],
        ['I1', '1', '1', '0', '0'],
        ['I2', '1', '0', '1', '0'],
        ['I3', '1', '0', '0', '0'],
        ['I4', '0', '1', '1', '0'],
        ['I5', '0', '1', '0', '0'],
        ['I6', '0', '0', '1', '0'],
        ['I7', '0', '0', '0', '0'],
      ],
      note: 'The code is the COMPLEMENT of the input number, because the outputs are active LOW.',
    },
    expected:
      'The code on A2 A1 A0 is the inverted binary number of the highest active input, and GS is LOW whenever any input is active.',
    check: {
      kind: 'combinational',
      inputs: ['D0', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'],
      outputs: ['R8', 'R9', 'R10', 'R11'],
      rows: (() => {
        const out: (0 | 1)[][] = [];
        for (let n = 0; n < 8; n++) {
          const ins = Array.from({ length: 8 }, (_, i) => (i === n ? 0 : 1)) as (0 | 1)[];
          const code = [0, 1, 2].map((b) => (((n >> b) & 1) ^ 1) as 0 | 1);
          out.push([...ins, ...code, 0]);
        }
        // Two inputs active at once: I5 must win over I2.
        const both = [1, 1, 0, 1, 1, 0, 1, 1] as (0 | 1)[];
        out.push([...both, 0, 1, 0, 0]);
        out.push([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]);
        return out;
      })(),
    },
    tips: ['Set a channel to 0 to "press" that input - every line on this chip is active LOW.'],
  },
  {
    id: 'exp14',
    number: 14,
    title: 'Decoder',
    objective: 'Use one half of a 74139 as a 2-to-4 decoder and verify one-of-four selection.',
    theory:
      'A decoder turns an n-bit code into one active line out of 2^n. Address decoding in every memory system is built from exactly this.',
    parts: [{ type: 'ic:74139', qty: 1, note: 'Dual 2-to-4 decoder' }],
    requirements: [
      'Power the package.',
      'Enable the first half: 1G (pin 1) to GND.',
      'Drive 1A and 1B from D0 and D1, and read the four outputs.',
    ],
    pinConfig: [
      '1G = pin 1 to GND.',
      '1A = pin 2 from D0 (LSB), 1B = pin 3 from D1 (MSB).',
      '1Y0 = pin 4 to R8, 1Y1 = pin 5 to R9, 1Y2 = pin 6 to R10, 1Y3 = pin 7 to R11.',
    ],
    procedure: [
      'Place and power the 74139 and tie 1G LOW.',
      'Wire the two address inputs and the four outputs.',
      'Step through the four addresses and record which output is LOW.',
      'Take 1G HIGH and confirm that all four outputs go HIGH.',
    ],
    truthTable: {
      headers: ['D1 (B)', 'D0 (A)', 'R8 (Y0)', 'R9 (Y1)', 'R10 (Y2)', 'R11 (Y3)'],
      rows: [
        ['0', '0', '0', '1', '1', '1'],
        ['0', '1', '1', '0', '1', '1'],
        ['1', '0', '1', '1', '0', '1'],
        ['1', '1', '1', '1', '1', '0'],
      ],
      note: 'Outputs are active LOW.',
    },
    expected: 'Exactly one of R8..R11 is LOW for each address.',
    check: {
      kind: 'combinational',
      inputs: ['D0', 'D1'],
      outputs: ['R8', 'R9', 'R10', 'R11'],
      rows: rowsFrom(2, ([a, b]) => {
        const addr = (b << 1) | a;
        return Array.from({ length: 4 }, (_, i) => (i === addr ? 0 : 1)) as (0 | 1)[];
      }),
    },
  },
  {
    id: 'exp15',
    number: 15,
    title: 'SR flip-flop (NAND latch)',
    objective:
      'Build an SR latch from two cross-coupled NAND gates and show that it remembers after the inputs go inactive.',
    theory:
      'Feed the output of each NAND back into an input of the other and you get a bistable circuit: the pair has two stable states and stays in whichever one you put it. This is the memory element every flip-flop is built on. With NAND gates the inputs are active LOW, so they are labelled S and R with bars.',
    parts: [{ type: 'ic:7400', qty: 1, note: 'Two of the four NAND gates' }],
    requirements: [
      'Power the package.',
      'Cross-couple gate 1 and gate 2: each output goes to an input of the other.',
      'Drive S and R from D0 and D1 and read Q and Q-bar.',
    ],
    pinConfig: [
      'D0 (S, active LOW) to pin 1; D1 (R, active LOW) to pin 4.',
      'Cross-couple: pin 3 to pin 5, and pin 6 to pin 2.',
      'Q = pin 3 to R8; Q-bar = pin 6 to R9.',
    ],
    procedure: [
      'Place and power the 7400.',
      'Wire both cross-coupling wires before anything else - without them the circuit has no memory.',
      'Set S LOW with R HIGH: Q goes HIGH.',
      'Take both inputs HIGH: Q must stay HIGH - that is the latch remembering.',
      'Set R LOW with S HIGH: Q goes LOW, and again it holds when both go HIGH.',
      'Finally take both LOW at once and note that Q and Q-bar are both HIGH: the forbidden state.',
    ],
    truthTable: {
      headers: ['D0 (S̅)', 'D1 (R̅)', 'R8 (Q)', 'R9 (Q̅)', 'Action'],
      rows: [
        ['0', '1', '1', '0', 'Set'],
        ['1', '0', '0', '1', 'Reset'],
        ['1', '1', 'Q', 'Q̅', 'Hold - the latch remembers'],
        ['0', '0', '1', '1', 'Forbidden: both outputs HIGH'],
      ],
    },
    expected:
      'With both inputs HIGH the outputs keep whatever value the last active input left behind.',
    check: {
      kind: 'sequential',
      inputs: ['D0', 'D1'],
      outputs: ['R8', 'R9'],
      steps: [
        { set: { D0: 1, D1: 1 }, note: 'Both inputs inactive to start.' },
        { set: { D0: 0, D1: 1 }, expect: { R8: 1, R9: 0 }, note: 'S LOW sets the latch.' },
        { set: { D0: 1, D1: 1 }, expect: { R8: 1, R9: 0 }, note: 'Both inactive: Q must HOLD at 1.' },
        { set: { D0: 1, D1: 0 }, expect: { R8: 0, R9: 1 }, note: 'R LOW resets the latch.' },
        { set: { D0: 1, D1: 1 }, expect: { R8: 0, R9: 1 }, note: 'Both inactive: Q must HOLD at 0.' },
      ],
    },
    tips: [
      'If Q shows X before you have touched anything, that is honest: a real latch powers up in an unpredictable state. Set or reset it once and it becomes definite.',
    ],
  },
  {
    id: 'exp16',
    number: 16,
    title: 'JK flip-flop',
    objective: 'Verify all four modes of a 7476 JK flip-flop: hold, set, reset and toggle.',
    theory:
      'The JK flip-flop removes the forbidden state of the SR latch by making the "both inputs active" case toggle instead. With J = K = 1 it divides the clock frequency by two, which is what makes counters possible.',
    parts: [{ type: 'ic:7476', qty: 1, note: 'VCC is pin 5 and GND is pin 13 on this package' }],
    requirements: [
      'Power the package - pin 5 to VCC and pin 13 to GND.',
      'Tie PRE (pin 2) and CLR (pin 3) HIGH so they do not interfere.',
      'Drive J, K and the clock from D0, D1 and D2.',
    ],
    pinConfig: [
      'J = pin 4 from D0, K = pin 16 from D1, CLK = pin 1 from D2.',
      'PRE = pin 2 and CLR = pin 3 to VCC.',
      'Q = pin 15 to R8, Q-bar = pin 14 to R9.',
    ],
    procedure: [
      'Place the 7476 and connect pin 5 to VCC and pin 13 to GND.',
      'Tie PRE and CLR HIGH.',
      'Set J = 1, K = 0 and clock once: Q goes HIGH.',
      'Set J = 0, K = 0 and clock: Q holds.',
      'Set J = 0, K = 1 and clock: Q goes LOW.',
      'Set J = K = 1 and clock repeatedly: Q toggles on every clock.',
    ],
    truthTable: {
      headers: ['J', 'K', 'Q after the clock'],
      rows: [
        ['0', '0', 'Q (hold)'],
        ['0', '1', '0 (reset)'],
        ['1', '0', '1 (set)'],
        ['1', '1', 'Q̅ (toggle)'],
      ],
      note: 'The 74LS76 acts on the falling edge of the clock.',
    },
    expected: 'With J = K = 1 the output changes state on every clock pulse, so Q runs at half the clock frequency.',
    check: {
      kind: 'sequential',
      inputs: ['D0', 'D1', 'D2'],
      outputs: ['R8', 'R9'],
      steps: [
        { set: { D0: 0, D1: 1, D2: 0 }, pulse: 'D2', expect: { R8: 0 }, note: 'Reset to a known state.' },
        { set: { D0: 1, D1: 0 }, pulse: 'D2', expect: { R8: 1, R9: 0 }, note: 'J = 1, K = 0 sets Q.' },
        { set: { D0: 0, D1: 0 }, pulse: 'D2', expect: { R8: 1 }, note: 'J = K = 0 holds.' },
        { set: { D0: 0, D1: 1 }, pulse: 'D2', expect: { R8: 0, R9: 1 }, note: 'J = 0, K = 1 resets.' },
        { set: { D0: 1, D1: 1 }, pulse: 'D2', expect: { R8: 1 }, note: 'J = K = 1 toggles to 1.' },
        { pulse: 'D2', expect: { R8: 0 }, note: 'And toggles back to 0.' },
        { pulse: 'D2', expect: { R8: 1 }, note: 'And again - a divide-by-two.' },
      ],
    },
    tips: ['Watch the power pins: putting VCC on pin 16 of a 7476 is a classic and expensive mistake.'],
  },
  {
    id: 'exp17',
    number: 17,
    title: 'D flip-flop',
    objective: 'Verify that a 7474 transfers D to Q on the rising clock edge and holds between edges.',
    theory:
      'The D flip-flop is the simplest useful memory cell: whatever is on D at the moment of the clock edge is what Q becomes, and nothing that happens to D between edges matters. Registers and shift registers are rows of these.',
    parts: [{ type: 'ic:7474', qty: 1, note: 'Dual D flip-flop' }],
    requirements: [
      'Power the package.',
      'Tie PRE (pin 4) and CLR (pin 1) HIGH - leave either floating and the output is undefined.',
      'Drive D and the clock from D0 and D1.',
    ],
    pinConfig: [
      'D = pin 2 from D0, CLK = pin 3 from D1.',
      'CLR = pin 1 and PRE = pin 4 to VCC.',
      'Q = pin 5 to R8, Q-bar = pin 6 to R9.',
    ],
    procedure: [
      'Place and power the 7474 and tie PRE and CLR HIGH.',
      'Set D = 1 with the clock LOW, then take the clock HIGH: Q follows D.',
      'Change D with the clock HIGH and confirm Q does not move.',
      'Return the clock LOW and clock again to load the new value.',
    ],
    truthTable: {
      headers: ['CLK', 'D', 'Q', 'Q̅'],
      rows: [
        ['↑', '0', '0', '1'],
        ['↑', '1', '1', '0'],
        ['0 or 1', 'X', 'hold', 'hold'],
      ],
      note: 'PRE and CLR are active LOW and override the clock completely.',
    },
    expected: 'Q changes only on the LOW-to-HIGH transition of the clock.',
    check: {
      kind: 'sequential',
      inputs: ['D0', 'D1'],
      outputs: ['R8', 'R9'],
      steps: [
        { set: { D0: 0, D1: 0 }, pulse: 'D1', expect: { R8: 0, R9: 1 }, note: 'Clock a 0 into the flip-flop.' },
        { set: { D0: 1 }, expect: { R8: 0 }, note: 'D changes but there is no clock edge: Q must not move.' },
        { pulse: 'D1', expect: { R8: 1, R9: 0 }, note: 'Now clock: Q takes the 1.' },
        { set: { D0: 0 }, expect: { R8: 1 }, note: 'Again D changes with no edge: Q holds.' },
        { pulse: 'D1', expect: { R8: 0, R9: 1 }, note: 'Clock the 0 in.' },
      ],
    },
  },
  {
    id: 'exp18',
    number: 18,
    title: 'T flip-flop',
    objective: 'Turn a JK flip-flop into a T (toggle) flip-flop and confirm it divides the clock by two.',
    theory:
      'Join J and K together and you have a T flip-flop: T = 1 toggles on each clock, T = 0 holds. A chain of toggling flip-flops is a binary ripple counter.',
    parts: [{ type: 'ic:7476', qty: 1, note: 'JK flip-flop wired as a T type' }],
    requirements: [
      'Power the package - pin 5 to VCC, pin 13 to GND.',
      'Join J (pin 4) and K (pin 16) together and drive both from one writer channel: that is T.',
      'Tie PRE and CLR HIGH.',
    ],
    pinConfig: [
      'D0 (T) to pin 4 AND pin 16 - one channel feeding both inputs.',
      'CLK = pin 1 from D1.',
      'PRE = pin 2 and CLR = pin 3 to VCC.',
      'Q = pin 15 to R8, Q-bar = pin 14 to R9.',
    ],
    procedure: [
      'Place and power the 7476 with the correct power pins.',
      'Wire T to both J and K.',
      'With T = 0, clock several times and confirm Q never changes.',
      'With T = 1, clock several times and confirm Q changes on every pulse.',
    ],
    truthTable: {
      headers: ['T', 'Q after the clock'],
      rows: [
        ['0', 'Q (hold)'],
        ['1', 'Q̅ (toggle)'],
      ],
    },
    expected: 'With T held HIGH, Q completes one full cycle for every two clock pulses.',
    check: {
      kind: 'sequential',
      inputs: ['D0', 'D1'],
      outputs: ['R8', 'R9'],
      steps: [
        { set: { D0: 0, D1: 0 }, pulse: 'D1', note: 'T = 0: settle into a known state.' },
        { pulse: 'D1', note: 'Still holding.' },
        { set: { D0: 1 }, pulse: 'D1', note: 'T = 1 from here on.' },
        { pulse: 'D1', note: 'Toggle.' },
        { pulse: 'D1', note: 'Toggle again - Q and Q-bar must stay opposite.' },
      ],
    },
    tips: ['Compare the clock and Q in the logic analyzer: Q is exactly half the clock frequency.'],
  },
  {
    id: 'exp19',
    number: 19,
    title: 'Counters',
    objective: 'Wire a 7493 as a 4-bit binary counter and watch it count 0 to 15 and roll over.',
    theory:
      'The 7493 is two ripple counters in one package: a divide-by-2 and a divide-by-8. Feeding QA into the clock of the second section makes the whole thing a 4-bit binary counter. Because each stage clocks the next, the outputs settle one after another - that is what "ripple" means.',
    parts: [{ type: 'ic:7493', qty: 1, note: 'VCC is pin 5 and GND is pin 10 on this package' }],
    requirements: [
      'Power the package - pin 5 to VCC and pin 10 to GND.',
      'Connect QA (pin 12) to CKB (pin 1) to chain the two sections.',
      'Hold both reset pins LOW so the counter can count.',
      'Clock into CKA (pin 14) and read QA..QD.',
    ],
    pinConfig: [
      'CKA = pin 14 from D0 (or from the clock generator).',
      'QA = pin 12 to CKB = pin 1, and also to R8.',
      'QB = pin 9 to R9, QC = pin 8 to R10, QD = pin 11 to R11.',
      'R0(1) = pin 2 and R0(2) = pin 3 to GND.',
    ],
    procedure: [
      'Place the 7493 and power it on pins 5 and 10.',
      'Tie both reset pins to GND.',
      'Connect QA to CKB.',
      'Clock CKA and watch R11 R10 R9 R8 count up in binary.',
      'Pulse both reset pins HIGH and confirm the counter returns to 0000.',
      'Try the clock generator instead of a writer channel and view the outputs in the logic analyzer.',
    ],
    truthTable: {
      headers: ['Pulse', 'R11 (QD)', 'R10 (QC)', 'R9 (QB)', 'R8 (QA)'],
      rows: [
        ['0', '0', '0', '0', '0'],
        ['1', '0', '0', '0', '1'],
        ['2', '0', '0', '1', '0'],
        ['3', '0', '0', '1', '1'],
        ['4', '0', '1', '0', '0'],
        ['8', '1', '0', '0', '0'],
        ['15', '1', '1', '1', '1'],
        ['16', '0', '0', '0', '0'],
      ],
      note: 'Both sections trigger on the FALLING edge of their clock.',
    },
    expected: 'The four outputs count 0000 to 1111 and then roll back to 0000.',
    check: {
      kind: 'sequential',
      inputs: ['D0'],
      outputs: ['R8', 'R9', 'R10', 'R11'],
      steps: [
        { set: { D0: 0 }, expect: { R8: 0, R9: 0, R10: 0, R11: 0 }, note: 'Start from zero.' },
        { pulse: 'D0', expect: { R8: 1, R9: 0, R10: 0, R11: 0 }, note: 'Count 1.' },
        { pulse: 'D0', expect: { R8: 0, R9: 1, R10: 0, R11: 0 }, note: 'Count 2.' },
        { pulse: 'D0', expect: { R8: 1, R9: 1, R10: 0, R11: 0 }, note: 'Count 3.' },
        { pulse: 'D0', expect: { R8: 0, R9: 0, R10: 1, R11: 0 }, note: 'Count 4.' },
        { pulse: 'D0', expect: { R8: 1, R9: 0, R10: 1, R11: 0 }, note: 'Count 5.' },
        { pulse: 'D0', expect: { R8: 0, R9: 1, R10: 1, R11: 0 }, note: 'Count 6.' },
        { pulse: 'D0', expect: { R8: 1, R9: 1, R10: 1, R11: 0 }, note: 'Count 7.' },
        { pulse: 'D0', expect: { R8: 0, R9: 0, R10: 0, R11: 1 }, note: 'Count 8 - the carry into QD.' },
      ],
    },
    tips: [
      'A 7490 wired the same way counts 0 to 9 instead: that is the decade counter.',
      'If the counter shows X, check that both reset pins are actually LOW rather than floating.',
    ],
  },
  {
    id: 'exp20',
    number: 20,
    title: 'Shift registers',
    objective:
      'Load a 74164 serially and watch a single 1 walk along the eight parallel outputs, one place per clock.',
    theory:
      'A shift register is a chain of D flip-flops, each one clocking in whatever its neighbour held. It converts serial data to parallel - the trick behind every serial link, and the basis of ring and Johnson counters.',
    parts: [{ type: 'ic:74164', qty: 1, note: '8-bit serial-in parallel-out shift register' }],
    requirements: [
      'Power the package.',
      'Tie CLR (pin 9) HIGH so the register can hold data, and tie serial input B (pin 2) HIGH so input A alone controls the data.',
      'Drive data into A (pin 1) and clock into pin 8.',
      'Bring all eight outputs to R8..R15.',
    ],
    pinConfig: [
      'A = pin 1 from D0 (serial data), B = pin 2 to VCC.',
      'CLK = pin 8 from D1, CLR = pin 9 to VCC.',
      'QA = pin 3 to R8, QB = pin 4 to R9, QC = pin 5 to R10, QD = pin 6 to R11.',
      'QE = pin 10 to R12, QF = pin 11 to R13, QG = pin 12 to R14, QH = pin 13 to R15.',
    ],
    procedure: [
      'Place and power the 74164; tie CLR and B HIGH.',
      'Set the serial input HIGH and clock once - only QA goes HIGH.',
      'Set the serial input LOW and keep clocking: watch the single 1 walk from QA towards QH.',
      'Pulse CLR LOW to empty the register at any time.',
      'Feed the clock from the clock generator and watch the pattern move in the logic analyzer.',
    ],
    truthTable: {
      headers: ['Clock', 'R8 (QA)', 'R9 (QB)', 'R10 (QC)', 'R11 (QD)'],
      rows: [
        ['after CLR', '0', '0', '0', '0'],
        ['1 (data = 1)', '1', '0', '0', '0'],
        ['2 (data = 0)', '0', '1', '0', '0'],
        ['3 (data = 0)', '0', '0', '1', '0'],
        ['4 (data = 0)', '0', '0', '0', '1'],
      ],
      note: 'Data shifts on the RISING clock edge.',
    },
    expected: 'A single HIGH entered at A appears one output further along after each clock pulse.',
    check: {
      kind: 'sequential',
      inputs: ['D0', 'D1'],
      outputs: ['R8', 'R9', 'R10', 'R11'],
      steps: [
        { set: { D0: 1, D1: 0 }, pulse: 'D1', expect: { R8: 1, R9: 0, R10: 0, R11: 0 }, note: 'Shift a 1 into QA.' },
        { set: { D0: 0 }, pulse: 'D1', expect: { R8: 0, R9: 1, R10: 0, R11: 0 }, note: 'The 1 moves to QB.' },
        { pulse: 'D1', expect: { R8: 0, R9: 0, R10: 1, R11: 0 }, note: 'And on to QC.' },
        { pulse: 'D1', expect: { R8: 0, R9: 0, R10: 0, R11: 1 }, note: 'And on to QD.' },
      ],
    },
  },
];

export const getExperiment = (id: string) => EXPERIMENTS.find((e) => e.id === id);
