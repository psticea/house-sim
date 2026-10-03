/**
 * I5 furniture: every piece inside its room and under its (sloped) ceiling, door swings,
 * passages and stairs kept clear, walkways along the e2e routes ≥ 0.8 m, the minimum set
 * per room, material coverage and the triangle budget.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  FURNITURE,
  floorOf,
  footprint,
  furnitureColliders,
  type FurnitureItem,
} from '../src/data/furniture';
import { distToSegment } from '../src/data/clip';
import {
  isPassable,
  pointInPolygon,
  polygonBounds,
  roofSegment,
  roofUndersideY,
  wallFrame,
  wallThickness,
} from '../src/data/geometry2d';
import { house } from '../src/data/house';
import type { Level, LevelId, Polygon, Vec2 } from '../src/data/schema';
import { levelById, roomAt } from '../src/data/topology';
import { buildWorld } from '../src/world/build';
import { FINISHES } from '../src/world/finishes';
import { attachFurniture, buildFurniture } from '../src/world/furniture';
import { PALETTE } from '../src/world/materials';
import { BORDERLANDS, SKETCHUP } from '../src/world/style';

type Rect = { minX: number; maxX: number; minZ: number; maxZ: number };

const rectOf = (poly: readonly Vec2[]): Rect => polygonBounds(poly);
const overlap = (a: Rect, b: Rect, eps = 0.005): boolean =>
  a.minX < b.maxX - eps && b.minX < a.maxX - eps && a.minZ < b.maxZ - eps && b.minZ < a.maxZ - eps;

function distToBoundary(x: number, z: number, poly: Polygon): number {
  let d = Infinity;
  for (let i = 0; i < poly.length; i++) {
    d = Math.min(d, distToSegment(x, z, poly[i]!, poly[(i + 1) % poly.length]!));
  }
  return d;
}

const dist = (p: Vec2, a: Vec2, b: Vec2): number => distToSegment(p[0], p[1], a, b);

function rectSegmentDistance(r: Rect, a: Vec2, b: Vec2): number {
  // Separating distance between an axis-aligned rectangle and a segment (0 if they cross).
  const inside = (p: Vec2) => p[0] >= r.minX && p[0] <= r.maxX && p[1] >= r.minZ && p[1] <= r.maxZ;
  if (inside(a) || inside(b)) return 0;
  const corners: Vec2[] = [
    [r.minX, r.minZ],
    [r.maxX, r.minZ],
    [r.maxX, r.maxZ],
    [r.minX, r.maxZ],
  ];
  let d = Infinity;
  for (let i = 0; i < 4; i++) {
    const c0 = corners[i]!;
    const c1 = corners[(i + 1) % 4]!;
    d = Math.min(d, dist(c0, a, b), dist(c1, a, b), dist(a, c0, c1), dist(b, c0, c1));
    // Proper crossing of the segment with a rectangle edge.
    const cr = (p: Vec2, q: Vec2, s: Vec2) =>
      (q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]);
    if (cr(a, b, c0) * cr(a, b, c1) < 0 && cr(c0, c1, a) * cr(c0, c1, b) < 0) return 0;
  }
  return d;
}

const level = (id: LevelId): Level => levelById(house, id);
const room = (it: FurnitureItem) => level(it.level).rooms.find((r) => r.id === it.room)!;
const colliders = furnitureColliders();
const isFlat = (it: FurnitureItem) => it.kind === 'rug' || it.kind === 'hearth';

/** Door swing squares (hinge side, open leaf) and the clear passage of every doorway. */
function doorZones(lv: Level): { id: string; passage: Rect; swing: Rect | null }[] {
  const out: { id: string; passage: Rect; swing: Rect | null }[] = [];
  for (const o of lv.openings) {
    if (!isPassable(o)) continue;
    const w = lv.walls.find((x) => x.id === o.wall)!;
    const { dir, left } = wallFrame(w);
    const t = wallThickness(w) / 2;
    const at = (u: number, v: number): Vec2 => [
      w.from[0] + dir[0] * u + left[0] * v,
      w.from[1] + dir[1] * u + left[1] * v,
    ];
    const clear = 0.5;
    const passage = rectOf([
      at(o.offset, -t - clear),
      at(o.offset + o.width, -t - clear),
      at(o.offset + o.width, t + clear),
      at(o.offset, t + clear),
    ]);
    let swing: Rect | null = null;
    if (o.leaf) {
      const s = o.leaf.swing === 'left' ? 1 : -1;
      const u0 = o.leaf.hinge === 'start' ? o.offset : o.offset + o.width;
      const u1 = o.leaf.hinge === 'start' ? o.offset + o.width : o.offset;
      swing = rectOf([
        at(u0, s * t),
        at(u1, s * t),
        at(u1, s * (t + o.width)),
        at(u0, s * (t + o.width)),
      ]);
    }
    out.push({ id: o.id, passage, swing });
  }
  return out;
}

/** Walking routes of tests/e2e/walk.spec.ts (per level), which need ≥ 0.8 m walkways. */
const ROUTES: Record<LevelId, Vec2[][]> = {
  ground: [
    [
      [8.775, -0.9],
      [8.775, 1.2],
      [8.2, 3.05],
      [3.7, 3.05],
      [2.2, 3.05],
    ],
    [
      [3.7, 3.05],
      [4.1, 3.2],
      [4.1, 4.8],
      [4.1, 3.2],
      [5.86, 3.1],
      [5.86, 4.4],
      [5.75, 5.7],
      [5.86, 4.4],
      [5.86, 3.1],
    ],
    [
      [5.76, 3.0],
      [5.76, 1.4],
    ],
    [
      [5.76, 3.0],
      [8.9, 3.3],
      [8.9, 3.9],
    ],
    [
      [8.9, 3.05],
      [11.0, 3.05],
      [10.6, 5.5],
      [10.9, 3.2],
      [15.5, 3.2],
      [16.0, 3.2],
      [16.0, 1.75],
      [17.6, 1.75],
      [19.1, 2.37],
      [19.1, 8.3],
      [12.9, 8.3],
      [12.9, 6.5],
    ],
  ],
  upper: [
    [
      [7.8, 4.2],
      [7.8, 3.3],
      [5.775, 3.0],
      [5.775, 1.5],
      [8.45, 2.05],
    ],
    [
      [5.775, 3.0],
      [5.2, 3.0],
      [3.8, 3.0],
      [2.5, 3.0],
    ],
    [
      [5.2, 3.0],
      [5.6, 3.1],
      [5.75, 4.4],
    ],
    [
      [5.6, 3.1],
      [7.8, 3.3],
    ],
  ],
  basement: [
    [
      [9.6, 6.65],
      [11.0, 5.0],
    ],
  ],
};

describe('furniture placement (plan.md §6.2)', () => {
  it('ids are unique and every item sits in the room it names', () => {
    expect(new Set(FURNITURE.map((f) => f.id)).size).toBe(FURNITURE.length);
    for (const it of FURNITURE) {
      expect(roomAt(level(it.level), it.at[0], it.at[1]), it.id).toBe(it.room);
    }
  });

  it('every footprint lies inside its room polygon (wall pieces may touch the wall)', () => {
    for (const it of FURNITURE) {
      const poly = room(it).polygon;
      const tol = it.wall ? 0.02 : 0.005;
      for (const [x, z] of footprint(it)) {
        const ok = pointInPolygon(x, z, poly) || distToBoundary(x, z, poly) <= tol;
        expect(ok, `${it.id} corner ${x.toFixed(3)}, ${z.toFixed(3)}`).toBe(true);
      }
    }
  });

  it('everything fits under the ceiling (flat, sloped roof, basement)', () => {
    for (const it of FURNITURE) {
      const r = room(it);
      if (r.ceiling.type === 'open') continue;
      const floor = floorOf(it.level);
      const top = (it.on ?? 0) + (it.kind === 'pendant' ? 0 : (it.y ?? 0)) + it.size[2];
      const ceil =
        r.ceiling.type === 'flat'
          ? () => r.ceiling.type === 'flat' && r.ceiling.height
          : (z: number) =>
              r.ceiling.type === 'roof' &&
              roofUndersideY(house.roof, roofSegment(house.roof, r.ceiling.segment), z) - floor;
      for (const [, z] of footprint(it)) {
        const c = ceil(z) as number;
        const margin = it.kind === 'pendant' ? 0.5 : 0.05;
        expect(top, `${it.id} top ${top.toFixed(2)} under ${c.toFixed(2)}`).toBeLessThan(
          c - margin,
        );
      }
    }
  });

  it('no collider in a doorway passage or a door swing; nothing stands in a swing', () => {
    for (const lvId of ['basement', 'ground', 'upper'] as const) {
      const zones = doorZones(level(lvId));
      for (const c of colliders.filter((x) => x.level === lvId)) {
        const r: Rect = { minX: c.min[0], maxX: c.max[0], minZ: c.min[2], maxZ: c.max[2] };
        for (const zn of zones) {
          expect(overlap(r, zn.passage), `${c.id} blocks ${zn.id}`).toBe(false);
          if (zn.swing)
            expect(overlap(r, zn.swing), `${c.id} in the swing of ${zn.id}`).toBe(false);
        }
      }
      for (const it of FURNITURE.filter((x) => x.level === lvId && !isFlat(x))) {
        const r = rectOf(footprint(it));
        for (const zn of zones) {
          if (zn.swing && !it.wall)
            expect(overlap(r, zn.swing), `${it.id} in the swing of ${zn.id}`).toBe(false);
        }
      }
    }
  });

  it('stairs, landings and the stair well stay clear', () => {
    const ground = level('ground');
    const stairRects: { level: LevelId; r: Rect }[] = [];
    for (const lv of house.levels) {
      for (const st of lv.stairs) {
        for (const fl of st.flights) {
          stairRects.push({
            level: lv.id,
            r: { minX: fl.x[0], maxX: fl.x[1], minZ: fl.z[0], maxZ: fl.z[1] },
          });
        }
        for (const l of st.landings) stairRects.push({ level: lv.id, r: rectOf(l.polygon) });
      }
    }
    // Upper-floor stair well (open to the ground-floor stair).
    const stairs = ground.rooms.find((r) => r.id === 'stairs')!;
    stairRects.push({ level: 'upper', r: { ...rectOf(stairs.polygon), minZ: 3.74 } });
    for (const it of FURNITURE) {
      const r = rectOf(footprint(it));
      for (const s of stairRects.filter((x) => x.level === it.level)) {
        expect(overlap(r, s.r), `${it.id} on the stairs`).toBe(false);
      }
    }
  });

  it('walkways along the e2e routes are at least 0.8 m wide', () => {
    for (const c of colliders) {
      const r: Rect = { minX: c.min[0], maxX: c.max[0], minZ: c.min[2], maxZ: c.max[2] };
      for (const route of ROUTES[c.level]) {
        for (let i = 0; i + 1 < route.length; i++) {
          const d = rectSegmentDistance(r, route[i]!, route[i + 1]!);
          expect(
            d,
            `${c.id} ${d.toFixed(2)} m from ${String(route[i])} → ${String(route[i + 1])}`,
          ).toBeGreaterThanOrEqual(0.4);
        }
      }
    }
  });

  it('the pieces drawn on the plans are all placed, per room (sheets 05 / 06)', () => {
    // Furniture symbols read from the sheets' vectors (src/data/furniture.ts header).
    const PLANS: Record<string, Partial<Record<FurnitureItem['kind'], number>>> = {
      'entrance-hall': { hallJoinery: 1 },
      'living-kitchen': {
        kitchenTall: 1,
        kitchenRun: 1,
        island: 1,
        diningTable: 1,
        diningChair: 6,
        sofa: 1,
        ottoman: 1,
        coffeeTable: 1,
        tubChair: 1,
        stove: 1,
      },
      'bedroom-1': { bed: 1, wardrobe: 1, desk: 1, deskChair: 1 },
      'bedroom-2': { wardrobe: 1, bed: 1, bedside: 2, armchair: 1 },
      bathroom: { vanity: 1, wc: 2, showerScreen: 1, showerHead: 1, tub: 1 },
      'boiler-laundry': { laundryRun: 1 },
      // Bedroom 3 is furnished by the owner's choice, not per the plans (test below).
      study: { bookshelf: 3, desk: 1, deskChair: 1 },
      'upper-hall': { wardrobe: 1 },
      'upper-bathroom': { vanity: 1, wc: 1, showerScreen: 2, showerHead: 1 },
    };
    const fromPlans = FURNITURE.filter((f) => /^sheet 0[456]: /.test(f.source));
    for (const [roomId, kinds] of Object.entries(PLANS)) {
      const got: Record<string, number> = {};
      for (const f of fromPlans.filter((x) => x.room === roomId))
        got[f.kind] = (got[f.kind] ?? 0) + 1;
      expect(got, roomId).toEqual(kinds);
    }
    for (const f of fromPlans) expect(Object.keys(PLANS), f.id).toContain(f.room);
    // Every other piece says why it is there.
    for (const f of FURNITURE) {
      expect(f.source, f.id).toMatch(
        /^(sheet 0[456]: |not on plans: |extra: |owner choice — not per plans: )/,
      );
      if (f.source.startsWith('extra: '))
        expect(f.collide ?? false, `${f.id}: extras don't collide`).toBe(false);
    }
    // Rooms the plans leave unfurnished still get a sensible minimal set.
    const has = (roomId: string, kind: FurnitureItem['kind'], n = 1) =>
      expect(
        FURNITURE.filter((f) => f.room === roomId && f.kind === kind).length,
        `${roomId}: ${kind}`,
      ).toBeGreaterThanOrEqual(n);
    has('storage', 'shelving', 2);
    has('boiler-laundry', 'boiler');
    has('living-kitchen', 'teepee');
    has('terrace', 'outdoorTable');
    has('terrace', 'lounger', 2);
    // Large pieces collide.
    for (const it of FURNITURE) {
      if (
        [
          'bed',
          'sofa',
          'ottoman',
          'diningTable',
          'kitchenRun',
          'kitchenTall',
          'island',
          'wardrobe',
          'hallJoinery',
          'tub',
          'vanity',
          'laundryRun',
          'bookshelf',
          'desk',
          'stove',
        ].includes(it.kind)
      ) {
        expect(it.collide, `${it.id} collides`).toBe(true);
      }
    }
  });

  it('pieces sit on their drawn symbols (footprint bounds within 3 cm)', () => {
    let n = 0;
    for (const it of FURNITURE) {
      if (!it.plan) continue;
      const r = rectOf(footprint(it));
      const [x0, z0, x1, z1] = it.plan;
      for (const [a, b] of [
        [r.minX, x0],
        [r.minZ, z0],
        [r.maxX, x1],
        [r.maxZ, z1],
      ] as const) {
        expect(Math.abs(a - b), `${it.id} ${a.toFixed(3)} vs drawn ${b.toFixed(3)}`).toBeLessThan(
          0.03,
        );
      }
      n++;
    }
    // 53 drawn before; bedroom 3 (15 drawn pieces) now follows the owner instead.
    expect(n).toBeGreaterThanOrEqual(38);
  });

  it('the open curtain-wall door and the F-07 opening stay clear', () => {
    const ground = level('ground');
    const door = ground.openings.find((o) => o.id === 'cw-door')!;
    const cw = ground.walls.find((w) => w.id === door.wall)!;
    const z0 = cw.from[1] + door.offset;
    // Leaf open 90? outward onto the deck + the doorway either side (0.9 m).
    const zone: Rect = {
      minX: 16.475 - 0.9,
      maxX: 16.745 + door.width + 0.1,
      minZ: z0 - 0.06,
      maxZ: z0 + door.width + 0.05,
    };
    for (const it of FURNITURE.filter((f) => f.level === 'ground' && !isFlat(f))) {
      expect(overlap(rectOf(footprint(it)), zone), `${it.id} at the glass door`).toBe(false);
    }
  });

  const upperCeil = (z: number): number =>
    roofUndersideY(house.roof, roofSegment(house.roof, 'upper'), z) - floorOf('upper');

  it('bedroom 3 follows the owner, not the plans: a calm set under the slopes', () => {
    const b3 = FURNITURE.filter((f) => f.room === 'bedroom-3');
    for (const f of b3) {
      expect(f.source, f.id).toMatch(/^owner choice — not per plans: /);
      expect(f.plan, `${f.id}: not on a drawn symbol`).toBeUndefined();
    }
    const count = (k: FurnitureItem['kind']) => b3.filter((f) => f.kind === k).length;
    for (const k of ['bed', 'bench', 'armchair', 'floorLamp', 'rug'] as const)
      expect(count(k), k).toBe(1);
    expect(count('plant')).toBeGreaterThanOrEqual(1);
    expect(b3.length, 'uncluttered').toBeLessThanOrEqual(16);
    // One line of low oak cupboards (0.90) along both knee walls.
    const low = b3.filter((f) => f.kind === 'wardrobe');
    for (const f of low) {
      expect(f.opts?.low, f.id).toBe(true);
      expect(f.size[2], f.id).toBe(0.9);
    }
    expect(low.some((f) => rectOf(footprint(f)).minZ < 0.13)).toBe(true);
    expect(low.some((f) => rectOf(footprint(f)).maxZ > 7.12)).toBe(true);
    // The bed stands in the tall band (≥ 1.9 m over its whole footprint), head on a wall.
    const bed = b3.find((f) => f.kind === 'bed')!;
    const r = rectOf(footprint(bed));
    expect(Math.min(upperCeil(r.minZ), upperCeil(r.maxZ))).toBeGreaterThan(1.9);
    expect(r.maxX).toBeGreaterThan(4.6);
    // Large pieces either join up (corner cupboards) or leave ≥ 0.8 m to walk between.
    const boxes = colliders.filter((c) => b3.some((f) => f.id === c.id));
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const dx = Math.max(0, a.min[0] - b.max[0], b.min[0] - a.max[0]);
        const dz = Math.max(0, a.min[2] - b.max[2], b.min[2] - a.max[2]);
        const d = Math.hypot(dx, dz);
        expect(d < 0.01 || d >= 0.8, `${a.id} ↔ ${b.id}: ${d.toFixed(2)} m`).toBe(true);
      }
    }
  });

  it('the study desk runs the full length of the east wall, under the F-02 sill', () => {
    const desk = FURNITURE.find((f) => f.id === 'study-desk')!;
    const study = level('upper').rooms.find((x) => x.id === 'study')!;
    const walls = rectOf(study.polygon);
    const r = rectOf(footprint(desk));
    for (const gap of [r.minZ - walls.minZ, walls.maxZ - r.maxZ, walls.maxX - r.maxX]) {
      expect(gap).toBeGreaterThan(0);
      expect(gap).toBeLessThan(0.006);
    }
    expect(r.maxX - r.minX).toBeGreaterThanOrEqual(0.6);
    expect(r.maxX - r.minX).toBeLessThanOrEqual(0.7);
    expect(desk.size[2]).toBeGreaterThanOrEqual(0.74);
    expect(desk.size[2]).toBeLessThanOrEqual(0.75);
    const f02 = level('upper').openings.find((o) => o.id === 'f02-upper-void')!;
    expect(desk.size[2]).toBeLessThan(f02.sill);
    // The chair sits at the desk with ≥ 1.8 m of ceiling over the sitter.
    const chair = FURNITURE.find((f) => f.id === 'study-chair')!;
    expect(upperCeil(chair.at[1])).toBeGreaterThan(1.8);
    expect(rectOf(footprint(chair)).maxX).toBeLessThanOrEqual(r.minX + 0.01);
  });

  it('the kitchen wall run has wall cupboards over its whole length, clear of openings', () => {
    const run = FURNITURE.find((f) => f.id === 'kitchen-run')!;
    const fridge = FURNITURE.find((f) => f.id === 'kitchen-fridge')!;
    // Up to the fridge column's top and meeting it; the run itself ends at the room's
    // glass end (the cupboards span the run's full width in the builder).
    expect(run.opts?.uppers).toBe(fridge.size[2]);
    expect(run.opts?.hood).toBe(true);
    const r = rectOf(footprint(run));
    expect(Math.abs(r.minX - rectOf(footprint(fridge)).maxX)).toBeLessThan(0.005);
    // Cupboards from the splashback top (+1.50, 0.60 over the worktop) to +2.40: no
    // north-wall opening over the run at that height.
    const ground = level('ground');
    const wall = ground.walls.find((w) => w.id === 'ext-n')!;
    for (const o of ground.openings.filter((x) => x.wall === wall.id)) {
      const x0 = wall.from[0] + o.offset;
      const clash = x0 < r.maxX && x0 + o.width > r.minX && o.sill < 2.4 && o.sill + o.height > 1.5;
      expect(clash, o.id).toBe(false);
    }
    // Pendants hang well clear of the cupboard fronts (0.35 deep).
    for (const p of FURNITURE.filter((f) => f.room === 'living-kitchen' && f.kind === 'pendant'))
      expect(rectOf(footprint(p)).minZ - (r.minZ + 0.35), p.id).toBeGreaterThan(0.5);
  });
});

describe('furniture geometry', () => {
  const built = buildFurniture();

  it('stays within the triangle budget (≤ 60 k) and uses a modest set of materials', () => {
    expect(built.mesh.triangleCount).toBeLessThan(60_000);
    expect(built.mesh.triangleCount).toBeGreaterThan(5_000);
    const ids = built.mesh.materials();
    for (const id of ids) expect(PALETTE[id], id).toBeDefined();
    const furnitureOnly = [
      'joinery',
      'smokedOak',
      'travertine',
      'linen',
      'wool',
      'cane',
      'ceramic',
      'brass',
      'mirror',
    ];
    for (const id of furnitureOnly) expect(ids, id).toContain(id);
  });

  it('new materials have a realistic finish and render in both stylised looks', () => {
    for (const id of [
      'joinery',
      'smokedOak',
      'travertine',
      'linen',
      'wool',
      'cane',
      'ceramic',
      'brass',
      'mirror',
    ] as const) {
      expect(FINISHES[id], id).toBeDefined();
      expect(PALETTE[id].color).toMatch(/^#[0-9A-F]{6}$/i);
      // Soft upholstery is outlined by its silhouette hull only; everything else gets lines.
      expect(SKETCHUP.noLines.includes(id)).toBe(id === 'linen');
      expect(BORDERLANDS.noLines.includes(id)).toBe(id === 'linen');
    }
    for (const id of ['linen', 'ceramic', 'cane'] as const) {
      expect(SKETCHUP.hulls!.only).toContain(id);
      expect(BORDERLANDS.hulls!.only).toContain(id);
    }
  });

  it('no degenerate or non-finite triangles', () => {
    for (const [id, g] of built.mesh.toGeometries()) {
      const p = g.getAttribute('position').array;
      let bad = 0;
      for (let i = 0; i < p.length; i++) if (!Number.isFinite(p[i])) bad++;
      expect(bad, id).toBe(0);
      const n = g.getAttribute('normal').array;
      let zero = 0;
      for (let i = 0; i < n.length; i += 3)
        if (Math.hypot(n[i]!, n[i + 1]!, n[i + 2]!) < 0.5) zero++;
      expect(zero, ` degenerate`).toBe(0);
      g.dispose();
    }
  });

  it('attaches to the house: new materials added, shared ones merged, colliders in the BVH', () => {
    const world = buildWorld(house);
    const before = world.group.children.length;
    const houseTris = world.triangles;
    const res = attachFurniture(world);
    expect(res.added.length).toBe(9);
    expect(world.group.children.length).toBe(before + res.added.length);
    for (const m of res.merged)
      expect([
        'glass',
        'metalBlack',
        'clay',
        'bark',
        'foliage',
        'foliageLight',
        'timber',
      ]).toContain(m.name);
    expect(world.triangles).toBe(houseTris + res.triangles);
    // A ray at knee height across the living room hits the sofa's collider.
    const ray = new THREE.Raycaster(new THREE.Vector3(12.6, 0.3, 3.2), new THREE.Vector3(0, 0, 1));
    const hit = world.bvh.raycastFirst(ray.ray, THREE.DoubleSide, 0, 5);
    expect(hit).not.toBeNull();
    expect(hit!.point.z).toBeCloseTo(3.92, 2);
  }, 30_000);
});
