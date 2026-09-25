/** Main stair massing (I1: visual + blockers; walkable stairs come in I2). */
import type { Stairs } from '../data/schema';
import type { MeshBuilder, V3 } from './meshBuilder';

export function buildStairs(
  mesh: MeshBuilder,
  collider: MeshBuilder,
  st: Stairs,
  floorY: number,
): void {
  const rise = st.riserHeight;
  for (const f of st.flights) {
    for (let k = 0; k < f.treads; k++) {
      const riser = f.firstRiser + k;
      const top = floorY + riser * rise;
      const z0 = f.direction === '+z' ? f.z[0] + k * f.going : f.z[1] - (k + 1) * f.going;
      const z1 = z0 + f.going;
      // First flight is solid down to the floor; the upper flight is a 20 cm tread slab.
      const bottom = f.firstRiser === 1 ? floorY : top - 0.2;
      mesh.box('oak', [f.x[0], bottom, z0], [f.x[1], top, z1], {
        bottom: f.firstRiser === 1 ? null : 'plaster',
      });
      if (f.firstRiser === 1) collider.box('concrete', [f.x[0], bottom, z0], [f.x[1], top, z1]);
    }
  }
  for (const l of st.landings) {
    const top = floorY + l.riser * rise;
    mesh.box('oak', [l.x[0], floorY, l.z[0]], [l.x[1], top, l.z[1]], { bottom: null });
  }
  for (const b of st.blockers) collider.box('concrete', b.min, b.max);

  // Rod balustrade (Ø 1 cm, black) along the first flight + landing, handrail at 90 cm.
  const r = st.railing;
  if (!r) return;
  const flight = st.flights[0]!;
  const landing = st.landings[0];
  const surface = (z: number): number => {
    if (landing && z >= landing.z[0]) return floorY + landing.riser * rise;
    const k = Math.floor((z - flight.z[0]) / flight.going);
    return floorY + Math.max(0, Math.min(flight.treads, k + 1)) * rise;
  };
  const step = 0.1;
  for (let z = r.z[0]; z <= r.z[1] + 1e-6; z += step) {
    const y0 = surface(z);
    mesh.box('metalBlack', [r.x - 0.005, y0, z - 0.005], [r.x + 0.005, y0 + 0.9, z + 0.005], {
      bottom: null,
    });
  }
  // Handrail as straight pieces between rod tops.
  const pts: V3[] = [];
  for (let z = r.z[0]; z <= r.z[1] + 1e-6; z += step * 4) pts.push([r.x, surface(z) + 0.9, z]);
  pts.push([r.x, surface(r.z[1]) + 0.9, r.z[1]]);
  for (let i = 0; i + 1 < pts.length; i++) rail(mesh, pts[i]!, pts[i + 1]!);
}

function rail(mesh: MeshBuilder, a: V3, b: V3): void {
  const d: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len = Math.hypot(...d);
  if (len < 1e-6) return;
  const ax: V3 = [d[0] / len, d[1] / len, d[2] / len];
  const az: V3 = [1, 0, 0];
  // ay = az × ax
  const ay: V3 = [
    az[1] * ax[2] - az[2] * ax[1],
    az[2] * ax[0] - az[0] * ax[2],
    az[0] * ax[1] - az[1] * ax[0],
  ];
  mesh.orientedBox(
    'metalBlack',
    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    ax,
    ay,
    az,
    [len / 2 + 0.01, 0.02, 0.02],
  );
}
