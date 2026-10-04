/**
 * URL parameters: `?debug`, `?pose=x,y,z,yawDeg,pitchDeg`, `?view=x,y,z,yawDeg,pitchDeg`,
 * `?tonemap=aces|agx|neutral`, `?style=sketchup|borderlands|real` (`sketch` = `sketchup`, the default),
 * `?quality=low|medium|high|auto` (read by core/quality.ts), `?dynres=0` (fixed resolution),
 * `?baked=0` (realistic look without the baked lightmaps — the I4 shadow-map lighting),
 * `?controls=walk|fly` (overrides the stored controls choice for one load).
 */

/** The three looks (plan.md S2). */
export type StyleName = 'real' | 'sketchup' | 'borderlands';
/** Cycle order of the style toggle / key K. */
export const STYLE_NAMES: readonly StyleName[] = ['sketchup', 'borderlands', 'real'];
/** Old S1 names that still work (URL, `setStyle`). */
export const STYLE_ALIASES: Readonly<Record<string, StyleName>> = { sketch: 'sketchup' };

/** Walk (first person, gravity) or fly (drone camera, two sticks). */
export type ControlsMode = 'walk' | 'fly';
export const CONTROLS_MODES: readonly ControlsMode[] = ['walk', 'fly'];

/** Canonical controls mode, or `null` for anything unknown. */
export function controlsModeOf(v: string | null | undefined): ControlsMode | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (s === 'drone') return 'fly';
  return (CONTROLS_MODES as readonly string[]).includes(s) ? (s as ControlsMode) : null;
}

export interface Params {
  debug: boolean;
  /** Player teleport on load (y = feet height). */
  pose: number[] | null;
  /** Free camera (physics paused) — for screenshots / aerial views. */
  view: number[] | null;
  /** Tone-mapping override for the realistic look (`agx` | `neutral`; default ACES). */
  tonemap: string | null;
  /** Look from `?style=` (unknown or missing → {@link DEFAULT_STYLE}). */
  style: StyleName;
  /** `?style=` if it names a known look (overrides the stored choice), else `null`. */
  styleParam: StyleName | null;
  /** `?dynres=0`: keep the pixel ratio fixed (no dynamic resolution). */
  fixedResolution: boolean;
  /** `?baked=0`: don't load the baked lightmaps (before / after comparisons). */
  baked: boolean;
  /** `?controls=` if it names a known mode (overrides the stored choice), else `null`. */
  controls: ControlsMode | null;
}

/** Look used when neither the URL nor a stored choice names one (owner, 2026-10-04: realistic). */
export const DEFAULT_STYLE: StyleName = 'real';

/** Canonical style name (`sketch` → `sketchup`), or `null` for anything unknown. */
export function styleNameOf(v: string | null | undefined): StyleName | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if ((STYLE_NAMES as readonly string[]).includes(s)) return s as StyleName;
  return STYLE_ALIASES[s] ?? null;
}

/** `?style=` value → look; anything unknown → {@link DEFAULT_STYLE}. */
export function parseStyle(v: string | null): StyleName {
  return styleNameOf(v) ?? DEFAULT_STYLE;
}

function parseNumbers(v: string | null, min: number): number[] | null {
  if (!v) return null;
  const nums = v.split(',').map((s) => Number(s.trim()));
  if (nums.length < min || nums.some((n) => !Number.isFinite(n))) return null;
  return nums;
}

export function readParams(search: string = window.location.search): Params {
  const q = new URLSearchParams(search);
  return {
    debug: q.has('debug'),
    pose: parseNumbers(q.get('pose'), 3),
    view: parseNumbers(q.get('view'), 3),
    tonemap: q.get('tonemap'),
    style: parseStyle(q.get('style')),
    styleParam: styleNameOf(q.get('style')),
    fixedResolution: q.get('dynres') === '0',
    baked: q.get('baked') !== '0',
    controls: controlsModeOf(q.get('controls')),
  };
}
