/** WebGL2 renderer setup (plan.md §3/§4): AgX tone mapping, sRGB, capped DPR, static shadow map. */
import * as THREE from 'three';

export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' &&
  (window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);

let capOverride: number | null = null;
let tierCap: number | null = null;
let dynamicRatio: number | null = null;

/** Extra DPR cap (e.g. 1.5 in the sketch style); `null` removes it. */
export function setPixelRatioCap(cap: number | null): void {
  capOverride = cap;
}

/** DPR cap of the quality tier (plan.md §3); `null` = the device default below. */
export function setTierPixelRatioCap(cap: number | null): void {
  tierCap = cap;
}

/** Dynamic-resolution pixel ratio (clamped to the cap); `null` = the cap itself. */
export function setDynamicPixelRatio(ratio: number | null): void {
  dynamicRatio = ratio;
}

export function pixelRatioCap(): number {
  // Phones: ≤ 1.5 (fill-rate bound); desktop: ≤ 2 — then the tier's and the look's caps.
  let cap = isTouchDevice() ? 1.5 : 2;
  if (tierCap !== null) cap = Math.min(cap, tierCap);
  return capOverride === null ? cap : Math.min(cap, capOverride);
}

/** Pixel ratio to render at: device ratio, capped, then the dynamic-resolution value. */
export function targetPixelRatio(): number {
  const r = Math.min(window.devicePixelRatio || 1, pixelRatioCap());
  return dynamicRatio === null ? r : Math.min(r, Math.max(0.5, dynamicRatio));
}

export function createRenderer(
  canvas: HTMLCanvasElement,
  tonemap: string | null = null,
  antialias = true,
): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias,
    alpha: false,
    powerPreference: 'high-performance',
    stencil: false,
  });
  renderer.setPixelRatio(targetPixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // ACES Filmic keeps the bright, warm Scandinavian palette more saturated than AgX
  // (compared side by side); `?tonemap=agx` switches for look-dev.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  if (tonemap === 'agx') renderer.toneMapping = THREE.AgXToneMapping;
  if (tonemap === 'neutral') renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // The scene is static: render the shadow map once (plan.md §4.7).
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;
  return renderer;
}

export function handleResize(
  renderer: THREE.WebGLRenderer,
  camera: THREE.PerspectiveCamera,
): () => void {
  const apply = (): void => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setPixelRatio(targetPixelRatio());
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    // Keep a sensible horizontal field of view in portrait.
    camera.fov = camera.aspect < 1 ? 75 : 65;
    camera.updateProjectionMatrix();
  };
  window.addEventListener('resize', apply);
  window.visualViewport?.addEventListener('resize', apply);
  apply();
  return apply;
}

export function handleContextLoss(canvas: HTMLCanvasElement, onLost: () => void): void {
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault();
    onLost();
  });
  canvas.addEventListener('webglcontextrestored', () => {
    window.location.reload();
  });
}
