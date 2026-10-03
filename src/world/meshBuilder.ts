/**
 * Triangle accumulator: geometry is emitted directly into per-material buckets (flat
 * normals, world-space box UVs with 1 UV unit = 1 m), then turned into one
 * BufferGeometry per material → one draw call per material for the whole house.
 *
 * Two optional per-triangle extras for the realistic look only (the stylised looks never
 * read them): a UV offset per piece (`uv2` = uv + offset, e.g. each board / door front
 * its own piece of the grain) and a cavity shade (`color`, e.g. carcass faces seen
 * through the reveals between doors). Which materials carry them is fixed per material
 * (`GEOMETRY_EXTRAS`), so every mesh of such a material has the attributes.
 */
import * as THREE from 'three';
import type { MaterialId } from '../data/schema';

export type V3 = readonly [number, number, number];

/** Materials whose geometry carries the per-piece `uv2` and / or the `color` shade. */
export const GEOMETRY_EXTRAS: Readonly<Partial<Record<MaterialId, { uv2?: true; color?: true }>>> =
  {
    cladWood: { uv2: true },
    joinery: { uv2: true, color: true },
  };

/**
 * Cavity shade for triangles facing `facing` (dot > 0.99), or with `sides` for the
 * triangles perpendicular to it (the edges of a panel facing `facing`).
 */
export interface Shade {
  value: number;
  facing: V3;
  sides?: boolean;
}

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _c = new THREE.Vector3();
const _n = new THREE.Vector3();

export class TriangleBucket {
  readonly positions: number[] = [];
  /** Indices of triangles whose box-projected UVs are swapped (u ↔ v, grain turned 90°). */
  readonly swapped: number[] = [];
  /** While set, new triangles are recorded in `swapped`. */
  swapUv = false;
  /** Per-triangle UV offsets (m): triples (triangle index, du, dv). */
  readonly shifted: number[] = [];
  /** While set, new triangles get this UV offset (after any swap). */
  uvShift: readonly [number, number] | null = null;
  /** Per-triangle cavity shades: pairs (triangle index, value). */
  readonly shaded: number[] = [];
  /** While set, new triangles facing `shade.facing` get `shade.value`. */
  shade: Shade | null = null;

  get triangleCount(): number {
    return this.positions.length / 9;
  }

  /**
   * Adds a triangle. If `facing` is given, the winding is flipped when needed so the
   * front face (counter-clockwise) points along `facing`.
   */
  tri(a: V3, b: V3, c: V3, facing?: V3): void {
    if (this.swapUv) this.swapped.push(this.positions.length / 9);
    if (this.uvShift) {
      this.shifted.push(this.positions.length / 9, this.uvShift[0], this.uvShift[1]);
    }
    const s = this.shade;
    if (s && facing) {
      const d = facing[0] * s.facing[0] + facing[1] * s.facing[1] + facing[2] * s.facing[2];
      if (s.sides ? Math.abs(d) < 0.01 : d > 0.99) {
        this.shaded.push(this.positions.length / 9, s.value);
      }
    }
    if (facing) {
      _a.set(...a);
      _b.set(...b).sub(_a);
      _c.set(...c).sub(_a);
      _n.crossVectors(_b, _c);
      if (_n.x * facing[0] + _n.y * facing[1] + _n.z * facing[2] < 0) {
        this.positions.push(...a, ...c, ...b);
        return;
      }
    }
    this.positions.push(...a, ...b, ...c);
  }

  quad(a: V3, b: V3, c: V3, d: V3, facing?: V3): void {
    this.tri(a, b, c, facing);
    this.tri(a, c, d, facing);
  }
}

/** Collects triangles per material. */
export class MeshBuilder {
  private readonly buckets = new Map<MaterialId, TriangleBucket>();
  /**
   * While set, emitted triangles get their world-space UVs swapped (u ↔ v): e.g. the
   * vertical boards of a facade, so a board texture's grain runs along them.
   */
  swapUv = false;
  /**
   * While set, emitted triangles get this offset added to their world-space UVs (m):
   * e.g. a board or door front shows another part of the texture than its neighbour.
   */
  uvShift: readonly [number, number] | null = null;
  /** While set, emitted triangles facing `shade.facing` get a cavity shade. */
  shade: Shade | null = null;

  bucket(id: MaterialId): TriangleBucket {
    let b = this.buckets.get(id);
    if (!b) {
      b = new TriangleBucket();
      this.buckets.set(id, b);
    }
    b.swapUv = this.swapUv;
    b.uvShift = this.uvShift;
    b.shade = this.shade;
    return b;
  }

  tri(id: MaterialId, a: V3, b: V3, c: V3, facing?: V3): void {
    this.bucket(id).tri(a, b, c, facing);
  }

  quad(id: MaterialId, a: V3, b: V3, c: V3, d: V3, facing?: V3): void {
    this.bucket(id).quad(a, b, c, d, facing);
  }

  /**
   * Planar polygon given in a local 2D frame: point(s, t) = origin + s·S + t·T. Holes
   * optional. Triangulated with THREE.ShapeUtils (earcut).
   */
  polygon(
    id: MaterialId,
    outline: readonly (readonly [number, number])[],
    holes: readonly (readonly (readonly [number, number])[])[],
    toWorld: (s: number, t: number) => V3,
    facing: V3,
  ): void {
    const contour = outline.map(([s, t]) => new THREE.Vector2(s, t));
    const holeVecs = holes.map((h) => h.map(([s, t]) => new THREE.Vector2(s, t)));
    const faces = THREE.ShapeUtils.triangulateShape(contour, holeVecs);
    const all = [...contour, ...holeVecs.flat()];
    const bucket = this.bucket(id);
    for (const face of faces) {
      const p = all[face[0]!]!;
      const q = all[face[1]!]!;
      const r = all[face[2]!]!;
      bucket.tri(toWorld(p.x, p.y), toWorld(q.x, q.y), toWorld(r.x, r.y), facing);
    }
  }

  /** Axis-aligned box. `materials` may give a different material for top/bottom. */
  box(
    id: MaterialId,
    min: V3,
    max: V3,
    opts: { top?: MaterialId; bottom?: MaterialId | null; skipTop?: boolean } = {},
  ): void {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    const side = this.bucket(id);
    side.quad([x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [-1, 0, 0]);
    side.quad([x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [x1, y0, z1], [1, 0, 0]);
    side.quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1]);
    side.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    if (!opts.skipTop) {
      this.bucket(opts.top ?? id).quad(
        [x0, y1, z0],
        [x1, y1, z0],
        [x1, y1, z1],
        [x0, y1, z1],
        [0, 1, 0],
      );
    }
    if (opts.bottom !== null) {
      this.bucket(opts.bottom ?? id).quad(
        [x0, y0, z0],
        [x1, y0, z0],
        [x1, y0, z1],
        [x0, y0, z1],
        [0, -1, 0],
      );
    }
  }

  /** Box centred at `c` with orthonormal axes (ax, ay, az) and half sizes (hx, hy, hz). */
  orientedBox(id: MaterialId, c: V3, ax: V3, ay: V3, az: V3, half: V3): void {
    const corner = (sx: number, sy: number, sz: number): V3 => [
      c[0] + ax[0] * half[0] * sx + ay[0] * half[1] * sy + az[0] * half[2] * sz,
      c[1] + ax[1] * half[0] * sx + ay[1] * half[1] * sy + az[1] * half[2] * sz,
      c[2] + ax[2] * half[0] * sx + ay[2] * half[1] * sy + az[2] * half[2] * sz,
    ];
    const b = this.bucket(id);
    const neg = (v: V3): V3 => [-v[0], -v[1], -v[2]];
    b.quad(corner(1, -1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(1, -1, 1), ax);
    b.quad(corner(-1, -1, -1), corner(-1, 1, -1), corner(-1, 1, 1), corner(-1, -1, 1), neg(ax));
    b.quad(corner(-1, 1, -1), corner(1, 1, -1), corner(1, 1, 1), corner(-1, 1, 1), ay);
    b.quad(corner(-1, -1, -1), corner(1, -1, -1), corner(1, -1, 1), corner(-1, -1, 1), neg(ay));
    b.quad(corner(-1, -1, 1), corner(1, -1, 1), corner(1, 1, 1), corner(-1, 1, 1), az);
    b.quad(corner(-1, -1, -1), corner(1, -1, -1), corner(1, 1, -1), corner(-1, 1, -1), neg(az));
  }

  /**
   * Vertical prism from a plan polygon [x, z] between y0 and y1 (optional holes).
   * `bottom: null` / `sides: null` skip those faces.
   */
  prism(
    poly: readonly (readonly [number, number])[],
    y0: number,
    y1: number,
    mats: { top: MaterialId; bottom?: MaterialId | null; sides?: MaterialId | null },
    holes: readonly (readonly (readonly [number, number])[])[] = [],
  ): void {
    this.polygon(mats.top, poly, holes, (x, z) => [x, y1, z], [0, 1, 0]);
    if (mats.bottom !== null) {
      this.polygon(mats.bottom ?? mats.top, poly, holes, (x, z) => [x, y0, z], [0, -1, 0]);
    }
    if (mats.sides === null) return;
    const sideId = mats.sides ?? mats.top;
    const rings = [poly, ...holes];
    rings.forEach((ring, ri) => {
      const ccw = ringSignedArea(ring) > 0; // in (x, z) with z down the plan
      for (let i = 0; i < ring.length; i++) {
        const [ax, az] = ring[i]!;
        const [bx, bz] = ring[(i + 1) % ring.length]!;
        // Outward normal of the outline (inward for holes → facing into the hole).
        let nx = bz - az;
        let nz = -(bx - ax);
        if (!ccw) {
          nx = -nx;
          nz = -nz;
        }
        if (ri > 0) {
          nx = -nx;
          nz = -nz;
        }
        this.quad(sideId, [ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], [nx, 0, nz]);
      }
    });
  }

  /** Vertical cylinder (open ends optional). */
  cylinder(
    id: MaterialId,
    cx: number,
    cz: number,
    r: number,
    y0: number,
    y1: number,
    seg = 10,
  ): void {
    for (let i = 0; i < seg; i++) {
      const a0 = (i / seg) * Math.PI * 2;
      const a1 = ((i + 1) / seg) * Math.PI * 2;
      const p0: V3 = [cx + Math.cos(a0) * r, y0, cz + Math.sin(a0) * r];
      const p1: V3 = [cx + Math.cos(a1) * r, y0, cz + Math.sin(a1) * r];
      const am = (a0 + a1) / 2;
      this.quad(
        id,
        p0,
        p1,
        [p1[0], y1, p1[2]],
        [p0[0], y1, p0[2]],
        [Math.cos(am), 0, Math.sin(am)],
      );
      this.tri(id, [cx, y1, cz], [p0[0], y1, p0[2]], [p1[0], y1, p1[2]], [0, 1, 0]);
    }
  }

  materials(): MaterialId[] {
    return [...this.buckets.keys()];
  }

  get triangleCount(): number {
    let n = 0;
    for (const b of this.buckets.values()) n += b.triangleCount;
    return n;
  }

  /** One non-indexed BufferGeometry per material (position, normal, uv). */
  toGeometries(): Map<MaterialId, THREE.BufferGeometry> {
    const out = new Map<MaterialId, THREE.BufferGeometry>();
    for (const [id, bucket] of this.buckets) {
      if (bucket.triangleCount === 0) continue;
      const extras = GEOMETRY_EXTRAS[id];
      out.set(
        id,
        trianglesToGeometry(bucket.positions, bucket.swapped, {
          shifted: extras?.uv2 ? bucket.shifted : undefined,
          shaded: extras?.color ? bucket.shaded : undefined,
        }),
      );
    }
    return out;
  }
}

export function ringSignedArea(ring: readonly (readonly [number, number])[]): number {
  let a = 0;
  for (let i = 0; i < ring.length; i++) {
    const p = ring[i]!;
    const q = ring[(i + 1) % ring.length]!;
    a += p[0] * q[1] - q[0] * p[1];
  }
  return a / 2;
}

/**
 * Flat normals + world-space box-projected UVs (1 unit = 1 m) for I4 tiling textures;
 * the triangles listed in `swapped` get u ↔ v. With `extras.shifted` (triples: triangle,
 * du, dv) a second set `uv2` = uv + offset is added, with `extras.shaded` (pairs:
 * triangle, value) a `color` attribute (1 where not shaded).
 */
export function trianglesToGeometry(
  positions: readonly number[],
  swapped: readonly number[] = [],
  extras: { shifted?: readonly number[]; shaded?: readonly number[] } = {},
): THREE.BufferGeometry {
  const n = positions.length / 3;
  const swap = new Uint8Array(n / 3);
  for (const t of swapped) swap[t] = 1;
  const uv2 = extras.shifted ? new Float32Array(n * 2) : null;
  const shift = new Float32Array(uv2 ? (n / 3) * 2 : 0);
  const shifted = extras.shifted ?? [];
  for (let i = 0; i + 2 < shifted.length; i += 3) {
    shift[shifted[i]! * 2] = shifted[i + 1]!;
    shift[shifted[i]! * 2 + 1] = shifted[i + 2]!;
  }
  const color = extras.shaded ? new Float32Array(n * 3).fill(1) : null;
  const shaded = extras.shaded ?? [];
  for (let i = 0; color && i + 1 < shaded.length; i += 2) {
    color.fill(shaded[i + 1]!, shaded[i]! * 9, shaded[i]! * 9 + 9);
  }
  const pos = new Float32Array(positions);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  for (let t = 0; t < n; t += 3) {
    const o = t * 3;
    _a.fromArray(pos, o);
    _b.fromArray(pos, o + 3).sub(_a);
    _c.fromArray(pos, o + 6).sub(_a);
    _n.crossVectors(_b, _c).normalize();
    const ax = Math.abs(_n.x);
    const ay = Math.abs(_n.y);
    const az = Math.abs(_n.z);
    for (let k = 0; k < 3; k++) {
      const v = t + k;
      nor[v * 3] = _n.x;
      nor[v * 3 + 1] = _n.y;
      nor[v * 3 + 2] = _n.z;
      const x = pos[v * 3] ?? 0;
      const y = pos[v * 3 + 1] ?? 0;
      const z = pos[v * 3 + 2] ?? 0;
      if (ay >= ax && ay >= az) {
        uv[v * 2] = x;
        uv[v * 2 + 1] = z;
      } else if (ax >= az) {
        uv[v * 2] = z;
        uv[v * 2 + 1] = y;
      } else {
        uv[v * 2] = x;
        uv[v * 2 + 1] = y;
      }
      if (swap[t / 3]) {
        const u0 = uv[v * 2]!;
        uv[v * 2] = uv[v * 2 + 1]!;
        uv[v * 2 + 1] = u0;
      }
      if (uv2) {
        uv2[v * 2] = uv[v * 2]! + shift[(t / 3) * 2]!;
        uv2[v * 2 + 1] = uv[v * 2 + 1]! + shift[(t / 3) * 2 + 1]!;
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (uv2) g.setAttribute('uv2', new THREE.BufferAttribute(uv2, 2));
  if (color) g.setAttribute('color', new THREE.BufferAttribute(color, 3));
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}
