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

- **Default** (no parameter, or `?style=sketch`): the hand-drawn architectural look —
  mostly SketchUp, a light touch of cartoon shading: pastel toon fills with subtle bands,
  thin dark-grey edge lines (screen-space fat lines on desktop, 1 px lines on phones), one
  soft pale shadow, pale sky + fog, a generated grid on the ground and a faint paper
  grain.
- **`?style=real`**: the realistic look (flat palette materials, ACES tone mapping,
  2048 shadow map) — the base that the material (I4) and baked-lighting (I6) work
  continues to improve.
- The sketch look only changes materials, lights and renderer settings on top of the
  realistic scene (`src/world/style.ts`); switching to real restores everything and frees
  the style's GPU resources.
- Toggle at runtime: **K** on desktop, or `window.__houseSim.setStyle('sketch' | 'real')`
  (`getStyle()` reports the current look).
- Tune the look in one place, `STYLE` in `src/world/style/config.ts`: `bands` /
  `bandBrightness` (shading steps), `lineColor`, `lineWidth`, `fatLines`
  (`always` | `desktop` | `never`), `edgeThresholdDeg`, `jitter` (line-end overshoot),
  `shadowOpacity`, `paperOverlay`, `pastel` / `pastelGround` (saturation, lightness),
  `groundPattern` (`grid` | `hatch` | `none`), plus sketch light, sky and fog colours.
  More SketchUp: thinner lines, flatter bands (`[0.85, 0.93, 1.0]`), `jitter: 0`,
  lower `shadowOpacity`. More cartoon: thicker lines, stronger bands
  (`[0.6, 0.8, 1.0]`), more jitter, higher `pastel.saturation` and `shadowOpacity`.

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
```

The e2e run renders WebGL with SwiftShader (software) in headless Chromium, so it is
slow but needs no GPU. Walking in tests is simulated in fixed physics steps with one
rendered frame at the end, so it doesn't wait for real time. Tests run one at a time
(the dev PC is slow). Testing policy: unit tests + the affected spec while iterating,
`npm run e2e` before finishing, `npm run e2e:full` once per iteration. Screenshots and
perf numbers land in `test-results/` (`e2e:full` saves side-by-side shots of both looks
in `test-results/style-shots/`).

### Debug / test hooks

- `?debug` — overlay with fps, frame time, draw calls, triangles, geometries/textures,
  estimated texture memory, player position and room.
- `?pose=x,y,z,yawDeg,pitchDeg` — start at a pose (metres, y = feet; yaw 0 looks plan-north).
- `?view=x,y,z,yawDeg,pitchDeg` — free camera (physics paused), e.g. aerial views.
- `window.__houseSim` — `ready`, `teleport()`, `getPlayer()`, `getStats()`, `walk(dx, dz, s)`,
  `walkTo(x, z)`, `view()`, `look()`, `nextFrame()`, `setStyle('real' | 'sketch')`,
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
              sketch style (default look; style.ts + style/)
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
