/**
 * Upper floor (etaj) — transcribed from sheet 06 (1:50) with the same method as the
 * ground floor: vector operator list, grid origin axis 1 at x = 195.16 pt, axis A at
 * y = 256.575 pt, 1 m = 56.693 pt; values cross-checked with the printed chains, e.g.
 * hall south edge 58⁵ | 80 | 1.20 | 95 | 1.23⁵ | 11⁵ from x 4.74, bathroom
 * 25 | 2.10 | 20 | 15 | 2.05 | 25 from x 4.625, study/hall wall 58⁵ | 90 | 3.28⁵.
 *
 * Finished floor +2.95 on a structural slab (2.68 → 2.94, = ground-floor ceiling) with
 * per-room finishes; interior walls stand on the slab (base −1 cm). The exterior walls
 * continue from the ground floor and stop at the roof underside (+3.95 = knee wall
 * 1.00 m); interior walls follow the 40° roof. The upper rooms are closed off from the
 * living-room void (walls x 9.51…9.625 / 9.375…9.625, sheet 06); the void is seen
 * through the interior window F-02 of the study. The stair well is enclosed (bathroom
 * wall, void wall, wall over flight 1) with a rod balustrade on the middle wall.
 */
import { LEVELS } from './grid';
import type { Level, Opening, Polygon, Room, Slab, Wall, WallLayer } from './schema';

const Y = LEVELS.upperFloor;
const inner = (t: number): WallLayer[] => [{ thickness: t, material: 'plaster' }];
const BASE = -0.01;
const ROOF = { roof: 'upper' } as const;

/** Stair well in the upper slab: west flight from z 3.875, over flight 1 from z 3.75. */
export const UPPER_STAIR_WELL: Polygon = [
  [7.325, 3.875],
  [8.39, 3.875],
  [8.39, 3.75],
  [9.375, 3.75],
  [9.375, 7.125],
  [7.325, 7.125],
];

export const upperSlab: Slab = {
  id: 'upper-slab',
  // Between the exterior walls' inner faces up to the void edge (x 9.625), minus the
  // stair well (as one ring: the well touches the south wall).
  polygon: [
    [0.125, 0.125],
    [9.625, 0.125],
    [9.625, 7.125],
    [9.375, 7.125],
    [9.375, 3.75],
    [8.39, 3.75],
    [8.39, 3.875],
    [7.325, 3.875],
    [7.325, 7.125],
    [0.125, 7.125],
  ],
  bottom: LEVELS.groundCeiling,
  top: Y - 0.01,
  material: 'oak',
  bottomMaterial: 'plaster',
  sideMaterial: 'plaster',
  collide: true,
  colliderTop: Y,
};

const wall = (
  id: string,
  from: readonly [number, number],
  to: readonly [number, number],
  t: number,
  source: string,
): Wall => ({
  id,
  level: 'upper',
  kind: 'interior',
  base: BASE,
  from,
  to,
  top: ROOF,
  layers: inner(t),
  source,
});

export const upperWalls: Wall[] = [
  wall('up-b3-east', [4.6825, 0.125], [4.6825, 3.625], 0.115, 'brick x 4.625…4.74, z 0.125…3.625'),
  wall('up-b3-bath', [4.75, 3.625], [4.75, 7.125], 0.25, 'brick x 4.625…4.875 + column'),
  wall('up-wardrobe-n', [4.01, 2.3675], [4.625, 2.3675], 0.115, 'brick z 2.31…2.425 (niche)'),
  wall('up-wardrobe-s', [4.01, 3.6825], [4.625, 3.6825], 0.115, 'brick z 3.625…3.74 (niche)'),
  wall('up-study-hall', [4.74, 2.3675], [9.51, 2.3675], 0.115, 'brick z 2.31…2.425'),
  wall('up-bath-n', [4.875, 3.6825], [7.325, 3.6825], 0.115, 'brick z 3.625…3.74'),
  wall('up-bath-e', [7.25, 3.74], [7.25, 7.125], 0.15, 'brick x 7.175…7.325 (stair-well side)'),
  wall('up-shaft', [7.08, 5.525], [7.08, 7.125], 0.19, 'shaft x 6.985…7.175 (chain 2.10 | 20)'),
  wall('up-hall-well', [8.275, 3.6925], [9.375, 3.6925], 0.115, 'brick z 3.635…3.75 over flight 1'),
  // Walls facing the living-room void: study/hall (11.5 cm) and stair well (25 cm).
  wall('up-void-n', [9.5675, 0.125], [9.5675, 3.625], 0.115, 'brick x 9.51…9.625'),
  wall('up-void-s', [9.5, 3.625], [9.5, 7.125], 0.25, 'brick x 9.375…9.625 + column'),
];

const leaf = (hinge: 'start' | 'end', swing: 'left' | 'right') => ({
  hinge,
  swing,
  openAngle: 90,
  material: 'doorLeaf' as const,
});

export const upperOpenings: Opening[] = [
  {
    id: 'f02-upper-void',
    code: 'F-02u',
    wall: 'up-void-n',
    offset: 1.285,
    width: 0.9,
    height: 0.9,
    sill: 0.8,
    kind: 'window',
    state: 'closed',
    source: 'sheet 06 opening z 1.41…2.31 in the void wall, tag F-02 90 × 90, hp 80',
  },
  {
    id: 'ui04-bedroom3',
    code: 'Ui-04',
    wall: 'up-b3-east',
    offset: 2.45,
    width: 0.9,
    height: 2.1,
    sill: 0,
    kind: 'door',
    state: 'open',
    leaf: leaf('start', 'right'),
    source: 'sheet 06 opening z 2.575…3.475, tag Ui-04 90 / 2.10; leaf at z 2.62 into bedroom 3',
  },
  {
    id: 'ui03-study',
    code: 'Ui-03',
    wall: 'up-study-hall',
    offset: 0.585,
    width: 0.9,
    height: 2.1,
    sill: 0,
    kind: 'door',
    state: 'open',
    leaf: leaf('start', 'left'),
    source: 'sheet 06 opening x 5.325…6.225, tag Ui-03 90 / 2.10; leaf at x 5.33 into the study',
  },
  {
    id: 'ui02-upper-bath',
    code: 'Ui-02',
    wall: 'up-bath-n',
    offset: 0.45,
    width: 0.8,
    height: 2.1,
    sill: 0,
    kind: 'door',
    state: 'open',
    leaf: leaf('end', 'right'),
    source: 'sheet 06 opening x 5.325…6.125, tag Ui-02 80 / 2.10; leaf at x 6.07 into the bathroom',
  },
];

export const upperRooms: Room[] = [
  {
    id: 'bedroom-3',
    name: 'Bedroom 3',
    level: 'upper',
    polygon: [
      [0.125, 0.125],
      [4.625, 0.125],
      [4.625, 2.31],
      [4.01, 2.31],
      [4.01, 2.425],
      [4.625, 2.425],
      [4.625, 3.625],
      [4.01, 3.625],
      [4.01, 3.74],
      [4.625, 3.74],
      [4.625, 7.125],
      [0.125, 7.125],
    ],
    floor: 'oak',
    ceiling: { type: 'roof', segment: 'upper' },
    expectedArea: 31.36,
    source: 'DORMITOR 3, A 31.36 m², parchet, H variabil 1.00–3.94 (plan fill 31.36 m²)',
  },
  {
    id: 'study',
    name: 'Study',
    level: 'upper',
    polygon: [
      [4.74, 0.125],
      [9.51, 0.125],
      [9.51, 2.31],
      [4.74, 2.31],
    ],
    floor: 'oak',
    ceiling: { type: 'roof', segment: 'upper' },
    expectedArea: 10.33,
    source: 'CAMERA, A 10.33 m², parchet, H variabil 1.00–2.87 (fill from x 4.779; walls 4.74)',
  },
  {
    id: 'upper-hall',
    name: 'Upper hall',
    level: 'upper',
    polygon: [
      [4.74, 2.425],
      [9.51, 2.425],
      [9.51, 3.625],
      [4.74, 3.625],
    ],
    floor: 'oak',
    ceiling: { type: 'roof', segment: 'upper' },
    expectedArea: 5.71,
    source: 'HOL, A 5.71 m², parchet, H variabil 2.98–3.94',
  },
  {
    id: 'upper-bathroom',
    name: 'Upper bathroom',
    level: 'upper',
    polygon: [
      [4.875, 3.74],
      [7.175, 3.74],
      [7.175, 5.525],
      [6.985, 5.525],
      [6.985, 7.125],
      [4.875, 7.125],
    ],
    floor: 'tile',
    ceiling: { type: 'roof', segment: 'upper' },
    expectedArea: 7.48,
    source: 'BAIE, A 7.48 m², gresie, H variabil 1.00–3.84',
  },
];

/** Finished floor (top only) on the structural slab. */
const finish = (id: string, polygon: Polygon, material: Slab['material']): Slab => ({
  id,
  polygon,
  bottom: Y - 0.05,
  top: Y,
  material,
  floorOnly: true,
});

export const upperLevel: Level = {
  id: 'upper',
  floorY: Y,
  walls: upperWalls,
  openings: upperOpenings,
  rooms: upperRooms,
  zones: [],
  slabs: [
    upperSlab,
    ...upperRooms.map((r) => finish(`floor-${r.id}`, r.polygon, r.floor)),
    // Arrival strip between the hall and the top of the stair (not a room on sheet 06).
    finish(
      'floor-stair-arrival',
      [
        [7.325, 3.625],
        [9.51, 3.625],
        [9.51, 3.635],
        [8.39, 3.635],
        [8.39, 3.875],
        [7.325, 3.875],
      ],
      'oak',
    ),
  ],
  stairs: [],
  voids: [
    [
      [9.625, 0.125],
      [16.475, 0.125],
      [16.475, 7.125],
      [9.625, 7.125],
    ],
  ],
  walkable: true,
};
