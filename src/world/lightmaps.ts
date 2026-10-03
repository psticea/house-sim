/**
 * Baked lighting at runtime (plan.md §4.1, I6 step 6.5), realistic look only: loads the
 * baker's output (`public/assets/baked/`: manifest, uv2 per mesh, RGBM KTX2 atlases),
 * checks that every lightmapped mesh still has the geometry it was baked with (hash),
 * then gives those meshes a second UV set (`uv1`) and their material the atlas as
 * `lightMap`, with a shader patch that lights them only by the lightmap (sun + sky + 3
 * bounces) plus environment reflections — the direct sun keeps just a highlight where
 * the bake saw sunlight. While active the dynamic sun shadow map is switched off (and
 * freed). Missing, stale (manifest `stale` flag) or outdated bake → console info and the
 * I4 lighting stays (shadow map).
 */
import * as THREE from 'three';
import { LEVELS, SHELL } from '../data/grid';
import { assetBase, loadKTX2 } from '../core/assets';
import type { Tier } from '../core/quality';
import { setShaderPatch } from './shaderPatches';

export const LIGHTMAP_VERSION = 1;

export interface LightmapAtlas {
  size: number;
  /** File per texture tier (relative to `assets/baked/`). */
  files: Record<Tier, string>;
  bytes: Record<string, number>;
}

export interface LightmapMesh {
  /** Mesh / material id. */
  id: string;
  atlas: number;
  vertices: number;
  /** Offset into the uv2 file (in uint16 values). */
  offset: number;
  /** `geometryHash` of the positions the bake used. */
  hash: string;
}

/** Vegetation baked per facet: a slice of `triangles.file` (4 RGBM bytes per triangle). */
export interface TriangleMesh {
  id: string;
  triangles: number;
  /** Offset into the file, in triangles. */
  offset: number;
  hash: string;
}

export interface LightmapManifest {
  version: number;
  encoding: 'rgbm';
  /** Decoded irradiance = rgb² · a · range. */
  range: number;
  /** Luminance of the baked sun irradiance on a surface facing it (highlight mask). */
  sunLuminance: number;
  atlases: LightmapAtlas[];
  uv2: { file: string; bytes: number };
  meshes: LightmapMesh[];
  /** Per-facet light of the meshes without lightmap UVs (vegetation). */
  triangles?: { file: string; bytes: number; meshes: TriangleMesh[] };
  /** Median baked floor irradiance per room (eye adaptation). */
  rooms?: Record<string, number>;
  bake?: Record<string, unknown>;
  /**
   * Set by hand when the scene changed after the bake and it must not be used (geometry
   * edits pending a re-bake): the runtime skips it (I4 lighting) without downloading the
   * atlases, and the scene-consistency unit test is skipped. `npm run bake` writes a new
   * manifest without it.
   */
  stale?: { since: string; reason: string };
}

/** Why the bake is marked stale (`null` = current). */
export function bakeStaleReason(m: Pick<LightmapManifest, 'stale'>): string | null {
  return m.stale ? `marked stale since ${m.stale.since}: ${m.stale.reason}` : null;
}

/** Positions quantised to 0.1 mm → two FNV-1a style 32-bit hashes (16 hex digits). */
export function geometryHash(positions: ArrayLike<number>): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193 ^ positions.length;
  for (let i = 0; i < positions.length; i++) {
    const q = Math.round(positions[i]! * 1e4) | 0;
    h1 = Math.imul(h1 ^ (q & 0xffff), 0x01000193);
    h1 = Math.imul(h1 ^ (q >>> 16), 0x01000193);
    h2 = Math.imul(h2 ^ q, 0x5bd1e995);
    h2 ^= h2 >>> 15;
  }
  const hex = (v: number): string => (v >>> 0).toString(16).padStart(8, '0');
  return hex(h1) + hex(h2);
}

/** Validates a parsed `manifest.json` (anything malformed → `null`). */
export function parseLightmapManifest(json: unknown): LightmapManifest | null {
  type Loose<T> = { [K in keyof T]?: unknown };
  const m = json as Loose<LightmapManifest> | null;
  if (!m || typeof m !== 'object') return null;
  if (m.version !== LIGHTMAP_VERSION || m.encoding !== 'rgbm') return null;
  if (typeof m.range !== 'number' || !(m.range > 0)) return null;
  if (typeof m.sunLuminance !== 'number') return null;
  if (!Array.isArray(m.atlases) || m.atlases.length === 0) return null;
  for (const a of m.atlases as (Loose<LightmapAtlas> | null)[]) {
    if (!a || typeof a.size !== 'number' || !a.files || typeof a.files !== 'object') return null;
    const files = a.files as Record<string, unknown>;
    for (const t of ['low', 'medium', 'high'] as const) {
      if (typeof files[t] !== 'string') return null;
    }
  }
  const uv2 = m.uv2 as { file?: unknown } | null | undefined;
  if (!uv2 || typeof uv2.file !== 'string') return null;
  if (m.rooms !== undefined) {
    if (!m.rooms || typeof m.rooms !== 'object') return null;
    if (Object.values(m.rooms).some((v) => typeof v !== 'number')) return null;
  }
  const stale = m.stale as { since?: unknown; reason?: unknown } | null | undefined;
  if (stale !== undefined) {
    if (!stale || typeof stale.since !== 'string' || typeof stale.reason !== 'string') return null;
  }
  const tri = m.triangles as
    { file?: unknown; meshes?: (Loose<TriangleMesh> | null)[] } | null | undefined;
  if (tri !== undefined) {
    if (!tri || typeof tri.file !== 'string' || !Array.isArray(tri.meshes)) return null;
    for (const e of tri.meshes) {
      if (!e || typeof e.id !== 'string' || typeof e.hash !== 'string') return null;
      if (!Number.isInteger(e.triangles) || !Number.isInteger(e.offset)) return null;
    }
  }
  if (!Array.isArray(m.meshes)) return null;
  const count = m.atlases.length;
  for (const e of m.meshes as (Loose<LightmapMesh> | null)[]) {
    if (!e || typeof e.id !== 'string' || typeof e.hash !== 'string') return null;
    if (typeof e.atlas !== 'number' || !Number.isInteger(e.atlas)) return null;
    if (e.atlas < 0 || e.atlas >= count) return null;
    if (!Number.isInteger(e.vertices) || !Number.isInteger(e.offset)) return null;
  }
  return m as unknown as LightmapManifest;
}

export interface MeshLike {
  name: string;
  geometry: THREE.BufferGeometry;
}

export type MatchResult<M extends MeshLike> =
  | {
      ok: true;
      pairs: { mesh: M; entry: LightmapMesh }[];
      triangles: { mesh: M; entry: TriangleMesh }[];
    }
  | { ok: false; reason: string };

/**
 * Pairs the baked entries with the scene meshes; the bake is only used if every entry
 * finds its mesh with the same vertex count and position hash (all or nothing).
 */
export function matchMeshes<M extends MeshLike>(
  manifest: LightmapManifest,
  meshes: readonly M[],
  uvValues: number,
  triangleValues = Infinity,
): MatchResult<M> {
  const byName = new Map(meshes.map((m) => [m.name, m]));
  const pairs: { mesh: M; entry: LightmapMesh }[] = [];
  for (const e of manifest.meshes) {
    const mesh = byName.get(e.id);
    if (!mesh) return { ok: false, reason: `mesh "${e.id}" is missing` };
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos || pos.count !== e.vertices) {
      return {
        ok: false,
        reason: `mesh "${e.id}" has ${pos?.count ?? 0} vertices, baked ${e.vertices}`,
      };
    }
    if (e.offset + e.vertices * 2 > uvValues) return { ok: false, reason: 'uv2 file too short' };
    if (geometryHash(pos.array) !== e.hash) {
      return { ok: false, reason: `mesh "${e.id}" geometry changed since the bake` };
    }
    pairs.push({ mesh, entry: e });
  }
  const triangles: { mesh: M; entry: TriangleMesh }[] = [];
  for (const e of manifest.triangles?.meshes ?? []) {
    const mesh = byName.get(e.id);
    if (!mesh) return { ok: false, reason: `mesh "${e.id}" is missing` };
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos || pos.count !== e.triangles * 3) {
      return {
        ok: false,
        reason: `mesh "${e.id}" has ${(pos?.count ?? 0) / 3} triangles, baked ${e.triangles}`,
      };
    }
    if (e.offset + e.triangles > triangleValues) return { ok: false, reason: 'tri file too short' };
    if (geometryHash(pos.array) !== e.hash) {
      return { ok: false, reason: `mesh "${e.id}" geometry changed since the bake` };
    }
    triangles.push({ mesh, entry: e });
  }
  return { ok: true, pairs, triangles };
}

/** Lighting balance with the lightmaps (tuned against the review shots). */
export const BAKED_LIGHT = {
  /** Multiplier on the baked irradiance. */
  intensity: 1,
  /**
   * Extra gain on surfaces inside the building: real interiors get ~1–5 % of the
   * outdoor irradiance; the eye adapts (exposure, `REAL_BAKED_LIGHT`) and this partial
   * adaptation keeps the view out of the windows from burning out completely.
   */
  interiorGain: 2,
  /** White balance indoors (linear RGB multiplier): warm, like the eye in a plaster + oak room. */
  interiorTint: [1.04, 1.0, 0.93] as [number, number, number],
  /** Sun highlight kept on sunlit baked surfaces (0 = off, 1 = full). */
  sunSpecular: 1,
  /**
   * Normal-map relief on baked surfaces: irradiance × (1 + k·N·L) / (1 + k·N₀·L) with N the
   * mapped and N₀ the flat normal, L the sun (where sunlit) or up (0 = flat).
   */
  normalDetail: 0.45,
  /**
   * Per-room eye adaptation: exposure × (target / this room)^power of the baked median floor
   * irradiance (sun patches don't count), clamped to [1, max]: dim rooms get brighter,
   * bright ones never darker.
   */
  adaptTarget: 0.14,
  adaptPower: 0.8,
  adaptMax: 3.5,
};

/**
 * Inside of the building shell (interior gain region): the box between the outer wall
 * faces (fading over the wall thickness) below the roof planes (ridge along x).
 */
export const INTERIOR_BOX = {
  min: [SHELL.west + 0.12, -3, SHELL.north + 0.12] as const,
  max: [SHELL.east - 0.12, LEVELS.ridge, SHELL.south - 0.12] as const,
  /** Roof: y = ridge − slope · |z − ridgeZ| (outer surface), minus `roofInset`. */
  ridgeZ: (SHELL.north + SHELL.south) / 2,
  slope: (LEVELS.ridge - LEVELS.eave) / ((SHELL.south - SHELL.north) / 2),
  roofInset: 0.15,
};

/** Facade / roof / garden materials: never inside, no interior gain. */
export const EXTERIOR_MATERIALS: ReadonlySet<string> = new Set([
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

/** Per-triangle RGBA bytes → the same 4 bytes on each of the triangle's 3 vertices. */
export function expandPerVertex(perTriangle: Uint8Array): Uint8Array {
  const n = perTriangle.length / 4;
  const out = new Uint8Array(n * 12);
  for (let t = 0; t < n; t++) {
    for (let v = 0; v < 3; v++) out.set(perTriangle.subarray(t * 4, t * 4 + 4), (t * 3 + v) * 4);
  }
  return out;
}

/** (target / room)^power, clamped to [1, adaptMax]; 1 without data. */
export function roomExposure(
  room: number | null,
  reference: number | null = BAKED_LIGHT.adaptTarget,
): number {
  if (!room || !reference || room <= 0) return 1;
  const g = (reference / room) ** BAKED_LIGHT.adaptPower;
  return Math.min(BAKED_LIGHT.adaptMax, Math.max(1, g));
}

const LUMA = /* glsl */ 'vec3( 0.2126, 0.7152, 0.0722 )';

const BAKED_PARS = /* glsl */ `
uniform float bakedRange;
uniform float bakedSunLum;
uniform float bakedSunSpec;
uniform float bakedGain;
uniform float bakedDetail;
uniform vec3 bakedTint;
uniform vec3 bakedBoxMin;
uniform vec3 bakedBoxMax;
uniform vec4 bakedRoof;
varying vec3 vBakedWorld;
`;

/** Replaces three's lightmap / IBL-irradiance chunk (checked against r186 in the tests). */
export const BAKED_FRAGMENT = /* glsl */ `
#if defined( RE_IndirectDiffuse )
  #ifdef BAKED_PER_VERTEX
    // Vegetation: one baked value per facet (vertex attribute).
    vec4 bakedTexel = vBakedRGBM;
    float bakedScale = 1.0;
  #else
    vec4 bakedTexel = texture2D( lightMap, vLightMapUv );
    float bakedScale = lightMapIntensity;
  #endif
  // RGBM with sqrt-encoded colour (more precision in the dark): rgb² · a · range.
  vec3 bakedIrradiance = bakedTexel.rgb * bakedTexel.rgb * ( bakedTexel.a * bakedRange );
  vec3 bakedIn = smoothstep( bakedBoxMin, bakedBoxMin + 0.2, vBakedWorld ) *
                 ( 1.0 - smoothstep( bakedBoxMax - 0.2, bakedBoxMax, vBakedWorld ) );
  float bakedRoofY = bakedRoof.x - bakedRoof.z * abs( vBakedWorld.z - bakedRoof.y ) - bakedRoof.w;
  float bakedUnder = 1.0 - smoothstep( bakedRoofY - 0.1, bakedRoofY, vBakedWorld.y );
  float bakedInside = bakedIn.x * bakedIn.y * bakedIn.z * bakedUnder;
  // Interior: partial eye adaptation (gain) + a warm white balance (plaster, oak bounce).
  vec3 bakedGainHere = mix( vec3( 1.0 ), bakedGain * bakedTint, bakedInside );
  // Dominant light: the sun where the bake saw it, else the sky / ceiling light from above.
  vec3 bakedL = normalize( ( viewMatrix * vec4( 0.0, 1.0, 0.0, 0.0 ) ).xyz );
  #if NUM_DIR_LIGHTS > 0
    // Sun highlight only where the bake saw the sun (no shadow map any more).
    float bakedNL = saturate( dot( nonPerturbedNormal, directionalLights[ 0 ].direction ) );
    float bakedSun = smoothstep( 0.75, 1.0, dot( bakedIrradiance, ${LUMA} ) / ( bakedSunLum * bakedNL + 1e-3 ) );
    reflectedLight.directSpecular *= bakedSun * bakedSunSpec;
    bakedL = normalize( mix( bakedL, directionalLights[ 0 ].direction, bakedSun ) );
  #endif
  // Normal-map relief under the baked light (the lightmap only knows the flat surface):
  // brighter where the mapped normal turns toward the dominant light, darker away.
  float bakedRelief = ( 1.0 + bakedDetail * dot( geometryNormal, bakedL ) ) /
                      ( 1.0 + bakedDetail * dot( nonPerturbedNormal, bakedL ) );
  // Sun, sky and bounces are all in the lightmap: no hemisphere / ambient / IBL diffuse.
  irradiance = bakedIrradiance * ( bakedScale * bakedGainHere * clamp( bakedRelief, 0.6, 1.5 ) );
  iblIrradiance = irradiance;
  reflectedLight.directDiffuse = vec3( 0.0 );
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
  radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
#endif
`;

export interface BakedUniforms {
  bakedRange: { value: number };
  bakedSunLum: { value: number };
  bakedSunSpec: { value: number };
  bakedGain: { value: number };
  bakedDetail: { value: number };
  bakedTint: { value: THREE.Color };
  bakedBoxMin: { value: THREE.Vector3 };
  bakedBoxMax: { value: THREE.Vector3 };
  bakedRoof: { value: THREE.Vector4 };
}

/** Uniforms of the baked patch; `gain` = interior gain (1 for exterior materials). */
export function createBakedUniforms(
  range: number,
  sunLum: number,
  gain: number = BAKED_LIGHT.interiorGain,
): BakedUniforms {
  const b = INTERIOR_BOX;
  return {
    bakedRange: { value: range },
    bakedSunLum: { value: sunLum },
    bakedSunSpec: { value: BAKED_LIGHT.sunSpecular },
    bakedGain: { value: gain },
    bakedDetail: { value: BAKED_LIGHT.normalDetail },
    bakedTint: {
      value:
        gain === 1
          ? new THREE.Color(1, 1, 1)
          : new THREE.Color().setRGB(...BAKED_LIGHT.interiorTint),
    },
    bakedBoxMin: { value: new THREE.Vector3(...b.min) },
    bakedBoxMax: { value: new THREE.Vector3(...b.max) },
    bakedRoof: { value: new THREE.Vector4(LEVELS.ridge, b.ridgeZ, b.slope, b.roofInset) },
  };
}

/**
 * Installs the baked-lighting patch on a material (shared program per combination).
 * `perVertex`: the light comes from the `bakedRGBM` vertex attribute (vegetation baked per
 * facet) instead of the `lightMap`.
 */
export function applyBakedPatch(
  material: THREE.Material,
  uniforms: BakedUniforms,
  perVertex = false,
): void {
  setShaderPatch(material, perVertex ? 'baked-vertex' : 'baked', (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const vDecl = perVertex
      ? 'varying vec3 vBakedWorld;\nattribute vec4 bakedRGBM;\nvarying vec4 vBakedRGBM;'
      : 'varying vec3 vBakedWorld;';
    const vSet = perVertex ? '\nvBakedRGBM = bakedRGBM;' : '';
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\n${vDecl}`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>\nvBakedWorld = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;${vSet}`,
      );
    const fDecl = perVertex ? '#define BAKED_PER_VERTEX\nvarying vec4 vBakedRGBM;\n' : '';
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${fDecl}${BAKED_PARS}`)
      .replace('#include <lights_fragment_maps>', BAKED_FRAGMENT);
  });
}

export interface LightmapsOptions {
  renderer: THREE.WebGLRenderer;
  sun: THREE.DirectionalLight;
  tier: () => Tier;
  /** Called when the baked lighting turns on / off (probes, light balance). */
  onChange?: (active: boolean) => void;
}

type Status = 'idle' | 'loading' | 'loaded' | 'applied' | 'unavailable';

export class Lightmaps {
  status: Status = 'idle';
  /** Why the bake is not used (console info). */
  reason = '';
  bytes = 0;
  private manifest: LightmapManifest | null = null;
  private uv: Uint16Array | null = null;
  private tri: Uint8Array | null = null;
  private readonly textures: THREE.Texture[] = [];
  private loading: Promise<void> | null = null;
  private meshes: THREE.Mesh[] | null = null;
  private wantActive = false;
  private active = false;

  constructor(private readonly o: LightmapsOptions) {}

  /** Starts downloading the bake (idempotent). */
  load(): Promise<void> {
    this.loading ??= this.doLoad().catch((e: unknown) => {
      this.unavailable(`could not be loaded (${e instanceof Error ? e.message : String(e)})`);
    });
    return this.loading;
  }

  private async doLoad(): Promise<void> {
    this.status = 'loading';
    const base = `${assetBase()}baked/`;
    const r = await fetch(`${base}manifest.json`);
    if (!r.ok) {
      this.unavailable(`no bake found (HTTP ${r.status})`);
      return;
    }
    const manifest = parseLightmapManifest(await r.json());
    if (!manifest) {
      this.unavailable('manifest has an unknown format');
      return;
    }
    const stale = bakeStaleReason(manifest);
    if (stale) {
      // Don't download atlases that can't match the scene.
      this.unavailable(`the bake is ${stale} (re-run \`npm run bake\`)`);
      return;
    }
    const tier = this.o.tier();
    const bin = (file: string): Promise<ArrayBuffer> =>
      fetch(`${base}${file}`).then((res) => {
        if (!res.ok) throw new Error(`${file} HTTP ${res.status}`);
        return res.arrayBuffer();
      });
    const [uvBuf, triBuf, ...textures] = await Promise.all([
      bin(manifest.uv2.file),
      manifest.triangles ? bin(manifest.triangles.file) : Promise.resolve(new ArrayBuffer(0)),
      ...manifest.atlases.map((a) => loadKTX2(this.o.renderer, `baked/${a.files[tier]}`)),
    ]);
    this.bytes =
      uvBuf.byteLength +
      triBuf.byteLength +
      manifest.atlases.reduce((s, a) => s + (a.bytes[a.files[tier]] ?? 0), 0);
    for (const t of textures) {
      t.colorSpace = THREE.NoColorSpace;
      t.channel = 1;
      t.flipY = false;
      t.generateMipmaps = false;
      t.minFilter = THREE.LinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.wrapS = THREE.ClampToEdgeWrapping;
      t.wrapT = THREE.ClampToEdgeWrapping;
      t.needsUpdate = true;
      this.textures.push(t);
    }
    this.manifest = manifest;
    this.uv = new Uint16Array(uvBuf);
    this.tri = new Uint8Array(triBuf);
    this.status = 'loaded';
    this.tryApply();
  }

  /** The static scene is complete (house + furniture): these meshes may get lightmaps. */
  attach(meshes: THREE.Mesh[]): void {
    this.meshes = meshes;
    this.tryApply();
  }

  /** The realistic look is (not) shown: baked lighting replaces the shadow map while it is. */
  setActive(active: boolean): void {
    this.wantActive = active;
    this.sync();
  }

  get isActive(): boolean {
    return this.active;
  }

  /** Mean baked floor irradiance of `room` (`null`: unknown room or no bake applied). */
  roomIrradiance(room: string): number | null {
    return this.status === 'applied' ? (this.manifest?.rooms?.[room] ?? null) : null;
  }

  /** Extra exposure for `room` from its baked brightness (1 = none). */
  roomExposure(room: string): number {
    return roomExposure(this.roomIrradiance(room));
  }

  /** GPU textures owned (memory estimate while not assigned). */
  ownedTextures(): THREE.Texture[] {
    return this.status === 'applied' ? [...this.textures] : [];
  }

  private unavailable(reason: string): void {
    this.status = 'unavailable';
    this.reason = reason;
    for (const t of this.textures) t.dispose();
    this.textures.length = 0;
    this.uv = null;
    this.tri = null;
    console.info(`Baked lighting off: ${reason} — using the dynamic sun shadow instead.`);
  }

  private tryApply(): void {
    if (this.status !== 'loaded' || !this.meshes || !this.manifest || !this.uv) return;
    const manifest = this.manifest;
    const tri = this.tri ?? new Uint8Array(0);
    const res = matchMeshes(manifest, this.meshes, this.uv.length, tri.length / 4);
    if (!res.ok) {
      this.unavailable(`${res.reason} (re-run \`npm run bake\`)`);
      return;
    }
    const inside = createBakedUniforms(manifest.range, manifest.sunLuminance);
    const outside = createBakedUniforms(manifest.range, manifest.sunLuminance, 1);
    for (const { mesh, entry } of res.pairs) {
      const uniforms = EXTERIOR_MATERIALS.has(entry.id) ? outside : inside;
      const uv = this.uv.subarray(entry.offset, entry.offset + entry.vertices * 2);
      mesh.geometry.setAttribute('uv1', new THREE.BufferAttribute(uv, 2, true));
      const m = mesh.material as THREE.MeshStandardMaterial;
      m.lightMap = this.textures[entry.atlas]!;
      m.lightMapIntensity = BAKED_LIGHT.intensity;
      applyBakedPatch(m, uniforms);
    }
    // Vegetation: the facet's RGBM on its three vertices.
    for (const { mesh, entry } of res.triangles) {
      const src = tri.subarray(entry.offset * 4, (entry.offset + entry.triangles) * 4);
      mesh.geometry.setAttribute(
        'bakedRGBM',
        new THREE.BufferAttribute(expandPerVertex(src), 4, true),
      );
      applyBakedPatch(mesh.material as THREE.Material, inside, true);
    }
    this.status = 'applied';
    this.sync();
  }

  private sync(): void {
    const on = this.wantActive && this.status === 'applied';
    if (on === this.active) return;
    this.active = on;
    const { sun, renderer } = this.o;
    if (on) {
      sun.castShadow = false;
      sun.shadow.map?.depthTexture?.dispose();
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    } else {
      sun.castShadow = true;
      renderer.shadowMap.needsUpdate = true;
    }
    this.o.onChange?.(on);
  }
}
