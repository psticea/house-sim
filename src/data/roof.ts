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
  // Sheet 07: gutter lines z −0.305 / −0.136 from the eave face −0.33 (mirrored south).
  gutter: { width: 0.194, lip: 0.025, depth: 0.1 },
  // Sheet 07: seams every 50 cm ("falturi = 50 cm"), first seam 21 cm from the west
  // gable (x −0.121), last at x 17.90; elevations 08–10 show the same rhythm.
  seams: { x0: -0.121, spacing: 0.5005, width: 0.025, height: 0.035 },
  // Sheet 07: two tubes 5 cm apart at z 0.056 / 0.106 (north) and 7.145 / 7.194
  // (south) over 18.19 m; elevation 10 "+4.61".
  snowGuards: { inset: 0.411, x: [-0.07, 18.12], tubes: 2 },
};

export const exterior: ExteriorElement[] = [
  {
    // "acoperire intrare": 7.00 × 1.95 m, +2.56…+2.89 (roof plan x 4.595…11.595).
    id: 'entrance-canopy',
    type: 'box',
    box: { min: [4.595, LEVELS.canopyBottom, -2.28], max: [11.595, LEVELS.canopyTop, SHELL.north] },
    material: 'cladWood',
    topMaterial: 'roofMetal',
    bottomMaterial: 'cladWood',
    seams: 0.5,
  },
  {
    // Spout of the canopy's hidden gutter (north edge) to x 12.621 (sheets 06/07).
    id: 'canopy-gutter',
    type: 'box',
    box: { min: [11.595, 2.8, -2.205], max: [12.621, 2.86, -2.125] },
    material: 'roofMetal',
  },
  {
    // "lant scurgere pluviale" 1.02⁵ east of the canopy (sheets 07/09).
    id: 'canopy-rain-chain',
    type: 'chain',
    x: 12.59,
    z: -2.165,
    y: [LEVELS.exteriorGround, 2.8],
    link: 0.07,
    material: 'metalBlack',
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
    // Metal structure (black fascia), wood-board soffit, standing-seam top (item 11).
    material: 'metalBlack',
    topMaterial: 'roofMetal',
    bottomMaterial: 'cladWood',
    seams: 0.5,
  },
  {
    // Spout of the sunshade's hidden gutter to x 1.223 (sheet 06 z 7.938…8.018).
    id: 'sunshade-gutter',
    type: 'box',
    box: { min: [1.223, 2.62, 7.938], max: [2.193, 2.68, 8.018] },
    material: 'roofMetal',
  },
  {
    // Rain chain 97 cm west of the sunshade (elevation 10, roof plan).
    id: 'sunshade-rain-chain',
    type: 'chain',
    x: 1.25,
    z: 7.978,
    y: [-0.08, 2.62],
    link: 0.07,
    material: 'metalBlack',
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
  // "curte de lumina" (sheet 04): 15 cm concrete walls x 7.175…9.525, z …8.175, bottom
  // −1.65, covered by a grating; window F01 of the basement stair opens into it.
  ...(
    [
      ['light-well-w', [7.175, -1.75, 7.525], [7.325, -0.05, 8.175]],
      ['light-well-e', [9.375, -1.75, 7.525], [9.525, -0.05, 8.175]],
      ['light-well-s', [7.325, -1.75, 8.025], [9.375, -0.05, 8.175]],
    ] as const
  ).map(([id, min, max]): ExteriorElement => ({
    id,
    type: 'box',
    box: { min, max },
    material: 'concrete',
  })),
  {
    id: 'light-well-floor',
    type: 'box',
    box: { min: [7.325, -1.75, 7.525], max: [9.375, -1.65, 8.025] },
    material: 'stone',
  },
  {
    // Closes the underside of the facade cladding (plinth −0.30) over the well.
    id: 'light-well-lintel',
    type: 'box',
    box: { min: [7.325, -0.32, 7.525], max: [9.375, -0.3, SHELL.south] },
    material: 'plasterExterior',
  },
  {
    id: 'light-well-grating',
    type: 'box',
    box: { min: [7.325, -0.08, SHELL.south], max: [9.375, -0.04, 8.025] },
    material: 'grating',
    collide: true,
  },
];
