/**
 * Site builder (I3): terrain, draped paving, fence & gates, vegetation, garden features,
 * neighbour massing and the garden colliders — all merged per material like the house.
 */
import {
  BENCH,
  BIN_CORNER,
  EDGING,
  FIRE_PIT,
  GRAVEL,
  HOUSE_NUMBER,
  MANHOLE,
  MEADOWS,
  NEIGHBOURS,
  PLANTERS,
  PLANTING_BEDS,
  RAISED_BEDS,
  SHRUBS,
  STEPPING_STONES,
  STOOLS,
  STOOL_R,
  SWING,
  TREES,
  fencePerimeter,
  gardenObstacles,
  swingParts,
  type FenceKind,
  type Gate,
  type Obstacle,
} from '../data/garden';
import { SHELL } from '../data/grid';
import type { HouseModel, MaterialId, Polygon, Vec2 } from '../data/schema';
import { FIELD_Y, terrainHeight } from '../data/terrain';
import type { MeshBuilder, V3 } from './meshBuilder';
import { buildPatch } from './slabs';
import { buildTerrain, drape, edgingStrip } from './terrain';
import { blob, buildOlive, buildShrub, buildTree, meadow, tube, tuft } from './vegetation';
import { rng } from '../data/clip';

const UP: V3 = [0, 1, 0];
const H = terrainHeight;

const circle = (x: number, z: number, r: number, n: number): Vec2[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [x + Math.cos(a) * r, z + Math.sin(a) * r] as Vec2;
  });

/** Plan frame of a line a → b: unit direction, inward normal (lot interior), length. */
function frame(a: Vec2, b: Vec2): { u: V3; n: V3; L: number } {
  const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
  const ux = (b[0] - a[0]) / L;
  const uz = (b[1] - a[1]) / L;
  // The lot is listed with a positive (x, z) area: its interior is on the left.
  return { u: [ux, 0, uz], n: [-uz, 0, ux], L };
}

const at = (a: Vec2, f: { u: V3; n: V3 }, t: number, off: number, y: number): V3 => [
  a[0] + f.u[0] * t + f.n[0] * off,
  y,
  a[1] + f.u[2] * t + f.n[2] * off,
];

/** Box in a line frame: along u from t0 to t1, across n from o0 to o1, y0…y1. */
function frameBox(
  mesh: MeshBuilder,
  id: MaterialId,
  a: Vec2,
  f: { u: V3; n: V3 },
  t0: number,
  t1: number,
  o0: number,
  o1: number,
  y0: number,
  y1: number,
): void {
  mesh.orientedBox(id, at(a, f, (t0 + t1) / 2, (o0 + o1) / 2, (y0 + y1) / 2), f.u, UP, f.n, [
    (t1 - t0) / 2,
    (y1 - y0) / 2,
    (o1 - o0) / 2,
  ]);
}

const POST = 0.06;
const GATE_POST = 0.08;

function fenceBay(
  mesh: MeshBuilder,
  a: Vec2,
  b: Vec2,
  kind: FenceKind,
  height: number,
  postA: number,
  postB: number,
): void {
  const f = frame(a, b);
  const mid: Vec2 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const base = Math.min(H(...a), H(...mid), H(...b));
  const t0 = postA / 2;
  const t1 = f.L - postB / 2;
  const clear = t1 - t0;
  if (kind === 'privacy') {
    const gap = 0.016;
    const count = Math.max(1, Math.round((clear + gap) / (0.14 + gap)));
    const pitch = (clear + gap) / count;
    for (let k = 0; k < count; k++) {
      const s = t0 + k * pitch;
      frameBox(mesh, 'timber', a, f, s, s + pitch - gap, -0.011, 0.011, base + 0.05, base + height);
    }
    // Two rails on the neighbour's side.
    for (const y of [base + 0.3, base + height - 0.28]) {
      frameBox(mesh, 'timber', a, f, t0, t1, -0.0565, -0.011, y - 0.035, y + 0.035);
    }
  } else {
    for (let k = 0; k < 10; k++) {
      const y = base + 0.08 + k * 0.11;
      frameBox(mesh, 'timber', a, f, t0, t1, -0.011, 0.011, y, y + 0.09);
    }
  }
}

function post(mesh: MeshBuilder, p: Vec2, dir: { u: V3; n: V3 }, size: number, top: number): void {
  const y0 = H(...p);
  mesh.orientedBox('metalBlack', [p[0], (y0 - 0.25 + y0 + top) / 2, p[1]], dir.u, UP, dir.n, [
    size / 2,
    (top + 0.25) / 2,
    size / 2,
  ]);
}

/** Timber-slat panel in a steel frame (gate leaf), in a line frame. */
function slatPanel(
  mesh: MeshBuilder,
  a: Vec2,
  f: { u: V3; n: V3 },
  t0: number,
  t1: number,
  off: number,
  y0: number,
  y1: number,
): void {
  const bar = 0.04;
  const o0 = off - 0.02;
  const o1 = off + 0.02;
  frameBox(mesh, 'metalBlack', a, f, t0, t1, o0, o1, y0, y0 + bar);
  frameBox(mesh, 'metalBlack', a, f, t0, t1, o0, o1, y1 - bar, y1);
  frameBox(mesh, 'metalBlack', a, f, t0, t0 + bar, o0, o1, y0 + bar, y1 - bar);
  frameBox(mesh, 'metalBlack', a, f, t1 - bar, t1, o0, o1, y0 + bar, y1 - bar);
  const n = Math.max(1, Math.floor((y1 - y0 - 2 * bar + 0.02) / 0.11));
  const pitch = (y1 - y0 - 2 * bar + 0.02) / n;
  for (let k = 0; k < n; k++) {
    const y = y0 + bar + k * pitch;
    frameBox(
      mesh,
      'timber',
      a,
      f,
      t0 + bar,
      t1 - bar,
      off - 0.011,
      off + 0.011,
      y,
      y + pitch - 0.02,
    );
  }
}

/** Seven-segment digits (house number) on a plate facing `out`. */
function digits(mesh: MeshBuilder, text: string, c: V3, right: V3, out: V3, h: number): void {
  const SEG: Record<string, string> = {
    '0': 'abcdef',
    '1': 'bc',
    '2': 'abged',
    '3': 'abgcd',
    '4': 'fgbc',
    '5': 'afgcd',
    '6': 'afgedc',
    '7': 'abc',
    '8': 'abcdefg',
    '9': 'abcdfg',
  };
  const w = h * 0.55;
  const s = h * 0.13;
  const adv = w + h * 0.3;
  const x0 = -((text.length - 1) * adv) / 2;
  Array.from(text, (ch) => ch).forEach((ch, i) => {
    const cx = x0 + i * adv;
    const seg: Record<string, [number, number, number, number]> = {
      a: [cx, h / 2, w / 2, s / 2],
      g: [cx, 0, w / 2, s / 2],
      d: [cx, -h / 2, w / 2, s / 2],
      f: [cx - w / 2, h / 4, s / 2, h / 4],
      b: [cx + w / 2, h / 4, s / 2, h / 4],
      e: [cx - w / 2, -h / 4, s / 2, h / 4],
      c: [cx + w / 2, -h / 4, s / 2, h / 4],
    };
    for (const k of SEG[ch] ?? '') {
      const [sx, sy, hx, hy] = seg[k]!;
      mesh.orientedBox(
        'metalBlack',
        [c[0] + right[0] * sx + out[0] * 0.004, c[1] + sy, c[2] + right[2] * sx + out[2] * 0.004],
        right,
        UP,
        out,
        [hx, hy, 0.004],
      );
    }
  });
}

function buildGates(mesh: MeshBuilder, g: Gate): void {
  const f = frame(g.a, g.b);
  const base = Math.min(H(...g.a), H(...g.b));
  const t0 = GATE_POST / 2 + 0.01;
  const t1 = f.L - GATE_POST / 2 - 0.01;
  if (g.kind === 'car') {
    // Sliding gate (closed), just inside the posts, on a track that runs back behind
    // the street fence.
    slatPanel(mesh, g.a, f, t0 - 0.03, t1 + 0.03, 0.075, base + 0.06, base + g.height);
    frameBox(mesh, 'metalBlack', g.a, f, -2.9, t1 + 0.05, 0.05, 0.1, base - 0.02, base + 0.03);
    return;
  }
  // Pedestrian gate, open 90° into the lot around its hinge.
  const hingeT = g.hinge === 'b' ? f.L - GATE_POST / 2 - 0.035 : GATE_POST / 2 + 0.035;
  const hinge = at(g.a, f, hingeT, 0, 0);
  const leafF = { u: f.n, n: g.hinge === 'b' ? f.u : ([-f.u[0], 0, -f.u[2]] as V3) };
  const w = f.L - 2 * GATE_POST - 0.03;
  slatPanel(
    mesh,
    [hinge[0], hinge[2]],
    leafF,
    0.02,
    0.02 + w,
    0,
    base + 0.06,
    base + g.height - 0.02,
  );
  // Bronze-toned letterbox and number plate on the street face of the post between the gates.
  const p = g.hinge === 'b' ? g.a : g.b;
  const out: V3 = [-f.n[0], 0, -f.n[2]];
  const y0 = H(...p);
  const face = GATE_POST / 2;
  mesh.orientedBox(
    'frame',
    [p[0] + out[0] * (face + 0.055), y0 + 0.93, p[1] + out[2] * (face + 0.055)],
    f.u,
    UP,
    out,
    [0.16, 0.13, 0.055],
  );
  const plate: V3 = [p[0] + out[0] * (face + 0.004), y0 + 1.14, p[1] + out[2] * (face + 0.004)];
  mesh.orientedBox('frame', plate, f.u, UP, out, [0.07, 0.055, 0.004]);
  const right: V3 = [-f.u[0], 0, -f.u[2]]; // reads left → right from the street
  digits(
    mesh,
    HOUSE_NUMBER,
    [plate[0] + out[0] * 0.004, plate[1], plate[2] + out[2] * 0.004],
    right,
    out,
    0.06,
  );
}

function buildFence(mesh: MeshBuilder): void {
  const segs = fencePerimeter();
  segs.forEach((s, i) => {
    const prev = segs[(i - 1 + segs.length) % segs.length]!;
    const gateAdj = s.kind === 'gate' || prev.kind === 'gate';
    const f = frame(s.a, s.b);
    const hPrev = prev.kind === 'run' ? prev.run.height : prev.gate.height;
    const hCur = s.kind === 'run' ? s.run.height : s.gate.height;
    // Corner / joint post at the start of every segment.
    const size = gateAdj ? GATE_POST : POST;
    post(mesh, s.a, f, size, Math.max(hPrev, hCur) + 0.03);
    if (s.kind === 'gate') {
      buildGates(mesh, s.gate);
      return;
    }
    const next = segs[(i + 1) % segs.length]!;
    const endPost = next.kind === 'gate' ? GATE_POST : POST;
    const bays = Math.max(1, Math.ceil(f.L / 2.0));
    for (let k = 0; k < bays; k++) {
      const a: Vec2 = [
        s.a[0] + ((s.b[0] - s.a[0]) * k) / bays,
        s.a[1] + ((s.b[1] - s.a[1]) * k) / bays,
      ];
      const b: Vec2 = [
        s.a[0] + ((s.b[0] - s.a[0]) * (k + 1)) / bays,
        s.a[1] + ((s.b[1] - s.a[1]) * (k + 1)) / bays,
      ];
      if (k > 0) post(mesh, a, f, POST, s.run.height + 0.03);
      fenceBay(
        mesh,
        a,
        b,
        s.run.kind,
        s.run.height,
        k === 0 ? size : POST,
        k === bays - 1 ? endPost : POST,
      );
    }
  });
}

function colliderFor(collider: MeshBuilder, o: Obstacle): void {
  if (o.kind === 'segment') {
    const f = frame(o.a, o.b);
    collider.orientedBox(
      'concrete',
      [(o.a[0] + o.b[0]) / 2, 0.8, (o.a[1] + o.b[1]) / 2],
      f.u,
      UP,
      f.n,
      [f.L / 2 + o.halfWidth, 1.3, o.halfWidth],
    );
  } else if (o.kind === 'circle') {
    collider.cylinder('concrete', o.x, o.z, o.r, H(o.x, o.z) - 0.3, H(o.x, o.z) + 2.0, 10);
  } else {
    const y = H((o.min[0] + o.max[0]) / 2, (o.min[1] + o.max[1]) / 2);
    collider.box('concrete', [o.min[0], y - 0.3, o.min[1]], [o.max[0], y + 1.2, o.max[1]]);
  }
}

function buildBeds(mesh: MeshBuilder): void {
  const rand = rng(77);
  for (const b of RAISED_BEDS) {
    const y = H((b.min[0] + b.max[0]) / 2, (b.min[1] + b.max[1]) / 2);
    const t = 0.045;
    const [x0, z0] = b.min;
    const [x1, z1] = b.max;
    const top = y + b.height;
    mesh.box('timber', [x0, y - 0.05, z0], [x1, top, z0 + t], { bottom: null });
    mesh.box('timber', [x0, y - 0.05, z1 - t], [x1, top, z1], { bottom: null });
    mesh.box('timber', [x0, y - 0.05, z0 + t], [x0 + t, top, z1 - t], { bottom: null });
    mesh.box('timber', [x1 - t, y - 0.05, z0 + t], [x1, top, z1 - t], { bottom: null });
    const soil = top - 0.05;
    mesh.quad(
      'soil',
      [x0 + t, soil, z0 + t],
      [x1 - t, soil, z0 + t],
      [x1 - t, soil, z1 - t],
      [x0 + t, soil, z1 - t],
      UP,
    );
    // Rows of vegetables (lettuce / cabbage heads, a row of herbs).
    const rows = 3;
    const perRow = 5;
    for (let r = 0; r < rows; r++) {
      for (let k = 0; k < perRow; k++) {
        const px = x0 + 0.25 + ((x1 - x0 - 0.5) * k) / (perRow - 1);
        const pz = z0 + 0.25 + ((z1 - z0 - 0.5) * r) / (rows - 1);
        const s = 0.12 + rand() * 0.05;
        blob(
          mesh.bucket(r === 1 ? 'foliageLight' : 'foliage'),
          [px, soil + s * 0.25, pz],
          [s, s * 0.7, s],
          r * 10 + k,
          {
            flatBottom: 0.5,
          },
        );
      }
    }
  }
}

function buildSwing(mesh: MeshBuilder): void {
  const { x, z, span, height } = SWING;
  const y0 = H(x, z);
  const top = y0 + height;
  const { legs, seat } = swingParts();
  for (const [a, b] of legs) {
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz, height + 0.1);
    const ay: V3 = [dx / len, -(height + 0.1) / len, dz / len];
    const c: V3 = [(a[0] + b[0]) / 2, (top + y0 - 0.1) / 2, (a[1] + b[1]) / 2];
    // Leg axis from the beam end down to its foot; cross axis along x.
    const ax: V3 = [1, 0, 0];
    const az: V3 = [
      ay[1] * ax[2] - ay[2] * ax[1],
      ay[2] * ax[0] - ay[0] * ax[2],
      ay[0] * ax[1] - ay[1] * ax[0],
    ];
    mesh.orientedBox('timber', c, ax, ay, az, [0.045, len / 2, 0.045]);
  }
  mesh.box(
    'timber',
    [x - span / 2 - 0.12, top, z - 0.06],
    [x + span / 2 + 0.12, top + 0.14, z + 0.06],
  );
  const seatY = y0 + 0.44;
  mesh.box('timber', [seat.min[0], seatY, seat.min[1]], [seat.max[0], seatY + 0.04, seat.max[1]]);
  for (const sx of [seat.min[0] + 0.03, seat.max[0] - 0.03]) {
    mesh.box('metalBlack', [sx - 0.006, seatY + 0.04, z - 0.006], [sx + 0.006, top, z + 0.006], {
      bottom: null,
    });
  }
}

function buildFirePit(mesh: MeshBuilder): void {
  const { x, z, r, height, gravelR } = FIRE_PIT;
  drape(mesh, null, 'gravel', circle(x, z, gravelR, 20), 0.025);
  const y0 = H(x, z) + 0.02;
  const seg = 16;
  const bowl = mesh.bucket('corten');
  const ring = (rr: number, y: number, i: number): V3 => {
    const a = (i / seg) * Math.PI * 2;
    return [x + Math.cos(a) * rr, y, z + Math.sin(a) * rr];
  };
  const inner = r - 0.03;
  for (let i = 0; i < seg; i++) {
    const am = ((i + 0.5) / seg) * Math.PI * 2;
    const out: V3 = [Math.cos(am), 0, Math.sin(am)];
    // Outer wall slightly tapered toward the base, rim, inner wall.
    bowl.quad(
      ring(r * 0.88, y0, i),
      ring(r * 0.88, y0, i + 1),
      ring(r, y0 + height, i + 1),
      ring(r, y0 + height, i),
      out,
    );
    bowl.quad(
      ring(inner, y0 + height, i),
      ring(r, y0 + height, i),
      ring(r, y0 + height, i + 1),
      ring(inner, y0 + height, i + 1),
      UP,
    );
    bowl.quad(
      ring(inner, y0 + 0.12, i),
      ring(inner, y0 + 0.12, i + 1),
      ring(inner, y0 + height, i + 1),
      ring(inner, y0 + height, i),
      [-out[0], 0, -out[2]],
    );
    mesh.tri(
      'soil',
      [x, y0 + 0.12, z],
      ring(inner, y0 + 0.12, i),
      ring(inner, y0 + 0.12, i + 1),
      UP,
    );
  }
  // Split logs laid across the bowl.
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI + 0.3;
    const h = y0 + 0.18 + k * 0.05;
    tube(
      mesh.bucket('bark'),
      [x - Math.cos(a) * 0.3, h, z - Math.sin(a) * 0.3],
      [x + Math.cos(a) * 0.3, h, z + Math.sin(a) * 0.3],
      0.045,
      0.04,
    );
  }
  // Bench: oiled timber seat on two stone blocks, facing the fire and the house.
  const by = H((BENCH.min[0] + BENCH.max[0]) / 2, (BENCH.min[1] + BENCH.max[1]) / 2);
  for (const bz of [BENCH.min[1] + 0.15, BENCH.max[1] - 0.55]) {
    mesh.box(
      'stone',
      [BENCH.min[0] + 0.02, by - 0.05, bz],
      [BENCH.max[0] - 0.02, by + BENCH.seat - 0.06, bz + 0.4],
      {
        bottom: null,
      },
    );
  }
  mesh.box(
    'timber',
    [BENCH.min[0], by + BENCH.seat - 0.06, BENCH.min[1]],
    [BENCH.max[0], by + BENCH.seat, BENCH.max[1]],
  );
  // Log stools (bark sides, sawn tops).
  for (const [sx, sz] of STOOLS) {
    const sy = H(sx, sz);
    tube(mesh.bucket('bark'), [sx, sy - 0.05, sz], [sx, sy + 0.42, sz], STOOL_R, STOOL_R * 0.95);
    const n = 13;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2;
      const a1 = ((i + 1) / n) * Math.PI * 2;
      const rr = STOOL_R * 0.95;
      mesh.tri(
        'timber',
        [sx, sy + 0.42, sz],
        [sx + Math.cos(a0) * rr, sy + 0.42, sz + Math.sin(a0) * rr],
        [sx + Math.cos(a1) * rr, sy + 0.42, sz + Math.sin(a1) * rr],
        UP,
      );
    }
  }
}

function buildPlanter(mesh: MeshBuilder, p: (typeof PLANTERS)[number], i: number): void {
  const y0 = 0; // on the deck
  const h = p.r * 1.9;
  const seg = 16;
  const pot = mesh.bucket('clay');
  const ring = (rr: number, y: number, k: number): V3 => {
    const a = (k / seg) * Math.PI * 2;
    return [p.x + Math.cos(a) * rr, y, p.z + Math.sin(a) * rr];
  };
  const inner = p.r - 0.025;
  for (let k = 0; k < seg; k++) {
    const am = ((k + 0.5) / seg) * Math.PI * 2;
    const out: V3 = [Math.cos(am), 0, Math.sin(am)];
    pot.quad(
      ring(p.r * 0.7, y0, k),
      ring(p.r * 0.7, y0, k + 1),
      ring(p.r, y0 + h, k + 1),
      ring(p.r, y0 + h, k),
      out,
    );
    pot.quad(
      ring(inner, y0 + h, k),
      ring(p.r, y0 + h, k),
      ring(p.r, y0 + h, k + 1),
      ring(inner, y0 + h, k + 1),
      UP,
    );
    pot.quad(
      ring(inner, y0 + h - 0.05, k),
      ring(inner, y0 + h - 0.05, k + 1),
      ring(inner, y0 + h, k + 1),
      ring(inner, y0 + h, k),
      [-out[0], 0, -out[2]],
    );
    mesh.tri(
      'soil',
      [p.x, y0 + h - 0.05, p.z],
      ring(inner, y0 + h - 0.05, k),
      ring(inner, y0 + h - 0.05, k + 1),
      UP,
    );
  }
  const soil = y0 + h - 0.05;
  if (p.plant === 'olive') buildOlive(mesh, p.x, soil, p.z, 5 + i * 3);
  else {
    const rand = rng(91 + i);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      tuft(
        mesh,
        rand,
        p.x + Math.cos(a) * p.r * 0.45,
        soil,
        p.z + Math.sin(a) * p.r * 0.45,
        0.55,
        0,
      );
    }
    tuft(mesh, rand, p.x, soil, p.z, 0.7, 0);
  }
}

function buildBinCorner(mesh: MeshBuilder): void {
  const { min, max, height } = BIN_CORNER;
  const y = H((min[0] + max[0]) / 2, (min[1] + max[1]) / 2) + 0.04;
  const top = y + height;
  // Vertical slats on the north and east sides; open toward the path (west).
  for (let x = min[0] + 0.03; x <= max[0] - 0.06; x += 0.09) {
    mesh.box('timber', [x, y, min[1]], [x + 0.045, top, min[1] + 0.02]);
  }
  for (let z = min[1] + 0.09; z <= max[1] - 0.1; z += 0.09) {
    mesh.box('timber', [max[0] - 0.02, y, z], [max[0], top, z + 0.045]);
  }
  mesh.box('metalBlack', [min[0], y, min[1] - 0.02], [min[0] + 0.04, top + 0.02, min[1] + 0.02], {
    bottom: null,
  });
  mesh.box('metalBlack', [max[0] - 0.04, y, min[1] - 0.02], [max[0], top + 0.02, min[1] + 0.02], {
    bottom: null,
  });
  // Two wheelie bins.
  for (const bx of [min[0] + 0.3, min[0] + 0.98]) {
    mesh.box('metalBlack', [bx, y, min[1] + 0.1], [bx + 0.58, y + 1.0, min[1] + 0.8], {
      bottom: null,
    });
    mesh.box(
      'metalBlack',
      [bx - 0.02, y + 1.0, min[1] + 0.08],
      [bx + 0.6, y + 1.05, min[1] + 0.84],
    );
  }
}

function buildNeighbours(mesh: MeshBuilder): void {
  for (const n of NEIGHBOURS) {
    const [x0, z0] = n.min;
    const [x1, z1] = n.max;
    const y0 = FIELD_Y - 0.1;
    mesh.box('plasterExterior', [x0, y0, z0], [x1, n.eave, z1], { skipTop: true, bottom: null });
    const o = 0.45;
    if (n.ridge === 'x') {
      const zm = (z0 + z1) / 2;
      const e0: V3 = [x0 - o, n.eave - 0.25, z0 - o];
      const e1: V3 = [x1 + o, n.eave - 0.25, z0 - o];
      const r0: V3 = [x0 - o, n.ridgeY, zm];
      const r1: V3 = [x1 + o, n.ridgeY, zm];
      const s0: V3 = [x0 - o, n.eave - 0.25, z1 + o];
      const s1: V3 = [x1 + o, n.eave - 0.25, z1 + o];
      mesh.quad('roofMetal', e0, e1, r1, r0, [0, 1, -1]);
      mesh.quad('roofMetal', s0, s1, r1, r0, [0, 1, 1]);
      mesh.tri(
        'plasterExterior',
        [x0, n.eave, z0],
        [x0, n.eave, z1],
        [x0, n.ridgeY - 0.1, zm],
        [-1, 0, 0],
      );
      mesh.tri(
        'plasterExterior',
        [x1, n.eave, z0],
        [x1, n.eave, z1],
        [x1, n.ridgeY - 0.1, zm],
        [1, 0, 0],
      );
    } else {
      const xm = (x0 + x1) / 2;
      const e0: V3 = [x0 - o, n.eave - 0.25, z0 - o];
      const e1: V3 = [x0 - o, n.eave - 0.25, z1 + o];
      const r0: V3 = [xm, n.ridgeY, z0 - o];
      const r1: V3 = [xm, n.ridgeY, z1 + o];
      const s0: V3 = [x1 + o, n.eave - 0.25, z0 - o];
      const s1: V3 = [x1 + o, n.eave - 0.25, z1 + o];
      mesh.quad('roofMetal', e0, e1, r1, r0, [-1, 1, 0]);
      mesh.quad('roofMetal', s0, s1, r1, r0, [1, 1, 0]);
      mesh.tri(
        'plasterExterior',
        [x0, n.eave, z0],
        [x1, n.eave, z0],
        [xm, n.ridgeY - 0.1, z0],
        [0, 0, -1],
      );
      mesh.tri(
        'plasterExterior',
        [x0, n.eave, z1],
        [x1, n.eave, z1],
        [xm, n.ridgeY - 0.1, z1],
        [0, 0, 1],
      );
    }
  }
}

/** Everything outside the building: terrain, paving, fence, planting, features, context. */
export function buildSite(mesh: MeshBuilder, collider: MeshBuilder, model: HouseModel): void {
  const { lot } = model.site;
  const house: Polygon = [
    [SHELL.west, SHELL.north],
    [SHELL.east, SHELL.north],
    [SHELL.east, SHELL.south],
    [SHELL.west, SHELL.south],
  ];
  const lightWell: Polygon = [
    [7.175, SHELL.south],
    [9.525, SHELL.south],
    [9.525, 8.175],
    [7.175, 8.175],
  ];
  buildTerrain(mesh, collider, lot, [house, lightWell]);

  for (const p of model.site.patches) {
    if (p.drape === undefined) buildPatch(mesh, collider, p);
    else drape(mesh, p.collide ? collider : null, p.material, p.polygon, p.drape);
  }
  for (const g of GRAVEL) drape(mesh, null, 'gravel', g.polygon, 0.025);
  for (const s of STEPPING_STONES) {
    const c = Math.cos(s.rot);
    const sn = Math.sin(s.rot);
    const hw = s.w / 2;
    const hd = s.d / 2;
    const k = 0.06; // chamfered corners: natural slab outline
    const local: Vec2[] = [
      [-hw + k, -hd],
      [hw - k * 0.6, -hd],
      [hw, -hd + k],
      [hw, hd - k * 0.7],
      [hw - k, hd],
      [-hw + k * 0.5, hd],
      [-hw, hd - k],
      [-hw, -hd + k * 0.8],
    ];
    const poly = local.map(([u, v]) => [s.x + u * c - v * sn, s.z + u * sn + v * c] as Vec2);
    drape(mesh, null, 'stone', poly, 0.035);
  }
  drape(mesh, null, 'grating', circle(MANHOLE.x, MANHOLE.z, MANHOLE.r, 14), 0.043);
  for (const b of PLANTING_BEDS) drape(mesh, null, 'soil', b.polygon, 0.015, false);
  for (const e of EDGING)
    edgingStrip(mesh.bucket('corten'), e.points, e.closed ?? false, 0.008, 0.04, 0.06);

  buildFence(mesh);

  for (const t of TREES) buildTree(mesh, t);
  for (const s of SHRUBS) buildShrub(mesh, s);
  const keepOut = [
    ...TREES.map((t) => ({ x: t.x, z: t.z, r: t.trunkR + 0.2 })),
    ...SHRUBS.map((s) => ({ x: s.x, z: s.z, r: s.r * 0.8 })),
  ];
  MEADOWS.forEach((m, i) => meadow(mesh, m.polygon, 101 + i, 0.3, 0.62, 0.16, keepOut));
  PLANTING_BEDS.forEach((b, i) => meadow(mesh, b.polygon, 201 + i, 0.42, 0.5, 0.3, keepOut));

  buildBeds(mesh);
  buildSwing(mesh);
  buildFirePit(mesh);
  PLANTERS.forEach((p, i) => buildPlanter(mesh, p, i));
  buildBinCorner(mesh);
  buildNeighbours(mesh);

  for (const o of gardenObstacles()) colliderFor(collider, o);
}
