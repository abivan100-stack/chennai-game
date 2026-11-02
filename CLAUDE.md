# Auto Anna — project guide

## Game vision
- Third-person open world set in **Mylapore, Chennai**. The player is a young guy who inherits his uncle's old **auto rickshaw**.
- Core loop: walk around, get into the auto, pick up passengers, drop them at destinations, earn fares, pay off the auto before the moneylender takes it.
- **Real Chennai time (IST, Asia/Kolkata)** drives the day/night cycle. Later, **real Chennai weather** (Open-Meteo API) drives rain and flooding.
- Dialogue in **Tanglish**. HUD: wallet, minimap, mission text, health.
- Target: good-looking but smooth on ordinary laptops with integrated graphics. **30+ FPS minimum, 60 where possible.**
- Hosted as a static site on **Cloudflare Pages** (`npm run build` → `dist/`).

## Status
Step 1 done: test town (flat 200 m ground, 19 box buildings, road grid), walking character, follow camera, parked placeholder auto ("F - Get in" just logs), IST day/night, adaptive quality, debug panel, HUD placeholders.
Next: driving the auto (dynamic body / Rapier vehicle controller), then passengers, missions, minimap.

## Tech stack
- Vite 8 + TypeScript 7 (strict, `erasableSyntaxOnly`), npm
- three.js (WebGLRenderer), addons imported from `three/addons/...`
- Rapier physics: `@dimforge/rapier3d-compat` (wasm inlined as base64; call `await RAPIER.init()` first)
- No UI framework: HUD is plain DOM over the canvas (elements in `index.html`)

## Folder structure
```
src/
  main.ts              wiring + per-frame order (input → player → physics → camera → sky → UI → render)
  core/
    renderer.ts        WebGLRenderer, scene, camera, resize, render scale (pixel ratio cap 1.5)
    loop.ts            rAF loop, clamped dt
    input.ts           keyboard (KeyboardEvent.code) + mouse deltas, pointer lock
    quality.ts         adaptive quality manager + presets (pure logic, no three imports)
  player/
    controller.ts      kinematic capsule + Rapier KinematicCharacterController
    camera.ts          orbit follow camera, sphere-cast so it never clips walls
  vehicles/
    auto.ts            placeholder auto rickshaw (2 merged meshes, fixed collider)
  world/
    ground.ts          ground, merged road grid, boundary walls; road layout constants
    buildings.ts       instanced box buildings + colliders (seeded layout)
    sky.ts             DayNight: sky shader, sun/moon light, hemisphere ambient, fog
    solar.ts           IST clock + sun direction over Chennai (pure math)
  ui/
    hud.ts             wallet, mission, context prompt, "click to play"
    debug.ts           F3 panel: FPS, frame ms, draw calls, tris, quality, IST time, position
scripts/check.ts       runnable self-check for solar.ts + quality.ts (`npm run check`)
```

## Commands
- `npm run dev` — dev server (http://localhost:5173)
- `npm run build` — typecheck + production build to `dist/`
- `npm run typecheck` / `npm run check` — tsc only / logic self-check (Node runs the .ts directly)
- In dev, `window.game` exposes `{ world, player, cam, auto, quality, dayNight }` for console debugging.

## Performance rules
- **Draw calls under ~300** per frame (check F3). Currently ~11-13.
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
