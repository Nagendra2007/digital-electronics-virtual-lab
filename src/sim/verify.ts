/**
 * Experiment verification.
 *
 * This does not inspect the student's wiring or compare it with a model answer.
 * It drives the writer channels the experiment names, settles the circuit the
 * student actually built, and reads the reader channels back - the same thing a
 * demonstrator does with a trainer kit.
 */
import { CircuitEngine } from './engine';
import { getModel } from './registry';
import { READER_FIRST, WRITER_CHANNELS } from './devices';
import type { Circuit, NetValue } from './types';
import type { ExperimentCheck } from '../data/experiments';

export interface CheckRow {
  label: string;
  expected: string[];
  actual: string[];
  pass: boolean;
  note?: string;
}

export interface CheckResult {
  ok: boolean;
  passed: number;
  total: number;
  inputLabels: string[];
  outputLabels: string[];
  rows: CheckRow[];
  problems: string[];
}

const writerChannel = (label: string) => {
  const m = /^D(\d)$/.exec(label.trim());
  const n = m ? Number(m[1]) : -1;
  return n >= 0 && n < WRITER_CHANNELS ? n : -1;
};

const readerChannel = (label: string) => {
  const m = /^R(\d+)$/.exec(label.trim());
  const n = m ? Number(m[1]) - READER_FIRST : -1;
  return n >= 0 && n < 8 ? n : -1;
};

export function runCheck(circuit: Circuit, check: ExperimentCheck): CheckResult {
  const problems: string[] = [];
  const work: Circuit = structuredClone(circuit);
  const writer = work.components.find((c) => c.type === 'writer');
  const reader = work.components.find((c) => c.type === 'reader');

  if (!writer) problems.push('There is no Digital Writer on the bench - add one to drive the inputs.');
  if (!reader) problems.push('There is no Digital Reader on the bench - add one to read the outputs.');

  const engine = new CircuitEngine(work, getModel, {
    floatingMode: circuit.settings.floatingMode,
  });

  const setChannel = (label: string, value: 0 | 1) => {
    if (!writer) return;
    const ch = writerChannel(label);
    if (ch < 0) return;
    const values = [...((writer.props.values as number[]) ?? [])];
    values[ch] = value;
    writer.props = { ...writer.props, values };
  };

  const readChannel = (label: string): NetValue => {
    if (!reader) return 'X';
    const ch = readerChannel(label);
    if (ch < 0) return 'X';
    return engine.valueAt(reader.id, ch + 1);
  };

  const step = () => {
    engine.rebuild(work);
    engine.settle();
  };

  // Warn about channels that are not wired at all: the result would be a wall
  // of X and the real problem is a missing wire, not a wrong gate.
  const unwired = (labels: string[], kind: 'in' | 'out') => {
    const comp = kind === 'in' ? writer : reader;
    if (!comp) return;
    for (const label of labels) {
      const ch = kind === 'in' ? writerChannel(label) : readerChannel(label);
      if (ch < 0) continue;
      const netId = engine.netIndexOf(comp.id, ch + 1);
      const net = netId === undefined ? undefined : engine.netlist.nets[netId];
      if (!net || net.pins.length <= 1) {
        problems.push(
          kind === 'in'
            ? `${label} is not wired to anything, so this input never reaches your circuit.`
            : `${label} is not wired to anything, so it can only ever read X.`,
        );
      }
    }
  };

  engine.reset();
  step();
  unwired(check.inputs, 'in');
  unwired(check.outputs, 'out');

  const rows: CheckRow[] = [];

  if (check.kind === 'combinational') {
    for (const row of check.rows) {
      const ins = row.slice(0, check.inputs.length) as (0 | 1)[];
      const expected = row.slice(check.inputs.length).map(String);
      engine.reset();
      check.inputs.forEach((label, i) => setChannel(label, ins[i]));
      step();
      const actual = check.outputs.map((o) => String(readChannel(o)));
      rows.push({
        label: check.inputs.map((l, i) => `${l}=${ins[i]}`).join(' '),
        expected,
        actual,
        pass: actual.every((v, i) => v === expected[i]),
      });
    }
  } else {
    engine.reset();
    // Start from a defined bench state: every named input LOW.
    for (const label of check.inputs) setChannel(label, 0);
    step();

    for (const s of check.steps) {
      if (s.set) {
        for (const [label, value] of Object.entries(s.set)) setChannel(label, value);
        step();
      }
      if (s.pulse) {
        setChannel(s.pulse, 0);
        step();
        setChannel(s.pulse, 1);
        step();
        setChannel(s.pulse, 0);
        step();
      }
      if (!s.expect) continue;
      const labels = Object.keys(s.expect);
      const expected = labels.map((l) => String(s.expect![l]));
      const actual = labels.map((l) => String(readChannel(l)));
      rows.push({
        label: s.note,
        expected: labels.map((l, i) => `${l}=${expected[i]}`),
        actual: labels.map((l, i) => `${l}=${actual[i]}`),
        pass: actual.every((v, i) => v === expected[i]),
        note: s.pulse ? `clock pulse on ${s.pulse}` : undefined,
      });
    }
  }

  const passed = rows.filter((r) => r.pass).length;
  return {
    ok: rows.length > 0 && passed === rows.length && problems.length === 0,
    passed,
    total: rows.length,
    inputLabels: check.inputs,
    outputLabels: check.outputs,
    rows,
    problems,
  };
}

/** A short verdict for the panel header. */
export function verdict(result: CheckResult): string {
  if (result.problems.length) return 'Wiring incomplete';
  if (result.ok) return 'All rows match the expected truth table';
  if (result.passed === 0) return 'No rows match yet';
  return `${result.passed} of ${result.total} rows match`;
}
