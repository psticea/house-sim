import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { describe, expect, it } from 'vitest';
import type { MaterialId } from '../src/data/schema';
import {
  DEFAULT_STYLE,
  parseStyle,
  readParams,
  STYLE_NAMES,
  styleNameOf,
  type StyleName,
} from '../src/core/params';
import { house } from '../src/data/house';
import { buildWorld } from '../src/world/build';
import { createMaterials, PALETTE } from '../src/world/materials';
import { MeshBuilder, trianglesToGeometry } from '../src/world/meshBuilder';
import {
  applyStyle,
  BORDERLANDS,
  disposeStyles,
  getStyle,
  isStyleBuilt,
  removeStyle,
  setStyle,
  SKETCHUP,
  STYLES,
  weightedEdgeSegments,
} from '../src/world/style';
import {
  extractFeatureEdges,
  extractWeightedEdges,
  jitterSegments,
} from '../src/world/style/edges';
import { curvedHullGeometry } from '../src/world/style/hull';
import { generateClouds, MAX_PUFFS } from '../src/world/style/sky';
import {
  bandValues,
  createGradientMap,
  createGrassMap,
  createGroundPattern,
  createPaintMap,
  gradeColor,
  pastelColor,
} from '../src/world/style/textures';
import {
  applyInkShading,
  createInkUniforms,
  INK_HOOKS,
  inkPatchSupported,
} from '../src/world/style/toon';

const hsl = (c: THREE.Color) => c.getHSL({ h: 0, s: 0, l: 0 }, THREE.SRGBColorSpace);

function segmentsOf(a: Float32Array): { len: number; mid: THREE.Vector3 }[] {
  const out = [];
  for (let o = 0; o < a.length; o += 6) {
    const p = new THREE.Vector3(a[o], a[o + 1], a[o + 2]);
    const q = new THREE.Vector3(a[o + 3], a[o + 4], a[o + 5]);
    out.push({ len: p.distanceTo(q), mid: p.add(q).multiplyScalar(0.5) });
  }
  return out;
}
const totalLength = (a: Float32Array) => segmentsOf(a).reduce((s, x) => s + x.len, 0);

/** Two quads meeting along the z axis (x = y = 0) with `deg` between their normals. */
function fold(deg: number): THREE.BufferGeometry {
  const r = THREE.MathUtils.degToRad(deg);
  const p = [Math.cos(r), Math.sin(r)];
  return trianglesToGeometry([
    ...[0, 0, 0, 1, 0, 0, 0, 0, -1],
    ...[0, 0, -1, 1, 0, 0, 1, 0, -1],
    ...[0, 0, 0, 0, 0, -1, -p[0]!, p[1]!, -1],
    ...[0, 0, 0, -p[0]!, p[1]!, -1, -p[0]!, p[1]!, 0],
  ]);
}
const hingeLength = (segs: Float32Array) =>
  segmentsOf(segs)
    .filter((s) => Math.abs(s.mid.x) < 1e-6 && Math.abs(s.mid.y) < 1e-6)
    .reduce((s, x) => s + x.len, 0);

describe('style names and URL parameter', () => {
  it('SketchUp is the default; `sketch` is an alias; unknown → default', () => {
    expect(DEFAULT_STYLE).toBe('sketchup');
    expect(STYLE_NAMES).toEqual(['sketchup', 'borderlands', 'real']);
    expect(readParams('').style).toBe('sketchup');
    expect(readParams('').styleParam).toBeNull();
    expect(readParams('?style=sketch').style).toBe('sketchup');
    expect(readParams('?style=sketch').styleParam).toBe('sketchup');
    expect(readParams('?style=sketchup').style).toBe('sketchup');
    expect(readParams('?style=borderlands').style).toBe('borderlands');
    expect(readParams('?style=real').style).toBe('real');
    expect(readParams('?style=BorderLands').style).toBe('borderlands');
    expect(readParams('?style=cartoon&debug').style).toBe('sketchup');
    expect(readParams('?style=cartoon').styleParam).toBeNull();
    expect(parseStyle(null)).toBe('sketchup');
    expect(styleNameOf('nope')).toBeNull();
    expect(styleNameOf(undefined)).toBeNull();
  });
});

describe('style textures and colours', () => {
  it('gradient map has one nearest-filtered texel per band, no mipmaps', () => {
    const g = createGradientMap(3, [0.75, 0.9, 1.0]);
    expect(g.image.width).toBe(3);
    expect(Array.from(g.image.data as Uint8Array)).toEqual([191, 230, 255]);
    expect(g.minFilter).toBe(THREE.NearestFilter);
    expect(g.magFilter).toBe(THREE.NearestFilter);
    expect(g.generateMipmaps).toBe(false);
    expect(g.format).toBe(THREE.RedFormat);
    const hard = createGradientMap(BORDERLANDS.bands, BORDERLANDS.bandBrightness);
    expect(Array.from(hard.image.data as Uint8Array)).toEqual([128, 255]);
  });

  it('band values resample the brightness list when the band count differs', () => {
    expect(bandValues(2, [0.6, 0.8, 1.0])).toEqual([0.6, 1.0]);
    expect(bandValues(5, [0.6, 1.0])).toEqual([0.6, 0.7, 0.8, 0.9, 1.0]);
  });

  it('SketchUp pastels keep the hue, lower saturation and raise lightness', () => {
    for (const id of ['cladWood', 'oak', 'lawn', 'field', 'frame', 'deck'] as MaterialId[]) {
      const src = hsl(new THREE.Color(PALETTE[id].color));
      const out = hsl(pastelColor(PALETTE[id].color, SKETCHUP.palette));
      expect(Math.abs(out.h - src.h), id).toBeLessThan(0.01);
      expect(out.s, id).toBeLessThan(src.s);
      expect(out.l, id).toBeGreaterThan(src.l);
      expect(out.l, id).toBeLessThanOrEqual(SKETCHUP.palette.maxLightness + 1e-6);
      expect(gradeColor(PALETTE[id].color, SKETCHUP.palette).getHex(), id).toBe(
        pastelColor(PALETTE[id].color, SKETCHUP.palette).getHex(),
      );
    }
    // Very light colours are never darkened (warm off-white walls stay off-white).
    const wall = hsl(pastelColor(PALETTE.plaster.color, SKETCHUP.palette));
    expect(wall.l).toBeGreaterThanOrEqual(hsl(new THREE.Color(PALETTE.plaster.color)).l - 1e-6);
  });

  it('Borderlands comic colours keep the hue, are more saturated and a bit darker', () => {
    for (const id of ['cladWood', 'oak', 'lawn', 'frame', 'deck', 'woodSlat'] as MaterialId[]) {
      const src = hsl(new THREE.Color(PALETTE[id].color));
      const out = hsl(gradeColor(PALETTE[id].color, BORDERLANDS.palette));
      expect(Math.abs(out.h - src.h), id).toBeLessThan(0.01);
      expect(out.s, id).toBeGreaterThan(src.s * 1.15);
      expect(out.l, id).toBeLessThanOrEqual(src.l + 1e-6);
      expect(out.l, id).toBeGreaterThanOrEqual(BORDERLANDS.palette.minLightness! - 1e-6);
    }
  });

  it('ground pattern tiles with mipmaps; `none` gives no texture', () => {
    const t = createGroundPattern('grid', 0.1)!;
    expect(t.wrapS).toBe(THREE.RepeatWrapping);
    expect(t.generateMipmaps).toBe(true);
    expect(t.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    const d = t.image.data as Uint8Array;
    expect(d[0]).toBeLessThan(255); // 1 m line at the tile border
    expect(d[(10 * 128 + 10) * 4]).toBe(255); // clear paper between lines
    expect(createGroundPattern('hatch', 0.1)).not.toBeNull();
    expect(createGroundPattern('none', 0.1)).toBeNull();
  });

  it('painted detail and grass maps: deterministic, tiling, mipmapped, low strength', () => {
    for (const make of [
      () => createPaintMap(BORDERLANDS.paint.strength, BORDERLANDS.paint.tileM, 64),
      () => createGrassMap(BORDERLANDS.grass.strength, BORDERLANDS.grass.tileM, 64),
    ]) {
      const a = make();
      const b = make();
      const da = a.image.data as Uint8Array;
      expect(Array.from(da)).toEqual(Array.from(b.image.data as Uint8Array));
      expect(a.wrapS).toBe(THREE.RepeatWrapping);
      expect(a.generateMipmaps).toBe(true);
      expect(a.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(a.repeat.x).toBeLessThan(1); // tiles over several metres (1 UV = 1 m)
      let sum = 0;
      let min = 255;
      for (let k = 0; k < da.length; k += 4) {
        sum += da[k + 1]!;
        min = Math.min(min, da[k + 1]!);
      }
      const mean = sum / (da.length / 4);
      expect(mean, a.name).toBeGreaterThan(170); // mostly the flat colour
      expect(min, a.name).toBeLessThan(mean - 25); // but visible strokes
    }
  });

  it('cartoon clouds are deterministic and fit the shader array', () => {
    const a = generateClouds(BORDERLANDS.sky.clouds!.count, BORDERLANDS.sky.clouds!.seed);
    const b = generateClouds(BORDERLANDS.sky.clouds!.count, BORDERLANDS.sky.clouds!.seed);
    expect(a.puffs.map((p) => p.toArray())).toEqual(b.puffs.map((p) => p.toArray()));
    expect(a.puffs.length).toBeGreaterThan(10);
    expect(a.puffs.length).toBeLessThanOrEqual(MAX_PUFFS);
    for (const p of a.puffs) {
      expect(p.y).toBeGreaterThan(0); // above the horizon
      expect(p.w).toBeGreaterThan(0);
    }
  });
});

describe('style edges and hulls', () => {
  it('a box has its 12 edges once each', () => {
    const b = new MeshBuilder();
    b.box('plaster', [0, 0, 0], [2, 1, 3]);
    const segs = extractFeatureEdges(b.toGeometries().get('plaster')!, 30);
    expect(totalLength(segs)).toBeCloseTo(4 * (2 + 1 + 3), 5);
  });

  it('coplanar pieces meeting at T-junctions draw no lines across the flat face', () => {
    // A 2 × 2 m flat face made of three rectangles: the left one spans the full
    // height, the right column is split in two → T-junction at (1, 1).
    const b = new MeshBuilder();
    const up = [0, 0, 1] as const;
    b.quad('plaster', [0, 0, 0], [1, 0, 0], [1, 2, 0], [0, 2, 0], up);
    b.quad('plaster', [1, 0, 0], [2, 0, 0], [2, 1, 0], [1, 1, 0], up);
    b.quad('plaster', [1, 1, 0], [2, 1, 0], [2, 2, 0], [1, 2, 0], up);
    const geo = b.toGeometries().get('plaster')!;
    const segs = extractFeatureEdges(geo, 30);
    expect(totalLength(segs)).toBeCloseTo(8, 5); // outline only
    for (const s of segmentsOf(segs)) {
      const onBorder =
        Math.abs(s.mid.x) < 1e-6 ||
        Math.abs(s.mid.x - 2) < 1e-6 ||
        Math.abs(s.mid.y) < 1e-6 ||
        Math.abs(s.mid.y - 2) < 1e-6;
      expect(onBorder, `stray line at ${s.mid.toArray().join(',')}`).toBe(true);
    }
    // three's EdgesGeometry sees the T-junction edges as open boundaries.
    const naive = new THREE.EdgesGeometry(geo, 30).getAttribute('position');
    expect(totalLength(naive.array as Float32Array)).toBeGreaterThan(8.5);
  });

  it('draws creases at or above the threshold angle only', () => {
    expect(hingeLength(extractFeatureEdges(fold(10), 30))).toBeCloseTo(0, 5);
    expect(hingeLength(extractFeatureEdges(fold(60), 30))).toBeCloseTo(1, 5);
  });

  it('two line weights: boundaries and sharp creases thick, soft creases thin', () => {
    // 45° crease → thin; 90° crease → thick; open boundaries → always thick.
    const soft = extractWeightedEdges(fold(45), 33, 60);
    expect(hingeLength(soft.thin)).toBeCloseTo(1, 5);
    expect(hingeLength(soft.thick)).toBeCloseTo(0, 5);
    const sharp = extractWeightedEdges(fold(90), 33, 60);
    expect(hingeLength(sharp.thick)).toBeCloseTo(1, 5);
    expect(hingeLength(sharp.thin)).toBeCloseTo(0, 5);
    expect(totalLength(soft.thick)).toBeCloseTo(6, 5); // the 6 open border edges
    // Same total as the single-weight extractor.
    const all = extractFeatureEdges(fold(45), 33);
    expect(totalLength(soft.thin) + totalLength(soft.thick)).toBeCloseTo(totalLength(all), 5);
    // A box: every edge is 90° → all thick.
    const b = new MeshBuilder();
    b.box('plaster', [0, 0, 0], [2, 1, 3]);
    const box = weightedEdgeSegments(b.toGeometries().get('plaster')!, BORDERLANDS);
    expect(box.thin.length).toBe(0);
    expect(totalLength(box.thick)).toBeGreaterThan(24 - 0.1);
  });

  it('jitter is deterministic, tiny, capped and only extends lines along themselves', () => {
    const segs = new Float32Array([0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0.5, 0]);
    const a = jitterSegments(segs, 0.003, 0.012);
    expect(Array.from(jitterSegments(segs, 0.003, 0.012))).toEqual(Array.from(a));
    expect(a[0]).toBeLessThanOrEqual(0);
    expect(a[0]).toBeGreaterThanOrEqual(-0.012);
    expect(a[3]).toBeGreaterThanOrEqual(10);
    expect(a[3]).toBeLessThanOrEqual(10.012 + 1e-6);
    expect([a[1], a[2], a[4], a[5]]).toEqual([0, 0, 0, 0]);
    expect(a[10]!).toBeLessThanOrEqual(0.5 + 0.0015 + 1e-6);
    expect(Array.from(jitterSegments(segs, 0, 0.012))).toEqual(Array.from(segs));
  });

  it('hulls only cover curved faces (cylinder sides), none for flat boxes', () => {
    const b = new MeshBuilder();
    b.cylinder('metalBlack', 0, 0, 0.2, 0, 3, 12);
    const hull = curvedHullGeometry(b.toGeometries().get('metalBlack')!, 33)!;
    expect(hull).not.toBeNull();
    expect(hull.getAttribute('position').count).toBe(12 * 2 * 3); // side quads only
    // Averaged normals point outward and are horizontal.
    const n = hull.getAttribute('normal');
    const p = hull.getAttribute('position');
    for (let i = 0; i < n.count; i++) {
      expect(Math.abs(n.getY(i))).toBeLessThan(1e-6);
      expect(n.getX(i) * p.getX(i) + n.getZ(i) * p.getZ(i)).toBeGreaterThan(0);
    }
    const box = new MeshBuilder();
    box.box('plaster', [0, 0, 0], [2, 1, 3]);
    expect(curvedHullGeometry(box.toGeometries().get('plaster')!, 33)).toBeNull();
  });

  it('the generated house produces no degenerate line segments', () => {
    const world = buildWorld(house);
    let total = 0;
    for (const m of world.group.children as THREE.Mesh[]) {
      const segs = extractFeatureEdges(m.geometry, SKETCHUP.edgeThresholdDeg);
      for (const s of segmentsOf(segs)) expect(s.len).toBeGreaterThan(1e-4);
      total += segs.length / 6;
    }
    expect(total).toBeGreaterThan(100);
    // Whole-house edge extraction: seconds under parallel test load (I2 building).
  }, 30_000);
});

describe('Borderlands config and ink shading', () => {
  it('config sanity: thick lines everywhere, hard toon, dark tinted shadows, no grain', () => {
    const c = BORDERLANDS;
    expect(c.fatLines).toBe('always');
    expect(c.lineWidth).toBeGreaterThanOrEqual(1.5);
    expect(c.sharpLines!.width).toBeGreaterThanOrEqual(2.5);
    expect(c.sharpLines!.width).toBeLessThanOrEqual(3.5);
    expect(c.sharpLines!.width).toBeGreaterThan(c.lineWidth);
    expect(c.sharpLines!.minDeg).toBeGreaterThan(c.edgeThresholdDeg);
    expect(c.edgeThresholdDeg).toBeGreaterThan(30); // 12-gon facets get hulls instead
    expect(c.hulls!.maxCreaseDeg).toBeLessThanOrEqual(c.edgeThresholdDeg);
    expect(c.bands).toBe(2);
    expect(c.shadowOpacity).toBeGreaterThanOrEqual(0.4);
    expect(c.shadowOpacity).toBeLessThanOrEqual(0.65);
    expect(c.ink).not.toBeNull();
    expect(c.ink!.crossBelow).toBeLessThanOrEqual(1);
    const tint = hsl(new THREE.Color(c.ink!.tint));
    expect(tint.h).toBeGreaterThan(0.55); // blue-violet
    expect(tint.h).toBeLessThan(0.8);
    expect(c.paperOverlay).toBe(0);
    expect(c.palette.saturation).toBeGreaterThan(1.1);
    expect(c.palette.lightness).toBeLessThan(1);
    expect(c.sky.clouds).toBeDefined();
    expect(c.shadowMapSize).toBe(1024);
    expect(c.maxPixelRatio).toBeLessThanOrEqual(1.5);
    expect(c.noLines).not.toContain('glass');
    expect(c.linedTransparent).toContain('glass');
    expect(c.surfaces.lawn).toBe('grass');
    // SketchUp stays the S1 look.
    expect(SKETCHUP.bands).toBe(3);
    expect(SKETCHUP.lineWidth).toBe(1.3);
    expect(SKETCHUP.fatLines).toBe('desktop');
    expect(SKETCHUP.ink).toBeNull();
    // Hulls only on rounded vegetation / pots / soft furniture, never on the architecture.
    expect(SKETCHUP.hulls!.only).toEqual([
      'foliage',
      'foliageLight',
      'bark',
      'barkBirch',
      'clay',
      'linen',
      'ceramic',
      'cane',
    ]);
    expect(SKETCHUP.hulls!.maxCreaseDeg).toBeLessThanOrEqual(SKETCHUP.edgeThresholdDeg);
    expect(SKETCHUP.paperOverlay).toBeGreaterThan(0);
    expect(STYLES).toEqual({ sketchup: SKETCHUP, borderlands: BORDERLANDS });
  });

  it('the r186 toon shader has the lines the ink patch hooks into', () => {
    expect(inkPatchSupported()).toBe(true);
    const frag = THREE.ShaderLib.toon!.fragmentShader;
    expect(frag).toContain(INK_HOOKS.pars);
    expect(frag).toContain(INK_HOOKS.output);
    expect(THREE.ShaderChunk.lights_toon_pars_fragment).toContain(INK_HOOKS.direct);
    expect(THREE.ShaderChunk.gradientmap_pars_fragment).toContain('getGradientIrradiance');
  });

  it('ink patch: injects hatching, shares uniforms and one program key', () => {
    const u = createInkUniforms();
    const a = new THREE.MeshToonMaterial();
    const b = new THREE.MeshToonMaterial();
    expect(applyInkShading(a, u)).toBe(true);
    expect(applyInkShading(a, u)).toBe(true); // idempotent
    applyInkShading(b, u);
    const shader = {
      uniforms: {} as Record<string, THREE.IUniform>,
      vertexShader: THREE.ShaderLib.toon!.vertexShader,
      fragmentShader: THREE.ShaderLib.toon!.fragmentShader,
    };
    a.onBeforeCompile(shader as unknown as THREE.WebGLProgramParametersWithUniforms, null!);
    expect(shader.fragmentShader).toContain('gl_FragCoord');
    expect(shader.fragmentShader).toContain('inkDirect += irradiance');
    expect(shader.fragmentShader).not.toContain(INK_HOOKS.pars); // chunk inlined + patched
    expect(shader.fragmentShader.indexOf('inkLit')).toBeLessThan(
      shader.fragmentShader.indexOf(INK_HOOKS.output),
    );
    expect(shader.uniforms.inkHatch).toBe(u.inkHatch);
    expect(a.customProgramCacheKey()).toBe(b.customProgramCacheKey());
  });
});

function syntheticScene() {
  const mats = createMaterials();
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.name = 'house';
  scene.add(group);
  const add = (id: MaterialId, build: (b: MeshBuilder) => void) => {
    const b = new MeshBuilder();
    build(b);
    const m = new THREE.Mesh(b.toGeometries().get(id), mats[id]);
    m.name = id;
    group.add(m);
    return m;
  };
  const box = (id: MaterialId, min: [number, number, number], max: [number, number, number]) =>
    add(id, (b) => b.box(id, min, max));
  const plaster = box('plaster', [0, 0, 0], [4, 2.7, 0.2]);
  const plaster2 = box('plaster', [0, 0, 1], [0.2, 2.7, 4]);
  const oak = box('oak', [0, -0.05, 0], [4, 0, 4]);
  const glass = box('glass', [1, 1, 0.09], [2, 2, 0.11]);
  glass.renderOrder = 10;
  const lawn = box('lawn', [-10, -0.1, -10], [10, -0.05, 10]);
  const chimney = add('metalBlack', (b) => b.cylinder('metalBlack', 2, 2, 0.2, 0, 3, 12));
  const collider = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1));
  collider.name = 'collider';
  collider.visible = false;
  const colliderMat = collider.material;
  scene.add(collider);
  const hemi = new THREE.HemisphereLight('#e4edf6', '#d6cebd', 2.7);
  const sun = new THREE.DirectionalLight('#fff4e2', 3.4);
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(hemi, sun);
  scene.fog = new THREE.Fog('#dfe8ee', 70, 420);
  const meshes = [plaster, plaster2, oak, glass, lawn, chimney];
  const originals = new Map(meshes.map((m) => [m, m.material] as const));
  return {
    scene,
    plaster,
    plaster2,
    oak,
    glass,
    lawn,
    chimney,
    collider,
    colliderMat,
    hemi,
    sun,
    originals,
    lighting: { hemi, sun },
  };
}

const count = (scene: THREE.Scene) => {
  let objects = 0;
  let lines = 0;
  let hulls = 0;
  scene.traverse((o) => {
    objects++;
    if (o.userData.styleOwned) {
      if (o instanceof THREE.Mesh && !(o instanceof LineSegments2)) hulls++;
      else lines++;
    }
  });
  return { objects, lines, hulls };
};

/** Materials of the scene's meshes (fills, lines, hulls), for resource-identity checks. */
const materialsOf = (scene: THREE.Scene) => {
  const out: THREE.Material[] = [];
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m) out.push(m);
  });
  return out;
};

describe('style registry: setStyle / removeStyle / disposeStyles', () => {
  it('SketchUp restyles meshes with shared toon materials and lines, idempotently', () => {
    const s = syntheticScene();
    expect(getStyle(s.scene)).toBe('real');
    applyStyle(s.scene, { lighting: s.lighting });
    expect(getStyle(s.scene)).toBe('sketchup');
    const first = count(s.scene);
    // plaster ×2, oak, chimney — not glass, lawn or the collider; no hulls.
    expect(first).toMatchObject({ lines: 4, hulls: 0 });
    applyStyle(s.scene, { lighting: s.lighting });
    setStyle(s.scene, 'sketch');
    expect(getStyle(s.scene)).toBe('sketchup');
    expect(count(s.scene)).toEqual(first);

    const toon = s.plaster.material as THREE.MeshToonMaterial;
    expect(toon.isMeshToonMaterial).toBe(true);
    expect(toon.name).toBe('plaster');
    expect(s.plaster2.material).toBe(toon); // shared per material id
    expect(toon.gradientMap?.minFilter).toBe(THREE.NearestFilter);
    expect(toon.polygonOffset).toBe(true);
    expect(toon.polygonOffsetFactor).toBe(1);
    expect(toon.polygonOffsetUnits).toBe(1);
    expect(toon.userData.inkShading).toBeUndefined();
    expect(s.plaster.children[0]).toBeInstanceOf(LineSegments2);
    expect((s.lawn.material as THREE.MeshToonMaterial).map).not.toBeNull();

    const glass = s.glass.material;
    expect(glass.transparent).toBe(true);
    expect(glass.depthWrite).toBe(false);
    expect(glass.opacity).toBeCloseTo(PALETTE.glass.opacity!, 6);
    expect(s.glass.renderOrder).toBe(10);
    expect(s.glass.children).toHaveLength(0);
    expect(s.lawn.children).toHaveLength(0);
    expect(s.collider.material).toBe(s.colliderMat);

    expect(s.hemi.intensity).toBe(SKETCHUP.light.hemiIntensity);
    expect(s.sun.shadow.intensity).toBeLessThan(1);
    expect(s.sun.shadow.mapSize.x).toBe(SKETCHUP.shadowMapSize);
    disposeStyles(s.scene);
  });

  it('Borderlands: two line weights, thin glass outline, chimney hull, ink fills', () => {
    const s = syntheticScene();
    setStyle(s.scene, 'borderlands', { lighting: s.lighting });
    expect(getStyle(s.scene)).toBe('borderlands');
    const first = count(s.scene);
    // plaster ×2 + oak: boxes → thick only; glass: thin outline; chimney: thick rims + hull.
    expect(first).toMatchObject({ lines: 5, hulls: 1 });
    setStyle(s.scene, 'borderlands', { lighting: s.lighting });
    expect(count(s.scene)).toEqual(first);
    const names = s.chimney.children.map((c) => c.name).sort();
    expect(names).toEqual(['metalBlack-edges-sharp', 'metalBlack-hull']);
    const sharp = s.plaster.children[0] as LineSegments2;
    expect(sharp.material.linewidth).toBe(BORDERLANDS.sharpLines!.width);
    const glassLine = s.glass.children[0] as LineSegments2;
    expect(glassLine.material.linewidth).toBe(BORDERLANDS.lineWidth);
    expect(s.lawn.children).toHaveLength(0);

    const toon = s.plaster.material as THREE.MeshToonMaterial;
    expect(toon.userData.inkShading).toBe(true);
    expect(toon.map?.name).toBe('borderlands-paint');
    expect((s.lawn.material as THREE.MeshToonMaterial).map?.name).toBe('borderlands-grass');
    expect((s.glass.material as THREE.MeshToonMaterial).userData.inkShading).toBeUndefined();
    expect(s.glass.material.transparent).toBe(true);
    expect(s.sun.shadow.mapSize.x).toBe(1024);
    expect(s.hemi.intensity).toBe(BORDERLANDS.light.hemiIntensity);
    disposeStyles(s.scene);
  });

  it('all 6 transitions between the 3 looks are leak-free with stable counts', () => {
    const s = syntheticScene();
    const baseline = count(s.scene);
    const fog = s.scene.fog;
    const seen = new Map<StyleName, { counts: ReturnType<typeof count>; mats: THREE.Material[] }>();
    let disposed = 0;
    const track = () => {
      for (const m of materialsOf(s.scene)) {
        if (!m.userData.tracked) {
          m.userData.tracked = true;
          m.addEventListener('dispose', () => disposed++);
        }
      }
    };
    // Every ordered pair (a → b, a ≠ b) at least once, twice round.
    const order: StyleName[] = ['real', 'sketchup', 'borderlands', 'real', 'borderlands'];
    order.push('sketchup', 'real', 'sketchup', 'borderlands', 'real', 'borderlands', 'sketchup');
    const pairs = new Set<string>();
    for (let i = 0; i < order.length; i++) {
      const name = order[i]!;
      if (i > 0) pairs.add(`${order[i - 1]}>${name}`);
      setStyle(s.scene, name, { lighting: s.lighting });
      expect(getStyle(s.scene)).toBe(name);
      track();
      const now = { counts: count(s.scene), mats: materialsOf(s.scene) };
      const prev = seen.get(name);
      if (prev) {
        expect(now.counts, name).toEqual(prev.counts);
        expect(now.mats, name).toEqual(prev.mats); // same cached objects, nothing rebuilt
      } else {
        seen.set(name, now);
      }
      if (name === 'real') {
        expect(now.counts).toEqual(baseline);
        for (const [mesh, mat] of s.originals) expect(mesh.material).toBe(mat);
        expect(s.hemi.intensity).toBe(2.7);
        expect(s.sun.intensity).toBe(3.4);
        expect(s.sun.shadow.intensity).toBe(1);
        expect(s.sun.shadow.mapSize.x).toBe(2048);
        expect(s.scene.fog).toBe(fog);
      }
    }
    expect(pairs.size).toBe(6);
    expect(disposed).toBe(0); // switching never frees (or rebuilds) cached resources
    expect(isStyleBuilt(s.scene, 'borderlands')).toBe(true);
    removeStyle(s.scene);
    removeStyle(s.scene); // no-op when already real
    expect(count(s.scene)).toEqual(baseline);
    // disposeStyles frees each cached material once.
    const owned = new Set(
      [...seen.values()]
        .flatMap((v) => v.mats)
        .filter((m) => ![...s.originals.values()].includes(m)),
    );
    owned.delete(s.colliderMat as THREE.Material);
    disposeStyles(s.scene);
    expect(disposed).toBe(owned.size);
    expect(isStyleBuilt(s.scene, 'sketchup')).toBe(false);
    expect(isStyleBuilt(s.scene, 'real')).toBe(true);
    // Usable again after a full dispose.
    setStyle(s.scene, 'borderlands', { lighting: s.lighting });
    expect(count(s.scene)).toEqual(seen.get('borderlands')!.counts);
    disposeStyles(s.scene);
    expect(count(s.scene)).toEqual(baseline);
  });

  it('unknown names fall back to the default look', () => {
    const s = syntheticScene();
    setStyle(s.scene, 'cartoon', { lighting: s.lighting });
    expect(getStyle(s.scene)).toBe('sketchup');
    disposeStyles(s.scene);
    expect(getStyle(s.scene)).toBe('real');
  });

  it('styles the real world: lines on every merged mesh except glass/ground, hull on the chimney', () => {
    const world = buildWorld(house);
    const scene = new THREE.Scene();
    scene.add(world.group, world.collider);
    setStyle(scene, 'sketchup', { fatLines: false });
    const lined = world.group.children.filter((m) => m.children.length > 0).map((m) => m.name);
    expect(lined).not.toContain('glass');
    expect(lined).not.toContain('lawn');
    expect(lined).toContain('plaster');
    expect(lined.length).toBeGreaterThan(8);
    expect(world.collider.children).toHaveLength(0);
    setStyle(scene, 'borderlands');
    const hulls: string[] = [];
    scene.traverse((o) => {
      if (o.name.endsWith('-hull')) hulls.push(o.name);
    });
    // Curved meshes only: chimney (metalBlack), vegetation, pots, fire pit / edging.
    expect(hulls.sort()).toEqual(
      ['bark', 'barkBirch', 'clay', 'corten', 'foliage', 'foliageLight', 'metalBlack'].map(
        (id) => `${id}-hull`,
      ),
    );
    const glass = world.group.getObjectByName('glass')!;
    expect(glass.children.map((c) => c.name)).toEqual(['glass-edges']);
    removeStyle(scene);
    expect(world.group.children.every((m) => m.children.length === 0)).toBe(true);
    disposeStyles(scene);
  }, 30_000);
});
