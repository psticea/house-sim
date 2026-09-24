# Goal — House Sim

> This file describes **what** I want. The **how** lives in [`plan.md`](plan.md).
> Edit freely — this is the source of truth for the vision.

## Vision

A walkable, first-person 3D version of our future family house and its garden, that I
can open on my phone and explore as if I were
standing there — before it is built.

## The experience

1. I open a link on my phone. After a short loading screen I **start outside**, on the
   street side, next to the parking area, looking at the house.
2. I walk up to the entrance (north side, under the entrance canopy) and go inside.
3. **All doors are open.** I can walk into every room:
   - Ground floor: entrance hall, living + kitchen (double height), bedroom 1, bedroom 2,
     bathroom, boiler room + laundry, stairs, play corner.
   - Upper floor: bedroom 3, the study room, hall, bathroom — and look down into the
     living room through the open void.
   - Basement: stairs + storage.
4. I can go out onto the **east terrace** (deck) through the glass wall, and walk
   **all around the garden**: parking, paths, lawn, trees, the south sunshade, up to
   the fence.
5. It should *feel* like the real place: correct dimensions and ceiling heights, the
   sloped attic ceilings, daylight coming through the windows, real materials
   (parquet, tiles, white walls, grey metal facade, wood slats).

## Must have

- True-to-plan geometry (1:1 scale in meters, taken from the architectural drawings).
- Walk everywhere: outside, all rooms, all 3 levels, stairs work.
- Mobile first: touch controls (joystick to move, drag to look).
- Also works on desktop (WASD + mouse).
- **High visual quality** but **runs smoothly on an average phone** (target ~60 fps,
  never below 30 fps).
- Opens in the phone browser from a URL — no app store install needed.

## Nice to have (later)

- Mini-map showing where I am on the floor plan + room name when I enter a room.
- "Teleport to room" menu.
- Time-of-day / sun position slider (see how light enters at different hours).
- Try alternative furniture layouts, materials and colors.
- Measure tool (tap two points, get the distance).
- Installable as an app (PWA), works offline.
- VR / gyroscope look mode.

## Not goals (for now)

- No gameplay (enemies, scoring, quests). It is an explorable model.
- No multiplayer.
- No photoreal path tracing — real-time only.
- No editing of the house layout inside the app.

## Constraints

- Source of truth: the PDFs in `architecture-plans/` (sheets 03–10, July 2022).
- Only use free assets with licenses that allow reuse (CC0 preferred).
- No Blender (or other desktop 3D tool) available — the whole pipeline must be
  code-driven (generate the house from data, bake lighting with our own tools).
- Development effort is not the bottleneck; runtime performance on an average phone is.
- Privacy: the plans contain our names, the address and the land registry number —
  these must not appear in the game or in public files.

## Decisions

- **Furniture: basic** — every room is recognisable and feels lived-in (beds, sofa,
  kitchen, dining table, bathroom fixtures, wardrobes, a few lamps/plants/rugs), but
  no clutter or small decorations.
- **Texture quality: good** — crisp, realistic PBR materials (wood grain, tiles,
  fabric, metal seams) that hold up when you walk close to a wall or floor.
- **Style: Scandinavian** — be creative with colors, furniture, fence and garden:
  light oak, white and warm-grey walls, natural textiles, muted accent colors
  (sage, dusty blue, terracotta, ochre), black metal details, lots of daylight, simple
  wooden fence and a natural-looking garden.
- **Public link** — published on GitHub Pages, anyone with the link can open it.
  (The address, names and land registry data still must not appear in the game.)

## Open questions (to decide)

- Garden details beyond the style direction (vegetable beds? swing? exact trees?) —
  the planner may propose, I will review.
