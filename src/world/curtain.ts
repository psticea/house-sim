/**
 * Curtain wall (aluminium RAL 1011, triple glazing): mullions, opaque transom band,
 * glass panes following the sloped top, glazed door leaf.
 */
import type { Opening, Roof, Vec2, Wall } from '../data/schema';
import { wallTopAt, wallTopProfile } from '../data/geometry2d';
import type { MeshBuilder } from './meshBuilder';
import { buildOpening } from './openings';
import { addWallCollider } from './walls';
import { wallSpace } from './wallSpace';

const MULLION = 0.05;
const DEPTH = 0.12;

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
  const L = ws.length;
  const mullions = wall.curtain?.mullions ?? [];
  const band = wall.curtain?.band;
  const doors = openings.filter((o) => o.kind === 'door');
  const top = (u: number): number => wallTopAt(profile, u);
  const box = (u0: number, u1: number, v0: number, v1: number, depth = DEPTH): void =>
    mesh.orientedBox('frame', ws.p((u0 + u1) / 2, (v0 + v1) / 2, 0), ws.ax, [0, 1, 0], ws.aw, [
      (u1 - u0) / 2,
      (v1 - v0) / 2,
      depth / 2,
    ]);

  const first = (mullions[0] ?? 0) + MULLION / 2;
  const last = (mullions[mullions.length - 1] ?? L) - MULLION / 2;
  // Solid end frames (behind the loggia side walls) and mullions.
  box(0, first, 0, Math.min(top(0), top(first)), ws.thickness);
  box(last, L, 0, Math.min(top(last), top(L)), ws.thickness);
  for (const m of mullions.slice(1, -1)) box(m - MULLION / 2, m + MULLION / 2, 0, top(m));
  if (band) box(first, last, band[0], band[1]);

  const bays: [number, number][] = [];
  for (let i = 0; i + 1 < mullions.length; i++) {
    bays.push([mullions[i]! + MULLION / 2, mullions[i + 1]! - MULLION / 2]);
  }
  const bandTop = band ? band[1] : 0;
  for (const [a, b] of bays) {
    const isDoor = doors.some((d) => d.offset < b - 1e-3 && d.offset + d.width > a + 1e-3);
    if (!isDoor) {
      box(a, b, 0, 0.06);
      if (band) {
        mesh.quad(
          'glass',
          ws.p(a, 0.06, 0),
          ws.p(b, 0.06, 0),
          ws.p(b, band[0], 0),
          ws.p(a, band[0], 0),
          ws.aw,
        );
      }
    }
    // Upper pane: follows the sloped roof underside.
    const ring: Vec2[] = [
      [a, bandTop],
      [b, bandTop],
      [b, top(b)],
    ];
    for (let i = profile.length - 1; i >= 0; i--) {
      const [u, v] = profile[i]!;
      if (u > a + 1e-6 && u < b - 1e-6) ring.push([u, v]);
    }
    ring.push([a, top(a)]);
    mesh.polygon('glass', ring, [], (u, v) => ws.p(u, v, 0), ws.aw);
  }
  for (const d of doors) buildOpening(mesh, collider, ws, d);
  // Door threshold across the frame depth.
  for (const d of doors) {
    mesh.orientedBox('oak', ws.p(d.offset + d.width / 2, -0.025, 0), ws.ax, [0, 1, 0], ws.aw, [
      d.width / 2,
      0.025,
      ws.thickness / 2,
    ]);
  }
  addWallCollider(collider, ws, openings, profile);
}
