import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { house } from '../src/data/house';
import { buildGeometry, buildWorld } from '../src/world/build';

describe('generated geometry', () => {
  const { mesh, collider } = buildGeometry(house);
  const geos = mesh.toGeometries();

  it('has no NaN and no degenerate triangles', () => {
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    for (const [id, g] of geos) {
      const pos = g.getAttribute('position');
      for (let i = 0; i < pos.count; i++) {
        expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i)), id).toBe(true);
      }
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
        expect(Number.isFinite(nor.getX(i) + nor.getY(i) + nor.getZ(i)), id).toBe(true);
      }
    }
  });

  it('stays well inside the triangle budget and keeps draw calls low', () => {
    expect(mesh.triangleCount).toBeGreaterThan(1000);
    expect(mesh.triangleCount).toBeLessThan(400_000);
    // One mesh per material.
    expect(geos.size).toBeLessThanOrEqual(30);
  });

  it('house fits the building envelope (roof below the ridge, walls inside the shell)', () => {
    const box = new THREE.Box3();
    for (const [id, g] of geos) {
      if (
        ['field', 'lawn', 'asphalt', 'pavers', 'stone', 'deck', 'concrete', 'grating'].includes(id)
      )
        continue;
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
