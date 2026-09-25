/**
 * Performance proxy (plan.md step 1.17 needs a real phone): draw calls / triangles at
 * the start pose and in the living room, and frame rate under CPU throttling. SwiftShader
 * renders on the CPU, so fps here is a lower bound, not a phone measurement.
 */
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import { hideStartOverlay, openSim, sim } from './helpers';

async function measureFps(page: import('@playwright/test').Page, ms: number): Promise<number> {
  return page.evaluate(async (duration) => {
    const t0 = performance.now();
    let frames = 0;
    while (performance.now() - t0 < duration) {
      await window.__houseSim!.nextFrame();
      frames++;
    }
    return (frames * 1000) / (performance.now() - t0);
  }, ms);
}

test('perf proxy: draw calls, triangles, fps', async ({ page }, info) => {
  const s = await openSim(page);
  await hideStartOverlay(page);
  const cdp = await page.context().newCDPSession(page);
  const result: Record<string, unknown> = {
    project: info.project.name,
    viewport: page.viewportSize(),
  };

  await page.evaluate(() => window.__houseSim!.nextFrame());
  const start = await sim.stats(page);
  result.start = {
    drawCalls: start.drawCalls,
    triangles: start.triangles,
    fps: await measureFps(page, 3000),
  };

  await sim.teleport(page, 10.4, 0, 3.6, -90, 8);
  await page.evaluate(() => window.__houseSim!.nextFrame());
  const living = await sim.stats(page);
  result.living = {
    drawCalls: living.drawCalls,
    triangles: living.triangles,
    fps: await measureFps(page, 3000),
  };

  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  result.livingCpu4x = { fps: await measureFps(page, 4000) };
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  result.scene = {
    triangles: living.sceneTriangles,
    colliderTriangles: living.colliderTriangles,
    textureMB: living.textureMB,
    geometries: living.geometries,
  };

  fs.mkdirSync('test-results', { recursive: true });
  fs.writeFileSync(`test-results/perf-${info.project.name}.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  expect(start.drawCalls).toBeLessThanOrEqual(60);
  expect(living.drawCalls).toBeLessThanOrEqual(60);
  expect(living.sceneTriangles).toBeLessThan(400_000);
  expect(s.errors).toEqual([]);
});
