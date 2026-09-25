// Dev-only: screenshot overlay.html (generated plan section over the local sheet 05
// raster) into .plans-cache/ — never into the repo.
// Usage: npm run plans:overlay [-- baseUrl]   (needs `npm run dev` running)
import path from 'node:path';
import { chromium } from '@playwright/test';
import { CACHE_DIR, requirePlans } from './plans-common.mjs';

requirePlans();
const base = process.argv[2] ?? 'http://localhost:5173/';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 2200, height: 1350 } });
await page.goto(`${base}overlay.html?ppm=90`);
await page.waitForSelector('body[data-ready="1"]', { timeout: 60000 });
const out = path.join(CACHE_DIR, 'overlay-05.png');
await page.locator('#c').screenshot({ path: out });
console.log(out, await page.textContent('#status'));
await browser.close();
