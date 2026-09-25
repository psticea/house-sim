/** Gradient sky dome + matching distance fog. */
import * as THREE from 'three';

export const SKY = {
  zenith: new THREE.Color('#7fa7d4'),
  horizon: new THREE.Color('#dfe8ee'),
  ground: new THREE.Color('#c9cfc4'),
};

export function createSky(scene: THREE.Scene): THREE.Mesh {
  const geo = new THREE.SphereGeometry(900, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: SKY.zenith },
      horizon: { value: SKY.horizon },
      ground: { value: SKY.ground },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // always at the far plane
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = h > 0.0 ? mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.6))
                         : mix(horizon, ground, clamp(-h * 6.0, 0.0, 1.0));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(geo, mat);
  sky.name = 'sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  sky.matrixAutoUpdate = false;
  scene.add(sky);
  scene.fog = new THREE.Fog(SKY.horizon.clone(), 70, 420);
  scene.background = null;
  return sky;
}
