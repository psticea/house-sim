/**
 * Terrain (plan.md §5.5, I3 step 3.1). Site plan sheet 03: spot heights of the existing
 * ground 261.70–261.91 m, i.e. 0.07–0.28 m below ±0.00 (= 261.98 m); the finished ground
 * next to the house is −0.05 (CTA, sheet 05) — the paving is flush with it, the lawn a
 * few cm lower.
 *
 * Design surface: natural ground = inverse-distance interpolation of the spot heights;
 * next to the house (and the deck / light well) it is raised to the house base and
 * blends to the natural ground over 1–8 m (slopes < 4 %); outside the lot it fades to the flat context
 * ground (`FIELD_Y`) within 5.5 m. The surface is then sampled on a 1 m grid split into
 * triangles: `heightAt` interpolates exactly the triangles the lawn mesh is made of, so
 * paving draped on it (`top = heightAt + drape`) never intersects the lawn.
 */
import { distToRect, distToSegment, smoothstep } from './clip';
import { pointInPolygon } from './geometry2d';
import { LEVELS, SHELL } from './grid';
import type { Vec2 } from './schema';
import { LOT } from './site';

/** Spot heights read on sheet 03 (point = end of each label's leader line), m a.s.l. */
export const SPOT_HEIGHTS: readonly { id: string; x: number; z: number; abs: number }[] = [
  { id: '27', x: -0.91, z: 2.68, abs: 261.78 },
  { id: '28', x: 7.67, z: 2.17, abs: 261.79 },
  { id: '29', x: 17.95, z: 1.93, abs: 261.83 },
  { id: '39', x: -1.64, z: 8.62, abs: 261.76 },
  { id: '38', x: 7.23, z: 8.59, abs: 261.73 },
  { id: '37', x: 16.61, z: 8.45, abs: 261.73 },
  { id: '26', x: 20.14, z: 7.33, abs: 261.74 },
  { id: '25', x: 20.88, z: -0.18, abs: 261.82 },
  { id: '40', x: 20.28, z: 12.76, abs: 261.72 },
  // Unnumbered heights on the lot line (north edge, south-east corner) and outside it.
  { id: 'n-west', x: -0.5, z: -2.56, abs: 261.8 },
  { id: 'n-east', x: 18.5, z: -2.56, abs: 261.91 },
  { id: '10', x: 25.64, z: -2.56, abs: 261.81 },
  { id: 'se', x: 25.04, z: 14.53, abs: 261.81 },
  { id: '42', x: 25.95, z: 17.83, abs: 261.83 },
  { id: '11', x: 20.35, z: -7.46, abs: 261.7 },
];

/** Lawn next to the house (the paving on top of it is at the CTA −0.05). */
export const HOUSE_GROUND_Y = LEVELS.exteriorGround - 0.04;
/** Flat context ground beyond the lot surroundings. */
export const FIELD_Y = -0.25;

/** Rectangles the finished ground is raised to the house base around. */
const HOUSE_BASE: readonly (readonly [Vec2, Vec2])[] = [
  [
    [SHELL.west, SHELL.north],
    [SHELL.east, SHELL.south],
  ],
  // Deck (terrace strips) and the light well.
  [
    [9.375, -0.27],
    [19.776, 9.025],
  ],
  [
    [7.175, 7.58],
    [9.525, 8.175],
  ],
];

export function naturalHeight(x: number, z: number): number {
  let wsum = 0;
  let hsum = 0;
  for (const s of SPOT_HEIGHTS) {
    const w = 1 / ((x - s.x) ** 2 + (z - s.z) ** 2 + 0.5);
    wsum += w;
    hsum += w * (s.abs - LEVELS.absoluteZero);
  }
  return hsum / wsum;
}

function distanceOutsideLot(x: number, z: number): number {
  if (pointInPolygon(x, z, LOT)) return 0;
  let d = Infinity;
  for (let i = 0; i < LOT.length; i++)
    d = Math.min(d, distToSegment(x, z, LOT[i]!, LOT[(i + 1) % LOT.length]!));
  return d;
}

/** The smooth design surface (before sampling on the grid). */
export function designHeight(x: number, z: number): number {
  let d = Infinity;
  for (const [min, max] of HOUSE_BASE) d = Math.min(d, distToRect(x, z, min, max));
  const inLot = HOUSE_GROUND_Y + (naturalHeight(x, z) - HOUSE_GROUND_Y) * smoothstep(1, 8, d);
  return inLot + (FIELD_Y - inLot) * smoothstep(0, 5.5, distanceOutsideLot(x, z));
}

/** Regular grid of design heights; each cell is split along its (x0, z1)–(x1, z0) diagonal. */
export class TerrainGrid {
  readonly nx: number;
  readonly nz: number;
  readonly heights: Float64Array;

  constructor(
    readonly x0: number,
    readonly z0: number,
    readonly x1: number,
    readonly z1: number,
    readonly step: number,
    height: (x: number, z: number) => number,
  ) {
    this.nx = Math.round((x1 - x0) / step);
    this.nz = Math.round((z1 - z0) / step);
    this.heights = new Float64Array((this.nx + 1) * (this.nz + 1));
    for (let j = 0; j <= this.nz; j++) {
      for (let i = 0; i <= this.nx; i++) {
        this.heights[j * (this.nx + 1) + i] = height(x0 + i * step, z0 + j * step);
      }
    }
  }

  node(i: number, j: number): [number, number, number] {
    const ci = Math.max(0, Math.min(this.nx, i));
    const cj = Math.max(0, Math.min(this.nz, j));
    return [
      this.x0 + ci * this.step,
      this.heights[cj * (this.nx + 1) + ci]!,
      this.z0 + cj * this.step,
    ];
  }

  /** The two triangles of cell (i, j), each as three [x, y, z] corners. */
  cellTriangles(i: number, j: number): [[number, number, number][], [number, number, number][]] {
    const a = this.node(i, j);
    const b = this.node(i + 1, j);
    const c = this.node(i, j + 1);
    const d = this.node(i + 1, j + 1);
    return [
      [a, b, c],
      [d, c, b],
    ];
  }

  /** Height of the triangulated surface (clamped to the grid outside it). */
  heightAt(x: number, z: number): number {
    const fx = (x - this.x0) / this.step;
    const fz = (z - this.z0) / this.step;
    const i = Math.max(0, Math.min(this.nx - 1, Math.floor(fx)));
    const j = Math.max(0, Math.min(this.nz - 1, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i));
    const v = Math.max(0, Math.min(1, fz - j));
    const h = (ii: number, jj: number): number => this.heights[jj * (this.nx + 1) + ii]!;
    if (u + v <= 1) {
      const h00 = h(i, j);
      return h00 + (h(i + 1, j) - h00) * u + (h(i, j + 1) - h00) * v;
    }
    const h11 = h(i + 1, j + 1);
    return h11 + (h(i, j + 1) - h11) * (1 - u) + (h(i + 1, j) - h11) * (1 - v);
  }
}

/** Grid covering the lot plus ≥ 5.5 m around it (edges at `FIELD_Y`). */
export const TERRAIN = new TerrainGrid(-15, -9, 32, 21, 1, designHeight);

export const terrainHeight = (x: number, z: number): number => TERRAIN.heightAt(x, z);
