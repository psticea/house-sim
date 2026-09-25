/**
 * Procedural furniture pieces (plan.md I5 step 5.1, §6.2): parametric builders in The
 * Local Project style — solid oak joinery, travertine, linen / bouclé, wool, cane, clay,
 * aged brass. Each builder draws one `FurnitureItem` in its local frame: origin on the
 * floor at the footprint centre, front toward local +z, back (walls) toward −z.
 */
import type { FurnitureItem, FurnitureKind } from '../../data/furniture';
import type { MaterialId } from '../../data/schema';
import { blob } from '../vegetation';
import { buildOlive } from '../vegetation';
import type { V3 } from '../meshBuilder';
import type { Frame } from './kit';

type Builder = (f: Frame, it: FurnitureItem) => void;

function opt(it: FurnitureItem, key: string, def: number): number;
function opt(it: FurnitureItem, key: string, def: string): string;
function opt(it: FurnitureItem, key: string, def: boolean): boolean;
function opt(it: FurnitureItem, key: string, def: number | string | boolean): unknown {
  return it.opts?.[key] ?? def;
}

const BOOK_COLOURS: readonly MaterialId[] = [
  'clay',
  'linen',
  'cane',
  'smokedOak',
  'wool',
  'foliage',
];

/** Row of books standing on a shelf between x0 and x1 (local), spines toward +z. */
function books(
  f: Frame,
  x0: number,
  x1: number,
  y: number,
  z: number,
  depth: number,
  seed: number,
  maxH = 0.26,
): void {
  let x = x0;
  let k = seed;
  while (x < x1 - 0.03) {
    const t = 0.025 + ((k * 37) % 5) * 0.006;
    const h = maxH * (0.72 + ((k * 53) % 7) * 0.04);
    if (x + t > x1) break;
    f.box(
      BOOK_COLOURS[k % BOOK_COLOURS.length]!,
      [x, y, z - depth / 2],
      [x + t, y + h, z + depth / 2],
    );
    x += t + 0.002;
    k++;
  }
}

/** Ceramic / clay table lamp with a linen drum shade, standing at local (x, y, z). */
function tableLamp(f: Frame, x: number, y: number, z: number, base: MaterialId, s = 1): void {
  f.lathe(
    base,
    x,
    z,
    [
      [0.055 * s, y],
      [0.085 * s, y + 0.06 * s],
      [0.09 * s, y + 0.13 * s],
      [0.06 * s, y + 0.2 * s],
      [0.015 * s, y + 0.23 * s],
    ],
    { capStart: true },
  );
  f.tube('brass', [x, y + 0.23 * s, z], [x, y + 0.3 * s, z], 0.006, 0.006, 6);
  f.lathe(
    'linen',
    x,
    z,
    [
      [0.13 * s, y + 0.27 * s],
      [0.1 * s, y + 0.45 * s],
    ],
    { capStart: true, capEnd: true },
  );
}

/** Recessed dark plinth + carcass + doors with 6 mm reveals (wardrobes, kitchen). */
function doorFronts(
  f: Frame,
  x0: number,
  x1: number,
  y0: number,
  y1: number,
  z: number,
  n: number,
  pulls: 'v' | 'h' | 'none' = 'v',
): void {
  const dw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) {
    const a = x0 + i * dw + 0.003;
    const b = x0 + (i + 1) * dw - 0.003;
    f.box('joinery', [a, y0 + 0.003, z], [b, y1 - 0.003, z + 0.02]);
    if (pulls === 'v') {
      // Slim smoked-oak pulls at the meeting edges of door pairs.
      const px = i % 2 === 0 ? b - 0.035 : a + 0.015;
      const py = Math.min(1.05, (y0 + y1) / 2);
      f.box('smokedOak', [px, py - 0.15, z + 0.02], [px + 0.02, py + 0.15, z + 0.032]);
    } else if (pulls === 'h') {
      f.box(
        'smokedOak',
        [(a + b) / 2 - 0.1, y1 - 0.05, z + 0.02],
        [(a + b) / 2 + 0.1, y1 - 0.03, z + 0.032],
      );
    }
  }
}

const bed: Builder = (f, it) => {
  const [w, l, hh] = it.size;
  const zb = -l / 2;
  const zf = l / 2;
  const frame: MaterialId = 'joinery';
  f.box('smokedOak', [-w / 2 + 0.08, 0, zb + 0.14], [w / 2 - 0.08, 0.1, zf - 0.08], {
    bottom: false,
  });
  f.box(frame, [-w / 2, 0.1, zb + 0.06], [w / 2, 0.3, zf]);
  // Headboard: a solid oak panel with a softened top rail.
  f.box(frame, [-w / 2, 0.1, zb], [w / 2, hh - 0.03, zb + 0.06]);
  f.rbox(frame, [0, hh - 0.03, zb + 0.03], [w / 2, 0.03, 0.03], 0.02, 1);
  const mw = w - 0.1;
  const ml = l - 0.06 - 0.06;
  const mz = zb + 0.06 + 0.03 + ml / 2;
  f.rbox('linen', [0, 0.41, mz], [mw / 2, 0.11, ml / 2], 0.05);
  // Duvet draped over the lower part of the mattress.
  const duvet = opt(it, 'duvet', w > 1.2 ? 'linen' : 'wool') as MaterialId;
  const dz0 = zb + 0.62;
  const dz1 = zf + 0.03;
  f.rbox(duvet, [0, 0.47, (dz0 + dz1) / 2], [mw / 2 + 0.035, 0.105, (dz1 - dz0) / 2], 0.05);
  const throwId = opt(it, 'throw', 'wool') as MaterialId;
  f.rbox(throwId, [0, 0.5, zf - 0.255], [mw / 2 + 0.05, 0.085, 0.3], 0.04);
  const n = opt(it, 'pillows', 2);
  const pw = n === 1 ? 0.3 : Math.min(0.32, mw / 4 - 0.02);
  for (let i = 0; i < n; i++) {
    const x = n === 1 ? 0 : (i === 0 ? -1 : 1) * (mw / 4 + 0.01);
    f.rbox('linen', [x, 0.66, zb + 0.2], [pw, 0.17, 0.065], 0.06, 2, 0.5);
  }
  const cushion = opt(it, 'cushion', '') as MaterialId | '';
  if (cushion) f.rbox(cushion, [0, 0.64, zb + 0.34], [0.22, 0.14, 0.055], 0.05, 2, 0.35);
};

const bedside: Builder = (f, it) => {
  const [w, d, h] = it.size;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (w / 2 - 0.03);
      const z = sz * (d / 2 - 0.03);
      f.box('smokedOak', [x - 0.015, 0, z - 0.015], [x + 0.015, 0.14, z + 0.015], {
        bottom: false,
      });
    }
  }
  f.box('joinery', [-w / 2, 0.14, -d / 2], [w / 2, h, d / 2]);
  f.box('joinery', [-w / 2 + 0.02, h - 0.16, d / 2], [w / 2 - 0.02, h - 0.03, d / 2 + 0.012]);
  f.box('brass', [-0.03, h - 0.1, d / 2 + 0.012], [0.03, h - 0.09, d / 2 + 0.03]);
  const lamp = opt(it, 'lamp', '') as MaterialId | '';
  if (lamp) tableLamp(f, 0.02, h, -0.03, lamp);
};

const wardrobe: Builder = (f, it) => {
  const [w, d, h] = it.size;
  const low = opt(it, 'low', false);
  f.box('smokedOak', [-w / 2 + 0.03, 0, -d / 2 + 0.02], [w / 2 - 0.03, 0.08, d / 2 - 0.06], {
    bottom: false,
  });
  f.box('joinery', [-w / 2, 0.08, -d / 2], [w / 2, h, d / 2 - 0.02]);
  const n = Math.max(1, Math.round(w / (low ? 0.6 : 0.5)));
  doorFronts(f, -w / 2, w / 2, 0.08, h, d / 2 - 0.02, n, low ? 'h' : 'v');
};

const hallJoinery: Builder = (f, it) => {
  const [w, d, h] = it.size;
  const b = opt(it, 'bench', 0.95);
  const zf = d / 2 - 0.02;
  f.box('smokedOak', [-w / 2 + 0.03, 0, -d / 2 + 0.02], [w / 2 - 0.03, 0.08, d / 2 - 0.06], {
    bottom: false,
  });
  // Tall cupboards either side of the open bench niche.
  for (const [x0, x1] of [
    [-w / 2, -b / 2],
    [b / 2, w / 2],
  ] as const) {
    f.box('joinery', [x0, 0.08, -d / 2], [x1, h, zf]);
    doorFronts(f, x0, x1, 0.08, h, zf, Math.max(1, Math.round((x1 - x0) / 0.5)));
  }
  // Niche: back lining, drawer + bench seat, upper cupboard, brass hooks, linen cushion.
  f.box('joinery', [-b / 2, 0.08, -d / 2], [b / 2, h, -d / 2 + 0.02]);
  f.box('joinery', [-b / 2, 0.08, -d / 2 + 0.02], [b / 2, 0.4, zf - 0.01]);
  f.box('joinery', [-b / 2 + 0.005, 0.1, zf - 0.01], [b / 2 - 0.005, 0.395, zf + 0.008]);
  f.box('joinery', [-b / 2, 0.4, -d / 2 + 0.02], [b / 2, 0.44, zf + 0.01]);
  f.rbox('linen', [0, 0.47, 0], [b / 2 - 0.03, 0.03, d / 2 - 0.05], 0.025);
  f.box('joinery', [-b / 2, 1.95, -d / 2 + 0.02], [b / 2, h, zf]);
  doorFronts(f, -b / 2, b / 2, 1.95, h, zf, 2, 'none');
  for (const x of [-0.28, 0, 0.28]) {
    f.tube('brass', [x, 1.62, -d / 2 + 0.02], [x, 1.64, -d / 2 + 0.1], 0.011, 0.011, 8);
  }
  f.box('joinery', [-b / 2, 1.9, -d / 2 + 0.02], [b / 2, 1.95, zf - 0.04]);
};

const kitchenTall: Builder = (f, it) => {
  const [w, d, h] = it.size;
  const zf = d / 2 - 0.02;
  f.box('smokedOak', [-w / 2, 0, -d / 2], [w / 2, 0.1, zf - 0.06], { bottom: false });
  f.box('joinery', [-w / 2, 0.1, -d / 2], [w / 2, h, zf]);
  // Integrated fridge (left column): two tall doors.
  f.box('joinery', [-w / 2 + 0.003, 0.103, zf], [-0.003, 1.497, zf + 0.02]);
  f.box('joinery', [-w / 2 + 0.003, 1.503, zf], [-0.003, h - 0.003, zf + 0.02]);
  f.box('smokedOak', [-0.04, 1.2, zf + 0.02], [-0.02, 1.8, zf + 0.032]);
  // Oven column: drawers, flush black oven, door above.
  f.box('joinery', [0.003, 0.103, zf], [w / 2 - 0.003, 0.497, zf + 0.02]);
  f.box('joinery', [0.003, 0.503, zf], [w / 2 - 0.003, 0.897, zf + 0.02]);
  f.box('metalBlack', [0.003, 0.903, zf], [w / 2 - 0.003, 1.497, zf + 0.02]);
  f.box('brass', [0.08, 1.42, zf + 0.02], [w / 2 - 0.08, 1.435, zf + 0.04]);
  f.box('joinery', [0.003, 1.503, zf], [w / 2 - 0.003, h - 0.003, zf + 0.02]);
  for (const x0 of [0.13, 0.33])
    f.box('smokedOak', [x0, 0.44, zf + 0.02], [x0 + 0.14, 0.455, zf + 0.032]);
};

const kitchenRun: Builder = (f, it) => {
  const [w, d] = it.size;
  const zf = d / 2 - 0.02;
  const top = 0.9;
  f.box('smokedOak', [-w / 2, 0, -d / 2], [w / 2, 0.1, zf - 0.06], { bottom: false });
  f.box('joinery', [-w / 2, 0.1, -d / 2], [w / 2, top - 0.04, zf], { skipTop: true });
  const n = Math.round(w / 0.6);
  doorFronts(f, -w / 2, w / 2, 0.1, top - 0.06, zf, n, 'h');
  // Travertine worktop (with the sink cut-out) and splashback.
  const sx = opt(it, 'sink', 0);
  const sw = 0.25;
  const sd = 0.2;
  const sz = -0.01;
  const P = (x: number, z: number): [number, number] => {
    const q = f.p(x, 0, z);
    return [q[0], q[2]];
  };
  f.mesh.prism(
    [P(-w / 2, -d / 2), P(w / 2, -d / 2), P(w / 2, d / 2 + 0.01), P(-w / 2, d / 2 + 0.01)],
    f.oy + top - 0.04,
    f.oy + top,
    { top: 'travertine', bottom: null, sides: 'travertine' },
    [[P(sx - sw, sz - sd), P(sx + sw, sz - sd), P(sx + sw, sz + sd), P(sx - sw, sz + sd)]],
  );
  // Integrated travertine sink bowl.
  const yb = top - 0.2;
  const inward = (dx: number, dz: number): V3 => [dx, 0, dz];
  f.quad(
    'travertine',
    [sx - sw, yb, sz - sd],
    [sx + sw, yb, sz - sd],
    [sx + sw, top - 0.04, sz - sd],
    [sx - sw, top - 0.04, sz - sd],
    inward(0, 1),
  );
  f.quad(
    'travertine',
    [sx - sw, yb, sz + sd],
    [sx + sw, yb, sz + sd],
    [sx + sw, top - 0.04, sz + sd],
    [sx - sw, top - 0.04, sz + sd],
    inward(0, -1),
  );
  f.quad(
    'travertine',
    [sx - sw, yb, sz - sd],
    [sx - sw, yb, sz + sd],
    [sx - sw, top - 0.04, sz + sd],
    [sx - sw, top - 0.04, sz - sd],
    inward(1, 0),
  );
  f.quad(
    'travertine',
    [sx + sw, yb, sz - sd],
    [sx + sw, yb, sz + sd],
    [sx + sw, top - 0.04, sz + sd],
    [sx + sw, top - 0.04, sz - sd],
    inward(-1, 0),
  );
  f.quad(
    'travertine',
    [sx - sw, yb, sz - sd],
    [sx + sw, yb, sz - sd],
    [sx + sw, yb, sz + sd],
    [sx - sw, yb, sz + sd],
    [0, 1, 0],
  );
  f.box('travertine', [-w / 2, top, -d / 2], [w / 2, top + 0.6, -d / 2 + 0.015]);
  // Brushed-brass tap behind the sink.
  const tz = sz - sd - 0.06;
  f.tube('brass', [sx, top, tz], [sx, top + 0.32, tz], 0.012, 0.012, 8);
  f.tube('brass', [sx, top + 0.32, tz], [sx, top + 0.32, tz + 0.2], 0.011, 0.011, 8);
  f.tube('brass', [sx, top + 0.32, tz + 0.2], [sx, top + 0.26, tz + 0.2], 0.011, 0.011, 8);
  f.box('brass', [sx + 0.06, top, tz - 0.015], [sx + 0.09, top + 0.08, tz + 0.015]);
  // Flush black-glass hob.
  const hx = opt(it, 'hob', 0.8);
  f.box('metalBlack', [hx - 0.3, top, -0.25], [hx + 0.3, top + 0.006, 0.25]);
  // Open oak shelf with a few ceramics.
  const sy = top + 0.72;
  f.box('joinery', [-w / 2 + 0.3, sy, -d / 2 + 0.015], [w / 2 - 0.3, sy + 0.04, -d / 2 + 0.27]);
  const jz = -d / 2 + 0.14;
  f.lathe(
    'ceramic',
    -w / 2 + 0.6,
    jz,
    [
      [0.07, sy + 0.04],
      [0.075, sy + 0.2],
      [0.05, sy + 0.24],
    ],
    { capEnd: true },
  );
  f.lathe(
    'clay',
    -w / 2 + 0.78,
    jz,
    [
      [0.05, sy + 0.04],
      [0.09, sy + 0.12],
      [0.04, sy + 0.26],
      [0.03, sy + 0.3],
    ],
    { capEnd: true },
  );
  f.lathe(
    'ceramic',
    w / 2 - 0.7,
    jz,
    [
      [0.1, sy + 0.04],
      [0.12, sy + 0.09],
      [0.12, sy + 0.1],
    ],
    { capEnd: true },
  );
  books(f, w / 2 - 0.55, w / 2 - 0.35, sy + 0.04, jz, 0.18, 3, 0.24);
};

const island: Builder = (f, it) => {
  const [w, d, h] = it.size;
  const ov = opt(it, 'overhang', 0.25);
  const zc = d / 2 - ov;
  const t = 0.04;
  // Travertine waterfall ends and top; oak carcass between them, fronts on the kitchen side.
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -w / 2 : w / 2 - t;
    f.box('travertine', [x0, 0, -d / 2], [x0 + t, h - 0.05, d / 2], { bottom: false });
  }
  f.box('travertine', [-w / 2, h - 0.05, -d / 2], [w / 2, h, d / 2]);
  f.box('smokedOak', [-w / 2 + t, 0, -d / 2 + 0.06], [w / 2 - t, 0.1, zc - 0.02], {
    bottom: false,
  });
  f.box('joinery', [-w / 2 + t, 0.1, -d / 2 + 0.02], [w / 2 - t, h - 0.05, zc]);
  f.box('joinery', [-w / 2 + t, 0.1, zc], [w / 2 - t, h - 0.05, zc + 0.012]);
  const n = Math.round((w - 2 * t) / 0.58);
  const dw = (w - 2 * t) / n;
  for (let i = 0; i < n; i++) {
    const a = -w / 2 + t + i * dw + 0.003;
    const b = a + dw - 0.006;
    f.box('joinery', [a, 0.103, -d / 2], [b, 0.44, -d / 2 + 0.02]);
    f.box('joinery', [a, 0.446, -d / 2], [b, h - 0.08, -d / 2 + 0.02]);
    f.box(
      'smokedOak',
      [(a + b) / 2 - 0.08, h - 0.12, -d / 2 - 0.012],
      [(a + b) / 2 + 0.08, h - 0.105, -d / 2],
    );
  }
  // A shallow ceramic bowl on the top.
  f.lathe('ceramic', w / 2 - 0.45, -0.05, [
    [0.08, h],
    [0.16, h + 0.06],
    [0.17, h + 0.07],
    [0.15, h + 0.07],
    [0.07, h + 0.02],
    [0, h + 0.015],
  ]);
};

const stool: Builder = (f, it) => {
  const h = it.size[2];
  for (const [sx, sz] of [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const) {
    f.tube('joinery', [sx * 0.15, 0, sz * 0.15], [sx * 0.1, h - 0.05, sz * 0.1], 0.017, 0.015, 8);
  }
  const fr = 0.13;
  const fy = 0.26;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const b = a + Math.PI / 2;
    f.tube(
      'joinery',
      [Math.cos(a) * fr * 1.41, fy, Math.sin(a) * fr * 1.41],
      [Math.cos(b) * fr * 1.41, fy, Math.sin(b) * fr * 1.41],
      0.011,
      0.011,
      6,
    );
  }
  f.lathe(
    'joinery',
    0,
    0,
    [
      [0.16, h - 0.05],
      [0.17, h - 0.03],
    ],
    { capStart: true },
  );
  f.lathe('smokedOak', 0, 0, [
    [0.17, h - 0.03],
    [0.175, h - 0.01],
    [0.16, h],
    [0, h + 0.004],
  ]);
};

const diningTable: Builder = (f, it) => {
  const [w, d, h] = it.size;
  f.rbox('joinery', [0, h - 0.025, 0], [w / 2, 0.025, d / 2], 0.012, 1);
  const lx = w / 2 - 0.14;
  const lz = d / 2 - 0.12;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      f.box(
        'joinery',
        [sx * lx - 0.04, 0, sz * lz - 0.04],
        [sx * lx + 0.04, h - 0.05, sz * lz + 0.04],
        { bottom: false },
      );
    }
    f.box('joinery', [sx * lx - 0.02, h - 0.13, -lz + 0.04], [sx * lx + 0.02, h - 0.05, lz - 0.04]);
  }
  for (const sz of [-1, 1])
    f.box('joinery', [-lx + 0.04, h - 0.13, sz * lz - 0.02], [lx - 0.04, h - 0.05, sz * lz + 0.02]);
  // Two ceramic vessels as a centrepiece.
  f.lathe(
    'ceramic',
    -0.15,
    0,
    [
      [0.05, h],
      [0.09, h + 0.1],
      [0.05, h + 0.22],
      [0.035, h + 0.26],
    ],
    { capEnd: true },
  );
  f.lathe(
    'clay',
    0.12,
    0.05,
    [
      [0.04, h],
      [0.07, h + 0.06],
      [0.03, h + 0.14],
      [0.025, h + 0.17],
    ],
    { capEnd: true },
  );
};

/** Cane chair: smoked-oak frame, woven cane seat and back panel. */
const caneChair: Builder = (f, it) => {
  const [w, d, h] = it.size;
  const seat = 0.45;
  const lx = w / 2 - 0.025;
  const zfL = d / 2 - 0.035;
  const zbL = -d / 2 + 0.035;
  for (const sx of [-1, 1]) {
    f.box('smokedOak', [sx * lx - 0.015, 0, zfL - 0.015], [sx * lx + 0.015, seat, zfL + 0.015], {
      bottom: false,
    });
    f.tube('smokedOak', [sx * lx, 0, zbL], [sx * lx, h, zbL - 0.05], 0.016, 0.014, 6);
    f.box('smokedOak', [sx * lx - 0.012, seat - 0.05, zbL], [sx * lx + 0.012, seat - 0.01, zfL]);
  }
  f.box('smokedOak', [-lx, seat - 0.05, zfL - 0.012], [lx, seat - 0.01, zfL + 0.012]);
  f.box('cane', [-lx + 0.012, seat - 0.02, zbL + 0.01], [lx - 0.012, seat, zfL - 0.01]);
  f.tiltedBox('cane', [0, seat + 0.2, zbL - 0.025], [lx - 0.01, 0.12, 0.008], 0.14);
  f.tiltedBox('smokedOak', [0, h - 0.03, zbL - 0.045], [lx + 0.01, 0.025, 0.014], 0.14);
};

const coffeeTable: Builder = (f, it) => {
  const [w, d, h] = it.size;
  f.rbox('travertine', [0, h - 0.03, 0], [w / 2, 0.03, d / 2], 0.015, 1);
  for (const sx of [-1, 1]) {
    f.box(
      'travertine',
      [sx * (w / 2 - 0.16) - 0.1, 0, -d / 2 + 0.1],
      [sx * (w / 2 - 0.16) + 0.1, h - 0.06, d / 2 - 0.1],
      { bottom: false },
    );
  }
  f.box('linen', [-0.4, h, -0.12], [-0.12, h + 0.03, 0.08]);
  f.box('clay', [-0.38, h + 0.03, -0.1], [-0.15, h + 0.05, 0.06]);
  f.lathe(
    'ceramic',
    0.3,
    0.05,
    [
      [0.05, h],
      [0.08, h + 0.05],
      [0.07, h + 0.12],
      [0.03, h + 0.18],
      [0.025, h + 0.2],
    ],
    { capEnd: true },
  );
};

const sofa: Builder = (f, it) => {
  const [w, d] = it.size;
  f.box('smokedOak', [-w / 2 + 0.06, 0, -d / 2 + 0.06], [w / 2 - 0.06, 0.05, d / 2 - 0.08], {
    bottom: false,
  });
  f.rbox('linen', [0, 0.16, 0], [w / 2 - 0.01, 0.11, d / 2], 0.05);
  const arm = 0.22;
  for (const sx of [-1, 1])
    f.rbox('linen', [sx * (w / 2 - arm / 2), 0.32, 0], [arm / 2, 0.24, d / 2], 0.08);
  const inner = w - 2 * arm;
  f.rbox('linen', [0, 0.42, -d / 2 + 0.09], [inner / 2 + 0.01, 0.17, 0.09], 0.07);
  const n = 3;
  const cw = inner / n;
  for (let i = 0; i < n; i++) {
    const x = -inner / 2 + cw * (i + 0.5);
    f.rbox('linen', [x, 0.34, 0.1], [cw / 2 - 0.008, 0.075, d / 2 - 0.12], 0.06);
    f.rbox('linen', [x, 0.56, -d / 2 + 0.25], [cw / 2 - 0.01, 0.2, 0.1], 0.08, 2, 0.22);
  }
  // Accent cushions: clay and sand wool.
  f.sub(-inner / 2 + 0.3, 0, -d / 2 + 0.42, 0.25).rbox(
    'clay',
    [0, 0.6, 0],
    [0.21, 0.19, 0.07],
    0.06,
    2,
    0.35,
  );
  f.sub(inner / 2 - 0.35, 0, -d / 2 + 0.42, -0.2).rbox(
    'wool',
    [0, 0.58, 0],
    [0.19, 0.17, 0.065],
    0.06,
    2,
    0.35,
  );
};

const armchair: Builder = (f, it) => {
  const [w, d] = it.size;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      f.tube(
        'smokedOak',
        [sx * (w / 2 - 0.1), 0, sz * (d / 2 - 0.1)],
        [sx * (w / 2 - 0.1), 0.08, sz * (d / 2 - 0.1)],
        0.02,
        0.02,
        8,
      );
    }
  }
  f.rbox('linen', [0, 0.23, 0.02], [w / 2, 0.15, d / 2 - 0.02], 0.1);
  f.rbox('linen', [0, 0.42, 0.08], [w / 2 - 0.13, 0.06, d / 2 - 0.12], 0.05);
  f.rbox('linen', [0, 0.52, -d / 2 + 0.12], [w / 2, 0.24, 0.11], 0.1, 2, 0.12);
  for (const sx of [-1, 1])
    f.rbox('linen', [sx * (w / 2 - 0.08), 0.44, 0.03], [0.08, 0.1, d / 2 - 0.05], 0.07);
  f.rbox('wool', [0.05, 0.57, -d / 2 + 0.28], [0.18, 0.15, 0.06], 0.05, 2, 0.3);
};

/** Low lounge chair: frame (smoked oak / outdoor timber), cane seat + back, linen cushion. */
function lounge(f: Frame, it: FurnitureItem, frame: MaterialId): void {
  const [w, d] = it.size;
  const lx = w / 2 - 0.03;
  const lz = d / 2 - 0.05;
  for (const sx of [-1, 1]) {
    f.tube(frame, [sx * lx, 0, lz], [sx * lx, 0.56, lz - 0.04], 0.02, 0.018, 8);
    f.tube(frame, [sx * lx, 0, -lz], [sx * lx, 0.56, -lz + 0.06], 0.02, 0.018, 8);
    f.rbox(frame, [sx * lx, 0.57, 0], [0.028, 0.016, lz + 0.03], 0.012, 1);
    f.box(frame, [sx * lx - 0.012, 0.25, -lz], [sx * lx + 0.012, 0.3, lz]);
  }
  f.tiltedBox('cane', [0, 0.33, 0.03], [lx - 0.02, 0.012, lz - 0.02], 0.08);
  f.tiltedBox('cane', [0, 0.58, -lz + 0.04], [lx - 0.02, 0.22, 0.012], 0.32);
  f.rbox('linen', [0, 0.39, 0.06], [lx - 0.04, 0.05, lz - 0.06], 0.04);
  f.rbox('linen', [0, 0.56, -lz + 0.13], [lx - 0.08, 0.13, 0.05], 0.05, 2, 0.32);
}

const rug: Builder = (f, it) => {
  const [w, d, h] = it.size;
  f.box(it.material ?? 'wool', [-w / 2, 0, -d / 2], [w / 2, h, d / 2], { bottom: false });
};

const mirror: Builder = (f, it) => {
  const [w, d, h] = it.size;
  const y0 = it.y ?? 1.2;
  f.wallDisc('mirror', 'brass', [0, y0 + h / 2, -d / 2], w / 2, d, 0.022);
};

const pendant: Builder = (f, it) => {
  const [w, , h] = it.size;
  const y0 = it.y ?? 1.8;
  const topWorld = opt(it, 'top', f.oy + 2.6);
  const r = w / 2;
  const shape = opt(it, 'shape', 'globe');
  const mat = it.material ?? 'ceramic';
  const prof: [number, number][] =
    shape === 'wide'
      ? [
          [0.1 * r, y0],
          [0.72 * r, y0 + 0.08 * h],
          [r, y0 + 0.3 * h],
          [0.92 * r, y0 + 0.55 * h],
          [0.55 * r, y0 + 0.85 * h],
          [0.08 * r, y0 + h],
        ]
      : [
          [0.15 * r, y0],
          [0.62 * r, y0 + 0.06 * h],
          [0.93 * r, y0 + 0.25 * h],
          [r, y0 + 0.5 * h],
          [0.9 * r, y0 + 0.76 * h],
          [0.52 * r, y0 + 0.95 * h],
          [0.1 * r, y0 + h],
        ];
  f.lathe(mat, 0, 0, prof, { capStart: true, capEnd: true });
  f.box('metalBlack', [-0.003, y0 + h, -0.003], [0.003, topWorld - f.oy, 0.003]);
};

const floorLamp: Builder = (f, it) => {
  const h = it.size[2];
  f.lathe(
    'foliage',
    0,
    0,
    [
      [0.15, 0],
      [0.16, 0.02],
      [0.12, 0.05],
      [0.03, 0.07],
    ],
    { capStart: true },
  );
  f.tube('brass', [0, 0.06, 0], [0, h - 0.25, 0], 0.011, 0.011, 8);
  f.tube('brass', [0, h - 0.25, 0], [0.06, h - 0.12, 0], 0.01, 0.01, 8);
  f.lathe(
    'linen',
    0.06,
    0,
    [
      [0.2, h - 0.3],
      [0.17, h],
    ],
    { capStart: true, capEnd: true },
  );
};

const sconce: Builder = (f, it) => {
  const [, d] = it.size;
  const y0 = it.y ?? 1.7;
  const zb = -d / 2;
  const mat = it.material ?? 'clay';
  f.box('brass', [-0.045, y0 - 0.02, zb], [0.045, y0 + 0.12, zb + 0.012]);
  f.box('brass', [-0.012, y0 + 0.02, zb + 0.012], [0.012, y0 + 0.04, zb + 0.09]);
  f.lathe(
    mat,
    0,
    zb + 0.1,
    [
      [0.03, y0],
      [0.075, y0 + 0.06],
      [0.085, y0 + 0.17],
      [0.075, y0 + 0.17],
      [0.066, y0 + 0.07],
      [0.02, y0 + 0.02],
    ],
    { capStart: true },
  );
};

const stove: Builder = (f, it) => {
  const [w, d, h] = it.size;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      f.box(
        'metalBlack',
        [sx * (w / 2 - 0.05) - 0.02, 0.03, sz * (d / 2 - 0.05) - 0.02],
        [sx * (w / 2 - 0.05) + 0.02, 0.13, sz * (d / 2 - 0.05) + 0.02],
        { bottom: false },
      );
    }
  }
  f.rbox('metalBlack', [0, (0.13 + h) / 2, 0], [w / 2, (h - 0.13) / 2, d / 2], 0.02, 1);
  f.box('metalBlack', [-w / 2 - 0.01, h - 0.02, -d / 2 - 0.01], [w / 2 + 0.01, h, d / 2 + 0.01]);
  // Door with the fire window and a brass handle.
  f.box('metalBlack', [-w / 2 + 0.04, 0.3, d / 2], [w / 2 - 0.04, h - 0.12, d / 2 + 0.015]);
  f.box('clay', [-w / 2 + 0.08, 0.36, d / 2 + 0.015], [w / 2 - 0.08, h - 0.2, d / 2 + 0.02]);
  f.box('brass', [w / 2 - 0.07, 0.5, d / 2 + 0.015], [w / 2 - 0.055, 0.7, d / 2 + 0.04]);
};

const hearth: Builder = (f, it) => {
  const [w, d, h] = it.size;
  f.box('travertine', [-w / 2, 0, -d / 2], [w / 2, h, d / 2], { bottom: false });
};

const logStore: Builder = (f, it) => {
  const [w, d, h] = it.size;
  f.box('metalBlack', [-w / 2, 0, -d / 2], [-w / 2 + 0.012, h, d / 2], { bottom: false });
  f.box('metalBlack', [w / 2 - 0.012, 0, -d / 2], [w / 2, h, d / 2], { bottom: false });
  f.box('metalBlack', [-w / 2, 0, -d / 2], [w / 2, 0.012, d / 2], { bottom: false });
  const r = 0.05;
  for (let row = 0; row < 4; row++) {
    const y = 0.012 + r + row * r * 1.75;
    const off = row % 2 === 0 ? 0 : r;
    for (let k = 0; k < 3; k++) {
      const z = -d / 2 + r + off + k * r * 2.05;
      if (z + r > d / 2) continue;
      f.tube('bark', [-w / 2 + 0.015, y, z], [w / 2 - 0.015, y, z], r, r * 0.95, 8);
    }
  }
};

const wc: Builder = (f, it) => {
  const [w, d] = it.size;
  const zb = -d / 2;
  f.rbox('ceramic', [0, 0.33, zb + 0.28], [w / 2 - 0.01, 0.085, 0.265], 0.09);
  f.rbox('ceramic', [0, 0.37, zb + 0.1], [w / 2 - 0.02, 0.07, 0.1], 0.04, 1);
  f.rbox('ceramic', [0, 0.425, zb + 0.29], [w / 2 - 0.015, 0.012, 0.25], 0.01, 1);
  f.box('brass', [-0.11, 0.98, zb], [0.11, 1.13, zb + 0.008]);
};

const vanity: Builder = (f, it) => {
  const [w, d, h] = it.size;
  const zb = -d / 2;
  f.box('joinery', [-w / 2, 0.5, zb], [w / 2, h - 0.04, d / 2 - 0.015]);
  f.box('joinery', [-w / 2 + 0.005, 0.505, d / 2 - 0.015], [w / 2 - 0.005, h - 0.045, d / 2]);
  f.box('smokedOak', [-0.12, h - 0.09, d / 2], [0.12, h - 0.075, d / 2 + 0.012]);
  f.box('travertine', [-w / 2, h - 0.04, zb], [w / 2, h, d / 2 + 0.01]);
  f.lathe(
    'travertine',
    0,
    0.03,
    [
      [0.14, h],
      [0.19, h + 0.05],
      [0.2, h + 0.13],
      [0.18, h + 0.13],
      [0.165, h + 0.05],
      [0, h + 0.03],
    ],
    { squash: 0.78 },
  );
  // Wall-mounted brushed-brass spout and mixer knob.
  const ys = h + 0.28;
  f.box('brass', [-0.035, ys - 0.035, zb], [0.035, ys + 0.035, zb + 0.008]);
  f.tube('brass', [0, ys, zb], [0, ys, zb + 0.2], 0.012, 0.012, 8);
  f.tube('brass', [0.1, ys, zb], [0.1, ys, zb + 0.05], 0.022, 0.022, 10);
};

const showerScreen: Builder = (f, it) => {
  const [w, d, h] = it.size;
  f.box('glass', [-w / 2, 0.02, -d / 2 + 0.004], [w / 2, h, d / 2 - 0.004]);
  f.box('brass', [-w / 2, 0, -d / 2], [w / 2, 0.02, d / 2], { bottom: false });
  f.box('brass', [-w / 2, h - 0.004, -d / 2], [-w / 2 + 0.01, h, d / 2]);
};

const showerHead: Builder = (f, it) => {
  const [, d] = it.size;
  const zb = -d / 2;
  const mix = it.y ?? 1.0;
  f.box('brass', [-0.06, mix - 0.06, zb], [0.06, mix + 0.06, zb + 0.01]);
  f.tube('brass', [0, mix, zb + 0.01], [0, mix, zb + 0.06], 0.025, 0.025, 10);
  const top = 2.1;
  f.tube('brass', [0, top, zb], [0, top, zb + 0.3], 0.011, 0.011, 8);
  f.lathe(
    'brass',
    0,
    zb + 0.3,
    [
      [0.12, top - 0.035],
      [0.12, top - 0.022],
      [0.012, top - 0.01],
    ],
    { capStart: true },
  );
};

const tub: Builder = (f, it) => {
  const [w, d, h] = it.size;
  const r = w / 2;
  f.lathe(
    'travertine',
    0,
    0,
    [
      [r - 0.12, 0],
      [r - 0.02, 0.12],
      [r, h],
      [r - 0.06, h],
      [r - 0.1, h - 0.14],
      [r - 0.24, 0.2],
      [0, 0.18],
    ],
    { n: 24, squash: d / w },
  );
  // Floor-standing brass filler at the foot end.
  const fx = r - 0.12;
  const fz = -d / 2 + 0.02;
  f.tube('brass', [fx, 0, fz], [fx, h + 0.3, fz], 0.016, 0.016, 8);
  f.tube('brass', [fx, h + 0.3, fz], [fx, h + 0.3, fz + 0.17], 0.013, 0.013, 8);
  f.tube('brass', [fx, h + 0.3, fz + 0.17], [fx, h + 0.24, fz + 0.17], 0.013, 0.013, 8);
};

const towelLadder: Builder = (f, it) => {
  const [w, d, h] = it.size;
  const tilt = Math.atan2(d - 0.03, h);
  const zAt = (y: number): number => d / 2 - 0.015 - (y / h) * (d - 0.03);
  for (const sx of [-1, 1]) {
    f.tiltedBox(
      'joinery',
      [sx * (w / 2 - 0.02), h / 2, zAt(h / 2)],
      [0.016, h / 2 / Math.cos(tilt), 0.012],
      tilt,
    );
  }
  for (const y of [0.42, 0.78, 1.12, 1.44]) {
    if (y > h - 0.1) continue;
    f.tube('joinery', [-w / 2 + 0.035, y, zAt(y)], [w / 2 - 0.035, y, zAt(y)], 0.012, 0.012, 6);
  }
  f.rbox('linen', [0, 0.95, zAt(1.12) + 0.02], [w / 2 - 0.08, 0.18, 0.012], 0.01, 1, tilt);
};

const boiler: Builder = (f, it) => {
  const [w, d, h] = it.size;
  const y0 = it.y ?? 1.3;
  f.rbox('ceramic', [0, y0 + h / 2, 0], [w / 2, h / 2, d / 2], 0.025, 1);
  f.box('metalBlack', [-w / 2 + 0.08, y0 + 0.08, d / 2], [w / 2 - 0.08, y0 + 0.12, d / 2 + 0.005]);
  for (const x of [-0.12, -0.04, 0.04, 0.12]) {
    f.tube('brass', [x, y0, -d / 2 + 0.1], [x, y0 - 0.35, -d / 2 + 0.1], 0.011, 0.011, 6);
  }
};

const washerStack: Builder = (f, it) => {
  const [w, d] = it.size;
  f.box('joinery', [-w / 2, 0, -d / 2], [w / 2, 0.05, d / 2 - 0.02], { bottom: false });
  for (const [y0, y1] of [
    [0.05, 0.9],
    [0.92, 1.77],
  ] as const) {
    f.rbox(
      'ceramic',
      [0, (y0 + y1) / 2, -0.01],
      [w / 2 - 0.01, (y1 - y0) / 2, d / 2 - 0.01],
      0.015,
      1,
    );
    f.box(
      'metalBlack',
      [-w / 2 + 0.03, y1 - 0.1, d / 2 - 0.02],
      [w / 2 - 0.03, y1 - 0.04, d / 2 - 0.012],
    );
    f.wallDisc('mirror', 'metalBlack', [0, (y0 + y1) / 2 - 0.05, d / 2 - 0.02], 0.17, 0.025, 0.03);
  }
};

const dryingRack: Builder = (f, it) => {
  const [w, d, h] = it.size;
  for (const sx of [-1, 1]) {
    f.tube(
      'joinery',
      [sx * (w / 2 - 0.02), 0, -d / 2],
      [sx * (w / 2 - 0.02), h, 0],
      0.012,
      0.012,
      6,
    );
    f.tube(
      'joinery',
      [sx * (w / 2 - 0.02), 0, d / 2],
      [sx * (w / 2 - 0.02), h, 0],
      0.012,
      0.012,
      6,
    );
  }
  for (const t of [0.3, 0.55, 0.8, 1.0]) {
    for (const sz of [-1, 1]) {
      const y = h * t;
      const z = sz * (d / 2) * (1 - t);
      f.tube('joinery', [-w / 2 + 0.02, y, z], [w / 2 - 0.02, y, z], 0.008, 0.008, 6);
    }
  }
  f.rbox('linen', [-0.08, h * 0.62, (d / 2) * 0.45], [0.16, 0.2, 0.01], 0.008, 1, -0.45);
  f.rbox('wool', [0.14, h * 0.7, -(d / 2) * 0.3], [0.1, 0.15, 0.01], 0.008, 1, 0.45);
};

const basket: Builder = (f, it) => {
  const [w, , h] = it.size;
  const r = w / 2;
  f.lathe(
    it.material ?? 'cane',
    0,
    0,
    [
      [r * 0.82, 0],
      [r, h * 0.85],
      [r * 1.02, h],
      [r * 0.93, h],
      [r * 0.74, h * 0.1],
      [0, h * 0.08],
    ],
    { capStart: true },
  );
};

const teepee: Builder = (f, it) => {
  const [w, , h] = it.size;
  const r = w / 2;
  const n = 6;
  for (let k = 0; k < n; k++) {
    const a = ((k + 0.5) / n) * Math.PI * 2;
    f.tube(
      'joinery',
      [Math.cos(a) * r * 0.97, 0, Math.sin(a) * r * 0.97],
      [-Math.cos(a) * 0.1, h + 0.12, -Math.sin(a) * 0.1],
      0.013,
      0.011,
      6,
    );
  }
  // Linen cover (hexagonal pyramid), entrance panel open toward +z, lined inside.
  const cover: [number, number][] = [
    [r * 0.95, 0],
    [0.07, h * 0.9],
  ];
  const skip = [1];
  f.lathe('linen', 0, 0, cover, { n, skip });
  f.lathe(
    'linen',
    0,
    0,
    [...cover].reverse().map(([rr, y]): [number, number] => [rr - 0.005, y]),
    { n, skip },
  );
  f.rbox('wool', [0, 0.06, 0], [0.32, 0.06, 0.32], 0.05);
};

const cushion: Builder = (f, it) => {
  const [w, d, h] = it.size;
  f.rbox(
    it.material ?? 'linen',
    [0, h / 2, 0],
    [w / 2, h / 2, d / 2],
    Math.min(0.06, h / 2 - 0.005),
  );
};

const bookLedge: Builder = (f, it) => {
  const [w, d, h] = it.size;
  f.box('joinery', [-w / 2, 0, -d / 2], [-w / 2 + 0.02, h, d / 2], { bottom: false });
  f.box('joinery', [w / 2 - 0.02, 0, -d / 2], [w / 2, h, d / 2], { bottom: false });
  f.box('joinery', [-w / 2 + 0.02, 0, -d / 2], [w / 2 - 0.02, h, -d / 2 + 0.015], {
    bottom: false,
  });
  for (const y of [0.04, h * 0.55]) {
    f.box('joinery', [-w / 2 + 0.02, y, -d / 2 + 0.015], [w / 2 - 0.02, y + 0.02, d / 2]);
    f.box('joinery', [-w / 2 + 0.02, y + 0.02, d / 2 - 0.015], [w / 2 - 0.02, y + 0.07, d / 2]);
  }
  // Picture books facing out, leaning on the back.
  const covers: MaterialId[] = ['clay', 'foliage', 'cane', 'linen', 'wool'];
  let x = -w / 2 + 0.07;
  let k = 0;
  for (const y of [0.06, h * 0.55 + 0.02]) {
    while (x < w / 2 - 0.25) {
      const bw = 0.17 + (k % 3) * 0.03;
      f.tiltedBox(
        covers[k % covers.length]!,
        [x + bw / 2, y + 0.11, -d / 2 + 0.06],
        [bw / 2, 0.11, 0.008],
        0.18,
      );
      x += bw + 0.04;
      k++;
    }
    x = -w / 2 + 0.12;
  }
};

const openShelf: Builder = (f, it) => {
  const [w, d, h] = it.size;
  f.box('joinery', [-w / 2, 0, -d / 2], [-w / 2 + 0.02, h, d / 2], { bottom: false });
  f.box('joinery', [w / 2 - 0.02, 0, -d / 2], [w / 2, h, d / 2], { bottom: false });
  f.box('joinery', [-0.01, 0.02, -d / 2], [0.01, h - 0.02, d / 2]);
  f.box('joinery', [-w / 2 + 0.02, 0, -d / 2], [w / 2 - 0.02, 0.05, d / 2], { bottom: false });
  f.box('joinery', [-w / 2, h - 0.025, -d / 2], [w / 2, h, d / 2]);
  f.box('joinery', [-w / 2 + 0.02, 0.05, -d / 2], [w / 2 - 0.02, h - 0.025, -d / 2 + 0.012]);
  f.lathe('cane', -w / 4, 0.01, [
    [0.12, 0.05],
    [0.14, 0.3],
    [0.13, 0.3],
    [0.1, 0.07],
    [0, 0.065],
  ]);
  books(f, 0.03, w / 2 - 0.05, 0.05, 0, d * 0.7, 7, 0.24);
  tableLamp(f, w / 4, h, -0.02, 'clay', 0.8);
};

const bookshelf: Builder = (f, it) => {
  const [w, d, h] = it.size;
  f.box('joinery', [-w / 2, 0, -d / 2], [-w / 2 + 0.025, h, d / 2], { bottom: false });
  f.box('joinery', [w / 2 - 0.025, 0, -d / 2], [w / 2, h, d / 2], { bottom: false });
  f.box('joinery', [-w / 2 + 0.025, 0.05, -d / 2], [w / 2 - 0.025, h - 0.025, -d / 2 + 0.012]);
  const shelves = 4;
  for (let i = 0; i <= shelves; i++) {
    const y = i === 0 ? 0.03 : (i / shelves) * (h - 0.03);
    f.box(
      'joinery',
      [-w / 2 + 0.025, y, -d / 2 + 0.012],
      [w / 2 - 0.025, y + 0.025, d / 2],
      i === 0 ? { bottom: false } : {},
    );
    if (i < shelves) {
      const gap = (h - 0.03) / shelves - 0.05;
      const span = w - 0.05;
      const x0 = -w / 2 + 0.03 + (i % 2 === 0 ? 0 : span * 0.35);
      books(f, x0, x0 + span * 0.62, y + 0.025, 0, d * 0.75, i * 5 + 1, Math.min(0.28, gap));
      if (i === 1)
        f.lathe(
          'ceramic',
          w / 2 - 0.15,
          0,
          [
            [0.05, y + 0.025],
            [0.08, y + 0.1],
            [0.04, y + 0.2],
            [0.035, y + 0.22],
          ],
          { capEnd: true },
        );
      if (i === 2)
        f.lathe(
          'clay',
          -w / 2 + 0.16,
          0,
          [
            [0.06, y + 0.025],
            [0.07, y + 0.08],
            [0.06, y + 0.1],
          ],
          { capEnd: true },
        );
    }
  }
};

const shelving: Builder = (f, it) => {
  const [w, d, h] = it.size;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      const x = sx * (w / 2 - 0.015);
      const z = sz * (d / 2 - 0.015);
      f.box('metalBlack', [x - 0.015, 0, z - 0.015], [x + 0.015, h, z + 0.015], { bottom: false });
    }
  }
  const levels = [0.12, 0.62, 1.12, 1.62];
  levels.forEach((y, i) => {
    f.box('joinery', [-w / 2, y, -d / 2], [w / 2, y + 0.025, d / 2]);
    // Woven storage boxes and a few ceramic jars.
    const n = Math.floor(w / 0.42);
    for (let k = 0; k < n; k++) {
      if ((k + i) % 4 === 3) continue;
      const x0 = -w / 2 + 0.05 + k * ((w - 0.1) / n);
      const bw = (w - 0.1) / n - 0.04;
      const bh = i === 3 ? 0.2 : 0.3;
      if ((k + i) % 3 === 2) {
        f.lathe(
          'ceramic',
          x0 + bw / 2,
          0,
          [
            [0.07, y + 0.025],
            [0.08, y + 0.2],
            [0.05, y + 0.24],
          ],
          { capEnd: true },
        );
      } else {
        f.box('cane', [x0, y + 0.025, -d / 2 + 0.04], [x0 + bw, y + 0.025 + bh, d / 2 - 0.03]);
      }
    }
  });
};

const desk: Builder = (f, it) => {
  const [w, d, h] = it.size;
  f.rbox('joinery', [0, h - 0.018, 0], [w / 2, 0.018, d / 2], 0.008, 1);
  for (const sx of [-1, 1]) {
    f.box(
      'joinery',
      [sx * (w / 2 - 0.05) - 0.02, 0, -d / 2 + 0.05],
      [sx * (w / 2 - 0.05) + 0.02, h - 0.036, d / 2 - 0.05],
      { bottom: false },
    );
  }
  f.box('joinery', [w / 2 - 0.5, h - 0.15, -d / 2 + 0.05], [w / 2 - 0.08, h - 0.036, d / 2 - 0.03]);
  f.box(
    'smokedOak',
    [w / 2 - 0.36, h - 0.1, d / 2 - 0.03],
    [w / 2 - 0.22, h - 0.088, d / 2 - 0.018],
  );
  if (opt(it, 'lamp', false)) {
    // Bronze task lamp.
    const x = -w / 2 + 0.2;
    const z = -d / 2 + 0.15;
    f.lathe(
      'brass',
      x,
      z,
      [
        [0.08, h],
        [0.08, h + 0.015],
        [0.02, h + 0.025],
      ],
      { capEnd: true },
    );
    f.tube('brass', [x, h + 0.02, z], [x + 0.05, h + 0.38, z + 0.02], 0.007, 0.007, 6);
    f.tube('brass', [x + 0.05, h + 0.38, z + 0.02], [x + 0.25, h + 0.4, z + 0.12], 0.007, 0.007, 6);
    f.lathe(
      'brass',
      x + 0.27,
      z + 0.13,
      [
        [0.07, h + 0.3],
        [0.02, h + 0.4],
        [0.01, h + 0.41],
      ],
      { capStart: true },
    );
  }
  books(f, w / 2 - 0.26, w / 2 - 0.12, h, -d / 2 + 0.1, 0.15, 2, 0.2);
};

const daybed: Builder = (f, it) => {
  const [w, d] = it.size;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      f.box(
        'joinery',
        [sx * (w / 2 - 0.05) - 0.025, 0, sz * (d / 2 - 0.05) - 0.025],
        [sx * (w / 2 - 0.05) + 0.025, 0.12, sz * (d / 2 - 0.05) + 0.025],
        { bottom: false },
      );
    }
  }
  f.box('joinery', [-w / 2, 0.12, -d / 2], [w / 2, 0.28, d / 2]);
  f.rbox('linen', [0, 0.35, 0], [w / 2 - 0.02, 0.07, d / 2 - 0.02], 0.05);
  for (const sx of [-1, 1])
    f.rbox('linen', [sx * (w / 2 - 0.12), 0.51, 0], [0.09, 0.09, d / 2 - 0.06], 0.085);
  f.rbox('linen', [-0.4, 0.58, -d / 2 + 0.12], [0.36, 0.17, 0.07], 0.06, 2, 0.25);
  f.rbox('linen', [0.36, 0.58, -d / 2 + 0.12], [0.36, 0.17, 0.07], 0.06, 2, 0.25);
  f.rbox('clay', [0.05, 0.55, -d / 2 + 0.24], [0.2, 0.14, 0.06], 0.05, 2, 0.35);
  f.rbox('wool', [w / 2 - 0.45, 0.43, 0.05], [0.28, 0.012, d / 2 - 0.02], 0.01, 1);
};

const bench: Builder = (f, it) => {
  const [w, d, h] = it.size;
  f.rbox('joinery', [0, h - 0.02, 0], [w / 2, 0.02, d / 2], 0.008, 1);
  for (const sx of [-1, 1]) {
    f.box(
      'joinery',
      [sx * (w / 2 - 0.08) - 0.02, 0, -d / 2 + 0.03],
      [sx * (w / 2 - 0.08) + 0.02, h - 0.04, d / 2 - 0.03],
      { bottom: false },
    );
  }
  f.box('joinery', [-w / 2 + 0.1, 0.12, -0.015], [w / 2 - 0.1, 0.16, 0.015]);
};

const plant: Builder = (f, it) => {
  const [w, , h] = it.size;
  const r = w / 2;
  const potH = Math.min(0.4, h * 0.35);
  f.lathe(
    it.material ?? 'ceramic',
    0,
    0,
    [
      [r * 0.7, 0],
      [r, potH * 0.6],
      [r * 0.92, potH],
      [r * 0.85, potH],
      [0, potH - 0.04],
    ],
    { capStart: true },
  );
  // Sculptural leaves: a few upright elongated blobs on slender stems.
  const soil = potH - 0.04;
  const leaves = 6;
  for (let k = 0; k < leaves; k++) {
    const a = (k / leaves) * Math.PI * 2 + 0.4;
    const t = 0.55 + ((k * 7) % 5) * 0.09;
    const top = soil + (h - soil) * t;
    const lx = Math.cos(a) * r * 0.9;
    const lz = Math.sin(a) * r * 0.9;
    f.tube(
      'bark',
      [Math.cos(a) * 0.02, soil, Math.sin(a) * 0.02],
      [lx * 0.8, top - 0.12, lz * 0.8],
      0.006,
      0.005,
      5,
    );
    const c = f.p(lx, top, lz);
    blob(
      f.mesh.bucket('foliage'),
      c,
      [0.07 + r * 0.12, 0.16 + (h - soil) * 0.08, 0.07 + r * 0.12],
      k * 13 + 3,
      { amp: 0.05 },
    );
  }
};

const olive: Builder = (f, it) => {
  const [w] = it.size;
  const r = w / 2;
  const potH = 0.58;
  f.lathe(
    'clay',
    0,
    0,
    [
      [r * 0.72, 0],
      [r, potH * 0.8],
      [r * 1.02, potH],
      [r * 0.93, potH],
      [0, potH - 0.05],
    ],
    { capStart: true },
  );
  const soil = f.oy + potH - 0.05;
  buildOlive(f.mesh, f.ox, soil, f.oz, opt(it, 'seed', 7));
};

const outdoorTable: Builder = (f, it) => {
  const [w, d, h] = it.size;
  const n = 5;
  const bw = (d - (n - 1) * 0.008) / n;
  for (let i = 0; i < n; i++) {
    const z0 = -d / 2 + i * (bw + 0.008);
    f.box('timber', [-w / 2, h - 0.04, z0], [w / 2, h, z0 + bw]);
  }
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.22);
    f.box('timber', [x - 0.045, h - 0.1, -d / 2 + 0.05], [x + 0.045, h - 0.04, d / 2 - 0.05]);
    f.box('timber', [x - 0.045, 0, -d / 2 + 0.1], [x + 0.045, 0.06, d / 2 - 0.1], {
      bottom: false,
    });
    f.box('timber', [x - 0.04, 0.06, -0.05], [x + 0.04, h - 0.1, 0.05]);
  }
  f.box('timber', [-w / 2 + 0.26, 0.2, -0.03], [w / 2 - 0.26, 0.26, 0.03]);
  f.lathe(
    'clay',
    0.1,
    0,
    [
      [0.08, h],
      [0.13, h + 0.08],
      [0.1, h + 0.16],
      [0.09, h + 0.16],
    ],
    { capEnd: true },
  );
};

const outdoorBench: Builder = (f, it) => {
  const [w, d, h] = it.size;
  const n = 3;
  const bw = (d - (n - 1) * 0.008) / n;
  for (let i = 0; i < n; i++) {
    const z0 = -d / 2 + i * (bw + 0.008);
    f.box('timber', [-w / 2, h - 0.035, z0], [w / 2, h, z0 + bw]);
  }
  for (const sx of [-1, 1]) {
    const x = sx * (w / 2 - 0.2);
    f.box('timber', [x - 0.04, 0, -d / 2 + 0.03], [x + 0.04, h - 0.035, d / 2 - 0.03], {
      bottom: false,
    });
  }
};

const sideTable: Builder = (f, it) => {
  const [w, , h] = it.size;
  f.lathe('timber', 0, 0, [
    [w * 0.3, 0],
    [w * 0.3, h - 0.03],
    [w / 2, h - 0.03],
    [w / 2, h],
    [0, h],
  ]);
};

export const BUILDERS: Readonly<Record<FurnitureKind, Builder>> = {
  bed,
  bedside,
  wardrobe,
  hallJoinery,
  kitchenTall,
  kitchenRun,
  island,
  stool,
  diningTable,
  diningChair: caneChair,
  coffeeTable,
  sofa,
  armchair,
  loungeChair: (f, it) => lounge(f, it, 'smokedOak'),
  rug,
  mirror,
  pendant,
  floorLamp,
  sconce,
  stove,
  hearth,
  logStore,
  wc,
  vanity,
  showerScreen,
  showerHead,
  tub,
  towelLadder,
  boiler,
  washerStack,
  dryingRack,
  basket,
  teepee,
  cushion,
  bookLedge,
  openShelf,
  bookshelf,
  shelving,
  desk,
  deskChair: caneChair,
  daybed,
  bench,
  plant,
  olive,
  outdoorTable,
  outdoorBench,
  lounger: (f, it) => lounge(f, it, 'timber'),
  sideTable,
};
