// Dev-only: render every plan sheet (PDF) to PNG in the git-ignored .plans-cache/.
// Usage: npm run plans:render [-- <scale> [sheetId]]   e.g. `npm run plans:render -- 4 05`
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import {
  CACHE_DIR,
  findSheet,
  listSheets,
  loadPdf,
  requirePlans,
  sheetSlug,
} from './plans-common.mjs';

requirePlans();
const scale = Number(process.argv[2] ?? 4);
const only = process.argv[3];
const sheets = only ? [findSheet(only)] : listSheets();

for (const file of sheets) {
  const doc = await loadPdf(file);
  const page = await doc.getPage(1);
  const vp = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(vp.width), Math.ceil(vp.height));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise;
  const out = path.join(CACHE_DIR, `sheet-${sheetSlug(file)}@${scale}x.png`);
  fs.writeFileSync(out, await canvas.encode('png'));
  // Side-car metadata so other tools (overlay) know the page size in PDF points.
  const base = page.getViewport({ scale: 1 });
  fs.writeFileSync(
    out.replace(/\.png$/, '.json'),
    JSON.stringify({ sheet: sheetSlug(file), scale, widthPt: base.width, heightPt: base.height }),
  );
  console.log(`${path.relative(process.cwd(), out)}  ${canvas.width}x${canvas.height}`);
}
