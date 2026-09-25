/**
 * Sketch look (the default style; `?style=real` for the realistic one, plan.md S1) — the
 * single place to tune it. See README "Styles" for which knobs push toward "more
 * SketchUp" vs "more cartoon".
 */
export type FatLinesMode = 'always' | 'desktop' | 'never';
export type GroundPattern = 'grid' | 'hatch' | 'none';

export const STYLE = {
  /** Number of toon shading steps (gradient-map texels). */
  bands: 3,
  /** Direct-light multiplier per band, from facing away from the sun to facing it. */
  bandBrightness: [0.75, 0.9, 1.0] as readonly number[],
  /** Edge line colour. */
  lineColor: 0x2a2a2a,
  /** Fat line width in CSS pixels (desktop). Phones get 1-device-pixel GL lines. */
  lineWidth: 1.3,
  /** Screen-space fat lines on every device, desktop only, or never. */
  fatLines: 'desktop' as FatLinesMode,
  /** Faces meeting at ≥ this angle get an edge line. */
  edgeThresholdDeg: 30,
  /** Hand-drawn overshoot/undershoot of line ends, as a fraction of the segment length (< 0.5 %). */
  jitter: 0.003,
  /** Absolute cap of the jitter per line end (m): merged meshes are building-sized. */
  jitterMaxM: 0.012,
  /** How much darker shadowed surfaces are than sunlit ones (0 = no shadows, 1 = black). */
  shadowOpacity: 0.35,
  /** Shadow blur radius (shadow-map texels, PCF). */
  shadowRadius: 3,
  /** Shadow map size in sketch mode (real mode keeps its own). */
  shadowMapSize: 1024,
  /** Paper-grain CSS overlay opacity (0 = off). */
  paperOverlay: 0.05,
  /** Palette → pastel: HSL saturation ×, lightness × (capped at `maxLightness`). */
  pastel: { saturation: 0.85, lightness: 1.08, maxLightness: 0.95 },
  /** Same for ground surfaces (lawn, field, asphalt, pavers): paler, like a drawing sheet. */
  pastelGround: { saturation: 0.7, lightness: 1.4, maxLightness: 0.8 },
  /** Generated pattern on ground surfaces (1 UV unit = 1 m). */
  groundPattern: 'grid' as GroundPattern,
  /** Darkness of the ground pattern lines (0–1). */
  groundPatternStrength: 0.08,
  /** Sketch lighting: hemisphere sky/ground colours + intensity, sun colour + intensity. */
  light: {
    hemiSky: '#fbf8f2',
    hemiGround: '#e6dfd2',
    hemiIntensity: 2.3,
    sunColor: '#fffaf0',
    sunIntensity: 1.5,
  },
  /** Pale sky gradient (the fog uses the horizon colour). */
  sky: { zenith: '#cadbe8', horizon: '#f4f1ea', ground: '#ebe6dc' },
  /** Fog distances (m). */
  fog: { near: 80, far: 480 },
  /** 'neutral' keeps hues true and rolls off highlights; 'none' is fully linear. */
  toneMapping: 'neutral' as 'neutral' | 'none',
  toneMappingExposure: 1.0,
  /** Device-pixel-ratio cap in sketch mode (fill rate on low-end GPUs). */
  maxPixelRatio: 1.5,
};

export type StyleConfig = typeof STYLE;
