/**
 * Circuit validation.
 *
 * The rule here is: never just say "ERROR". Every problem names the pin, says
 * what is wrong with it in the language of the lab, and carries a longer "why"
 * that explains the underlying idea.
 */
import type { CircuitEngine } from './engine';
import type { Circuit, PlacedComponent } from './types';

export type IssueLevel = 'error' | 'warn' | 'ok' | 'info';

export interface Issue {
  id: string;
  level: IssueLevel;
  message: string;
  /** The longer explanation behind the "Why?" button. */
  why?: string;
  compId?: string;
  pins?: number[];
  netId?: number;
}

const ORDER: Record<IssueLevel, number> = { error: 0, warn: 1, info: 2, ok: 3 };

export function validate(engine: CircuitEngine, circuit: Circuit): Issue[] {
  const issues: Issue[] = [];
  const { comps, pins, nets, netOf } = engine.netlist;

  const nameOf = (comp: PlacedComponent) => {
    const model = comps.get(comp.id)?.model;
    const label = comp.label ?? model?.label ?? '?';
    return model && model.label !== label ? `${label} (${model.label})` : label;
  };

  /**
   * Is anything actually on this node besides breadboard holes? A leg pushed
   * into an empty breadboard column shares a net with four other holes, but it
   * is still electrically on its own - so counting pins is not enough.
   */
  const reaches = (compId: string, pin: number): boolean => {
    const key = `${compId}:${pin}`;
    const netId = netOf.get(key);
    if (netId === undefined) return false;
    return engine.netlist.nets[netId].pins.some(
      (k) => k !== key && pins.get(k)?.def.kind !== 'hole',
    );
  };

  /** A part is "in the circuit" once any of its pins reaches another part. */
  const inCircuit = (compId: string): boolean => {
    const info = comps.get(compId);
    if (!info) return false;
    return info.model.pins.some((p) => reaches(compId, p.n));
  };

  for (const wireId of engine.netlist.danglingWires) {
    issues.push({
      id: `dangling:${wireId}`,
      level: 'error',
      message: 'A wire is connected to a component that no longer exists.',
      why: 'The part this wire was attached to has been deleted. Delete the wire, or undo the deletion.',
    });
  }

  // ---- power ------------------------------------------------------------
  for (const [id, info] of comps) {
    const { model, comp } = info;
    if (!model.needsPower || model.vccPin === undefined || model.gndPin === undefined) continue;
    const touched = inCircuit(id);

    const vccVal = engine.valueAt(id, model.vccPin);
    const gndVal = engine.valueAt(id, model.gndPin);
    const vccNet = engine.netStateAt(id, model.vccPin);
    const gndNet = engine.netStateAt(id, model.gndPin);

    if (!touched) {
      issues.push({
        id: `idle:${id}`,
        level: 'info',
        message: `${nameOf(comp)} is on the bench but nothing is wired to it yet.`,
        compId: id,
        why: 'Start with the supply: pin ' +
          model.vccPin +
          ' to VCC and pin ' +
          model.gndPin +
          ' to GND. A TTL package does nothing at all until it is powered.',
      });
      continue;
    }

    if (vccNet?.floating) {
      issues.push({
        id: `vcc-missing:${id}`,
        level: 'error',
        message: `Pin ${model.vccPin} (VCC) of ${nameOf(comp)} is not connected to the supply.`,
        compId: id,
        pins: [model.vccPin],
        why: `Every 74-series package needs +5 V on its VCC pin and 0 V on its GND pin - that is what powers the transistors inside. Until pin ${model.vccPin} is wired to VCC, the gates in this package have no supply and their outputs are undefined, no matter what you put on the inputs.`,
      });
    } else if (vccVal !== 1) {
      issues.push({
        id: `vcc-wrong:${id}`,
        level: 'error',
        message: `Pin ${model.vccPin} (VCC) of ${nameOf(comp)} is at ${vccVal === 0 ? 'LOW' : 'an undefined level'} instead of +5 V.`,
        compId: id,
        pins: [model.vccPin],
        why: `Pin ${model.vccPin} is the supply pin. It must go to VCC, not to a signal or to ground. Check where that wire actually lands - swapping VCC and GND is the classic way to destroy a real IC.`,
      });
    } else {
      issues.push({
        id: `vcc-ok:${id}`,
        level: 'ok',
        message: `VCC connected correctly on ${nameOf(comp)} (pin ${model.vccPin}).`,
        compId: id,
        pins: [model.vccPin],
      });
    }

    if (gndNet?.floating) {
      issues.push({
        id: `gnd-missing:${id}`,
        level: 'error',
        message: `Pin ${model.gndPin} (GND) of ${nameOf(comp)} must be connected to ground.`,
        compId: id,
        pins: [model.gndPin],
        why: `Current that flows into the package through VCC has to get back out through GND. Without that return path the internal levels have no reference, so the "0" and "1" you feed in mean nothing. Wire pin ${model.gndPin} to the GND component or to the ground rail.`,
      });
    } else if (gndVal !== 0) {
      issues.push({
        id: `gnd-wrong:${id}`,
        level: 'error',
        message: `Pin ${model.gndPin} (GND) of ${nameOf(comp)} is at ${gndVal === 1 ? 'HIGH' : 'an undefined level'} instead of 0 V.`,
        compId: id,
        pins: [model.gndPin],
        why: `Pin ${model.gndPin} is the ground pin and must sit at 0 V. If it is HIGH you have probably wired VCC and GND the wrong way round.`,
      });
    } else {
      issues.push({
        id: `gnd-ok:${id}`,
        level: 'ok',
        message: `GND connected correctly on ${nameOf(comp)} (pin ${model.gndPin}).`,
        compId: id,
        pins: [model.gndPin],
      });
    }
  }

  // ---- shorts and output clashes ----------------------------------------
  for (const net of nets) {
    let vccCount = 0;
    let gndCount = 0;
    const active: string[] = [];

    for (const key of net.pins) {
      const info = pins.get(key)!;
      if (info.def.kind !== 'output' || info.model.weak) continue;
      if (info.model.type === 'vcc') vccCount++;
      else if (info.model.type === 'gnd') gndCount++;
      else active.push(`pin ${info.pin} of ${nameOf(info.comp)}`);
    }

    if (vccCount > 0 && gndCount > 0) {
      issues.push({
        id: `short:${net.id}`,
        level: 'error',
        message: 'Short circuit: VCC is wired directly to GND.',
        netId: net.id,
        why: 'This node connects the +5 V rail straight to 0 V with nothing in between. On a real bench that is a dead short across the power supply - the wire heats up and the supply current-limits or trips. Find the wire that joins the two rails and remove it.',
      });
    }
    if (active.length >= 2) {
      issues.push({
        id: `clash:${net.id}`,
        level: 'error',
        message: `Two outputs are wired together: ${active.slice(0, 3).join(' and ')}.`,
        netId: net.id,
        why: 'Each of these pins is an output - a transistor that actively pulls the node HIGH or LOW. Tie two of them together and when one drives HIGH while the other drives LOW they fight: the node ends up at an in-between voltage and both outputs overheat. Outputs may only be joined if they are open-collector or 3-state parts, which these are not. Feed the two signals into a gate instead.',
      });
    }
    if (active.length >= 1 && (vccCount > 0 || gndCount > 0)) {
      issues.push({
        id: `out-to-rail:${net.id}`,
        level: 'error',
        message: `${active[0]} is an output and is wired directly to ${vccCount > 0 ? 'VCC' : 'GND'}.`,
        netId: net.id,
        why: 'An output already drives the node by itself. Connecting it to a supply rail means that whenever the output tries to drive the other way it is shorted to the rail. Only INPUT pins should be tied to VCC or GND.',
      });
    }
  }

  // ---- floating inputs ---------------------------------------------------
  const simplified = circuit.settings.floatingMode === 'pulldown';
  for (const [id, info] of comps) {
    const { model, comp } = info;
    if (model.category === 'board') continue;
    // Reader channels and probes are meters, not circuit inputs: an unused one
    // showing X is the instrument telling the truth, not a fault.
    if (model.type === 'reader' || model.type === 'probe') continue;
    if (!inCircuit(id)) continue;

    const unconnected = (pin: number) => !reaches(id, pin);

    /** A gate nobody has wired at all - worth a note, not a warning. */
    const idleGroups = new Set<string>();
    const groups = new Set(model.pins.map((p) => p.group).filter(Boolean) as string[]);
    for (const g of groups) {
      const pins = model.pins.filter((p) => p.group === g);
      if (pins.every((p) => unconnected(p.n))) idleGroups.add(g);
    }
    if (idleGroups.size) {
      const list = [...idleGroups].sort();
      issues.push({
        id: `idle-gates:${id}`,
        level: 'info',
        message: `${list.join(', ')} of ${nameOf(comp)} ${list.length > 1 ? 'are' : 'is'} unused.`,
        compId: id,
        why: 'Nothing is wired to these gates, so the simulator leaves them alone. On real hardware you should still tie the inputs of an unused TTL gate to VCC or GND: an open input floats, picks up noise and makes the package draw more current than it should.',
      });
    }

    const floatingPins: number[] = [];
    for (const def of model.pins) {
      if (def.kind !== 'input' && def.kind !== 'clock') continue;
      if (def.group && idleGroups.has(def.group)) continue;
      const netId = netOf.get(`${id}:${def.n}`);
      if (netId === undefined) continue;
      if (engine.nets[netId]?.floating) floatingPins.push(def.n);
    }
    if (!floatingPins.length) continue;

    const names = floatingPins
      .map((n) => `${n} (${model.pins.find((p) => p.n === n)?.name})`)
      .join(', ');
    issues.push({
      id: `float:${id}`,
      level: simplified ? 'info' : 'warn',
      message:
        floatingPins.length === 1
          ? `Input pin ${names} of ${nameOf(comp)} is floating.`
          : `${floatingPins.length} input pins of ${nameOf(comp)} are floating: ${names}.`,
      compId: id,
      pins: floatingPins,
      why: simplified
        ? 'Simplified mode is on, so the simulator is reading these pins as 0. A real TTL input that is left open floats HIGH-ish and picks up noise, so never rely on this on real hardware: tie unused inputs to VCC or GND.'
        : `Nothing is driving ${floatingPins.length === 1 ? 'this pin' : 'these pins'}, so their level is unknown - not 0. A gate cannot decide its output from an unknown input, which is why the output shows X. On real TTL an open input floats to roughly a HIGH but picks up every bit of noise nearby, so the circuit works one minute and not the next. Wire the pin to a signal, or tie it to VCC or GND if the input is unused. A pull-up or pull-down resistor does the same job.`,
    });
  }

  // ---- parts that report their own trouble -------------------------------
  for (const [id, info] of comps) {
    const state = engine.states.get(id);
    if (!state) continue;
    if (info.model.type === 'led' && state.note) {
      issues.push({
        id: `led:${id}`,
        level: 'warn',
        message: `${nameOf(info.comp)}: ${state.note}.`,
        compId: id,
        why: 'An LED lights only when current flows through it: the anode must be HIGH and the cathode must have a path to ground. Wiring only one leg leaves it dark whatever the signal does.',
      });
    }
    if (info.model.type === 'seg7' && state.note) {
      issues.push({
        id: `seg:${id}`,
        level: 'warn',
        message: `${nameOf(info.comp)}: ${state.note}.`,
        compId: id,
        why: 'The common pin is the shared connection of all eight segments. On a common-anode display it goes to +5 V and each segment lights when its own pin is pulled LOW; on a common-cathode display it goes to 0 V and segments light on a HIGH.',
      });
    }
  }

  // ---- undefined sequential state ---------------------------------------
  for (const [id, info] of comps) {
    const { model, comp } = info;
    if (!['flipflop', 'counter', 'register'].includes(model.category)) continue;
    if (!engine.isPowered(id)) continue;
    const outs = model.pins.filter((p) => p.kind === 'output');
    if (!outs.length) continue;
    const undefinedOuts = outs.filter((p) => engine.valueAt(id, p.n) === 'X');
    if (undefinedOuts.length !== outs.length) continue;
    const hasFloatingInput = model.pins.some(
      (p) =>
        (p.kind === 'input' || p.kind === 'clock') &&
        engine.nets[netOf.get(`${id}:${p.n}`) ?? -1]?.floating,
    );
    if (hasFloatingInput) continue; // already reported above
    issues.push({
      id: `undef:${id}`,
      level: 'info',
      message: `${nameOf(comp)} is holding an undefined state (all outputs X).`,
      compId: id,
      why: 'A flip-flop remembers - and right now what it remembers is "unknown", because an unknown input was clocked in. Pulse the clear (or preset) input to force it to a known value, then start clocking. This is exactly why every sequential circuit on a real bench starts with a reset.',
    });
  }

  if (engine.last.oscillating) {
    issues.push({
      id: 'oscillating',
      level: 'warn',
      message: 'The circuit never settles - it is oscillating.',
      why: 'The simulator steps the circuit forward one gate delay at a time and gives up after 150 steps if the levels are still changing. That happens when a signal feeds back through an odd number of inversions with no clocked element to hold it - a ring oscillator. On a real board this shows up as a high-frequency squeal on the scope. Check for a feedback loop, or for a latch being held in its forbidden state.',
    });
  }

  return issues.sort((a, b) => ORDER[a.level] - ORDER[b.level]);
}

export function issueCounts(issues: Issue[]) {
  return {
    error: issues.filter((i) => i.level === 'error').length,
    warn: issues.filter((i) => i.level === 'warn').length,
    ok: issues.filter((i) => i.level === 'ok').length,
    info: issues.filter((i) => i.level === 'info').length,
  };
}
