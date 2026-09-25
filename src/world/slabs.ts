/** Horizontal slabs: room floors, the upper slab (= ground-floor ceiling), flat site patches (deck, road). */
import type { Slab, SitePatch } from '../data/schema';
import type { MeshBuilder } from './meshBuilder';

export function buildSlab(
  mesh: MeshBuilder,
  collider: MeshBuilder,
  slab: Slab,
  floorOnlyDefault = false,
): void {
  const floorOnly = slab.floorOnly ?? floorOnlyDefault;
  mesh.prism(
    slab.polygon,
    slab.bottom,
    slab.top,
    {
      top: slab.material,
      bottom: floorOnly ? null : (slab.bottomMaterial ?? slab.material),
      sides: floorOnly || slab.noSides ? null : (slab.sideMaterial ?? slab.material),
    },
    slab.holes ?? [],
  );
  if (slab.collide) {
    const top = slab.colliderTop ?? slab.top;
    collider.prism(slab.polygon, slab.bottom, top, { top: 'concrete' }, slab.holes ?? []);
  }
}

export function buildPatch(mesh: MeshBuilder, collider: MeshBuilder, p: SitePatch): void {
  const bottom = p.top - p.thickness;
  mesh.prism(p.polygon, bottom, p.top, { top: p.material, bottom: null, sides: p.material });
  if (p.collide) collider.prism(p.polygon, bottom - 0.2, p.top, { top: 'concrete' });
}
