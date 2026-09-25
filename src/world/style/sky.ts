/**
 * Stylised sky dome material (Borderlands): bold gradient (warm horizon → teal zenith),
 * flat cartoon clouds with flat bottoms, a shade band and ink outlines of constant pixel
 * width (`fwidth`), plus an optional inked sun disc. Clouds are generated from a seed
 * (no textures); everything is evaluated per pixel of the dome in one draw call.
 */
import * as THREE from 'three';
import type { StyleConfig } from './config';
import { seededRandom } from './textures';

export const MAX_PUFFS = 40;

export interface CloudPuffs {
  /** xyz = unit direction of the puff centre, w = angular radius (rad). */
  puffs: THREE.Vector4[];
  /** Flat cloud bottom (elevation, rad) per puff. */
  bases: number[];
}

/** Deterministic cloud layout: `count` clouds of 3–6 puffs spread around the horizon. */
export function generateClouds(count: number, seed: number): CloudPuffs {
  const rand = seededRandom(seed);
  const puffs: THREE.Vector4[] = [];
  const bases: number[] = [];
  const dir = (az: number, el: number): THREE.Vector3 =>
    new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
  for (let c = 0; c < count && puffs.length < MAX_PUFFS; c++) {
    const az = ((c + rand() * 0.7) / count) * Math.PI * 2;
    const base = 0.05 + rand() * 0.2;
    const size = 0.035 + rand() * 0.03;
    const n = 3 + Math.floor(rand() * 4);
    const width = size * (1.4 + n * 0.9);
    for (let i = 0; i < n && puffs.length < MAX_PUFFS; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const middle = 1 - Math.abs(t - 0.5) * 2;
      const r = size * (0.6 + 0.6 * middle + rand() * 0.25);
      const a = az + ((t - 0.5) * width) / Math.cos(base);
      const el = base + r * (0.35 + 0.3 * rand());
      const d = dir(a, el);
      puffs.push(new THREE.Vector4(d.x, d.y, d.z, r));
      bases.push(base);
    }
  }
  return { puffs, bases };
}

export function createStylisedSkyMaterial(
  sky: StyleConfig['sky'],
  sunDirection: THREE.Vector3 | null,
): THREE.ShaderMaterial {
  const clouds = sky.clouds;
  const { puffs, bases } = clouds
    ? generateClouds(clouds.count, clouds.seed)
    : { puffs: [], bases: [] };
  while (puffs.length < MAX_PUFFS) {
    puffs.push(new THREE.Vector4(0, -1, 0, 0));
    bases.push(10);
  }
  const disc = sky.sunDisc;
  return new THREE.ShaderMaterial({
    name: 'style-sky',
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      zenith: { value: new THREE.Color(sky.zenith) },
      horizon: { value: new THREE.Color(sky.horizon) },
      ground: { value: new THREE.Color(sky.ground) },
      cloudFill: { value: new THREE.Color(clouds?.fill ?? '#ffffff') },
      cloudShade: { value: new THREE.Color(clouds?.shade ?? '#dddddd') },
      outline: { value: new THREE.Color(clouds?.outline ?? '#111111') },
      outlinePx: { value: clouds?.outlinePx ?? 2 },
      puffs: { value: puffs },
      puffBase: { value: bases },
      sunDir: { value: (sunDirection ?? new THREE.Vector3(0, 1, 0)).clone().normalize() },
      sunRadius: { value: disc && sunDirection ? disc.radius : 0 },
      sunColor: { value: new THREE.Color(disc?.color ?? '#ffffff') },
    },
    defines: { MAX_PUFFS },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 zenith; uniform vec3 horizon; uniform vec3 ground;
      uniform vec3 cloudFill; uniform vec3 cloudShade; uniform vec3 outline;
      uniform float outlinePx;
      uniform vec4 puffs[MAX_PUFFS];
      uniform float puffBase[MAX_PUFFS];
      uniform vec3 sunDir; uniform float sunRadius; uniform vec3 sunColor;
      varying vec3 vDir;
      float angDist(vec3 a, vec3 b) { return sqrt(max(2.0 - 2.0 * dot(a, b), 0.0)); }
      void main() {
        vec3 dir = normalize(vDir);
        float h = dir.y;
        vec3 c = h > 0.0
          ? mix(horizon, zenith, smoothstep(0.0, 0.62, pow(h, 0.75)))
          : mix(horizon, ground, clamp(-h * 5.0, 0.0, 1.0));
        float el = asin(clamp(h, -1.0, 1.0));
        if (sunRadius > 0.0) {
          float ds = angDist(dir, sunDir) - sunRadius;
          float fw = max(fwidth(ds), 1e-5);
          c = mix(c, sunColor, 1.0 - smoothstep(-fw, 0.0, ds));
          c = mix(c, outline, smoothstep(-fw * (outlinePx + 1.0), -fw * outlinePx, ds) * (1.0 - smoothstep(0.0, fw, ds)));
        }
        float d = 1e3;
        float base = 0.0;
        for (int i = 0; i < MAX_PUFFS; i++) {
          vec4 p = puffs[i];
          if (p.w <= 0.0) continue;
          float dp = max(angDist(dir, p.xyz) - p.w, puffBase[i] - el);
          if (dp < d) { d = dp; base = puffBase[i]; }
        }
        float fw = max(fwidth(d), 1e-5);
        if (d < fw) {
          vec3 fill = (el - base) < 0.018 ? cloudShade : cloudFill;
          c = mix(c, fill, 1.0 - smoothstep(-fw, 0.0, d));
          c = mix(c, outline, smoothstep(-fw * (outlinePx + 1.0), -fw * outlinePx, d) * (1.0 - smoothstep(0.0, fw, d)));
        }
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
}
