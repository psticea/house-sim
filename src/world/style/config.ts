/**
 * Shape of a stylised look (plan.md S1/S2). Each look has its own config file — the single
 * place to tune it: `sketchup.ts` (default) and `borderlands.ts`. See README "Styles".
 */
import type { MaterialId } from '../../data/schema';

export type FatLinesMode = 'always' | 'desktop' | 'never';
export type GroundPattern = 'grid' | 'hatch' | 'none';
/** Generated surface texture: S1 ground patterns + the Borderlands painted maps. */
export type SurfaceKind = GroundPattern | 'paint' | 'grass';

/** Palette → style colour: HSL (sRGB) saturation ×, lightness × (clamped), hue shift. */
export interface ColorGrade {
  saturation: number;
  lightness: number;
  maxLightness: number;
  /** Lower lightness bound (default 0). */
  minLightness?: number;
  /** Never darker than the palette colour (pastel look). */
  neverDarker?: boolean;
  /** Hue shift in turns (+ = toward yellow for reds/oranges). */
  hueShift?: number;
}

export interface StyleConfig {
  /** Number of toon shading steps (gradient-map texels). */
  bands: number;
  /** Direct-light multiplier per band, from facing away from the sun to facing it. */
  bandBrightness: readonly number[];
  /** Edge line colour. */
  lineColor: number;
  /** Line width in CSS pixels (fat lines). Without fat lines: 1-device-pixel GL lines. */
  lineWidth: number;
  /**
   * Second, heavier line weight for open boundaries and creases ≥ `minDeg` (Borderlands);
   * `null` = one weight for every line.
   */
  sharpLines: { minDeg: number; width: number } | null;
  /** Screen-space fat lines on every device, desktop only, or never. */
  fatLines: FatLinesMode;
  /** Faces meeting at ≥ this angle get an edge line. */
  edgeThresholdDeg: number;
  /** Hand-drawn overshoot of line ends, as a fraction of the segment length (< 0.5 %). */
  jitter: number;
  /** Absolute cap of the jitter per line end (m): merged meshes are building-sized. */
  jitterMaxM: number;
  /** Materials without edge lines (see-through, or large ground surfaces). */
  noLines: readonly MaterialId[];
  /** Transparent materials that still get (thin) lines. */
  linedTransparent: readonly MaterialId[];
  /**
   * Inverted-hull silhouettes for curved meshes (faceted surfaces whose facets meet at
   * < `maxCreaseDeg`, e.g. the chimney): width in CSS px; `null` = off.
   */
  hulls: { width: number; maxCreaseDeg: number } | null;
  /** How much darker shadowed surfaces are than sunlit ones (0 = no shadows, 1 = black). */
  shadowOpacity: number;
  /** Shadow blur radius (shadow-map texels, PCF). */
  shadowRadius: number;
  /** Shadow map size in this look (real keeps its own). */
  shadowMapSize: number;
  /**
   * Comic shading patch on the toon fills: the shadow band (below `hatchBelow` of full
   * sun) is tinted toward `tint` and inked with single screen-space hatching; cast
   * shadows on sun-facing surfaces (shadow-map light below `crossBelow`) get crossed
   * hatching. `null` = plain toon (no shader patch).
   */
  ink: {
    tint: string;
    tintStrength: number;
    hatchBelow: number;
    crossBelow: number;
    /** Hatch line spacing and width in CSS px, darkening 0–1 (single / cross). */
    spacingPx: number;
    widthPx: number;
    strength: number;
    crossStrength: number;
  } | null;
  /** Paper-grain CSS overlay opacity (0 = off). */
  paperOverlay: number;
  /** CSS vignette strength (0 = off). */
  vignette: number;
  /** Palette colour grade for buildings / objects. */
  palette: ColorGrade;
  /** Colour grade for ground surfaces (lawn, field, asphalt, pavers). */
  paletteGround: ColorGrade;
  /** Generated pattern on ground surfaces (lawn, field, asphalt, pavers; 1 UV unit = 1 m). */
  groundPattern: GroundPattern;
  /** Darkness of the ground pattern lines (0–1). */
  groundPatternStrength: number;
  /** Per-material surface textures (override `groundPattern` for the listed ids). */
  surfaces: Partial<Record<MaterialId, SurfaceKind>>;
  /** Strength (0–1) and tile size (m) of the painted maps. */
  paint: { strength: number; tileM: number };
  grass: { strength: number; tileM: number };
  /** Lighting: hemisphere sky/ground colours + intensity, sun colour + intensity. */
  light: {
    hemiSky: string;
    hemiGround: string;
    hemiIntensity: number;
    sunColor: string;
    sunIntensity: number;
  };
  /** Sky gradient (the fog uses the horizon colour); `clouds` = flat cartoon clouds. */
  sky: {
    zenith: string;
    horizon: string;
    ground: string;
    clouds?: {
      count: number;
      seed: number;
      fill: string;
      shade: string;
      outline: string;
      outlinePx: number;
    };
    /** Flat inked sun disc in the sun's direction (angular radius in radians). */
    sunDisc?: { radius: number; color: string };
  };
  /** Fog distances (m). */
  fog: { near: number; far: number };
  /** 'neutral' keeps hues true and rolls off highlights; 'none' is fully linear. */
  toneMapping: 'neutral' | 'none';
  toneMappingExposure: number;
  /** Device-pixel-ratio cap (fill rate on low-end GPUs). */
  maxPixelRatio: number;
}
