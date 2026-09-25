/**
 * Comic ink shading for `MeshToonMaterial` (Borderlands style): a small
 * `onBeforeCompile` patch that measures how much direct sun a fragment receives (after
 * the toon gradient and the shadow map), tints the shadow band toward a cool colour and
 * inks it with screen-space hatching (`gl_FragCoord`, no texture fetch) — single lines in
 * the shadow band, crossed lines in cast shadows. All patched materials share one
 * program (fixed cache key) and one set of uniforms.
 */
import * as THREE from 'three';

/** r186 chunk lines the patch hooks into (checked by the unit tests). */
export const INK_HOOKS = {
  pars: '#include <lights_toon_pars_fragment>',
  direct: 'reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );',
  output: '#include <opaque_fragment>',
} as const;

export interface InkUniforms {
  inkSunLum: THREE.IUniform<number>;
  inkTint: THREE.IUniform<THREE.Color>;
  inkTintStrength: THREE.IUniform<number>;
  /** x = spacing px, y = line width px, z = single strength, w = cross strength. */
  inkHatch: THREE.IUniform<THREE.Vector4>;
  /** x = hatch below this sun fraction, y = cross-hatch below. */
  inkLevels: THREE.IUniform<THREE.Vector2>;
  /** Device pixels per CSS pixel (hatch spacing is in CSS px). */
  inkPixelRatio: THREE.IUniform<number>;
}

export function createInkUniforms(): InkUniforms {
  return {
    inkSunLum: { value: 1 },
    inkTint: { value: new THREE.Color(1, 1, 1) },
    inkTintStrength: { value: 0 },
    inkHatch: { value: new THREE.Vector4(6, 1, 0, 0) },
    inkLevels: { value: new THREE.Vector2(0.6, 0.3) },
    inkPixelRatio: { value: 1 },
  };
}

/** Linear luminance of a sun with `color` × `intensity` (as the shader sees it). */
export function sunLuminance(color: THREE.ColorRepresentation, intensity: number): number {
  const c = new THREE.Color(color).multiplyScalar(intensity);
  return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
}

/** Whether this three.js build has the shader lines the patch hooks into. */
export function inkPatchSupported(): boolean {
  const pars = THREE.ShaderChunk.lights_toon_pars_fragment;
  const frag = THREE.ShaderLib.toon?.fragmentShader ?? '';
  return (
    pars.includes(INK_HOOKS.direct) &&
    frag.includes(INK_HOOKS.pars) &&
    frag.includes(INK_HOOKS.output)
  );
}

const PARS = /* glsl */ `
uniform float inkSunLum;
uniform vec3 inkTint;
uniform float inkTintStrength;
uniform vec4 inkHatch;
uniform vec2 inkLevels;
uniform float inkPixelRatio;
vec3 inkDirect = vec3( 0.0 );
float inkForm = 0.0;
`;

const OUTPUT = /* glsl */ `
{
  float inkLit = clamp( dot( inkDirect, vec3( 0.2126, 0.7152, 0.0722 ) ) / max( inkSunLum, 1e-4 ), 0.0, 1.0 );
  // Shadow-map factor alone (the toon band removed): < 1 in cast shadows.
  float inkShadow = inkLit / max( inkForm, 1e-3 );
  float inkShade = 1.0 - smoothstep( inkLevels.x - 0.03, inkLevels.x + 0.03, inkLit );
  float inkDeep = step( 0.75, inkForm ) * ( 1.0 - smoothstep( inkLevels.y - 0.03, inkLevels.y + 0.03, inkShadow ) );
  outgoingLight *= mix( vec3( 1.0 ), inkTint, inkShade * inkTintStrength );
  float s = inkHatch.x * inkPixelRatio;
  float hw = 0.5 * inkHatch.y * inkPixelRatio;
  vec2 fc = gl_FragCoord.xy;
  // Slight wobble so the hatching reads hand-drawn rather than as a screen tone.
  float wob = 0.4 * sin( fc.y * 0.043 + sin( fc.x * 0.021 ) * 2.0 );
  float d1 = abs( fract( ( fc.x + fc.y + wob * s ) / ( s * 1.41421 ) ) - 0.5 ) * s;
  float d2 = abs( fract( ( fc.x - fc.y - wob * s ) / ( s * 1.41421 ) ) - 0.5 ) * s;
  float l1 = 1.0 - smoothstep( hw - 0.5, hw + 0.5, d1 );
  float l2 = 1.0 - smoothstep( hw - 0.5, hw + 0.5, d2 );
  float ink = max( l1 * inkShade * inkHatch.z, l2 * inkDeep * inkHatch.w );
  outgoingLight *= 1.0 - ink;
}
`;

/**
 * Patches `mat` (idempotent). Returns `false` — leaving a plain toon material — when the
 * three.js shader chunks don't have the expected lines.
 */
export function applyInkShading(mat: THREE.MeshToonMaterial, uniforms: InkUniforms): boolean {
  if (!inkPatchSupported()) return false;
  if (mat.userData.inkShading === true) return true;
  mat.userData.inkShading = true;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    const pars = THREE.ShaderChunk.lights_toon_pars_fragment.replace(
      INK_HOOKS.direct,
      `inkDirect += irradiance;\n\tinkForm = max( inkForm, getGradientIrradiance( geometryNormal, directLight.direction ).r );\n\t${INK_HOOKS.direct}`,
    );
    shader.fragmentShader = shader.fragmentShader
      .replace(INK_HOOKS.pars, `${PARS}\n${pars}`)
      .replace(INK_HOOKS.output, `${OUTPUT}\n${INK_HOOKS.output}`);
  };
  mat.customProgramCacheKey = () => 'style-ink-v1';
  return true;
}
