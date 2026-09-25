/**
 * Roof shell: each segment is the chevron profile between the outer roof surface and
 * the underside, extruded along x. The eave fascia continues the facade; the flat
 * underside strips above the walls are never visible and are omitted.
 */
import type { MeshBuilder, V3 } from './meshBuilder';
import type { Roof, RoofSegment } from '../data/schema';
import { roofSlope, roofTopY, roofUndersideY } from '../data/geometry2d';

function profile(roof: Roof, seg: RoofSegment): [number, number][] {
  const [zN, zS] = roof.eaveZ;
  const zA = zN + seg.innerZ;
  const zB = zS - seg.innerZ;
  return [
    [zN, seg.innerY],
    [zN, roof.eaveY],
    [roof.ridgeZ, roofTopY(roof, roof.ridgeZ)],
    [zS, roof.eaveY],
    [zS, seg.innerY],
    [zB, seg.innerY],
    [roof.ridgeZ, roofUndersideY(roof, seg, roof.ridgeZ)],
    [zA, seg.innerY],
  ];
}

export function buildRoof(mesh: MeshBuilder, roof: Roof): void {
  const [zN, zS] = roof.eaveZ;
  const zR = roof.ridgeZ;
  const yR = roofTopY(roof, zR);
  const k = roofSlope(roof);
  const nTopN: V3 = [0, 1, -k];
  const nTopS: V3 = [0, 1, k];
  const segs = roof.segments;
  segs.forEach((seg, i) => {
    const [x0, x1] = seg.x;
    const zA = zN + seg.innerZ;
    const zB = zS - seg.innerZ;
    const yIn = roofUndersideY(roof, seg, zR);
    // Outer surface.
    mesh.quad(
      seg.topMaterial,
      [x0, roof.eaveY, zN],
      [x1, roof.eaveY, zN],
      [x1, yR, zR],
      [x0, yR, zR],
      nTopN,
    );
    mesh.quad(
      seg.topMaterial,
      [x0, yR, zR],
      [x1, yR, zR],
      [x1, roof.eaveY, zS],
      [x0, roof.eaveY, zS],
      nTopS,
    );
    // Eave fascias (continuation of the facade cladding).
    mesh.quad(
      seg.endMaterial,
      [x0, seg.innerY, zN],
      [x1, seg.innerY, zN],
      [x1, roof.eaveY, zN],
      [x0, roof.eaveY, zN],
      [0, 0, -1],
    );
    mesh.quad(
      seg.endMaterial,
      [x0, seg.innerY, zS],
      [x1, seg.innerY, zS],
      [x1, roof.eaveY, zS],
      [x0, roof.eaveY, zS],
      [0, 0, 1],
    );
    // Sloped underside (ceiling).
    mesh.quad(
      seg.underMaterial,
      [x0, seg.innerY, zA],
      [x1, seg.innerY, zA],
      [x1, yIn, zR],
      [x0, yIn, zR],
      [0, -1, k],
    );
    mesh.quad(
      seg.underMaterial,
      [x0, yIn, zR],
      [x1, yIn, zR],
      [x1, seg.innerY, zB],
      [x0, seg.innerY, zB],
      [0, -1, -k],
    );
    // End faces: at the building ends, and where this segment is deeper (lower
    // underside) than its neighbour — e.g. the loggia frame above the curtain wall.
    const prev = segs[i - 1];
    const next = segs[i + 1];
    const deeperThan = (other: RoofSegment | undefined): boolean =>
      !other || roofUndersideY(roof, seg, zR) < roofUndersideY(roof, other, zR) - 1e-6;
    const ring = profile(roof, seg);
    if (deeperThan(prev)) {
      // Inside the building (header above the curtain wall) it reads as ceiling.
      const mat = prev ? seg.underMaterial : seg.endMaterial;
      mesh.polygon(mat, ring, [], (z, y) => [x0, y, z], [-1, 0, 0]);
    }
    if (deeperThan(next)) {
      const mat = next ? seg.underMaterial : seg.endMaterial;
      mesh.polygon(mat, ring, [], (z, y) => [x1, y, z], [1, 0, 0]);
    }
  });

  // Ridge cap.
  const xMin = segs[0]!.x[0];
  const xMax = segs[segs.length - 1]!.x[1];
  mesh.box('roofMetal', [xMin - 0.01, yR - 0.02, zR - 0.08], [xMax + 0.01, yR + 0.04, zR + 0.08], {
    bottom: null,
  });

  // Roof windows FZ-01: black frame + glass lying on the roof plane.
  for (const w of roof.windows) {
    const north = (w.z[0] + w.z[1]) / 2 < zR;
    const n: V3 = north ? [0, 1, -k] : [0, 1, k];
    const len = Math.hypot(n[1], n[2]);
    const off = (d: number, x: number, z: number): V3 => [
      x,
      roofTopY(roof, z) + (n[1] / len) * d,
      z + (n[2] / len) * d,
    ];
    const [a, b] = w.x;
    const [c, d] = w.z;
    mesh.quad('metalBlack', off(0.03, a, c), off(0.03, b, c), off(0.03, b, d), off(0.03, a, d), n);
    const m = 0.07;
    mesh.quad(
      'glass',
      off(0.045, a + m, c + m),
      off(0.045, b - m, c + m),
      off(0.045, b - m, d - m),
      off(0.045, a + m, d - m),
      n,
    );
  }
}

export function buildChimney(mesh: MeshBuilder, roof: Roof): void {
  const { center, radius, top } = roof.chimney;
  mesh.cylinder('metalBlack', center[0], center[1], radius, 0, top, 12);
}
