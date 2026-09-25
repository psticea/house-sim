import { describe, expect, it } from 'vitest';
import {
  polygonArea,
  roofSegment,
  roofUndersideY,
  wallTopAt,
  wallTopProfile,
} from '../src/data/geometry2d';
import { LEVELS } from '../src/data/grid';
import { basementStairs } from '../src/data/basement';
import { mainStairs } from '../src/data/ground';
import { house } from '../src/data/house';
import {
  flightLength,
  flightPoint,
  flightRampY,
  rampYAt,
  stairRampTriangles,
  stairRise,
  stairSurfaceY,
} from '../src/data/stairs';
import { OUTSIDE, levelById, locate, nodeId, reachableAll, roomAt } from '../src/data/topology';
import type { Stairs } from '../src/data/schema';

const upper = levelById(house, 'upper');
const basement = levelById(house, 'basement');
const ground = levelById(house, 'ground');

describe('upper floor (sheet 06)', () => {
  const expected: Record<string, number> = {
    'upper-bathroom': 7.48,
    'bedroom-3': 31.36,
    'upper-hall': 5.71,
    study: 10.33,
  };
  it('has exactly the rooms of sheet 06', () => {
    expect(upper.rooms.map((r) => r.id).sort()).toEqual(Object.keys(expected).sort());
  });
  for (const [id, area] of Object.entries(expected)) {
    it(`${id} ≈ ${area} m² (±3 %)`, () => {
      const room = upper.rooms.find((r) => r.id === id)!;
      expect(room.expectedArea).toBe(area);
      expect(Math.abs(polygonArea(room.polygon) - area) / area).toBeLessThan(0.03);
    });
  }
  it('finished floor +2.95, knee wall 1.00 m, ceilings follow the 40° roof', () => {
    expect(upper.floorY).toBe(2.95);
    const seg = roofSegment(house.roof, 'upper');
    // Roof underside at the exterior walls' inner face = knee wall top.
    expect(roofUndersideY(house.roof, seg, 0.125) - upper.floorY).toBeCloseTo(1.0, 6);
    // Peak under the ridge: bedroom 3 "1.00–3.94".
    expect(roofUndersideY(house.roof, seg, house.roof.ridgeZ) - upper.floorY).toBeCloseTo(3.94, 1);
    // Bathroom "1.00–3.84": highest point at its north wall (z 3.74).
    expect(roofUndersideY(house.roof, seg, 3.74) - upper.floorY).toBeCloseTo(3.84, 1);
    // Study "1.00–2.87" / hall "2.98–3.94": within 5 cm at the study/hall wall.
    expect(Math.abs(roofUndersideY(house.roof, seg, 2.3675) - upper.floorY - 2.87)).toBeLessThan(
      0.05,
    );
    for (const r of upper.rooms) expect(r.ceiling).toEqual({ type: 'roof', segment: 'upper' });
  });
  it('interior walls reach the roof underside (no gap at the slope)', () => {
    for (const w of upper.walls) {
      expect(w.top).toEqual({ roof: 'upper' });
      const prof = wallTopProfile(w, house.roof, upper.floorY);
      const seg = roofSegment(house.roof, 'upper');
      // At the centre line the wall top is at or above the underside.
      for (const [u, v] of prof) {
        const t = u / Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
        const z = w.from[1] + (w.to[1] - w.from[1]) * t;
        expect(v + upper.floorY, w.id).toBeGreaterThanOrEqual(
          roofUndersideY(house.roof, seg, z) - 1e-9,
        );
      }
      expect(wallTopAt(prof, 0), w.id).toBeGreaterThanOrEqual(1.0 - 1e-9);
    }
  });
  it('upper doors Ui-02/03/04 are open and lead from the hall', () => {
    const codes = upper.openings.filter((o) => o.kind === 'door').map((o) => o.code);
    expect(codes.sort()).toEqual(['Ui-02', 'Ui-03', 'Ui-04']);
    for (const o of upper.openings) if (o.kind === 'door') expect(o.state).toBe('open');
  });
  it('the void over the living room is closed off by walls; F-02 looks into it', () => {
    const f02 = upper.openings.find((o) => o.code === 'F-02u')!;
    expect(f02.kind).toBe('window');
    expect(f02.state).toBe('closed');
    expect(upper.voids).toHaveLength(1);
  });
});

describe('basement (sheet 04)', () => {
  it('stairs 3.93 m² and storage 11.57 m² (±3 %)', () => {
    for (const [id, area] of [
      ['basement-stairs', 3.93],
      ['storage', 11.57],
    ] as const) {
      const room = basement.rooms.find((r) => r.id === id)!;
      expect(room.expectedArea).toBe(area);
      expect(Math.abs(polygonArea(room.polygon) - area) / area).toBeLessThan(0.03);
    }
  });
  it('floor −2.53, storage H 2.24', () => {
    expect(basement.floorY).toBe(-2.53);
    expect(LEVELS.basementFloor).toBe(-2.53);
    const storage = basement.rooms.find((r) => r.id === 'storage')!;
    expect(storage.ceiling).toEqual({ type: 'flat', height: 2.24 });
    const ceiling = basement.slabs.find((s) => s.id === 'basement-ceiling')!;
    expect(ceiling.bottom).toBeCloseTo(-2.53 + 2.24, 6);
  });
});

function checkStair(
  st: Stairs,
  floorY: number,
  plan: { risers: number; rise: number; treads: number; going: number },
) {
  expect(st.risers).toBe(plan.risers);
  expect(st.riserHeight).toBe(plan.rise);
  expect(st.treads).toBe(plan.treads);
  expect(st.going).toBe(plan.going);
  // Printed riser × count = level difference within 1 cm.
  expect(Math.abs(st.risers * st.riserHeight - (st.topY - floorY))).toBeLessThan(0.01);
  // Tread count: flights + winders + landings = 16 / 13 goings.
  const goings =
    st.flights.reduce((n, f) => n + f.treads, 0) +
    (st.winders?.treads.length ?? 0) +
    st.landings.length;
  expect(goings).toBe(st.treads);
  for (const f of st.flights) {
    expect(f.going).toBe(st.going);
    const span = f.direction === '+z' || f.direction === '-z' ? f.z : f.x;
    expect(span[1] - span[0]).toBeCloseTo(flightLength(f), 6);
  }
  // Risers numbered consecutively 1 … risers − 1 over flights, winders and landings.
  const numbered: number[] = [];
  for (const f of st.flights) for (let k = 0; k < f.treads; k++) numbered.push(f.firstRiser + k);
  for (const w of st.winders?.treads ?? []) numbered.push(w.riser);
  for (const l of st.landings) numbered.push(l.riser);
  expect(numbered.sort((a, b) => a - b)).toEqual(
    Array.from({ length: st.risers - 1 }, (_, i) => i + 1),
  );
}

describe('stairs', () => {
  it('main stair: 17 × 17.4 cm, 16 × 29 cm, ground → upper floor', () => {
    checkStair(mainStairs, 0, { risers: 17, rise: 0.174, treads: 16, going: 0.29 });
    expect(mainStairs.topY).toBe(LEVELS.upperFloor);
    expect(stairRise(mainStairs, 0)).toBeCloseTo(2.95 / 17, 9);
  });
  it('basement stair: 14 × 18 cm, 13 × 28 cm, basement → ground floor', () => {
    checkStair(basementStairs, -2.53, { risers: 14, rise: 0.18, treads: 13, going: 0.28 });
    expect(basementStairs.topY).toBe(0);
  });
  for (const [st, floorY] of [
    [mainStairs, 0],
    [basementStairs, -2.53],
  ] as const) {
    it(`${st.id}: walking ramp touches every nosing, joins floors and landings without steps`, () => {
      const tris = stairRampTriangles(st, floorY);
      const rise = stairRise(st, floorY);
      for (const f of st.flights) {
        for (let k = 0; k <= f.treads; k++) {
          const [x, z] = flightPoint(f, k * f.going, 0.5);
          const y = rampYAt(tris, x, z);
          expect(y, `${st.id} nosing ${f.firstRiser + k}`).not.toBeNull();
          expect(y!).toBeCloseTo(floorY + (f.firstRiser + k) * rise, 6);
          expect(flightRampY(f, rise, floorY, x, z)).toBeCloseTo(y!, 6);
          // The ramp never dips below the visible treads.
          if (k < f.treads) {
            const [mx, mz] = flightPoint(f, (k + 0.5) * f.going, 0.5);
            expect(rampYAt(tris, mx, mz)!).toBeGreaterThanOrEqual(
              stairSurfaceY(st, floorY, mx, mz)! - 1e-9,
            );
          }
        }
        if (f.rampFoot) {
          const [x, z] = flightPoint(f, -f.going, 0.5);
          expect(rampYAt(tris, x, z)).toBeCloseTo(floorY + (f.firstRiser - 1) * rise, 6);
        }
      }
      // Top edge arrives exactly at the upper level.
      const top = st.flights.reduce((a, f) => (f.firstRiser > a.firstRiser ? f : a));
      const [tx, tz] = flightPoint(top, flightLength(top), 0.5);
      expect(rampYAt(tris, tx, tz)).toBeCloseTo(st.topY, 6);
    });
  }
  it('winder helicoid joins the basement flights edge to edge', () => {
    const w = basementStairs.winders!;
    const tris = stairRampTriangles(basementStairs, -2.53);
    const rise = stairRise(basementStairs, -2.53);
    // Along the bottom flight's top edge (x 8.322) and the upper flight's foot (z 6.128).
    for (const z of [6.3, 6.6, 7.0]) {
      expect(rampYAt(tris, w.pivot[0] - 1e-4, z)!).toBeCloseTo(-2.53 + w.lowRiser * rise, 2);
    }
    for (const x of [7.4, 7.8, 8.2]) {
      expect(rampYAt(tris, x, w.pivot[1] + 1e-4)!).toBeCloseTo(-2.53 + w.highRiser * rise, 2);
    }
    // Walking line (0.5 m from the pivot): 3 risers per quarter turn ≈ 35°, never over 40°.
    let prev: number | null = null;
    for (let a = 0; a <= 90; a += 5) {
      const r = (a * Math.PI) / 180;
      const x = w.pivot[0] - 0.5 * Math.sin(r);
      const z = w.pivot[1] + 0.5 * Math.cos(r);
      const y = rampYAt(tris, x, z)!;
      if (prev !== null) {
        const slope = Math.abs(y - prev) / ((0.5 * 5 * Math.PI) / 180);
        expect(slope).toBeLessThan(Math.tan((40 * Math.PI) / 180));
      }
      prev = y;
    }
  });
});

describe('reachability over all three levels', () => {
  it('every room of every level is reachable from outside through doors and stairs', () => {
    const seen = reachableAll(house);
    for (const level of house.levels) {
      for (const r of level.rooms) expect(seen.has(nodeId(level.id, r.id)), r.id).toBe(true);
    }
  });
  it('stairs connect the rooms their ends lie in', () => {
    for (const level of house.levels) {
      for (const st of level.stairs) {
        const bottom = st.flights.reduce((a, f) => (f.firstRiser < a.firstRiser ? f : a));
        const top = st.flights.reduce((a, f) => (f.firstRiser > a.firstRiser ? f : a));
        const [bx, bz] = flightPoint(bottom, 0.01, 0.5);
        const [tx, tz] = flightPoint(top, flightLength(top) + 0.3, 0.5);
        const [lo, hi] = st.connects;
        expect(roomAt(levelById(house, lo.level), bx, bz), st.id).toBe(lo.room);
        const hiLevel = levelById(house, hi.level);
        const hiRoom = roomAt(hiLevel, tx, tz);
        // The main stair arrives on the strip in front of the upper hall.
        const near = roomAt(hiLevel, tx, tz - 0.3);
        expect([hiRoom, near], st.id).toContain(hi.room);
      }
    }
  });
  it('locate(): level from the feet height, stair wells fall back to the stair room', () => {
    expect(locate(house, 2.0, 2.95, 3.0)).toMatchObject({ level: 'upper', room: 'bedroom-3' });
    expect(locate(house, 7.8, 2.95, 3.75)).toMatchObject({ level: 'upper', room: 'stairs' });
    expect(locate(house, 7.8, 2.0, 5.0)).toMatchObject({ level: 'ground', room: 'stairs' });
    expect(locate(house, 7.8, -0.4, 4.4)).toMatchObject({ level: 'ground', room: 'stairs' });
    expect(locate(house, 7.8, -1.5, 5.5)).toMatchObject({
      level: 'basement',
      room: 'basement-stairs',
    });
    expect(locate(house, 11.0, -2.53, 5.0)).toMatchObject({ level: 'basement', room: 'storage' });
    expect(locate(house, 13.0, 0, 3.0)).toMatchObject({ level: 'ground', room: 'living-kitchen' });
    expect(locate(house, -6.2, -0.05, 6.8)).toMatchObject({ level: 'ground', room: OUTSIDE });
    expect(locate(house, -6.2, -0.05, 6.8).place.id).toBe('parking');
  });
  it('ground floor keeps its I1 rooms', () => {
    expect(ground.rooms).toHaveLength(8);
  });
});
