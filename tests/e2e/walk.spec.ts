import { expect, test } from '@playwright/test';
import { hideStartOverlay, openSim, shot, sim } from './helpers';

// SwiftShader renders on the CPU: a small viewport keeps the scripted walks fast.
const SMALL = { width: 640, height: 360 };

test.describe('first walk (desktop)', () => {
  test('loads without errors, within the draw-call and triangle budget', async ({ page }, info) => {
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
    await shot(page, info, 'test-results/e2e-shots/start-desktop.png');
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
  }, info) => {
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
    await shot(page, info, 'test-results/e2e-shots/walk-hall.png');
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
    // Foot of the stairs (the ramp starts one going before the first riser).
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
    await shot(page, info, 'test-results/e2e-shots/walk-terrace.png');
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

  test('walls, windows and the glass wall block the player; the stairs are walkable', async ({
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
    // Stairs: walking straight up the lower flight reaches the landing (+1.56).
    await sim.teleport(page, 8.9, 0, 3.3);
    p = await sim.walk(page, 0, 1, 4);
    expect(p.z).toBeGreaterThan(6.0);
    expect(p.y).toBeCloseTo((2.95 / 17) * 9, 1);
    expect(p.grounded).toBe(true);
    expect(p.room).toBe('stairs');
    // The rod balustrade on the middle wall stops a walk from the upper flight into the
    // lower flight's well; the living-room railing stops a walk off the lower flight.
    await sim.teleport(page, 7.8, 2.65, 4.6);
    p = await sim.walk(page, 1, 0, 3, true);
    expect(p.x).toBeLessThan(8.275 - 0.2 + 0.01);
    expect(p.y).toBeGreaterThan(2.0);
    await sim.teleport(page, 8.9, 1.0, 4.8);
    p = await sim.walk(page, 1, 0, 3, true);
    expect(p.x).toBeLessThan(9.35 - 0.2);
    expect(p.y).toBeGreaterThan(0.6);
    // The study's interior window F-02 over the living-room void.
    await sim.teleport(page, 8.6, 2.95, 1.86);
    p = await sim.walk(page, 1, 0, 3, true);
    expect(p.x).toBeLessThan(9.51 - 0.2);
    expect(p.level).toBe('upper');
    expect(p.room).toBe('study');
    // Upper hall end wall toward the void.
    await sim.teleport(page, 9.0, 2.95, 3.0);
    p = await sim.walk(page, 1, 0, 3, true);
    expect(p.x).toBeLessThan(9.51 - 0.2);
    expect(p.y).toBeCloseTo(2.95, 2);
    expect(s.errors).toEqual([]);
  });

  test('whole building on foot: up to every upper room, the void, down to the basement', async ({
    page,
  }, info) => {
    test.setTimeout(420_000);
    await page.setViewportSize(SMALL);
    const s = await openSim(page, 'debug');
    await hideStartOverlay(page);
    const at = async (
      points: [number, number][],
      room: string,
      level: string,
      y: number | [number, number],
    ) => {
      const res = await sim.route(page, points);
      for (const p of res) expect(p.grounded, `grounded at ${p.x}, ${p.z}`).toBe(true);
      const last = res[res.length - 1]!;
      expect(last.room, JSON.stringify(points.at(-1))).toBe(room);
      expect(last.level, `${room} level`).toBe(level);
      if (typeof y === 'number') {
        expect(last.y, `${room} y`).toBeCloseTo(y, 1);
      } else {
        expect(last.y, `${room} y`).toBeGreaterThan(y[0]);
        expect(last.y, `${room} y`).toBeLessThan(y[1]);
      }
      return last;
    };
    // Outside → entrance canopy → hall.
    await at(
      [
        [-0.9, 2.2],
        [-0.9, -0.9],
        [6.0, -0.9],
        [8.775, -0.9],
        [8.775, 1.2],
      ],
      'entrance-hall',
      'ground',
      0,
    );
    // Up the main stair: lower flight, landing, upper flight → upper hall (+2.95).
    await at(
      [
        [8.9, 3.3],
        [8.9, 5.6],
        [8.9, 6.55],
      ],
      'stairs',
      'ground',
      1.56,
    );
    await at(
      [
        [7.8, 6.55],
        [7.8, 4.2],
        [7.8, 3.3],
      ],
      'upper-hall',
      'upper',
      2.95,
    );
    await shot(page, info, 'test-results/e2e-shots/walk-upper-hall.png');
    // Study (Ui-03), look into the living-room void through F-02.
    await at(
      [
        [5.775, 3.0],
        [5.775, 1.5],
      ],
      'study',
      'upper',
      2.95,
    );
    await at([[8.9, 1.86]], 'study', 'upper', 2.95);
    await page.evaluate(() => window.__houseSim!.look(-90, -15));
    await shot(page, info, 'test-results/e2e-shots/walk-void.png');
    // Bedroom 3 (Ui-04), upper bathroom (Ui-02).
    await at(
      [
        [5.775, 3.0],
        [5.2, 3.0],
        [3.8, 3.0],
        [2.5, 3.0],
      ],
      'bedroom-3',
      'upper',
      2.95,
    );
    await at(
      [
        [5.2, 3.0],
        [5.6, 3.1],
        [5.6, 4.6],
      ],
      'upper-bathroom',
      'upper',
      2.95,
    );
    // Back down the main stair to the hall.
    await at(
      [
        [5.6, 3.1],
        [7.8, 3.3],
        [7.8, 4.2],
        [7.8, 6.55],
      ],
      'stairs',
      'ground',
      1.56,
    );
    await at(
      [
        [8.9, 6.55],
        [8.9, 3.0],
      ],
      'entrance-hall',
      'ground',
      0,
    );
    // Basement: door Ui-02, the flight down, winders, storage (−2.53).
    await at(
      [
        [7.7, 3.3],
        [7.7, 4.0],
        [7.7, 5.5],
      ],
      'basement-stairs',
      'basement',
      [-1.2, -0.6],
    );
    await at(
      [
        [7.82, 6.13],
        [7.97, 6.48],
        [8.32, 6.63],
        [9.6, 6.65],
        [11.0, 5.0],
      ],
      'storage',
      'basement',
      -2.53,
    );
    await shot(page, info, 'test-results/e2e-shots/walk-storage.png');
    // And back up to the ground floor.
    await at(
      [
        [9.6, 6.65],
        [8.32, 6.63],
        [7.97, 6.48],
        [7.82, 6.13],
        [7.7, 4.3],
        [7.7, 3.3],
      ],
      'entrance-hall',
      'ground',
      0,
    );
    expect(s.errors).toEqual([]);
  });
});
