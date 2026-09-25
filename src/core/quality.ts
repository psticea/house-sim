/**
 * Quality tiers (plan.md §3): picked once at start from the GPU / device (own heuristic,
 * no third-party data or requests), overridable with `?quality=low|medium|high|auto`
 * (remembered in localStorage), plus a dynamic-resolution controller.
 */

export type Tier = 'low' | 'medium' | 'high';
export const TIERS: readonly Tier[] = ['low', 'medium', 'high'];

export interface TierSettings {
  /** Upper bound of the device pixel ratio used for rendering. */
  pixelRatio: number;
  /** MSAA (context attribute — fixed for the page lifetime). */
  antialias: boolean;
  /** Texture tier of the realistic look (`public/assets/textures/manifest.json`). */
  textures: Tier;
  /** Max anisotropic filtering of the PBR textures. */
  anisotropy: number;
  /** Static sun shadow map of the realistic look (px). */
  shadowMapSize: number;
  /** Interior reflection probes (realistic look). */
  probes: boolean;
}

export const TIER_SETTINGS: Readonly<Record<Tier, TierSettings>> = {
  low: {
    pixelRatio: 1,
    antialias: false,
    textures: 'low',
    anisotropy: 2,
    shadowMapSize: 1024,
    probes: false,
  },
  medium: {
    pixelRatio: 1.5,
    antialias: true,
    textures: 'medium',
    anisotropy: 4,
    shadowMapSize: 1024,
    probes: true,
  },
  high: {
    pixelRatio: 2,
    antialias: true,
    textures: 'high',
    anisotropy: 8,
    shadowMapSize: 2048,
    probes: true,
  },
};

export const QUALITY_STORAGE_KEY = 'houseSim.quality';

export function tierOf(v: string | null | undefined): Tier | null {
  const s = typeof v === 'string' ? v.trim().toLowerCase() : '';
  return (TIERS as readonly string[]).includes(s) ? (s as Tier) : null;
}

export interface DeviceInfo {
  /** Unmasked WebGL renderer string ('' if unavailable). */
  gpu: string;
  touch: boolean;
  /** `navigator.deviceMemory` (GB), when the browser exposes it. */
  memoryGB?: number;
}

/**
 * Tier guess from the GPU name. Software renderers (SwiftShader in the e2e tests) get
 * medium so the default experience is what gets tested; dynamic resolution then
 * protects slow devices.
 */
export function detectTier(d: DeviceInfo): Tier {
  const g = d.gpu.toLowerCase();
  if (/swiftshader|llvmpipe|software|basic render/.test(g)) return 'medium';
  if (d.memoryGB !== undefined && d.memoryGB <= 2) return 'low';
  if (d.touch) {
    if (d.memoryGB !== undefined && d.memoryGB <= 3) return 'low';
    const adreno = /adreno[^0-9]*(\d{3})/.exec(g);
    if (adreno) {
      const n = Number(adreno[1]);
      return n >= 730 ? 'high' : n >= 610 ? 'medium' : 'low';
    }
    if (/immortalis/.test(g)) return 'high';
    const mali = /mali-g(\d+)/.exec(g);
    if (mali) {
      const n = Number(mali[1]);
      // G52/G57 (budget) → low; G68/G76/G77/G78/G610/G710/G715… → medium.
      return n === 52 || n === 57 || n === 51 || n === 31 ? 'low' : 'medium';
    }
    if (/mali-t|mali-4|powervr|sgx|videocore/.test(g)) return 'low';
    return 'medium'; // Apple GPU (iPhone/iPad), Xclipse, unknown phones
  }
  if (/nvidia|geforce|rtx|gtx|quadro|radeon|amd|apple m\d|apple gpu/.test(g)) return 'high';
  return 'medium'; // Intel / unknown integrated GPUs
}

/** Unmasked GPU name from a throw-away WebGL 2 context ('' if not available). */
export function probeGpu(): string {
  if (typeof document === 'undefined') return '';
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) ?? '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return '';
  }
}

export interface QualityChoice {
  tier: Tier;
  /** `url` / `stored` override, or `auto` (detected). */
  source: 'url' | 'stored' | 'auto';
  gpu: string;
}

/** `?quality=` (stored for next time; `auto` clears it) → stored → detected. */
export function chooseQuality(
  search: string,
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null,
  device: DeviceInfo,
): QualityChoice {
  const q = new URLSearchParams(search).get('quality');
  const fromUrl = tierOf(q);
  try {
    if (fromUrl) storage?.setItem(QUALITY_STORAGE_KEY, fromUrl);
    else if (q?.trim().toLowerCase() === 'auto') storage?.removeItem(QUALITY_STORAGE_KEY);
  } catch {
    // storage disabled — the choice just isn't remembered
  }
  if (fromUrl) return { tier: fromUrl, source: 'url', gpu: device.gpu };
  let stored: Tier | null;
  try {
    stored = tierOf(storage?.getItem(QUALITY_STORAGE_KEY));
  } catch {
    stored = null;
  }
  if (stored) return { tier: stored, source: 'stored', gpu: device.gpu };
  return { tier: detectTier(device), source: 'auto', gpu: device.gpu };
}

/** One tier down (the 1-s warm-up benchmark uses this when frames are too slow). */
export const lowerTier = (t: Tier): Tier => (t === 'high' ? 'medium' : 'low');

/**
 * Dynamic resolution: steers the pixel ratio between `min` and `max` from the smoothed
 * frame interval. Drops quickly when frames are slow (≥ 0.5 s over budget), recovers
 * slowly (≥ 3 s comfortably under budget) — the hysteresis avoids oscillation.
 */
export class DynamicResolution {
  ratio: number;
  private avgMs = 0;
  private slowFor = 0;
  private fastFor = 0;

  constructor(
    public max: number,
    readonly min = 0.75,
    /** Frame interval above which resolution drops (ms; 22 ≈ 45 fps). */
    readonly slowMs = 22,
    /** Frame interval below which resolution may rise (ms; 17.5 ≈ vsync at 57+ fps). */
    readonly fastMs = 17.5,
    readonly step = 0.125,
  ) {
    this.ratio = max;
  }

  setMax(max: number): void {
    this.max = max;
    this.ratio = Math.min(Math.max(this.ratio, Math.min(this.min, max)), max);
  }

  /** Feed one frame interval (ms); returns the new ratio when it changed, else `null`. */
  update(frameMs: number): number | null {
    if (!(frameMs > 0) || frameMs > 250) return null; // tab switch / hitch
    this.avgMs = this.avgMs === 0 ? frameMs : this.avgMs * 0.9 + frameMs * 0.1;
    const dt = frameMs / 1000;
    if (this.avgMs > this.slowMs) {
      this.slowFor += dt;
      this.fastFor = 0;
    } else if (this.avgMs < this.fastMs) {
      this.fastFor += dt;
      this.slowFor = 0;
    } else {
      this.slowFor = 0;
      this.fastFor = 0;
    }
    const lo = Math.min(this.min, this.max);
    let next = this.ratio;
    if (this.slowFor >= 0.5 && this.ratio > lo) next = Math.max(lo, this.ratio - this.step);
    else if (this.fastFor >= 3 && this.ratio < this.max)
      next = Math.min(this.max, this.ratio + this.step);
    if (next === this.ratio) return null;
    this.ratio = next;
    this.slowFor = 0;
    this.fastFor = 0;
    // Let the average settle at the new resolution before judging again.
    this.avgMs = 0;
    return next;
  }
}
