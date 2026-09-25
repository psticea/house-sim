/** Small, dependency-free 2D/profile helpers shared by data checks and world builders. */
import type { Opening, Polygon, Roof, RoofSegment, Vec2, Wall } from './schema';

export function polygonArea(poly: Polygon): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return Math.abs(a) / 2;
}

/** Signed area (positive = counter-clockwise in a y-up frame; our plan frame is z-down). */
export function signedArea(poly: Polygon): number {
  let a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

export function pointInPolygon(x: number, z: number, poly: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonBounds(poly: Polygon): {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
} {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, maxX, minZ, maxZ };
}

export function wallLength(w: Wall): number {
  return Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
}

/** Unit direction from → to and the LEFT normal (dz, −dx). */
export function wallFrame(w: Wall): { dir: Vec2; left: Vec2; length: number } {
  const length = wallLength(w);
  const dx = (w.to[0] - w.from[0]) / length;
  const dz = (w.to[1] - w.from[1]) / length;
  return { dir: [dx, dz], left: [dz, -dx], length };
}

export function wallThickness(w: Wall): number {
  return w.layers.reduce((s, l) => s + l.thickness, 0);
}

/** Point on the wall centre line at distance u from `from`. */
export function wallPoint(w: Wall, u: number): Vec2 {
  const { dir } = wallFrame(w);
  return [w.from[0] + dir[0] * u, w.from[1] + dir[1] * u];
}

export const roofSlope = (roof: Roof): number => Math.tan((roof.pitchDeg * Math.PI) / 180);

/** Outer (top) roof surface height at plan depth z. */
export function roofTopY(roof: Roof, z: number): number {
  const d = Math.min(z - roof.eaveZ[0], roof.eaveZ[1] - z);
  return roof.eaveY + roofSlope(roof) * Math.max(0, d);
}

export function roofSegment(roof: Roof, id: string): RoofSegment {
  const s = roof.segments.find((seg) => seg.id === id);
  if (!s) throw new Error(`Unknown roof segment ${id}`);
  return s;
}

/** Underside of a roof segment at plan depth z (flat = innerY outside the sloped part). */
export function roofUndersideY(roof: Roof, seg: RoofSegment, z: number): number {
  const zA = roof.eaveZ[0] + seg.innerZ;
  const zB = roof.eaveZ[1] - seg.innerZ;
  const d = Math.min(z - zA, zB - z);
  return seg.innerY + roofSlope(roof) * Math.max(0, d);
}

/** Kink depths of a segment's underside profile. */
export function roofUndersideKinks(roof: Roof, seg: RoofSegment): number[] {
  return [roof.eaveZ[0] + seg.innerZ, roof.ridgeZ, roof.eaveZ[1] - seg.innerZ];
}

/**
 * Top outline of a wall in local (u, v) coordinates (u along the wall from `from`,
 * v above the level's finished floor), sampled at its kinks. Ordered by u.
 */
export function wallTopProfile(w: Wall, roof: Roof, levelFloorY: number): Vec2[] {
  const { dir, length } = wallFrame(w);
  if (typeof w.top === 'number') {
    return [
      [0, w.top],
      [length, w.top],
    ];
  }
  const seg = roofSegment(roof, w.top.roof);
  if (Math.abs(dir[1]) < 1e-9) {
    // Wall parallel to the eaves: the roof underside slopes across its thickness — use
    // the higher face so the top disappears into the roof build-up (no gap).
    const t = wallThickness(w) / 2;
    const v =
      Math.max(roofUndersideY(roof, seg, w.from[1] - t), roofUndersideY(roof, seg, w.from[1] + t)) -
      levelFloorY;
    return [
      [0, v],
      [length, v],
    ];
  }
  const us = new Set<number>([0, length]);
  for (const kz of roofUndersideKinks(roof, seg)) {
    const u = (kz - w.from[1]) / dir[1];
    if (u > 1e-6 && u < length - 1e-6) us.add(u);
  }
  return [...us]
    .sort((a, b) => a - b)
    .map((u): Vec2 => [u, roofUndersideY(roof, seg, w.from[1] + dir[1] * u) - levelFloorY]);
}

/** Top height (local v) of the wall at u, from its profile. */
export function wallTopAt(profile: readonly Vec2[], u: number): number {
  for (let i = 0; i + 1 < profile.length; i++) {
    const [u0, v0] = profile[i]!;
    const [u1, v1] = profile[i + 1]!;
    if (u >= u0 - 1e-9 && u <= u1 + 1e-9) {
      const t = u1 - u0 < 1e-12 ? 0 : (u - u0) / (u1 - u0);
      return v0 + (v1 - v0) * t;
    }
  }
  return profile[profile.length - 1]![1];
}

/** Openings a person can walk through. */
export const isPassable = (o: Opening): boolean =>
  o.state === 'open' && (o.kind === 'door' || o.kind === 'passage' || o.kind === 'sliding');

export const deg = (r: number): number => (r * 180) / Math.PI;
export const rad = (d: number): number => (d * Math.PI) / 180;
