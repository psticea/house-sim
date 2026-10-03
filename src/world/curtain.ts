/**
 * Curtain wall (aluminium RAL 7016 profiles, triple glazing): a grid of 50 mm mullions
 * and transoms (`Wall.curtain`), perimeter frame following the sloped top, glass panes,
 * the door frame + glazed leaf, solid end frames behind the side walls.
 */
import type { Opening, Roof, Vec2, Wall } from '../data/schema';
import { curtainLines, wallTopAt, wallTopProfile } from '../data/geometry2d';
import type { MeshBuilder } from './meshBuilder';
import { buildOpening } from './openings';
import { addWallCollider } from './walls';
import { wallPrism, wallSpace } from './wallSpace';

/** Depth of the mullions / transoms (the glass sits on their centre plane). */
const DEPTH = 0.12;
/** Door-frame profile inside the door column. */
const DOOR_FRAME = 0.05;

export function buildCurtainWall(
  mesh: MeshBuilder,
  collider: MeshBuilder,
  roof: Roof,
  wall: Wall,
  openings: readonly Opening[],
  floorY: number,
): void {
  const ws = wallSpace(wall, floorY);
  const profile = wallTopProfile(wall, roof, floorY);
  const c = wall.curtain;
  if (!c) throw new Error(`curtain wall ${wall.id} has no grid`);
  const L = ws.length;
  const P = c.profile;
  const lines = curtainLines(c);
  const uA = lines[0]!;
  const uB = lines[lines.length - 1]!;
  const doors = openings.filter((o) => o.kind === 'door');
  const top = (u: number): number => wallTopAt(profile, u);
  // Vertical height of the sloped head profile (P measured perpendicular to the slope).
  const slope = Math.tan((roof.pitchDeg * Math.PI) / 180);
  const headH = P * Math.sqrt(1 + slope * slope);

  /** Top line a → b (v lowered by `drop`): [b, top(b)], profile kinks…, [a, top(a)]. */
  const topLine = (a: number, b: number, drop = 0): Vec2[] => {
    const pts: Vec2[] = [[b, top(b) - drop]];
    for (let i = profile.length - 1; i >= 0; i--) {
      const [u, v] = profile[i]!;
      if (u > a + 1e-6 && u < b - 1e-6) pts.push([u, v - drop]);
    }
    pts.push([a, top(a) - drop]);
    return pts;
  };
  /** Outline a…b from v = bottom up to the top line lowered by `drop`. */
  const toTop = (a: number, b: number, bottom: number, drop = 0): Vec2[] => [
    [a, bottom],
    [b, bottom],
    ...topLine(a, b, drop),
  ];
  const rect = (a: number, b: number, v0: number, v1: number): Vec2[] => [
    [a, v0],
    [b, v0],
    [b, v1],
    [a, v1],
  ];
  const bar = (outline: Vec2[], depth = DEPTH): void =>
    wallPrism(mesh, 'frame', ws, outline, -depth / 2, depth / 2);

  // Solid end frames behind the side walls (full wall thickness).
  if (uA > 1e-6) bar(toTop(0, uA, 0), ws.thickness);
  if (uB < L - 1e-6) bar(toTop(uB, L, 0), ws.thickness);
  // Vertical profiles: perimeter frame at both edges, mullions on the inner grid lines.
  bar(toTop(uA, uA + P, 0));
  bar(toTop(uB - P, uB, 0));
  for (const m of lines.slice(1, -1)) bar(toTop(m - P / 2, m + P / 2, 0));

  const transoms = [...c.transoms].sort((x, y) => x - y);
  for (let i = 0; i + 1 < lines.length; i++) {
    const a = i === 0 ? uA + P : lines[i]! + P / 2;
    const b = i + 2 === lines.length ? uB - P : lines[i + 1]! - P / 2;
    const isDoor = doors.some((d) => d.offset < b - 1e-3 && d.offset + d.width > a + 1e-3);
    // Bottom rail (not under the door), transoms, sloped head profile.
    if (!isDoor) bar(rect(a, b, 0, P));
    for (const t of transoms) bar(rect(a, b, t - P / 2, t + P / 2));
    bar([...topLine(a, b, headH).reverse(), ...topLine(a, b)]);
    // Glass panes between the bars (the lowest field of the door column is the door).
    const bottoms = [isDoor ? null : P, ...transoms.map((t) => t + P / 2)];
    const tops = [...transoms.map((t) => t - P / 2), null];
    for (let k = 0; k < bottoms.length; k++) {
      const lo = bottoms[k];
      if (lo === null || lo === undefined) continue;
      const hi = tops[k];
      const ring = hi === null || hi === undefined ? toTop(a, b, lo, headH) : rect(a, b, lo, hi);
      mesh.polygon('glass', ring, [], (u, v) => ws.p(u, v, 0), ws.aw);
    }
  }

  for (const d of doors) {
    // Door frame (jambs + head) inside the opening, then the leaf.
    const o0 = d.offset;
    const o1 = d.offset + d.width;
    const h = d.sill + d.height;
    bar(rect(o0, o0 + DOOR_FRAME, d.sill, h));
    bar(rect(o1 - DOOR_FRAME, o1, d.sill, h));
    bar(rect(o0 + DOOR_FRAME, o1 - DOOR_FRAME, h - DOOR_FRAME, h));
    buildOpening(mesh, collider, ws, d);
    // Threshold across the frame depth.
    mesh.orientedBox('oak', ws.p(o0 + d.width / 2, -0.025, 0), ws.ax, [0, 1, 0], ws.aw, [
      d.width / 2,
      0.025,
      ws.thickness / 2,
    ]);
  }
  addWallCollider(collider, ws, openings, profile);
}
