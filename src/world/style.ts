/**
 * Sketch look — the default (`?style=real` opts out; plan.md S1): SketchUp-like
 * architecture with a light cartoon touch, applied on top of the realistic scene. Only
 * materials, lights and rendering settings change — the scene graph built by
 * `buildWorld` is restyled in place and fully restored (realistic look) by `removeStyle`.
 *
 * - Fills: one shared `MeshToonMaterial` per material id (pastel palette colour, subtle
 *   `STYLE.bands`-step gradient map, polygon offset so lines win the depth test).
 * - Lines: feature edges computed once per merged mesh (cached on the CPU), drawn with
 *   screen-space fat lines on desktop and 1 px GL lines on phones.
 * - Light: the existing hemisphere + sun, re-balanced; one soft 1024 shadow map whose
 *   darkness follows `STYLE.shadowOpacity` (three's native `shadow.intensity`).
 * - Environment: pale sky + matching fog, neutral tone mapping, DPR ≤ 1.5, paper grain.
 */
import * as THREE from 'three';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import type { MaterialId } from '../data/schema';
import { isTouchDevice } from '../core/renderer';
import { PALETTE } from './materials';
import { STYLE, type StyleConfig } from './style/config';
import { extractFeatureEdges, jitterSegments } from './style/edges';
import {
  createGradientMap,
  createGroundPattern,
  paperGrainDataURL,
  pastelColor,
} from './style/textures';

export { STYLE } from './style/config';
export type StyleName = 'real' | 'sketch';

/** Materials without edge lines (see-through, or large ground surfaces). */
export const NO_LINES: ReadonlySet<MaterialId> = new Set<MaterialId>([
  'glass',
  'lawn',
  'field',
  'asphalt',
]);
/** Ground surfaces that get the generated grid/hatch pattern. */
export const GROUND_PATTERN: ReadonlySet<MaterialId> = new Set<MaterialId>([
  'lawn',
  'field',
  'asphalt',
  'pavers',
]);

export interface StyleOptions {
  /** Tone mapping, shadow map and anisotropy (omit in unit tests). */
  renderer?: THREE.WebGLRenderer | null;
  /** The scene's hemisphere + sun lights (re-balanced in sketch mode, restored after). */
  lighting?: { hemi: THREE.HemisphereLight; sun: THREE.DirectionalLight } | null;
  /** Parent element of the paper-grain overlay (default `#app`; none without a DOM). */
  overlayParent?: HTMLElement | null;
  /** Screen-space fat lines (default: from `STYLE.fatLines` and the device type). */
  fatLines?: boolean;
  /** Called with the sketch DPR cap on apply and `null` on remove. */
  onPixelRatioCap?: (cap: number | null) => void;
  config?: StyleConfig;
}

type LineMat = LineMaterial | THREE.LineBasicMaterial;

interface Styled {
  original: THREE.Material;
  line: THREE.Object3D | null;
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
    mapSize: THREE.Vector2;
  } | null;
  sky: { mat: THREE.ShaderMaterial; values: Record<string, unknown> } | null;
}

interface StyleState {
  cfg: StyleConfig;
  options: StyleOptions;
  gradient: THREE.DataTexture;
  ground: THREE.DataTexture | null;
  fills: Map<MaterialId, THREE.MeshToonMaterial>;
  lineMat: LineMat;
  styled: Map<THREE.Mesh, Styled>;
  saved: Saved;
  overlay: HTMLElement | null;
  onResize: (() => void) | null;
}

const states = new WeakMap<THREE.Scene, StyleState>();
/** CPU-side edge cache: computed once per geometry, reused across style toggles. */
const edgeCache = new WeakMap<THREE.BufferGeometry, { key: string; segments: Float32Array }>();

export function wantsFatLines(cfg: StyleConfig = STYLE, touch = isTouchDevice()): boolean {
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

/** Feature-edge segments for a merged mesh (cached per geometry and settings). */
export function edgeSegments(
  geometry: THREE.BufferGeometry,
  cfg: StyleConfig = STYLE,
): Float32Array {
  const key = `${cfg.edgeThresholdDeg}|${cfg.jitter}|${cfg.jitterMaxM}`;
  const hit = edgeCache.get(geometry);
  if (hit?.key === key) return hit.segments;
  const segments = jitterSegments(
    extractFeatureEdges(geometry, cfg.edgeThresholdDeg),
    cfg.jitter,
    cfg.jitterMaxM,
  );
  edgeCache.set(geometry, { key, segments });
  return segments;
}

export function getStyle(scene: THREE.Scene): StyleName {
  return states.has(scene) ? 'sketch' : 'real';
}

export function setStyle(scene: THREE.Scene, name: StyleName, options: StyleOptions = {}): void {
  if (name === 'sketch') applyStyle(scene, options);
  else removeStyle(scene);
}

/**
 * Switches the scene to the sketch look. Idempotent: a second call only styles meshes
 * added since the first (no duplicated lines, no new shared resources).
 */
export function applyStyle(scene: THREE.Scene, options: StyleOptions = {}): void {
  let state = states.get(scene);
  if (!state) {
    state = createState(scene, options);
    states.set(scene, state);
    applyEnvironment(scene, state);
  }
  const meshes: [THREE.Mesh, MaterialId][] = [];
  scene.traverse((o) => {
    const id = styleMaterialId(o);
    if (id && !state.styled.has(o as THREE.Mesh)) meshes.push([o as THREE.Mesh, id]);
  });
  for (const [mesh, id] of meshes) styleMesh(state, mesh, id);
  if (options.renderer ?? state.options.renderer) {
    (options.renderer ?? state.options.renderer)!.shadowMap.needsUpdate = true;
  }
}

/** Restores the original materials, lights and renderer settings; disposes style resources. */
export function removeStyle(scene: THREE.Scene): void {
  const state = states.get(scene);
  if (!state) return;
  for (const [mesh, s] of state.styled) {
    mesh.material = s.original;
    delete mesh.userData.sketchStyled;
    if (s.line) {
      s.line.removeFromParent();
      (s.line as THREE.LineSegments).geometry.dispose();
    }
  }
  state.styled.clear();
  for (const m of state.fills.values()) m.dispose();
  state.fills.clear();
  state.lineMat.dispose();
  state.gradient.dispose();
  state.ground?.dispose();
  restoreEnvironment(scene, state);
  states.delete(scene);
}

function createState(scene: THREE.Scene, options: StyleOptions): StyleState {
  const cfg = options.config ?? STYLE;
  const fat = options.fatLines ?? wantsFatLines(cfg);
  const lineMat: LineMat = fat
    ? new LineMaterial({ color: cfg.lineColor, linewidth: cfg.lineWidth, worldUnits: false })
    : new THREE.LineBasicMaterial({ color: cfg.lineColor });
  lineMat.name = 'sketch-lines';
  const ground = createGroundPattern(cfg.groundPattern, cfg.groundPatternStrength);
  if (ground && options.renderer) {
    ground.anisotropy = Math.min(4, options.renderer.capabilities.getMaxAnisotropy());
  }
  const sky = scene.getObjectByName('sky') as THREE.Mesh | undefined;
  const skyMat = sky?.material as THREE.ShaderMaterial | undefined;
  const hemi = options.lighting?.hemi;
  const sun = options.lighting?.sun;
  return {
    cfg,
    options,
    gradient: createGradientMap(cfg.bands, cfg.bandBrightness),
    ground,
    fills: new Map(),
    lineMat,
    styled: new Map(),
    overlay: null,
    onResize: null,
    saved: {
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
            mapSize: sun.shadow.mapSize.clone(),
          }
        : null,
      sky:
        skyMat?.isShaderMaterial && 'zenith' in skyMat.uniforms
          ? {
              mat: skyMat,
              values: Object.fromEntries(
                ['zenith', 'horizon', 'ground'].map((k) => [k, skyMat.uniforms[k]?.value]),
              ),
            }
          : null,
    },
  };
}

function fillMaterial(state: StyleState, id: MaterialId, original: THREE.Material): THREE.Material {
  let m = state.fills.get(id);
  if (!m) {
    const spec = PALETTE[id];
    m = new THREE.MeshToonMaterial({
      color: pastelColor(
        spec.color,
        GROUND_PATTERN.has(id) ? state.cfg.pastelGround : state.cfg.pastel,
      ),
      gradientMap: state.gradient,
      map: GROUND_PATTERN.has(id) ? state.ground : null,
      transparent: original.transparent,
      opacity: original.opacity,
      side: original.side,
      depthWrite: original.depthWrite,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });
    m.name = id;
    state.fills.set(id, m);
  }
  return m;
}

function styleMesh(state: StyleState, mesh: THREE.Mesh, id: MaterialId): void {
  const original = mesh.material as THREE.Material;
  mesh.material = fillMaterial(state, id, original);
  mesh.userData.sketchStyled = true;
  let line: THREE.Object3D | null = null;
  if (!NO_LINES.has(id) && !original.transparent) {
    const segments = edgeSegments(mesh.geometry, state.cfg);
    if (segments.length > 0) {
      if (state.lineMat instanceof LineMaterial) {
        const g = new LineSegmentsGeometry();
        g.setPositions(segments);
        line = new LineSegments2(g, state.lineMat);
      } else {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(segments, 3));
        g.computeBoundingSphere();
        line = new THREE.LineSegments(g, state.lineMat);
      }
      line.name = `${id}-edges`;
      line.userData.styleOwned = true;
      line.matrixAutoUpdate = false;
      line.castShadow = false;
      line.receiveShadow = false;
      line.renderOrder = mesh.renderOrder;
      mesh.add(line);
    }
  }
  state.styled.set(mesh, { original, line });
}

function applyEnvironment(scene: THREE.Scene, state: StyleState): void {
  const { cfg, options, saved } = state;
  const r = options.renderer;
  if (r) {
    r.toneMapping = cfg.toneMapping === 'neutral' ? THREE.NeutralToneMapping : THREE.NoToneMapping;
    r.toneMappingExposure = cfg.toneMappingExposure;
  }
  const horizon = new THREE.Color(cfg.sky.horizon);
  scene.fog = new THREE.Fog(horizon, cfg.fog.near, cfg.fog.far);
  scene.background = horizon.clone();
  if (saved.sky) {
    const u = saved.sky.mat.uniforms;
    for (const k of ['zenith', 'horizon', 'ground'] as const) {
      if (u[k]) u[k].value = new THREE.Color(cfg.sky[k]);
    }
  }
  const lit = options.lighting;
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
  if (cfg.paperOverlay > 0 && typeof document !== 'undefined') {
    const parent = options.overlayParent ?? document.getElementById('app');
    const url = parent ? paperGrainDataURL() : null;
    if (parent && url) {
      const el = document.createElement('div');
      el.className = 'paper-grain';
      el.style.backgroundImage = `url(${url})`;
      el.style.opacity = String(cfg.paperOverlay);
      parent.appendChild(el);
      state.overlay = el;
    }
  }
  const lineMat = state.lineMat;
  if (lineMat instanceof LineMaterial && typeof window !== 'undefined') {
    const onResize = (): void => {
      lineMat.resolution.set(window.innerWidth, window.innerHeight);
    };
    onResize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    state.onResize = onResize;
  }
  options.onPixelRatioCap?.(cfg.maxPixelRatio);
}

function restoreEnvironment(scene: THREE.Scene, state: StyleState): void {
  const { options, saved } = state;
  const r = options.renderer;
  if (r) {
    r.toneMapping = saved.toneMapping;
    r.toneMappingExposure = saved.exposure;
    r.shadowMap.needsUpdate = true;
  }
  scene.fog = saved.fog;
  scene.background = saved.background;
  if (saved.sky) {
    const u = saved.sky.mat.uniforms;
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
    setShadowMapSize(lit.sun, saved.sun.mapSize.x);
  }
  state.overlay?.remove();
  state.overlay = null;
  if (state.onResize && typeof window !== 'undefined') {
    window.removeEventListener('resize', state.onResize);
    window.visualViewport?.removeEventListener('resize', state.onResize);
  }
  state.onResize = null;
  options.onPixelRatioCap?.(null);
}

/** Resizes a (static) shadow map: the old render target is freed and re-rendered once. */
function setShadowMapSize(light: THREE.DirectionalLight, size: number): void {
  const shadow = light.shadow;
  if (shadow.mapSize.x === size && shadow.mapSize.y === size) return;
  shadow.mapSize.set(size, size);
  if (shadow.map) {
    shadow.map.depthTexture?.dispose();
    shadow.map.dispose();
    shadow.map = null;
  }
}
