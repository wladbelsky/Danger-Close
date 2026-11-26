# Danger Close — Wallpaper Engine web wallpaper

The view through an AC-130 gunship's sensor over a randomly generated countryside: four vision modes (TV, thermal
white-hot, thermal black-hot, night vision), a sensor HUD, allies always on patrol, enemies and enemy bases only while
music plays, the guns firing on the beat. Built from the engines of `../Code 3` (skeleton, 1 unit = 1 m) and
`../Forward Air Base` (audio arming, effects, armour models), same author.
Runs 24/7 inside Wallpaper Engine (CEF/Chromium); also previewable in a normal browser.

Original work in the genre: reference screenshots are for mood only. No names, logos, HUD layouts or assets of existing
games. No level, money (but the optional count of what the gunship has fired off), fuel, time limit, objectives, kill feed or radio subtitles. No civilians, no blood.

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
6. **Combat**: arming on music, bases, the weapon table, the beat, wrecks, retreat — done.
7. **AA, flares, clouds, weather, day and night** — done.
8. **Physically based lighting and colour**: three.js r187's own colour management and linear light instead of the emulated legacy look; before / after sheets — done.
9. **Night lights**: headlights on the allies' and the enemies' vehicles at night, green and red navigation lights on every helicopter, light in the houses at night (not every window, not every house), street lamps along the paved roads, lamps and searchlights at both sides' bases; the lamps' light is a map from above with shadows over a baked height map — done.
10. **Big guns in frame**: the barrels of the big guns (105 mm and the railgun at least; the others are optional) visible at the edge of the frame while selected, with a firing animation (recoil, muzzle flash, gases) on every shot; fixed to the aircraft (they move in the frame as the sensor slews and zooms), both shown side by side when both are enabled, tracers leave the visible muzzle — done.
11. **Splash, all properties, README, preview, soak**; `renderer.compileAsync` at start so the splash does not freeze while the shaders compile (the warm-up frame for the shadow pass stays) — done.
12. **Fix: a red laser**: the laser beam red, and a red glow on the ground where it hits — done.
13. **The music drives more**: ground units fire on the beats of their band (volleys on strong beats, faster in dense music at the
    same damage a second), the gunship's bursts and blasts scale with the beat's strength, quiet parts calm the fight and a drop
    after one sets off a surge, AA bursts and flares on the beat — done (the sensor pulsing with the kick was tried and taken out at the user's request).
14. **Rocket runs and splash**: the helicopters of both sides dive in on a target and fire a salvo of unguided rockets on a
    beat (`Heli.runStep`, `BATTLE.salvo`, `ROCKET`); the blasts of the 105 mm, the Hellfire, the APKWS and the GBU-39 (`SPLASH`)
    and of the rockets hurt every enemy on the ground round them, whatever their kind (the weapon log keeps to the table) — done.
15. **Infantry out of the APCs**: an APC (`troops` 4–6, both sides) halted within 200 m of its target or 160 m of its own base lets a squad
    out by the rear door, one every 0.6 s (`BATTLE.dismount`; the column waits on `unload`), the squad runs out in file (`Squad.go`,
    `gap`) and patrols round; a knocked-out APC lets 1–3 bail out (`BATTLE.bail`); the outposts' APCs fill up again at home. `walkable`
    now steps 0.8 m (a 2 m step cut the corners of walls) — done.
16. **The guns follow the tempo**: the bpm from the kicks (`tempoKick`: the median interval folded into 80–180 bpm; `AUD.bpm`, `beatP`,
    `kickT`, `tempo` 0..1 = 95–150 bpm, gone 2.5 s after the last kick); the light guns fire between the beats on a grid locked to the
    kick (`SUBDIV`, `BATTLE.subBeat`: eighths, sixteenths for the 25 mm; no ammunition taken), the guns reload up to twice as fast
    (`TEMPO_GUNS`), the units' pace ×(1 + 0.4·tempo). The outposts' squads refill in their file (`Squad.refill`), not at the gate — done.
17. **More enemies, lighter guns**: the 25 mm and 30 mm do less (`GUN` dmg 0.34 / 2.4, a soldier still dies of one round) and hardly
    hurt armour (`ARMOR`: ×0.6 / 0.8 on cars, ×0.2 / 0.4 on APCs — some 100 rounds of 25 mm or 8 of 30 mm for an APC); the shots between
    the beats do half (`fire(…, dk)`). More arrive and sooner (columns up to 14 vehicles every 6–12 s, 6 squads, 3 field fights); 6 s with
    no enemy in the frame calls the next arrivals at once (`fedT`, `rushT`, `stat.rush`); a wrecked base is rebuilt in 12–20 s, on its
    own ruin 40 s on if the map has no other site (`pickSite`: seed 11 has one) — done.
18. **Closer looks**: the vehicles in more detail for the top of the zoom (road wheels and tracks, ERA, sights, smoke launchers,
    stowage, antennas, wheel hubs, glass; `tracks`, `smokers`, `mgGun` in js/armor.js); a machine gun on the roof of every enemy
    vehicle (`mg`, dynamic) turns up at the aircraft while its crew fires up at it (`Vehicle.aimMG`, `mgMuzzle`; AA bursts wait for
    it and leave its muzzle). Missiles (the gunship's, the SAMs) fly with a body (`Bodies`, `FX.bodies`, `MISSILE_S`), a steady
    glare and a tongue of flame, a dense trail laid every 4 m (`missileFx`); flares pop, sputter, shed thin sparks and only wisp.
    Sheets: vehicles-close.png, missiles-flares.png. The sub-beats no longer fire off the grid when they resume — done.

## Changes after the stages
The stages ended at 18: later changes are no longer numbered — each is a bullet here (newest last), one commit each; commits and pushes only when asked.
- **The gunship plays along**: the slew onto a target follows the music (`SLEW_MUSIC`, `GUNSHIP.slewK`: ×0.6 in a quiet part,
  ×0.6 + 0.7·drive + 0.4·tempo, ×1.25 in a drop's surge, eased; `lookAt`'s lead follows it). The auto-switching changes weapon while
  the one in hand reloads longer than `RELOAD_HOP` 1.5 s or two beats (a shot that starts a reload calls it in 0.3 s; `stat.hops`;
  the reloaded one may win it back after its reload). The guns with no barrel drawn (25, 30, 40 mm, the laser) fire from just
  outside the frame's right edge, low down, beside the big ones (`GUN_SIDE`, `GUNS.sideAt`, 90 m out with a streak in from the
  edge). Sheet: side-guns.png.
- **More fire, fewer transits, reactions**: the guns (`NEAR_ARMS`) fire at a target already within `RET_NEAR` 0.4 of the reticle
  (at the ground under it, `aimPoint`: the rounds walk on), and some triggers on target land off it (`MISS`; `shotAt`, `stat.near`,
  `stat.miss`). The camera works a zone (`ZONE`: 45 s at least, a timer of 80–130 s, then only in a quiet part, or 45 s more with
  nothing left to hit; `GUNSHIP.mayLeave`, `arrive`); on arming it stays and the enemy comes to it: the first column from just out
  of sight on a road into the zone (`firstWave`, `hiddenNear`), arrivals mostly to the zone (`dests`), the first field fight in it,
  its squads running in; the base is visited on the next allowed transit (`wantGo`); a target beyond `ZONE.r` calls the arrivals
  (`rush`) instead. The side guns start 32 m out (`GUN_SIDE_D`, past the lens's 30 m near plane) with a 20 m streak. A wreck cooks
  off on strong beats (`COOK`, `cookOff`, `pop`, a tank's turret thrown up: `tosses`); light rounds glance off armour (`RICO`,
  `ricochet`, at most 8 a step: the tracer pool is a 600-slot ring); a column under fire weaves kerb to kerb (`laneK`). Flares as before stage 18;
  missiles drawn light with a dark nose at 2.5× (`MISSILE_LOOK`) and a flame of their own (`Plumes`: additive cones, HDR core,
  white-hot). Sheets: side-guns.png, reactions.png, missiles-flares.png.
- **The enemy fills the zone; no lying flat**: most columns start 180–420 m down a road into the camera's zone (60 %, the allies
  meeting them there), squads run into it from just out of sight (up to 4 there, 9 in all; the rest round the base), and fewer
  than `ZONE_FILL` 12 enemies on the ground within `ZONE.r` call the next arrivals at once (`rush`, not in a quiet part): some 15
  in the zone instead of 5. Soldiers no longer throw themselves flat (it looked comic).
- **The feed: no lull in the fire**: the next group is already coming in from just off the frame as the last one dies (`FEED`,
  `BATTLE.feed`, `edgeSquad`: a squad 10–30 m past the frame's edge running in to a loop round the sensor's point, or a column from
  150–250 m; enemies within 220 m of the point kept up to 5–14, a group every 6–2 s, both from the music's pace `BATTLE.pace()`:
  tempo, drive, half in a quiet part; `stat.feed`). Music under 92 bpm goes group by group with a break of 8–14 s once the ground
  round the point is clear (`slow()`, `breakUntil`, `stat.breaks`: no arrivals at all meanwhile). The sensor slews to the next
  target as quickly as onto one (`BATTLE.chase` holds the lock) and looks again 0.8 s after a kill (was 4). No shot for 2 s: some
  5–10 % of a fight at 124–150 bpm instead of 30–50 %.
- **No jumps sideways on the road**: a column under fire steers across the road (`laneT`, `weaveUntil`, at most `WEAVE_RATE` 2
  lane widths a second, the nose turned into the swerve, kerb to kerb every 1.8–2.6 s) instead of being put there at once; a
  `Path` keeps the lane's offset continuous (the right of travel per point, `N`, the mean of the segments either side; the offset
  `W` eased onto a single track), so no vehicle jumps 1–2.5 m at a corner, a junction or a narrowing any more. The feed sends a
  fireteam of the allies too when none of theirs is within 150 m (`edgeSquad(side)`, every 15 s at most); slow music's break
  starts once the frame is clear with at most two stragglers about, and it never rushes.
- **Smooth driving; a wreck rolls on**: a vehicle drives the road's line averaged over `PATH_SMOOTH` 6 m either side (`Path.at`:
  exact box filter from the integrals `F` of x, z and the lane offset; none at the path's ends, so a reroute's head still runs
  through the vehicles), so a corner of the polyline is a bend, not a kink. Every vehicle slows for the sharpest bend over the
  next `BEND_LOOK` 16 m of its own lane (`bend()`, sideways at most `BEND_ACC` 3 m/s per second, never under 3 m/s), not only
  the column's leader. The lane factor has a rate `lv` eased by `WEAVE_ACC` (both scaled down below 9 m/s): a swerve is an S,
  not a zigzag, and the nose follows the lane's own track. Measured in the weave test: sideways acceleration at most ~8 m/s per
  second (was hundreds), 1.6 % of steps over 6 (was 7 %). Knocked out on the move, a vehicle keeps its path and speed as a wreck
  (`WRECKS` entry `roll`, `Vehicle.coast`: slowing at `COAST` 4 / 3 / 2.5 m/s per second for tank / APC / car, drifting to a
  kerb); its fire, smoke, cook-off pops (`cooks[].pos` is the live position) and bailing crew go where it is now. The bail
  tries 16 spots round the wreck (closer in for the second 8): a wreck may have rolled up to a wall.
- **The allies in the frame; infantry runs from fire**: allies used to be beside an enemy in the frame 12 % of the time (0.4 in
  the frame on average): they halted to shoot at 90–230 m, out of the frame, and were cut down (outnumbered two to one). Now:
  `feed()` sends a fireteam of theirs in from the frame's edge when none has been in the frame for `ALLY_FEED.gap` s (every
  `every` s, while fewer than `near` + `k` × the enemies are within `FEED.r`; the allies' `edgeSquad` runs 14–18 s), a column
  from just out of sight when no vehicle of theirs is round the point, and gives their fireteams a new loop round the point
  when it has moved on `move` m (one far out of the fight and out of sight is taken away). The QRF and their fireteams come
  to the camera's zone, not the base. An allied squad (`Squad.update`) closes in on its target to `SQUAD_CLOSE` 35 m, firing,
  and halts for a fight only within `SQUAD_ZONE` 100 m of `CAM_TGT` (further off it shoots on the move round its loop); then a
  new loop round where it got to. The enemy's fire does `ALLY_TOUGH` 0.4 to them; their infantry is capped at `inf` × the
  share (their APCs keep the rest aboard). `aimCamera` prefers an enemy with allies within 80 m (`mixed`, × 0.25). Average
  over 4 seeds × 2 tempos: allies beside enemies in the frame ~37 % of the time, 1.6–2 of them. Edge fireteams start at their
  loop's first waypoint (`wi` 1: no 3–10 s halt where they appear). Infantry within max(10, 3 × r) of a hit (the gunship's
  `strike`, a unit's `splashAt`) runs 8–16 m away from it for 2.5–4 s (`BATTLE.scare` / `scatter`, `SCATTER`, walkable, not
  firing), then stands `rest` 4 s; the squad keeps twice its spacing for 10 s (`spreadUntil`); after the run, back the way it
  ran into the file (the leader on, if the way to his waypoint is clear). The leak test counts geometries apart from the
  unit prototypes' shared ones.
- **The reticle stays on the fire**: a gun's burst goes where the sensor points: the point at the trigger (the target, led,
  or `at`) is kept as an offset from `GUNSHIP.look`, so later rounds follow the reticle instead of homing on a soldier running
  off under it (missiles still fly to their target; once a transit starts, the rest stay on the trigger's point). `velOf`
  leads a soldier running from a hit (`SCATTER.v` towards his spot), so the sensor keeps up with him. No shot off the
  reticle any more (`onReticle` was also true after 5 s off it): a
  target the sensor cannot bring under it in `OFF_SWITCH` 3 s is given up for the one nearest the reticle (`nearestTo`,
  `stat.refocus`). Measured (seed 11, four guns, 120 s): 99 % of rounds land within 0.18 half heights of the centre (was 0.23).
- **Traffic; legs; helicopters; the AIM-9X's lock; dust on a soldier hit**: only a column kept its own vehicles apart; columns
  drove through each other, through wrecks and onto one another at a shared end node (some 4850 pair-samples in sight in
  150 s, seed 11). Now each vehicle (`Vehicle.traffic`, `TRAFFIC`) looks `look` m ahead every 0.15 s (`blocker()`: live
  vehicles of any column and side, vehicle wrecks: `WRECKS` entry `veh`; hulls from the models' boxes, `hullOf`, `HULL`) and
  brakes to stop short of what is in its way; one coming the other way: both pull aside (`po`, metres to the right of their
  track, eased at 2 m/s per second, only as it rolls on), even on a single track; a wreck, or one standing in the way for
  `wait` s with road beyond it: it drives round it (`byp`, the side measured again as it goes, `clear()`: no building or water,
  on a bridge at most 0.8 m). A move that would take a hull further into another's is not made (`step`, `bumps`, `obbOverlap`,
  `stat.bump`); stuck `ghost` s out of sight, it stops looking at that one. A follower's ceiling in its column is applied before
  it is posed and never sends it back (`drive(dt, vt, smax, va)`: none stacked at a path's start). A column is not spawned onto a
  road with a vehicle or wreck on it (`roadFree`). In sight: 0–11 pair-samples in 150 s (seeds 11, 3); the mean speed 3–3.8 m/s
  (was 4.4–4.7: they wait and go round). A soldier's legs follow what he really walked in the step (`Squad.mark` / `legs`;
  a squad leader running from a hit during a fight slid with still legs), quicker into a run, none on the spot when blocked.
  The helicopters rebuilt to the vehicles' detail (1500–2600 triangles, were 400–700): framed glass (plain, merged: one draw
  call fewer), tapering blades with grips, pitch links, swashplate, real tail rotor blades (the Apache's scissor), intakes,
  hot exhaust mouths, warm gearbox and hub, sensors (TADS / PNVS, Longbow, the Ka-52's ball and radome), guns, pylons with
  rocket pods, Hellfires, missile rails, wheels under the Mi-24 and the Ka-52 (they floated 0.7 m up), antennas, flare
  dispensers; `userData.nav` puts the navigation lights at each model's wingtips and tail (`HELI_NAV` the fallback). The AIM-9X
  fires only through its lock (`LOCK`, `BATTLE.lock`, `lockStep`, `launch`): a helicopter held under the reticle `LOCK.t` 1.4 s
  (off it the lock slips back, gone after `lose` s), then SHOOT and the launch `fire` 0.5 s on, or on a strong beat in
  `win`; ammunition only at the launch; no auto-switch mid-lock (`stat.locks`, `lockShots`, `lockLog`). The HUD draws four
  arrows closing in on the target's box, the box closed, SHOOT blinking (`HUD.lockOn`, `lockDraw`). Every hit on a
  soldier, either side, any source, kicks up dust (`hurt` → `hitPuff`, at most `PUFF_MAX` a step); a death a burst of 8
  lighter sprites and a wisp of smoke that hides him as he goes (`puffDust`), in a pool of its own (`FX.puff`). Sheets:
  helis-close.png, aim-lock.png.
- **SHOOT boxed; the helicopters' cockpits; nose to nose**: SHOOT is drawn in a box low in the middle, under the reticle and
  over the weapon selector, not over the target (`HUD.shootCue`). The cockpits had glass blocks with frame bars laid over them
  (crosses seen from above); now each is a body-coloured shape with flat panes set into its faces, the strips of the body
  between them the frames (`canopy()` in helis.js: faces `f` / `b` / `s` / `t` / `T`, panes, sill), as the vehicles' windows
  are: the Apache's and the Hind's two stepped canopies, the Ka-52's side-by-side one with a centre post, the Black Hawk's
  two-pane windscreen and door windows. Traffic: two vehicles standing nose to nose (a column met another on a single track)
  stood for good: each pulled aside away from the other, and with a lat of nearly nothing both went the same way; their hulls
  touching, the move forward and aside was refused as one; a crawl's target speed kept the stuck clock at 0. A column then
  counted as home without the one left standing and drove back through it, across the fields (`Column.reroute` runs the new
  path through every vehicle). Now facing each other nearly in line both keep right (`blocker()` `opp`), half the clearance
  will do from each (the other pulls out too); a refused move is tried aside only (`step`); going round one it stands nose
  to, it steers out slowly (0.5 m/s); stuck counts what it really does (`v < 0.3`). The sensor on a helicopter
  (`BATTLE.lookAt`): the ground point behind it on the line of sight was taken along the line to the frame's centre, not to
  the helicopter, and over the ground under it: 10 m and more off where the frame is held off the map's edge (`CAM_TGT` ≠
  `GUNSHIP.look`), the AIM-9X's lock slipping again and again (40–80 locks for 1–2 launches a minute on some seeds); now
  along its own line, down to the ground there (3 steps): 12–16 locks, 4–5 launches. A gun's burst whose sensor point jumps
  off to the next target (its own killed) let go of the trigger: no rounds once the point has moved `BURST_LET_GO` 8 m more
  than the target has since the trigger (following it is not letting go; they swept a line of hits across the ground between
  the two). An APC knocked out in a lane between
  walls let nobody out (no spot round it with a round to walk, `patrolLoop`): they now get out where they can and hold there.
  The reticle at the map's edge: where the frame is held off the edge (`clampFrame`) the sensor's point is not its centre;
  the reticle was drawn in the centre while the guns fired at the point 30–80 m off, and `onAim` took either (a target in the
  centre was fired on with the rounds going to the point; one at a point out of the frame altogether too). Now `VIEW.ret()`
  is where the reticle is (the centre, or the point's place in the frame, held 8 % in from its border): the HUD draws it there
  (`HUD.retAt`), `onAim`, `nearestTo` and the test's measure go by it alone, a shot under the reticle goes to the sensor's
  point (`aimPoint`, was the frame's centre). Within some 60 m of the edge the point is out of the frame (`VIEW.ret().z` 1):
  nothing is fired at it.
- The enemy's armour reaches the frame; out of sight they drive as they like and nobody fights. Measured over 16 maps × 10 min:
  an enemy vehicle in the frame 35 % of the time on average (9 % on the worst map; before the traffic rules ~33 %, with maps at 0),
  ~50 per map killed without ever being in it. Now 46 % (worst 32 %), ~9 killed unseen. What changed:
  - `VIEW.near(p, m)`: within m metres past the frame, from its centre (`VIEW.frameR`: the half diagonal of the ground it shows,
    set in `updateCamera`, so it grows with the zoom out). Everything below is measured by it;
  - the traffic rules (`blocker`, `bumps`, `shove`) only within `TRAFFIC.near` (80 m) past the frame: further off vehicles drive
    through each other (columns queued for minutes 1–1.5 km off). Two that come in inside each other (or a wreck rolled into one)
    are pushed apart sideways (`Vehicle.shove`: `shoveD`, at `TRAFFIC.shove` m/s through the eased `pov`, up to 3 m past `side`,
    where no building or water is; held while they touch); `po` eases to a stop at its limit;
  - nobody fires unless the shooter or its target is within `FIRE_NEAR` (150 m) past the frame (`unitShot` reloads and holds,
    `stat.quiet`). A column halts for a fight only within `COL_ZONE` (60 m) past it (`BATTLE.inPlay`), further off it fires on the
    move and drives on, and the allies' fire does an enemy vehicle there no harm (`stat.spared`). Very slow music (`BATTLE.slow`)
    keeps the column rules as they were: it fights group by group, with breaks;
  - `BATTLE.steer`: an enemy column far off (300 m) and out of sight, bound for where the camera was (it drifts with the fight), is
    sent on to the road nearest to where it looks now (not one bound for the base or an outpost or already for that road; not in
    very slow music);
  - `ROADNET.toward`: the node for a place is the nearest within 250 m, else within 700 m (was none: with the sensor over fields
    away from the roads every column went off to the base or an outpost);
  - `Column.reroute` keeps each vehicle where it stands (the smoothed new way is off by up to a metre: s and po take it up), was a
    0.6 m jump; a weaving vehicle slows for the bend on the lane it swerves to as well (`bend(k)`) and does not swerve round a sharp
    corner just behind or ahead (`bend(k, -8)`: the lane's sideways turns fast after a hairpin junction, up to 23 m/s²).
  Tests: "the enemy armour comes into the frame" (maps 5 and 71, where it was 0); the music test's target stands in the frame; the
  reticle test leaves out rounds in the air when the sensor jumps to another target (BURST_LET_GO m within 0.3 s), as before < 0.21;
  the weave test's share of steps over 6 m/s² < 5 % (more vehicles weave at full speed now, none queued out of sight).
- Off the road; scattering; the helicopters over the fight; no jitter. Measured (prev. commit -> now, 16 maps x 10 min unless said):
  enemy helicopters in the frame 1.4 % -> ~10 % of the time; vehicles by the frame standing 55 % -> ~39 %; the nose swinging three
  times in 3 s 25–45 % -> 0–18 % of the windows (2 maps, 150 s); an enemy vehicle in the frame ~50–54 % (was 52–58 % on the same
  measure: run-to-run spread ±3). What changed:
  - `fieldRoute(ax, az, bx, bz, max)` (units.js, `FIELD`): A* on 4 m cells in a box round the two points; never through a building,
    a yard (but a road through a yard's edge), water, a forest over `FIELD.forest` (a road through a forest is fine), up a slope over
    `FIELD.slope` or near the map's edge (`fieldBlocked(x, z, r, soft)`: `wide` clearance to search, `probe` to check, 1 m on a
    road); roads cheap, hedges / rail / sparse trees dear; the cells' staircase pulled straight where the line is clear, then
    chaikin and checked again (fallbacks down to the raw cells). `FIELD.fail` counts why none was found. Off a road a vehicle drives
    at most `FIELD.speed` x its top speed (not in a dash: `dashUntil`);
  - `Column.reroute` from a field: back across it to the nearest of 6 road nodes it can reach; `goField(pts, via)` (a way from the
    leader), `split()` (each vehicle a column of its own), `lay()`; `Vehicle.ahead()`: where it can turn off at its speed and the
    way there, its swerve and move aside carried on, easing out (a turn-off at 10 m/s mid-swerve kinked 20–500 m/s²);
  - `BATTLE.toPlace(x, z)` -> `{ node, tail }`: a column bound for the fight goes on across the field to 25 m of the sensor's point
    when the road is over 70 m off (`dests`, `steer`, `spawnColumn`, `feed`, the QRF, `columnTo` / `columnOn(..., tail)`; cached 5 s);
  - `OFFROAD`: `assault`: an enemy column within `near` m past the frame goes across the field at the nearest of the allies in the
    picture (`tgtNear`) off the road, to `short` m of them (no way round longer than 1.8x the line); the column does not halt for
    a fight on its way (`E.move`), its APC lets its infantry out there; given up after `assaultT` s, on alarm or with the target
    dead. `deploy`: a column halted for a fight on the road in the frame takes positions 15–35 m off it towards the enemy, 15 m
    apart. `scatterNear` (from the gunship's `strike`): each vehicle of a column hit within `scatterR` m in the frame dashes to a
    spot 30–60 m off, away from the hit and off the road to one side, in the frame if it can (a side street in a town), 20 m apart,
    holds `hold` s once there (`scatHold`, `scat`), then goes on alone (`retask`). `steer` and `unjam` leave a column on its own way;
  - helicopters: the enemy's fly two rounds in three over the sensor's point (`HELI_FIGHT`, `Heli.round`; not in very slow music:
    its breaks wait for a clear frame) and make rocket runs at
    what is by the frame first; they come in some 700 m from the fight, out of sight (`spawnHeli`). The allies' keep their rounds
    (over the frame, firing 2.8x as often, they cleared it of the enemy's armour and helicopters);
  - jitter: `blocker()` measures lat across its path's line, not its nose (the nose turned as it pulled aside, the target aside
    moved with it); `byp.po` from that line; the aside rate brakes to its target (`sqrt(3 e)`: no overshoot); `shove` keeps its side
    while touching the same one and leaves alone the one it is going round; standing, the nose does not swing with a move aside;
  - a vehicle stuck in sight for `TRAFFIC.ghost` s: its column turns off to a road 150–400 m away, away from what blocks it
    (`BATTLE.unjam`); after 3x `ghost` it stops looking at that one there too.
  Tests: tests/offroad.spec.js (the way across a field, the assault, the scatter, the helicopters over the frame, no jitter); the
  AIM-9X's lock test keeps one helicopter, without rocket runs (diving at 55 m/s it slips the lock).
- **The Hellfire is laser-guided**: as the real AGM-114K/R (semi-active laser homing, lock-on before launch), the sensor's
  designator puts its spot on the vehicle under the reticle and the seeker locks on it in `LOCK_T.hf` 0.8 s (the AIM-9X's lock
  generalised: `LOCK_T`, `BATTLE.lock.w`, `lockStep` for both), SHOOT, the launch on a strong beat (or `LOCK.fire` s on); in flight
  it goes for the spot (`BATTLE.lase`: `tgt`, `p`, `m`; `missiles[].laser`), wherever the laser holds it: the sensor stays on the
  target until the hit (`aimCamera`), the auto-switching waits, no new lock meanwhile; its target killed first, the spot stays
  where it was. HUD: the lock's arrows with a pulsing diamond (the spot, `HUD.spot`), then LASE and the time of flight boxed where
  SHOOT was and the diamond on the spot (`HUD.laseOn`, `laseDraw`, `cue`). Sheet: hellfire-lase.png.
- The reticle never leaves the frame's centre at the map's edge. Before, near the edge the frame was held on the map
  (`clampFrame`) while the sensor's point went on past it, so the reticle was drawn off the centre (on 6 of 12 maps, up to 31 % of
  the time). Now `clampFrame` keeps the frame corners' reach from its centre (`VIEW.ext`); `VIEW.fits(p, m)` says whether a frame
  centred on p stays on the map, and `VIEW.clampIn(p)` gives the nearest point where it does. `GUNSHIP.track` aims no further, and
  the sensor's point goes back with the frame where it was held. `BATTLE.reach(u)` (for a unit in the air, the ground point behind
  it on the line of sight, `BATTLE.behind`) leaves what cannot be centred to the allies: `target`, `canHit`, the enemies "here",
  the auto-switching's count, the search for the next one, and a `goTo` to it. Districts keep `GS_MARGIN` 320 m off the edge
  (was 260), and the enemy's helicopters fly their rounds over the fight only where they can be reached. The fight is unchanged:
  shots and time on a target on the 4 edge maps were the same within the spread.
- The lock looks like Arma 3's: a box on the target and a diamond round it. While the seeker locks on, only their corners are
  drawn and the diamond shrinks from 5.5x the box down onto it; once locked, both are drawn whole with a dot in the middle
  (`HUD.lockOn`, `HUD.corners`; `lockDraw.d`: the diamond's size over the box's). This replaces the arrows. Sheet: aim-lock.png.
- A vehicle no longer bumps into one of its own column that is behind it (`bumps`). An assault's way that turned back past the
  tank following the APC held both for good.
- The reticle is only ever the frame's centre: `VIEW.ret()` and `HUD.retAt` (the reticle drawn on the sensor's point where the
  frame was held off the map's edge) are gone, since `GUNSHIP.update` now keeps the point on the frame's centre; `onAim`,
  `nearestTo` and the tests measure from the centre. A vehicle still does not bump into its own column's one behind it: a
  leader's hull over its follower's in the frame was measured at 2 steps of 0.1 s in 30 min over 6 maps, not worth more rules.
- A lock's target shows one box, not two: its tracking bracket (`brackets`) is left out and the lock's box takes its place, at
  its track's height and the same size and corners (was a 26u box at 2.5 m by the 30u bracket at the track's height).
- **The money spent**: SPENT at the HUD's top right, under ELEV (`fmtMoney`: three figures, $750, $12.4K, $1.25M, $3.40B, $1.00T),
  the sum of every round fired since the start (`BATTLE.spent`; `WEAPONS` `cost`: dollars a round, rough public figures: 25 mm
  $35, 30 mm $70, 40 mm $180, 105 mm $1,200, APKWS $25K a rocket, GBU-39 $40K, Hellfire $150K, AIM-9X $470K, railgun $25K, the
  laser $10 a second of beam). Every round of a burst counts, the sub-beat ones too (they take no cosmetic ammunition). The
  property **Money spent on the HUD** (`cost`, on; `?cost=0`). Not kept across launches.
- A vehicle hit in the frame no longer stays put, firing: of those that lived 8 s after a hit 41 % had not moved 8 m (6 maps x 4 min),
  mostly stuck on their dash behind the wreck of their column's leader on the road ahead (the way off started down the road from
  where it could turn off, `ahead()`, into the wreck; going round it at a crawl), and one holding its spot was not scattered again
  however often it was hit. Now: `spread(..., opt)`: a scatter's way is kept 9 m off other vehicles and wrecks for its first 14
  tries (`wayClear`: unless no closer to one than it stands now); stuck on its dash (under 0.5 m/s for 2 s) it picks another spot
  and goes from where it stands (`opt.here`; up to 3 times, `stat.rescat`); holding its spot it scatters again when hit 15 s on
  (`scT`; only not on its dash). `scatSpot(p)` and `scatGo` out of `scatterNear`. Most of those still standing now have got to
  their spot; one map's pile-up of wrecks still pins some (seed 7). Test: offroad.spec.js, behind a knocked-out leader.
- The money spent rolls up to a new sum over a couple of seconds instead of jumping (`HUD.spentAt(dt)`: eased at 2.3 a second
  in real time, 99 % there in 2 s; `spentShown`).
- The money spent is the **MISSION COST** now (the HUD's label; the property **Mission cost on the HUD**, still `cost`), and a
  mission ends with the music: after `COST_RESET` 60 s of silence (`BATTLE.silent`: real time since `AUD.lastActive`, counted only while the wallpaper runs, so a pause in WE with the music on is no silence) `BATTLE.spent` goes
  back to 0 (`BATTLE.update`) and the HUD rolls down to it as it rolls up, the last 1 % of the drop at once (`spentDrop`): 0 in 2 s. The line is like those above it (14, 22u under ELEV; was 16, 30u under).
- More of the allies in the frame, so that it shows what the enemy fires at. Measured (6 maps x 4 min of fighting): an ally in
  the frame 33 % -> 46 % of the time, 1.3 -> 2.4 of them on average; an enemy's shot at one in the frame 10 % -> 19 % (shooter and
  target both 6 % -> 14 %). The frame's ground reaches only 40–70 m from its centre; the allies stood or ran 100–150 m off it.
  What changed: the sensor's next target is rather one with an ally within `MIXED.r` 35 m (in the picture with it; distance x
  `MIXED.k` 0.1; the 80 m one x 0.25 as before), since the frame moves on faster than infantry runs; the allies' loops round the
  point keep inside the frame (`ALLY_LOOP` 8–28 m, was 15–45) and leave out the spot they start from (they came back out to it
  every lap), also once got to their target (`Squad.update`, within `SQUAD_NEAR` 220 m); fireteams running in are given a loop
  round where the point is now (every 4 s, `reT`; they ran on to where it had been); one fighting out of the picture near it goes
  in (at its target if that is in the picture, to `SQUAD_IN` 15 m, else at the centre); the fireteams fed in run in at 5 m/s (was 3; `feed`: they alone are re-aimed, not an APC's still coming out); a
  fireteam is fed while fewer than `ALLY_FEED.min` 3 are in the frame (was none), every 4 s at most (was 6); `ALLY_TOUGH` 0.25
  (was 0.4); their infantry capped at `ALLY_FEED.inf` 45 (was 30: with more fireteams their APCs let only some of theirs out).
  A vehicle standing and moved aside (`traffic()`: shoved by another, going round one) was never checked for running into
  anything: `step()` compared its aside with itself, already moved. Now `drive()` passes the aside before (`po0`); an APC pushed
  through a wreck and back had 92 overlaps in sight in the traffic test (seed 11), now 0. The scatter's way near one it stands by
  must lead off from it (`wayClear`: each point further than it is now, not along it).

- Brighter tracers. They were drawn no brighter than white (2x at the exposure, just over the 1.9 the bloom starts at, and thin ones
  are lost in its blurred levels), so they hardly glowed by day. `Tracers.spawn(..., { glow })` multiplies the colour past white
  (the core goes white, the colour blooms round it): the units' x `TRACER_GLOW.unit` 6, the gunship's guns x `.gun` 3. The units'
  are thicker and longer too (`FIRE` w / len: infantry 0.13 / 3.5, car 0.2 / 5, APC 0.26 / 6, tank 0.4 / 7, helicopter 0.3 / 6;
  were 0.07–0.3 / 2.2–5), with a muzzle flash from a car (0.5) and an APC (0.8) as from a tank. Sheets: tracers.png,
  tracers-close.png (the most units' tracers in the frame, TV / NV / white-hot, and a close look round them).
- A song fading out no longer keeps the guns going to its end. A beat's strength is measured against the last moments only, so a
  fading song's kicks were as strong as a loud one's, and "any beat will do after a while" fired the rest: the 105 mm fired about
  0.5 a second loud, fading and at a tenth of the loudness alike (every weapon the same). Now `AUD.fade` (`FADE`): the loudness over
  the last `win` 2 s (`mid`: not a beat's rise and fall) over the song's (`peakL`: its peak, sinking over `tau` 40 s), smoothstep from `lo` 0.35 to `hi` 0.85; a beat fires
  the gunship's weapon with that chance (`gunOnBeat`, `subBeat`; not a drop's forced shot), and the any-beat fallbacks only at 1.
  Measured (a 15 s fade to a tenth): the 105 mm 0.53 / 0.53 / 0.6 a second loud / fading / at a tenth before; now 0.53 loud, 0.53
  in the fade's first half (down a quarter, as a quieter verse), 0.13 in its second, 0 at its end. Test: music.spec.js.
  `BATTLE.fadeK()`: 1 in a drop's surge (`mid` lags 2 s behind the drop), else `AUD.fade`; the AIM-9X's and Hellfire's launch after
  SHOOT obeys it too (held another `LOCK.fire` s). Sound after a silence (a new song) resets `peakL` to `mid`: a quieter song is
  not measured against the loud one before it.
- No weapon is wasted on a target a missile in flight will kill: `BATTLE.incoming(u)` is what the gunship's missiles on their way
  will do to it, as `strike()` deals it (a homing one's or the Hellfire's spot's in full, the rest by where they land); `doomed(u)`
  when that is its hp or more. `target()`, `nearestTo()`, the camera's search and `autoArm()`'s count skip a doomed one: the
  auto-switching no longer picks the 105 mm and fires it at the GBU-39's target (the shell gets there first, as dead from either).
  With nothing else for the weapon in hand, the sensor follows the doomed one to the hit. Measured (gbu + h105, 150 s): 4 of 56 105 mm triggers at a doomed
  target before, now 0; the GBU-39 hits 22 before, 31 now (it goes on to the next). Test: battle.spec.js.
- A vehicle inside the hull of the one it goes round is pushed out of it (`shove`, to the side it goes round by, `byp.d`; dropping
  the bypass instead set the two against each other: 4–5x the bypasses, the jitter test over), no longer held there now that its
  moves aside are checked (seed 3's traffic test: 70 overlaps in sight, now 3–5).
- A second auto vision: **Auto: TV by day, night vision at night** (`CFG.vision` `autonv`, `?mode=autonv`). `SENSOR.auto()` is the
  mode either auto wants now (null when not auto); `initial()` and the live switch in the main loop (through `SENSOR.set`) use it.
- The GBU-39 has a reticle of its own (`bomb`; it had the Hellfire's and the APKWS's `circle`), and it brings a building down: x3 on a structure
  (`ARMOR.gbu.struct`: 66, the HQ's 60 at one bomb, was 3), a structure within 8 m of its pad flattened too (`STRUCT_REACH`,
  `structReach`; the rest still only what lands on it, 4 m), its blast 18 m on the ground (`SPLASH`, was 14) and bigger (`fx`
  4.6, was 3.6). Test: battle.spec.js.
- The GBU-39's and the APKWS's reticles are drawn in the world (`HUD.onGround(dx, dy, dz)`: a point that far off `CAM_TGT`, in
  pixels from the screen's centre). The bomb's: the blast's ring on the ground (`SPLASH.gbu` 18 m, broken at the diagonals), a
  pipper, and the line it falls down onto it ticked at `BOMB_TICKS` 10 / 20 / 30 m over the point, up to `BOMB_TOP` 40 m: under
  the aircraft the line of sight is steep and the line short, further off it is flatter and the line longer (82 px for the top
  tick at 256 m slant, 182 px at 454 m; `HUD.bombDraw`). The APKWS's (`salvo`, unguided rockets): the ground its salvo covers
  (`SALVO_R` 12 m: its spread and a rocket's blast, `GUN.apk.spread` + `SPLASH.apk`) as a ring of 16 dashes, a cross, and the pod's four rockets under it: they go
  off as the salvo's rockets leave (`BATTLE.pod`: `n` of `of`, 2–6 by the beat, `BURST`; in step, the last with the last;
  `HUD.podDraw`), then fill up again as it reloads. The rockets ripple off 0.25 s apart (`GUN.apk.step`, was 0.12: the
  salvo went in half a second, its marks went off as one); the auto-switching waits for the salvo to be gone (`BATTLE.pod`: it hopped 0.3 s in). Both rings lie on the ground (`onGround(dx, null, dz)`: `groundH`). The Hellfire keeps `circle`. Sheet: none (test-results/reticles-near-far.png was made by hand).
- A missile or a bomb makes for the beat only about a beat of its own flight short of the end (`BATTLE.cut(m)`: 1 - `beatP` /
  `dur`, held to `CUT` 0.55–0.93; was 0.55 to make for it and 0.8 to wait at a quarter of its speed): a bomb no longer hangs high,
  then drops at 6x. The faster the music and the slower it flies, the nearer the ground: the GBU-39 at 0.82 at 150 bpm (it made
  for it at 0.86 of its way), the Hellfire at 0.6 at 90. Test: battle.spec.js.
- **The CBU-97** (`cbu`, sensor-fuzed: `SFW`; off by default, property **CBU-97 cluster bombs (sensor-fuzed)**, $360K): a canister
  glides to a point `CLUSTER.open` 40 m over the ground (`GUN.cbu`: `bomb`, `cluster`, no homing) and opens there on the beat
  (`BATTLE.cluster`): 10 submunitions come down on chutes (`subs`, `flySubs`; bodies at `CLUSTER.sub`) to `hover` 15 m over
  `CLUSTER_PAT`'s spots (three in, seven round) in a circle of `r` 16 m, turned with the line of sight; then one a sixteenth of the beat on
  the kick's grid (`beatP` / 4, else 0.125 s) fires its 4 skeets at once (`skeets`): each a bright slug down at the nearest enemy
  vehicle within `seek` 9 m that the ones before have not done for yet (`dmg` 8 each: a car or an APC at one, a tank at two), else
  into the ground, its fragments killing the enemy's infantry within 4 m; never an ally. `incoming` / `doomed` leave it out.
  `PREF.cbu` (armour), `HEAVY_ARMS`. HUD reticle `cluster`: a small ring (`mark` 3 m) on the ground where each submunition comes
  down, a cross (`HUD.clusterDraw`; an ellipse with brackets looked odd). Stats: `clusters`, `skeets`, `skeetHits`, `cluSalvo`. Measured: a
  column of a car, two APCs and a tank under it: all four dead with 5 of the 40 skeets, an ally APC 15 m off untouched. Tests:
  battle.spec.js; sheet: cluster.png (the reticle, opening, striking, after; the selector with all eleven weapons).
## Design
- **Camera**: a slow left orbit over a district, a transit to another every few minutes in silence, slewing onto enemies in
  combat; in a fight it works one zone and leaves it only in a quiet part of the music (`ZONE`), the enemy coming to it. Per-weapon zoom. Always looking down: no sky in frame.
- **Vision**: TV, WH, BH, NVG; a clickable switch on the HUD that is NOT persisted; a property for the default (auto = TV by day, WH at night — the default / autonv = TV by
  day, NVG at night / tv / wh / bh / nv).
- **HUD**: mode label, callsign (property, default `GHOSTRIDER 31`), compass, altitude ladder, PC clock, the money spent (optional), crosshair per weapon;
  at the bottom a clickable selector of the enabled weapons with cosmetic ammo / reload, kept `CFG.hudBottom` (48 px) above the bottom edge for the Windows taskbar. Screen-fixed corner brackets: allies blue,
  enemies white.
- **Map**: ~2×2 km generated at start under the splash; seed property (0 = new each launch). Gentle hills, lakes, roads with
  bridges, rail, towns, fields, forests. Ordinary buildings are indestructible; only enemy base structures blow up.
- **Combat**: allies always exist, losses replaced off screen. Enemies appear with music (5 s of sound), always off screen: columns
  and a base, the camera goes to the base. Music stops, a 5 s hold, then fire ceases and enemies leave the frame and vanish; a base is removed
  only out of view. Both sides fight each other. Five unit types per side with different models: infantry, tank, APC, car,
  helicopter. Infantry vanish in a dust puff at once; vehicles lie as wrecks, then sink into the ground.
- **Weapons** (one active; each a property, no limit; first three on by default; optional auto-switching, a click selects a weapon and
  auto resumes 30 s later, or 3 s after the click once nothing that weapon may hit is left within 250 m of the sensor's point; only fires at what the table allows, allies handle the rest; guns land at once, missiles / bombs on the next beat with a deadline):

| Weapon | Infantry | Car | APC | Tank | Helicopter | Beat |
|---|---|---|---|---|---|---|
| Gatling 25 mm | + | + | + | | | high |
| 30 mm | + | + | + | | | mid |
| 105 mm | + | + | + | + | | low |
| 40 mm Bofors | + | + | + | | | mid |
| Hellfire | | + | + | + | | strong |
| APKWS salvo | + | + | + | | | strong |
| GBU-39 | + | + | + | + | | strong |
| CBU-97 | + | + | + | + | | strong, its skeets on the sixteenths |
| AIM-9X | | | | | + | strong |
| Laser | + | + | + | + | + | held on the beat, targets burn up |
| Railgun | + | + | + | + | + | strong, pierces a column along a line |

- **Extras**: drifting clouds under the camera, rain, snow, fog (optional); enemy AA tracers and missiles rising past the camera with flares in reply,
  purely visual (optional); the splash screen `DANGER CLOSE` with a CSS failsafe.

## Stack & layout
- Plain JS, no build step. `'use strict'` classic scripts sharing **global** scope (no modules; top-level names unique across
  files). three.js **r187** is vendored as `js/three.min.js` — never edit it. r187 ships ES modules only and modules may not load over `file://` in WE, so it was
  bundled once with esbuild: `export * from "three"` → `esbuild --bundle --minify --format=iife --global-name=THREE --target=es2020`.
- Code taken from FAB / Code 3 (r149) needs the r187 changes: `opaque_fragment` (was `output_fragment`), `addUpdateRange` (was `updateRange`), `PCFShadowMap` (`PCFSoftShadowMap` is gone), `InstancedMesh` can compute its own bounding sphere.
- **Colour and light (stage 8)**: colour management is on. Colours are authored in sRGB (hex; `Color.setHex` converts), canvas colour textures are `srgbTex`, data textures (masks, detail, land use) stay untagged. The scene is lit in linear light into a half-float MSAA target; `renderer.outputColorSpace` stays linear because the sensor's post pass does the conversion itself (`show()`: exposure `uExp`, a soft shoulder, the sRGB curve; thermal frames hold heat and are taken as they are). Bloom in TV / NVG comes only from what is brighter than a sunlit white surface (`over()`); thermal keeps its own thresholds. Light intensities: `SKY_KEYS` are tuned in display space and go through `GAMMA` (x^2.2), × π. Any brightness factor tuned by eye (gains, window glow, detail shading in the ground shader) is a display-space number: put it through `GAMMA` / `pow(…, 2.2)`. Unlit sprites (smoke, dust, clouds) are scaled by `SU.uLit` (the light level, 1 at noon). In the heat term the colour and the sunlight are converted back to display values, so thermal looks as before.
- Load order: `core → sensor → models → armor → helis → mapgen → layout → terrain → structures → effects → infantry → units → weapons → battle → weather → lights → guns → gunship → hud → audio → main → properties → settings`.
  Then: `lights → guns` (after weather), and `properties → settings` (after main).

| File | Contents |
|---|---|
| `js/core.js` | utils, `mulberry32`, `CFG`, `WIND`, `groundH`, `SEASONS`, sun position, sky palette, `TEX` |
| `js/sensor.js` | `SENSOR` (modes, render target, post shader), `SU` shared uniforms, `sensorHook` / `sensorMat` (the heat term) |
| `js/models.js` | mesh helpers (`M`, `HOT`, `box`, `cyl`, `taper`, `prism`, `strut`…), `mergeStatic` (bakes `aHeat`), `disposeTree`, seasonal materials |
| `js/armor.js` | vehicle models facing +x (×`ARMOR_SCALE`): T-90, BTR (enemy), Abrams, Bradley, Humvee (ally), technical (enemy car), each with a roof machine gun `mg` (not the Bradley); `WRECK_MATS`, `toWreck` |
| `js/helis.js` | helicopter models (FAB airframes, ×`HELI_SCALE` = 10): AH-64, UH-60 (ally), Mi-24, Ka-52 (enemy), all on wheels; rotors named `rotor` / `rotor2` / `trotor`; `userData.nav`: their navigation lights |
| `js/mapgen.js` | `MAP` (seeded heights and masks on a 4 m grid, built as a generator run in slices), `vnoise`, `groundH` (exactly the mesh's triangles), `groundN` |
| `js/layout.js` | `LAYOUT`: outposts (`OP_W`×`OP_D` walled compounds beside a country road: parts, gate, inner drive, pad), lakes, the river, towns, the railway, roads (A* on a 16 m grid, profiles, carving into `MAP.h`), streets, building lots, the station, farms, tracks, fields; the occupancy grid `OCC` (2 m cells, `OCC_*` flags: `occAt`), `MAP.water` / `MAP.wl` (`waterAt`, `waterLevelAt`), the land-use canvas (fields as premultiplied rgb(coverage, row angle, crop)) |
| `js/terrain.js` | `TERRAIN`: ground chunks (16×16 of 128 m), the ground material (mask + tiled detail in world space, `GROUND_PAL` per season), vegetation (one InstancedMesh per kind and chunk; roles fixed per seed, shapes per season) |
| `js/structures.js` | `STRUCT`: water (lakes, river), road / rail ribbons draped on the carved ground (decal materials: no depth write, polygon offset, renderOrder), bridges, the station, buildings (`BUILDERS`) merged per town / farm |
| `js/effects.js` | `Tracers`, `SpriteFX`, `Scorch`, `blast`, missiles in flight (`StepPool`, `Bodies`, `Plumes`, `missileFx`, `MISSILE_LOOK`) |
| `js/infantry.js` | `INF`: every soldier in two InstancedMeshes (bodies; legs swinging), instance colour = side; a soldier is its own HUD track |
| `js/units.js` | `UNIT_TYPES`, `ROADNET` (a node per road sample, ends joined to other roads, A*), `Path` (lane to the right; the line averaged over `PATH_SMOOTH`), `Vehicle` (`bend()` slows it for its own bend; `coast` rolls a wreck on; `traffic` / `blocker` / `bumps`: keeps out of other vehicles and wrecks), `Column` (leader + gap; `follow` turns round on a reversed path), `Heli` (pad → up → fly a round → home → down), `Squad` (file along the leader's trail; `flee`), `walkable` / `patrolLoop`, `ALLIES` (a garrison per outpost; sorties to the enemy base in a fight, losses replaced out of sight); combatants: `UNITS`, `enlist` / `delist` / `hurt`, `unitModel` (a prototype per model, cloned: no geometry per spawn), `Column.reroute` (from where it stands; the rear leads if the way goes back) |
| `js/weapons.js` | `WEAPONS` (name, zoom factor, reticle, `hits` = the kinds it may hit, `band` = the beat that fires it, `use`, cosmetic rounds / magazine / reload), `ARMS` (the selected weapon, ammunition state) |
| `js/lights.js` | `LAMPS`: the lamps are additive sprites (one pool refilled every frame); their light is a **map** drawn from above into one 2048² texture round `CAM_TGT` (`LAMP_HALF` m each way, `LAMPS.draw()` from `SENSOR.render`), which every Phong material adds as albedo × map at its world position (`sensorHook`: `uLampMap`, `uLampRect`, `uCamW`). Headlights (a cone, cut at the vehicle ahead), helicopter navigation lights, searchlights on the outposts' towers and the enemy base's bunkers / mast, yard lamps (`OP_LAMPS`, a lamp over each enemy tent / dump), street lamps along paved roads (`LAYOUT.lamps`, poles built in `structures.js`). On from dusk (the laser's red glow at `BATTLE.lasHit`: day and night); nothing on the thermal sensor |
| `js/guns.js` | `GUNS`: the barrels of the 105 mm and the railgun (each while enabled; two sit side by side along the fuselage, `GUN_MOUNTS`) at the bottom right. A scene of its own with a 40° lens, drawn into `SENSOR.rt` after the world over a cleared depth (`GUNS.render` from `SENSOR.render`), so the post pass treats it like the rest. Its world is fixed to the aircraft (the view at the orbit's centre `CAM_CTR`); its lens turns as the sensor slews off the centre, so looking down lifts the barrels, far off they leave the frame. Lit by the sun / moon and sky turned into that frame; its materials skip the lamps' map (`userData.noLamp`, `customProgramCacheKey 'gun'`). On every shot (`BATTLE.fire` → `GUNS.shot`) recoil, a flash with a point light, gases from the brake; the railgun's slot flashes and glows as it recharges; barrels heat up per shot (thermal). `GUNS.muzzleAt` puts a shot's start on the line of sight through the muzzle on the screen (`BATTLE.muzzle`), so tracers leave the barrel; the guns with no barrel drawn start theirs through a mount just outside the frame's right edge (`GUN_SIDE`, `GUNS.sideAt`, 32 m out: `GUN_SIDE_D`). Programs compiled at start (`GUNS.warm`) |
| `js/battle.js` | `BATTLE`: the fight's life cycle (start on arming: a base on one of `LAYOUT.sites` + garrison, the camera stays and the first wave comes to it; waves of columns / squads / helicopters out of sight; stand-down: retreat, removal out of sight), units shooting each other (`FIRE`, `VS`), the gunship's fire on the beat (`GUN`: guns, missiles landing on the next beat, laser, railgun; `strike` damages only `hits`; fires only at what is under the reticle), the camera in a fight, the auto-switching (`PREF`), `WRECKS` (cooling stages, sinking), the base's structures (`BASE_MODELS`, `BASE_PLAN`), `BATTLE.log` / `BATTLE.stat` for the tests |
| `js/weather.js` | `WEATHER`: the kind (clear / rain / snow / fog; auto draws one for the season every 8–15 min) fading in `WEATHER.k`, `light()` (overcast sun, grey haze, fog distances; called from `updateEnvironment`), rain / snow streaks (`drops`, a cold `Tracers` pool round the sensor's point), clouds (clusters of soft sprites wrapped in a square round the sensor's point, filled into `fx.live` + `SpriteFX.flush`; none in a fight); `AA`: tracer bursts and missiles from enemies near the sensor's point up past the lens, flares in reply (`FX.flare`), looks only |
| `js/audio.js` | `AUD` (level, `heavy`, the arming latch: `combat`, `holding`, `fighting`), `BANDS` beat detection → `BATTLE.onBeat(band, strength)` (units, AA, gunship), `updateArming`, the music's shape (`drive`, `calm` quiet parts, drops → `BATTLE.onDrop`), the tempo (`tempoKick` → `bpm`, `tempo`), the demo beat (`?demo=124` with a quiet part and silent bars, `&pause=0`) |
| `js/gunship.js` | `GUNSHIP`: districts (towns, spots, farms, roads in the country; `GS_MARGIN` from the edge), a random start, the left orbit, the slew (eased aim + critically damped spring, its stiffness on a target set by the music: `SLEW_MUSIC`, `slewK`), transits (smootherstep, zoom-out arc), `track(p)` for combat; `TRACKS` (what the HUD brackets); the outposts are districts too |
| `js/hud.js` | `HUD`: a 2D canvas over the picture (compass, altitude ladder, clock, grid, reticle per weapon, fixed-size brackets) + DOM for the clicks (`#modes`, `#arms`); sizes follow window height × `CFG.hudScale` (`--hs` in CSS) |
| `js/main.js` | scene init, camera (the aircraft circles `CAM_CTR`, the sensor looks at `CAM_TGT`: slewing turns the line of sight, the lens keeps the frame's size at any range; `clampFrame`: the whole frame stays on the map, measured down to `MAP.lo`), `VIEW`, `updateEnvironment`, `fitShadow`, main loop |
| `js/properties.js` | `WE_PROPERTIES`: generated from `project.json` by `tools/gen_properties.py` — never edit by hand; after changing a property in `project.json` run `python tools/gen_properties.py` (a test checks they agree) |
| `js/settings.js` | the settings drawer in a normal browser (not in WE, not under automated tests unless `?cfg`): every property through `wallpaperPropertyListener`, kept in `localStorage`; the demo beat and an audio file player (`FILE_AUDIO`) for music |
| `project.json` | Wallpaper Engine: title, description, `preview.gif`, `supportsaudioprocessing`, the properties (orders by group: 1–9 sensor & HUD, 10–19 time & weather, 20–29 weapons `w_<id>`, 30–39 fight & music, 40–49 map & quality). `applyUserProperties` (main.js) handles each; the URL's test parameters win; a new seed reloads |

## Rules / conventions
- **After changing any JS/CSS file, bump the cache-buster** `?v=N` on all `<script>`/`<link>` tags in `index.html`. Current: `v=106`.
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
- At start every program is compiled with `renderer.compileAsync` under the splash (a 20 s deadline), then one whole frame is drawn with nothing hidden and nothing culled (`finishInit`): compiling does not make the shadow pass's programs, and hidden effect pools would compile on first use. The splash hides itself after 45 s whatever happens (CSS).
- Vision `auto` / `autonv` follows day and night live (TV / white-hot or night vision) until a mode is clicked (`SENSOR.manual`). Windows (`WIN_MAT`) are lit after dusk.

## Notes for later
- **Local files in Wallpaper Engine**: WE provides `window.wallpaperRequestRegisteredFile` to read a user's local file (e.g. a file
  property). It does not exist in a normal browser: a browser fallback (a file `<input>` in the settings drawer, or `fetch` of a
  bundled file) is still to be worked out if a feature needs it. (From the user, 2026-11-11.)

## Running & testing
- Browser preview: `python -m http.server 8767` in this folder, URL params `?hour=22`, `?season=winter`, `?mode=wh`, `?zoom=150`, `?ts=N`.
- Tests: `powershell -ExecutionPolicy Bypass -File tools/test.ps1 [file / -g pattern]` (Playwright in Docker, SwiftShader; `$env:SEED = N`). CI runs the same image on every push / PR (`.github/workflows/tests.yml`).
- Review sheets: `powershell -ExecutionPolicy Bypass -File tools/test.ps1 -c tools/preview.config.js` → `test-results/*.png`, `terrain-metrics.json`. URL params also `?seed=N`, `?x=&z=` (view point), `?az=` (fixed camera azimuth, deg), `?spot=town` (start district by name), `?transit=N` (minutes between transits, 0 = never), `?weapons=all` or `g25,h105`, `?hud=0`, `?demo=124` (a synthetic beat: the fight in a browser; `&pause=0` without silent bars), `?auto=0` (no auto-switching), `?enemies=N` (%), `?weather=rain` (clear / rain / snow / fog / auto), `?clouds=N` (%), `?aa=0`.
- Tests feed music with `wp.sim(sec, { audio: true })` (`pauses: true`: the demo's quiet part and silent bars; `spec: rt => array`: any spectrum, in-page only). `tests/music.spec.js`: units on the beat, pace vs damage, drops, AA on the beat, the tempo and the guns' rate. `tests/soak.spec.js`: five fights and silences with every weapon, weather, day and night and a new season; nothing may pile up.
- Workshop preview and README screenshots: `tools/test.ps1 -c tools/preview.config.js -g "gif|screens"` → `test-results/gif-*.gif`, `shot-*.jpg`; copy the chosen ones over `preview.gif` / `screenshots/`. `?cfg` shows the settings drawer under the tests.
