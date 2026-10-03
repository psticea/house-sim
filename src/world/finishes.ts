/**
 * Realistic-look finishes per material id (plan.md I4, §6.1/§6.2): colour, roughness,
 * metalness and which texture set (public/assets/textures, see
 * tools/assets.config.mjs) dresses it. One material per id — textures only change
 * what that material samples, never the number of draw calls.
 *
 * Colours are the §6.1 palette where the plans / The Local Project name one; the
 * stylised looks keep deriving theirs from `PALETTE` (materials.ts), unchanged.
 */
import type { MaterialId } from '../data/schema';

/** Texture sets shipped in public/assets/textures (ids of tools/assets.config.mjs). */
export type TextureSetId =
  | 'oak'
  | 'tile'
  | 'extwood'
  | 'woodgrain'
  | 'pavers'
  | 'concrete'
  | 'stone'
  | 'gravel'
  | 'grass'
  | 'asphalt'
  | 'corten'
  | 'bark'
  | 'travertine'
  | 'linen'
  | 'wool'
  | 'cane'
  | 'metal'
  | 'metal-flat'
  | 'detail-plaster'
  | 'detail-fine'
  | 'detail-brushed';

/**
 * The derived `extwood` board texture (tools/assets.config.mjs): `boards` rows of boards
 * per `tileM` tile, grain along u. The modelled west-gable boards shift their UVs onto
 * single texture boards (cladding.ts), so `cladWood` must use this tile size.
 */
export const BOARD_TEXTURE = { tileM: 2.08, boards: 8 } as const;

/**
 * - `blend`: second, rotated sample blended in by a noise mask + macro brightness
 *   variation (organic textures: lawn, gravel, concrete, stone, asphalt)
 * - `macro`: low-frequency brightness variation only (structured textures: boards,
 *   tiles, pavers — rotating them would break the joints)
 */
export type AntiTiling = 'blend' | 'macro' | 'none';

export interface Finish {
  /** Mean surface colour (sRGB hex); with a texture set this is its tinted mean. */
  color: string;
  /** Roughness (multiplies the set's roughness channel when it has one). */
  roughness: number;
  metalness: number;
  /** Texture set: full PBR set or (detail / normal-only sets) a normal map only. */
  set?: TextureSetId;
  /** Tile size in metres (default: the set's real-world size). */
  scaleM?: number;
  /** Rotate the texture 90° (grain / boards along the other axis). */
  rotate?: boolean;
  normalScale?: number;
  aoIntensity?: number;
  antiTiling?: AntiTiling;
  /** Strength of `antiTiling` (blend mix, macro variation). */
  antiTilingStrength?: [number, number];
}

export const FINISHES: Readonly<Record<MaterialId, Finish>> = {
  // Interior (plans: white finish, oak parquet, gresie in the wet rooms)
  plaster: {
    color: '#F1ECE3',
    roughness: 0.9,
    metalness: 0,
    set: 'detail-plaster',
    scaleM: 1.0,
    normalScale: 1.6,
  },
  oak: {
    color: '#C9A77C',
    roughness: 1,
    metalness: 0,
    set: 'oak',
    scaleM: 1.4,
    aoIntensity: 0.8,
    antiTiling: 'macro',
    antiTilingStrength: [0, 0.14],
  },
  // Honed travertine-look porcelain, 60 × 120 cm (derived `tile` set: 4 × 2 per 2.4 m).
  tile: {
    color: '#CCBEA6',
    roughness: 0.85,
    metalness: 0,
    set: 'tile',
    scaleM: 2.4,
    aoIntensity: 0.8,
    antiTiling: 'macro',
    antiTilingStrength: [0, 0.06],
  },
  tileUtility: {
    color: '#D2CEC6',
    roughness: 0.85,
    metalness: 0,
    set: 'tile',
    scaleM: 2.4,
    aoIntensity: 0.8,
    antiTiling: 'macro',
    antiTilingStrength: [0, 0.05],
  },
  // Wet-room walls: the same tiles, standing (60 wide × 120 high), a shade lighter.
  tileWall: {
    color: '#DDD3C3',
    roughness: 0.75,
    metalness: 0,
    set: 'tile',
    scaleM: 2.4,
    aoIntensity: 0.7,
    antiTiling: 'macro',
    antiTilingStrength: [0, 0.05],
  },
  // Living-room board ceiling (plans): pale oiled boards, 15 cm.
  ceilingWood: {
    color: '#D5BB98',
    roughness: 0.9,
    metalness: 0,
    set: 'extwood',
    scaleM: 1.2,
    aoIntensity: 0.6,
    antiTiling: 'macro',
    antiTilingStrength: [0, 0.06],
  },
  doorLeaf: {
    color: '#EEEAE3',
    roughness: 0.55,
    metalness: 0,
    set: 'detail-fine',
    scaleM: 0.5,
    normalScale: 0.25,
  },
  // Facade (owner update 2026-10): RAL 7016 standing seam, roof sheet and frames as a
  // warm-neutral anthracite powder coat (the sky's reflection adds the blue), natural wood.
  cladMetal: {
    color: '#45433F',
    roughness: 0.56,
    metalness: 0,
    set: 'metal',
    scaleM: 1,
    normalScale: 1,
  },
  roofMetal: {
    color: '#45433F',
    roughness: 0.54,
    metalness: 0,
    set: 'metal-flat',
    scaleM: 1,
    normalScale: 1,
  },
  // Oiled timber boards, 26 cm (the west gable's modelled boards pick single texture
  // boards, see BOARD_TEXTURE); loggia, canopy soffits, fins.
  cladWood: {
    color: '#B48A5C',
    roughness: 0.9,
    metalness: 0,
    set: 'extwood',
    scaleM: BOARD_TEXTURE.tileM,
    aoIntensity: 0.9,
    antiTiling: 'macro',
    antiTilingStrength: [0, 0.06],
  },
  woodSlat: {
    color: '#A97E52',
    roughness: 0.9,
    metalness: 0,
    set: 'woodgrain',
    scaleM: 0.8,
  },
  frame: {
    color: '#45433F',
    roughness: 0.48,
    metalness: 0,
    set: 'detail-fine',
    scaleM: 0.5,
    normalScale: 0.25,
  },
  glass: { color: '#1E2A2C', roughness: 0.04, metalness: 0 },
  // Blackened steel: rails, balustrade, stove, chimney, sunshade.
  metalBlack: {
    color: '#2E2C2A',
    roughness: 0.5,
    metalness: 0.6,
    set: 'detail-brushed',
    scaleM: 0.25,
    normalScale: 0.6,
  },
  grating: { color: '#4A4C4C', roughness: 0.55, metalness: 0.7 },
  plasterExterior: {
    color: '#EDE9E1',
    roughness: 0.95,
    metalness: 0,
    set: 'detail-plaster',
    scaleM: 1.4,
    normalScale: 1.2,
  },
  // Outside (plans: WPC deck, natural stone slabs, concrete pavers)
  // WPC deck boards, 15 cm, warm grey-brown.
  deck: {
    color: '#8F7B66',
    roughness: 0.95,
    metalness: 0,
    set: 'extwood',
    scaleM: 1.2,
    aoIntensity: 0.9,
    antiTiling: 'macro',
    antiTilingStrength: [0, 0.08],
  },
  stone: {
    color: '#C4BEB2',
    roughness: 1,
    metalness: 0,
    set: 'stone',
    antiTiling: 'blend',
    antiTilingStrength: [1, 0.12],
  },
  pavers: {
    color: '#A8A399',
    roughness: 1,
    metalness: 0,
    set: 'pavers',
    antiTiling: 'macro',
    antiTilingStrength: [0, 0.16],
  },
  concrete: {
    color: '#A8A99E',
    roughness: 1,
    metalness: 0,
    set: 'concrete',
    antiTiling: 'blend',
    antiTilingStrength: [1, 0.12],
  },
  lawn: {
    color: '#75894F',
    roughness: 1,
    metalness: 0,
    set: 'grass',
    normalScale: 0.6,
    antiTiling: 'blend',
    antiTilingStrength: [1, 0.22],
  },
  field: {
    color: '#80925E',
    roughness: 1,
    metalness: 0,
    set: 'grass',
    normalScale: 0.5,
    scaleM: 3.5,
    antiTiling: 'blend',
    antiTilingStrength: [1, 0.25],
  },
  asphalt: {
    color: '#56575A',
    roughness: 1,
    metalness: 0,
    set: 'asphalt',
    antiTiling: 'blend',
    antiTilingStrength: [1, 0.12],
  },
  gravel: {
    color: '#BFB5A3',
    roughness: 1,
    metalness: 0,
    set: 'gravel',
    antiTiling: 'blend',
    antiTilingStrength: [1, 0.12],
  },
  // Garden (§6.3–6.4)
  timber: {
    color: '#A48C6E',
    roughness: 1,
    metalness: 0,
    set: 'woodgrain',
    scaleM: 0.9,
  },
  corten: { color: '#8A4B2C', roughness: 1, metalness: 0, set: 'corten' },
  soil: {
    color: '#5C4A3B',
    roughness: 1,
    metalness: 0,
    set: 'detail-fine',
    scaleM: 0.35,
    normalScale: 1,
  },
  clay: {
    color: '#B5714F',
    roughness: 0.85,
    metalness: 0,
    set: 'detail-fine',
    scaleM: 0.4,
    normalScale: 0.6,
  },
  bark: { color: '#5F4E40', roughness: 1, metalness: 0, set: 'bark', scaleM: 0.8 },
  barkBirch: { color: '#E1DBD0', roughness: 1, metalness: 0, set: 'bark', scaleM: 0.8 },
  foliage: {
    color: '#6F7B47',
    roughness: 0.9,
    metalness: 0,
    set: 'detail-fine',
    scaleM: 0.3,
    normalScale: 0.8,
  },
  foliageLight: {
    color: '#9AA27A',
    roughness: 0.9,
    metalness: 0,
    set: 'detail-fine',
    scaleM: 0.3,
    normalScale: 0.8,
  },
  meadow: { color: '#AAA26A', roughness: 1, metalness: 0 },
  flowers: { color: '#D7AE5C', roughness: 1, metalness: 0 },
  // Furniture (I5; I4 redo: own stone, textile and cane sets, brushed metal detail).
  joinery: {
    color: '#C9A77C',
    roughness: 0.85,
    metalness: 0,
    set: 'woodgrain',
    scaleM: 0.9,
    aoIntensity: 0.5,
  },
  smokedOak: {
    color: '#6F5440',
    roughness: 0.75,
    metalness: 0,
    set: 'woodgrain',
    scaleM: 0.9,
    aoIntensity: 0.5,
  },
  travertine: {
    color: '#D9CBB5',
    roughness: 0.8,
    metalness: 0,
    set: 'travertine',
    scaleM: 1.2,
    normalScale: 0.6,
    aoIntensity: 0.5,
    antiTiling: 'macro',
    antiTilingStrength: [0, 0.05],
  },
  linen: {
    color: '#E3D9CA',
    roughness: 1,
    metalness: 0,
    set: 'linen',
    scaleM: 0.9,
    normalScale: 1,
  },
  wool: {
    color: '#BFAE98',
    roughness: 1,
    metalness: 0,
    set: 'wool',
    scaleM: 0.8,
    normalScale: 1,
  },
  cane: {
    color: '#C4A26F',
    roughness: 0.85,
    metalness: 0,
    set: 'cane',
    scaleM: 0.35,
    normalScale: 1,
  },
  ceramic: {
    color: '#EDE8DF',
    roughness: 0.35,
    metalness: 0,
    set: 'detail-fine',
    scaleM: 0.5,
    normalScale: 0.08,
  },
  // Aged brushed brass / bronze: tapware, mirror rims, lamp stems, hooks.
  brass: {
    color: '#9C7B4E',
    roughness: 0.38,
    metalness: 0.9,
    set: 'detail-brushed',
    scaleM: 0.25,
    normalScale: 0.6,
  },
  mirror: { color: '#D5DADA', roughness: 0.03, metalness: 1 },
};
