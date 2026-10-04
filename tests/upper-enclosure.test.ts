/**
 * Upper floor under the 40° roof: the player capsule (Node controller on the real collider
 * BVH, house + furniture) can never walk into the sloped ceilings, through the knee walls
 * or the gable — owner's report: "on the top floor the angled wall is pass-through".
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import { rad, roofSegment, roofUndersideY } from '../src/data/geometry2d';
import { LEVELS, SHELL } from '../src/data/grid';
import { house } from '../src/data/house';
import { roomAt } from '../src/data/topology';
import { PLAYER, PlayerController } from '../src/player/controller';
import { buildWorld } from '../src/world/build';
import { attachFurniture } from '../src/world/furniture';

const roof = house.roof;
const seg = roofSegment(roof, 'upper');
const Y = LEVELS.upperFloor;
const COS = Math.cos(rad(roof.pitchDeg));
const TAN = Math.tan(rad(roof.pitchDeg));
const zA = SHELL.innerNorth;
const zB = SHELL.innerSouth;
const upper = house.levels.find((l) => l.id === 'upper')!;

/** Perpendicular clearance of a point below the nearer sloped-ceiling plane (unclamped). */
function slopeClearance(y: number, z: number): number {
  const north = (seg.innerY + TAN * (z - zA) - y) * COS;
  const south = (seg.innerY + TAN * (zB - z) - y) * COS;
  return Math.min(north, south);
}

let bvh: MeshBVH;
beforeAll(() => {
  const world = buildWorld(house, { site: false });
  attachFurniture(world);
  bvh = world.bvh;
}, 60_000);

function walk(
  start: readonly [number, number],
  dir: readonly [number, number],
  seconds: number,
  run: boolean,
): PlayerController {
  const p = new PlayerController(bvh);
  p.teleport(start[0], Y, start[1]);
  const wish = new THREE.Vector3();
  for (let k = 0; k < 24; k++) p.step(wish.set(0, 0, 0));
  const len = Math.hypot(dir[0], dir[1]);
  const speed = run ? PLAYER.runSpeed : PLAYER.walkSpeed;
  const n = Math.round(seconds / PLAYER.fixedDt);
  for (let k = 0; k < n; k++) {
    p.step(wish.set((dir[0] / len) * speed, 0, (dir[1] / len) * speed));
  }
  for (let k = 0; k < 30; k++) p.step(wish.set(0, 0, 0));
  return p;
}

// Free spots near the middle of every upper room (clear of the furniture colliders).
const STARTS: [string, [number, number]][] = [
  ['bedroom-3', [2.0, 3.0]],
  ['bedroom-3', [1.5, 5.6]],
  ['bedroom-3', [3.4, 1.4]],
  ['study', [6.6, 1.3]],
  ['study', [8.0, 1.9]],
  ['upper-hall', [6.0, 3.0]],
  ['upper-bathroom', [5.7, 4.6]],
  ['upper-bathroom', [5.6, 6.4]],
];
const DIRS: [string, [number, number]][] = [
  ['N', [0, -1]],
  ['S', [0, 1]],
  ['E', [1, 0]],
  ['W', [-1, 0]],
  ['NE', [1, -1]],
  ['NW', [-1, -1]],
  ['SE', [1, 1]],
  ['SW', [-1, 1]],
];

describe('upper floor enclosure (sloped ceilings, knee walls, gable)', () => {
  it('the start spots are in their rooms', () => {
    for (const [room, [x, z]] of STARTS) expect(roomAt(upper, x, z), `${x}, ${z}`).toBe(room);
  });

  it('walking/running into every slope, knee wall and gable keeps the capsule inside', () => {
    const r = PLAYER.radius;
    const fails: string[] = [];
    let closest = Infinity;
    for (const [room, start] of STARTS) {
      for (const [dn, dir] of DIRS) {
        for (const run of [false, true]) {
          const p = walk(start, dir, 6, run);
          const { x, y, z } = p.position;
          const tag = `${room} (${start.join(', ')}) ${dn}${run ? ' run' : ''} → (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`;
          const head = slopeClearance(y + PLAYER.height - r, z);
          const eye = slopeClearance(y + PLAYER.eye, z);
          closest = Math.min(closest, eye);
          // Down the main stair (a diagonal walk slides along the bathroom wall to the
          // arrival) is fine; anything else must stay on the upper floor.
          const onStair = x > 7.325 && x < 9.375 && z > 3.75 && y < Y - 0.02;
          if (y > Y + 0.02 || (y < Y - 0.02 && !onStair)) fails.push(`${tag}: left the floor`);
          if (z < zA + r - 0.01 || z > zB - r + 0.01) fails.push(`${tag}: through a knee wall`);
          if (x < SHELL.innerWest + r - 0.01) fails.push(`${tag}: through the gable`);
          if (x > 9.51 - r + 0.01) fails.push(`${tag}: through the void wall`);
          if (head < r - 0.01) fails.push(`${tag}: head in the slope (${head.toFixed(3)})`);
          if (eye < 0.1) fails.push(`${tag}: eye ${eye.toFixed(3)} m from the slope`);
        }
      }
    }
    expect(fails).toEqual([]);
    expect(closest).toBeGreaterThanOrEqual(0.1);
  }, 120_000);

  it('the upper furniture / void checks of the e2e walk still hold', () => {
    // [start, dir, ok] from tests/e2e/walk.spec.ts (run, 3 s).
    const cases: [[number, number], [number, number], (x: number, z: number) => boolean][] = [
      [[8.5, 2.1], [1, 0], (x) => x < 8.857 - 0.2],
      [[8.2, 3.0], [1, 0], (x) => x < 8.9 - 0.2],
      [[3.3, 3.4], [0, 1], (_x, z) => z < 4.175 - 0.2],
    ];
    for (const [start, dir, ok] of cases) {
      const p = walk(start, dir, 3, true);
      expect(ok(p.position.x, p.position.z), start.join(', ')).toBe(true);
      expect(p.position.y).toBeCloseTo(Y, 2);
    }
  });

  it('the e2e routes stay walkable: up the stair to every upper room and back down', () => {
    const p = new PlayerController(bvh);
    p.teleport(8.775, 0, 1.2);
    const wish = new THREE.Vector3();
    for (let k = 0; k < 24; k++) p.step(wish.set(0, 0, 0));
    // walkTo of the app hooks (tests/e2e/walk.spec.ts "whole building on foot").
    const walkTo = (x: number, z: number): boolean => {
      for (let k = 0; k < 40 / PLAYER.fixedDt; k++) {
        const dx = x - p.position.x;
        const dz = z - p.position.z;
        const d = Math.hypot(dx, dz);
        if (d < 0.15) return true;
        const s = Math.min(PLAYER.walkSpeed, d * 4);
        p.step(wish.set((dx / d) * s, 0, (dz / d) * s));
      }
      return false;
    };
    const legs: [[number, number][], string | null, number][] = [
      [
        [
          [8.9, 3.3],
          [8.9, 5.6],
          [8.9, 6.55],
        ],
        null,
        (2.95 / 17) * 9,
      ],
      [
        [
          [7.8, 6.55],
          [7.8, 4.2],
          [7.8, 3.3],
        ],
        'upper-hall',
        Y,
      ],
      [
        [
          [5.775, 3.0],
          [5.775, 1.5],
        ],
        'study',
        Y,
      ],
      [[[8.45, 2.05]], 'study', Y],
      [
        [
          [5.775, 3.0],
          [5.2, 3.0],
          [3.8, 3.0],
          [2.5, 3.0],
        ],
        'bedroom-3',
        Y,
      ],
      [
        [
          [5.2, 3.0],
          [5.6, 3.1],
          [5.75, 4.4],
        ],
        'upper-bathroom',
        Y,
      ],
      [
        [
          [5.6, 3.1],
          [7.8, 3.3],
          [7.8, 4.2],
          [7.8, 6.55],
        ],
        null,
        (2.95 / 17) * 9,
      ],
      [
        [
          [8.9, 6.55],
          [8.9, 3.0],
        ],
        null,
        0,
      ],
    ];
    for (const [points, room, y] of legs) {
      for (const [x, z] of points) {
        const ok = walkTo(x, z);
        const at = `(${p.position.x.toFixed(2)}, ${p.position.y.toFixed(2)}, ${p.position.z.toFixed(2)})`;
        expect(ok, `walkTo(${x}, ${z}) stopped at ${at}`).toBe(true);
        expect(p.grounded, `grounded at ${x}, ${z}`).toBe(true);
      }
      for (let k = 0; k < 30; k++) p.step(wish.set(0, 0, 0));
      expect(p.position.y).toBeCloseTo(y, 1);
      if (room) expect(roomAt(upper, p.position.x, p.position.z)).toBe(room);
    }
  }, 60_000);

  it('the colliders cover both slopes along the whole upper floor, incl. the stair arrival', () => {
    const ray = new THREE.Ray();
    const cast = (o: THREE.Vector3, d: THREE.Vector3): THREE.Intersection | null => {
      ray.set(o, d.normalize());
      return bvh.raycastFirst(ray, THREE.DoubleSide, 0, 10);
    };
    for (let x = SHELL.innerWest + 0.15; x < 9.5; x += 0.3) {
      for (const [z, side] of [
        [1.2, -1],
        [2.4, -1],
        [3.3, -1],
        [3.9, 1],
        [5.0, 1],
        [6.2, 1],
      ] as const) {
        if (x > 7.325 && x < 9.375 && z > 3.75) continue; // stair well: the stair is below
        // Straight up and toward the slope's eave (perpendicular-ish and shallow).
        for (const d of [
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(0, 0.5, side),
          new THREE.Vector3(0, 0.15, side),
        ]) {
          const o = new THREE.Vector3(x, Y + 1.2, z);
          const h = cast(o, d.clone());
          expect(h, `${x.toFixed(2)}, ${z} → ${d.toArray().join(',')}`).not.toBeNull();
          const yU = roofUndersideY(roof, seg, h!.point.z);
          // Hit at or before the ceiling / knee wall, never beyond it.
          expect(h!.point.y, `${x.toFixed(2)}, ${z}`).toBeLessThanOrEqual(yU + 1e-3);
          expect(h!.point.z).toBeGreaterThanOrEqual(zA - 1e-3);
          expect(h!.point.z).toBeLessThanOrEqual(zB + 1e-3);
        }
      }
    }
    // Over the stair arrival / upper flight: the slope is still closed above head height.
    for (const [x, z] of [
      [7.8, 4.2],
      [7.8, 5.6],
      [8.9, 6.6],
    ] as const) {
      const yU = roofUndersideY(roof, seg, z);
      const h = cast(new THREE.Vector3(x, Math.min(4.5, yU - 0.2), z), new THREE.Vector3(0, 1, 0));
      expect(h, `stair ${x}, ${z}`).not.toBeNull();
      expect(h!.point.y).toBeLessThanOrEqual(yU + 1e-3);
    }
    // West gable above the knee-wall height: closed from the floor to the ridge.
    for (const y of [3.3, 4.2, 5.5, 6.5]) {
      const h = cast(new THREE.Vector3(1.0, y, 3.625), new THREE.Vector3(-1, 0, 0));
      expect(h, `gable at y ${y}`).not.toBeNull();
      expect(h!.point.x).toBeGreaterThanOrEqual(SHELL.innerWest - 1e-3);
    }
  });
});
