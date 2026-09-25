/**
 * Structural grid and reference levels.
 *
 * Axis positions measured on the vector geometry of sheet 05 (ground floor, 1:50,
 * 1 m = 56.693 pt): the red dash-dot axis lines sit at x = 184.165 / 453.455 / 722.75 /
 * 861.65 / 1068.58 / 1210.305 pt and z = 258.745 / 471.345 / 669.765 pt, i.e. exactly
 * the dimension chain 4.75 | 4.75 | 2.45 | 3.65 | 2.50 and 3.75 | 3.50.
 * Sheets 04, 06 and 07 use the same grid (checked the same way).
 */

export const GRID_X = {
  '1': 0,
  '2': 4.75,
  '3': 9.5,
  '4': 11.95,
  '5': 15.6,
  '6': 18.1,
} as const;

export const GRID_Z = {
  A: 0,
  B: 3.75,
  C: 7.25,
} as const;

/**
 * Finished faces of the building shell (sheet 05 wall polygons):
 * exterior wall = 25 cm brick centred on the axis + 15 cm mineral wool + ~5.5 cm
 * battens/cladding ⇒ outer face 0.33 m outside the axis (the "33" in the chains),
 * inner face 0.125 m inside. Total exterior wall thickness 0.455 m.
 */
export const SHELL = {
  west: -0.33,
  east: 18.38,
  north: -0.33,
  south: 7.58,
  /** Inner faces of the exterior walls. */
  innerWest: 0.125,
  innerNorth: 0.125,
  innerSouth: 7.125,
  /** Brick outer face (insulation starts here). */
  brickOut: 0.125,
  exteriorWall: 0.455,
  claddingLayer: 0.205,
  brickLayer: 0.25,
} as const;

/** Outer dimensions quoted on sheets 05/06/07/09/10. */
export const OUTER_DIMENSIONS = { length: 18.71, depth: 7.91 } as const;

/** Levels (sheets 04–06, sections, elevations 08–10). */
export const LEVELS = {
  /** ±0.00 = 261.98 m above sea level. */
  absoluteZero: 261.98,
  basementFloor: -2.53,
  groundFloor: 0,
  /** Exterior ground next to the house (CTA = −0.05 on sheet 05). */
  exteriorGround: -0.05,
  /** "H: 2.68 m" in every ground-floor room label. */
  groundCeiling: 2.68,
  /** Upper floor finished level (+2.95 on sheet 06). */
  upperFloor: 2.95,
  /** Knee wall 1.00 m above the upper floor ⇒ roof underside meets the walls at 3.95. */
  kneeWallTop: 3.95,
  /** Elevations 08–10: eaves +4.23 at the facade face. */
  eave: 4.23,
  /** Elevation 08 (+7.50) / 09 (+7.54 incl. ridge cap). */
  ridge: 7.5,
  chimneyTop: 7.9,
  /** Entrance canopy +2.56 … +2.89 (elevations 08/09, roof plan +2.90). */
  canopyBottom: 2.56,
  canopyTop: 2.89,
  /** South sunshade +2.50 … +2.73 (elevation 10: "+2.73", "23"). */
  sunshadeBottom: 2.5,
  sunshadeTop: 2.73,
} as const;

export const ROOF_PITCH_DEG = 40;
export const ROOF_SLOPE = Math.tan((ROOF_PITCH_DEG * Math.PI) / 180);
