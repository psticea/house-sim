/** Lighting fallback for I1–I5 (plan.md §4.7): hemisphere sky light + sun with a static shadow map. */
import * as THREE from 'three';
import type { Site } from '../data/schema';

export interface Lighting {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  sunDirection: THREE.Vector3;
}

/**
 * World direction toward the sun. True north = plan north (−z) rotated `trueNorthDeg`
 * toward −x; azimuth is measured clockwise from true north.
 */
export function sunDirection(site: Site): THREE.Vector3 {
  const tn = THREE.MathUtils.degToRad(site.trueNorthDeg);
  const north = new THREE.Vector3(-Math.sin(tn), 0, -Math.cos(tn));
  const east = new THREE.Vector3(Math.cos(tn), 0, -Math.sin(tn));
  const az = THREE.MathUtils.degToRad(site.sun.azimuthDeg);
  const el = THREE.MathUtils.degToRad(site.sun.elevationDeg);
  const horizontal = north.multiplyScalar(Math.cos(az)).add(east.multiplyScalar(Math.sin(az)));
  return horizontal.multiplyScalar(Math.cos(el)).setY(Math.sin(el)).normalize();
}

export function createLighting(scene: THREE.Scene, site: Site, shadowMapSize: number): Lighting {
  const hemi = new THREE.HemisphereLight('#e4edf6', '#d6cebd', 2.7);
  scene.add(hemi);

  const dir = sunDirection(site);
  const sun = new THREE.DirectionalLight('#fff4e2', 3.4);
  // Centre of the lot; the static shadow covers the whole garden (lot + fence + trees).
  const target = new THREE.Vector3();
  for (const [x, z] of site.lot) target.add(new THREE.Vector3(x, 0, z));
  target.divideScalar(site.lot.length);
  sun.position.copy(target).addScaledVector(dir, 60);
  sun.target.position.copy(target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  const cam = sun.shadow.camera;
  fitShadowCamera(cam, sun.position, target, site.lot, [-0.4, 9]);
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  sun.target.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return { sun, hemi, sunDirection: dir };
}

/**
 * Tight orthographic bounds (light space) around the lot polygon extruded over the
 * height range `ys` (0.5 m margin), so no texel is spent outside the garden.
 */
export function fitShadowCamera(
  cam: THREE.OrthographicCamera,
  from: THREE.Vector3,
  target: THREE.Vector3,
  lot: Site['lot'],
  ys: readonly [number, number],
): void {
  const view = new THREE.Matrix4().lookAt(from, target, new THREE.Vector3(0, 1, 0));
  view.setPosition(from);
  view.invert();
  const box = new THREE.Box3();
  const p = new THREE.Vector3();
  for (const [x, z] of lot) {
    for (const y of ys) box.expandByPoint(p.set(x, y, z).applyMatrix4(view));
  }
  const m = 0.5;
  cam.left = box.min.x - m;
  cam.right = box.max.x + m;
  cam.bottom = box.min.y - m;
  cam.top = box.max.y + m;
  cam.near = Math.max(0.5, -box.max.z - 10);
  cam.far = -box.min.z + 10;
}
