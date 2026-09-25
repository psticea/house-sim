/** Simple exterior elements: canopy, sunshade, fins, slat screens. */
import type { ExteriorElement } from '../data/schema';
import type { MeshBuilder } from './meshBuilder';

export function buildExteriorElement(
  mesh: MeshBuilder,
  collider: MeshBuilder,
  e: ExteriorElement,
): void {
  if (e.type === 'box') {
    const opts = e.topMaterial ? { top: e.topMaterial } : {};
    mesh.box(e.material, e.box.min, e.box.max, opts);
    if (e.collide) collider.box('concrete', e.box.min, e.box.max);
    return;
  }
  const count = Math.max(1, Math.round((e.x[1] - e.x[0] - e.width) / e.spacing) + 1);
  const gap = count > 1 ? (e.x[1] - e.x[0] - e.width) / (count - 1) : 0;
  for (let i = 0; i < count; i++) {
    const x0 = e.x[0] + i * gap;
    mesh.box(e.material, [x0, e.y[0], e.z[0]], [x0 + e.width, e.y[1], e.z[1]], { bottom: null });
  }
  if (e.collide) collider.box('concrete', [e.x[0], e.y[0], e.z[0]], [e.x[1], e.y[1], e.z[1]]);
}
