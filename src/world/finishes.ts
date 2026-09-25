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
  | 'metal'
  | 'metal-flat'
  | 'detail-plaster'
  | 'detail-fine';

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
  // Interior
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
  tile: {
    color: '#CDBFA7',
    roughness: 0.75,
    metalness: 0,
    set: 'tile',
    scaleM: 2.4,
    aoIntensity: 0.8,
    antiTiling: 'macro',
    antiTilingStrength: [0, 0.08],
  },
  tileUtility: {
    color: '#D3D0C9',
    roughness: 0.8,
    metalness: 0,
    set: 'tile',
    scaleM: 2.4,
    aoIntensity: 0.8,
  },
  ceilingWood: {
    color: '#DCC4A0',
    roughness: 1,
    metalness: 0,
    set: 'woodgrain',
    rotate: true,
    scaleM: 1.1,
    aoIntensity: 0.6,
  },
  doorLeaf: {
    color: '#EEEAE3',
    roughness: 0.55,
    metalness: 0,
    set: 'detail-fine',
    scaleM: 0.5,
    normalScale: 0.25,
  },
  // Facade (plans): grey RAL 7045 standing seam, natural wood, RAL 1011 frames
  cladMetal: {
    color: '#8F9695',
    roughness: 0.55,
    metalness: 0.1,
    set: 'metal',
    scaleM: 1,
    normalScale: 1,
  },
  roofMetal: {
    color: '#8A9191',
    roughness: 0.5,
    metalness: 0.1,
    set: 'metal-flat',
    scaleM: 1,
    normalScale: 1,
  },
  cladWood: {
    color: '#A9825A',
    roughness: 1,
    metalness: 0,
    set: 'extwood',
    aoIntensity: 0.9,
    antiTiling: 'macro',
    antiTilingStrength: [0, 0.12],
  },
  woodSlat: {
    color: '#A9825A',
    roughness: 1,
    metalness: 0,
    set: 'woodgrain',
    scaleM: 0.8,
  },
  frame: {
    color: '#8A6642',
    roughness: 0.42,
    metalness: 0.15,
    set: 'detail-fine',
    scaleM: 0.5,
    normalScale: 0.25,
  },
  glass: { color: '#1E2A2C', roughness: 0.04, metalness: 0 },
  metalBlack: {
    color: '#2E2C2A',
    roughness: 0.45,
    metalness: 0.7,
    set: 'detail-fine',
    scaleM: 0.5,
    normalScale: 0.3,
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
  deck: {
    color: '#8C7B6A',
    roughness: 1,
    metalness: 0,
    set: 'extwood',
    scaleM: 1.3,
    aoIntensity: 0.9,
    antiTiling: 'macro',
    antiTilingStrength: [0, 0.1],
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
};
