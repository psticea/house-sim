/**
 * DEV ONLY (overlay.html): section of the generated ground floor at +1.00 m drawn over
 * the locally rendered sheet 05 raster (.plans-cache/, never committed or deployed).
 * The raster is served by a dev-server middleware at /__plans/ (see vite.config.ts).
 */
import { house } from '../data/house';
import { levelById } from '../data/topology';
import type { MaterialId } from '../data/schema';
import { buildGeometry } from '../world/build';
import { sectionSegments } from '../world/section';

// Sheet 05 (1:50): axis 1 at x = 184.165 pt, axis A at y = 258.745 pt, 1 m = 56.693 pt.
const SHEET = { id: '05', x0: 184.165, z0: 258.745, ptPerM: (20 / 25.4) * 72 };
const VIEW = { minX: -3, maxX: 21, minZ: -4, maxZ: 10.5 };

const COLORS: Partial<Record<MaterialId, string>> = {
  plaster: '#e0271f',
  cladMetal: '#e0271f',
  cladWood: '#e0271f',
  frame: '#1f5fe0',
  glass: '#1fb3e0',
  doorLeaf: '#1f9e3a',
  oak: '#b87a00',
  concrete: '#8a3fc2',
  woodSlat: '#8a3fc2',
  metalBlack: '#000000',
};

async function main(): Promise<void> {
  const params = new URLSearchParams(location.search);
  const cut = Number(params.get('cut') ?? '1.0');
  const pxPerM = Number(params.get('ppm') ?? '90');
  const alpha = Number(params.get('alpha') ?? '0.85');
  const W = Math.round((VIEW.maxX - VIEW.minX) * pxPerM);
  const H = Math.round((VIEW.maxZ - VIEW.minZ) * pxPerM);
  const canvas = document.getElementById('c') as HTMLCanvasElement;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  const status = document.getElementById('status')!;

  const toPx = (x: number, z: number): [number, number] => [
    (x - VIEW.minX) * pxPerM,
    (z - VIEW.minZ) * pxPerM,
  ];

  // 1) Plan raster (local only).
  try {
    const res = await fetch(`/__plans/sheet-${SHEET.id}@4x.json`);
    if (!res.ok) throw new Error('missing');
    const meta = (await res.json()) as { scale: number };
    const img = new Image();
    img.src = `/__plans/sheet-${SHEET.id}@4x.png`;
    await img.decode();
    const imgPxPerM = SHEET.ptPerM * meta.scale;
    const s = pxPerM / imgPxPerM;
    const ox = (SHEET.x0 + VIEW.minX * SHEET.ptPerM) * meta.scale;
    const oz = (SHEET.z0 + VIEW.minZ * SHEET.ptPerM) * meta.scale;
    ctx.globalAlpha = 0.55;
    ctx.drawImage(img, ox, oz, W / s, H / s, 0, 0, W, H);
    ctx.globalAlpha = 1;
  } catch {
    status.textContent = 'Plan raster not found — run `npm run plans:render -- 4 05` (local only).';
  }

  // 2) Generated geometry, cut at +1.00 m (like the plan cut).
  const { mesh } = buildGeometry(house);
  const segs = sectionSegments(mesh.toGeometries(), cut);
  ctx.globalAlpha = alpha;
  ctx.lineWidth = 1.6;
  for (const s of segs) {
    const color = COLORS[s.material];
    if (!color) continue;
    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(...toPx(...s.a));
    ctx.lineTo(...toPx(...s.b));
    ctx.stroke();
  }

  // 3) Room polygons (data) dashed + names.
  const ground = levelById(house, 'ground');
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#0a8f5a';
  ctx.fillStyle = '#0a8f5a';
  ctx.font = '600 13px system-ui';
  for (const r of ground.rooms) {
    ctx.beginPath();
    r.polygon.forEach(([x, z], i) => {
      if (i) ctx.lineTo(...toPx(x, z));
      else ctx.moveTo(...toPx(x, z));
    });
    ctx.closePath();
    ctx.stroke();
    const cx = r.polygon.reduce((a, p) => a + p[0], 0) / r.polygon.length;
    const cz = r.polygon.reduce((a, p) => a + p[1], 0) / r.polygon.length;
    ctx.fillText(r.name, ...toPx(cx - 0.8, cz + 0.6));
  }
  ctx.setLineDash([]);
  if (!status.textContent) {
    status.textContent = `Section at +${cut.toFixed(2)} m: ${segs.length} segments. Red = walls, blue = frames/glass, green = door leaves, dashed = room polygons.`;
  }
  document.body.dataset.ready = '1';
}

void main();
