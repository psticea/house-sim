/**
 * Furniture placement per room (plan.md I5, §6.2): The Local Project style — warm
 * minimalism in natural timber, travertine, linen, wool, cane and clay. Pure data (no
 * three.js) so the unit tests can check every piece against the room polygons, door
 * swings, stairs, ceilings and the e2e walking routes.
 *
 * Every item is a footprint `size` = [w, d, h] (m) centred at `at` on its level's floor,
 * rotated so its front faces `face` (S = +z, E = +x, N = −z, W = −x, or degrees with
 * 0 = S, 90 = E). Local x runs along the width, local z (depth) toward the front.
 * Wall-mounted pieces (`wall: true`) hang at `y` above the floor with their back on the
 * wall face. Large pieces collide (a simplified box = footprint × height); small ones
 * don't (plan.md I5: beds, sofa, tables, kitchen, island, wardrobes, tub, vanity…).
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
  | 'armchair'
  | 'loungeChair'
  | 'rug'
  | 'mirror'
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
  /** Mounting height of wall pieces / hanging height of pendants (above the floor). */
  y?: number;
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
  extra: Partial<FurnitureItem> = {},
): FurnitureItem => ({ id, kind, level, room, at, face, size, ...extra });

const G = 'ground' as const;
const U = 'upper' as const;
const B = 'basement' as const;

export const FURNITURE: readonly FurnitureItem[] = [
  // ------------------------------------------------------------- entrance hall
  // Full-height oak joinery along the vestibule's west wall with an open bench niche.
  item('hall-joinery', 'hallJoinery', G, 'entrance-hall', [7.55, 1.225], 'E', [2.05, 0.45, 2.6], {
    collide: true,
    opts: { bench: 0.95 },
  }),
  item('hall-mirror', 'mirror', G, 'entrance-hall', [9.36, 1.8], 'W', [0.7, 0.03, 0.7], {
    wall: true,
    y: 1.2,
  }),
  item('hall-runner', 'rug', G, 'entrance-hall', [6.1, 3.025], 'S', [3.8, 0.7, 0.012], {
    material: 'cane',
  }),
  item('hall-sconce', 'sconce', G, 'entrance-hall', [7.0, 2.515], 'S', [0.16, 0.18, 0.2], {
    wall: true,
    y: 1.75,
    material: 'clay',
  }),

  // ---------------------------------------------------------- living + kitchen
  // Kitchen: oak joinery along the (windowless) north wall, travertine top + splashback.
  item(
    'kitchen-tall',
    'kitchenTall',
    G,
    'living-kitchen',
    [10.225, 0.435],
    'S',
    [1.2, 0.62, 2.35],
    {
      collide: true,
    },
  ),
  item('kitchen-run', 'kitchenRun', G, 'living-kitchen', [12.625, 0.435], 'S', [3.6, 0.62, 0.9], {
    collide: true,
    // Offsets along the run (local x, m from its centre): sink, hob.
    opts: { sink: -0.45, hob: 1.05 },
  }),
  item('island', 'island', G, 'living-kitchen', [12.15, 2.125], 'S', [2.4, 0.95, 0.9], {
    collide: true,
    opts: { overhang: 0.25 },
  }),
  ...[11.45, 12.15, 12.85].map((x, i) =>
    item(`stool-${i + 1}`, 'stool', G, 'living-kitchen', [x, 2.63], 'N', [0.4, 0.4, 0.66]),
  ),
  ...[11.55, 12.75].map((x, i) =>
    item(
      `island-pendant-${i + 1}`,
      'pendant',
      G,
      'living-kitchen',
      [x, 2.12],
      'S',
      [0.42, 0.42, 0.34],
      {
        y: 1.95,
        material: 'ceramic',
        opts: { top: livingCeiling(2.12), shape: 'globe' },
      },
    ),
  ),
  // Dining: solid oak table for six in front of the closed half of F-07, cane chairs.
  item('dining-table', 'diningTable', G, 'living-kitchen', [15.2, 5.75], 'S', [2.0, 0.9, 0.75], {
    collide: true,
  }),
  ...[14.6, 15.2, 15.8].flatMap((x, i) => [
    item(
      `dining-chair-n${i + 1}`,
      'diningChair',
      G,
      'living-kitchen',
      [x, 5.0],
      'S',
      [0.46, 0.5, 0.8],
    ),
    item(
      `dining-chair-s${i + 1}`,
      'diningChair',
      G,
      'living-kitchen',
      [x, 6.5],
      'N',
      [0.46, 0.5, 0.8],
    ),
  ]),
  item('dining-pendant', 'pendant', G, 'living-kitchen', [15.2, 5.75], 'S', [0.7, 0.7, 0.42], {
    y: 1.72,
    material: 'linen',
    opts: { top: livingCeiling(5.75), shape: 'wide' },
  }),
  // Living: low modular sofa facing the garden and the stove, travertine coffee table.
  item('sofa', 'sofa', G, 'living-kitchen', [12.6, 4.325], 'S', [2.6, 0.95, 0.72], {
    collide: true,
  }),
  item('living-rug', 'rug', G, 'living-kitchen', [12.6, 5.15], 'S', [2.9, 2.2, 0.012], {
    material: 'wool',
  }),
  item('coffee-table', 'coffeeTable', G, 'living-kitchen', [12.6, 5.6], 'S', [1.2, 0.7, 0.36], {
    collide: true,
  }),
  item('lounge-chair', 'loungeChair', G, 'living-kitchen', [15.75, 4.2], 'W', [0.72, 0.8, 0.75]),
  item('olive-tree', 'olive', G, 'living-kitchen', [15.95, 0.75], 'S', [0.6, 0.6, 2.3], {
    opts: { seed: 23 },
  }),
  // Wood-burning stove on a travertine hearth, around the black flue at (11.65, 6.91).
  item('hearth', 'hearth', G, 'living-kitchen', [11.65, 6.7125], 'S', [1.2, 0.825, 0.03]),
  item('stove', 'stove', G, 'living-kitchen', [11.65, 6.9], 'N', [0.5, 0.42, 1.0], {
    collide: true,
  }),
  item('log-store', 'logStore', G, 'living-kitchen', [10.93, 6.93], 'N', [0.36, 0.36, 0.5]),
  // Play corner by the stairs: teepee, floor cushions, book ledge, baskets, soft rug.
  item('play-rug', 'rug', G, 'living-kitchen', [10.4, 5.7], 'S', [1.3, 1.6, 0.012], {
    material: 'cane',
  }),
  item('teepee', 'teepee', G, 'living-kitchen', [10.2, 6.5], 'S', [1.1, 1.1, 1.6]),
  item('play-cushion-1', 'cushion', G, 'living-kitchen', [10.5, 5.25], 'S', [0.6, 0.6, 0.14], {
    material: 'linen',
  }),
  item('play-cushion-2', 'cushion', G, 'living-kitchen', [11.0, 5.6], 20, [0.55, 0.55, 0.13], {
    material: 'foliage',
  }),
  item('book-ledge', 'bookLedge', G, 'living-kitchen', [9.8, 4.5], 'E', [1.0, 0.28, 0.45]),
  item('play-basket-1', 'basket', G, 'living-kitchen', [9.86, 5.3], 'S', [0.36, 0.36, 0.3]),
  item('play-basket-2', 'basket', G, 'living-kitchen', [9.9, 5.72], 'S', [0.3, 0.3, 0.24]),

  // ----------------------------------------------------------------- bedroom 1
  item('bed-1', 'bed', G, 'bedroom-1', [2.3, 1.175], 'S', [1.7, 2.1, 0.75], {
    collide: true,
    opts: { throw: 'clay', pillows: 2 },
  }),
  item('bed-1-side-w', 'bedside', G, 'bedroom-1', [1.19, 0.32], 'S', [0.42, 0.38, 0.48], {
    opts: { lamp: 'ceramic' },
  }),
  item('bed-1-side-e', 'bedside', G, 'bedroom-1', [3.41, 0.32], 'S', [0.42, 0.38, 0.48], {
    opts: { lamp: 'ceramic' },
  }),
  item('bed-1-wardrobe', 'wardrobe', G, 'bedroom-1', [4.325, 1.2], 'W', [2.0, 0.6, 2.4], {
    collide: true,
  }),
  item('bed-1-rug', 'rug', G, 'bedroom-1', [2.1, 2.1], 'S', [1.9, 1.6, 0.012], {
    material: 'wool',
  }),

  // ----------------------------------------------------------------- bedroom 2
  item('bed-2', 'bed', G, 'bedroom-2', [0.625, 6.1], 'N', [1.0, 2.05, 0.8], {
    collide: true,
    opts: { throw: 'cane', pillows: 1 },
  }),
  item('bed-2-desk', 'desk', G, 'bedroom-2', [2.0, 4.175], 'S', [1.2, 0.6, 0.75], {
    collide: true,
  }),
  item('bed-2-chair', 'deskChair', G, 'bedroom-2', [2.0, 4.72], 'N', [0.46, 0.5, 0.8]),
  item('bed-2-shelf', 'openShelf', G, 'bedroom-2', [3.15, 4.035], 'S', [0.8, 0.32, 0.6]),
  item('bed-2-rug', 'rug', G, 'bedroom-2', [2.45, 5.85], 'S', [2.0, 1.6, 0.012], {
    material: 'wool',
  }),
  item('bed-2-sconce', 'sconce', G, 'bedroom-2', [0.215, 5.5], 'E', [0.16, 0.18, 0.2], {
    wall: true,
    y: 1.35,
    material: 'clay',
  }),
  item('bed-2-plant', 'plant', G, 'bedroom-2', [4.38, 6.86], 'S', [0.4, 0.4, 1.1], {
    material: 'ceramic',
  }),

  // --------------------------------------------------------- ground bathroom
  item('bath-screen', 'showerScreen', G, 'bathroom', [6.39, 6.25], 'N', [0.97, 0.02, 2.0]),
  item('bath-shower', 'showerHead', G, 'bathroom', [6.7, 6.72], 'W', [0.3, 0.35, 0.3], {
    wall: true,
    y: 1.0,
  }),
  item('bath-vanity', 'vanity', G, 'bathroom', [6.635, 5.2], 'W', [0.9, 0.48, 0.85], {
    collide: true,
  }),
  item('bath-mirror', 'mirror', G, 'bathroom', [6.86, 5.2], 'W', [0.62, 0.03, 0.62], {
    wall: true,
    y: 1.25,
  }),
  item('bath-wc', 'wc', G, 'bathroom', [6.6, 5.94], 'W', [0.38, 0.55, 0.42]),
  item('bath-ladder', 'towelLadder', G, 'bathroom', [4.98, 4.85], 'E', [0.5, 0.2, 1.7]),
  item('bath-mat', 'rug', G, 'bathroom', [6.02, 5.2], 'W', [0.8, 0.5, 0.01], {
    material: 'linen',
  }),

  // --------------------------------------------------------- boiler + laundry
  item('boiler', 'boiler', G, 'boiler-laundry', [5.045, 0.5], 'E', [0.44, 0.34, 0.72], {
    wall: true,
    y: 1.3,
  }),
  item('washer-stack', 'washerStack', G, 'boiler-laundry', [6.9, 0.51], 'W', [0.62, 0.62, 1.78], {
    collide: true,
  }),
  item('utility-cabinet', 'wardrobe', G, 'boiler-laundry', [6.91, 1.25], 'W', [0.6, 0.6, 2.2], {
    collide: true,
  }),
  item('drying-rack', 'dryingRack', G, 'boiler-laundry', [5.2, 0.95], 'E', [0.6, 0.5, 1.0]),
  item('laundry-basket', 'basket', G, 'boiler-laundry', [5.07, 1.88], 'S', [0.36, 0.36, 0.4]),

  // ------------------------------------------------------------ basement storage
  item('storage-shelf-e1', 'shelving', B, 'storage', [12.06, 4.75], 'W', [1.4, 0.42, 1.9], {
    collide: true,
  }),
  item('storage-shelf-e2', 'shelving', B, 'storage', [12.06, 6.2], 'W', [1.4, 0.42, 1.9], {
    collide: true,
  }),
  item('storage-shelf-n', 'shelving', B, 'storage', [10.75, 4.085], 'S', [1.7, 0.42, 1.9], {
    collide: true,
  }),

  // ------------------------------------------------------------------ bedroom 3
  item('bed-3', 'bed', U, 'bedroom-3', [3.575, 5.25], 'W', [1.9, 2.1, 0.9], {
    collide: true,
    opts: { throw: 'wool', pillows: 2, cushion: 'foliage' },
  }),
  item('bed-3-side-n', 'bedside', U, 'bedroom-3', [4.4, 4.03], 'W', [0.4, 0.4, 0.45], {
    opts: { lamp: 'clay' },
  }),
  item('bed-3-side-s', 'bedside', U, 'bedroom-3', [4.4, 6.47], 'W', [0.4, 0.4, 0.45], {
    opts: { lamp: 'clay' },
  }),
  item('bed-3-bench', 'bench', U, 'bedroom-3', [2.25, 5.25], 'W', [1.3, 0.4, 0.45]),
  item('bed-3-wardrobe-n', 'wardrobe', U, 'bedroom-3', [2.15, 0.4], 'S', [3.6, 0.55, 0.9], {
    collide: true,
    opts: { low: true },
  }),
  item('bed-3-wardrobe-s', 'wardrobe', U, 'bedroom-3', [1.325, 6.85], 'N', [1.95, 0.55, 0.9], {
    collide: true,
    opts: { low: true },
  }),
  item('bed-3-armchair', 'armchair', U, 'bedroom-3', [0.9, 3.95], 'E', [0.82, 0.8, 0.74]),
  item('bed-3-lamp', 'floorLamp', U, 'bedroom-3', [0.42, 3.35], 'S', [0.4, 0.4, 1.55]),
  item('bed-3-rug', 'rug', U, 'bedroom-3', [3.05, 5.25], 'S', [2.3, 2.9, 0.012], {
    material: 'wool',
  }),

  // ---------------------------------------------------------------------- study
  item('study-desk', 'desk', U, 'study', [7.75, 0.475], 'S', [1.4, 0.7, 0.75], {
    collide: true,
    opts: { lamp: true },
  }),
  item('study-chair', 'deskChair', U, 'study', [7.75, 1.12], 'N', [0.46, 0.5, 0.8]),
  item('study-bookshelf', 'bookshelf', U, 'study', [4.9, 1.6], 'E', [1.2, 0.32, 1.6], {
    collide: true,
  }),
  item('study-daybed', 'daybed', U, 'study', [6.025, 0.55], 'S', [1.85, 0.8, 0.45], {
    collide: true,
  }),
  item('study-rug', 'rug', U, 'study', [6.9, 1.6], 'S', [2.0, 1.1, 0.012], {
    material: 'cane',
  }),
  item('study-plant', 'plant', U, 'study', [9.2, 0.55], 'S', [0.36, 0.36, 0.8], {
    material: 'clay',
  }),

  // ----------------------------------------------------------------- upper hall
  item('hall-bench', 'bench', U, 'upper-hall', [7.2, 2.61], 'S', [1.2, 0.36, 0.45]),
  item('upper-hall-sconce', 'sconce', U, 'upper-hall', [7.2, 2.515], 'S', [0.16, 0.18, 0.2], {
    wall: true,
    y: 1.7,
    material: 'clay',
  }),

  // ------------------------------------------------------------- upper bathroom
  item('upper-tub', 'tub', U, 'upper-bathroom', [5.85, 6.72], 'N', [1.7, 0.76, 0.58], {
    collide: true,
  }),
  item('upper-vanity', 'vanity', U, 'upper-bathroom', [5.115, 5.45], 'E', [0.9, 0.48, 0.85], {
    collide: true,
  }),
  item('upper-mirror', 'mirror', U, 'upper-bathroom', [4.89, 5.45], 'E', [0.56, 0.03, 0.56], {
    wall: true,
    y: 1.22,
  }),
  item('upper-wc', 'wc', U, 'upper-bathroom', [6.9, 4.8], 'W', [0.38, 0.55, 0.42]),
  item('upper-ladder', 'towelLadder', U, 'upper-bathroom', [7.07, 5.25], 'W', [0.46, 0.2, 1.6]),
  item('upper-bath-mat', 'rug', U, 'upper-bathroom', [5.85, 5.95], 'S', [0.9, 0.5, 0.01], {
    material: 'linen',
  }),

  // -------------------------------------------------------------- east terrace
  item('terrace-table', 'outdoorTable', G, 'terrace', [17.9, 4.6], 'E', [2.0, 0.9, 0.75], {
    collide: true,
  }),
  item('terrace-bench-w', 'outdoorBench', G, 'terrace', [17.18, 4.6], 'E', [1.8, 0.36, 0.45]),
  item('terrace-bench-e', 'outdoorBench', G, 'terrace', [18.62, 4.6], 'W', [1.8, 0.36, 0.45]),
  item('terrace-lounger-1', 'lounger', G, 'terrace', [17.4, 0.85], 30, [0.72, 0.85, 0.72]),
  item('terrace-lounger-2', 'lounger', G, 'terrace', [18.55, 0.85], -20, [0.72, 0.85, 0.72]),
  item('terrace-side-table', 'sideTable', G, 'terrace', [17.98, 0.55], 'S', [0.4, 0.4, 0.42]),
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
    const y0 = floorOf(it.level) + (it.wall ? (it.y ?? 0) : 0);
    out.push({
      id: it.id,
      level: it.level,
      min: [Math.min(...xs), y0, Math.min(...zs)],
      max: [Math.max(...xs), y0 + it.size[2], Math.max(...zs)],
    });
  }
  return out;
}
