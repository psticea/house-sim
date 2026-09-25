// Dev only: builds the runtime textures of the realistic look from the CC0 originals in
// assets-src/ (see tools/fetch-assets.mjs) into public/assets/ (committed):
//   textures/<set>/<map>-<size>.ktx2   KTX2 / Basis Universal, one file per size used
//                                      by any quality tier (albedo + ORM: ETC1S,
//                                      normals: UASTC + RDO + Zstandard)
//   textures/manifest.json             sizes per tier, tile sizes, file sizes
//   sky/sky-bg.ktx2                    2K sky background (UASTC, no mips)
//   sky/sky-env.jpg                    1K clamped sky for the PMREM environment
// Albedos are normalised to the plan.md §6.1 palette (mean colour → `tint`).
// Usage: node tools/optimize-assets.mjs [setId,...]   (default: everything)
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { encodeToKTX2 } from 'ktx2-encoder';
import { GENERATED, HDRI, SETS, TIER_SIZES } from './assets.config.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = path.join(ROOT, 'assets-src');
const OUT = path.join(ROOT, 'public', 'assets');
const TEX = path.join(OUT, 'textures');
const only = (process.argv[2] ?? '').split(',').filter(Boolean);
const TIERS = ['low', 'medium', 'high'];

// ---------------------------------------------------------------- image helpers
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toSrgb = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const LUT = Float32Array.from({ length: 256 }, (_, i) => toLin(i / 255));

/** RGBA image { width, height, data: Uint8ClampedArray }. */
async function readImage(file) {
  const img = await loadImage(fs.readFileSync(file));
  const c = createCanvas(img.width, img.height);
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, img.width, img.height);
  return { width: img.width, height: img.height, data: d.data };
}

function toCanvas(im) {
  const c = createCanvas(im.width, im.height);
  const g = c.getContext('2d');
  const d = g.createImageData(im.width, im.height);
  d.data.set(im.data);
  g.putImageData(d, 0, 0);
  return c;
}

/** Tile-aware resize: wraps a margin around the source so edges filter seamlessly. */
function resize(im, size) {
  if (im.width === size && im.height === size) return im;
  const m = Math.ceil(im.width / 32);
  const src = toCanvas(im);
  const w = im.width + 2 * m;
  const pad = createCanvas(w, w);
  const pg = pad.getContext('2d');
  for (const dx of [-1, 0, 1])
    for (const dy of [-1, 0, 1]) pg.drawImage(src, m + dx * im.width, m + dy * im.height);
  // Halve in steps (box-like) for clean minification, then the final scale.
  let cur = pad;
  let cw = w;
  const target = (w * size) / im.width;
  while (cw / 2 >= target) {
    const n = createCanvas(Math.round(cw / 2), Math.round(cw / 2));
    const ng = n.getContext('2d');
    ng.imageSmoothingQuality = 'high';
    ng.drawImage(cur, 0, 0, n.width, n.height);
    cur = n;
    cw = n.width;
  }
  const fin = createCanvas(Math.round(target), Math.round(target));
  const fg = fin.getContext('2d');
  fg.imageSmoothingQuality = 'high';
  fg.drawImage(cur, 0, 0, fin.width, fin.height);
  const off = Math.round((m * size) / im.width);
  const d = fg.getImageData(off, off, size, size);
  return { width: size, height: size, data: d.data };
}

/** Mean colour → `tint` (linear light), hue variation scaled by `sat`. */
function tintAlbedo(im, hex, sat = 1) {
  const t = [1, 3, 5].map((i) => toLin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const d = im.data;
  const mean = [0, 0, 0];
  const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) {
    mean[0] += LUT[d[i]];
    mean[1] += LUT[d[i + 1]];
    mean[2] += LUT[d[i + 2]];
  }
  for (let k = 0; k < 3; k++) mean[k] /= n;
  const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  const ml = lum(...mean);
  const out = new Uint8ClampedArray(d.length);
  for (let i = 0; i < d.length; i += 4) {
    const r = LUT[d[i]];
    const g = LUT[d[i + 1]];
    const b = LUT[d[i + 2]];
    const l = lum(r, g, b) / ml;
    const px = [r / mean[0], g / mean[1], b / mean[2]];
    for (let k = 0; k < 3; k++) {
      const v = t[k] * (l + (px[k] - l) * sat);
      out[i + k] = Math.round(toSrgb(Math.min(1, Math.max(0, v))) * 255);
    }
    out[i + 3] = 255;
  }
  return { width: im.width, height: im.height, data: out };
}

/** Re-normalises a (resized) tangent-space normal map. */
function renormalise(im) {
  const d = im.data;
  for (let i = 0; i < d.length; i += 4) {
    let x = d[i] / 127.5 - 1;
    let y = d[i + 1] / 127.5 - 1;
    let z = Math.max(0, d[i + 2] / 127.5 - 1);
    const l = Math.hypot(x, y, z) || 1;
    x /= l;
    y /= l;
    z /= l;
    d[i] = Math.round((x + 1) * 127.5);
    d[i + 1] = Math.round((y + 1) * 127.5);
    d[i + 2] = Math.round((z + 1) * 127.5);
    d[i + 3] = 255;
  }
  return im;
}

/** Normal map (OpenGL, +Y up) from a periodic height field h[y][x] (metres per px `k`). */
function normalFromHeight(h, size, strength) {
  const d = new Uint8ClampedArray(size * size * 4);
  const at = (x, y) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
      // Image rows go down, +Y (green) points up the image.
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      d[i] = Math.round((-dx / l + 1) * 127.5);
      d[i + 1] = Math.round((-dy / l + 1) * 127.5);
      d[i + 2] = Math.round((1 / l + 1) * 127.5);
      d[i + 3] = 255;
    }
  return { width: size, height: size, data: d };
}

/** Periodic value noise (0…1) with `cells` lattice cells per tile. */
function periodicNoise(size, cells, seed) {
  const rnd = (i, j) => {
    let s =
      (((i % cells) + cells) % cells) * 374761393 + (((j % cells) + cells) % cells) * 668265263;
    s = (s ^ (seed * 2246822519)) >>> 0;
    s = Math.imul(s ^ (s >>> 13), 1274126177) >>> 0;
    return ((s ^ (s >>> 16)) >>> 0) / 4294967295;
  };
  const f = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const u = (x / size) * cells;
      const v = (y / size) * cells;
      const i = Math.floor(u);
      const j = Math.floor(v);
      const fu = u - i;
      const fv = v - j;
      const su = fu * fu * (3 - 2 * fu);
      const sv = fv * fv * (3 - 2 * fv);
      const a = rnd(i, j) + (rnd(i + 1, j) - rnd(i, j)) * su;
      const b = rnd(i, j + 1) + (rnd(i + 1, j + 1) - rnd(i, j + 1)) * su;
      f[y * size + x] = a + (b - a) * sv;
    }
  return f;
}

function fbm(size, octaves, base, seed) {
  const out = new Float32Array(size * size);
  let amp = 1;
  let cells = base;
  for (let o = 0; o < octaves; o++) {
    const n = periodicNoise(size, cells, seed + o);
    for (let i = 0; i < out.length; i++) out[i] += n[i] * amp;
    amp *= 0.5;
    cells *= 2;
  }
  return out;
}

// ---------------------------------------------------------------- KTX2 encoding
async function encode(im, file, mode) {
  const raw = async () => ({ width: im.width, height: im.height, data: new Uint8Array(im.data) });
  const common = { imageDecoder: raw, isYFlip: true, generateMipmap: mode !== 'bg' };
  const opts =
    mode === 'bg'
      ? {
          ...common,
          isUASTC: true,
          isSetKTX2SRGBTransferFunc: true,
          needSupercompression: true,
          enableRDO: true,
          rdoQualityLevel: 3,
          uastcLDRQualityLevel: 1,
        }
      : mode === 'normal'
        ? {
            ...common,
            isUASTC: true,
            isNormalMap: true,
            isPerceptual: false,
            isSetKTX2SRGBTransferFunc: false,
            needSupercompression: true,
            enableRDO: true,
            rdoQualityLevel: 3,
            uastcLDRQualityLevel: 1,
          }
        : mode === 'albedo'
          ? {
              ...common,
              isUASTC: false,
              isSetKTX2SRGBTransferFunc: true,
              qualityLevel: 255,
              compressionLevel: 2,
            }
          : {
              ...common,
              isUASTC: false,
              isPerceptual: false,
              isSetKTX2SRGBTransferFunc: false,
              qualityLevel: 180,
              compressionLevel: 2,
            };
  // The WASM encoder prints its progress to stdout; keep the tool's output readable.
  const write = process.stdout.write.bind(process.stdout);
  process.stdout.write = () => true;
  let data;
  try {
    data = await encodeToKTX2(new Uint8Array(1), opts);
  } finally {
    process.stdout.write = write;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return data.length;
}

// ---------------------------------------------------------------- sets
const manifest = fs.existsSync(path.join(TEX, 'manifest.json'))
  ? JSON.parse(fs.readFileSync(path.join(TEX, 'manifest.json'), 'utf8'))
  : { sets: {} };

async function writeMaps(id, kind, sizeM, sources, set = {}) {
  const sizes = structuredClone(TIER_SIZES[kind]);
  if (set.albedoHigh && sizes.albedo) sizes.albedo.high = set.albedoHigh;
  if (set.normalMax && sizes.normal)
    for (const t of TIERS) sizes.normal[t] = Math.min(sizes.normal[t], set.normalMax);
  const entry = { kind, sizeM, maps: {}, bytes: {} };
  for (const [map, tiers] of Object.entries(sizes)) {
    const src = sources[map];
    if (!src) continue;
    entry.maps[map] = {};
    for (const size of [...new Set(TIERS.map((t) => tiers[t]))]) {
      const rel = `${id}/${map}-${size}.ktx2`;
      const out = path.join(TEX, rel);
      // REUSE=1: keep already encoded files (config-only changes, e.g. tier sizes).
      if (process.env.REUSE && fs.existsSync(out)) {
        entry.bytes[rel] = fs.statSync(out).size;
        continue;
      }
      let im = resize(src, size);
      if (map === 'normal') im = renormalise(im);
      const mode = map;
      const t0 = Date.now();
      const bytes = await encode(im, out, mode);
      entry.bytes[rel] = bytes;
      console.log(
        `  ${rel.padEnd(28)} ${mode.padEnd(13)} ${(bytes / 1024).toFixed(0).padStart(6)} KB  ${((Date.now() - t0) / 1000).toFixed(1)} s`,
      );
    }
    for (const t of TIERS) entry.maps[map][t] = `${id}/${map}-${tiers[t]}.ktx2`;
  }
  manifest.sets[id] = entry;
}

async function sourceSet(set) {
  const dir = path.join(SRC, set.ph ?? set.acg);
  const f = set.ph
    ? { albedo: 'albedo.jpg', normal: 'normal.png', orm: 'arm.jpg' }
    : {
        albedo: `${set.acg}_2K-JPG_Color.jpg`,
        normal: `${set.acg}_2K-JPG_NormalGL.jpg`,
        ao: `${set.acg}_2K-JPG_AmbientOcclusion.jpg`,
        rough: `${set.acg}_2K-JPG_Roughness.jpg`,
      };
  const sources = {};
  sources.normal = await readImage(path.join(dir, f.normal));
  if (set.kind !== 'detail') {
    sources.albedo = tintAlbedo(await readImage(path.join(dir, f.albedo)), set.tint, set.sat);
    if (f.orm) {
      sources.orm = await readImage(path.join(dir, f.orm));
    } else {
      const ao = await readImage(path.join(dir, f.ao));
      const ro = await readImage(path.join(dir, f.rough));
      const d = new Uint8ClampedArray(ao.data.length);
      for (let i = 0; i < d.length; i += 4) {
        d[i] = ao.data[i];
        d[i + 1] = ro.data[i];
        d[i + 2] = 0;
        d[i + 3] = 255;
      }
      sources.orm = { width: ao.width, height: ao.height, data: d };
    }
  }
  await writeMaps(set.id, set.kind, set.sizeM, sources, set);
}

/** Standing-seam sheet: 1 m tile, seams every 50 cm (along +v) + gentle oil-canning. */
function metalNormal(seams) {
  const size = 1024; // 1 px ≈ 1 mm
  const h = new Float32Array(size * size);
  const wave = fbm(size, 3, 3, 11);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = (wave[y * size + x] - 0.9) * 0.0012; // ≤ ~1 mm of waviness
      if (seams) {
        // Seam ridge centred at x = 0 and 512 px: 25 mm wide, 25 mm high (rounded top),
        // with a 6 mm shadow gap either side.
        const dx = Math.min(x % 512, 512 - (x % 512));
        if (dx < 12) v += 0.025 * Math.cos((dx / 12) * (Math.PI / 2)) ** 0.35;
        else if (dx < 18) v -= 0.0015 * Math.sin(((dx - 12) / 6) * Math.PI);
      }
      h[y * size + x] = v;
    }
  return normalFromHeight(h, size, 1 / 0.001 / 2);
}

function fineDetail() {
  const size = 512;
  const n = fbm(size, 4, 32, 5);
  for (let i = 0; i < n.length; i++) n[i] *= 0.00018;
  return normalFromHeight(n, size, 1 / 0.001 / 2);
}

// ---------------------------------------------------------------- sky (HDRI)
function readHDR(file) {
  const buf = fs.readFileSync(file);
  let p = 0;
  const line = () => {
    let s = '';
    while (buf[p] !== 0x0a) s += String.fromCharCode(buf[p++]);
    p++;
    return s;
  };
  if (!line().startsWith('#?')) throw new Error('not a Radiance HDR');
  while (line() !== '');
  const [, h, , w] = line().split(' ');
  const W = Number(w);
  const H = Number(h);
  const out = new Float32Array(W * H * 3);
  const scan = new Uint8Array(W * 4);
  for (let y = 0; y < H; y++) {
    if (buf[p] !== 2 || buf[p + 1] !== 2) throw new Error('only RLE HDR supported');
    p += 4;
    for (let c = 0; c < 4; c++) {
      let x = 0;
      while (x < W) {
        let n = buf[p++];
        if (n > 128) {
          n -= 128;
          const v = buf[p++];
          for (let k = 0; k < n; k++) scan[x++ * 4 + c] = v;
        } else for (let k = 0; k < n; k++) scan[x++ * 4 + c] = buf[p++];
      }
    }
    for (let x = 0; x < W; x++) {
      const e = scan[x * 4 + 3];
      const f = e ? 2 ** (e - 136) : 0;
      const o = (y * W + x) * 3;
      out[o] = scan[x * 4] * f;
      out[o + 1] = scan[x * 4 + 1] * f;
      out[o + 2] = scan[x * 4 + 2] * f;
    }
  }
  return { width: W, height: H, data: out };
}

async function sky() {
  const hdr = readHDR(path.join(SRC, HDRI.ph, `${HDRI.ph}_${HDRI.res}.hdr`));
  const { width: W, height: H, data } = hdr;
  // Sun = brightest pixel; everything is clamped to a multiple of the upper sky's
  // median so the sun comes from the directional light, the sky from the environment.
  let best = 0;
  let bi = 0;
  const lums = [];
  for (let i = 0; i < W * H; i++) {
    const l = 0.2126 * data[i * 3] + 0.7152 * data[i * 3 + 1] + 0.0722 * data[i * 3 + 2];
    if (l > best) {
      best = l;
      bi = i;
    }
    if (i < (W * H) / 2 && i % 7 === 0) lums.push(l);
  }
  lums.sort((a, b) => a - b);
  const median = lums[Math.floor(lums.length / 2)];
  const clampMax = median * 3;
  const sx = bi % W;
  const sy = Math.floor(bi / W);
  // Equirect: u = 0.5 at −z in three's convention; azimuth measured in radians of u.
  const sunU = (sx + 0.5) / W;
  const sunElevationDeg = 90 - ((sy + 0.5) / H) * 180;
  // Horizon colour (fog): mean of the band just above the horizon.
  const hz = [0, 0, 0];
  let hn = 0;
  for (let y = Math.floor(H * 0.47); y < Math.floor(H * 0.5); y++)
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 3;
      for (let k = 0; k < 3; k++) hz[k] += Math.min(clampMax, data[o + k]);
      hn++;
    }
  const toByte = (v) => Math.round(toSrgb(Math.min(1, Math.max(0, v))) * 255);
  const ldr = (w) => {
    const h = w / 2;
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        // Box filter from the source.
        const acc = [0, 0, 0];
        const r = W / w;
        let n = 0;
        for (let yy = Math.floor(y * r); yy < Math.floor((y + 1) * r); yy++)
          for (let xx = Math.floor(x * r); xx < Math.floor((x + 1) * r); xx++) {
            const o = (yy * W + xx) * 3;
            for (let k = 0; k < 3; k++) acc[k] += Math.min(clampMax, data[o + k]);
            n++;
          }
        const i = (y * w + x) * 4;
        for (let k = 0; k < 3; k++) d[i + k] = toByte(acc[k] / n / clampMax);
        d[i + 3] = 255;
      }
    return { width: w, height: h, data: d };
  };
  const skyDir = path.join(OUT, 'sky');
  fs.mkdirSync(skyDir, { recursive: true });
  const env = ldr(1024);
  fs.writeFileSync(path.join(skyDir, 'sky-env.jpg'), toCanvas(env).toBuffer('image/jpeg', 92));
  const bgBytes = await encode(ldr(W), path.join(skyDir, 'sky-bg.ktx2'), 'bg');
  manifest.sky = {
    background: 'sky/sky-bg.ktx2',
    environment: 'sky/sky-env.jpg',
    width: W,
    /** Linear radiance of 1.0 in the LDR files. */
    scale: clampMax,
    sunU,
    sunElevationDeg,
    horizon: hz.map((v) => v / hn / clampMax),
    bytes: {
      'sky/sky-bg.ktx2': bgBytes,
      'sky/sky-env.jpg': fs.statSync(path.join(skyDir, 'sky-env.jpg')).size,
    },
  };
  console.log(
    `  sky: clamp ${clampMax.toFixed(2)} (median ${median.toFixed(2)}, sun ${best.toFixed(0)}), sun u ${sunU.toFixed(3)} el ${sunElevationDeg.toFixed(1)}°, bg ${(bgBytes / 1024).toFixed(0)} KB`,
  );
}

// ---------------------------------------------------------------- main
const want = (id) => only.length === 0 || only.includes(id);
for (const set of SETS) {
  if (!want(set.id)) continue;
  console.log(set.id);
  await sourceSet(set);
}
for (const g of GENERATED) {
  if (!want(g.id)) continue;
  console.log(g.id);
  const normal = g.id === 'detail-fine' ? fineDetail() : metalNormal(g.id === 'metal');
  await writeMaps(g.id, g.kind, g.sizeM, { normal });
}
if (want('sky')) {
  console.log('sky');
  await sky();
}
// Drop files no longer referenced by the manifest.
const used = new Set(Object.values(manifest.sets).flatMap((s) => Object.keys(s.bytes)));
for (const dir of fs.readdirSync(TEX, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  for (const f of fs.readdirSync(path.join(TEX, dir.name))) {
    if (!used.has(`${dir.name}/${f}`)) fs.rmSync(path.join(TEX, dir.name, f));
  }
}
// Tints (the runtime turns a finish colour into a multiplier of the tinted texture).
for (const set of SETS)
  if (manifest.sets[set.id] && set.tint) manifest.sets[set.id].tint = set.tint;
manifest.generated = 'tools/optimize-assets.mjs';
fs.writeFileSync(path.join(TEX, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
const total = Object.values(manifest.sets).reduce(
  (a, s) => a + Object.values(s.bytes).reduce((x, y) => x + y, 0),
  0,
);
console.log(`textures: ${(total / 1e6).toFixed(2)} MB in public/assets/textures`);
