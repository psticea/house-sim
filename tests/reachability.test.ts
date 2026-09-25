import { describe, expect, it } from 'vitest';
import { house } from '../src/data/house';
import { pointInPolygon } from '../src/data/geometry2d';
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
    expect(has('bedroom-2', 'bathroom', 'ui01-bath-bed2')).toBe(true);
    expect(has('entrance-hall', 'boiler-laundry', 'ui02-ct')).toBe(true);
    expect(has('entrance-hall', 'living-kitchen', 'open boundary')).toBe(true);
    expect(has('entrance-hall', 'stairs', 'open boundary')).toBe(true);
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
