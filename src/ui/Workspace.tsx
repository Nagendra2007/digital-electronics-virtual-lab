/**
 * The bench surface: pan, zoom, place parts, drag them around, and wire pin to
 * pin. All hit-testing goes through the netlist, so a breadboard hole is just
 * another pin as far as the mouse is concerned.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { boundsOf, pinWorldPos } from '../sim/geometry';
import { getModel } from '../sim/registry';
import { elbow, routeWire, simplify } from '../sim/route';
import { pinKey } from '../sim/types';
import { ZOOM_MAX, ZOOM_MIN, useLab } from '../store/lab';
import { ComponentShape } from './symbols';
import { COLORS, netColor } from './theme';
import { placementFor } from './placement';
import type { PinInfo } from '../sim/netlist';
import type { Rect } from '../sim/route';
import type { PinRef, PlacedComponent } from '../sim/types';

type Point = { x: number; y: number };

interface Pending {
  from: PinRef;
  pts: Point[];
  cursor: Point;
}

/** A press that has not been decided yet - it may turn into a tap, a drag or a pinch. */
interface Press {
  x: number;
  y: number;
  world: Point;
  pin: PinRef | null;
}

type DragState =
  | { kind: 'comp'; ids: string[]; startX: number; startY: number; dx: number; dy: number }
  // `tap` is the part the pan started on: a drag moves the view, but letting
  // go without moving picks that part up instead.
  | { kind: 'pan'; startX: number; startY: number; ox: number; oy: number; tap?: string }
  | { kind: 'marquee'; x0: number; y0: number; x1: number; y1: number }
  | null;

/** Fingers are blunter than a mouse, so widen the pin target on touch. */
const COARSE_POINTER =
  typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches === true;
const HIT_RADIUS = COARSE_POINTER ? 19 : 11;

/**
 * Where a wire leaves a pin: a short stub along the pin, out of the package.
 * The length is a whole routing cell, so the stub lands on the router's grid
 * and the wire does not start with a tiny kink.
 */
function stubOut(p: { x: number; y: number; side: string; hole?: boolean }, d = 10): Point {
  if (p.hole) return { x: p.x, y: p.y };
  switch (p.side) {
    case 'L':
      return { x: p.x - d, y: p.y };
    case 'R':
      return { x: p.x + d, y: p.y };
    case 'T':
      return { x: p.x, y: p.y - d };
    default:
      return { x: p.x, y: p.y + d };
  }
}

const stubOfPin = (p: PinInfo, d = 10): Point =>
  stubOut({ x: p.x, y: p.y, side: p.side, hole: p.def.kind === 'hole' }, d);

export function buildPath(points: Point[]): string {
  const v = elbow(points);
  if (!v.length) return '';
  return `M ${v[0].x} ${v[0].y}` + v.slice(1).map((p) => ` L ${p.x} ${p.y}`).join('');
}

function distToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function Workspace({
  placing,
  onPlaced,
}: {
  placing: string | null;
  onPlaced: () => void;
}) {
  const lab = useLab();
  const { circuit, engine, view, tool } = lab;
  const svgRef = useRef<SVGSVGElement>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [hover, setHover] = useState<PinInfo | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const [measured, setMeasured] = useState(false);
  /** The press in progress in wire mode, decided when the finger lifts. */
  const tapRef = useRef<Press | null>(null);
  /** Always the current drawing, so routing does not pin an old copy in a closure. */
  const circuitRef = useRef(circuit);
  circuitRef.current = circuit;
  // Where the two fingers started, so a pinch can zoom and drag at once.
  const pinchRef = useRef<{
    dist: number;
    zoom: number;
    px: number;
    py: number;
    vx: number;
    vy: number;
  } | null>(null);

  const toWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      return {
        x: (clientX - rect.left - view.x) / view.zoom,
        y: (clientY - rect.top - view.y) / view.zoom,
      };
    },
    [view],
  );

  const pinAt = useCallback(
    (p: Point): PinInfo | null => {
      let best: PinInfo | null = null;
      let bestD = (HIT_RADIUS / Math.max(view.zoom, 0.35)) ** 2;
      for (const info of engine.netlist.pins.values()) {
        const dx = info.x - p.x;
        const dy = info.y - p.y;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = info;
        }
      }
      return best;
    },
    [engine, view.zoom],
  );

  const compAt = useCallback(
    (p: Point, boards: boolean): PlacedComponent | null => {
      const list = circuit.components;
      for (let i = list.length - 1; i >= 0; i--) {
        const comp = list[i];
        const model = getModel(comp.type);
        if (!model) continue;
        if (model.category === 'board' !== boards) continue;
        const b = boundsOf(model, comp);
        if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return comp;
      }
      return null;
    },
    [circuit.components],
  );

  /**
   * Pin positions straight from the geometry rather than from the netlist, so
   * routing is a pure function of the drawing and does not have to wait for the
   * engine to be rebuilt.
   */
  const pinPos = useCallback(
    (ref: PinRef): { x: number; y: number; side: string; hole: boolean } | null => {
      const comp = circuitRef.current.components.find((c) => c.id === ref.c);
      const model = comp && getModel(comp.type);
      if (!comp || !model) return null;
      const p = pinWorldPos(model, comp, ref.p);
      if (!p) return null;
      return { ...p, hole: model.pins.find((d) => d.n === ref.p)?.kind === 'hole' };
    },
    [],
  );

  /**
   * What the routing actually depends on: where the parts are and what is
   * wired to what. Flicking a switch changes a part's *properties*, which
   * makes a new circuit object every time - and re-laying every wire because
   * somebody toggled D0 would make the bench stutter.
   */
  const layoutKey = useMemo(
    () =>
      circuit.components.map((c) => `${c.id}~${c.type}~${c.x}~${c.y}~${c.rot}`).join('|') +
      '#' +
      circuit.wires.map((w) => `${w.id}~${w.a.c}.${w.a.p}>${w.b.c}.${w.b.p}~${w.pts.length}`).join('|'),
    [circuit.components, circuit.wires],
  );

  /**
   * Every wire's path, worked out once per edit. Wires are pushed around the
   * packages rather than across them, and wires sharing a corridor are nudged
   * into separate lanes - which is what you would do with real jumpers.
   */
  const routes = useMemo(() => {
    const drawing = circuitRef.current;
    const auto = drawing.settings.autoRoute !== false;
    const obstacles: Rect[] = drawing.components.flatMap((c) => {
      const m = getModel(c.type);
      return !m || m.category === 'board' ? [] : [boundsOf(m, c)];
    });
    const map = new Map<string, Point[]>();

    const jobs = drawing.wires.flatMap((w) => {
      const a = pinPos(w.a);
      const b = pinPos(w.b);
      return a && b ? [{ id: w.id, a, b, pts: w.pts }] : [];
    });

    // Hand-placed corners are the student's own routing, so they only apply
    // when the automatic routing is off.
    if (!auto) {
      for (const j of jobs) {
        const head = { x: j.a.x, y: j.a.y };
        const tail = { x: j.b.x, y: j.b.y };
        map.set(j.id, simplify(elbow([head, stubOut(j.a), ...j.pts, stubOut(j.b), tail])));
      }
      return map;
    }

    // Short wires first: a short hop deserves the straight line, and a long
    // one has plenty of room to go round.
    const span = (j: (typeof jobs)[number]) =>
      Math.abs(j.a.x - j.b.x) + Math.abs(j.a.y - j.b.y);
    const order = [...jobs].sort((p, q) => span(p) - span(q));

    const lanes = new Map<number, number>();
    const taken = new Map<string, number[]>();
    const occupy = (cells: number[], by: number) => {
      for (const c of cells) {
        const n = (lanes.get(c) ?? 0) + by;
        if (n > 0) lanes.set(c, n);
        else lanes.delete(c);
      }
    };

    const lay = (j: (typeof jobs)[number]) => {
      // The pins themselves are part of the route, so a wire leaves a package
      // the way the pin points instead of turning against it.
      const path = [{ x: j.a.x, y: j.a.y }, stubOut(j.a), stubOut(j.b), { x: j.b.x, y: j.b.y }];
      const r = routeWire(path, obstacles, { lanes });
      map.set(j.id, simplify(elbow(r.points)));
      taken.set(j.id, r.cells);
      occupy(r.cells, 1);
    };

    for (const j of order) lay(j);

    // Second pass. The first wire down was laid before it knew about any of
    // the others; pulling each one up and laying it again lets every wire
    // route around the finished picture instead of a half-built one.
    if (order.length > 1 && order.length <= 40) {
      for (const j of order) {
        occupy(taken.get(j.id) ?? [], -1);
        lay(j);
      }
    }
    return map;
  }, [layoutKey, circuit.settings.autoRoute, pinPos]);

  const wireAt = useCallback(
    (p: Point): string | null => {
      const tol = (COARSE_POINTER ? 10 : 6) / Math.max(view.zoom, 0.35);
      let best: string | null = null;
      let bestD = tol;
      for (const w of circuit.wires) {
        const v = routes.get(w.id);
        if (!v) continue;
        for (let i = 1; i < v.length; i++) {
          const d = distToSegment(p, v[i - 1], v[i]);
          if (d < bestD) {
            bestD = d;
            best = w.id;
          }
        }
      }
      return best;
    },
    [circuit.wires, routes, view.zoom],
  );

  const place = useCallback(
    (type: string, at: Point) => {
      const model = getModel(type);
      if (!model) return;
      const spot = placementFor(circuit, model, at.x, at.y);
      lab.addComponent(type, spot.x, spot.y, spot.rot);
    },
    [circuit, lab],
  );

  // ---------------------------------------------------------------- pointer

  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    // Capture keeps a drag alive outside the SVG. It throws for a pointer the
    // browser no longer considers active, which must not kill the gesture.
    try {
      (e.target as Element).setPointerCapture?.(e.pointerId);
    } catch {
      /* not capturable: the drag still works inside the workspace */
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      const rect = svgRef.current?.getBoundingClientRect();
      pinchRef.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        zoom: view.zoom,
        px: (a.x + b.x) / 2 - (rect?.left ?? 0),
        py: (a.y + b.y) / 2 - (rect?.top ?? 0),
        vx: view.x,
        vy: view.y,
      };
      // A second finger means the first was never a tap. Whatever it landed
      // on, it was reaching for the zoom. A half-drawn wire is left alone -
      // pinching in to find the far pin is exactly what you do next.
      tapRef.current = null;
      setDrag(null);
      return;
    }

    const world = toWorld(e.clientX, e.clientY);
    const startPan = (tap?: string) =>
      setDrag({ kind: 'pan', startX: e.clientX, startY: e.clientY, ox: view.x, oy: view.y, tap });

    if (placing) {
      place(placing, world);
      onPlaced();
      return;
    }

    if (e.button === 1 || tool === 'pan' || e.altKey) {
      startPan();
      return;
    }

    // Wiring is a mode of its own. A breadboard is nothing but pins, so if any
    // touch on one started a wire there would be no way to move the view or
    // pick anything up.
    //
    // Nothing is committed here, only remembered: the first finger of a pinch
    // arrives as an ordinary pointerdown, and until it lifts there is no way
    // to tell a tap on a pin from the start of a two-finger zoom.
    if (tool === 'wire' || pending) {
      const pin = pinAt(world);
      if (pin || pending) {
        tapRef.current = {
          x: e.clientX,
          y: e.clientY,
          world,
          pin: pin ? { c: pin.compId, p: pin.pin } : null,
        };
        return;
      }
    }

    // Parts first, then wires, then the board underneath everything.
    const overWire = wireAt(world);
    const comp = compAt(world, false) ?? (overWire ? null : compAt(world, true));
    if (!comp && overWire) {
      if (tool === 'delete') lab.deleteWire(overWire);
      else {
        lab.setSelectedWires([overWire]);
        lab.setSelection([]);
      }
      return;
    }
    if (comp) {
      if (tool === 'delete') {
        lab.deleteComponents([comp.id]);
        return;
      }
      // On a touch screen the board covers the whole workspace, so dragging it
      // has to move the view: otherwise the bench is a prison. A tap that does
      // not move still selects it, which is how you get at Rotate.
      if (COARSE_POINTER && getModel(comp.type)?.category === 'board') {
        startPan(comp.id);
        return;
      }
      const already = lab.selection.includes(comp.id);
      const ids = e.shiftKey
        ? already
          ? lab.selection.filter((i) => i !== comp.id)
          : [...lab.selection, comp.id]
        : already
          ? lab.selection
          : [comp.id];
      lab.setSelection(ids);
      lab.setSelectedWires([]);
      setDrag({ kind: 'comp', ids, startX: world.x, startY: world.y, dx: 0, dy: 0 });
      return;
    }

    if (!e.shiftKey) {
      lab.setSelection([]);
      lab.setSelectedWires([]);
    }
    // A finger on bare bench drags the sheet; a mouse draws a selection box.
    if (COARSE_POINTER) {
      startPan();
      return;
    }
    setDrag({ kind: 'marquee', x0: world.x, y0: world.y, x1: world.x, y1: world.y });
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (pointers.current.has(e.pointerId)) {
      pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }
    if (pointers.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointers.current.values()];
      const p = pinchRef.current;
      const rect = svgRef.current?.getBoundingClientRect();
      const px = (a.x + b.x) / 2 - (rect?.left ?? 0);
      const py = (a.y + b.y) / 2 - (rect?.top ?? 0);
      const zoom = Math.min(
        ZOOM_MAX,
        Math.max(ZOOM_MIN, (p.zoom * Math.hypot(a.x - b.x, a.y - b.y)) / p.dist),
      );
      // Two fingers pinch and drag at once: whatever you grabbed stays under
      // them, so the board can be moved as well as scaled.
      const k = zoom / p.zoom;
      lab.setView({ zoom, x: px - (p.px - p.vx) * k, y: py - (p.py - p.vy) * k });
      return;
    }

    const world = toWorld(e.clientX, e.clientY);

    if (drag?.kind === 'pan') {
      lab.setView((v) => ({
        ...v,
        x: drag.ox + (e.clientX - drag.startX),
        y: drag.oy + (e.clientY - drag.startY),
      }));
      return;
    }
    if (drag?.kind === 'comp') {
      const step = circuit.settings.snap ? 10 : 1;
      const dx = Math.round((world.x - drag.startX) / step) * step;
      const dy = Math.round((world.y - drag.startY) / step) * step;
      if (dx !== drag.dx || dy !== drag.dy) setDrag({ ...drag, dx, dy });
      return;
    }
    if (drag?.kind === 'marquee') {
      setDrag({ ...drag, x1: world.x, y1: world.y });
      return;
    }

    // An undecided press that starts moving declares itself: from a pin it is
    // a wire drawn by dragging, from bare bench it is a pan - which is how you
    // shift the view mid-wire without a second finger.
    const press = tapRef.current;
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8) {
      if (press.pin && !pending) {
        setPending({ from: press.pin, pts: [], cursor: world });
      } else if (!press.pin) {
        tapRef.current = null;
        setDrag({ kind: 'pan', startX: press.x, startY: press.y, ox: view.x, oy: view.y });
        return;
      }
    } else if (pending) {
      setPending({ ...pending, cursor: world });
    }

    const pin = pinAt(world);
    if (pin?.key !== hover?.key) setHover(pin);
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;

    if (drag?.kind === 'pan') {
      const moved = Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY);
      if (drag.tap && moved < 6) {
        lab.setSelection([drag.tap]);
        lab.setSelectedWires([]);
      }
      setDrag(null);
      return;
    }

    if (drag?.kind === 'comp') {
      if (drag.dx || drag.dy) {
        const board = circuit.components.find((c) => c.type === 'breadboard');
        // A part dropped on the board settles into the holes.
        if (board && drag.ids.length === 1 && drag.ids[0] !== board.id) {
          const comp = circuit.components.find((c) => c.id === drag.ids[0]);
          const model = comp && getModel(comp.type);
          if (comp && model) {
            const spot = placementFor(circuit, model, comp.x + drag.dx, comp.y + drag.dy, comp.rot, comp.id);
            lab.setComponentPos(comp.id, spot.x, spot.y, spot.rot);
            setDrag(null);
            return;
          }
        }
        lab.moveComponents(drag.ids, drag.dx, drag.dy);
      }
      setDrag(null);
      return;
    }

    if (drag?.kind === 'marquee') {
      const x0 = Math.min(drag.x0, drag.x1);
      const x1 = Math.max(drag.x0, drag.x1);
      const y0 = Math.min(drag.y0, drag.y1);
      const y1 = Math.max(drag.y0, drag.y1);
      if (x1 - x0 > 4 || y1 - y0 > 4) {
        const hit = circuit.components.filter((c) => {
          const model = getModel(c.type);
          if (!model || model.category === 'board') return false;
          const b = boundsOf(model, c);
          return b.x < x1 && b.x + b.w > x0 && b.y < y1 && b.y + b.h > y0;
        });
        lab.setSelection(hit.map((c) => c.id));
      }
      setDrag(null);
      return;
    }

    // Wiring is decided here, on the lift. A press that turned into a pinch
    // had its record torn up when the second finger landed, so it does
    // nothing at all - which is the whole point.
    const press = tapRef.current;
    tapRef.current = null;
    if (press && e.button === 0) {
      const world = toWorld(e.clientX, e.clientY);
      const dragged = Math.hypot(e.clientX - press.x, e.clientY - press.y) > 8;
      // A tap ends on the pin it began on; a drag ends wherever it let go.
      const landed = dragged ? pinAt(world) : null;
      const target: PinRef | null = dragged
        ? landed
          ? { c: landed.compId, p: landed.pin }
          : null
        : press.pin;

      if (pending) {
        if (target && !(target.c === pending.from.c && target.p === pending.from.p)) {
          lab.addWire(pending.from, target, pending.pts);
          setPending(null);
        } else if (!dragged && !target && circuit.settings.autoRoute === false) {
          // A tap on bare bench puts a corner in - by hand only. With Tidy
          // wires on the path is not the student's to place.
          setPending({
            ...pending,
            pts: [...pending.pts, { x: Math.round(press.world.x), y: Math.round(press.world.y) }],
          });
        }
      } else if (target) {
        setPending({ from: target, pts: [], cursor: world });
      }
    }
    setDrag(null);
  };

  /** A cancelled pointer is not a gesture: forget it rather than acting on it. */
  const onPointerCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinchRef.current = null;
    tapRef.current = null;
    setDrag(null);
  };

  /**
   * The wheel belongs to the bench, not to the browser.
   *
   * React registers its own wheel handler passively, so preventDefault() from
   * an onWheel prop is ignored and Ctrl+wheel zooms the whole page instead of
   * the workspace. Listening here, non-passively, is what keeps the zoom
   * inside the bench.
   */
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (e.ctrlKey || e.metaKey) {
        // Exponential so a trackpad glides and a mouse notch is a sane step.
        const step = Math.exp(-e.deltaY / 500);
        lab.setView((v) => {
          const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, v.zoom * step));
          const k = zoom / v.zoom;
          return { zoom, x: px - (px - v.x) * k, y: py - (py - v.y) * k };
        });
      } else {
        lab.setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [lab]);

  // Report the drawing area so Fit can frame the bench on any screen.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const report = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        lab.setViewport(r.width, r.height);
        setMeasured(true);
      }
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, [lab]);

  // Frame the bench on first paint and whenever a new circuit is loaded.
  useEffect(() => {
    if (measured) lab.fitToContents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measured, lab.fitRequest]);

  // Leaving the wire tool abandons a half-drawn wire rather than leaving it
  // armed to finish on the next thing you touch.
  useEffect(() => {
    if (tool !== 'wire') setPending(null);
  }, [tool]);

  // ------------------------------------------------------------- keyboard

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;

      if (e.key === 'Escape') {
        setPending(null);
        lab.setSelection([]);
        lab.setSelectedWires([]);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        lab.deleteSelection();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) lab.redo();
        else lab.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        lab.redo();
      } else if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '_'].includes(e.key)) {
        // Ctrl+plus / Ctrl+minus zoom the bench, not the browser window.
        e.preventDefault();
        const inward = e.key === '+' || e.key === '=';
        lab.setView((v) => ({ ...v, zoom: v.zoom * (inward ? 1.15 : 1 / 1.15) }));
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        lab.duplicateSelection();
      } else if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'r') {
        lab.rotateSelection();
      } else if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'w') {
        lab.setTool('wire');
      } else if (!e.ctrlKey && !e.metaKey && e.key.toLowerCase() === 'v') {
        lab.setTool('select');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lab]);

  // ---------------------------------------------------------------- render

  const wires = useMemo(() => {
    void lab.version;
    return circuit.wires.map((w) => {
      const v = routes.get(w.id);
      if (!v) return null;
      const net = engine.netStateAt(w.a.c, w.a.p);
      const color = lab.showWireState ? netColor(engine, w.a.c, w.a.p) : w.color;
      const selected = lab.selectedWires.includes(w.id);
      const d = `M ${v[0].x} ${v[0].y}` + v.slice(1).map((p) => ` L ${p.x} ${p.y}`).join('');
      return (
        <g key={w.id} pointerEvents="none">
          <path className="wire" d={d} stroke="var(--sheet-bg)" strokeWidth={5.5} opacity={0.9} />
          <path
            className={`wire ${lab.showWireState && net?.floating ? 'wire-float' : ''}`}
            d={d}
            stroke={selected ? COLORS.accent : color}
            strokeWidth={selected ? 3.5 : 2.6}
          />
        </g>
      );
    });
  }, [circuit.wires, engine, lab, routes]);

  const pendingPath = useMemo(() => {
    if (!pending) return null;
    const from = engine.netlist.pins.get(pinKey(pending.from.c, pending.from.p));
    if (!from) return null;
    const target = hover ? { x: hover.x, y: hover.y } : pending.cursor;
    const pts = [{ x: from.x, y: from.y }, stubOfPin(from), ...pending.pts, target];
    return (
      <g pointerEvents="none">
        <path
          className="wire"
          d={buildPath(pts)}
          stroke={COLORS.accent}
          strokeWidth={2.6}
          strokeDasharray="6 4"
        />
        {pending.pts.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={3} fill={COLORS.accent} />
        ))}
      </g>
    );
  }, [pending, hover, engine]);

  const gridSize = 20;

  return (
    <div className="relative h-full w-full overflow-hidden workspace">
      <svg
        ref={svgRef}
        className="h-full w-full select-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => {
          e.preventDefault();
          setPending(null);
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const type = e.dataTransfer.getData('text/component');
          if (type) place(type, toWorld(e.clientX, e.clientY));
        }}
        style={{ cursor: tool === 'pan' ? 'grab' : pending ? 'crosshair' : 'default' }}
      >
        <defs>
          <pattern
            id="grid"
            width={gridSize * view.zoom}
            height={gridSize * view.zoom}
            patternUnits="userSpaceOnUse"
            x={view.x}
            y={view.y}
          >
            <circle cx={0.5} cy={0.5} r={1} fill="var(--sheet-grid)" />
          </pattern>
        </defs>
        {circuit.settings.grid && <rect width="100%" height="100%" fill="url(#grid)" />}

        <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
          {circuit.components.map((comp) => {
            const model = getModel(comp.type);
            if (!model) return null;
            const dragging = drag?.kind === 'comp' && drag.ids.includes(comp.id);
            const offset = dragging ? `translate(${drag.dx} ${drag.dy})` : undefined;
            return (
              <g key={comp.id} transform={offset} opacity={dragging ? 0.75 : 1}>
                <ComponentShape
                  comp={comp}
                  model={model}
                  engine={engine}
                  selected={lab.selection.includes(comp.id)}
                  hoverPin={hover?.compId === comp.id ? hover.pin : null}
                  wireMode={tool === 'wire' || !!pending}
                  onProps={(props) => lab.setProps(comp.id, props)}
                />
              </g>
            );
          })}

          {wires}
          {pendingPath}

          {drag?.kind === 'marquee' && (
            <rect
              x={Math.min(drag.x0, drag.x1)}
              y={Math.min(drag.y0, drag.y1)}
              width={Math.abs(drag.x1 - drag.x0)}
              height={Math.abs(drag.y1 - drag.y0)}
              fill={COLORS.accent}
              fillOpacity={0.08}
              stroke={COLORS.accent}
              strokeDasharray="4 3"
            />
          )}
        </g>
      </svg>

      {hover && (
        <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-bench-700 bg-bench-900/95 px-3 py-2 text-[11px] shadow-lg">
          <div className="font-mono text-bench-200">
            {hover.comp.label ?? hover.model.label} &middot; pin {hover.pin} &middot;{' '}
            <span className="text-accent">{hover.def.name}</span>
          </div>
          <div className="mt-0.5 max-w-[260px] text-bench-400">{hover.def.fn}</div>
          <div className="mt-1 flex items-center gap-2 text-bench-400">
            level
            <span className="font-mono text-bench-100">{String(engine.valueAt(hover.compId, hover.pin))}</span>
            {engine.netStateAt(hover.compId, hover.pin)?.floating && (
              <span className="text-warn">floating</span>
            )}
          </div>
        </div>
      )}

      {pending && (
        <div className="absolute bottom-3 left-1/2 flex max-w-[92%] -translate-x-1/2 items-center gap-2 rounded-full border border-accent/40 bg-bench-900 px-3 py-1.5 text-[11px] text-accent shadow-lg">
          <span className="truncate">
            {circuit.settings.autoRoute === false
              ? 'Drawing a wire - tap a pin to finish, tap the sheet for a corner'
              : 'Drawing a wire - tap a pin to finish; the path sorts itself out'}
          </span>
          <button
            className="btn btn-sm shrink-0"
            onPointerDown={(e) => {
              e.stopPropagation();
              setPending(null);
            }}
          >
            Cancel
          </button>
        </div>
      )}

      {placing && (
        <div className="absolute bottom-3 left-1/2 flex max-w-[92%] -translate-x-1/2 items-center gap-2 rounded-full border border-accent/40 bg-bench-900 px-3 py-1.5 text-[11px] text-accent shadow-lg">
          <span className="truncate">Tap the bench to place {getModel(placing)?.label}</span>
          <button
            className="btn btn-sm shrink-0"
            onPointerDown={(e) => {
              e.stopPropagation();
              onPlaced();
            }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

