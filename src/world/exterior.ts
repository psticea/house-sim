/** Simple exterior elements: canopy, sunshade, fins, slat screens, rain chains, light well. */
import type { ExteriorElement } from '../data/schema';
import type { MeshBuilder, V3 } from './meshBuilder';

export function buildExteriorElement(
  mesh: MeshBuilder,
  collider: MeshBuilder,
  e: ExteriorElement,
): void {
  if (e.type === 'box') {
    const opts: { top?: typeof e.topMaterial; bottom?: typeof e.bottomMaterial } = {};
    if (e.topMaterial) opts.top = e.topMaterial;
    if (e.bottomMaterial) opts.bottom = e.bottomMaterial;
    mesh.box(e.material, e.box.min, e.box.max, opts);
    if (e.seams) {
      // Standing seams (2.5 × 3 cm) running along z on the top face.
      const [x0, y1, z0] = [e.box.min[0], e.box.max[1], e.box.min[2]];
      const [x1, , z1] = e.box.max;
      const n = Math.floor((x1 - x0) / e.seams);
      const start = x0 + (x1 - x0 - n * e.seams) / 2;
      for (let i = 1; i < n; i++) {
        const x = start + i * e.seams;
        mesh.box(
          e.topMaterial ?? e.material,
          [x - 0.0125, y1, z0 + 0.01],
          [x + 0.0125, y1 + 0.03, z1 - 0.01],
          { bottom: null },
        );
      }
    }
    if (e.collide) collider.box('concrete', e.box.min, e.box.max);
    return;
  }
  if (e.type === 'chain') {
    // Stylised links: small diamond plates, each turned ~97° from the previous one (reads
    // as a chain from the garden; one box per link keeps triangles and edge lines low).
    const L = e.link;
    const s = L * 0.35;
    const t = 0.003;
    const r = Math.SQRT1_2;
    for (let y = e.y[1] - L / 2, k = 0; y - L / 2 >= e.y[0] - 1e-6; y -= L * 0.8, k++) {
      const a = k * (Math.PI / 2 + 0.12);
      const hx = Math.cos(a);
      const hz = Math.sin(a);
      const ax: V3 = [hx * r, r, hz * r];
      const ay: V3 = [-hx * r, r, -hz * r];
      const az: V3 = [-hz, 0, hx];
      mesh.orientedBox(e.material, [e.x, y, e.z], ax, ay, az, [s, s, t]);
    }
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
