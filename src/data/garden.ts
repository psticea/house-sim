/**
 * Garden & fence (I3, plan.md §6.3–6.4). Positions from the site plan sheet 03 (1:200)
 * where it gives them — lot line, gates (access arrows at the south-west corner), the
 * proposed trees ("arbori propusi", Ø 2.0 m symbols) and shrubs ("arbusti propusi",
 * Ø 1.5 m), the bin platform "PG", the round cover on the south-west yard — and the
 * owner-reviewed proposal of §6.3–6.4 for everything the plan leaves open (tree species,
 * meadow strips, beds, swing, fire pit, stepping stones, gravel strips, edging).
 *
 * Pure data (no three.js): the builders in src/world/garden.ts and the tests read it.
 */
import { LOT } from './site';
import type { Polygon, Vec2, Zone } from './schema';

const [NW, NE, SE, SW] = LOT as readonly [Vec2, Vec2, Vec2, Vec2];

/** x of the west / east lot line at depth z. */
export const lotWestX = (z: number): number =>
  SW[0] + ((z - SW[1]) / (NW[1] - SW[1])) * (NW[0] - SW[0]);
export const lotEastX = (z: number): number =>
  NE[0] + ((z - NE[1]) / (SE[1] - NE[1])) * (SE[0] - NE[0]);

// ---------------------------------------------------------------------------- fence

export type FenceKind = 'street' | 'privacy';

/** Straight fence run on the lot line (boards centred on it, posts every ≤ 2 m). */
export interface FenceRun {
  id: string;
  a: Vec2;
  b: Vec2;
  kind: FenceKind;
  height: number;
}

export interface Gate {
  id: string;
  kind: 'car' | 'pedestrian';
  /** Opening on the lot line, including the posts at both ends. */
  a: Vec2;
  b: Vec2;
  height: number;
  open: boolean;
  /** Pedestrian gate: hinge end (`a` or `b`). */
  hinge?: 'a' | 'b';
}

/** Street side (front yard, 1.2 m horizontal slats) and the gate posts along the south line. */
const FRONT_NORTH_X = -1.47; // east end of the front garden on the north line
const FRONT_SOUTH_X = -1.8; // east edge of the parking on the south line
const CAR_GATE_X: Vec2 = [-7.3, -4.2];

/**
 * Around the lot clockwise from the north-west corner: runs + gates cover the whole lot
 * line (tested). Street side = the front yard (setback 6 m, parking); sides and rear
 * 1.8 m privacy boards.
 */
export const FENCE: readonly FenceRun[] = [
  { id: 'north-front', a: NW, b: [FRONT_NORTH_X, NW[1]], kind: 'street', height: 1.2 },
  { id: 'north', a: [FRONT_NORTH_X, NW[1]], b: NE, kind: 'privacy', height: 1.8 },
  { id: 'east', a: NE, b: SE, kind: 'privacy', height: 1.8 },
  { id: 'south', a: SE, b: [FRONT_SOUTH_X, SE[1]], kind: 'privacy', height: 1.8 },
  {
    id: 'south-front',
    a: [FRONT_SOUTH_X, SE[1]],
    b: [CAR_GATE_X[1], SE[1]],
    kind: 'street',
    height: 1.2,
  },
  { id: 'west', a: SW, b: NW, kind: 'street', height: 1.2 },
];

/**
 * Car access (red arrow, x −6.92…−4.98) and pedestrian access (white arrow, x −8.89…−6.96)
 * both enter from the end of the public road at the lot's south-west corner. The sliding
 * car gate is shown closed; the pedestrian gate stands open (swung inwards).
 */
export const GATES: readonly Gate[] = [
  {
    id: 'car-gate',
    kind: 'car',
    a: [CAR_GATE_X[1], SE[1]],
    b: [CAR_GATE_X[0], SE[1]],
    height: 1.2,
    open: false,
  },
  {
    id: 'garden-gate',
    kind: 'pedestrian',
    a: [CAR_GATE_X[0], SE[1]],
    b: SW,
    height: 1.2,
    open: true,
    hinge: 'b',
  },
];

/** Made-up house number on the gate plate (never the real address). */
export const HOUSE_NUMBER = '12';

// ------------------------------------------------------------------------- planting

export type TreeKind = 'birch' | 'serviceberry' | 'multistem' | 'apple' | 'cherry';

export interface Tree {
  id: string;
  kind: TreeKind;
  x: number;
  z: number;
  /** Collision radius around the trunk(s) at the base. */
  trunkR: number;
  seed: number;
}

/** On the five "arbori propusi" symbols of sheet 03 (centres, house coordinates). */
export const TREES: readonly Tree[] = [
  // Front garden (north-west corner): a clump of silver birches.
  { id: 'birch', kind: 'birch', x: -6.73, z: -0.85, trunkR: 0.42, seed: 11 },
  // South garden: serviceberry and a multi-stem tree toward the terrace.
  { id: 'serviceberry', kind: 'serviceberry', x: 8.17, z: 13.06, trunkR: 0.3, seed: 23 },
  { id: 'multistem', kind: 'multistem', x: 14.9, z: 13.18, trunkR: 0.34, seed: 37 },
  // Rear garden: the two fruit trees.
  { id: 'apple', kind: 'apple', x: 24.08, z: -0.24, trunkR: 0.16, seed: 41 },
  { id: 'cherry', kind: 'cherry', x: 23.54, z: 13.05, trunkR: 0.17, seed: 53 },
];

export interface Shrub {
  id: string;
  x: number;
  z: number;
  r: number;
  seed: number;
}

/** On the five "arbusti propusi" symbols (Ø 1.5 m). Collision core r 0.4. */
export const SHRUBS: readonly Shrub[] = [
  { id: 'shrub-front', x: -4.3, z: -0.92, r: 0.75, seed: 3 },
  { id: 'shrub-north', x: 17.32, z: -1.56, r: 0.7, seed: 5 },
  { id: 'shrub-east-1', x: 24.41, z: 1.54, r: 0.75, seed: 7 },
  { id: 'shrub-east-2', x: 24.13, z: 4.03, r: 0.75, seed: 9 },
  { id: 'shrub-east-3', x: 24.23, z: 8.09, r: 0.75, seed: 13 },
];
export const SHRUB_CORE_R = 0.4;

const ellipse = (cx: number, cz: number, rx: number, rz: number, n: number): Vec2[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    // Slightly irregular, natural outline.
    const k = 1 + 0.06 * Math.sin(3 * a + 0.7) + 0.04 * Math.sin(5 * a + 2.1);
    return [cx + Math.cos(a) * rx * k, cz + Math.sin(a) * rz * k] as Vec2;
  });

/** Soft planting bed (bark mulch, grasses, flowers) around the birches and the front shrub. */
export const PLANTING_BEDS: readonly { id: string; polygon: Polygon }[] = [
  { id: 'front-bed', polygon: ellipse(-5.3, -1.0, 2.55, 1.25, 20) },
];

const EAST_MEADOW = 1.6; // meadow strip width along the east fence
const eastEdge = (z: number): number => lotEastX(z) - EAST_MEADOW;
const MEADOW_N = -1.95; // inner edge of the north strip
const MEADOW_S = 13.75; // inner edge of the south strip
const MEADOW_W = 6.9; // west end of the south strip (east of the bin corner)

/** Meadow strips (tall grasses + wildflowers) along the fences. */
export const MEADOWS: readonly { id: string; polygon: Polygon }[] = [
  {
    id: 'meadow-rear',
    polygon: [
      [11.7, -2.45],
      [lotEastX(-2.45) - 0.1, -2.45],
      [lotEastX(14.42) - 0.1, 14.42],
      [MEADOW_W, 14.42],
      [MEADOW_W, MEADOW_S],
      [eastEdge(MEADOW_S), MEADOW_S],
      [eastEdge(MEADOW_N), MEADOW_N],
      [11.7, MEADOW_N],
    ],
  },
  {
    id: 'meadow-north-front',
    polygon: [
      [-1.3, -2.45],
      [4.5, -2.45],
      [4.5, MEADOW_N],
      [-1.3, MEADOW_N],
    ],
  },
];

/** Low Corten edging (6 mm, 4 cm above the ground) between lawn, meadow and beds. */
export const EDGING: readonly { id: string; points: readonly Vec2[]; closed?: boolean }[] = [
  {
    id: 'edge-meadow-rear',
    points: [
      [11.7, MEADOW_N],
      [eastEdge(MEADOW_N), MEADOW_N],
      [eastEdge(MEADOW_S), MEADOW_S],
      [MEADOW_W, MEADOW_S],
    ],
  },
  {
    id: 'edge-meadow-north-front',
    points: [
      [-1.3, MEADOW_N],
      [4.5, MEADOW_N],
    ],
  },
  { id: 'edge-front-bed', points: PLANTING_BEDS[0]!.polygon, closed: true },
];

// ---------------------------------------------------------------------- paving

/** Gravel drainage strips along the facades (where no paving/deck meets the wall). */
export const GRAVEL: readonly { id: string; polygon: Polygon }[] = [
  {
    id: 'gravel-north',
    polygon: [
      [11.595, -0.93],
      [18.38, -0.93],
      [18.38, -0.33],
      [11.595, -0.33],
    ],
  },
  {
    id: 'gravel-south',
    polygon: [
      [-0.33, 7.58],
      [7.175, 7.58],
      [7.175, 8.08],
      [-0.33, 8.08],
    ],
  },
];

export interface SteppingStone {
  x: number;
  z: number;
  /** Size along / across the walking direction and rotation (rad). */
  w: number;
  d: number;
  rot: number;
}

/**
 * Natural stone stepping-stone path from the entrance walk around the house to the
 * terrace: along the north facade (set in the gravel strip) to the deck, and from the
 * south-west yard to the south deck strip.
 */
export const STEPPING_STONES: readonly SteppingStone[] = [
  ...Array.from({ length: 9 }, (_, i) => ({
    x: 12.05 + i * 0.74,
    z: -0.63,
    w: 0.46 + ((i * 7) % 3) * 0.04,
    d: 0.42 + ((i * 5) % 3) * 0.03,
    rot: [0.08, -0.05, 0.11, -0.09, 0.03, -0.12, 0.07, -0.02, 0.1][i]!,
  })),
  { x: 18.78, z: -0.6, w: 0.5, d: 0.44, rot: -0.2 },
  { x: 19.38, z: -0.26, w: 0.48, d: 0.4, rot: -0.45 },
  ...(
    [
      [5.55, 10.25, 0.12],
      [6.3, 10.06, -0.1],
      [7.05, 9.88, 0.2],
      [7.8, 9.7, -0.05],
      [8.55, 9.52, 0.15],
      [9.3, 9.36, -0.12],
    ] as const
  ).map(([x, z, rot], i) => ({ x, z, w: 0.52 - (i % 2) * 0.05, d: 0.42, rot })),
];

/** Round cover on the south-west yard (sheet 03, Ø 0.49 m blue disc). */
export const MANHOLE = { x: 4.745, z: 10.995, r: 0.245 };

// --------------------------------------------------------------------- features

export interface RaisedBed {
  id: string;
  min: Vec2;
  max: Vec2;
  height: number;
}

/** Raised timber vegetable beds in the sunny south garden (1.2 × 2.4 m, 40 cm). */
export const RAISED_BEDS: readonly RaisedBed[] = [
  { id: 'bed-1', min: [16.6, 10.1], max: [19.0, 11.3], height: 0.4 },
  { id: 'bed-2', min: [19.8, 10.1], max: [22.2, 11.3], height: 0.4 },
  { id: 'bed-3', min: [16.6, 12.1], max: [19.0, 13.3], height: 0.4 },
  { id: 'bed-4', min: [19.8, 12.1], max: [22.2, 13.3], height: 0.4 },
];

/** Swing on an A-frame: beam along x, seat swinging along z. */
export const SWING = { x: 11.7, z: 11.4, span: 2.2, height: 2.3, splay: 0.75 };

/** Fire pit (Corten bowl on a gravel circle), timber bench on stone blocks, log stools. */
export const FIRE_PIT = { x: 22.0, z: 5.9, r: 0.45, height: 0.35, gravelR: 1.5 };
export const BENCH = { min: [23.05, 5.0] as Vec2, max: [23.45, 6.8] as Vec2, seat: 0.45 };
export const STOOLS: readonly Vec2[] = [
  [21.05, 4.85],
  [21.0, 6.95],
];
export const STOOL_R = 0.2;

/** Large clay pots on the deck (±0.00): olive trees, one with grasses. */
export const PLANTERS: readonly { x: number; z: number; r: number; plant: 'olive' | 'grass' }[] = [
  { x: 19.42, z: 0.55, r: 0.32, plant: 'olive' },
  { x: 19.45, z: 1.25, r: 0.22, plant: 'grass' },
  { x: 9.9, z: 8.6, r: 0.32, plant: 'olive' },
];

/** Bin corner "PG" (platformă gospodărească, 1.50 m²): timber slat screen, 2 bins. */
export const BIN_CORNER = { min: [5.04, 13.67] as Vec2, max: [6.79, 14.525] as Vec2, height: 1.3 };

// ---------------------------------------------------------------------- context

/** Neighbour houses (simple massing, context only). ridge: direction of the ridge. */
export const NEIGHBOURS: readonly {
  min: Vec2;
  max: Vec2;
  eave: number;
  ridgeY: number;
  ridge: 'x' | 'z';
}[] = [
  { min: [2.5, -16.5], max: [14.0, -9.5], eave: 3.0, ridgeY: 6.4, ridge: 'x' },
  { min: [33.0, -1.5], max: [41.0, 8.5], eave: 2.9, ridgeY: 5.9, ridge: 'z' },
  { min: [4.5, 22.5], max: [15.5, 30.0], eave: 3.1, ridgeY: 6.6, ridge: 'x' },
  { min: [22.0, 23.0], max: [30.5, 32.0], eave: 2.9, ridgeY: 6.0, ridge: 'z' },
  { min: [-27.0, -3.0], max: [-19.0, 7.5], eave: 3.0, ridgeY: 6.2, ridge: 'z' },
];

/**
 * End of the public road in front of the pedestrian gate: walkable, bounded by invisible
 * walls (the road itself continues south out of reach).
 */
export const STREET_AREA: Polygon = [
  [-11.96, SW[1]],
  [-4.96, SW[1]],
  [-5.16, 22.0],
  [-12.16, 22.0],
];

// ------------------------------------------------------------------------ places

const zone = (id: string, name: string, polygon: Polygon): Zone => ({
  id,
  name,
  level: 'ground',
  polygon,
});

/**
 * Garden places for the toast (checked before rooms, in this order; none overlaps the
 * house or the terrace deck). The parking zone lives with the ground-floor zones.
 */
export const GARDEN_ZONES: readonly Zone[] = [
  zone('front-garden', 'Front garden', [
    [-8.2, -2.7],
    [FRONT_NORTH_X, -2.7],
    [FRONT_NORTH_X, 2.52],
    [-8.3, 2.52],
  ]),
  zone('front-path', 'Front path', [
    [FRONT_NORTH_X, -2.7],
    [4.595, -2.7],
    [4.595, -0.33],
    [-0.33, -0.33],
    [-0.33, 9.53],
    [5.04, 9.53],
    [5.04, 14.6],
    [FRONT_SOUTH_X, 14.6],
    [FRONT_NORTH_X, 2.52],
  ]),
  zone('north-side', 'North side', [
    [4.595, -2.7],
    [20.5, -2.7],
    [20.5, 0.125],
    [18.38, 0.125],
    [18.38, -0.33],
    [11.595, -0.33],
    [11.595, -2.28],
    [4.595, -2.28],
  ]),
  zone('fire-pit', 'Fire pit', [
    [20.3, 4.2],
    [23.7, 4.2],
    [23.7, 7.6],
    [20.3, 7.6],
  ]),
  zone('rear-garden', 'Rear garden', [
    [20.5, -2.7],
    [26.0, -2.7],
    [26.0, 9.8],
    [19.776, 9.8],
    [19.776, 0.125],
    [20.5, 0.125],
  ]),
  zone('vegetable-beds', 'Vegetable beds', [
    [16.2, 9.8],
    [22.6, 9.8],
    [22.6, 13.7],
    [16.2, 13.7],
  ]),
  zone('swing', 'Swing', [
    [10.3, 10.3],
    [13.1, 10.3],
    [13.1, 12.5],
    [10.3, 12.5],
  ]),
  zone('south-garden', 'South garden', [
    [-0.33, 7.58],
    [9.375, 7.58],
    [9.375, 9.025],
    [19.776, 9.025],
    [19.776, 9.8],
    [26.0, 9.8],
    [26.0, 14.6],
    [5.04, 14.6],
    [5.04, 9.53],
    [-0.33, 9.53],
  ]),
  zone('street', 'Street', STREET_AREA),
];

// -------------------------------------------------------------------- obstacles

/** Fence runs and gates chained around the lot line from the north-west corner. */
export function fencePerimeter(): (
  { kind: 'run'; run: FenceRun; a: Vec2; b: Vec2 } | { kind: 'gate'; gate: Gate; a: Vec2; b: Vec2 }
)[] {
  const all = [
    ...FENCE.map((run) => ({ kind: 'run' as const, run, a: run.a, b: run.b })),
    ...GATES.map((gate) => ({ kind: 'gate' as const, gate, a: gate.a, b: gate.b })),
  ];
  const out: typeof all = [];
  let cur: Vec2 = NW;
  for (let k = 0; k < all.length; k++) {
    const next = all.find((s) => Math.hypot(s.a[0] - cur[0], s.a[1] - cur[1]) < 1e-6);
    if (!next || out.includes(next)) break;
    out.push(next);
    cur = next.b;
  }
  return out;
}

/** Simplified collision shapes of the garden (the builders use the same data). */
export type Obstacle =
  | { id: string; kind: 'circle'; x: number; z: number; r: number }
  | { id: string; kind: 'box'; min: Vec2; max: Vec2 }
  | { id: string; kind: 'segment'; a: Vec2; b: Vec2; halfWidth: number };

export const FENCE_HALF_WIDTH = 0.05;

/** Swing A-frame legs (plan footprints) and the seat. */
export function swingParts(): { legs: [Vec2, Vec2][]; seat: { min: Vec2; max: Vec2 } } {
  const { x, z, span, splay } = SWING;
  const legs: [Vec2, Vec2][] = [];
  for (const ex of [x - span / 2, x + span / 2]) {
    legs.push([
      [ex, z],
      [ex, z - splay],
    ]);
    legs.push([
      [ex, z],
      [ex, z + splay],
    ]);
  }
  return {
    legs,
    seat: {
      min: [x - 0.25, z - 0.1],
      max: [x + 0.25, z + 0.1],
    },
  };
}

export function gardenObstacles(): Obstacle[] {
  const out: Obstacle[] = [];
  for (const r of FENCE)
    out.push({ id: r.id, kind: 'segment', a: r.a, b: r.b, halfWidth: FENCE_HALF_WIDTH });
  for (const g of GATES) {
    if (!g.open)
      out.push({ id: g.id, kind: 'segment', a: g.a, b: g.b, halfWidth: FENCE_HALF_WIDTH });
  }
  // Street area beyond the open garden gate: invisible walls.
  for (let i = 1; i < STREET_AREA.length; i++) {
    out.push({
      id: `street-bound-${i}`,
      kind: 'segment',
      a: STREET_AREA[i]!,
      b: STREET_AREA[(i + 1) % STREET_AREA.length]!,
      halfWidth: FENCE_HALF_WIDTH,
    });
  }
  out.push({
    id: 'street-bound-lot-corner',
    kind: 'segment',
    a: STREET_AREA[0]!,
    b: SW,
    halfWidth: FENCE_HALF_WIDTH,
  });
  for (const t of TREES) out.push({ id: t.id, kind: 'circle', x: t.x, z: t.z, r: t.trunkR });
  for (const s of SHRUBS) out.push({ id: s.id, kind: 'circle', x: s.x, z: s.z, r: SHRUB_CORE_R });
  for (const b of RAISED_BEDS) out.push({ id: b.id, kind: 'box', min: b.min, max: b.max });
  const sw = swingParts();
  sw.legs.forEach(([a, b], i) =>
    out.push({ id: `swing-leg-${i}`, kind: 'segment', a, b, halfWidth: 0.05 }),
  );
  out.push({ id: 'swing-seat', kind: 'box', ...sw.seat });
  out.push({ id: 'fire-pit', kind: 'circle', x: FIRE_PIT.x, z: FIRE_PIT.z, r: FIRE_PIT.r });
  out.push({ id: 'bench', kind: 'box', min: BENCH.min, max: BENCH.max });
  STOOLS.forEach(([x, z], i) => out.push({ id: `stool-${i}`, kind: 'circle', x, z, r: STOOL_R }));
  for (const p of PLANTERS)
    out.push({ id: `planter-${p.x}`, kind: 'circle', x: p.x, z: p.z, r: p.r });
  const bc = BIN_CORNER;
  out.push({ id: 'bins', kind: 'box', min: [bc.min[0] + 0.2, bc.min[1]], max: bc.max });
  return out;
}
