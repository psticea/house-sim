/**
 * Procedural furniture kit, primitives (plan.md I5 step 5.1): a local frame per piece
 * (origin on the floor at the footprint centre, front = local +z, rotated about y) that
 * emits straight into the shared per-material `MeshBuilder` — so all furniture merges
 * into one draw call per material, like the house.
 *
 * Soft shapes (cushions, sofa, bedding, WC) are rounded boxes with two 22.5° steps per
 * rounded edge and revolved profiles use 16 sides: facets meet below the stylised
 * looks' 30° edge threshold, so they get a silhouette hull instead of stray lines.
 */
import type { MaterialId } from '../../data/schema';
import type { MeshBuilder, V3 } from '../meshBuilder';

type P2 = readonly [number, number];

const TAN_STEPS = (seg: number): number[] => {
  const out: number[] = [];
  for (let k = seg; k >= 0; k--) out.push(Math.tan(((Math.PI / 4) * k) / seg));
  return out;
};

export class Frame {
  readonly c: number;
  readonly s: number;
  /** Rotation is a multiple of 90°: boxes stay axis-aligned (cleaner UVs, fewer checks). */
  private readonly square: boolean;

  constructor(
    readonly mesh: MeshBuilder,
    readonly ox: number,
    readonly oy: number,
    readonly oz: number,
    readonly rot: number,
  ) {
    const q = rot / (Math.PI / 2);
    this.square = Math.abs(q - Math.round(q)) < 1e-6;
    this.c = this.square ? Math.round(Math.cos(rot)) : Math.cos(rot);
    this.s = this.square ? Math.round(Math.sin(rot)) : Math.sin(rot);
  }

  /** Local point → world. */
  p(x: number, y: number, z: number): V3 {
    return [this.ox + x * this.c + z * this.s, this.oy + y, this.oz - x * this.s + z * this.c];
  }

  /** Local direction → world. */
  v(x: number, y: number, z: number): V3 {
    return [x * this.c + z * this.s, y, -x * this.s + z * this.c];
  }

  /** Child frame at local (x, y, z), turned by `rot` more. */
  sub(x: number, y: number, z: number, rot = 0): Frame {
    const o = this.p(x, y, z);
    return new Frame(this.mesh, o[0], o[1], o[2], this.rot + rot);
  }

  /** Box between two local corners (optionally without its bottom face). */
  box(
    id: MaterialId,
    a: V3,
    b: V3,
    opts: { bottom?: boolean; top?: MaterialId; skipTop?: boolean } = {},
  ): void {
    const x0 = Math.min(a[0], b[0]);
    const x1 = Math.max(a[0], b[0]);
    const y0 = Math.min(a[1], b[1]);
    const y1 = Math.max(a[1], b[1]);
    const z0 = Math.min(a[2], b[2]);
    const z1 = Math.max(a[2], b[2]);
    if (x1 - x0 < 1e-5 || y1 - y0 < 1e-5 || z1 - z0 < 1e-5) return;
    if (this.square) {
      const p = this.p(x0, y0, z0);
      const q = this.p(x1, y1, z1);
      this.mesh.box(
        id,
        [Math.min(p[0], q[0]), p[1], Math.min(p[2], q[2])],
        [Math.max(p[0], q[0]), q[1], Math.max(p[2], q[2])],
        {
          ...(opts.bottom === false ? { bottom: null } : {}),
          ...(opts.top ? { top: opts.top } : {}),
          ...(opts.skipTop ? { skipTop: true } : {}),
        },
      );
      return;
    }
    this.obox(
      id,
      [(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2],
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [(x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2],
    );
  }

  /** Oriented box: centre and orthonormal axes in local coordinates, half sizes. */
  obox(id: MaterialId, c: V3, ax: V3, ay: V3, az: V3, half: V3): void {
    this.mesh.orientedBox(
      id,
      this.p(c[0], c[1], c[2]),
      this.v(ax[0], ax[1], ax[2]),
      this.v(ay[0], ay[1], ay[2]),
      this.v(az[0], az[1], az[2]),
      half,
    );
  }

  /** Box tilted about the local x axis by `tilt` rad (top toward −z for tilt > 0). */
  tiltedBox(id: MaterialId, c: V3, half: V3, tilt: number): void {
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    this.obox(id, c, [1, 0, 0], [0, ct, -st], [0, st, ct], half);
  }

  /**
   * Rounded box (centre, half sizes, radius): every edge rounded with `seg` steps per
   * 45°. Convex, so each triangle faces away from the centre. `tilt` leans it about
   * the local x axis (top toward −z for tilt > 0), like {@link tiltedBox}.
   */
  rbox(id: MaterialId, c: V3, half: V3, r: number, seg = 2, tilt = 0): void {
    const rr = Math.min(r, half[0] * 0.98, half[1] * 0.98, half[2] * 0.98);
    if (rr < 0.004 && tilt === 0) {
      this.box(
        id,
        [c[0] - half[0], c[1] - half[1], c[2] - half[2]],
        [c[0] + half[0], c[1] + half[1], c[2] + half[2]],
      );
      return;
    }
    const ct = Math.cos(tilt);
    const st = -Math.sin(tilt);
    const inner: V3 = [half[0] - rr, half[1] - rr, half[2] - rr];
    const tans = TAN_STEPS(seg);
    const vals = (i: number): number[] => {
      const a = inner[i]!;
      const neg = tans.map((t) => -(a + rr * t));
      const pos = [...neg].reverse().map((v) => -v);
      return [...neg, ...pos];
    };
    const map = (P: V3): V3 => {
      const q: [number, number, number] = [0, 0, 0];
      const n: [number, number, number] = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        q[k] = Math.max(-inner[k]!, Math.min(inner[k]!, P[k]!));
        n[k] = P[k]! - q[k]!;
      }
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      const ox = q[0] + (n[0] / len) * rr;
      const oy = q[1] + (n[1] / len) * rr;
      const oz = q[2] + (n[2] / len) * rr;
      return this.p(c[0] + ox, c[1] + oy * ct - oz * st, c[2] + oy * st + oz * ct);
    };
    const bucket = this.mesh.bucket(id);
    const center = this.p(c[0], c[1], c[2]);
    const emit = (a: V3, b: V3, d: V3): void => {
      const e1: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
      const e2: V3 = [d[0] - a[0], d[1] - a[1], d[2] - a[2]];
      const cr = cross(e1, e2);
      if (cr[0] * cr[0] + cr[1] * cr[1] + cr[2] * cr[2] < 1e-14) return;
      bucket.tri(a, b, d, [
        (a[0] + b[0] + d[0]) / 3 - center[0],
        (a[1] + b[1] + d[1]) / 3 - center[1],
        (a[2] + b[2] + d[2]) / 3 - center[2],
      ]);
    };
    // Six faces: axis k fixed at ±half, the other two axes sampled.
    for (let k = 0; k < 3; k++) {
      const i = (k + 1) % 3;
      const j = (k + 2) % 3;
      const vi = vals(i);
      const vj = vals(j);
      for (const sgn of [-1, 1]) {
        const grid: V3[][] = vi.map((a) =>
          vj.map((b) => {
            const P: [number, number, number] = [0, 0, 0];
            P[k] = sgn * half[k]!;
            P[i] = a;
            P[j] = b;
            return map(P);
          }),
        );
        for (let u = 0; u + 1 < vi.length; u++) {
          for (let w = 0; w + 1 < vj.length; w++) {
            const p00 = grid[u]![w]!;
            const p10 = grid[u + 1]![w]!;
            const p11 = grid[u + 1]![w + 1]!;
            const p01 = grid[u]![w + 1]!;
            // Split along the diagonal that keeps the surface convex (no folds at the
            // rounded corners, which the stylised looks would draw as stray dashes).
            const n = cross(
              [p10[0] - p00[0], p10[1] - p00[1], p10[2] - p00[2]],
              [p11[0] - p00[0], p11[1] - p00[1], p11[2] - p00[2]],
            );
            const out =
              n[0] * (p00[0] - center[0]) +
              n[1] * (p00[1] - center[1]) +
              n[2] * (p00[2] - center[2]);
            const side =
              n[0] * (p01[0] - p00[0]) + n[1] * (p01[1] - p00[1]) + n[2] * (p01[2] - p00[2]);
            if (side * Math.sign(out || 1) <= 1e-12) {
              emit(p00, p10, p11);
              emit(p00, p11, p01);
            } else {
              emit(p00, p10, p01);
              emit(p10, p11, p01);
            }
          }
        }
      }
    }
  }

  /**
   * Surface of revolution about the local vertical through (x, z): profile of
   * [radius, y] points in order along the surface. Optional flat caps at the first /
   * last point; `squash` scales the rings along local z (ovals: basins, tubs).
   */
  lathe(
    id: MaterialId,
    x: number,
    z: number,
    profile: readonly P2[],
    opts: {
      n?: number;
      capStart?: boolean;
      capEnd?: boolean;
      squash?: number;
      /** Ring segments left open (e.g. the teepee's entrance). */
      skip?: readonly number[];
    } = {},
  ): void {
    const n = opts.n ?? 16;
    const sq = opts.squash ?? 1;
    const bucket = this.mesh.bucket(id);
    const at = (r: number, y: number, k: number): V3 => {
      const a = (k / n) * Math.PI * 2;
      return this.p(x + Math.cos(a) * r, y, z + Math.sin(a) * r * sq);
    };
    for (let i = 0; i + 1 < profile.length; i++) {
      const [r0, y0] = profile[i]!;
      const [r1, y1] = profile[i + 1]!;
      const dr = r1 - r0;
      const dy = y1 - y0;
      for (let k = 0; k < n; k++) {
        if (opts.skip?.includes(k)) continue;
        const am = ((k + 0.5) / n) * Math.PI * 2;
        const f = this.v(Math.cos(am) * dy, -dr, Math.sin(am) * dy);
        const a = at(r0, y0, k);
        const b = at(r0, y0, k + 1);
        const c = at(r1, y1, k + 1);
        const d = at(r1, y1, k);
        if (r0 > 1e-6) bucket.tri(a, b, c, f);
        if (r1 > 1e-6) bucket.tri(a, c, d, f);
      }
    }
    const cap = (pt: P2 | undefined, up: boolean): void => {
      if (!pt || pt[0] < 1e-6) return;
      const [r, y] = pt;
      const center = this.p(x, y, z);
      const f: V3 = [0, up ? 1 : -1, 0];
      for (let k = 0; k < n; k++) bucket.tri(center, at(r, y, k), at(r, y, k + 1), f);
    };
    if (opts.capStart) cap(profile[0], (profile[1]?.[1] ?? 0) < (profile[0]?.[1] ?? 0));
    if (opts.capEnd) {
      const last = profile[profile.length - 1];
      const prev = profile[profile.length - 2];
      cap(last, (last?.[1] ?? 0) >= (prev?.[1] ?? 0));
    }
  }

  /** Open tapered tube between two local points (legs, rails, stems), `n` sides. */
  tube(id: MaterialId, a: V3, b: V3, ra: number, rb = ra, n = 8): void {
    const A = this.p(a[0], a[1], a[2]);
    const B = this.p(b[0], b[1], b[2]);
    const ax: V3 = [B[0] - A[0], B[1] - A[1], B[2] - A[2]];
    const len = Math.hypot(ax[0], ax[1], ax[2]);
    if (len < 1e-6) return;
    const d: V3 = [ax[0] / len, ax[1] / len, ax[2] / len];
    const ref: V3 = Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = norm(cross(d, ref));
    const w = cross(d, u);
    const ring = (P: V3, r: number, k: number): V3 => {
      const t = (k / n) * Math.PI * 2;
      return [
        P[0] + (u[0] * Math.cos(t) + w[0] * Math.sin(t)) * r,
        P[1] + (u[1] * Math.cos(t) + w[1] * Math.sin(t)) * r,
        P[2] + (u[2] * Math.cos(t) + w[2] * Math.sin(t)) * r,
      ];
    };
    const bucket = this.mesh.bucket(id);
    for (let k = 0; k < n; k++) {
      const t = ((k + 0.5) / n) * Math.PI * 2;
      const f: V3 = [
        u[0] * Math.cos(t) + w[0] * Math.sin(t),
        u[1] * Math.cos(t) + w[1] * Math.sin(t),
        u[2] * Math.cos(t) + w[2] * Math.sin(t),
      ];
      bucket.quad(ring(A, ra, k), ring(A, ra, k + 1), ring(B, rb, k + 1), ring(B, rb, k), f);
    }
  }

  /**
   * Round mirror on a wall: centre `c` (local), facing local +z; a rim of material
   * `rim` (depth, width) around a slightly recessed disc of material `face`.
   */
  wallDisc(face: MaterialId, rim: MaterialId, c: V3, r: number, depth: number, rimW: number): void {
    const n = 24;
    const pt = (rad: number, z: number, k: number): V3 => {
      const a = (k / n) * Math.PI * 2;
      return this.p(c[0] + Math.cos(a) * rad, c[1] + Math.sin(a) * rad, c[2] + z);
    };
    const fwd = this.v(0, 0, 1);
    const rb = this.mesh.bucket(rim);
    const fb = this.mesh.bucket(face);
    const front = this.p(c[0], c[1], c[2] + depth * 0.6);
    for (let k = 0; k < n; k++) {
      const am = ((k + 0.5) / n) * Math.PI * 2;
      const out = this.v(Math.cos(am), Math.sin(am), 0);
      rb.quad(pt(r, 0, k), pt(r, 0, k + 1), pt(r, depth, k + 1), pt(r, depth, k), out);
      rb.quad(
        pt(r - rimW, depth, k),
        pt(r, depth, k),
        pt(r, depth, k + 1),
        pt(r - rimW, depth, k + 1),
        fwd,
      );
      rb.quad(
        pt(r - rimW, depth * 0.6, k),
        pt(r - rimW, depth * 0.6, k + 1),
        pt(r - rimW, depth, k + 1),
        pt(r - rimW, depth, k),
        [-out[0], -out[1], -out[2]],
      );
      fb.tri(front, pt(r - rimW, depth * 0.6, k), pt(r - rimW, depth * 0.6, k + 1), fwd);
    }
  }

  /** Quad from local points, front toward local `facing`. */
  quad(id: MaterialId, a: V3, b: V3, c: V3, d: V3, facing: V3): void {
    this.mesh.quad(
      id,
      this.p(a[0], a[1], a[2]),
      this.p(b[0], b[1], b[2]),
      this.p(c[0], c[1], c[2]),
      this.p(d[0], d[1], d[2]),
      this.v(facing[0], facing[1], facing[2]),
    );
  }
}

function cross(a: V3, b: V3): V3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function norm(a: V3): V3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
