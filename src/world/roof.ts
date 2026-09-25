/**
 * Roof: per segment the outer standing-seam sheet and the sloped underside (ceiling),
 * both with openings for the roof windows (FZ-01) joined by reveal linings; recessed
 * hidden gutters along both eaves, standing seams every 50 cm, tubular snow guards,
 * ridge cap, roof-window frames + glass (outside) and sashes (inside), the wood-board
 * ceiling of the living room, and the chimney with its cap. Everything is merged per
 * material by the MeshBuilder.
 */
import type { MeshBuilder, V3 } from './meshBuilder';
import type { MaterialId, Roof, RoofSegment, RoofWindow } from '../data/schema';
import { rad, roofTopY, roofUndersideY } from '../data/geometry2d';

type Side = 'n' | 's';

interface SlopeFrame {
  side: Side;
  /** Unit outward normal of the roof planes. */
  n: V3;
  /** Unit direction up the slope (toward the ridge). */
  up: V3;
}

function frames(roof: Roof): Record<Side, SlopeFrame> {
  const c = Math.cos(rad(roof.pitchDeg));
  const s = Math.sin(rad(roof.pitchDeg));
  return {
    n: { side: 'n', n: [0, c, -s], up: [0, s, c] },
    s: { side: 's', n: [0, c, s], up: [0, s, -c] },
  };
}

const add = (a: V3, b: V3, k = 1): V3 => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];
const neg = (a: V3): V3 => [-a[0], -a[1], -a[2]];

/** Perpendicular distance between the outer sheet and the underside of a segment. */
export function roofThickness(roof: Roof, seg: RoofSegment): number {
  const z = roof.ridgeZ;
  return (roofTopY(roof, z) - roofUndersideY(roof, seg, z)) * Math.cos(rad(roof.pitchDeg));
}

const windowSide = (roof: Roof, w: RoofWindow): Side =>
  (w.z[0] + w.z[1]) / 2 < roof.ridgeZ ? 'n' : 's';

/** Plan z range of a window's opening in the underside (reveal ⟂ to the roof). */
export function undersideWindowZ(roof: Roof, seg: RoofSegment, w: RoofWindow): [number, number] {
  const shift = roofThickness(roof, seg) * Math.sin(rad(roof.pitchDeg));
  const d = windowSide(roof, w) === 'n' ? shift : -shift;
  return [w.z[0] + d, w.z[1] + d];
}

const segWindows = (roof: Roof, seg: RoofSegment, side: Side): RoofWindow[] =>
  roof.windows.filter(
    (w) => windowSide(roof, w) === side && w.x[0] >= seg.x[0] - 1e-6 && w.x[1] <= seg.x[1] + 1e-6,
  );

const rect = (x: readonly [number, number], z: readonly [number, number]): [number, number][] => [
  [x[0], z[0]],
  [x[1], z[0]],
  [x[1], z[1]],
  [x[0], z[1]],
];

/** Remove [a, b] from a list of 1D spans (drops slivers shorter than `min`). */
function cutSpans(
  spans: [number, number][],
  a: number,
  b: number,
  min: number,
): [number, number][] {
  return spans.flatMap(([p, q]): [number, number][] =>
    b <= p || a >= q
      ? [[p, q]]
      : (
          [
            [p, a],
            [b, q],
          ] as [number, number][]
        ).filter(([u, v]) => v - u > min),
  );
}

/** Gable-end outline (z, y) of a segment including the gutter notches. */
function endProfile(roof: Roof, seg: RoofSegment): [number, number][] {
  const [zN, zS] = roof.eaveZ;
  const { width: gw, lip, depth } = roof.gutter;
  const zA = zN + seg.innerZ;
  const zB = zS - seg.innerZ;
  const e = roof.eaveY;
  return [
    [zN, seg.innerY],
    [zN, e],
    [zN + lip, e],
    [zN + lip, e - depth],
    [zN + gw, e - depth],
    [zN + gw, roofTopY(roof, zN + gw)],
    [roof.ridgeZ, roofTopY(roof, roof.ridgeZ)],
    [zS - gw, roofTopY(roof, zS - gw)],
    [zS - gw, e - depth],
    [zS - lip, e - depth],
    [zS - lip, e],
    [zS, e],
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
  const F = frames(roof);
  const { width: gw, lip, depth } = roof.gutter;
  const e = roof.eaveY;
  const top = (x: number, z: number): V3 => [x, roofTopY(roof, z), z];
  const segs = roof.segments;

  segs.forEach((seg, i) => {
    const [x0, x1] = seg.x;
    const zA = zN + seg.innerZ;
    const zB = zS - seg.innerZ;
    const under = (x: number, z: number): V3 => [x, roofUndersideY(roof, seg, z), z];
    for (const side of ['n', 's'] as const) {
      const f = F[side];
      const ws = segWindows(roof, seg, side);
      // Outer sheet from the gutter's back edge to the ridge, with window openings.
      const zt: [number, number] = side === 'n' ? [zN + gw, zR] : [zR, zS - gw];
      const holes = ws.map((w) => rect(w.x, w.z));
      mesh.polygon(seg.topMaterial, rect([x0, x1], zt), holes, top, f.n);
      // Sloped underside (ceiling), openings shifted perpendicular to the roof.
      const zu: [number, number] = side === 'n' ? [zA, zR] : [zR, zB];
      const underHoles = ws.map((w) => rect(w.x, undersideWindowZ(roof, seg, w)));
      mesh.polygon(seg.underMaterial, rect([x0, x1], zu), underHoles, under, neg(f.n));
      for (const w of ws) buildRoofWindow(mesh, roof, seg, w, f);
      if (seg.underMaterial === 'ceilingWood') buildBoards(mesh, roof, seg, f, ws);
      // Recessed hidden gutter ("jgheab ascuns"): lip, floor, back wall; eave fascia.
      const sgn = side === 'n' ? 1 : -1;
      const ze = side === 'n' ? zN : zS;
      const out: V3 = [0, 0, -sgn];
      const zl = ze + sgn * lip;
      const zg = ze + sgn * gw;
      const yb = e - depth;
      const yg = roofTopY(roof, zg);
      const q = (a: V3, b: V3, c: V3, d: V3, n: V3, m: MaterialId = 'roofMetal'): void =>
        mesh.quad(m, a, b, c, d, n);
      q([x0, e, ze], [x1, e, ze], [x1, e, zl], [x0, e, zl], [0, 1, 0]);
      q([x0, yb, zl], [x1, yb, zl], [x1, e, zl], [x0, e, zl], [0, 0, sgn]);
      q([x0, yb, zl], [x1, yb, zl], [x1, yb, zg], [x0, yb, zg], [0, 1, 0]);
      q([x0, yb, zg], [x1, yb, zg], [x1, yg, zg], [x0, yg, zg], out);
      q([x0, seg.innerY, ze], [x1, seg.innerY, ze], [x1, e, ze], [x0, e, ze], out, seg.endMaterial);
    }
    // End faces: at the building ends, and where this segment is deeper (lower
    // underside) than its neighbour — e.g. the loggia frame above the curtain wall.
    const prev = segs[i - 1];
    const next = segs[i + 1];
    const deeperThan = (other: RoofSegment | undefined): boolean =>
      !other || roofUndersideY(roof, seg, zR) < roofUndersideY(roof, other, zR) - 1e-6;
    const ring = endProfile(roof, seg);
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

  const xMin = segs[0]!.x[0];
  const xMax = segs[segs.length - 1]!.x[1];
  // Ridge cap.
  mesh.box('roofMetal', [xMin - 0.01, yR - 0.02, zR - 0.08], [xMax + 0.01, yR + 0.04, zR + 0.08], {
    bottom: null,
  });
  buildSeams(mesh, roof, F, xMin, xMax);
  buildSnowGuards(mesh, roof, F);
}

/** Frame + glass on the sheet, reveal lining through the build-up, inner sash. */
function buildRoofWindow(
  mesh: MeshBuilder,
  roof: Roof,
  seg: RoofSegment,
  w: RoofWindow,
  f: SlopeFrame,
): void {
  const T = roofThickness(roof, seg);
  const cos = Math.cos(rad(roof.pitchDeg));
  const zLow = f.side === 'n' ? w.z[0] : w.z[1];
  const origin: V3 = [w.x[0], roofTopY(roof, zLow), zLow];
  const W = w.x[1] - w.x[0];
  const Ls = (w.z[1] - w.z[0]) / cos;
  const ux: V3 = [1, 0, 0];
  const L = (u: number, v: number, n: number): V3 => add(add(add(origin, ux, u), f.up, v), f.n, n);
  const box = (
    mat: MaterialId,
    u: readonly [number, number],
    v: readonly [number, number],
    n: readonly [number, number],
  ): void =>
    mesh.orientedBox(
      mat,
      L((u[0] + u[1]) / 2, (v[0] + v[1]) / 2, (n[0] + n[1]) / 2),
      ux,
      f.up,
      f.n,
      [(u[1] - u[0]) / 2, (v[1] - v[0]) / 2, (n[1] - n[0]) / 2],
    );
  const ring = (mat: MaterialId, fw: number, n: readonly [number, number]): void => {
    box(mat, [0, W], [0, fw], n);
    box(mat, [0, W], [Ls - fw, Ls], n);
    box(mat, [0, fw], [fw, Ls - fw], n);
    box(mat, [W - fw, W], [fw, Ls - fw], n);
  };
  // Outer frame (dark aluminium cladding), 7 cm wide, 6 cm proud of the sheet.
  const fw = 0.07;
  ring('metalBlack', fw, [0, 0.06]);
  mesh.quad(
    'glass',
    L(fw, fw, 0.045),
    L(W - fw, fw, 0.045),
    L(W - fw, Ls - fw, 0.045),
    L(fw, Ls - fw, 0.045),
    f.n,
  );
  // Reveal lining (perpendicular to the roof), facing into the opening.
  const lining: MaterialId = seg.underMaterial === 'ceilingWood' ? 'ceilingWood' : 'plaster';
  const c = L(W / 2, Ls / 2, -T / 2);
  const edge = (a: readonly [number, number], b: readonly [number, number]): void => {
    const pa = L(a[0], a[1], 0);
    const pb = L(b[0], b[1], 0);
    const pc = L(b[0], b[1], -T);
    const facing: V3 = [
      c[0] - (pa[0] + pc[0]) / 2,
      c[1] - (pa[1] + pc[1]) / 2,
      c[2] - (pa[2] + pc[2]) / 2,
    ];
    mesh.quad(lining, pa, pb, pc, L(a[0], a[1], -T), facing);
  };
  edge([0, 0], [W, 0]);
  edge([W, 0], [W, Ls]);
  edge([W, Ls], [0, Ls]);
  edge([0, Ls], [0, 0]);
  // Inner sash (wood, RAL 1011 like the other frames) seen from the room.
  ring('frame', 0.06, [-0.12, -0.01]);
}

/** Wood-board ceiling (15 cm boards, 1 cm joints) under a wood-lined segment. */
function buildBoards(
  mesh: MeshBuilder,
  roof: Roof,
  seg: RoofSegment,
  f: SlopeFrame,
  ws: readonly RoofWindow[],
): void {
  const [zN, zS] = roof.eaveZ;
  const cos = Math.cos(rad(roof.pitchDeg));
  const zLow = f.side === 'n' ? zN + seg.innerZ : zS - seg.innerZ;
  const Ls = Math.abs(roof.ridgeZ - zLow) / cos;
  const y0 = roofUndersideY(roof, seg, zLow);
  const d = neg(f.n);
  const P = (x: number, v: number, t: number): V3 => add(add([x, y0, zLow], f.up, v), d, t);
  const pitch = 0.16;
  const bw = 0.15;
  const bt = 0.015;
  const holes = ws.map((w) => {
    const [za, zb] = undersideWindowZ(roof, seg, w);
    const va = Math.abs(za - zLow) / cos;
    const vb = Math.abs(zb - zLow) / cos;
    return { x: w.x, v: [Math.min(va, vb) - 0.005, Math.max(va, vb) + 0.005] as const };
  });
  for (let v0 = 0.005; v0 < Ls - 0.02; v0 += pitch) {
    const v1 = Math.min(v0 + bw, Ls);
    let spans: [number, number][] = [[seg.x[0], seg.x[1]]];
    for (const h of holes) {
      if (v1 > h.v[0] && v0 < h.v[1]) spans = cutSpans(spans, h.x[0], h.x[1], 0.01);
    }
    for (const [a, b] of spans) {
      mesh.quad('ceilingWood', P(a, v0, bt), P(b, v0, bt), P(b, v1, bt), P(a, v1, bt), d);
      mesh.quad('ceilingWood', P(a, v0, 0), P(b, v0, 0), P(b, v0, bt), P(a, v0, bt), neg(f.up));
      mesh.quad('ceilingWood', P(a, v1, 0), P(b, v1, 0), P(b, v1, bt), P(a, v1, bt), f.up);
    }
  }
}

/** Standing seams every 50 cm, interrupted by roof windows and the chimney. */
function buildSeams(
  mesh: MeshBuilder,
  roof: Roof,
  F: Record<Side, SlopeFrame>,
  xMin: number,
  xMax: number,
): void {
  const { x0, spacing, width, height } = roof.seams;
  const [zN, zS] = roof.eaveZ;
  const cos = Math.cos(rad(roof.pitchDeg));
  const gw = roof.gutter.width;
  const ch = roof.chimney;
  for (let x = x0; x < xMax - 0.05; x += spacing) {
    if (x < xMin + 0.05) continue;
    for (const side of ['n', 's'] as const) {
      const f = F[side];
      let spans: [number, number][] = [
        side === 'n' ? [zN + gw, roof.ridgeZ] : [roof.ridgeZ, zS - gw],
      ];
      for (const w of roof.windows) {
        if (windowSide(roof, w) !== side || x < w.x[0] - 0.03 || x > w.x[1] + 0.03) continue;
        spans = cutSpans(spans, w.z[0] - 0.02, w.z[1] + 0.02, 0.05);
      }
      if (Math.abs(x - ch.center[0]) < ch.radius + 0.05) {
        spans = cutSpans(
          spans,
          ch.center[1] - ch.radius - 0.05,
          ch.center[1] + ch.radius + 0.05,
          0.05,
        );
      }
      for (const [a, b] of spans) {
        const zm = (a + b) / 2;
        const len = (b - a) / cos;
        const c = add([x, roofTopY(roof, zm), zm], f.n, height / 2);
        mesh.orientedBox('roofMetal', c, [1, 0, 0], f.up, f.n, [width / 2, len / 2, height / 2]);
      }
    }
  }
}

/** Two tubes on brackets (every second seam), parallel to the eaves. */
function buildSnowGuards(mesh: MeshBuilder, roof: Roof, F: Record<Side, SlopeFrame>): void {
  const { inset, x, tubes } = roof.snowGuards;
  const [zN, zS] = roof.eaveZ;
  const { x0, spacing } = roof.seams;
  for (const side of ['n', 's'] as const) {
    const f = F[side];
    const z = side === 'n' ? zN + inset : zS - inset;
    const base: V3 = [0, roofTopY(roof, z), z];
    for (let t = 0; t < tubes; t++) {
      const v = (t - (tubes - 1) / 2) * 0.065;
      const c = add(add(base, f.up, v), f.n, 0.07);
      mesh.orientedBox('metalBlack', [(x[0] + x[1]) / 2, c[1], c[2]], [1, 0, 0], f.up, f.n, [
        (x[1] - x[0]) / 2,
        0.014,
        0.014,
      ]);
    }
    for (let bx = x0 + spacing; bx < x[1]; bx += 2 * spacing) {
      if (bx < x[0]) continue;
      const c = add([bx, base[1], base[2]], f.n, 0.04);
      mesh.orientedBox('metalBlack', c, [1, 0, 0], f.up, f.n, [0.01, 0.07, 0.04]);
    }
  }
}

export function buildChimney(mesh: MeshBuilder, roof: Roof): void {
  const { center, radius, top } = roof.chimney;
  const [cx, cz] = center;
  mesh.cylinder('metalBlack', cx, cz, radius, 0, top, 12);
  // Collar at the roof sheet and a rain cap on three short legs.
  const yRoof = roofTopY(roof, cz);
  mesh.cylinder('metalBlack', cx, cz, radius + 0.03, yRoof - 0.05, yRoof + 0.12, 12);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const px = cx + Math.cos(a) * (radius - 0.01);
    const pz = cz + Math.sin(a) * (radius - 0.01);
    mesh.box('metalBlack', [px - 0.008, top, pz - 0.008], [px + 0.008, top + 0.02, pz + 0.008], {
      bottom: null,
      skipTop: true,
    });
  }
  mesh.cylinder('metalBlack', cx, cz, radius + 0.07, top + 0.02, top + 0.045, 12);
}
