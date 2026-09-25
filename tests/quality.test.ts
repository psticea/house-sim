import { describe, expect, it } from 'vitest';
import {
  chooseQuality,
  detectTier,
  DynamicResolution,
  lowerTier,
  QUALITY_STORAGE_KEY,
  TIER_SETTINGS,
  tierOf,
} from '../src/core/quality';

function memoryStorage(init: Record<string, string> = {}) {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    map: m,
  };
}

describe('quality tiers', () => {
  it('settings follow plan.md §3: pixel ratio, textures, anisotropy, shadow map', () => {
    expect(TIER_SETTINGS.low.pixelRatio).toBeLessThanOrEqual(1);
    expect(TIER_SETTINGS.medium.pixelRatio).toBeGreaterThanOrEqual(1.25);
    expect(TIER_SETTINGS.medium.pixelRatio).toBeLessThanOrEqual(1.5);
    expect(TIER_SETTINGS.high.pixelRatio).toBeLessThanOrEqual(2);
    expect(TIER_SETTINGS.low.antialias).toBe(false);
    expect(TIER_SETTINGS.medium.antialias).toBe(true);
    expect(TIER_SETTINGS.low.probes).toBe(false);
    for (const t of ['low', 'medium', 'high'] as const) expect(TIER_SETTINGS[t].textures).toBe(t);
    expect(TIER_SETTINGS.low.anisotropy).toBeLessThan(TIER_SETTINGS.high.anisotropy);
    expect(lowerTier('high')).toBe('medium');
    expect(lowerTier('medium')).toBe('low');
    expect(lowerTier('low')).toBe('low');
    expect(tierOf(' HIGH ')).toBe('high');
    expect(tierOf('ultra')).toBeNull();
  });

  it('detects tiers from the GPU name', () => {
    const phone = (gpu: string, memoryGB?: number) =>
      detectTier({ gpu, touch: true, ...(memoryGB ? { memoryGB } : {}) });
    const desk = (gpu: string) => detectTier({ gpu, touch: false });
    expect(phone('Adreno (TM) 740')).toBe('high');
    expect(phone('Adreno (TM) 642L')).toBe('medium');
    expect(phone('Adreno (TM) 506')).toBe('low');
    expect(phone('Mali-G68 MC4')).toBe('medium');
    expect(phone('Mali-G78 MP20')).toBe('medium');
    expect(phone('Mali-G57 MC2')).toBe('low');
    expect(phone('Mali-T880')).toBe('low');
    expect(phone('Apple GPU')).toBe('medium');
    expect(phone('Apple GPU', 2)).toBe('low');
    expect(phone('PowerVR Rogue GE8320')).toBe('low');
    expect(desk('ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)')).toBe(
      'high',
    );
    expect(desk('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11)')).toBe('medium');
    expect(desk('Apple M1')).toBe('high');
    // Software renderers (the e2e tests) → medium.
    expect(desk('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader)')).toBe(
      'medium',
    );
    expect(desk('')).toBe('medium');
  });

  it('?quality= wins and is remembered; auto clears; stored beats detection', () => {
    const device = { gpu: 'Mali-G57', touch: true };
    const s = memoryStorage();
    expect(chooseQuality('?quality=high', s, device)).toMatchObject({
      tier: 'high',
      source: 'url',
    });
    expect(s.map.get(QUALITY_STORAGE_KEY)).toBe('high');
    expect(chooseQuality('', s, device)).toMatchObject({ tier: 'high', source: 'stored' });
    expect(chooseQuality('?quality=auto', s, device)).toMatchObject({
      tier: 'low',
      source: 'auto',
    });
    expect(s.map.has(QUALITY_STORAGE_KEY)).toBe(false);
    expect(chooseQuality('?quality=bogus', null, device).tier).toBe('low');
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => undefined,
    };
    expect(chooseQuality('?quality=medium', broken, device).tier).toBe('medium');
    expect(chooseQuality('', broken, device).tier).toBe('low');
  });
});

describe('dynamic resolution', () => {
  const run = (d: DynamicResolution, ms: number, seconds: number): number[] => {
    const changes: number[] = [];
    for (let t = 0; t < seconds * 1000; t += ms) {
      const r = d.update(ms);
      if (r !== null) changes.push(r);
    }
    return changes;
  };

  it('drops quickly when slow, down to the minimum and not below', () => {
    const d = new DynamicResolution(1.5);
    const first = run(d, 40, 1);
    expect(first.length).toBeGreaterThanOrEqual(1);
    expect(first[0]).toBeCloseTo(1.375, 6);
    run(d, 40, 20);
    expect(d.ratio).toBe(0.75);
  });

  it('recovers slowly at vsync, up to the cap', () => {
    const d = new DynamicResolution(1.5);
    run(d, 40, 20);
    expect(run(d, 16.7, 2)).toEqual([]); // < 3 s of good frames: no change yet
    run(d, 16.7, 60);
    expect(d.ratio).toBe(1.5);
  });

  it('hysteresis: frames between the thresholds change nothing; hitches are ignored', () => {
    const d = new DynamicResolution(1.5);
    expect(run(d, 20, 30)).toEqual([]);
    expect(d.update(1000)).toBeNull();
    expect(d.ratio).toBe(1.5);
  });

  it('a lower cap (e.g. a stylised look) clamps the ratio; min never exceeds the cap', () => {
    const d = new DynamicResolution(2);
    d.setMax(1);
    expect(d.ratio).toBe(1);
    run(d, 40, 20);
    expect(d.ratio).toBe(0.75);
    d.setMax(0.6);
    expect(d.ratio).toBe(0.6);
    run(d, 40, 5);
    expect(d.ratio).toBe(0.6);
  });
});
