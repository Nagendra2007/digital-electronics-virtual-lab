/**
 * Test bench: builds circuits the same way a student would - place a part,
 * wire VCC and GND, wire the inputs to writer channels, read the outputs.
 */
import { CircuitEngine } from '../src/sim/engine';
import { createComponent, getModel } from '../src/sim/registry';
import { defaultSettings } from '../src/sim/types';
import type { Circuit, NetValue, PlacedComponent } from '../src/sim/types';

export class Bench {
  circuit: Circuit;
  engine: CircuitEngine;
  private vccId?: string;
  private gndId?: string;
  private writerId?: string;
  private readerId?: string;
  private x = 0;

  constructor(floatingMode: 'undefined' | 'pulldown' = 'undefined') {
    this.circuit = {
      id: 'test',
      name: 'test',
      components: [],
      wires: [],
      settings: { ...defaultSettings(), floatingMode },
      createdAt: 0,
      updatedAt: 0,
    };
    this.engine = new CircuitEngine(this.circuit, getModel, { floatingMode });
  }

  add(type: string, rot: PlacedComponent['rot'] = 0): string {
    const comp = createComponent(type, (this.x += 200), 100, this.circuit, rot);
    if (!comp) throw new Error(`unknown component type ${type}`);
    this.circuit.components.push(comp);
    this.engine.rebuild(this.circuit);
    return comp.id;
  }

  comp(id: string): PlacedComponent {
    const c = this.circuit.components.find((k) => k.id === id);
    if (!c) throw new Error(`no component ${id}`);
    return c;
  }

  wire(a: string, ap: number, b: string, bp: number) {
    this.circuit.wires.push({
      id: `w${this.circuit.wires.length}`,
      a: { c: a, p: ap },
      b: { c: b, p: bp },
      pts: [],
      color: '#888',
    });
    this.engine.rebuild(this.circuit);
    return this;
  }

  get vcc(): string {
    if (!this.vccId) this.vccId = this.add('vcc');
    return this.vccId;
  }

  get gnd(): string {
    if (!this.gndId) this.gndId = this.add('gnd');
    return this.gndId;
  }

  get writer(): string {
    if (!this.writerId) this.writerId = this.add('writer');
    return this.writerId;
  }

  get reader(): string {
    if (!this.readerId) this.readerId = this.add('reader');
    return this.readerId;
  }

  /** Wire a component pin to reader channel `ch` (0 = R8). */
  sense(compId: string, pin: number, ch: number) {
    return this.wire(compId, pin, this.reader, ch + 1);
  }

  /** Wire the package's VCC and GND pins to the rails. */
  power(icId: string) {
    const model = getModel(this.comp(icId).type)!;
    if (model.vccPin) this.wire(icId, model.vccPin, this.vcc, 1);
    if (model.gndPin) this.wire(icId, model.gndPin, this.gnd, 1);
    return this;
  }

  high(compId: string, pin: number) {
    return this.wire(compId, pin, this.vcc, 1);
  }

  low(compId: string, pin: number) {
    return this.wire(compId, pin, this.gnd, 1);
  }

  /** Drive an IC pin from writer channel `ch` (0-7). */
  drive(compId: string, pin: number, ch: number) {
    return this.wire(compId, pin, this.writer, ch + 1);
  }

  set(ch: number, value: 0 | 1) {
    const w = this.comp(this.writer);
    const values = [...((w.props.values as number[]) ?? [])];
    values[ch] = value;
    w.props = { ...w.props, values };
    this.engine.rebuild(this.circuit);
    return this;
  }

  /** Set several writer channels at once, LSB is channel 0. */
  setBits(bits: (0 | 1)[], from = 0) {
    bits.forEach((b, i) => this.set(from + i, b));
    return this;
  }

  run(passes = 1): this {
    for (let i = 0; i < passes; i++) this.engine.settle();
    return this;
  }

  tick(ms: number): this {
    this.engine.tick(ms);
    return this;
  }

  read(compId: string, pin: number): NetValue {
    return this.engine.valueAt(compId, pin);
  }

  reads(compId: string, pins: number[]): NetValue[] {
    return pins.map((p) => this.read(compId, p));
  }

  /** Apply inputs, settle, and read outputs - one row of a truth table. */
  row(inputs: (0 | 1)[], compId: string, outPins: number[], passes = 3): NetValue[] {
    this.setBits(inputs);
    this.run(passes);
    return this.reads(compId, outPins);
  }

  /** Toggle a clock pin driven by writer channel `ch`, low-high-low. */
  pulse(ch: number, passes = 3) {
    this.set(ch, 0).run(passes);
    this.set(ch, 1).run(passes);
    this.set(ch, 0).run(passes);
    return this;
  }
}
