/**
 * I3 garden & fence: site data against sheet 03, terrain, fence closure, planting inside
 * the lot, colliders, and reachability of every garden place from the start pose.
 */
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { distToSegment } from '../src/data/clip';
import {
  FENCE,
  GARDEN_ZONES,
  GATES,
  GRAVEL,
  PLANTERS,
  RAISED_BEDS,
  SHRUBS,
  STREET_AREA,
  TREES,
  fencePerimeter,
  gardenObstacles,
  lotEastX,
  lotWestX,
  type Obstacle,
} from '../src/data/garden';
import { pointInPolygon, polygonArea } from '../src/data/geometry2d';
import { OUTER_DIMENSIONS, SHELL } from '../src/data/grid';
import { house } from '../src/data/house';
import type { Polygon, Vec2 } from '../src/data/schema';
import { FIELD_Y, SPOT_HEIGHTS, TERRAIN, naturalHeight, terrainHeight } from '../src/data/terrain';
import { levelById, locate } from '../src/data/topology';
import { buildWorld } from '../src/world/build';

const site = house.site;
const lot = site.lot;
const patch = (id: string) => site.patches.find((p) => p.id === id)!;
const ground = levelById(house, 'ground');
const terrace = ground.rooms.find((r) => r.id === 'terrace')!;
const inHouse = (x: number, z: number, pad = 0) =>
  x > SHELL.west - pad && x < SHELL.east + pad && z > SHELL.north - pad && z < SHELL.south + pad;

describe('site plan (sheet 03)', () => {
  it('lot 574 m² (±2 %), setbacks respected by the house', () => {
    expect(Math.abs(polygonArea(lot) - 574) / 574).toBeLessThan(0.02);
    // House (insulation outline ±0.275 of the plan's 18.55 × 7.80) to the lot lines.
    const north = -0.275 - lot[0]![1];
    const south = lot[2]![1] - 7.525;
    // Dimension lines of the east / west distances are drawn at z ≈ 6.9 on the sheet.
    const east = lotEastX(6.96) - 18.275;
    const west = -0.275 - lotWestX(6.9);
    expect(north).toBeCloseTo(2.28, 1);
    expect(south).toBeCloseTo(7.0, 1);
    expect(Math.abs(east - 7.02)).toBeLessThan(0.05);
    expect(Math.abs(west - 8.0)).toBeLessThan(0.1);
    // Setbacks: sides 1 m (north) and 3 m (south), street 6 m, rear 6 m.
    expect(north).toBeGreaterThanOrEqual(1);
    expect(south).toBeGreaterThanOrEqual(3);
    expect(west).toBeGreaterThanOrEqual(6);
    expect(east).toBeGreaterThanOrEqual(6);
  });

  it('paving areas match the site balance (parking 80, paths + terraces 87, bins 1.5 m²)', () => {
    expect(Math.abs(polygonArea(patch('parking').polygon) - 80) / 80).toBeLessThan(0.03);
    // The balance counts the terraces outside the built area: the loggia deck under the
    // roof (x 16.625…18.38, z 0.275…6.975) is part of the house. The modelled path also
    // has the covered entrance walk of sheet 05 (to x 11.595, z −2.225): +7.4 m² over the
    // sheet-03 outline, whose own polygons give 60.6 + 37.4 − 11.8 ≈ 86.2 m².
    const loggia = (18.38 - 16.625) * (6.975 - 0.275);
    const walks = polygonArea(patch('path').polygon) + polygonArea(patch('deck').polygon) - loggia;
    const entranceWalk = (11.595 - 9.73) * (2.225 - 0.33) + (9.73 - 4.595) * (2.225 - 1.475);
    expect(Math.abs(walks - entranceWalk - 87) / 87).toBeLessThan(0.05);
    expect(Math.abs(walks - 87) / 87).toBeLessThan(0.1);
    expect(Math.abs(polygonArea(patch('bins').polygon) - 1.5) / 1.5).toBeLessThan(0.02);
  });

  it('green space ≈ 271.5 m² (lot minus house, paving, deck, gravel)', () => {
    // Sampled on a 5 cm grid; beds and the stepping stones in the lawn count as green.
    // Differences to the plan's 271.5: its balance uses a 134 m² built area, the modelled
    // house outline (18.71 × 7.91 incl. cladding) covers 148 m²; the covered entrance walk
    // (sheet 05, 7.4 m²) and the gravel strips (7.9 m², not drawn on the plan).
    const hard: Polygon[] = [
      patch('parking').polygon,
      patch('path').polygon,
      patch('bins').polygon,
      patch('deck').polygon,
      ...GRAVEL.map((g) => g.polygon),
    ];
    const step = 0.05;
    let green = 0;
    for (let x = -8.5 + step / 2; x < 25.7; x += step) {
      for (let z = -2.6 + step / 2; z < 14.55; z += step) {
        if (!pointInPolygon(x, z, lot) || inHouse(x, z)) continue;
        if (x > 7.175 && x < 9.525 && z < 8.175) continue; // light well
        if (hard.some((p) => pointInPolygon(x, z, p))) continue;
        green += step * step;
      }
    }
    const houseOutline = OUTER_DIMENSIONS.length * OUTER_DIMENSIONS.depth;
    const explained = 271.5 - (houseOutline - 134) - 7.4 - 7.9;
    expect(Math.abs(green - explained) / explained).toBeLessThan(0.02);
    expect(Math.abs(green - 271.5) / 271.5).toBeLessThan(0.12);
    // Plan balance itself is consistent: 574 − 134 − 87 − 80 − 1.5 = 271.5.
    expect(574 - 134 - 87 - 80 - 1.5).toBeCloseTo(271.5, 6);
  });

  it('trees and shrubs stand inside the lot, clear of the house and paving', () => {
    for (const p of [...TREES, ...SHRUBS]) {
      expect(pointInPolygon(p.x, p.z, lot), p.id).toBe(true);
      expect(inHouse(p.x, p.z, 1), p.id).toBe(false);
      expect(pointInPolygon(p.x, p.z, patch('parking').polygon), p.id).toBe(false);
      expect(pointInPolygon(p.x, p.z, patch('path').polygon), p.id).toBe(false);
      for (let i = 0; i < lot.length; i++) {
        expect(distToSegment(p.x, p.z, lot[i]!, lot[(i + 1) % lot.length]!), p.id).toBeGreaterThan(
          0.5,
        );
      }
    }
    expect(TREES).toHaveLength(5);
    expect(SHRUBS).toHaveLength(5);
    for (const p of PLANTERS) expect(pointInPolygon(p.x, p.z, terrace.polygon)).toBe(true);
  });
});

describe('fence and gates', () => {
  const segs = fencePerimeter();

  it('closes the lot line: runs + gates chained around all four edges', () => {
    expect(segs).toHaveLength(FENCE.length + GATES.length);
    expect(segs[segs.length - 1]!.b).toEqual(segs[0]!.a);
    let perimeter = 0;
    for (let i = 0; i < lot.length; i++) {
      const a = lot[i]!;
      const b = lot[(i + 1) % lot.length]!;
      perimeter += Math.hypot(b[0] - a[0], b[1] - a[1]);
    }
    let covered = 0;
    for (const s of segs) {
      covered += Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
      // Every segment lies on the lot line.
      for (const p of [s.a, s.b]) {
        const d = Math.min(
          ...lot.map((q, i) => distToSegment(p[0], p[1], q, lot[(i + 1) % lot.length]!)),
        );
        expect(d, s.kind === 'run' ? s.run.id : s.gate.id).toBeLessThan(1e-6);
      }
    }
    expect(covered).toBeCloseTo(perimeter, 6);
  });

  it('closed sliding car gate + open pedestrian gate at the road end (south-west)', () => {
    const car = GATES.find((g) => g.kind === 'car')!;
    const ped = GATES.find((g) => g.kind === 'pedestrian')!;
    expect(car.open).toBe(false);
    expect(ped.open).toBe(true);
    // Both open onto the public road end (x −11.96…−4.96 on the south lot line).
    for (const g of [car, ped]) {
      for (const p of [g.a, g.b]) {
        expect(p[1]).toBeCloseTo(lot[2]![1], 6);
        expect(p[0]).toBeGreaterThanOrEqual(-11.96);
        expect(p[0]).toBeLessThanOrEqual(-4.1);
      }
    }
    expect(Math.abs(car.a[0] - car.b[0])).toBeGreaterThanOrEqual(3.0);
    expect(Math.abs(ped.a[0] - ped.b[0])).toBeGreaterThanOrEqual(1.0);
    // Street side 1.2 m, sides & rear 1.8 m.
    for (const r of FENCE) expect(r.height).toBe(r.kind === 'street' ? 1.2 : 1.8);
  });
});

describe('terrain (spot heights 261.70–261.91, CTA −0.05)', () => {
  it('nearly flat, raised to the house base, fading to the context ground', () => {
    let min = Infinity;
    let max = -Infinity;
    for (let x = -8; x < 25; x += 0.5) {
      for (let z = -2.5; z < 14.5; z += 0.5) {
        if (!pointInPolygon(x, z, lot)) continue;
        const h = terrainHeight(x, z);
        min = Math.min(min, h);
        max = Math.max(max, h);
        // Walkable: slope < 4 % everywhere.
        const g = Math.hypot(terrainHeight(x + 0.1, z) - h, terrainHeight(x, z + 0.1) - h) / 0.1;
        expect(g, `slope at ${x}, ${z}`).toBeLessThan(0.04);
      }
    }
    expect(min).toBeGreaterThan(-0.29);
    expect(max).toBeLessThan(-0.05);
    // Lawn 4 cm under the paving at the house (CTA −0.05).
    expect(terrainHeight(-0.5, 3)).toBeCloseTo(-0.09, 3);
    expect(terrainHeight(15, -0.6)).toBeCloseTo(-0.09, 2);
    // The survey is followed away from the house; next to it the ground is filled up to
    // the house base, never beyond (spot heights are 7–28 cm below ±0.00).
    for (const s of SPOT_HEIGHTS) {
      if (!pointInPolygon(s.x, s.z, lot)) continue;
      const nat = s.abs - 261.98;
      const h = terrainHeight(s.x, s.z);
      expect(h, s.id).toBeGreaterThanOrEqual(Math.min(nat, -0.09) - 0.02);
      expect(h, s.id).toBeLessThanOrEqual(Math.max(nat, -0.09) + 0.02);
    }
    // Lot corners (farthest from the house) are on the survey.
    expect(terrainHeight(25.0, 14.45)).toBeCloseTo(naturalHeight(25.0, 14.45), 1);
    expect(Math.abs(terrainHeight(-8.3, 14.4) - naturalHeight(-8.3, 14.4))).toBeLessThan(0.02);
    expect(naturalHeight(20.28, 12.76)).toBeCloseTo(261.72 - 261.98, 1);
    // Grid border = flat context ground.
    expect(terrainHeight(TERRAIN.x0, TERRAIN.z0)).toBeCloseTo(FIELD_Y, 6);
    expect(terrainHeight(TERRAIN.x1, 5)).toBeCloseTo(FIELD_Y, 6);
  });
});

describe('garden geometry and colliders', () => {
  const world = buildWorld(house);
  const ray = new THREE.Raycaster();
  const down = (x: number, z: number): number | null => {
    ray.set(new THREE.Vector3(x, 5, z), new THREE.Vector3(0, -1, 0));
    const hit = world.bvh.raycastFirst(ray.ray, THREE.DoubleSide, 0, 10);
    return hit ? hit.point.y : null;
  };
  const across = (a: Vec2, b: Vec2, y = 0.9): boolean => {
    const dir = new THREE.Vector3(b[0] - a[0], 0, b[1] - a[1]);
    const len = dir.length();
    ray.set(new THREE.Vector3(a[0], y, a[1]), dir.normalize());
    return world.bvh.raycastFirst(ray.ray, THREE.DoubleSide, 0, len) !== null;
  };

  it('walkable ground: lawn, paving draped 4 cm above it, no holes', () => {
    for (const [x, z] of [
      [-5, 0],
      [22, 3],
      [12, 12],
      [15, -1.5],
    ] as const) {
      expect(down(x, z)!, `${x}, ${z}`).toBeCloseTo(terrainHeight(x, z), 2);
    }
    expect(down(-6.2, 6.8)!).toBeCloseTo(terrainHeight(-6.2, 6.8) + 0.04, 3);
    expect(down(-0.9, 2.0)!).toBeCloseTo(-0.05, 2); // stone path at the house
  });

  it('the fence, closed car gate, trunks and beds block; the pedestrian gate is open', () => {
    expect(across([10, 14.0], [10, 15.0])).toBe(true); // south fence
    expect(across([25.0, 5], [26.5, 5])).toBe(true); // east fence
    expect(across([10, -2.0], [10, -3.2])).toBe(true); // north fence
    expect(across([-7.5, 5], [-9.0, 5])).toBe(true); // west (street) fence
    expect(across([-5.7, 14.0], [-5.7, 15.0])).toBe(true); // car gate
    expect(across([-7.85, 14.0], [-7.85, 15.0])).toBe(false); // pedestrian gate
    expect(across([-7.85, 16], [-7.85, 23])).toBe(true); // end of the walkable street
    const apple = TREES.find((t) => t.id === 'apple')!;
    expect(across([apple.x - 1, apple.z], [apple.x + 1, apple.z])).toBe(true);
    const bed = RAISED_BEDS[0]!;
    expect(across([17.8, bed.min[1] - 0.4], [17.8, bed.min[1] + 0.5], 0.2)).toBe(true);
  });

  it('adds a bounded number of materials and triangles for the garden', () => {
    const ids = world.group.children.map((m) => m.name);
    for (const id of ['timber', 'corten', 'gravel', 'bark', 'foliage', 'meadow']) {
      expect(ids).toContain(id);
    }
    expect(world.triangles).toBeLessThan(120_000);
    world.group.traverse((o) => {
      if (o instanceof THREE.Mesh) (o.geometry as THREE.BufferGeometry).dispose();
    });
  });
}, 60_000);

describe('garden places', () => {
  it('each place is a zone outside the house and the deck, found by locate()', () => {
    for (const zn of GARDEN_ZONES) {
      let hits = 0;
      for (let x = -12; x < 26; x += 0.25) {
        for (let z = -3; z < 22; z += 0.25) {
          if (!pointInPolygon(x, z, zn.polygon)) continue;
          expect(inHouse(x, z), `${zn.id} in the house at ${x}, ${z}`).toBe(false);
          expect(pointInPolygon(x, z, terrace.polygon), `${zn.id} on the deck`).toBe(false);
          hits++;
        }
      }
      expect(hits, zn.id).toBeGreaterThan(10);
    }
    expect(locate(house, 22.0, -0.1, 5.2).place.id).toBe('fire-pit');
    expect(locate(house, 19.4, -0.1, 11.7).place.id).toBe('vegetable-beds');
    expect(locate(house, 12.0, -0.1, -1.2).place.id).toBe('north-side');
    expect(locate(house, 18.5, 0, 4).place.id).toBe('terrace');
    expect(locate(house, -7.8, -0.2, 18).place.id).toBe('street');
  });

  it('every garden place is reachable on foot from the start pose (flood fill)', () => {
    const R = 0.25; // player radius
    const obstacles: Obstacle[] = [...gardenObstacles()];
    // Colliding exterior elements of the house (canopy screen, sunshade fins, slats).
    for (const e of house.exterior) {
      if (!('collide' in e) || !e.collide) continue;
      if (e.type === 'box' && e.box.max[1] > 0.2) {
        obstacles.push({
          id: e.id,
          kind: 'box',
          min: [e.box.min[0], e.box.min[2]],
          max: [e.box.max[0], e.box.max[2]],
        });
      } else if (e.type === 'slats') {
        obstacles.push({ id: e.id, kind: 'box', min: [e.x[0], e.z[0]], max: [e.x[1], e.z[1]] });
      }
    }
    const blocked = (x: number, z: number): boolean => {
      if (!pointInPolygon(x, z, lot) && !pointInPolygon(x, z, STREET_AREA)) return true;
      if (inHouse(x, z, R) && !pointInPolygon(x, z, terrace.polygon)) return true;
      return obstacles.some((o) => {
        if (o.kind === 'circle') return Math.hypot(x - o.x, z - o.z) < o.r + R;
        if (o.kind === 'segment') return distToSegment(x, z, o.a, o.b) < o.halfWidth + R;
        const dx = Math.max(o.min[0] - x, 0, x - o.max[0]);
        const dz = Math.max(o.min[1] - z, 0, z - o.max[1]);
        return Math.hypot(dx, dz) < R;
      });
    };
    const step = 0.1;
    const x0 = -12.5;
    const z0 = -3;
    const nx = Math.round((26.5 - x0) / step);
    const nz = Math.round((22.5 - z0) / step);
    const seen = new Uint8Array(nx * nz);
    const [sx, , sz] = site.start.position;
    const q: number[] = [Math.round((sz - z0) / step) * nx + Math.round((sx - x0) / step)];
    seen[q[0]!] = 1;
    while (q.length) {
      const c = q.pop()!;
      const i = c % nx;
      const j = (c - i) / nx;
      for (const [di, dj] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ] as const) {
        const ii = i + di;
        const jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
        const k = jj * nx + ii;
        if (seen[k] || blocked(x0 + ii * step, z0 + jj * step)) continue;
        seen[k] = 1;
        q.push(k);
      }
    }
    const reached = (poly: Polygon): number => {
      let n = 0;
      for (let k = 0; k < seen.length; k++) {
        if (!seen[k]) continue;
        const x = x0 + (k % nx) * step;
        const z = z0 + Math.floor(k / nx) * step;
        if (pointInPolygon(x, z, poly)) n++;
      }
      return n;
    };
    for (const zn of [...GARDEN_ZONES, terrace]) {
      expect(reached(zn.polygon), zn.id).toBeGreaterThan(20);
    }
  });
});
