/**
 * HouseModel → renderable THREE.Group (one merged mesh per material) + a separate,
 * simplified collision mesh with a BVH (three-mesh-bvh).
 */
import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import type { HouseModel, Opening } from '../data/schema';
import { SHELL } from '../data/grid';
import { buildCurtainWall } from './curtain';
import { buildExteriorElement } from './exterior';
import { castsShadow, createMaterials, type MaterialLibrary } from './materials';
import { MeshBuilder } from './meshBuilder';
import { buildOpening } from './openings';
import { buildChimney, buildRoof } from './roof';
import { buildGround, buildPatch, buildSlab } from './slabs';
import { buildStairs } from './stairs';
import { buildWall } from './walls';

export interface BuiltWorld {
  group: THREE.Group;
  collider: THREE.Mesh;
  bvh: MeshBVH;
  materials: MaterialLibrary;
  triangles: number;
  colliderTriangles: number;
}

/** Pure geometry pass (usable in Node tests): visual and collision triangle soups. */
export function buildGeometry(model: HouseModel): { mesh: MeshBuilder; collider: MeshBuilder } {
  const mesh = new MeshBuilder();
  const collider = new MeshBuilder();
  const ctx = { mesh, collider, roof: model.roof };

  for (const level of model.levels) {
    const byWall = new Map<string, Opening[]>();
    for (const o of level.openings) {
      const list = byWall.get(o.wall) ?? [];
      list.push(o);
      byWall.set(o.wall, list);
    }
    for (const wall of level.walls) {
      const ops = byWall.get(wall.id) ?? [];
      if (wall.kind === 'curtain') {
        buildCurtainWall(mesh, collider, model.roof, wall, ops, level.floorY);
        continue;
      }
      const ws = buildWall(ctx, wall, ops, level.floorY);
      for (const o of ops) buildOpening(mesh, collider, ws, o);
    }
    for (const slab of level.slabs) {
      buildSlab(mesh, collider, slab, level.id === 'ground');
    }
    for (const st of level.stairs) buildStairs(mesh, collider, st, level.floorY);
  }

  // Ground floor structure under the finished floors (collision only; hidden visually).
  collider.box('concrete', [SHELL.west, -0.4, SHELL.north], [SHELL.east, 0, SHELL.south]);
  // Screed 1 cm under the finished floors: fills the few strips between room polygons
  // (e.g. along the open stair/living edge) without competing with the room floors.
  mesh.box('oak', [SHELL.west, -0.06, SHELL.north], [16.625, -0.01, SHELL.south], { bottom: null });

  buildRoof(mesh, model.roof);
  buildChimney(mesh, model.roof);
  const c = model.roof.chimney;
  collider.box(
    'concrete',
    [c.center[0] - c.radius, 0, c.center[1] - c.radius],
    [c.center[0] + c.radius, 3, c.center[1] + c.radius],
  );
  for (const e of model.exterior) buildExteriorElement(mesh, collider, e);
  for (const p of model.site.patches) buildPatch(mesh, collider, p);
  buildGround(mesh, collider, model);
  return { mesh, collider };
}

export function buildWorld(model: HouseModel): BuiltWorld {
  const { mesh, collider } = buildGeometry(model);
  const materials = createMaterials();
  const group = new THREE.Group();
  group.name = 'house';
  for (const [id, geometry] of mesh.toGeometries()) {
    const m = new THREE.Mesh(geometry, materials[id]);
    m.name = id;
    m.castShadow = castsShadow(id);
    m.receiveShadow = id !== 'glass';
    m.matrixAutoUpdate = false;
    if (id === 'glass') m.renderOrder = 10;
    group.add(m);
  }
  const colGeo = collider.toGeometries().get('concrete');
  if (!colGeo) throw new Error('Empty collider');
  const bvh = new MeshBVH(colGeo);
  const colMesh = new THREE.Mesh(colGeo);
  colMesh.name = 'collider';
  colMesh.visible = false;
  return {
    group,
    collider: colMesh,
    bvh,
    materials,
    triangles: mesh.triangleCount,
    colliderTriangles: collider.triangleCount,
  };
}
