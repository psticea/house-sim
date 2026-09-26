/**
 * Lightmap export helpers (plan.md §4.1 step 6): float irradiance → RGBM bytes (colour
 * stored as sqrt for precision in dark rooms: E = rgb² · a · range), 2× downsample for
 * the low tier. Pure functions (unit-tested); the KTX2 encoding runs in `tools/bake.mjs`.
 */

/**
 * RGBA float (rgb = irradiance) → RGBM bytes. The multiplier never goes below `floor`
 * (irradiance): dark areas share one constant M, so block compression (UASTC) doesn't
 * turn M steps of 1/255 → 2/255 into ×2 blotches.
 */
export function encodeRGBM(src: Float32Array, range: number, floor = 0.5): Uint8Array {
  const out = new Uint8Array(src.length);
  const minA = Math.max(1, Math.ceil((floor / range) * 255));
  for (let i = 0; i < src.length; i += 4) {
    const r = Math.max(0, src[i]!);
    const g = Math.max(0, src[i + 1]!);
    const b = Math.max(0, src[i + 2]!);
    const peak = Math.min(1, Math.max(r, g, b) / range);
    const a = Math.max(minA, Math.ceil(peak * 255));
    const m = (a / 255) * range;
    out[i] = Math.round(Math.sqrt(Math.min(1, r / m)) * 255);
    out[i + 1] = Math.round(Math.sqrt(Math.min(1, g / m)) * 255);
    out[i + 2] = Math.round(Math.sqrt(Math.min(1, b / m)) * 255);
    out[i + 3] = a;
  }
  return out;
}

export function decodeRGBM(
  bytes: ArrayLike<number>,
  i: number,
  range: number,
): [number, number, number] {
  const m = (bytes[i + 3]! / 255) * range;
  const c = (v: number): number => (v / 255) ** 2 * m;
  return [c(bytes[i]!), c(bytes[i + 1]!), c(bytes[i + 2]!)];
}

/** Box 2× downsample of an RGBA float image; texels with a = 0 don't contribute. */
export function downsample2x(src: Float32Array, size: number): Float32Array {
  const h = size / 2;
  const out = new Float32Array(h * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < h; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let w = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const i = ((y * 2 + dy) * size + x * 2 + dx) * 4;
          if (src[i + 3]! <= 0) continue;
          r += src[i]!;
          g += src[i + 1]!;
          b += src[i + 2]!;
          w++;
        }
      }
      const o = (y * h + x) * 4;
      if (w > 0) {
        out[o] = r / w;
        out[o + 1] = g / w;
        out[o + 2] = b / w;
        out[o + 3] = 1;
      }
    }
  }
  return out;
}
