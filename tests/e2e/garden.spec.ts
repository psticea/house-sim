/**
 * I3 garden walk (quick desktop pass): around the whole house through every garden place,
 * and the fence, closed car gate, tree trunks, beds, swing and fire pit stop the player.
 */
import { expect, test } from '@playwright/test';
import { hideStartOverlay, openSim, shot, sim } from './helpers';

const SMALL = { width: 640, height: 360 };
const R = 0.25; // player radius

// Lot lines (src/data/site.ts): north z −2.558, south z 14.525, west/east slanted.
const lotWestX = (z: number) => -8.462 + ((z - 14.525) / (-2.558 - 14.525)) * (-8.006 + 8.462);
const lotEastX = (z: number) => 25.639 + ((z + 2.558) / (14.525 + 2.558)) * (25.038 - 25.639);

test.describe('garden & fence (desktop)', () => {
  test('walks around the house through every garden place', async ({ page }, info) => {
    test.setTimeout(420_000);
    await page.setViewportSize(SMALL);
    const s = await openSim(page, 'debug');
    await hideStartOverlay(page);
    const visited = new Set<string>();
    const leg = async (points: [number, number][], place: string) => {
      const res = await sim.route(page, points);
      for (const p of res) {
        visited.add(p.place);
        expect(p.grounded, `grounded at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`).toBe(true);
      }
      const last = res[res.length - 1]!;
      expect(last.place, JSON.stringify(points.at(-1))).toBe(place);
      return last;
    };
    expect((await sim.player(page)).place).toBe('parking');
    await leg([[-3.0, 1.8]], 'front-garden');
    await leg([[-0.9, 2.2]], 'front-path');
    await leg(
      [
        [-0.9, -0.9],
        [6.0, -0.9],
      ],
      'entrance',
    );
    // North side: along the stepping stones in the gravel strip.
    await leg(
      [
        [11.0, -0.9],
        [12.2, -0.63],
        [17.0, -0.63],
      ],
      'north-side',
    );
    await shot(page, info, 'test-results/e2e-shots/garden-north-side.png');
    await leg(
      [
        [18.9, -0.6],
        [20.8, -0.9],
        [21.5, 1.5],
      ],
      'rear-garden',
    );
    await leg(
      [
        [20.3, 3.0],
        [20.6, 5.9],
      ],
      'fire-pit',
    );
    await leg(
      [
        [20.3, 8.5],
        [19.4, 9.6],
      ],
      'south-garden',
    );
    await leg([[19.4, 11.7]], 'vegetable-beds');
    await leg(
      [
        [19.4, 9.6],
        [14.0, 9.6],
        [11.7, 10.5],
      ],
      'swing',
    );
    const deck = await leg(
      [
        [12.0, 9.5],
        [12.9, 8.5],
      ],
      'terrace',
    );
    expect(deck.y).toBeCloseTo(0, 2);
    await shot(page, info, 'test-results/e2e-shots/garden-terrace.png');
    // Back along the south side (stepping stones) to the south-west yard and the parking.
    await leg(
      [
        [12.0, 9.5],
        [9.3, 9.5],
        [5.5, 10.2],
      ],
      'south-garden',
    );
    await leg([[3.0, 11.5]], 'front-path');
    await leg(
      [
        [-3.0, 11.0],
        [-6.2, 6.8],
      ],
      'parking',
    );
    for (const id of [
      'parking',
      'front-garden',
      'front-path',
      'entrance',
      'north-side',
      'rear-garden',
      'fire-pit',
      'south-garden',
      'vegetable-beds',
      'swing',
      'terrace',
    ]) {
      expect(visited.has(id), `visited ${id}`).toBe(true);
    }
    expect(s.errors).toEqual([]);
  });

  test('fence, closed car gate, trunks, beds, swing and fire pit block; the garden gate is open', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(SMALL);
    const s = await openSim(page);
    const push = async (x: number, z: number, dx: number, dz: number, seconds = 3) => {
      await sim.teleport(page, x, 0, z);
      return sim.walk(page, dx, dz, seconds, true);
    };
    // Privacy fence (north, east, south) and the street fence (west).
    let p = await push(14.0, -1.9, 0, -1);
    expect(p.z).toBeGreaterThan(-2.558 + R);
    p = await push(23.0, 11.0, 1, 0);
    expect(p.x).toBeLessThan(lotEastX(11.0) - R);
    p = await push(12.0, 13.0, 0, 1);
    expect(p.z).toBeLessThan(14.525 - R);
    p = await push(-7.0, 5.0, -1, 0);
    expect(p.x).toBeGreaterThan(lotWestX(5.0) + R);
    // The sliding car gate is closed…
    p = await push(-5.7, 13.6, 0, 1);
    expect(p.z).toBeLessThan(14.525 - R);
    // …the pedestrian gate stands open onto the end of the street, which is bounded.
    p = await push(-7.88, 13.6, 0, 1, 4);
    expect(p.z).toBeGreaterThan(15.0);
    expect(p.place).toBe('street');
    p = await sim.walk(page, 0, 1, 10, true);
    expect(p.z).toBeLessThan(22.0 - R + 0.02);
    // Apple tree trunk and the fire pit (round: the player slides around, never through),
    // a raised bed and the swing seat.
    const outside = (q: { x: number; z: number }, cx: number, cz: number, r: number) =>
      expect(Math.hypot(q.x - cx, q.z - cz)).toBeGreaterThan(r + R - 0.03);
    for (const seconds of [0.6, 1.0, 1.5]) {
      await sim.teleport(page, 22.8, 0, -0.24);
      outside(await sim.walk(page, 1, 0, seconds), 24.08, -0.24, 0.16);
      await sim.teleport(page, 20.6, 0, 5.9);
      p = await sim.walk(page, 1, 0, seconds);
      outside(p, 22.0, 5.9, 0.45);
      expect(p.place).toBe('fire-pit');
    }
    p = await push(17.8, 9.5, 0, 1);
    expect(p.z).toBeLessThan(10.1 - R + 0.02);
    p = await push(11.7, 10.2, 0, 1);
    expect(p.z).toBeLessThan(11.3 - R + 0.02);
    expect(s.errors).toEqual([]);
  });
});
