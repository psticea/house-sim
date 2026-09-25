/**
 * Style registry (plan.md S1/S2): three looks of the same scene — `sketchup` (default,
 * hand-drawn architecture), `borderlands` (cel-shaded comic ink) and `real` (the plain
 * scene built by `buildWorld`). Only materials, lights and rendering settings change: a
 * stylised look restyles the scene graph in place and `real` restores it exactly.
 *
 * - `setStyle(scene, name)` goes from any look to any other (current one removed, next
 *   one applied); calling it again with the same look only styles meshes added since.
 * - Per-look GPU resources (toon fills, line/hull objects, textures, sky) are built
 *   lazily on first use and cached per scene, so switching back and forth reuses them
 *   and never grows; `disposeStyles(scene)` frees everything.
 *
 * Stylised looks share one pipeline, driven by their config (`style/sketchup.ts`,
 * `style/borderlands.ts`): shared `MeshToonMaterial` per material id with a banded
 * gradient map and graded palette colour; feature-edge lines (one or two weights, fat
 * screen-space lines or GL lines); optional inverted hulls for curved meshes, comic ink
 * shading (tinted, hatched shadows), generated surface maps, stylised sky, CSS overlays.
 */
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { MaterialId } from '../data/schema';
import { DEFAULT_STYLE, styleNameOf, type StyleName } from '../core/params';
import { isTouchDevice } from '../core/renderer';
import { PALETTE } from './materials';
import { BORDERLANDS } from './style/borderlands';
import type { StyleConfig, SurfaceKind } from './style/config';
import { extractFeatureEdges, extractWeightedEdges, jitterSegments } from './style/edges';
import { createHullMaterial, curvedHullGeometry } from './style/hull';
import { SKETCHUP } from './style/sketchup';
import { createStylisedSkyMaterial } from './style/sky';
import {
  createGradientMap,
  createGrassMap,
  createGroundPattern,
  createPaintMap,
  gradeColor,
  paperGrainDataURL,
} from './style/textures';
import { applyInkShading, createInkUniforms, sunLuminance, type InkUniforms } from './style/toon';

export { STYLE_NAMES, styleNameOf, type StyleName } from '../core/params';
export { BORDERLANDS } from './style/borderlands';
export { SKETCHUP } from './style/sketchup';

/** The stylised looks (everything but `real`). */
export type StyledName = Exclude<StyleName, 'real'>;
export const STYLES: Readonly<Record<StyledName, StyleConfig>> = {
  sketchup: SKETCHUP,
  borderlands: BORDERLANDS,
};
/** Short names shown in the UI. */
export const STYLE_LABELS: Readonly<Record<StyleName, string>> = {
  sketchup: 'SketchUp',
  borderlands: 'Borderlands',
  real: 'Realistic',
};

/** Ground surfaces: ground colour grade and the ground pattern. */
export const GROUND_PATTERN: ReadonlySet<MaterialId> = new Set<MaterialId>([
  'lawn',
  'field',
  'asphalt',
  'pavers',
  'gravel',
  'soil',
]);

export interface StyleOptions {
  /** Tone mapping, shadow map and anisotropy (omit in unit tests). */
  renderer?: THREE.WebGLRenderer | null;
  /** The scene's hemisphere + sun lights (re-balanced per look, restored for real). */
  lighting?: { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight } | null;
  /** Parent element of the CSS overlays (default `#app`; none without a DOM). */
  overlayParent?: HTMLElement | null;
  /** Screen-space fat lines (default: from the config's `fatLines` and the device). */
  fatLines?: boolean;
  /** Called with the look's DPR cap on apply and `null` when back to real. */
  onPixelRatioCap?: (cap: number | null) => void;
  /** Config overrides per look (tests / look-dev). */
  configs?: Partial<Record<StyledName, StyleConfig>>;
}

type LineMat = LineMaterial | THREE.LineBasicMaterial;

interface StyleCache {
  name: StyledName;
  cfg: StyleConfig;
  gradient: THREE.DataTexture;
  textures: Map<SurfaceKind, THREE.DataTexture | null>;
  fills: Map<MaterialId, THREE.MeshToonMaterial>;
  /** Default line weight (the only one without `sharpLines`). */
  thin: LineMat;
  /** Heavy weight for boundaries / sharp edges (`sharpLines`). */
  thick: LineMat | null;
  hull: THREE.ShaderMaterial | null;
  ink: InkUniforms | null;
  sky: THREE.ShaderMaterial | null;
  /** Line / hull objects per styled mesh (created once, re-attached on re-apply). */
  parts: Map<THREE.Mesh, THREE.Object3D[]>;
  overlays: HTMLElement[] | null;
}

interface Saved {
  toneMapping: THREE.ToneMapping;
  exposure: number;
  fog: THREE.Scene['fog'];
  background: THREE.Scene['background'];
  hemi: { color: THREE.Color; ground: THREE.Color; intensity: number } | null;
  sun: {
    color: THREE.Color;
    intensity: number;
    shadowIntensity: number;
    radius: number;
    mapSize: number;
  } | null;
  sky: {
    mesh: THREE.Mesh;
    material: THREE.ShaderMaterial;
    values: Record<string, unknown>;
  } | null;
}

interface Active {
  name: StyledName;
  cache: StyleCache;
  originals: Map<THREE.Mesh, THREE.Material>;
  saved: Saved;
  onResize: (() => void) | null;
}

interface SceneState {
  options: StyleOptions;
  caches: Map<StyledName, StyleCache>;
  active: Active | null;
}

const scenes = new WeakMap<THREE.Scene, SceneState>();
/** CPU-side edge cache: computed once per geometry and settings, shared by the looks. */
const edgeCache = new WeakMap<
  THREE.BufferGeometry,
  Map<string, { thin: Float32Array; thick: Float32Array }>
>();

export function wantsFatLines(cfg: StyleConfig = SKETCHUP, touch = isTouchDevice()): boolean {
  return cfg.fatLines === 'always' || (cfg.fatLines === 'desktop' && !touch);
}

/** Palette id of a style-eligible mesh, or `null` (collider, sky, helpers, lines…). */
export function styleMaterialId(o: THREE.Object3D): MaterialId | null {
  if (!(o instanceof THREE.Mesh)) return null;
  const mesh = o as THREE.Mesh;
  if (o.userData.styleOwned === true || o.name === 'collider' || !o.visible) {
    return null;
  }
  const m = mesh.material;
  if (Array.isArray(m) || (m as THREE.ShaderMaterial).isShaderMaterial) return null;
  if (m.name in PALETTE) return m.name as MaterialId;
  if (o.name in PALETTE) return o.name as MaterialId;
  return null;
}

function weighted(
  geometry: THREE.BufferGeometry,
  cfg: StyleConfig,
  sharpDeg: number | null,
): { thin: Float32Array; thick: Float32Array } {
  const key = `${cfg.edgeThresholdDeg}|${sharpDeg}|${cfg.jitter}|${cfg.jitterMaxM}`;
  let byKey = edgeCache.get(geometry);
  if (!byKey) {
    byKey = new Map();
    edgeCache.set(geometry, byKey);
  }
  const hit = byKey.get(key);
  if (hit) return hit;
  const raw =
    sharpDeg === null
      ? { thin: new Float32Array(0), thick: extractFeatureEdges(geometry, cfg.edgeThresholdDeg) }
      : extractWeightedEdges(geometry, cfg.edgeThresholdDeg, sharpDeg);
  const out = {
    thin: jitterSegments(raw.thin, cfg.jitter, cfg.jitterMaxM),
    thick: jitterSegments(raw.thick, cfg.jitter, cfg.jitterMaxM),
  };
  byKey.set(key, out);
  return out;
}

/** Feature-edge segments of a merged mesh, one weight (cached per geometry and settings). */
export function edgeSegments(
  geometry: THREE.BufferGeometry,
  cfg: StyleConfig = SKETCHUP,
): Float32Array {
  return weighted(geometry, cfg, null).thick;
}

/** Feature-edge segments split into the two line weights of `cfg.sharpLines` (cached). */
export function weightedEdgeSegments(
  geometry: THREE.BufferGeometry,
  cfg: StyleConfig,
): { thin: Float32Array; thick: Float32Array } {
  return cfg.sharpLines
    ? weighted(geometry, cfg, cfg.sharpLines.minDeg)
    : { thin: edgeSegments(geometry, cfg), thick: new Float32Array(0) };
}

export function getStyle(scene: THREE.Scene): StyleName {
  return scenes.get(scene)?.active?.name ?? 'real';
}

/** Whether `name` can be applied without building resources first (real, or cached). */
export function isStyleBuilt(scene: THREE.Scene, name: string): boolean {
  const n = styleNameOf(name) ?? DEFAULT_STYLE;
  return n === 'real' || (scenes.get(scene)?.caches.has(n) ?? false);
}

/**
 * Switches the scene to `name` (`sketch` = `sketchup`; unknown → the default look).
 * Any → any; idempotent (same look again only styles meshes added since).
 */
export function setStyle(scene: THREE.Scene, name: string, options: StyleOptions = {}): void {
  const target = styleNameOf(name) ?? DEFAULT_STYLE;
  let st = scenes.get(scene);
  if (!st) {
    if (target === 'real') return;
    st = { options: {}, caches: new Map(), active: null };
    scenes.set(scene, st);
  }
  for (const [k, v] of Object.entries(options)) {
    if (v !== undefined) (st.options as Record<string, unknown>)[k] = v;
  }
  if (st.active?.name === target) {
    if (styleNewMeshes(scene, st.active)) requestShadowUpdate(st);
    return;
  }
  if (st.active) deactivate(scene, st);
  if (target !== 'real') activate(scene, st, target);
  requestShadowUpdate(st);
}

/** Applies a stylised look (default: SketchUp); see {@link setStyle}. */
export function applyStyle(
  scene: THREE.Scene,
  options: StyleOptions = {},
  name: StyledName = 'sketchup',
): void {
  setStyle(scene, name, options);
}

/** Back to the realistic look; cached style resources are kept for the next switch. */
export function removeStyle(scene: THREE.Scene): void {
  setStyle(scene, 'real');
}

/** Back to real and frees every cached style resource of the scene. */
export function disposeStyles(scene: THREE.Scene): void {
  const st = scenes.get(scene);
  if (!st) return;
  if (st.active) deactivate(scene, st);
  for (const cache of st.caches.values()) disposeCache(cache);
  st.caches.clear();
  scenes.delete(scene);
}

function requestShadowUpdate(st: SceneState): void {
  if (st.options.renderer) st.options.renderer.shadowMap.needsUpdate = true;
}

function makeLineMaterial(cfg: StyleConfig, fat: boolean, width: number, name: string): LineMat {
  const m: LineMat = fat
    ? new LineMaterial({ color: cfg.lineColor, linewidth: width, worldUnits: false })
    : new THREE.LineBasicMaterial({ color: cfg.lineColor });
  m.name = name;
  return m;
}

function getCache(st: SceneState, name: StyledName): StyleCache {
  let cache = st.caches.get(name);
  if (cache) return cache;
  const cfg = st.options.configs?.[name] ?? STYLES[name];
  const fat = st.options.fatLines ?? wantsFatLines(cfg);
  cache = {
    name,
    cfg,
    gradient: createGradientMap(cfg.bands, cfg.bandBrightness),
    textures: new Map(),
    fills: new Map(),
    thin: makeLineMaterial(cfg, fat, cfg.lineWidth, `${name}-lines`),
    thick: cfg.sharpLines
      ? makeLineMaterial(cfg, fat, cfg.sharpLines.width, `${name}-lines-sharp`)
      : null,
    hull: cfg.hulls ? createHullMaterial(cfg.lineColor, cfg.hulls.width) : null,
    ink: cfg.ink ? createInkUniforms() : null,
    sky: null,
    parts: new Map(),
    overlays: null,
  };
  cache.gradient.name = `${name}-gradient`;
  st.caches.set(name, cache);
  return cache;
}

function disposeCache(cache: StyleCache): void {
  for (const m of cache.fills.values()) m.dispose();
  cache.fills.clear();
  for (const t of cache.textures.values()) t?.dispose();
  cache.textures.clear();
  cache.gradient.dispose();
  cache.thin.dispose();
  cache.thick?.dispose();
  cache.hull?.dispose();
  cache.sky?.dispose();
  for (const parts of cache.parts.values()) {
    for (const p of parts) {
      p.removeFromParent();
      (p as THREE.Mesh).geometry.dispose();
    }
  }
  cache.parts.clear();
  for (const el of cache.overlays ?? []) el.remove();
  cache.overlays = null;
}

function surfaceTexture(
  st: SceneState,
  cache: StyleCache,
  kind: SurfaceKind,
): THREE.DataTexture | null {
  if (cache.textures.has(kind)) return cache.textures.get(kind)!;
  const cfg = cache.cfg;
  let tex: THREE.DataTexture | null = null;
  if (kind === 'paint' && cfg.paint.strength > 0) {
    tex = createPaintMap(cfg.paint.strength, cfg.paint.tileM);
  } else if (kind === 'grass' && cfg.grass.strength > 0) {
    tex = createGrassMap(cfg.grass.strength, cfg.grass.tileM);
  } else if (kind === 'grid' || kind === 'hatch') {
    tex = createGroundPattern(kind, cfg.groundPatternStrength);
  }
  if (tex) {
    tex.name = `${cache.name}-${kind}`;
    const r = st.options.renderer;
    if (r) tex.anisotropy = Math.min(4, r.capabilities.getMaxAnisotropy());
  }
  cache.textures.set(kind, tex);
  return tex;
}

function fillMaterial(
  st: SceneState,
  cache: StyleCache,
  id: MaterialId,
  original: THREE.Material,
): THREE.Material {
  let m = cache.fills.get(id);
  if (m) return m;
  const cfg = cache.cfg;
  const ground = GROUND_PATTERN.has(id);
  const kind = cfg.surfaces[id] ?? (ground ? cfg.groundPattern : 'none');
  m = new THREE.MeshToonMaterial({
    color: gradeColor(PALETTE[id].color, ground ? cfg.paletteGround : cfg.palette),
    gradientMap: cache.gradient,
    map: surfaceTexture(st, cache, kind),
    transparent: original.transparent,
    // The I1 palette opacity (the realistic glass is tuned separately).
    opacity: PALETTE[id].opacity ?? original.opacity,
    side: original.side,
    depthWrite: original.depthWrite,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });
  m.name = id;
  if (cache.ink && !original.transparent) applyInkShading(m, cache.ink);
  cache.fills.set(id, m);
  return m;
}

function lineObject(segments: Float32Array, mat: LineMat, name: string): THREE.Object3D {
  let line: THREE.Object3D;
  if (mat instanceof LineMaterial) {
    const g = new LineSegmentsGeometry();
    g.setPositions(segments);
    line = new LineSegments2(g, mat);
  } else {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(segments, 3));
    g.computeBoundingSphere();
    line = new THREE.LineSegments(g, mat);
  }
  line.name = name;
  return line;
}

function meshParts(
  cache: StyleCache,
  mesh: THREE.Mesh,
  id: MaterialId,
  original: THREE.Material,
): THREE.Object3D[] {
  let parts = cache.parts.get(mesh);
  if (parts) return parts;
  parts = [];
  const cfg = cache.cfg;
  const see = original.transparent;
  const lined = !cfg.noLines.includes(id) && (!see || cfg.linedTransparent.includes(id));
  if (lined) {
    if (cache.thick && !see) {
      const { thin, thick } = weightedEdgeSegments(mesh.geometry, cfg);
      if (thick.length > 0) parts.push(lineObject(thick, cache.thick, `${id}-edges-sharp`));
      if (thin.length > 0) parts.push(lineObject(thin, cache.thin, `${id}-edges`));
    } else {
      const all = edgeSegments(mesh.geometry, cfg);
      if (all.length > 0) parts.push(lineObject(all, cache.thin, `${id}-edges`));
    }
  }
  if (cache.hull && cfg.hulls && !see) {
    // `only` lists the hull materials explicitly (they may have no feature lines);
    // otherwise every lined mesh with curved facets gets one.
    const wanted = cfg.hulls.only ? cfg.hulls.only.includes(id) : !cfg.noLines.includes(id);
    const g = wanted ? curvedHullGeometry(mesh.geometry, cfg.hulls.maxCreaseDeg) : null;
    if (g) {
      const hull = new THREE.Mesh(g, cache.hull);
      hull.name = `${id}-hull`;
      parts.push(hull);
    }
  }
  for (const p of parts) {
    p.userData.styleOwned = true;
    p.matrixAutoUpdate = false;
    p.castShadow = false;
    p.receiveShadow = false;
    p.renderOrder = mesh.renderOrder;
  }
  cache.parts.set(mesh, parts);
  return parts;
}

/** Styles every eligible mesh not styled yet; returns whether any was. */
function styleNewMeshes(scene: THREE.Scene, active: Active): boolean {
  const st = scenes.get(scene)!;
  const meshes: [THREE.Mesh, MaterialId][] = [];
  scene.traverse((o) => {
    const id = styleMaterialId(o);
    if (id && !active.originals.has(o as THREE.Mesh)) meshes.push([o as THREE.Mesh, id]);
  });
  for (const [mesh, id] of meshes) {
    const original = mesh.material as THREE.Material;
    mesh.material = fillMaterial(st, active.cache, id, original);
    for (const p of meshParts(active.cache, mesh, id, original)) mesh.add(p);
    active.originals.set(mesh, original);
  }
  return meshes.length > 0;
}

function activate(scene: THREE.Scene, st: SceneState, name: StyledName): void {
  const cache = getCache(st, name);
  const active: Active = {
    name,
    cache,
    originals: new Map(),
    saved: saveEnvironment(scene, st.options),
    onResize: null,
  };
  st.active = active;
  applyEnvironment(scene, st, active);
  styleNewMeshes(scene, active);
}

function deactivate(scene: THREE.Scene, st: SceneState): void {
  const active = st.active;
  if (!active) return;
  for (const [mesh, original] of active.originals) {
    mesh.material = original;
    for (const p of active.cache.parts.get(mesh) ?? []) p.removeFromParent();
  }
  active.originals.clear();
  restoreEnvironment(scene, st, active);
  st.active = null;
}

function saveEnvironment(scene: THREE.Scene, options: StyleOptions): Saved {
  const sky = scene.getObjectByName('sky') as THREE.Mesh | undefined;
  const skyMat = sky?.material as THREE.ShaderMaterial | undefined;
  const hemi = options.lighting?.hemi;
  const sun = options.lighting?.sun;
  return {
    toneMapping: options.renderer?.toneMapping ?? THREE.NoToneMapping,
    exposure: options.renderer?.toneMappingExposure ?? 1,
    fog: scene.fog,
    background: scene.background,
    hemi: hemi
      ? { color: hemi.color.clone(), ground: hemi.groundColor.clone(), intensity: hemi.intensity }
      : null,
    sun: sun
      ? {
          color: sun.color.clone(),
          intensity: sun.intensity,
          shadowIntensity: sun.shadow.intensity,
          radius: sun.shadow.radius,
          mapSize: sun.shadow.mapSize.x,
        }
      : null,
    sky:
      sky && skyMat?.isShaderMaterial && 'zenith' in skyMat.uniforms
        ? {
            mesh: sky,
            material: skyMat,
            values: Object.fromEntries(
              ['zenith', 'horizon', 'ground', 'hdriMix'].map((k) => [k, skyMat.uniforms[k]?.value]),
            ),
          }
        : null,
  };
}

function createOverlays(cfg: StyleConfig): HTMLElement[] {
  const out: HTMLElement[] = [];
  if (typeof document === 'undefined') return out;
  if (cfg.paperOverlay > 0) {
    const url = paperGrainDataURL();
    if (url) {
      const el = document.createElement('div');
      el.className = 'paper-grain';
      el.style.backgroundImage = `url(${url})`;
      el.style.opacity = String(cfg.paperOverlay);
      out.push(el);
    }
  }
  if (cfg.vignette > 0) {
    const el = document.createElement('div');
    el.className = 'style-vignette';
    el.style.opacity = String(Math.min(1, cfg.vignette));
    out.push(el);
  }
  return out;
}

function applyEnvironment(scene: THREE.Scene, st: SceneState, active: Active): void {
  const { options } = st;
  const { cache, saved } = active;
  const cfg = cache.cfg;
  options.onPixelRatioCap?.(cfg.maxPixelRatio);
  const r = options.renderer;
  if (r) {
    r.toneMapping = cfg.toneMapping === 'neutral' ? THREE.NeutralToneMapping : THREE.NoToneMapping;
    r.toneMappingExposure = cfg.toneMappingExposure;
  }
  const horizon = new THREE.Color(cfg.sky.horizon);
  scene.fog = new THREE.Fog(horizon, cfg.fog.near, cfg.fog.far);
  scene.background = horizon.clone();
  const lit = options.lighting;
  if (saved.sky) {
    if (cfg.sky.clouds || cfg.sky.sunDisc) {
      if (!cache.sky) {
        const dir = lit
          ? new THREE.Vector3().subVectors(lit.sun.position, lit.sun.target.position).normalize()
          : null;
        cache.sky = createStylisedSkyMaterial(cfg.sky, dir);
      }
      saved.sky.mesh.material = cache.sky;
    } else {
      const u = saved.sky.material.uniforms;
      for (const k of ['zenith', 'horizon', 'ground'] as const) {
        if (u[k]) u[k].value = new THREE.Color(cfg.sky[k]);
      }
      // The realistic look's HDRI sky (sky.ts) is off in the stylised looks.
      if (u.hdriMix) u.hdriMix.value = 0;
    }
  }
  if (lit) {
    const L = cfg.light;
    lit.hemi.color.set(L.hemiSky);
    lit.hemi.groundColor.set(L.hemiGround);
    lit.hemi.intensity = L.hemiIntensity;
    lit.sun.color.set(L.sunColor);
    lit.sun.intensity = L.sunIntensity;
    // Toon direct light does not fall off with the angle, so a surface facing the sun
    // gets hemi + sun; in shadow it keeps hemi + sun·(1 − k). Pick k so the shadowed
    // surface is `shadowOpacity` darker than the sunlit one.
    const k = (cfg.shadowOpacity * (L.hemiIntensity + L.sunIntensity)) / L.sunIntensity;
    lit.sun.shadow.intensity = THREE.MathUtils.clamp(k, 0, 1);
    lit.sun.shadow.radius = cfg.shadowRadius;
    setShadowMapSize(lit.sun, cfg.shadowMapSize);
  }
  if (cache.ink && cfg.ink) {
    const u = cache.ink;
    u.inkSunLum.value = sunLuminance(cfg.light.sunColor, cfg.light.sunIntensity);
    u.inkTint.value.set(cfg.ink.tint);
    u.inkTintStrength.value = cfg.ink.tintStrength;
    u.inkHatch.value.set(
      cfg.ink.spacingPx,
      cfg.ink.widthPx,
      cfg.ink.strength,
      cfg.ink.crossStrength,
    );
    u.inkLevels.value.set(cfg.ink.hatchBelow, cfg.ink.crossBelow);
  }
  const parent =
    options.overlayParent ??
    (typeof document !== 'undefined' ? document.getElementById('app') : null);
  if (parent) {
    cache.overlays ??= createOverlays(cfg);
    for (const el of cache.overlays) parent.appendChild(el);
  }
  if (typeof window !== 'undefined') {
    const lineMats = [cache.thin, cache.thick].filter((m) => m instanceof LineMaterial);
    const onResize = (): void => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      for (const m of lineMats) m.resolution.set(w, h);
      (cache.hull?.uniforms.resolution?.value as THREE.Vector2 | undefined)?.set(w, h);
      if (cache.ink) cache.ink.inkPixelRatio.value = r?.getPixelRatio() ?? 1;
    };
    onResize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    active.onResize = onResize;
  }
}

function restoreEnvironment(scene: THREE.Scene, st: SceneState, active: Active): void {
  const { options } = st;
  const { saved, cache } = active;
  const r = options.renderer;
  if (r) {
    r.toneMapping = saved.toneMapping;
    r.toneMappingExposure = saved.exposure;
  }
  scene.fog = saved.fog;
  scene.background = saved.background;
  if (saved.sky) {
    saved.sky.mesh.material = saved.sky.material;
    const u = saved.sky.material.uniforms;
    for (const [k, v] of Object.entries(saved.sky.values)) if (u[k]) u[k].value = v;
  }
  const lit = options.lighting;
  if (lit && saved.hemi && saved.sun) {
    lit.hemi.color.copy(saved.hemi.color);
    lit.hemi.groundColor.copy(saved.hemi.ground);
    lit.hemi.intensity = saved.hemi.intensity;
    lit.sun.color.copy(saved.sun.color);
    lit.sun.intensity = saved.sun.intensity;
    lit.sun.shadow.intensity = saved.sun.shadowIntensity;
    lit.sun.shadow.radius = saved.sun.radius;
    setShadowMapSize(lit.sun, saved.sun.mapSize);
  }
  for (const el of cache.overlays ?? []) el.remove();
  if (active.onResize && typeof window !== 'undefined') {
    window.removeEventListener('resize', active.onResize);
    window.visualViewport?.removeEventListener('resize', active.onResize);
  }
  active.onResize = null;
  options.onPixelRatioCap?.(null);
}

/**
 * Sets the shadow map size of a (static) shadow; an allocated map of another size is
 * freed so the renderer re-creates it (once) at the new size.
 */
function setShadowMapSize(light: THREE.DirectionalLight, size: number): void {
  const shadow = light.shadow;
  shadow.mapSize.set(size, size);
  if (shadow.map && (shadow.map.width !== size || shadow.map.height !== size)) {
    shadow.map.depthTexture?.dispose();
    shadow.map.dispose();
    shadow.map = null;
  }
}
