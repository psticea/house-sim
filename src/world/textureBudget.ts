/**
 * GPU texture memory of the realistic look per quality tier, computed from the texture
 * manifest and the finishes (plan.md §3.1) — the offline counterpart of the debug
 * overlay's `estimateTextureMB`, used by the unit tests to keep every tier in budget.
 *
 * Compressed sizes per texel after transcoding: ETC1S (albedo, ORM) → ETC2 RGB on phones
 * (0.5 B), BC7 on desktops with `EXT_texture_compression_bptc` (1 B); UASTC (normals,
 * sky) → ASTC 4×4 / ETC2 RGBA / BC7 (1 B). Mip chains add ⅓.
 */
import { ATLAS } from '../bake/config';
import type { MapKind, TextureManifest } from '../core/assets';
import { TIER_SETTINGS, type Tier } from '../core/quality';
import { FINISHES } from './finishes';
import { PROBES } from './realLook';

export interface GpuFormats {
  /** Bytes per texel of transcoded ETC1S (albedo, ORM) and UASTC (normals, sky). */
  etc1s: number;
  uastc: number;
}

/** Phones (ETC2 / ASTC). */
export const PHONE_FORMATS: GpuFormats = { etc1s: 0.5, uastc: 1 };
/** Desktop GPUs with BPTC: everything transcodes to BC7. */
export const DESKTOP_BC7_FORMATS: GpuFormats = { etc1s: 1, uastc: 1 };

const MB = 1024 * 1024;
const MIPS = 4 / 3;

/** Pixel size of a manifest file (`<set>/<map>-<px>.ktx2`). */
export const filePx = (rel: string): number => Number(/-(\d+)\.ktx2$/.exec(rel)?.[1] ?? 0);

/** Files the finishes load at `tier` (each once) with their map kind. */
export function tierFiles(manifest: TextureManifest, tier: Tier): Map<string, MapKind> {
  const out = new Map<string, MapKind>();
  for (const f of Object.values(FINISHES)) {
    const entry = f.set ? manifest.sets[f.set] : undefined;
    if (!entry) continue;
    for (const [kind, tiers] of Object.entries(entry.maps) as [MapKind, Record<Tier, string>][]) {
      out.set(tiers[tier], kind);
    }
  }
  return out;
}

export interface TierBudget {
  /** PBR sets of the finishes. */
  materials: number;
  /** PMREM environment (256 faces, half float) + interior probes (64 faces). */
  environment: number;
  /** Sky dome background (UASTC, no mips). */
  sky: number;
  /** Static sun shadow map (colour + depth target; off while lightmaps are applied). */
  shadow: number;
  /** Baked lightmap atlases (`ATLAS.count` per tier, RGBM UASTC, no mips) when the bake is in use. */
  lightmaps: number;
  total: number;
}

/**
 * Estimated GPU texture memory (MB) of the realistic look at `tier`. `baked` = the I6
 * lightmaps replace the shadow-map fallback (the default while the bake is current).
 */
export function tierTextureMB(
  manifest: TextureManifest,
  tier: Tier,
  formats: GpuFormats = PHONE_FORMATS,
  baked = false,
): TierBudget {
  const settings = TIER_SETTINGS[tier];
  let materials = 0;
  for (const [rel, kind] of tierFiles(manifest, tier)) {
    const px = filePx(rel);
    materials += px * px * (kind === 'normal' ? formats.uastc : formats.etc1s) * MIPS;
  }
  // PMREM of the 1K sky: 3 × 256 by 4 × 256 texels, RGBA half float; probes 336 × 256.
  const pmrem = 768 * 1024 * 8;
  const probes = settings.probes ? PROBES.length * 336 * 256 * 8 : 0;
  const skyW = manifest.sky?.width ?? 0;
  const sky = skyW * (skyW / 2) * formats.uastc;
  const shadow = baked ? 0 : settings.shadowMapSize ** 2 * 8;
  const lm = tier === 'low' ? 1024 : 2048;
  const lightmaps = baked ? ATLAS.count * lm * lm * formats.uastc : 0;
  const parts = {
    materials: materials / MB,
    environment: (pmrem + probes) / MB,
    sky: sky / MB,
    shadow: shadow / MB,
    lightmaps: lightmaps / MB,
  };
  return {
    ...parts,
    total: parts.materials + parts.environment + parts.sky + parts.shadow + parts.lightmaps,
  };
}
