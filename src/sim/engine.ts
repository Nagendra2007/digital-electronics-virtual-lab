/**
 * The circuit engine.
 *
 * It runs a delta-step (unit delay) simulation: on every step each component is
 * evaluated once from the node values produced by the previous step, and the
 * loop repeats until nothing changes. Two useful things fall out of that:
 *
 *  - Cross-coupled gates really do latch. A NAND latch holds its state because
 *    each gate's output is whatever it was on the previous delta step.
 *  - A circuit that cannot settle - a ring of inverters, a latch driven into
 *    its forbidden state - is detected as oscillating instead of hanging.
 *
 * Clocked parts detect edges by comparing the clock level against the level
 * they saw on the previous delta step, so one real edge produces exactly one
 * trigger, and ripple counters propagate naturally, one stage per step.
 */
import { buildNetlist } from './netlist';
import { pinKey } from './types';
import type { Circuit, ComponentModel, EvalCtx, Logic, NetValue } from './types';
import type { Netlist, PinInfo } from './netlist';

export const MAX_DELTA_STEPS = 150;

export interface Driver {
  pin: string;
  value: Logic;
  weak: boolean;
}

export interface NetState {
  value: NetValue;
  drivers: Driver[];
  /** Two or more strong drivers disagree: a short circuit between outputs. */
  conflict: boolean;
  /** Nothing drives this node at all. */
  floating: boolean;
}

export interface SettleResult {
  steps: number;
  oscillating: boolean;
  /** Net ids that were still changing when the step limit was reached. */
  unstableNets: number[];
}

export interface EngineOptions {
  floatingMode?: 'undefined' | 'pulldown';
}

export class CircuitEngine {
  netlist!: Netlist;
  nets: NetState[] = [];
  /** Current value driven by each output pin. */
  drives = new Map<string, Logic>();
  states = new Map<string, Record<string, any>>();
  time = 0;
  last: SettleResult = { steps: 0, oscillating: false, unstableNets: [] };
  options: EngineOptions;

  constructor(
    circuit: Circuit,
    private getModel: (type: string) => ComponentModel | undefined,
    options: EngineOptions = {},
  ) {
    this.options = options;
    this.rebuild(circuit);
  }

  /**
   * Rebuild the netlist after an edit. Component state (flip-flop contents,
   * clock phase) and the values already on the wires are preserved, so adding a
   * wire does not silently reset a counter.
   */
  rebuild(circuit: Circuit) {
    this.options.floatingMode = circuit.settings?.floatingMode ?? this.options.floatingMode;
    this.netlist = buildNetlist(circuit, this.getModel);

    for (const id of [...this.states.keys()]) {
      if (!this.netlist.comps.has(id)) this.states.delete(id);
    }
    for (const key of [...this.drives.keys()]) {
      if (!this.netlist.pins.has(key)) this.drives.delete(key);
    }
    this.resolve();
  }

  reset() {
    this.states.clear();
    this.drives.clear();
    this.time = 0;
    this.last = { steps: 0, oscillating: false, unstableNets: [] };
    this.resolve();
  }

  stateOf(compId: string): Record<string, any> {
    let s = this.states.get(compId);
    if (!s) {
      const info = this.netlist.comps.get(compId);
      s = info?.model.initState?.() ?? {};
      this.states.set(compId, s);
    }
    return s;
  }

  netIndexOf(compId: string, pin: number): number | undefined {
    return this.netlist.netOf.get(pinKey(compId, pin));
  }

  /** Resolved level at a pin. `X` when floating or undefined. */
  valueAt(compId: string, pin: number): NetValue {
    const idx = this.netIndexOf(compId, pin);
    return idx === undefined ? 'X' : (this.nets[idx]?.value ?? 'X');
  }

  netStateAt(compId: string, pin: number): NetState | undefined {
    const idx = this.netIndexOf(compId, pin);
    return idx === undefined ? undefined : this.nets[idx];
  }

  /** True when a part that needs a supply has a correct one. */
  isPowered(compId: string): boolean {
    const info = this.netlist.comps.get(compId);
    if (!info) return false;
    const { model } = info;
    if (!model.needsPower) return true;
    if (model.vccPin === undefined || model.gndPin === undefined) return true;
    return this.valueAt(compId, model.vccPin) === 1 && this.valueAt(compId, model.gndPin) === 0;
  }

  /** Work out the level of every node from what the outputs are currently driving. */
  private resolve() {
    const { nets, pins } = this.netlist;
    const pullDown = this.options.floatingMode === 'pulldown';
    this.nets = nets.map((net) => {
      const drivers: Driver[] = [];
      let strongValue: Logic | undefined;
      let conflict = false;
      let anyStrong = false;
      let weakValue: Logic | undefined;
      let weakConflict = false;

      for (const key of net.pins) {
        const driven = this.drives.get(key);
        if (driven === undefined || driven === 'Z') continue;
        const info = pins.get(key) as PinInfo;
        const weak = info.model.weak === true;
        drivers.push({ pin: key, value: driven, weak });
        if (weak) {
          if (weakValue === undefined) weakValue = driven;
          else if (weakValue !== driven) weakConflict = true;
        } else {
          anyStrong = true;
          if (strongValue === undefined) strongValue = driven;
          else if (strongValue !== driven) conflict = true;
        }
      }

      let value: NetValue;
      if (anyStrong) {
        value = conflict || strongValue === 'X' ? 'X' : (strongValue as 0 | 1);
      } else if (weakValue !== undefined) {
        value = weakConflict || weakValue === 'X' ? 'X' : (weakValue as 0 | 1);
      } else {
        value = pullDown ? 0 : 'X';
      }

      return { value, drivers, conflict, floating: drivers.length === 0 };
    });
  }

  /** Run delta steps until the circuit settles (or is declared oscillating). */
  settle(): SettleResult {
    let steps = 0;
    let oscillating = false;
    let unstable: string[] = [];

    for (;;) {
      this.resolve();
      const next = new Map<string, Logic>();

      for (const [id, info] of this.netlist.comps) {
        const { model, props } = info;
        const state = this.stateOf(id);

        if (model.needsPower && !this.isPowered(id)) {
          // No supply: the package cannot drive anything meaningful.
          for (const p of model.pins) {
            if (p.kind === 'output') next.set(pinKey(id, p.n), 'X');
          }
          continue;
        }

        const ctx: EvalCtx = {
          read: (p) => this.valueAt(id, p),
          write: (p, v) => {
            next.set(pinKey(id, p), v);
          },
          state,
          props,
          powered: true,
          time: this.time,
          dt: 0,
        };
        model.evaluate(ctx);
      }

      steps++;
      unstable = diffKeys(this.drives, next);
      this.drives = next;
      if (unstable.length === 0) break;
      if (steps >= MAX_DELTA_STEPS) {
        oscillating = true;
        break;
      }
    }

    this.resolve();
    const unstableNets = [
      ...new Set(unstable.map((k) => this.netlist.netOf.get(k)).filter((n): n is number => n !== undefined)),
    ];
    this.last = { steps, oscillating, unstableNets };
    return this.last;
  }

  /** Advance simulated time (which moves the clock generators) and settle. */
  tick(dtMs: number): SettleResult {
    this.time += dtMs;
    return this.settle();
  }

  /** Snapshot enough state to restore the circuit exactly (used by the truth table tool). */
  snapshot() {
    return {
      time: this.time,
      drives: new Map(this.drives),
      states: new Map([...this.states].map(([k, v]) => [k, structuredClone(v)])),
    };
  }

  restore(snap: ReturnType<CircuitEngine['snapshot']>) {
    this.time = snap.time;
    this.drives = new Map(snap.drives);
    this.states = new Map([...snap.states].map(([k, v]) => [k, structuredClone(v)]));
    this.resolve();
  }
}

/** Keys whose value differs between two drive maps. */
function diffKeys(a: Map<string, Logic>, b: Map<string, Logic>): string[] {
  const out: string[] = [];
  for (const [k, v] of b) if (a.get(k) !== v) out.push(k);
  for (const k of a.keys()) if (!b.has(k)) out.push(k);
  return out;
}
