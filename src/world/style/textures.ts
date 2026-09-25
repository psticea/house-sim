/** Style colours and generated textures (no image files; DataTextures work in Node too). */
import * as THREE from 'three';
import type { ColorGrade, GroundPattern } from './config';

const _hsl = { h: 0, s: 0, l: 0 };

/**
 * Softens a palette colour into a light pastel: same hue, saturation × `saturation`,
 * lightness × `lightness` (never above `maxLightness`, never darker than the input).
 * Works in sRGB HSL so the result matches what a designer would pick.
 */
export function pastelColor(
  color: THREE.ColorRepresentation,
  pastel: { saturation: number; lightness: number; maxLightness: number },
): THREE.Color {
  const c = new THREE.Color(color);
  c.getHSL(_hsl, THREE.SRGBColorSpace);
  const l = Math.max(_hsl.l, Math.min(_hsl.l * pastel.lightness, pastel.maxLightness));
  const s = THREE.MathUtils.clamp(_hsl.s * pastel.saturation, 0, 1);
  return c.setHSL(_hsl.h, s, l, THREE.SRGBColorSpace);
}

/**
 * General palette grade (sRGB HSL): saturation × `saturation`, lightness × `lightness`
 * clamped to [`minLightness`, `maxLightness`] (or the pastel rule with `neverDarker`),
 * hue shifted by `hueShift` turns.
 */
export function gradeColor(color: THREE.ColorRepresentation, g: ColorGrade): THREE.Color {
  if (g.neverDarker && !g.hueShift) return pastelColor(color, g);
  const c = new THREE.Color(color);
  c.getHSL(_hsl, THREE.SRGBColorSpace);
  const l = g.neverDarker
    ? Math.max(_hsl.l, Math.min(_hsl.l * g.lightness, g.maxLightness))
    : THREE.MathUtils.clamp(_hsl.l * g.lightness, g.minLightness ?? 0, g.maxLightness);
  const s = THREE.MathUtils.clamp(_hsl.s * g.saturation, 0, 1);
  const h = (((_hsl.h + (g.hueShift ?? 0)) % 1) + 1) % 1;
  return c.setHSL(h, s, l, THREE.SRGBColorSpace);
}

/** Deterministic PRNG (mulberry32) in [0, 1). */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Tileable value-noise octave: `period` lattice cells across a `size`² tile, values 0–1. */
function tileNoise(size: number, period: number, rand: () => number): Float32Array {
  const lattice = new Float32Array(period * period).map(() => rand());
  const out = new Float32Array(size * size);
  const at = (x: number, y: number): number =>
    lattice[(((y % period) + period) % period) * period + (((x % period) + period) % period)]!;
  const fade = (t: number): number => t * t * (3 - 2 * t);
  for (let y = 0; y < size; y++) {
    const fy = (y / size) * period;
    const y0 = Math.floor(fy);
    const ty = fade(fy - y0);
    for (let x = 0; x < size; x++) {
      const fx = (x / size) * period;
      const x0 = Math.floor(fx);
      const tx = fade(fx - x0);
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
      out[y * size + x] = a + (b - a) * ty;
    }
  }
  return out;
}

/** Tileable fractal noise (sum of octaves), normalised to 0–1. */
function tileFbm(size: number, periods: readonly number[], rand: () => number): Float32Array {
  const out = new Float32Array(size * size);
  let total = 0;
  periods.forEach((p, i) => {
    const w = 1 / (i + 1);
    total += w;
    const o = tileNoise(size, p, rand);
    for (let k = 0; k < out.length; k++) out[k]! += o[k]! * w;
  });
  for (let k = 0; k < out.length; k++) out[k]! /= total;
  return out;
}

/**
 * Stamps one tapered brush stroke (wrapping around the tile) into the channels:
 * each channel moves toward `target[c]` by `amount` × stroke coverage.
 */
function stamp(
  chans: Float32Array[],
  size: number,
  cx: number,
  cy: number,
  angle: number,
  length: number,
  width: number,
  target: readonly number[],
  amount: number,
  bristles = 0,
): void {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const hl = length / 2;
  const hw = width / 2;
  const ext = Math.ceil(Math.abs(ux) * hl + Math.abs(uy) * hw) + 1;
  const eyt = Math.ceil(Math.abs(uy) * hl + Math.abs(ux) * hw) + 1;
  for (let dy = -eyt; dy <= eyt; dy++) {
    for (let dx = -ext; dx <= ext; dx++) {
      const along = dx * ux + dy * uy;
      const across = -dx * uy + dy * ux;
      if (Math.abs(along) > hl || Math.abs(across) > hw) continue;
      const ta = 1 - (along / hl) ** 4;
      const tc = 1 - (across / hw) ** 2;
      let w = amount * ta * tc;
      if (bristles > 0) w *= 1 - bristles * (0.5 + 0.5 * Math.sin(across * 2.3 + cx));
      if (w <= 0) continue;
      const x = (((Math.round(cx) + dx) % size) + size) % size;
      const y = (((Math.round(cy) + dy) % size) + size) % size;
      const o = y * size + x;
      chans.forEach((ch, c) => {
        ch[o] = ch[o]! + (target[c]! - ch[o]!) * Math.min(1, w);
      });
    }
  }
}

function rgbaTexture(
  chans: Float32Array[],
  size: number,
  name: string,
  tileM: number,
): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let k = 0; k < size * size; k++) {
    for (let c = 0; c < 3; c++) {
      const v = chans[Math.min(c, chans.length - 1)]![k]!;
      data[k * 4 + c] = Math.round(THREE.MathUtils.clamp(v, 0, 1) * 255);
    }
    data[k * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.repeat.set(1 / tileM, 1 / tileM);
  tex.name = name;
  tex.needsUpdate = true;
  return tex;
}

/**
 * "Hand-painted" detail map (white = unchanged colour; tiles every `tileM` metres):
 * low-frequency grunge, soft directional brush strokes (lighter and darker than the
 * base) and sparse ink speckles. `strength` 0–1 scales everything.
 */
export function createPaintMap(
  strength: number,
  tileM = 4,
  size = 256,
  seed = 3,
): THREE.DataTexture {
  const rand = seededRandom(seed);
  const grunge = tileFbm(size, [4, 8, 16], rand);
  const v = new Float32Array(size * size);
  const base = 1 - 0.1 * strength;
  for (let k = 0; k < v.length; k++) {
    const g = THREE.MathUtils.smoothstep(grunge[k]!, 0.4, 0.85);
    v[k] = base * (1 - 0.16 * strength * g);
  }
  const scale = size / 256;
  // Broad, soft brush strokes, roughly horizontal (lighter and darker than the base).
  const strokes = Math.round(360 * scale * scale);
  for (let i = 0; i < strokes; i++) {
    const light = rand() < 0.5;
    const target = light ? 1 : base * (1 - 0.22 * strength);
    stamp(
      [v],
      size,
      rand() * size,
      rand() * size,
      0.12 + (rand() - 0.5) * 0.35,
      (22 + rand() * 40) * scale,
      (5 + rand() * 7) * scale,
      [target],
      0.3 + rand() * 0.35,
      0.4,
    );
  }
  // Sparse ink scratches: short thin dark dashes, a few in small clusters (grungy areas).
  const scratches = Math.round(70 * scale * scale);
  for (let i = 0; i < scratches; i++) {
    let x = rand() * size;
    let y = rand() * size;
    if (rand() > 0.35 + grunge[Math.floor(y) * size + Math.floor(x)]!) continue;
    const n = 1 + Math.floor(rand() * 3);
    const angle = (rand() - 0.5) * 1.2 + (rand() < 0.3 ? Math.PI / 2 : 0);
    for (let j = 0; j < n; j++) {
      stamp([v], size, x, y, angle, (5 + rand() * 9) * scale, 1.3 * scale, [0.35], 0.55 * strength);
      x += (rand() - 0.5) * 6 * scale;
      y += (2 + rand() * 3) * scale;
    }
  }
  return rgbaTexture([v], size, 'style-paint', tileM);
}

/**
 * Painted lawn (multiplies the lawn colour; tiles every `tileM` metres): soft light and
 * dark patches plus short grass-blade ink strokes (dark, cool) and sunlit ticks (warm).
 */
export function createGrassMap(
  strength: number,
  tileM = 1.6,
  size = 256,
  seed = 5,
): THREE.DataTexture {
  const rand = seededRandom(seed);
  const patches = tileFbm(size, [3, 6, 12], rand);
  const base = 1 - 0.14 * strength;
  const r = new Float32Array(size * size);
  const g = new Float32Array(size * size);
  const b = new Float32Array(size * size);
  for (let k = 0; k < r.length; k++) {
    const p = patches[k]! - 0.5;
    const f = base * (1 + 0.35 * strength * p);
    r[k] = f * (1 + 0.12 * strength * p);
    g[k] = f;
    b[k] = f * (1 - 0.2 * strength * p);
  }
  const dark = [1 - 0.6 * strength, 1 - 0.45 * strength, 1 - 0.5 * strength];
  const lit = [1, 1, 1 - 0.35 * strength];
  const blades = 900;
  for (let i = 0; i < blades; i++) {
    const tuft = rand() < 0.6;
    const cx = rand() * size;
    const cy = rand() * size;
    // A tuft: 2–4 blades fanning out from one root.
    const n = 2 + Math.floor(rand() * 3);
    for (let j = 0; j < n; j++) {
      const angle = -Math.PI / 2 + (j - (n - 1) / 2) * 0.35 + (rand() - 0.5) * 0.3;
      const len = 10 + rand() * 12;
      stamp(
        [r, g, b],
        size,
        cx + Math.cos(angle) * len * 0.5,
        cy + Math.sin(angle) * len * 0.5,
        angle,
        len,
        2 + rand() * 1.5,
        tuft ? dark : lit,
        tuft ? 0.85 : 0.7,
      );
    }
  }
  return rgbaTexture([r, g, b], size, 'style-grass', tileM);
}

/** Brightness of each of `bands` steps, resampling `brightness` if the lengths differ. */
export function bandValues(bands: number, brightness: readonly number[]): number[] {
  const n = Math.max(1, Math.round(bands));
  const src = brightness.length ? brightness : [1];
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 1 : i / (n - 1);
    const f = t * (src.length - 1);
    const i0 = Math.floor(f);
    const i1 = Math.min(src.length - 1, i0 + 1);
    const v = src[i0]! + (src[i1]! - src[i0]!) * (f - i0);
    out.push(THREE.MathUtils.clamp(v, 0, 1));
  }
  return out;
}

/** Toon gradient map: one texel per band, nearest filtering, no mipmaps. */
export function createGradientMap(bands: number, brightness: readonly number[]): THREE.DataTexture {
  const values = bandValues(bands, brightness);
  const data = new Uint8Array(values.map((v) => Math.round(v * 255)));
  const tex = new THREE.DataTexture(data, values.length, 1, THREE.RedFormat);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.name = 'sketch-gradient';
  tex.needsUpdate = true;
  return tex;
}

/**
 * Tiling ground pattern (white = unchanged colour), 1 texture repeat = 1 m:
 * `grid` = 1 m lines with fainter 0.5 m sub-lines, `hatch` = 45° lines every 0.25 m.
 */
export function createGroundPattern(
  kind: GroundPattern,
  strength: number,
  size = 128,
): THREE.DataTexture | null {
  if (kind === 'none' || strength <= 0) return null;
  const data = new Uint8Array(size * size * 4);
  const main = 1 - strength;
  const sub = 1 - strength * 0.5;
  const half = size / 2;
  const hatchStep = size / 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 1;
      if (kind === 'grid') {
        if (x < 2 || y < 2) v = main;
        else if (x === half || y === half) v = sub;
      } else if ((x + y) % hatchStep < 1.5) {
        v = sub;
      }
      const o = (y * size + x) * 4;
      const b = Math.round(v * 255);
      data[o] = b;
      data[o + 1] = b;
      data[o + 2] = b;
      data[o + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.name = 'sketch-ground';
  tex.needsUpdate = true;
  return tex;
}

/** Small tiling paper-grain noise as a PNG data URL (browser only; `null` without a DOM). */
export function paperGrainDataURL(size = 128, seed = 7): string | null {
  if (typeof document === 'undefined') return null;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(size, size);
  let s = seed >>> 0;
  const rand = (): number => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < size * size; i++) {
    const v = Math.round(110 + rand() * 145);
    img.data[i * 4] = v;
    img.data[i * 4 + 1] = v;
    img.data[i * 4 + 2] = Math.max(0, v - 8);
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL('image/png');
}
