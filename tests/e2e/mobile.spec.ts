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
});
