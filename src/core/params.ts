/** URL parameters: `?debug`, `?pose=x,y,z,yawDeg,pitchDeg`, `?view=x,y,z,yawDeg,pitchDeg`. */
export interface Params {
  debug: boolean;
  /** Player teleport on load (y = feet height). */
  pose: number[] | null;
  /** Free camera (physics paused) — for screenshots / aerial views. */
  view: number[] | null;
  /** Tone-mapping override for look-dev (`agx` | `neutral`; default ACES). */
  tonemap: string | null;
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
  };
}
