/**
 * Vegetation (I3 step 3.4, plan.md §6.4): solid low-poly plants merged per material — no
 * alpha-tested cards. Canopies are clusters of gently deformed icospheres (facets meet at
 * < 30°, so the stylised looks draw no stray lines inside them; their outline comes from
 * the silhouette hulls), trunks are 13-sided tapered tubes, grasses are thin two-sided
 * blades.
 */
import * as THREE from 'three';
import { rng } from '../data/clip';
import type { MaterialId, Polygon } from '../data/schema';
import { pointInPolygon } from '../data/geometry2d';
import { terrainHeight } from '../data/terrain';
import type { Shrub, Tree } from '../data/garden';
import type { MeshBuilder, TriangleBucket, V3 } from './meshBuilder';

type Rand = () => number;

const ICO = (() => {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const pos = g.getAttribute('position');
  const out: number[] = [];
  for (let i = 0; i < pos.count; i++) out.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  g.dispose();
  return out;
})();

/**
 * Deformed icosphere blob. The deformation depends only on the vertex direction, so the
 * surface stays closed; amplitude ≤ 0.1 keeps neighbouring facets within ~25°.
 */
export function blob(
  bucket: TriangleBucket,
  c: V3,
  r: V3,
  seed: number,
  opts: { amp?: number; flatBottom?: number } = {},
): void {
  const amp = opts.amp ?? 0.06;
  const flat = opts.flatBottom ?? 1;
  const s1 = (seed * 1.37) % 6.28;
  const s2 = (seed * 2.11) % 6.28;
  const s3 = (seed * 0.73) % 6.28;
  const pts: V3[] = [];
  for (let i = 0; i < ICO.length; i += 3) {
    const x = ICO[i]!;
    const y = ICO[i + 1]!;
    const z = ICO[i + 2]!;
    const k =
      1 + amp * (Math.sin(1.9 * x + s1) * Math.cos(1.6 * y + s2) + 0.6 * Math.sin(2.3 * z + s3));
    // Smooth squash of the lower half (−1 → −flat, no crease at the equator).
    const yy = y * ((1 + flat) / 2 + ((1 - flat) / 2) * y);
    pts.push([c[0] + x * r[0] * k, c[1] + yy * r[1] * k, c[2] + z * r[2] * k]);
  }
  for (let i = 0; i < pts.length; i += 3) bucket.tri(pts[i]!, pts[i + 1]!, pts[i + 2]!);
}

/** Open tapered tube from a (radius ra) to b (radius rb), 13 sides. */
export function tube(bucket: TriangleBucket, a: V3, b: V3, ra: number, rb: number, seg = 13): void {
  const axis = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]).normalize();
  const ref = Math.abs(axis.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
  const u = new THREE.Vector3().crossVectors(axis, ref).normalize();
  const v = new THREE.Vector3().crossVectors(axis, u).normalize();
  const ring = (p: V3, r: number, i: number): V3 => {
    const t = (i / seg) * Math.PI * 2;
    return [
      p[0] + (u.x * Math.cos(t) + v.x * Math.sin(t)) * r,
      p[1] + (u.y * Math.cos(t) + v.y * Math.sin(t)) * r,
      p[2] + (u.z * Math.cos(t) + v.z * Math.sin(t)) * r,
    ];
  };
  for (let i = 0; i < seg; i++) {
    const t = ((i + 0.5) / seg) * Math.PI * 2;
    const n: V3 = [
      u.x * Math.cos(t) + v.x * Math.sin(t),
      u.y * Math.cos(t) + v.y * Math.sin(t),
      u.z * Math.cos(t) + v.z * Math.sin(t),
    ];
    bucket.quad(ring(a, ra, i), ring(a, ra, i + 1), ring(b, rb, i + 1), ring(b, rb, i), n);
  }
}

/** Point at distance `len` from `a`, leaning `lean` rad from vertical toward azimuth `az`. */
const lean = (a: V3, len: number, leanRad: number, az: number): V3 => [
  a[0] + Math.sin(leanRad) * Math.cos(az) * len,
  a[1] + Math.cos(leanRad) * len,
  a[2] + Math.sin(leanRad) * Math.sin(az) * len,
];

function canopy(
  bucket: TriangleBucket,
  rand: Rand,
  center: V3,
  radius: V3,
  count: number,
  blobR: number,
  seed: number,
): void {
  // Central mass + satellites on an ellipsoid shell.
  blob(bucket, center, [radius[0] * 0.78, radius[1] * 0.78, radius[2] * 0.78], seed, {
    flatBottom: 0.8,
  });
  for (let k = 0; k < count; k++) {
    const az = (k / count) * Math.PI * 2 + rand() * 0.6;
    const el = (rand() - 0.35) * 1.1;
    const p: V3 = [
      center[0] + Math.cos(az) * Math.cos(el) * radius[0] * 0.55,
      center[1] + Math.sin(el) * radius[1] * 0.55,
      center[2] + Math.sin(az) * Math.cos(el) * radius[2] * 0.55,
    ];
    const r = blobR * (0.8 + rand() * 0.35);
    blob(bucket, p, [r, r * (0.8 + rand() * 0.25), r], seed + k * 17 + 5, { flatBottom: 0.85 });
  }
}

export function buildTree(mesh: MeshBuilder, t: Tree): void {
  const rand = rng(t.seed);
  const y0 = terrainHeight(t.x, t.z);
  const base: V3 = [t.x, y0 - 0.1, t.z];
  const bark = mesh.bucket('bark');
  const foliage = mesh.bucket('foliage');
  const light = mesh.bucket('foliageLight');
  switch (t.kind) {
    case 'birch': {
      // Clump of three slender silver birches, narrow airy canopies.
      const stems = [
        { az: 0.4, off: 0.22, h: 6.3, lean: 0.07 },
        { az: 2.5, off: 0.26, h: 5.4, lean: 0.12 },
        { az: 4.4, off: 0.2, h: 4.7, lean: 0.14 },
      ];
      const white = mesh.bucket('barkBirch');
      for (const [k, s] of stems.entries()) {
        const a: V3 = [t.x + Math.cos(s.az) * s.off, y0 - 0.1, t.z + Math.sin(s.az) * s.off];
        tube(white, a, lean(a, s.h * 0.92, s.lean, s.az), 0.085, 0.03);
        // Narrow, airy crown in a few stacked masses along the upper stem.
        const levels = [0.4, 0.56, 0.72, 0.87];
        const radii = [0.62, 0.82, 0.74, 0.46];
        levels.forEach((f, j) => {
          const on = lean(a, s.h * f, s.lean, s.az);
          const r = radii[j]! * (0.9 + rand() * 0.25) * (s.h / 6);
          const c: V3 = [on[0] + (rand() - 0.5) * 0.35, on[1], on[2] + (rand() - 0.5) * 0.35];
          blob(light, c, [r * 1.25, r * 1.2, r * 1.2], t.seed + k * 31 + j * 7, {
            flatBottom: 0.75,
          });
        });
      }
      break;
    }
    case 'serviceberry':
    case 'multistem': {
      const multi = t.kind === 'multistem';
      const n = multi ? 3 : 4;
      const len = multi ? 3.1 : 2.4;
      const crown: V3 = [t.x, y0 + (multi ? 3.9 : 3.0), t.z];
      for (let k = 0; k < n; k++) {
        const az = (k / n) * Math.PI * 2 + 0.5;
        const a: V3 = [t.x + Math.cos(az) * 0.12, y0 - 0.1, t.z + Math.sin(az) * 0.12];
        const b = lean(a, len, multi ? 0.2 : 0.26, az);
        tube(bark, a, b, multi ? 0.075 : 0.06, 0.035);
        // Short upper branch toward the crown.
        tube(bark, b, lean(b, 0.8, 0.5, az + 0.6), 0.035, 0.02);
      }
      canopy(
        foliage,
        rand,
        crown,
        multi ? [2.4, 1.5, 2.3] : [1.9, 1.35, 1.85],
        multi ? 7 : 6,
        multi ? 1.05 : 0.9,
        t.seed,
      );
      break;
    }
    case 'apple':
    case 'cherry': {
      const cherry = t.kind === 'cherry';
      const trunkH = cherry ? 1.7 : 1.2;
      const top: V3 = [t.x, y0 + trunkH, t.z];
      tube(bark, base, top, 0.13, 0.1);
      for (let k = 0; k < 3; k++) {
        const az = (k / 3) * Math.PI * 2 + 0.3;
        tube(bark, top, lean(top, 1.3, 0.6, az), 0.075, 0.035);
      }
      const crown: V3 = [t.x, y0 + trunkH + (cherry ? 1.7 : 1.35), t.z];
      canopy(foliage, rand, crown, cherry ? [1.9, 1.8, 1.9] : [2.0, 1.45, 2.0], 6, 0.95, t.seed);
      if (!cherry) {
        // A few apples on the outer canopy.
        const fruit = mesh.bucket('clay');
        for (let k = 0; k < 12; k++) {
          const az = rand() * Math.PI * 2;
          const el = (rand() - 0.6) * 0.9;
          const p: V3 = [
            crown[0] + Math.cos(az) * Math.cos(el) * 1.92,
            crown[1] + Math.sin(el) * 1.3,
            crown[2] + Math.sin(az) * Math.cos(el) * 1.92,
          ];
          blob(fruit, p, [0.055, 0.055, 0.055], k + 3, { amp: 0 });
        }
      }
      break;
    }
  }
}

export function buildShrub(mesh: MeshBuilder, s: Shrub): void {
  const rand = rng(s.seed);
  const y0 = terrainHeight(s.x, s.z);
  const b = mesh.bucket('foliage');
  const n = 3;
  for (let k = 0; k < n; k++) {
    const az = (k / n) * Math.PI * 2 + rand();
    const off = s.r * 0.35;
    const r = s.r * (0.62 + rand() * 0.14);
    blob(
      b,
      // Squashed bottom (0.6 · 0.85 r below the centre) sunk slightly into the ground.
      [s.x + Math.cos(az) * off, y0 + r * 0.85 * 0.6 - 0.04, s.z + Math.sin(az) * off],
      [r, r * 0.85, r],
      s.seed * 7 + k,
      { flatBottom: 0.6 },
    );
  }
  blob(b, [s.x, y0 + s.r * 0.8, s.z], [s.r * 0.55, s.r * 0.5, s.r * 0.55], s.seed + 99);
}

/** Olive tree for a clay pot: gnarled trunk, silver canopy. `y0` = soil level. */
export function buildOlive(
  mesh: MeshBuilder,
  x: number,
  y0: number,
  z: number,
  seed: number,
): void {
  const rand = rng(seed);
  const bark = mesh.bucket('bark');
  const a: V3 = [x, y0 - 0.05, z];
  const mid = lean(a, 0.7, 0.18, seed);
  const top = lean(mid, 0.6, 0.22, seed + 2.2);
  tube(bark, a, mid, 0.06, 0.05);
  tube(bark, mid, top, 0.05, 0.035);
  canopy(
    mesh.bucket('foliageLight'),
    rand,
    [top[0], top[1] + 0.25, top[2]],
    [0.62, 0.45, 0.6],
    4,
    0.34,
    seed,
  );
}

/** Tuft of two-sided grass blades (and sometimes a flower) standing on the ground. */
export function tuft(
  mesh: MeshBuilder,
  rand: Rand,
  x: number,
  y: number,
  z: number,
  size: number,
  flowerChance: number,
  bladeId: MaterialId = 'meadow',
): void {
  const blades = mesh.bucket(bladeId);
  const n = 5;
  for (let k = 0; k < n; k++) {
    const az = (k / n) * Math.PI * 2 + rand() * 1.2;
    const h = size * (0.55 + rand() * 0.55);
    const leanOut = 0.12 + rand() * 0.25;
    const bx = x + Math.cos(az) * 0.03;
    const bz = z + Math.sin(az) * 0.03;
    const w = 0.028;
    const px = -Math.sin(az) * w;
    const pz = Math.cos(az) * w;
    const tip: V3 = [bx + Math.cos(az) * h * leanOut, y + h, bz + Math.sin(az) * h * leanOut];
    const l: V3 = [bx - px, y - 0.02, bz - pz];
    const r: V3 = [bx + px, y - 0.02, bz + pz];
    blades.tri(l, r, tip);
    blades.tri(r, l, tip);
  }
  if (rand() < flowerChance) {
    const h = size * (0.7 + rand() * 0.5);
    const fx = x + (rand() - 0.5) * 0.1;
    const fz = z + (rand() - 0.5) * 0.1;
    const stemW = 0.008;
    blades.tri([fx - stemW, y, fz], [fx + stemW, y, fz], [fx, y + h, fz]);
    blades.tri([fx + stemW, y, fz], [fx - stemW, y, fz], [fx, y + h, fz]);
    // Small faceted head (octahedron).
    const f = mesh.bucket('flowers');
    const s = 0.035 + rand() * 0.02;
    const c: V3 = [fx, y + h, fz];
    const px: V3 = [c[0] + s, c[1], c[2]];
    const nx: V3 = [c[0] - s, c[1], c[2]];
    const pz: V3 = [c[0], c[1], c[2] + s];
    const nz: V3 = [c[0], c[1], c[2] - s];
    const up: V3 = [c[0], c[1] + s * 0.8, c[2]];
    const dn: V3 = [c[0], c[1] - s * 0.8, c[2]];
    for (const [a, b] of [
      [px, pz],
      [pz, nx],
      [nx, nz],
      [nz, px],
    ] as const) {
      f.tri(a, b, up, [(a[0] + b[0]) / 2 - c[0], s, (a[2] + b[2]) / 2 - c[2]]);
      f.tri(b, a, dn, [(a[0] + b[0]) / 2 - c[0], -s, (a[2] + b[2]) / 2 - c[2]]);
    }
  }
}

/**
 * Meadow planting inside `poly`: jittered grid of tufts (spacing m), skipping points
 * within `keepOut` circles (tree trunks, shrubs, features).
 */
export function meadow(
  mesh: MeshBuilder,
  poly: Polygon,
  seed: number,
  spacing: number,
  size: number,
  flowerChance: number,
  keepOut: readonly { x: number; z: number; r: number }[],
): number {
  const rand = rng(seed);
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  let n = 0;
  for (let z = minZ + spacing / 2; z < maxZ; z += spacing) {
    for (let x = minX + spacing / 2; x < maxX; x += spacing) {
      const px = x + (rand() - 0.5) * spacing * 0.8;
      const pz = z + (rand() - 0.5) * spacing * 0.8;
      if (!pointInPolygon(px, pz, poly)) continue;
      if (keepOut.some((k) => Math.hypot(px - k.x, pz - k.z) < k.r)) continue;
      tuft(mesh, rand, px, terrainHeight(px, pz), pz, size * (0.8 + rand() * 0.4), flowerChance);
      n++;
    }
  }
  return n;
}
