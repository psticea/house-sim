/**
 * Composable `onBeforeCompile` patches: several features (anti-tiling, baked lighting)
 * can patch the same material; each registers under a key, patches run in key order and
 * the program cache key combines them (one program per combination).
 */
import type * as THREE from 'three';

export type ShaderPatch = (shader: THREE.WebGLProgramParametersWithUniforms) => void;

interface Patched {
  patches: Map<string, ShaderPatch>;
}

export function setShaderPatch(
  material: THREE.Material,
  key: string,
  patch: ShaderPatch | null,
): void {
  const ud = material.userData as Partial<Patched>;
  const patches = (ud.patches ??= new Map<string, ShaderPatch>());
  if (patch) patches.set(key, patch);
  else patches.delete(key);
  const keys = [...patches.keys()].sort();
  material.onBeforeCompile = (shader) => {
    for (const k of keys) patches.get(k)?.(shader);
  };
  const cacheKey = keys.join('|');
  material.customProgramCacheKey = () => cacheKey;
  material.needsUpdate = true;
}

export function hasShaderPatch(material: THREE.Material, key: string): boolean {
  return (material.userData as Partial<Patched>).patches?.has(key) ?? false;
}
