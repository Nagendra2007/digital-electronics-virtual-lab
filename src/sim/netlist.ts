/**
 * Turns the drawing into an electrical netlist.
 *
 * Three things join pins into one node:
 *   1. a wire drawn by the student,
 *   2. a part's internal bonds (breadboard strips, a series resistor),
 *   3. a component pin sitting in a breadboard hole - contact by position,
 *      exactly like pushing a leg into the board.
 */
import { pinWorldPos } from './geometry';
import { pinKey } from './types';
import type { Circuit, ComponentModel, PinDef, PlacedComponent } from './types';
import type { PinPos } from './geometry';

export interface PinInfo {
  key: string;
  compId: string;
  pin: number;
  comp: PlacedComponent;
  model: ComponentModel;
  def: PinDef;
  x: number;
  y: number;
  side: PinPos['side'];
}

export interface Net {
  id: number;
  pins: string[];
}

export interface CompInfo {
  comp: PlacedComponent;
  model: ComponentModel;
  props: Record<string, any>;
}

export interface Netlist {
  pins: Map<string, PinInfo>;
  comps: Map<string, CompInfo>;
  nets: Net[];
  netOf: Map<string, number>;
  /** Wires that could not be resolved (a component or pin was deleted). */
  danglingWires: string[];
}

class UnionFind {
  private parent = new Map<string, string>();

  add(k: string) {
    if (!this.parent.has(k)) this.parent.set(k, k);
  }

  find(k: string): string {
    let root = k;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // Path compression keeps repeated rebuilds cheap.
    let cur = k;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: string, b: string) {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

const posKey = (x: number, y: number) => `${Math.round(x)},${Math.round(y)}`;

export function buildNetlist(
  circuit: Circuit,
  getModel: (type: string) => ComponentModel | undefined,
): Netlist {
  const pins = new Map<string, PinInfo>();
  const comps = new Map<string, CompInfo>();
  const uf = new UnionFind();
  const holesAt = new Map<string, string>();

  for (const comp of circuit.components) {
    const model = getModel(comp.type);
    if (!model) continue;
    comps.set(comp.id, {
      comp,
      model,
      props: { ...(model.defaultProps ?? {}), ...comp.props },
    });

    for (const def of model.pins) {
      const pos = pinWorldPos(model, comp, def.n);
      if (!pos) continue;
      const key = pinKey(comp.id, def.n);
      pins.set(key, {
        key,
        compId: comp.id,
        pin: def.n,
        comp,
        model,
        def,
        x: pos.x,
        y: pos.y,
        side: pos.side,
      });
      uf.add(key);
      if (def.kind === 'hole') holesAt.set(posKey(pos.x, pos.y), key);
    }

    for (const group of model.internalBonds?.(comp) ?? []) {
      for (let i = 1; i < group.length; i++) {
        uf.union(pinKey(comp.id, group[0]), pinKey(comp.id, group[i]));
      }
    }
  }

  // A leg pushed into a breadboard hole makes contact.
  for (const info of pins.values()) {
    if (info.def.kind === 'hole') continue;
    const hole = holesAt.get(posKey(info.x, info.y));
    if (hole) uf.union(info.key, hole);
  }

  const danglingWires: string[] = [];
  for (const wire of circuit.wires) {
    const a = pinKey(wire.a.c, wire.a.p);
    const b = pinKey(wire.b.c, wire.b.p);
    if (!pins.has(a) || !pins.has(b)) {
      danglingWires.push(wire.id);
      continue;
    }
    uf.union(a, b);
  }

  const netOf = new Map<string, number>();
  const byRoot = new Map<string, number>();
  const nets: Net[] = [];
  for (const key of pins.keys()) {
    const root = uf.find(key);
    let id = byRoot.get(root);
    if (id === undefined) {
      id = nets.length;
      byRoot.set(root, id);
      nets.push({ id, pins: [] });
    }
    nets[id].pins.push(key);
    netOf.set(key, id);
  }

  return { pins, comps, nets, netOf, danglingWires };
}
