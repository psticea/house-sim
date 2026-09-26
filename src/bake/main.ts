/**
 * `bake.html` (dev only, plan.md §4.1): builds the exact runtime scene, unwraps UV2,
 * bakes the lightmaps on the GPU and leaves the results on `window.__bake` for
 * `tools/bake.mjs` (which encodes KTX2 and writes `public/assets/baked/`).
 * `?quick` bakes with few samples (look-dev); `?software` allows SwiftShader.
 */
import * as THREE from 'three';
import { house } from '../data/house';
import { locate, OUTSIDE } from '../data/topology';
import type { MaterialId } from '../data/schema';
import { assetBase, loadManifest } from '../core/assets';
import { FINISHES } from '../world/finishes';
import { createLighting } from '../world/lighting';
import { geometryHash, LIGHTMAP_VERSION } from '../world/lightmaps';
import { REAL_LIGHT } from '../world/realLook';
import { bakeLightmaps, type BakeMaterial, type BakeMesh } from './baker';
import { ATLAS, RGBM_RANGE, SAMPLES, TEXEL, texelSize, UNBAKED } from './config';
import { downsample2x, encodeRGBM } from './export';
import { buildBakeScene } from './scene';
import { quantizeUv, unwrap } from './unwrap';

export interface BakeState {
  done: boolean;
  error?: string;
  progress: number;
  label: string;
  gpu: string;
  meta?: Record<string, unknown>;
  buffers: Record<string, Uint8Array>;
}

declare global {
  interface Window {
    __bake?: BakeState;
  }
}

const THIN: ReadonlySet<MaterialId> = new Set<MaterialId>([
  'foliage',
  'foliageLight',
  'meadow',
  'flowers',
]);

const state: BakeState = { done: false, progress: 0, label: 'Starting', gpu: '', buffers: {} };
window.__bake = state;
const statusEl = document.getElementById('status')!;
const barEl = document.getElementById('bar')!;
const logEl = document.getElementById('log')!;
const log = (s: string): void => {
  logEl.textContent += `${s}\n`;
  console.log(`[bake] ${s}`);
};

async function main(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const quick = params.has('quick');
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
  });
  const gl = renderer.getContext();
  const dbg = gl.getExtension('WEBGL_debug_renderer_info');
  canvas.addEventListener('webglcontextlost', () => {
    state.error = 'WebGL context lost (GPU reset — try a smaller SAMPLES.tile)';
    log(state.error);
  });
  state.gpu = String(gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
  log(`GPU: ${state.gpu}`);
  if (/swiftshader|llvmpipe|software/i.test(state.gpu) && !params.has('software')) {
    throw new Error(`Software renderer (${state.gpu}) — bake on the real GPU (headed Chrome)`);
  }

  const t0 = performance.now();
  const scene = buildBakeScene();
  log(`Scene: ${scene.meshes.length} meshes, ${scene.baked.length} lightmapped`);
  const un = unwrap(
    scene.baked.map((m) => ({ id: m.name, positions: m.geometry.getAttribute('position').array })),
    {
      atlasSize: ATLAS.size,
      atlases: ATLAS.count,
      padding: ATLAS.padding,
      texelSize,
      coneDeg: ATLAS.coneDeg,
    },
  );
  const tUnwrap = (performance.now() - t0) / 1000;
  log(
    `Unwrap: ${un.charts.length} charts, density ×${un.scale.toFixed(2)}, fill ${un.fill
      .map((f) => `${(f * 100).toFixed(0)} %`)
      .join(' / ')} (${tUnwrap.toFixed(1)} s)`,
  );

  // uv2 exactly as the runtime gets it (16-bit normalised).
  const uvParts: Uint16Array[] = [];
  const entries: Record<string, unknown>[] = [];
  let offset = 0;
  const atlasOf = new Map<THREE.Mesh, number>();
  scene.baked.forEach((mesh, i) => {
    const r = un.meshes[i]!;
    const q = quantizeUv(r.uv);
    mesh.geometry.setAttribute('uv1', new THREE.BufferAttribute(q, 2, true));
    uvParts.push(q);
    atlasOf.set(mesh, r.atlas);
    const pos = mesh.geometry.getAttribute('position');
    entries.push({
      id: mesh.name,
      atlas: r.atlas,
      vertices: pos.count,
      offset,
      hash: geometryHash(pos.array),
    });
    offset += q.length;
  });
  const uvAll = new Uint16Array(offset);
  let o = 0;
  for (const p of uvParts) {
    uvAll.set(p, o);
    o += p.length;
  }

  // Materials (bounce albedo) and meshes for the tracer.
  const ids = scene.meshes.map((m) => m.name as MaterialId);
  const materials: BakeMaterial[] = ids.map((id) => {
    const f = FINISHES[id];
    const albedo = new THREE.Color(f.color).multiplyScalar(1 - 0.8 * f.metalness);
    return {
      albedo,
      baked: !UNBAKED.has(id),
      glass: id === 'glass',
      thin: THIN.has(id),
    };
  });
  const meshes: BakeMesh[] = scene.meshes.map((m, i) => ({
    geometry: m.geometry,
    material: i,
    atlas: atlasOf.get(m) ?? -1,
  }));

  // Same sun and sky as the realistic look.
  const lit = createLighting(new THREE.Scene(), house.site, 256);
  const sunColor = lit.sun.color.clone().multiplyScalar(lit.sun.intensity);
  const texManifest = await loadManifest();
  const skyInfo = texManifest.sky;
  if (!skyInfo) throw new Error('No sky in the texture manifest');
  const sky = await new THREE.TextureLoader().loadAsync(`${assetBase()}${skyInfo.environment}`);
  sky.colorSpace = THREE.SRGBColorSpace;
  sky.generateMipmaps = false;
  sky.minFilter = THREE.LinearFilter;
  sky.wrapS = THREE.RepeatWrapping;
  const d = lit.sunDirection;
  const skyRotation = (skyInfo.sunU - 0.5) * Math.PI * 2 - Math.atan2(d.z, d.x);
  const skyScale = REAL_LIGHT.envScale;
  const skyHorizon = new THREE.Color().setRGB(...skyInfo.horizon).multiplyScalar(skyScale);

  const scaleSamples = quick ? 0.1 : 1;
  const bench = params.has('bench');
  const n = (v: number): number => (bench ? 2 : Math.max(4, Math.round(v * scaleSamples)));
  const skySamples = bench ? [8, 2] : SAMPLES.skyPerIteration.map(n);
  log(`Samples: sun ${n(SAMPLES.sun)}, sky/bounce ${skySamples.join(' + ')}`);
  const res = await bakeLightmaps(renderer, meshes, materials, {
    atlasSize: ATLAS.size,
    atlases: ATLAS.count,
    sunDirection: d,
    sunColor,
    sunRadiusDeg: SAMPLES.sunRadiusDeg,
    sky,
    skyRotation,
    skyScale,
    skyHorizon,
    glass: new THREE.Color().setRGB(...SAMPLES.glass),
    maxEdge: SAMPLES.maxEdgeM,
    stackDepth: Number(params.get('stack') ?? 40),
    stackless: params.get('stackless') !== '0',
    maxDistance: Number(params.get('maxdist') ?? SAMPLES.maxDistanceM),
    // Far grass field in sun + sky: albedo × irradiance / π.
    ground: new THREE.Color(FINISHES.field.color).multiplyScalar(
      (sunColor.r * Math.sin(THREE.MathUtils.degToRad(house.site.sun.elevationDeg)) + 1.5) /
        Math.PI,
    ),
    unbakedIrradiance: new THREE.Color().setRGB(...SAMPLES.unbakedIrradiance),
    sunSamples: n(SAMPLES.sun),
    skySamples,
    tile: SAMPLES.tile,
    ...(params.has('debug')
      ? {
          onMask: (atlas: number, covered: Uint8Array, back: Float32Array) => {
            for (const [mi, mesh] of scene.baked.entries()) {
              if (un.meshes[mi]!.atlas !== atlas) continue;
              let cov = 0;
              let bad = 0;
              let sum = 0;
              for (const ch of un.charts) {
                if (ch.mesh !== mi) continue;
                for (let y = ch.y; y < ch.y + ch.h; y++) {
                  for (let x = ch.x; x < ch.x + ch.w; x++) {
                    const i = y * ATLAS.size + x;
                    if (!covered[i]) continue;
                    cov++;
                    sum += back[i]!;
                    if (back[i]! > 0.08) bad++;
                  }
                }
              }
              log(
                `debug ${mesh.name}: ${cov} texels, ${((bad / Math.max(1, cov)) * 100).toFixed(1)} % invalid, mean back ${(sum / Math.max(1, cov)).toFixed(3)}`,
              );
              if (mesh.name !== 'oak' && mesh.name !== 'plaster') continue;
              const pos = mesh.geometry.getAttribute('position');
              const charts = un.charts
                .filter((ch) => ch.mesh === mi)
                .sort((a, b) => b.w * b.h - a.w * a.h)
                .slice(0, 12);
              for (const ch of charts) {
                let cv = 0;
                let bd = 0;
                let bs = 0;
                for (let y = ch.y; y < ch.y + ch.h; y++) {
                  for (let x = ch.x; x < ch.x + ch.w; x++) {
                    const i = y * ATLAS.size + x;
                    if (!covered[i]) continue;
                    cv++;
                    bs += back[i]!;
                    if (back[i]! > 0.15) bd++;
                  }
                }
                const t = ch.tris[0]! * 3;
                const c = [pos.getX(t), pos.getY(t), pos.getZ(t)]
                  .map((v) => v.toFixed(2))
                  .join(',');
                const nrm = mesh.geometry.getAttribute('normal');
                const nn = [nrm.getX(t), nrm.getY(t), nrm.getZ(t)]
                  .map((v) => v.toFixed(1))
                  .join(',');
                log(
                  `  chart ${ch.w}x${ch.h} at ${c} n ${nn}: ${((bd / Math.max(1, cv)) * 100).toFixed(0)} % invalid, mean back ${(bs / Math.max(1, cv)).toFixed(3)}`,
                );
              }
            }
          },
        }
      : {}),
    onProgress: async (label, f) => {
      state.label = label;
      state.progress = f;
      statusEl.textContent = `${label} — ${(f * 100).toFixed(0)} %`;
      barEl.style.width = `${(f * 100).toFixed(1)}%`;
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    },
  });
  log(
    `Traced ${(res.stats.rays / 1e9).toFixed(2)} G texel-samples in ${res.stats.seconds.toFixed(0)} s, coverage ${res.stats.coverage.join(' / ')} texels`,
  );

  // Mean floor irradiance per room (runtime eye adaptation adapts to each room).
  const roomSum = new Map<string, [number, number]>();
  const FLOORS = new Set(['oak', 'tile', 'tileUtility', 'concrete', 'stone']);
  for (const ch of un.charts) {
    const mesh = scene.baked[ch.mesh]!;
    if (!FLOORS.has(mesh.name)) continue;
    const pos = mesh.geometry.getAttribute('position');
    const nrm = mesh.geometry.getAttribute('normal');
    const t = ch.tris[0]! * 3;
    if (nrm.getY(t) < 0.9) continue;
    let cx = 0;
    let cz = 0;
    for (const tri of ch.tris) {
      for (let v = 0; v < 3; v++) {
        cx += pos.getX(tri * 3 + v);
        cz += pos.getZ(tri * 3 + v);
      }
    }
    cx /= ch.tris.length * 3;
    cz /= ch.tris.length * 3;
    const room = locate(house, cx, pos.getY(t) + 0.02, cz).room;
    if (room === OUTSIDE) continue;
    const data = res.atlases[ch.atlas]!;
    const acc = roomSum.get(room) ?? [0, 0];
    for (let y = ch.y + ATLAS.padding; y < ch.y + ch.h - ATLAS.padding; y++) {
      for (let x = ch.x + ATLAS.padding; x < ch.x + ch.w - ATLAS.padding; x++) {
        const i = (y * ATLAS.size + x) * 4;
        if (data[i + 3]! <= 0) continue;
        acc[0] += 0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!;
        acc[1]++;
      }
    }
    roomSum.set(room, acc);
  }
  const rooms = Object.fromEntries(
    [...roomSum].sort().map(([id, [s, n]]) => [id, Math.round((s / Math.max(1, n)) * 1e4) / 1e4]),
  );
  log(`Room floor irradiance: ${JSON.stringify(rooms)}`);

  // Encode (RGBM) at 2K and 1K (low tier).
  const atlases: Record<string, unknown>[] = [];
  res.atlases.forEach((data, k) => {
    state.buffers[`lm${k}-2k`] = encodeRGBM(data, RGBM_RANGE);
    state.buffers[`lm${k}-1k`] = encodeRGBM(downsample2x(data, ATLAS.size), RGBM_RANGE);
    atlases.push({ size: ATLAS.size, index: k });
  });
  state.buffers.uv2 = new Uint8Array(uvAll.buffer);
  const sunLuminance = 0.2126 * sunColor.r + 0.7152 * sunColor.g + 0.0722 * sunColor.b;
  state.meta = {
    version: LIGHTMAP_VERSION,
    encoding: 'rgbm',
    range: RGBM_RANGE,
    sunLuminance,
    rooms,
    atlases,
    meshes: entries,
    bake: {
      gpu: state.gpu,
      quick,
      seconds: Math.round((performance.now() - t0) / 100) / 10,
      traceSeconds: Math.round(res.stats.seconds * 10) / 10,
      atlasSize: ATLAS.size,
      charts: un.charts.length,
      fill: un.fill.map((f) => Math.round(f * 1000) / 1000),
      densityScale: Math.round(un.scale * 1000) / 1000,
      texelInteriorM: TEXEL.interior / un.scale,
      samples: { sun: n(SAMPLES.sun), sky: skySamples },
      sun: { azimuthDeg: house.site.sun.azimuthDeg, elevationDeg: house.site.sun.elevationDeg },
    },
  };
  statusEl.textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(0)} s`;
  barEl.style.width = '100%';
  state.done = true;
}

main().catch((e: unknown) => {
  state.error = e instanceof Error ? `${e.message}\n${e.stack ?? ''}` : String(e);
  statusEl.textContent = `Failed: ${state.error}`;
  console.error(e);
});
