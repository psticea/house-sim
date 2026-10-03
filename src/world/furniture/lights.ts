/**
 * Ceiling-light fittings (`src/data/lights.ts`): opal flush drums with a brass band
 * and paper / linen globes on a black cord with a brass rose. Built with the furniture
 * kit into the shared furniture materials (no new draw calls).
 */
import { FLUSH, PENDANT, diffuserY, type CeilingLight } from '../../data/lights';
import type { MeshBuilder } from '../meshBuilder';
import { Frame } from './kit';

/** Triangle material of the glowing part (the baker finds the diffuser triangles in it). */
export const DIFFUSER_MATERIAL = { flush: 'ceramic', pendant: 'linen' } as const;

export function buildCeilingLight(mesh: MeshBuilder, l: CeilingLight): void {
  const f = new Frame(mesh, l.at[0], 0, l.at[1], 0);
  if (l.kind === 'flush') {
    // Open at the top: the ceiling closes it (no slot between fitting and ceiling).
    // Profiles run upward (outward-facing sides); the cap at the start is the bottom.
    const top = l.ceilingY - FLUSH.band;
    const R = l.radius;
    f.lathe(
      'brass',
      0,
      0,
      [
        [R, top],
        [R, l.ceilingY],
      ],
      { n: 24 },
    );
    f.lathe(
      DIFFUSER_MATERIAL.flush,
      0,
      0,
      [
        [R, diffuserY(l)],
        [R, top],
      ],
      { n: 24, capStart: true },
    );
    return;
  }
  const cy = l.centerY ?? l.ceilingY - 0.8;
  const r = l.radius;
  // Rings on the sphere (vertices on it, facets inside: the baker's analytic globe).
  const rings = 9;
  const prof: [number, number][] = [];
  for (let i = 0; i <= rings; i++) {
    const a = (i / rings) * Math.PI;
    prof.push([Math.sin(a) * r, cy - Math.cos(a) * r]);
  }
  prof[0] = [0, cy - r];
  prof[rings] = [0, cy + r];
  f.lathe(DIFFUSER_MATERIAL.pendant, 0, 0, prof, { n: 16 });
  f.box('metalBlack', [-0.003, cy + r * 0.99, -0.003], [0.003, l.ceilingY, 0.003]);
  f.lathe(
    'brass',
    0,
    0,
    [
      [0.012, cy + r * 0.99],
      [0.012, cy + r + 0.03],
    ],
    { n: 8 },
  );
  f.lathe(
    'brass',
    0,
    0,
    [
      [PENDANT.roseRadius, l.ceilingY - PENDANT.roseHeight],
      [PENDANT.roseRadius, l.ceilingY + 0.03],
    ],
    { n: 16, capStart: true },
  );
}
