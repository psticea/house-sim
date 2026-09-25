/**
 * SketchUp look — the default style (plan.md S1/S2): SketchUp-like architecture with a
 * light cartoon touch. The single place to tune it; see README "Styles" for which knobs
 * push toward "more SketchUp" vs "more cartoon".
 */
import type { StyleConfig } from './config';

export const SKETCHUP: StyleConfig = {
  bands: 3,
  bandBrightness: [0.75, 0.9, 1.0],
  lineColor: 0x2a2a2a,
  /** Desktop fat lines; phones get 1-device-pixel GL lines. */
  lineWidth: 1.3,
  sharpLines: null,
  fatLines: 'desktop',
  edgeThresholdDeg: 30,
  jitter: 0.003,
  jitterMaxM: 0.012,
  noLines: [
    'glass',
    'lawn',
    'field',
    'asphalt',
    'meadow',
    'flowers',
    'foliage',
    'foliageLight',
    // Soft upholstery: silhouette hull only (no creases to draw, saves the edge pass).
    'linen',
  ],
  linedTransparent: [],
  /**
   * Architecture keeps the S1 look (no hulls); rounded vegetation and pots get a thin
   * silhouette outline, like SketchUp's profiles (canopies: outline only, no creases);
   * so do the soft furniture pieces (linen upholstery, ceramics, cane baskets; I5).
   */
  hulls: {
    width: 1.3,
    maxCreaseDeg: 30,
    only: ['foliage', 'foliageLight', 'bark', 'barkBirch', 'clay', 'linen', 'ceramic', 'cane'],
  },
  shadowOpacity: 0.35,
  shadowRadius: 3,
  shadowMapSize: 1024,
  ink: null,
  paperOverlay: 0.05,
  vignette: 0,
  /** Palette → pastel: saturation ×, lightness × (capped at `maxLightness`, never darker). */
  palette: { saturation: 0.85, lightness: 1.08, maxLightness: 0.95, neverDarker: true },
  /** Ground surfaces: paler, like a drawing sheet. */
  paletteGround: { saturation: 0.7, lightness: 1.4, maxLightness: 0.8, neverDarker: true },
  groundPattern: 'grid',
  groundPatternStrength: 0.08,
  surfaces: { gravel: 'hatch', soil: 'hatch' },
  paint: { strength: 0, tileM: 4 },
  grass: { strength: 0, tileM: 1.5 },
  light: {
    hemiSky: '#fbf8f2',
    hemiGround: '#e6dfd2',
    hemiIntensity: 2.3,
    sunColor: '#fffaf0',
    sunIntensity: 1.5,
  },
  sky: { zenith: '#cadbe8', horizon: '#f4f1ea', ground: '#ebe6dc' },
  fog: { near: 80, far: 480 },
  toneMapping: 'neutral',
  toneMappingExposure: 1.0,
  maxPixelRatio: 1.5,
};
