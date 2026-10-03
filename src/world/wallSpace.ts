/** Local wall frame helpers shared by the wall / opening builders. */
import type { MaterialId, Vec2, Wall } from '../data/schema';
import { wallFrame, wallThickness } from '../data/geometry2d';
import type { MeshBuilder, V3 } from './meshBuilder';
import { ringSignedArea } from './meshBuilder';

export interface WallSpace {
  wall: Wall;
  length: number;
  thickness: number;
  floorY: number;
  /** u axis (along the wall), w axis (left normal) — horizontal unit vectors. */
  ax: V3;
  aw: V3;
  /** World point for (u along, v above level floor, w toward the left face). */
  p(u: number, v: number, w: number): V3;
  /** Horizontal world direction for a local (u, w) direction. */
  dirOf(du: number, dw: number): V3;
  /** Side of the wall that faces the outside (exterior walls), or null. */
  outside: 'left' | 'right' | null;
  /** Depth (w) of the plane between the first two layers (window frame plane). */
  interfaceW: number;
}

export const OUTSIDE_MATERIALS = new Set(['cladMetal', 'cladWood']);

export function wallSpace(wall: Wall, floorY: number): WallSpace {
  const { dir, left, length } = wallFrame(wall);
  const thickness = wallThickness(wall);
  const [fx, fz] = wall.from;
  let outside: 'left' | 'right' | null = null;
  if (wall.kind === 'exterior' && wall.layers.length > 1) {
    outside = wall.layers[0]!.material === 'cladMetal' ? 'left' : 'right';
  }
  const interfaceW = wall.layers.length > 1 ? thickness / 2 - wall.layers[0]!.thickness : 0;
  return {
    wall,
    length,
    thickness,
    floorY,
    ax: [dir[0], 0, dir[1]],
    aw: [left[0], 0, left[1]],
    outside,
    interfaceW,
    p: (u, v, w) => [fx + dir[0] * u + left[0] * w, floorY + v, fz + dir[1] * u + left[1] * w],
    dirOf: (du, dw) => [dir[0] * du + left[0] * dw, 0, dir[1] * du + left[1] * dw],
  };
}

/**
 * Prism in a wall's plane: `outline` (u, v) extruded between the depths w0 < w1 (w toward
 * the wall's left face). `faces` picks the flat faces to draw (both by default); `side`
 * filters the edge faces by edge index.
 */
export function wallPrism(
  mesh: MeshBuilder,
  mat: MaterialId,
  ws: WallSpace,
  outline: readonly Vec2[],
  w0: number,
  w1: number,
  opts: { faces?: 'both' | 'left' | 'right'; side?: (i: number) => boolean } = {},
): void {
  const faces = opts.faces ?? 'both';
  const rightN: V3 = [-ws.aw[0], 0, -ws.aw[2]];
  if (faces !== 'right') mesh.polygon(mat, outline, [], (u, v) => ws.p(u, v, w1), ws.aw);
  if (faces !== 'left') mesh.polygon(mat, outline, [], (u, v) => ws.p(u, v, w0), rightN);
  const ccw = ringSignedArea(outline) > 0;
  for (let i = 0; i < outline.length; i++) {
    if (opts.side && !opts.side(i)) continue;
    const a = outline[i]!;
    const b = outline[(i + 1) % outline.length]!;
    const du = b[0] - a[0];
    const dv = b[1] - a[1];
    const len = Math.hypot(du, dv);
    if (len < 1e-9) continue;
    // Outward normal of the outline in (u, v).
    const s = ccw ? 1 : -1;
    const nu = (s * dv) / len;
    const nv = (-s * du) / len;
    const facing: V3 = [ws.ax[0] * nu, nv, ws.ax[2] * nu];
    mesh.quad(
      mat,
      ws.p(a[0], a[1], w0),
      ws.p(b[0], b[1], w0),
      ws.p(b[0], b[1], w1),
      ws.p(a[0], a[1], w1),
      facing,
    );
  }
}
