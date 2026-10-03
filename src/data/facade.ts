/**
 * West gable cladding (owner's up-to-date west facade, 2026-10): natural wood boards
 * framed by an anthracite (RAL 7016) metal border — 0.605 m strips along both side
 * edges and a band of the same width along both rakes, where the roof sheet wraps over
 * the gable edge (seams every ~0.66 m). The wood field therefore has the shape of the
 * east loggia opening: z 0.275…6.975, top = the loggia roof underside (+3.945 at the
 * sides, +6.756 at the apex). Boards are mostly vertical; two zones are horizontal:
 * lower north (from the north edge to the right edge of F-04, up to its head +2.48) and
 * upper south (from the left edge of F-09 and its sill +3.25 up into the gable). Joints
 * line up with the window edges (vertical pitch 0.24 m, horizontal 1.80 / 7 and 0.25 m),
 * board widths as measured on the facade image (≈ 0.25 m).
 */
import { roofSegment, roofUndersideY } from './geometry2d';
import { SHELL } from './grid';
import { roof } from './roof';
import type { BoardZone, Polygon, Vec2, WoodCladding } from './schema';

/** `ext-w` runs from z = −0.125 (north) to 7.375: wall u = z + 0.125. */
const U0 = -0.125;
const u = (z: number): number => z - U0;
/** Just above the wall base (plinth −0.30): the boards run down behind the gravel strip. */
const BASE = -0.29;

/** Width of the metal border = the loggia side walls (z −0.33…0.275 / 6.975…7.58). */
export const WEST_BORDER = 0.605;
const zN = SHELL.north + WEST_BORDER; // 0.275
const zS = SHELL.south - WEST_BORDER; // 6.975
const zR = roof.ridgeZ; // 3.625

/** Top of the wood field at plan depth z (parallel to the rakes, 0.605 m inside). */
export const westWoodTop = (z: number): number =>
  roofUndersideY(roof, roofSegment(roof, 'loggia'), z);

const field = (z0: number, z1: number, v0: number, v1?: number): Polygon => {
  // Convex polygon: rectangle z0…z1 × v0…v1 cut by the rake line (apex inside if spanned).
  const pts: Vec2[] = [
    [u(z0), v0],
    [u(z1), v0],
  ];
  const top = (z: number): number => (v1 === undefined ? westWoodTop(z) : v1);
  pts.push([u(z1), top(z1)]);
  if (v1 === undefined && z0 < zR && z1 > zR) pts.push([u(zR), top(zR)]);
  pts.push([u(z0), top(z0)]);
  return pts;
};

// Window edges (sheet 05/06 west chains, see ground.ts): F-04 z 1.325…3.125, head
// +2.48; F-08 z 1.925…3.125; F-09 z 4.325…5.825, sill +3.25.
const F04_END = 3.125;
const F04_HEAD = 2.48;
const F09_START = 4.325;
const F09_SILL = 3.25;

const vertical = (polygon: Polygon): BoardZone => ({
  polygon,
  direction: 'vertical',
  pitch: 0.24,
  anchor: u(F04_END),
});

export const WEST_CLADDING: WoodCladding = {
  region: field(zN, zS, BASE),
  zones: [
    // Lower north: horizontal boards, 7 over the height of F-04 (0.257 m).
    {
      polygon: field(zN, F04_END, BASE, F04_HEAD),
      direction: 'horizontal',
      pitch: 1.8 / 7,
      anchor: F04_HEAD,
    },
    vertical(field(zN, F04_END, F04_HEAD)),
    vertical(field(F04_END, F09_START, BASE)),
    vertical(field(F09_START, zS, BASE, F09_SILL)),
    // Upper south: horizontal boards around F-09, 6 over its height (0.25 m).
    {
      polygon: field(F09_START, zS, F09_SILL),
      direction: 'horizontal',
      pitch: 0.25,
      anchor: F09_SILL,
    },
  ],
  material: 'cladWood',
  backing: 'metalBlack',
  joint: 0.012,
  depth: 0.012,
  rakeSeams: { spacing: 0.66, width: 0.025, height: 0.01 },
};
