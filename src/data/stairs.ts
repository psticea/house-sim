/**
 * Stair math shared by the data checks and the world builders (no three.js): riser
 * height, tread / landing surfaces and the walking ramps used as colliders.
 *
 * Walking ramp of a flight = the nosing line: it touches every tread nosing, meets the
 * landing / upper floor exactly at the top edge and (with `rampFoot`) the lower floor
 * one going before the first riser, so the capsule glides over the steps without
 * bumps. Winder turns get a helicoid (height interpolated by angle around the pivot)
 * that joins the two flights' ramps edge to edge.
 */
import { pointInPolygon } from './geometry2d';
import type { StairFlight, Stairs, Vec2 } from './schema';

export type P3 = readonly [number, number, number];

/** Actual riser height: the level difference divided evenly (plan value is rounded). */
export function stairRise(st: Stairs, floorY: number): number {
  return (st.topY - floorY) / st.risers;
}

/** Distance from the flight's lower edge along the ascent (negative = before the flight). */
export function flightS(f: StairFlight, x: number, z: number): number {
  switch (f.direction) {
    case '+z':
      return z - f.z[0];
    case '-z':
      return f.z[1] - z;
    case '+x':
      return x - f.x[0];
    case '-x':
      return f.x[1] - x;
  }
}

/** Plan length of the flight along its ascent. */
export const flightLength = (f: StairFlight): number => f.treads * f.going;

/** Height of the nosing line (walking ramp) of a flight at (x, z), extrapolated. */
export function flightRampY(
  f: StairFlight,
  rise: number,
  floorY: number,
  x: number,
  z: number,
): number {
  return floorY + rise * (f.firstRiser + flightS(f, x, z) / f.going);
}

const inRange = (v: number, r: readonly [number, number], eps = 1e-9): boolean =>
  v >= r[0] - eps && v <= r[1] + eps;

/** Visual walking surface (tread / winder / landing top) at (x, z), or null. */
export function stairSurfaceY(st: Stairs, floorY: number, x: number, z: number): number | null {
  const rise = stairRise(st, floorY);
  for (const f of st.flights) {
    if (!inRange(x, f.x) || !inRange(z, f.z)) continue;
    const k = Math.min(f.treads - 1, Math.max(0, Math.floor(flightS(f, x, z) / f.going)));
    return floorY + (f.firstRiser + k) * rise;
  }
  for (const l of st.landings) if (pointInPolygon(x, z, l.polygon)) return floorY + l.riser * rise;
  for (const w of st.winders?.treads ?? []) {
    if (pointInPolygon(x, z, w.polygon)) return floorY + w.riser * rise;
  }
  return null;
}

/** Plan point of a flight at ascent distance s and lateral position c ∈ [0, 1]. */
export function flightPoint(f: StairFlight, s: number, c: number): Vec2 {
  const lx = f.x[0] + (f.x[1] - f.x[0]) * c;
  const lz = f.z[0] + (f.z[1] - f.z[0]) * c;
  switch (f.direction) {
    case '+z':
      return [lx, f.z[0] + s];
    case '-z':
      return [lx, f.z[1] - s];
    case '+x':
      return [f.x[0] + s, lz];
    case '-x':
      return [f.x[1] - s, lz];
  }
}

/** Collider triangles of all walking ramps of a stair. */
export function stairRampTriangles(st: Stairs, floorY: number): [P3, P3, P3][] {
  const rise = stairRise(st, floorY);
  const tris: [P3, P3, P3][] = [];
  for (const f of st.flights) {
    const s0 = f.rampFoot ? -f.going : 0;
    const s1 = flightLength(f);
    const p = (s: number, c: number): P3 => {
      const [x, z] = flightPoint(f, s, c);
      return [x, flightRampY(f, rise, floorY, x, z), z];
    };
    const a = p(s0, 0);
    const b = p(s1, 0);
    const c = p(s1, 1);
    const d = p(s0, 1);
    tris.push([a, b, c], [a, c, d]);
  }
  const w = st.winders;
  if (w) {
    const [px, pz] = w.pivot;
    const angle = (v: Vec2): number => Math.atan2(v[1], v[0]);
    const a0 = angle(w.lowDir);
    let span = angle(w.highDir) - a0;
    while (span > Math.PI) span -= 2 * Math.PI;
    while (span < -Math.PI) span += 2 * Math.PI;
    const exit = (dx: number, dz: number): number => {
      const tx = dx > 1e-9 ? (w.x[1] - px) / dx : dx < -1e-9 ? (w.x[0] - px) / dx : Infinity;
      const tz = dz > 1e-9 ? (w.z[1] - pz) / dz : dz < -1e-9 ? (w.z[0] - pz) / dz : Infinity;
      return Math.min(tx, tz);
    };
    // Rays from the low edge to the high edge, plus the rectangle corners in between.
    const ts = new Set<number>();
    const N = 12;
    for (let i = 0; i <= N; i++) ts.add(i / N);
    for (const [cx, cz] of [
      [w.x[0], w.z[0]],
      [w.x[1], w.z[0]],
      [w.x[1], w.z[1]],
      [w.x[0], w.z[1]],
    ] as const) {
      let da = angle([cx - px, cz - pz]) - a0;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      const t = da / span;
      if (t > 1e-6 && t < 1 - 1e-6 && Math.hypot(cx - px, cz - pz) > 1e-6) ts.add(t);
    }
    const r0 = 0.02;
    const M = 6;
    const rays = [...ts]
      .sort((u, v) => u - v)
      .map((t) => {
        const a = a0 + span * t;
        const dx = Math.cos(a);
        const dz = Math.sin(a);
        const y = floorY + rise * (w.lowRiser + (w.highRiser - w.lowRiser) * t);
        const len = exit(dx, dz);
        // Points along the ray: the surface between neighbouring rays is then a strip
        // of nearly planar quads with an even slope along any circle around the pivot.
        return Array.from({ length: M + 1 }, (_, j): P3 => {
          const r = r0 + ((len - r0) * j) / M;
          return [px + dx * r, y, pz + dz * r];
        });
      });
    for (let i = 0; i + 1 < rays.length; i++) {
      const r = rays[i]!;
      const q = rays[i + 1]!;
      for (let j = 0; j < M; j++) {
        tris.push([r[j]!, r[j + 1]!, q[j + 1]!], [r[j]!, q[j + 1]!, q[j]!]);
      }
    }
  }
  return tris;
}

/** Height of a ramp (collider) surface at (x, z), from its triangles; null if none. */
export function rampYAt(tris: readonly [P3, P3, P3][], x: number, z: number): number | null {
  let best: number | null = null;
  for (const [a, b, c] of tris) {
    const d = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(d) < 1e-12) continue;
    const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / d;
    const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / d;
    const l3 = 1 - l1 - l2;
    if (l1 < -1e-9 || l2 < -1e-9 || l3 < -1e-9) continue;
    const y = l1 * a[1] + l2 * b[1] + l3 * c[1];
    if (best === null || y > best) best = y;
  }
  return best;
}
