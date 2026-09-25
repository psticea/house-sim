/**
 * Borderlands look (plan.md S2): cel-shaded "hand-inked comic / concept art" — thick
 * black ink outlines, hard two-tone shading with violet-tinted, hatched shadows,
 * saturated warm colours, painted surfaces and a bold cartoon sky. The single place to
 * tune it; see README "Styles".
 */
import type { StyleConfig } from './config';

export const BORDERLANDS: StyleConfig = {
  /** Hard 2-step toon: away from the sun / facing it. */
  bands: 2,
  bandBrightness: [0.5, 1.0],
  lineColor: 0x111111,
  /** Softer creases (between `edgeThresholdDeg` and `sharpLines.minDeg`). */
  lineWidth: 2.2,
  /** Boundaries and sharp (≥ 60°) edges: the heavy ink contour. */
  sharpLines: { minDeg: 60, width: 3.2 },
  /** Thick lines are the signature of the look: fat lines on phones too. */
  fatLines: 'always',
  /** Just above the 30° facets of 12-sided cylinders (those get hull silhouettes). */
  edgeThresholdDeg: 33,
  jitter: 0.002,
  jitterMaxM: 0.01,
  noLines: ['lawn', 'field', 'asphalt', 'meadow', 'flowers', 'foliage', 'foliageLight'],
  linedTransparent: ['glass'],
  /** Curved meshes only: the chimney (metalBlack), vegetation (canopies: hull only), pots, fire pit. */
  hulls: {
    width: 3.2,
    maxCreaseDeg: 33,
    only: ['metalBlack', 'foliage', 'foliageLight', 'bark', 'barkBirch', 'clay', 'corten'],
  },
  shadowOpacity: 0.45,
  shadowRadius: 1,
  shadowMapSize: 1024,
  ink: {
    tint: '#c8c4ff',
    tintStrength: 0.65,
    hatchBelow: 0.6,
    crossBelow: 0.5,
    spacingPx: 8,
    widthPx: 1.5,
    strength: 0.24,
    crossStrength: 0.16,
  },
  paperOverlay: 0,
  vignette: 0.22,
  /** Comic palette: same hues, saturation × 1.25, slightly darker. */
  palette: { saturation: 1.25, lightness: 0.93, maxLightness: 0.86, minLightness: 0.2 },
  paletteGround: { saturation: 1.3, lightness: 0.97, maxLightness: 0.7, minLightness: 0.15 },
  groundPattern: 'none',
  groundPatternStrength: 0,
  surfaces: {
    lawn: 'grass',
    field: 'grass',
    plaster: 'paint',
    plasterExterior: 'paint',
    cladWood: 'paint',
    cladMetal: 'paint',
    roofMetal: 'paint',
    deck: 'paint',
    pavers: 'paint',
    concrete: 'paint',
    stone: 'paint',
    asphalt: 'paint',
    oak: 'paint',
    timber: 'paint',
    gravel: 'paint',
    soil: 'paint',
  },
  paint: { strength: 0.24, tileM: 4 },
  grass: { strength: 0.7, tileM: 2.4 },
  light: {
    hemiSky: '#c4c8f4',
    hemiGround: '#d9b89c',
    hemiIntensity: 1.9,
    sunColor: '#ffcf8c',
    sunIntensity: 2.4,
  },
  sky: {
    zenith: '#1f9fb0',
    horizon: '#ffc766',
    ground: '#e0a870',
    clouds: {
      count: 10,
      seed: 11,
      fill: '#fff6e4',
      shade: '#e3c9d6',
      outline: '#1a1a1a',
      outlinePx: 2.6,
    },
    sunDisc: { radius: 0.045, color: '#fff1bf' },
  },
  fog: { near: 60, far: 380 },
  toneMapping: 'none',
  toneMappingExposure: 1.0,
  maxPixelRatio: 1.5,
};
