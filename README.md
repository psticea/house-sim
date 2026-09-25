# House Sim

A walkable, first-person 3D model of a family house (to be built) and its garden —
phone first, also desktop. The whole house is **generated in code** from a typed data
model transcribed from the architectural drawings (no Blender), rendered with three.js.

**Live:** https://psticea.github.io/house-sim/

- What we want: [`goal.md`](goal.md) · How and roadmap: [`plan.md`](plan.md)
- Current release: **I1 "First walk"** — start on the parking, walk in through the north
  entrance, visit every ground-floor room (all doors open), step out onto the east
  terrace through the glass wall. Upper floor and basement are massing only.

## Controls

| Phone / tablet                                        | Desktop                                  |
| ----------------------------------------------------- | ---------------------------------------- |
| Left thumb: floating joystick (push to the rim = run) | W A S D / arrow keys — move              |
| Right thumb: drag to look                             | Mouse — look (click to lock the pointer) |
|                                                       | Shift — run · Esc — release the mouse    |

## Styles

Three looks of the same scene; only materials, lights and rendering settings differ.

| Look                   | Id            | What it is                                                                                                                                                                                                                                                                                                                           |
| ---------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **SketchUp** (default) | `sketchup`    | Hand-drawn architecture with a light cartoon touch: pastel toon fills with subtle bands, thin dark-grey edge lines (fat lines on desktop, 1 px lines on phones), one soft pale shadow, pale sky + fog, a grid on the ground, faint paper grain.                                                                                      |
| **Borderlands**        | `borderlands` | Cel-shaded comic ink: thick black outlines in two weights (fat lines on every device) + inverted-hull silhouettes on curved meshes (chimney), hard 2-step toon, violet-tinted shadows with screen-space ink hatching, saturated warm colours, painted surfaces and grass strokes, bold sky with inked cartoon clouds, soft vignette. |
| **Realistic**          | `real`        | Flat palette materials, ACES tone mapping, 2048 shadow map — the base that the material (I4) and baked-lighting (I6) work continues to improve.                                                                                                                                                                                      |

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
  `hulls` (silhouette width), `shadowOpacity` / `shadowRadius`, `ink` (shadow tint,
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
npm test             # Vitest: room areas, dimensions, openings, reachability, geometry, privacy
npx playwright install chromium   # once
npm run e2e          # quick pass: desktop only, small viewport, no screenshots
npm run e2e:walk     # one spec only (also e2e:style, e2e:perf, e2e:mobile)
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
- `window.__houseSim` — `ready`, `teleport()`, `getPlayer()`, `getStats()`, `walk(dx, dz, s)`,
  `walkTo(x, z)`, `view()`, `look()`, `nextFrame()`, `setStyle('sketchup' | 'borderlands' | 'real')`,
  `getStyle()` (used by the e2e tests).

### Test on a phone (same Wi-Fi)

```sh
npm run dev -- --host          # open the printed Network URL on the phone
npm run dev:https              # same, with a self-signed HTTPS certificate
```

With HTTPS, accept the certificate warning once. Remote-debug Android Chrome via
`chrome://inspect`, iOS Safari via the Develop menu on a Mac.

## Project layout

```
src/data/     typed house model: schema, grid & levels, ground floor, upper massing, roof, site
src/world/    builders: walls (layers + holes), openings, curtain wall, slabs, roof, stairs,
              exterior, lighting, sky, merge-by-material mesh builder, plan section,
              style registry + SketchUp / Borderlands looks (style.ts + style/)
src/player/   capsule controller (three-mesh-bvh shapecast), touch + desktop input
src/core/     renderer, frame loop, debug overlay, URL params
src/ui/       loading screen, start card, room toast, styles
tests/        Vitest unit tests; tests/e2e/ Playwright
tools/        dev-only plan tools (render / crop / extract / overlay screenshots)
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
npm run dev  &  npm run plans:overlay   # generated plan section over sheet 05 → .plans-cache/overlay-05.png
```

`overlay.html` (dev server only) draws a horizontal section of the generated geometry at
+1.00 m over the local sheet 05 raster to check alignment.
