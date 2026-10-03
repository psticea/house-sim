import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { estimateTextureMB, textureBytes } from '../src/core/debug';
import type { TextureManifest } from '../src/core/assets';
import { TIERS } from '../src/core/quality';
import { BOARD_TEXTURE, FINISHES } from '../src/world/finishes';
import { createMaterials, PALETTE } from '../src/world/materials';
import { GEOMETRY_EXTRAS, MeshBuilder } from '../src/world/meshBuilder';
import {
  applyAntiTiling,
  colorMultiplier,
  isIndoors,
  mapsFor,
  PROBES,
  probeFor,
} from '../src/world/realLook';
import { BORDERLANDS, EDGE_HOSTS, SKETCHUP } from '../src/world/style';
import {
  DESKTOP_BC7_FORMATS,
  filePx,
  PHONE_FORMATS,
  tierFiles,
  tierTextureMB,
} from '../src/world/textureBudget';
import { buildGeometry } from '../src/world/build';
import { faceRoomIntervals, WET_ROOMS } from '../src/world/walls';
import { wallSpace } from '../src/world/wallSpace';
import { house } from '../src/data/house';

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

  it('real-world scales: parquet boards ~15–20 cm, tiles 60 × 120 cm, boards 26 / 15 cm', () => {
    // laminate_floor_02: 7.5 boards per tile.
    const board = FINISHES.oak.scaleM! / 7.5;
    expect(board).toBeGreaterThanOrEqual(0.15);
    expect(board).toBeLessThanOrEqual(0.2);
    // Derived `tile` set: 4 columns × 2 rows of tiles per texture tile.
    for (const id of ['tile', 'tileUtility', 'tileWall'] as const) {
      expect(FINISHES[id].set).toBe('tile');
      expect(FINISHES[id].scaleM! / 4, id).toBeCloseTo(0.6, 5);
      expect(FINISHES[id].scaleM! / 2, id).toBeCloseTo(1.2, 5);
    }
    // Derived `extwood` boards: BOARD_TEXTURE.boards rows per tile.
    expect(manifest.sets.extwood!.sizeM).toBeCloseTo(BOARD_TEXTURE.tileM, 5);
    expect(FINISHES.cladWood.scaleM).toBe(BOARD_TEXTURE.tileM);
    expect(BOARD_TEXTURE.tileM / BOARD_TEXTURE.boards).toBeCloseTo(0.26, 5);
    const deck = FINISHES.deck.scaleM! / BOARD_TEXTURE.boards;
    expect(deck).toBeGreaterThanOrEqual(0.12);
    expect(deck).toBeLessThanOrEqual(0.16);
    // Textiles and cane: fine weaves, never stretched over a whole sofa.
    for (const id of ['linen', 'wool', 'cane'] as const) {
      expect(FINISHES[id].set, id).toBe(id);
      expect(FINISHES[id].scaleM!, id).toBeLessThanOrEqual(1);
    }
  });

  it('every furniture and facade material has a texture or detail map (no flat plastic)', () => {
    const flatAllowed = new Set(['glass', 'mirror', 'grating', 'meadow', 'flowers']);
    for (const [id, f] of Object.entries(FINISHES)) {
      if (flatAllowed.has(id)) continue;
      expect(f.set, id).toBeDefined();
    }
    // RAL 7016 anthracite reads warm-neutral (no blue cast), matte powder coat.
    for (const id of ['cladMetal', 'roofMetal', 'frame'] as const) {
      const c = new THREE.Color(FINISHES[id].color);
      expect(c.b, id).toBeLessThanOrEqual(c.r);
      expect(FINISHES[id].metalness, id).toBe(0);
    }
  });

  it('with a texture the colour becomes a multiplier of the tinted texture mean', () => {
    const same = colorMultiplier({ color: '#C9A77C', roughness: 1, metalness: 0 }, '#C9A77C');
    expect([same.r, same.g, same.b].map((v) => Number(v.toFixed(6)))).toEqual([1, 1, 1]);
    const lighter = colorMultiplier(FINISHES.tileWall, manifest.sets.tile!.tint);
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

describe('I4 redo: texture budgets per tier (from the manifest and the finishes)', () => {
  const texDir = path.join(ROOT, 'public/assets/textures');

  it('every file a tier loads is in the manifest and on disk', () => {
    for (const t of TIERS) {
      for (const rel of tierFiles(manifest, t).keys()) {
        expect(fs.existsSync(path.join(texDir, rel)), rel).toBe(true);
        expect(filePx(rel), rel).toBeGreaterThanOrEqual(512);
      }
    }
  });

  it('GPU texture memory per tier within budget (phones; desktop BC7 medium ≤ 75 MB)', () => {
    const phone = Object.fromEntries(TIERS.map((t) => [t, tierTextureMB(manifest, t)]));
    expect(phone.low!.total).toBeLessThanOrEqual(40);
    expect(phone.medium!.total).toBeLessThanOrEqual(70);
    expect(phone.high!.total).toBeLessThanOrEqual(120);
    // With the bake back (lightmaps instead of the shadow map), still in budget.
    for (const t of TIERS) {
      const baked = tierTextureMB(manifest, t, PHONE_FORMATS, true);
      expect(baked.total, t).toBeLessThanOrEqual(t === 'low' ? 40 : t === 'medium' ? 70 : 120);
    }
    // Desktop GPUs transcode everything to BC7 (1 B per texel): the hard cap still holds.
    expect(tierTextureMB(manifest, 'medium', DESKTOP_BC7_FORMATS).total).toBeLessThanOrEqual(75);
    // …also with the bake (3 × 2K lightmaps instead of the 1024² shadow map).
    const bakedDesktop = tierTextureMB(manifest, 'medium', DESKTOP_BC7_FORMATS, true);
    expect(bakedDesktop.lightmaps).toBeCloseTo(12, 5);
    expect(bakedDesktop.shadow).toBe(0);
    expect(bakedDesktop.total).toBeLessThanOrEqual(75);
    expect(tierTextureMB(manifest, 'low', PHONE_FORMATS, true).lightmaps).toBeCloseTo(3, 5);
    expect(phone.low!.total).toBeLessThan(phone.medium!.total);
    expect(phone.medium!.total).toBeLessThanOrEqual(phone.high!.total);
  });

  it('tracked optimised textures stay lean (≤ 25 MB for all tiers)', () => {
    let bytes = 0;
    for (const s of Object.values(manifest.sets)) {
      for (const [rel, b] of Object.entries(s.bytes)) {
        expect(fs.statSync(path.join(texDir, rel)).size, rel).toBe(b);
        bytes += b;
      }
    }
    expect(bytes / 1e6).toBeLessThanOrEqual(25);
  });
});

describe('I4 redo: wet-room wall tiles, per-piece UVs, reveal shading', () => {
  it('wet rooms exist and their plaster wall faces become tileWall (elsewhere plaster)', () => {
    const rooms = house.levels.flatMap((l) => l.rooms);
    for (const id of WET_ROOMS)
      expect(
        rooms.some((r) => r.id === id),
        id,
      ).toBe(true);
    const { mesh } = buildGeometry(house, { site: false });
    const g = mesh.toGeometries();
    const tiles = g.get('tileWall')!;
    expect(tiles).toBeDefined();
    const pos = tiles.getAttribute('position');
    const nor = tiles.getAttribute('normal');
    let area = 0;
    for (let i = 0; i < pos.count; i += 3) {
      // Vertical faces only, each inside (2 cm in front of it) one of the wet rooms.
      expect(Math.abs(nor.getY(i))).toBeLessThan(1e-6);
      const cx = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
      const cz = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
      const x = cx + nor.getX(i) * 0.02;
      const z = cz + nor.getZ(i) * 0.02;
      const inWet = house.levels.some((l) =>
        l.rooms.some((r) => WET_ROOMS.has(r.id) && pointIn(x, z, r.polygon)),
      );
      expect(inWet, `${x.toFixed(2)}, ${z.toFixed(2)}`).toBe(true);
      const ax = pos.getX(i + 1) - pos.getX(i);
      const ay = pos.getY(i + 1) - pos.getY(i);
      const az = pos.getZ(i + 1) - pos.getZ(i);
      const bx = pos.getX(i + 2) - pos.getX(i);
      const by = pos.getY(i + 2) - pos.getY(i);
      const bz = pos.getZ(i + 2) - pos.getZ(i);
      area += Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) / 2;
    }
    // Three rooms of 2–2.3 m by 2.2–3.3 m, walls ~2.2–2.9 m high (minus openings).
    expect(area).toBeGreaterThan(40);
    expect(area).toBeLessThan(110);
  });

  it('a face is split at the wet-room boundary', () => {
    const level = house.levels.find((l) => l.id === 'ground')!;
    const wet = level.rooms.filter((r) => WET_ROOMS.has(r.id)).map((r) => r.polygon);
    let split = 0;
    for (const wall of level.walls) {
      if (wall.kind === 'curtain') continue;
      const ws = wallSpace(wall, level.floorY);
      for (const n of [1, -1] as const) {
        const w = (n * ws.thickness) / 2;
        const iv = faceRoomIntervals(ws, w, n, wet);
        for (const [u0, u1] of iv) {
          expect(u0).toBeGreaterThanOrEqual(0);
          expect(u1).toBeLessThanOrEqual(ws.length + 1e-9);
          expect(u1).toBeGreaterThan(u0);
          if (u0 > 1e-3 || u1 < ws.length - 1e-3) split++;
        }
      }
    }
    expect(split).toBeGreaterThan(0);
  });

  it('stylised looks draw tileWall exactly like plaster (colour, surface, lines)', () => {
    expect(PALETTE.tileWall).toEqual(PALETTE.plaster);
    expect(EDGE_HOSTS.tileWall).toBe('plaster');
    for (const cfg of [SKETCHUP, BORDERLANDS]) {
      expect(cfg.surfaces.tileWall).toBe(cfg.surfaces.plaster);
      expect(cfg.noLines.includes('tileWall')).toBe(cfg.noLines.includes('plaster'));
    }
  });

  it('per-piece uv2 and cavity shade only on the materials that use them', () => {
    const mb = new MeshBuilder();
    mb.uvShift = [0.25, 0.5];
    mb.shade = { value: 0.3, facing: [0, 0, 1] };
    mb.box('joinery', [0, 0, 0], [1, 1, 1]);
    mb.box('oak', [0, 0, 0], [1, 1, 1]);
    mb.uvShift = null;
    mb.shade = null;
    mb.box('joinery', [2, 0, 0], [3, 1, 1]);
    const g = mb.toGeometries();
    const j = g.get('joinery')!;
    const uv = j.getAttribute('uv');
    const uv2 = j.getAttribute('uv2');
    const col = j.getAttribute('color');
    expect(uv2.getX(0) - uv.getX(0)).toBeCloseTo(0.25, 6);
    expect(uv2.getY(0) - uv.getY(0)).toBeCloseTo(0.5, 6);
    expect(uv2.getX(36) - uv.getX(36)).toBe(0);
    let shaded = 0;
    for (let i = 0; i < col.count; i++) if (col.getX(i) < 1) shaded++;
    expect(shaded).toBe(6); // the +z face of the first box: 2 triangles
    expect(g.get('oak')!.getAttribute('uv2')).toBeUndefined();
    expect(g.get('oak')!.getAttribute('color')).toBeUndefined();
    const lib = createMaterials();
    for (const [id, extras] of Object.entries(GEOMETRY_EXTRAS)) {
      expect((lib[id as keyof typeof lib] as THREE.MeshStandardMaterial).vertexColors, id).toBe(
        extras.color === true,
      );
    }
  });
});

function pointIn(x: number, z: number, poly: readonly (readonly [number, number])[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i]!;
    const [xj, zj] = poly[j]!;
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
