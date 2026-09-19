/**
 * Lab state: the circuit on the bench, the engine that runs it, the selection,
 * the tool in hand, undo/redo and the simulation loop.
 *
 * The engine is deliberately kept in a ref and mutated: React state holds the
 * *drawing*, the engine holds the *electrical* state, and a counter ties the two
 * together so the canvas repaints after every settle.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import { CircuitEngine } from '../sim/engine';
import { createComponent, getModel, newCircuit, nextDesignator } from '../sim/registry';
import { PIN_PITCH, boundsOf } from '../sim/geometry';
import { validate } from '../sim/validate';
import { loadBench, saveBench } from '../sim/storage';
import type { Circuit, CircuitSettings, NetValue, PinRef, PlacedComponent } from '../sim/types';
import type { Issue } from '../sim/validate';
import type { Experiment } from '../data/experiments';

export type Tool = 'select' | 'wire' | 'delete' | 'pan';

export interface View {
  zoom: number;
  x: number;
  y: number;
}

export interface Probe {
  id: string;
  compId: string;
  pin: number;
  label: string;
}

export interface Sample {
  t: number;
  values: Record<string, NetValue>;
}

const TICK_MS = 50;
const MAX_SAMPLES = 1200;
const MAX_HISTORY = 60;

export interface LabApi {
  circuit: Circuit;
  engine: CircuitEngine;
  /** Bumps on every simulation update; components read it to repaint. */
  version: number;
  issues: Issue[];
  selection: string[];
  selectedWires: string[];
  tool: Tool;
  view: View;
  running: boolean;
  probes: Probe[];
  samples: Sample[];
  canUndo: boolean;
  canRedo: boolean;
  activeExperiment: Experiment | null;
  showWireState: boolean;

  setTool(t: Tool): void;
  setView(v: View | ((v: View) => View)): void;
  /** The Workspace reports its own size so the view can be fitted to it. */
  setViewport(w: number, h: number): void;
  /** Frame every part on the bench, whatever the screen size. */
  fitToContents(): void;
  /** Bumps when a new circuit is loaded and the view should be re-fitted. */
  fitRequest: number;
  /** Re-frame the bench once the edit in flight has landed. */
  requestFit(): void;
  setSelection(ids: string[]): void;
  setSelectedWires(ids: string[]): void;
  setShowWireState(on: boolean): void;

  addComponent(type: string, x: number, y: number, rot?: PlacedComponent['rot']): string | null;
  moveComponents(ids: string[], dx: number, dy: number, commit?: boolean): void;
  setComponentPos(id: string, x: number, y: number, rot?: PlacedComponent['rot']): void;
  deleteSelection(): void;
  /** Delete named parts, whatever happens to be selected. */
  deleteComponents(ids: string[]): void;
  rotateSelection(): void;
  duplicateSelection(): void;
  setProps(id: string, props: Record<string, unknown>): void;
  setLabel(id: string, label: string): void;

  addWire(a: PinRef, b: PinRef, pts?: { x: number; y: number }[], color?: string): boolean;
  deleteWire(id: string): void;
  setWireColor(id: string, color: string): void;

  setSettings(patch: Partial<CircuitSettings>): void;
  rename(name: string): void;
  replaceCircuit(c: Circuit, experiment?: Experiment | null): void;
  clearBench(): void;
  resetBench(): void;

  undo(): void;
  redo(): void;

  run(): void;
  stop(): void;
  stepOnce(): void;
  resetSim(): void;

  addProbe(compId: string, pin: number, label: string): void;
  removeProbe(id: string): void;
  clearSamples(): void;

  setActiveExperiment(e: Experiment | null): void;
}

export const ZOOM_MIN = 0.25;
export const ZOOM_MAX = 3;
/** Fitting never blows a lone part up past this. */
const ZOOM_FIT_MAX = 1.8;
/**
 * Screen pixels between two breadboard holes, below which the board stops being
 * something you can actually wire - on a phone especially.
 */
const MIN_HOLE_PX = 16;

type Box = { x: number; y: number; w: number; h: number };

const clampZoom = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

function boxesOf(circuit: Circuit): (Box & { type: string })[] {
  return circuit.components.flatMap((c) => {
    const model = getModel(c.type);
    return model ? [{ ...boundsOf(model, c), type: c.type }] : [];
  });
}

/** The view that puts `boxes` in the middle of a w x h drawing area. */
function frame(boxes: Box[], w: number, h: number, pad: number, minZoom: number): View {
  const x0 = Math.min(...boxes.map((b) => b.x));
  const y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w));
  const y1 = Math.max(...boxes.map((b) => b.y + b.h));
  const bw = Math.max(1, x1 - x0);
  const bh = Math.max(1, y1 - y0);
  const zoom = Math.min(
    ZOOM_MAX,
    Math.max(
      minZoom,
      Math.min(ZOOM_FIT_MAX, (w - pad * 2) / bw, (h - pad * 2) / bh),
    ),
  );
  return { zoom, x: (w - bw * zoom) / 2 - x0 * zoom, y: (h - bh * zoom) / 2 - y0 * zoom };
}

/**
 * Frame the board itself, keeping the holes big enough to hit with a finger.
 *
 * On a narrow screen that means fitting the board's height and letting it run
 * off the sides - you pan along it, which is what you do with a long board on
 * a small desk anyway.
 */
function frameBoard(box: Box, w: number, h: number): View {
  const pad = 14;
  const zw = (w - pad * 2) / box.w;
  const zh = (h - pad * 2) / box.h;
  let zoom = Math.min(zw, zh, ZOOM_FIT_MAX);
  if (zoom * PIN_PITCH < MIN_HOLE_PX) zoom = Math.min(zh, ZOOM_FIT_MAX);
  zoom = clampZoom(Math.max(zoom, MIN_HOLE_PX / PIN_PITCH));

  const bw = box.w * zoom;
  const bh = box.h * zoom;
  return {
    zoom,
    x: (bw <= w - pad * 2 ? (w - bw) / 2 : pad) - box.x * zoom,
    y: (bh <= h - pad * 2 ? (h - bh) / 2 : pad) - box.y * zoom,
  };
}

/**
 * Frame the bench inside a w x h drawing area.
 *
 * Normally that means everything. But the breadboard is where the work
 * actually happens, so when fitting the whole bench would shrink the holes
 * below the size of a fingertip, the board is framed on its own instead and
 * the trainer panels are left to one side to pan to.
 */
function fitView(circuit: Circuit, w: number, h: number): View {
  const boxes = boxesOf(circuit);
  if (!boxes.length || w < 40 || h < 40) return { zoom: 0.9, x: 40, y: 20 };

  const all = frame(boxes, w, h, 24, ZOOM_MIN);
  const board = boxes.find((b) => b.type === 'breadboard');
  if (!board || all.zoom * PIN_PITCH >= MIN_HOLE_PX) return all;
  return frameBoard(board, w, h);
}

const LabContext = createContext<LabApi | null>(null);

export function useLab(): LabApi {
  const ctx = useContext(LabContext);
  if (!ctx) throw new Error('useLab must be used inside <LabProvider>');
  return ctx;
}

let wireSeq = 0;
const wireId = () => `w${Date.now().toString(36)}${(wireSeq += 1).toString(36)}`;

export function LabProvider({ children }: { children: ReactNode }) {
  const [circuit, setCircuit] = useState<Circuit>(() => loadBench() ?? newCircuit('Free practice'));
  const [version, setVersion] = useState(0);
  const [selection, setSelection] = useState<string[]>([]);
  const [selectedWires, setSelectedWires] = useState<string[]>([]);
  const [tool, setTool] = useState<Tool>('select');
  const [view, setViewState] = useState<View>({ zoom: 0.9, x: 40, y: 20 });
  // True while the view is still auto-framed; any manual pan or zoom clears it.
  const autoFit = useRef(true);
  const [running, setRunning] = useState(true);
  const [issues, setIssues] = useState<Issue[]>([]);
  const [probes, setProbes] = useState<Probe[]>([]);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [activeExperiment, setActiveExperiment] = useState<Experiment | null>(null);
  const [showWireState, setShowWireState] = useState(true);
  const [fitRequest, setFitRequest] = useState(0);
  const viewportRef = useRef({ w: 1000, h: 600 });

  const past = useRef<Circuit[]>([]);
  const future = useRef<Circuit[]>([]);
  const [historyVersion, setHistoryVersion] = useState(0);

  const engineRef = useRef<CircuitEngine | null>(null);
  if (!engineRef.current) {
    engineRef.current = new CircuitEngine(circuit, getModel, {
      floatingMode: circuit.settings.floatingMode,
    });
  }
  const engine = engineRef.current;

  const probesRef = useRef(probes);
  probesRef.current = probes;

  // --- simulation -----------------------------------------------------------

  const recordSample = useCallback(() => {
    const list = probesRef.current;
    if (!list.length) return;
    const values: Record<string, NetValue> = {};
    for (const p of list) values[p.id] = engine.valueAt(p.compId, p.pin);
    setSamples((prev) => {
      const next = [...prev, { t: engine.time, values }];
      return next.length > MAX_SAMPLES ? next.slice(next.length - MAX_SAMPLES) : next;
    });
  }, [engine]);

  // Rebuild and settle whenever the drawing changes.
  useEffect(() => {
    engine.options.floatingMode = circuit.settings.floatingMode;
    engine.rebuild(circuit);
    engine.settle();
    setIssues(validate(engine, circuit));
    setVersion((v) => v + 1);
    saveBench(circuit);
  }, [circuit, engine]);

  // The run loop: advance time, settle, repaint.
  useEffect(() => {
    if (!running) return;
    let n = 0;
    const id = window.setInterval(() => {
      engine.tick(TICK_MS);
      recordSample();
      setVersion((v) => v + 1);
      n += 1;
      if (n % 10 === 0) setIssues(validate(engine, circuit));
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [running, engine, circuit, recordSample]);

  // --- editing --------------------------------------------------------------

  const pushHistory = useCallback((snapshot: Circuit) => {
    past.current.push(snapshot);
    if (past.current.length > MAX_HISTORY) past.current.shift();
    future.current = [];
    setHistoryVersion((v) => v + 1);
  }, []);

  const commit = useCallback(
    (fn: (draft: Circuit) => void, history = true) => {
      setCircuit((prev) => {
        if (history) pushHistory(prev);
        const next: Circuit = structuredClone(prev);
        fn(next);
        next.updatedAt = Date.now();
        return next;
      });
    },
    [pushHistory],
  );

  const api = useMemo<LabApi>(() => {
    const addComponent: LabApi['addComponent'] = (type, x, y, rot = 0) => {
      const model = getModel(type);
      if (!model) return null;
      // The caller has already worked out where this goes (grid snap, or a
      // breadboard hole): re-snapping here would knock it off the holes.
      const comp = createComponent(type, Math.round(x), Math.round(y), circuit, rot);
      if (!comp) return null;
      commit((d) => {
        comp.label = nextDesignator(d, model);
        // A board goes underneath: everything else is plugged into it.
        if (model.category === 'board') d.components.unshift(comp);
        else d.components.push(comp);
      });
      setSelection([comp.id]);
      return comp.id;
    };

    return {
      circuit,
      engine,
      version,
      issues,
      selection,
      selectedWires,
      tool,
      view,
      running,
      probes,
      samples,
      showWireState,
      canUndo: past.current.length > 0,
      canRedo: future.current.length > 0,
      activeExperiment,

      setTool,
      fitRequest,

      requestFit() {
        setFitRequest((v) => v + 1);
      },

      setView(v) {
        // A deliberate pan or zoom stops the view re-framing itself.
        autoFit.current = false;
        setViewState((prev) => {
          const next = typeof v === 'function' ? v(prev) : v;
          return { ...next, zoom: clampZoom(next.zoom) };
        });
      },

      setViewport(w, h) {
        const prev = viewportRef.current;
        viewportRef.current = { w, h };
        // Rotating a phone or opening a panel re-frames the bench, but only
        // while the student has not moved the view themselves.
        if (autoFit.current && (Math.abs(prev.w - w) > 8 || Math.abs(prev.h - h) > 8)) {
          setViewState(fitView(circuit, w, h));
        }
      },

      fitToContents() {
        const { w, h } = viewportRef.current;
        setViewState(fitView(circuit, w, h));
        autoFit.current = true;
      },

      setSelection,
      setSelectedWires,
      setShowWireState,
      addComponent,

      moveComponents(ids, dx, dy, doCommit = true) {
        commit((d) => {
          for (const c of d.components) {
            if (!ids.includes(c.id)) continue;
            c.x += dx;
            c.y += dy;
          }
        }, doCommit);
      },

      setComponentPos(id, x, y, rot) {
        commit((d) => {
          const c = d.components.find((k) => k.id === id);
          if (c) {
            c.x = x;
            c.y = y;
            if (rot !== undefined) c.rot = rot;
          }
        });
      },

      deleteSelection() {
        if (!selection.length && !selectedWires.length) return;
        commit((d) => {
          d.components = d.components.filter((c) => !selection.includes(c.id));
          d.wires = d.wires.filter(
            (w) =>
              !selectedWires.includes(w.id) &&
              !selection.includes(w.a.c) &&
              !selection.includes(w.b.c),
          );
        });
        setSelection([]);
        setSelectedWires([]);
      },

      deleteComponents(ids) {
        if (!ids.length) return;
        commit((d) => {
          d.components = d.components.filter((c) => !ids.includes(c.id));
          d.wires = d.wires.filter((w) => !ids.includes(w.a.c) && !ids.includes(w.b.c));
        });
        setSelection((prev) => prev.filter((id) => !ids.includes(id)));
      },

      rotateSelection() {
        if (!selection.length) return;
        commit((d) => {
          for (const c of d.components) {
            if (selection.includes(c.id)) c.rot = (((c.rot + 90) % 360) as PlacedComponent['rot']);
          }
        });
      },

      duplicateSelection() {
        if (!selection.length) return;
        const copies: string[] = [];
        commit((d) => {
          for (const id of selection) {
            const src = d.components.find((c) => c.id === id);
            if (!src) continue;
            const model = getModel(src.type);
            if (!model) continue;
            const copy: PlacedComponent = {
              ...structuredClone(src),
              id: `${src.id}c${copies.length}${Date.now().toString(36).slice(-3)}`,
              x: src.x + 30,
              y: src.y + 30,
            };
            copy.label = nextDesignator(d, model);
            d.components.push(copy);
            copies.push(copy.id);
          }
        });
        setSelection(copies);
      },

      setProps(id, props) {
        // Property changes are frequent (every switch flick): keep them out of
        // the undo stack so undo still means "undo my last edit".
        commit((d) => {
          const c = d.components.find((k) => k.id === id);
          if (c) c.props = { ...c.props, ...props };
        }, false);
      },

      setLabel(id, label) {
        commit((d) => {
          const c = d.components.find((k) => k.id === id);
          if (c) c.label = label;
        });
      },

      addWire(a, b, pts = [], color = '#7dd3fc') {
        if (a.c === b.c && a.p === b.p) return false;
        const exists = circuit.wires.some(
          (w) =>
            (w.a.c === a.c && w.a.p === a.p && w.b.c === b.c && w.b.p === b.p) ||
            (w.a.c === b.c && w.a.p === b.p && w.b.c === a.c && w.b.p === a.p),
        );
        if (exists) return false;
        commit((d) => {
          d.wires.push({ id: wireId(), a, b, pts, color });
        });
        return true;
      },

      deleteWire(id) {
        commit((d) => {
          d.wires = d.wires.filter((w) => w.id !== id);
        });
        setSelectedWires((prev) => prev.filter((w) => w !== id));
      },

      setWireColor(id, color) {
        commit((d) => {
          const w = d.wires.find((k) => k.id === id);
          if (w) w.color = color;
        });
      },

      setSettings(patch) {
        commit((d) => {
          d.settings = { ...d.settings, ...patch };
        }, false);
      },

      rename(name) {
        commit((d) => {
          d.name = name;
        }, false);
      },

      replaceCircuit(c, experiment = null) {
        pushHistory(circuit);
        setSelection([]);
        setSelectedWires([]);
        setSamples([]);
        setProbes([]);
        engine.reset();
        setActiveExperiment(experiment);
        setCircuit(c);
        setFitRequest((v) => v + 1);
      },

      clearBench() {
        pushHistory(circuit);
        setSelection([]);
        setSelectedWires([]);
        engine.reset();
        setCircuit((prev) => ({ ...prev, components: [], wires: [], updatedAt: Date.now() }));
      },

      resetBench() {
        pushHistory(circuit);
        setSelection([]);
        setSelectedWires([]);
        setSamples([]);
        engine.reset();
        setActiveExperiment(null);
        setCircuit(newCircuit('Free practice'));
        setFitRequest((v) => v + 1);
      },

      undo() {
        const prev = past.current.pop();
        if (!prev) return;
        future.current.push(circuit);
        setSelection([]);
        setSelectedWires([]);
        setCircuit(prev);
        setHistoryVersion((v) => v + 1);
      },

      redo() {
        const next = future.current.pop();
        if (!next) return;
        past.current.push(circuit);
        setSelection([]);
        setSelectedWires([]);
        setCircuit(next);
        setHistoryVersion((v) => v + 1);
      },

      run() {
        setRunning(true);
      },

      stop() {
        setRunning(false);
      },

      stepOnce() {
        engine.tick(TICK_MS);
        recordSample();
        setIssues(validate(engine, circuit));
        setVersion((v) => v + 1);
      },

      resetSim() {
        engine.reset();
        engine.settle();
        setSamples([]);
        setIssues(validate(engine, circuit));
        setVersion((v) => v + 1);
      },

      addProbe(compId, pin, label) {
        setProbes((prev) =>
          prev.some((p) => p.compId === compId && p.pin === pin)
            ? prev
            : [...prev, { id: `${compId}:${pin}`, compId, pin, label }],
        );
      },

      removeProbe(id) {
        setProbes((prev) => prev.filter((p) => p.id !== id));
      },

      clearSamples() {
        setSamples([]);
      },

      setActiveExperiment,
    };
  }, [
    circuit,
    engine,
    version,
    issues,
    selection,
    selectedWires,
    tool,
    view,
    running,
    probes,
    samples,
    showWireState,
    activeExperiment,
    fitRequest,
    commit,
    pushHistory,
    recordSample,
    historyVersion,
  ]);

  return <LabContext.Provider value={api}>{children}</LabContext.Provider>;
}

