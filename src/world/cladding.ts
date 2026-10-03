/**
 * Board cladding on a facade (`Wall.cladding`, the west gable): the outer face is split
 * into the metal border (the layer's own material) and the wood field; the field shows
 * a dark backing behind proud boards whose joints follow each zone's direction and
 * pitch, cut around the windows. Optional standing seams on the metal rake band.
 */
import type {
  BoardZone,
  MaterialId,
  Polygon,
  Roof,
  Vec2,
  Wall,
  WoodCladding,
} from '../data/schema';
import { pointInPolygon, roofTopY, wallFrame, wallPoint } from '../data/geometry2d';
import { BOARD_TEXTURE } from './finishes';
import type { MeshBuilder, V3 } from './meshBuilder';
import { ringSignedArea } from './meshBuilder';
import { wallPrism, type WallSpace } from './wallSpace';

type Pt = [number, number];

/** Sutherland–Hodgman clip of a convex polygon by the half-plane n·p ≥ c. */
export function clipHalfPlane(poly: readonly Pt[], n: Pt, c: number): Pt[] {
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const da = n[0] * a[0] + n[1] * a[1] - c;
    const db = n[0] * b[0] + n[1] * b[1] - c;
    if (da >= 0) out.push(a);
    if (da >= 0 !== db >= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** Convex polygon shrunk by `d` on every edge (inward half-planes). */
export function insetConvex(poly: readonly Vec2[], d: number): Pt[] {
  const ccw = ringSignedArea(poly) > 0;
  let out: Pt[] = poly.map(([u, v]) => [u, v]);
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-9) continue;
    const s = ccw ? 1 : -1;
    const n: Pt = [(-s * (b[1] - a[1])) / len, (s * (b[0] - a[0])) / len];
    out = clipHalfPlane(out, n, n[0] * a[0] + n[1] * a[1] + d);
    if (out.length < 3) return [];
  }
  return out;
}

const area = (p: readonly Pt[]): number => Math.abs(ringSignedArea(p));

/** Deterministic 0…1 hash of a board (zone, piece, channel). */
export function boardHash(zone: number, piece: number, channel: number): number {
  let s = Math.imul(zone + 1, 73856093) ^ Math.imul(piece + 1, 19349663) ^ (channel * 83492791);
  s = Math.imul(s ^ (s >>> 15), 2246822507);
  s = Math.imul(s ^ (s >>> 13), 3266489909);
  return ((s ^ (s >>> 16)) >>> 0) / 4294967296;
}

/** Convex piece minus an axis-aligned rectangle → up to 4 convex pieces. */
function subtractRect(piece: Pt[], r: { u0: number; u1: number; v0: number; v1: number }): Pt[][] {
  const us = piece.map((p) => p[0]);
  const vs = piece.map((p) => p[1]);
  const eps = 1e-6;
  if (
    Math.max(...us) <= r.u0 + eps ||
    Math.min(...us) >= r.u1 - eps ||
    Math.max(...vs) <= r.v0 + eps ||
    Math.min(...vs) >= r.v1 - eps
  ) {
    return [piece];
  }
  const below = clipHalfPlane(piece, [0, -1], -r.v0);
  const above = clipHalfPlane(piece, [0, 1], r.v1);
  let band = clipHalfPlane(piece, [0, 1], r.v0);
  band = clipHalfPlane(band, [0, -1], -r.v1);
  const left = clipHalfPlane(band, [-1, 0], -r.u0);
  const right = clipHalfPlane(band, [1, 0], r.u1);
  return [below, above, left, right].filter((p) => p.length >= 3 && area(p) > 1e-5);
}

/** Joint positions of a zone across its boards, between `lo` and `hi`. */
export function boardJoints(zone: BoardZone, lo: number, hi: number): number[] {
  const min = zone.pitch * 0.3;
  const k0 = Math.ceil((lo - zone.anchor) / zone.pitch);
  const out = [lo];
  for (let k = k0; zone.anchor + k * zone.pitch < hi; k++) {
    const j = zone.anchor + k * zone.pitch;
    if (j > lo + min && j < hi - min) out.push(j);
  }
  out.push(hi);
  return out;
}

/** Board pieces (convex outlines in wall u, v) of one zone, cut around the openings. */
export function zoneBoards(
  zone: BoardZone,
  joint: number,
  holes: readonly { u0: number; u1: number; v0: number; v1: number }[],
): Pt[][] {
  const g = joint / 2;
  const field = insetConvex(zone.polygon, g);
  if (field.length < 3) return [];
  const across = zone.direction === 'vertical' ? 0 : 1;
  const vals = zone.polygon.map((p) => p[across]);
  const joints = boardJoints(zone, Math.min(...vals), Math.max(...vals));
  const n: Pt = across === 0 ? [1, 0] : [0, 1];
  const pieces: Pt[][] = [];
  for (let k = 0; k + 1 < joints.length; k++) {
    let strip = clipHalfPlane(field, n, joints[k]! + g);
    strip = clipHalfPlane(strip, [-n[0], -n[1]], -(joints[k + 1]! - g));
    if (strip.length < 3) continue;
    let parts = [strip];
    for (const h of holes) parts = parts.flatMap((p) => subtractRect(p, h));
    pieces.push(...parts);
  }
  return pieces;
}

/** Highest v of a convex polygon at u (its top edge). */
function topAt(poly: Polygon, u: number): number {
  let best = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const lo = Math.min(a[0], b[0]);
    const hi = Math.max(a[0], b[0]);
    if (u < lo - 1e-9 || u > hi + 1e-9) continue;
    const v =
      hi - lo < 1e-12 ? Math.max(a[1], b[1]) : a[1] + ((b[1] - a[1]) * (u - a[0])) / (b[0] - a[0]);
    best = Math.max(best, v);
  }
  return best;
}

/**
 * Draws the outside face of a clad wall at depth `wFace` (outward = `out`, ±1 along the
 * wall's left normal): metal outside the field, backing + boards inside it.
 */
export function buildCladdingFace(
  mesh: MeshBuilder,
  ws: WallSpace,
  wall: Wall,
  roof: Roof,
  clad: WoodCladding,
  metal: MaterialId,
  outline: readonly Pt[],
  holes: readonly Pt[][],
  wFace: number,
  out: 1 | -1,
): void {
  const facing: V3 = [ws.aw[0] * out, 0, ws.aw[2] * out];
  const toFace = (u: number, v: number): V3 => ws.p(u, v, wFace);
  const inField = (ring: Pt[]): boolean => {
    const cu = ring.reduce((s, p) => s + p[0], 0) / ring.length;
    const cv = ring.reduce((s, p) => s + p[1], 0) / ring.length;
    return pointInPolygon(cu, cv, clad.region);
  };
  const fieldHoles = holes.filter(inField);
  mesh.polygon(metal, outline, [clad.region, ...holes.filter((h) => !inField(h))], toFace, facing);
  mesh.polygon(clad.backing, clad.region, fieldHoles, toFace, facing);
  const rects = fieldHoles.map((h) => ({
    u0: Math.min(...h.map((p) => p[0])),
    u1: Math.max(...h.map((p) => p[0])),
    v0: Math.min(...h.map((p) => p[1])),
    v1: Math.max(...h.map((p) => p[1])),
  }));
  const [w0, w1] = out > 0 ? [wFace, wFace + clad.depth] : [wFace - clad.depth, wFace];
  const faces = out > 0 ? 'left' : 'right';
  // Each board shows one board of the realistic look's board texture (rows of
  // `BOARD_TEXTURE.boards` per tile, grain along u): its UVs are shifted so the board's
  // centre line falls on a texture board's centre, picked per board, at a random point
  // along the grain — no joints of the texture inside a board, no two boards alike.
  const axis = Math.abs(ws.ax[0]) > Math.abs(ws.ax[2]) ? 0 : 2;
  const { tileM, boards } = BOARD_TEXTURE;
  clad.zones.forEach((zone, zi) => {
    // Vertical boards: grain along the boards (texture UVs turned 90°).
    mesh.swapUv = zone.direction === 'vertical';
    zoneBoards(zone, clad.joint, rects).forEach((piece, pi) => {
      const us = piece.map((p) => p[0]);
      const vs = piece.map((p) => p[1]);
      const uc = (Math.min(...us) + Math.max(...us)) / 2;
      const vc = (Math.min(...vs) + Math.max(...vs)) / 2;
      const across = zone.direction === 'vertical' ? ws.p(uc, vc, 0)[axis] : ws.floorY + vc;
      const k = Math.floor(boardHash(zi, pi, 1) * boards);
      const target = ((k + 0.5) / boards) * tileM;
      const dv = (((target - across) % tileM) + tileM) % tileM;
      mesh.uvShift = [boardHash(zi, pi, 2) * tileM, dv];
      wallPrism(mesh, clad.material, ws, piece, w0, w1, { faces });
    });
    mesh.uvShift = null;
    mesh.swapUv = false;
  });
  // Seams on the metal rake band, from the wood field up to the roof sheet.
  const seams = clad.rakeSeams;
  const dirZ = wallFrame(wall).dir[1];
  if (!seams || Math.abs(dirZ) < 1e-9) return;
  const us = clad.region.map((p) => p[0]);
  const uMin = Math.min(...us);
  const uMax = Math.max(...us);
  const zOf = (u: number): number => wallPoint(wall, u)[1];
  const uRidge = (roof.ridgeZ - wall.from[1]) / dirZ;
  const roofV = (u: number): number => roofTopY(roof, zOf(u)) - ws.floorY;
  const hw = seams.width / 2;
  const [s0, s1] = out > 0 ? [wFace, wFace + seams.height] : [wFace - seams.height, wFace];
  for (let k = -Math.ceil(ws.length / seams.spacing); k * seams.spacing < ws.length; k++) {
    const uc = uRidge + k * seams.spacing;
    if (uc - hw < uMin || uc + hw > uMax) continue;
    const at = [uc - hw, ...(Math.abs(k) === 0 ? [uc] : []), uc + hw];
    const ring: Pt[] = [
      ...at.map((u): Pt => [u, topAt(clad.region, u) + clad.joint / 2]),
      ...[...at].reverse().map((u): Pt => [u, roofV(u)]),
    ];
    wallPrism(mesh, metal, ws, ring, s0, s1, { faces });
  }
}
