/**
 * S2 styles: three looks (SketchUp = default, Borderlands, Realistic) and the style
 * toggle. Quick pass (desktop): default load, toggle UI (switches, persists, `?style=`
 * override, K, no player movement / pointer lock), draw-call budgets per look, leak-free
 * switching, clean console. Full pass: touch check of the toggle (iPhone 13) and review
 * screenshots of every look (desktop HD + phone) in test-results/style-shots/.
 */
import fs from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import type { StyleName } from '../../src/core/params';
import { hideStartOverlay, openSim, sim } from './helpers';

type Pose = [number, number, number, number, number];
interface Counts {
  drawCalls: number;
  geometries: number;
  textures: number;
}
const OUT = 'test-results/style-shots';
const LIVING: Pose = [10.4, 0, 3.6, -90, 8];
// I3 budgets (garden, fence, vegetation added: 11 materials + their lines / hulls).
const BUDGET: Record<StyleName, number> = { sketchup: 70, borderlands: 90, real: 35 };
const STYLES: StyleName[] = ['sketchup', 'borderlands', 'real'];

// [name, kind, pose] — `start` is the load pose (captured at runtime).
const SHOTS: [string, 'pose' | 'view', Pose][] = [
  ['entrance', 'pose', [3.0, -0.05, -1.0, -90, 0]],
  ['living-east', 'pose', LIVING],
  ['bedroom-1', 'pose', [2.6, 0, 2.6, 30, -5]],
  ['aerial', 'view', [-14, 14, -12, -135, -30]],
];

// Switching to the realistic look also waits for its textures, sky and probes (I4), so
// counts and screenshots are taken with the finished look.
const setStyle = (page: Page, name: StyleName | 'sketch') =>
  page.evaluate(async (n) => {
    await window.__houseSim!.setStyle(n);
    if (n === 'real') await window.__houseSim!.texturesReady();
  }, name);
const getStyle = (page: Page) => page.evaluate(() => window.__houseSim!.getStyle());
const frame = (page: Page) => page.evaluate(() => window.__houseSim!.nextFrame());
const pill = (page: Page) => page.locator('.style-toggle .style-pill');
const option = (page: Page, name: StyleName) =>
  page.locator(`.style-toggle .style-option[data-style="${name}"]`);

async function counts(page: Page): Promise<Counts> {
  await frame(page);
  const st = await sim.stats(page);
  return { drawCalls: st.drawCalls, geometries: st.geometries, textures: st.textures };
}

async function startPose(page: Page): Promise<Pose> {
  const p = await sim.player(page);
  return [p.x, p.y, p.z, p.yaw, p.pitch];
}

async function shootAll(page: Page, style: StyleName, device: string, start: Pose): Promise<void> {
  fs.mkdirSync(OUT, { recursive: true });
  await sim.teleport(page, ...start);
  await page.screenshot({ path: `${OUT}/${style}-start-${device}.png` });
  for (const [name, kind, pose] of SHOTS) {
    if (kind === 'view') await sim.view(page, pose);
    else await sim.teleport(page, ...pose);
    await frame(page);
    await page.screenshot({ path: `${OUT}/${style}-${name}-${device}.png` });
  }
}

test.describe('styles', () => {
  test('desktop: toggle switches every look, persists, keeps the player still', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop project only');
    test.setTimeout(300_000);
    const s = await openSim(page);
    expect(await getStyle(page)).toBe('sketchup');
    await expect(page.locator('#app .paper-grain')).toHaveCount(1);
    await expect(pill(page)).toBeVisible();
    await expect(pill(page)).toHaveAttribute('aria-label', /SketchUp/);
    await expect(pill(page)).toContainText('SketchUp');
    const box = (await pill(page).boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.height).toBeGreaterThanOrEqual(40);
    expect(box.x + box.width).toBeGreaterThan(vp.width - 40); // top-right corner
    expect(box.y).toBeLessThan(40);

    // Clicking the toggle over the start overlay neither starts the game nor moves.
    const before = await sim.player(page);
    await pill(page).click();
    await expect(page.locator('.style-menu')).toBeVisible();
    await expect(option(page, 'sketchup')).toHaveAttribute('aria-checked', 'true');
    await option(page, 'borderlands').click();
    await expect(page.locator('.style-menu')).toBeHidden();
    await expect.poll(() => getStyle(page)).toBe('borderlands');
    await expect(pill(page)).toContainText('Borderlands');
    await expect(page.locator('#app .paper-grain')).toHaveCount(0);
    await expect(page.locator('#app .style-vignette')).toHaveCount(1);
    await expect(page.locator('.start')).not.toHaveClass(/off/);
    expect(await page.evaluate(() => document.pointerLockElement)).toBeNull();
    await frame(page);
    const after = await sim.player(page);
    expect([after.x, after.z, after.yaw, after.pitch]).toEqual([
      before.x,
      before.z,
      before.yaw,
      before.pitch,
    ]);

    // Tap outside (on the 3D view) closes the menu without switching.
    await hideStartOverlay(page);
    await pill(page).click();
    await expect(page.locator('.style-menu')).toBeVisible();
    await page.mouse.click(vp.width * 0.3, vp.height * 0.8);
    await expect(page.locator('.style-menu')).toBeHidden();
    expect(await getStyle(page)).toBe('borderlands');

    // Realistic, then the choice survives a reload.
    await pill(page).click();
    await option(page, 'real').click();
    await expect.poll(() => getStyle(page)).toBe('real');
    await expect(pill(page)).toContainText('Realistic');
    expect(await page.evaluate(() => localStorage.getItem('houseSim.style'))).toBe('real');
    const reloaded = await openSim(page);
    expect(await getStyle(page)).toBe('real');
    await expect(pill(page)).toContainText('Realistic');
    // `?style=` overrides the stored choice for one load (and doesn't overwrite it).
    const url = await openSim(page, 'style=borderlands');
    expect(await getStyle(page)).toBe('borderlands');
    expect(await page.evaluate(() => localStorage.getItem('houseSim.style'))).toBe('real');
    const alias = await openSim(page, 'style=sketch');
    expect(await getStyle(page)).toBe('sketchup');

    // K cycles SketchUp → Borderlands → Realistic → SketchUp (pill follows).
    await hideStartOverlay(page);
    for (const next of ['borderlands', 'real', 'sketchup'] as const) {
      await page.keyboard.press('KeyK');
      await expect.poll(() => getStyle(page)).toBe(next);
      await expect(page.locator('.style-toggle')).toHaveAttribute('data-style', next);
    }
    // Keyboard: the pill is a focusable button; Enter opens, arrows move, Enter picks.
    await pill(page).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.style-menu')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect.poll(() => getStyle(page)).toBe('borderlands');

    for (const x of [s, reloaded, url, alias]) {
      expect(x.errors).toEqual([]);
      expect(x.warnings).toEqual([]);
    }
  });

  test('desktop: budgets per look and leak-free switching between all three', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop project only');
    test.setTimeout(300_000);
    const s = await openSim(page);
    await hideStartOverlay(page);
    const start = await startPose(page);
    const stats: Record<string, unknown> = {};
    for (const style of STYLES) {
      await setStyle(page, style);
      expect(await getStyle(page)).toBe(style);
      await sim.teleport(page, ...start);
      const atStart = await sim.stats(page);
      await sim.teleport(page, ...LIVING);
      const living = await sim.stats(page);
      stats[style] = {
        start: { drawCalls: atStart.drawCalls, triangles: atStart.triangles },
        living: { drawCalls: living.drawCalls, triangles: living.triangles },
      };
      expect(atStart.drawCalls, `${style} at start`).toBeLessThanOrEqual(BUDGET[style]);
      expect(living.drawCalls, `${style} in the living room`).toBeLessThanOrEqual(BUDGET[style]);
    }
    const st = stats as Record<StyleName, { start: { drawCalls: number } }>;
    expect(st.real.start.drawCalls).toBeLessThan(st.sketchup.start.drawCalls);
    expect(st.sketchup.start.drawCalls).toBeLessThan(st.borderlands.start.drawCalls + 1);

    // Leak check at the living-room pose: every transition, twice round. All three looks
    // were already rendered here above (GPU uploads done), and resources are cached per
    // look, so the counts per look are identical on every visit.
    const order: StyleName[] = ['sketchup', 'borderlands', 'real', 'borderlands', 'sketchup'];
    order.push('real', 'sketchup', 'borderlands', 'real', 'borderlands', 'sketchup', 'real');
    const seen = new Map<StyleName, Counts>();
    for (const style of order) {
      await setStyle(page, style);
      const c = await counts(page);
      const prev = seen.get(style);
      if (prev) expect(c, style).toEqual(prev);
      else seen.set(style, c);
    }
    // `sketch` is an alias; the hook reports the canonical name.
    await setStyle(page, 'sketch');
    expect(await getStyle(page)).toBe('sketchup');
    expect(await counts(page)).toEqual(seen.get('sketchup'));

    fs.mkdirSync('test-results', { recursive: true });
    const result = { project: info.project.name, viewport: page.viewportSize(), stats };
    fs.writeFileSync('test-results/style-stats.json', JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result));
    expect(s.errors).toEqual([]);
    expect(s.warnings).toEqual([]);
  });

  // Full pass only: a touch on the toggle never starts the joystick or a look drag.
  test('phone: tapping the toggle switches the look without moving or looking', async ({
    page,
  }, info) => {
    test.skip(info.project.name !== 'iphone-13', 'touch project only (full pass)');
    test.setTimeout(240_000);
    const s = await openSim(page);
    await page.locator('.start button').tap();
    await expect(page.locator('.start')).toHaveClass(/off/);
    await expect(pill(page)).toBeVisible();
    const box = (await pill(page).boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', x: number, y: number) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 7, radiusX: 4, radiusY: 4 }],
      });
    const before = await sim.player(page);
    // A sloppy tap: finger down on the pill, drifts 30 px, lifts.
    const x = box.x + box.width / 2;
    const y = box.y + box.height / 2;
    await touch('touchStart', x, y);
    await touch('touchMove', x - 15, y + 5);
    await touch('touchMove', x - 30, y + 10);
    await expect(page.locator('.joy-base')).not.toHaveClass(/on/);
    await touch('touchEnd', x - 30, y + 10);
    // The drift may cancel the click; a clean tap opens the menu.
    if (!(await page.locator('.style-menu').isVisible())) await pill(page).tap();
    await expect(page.locator('.style-menu')).toBeVisible();
    await option(page, 'borderlands').tap();
    await expect.poll(() => getStyle(page)).toBe('borderlands');
    await expect(pill(page)).toContainText('Borderlands');
    await frame(page);
    const after = await sim.player(page);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThan(1e-6);
    expect(after.yaw).toBeCloseTo(before.yaw, 6);
    expect(after.pitch).toBeCloseTo(before.pitch, 6);
    await expect(page.locator('.joy-base')).not.toHaveClass(/on/);
    const st = await sim.stats(page);
    expect(st.drawCalls).toBeLessThanOrEqual(BUDGET.borderlands);
    expect(s.errors).toEqual([]);
    expect(s.warnings).toEqual([]);
  });

  // Full pass only (`npm run e2e:full`): review screenshots of all three looks.
  test('screenshots: all three looks (desktop HD + phone), no warnings', async ({ page }, info) => {
    const device = { 'desktop-hd': 'desktop', 'iphone-13': 'phone' }[info.project.name];
    test.skip(!device, 'screenshot projects only (desktop-hd, iphone-13)');
    // SwiftShader at HD / the iPhone's DPR is slow: the realistic look (PBR textures,
    // probes) alone takes ~10–15 min there, all three looks ~20–25 min.
    test.setTimeout(1_800_000);
    const s = await openSim(page);
    await hideStartOverlay(page);
    expect(await getStyle(page)).toBe('sketchup');
    const start = await startPose(page);
    for (const style of STYLES) {
      await setStyle(page, style);
      const st = await sim.stats(page);
      expect(st.drawCalls).toBeLessThanOrEqual(BUDGET[style]);
      await shootAll(page, style, device!, start);
    }
    expect(s.errors).toEqual([]);
    expect(s.warnings).toEqual([]);
  });
});
