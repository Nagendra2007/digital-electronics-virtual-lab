/**
 * Dropping parts onto the bench, and onto a breadboard the way a real one
 * behaves: a DIP straddles the centre channel with a leg in every hole, and
 * anything else lands with its pins seated on the hole grid.
 */
import { BB_COLS, BB_H, BB_ROWS, BB_W, holeX } from '../sim/breadboard';
import { PIN_PITCH, boundsOf, layoutOf, snapTo, toWorld } from '../sim/geometry';
import { getModel } from '../sim/registry';
import type { Circuit, ComponentModel, PlacedComponent } from '../sim/types';

export function findBoard(circuit: Circuit): PlacedComponent | undefined {
  return circuit.components.find((c) => c.type === 'breadboard');
}

export function isOverBoard(board: PlacedComponent, x: number, y: number): boolean {
  return (
    x >= board.x - 20 && x <= board.x + BB_W + 20 && y >= board.y - 20 && y <= board.y + BB_H + 20
  );
}

/** The y a DIP must sit at so its two rows of legs land in rows E and F. */
const dipRowY = (board: PlacedComponent) => board.y + BB_ROWS.bankTop + 4 * PIN_PITCH;

/** Every hole position on a board, as `x,y` offsets from the board origin. */
function holeSet(): Set<string> {
  if (!holeCache) {
    holeCache = new Set<string>();
    for (let c = 0; c < BB_COLS; c++) {
      for (const y of holeYs()) holeCache.add(`${holeX(c)},${y}`);
    }
  }
  return holeCache;
}
let holeCache: Set<string> | null = null;

/** Every hole row of a board, as an offset from the board origin. */
function holeYs(): number[] {
  const ys = [BB_ROWS.railTopPlus, BB_ROWS.railTopMinus, BB_ROWS.railBotPlus, BB_ROWS.railBotMinus];
  for (let r = 0; r < 5; r++) {
    ys.push(BB_ROWS.bankTop + r * PIN_PITCH);
    ys.push(BB_ROWS.bankBottom + r * PIN_PITCH);
  }
  return ys;
}

/** Offset from a part's origin to its left-most / top-most pin, after rotation. */
function pinExtent(model: ComponentModel, rot: PlacedComponent['rot']) {
  const probe: PlacedComponent = { id: '_', type: model.type, x: 0, y: 0, rot, props: {} };
  const l = layoutOf(model, probe);
  const pts = l.pins.map((p) => toWorld(probe, l, p.x, p.y));
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    cols: new Set(pts.map((p) => Math.round(p.x))).size,
  };
}

/** Columns already taken by DIPs seated across the channel. */
function occupiedColumns(circuit: Circuit, board: PlacedComponent, exclude?: string): Set<number> {
  const taken = new Set<number>();
  const rowY = dipRowY(board);
  for (const comp of circuit.components) {
    if (comp.id === exclude || comp.id === board.id) continue;
    const model = getModel(comp.type);
    if (!model || model.pkg === 'module') continue;
    if (comp.rot !== 90 || Math.abs(comp.y - rowY) > 1) continue;
    const { minX, cols } = pinExtent(model, 90);
    const first = Math.round((comp.x + minX - board.x - holeX(0)) / PIN_PITCH);
    // One spare column each side: that is the room you need to get a jumper
    // into the end pins, and it keeps two packages from looking like one.
    for (let i = -1; i <= cols; i++) taken.add(first + i);
  }
  return taken;
}

/** Nearest run of `width` free columns to `want`, or `want` if the board is full. */
function freeRun(taken: Set<number>, want: number, width: number): number {
  const max = BB_COLS - width;
  const fits = (c: number) => {
    if (c < 0 || c > max) return false;
    for (let i = 0; i < width; i++) if (taken.has(c + i)) return false;
    return true;
  };
  const start = Math.max(0, Math.min(max, want));
  if (fits(start)) return start;
  for (let d = 1; d <= BB_COLS; d++) {
    if (fits(start + d)) return start + d;
    if (fits(start - d)) return start - d;
  }
  return start;
}

/**
 * Where a part should sit when it is dropped at (x, y) - which is the position
 * of the part's own origin, not the cursor.
 */
export function placementFor(
  circuit: Circuit,
  model: ComponentModel,
  x: number,
  y: number,
  rot: PlacedComponent['rot'] = 0,
  movingId?: string,
): { x: number; y: number; rot: PlacedComponent['rot'] } {
  const board = findBoard(circuit);
  const grid = circuit.settings.snap;

  const loose = () => ({
    x: grid ? snapTo(x, 10) : Math.round(x),
    y: grid ? snapTo(y, 10) : Math.round(y),
    rot,
  });

  // Trainer panels stand beside the board rather than plugging into it.
  if (model.category === 'board' || model.boardMountable === false || !board) return loose();

  // A DIP straddles the centre channel: legs in row E and row F.
  if (model.pkg !== 'module') {
    const { minX, cols } = pinExtent(model, 90);
    if (!isOverBoard(board, x + minX, y)) return loose();
    const want = Math.round((x + minX - board.x - holeX(0)) / PIN_PITCH);
    const col = freeRun(occupiedColumns(circuit, board, movingId), want, cols);
    return { x: board.x + holeX(col) - minX, y: dipRowY(board), rot: 90 };
  }

  // Everything else: find the nearest seating where EVERY leg lands in a hole.
  // Checking the whole footprint is what stops a part hanging half off a bank.
  const probe: PlacedComponent = { id: '_', type: model.type, x: 0, y: 0, rot, props: {} };
  const l = layoutOf(model, probe);
  const offsets = l.pins.map((p) => toWorld(probe, l, p.x, p.y));
  if (!offsets.length) return loose();

  const first = offsets[0];
  const targetX = x + first.x;
  const targetY = y + first.y;
  if (!isOverBoard(board, targetX, targetY)) return loose();

  const holes = holeSet();
  let best: { x: number; y: number; d: number } | null = null;
  for (let c = 0; c < BB_COLS; c++) {
    for (const hy of holeYs()) {
      const hx = holeX(c);
      // Anchor the first pin here, then check the rest of the legs.
      const ox = hx - first.x;
      const oy = hy - first.y;
      if (!offsets.every((p) => holes.has(`${Math.round(ox + p.x)},${Math.round(oy + p.y)}`))) {
        continue;
      }
      const d = Math.hypot(board.x + hx - targetX, board.y + hy - targetY);
      if (!best || d < best.d) best = { x: board.x + ox, y: board.y + oy, d };
    }
  }

  // Nowhere on the board takes every leg: leave it standing beside the board.
  return best ? { x: best.x, y: best.y, rot } : loose();
}

/**
 * Somewhere sensible to drop a part when the student clicks it in the library:
 * clear of everything already on the bench, and near the board when there is
 * one, so a new package lands where it is about to be used.
 */
export function freeSpot(circuit: Circuit, model?: ComponentModel): { x: number; y: number } {
  const board = findBoard(circuit);

  // A package belongs in the board. Aim at the first column and let the
  // seating code slide it along to the first free run.
  if (board && model && model.pkg !== 'module') {
    return { x: board.x, y: dipRowY(board) };
  }

  const size = model
    ? boundsOf(model, { id: '_', type: model.type, x: 0, y: 0, rot: 0, props: {} })
    : null;
  const w = size?.w ?? 120;
  const h = size?.h ?? 80;

  // Parts sitting on a board are not in the way of anything, so the board
  // itself does not count as occupied space.
  const taken = circuit.components.flatMap((c) => {
    const m = getModel(c.type);
    return !m || m.category === 'board' ? [] : [boundsOf(m, c)];
  });

  const home = board
    ? { x: board.x + 40, y: board.y + BB_ROWS.bankBottom }
    : { x: taken.length ? Math.min(...taken.map((b) => b.x)) + 260 : 300, y: 160 };

  const clear = (x: number, y: number) =>
    y > 0 &&
    !taken.some(
      (b) => x < b.x + b.w + 24 && x + w + 24 > b.x && y < b.y + b.h + 24 && y + h + 24 > b.y,
    );

  const step = 40;
  for (let ring = 0; ring <= 24; ring++) {
    for (let dy = -ring; dy <= ring; dy++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const x = home.x + dx * step;
        const y = home.y + dy * step;
        if (clear(x, y)) return { x, y };
      }
    }
  }
  return home;
}
