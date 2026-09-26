/**
 * GPU lightmap baker (plan.md §4.1 steps 3–5, I6 steps 6.2–6.4), used by `bake.html`:
 * texture-space G-buffer → three-mesh-bvh ray tracing (soft sun, HDRI sky, progressive
 * radiosity bounces through the previous iteration's lightmap, glass lets light through
 * tinted) → leak-safe validity (texels inside geometry see back faces) → dilation →
 * edge-aware denoise of the indirect part → float irradiance per atlas texel.
 */
import * as THREE from 'three';
import { FullScreenQuad } from 'three/examples/jsm/postprocessing/Pass.js';
import { FloatVertexAttributeTexture, MeshBVH, MeshBVHUniformStruct, SAH } from 'three-mesh-bvh';

export interface BakeMaterial {
  /** Linear diffuse albedo used for bounces. */
  albedo: THREE.Color;
  baked: boolean;
  glass: boolean;
  /** Two-sided / thin (vegetation): back-face hits don't mean "inside geometry". */
  thin: boolean;
}

export interface BakeMesh {
  geometry: THREE.BufferGeometry;
  material: number;
  /** Atlas of a lightmapped mesh (its geometry has the quantised `uv1`), else -1. */
  atlas: number;
}

export interface BakeSettings {
  atlasSize: number;
  atlases: number;
  sunDirection: THREE.Vector3;
  /** Linear sun irradiance on a surface facing it (colour × intensity). */
  sunColor: THREE.Color;
  sunRadiusDeg: number;
  sky: THREE.Texture;
  skyRotation: number;
  skyScale: number;
  skyHorizon: THREE.Color;
  glass: THREE.Color;
  /** Triangles with a longer edge stay out of the BVH (far ground, hills). */
  maxEdge: number;
  stackDepth: number;
  /** Sky / bounce rays that hit nothing closer see the sky (or the far ground). */
  maxDistance: number;
  /** Escape-pointer traversal instead of a per-ray stack. */
  stackless: boolean;
  /** Radiance of the (analytic) far ground below the horizon. */
  ground: THREE.Color;
  /** Irradiance assumed on surfaces without a lightmap (vegetation) for bounces. */
  unbakedIrradiance: THREE.Color;
  sunSamples: number;
  /** Sky / bounce samples per radiosity iteration (length = number of iterations). */
  skySamples: number[];
  tile: number;
  onProgress?: (label: string, fraction: number) => void | Promise<void>;
  /** Debug: G-buffer coverage and back-face ratio per texel after the first sky pass. */
  onMask?: (atlas: number, covered: Uint8Array, back: Float32Array) => void;
}

export interface BakeOutput {
  /** RGBA float per atlas: rgb = irradiance, a = 1 where valid (chart or dilated padding). */
  atlases: Float32Array[];
  stats: { rays: number; seconds: number; coverage: number[] };
}

const HEADER = /* glsl */ `
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp usampler2D;
precision highp isampler2D;
`;

const QUAD_VERT = /* glsl */ `${HEADER}
in vec3 position;
void main() { gl_Position = vec4( position.xy, 0.0, 1.0 ); }
`;

const GBUF_VERT = /* glsl */ `${HEADER}
in vec3 position;
in vec3 normal;
in vec2 uv1;
uniform vec2 jitter;
uniform float atlasSize;
out vec3 vPos;
out vec3 vNrm;
void main() {
  vPos = position;
  vNrm = normal;
  vec2 p = uv1 + jitter / atlasSize;
  gl_Position = vec4( p * 2.0 - 1.0, 0.0, 1.0 );
}
`;

const GBUF_FRAG = /* glsl */ `${HEADER}
in vec3 vPos;
in vec3 vNrm;
layout( location = 0 ) out vec4 oPos;
layout( location = 1 ) out vec4 oNrm;
void main() {
  oPos = vec4( vPos, 1.0 );
  oNrm = vec4( normalize( vNrm ), 1.0 );
}
`;

const TRACE_FRAG = /* glsl */ `${HEADER}
#define PI 3.141592653589793
// BVH data (three-mesh-bvh layout) re-laid out 4096 texels wide: fetches by shift / mask.
uniform sampler2D bvhPos;
uniform usampler2D bvhIndex;
uniform sampler2D bvhBounds;
uniform usampler2D bvhContents;
uniform sampler2D lmAttr;
uniform sampler2D gPos;
uniform sampler2D gNrm;
uniform sampler2D prev0;
uniform sampler2D prev1;
uniform vec4 mats[ MAT_COUNT ];
uniform sampler2D sky;
uniform float skyRot;
uniform float skyScale;
uniform vec3 skyHorizon;
uniform vec3 groundRadiance;
uniform vec3 sunDir;
uniform vec3 sunColor;
uniform float sunCos;
uniform vec3 glassTint;
uniform vec3 unbakedIrr;
uniform float maxDist;
uniform sampler2D validMask;
uniform float useMask;
uniform int mode;
uniform uint seed;
uniform float sampleIndex;
uniform float sampleCount;
uniform int atlasSize;
out vec4 outColor;

uint hash( uint x ) {
  x ^= x >> 16; x *= 0x7feb352du; x ^= x >> 15; x *= 0x846ca68bu; x ^= x >> 16;
  return x;
}
float rnd( inout uint s ) { s = hash( s ); return float( s ) / 4294967296.0; }
float radicalInverse( uint b ) {
  b = ( b << 16u ) | ( b >> 16u );
  b = ( ( b & 0x55555555u ) << 1u ) | ( ( b & 0xAAAAAAAAu ) >> 1u );
  b = ( ( b & 0x33333333u ) << 2u ) | ( ( b & 0xCCCCCCCCu ) >> 2u );
  b = ( ( b & 0x0F0F0F0Fu ) << 4u ) | ( ( b & 0xF0F0F0F0u ) >> 4u );
  b = ( ( b & 0x00FF00FFu ) << 8u ) | ( ( b & 0xFF00FF00u ) >> 8u );
  return float( b ) * 2.3283064365386963e-10;
}
void basis( vec3 n, out vec3 t, out vec3 b ) {
  t = normalize( abs( n.y ) < 0.99 ? cross( n, vec3( 0.0, 1.0, 0.0 ) ) : cross( n, vec3( 1.0, 0.0, 0.0 ) ) );
  b = cross( n, t );
}
vec3 skyRadiance( vec3 d ) {
  float cr = cos( skyRot );
  float sr = sin( skyRot );
  vec3 e = vec3( cr * d.x - sr * d.z, d.y, sr * d.x + cr * d.z );
  vec2 uv = vec2( atan( e.z, e.x ) * 0.15915494 + 0.5, asin( clamp( e.y, -1.0, 1.0 ) ) * 0.31830989 + 0.5 );
  vec3 s = textureLod( sky, uv, 0.0 ).rgb * skyScale;
  s = mix( s, skyHorizon, smoothstep( 0.02, -0.02, d.y ) );
  return mix( s, groundRadiance, smoothstep( -0.0, -0.06, d.y ) );
}
ivec2 at( uint i ) { return ivec2( int( i & 4095u ), int( i >> 12u ) ); }
vec4 attrAt( uint v ) { return texelFetch( lmAttr, at( v ), 0 ); }
int flagsOf( uint v ) { return int( mats[ int( attrAt( v ).w + 0.5 ) ].w + 0.5 ); }
/**
 * BVH traversal. anyHit: stop at the first opaque triangle (shadow rays; glass
 * triangles on the way tint tp). Otherwise closest hit (face, barycentrics, side).
 */
bool traverse( vec3 o, vec3 d, bool anyHit, float maxDist, inout vec3 tp, out uvec3 face, out vec3 bary, out float side, out float dist ) {
  vec3 invDir = 1.0 / d;
  float best = maxDist;
  bool found = false;
  face = uvec3( 0u );
  bary = vec3( 0.0 );
  side = 1.0;
#ifdef STACKLESS
  // Escape-pointer traversal (no per-ray stack array: much cheaper on older GPUs).
  uint node = 0u;
  while ( node != 0xffffffffu ) {
    uvec4 info4 = texelFetch( bvhContents, at( node ), 0 );
    uint escape = info4.z;
#else
  uint stack[ STACK ];
  int ptr = 0;
  stack[ 0 ] = 0u;
  while ( ptr >= 0 ) {
    uint node = stack[ ptr ];
    ptr --;
#endif
    vec3 t0 = ( texelFetch( bvhBounds, at( node * 2u ), 0 ).xyz - o ) * invDir;
    vec3 t1 = ( texelFetch( bvhBounds, at( node * 2u + 1u ), 0 ).xyz - o ) * invDir;
    vec3 tn = min( t0, t1 );
    vec3 tf = max( t0, t1 );
    float a = max( max( tn.x, tn.y ), max( tn.z, 0.0 ) );
    float b = min( min( tf.x, tf.y ), tf.z );
#ifdef STACKLESS
    if ( b < a || a > best ) { node = escape; continue; }
    uvec2 info = info4.xy;
#else
    if ( b < a || a > best ) continue;
    uvec2 info = texelFetch( bvhContents, at( node ), 0 ).xy;
#endif
    if ( ( info.x & 0xffff0000u ) != 0u ) {
      uint end = info.y + ( info.x & 0xffffu );
      for ( uint i = info.y; i < end; i ++ ) {
        uvec3 idx = texelFetch( bvhIndex, at( i ), 0 ).xyz;
        vec3 pa = texelFetch( bvhPos, at( idx.x ), 0 ).xyz;
        vec3 e1 = texelFetch( bvhPos, at( idx.y ), 0 ).xyz - pa;
        vec3 e2 = texelFetch( bvhPos, at( idx.z ), 0 ).xyz - pa;
        vec3 pv = cross( d, e2 );
        float det = dot( e1, pv );
        if ( abs( det ) < 1e-14 ) continue;
        float inv = 1.0 / det;
        vec3 tv = o - pa;
        float u = dot( tv, pv ) * inv;
        if ( u < -1e-5 || u > 1.00001 ) continue;
        vec3 qv = cross( tv, e1 );
        float v = dot( d, qv ) * inv;
        if ( v < -1e-5 || u + v > 1.00001 ) continue;
        float t = dot( e2, qv ) * inv;
        if ( t <= 0.0 || t >= best ) continue;
        if ( anyHit ) {
          if ( ( flagsOf( idx.x ) & 2 ) != 0 ) { tp *= glassTint; continue; }
          dist = t;
          return true;
        }
        best = t;
        found = true;
        face = idx;
        bary = vec3( 1.0 - u - v, u, v );
        side = det > 0.0 ? 1.0 : -1.0;
      }
#ifdef STACKLESS
      node = escape;
    } else {
      node = node + 1u;
    }
#else
    } else if ( ptr < STACK - 2 ) {
      uint left = node + 1u;
      uint right = node + info.y;
      bool ltr = d[ int( info.x & 3u ) ] >= 0.0;
      stack[ ++ ptr ] = ltr ? right : left;
      stack[ ++ ptr ] = ltr ? left : right;
    }
#endif
  }
  dist = best;
  return found;
}
// Shadow ray: visible (true) unless an opaque triangle is in the way; glass tints tp.
bool visible( vec3 o, vec3 d, inout vec3 tp ) {
  uvec3 f; vec3 bc; float side; float dist;
  return ! traverse( o, d, true, 1e20, tp, f, bc, side, dist );
}
// 0 = miss (sky), 1 = opaque front hit, 2 = back face of closed geometry.
int traceRay( vec3 o, vec3 d, inout vec3 tp, out vec4 attr ) {
  float reach = maxDist;
  for ( int k = 0; k < 3; k ++ ) {
    uvec3 fi; vec3 bc; float side; float dist;
    if ( ! traverse( o, d, false, reach, tp, fi, bc, side, dist ) ) return 0;
    attr = bc.x * attrAt( fi.x ) + bc.y * attrAt( fi.y ) + bc.z * attrAt( fi.z );
    int flags = int( mats[ int( attr.w + 0.5 ) ].w + 0.5 );
    if ( ( flags & 2 ) != 0 ) {
      tp *= glassTint;
      o += d * ( dist + 1e-3 );
      reach -= dist;
      continue;
    }
    return ( ( flags & 4 ) == 0 && side < 0.0 ) ? 2 : 1;
  }
  return 1;
}
vec3 footprint( ivec2 px, ivec2 dir, vec3 p, vec3 n ) {
  for ( int k = 0; k < 2; k ++ ) {
    ivec2 q = k == 0 ? px + dir : px - dir;
    vec4 qp = texelFetch( gPos, q, 0 );
    vec3 qn = texelFetch( gNrm, q, 0 ).xyz;
    vec3 dp = qp.xyz - p;
    if ( qp.w > 0.5 && dot( qn, n ) > 0.995 && abs( dot( dp, n ) ) < 2e-3 && length( dp ) < 0.3 ) {
      return k == 0 ? dp : - dp;
    }
  }
  return vec3( 0.0 );
}
void main() {
  ivec2 px = ivec2( gl_FragCoord.xy );
  vec4 gp = texelFetch( gPos, px, 0 );
  if ( gp.w < 0.5 ) { outColor = vec4( 0.0 ); return; }
  // Inside geometry (seen from the first iteration): stays invalid, no rays.
  if ( useMask > 0.5 && texelFetch( validMask, px, 0 ).r < 0.5 ) { outColor = vec4( 0.0, 0.0, 0.0, 1.0 ); return; }
  vec3 n = normalize( texelFetch( gNrm, px, 0 ).xyz );
  uint s = hash( uint( px.x ) * 1973u + hash( uint( px.y ) * 9277u + seed ) );
  // Stratified (Hammersley, per-texel rotation) sample of this pass.
  uint rs = hash( uint( px.x ) * 7919u + uint( px.y ) * 104729u );
  float r1 = fract( ( sampleIndex + 0.5 ) / sampleCount + rnd( rs ) );
  float r2 = fract( radicalInverse( uint( sampleIndex ) ) + rnd( rs ) );
  // Anywhere inside the texel footprint (anti-aliased shadow edges, smoother AO).
  vec3 p = gp.xyz + footprint( px, ivec2( 1, 0 ), gp.xyz, n ) * ( rnd( s ) - 0.5 )
                  + footprint( px, ivec2( 0, 1 ), gp.xyz, n ) * ( rnd( s ) - 0.5 );
  vec3 o = p + n * 2e-3;
  vec3 t; vec3 b;
  vec4 attr;
  vec3 tp = vec3( 1.0 );
  if ( mode == 0 ) {
    basis( sunDir, t, b );
    float ct = 1.0 - r2 * ( 1.0 - sunCos );
    float st = sqrt( max( 0.0, 1.0 - ct * ct ) );
    float phi = 2.0 * PI * r1;
    vec3 d = normalize( t * cos( phi ) * st + b * sin( phi ) * st + sunDir * ct );
    float nl = dot( n, d );
    vec3 E = vec3( 0.0 );
    if ( nl > 0.0 && visible( o, d, tp ) ) E = sunColor * nl * tp;
    outColor = vec4( E, 0.0 );
    return;
  }
  basis( n, t, b );
  float phi = 2.0 * PI * r1;
  float r = sqrt( r2 );
  vec3 d = normalize( t * cos( phi ) * r + b * sin( phi ) * r + n * sqrt( max( 0.0, 1.0 - r2 ) ) );
  int h = traceRay( o, d, tp, attr );
  vec3 L = vec3( 0.0 );
  float back = 0.0;
  if ( h == 0 ) {
    L = skyRadiance( d ) * tp;
  } else if ( h == 2 ) {
    back = 1.0;
  } else {
    vec4 m = mats[ int( attr.w + 0.5 ) ];
    vec3 E = unbakedIrr;
    if ( ( int( m.w + 0.5 ) & 1 ) != 0 ) {
      ivec2 q = clamp( ivec2( attr.xy * float( atlasSize ) ), ivec2( 0 ), ivec2( atlasSize - 1 ) );
      E = attr.z < 0.5 ? texelFetch( prev0, q, 0 ).rgb : texelFetch( prev1, q, 0 ).rgb;
    }
    L = m.rgb * E * ( 1.0 / PI ) * tp;
  }
  // Cosine-weighted estimator: irradiance = PI · mean radiance.
  outColor = vec4( PI * L, back );
}
`;

/** accumulated sun + sky → irradiance; validity from the G-buffer and back-face ratio. */
const RESOLVE_FRAG = /* glsl */ `${HEADER}
uniform sampler2D gPos;
uniform sampler2D sunE;
uniform sampler2D skyAcc;
uniform float useSun;
uniform float skyCount;
uniform float maxBack;
out vec4 outColor;
void main() {
  ivec2 px = ivec2( gl_FragCoord.xy );
  float valid = texelFetch( gPos, px, 0 ).w;
  vec3 e = useSun > 0.5 ? texelFetch( sunE, px, 0 ).rgb : vec3( 0.0 );
  if ( skyCount > 0.0 ) {
    vec4 a = texelFetch( skyAcc, px, 0 );
    e += a.rgb / skyCount;
    if ( a.a / skyCount > maxBack ) valid = 0.0;
  }
  outColor = valid > 0.5 ? vec4( e, 1.0 ) : vec4( 0.0 );
}
`;

const SCALE_FRAG = /* glsl */ `${HEADER}
uniform sampler2D src;
uniform sampler2D gPos;
uniform float scale;
out vec4 outColor;
void main() {
  ivec2 px = ivec2( gl_FragCoord.xy );
  outColor = texelFetch( gPos, px, 0 ).w > 0.5 ? vec4( texelFetch( src, px, 0 ).rgb * scale, 1.0 ) : vec4( 0.0 );
}
`;

/** Invalid texels take the mean of their valid 3×3 neighbours (grows charts into padding). */
const DILATE_FRAG = /* glsl */ `${HEADER}
uniform sampler2D src;
out vec4 outColor;
void main() {
  ivec2 px = ivec2( gl_FragCoord.xy );
  vec4 c = texelFetch( src, px, 0 );
  if ( c.a > 0.5 ) { outColor = c; return; }
  ivec2 size = textureSize( src, 0 );
  vec3 sum = vec3( 0.0 );
  float w = 0.0;
  for ( int y = -1; y <= 1; y ++ ) for ( int x = -1; x <= 1; x ++ ) {
    ivec2 q = px + ivec2( x, y );
    if ( q.x < 0 || q.y < 0 || q.x >= size.x || q.y >= size.y ) continue;
    vec4 v = texelFetch( src, q, 0 );
    float k = ( x == 0 || y == 0 ) ? 1.0 : 0.7;
    if ( v.a > 0.5 ) { sum += v.rgb * k; w += k; }
  }
  outColor = w > 0.0 ? vec4( sum / w, 1.0 ) : vec4( 0.0 );
}
`;

/** Edge-aware à-trous step on the indirect light, guided by G-buffer position + normal. */
const DENOISE_FRAG = /* glsl */ `${HEADER}
uniform sampler2D src;
uniform sampler2D gPos;
uniform sampler2D gNrm;
uniform int stepPx;
out vec4 outColor;
void main() {
  ivec2 px = ivec2( gl_FragCoord.xy );
  vec4 c = texelFetch( src, px, 0 );
  vec4 p = texelFetch( gPos, px, 0 );
  if ( c.a < 0.5 || p.w < 0.5 ) { outColor = c; return; }
  vec3 n = texelFetch( gNrm, px, 0 ).xyz;
  ivec2 size = textureSize( src, 0 );
  // Local texel size from a valid neighbour (for the position tolerance).
  float texel = 0.05;
  for ( int k = 0; k < 4; k ++ ) {
    ivec2 q = px + ( k == 0 ? ivec2( 1, 0 ) : k == 1 ? ivec2( -1, 0 ) : k == 2 ? ivec2( 0, 1 ) : ivec2( 0, -1 ) );
    vec4 qp = texelFetch( gPos, q, 0 );
    if ( qp.w > 0.5 ) { texel = min( max( length( qp.xyz - p.xyz ), 1e-3 ), 2.0 ); break; }
  }
  float kern[ 3 ] = float[ 3 ]( 0.375, 0.25, 0.0625 );
  vec3 sum = vec3( 0.0 );
  float w = 0.0;
  for ( int y = -2; y <= 2; y ++ ) for ( int x = -2; x <= 2; x ++ ) {
    ivec2 q = px + ivec2( x, y ) * stepPx;
    if ( q.x < 0 || q.y < 0 || q.x >= size.x || q.y >= size.y ) continue;
    vec4 v = texelFetch( src, q, 0 );
    vec4 qp = texelFetch( gPos, q, 0 );
    if ( v.a < 0.5 || qp.w < 0.5 ) continue;
    vec3 qn = texelFetch( gNrm, q, 0 ).xyz;
    vec3 dp = qp.xyz - p.xyz;
    float dist = length( dp );
    float reach = texel * float( stepPx ) * 3.2;
    if ( dist > reach ) continue;
    float wn = pow( max( dot( n, qn ), 0.0 ), 64.0 );
    float wp = exp( - pow( dot( dp, n ) / ( 0.25 * texel ), 2.0 ) );
    float k = kern[ abs( x ) ] * kern[ abs( y ) ] * wn * wp;
    sum += v.rgb * k;
    w += k;
  }
  outColor = vec4( w > 0.0 ? sum / w : c.rgb, 1.0 );
}
`;

const MASK_FRAG = /* glsl */ `
${HEADER}
uniform sampler2D src;
out vec4 outColor;
void main() {
  outColor = vec4( texelFetch( src, ivec2( gl_FragCoord.xy ), 0 ).a );
}
`;

const ADD_FRAG = /* glsl */ `${HEADER}
uniform sampler2D a;
uniform sampler2D b;
uniform sampler2D mask;
uniform float useB;
out vec4 outColor;
void main() {
  ivec2 px = ivec2( gl_FragCoord.xy );
  float valid = texelFetch( mask, px, 0 ).a;
  vec3 v = texelFetch( a, px, 0 ).rgb + ( useB > 0.5 ? texelFetch( b, px, 0 ).rgb : vec3( 0.0 ) );
  outColor = valid > 0.5 ? vec4( v, 1.0 ) : vec4( 0.0 );
}
`;

function raw(
  frag: string,
  uniforms: Record<string, THREE.IUniform>,
  defines = {},
): THREE.RawShaderMaterial {
  return new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: QUAD_VERT,
    fragmentShader: frag,
    uniforms,
    defines,
    depthTest: false,
    depthWrite: false,
  });
}

function floatTarget(
  size: number,
  type: THREE.TextureDataType = THREE.FloatType,
): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(size, size, {
    type,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    generateMipmaps: false,
  });
}

const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

/** Same data, 4096 texels per row (the shader fetches element i at (i & 4095, i >> 12)). */
function relayout(tex: THREE.DataTexture): THREE.DataTexture {
  const img = tex.image as { data: Float32Array | Uint32Array; width: number; height: number };
  const src = img.data;
  const ch = src.length / (img.width * img.height);
  const W = 4096;
  const H = Math.ceil((img.width * img.height) / W);
  const Ctor = src.constructor as new (n: number) => Float32Array | Uint32Array;
  const dst = new Ctor(W * H * ch);
  dst.set(src.subarray(0, Math.min(src.length, dst.length)));
  const t = new THREE.DataTexture(dst, W, H, tex.format as THREE.PixelFormat, tex.type);
  t.internalFormat = tex.internalFormat;
  t.minFilter = THREE.NearestFilter;
  t.magFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

export async function bakeLightmaps(
  renderer: THREE.WebGLRenderer,
  meshes: readonly BakeMesh[],
  materials: readonly BakeMaterial[],
  s: BakeSettings,
): Promise<BakeOutput> {
  const t0 = performance.now();
  const S = s.atlasSize;
  // Passes accumulate / overwrite explicitly: never clear on render().
  renderer.autoClear = false;
  const gl = renderer.getContext();
  if (
    !renderer.extensions.has('EXT_color_buffer_float') ||
    !renderer.extensions.has('EXT_float_blend')
  ) {
    throw new Error('The baker needs EXT_color_buffer_float and EXT_float_blend');
  }
  const progress = async (label: string, f: number): Promise<void> => {
    await s.onProgress?.(label, f);
  };

  // --- Scene BVH (all meshes; glass included, see-through in the shader) + attributes.
  await progress('Building the BVH', 0);
  // Huge far-context triangles (ground ring, hills: > maxEdge) would overlap every BVH
  // node and slow every ray down; rays that miss below the horizon see ground instead.
  const tri = new THREE.Triangle();
  const big = (p: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, t: number): boolean => {
    tri.setFromAttributeAndIndices(p, t * 3, t * 3 + 1, t * 3 + 2);
    const e = Math.max(tri.a.distanceTo(tri.b), tri.b.distanceTo(tri.c), tri.c.distanceTo(tri.a));
    return e > s.maxEdge;
  };
  let total = 0;
  for (const m of meshes) {
    const p = m.geometry.getAttribute('position');
    for (let t = 0; t < p.count / 3; t++) if (!big(p, t)) total += 3;
  }
  const pos = new Float32Array(total * 3);
  const attr = new Float32Array(total * 4);
  let o = 0;
  for (const m of meshes) {
    const p = m.geometry.getAttribute('position');
    const uv = m.atlas >= 0 ? m.geometry.getAttribute('uv1') : null;
    for (let i = 0; i < p.count; i++) {
      if (i % 3 === 0 && big(p, i / 3)) {
        i += 2;
        continue;
      }
      pos[o * 3] = p.getX(i);
      pos[o * 3 + 1] = p.getY(i);
      pos[o * 3 + 2] = p.getZ(i);
      attr[o * 4] = uv ? uv.getX(i) : 0;
      attr[o * 4 + 1] = uv ? uv.getY(i) : 0;
      attr[o * 4 + 2] = Math.max(0, m.atlas);
      attr[o * 4 + 3] = m.material;
      o++;
    }
  }
  const sceneGeo = new THREE.BufferGeometry();
  sceneGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  sceneGeo.setAttribute('lm', new THREE.BufferAttribute(attr, 4));
  const bvh = new MeshBVH(sceneGeo, { strategy: SAH, maxLeafSize: 6 });
  const bvhUniform = new MeshBVHUniformStruct();
  bvhUniform.updateFrom(bvh);
  const attrSrc = new FloatVertexAttributeTexture();
  attrSrc.updateFrom(sceneGeo.getAttribute('lm') as THREE.BufferAttribute);
  const packed = bvhUniform as unknown as Record<
    'position' | 'index' | 'bvhBounds' | 'bvhContents',
    THREE.DataTexture
  >;
  const bvhTex = {
    pos: relayout(packed.position),
    index: relayout(packed.index),
    bounds: relayout(packed.bvhBounds),
    contents: relayout(packed.bvhContents),
  };
  const attrTex = relayout(attrSrc);
  if (s.stackless) {
    // Contents + escape index (next node after the subtree) per node.
    const src = (packed.bvhContents.image as { data: Uint32Array }).data;
    const nodes = src.length / 2;
    const data = new Uint32Array(nodes * 4);
    const esc = (n: number, e: number): void => {
      // iterative: walk left spine, right children inherit the parent's escape
      const todo: [number, number][] = [[n, e]];
      while (todo.length) {
        const [k, ek] = todo.pop()!;
        const x = src[k * 2]!;
        const y = src[k * 2 + 1]!;
        data[k * 4] = x;
        data[k * 4 + 1] = y;
        data[k * 4 + 2] = ek;
        if ((x & 0xffff0000) === 0) {
          todo.push([k + 1, k + y], [k + y, ek]);
        }
      }
    };
    esc(0, 0xffffffff);
    const t = new THREE.DataTexture(data, 1, nodes, THREE.RGBAIntegerFormat, THREE.UnsignedIntType);
    t.internalFormat = 'RGBA32UI';
    bvhTex.contents.dispose();
    bvhTex.contents = relayout(t);
    t.dispose();
  }
  bvhUniform.dispose();
  attrSrc.dispose();

  const matTable = materials.map(
    (m) =>
      new THREE.Vector4(
        m.albedo.r,
        m.albedo.g,
        m.albedo.b,
        (m.baked ? 1 : 0) | (m.glass ? 2 : 0) | (m.thin ? 4 : 0),
      ),
  );

  // --- Targets.
  const gbuf = new THREE.WebGLRenderTarget(S, S, {
    count: 2,
    type: THREE.FloatType,
    format: THREE.RGBAFormat,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    depthBuffer: false,
    generateMipmaps: false,
  });
  const acc = floatTarget(S);
  const tmpA = floatTarget(S, THREE.HalfFloatType);
  const tmpB = floatTarget(S, THREE.HalfFloatType);
  const sunE = Array.from({ length: s.atlases }, () => floatTarget(S, THREE.HalfFloatType));
  // Texels found inside geometry by the first sky iteration (skipped afterwards).
  const masks = Array.from(
    { length: s.atlases },
    () =>
      new THREE.WebGLRenderTarget(S, S, {
        format: THREE.RedFormat,
        type: THREE.UnsignedByteType,
        minFilter: THREE.NearestFilter,
        magFilter: THREE.NearestFilter,
        depthBuffer: false,
        generateMipmaps: false,
      }),
  );
  let prev = Array.from({ length: s.atlases }, () => floatTarget(S, THREE.HalfFloatType));
  let next = Array.from({ length: s.atlases }, () => floatTarget(S, THREE.HalfFloatType));
  const empty = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType);
  empty.needsUpdate = true;

  const quad = new FullScreenQuad();
  const run = (mat: THREE.Material, target: THREE.WebGLRenderTarget | null): void => {
    quad.material = mat;
    renderer.setRenderTarget(target);
    quad.render(renderer);
  };
  const clear = (target: THREE.WebGLRenderTarget): void => {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
  };
  const sync = (target: THREE.WebGLRenderTarget): void => {
    const px = new Float32Array(4);
    renderer.readRenderTargetPixels(target, 0, 0, 1, 1, px);
  };
  /** Debug: number of texels with a > 0.5 and the mean of rgb over them. */
  const stat = (target: THREE.WebGLRenderTarget, index = 0): [number, number, number] => {
    const half = target.textures[index]!.type === THREE.HalfFloatType;
    const buf = half ? new Uint16Array(S * S * 4) : new Float32Array(S * S * 4);
    renderer.readRenderTargetPixels(target, 0, 0, S, S, buf, undefined, index);
    const v = (i: number): number => (half ? THREE.DataUtils.fromHalfFloat(buf[i]!) : buf[i]!);
    let c = 0;
    let sum = 0;
    let lit = 0;
    for (let i = 0; i < buf.length; i += 4) {
      if (v(i + 3) > 0.5) c++;
      const e = (v(i) + v(i + 1) + v(i + 2)) / 3;
      if (e > 0) {
        lit++;
        sum += e;
      }
    }
    return [c, lit ? sum / lit : 0, lit];
  };
  const debug = new URLSearchParams(window.location.search).has('debug');
  const report = async (
    label: string,
    target: THREE.WebGLRenderTarget,
    index = 0,
  ): Promise<void> => {
    if (!debug) return;
    const [c, m, lit] = stat(target, index);
    console.log(`[bake] debug ${label}: ${c} valid, ${lit} lit, mean ${m.toFixed(4)}`);
    await tick();
  };

  // --- G-buffer of one atlas (jittered passes first, the exact raster last wins).
  const gbufMat = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: GBUF_VERT,
    fragmentShader: GBUF_FRAG,
    uniforms: { jitter: { value: new THREE.Vector2() }, atlasSize: { value: S } },
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
  });
  const gbufScene = new THREE.Scene();
  const cam = new THREE.Camera();
  const renderGBuffer = (atlas: number): void => {
    gbufScene.clear();
    for (const m of meshes) {
      if (m.atlas !== atlas) continue;
      const mesh = new THREE.Mesh(m.geometry, gbufMat);
      mesh.frustumCulled = false;
      gbufScene.add(mesh);
    }
    renderer.setRenderTarget(gbuf);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
    const r = 0.49;
    const offsets: [number, number][] = [
      [-r, -r],
      [r, -r],
      [-r, r],
      [r, r],
      [0, -r],
      [0, r],
      [-r, 0],
      [r, 0],
      [0, 0],
    ];
    for (const [x, y] of offsets) {
      (gbufMat.uniforms.jitter!.value as THREE.Vector2).set(x, y);
      renderer.render(gbufScene, cam);
    }
  };

  const traceMat = raw(
    TRACE_FRAG,
    {
      bvhPos: { value: bvhTex.pos },
      bvhIndex: { value: bvhTex.index },
      bvhBounds: { value: bvhTex.bounds },
      bvhContents: { value: bvhTex.contents },
      lmAttr: { value: attrTex },
      gPos: { value: gbuf.textures[0] },
      gNrm: { value: gbuf.textures[1] },
      prev0: { value: empty },
      prev1: { value: empty },
      mats: { value: matTable },
      sky: { value: s.sky },
      skyRot: { value: s.skyRotation },
      skyScale: { value: s.skyScale },
      skyHorizon: { value: s.skyHorizon },
      groundRadiance: { value: s.ground },
      sunDir: { value: s.sunDirection.clone().normalize() },
      sunColor: { value: s.sunColor },
      sunCos: { value: Math.cos(THREE.MathUtils.degToRad(s.sunRadiusDeg)) },
      glassTint: { value: s.glass },
      unbakedIrr: { value: s.unbakedIrradiance },
      maxDist: { value: s.maxDistance },
      validMask: { value: empty },
      useMask: { value: 0 },
      mode: { value: 0 },
      seed: { value: 1 },
      sampleIndex: { value: 0 },
      sampleCount: { value: 1 },
      atlasSize: { value: S },
    },
    { MAT_COUNT: materials.length, STACK: s.stackDepth, ...(s.stackless ? { STACKLESS: 1 } : {}) },
  );
  traceMat.blending = THREE.CustomBlending;
  traceMat.blendEquation = THREE.AddEquation;
  traceMat.blendSrc = THREE.OneFactor;
  traceMat.blendDst = THREE.OneFactor;
  traceMat.blendSrcAlpha = THREE.OneFactor;
  traceMat.blendDstAlpha = THREE.OneFactor;

  const resolveMat = raw(RESOLVE_FRAG, {
    gPos: { value: gbuf.textures[0] },
    sunE: { value: null },
    useSun: { value: 1 },
    skyAcc: { value: acc.texture },
    skyCount: { value: 0 },
    maxBack: { value: 0.15 },
  });
  const scaleMat = raw(SCALE_FRAG, {
    src: { value: acc.texture },
    gPos: { value: gbuf.textures[0] },
    scale: { value: 1 },
  });
  const dilateMat = raw(DILATE_FRAG, { src: { value: null } });
  const maskMat = raw(MASK_FRAG, { src: { value: null } });
  const denoiseMat = raw(DENOISE_FRAG, {
    src: { value: null },
    gPos: { value: gbuf.textures[0] },
    gNrm: { value: gbuf.textures[1] },
    stepPx: { value: 1 },
  });
  const addMat = raw(ADD_FRAG, {
    a: { value: null },
    b: { value: null },
    mask: { value: null },
    useB: { value: 1 },
  });

  /** Dilates `src` in place `n` times (ping-pong through tmpB). */
  const dilate = (src: THREE.WebGLRenderTarget, n: number): void => {
    for (let k = 0; k < n; k++) {
      dilateMat.uniforms.src!.value = src.texture;
      run(dilateMat, tmpB);
      dilateMat.uniforms.src!.value = tmpB.texture;
      run(dilateMat, src);
    }
  };
  let rays = 0;
  const T = s.tile;
  const trace = async (
    atlas: number,
    mode: number,
    count: number,
    label: string,
    base: number,
    span: number,
  ): Promise<void> => {
    traceMat.uniforms.mode!.value = mode;
    traceMat.uniforms.sampleCount!.value = count;
    clear(acc);
    for (let i = 0; i < count; i++) {
      const tSample = performance.now();
      traceMat.uniforms.sampleIndex!.value = i;
      traceMat.uniforms.seed!.value = (i * 7919 + mode * 104729 + atlas * 15485863) >>> 0;
      for (let y = 0; y < S; y += T) {
        for (let x = 0; x < S; x += T) {
          acc.scissor.set(x, y, T, T);
          acc.scissorTest = true;
          run(traceMat, acc);
          // One short GPU submission per tile (Windows resets the GPU after ~2 s).
          sync(acc);
        }
      }
      acc.scissorTest = false;
      rays += S * S;
      if (debug && i < 2) {
        console.log(
          `[bake] debug sample ${i} ${label}: ${(performance.now() - tSample).toFixed(0)} ms, lost ${gl.isContextLost()}`,
        );
      }
      if (i % 4 === 3 || i === count - 1) {
        sync(acc);
        await progress(label, base + (span * (i + 1)) / count);
        await tick();
      }
    }
    acc.scissorTest = false;
  };

  const iterations = s.skySamples.length;
  const totalWork = s.atlases * (s.sunSamples + s.skySamples.reduce((a, b) => a + b, 0));
  let done = 0;
  const span = (n: number): number => n / totalWork;

  // --- Direct sun per atlas → sunE (dilated, used as the first bounce source).
  const coverage: number[] = [];
  for (let k = 0; k < s.atlases; k++) {
    renderGBuffer(k);
    coverage.push(stat(gbuf, 0)[0]);
    traceMat.uniforms.gPos!.value = gbuf.textures[0];
    traceMat.uniforms.gNrm!.value = gbuf.textures[1];
    await trace(k, 0, s.sunSamples, `Sun, atlas ${k + 1}`, span(done), span(s.sunSamples));
    done += s.sunSamples;
    await report(`sun acc ${k}`, acc);
    scaleMat.uniforms.src!.value = acc.texture;
    scaleMat.uniforms.scale!.value = 1 / s.sunSamples;
    run(scaleMat, sunE[k]!);
    await report(`sunE ${k}`, sunE[k]!);
    run(scaleMat, prev[k]!);
    dilate(prev[k]!, 6);
  }

  // --- Radiosity iterations: sky + one more bounce each.
  const finals: THREE.WebGLRenderTarget[] = [];
  for (let it = 0; it < iterations; it++) {
    const last = it === iterations - 1;
    const n = s.skySamples[it]!;
    traceMat.uniforms.prev0!.value = prev[0]!.texture;
    traceMat.uniforms.prev1!.value = (prev[1] ?? prev[0])!.texture;
    for (let k = 0; k < s.atlases; k++) {
      renderGBuffer(k);
      traceMat.uniforms.useMask!.value = it > 0 ? 1 : 0;
      traceMat.uniforms.validMask!.value = it > 0 ? masks[k]!.texture : empty;
      await trace(
        k,
        1,
        n,
        `Sky + bounce ${it + 1}/${iterations}, atlas ${k + 1}`,
        span(done),
        span(n),
      );
      done += n;
      await report(`sky acc ${it} ${k}`, acc);
      if (!last) {
        resolveMat.uniforms.sunE!.value = sunE[k]!.texture;
        resolveMat.uniforms.useSun!.value = 1;
        resolveMat.uniforms.skyCount!.value = n;
        run(resolveMat, next[k]!);
        if (it === 0) {
          maskMat.uniforms.src!.value = next[k]!.texture;
          run(maskMat, masks[k]!);
          if (s.onMask) {
            const g = new Float32Array(S * S * 4);
            renderer.readRenderTargetPixels(gbuf, 0, 0, S, S, g, undefined, 0);
            const m = new Float32Array(S * S * 4);
            renderer.readRenderTargetPixels(acc, 0, 0, S, S, m);
            const covered = new Uint8Array(S * S);
            const back = new Float32Array(S * S);
            for (let i = 0; i < S * S; i++) {
              covered[i] = g[i * 4 + 3]! > 0.5 ? 1 : 0;
              back[i] = m[i * 4 + 3]! / n;
            }
            s.onMask(k, covered, back);
          }
        }
        dilate(next[k]!, 6);
        continue;
      }
      // Final: indirect part (sky + bounces) denoised, then + sun, dilated into padding.
      resolveMat.uniforms.useSun!.value = 0;
      resolveMat.uniforms.skyCount!.value = n;
      run(resolveMat, tmpA);
      const mask = tmpA;
      await progress(`Denoising atlas ${k + 1}`, span(done));
      const ind = floatTarget(S, THREE.HalfFloatType);
      for (const step of [1, 2, 4]) {
        denoiseMat.uniforms.src!.value = (step === 1 ? tmpA : ind).texture;
        denoiseMat.uniforms.stepPx!.value = step;
        run(denoiseMat, tmpB);
        // keep the validity (alpha) of the resolved mask
        addMat.uniforms.a!.value = tmpB.texture;
        addMat.uniforms.useB!.value = 0;
        addMat.uniforms.mask!.value = mask.texture;
        run(addMat, ind);
      }
      const out = floatTarget(S);
      addMat.uniforms.a!.value = ind.texture;
      addMat.uniforms.b!.value = sunE[k]!.texture;
      addMat.uniforms.useB!.value = 1;
      addMat.uniforms.mask!.value = mask.texture;
      run(addMat, out);
      ind.dispose();
      dilate(out, 8);
      await report(`final ${k}`, out);
      finals.push(out);
    }
    if (!last) [prev, next] = [next, prev];
  }

  // --- Read back.
  await progress('Reading back', 1);
  const atlases: Float32Array[] = [];
  for (let k = 0; k < finals.length; k++) {
    const buf = new Float32Array(S * S * 4);
    renderer.readRenderTargetPixels(finals[k]!, 0, 0, S, S, buf);
    atlases.push(buf);
    finals[k]!.dispose();
  }
  for (const t of [gbuf, acc, tmpA, tmpB, ...sunE, ...prev, ...next, ...masks]) t.dispose();
  for (const m of [
    gbufMat,
    traceMat,
    resolveMat,
    scaleMat,
    dilateMat,
    maskMat,
    denoiseMat,
    addMat,
  ]) {
    m.dispose();
  }
  quad.dispose();
  for (const t of Object.values(bvhTex)) t.dispose();
  attrTex.dispose();
  empty.dispose();
  sceneGeo.dispose();
  gl.finish();
  return {
    atlases,
    stats: { rays, seconds: (performance.now() - t0) / 1000, coverage },
  };
}
