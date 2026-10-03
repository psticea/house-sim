# Asset licences

Every texture and HDRI used by the realistic look (plan.md I4). All are **CC0 1.0**
(public domain dedication): free to use, modify and redistribute, no attribution
required — credited here anyway. The downloaded originals stay local (git-ignored);
only the optimised KTX2 / JPEG files in `public/assets/` are committed. Regenerate
this file with `node tools/fetch-assets.mjs`.

| Set | Asset | Source | Author(s) | Licence | Used for |
|---|---|---|---|---|---|
| `oak` | Laminate Floor 02 | https://polyhaven.com/a/laminate_floor_02 | Dario Barresi, Charlotte Baglioni | CC0 1.0 | oak parquet, matte oiled |
| `tile` | Travertine009 | https://ambientcg.com/view?id=Travertine009 | ambientCG (Lennart Demes) | CC0 1.0 | honed travertine-look porcelain, 60 × 120 cm stack bond, 3 mm grout (derived) |
| `extwood` | Teak Veneer | https://polyhaven.com/a/teak_veneer | Jenelle van Heerden | CC0 1.0 | oiled timber boards, 8 × 26 cm per tile (derived): cladding, soffits, ceiling, deck |
| `woodgrain` | Oak Veneer 01 | https://polyhaven.com/a/oak_veneer_01 | Jenelle van Heerden | CC0 1.0 | plain oak grain: board ceiling, slats, fence timber |
| `pavers` | Concrete Pavers 02 | https://polyhaven.com/a/concrete_pavers_02 | Amal Kumar | CC0 1.0 | parking concrete pavers |
| `concrete` | Brushed Concrete  | https://polyhaven.com/a/brushed_concrete | Dario Barresi, Dimitrios Savva | CC0 1.0 | basement / light-well concrete |
| `stone` | Concrete Floor Worn 001 | https://polyhaven.com/a/concrete_floor_worn_001 | Dimitrios Savva, Rico Cilliers | CC0 1.0 | honed natural stone slabs (jointless) |
| `gravel` | Gravel Floor 02 | https://polyhaven.com/a/gravel_floor_02 | Jenelle van Heerden, Dimitrios Savva | CC0 1.0 | drainage gravel strips |
| `grass` | Grass004 | https://ambientcg.com/view?id=Grass004 | ambientCG (Lennart Demes) | CC0 1.0 | lawn |
| `asphalt` | Asphalt 02 | https://polyhaven.com/a/asphalt_02 | Rob Tuytel | CC0 1.0 | street |
| `corten` | Rust Coarse 01 | https://polyhaven.com/a/rust_coarse_01 | Dimitrios Savva, Rico Cilliers | CC0 1.0 | weathering steel edging, fire pit |
| `bark` | Bark Brown 02 | https://polyhaven.com/a/bark_brown_02 | Rob Tuytel | CC0 1.0 | tree bark |
| `travertine` | Travertine003 | https://ambientcg.com/view?id=Travertine003 | ambientCG (Lennart Demes) | CC0 1.0 | honed vein-cut travertine: worktops, splashback, tables, basins, tub, hearth |
| `linen` | Rough Linen | https://polyhaven.com/a/rough_linen | colormass, Rico Cilliers | CC0 1.0 | linen / bouclé weave: sofa, bedding, cushions, shades |
| `wool` | Carpet014 | https://ambientcg.com/view?id=Carpet014 | ambientCG (Lennart Demes) | CC0 1.0 | woven wool rugs and throws |
| `cane` | Wicker008A | https://ambientcg.com/view?id=Wicker008A | ambientCG (Lennart Demes) | CC0 1.0 | rattan / cane weave: chair seats, baskets, jute runners |
| `detail-plaster` | Painted Plaster Wall | https://polyhaven.com/a/painted_plaster_wall | Amal Kumar | CC0 1.0 | plaster / paint micro-normal |
| `sky` | Kloofendal 48d Partly Cloudy (Pure Sky) | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | Greg Zaal, Jarod Guest | CC0 1.0 | partly cloudy midday sky |

Derived in code by `tools/optimize-assets.mjs` from the CC0 sources above (the
derived maps are CC0 as well): `tile` (60 × 120 cm stack-bond tiles with grout lines cut
from the travertine scan) and `extwood` (rows of 26 cm boards cut from the teak veneer
scan, per-board tone, dark joints). Albedos are re-toned to the plan.md §6.1 palette.

Generated in code by `tools/optimize-assets.mjs` (no source asset, CC0 as part of
this repository): `metal` / `metal-flat` (standing-seam sheet normal maps),
`detail-fine` (fine paint / clay / leaf micro-normal) and `detail-brushed` (brushed
metal streaks for brass / steel).

Runtime: the Basis Universal transcoder is the one shipped with three.js
(`examples/jsm/libs/basis/`, Apache-2.0, © Binomial LLC), bundled by Vite into our build.
