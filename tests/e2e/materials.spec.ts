/**
 * I4 realistic materials: KTX2 PBR sets + HDRI sky stream in after the first walkable
 * frame; GPU texture memory per quality tier (medium ≤ 75 MB, plan.md §3.1), no failed
 * or third-party requests, draw calls unchanged, style switching leak-free with the
 * textures loaded. I6: the baked lightmaps are applied once the furniture is in (the sun
 * shadow map is off then) and survive style switching; `?baked=0` keeps the I4 lighting.
 * Quick pass (desktop project), one test per tier (SwiftShader is slow).
 */
import fs from 'node:fs';
import { expect, test } from '@playwright/test';
import type { Tier } from '../../src/core/quality';
import { hideStartOverlay, openSim, sim } from './helpers';

const LIVING: [number, number, number, number, number] = [10.4, 0, 3.6, -90, 8];
const REPORT = 'test-results/materials-stats.json';

for (const tier of ['medium', 'low', 'high'] as Tier[]) {
  test(`realistic look (${tier}): textures, memory, clean network${tier === 'medium' ? ', leak-free' : ''}`, async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop project only');
    test.setTimeout(600_000);
    const bad: string[] = [];
    const foreign: string[] = [];
    page.on('response', (r) => {
      if (r.status() >= 400) bad.push(`${r.status()} ${r.url()}`);
    });
    page.on('requestfailed', (r) => bad.push(`failed ${r.url()}`));
    page.on('request', (r) => {
      const u = new URL(r.url());
      if (!['localhost', '127.0.0.1'].includes(u.hostname) && u.protocol.startsWith('http'))
        foreign.push(r.url());
    });
    const s = await openSim(page, `style=real&quality=${tier}`);
    await hideStartOverlay(page);
    // Walkable at once with flat colours; the textures follow.
    const first = await sim.stats(page);
    expect(first.quality).toBe(tier);
    await page.evaluate(() => window.__houseSim!.texturesReady());
    await sim.teleport(page, ...LIVING);
    const st = await sim.stats(page);
    expect(st.texturesLoaded).toBe(true);
    expect(st.probes).toBe(tier === 'low' ? 0 : 3);
    expect(st.lightmaps, st.lightmapStatus).toBe(true);
    expect(st.drawCalls).toBeLessThanOrEqual(45);
    if (tier === 'medium') {
      expect(st.textureMB).toBeLessThanOrEqual(75);
      // Leak check with textures loaded: after one warm-up visit of every look (each
      // builds and caches its resources once), the counts per look repeat on every visit.
      const seen = new Map<string, unknown>();
      const order = ['sketchup', 'borderlands', 'real', 'sketchup', 'real', 'borderlands', 'real'];
      for (const [i, style] of order.entries()) {
        await page.evaluate((n) => window.__houseSim!.setStyle(n as 'real'), style);
        await page.evaluate(() => window.__houseSim!.nextFrame());
        if (i < 3) continue;
        const c = await sim.stats(page);
        const key = { geometries: c.geometries, textures: c.textures, drawCalls: c.drawCalls };
        if (seen.has(style)) expect(key, style).toEqual(seen.get(style));
        else seen.set(style, key);
        expect(c.lightmaps, style).toBe(style === 'real');
      }
    }
    expect(s.errors).toEqual([]);
    expect(s.warnings).toEqual([]);
    expect(bad).toEqual([]);
    expect(foreign).toEqual([]);
    const row = {
      textureMB: Number(st.textureMB.toFixed(1)),
      textureDownloadMB: Number(st.textureDownloadMB.toFixed(2)),
      drawCallsLiving: st.drawCalls,
      trianglesLiving: st.triangles,
      probes: st.probes,
      lightmaps: st.lightmapStatus,
      pixelRatio: st.pixelRatio,
    };
    fs.mkdirSync('test-results', { recursive: true });
    const report = fs.existsSync(REPORT)
      ? (JSON.parse(fs.readFileSync(REPORT, 'utf8')) as Record<string, unknown>)
      : {};
    report[tier] = row;
    fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ [tier]: row }));
  });
}

test('realistic look without the bake (?baked=0): I4 shadow-map lighting', async ({
  page,
}, info) => {
  test.skip(info.project.name !== 'desktop', 'desktop project only');
  test.setTimeout(300_000);
  const s = await openSim(page, 'style=real&baked=0');
  await hideStartOverlay(page);
  await page.evaluate(() => window.__houseSim!.texturesReady());
  const st = await sim.stats(page);
  expect(st.lightmaps).toBe(false);
  expect(st.lightmapStatus).toBe('idle');
  expect(st.drawCalls).toBeLessThanOrEqual(45);
  expect(s.errors).toEqual([]);
  expect(s.warnings).toEqual([]);
});
