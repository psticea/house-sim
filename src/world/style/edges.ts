/**
 * Feature-edge extraction for the sketch style.
 *
 * Like `THREE.EdgesGeometry(geometry, thresholdDeg)`, but robust to the merged,
 * non-indexed triangle soup our builders emit: coplanar pieces that meet at
 * T-junctions (e.g. wall strips around an opening, adjacent floor polygons) do not
 * share vertices, so EdgesGeometry would see their common edges as open boundaries
 * and draw stray lines across flat faces. Here every triangle edge is compared with
 * all collinear, overlapping edges (spatial hash, tolerance based), split at their
 * end points, and each piece only gets a line where a face ends without a smooth
 * (< threshold) continuation on the other side.
 */
import * as THREE from 'three';

const LINE_TOL = 1e-3; // m: max distance between "collinear" edges (float32 noise ≈ 1e-6)
const PARAM_EPS = 1e-4; // m: merge split points closer than this
const DIR_BIN = 0.01; // line-hash bin sizes (direction components / closest point in m)
const DIR_BAND = 0.002; // values this close to a bin border also go into the neighbour bin
const POINT_BIN = 0.05;
const POINT_BAND = 0.01;

interface Edge {
  face: number;
  a: THREE.Vector3;
  u: THREE.Vector3; // unit direction a → b
  len: number;
  side: THREE.Vector3; // unit, in the face plane, pointing from the edge into the face
}

const _ab = new THREE.Vector3();
const _ac = new THREE.Vector3();
const _p = new THREE.Vector3();

/** Returns line segments (pairs of xyz points) along the feature edges of `geometry`. */
export function extractFeatureEdges(
  geometry: THREE.BufferGeometry,
  thresholdDeg: number,
): Float32Array {
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const triCount = index ? index.count / 3 : pos.count / 3;
  const vi = (i: number): number => (index ? index.getX(i) : i);
  const cosThr = Math.cos(THREE.MathUtils.degToRad(thresholdDeg));

  const normals: THREE.Vector3[] = [];
  const edges: Edge[] = [];
  const v: THREE.Vector3[] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) v[k]!.fromBufferAttribute(pos, vi(t * 3 + k));
    _ab.subVectors(v[1]!, v[0]!);
    _ac.subVectors(v[2]!, v[0]!);
    const n = new THREE.Vector3().crossVectors(_ab, _ac);
    const area2 = n.length();
    if (area2 < 1e-9) continue; // degenerate
    n.divideScalar(area2);
    const face = normals.length;
    normals.push(n);
    for (let k = 0; k < 3; k++) {
      const a = v[k]!.clone();
      const b = v[(k + 1) % 3]!;
      const c = v[(k + 2) % 3]!;
      const u = new THREE.Vector3().subVectors(b, a);
      const len = u.length();
      if (len < PARAM_EPS) continue;
      u.divideScalar(len);
      const side = _p.subVectors(c, a);
      side.addScaledVector(u, -side.dot(u)).normalize();
      edges.push({ face, a, u, len, side: side.clone() });
    }
  }

  // Line hash: collinear edges share a bin keyed by the quantised line (canonical
  // direction + point closest to the origin). A value close to a bin border also goes
  // into the neighbouring bin, so two edges on the same line always meet somewhere.
  const bins = new Map<string, number[]>();
  const edgeBins = edges.map((e) => lineBins(e.a, e.u));
  edgeBins.forEach((keys, i) => {
    for (const key of keys) {
      const list = bins.get(key);
      if (list) list.push(i);
      else bins.set(key, [i]);
    }
  });

  const out: number[] = [];
  const seen = new Set<number>();
  const cand: { face: number; t0: number; t1: number; side: THREE.Vector3 }[] = [];
  edges.forEach((e, i) => {
    // Collinear, overlapping edges of other faces.
    seen.clear();
    cand.length = 0;
    for (const key of edgeBins[i]!) {
      for (const j of bins.get(key) ?? []) {
        if (j === i || seen.has(j)) continue;
        seen.add(j);
        const f = edges[j]!;
        if (f.face === e.face) continue;
        const cos = f.u.dot(e.u);
        if (Math.abs(cos) < 1 - 1e-6) continue;
        _p.subVectors(f.a, e.a);
        const ta = _p.dot(e.u);
        if (_p.addScaledVector(e.u, -ta).lengthSq() > LINE_TOL * LINE_TOL) continue;
        _p.subVectors(f.a, e.a).addScaledVector(f.u, f.len);
        const tb = _p.dot(e.u);
        if (_p.addScaledVector(e.u, -tb).lengthSq() > LINE_TOL * LINE_TOL) continue;
        const t0 = Math.max(0, Math.min(ta, tb));
        const t1 = Math.min(e.len, Math.max(ta, tb));
        if (t1 - t0 < PARAM_EPS) continue;
        cand.push({ face: f.face, t0, t1, side: f.side });
      }
    }
    const cuts = [0, e.len];
    for (const c of cand) cuts.push(c.t0, c.t1);
    cuts.sort((p, q) => p - q);
    let runStart = -1;
    let runEnd = -1;
    const flush = (): void => {
      if (runStart < 0) return;
      const a = e.a;
      out.push(
        a.x + e.u.x * runStart,
        a.y + e.u.y * runStart,
        a.z + e.u.z * runStart,
        a.x + e.u.x * runEnd,
        a.y + e.u.y * runEnd,
        a.z + e.u.z * runEnd,
      );
      runStart = -1;
    };
    let prev = cuts[0]!;
    for (let k = 1; k < cuts.length; k++) {
      const t = cuts[k]!;
      if (t - prev < PARAM_EPS) continue;
      const mid = (prev + t) / 2;
      const cover = [{ face: e.face, side: e.side }];
      for (const c of cand) if (c.t0 < mid && mid < c.t1) cover.push(c);
      // A face "needs" a line here when no other face continues it smoothly across the edge.
      let owner = -1;
      for (const g of cover) {
        const ng = normals[g.face]!;
        const smooth = cover.some(
          (h) => h !== g && h.side.dot(g.side) < 0 && normals[h.face]!.dot(ng) > cosThr,
        );
        if (!smooth && (owner < 0 || g.face < owner)) owner = g.face;
      }
      // Draw from exactly one face (the lowest id among those needing it) → no duplicates.
      if (owner === e.face) {
        if (runStart < 0) runStart = prev;
        runEnd = t;
      } else {
        flush();
      }
      prev = t;
    }
    flush();
  });
  return new Float32Array(out);
}

/** Hash bins of the infinite line through `a` along unit `u` (1 key, or a few near bin borders). */
function lineBins(a: THREE.Vector3, u: THREE.Vector3): string[] {
  // Canonical direction sign (u and -u describe the same line).
  const flip = Math.abs(u.x) > 1e-3 ? u.x < 0 : Math.abs(u.y) > 1e-3 ? u.y < 0 : u.z < 0;
  const s = flip ? -1 : 1;
  const t = a.dot(u);
  const vals = [
    [u.x * s, DIR_BIN, DIR_BAND],
    [u.y * s, DIR_BIN, DIR_BAND],
    [u.z * s, DIR_BIN, DIR_BAND],
    [a.x - u.x * t, POINT_BIN, POINT_BAND],
    [a.y - u.y * t, POINT_BIN, POINT_BAND],
    [a.z - u.z * t, POINT_BIN, POINT_BAND],
  ] as const;
  let keys = [''];
  for (const [v, bin, band] of vals) {
    const q = v / bin;
    const k = Math.floor(q);
    const opts = [k];
    if (q - k < band / bin) opts.push(k - 1);
    else if (k + 1 - q < band / bin) opts.push(k + 1);
    keys =
      opts.length === 1
        ? keys.map((p) => `${p}${k},`)
        : keys.flatMap((p) => opts.map((o) => `${p}${o},`));
  }
  return keys;
}

/** Deterministic value in [0, 1) from a point (independent of processing order). */
function hash01(x: number, y: number, z: number, seed: number): number {
  let h = seed | 0;
  for (const c of [x, y, z]) {
    h = Math.imul(h ^ Math.round(c * 1000), 0x9e3779b1);
    h ^= h >>> 15;
  }
  h = Math.imul(h ^ (h >>> 13), 0x85ebca6b);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Hand-drawn touch, applied once to line vertices only (never to fills): each segment
 * end overshoots along the segment by up to `fraction` × length, capped at `maxM`.
 * Overshoot only (no undershoot), so collinear pieces never open gaps, and line ends
 * stay on the edge's own line, so they are never pushed behind a surface.
 */
export function jitterSegments(
  segments: Float32Array,
  fraction: number,
  maxM: number,
  seed = 1,
): Float32Array {
  const out = new Float32Array(segments);
  if (fraction <= 0 || maxM <= 0) return out;
  const d = new THREE.Vector3();
  for (let o = 0; o < out.length; o += 6) {
    d.set(out[o + 3]! - out[o]!, out[o + 4]! - out[o + 1]!, out[o + 5]! - out[o + 2]!);
    const len = d.length();
    if (len < 1e-6) continue;
    d.divideScalar(len);
    const amp = Math.min(fraction * len, maxM);
    const ea = amp * hash01(out[o]!, out[o + 1]!, out[o + 2]!, seed);
    const eb = amp * hash01(out[o + 3]!, out[o + 4]!, out[o + 5]!, seed + 1);
    out[o] = out[o]! - d.x * ea;
    out[o + 1] = out[o + 1]! - d.y * ea;
    out[o + 2] = out[o + 2]! - d.z * ea;
    out[o + 3] = out[o + 3]! + d.x * eb;
    out[o + 4] = out[o + 4]! + d.y * eb;
    out[o + 5] = out[o + 5]! + d.z * eb;
  }
  return out;
}
