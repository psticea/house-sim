// Dev-only: render a zoomed crop of a sheet region (in PDF points, origin top-left like
// the rendered image) to .plans-cache/crops/, to read dimensions precisely.
// Usage: npm run plans:crop -- <sheetId> <x> <y> <w> <h> [scale=8] [name]
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import { CACHE_DIR, findSheet, loadPdf, requirePlans, sheetSlug } from './plans-common.mjs';

requirePlans();
const [id, xs, ys, ws, hs, ss, name] = process.argv.slice(2);
if (!id || !hs) {
  console.error('Usage: crop-plan.mjs <sheetId> <x> <y> <w> <h> [scale] [name]');
  process.exit(1);
}
const [x, y, w, h] = [xs, ys, ws, hs].map(Number);
const scale = Number(ss ?? 8);
const file = findSheet(id);
const doc = await loadPdf(file);
const page = await doc.getPage(1);
const vp = page.getViewport({ scale, offsetX: -x * scale, offsetY: -y * scale });
const canvas = createCanvas(Math.ceil(w * scale), Math.ceil(h * scale));
const ctx = canvas.getContext('2d');
ctx.fillStyle = '#fff';
ctx.fillRect(0, 0, canvas.width, canvas.height);
await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
const out = path.join(
  CACHE_DIR,
  'crops',
  `${sheetSlug(file)}-${name ?? `${x}_${y}_${w}x${h}`}@${scale}x.png`,
);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, await canvas.encode('png'));
console.log(out, canvas.width, canvas.height);
