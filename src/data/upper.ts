/**
 * Upper floor (etaj) — I1 massing only, from sheet 06 (grid origin x 195.16 pt,
 * z 256.575 pt). Not walkable yet (I2). The slab doubles as the ground-floor ceiling.
 */
import { LEVELS } from './grid';
import type { Level, Opening, Slab, Wall } from './schema';

export const upperSlab: Slab = {
  id: 'upper-slab',
  // Between the exterior walls' inner faces, up to the void edge (x 9.625).
  polygon: [
    [0.125, 0.125],
    [9.625, 0.125],
    [9.625, 7.125],
    [0.125, 7.125],
  ],
  // Stair well (both flights + landing, arrival at z ≈ 3.74).
  holes: [
    [
      [7.325, 3.625],
      [9.375, 3.625],
      [9.375, 7.125],
      [7.325, 7.125],
    ],
  ],
  bottom: LEVELS.groundCeiling,
  top: LEVELS.upperFloor,
  material: 'oak',
  bottomMaterial: 'plaster',
  sideMaterial: 'plaster',
  collide: true,
};

export const upperWalls: Wall[] = [
  {
    // Wall of the upper room/hall facing the living-room void (11.5 cm, x 9.51…9.625).
    id: 'up-void-n',
    level: 'upper',
    kind: 'interior',
    from: [9.5675, 0.125],
    to: [9.5675, 3.625],
    top: { roof: 'living' },
    layers: [{ thickness: 0.115, material: 'plaster' }],
    source: 'sheet 06 brick x 9.51…9.625, z 0.125…3.625',
  },
  {
    // Stair-side wall on the upper floor (25 cm, x 9.375…9.625).
    id: 'up-void-s',
    level: 'upper',
    kind: 'interior',
    from: [9.5, 3.625],
    to: [9.5, 7.125],
    top: { roof: 'living' },
    layers: [{ thickness: 0.25, material: 'plaster' }],
    source: 'sheet 06 brick x 9.375…9.625, z 3.75…7.125',
  },
];

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
    source: 'sheet 06 opening z 1.41…2.31 in the void wall, tag 90 × 90, hp 80',
  },
];

export const upperLevel: Level = {
  id: 'upper',
  floorY: LEVELS.upperFloor,
  walls: upperWalls,
  openings: upperOpenings,
  rooms: [],
  zones: [],
  slabs: [upperSlab],
  stairs: [],
  voids: [
    [
      [9.625, 0.125],
      [16.475, 0.125],
      [16.475, 7.125],
      [9.625, 7.125],
    ],
  ],
  walkable: false,
};
