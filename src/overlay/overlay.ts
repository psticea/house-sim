/**
 * DEV ONLY (overlay.html): the generated model drawn over the locally rendered plan
 * sheets (.plans-cache/, never committed or deployed; served by a dev-server middleware
 * at /__plans/, see vite.config.ts).
 *
 * `?sheet=` 04 / 05 / 06 — horizontal section 1 m above the level's floor (plan cut);
 * 07 — top view of the roof (feature edges of roof sheet, seams, windows, gutters, snow
 * guards, chimney, canopy, sunshade); 08e / 08w / 09 / 10 — orthographic elevations
 * (east / west / north / south) rendered with WebGL at the sheet's scale.
 */
import * as THREE from 'three';
import {
  FIRE_PIT,
  GARDEN_ZONES,
  GRAVEL,
  MEADOWS,
  RAISED_BEDS,
  SHRUBS,
  TREES,
  fencePerimeter,
} from '../data/garden';
import { house } from '../data/house';
import type { LevelId, MaterialId } from '../data/schema';
import { levelById } from '../data/topology';
import { buildGeometry, buildWorld } from '../world/build';
import { sectionSegments } from '../world/section';
import { extractFeatureEdges } from '../world/style/edges';

const S = (20 / 25.4) * 72; // 1:50 — points per metre

type Sheet =
  | { kind: 'plan'; id: string; x0: number; z0: number; level: LevelId; cut: number }
  | { kind: 'roof'; id: string; x0: number; z0: number }
  | {
      /** Site plan 1:200, rotated on the page: NW house corner (−0.275, −0.275) at `nw` pt. */
      kind: 'site';
      id: string;
      nw: [number, number];
      rotDeg: number;
    }
  | {
      kind: 'elevation';
      id: string;
      /** Sheet x (pt) of view coordinate u = 0 and of level ±0.00 (y pt). */
      a: number;
      y0: number;
      /** View direction (camera looks along it) and u axis (screen right). */
      look: [number, number, number];
      u: [number, number, number];
      uRange: [number, number];
    };

// Calibrations measured on the vector geometry (grid axes on plans, facade edges and
// level lines on the elevations; see src/data/*.ts headers).
const SHEETS: Record<string, Sheet> = {
  // Site plan: house outline corner fitted on the vector geometry (see src/data/site.ts).
  '03': { kind: 'site', id: '03', nw: [616.213, 219.279], rotDeg: 7.68 },
  '04': { kind: 'plan', id: '04', x0: 200.25, z0: 60.65, level: 'basement', cut: 1.0 },
  '05': { kind: 'plan', id: '05', x0: 184.165, z0: 258.745, level: 'ground', cut: 1.0 },
  '06': { kind: 'plan', id: '06', x0: 195.16, z0: 256.575, level: 'upper', cut: 0.95 },
  '07': { kind: 'roof', id: '07', x0: 217.375, z0: 259.685 },
  // South: facade x −0.33 at 173.23 pt, ±0.00 at 534.7 pt, east to the right.
  '10': {
    kind: 'elevation',
    id: '10',
    a: 173.23 + 0.33 * S,
    y0: 534.7,
    look: [0, 0, -1],
    u: [1, 0, 0],
    uRange: [-3, 21],
  },
  // North: facade x 18.38 at 170.23 pt, ±0.00 at 521.9 pt, west to the right.
  '09': {
    kind: 'elevation',
    id: '09',
    a: 170.23 + 18.38 * S,
    y0: 521.9,
    look: [0, 0, 1],
    u: [-1, 0, 0],
    uRange: [-21, 3],
  },
  // East (left drawing of sheet 08): south face z 7.58 at 182.0 pt, north to the right.
  '08e': {
    kind: 'elevation',
    id: '08',
    a: 182.0 + 7.58 * S,
    y0: 534.3,
    look: [-1, 0, 0],
    u: [0, 0, -1],
    uRange: [-10, 3],
  },
  // West (right drawing of sheet 08): north face z −0.33 at 1125.44 pt, south to the right.
  '08w': {
    kind: 'elevation',
    id: '08',
    a: 1125.44 + 0.33 * S,
    y0: 534.3,
    look: [1, 0, 0],
    u: [0, 0, 1],
    uRange: [-3, 10],
  },
};

const COLORS: Partial<Record<MaterialId, string>> = {
  plaster: '#e0271f',
  plasterExterior: '#e0271f',
  cladMetal: '#e0271f',
  cladWood: '#e0271f',
  frame: '#1f5fe0',
  glass: '#1fb3e0',
  doorLeaf: '#1f9e3a',
  oak: '#b87a00',
  concrete: '#8a3fc2',
  woodSlat: '#8a3fc2',
  metalBlack: '#000000',
  roofMetal: '#e0271f',
};

async function loadRaster(id: string): Promise<{ img: HTMLImageElement; scale: number } | null> {
  try {
    const res = await fetch(`/__plans/sheet-${id}@4x.json`);
    if (!res.ok) return null;
    const meta = (await res.json()) as { scale: number };
    const img = new Image();
    img.src = `/__plans/sheet-${id}@4x.png`;
    await img.decode();
    return { img, scale: meta.scale };
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const sheet = SHEETS[params.get('sheet') ?? '05'] ?? SHEETS['05']!;
  // The 1:200 site view spans ~40 m: cap the scale so the canvas stays screen-sized.
  const pxPerM = Math.min(Number(params.get('ppm') ?? '90'), sheet.kind === 'site' ? 42 : Infinity);
  const alpha = Number(params.get('alpha') ?? '0.85');
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  const status = document.getElementById('status')!;
  const raster = await loadRaster(sheet.id);
  if (!raster)
    status.textContent = `Plan raster not found — run \`npm run plans:render -- 4 ${sheet.id}\` (local only).`;

  // View window in metres: h = horizontal view coordinate, v = vertical (down on screen
  // for plans = +z, up for elevations = +y).
  const view =
    sheet.kind === 'elevation'
      ? { h0: sheet.uRange[0], h1: sheet.uRange[1], v0: -1.5, v1: 9 }
      : sheet.kind === 'site'
        ? { h0: -13, h1: 28, v0: -5, v1: 19 }
        : { h0: -3, h1: 21, v0: -4, v1: 10.5 };
  const W = Math.round((view.h1 - view.h0) * pxPerM);
  const H = Math.round((view.v1 - view.v0) * pxPerM);
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);

  // 1) Sheet raster, cropped to the view window.
  if (raster) {
    const k = raster.scale;
    ctx.globalAlpha = 0.55;
    if (sheet.kind === 'site') {
      // Page (pt) → house frame: rotate by rotDeg about the NW corner, 1:200 scale.
      const S200 = S / 4;
      const c = Math.cos((sheet.rotDeg * Math.PI) / 180);
      const s = Math.sin((sheet.rotDeg * Math.PI) / 180);
      const [nx, ny] = sheet.nw;
      const m = pxPerM / (S200 * k);
      ctx.setTransform(
        m * c,
        -m * s,
        m * s,
        m * c,
        pxPerM * ((-nx * c - ny * s) / S200 - 0.275 - view.h0),
        pxPerM * ((nx * s - ny * c) / S200 - 0.275 - view.v0),
      );
      ctx.drawImage(raster.img, 0, 0);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
    } else if (sheet.kind === 'elevation') {
      const sx = (sheet.a + view.h0 * S) * k;
      const sy = (sheet.y0 - view.v1 * S) * k;
      ctx.drawImage(
        raster.img,
        sx,
        sy,
        (view.h1 - view.h0) * S * k,
        (view.v1 - view.v0) * S * k,
        0,
        0,
        W,
        H,
      );
    } else {
      const sx = (sheet.x0 + view.h0 * S) * k;
      const sy = (sheet.z0 + view.v0 * S) * k;
      ctx.drawImage(
        raster.img,
        sx,
        sy,
        (view.h1 - view.h0) * S * k,
        (view.v1 - view.v0) * S * k,
        0,
        0,
        W,
        H,
      );
    }
    ctx.globalAlpha = 1;
  }

  const toPx = (h: number, v: number): [number, number] => [
    (h - view.h0) * pxPerM,
    (v - view.v0) * pxPerM,
  ];
  const line = (a: [number, number], b: [number, number], color: string): void => {
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(...toPx(...a));
    ctx.lineTo(...toPx(...b));
    ctx.stroke();
  };

  let info: string;
  if (sheet.kind === 'site') {
    // 2) Site data: lot, paving/deck, house outline, fence (runs + gates), planting, features.
    const poly = (
      p: readonly (readonly [number, number])[],
      color: string,
      dash: number[] = [],
    ) => {
      ctx.strokeStyle = color;
      ctx.setLineDash(dash);
      ctx.beginPath();
      p.forEach(([x, z], i) => (i ? ctx.lineTo(...toPx(x, z)) : ctx.moveTo(...toPx(x, z))));
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);
    };
    const ring = (x: number, z: number, r: number, color: string) => {
      ctx.strokeStyle = color;
      ctx.beginPath();
      ctx.arc(...toPx(x, z), r * pxPerM, 0, Math.PI * 2);
      ctx.stroke();
    };
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.6;
    poly(house.site.lot, '#0a8f5a', [8, 5]);
    for (const p of house.site.patches) poly(p.polygon, '#1f5fe0');
    poly(
      [
        [-0.33, -0.33],
        [18.38, -0.33],
        [18.38, 7.58],
        [-0.33, 7.58],
      ],
      '#e0271f',
    );
    for (const g of GRAVEL) poly(g.polygon, '#8a3fc2');
    for (const b of RAISED_BEDS)
      poly([b.min, [b.max[0], b.min[1]], b.max, [b.min[0], b.max[1]]], '#b87a00');
    for (const m of MEADOWS) poly(m.polygon, '#b8a100', [3, 3]);
    ctx.lineWidth = 3;
    for (const s of fencePerimeter()) {
      line([s.a[0], s.a[1]], [s.b[0], s.b[1]], s.kind === 'gate' ? '#e01fb3' : '#000000');
    }
    ctx.lineWidth = 1.6;
    for (const t of TREES) {
      ring(t.x, t.z, 1.0, '#0a5f2a');
      ring(t.x, t.z, t.trunkR, '#0a5f2a');
    }
    for (const s of SHRUBS) ring(s.x, s.z, s.r, '#3f8f2a');
    ring(FIRE_PIT.x, FIRE_PIT.z, FIRE_PIT.r, '#e0271f');
    ctx.fillStyle = '#0a8f5a';
    ctx.font = '600 12px system-ui';
    for (const zn of GARDEN_ZONES) {
      const cx = zn.polygon.reduce((a, p) => a + p[0], 0) / zn.polygon.length;
      const cz = zn.polygon.reduce((a, p) => a + p[1], 0) / zn.polygon.length;
      ctx.fillText(zn.name, ...toPx(cx - 1, cz));
    }
    info =
      'Sheet 03: site data over the plan (1:200). Dashed green = lot, blue = paving/deck, red = house outline, black = fence, magenta = gates, green rings = trees (Ø 2.0 plan symbols) / shrubs, purple = gravel, ochre = beds / meadow.';
  } else if (sheet.kind === 'plan') {
    // 2) Generated geometry cut 1 m above the level's floor (like the plan cut).
    const level = levelById(house, sheet.level);
    const y = level.floorY + sheet.cut;
    const { mesh } = buildGeometry(house, { site: false });
    const segs = sectionSegments(mesh.toGeometries(), y);
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.6;
    for (const s of segs) {
      const color = COLORS[s.material];
      if (color) line(s.a, s.b, color);
    }
    // 3) Room polygons (data) dashed + names.
    ctx.setLineDash([6, 4]);
    ctx.fillStyle = '#0a8f5a';
    ctx.font = '600 13px system-ui';
    for (const r of level.rooms) {
      ctx.strokeStyle = '#0a8f5a';
      ctx.beginPath();
      r.polygon.forEach(([x, z], i) => (i ? ctx.lineTo(...toPx(x, z)) : ctx.moveTo(...toPx(x, z))));
      ctx.closePath();
      ctx.stroke();
      const cx = r.polygon.reduce((acc, p) => acc + p[0], 0) / r.polygon.length;
      const cz = r.polygon.reduce((acc, p) => acc + p[1], 0) / r.polygon.length;
      ctx.fillText(r.name, ...toPx(cx - 0.8, cz + 0.6));
    }
    ctx.setLineDash([]);
    info = `Sheet ${sheet.id}: section at ${y.toFixed(2)} m, ${segs.length} segments. Red = walls, blue = frames/glass, green = door leaves, black = rails, dashed = rooms.`;
  } else if (sheet.kind === 'roof') {
    // 2) Top view of the roof-level feature edges (everything above +2.4 m).
    const { mesh } = buildGeometry(house, { site: false });
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1.2;
    let n = 0;
    for (const [id, g] of mesh.toGeometries()) {
      const color = COLORS[id];
      if (!color || !['roofMetal', 'metalBlack', 'glass', 'cladWood', 'cladMetal'].includes(id))
        continue;
      const e = extractFeatureEdges(g, 30);
      for (let i = 0; i < e.length; i += 6) {
        if (Math.min(e[i + 1]!, e[i + 4]!) < 2.4) continue;
        // Skip edges seen end-on (vertical in plan).
        if (Math.hypot(e[i + 3]! - e[i]!, e[i + 5]! - e[i + 2]!) < 0.01) continue;
        line([e[i]!, e[i + 2]!], [e[i + 3]!, e[i + 5]!], color);
        n++;
      }
    }
    info = `Sheet 07: roof top view, ${n} feature edges above +2.40 (red = sheet/seams/gutters, black = windows/snow guards/chimney, cyan = glass).`;
  } else {
    // 2) Orthographic elevation (WebGL), same scale, transparent background.
    const world = buildWorld(house, { site: false });
    const scene = new THREE.Scene();
    scene.add(world.group);
    scene.add(new THREE.HemisphereLight('#ffffff', '#666666', 2.2));
    const sun = new THREE.DirectionalLight('#ffffff', 1.4);
    sun.position.set(-sheet.look[0] * 10 + 3, 12, -sheet.look[2] * 10 + 2);
    scene.add(sun);
    const [ux, , uz] = sheet.u;
    const hc = (view.h0 + view.h1) / 2;
    const vc = (view.v0 + view.v1) / 2;
    const cam = new THREE.OrthographicCamera(
      -(view.h1 - view.h0) / 2,
      (view.h1 - view.h0) / 2,
      (view.v1 - view.v0) / 2,
      -(view.v1 - view.v0) / 2,
      0.1,
      200,
    );
    // Camera: screen centre at u = hc, y = vc; 60 m in front of the house.
    const c = new THREE.Vector3(0, vc, 0);
    if (sheet.look[2] !== 0) {
      c.x = ux * hc;
      c.z = 3.6 - sheet.look[2] * 60;
    } else {
      c.z = uz * hc;
      c.x = 9 - sheet.look[0] * 60;
    }
    cam.position.copy(c);
    cam.up.set(0, 1, 0);
    cam.lookAt(c.x + sheet.look[0], c.y, c.z + sheet.look[2]);
    const gl = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    gl.setSize(W, H, false);
    gl.setClearColor(0x000000, 0);
    // Hide the site (lawn, field, road…) so the facade reads over the sheet.
    world.group.traverse((o) => {
      if (['lawn', 'field', 'asphalt', 'pavers', 'stone'].includes(o.name)) o.visible = false;
    });
    gl.render(scene, cam);
    ctx.globalAlpha = Number(params.get('alpha') ?? '0.6');
    ctx.drawImage(gl.domElement, 0, 0);
    ctx.globalAlpha = 1;
    // Reference levels (data): ±0.00, eaves +4.23, ridge +7.50, canopy/sunshade.
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    for (const [yy, name] of [
      [0, '±0.00'],
      [4.23, '+4.23'],
      [7.5, '+7.50'],
      [7.9, '+7.90'],
      [2.73, '+2.73'],
      [2.89, '+2.89'],
    ] as const) {
      const py = (view.v1 - yy) * pxPerM;
      ctx.strokeStyle = '#0a8f5a';
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(W, py);
      ctx.stroke();
      ctx.fillStyle = '#0a8f5a';
      ctx.fillText(name, 4, py - 3);
    }
    ctx.setLineDash([]);
    info = `Sheet ${params.get('sheet')}: orthographic elevation over the sheet (model at ${Math.round(ctx.globalAlpha * 100)} %), dashed = data levels.`;
  }
  if (!status.textContent) status.textContent = info;
  document.body.dataset.ready = '1';
}

void main();
