// Dev-only: screenshots of the review poses for one or more looks, one page load per
// look (poses via the __houseSim hooks — much faster than a reload per shot).
// Output: test-results/shots/<style>-<pose>[-phone].png (git-ignored).
// Usage: node tools/style-shots.mjs [baseUrl] [styles] [poses] [phone|desk] [extraQuery] [suffix]
//   e.g. node tools/style-shots.mjs http://localhost:5173/ borderlands start,living-east
//        node tools/style-shots.mjs http://localhost:5173/ sketchup,borderlands,real "" phone
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = process.argv[2] || 'http://localhost:5173/';
const styles = (process.argv[3] || 'borderlands').split(',').filter(Boolean);
const only = (process.argv[4] || '').split(',').filter(Boolean);
const phone = process.argv[5] === 'phone';
const extra = process.argv[6] || '';
const suffix = process.argv[7] || '';
const outDir = path.resolve('test-results', 'shots');
fs.mkdirSync(outDir, { recursive: true });

// [name, kind, pose]; `start` = the load pose.
const POSES = [
  ['start', 'start', null],
  ['entrance', 'pose', [3.0, -0.05, -1.0, -90, 0]],
  ['living-east', 'pose', [10.4, 0, 3.6, -90, 8]],
  ['bedroom-1', 'pose', [2.6, 0, 2.6, 30, -5]],
  ['aerial', 'view', [-14, 14, -12, -135, -30]],
  ['kitchen', 'pose', [13.0, 0, 5.5, 20, 0]],
  ['terrace-south', 'pose', [14.0, 0, 8.6, 90, 0]],
  ['aerial-se', 'view', [30, 12, 20, 55, -22]],
  ['south-elev', 'view', [9.0, 3.8, 33, 0, 0]],
  // I3: garden & fence.
  ['garden-aerial', 'view', [8.6, 34, 6.0, 0, -89.9]],
  ['gate-street', 'pose', [-7.8, -0.2, 19.5, 5, 0]],
  ['north-side', 'pose', [11.9, -0.05, -0.63, -90, -4]],
  ['south-garden', 'pose', [8.8, -0.1, 9.9, -105, -6]],
  ['rear-garden', 'pose', [20.3, -0.1, 9.5, -25, -4]],
  ['terrace-out', 'pose', [18.9, 0, 4.8, -90, -4]],
  ['living-out', 'pose', [13.2, 0, 3.4, -90, 0]],
  // I4: materials close-ups.
  ['facade-north', 'pose', [7.5, -0.05, -6.5, 160, 12]],
  ['bathroom', 'pose', [5.9, 0, 4.2, 180, -32]],
  ['bedroom-3', 'pose', [3.9, 2.95, 5.8, 55, 12]],
  ['stairs', 'pose', [8.9, 0, 3.0, 180, 10]],
  ['lawn-close', 'pose', [8.8, -0.1, 9.9, -105, -35]],
  // The start view with the style menu open (UI check).
  ['menu', 'menu', null],
];

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const problems = [];
for (const style of styles) {
  const context = await browser.newContext(
    phone
      ? {
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 1,
          hasTouch: true,
          isMobile: true,
        }
      : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  );
  const page = await context.newPage();
  page.on('console', (m) => {
    if (['error', 'warning'].includes(m.type()) && !/GL Driver|GPU stall|\[\.WebGL-/.test(m.text()))
      problems.push(`${style}: ${m.type()} ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`${style}: pageerror ${e.message}`));
  await page.goto(`${base}?style=${style}${extra ? `&${extra}` : ''}`);
  await page.waitForFunction(() => window.__houseSim?.isReady === true, null, { timeout: 120000 });
  await page.evaluate(() => document.querySelector('.start')?.classList.add('off'));
  // Realistic look: wait for the streamed textures, sky and probes (I4).
  if (style === 'real') await page.evaluate(() => window.__houseSim.texturesReady());
  const start = await page.evaluate(() => window.__houseSim.getPlayer());
  for (const [name, kind, pose] of POSES) {
    if (only.length && !only.includes(name)) continue;
    await page.evaluate(
      async ([k, p, s]) => {
        const h = window.__houseSim;
        if (k === 'view') await h.view(p);
        else if (k === 'pose') await h.teleport(...p);
        else await h.teleport(s.x, s.y, s.z, s.yaw, s.pitch);
        await h.nextFrame();
      },
      [kind, pose, start],
    );
    if (kind === 'menu') await page.locator('.style-pill').click();
    const file = path.join(outDir, `${style}-${name}${phone ? '-phone' : ''}${suffix}.png`);
    await page.screenshot({ path: file, timeout: 180000 });
    const s = await page.evaluate(() => window.__houseSim.getStats());
    console.log(style.padEnd(12), name.padEnd(14), `calls=${s.drawCalls} tris=${s.triangles}`);
  }
  await context.close();
}
await browser.close();
if (problems.length) console.log('CONSOLE:\n' + [...new Set(problems)].join('\n'));
