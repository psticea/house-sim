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
  // `blindL` / `blindR`: a door-less length at the left / right end (a blind corner that
  // runs on behind a neighbouring cupboard).
  const x0 = -w / 2 + opt(it, 'blindL', 0);
  const x1 = w / 2 - opt(it, 'blindR', 0);
  f.box('smokedOak', [-w / 2 + 0.03, 0, -d / 2 + 0.02], [w / 2 - 0.03, 0.08, d / 2 - 0.06], {
    bottom: false,
  });
  f.box('joinery', [-w / 2, 0.08, -d / 2], [w / 2, h, d / 2 - 0.02]);
  const n = Math.max(1, Math.round((x1 - x0) / (low ? 0.6 : 0.5)));
  doorFronts(f, x0, x1, 0.08, h, d / 2 - 0.02, n, low ? 'h' : 'v');
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
  // Integrated fridge column: tall fridge door, freezer door below, top cupboard.
  const fx1 = w > 0.9 ? -0.003 : w / 2 - 0.003;
  f.box('joinery', [-w / 2 + 0.003, 0.103, zf], [fx1, 0.797, zf + 0.02]);
  f.box('joinery', [-w / 2 + 0.003, 0.803, zf], [fx1, 1.997, zf + 0.02]);
  f.box('joinery', [-w / 2 + 0.003, 2.003, zf], [fx1, h - 0.003, zf + 0.02]);
  const px = w > 0.9 ? -0.04 : w / 2 - 0.06;
  f.box('smokedOak', [px, 1.0, zf + 0.02], [px + 0.02, 1.6, zf + 0.032]);
  f.box('smokedOak', [px, 0.5, zf + 0.02], [px + 0.02, 0.75, zf + 0.032]);
  if (w <= 0.9) return;
  // Oven column: drawers, flush black oven, door above.
  f.box('joinery', [0.003, 0.103, zf], [w / 2 - 0.003, 0.497, zf + 0.02]);
  f.box('joinery', [0.003, 0.503, zf], [w / 2 - 0.003, 0.897, zf + 0.02]);
  f.box('metalBlack', [0.003, 0.903, zf], [w / 2 - 0.003, 1.497, zf + 0.02]);
  f.box('brass', [0.08, 1.42, zf + 0.02], [w / 2 - 0.08, 1.435, zf + 0.04]);
  f.box('joinery', [0.003, 1.503, zf], [w / 2 - 0.003, h - 0.003, zf + 0.02]);
  for (const x0 of [0.13, 0.33])
    f.box('smokedOak', [x0, 0.44, zf + 0.02], [x0 + 0.14, 0.455, zf + 0.032]);
};

const SINK_W = 0.25;
const SINK_D = 0.2;

/**
 * Travertine slab between local x0…x1 / z0…z1 (top at `top`), with an optional sink
 * cut-out centred at (sx, sz) and the integrated travertine bowl below it.
 */
function worktop(
  f: Frame,
  x0: number,
  x1: number,
  z0: number,
  z1: number,
  top: number,
  thick: number,
  sink?: readonly [number, number],
): void {
  const P = (x: number, z: number): [number, number] => {
    const q = f.p(x, 0, z);
    return [q[0], q[2]];
  };
  const outline = [P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)];
  if (!sink) {
    f.box('travertine', [x0, top - thick, z0], [x1, top, z1]);
    return;
  }
  const [sx, sz] = sink;
  const sw = SINK_W;
  const sd = SINK_D;
  f.mesh.prism(
    outline,
    f.oy + top - thick,
    f.oy + top,
    { top: 'travertine', bottom: null, sides: 'travertine' },
    [[P(sx - sw, sz - sd), P(sx + sw, sz - sd), P(sx + sw, sz + sd), P(sx - sw, sz + sd)]],
  );
  const yb = top - 0.2;
  const yt = top - thick;
  f.quad(
    'travertine',
    [sx - sw, yb, sz - sd],
    [sx + sw, yb, sz - sd],
    [sx + sw, yt, sz - sd],
    [sx - sw, yt, sz - sd],
    [0, 0, 1],
  );
  f.quad(
    'travertine',
    [sx - sw, yb, sz + sd],
    [sx + sw, yb, sz + sd],
    [sx + sw, yt, sz + sd],
    [sx - sw, yt, sz + sd],
    [0, 0, -1],
  );
  f.quad(
    'travertine',
    [sx - sw, yb, sz - sd],
    [sx - sw, yb, sz + sd],
    [sx - sw, yt, sz + sd],
    [sx - sw, yt, sz - sd],
    [1, 0, 0],
  );
  f.quad(
    'travertine',
    [sx + sw, yb, sz - sd],
    [sx + sw, yb, sz + sd],
    [sx + sw, yt, sz + sd],
    [sx + sw, yt, sz - sd],
    [-1, 0, 0],
  );
  f.quad(
    'travertine',
    [sx - sw, yb, sz - sd],
    [sx + sw, yb, sz - sd],
    [sx + sw, yb, sz + sd],
    [sx - sw, yb, sz + sd],
    [0, 1, 0],
  );
}

/** Brushed-brass gooseneck tap standing at (x, tz) on a worktop, spout toward `dir` (±z). */
function kitchenTap(f: Frame, x: number, tz: number, top: number, dir: 1 | -1): void {
  f.tube('brass', [x, top, tz], [x, top + 0.32, tz], 0.012, 0.012, 8);
  f.tube('brass', [x, top + 0.32, tz], [x, top + 0.32, tz + dir * 0.2], 0.011, 0.011, 8);
  f.tube(
    'brass',
    [x, top + 0.32, tz + dir * 0.2],
    [x, top + 0.26, tz + dir * 0.2],
    0.011,
    0.011,
    8,
  );
  f.box('brass', [x + 0.06, top, tz - 0.015], [x + 0.09, top + 0.08, tz + 0.015]);
}

/**
 * Wall cupboards over a base run (local −z = the wall), 0.35 m deep from `y0` up to `y1`:
 * oak slab doors (~0.6 m) with a slim smoked-oak finger pull on their bottom edge. Over
 * the hob (`hood` = its local x) a 0.90 m unit with an integrated extractor — a dark
 * visor flush with the doors under them; `open` bays (0.60 m) at the right (+x) end are
 * open oak shelves with ceramics and a few books.
 */
function wallCupboards(
  f: Frame,
  w: number,
  d: number,
  y0: number,
  y1: number,
  hood: number | null,
  open: number,
): void {
  const ud = 0.35;
  const zb = -d / 2;
  const zc = zb + ud - 0.02;
  const xl = -w / 2 + 0.002;
  const xr = w / 2 - 0.002;
  const xo = xr - open * 0.6;
  const segs: { a: number; b: number; hood: boolean }[] = [];
  if (hood !== null) {
    const h0 = Math.max(xl, hood - 0.45);
    const h1 = Math.min(xo, hood + 0.45);
    if (h0 > xl + 0.05) segs.push({ a: xl, b: h0, hood: false });
    segs.push({ a: h0, b: h1, hood: true });
    if (xo > h1 + 0.05) segs.push({ a: h1, b: xo, hood: false });
  } else {
    segs.push({ a: xl, b: xo, hood: false });
  }
  for (const s of segs) {
    const yb = s.hood ? y0 + 0.06 : y0;
    f.box('joinery', [s.a, yb, zb], [s.b, y1, zc]);
    const n = Math.max(1, Math.round((s.b - s.a) / 0.6));
    const dw = (s.b - s.a) / n;
    for (let i = 0; i < n; i++) {
      const a = s.a + i * dw + 0.003;
      const b = s.a + (i + 1) * dw - 0.003;
      const m = (a + b) / 2;
      f.box('joinery', [a, yb + 0.003, zc], [b, y1 - 0.003, zc + 0.02]);
      f.box('smokedOak', [m - 0.09, yb + 0.003, zc + 0.02], [m + 0.09, yb + 0.016, zc + 0.03]);
    }
    if (s.hood) f.box('metalBlack', [s.a + 0.003, y0, zb], [s.b - 0.003, y0 + 0.057, zc + 0.02]);
  }
  if (open <= 0) return;
  const t = 0.02;
  const zf = zb + ud;
  f.box('joinery', [xr - t, y0, zb], [xr, y1, zf]);
  f.box('joinery', [xo, y0, zb], [xr - t, y0 + t, zf]);
  f.box('joinery', [xo, y1 - t, zb], [xr - t, y1, zf]);
  f.box('joinery', [xo, y0 + t, zb], [xr - t, y1 - t, zb + 0.012]);
  for (let k = 1; k < open; k++) {
    const x = xo + k * 0.6;
    f.box('joinery', [x - t / 2, y0 + t, zb + 0.012], [x + t / 2, y1 - t, zf]);
  }
  const ym = (y0 + y1) / 2;
  f.box('joinery', [xo, ym - 0.01, zb + 0.012], [xr - t, ym + 0.01, zf - 0.01]);
  // Bottom shelf: a stack of ceramic bowls and a clay jar; top shelf: books + a vase.
  const jz = zb + 0.17;
  const b0 = y0 + t;
  for (let k = 0; k < 3; k++) {
    const y = b0 + k * 0.047;
    f.lathe(
      'ceramic',
      xo + 0.17,
      jz,
      [
        [0.06, y],
        [0.1, y + 0.04],
        [0.1, y + 0.045],
      ],
      { capStart: true, capEnd: true },
    );
  }
  f.lathe(
    'clay',
    xo + 0.42,
    jz,
    [
      [0.06, b0],
      [0.08, b0 + 0.1],
      [0.06, b0 + 0.2],
      [0.04, b0 + 0.24],
    ],
    { capStart: true, capEnd: true },
  );
  const s1 = ym + 0.01;
  books(f, xo + 0.03, xo + 0.3, s1, jz, 0.2, 4, 0.24);
  f.lathe(
    'ceramic',
    xo + 0.44,
    jz,
    [
      [0.045, s1],
      [0.07, s1 + 0.08],
      [0.035, s1 + 0.2],
      [0.03, s1 + 0.22],
    ],
    { capStart: true, capEnd: true },
  );
}

/**
 * Base run along a wall: smoked-oak plinth, oak fronts (60 cm modules), travertine
 * worktop + splashback. Options (local x from the centre): `hob` (flush black-glass hob,
 * with `oven` a flush black oven below and `hood` an oak-clad canopy above), `sink`
 * (cut-out bowl + tap), `shelfFrom` / `shelfTo` (open oak wall shelf with ceramics),
 * `uppers` (wall cupboards over the whole run up to that height, the hood integrated,
 * `uppersOpen` open bays at the +x end).
 */
const kitchenRun: Builder = (f, it) => {
  const [w, d] = it.size;
  const o = it.opts ?? {};
  const zf = d / 2 - 0.02;
  const top = 0.9;
  f.box('smokedOak', [-w / 2, 0, -d / 2], [w / 2, 0.1, zf - 0.06], { bottom: false });
  f.box('joinery', [-w / 2, 0.1, -d / 2], [w / 2, top - 0.04, zf], { skipTop: true });
  const hob = typeof o.hob === 'number' ? o.hob : null;
  const sink = typeof o.sink === 'number' ? o.sink : null;
  const n = Math.max(1, Math.round(w / 0.6));
  const dw = w / n;
  for (let i = 0; i < n; i++) {
    const a = -w / 2 + i * dw + 0.003;
    const b = -w / 2 + (i + 1) * dw - 0.003;
    const mid = (a + b) / 2;
    if (hob !== null && o.oven && Math.abs(mid - hob) < dw / 2) {
      // Drawer below a flush black oven with a slim brass bar.
      f.box('joinery', [a, 0.103, zf], [b, 0.247, zf + 0.02]);
      f.box('metalBlack', [a, 0.253, zf], [b, top - 0.063, zf + 0.02]);
      f.box('brass', [a + 0.08, top - 0.14, zf + 0.02], [b - 0.08, top - 0.125, zf + 0.04]);
      continue;
    }
    // Two drawers over a door every other module, plain doors otherwise.
    const split = i % 2 === 1 ? [0.103, 0.497, top - 0.063] : [0.103, top - 0.063];
    for (let k = 0; k + 1 < split.length; k++) {
      const y0 = split[k]!;
      const y1 = split[k + 1]!;
      f.box('joinery', [a, y0 + (k ? 0.003 : 0), zf], [b, y1 - 0.003, zf + 0.02]);
      f.box('smokedOak', [mid - 0.1, y1 - 0.05, zf + 0.02], [mid + 0.1, y1 - 0.035, zf + 0.032]);
    }
  }
  worktop(
    f,
    -w / 2,
    w / 2,
    -d / 2,
    d / 2 + 0.01,
    top,
    0.04,
    sink === null ? undefined : [sink, -0.01],
  );
  if (sink !== null) kitchenTap(f, sink, -0.01 - SINK_D - 0.06, top, 1);
  f.box('travertine', [-w / 2, top, -d / 2], [w / 2, top + 0.6, -d / 2 + 0.015]);
  const uppers = typeof o.uppers === 'number' ? o.uppers : null;
  if (hob !== null) {
    f.box('metalBlack', [hob - 0.3, top, -0.24], [hob + 0.3, top + 0.006, 0.24]);
    if (o.hood && uppers === null) {
      // Oak-clad canopy hood with a black filter strip.
      f.box('joinery', [hob - 0.45, 1.72, -d / 2 + 0.015], [hob + 0.45, 2.4, -d / 2 + 0.5]);
      f.box('metalBlack', [hob - 0.4, 1.715, -d / 2 + 0.05], [hob + 0.4, 1.72, -d / 2 + 0.45]);
    }
  }
  if (uppers !== null) {
    const open = typeof o.uppersOpen === 'number' ? o.uppersOpen : 0;
    wallCupboards(f, w, d, top + 0.6, uppers, hob !== null && o.hood ? hob : null, open);
  }
  if (typeof o.shelfFrom === 'number' && typeof o.shelfTo === 'number') {
    const s0 = o.shelfFrom;
    const s1 = o.shelfTo;
    const sy = top + 0.6;
    f.box('joinery', [s0, sy, -d / 2 + 0.015], [s1, sy + 0.04, -d / 2 + 0.27]);
    const jz = -d / 2 + 0.14;
    const y = sy + 0.04;
    f.lathe(
      'ceramic',
      s0 + 0.25,
      jz,
      [
        [0.07, y],
        [0.075, y + 0.2],
        [0.05, y + 0.24],
      ],
      { capEnd: true },
    );
    f.lathe(
      'clay',
      s0 + 0.43,
      jz,
      [
        [0.05, y],
        [0.09, y + 0.12],
        [0.04, y + 0.26],
        [0.03, y + 0.3],
      ],
      { capEnd: true },
    );
    books(f, s0 + 0.75, s0 + 0.98, y, jz, 0.18, 3, 0.24);
    f.lathe(
      'ceramic',
      s1 - 0.7,
      jz,
      [
        [0.1, y],
        [0.12, y + 0.05],
        [0.12, y + 0.06],
      ],
      { capEnd: true },
    );
    f.lathe(
      'ceramic',
      s1 - 0.7,
      jz,
      [
        [0.1, y + 0.06],
        [0.12, y + 0.11],
        [0.12, y + 0.12],
      ],
      { capEnd: true },
    );
    f.lathe(
      'clay',
      s1 - 0.3,
      jz,
      [
        [0.06, y],
        [0.08, y + 0.1],
        [0.05, y + 0.18],
      ],
      { capEnd: true },
    );
  }
  // A few things on the worktop: chopping board, ceramic jars.
  const bx = hob !== null ? hob + 0.75 : 0;
  f.box('smokedOak', [bx - 0.2, top, -d / 2 + 0.03], [bx + 0.2, top + 0.025, -d / 2 + 0.06]);
  f.tiltedBox('joinery', [bx, top + 0.2, -d / 2 + 0.09], [0.18, 0.2, 0.012], 0.12);
  for (const [k, jx] of [0.32, 0.45].entries()) {
    f.lathe(
      'ceramic',
      bx + jx,
      -d / 2 + 0.12,
      [
        [0.055, top],
        [0.055, top + 0.16 - k * 0.04],
        [0.04, top + 0.18 - k * 0.04],
      ],
      { capEnd: true },
    );
  }
};

/**
 * Kitchen island: travertine top with waterfall ends, oak drawers on the kitchen side
 * (local −z), an optional sink (`sink` = local x, `sinkZ`) with the tap toward +z, and an
 * open shelf strip of depth `shelf` on the living side (+z) with books and ceramics.
 */
const island: Builder = (f, it) => {
  const [w, d, h] = it.size;
  const o = it.opts ?? {};
  const shelf = typeof o.shelf === 'number' ? o.shelf : 0;
  const t = 0.04;
  const zc = d / 2 - shelf;
  for (const sx of [-1, 1]) {
    const x0 = sx < 0 ? -w / 2 : w / 2 - t;
    f.box('travertine', [x0, 0, -d / 2], [x0 + t, h - 0.05, d / 2], { bottom: false });
  }
  const sink =
    typeof o.sink === 'number'
      ? ([o.sink, typeof o.sinkZ === 'number' ? o.sinkZ : -d / 2 + 0.3] as const)
      : undefined;
  worktop(f, -w / 2, w / 2, -d / 2, d / 2, h, 0.05, sink);
  if (sink) kitchenTap(f, sink[0], sink[1] + SINK_D + 0.05, h, -1);
  f.box('smokedOak', [-w / 2 + t, 0, -d / 2 + 0.06], [w / 2 - t, 0.1, zc - 0.02], {
    bottom: false,
  });
  f.box('joinery', [-w / 2 + t, 0.1, -d / 2 + 0.02], [w / 2 - t, h - 0.05, zc]);
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
  if (shelf > 0) {
    // Open oak niches toward the living room: base, middle shelf, two dividers.
    const z0 = zc;
    const z1 = d / 2 - 0.01;
    f.box('smokedOak', [-w / 2 + t, 0, z0], [w / 2 - t, 0.1, z1 - 0.04], { bottom: false });
    f.box('joinery', [-w / 2 + t, 0.1, z0], [w / 2 - t, 0.13, z1]);
    f.box('joinery', [-w / 2 + t, 0.47, z0], [w / 2 - t, 0.5, z1]);
    for (const x of [-(w - 2 * t) / 6, (w - 2 * t) / 6])
      f.box('joinery', [x - 0.012, 0.13, z0], [x + 0.012, h - 0.05, z1]);
    const zm = (z0 + z1) / 2;
    const span = (w - 2 * t) / 3;
    books(f, -w / 2 + t + 0.04, -w / 2 + t + span * 0.7, 0.13, zm, shelf * 0.7, 11, 0.3);
    f.lathe(
      'ceramic',
      0,
      zm,
      [
        [0.08, 0.13],
        [0.11, 0.24],
        [0.06, 0.34],
        [0.05, 0.36],
      ],
      { capEnd: true },
    );
    f.box('cane', [w / 2 - t - span + 0.05, 0.13, z0 + 0.03], [w / 2 - t - 0.05, 0.42, z1 - 0.03]);
    books(f, -w / 2 + t + 0.06, -w / 2 + t + span * 0.5, 0.5, zm, shelf * 0.7, 4, 0.28);
    f.lathe(
      'clay',
      span * 0.2,
      zm,
      [
        [0.06, 0.5],
        [0.09, 0.58],
        [0.05, 0.72],
        [0.04, 0.75],
      ],
      { capEnd: true },
    );
    books(f, w / 2 - t - span + 0.08, w / 2 - t - 0.1, 0.5, zm, shelf * 0.7, 19, 0.3);
  }
  // A shallow ceramic fruit bowl on the top.
  f.lathe('ceramic', w / 2 - 0.4, d / 2 - 0.3, [
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
  if (opt(it, 'legs', 'corners') === 'end') {
    // Joined to the island at its −x end: one solid oak slab leg at the +x end and a
    // recessed rail under the top, so the chairs tuck in freely.
    f.box('joinery', [w / 2 - 0.1, 0, -d / 2 + 0.06], [w / 2 - 0.04, h - 0.05, d / 2 - 0.06], {
      bottom: false,
    });
    f.box('joinery', [-w / 2, h - 0.12, -0.03], [w / 2 - 0.1, h - 0.05, 0.03]);
  } else {
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
      f.box(
        'joinery',
        [sx * lx - 0.02, h - 0.13, -lz + 0.04],
        [sx * lx + 0.02, h - 0.05, lz - 0.04],
      );
    }
    for (const sz of [-1, 1])
      f.box(
        'joinery',
        [-lx + 0.04, h - 0.13, sz * lz - 0.02],
        [lx - 0.04, h - 0.05, sz * lz + 0.02],
      );
  }
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
  const arm = opt(it, 'arm', 0.22);
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
  if (opt(it, 'round', false)) {
    // Round black stove (plan symbol Ø 51) around the flue: short legs, body, top plate,
    // a curved fire window toward the front and a brass handle.
    const r = w / 2;
    for (let k = 0; k < 3; k++) {
      const a = Math.PI / 2 + ((k + 0.5) / 3) * Math.PI * 2;
      f.tube(
        'metalBlack',
        [Math.cos(a) * r * 0.7, 0, Math.sin(a) * r * 0.7],
        [Math.cos(a) * r * 0.7, 0.12, Math.sin(a) * r * 0.7],
        0.018,
        0.018,
        6,
      );
    }
    f.lathe(
      'metalBlack',
      0,
      0,
      [
        [r * 0.92, 0.12],
        [r, 0.16],
        [r, h - 0.04],
        [r * 0.96, h],
        [0, h],
      ],
      { capStart: true },
    );
    const win: [number, number][] = [
      [r + 0.004, 0.38],
      [r + 0.004, h - 0.22],
    ];
    f.lathe('clay', 0, 0, win, { n: 16, skip: [0, 1, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] });
    f.box('brass', [r * 0.55, 0.5, r * 0.82], [r * 0.55 + 0.015, 0.68, r * 0.82 + 0.03]);
    return;
  }
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
  if (opt(it, 'bidet', false)) {
    // Wall-hung bidet: open bowl rim and a brass deck tap instead of the seat and plate.
    f.rbox('ceramic', [0, 0.418, zb + 0.29], [w / 2 - 0.01, 0.004, 0.24], 0.004, 1);
    f.tube('brass', [0, 0.44, zb + 0.12], [0, 0.5, zb + 0.12], 0.012, 0.012, 8);
    f.tube('brass', [0, 0.5, zb + 0.12], [0, 0.5, zb + 0.2], 0.01, 0.01, 8);
    return;
  }
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
  const shelves = Math.max(2, Math.round((h - 0.03) / 0.36));
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
  const ped = opt(it, 'pedestal', 0);
  if (ped > 0) {
    // Long desk: 4 cm solid oak top, a drawer pedestal at the left end, a slim oak panel
    // leg at the right end and a rail under the top along the wall (knee room between).
    f.rbox('joinery', [0, h - 0.02, 0], [w / 2, 0.02, d / 2], 0.008, 1);
    const px = -w / 2 + ped;
    const zf = d / 2 - 0.03;
    f.box('smokedOak', [-w / 2 + 0.02, 0, -d / 2 + 0.03], [px - 0.02, 0.06, zf - 0.04], {
      bottom: false,
    });
    f.box('joinery', [-w / 2, 0.06, -d / 2], [px, h - 0.04, zf]);
    const ys = [0.06, 0.3, 0.52, h - 0.04];
    const mx = (-w / 2 + px) / 2;
    for (let k = 0; k + 1 < ys.length; k++) {
      const y1 = ys[k + 1]!;
      f.box('joinery', [-w / 2 + 0.003, ys[k]! + 0.003, zf], [px - 0.003, y1 - 0.003, zf + 0.018]);
      f.box('smokedOak', [mx - 0.07, y1 - 0.035, zf + 0.018], [mx + 0.07, y1 - 0.023, zf + 0.028]);
    }
    f.box('joinery', [w / 2 - 0.035, 0, -d / 2 + 0.01], [w / 2, h - 0.04, d / 2 - 0.06], {
      bottom: false,
    });
    f.box('joinery', [px, h - 0.12, -d / 2], [w / 2 - 0.035, h - 0.04, -d / 2 + 0.025]);
    books(f, -w / 2 + 0.12, -w / 2 + 0.36, h, -d / 2 + 0.1, 0.15, 2, 0.2);
  } else {
    f.rbox('joinery', [0, h - 0.018, 0], [w / 2, 0.018, d / 2], 0.008, 1);
    for (const sx of [-1, 1]) {
      f.box(
        'joinery',
        [sx * (w / 2 - 0.05) - 0.02, 0, -d / 2 + 0.05],
        [sx * (w / 2 - 0.05) + 0.02, h - 0.036, d / 2 - 0.05],
        { bottom: false },
      );
    }
    f.box(
      'joinery',
      [w / 2 - 0.5, h - 0.15, -d / 2 + 0.05],
      [w / 2 - 0.08, h - 0.036, d / 2 - 0.03],
    );
    f.box(
      'smokedOak',
      [w / 2 - 0.36, h - 0.1, d / 2 - 0.03],
      [w / 2 - 0.22, h - 0.088, d / 2 - 0.018],
    );
    books(f, w / 2 - 0.26, w / 2 - 0.12, h, -d / 2 + 0.1, 0.15, 2, 0.2);
  }
  if (opt(it, 'lamp', false)) {
    // Bronze task lamp (pulled to the end of the desk when there is a screen, or at
    // `lampX` from the centre).
    const x = opt(it, 'lampX', -w / 2 + (opt(it, 'monitor', false) ? 0.09 : 0.2));
    const reach = opt(it, 'monitor', false) ? 0.08 : 0.2;
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
    f.tube(
      'brass',
      [x + 0.05, h + 0.38, z + 0.02],
      [x + 0.05 + reach, h + 0.4, z + 0.12],
      0.007,
      0.007,
      6,
    );
    f.lathe(
      'brass',
      x + 0.07 + reach,
      z + 0.13,
      [
        [0.07, h + 0.3],
        [0.02, h + 0.4],
        [0.01, h + 0.41],
      ],
      { capStart: true },
    );
  }
  if (opt(it, 'monitor', false)) {
    // Slim black screen on a brass foot (the plans draw a screen + keyboard on the desk).
    f.box('brass', [-0.06, h, -d / 2 + 0.08], [0.14, h + 0.012, -d / 2 + 0.2]);
    f.box('brass', [0.025, h, -d / 2 + 0.11], [0.055, h + 0.2, -d / 2 + 0.13]);
    f.tiltedBox('metalBlack', [0.04, h + 0.36, -d / 2 + 0.14], [0.26, 0.17, 0.012], 0.08);
    f.box('ceramic', [-0.22, h, -d / 2 + 0.28], [0.22, h + 0.012, -d / 2 + 0.42]);
  }
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

/** Upholstered module (the sofa's chaise / ottoman): base, seat cushion, a folded throw. */
const ottoman: Builder = (f, it) => {
  const [w, d, h] = it.size;
  f.box('smokedOak', [-w / 2 + 0.06, 0, -d / 2 + 0.06], [w / 2 - 0.06, 0.05, d / 2 - 0.06], {
    bottom: false,
  });
  f.rbox('linen', [0, 0.16, 0], [w / 2 - 0.01, 0.11, d / 2 - 0.01], 0.05);
  f.rbox('linen', [0, h - 0.08, 0], [w / 2 - 0.02, 0.075, d / 2 - 0.02], 0.06);
  // Folded wool throw over the outer edge.
  f.rbox('wool', [w / 2 - 0.26, h + 0.012, 0.02], [0.26, 0.025, d / 2 - 0.08], 0.02, 1);
  f.rbox('wool', [w / 2 + 0.008, h - 0.13, 0.02], [0.022, 0.15, d / 2 - 0.08], 0.02, 1);
};

/**
 * Round sculptural lounge chair (plan symbol: rounded shell with seat + back cushions):
 * bouclé shell revolved around the seat, open toward the front (+z), on a low oak plinth.
 */
const tubChair: Builder = (f, it) => {
  const [w, d] = it.size;
  const r = w / 2;
  const sq = d / w;
  const n = 16;
  f.lathe(
    'smokedOak',
    0,
    0,
    [
      [r * 0.62, 0],
      [r * 0.62, 0.08],
      [0, 0.08],
    ],
    { n, squash: sq },
  );
  // Shell cross-section (radius, y): outer wall up to the rim, inner wall down to the
  // seat. The front four of 16 segments stay open; the two cut ends are capped.
  const ro = r;
  const ri = r - 0.15;
  const prof: [number, number][] = [
    [ro * 0.86, 0.08],
    [ro, 0.3],
    [ro * 0.98, 0.62],
    [ro * 0.9, 0.7],
    [ri + 0.03, 0.7],
    [ri, 0.62],
    [ri, 0.3],
  ];
  const open = [2, 3, 4, 5];
  f.lathe('wool', 0, 0, [...prof, prof[0]!], { n, squash: sq, skip: open });
  const cr = prof.reduce((s, q) => s + q[0], 0) / prof.length;
  const cy = prof.reduce((s, q) => s + q[1], 0) / prof.length;
  const bucket = f.mesh.bucket('wool');
  for (const k of [open[0]!, open[open.length - 1]! + 1]) {
    const a = (k / n) * Math.PI * 2;
    const pt = (rad: number, y: number): V3 => f.p(Math.cos(a) * rad, y, Math.sin(a) * rad * sq);
    const t = k === open[0] ? 1 : -1;
    const facing = f.v(-Math.sin(a) * t, 0, Math.cos(a) * sq * t);
    for (let i = 0; i < prof.length; i++) {
      const p0 = prof[i]!;
      const p1 = prof[(i + 1) % prof.length]!;
      bucket.tri(pt(cr, cy), pt(p0[0], p0[1]), pt(p1[0], p1[1]), facing);
    }
  }
  // Seat (round cushion on a base) and a soft back cushion against the shell.
  f.lathe(
    'wool',
    0,
    0,
    [
      [ri + 0.01, 0.08],
      [ri + 0.01, 0.3],
      [0, 0.3],
    ],
    { n, squash: sq },
  );
  f.lathe(
    'linen',
    0,
    0.02,
    [
      [ri - 0.02, 0.3],
      [ri, 0.36],
      [ri - 0.04, 0.42],
      [0, 0.43],
    ],
    {
      n,
      squash: sq,
    },
  );
  f.rbox('linen', [0, 0.55, -ri * sq + 0.1], [ri * 0.75, 0.16, 0.08], 0.07, 2, 0.25);
};

/** Washer + dryer side by side under an oak worktop, open oak shelf with baskets above. */
const laundryRun: Builder = (f, it) => {
  const [w, d, h] = it.size;
  const mw = Math.min(0.6, w / 2);
  for (const sx of [-1, 1]) {
    const cx = sx * (w / 2 - mw / 2);
    f.rbox('ceramic', [cx, 0.43, -0.01], [mw / 2 - 0.01, 0.42, d / 2 - 0.03], 0.015, 1);
    f.box(
      'metalBlack',
      [cx - mw / 2 + 0.04, 0.74, d / 2 - 0.04],
      [cx + mw / 2 - 0.04, 0.8, d / 2 - 0.032],
    );
    f.wallDisc('mirror', 'metalBlack', [cx, 0.4, d / 2 - 0.04], 0.17, 0.025, 0.03);
  }
  f.box('joinery', [-w / 2, h - 0.03, -d / 2], [w / 2, h, d / 2]);
  const sy = 1.55;
  f.box('joinery', [-w / 2, sy, -d / 2], [w / 2, sy + 0.03, -d / 2 + 0.3]);
  for (const [k, x] of [-w / 2 + 0.2, -w / 2 + 0.52].entries())
    f.box(
      'cane',
      [x - 0.13, sy + 0.03, -d / 2 + 0.03],
      [x + 0.13, sy + 0.25 - k * 0.04, -d / 2 + 0.27],
    );
  f.lathe(
    'ceramic',
    w / 2 - 0.25,
    -d / 2 + 0.15,
    [
      [0.06, sy + 0.03],
      [0.07, sy + 0.2],
      [0.04, sy + 0.24],
    ],
    { capEnd: true },
  );
  f.lathe('cane', w / 2 - 0.3, 0, [
    [0.16, h],
    [0.19, h + 0.2],
    [0.18, h + 0.2],
    [0.14, h + 0.02],
    [0, h + 0.015],
  ]);
  f.rbox('linen', [w / 2 - 0.3, h + 0.18, 0], [0.15, 0.03, 0.15], 0.025);
};

/** Framed print on a wall: oak frame, linen mount, a calm abstract in two earthy tones. */
const print: Builder = (f, it) => {
  const [w, d, h] = it.size;
  const y0 = it.y ?? 1.3;
  const zb = -d / 2;
  const fw = 0.025;
  f.box('joinery', [-w / 2, y0, zb], [w / 2, y0 + fw, zb + d]);
  f.box('joinery', [-w / 2, y0 + h - fw, zb], [w / 2, y0 + h, zb + d]);
  f.box('joinery', [-w / 2, y0 + fw, zb], [-w / 2 + fw, y0 + h - fw, zb + d]);
  f.box('joinery', [w / 2 - fw, y0 + fw, zb], [w / 2, y0 + h - fw, zb + d]);
  f.box('linen', [-w / 2 + fw, y0 + fw, zb], [w / 2 - fw, y0 + h - fw, zb + d * 0.5]);
  const art = it.material ?? 'clay';
  const m = Math.min(w, h) * 0.18;
  const ax0 = -w / 2 + m;
  const ax1 = w / 2 - m;
  const ay0 = y0 + m;
  const ay1 = y0 + h - m;
  const split = ay0 + (ay1 - ay0) * opt(it, 'split', 0.42);
  f.box(art, [ax0, ay0, zb + d * 0.5], [ax1, split, zb + d * 0.55]);
  f.box('wool', [ax0, split, zb + d * 0.5], [ax1, ay1, zb + d * 0.55]);
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
  ottoman,
  tubChair,
  laundryRun,
  print,
};
