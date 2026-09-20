/**
 * Dropping parts onto the bench, and onto a breadboard the way a real one
 * behaves: a package straddles the centre channel with a leg in every hole,
 * and anything else lands with its pins seated on the hole grid.
 *
 * Everything here works from the holes' *world* positions rather than from
 * column arithmetic, so it keeps working when the board itself is turned -
 * which is how you make a long board fit down a phone screen.
 */
import { BB_H, BB_ROWS, BB_W, holeX } from '../sim/breadboard';
import {
  PIN_PITCH,
  boundsOf,
  layoutOf,
  pinOffsets,
  snapTo,
  toLocal,
  toWorld,
} from '../sim/geometry';
import { getModel } from '../sim/registry';
import type { Circuit, ComponentModel, PlacedComponent } from '../sim/types';

type Point = { x: number; y: number };
type Box = { x: number; y: number; w: number; h: number };

export function findBoard(circuit: Circuit): PlacedComponent | undefined {
  return circuit.components.find((c) => c.type === 'breadboard');
}

/** True when a point is over the board, whichever way the board is turned. */
export function isOverBoard(board: PlacedComponent, x: number, y: number): boolean {
  const model = getModel(board.type);
  if (!model) return false;
  const p = toLocal(board, layoutOf(model, board), x, y);
  return p.x >= -20 && p.x <= BB_W + 20 && p.y >= -20 && p.y <= BB_H + 20;
}

/**
 * Every hole of the board in workspace coordinates. Recomputing 840 of these
 * on every drop is cheap, but the board rarely moves, so one is kept.
 */
let holeCache: { key: string; pts: Point[]; keys: Set<string> } | null = null;

function holesOf(board: PlacedComponent): { pts: Point[]; keys: Set<string> } {
  const key = `${board.type}:${board.x}:${board.y}:${board.rot}`;
  if (holeCache?.key === key) return holeCache;
  const model = getModel(board.type);
  if (!model) return { pts: [], keys: new Set() };
  const l = layoutOf(model, board);
  const pts = l.pins.map((p) => toWorld(board, l, p.x, p.y));
  const keys = new Set(pts.map((p) => `${Math.round(p.x)},${Math.round(p.y)}`));
  holeCache = { key, pts, keys };
  return holeCache;
}

/**
 * Which way up a part has to be to seat. A package lies across the centre
 * channel, so it is always square to the board however the board is turned;
 * anything else keeps the way it is, or follows the board if that will not sit.
 */
function seatingRotations(
  model: ComponentModel,
  board: PlacedComponent,
  rot: PlacedComponent['rot'],
): PlacedComponent['rot'][] {
  const turn = (a: number) => ((a + 360) % 360) as PlacedComponent['rot'];
  if (model.pkg !== 'module') return [turn(90 + board.rot)];
  const withBoard = turn(rot + board.rot);
  return withBoard === rot ? [rot] : [rot, withBoard];
}

/** Bounding boxes of everything else on the bench that a part could land on. */
function otherBoxes(circuit: Circuit, exclude?: string): Box[] {
  return circuit.components.flatMap((c) => {
    if (c.id === exclude) return [];
    const model = getModel(c.type);
    return !model || model.category === 'board' ? [] : [boundsOf(model, c)];
  });
}

const overlaps = (a: Box, b: Box) =>
  a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

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

  const { pts, keys } = holesOf(board);
  const others = otherBoxes(circuit, movingId);
  let best: { x: number; y: number; rot: PlacedComponent['rot']; d: number } | null = null;

  for (const r of seatingRotations(model, board, rot)) {
    const offsets = pinOffsets(model, r);
    if (!offsets.length) continue;
    const first = offsets[0];
    const target = { x: x + first.x, y: y + first.y };
    if (!isOverBoard(board, target.x, target.y)) continue;

    // Anchor the first pin on each hole in turn and keep the nearest seating
    // where EVERY leg lands in a hole and nothing is already in the way.
    for (const hole of pts) {
      const ox = hole.x - first.x;
      const oy = hole.y - first.y;
      const d = Math.hypot(hole.x - target.x, hole.y - target.y);
      if (best && d >= best.d) continue;
      if (!offsets.every((p) => keys.has(`${Math.round(ox + p.x)},${Math.round(oy + p.y)}`))) {
        continue;
      }
      const box = boundsOf(model, { id: '_', type: model.type, x: ox, y: oy, rot: r, props: {} });
      if (others.some((b) => overlaps(b, box))) continue;
      best = { x: ox, y: oy, rot: r, d };
    }
  }

  // Nowhere on the board takes every leg: leave it standing where it was put.
  return best ? { x: best.x, y: best.y, rot: best.rot } : loose();
}

/** Parts with every leg sitting in a hole of this board. */
export function seatedOn(circuit: Circuit, board: PlacedComponent): PlacedComponent[] {
  const { keys } = holesOf(board);
  return circuit.components.filter((c) => {
    const model = c.id === board.id ? null : getModel(c.type);
    if (!model || model.category === 'board') return false;
    const offsets = pinOffsets(model, c.rot);
    return (
      offsets.length > 0 &&
      offsets.every((p) => keys.has(`${Math.round(c.x + p.x)},${Math.round(c.y + p.y)}`))
    );
  });
}

/**
 * Turn a board a quarter turn, carrying everything plugged into it round with
 * it. Every leg stays in the hole it was in, so the circuit survives - which is
 * not what happens if you turn a real board, but it is what you meant.
 */
export function rotateBoard(circuit: Circuit, boardId: string): void {
  const board = circuit.components.find((c) => c.id === boardId);
  const model = board && getModel(board.type);
  if (!board || !model) return;
  const l = layoutOf(model, board);
  const before = boundsOf(model, board);

  // Anchor each passenger by its first pin, in the board's own frame.
  const riders = seatedOn(circuit, board).map((comp) => {
    const first = pinOffsets(getModel(comp.type)!, comp.rot)[0];
    return {
      comp,
      local: toLocal(board, l, comp.x + first.x, comp.y + first.y),
      rot: (((comp.rot - board.rot) % 360) + 360) % 360,
    };
  });

  board.rot = ((board.rot + 90) % 360) as PlacedComponent['rot'];

  for (const rider of riders) {
    const rot = ((rider.rot + board.rot) % 360) as PlacedComponent['rot'];
    const anchor = toWorld(board, l, rider.local.x, rider.local.y);
    const first = pinOffsets(getModel(rider.comp.type)!, rot)[0];
    rider.comp.rot = rot;
    rider.comp.x = Math.round(anchor.x - first.x);
    rider.comp.y = Math.round(anchor.y - first.y);
  }

  // The trainer panels have nowhere else to live, so they stay beside the
  // board and keep the side they were on. A board stood upright to suit a
  // phone is no use if the panels stay spread out where the flat one left them.
  const after = boundsOf(model, board);
  const midBefore = before.x + before.w / 2;
  for (const panel of circuit.components) {
    const pm = getModel(panel.type);
    if (pm?.boardMountable !== false) continue;
    const box = boundsOf(pm, panel);
    const wasLeft = box.x + box.w / 2 < midBefore;
    panel.x = Math.round(wasLeft ? after.x - box.w - 30 : after.x + after.w + 30);
    panel.y = Math.round(after.y + (after.h - box.h) / 2);
  }
}

/**
 * A quarter turn for a part that is sitting in a board.
 *
 * A package can only lie across the centre channel, so a quarter turn does not
 * fit: turning one really means lifting it out and putting it back the other
 * way round, which is a half turn, and is exactly what you do with the real
 * thing. This finds the next turn that still seats and keeps the part where it
 * was. Returns null when the part is not in a board, or when nothing fits -
 * and then it is an ordinary quarter turn on the bench.
 */
export function turnOnBoard(
  circuit: Circuit,
  comp: PlacedComponent,
): { x: number; y: number; rot: PlacedComponent['rot'] } | null {
  const board = findBoard(circuit);
  const model = getModel(comp.type);
  if (!board || !model) return null;
  if (!seatedOn(circuit, board).some((c) => c.id === comp.id)) return null;

  const { pts, keys } = holesOf(board);
  const others = otherBoxes(circuit, comp.id);
  const now = boundsOf(model, comp);
  const cx = now.x + now.w / 2;
  const cy = now.y + now.h / 2;

  for (let step = 1; step <= 3; step++) {
    const rot = ((comp.rot + step * 90) % 360) as PlacedComponent['rot'];
    const offsets = pinOffsets(model, rot);
    if (!offsets.length) continue;
    const first = offsets[0];
    let best: { x: number; y: number; d: number } | null = null;

    for (const hole of pts) {
      const ox = hole.x - first.x;
      const oy = hole.y - first.y;
      if (!offsets.every((p) => keys.has(`${Math.round(ox + p.x)},${Math.round(oy + p.y)}`))) {
        continue;
      }
      const box = boundsOf(model, { id: '_', type: comp.type, x: ox, y: oy, rot, props: {} });
      if (others.some((b) => overlaps(b, box))) continue;
      // Turn it on the spot: the seating nearest to where it already sits.
      const d = Math.hypot(box.x + box.w / 2 - cx, box.y + box.h / 2 - cy);
      if (!best || d < best.d) best = { x: ox, y: oy, d };
    }
    if (best) return { x: best.x, y: best.y, rot };
  }
  return null;
}

/**
 * Somewhere sensible to drop a part when the student clicks it in the library:
 * clear of everything already on the bench, and on the board when there is one,
 * because that is where a package is about to be used.
 */
export function freeSpot(circuit: Circuit, model?: ComponentModel): Point {
  const board = findBoard(circuit);
  const boardModel = board && getModel(board.type);

  // A package belongs in the board. Aim its first pin at the start of row E
  // and let the seating search slide it along to the first free run.
  if (board && boardModel && model && model.pkg !== 'module') {
    const aim = toWorld(
      board,
      layoutOf(boardModel, board),
      holeX(0),
      BB_ROWS.bankTop + 4 * PIN_PITCH,
    );
    const first = pinOffsets(model, seatingRotations(model, board, 0)[0])[0];
    return first ? { x: aim.x - first.x, y: aim.y - first.y } : aim;
  }

  const size = model
    ? boundsOf(model, { id: '_', type: model.type, x: 0, y: 0, rot: 0, props: {} })
    : null;
  const w = size?.w ?? 120;
  const h = size?.h ?? 80;

  // Parts sitting on a board are not in the way of anything, so the board
  // itself does not count as occupied space.
  const taken = otherBoxes(circuit);

  const home =
    board && boardModel
      ? toWorld(board, layoutOf(boardModel, board), 40, BB_ROWS.bankBottom)
      : { x: taken.length ? Math.min(...taken.map((b) => b.x)) + 260 : 300, y: 160 };

  const clear = (x: number, y: number) =>
    y > 0 &&
    !taken.some((b) =>
      overlaps(b, { x: x - 24, y: y - 24, w: w + 48, h: h + 48 }),
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
