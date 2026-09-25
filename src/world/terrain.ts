/**
 * Terrain meshes (I3 step 3.1): lawn on the lot and context ground around it, sampled on
 * the triangulated terrain grid of src/data/terrain.ts, plus helpers that drape paving,
 * gravel, stones and edging onto it (top = terrain + offset, so they never intersect the
 * lawn), the far context ground and a ring of low hills.
 */
import * as THREE from 'three';
import { areaOf, clipConvex, subtractConvex, type Pt } from '../data/clip';
import type { MaterialId, Polygon, Vec2 } from '../data/schema';
import { FIELD_Y, TERRAIN, terrainHeight } from '../data/terrain';
import type { MeshBuilder, TriangleBucket, V3 } from './meshBuilder';

const UP: V3 = [0, 1, 0];
const MIN_AREA = 1e-6;

function isConvex(poly: readonly Vec2[]): boolean {
  let sign = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const c = poly[(i + 2) % poly.length]!;
    const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cr) < 1e-12) continue;
    const s = Math.sign(cr);
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return true;
}

/** Convex pieces of a simple polygon (itself, or its ear-clipping triangles). */
export function convexPieces(poly: Polygon): Pt[][] {
  if (isConvex(poly)) return [poly.map(([x, z]) => [x, z] as Pt)];
  const contour = poly.map(([x, z]) => new THREE.Vector2(x, z));
  return THREE.ShapeUtils.triangulateShape(contour, []).map((f) =>
    f.map((k) => [contour[k]!.x, contour[k]!.y] as Pt),
  );
}

/** Fan-triangulates a convex plan piece at terrain height + offset. */
function emitPiece(bucket: TriangleBucket, piece: readonly Vec2[], offset: number): void {
  const p = piece.map(([x, z]): V3 => [x, terrainHeight(x, z) + offset, z]);
  for (let k = 1; k + 1 < p.length; k++) {
    const a = piece[0]!;
    const b = piece[k]!;
    const c = piece[k + 1]!;
    if (Math.abs(areaOf([a, b, c])) < MIN_AREA) continue;
    bucket.tri(p[0]!, p[k]!, p[k + 1]!, UP);
  }
}

/** Terrain-grid triangles overlapping a plan bounding box. */
function* gridTriangles(minX: number, minZ: number, maxX: number, maxZ: number) {
  const t = TERRAIN;
  const i0 = Math.max(0, Math.floor((minX - t.x0) / t.step));
  const i1 = Math.min(t.nx - 1, Math.floor((maxX - t.x0) / t.step));
  const j0 = Math.max(0, Math.floor((minZ - t.z0) / t.step));
  const j1 = Math.min(t.nz - 1, Math.floor((maxZ - t.z0) / t.step));
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      for (const tri of t.cellTriangles(i, j)) yield tri.map(([x, , z]) => [x, z] as Pt);
    }
  }
}

function bounds(poly: readonly Vec2[]): [number, number, number, number] {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return [minX, minZ, maxX, maxZ];
}

/** Top surface of `poly` draped on the terrain (split at the terrain triangles). */
export function drapeTop(bucket: TriangleBucket, poly: Polygon, offset: number): void {
  for (const piece of convexPieces(poly)) {
    const [minX, minZ, maxX, maxZ] = bounds(piece);
    for (const tri of gridTriangles(minX, minZ, maxX, maxZ)) {
      const clipped = clipConvex(piece, tri);
      if (clipped.length >= 3 && Math.abs(areaOf(clipped)) > MIN_AREA) {
        emitPiece(bucket, clipped, offset);
      }
    }
  }
}

/** Vertical lip around a draped polygon, from its top down to just under the lawn. */
export function drapeSides(bucket: TriangleBucket, poly: Polygon, offset: number): void {
  const ccw = areaOf(poly) > 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-6) continue;
    const n = Math.max(1, Math.ceil(len / 0.25));
    // Outward normal (interior on the left of a → b for a positive area).
    let nx = (b[1] - a[1]) / len;
    let nz = -(b[0] - a[0]) / len;
    if (!ccw) {
      nx = -nx;
      nz = -nz;
    }
    for (let k = 0; k < n; k++) {
      const t0 = k / n;
      const t1 = (k + 1) / n;
      const x0 = a[0] + (b[0] - a[0]) * t0;
      const z0 = a[1] + (b[1] - a[1]) * t0;
      const x1 = a[0] + (b[0] - a[0]) * t1;
      const z1 = a[1] + (b[1] - a[1]) * t1;
      const h0 = terrainHeight(x0, z0);
      const h1 = terrainHeight(x1, z1);
      bucket.quad(
        [x0, h0 - 0.02, z0],
        [x1, h1 - 0.02, z1],
        [x1, h1 + offset, z1],
        [x0, h0 + offset, z0],
        [nx, 0, nz],
      );
    }
  }
}

/** Draped slab: top at terrain + offset with a lip; optional collider top. */
export function drape(
  mesh: MeshBuilder,
  collider: MeshBuilder | null,
  id: MaterialId,
  poly: Polygon,
  offset: number,
  sides = true,
): void {
  drapeTop(mesh.bucket(id), poly, offset);
  if (sides) drapeSides(mesh.bucket(id), poly, offset);
  if (collider) drapeTop(collider.bucket('concrete'), poly, offset);
}

/**
 * Thin strip standing on the terrain along a polyline (Corten edging): `height` above and
 * `depth` below the ground, `thickness` wide, mitred so consecutive faces share edges.
 */
export function edgingStrip(
  bucket: TriangleBucket,
  points: readonly Vec2[],
  closed: boolean,
  thickness: number,
  height: number,
  depth: number,
): void {
  // Densify to ≤ 0.5 m so the strip follows the terrain.
  const pts: Vec2[] = [];
  const n = points.length;
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % n]!;
    const k = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.5));
    for (let s = 0; s < k; s++) {
      pts.push([a[0] + ((b[0] - a[0]) * s) / k, a[1] + ((b[1] - a[1]) * s) / k]);
    }
  }
  if (!closed) pts.push(points[n - 1]!);
  const m = pts.length;
  const half = thickness / 2;
  const unit = (a: Vec2, b: Vec2): Vec2 | null => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    return L > 1e-9 ? [(b[0] - a[0]) / L, (b[1] - a[1]) / L] : null;
  };
  const dirs = pts.map((p, i) => {
    const prev = closed ? pts[(i - 1 + m) % m]! : pts[Math.max(0, i - 1)]!;
    const next = closed ? pts[(i + 1) % m]! : pts[Math.min(m - 1, i + 1)]!;
    const d0 = unit(prev, p);
    const d1 = unit(p, next);
    return [d0 ?? d1!, d1 ?? d0!] as const;
  });
  const side: [Vec2, Vec2][] = pts.map((p, i) => {
    const [d0, d1] = dirs[i]!;
    // Mitre normal (left of the walking direction).
    let nx = -(d0[1] + d1[1]);
    let nz = d0[0] + d1[0];
    const L = Math.hypot(nx, nz) || 1;
    nx /= L;
    nz /= L;
    const cos = Math.max(0.3, nx * -d1[1] + nz * d1[0]);
    const w = half / cos;
    return [
      [p[0] + nx * w, p[1] + nz * w],
      [p[0] - nx * w, p[1] - nz * w],
    ];
  });
  const y = (p: Vec2, dy: number): V3 => [p[0], terrainHeight(p[0], p[1]) + dy, p[1]];
  const count = closed ? m : m - 1;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % m;
    const [la, ra] = side[i]!;
    const [lb, rb] = side[j]!;
    const dx = pts[j]![0] - pts[i]![0];
    const dz = pts[j]![1] - pts[i]![1];
    bucket.quad(y(la, -depth), y(lb, -depth), y(lb, height), y(la, height), [-dz, 0, dx]);
    bucket.quad(y(ra, -depth), y(rb, -depth), y(rb, height), y(ra, height), [dz, 0, -dx]);
    bucket.quad(y(la, height), y(lb, height), y(rb, height), y(ra, height), UP);
  }
  if (!closed) {
    for (const [i, s] of [
      [0, -1],
      [m - 1, 1],
    ] as const) {
      const [l, r] = side[i]!;
      const d = dirs[i]![0];
      bucket.quad(y(l, -depth), y(r, -depth), y(r, height), y(l, height), [d[0] * s, 0, d[1] * s]);
    }
  }
}

/**
 * Lawn (inside the lot, minus `holes`) and context ground ('field', outside the lot) on
 * every terrain triangle; both go into the collider as well.
 */
export function buildTerrain(
  mesh: MeshBuilder,
  collider: MeshBuilder,
  lot: Polygon,
  holes: readonly Polygon[],
): void {
  const t = TERRAIN;
  const lawn = mesh.bucket('lawn');
  const field = mesh.bucket('field');
  const col = collider.bucket('concrete');
  for (const tri of gridTriangles(t.x0, t.z0, t.x1 - 1e-9, t.z1 - 1e-9)) {
    let pieces: Pt[][] = [];
    const inLot = clipConvex(tri, lot);
    if (inLot.length >= 3) pieces.push(inLot);
    for (const h of holes) pieces = pieces.flatMap((p) => subtractConvex(p, h));
    for (const p of pieces) {
      emitPiece(lawn, p, 0);
      emitPiece(col, p, 0);
    }
    for (const p of subtractConvex(tri, lot)) {
      emitPiece(field, p, 0);
      emitPiece(col, p, 0);
    }
  }
  // Far context ground: flat ring around the terrain grid, out to the hills.
  const R = 310;
  const ring: [number, number][] = [];
  const cx = (t.x0 + t.x1) / 2;
  const cz = (t.z0 + t.z1) / 2;
  for (let i = 0; i < 48; i++) {
    const a = (-i / 48) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]);
  }
  mesh.polygon(
    'field',
    ring,
    [
      [
        [t.x0, t.z0],
        [t.x1, t.z0],
        [t.x1, t.z1],
        [t.x0, t.z1],
      ],
    ],
    (x, z) => [x, FIELD_Y, z],
    UP,
  );
  buildHills(mesh.bucket('field'), cx, cz);
}

/** A hint of distant hills: a low ring 300–440 m out (fades into the fog). */
function buildHills(bucket: TriangleBucket, cx: number, cz: number): void {
  const N = 72;
  const radii = [300, 350, 400, 440];
  const lift = [-0.4, 0.45, 0.85, 1];
  const height = (a: number): number =>
    22 + 9 * Math.sin(3 * a + 0.8) + 6 * Math.sin(7 * a + 2.3) + 4 * Math.sin(13 * a + 0.4);
  const p = (i: number, k: number): V3 => {
    const a = (i / N) * Math.PI * 2;
    const r = radii[k]!;
    const y = k === 0 ? FIELD_Y + lift[0]! : FIELD_Y + height(a) * lift[k]!;
    return [cx + Math.cos(a) * r, y, cz + Math.sin(a) * r];
  };
  for (let i = 0; i < N; i++) {
    for (let k = 0; k + 1 < radii.length; k++) {
      const a = p(i, k);
      const b = p(i + 1, k);
      const c = p(i + 1, k + 1);
      const d = p(i, k + 1);
      const mid = new THREE.Vector3(cx - (a[0] + c[0]) / 2, 0, cz - (a[2] + c[2]) / 2).normalize();
      // Facing inwards and up (toward the lot).
      bucket.quad(a, b, c, d, [mid.x, 0.6, mid.z]);
    }
  }
}
