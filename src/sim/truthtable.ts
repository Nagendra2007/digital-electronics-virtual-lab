/**
 * Truth table generator.
 *
 * It drives the circuit for real: every input combination is written to the
 * actual source components, the engine is settled, and the outputs are read
 * back. Nothing here knows what the circuit is supposed to do.
 */
import { CircuitEngine } from './engine';
import { getModel } from './registry';
import { READER_FIRST, WRITER_CHANNELS } from './devices';
import type { Circuit, NetValue } from './types';

export interface TTInput {
  compId: string;
  /** Writer channel index, or undefined for a switch. */
  index?: number;
  label: string;
  kind: 'writer' | 'switch' | 'pushbutton';
}

export interface TTOutput {
  compId: string;
  pin: number;
  label: string;
}

export interface TTRow {
  inputs: (0 | 1)[];
  outputs: NetValue[];
}

export interface TTResult {
  inputs: TTInput[];
  outputs: TTOutput[];
  rows: TTRow[];
  note?: string;
}

export const MAX_TT_INPUTS = 8;

/** Which writer channels and switches actually reach the rest of the circuit. */
export function detectInputs(circuit: Circuit, engine: CircuitEngine): TTInput[] {
  const out: TTInput[] = [];
  for (const comp of circuit.components) {
    if (comp.type === 'writer') {
      for (let i = 0; i < WRITER_CHANNELS; i++) {
        const netId = engine.netIndexOf(comp.id, i + 1);
        if (netId === undefined) continue;
        if (engine.netlist.nets[netId].pins.length > 1) {
          out.push({ compId: comp.id, index: i, label: `D${i}`, kind: 'writer' });
        }
      }
    } else if (comp.type === 'switch' || comp.type === 'pushbutton') {
      const netId = engine.netIndexOf(comp.id, 2);
      if (netId !== undefined && engine.netlist.nets[netId].pins.length > 1) {
        out.push({
          compId: comp.id,
          label: comp.label ?? 'SW',
          kind: comp.type as 'switch' | 'pushbutton',
        });
      }
    }
  }
  return out;
}

/** Reader channels, LEDs and probes that are wired to something. */
export function detectOutputs(circuit: Circuit, engine: CircuitEngine): TTOutput[] {
  const out: TTOutput[] = [];
  for (const comp of circuit.components) {
    if (comp.type === 'reader') {
      for (let i = 0; i < 8; i++) {
        const netId = engine.netIndexOf(comp.id, i + 1);
        if (netId === undefined) continue;
        if (engine.netlist.nets[netId].pins.length > 1) {
          out.push({ compId: comp.id, pin: i + 1, label: `R${READER_FIRST + i}` });
        }
      }
    } else if (comp.type === 'led' || comp.type === 'probe') {
      const netId = engine.netIndexOf(comp.id, 1);
      if (netId !== undefined && engine.netlist.nets[netId].pins.length > 1) {
        out.push({ compId: comp.id, pin: 1, label: comp.label ?? comp.type });
      }
    }
  }
  return out;
}

function applyInput(circuit: Circuit, input: TTInput, value: 0 | 1) {
  const comp = circuit.components.find((c) => c.id === input.compId);
  if (!comp) return;
  if (input.kind === 'writer') {
    const values = [...((comp.props.values as number[]) ?? [])];
    values[input.index ?? 0] = value;
    comp.props = { ...comp.props, values };
  } else if (input.kind === 'switch') {
    comp.props = { ...comp.props, pos: value ? 'a' : 'b' };
  } else {
    comp.props = { ...comp.props, pressed: value === 1 };
  }
}

export interface TTOptions {
  /** Clear all stored state before each row, so the table is repeatable. */
  resetEachRow?: boolean;
  /** Extra settle passes per row, for circuits with feedback. */
  settlePasses?: number;
}

export function generateTruthTable(
  circuit: Circuit,
  inputs: TTInput[],
  outputs: TTOutput[],
  opts: TTOptions = {},
): TTResult {
  const { resetEachRow = true, settlePasses = 2 } = opts;
  const used = inputs.slice(0, MAX_TT_INPUTS);
  const work: Circuit = structuredClone(circuit);
  const engine = new CircuitEngine(work, getModel, {
    floatingMode: circuit.settings.floatingMode,
  });

  const rows: TTRow[] = [];
  const total = 1 << used.length;

  for (let combo = 0; combo < total; combo++) {
    const bits: (0 | 1)[] = [];
    for (let i = 0; i < used.length; i++) {
      // First column is the most significant bit, as printed in a lab manual.
      const v = ((combo >> (used.length - 1 - i)) & 1) as 0 | 1;
      bits.push(v);
      applyInput(work, used[i], v);
    }
    if (resetEachRow) engine.reset();
    engine.rebuild(work);
    for (let p = 0; p < settlePasses; p++) engine.settle();
    rows.push({
      inputs: bits,
      outputs: outputs.map((o) => engine.valueAt(o.compId, o.pin)),
    });
  }

  return {
    inputs: used,
    outputs,
    rows,
    note:
      inputs.length > MAX_TT_INPUTS
        ? `Only the first ${MAX_TT_INPUTS} inputs were swept (${1 << MAX_TT_INPUTS} rows).`
        : undefined,
  };
}

export function truthTableToText(result: TTResult): string {
  const head = [...result.inputs.map((i) => i.label), '|', ...result.outputs.map((o) => o.label)];
  const lines = [head.join(' ')];
  lines.push('-'.repeat(head.join(' ').length));
  for (const row of result.rows) {
    lines.push([...row.inputs.map(String), '|', ...row.outputs.map(String)].join(' '));
  }
  return lines.join('\n');
}

export function truthTableToCsv(result: TTResult): string {
  const head = [...result.inputs.map((i) => i.label), ...result.outputs.map((o) => o.label)];
  const rows = result.rows.map((r) => [...r.inputs, ...r.outputs].join(','));
  return [head.join(','), ...rows].join('\n');
}
