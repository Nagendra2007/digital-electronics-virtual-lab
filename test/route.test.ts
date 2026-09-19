/**
 * Wires have to behave like jumpers pushed flat around the parts: orthogonal,
 * clear of the packages, and not all piled into the same groove.
 */
import { describe, expect, it } from 'vitest';
import { routeWire } from '../src/sim/route';
import { boundsOf, pinWorldPos } from '../src/sim/geometry';
import { getModel } from '../src/sim/registry';
import type { Point, Rect } from '../src/sim/route';
import type { PlacedComponent } from '../src/sim/types';

/** True when any part of the path passes through the inside of `r`. */
function crosses(path: Point[], r: Rect): boolean {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const steps = Math.ceil(Math.max(Math.abs(b.x - a.x), Math.abs(b.y - a.y)) / 2) || 1;
    for (let k = 0; k <= steps; k++) {
      const x = a.x + ((b.x - a.x) * k) / steps;
      const y = a.y + ((b.y - a.y) * k) / steps;
      if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return true;
    }
  }
  return false;
}

/** True when `p` lies on the polyline, vertex or not. */
function passesThrough(path: Point[], p: Point): boolean {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const onX = a.x === b.x && p.x === a.x && p.y >= Math.min(a.y, b.y) && p.y <= Math.max(a.y, b.y);
    const onY = a.y === b.y && p.y === a.y && p.x >= Math.min(a.x, b.x) && p.x <= Math.max(a.x, b.x);
    if (onX || onY) return true;
  }
  return false;
}

const orthogonal = (path: Point[]) =>
  path.every((p, i) => i === 0 || p.x === path[i - 1].x || p.y === path[i - 1].y);

describe('wire routing', () => {
  it('takes one corner when nothing is in the way', () => {
    const r = routeWire([{ x: 0, y: 0 }, { x: 120, y: 60 }], []);
    expect(r.routed).toBe(true);
    expect(orthogonal(r.points)).toBe(true);
    expect(r.points.length).toBeLessThanOrEqual(3);
    expect(r.points[0]).toEqual({ x: 0, y: 0 });
    expect(r.points[r.points.length - 1]).toEqual({ x: 120, y: 60 });
  });

  it('goes around a package instead of across it', () => {
    const chip: Rect = { x: 100, y: 0, w: 80, h: 200 };
    const r = routeWire([{ x: 40, y: 100 }, { x: 240, y: 100 }], [chip]);
    expect(r.routed).toBe(true);
    expect(orthogonal(r.points)).toBe(true);
    expect(crosses(r.points, chip), 'the wire runs over the package').toBe(false);
  });

  it('threads between two packages when there is a gap', () => {
    const top: Rect = { x: 100, y: -200, w: 80, h: 240 };
    const bottom: Rect = { x: 100, y: 120, w: 80, h: 240 };
    const r = routeWire([{ x: 40, y: 80 }, { x: 240, y: 80 }], [top, bottom]);
    expect(r.routed).toBe(true);
    expect(crosses(r.points, top)).toBe(false);
    expect(crosses(r.points, bottom)).toBe(false);
  });

  it('nudges a second wire into its own lane', () => {
    const a = routeWire([{ x: 0, y: 0 }, { x: 200, y: 0 }], []);
    const lanes = new Map<number, number>();
    for (const cell of a.cells) lanes.set(cell, 1);
    const b = routeWire([{ x: 0, y: 0 }, { x: 200, y: 0 }], [], { lanes });
    expect(b.routed).toBe(true);
    expect(JSON.stringify(b.points)).not.toBe(JSON.stringify(a.points));
  });

  it('keeps the student corners it is given', () => {
    const r = routeWire([{ x: 0, y: 0 }, { x: 60, y: 120 }, { x: 200, y: 0 }], []);
    expect(orthogonal(r.points)).toBe(true);
    expect(passesThrough(r.points, { x: 60, y: 120 })).toBe(true);
  });

  it('still returns a usable path when a pin is walled in', () => {
    const wall = 40;
    const box: Rect[] = [
      { x: -wall, y: -wall - 20, w: wall * 2, h: 20 },
      { x: -wall, y: wall, w: wall * 2, h: 20 },
      { x: -wall - 20, y: -wall, w: 20, h: wall * 2 },
      { x: wall, y: -wall, w: 20, h: wall * 2 },
    ];
    const r = routeWire([{ x: 0, y: 0 }, { x: 400, y: 0 }], box);
    expect(r.routed).toBe(false);
    expect(r.points.length).toBeGreaterThan(1);
    expect(orthogonal(r.points)).toBe(true);
  });

  it('misses the IC bodies on a real bench', () => {
    const place = (type: string, x: number, y: number): PlacedComponent => ({
      id: type,
      type,
      x,
      y,
      rot: 90,
      props: {},
    });
    const u1 = place('ic:7408', 200, 150);
    const u2 = place('ic:7432', 420, 150);
    const m1 = getModel(u1.type)!;
    const m2 = getModel(u2.type)!;
    const obstacles = [boundsOf(m1, u1), boundsOf(m2, u2)];

    // Output of the first package to an input of the second, the long way
    // round - straight across would cut through both bodies.
    const from = pinWorldPos(m1, u1, 3)!;
    const to = pinWorldPos(m2, u2, 1)!;
    const r = routeWire([from, to], obstacles);

    expect(r.routed).toBe(true);
    expect(orthogonal(r.points)).toBe(true);
    for (const box of obstacles) {
      expect(crosses(r.points, box), 'the wire crosses a package').toBe(false);
    }
  });
});
