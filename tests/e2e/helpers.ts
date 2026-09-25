/** Shared e2e helpers: load the page, collect console errors, typed access to the hooks. */
import { expect, type Page, type TestInfo } from '@playwright/test';
import type { HouseSimHooks, PlayerInfo, Stats } from '../../src/app';

export interface Session {
  errors: string[];
  /** Console warnings (e.g. three.js deprecations), minus Chromium's GL driver chatter. */
  warnings: string[];
}

const DRIVER_NOISE = /GL Driver Message|GPU stall due to ReadPixels|\[\.WebGL-/;

export async function openSim(page: Page, query = ''): Promise<Session> {
  const errors: string[] = [];
  const warnings: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
    if (m.type() === 'warning' && !DRIVER_NOISE.test(m.text())) warnings.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(query ? `./?${query}` : './');
  // The house is walkable first; every test runs with the furniture in place (I5).
  await page.waitForFunction(
    () => window.__houseSim?.isReady === true && window.__houseSim.furnished,
    null,
    { timeout: 120_000 },
  );
  return { errors, warnings };
}

type Hooks = HouseSimHooks;

export const sim = {
  player: (page: Page): Promise<PlayerInfo> => page.evaluate(() => window.__houseSim!.getPlayer()),
  stats: (page: Page): Promise<Stats> => page.evaluate(() => window.__houseSim!.getStats()),
  teleport: (page: Page, ...a: Parameters<Hooks['teleport']>): Promise<PlayerInfo> =>
    page.evaluate((args) => window.__houseSim!.teleport(...args), a),
  walk: (page: Page, ...a: Parameters<Hooks['walk']>): Promise<PlayerInfo> =>
    page.evaluate((args) => window.__houseSim!.walk(...args), a),
  walkTo: async (page: Page, x: number, z: number, run = false): Promise<PlayerInfo> => {
    const r = await page.evaluate(
      ([tx, tz, rr]) => window.__houseSim!.walkTo(tx, tz, { run: rr, timeout: 40 }),
      [x, z, run] as const,
    );
    expect(
      r.reached,
      `walkTo(${x}, ${z}) stopped at ${r.player.x.toFixed(2)}, ${r.player.z.toFixed(2)}`,
    ).toBe(true);
    return r.player;
  },
  /** Walks a list of waypoints inside one page round-trip (SwiftShader frames are slow). */
  route: async (page: Page, points: [number, number][]): Promise<PlayerInfo[]> => {
    const results = await page.evaluate(async (pts) => {
      const out = [];
      for (const [x, z] of pts) out.push(await window.__houseSim!.walkTo(x, z, { timeout: 40 }));
      return out;
    }, points);
    results.forEach((r, i) => {
      const [x, z] = points[i]!;
      expect(
        r.reached,
        `walkTo(${x}, ${z}) stopped at ${r.player.x.toFixed(2)}, ${r.player.z.toFixed(2)}`,
      ).toBe(true);
    });
    return results.map((r) => r.player);
  },
  view: (page: Page, pose: [number, number, number, number, number] | null): Promise<void> =>
    page.evaluate((p) => window.__houseSim!.view(p), pose),
};

export async function hideStartOverlay(page: Page): Promise<void> {
  await page.evaluate(() => document.querySelector('.start')?.classList.add('off'));
}

/** Screenshots are only taken in the full pass (`npm run e2e:full`), not the quick one. */
export const takesShots = (info: TestInfo): boolean => info.project.name !== 'desktop';

export async function shot(page: Page, info: TestInfo, path: string): Promise<void> {
  if (takesShots(info)) await page.screenshot({ path });
}
