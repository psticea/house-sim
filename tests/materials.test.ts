import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { estimateTextureMB, textureBytes } from '../src/core/debug';
import type { TextureManifest } from '../src/core/assets';
import { TIERS } from '../src/core/quality';
import { FINISHES } from '../src/world/finishes';
import { createMaterials, PALETTE } from '../src/world/materials';
import {
  applyAntiTiling,
  colorMultiplier,
  isIndoors,
  mapsFor,
  PROBES,
  probeFor,
} from '../src/world/realLook';

const ROOT = path.resolve(import.meta.dirname, '..');
const manifest = JSON.parse(
  fs.readFileSync(path.join(ROOT, 'public/assets/textures/manifest.json'), 'utf8'),
) as TextureManifest;

describe('I4 materials: finishes and texture sets', () => {
  it('every material id has a finish, and every finish a known id', () => {
    expect(Object.keys(FINISHES).sort()).toEqual(Object.keys(PALETTE).sort());
  });

  it('every referenced texture set is shipped, for every tier, with files on disk', () => {
    for (const [id, f] of Object.entries(FINISHES)) {
      if (!f.set) continue;
      const entry = manifest.sets[f.set];
      expect(entry, `${id} → ${f.set}`).toBeDefined();
      const maps = mapsFor(f, manifest);
      expect(maps.length, id).toBeGreaterThan(0);
      for (const m of maps) {
        for (const t of TIERS) {
          const rel = entry!.maps[m]![t];
          expect(rel, `${f.set} ${m} ${t}`).toMatch(/\.ktx2$/);
          const file = path.join(ROOT, 'public/assets/textures', rel);
          expect(fs.existsSync(file), rel).toBe(true);
        }
      }
    }
  });

  it('textures are sized per tier: low ≤ medium ≤ high, hero albedo 2K at medium', () => {
    const px = (rel: string): number => Number(/-(\d+)\.ktx2$/.exec(rel)![1]);
    for (const [id, entry] of Object.entries(manifest.sets)) {
      for (const tiers of Object.values(entry.maps)) {
        expect(px(tiers.low), id).toBeLessThanOrEqual(px(tiers.medium));
        expect(px(tiers.medium), id).toBeLessThanOrEqual(px(tiers.high));
      }
      if (entry.kind === 'hero') expect(px(entry.maps.albedo!.medium), id).toBe(2048);
    }
    expect(manifest.sky?.background).toMatch(/\.ktx2$/);
  });

  it('parquet boards ~15–20 cm and tiles 60 cm at their world scale', () => {
    // laminate_floor_02: 7.5 boards per tile; grey_tiles: 4 × 4 tiles per tile.
    const board = FINISHES.oak.scaleM! / 7.5;
    expect(board).toBeGreaterThanOrEqual(0.15);
    expect(board).toBeLessThanOrEqual(0.2);
    expect(FINISHES.tile.scaleM! / 4).toBeCloseTo(0.6, 5);
  });

  it('with a texture the colour becomes a multiplier of the tinted texture mean', () => {
    const same = colorMultiplier({ color: '#C9A77C', roughness: 1, metalness: 0 }, '#C9A77C');
    expect([same.r, same.g, same.b].map((v) => Number(v.toFixed(6)))).toEqual([1, 1, 1]);
    const lighter = colorMultiplier(FINISHES.tileUtility, manifest.sets.tile!.tint);
    expect(lighter.r).toBeGreaterThan(1);
  });

  it('one standard material per id; glass stays transparent without depth writes', () => {
    const lib = createMaterials();
    for (const [id, m] of Object.entries(lib)) {
      expect((m as THREE.MeshStandardMaterial).isMeshStandardMaterial, id).toBe(true);
      expect(m.name).toBe(id);
    }
    expect(lib.glass.transparent).toBe(true);
    expect(lib.glass.depthWrite).toBe(false);
  });

  it('anti-tiling patch: shared program per mode, strengths per material', () => {
    const a = new THREE.MeshStandardMaterial();
    const b = new THREE.MeshStandardMaterial();
    applyAntiTiling(a, 'blend', [1, 0.2]);
    applyAntiTiling(b, 'blend', [0.5, 0.1]);
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
    const shader = {
      uniforms: {} as Record<string, { value: unknown }>,
      fragmentShader: THREE.ShaderLib.standard.fragmentShader,
      vertexShader: THREE.ShaderLib.standard.vertexShader,
    };
    expect(shader.fragmentShader).toContain('#include <map_fragment>');
    a.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, null!);
    expect(shader.fragmentShader).toContain('atNoise');
    expect(shader.fragmentShader).not.toContain('#include <map_fragment>');
    expect((shader.uniforms.antiTile?.value as THREE.Vector2).x).toBe(1);
    const c = new THREE.MeshStandardMaterial();
    applyAntiTiling(c, 'none', [0, 0]);
    expect(c.customProgramCacheKey()).not.toBe(a.customProgramCacheKey());
  });

  it('probes cover the indoor rooms; outside and the deck use the sky', () => {
    expect(probeFor('outside')).toBeNull();
    expect(probeFor('terrace')).toBeNull();
    expect(isIndoors('living-kitchen')).toBe(true);
    expect(probeFor('upper-bathroom')).toBe('bathroom');
    expect(probeFor('bedroom-3')).toBe('bedroom-3');
    expect(probeFor('some-new-room')).toBe('living');
    expect(PROBES.length).toBeGreaterThanOrEqual(2);
    expect(PROBES.length).toBeLessThanOrEqual(4);
  });
});

describe('texture memory estimate', () => {
  it('compressed textures count their uploaded mip data', () => {
    const mip = (s: number) => ({ data: new Uint8Array((s * s) / 2), width: s, height: s });
    const t = new THREE.CompressedTexture([mip(8), mip(4)], 8, 8, THREE.RGB_ETC1_Format);
    expect(textureBytes(t)).toBe(32 + 8);
  });

  it('uncompressed: texels × bytes, +⅓ with mipmaps; half-float render targets 8 B', () => {
    const d = new THREE.DataTexture(new Uint8Array(16 * 16 * 4), 16, 16);
    d.generateMipmaps = true;
    d.minFilter = THREE.LinearMipmapLinearFilter;
    expect(textureBytes(d)).toBeCloseTo(16 * 16 * 4 * (4 / 3), 5);
    const rt = new THREE.WebGLRenderTarget(64, 32, { type: THREE.HalfFloatType });
    expect(textureBytes(rt.texture)).toBe(64 * 32 * 8);
  });

  it('scene estimate: shared sources once, env + extra + shadow maps included', () => {
    const scene = new THREE.Scene();
    const tex = new THREE.DataTexture(new Uint8Array(32 * 32 * 4), 32, 32);
    tex.generateMipmaps = false;
    tex.minFilter = THREE.LinearFilter;
    const clone = tex.clone();
    clone.repeat.set(2, 2);
    scene.add(
      new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: tex })),
    );
    scene.add(
      new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial({ map: clone })),
    );
    const one = (32 * 32 * 4) / (1024 * 1024);
    expect(estimateTextureMB(scene)).toBeCloseTo(one, 6);
    const probe = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType });
    expect(estimateTextureMB(scene, [probe.texture])).toBeCloseTo(one + (16 * 16 * 8) / 2 ** 20, 6);
    const sun = new THREE.DirectionalLight();
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    scene.add(sun);
    expect(estimateTextureMB(scene)).toBeCloseTo(one + 8, 6);
  });
});
