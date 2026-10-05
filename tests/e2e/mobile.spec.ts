import { expect, test } from '@playwright/test';
import { openSim, sim } from './helpers';

test.describe('touch UI (mobile emulation)', () => {
  test('shows the touch start card, joystick moves the player, look drags the view', async ({
    page,
  }) => {
    const s = await openSim(page);
    await expect(page.locator('.start button')).toHaveText('Tap to start');
    await page.screenshot({
      path: `test-results/e2e-shots/mobile-start-${test.info().project.name}.png`,
    });
    await page.locator('.start button').tap();
    await expect(page.locator('.start')).toHaveClass(/off/);

    const vp = page.viewportSize()!;
    const cdp = await page.context().newCDPSession(page);
    const touch = (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      points: { x: number; y: number; id: number }[],
    ) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map((p) => ({
          x: p.x,
          y: p.y,
          id: p.id,
          radiusX: 4,
          radiusY: 4,
          force: 1,
        })),
      });

    const before = await sim.player(page);
    // Left thumb: joystick pushed forward (not to the rim → walk).
    const jx = vp.width * 0.2;
    const jy = vp.height * 0.8;
    await touch('touchStart', [{ x: jx, y: jy, id: 1 }]);
    await touch('touchMove', [{ x: jx, y: jy - 20, id: 1 }]);
    await touch('touchMove', [{ x: jx, y: jy - 40, id: 1 }]);
    await expect(page.locator('.joy-base')).toHaveClass(/on/);
    // Right thumb at the same time: drag to look (multi-touch).
    const lx = vp.width * 0.75;
    const ly = vp.height * 0.5;
    await touch('touchStart', [
      { x: jx, y: jy - 40, id: 1 },
      { x: lx, y: ly, id: 2 },
    ]);
    for (let i = 1; i <= 6; i++) {
      await touch('touchMove', [
        { x: jx, y: jy - 40, id: 1 },
        { x: lx - i * 10, y: ly, id: 2 },
      ]);
    }
    await page.screenshot({
      path: `test-results/e2e-shots/mobile-joystick-${test.info().project.name}.png`,
    });
    await page.waitForTimeout(1500);
    await touch('touchEnd', []);
    await page.evaluate(() => window.__houseSim!.nextFrame());
    const after = await sim.player(page);
    const moved = Math.hypot(after.x - before.x, after.z - before.z);
    expect(moved).toBeGreaterThan(0.1);
    expect(Math.abs(after.yaw - before.yaw)).toBeGreaterThan(1);
    await expect(page.locator('.joy-base')).not.toHaveClass(/on/);
    // The page must not scroll or zoom.
    expect(
      await page.evaluate(() => [
        window.scrollX,
        window.scrollY,
        window.visualViewport?.scale ?? 1,
      ]),
    ).toEqual([0, 0, 1]);
    expect(s.errors).toEqual([]);
  });

  test('fly controls: drop-down shows two thumb sticks that fly the drone', async ({ page }) => {
    const s = await openSim(page);
    await expect(page.locator('.fly-stick')).toHaveCount(2);
    await expect(page.locator('.fly-stick').first()).toBeHidden();
    await page.locator('.controls-pill').tap();
    await page.locator('.controls-option[data-controls="fly"]').tap();
    await expect(page.locator('.controls-toggle')).toHaveAttribute('data-controls', 'fly');
    expect(await page.evaluate(() => window.__houseSim!.getControls())).toBe('fly');
    await expect(page.locator('.start p')).toContainText('Left stick');
    await page.locator('.start button').tap();
    await expect(page.locator('.start')).toHaveClass(/off/);

    // Both sticks visible, in the bottom corners, within thumb reach.
    const vp = page.viewportSize()!;
    const left = (await page.locator('.fly-stick.left').boundingBox())!;
    const right = (await page.locator('.fly-stick.right').boundingBox())!;
    for (const b of [left, right]) {
      expect(b.width).toBeGreaterThanOrEqual(100);
      expect(b.y + b.height).toBeLessThanOrEqual(vp.height);
      expect(b.y).toBeGreaterThan(vp.height * 0.55);
    }
    expect(left.x + left.width).toBeLessThan(vp.width / 2);
    expect(right.x).toBeGreaterThan(vp.width / 2);
    // Left = move (as in Walk), right = altitude + turn.
    await expect(page.locator('.fly-stick.left')).toContainText('Forward · Back');
    await expect(page.locator('.fly-stick.left')).toContainText('Sideways');
    await expect(page.locator('.fly-stick.right')).toContainText('Up · Down');
    await expect(page.locator('.fly-stick.right')).toContainText('Turn');
    await page.screenshot({
      path: `test-results/e2e-shots/mobile-fly-${test.info().project.name}.png`,
    });

    const cdp = await page.context().newCDPSession(page);
    const touch = (
      type: 'touchStart' | 'touchMove' | 'touchEnd',
      points: { x: number; y: number; id: number }[],
    ) =>
      cdp.send('Input.dispatchTouchEvent', {
        type,
        touchPoints: points.map((p) => ({ ...p, radiusX: 4, radiusY: 4, force: 1 })),
      });
    const before = await page.evaluate(() => window.__houseSim!.getDrone());
    // Left stick up (forward, like the walk joystick) + right stick up (climb), both at once.
    const l = { x: left.x + left.width / 2, y: left.y + left.height / 2 };
    const r = { x: right.x + right.width / 2, y: right.y + right.height / 2 };
    await touch('touchStart', [{ ...l, id: 1 }]);
    await touch('touchStart', [
      { ...l, id: 1 },
      { ...r, id: 2 },
    ]);
    for (let i = 1; i <= 6; i++) {
      await touch('touchMove', [
        { x: l.x, y: l.y - i * 10, id: 1 },
        { x: r.x, y: r.y - i * 10, id: 2 },
      ]);
    }
    await expect(page.locator('.fly-stick.left')).toHaveClass(/on/);
    await expect(page.locator('.fly-stick.right')).toHaveClass(/on/);
    await page.waitForTimeout(1500);
    await touch('touchEnd', []);
    await page.evaluate(() => window.__houseSim!.nextFrame());
    const after = await page.evaluate(() => window.__houseSim!.getDrone());
    expect(after.y - before.y).toBeGreaterThan(0.3);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeGreaterThan(0.3);
    await expect(page.locator('.fly-stick.left')).not.toHaveClass(/on/);
    // The walk joystick stays out of the way while flying.
    await expect(page.locator('.joy-base')).not.toHaveClass(/on/);
    expect(s.errors).toEqual([]);
  });
});
