# Danger Close — Wallpaper Engine web wallpaper

The view through an AC-130 gunship's sensor over a randomly generated countryside: four vision modes (TV, thermal
white-hot, thermal black-hot, night vision), a sensor HUD, allies always on patrol, enemies and enemy bases only while
music plays, the guns firing on the beat. Built from the engines of `../Code 3` (skeleton, 1 unit = 1 m) and
`../Forward Air Base` (audio arming, effects, armour models), same author.
Runs 24/7 inside Wallpaper Engine (CEF/Chromium); also previewable in a normal browser.

Original work in the genre: reference screenshots are for mood only. No names, logos, HUD layouts or assets of existing
games. No level, money, fuel, time limit, objectives, kill feed or radio subtitles. No civilians, no blood.

## Plan (stages) — keep this list, it is the source of truth
**Stop rule: after each stage show the screenshots and STOP. Move to the next stage only when the user says so.**
**Commit rule (only while this plan is being executed): when the user says to move on, first commit the finished stage (with any fixes
made during its review) as one commit and push it, then start the next stage. Once the plan is done, commits and pushes need asking again.**
Update the status here when a stage is finished. The full approved design is summarised in "Design" below.

1. **Sensor**: camera, test scene with a live and a knocked-out T-90, smoke and flash, 4 modes on one sheet — done.
2. **Terrain and performance**: the whole map, forests, shadows; draw calls and generation time measured; a sheet of seeds — done.
3. **Roads, rail, lakes, towns, occupancy** — done.
4. **Gunship and HUD**: orbit, transit, slewing, clicks, friend-or-foe boxes on dummies — done.
5. **Units and allied patrols**: models, infantry, scale against the buildings — **done**.
6. **Combat**: arming on music, bases, the weapon table, the beat, wrecks, retreat — not started.
7. **AA, flares, clouds, weather, day and night** — not started.
8. **Big guns in frame**: the barrels of the big guns (105 mm and the railgun at least; the others are optional) visible at the edge of the frame while selected, with a firing animation (recoil, muzzle flash, gases) on every shot — not started.
9. **Splash, all properties, README, preview, soak** — not started.

## Design
- **Camera**: a slow left orbit over a district, a transit to another every few minutes in silence, slewing onto enemies in
  combat. Per-weapon zoom. Always looking down: no sky in frame.
- **Vision**: TV, WH, BH, NVG; a clickable switch on the HUD that is NOT persisted; a property for the default (tv / wh / bh /
  nv / auto = TV by day, WH at night).
- **HUD**: mode label, callsign (property, default `GHOSTRIDER 31`), compass, altitude ladder, PC clock, crosshair per weapon;
  at the bottom a clickable selector of the enabled weapons with cosmetic ammo / reload, kept `CFG.hudBottom` (48 px) above the bottom edge for the Windows taskbar. Screen-fixed corner brackets: allies blue,
  enemies white.
- **Map**: ~2×2 km generated at start under the splash; seed property (0 = new each launch). Gentle hills, lakes, roads with
  bridges, rail, towns, fields, forests. Ordinary buildings are indestructible; only enemy base structures blow up.
- **Combat**: allies always exist, losses replaced off screen. Enemies appear with music (5 s of sound), always off screen: columns
  and a base, the camera goes to the base. Music stops, a 5 s hold, then fire ceases and enemies leave the frame and vanish; a base is removed
  only out of view. Both sides fight each other. Five unit types per side with different models: infantry, tank, APC, car,
  helicopter. Infantry vanish in a dust puff at once; vehicles lie as wrecks, then sink into the ground.
- **Weapons** (one active; each a property, no limit; first three on by default; optional auto-switching, a click selects a weapon and
  auto resumes 30 s later; only fires at what the table allows, allies handle the rest; guns land at once, missiles / bombs on the next beat with a deadline):

| Weapon | Infantry | Car | APC | Tank | Helicopter | Beat |
|---|---|---|---|---|---|---|
| Gatling 25 mm | + | + | + | | | high |
| 30 mm | + | + | + | | | mid |
| 105 mm | + | + | + | + | | low |
| 40 mm Bofors | + | + | + | | | mid |
| Hellfire | | + | + | + | | strong |
| APKWS salvo | + | + | + | | | strong |
| GBU-39 | + | + | + | + | | strong |
| AIM-9X | | | | | + | strong |
| Laser | + | + | + | + | + | held on the beat, targets burn up |
| Railgun | + | + | + | + | + | strong, pierces a column along a line |

- **Extras**: drifting clouds under the camera, rain, snow, fog (optional); enemy AA tracers and missiles rising past the camera with flares in reply,
  purely visual (optional); the splash screen `DANGER CLOSE` with a CSS failsafe.

## Stack & layout
- Plain JS, no build step. `'use strict'` classic scripts sharing **global** scope (no modules; top-level names unique across
  files). three.js **r187** is vendored as `js/three.min.js` — never edit it. r187 ships ES modules only and modules may not load over `file://` in WE, so it was
  bundled once with esbuild: `export * from "three"` → `esbuild --bundle --minify --format=iife --global-name=THREE --target=es2020`.
- Code taken from FAB / Code 3 (r149) needs the r187 changes: `opaque_fragment` (was `output_fragment`), `ColorManagement.enabled = false` (core.js) and linear output, light
  intensities × π (legacy units), `addUpdateRange` (was `updateRange`), `PCFShadowMap` (`PCFSoftShadowMap` is gone), `InstancedMesh` can compute its own bounding sphere.
- Load order: `core → sensor → models → armor → helis → mapgen → layout → terrain → structures → effects → infantry → units → weapons → gunship → hud → main`.
  Target order: core → sensor → models → armor → mapgen → terrain → effects → weather → infantry → units → weapons → battle → gunship → hud → main → properties → settings.

| File | Contents |
|---|---|
| `js/core.js` | utils, `mulberry32`, `CFG`, `WIND`, `groundH`, `SEASONS`, sun position, sky palette, `TEX` |
| `js/sensor.js` | `SENSOR` (modes, render target, post shader), `SU` shared uniforms, `sensorHook` / `sensorMat` (the heat term) |
| `js/models.js` | mesh helpers (`M`, `HOT`, `box`, `cyl`, `taper`, `prism`, `strut`…), `mergeStatic` (bakes `aHeat`), `disposeTree`, seasonal materials |
| `js/armor.js` | vehicle models facing +x (×`ARMOR_SCALE`): T-90, BTR (enemy), Abrams, Bradley, Humvee (ally), technical (enemy car); `WRECK_MATS`, `toWreck` |
| `js/helis.js` | helicopter models (FAB airframes, ×`HELI_SCALE` = 10): AH-64, UH-60 (ally), Mi-24, Ka-52 (enemy); rotors named `rotor` / `rotor2` / `trotor` |
| `js/mapgen.js` | `MAP` (seeded heights and masks on a 4 m grid, built as a generator run in slices), `vnoise`, `groundH` (exactly the mesh's triangles), `groundN` |
| `js/layout.js` | `LAYOUT`: outposts (`OP_W`×`OP_D` walled compounds beside a country road: parts, gate, inner drive, pad), lakes, the river, towns, the railway, roads (A* on a 16 m grid, profiles, carving into `MAP.h`), streets, building lots, the station, farms, tracks, fields; the occupancy grid `OCC` (2 m cells, `OCC_*` flags: `occAt`), `MAP.water` / `MAP.wl` (`waterAt`, `waterLevelAt`), the land-use canvas (fields as premultiplied rgb(coverage, row angle, crop)) |
| `js/terrain.js` | `TERRAIN`: ground chunks (16×16 of 128 m), the ground material (mask + tiled detail in world space, `GROUND_PAL` per season), vegetation (one InstancedMesh per kind and chunk; roles fixed per seed, shapes per season) |
| `js/structures.js` | `STRUCT`: water (lakes, river), road / rail ribbons draped on the carved ground (decal materials: no depth write, polygon offset, renderOrder), bridges, the station, buildings (`BUILDERS`) merged per town / farm |
| `js/effects.js` | `Tracers`, `SpriteFX`, `Scorch`, `blast` |
| `js/infantry.js` | `INF`: every soldier in two InstancedMeshes (bodies; legs swinging), instance colour = side; a soldier is its own HUD track |
| `js/units.js` | `UNIT_TYPES`, `ROADNET` (a node per road sample, ends joined to other roads, A*), `Path` (lane to the right), `Vehicle`, `Column` (leader + gap; `follow` turns round on a reversed path), `Heli` (pad → up → fly a round → home → down), `Squad` (file along the leader's trail), `walkable` / `patrolLoop`, `ALLIES` (a garrison per outpost) |
| `js/weapons.js` | `WEAPONS` (name, zoom factor, reticle, cosmetic rounds / magazine / reload), `ARMS` (the selected weapon, ammunition state) |
| `js/gunship.js` | `GUNSHIP`: districts (towns, spots, farms, roads in the country; `GS_MARGIN` from the edge), a random start, the left orbit, the slew (eased aim + critically damped spring), transits (smootherstep, zoom-out arc), `track(p)` for combat; `TRACKS` (what the HUD brackets); the outposts are districts too |
| `js/hud.js` | `HUD`: a 2D canvas over the picture (compass, altitude ladder, clock, grid, reticle per weapon, fixed-size brackets) + DOM for the clicks (`#modes`, `#arms`); sizes follow window height × `CFG.hudScale` (`--hs` in CSS) |
| `js/main.js` | scene init, camera (`clampFrame`: the whole frame stays on the map, measured down to `MAP.lo`), `VIEW`, `updateEnvironment`, `fitShadow`, main loop |

## Rules / conventions
- **After changing any JS/CSS file, bump the cache-buster** `?v=N` on all `<script>`/`<link>` tags in `index.html`. Current: `v=17`.
- Personal git identity in this repo (`wladbelsky`); remote `origin` = github.com/wladbelsky/Danger-Close. Commits and pushes: see the commit rule under "Plan".
- Match the sibling projects' style: dense one-liners, short comments, `const` scratch vectors at module level.
- Sim time is `T`; real time is `RT()`. No scrolling UI (WE does not pass the wheel).
- **Every rendered material goes through `sensorMat`** or is a `ShaderMaterial` that reads `SU` itself (the tests check this). A new material without it shows
  raw colours in thermal.
- **Heat**: `HOT(colour, h)` for hot parts of a model, `sensorMat(mat, h)` for a whole material, `aHeat` attribute for instances. Don't use `M(c, {heat})`.
- **Switching vision never recompiles**: it only changes uniforms. Never toggle `castShadow`, lights or defines per mode.
- No `FlashLights` / point lights for blasts: every light costs on every terrain fragment. Additive ground glows instead.
- Never create geometry per spawn; pools and `disposeTree`. Anything in `mergeStatic` that moves must be listed as dynamic. Spawn by time accumulators.
- Map generation uses its own `mulberry32`, never `Math.random`.

## Notes for later
- **Local files in Wallpaper Engine**: WE provides `window.wallpaperRequestRegisteredFile` to read a user's local file (e.g. a file
  property). It does not exist in a normal browser: a browser fallback (a file `<input>` in the settings drawer, or `fetch` of a
  bundled file) is still to be worked out if a feature needs it. (From the user, 2026-11-11.)

## Running & testing
- Browser preview: `python -m http.server 8767` in this folder, URL params `?hour=22`, `?season=winter`, `?mode=wh`, `?zoom=150`, `?ts=N`.
- Tests: `powershell -ExecutionPolicy Bypass -File tools/test.ps1 [file / -g pattern]` (Playwright in Docker, SwiftShader; `$env:SEED = N`).
- Review sheets: `powershell -ExecutionPolicy Bypass -File tools/test.ps1 -c tools/preview.config.js` → `test-results/*.png`, `terrain-metrics.json`. URL params also `?seed=N`, `?x=&z=` (view point), `?az=` (fixed camera azimuth, deg), `?spot=town` (start district by name), `?transit=N` (minutes between transits, 0 = never), `?weapons=all` or `g25,h105`, `?hud=0`.
