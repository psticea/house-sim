/**
 * Openings v1: window frames + glass, door linings + leaves (open 90° as drawn on the
 * plan), lift-and-slide door with the moving panel parked behind the fixed one.
 */
import type { MaterialId, Opening } from '../data/schema';
import type { MeshBuilder, V3 } from './meshBuilder';
import type { WallSpace } from './wallSpace';

const PROFILE = 0.06;
const FRAME_DEPTH = 0.07;
const LEAF_T = 0.04;
const UP: V3 = [0, 1, 0];

const add = (a: V3, b: V3, s = 1): V3 => [a[0] + b[0] * s, a[1] + b[1] * s, a[2] + b[2] * s];

/**
 * Framed glass panel in an arbitrary vertical plane: origin = bottom-left corner on the
 * panel's centre plane, `ua` = horizontal axis along the panel, `wa` = normal.
 */
export function framedPanel(
  mesh: MeshBuilder,
  origin: V3,
  ua: V3,
  wa: V3,
  width: number,
  height: number,
  opts: {
    frame: MaterialId;
    profile?: number;
    depth?: number;
    bottom?: boolean;
    mullion?: boolean;
  },
): void {
  const p = opts.profile ?? PROFILE;
  const d = opts.depth ?? FRAME_DEPTH;
  const at = (u: number, v: number): V3 => add(add(origin, ua, u), UP, v);
  const bar = (u0: number, u1: number, v0: number, v1: number): void =>
    mesh.orientedBox(opts.frame, at((u0 + u1) / 2, (v0 + v1) / 2), ua, UP, wa, [
      (u1 - u0) / 2,
      (v1 - v0) / 2,
      d / 2,
    ]);
  const bottom = opts.bottom ?? true;
  const vb = bottom ? p : 0;
  bar(0, p, 0, height);
  bar(width - p, width, 0, height);
  bar(p, width - p, height - p, height);
  if (bottom) bar(p, width - p, 0, p);
  const panes: [number, number][] = [];
  if (opts.mullion) {
    const m = width / 2;
    bar(m - p / 2, m + p / 2, vb, height - p);
    panes.push([p, m - p / 2], [m + p / 2, width - p]);
  } else {
    panes.push([p, width - p]);
  }
  for (const [u0, u1] of panes) {
    mesh.quad('glass', at(u0, vb), at(u1, vb), at(u1, height - p), at(u0, height - p), wa);
  }
}

/** Depth (w) at which frames sit: the insulation plane for exterior walls. */
function framePlane(ws: WallSpace): { w: number; inward: number } {
  if (ws.outside === null) return { w: 0, inward: 0 };
  // Inside is the side opposite to the cladding.
  const inward = ws.outside === 'left' ? -1 : 1;
  return { w: ws.interfaceW + (inward * FRAME_DEPTH) / 2, inward };
}

export function buildOpening(
  mesh: MeshBuilder,
  collider: MeshBuilder,
  ws: WallSpace,
  o: Opening,
): void {
  const { w } = framePlane(ws);
  const o0 = o.offset;
  const s = o.sill;
  const h = o.height;
  switch (o.kind) {
    case 'window':
      framedPanel(mesh, ws.p(o0, s, w), ws.ax, ws.aw, o.width, h, {
        frame: 'frame',
        mullion: o.width >= 1.9,
      });
      break;
    case 'sliding': {
      const half = o.width / 2 + PROFILE / 2;
      framedPanel(mesh, ws.p(o0 + o.width - half, s, w), ws.ax, ws.aw, half, h, {
        frame: 'frame',
      });
      // Moving panel parked in front of the fixed one on the inner track.
      const { inward } = framePlane(ws);
      framedPanel(
        mesh,
        ws.p(o0 + o.width - half - 0.02, s, w + inward * 0.075),
        ws.ax,
        ws.aw,
        half,
        h,
        {
          frame: 'frame',
        },
      );
      break;
    }
    case 'door':
      buildDoor(mesh, collider, ws, o);
      break;
    case 'passage':
      break;
  }
}

function buildDoor(mesh: MeshBuilder, collider: MeshBuilder, ws: WallSpace, o: Opening): void {
  const o0 = o.offset;
  const o1 = o.offset + o.width;
  const h = o.height;
  const exterior = ws.outside !== null;
  const liningMat: MaterialId = o.leaf?.material === 'frame' ? 'frame' : 'doorLeaf';
  // Lining / frame: jambs and head. Interior doors: full wall depth (+1 cm casing).
  const depth = exterior ? 0.1 : ws.thickness + 0.02;
  const wc = exterior ? framePlane(ws).w : 0;
  const jamb = 0.05;
  const bar = (u0: number, u1: number, v0: number, v1: number): void =>
    mesh.orientedBox(liningMat, ws.p((u0 + u1) / 2, (v0 + v1) / 2, wc), ws.ax, UP, ws.aw, [
      (u1 - u0) / 2,
      (v1 - v0) / 2,
      depth / 2,
    ]);
  if (ws.wall.kind !== 'curtain') {
    bar(o0, o0 + jamb, 0, h);
    bar(o1 - jamb, o1, 0, h);
    bar(o0 + jamb, o1 - jamb, h - jamb, h);
  }
  const leaf = o.leaf;
  if (!leaf) return;
  const lw = o.width - 2 * jamb;
  const lh = h - jamb - 0.01;
  const theta = (leaf.openAngle * Math.PI) / 180;
  const sSide = leaf.swing === 'left' ? 1 : -1;
  const closedDir = leaf.hinge === 'start' ? 1 : -1; // along u
  const uh = leaf.hinge === 'start' ? o0 + jamb : o1 - jamb;
  const wh = sSide * (ws.thickness / 2);
  // Leaf direction and its thickness direction, in local (u, w).
  const ld: [number, number] = [closedDir * Math.cos(theta), sSide * Math.sin(theta)];
  const pd: [number, number] = [closedDir * Math.sin(theta), -sSide * Math.cos(theta)];
  const ax = ws.dirOf(ld[0], ld[1]);
  const az = ws.dirOf(pd[0], pd[1]);
  const hinge = ws.p(uh, 0.01, wh);
  const center = add(add(add(hinge, ax, lw / 2), az, LEAF_T / 2), UP, lh / 2);
  if (leaf.glazed) {
    const origin = add(add(hinge, az, LEAF_T / 2), UP, 0);
    framedPanel(mesh, origin, ax, az, lw, lh, {
      frame: leaf.material,
      profile: 0.08,
      depth: LEAF_T,
    });
  } else {
    mesh.orientedBox(leaf.material, center, ax, UP, az, [lw / 2, lh / 2, LEAF_T / 2]);
  }
  collider.orientedBox('concrete', center, ax, UP, az, [lw / 2, lh / 2, LEAF_T / 2]);
}
