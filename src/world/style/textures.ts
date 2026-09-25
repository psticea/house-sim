/** Sketch-style colours and generated textures (no image files; DataTextures work in Node too). */
import * as THREE from 'three';
import type { GroundPattern } from './config';

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
