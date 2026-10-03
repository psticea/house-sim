// Dev-only: measures the frame-to-frame brightness of the realistic look while walking
// across room boundaries in real time (headed Chromium on the real GPU by default), to catch
// flashes of glass / reflective surfaces when the light balance changes between rooms.
// Every rendered frame is read back (luma of the whole frame, of glass / mirror pixels and of
// the other reflective finishes, via the `debugMask` hook) together with the look state
// (exposure, environment map, adaptation). Around each room change, frame strips are saved.
// Metrics per crossing: max frame-to-frame change of the mean luma (0–255) of the frame /
// glass / reflective pixels, and the same-pixel version (signed mean change over pixels of
// that class in both frames — less sensitive to glass entering / leaving the view).
// Camera motion alone gives a few units (more where glass enters / leaves the view; compare
// with `sketchup`, which has no exposure or reflection changes); a flash shows as a jump of
// tens of units that comes back within a few frames — check the strips.
// Output: test-results/flicker/<label>-<segment>-<k>.png strips + <label>.json (git-ignored).
// Usage: node tools/flicker-check.mjs [baseUrl] [label] [segments] [style]   (QUALITY=medium)
//   e.g. npm run flicker -- http://localhost:5173/ after
//        node tools/flicker-check.mjs http://localhost:5173/ before front-door,ground-rooms
//        SWIFTSHADER=1 node tools/flicker-check.mjs …   (CPU rendering, slow)
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

const base = process.argv[2] || 'http://localhost:5173/';
const label = process.argv[3] || 'run';
const only = (process.argv[4] || '').split(',').filter(Boolean);
const style = process.argv[5] || 'real';
const quality = process.env.QUALITY || 'medium';
const outDir = path.resolve('test-results', 'flicker');
fs.mkdirSync(outDir, { recursive: true });

// Walks: [name, start [x, y, z], waypoints [x, z][]] (routes of tests/e2e/walk.spec.ts).
const SEGMENTS = [
  [
    'front-door',
    [5.0, -0.05, -0.9],
    [
      [8.775, -0.9],
      [8.775, 1.6],
    ],
  ],
  [
    'hall-living',
    [8.775, 0, 1.6],
    [
      [8.9, 3.05],
      [11.0, 3.05],
      [12.5, 3.1],
    ],
  ],
  [
    'living-terrace',
    [12.5, 0, 3.1],
    [
      [15.5, 3.2],
      [16.0, 3.2],
      [16.0, 1.75],
      [17.6, 1.75],
      [19.1, 2.37],
    ],
  ],
  [
    'terrace-garden-living',
    [19.1, 0, 2.37],
    [
      [19.1, 8.3],
      [12.9, 8.3],
      [12.9, 6.5],
    ],
  ],
  [
    'stairs-up',
    [8.9, 0, 3.05],
    [
      [8.9, 3.3],
      [8.9, 5.6],
      [8.9, 6.55],
      [7.8, 6.55],
      [7.8, 4.2],
      [7.8, 3.3],
    ],
  ],
  [
    'upper-rooms',
    [7.8, 2.95, 3.3],
    [
      [5.2, 3.0],
      [3.8, 3.0],
      [2.5, 3.0],
      [5.2, 3.0],
      [5.6, 3.1],
      [5.75, 4.4],
      [5.6, 3.1],
      [5.775, 3.0],
      [5.775, 1.5],
      [5.775, 3.0],
      [7.8, 3.3],
    ],
  ],
  [
    'stairs-down',
    [7.8, 2.95, 3.3],
    [
      [7.8, 4.2],
      [7.8, 6.55],
      [8.9, 6.55],
      [8.9, 3.0],
    ],
  ],
  [
    'ground-rooms',
    [8.4, 0, 3.0],
    [
      [5.86, 3.1],
      [5.86, 4.4],
      [5.75, 5.7],
      [5.86, 4.4],
      [5.86, 3.1],
      [5.76, 3.0],
      [5.76, 1.4],
      [5.76, 3.0],
      [3.7, 3.05],
      [2.2, 3.05],
      [3.7, 3.05],
      [4.1, 3.2],
      [4.1, 4.8],
      [4.1, 3.2],
      [7.7, 3.3],
    ],
  ],
  [
    'basement',
    [7.7, 0, 3.3],
    [
      [7.7, 4.0],
      [7.7, 5.5],
      [7.82, 6.13],
      [7.97, 6.48],
      [8.32, 6.63],
      [9.6, 6.65],
      [11.0, 5.0],
      [9.6, 6.65],
      [8.32, 6.63],
      [7.97, 6.48],
      [7.82, 6.13],
      [7.7, 4.3],
      [7.7, 3.3],
    ],
  ],
  [
    'hall-out',
    [7.7, 0, 3.3],
    [
      [8.775, 1.6],
      [8.775, -0.9],
      [5.0, -0.9],
    ],
  ],
];

const swift = process.env.SWIFTSHADER === '1';
const browser = await chromium.launch(
  swift
    ? { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] }
    : { headless: false, args: ['--ignore-gpu-blocklist'] },
);
const context = await browser.newContext({
  viewport: { width: 960, height: 540 },
  deviceScaleFactor: 1,
});
const page = await context.newPage();
const problems = [];
page.on('console', (m) => {
  if (['error', 'warning'].includes(m.type()) && !/GL Driver|GPU stall|\[\.WebGL-/.test(m.text()))
    problems.push(`${m.type()} ${m.text()}`);
});
page.on('pageerror', (e) => problems.push(`pageerror ${e.message}`));

// In-page capture: grab the app's WebGL context and read back every frame right after the
// app's requestAnimationFrame callback (the drawing buffer is still valid then).
await page.addInitScript(() => {
  const getContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const ctx = getContext.call(this, type, ...rest);
    if (type === 'webgl2' && ctx) this.__gl = ctx;
    return ctx;
  };
  const GW = 192;
  const GH = 108;
  const BEFORE = 20;
  const AFTER = 30;
  const fc = {
    on: false,
    segment: '',
    frame: 0,
    frames: [],
    thumbs: new Map(),
    events: [],
    buf: null,
    lastKey: '',
    prevLum: null,
    prevMask: null,
  };
  window.__fc = fc;
  const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const pct = (arr, q) => {
    if (!arr.length) return 0;
    const s = Float32Array.from(arr).sort();
    return s[Math.min(s.length - 1, Math.floor(q * s.length))];
  };
  const after = () => {
    if (!fc.on || !window.__houseSim) return;
    const canvas = document.querySelector('canvas.view');
    const gl = canvas?.__gl;
    if (!gl) return;
    const W = gl.drawingBufferWidth;
    const H = gl.drawingBufferHeight;
    if (!fc.buf || fc.buf.length !== W * H * 4) fc.buf = new Uint8Array(W * H * 4);
    gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, fc.buf);
    const h = window.__houseSim;
    const look = h.lookState();
    const p = h.getPlayer();
    const mask = h.debugMask(GW, GH);
    const thumb = new Uint8ClampedArray(GW * GH * 4);
    const all = [];
    const glass = [];
    const refl = [];
    let white = 0;
    for (let gy = 0; gy < GH; gy++) {
      const sy = Math.min(H - 1, Math.floor(((gy + 0.5) * H) / GH));
      for (let gx = 0; gx < GW; gx++) {
        const sx = Math.min(W - 1, Math.floor(((gx + 0.5) * W) / GW));
        const o = (sy * W + sx) * 4;
        const r = fc.buf[o];
        const g = fc.buf[o + 1];
        const b = fc.buf[o + 2];
        const l = luma(r, g, b);
        all.push(l);
        const c = mask[gy * GW + gx];
        if (c === 2) glass.push(l);
        if (c >= 1) {
          refl.push(l);
          if (l > 235) white++;
        }
        const t = ((GH - 1 - gy) * GW + gx) * 4;
        thumb[t] = r;
        thumb[t + 1] = g;
        thumb[t + 2] = b;
        thumb[t + 3] = 255;
      }
    }
    // Same-pixel change since the last frame: signed mean over pixels of the class in both.
    const lum = Float32Array.from(all);
    const same = (test) => {
      if (!fc.prevLum) return { d: 0, n: 0 };
      let s = 0;
      let n = 0;
      for (let q = 0; q < lum.length; q++) {
        if (!test(mask[q]) || !test(fc.prevMask[q])) continue;
        s += lum[q] - fc.prevLum[q];
        n++;
      }
      return { d: n ? s / n : 0, n };
    };
    const sGlass = same((c) => c === 2);
    const sRefl = same((c) => c >= 1);
    const sAll = same(() => true);
    fc.prevLum = lum;
    fc.prevMask = mask;
    const mean = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);
    const i = fc.frame++;
    const key = `${p.room}|${p.place}`;
    if (fc.lastKey && key !== fc.lastKey) fc.events.push({ frame: i, from: fc.lastKey, to: key });
    fc.lastKey = key;
    fc.frames.push({
      i,
      t: performance.now(),
      segment: fc.segment,
      x: p.x,
      y: p.y,
      z: p.z,
      room: p.room,
      place: p.place,
      lightRoom: look.room,
      exposure: look.exposure,
      env: look.env,
      envIntensity: look.envIntensity,
      adapt: look.adapt,
      programs: look.programs,
      mean: mean(all),
      p99: pct(all, 0.99),
      glassN: glass.length,
      glassMean: mean(glass),
      glassP99: pct(glass, 0.99),
      reflN: refl.length,
      reflMean: mean(refl),
      reflP99: pct(refl, 0.99),
      reflWhite: refl.length ? white / refl.length : 0,
      sGlass: sGlass.n >= 40 ? sGlass.d : 0,
      sRefl: sRefl.n >= 40 ? sRefl.d : 0,
      sAll: sAll.d,
    });
    fc.thumbs.set(i, thumb);
    // Keep thumbnails only within [event − BEFORE, event + AFTER].
    const j = i - BEFORE - 1;
    if (j >= 0 && fc.thumbs.has(j)) {
      const keep = fc.events.some((e) => j >= e.frame - BEFORE && j <= e.frame + AFTER);
      if (!keep) fc.thumbs.delete(j);
    }
  };
  const raf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb) =>
    raf((t) => {
      cb(t);
      try {
        after();
      } catch (e) {
        console.error('flicker capture', e);
        fc.on = false;
      }
    });
  // Frame strip of [from, to]: 17 thumbnails per row, frame index + luma under each.
  window.__fcStrip = (from, to, eventFrame) => {
    const cols = 17;
    const n = to - from + 1;
    const rows = Math.ceil(n / cols);
    const cw = GW;
    const ch = GH + 14;
    const c = document.createElement('canvas');
    c.width = cols * cw;
    c.height = rows * ch;
    const x2 = c.getContext('2d');
    x2.fillStyle = '#000';
    x2.fillRect(0, 0, c.width, c.height);
    x2.font = '10px monospace';
    for (let k = 0; k < n; k++) {
      const f = from + k;
      const th = fc.thumbs.get(f);
      const fr = fc.frames[f];
      const cx = (k % cols) * cw;
      const cy = Math.floor(k / cols) * ch;
      if (th) x2.putImageData(new ImageData(th, GW, GH), cx, cy);
      if (f === eventFrame) {
        x2.strokeStyle = '#f0f';
        x2.lineWidth = 2;
        x2.strokeRect(cx + 1, cy + 1, cw - 2, GH - 2);
      }
      if (fr) {
        x2.fillStyle = fr.env.startsWith('probe') ? '#8f8' : fr.env === 'sky' ? '#8cf' : '#fc8';
        x2.fillText(
          `${f} L${fr.mean.toFixed(0)} G${fr.glassN > 30 ? fr.glassMean.toFixed(0) : '-'} R${fr.reflMean.toFixed(0)} ${fr.env.replace('probe:', 'p:').slice(0, 9)}`,
          cx + 2,
          cy + GH + 11,
        );
      }
    }
    return c.toDataURL('image/png');
  };
});

const url = `${base}?style=${style}&quality=${quality}`;
console.log('open', url);
await page.goto(url);
await page.waitForFunction(
  () => window.__houseSim?.isReady === true && window.__houseSim.furnished,
  null,
  { timeout: 180000 },
);
await page.evaluate(() => document.querySelector('.start')?.classList.add('off'));
if (style === 'real') await page.evaluate(() => window.__houseSim.texturesReady());
const stats0 = await page.evaluate(() => window.__houseSim.getStats());
console.log(
  `quality=${stats0.quality} lightmaps=${stats0.lightmapStatus} probes=${stats0.probes} calls=${stats0.drawCalls} tex=${stats0.textureMB.toFixed(1)}MB`,
);

const report = { label, style, quality: stats0.quality, segments: [] };
for (const [name, startPos, points] of SEGMENTS) {
  if (only.length && !only.includes(name)) continue;
  const res = await page.evaluate(
    async ([nm, s, pts]) => {
      const h = window.__houseSim;
      const fc = window.__fc;
      const first = pts[0];
      const yaw0 = (Math.atan2(-(first[0] - s[0]), -(first[1] - s[2])) * 180) / Math.PI;
      await h.teleport(s[0], s[1], s[2], yaw0, -6);
      for (let k = 0; k < 90; k++) await h.nextFrame();
      fc.frames.length = 0;
      fc.thumbs.clear();
      fc.events.length = 0;
      fc.frame = 0;
      fc.lastKey = '';
      fc.prevLum = null;
      fc.segment = nm;
      fc.on = true;
      const key = (type) => window.dispatchEvent(new KeyboardEvent(type, { code: 'KeyW' }));
      let yaw = yaw0;
      const stuck = [];
      for (const [tx, tz] of pts) {
        const t0 = performance.now();
        for (;;) {
          const p = h.getPlayer();
          const dx = tx - p.x;
          const dz = tz - p.z;
          if (Math.hypot(dx, dz) < 0.25) break;
          if (performance.now() - t0 > 20000) {
            stuck.push([tx, tz, p.x, p.z]);
            break;
          }
          const want = (Math.atan2(-dx, -dz) * 180) / Math.PI;
          let err = ((want - yaw + 540) % 360) - 180;
          // Turn on the spot (≤ 2.5° a frame) when off course, else walk.
          if (Math.abs(err) > 12) {
            key('keyup');
            yaw += Math.sign(err) * Math.min(2.5, Math.abs(err));
          } else {
            yaw += err * 0.3;
            key('keydown');
          }
          await h.look(yaw, -6);
        }
      }
      key('keyup');
      for (let k = 0; k < 60; k++) await h.nextFrame();
      fc.on = false;
      return { frames: fc.frames, events: fc.events, stuck };
    },
    [name, startPos, points],
  );
  // Windows around events (merged when they overlap) → strips.
  const windows = [];
  for (const e of res.events) {
    const from = Math.max(0, e.frame - 20);
    const to = Math.min(res.frames.length - 1, e.frame + 30);
    const last = windows[windows.length - 1];
    if (last && from <= last.to) {
      last.to = Math.max(last.to, to);
      last.events.push(e);
    } else windows.push({ from, to, events: [e] });
  }
  const seg = { name, frames: res.frames.length, stuck: res.stuck, windows: [] };
  let k = 0;
  for (const w of windows) {
    const fr = res.frames.slice(w.from, w.to + 1);
    const maxDelta = (field, minN) => {
      let best = 0;
      for (let q = 1; q < fr.length; q++) {
        if (minN && (fr[q][minN] < 40 || fr[q - 1][minN] < 40)) continue;
        best = Math.max(best, Math.abs(fr[q][field] - fr[q - 1][field]));
      }
      return best;
    };
    const rooms = [fr[0].room, ...w.events.map((e) => e.to.split('|')[0])];
    const path_ = rooms.filter((r, q) => q === 0 || r !== rooms[q - 1]).join('>');
    const envs = [...new Set(fr.map((f) => f.env))];
    const entry = {
      k,
      path: path_,
      from: w.from,
      to: w.to,
      dFrame: maxDelta('mean'),
      dFrameP99: maxDelta('p99'),
      dGlass: maxDelta('glassMean', 'glassN'),
      dRefl: maxDelta('reflMean', 'reflN'),
      sFrame: Math.max(...fr.slice(1).map((f) => Math.abs(f.sAll))),
      sGlass: Math.max(...fr.slice(1).map((f) => Math.abs(f.sGlass))),
      sRefl: Math.max(...fr.slice(1).map((f) => Math.abs(f.sRefl))),
      maxReflWhite: Math.max(...fr.map((f) => f.reflWhite)),
      exposure: [Math.min(...fr.map((f) => f.exposure)), Math.max(...fr.map((f) => f.exposure))],
      programs: [fr[0].programs, fr[fr.length - 1].programs],
      envs,
      lightRooms: [...new Set(fr.map((f) => f.lightRoom))],
    };
    const png = await page.evaluate(
      ([a, b, ev]) => window.__fcStrip(a, b, ev),
      [w.from, w.to, w.events[0].frame],
    );
    const file = path.join(outDir, `${label}-${name}-${k}.png`);
    fs.writeFileSync(file, Buffer.from(png.split(',')[1], 'base64'));
    entry.strip = path.relative(process.cwd(), file);
    seg.windows.push(entry);
    console.log(
      `${name.padEnd(22)} #${k} ${path_.padEnd(44)} dFrame=${entry.dFrame.toFixed(1).padStart(5)} dGlass=${entry.dGlass.toFixed(1).padStart(5)} dRefl=${entry.dRefl.toFixed(1).padStart(5)} | same-px dFrame=${entry.sFrame.toFixed(1).padStart(5)} dGlass=${entry.sGlass.toFixed(1).padStart(5)} dRefl=${entry.sRefl.toFixed(1).padStart(5)} | white=${(entry.maxReflWhite * 100).toFixed(0).padStart(3)}% exp=${entry.exposure.map((v) => v.toFixed(2)).join('..')} env=${envs.join(',')} progs=${entry.programs.join('>')}`,
    );
    k++;
  }
  if (res.stuck.length) console.log(`${name}: stuck at`, JSON.stringify(res.stuck));
  seg.series = res.frames.map((f) => ({
    i: f.i,
    room: f.room,
    light: f.lightRoom,
    env: f.env,
    exp: +f.exposure.toFixed(3),
    envI: +f.envIntensity.toFixed(3),
    a: +f.adapt.toFixed(3),
    L: +f.mean.toFixed(1),
    G: f.glassN > 40 ? +f.glassMean.toFixed(1) : null,
    R: f.reflN > 40 ? +f.reflMean.toFixed(1) : null,
    W: +f.reflWhite.toFixed(3),
    sG: +f.sGlass.toFixed(1),
    sR: +f.sRefl.toFixed(1),
    sL: +f.sAll.toFixed(1),
    pr: f.programs,
  }));
  report.segments.push(seg);
}
const all = report.segments.flatMap((s) => s.windows);
const worst = (f) => Math.max(0, ...all.map((w) => w[f]));
report.summary = {
  windows: all.length,
  dFrame: worst('dFrame'),
  dGlass: worst('dGlass'),
  dRefl: worst('dRefl'),
  sFrame: worst('sFrame'),
  sGlass: worst('sGlass'),
  sRefl: worst('sRefl'),
  maxReflWhite: worst('maxReflWhite'),
};
console.log('SUMMARY', JSON.stringify(report.summary));
fs.writeFileSync(path.join(outDir, `${label}.json`), JSON.stringify(report, null, 1));
await context.close();
await browser.close();
if (problems.length) console.log('CONSOLE:\n' + [...new Set(problems)].join('\n'));
