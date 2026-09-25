/** `?debug` overlay: fps, frame time, renderer.info, estimated texture memory, player. */
import type * as THREE from 'three';

export interface DebugSample {
  fps: number;
  frameMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  textureMB: number;
  x: number;
  y: number;
  z: number;
  room: string;
}

export class FrameStats {
  fps = 0;
  frameMs = 0;
  private frames = 0;
  private time = 0;
  private work = 0;

  /** Call once per frame with the frame interval and the CPU time spent on it. */
  sample(dt: number, workMs: number): boolean {
    this.frames++;
    this.time += dt;
    this.work += workMs;
    if (this.time >= 0.5) {
      this.fps = this.frames / this.time;
      this.frameMs = this.work / this.frames;
      this.frames = 0;
      this.time = 0;
      this.work = 0;
      return true;
    }
    return false;
  }
}

/** Bytes per texel of uncompressed formats / types (GPU storage, conservative). */
function bytesPerTexel(t: THREE.Texture): number {
  const type = t.type;
  const channels =
    t.format === 1028 /* RedFormat */ || t.format === 1026 /* DepthFormat */
      ? 1
      : t.format === 1030 /* RGFormat */
        ? 2
        : 4;
  const size =
    type === 1016 /* HalfFloatType */ || type === 1012 /* ShortType */ || type === 1013
      ? 2
      : type === 1015 /* FloatType */ || type === 1014 /* UnsignedIntType */ || type === 1020
        ? 4
        : 1;
  return channels * size;
}

/**
 * GPU bytes of one texture: compressed (KTX2) = the transcoded mip data actually
 * uploaded; images / data textures = texels × bytes per texel (+⅓ with mipmaps);
 * cube textures × 6.
 */
export function textureBytes(t: THREE.Texture): number {
  const c = t as unknown as {
    isCompressedTexture?: boolean;
    mipmaps?: { data?: ArrayBufferView }[];
  };
  if (c.isCompressedTexture && c.mipmaps?.length) {
    return c.mipmaps.reduce((a, m) => a + (m.data?.byteLength ?? 0), 0);
  }
  const img: unknown = t.image;
  const first = (Array.isArray(img) ? img[0] : img) as
    { width?: number; height?: number } | null | undefined;
  const w = first?.width ?? 0;
  const h = first?.height ?? 0;
  const faces = Array.isArray(img) ? img.length : 1;
  const mipped =
    t.generateMipmaps &&
    t.minFilter !== 1003 /* NearestFilter */ &&
    t.minFilter !== 1006; /* LinearFilter */
  return w * h * faces * bytesPerTexel(t) * (mipped ? 4 / 3 : 1);
}

const TEXTURE_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'alphaMap',
  'bumpMap',
  'envMap',
  'lightMap',
  'gradientMap',
  'specularMap',
] as const;

/**
 * Estimated GPU texture memory (MB) of what the scene uses: material maps and shader
 * uniforms (textures sharing a source are counted once), the environment / background,
 * static shadow maps (colour + depth attachment), plus `extra` (e.g. reflection probes
 * not assigned right now).
 */
export function estimateTextureMB(scene: THREE.Scene, extra: THREE.Texture[] = []): number {
  const seen = new Set<unknown>();
  let bytes = 0;
  const add = (t: unknown): void => {
    const tex = t as { isTexture?: boolean; source?: unknown } | null | undefined;
    if (!tex?.isTexture) return;
    const key = tex.source ?? tex;
    if (seen.has(key)) return;
    seen.add(key);
    bytes += textureBytes(tex as THREE.Texture);
  };
  add(scene.environment);
  add(scene.background);
  for (const t of extra) add(t);
  scene.traverse((o) => {
    const light = o as THREE.DirectionalLight;
    if (light.isDirectionalLight && light.castShadow) {
      bytes += light.shadow.mapSize.x * light.shadow.mapSize.y * 4 * 2; // colour + depth RT
    }
    const mesh = o as unknown as { isMesh?: boolean; isLine?: boolean; material?: unknown };
    if (!mesh.isMesh && !mesh.isLine) return;
    const mats = (Array.isArray(mesh.material) ? mesh.material : [mesh.material]) as unknown[];
    for (const m of mats) {
      if (!m) continue;
      const rec = m as Record<string, unknown>;
      for (const slot of TEXTURE_SLOTS) add(rec[slot]);
      const uniforms = rec.uniforms as Record<string, { value?: unknown } | undefined> | undefined;
      if (uniforms) for (const u of Object.values(uniforms)) add(u?.value);
    }
  });
  return bytes / (1024 * 1024);
}

export class DebugOverlay {
  private readonly el: HTMLPreElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement('pre');
    this.el.className = 'debug';
    root.appendChild(this.el);
  }

  update(s: DebugSample): void {
    this.el.textContent =
      `${s.fps.toFixed(0)} fps · ${s.frameMs.toFixed(1)} ms cpu\n` +
      `draw calls ${s.drawCalls} · tris ${(s.triangles / 1000).toFixed(1)}k\n` +
      `geometries ${s.geometries} · textures ${s.textures} (~${s.textureMB.toFixed(1)} MB)\n` +
      `pos ${s.x.toFixed(2)}, ${s.y.toFixed(2)}, ${s.z.toFixed(2)}\n` +
      `room ${s.room}`;
  }
}
