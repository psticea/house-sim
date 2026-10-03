/**
 * Ceiling lights (I6 redo, plan.md §4.1): simple fittings in the style of The Local
 * Project — opal flush drums with a brushed-brass band on flat ceilings,
 * paper / linen globes on a brass rose and black cord under the sloped roof — placed
 * where daylight is not enough. Pure data (no three.js): the furniture builder makes the
 * geometry (merged into the existing `ceramic` / `linen` / `brass` / `metalBlack`
 * meshes, no new draw calls) and the lightmap baker turns the fittings that are `on`
 * into area lights (soft direct light + bounces) and their diffusers into glowing
 * texels. Fittings that are off are just furniture. None of them is on the plans
 * ("extra").
 */
import { roofSegment, roofUndersideY } from './geometry2d';
import { LEVELS } from './grid';
import { roof } from './roof';
import type { LevelId, Vec2 } from './schema';

export type LightKind = 'flush' | 'pendant';

export interface CeilingLight {
  id: string;
  kind: LightKind;
  level: LevelId;
  room: string;
  /** Plan position (x, z) of the fitting's axis. */
  at: Vec2;
  /** World height of the ceiling at the fitting (where it is fixed). */
  ceilingY: number;
  /** Radius of the diffuser (flush: the glowing opal drum; pendant: the globe). */
  radius: number;
  /** Pendant only: world height of the globe's centre. */
  centerY?: number;
  /** Switched on in the baked daytime scene (dim or windowless spaces). */
  on: boolean;
  /** Radiance of the diffuser (linear, baker units: the sun gives ~3.4 irradiance). */
  radiance: number;
  source: string;
}

/** Warm-white LED (~3300 K, linear RGB, luminance ≈ 1 · radiance). */
export const LAMP_COLOR: readonly [number, number, number] = [1.1, 0.97, 0.82];

/** Flush drum: height below the ceiling, brass band at the top (the rest is opal and glows). */
export const FLUSH = { height: 0.085, band: 0.012 };

/** Pendant globe: cord to the ceiling rose. */
export const PENDANT = { roseRadius: 0.05, roseHeight: 0.025 };

const G = LEVELS.groundFloor + LEVELS.groundCeiling;
/** Underside of the ground-floor structure over the basement (storage H 2.24). */
const B = LEVELS.basementFloor + 2.24;
const upperRoof = (z: number): number => roofUndersideY(roof, roofSegment(roof, 'upper'), z);

const flush = (
  id: string,
  level: LevelId,
  room: string,
  at: Vec2,
  ceilingY: number,
  on: boolean,
  source: string,
  radius = 0.15,
): CeilingLight => ({
  id,
  kind: 'flush',
  level,
  room,
  at,
  ceilingY,
  radius,
  on,
  radiance: 6,
  source,
});

const pendant = (
  id: string,
  room: string,
  at: Vec2,
  hang: number,
  on: boolean,
  source: string,
): CeilingLight => ({
  id,
  kind: 'pendant',
  level: 'upper',
  room,
  at,
  ceilingY: upperRoof(at[1]),
  radius: 0.16,
  centerY: LEVELS.upperFloor + hang,
  on,
  radiance: 5,
  source,
});

export const CEILING_LIGHTS: readonly CeilingLight[] = [
  // Basement: no daylight at all.
  flush('storage-light-1', 'basement', 'storage', [11.0, 5.5], B, true, 'extra: storage, centre'),
  flush(
    'storage-light-2',
    'basement',
    'storage',
    [9.62, 6.62],
    B,
    true,
    'extra: storage, at the foot of the stair, on the edge of the stair opening (lights the bottom flight)',
  ),
  // Ground floor: windowless or deep, dim rooms on; bedrooms have their fitting off.
  flush('hall-light-1', 'ground', 'entrance-hall', [8.35, 1.3], G, true, 'extra: entrance'),
  flush('hall-light-2', 'ground', 'entrance-hall', [5.2, 3.025], G, true, 'extra: corridor'),
  flush('boiler-light', 'ground', 'boiler-laundry', [6.04, 1.22], G, true, 'extra: utility room'),
  flush('bath-light', 'ground', 'bathroom', [5.875, 4.9], G, true, 'extra: bathroom'),
  flush('bed-1-light', 'ground', 'bedroom-1', [2.0, 1.6], G, false, 'extra: bedroom 1 (off)'),
  flush('bed-2-light', 'ground', 'bedroom-2', [2.375, 5.5], G, false, 'extra: bedroom 2 (off)'),
  // Upper floor, under the sloped roof: paper globes.
  pendant('upper-hall-light', 'upper-hall', [7.1, 3.0], 2.35, true, 'extra: upper hall'),
  pendant('study-light', 'study', [6.6, 1.9], 2.2, false, 'extra: study (off)'),
];

/** Area light of a fitting that is on (world space, for the baker). */
export interface Emitter {
  id: string;
  /**
   * `drum`: glowing bottom disc facing `normal` + side band `height` above it (opal drum);
   * `sphere`: a glowing globe.
   */
  shape: 'drum' | 'sphere';
  center: [number, number, number];
  normal: [number, number, number];
  radius: number;
  /** Drum: height of the glowing side band. */
  height: number;
  /** Linear RGB radiance. */
  radiance: [number, number, number];
}

/** World height of a flush fitting's diffuser (bottom face). */
export const diffuserY = (l: CeilingLight): number => l.ceilingY - FLUSH.height;

export function emitterOf(l: CeilingLight): Emitter {
  const radiance = LAMP_COLOR.map((c) => c * l.radiance) as [number, number, number];
  if (l.kind === 'pendant') {
    return {
      id: l.id,
      shape: 'sphere',
      center: [l.at[0], l.centerY ?? l.ceilingY - 0.8, l.at[1]],
      normal: [0, -1, 0],
      radius: l.radius,
      height: 0,
      radiance,
    };
  }
  return {
    id: l.id,
    shape: 'drum',
    // Centre of the bottom face (the tracer samples a hair outside the facets).
    center: [l.at[0], diffuserY(l), l.at[1]],
    normal: [0, -1, 0],
    radius: l.radius,
    height: FLUSH.height - FLUSH.band,
    radiance,
  };
}

export const EMITTERS: readonly Emitter[] = CEILING_LIGHTS.filter((l) => l.on).map(emitterOf);
