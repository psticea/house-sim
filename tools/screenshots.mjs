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
  ['kitchen', 'pose', [13.0, 0, 5.5, 20, 0], DESK],
  ['bedroom-1', 'pose', [2.6, 0, 2.6, 30, -5], DESK],
  ['bedroom-2', 'pose', [4.0, 0, 4.4, 150, -5], DESK],
  ['bathroom', 'pose', [5.9, 0, 4.2, 180, -8], DESK],
  ['boiler', 'pose', [5.8, 0, 2.0, 0, -5], DESK],
  ['stairs', 'pose', [8.9, 0, 3.0, 180, 10], DESK],
  ['terrace-back', 'pose', [19.3, 0, 4.0, 90, 5], DESK],
  ['terrace-south', 'pose', [14.0, 0, 8.6, 90, 0], DESK],
  ['aerial-nw', 'view', [-14, 14, -12, -135, -30], DESK],
  ['aerial-se', 'view', [30, 12, 20, 55, -22], DESK],
  ['aerial-sw', 'view', [-12, 9, 22, -145 + 360 - 360, -18], DESK],
  ['east-elev', 'view', [34, 3.8, 3.625, 90, 0], DESK],
  ['west-elev', 'view', [-22, 3.8, 3.625, -90, 0], DESK],
  ['north-elev', 'view', [9.0, 3.8, -26, 180, 0], DESK],
  ['south-elev', 'view', [9.0, 3.8, 33, 0, 0], DESK],
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
