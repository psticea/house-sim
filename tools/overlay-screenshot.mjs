// Dev-only: screenshot overlay.html (generated model over the local plan rasters) into
// .plans-cache/overlay-<sheet>.png — never into the repo.
// Usage: npm run plans:overlay [-- baseUrl] [sheets]   (needs `npm run dev` running)
//   sheets: comma list of 04,05,06,07,08e,08w,09,10 (default: all)
import path from 'node:path';
import { chromium } from '@playwright/test';
import { CACHE_DIR, requirePlans } from './plans-common.mjs';

requirePlans();
const base = process.argv[2] ?? 'http://localhost:5173/';
const sheets = (process.argv[3] ?? '04,05,06,07,08e,08w,09,10').split(',').filter(Boolean);
const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 2200, height: 1350 } });
for (const sheet of sheets) {
  await page.goto(`${base}overlay.html?sheet=${sheet}&ppm=90`);
  await page.waitForSelector('body[data-ready="1"]', { timeout: 120000 });
  const out = path.join(CACHE_DIR, `overlay-${sheet}.png`);
  await page.locator('#c').screenshot({ path: out });
  console.log(out, await page.textContent('#status'));
}
await browser.close();
