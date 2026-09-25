/** Horizontal section of the generated geometry (like an architectural plan cut). */
import type * as THREE from 'three';
import type { MaterialId } from '../data/schema';

export interface SectionSegment {
  material: MaterialId;
  a: [number, number];
  b: [number, number];
}

/** Intersect every triangle with the plane y = h; returns plan segments [x, z]. */
export function sectionSegments(
  geometries: ReadonlyMap<MaterialId, THREE.BufferGeometry>,
  h: number,
): SectionSegment[] {
  const out: SectionSegment[] = [];
  for (const [material, g] of geometries) {
    const p = g.getAttribute('position');
    for (let t = 0; t < p.count; t += 3) {
      const pts: [number, number][] = [];
      for (let e = 0; e < 3; e++) {
        const i = t + e;
        const j = t + ((e + 1) % 3);
        const y0 = p.getY(i) - h;
        const y1 = p.getY(j) - h;
        if ((y0 < 0 && y1 >= 0) || (y0 >= 0 && y1 < 0)) {
          const k = y0 / (y0 - y1);
          pts.push([
            p.getX(i) + (p.getX(j) - p.getX(i)) * k,
            p.getZ(i) + (p.getZ(j) - p.getZ(i)) * k,
          ]);
        }
      }
      if (pts.length === 2) {
        const [a, b] = pts as [[number, number], [number, number]];
        if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1e-5) out.push({ material, a, b });
      }
    }
  }
  return out;
}
