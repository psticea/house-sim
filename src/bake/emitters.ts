/**
 * Ceiling lights in the bake (I6 redo): the fittings that are on (`src/data/lights.ts`)
 * become area lights, and the triangles of their diffusers (the opal part of a flush drum,
 * the whole paper globe of a pendant) are marked so the baker writes a glow there.
 * Pure (Node-safe, unit-tested).
 */
import * as THREE from 'three';
import { CEILING_LIGHTS, FLUSH, diffuserY, emitterOf, type CeilingLight } from '../data/lights';
import type { MaterialId } from '../data/schema';
import { DIFFUSER_MATERIAL } from '../world/furniture/lights';
import type { BakeEmitter, BakeMaterial } from './baker';

/** Lights that are on, in emitter order (index + 1 = the diffusers' mark). */
export const litLights = (lights: readonly CeilingLight[] = CEILING_LIGHTS): CeilingLight[] =>
  lights.filter((l) => l.on);

/** Is triangle (centroid c, unit normal n) part of the diffuser of `l`? */
export function onDiffuser(
  l: CeilingLight,
  c: readonly [number, number, number],
  n: readonly [number, number, number],
): boolean {
  if (l.kind === 'flush') {
    // The opal drum: side band + bottom (not the brass band at the top).
    const r = Math.hypot(c[0] - l.at[0], c[2] - l.at[1]);
    return (
      r <= l.radius + 0.003 &&
      c[1] >= diffuserY(l) - 0.003 &&
      c[1] <= l.ceilingY - FLUSH.band + 0.003 &&
      (n[1] < -0.9 || Math.abs(n[1]) < 0.1)
    );
  }
  const cy = l.centerY ?? l.ceilingY - 0.8;
  const d = Math.hypot(c[0] - l.at[0], c[1] - cy, c[2] - l.at[1]);
  return d <= l.radius + 0.002 && d >= l.radius * 0.8;
}

/**
 * Per-vertex mark of mesh `id`: emitter index + 1 on diffuser triangles, 0 elsewhere;
 * `null` if the mesh has none.
 */
export function markDiffusers(
  id: string,
  geometry: THREE.BufferGeometry,
  lights: readonly CeilingLight[] = CEILING_LIGHTS,
): Float32Array | null {
  const lit = litLights(lights);
  const mine = lit
    .map((l, k) => ({ l, k }))
    .filter(({ l }) => DIFFUSER_MATERIAL[l.kind] === (id as MaterialId));
  if (!mine.length) return null;
  const pos = geometry.getAttribute('position');
  const out = new Float32Array(pos.count);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const n = new THREE.Vector3();
  let any = false;
  for (let t = 0; t + 2 < pos.count; t += 3) {
    a.fromBufferAttribute(pos, t);
    b.fromBufferAttribute(pos, t + 1);
    c.fromBufferAttribute(pos, t + 2);
    const centroid: [number, number, number] = [
      (a.x + b.x + c.x) / 3,
      (a.y + b.y + c.y) / 3,
      (a.z + b.z + c.z) / 3,
    ];
    n.subVectors(c, b).cross(a.clone().sub(b)).normalize();
    if (geometry.hasAttribute('normal')) {
      n.fromBufferAttribute(geometry.getAttribute('normal'), t).normalize();
    }
    for (const { l, k } of mine) {
      if (!onDiffuser(l, centroid, [n.x, n.y, n.z])) continue;
      out[t] = out[t + 1] = out[t + 2] = k + 1;
      any = true;
      break;
    }
  }
  return any ? out : null;
}

/**
 * Area lights for the tracer; `glow` = lightmap value of the diffuser texels so that
 * albedo × glow / π shows the lamp's radiance (clamped by the RGBM range on export).
 */
export function bakeEmitters(
  materials: readonly BakeMaterial[],
  ids: readonly string[],
  lights: readonly CeilingLight[] = CEILING_LIGHTS,
): BakeEmitter[] {
  return litLights(lights).map((l) => {
    const e = emitterOf(l);
    const m = materials[ids.indexOf(DIFFUSER_MATERIAL[l.kind])];
    const radiance = new THREE.Color().setRGB(...e.radiance);
    const albedo = m?.albedo ?? new THREE.Color(0.8, 0.8, 0.8);
    const glow = new THREE.Color(
      (Math.PI * radiance.r) / Math.max(0.05, albedo.r),
      (Math.PI * radiance.g) / Math.max(0.05, albedo.g),
      (Math.PI * radiance.b) / Math.max(0.05, albedo.b),
    );
    return {
      center: new THREE.Vector3(...e.center),
      normal: new THREE.Vector3(...e.normal),
      radius: e.radius,
      shape: e.shape === 'sphere' ? 1 : 2,
      height: e.height,
      radiance,
      glow,
    };
  });
}
