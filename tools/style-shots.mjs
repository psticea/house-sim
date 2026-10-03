// Dev-only: screenshots of the review poses for one or more looks, one page load per
// look (poses via the __houseSim hooks — much faster than a reload per shot).
// Output: test-results/shots/<style>-<pose>[-phone].png (git-ignored); the furniture review
// poses (furn-*, fu-*) are saved as furn-<room>-<style>[-phone].png / fu-<room>-<view>-<style>.png.
// Usage: node tools/style-shots.mjs [baseUrl] [styles] [poses] [phone|desk] [extraQuery] [suffix]
//   e.g. node tools/style-shots.mjs http://localhost:5173/ borderlands start,living-east
//        GPU=1 node tools/style-shots.mjs http://localhost:5173/ real living-east (real GPU)
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
  ['kitchen', 'pose', [13.6, 0, 6.5, 20, 0]],
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
  // I5: furniture.
  ['f-hall', 'pose', [8.75, 0, 3.2, 12, -12]],
  ['f-kitchen', 'pose', [12.3, 0, 3.6, 10, -14]],
  ['f-living', 'pose', [14.8, 0, 3.0, 125, -16]],
  ['f-dining', 'pose', [13.2, 0, 3.4, -125, -18]],
  ['f-play', 'pose', [12.4, 0, 3.4, 130, -20]],
  ['f-bed1', 'pose', [2.9, 0, 3.3, 24, -16]],
  ['f-bed2', 'pose', [3.9, 0, 4.6, 110, -18]],
  ['f-bath', 'pose', [5.35, 0, 5.0, -115, -18]],
  ['f-boiler', 'pose', [5.8, 0, 2.1, -20, -18]],
  ['f-storage', 'pose', [9.9, -2.53, 6.5, -50, -12]],
  ['f-bed3', 'pose', [1.6, 2.95, 3.0, -135, -14]],
  ['f-study', 'pose', [5.6, 2.95, 1.9, -55, -18]],
  ['f-upper-bath', 'pose', [5.9, 2.95, 4.2, 180, -24]],
  ['f-upper-hall', 'pose', [5.3, 2.95, 3.2, -80, -10]],
  ['f-terrace', 'pose', [19.3, 0, 7.4, 20, -14]],
  // Furniture placed from the plans (sheets 04-06): one or two eye-level views per room.
  // Saved as furn-<room>-<style>.png.
  ['furn-hall', 'pose', [9.1, 0, 2.3, 58, -8]],
  ['furn-hall-corridor', 'pose', [4.0, 0, 3.0, -85, -6]],
  ['furn-living-a', 'pose', [13.9, 0, 6.85, 15, -8]],
  ['furn-living-b', 'pose', [14.9, 0, 3.3, 128, -12]],
  ['furn-kitchen', 'pose', [14.6, 0, 3.45, 42, -12]],
  ['furn-dining', 'pose', [16.15, 0, 3.4, 62, -14]],
  ['furn-play', 'pose', [12.4, 0, 3.4, 130, -18]],
  ['furn-stairs', 'pose', [8.9, 0, 3.0, 180, 10]],
  ['furn-bed1', 'pose', [1.9, 0, 2.3, -60, -14]],
  ['furn-bed1-desk', 'pose', [2.9, 0, 1.2, 128, -14]],
  ['furn-bed2', 'pose', [4.2, 0, 4.5, 105, -12]],
  ['furn-bed2-corner', 'pose', [1.4, 0, 6.5, -55, -10]],
  ['furn-bath', 'pose', [5.55, 0, 4.4, -168, -18]],
  ['furn-bath-north', 'pose', [5.6, 0, 6.0, -12, -18]],
  ['furn-boiler', 'pose', [5.6, 0, 2.15, -25, -14]],
  ['furn-storage', 'pose', [9.9, -2.53, 6.5, -50, -12]],
  ['furn-bed3', 'pose', [3.85, 2.95, 3.1, 96, -20]],
  ['furn-bed3-wardrobes', 'pose', [1.0, 2.95, 3.4, -62, -8]],
  ['furn-study', 'pose', [6.0, 2.95, 1.9, -72, -12]],
  ['furn-study-shelves', 'pose', [6.5, 2.95, 1.95, 52, -14]],
  ['furn-upper-hall', 'pose', [5.3, 2.95, 3.0, -90, -6]],
  ['furn-upper-bath', 'pose', [5.75, 2.95, 4.25, 160, -20]],
  ['furn-upper-shower', 'pose', [5.45, 2.95, 5.9, -35, -10]],
  ['furn-terrace', 'pose', [19.3, 0, 7.4, 20, -14]],
  // Owner follow-ups (bedroom 3 by choice, full-length study desk, kitchen wall cupboards).
  // Saved as fu-<room>-<view>-<style>.png.
  ['fu-bed3-a', 'pose', [1.3, 2.95, 2.0, -145, -12]],
  ['fu-bed3-b', 'pose', [4.0, 2.95, 3.2, 103, -10]],
  ['fu-bed3-c', 'pose', [1.2, 2.95, 5.0, -40, -10]],
  ['fu-study-door', 'pose', [5.8, 2.95, 1.9, -85, -10]],
  ['fu-study-side', 'pose', [7.6, 2.95, 1.95, -49, -14]],
  ['fu-kitchen-front', 'pose', [13.0, 0, 3.4, 0, 4]],
  ['fu-kitchen-angle', 'pose', [15.9, 0, 3.3, 57, 2]],
  // I4 redo (textures): every room + exterior / garden close-ups. Saved as
  // tx-<pose>[-<style> unless real]<suffix>.png (suffix e.g. -before / -after).
  ['tx-start', 'start', null],
  ['tx-hall', 'pose', [9.1, 0, 2.3, 58, -8]],
  ['tx-hall-corridor', 'pose', [4.0, 0, 3.0, -85, -6]],
  ['tx-living', 'pose', [13.9, 0, 6.85, 15, -8]],
  ['tx-living-b', 'pose', [14.9, 0, 3.3, 128, -12]],
  ['tx-living-ceiling', 'pose', [12.6, 0, 6.6, 0, 38]],
  ['tx-kitchen', 'pose', [13.0, 0, 3.4, 0, 4]],
  ['tx-kitchen-close', 'pose', [14.6, 0, 2.2, 0, -22]],
  ['tx-dining', 'pose', [16.15, 0, 3.4, 62, -14]],
  ['tx-play', 'pose', [12.4, 0, 3.4, 130, -18]],
  ['tx-bed1', 'pose', [1.9, 0, 2.3, -60, -14]],
  ['tx-bed2', 'pose', [4.2, 0, 4.5, 105, -12]],
  ['tx-bath', 'pose', [5.55, 0, 4.4, -168, -18]],
  ['tx-bath-north', 'pose', [5.6, 0, 6.0, -12, -12]],
  ['tx-boiler', 'pose', [5.6, 0, 2.15, -25, -14]],
  ['tx-stairs', 'pose', [8.9, 0, 3.0, 180, 10]],
  ['tx-bed3', 'pose', [4.0, 2.95, 3.2, 103, -10]],
  ['tx-study', 'pose', [7.6, 2.95, 1.95, -49, -14]],
  ['tx-upper-bath', 'pose', [5.75, 2.95, 4.25, 160, -20]],
  ['tx-upper-shower', 'pose', [5.45, 2.95, 5.9, -35, -10]],
  ['tx-upper-hall', 'pose', [5.3, 2.95, 3.0, -90, -6]],
  ['tx-storage', 'pose', [9.9, -2.53, 6.5, -50, -12]],
  ['tx-west', 'pose', [-5.6, -0.1, 3.6, -90, 16]],
  ['tx-west-close', 'pose', [-1.6, -0.1, 1.6, -125, 8]],
  ['tx-north', 'pose', [7.5, -0.05, -6.5, 160, 12]],
  ['tx-north-close', 'pose', [11.9, -0.05, -0.63, -90, -4]],
  ['tx-south', 'pose', [9.0, -0.1, 14.2, 0, 14]],
  ['tx-south-close', 'pose', [8.8, -0.1, 9.9, -105, -6]],
  ['tx-east', 'pose', [24.5, -0.1, 3.6, 90, 8]],
  ['tx-aerial', 'view', [-14, 14, -12, -135, -30]],
  ['tx-aerial-se', 'view', [30, 12, 20, 55, -22]],
  ['tx-terrace', 'pose', [19.3, 0, 7.4, 20, -14]],
  ['tx-deck', 'pose', [18.9, 0, 4.8, -90, -34]],
  ['tx-paving', 'pose', [-7.8, -0.2, 19.5, 5, -24]],
  ['tx-lawn', 'pose', [8.8, -0.1, 9.9, -105, -35]],
  ['tx-fence', 'pose', [20.3, -0.1, 9.5, -25, -4]],
  // I6 redo (lighting): every room + the outside. Saved like the tx- poses:
  // lt-<pose>[-<style> unless real]<suffix>.png (suffix e.g. -before / -after).
  ['lt-start', 'start', null],
  ['lt-hall', 'pose', [9.1, 0, 2.3, 58, -8]],
  ['lt-hall-corridor', 'pose', [4.0, 0, 3.0, -85, -6]],
  ['lt-living', 'pose', [13.9, 0, 6.85, 15, -8]],
  ['lt-living-b', 'pose', [14.9, 0, 3.3, 128, -12]],
  ['lt-living-east', 'pose', [10.4, 0, 3.6, -90, 8]],
  ['lt-living-ceiling', 'pose', [12.6, 0, 6.6, 0, 38]],
  ['lt-kitchen', 'pose', [13.0, 0, 3.4, 0, 4]],
  ['lt-dining', 'pose', [16.15, 0, 3.4, 62, -14]],
  ['lt-play', 'pose', [12.4, 0, 3.4, 130, -18]],
  ['lt-bed1', 'pose', [1.9, 0, 2.3, -60, -14]],
  ['lt-bed2', 'pose', [4.2, 0, 4.5, 105, -12]],
  ['lt-bath', 'pose', [5.55, 0, 4.4, -168, -18]],
  ['lt-bath-north', 'pose', [5.6, 0, 6.0, -12, -12]],
  ['lt-boiler', 'pose', [5.6, 0, 2.15, -25, -14]],
  ['lt-stairs', 'pose', [8.9, 0, 3.0, 180, 10]],
  ['lt-bed3', 'pose', [4.0, 2.95, 3.2, 103, -10]],
  ['lt-bed3-b', 'pose', [1.3, 2.95, 2.0, -145, -12]],
  ['lt-study', 'pose', [7.6, 2.95, 1.95, -49, -14]],
  ['lt-upper-bath', 'pose', [5.75, 2.95, 4.25, 160, -20]],
  ['lt-upper-hall', 'pose', [5.3, 2.95, 3.0, -90, -6]],
  ['lt-basement-stair', 'pose', [11.2, -2.53, 6.6, 95, 14]],
  ['lt-storage', 'pose', [9.9, -2.53, 6.5, -50, -12]],
  ['lt-west', 'pose', [-5.6, -0.1, 3.6, -90, 16]],
  ['lt-north', 'pose', [7.5, -0.05, -6.5, 160, 12]],
  ['lt-south', 'pose', [9.0, -0.1, 14.2, 0, 14]],
  ['lt-east', 'pose', [24.5, -0.1, 3.6, 90, 8]],
  ['lt-east-glass', 'pose', [21.2, 0, 4.6, 80, 12]],
  ['lt-aerial', 'view', [-14, 14, -12, -135, -30]],
  ['lt-aerial-se', 'view', [30, 12, 20, 55, -22]],
  ['lt-garden', 'pose', [8.8, -0.1, 9.9, -105, -6]],
  ['lt-garden-rear', 'pose', [20.3, -0.1, 9.5, -25, -4]],
  ['lt-garden-top', 'view', [8.6, 34, 6.0, 0, -89.9]],
  ['lt-paving', 'pose', [-7.8, -0.2, 19.5, 5, -24]],
  ['lt-deck', 'pose', [18.9, 0, 4.8, -90, -34]],
  ['lt-terrace', 'pose', [19.3, 0, 7.4, 20, -14]],
  // The start view with the style menu open (UI check).
  ['menu', 'menu', null],
];

// GPU=1: headed Chromium on the real GPU (much faster than SwiftShader for review shots).
const gpu = process.env.GPU === '1';
const browser = await chromium.launch(
  gpu
    ? { headless: false, args: ['--ignore-gpu-blocklist'] }
    : {
        args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
      },
);
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
  await page.waitForFunction(
    () => window.__houseSim?.isReady === true && window.__houseSim.furnished,
    null,
    {
      timeout: 120000,
    },
  );
  await page.evaluate(() => document.querySelector('.start')?.classList.add('off'));
  await page.waitForTimeout(1000);
  // Realistic look: wait for the streamed textures, sky and probes (I4).
  if (style === 'real') await page.evaluate(() => window.__houseSim.texturesReady());
  const start = await page.evaluate(() => window.__houseSim.getPlayer());
  for (const [name, kind, pose] of POSES) {
    const group = name.slice(0, 3);
    if (
      only.length &&
      !only.includes(name) &&
      !((group === 'tx-' || group === 'lt-') && only.includes(group.slice(0, 2)))
    )
      continue;
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
    const base = /^(tx|lt)-/.test(name)
      ? style === 'real'
        ? name
        : `${name}-${style}`
      : /^fu(rn)?-/.test(name)
        ? `${name}-${style}`
        : `${style}-${name}`;
    const file = path.join(outDir, `${base}${phone ? '-phone' : ''}${suffix}.png`);
    await page.screenshot({ path: file, timeout: 180000 });
    const s = await page.evaluate(() => window.__houseSim.getStats());
    console.log(
      style.padEnd(12),
      name.padEnd(14),
      `calls=${s.drawCalls} tris=${s.triangles} tex=${s.textureMB.toFixed(1)}MB lightmaps=${s.lightmapStatus}`,
    );
  }
  await context.close();
}
await browser.close();
if (problems.length) console.log('CONSOLE:\n' + [...new Set(problems)].join('\n'));
