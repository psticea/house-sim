/**
 * Site (lot, paving, parking, deck) — from the site plan sheet 03 (1:200,
 * 1 m = 14.173 pt) and the 1:50 sheet 05 for the parts next to the house.
 *
 * On sheet 03 the house outline (insulation faces x −0.275…18.275, z −0.275…7.525,
 * quoted "18.55 × 7.80") is rotated 7.68° on the page; mapping its corners onto the
 * house frame and fitting lines through the dotted lot boundary gives the lot below.
 * Checks against the printed values: edges 33.64⁵ (north) / 17.09⁵ (east) / 33.50
 * (south) / 17.09 (west); distances house → lot 2.28 (north), 7.00 (south), 7.02
 * (east), ≈ 8.00 (west, street side); lot area 574 m².
 *
 * True north: both north arrows (sheet 03 upright, sheet 05 drawn in house axes)
 * put true north 7.68° west of the plan's "up" (−z).
 */
import type { Site } from './schema';

export const LOT: Site['lot'] = [
  [-8.006, -2.558],
  [25.639, -2.558],
  [25.038, 14.525],
  [-8.462, 14.525],
];

export const site: Site = {
  lot: LOT,
  lotArea: 574,
  trueNorthDeg: 7.68,
  lawnY: -0.08,
  patches: [
    {
      // "circulatie auto privata dalata" (hatched), 2 spaces, 80 m²: between the street
      // edge and the pedestrian strip, entered from the road at the south-west corner.
      id: 'parking',
      polygon: [
        [-8.142, 2.52],
        [-1.47, 2.52],
        [-1.8, 14.525],
        [-8.462, 14.525],
      ],
      top: -0.05,
      thickness: 0.1,
      material: 'pavers',
      collide: true,
    },
    {
      // Natural stone path: west strip (sheet 03), north strip and covered entrance
      // walk up to the slat screen (sheet 05, z −1.475 / −2.225), yard to the south-west.
      id: 'path',
      polygon: [
        [-1.47, 2.52],
        [-1.475, -1.475],
        [4.595, -1.475],
        [4.595, -2.225],
        [11.595, -2.225],
        [11.595, -0.33],
        [-0.33, -0.33],
        [-0.33, 9.53],
        [5.04, 9.53],
        [5.04, 14.525],
        [-1.8, 14.525],
      ],
      top: -0.05,
      thickness: 0.1,
      material: 'stone',
      collide: true,
    },
    {
      // "platforma gospodareasca" (bins), 1.50 m².
      id: 'bins',
      polygon: [
        [5.04, 13.67],
        [6.79, 13.67],
        [6.79, 14.525],
        [5.04, 14.525],
      ],
      top: -0.05,
      thickness: 0.1,
      material: 'concrete',
      collide: true,
    },
    {
      // WPC deck on pedestals, ±0.00: loggia + east strip to x 19.776 + south strip to
      // z 9.025 (sheet 05 terrace fill), clipped to the wall faces.
      id: 'deck',
      polygon: [
        [16.625, 0.275],
        [18.38, 0.275],
        [18.38, 0.125],
        [19.776, 0.125],
        [19.776, 9.025],
        [9.375, 9.025],
        [9.375, 7.58],
        [18.38, 7.58],
        [18.38, 6.975],
        [16.625, 6.975],
      ],
      top: 0,
      thickness: 0.14,
      material: 'deck',
      collide: true,
    },
    {
      // "curte de lumina" (basement light well) covered by a grating, x 7.325…9.375.
      id: 'light-well',
      polygon: [
        [7.325, 7.58],
        [9.375, 7.58],
        [9.375, 8.03],
        [7.325, 8.03],
      ],
      top: -0.04,
      thickness: 0.06,
      material: 'grating',
      collide: true,
    },
    {
      // Public road reaching the lot's south-west corner ("circulatie auto publica").
      id: 'road',
      polygon: [
        [-11.96, 14.525],
        [-4.96, 14.525],
        [-5.37, 29.85],
        [-6.2, 60],
        [-13.2, 60],
        [-12.36, 29.27],
      ],
      top: -0.1,
      thickness: 0.05,
      material: 'asphalt',
    },
  ],
  // On the parking, facing the west gable and the path that leads north around the
  // house to the entrance canopy.
  start: { position: [-6.2, -0.05, 6.8], lookAt: [-0.3, 1.8] },
  // Mid-afternoon summer sun from the south-west.
  sun: { azimuthDeg: 222, elevationDeg: 42 },
};
