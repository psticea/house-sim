// Dev-only lightmap bake (plan.md §4.1, I6): `npm run bake` [-- --quick] [-- --rdo]
// Starts the Vite dev server, opens bake.html in *headed* Chromium on the real GPU (the
// page refuses SwiftShader), waits for the GPU bake, pulls the RGBM atlases + uv2, encodes
// KTX2 (UASTC + Zstandard, linear, no mips) and writes public/assets/baked/:
//   manifest.json, uv2.bin, lm<k>-2k.ktx2 (medium / high tier), lm<k>-1k.ktx2 (low tier).
// Debug previews (tone-mapped atlases) go to test-results/bake/ (git-ignored).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createCanvas } from '@napi-rs/canvas';
import { encodeToKTX2 } from 'ktx2-encoder';
import { createServer } from 'vite';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'public', 'assets', 'baked');
const DEBUG = path.join(ROOT, 'test-results', 'bake');
const quick = process.argv.includes('--quick');
const rdo = process.argv.includes('--rdo');
const t0 = Date.now();
const secs = () => ((Date.now() - t0) / 1000).toFixed(0);

const server = await createServer({
  root: ROOT,
  logLevel: 'error',
  // No HMR / file watching: editing sources during a bake must not reload the page.
  server: { port: 5199, strictPort: false, hmr: false, watch: null },
});
await server.listen();
const url = server.resolvedUrls?.local?.[0] ?? 'http://localhost:5199/';
console.log(`[${secs()} s] dev server ${url}`);

const browser = await chromium.launch({
  headless: false,
  args: ['--ignore-gpu-blocklist', '--disable-gpu-watchdog'],
});
let meta;
let buffers = {};
try {
  const page = await browser.newPage({ viewport: { width: 720, height: 420 } });
  page.on('console', (m) => {
    if (m.type() === 'error') console.log(`  page error: ${m.text()}`);
    else if (m.text().startsWith('[bake]')) console.log(`  ${m.text()}`);
  });
  page.on('pageerror', (e) => console.log(`  pageerror: ${e.message}`));
  const query = [
    quick && 'quick',
    process.argv.includes('--debug') && 'debug',
    process.argv.includes('--bench') && 'bench',
    ...process.argv.filter((a) => a.startsWith('--q=')).map((a) => a.slice(4)),
  ].filter(Boolean);
  await page.goto(`${url}bake.html${query.length ? `?${query.join('&')}` : ''}`);
  let lastLabel = '';
  for (;;) {
    const s = await page.evaluate(() => {
      const b = window.__bake;
      return b ? { done: b.done, error: b.error, label: b.label, progress: b.progress } : null;
    });
    if (s?.error) throw new Error(`bake failed: ${s.error}`);
    if (s?.done) break;
    if (s && s.label !== lastLabel) {
      lastLabel = s.label;
      console.log(`[${secs()} s] ${s.label} (${(s.progress * 100).toFixed(0)} %)`);
    }
    await page.waitForTimeout(2000);
  }
  meta = await page.evaluate(() => window.__bake.meta);
  const names = await page.evaluate(() => Object.keys(window.__bake.buffers));
  for (const name of names) {
    const len = await page.evaluate((n) => window.__bake.buffers[n].length, name);
    const parts = [];
    const CHUNK = 4 << 20;
    for (let start = 0; start < len; start += CHUNK) {
      const b64 = await page.evaluate(
        ([n, s, l]) => {
          const a = window.__bake.buffers[n].subarray(s, s + l);
          let bin = '';
          for (let i = 0; i < a.length; i += 0x8000) {
            bin += String.fromCharCode(...a.subarray(i, i + 0x8000));
          }
          return btoa(bin);
        },
        [name, start, CHUNK],
      );
      parts.push(Buffer.from(b64, 'base64'));
    }
    buffers[name] = Buffer.concat(parts);
  }
} finally {
  await browser.close();
  await server.close();
}
console.log(`[${secs()} s] bake done on "${meta.bake.gpu}", encoding KTX2…`);
if (process.argv.includes('--bench')) process.exit(0);

async function encode(rgba, size) {
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  try {
    return await encodeToKTX2(new Uint8Array(1), {
      imageDecoder: async () => ({ width: size, height: size, data: new Uint8Array(rgba) }),
      isUASTC: true,
      isPerceptual: false,
      isSetKTX2SRGBTransferFunc: false,
      needSupercompression: true,
      generateMipmap: false,
      isYFlip: false,
      enableRDO: rdo,
      rdoQualityLevel: 1,
      uastcLDRQualityLevel: 2,
    });
  } finally {
    process.stdout.write = write;
  }
}

function preview(rgba, size, file) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  const img = ctx.createImageData(size, size);
  const range = meta.range;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const o = ((size - 1 - y) * size + x) * 4;
      const m = (rgba[i + 3] / 255) * range;
      for (let c = 0; c < 3; c++) {
        const e = (rgba[i + c] / 255) ** 2 * m * 0.45;
        img.data[o + c] = Math.round(255 * Math.min(1, e / (1 + e)) ** (1 / 2.2) * 1.4);
      }
      img.data[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  fs.writeFileSync(file, canvas.toBuffer('image/png'));
}

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(DEBUG, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.rmSync(path.join(OUT, f));
const size = meta.bake.atlasSize;
const atlases = [];
for (const a of meta.atlases) {
  const k = a.index;
  const files = { hi: `lm${k}-2k.ktx2`, lo: `lm${k}-1k.ktx2` };
  const bytes = {};
  for (const [key, res] of [
    ['hi', size],
    ['lo', size / 2],
  ]) {
    const data = await encode(buffers[`lm${k}-${key === 'hi' ? '2k' : '1k'}`], res);
    fs.writeFileSync(path.join(OUT, files[key]), data);
    bytes[files[key]] = data.length;
    console.log(`[${secs()} s] ${files[key]}: ${(data.length / 1048576).toFixed(2)} MB`);
  }
  preview(buffers[`lm${k}-2k`], size, path.join(DEBUG, `atlas-${k}.png`));
  atlases.push({ size, files: { low: files.lo, medium: files.hi, high: files.hi }, bytes });
}
fs.writeFileSync(path.join(OUT, 'uv2.bin'), buffers.uv2);
const manifest = {
  ...meta,
  atlases,
  uv2: { file: 'uv2.bin', bytes: buffers.uv2.length },
  generated: 'tools/bake.mjs',
};
manifest.bake.totalSeconds = Number(secs());
fs.writeFileSync(path.join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
const total = fs.readdirSync(OUT).reduce((s, f) => s + fs.statSync(path.join(OUT, f)).size, 0);
console.log(`[${secs()} s] wrote ${OUT} (${(total / 1048576).toFixed(2)} MB)`);
