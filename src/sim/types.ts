/**
 * Core data types for the virtual lab.
 *
 * Everything in `src/sim` is pure TypeScript with no React or DOM dependency,
 * so the simulation engine can be unit tested (and reused) on its own.
 */

/** A value a pin can drive. `Z` = high impedance (3-state output turned off). */
export type Logic = 0 | 1 | 'X' | 'Z';

/** The value a *net* settles to. A net is never `Z`: an undriven net is `X` (floating). */
export type NetValue = 0 | 1 | 'X';

export type PinKind =
  | 'input'
  | 'output'
  | 'power'
  | 'ground'
  | 'clock'
  | 'nc'
  | 'hole'; // breadboard tie point

export interface PinDef {
  /** Physical pin number as printed on the package (1-based). */
  n: number;
  /** Datasheet pin name, e.g. "1A", "VCC", "QD", "CLR". */
  name: string;
  kind: PinKind;
  /** Plain-English pin function, shown in the pin inspector. */
  fn: string;
  /** True when the pin is active LOW (drawn with an overbar). */
  activeLow?: boolean;
  /** Which internal block the pin belongs to, e.g. "Gate 1". */
  group?: string;
}

export type Category =
  | 'gate'
  | 'decoder'
  | 'encoder'
  | 'mux'
  | 'flipflop'
  | 'counter'
  | 'register'
  | 'display'
  | 'source'
  | 'io'
  | 'passive'
  | 'board';

export interface TruthTable {
  headers: string[];
  rows: string[][];
  note?: string;
}

/** Everything a component needs in order to compute its outputs for one delta step. */
export interface EvalCtx {
  /** Resolved value of the net attached to `pin` (`X` when the pin is floating). */
  read(pin: number): NetValue;
  /** Drive `pin`. Use `Z` to release a 3-state output. */
  write(pin: number, value: Logic): void;
  /** Persistent per-instance state (flip-flop contents, clock phase, ...). */
  state: Record<string, any>;
  /** Instance properties set from the UI (switch position, clock frequency, ...). */
  props: Record<string, any>;
  /** False when the part needs VCC/GND and they are not correctly connected. */
  powered: boolean;
  /** Simulated time in milliseconds. */
  time: number;
  /** Milliseconds elapsed since the previous tick. */
  dt: number;
}

export interface ComponentModel {
  /** Stable id used in saved files, e.g. `ic:7408` or `writer`. */
  type: string;
  /** Short name printed on the package, e.g. "7408". */
  label: string;
  /** Full name, e.g. "Quad 2-input AND gate". */
  name: string;
  category: Category;
  description: string;
  pins: PinDef[];
  /** `DIP14` / `DIP16` draw a real dual-in-line package; `module` draws a panel. */
  pkg: 'DIP14' | 'DIP16' | 'module';
  vccPin?: number;
  gndPin?: number;
  /** When true the engine refuses to produce outputs until VCC/GND are wired. */
  needsPower: boolean;
  /**
   * A weak source (a pull-up or pull-down resistor): it only sets the level of
   * a node when nothing else is driving it.
   */
  weak?: boolean;
  /**
   * False for trainer panels that are too tall to seat in a breadboard - they
   * stand beside it and you run wires across, exactly like the real kit.
   */
  boardMountable?: boolean;
  truthTable?: TruthTable;
  /** Datasheet-style notes rendered in the info panel. */
  notes?: string[];
  /** Search keywords in addition to label/name. */
  keywords?: string[];
  defaultProps?: Record<string, any>;
  initState?: () => Record<string, any>;
  evaluate: (ctx: EvalCtx) => void;
  /**
   * Pin numbers that are electrically common inside the part
   * (breadboard strips, the two ends of a series resistor, ...).
   */
  internalBonds?: (comp: PlacedComponent) => number[][];
  /** Pin count override for modules whose pin list is generated. */
  dynamicPins?: (comp: PlacedComponent) => PinDef[];
}

export interface PlacedComponent {
  id: string;
  type: string;
  x: number;
  y: number;
  rot: 0 | 90 | 180 | 270;
  label?: string;
  props: Record<string, any>;
}

export interface PinRef {
  /** Component id. */
  c: string;
  /** Pin number. */
  p: number;
}

export interface Wire {
  id: string;
  a: PinRef;
  b: PinRef;
  /** Intermediate waypoints, allowing multi-segment (elbowed) wires. */
  pts: { x: number; y: number }[];
  color: string;
}

export interface CircuitSettings {
  breadboard: boolean;
  /** How an unconnected input behaves: honest `X`, or the simplified pull-down. */
  floatingMode: 'undefined' | 'pulldown';
  snap: boolean;
  grid: boolean;
  /** Push wires around the packages instead of laying them straight across. */
  autoRoute?: boolean;
}

export interface Circuit {
  id: string;
  name: string;
  components: PlacedComponent[];
  wires: Wire[];
  settings: CircuitSettings;
  createdAt: number;
  updatedAt: number;
  /** Set when the circuit was started from an experiment. */
  experimentId?: string;
}

export const pinKey = (c: string, p: number) => `${c}:${p}`;

export function defaultSettings(): CircuitSettings {
  return { breadboard: false, floatingMode: 'undefined', snap: true, grid: true, autoRoute: true };
}
