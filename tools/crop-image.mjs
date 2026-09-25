// Dev-only: crop a region of a PNG in .plans-cache/ (e.g. the overlay) and upscale it.
// Usage: node tools/crop-image.mjs <file-in-.plans-cache> <x> <y> <w> <h> [scale=2] [outName]
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { CACHE_DIR } from './plans-common.mjs';

const [file, xs, ys, ws, hs, ss, outName] = process.argv.slice(2);
if (!file || !hs) {
  console.error('Usage: crop-image.mjs <file> <x> <y> <w> <h> [scale] [outName]');
  process.exit(1);
}
const [x, y, w, h] = [xs, ys, ws, hs].map(Number);
const scale = Number(ss ?? 2);
const img = await loadImage(fs.readFileSync(path.join(CACHE_DIR, file)));
const canvas = createCanvas(Math.round(w * scale), Math.round(h * scale));
const ctx = canvas.getContext('2d');
ctx.drawImage(img, x, y, w, h, 0, 0, w * scale, h * scale);
const out = path.join(CACHE_DIR, 'crops', outName ?? `${path.parse(file).name}-${x}_${y}.png`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, await canvas.encode('png'));
console.log(out);
