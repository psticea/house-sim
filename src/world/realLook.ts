/**
 * Realistic look, I4 (plan.md §4): streams the KTX2 PBR sets onto the existing materials
 * (one material per id, no extra draw calls), the CC0 HDRI sky → PMREM environment +
 * sky dome, interior reflection probes, eye adaptation (inside ↔ outside) and the
 * anti-tiling shader patch. Only acts while the realistic look is active; the
 * stylised looks keep their own materials and lights.
 */
import * as THREE from 'three';
import type { MaterialId } from '../data/schema';
import { OUTSIDE } from '../data/topology';
import {
  loadImageTexture,
  loadKTX2,
  loadManifest,
  Progress,
  type MapKind,
  type TextureManifest,
} from '../core/assets';
import type { TierSettings } from '../core/quality';
import { FINISHES, type AntiTiling, type Finish } from './finishes';
import type { Lighting } from './lighting';
import type { MaterialLibrary } from './materials';
import { setShaderPatch } from './shaderPatches';

/** Light balance of the realistic look (tuned against the review screenshots). */
export const REAL_LIGHT = {
  /** Tone-mapping exposure outdoors (ACES). */
  exposure: 0.85,
  /** Hemisphere fill once the environment provides the sky light. */
  hemiWithEnv: 0.55,
  /** Linear radiance of the sky environment relative to the LDR files' 1.0. */
  envScale: 1.15,
  /** Sky dome brightness relative to the environment. */
  skyScale: 1.7,
  /** Inside: ambient (hemi + environment) × this (no GI yet — the house occludes the sky)… */
  insideAmbient: 0.8,
  /** …and exposure × this, so sunlit patches glow and the view outside is brighter. */
  insideExposure: 1.9,
  /** Indoors the fill light turns warm (bounce off oak and warm-white plaster). */
  insideHemi: '#f3e7d7',
  /** Eye-adaptation time constant (s). */
  adaptSeconds: 0.7,
};

/**
 * Overrides while the baked lightmaps light the scene (I6): no ambient cut indoors (the
 * lightmap already holds the house's occlusion) and a stronger indoor exposure — real
 * interiors get a few % of the outdoor irradiance.
 */
export const REAL_BAKED_LIGHT: Partial<typeof REAL_LIGHT> = {
  exposure: 0.85,
  insideAmbient: 1,
  insideExposure: 2.5,
};
const BAKED_BALANCE = { ...REAL_LIGHT, ...REAL_BAKED_LIGHT };

/** Interior reflection probes (CubeCamera → PMREM, 64 px faces) and the rooms they serve. */
export const PROBES: readonly {
  id: string;
  position: [number, number, number];
  rooms: string[];
}[] = [
  {
    id: 'living',
    position: [12.6, 1.6, 4.2],
    rooms: [
      'living-kitchen',
      'entrance-hall',
      'bedroom-1',
      'bedroom-2',
      'stairs',
      'play-corner',
      'storage',
      'basement-stairs',
    ],
  },
  { id: 'bedroom-3', position: [3.9, 4.3, 5.2], rooms: ['bedroom-3', 'study', 'upper-hall'] },
  {
    id: 'bathroom',
    position: [5.9, 1.5, 4.3],
    rooms: ['bathroom', 'boiler-laundry', 'upper-bathroom'],
  },
];

/** Rooms that count as outdoors for eye adaptation (the deck is outside the glass wall). */
const OUTDOOR_ROOMS = new Set([OUTSIDE, 'terrace']);

export const isIndoors = (room: string): boolean => !OUTDOOR_ROOMS.has(room);

/** Which probe serves `room` (`null` = outdoors or no probe). */
export function probeFor(room: string): string | null {
  if (!isIndoors(room)) return null;
  return PROBES.find((p) => p.rooms.includes(room))?.id ?? 'living';
}

/** Texture maps `finish` needs from its set: full PBR sets vs normal-only / detail sets. */
export function mapsFor(finish: Finish, manifest: TextureManifest): MapKind[] {
  if (!finish.set) return [];
  const entry = manifest.sets[finish.set];
  if (!entry) return [];
  return (['albedo', 'normal', 'orm'] as const).filter((m) => entry.maps[m]);
}

/** Linear-light multiplier turning the set's tint into the finish colour. */
export function colorMultiplier(finish: Finish, tint: string | undefined): THREE.Color {
  const target = new THREE.Color(finish.color);
  if (!tint) return target;
  const t = new THREE.Color(tint);
  return new THREE.Color(target.r / t.r, target.g / t.g, target.b / t.b);
}

const ANTI_TILE_COMMON = /* glsl */ `
uniform vec2 antiTile;
float atHash( vec2 p ) {
  p = fract( p * vec2( 123.34, 456.21 ) );
  p += dot( p, p + 45.32 );
  return fract( p.x * p.y );
}
float atNoise( vec2 p ) {
  vec2 i = floor( p );
  vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( atHash( i ), atHash( i + vec2( 1.0, 0.0 ) ), f.x ),
              mix( atHash( i + vec2( 0.0, 1.0 ) ), atHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}`;

// `antiTile` = (blend strength, macro variation); UVs are in texture tiles.
const ANTI_TILE_MAP: Record<Exclude<AntiTiling, 'none'>, string> = {
  blend: /* glsl */ `
#ifdef USE_MAP
  vec4 atA = texture2D( map, vMapUv );
  vec4 atB = texture2D( map, mat2( 0.8, 0.6, -0.6, 0.8 ) * vMapUv + vec2( 0.43, 0.17 ) );
  float atM = smoothstep( 0.4, 0.6, atNoise( vMapUv * 0.37 ) ) * antiTile.x;
  vec4 sampledDiffuseColor = mix( atA, atB, atM );
  sampledDiffuseColor.rgb *= 1.0 + antiTile.y * ( atNoise( vMapUv * 0.11 + 3.7 ) * 2.0 - 1.0 );
  diffuseColor *= sampledDiffuseColor;
#endif`,
  macro: /* glsl */ `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  sampledDiffuseColor.rgb *= 1.0 + antiTile.y * ( atNoise( vMapUv * 0.23 + 1.3 ) * 2.0 - 1.0 );
  diffuseColor *= sampledDiffuseColor;
#endif`,
};

/** Installs the anti-tiling patch (program shared per mode, strengths per material). */
export function applyAntiTiling(
  material: THREE.MeshStandardMaterial,
  mode: AntiTiling,
  strength: readonly [number, number],
): void {
  if (mode === 'none') return;
  const uniform = { value: new THREE.Vector2(strength[0], strength[1]) };
  setShaderPatch(material, `antitile-${mode}`, (shader) => {
    shader.uniforms.antiTile = uniform;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${ANTI_TILE_COMMON}`)
      .replace('#include <map_fragment>', ANTI_TILE_MAP[mode]);
  });
  material.userData.antiTile = uniform;
}

export interface RealLookOptions {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  materials: MaterialLibrary;
  lighting: Lighting;
  sky: THREE.Mesh;
  /** The realistic look's own fog (kept even while a stylised look replaces scene.fog). */
  fog: THREE.Fog;
  quality: TierSettings;
  onProgress?: (fraction: number, done: boolean) => void;
}

export class RealLook {
  /** Resolves once textures + sky are loaded (after the first `load()`). */
  readonly ready: Promise<void>;
  loaded = false;
  /** Downloaded bytes of textures + sky. */
  bytes = 0;
  private resolveReady!: () => void;
  private started = false;
  private readonly baseTextures = new Map<string, THREE.Texture>();
  private readonly clones: THREE.Texture[] = [];
  private env: THREE.WebGLRenderTarget | null = null;
  private skyBg: THREE.Texture | null = null;
  private readonly probes = new Map<string, THREE.WebGLRenderTarget>();
  /** Probes still to be captured (next frames with the realistic look shown). */
  probesPending = false;
  private snapNext = true;
  private framesSinceLoad = 0;
  private adapt = 0;
  private baked = false;
  /** Smoothed log of the per-room exposure multiplier (baked lighting only). */
  private roomGain = 0;
  /** Per-room exposure multiplier while baked (set by the app from the lightmaps). */
  roomExposure: ((room: string) => number) | null = null;
  private readonly base: { exposure: number; hemi: number; hemiColor: THREE.Color };
  private readonly insideHemi = new THREE.Color(REAL_LIGHT.insideHemi);
  private skyRadianceScale = 1;
  private readonly horizon = new THREE.Color();

  constructor(private readonly o: RealLookOptions) {
    this.ready = new Promise((r) => (this.resolveReady = r));
    this.base = {
      exposure: o.renderer.toneMappingExposure,
      hemi: o.lighting.hemi.intensity,
      hemiColor: o.lighting.hemi.color.clone(),
    };
  }

  /** Starts streaming (idempotent); the scene stays usable with flat colours meanwhile. */
  load(): Promise<void> {
    if (!this.started) {
      this.started = true;
      this.doLoad().catch((e: unknown) => {
        console.error('Realistic textures failed to load', e);
        this.o.onProgress?.(1, true);
        this.resolveReady();
      });
    }
    return this.ready;
  }

  private async doLoad(): Promise<void> {
    const { renderer, materials, quality } = this.o;
    const manifest = await loadManifest();
    const progress = new Progress((f) => this.o.onProgress?.(f, false));
    const tier = quality.textures;
    const urls = new Set<string>();
    for (const f of Object.values(FINISHES)) {
      for (const m of mapsFor(f, manifest)) urls.add(manifest.sets[f.set!]!.maps[m]![tier]);
    }
    const sizeOf = (url: string): number => {
      for (const s of Object.values(manifest.sets)) if (url in s.bytes) return s.bytes[url]!;
      return 0;
    };
    const maxAniso = renderer.capabilities.getMaxAnisotropy();
    const jobs: Promise<unknown>[] = [...urls].map((url) =>
      progress.track(
        loadKTX2(renderer, `textures/${url}`).then((t) => {
          t.wrapS = THREE.RepeatWrapping;
          t.wrapT = THREE.RepeatWrapping;
          t.anisotropy = Math.min(quality.anisotropy, maxAniso);
          this.baseTextures.set(url, t);
        }),
        sizeOf(url),
      ),
    );
    const sky = manifest.sky;
    if (sky) {
      jobs.push(
        progress.track(
          loadImageTexture(sky.environment).then((t) => {
            t.colorSpace = THREE.SRGBColorSpace;
            t.mapping = THREE.EquirectangularReflectionMapping;
            const pmrem = new THREE.PMREMGenerator(renderer);
            this.env = pmrem.fromEquirectangular(t);
            pmrem.dispose();
            t.dispose();
          }),
          sky.bytes[sky.environment] ?? 0,
        ),
        progress.track(
          loadKTX2(renderer, sky.background).then((t) => {
            t.wrapS = THREE.RepeatWrapping;
            t.generateMipmaps = false;
            this.skyBg = t;
          }),
          sky.bytes[sky.background] ?? 0,
        ),
      );
    }
    await Promise.all(jobs);
    this.bytes = progress.bytes;

    for (const [id, f] of Object.entries(FINISHES) as [MaterialId, Finish][]) {
      const m = materials[id] as THREE.MeshStandardMaterial;
      const entry = f.set ? manifest.sets[f.set] : undefined;
      if (!entry || !m.isMeshStandardMaterial) continue;
      const scale = f.scaleM ?? entry.sizeM;
      const tex = (kind: MapKind): THREE.Texture | null => {
        const url = entry.maps[kind]?.[tier];
        const b = url ? this.baseTextures.get(url) : undefined;
        if (!b) return null;
        const t = b.clone();
        t.repeat.set(1 / scale, 1 / scale);
        if (f.rotate) t.rotation = Math.PI / 2;
        this.clones.push(t);
        return t;
      };
      const albedo = tex('albedo');
      if (albedo) {
        m.map = albedo;
        m.color.copy(colorMultiplier(f, entry.tint));
        applyAntiTiling(m, f.antiTiling ?? 'none', f.antiTilingStrength ?? [0, 0]);
      }
      const normal = tex('normal');
      if (normal) {
        m.normalMap = normal;
        m.normalScale.setScalar(f.normalScale ?? 1);
      }
      const orm = tex('orm');
      if (orm) {
        m.roughnessMap = orm;
        m.metalnessMap = orm;
        m.aoMap = orm;
        m.aoMapIntensity = f.aoIntensity ?? 1;
      }
      m.needsUpdate = true;
    }

    if (this.env && sky) {
      const { scene, lighting } = this.o;
      scene.environment = this.env.texture;
      // Turn the HDRI so its (clamped) sun sits where our directional sun is.
      const d = lighting.sunDirection;
      const ours = Math.atan2(d.z, d.x);
      const hdri = (sky.sunU - 0.5) * Math.PI * 2;
      scene.environmentRotation.set(0, hdri - ours, 0);
      this.skyRadianceScale = REAL_LIGHT.envScale;
      this.horizon.setRGB(...sky.horizon).multiplyScalar(REAL_LIGHT.envScale * REAL_LIGHT.skyScale);
      this.o.fog.color.copy(this.horizon);
      this.probesPending = this.o.quality.probes;
    }
    this.loaded = true;
    this.framesSinceLoad = 0;
    this.o.onProgress?.(1, true);
    this.resolveReady();
  }

  /** Per frame: eye adaptation, probe choice, sky; `active` = realistic look shown. */
  update(dt: number, room: string, active: boolean): void {
    if (!active) return;
    const { renderer, scene, lighting, sky } = this.o;
    const target = isIndoors(room) ? 1 : 0;
    this.adapt += (target - this.adapt) * (1 - Math.exp(-dt / REAL_LIGHT.adaptSeconds));
    const gain =
      this.baked && this.roomExposure && isIndoors(room) ? Math.log(this.roomExposure(room)) : 0;
    this.roomGain += (gain - this.roomGain) * (1 - Math.exp(-dt / REAL_LIGHT.adaptSeconds));
    if (this.snapNext) {
      this.adapt = target;
      this.roomGain = gain;
    }
    this.snapNext = false;
    if (Math.abs(this.adapt - target) < 1e-3) this.adapt = target;
    const a = this.adapt;
    const L = this.balance;
    const ambient = 1 + (L.insideAmbient - 1) * a;
    const exposure = this.env || this.baked ? L.exposure : this.base.exposure;
    renderer.toneMappingExposure =
      exposure * (1 + (L.insideExposure - 1) * a) * Math.exp(this.roomGain);
    const hemi = this.env ? L.hemiWithEnv : this.base.hemi;
    lighting.hemi.intensity = hemi * ambient;
    lighting.hemi.color.copy(this.base.hemiColor).lerp(this.insideHemi, a);
    if (!this.env) return;
    const u = (sky.material as THREE.ShaderMaterial).uniforms;
    if (u.hdri && u.hdriMix && u.hdriScale && u.hdriRotation && u.hdriHorizon) {
      u.hdri.value = this.skyBg;
      u.hdriMix.value = this.skyBg ? 1 : 0;
      u.hdriScale.value = this.skyRadianceScale * REAL_LIGHT.skyScale;
      u.hdriRotation.value = scene.environmentRotation.y;
      (u.hdriHorizon.value as THREE.Color).copy(this.horizon);
    }
    scene.environmentIntensity = this.skyRadianceScale * ambient;
    if (this.probesPending && ++this.framesSinceLoad > 2) {
      this.probesPending = false;
      this.captureProbes();
    }
    const probe = this.probes.get(probeFor(room) ?? '');
    const env = probe && a > 0.5 ? probe.texture : this.env.texture;
    if (scene.environment !== env) scene.environment = env;
    // Probes store absolute radiance: no sky scale on top.
    if (probe && a > 0.5) scene.environmentIntensity = 1;
  }

  /** Renders the interior probes once (inside light balance), then precompiles shaders. */
  private captureProbes(): void {
    const { renderer, scene, lighting, camera } = this.o;
    if (!this.env) return;
    const hemi = lighting.hemi.intensity;
    const envI = scene.environmentIntensity;
    const envT = scene.environment;
    const L = this.balance;
    lighting.hemi.intensity = L.hemiWithEnv * L.insideAmbient;
    scene.environment = this.env.texture;
    scene.environmentIntensity = this.skyRadianceScale * L.insideAmbient;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const cubeRT = new THREE.WebGLCubeRenderTarget(64, { type: THREE.HalfFloatType });
    const cam = new THREE.CubeCamera(0.05, 300, cubeRT);
    scene.add(cam);
    for (const p of PROBES) {
      cam.position.set(...p.position);
      cam.updateMatrixWorld(true);
      cam.update(renderer, scene);
      this.probes.get(p.id)?.dispose();
      this.probes.set(p.id, pmrem.fromCubemap(cubeRT.texture));
    }
    scene.remove(cam);
    cubeRT.dispose();
    pmrem.dispose();
    lighting.hemi.intensity = hemi;
    scene.environment = envT;
    scene.environmentIntensity = envI;
    // Materials need one more program variant for the probes' PMREM size: build it now,
    // in the background, instead of on the first step indoors.
    const first = this.probes.values().next().value;
    if (first) {
      scene.environment = first.texture;
      if (renderer.extensions.has('KHR_parallel_shader_compile')) {
        void renderer.compileAsync(scene, camera).catch(() => undefined);
      } else {
        renderer.compile(scene, camera);
      }
      scene.environment = envT;
    }
  }

  /** Baked lightmaps on / off (I6): other light balance, probes captured again. */
  setBaked(on: boolean): void {
    if (this.baked === on) return;
    this.baked = on;
    this.refreshProbes();
  }

  private get balance(): typeof REAL_LIGHT {
    return this.baked ? BAKED_BALANCE : REAL_LIGHT;
  }

  /** Jump straight to the adapted exposure on the next frame (teleports, test hooks). */
  snap(): void {
    this.snapNext = true;
  }

  /** The scene changed (furniture arrived): capture the interior probes again. */
  refreshProbes(): void {
    if (this.loaded && this.env && this.o.quality.probes) {
      this.probesPending = true;
      this.framesSinceLoad = 0;
    }
  }

  /** GPU textures owned by the look that may not be assigned right now (memory estimate). */
  ownedTextures(): THREE.Texture[] {
    const out: THREE.Texture[] = [...this.baseTextures.values()];
    if (this.env) out.push(this.env.texture);
    if (this.skyBg) out.push(this.skyBg);
    for (const p of this.probes.values()) out.push(p.texture);
    return out;
  }

  get probeCount(): number {
    return this.probes.size;
  }
}
