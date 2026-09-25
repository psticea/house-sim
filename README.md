# House Sim

A walkable, first-person 3D model of a family house (to be built) and its garden —
phone first, also desktop. The whole house is **generated in code** from a typed data
model transcribed from the architectural drawings (no Blender), rendered with three.js.

**Live:** https://psticea.github.io/house-sim/

- What we want: [`goal.md`](goal.md) · How and roadmap: [`plan.md`](plan.md)
- Current release: **I5 "Basic furniture"** — every room furnished in the style of The
  Local Project (warm minimalism: solid oak joinery, travertine, oat linen / bouclé, sand
  wool, cane, clay, aged brass): oak hall joinery with a bench niche and a round brass
  mirror; kitchen with travertine worktop + splashback, integrated appliances and an
  island with three leather stools; a low linen sofa, travertine coffee table, a
  wood-burning stove on a hearth, oak dining table with six cane chairs, paper
  pendants, a cane lounge chair and an olive tree by the glass; a play corner with a
  teepee, cushions, book ledge and baskets; low oak beds with layered linen, bedside
  lamps and wardrobes (low ones along the attic knee walls), a kids' desk corner, a study
  with desk, bookshelf and daybed; bathrooms with floating oak vanities, stone vessel
  basins, brass tapware, a walk-in shower, WC and a freestanding stone tub under the
  slope; boiler + washer / dryer stack; basement shelving with woven boxes; and a timber
  dining table, benches and two lounge chairs on the terrace. All procedural (no
  downloaded models), merged per material; built right after the house is walkable.
- Previous: **I4 "Materials & textures"** — the **Realistic** look (`?style=real`)
  gets CC0 PBR materials (KTX2): natural oak parquet, warm sand stone-look tiles in the
  bathrooms, exterior wood boards and slats, grey standing-seam metal (RAL 7045),
  micro-textured warm-white plaster, oak board ceiling, concrete pavers, stone slabs,
  gravel, lawn, timber fence, Corten, bark; clear glass with sky reflections, RAL 1011
  frames; an HDRI partly-cloudy sky with image-based lighting, interior reflection probes
  and eye adaptation between inside and outside; low / medium / high quality tiers with
  dynamic resolution. SketchUp and Borderlands are unchanged.
- Before: **I3 "Garden & fence"** — start on the parking, walk in through the
  north entrance, visit every room on all three levels (all doors open), step out onto
  the east terrace through the glass wall, and walk all around the garden: gently
  sloping lawn on the surveyed spot heights, parking pavers, stone paths and stepping
  stones, gravel drainage strips, oiled-timber fence on blackened-steel posts (1.2 m
  horizontal slats on the street side with a closed sliding car gate and an open
  pedestrian gate with a letterbox, 1.8 m vertical boards on the sides and rear), silver
  birches, a serviceberry, a multi-stem tree, apple and cherry trees and shrubs on the
  plan's positions, meadow strips with wildflowers along the fences, Corten edging,
  raised vegetable beds, a swing, a fire pit with a bench and log stools, olive trees in
  clay pots on the deck, the bin corner, neighbour houses and distant hills.
- Earlier: **I2 "Whole building"** — upper floor, basement, walkable stairs, sloped
  attic ceilings, wood-board living-room ceiling, standing-seam roof with roof windows,
  hidden gutters, snow guards, chimney, entrance canopy, south sunshade, rain chains and
  the basement light well.

## Controls

| Phone / tablet                                        | Desktop                                  |
| ----------------------------------------------------- | ---------------------------------------- |
| Left thumb: floating joystick (push to the rim = run) | W A S D / arrow keys — move              |
| Right thumb: drag to look                             | Mouse — look (click to lock the pointer) |
|                                                       | Shift — run · Esc — release the mouse    |

## Styles

Three looks of the same scene; only materials, lights and rendering settings differ.

| Look                   | Id            | What it is                                                                                                                                                                                                                                                                                                                                                        |
| ---------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SketchUp** (default) | `sketchup`    | Hand-drawn architecture with a light cartoon touch: pastel toon fills with subtle bands, thin dark-grey edge lines (fat lines on desktop, 1 px lines on phones), one soft pale shadow, pale sky + fog, a grid on the ground, faint paper grain; trees, pots and soft furniture get a thin silhouette outline.                                                     |
| **Borderlands**        | `borderlands` | Cel-shaded comic ink: thick black outlines in two weights (fat lines on every device) + inverted-hull silhouettes on curved meshes (chimney, trees, pots, soft furniture), hard 2-step toon, violet-tinted shadows with screen-space ink hatching, saturated warm colours, painted surfaces and grass strokes, bold sky with inked cartoon clouds, soft vignette. |
| **Realistic**          | `real`        | PBR materials from CC0 texture sets (KTX2, streamed in after the first walkable frame — the house appears in flat colours first), HDRI sky + image-based lighting, interior reflection probes, eye adaptation, ACES tone mapping, static sun shadow map (1024 / 2048 px by tier). Baked lighting (I6) continues it.                                               |

- **Style toggle:** the small pill in the top-right corner (phone and desktop) shows the
  current look; tap/click it and pick SketchUp · Borderlands · Realistic. Desktop: **K**
  cycles the looks (also while the mouse is locked). The choice is remembered
  (`localStorage` key `houseSim.style`); `?style=sketchup|borderlands|real` in the URL
  overrides it for that load (`?style=sketch` still works as an alias of `sketchup`;
  unknown values fall back to SketchUp).
- Hooks: `window.__houseSim.setStyle('sketchup' | 'borderlands' | 'real')`,
  `getStyle()` (canonical name).
- Code: `src/world/style.ts` is a small registry — `setStyle(scene, name)` goes from any
  look to any other; each stylised look's GPU resources (toon fills, line/hull objects,
  generated textures, sky) are built lazily on first use and cached, so switching back
  and forth reuses them; `disposeStyles()` frees everything. Shared helpers live in
  `src/world/style/` (edge extractor, hulls, ink-shading patch, textures, sky).
- **Tune a look in one place** — its config file: `src/world/style/sketchup.ts` or
  `src/world/style/borderlands.ts` (shape documented in `style/config.ts`). Knobs:
  `bands` / `bandBrightness` (shading steps), `lineColor`, `lineWidth`, `sharpLines`
  (second, heavier weight for boundaries and creases ≥ `minDeg`), `fatLines`
  (`always` | `desktop` | `never`), `edgeThresholdDeg`, `jitter` (line-end overshoot),
  `hulls` (silhouette width; `only` limits them to listed materials — SketchUp outlines
  only vegetation and pots this way, canopies get a silhouette but no crease lines),
  `shadowOpacity` / `shadowRadius`, `ink` (shadow tint,
  hatching spacing / width / strength, `hatchBelow` / `crossBelow` levels),
  `palette` / `paletteGround` (saturation, lightness, clamps), `surfaces` + `paint` /
  `grass` (generated maps and their strength / tile size), `groundPattern`,
  `paperOverlay`, `vignette`, light, sky (+ `clouds`, `sunDisc`) and fog.
  - **SketchUp — push toward more SketchUp:** thinner lines, flatter bands
    (`[0.85, 0.93, 1.0]`), `jitter: 0`, lower `shadowOpacity`. **More cartoon:** thicker
    lines, stronger bands (`[0.6, 0.8, 1.0]`), more jitter, higher
    `palette.saturation` and `shadowOpacity`.
  - **Borderlands — push toward more comic / Borderlands:** thicker `sharpLines.width`
    (3.5) and `lineWidth`, higher `ink.strength` / `crossStrength` and `tintStrength`,
    `shadowOpacity` 0.55–0.6, `palette.saturation` 1.4, stronger `paint.strength`.
    **Calmer / more legible:** `ink.strength` 0.15, `crossStrength: 0` (single hatching
    only), `tintStrength` 0.4, `shadowOpacity` 0.4, `lineWidth` 1.8, `vignette: 0`.

## Quality tiers

| Tier     | Pixel ratio cap | MSAA | Realistic textures (hero / standard albedo) | Anisotropy | Shadow map | Interior probes |
| -------- | --------------- | ---- | ------------------------------------------- | ---------- | ---------- | --------------- |
| `low`    | 1               | off  | 1K / 512 px                                 | 2          | 1024       | off             |
| `medium` | 1.5             | on   | 2K / 1K                                     | 4          | 1024       | 3               |
| `high`   | 2               | on   | 2K / 1K (lawn + pavers 2K)                  | 8          | 2048       | 3               |

- **Auto detection** (`src/core/quality.ts`, no third-party data or requests): a guess
  from the unmasked GPU name (Adreno / Mali / Apple / desktop GPUs, `deviceMemory`),
  then a 1-s warm-up benchmark drops one tier when the median frame is slower than
  33 ms. `?quality=low|medium|high` overrides it and is remembered (`localStorage` key
  `houseSim.quality`); `?quality=auto` forgets the override.
- **Dynamic resolution:** the pixel ratio moves between 0.75 and the tier cap from the
  smoothed frame time (drops 0.125 after 0.5 s above 22 ms, rises after 3 s below
  17.5 ms). The stylised looks keep their own pixel-ratio cap (≤ 1.5); the lower of the
  two applies. `?dynres=0` pins the resolution (screenshots); automated browsers
  (`navigator.webdriver`) skip the benchmark and dynamic resolution.

## Materials & assets pipeline (Realistic look)

- CC0 sources only (Poly Haven, ambientCG) — the list with URLs and authors is in
  [`assets-src/LICENSES.md`](assets-src/LICENSES.md). The downloaded originals live in
  `assets-src/` (git-ignored); only the optimised files in `public/assets/` are tracked
  (≈ 16.6 MB for all three tiers).
- `npm run assets:fetch` downloads the originals (`tools/fetch-assets.mjs`, config in
  `tools/assets.config.mjs`); `npm run assets:optimize` (`tools/optimize-assets.mjs`,
  Node only, `ktx2-encoder` WASM) resizes per tier, normalises each albedo to its target
  tint and encodes **KTX2**: Basis ETC1S for albedo and ORM (occlusion / roughness /
  metalness), UASTC + zstd for normal maps; it also generates the standing-seam metal
  normals, a fine micro-normal, and the sky (`public/assets/sky/`: UASTC 2K background +
  1K JPEG for the PMREM environment). Output: `public/assets/textures/<set>/<map>-<px>.ktx2`
  and `manifest.json`. `REUSE=1` skips files that already exist.
- Runtime: `src/core/assets.ts` (three's `KTX2Loader`; the Basis transcoder is bundled
  from three by Vite — no CDN), `src/world/finishes.ts` (**one finish per material id**:
  colour, roughness, texture set, real-world tile size, anti-tiling, normal strength —
  the place to tune the look), `src/world/realLook.ts` (texture streaming, anti-tiling
  shader patch, HDRI environment, reflection probes, eye adaptation, light constants
  `REAL_LIGHT`). UVs are world-space metres, so every set is scaled to its real size
  (parquet boards ≈ 18 cm, tiles 60 × 60 cm).
- Tone mapping: ACES filmic (AgX and Neutral were compared with the textures: AgX looked
  greyer and washed out, Neutral flatter).

## Furniture (I5)

- **Procedural only** — no CC0 models: the kit draws every piece from a few primitives
  (boxes, rounded boxes, revolved profiles, tubes), which keeps one consistent style,
  needs no downloads or new textures and merges into the house's per-material draw
  calls. (CC0 chairs / fixtures would have needed their own atlas and still looked
  foreign next to the rest of the drawn scene.)
- Placement: [`src/data/furniture.ts`](src/data/furniture.ts) — one entry per piece
  (kind, room, centre, facing, size in metres, collider yes / no, options). Real sizes:
  bed 160 × 200 (180 × 200 upstairs), sofa 2.6 m, dining table 200 × 90 for six,
  worktops 90 cm high / 62 cm deep.
- Kit: `src/world/furniture/kit.ts` (local frame + primitives; rounded edges in 22.5°
  steps and 16-sided profiles, so the stylised looks draw silhouettes instead of stray
  lines), `pieces.ts` (one builder per kind), `index.ts` (`buildFurniture`,
  `attachFurniture`: new materials become new merged meshes, materials the house
  already has — glass, clay, bark, timber… — are merged into the existing mesh).
- Nine furniture materials (`joinery`, `smokedOak`, `travertine`, `linen`, `wool`, `cane`,
  `ceramic`, `brass`, `mirror`): §6.1 colours in `PALETTE`, realistic finishes reuse the
  shipped texture sets (oak grain, honed stone, micro-normals — texture memory unchanged).
- Colliders: simplified boxes for beds, sofa, tables, kitchen, island, wardrobes, tub,
  vanities, shelving, stove; small pieces (chairs, stools, lamps, rugs) don't collide.
- Lazy load: the furniture is built in an idle slot right after the first walkable
  frame; the current look styles it, the static shadow map and the interior probes are
  rendered again (`__houseSim.furnished` / `furnitureReady`).

## Develop

Requires Node ≥ 22.12 (tested with Node 24).

```sh
npm ci
npm run dev          # http://localhost:5173/
npm run build        # static site in dist/ (base path /house-sim/)
npm run preview      # serves dist/ at http://localhost:4173/house-sim/
```

Checks:

```sh
npm run lint         # ESLint (strict, type-checked) + Prettier
npm run typecheck    # tsc --noEmit (strict)
npm test             # Vitest: room areas (3 levels), dimensions, openings, stair math, reachability, geometry, site & garden, furniture placement, privacy
npx playwright install chromium   # once
npm run e2e          # quick pass: desktop only, small viewport, no screenshots
npm run e2e:walk     # one spec only (also e2e:garden, e2e:style, e2e:perf, e2e:materials, e2e:mobile)
npm run e2e:full     # final pass: + HD desktop, Pixel 7, iPhone 13, all screenshots
npm run shots:styles -- http://localhost:5173/ borderlands   # look-dev shots (dev server)
```

The e2e run renders WebGL with SwiftShader (software) in headless Chromium, so it is
slow but needs no GPU. Walking in tests is simulated in fixed physics steps with one
rendered frame at the end, so it doesn't wait for real time. Tests run one at a time
(the dev PC is slow). Testing policy: unit tests + the affected spec while iterating,
`npm run e2e` before finishing, `npm run e2e:full` once per iteration. Screenshots and
perf numbers land in `test-results/` (`e2e:full` saves side-by-side shots of all three looks
in `test-results/style-shots/`).

### Debug / test hooks

- `?debug` — overlay with fps, frame time, draw calls, triangles, geometries/textures,
  estimated texture memory, player position and room.
- `?pose=x,y,z,yawDeg,pitchDeg` — start at a pose (metres, y = feet; yaw 0 looks plan-north).
- `?view=x,y,z,yawDeg,pitchDeg` — free camera (physics paused), e.g. aerial views.
- `?quality=low|medium|high|auto`, `?dynres=0` — quality tier / fixed resolution (see Quality tiers).
- `window.__houseSim` — `ready`, `furnitureReady` / `furnished` (the furniture arrives
  just after the first frame; the e2e tests wait for it), `teleport()`, `getPlayer()`
  (position, `level`, `room`, `place`…), `getStats()`, `walk(dx, dz, s)`, `walkTo(x, z)`,
  `view()`, `look()`,
  `nextFrame()`, `setStyle('sketchup' | 'borderlands' | 'real')`, `getStyle()`,
  `texturesReady()` (resolves when the realistic textures, sky and probes are in; used by the
  e2e tests). `getStats()` also reports `quality`, `pixelRatio`, `textureMB` (GPU estimate:
  compressed mips, env maps, shadow maps), `textureDownloadMB`, `probes`.
- `npm run shots -- http://localhost:5173/ upper-hall,bedroom-3,storage` — review shots
  of named poses (see `tools/screenshots.mjs`; garden poses: `garden-aerial`,
  `gate-street`, `north-side`, `south-garden`, `rear-garden`, `terrace-out`, `living-out`)
  into `test-results/shots/`.

### Test on a phone (same Wi-Fi)

```sh
npm run dev -- --host          # open the printed Network URL on the phone
npm run dev:https              # same, with a self-signed HTTPS certificate
```

With HTTPS, accept the certificate warning once. Remote-debug Android Chrome via
`chrome://inspect`, iOS Safari via the Develop menu on a Mac.

## Project layout

```
src/data/     typed house model: schema, grid & levels, basement, ground floor, upper floor,
              roof + exterior elements, site, terrain (spot heights → triangulated grid),
              garden (fence, gates, planting, features, places), stair math (ramps),
              topology (rooms, levels), furniture placement
src/world/    builders: walls (layers + holes), openings, curtain wall, slabs, roof (windows,
              seams, gutters, snow guards, board ceiling), stairs, exterior, terrain +
              draped paving, garden (fence, vegetation, features, context), lighting, sky,
              merge-by-material mesh builder, plan section, procedural furniture kit
              (furniture/),
              style registry + SketchUp / Borderlands looks (style.ts + style/),
              realistic finishes + PBR runtime (finishes.ts, realLook.ts)
src/player/   capsule controller (three-mesh-bvh shapecast), touch + desktop input
src/core/     renderer, frame loop, debug overlay, URL params, quality tiers, asset loading
src/ui/       loading screen, start card, room toast, styles
tests/        Vitest unit tests; tests/e2e/ Playwright
tools/        dev-only plan tools (render / crop / extract / overlay screenshots), asset
              pipeline (fetch / optimize), review screenshots
public/assets/ optimised KTX2 textures + sky (tracked); assets-src/ CC0 originals (local)
```

## Privacy rule — the plans stay local

The repository and the site are **public**. The architectural PDFs contain personal data
(names, address, land-registry numbers) and the architect's copyright. Therefore:

- The PDFs live only in `architecture-plans/` and everything derived from them (renders,
  crops, extraction dumps, overlay screenshots) only in `.plans-cache/` — both are
  git-ignored and never part of the build.
- Only dimensions, levels, room names and material notes are transcribed into
  `src/data/`. No names, address, cadastral numbers or firm details anywhere.
- `tests/privacy.test.ts` fails if a tracked file contains any identifying token (stored
  only as SHA-256 hashes) or if any plan file would be committed.

Local plan tools (need the PDFs in `architecture-plans/`):

```sh
npm run plans:render -- 4        # all sheets → .plans-cache/sheet-XX@4x.png
npm run plans:crop -- 05 150 150 560 600 3 west   # zoomed crop (PDF points)
npm run plans:extract -- 05      # vector segments + positioned text → .plans-cache/geom-05.json
npm run dev  &  npm run plans:overlay   # model over sheets 03–10 → .plans-cache/overlay-XX.png
```

`overlay.html?sheet=03|04|05|06|07|08e|08w|09|10` (dev server only) draws the generated model
over the local sheet raster at the same scale: the site data (lot, paving, house, fence
and gates, trees, shrubs, beds, places) over the rotated 1:200 site plan (03), a
horizontal section 1 m above the floor
for the plans (04 basement, 05 ground, 06 upper), the roof-level feature edges in top
view (07), and an orthographic WebGL elevation for the facades (08 east/west, 09 north,
10 south) with the reference levels dashed.
