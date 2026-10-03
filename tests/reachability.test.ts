import { describe, expect, it } from 'vitest';
import { house } from '../src/data/house';
import { BASEMENT_STAIR_HOLE, mainStairs } from '../src/data/ground';
import { pointInPolygon, wallThickness } from '../src/data/geometry2d';
import { OUTSIDE, levelById, reachable, roomAt, spaceGraph } from '../src/data/topology';

const ground = levelById(house, 'ground');

describe('reachability (all doors open)', () => {
  it('start pose is outside the house, on the lot, on the parking', () => {
    const [x, , z] = house.site.start.position;
    expect(roomAt(ground, x, z)).toBe(OUTSIDE);
    expect(pointInPolygon(x, z, house.site.lot)).toBe(true);
    const parking = house.site.patches.find((p) => p.id === 'parking')!;
    expect(pointInPolygon(x, z, parking.polygon)).toBe(true);
  });

  it('every ground-floor room is reachable from outside', () => {
    const seen = reachable(ground, OUTSIDE);
    for (const r of ground.rooms) expect(seen.has(r.id), r.id).toBe(true);
  });

  it('entrance door connects outside ↔ entrance hall; glass door living ↔ terrace', () => {
    const edges = spaceGraph(ground);
    const has = (a: string, b: string, via: string) =>
      edges.some((e) => e.via === via && ((e.a === a && e.b === b) || (e.a === b && e.b === a)));
    expect(has(OUTSIDE, 'entrance-hall', 'ue01-entrance')).toBe(true);
    expect(has('living-kitchen', 'terrace', 'cw-door')).toBe(true);
    expect(has('entrance-hall', 'bedroom-1', 'ui03-bed1')).toBe(true);
    expect(has('entrance-hall', 'bedroom-2', 'ui04-bed2')).toBe(true);
    expect(has('entrance-hall', 'bathroom', 'ui01-bath-hall')).toBe(true);
    expect(has('entrance-hall', 'boiler-laundry', 'ui02-ct')).toBe(true);
    expect(has('entrance-hall', 'living-kitchen', 'open boundary')).toBe(true);
    expect(has('entrance-hall', 'stairs', 'open boundary')).toBe(true);
  });

  it('the bathroom is entered from the hall only (bedroom-2 door removed)', () => {
    const edges = spaceGraph(ground);
    const touching = edges.filter((e) => e.a === 'bathroom' || e.b === 'bathroom');
    expect(touching.map((e) => e.via)).toEqual(['ui01-bath-hall']);
    expect(ground.openings.some((o) => o.id === 'ui01-bath-bed2')).toBe(false);
    expect(ground.openings.some((o) => o.wall === 'i-bed2-bath')).toBe(false);
  });

  it('the basement stair opening is closed off from the living room (stairs room only)', () => {
    // No connection between the living room and the stair room / basement stair except
    // through the hall; the hole's edge on the living-room side (x 9.375, z 6.175…7.125)
    // is covered by a wall from the floor up to the landing soffit.
    const edges = spaceGraph(ground);
    expect(
      edges.some(
        (e) =>
          (e.a === 'living-kitchen' && e.b === 'stairs') ||
          (e.a === 'stairs' && e.b === 'living-kitchen'),
      ),
    ).toBe(false);
    const landing = mainStairs.landings[0]!;
    const soffit = (landing.riser - 1) * (mainStairs.topY / mainStairs.risers);
    const xs = BASEMENT_STAIR_HOLE.map((p) => p[0]);
    const zs = BASEMENT_STAIR_HOLE.filter((p) => p[0] === Math.max(...xs)).map((p) => p[1]);
    const edge = { x: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
    const covers = ground.walls.filter((w) => {
      if (w.from[0] !== w.to[0] || typeof w.top !== 'number') return false;
      const t = wallThickness(w) / 2;
      const zMin = Math.min(w.from[1], w.to[1]);
      const zMax = Math.max(w.from[1], w.to[1]);
      return (
        w.from[0] - t <= edge.x + 1e-6 &&
        w.from[0] + t >= edge.x + 0.2 &&
        zMin <= edge.z0 &&
        zMax >= edge.z1 &&
        (w.base ?? 0) <= 0 &&
        w.top >= soffit - 1e-6 &&
        !ground.openings.some((o) => o.wall === w.id)
      );
    });
    expect(covers.map((w) => w.id)).toEqual(['i-living-stair']);
    // The wall reaches from the end of flight 1 (solid masonry) to the south wall.
    const w = covers[0]!;
    expect(Math.min(w.from[1], w.to[1])).toBeCloseTo(mainStairs.flights[0]!.z[1], 6);
    expect(Math.max(w.from[1], w.to[1])).toBeCloseTo(7.125, 6);
  });

  it('closed windows do not count as connections', () => {
    const edges = spaceGraph(ground);
    expect(edges.some((e) => e.via.startsWith('f0') && e.via !== 'f07-living-s')).toBe(false);
  });

  it('play corner lies inside the living room', () => {
    const pc = ground.zones.find((z) => z.id === 'play-corner')!;
    for (const [x, z] of pc.polygon) {
      const inset: [number, number] = [x + (x < 11 ? 0.01 : -0.01), z + (z < 5 ? 0.01 : -0.01)];
      expect(roomAt(ground, inset[0], inset[1])).toBe('living-kitchen');
    }
  });
});
