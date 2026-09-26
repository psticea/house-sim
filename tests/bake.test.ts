import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { ATLAS, texelSize, TEXEL, UNBAKED } from '../src/bake/config';
import { decodeRGBM, downsample2x, encodeRGBM } from '../src/bake/export';
import { buildBakeScene } from '../src/bake/scene';
import { packSkyline, quantizeUv, unwrap, type UnwrapResult } from '../src/bake/unwrap';
import {
  applyBakedPatch,
  BAKED_FRAGMENT,
  createBakedUniforms,
  geometryHash,
  matchMeshes,
  parseLightmapManifest,
  type LightmapManifest,
} from '../src/world/lightmaps';
import { applyAntiTiling } from '../src/world/realLook';

/** Triangle soup of an axis-aligned box. */
function box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): number[] {
  const g = new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0).toNonIndexed();
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return [...g.getAttribute('position').array];
}

/** Every chart rectangle inside the atlas, no two overlapping, uvs inside their chart minus padding. */
function checkLayout(
  r: UnwrapResult,
  positions: ArrayLike<number>[],
  size: number,
  pad: number,
): void {
  const byAtlas = new Map<number, typeof r.charts>();
  for (const c of r.charts) {
    expect(c.x).toBeGreaterThanOrEqual(0);
    expect(c.y).toBeGreaterThanOrEqual(0);
    expect(c.x + c.w).toBeLessThanOrEqual(size);
    expect(c.y + c.h).toBeLessThanOrEqual(size);
    const l = byAtlas.get(c.atlas) ?? [];
    l.push(c);
    byAtlas.set(c.atlas, l);
  }
  for (const list of byAtlas.values()) {
    // Sweep over x for overlaps.
    const s = [...list].sort((a, b) => a.x - b.x);
    for (let i = 0; i < s.length; i++) {
      for (let j = i + 1; j < s.length && s[j]!.x < s[i]!.x + s[i]!.w; j++) {
        const a = s[i]!;
        const b = s[j]!;
        const overlap = a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `charts overlap at ${a.x},${a.y} / ${b.x},${b.y}`).toBe(false);
      }
    }
  }
  for (const c of r.charts) {
    const uv = r.meshes[c.mesh]!.uv;
    expect(r.meshes[c.mesh]!.atlas).toBe(c.atlas);
    for (const t of c.tris) {
      for (let v = 0; v < 3; v++) {
        const u = uv[(t * 3 + v) * 2]! * size;
        const w = uv[(t * 3 + v) * 2 + 1]! * size;
        expect(u).toBeGreaterThanOrEqual(c.x + pad);
        expect(u).toBeLessThanOrEqual(c.x + c.w - pad);
        expect(w).toBeGreaterThanOrEqual(c.y + pad);
        expect(w).toBeLessThanOrEqual(c.y + c.h - pad);
      }
    }
  }
  positions.forEach((p, i) => expect(r.meshes[i]!.uv.length).toBe((p.length / 3) * 2));
}

describe('skyline packer', () => {
  it('packs rectangles without overlaps inside the bin', () => {
    const rects: [number, number][] = [];
    let seed = 7;
    const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let i = 0; i < 150; i++)
      rects.push([2 + Math.floor(rnd() * 40), 2 + Math.floor(rnd() * 20)]);
    rects.sort((a, b) => b[1] - a[1]);
    const pos = packSkyline(rects, 256)!;
    expect(pos).not.toBeNull();
    for (let i = 0; i < rects.length; i++) {
      const [x, y] = pos[i]!;
      const [w, h] = rects[i]!;
      expect(x + w).toBeLessThanOrEqual(256);
      expect(y + h).toBeLessThanOrEqual(256);
      for (let j = 0; j < i; j++) {
        const [x2, y2] = pos[j]!;
        const [w2, h2] = rects[j]!;
        expect(x < x2 + w2 && x2 < x + w && y < y2 + h2 && y2 < y + h).toBe(false);
      }
    }
  });

  it('reports rectangles that do not fit', () => {
    expect(packSkyline([[300, 10]], 256)).toBeNull();
    expect(
      packSkyline(
        [
          [200, 200],
          [200, 200],
        ],
        256,
      ),
    ).toBeNull();
  });
});

describe('UV2 unwrap', () => {
  const meshes = [
    { id: 'a', positions: box(0, 0, 0, 2, 1, 0.5) },
    { id: 'b', positions: box(3, 0, 0, 3.3, 2.4, 1) },
  ];
  const opts = { atlasSize: 256, atlases: 2, padding: 2, texelSize: () => 0.05 };

  it('makes one chart per box face with padded, non-overlapping rectangles', () => {
    const r = unwrap(meshes, opts);
    expect(r.meshes.map((m) => m.charts)).toEqual([6, 6]);
    expect(r.scale).toBe(1);
    checkLayout(
      r,
      meshes.map((m) => m.positions),
      256,
      2,
    );
    // Texel density: 1 / 0.05 m = 20 texels per metre along every edge.
    const uv = r.meshes[0]!.uv;
    const p = meshes[0]!.positions;
    for (let v = 0; v < uv.length / 2; v += 3) {
      for (const [a, b] of [
        [v, v + 1],
        [v + 1, v + 2],
      ] as const) {
        const d = Math.hypot(
          p[a * 3]! - p[b * 3]!,
          p[a * 3 + 1]! - p[b * 3 + 1]!,
          p[a * 3 + 2]! - p[b * 3 + 2]!,
        );
        const t = Math.hypot(uv[a * 2]! - uv[b * 2]!, uv[a * 2 + 1]! - uv[b * 2 + 1]!) * 256;
        expect(t).toBeCloseTo(d * 20, 3);
      }
    }
  });

  it('is deterministic', () => {
    const a = unwrap(meshes, opts);
    const b = unwrap(meshes, opts);
    expect([...a.meshes[0]!.uv]).toEqual([...b.meshes[0]!.uv]);
    expect([...a.meshes[1]!.uv]).toEqual([...b.meshes[1]!.uv]);
  });

  it('lowers the density until everything fits', () => {
    const r = unwrap(meshes, { ...opts, atlasSize: 64, atlases: 1 });
    expect(r.scale).toBeLessThan(1);
    checkLayout(
      r,
      meshes.map((m) => m.positions),
      64,
      2,
    );
  });

  it('quantises uv2 to 16 bits', () => {
    const q = quantizeUv([0, 0.5, 1, 1.2, -0.1]);
    expect([...q]).toEqual([0, 32768, 65535, 65535, 0]);
  });
});

describe('scene unwrap (the baked atlases)', { timeout: 120_000 }, () => {
  const scene = buildBakeScene();
  const positions = scene.baked.map((m) => m.geometry.getAttribute('position').array);
  const r = unwrap(
    scene.baked.map((m, i) => ({ id: m.name, positions: positions[i]! })),
    {
      atlasSize: ATLAS.size,
      atlases: ATLAS.count,
      padding: ATLAS.padding,
      texelSize,
      coneDeg: ATLAS.coneDeg,
    },
  );

  it('bakes every opaque, non-vegetation mesh', () => {
    for (const m of scene.meshes)
      expect(scene.baked.includes(m)).toBe(!UNBAKED.has(m.name as never));
    expect(scene.baked.length).toBeGreaterThan(30);
  });

  it('fits 2 × 2K at the full density (~3 cm indoors)', () => {
    expect(r.scale).toBe(1);
    expect(r.fill.every((f) => f < 0.9)).toBe(true);
    expect(texelSize('oak', [5, 0, 3])).toBe(TEXEL.interior);
    expect(texelSize('lawn', [5, 0, 12])).toBeGreaterThan(TEXEL.interior);
  });

  it('has valid, padded, non-overlapping charts', () => {
    checkLayout(r, positions, ATLAS.size, ATLAS.padding);
  });

  it('keeps triangles of the same chart from overlapping (texel-centre raster)', () => {
    const S = ATLAS.size;
    let doubles = 0;
    let covered = 0;
    for (const atlas of [0, 1]) {
      const owner = new Int32Array(S * S).fill(-1);
      for (const c of r.charts) {
        if (c.atlas !== atlas) continue;
        const uv = r.meshes[c.mesh]!.uv;
        for (const t of c.tris) {
          const ax = uv[t * 6]! * S;
          const ay = uv[t * 6 + 1]! * S;
          const bx = uv[t * 6 + 2]! * S;
          const by = uv[t * 6 + 3]! * S;
          const cx = uv[t * 6 + 4]! * S;
          const cy = uv[t * 6 + 5]! * S;
          const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
          if (Math.abs(area) < 1e-9) continue;
          const x0 = Math.max(0, Math.floor(Math.min(ax, bx, cx)));
          const x1 = Math.min(S - 1, Math.ceil(Math.max(ax, bx, cx)));
          const y0 = Math.max(0, Math.floor(Math.min(ay, by, cy)));
          const y1 = Math.min(S - 1, Math.ceil(Math.max(ay, by, cy)));
          const key = c.mesh * 1e6 + t;
          for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
              const px = x + 0.5;
              const py = y + 0.5;
              const w0 = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
              const w1 = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
              const w2 = 1 - w0 - w1;
              if (w0 <= 1e-4 || w1 <= 1e-4 || w2 <= 1e-4) continue;
              const i = y * S + x;
              if (owner[i] !== -1 && owner[i] !== key) doubles++;
              owner[i] = key;
              covered++;
            }
          }
        }
      }
    }
    expect(covered).toBeGreaterThan(1e6);
    // A few texel centres may sit in two sliver triangles of a curved chart; nothing more.
    expect(doubles / covered).toBeLessThan(1e-4);
  });
});

describe('lightmap manifest, hash and fallback', () => {
  const pos = new Float32Array(box(0, 0, 0, 1, 1, 1));
  const mesh = (
    name: string,
    p: Float32Array = pos,
  ): { name: string; geometry: THREE.BufferGeometry } => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    return { name, geometry: g };
  };
  const manifest = (): LightmapManifest => ({
    version: 1,
    encoding: 'rgbm',
    range: 8,
    sunLuminance: 3.3,
    atlases: [
      {
        size: 2048,
        files: { low: 'a-1k.ktx2', medium: 'a-2k.ktx2', high: 'a-2k.ktx2' },
        bytes: {},
      },
    ],
    uv2: { file: 'uv2.bin', bytes: 144 },
    meshes: [{ id: 'oak', atlas: 0, vertices: 36, offset: 0, hash: geometryHash(pos) }],
  });

  it('hashes positions stably (0.1 mm quantisation)', () => {
    const a = geometryHash(pos);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(geometryHash(pos.map((v) => v + 1e-7))).toBe(a);
    const moved = pos.slice();
    moved[4]! += 0.01;
    expect(geometryHash(moved)).not.toBe(a);
    expect(geometryHash(pos.subarray(0, 27))).not.toBe(a);
  });

  it('parses a valid manifest and rejects malformed ones', () => {
    expect(parseLightmapManifest(manifest())).not.toBeNull();
    expect(parseLightmapManifest(null)).toBeNull();
    expect(parseLightmapManifest({ ...manifest(), version: 2 })).toBeNull();
    expect(parseLightmapManifest({ ...manifest(), encoding: 'hdr' })).toBeNull();
    expect(parseLightmapManifest({ ...manifest(), atlases: [] })).toBeNull();
    const m = manifest();
    m.meshes[0]!.atlas = 3;
    expect(parseLightmapManifest(m)).toBeNull();
    const n = manifest() as unknown as { atlases: { files: Record<string, unknown> }[] };
    delete n.atlases[0]!.files.low;
    expect(parseLightmapManifest(n)).toBeNull();
  });

  it('uses the bake only if every mesh still matches (all or nothing)', () => {
    const ok = matchMeshes(manifest(), [mesh('oak'), mesh('glass')], 72);
    expect(ok.ok).toBe(true);
    expect(matchMeshes(manifest(), [mesh('plaster')], 72)).toMatchObject({ ok: false });
    expect(matchMeshes(manifest(), [mesh('oak', pos.subarray(0, 27))], 72)).toMatchObject({
      ok: false,
    });
    const moved = pos.slice();
    moved[0]! += 0.05;
    const res = matchMeshes(manifest(), [mesh('oak', moved)], 72);
    expect(res).toMatchObject({ ok: false });
    if (!res.ok) expect(res.reason).toMatch(/changed since the bake/);
    expect(matchMeshes(manifest(), [mesh('oak')], 10)).toMatchObject({ ok: false });
  });

  const baked = path.resolve('public/assets/baked/manifest.json');
  it.skipIf(!fs.existsSync(baked))(
    'the committed bake matches the current scene (re-bake after geometry changes)',
    { timeout: 60_000 },
    () => {
      const m = parseLightmapManifest(JSON.parse(fs.readFileSync(baked, 'utf8')));
      expect(m).not.toBeNull();
      const uvBytes = fs.statSync(path.resolve('public/assets/baked', m!.uv2.file)).size;
      for (const a of m!.atlases) {
        for (const f of new Set(Object.values(a.files))) {
          expect(fs.existsSync(path.resolve('public/assets/baked', f))).toBe(true);
        }
      }
      const res = matchMeshes(m!, buildBakeScene().meshes, uvBytes / 2);
      expect(res.ok ? '' : res.reason).toBe('');
    },
  );
});

describe('RGBM export', () => {
  it('round-trips irradiance with sqrt colour precision', () => {
    const src = new Float32Array([
      2.5, 1.2, 0.4, 1, 0.004, 0.003, 0.002, 1, 0, 0, 0, 1, 20, 1, 1, 1,
    ]);
    const bytes = encodeRGBM(src, 8);
    const a = decodeRGBM(bytes, 0, 8);
    expect(a[0]).toBeCloseTo(2.5, 1);
    expect(a[2]).toBeCloseTo(0.4, 1);
    const dark = decodeRGBM(bytes, 4, 8);
    expect(Math.abs(dark[0] - 0.004) / 0.004).toBeLessThan(0.1);
    expect(decodeRGBM(bytes, 8, 8)).toEqual([0, 0, 0]);
    expect(decodeRGBM(bytes, 12, 8)[0]).toBeCloseTo(8, 5); // clamped to the range
  });

  it('downsamples 2× ignoring empty texels', () => {
    const src = new Float32Array(4 * 4 * 4);
    src.set([1, 1, 1, 1], 0);
    src.set([3, 3, 3, 1], 4);
    const out = downsample2x(src, 4);
    expect(out.length).toBe(2 * 2 * 4);
    expect([...out.subarray(0, 4)]).toEqual([2, 2, 2, 1]);
    expect(out[7]).toBe(0);
  });
});

describe('baked shader patch', () => {
  const chunk = THREE.ShaderChunk.lights_fragment_maps;
  it('replaces the r186 lightmap chunk (hooks present)', () => {
    expect(THREE.ShaderLib.physical.fragmentShader).toContain('#include <lights_fragment_maps>');
    expect(THREE.ShaderLib.physical.fragmentShader).toContain('#include <common>');
    expect(chunk).toContain('lightMapIrradiance');
    expect(BAKED_FRAGMENT).toContain('bakedRange');
  });

  it('composes with the anti-tiling patch (one program per combination)', () => {
    const a = new THREE.MeshStandardMaterial();
    const b = new THREE.MeshStandardMaterial();
    const u = createBakedUniforms(8, 3.3);
    applyAntiTiling(a, 'macro', [0, 0.1]);
    applyBakedPatch(a, u);
    applyBakedPatch(b, u);
    applyAntiTiling(b, 'macro', [0, 0.2]);
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
    };
    a.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, null!);
    expect(shader.fragmentShader).toContain('uniform float bakedRange');
    expect(shader.fragmentShader).toContain('bakedIrradiance');
    expect(shader.fragmentShader).toContain('uniform vec2 antiTile');
    expect(shader.fragmentShader).not.toContain('#include <lights_fragment_maps>');
    expect(shader.uniforms.bakedRange?.value).toBe(8);
    expect(shader.uniforms.antiTile).toBeDefined();
  });
});
