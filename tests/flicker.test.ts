/**
 * Flicker fix (realistic look): the room the eye adapts to keeps the last room inside door
 * openings, exposure adaptation never overshoots, and reflections cross-fade between the
 * sky and the interior probes instead of switching.
 */
import { describe, expect, it } from 'vitest';
import { house } from '../src/data/house';
import { lightRoom, locate, OUTSIDE } from '../src/data/topology';
import {
  EyeAdaptation,
  PROBE_FADE_SECONDS,
  PROBES,
  probeFor,
  REAL_BAKED_LIGHT,
  REAL_LIGHT,
  ReflectionMix,
} from '../src/world/realLook';

const DT = 1 / 60;

/** Points every 1 cm along a polyline of (x, z). */
function along(points: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 1; i < points.length; i++) {
    const [ax, az] = points[i - 1]!;
    const [bx, bz] = points[i]!;
    const n = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.01);
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  out.push(points[points.length - 1]!);
  return out;
}

/** Raw rooms (`locate`) and light rooms along a walk at feet height `y`. */
function walk(points: [number, number][], y: number): { raw: string[]; light: string[] } {
  const raw: string[] = [];
  const light: string[] = [];
  let prev: string | null = null;
  for (const [x, z] of along(points)) {
    raw.push(locate(house, x, y, z).room);
    prev = lightRoom(house, prev, x, y, z);
    light.push(prev);
  }
  return { raw, light };
}

/** Consecutive distinct values. */
const runs = (a: string[]): string[] => a.filter((v, i) => i === 0 || v !== a[i - 1]);

describe('light room: door openings keep the last room', () => {
  const crossings: [string, [number, number][], number, string[]][] = [
    [
      'front door',
      [
        [5.0, -0.9],
        [8.775, -0.9],
        [8.775, 1.6],
      ],
      0,
      [OUTSIDE, 'entrance-hall'],
    ],
    [
      'hall → bathroom (Ui-01)',
      [
        [5.86, 3.1],
        [5.86, 4.4],
        [5.75, 5.7],
      ],
      0,
      ['entrance-hall', 'bathroom'],
    ],
    [
      'hall → bedroom 1',
      [
        [8.2, 3.05],
        [3.7, 3.05],
        [2.2, 3.05],
      ],
      0,
      ['entrance-hall', 'bedroom-1'],
    ],
    [
      'living → terrace (glass door)',
      [
        [16.0, 1.75],
        [17.6, 1.75],
        [19.1, 2.37],
      ],
      0,
      ['living-kitchen', 'terrace'],
    ],
    [
      'upper hall → bedroom 3',
      [
        [5.2, 3.0],
        [3.8, 3.0],
        [2.5, 3.0],
      ],
      2.95,
      ['upper-hall', 'bedroom-3'],
    ],
    [
      'upper hall → upper bathroom',
      [
        [5.6, 3.1],
        [5.75, 4.4],
      ],
      2.95,
      ['upper-hall', 'upper-bathroom'],
    ],
  ];

  it.each(crossings)('%s: one change, no outdoor / lower-level blip', (_, pts, y, expected) => {
    const { raw, light } = walk(pts, y);
    // The raw reading flips through interior openings (the cause of the flash)…
    if (expected[0] !== OUTSIDE) expect(runs(raw).length).toBeGreaterThan(expected.length);
    // …the light room changes exactly once.
    expect(runs(light)).toEqual(expected);
  });

  it('takes the raw reading without history (teleports) and outside the shell', () => {
    expect(lightRoom(house, null, 5.86, 0, 3.5)).toBe(locate(house, 5.86, 0, 3.5).room);
    expect(lightRoom(house, 'entrance-hall', 5.0, 0, -0.9)).toBe(OUTSIDE);
    expect(lightRoom(house, 'outside', 2.3, 0, 2.8)).toBe('bedroom-1');
  });
});

describe('eye adaptation: smooth, no overshoot', () => {
  const L = { ...REAL_LIGHT, ...REAL_BAKED_LIGHT };
  const gains: Record<string, number> = { 'entrance-hall': 1.4, bathroom: 2.2 };
  const gainOf = (room: string): number => gains[room] ?? 1;

  /** Exposure per frame for a room per frame. */
  function exposures(rooms: string[]): number[] {
    const eye = new EyeAdaptation();
    return rooms.map((room, i) => {
      const inside = room !== OUTSIDE && room !== 'terrace';
      eye.update(DT, inside, inside ? gainOf(room) : 1, i === 0, L.adaptSeconds);
      return eye.exposure(L.exposure, L.insideExposure);
    });
  }

  it('walking through the bathroom door: exposure rises monotonically (no dip)', () => {
    const pts: [number, number][] = [
      [5.86, 3.1],
      [5.86, 4.4],
      [5.75, 5.7],
    ];
    // 1.4 m/s at 60 fps ≈ 2.3 cm a frame: sample every 2nd centimetre.
    const { raw, light } = walk(pts, 0);
    const lightFrames = light.filter((_, i) => i % 2 === 0);
    const rawFrames = raw.filter((_, i) => i % 2 === 0);
    const e = exposures(lightFrames);
    for (let i = 1; i < e.length; i++) expect(e[i]!).toBeGreaterThanOrEqual(e[i - 1]! - 1e-9);
    // The raw reading would have dipped toward the outdoor exposure in the opening.
    const r = exposures(rawFrames);
    expect(Math.min(...r.slice(1).map((v, i) => v - r[i]!))).toBeLessThan(-0.01);
  });

  it('never leaves the range of the start and end exposure, also with long frames', () => {
    for (const dt of [DT, 0.1, 0.25]) {
      for (const [a, b] of [
        [OUTSIDE, 'bathroom'],
        ['bathroom', OUTSIDE],
        ['entrance-hall', 'bathroom'],
        ['bathroom', 'entrance-hall'],
      ] as const) {
        const eye = new EyeAdaptation();
        eye.update(dt, a !== OUTSIDE, gainOf(a), true, L.adaptSeconds);
        const e0 = eye.exposure(L.exposure, L.insideExposure);
        const seq: number[] = [];
        for (let k = 0; k < 600; k++) {
          eye.update(dt, b !== OUTSIDE, b === OUTSIDE ? 1 : gainOf(b), false, L.adaptSeconds);
          seq.push(eye.exposure(L.exposure, L.insideExposure));
        }
        const e1 = seq[seq.length - 1]!;
        const lo = Math.min(e0, e1) - 1e-9;
        const hi = Math.max(e0, e1) + 1e-9;
        for (const v of seq) {
          expect(v).toBeGreaterThanOrEqual(lo);
          expect(v).toBeLessThanOrEqual(hi);
        }
        // Monotonic toward the new value and settled exactly.
        const sign = Math.sign(e1 - e0);
        for (let k = 1; k < seq.length; k++) {
          expect((seq[k]! - seq[k - 1]!) * sign).toBeGreaterThanOrEqual(-1e-9);
        }
        expect(eye.adapt).toBe(b === OUTSIDE ? 0 : 1);
      }
    }
  });
});

describe('reflections: cross-fade between sky and probes', () => {
  const ids = PROBES.map((p) => p.id);
  const sum = (w: { sky: number; probes: [string, number][] }): number =>
    w.sky + w.probes.reduce((s, [, v]) => s + v, 0);
  const of = (w: { probes: [string, number][] }, id: string): number =>
    w.probes.find(([p]) => p === id)![1];
  /** Largest per-frame weight step allowed at 60 fps. */
  const step = 1 - Math.exp(-DT / PROBE_FADE_SECONDS);

  it('every room has a probe indoors and none outdoors', () => {
    expect(probeFor(OUTSIDE)).toBeNull();
    expect(probeFor('terrace')).toBeNull();
    expect(probeFor('bathroom')).toBe('bathroom');
    expect(probeFor('upper-hall')).toBe('bedroom-3');
  });

  it('fades sky → probe → other probe → sky without jumps, weights summing to 1', () => {
    const mix = new ReflectionMix(ids);
    mix.update(DT, null, true);
    expect(mix.weights().sky).toBe(1);
    const seq: (string | null)[] = [
      ...Array<null>(30).fill(null),
      ...Array<string>(90).fill('living'),
      ...Array<string>(90).fill('bathroom'),
      ...Array<null>(90).fill(null),
    ];
    let prev = mix.weights();
    for (const probe of seq) {
      mix.update(DT, probe);
      const w = mix.weights();
      expect(sum(w)).toBeCloseTo(1, 9);
      expect(Math.abs(w.sky - prev.sky)).toBeLessThanOrEqual(step + 1e-9);
      for (const id of ids) {
        expect(Math.abs(of(w, id) - of(prev, id))).toBeLessThanOrEqual(step + 1e-9);
      }
      prev = w;
    }
    expect(prev.sky).toBe(1);
  });

  it('settles exactly on one probe (no blend pass at rest) and snaps on teleports', () => {
    const mix = new ReflectionMix(ids);
    for (let k = 0; k < 120; k++) mix.update(DT, 'living');
    let w = mix.weights();
    expect(w.sky).toBe(0);
    expect(of(w, 'living')).toBe(1);
    for (let k = 0; k < 10; k++) mix.update(DT, 'bedroom-3');
    w = mix.weights();
    expect(of(w, 'living')).toBeGreaterThan(0);
    expect(of(w, 'bedroom-3')).toBeGreaterThan(0);
    for (let k = 0; k < 120; k++) mix.update(DT, 'bedroom-3');
    expect(of(mix.weights(), 'bedroom-3')).toBe(1);
    mix.update(DT, 'bathroom', true);
    w = mix.weights();
    expect(of(w, 'bathroom')).toBe(1);
    expect(w.sky).toBe(0);
    mix.update(DT, null, true);
    expect(mix.weights().sky).toBe(1);
  });
});
