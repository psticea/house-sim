# Plan — House Sim (technical proposal)

> **What** we want is in [`goal.md`](goal.md). This file is the **how**, plus the
> **roadmap with live status** (§0 and §12). Update the status whenever a step is done.

---

## 0. Status at a glance

Legend: ✅ done · 🔄 in progress · ⬜ not started · ⏸ blocked

| Iteration | Deliverable | Status |
|---|---|---|
| **I0** | Planning: repo, plans read, `goal.md`, `plan.md`, `.gitignore` | ✅ |
| **I1** | **First walk** — public URL: start outside, walk into every ground-floor room (first deliverable) | ✅ (real-phone check pending) |
| I2 | Whole building — upper floor, basement, stairs, roof & facade details | ✅ (real-phone check pending) |
| S1 | Sketch style — hand-drawn look, **the default** when visiting the site; realistic look optional via `?style=real` (I4/I6 continue for it) | ✅ |
| S2 | Three styles + visible toggle — Realistic, SketchUp (the S1 look), **Borderlands** (new, cel-shaded comic ink); small style switcher on phone + desktop | ✅ |
| I3 | Garden & fence — lot, terrain, paving, parking, lawn, trees, timber fence (natural materials, §6.3–6.4) | ⬜ ← next |
| I4 | Materials — PBR textures per plans + The Local Project palette (§6.1), glass, frames, quality tiers | ⬜ |
| I5 | Basic furniture — every room furnished (procedural + CC0) | ⬜ |
| I6 | Baked lighting — lightmap baker, GI in the game | ⬜ |
| I7 | UI & PWA — mini-map, teleport, settings, installable/offline | ⬜ |
| I8 | Performance & polish — all budgets met on reference phones | ⬜ |

Detailed steps, acceptance criteria and per-step status: **§12 Roadmap**.

---

## 1. Summary of the decision

| Topic | Choice |
|---|---|
| Platform | Static web page (phone first, desktop second), WebGL 2 |
| 3D engine | **three.js** (pinned version) |
| Language / build | **TypeScript** + **Vite** |
| House geometry | **Generated in code** from a typed data model transcribed from the PDF plans (no Blender) |
| Collision / movement | **three-mesh-bvh** capsule character controller (no physics engine) |
| Lighting | **Baked lightmaps** (global illumination) made by our own in-browser baker using GPU ray tracing (three-mesh-bvh); runtime fallback: static sun shadow + HDRI |
| Style | Architecture **as in the plans**; furniture, interior design and colours in the style of **The Local Project** (from I3 onward; §6) |
| Looks | **3 switchable render styles** (S1/S2): SketchUp (default), Borderlands, Realistic — same scene, only materials/lighting/rendering differ |
| Furniture | **Basic** — every room recognisable; procedural pieces + a few CC0 models |
| Textures | **Good quality** PBR, KTX2-compressed, **≤ 70 MB GPU memory** on phones (§3.1) |
| Assets | CC0 only (Poly Haven, ambientCG, Kenney, Quaternius), compressed with **glTF-Transform** (Meshopt + KTX2) |
| UI | Vanilla TS + DOM/CSS (no React — smaller, faster) |
| Tests | Vitest (data/geometry), Playwright (smoke, screenshots, runs the baker) |
| Hosting | **Public** repo, **public link** on **GitHub Pages** via GitHub Actions; the PDFs and any identifying data are never committed (`.gitignore`) |

Core idea: **the whole scene is static** (doors open, nothing moves except the camera).
That lets us pre-compute almost all of the expensive lighting offline, so the phone only
draws textured triangles. This is how we get "high quality" and "runs on an average phone"
at the same time.

---

## 2. Why three.js (alternatives considered)

| Option | Verdict |
|---|---|
| **three.js** | ✅ Smallest runtime (~150–200 KB gz for what we use), huge ecosystem (three-mesh-bvh, glTF-Transform, KTX2, postprocessing), full control over the render loop and draw calls — important for mobile. |
| Babylon.js | 👍 Very good, more built-ins (physics, GUI, inspector). Bigger bundle, less control over low-level details. Solid plan B. |
| PlayCanvas | 👍 Good mobile performance, but its strength is the cloud editor; code-only workflow is less natural. |
| Godot 4 web export | ❌ 30–40 MB WASM download, Compatibility renderer only, weak mobile browser performance. |
| Unity WebGL | ❌ Big builds, mobile web officially limited, slow startup. |
| WebGPU (three `WebGPURenderer`) | ⏳ Not yet reliable on average phones/iOS versions. Use WebGL 2 now; code stays portable. |

Libraries are installed from **npm** and bundled by Vite (rather than loaded from a CDN at
runtime): this gives tree-shaking, exact version pinning, offline/PWA support and no
third-party requests from the page. (A CDN import map is fine for quick experiments only.)

---

## 3. Target devices & performance budget

**Reference "average phone"** (test on at least one real device of each kind):
- Android mid-range 2022–2023: Samsung Galaxy A34/A54, Pixel 6a (Mali-G68 / Mali-G78 class GPU), Chrome.
- iPhone 11 / 12, Safari (iOS 16+).
- Desktop: any laptop with integrated GPU, Chrome/Edge/Firefox/Safari.

**Budgets** (enforced by a debug HUD and a Playwright perf check):

| Metric | Budget (medium tier) |
|---|---|
| Frame rate | 60 fps target, never < 30 fps |
| Draw calls per frame | ≤ 120 (aim ~60) |
| Visible triangles | ≤ 400 k |
| GPU texture memory | **≤ 70 MB** (hard cap 75 MB), KTX2 compressed — see §3.1 |
| Initial download (to first walkable frame) | ≤ 12 MB |
| Total download (with furniture, vegetation) | ≤ 35 MB |
| Time to first walkable frame on 4G | ≤ 6 s |
| JS heap | ≤ 200 MB |

**How we stay inside the budget**
- Merge all static geometry **by material** (`BufferGeometryUtils.mergeGeometries`) → a few dozen draw calls for the whole house.
- Repeated objects (wood slats, trees, fence posts, roof seams, snow guards) → `InstancedMesh`.
- Few materials, shared texture sets, tiling textures in world-space UVs.
- Lighting pre-baked in lightmaps → cheap shaders (`MeshStandardMaterial` with `lightMap` + `aoMap`, or `MeshLambertMaterial` on the low tier).
- No real-time shadows on low/medium once lightmaps exist (the scene doesn't move).
- Avoid alpha-tested/transparent overdraw (bad for mobile tile GPUs): solid low-poly vegetation, glass drawn last with `depthWrite: false`.
- Capped pixel ratio + **dynamic resolution** (adjust `renderer.setPixelRatio` between 0.75 and `min(devicePixelRatio, 2)` based on measured frame time).
- KTX2 textures (ETC1S for albedo/ORM, UASTC for normals and hero albedos) → 4–8× less GPU memory than PNG/JPG.
- Meshopt-compressed glTF, lazy-loading of non-essential assets (furniture, far vegetation).

**Quality tiers** (auto-picked at start using [`detect-gpu`](https://github.com/pmndrs/detect-gpu) + a 1-second warm-up benchmark; user can override in settings):

| Tier | Pixel ratio | AA | Lightmaps | Textures | Texture memory | Extras |
|---|---|---|---|---|---|---|
| Low | ≤ 1.0 | none / FXAA | 1K | 512 px (hero 1K) | ≤ 35 MB | Lambert materials, no reflection probes, simple trees |
| **Medium** (average phone) | 1.25–1.5 | MSAA 4× | 2K | 1K (hero 2K) | **≤ 70 MB** | reflection probes, instanced grass near player |
| High (desktop / flagship) | ≤ 2.0 | MSAA 4× or SMAA | 2K | 2K | ≤ 120 MB | postprocessing: N8AO, subtle bloom |

### 3.1 Texture memory allocation (medium tier, ≤ 70 MB)

Sizes are GPU memory including mipmaps (×1.33). Compressed formats on phones:
ETC1S/ETC2 RGB ≈ 4 bits/pixel, UASTC → ASTC 4×4 / ETC2 RGBA ≈ 8 bits/pixel.

| Group | What | Format | Budget |
|---|---|---|---|
| Hero sets ×3 | oak parquet, bathroom tiles, exterior wood (cladding/deck/slats) — 2K albedo (UASTC) + 1K normal + 1K ORM | 5.6 + 1.4 + 0.7 MB | **≈ 23 MB** |
| Standard sets ×7 | metal seam facade, white plaster (exterior), pavers/stone/concrete, gravel, grass, fabric (sofa/bed), painted wood (kitchen/wardrobes) — 1K albedo + 1K normal + 1K ORM | 0.7 + 1.4 + 0.7 MB | **≈ 20 MB** |
| Detail maps ×4 | 512 px tileable micro-normals / grain (interior paint, textiles, metal, wood) layered at high repeat for close-up crispness | 0.35 MB each | **≈ 1.5 MB** |
| Furniture & props | shared 1K atlas (albedo + normal + ORM) for CC0 models (chairs, lamps, plants, fixtures); procedural furniture reuses the sets above | — | **≈ 3.5 MB** |
| Lightmaps | 2 × 2K atlases, ~3 cm texels indoors, coarser outside (RGBM, UASTC) | 5.6 MB each | **≈ 11 MB** |
| Environment | HDRI PMREM (half-float, 256 face ≈ 6.3 MB) + 3 interior probes (64 face) + 1K sky background (ETC1S) | mostly uncompressed | **≈ 8 MB** |
| **Total** | | | **≈ 67 MB** |

How we keep **good texture quality** inside this budget:
- **Texel density where the eye goes**: floors and anything within reach get the hero
  sets; ceilings, roofs and far surfaces get 1K or flat color + detail map.
- **Plain surfaces don't need big textures**: white walls/ceilings are a color + a 512
  micro-normal detail map (reads as real paint/plaster up close) + the lightmap.
- **Anti-tiling**: stochastic/hex tiling or a low-frequency macro variation map
  (in the shader) so repeating 1K tiles don't show a visible grid.
- **Channel packing**: AO/roughness/metalness in one ORM texture; AO largely comes from
  the lightmap anyway.
- **Measured, not guessed**: the debug overlay reports texture memory; a Playwright check
  fails the build if the medium tier exceeds 75 MB.

---

## 4. Rendering approach (quality without cost)

1. **Baked global illumination (lightmaps)** — the #1 quality factor.
   Sun + sky + 2–3 light bounces baked per surface into lightmap textures (UV2).
   Gives soft shadows, light spilling through windows, darker corners, the
   double-height living room glowing from the east glass wall — at zero runtime cost.
2. **Image-based lighting** — a CC0 HDRI sky (Poly Haven) → `PMREMGenerator` for
   reflections on glass, metal cladding, tiles, parquet sheen.
3. **Interior reflection probes** — at load time render 2–4 cube maps (living room,
   bedrooms, bathroom) with `CubeCamera`, run through PMREM, assign per room so
   indoor reflections don't show the outdoor sky.
4. **Eye adaptation** — exposure smoothly changes when entering/exiting the house
   (we know which room polygon the player is in).
5. **Tone mapping** — `AgXToneMapping` (or ACES), sRGB output, physically plausible
   light units.
6. **Sky** — the HDRI as background (low-res is fine), with light distance fog so
   the world beyond the fence fades out nicely.
7. **Fallback before the baker exists** (iterations I1–I5): hemisphere light +
   directional sun with a **static shadow map rendered once**
   (`shadowMap.autoUpdate = false`), plus N8AO on the high tier. This is already good
   and fully playable; lightmaps then replace it.

### 4.1 Lightmap baker (our own, no Blender)

A dev-only page `bake.html` inside the same Vite project, reusing the exact runtime
scene-building code:

1. Build the scene from the house data (same code as the game).
2. **UV2 unwrap** each merged mesh with **xatlas** (WASM build, e.g. `xatlas-three` /
   `xatlasjs`) → non-overlapping lightmap UVs, packed into a few atlases.
3. **G-buffer in texture space**: render each mesh with `gl_Position = uv2 * 2 - 1`
   to float render targets storing world position + normal + albedo per texel.
4. **Ray tracing on the GPU**: a full-screen shader per atlas uses
   `three-mesh-bvh`'s GLSL BVH traversal (`MeshBVHUniformStruct`, the same technique
   `three-gpu-pathtracer` uses) to trace, per texel:
   - sun visibility (soft, a few jittered rays toward the sun disk),
   - sky light (cosine-weighted hemisphere rays sampling the HDRI),
   - indirect bounces (rays hit geometry → read that point's previous-iteration
     lightmap × albedo — progressive radiosity, 2–3 iterations).
   Accumulate hundreds of samples progressively (the page shows progress).
5. **Post-process**: denoise (edge-aware bilateral filter guided by normal/position;
   optionally OIDN via WASM if a good build exists), dilate into padding texels to
   hide seams.
6. **Encode & save**: HDR → RGBM or half-float → KTX2 (UASTC) via a WASM encoder
   (`ktx2-encoder` / Basis Universal), plus the uv2 channels, written to
   `public/assets/baked/`. The page is driven by **Playwright** (`npm run bake`) in
   headed Chrome with the real GPU (not the SwiftShader software renderer).
7. Bake a fixed sun position (e.g. a sunny afternoon). Later option: bake 2–3 times of
   day and blend between them.

Bake time is minutes on a desktop GPU; the output is committed (or cached in CI) so
the phone never bakes anything.

---

## 5. The house data model (the heart of the project)

Everything is **generated from a typed TypeScript description** transcribed from the
PDF plans. Typed `.ts` data (rather than JSON) gives comments, autocomplete and
compile-time checks.

### 5.1 Coordinate system
- Units: **meters**. `y` up. `+x` = east (plan grid 1 → 6), `+z` = south (grid A → C).
- Origin: intersection of structural axes **1** and **A** at finished floor **±0.00**
  (±0.00 = 261.98 m above sea level).
- The house is modeled axis-aligned; the site (lot, street) is rotated around the house
  to match the site plan (the lot is ~10–12° off true north).

### 5.2 Reference numbers already read from the plans

| Item | Value |
|---|---|
| Axes x (1→6) | 0, 4.75, 9.50, 11.95, 15.60, 18.10 (spacing 4.75/4.75/2.45/3.65/2.50) |
| Axes z (A→C) | 0, 3.75 (B), 7.25 (C) |
| Outer dimensions | 18.71 × 7.91 m (exterior wall ≈ 0.33 m incl. insulation + cladding) |
| Walls | exterior: 25 cm brick + 15 cm mineral wool + metal/wood cladding; interior: 25 cm and 11.5 cm brick |
| Ground floor (parter) | ±0.00, rooms H = 2.68 m, living+kitchen H 3.95 → 6.88 m (open to roof); exterior ground −0.05 |
| Upper floor (etaj) | +2.95, knee wall 1.00 m, sloped ceilings up to ~3.94 m |
| Basement (subsol) | −2.53, storage H = 2.24 m |
| Roof | gable 40°, eaves +4.23, ridge +7.50, chimney top +7.90; low-slope (3°) roofs at +2.73 / +2.90; standing seam every 50 cm |
| Main stairs | 17 risers × 17.4 cm, 16 treads × 29 cm |
| Basement stairs | 14 risers × 18 cm, 13 treads × 28 cm |
| Openings (preliminary, H × W, sill hp) | Ue-01 entrance 2.10 × 1.10; Ui-01..04 interior doors 2.10 × 0.80/0.90; F-02 2.10 × 0.60 hp 0; F-03 1.30 × 0.90 hp 0.80; F-04 1.80 × 1.80 hp 0.68; F-05 2.48 × 2.00 hp 0; F-06 0.60 × 2.00 hp 1.60; F-07 2.50 × 3.30 hp 0; F-08 1.20 × 1.20 hp 1.05; F-09 1.50 × 1.50 hp 0.30; FZ-01 roof windows 0.78 × 1.60 (×7) |
| Site | lot ≈ 33.6 × 17.1 m (574 m²); setbacks: street 6 m, rear 6 m, sides 1 m (north) and 3 m (south); 2 parking spaces (80 m²) on the street side; terrain 261.70–261.91 m (≈ 0.1–0.3 m below ±0.00, nearly flat) |

### 5.3 Room areas (used as automated checks)

| Level | Room | Area (m²) |
|---|---|---|
| Basement | Stairs / Storage | 3.93 / 11.57 |
| Ground | Boiler + laundry / Bathroom / Entrance hall / Stairs / Living + kitchen / Bedroom 1 / Bedroom 2 / Terrace | 5.10 / 6.50 / 12.32 / 7.05 / 47.95 / 13.76 / 14.62 / 37.58 |
| Upper | Bathroom / Bedroom 3 / Hall / Room | 7.48 / 31.36 / 5.71 / 10.33 |

### 5.4 Schema (sketch)

```ts
// src/data/schema.ts
export interface HouseModel {
  grid: { x: Record<string, number>; z: Record<string, number> };   // axes 1..6, A..C
  levels: Level[];            // basement, ground, upper
  roof: Roof;                 // gable + low-slope parts, overhangs, seams, gutters, chimney
  exterior: ExteriorElement[];// entrance canopy, south sunshade + slats, terrace deck, light well
  site: Site;                 // lot polygon, terrain spot heights, paving, parking, lawn, trees, fence, street
}
export interface Level { id: 'basement' | 'ground' | 'upper'; floorY: number;
  walls: Wall[]; openings: Opening[]; rooms: Room[]; slabs: Slab[]; stairs: Stairs[]; voids: Polygon[]; }
export interface Wall { id: string; from: Pt; to: Pt; thickness: number; height: number | 'toRoof';
  layers: { inside: Finish; outside: Finish }; }
export interface Opening { id: string; code: string /* 'F-04', 'Ui-02' */; wall: string;
  offset: number; width: number; height: number; sill: number;
  kind: 'window' | 'door' | 'sliding' | 'curtainWall' | 'roofWindow'; state: 'open'; }
export interface Room { id: string; name: string; level: Level['id']; polygon: Pt[];
  floor: Finish; ceiling: { type: 'flat'; height: number } | { type: 'roof' }; expectedArea: number; }
```

### 5.5 Geometry builders
- **Walls**: each wall's elevation outline (rectangle or gable pentagon) as a
  `THREE.Shape` with rectangular **holes** for openings → `ExtrudeGeometry` by wall
  thickness. No CSG needed; clean topology; correct reveals around windows.
- **Slabs/floors/ceilings**: polygon shapes (with holes for stairs & the living-room void).
- **Sloped ceilings / roof**: computed from 40° pitch, eave and ridge heights; roof
  build-up thickness taken from the section details.
- **Openings**: frames (extruded profiles), glass panes, door leaves rotated fully open,
  sliding doors in open position, curtain wall mullions (instanced).
- **Stairs**: steps from riser/tread data; collider is an invisible ramp.
- **Exterior**: canopy, sunshade with instanced 5×7 cm slats, WPC deck boards, rain
  chains, hidden gutters, snow guards, chimney.
- **Site**: terrain mesh from spot heights (Delaunay), paving/parking/gravel polygons,
  lawn, fence, street, neighbour houses as simple massing boxes (context only).
- **UVs**: world-space box projection (1 UV unit = 1 m), so tiling textures line up
  across merged meshes. UV2 generated later by the baker.
- **Colliders**: separate simplified geometry (walls, floors, ramps, glass, furniture
  boxes, fence) merged into one BVH.

---

## 6. Art direction — plans + The Local Project

> **Owner decision (2026-09-25), applies from I3 onward:** the architecture follows the
> plans exactly; **furniture, interior design and colours follow the style of
> [The Local Project](https://thelocalproject.com.au)** (the design platform the owner
> takes the interior style from). This replaces the earlier Scandinavian direction.
> Completed work (I1 flat palette, S1 sketch look) is **not** redone; the old palette is
> kept in §6.5 for reference.

**What comes from where**
- **Plans (as drawn):** layout, dimensions, facade (grey standing-seam metal RAL 7045,
  natural wood cladding and 5×7 cm slats, frames RAL 1011), and every finish the plans
  specify: parquet floors, tiles (gresie) in wet rooms and the boiler room, white
  interior finish (plaster + white paint), wood-board ceiling in the living room, WPC
  deck, natural stone slabs outside, rod balustrade Ø1 cm.
- **The Local Project style:** furniture, joinery, textiles, lighting, decor, their
  colours and materials, plus the tone/texture of finishes the plans leave open (which
  wood tone for the parquet, which tile, the stone for worktops).

**Character (The Local Project):** warm, quiet, natural. Warm minimalism with natural
materials: solid timber (oak, some darker smoked/American oak), stone (travertine,
honed limestone), clay and ceramics, linen, wool and bouclé, rattan/cane. Muted earthy
palette: sand, oat, clay, ochre, olive, charcoal. Custom timber joinery with integrated
storage, layered textures, sculptural lighting, few but considered objects, and strong
indoor-outdoor flow with daylight doing the work.

### 6.1 Palette (upcoming iterations)

| Role | Color | Hex |
|---|---|---|
| Walls & ceilings (plans: white finish) | warm white | `#F1ECE3` |
| Parquet (plans: parquet) | natural oak, matte oiled | `#C9A77C` |
| Joinery & furniture timber | natural oak / smoked oak | `#C9A77C` / `#6F5440` |
| Stone (worktops, tables, vanity tops) | travertine / honed limestone | `#D9CBB5` / `#CFC6B8` |
| Textiles (base) | linen / oat / bouclé cream | `#E3D9CA` / `#EDE6DA` |
| Textiles (contrast) | sand / warm taupe | `#BFAE98` |
| Accent 1 | clay / terracotta | `#B5714F` |
| Accent 2 | olive | `#7E7F5A` |
| Accent 3 | ochre | `#B98B4E` |
| Deep neutral | charcoal | `#3A3835` |
| Metal details | aged brass / bronze, blackened steel | `#9C7B4E` / `#2E2C2A` |
| Facade (from plans) | grey RAL 7045 / beige-brown RAL 1011 | `#8F9695` / `#8A6642` |

Rule of thumb: ~65 % warm white + natural oak, ~25 % stone/sand/linen textures,
~10 % earthy accent (clay, olive, ochre, charcoal) — one accent leads per room.

### 6.2 Rooms (materials + basic furniture)

Floor/wall/ceiling finishes are those of the plans; everything else is The Local Project style.

| Room | Surfaces (per plans) | Basic furniture & decor (lead accent) |
|---|---|---|
| Entrance hall | oak parquet, white walls | full-height custom oak joinery with integrated bench and hooks, round mirror with brass rim, woven jute runner, ceramic wall light (ochre) |
| Living + kitchen (double height) | oak parquet; white walls; **wood-board sloped ceiling** (plans) | low-slung modular sofa in oat bouclé/linen + a cane lounge chair, large wool/jute rug, travertine coffee table, **dark wood-burning stove at the chimney**; kitchen: oak joinery along the north wall with **travertine** worktop + splashback, stone-topped island with 3 timber-and-leather stools, integrated appliances; solid oak dining table with 6 cane/rattan chairs, sculptural paper/linen pendants; olive tree in a clay pot near the east glass wall (clay/olive) |
| Bedroom 1 | oak parquet, white walls | low oak bed frame, linen bedding in sand/clay tones, oak bedside tables with ceramic lamps, oak wardrobe (clay) |
| Bedroom 2 | oak parquet, white walls | single/kids bed in natural timber, oak desk + cane chair, low open shelf, soft wool rug, wall sconce (ochre) |
| Bathroom (ground) | tiles (plans: gresie) — chosen as warm sand stone-look porcelain, white walls | walk-in shower with glass, floating oak vanity with a stone basin, **brushed brass/bronze** tapware, round mirror, WC, timber towel ladder (sand) |
| Boiler + laundry | tiles (plans) — light warm grey | boiler, washer + dryer stack, oak tall cabinet, linen drying rack |
| Stairs & play corner | oak treads, **black vertical rod balustrade** (Ø1 cm, per plans), handrail h 90 cm | play corner: linen floor cushions, low oak book ledge, woven storage baskets, small timber teepee (olive/oat) |
| Bedroom 3 (upper, under the roof) | oak parquet, white sloped ceilings | low wide oak bed, layered linen + wool throw, bench at the foot, low oak wardrobes along the knee walls, bouclé armchair, sculptural floor lamp (olive) |
| Room (upper, study) | oak parquet, white walls | solid oak desk under the window, cane desk chair, bronze task lamp, oak bookshelf, linen daybed (ochre) |
| Bathroom (upper) | tiles (plans) — honed stone-look | freestanding stone-look tub under the slope, oak vanity, brushed brass tapware, WC (sand/clay) |
| Hall (upper) | oak parquet | railing looking into the living room void (plans), small oak bench |
| Basement storage | concrete floor, white walls | simple oak/steel shelving, woven boxes |
| East terrace (deck, plans: WPC) | WPC deck | solid timber outdoor dining table + benches, 2 cane/teak lounge chairs, large clay planters with olive trees and grasses |

Furniture approach (fits the style and the texture budget):
- **Procedural** (generated in code, consistent style, recolorable): beds, joinery,
  cabinets, kitchen, tables, benches, shelves, sofa (soft rounded boxes), rugs, mirrors,
  simple lamps. They reuse the shared material sets (oak, smoked oak, stone, linen/bouclé,
  cane, brass, ceramic).
- **CC0 models** (Poly Haven / Kenney / Quaternius) only where shape matters: chairs,
  stove, bathroom fixtures, appliances, plants/olive trees, sculptural pendants —
  merged into one atlas.

### 6.3 Fence & gate

Natural materials and the §6.1 earthy palette (The Local Project style); fence heights
and positions follow the site plan where it gives them.

- **Street side**: 1.2 m horizontal slatted fence in oiled timber (natural, weathering
  to silver) on slim **blackened-steel posts**; a matching **sliding car gate** at the
  parking and a pedestrian gate with a bronze mailbox and house number plate (a made-up
  number — no real address).
- **Sides & rear**: 1.8 m vertical board fence in the same timber (privacy), softened by
  a planted border.
- Low **Corten/blackened steel edging** between lawn, paths and planting beds.

### 6.4 Garden

- Trees in small groups on the "proposed trees" positions of the site plan: **olive-toned
  and silver-leaved species** that suit the palette (e.g. birch, serviceberry, a
  multi-stem tree near the terrace) plus 2 fruit trees (apple, cherry) in the rear garden.
- Lawn with a **meadow strip** (tall grasses + wildflowers) along the fences; soft,
  naturalistic planting in sand/olive/ochre tones.
- **Stepping-stone path** (natural stone slabs, per plan) from the entrance around the
  house to the terrace; gravel strip along the facades (drainage, per plan).
- **Raised timber vegetable beds** in a sunny spot on the south side.
- A simple **swing** hanging from a timber frame, and a small **fire pit** with a
  stone/timber bench near the rear.
- Parking: concrete pavers (per plan), bin corner screened by timber slats (per plan
  "platformă gospodărească").
- Context: neighbour houses as simple white/grey massing, a hint of distant hills,
  soft fog.

All of the above is a **proposal** — the owner reviews it during I3–I5.

### 6.5 Earlier Scandinavian palette (used by completed work — reference only)

I1's flat colours and the S1 sketch look were derived from this palette. It is **not**
used for new work; I4 onward switch the realistic materials to §6.1.

| Role | Hex |
|---|---|
| Walls & ceilings / feature walls | `#F4F1EA` / `#D8D2C8` |
| Light oak / linen / wool grey | `#D8B98E` / `#E8E1D5` / `#9A958E` |
| Accents: sage / dusty blue / terracotta / ochre | `#A3B09A` / `#8FA3B3` / `#C27C5E` / `#D0A24C` |
| Soft black metal | `#2B2B2B` |

---

## 7. Player & controls

- Capsule: radius 0.25 m, height 1.75 m, eye height 1.65 m; gravity; walk 1.4 m/s,
  run 3 m/s; small automatic step-up (≤ 0.2 m) for thresholds; ramps on stairs.
- Collision: `three-mesh-bvh` `shapecast` of the capsule against the static collider
  BVH (proven pattern from the library's character-movement example). Camera near
  plane 0.05 m, smaller than the capsule radius → no clipping through walls.
- **Phone**: left half of the screen = floating virtual joystick (custom ~150 lines, or
  `nipplejs`); right half = drag to look; push the joystick to the edge = run.
  Fullscreen + landscape lock on Android (`requestFullscreen` +
  `screen.orientation.lock`); on iOS the PWA "Add to Home Screen" gives full screen.
  Optional gyroscope look (HTTPS required).
- **Desktop**: WASD/arrows + mouse (Pointer Lock), Shift = run.
- Start position: on the street-side parking, facing the house entrance.

---

## 8. UI

- Loading screen with progress bar (assets streamed; house first, furniture later).
- HUD: joystick, menu button, room name toast when entering a room
  (point-in-polygon on the current level).
- Menu: teleport to room, quality tier, look sensitivity, invert Y, FPS/debug overlay.
- **Mini-map**: SVG generated from the same house data (walls + rooms + player arrow),
  per level.
- Settings saved in `localStorage`.
- No personal data (names, address, cadastral numbers) anywhere in the UI or assets.

---

## 9. Libraries

| Package | Purpose | Where |
|---|---|---|
| `three` | Rendering, loaders (GLTF, KTX2, RGBE/EXR), math | runtime |
| `three-mesh-bvh` | Collision, raycasts, GPU BVH for the lightmap baker | runtime + baker |
| `detect-gpu` | Initial quality tier guess | runtime |
| `postprocessing` + `n8ao` | High-tier only: SMAA, bloom, ambient occlusion | runtime (lazy) |
| `nipplejs` (optional) | Virtual joystick (or custom) | runtime |
| `stats-gl`, `lil-gui` | Dev HUD & tuning panels | dev only |
| `xatlas-three` / `xatlasjs` | UV2 lightmap unwrapping (WASM) | baker |
| `ktx2-encoder` (Basis Universal WASM) | Encode lightmaps/textures to KTX2 | baker/tools |
| `@gltf-transform/core`, `/extensions`, `/functions`, `/cli` | Optimize assets: weld, simplify, Meshopt, KTX2, resize | tools |
| `delaunator` | Terrain triangulation | build/runtime |
| `vite`, `typescript`, `vite-plugin-pwa`, `@vitejs/plugin-basic-ssl` | Build, PWA, HTTPS dev server for phone testing | dev |
| `vitest`, `@playwright/test` | Tests, screenshots, perf checks, baker automation | dev |
| `eslint`, `prettier` | Code quality | dev |

All versions pinned exactly in `package.json`.

---

## 10. Project structure

```
house-sim/
├─ goal.md                    # what we want (owner-edited)
├─ plan.md                    # this file
├─ README.md                  # how to run / build / bake / deploy
├─ .gitignore                 # keeps plans, plan images, build output local
├─ architecture-plans/        # source PDFs — LOCAL ONLY, git-ignored, never committed (§13)
├─ .plans-cache/              # rendered PNGs of the plans — LOCAL ONLY, git-ignored
├─ index.html                 # game entry
├─ bake.html                  # dev-only lightmap baker entry
├─ overlay.html               # dev-only: generated model drawn over the local plan rasters
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
├─ public/
│  ├─ assets/
│  │  ├─ textures/            # KTX2 PBR sets (parquet, tiles, plaster, metal, wood, deck, grass…)
│  │  ├─ models/              # optimized .glb furniture, trees, fixtures
│  │  ├─ hdri/                # sky HDRI (1K/2K)
│  │  └─ baked/               # lightmaps + uv2 output of the baker
│  └─ manifest.webmanifest, icons
├─ assets-src/                # original downloaded CC0 assets + LICENSES.md (not shipped)
├─ src/
│  ├─ main.ts                 # boot: detect tier → load → build world → start loop
│  ├─ core/
│  │  ├─ renderer.ts          # WebGLRenderer setup, tone mapping, dynamic resolution
│  │  ├─ loop.ts              # frame loop, fixed-step physics
│  │  ├─ quality.ts           # tiers, detect-gpu, benchmark, settings
│  │  ├─ assets.ts            # GLTF/KTX2/HDRI loaders, progress, caching
│  │  └─ debug.ts             # stats-gl, lil-gui, renderer.info overlay
│  ├─ data/
│  │  ├─ schema.ts            # HouseModel types
│  │  ├─ grid.ts              # axes & levels from the plans
│  │  ├─ ground.ts            # ground floor walls/openings/rooms
│  │  ├─ upper.ts             # upper floor
│  │  ├─ basement.ts          # basement
│  │  ├─ roof.ts              # roof + exterior elements
│  │  ├─ site.ts              # lot, terrain heights, paving, trees, fence
│  │  └─ furniture.ts         # furniture placement per room
│  ├─ world/
│  │  ├─ build.ts             # HouseModel → THREE.Group (+ colliders)
│  │  ├─ walls.ts  slabs.ts  openings.ts  stairs.ts  roof.ts
│  │  ├─ exterior.ts  site.ts  terrain.ts  vegetation.ts
│  │  ├─ furniture/           # procedural furniture kit (The Local Project style) + CC0 model placement
│  │  ├─ materials.ts         # shared material library per tier
│  │  ├─ lighting.ts          # HDRI/PMREM, sun, static shadow fallback, probes, exposure
│  │  ├─ uv.ts                # world-space box UVs
│  │  └─ merge.ts             # merge-by-material, instancing helpers
│  ├─ player/
│  │  ├─ controller.ts        # capsule movement, gravity, step-up
│  │  ├─ collision.ts         # BVH build & shapecast
│  │  ├─ input-touch.ts       # joystick + look
│  │  └─ input-desktop.ts     # keyboard + pointer lock
│  ├─ ui/
│  │  ├─ hud.ts  menu.ts  minimap.ts  loading.ts  toast.ts
│  │  └─ styles.css
│  └─ bake/                   # used by bake.html only
│     ├─ unwrap.ts            # xatlas UV2
│     ├─ gbuffer.ts           # texture-space position/normal/albedo
│     ├─ trace.glsl.ts        # BVH ray tracing shader (sun, sky, bounces)
│     ├─ denoise.ts  dilate.ts
│     └─ export.ts            # KTX2 encode + save
├─ tools/
│  ├─ render-plans.mjs        # PDF → PNG (pdfjs-dist + @napi-rs/canvas), for overlay/reference
│  ├─ optimize-assets.mjs     # glTF-Transform pipeline (assets-src → public/assets)
│  └─ bake.mjs                # Playwright: open bake.html with GPU, save results
├─ tests/
│  ├─ data.test.ts            # room areas vs plan, dimensions, stair math, openings fit walls
│  ├─ reachability.test.ts    # every room reachable from the start point through openings
│  ├─ geometry.test.ts        # no degenerate/overlapping geometry, collider sanity
│  └─ e2e/                    # Playwright: loads, walks a scripted path, perf budget, screenshots
└─ .github/workflows/
   ├─ ci.yml                  # lint, typecheck, unit tests, build
   └─ deploy.yml              # build → GitHub Pages
```

---

## 11. Verification (true to plan + runs on phones)

- **Data tests**: every room polygon area within ±3 % of the plan area (§5.3); outer
  dimensions 18.71 × 7.91; level heights; stair riser/tread math; every opening fits
  in its wall and doesn't overlap another; roof pitch 40°.
- **Reachability test**: graph of rooms connected through door openings/stairs —
  every room reachable from the start point outside (proves "all doors open").
- **Plan overlay tool** (`overlay.html`): orthographic top views per level and the
  four elevations rendered from the generated model, drawn semi-transparent over the
  rasterized PDF sheets at the same scale → visual check that walls, windows and roof
  line up. Also saved as Playwright screenshots for regression.
- **E2E**: headless load, scripted walk (outside → entrance → every room → upstairs →
  basement → terrace → garden), no errors, collider never lets the player through walls.
- **Perf**: debug overlay shows fps, draw calls, triangles, texture memory; checked on the
  reference phones at every iteration (Android via `chrome://inspect` remote debugging).
- **Phone testing during dev**: `npm run dev -- --host` with HTTPS (basic-ssl) on the
  same Wi-Fi → open the LAN URL on the phone.

### 11.1 Testing policy (keep test time low — the dev PC is slow)

The e2e suite renders WebGL in software (SwiftShader), so each rendered frame is slow;
test time must be spent deliberately:

- **While iterating**: `npm test` (unit tests, ~5 s) and, if needed, only the affected
  e2e spec (`npm run e2e:walk` / `e2e:style` / `e2e:perf` / `e2e:mobile`).
- **Before finishing an iteration**: `npm run e2e` once — quick pass: desktop only,
  640×360, no screenshots.
- **Once per iteration (final pass)**: `npm run e2e:full` — adds the 1280×720 desktop,
  Pixel 7 and iPhone 13 projects and all review screenshots.
- Walking in tests is simulated in fixed physics steps with a single rendered frame at
  the end (no real-time waiting). New tests must follow this pattern and batch several
  moves per page round-trip.
- Tests run serially (1 worker) — no parallel runs, the machine can't take it.
- Don't re-run the full e2e suite repeatedly: at most 2–3 full runs per iteration; fix
  failures with the single affected spec. Flaky/environmental (SwiftShader) failures are
  noted, not chased.

---

## 12. Roadmap (iterations, steps & status)

Legend: ✅ done · 🔄 in progress · ⬜ not started · ⏸ blocked.
Every iteration ends with something **deployed to the public link** and tested on a phone.
Order note: furniture (I5) comes **before** baked lighting (I6) so furniture shadows get baked.

### I0 — Planning ✅

| # | Step | Status |
|---|---|---|
| 0.1 | GitHub repo `psticea/house-sim` created (public) | ✅ |
| 0.2 | Architecture plans read (text + rendered images) and summarized | ✅ |
| 0.3 | `goal.md` — vision, requirements, decisions | ✅ |
| 0.4 | `plan.md` — tech choices, budgets, art direction, roadmap | ✅ |
| 0.5 | `.gitignore` — PDFs and derived plan images stay local only | ✅ |

### I1 — First walk (first deliverable) ✅

**Deliverable:** a public GitHub Pages link. On a phone (and desktop) you start outside on
the lot next to the parking, walk up to the house, enter through the north entrance and
visit **every ground-floor room** through open doors, and step out onto the east terrace
through the glass wall. True-to-plan walls, openings and ceiling heights; simple roof shell
so the house reads correctly from outside. Flat Scandinavian palette colors (no textures
yet), simple sun + sky lighting with a static shadow. Upper floor and basement are visible
but not walkable yet (stairs blocked).

**Why this first:** it proves the whole pipeline end-to-end (data from plans → generated
geometry → mobile controls → deploy) on the hardest parts — accuracy and phone
performance — before investing in looks.

| # | Step | Status |
|---|---|---|
| 1.1 | Scaffold: Vite + TypeScript (strict) + three (pinned), ESLint/Prettier, Vitest; scripts `dev`, `build`, `test`, `lint`, `typecheck` | ✅ |
| 1.2 | CI workflow (lint, typecheck, test, build) + deploy workflow to GitHub Pages (Vite `base: '/house-sim/'`); enable Pages → "GitHub Actions" in repo settings (owner) | ✅ `ci.yml` + `deploy.yml` (upload-pages-artifact + deploy-pages); Pages source = GitHub Actions |
| 1.3 | Core: renderer (WebGL2, DPR cap 1.5, AgX tone mapping), resize, frame loop, debug overlay (fps, draw calls, triangles, texture memory) | ✅ (ACES Filmic by default — kept the palette more saturated than AgX; `?tonemap=agx` switches) |
| 1.4 | `tools/render-plans.mjs`: PDF → PNG into git-ignored `.plans-cache/` (local reference for extraction & overlay) | ✅ |
| 1.5 | Data schema (`schema.ts`) + grid & levels (`grid.ts`) | ✅ |
| 1.6 | Ground-floor data (`ground.ts`): exterior & interior walls, all openings of sheet 05 (Ue/Ui doors, F windows, curtain wall), room polygons with expected areas, terrace | ✅ |
| 1.7 | Data tests: room areas ±3 %, outer dims 18.71 × 7.91, openings fit walls & don't overlap, reachability of every ground-floor room from the start point | ✅ all 8 ground-floor areas within ±3 % (terrace 37.42 vs 37.58, others ≤ 0.01 m² off) |
| 1.8 | Builders v1: walls with opening holes (incl. gable walls), ground slab, ceilings at 2.68 m, upper-floor slab (as ceiling), simple roof shell (40°, eaves +4.23, ridge +7.50) + low-slope roofs, living-room open to the roof, merge-by-material | ✅ |
| 1.9 | Openings v1: simple frames, glass panes, door leaves open 90°, sliding doors open | ✅ |
| 1.10 | Site v1: flat lawn on the lot outline (rotated as on the site plan), parking pad, entrance path, terrace deck; no fence yet | ✅ |
| 1.11 | Player: capsule + three-mesh-bvh collision, gravity, step-up ≤ 0.2 m, start pose at the parking facing the entrance; stairs blocked by an invisible collider | ✅ |
| 1.12 | Input: touch (left joystick, right drag-look, edge = run) + desktop (WASD + pointer lock, Shift = run) | ✅ |
| 1.13 | Look v1: palette colors from §6.1 as flat materials, glass, hemisphere + sun with a shadow map rendered once, gradient sky + light fog | ✅ |
| 1.14 | Room name toast on entering a room (point-in-polygon) | ✅ |
| 1.15 | Overlay page (`overlay.html`, dev only): top view of generated ground floor over sheet 05 → alignment checked | ✅ `.plans-cache/overlay-05.png` (local only) — walls/openings align with sheet 05 |
| 1.16 | Playwright smoke test: loads without errors, scripted walk visits every ground-floor room | ✅ 8 Playwright tests (desktop + Pixel 7 + iPhone 13 emulation, SwiftShader) |
| 1.17 | Phone test on a reference device: record fps / draw calls / triangles in the progress log | ⏸ needs owner device test — proxy (SwiftShader, no GPU): 17–22 draw calls, ~4.0–4.3 k triangles rendered, 32 MB est. texture memory |
| 1.18 | Release `v0.1`: public URL in `README.md`, status here updated | 🔄 pushed by coordinator; owner to test |

**Done when:** link works on phone + desktop · every ground-floor room reachable, no
walking through walls · all data tests green · overlay matches sheet 05 · ≥ 50 fps on
the reference phone · no personal data in the repo or the app.

### S1 — Sketch style (default look) ✅

**Deliverable:** a hand-drawn architectural look — mostly SketchUp, a light touch of
cartoon shading. **Owner decision (2026-09-25): sketch is the default** when visiting the
site (no parameter or `?style=sketch`); the realistic look is optional via
`?style=real` (or key K / `__houseSim.setStyle('real')`), and I4/I6 continue as planned
for the realistic mode (the sketch look is restyled on top of it). Only materials, lighting and rendering
change; data, geometry builders, player and logic are untouched. No external files:
any texture is generated on a `<canvas>`. Can be done before or after I2 (it restyles
whatever the scene contains, so it keeps working as the building grows).

**Spec** (new `src/world/style.ts`, called from `src/app.ts` after the world is built):
- `STYLE` config at the top: `{ bands: 3, bandBrightness: [0.75, 0.9, 1.0], lineColor:
  0x2a2a2a, lineWidth: 1.3, fatLines: 'always'|'desktop'|'never', edgeThresholdDeg: 30,
  jitter: 0.003, shadowOpacity: 0.35, paperOverlay: 0.05, pastel: { saturation, lightness },
  groundPattern: 'grid'|'hatch'|'none' }`.
- `applyStyle(scene, materials)`: traverses the scene, skips the hidden collider, swaps to
  one **shared** `MeshToonMaterial` per material id with a 3-step `DataTexture` gradient
  map (`NearestFilter`, subtle bands); colors from `PALETTE` keep their hue, softened to
  light pastels; `polygonOffset` (1, 1) on fills. Idempotent (tagged via `userData`):
  calling it twice never duplicates lines or leaks; switching styles disposes cleanly.
- Edges: `EdgesGeometry(geometry, 30)` once per merged mesh; `LineSegments2` +
  `LineMaterial` (~1.3 px) on desktop, `LineBasicMaterial` on phones; optional one-time
  jitter on line vertices only; no lines on glass, ground (lawn/field/asphalt) or the
  collider; weld vertices first if merged geometry produces stray coplanar lines.
- Glass: keeps transparency, `depthWrite: false`, render order.
- Lighting: existing hemisphere + sun; soft single 1024 shadow map rendered once;
  shadow darkness from `shadowOpacity` (light balance or a small `onBeforeCompile`
  tweak) — never black; Neutral/no tone mapping so pastels stay true.
- Background: paler warm gradient sky + matching fog; canvas-noise paper-grain CSS
  overlay (~5 %, no pointer events, under the HUD). Ground surfaces get a subtle
  canvas grid/hatch map using the existing world-space UVs.
- Performance: no SSAO/bloom/post-processing; DPR ≤ 1.5; antialias only; shared
  materials/geometries; total draw calls ≤ 60.

| # | Step | Status |
|---|---|---|
| S.1 | `style.ts` with `STYLE` + `applyStyle`, `?style=sketch\|real` switch | ✅ sketch by default (`parseStyle`: no/unknown value → sketch, `?style=real` → realistic); `src/world/style.ts` (`applyStyle` / `removeStyle` / `setStyle` / `getStyle`, idempotent, per-scene state) + `src/world/style/` (`config.ts` = `STYLE`, `edges.ts`, `textures.ts`); `window.__houseSim.setStyle()/getStyle()`, key **K** |
| S.2 | Toon materials + pastel colors + canvas ground pattern | ✅ one shared `MeshToonMaterial` per material id, 3-texel `NearestFilter` gradient `[0.75, 0.9, 1.0]`, sRGB-HSL pastels (hue kept; ground surfaces paler), polygon offset (1, 1); generated `DataTexture` grid (1 m + 0.5 m, mipmapped, anisotropy ≤ 4) on lawn/field/asphalt/pavers |
| S.3 | Edge lines (fat on desktop, basic on phones), jitter, no stray lines | ✅ own feature-edge extractor (EdgesGeometry semantics at 30°, but T-junction-safe: collinear overlapping edges are split and only drawn where a face ends without a smooth continuation — EdgesGeometry drew stray lines there), cached per geometry; `LineSegments2` 1.3 px on desktop, `LineSegments` on phones; deterministic line-end overshoot ≤ 0.3 % of the segment and ≤ 1.2 cm; no lines on glass, lawn, field, asphalt |
| S.4 | Lighting, soft shadow, sky/fog, paper overlay | ✅ existing hemi + sun re-balanced; 1024 shadow map, PCF radius 3 (r186 removed `PCFSoftShadowMap`), darkness via native `shadow.intensity` derived from `shadowOpacity` (no shader patch needed); Neutral tone mapping; pale sky gradient + matching fog; DPR ≤ 1.5; 5 % multiply paper-grain overlay under the HUD |
| S.5 | Tests: idempotent `applyStyle`, no leaks on switch; e2e screenshots per style; draw calls ≤ 60 | ✅ 13 unit tests (`tests/style.test.ts`, incl. the `?style=` default) + `tests/e2e/style.spec.ts` (default load = sketch, `?style=real` = realistic, `?style=sketch` still works; desktop + 390×844 phone; no console errors/warnings; counts stable over 3 toggles; real after toggling is pixel-identical to a fresh load); the I1 walk/mobile/perf specs run in the default sketch look |
| S.6 | Report which `STYLE` values push toward more SketchUp vs more cartoon; deploy | ✅ tuning guide in README "Styles"; deployed with the next push |

### S2 — Three styles + style toggle ✅

**Deliverable:** three distinct, switchable looks of the same scene, and a **small,
always-visible style toggle** on phone and desktop:

| Style | Id | What it is |
|---|---|---|
| **SketchUp** (default) | `sketchup` | The S1 look (owner likes it), renamed. Kept as is; only knobs that make it *more* SketchUp and less cartoon may be nudged, without changing its character (see S2.2). |
| **Borderlands** | `borderlands` | **New.** Cel-shaded "hand-inked comic / concept art": thick black ink outlines, hard two-tone shading, ink hatching in shadow, saturated warm colours, painted-looking surfaces, bold stylised sky. |
| **Realistic** | `real` | The I1 look; I4/I6 keep improving it. |

`?style=sketch` stays accepted as an alias of `sketchup`. Only materials, lighting and
rendering differ — data, geometry, player and logic are untouched. No external files: any
texture is generated on a `<canvas>` / `DataTexture`.

**Architecture** — refactor `src/world/style.ts` into a small style registry:
- `StyleName = 'real' | 'sketchup' | 'borderlands'`; `setStyle(name)` works from any style
  to any style (remove current → apply next), idempotent, leak-free.
- One config per style (`src/world/style/sketchup.ts`, `borderlands.ts`, each exporting
  its own `STYLE`-like object as the single place to tune it); shared helpers stay in
  `src/world/style/` (toon materials, edge extractor, canvas textures, sky, overlays).
- Per-style GPU resources are built lazily on first use and cached (edges, hulls, textures),
  so switching back and forth never grows memory; `removeStyle` disposes nothing that
  the cache still needs, and a full `disposeStyles()` frees everything.

**Borderlands spec** (performance-first, no post-processing):
- **Outlines — the signature.** Thick black ink lines (`#111`, ~2.5–3.5 px) on every
  feature edge using the existing T-junction-safe edge extractor + `LineSegments2` on
  **all** devices (thick lines are essential for the look; they are instanced quads,
  cheap at this scene size). Two weights: outer/boundary + sharp (≥ 60°) edges thick,
  softer creases (30–60°) thinner. For curved/non-planar meshes (chimney now; trees and
  furniture later) add **inverted-hull silhouettes** (back faces, pushed out along
  averaged normals in clip space for a constant pixel width, unlit black) — only where
  needed, to stay inside the draw-call budget.
- **Shading:** `MeshToonMaterial` with a hard 2-step gradient (e.g. `[0.5, 1.0]`, optional
  thin 3rd highlight band), shadows **tinted** (cool violet-blue, not grey) and fairly
  dark (~0.55), with **screen-space ink hatching** in the shadow band (diagonal lines from
  `gl_FragCoord` in a small `onBeforeCompile` patch — no texture fetch, program-cached).
- **Colour:** palette hues kept but pushed to saturated, warm, slightly darker comic
  colours (saturation ×~1.25); glass tinted, still transparent, thin outline only.
- **Surfaces:** canvas-generated "hand-painted" detail maps (brush strokes, ink speckle,
  grunge) at low strength on large surfaces (walls, roof, ground, deck), world-space UVs;
  painted grass strokes on the lawn instead of the grid.
- **Sky & light:** bold stylised gradient (warm yellow-orange horizon → teal zenith) with
  a few flat cartoon clouds baked into the sky shader/canvas; strong warm sun, hard-ish
  single 1024 shadow rendered once; matching fog; no paper grain (optional subtle CSS
  vignette knob).
- **Budgets:** draw calls ≤ 80 (fills + lines + a few hulls; global budget is 120),
  DPR ≤ 1.5, antialias only, no SSAO/bloom/post-processing, shared materials.

**Style toggle (UI):**
- A small pill button in the **top-right** corner (respects safe-area insets), showing
  the current style (icon + short name). Tap/click opens a compact 3-option menu
  (SketchUp · Borderlands · Realistic, current one highlighted); selecting applies
  immediately; tap outside closes. Visible on both phone and desktop, above the
  canvas and paper grain, consistent with the HUD styling.
- Touch-safe: touches on the toggle never start the joystick or look-drag; on desktop
  clicking it doesn't trigger pointer lock; while pointer-locked, **K** cycles styles
  (and the pill updates). ≥ 40 px hit target while visually small; `button` with
  `aria-label`, keyboard-focusable.
- Choice persists in `localStorage`; `?style=` in the URL overrides it for that load.
  If building a style for the first time takes > 100 ms, show a brief "Switching…" state.

| # | Step | Status |
|---|---|---|
| S2.1 | Style registry refactor (`real` / `sketchup` / `borderlands`, `sketch` alias), any→any `setStyle`, per-style configs, lazy per-style caches | ✅ `src/world/style.ts` registry: `setStyle(scene, name)` any→any (current look removed, next applied; same look again only styles new meshes), `getStyle()` canonical, `isStyleBuilt()`, `removeStyle()`, `disposeStyles()`; names in `core/params.ts` (`sketch` alias, unknown → `sketchup`); configs `style/sketchup.ts` + `style/borderlands.ts` (shape in `style/config.ts`); per-scene, per-look caches (fills, line/hull objects, textures, sky, overlays) built on first use, re-attached on re-apply, never rebuilt; edge cache keyed per geometry + settings |
| S2.2 | SketchUp = S1 look renamed (character unchanged; optional small "more SketchUp" nudges only if they read better) | ✅ identical S1 values (no nudges — the S1 look already reads right); same pipeline output |
| S2.3 | Borderlands outlines: two-weight thick fat lines on all devices + inverted-hull silhouettes for curved meshes | ✅ `#111` `LineSegments2` everywhere: 3.2 px for boundaries + creases ≥ 60°, 2.2 px for 33–60° (weighted T-junction-safe extractor); edge threshold 33° so 12-gon facets get no lines — instead a clip-space constant-width (3.2 px) back-face hull, built only from "curved" facets (≥ 2 soft-crease neighbours) → only the chimney today; glass gets a thin outline |
| S2.4 | Borderlands shading: hard 2-step toon, tinted dark shadows, screen-space shadow hatching, saturated palette, painted detail maps | ✅ gradient `[0.5, 1.0]`; `onBeforeCompile` ink patch (hooks checked against the r186 chunks in a unit test, falls back to plain toon if missing; one program key, shared uniforms): shadow band tinted violet-blue, single `gl_FragCoord` hatching in form shadows, crossed hatching in cast shadows on sun-facing surfaces; palette saturation × 1.25, lightness × 0.93; generated brush-stroke / grunge / ink-scratch detail map on walls, roof, cladding, deck, pavers, floors (4 m tiles) and painted grass tufts on the lawn (2.4 m tiles), all `DataTexture`s with world-space UVs |
| S2.5 | Borderlands sky, clouds, sun, shadow, fog | ✅ own sky material swapped onto the dome: warm yellow-orange horizon → teal zenith, 10 flat-bottomed cartoon clouds (seeded puffs, shade band, `fwidth` ink outline), inked sun disc; warm sun 2.4 + violet hemi 1.9, `shadowOpacity` 0.45, hard 1024 shadow (PCF radius 1) rendered once per switch; warm fog; no paper grain, soft CSS vignette |
| S2.6 | Style toggle UI (pill + 3-option menu, K cycles, localStorage, URL override, touch/pointer-lock safe) | ✅ `src/ui/style-toggle.ts`: top-right pill (safe-area aware, 40 px hit target, icon + name, `aria-label`, keyboard: Enter/Space/arrows/Esc), menu SketchUp · Borderlands · Realistic (current highlighted, `menuitemradio`), tap outside closes; above the start overlay; events never reach the canvas (joystick/look/pointer lock untouched, no `src/player/` change needed); K cycles; `localStorage` `houseSim.style`, `?style=` overrides for one load; "Switching…" while a look is built the first time |
| S2.7 | Tests: unit (parse incl. alias/unknown → default, apply/remove idempotent per style, all 6 transitions leak-free); e2e quick (toggle visible on desktop + phone, each option switches, persists across reload, no console errors/warnings, draw-call budgets per style); `e2e:full` screenshots 3 styles × 5 poses × desktop/phone | ✅ 23 unit tests in `tests/style.test.ts` (62 total); `tests/e2e/style.spec.ts`: quick pass = toggle (click, outside tap, K, keyboard, reload persistence, `?style=` override + alias, player/overlay/pointer lock untouched), budgets per look at start + living room, leak-free transitions ×2, clean console; full pass adds an iPhone 13 touch check (drag on the pill starts no joystick/look) and 3 looks × 5 poses × desktop-hd/phone screenshots |
| S2.8 | README "Styles" (3 styles, toggle, per-style tuning knobs), plan status, deploy | ✅ README "Styles" (incl. "push toward …" guides per look); deploy with the next push (coordinator) |

**Done when:** all three looks are clearly distinct and polished (reviewed screenshots),
the toggle works on phone and desktop without interfering with movement, switching any
style to any other is leak-free, budgets are met (SketchUp ≤ 60, Borderlands ≤ 80, Real
≤ 25 draw calls), and all tests are green.

### I2 — Whole building ✅

| # | Step | Status |
|---|---|---|
| 2.1 | Upper-floor data (`upper.ts`): knee walls 1.00 m, rooms, openings F-02/F-08/F-09, void railing | ✅ sheet 06 vectors (axis 1 = 195.16 pt, A = 256.575 pt): 11 interior walls (roof-following tops; walls parallel to the eaves reach the higher face so no gap at the slope), doors Ui-02/03/04 (open, leaves as drawn), F-02 90 × 90 hp 80 into the void, F-08/F-09 on the west gable; knee wall = exterior walls up to the roof underside +3.95; structural slab 2.68 → 2.94 + finishes at +2.95; stair well cut out. The void is closed off by walls on sheet 06 (no open gallery edge) — it is seen through F-02; the "parapet riflaj Ø 1 cm" is the rod balustrade of the stair well (on the middle wall, collider on its stair-side face) |
| 2.2 | Basement data (`basement.ts`): stairs + storage, level −2.53 | ✅ sheet 04 (axis 1 = 200.25 pt, B = 273.25 pt): 25 cm concrete walls, storage H 2.24 (ceiling −0.29), window F01 1.15 × 0.75 hp 1.00 into the light well; storage polygon = plan fill + the 21 cm strip in front of the bottom step (where the stair opens into it), +1.7 % |
| 2.3 | Main stairs (17 × 17.4 cm / 16 × 29 cm) and basement stairs (14 × 18 cm / 13 × 28 cm) with rod balustrade + handrail; ramp colliders | ✅ main: 8 treads up the east flight (z 3.625 → 5.945), landing (riser 9), 7 treads up the west flight to riser 17 at z 3.875 (tread fills of sheet 06); basement: 7 treads down the west side from z 4.168, 3 winders, 3 treads east under the landing (sheet 04 numbering). Geometry divides the level difference exactly (2.95 / 17, 2.53 / 14). Walking ramps through the nosings (+ helicoid over the winders) replace the I1 blocker; ground snapping in the controller for smooth descent. Rod balustrade on the living-room side and on the middle wall, wall handrails 90 cm |
| 2.4 | Sloped ceilings following the 40° roof; wood-board ceiling in the living room | ✅ plaster under the upper segment; 15 cm boards with 1 cm joints under the living/loggia segments; ceiling heights vs sheet 06 labels: 1.00 at the knee walls, 3.94 bedroom 3, 3.84 bathroom (exact); study/hall labels 2.87 / 2.98 are 4–5 cm above the 40° plane at the wall (kept the I1 roof: eaves +4.23, ridge +7.50, living 3.95 → 6.88) |
| 2.5 | Roof details: standing seams (instanced), hidden gutters, snow guards, 7 roof windows FZ-01, chimney | ✅ merged per material (the style system works per merged mesh, not instances): seams every 50.05 cm from x −0.121 (sheet 07), interrupted at windows/chimney; recessed hidden gutters (also in the gable outline); 2-tube snow guards at 0.41 m from the eaves (+4.61, elev. 10); 7 FZ-01 (3 N + 4 S — sheet 07 and elevations 09/10 agree) as openings through sheet and ceiling with ⟂ reveals, outer frame + glass, inner sash; chimney collar + rain cap |
| 2.6 | Exterior elements: entrance canopy, south sunshade with 5×7 cm slats, rain chains, light well | ✅ canopy/sunshade tops with seams, wood soffits, black sunshade fascia, gutter spouts to the chains; two rain chains (stylised diamond links); light well (15 cm walls, bottom −1.65, grating) |
| 2.7 | Tests: upper/basement areas, stair math, reachability of **all** rooms on all levels | ✅ `tests/building.test.ts` (areas ±3 %, levels, ceiling heights, stair riser/tread math, ramps touching every nosing, helicoid ≤ 40°, cross-level reachability, `locate()`), geometry test (floors on 3 levels, ramps, head room); e2e walk: outside → hall → up → every upper room → void → down → basement → storage → back up, railings/F-02 block |
| 2.8 | Overlay: sheets 04, 06, 07 (top views) and 08–10 (elevations) match | ✅ `overlay.html?sheet=04…10`: plan sections, roof top view (feature edges), orthographic WebGL elevations; screenshots in `.plans-cache/overlay-*.png` (local) — walls, openings, seams, windows, eaves/ridge, canopy/sunshade levels line up within a few cm |
| 2.9 | Deploy `v0.2` + phone perf check | ⏸ real-phone check pending (deploy by the coordinator) |

### I3 — Garden & fence ⬜

| # | Step | Status |
|---|---|---|
| 3.1 | Terrain from spot heights (Delaunay), lot outline, setbacks | ⬜ |
| 3.2 | Paving: parking pavers, stepping-stone path, gravel strips, bin corner | ⬜ |
| 3.3 | Fence & gates (§6.3), street, neighbour massing, distant backdrop | ⬜ |
| 3.4 | Vegetation: birches, fruit trees, meadow strip, shrubs (instanced, solid low-poly, LOD) | ⬜ |
| 3.5 | Garden features: raised beds, swing, fire pit + bench | ⬜ |
| 3.6 | Walk all around the garden; fence colliders | ⬜ |
| 3.7 | Deploy `v0.3` + phone perf check | ⬜ |

### I4 — Materials & textures ⬜

For the realistic mode (`?style=real`); the default sketch look (S1) keeps its own flat toon materials.

| # | Step | Status |
|---|---|---|
| 4.1 | Asset pipeline `tools/optimize-assets.mjs` (glTF-Transform, KTX2, resize per tier) + `assets-src/LICENSES.md` | ⬜ |
| 4.2 | Hero sets (parquet, bathroom tiles, exterior wood) and standard sets (§3.1) | ⬜ |
| 4.3 | World-space UVs, anti-tiling, detail maps | ⬜ |
| 4.4 | Glass, window/door frames in RAL colors, metal facade | ⬜ |
| 4.5 | HDRI + PMREM, interior reflection probes, eye adaptation | ⬜ |
| 4.6 | Quality tiers (detect-gpu + benchmark), dynamic resolution, settings override | ⬜ |
| 4.7 | Texture-memory check in Playwright (medium ≤ 75 MB) | ⬜ |
| 4.8 | Deploy `v0.4` + phone perf check | ⬜ |

### I5 — Basic furniture ⬜

| # | Step | Status |
|---|---|---|
| 5.1 | Procedural furniture kit (beds, wardrobes, cabinets, kitchen, tables, benches, shelves, sofa, rugs, mirrors, lamps) | ⬜ |
| 5.2 | CC0 models: chairs, stove, bathroom fixtures, appliances, plants, pendants → one atlas | ⬜ |
| 5.3 | Furniture placement per room (`furniture.ts`, §6.2) + colliders | ⬜ |
| 5.4 | Terrace & garden furniture | ⬜ |
| 5.5 | Lazy-load furniture after the house; deploy `v0.5` + perf check | ⬜ |

### I6 — Baked lighting ⬜

For the realistic mode (`?style=real`); the default sketch look (S1) keeps its soft single shadow.

| # | Step | Status |
|---|---|---|
| 6.1 | UV2 unwrap with xatlas, atlas packing | ⬜ |
| 6.2 | Texture-space G-buffer | ⬜ |
| 6.3 | GPU ray tracing (sun, sky, 2–3 bounces) with three-mesh-bvh, progressive accumulation | ⬜ |
| 6.4 | Denoise, dilate, encode KTX2, `npm run bake` via Playwright | ⬜ |
| 6.5 | Runtime: lightmaps replace the shadow-map fallback; compare screenshots | ⬜ |
| 6.6 | Deploy `v0.6` + perf check | ⬜ |

### I7 — UI & PWA ⬜

| # | Step | Status |
|---|---|---|
| 7.1 | Loading screen with progress | ⬜ |
| 7.2 | Menu: teleport to room, quality, sensitivity, invert Y, debug toggle | ⬜ |
| 7.3 | Mini-map per level (SVG from house data) | ⬜ |
| 7.4 | PWA: manifest, icons, offline cache, fullscreen/landscape | ⬜ |
| 7.5 | Deploy `v0.7` | ⬜ |

### I8 — Performance & polish ⬜

| # | Step | Status |
|---|---|---|
| 8.1 | Profile on Android + iPhone reference devices; fix hot spots | ⬜ |
| 8.2 | All §3 budgets met; loading ≤ 6 s on 4G | ⬜ |
| 8.3 | Visual polish pass (materials, light, garden) with owner review | ⬜ |
| 8.4 | Release `v1.0` | ⬜ |

**Later** (goal.md nice-to-haves): time-of-day (2–3 baked sun positions blended),
material/color variations, measure tool, gyroscope/VR mode.

### Progress log

| Date | Iteration / step | Note |
|---|---|---|
| 2026-09-24 | I0 | Planning complete: plans read, `goal.md` + `plan.md` written, PDFs kept local only |
| 2026-09-25 | I1 | First walk implemented. Checks green: lint, typecheck, 39 unit tests (4 files: data incl. 8 room areas ±3 %, reachability, geometry, privacy), build (637 kB JS / 168 kB gzip), 8/8 e2e (1 teleport-settle flake fixed in the test hook). Room areas expected→actual m²: bedroom-1 13.76→13.76, boiler 5.10→5.10, hall 12.32→12.31, bathroom 6.50→6.50, bedroom-2 14.62→14.63, stairs 7.05→7.05, living+kitchen 47.95→47.95, terrace 37.58→37.42. Perf proxy (SwiftShader): 17–22 draw calls, 4.0–4.3 k triangles, scene 3.7 k tris / 992 collider tris, ~32 MB textures; fps not meaningful in software GL — real-phone ≥ 50 fps check pending (1.17). |
| 2026-09-25 | S1 | Optional sketch style (`?style=sketch`, key K, `__houseSim.setStyle`). Checks green: lint, typecheck, 51 unit tests (12 new), build, e2e incl. the new style spec. Perf proxy (SwiftShader, desktop 1280×720): real 22 / 17 draw calls at start / living room (4.3 k / 4.0 k tris); sketch 39 / 29 draw calls (fills unchanged + one line draw per lined mesh); `renderer.info` triangles 27.0 k / 25.0 k because fat lines are instanced quads (~6 tris per segment, ~3.8 k segments in view); phones use 1 px GL lines. Shadow map 1024 in sketch (8 MB) vs 2048 in real (32 MB). |
| 2026-09-25 | S1 | Owner change: **sketch is now the default look**; `?style=real` switches to the realistic look (`?style=sketch` still works). I1 e2e specs run against the default (sketch); the style spec checks default = sketch, `?style=real` = real and leak-free toggles; perf spec also records the realistic look at the living-room pose. |
| 2026-09-25 | S2 | Three looks + style toggle: SketchUp (default, = S1), **Borderlands** (new), Realistic; top-right pill + menu, K cycles, `localStorage` + `?style=` override. Checks green: lint, typecheck, 62 unit tests (23 in `style.test.ts`), `npm run e2e` 7/7, `npm run e2e:full` 13/13 (7 project-specific skips) incl. iPhone 13 toggle-touch check and 3 looks × 5 poses × desktop-hd/phone screenshots (`test-results/style-shots/`). Perf proxy (SwiftShader) draw calls / `renderer.info` triangles at start → living room — desktop 640×360: SketchUp 39 / 27.0 k → 29 / 25.0 k; Borderlands 44 / 27.8 k → 31 / 25.6 k; Real 22 / 4.3 k → 17 / 4.0 k. Phone emulation (390×844 / Pixel 7): SketchUp 35 / 4.3 k → 29 / 4.0 k (1 px GL lines); Borderlands 38 / 27.6 k → 31 / 25.6 k (fat lines on phones too: instanced quads); Real 17 / 4.0 k (living). All within budgets (60 / 80 / 25). Switching is leak-free (geometry/texture counts identical on every revisit; each look's resources built once and cached). |
| 2026-09-25 | I2 | Whole building: upper floor (sheet 06), basement (sheet 04), walkable main + basement stairs (nosing ramps + winder helicoid, ground snapping), sloped ceilings, living-room board ceiling, roof windows/seams/gutters/snow guards/chimney cap, canopy/sunshade/rain chains/light well; overlay for sheets 04–10. Areas expected → model m²: upper bathroom 7.48 → 7.48, bedroom 3 31.36 → 31.36, hall 5.71 → 5.72, study 10.33 → 10.42 (+0.9 %, walls at x 4.74), basement stairs 3.93 → 3.93, storage 11.57 → 11.77 (+1.7 %, strip at the stair foot); ground floor unchanged. Stairs: 17 × 2.95/17 (17.4 printed, Δ 8 mm), 16 goings × 29 cm; 14 × 2.53/14 (18 printed, Δ 1 cm), 13 goings × 28 cm. Checks: lint, typecheck, 83 unit tests (6 files; the two whole-house style tests got a 30 s timeout — edge extraction of the bigger model exceeded 5 s under parallel load once), build (715 kB / 193 kB gzip), `npm run e2e` 8/8 (2 skips), `npm run e2e:full` 13/14 on the first run — the iPhone 13 screenshot test hit its 600 s timeout (SwiftShader at DPR 3, heavier scene); timeout raised to 900 s and that test re-run alone: passed (9.3 min). Perf proxy (SwiftShader; start / living from the 640×360 specs, upper hall = top of the stair from the review shots) draw calls / `renderer.info` triangles — start / living / upper hall: SketchUp 41 / 69.4 k, 31 / 66.2 k, 40 / 69.3 k; Borderlands 46 / 70.1 k, 35 / 66.9 k, 44 / 70.1 k; Real 23 / 10.0 k, 18 / 9.5 k, 23 / 10.0 k (budgets 60 / 80 / 25 met). Scene 9.4 k triangles, collider 1.5 k; Pixel 7 (SketchUp, GL lines) 37 / 9.9 k at start. Fat-line triangles grew with the new edges (≈ 11 k segments in view). Phone check pending (2.9). |

---

## 13. Risks & decisions

1. **Plans' copyright + personal data (decided)** — the repo and the game link are
   **public**. The PDFs (which carry the architect's copyright notice and include names,
   the address and the cadastral number) stay **local only**: `architecture-plans/` and
   the rendered images in `.plans-cache/` are in `.gitignore`. Only derived dimensions
   are committed; no names, address, land-registry numbers or plan images in the repo,
   the app or screenshots (overlay screenshots stay local too).
2. **Lightmap baker complexity** — mitigated: the fallback lighting (I4) is already
   shippable; the baker only improves it.
3. **Reading dimensions from the plans** — mitigated by area tests + the overlay tool.
   Details not on the plans (fence, garden, furniture, interior colours) follow the
   The Local Project–style proposal in §6, reviewed by the owner.
4. **iOS Safari memory limits / WebGL context loss** — keep inside the texture/geometry
   budget, handle `webglcontextlost` by reloading gracefully.
5. **Transparency & vegetation overdraw on mobile** — solid low-poly vegetation,
   minimal glass layers, instancing.
6. **Asset licensing** — CC0 only, every asset recorded in `assets-src/LICENSES.md`.
