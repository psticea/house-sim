# Asset licences

Every texture and HDRI used by the realistic look (plan.md I4). All are **CC0 1.0**
(public domain dedication): free to use, modify and redistribute, no attribution
required — credited here anyway. The downloaded originals stay local (git-ignored);
only the optimised KTX2 / JPEG files in `public/assets/` are committed. Regenerate
this file with `node tools/fetch-assets.mjs`.

| Set | Asset | Source | Author(s) | Licence | Used for |
|---|---|---|---|---|---|
| `oak` | Laminate Floor 02 | https://polyhaven.com/a/laminate_floor_02 | Dario Barresi, Charlotte Baglioni | CC0 1.0 | oak parquet, matte oiled |
| `tile` | Grey Tiles | https://polyhaven.com/a/grey_tiles | Amal Kumar | CC0 1.0 | warm sand stone-look porcelain |
| `extwood` | Wood Planks | https://polyhaven.com/a/wood_planks | Amal Kumar | CC0 1.0 | exterior boards: cladding, soffits, deck |
| `woodgrain` | Oak Veneer 01 | https://polyhaven.com/a/oak_veneer_01 | Jenelle van Heerden | CC0 1.0 | plain oak grain: board ceiling, slats, fence timber |
| `pavers` | Concrete Pavers 02 | https://polyhaven.com/a/concrete_pavers_02 | Amal Kumar | CC0 1.0 | parking concrete pavers |
| `concrete` | Brushed Concrete  | https://polyhaven.com/a/brushed_concrete | Dario Barresi, Dimitrios Savva | CC0 1.0 | basement / light-well concrete |
| `stone` | Concrete Floor Worn 001 | https://polyhaven.com/a/concrete_floor_worn_001 | Dimitrios Savva, Rico Cilliers | CC0 1.0 | honed natural stone slabs (jointless) |
| `gravel` | Gravel Floor 02 | https://polyhaven.com/a/gravel_floor_02 | Jenelle van Heerden, Dimitrios Savva | CC0 1.0 | drainage gravel strips |
| `grass` | Grass004 | https://ambientcg.com/view?id=Grass004 | ambientCG (Lennart Demes) | CC0 1.0 | lawn |
| `asphalt` | Asphalt 02 | https://polyhaven.com/a/asphalt_02 | Rob Tuytel | CC0 1.0 | street |
| `corten` | Rust Coarse 01 | https://polyhaven.com/a/rust_coarse_01 | Dimitrios Savva, Rico Cilliers | CC0 1.0 | weathering steel edging, fire pit |
| `bark` | Bark Brown 02 | https://polyhaven.com/a/bark_brown_02 | Rob Tuytel | CC0 1.0 | tree bark |
| `detail-plaster` | Painted Plaster Wall | https://polyhaven.com/a/painted_plaster_wall | Amal Kumar | CC0 1.0 | plaster / paint micro-normal |
| `sky` | Kloofendal 48d Partly Cloudy (Pure Sky) | https://polyhaven.com/a/kloofendal_48d_partly_cloudy_puresky | Greg Zaal, Jarod Guest | CC0 1.0 | partly cloudy midday sky |

Generated in code by `tools/optimize-assets.mjs` (no source asset, CC0 as part of
this repository): `metal` / `metal-flat` (standing-seam sheet normal maps) and
`detail-fine` (fine paint / clay / leaf micro-normal).

Runtime: the Basis Universal transcoder is the one shipped with three.js
(`examples/jsm/libs/basis/`, Apache-2.0, © Binomial LLC), bundled by Vite into our build.
