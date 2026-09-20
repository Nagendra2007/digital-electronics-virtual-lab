/**
 * Parts must physically fit the breadboard: every pin of a part has to line up
 * with a hole, and two DIPs must not be dropped on top of each other.
 */
import { describe, expect, it } from 'vitest';
import { Bench } from './helpers';
import { ALL_MODELS, getModel } from '../src/sim/registry';
import { PIN_PITCH, boundsOf, layoutOf, pinWorldPos, seatsOnBoard } from '../src/sim/geometry';
import { BB, BB_COLS, BB_ROWS, breadboard, holeCol, holeX } from '../src/sim/breadboard';
import { placementFor, rotateBoard, turnOnBoard } from '../src/ui/placement';
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

/** Every hole of a board, in world coordinates, whichever way it is turned. */
function holesOfBoard(board: PlacedComponent): Set<string> {
  const model = getModel('breadboard')!;
  return new Set(
    layoutOf(model, board).pins.map((p) => {
      const w = pinWorldPos(model, board, p.n)!;
      return `${Math.round(w.x)},${Math.round(w.y)}`;
    }),
  );
}

/** The board hole a given pin of a seated part is sitting in. */
function holeUnder(board: PlacedComponent, comp: PlacedComponent, pin: number): number {
  const boardModel = getModel('breadboard')!;
  const pos = pinWorldPos(getModel(comp.type)!, comp, pin)!;
  const hole = boardModel.pins.find((h) => {
    const w = pinWorldPos(boardModel, board, h.n)!;
    return Math.round(w.x) === Math.round(pos.x) && Math.round(w.y) === Math.round(pos.y);
  });
  return hole!.n;
}

describe('the board itself', () => {
  it('is a full-size board: 60 columns, 840 tie points', () => {
    expect(BB_COLS).toBe(60);
    expect(BB.total).toBe(840);
    expect(breadboard.pins).toHaveLength(840);
  });

  it('takes a package whichever way the board is turned', () => {
    for (const rot of [0, 90, 180, 270] as const) {
      const b = new Bench();
      const board = b.add('breadboard');
      b.comp(board).x = 0;
      b.comp(board).y = 0;
      b.comp(board).rot = rot;

      const boardModel = getModel('breadboard')!;
      const holes = holesOfBoard(b.comp(board));
      const box = boundsOf(boardModel, b.comp(board));

      const model = getModel('ic:7408')!;
      const id = b.add(model.type);
      const spot = placementFor(b.circuit, model, box.x + box.w / 2, box.y + box.h / 2, 0, id);
      const comp = b.comp(id);
      comp.x = spot.x;
      comp.y = spot.y;
      comp.rot = spot.rot;
      b.engine.rebuild(b.circuit);

      expect(spot.rot, `board at ${rot}: the package must lie across the channel`).toBe(
        (90 + rot) % 360,
      );
      for (const p of model.pins) {
        const pos = pinWorldPos(model, comp, p.n)!;
        expect(
          holes.has(`${Math.round(pos.x)},${Math.round(pos.y)}`),
          `board at ${rot}: pin ${p.n} landed at ${Math.round(pos.x)},${Math.round(pos.y)} - not a hole`,
        ).toBe(true);
      }
    }
  });

  it('wires a turned board up exactly like a flat one', () => {
    const b = new Bench();
    const board = b.add('breadboard');
    b.comp(board).x = 0;
    b.comp(board).y = 0;
    b.comp(board).rot = 90;

    const model = getModel('ic:7408')!;
    const box = boundsOf(getModel('breadboard')!, b.comp(board));
    const ic = b.add(model.type);
    const spot = placementFor(b.circuit, model, box.x + box.w / 2, box.y + box.h / 2, 0, ic);
    Object.assign(b.comp(ic), spot);

    // Power it through the hole grid, not by wiring the IC pins directly.
    const vccCol = holeCol(holeUnder(b.comp(board), b.comp(ic), 14));
    const gndCol = holeCol(holeUnder(b.comp(board), b.comp(ic), 7));
    b.wire(board, BB.bankBottom(4, vccCol), b.vcc, 1);
    b.wire(board, BB.bankTop(0, gndCol), b.gnd, 1);
    b.engine.rebuild(b.circuit);
    b.run(2);

    expect(b.read(ic, 14), 'VCC reaches the package through the strips').toBe(1);
    expect(b.read(ic, 7), 'GND reaches the package through the strips').toBe(0);
  });

  it('turns a seated package end for end instead of dropping it out', () => {
    const b = new Bench();
    const board = b.add('breadboard');
    b.comp(board).x = 0;
    b.comp(board).y = 0;

    const model = getModel('ic:7408')!;
    const ic = b.add(model.type);
    Object.assign(b.comp(ic), placementFor(b.circuit, model, 300, 260, 0, ic));
    b.engine.rebuild(b.circuit);
    expect(b.comp(ic).rot).toBe(90);

    // A quarter turn cannot seat - the pin rows would be a package width apart
    // across the columns - so it takes the half turn, the way you would turn
    // the real thing round in the board.
    const turned = turnOnBoard(b.circuit, b.comp(ic))!;
    expect(turned, 'a seated package must have somewhere to turn to').not.toBeNull();
    expect(turned.rot).toBe(270);

    Object.assign(b.comp(ic), turned);
    b.engine.rebuild(b.circuit);

    const holes = holesOfBoard(b.comp(board));
    for (const p of model.pins) {
      const pos = pinWorldPos(model, b.comp(ic), p.n)!;
      expect(
        holes.has(`${Math.round(pos.x)},${Math.round(pos.y)}`),
        `pin ${p.n} left the board when the package was turned`,
      ).toBe(true);
    }
  });

  it('leaves a part that is not in the board to turn normally', () => {
    const b = new Bench();
    const board = b.add('breadboard');
    b.comp(board).x = 0;
    b.comp(board).y = 0;
    const loose = b.add('ic:7408');
    b.comp(loose).x = 2000;
    b.comp(loose).y = 2000;
    expect(turnOnBoard(b.circuit, b.comp(loose))).toBeNull();
  });

  it('carries everything plugged in when it is turned', () => {
    const b = new Bench();
    const board = b.add('breadboard');
    b.comp(board).x = 0;
    b.comp(board).y = 0;

    const model = getModel('ic:7408')!;
    const ic = b.add(model.type);
    Object.assign(b.comp(ic), placementFor(b.circuit, model, 300, 260, 0, ic));
    b.engine.rebuild(b.circuit);

    b.wire(board, BB.bankBottom(4, holeCol(holeUnder(b.comp(board), b.comp(ic), 14))), b.vcc, 1);
    b.wire(board, BB.bankTop(0, holeCol(holeUnder(b.comp(board), b.comp(ic), 7))), b.gnd, 1);
    b.engine.rebuild(b.circuit);
    b.run(2);
    expect(b.read(ic, 14), 'powered before the board is turned').toBe(1);

    rotateBoard(b.circuit, board);
    b.engine.rebuild(b.circuit);
    b.run(2);

    expect(b.comp(board).rot).toBe(90);
    expect(b.comp(ic).rot, 'the package turns with the board').toBe(180);

    const holes = holesOfBoard(b.comp(board));
    for (const p of model.pins) {
      const pos = pinWorldPos(model, b.comp(ic), p.n)!;
      expect(
        holes.has(`${Math.round(pos.x)},${Math.round(pos.y)}`),
        `pin ${p.n} fell out of the board when it turned`,
      ).toBe(true);
    }
    expect(b.read(ic, 14), 'still powered after the board turned').toBe(1);
    expect(b.read(ic, 7), 'still grounded after the board turned').toBe(0);
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
