/**
 * Parts must physically fit the breadboard: every pin of a part has to line up
 * with a hole, and two DIPs must not be dropped on top of each other.
 */
import { describe, expect, it } from 'vitest';
import { Bench } from './helpers';
import { ALL_MODELS, canRotate, getModel, normaliseBoards } from '../src/sim/registry';
import { PIN_PITCH, layoutOf, pinWorldPos, seatsOnBoard } from '../src/sim/geometry';
import { BB, BB_COLS, BB_ROWS, breadboard, holeX } from '../src/sim/breadboard';
import { placementFor } from '../src/ui/placement';
import type { PlacedComponent } from '../src/sim/types';

/** Every hole of a board placed at the origin. */
function holePositions(): Set<string> {
  const out = new Set<string>();
  const ys = [
    BB_ROWS.railTopPlus,
    BB_ROWS.railTopMinus,
    BB_ROWS.railBotPlus,
    BB_ROWS.railBotMinus,
    ...[0, 1, 2, 3, 4].map((r) => BB_ROWS.bankTop + r * PIN_PITCH),
    ...[0, 1, 2, 3, 4].map((r) => BB_ROWS.bankBottom + r * PIN_PITCH),
  ];
  for (let c = 0; c < BB_COLS; c++) for (const y of ys) out.add(`${holeX(c)},${y}`);
  return out;
}

describe('the board itself', () => {
  it('is a full-size board: 60 columns, 840 tie points', () => {
    expect(BB_COLS).toBe(60);
    expect(BB.total).toBe(840);
    expect(breadboard.pins).toHaveLength(840);
  });

  it('does not rotate, because everything is placed against its hole grid', () => {
    expect(canRotate(breadboard)).toBe(false);
    expect(canRotate(getModel('ic:7408')!)).toBe(true);
  });

  it('puts a board back flat when an older saved bench had it turned', () => {
    const b = new Bench();
    const board = b.add('breadboard');
    b.comp(board).rot = 90;
    const ic = b.add('ic:7408');
    b.comp(ic).rot = 90;

    normaliseBoards(b.circuit);
    expect(b.comp(board).rot).toBe(0);
    expect(b.comp(ic).rot, 'only boards are flattened').toBe(90);
  });
});

describe('parts fit the breadboard', () => {
  it('every module has its pins on the hole pitch', () => {
    const offenders = ALL_MODELS.filter(
      (m) =>
        m.pkg === 'module' &&
        m.category !== 'board' &&
        m.boardMountable !== false &&
        !seatsOnBoard(m),
    ).map((m) => m.label);
    expect(offenders).toEqual([]);
  });

  it('a DIP dropped on the board lands with every leg in a hole', () => {
    const holes = holePositions();
    for (const model of ALL_MODELS.filter((m) => m.pkg !== 'module')) {
      const b = new Bench();
      const board = b.add('breadboard');
      b.comp(board).x = 0;
      b.comp(board).y = 0;

      const ic = b.add(model.type);
      const spot = placementFor(b.circuit, model, 300, 260, 0, ic);
      const comp = b.comp(ic);
      comp.x = spot.x;
      comp.y = spot.y;
      comp.rot = spot.rot;
      b.engine.rebuild(b.circuit);

      expect(spot.rot, `${model.label} must straddle the channel`).toBe(90);
      for (const p of model.pins) {
        const pos = pinWorldPos(model, comp, p.n)!;
        expect(
          holes.has(`${Math.round(pos.x)},${Math.round(pos.y)}`),
          `${model.label} pin ${p.n} landed at ${Math.round(pos.x)},${Math.round(pos.y)} - not a hole`,
        ).toBe(true);
      }
    }
  });

  it('a module dropped on the board lands with every leg in a hole', () => {
    const holes = holePositions();
    const seatable = ALL_MODELS.filter(
      (m) => m.pkg === 'module' && m.category !== 'board' && m.boardMountable !== false,
    );
    for (const model of seatable) {
      const b = new Bench();
      const board = b.add('breadboard');
      b.comp(board).x = 0;
      b.comp(board).y = 0;

      const id = b.add(model.type);
      const spot = placementFor(b.circuit, model, 250, 300, 0, id);
      const comp = b.comp(id);
      comp.x = spot.x;
      comp.y = spot.y;
      b.engine.rebuild(b.circuit);

      for (const p of layoutOf(model, comp).pins) {
        const pos = pinWorldPos(model, comp, p.n)!;
        expect(
          holes.has(`${Math.round(pos.x)},${Math.round(pos.y)}`),
          `${model.label} pin ${p.n} landed at ${Math.round(pos.x)},${Math.round(pos.y)} - not a hole`,
        ).toBe(true);
      }
    }
  });

  it('a second DIP shifts sideways instead of landing on the first', () => {
    const b = new Bench();
    const board = b.add('breadboard');
    b.comp(board).x = 0;
    b.comp(board).y = 0;

    const place = (type: string, x: number) => {
      const model = getModel(type)!;
      const id = b.add(type);
      const spot = placementFor(b.circuit, model, x, 260, 0, id);
      const comp = b.comp(id);
      comp.x = spot.x;
      comp.y = spot.y;
      comp.rot = spot.rot;
      b.engine.rebuild(b.circuit);
      return comp;
    };

    const first = place('ic:7408', 200);
    const second = place('ic:7400', 205); // dropped almost on top of the first
    const third = place('ic:7486', 205);

    const span = (c: PlacedComponent) => {
      const model = getModel(c.type)!;
      const xs = model.pins.map((p) => pinWorldPos(model, c, p.n)!.x);
      return [Math.min(...xs), Math.max(...xs)];
    };

    const [a0, a1] = span(first);
    const [b0, b1] = span(second);
    const [c0, c1] = span(third);
    expect(a1 < b0 || b1 < a0, 'first and second overlap').toBe(true);
    expect(c1 < a0 || c0 > a1, 'third overlaps the first').toBe(true);
    expect(c1 < b0 || c0 > b1, 'third overlaps the second').toBe(true);
  });

  it('a part dropped away from the board is left where it was put', () => {
    const b = new Bench();
    const board = b.add('breadboard');
    b.comp(board).x = 600;
    b.comp(board).y = 600;
    const model = getModel('ic:7408')!;
    const spot = placementFor(b.circuit, model, 100, 100);
    expect(spot.rot).toBe(0);
    expect(spot.x).toBe(100);
    expect(spot.y).toBe(100);
  });
});
