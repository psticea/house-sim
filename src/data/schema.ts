/**
 * House data model (plan.md §5). Pure data — no three.js imports — so it can be
 * validated by unit tests in Node and consumed by the world builders.
 *
 * Coordinates: metres, y up, +x = east (plan grid 1 → 6), +z = south (grid A → C).
 * Origin = axis 1 ∩ axis A at finished ground floor ±0.00 (= 261.98 m a.s.l.).
 * 2D plan points are [x, z].
 */

export type Vec2 = readonly [number, number];
export type Polygon = readonly Vec2[];

export type LevelId = 'basement' | 'ground' | 'upper';

/** Keys of the shared material library (src/world/materials.ts). */
export type MaterialId =
  | 'plaster' // interior walls & ceilings, warm white
  | 'plasterExterior' // exterior plinth plaster, white
  | 'cladMetal' // standing-seam metal facade RAL 7045
  | 'cladWood' // wood boards (loggia, canopy, fins)
  | 'roofMetal' // standing-seam roof sheet
  | 'ceilingWood' // wood-board sloped ceiling (living, loggia)
  | 'oak' // parquet
  | 'tile' // bathroom porcelain tiles
  | 'tileUtility' // boiler / laundry tiles
  | 'frame' // window & door frames RAL 1011
  | 'doorLeaf' // interior door leaves
  | 'glass'
  | 'metalBlack' // rails, chimney, sunshade
  | 'woodSlat' // 5×7 cm decorative slats
  | 'deck' // WPC deck
  | 'stone' // natural stone path slabs
  | 'pavers' // parking concrete pavers
  | 'concrete'
  | 'lawn'
  | 'field' // land outside the lot
  | 'asphalt'
  | 'grating'; // drainage / light-well gratings

/** A layer of a wall build-up, listed from the wall's LEFT face to its RIGHT face. */
export interface WallLayer {
  thickness: number;
  material: MaterialId;
  /** Shorten this layer at the wall start / end (used to interlock corners). */
  trimStart?: number;
  trimEnd?: number;
}

/**
 * Height of a wall top. A number is relative to the wall base; `roof` means the top
 * follows the underside of the given roof segment (gable walls, knee walls).
 */
export type WallTop = number | { roof: string };

/**
 * Straight wall. `from`/`to` are points on the wall centre line. "Left" is the side on
 * the left when walking from → to on the plan drawing (north up), i.e. the normal
 * (dz, −dx) in plan coordinates.
 */
export interface Wall {
  id: string;
  level: LevelId;
  kind: 'exterior' | 'interior' | 'curtain';
  from: Vec2;
  to: Vec2;
  /**
   * Bottom of the wall relative to the level floor (default 0). Exterior walls reach
   * below the finished floor (plinth), so their door openings become holes whose
   * bottom reveal is the threshold.
   */
  base?: number;
  /** Top of the wall; numbers are relative to the level floor. */
  top: WallTop;
  layers: readonly WallLayer[];
  /** Curtain walls only: mullion positions (distance along the wall) and transom band. */
  curtain?: {
    mullions: readonly number[];
    /** Opaque aluminium band [bottom, top] relative to the wall base. */
    band?: readonly [number, number];
  };
  /** Where the number came from on the plans. */
  source?: string;
}

export type OpeningKind = 'window' | 'door' | 'sliding' | 'passage';

export interface DoorLeaf {
  /** Hinge at the opening start (offset) or end (offset + width). */
  hinge: 'start' | 'end';
  /** Side of the wall the leaf swings into. */
  swing: 'left' | 'right';
  /** Degrees, 90 = fully open perpendicular to the wall. */
  openAngle: number;
  material: MaterialId;
  /** Glazed leaf (glass door). */
  glazed?: boolean;
}

export interface Opening {
  id: string;
  /** Opening tag on the plan, e.g. 'F-04', 'Ui-02', 'Ue-01'. */
  code: string;
  wall: string;
  /** Distance along the wall from `from` to the near edge of the (masonry) hole. */
  offset: number;
  width: number;
  height: number;
  /** Sill height relative to the finished floor of the level ("hp" on the plans). */
  sill: number;
  kind: OpeningKind;
  /** All doors are modelled open (goal.md). */
  state: 'open' | 'closed';
  leaf?: DoorLeaf;
  source?: string;
}

export type CeilingSpec =
  { type: 'flat'; height: number } | { type: 'roof'; segment: string } | { type: 'open' };

export interface Room {
  id: string;
  name: string;
  level: LevelId;
  /** Finished inner faces (clockwise or counter-clockwise). */
  polygon: Polygon;
  floor: MaterialId;
  ceiling: CeilingSpec;
  /** Area printed on the plan (m²), used by the automated checks. */
  expectedArea: number;
  exterior?: boolean;
  source?: string;
}

/** Named sub-area used for the room toast (e.g. play corner inside the living room). */
export interface Zone {
  id: string;
  name: string;
  level: LevelId;
  polygon: Polygon;
}

/** Horizontal slab (floor, ceiling, deck…) — a polygon extruded between two heights. */
export interface Slab {
  id: string;
  polygon: Polygon;
  holes?: readonly Polygon[];
  /** Absolute heights (world y). */
  bottom: number;
  top: number;
  material: MaterialId;
  /** Different material for the underside (e.g. ceiling plaster). */
  bottomMaterial?: MaterialId;
  sideMaterial?: MaterialId;
  collide?: boolean;
  /** Finished floor: only the top face is drawn (sides/bottom hidden by the structure). */
  floorOnly?: boolean;
  /** Top and bottom only (side faces coincide with walls or are drawn separately). */
  noSides?: boolean;
  /** Top of the collision prism when it differs from `top` (e.g. finish on a structural slab). */
  colliderTop?: number;
}

export type PlanDir = '+x' | '-x' | '+z' | '-z';

export interface StairFlight {
  /** Footprint of the flight: x range, z range. */
  x: readonly [number, number];
  z: readonly [number, number];
  /** Direction of ascent in plan. */
  direction: PlanDir;
  /** Index (1-based) of the riser at the flight's lower edge. */
  firstRiser: number;
  treads: number;
  going: number;
  /**
   * `solid`: masonry down to the stair's bottom level. Otherwise a sloped slab whose
   * soffit runs from 17 cm under the lower level to `soffitTop` (absolute y) at the top.
   */
  solid: boolean;
  soffitTop?: number;
  /** Extend the walking ramp one going beyond the lower edge (onto a floor/landing). */
  rampFoot: boolean;
}

/** Flat landing at the top of riser `riser` (plan polygon). */
export interface StairLanding {
  polygon: Polygon;
  riser: number;
  /** Slab thickness under the landing top (default: solid down to the bottom level). */
  thickness?: number;
}

/**
 * Winder turn: tread polygons plus a helicoidal walking ramp around `pivot`: the ramp
 * height is `lowRiser`·rise along the ray `lowDir`, `highRiser`·rise along `highDir`,
 * interpolated by angle. `x`/`z` bound the ramp region.
 */
export interface StairWinders {
  treads: readonly { polygon: Polygon; riser: number }[];
  pivot: Vec2;
  lowDir: Vec2;
  highDir: Vec2;
  lowRiser: number;
  highRiser: number;
  x: readonly [number, number];
  z: readonly [number, number];
}

/** Rod balustrade (Ø 1 cm) or wall-mounted handrail. Points are world coordinates. */
export interface Railing {
  id: string;
  /** Handrail line. */
  top: readonly (readonly [number, number, number])[];
  /**
   * Bottom of the rod infill at each point (world y), or `treads` = on the stair's
   * treads. Omitted: wall-mounted handrail (brackets only).
   */
  bottom?: readonly number[] | 'treads';
  /** Rod spacing (m). */
  rodSpacing?: number;
  /** Solid collision strip from the bottom to the handrail. */
  collide?: boolean;
  /** Plan offset of the collision strip from the handrail line (e.g. to a wall face). */
  colliderShift?: Vec2;
}

export interface Stairs {
  id: string;
  level: LevelId;
  /** Level the stair arrives at (world y). */
  topY: number;
  risers: number;
  /** Riser height printed on the plan; geometry divides (topY − floorY) exactly. */
  riserHeight: number;
  treads: number;
  going: number;
  flights: readonly StairFlight[];
  landings: readonly StairLanding[];
  winders?: StairWinders;
  railings: readonly Railing[];
  /** Rooms joined by the stair (bottom, top) — used by the reachability graph. */
  connects: readonly [{ level: LevelId; room: string }, { level: LevelId; room: string }];
}

export interface Box {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

export interface Level {
  id: LevelId;
  /** Finished floor level (world y). */
  floorY: number;
  walls: readonly Wall[];
  openings: readonly Opening[];
  rooms: readonly Room[];
  zones: readonly Zone[];
  slabs: readonly Slab[];
  stairs: readonly Stairs[];
  /** Regions open to the level above ("gol peste parter"). */
  voids: readonly Polygon[];
  walkable: boolean;
}

/**
 * Gable roof segment, extruded along x. The outer surface passes through (z = eaveZ,
 * y = eaveY) on both facades at `pitchDeg`; the underside passes through
 * (z = innerZ, y = innerY) and is flat (y = innerY) outside the inner faces.
 */
export interface RoofSegment {
  id: string;
  x: readonly [number, number];
  innerY: number;
  /** Distance of the underside's sloped start from each eave facade face (north side z). */
  innerZ: number;
  topMaterial: MaterialId;
  underMaterial: MaterialId;
  endMaterial: MaterialId;
}

export interface RoofWindow {
  id: string;
  code: string;
  /** Plan projection of the window (outer frame on the roof surface). */
  x: readonly [number, number];
  z: readonly [number, number];
}

export interface Roof {
  pitchDeg: number;
  /** Facade faces (outer) north/south where the roof starts. */
  eaveZ: readonly [number, number];
  eaveY: number;
  ridgeZ: number;
  segments: readonly RoofSegment[];
  windows: readonly RoofWindow[];
  chimney: { center: Vec2; radius: number; top: number };
  /** Hidden gutter ("jgheab ascuns") recessed along both eaves. */
  gutter: { width: number; lip: number; depth: number };
  /** Standing seams ("falturi") along the slope: first seam x, spacing, size. */
  seams: { x0: number; spacing: number; width: number; height: number };
  /** Tubular snow guards ("parazapezi"): plan depth from each eave face, x range. */
  snowGuards: { inset: number; x: readonly [number, number]; tubes: number };
}

/** Simple exterior elements (canopy, sunshade, fins, slat screens, rain chains…). */
export type ExteriorElement =
  | {
      id: string;
      type: 'box';
      box: Box;
      material: MaterialId;
      topMaterial?: MaterialId;
      bottomMaterial?: MaterialId;
      /** Standing seams on the top face, running along z, every `spacing` m. */
      seams?: number;
      collide?: boolean;
      castShadow?: boolean;
    }
  | {
      id: string;
      type: 'slats';
      /** Slats run along x from x0 to x1 at depth range z, height range y. */
      x: readonly [number, number];
      z: readonly [number, number];
      y: readonly [number, number];
      width: number;
      spacing: number;
      material: MaterialId;
      collide?: boolean;
    }
  | {
      id: string;
      /** Rain chain ("lant scurgere pluviale"): alternating oval links. */
      type: 'chain';
      x: number;
      z: number;
      y: readonly [number, number];
      link: number;
      material: MaterialId;
    };

export interface SitePatch {
  id: string;
  polygon: Polygon;
  /** Top surface height (world y). */
  top: number;
  thickness: number;
  material: MaterialId;
  collide?: boolean;
}

export interface Site {
  /** Lot boundary (house coordinates). */
  lot: Polygon;
  lotArea: number;
  /** Rotation of true north from plan north (−z), degrees, positive = toward −x (west). */
  trueNorthDeg: number;
  lawnY: number;
  patches: readonly SitePatch[];
  start: { position: readonly [number, number, number]; lookAt: Vec2 };
  /** Sun direction for the static shadow (azimuth from true north, elevation), degrees. */
  sun: { azimuthDeg: number; elevationDeg: number };
}

export interface HouseModel {
  grid: { x: Readonly<Record<string, number>>; z: Readonly<Record<string, number>> };
  levels: readonly Level[];
  roof: Roof;
  exterior: readonly ExteriorElement[];
  site: Site;
}
