/**
 * Inverted-hull silhouettes for curved meshes (Borderlands style). Only the "curved"
 * triangles of a merged mesh are used — faces whose neighbours meet them at a soft
 * crease (between ~1° and `maxCreaseDeg`, e.g. the facets of a cylinder) — so flat
 * architecture (outlined by feature-edge lines) costs nothing extra. The hull is drawn
 * back faces only, pushed out along averaged normals in clip space for a constant
 * pixel width.
 */
import * as THREE from 'three';

const WELD = 1e4; // position quantisation: 0.1 mm
const FLAT_COS = Math.cos(THREE.MathUtils.degToRad(1));

/** Hull geometry (position + averaged `normal`) of the curved part, or `null` if none. */
export function curvedHullGeometry(
  geometry: THREE.BufferGeometry,
  maxCreaseDeg: number,
): THREE.BufferGeometry | null {
  const pos = geometry.getAttribute('position');
  const index = geometry.getIndex();
  const triCount = index ? index.count / 3 : pos.count / 3;
  const vi = (i: number): number => (index ? index.getX(i) : i);
  const cosMax = Math.cos(THREE.MathUtils.degToRad(maxCreaseDeg));

  const ids = new Map<string, number>();
  const points: THREE.Vector3[] = [];
  const tris: [number, number, number][] = [];
  const normals: THREE.Vector3[] = [];
  const areas: number[] = [];
  const p = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const tri: number[] = [];
    for (let k = 0; k < 3; k++) {
      p.fromBufferAttribute(pos, vi(t * 3 + k));
      const key = `${Math.round(p.x * WELD)},${Math.round(p.y * WELD)},${Math.round(p.z * WELD)}`;
      let id = ids.get(key);
      if (id === undefined) {
        id = points.length;
        ids.set(key, id);
        points.push(p.clone());
      }
      tri.push(id);
    }
    const [a, b, c] = tri as [number, number, number];
    if (a === b || b === c || a === c) continue;
    ab.subVectors(points[b]!, points[a]!);
    ac.subVectors(points[c]!, points[a]!);
    const n = new THREE.Vector3().crossVectors(ab, ac);
    const area = n.length();
    if (area < 1e-9) continue;
    tris.push([a, b, c]);
    normals.push(n.divideScalar(area));
    areas.push(area);
  }

  // Shared edges → soft creases mark both faces as curved.
  const byEdge = new Map<string, number[]>();
  tris.forEach((tri, f) => {
    for (let k = 0; k < 3; k++) {
      const u = tri[k]!;
      const v = tri[(k + 1) % 3]!;
      const key = u < v ? `${u}_${v}` : `${v}_${u}`;
      const list = byEdge.get(key);
      if (list) list.push(f);
      else byEdge.set(key, [f]);
    }
  });
  // Facets = coplanar, edge-connected triangles (e.g. the two triangles of a quad).
  const parent = tris.map((_, f) => f);
  const find = (f: number): number => {
    while (parent[f] !== f) f = parent[f] = parent[parent[f]!]!;
    return f;
  };
  for (const faces of byEdge.values()) {
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        if (normals[faces[i]!]!.dot(normals[faces[j]!]!) >= FLAT_COS) {
          parent[find(faces[i]!)] = find(faces[j]!);
        }
      }
    }
  }
  // A facet is curved when it meets ≥ 2 other facets at soft creases (a cylinder facet
  // has one on each side; a single sloped face next to flat ones does not count).
  const soft = new Map<number, Set<number>>();
  for (const faces of byEdge.values()) {
    for (let i = 0; i < faces.length; i++) {
      for (let j = i + 1; j < faces.length; j++) {
        const d = normals[faces[i]!]!.dot(normals[faces[j]!]!);
        if (d < FLAT_COS && d > cosMax) {
          const a = find(faces[i]!);
          const b = find(faces[j]!);
          if (!soft.has(a)) soft.set(a, new Set());
          if (!soft.has(b)) soft.set(b, new Set());
          soft.get(a)!.add(b);
          soft.get(b)!.add(a);
        }
      }
    }
  }
  const curved = new Uint8Array(tris.length);
  tris.forEach((_, f) => {
    if ((soft.get(find(f))?.size ?? 0) >= 2) curved[f] = 1;
  });
  const faces = tris.map((_, f) => f).filter((f) => curved[f] === 1);
  if (faces.length === 0) return null;

  // Area-weighted average normal per welded vertex, over curved faces only.
  const avg = new Map<number, THREE.Vector3>();
  for (const f of faces) {
    for (const v of tris[f]!) {
      const n = avg.get(v) ?? new THREE.Vector3();
      n.addScaledVector(normals[f]!, areas[f]!);
      avg.set(v, n);
    }
  }
  for (const n of avg.values()) n.normalize();
  const position = new Float32Array(faces.length * 9);
  const normal = new Float32Array(faces.length * 9);
  faces.forEach((f, i) => {
    tris[f]!.forEach((v, k) => {
      points[v]!.toArray(position, i * 9 + k * 3);
      avg.get(v)!.toArray(normal, i * 9 + k * 3);
    });
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(position, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  g.computeBoundingSphere();
  if (g.boundingSphere) g.boundingSphere.radius += 0.05;
  return g;
}

/** Unlit ink material for hulls: back faces, pushed out by `width` CSS px in clip space. */
export function createHullMaterial(color: THREE.ColorRepresentation, width: number) {
  const mat = new THREE.ShaderMaterial({
    name: 'style-hull',
    side: THREE.BackSide,
    uniforms: {
      color: { value: new THREE.Color(color) },
      width: { value: width },
      resolution: { value: new THREE.Vector2(1024, 768) },
    },
    vertexShader: /* glsl */ `
      uniform float width;
      uniform vec2 resolution;
      void main() {
        vec4 clip = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        vec3 n = normalize(normalMatrix * normal);
        vec2 dir = (projectionMatrix * vec4(n, 0.0)).xy;
        float len = length(dir);
        dir = len > 1e-5 ? dir / len : vec2(0.0);
        clip.xy += dir * (2.0 * width / resolution) * clip.w;
        gl_Position = clip;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 color;
      void main() {
        gl_FragColor = vec4(color, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  return mat;
}
