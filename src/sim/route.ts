/**
 * Orthogonal wire routing.
 *
 * On a real bench you push a jumper flat around the packages rather than
 * laying it across them, so the lab routes wires the same way: an A* search on
 * a coarse grid that treats every package body as an obstacle, prefers long
 * straight runs over staircases, and nudges wires that share a corridor into
 * separate lanes so they stay readable.
 *
 * Pure geometry - no React and no DOM - so it is unit tested on its own.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RouteOptions {
  /** Grid step in workspace units. Smaller is neater and slower. */
  grid?: number;
  /** How far a wire stays clear of a package body. */
  clearance?: number;
  /** How close to an endpoint an obstacle is ignored, so a wire can reach its pin. */
  reach?: number;
  /** Cells already carrying a wire; sharing one costs a little extra. */
  lanes?: Map<number, number>;
  /** Give up and fall back to a plain elbow after this many expansions. */
  budget?: number;
  /** Index into DX/DY the wire is already travelling in when it starts. */
  entry?: number;
}

export interface RouteResult {
  points: Point[];
  /** False when no clear path existed and the plain elbow was used. */
  routed: boolean;
  /** Grid cells the accepted path occupies, for the caller to feed back as lanes. */
  cells: number[];
}

const DX = [1, -1, 0, 0];
const DY = [0, 0, 1, -1];

/** Which of DX/DY takes you from `a` to `b`, or -1 when they are the same point. */
function dirOf(a: Point, b: Point): number {
  if (b.x > a.x) return 0;
  if (b.x < a.x) return 1;
  if (b.y > a.y) return 2;
  if (b.y < a.y) return 3;
  return -1;
}

/** Cost of turning a corner, in cells. Straight wires read far better. */
const TURN_COST = 2.6;
/** Cost of sharing a cell with a wire that is already there. */
const LANE_COST = 1.4;

/** Insert a corner wherever a segment would otherwise run diagonally. */
export function elbow(points: Point[]): Point[] {
  if (!points.length) return [];
  const out: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const a = out[out.length - 1];
    const b = points[i];
    if (a.x !== b.x && a.y !== b.y) {
      out.push(
        Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? { x: b.x, y: a.y } : { x: a.x, y: b.y },
      );
    }
    out.push(b);
  }
  return out;
}

const between = (v: number, p: number, q: number) => v >= Math.min(p, q) && v <= Math.max(p, q);

/**
 * Drop points that sit in the middle of a straight run, or repeat the last one.
 * A point where the wire doubles back on itself is kept: it is a real corner
 * the student asked for, not a redundant vertex.
 */
export function simplify(points: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    if (out.length >= 2) {
      const a = out[out.length - 2];
      const b = out[out.length - 1];
      const straightX = a.x === b.x && b.x === p.x && between(b.y, a.y, p.y);
      const straightY = a.y === b.y && b.y === p.y && between(b.x, a.x, p.x);
      if (straightX || straightY) {
        out[out.length - 1] = p;
        continue;
      }
    }
    out.push(p);
  }
  return out;
}

/**
 * Remove the tiny out-and-back a pin makes when it does not sit exactly on the
 * routing grid. Anything longer than one cell is a real corner and is kept.
 */
export function trimSpurs(points: Point[], step: number): Point[] {
  const out = points.slice();
  for (let i = 1; i < out.length - 1; ) {
    const a = out[i - 1];
    const b = out[i];
    const c = out[i + 1];
    const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
    if ((dirOf(a, b) ^ 1) === dirOf(b, c) && len < step) {
      out.splice(i, 1);
      if (i > 1) i -= 1;
      continue;
    }
    i += 1;
  }
  return simplify(out);
}

/** A tiny binary heap; the routes are small enough that this is plenty. */
class Heap {
  private keys: number[] = [];
  private vals: number[] = [];

  get size() {
    return this.keys.length;
  }

  push(key: number, val: number) {
    this.keys.push(key);
    this.vals.push(val);
    let i = this.keys.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.keys[p] <= this.keys[i]) break;
      this.swap(p, i);
      i = p;
    }
  }

  pop(): number {
    const top = this.vals[0];
    const k = this.keys.pop()!;
    const v = this.vals.pop()!;
    if (this.keys.length) {
      this.keys[0] = k;
      this.vals[0] = v;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < this.keys.length && this.keys[l] < this.keys[m]) m = l;
        if (r < this.keys.length && this.keys[r] < this.keys[m]) m = r;
        if (m === i) break;
        this.swap(m, i);
        i = m;
      }
    }
    return top;
  }

  private swap(a: number, b: number) {
    [this.keys[a], this.keys[b]] = [this.keys[b], this.keys[a]];
    [this.vals[a], this.vals[b]] = [this.vals[b], this.vals[a]];
  }
}

/** The walkable grid covering the two endpoints and everything in between. */
class Field {
  readonly cols: number;
  readonly rows: number;
  readonly x0: number;
  readonly y0: number;
  readonly step: number;
  private readonly blocked: Uint8Array;

  constructor(area: Rect, step: number, obstacles: Rect[], open: Point[], reach: number) {
    this.step = step;
    this.x0 = Math.floor(area.x / step) * step;
    this.y0 = Math.floor(area.y / step) * step;
    this.cols = Math.max(1, Math.ceil(area.w / step) + 1);
    this.rows = Math.max(1, Math.ceil(area.h / step) + 1);
    this.blocked = new Uint8Array(this.cols * this.rows);

    for (const r of obstacles) {
      const ix0 = Math.max(0, Math.ceil((r.x - this.x0) / step));
      const ix1 = Math.min(this.cols - 1, Math.floor((r.x + r.w - this.x0) / step));
      const iy0 = Math.max(0, Math.ceil((r.y - this.y0) / step));
      const iy1 = Math.min(this.rows - 1, Math.floor((r.y + r.h - this.y0) / step));
      for (let iy = iy0; iy <= iy1; iy++) {
        for (let ix = ix0; ix <= ix1; ix++) this.blocked[iy * this.cols + ix] = 1;
      }
    }

    // Clear a little room around each endpoint, so a pin on the edge of a
    // package body is always reachable.
    for (const p of open) {
      const ix0 = Math.max(0, Math.floor((p.x - reach - this.x0) / step));
      const ix1 = Math.min(this.cols - 1, Math.ceil((p.x + reach - this.x0) / step));
      const iy0 = Math.max(0, Math.floor((p.y - reach - this.y0) / step));
      const iy1 = Math.min(this.rows - 1, Math.ceil((p.y + reach - this.y0) / step));
      for (let iy = iy0; iy <= iy1; iy++) {
        for (let ix = ix0; ix <= ix1; ix++) this.blocked[iy * this.cols + ix] = 0;
      }
    }
  }

  index(p: Point): number {
    const ix = Math.min(this.cols - 1, Math.max(0, Math.round((p.x - this.x0) / this.step)));
    const iy = Math.min(this.rows - 1, Math.max(0, Math.round((p.y - this.y0) / this.step)));
    return iy * this.cols + ix;
  }

  point(cell: number): Point {
    return {
      x: this.x0 + (cell % this.cols) * this.step,
      y: this.y0 + Math.floor(cell / this.cols) * this.step,
    };
  }

  isBlocked(cell: number): boolean {
    return this.blocked[cell] === 1;
  }
}

function bounds(points: Point[], rects: Rect[], pad: number): Rect {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const eat = (x: number, y: number) => {
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const p of points) eat(p.x, p.y);
  for (const r of rects) {
    eat(r.x, r.y);
    eat(r.x + r.w, r.y + r.h);
  }
  if (!Number.isFinite(x0)) return { x: 0, y: 0, w: 1, h: 1 };
  return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
}

/**
 * One leg of a wire: an orthogonal path from `a` to `b` that keeps clear of
 * `obstacles`. Falls back to a plain elbow when the parts box the wire in.
 */
function routeLeg(
  a: Point,
  b: Point,
  field: Field,
  lanes: Map<number, number> | undefined,
  budget: number,
  enterDir: number,
): { points: Point[]; routed: boolean } {
  const start = field.index(a);
  const goal = field.index(b);
  if (start === goal) return { points: [a, b], routed: true };
  if (field.isBlocked(start) || field.isBlocked(goal)) return { points: elbow([a, b]), routed: false };

  const gx = goal % field.cols;
  const gy = Math.floor(goal / field.cols);
  const heuristic = (cell: number) =>
    Math.abs((cell % field.cols) - gx) + Math.abs(Math.floor(cell / field.cols) - gy);

  // A state is a cell plus the direction we arrived from, so turns can be
  // charged for: that is what keeps the routes straight instead of stepped.
  const cost = new Map<number, number>();
  const from = new Map<number, number>();
  const closed = new Set<number>();
  const open = new Heap();
  let reached = -1;
  let expansions = 0;

  // Starting off in the direction the wire arrived in is free; anything else is
  // a corner, which is what stops a wire from leaving a pin sideways.
  for (let d = 0; d < 4; d++) {
    const s = start * 4 + d;
    const g = enterDir < 0 || d === enterDir ? 0 : TURN_COST;
    cost.set(s, g);
    open.push(g + heuristic(start), s);
  }

  while (open.size && expansions < budget) {
    const state = open.pop();
    if (closed.has(state)) continue;
    closed.add(state);
    const cell = state >> 2;
    const dir = state & 3;
    const g = cost.get(state)!;
    expansions += 1;

    if (cell === goal) {
      reached = state;
      break;
    }

    const cx = cell % field.cols;
    const cy = (cell - cx) / field.cols;
    for (let d = 0; d < 4; d++) {
      const nx = cx + DX[d];
      const ny = cy + DY[d];
      if (nx < 0 || ny < 0 || nx >= field.cols || ny >= field.rows) continue;
      const next = ny * field.cols + nx;
      if (field.isBlocked(next) && next !== goal) continue;

      let step = 1;
      if (d !== dir) step += TURN_COST;
      const used = lanes?.get(next);
      if (used) step += LANE_COST * Math.min(used, 3);

      const nState = next * 4 + d;
      if (closed.has(nState)) continue;
      const ng = g + step;
      const seen = cost.get(nState);
      if (seen !== undefined && seen <= ng) continue;
      cost.set(nState, ng);
      from.set(nState, state);
      open.push(ng + heuristic(next), nState);
    }
  }

  if (reached < 0) return { points: elbow([a, b]), routed: false };

  const path: Point[] = [];
  let s = reached;
  for (;;) {
    path.push(field.point(s >> 2));
    const prev = from.get(s);
    if (prev === undefined) break;
    s = prev;
  }
  path.reverse();
  return { points: [a, ...path, b], routed: true };
}

/**
 * Route a wire through `points` (pin, optional student corners, pin) so that it
 * runs around the parts instead of over them.
 */
export function routeWire(
  points: Point[],
  obstacles: Rect[],
  opts: RouteOptions = {},
): RouteResult {
  const step = opts.grid ?? 10;
  const clearance = opts.clearance ?? 8;
  const reach = opts.reach ?? 14;
  const budget = opts.budget ?? 40000;

  if (points.length < 2) return { points: simplify(points), routed: true, cells: [] };

  const grown = obstacles.map((r) => ({
    x: r.x - clearance,
    y: r.y - clearance,
    w: r.w + clearance * 2,
    h: r.h + clearance * 2,
  }));
  const area = bounds(points, grown, 80);
  // A bench big enough to blow the search up is a bench nobody is looking at.
  if (area.w / step > 600 || area.h / step > 600) {
    return { points: simplify(elbow(points)), routed: false, cells: [] };
  }

  const field = new Field(area, step, grown, points, reach);
  const out: Point[] = [];
  let routed = true;
  let enter = opts.entry ?? -1;
  for (let i = 1; i < points.length; i++) {
    const leg = routeLeg(points[i - 1], points[i], field, opts.lanes, budget, enter);
    if (!leg.routed) routed = false;
    out.push(...(i === 1 ? leg.points : leg.points.slice(1)));
    for (let k = leg.points.length - 1; k > 0; k--) {
      const d = dirOf(leg.points[k - 1], leg.points[k]);
      if (d >= 0) {
        enter = d;
        break;
      }
    }
  }

  const path = trimSpurs(simplify(elbow(out)), step);
  const cells: number[] = [];
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const n = Math.round(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / step);
    for (let k = 0; k <= n; k++) {
      cells.push(
        field.index({ x: a.x + ((b.x - a.x) * k) / (n || 1), y: a.y + ((b.y - a.y) * k) / (n || 1) }),
      );
    }
  }
  return { points: path, routed, cells };
}
