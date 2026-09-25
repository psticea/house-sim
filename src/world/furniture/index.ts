/**
 * Furniture (plan.md I5): builds every `FURNITURE` item with the procedural kit into one
 * triangle bucket per material, plus simplified collision boxes, and attaches the result
 * to an already-built house (lazy load, step 5.5): new materials become new merged
 * meshes, materials the house already has (glass, clay, bark, timber…) are merged into
 * the existing mesh — so the draw-call count only grows by the new furniture materials.
 */
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
  FURNITURE,
  faceAngle,
  floorOf,
  furnitureColliders,
  type FurnitureItem,
} from '../../data/furniture';
import type { BuiltWorld } from '../build';
import { castsShadow } from '../materials';
import { MeshBuilder } from '../meshBuilder';
import { Frame } from './kit';
import { BUILDERS } from './pieces';

export interface BuiltFurniture {
  mesh: MeshBuilder;
  collider: MeshBuilder;
}

/** Pure geometry pass (Node-safe): furniture triangles per material + collider boxes. */
export function buildFurniture(items: readonly FurnitureItem[] = FURNITURE): BuiltFurniture {
  const mesh = new MeshBuilder();
  const collider = new MeshBuilder();
  for (const it of items) {
    const f = new Frame(mesh, it.at[0], floorOf(it.level), it.at[1], faceAngle(it.face));
    BUILDERS[it.kind](f, it);
  }
  for (const c of furnitureColliders(items)) collider.box('concrete', c.min, c.max);
  return { mesh, collider };
}

export interface AttachedFurniture {
  /** New meshes (furniture-only materials). */
  added: THREE.Mesh[];
  /** Existing house meshes whose geometry now also holds furniture. */
  merged: THREE.Mesh[];
  triangles: number;
}

/**
 * Adds the furniture to a built world: meshes into `world.group`, boxes into the
 * collider (a new BVH replaces `world.bvh` — hand it to the player controller).
 */
export function attachFurniture(
  world: BuiltWorld,
  built: BuiltFurniture = buildFurniture(),
): AttachedFurniture {
  const added: THREE.Mesh[] = [];
  const merged: THREE.Mesh[] = [];
  const byName = new Map<string, THREE.Mesh>();
  for (const o of world.group.children) {
    if (o instanceof THREE.Mesh) byName.set(o.name, o as THREE.Mesh);
  }
  for (const [id, geometry] of built.mesh.toGeometries()) {
    const existing = byName.get(id);
    if (existing) {
      const g = mergeGeometries([existing.geometry, geometry]) as THREE.BufferGeometry | null;
      geometry.dispose();
      if (!g) throw new Error(`Cannot merge furniture into ${id}`);
      existing.geometry.dispose();
      existing.geometry = g;
      merged.push(existing);
      continue;
    }
    const m = new THREE.Mesh(geometry, world.materials[id]);
    m.name = id;
    m.castShadow = castsShadow(id);
    m.receiveShadow = id !== 'glass' && id !== 'mirror';
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    world.group.add(m);
    added.push(m);
  }
  const colGeo = built.collider.toGeometries().get('concrete');
  if (colGeo) {
    // The BVH indexed the house collider: merge as triangle soups.
    const house = world.collider.geometry;
    const g = mergeGeometries([
      house.index ? house.toNonIndexed() : house,
      colGeo,
    ]) as THREE.BufferGeometry | null;
    colGeo.dispose();
    if (!g) throw new Error('Cannot merge furniture colliders');
    world.collider.geometry.dispose();
    world.collider.geometry = g;
    world.bvh = new MeshBVH(g);
    world.colliderTriangles += built.collider.triangleCount;
  }
  world.triangles += built.mesh.triangleCount;
  return { added, merged, triangles: built.mesh.triangleCount };
}
