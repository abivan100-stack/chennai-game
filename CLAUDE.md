# Auto Anna — project guide

## Game vision
- Third-person open world set in **Mylapore, Chennai**. The player is a young guy who inherits his uncle's old **auto rickshaw**.
- Core loop: walk around, get into the auto, pick up passengers, drop them at destinations, earn fares, pay off the auto before the moneylender takes it.
- **Game clock** starts at the real Chennai time (IST) and runs 20x faster (3 real s = 1 game minute, a day in 72 min; `TIME_SCALE` in sky.ts) and drives the day/night cycle and the daily loan due. Later, **real Chennai weather** (Open-Meteo API) drives rain and flooding.
- Dialogue in **Tanglish**. HUD: wallet, minimap, mission text, health.
- Target: good-looking but smooth on ordinary laptops with integrated graphics. **30+ FPS minimum, 60 where possible.**
- Hosted as a static site on **Cloudflare Pages** (`npm run build` → `dist/`).

## Status
Step 1 done: test town (flat 200 m ground, 19 box buildings, road grid), follow camera, parked placeholder auto ("F - Get in" just logs), IST day/night, adaptive quality, debug panel, HUD placeholders.
Step 2 done: animated Mixamo hero (idle/walk/run/jump, 0.2 s crossfades) on the invisible capsule; 10 Quaternius NPCs (5 idle, 5 walking block loops), frozen beyond 40 m; loading screen.
Step 2b done: NPC interactions: E to talk (both play a talking clip, Tanglish line), running/driving into NPCs makes them flinch and yell, NPCs block the player (kinematic capsules, ignored by the camera).
Step 3 done: proper street (asphalt, lane markings, zebra crossings, raised sidewalks with black-yellow curbs, lamps with night light pools, trees), ~150 attached 1-4 storey shop-houses (shops + Tamil/English signboards, windows that light up at night, balconies, parapets, water tanks); detailed auto with Rapier raycast-vehicle driving; enter/exit animation sequence; 12 NPCs always walking/jogging, stepping around the player.
Step 3b done: Mylapore layout (stylised from the real one): Kapaleeshwarar temple in the centre block (east gopuram on East Mada Street, smaller west gopuram, kavi-striped compound wall, shrine + vimana, pillared mandapam, golden flag post), temple tank west of it (striped steps, water, 16-pillar mandapam), the four Mada Streets + R.K. Mutt Rd / Luz Church Rd / Kutchery Rd / San Thome High Rd with Tamil/English street-name boards; buildings vary in width, depth, floor heights, shop count, sign size and roofline (incl. old tiled-roof houses with a thinnai). Driver's hips are pinned to the seat (Ride.lateUpdate) so entering is one straight move.
Step 4 done: render interpolation (no stutter from the 60 Hz physics), taxi fares (passenger waits at a named stop, boards the back bench, drop at the destination marker, Chennai-style meter fare + quick-ride tip, wallet), minimap.
Step 5 done: real town map (building footprints, shops with names, trees, street names, temple, tank) used by a zoomed player-centred minimap and the phone; phone (P) with Orders (accept ride requests), Map, Wallet (earnings, repay Kandasamy's ₹15,000 loan, ₹500/day due, missed-day messages), Messages, Weather; traffic (autos, cars, MTC bus) in left-hand lanes with honking; live Chennai weather from Open-Meteo driving rain, clouds, fog and wet roads (R cycles a test override).
Step 6 done: every vehicle has a TN number plate and more detail (lights, grille, mirrors, door lines; MTC bus livery + route board); seated drivers (retargeted Driving pose, frozen); steal any vehicle (driver ejected, runs off) -> wanted level (1 star warning/arrest, 2-3 shoot on sight; escalates if you keep it 15 s, hit people, or ram/hit police; fades when out of sight 20 s); police jeep from the Mylapore Police Station on Kutchery Road chases along the road route with lights + siren, khaki officers get out to arrest or shoot (line of sight, tracers); health bar; ARRESTED / SUTTUTAANGA! screen -> fine and release at the station; stick (lathi) weapon.
Step 6b done: melee with Mixamo clips (punch / lathi swing / kick / block; NPCs get knocked down, or fight back with a retargeted combo after the second hit); hero sits visibly in stolen vehicles; police reworked: units spawn on a road 38-55 m away out of view (1 unit at 1-2 stars, 2 at 3), follow the road route at full speed, officers on foot use a character controller (no walking through walls), 1.2 s arrest window with a prompt, blocking halves gunshot damage; nav-app style map (white streets, yellow main roads, landmark badges, bus stops) and a heading-up 200 px minimap with upright labels and flashing police blips.
Step 7 done: energy (hunger) bar that drains with walking / running / driving / fighting; low = warning, very low = can't run, empty = no healing and health drains until you collapse (PASI-LA VIZHUNDHUTEENGA! -> hospital bill, respawn fed). 114 eateries from the shop boards (tiffin centres, mess, hotels with a steel table + red stool outside; tea stalls, stores, supermarkets for snacks): E opens the menu, 1-4 orders; hotels: walk to the stool, sit, eat off a banana leaf bite by bite (CCD IK hand-to-mouth over the seated pose, food shrinks, energy fills), stand up; shops: eat standing. WASD stops early.
Step 7b done: fist fights with police (officers have health: punch 25 / lathi 40 / kick 35 + knockdown; out cold 25 s at 0; within 6 m they rush you with fists instead of shooting; hitting police = +1 star, min 2); stool pose fixed (sit facing the road, swivel to face the table, knees under it); faster vehicles (auto 65 km/h, traffic ~40% faster, police jeeps 80 km/h); new Indian-style traffic: scooter, motorbike, Ambassador-style taxi, Omni-style van, Ace-style mini truck, TN lorry (all stealable); two walk-in Kapali Supermarkets (shelves -> basket (E, 1-4) -> pay at the counter -> eat; walk out unpaid = theft star); street 'supermarket' boards became Kapali Bakery; police jeeps park inside the station forecourt.
Step 7c done: game clock 20x real time; save game in localStorage (core/save.ts: cash, loan, day, energy, health, clock, player + auto position; autosave every 10 s + on pagehide; phone Wallet -> New game wipes it); fines / hospital bills you can't cover go on the kadan (Economy.charge); key 1 no longer takes the lathi out when it orders food.
Step 8 done: Santhome added east of San Thome High Road (map now x -100..250 x z -100..100; layout has separate X_LINES / Z_LINES and roads() with extents): San Thome Basilica block, Kamarajar Salai (Beach Road, x = 125), Santhome beach + sea + Marina lighthouse + boats / carts / palms (world/santhome.ts), Santhome traffic + pedestrians + 5 new stops; traffic lights at the 4 Mada Street junctions (AI stops on red; jumping a red while driving = ₹500 fine); procedural WebAudio sound (engines per vehicle, footsteps, city, temple bells, sea, rain, hits, coins, eating; M mutes); missions: urgent hospital trips (double fare on time), VIP rides (triple if no bumps), parcel deliveries from hotels (tip if hot); 3 missed days -> Kandasamy seizes the auto until you pay overdue + ₹500 (Phone > Wallet); flood water on low roads in heavy rain slows everything, rain fare surcharge 30%; hero falls flat when shot / fainting; bike / scooter riders straddle; distance detail for traffic and pedestrians.
Step 8b done: hero clips death (shot / fainted), kneel + kneel_idle (arrested), hit_react (flinch, 1.5 s cooldown), sit_idle (hotel stool) via PlayerController.forceAction; Chennai look for the hero (characters/chennaiLook.ts: texture recoloured at load to khaki shirt, checked lungi, brown chappals, browner skin; thundu on the shoulder, moustache, vibhuti + kumkum).
Step 8c done: image-based light (RoomEnvironment PMREM as scene.environment, intensity follows day/night: ENV_DAY / ENV_NIGHT in main.ts); hero walk/run blended by speed with phase-locked cycles (Animator.locomotion), lean into turns, head turns toward the camera's look direction; restyle refined (dark madras lungi, draped thundu ribbon, matte skin/cloth).
Step 8d done: hero outfit: maroon/navy checked full-sleeve shirt, blue jeans, leather belt, brown shoes (thundu and lungi removed; original Mixamo body kept).
Step 9 done: Mandaveli added south of Kutchery Road (map z now -100..220; Venkatakrishna Road z = 125, St. Mary's Road z = 180): MTC Mandaveli bus depot (layout.DEPOT_LOT, parked buses), and past the south wall the Buckingham Canal with the elevated MRTS line, Mandaveli station and a train that stops there (world/mandaveli.ts); 3 new stops, traffic and pedestrians there. Lighthouse is enterable (E at the door -> gallery at the top, E -> back down; walkable gallery colliders). H = horn per vehicle kind (pedestrians may shout back), L = headlights (one non-shadow SpotLight, on at dusk automatically). Water is off-limits: sea wall at the waterline, invisible walls at the temple tank's waterline, canal beyond the town wall. Hero clothes no longer glare (roughness / metalness maps dropped).
Step 9b done: canal + MRTS moved to run north-south past the WEST wall (like the real Buckingham Canal / MRTS), with Thirumayilai and Mandaveli stations and the train stopping at both (built in the line's own frame in mandaveli.ts); plain land past the north and south edges, beach and sea run the whole coast. Brighter nights (lamps every 14 m with bigger pools, stronger moon + street-light bounce, higher night exposure). Full-screen map on Tab (ui/bigMap.ts: zoom wheel / + - / Q E, pan WASD, C centre, legend, scale bar). Five street-tree kinds in props.ts (neem, rain tree, gulmohar, ashoka, banyan) + backdrop groves past the edges. Rooftop hoardings (world/posters.ts): original code-drawn JAILER 2 / SCENE film posters and a TVK thank-you banner (no photos or real faces), lit at night.
Step 9c done: Isabel Hospital on Luz Church Road (world/hospital.ts, layout.HOSPITAL_LOT): white 3-storey block, lit red-cross board, canopy, compound wall, ambulance; you wake up outside its gate after fainting from hunger or being shot (arrests still release at the police station); H badge on the maps.
Step 10 done: neighbourhood places (world/places.ts, layout.PLACE_LOTS): Nageswara Rao Park + Luz Church on Luz Church Road, vegetable market + auto stand with a tea stall south of the tank, Mylai Fuels petrol bunk + Murugan Auto Works on R.K. Mutt Road, Kamadhenu Cinemas (JAILER 2 poster), co-op bank ATM + pharmacy on Kutchery Road, Santhome fish market (fish fry) + beach fair (merry-go-round, giant wheel, stalls, string lights). Auto upkeep (vehicles/upkeep.ts, checked): petrol burns with distance (6 L tank), crashes dent it, empty / wrecked = crawl; refuel / repair at the bunk / mechanic (E, also from the driver's seat). Bank savings (fines come out of them; knocked out on the street = pickpocket takes 25% of pocket cash), pharmacy heals, auto stand gives a passenger on demand, cinema shows end at 12/15/18/21 with ride orders. First-floor balconies no longer cover shop signs.
Next: more mission types (deliveries, VIP fares), traffic lights at the Mada Street junctions, flooding in heavy rain, sound.

## Tech stack
- Vite 8 + TypeScript 7 (strict, `erasableSyntaxOnly`), npm
- three.js (WebGLRenderer), addons imported from `three/addons/...`
- Rapier physics: `@dimforge/rapier3d-compat` (wasm inlined as base64; call `await RAPIER.init()` first)
- No UI framework: HUD is plain DOM over the canvas (elements in `index.html`)

## Folder structure
```
src/
  main.ts              loading, wiring + per-frame order: interactions → input → ride → fixed 60 Hz physics
                       steps (player.step, auto.update, world.step) → syncs → camera → sky/night → NPCs → render
  core/
    renderer.ts        WebGLRenderer, scene, camera, resize, render scale (pixel ratio cap 1.5)
    loop.ts            rAF loop, clamped dt
    input.ts           keyboard (KeyboardEvent.code) + mouse deltas, pointer lock
    save.ts            save game: loadSave / writeSave / clearSave (localStorage for now; swap for Cloudflare D1 here)
    quality.ts         adaptive quality manager + presets (pure logic, no three imports)
    assets.ts          GLTFLoader (+ Meshopt decoder) on a shared LoadingManager
  characters/
    catalog.ts         which model files exist, rig groups, load + fit to 1.7 m (feet at y=0)
    animator.ts        AnimationMixer wrapper: named clips, crossfade, speed, once-then chains
    chennaiLook.ts     hero outfit at load: texture repainted per body part (UV mask from bone weights; waist line from the rest pose):
                       checked full-sleeve shirt, jeans, shoes, browner skin; belt built in hip-bone space; moustache / vibhuti
    retarget.ts        bake a clip from one rig onto another (Mixamo talk/yell -> Quaternius NPCs)
  player/
    controller.ts      kinematic capsule + KinematicCharacterController; hero animation state;
                       modes: input / walkTo (scripted) / away (in the auto)
    camera.ts          orbit follow camera (foot / drive framing), sphere-cast so it never clips walls
    ride.ts            get in → drive → get out sequence (sit_down, drive, stand_up clips)
    meal.ts            eating: walk to stool → sit → bites (CCD IK on RightArm/RightForeArm) → stand; snacks standing
    energy.ts          hunger / energy drain + starving (pure logic, checked)
  npcs/
    npc.ts             one pedestrian: SkeletonUtils clone, tint/texture variant, kinematic capsule;
                       always walking/jogging a loop, sidesteps the player; talk() / scold()
    crowd.ts           spawn list (names, models, block loops), nearest-talkable + bump detection,
                       freezes NPCs > 40 m from the player
    dialogue.ts        Tanglish line pools (pure data)
  missions/
    data.ts            stops, passenger names, Tanglish lines + phone messages, fare maths (pure data, checked)
    jobs.ts            TaxiJobs: phone orders; accepted -> waiting -> boarding -> seating -> riding -> alighting
    economy.ts         cash, loan, daily due, missed days (pure logic, checked)
    route.ts           shortest road route over the street-grid junctions (map guide line; checked)
  combat/
    wanted.ts          wanted stars: crimes, escalation, escape timer (pure logic, checked)
    police.ts          police jeep (route chase, siren, light bar) + officers (arrest / shoot)
    melee.ts           punch / lathi slash / kick (Mixamo clips, measured hit windows); soft lock-on + step-in,
                       lathi hits only where the stick tip touches a body; buffered clicks chain; thwack sound.
                       main.ts adds hit-stop (HIT_STOP) + camera shake; NPCs slide back (npc.ts KNOCK)
  vehicles/
    auto.ts            procedural Chennai auto model + Rapier DynamicRayCastVehicleController
                       (1 steered front wheel, 2 driven rear), SEAT / ENTRY_OFFSET / BENCH anchors;
                       buildAutoModel() shared with traffic
    models.ts          detailed car / MTC bus / police jeep / scooter / bike / Ambassador taxi / van / mini truck / lorry (merged per material)
    plates.ts          TN number plates (random registrations, private/commercial/government)
    upkeep.ts          uncle's auto: petrol + condition (pure, checked)
    traffic.ts         AI autos/cars/bus: dynamic bodies driven by velocity control on rounded block loops
                       (left-hand lanes); stop + honk for obstacles; shoved = limp 2.5 s, then rejoin lane
  world/
    layout.ts          street grid numbers + street names, roadSpans(), blocks() (kind: shops/temple/tank)
    food.ts            menus per shop board (hotel = sit, shop = standing snack); pure data, checked
    eateries.ts        eateries from the shop boards, instanced tables + stools, nearest()
    supermarket.ts     walk-in supermarkets on layout.SUPERMARKET_LOTS: shell, stocked shelves (instanced products), fridge, counter, cashier; storeAt / shelfAt / atCounter
    mandaveli.ts       Mandaveli: MTC depot (walls, shed, parked buses), canal + MRTS viaduct + station + moving train
    posters.ts         rooftop hoardings: three code-drawn poster designs, instanced, lit at night
    santhome.ts        Santhome: basilica, beach (sand trimesh collider), animated sea, lighthouse + beam, boats, carts, palms, huts
    trafficLights.ts   signals at the Mada St junctions: SignalCycle (pure, checked), posts + lamps, ahead() / inJunction()
    flood.ts           low-road flood zones: level rises in heavy rain, slowAt() / depthAt()
    temple.ts          Kapaleeshwarar temple + tank (gopurams, walls, shrine, mandapams, steps, water)
    geo.ts             GeoBuilder: merge quads/boxes/geometry with vertex colours into one mesh
    textures.ts        canvas textures: facade/shop tiles (+ night emissive), signs, asphalt, curbs
    ground.ts          ground, roads, markings, raised sidewalks + curbs (+ colliders), edge walls
    buildings.ts       rows of attached shop-houses: 4 merged draw calls, cuboid colliders, setNight()
    policeStation.ts   Mylapore Police Station (lot reserved in layout.POLICE_LOT)
    places.ts          park, Luz Church, market, auto stand, petrol bunk, mechanic, cinema, bank, pharmacy, fish market, beach fair; services + snack counters
    hospital.ts        Isabel Hospital (layout.HOSPITAL_LOT): respawn spot after fainting / being shot
    props.ts           instanced street lamps (+ light pools), trees, street-name sign posts; colliders
    sky.ts             DayNight: sky shader, sun/moon light, hemisphere ambient, fog, `night` factor
    solar.ts           IST clock + sun direction over Chennai (pure math)
    weather.ts         Open-Meteo live weather (temp, rain, cloud) + rain streaks; R = test override
  audio/
    sound.ts           procedural WebAudio: engine per vehicle kind, footsteps, ambience, bells, sea, rain, one-shots; unlock() on click
  ui/
    hud.ts             wallet, mission, context prompt, "click to play"
    debug.ts           F3 panel: FPS, frame/CPU ms, draw calls, tris, quality, IST time, position, NPCs animated
    loading.ts         loading overlay + progress bar
    mapArt.ts          draws the town map once (4 px/m, nav-app style, no text) + label list drawn upright on top
    bigMap.ts          full-screen map (Tab): zoom / pan / centre, labels, markers, legend
    minimap.ts         round heading-up minimap (turns with the camera) cropped from the town map; upright labels, markers, police blips
    phone.ts           phone UI (P): Orders, Map, Wallet, Messages, Weather apps; toasts
scripts/
  check.ts             runnable self-check for solar.ts + quality.ts (`npm run check`)
  build-models.mjs     character asset pipeline (`npm run models`)
  blender/mixamo_to_glb.py   headless Blender FBX → GLB step
public/models/         optimised GLBs (committed). CREDITS.md lists every asset + license.
assets-source/         raw FBX/glTF sources (git-ignored, see Asset pipeline)
```

## Commands
- `npm run dev` — dev server (http://localhost:5173)
- `npm run build` — typecheck + production build to `dist/`
- `npm run typecheck` / `npm run check` — tsc only / logic self-check (Node runs the .ts directly)
- `npm run models` — rebuild `public/models/` from `assets-source/` (needs Blender 4.4+; set `BLENDER=path` if not at the default Windows path or on PATH)
- In dev, `window.game` exposes `{ world, player, cam, auto, ride, jobs, phone, economy, weather, traffic, quality, dayNight, crowd }` for console debugging.

## Asset pipeline (characters)
Sources live in `assets-source/` (git-ignored; 54 MB hero FBX). `npm run models` does:
1. **Mixamo FBX → GLB** in headless Blender (`scripts/blender/mixamo_to_glb.py`): strips the `mixamorig:` / `mixamorig1:` bone prefix, removes eyelash cards, exports the character without animation and each clip as skeleton + one action. `inPlace` clips get horizontal Hips motion pinned (Mixamo walk/run travel forward otherwise). The jump clip is also capped so the hips never rise above standing (the physics capsule does the rising).
2. **Clip cleanup**: hero clips keep only bone rotations + Hips translation, so any Mixamo clip fits any Mixamo body.
3. **gltf-transform**: weld + meshoptimizer simplify (hero, to < 15k tris), merge all skinned parts into one primitive per material (gltf-transform's `join()` skips skinned meshes, so the script does it), flat-colour materials → one palette texture (NPCs = 1 draw call), metallic forced to 0, alpha hair → MASK, textures 1K WebP, Meshopt compression. Prints a size/triangle report and flags models over budget (hero 15k, NPC 8k tris).

KTX2 textures are not used yet: `toktx` (KTX-Software) isn't installed. To switch: `winget install KhronosGroup.KTX-Software`, change `textureCompress` to `toktx`, add `KTX2Loader` in `core/assets.ts`.

### Add a Mixamo animation to the hero
1. Mixamo → pick the same character → animation → Download: **FBX Binary, Without Skin, 30 fps**; tick **In Place** if offered.
2. Save as `assets-source/mixamo/<name>.fbx`, add `{ name, inPlace }` to `HERO.clips` in `scripts/build-models.mjs` and `'<name>.glb'` to `HERO.clips` in `src/characters/catalog.ts`.
3. `npm run models`, then `animator.play('<name>')`.

### Add a new character
- **Another Mixamo character**: export FBX Binary *With Skin*, convert like `hero.fbx`. Hero clips work on it unchanged (same bone names after the prefix strip).
- NPC clip names used in code: `walk`, `run`, `hit` (+ `idle`, `idle2`, `wave` available), mapped from the Quaternius names in `NPC_CLIPS`; `talk` and `yell` come from the hero's Mixamo clips, retargeted per rig at load (`SHARED_WITH_NPCS` in catalog.ts, bone map in retarget.ts). A new rig needs its own walk/run/hit and a bone map for the retarget.
- Hero clip names: `idle walk run jump talk yell sit_down stand_up drive swing punch combo kick block death kneel kneel_idle hit_react sit_idle`. sit_down / stand_up / drive keep their root motion (the Ride choreography relies on it).
- **New NPC model**: drop the glTF/GLB in `assets-source/<pack>/`, add `{ src, out, rig }` to `NPCS` in `build-models.mjs` and the same id/file/rig to `NPC_MODELS` in `src/characters/catalog.ts`, then use it in `src/npcs/crowd.ts` (`SPAWNS`). Models sharing a `rig` (identical skeleton) share clips; only the first file of each rig keeps them. A model on a **new** skeleton must bring its own `Idle`/`Walk`/`Run` clips (map names in `NPC_CLIPS`) or be retargeted (`SkeletonUtils.retargetClip`).
- Always add a row to `CREDITS.md`. Only CC0, or CC-BY with credit. No NC / no-redistribution / unclear licenses.

Current sources: Mixamo files from mixamo.com (login required). Quaternius packs: https://quaternius.com/packs/ultimatemodularcharacters.html (men) and https://quaternius.com/packs/ultimatemodularwomen.html (women): Google Drive → Individual Characters → glTF.

## Performance rules
- **Draw calls under ~300** per frame (check F3). Currently ~60 with ~180k triangles (incl. shadow pass) at the start spot.
- The town is built from code into a handful of merged/instanced meshes; keep it that way (add to a GeoBuilder or an InstancedMesh, never one Mesh per object).
- Physics runs at a fixed 60 Hz (`PHYSICS_STEP` in main.ts); per-frame input is read once, movement happens per step. Anything driven by physics must `capture()` after each step and draw with `sync(alpha)` (interpolated), or it will stutter on 120/144 Hz screens.
- Characters: hero < 15k tris, NPC < 8k tris, 1 draw call per material. Animate only within `ACTIVE_RADIUS` (40 m).
- **Instancing** (`InstancedMesh`) for anything repeated: buildings, trees, lamp posts, NPCs, vehicles of the same model.
- Merge static geometry that shares a material (`mergeGeometries`), like the roads and the auto.
- **Compressed textures** only: KTX2/Basis (`KTX2Loader`), meshes Draco/meshopt-compressed glTF. No raw PNG/JPG textures larger than 512 px.
- **Baked lighting** later (lightmaps / vertex AO for the town). Keep the one real-time directional light; the shadow box follows the player (±25 m). No extra shadow-casting lights.
- Pixel ratio capped at 1.5. Adaptive quality steps down **render resolution → shadows → effects**; any new expensive effect (post-processing, particles, reflections) must hang off the `effects` flag or a new quality step.
- Allocate nothing per frame in hot paths: reuse `Vector3`s etc. as class fields.
- Rapier compat chunk is ~4.3 MB raw / ~1.7 MB gzip. If load time matters, move to `@dimforge/rapier3d` + a wasm plugin.

## Coding conventions
- Small files, one concept each. Comment the *why*, not the *what*.
- Classes for stateful things (`PlayerController`, `DayNight`), plain functions for one-shot builders (`createGround`).
- No TS parameter properties or enums (`erasableSyntaxOnly`): declare fields explicitly.
- Tunable numbers live as `UPPER_CASE` consts at the top of the file that uses them.
- Units: metres, seconds, radians. World axes: +x east, −z north, +y up.
- Input via `input.isDown(code)` / `input.wasPressed(code)` with `KeyboardEvent.code` names.
- Each frame: update before `world.step()`, read physics results after it (see `main.ts`).
- Pure logic (no DOM/three) goes in files `scripts/check.ts` can import; add an assert there when adding non-trivial logic.
- Logs use a bracketed prefix: `[quality]`, `[world]`, …
- Player-facing text (dialogue, missions) will be Tanglish; keep it in data files, not hard-coded in systems, once missions exist.
