/**
 * Roof and exterior elements.
 *
 * Roof plan sheet 07 (grid origin x 217.375 pt, z 259.685 pt): ridge at z 3.625 (the
 * middle of the 7.91 m depth), no eave or verge overhang (hidden gutters), 7 roof
 * windows FZ-01, round chimney at (11.65, 6.91). Elevations 08–10: 40° pitch, eaves
 * +4.23 at the facade face, ridge +7.50/+7.54, chimney +7.90. Living-room ceiling
 * 3.95 → 6.88 (sheet 05 label) ⇒ underside plane through (z 0.125, y 3.95). Loggia
 * opening on the east elevation: 62⁵ side frames, +3.94⁵ at the sides, +6.74 at the top.
 */
import { LEVELS, SHELL } from './grid';
import type { ExteriorElement, Roof } from './schema';

export const roof: Roof = {
  pitchDeg: 40,
  eaveZ: [SHELL.north, SHELL.south],
  eaveY: LEVELS.eave,
  ridgeZ: (SHELL.north + SHELL.south) / 2,
  segments: [
    {
      id: 'upper',
      x: [SHELL.west, 9.625],
      innerY: LEVELS.kneeWallTop,
      innerZ: SHELL.innerNorth - SHELL.north,
      topMaterial: 'roofMetal',
      underMaterial: 'plaster',
      endMaterial: 'cladMetal',
    },
    {
      id: 'living',
      x: [9.625, 16.625],
      innerY: LEVELS.kneeWallTop,
      innerZ: SHELL.innerNorth - SHELL.north,
      topMaterial: 'roofMetal',
      underMaterial: 'ceilingWood',
      endMaterial: 'cladMetal',
    },
    {
      // Deeper frame around the loggia: underside +3.945 at the side walls' inner face.
      id: 'loggia',
      x: [16.625, SHELL.east],
      innerY: 3.945,
      innerZ: 0.275 - SHELL.north,
      topMaterial: 'roofMetal',
      underMaterial: 'ceilingWood',
      endMaterial: 'cladMetal',
    },
  ],
  windows: [
    { id: 'fz-n1', code: 'FZ-01', x: [2.85, 3.68], z: [0.15, 1.47] },
    { id: 'fz-n2', code: 'FZ-01', x: [5.079, 5.909], z: [0.15, 1.47] },
    { id: 'fz-n3', code: 'FZ-01', x: [7.312, 8.142], z: [0.15, 1.47] },
    { id: 'fz-s1', code: 'FZ-01', x: [2.85, 3.68], z: [5.675, 6.995] },
    { id: 'fz-s2', code: 'FZ-01', x: [5.079, 5.909], z: [5.675, 6.995] },
    { id: 'fz-s3', code: 'FZ-01', x: [7.312, 8.142], z: [5.675, 6.995] },
    { id: 'fz-s4', code: 'FZ-01', x: [10.468, 11.298], z: [5.675, 6.995] },
  ],
  chimney: { center: [11.65, 6.907], radius: 0.135, top: LEVELS.chimneyTop },
};

export const exterior: ExteriorElement[] = [
  {
    // "acoperire intrare": 7.00 × 1.95 m, +2.56…+2.89 (roof plan x 4.595…11.595).
    id: 'entrance-canopy',
    type: 'box',
    box: { min: [4.595, LEVELS.canopyBottom, -2.28], max: [11.595, LEVELS.canopyTop, SHELL.north] },
    material: 'cladWood',
    topMaterial: 'roofMetal',
  },
  {
    // Concrete base of the slat screen, z −2.225…−1.775 (sheet 05); height 0.85 per
    // elevations 08/09 (the plan note says "sezut h = 45 cm"; elevations win).
    id: 'canopy-screen-base',
    type: 'box',
    box: { min: [4.595, -0.05, -2.225], max: [11.595, 0.85, -1.775] },
    material: 'concrete',
    collide: true,
  },
  {
    id: 'canopy-screen-slats',
    type: 'slats',
    x: [4.62, 11.57],
    z: [-2.035, -1.965],
    y: [0.85, LEVELS.canopyBottom],
    width: 0.05,
    spacing: 0.15,
    material: 'woodSlat',
    collide: true,
  },
  {
    // "parasolar": x 2.193…15.51, 50 cm deep (roof plan), +2.50…+2.73 (elevation 10).
    id: 'sunshade',
    type: 'box',
    box: {
      min: [2.193, LEVELS.sunshadeBottom, SHELL.south],
      max: [15.51, LEVELS.sunshadeTop, 8.08],
    },
    material: 'metalBlack',
    topMaterial: 'roofMetal',
  },
  ...(
    [
      [2.218, 2.318],
      [4.258, 4.358],
      [12.03, 12.13],
      [15.42, 15.52],
    ] as const
  ).map(([x0, x1], i): ExteriorElement => ({
    // Sunshade support fins ("perete sustinere parasolar"), sheet 05 z 7.525…8.0.
    id: `sunshade-fin-${i + 1}`,
    type: 'box',
    box: { min: [x0, -0.08, SHELL.south], max: [x1, LEVELS.sunshadeBottom, 8.0] },
    material: 'cladWood',
    collide: true,
  })),
  {
    // Decorative 5×7 cm slats between F-05 and F-07 (elevation 10, item 13).
    id: 'south-slats',
    type: 'slats',
    x: [4.4, 12.0],
    z: [7.93, 8.0],
    y: [-0.08, LEVELS.sunshadeBottom],
    width: 0.05,
    spacing: 0.15,
    material: 'woodSlat',
    collide: true,
  },
];
