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
  const target = new THREE.Vector3(8.5, 0, 6);
  sun.position.copy(target).addScaledVector(dir, 60);
  sun.target.position.copy(target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  const cam = sun.shadow.camera;
  cam.left = -24;
  cam.right = 24;
  cam.top = 20;
  cam.bottom = -20;
  cam.near = 20;
  cam.far = 110;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  sun.target.updateMatrixWorld();
  cam.updateProjectionMatrix();
  return { sun, hemi, sunDirection: dir };
}
