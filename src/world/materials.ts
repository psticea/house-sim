/**
 * Shared material library. `PALETTE` holds the flat I1 colours (the stylised looks
 * derive theirs from it — keep unchanged) plus shadow / transparency flags; the
 * realistic look uses the I4 finishes (`finishes.ts`) and streamed PBR textures.
 * Geometry carries world-space UVs (1 unit = 1 m).
 */
import * as THREE from 'three';
import type { MaterialId } from '../data/schema';
import { FINISHES } from './finishes';

interface MaterialSpec {
  color: string;
  roughness: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  castShadow: boolean;
}

export const PALETTE: Record<MaterialId, MaterialSpec> = {
  plaster: { color: '#F4F1EA', roughness: 0.92, castShadow: true },
  plasterExterior: { color: '#F2F0EA', roughness: 0.95, castShadow: true },
  cladMetal: { color: '#8F9695', roughness: 0.62, metalness: 0.15, castShadow: true },
  cladWood: { color: '#B48A5C', roughness: 0.8, castShadow: true },
  roofMetal: { color: '#858C8C', roughness: 0.55, metalness: 0.2, castShadow: true },
  ceilingWood: { color: '#E4D0AE', roughness: 0.8, castShadow: true },
  oak: { color: '#D8B98E', roughness: 0.8, castShadow: true },
  tile: { color: '#CBC5BC', roughness: 0.45, castShadow: true },
  tileUtility: { color: '#D6D5D1', roughness: 0.5, castShadow: true },
  frame: { color: '#8A6642', roughness: 0.55, castShadow: true },
  doorLeaf: { color: '#F2F0EB', roughness: 0.6, castShadow: true },
  glass: {
    color: '#BFD3DA',
    roughness: 0.05,
    metalness: 0.1,
    transparent: true,
    opacity: 0.22,
    side: THREE.DoubleSide,
    castShadow: false,
  },
  metalBlack: { color: '#2B2B2B', roughness: 0.5, metalness: 0.3, castShadow: true },
  woodSlat: { color: '#A97E52', roughness: 0.8, castShadow: true },
  deck: { color: '#8C7B6A', roughness: 0.85, castShadow: true },
  stone: { color: '#C4BEB2', roughness: 0.9, castShadow: true },
  pavers: { color: '#A8A399', roughness: 0.9, castShadow: true },
  concrete: { color: '#A8A99E', roughness: 0.9, castShadow: true },
  lawn: { color: '#6F8F4E', roughness: 1, castShadow: false },
  field: { color: '#85A062', roughness: 1, castShadow: false },
  asphalt: { color: '#56575A', roughness: 0.95, castShadow: false },
  grating: { color: '#5E6263', roughness: 0.6, metalness: 0.4, castShadow: true },
  // Garden (I3): natural materials in the §6.1 earthy palette (sand, clay, ochre, olive).
  timber: { color: '#A48C6E', roughness: 0.85, castShadow: true },
  corten: { color: '#8A4B2C', roughness: 0.8, castShadow: true },
  gravel: { color: '#BFB5A3', roughness: 1, castShadow: false },
  soil: { color: '#5C4A3B', roughness: 1, castShadow: false },
  clay: { color: '#B5714F', roughness: 0.9, castShadow: true },
  bark: { color: '#5F4E40', roughness: 0.95, castShadow: true },
  barkBirch: { color: '#E7E2D8', roughness: 0.9, castShadow: true },
  foliage: { color: '#6F7B47', roughness: 1, castShadow: true },
  foliageLight: { color: '#9AA27A', roughness: 1, castShadow: true },
  meadow: { color: '#AAA26A', roughness: 1, castShadow: false },
  flowers: { color: '#D7AE5C', roughness: 1, castShadow: false },
  // Furniture (I5): §6.1 The Local Project palette.
  joinery: { color: '#C9A77C', roughness: 0.75, castShadow: true },
  smokedOak: { color: '#6F5440', roughness: 0.7, castShadow: true },
  travertine: { color: '#D9CBB5', roughness: 0.6, castShadow: true },
  linen: { color: '#E3D9CA', roughness: 1, castShadow: true },
  wool: { color: '#BFAE98', roughness: 1, castShadow: true },
  cane: { color: '#C4A26F', roughness: 0.85, castShadow: true },
  ceramic: { color: '#EDE8DF', roughness: 0.4, castShadow: true },
  brass: { color: '#9C7B4E', roughness: 0.35, metalness: 0.85, castShadow: true },
  mirror: { color: '#C9D0D0', roughness: 0.05, metalness: 1, castShadow: false },
};

export type MaterialLibrary = Record<MaterialId, THREE.Material>;

/**
 * The realistic look's materials: one `MeshStandardMaterial` per id with the I4 finish
 * (colour / roughness / metalness, `finishes.ts`). Textures stream in later
 * (`realLook.ts`) and are assigned to these same objects, so the style system's saved
 * originals stay valid.
 */
export function createMaterials(): MaterialLibrary {
  const lib = {} as MaterialLibrary;
  for (const [id, spec] of Object.entries(PALETTE) as [MaterialId, MaterialSpec][]) {
    const f = FINISHES[id];
    const m = new THREE.MeshStandardMaterial({
      color: new THREE.Color(f.color),
      roughness: f.roughness,
      metalness: f.metalness,
      transparent: spec.transparent ?? false,
      opacity: spec.opacity ?? 1,
      side: spec.side ?? THREE.FrontSide,
      depthWrite: !(spec.transparent ?? false),
    });
    if (id === 'glass') {
      // Reflections are added at full strength (premultiplied "over"): the dark,
      // almost black body only lets `opacity` of the background through tinted, while
      // the Fresnel reflection of the environment stays visible.
      m.blending = THREE.CustomBlending;
      m.blendSrc = THREE.OneFactor;
      m.blendDst = THREE.OneMinusSrcAlphaFactor;
      m.opacity = 0.16;
      m.envMapIntensity = 1.2;
    }
    m.name = id;
    lib[id] = m;
  }
  return lib;
}

export const castsShadow = (id: MaterialId): boolean => PALETTE[id].castShadow;
