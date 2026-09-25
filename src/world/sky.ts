/**
 * Sky dome + matching distance fog. The gradient is the flat fallback (and what the
 * stylised looks tint); the realistic look blends in the HDRI sky (`hdri*` uniforms,
 * `realLook.ts`) once it has loaded.
 */
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
      /** Equirectangular sky (sRGB LDR, `hdriScale` = linear radiance of 1.0). */
      hdri: { value: null as THREE.Texture | null },
      /** 0 = gradient, 1 = HDRI (set to 0 by the stylised looks). */
      hdriMix: { value: 0 },
      hdriScale: { value: 1 },
      /** Environment rotation about +y (radians), same convention as `scene.environmentRotation`. */
      hdriRotation: { value: 0 },
      /** Colour the HDRI fades to below the horizon (the fog colour). */
      hdriHorizon: { value: new THREE.Color('#dfe8ee') },
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
      uniform sampler2D hdri; uniform float hdriMix; uniform float hdriScale;
      uniform float hdriRotation; uniform vec3 hdriHorizon;
      varying vec3 vDir;
      void main() {
        vec3 d = normalize(vDir);
        float h = d.y;
        vec3 c = h > 0.0 ? mix(horizon, zenith, pow(clamp(h, 0.0, 1.0), 0.6))
                         : mix(horizon, ground, clamp(-h * 6.0, 0.0, 1.0));
        if (hdriMix > 0.0) {
          // Same lookup as three's equirectUv(), rotated like scene.environmentRotation.
          float cr = cos(hdriRotation); float sr = sin(hdriRotation);
          vec3 e = vec3(cr * d.x - sr * d.z, d.y, sr * d.x + cr * d.z);
          vec2 uv = vec2(atan(e.z, e.x) * 0.15915494 + 0.5,
                         asin(clamp(e.y, -1.0, 1.0)) * 0.31830989 + 0.5);
          vec3 s = texture2D(hdri, uv).rgb * hdriScale;
          s = mix(s, hdriHorizon, smoothstep(0.02, -0.06, h));
          c = mix(c, s, hdriMix);
        }
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
