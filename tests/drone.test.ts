/**
 * Fly controls: the drone (Node, on the real collider BVH — house, furniture and terrain)
 * hovers when the sticks are released, follows the sticks relative to its heading (touch:
 * left = move, right = altitude + turn), starts at its own aerial pose looking at the
 * east glass, never ends a step inside the collider (roof, ground, walls), lands on the
 * visible roof skin instead of sinking into it, and stays within its bounds.
 */
import { beforeAll, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import type { MeshBVH } from 'three-mesh-bvh';
import { controlsModeOf, readParams } from '../src/core/params';
import { SHELL } from '../src/data/grid';
import { pointInPolygon, roofTopY } from '../src/data/geometry2d';
import { house } from '../src/data/house';
import { roof } from '../src/data/roof';
import { terrainHeight } from '../src/data/terrain';
import { PLAYER } from '../src/player/controller';
import {
  aboveRoof,
  DRONE,
  DRONE_START,
  DroneController,
  droneStartPose,
  NO_DRONE_INPUT,
  type DroneInput,
} from '../src/player/drone';
import { sticksToInput } from '../src/player/input-drone-touch';
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

/** 2D distance from p to segment ab, and the segment parameter of the closest point. */
function segDist(pz: number, py: number, a: [number, number], b: [number, number]) {
  const ez = b[0] - a[0];
  const ey = b[1] - a[1];
  const t = Math.max(0, Math.min(1, ((pz - a[0]) * ez + (py - a[1]) * ey) / (ez * ez + ey * ey)));
  return { d: Math.hypot(pz - a[0] - t * ez, py - a[1] - t * ey), t };
}

/** Signed distance from p to an axis-aligned box (negative inside). */
function boxDist(p: [number, number, number], min: readonly number[], max: readonly number[]) {
  const o = p.map((v, i) => Math.max(min[i]! - v, v - max[i]!));
  const out = Math.hypot(...o.map((v) => Math.max(v, 0)));
  return out > 0 ? out : Math.max(...o);
}

const exteriorBox = (id: string) => {
  const e = house.exterior.find((x) => x.id === id);
  if (!e || e.type !== 'box') throw new Error(id);
  return e;
};

/**
 * How far the drone sphere at (x, y, z) is clear of the visible roof skin (negative = it
 * cuts into it): the standing-seam sheet of both slopes (seams 3.5 cm proud), ridge cap,
 * roof-window frames (6 cm proud), snow guards, chimney with its cap, the entrance canopy
 * and the sunshade (sheet + 3 cm seams) — all from the roof / exterior data.
 */
function roofClearance(x: number, y: number, z: number): { margin: number; what: string } {
  const r = DRONE.radius;
  const [zN, zS] = roof.eaveZ;
  const zR = roof.ridgeZ;
  const e = roof.eaveY;
  const yR = roofTopY(roof, zR);
  const xMin = roof.segments[0]!.x[0];
  const xMax = roof.segments[roof.segments.length - 1]!.x[1];
  const cos = Math.cos((roof.pitchDeg * Math.PI) / 180);
  const results: { margin: number; what: string }[] = [];
  // Main roof sheet (profile extruded along x).
  const slopes: [[number, number], [number, number], 'north' | 'south'][] = [
    [[zN, e], [zR, yR], 'north'],
    [[zR, yR], [zS, e], 'south'],
  ];
  let best = { d: Infinity, t: 0, side: 'north' as 'north' | 'south' };
  for (const [a, b, side] of slopes) {
    const s = segDist(z, y, a, b);
    if (s.d < best.d) best = { ...s, side };
  }
  const below = z > zN && z < zS && y < roofTopY(roof, z);
  const dx = Math.max(xMin - x, 0, x - xMax);
  if (dx > 0) {
    results.push({ margin: Math.hypot(dx, below ? 0 : best.d) - r, what: 'gable edge' });
  } else if (below) {
    results.push({ margin: -best.d - r, what: 'under the roof sheet' });
  } else {
    // Point of the sheet under the sphere → what stands proud of the sheet there.
    const zc = best.side === 'north' ? zN + best.t * (zR - zN) : zR + best.t * (zS - zR);
    let proud = best.t > 0 && best.t < 1 ? roof.seams.height : 0;
    let what = 'roof sheet';
    for (const w of roof.windows) {
      if (x >= w.x[0] && x <= w.x[1] && zc >= w.z[0] && zc <= w.z[1]) {
        proud = 0.06;
        what = `roof window ${w.id}`;
      }
    }
    const g = roof.snowGuards;
    const band = 0.07 * cos;
    for (const zg of [zN + g.inset, zS - g.inset]) {
      if (x >= g.x[0] && x <= g.x[1] && Math.abs(zc - zg) <= band) {
        proud = 0.084;
        what = 'snow guard';
      }
    }
    results.push({ margin: best.d - r - proud, what });
  }
  // Ridge cap.
  results.push({
    margin: boxDist([x, y, z], [xMin, yR - 0.02, zR - 0.08], [xMax, yR + 0.04, zR + 0.08]) - r,
    what: 'ridge cap',
  });
  // Chimney pipe and rain cap.
  const ch = roof.chimney;
  const rad = Math.hypot(x - ch.center[0], z - ch.center[1]);
  const cyl = (radius: number, y0: number, y1: number): number => {
    const dr = rad - radius;
    const dy = Math.max(y0 - y, y - y1);
    return dr > 0 || dy > 0 ? Math.hypot(Math.max(dr, 0), Math.max(dy, 0)) : Math.max(dr, dy);
  };
  results.push({ margin: cyl(ch.radius, e, ch.top + 0.045) - r, what: 'chimney' });
  results.push({ margin: cyl(ch.radius + 0.07, ch.top, ch.top + 0.045) - r, what: 'chimney cap' });
  // Entrance canopy and sunshade: boxes with 3 cm standing seams on top.
  for (const id of ['entrance-canopy', 'sunshade']) {
    const b = exteriorBox(id).box;
    const max = [b.max[0], b.max[1] + 0.03, b.max[2]];
    results.push({ margin: boxDist([x, y, z], b.min, max) - r, what: id });
  }
  return results.reduce((m, c) => (c.margin < m.margin ? c : m));
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

describe('touch sticks', () => {
  it('left stick moves like the walk joystick, right stick = altitude + turn', () => {
    const c = { x: 0, y: 0 };
    // Screen axes: y down. Left stick pushed up = forward, right = sideways right.
    expect(sticksToInput({ x: 0, y: -1 }, c)).toMatchObject({
      pitch: 1,
      roll: 0,
      throttle: 0,
      yaw: 0,
    });
    expect(sticksToInput({ x: 0, y: 1 }, c)).toMatchObject({ pitch: -1, throttle: 0 });
    expect(sticksToInput({ x: 1, y: 0 }, c)).toMatchObject({ roll: 1, pitch: 0, yaw: 0 });
    expect(sticksToInput({ x: -1, y: 0 }, c)).toMatchObject({ roll: -1, yaw: 0 });
    // Right stick pushed up = climb, down = descend, right = turn right.
    expect(sticksToInput(c, { x: 0, y: -1 })).toMatchObject({
      throttle: 1,
      yaw: 0,
      pitch: 0,
      roll: 0,
    });
    expect(sticksToInput(c, { x: 0, y: 1 })).toMatchObject({ throttle: -1, pitch: 0 });
    expect(sticksToInput(c, { x: 1, y: 0 })).toMatchObject({ yaw: 1, roll: 0, throttle: 0 });
    expect(sticksToInput(c, { x: -1, y: 0 })).toMatchObject({ yaw: -1, roll: 0 });
    // Dead zone, both sticks at once, never "fast".
    expect(sticksToInput({ x: 0.05, y: -0.05 }, { x: -0.08, y: 0.09 })).toEqual(NO_DRONE_INPUT);
    const both = sticksToInput({ x: 0.55, y: -0.55 }, { x: -0.55, y: 0.55 });
    expect(both.pitch).toBeCloseTo(0.5, 6);
    expect(both.roll).toBeCloseTo(0.5, 6);
    expect(both.throttle).toBeCloseTo(-0.5, 6);
    expect(both.yaw).toBeCloseTo(-0.5, 6);
    expect(both.fast).toBe(false);
  });
});

describe('drone start pose', () => {
  it('is a few metres up outside the house, inside the lot and the flight box, clear of colliders', () => {
    const s = droneStartPose();
    const [cx, cz] = DRONE.center;
    expect(Math.hypot(s.x - cx, s.z - cz)).toBeLessThan(DRONE.range);
    expect(pointInPolygon(s.x, s.z, house.site.lot)).toBe(true);
    // East / terrace side, beyond the house (east facade x 18.38) and south of the glass.
    expect(s.x).toBeGreaterThan(SHELL.east + 3);
    expect(s.z).toBeGreaterThan(SHELL.south);
    const alt = s.y - terrainHeight(s.x, s.z);
    expect(alt).toBeGreaterThan(4);
    expect(alt).toBeLessThan(6);
    const hit = bvh.closestPointToPoint(new THREE.Vector3(s.x, s.y, s.z));
    expect(hit!.distance).toBeGreaterThan(1.5);
    const d = new DroneController(bvh);
    d.teleport(s.x, s.y, s.z, s.yaw, s.pitch);
    expect(d.position.distanceTo(new THREE.Vector3(s.x, s.y, s.z))).toBeLessThan(1e-9);
    expect(d.position.toArray()).toEqual([...DRONE_START.position]);
  });

  it('looks down at an angle at the east curtain wall, with a clear view of the glass', () => {
    const s = droneStartPose();
    const cw = house.levels.flatMap((l) => l.walls).find((w) => w.id === 'cw-e')!;
    const glass = new THREE.Vector3(cw.from[0], 3.2, (cw.from[1] + cw.to[1]) / 2);
    const eye = new THREE.Vector3(s.x, s.y, s.z);
    const fwd = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(s.pitch, s.yaw, 0, 'YXZ'));
    const toGlass = glass.clone().sub(eye).normalize();
    // The glass is (near) the centre of the view …
    expect(THREE.MathUtils.radToDeg(fwd.angleTo(toGlass))).toBeLessThan(6);
    // … seen obliquely (not head-on, not grazing) and from slightly above.
    const oblique = THREE.MathUtils.radToDeg(Math.atan2(Math.abs(fwd.z), -fwd.x));
    expect(oblique).toBeGreaterThan(25);
    expect(oblique).toBeLessThan(55);
    expect(THREE.MathUtils.radToDeg(s.pitch)).toBeLessThan(-3);
    expect(THREE.MathUtils.radToDeg(s.pitch)).toBeGreaterThan(-25);
    // Nothing (trees, fence, loggia frame) between the drone and the glass: the first
    // collider hit on the way is the curtain wall itself.
    const ray = new THREE.Ray(eye, toGlass);
    const first = bvh.raycastFirst(ray, THREE.DoubleSide);
    expect(first).not.toBeNull();
    expect(Math.abs(first!.point.x - cw.from[0])).toBeLessThan(0.2);
    expect(first!.distance).toBeGreaterThan(eye.distanceTo(glass) - 0.3);
  });
});

describe('aboveRoof', () => {
  it('is true only over the roof plan, above the visible sheet', () => {
    const yR = roofTopY(roof, roof.ridgeZ);
    expect(aboveRoof(roof, 9, yR + 0.2, roof.ridgeZ)).toBe(true);
    expect(aboveRoof(roof, 9, yR - 0.2, roof.ridgeZ)).toBe(false);
    expect(aboveRoof(roof, 9, roofTopY(roof, 1) + 0.2, 1)).toBe(true);
    expect(aboveRoof(roof, 9, 5, 1)).toBe(false); // upper floor, under the slope
    expect(aboveRoof(roof, 9, 5, -1)).toBe(false); // north garden, not over the roof
    expect(aboveRoof(roof, 20, 6, 3.6)).toBe(false); // over the terrace
  });
});

describe('drone (fly controls)', () => {
  it('hovers in place with the sticks released', () => {
    const d = drone();
    const start = d.position.clone();
    fly(d, {}, 3);
    expect(d.position.distanceTo(start)).toBeLessThan(1e-6);
  });

  it('follows the sticks relative to its heading, then brakes', () => {
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

  it('descending onto the roof (slopes, ridge, eaves, windows, chimney, canopy, sunshade) stops on its visible surface', () => {
    const failures: { label: string; what: string; margin: number }[] = [];
    const descend = (x: number, z: number, input: Partial<DroneInput>, seconds: number) => {
      const d = drone(x, 11, z, 0);
      const stick = { ...NO_DRONE_INPUT, ...input };
      let worst = { what: '', margin: Infinity };
      for (let k = 0; k < Math.round(seconds / dt); k++) {
        d.step(stick, dt);
        const c = roofClearance(d.position.x, d.position.y, d.position.z);
        if (c.margin < worst.margin) worst = c;
      }
      if (worst.margin < -0.01) {
        const label = `(${x.toFixed(2)}, ${z.toFixed(2)}) ${JSON.stringify(input)}`;
        failures.push({ label, ...worst });
      }
    };
    const xs: number[] = [];
    for (let x = -0.25; x <= 18.3; x += 1.15) xs.push(x);
    const zs: number[] = [];
    for (let z = -0.4; z <= 7.65; z += 0.35) zs.push(z);
    for (const x of xs) {
      for (const z of zs) {
        descend(x, z, { throttle: -1 }, 3.6);
        descend(x, z, { throttle: -1, fast: true }, 2);
      }
    }
    // Roof windows, chimney, ridge, gutters, canopy and sunshade.
    const extra: [number, number][] = [
      ...roof.windows.map((w): [number, number] => [(w.x[0] + w.x[1]) / 2, (w.z[0] + w.z[1]) / 2]),
      [roof.chimney.center[0], roof.chimney.center[1]],
      [roof.chimney.center[0] + 0.25, roof.chimney.center[1] - 0.05],
      [6.2, roof.ridgeZ],
      [13.1, roof.ridgeZ + 0.06],
      [4, roof.eaveZ[0] + 0.1],
      [12, roof.eaveZ[1] - 0.1],
      [6, -1.3],
      [11.4, -2.2],
      [8, 7.85],
      [15.3, 8.0],
    ];
    for (const [x, z] of extra) {
      descend(x, z, { throttle: -1 }, 4);
      descend(x, z, { throttle: -1, fast: true }, 2.2);
      // Diving at full speed across the roof (forward + down).
      descend(x, z, { throttle: -1, pitch: 1, fast: true }, 2.2);
      descend(x, z, { throttle: -1, roll: -1, fast: true }, 2.2);
    }
    // Worst cut per roof part (empty = the sphere always stayed on / above the skin).
    const worst = new Map<string, (typeof failures)[number]>();
    for (const f of failures) {
      const w = worst.get(f.what);
      if (!w || f.margin < w.margin) worst.set(f.what, f);
    }
    const report = [...worst.values()].map(
      (f) => `${f.what}: ${f.margin.toFixed(3)} m at ${f.label}`,
    );
    expect({ descents: failures.length, report }).toEqual({ descents: 0, report: [] });
  }, 120_000);

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
