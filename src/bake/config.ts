/**
 * What the lightmap baker bakes (plan.md §4.1, I6): meshes with a lightmap, texel
 * density per chart, atlas layout, sun / sky / bounce sampling. Shared by `bake.html`
 * and the unit tests.
 */
import type { MaterialId } from '../data/schema';
import { SHELL } from '../data/grid';

export const ATLAS = {
  count: 2,
  size: 2048,
  /** Empty texels per chart side (bilinear filtering + 2× downsample for the low tier). */
  padding: 2,
  /** Normal cone of a chart (planar architecture; bevel steps of the furniture merge). */
  coneDeg: 30,
} as const;

/**
 * Keep their runtime lighting (no lightmap): see-through / mirror surfaces and the
 * vegetation (thousands of tiny facets that would eat the atlas; outdoors, lit by the
 * sun + sky). They still occlude light in the bake (glass lets it through, tinted).
 */
export const UNBAKED: ReadonlySet<MaterialId> = new Set<MaterialId>([
  'glass',
  'mirror',
  'foliage',
  'foliageLight',
  'bark',
  'barkBirch',
  'meadow',
  'flowers',
]);

/** Facade / roof / terrace materials: coarser texels even next to the house. */
const EXTERIOR: ReadonlySet<MaterialId> = new Set<MaterialId>([
  'plasterExterior',
  'cladMetal',
  'cladWood',
  'roofMetal',
  'woodSlat',
  'deck',
  'grating',
  'lawn',
  'field',
  'gravel',
  'soil',
  'pavers',
  'stone',
  'asphalt',
  'timber',
  'corten',
]);

const GROUND: ReadonlySet<MaterialId> = new Set<MaterialId>([
  'lawn',
  'field',
  'gravel',
  'soil',
  'pavers',
  'asphalt',
]);

/** Texel sizes (m). */
export const TEXEL = {
  /** Inside the house (~3 cm, plan.md §3.1). */
  interior: 0.03,
  /** Facades, roof, deck. */
  exterior: 0.07,
  /** Garden next to the house; grows with the distance beyond `nearM`. */
  garden: 0.1,
  nearM: 12,
  perMetre: 0.012,
  far: 4,
} as const;

const HOUSE_CENTER: readonly [number, number] = [
  (SHELL.west + SHELL.east) / 2,
  (SHELL.north + SHELL.south) / 2,
];

/** Inside the building volume (a small margin; below the roof ridge). */
export function insideHouse(x: number, y: number, z: number, margin = 0.05): boolean {
  return (
    x > SHELL.west + margin &&
    x < SHELL.east - margin &&
    z > SHELL.north + margin &&
    z < SHELL.south - margin &&
    y > -3 &&
    y < 7.6
  );
}

export function texelSize(id: string, c: readonly [number, number, number], extentM = 0): number {
  const [x, y, z] = c;
  if (insideHouse(x, y, z) && !EXTERIOR.has(id as MaterialId)) return TEXEL.interior;
  const d = Math.hypot(x - HOUSE_CENTER[0], z - HOUSE_CENTER[1]);
  const base = d < 11 && !GROUND.has(id as MaterialId) ? TEXEL.exterior : TEXEL.garden;
  // Huge context charts (the ring of far ground, hills): their centroid says nothing.
  const bySize = extentM > 60 ? extentM / 200 : 0;
  return Math.min(
    TEXEL.far,
    Math.max(bySize, base + Math.max(0, d - TEXEL.nearM) * TEXEL.perMetre),
  );
}

/** Sampling of the GPU tracer. */
export const SAMPLES = {
  /** Jittered shadow rays toward the sun disc. */
  sun: 32,
  /** Cosine-weighted sky / bounce rays per radiosity iteration (each adds one bounce). */
  skyPerIteration: [8, 12, 96] as readonly number[],
  /** Angular radius of the sun disc (deg; the real sun is 0.27°, a bit softer reads better). */
  sunRadiusDeg: 0.6,
  /** Glass transmittance for sun and sky rays (linear RGB). */
  glass: [0.8, 0.84, 0.84] as [number, number, number],
  /** Irradiance assumed on surfaces without a lightmap (vegetation) when light bounces off them. */
  unbakedIrradiance: [1.6, 1.7, 1.6] as [number, number, number],
  /** Longer triangles (far ground ring, hills) are left out of the BVH (they slow every ray). */
  maxEdgeM: 40,
  /** Sky / bounce rays see the sky beyond this distance (m; prunes the BVH walk). */
  maxDistanceM: 30,
  /** Tile (texels) per draw call — keeps every GPU submission short (no driver timeout). */
  tile: 512,
};

/** RGBM range: decoded irradiance = rgb · a · RANGE. */
export const RGBM_RANGE = 8;
