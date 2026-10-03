import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { pointInPolygon, polygonArea } from '../src/data/geometry2d';
import { house } from '../src/data/house';
import { buildGeometry, buildWorld } from '../src/world/build';
import { insetConvex, zoneBoards } from '../src/world/cladding';

describe('generated geometry', () => {
  const { mesh, collider } = buildGeometry(house);
  const geos = mesh.toGeometries();

  it('has no NaN and no degenerate triangles', () => {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (const [id, g] of geos) {
      const pos = g.getAttribute('position');
      let bad = 0;
      for (let i = 0; i < pos.count; i++) {
        if (!Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))) bad++;
      }
      expect(bad, `${id} non-finite positions`).toBe(0);
      let degenerate = 0;
      for (let t = 0; t < pos.count; t += 3) {
        a.fromBufferAttribute(pos, t);
        b.fromBufferAttribute(pos, t + 1).sub(a);
        c.fromBufferAttribute(pos, t + 2).sub(a);
        if (b.cross(c).length() / 2 < 1e-8) degenerate++;
      }
      expect(degenerate, `${id} degenerate triangles`).toBe(0);
      const nor = g.getAttribute('normal');
      for (let i = 0; i < nor.count; i++) {
        if (!Number.isFinite(nor.getX(i) + nor.getY(i) + nor.getZ(i))) bad++;
      }
      expect(bad, `${id} non-finite normals`).toBe(0);
    }
  });

  it('stays well inside the triangle budget and keeps draw calls low', () => {
    expect(mesh.triangleCount).toBeGreaterThan(1000);
    expect(mesh.triangleCount).toBeLessThan(400_000);
    // One mesh per material (house 22 + garden 11).
    expect(geos.size).toBeLessThanOrEqual(34);
  });

  it('house fits the building envelope (roof below the ridge, walls inside the shell)', () => {
    const box = new THREE.Box3();
    for (const [id, g] of buildGeometry(house, { site: false }).mesh.toGeometries()) {
      if (['concrete', 'grating', 'stone'].includes(id)) continue; // light well
      box.union(g.boundingBox!);
    }
    expect(box.max.y).toBeLessThanOrEqual(7.95); // chimney top +7.90
    expect(box.min.x).toBeGreaterThanOrEqual(-0.345); // ridge cap overhangs 1 cm
    expect(box.max.x).toBeLessThanOrEqual(18.395);
    expect(box.min.z).toBeGreaterThanOrEqual(-2.3); // entrance canopy reaches z −2.28
    expect(box.max.z).toBeLessThanOrEqual(8.1); // sunshade reaches z 8.08
  });

  it('collider is non-empty and has a BVH', () => {
    expect(collider.triangleCount).toBeGreaterThan(100);
    const world = buildWorld(house);
    expect(world.bvh).toBeDefined();
    expect(world.collider.geometry.getAttribute('position').count).toBeGreaterThan(300);
    world.group.traverse((o) => {
      if (o instanceof THREE.Mesh) (o.geometry as THREE.BufferGeometry).dispose();
    });
  });

  it('collider blocks the exterior wall but not the entrance door', () => {
    const world = buildWorld(house);
    const ray = new THREE.Raycaster();
    const hit = (from: THREE.Vector3, dir: THREE.Vector3, far: number) => {
      ray.set(from, dir.normalize());
      ray.far = far;
      return world.bvh.raycastFirst(ray.ray, THREE.DoubleSide, 0, far);
    };
    // Through the north wall at bedroom 1 (no opening at x = 1.0): blocked.
    expect(hit(new THREE.Vector3(1.0, 1.0, -1.0), new THREE.Vector3(0, 0, 1), 2)).not.toBeNull();
    // Through the entrance door centre (x = 8.775): free up to the hall.
    expect(hit(new THREE.Vector3(8.7, 1.0, -1.0), new THREE.Vector3(0, 0, 1), 2)).toBeNull();
    // Window F-03 is glass: blocked.
    expect(hit(new THREE.Vector3(2.575, 1.4, -1.0), new THREE.Vector3(0, 0, 1), 2)).not.toBeNull();
    // Owner changes (2026-10): from the play corner toward the basement-stair opening
    // under the landing — blocked at the new wall (x 9.625) at every player height; the
    // bedroom-2 → bathroom wall is solid; the curtain-wall door (z 1.15…2.20) is open.
    const west = new THREE.Vector3(-1, 0, 0);
    for (const z of [6.0, 6.3, 6.65, 7.0]) {
      for (const y of [0.1, 0.7, 1.3]) {
        const h = hit(new THREE.Vector3(10.6, y, z), west.clone(), 2);
        expect(h, `living → basement stair at y ${y}, z ${z}`).not.toBeNull();
        expect(h!.point.x, `y ${y}, z ${z}`).toBeGreaterThan(9.6);
      }
    }
    expect(hit(new THREE.Vector3(3.9, 1.0, 5.78), new THREE.Vector3(1, 0, 0), 2)).not.toBeNull();
    expect(hit(new THREE.Vector3(15.6, 1.0, 1.7), new THREE.Vector3(1, 0, 0), 2)).toBeNull();
    expect(hit(new THREE.Vector3(15.6, 1.0, 3.0), new THREE.Vector3(1, 0, 0), 2)).not.toBeNull();
  });

  it('walkable surfaces on all three levels: floors, stair ramps, no stair blocker', () => {
    const world = buildWorld(house);
    const ray = new THREE.Raycaster();
    const floorAt = (x: number, fromY: number, z: number): number | null => {
      ray.set(new THREE.Vector3(x, fromY, z), new THREE.Vector3(0, -1, 0));
      const h = world.bvh.raycastFirst(ray.ray, THREE.DoubleSide, 0, 20);
      return h ? h.point.y : null;
    };
    // Upper floor (+2.95) in bedroom 3, basement (−2.53) in the storage.
    expect(floorAt(2.0, 5, 3.0)).toBeCloseTo(2.95, 3);
    expect(floorAt(11.0, -1, 5.0)).toBeCloseTo(-2.53, 3);
    // Main stair: ramp through the nosings (lower flight z 4.8, upper flight z 4.6).
    const r = 2.95 / 17;
    expect(floorAt(8.9, 2.0, 4.8)).toBeCloseTo(r * (1 + 1.175 / 0.29), 3);
    expect(floorAt(7.8, 2.9, 4.6)).toBeCloseTo(r * (10 + 1.305 / 0.29), 3);
    // Basement stair (upper flight at z 5.0), not hidden under the lawn / ground slab.
    expect(floorAt(7.8, -0.2, 5.0)).toBeCloseTo(-2.53 + (2.53 / 14) * (7 + 1.128 / 0.28), 3);
    // Head room over both stairs: nothing between the ramp and 2 m above it.
    for (const [x, z] of [
      [8.9, 4.2],
      [7.8, 4.4],
      [7.8, 5.6],
    ] as const) {
      const y = floorAt(x, 10, z);
      expect(y, `stair well ${x}, ${z}`).toBeGreaterThan(0);
    }
    const y = floorAt(7.8, 1.2, 4.6);
    expect(y, 'basement stair under the upper flight').toBeLessThan(0);
  });
});

describe('west facade boards (cladding.ts)', () => {
  it('boards fill the wood field around the windows, with the zone directions', () => {
    const ground = house.levels.find((l) => l.id === 'ground')!;
    const w = ground.walls.find((x) => x.id === 'ext-w')!;
    const clad = w.cladding!;
    const holes = ground.openings
      .filter((o) => o.wall === 'ext-w')
      .map((o) => ({ u0: o.offset, u1: o.offset + o.width, v0: o.sill, v1: o.sill + o.height }));
    let boards = 0;
    for (const zone of clad.zones) {
      const pieces = zoneBoards(zone, clad.joint, holes);
      expect(pieces.length, zone.direction).toBeGreaterThan(3);
      for (const p of pieces) {
        const us = p.map((q) => q[0]);
        const vs = p.map((q) => q[1]);
        const [u0, u1, v0, v1] = [
          Math.min(...us),
          Math.max(...us),
          Math.min(...vs),
          Math.max(...vs),
        ];
        // Boards are long in their direction, at most one pitch wide across it.
        const across = zone.direction === 'vertical' ? u1 - u0 : v1 - v0;
        expect(across).toBeLessThanOrEqual(zone.pitch * 1.31);
        for (const h of holes) {
          const overlap =
            u0 < h.u1 - 1e-6 && u1 > h.u0 + 1e-6 && v0 < h.v1 - 1e-6 && v1 > h.v0 + 1e-6;
          expect(overlap, 'board over a window').toBe(false);
        }
        for (const q of p) {
          expect(pointInPolygon(q[0], q[1], insetConvex(zone.polygon, -1e-6))).toBe(true);
        }
        boards += polygonArea(p);
      }
    }
    const windows = holes.reduce((s, h) => s + (h.u1 - h.u0) * (h.v1 - h.v0), 0);
    const field = polygonArea(clad.region) - windows;
    expect(boards / field).toBeGreaterThan(0.93);
    expect(boards / field).toBeLessThan(1);
  });
});
