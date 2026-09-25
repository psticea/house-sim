/** Local wall frame helpers shared by the wall / opening builders. */
import type { Wall } from '../data/schema';
import { wallFrame, wallThickness } from '../data/geometry2d';
import type { V3 } from './meshBuilder';

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
