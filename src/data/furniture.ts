/**
 * Furniture placement per room — placed from the furniture drawn on the architect's floor
 * plans (sheets 04 basement, 05 ground floor, 06 upper floor, 1:50); materials, colours
 * and shapes in the style of The Local Project (plan.md §6.1/§6.2): warm minimalism in
 * natural oak, travertine, linen, wool, cane and clay. Pure data (no three.js) so the
 * unit tests can check every piece against the room polygons, door swings, stairs,
 * ceilings, the e2e walking routes and the drawn symbols.
 *
 * Method: the furniture symbols were read from the sheets' vector geometry (pdfjs operator
 * list; thin grey strokes #7f7f7f / #9f9f9f / #5f5f5f / #7b766f / #8b8878, glass as
 * #fbfaea fills), converted with the building's calibration — sheet 05:
 * x = (pt − 184.165) / 56.693, z = (pt − 258.745) / 56.693; sheet 06: origin 195.16 /
 * 256.575 pt — and their outlines' bounds taken as footprints (`plan` below, x0 z0 x1 z1).
 * Every item records its `source`: the sheet and what was measured, or "not on plans"
 * for the few pieces the drawings leave open (basement, terrace, play corner, boiler)
 * and "extra" for plants and small accessories. Exception (owner's wish): bedroom 3 is
 * furnished freely in the house style, ignoring the drawn symbols ("owner choice — not
 * per plans").
 *
 * Every item is a footprint `size` = [w, d, h] (m) centred at `at` on its level's floor
 * (or `on` a surface that high), rotated so its front faces `face` (S = +z, E = +x,
 * N = −z, W = −x, or degrees with 0 = S, 90 = E). Local x runs along the width, local z
 * (depth) toward the front. Wall-mounted pieces (`wall: true`) hang at `y` above the
 * floor with their back on the wall face. Large pieces collide (a simplified box =
 * footprint × height); small ones don't.
 */
import { roofSegment, roofUndersideY } from './geometry2d';
import { LEVELS } from './grid';
import { roof } from './roof';
import type { LevelId, MaterialId, Vec2 } from './schema';

export type Face = 'N' | 'E' | 'S' | 'W' | number;

export type FurnitureKind =
  | 'bed'
  | 'bedside'
  | 'wardrobe'
  | 'hallJoinery'
  | 'kitchenTall'
  | 'kitchenRun'
  | 'island'
  | 'stool'
  | 'diningTable'
  | 'diningChair'
  | 'coffeeTable'
  | 'sofa'
  | 'ottoman'
  | 'armchair'
  | 'tubChair'
  | 'loungeChair'
  | 'rug'
  | 'mirror'
  | 'print'
  | 'pendant'
  | 'floorLamp'
  | 'sconce'
  | 'stove'
  | 'hearth'
  | 'logStore'
  | 'wc'
  | 'vanity'
  | 'showerScreen'
  | 'showerHead'
  | 'tub'
  | 'towelLadder'
  | 'boiler'
  | 'washerStack'
  | 'laundryRun'
  | 'dryingRack'
  | 'basket'
  | 'teepee'
  | 'cushion'
  | 'bookLedge'
  | 'openShelf'
  | 'bookshelf'
  | 'shelving'
  | 'desk'
  | 'deskChair'
  | 'daybed'
  | 'bench'
  | 'plant'
  | 'olive'
  | 'outdoorTable'
  | 'outdoorBench'
  | 'lounger'
  | 'sideTable';

export interface FurnitureItem {
  id: string;
  kind: FurnitureKind;
  level: LevelId;
  room: string;
  at: Vec2;
  face: Face;
  /** Width (local x), depth (local z), height (m). */
  size: readonly [number, number, number];
  /**
   * Where it comes from: "sheet NN: …" (drawn on the plans: what was measured), "not on
   * plans: …" (a room the drawings leave unfurnished), "extra: …" (plants, accessories)
   * or "owner choice — not per plans: …" (bedroom 3, furnished by the owner's wish).
   */
  source: string;
  /** Bounds of the drawn symbol on the sheet (x0, z0, x1, z1), where it is a rectangle. */
  plan?: readonly [number, number, number, number];
  /** Mounting height of wall pieces / hanging height of pendants (above the floor). */
  y?: number;
  /** Stands on a surface this high (a plant on a shelf, the stove on its hearth). */
  on?: number;
  /** Back on a wall face (mirrors, sconces, boiler…): may touch the room outline. */
  wall?: boolean;
  collide?: boolean;
  /** Main material (rugs, cushions, lamps…) where a piece comes in several. */
  material?: MaterialId;
  /** Piece-specific options (sink / hob offsets, lamp on a bedside table…). */
  opts?: Readonly<Record<string, number | string | boolean>>;
}

const FLOOR: Record<LevelId, number> = {
  basement: LEVELS.basementFloor,
  ground: LEVELS.groundFloor,
  upper: LEVELS.upperFloor,
};

export const floorOf = (level: LevelId): number => FLOOR[level];

/** Underside of the living room's board ceiling above plan depth z (pendant cords). */
const livingCeiling = (z: number): number => roofUndersideY(roof, roofSegment(roof, 'living'), z);

const item = (
  id: string,
  kind: FurnitureKind,
  level: LevelId,
  room: string,
  at: Vec2,
  face: Face,
  size: readonly [number, number, number],
  source: string,
  extra: Partial<FurnitureItem> = {},
): FurnitureItem => ({ id, kind, level, room, at, face, size, source, ...extra });

const round3 = (v: number): number => Math.round(v * 1000) / 1000;

/** A drawn rectangle (x0, z0, x1, z1) → centre, for pieces placed on their symbol. */
const mid = (r: readonly [number, number, number, number]): Vec2 => [
  (r[0] + r[2]) / 2,
  (r[1] + r[3]) / 2,
];

/** Rectangular piece placed exactly on its drawn symbol `r` (x0, z0, x1, z1). */
const drawn = (
  id: string,
  kind: FurnitureKind,
  level: LevelId,
  room: string,
  r: readonly [number, number, number, number],
  face: Face,
  h: number,
  source: string,
  extra: Partial<FurnitureItem> = {},
): FurnitureItem => {
  const along = face === 'E' || face === 'W';
  const w = along ? r[3] - r[1] : r[2] - r[0];
  const d = along ? r[2] - r[0] : r[3] - r[1];
  const size = [round3(w), round3(d), h] as const;
  return item(id, kind, level, room, mid(r), face, size, source, { plan: r, ...extra });
};

const G = 'ground' as const;
const U = 'upper' as const;
const B = 'basement' as const;

// Upper floor (sheet 06): stepped joinery under the 40° roof — each section ends 8 cm
// below the sloped ceiling at its low edge (1.006 m at z 0.132, 3.94 at the ridge).
const upperCeil = (z: number): number =>
  roofUndersideY(roof, roofSegment(roof, 'upper'), z) - LEVELS.upperFloor;
const stepH = (z: number, cap = 2.4): number => Math.min(cap, round3(upperCeil(z) - 0.08));

const S05 = 'sheet 05';
const S06 = 'sheet 06';
const OWN = 'owner choice — not per plans';

export const FURNITURE: readonly FurnitureItem[] = [
  // ============================================================== GROUND (sheet 05)
  // ------------------------------------------------------------- entrance hall
  drawn(
    'hall-joinery',
    'hallJoinery',
    G,
    'entrance-hall',
    [7.325, 0.125, 7.925, 2.31],
    'E',
    2.6,
    `${S05}: X-crossed wardrobe x 7.325…7.925, z 0.125…2.310 on the vestibule's west wall (#7b766f); built as oak joinery with a bench niche`,
    { collide: true, opts: { bench: 0.95 } },
  ),
  item(
    'hall-mirror',
    'mirror',
    G,
    'entrance-hall',
    [9.36, 1.8],
    'W',
    [0.7, 0.03, 0.7],
    'extra: round brass mirror opposite the joinery',
    {
      wall: true,
      y: 1.2,
    },
  ),
  item(
    'hall-runner',
    'rug',
    G,
    'entrance-hall',
    [6.1, 3.025],
    'S',
    [3.8, 0.7, 0.012],
    'extra: woven jute runner along the corridor',
    {
      material: 'cane',
    },
  ),
  item(
    'hall-sconce',
    'sconce',
    G,
    'entrance-hall',
    [7.0, 2.515],
    'S',
    [0.16, 0.18, 0.2],
    'extra: ceramic wall light',
    {
      wall: true,
      y: 1.75,
      material: 'clay',
    },
  ),

  // ---------------------------------------------------------- living + kitchen
  // Kitchen: one 6.6 m run along the north wall (fridge column "F" + base units with the
  // hob), sink in the island, dining table joined to the island's east end, 3 + 3 chairs.
  drawn(
    'kitchen-fridge',
    'kitchenTall',
    G,
    'living-kitchen',
    [9.625, 0.125, 10.225, 0.725],
    'S',
    2.4,
    `${S05}: fridge "F" x 9.625…10.225, z 0.125…0.725 at the west end of the run (#7f7f7f)`,
    { collide: true },
  ),
  drawn(
    'kitchen-run',
    'kitchenRun',
    G,
    'living-kitchen',
    [10.225, 0.125, 16.222, 0.725],
    'S',
    0.9,
    `${S05}: base run x 9.625…16.222, z 0.125…0.725 (60 cm modules), hob x 10.835…11.415, z 0.205…0.695 (#7f7f7f); wall cupboards over the whole run (owner's wish, not drawn: the north wall has no opening over the kitchen)`,
    // Local x offsets from the run's centre (13.2235): hob centre 11.125. Wall cupboards
    // 0.35 deep from the splashback top (+1.50, 0.60 over the worktop) up to the fridge
    // column's top (+2.40), the hood integrated over the hob, one open bay at the east end.
    {
      collide: true,
      opts: { hob: -2.099, oven: true, hood: true, uppers: 2.4, uppersOpen: 1 },
    },
  ),
  drawn(
    'island',
    'island',
    G,
    'living-kitchen',
    [11.372, 1.722, 13.372, 2.722],
    'S',
    0.9,
    `${S05}: island x 11.372…13.372, z 1.722…2.722 — cabinets to z 2.322 + 0.40 m strip toward the living room (#494641); sink 0.52 × 0.42 centred (12.372, 2.002), tap at z 2.24`,
    { collide: true, opts: { sink: 0, sinkZ: -0.22, shelf: 0.4 } },
  ),
  drawn(
    'dining-table',
    'diningTable',
    G,
    'living-kitchen',
    [13.372, 1.922, 15.372, 2.722],
    'S',
    0.75,
    `${S05}: table 2.00 × 0.80, x 13.372…15.372, z 1.922…2.722, joined to the island's east end`,
    { collide: true, opts: { legs: 'end' } },
  ),
  ...(
    [
      [13.423, 1.661, 13.914, 2.183],
      [14.061, 1.644, 14.552, 2.166],
      [14.7, 1.626, 15.19, 2.148],
    ] as const
  ).map((r, i) =>
    drawn(
      `dining-chair-n${i + 1}`,
      'diningChair',
      G,
      'living-kitchen',
      r,
      'S',
      0.8,
      `${S05}: chair ${i + 1} of 3 on the north side (backrest at z ≈ 1.72…1.92)`,
    ),
  ),
  ...(
    [
      [13.436, 2.56, 13.927, 3.082],
      [14.074, 2.542, 14.565, 3.064],
      [14.713, 2.524, 15.204, 3.046],
    ] as const
  ).map((r, i) =>
    drawn(
      `dining-chair-s${i + 1}`,
      'diningChair',
      G,
      'living-kitchen',
      r,
      'N',
      0.8,
      `${S05}: chair ${i + 1} of 3 on the south side (backrest at z ≈ 2.76…2.99)`,
    ),
  ),
  ...[11.872, 12.872].map((x, i) =>
    item(
      `island-pendant-${i + 1}`,
      'pendant',
      G,
      'living-kitchen',
      [x, 2.222],
      'S',
      [0.42, 0.42, 0.34],
      'extra: ceramic globe pendants over the island',
      {
        y: 1.95,
        material: 'ceramic',
        opts: { top: livingCeiling(2.222), shape: 'globe' },
      },
    ),
  ),
  item(
    'dining-pendant',
    'pendant',
    G,
    'living-kitchen',
    [14.372, 2.322],
    'S',
    [0.7, 0.7, 0.42],
    'extra: linen pendant over the table',
    {
      y: 1.72,
      material: 'linen',
      opts: { top: livingCeiling(2.322), shape: 'wide' },
    },
  ),
  // Living: 3-seat sofa facing the garden with a chaise module at its west end, coffee
  // table, round lounge chair by the glass wall, round stove at the chimney.
  drawn(
    'sofa',
    'sofa',
    G,
    'living-kitchen',
    [12.11, 3.92, 15.11, 4.82],
    'S',
    0.72,
    `${S05}: 3-seat sofa x 12.110…15.110, z 3.920…4.820, back cushions to z 4.10 (#7f7f7f)`,
    { collide: true, opts: { arm: 0.14 } },
  ),
  drawn(
    'sofa-chaise',
    'ottoman',
    G,
    'living-kitchen',
    [12.251, 4.828, 13.11, 5.579],
    'S',
    0.42,
    `${S05}: chaise / ottoman module x 12.251…13.110, z 4.828…5.579 in front of the sofa's west seat`,
    { collide: true },
  ),
  drawn(
    'coffee-table',
    'coffeeTable',
    G,
    'living-kitchen',
    [13.4, 5.187, 14.5, 5.787],
    'S',
    0.36,
    `${S05}: coffee table 1.10 × 0.60, x 13.400…14.500, z 5.187…5.787`,
    { collide: true },
  ),
  item(
    'lounge-chair',
    'tubChair',
    G,
    'living-kitchen',
    [15.91, 5.518],
    255,
    [0.88, 0.92, 0.72],
    `${S05}: round lounge chair, outline x 15.448…16.416, z 5.008…6.028; shell thickest to the east → faces west, turned ~15° toward the garden`,
  ),
  item(
    'living-rug',
    'rug',
    G,
    'living-kitchen',
    [13.75, 5.45],
    'S',
    [3.0, 2.0, 0.012],
    'extra: wool rug under the sofa group',
    {
      material: 'wool',
    },
  ),
  item(
    'hearth',
    'hearth',
    G,
    'living-kitchen',
    [11.65, 6.8],
    'S',
    [1.0, 0.65, 0.03],
    'extra: travertine hearth plate under the stove',
  ),
  item(
    'stove',
    'stove',
    G,
    'living-kitchen',
    [11.65, 6.8],
    'N',
    [0.51, 0.51, 1.0],
    `${S05}: round stove Ø 0.51 centred (11.650, 6.802) around the flue Ø 0.20 at (11.650, 6.907)`,
    { collide: true, on: 0.03, plan: [11.395, 6.549, 11.905, 7.055], opts: { round: true } },
  ),
  item(
    'log-store',
    'logStore',
    G,
    'living-kitchen',
    [10.93, 6.93],
    'N',
    [0.36, 0.36, 0.5],
    'extra: log store beside the stove',
  ),
  item(
    'olive-tree',
    'olive',
    G,
    'living-kitchen',
    [16.0, 6.6],
    'S',
    [0.6, 0.6, 2.3],
    'extra: olive tree in a clay pot by the glass wall',
    {
      opts: { seed: 23 },
    },
  ),
  item(
    'living-fig',
    'plant',
    G,
    'living-kitchen',
    [15.75, 4.2],
    'S',
    [0.44, 0.44, 1.5],
    'extra: fig in a ceramic pot at the sofa end',
    {
      material: 'ceramic',
    },
  ),
  // Play corner ("loc de joaca", nothing drawn): teepee, floor cushions, book ledge.
  item(
    'play-rug',
    'rug',
    G,
    'living-kitchen',
    [10.4, 5.7],
    'S',
    [1.3, 1.6, 0.012],
    'not on plans: play corner rug',
    {
      material: 'cane',
    },
  ),
  item(
    'teepee',
    'teepee',
    G,
    'living-kitchen',
    [10.2, 6.5],
    'S',
    [1.1, 1.1, 1.6],
    'not on plans: play corner teepee',
  ),
  item(
    'play-cushion-1',
    'cushion',
    G,
    'living-kitchen',
    [10.5, 5.25],
    'S',
    [0.6, 0.6, 0.14],
    'not on plans: floor cushion',
    {
      material: 'linen',
    },
  ),
  item(
    'play-cushion-2',
    'cushion',
    G,
    'living-kitchen',
    [11.0, 5.6],
    20,
    [0.55, 0.55, 0.13],
    'not on plans: floor cushion',
    {
      material: 'foliage',
    },
  ),
  item(
    'book-ledge',
    'bookLedge',
    G,
    'living-kitchen',
    [9.8, 4.5],
    'E',
    [1.0, 0.28, 0.45],
    'not on plans: low book ledge',
  ),
  item(
    'play-basket-1',
    'basket',
    G,
    'living-kitchen',
    [9.86, 5.3],
    'S',
    [0.36, 0.36, 0.3],
    'not on plans: toy basket',
  ),
  item(
    'play-basket-2',
    'basket',
    G,
    'living-kitchen',
    [9.9, 5.72],
    'S',
    [0.3, 0.3, 0.24],
    'not on plans: toy basket',
  ),

  // ----------------------------------------------------------------- bedroom 1
  drawn(
    'bed-1',
    'bed',
    G,
    'bedroom-1',
    [3.18, 0.231, 4.58, 2.231],
    'N',
    0.9,
    `${S05}: bed 1.40 × 2.00, x 3.180…4.580, z 0.231…2.231 (#5f5f5f); pillow strip at the south end → head against the hall wall`,
    { collide: true, opts: { throw: 'clay', pillows: 2 } },
  ),
  drawn(
    'bed-1-wardrobe',
    'wardrobe',
    G,
    'bedroom-1',
    [0.125, 0.125, 2.125, 0.725],
    'S',
    2.4,
    `${S05}: X-crossed wardrobe 2.00 × 0.60, x 0.125…2.125, z 0.125…0.725 (#7b766f)`,
    { collide: true },
  ),
  drawn(
    'bed-1-desk',
    'desk',
    G,
    'bedroom-1',
    [0.475, 3.025, 1.775, 3.625],
    'N',
    0.75,
    `${S05}: desk 1.30 × 0.60 with screen + keyboard, x 0.475…1.775, z 3.025…3.625 (#8b8878)`,
    { collide: true, opts: { lamp: true } },
  ),
  drawn(
    'bed-1-chair',
    'deskChair',
    G,
    'bedroom-1',
    [0.815, 2.346, 1.435, 2.936],
    'S',
    0.8,
    `${S05}: desk chair, outline x 0.815…1.435, z 2.346…2.936, backrest to the north`,
  ),
  item(
    'bed-1-rug',
    'rug',
    G,
    'bedroom-1',
    [2.9, 1.25],
    'S',
    [1.3, 1.8, 0.012],
    'extra: wool rug beside the bed',
    {
      material: 'wool',
    },
  ),
  item(
    'bed-1-plant',
    'plant',
    G,
    'bedroom-1',
    [0.4, 1.0],
    'S',
    [0.4, 0.4, 1.3],
    'extra: plant in a clay pot by window F-04',
    {
      material: 'clay',
    },
  ),
  item(
    'bed-1-sconce',
    'sconce',
    G,
    'bedroom-1',
    [3.42, 2.22],
    'N',
    [0.16, 0.18, 0.2],
    'extra: reading light above the bed head',
    {
      wall: true,
      y: 1.15,
      material: 'ceramic',
    },
  ),
  item(
    'bed-1-print',
    'print',
    G,
    'bedroom-1',
    [1.125, 3.6125],
    'N',
    [0.5, 0.025, 0.7],
    'extra: framed print above the desk',
    {
      wall: true,
      y: 1.25,
      material: 'clay',
    },
  ),

  // ----------------------------------------------------------------- bedroom 2
  drawn(
    'bed-2-wardrobe',
    'wardrobe',
    G,
    'bedroom-2',
    [0.125, 3.875, 0.73, 7.119],
    'E',
    2.4,
    `${S05}: X-crossed wardrobe along the whole west wall, x 0.125…0.730, z 3.875…7.119 (#7b766f)`,
    { collide: true },
  ),
  drawn(
    'bed-2',
    'bed',
    G,
    'bedroom-2',
    [1.53, 3.893, 3.18, 5.993],
    'S',
    0.95,
    `${S05}: bed 1.65 × 2.10, x 1.530…3.180, z 3.893…5.993, two pillows at the north (#9f9f9f)`,
    { collide: true, opts: { throw: 'cane', pillows: 2 } },
  ),
  ...(
    [
      [1.18, 3.892, 1.53, 4.242],
      [3.18, 3.893, 3.53, 4.243],
    ] as const
  ).map((r, i) =>
    drawn(
      `bed-2-side-${i ? 'e' : 'w'}`,
      'bedside',
      G,
      'bedroom-2',
      r,
      'S',
      0.48,
      `${S05}: bedside table 0.35 × 0.35`,
      {
        opts: { lamp: 'ceramic' },
      },
    ),
  ),
  item(
    'bed-2-armchair',
    'armchair',
    G,
    'bedroom-2',
    [4.139, 6.66],
    225,
    [0.66, 0.62, 0.74],
    `${S05}: armchair in the south-east corner, outline x 3.731…4.548, z 6.252…7.068, turned 45° toward the bed`,
  ),
  item(
    'bed-2-rug',
    'rug',
    G,
    'bedroom-2',
    [2.4, 5.75],
    'S',
    [2.2, 1.6, 0.012],
    'extra: wool rug at the foot of the bed',
    {
      material: 'wool',
    },
  ),
  item(
    'bed-2-plant',
    'plant',
    G,
    'bedroom-2',
    [1.05, 6.8],
    'S',
    [0.4, 0.4, 1.1],
    'extra: plant in a ceramic pot',
    {
      material: 'ceramic',
    },
  ),
  item(
    'bed-2-print',
    'print',
    G,
    'bedroom-2',
    [2.355, 3.8875],
    'S',
    [0.9, 0.025, 0.6],
    'extra: framed print above the bed',
    {
      wall: true,
      y: 1.25,
      material: 'foliage',
      opts: { split: 0.55 },
    },
  ),

  // --------------------------------------------------------- ground bathroom
  drawn(
    'bath-vanity',
    'vanity',
    G,
    'bathroom',
    [4.875, 4.119, 5.375, 5.119],
    'E',
    0.85,
    `${S05}: washbasin counter 1.00 × 0.50 on the west wall, x 4.875…5.375, z 4.119…5.119, basin centred z 4.619 (#9f9f9f)`,
    { collide: true },
  ),
  item(
    'bath-mirror',
    'mirror',
    G,
    'bathroom',
    [4.89, 4.619],
    'E',
    [0.62, 0.03, 0.62],
    'extra: round mirror above the basin',
    {
      wall: true,
      y: 1.2,
    },
  ),
  drawn(
    'bath-bidet',
    'wc',
    G,
    'bathroom',
    [6.335, 4.1, 6.875, 4.46],
    'W',
    0.42,
    `${S05}: wall-hung bidet 0.54 × 0.36 on the east wall, x 6.335…6.875, z 4.100…4.460 (#9f9f9f)`,
    { opts: { bidet: true } },
  ),
  drawn(
    'bath-wc',
    'wc',
    G,
    'bathroom',
    [6.315, 4.637, 6.875, 4.987],
    'W',
    0.42,
    `${S05}: wall-hung WC 0.56 × 0.35, x 6.315…6.875, z 4.637…4.987, cistern in the wall (#7f7f7f)`,
  ),
  drawn(
    'bath-screen',
    'showerScreen',
    G,
    'bathroom',
    [6.075, 5.286, 6.875, 5.306],
    'S',
    2.0,
    `${S05}: glass screen x 6.075…6.875, z 5.286…5.306 (walk-in shower between it and the tub)`,
  ),
  item(
    'bath-shower',
    'showerHead',
    G,
    'bathroom',
    [6.7, 5.725],
    'W',
    [0.3, 0.35, 0.3],
    `${S05}: shower mixer on the east wall, z 5.497…5.953`,
    { wall: true, y: 1.0 },
  ),
  drawn(
    'bath-tub',
    'tub',
    G,
    'bathroom',
    [5.014, 6.21, 6.714, 7.11],
    'N',
    0.58,
    `${S05}: oval freestanding tub 1.70 × 0.90, x 5.014…6.714, z 6.210…7.110, drain at the west end`,
    { collide: true },
  ),
  item(
    'bath-ladder',
    'towelLadder',
    G,
    'bathroom',
    [4.98, 5.75],
    'E',
    [0.5, 0.2, 1.7],
    'extra: oak towel ladder',
  ),
  item(
    'bath-mat',
    'rug',
    G,
    'bathroom',
    [5.5, 5.85],
    'S',
    [0.8, 0.5, 0.01],
    'extra: linen bath mat',
    {
      material: 'linen',
    },
  ),

  // --------------------------------------------------------- boiler + laundry
  item(
    'boiler',
    'boiler',
    G,
    'boiler-laundry',
    [5.045, 0.5],
    'E',
    [0.44, 0.34, 0.72],
    'not on plans: wall boiler of the boiler room (CT)',
    {
      wall: true,
      y: 1.3,
    },
  ),
  drawn(
    'laundry',
    'laundryRun',
    G,
    'boiler-laundry',
    [6.61, 0.143, 7.21, 1.343],
    'W',
    0.9,
    `${S05}: washer "W" + dryer "D" side by side on the east wall, x 6.610…7.210, z 0.143…1.343 (#5f5f5f)`,
    { collide: true },
  ),
  item(
    'laundry-basket',
    'basket',
    G,
    'boiler-laundry',
    [5.07, 1.88],
    'S',
    [0.36, 0.36, 0.4],
    'extra: laundry basket',
  ),

  // ======================================================== BASEMENT (sheet 04)
  // Storage: nothing drawn — simple oak/steel shelving with woven boxes.
  item(
    'storage-shelf-e1',
    'shelving',
    B,
    'storage',
    [12.06, 4.75],
    'W',
    [1.4, 0.42, 1.9],
    'not on plans: shelving',
    {
      collide: true,
    },
  ),
  item(
    'storage-shelf-e2',
    'shelving',
    B,
    'storage',
    [12.06, 6.2],
    'W',
    [1.4, 0.42, 1.9],
    'not on plans: shelving',
    {
      collide: true,
    },
  ),
  item(
    'storage-shelf-n',
    'shelving',
    B,
    'storage',
    [10.75, 4.085],
    'S',
    [1.7, 0.42, 1.9],
    'not on plans: shelving',
    {
      collide: true,
    },
  ),

  // =========================================================== UPPER (sheet 06)
  // ------------------------------------------------------------------ bedroom 3
  // Owner's choice: the drawn layout (two single beds, four bedside tables, stepped
  // wardrobes) is not used here — one calm room in The Local Project style instead. A low
  // wide oak bed with its head on the east wall in the tall band south of the ridge (≥ 1.96
  // m clear over it, the south roof window over its side, the low west window F-09 at its
  // foot), a bench at the foot on a wool rug; one continuous 0.90 m oak line of low
  // cupboards under the north knee wall and round into the north-east niche, a shorter run
  // under the south knee wall west of the bed; a bouclé reading chair under the west
  // window F-08 with the olive floor lamp, a tall plant between the two west windows. The
  // door swing and the walk from the door to the windows stay open (≥ 1.1 m).
  item(
    'bed-3',
    'bed',
    U,
    'bedroom-3',
    [3.547, 5.075],
    'W',
    [1.8, 2.15, 0.9],
    `${OWN}: low wide oak bed 1.80 × 2.15 (1.60 m mattress), head on the east wall, x 2.472…4.622, z 4.175…5.975`,
    { collide: true, opts: { throw: 'wool', pillows: 2, cushion: 'foliage' } },
  ),
  ...(
    [
      ['n', 3.96],
      ['s', 6.19],
    ] as const
  ).map(([k, z]) =>
    item(
      `bed-3-side-${k}`,
      'bedside',
      U,
      'bedroom-3',
      [4.42, z],
      'W',
      [0.4, 0.4, 0.45],
      `${OWN}: oak bedside table with a clay lamp`,
      { opts: { lamp: 'clay' } },
    ),
  ),
  item(
    'bed-3-print',
    'print',
    U,
    'bedroom-3',
    [4.6125, 5.075],
    'W',
    [0.9, 0.025, 0.6],
    `${OWN}: one framed print above the bed head`,
    { wall: true, y: 1.2, material: 'clay' },
  ),
  item(
    'bed-3-bench',
    'bench',
    U,
    'bedroom-3',
    [2.222, 5.075],
    'W',
    [1.4, 0.38, 0.45],
    `${OWN}: solid oak bench at the foot of the bed`,
  ),
  item(
    'bed-3-bench-throw',
    'cushion',
    U,
    'bedroom-3',
    [2.222, 5.5],
    'W',
    [0.4, 0.34, 0.05],
    `${OWN}: folded olive wool throw on the bench`,
    { on: 0.45, material: 'foliage' },
  ),
  item(
    'bed-3-rug',
    'rug',
    U,
    'bedroom-3',
    [2.925, 5.075],
    'S',
    [2.45, 2.6, 0.012],
    `${OWN}: wool rug under the lower two thirds of the bed and the bench`,
    { material: 'wool' },
  ),
  item(
    'bed-3-low-n',
    'wardrobe',
    U,
    'bedroom-3',
    [2.375, 0.378],
    'S',
    [4.494, 0.5, 0.9],
    `${OWN}: low oak cupboards under the north knee wall, wall to wall x 0.128…4.622, z 0.128…0.628 (the last 0.60 m runs on behind the niche cupboard)`,
    { collide: true, opts: { low: true, blindR: 0.6 } },
  ),
  item(
    'bed-3-low-niche',
    'wardrobe',
    U,
    'bedroom-3',
    [4.322, 1.4575],
    'W',
    [1.699, 0.6, 0.9],
    `${OWN}: the same low oak line round the corner into the north-east niche, x 4.022…4.622, z 0.608…2.307`,
    { collide: true, opts: { low: true } },
  ),
  item(
    'bed-3-low-s',
    'wardrobe',
    U,
    'bedroom-3',
    [1.028, 6.872],
    'N',
    [1.8, 0.5, 0.9],
    `${OWN}: low oak cupboards under the south knee wall west of the bed, x 0.128…1.928, z 6.622…7.122 (≥ 0.8 m to the bed's foot corner)`,
    { collide: true, opts: { low: true } },
  ),
  item(
    'bed-3-armchair',
    'armchair',
    U,
    'bedroom-3',
    [0.66, 2.525],
    75,
    [0.82, 0.8, 0.74],
    `${OWN}: bouclé reading chair under the west window F-08, turned a little toward the room`,
  ),
  item(
    'bed-3-lamp',
    'floorLamp',
    U,
    'bedroom-3',
    [0.42, 1.72],
    'S',
    [0.4, 0.4, 1.55],
    `${OWN}: sculptural floor lamp (olive base, brass, linen shade) beside the chair`,
  ),
  item(
    'bed-3-plant',
    'plant',
    U,
    'bedroom-3',
    [0.45, 3.725],
    'S',
    [0.5, 0.5, 1.45],
    `${OWN}: tall plant in a clay pot between the west windows`,
    { material: 'clay' },
  ),

  // ---------------------------------------------------------------------- study
  ...(
    [
      [0.132, 0.862],
      [0.862, 1.581],
      [1.581, 2.31],
    ] as const
  ).map(([z0, z1], i) =>
    drawn(
      `study-bookcase-${i + 1}`,
      'bookshelf',
      U,
      'study',
      [4.74, z0, 5.29, z1],
      'E',
      stepH(z0, 2.15),
      `${S06}: storage unit 0.55 deep on the west wall, x 4.740…5.290, z 0.132…2.310 in three bays (#7f7f7f); open oak shelves stepped under the slope`,
      { collide: true },
    ),
  ),
  // Desk along the whole east wall (owner's wish), wall to wall from the north knee wall
  // to the hall wall: the drawn screen sits at its middle, a drawer pedestal fills the low
  // end under the slope, a slim oak panel leg stands at the hall wall; the top (0.75)
  // stays under the sill of the interior window F-02 (0.80).
  item(
    'study-desk',
    'desk',
    U,
    'study',
    [9.182, 1.2175],
    'W',
    [2.177, 0.65, 0.75],
    `${S06}: keyboard x 8.950…9.120 + screen x 9.170…9.300 centred z 1.218 on the east wall (the desk outline itself is not drawn); owner's choice: one solid oak desk the full length of the wall, x 8.857…9.507, z 0.129…2.306`,
    { collide: true, opts: { lamp: true, monitor: true, lampX: -0.55, pedestal: 0.45 } },
  ),
  item(
    'study-desk-plant',
    'plant',
    U,
    'study',
    [9.3, 2.02],
    'S',
    [0.2, 0.2, 0.28],
    'extra: small plant at the south end of the desk, in front of F-02',
    { on: 0.75, material: 'ceramic' },
  ),
  drawn(
    'study-chair',
    'deskChair',
    U,
    'study',
    [8.261, 0.908, 8.851, 1.528],
    'E',
    0.8,
    `${S06}: desk chair, outline x 8.261…8.851, z 0.908…1.528, facing the desk`,
  ),
  item(
    'study-rug',
    'rug',
    U,
    'study',
    [7.1, 1.3],
    'S',
    [2.0, 1.3, 0.012],
    'extra: cane-coloured rug',
    {
      material: 'cane',
    },
  ),
  item(
    'study-plant',
    'plant',
    U,
    'study',
    [5.0, 1.45],
    'S',
    [0.24, 0.24, 0.26],
    'extra: small plant on the middle bookcase bay',
    {
      on: stepH(0.862, 2.15),
      material: 'clay',
    },
  ),

  // ----------------------------------------------------------------- upper hall
  drawn(
    'upper-hall-wardrobe',
    'wardrobe',
    U,
    'upper-hall',
    [8.9, 2.435, 9.5, 3.625],
    'W',
    2.4,
    `${S06}: X-crossed wardrobe at the hall's east end, x 8.900…9.500, z 2.435…3.625 (#7b766f)`,
    { collide: true },
  ),
  item(
    'upper-hall-sconce',
    'sconce',
    U,
    'upper-hall',
    [7.2, 2.515],
    'S',
    [0.16, 0.18, 0.2],
    'extra: ceramic wall light',
    {
      wall: true,
      y: 1.7,
      material: 'clay',
    },
  ),
  item(
    'upper-hall-print',
    'print',
    U,
    'upper-hall',
    [6.65, 3.6125],
    'N',
    [0.5, 0.025, 0.7],
    'extra: framed print',
    {
      wall: true,
      y: 1.3,
      material: 'cane',
    },
  ),

  // ------------------------------------------------------------- upper bathroom
  drawn(
    'upper-vanity',
    'vanity',
    U,
    'upper-bathroom',
    [4.875, 4.653, 5.375, 5.453],
    'E',
    0.85,
    `${S06}: washbasin counter 0.80 × 0.50 on the west wall, x 4.875…5.375, z 4.653…5.453 (#9f9f9f)`,
    { collide: true },
  ),
  item(
    'upper-mirror',
    'mirror',
    U,
    'upper-bathroom',
    [4.89, 5.053],
    'E',
    [0.56, 0.03, 0.56],
    'extra: round mirror above the basin',
    {
      wall: true,
      y: 1.22,
    },
  ),
  drawn(
    'upper-wc',
    'wc',
    U,
    'upper-bathroom',
    [6.418, 5.915, 6.978, 6.265],
    'W',
    0.42,
    `${S06}: wall-hung WC 0.56 × 0.35, x 6.418…6.978, z 5.915…6.265, cistern in the shaft wall (#7f7f7f)`,
  ),
  drawn(
    'upper-screen-w',
    'showerScreen',
    U,
    'upper-bathroom',
    [6.175, 3.74, 6.195, 4.637],
    'E',
    2.0,
    `${S06}: shower glass x 6.175…6.195, z 3.740…4.637 (#fbfaea)`,
  ),
  drawn(
    'upper-screen-s',
    'showerScreen',
    U,
    'upper-bathroom',
    [6.275, 5.49, 7.175, 5.515],
    'S',
    2.0,
    `${S06}: shower glass x 6.275…7.175, z 5.490…5.515 (#fbfaea); walk-in shower x 6.195…7.175, z 3.740…5.490`,
  ),
  item(
    'upper-shower',
    'showerHead',
    U,
    'upper-bathroom',
    [6.559, 3.915],
    'S',
    [0.3, 0.35, 0.3],
    `${S06}: shower mixer on the north wall, x 6.331…6.787`,
    { wall: true, y: 1.0 },
  ),
  item(
    'upper-ladder',
    'towelLadder',
    U,
    'upper-bathroom',
    [4.98, 6.3],
    'E',
    [0.46, 0.2, 1.2],
    'extra: oak towel ladder under the slope',
  ),
  item(
    'upper-bath-mat',
    'rug',
    U,
    'upper-bathroom',
    [5.75, 4.95],
    'E',
    [0.8, 0.5, 0.01],
    'extra: linen bath mat',
    {
      material: 'linen',
    },
  ),

  // -------------------------------------------------------------- east terrace
  // Not on the plans (sheets 03 / 05 draw only the deck boards).
  item(
    'terrace-table',
    'outdoorTable',
    G,
    'terrace',
    [17.9, 4.6],
    'E',
    [2.0, 0.9, 0.75],
    'not on plans: outdoor dining table',
    {
      collide: true,
    },
  ),
  item(
    'terrace-bench-w',
    'outdoorBench',
    G,
    'terrace',
    [17.18, 4.6],
    'E',
    [1.8, 0.36, 0.45],
    'not on plans: bench',
  ),
  item(
    'terrace-bench-e',
    'outdoorBench',
    G,
    'terrace',
    [18.62, 4.6],
    'W',
    [1.8, 0.36, 0.45],
    'not on plans: bench',
  ),
  // Lounger 1 faces the garden so the open, outward curtain-wall door leaf (z ≈ 1.2,
  // x 16.6…17.6) and its swing stay clear.
  item(
    'terrace-lounger-1',
    'lounger',
    G,
    'terrace',
    [17.25, 0.7],
    'E',
    [0.72, 0.85, 0.72],
    'not on plans: lounge chair',
  ),
  item(
    'terrace-lounger-2',
    'lounger',
    G,
    'terrace',
    [18.55, 0.85],
    -20,
    [0.72, 0.85, 0.72],
    'not on plans: lounge chair',
  ),
  item(
    'terrace-side-table',
    'sideTable',
    G,
    'terrace',
    [17.98, 0.55],
    'S',
    [0.4, 0.4, 0.42],
    'not on plans: side table',
  ),
];

/** Rotation (radians) of a face: local +z (front) → world direction (sin θ, cos θ). */
export function faceAngle(face: Face): number {
  const deg = typeof face === 'number' ? face : { S: 0, E: 90, N: 180, W: 270 }[face];
  return (deg * Math.PI) / 180;
}

/** World plan point of a local offset (lx along the width, lz toward the front). */
export function localToPlan(it: FurnitureItem, lx: number, lz: number): Vec2 {
  const t = faceAngle(it.face);
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [it.at[0] + lx * c + lz * s, it.at[1] - lx * s + lz * c];
}

/** Footprint corners (plan) of an item. */
export function footprint(it: FurnitureItem): Vec2[] {
  const [w, d] = it.size;
  return [
    localToPlan(it, -w / 2, -d / 2),
    localToPlan(it, w / 2, -d / 2),
    localToPlan(it, w / 2, d / 2),
    localToPlan(it, -w / 2, d / 2),
  ];
}

export interface FurnitureCollider {
  id: string;
  level: LevelId;
  /** World-space axis-aligned box. */
  min: readonly [number, number, number];
  max: readonly [number, number, number];
}

/** Simplified collision boxes: footprint bounds × [floor, floor + height]. */
export function furnitureColliders(
  items: readonly FurnitureItem[] = FURNITURE,
): FurnitureCollider[] {
  const out: FurnitureCollider[] = [];
  for (const it of items) {
    if (!it.collide) continue;
    const fp = footprint(it);
    const xs = fp.map((p) => p[0]);
    const zs = fp.map((p) => p[1]);
    const y0 = floorOf(it.level) + (it.on ?? 0) + (it.wall ? (it.y ?? 0) : 0);
    out.push({
      id: it.id,
      level: it.level,
      min: [Math.min(...xs), y0, Math.min(...zs)],
      max: [Math.max(...xs), y0 + it.size[2], Math.max(...zs)],
    });
  }
  return out;
}
