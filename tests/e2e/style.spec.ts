/**
 * S1 styles: sketch is the default look (no parameter), `?style=real` gives the
 * realistic one and `?style=sketch` still works. Sketch loads clean, stays within the
 * draw-call budget, keeps the walk working, toggles to real and back without leaking
 * GPU resources, and both styles get comparison screenshots (test-results/style-shots/).
 */
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { StyleName } from '../../src/world/style';
import { hideStartOverlay, openSim, sim } from './helpers';

type Pose = [number, number, number, number, number];
interface Counts {
  drawCalls: number;
  geometries: number;
  textures: number;
}
const OUT = 'test-results/style-shots';

// [name, kind, pose] — `start` is the load pose (captured at runtime).
const SHOTS: [string, 'pose' | 'view', Pose][] = [
  ['entrance', 'pose', [3.0, -0.05, -1.0, -90, 0]],
  ['living-east', 'pose', [10.4, 0, 3.6, -90, 8]],
  ['bedroom-1', 'pose', [2.6, 0, 2.6, 30, -5]],
  ['aerial', 'view', [-14, 14, -12, -135, -30]],
];

const setStyle = (page: Page, name: StyleName) =>
  page.evaluate((n) => window.__houseSim!.setStyle(n), name);
const getStyle = (page: Page) => page.evaluate(() => window.__houseSim!.getStyle());

async function shootAll(page: Page, style: StyleName, device: string, start: Pose): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await sim.teleport(page, ...start);
  await page.screenshot({ path: `${OUT}/${style}-start-${device}.png` });
  for (const [name, kind, pose] of SHOTS) {
    if (kind === 'view') await sim.view(page, pose);
    else await sim.teleport(page, ...pose);
    await page.evaluate(() => window.__houseSim!.nextFrame());
    await page.screenshot({ path: `${OUT}/${style}-${name}-${device}.png` });
  }
}

async function startPose(page: Page): Promise<Pose> {
  const p = await sim.player(page);
  return [p.x, p.y, p.z, p.yaw, p.pitch];
}

test.describe('styles', () => {
  test('desktop: sketch by default — clean load, budget, walk, leak-free toggles, screenshots', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop project only');
    test.setTimeout(420_000);
    const s = await openSim(page);
    await hideStartOverlay(page);
    expect(await getStyle(page)).toBe('sketch');
    const start = await startPose(page);
    await page.evaluate(() => window.__houseSim!.nextFrame());
    const atStart = await sim.stats(page);
    expect(atStart.drawCalls).toBeGreaterThan(20); // fills + edge lines
    expect(atStart.drawCalls).toBeLessThanOrEqual(60);
    await expect(page.locator('#app .paper-grain')).toHaveCount(1);

    // Rooms still work (teleport + walk through the living room).
    expect((await sim.teleport(page, 2.0, 0.3, 1.5, 0, 0)).room).toBe('bedroom-1');
    expect((await sim.teleport(page, 11.0, 0.3, 3.05, -90, 0)).room).toBe('living-kitchen');
    expect((await sim.walkTo(page, 10.6, 5.5)).place).toBe('play-corner');
    await sim.teleport(page, 10.4, 0, 3.6, -90, 8);
    const living = await sim.stats(page);
    expect(living.drawCalls).toBeLessThanOrEqual(60);

    // Leak check: same pose, three real ↔ sketch round trips.
    const counts = async (): Promise<Counts> => {
      await page.evaluate(() => window.__houseSim!.nextFrame());
      const st = await sim.stats(page);
      return { drawCalls: st.drawCalls, geometries: st.geometries, textures: st.textures };
    };
    // (Counts after load include resources first used at the start pose, so the
    // steady state is taken after the first round trip.)
    const cycles: { sketch: Counts; real: Counts }[] = [];
    for (let k = 0; k < 4; k++) {
      if (k > 0) await setStyle(page, 'sketch');
      expect(await getStyle(page)).toBe('sketch');
      const sketch = await counts();
      await setStyle(page, 'real');
      expect(await getStyle(page)).toBe('real');
      await expect(page.locator('#app .paper-grain')).toHaveCount(0);
      cycles.push({ sketch, real: await counts() });
    }
    console.log(JSON.stringify(cycles));
    const [, first, ...rest] = cycles;
    expect(first!.real.drawCalls).toBeLessThan(first!.sketch.drawCalls);
    for (const c of rest) expect(c).toEqual(first);
    const sketch0 = first!.sketch;
    const real0 = first!.real;

    await setStyle(page, 'sketch');
    await shootAll(page, 'sketch', 'desktop', start);
    await setStyle(page, 'real');
    await shootAll(page, 'real', 'desktop', start);

    fs.writeFileSync(
      'test-results/style-stats.json',
      JSON.stringify({ sketchStart: atStart, sketchLiving: living, sketch0, real0 }, null, 2),
    );
    console.log(JSON.stringify({ atStart, living, sketch0, real0 }));
    expect(s.errors).toEqual([]);
    expect(s.warnings).toEqual([]);
  });

  test('desktop: ?style=real gives the realistic look, ?style=sketch still works', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop project only');
    test.setTimeout(180_000);
    await page.setViewportSize({ width: 640, height: 360 });
    const real = await openSim(page, 'style=real&pose=10.4,0,3.6,-90,8');
    expect(await getStyle(page)).toBe('real');
    await expect(page.locator('#app .paper-grain')).toHaveCount(0);
    await page.evaluate(() => window.__houseSim!.nextFrame());
    const realStats = await sim.stats(page);
    expect(realStats.drawCalls).toBeLessThanOrEqual(25); // fills only, no edge lines
    expect(real.errors).toEqual([]);
    expect(real.warnings).toEqual([]);

    const sketch = await openSim(page, 'style=sketch&pose=10.4,0,3.6,-90,8');
    expect(await getStyle(page)).toBe('sketch');
    await expect(page.locator('#app .paper-grain')).toHaveCount(1);
    await page.evaluate(() => window.__houseSim!.nextFrame());
    expect((await sim.stats(page)).drawCalls).toBeGreaterThan(realStats.drawCalls);
    expect(sketch.errors).toEqual([]);
    expect(sketch.warnings).toEqual([]);
  });

  test('phone: sketch by default, real via the hook; screenshots, no warnings', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'iphone-13', 'phone (390 x 844) project only');
    test.setTimeout(300_000);
    const s = await openSim(page);
    await hideStartOverlay(page);
    expect(await getStyle(page)).toBe('sketch');
    const start = await startPose(page);
    const st = await sim.stats(page);
    expect(st.drawCalls).toBeLessThanOrEqual(60);
    await shootAll(page, 'sketch', 'phone', start);
    await setStyle(page, 'real');
    await shootAll(page, 'real', 'phone', start);
    expect(s.errors).toEqual([]);
    expect(s.warnings).toEqual([]);
  });
});
