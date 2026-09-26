/**
 * Lightmap UV2 unwrap (plan.md §4.1 step 2, I6 step 6.1) — own chart builder + packer
 * instead of xatlas: every mesh of the scene is a flat-shaded triangle soup made of
 * planar architectural faces and small near-planar facets (furniture), so charts are
 * grown over welded edges while the triangle normals stay inside a cone around the seed
 * normal, projected onto their mean plane, turned to their minimum-area bounding
 * rectangle and packed (skyline, bottom-left) into `atlases` square atlases with
 * `padding` texels on every side. Pure, deterministic TypeScript (no WASM; runs in Node
 * for the tests and in the browser for the baker). One mesh maps to one atlas (one
 * `lightMap` per material → no extra draw calls).
 */

export interface UnwrapMesh {
  id: string;
  /** Non-indexed triangle soup: xyz per vertex, 3 vertices per triangle. */
  positions: ArrayLike<number>;
}

export interface UnwrapOptions {
  atlasSize: number;
  atlases: number;
  /** Empty texels around every chart (per side). */
  padding: number;
  /** World size of one lightmap texel (m) for a chart of `mesh` (centroid, longest side). */
  texelSize: (mesh: string, centroid: readonly [number, number, number], extentM: number) => number;
  /** Max angle between a triangle normal and its chart's seed normal (default 30°). */
  coneDeg?: number;
}

export interface UnwrapResultMesh {
  id: string;
  atlas: number;
  /** uv2 per vertex (u, v in [0, 1]). */
  uv: Float32Array;
  charts: number;
}

export interface PackedChart {
  mesh: number;
  atlas: number;
  /** Rectangle incl. padding (texels). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Triangles of the chart (indices into the mesh). */
  tris: readonly number[];
  /** World size of a texel of this chart (m). */
  texel: number;
}

export interface UnwrapResult {
  meshes: UnwrapResultMesh[];
  charts: PackedChart[];
  /** Density multiplier that made everything fit (1 = the requested texel sizes). */
  scale: number;
  /** Fraction of each atlas covered by chart rectangles (incl. padding). */
  fill: number[];
}

interface Chart {
  tris: number[];
  /** 2D coordinates (m) per triangle vertex, in chart-local rotated axes. */
  coords: Float64Array;
  minX: number;
  minY: number;
  sizeX: number;
  sizeY: number;
  texel: number;
}

const QUANT = 1e4;
const DEGENERATE = 1e-12;

/** Welded vertex ids per triangle corner (positions quantised to 0.1 mm). */
function weld(p: ArrayLike<number>): Int32Array {
  const n = p.length / 3;
  const ids = new Int32Array(n);
  const map = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    const k = `${Math.round(p[i * 3]! * QUANT)},${Math.round(p[i * 3 + 1]! * QUANT)},${Math.round(p[i * 3 + 2]! * QUANT)}`;
    let id = map.get(k);
    if (id === undefined) {
      id = map.size;
      map.set(k, id);
    }
    ids[i] = id;
  }
  return ids;
}

/** Triangle adjacency over welded edges (CSR arrays). */
function adjacency(ids: Int32Array, triCount: number): { start: Int32Array; list: Int32Array } {
  const edges = new Map<number, number[]>();
  let maxId = 0;
  for (let i = 0; i < ids.length; i++) maxId = Math.max(maxId, ids[i]!);
  const N = maxId + 1;
  for (let t = 0; t < triCount; t++) {
    for (let e = 0; e < 3; e++) {
      const a = ids[t * 3 + e]!;
      const b = ids[t * 3 + ((e + 1) % 3)]!;
      if (a === b) continue;
      const key = a < b ? a * N + b : b * N + a;
      const l = edges.get(key);
      if (l) l.push(t);
      else edges.set(key, [t]);
    }
  }
  const start = new Int32Array(triCount + 1);
  for (const l of edges.values()) {
    if (l.length < 2) continue;
    for (const t of l) start[t + 1]! += l.length - 1;
  }
  for (let t = 0; t < triCount; t++) start[t + 1]! += start[t]!;
  const list = new Int32Array(start[triCount]!);
  const fill = start.slice(0, triCount);
  for (const l of edges.values()) {
    if (l.length < 2) continue;
    for (const t of l) for (const u of l) if (u !== t) list[fill[t]!++] = u;
  }
  return { start, list };
}

type P2 = [number, number];

function convexHull(pts: P2[]): P2[] {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: P2, a: P2, b: P2): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: P2[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, q) <= 0)
      lower.pop();
    lower.push(q);
  }
  const upper: P2[] = [];
  for (let i = p.length - 1; i >= 0; i--) {
    const q = p[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, q) <= 0)
      upper.pop();
    upper.push(q);
  }
  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

/** Builds the charts of one mesh (grown, projected, rotated to the min-area rectangle). */
function buildCharts(id: string, p: ArrayLike<number>, opts: UnwrapOptions): Chart[] {
  const triCount = p.length / 9;
  const adj = adjacency(weld(p), triCount);
  const nrm = new Float64Array(triCount * 3);
  const area = new Float64Array(triCount);
  for (let t = 0; t < triCount; t++) {
    const o = t * 9;
    const ux = p[o + 3]! - p[o]!;
    const uy = p[o + 4]! - p[o + 1]!;
    const uz = p[o + 5]! - p[o + 2]!;
    const vx = p[o + 6]! - p[o]!;
    const vy = p[o + 7]! - p[o + 1]!;
    const vz = p[o + 8]! - p[o + 2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz);
    area[t] = l / 2;
    if (l > 0) {
      nrm[t * 3] = nx / l;
      nrm[t * 3 + 1] = ny / l;
      nrm[t * 3 + 2] = nz / l;
    }
  }
  const cosCone = Math.cos(((opts.coneDeg ?? 30) * Math.PI) / 180);
  const chartOf = new Int32Array(triCount).fill(-1);
  const charts: Chart[] = [];
  const queue: number[] = [];
  for (let seed = 0; seed < triCount; seed++) {
    if (chartOf[seed] !== -1) continue;
    const ci = charts.length;
    const tris: number[] = [seed];
    chartOf[seed] = ci;
    const sx = nrm[seed * 3]!;
    const sy = nrm[seed * 3 + 1]!;
    const sz = nrm[seed * 3 + 2]!;
    if (area[seed]! > DEGENERATE) {
      queue.length = 0;
      queue.push(seed);
      for (let qi = 0; qi < queue.length; qi++) {
        const t = queue[qi]!;
        for (let k = adj.start[t]!; k < adj.start[t + 1]!; k++) {
          const u = adj.list[k]!;
          if (chartOf[u] !== -1 || area[u]! <= DEGENERATE) continue;
          if (nrm[u * 3]! * sx + nrm[u * 3 + 1]! * sy + nrm[u * 3 + 2]! * sz < cosCone) continue;
          chartOf[u] = ci;
          tris.push(u);
          queue.push(u);
        }
      }
    }
    // Mean plane (area-weighted normal) and a stable in-plane basis.
    let mx = 0;
    let my = 0;
    let mz = 0;
    let cx = 0;
    let cy = 0;
    let cz = 0;
    let at = 0;
    for (const t of tris) {
      const a = area[t]!;
      mx += nrm[t * 3]! * a;
      my += nrm[t * 3 + 1]! * a;
      mz += nrm[t * 3 + 2]! * a;
      for (let v = 0; v < 3; v++) {
        cx += (p[t * 9 + v * 3]! * a) / 3;
        cy += (p[t * 9 + v * 3 + 1]! * a) / 3;
        cz += (p[t * 9 + v * 3 + 2]! * a) / 3;
      }
      at += a;
    }
    const ml = Math.hypot(mx, my, mz);
    if (ml < 1e-12) {
      mx = 0;
      my = 1;
      mz = 0;
    } else {
      mx /= ml;
      my /= ml;
      mz /= ml;
    }
    if (at > 0) {
      cx /= at;
      cy /= at;
      cz /= at;
    } else {
      cx = p[seed * 9]!;
      cy = p[seed * 9 + 1]!;
      cz = p[seed * 9 + 2]!;
    }
    // U: world x projected for floors / ceilings, horizontal tangent otherwise.
    let ux: number;
    let uy: number;
    let uz: number;
    if (Math.abs(my) > 0.9) {
      ux = 1 - mx * mx;
      uy = -mx * my;
      uz = -mx * mz;
    } else {
      ux = mz;
      uy = 0;
      uz = -mx;
    }
    const ul = Math.hypot(ux, uy, uz);
    ux /= ul;
    uy /= ul;
    uz /= ul;
    const vx = my * uz - mz * uy;
    const vy = mz * ux - mx * uz;
    const vz = mx * uy - my * ux;
    const coords = new Float64Array(tris.length * 6);
    const pts: P2[] = [];
    for (let i = 0; i < tris.length; i++) {
      const o = tris[i]! * 9;
      for (let v = 0; v < 3; v++) {
        const x = p[o + v * 3]! - cx;
        const y = p[o + v * 3 + 1]! - cy;
        const z = p[o + v * 3 + 2]! - cz;
        const s = x * ux + y * uy + z * uz;
        const q = x * vx + y * vy + z * vz;
        coords[i * 6 + v * 2] = s;
        coords[i * 6 + v * 2 + 1] = q;
        pts.push([s, q]);
      }
    }
    // Minimum-area bounding rectangle: one of the hull edge directions (or the basis).
    const hull = convexHull(pts);
    let best = { area: Infinity, c: 1, s: 0 };
    const tryDir = (c: number, s: number): void => {
      let x0 = Infinity;
      let x1 = -Infinity;
      let y0 = Infinity;
      let y1 = -Infinity;
      for (const [a, b] of hull) {
        const x = a * c + b * s;
        const y = -a * s + b * c;
        x0 = Math.min(x0, x);
        x1 = Math.max(x1, x);
        y0 = Math.min(y0, y);
        y1 = Math.max(y1, y);
      }
      const ar = (x1 - x0) * (y1 - y0);
      // Keep the world-aligned basis unless an edge direction is clearly tighter.
      if (ar < best.area * 0.98 - 1e-12) best = { area: ar, c, s };
    };
    tryDir(1, 0);
    for (let i = 0; i < hull.length; i++) {
      const a = hull[i]!;
      const b = hull[(i + 1) % hull.length]!;
      const l = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (l > 1e-6) tryDir((b[0] - a[0]) / l, (b[1] - a[1]) / l);
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < coords.length; i += 2) {
      const a = coords[i]!;
      const b = coords[i + 1]!;
      const x = a * best.c + b * best.s;
      const y = -a * best.s + b * best.c;
      coords[i] = x;
      coords[i + 1] = y;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
    // Landscape orientation (w ≥ h) packs better in the skyline.
    if (maxY - minY > maxX - minX) {
      for (let i = 0; i < coords.length; i += 2) {
        const x = coords[i]!;
        coords[i] = coords[i + 1]!;
        coords[i + 1] = -x;
      }
      [minX, maxX, minY, maxY] = [minY, maxY, -maxX, -minX];
    }
    charts.push({
      tris,
      coords,
      minX,
      minY,
      sizeX: maxX - minX,
      sizeY: maxY - minY,
      texel: opts.texelSize(id, [cx, cy, cz], Math.max(maxX - minX, maxY - minY)),
    });
  }
  return charts;
}

/** Rectangle size (texels, even, incl. padding) and texel size of a chart at `scale`. */
function rectOf(c: Chart, scale: number, opts: UnwrapOptions): [number, number, number] {
  const maxInner = opts.atlasSize - 2 * opts.padding - 2;
  let t = c.texel / scale;
  const longest = Math.max(c.sizeX, c.sizeY);
  if (longest / t > maxInner) t = longest / maxInner;
  const even = (v: number): number => Math.ceil(v / 2) * 2;
  const w = even(Math.ceil(c.sizeX / t) + 1 + 2 * opts.padding);
  const h = even(Math.ceil(c.sizeY / t) + 1 + 2 * opts.padding);
  return [w, h, t];
}

/**
 * Skyline bottom-left packer: each rect goes where its top ends lowest (ties: least
 * wasted area under it, then leftmost). Returns positions, or `null` if one doesn't fit.
 */
export function packSkyline(
  rects: readonly (readonly [number, number])[],
  size: number,
): [number, number][] | null {
  let segs: { x: number; y: number; w: number }[] = [{ x: 0, y: 0, w: size }];
  const out: [number, number][] = [];
  for (const [w, h] of rects) {
    let bestTop = Infinity;
    let bestWaste = Infinity;
    let bestI = -1;
    let bestY = 0;
    for (let i = 0; i < segs.length; i++) {
      const x = segs[i]!.x;
      if (x + w > size) break;
      let y = 0;
      let rem = w;
      for (let j = i; rem > 0 && j < segs.length; j++) {
        y = Math.max(y, segs[j]!.y);
        rem -= segs[j]!.w;
      }
      const top = y + h;
      if (top > size || top > bestTop) continue;
      let waste = 0;
      let rem2 = w;
      for (let k = i; rem2 > 0 && k < segs.length; k++) {
        const sw = Math.min(segs[k]!.w, rem2);
        waste += (y - segs[k]!.y) * sw;
        rem2 -= sw;
      }
      if (top < bestTop || waste < bestWaste) {
        bestTop = top;
        bestWaste = waste;
        bestI = i;
        bestY = y;
      }
    }
    if (bestI < 0) return null;
    const x0 = segs[bestI]!.x;
    out.push([x0, bestY]);
    const end = x0 + w;
    const next = segs.slice(0, bestI);
    next.push({ x: x0, y: bestTop, w });
    for (let k = bestI; k < segs.length; k++) {
      const s = segs[k]!;
      const sEnd = s.x + s.w;
      if (sEnd <= end) continue;
      next.push(s.x < end ? { x: end, y: s.y, w: sEnd - end } : s);
    }
    segs = [];
    for (const s of next) {
      const last = segs[segs.length - 1];
      if (last && last.y === s.y) last.w += s.w;
      else segs.push({ ...s });
    }
  }
  return out;
}

/**
 * Unwraps and packs `meshes`. Meshes are spread over the atlases by texel area (largest
 * first, into the least-filled atlas); if something does not fit, every density is
 * lowered by 8 % and packing restarts.
 */
export function unwrap(meshes: readonly UnwrapMesh[], opts: UnwrapOptions): UnwrapResult {
  const perMesh = meshes.map((m) => buildCharts(m.id, m.positions, opts));
  const S = opts.atlasSize;
  let scale = 1;
  for (let attempt = 0; attempt < 60; attempt++, scale *= 0.92) {
    const rects = perMesh.map((cs) => cs.map((c) => rectOf(c, scale, opts)));
    const load = new Array<number>(opts.atlases).fill(0);
    const order = meshes
      .map((_, i) => ({ i, a: rects[i]!.reduce((s, r) => s + r[0] * r[1], 0) }))
      .sort((a, b) => b.a - a.a || a.i - b.i);
    const atlasOf = new Array<number>(meshes.length).fill(0);
    for (const { i, a } of order) {
      let k = 0;
      for (let j = 1; j < opts.atlases; j++) if (load[j]! < load[k]!) k = j;
      atlasOf[i] = k;
      load[k]! += a;
    }
    if (load.some((l) => l > S * S * 0.95)) continue;
    const placed: { mesh: number; chart: number; x: number; y: number }[] = [];
    let ok = true;
    for (let k = 0; k < opts.atlases && ok; k++) {
      const items: { mesh: number; chart: number; w: number; h: number }[] = [];
      perMesh.forEach((cs, mi) => {
        if (atlasOf[mi] !== k) return;
        cs.forEach((_, ci) => {
          const [w, h] = rects[mi]![ci]!;
          items.push({ mesh: mi, chart: ci, w, h });
        });
      });
      items.sort((a, b) => b.h - a.h || b.w - a.w || a.mesh - b.mesh || a.chart - b.chart);
      const pos = packSkyline(
        items.map((it) => [it.w, it.h] as const),
        S,
      );
      if (!pos) ok = false;
      else items.forEach((it, n) => placed.push({ ...it, x: pos[n]![0], y: pos[n]![1] }));
    }
    if (!ok) continue;
    const out: UnwrapResultMesh[] = meshes.map((m, i) => ({
      id: m.id,
      atlas: atlasOf[i]!,
      uv: new Float32Array((m.positions.length / 3) * 2),
      charts: perMesh[i]!.length,
    }));
    const charts: PackedChart[] = [];
    const fill = new Array<number>(opts.atlases).fill(0);
    for (const pl of placed) {
      const c = perMesh[pl.mesh]![pl.chart]!;
      const [w, h, t] = rects[pl.mesh]![pl.chart]!;
      const uv = out[pl.mesh]!.uv;
      const ox = pl.x + opts.padding + 0.5;
      const oy = pl.y + opts.padding + 0.5;
      for (let i = 0; i < c.tris.length; i++) {
        const tri = c.tris[i]!;
        for (let v = 0; v < 3; v++) {
          uv[(tri * 3 + v) * 2] = ((c.coords[i * 6 + v * 2]! - c.minX) / t + ox) / S;
          uv[(tri * 3 + v) * 2 + 1] = ((c.coords[i * 6 + v * 2 + 1]! - c.minY) / t + oy) / S;
        }
      }
      const atlas = atlasOf[pl.mesh]!;
      charts.push({ mesh: pl.mesh, atlas, x: pl.x, y: pl.y, w, h, tris: c.tris, texel: t });
      fill[atlas]! += (w * h) / (S * S);
    }
    return { meshes: out, charts, scale, fill };
  }
  throw new Error('Lightmap unwrap: charts do not fit the atlases');
}

/** uv2 → 16-bit normalised integers (the stored and uploaded format). */
export function quantizeUv(uv: ArrayLike<number>): Uint16Array {
  const q = new Uint16Array(uv.length);
  for (let i = 0; i < uv.length; i++) q[i] = Math.round(Math.min(1, Math.max(0, uv[i]!)) * 65535);
  return q;
}
