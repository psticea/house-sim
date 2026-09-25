// Dev-only: capture screenshots from a set of poses into test-results/shots/ (git-ignored).
// Usage: node tools/screenshots.mjs [baseUrl] [name,name,...] [extraQuery] [fileSuffix]
//   baseUrl defaults to http://localhost:5173/ (npm run dev)
//   The site loads in the SketchUp look by default; pass extraQuery `style=borderlands` or
//   `style=real`, e.g. `node tools/screenshots.mjs http://localhost:5173/ start style=real -real`.
//   For all poses of one look in a single page load, see tools/style-shots.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = process.argv[2] ?? 'http://localhost:5173/';
const filter = (process.argv[3] ?? '').split(',').filter(Boolean);
const extra = process.argv[4] ?? '';
const suffix = process.argv[5] ?? '';
const outDir = path.resolve('test-results', 'shots');
fs.mkdirSync(outDir, { recursive: true });

// [name, kind, pose(x,y,z,yawDeg,pitchDeg), viewport]
const DESK = { width: 1280, height: 720 };
const PHONE = { width: 390, height: 844 };
const LAND = { width: 844, height: 390 };
const shots = [
  ['start', 'start', null, DESK],
  ['start-phone', 'start', null, PHONE],
  ['start-landscape', 'start', null, LAND],
  ['entrance', 'pose', [3.0, -0.05, -1.0, -90, 0], DESK],
  ['entrance-door', 'pose', [8.8, -0.05, -1.3, 180, -3], DESK],
  ['hall', 'pose', [8.4, 0, 0.8, 180, -5], DESK],
  ['hall-corridor', 'pose', [8.8, 0, 3.0, 90, -5], DESK],
  ['living-east', 'pose', [10.4, 0, 3.6, -90, 8], DESK],
  ['living-west', 'pose', [15.8, 0, 4.5, 90, 12], DESK],
  ['living-up', 'pose', [13.0, 0, 3.6, -90, 45], DESK],
  ['kitchen', 'pose', [13.6, 0, 6.5, 20, 0], DESK],
  ['bedroom-1', 'pose', [2.6, 0, 2.6, 30, -5], DESK],
  ['bedroom-2', 'pose', [4.0, 0, 4.4, 150, -5], DESK],
  ['bathroom', 'pose', [5.9, 0, 4.2, 180, -8], DESK],
  ['boiler', 'pose', [5.8, 0, 2.0, 0, -5], DESK],
  ['stairs', 'pose', [8.9, 0, 3.0, 180, 10], DESK],
  // I2: upper floor, stairs, basement.
  ['stair-below', 'pose', [8.9, 0, 3.2, 180, 0], DESK],
  ['stair-landing', 'pose', [8.8, 1.57, 6.6, 20, 12], DESK],
  ['stair-top', 'pose', [7.8, 2.95, 3.5, 180, -30], DESK],
  ['upper-hall', 'pose', [5.3, 2.95, 3.0, -90, 0], DESK],
  ['study-void', 'pose', [8.6, 2.95, 1.86, -90, -12], DESK],
  ['study', 'pose', [6.5, 2.95, 2.0, 40, 12], DESK],
  ['bedroom-3', 'pose', [3.9, 2.95, 5.8, 55, 12], DESK],
  ['bedroom-3-north', 'pose', [1.9, 2.95, 5.5, 0, 15], DESK],
  ['upper-bath', 'pose', [5.6, 2.95, 4.2, 180, 5], DESK],
  ['basement-stair', 'pose', [7.8, 0, 3.95, 180, -35], DESK],
  ['storage', 'pose', [11.3, -2.53, 5.2, 135, -5], DESK],
  ['storage-stair', 'pose', [10.2, -2.53, 6.6, 90, 10], DESK],
  ['north-canopy', 'view', [8.0, 1.7, -9, 180, 3], DESK],
  ['south-sunshade', 'view', [6.0, 1.7, 14, 0, 8], DESK],
  ['east-gable', 'view', [30, 3.5, 3.6, 90, 3], DESK],
  ['roof-aerial', 'view', [9, 16, 18, 0, -35], DESK],
  ['terrace-back', 'pose', [19.3, 0, 4.0, 90, 5], DESK],
  ['terrace-south', 'pose', [14.0, 0, 8.6, 90, 0], DESK],
  ['aerial-nw', 'view', [-14, 14, -12, -135, -30], DESK],
  ['aerial-se', 'view', [30, 12, 20, 55, -22], DESK],
  ['aerial-sw', 'view', [-12, 9, 22, -145 + 360 - 360, -18], DESK],
  ['east-elev', 'view', [34, 3.8, 3.625, 90, 0], DESK],
  ['west-elev', 'view', [-22, 3.8, 3.625, -90, 0], DESK],
  ['north-elev', 'view', [9.0, 3.8, -26, 180, 0], DESK],
  ['south-elev', 'view', [9.0, 3.8, 33, 0, 0], DESK],
  // I3: garden & fence.
  ['garden-aerial', 'view', [8.6, 34, 6.0, 0, -89.9], DESK],
  ['garden-aerial-sw', 'view', [-16, 18, 26, -51, -32], DESK],
  ['gate-street', 'pose', [-7.8, -0.2, 19.5, 5, 0], DESK],
  ['north-side', 'pose', [11.9, -0.05, -0.63, -90, -4], DESK],
  ['south-garden', 'pose', [8.8, -0.1, 9.9, -105, -6], DESK],
  ['rear-garden', 'pose', [20.3, -0.1, 9.5, -25, -4], DESK],
  ['terrace-out', 'pose', [18.9, 0, 4.8, -90, -4], DESK],
  ['living-out', 'pose', [13.2, 0, 3.4, -90, 0], DESK],
];

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const errors = [];
for (const [name, kind, pose, viewport] of shots) {
  if (filter.length && !filter.includes(name)) continue;
  const phone = viewport.width < 900 && viewport.height > 0 && name.includes('phone');
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: 1,
    hasTouch: phone || name.includes('landscape'),
    isMobile: phone || name.includes('landscape'),
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning')
      errors.push(`${name}: ${m.type()} ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push(`${name}: pageerror ${e.message}`));
  let url = base;
  if (kind === 'pose') url += `?debug&pose=${pose.join(',')}`;
  else if (kind === 'view') url += `?debug&view=${pose.join(',')}`;
  else url += '?debug';
  if (extra) url += `&${extra}`;
  await page.goto(url);
  await page.waitForFunction(() => window.__houseSim?.isReady === true, null, { timeout: 60000 });
  // Dismiss the start overlay for clean screenshots of the scene (keep it for "start").
  if (name !== 'start')
    await page.evaluate(() => document.querySelector('.start')?.classList.add('off'));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(outDir, `${name}${suffix}.png`), timeout: 180000 });
  const info = await page.evaluate(() => ({
    p: window.__houseSim.getPlayer(),
    s: window.__houseSim.getStats(),
  }));
  console.log(
    name.padEnd(16),
    `room=${info.p.room} place=${info.p.place}`,
    `pos=${info.p.x.toFixed(2)},${info.p.y.toFixed(2)},${info.p.z.toFixed(2)}`,
    `calls=${info.s.drawCalls} tris=${info.s.triangles}`,
  );
  await context.close();
}
await browser.close();
if (errors.length) console.log('CONSOLE:\n' + [...new Set(errors)].join('\n'));
