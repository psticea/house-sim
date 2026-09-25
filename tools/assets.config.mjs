// Texture sources + output tiers for tools/fetch-assets.mjs and tools/optimize-assets.mjs
// (dev only). Every source is CC0 (Poly Haven / ambientCG) and listed in
// assets-src/LICENSES.md, which fetch-assets.mjs regenerates from this file.
//
// kind:
//   hero     — floors / facades you walk up to: albedo 1K / 2K / 2K (low / medium / high),
//              normal + ORM 512 / 1K / 1K
//   standard — albedo 512 / 1K / 2K, normal 512 / 1K / 1K, ORM 512 / 1K / 1K
// Formats: albedo + ORM ETC1S, normals UASTC (UASTC albedos were ~4.6 MB per 2K file and
// ~5 min to encode here — ETC1S at max quality keeps the repo and downloads small).
//   small    — little surfaces (edging, trunks): 512 / 512 / 1K
//   detail   — 512 tileable micro-normal only (layered at high repeat)
// tint: mean albedo is normalised to this colour (plan.md §6.1 palette), keeping the
//       texture's own light/dark and hue variation (saturation scaled by `sat`).
// sizeM: real-world size of one texture tile (metres) — the runtime scale (1 UV = 1 m).
// normalMax: cap for noisy normal maps (gravel, grass…) — UASTC compresses noise poorly
//            (~1.3 MB per 1K file) and 512 px is enough at their tile size.

export const SETS = [
  // Hero sets
  {
    id: 'oak',
    kind: 'hero',
    ph: 'laminate_floor_02',
    sizeM: 1.7,
    tint: '#C9A77C',
    sat: 0.9,
    note: 'oak parquet, matte oiled',
  },
  {
    id: 'tile',
    kind: 'hero',
    ph: 'grey_tiles',
    sizeM: 2.2,
    tint: '#CDBFA7',
    sat: 0.8,
    note: 'warm sand stone-look porcelain',
  },
  {
    id: 'extwood',
    kind: 'hero',
    ph: 'wood_planks',
    sizeM: 1.5,
    tint: '#A9825A',
    sat: 0.9,
    note: 'exterior boards: cladding, soffits, deck',
  },
  // Standard sets
  {
    id: 'woodgrain',
    kind: 'standard',
    ph: 'oak_veneer_01',
    sizeM: 1.83,
    tint: '#D3B894',
    sat: 0.85,
    note: 'plain oak grain: board ceiling, slats, fence timber',
  },
  {
    id: 'pavers',
    kind: 'standard',
    ph: 'concrete_pavers_02',
    sizeM: 2.0,
    tint: '#A8A399',
    albedoHigh: 2048,
    sat: 0.35,
    note: 'parking concrete pavers',
  },
  {
    id: 'concrete',
    kind: 'standard',
    normalMax: 512,
    ph: 'brushed_concrete',
    sizeM: 2.5,
    tint: '#A8A99E',
    sat: 0.5,
    note: 'basement / light-well concrete',
  },
  {
    id: 'stone',
    kind: 'standard',
    ph: 'concrete_floor_worn_001',
    sizeM: 3.0,
    tint: '#C4BEB2',
    sat: 0.6,
    note: 'honed natural stone slabs (jointless)',
  },
  {
    id: 'gravel',
    kind: 'standard',
    normalMax: 512,
    ph: 'gravel_floor_02',
    sizeM: 2.0,
    tint: '#BFB5A3',
    sat: 0.7,
    note: 'drainage gravel strips',
  },
  {
    id: 'grass',
    kind: 'standard',
    normalMax: 512,
    acg: 'Grass004',
    sizeM: 1.4,
    tint: '#6B8747',
    albedoHigh: 2048,
    sat: 0.72,
    note: 'lawn',
  },
  {
    id: 'asphalt',
    kind: 'small',
    ph: 'asphalt_02',
    sizeM: 3.0,
    tint: '#56575A',
    sat: 0.3,
    note: 'street',
  },
  {
    id: 'corten',
    kind: 'small',
    ph: 'rust_coarse_01',
    sizeM: 2.2,
    tint: '#8A4B2C',
    sat: 1,
    note: 'weathering steel edging, fire pit',
  },
  {
    id: 'bark',
    kind: 'small',
    ph: 'bark_brown_02',
    sizeM: 1.0,
    tint: '#5F4E40',
    sat: 0.9,
    note: 'tree bark',
  },
  // Detail micro-normals (512, tileable)
  {
    id: 'detail-plaster',
    kind: 'detail',
    ph: 'painted_plaster_wall',
    sizeM: 2.0,
    note: 'plaster / paint micro-normal',
  },
];

/** Procedurally generated sets (no source asset; written by optimize-assets.mjs). */
export const GENERATED = [
  {
    id: 'metal',
    kind: 'normal-only',
    sizeM: 1.0,
    note: 'standing-seam sheet: seams every 50 cm + slight oil-canning',
  },
  {
    id: 'metal-flat',
    kind: 'normal-only',
    sizeM: 1.0,
    note: 'roof sheet between modelled seams: oil-canning only',
  },
  { id: 'detail-fine', kind: 'detail', sizeM: 0.5, note: 'fine paint / clay / leaf grain' },
];

export const HDRI = {
  id: 'sky',
  ph: 'kloofendal_48d_partly_cloudy_puresky',
  res: '2k',
  note: 'partly cloudy midday sky',
};

/** Output sizes per tier (px) by kind and map. */
export const TIER_SIZES = {
  hero: {
    albedo: { low: 1024, medium: 2048, high: 2048 },
    normal: { low: 512, medium: 1024, high: 1024 },
    orm: { low: 512, medium: 1024, high: 1024 },
  },
  standard: {
    albedo: { low: 512, medium: 1024, high: 1024 },
    normal: { low: 512, medium: 1024, high: 1024 },
    orm: { low: 512, medium: 1024, high: 1024 },
  },
  small: {
    albedo: { low: 512, medium: 512, high: 1024 },
    normal: { low: 512, medium: 512, high: 512 },
    orm: { low: 512, medium: 512, high: 1024 },
  },
  'normal-only': { normal: { low: 512, medium: 1024, high: 1024 } },
  detail: { normal: { low: 512, medium: 512, high: 512 } },
};
