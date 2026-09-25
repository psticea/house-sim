/**
 * Basement (subsol) — transcribed from sheet 04 (1:50): axis 1 at x = 200.25 pt, axis B
 * at y = 273.25 pt (axis A at 60.65 pt), 1 m = 56.693 pt; checked against the chains
 * 5.75 (outer, x 7.075…12.525 incl. 15 cm insulation), 2.05 | 25 | 2.65 inside,
 * 3.25 (stair flight z 3.875…7.125) and the room fills (stair 3.93 m², storage 11.57 m²).
 *
 * Finished floor −2.53, storage H 2.24 ⇒ ceiling −0.29 (under the ground-floor build-up).
 * 25 cm concrete walls. Stair: 14 risers × 18 cm, 13 treads × 28 cm — 7 treads down the
 * west side from the ground floor (riser 14 at z 4.168), three winders around the
 * middle-wall corner and 3 treads eastwards under the main landing, arriving at x 9.162.
 * Light well ("curte de lumina", bottom −1.65) south of the stair with window F01.
 */
import { BASEMENT_STAIR_HOLE } from './ground';
import { LEVELS } from './grid';
import type { Level, Opening, Polygon, Room, Slab, Stairs, Vec2, Wall, WallLayer } from './schema';

const Y = LEVELS.basementFloor;
const CEILING = 2.24;
const concrete = (t: number): WallLayer[] => [{ thickness: t, material: 'plaster' }];

/** Walls reach the underside of the ground floor build-up (−0.06) or ±0.00 where a
 * ground-floor wall continues on top; under the south facade they stop at the plinth
 * of the ground-floor wall (−0.30). */
const TO_SCREED = -0.06 - Y;
const TO_FLOOR = 0 - Y;
const TO_PLINTH = -0.3 - Y;

const wall = (
  id: string,
  from: readonly [number, number],
  to: readonly [number, number],
  t: number,
  top: number,
  source: string,
  layers?: WallLayer[],
): Wall => ({
  id,
  level: 'basement',
  kind: layers ? 'exterior' : 'interior',
  from,
  to,
  top,
  layers: layers ?? concrete(t),
  source,
});

export const basementWalls: Wall[] = [
  wall('b-n', [7.075, 3.75], [12.525, 3.75], 0.25, TO_SCREED, 'concrete z 3.625…3.875'),
  wall('b-s', [7.075, 7.325], [12.525, 7.325], 0.4, TO_PLINTH, 'concrete z 7.125…7.375 + wool', [
    { thickness: 0.25, material: 'plaster' },
    { thickness: 0.15, material: 'plasterExterior' },
  ]),
  wall('b-w', [7.2, 3.875], [7.2, 7.125], 0.25, TO_FLOOR, 'concrete x 7.075…7.325'),
  wall('b-e', [12.4, 3.875], [12.4, 7.125], 0.25, TO_SCREED, 'concrete x 12.275…12.525'),
  wall('b-mid', [8.3325, 3.875], [8.3325, 6.06], 0.115, TO_FLOOR, 'brick x 8.275…8.39'),
  wall('b-landing', [8.275, 6.1175], [9.375, 6.1175], 0.115, TO_FLOOR, 'brick z 6.06…6.175'),
  wall('b-column', [9.375, 3.9], [9.625, 3.9], 0.05, TO_SCREED, 'column x 9.375…9.625'),
];

export const basementOpenings: Opening[] = [
  {
    id: 'f01-basement',
    code: 'F01',
    wall: 'b-s',
    offset: 0.675,
    width: 1.15,
    height: 0.75,
    sill: 1.0,
    kind: 'window',
    state: 'closed',
    source: 'sheet 04 opening x 7.75…8.90 (chain 42⁵ | 1.15 | 42⁵), tag F01 1.15 / 75, hp 1.00',
  },
];

export const basementRooms: Room[] = [
  {
    id: 'basement-stairs',
    name: 'Basement stairs',
    level: 'basement',
    polygon: [
      [7.325, 3.875],
      [8.275, 3.875],
      [8.275, 6.175],
      [9.162, 6.175],
      [9.162, 7.125],
      [7.325, 7.125],
    ],
    floor: 'oak',
    ceiling: { type: 'open' },
    expectedArea: 3.93,
    source: 'SCARA, A 3.93 m², parchet, H variabil −2.53…0.00 (plan fill 3.930 m²)',
  },
  {
    id: 'storage',
    name: 'Storage',
    level: 'basement',
    // Plan fill (11.565 m²) + the 0.21 m strip in front of the bottom step (x 9.162…
    // 9.375), where the stair opens into the storage.
    polygon: [
      [8.39, 3.875],
      [9.375, 3.875],
      [9.375, 3.925],
      [9.625, 3.925],
      [9.625, 3.875],
      [12.275, 3.875],
      [12.275, 7.125],
      [9.162, 7.125],
      [9.162, 6.175],
      [9.375, 6.175],
      [9.375, 6.06],
      [8.39, 6.06],
    ],
    floor: 'tile',
    ceiling: { type: 'flat', height: CEILING },
    expectedArea: 11.57,
    source: 'DEPOZITARE, A 11.57 m², gresie, H 2.24',
  },
];

const R = (0 - Y) / 14;

export const basementStairs: Stairs = {
  id: 'basement-stairs',
  level: 'basement',
  topY: LEVELS.groundFloor,
  risers: 14,
  riserHeight: 0.18,
  treads: 13,
  going: 0.28,
  flights: [
    // Treads 1–3 (bottom) rise westwards under the main landing, riser 1 at x 9.162.
    {
      x: [8.322, 9.162],
      z: [6.175, 7.125],
      direction: '-x',
      firstRiser: 1,
      treads: 3,
      going: 0.28,
      solid: true,
      rampFoot: true,
    },
    // Treads 7–13 rise northwards; riser 14 at z 4.168 arrives at ±0.00.
    {
      x: [7.325, 8.275],
      z: [4.168, 6.128],
      direction: '-z',
      firstRiser: 7,
      treads: 7,
      going: 0.28,
      solid: true,
      rampFoot: false,
    },
  ],
  landings: [],
  winders: {
    // Tread fills of sheet 04 (numbers 4, 5, 6 around the middle-wall corner).
    treads: [
      {
        polygon: [
          [7.767, 7.125],
          [8.322, 7.125],
          [8.322, 6.175],
          [8.275, 6.175],
        ],
        riser: 4,
      },
      {
        polygon: [
          [7.325, 7.125],
          [7.767, 7.125],
          [8.275, 6.175],
          [7.325, 6.683],
        ],
        riser: 5,
      },
      {
        polygon: [
          [7.325, 6.683],
          [8.275, 6.175],
          [8.275, 6.128],
          [7.325, 6.128],
        ],
        riser: 6,
      },
    ],
    // Ramp joins the bottom flight's top edge (x 8.322, riser 4) to the upper flight's
    // bottom edge (z 6.128, riser 7).
    pivot: [8.322, 6.128],
    lowDir: [0, 1],
    highDir: [-1, 0],
    lowRiser: 4,
    highRiser: 7,
    x: [7.325, 8.322],
    z: [6.128, 7.125],
  },
  railings: [
    {
      // "mana curenta h = 90 cm" on the middle wall and the partition (sheet 04).
      id: 'basement-handrail',
      top: [
        [8.225, Y + R * (7 + (6.128 - 4.05) / 0.28) + 0.9, 4.05],
        [8.225, Y + R * 7 + 0.9, 6.128],
        [8.322, Y + R * 5.5 + 0.9, 6.225],
        [9.162, Y + R * 1 + 0.9, 6.225],
        [9.35, Y + R * 0.33 + 0.9, 6.225],
      ],
    },
  ],
  connects: [
    { level: 'basement', room: 'basement-stairs' },
    { level: 'ground', room: 'stairs' },
  ],
};

/** Basement ceiling (ground-floor structure underside), minus the stair opening. */
export const BASEMENT_CEILING: Polygon = [
  [7.325, 3.875],
  [12.275, 3.875],
  [12.275, 7.125],
  [9.375, 7.125],
  [9.375, 6.175],
  [8.275, 6.175],
  [8.275, 4.168],
  [7.325, 4.168],
];

/**
 * Free edges of the ground-floor opening over the basement stair (the others are wall
 * faces): plaster skirt from the basement ceiling up to ±0.00, facing into the opening.
 */
export const STAIR_HOLE_SKIRTS: readonly { a: Vec2; b: Vec2; facing: Vec2 }[] = [
  { a: [7.325, 4.168], b: [8.275, 4.168], facing: [0, 1] },
  { a: [9.375, 6.175], b: [9.375, 7.125], facing: [-1, 0] },
];

const finish = (room: Room): Slab => ({
  id: `floor-${room.id}`,
  polygon: room.polygon,
  bottom: Y - 0.05,
  top: Y,
  material: room.floor,
  floorOnly: true,
});

export const basementLevel: Level = {
  id: 'basement',
  floorY: Y,
  walls: basementWalls,
  openings: basementOpenings,
  rooms: basementRooms,
  zones: [],
  slabs: [
    ...basementRooms.map(finish),
    {
      // Structural floor (collision) under the finishes.
      id: 'basement-floor',
      polygon: [
        [7.325, 3.875],
        [12.275, 3.875],
        [12.275, 7.125],
        [7.325, 7.125],
      ],
      bottom: Y - 0.25,
      top: Y - 0.01,
      material: 'concrete',
      floorOnly: true,
      collide: true,
      colliderTop: Y,
    },
    {
      id: 'basement-ceiling',
      polygon: BASEMENT_CEILING,
      bottom: Y + CEILING,
      top: -0.06,
      material: 'plaster',
      noSides: true,
    },
  ],
  stairs: [basementStairs],
  voids: [BASEMENT_STAIR_HOLE],
  walkable: true,
};
