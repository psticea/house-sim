/**
 * Runtime asset loading (plan.md §4, I4): the texture manifest written by
 * `tools/optimize-assets.mjs`, KTX2 textures through three's `KTX2Loader` with the Basis
 * transcoder that three ships next to the loader (Vite emits it as a hashed asset of our own
 * build — no CDN), plain images, progress.
 */
import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import type { Tier } from './quality';

export type MapKind = 'albedo' | 'normal' | 'orm';

export interface TextureSetEntry {
  kind: string;
  /** Real-world size of one texture tile (m). */
  sizeM: number;
  /** Mean albedo colour the texture was normalised to (sRGB hex). */
  tint?: string;
  maps: Partial<Record<MapKind, Record<Tier, string>>>;
  bytes: Record<string, number>;
}

export interface SkyEntry {
  background: string;
  environment: string;
  width: number;
  /** Linear radiance that 1.0 in the LDR sky files stands for. */
  scale: number;
  /** Equirect u of the (clamped) sun in the HDRI. */
  sunU: number;
  sunElevationDeg: number;
  /** Mean linear colour just above the horizon (÷ scale) — the fog colour. */
  horizon: [number, number, number];
  bytes: Record<string, number>;
}

export interface TextureManifest {
  sets: Record<string, TextureSetEntry>;
  sky?: SkyEntry;
}

/** Base URL of the public assets (`/house-sim/assets/` on Pages, `/assets/` in dev). */
export const assetBase = (): string => `${import.meta.env.BASE_URL}assets/`;

let ktx2: KTX2Loader | null = null;

export function ktx2Loader(renderer: THREE.WebGLRenderer): KTX2Loader {
  if (!ktx2) {
    ktx2 = new KTX2Loader().setWorkerLimit(2).detectSupport(renderer);
  }
  return ktx2;
}

export function disposeLoaders(): void {
  ktx2?.dispose();
  ktx2 = null;
}

export async function loadManifest(): Promise<TextureManifest> {
  const r = await fetch(`${assetBase()}textures/manifest.json`);
  if (!r.ok) throw new Error(`texture manifest: HTTP ${r.status}`);
  return (await r.json()) as TextureManifest;
}

/** Counts finished / total loads for a progress bar. */
export class Progress {
  done = 0;
  total = 0;
  bytes = 0;
  constructor(private readonly onChange: (fraction: number) => void = () => undefined) {}

  track<T>(p: Promise<T>, bytes = 0): Promise<T> {
    this.total++;
    this.onChange(this.fraction);
    return p.finally(() => {
      this.done++;
      this.bytes += bytes;
      this.onChange(this.fraction);
    });
  }

  get fraction(): number {
    return this.total === 0 ? 1 : this.done / this.total;
  }
}

export function loadKTX2(renderer: THREE.WebGLRenderer, url: string): Promise<THREE.Texture> {
  return ktx2Loader(renderer).loadAsync(`${assetBase()}${url}`);
}

export function loadImageTexture(url: string): Promise<THREE.Texture> {
  return new THREE.TextureLoader().loadAsync(`${assetBase()}${url}`);
}
