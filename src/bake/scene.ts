/**
 * The scene as the baker sees it: the exact runtime world (house + site + furniture,
 * merged per material, in the runtime's mesh order) split into lightmapped meshes and
 * occluders. Node-safe (unit tests) and used by `bake.html`.
 */
import * as THREE from 'three';
import { house } from '../data/house';
import type { MaterialId } from '../data/schema';
import { buildWorld, type BuiltWorld } from '../world/build';
import { attachFurniture } from '../world/furniture';
import { UNBAKED } from './config';

export interface BakeScene {
  world: BuiltWorld;
  /** Every visible mesh of the world group (runtime order). */
  meshes: THREE.Mesh[];
  /** Meshes that get a lightmap. */
  baked: THREE.Mesh[];
}

export function collectMeshes(group: THREE.Object3D): THREE.Mesh[] {
  const out: THREE.Mesh[] = [];
  for (const o of group.children) {
    if (o instanceof THREE.Mesh && o.visible && o.name !== 'collider') out.push(o as THREE.Mesh);
  }
  return out;
}

export const isBaked = (id: string): boolean => !UNBAKED.has(id as MaterialId);

/** Builds the full static world exactly like the app does after the furniture arrives. */
export function buildBakeScene(): BakeScene {
  const world = buildWorld(house);
  attachFurniture(world);
  const meshes = collectMeshes(world.group);
  return { world, meshes, baked: meshes.filter((m) => isBaked(m.name)) };
}
