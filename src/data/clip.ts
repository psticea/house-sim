/** Small 2D polygon helpers for the site builders: convex clipping and distances. */
import type { Vec2 } from './schema';

export type Pt = [number, number];

/**
 * Sutherland–Hodgman clip of `poly` by the half-plane a·x + b·z + c ≥ 0. Exact for convex
 * subjects (the site builders only clip convex pieces).
 */
export function clipHalfPlane(poly: readonly Vec2[], a: number, b: number, c: number): Pt[] {
  const out: Pt[] = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % n]!;
    const dp = a * p[0] + b * p[1] + c;
    const dq = a * q[0] + b * q[1] + c;
    if (dp >= 0) out.push([p[0], p[1]]);
    if (dp >= 0 !== dq >= 0) {
      const t = dp / (dp - dq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/** Half-planes (a, b, c) whose intersection is the convex polygon `poly` (either winding). */
export function convexHalfPlanes(poly: readonly Vec2[]): [number, number, number][] {
  let area = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    area += p[0] * q[1] - q[0] * p[1];
  }
  const s = area > 0 ? 1 : -1;
  return poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length]!;
    // Inside is on the left of p → q for a positive (x, z) area.
    const a = -(q[1] - p[1]) * s;
    const b = (q[0] - p[0]) * s;
    return [a, b, -(a * p[0] + b * p[1])];
  });
}

/** Convex ∩ convex. */
export function clipConvex(subject: readonly Vec2[], clip: readonly Vec2[]): Pt[] {
  let out: Pt[] = subject.map(([x, z]) => [x, z]);
  for (const [a, b, c] of convexHalfPlanes(clip)) {
    if (out.length < 3) return [];
    out = clipHalfPlane(out, a, b, c);
  }
  return out.length >= 3 ? out : [];
}

/** Convex piece minus a convex polygon → up to `clip.length` convex pieces. */
export function subtractConvex(subject: readonly Vec2[], clip: readonly Vec2[]): Pt[][] {
  const pieces: Pt[][] = [];
  let rest: Pt[] = subject.map(([x, z]) => [x, z]);
  for (const [a, b, c] of convexHalfPlanes(clip)) {
    if (rest.length < 3) break;
    const outside = clipHalfPlane(rest, -a, -b, -c);
    if (outside.length >= 3 && Math.abs(areaOf(outside)) > 1e-7) pieces.push(outside);
    rest = clipHalfPlane(rest, a, b, c);
  }
  return pieces;
}

export function areaOf(poly: readonly Vec2[]): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/** Distance from a point to segment ab. */
export function distToSegment(x: number, z: number, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const L2 = dx * dx + dz * dz;
  const t = L2 > 0 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0;
  return Math.hypot(x - (a[0] + dx * t), z - (a[1] + dz * t));
}

/** Distance from a point to an axis-aligned rectangle (0 inside). */
export function distToRect(x: number, z: number, min: Vec2, max: Vec2): number {
  const dx = Math.max(min[0] - x, 0, x - max[0]);
  const dz = Math.max(min[1] - z, 0, z - max[1]);
  return Math.hypot(dx, dz);
}

export const smoothstep = (e0: number, e1: number, v: number): number => {
  const t = Math.max(0, Math.min(1, (v - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

/** Deterministic PRNG (mulberry32) for procedural placement. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
