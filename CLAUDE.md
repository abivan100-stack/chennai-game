# Auto Anna — project guide

## Game vision
- Third-person open world set in **Mylapore, Chennai**. The player is a young guy who inherits his uncle's old **auto rickshaw**.
- Core loop: walk around, get into the auto, pick up passengers, drop them at destinations, earn fares, pay off the auto before the moneylender takes it.
- **Real Chennai time (IST, Asia/Kolkata)** drives the day/night cycle. Later, **real Chennai weather** (Open-Meteo API) drives rain and flooding.
- Dialogue in **Tanglish**. HUD: wallet, minimap, mission text, health.
- Target: good-looking but smooth on ordinary laptops with integrated graphics. **30+ FPS minimum, 60 where possible.**
- Hosted as a static site on **Cloudflare Pages** (`npm run build` → `dist/`).

## Status
Step 1 done: test town (flat 200 m ground, 19 box buildings, road grid), follow camera, parked placeholder auto ("F - Get in" just logs), IST day/night, adaptive quality, debug panel, HUD placeholders.
Step 2 done: animated Mixamo hero (idle/walk/run/jump, 0.2 s crossfades) on the invisible capsule; 10 Quaternius NPCs (5 idle, 5 walking block loops), frozen beyond 40 m; loading screen.
Step 2b done: NPC behaviours and interactions: E to talk (NPC faces you, waves, Tanglish line), running into NPCs makes them flinch and complain, NPCs block the player (kinematic capsules, ignored by the camera), walkers pause and wait, a jogger, standers fidget/watch/wave.
Next: driving the auto (dynamic body / Rapier vehicle controller), then passengers, missions, minimap.

## Tech stack
- Vite 8 + TypeScript 7 (strict, `erasableSyntaxOnly`), npm
- three.js (WebGLRenderer), addons imported from `three/addons/...`
- Rapier physics: `@dimforge/rapier3d-compat` (wasm inlined as base64; call `await RAPIER.init()` first)
- No UI framework: HUD is plain DOM over the canvas (elements in `index.html`)

## Folder structure
```
src/
  main.ts              loading, wiring + per-frame order (input → player → physics → camera → sky → NPCs → UI → render)
  core/
    renderer.ts        WebGLRenderer, scene, camera, resize, render scale (pixel ratio cap 1.5)
    loop.ts            rAF loop, clamped dt
    input.ts           keyboard (KeyboardEvent.code) + mouse deltas, pointer lock
    quality.ts         adaptive quality manager + presets (pure logic, no three imports)
    assets.ts          GLTFLoader (+ Meshopt decoder) on a shared LoadingManager
  characters/
    catalog.ts         which model files exist, rig groups, load + fit to 1.7 m (feet at y=0)
    animator.ts        AnimationMixer wrapper: named clips, crossfade, speed
  player/
    controller.ts      kinematic capsule + KinematicCharacterController; drives hero animation state
    camera.ts          orbit follow camera, sphere-cast so it never clips walls
  npcs/
    npc.ts             one pedestrian: SkeletonUtils clone, tint/texture variant, kinematic capsule;
                       behaviour (walk/jog loops, corner pauses, wait for player, fidget, watch, wave)
                       + talk() / bump() reactions
    crowd.ts           spawn list (names, models, paths), nearest-talkable + bump detection,
                       freezes NPCs > 40 m from the player
    dialogue.ts        Tanglish line pools (pure data)
  vehicles/
    auto.ts            placeholder auto rickshaw (2 merged meshes, fixed collider)
  world/
    ground.ts          ground, merged road grid, boundary walls; road layout constants
    buildings.ts       instanced box buildings + colliders (seeded layout)
    sky.ts             DayNight: sky shader, sun/moon light, hemisphere ambient, fog
    solar.ts           IST clock + sun direction over Chennai (pure math)
  ui/
    hud.ts             wallet, mission, context prompt, "click to play"
    debug.ts           F3 panel: FPS, frame/CPU ms, draw calls, tris, quality, IST time, position, NPCs animated
    loading.ts         loading overlay + progress bar
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
- In dev, `window.game` exposes `{ world, player, cam, auto, quality, dayNight, crowd }` for console debugging.

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
- NPC clip names used in code: `idle`, `idle2`, `walk`, `run`, `wave`, `hit` (mapped from the Quaternius names in `NPC_CLIPS`). A new rig must provide all of them.
- **New NPC model**: drop the glTF/GLB in `assets-source/<pack>/`, add `{ src, out, rig }` to `NPCS` in `build-models.mjs` and the same id/file/rig to `NPC_MODELS` in `src/characters/catalog.ts`, then use it in `src/npcs/crowd.ts` (`SPAWNS`). Models sharing a `rig` (identical skeleton) share clips; only the first file of each rig keeps them. A model on a **new** skeleton must bring its own `Idle`/`Walk`/`Run` clips (map names in `NPC_CLIPS`) or be retargeted (`SkeletonUtils.retargetClip`).
- Always add a row to `CREDITS.md`. Only CC0, or CC-BY with credit. No NC / no-redistribution / unclear licenses.

Current sources: Mixamo files from mixamo.com (login required). Quaternius packs: https://quaternius.com/packs/ultimatemodularcharacters.html (men) and https://quaternius.com/packs/ultimatemodularwomen.html (women): Google Drive → Individual Characters → glTF.

## Performance rules
- **Draw calls under ~300** per frame (check F3). Currently ~27 (13 world + hero 2 + NPCs 1 each, plus shadow passes).
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
