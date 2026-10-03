/**
 * Dev / test aid (tools/flicker-check.mjs): a small material-class mask of the current view,
 * so per-frame measurements can isolate glass and the other reflective finishes. Renders
 * the scene once into an off-screen target with flat colours, then restores everything.
 */
import * as THREE from 'three';

/** Mask classes: 0 = everything else, 1 = reflective (metal, stone, tile…), 2 = glass / mirror. */
export const MASK_GLASS: ReadonlySet<string> = new Set(['glass', 'mirror']);
export const MASK_REFLECTIVE: ReadonlySet<string> = new Set([
  'brass',
  'metalBlack',
  'grating',
  'ceramic',
  'travertine',
  'tile',
  'tileUtility',
  'tileWall',
  'frame',
  'cladMetal',
  'roofMetal',
  'doorLeaf',
  'smokedOak',
  'oak',
]);

export const maskClass = (materialName: string): 0 | 1 | 2 =>
  MASK_GLASS.has(materialName) ? 2 : MASK_REFLECTIVE.has(materialName) ? 1 : 0;

let target: THREE.WebGLRenderTarget | null = null;
const flat = [0, 1, 2].map(
  (c) =>
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(c / 2, 0, 0),
      side: THREE.DoubleSide,
      fog: false,
      toneMapped: false,
    }),
);

/** Class per pixel (row 0 = bottom), `width × height`. */
export function renderMask(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
  width: number,
  height: number,
): Uint8Array {
  if (!target || target.width !== width || target.height !== height) {
    target?.dispose();
    target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: true });
  }
  const swapped: [THREE.Mesh, THREE.Material | THREE.Material[]][] = [];
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const m = o as THREE.Mesh;
    swapped.push([m, m.material]);
    const pick = (mat: THREE.Material): THREE.Material => flat[maskClass(mat.name)]!;
    m.material = Array.isArray(m.material) ? m.material.map(pick) : pick(m.material);
  });
  const { background, fog } = scene;
  scene.background = null;
  scene.fog = null;
  const prev = renderer.getRenderTarget();
  const clear = renderer.getClearColor(new THREE.Color());
  const clearAlpha = renderer.getClearAlpha();
  renderer.setRenderTarget(target);
  renderer.setClearColor(0x000000, 1);
  renderer.clear();
  renderer.render(scene, camera);
  const rgba = new Uint8Array(width * height * 4);
  renderer.readRenderTargetPixels(target, 0, 0, width, height, rgba);
  renderer.setRenderTarget(prev);
  renderer.setClearColor(clear, clearAlpha);
  scene.background = background;
  scene.fog = fog;
  for (const [m, mat] of swapped) m.material = mat;
  const out = new Uint8Array(width * height);
  // The red channel holds the class (linear target, no tone mapping / colour conversion).
  for (let i = 0; i < out.length; i++) {
    const r = rgba[i * 4]!;
    out[i] = r > 191 ? 2 : r > 64 ? 1 : 0;
  }
  return out;
}
