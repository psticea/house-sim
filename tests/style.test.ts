import * as THREE from 'three';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { describe, expect, it } from 'vitest';
import type { MaterialId } from '../src/data/schema';
import { DEFAULT_STYLE, readParams } from '../src/core/params';
import { house } from '../src/data/house';
import { buildWorld } from '../src/world/build';
import { createMaterials, PALETTE } from '../src/world/materials';
import { MeshBuilder, trianglesToGeometry } from '../src/world/meshBuilder';
import { applyStyle, getStyle, removeStyle, setStyle, STYLE } from '../src/world/style';
import { extractFeatureEdges, jitterSegments } from '../src/world/style/edges';
import {
  bandValues,
  createGradientMap,
  createGroundPattern,
  pastelColor,
} from '../src/world/style/textures';

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

describe('sketch style: textures and colours', () => {
  it('gradient map has one nearest-filtered texel per band, no mipmaps', () => {
    const g = createGradientMap(3, [0.75, 0.9, 1.0]);
    expect(g.image.width).toBe(3);
    expect(Array.from(g.image.data as Uint8Array)).toEqual([191, 230, 255]);
    expect(g.minFilter).toBe(THREE.NearestFilter);
    expect(g.magFilter).toBe(THREE.NearestFilter);
    expect(g.generateMipmaps).toBe(false);
    expect(g.format).toBe(THREE.RedFormat);
  });

  it('band values resample the brightness list when the band count differs', () => {
    expect(bandValues(2, [0.6, 0.8, 1.0])).toEqual([0.6, 1.0]);
    expect(bandValues(5, [0.6, 1.0])).toEqual([0.6, 0.7, 0.8, 0.9, 1.0]);
  });

  it('pastel colours keep the hue, lower saturation and raise lightness', () => {
    for (const id of ['cladWood', 'oak', 'lawn', 'field', 'frame', 'deck'] as MaterialId[]) {
      const src = hsl(new THREE.Color(PALETTE[id].color));
      const out = hsl(pastelColor(PALETTE[id].color, STYLE.pastel));
      expect(Math.abs(out.h - src.h), id).toBeLessThan(0.01);
      expect(out.s, id).toBeLessThan(src.s);
      expect(out.l, id).toBeGreaterThan(src.l);
      expect(out.l, id).toBeLessThanOrEqual(STYLE.pastel.maxLightness + 1e-6);
    }
    // Very light colours are never darkened (warm off-white walls stay off-white).
    const wall = hsl(pastelColor(PALETTE.plaster.color, STYLE.pastel));
    expect(wall.l).toBeGreaterThanOrEqual(hsl(new THREE.Color(PALETTE.plaster.color)).l - 1e-6);
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
});

describe('sketch style: feature edges', () => {
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
    const fold = (deg: number) => {
      const r = THREE.MathUtils.degToRad(deg);
      const p = [Math.cos(r), Math.sin(r)];
      const g = trianglesToGeometry([
        ...[0, 0, 0, 1, 0, 0, 0, 0, -1],
        ...[0, 0, -1, 1, 0, 0, 1, 0, -1],
        ...[0, 0, 0, 0, 0, -1, -p[0]!, p[1]!, -1],
        ...[0, 0, 0, -p[0]!, p[1]!, -1, -p[0]!, p[1]!, 0],
      ]);
      const hinge = segmentsOf(extractFeatureEdges(g, 30)).filter(
        (s) => Math.abs(s.mid.x) < 1e-6 && Math.abs(s.mid.y) < 1e-6,
      );
      return hinge.reduce((s, x) => s + x.len, 0);
    };
    expect(fold(10)).toBeCloseTo(0, 5);
    expect(fold(60)).toBeCloseTo(1, 5);
  });

  it('jitter is deterministic, tiny, capped and only extends lines along themselves', () => {
    const segs = new Float32Array([0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 0.5, 0]);
    const a = jitterSegments(segs, 0.003, 0.012);
    expect(Array.from(jitterSegments(segs, 0.003, 0.012))).toEqual(Array.from(a));
    // Long segment: capped at 1.2 cm per end, stays on the x axis, only grows.
    expect(a[0]).toBeLessThanOrEqual(0);
    expect(a[0]).toBeGreaterThanOrEqual(-0.012);
    expect(a[3]).toBeGreaterThanOrEqual(10);
    expect(a[3]).toBeLessThanOrEqual(10.012 + 1e-6);
    expect([a[1], a[2], a[4], a[5]]).toEqual([0, 0, 0, 0]);
    // Short segment: ≤ 0.3 % of its length.
    expect(a[10]!).toBeLessThanOrEqual(0.5 + 0.0015 + 1e-6);
    expect(Array.from(jitterSegments(segs, 0, 0.012))).toEqual(Array.from(segs));
  });

  it('the generated house produces no degenerate line segments', () => {
    const world = buildWorld(house);
    let total = 0;
    for (const m of world.group.children as THREE.Mesh[]) {
      const segs = extractFeatureEdges(m.geometry, STYLE.edgeThresholdDeg);
      for (const s of segmentsOf(segs)) expect(s.len).toBeGreaterThan(1e-4);
      total += segs.length / 6;
    }
    expect(total).toBeGreaterThan(100);
  });
});

function syntheticScene() {
  const mats = createMaterials();
  const scene = new THREE.Scene();
  const group = new THREE.Group();
  group.name = 'house';
  scene.add(group);
  const add = (id: MaterialId, min: [number, number, number], max: [number, number, number]) => {
    const b = new MeshBuilder();
    b.box(id, min, max);
    const m = new THREE.Mesh(b.toGeometries().get(id), mats[id]);
    m.name = id;
    group.add(m);
    return m;
  };
  const plaster = add('plaster', [0, 0, 0], [4, 2.7, 0.2]);
  const plaster2 = add('plaster', [0, 0, 1], [0.2, 2.7, 4]);
  const oak = add('oak', [0, -0.05, 0], [4, 0, 4]);
  const glass = add('glass', [1, 1, 0.09], [2, 2, 0.11]);
  glass.renderOrder = 10;
  const lawn = add('lawn', [-10, -0.1, -10], [10, -0.05, 10]);
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
  const originals = new Map(
    [plaster, plaster2, oak, glass, lawn].map((m) => [m, m.material] as const),
  );
  return {
    scene,
    plaster,
    plaster2,
    oak,
    glass,
    lawn,
    collider,
    colliderMat,
    hemi,
    sun,
    originals,
  };
}

const count = (scene: THREE.Scene) => {
  let objects = 0;
  let lines = 0;
  scene.traverse((o) => {
    objects++;
    if (o.userData.styleOwned) lines++;
  });
  return { objects, lines };
};

describe('sketch style: applyStyle / removeStyle', () => {
  it('sketch is the default look; ?style=real opts out', () => {
    expect(DEFAULT_STYLE).toBe('sketch');
    expect(readParams('').style).toBe('sketch');
    expect(readParams('?style=sketch').style).toBe('sketch');
    expect(readParams('?style=real').style).toBe('real');
    expect(readParams('?style=cartoon&debug').style).toBe('sketch');
  });

  it('restyles meshes with shared toon materials and lines, idempotently', () => {
    const s = syntheticScene();
    const lighting = { hemi: s.hemi, sun: s.sun };
    expect(getStyle(s.scene)).toBe('real');
    applyStyle(s.scene, { lighting });
    expect(getStyle(s.scene)).toBe('sketch');
    const first = count(s.scene);
    expect(first.lines).toBe(3); // plaster ×2, oak — not glass, lawn or the collider
    applyStyle(s.scene, { lighting });
    expect(count(s.scene)).toEqual(first);

    const toon = s.plaster.material as THREE.MeshToonMaterial;
    expect(toon.isMeshToonMaterial).toBe(true);
    expect(toon.name).toBe('plaster');
    expect(s.plaster2.material).toBe(toon); // shared per material id
    expect(toon.gradientMap?.minFilter).toBe(THREE.NearestFilter);
    expect(toon.polygonOffset).toBe(true);
    expect(toon.polygonOffsetFactor).toBe(1);
    expect(toon.polygonOffsetUnits).toBe(1);
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

    expect(s.hemi.intensity).toBe(STYLE.light.hemiIntensity);
    expect(s.sun.shadow.intensity).toBeLessThan(1);
    expect(s.sun.shadow.mapSize.x).toBe(STYLE.shadowMapSize);
    removeStyle(s.scene);
  });

  it('removeStyle restores everything; repeated cycles do not grow or leak', () => {
    const s = syntheticScene();
    const lighting = { hemi: s.hemi, sun: s.sun };
    const fog = s.scene.fog;
    const before = count(s.scene);
    let disposed = 0;
    for (let k = 0; k < 4; k++) {
      setStyle(s.scene, 'sketch', { lighting, fatLines: k % 2 === 0 });
      const styled = count(s.scene);
      expect(styled.lines).toBe(3);
      expect(styled.objects).toBe(before.objects + 3);
      const owned: THREE.Material[] = [];
      s.scene.traverse((o) => {
        const m = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (m && ![...s.originals.values()].includes(m) && m !== s.colliderMat) owned.push(m);
      });
      for (const m of new Set(owned)) m.addEventListener('dispose', () => disposed++);
      setStyle(s.scene, 'real');
      expect(getStyle(s.scene)).toBe('real');
      expect(count(s.scene)).toEqual(before);
      for (const [mesh, mat] of s.originals) expect(mesh.material).toBe(mat);
      expect(s.hemi.intensity).toBe(2.7);
      expect(s.sun.intensity).toBe(3.4);
      expect(s.sun.shadow.intensity).toBe(1);
      expect(s.sun.shadow.mapSize.x).toBe(2048);
      expect(s.scene.fog).toBe(fog);
    }
    // 4 toon materials (plaster, oak, glass, lawn) + 1 line material per cycle.
    expect(disposed).toBe(4 * 5);
    removeStyle(s.scene); // no-op when already real
    expect(count(s.scene)).toEqual(before);
  });

  it('styles the real world: every merged mesh except glass/ground gets lines', () => {
    const world = buildWorld(house);
    const scene = new THREE.Scene();
    scene.add(world.group, world.collider);
    applyStyle(scene, { fatLines: false });
    const lined = world.group.children.filter((m) => m.children.length > 0).map((m) => m.name);
    expect(lined).not.toContain('glass');
    expect(lined).not.toContain('lawn');
    expect(lined).toContain('plaster');
    expect(lined.length).toBeGreaterThan(8);
    expect(world.collider.children).toHaveLength(0);
    removeStyle(scene);
    expect(world.group.children.every((m) => m.children.length === 0)).toBe(true);
  });
});
