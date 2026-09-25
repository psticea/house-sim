/** Horizontal slabs: room floors, the upper slab (= ground-floor ceiling), site patches. */
import type { HouseModel, Slab, SitePatch } from '../data/schema';
import type { MeshBuilder } from './meshBuilder';

export function buildSlab(
  mesh: MeshBuilder,
  collider: MeshBuilder,
  slab: Slab,
  floorOnly = false,
): void {
  mesh.prism(
    slab.polygon,
    slab.bottom,
    slab.top,
    {
      top: slab.material,
      bottom: floorOnly ? null : (slab.bottomMaterial ?? slab.material),
      sides: floorOnly ? null : (slab.sideMaterial ?? slab.material),
    },
    slab.holes ?? [],
  );
  if (slab.collide)
    collider.prism(slab.polygon, slab.bottom, slab.top, { top: 'concrete' }, slab.holes ?? []);
}

export function buildPatch(mesh: MeshBuilder, collider: MeshBuilder, p: SitePatch): void {
  const bottom = p.top - p.thickness;
  mesh.prism(p.polygon, bottom, p.top, { top: p.material, bottom: null, sides: p.material });
  if (p.collide) collider.prism(p.polygon, bottom - 0.2, p.top, { top: 'concrete' });
}

/** Lawn on the lot, the surrounding land, and invisible walls on the lot line (no fence until I3). */
export function buildGround(mesh: MeshBuilder, collider: MeshBuilder, model: HouseModel): void {
  const { lot, lawnY } = model.site;
  mesh.prism(lot, lawnY - 0.1, lawnY, { top: 'lawn', bottom: null, sides: 'lawn' });
  collider.prism(lot, lawnY - 0.5, lawnY, { top: 'concrete' });

  // Surrounding land: a large disc slightly below the lawn, with the lot cut out.
  const R = 600;
  const ring: [number, number][] = [];
  const cx = 9;
  const cz = 6;
  for (let i = 0; i < 48; i++) {
    const a = (-i / 48) * Math.PI * 2;
    ring.push([cx + Math.cos(a) * R, cz + Math.sin(a) * R]);
  }
  mesh.polygon(
    'field',
    ring,
    [lot.map(([x, z]) => [x, z] as [number, number])],
    (x, z) => [x, lawnY - 0.04, z],
    [0, 1, 0],
  );

  // Invisible boundary on the lot line.
  for (let i = 0; i < lot.length; i++) {
    const [ax, az] = lot[i]!;
    const [bx, bz] = lot[(i + 1) % lot.length]!;
    const len = Math.hypot(bx - ax, bz - az);
    const ux = (bx - ax) / len;
    const uz = (bz - az) / len;
    collider.orientedBox(
      'concrete',
      [(ax + bx) / 2, lawnY + 1.2, (az + bz) / 2],
      [ux, 0, uz],
      [0, 1, 0],
      [uz, 0, -ux],
      [len / 2 + 0.2, 1.4, 0.1],
    );
  }
}
