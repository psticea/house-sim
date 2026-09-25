/**
 * Walls: each layer of the build-up is the wall's elevation outline (rectangle or
 * gable, with notches for openings that start at the wall base and rectangular holes
 * for the others) extruded across the layer depth. Hole edges become reveals.
 */
import type { MaterialId, Opening, Roof, Vec2, Wall } from '../data/schema';
import { isPassable, wallTopAt, wallTopProfile } from '../data/geometry2d';
import type { MeshBuilder, V3 } from './meshBuilder';
import { wallSpace, type WallSpace } from './wallSpace';

const EPS = 1e-6;

type Pt = [number, number];

/** Remove duplicate and collinear points (including back-tracking spikes). */
export function cleanRing(ring: Pt[]): Pt[] {
  let pts = ring.slice();
  let changed = true;
  while (changed && pts.length > 3) {
    changed = false;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[(i - 1 + pts.length) % pts.length]!;
      const b = pts[i]!;
      const c = pts[(i + 1) % pts.length]!;
      const dup = Math.hypot(b[0] - a[0], b[1] - a[1]) < EPS;
      const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      if (dup || Math.abs(cross) < 1e-9) {
        pts = pts.filter((_, k) => k !== i);
        changed = true;
        break;
      }
    }
  }
  return pts;
}

export interface WallOutline {
  outline: Pt[];
  holes: { opening: Opening; ring: Pt[] }[];
}

/** Elevation outline (u, v) of one layer spanning u ∈ [ua, ub]. */
export function wallOutline(
  wall: Wall,
  openings: readonly Opening[],
  profile: readonly Vec2[],
  ua: number,
  ub: number,
): WallOutline {
  const base = wall.base ?? 0;
  const notches = openings.filter((o) => o.sill <= base + EPS).sort((a, b) => a.offset - b.offset);
  const pts: Pt[] = [[ua, base]];
  for (const o of notches) {
    const n0 = Math.max(ua, o.offset);
    const n1 = Math.min(ub, o.offset + o.width);
    if (n1 <= n0) continue;
    const h = o.sill + o.height;
    pts.push([n0, base], [n0, h], [n1, h], [n1, base]);
  }
  pts.push([ub, base], [ub, wallTopAt(profile, ub)]);
  for (let i = profile.length - 1; i >= 0; i--) {
    const [u, v] = profile[i]!;
    if (u > ua + EPS && u < ub - EPS) pts.push([u, v]);
  }
  pts.push([ua, wallTopAt(profile, ua)]);
  const holes = openings
    .filter((o) => o.sill > base + EPS)
    .map((o) => ({
      opening: o,
      ring: [
        [o.offset, o.sill],
        [o.offset + o.width, o.sill],
        [o.offset + o.width, o.sill + o.height],
        [o.offset, o.sill + o.height],
      ] as Pt[],
    }));
  return { outline: cleanRing(pts), holes };
}

export interface WallBuildContext {
  mesh: MeshBuilder;
  collider: MeshBuilder;
  roof: Roof;
}

function sillMaterial(o: Opening, fallback: MaterialId, interior: boolean): MaterialId {
  if (o.sill > 0.01) return fallback;
  if (o.kind === 'window') return 'frame';
  return interior ? 'oak' : 'stone';
}

/** Solid layers of a (non-curtain) wall + its collider. */
export function buildWall(
  ctx: WallBuildContext,
  wall: Wall,
  openings: readonly Opening[],
  floorY: number,
): WallSpace {
  const ws = wallSpace(wall, floorY);
  const profile = wallTopProfile(wall, ctx.roof, floorY);
  if (wall.kind !== 'curtain') {
    let depth = 0;
    wall.layers.forEach((layer, li) => {
      const wLeft = ws.thickness / 2 - depth;
      const wRight = wLeft - layer.thickness;
      depth += layer.thickness;
      const ua = layer.trimStart ?? 0;
      const ub = ws.length - (layer.trimEnd ?? 0);
      const { outline, holes } = wallOutline(wall, openings, profile, ua, ub);
      const holeRings = holes.map((h) => h.ring);
      const leftN: V3 = ws.aw;
      const rightN: V3 = [-ws.aw[0], 0, -ws.aw[2]];
      if (li === 0) {
        ctx.mesh.polygon(layer.material, outline, holeRings, (u, v) => ws.p(u, v, wLeft), leftN);
      }
      if (li === wall.layers.length - 1) {
        ctx.mesh.polygon(layer.material, outline, holeRings, (u, v) => ws.p(u, v, wRight), rightN);
      }
      const edges = (ring: Pt[], isHole: boolean, opening?: Opening): void => {
        for (let i = 0; i < ring.length; i++) {
          const a = ring[i]!;
          const b = ring[(i + 1) % ring.length]!;
          const du = b[0] - a[0];
          const dv = b[1] - a[1];
          const len = Math.hypot(du, dv);
          if (len < EPS) continue;
          let nu = dv / len;
          let nv = -du / len;
          if (isHole) {
            nu = -nu;
            nv = -nv;
          }
          if (nv < -0.99 && !isHole) continue; // bottom of the wall: never visible
          const facing: V3 = [ws.ax[0] * nu, nv, ws.ax[2] * nu];
          let mat: MaterialId = layer.material;
          if (opening && nv > 0.99) {
            mat = sillMaterial(opening, layer.material, wall.kind === 'interior');
          }
          ctx.mesh.quad(
            mat,
            ws.p(a[0], a[1], wLeft),
            ws.p(b[0], b[1], wLeft),
            ws.p(b[0], b[1], wRight),
            ws.p(a[0], a[1], wRight),
            facing,
          );
        }
      };
      edges(outline, false);
      for (const h of holes) edges(h.ring, true, h.opening);
    });
    addThresholds(ctx, ws, openings);
  }
  addWallCollider(ctx.collider, ws, openings, profile);
  return ws;
}

/** Floor strips across the wall under openings that start at the floor (base-0 walls). */
function addThresholds(ctx: WallBuildContext, ws: WallSpace, openings: readonly Opening[]): void {
  const base = ws.wall.base ?? 0;
  if (base < -EPS) return; // exterior walls: the hole's bottom reveal is the threshold
  for (const o of openings) {
    if (o.sill > EPS) continue;
    const t = ws.thickness / 2;
    const top = 0;
    const bottom = -0.05;
    const c = ws.p(o.offset + o.width / 2, (top + bottom) / 2, 0);
    ctx.mesh.orientedBox(o.kind === 'window' ? 'frame' : 'oak', c, ws.ax, [0, 1, 0], ws.aw, [
      o.width / 2,
      (top - bottom) / 2,
      t,
    ]);
  }
}

/** Collision boxes (player height range only): wall minus passable openings. */
export function addWallCollider(
  collider: MeshBuilder,
  ws: WallSpace,
  openings: readonly Opening[],
  profile: readonly Vec2[],
): void {
  const CAP = 3.2; // nothing above this matters for a walking player (no jumping)
  const base = Math.max(ws.wall.base ?? 0, -0.1);
  const minTop = Math.min(...profile.map((p) => p[1]));
  const top = Math.min(minTop, CAP);
  if (top <= base) return;
  const passable = openings
    .filter(isPassable)
    .map((o) => {
      if (o.kind === 'sliding') {
        // Lift-and-slide: only the western/starting half is open (moving panel parked
        // behind the fixed one).
        return { o, u0: o.offset, u1: o.offset + o.width / 2 - 0.03 };
      }
      return { o, u0: o.offset, u1: o.offset + o.width };
    })
    .sort((a, b) => a.u0 - b.u0);
  const t = ws.thickness / 2;
  const addBox = (u0: number, u1: number, v0: number, v1: number): void => {
    if (u1 - u0 < 1e-4 || v1 - v0 < 1e-4) return;
    collider.orientedBox(
      'concrete',
      ws.p((u0 + u1) / 2, (v0 + v1) / 2, 0),
      ws.ax,
      [0, 1, 0],
      ws.aw,
      [(u1 - u0) / 2, (v1 - v0) / 2, t],
    );
  };
  let u = 0;
  for (const { o, u0, u1 } of passable) {
    addBox(u, u0, base, top);
    const head = o.sill + o.height;
    if (head < top) addBox(u0, u1, head, top);
    if (o.sill > base) addBox(u0, u1, base, o.sill);
    u = u1;
  }
  addBox(u, ws.length, base, top);
}
