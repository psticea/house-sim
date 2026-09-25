/**
 * Stairs: flights (masonry down to the floor, or a sloped slab with a plaster soffit),
 * landings, winders, rod balustrades / handrails; walking ramps + railing strips as
 * colliders (see data/stairs.ts for the ramp math).
 */
import type { MaterialId, Railing, StairFlight, Stairs } from '../data/schema';
import {
  flightLength,
  flightPoint,
  stairRampTriangles,
  stairRise,
  stairSurfaceY,
} from '../data/stairs';
import type { MeshBuilder, V3 } from './meshBuilder';

const TREAD: MaterialId = 'oak';
const RISER: MaterialId = 'plaster';
const SIDE: MaterialId = 'plaster';
/** Soffit of slab flights: 17 cm under the lower level at the foot. */
const SOFFIT_DROP = 0.17;

export function buildStairs(
  mesh: MeshBuilder,
  collider: MeshBuilder,
  st: Stairs,
  floorY: number,
): void {
  const rise = stairRise(st, floorY);
  for (const f of st.flights) buildFlight(mesh, f, rise, floorY);
  for (const l of st.landings) {
    const top = floorY + l.riser * rise;
    const bottom = l.thickness ? top - l.thickness : floorY;
    mesh.prism(l.polygon, bottom, top, {
      top: TREAD,
      bottom: l.thickness ? 'plaster' : null,
      sides: SIDE,
    });
    collider.prism(l.polygon, bottom, top, { top: 'concrete' });
  }
  for (const w of st.winders?.treads ?? []) {
    mesh.prism(w.polygon, floorY, floorY + w.riser * rise, {
      top: TREAD,
      bottom: null,
      sides: RISER,
    });
  }
  // Upward-facing (the controller treats faces with a downward normal as non-walkable).
  for (const [a, b, c] of stairRampTriangles(st, floorY)) {
    collider.tri('concrete', a, b, c, [0, 1, 0]);
  }
  for (const r of st.railings) buildRailing(mesh, collider, r, st, floorY);
}

/** Flight as a side profile (s along the ascent, y) extruded across its width. */
function buildFlight(mesh: MeshBuilder, f: StairFlight, rise: number, floorY: number): void {
  const g = f.going;
  const L = flightLength(f);
  const y = (k: number): number => floorY + (f.firstRiser + k) * rise;
  const prof: [number, number][] = [[0, f.solid ? floorY : y(-1) - SOFFIT_DROP]];
  for (let k = 0; k < f.treads; k++) prof.push([k * g, y(k)], [(k + 1) * g, y(k)]);
  prof.push([L, f.solid ? floorY : (f.soffitTop ?? y(f.treads - 1) - SOFFIT_DROP)]);
  let area = 0;
  for (let i = 0; i < prof.length; i++) {
    const [s0, y0] = prof[i]!;
    const [s1, y1] = prof[(i + 1) % prof.length]!;
    area += s0 * y1 - s1 * y0;
  }
  const ccw = area > 0;
  const [ax, az] = ascentDir(f);
  const lat = lateralDir(f);
  const at = (s: number, yy: number, c: number): V3 => {
    const [px, pz] = flightPoint(f, s, c);
    return [px, yy, pz];
  };
  for (const c of [0, 1]) {
    const n: V3 = c === 0 ? [-lat[0], 0, -lat[1]] : [lat[0], 0, lat[1]];
    // Body under the inner-corner line + one triangle per step (earcut would make
    // zero-area triangles from the collinear nosings).
    const [s0, f0] = prof[0]!;
    const [s1, f1] = prof[prof.length - 1]!;
    if (Math.abs(y(-1) - f0) < 1e-9) {
      mesh.tri(SIDE, at(s0, f0, c), at(s1, f1, c), at(L, y(f.treads - 1), c), n);
    } else {
      mesh.quad(SIDE, at(s0, f0, c), at(s1, f1, c), at(L, y(f.treads - 1), c), at(0, y(-1), c), n);
    }
    for (let k = 0; k < f.treads; k++) {
      mesh.tri(SIDE, at(k * g, y(k - 1), c), at(k * g, y(k), c), at((k + 1) * g, y(k), c), n);
    }
  }
  // Edge faces: treads (up), risers / ends (along s), soffit (down).
  for (let i = 0; i < prof.length; i++) {
    const [s0, y0] = prof[i]!;
    const [s1, y1] = prof[(i + 1) % prof.length]!;
    const ds = s1 - s0;
    const dy = y1 - y0;
    const len = Math.hypot(ds, dy);
    if (len < 1e-9) continue;
    let ns = dy / len;
    let ny = -ds / len;
    if (!ccw) {
      ns = -ns;
      ny = -ny;
    }
    if (f.solid && Math.abs(y0 - floorY) < 1e-9 && Math.abs(y1 - floorY) < 1e-9) continue;
    const mat: MaterialId = ny > 0.99 ? TREAD : RISER;
    const facing: V3 = [ax * ns, ny, az * ns];
    mesh.quad(mat, at(s0, y0, 0), at(s1, y1, 0), at(s1, y1, 1), at(s0, y0, 1), facing);
  }
}

function ascentDir(f: StairFlight): [number, number] {
  switch (f.direction) {
    case '+z':
      return [0, 1];
    case '-z':
      return [0, -1];
    case '+x':
      return [1, 0];
    case '-x':
      return [-1, 0];
  }
}

/** Plan direction from lateral c = 0 to c = 1 (flightPoint interpolates x or z ranges). */
function lateralDir(f: StairFlight): [number, number] {
  return f.direction === '+z' || f.direction === '-z' ? [1, 0] : [0, 1];
}

const ROD = 0.005;
const RAIL = 0.02;

function buildRailing(
  mesh: MeshBuilder,
  collider: MeshBuilder,
  r: Railing,
  st: Stairs,
  floorY: number,
): void {
  const pts = r.top;
  const cum = [0];
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]!;
    const b = pts[i]!;
    cum.push(cum[i - 1]! + Math.hypot(b[0] - a[0], b[2] - a[2]));
  }
  const total = cum[cum.length - 1]!;
  const sample = (d: number): { p: V3; bottom: number | null } => {
    let i = 0;
    while (i < pts.length - 2 && cum[i + 1]! < d) i++;
    const seg = cum[i + 1]! - cum[i]!;
    const t = seg < 1e-9 ? 0 : Math.min(1, Math.max(0, (d - cum[i]!) / seg));
    const a = pts[i]!;
    const b = pts[i + 1]!;
    const p: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    let bottom: number | null = null;
    if (r.bottom === 'treads') bottom = stairSurfaceY(st, floorY, p[0], p[2]) ?? floorY;
    else if (r.bottom) bottom = r.bottom[i]! + (r.bottom[i + 1]! - r.bottom[i]!) * t;
    return { p, bottom };
  };
  for (let i = 0; i + 1 < pts.length; i++) bar(mesh, pts[i]!, pts[i + 1]!, RAIL);
  if (!r.bottom) {
    // Wall-mounted handrail: small brackets every ~0.9 m.
    const n = Math.max(2, Math.round(total / 0.9) + 1);
    for (let k = 0; k < n; k++) {
      const { p } = sample((total * k) / (n - 1));
      mesh.box(
        'metalBlack',
        [p[0] - 0.01, p[1] - 0.07, p[2] - 0.01],
        [p[0] + 0.01, p[1] - RAIL, p[2] + 0.01],
        { skipTop: true },
      );
    }
    return;
  }
  // Rods (Ø 1 cm, drawn as 1 × 1 cm bars) standing on the treads / wall top.
  const spacing = r.rodSpacing ?? 0.1;
  const n = Math.max(2, Math.round(total / spacing) + 1);
  for (let k = 0; k < n; k++) {
    const { p, bottom } = sample((total * k) / (n - 1));
    if (bottom === null || p[1] - bottom < 0.05) continue;
    mesh.box(
      'metalBlack',
      [p[0] - ROD, bottom, p[2] - ROD],
      [p[0] + ROD, p[1] - RAIL, p[2] + ROD],
      {
        bottom: null,
        skipTop: true,
      },
    );
  }
  if (!r.collide) return;
  // Collision strip from under the infill to 10 cm over the handrail, per segment.
  const [sx, sz] = r.colliderShift ?? [0, 0];
  for (let i = 0; i + 1 < pts.length; i++) {
    const pa = pts[i]!;
    const pb = pts[i + 1]!;
    if (Math.hypot(pb[0] - pa[0], pb[2] - pa[2]) < 1e-6) continue;
    const ba = (sample(cum[i]! + 1e-6).bottom ?? floorY) - 0.05;
    const bb = (sample(cum[i + 1]! - 1e-6).bottom ?? floorY) - 0.05;
    collider.quad(
      'concrete',
      [pa[0] + sx, ba, pa[2] + sz],
      [pb[0] + sx, bb, pb[2] + sz],
      [pb[0] + sx, pb[1] + 0.1, pb[2] + sz],
      [pa[0] + sx, pa[1] + 0.1, pa[2] + sz],
    );
  }
}

/** Square bar of half-size `h` between two points (handrails). */
function bar(mesh: MeshBuilder, a: V3, b: V3, h: number): void {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  if (len < 1e-6) return;
  const ax: V3 = [d[0] / len, d[1] / len, d[2] / len];
  let sx = -ax[2];
  let sz = ax[0];
  const sl = Math.hypot(sx, sz);
  if (sl < 1e-6) {
    sx = 1;
    sz = 0;
  } else {
    sx /= sl;
    sz /= sl;
  }
  const az: V3 = [sx, 0, sz];
  const ay: V3 = [
    az[1] * ax[2] - az[2] * ax[1],
    az[2] * ax[0] - az[0] * ax[2],
    az[0] * ax[1] - az[1] * ax[0],
  ];
  mesh.orientedBox(
    'metalBlack',
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    ax,
    ay,
    az,
    [len / 2, h, h],
  );
}
