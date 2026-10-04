/**
 * Fly controls: the drone (Node, on the real collider BVH — house, furniture and terrain)
 * hovers when the sticks are released, follows the Mode 2 sticks relative to its heading,
 * never ends a step inside the collider (roof, ground, walls) and stays within its bounds.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import type { MeshBVH } from 'three-mesh-bvh';
import { controlsModeOf, readParams } from '../src/core/params';
import { SHELL } from '../src/data/grid';
import { house } from '../src/data/house';
import { terrainHeight } from '../src/data/terrain';
import { PLAYER } from '../src/player/controller';
import { DRONE, DroneController, NO_DRONE_INPUT, type DroneInput } from '../src/player/drone';
import { buildWorld } from '../src/world/build';
import { attachFurniture } from '../src/world/furniture';

let bvh: MeshBVH;
beforeAll(() => {
  const world = buildWorld(house);
  attachFurniture(world);
  bvh = world.bvh;
}, 60_000);

const dt = PLAYER.fixedDt;

function fly(d: DroneController, input: Partial<DroneInput>, seconds: number, check = false) {
  const stick = { ...NO_DRONE_INPUT, ...input };
  let minClear = Infinity;
  for (let k = 0; k < Math.round(seconds / dt); k++) {
    d.step(stick, dt);
    if (check) {
      const hit = bvh.closestPointToPoint(d.position);
      if (hit) minClear = Math.min(minClear, hit.distance);
    }
  }
  return minClear;
}

/** Starts above the garden, south of the house, looking north (yaw 0 = −z). */
function drone(x = 9, y = 3, z = 13, yaw = 0): DroneController {
  const d = new DroneController(bvh);
  d.teleport(x, y, z, yaw, 0);
  return d;
}

describe('controls mode parameter', () => {
  it('parses ?controls=', () => {
    expect(readParams('').controls).toBeNull();
    expect(readParams('?controls=fly').controls).toBe('fly');
    expect(readParams('?controls=Walk').controls).toBe('walk');
    expect(readParams('?controls=drone').controls).toBe('fly');
    expect(readParams('?controls=jetpack').controls).toBeNull();
    expect(controlsModeOf(null)).toBeNull();
  });
});

describe('drone (fly controls)', () => {
  it('hovers in place with the sticks released', () => {
    const d = drone();
    const start = d.position.clone();
    fly(d, {}, 3);
    expect(d.position.distanceTo(start)).toBeLessThan(1e-6);
  });

  it('follows the Mode 2 sticks relative to its heading, then brakes', () => {
    const d = drone();
    fly(d, { throttle: 1 }, 2);
    expect(d.position.y).toBeGreaterThan(3 + DRONE.climb * 1.2);
    const y = d.position.y;
    // Pitch forward: toward −z (yaw 0); roll right: toward +x.
    fly(d, { pitch: 1 }, 1);
    expect(d.position.z).toBeLessThan(13 - 1.5);
    expect(Math.abs(d.position.x - 9)).toBeLessThan(1e-6);
    const z = d.position.z;
    fly(d, { roll: 1 }, 1);
    expect(d.position.x).toBeGreaterThan(9 + 1.5);
    fly(d, {}, 3);
    expect(d.velocity.length()).toBeLessThan(0.01);
    expect(d.position.y).toBeGreaterThan(y);
    expect(d.position.z).toBeLessThan(z);
    const still = d.position.clone();
    fly(d, {}, 1);
    expect(d.position.distanceTo(still)).toBeLessThan(0.01);
    // Yaw stick right = turn right (yaw decreases, like the walker's look).
    fly(d, { yaw: 1 }, 0.5);
    expect(d.yaw).toBeCloseTo(-DRONE.yawRate * 0.5, 5);
    // Fast modifier.
    const a = drone();
    const b = drone();
    fly(a, { throttle: 1 }, 2);
    fly(b, { throttle: 1, fast: true }, 2);
    expect(b.position.y - 3).toBeGreaterThan((a.position.y - 3) * 1.8);
  });

  it('stops on the roof, then slides down its slope instead of passing through it', () => {
    const d = drone(9, 20, 3.6);
    // 12.2 m at 5.5 m/s: on the ridge after ≈ 2.5 s.
    let clear = fly(d, { throttle: -1, fast: true }, 2.7, true);
    expect(d.position.y).toBeGreaterThan(7.2);
    clear = Math.min(clear, fly(d, { throttle: -1, fast: true }, 12, true));
    expect(clear).toBeGreaterThan(DRONE.radius - 0.03);
    // Off the eave, never into the attic.
    expect(d.position.z < SHELL.north || d.position.z > SHELL.south).toBe(true);
  });

  it('stops above the ground in the garden', () => {
    const d = drone(9, 8, 12);
    const clear = fly(d, { throttle: -1, fast: true }, 8, true);
    expect(clear).toBeGreaterThan(DRONE.radius - 0.03);
    expect(d.position.y).toBeGreaterThan(terrainHeight(9, 12));
    expect(d.position.y).toBeLessThan(terrainHeight(9, 12) + 0.5);
  });

  it('never ends a step inside the walls when flying into the house', () => {
    for (const [y, yaw] of [
      [1.2, 0],
      [1.6, 0.3],
      [4.5, -0.4],
      [2.5, 0.8],
    ] as const) {
      const d = drone(9, y, 13, yaw);
      const clear = fly(d, { pitch: 1, roll: 0.3, fast: true }, 6, true);
      expect(clear).toBeGreaterThan(DRONE.radius - 0.03);
    }
  });

  it('stays within its range and below the ceiling altitude', () => {
    const d = drone(9, 3, 13, Math.PI);
    fly(d, { pitch: 1, throttle: 1, fast: true }, 30);
    const [cx, cz] = DRONE.center;
    expect(Math.hypot(d.position.x - cx, d.position.z - cz)).toBeLessThanOrEqual(
      DRONE.range + 1e-6,
    );
    expect(d.position.y).toBeLessThanOrEqual(DRONE.maxAltitude);
    expect(d.velocity.y).toBe(0);
  });
});
