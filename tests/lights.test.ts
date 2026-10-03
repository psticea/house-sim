import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { bakeEmitters, litLights, markDiffusers } from '../src/bake/emitters';
import { roofSegment, roofUndersideY } from '../src/data/geometry2d';
import { house } from '../src/data/house';
import { CEILING_LIGHTS, EMITTERS, FLUSH, LAMP_COLOR, diffuserY } from '../src/data/lights';
import { floorOf } from '../src/data/furniture';
import { levelById, roomAt } from '../src/data/topology';
import { buildFurniture } from '../src/world/furniture';
import { DIFFUSER_MATERIAL } from '../src/world/furniture/lights';
import { PALETTE } from '../src/world/materials';

const roomOf = (level: string, id: string) =>
  levelById(house, level as never).rooms.find((r) => r.id === id)!;

describe('ceiling lights (I6 redo)', () => {
  it('ids are unique; every fitting hangs in its room, fixed to that room’s ceiling', () => {
    expect(new Set(CEILING_LIGHTS.map((l) => l.id)).size).toBe(CEILING_LIGHTS.length);
    for (const l of CEILING_LIGHTS) {
      expect(roomAt(levelById(house, l.level), l.at[0], l.at[1]), l.id).toBe(l.room);
      const r = roomOf(l.level, l.room);
      const floor = floorOf(l.level);
      if (r.ceiling.type === 'flat') {
        expect(l.ceilingY, l.id).toBeCloseTo(floor + r.ceiling.height, 6);
      } else if (r.ceiling.type === 'roof') {
        const seg = roofSegment(house.roof, r.ceiling.segment);
        expect(l.ceilingY, l.id).toBeCloseTo(roofUndersideY(house.roof, seg, l.at[1]), 6);
      } else {
        throw new Error(`${l.id}: no ceiling in ${l.room}`);
      }
      // Head room under the fitting (≥ 2.0 m).
      const bottom = l.kind === 'flush' ? diffuserY(l) : (l.centerY ?? 0) - l.radius;
      expect(bottom - floor, l.id).toBeGreaterThanOrEqual(2.0);
      // The whole drum / globe stays inside the room outline.
      for (const [dx, dz] of [
        [l.radius, 0],
        [-l.radius, 0],
        [0, l.radius],
        [0, -l.radius],
      ] as const) {
        expect(roomAt(levelById(house, l.level), l.at[0] + dx, l.at[1] + dz), l.id).toBe(l.room);
      }
    }
  });

  it('is on where daylight is not enough (basement, stair foot, hall, utility, bathroom)', () => {
    const on = new Set(CEILING_LIGHTS.filter((l) => l.on).map((l) => l.room));
    for (const r of ['storage', 'entrance-hall', 'boiler-laundry', 'bathroom', 'upper-hall']) {
      expect(on.has(r), r).toBe(true);
    }
    // The basement stair (open to the ground-floor stair above) gets the storage light on
    // the edge of its opening, over the winders at its foot.
    const foot = CEILING_LIGHTS.find((l) => l.id === 'storage-light-2')!;
    expect(foot.on).toBe(true);
    expect(foot.at[0] - foot.radius).toBeLessThan(9.375 + 0.1);
    expect(Math.hypot(foot.at[0] - 8.7, foot.at[1] - 6.65)).toBeLessThan(1.2);
    // Bedrooms and the study keep their fitting off in the daytime scene.
    for (const id of ['bed-1-light', 'bed-2-light', 'study-light']) {
      expect(CEILING_LIGHTS.find((l) => l.id === id)?.on, id).toBe(false);
    }
  });

  it('emitters: one per light that is on, warm white, drum = opal band + bottom', () => {
    expect(EMITTERS.length).toBe(CEILING_LIGHTS.filter((l) => l.on).length);
    const lum = 0.2126 * LAMP_COLOR[0] + 0.7152 * LAMP_COLOR[1] + 0.0722 * LAMP_COLOR[2];
    expect(lum).toBeCloseTo(1, 1);
    expect(LAMP_COLOR[0]).toBeGreaterThan(LAMP_COLOR[2]);
    for (const [i, e] of EMITTERS.entries()) {
      const l = litLights()[i]!;
      expect(e.id).toBe(l.id);
      expect(e.radiance.every((c) => c > 0)).toBe(true);
      if (l.kind === 'flush') {
        expect(e.shape).toBe('drum');
        expect(e.center[1]).toBeCloseTo(diffuserY(l), 6);
        expect(e.height).toBeCloseTo(FLUSH.height - FLUSH.band, 6);
        expect(e.normal).toEqual([0, -1, 0]);
      } else {
        expect(e.shape).toBe('sphere');
        expect(e.center[1]).toBe(l.centerY);
      }
    }
  });

  it('fittings merge into existing furniture materials (no new draw calls)', () => {
    const built = buildFurniture([], CEILING_LIGHTS);
    const ids = [...built.mesh.toGeometries().keys()].sort();
    expect(ids).toEqual(['brass', 'ceramic', 'linen', 'metalBlack']);
    for (const id of ids) expect(PALETTE[id]).toBeDefined();
  });

  it('marks exactly the diffusers of the lights that are on', () => {
    const geos = buildFurniture([], CEILING_LIGHTS).mesh.toGeometries();
    const lit = litLights();
    for (const [id, g] of geos) {
      const mark = markDiffusers(id, g);
      if (id !== DIFFUSER_MATERIAL.flush && id !== DIFFUSER_MATERIAL.pendant) {
        expect(mark, id).toBeNull();
        continue;
      }
      expect(mark, id).not.toBeNull();
      const pos = g.getAttribute('position');
      const perLight = new Map<number, number>();
      for (let t = 0; t < pos.count; t += 3) {
        const k = mark![t]!;
        expect(mark![t + 1]).toBe(k);
        expect(mark![t + 2]).toBe(k);
        if (!k) continue;
        perLight.set(k, (perLight.get(k) ?? 0) + 1);
        const l = lit[k - 1]!;
        expect(DIFFUSER_MATERIAL[l.kind]).toBe(id);
        const c = new THREE.Vector3()
          .fromBufferAttribute(pos, t)
          .add(new THREE.Vector3().fromBufferAttribute(pos, t + 1))
          .add(new THREE.Vector3().fromBufferAttribute(pos, t + 2))
          .divideScalar(3);
        expect(Math.hypot(c.x - l.at[0], c.z - l.at[1])).toBeLessThanOrEqual(l.radius + 0.01);
      }
      // Every lit fitting of this material: its whole drum (bottom fan + side) / globe.
      for (const [k, n] of perLight) {
        const l = lit[k - 1]!;
        expect(n, l.id).toBe(l.kind === 'flush' ? 24 * 3 : 16 * 2 + 16 * 2 * 7);
      }
      expect(perLight.size).toBe(lit.filter((l) => DIFFUSER_MATERIAL[l.kind] === id).length);
    }
  });

  it('glow on the diffuser texels shows the lamp radiance (π · L / albedo)', () => {
    const ids = ['ceramic', 'linen'];
    const materials = ids.map(() => ({
      albedo: new THREE.Color(0.8, 0.8, 0.8),
      baked: true,
      glass: false,
      thin: false,
    }));
    const em = bakeEmitters(materials, ids);
    expect(em.length).toBe(litLights().length);
    for (const [i, e] of em.entries()) {
      expect(e.glow.r).toBeCloseTo((Math.PI * EMITTERS[i]!.radiance[0]) / 0.8, 5);
      expect(e.shape).toBe(EMITTERS[i]!.shape === 'sphere' ? 1 : 2);
    }
  });
});
