import { describe, expect, it } from 'vitest';
import {
  curtainLines,
  pointInPolygon,
  polygonArea,
  roofSegment,
  roofTopY,
  roofUndersideY,
  wallFrame,
  wallLength,
  wallThickness,
  wallTopAt,
  wallTopProfile,
} from '../src/data/geometry2d';
import { GRID_X, GRID_Z, LEVELS, OUTER_DIMENSIONS, SHELL } from '../src/data/grid';
import { house } from '../src/data/house';
import { mainStairs } from '../src/data/ground';
import { levelById } from '../src/data/topology';
import type { Opening } from '../src/data/schema';

const ground = levelById(house, 'ground');

describe('grid (sheet 05 axis lines)', () => {
  it('matches the dimension chains', () => {
    const xs = Object.values(GRID_X);
    const spacing = xs.slice(1).map((x, i) => +(x - xs[i]!).toFixed(3));
    expect(spacing).toEqual([4.75, 4.75, 2.45, 3.65, 2.5]);
    expect(GRID_Z.B - GRID_Z.A).toBeCloseTo(3.75, 3);
    expect(GRID_Z.C - GRID_Z.B).toBeCloseTo(3.5, 3);
  });
});

describe('room areas vs plan (±3 %)', () => {
  const expected: Record<string, number> = {
    'boiler-laundry': 5.1,
    bathroom: 6.5,
    'entrance-hall': 12.32,
    stairs: 7.05,
    'living-kitchen': 47.95,
    'bedroom-1': 13.76,
    'bedroom-2': 14.62,
    terrace: 37.58,
  };
  it('has exactly the ground-floor rooms of sheet 05', () => {
    expect(ground.rooms.map((r) => r.id).sort()).toEqual(Object.keys(expected).sort());
  });
  for (const [id, area] of Object.entries(expected)) {
    it(`${id} ≈ ${area} m²`, () => {
      const room = ground.rooms.find((r) => r.id === id)!;
      expect(room.expectedArea).toBe(area);
      const actual = polygonArea(room.polygon);
      expect(Math.abs(actual - area) / area).toBeLessThan(0.03);
    });
  }
});

describe('building shell', () => {
  const ext = ground.walls.filter((w) => w.kind === 'exterior');
  const bounds = () => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const w of ext) {
      const t = wallThickness(w) / 2;
      for (const [x, z] of [w.from, w.to]) {
        const horizontal = Math.abs(w.from[1] - w.to[1]) < 1e-9;
        minX = Math.min(minX, horizontal ? x : x - t);
        maxX = Math.max(maxX, horizontal ? x : x + t);
        minZ = Math.min(minZ, horizontal ? z - t : z);
        maxZ = Math.max(maxZ, horizontal ? z + t : z);
      }
    }
    return { minX, maxX, minZ, maxZ };
  };
  it('outer dimensions are 18.71 × 7.91 m (±2 cm)', () => {
    const b = bounds();
    expect(Math.abs(b.maxX - b.minX - OUTER_DIMENSIONS.length)).toBeLessThan(0.02);
    expect(Math.abs(b.maxZ - b.minZ - OUTER_DIMENSIONS.depth)).toBeLessThan(0.02);
  });
  it('the facade faces sit 0.33 m outside the outer axes', () => {
    expect(GRID_X['1'] - SHELL.west).toBeCloseTo(0.33, 3);
    expect(SHELL.east - GRID_X['6']).toBeCloseTo(0.28, 3); // "28" in the chain at axis 6
    expect(GRID_Z.A - SHELL.north).toBeCloseTo(0.33, 3);
    expect(SHELL.south - GRID_Z.C).toBeCloseTo(0.33, 3);
  });
  it('exterior walls are 25 brick + 20.5 insulation/cladding', () => {
    for (const w of ext.filter((x) => x.id === 'ext-n' || x.id === 'ext-s' || x.id === 'ext-w')) {
      expect(wallThickness(w)).toBeCloseTo(0.455, 6);
    }
  });
});

describe('levels & roof', () => {
  const roof = house.roof;
  it('level heights', () => {
    expect(LEVELS.groundFloor).toBe(0);
    expect(LEVELS.groundCeiling).toBe(2.68);
    expect(LEVELS.upperFloor).toBe(2.95);
    expect(levelById(house, 'upper').floorY).toBe(2.95);
    expect(LEVELS.absoluteZero).toBe(261.98);
    for (const r of ground.rooms) {
      if (r.ceiling.type === 'flat') expect(r.ceiling.height).toBe(2.68);
    }
  });
  it('40° gable, eaves +4.23, ridge +7.50…7.56 (elev. 08/09)', () => {
    expect(roof.pitchDeg).toBe(40);
    expect(roofTopY(roof, roof.eaveZ[0])).toBeCloseTo(4.23, 6);
    const ridge = roofTopY(roof, roof.ridgeZ);
    expect(ridge).toBeGreaterThanOrEqual(7.5);
    expect(ridge).toBeLessThanOrEqual(7.56);
    expect(roof.chimney.top).toBe(7.9);
  });
  it('living room open to the roof: 3.95 → 6.88 m (sheet 05 label)', () => {
    const seg = roofSegment(roof, 'living');
    expect(roofUndersideY(roof, seg, SHELL.innerNorth)).toBeCloseTo(3.95, 2);
    expect(Math.abs(roofUndersideY(roof, seg, roof.ridgeZ) - 6.88)).toBeLessThan(0.02);
  });
  it('loggia opening: +3.94⁵ at the sides, +6.74 at the top (elev. 08)', () => {
    const seg = roofSegment(roof, 'loggia');
    expect(roofUndersideY(roof, seg, 0.275)).toBeCloseTo(3.945, 3);
    expect(Math.abs(roofUndersideY(roof, seg, roof.ridgeZ) - 6.74)).toBeLessThan(0.03);
  });
  it('stair: 17 risers × 17.4 cm reach the upper floor, 16 treads × 29 cm', () => {
    expect(mainStairs.risers * mainStairs.riserHeight).toBeCloseTo(LEVELS.upperFloor, 1);
    expect(Math.abs(mainStairs.risers * mainStairs.riserHeight - LEVELS.upperFloor)).toBeLessThan(
      0.01,
    );
    expect(mainStairs.treads).toBe(16);
    expect(mainStairs.going).toBe(0.29);
  });
});

describe('openings', () => {
  const levels = house.levels;
  it('every opening fits inside its wall (5 cm margin to the top, inside every layer)', () => {
    for (const level of levels) {
      for (const o of level.openings) {
        const wall = level.walls.find((w) => w.id === o.wall);
        expect(wall, `${o.id} wall`).toBeDefined();
        if (!wall) continue;
        const L = wallLength(wall);
        const trimS = Math.max(0, ...wall.layers.map((l) => l.trimStart ?? 0));
        const trimE = Math.max(0, ...wall.layers.map((l) => l.trimEnd ?? 0));
        expect(o.offset, o.id).toBeGreaterThanOrEqual(trimS - 1e-9);
        expect(o.offset + o.width, o.id).toBeLessThanOrEqual(L - trimE + 1e-9);
        expect(o.sill, o.id).toBeGreaterThanOrEqual(wall.base ?? 0);
        const profile = wallTopProfile(wall, house.roof, level.floorY);
        for (const u of [o.offset, o.offset + o.width / 2, o.offset + o.width]) {
          expect(o.sill + o.height, `${o.id} top`).toBeLessThanOrEqual(
            wallTopAt(profile, u) - 0.05,
          );
        }
      }
    }
  });
  it('openings of the same wall do not overlap', () => {
    for (const level of levels) {
      const byWall = new Map<string, Opening[]>();
      for (const o of level.openings) byWall.set(o.wall, [...(byWall.get(o.wall) ?? []), o]);
      for (const ops of byWall.values()) {
        for (let i = 0; i < ops.length; i++) {
          for (let j = i + 1; j < ops.length; j++) {
            const a = ops[i]!;
            const b = ops[j]!;
            const uOverlap = a.offset < b.offset + b.width && b.offset < a.offset + a.width;
            const vOverlap = a.sill < b.sill + b.height && b.sill < a.sill + a.height;
            expect(uOverlap && vOverlap, `${a.id} vs ${b.id}`).toBe(false);
          }
        }
      }
    }
  });
  it('sizes match the tags on sheets 05 / 06 (W × H, hp)', () => {
    const tags: Record<string, { w: number; h: number; hp?: number }> = {
      'Ue-01': { w: 1.1, h: 2.1, hp: 0 },
      'Ui-01': { w: 0.8, h: 2.1, hp: 0 },
      'Ui-02': { w: 0.8, h: 2.1, hp: 0 },
      'Ui-03': { w: 0.9, h: 2.1, hp: 0 },
      'Ui-04': { w: 0.9, h: 2.1, hp: 0 },
      'F-02': { w: 0.6, h: 2.1, hp: 0 },
      'F-03': { w: 0.9, h: 1.3, hp: 0.8 },
      'F-04': { w: 1.8, h: 1.8, hp: 0.68 },
      'F-05': { w: 2.0, h: 2.48, hp: 0 },
      'F-06': { w: 2.0, h: 0.6, hp: 1.6 },
      'F-07': { w: 3.3, h: 2.5, hp: 0 },
      'F-08': { w: 1.2, h: 1.2, hp: 4.0 },
      'F-09': { w: 1.5, h: 1.5, hp: 3.25 },
      'F-02u': { w: 0.9, h: 0.9, hp: 0.8 },
      F01: { w: 1.15, h: 0.75, hp: 1.0 },
      'CW-door': { w: 1.05, h: 2.475, hp: 0 },
    };
    for (const level of levels) {
      for (const o of level.openings) {
        const t = tags[o.code];
        expect(t, `tag ${o.code}`).toBeDefined();
        if (!t) continue;
        expect(o.width, o.id).toBeCloseTo(t.w, 6);
        expect(o.height, o.id).toBeCloseTo(t.h, 6);
        if (t.hp !== undefined) expect(o.sill, o.id).toBeCloseTo(t.hp, 6);
      }
    }
    const count = (code: string) => ground.openings.filter((o) => o.code === code).length;
    // Tag counts on sheet 05: Ui-01 ×2, Ui-02 ×2, one each of the others — minus the
    // bedroom-2 → bathroom Ui-01 the owner removed (2026-10).
    expect(count('Ui-01')).toBe(1);
    expect(count('Ui-02')).toBe(2);
    expect(count('Ue-01')).toBe(1);
  });
  it('all doors are open', () => {
    for (const o of ground.openings) if (o.kind === 'door') expect(o.state).toBe('open');
  });
});

describe('site (sheet 03)', () => {
  const lot = house.site.lot;
  const edge = (i: number) => {
    const a = lot[i]!;
    const b = lot[(i + 1) % lot.length]!;
    return Math.hypot(b[0] - a[0], b[1] - a[1]);
  };
  it('lot edges 33.64⁵ / 17.09⁵ / 33.50 / 17.09 m and area 574 m²', () => {
    expect(Math.abs(edge(0) - 33.645)).toBeLessThan(0.05);
    expect(Math.abs(edge(1) - 17.095)).toBeLessThan(0.05);
    expect(Math.abs(edge(2) - 33.5)).toBeLessThan(0.05);
    expect(Math.abs(edge(3) - 17.09)).toBeLessThan(0.05);
    expect(Math.abs(polygonArea(lot) - 574) / 574).toBeLessThan(0.01);
  });
  it('setbacks from the insulation outline: 2.28 N, 7.00 S, 7.02 E, ≈8.00 W', () => {
    expect(Math.abs(-0.275 - lot[0]![1] - 2.28)).toBeLessThan(0.03);
    expect(Math.abs(lot[2]![1] - 7.525 - 7.0)).toBeLessThan(0.03);
    const xAt = (a: readonly [number, number], b: readonly [number, number], z: number) =>
      a[0] + ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]);
    // Dimension lines drawn at z ≈ 6.9 on the site plan.
    expect(Math.abs(xAt(lot[1]!, lot[2]!, 6.96) - 18.275 - 7.02)).toBeLessThan(0.05);
    expect(Math.abs(-0.275 - xAt(lot[3]!, lot[0]!, 6.9) - 8.0)).toBeLessThan(0.1);
  });
  it('parking pad ≈ 80 m² (2 spaces)', () => {
    const parking = house.site.patches.find((p) => p.id === 'parking')!;
    expect(Math.abs(polygonArea(parking.polygon) - 80) / 80).toBeLessThan(0.03);
  });
});

describe('owner updates (2026-10): east curtain wall, west facade, south slats', () => {
  const cw = ground.walls.find((w) => w.id === 'cw-e')!;
  const c = cw.curtain!;
  const lines = curtainLines(c);
  const zAt = (u: number): number => cw.from[1] + u;

  it('curtain wall: 6 columns 855 | 1100 | 1400 | 1350 | 1100 | 855 (north → south) = 6.66 m', () => {
    expect([...c.columns]).toEqual([0.855, 1.1, 1.4, 1.35, 1.1, 0.855]);
    expect(c.columns.reduce((s, w) => s + w, 0)).toBeCloseTo(6.66, 9);
    expect(c.profile).toBe(0.05);
    expect([...c.transoms]).toEqual([2.5]);
    // Exterior view (south on the left): 855 | 1100 | 1350 | 1400 | 1100 | 855, apex
    // after 3305 from the south edge = the mullion on the ridge line.
    expect(zAt(lines[0]!)).toBeCloseTo(0.27, 6);
    expect(zAt(lines[6]!)).toBeCloseTo(6.93, 6);
    expect(zAt(lines[3]!)).toBeCloseTo(house.roof.ridgeZ, 6);
    expect(zAt(lines[6]!) - zAt(lines[3]!)).toBeCloseTo(3.305, 6);
    // The glass field sits inside the loggia opening (side walls z 0.275 / 6.975).
    expect(zAt(lines[0]!)).toBeGreaterThan(0.275 - 0.01);
    expect(zAt(lines[6]!)).toBeLessThan(6.975);
  });

  it('curtain wall: glass up to the gable (sides ≈ +3.97, apex ≈ +6.805 within 5 cm)', () => {
    const profile = wallTopProfile(cw, house.roof, 0);
    const side = wallTopAt(profile, lines[0]!);
    const apex = wallTopAt(profile, lines[3]!);
    expect(Math.abs(side - (6.805 - 2.835))).toBeLessThan(0.05);
    expect(Math.abs(apex - 6.805)).toBeLessThan(0.05);
    expect(c.transoms[0]!).toBeLessThan(side);
  });

  it('curtain wall: the single door is the 2nd column from the north, hinged north, opening out', () => {
    const doors = ground.openings.filter((o) => o.wall === 'cw-e');
    expect(doors.map((o) => o.id)).toEqual(['cw-door']);
    const d = doors[0]!;
    // Between the mullion faces of the 1100 column, up to the transom.
    expect(d.offset).toBeCloseTo(lines[1]! + c.profile / 2, 9);
    expect(d.offset + d.width).toBeCloseTo(lines[2]! - c.profile / 2, 9);
    expect(lines[2]! - lines[1]!).toBeCloseTo(1.1, 9);
    expect(d.sill + d.height).toBeCloseTo(c.transoms[0]! - c.profile / 2, 9);
    expect(d.state).toBe('open');
    expect(d.leaf).toMatchObject({ hinge: 'start', openAngle: 90, glazed: true });
    // Left of the north → south wall = east = outside: the leaf opens out onto the deck.
    expect(wallFrame(cw).left[0]).toBeCloseTo(1, 9);
    expect(d.leaf!.swing).toBe('left');
    // Clear width between the 5 cm door-frame jambs ≥ 0.9 m.
    expect(d.width - 2 * 0.05).toBeGreaterThanOrEqual(0.9);
  });

  it('west gable: wood field in a 0.605 m metal border, board zones tile it, windows inside', () => {
    const w = ground.walls.find((x) => x.id === 'ext-w')!;
    const clad = w.cladding!;
    expect(clad).toBeDefined();
    expect(clad.material).toBe('cladWood');
    expect(w.layers[w.layers.length - 1]!.material).toBe('cladMetal');
    const zOf = (u: number): number => w.from[1] + u;
    const us = clad.region.map((p) => p[0]);
    expect(zOf(Math.min(...us)) - SHELL.north).toBeCloseTo(0.605, 6);
    expect(SHELL.south - zOf(Math.max(...us))).toBeCloseTo(0.605, 6);
    // Zones tile the field exactly (convex pieces, no overlaps → areas add up).
    const total = clad.zones.reduce((s, zn) => s + polygonArea(zn.polygon), 0);
    expect(total).toBeCloseTo(polygonArea(clad.region), 6);
    expect(clad.zones.filter((zn) => zn.direction === 'horizontal')).toHaveLength(2);
    // Every west window lies inside the wood field, ≥ 10 cm below its top.
    const profile = (u: number): number => {
      let best = -Infinity;
      for (let i = 0; i < clad.region.length; i++) {
        const a = clad.region[i]!;
        const b = clad.region[(i + 1) % clad.region.length]!;
        if (u < Math.min(a[0], b[0]) || u > Math.max(a[0], b[0]) || a[0] === b[0]) continue;
        best = Math.max(best, a[1] + ((b[1] - a[1]) * (u - a[0])) / (b[0] - a[0]));
      }
      return best;
    };
    for (const o of ground.openings.filter((x) => x.wall === 'ext-w')) {
      for (const u of [o.offset, o.offset + o.width]) {
        expect(pointInPolygon(u, o.sill, clad.region), o.id).toBe(true);
        expect(profile(u) - (o.sill + o.height), o.id).toBeGreaterThan(0.1);
      }
    }
    // Horizontal boards: 7 over F-04's height; joints of the vertical boards on the
    // window edges.
    const f04 = ground.openings.find((o) => o.id === 'f04-bed1-w')!;
    const lower = clad.zones[0]!;
    expect(lower.direction).toBe('horizontal');
    expect(f04.height / lower.pitch).toBeCloseTo(7, 9);
    for (const zn of clad.zones.filter((x) => x.direction === 'vertical')) {
      for (const o of ground.openings.filter((x) => x.wall === 'ext-w')) {
        for (const u of [o.offset, o.offset + o.width]) {
          const k = (u - zn.anchor) / zn.pitch;
          const inside = zn.polygon.some((p) => Math.abs(p[0] - u) < 1e-6);
          if (inside) expect(Math.abs(k - Math.round(k)), `${o.id} edge`).toBeLessThan(1e-6);
        }
      }
    }
  });

  it('south slats are interrupted in front of the bathroom window F-06 (window band only)', () => {
    const slats = house.exterior.find((e) => e.id === 'south-slats');
    expect(slats?.type).toBe('slats');
    if (slats?.type !== 'slats') return;
    const f06 = ground.openings.find((o) => o.id === 'f06-bath-s')!;
    const x0 = SHELL.west + f06.offset;
    expect(slats.gaps).toHaveLength(1);
    const g = slats.gaps![0]!;
    expect(g.x[0]).toBeCloseTo(x0, 9);
    expect(g.x[1]).toBeCloseTo(x0 + f06.width, 9);
    expect(g.y[0]).toBeCloseTo(f06.sill, 9);
    expect(g.y[1]).toBeCloseTo(f06.sill + f06.height, 9);
    // Slats continue above (to the sunshade) and below the window.
    expect(slats.y[1]).toBeGreaterThan(f06.sill + f06.height);
    expect(slats.y[0]).toBeLessThan(f06.sill);
  });
});
