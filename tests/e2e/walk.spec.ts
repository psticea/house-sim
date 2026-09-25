import { expect, test } from '@playwright/test';
import { hideStartOverlay, openSim, sim } from './helpers';

// SwiftShader renders on the CPU: a small viewport keeps the scripted walks fast.
const SMALL = { width: 640, height: 360 };

test.describe('first walk (desktop)', () => {
  test('loads without errors, within the draw-call and triangle budget', async ({ page }) => {
    const s = await openSim(page, 'debug');
    const start = await sim.player(page);
    expect(start.room).toBe('outside');
    expect(start.place).toBe('parking');
    expect(start.grounded).toBe(true);
    await expect(page.locator('.start button')).toHaveText('Click to start');
    const st = await sim.stats(page);
    expect(st.drawCalls).toBeGreaterThan(5);
    expect(st.drawCalls).toBeLessThanOrEqual(60);
    expect(st.triangles).toBeLessThan(400_000);
    await page.screenshot({ path: 'test-results/e2e-shots/start-desktop.png' });
    expect(s.errors).toEqual([]);
  });

  test('teleporting into every ground-floor room reports the right room', async ({ page }) => {
    await page.setViewportSize(SMALL);
    const s = await openSim(page);
    const rooms: [string, number, number][] = [
      ['bedroom-1', 2.0, 1.5],
      ['boiler-laundry', 6.0, 1.2],
      ['entrance-hall', 8.4, 1.2],
      ['bathroom', 5.9, 5.0],
      ['bedroom-2', 2.3, 5.5],
      ['stairs', 8.9, 3.85],
      ['living-kitchen', 13.0, 3.0],
      ['terrace', 18.0, 4.0],
    ];
    for (const [id, x, z] of rooms) {
      const p = await sim.teleport(page, x, 0.3, z, 0, 0);
      expect(p.room, id).toBe(id);
      expect(p.grounded, `${id} grounded`).toBe(true);
    }
    const pc = await sim.teleport(page, 10.6, 0.3, 6.0);
    expect(pc.room).toBe('living-kitchen');
    expect(pc.place).toBe('play-corner');
    expect(s.errors).toEqual([]);
  });

  test('walks from the parking through the entrance and visits every room on foot', async ({
    page,
  }) => {
    test.setTimeout(420_000);
    await page.setViewportSize(SMALL);
    const s = await openSim(page, 'debug');
    await hideStartOverlay(page);
    const visited = new Set<string>();
    const leg = async (points: [number, number][]) => {
      const res = await sim.route(page, points);
      for (const p of res) {
        visited.add(p.room);
        visited.add(p.place);
      }
      return res[res.length - 1]!;
    };
    // Parking → west path → north path → under the canopy → entrance door → hall.
    const underCanopy = await leg([
      [-0.9, 2.2],
      [-0.9, -0.9],
      [6.0, -0.9],
    ]);
    expect(underCanopy.place).toBe('entrance');
    expect(
      (
        await leg([
          [8.775, -0.9],
          [8.775, 1.2],
        ])
      ).room,
    ).toBe('entrance-hall');
    await page.screenshot({ path: 'test-results/e2e-shots/walk-hall.png' });
    // Bedroom 1 through Ui-03.
    expect(
      (
        await leg([
          [8.2, 3.05],
          [3.7, 3.05],
          [2.2, 3.05],
        ])
      ).room,
    ).toBe('bedroom-1');
    // Bedroom 2 through Ui-04, bathroom through Ui-01 (bedroom side), back to the hall.
    expect(
      (
        await leg([
          [3.7, 3.05],
          [4.1, 3.2],
          [4.1, 4.8],
        ])
      ).room,
    ).toBe('bedroom-2');
    expect(
      (
        await leg([
          [4.1, 5.76],
          [5.6, 5.76],
        ])
      ).room,
    ).toBe('bathroom');
    expect(
      (
        await leg([
          [5.86, 4.4],
          [5.86, 3.1],
        ])
      ).room,
    ).toBe('entrance-hall');
    // Boiler room + laundry through Ui-02.
    expect(
      (
        await leg([
          [5.76, 3.0],
          [5.76, 1.4],
        ])
      ).room,
    ).toBe('boiler-laundry');
    // Foot of the stairs (the first two treads are walkable in I1).
    const onStairs = await leg([
      [5.76, 3.0],
      [8.9, 3.3],
      [8.9, 3.9],
    ]);
    expect(onStairs.room).toBe('stairs');
    expect(onStairs.y).toBeGreaterThan(0.1);
    // Living room through the open passage, play corner, then the glass door to the terrace.
    expect(
      (
        await leg([
          [8.9, 3.05],
          [11.0, 3.05],
        ])
      ).room,
    ).toBe('living-kitchen');
    expect((await leg([[10.6, 5.5]])).place).toBe('play-corner');
    expect(
      (
        await leg([
          [16.0, 2.37],
          [17.6, 2.37],
        ])
      ).room,
    ).toBe('terrace');
    await page.screenshot({ path: 'test-results/e2e-shots/walk-terrace.png' });
    // Around the deck and back in through the open lift-and-slide door F-07.
    expect(
      (
        await leg([
          [19.1, 2.37],
          [19.1, 8.3],
          [12.9, 8.3],
          [12.9, 6.5],
        ])
      ).room,
    ).toBe('living-kitchen');

    for (const id of [
      'entrance',
      'entrance-hall',
      'bedroom-1',
      'bedroom-2',
      'bathroom',
      'boiler-laundry',
      'stairs',
      'living-kitchen',
      'play-corner',
      'terrace',
    ]) {
      expect(visited.has(id), `visited ${id}`).toBe(true);
    }
    expect(s.errors).toEqual([]);
  });

  test('walls, windows and the glass wall block the player; the stair is blocked', async ({
    page,
  }) => {
    test.setTimeout(300_000);
    await page.setViewportSize(SMALL);
    const s = await openSim(page);
    // Exterior wall from outside (west facade at x = −0.33).
    await sim.teleport(page, -1.2, 0, 5.0);
    let p = await sim.walk(page, 1, 0, 4, true);
    expect(p.x).toBeLessThan(-0.33 - 0.2);
    // North wall from inside bedroom 1 (inner face z = 0.125).
    await sim.teleport(page, 1.0, 0, 1.2);
    p = await sim.walk(page, 0, -1, 4, true);
    expect(p.z).toBeGreaterThan(0.125 + 0.2);
    expect(p.room).toBe('bedroom-1');
    // Window F-04 (west wall of bedroom 1).
    await sim.teleport(page, 1.0, 0, 2.2);
    p = await sim.walk(page, -1, 0, 4, true);
    expect(p.x).toBeGreaterThan(0.125 + 0.2);
    // Glass curtain wall (living room, away from the door).
    await sim.teleport(page, 15.4, 0, 5.0);
    p = await sim.walk(page, 1, 0, 4, true);
    expect(p.x).toBeLessThan(16.475 - 0.2);
    expect(p.room).toBe('living-kitchen');
    // Closed half of F-07 (east half) from the deck.
    await sim.teleport(page, 15.0, 0, 8.5);
    p = await sim.walk(page, 0, -1, 4, true);
    expect(p.z).toBeGreaterThan(7.58 + 0.2);
    // Interior wall between bedroom 1 and bedroom 2 (no door at x = 1.5).
    await sim.teleport(page, 1.5, 0, 2.8);
    p = await sim.walk(page, 0, 1, 4, true);
    expect(p.z).toBeLessThan(3.625 - 0.2);
    // Stairs: not walkable beyond the second tread in I1.
    await sim.teleport(page, 8.9, 0, 3.3);
    p = await sim.walk(page, 0, 1, 6, true);
    expect(p.z).toBeLessThan(4.0);
    expect(p.y).toBeLessThan(0.5);
    expect(s.errors).toEqual([]);
  });
});
