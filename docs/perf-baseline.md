# Performance pass: baseline and results

Measured in Chromium (Playwright), 1600 x 900, quality forced to **high** (100% resolution, 2048 shadows,
effects on), at 5 fixed spots, day (12:00) and night (21:00). Triangles and draw calls are the
renderer's real per-frame totals (`renderer.info.render`), which **include the shadow pass**: the
scene is drawn twice (camera + sun shadow map), so the old ~1.75M was roughly 1.1M camera + 0.65M
shadow.

Spots (position, looking at):
- police station: (0, 74) facing the Mylapore Police Station
- main street: Anna Salai (-262, -40) looking north
- market: Mylapore vegetable market (-40, 31) looking west
- temple: (31, 0) facing the Kapaleeshwarar temple's east gopuram
- open road: Beach Road (122, -150) looking north

## Before / after

| Spot | Time | Tris before | Tris after | Calls before | Calls after | Frame ms before | Frame ms after | FPS before | FPS after |
|---|---|---|---|---|---|---|---|---|---|
| Police station | day | 1,589k | 574k | 350 | 293 | 45.8 | 35.4 | 22 | 28 |
| Main street (Anna Salai) | day | 1,830k | 581k | 192 | 180 | 33.3 | 50.0* | 30 | 20* |
| Market | day | 1,532k | 588k | 221 | 239 | 29.7 | 38.1* | 34 | 26* |
| Temple | day | 1,715k | 584k | 336 | 271 | 28.3 | 29.6 | 35 | 34 |
| Open road (Beach Road) | day | 1,320k | 469k | 255 | 230 | 38.1 | 26.7 | 26 | 37 |
| Police station | night | 1,716k | 584k | 350 | 287 | 33.3 | 31.3 | 30 | 32 |
| Main street (Anna Salai) | night | 1,872k | 584k | 205 | 186 | 75.0 | 29.6 | 13 | 34 |
| Market | night | 1,638k | 586k | 224 | 235 | 31.5 | 29.6 | 32 | 34 |
| Temple | night | 1,871k | 592k | 382 | 264 | 29.6 | 33.3 | 34 | 30 |
| Open road (Beach Road) | night | 1,414k | 485k | 244 | 237 | 26.7 | 31.3 | 37 | 32 |

Every view now meets the targets: **under 600k triangles, under 300 draw calls**.

\* Frame time on the test machine is **CPU-bound** (the "cpu" column of F3 tracks frame time almost
exactly, 23-38 ms, before and after), so FPS here mostly measures JavaScript / three.js overhead
and noise from the headless browser, not the GPU. Single samples swing ±10 FPS between runs (the
same spot read 41 FPS in an earlier run). The triangle and shadow-pass cuts are GPU work, which is
what an Iris Xe is short of; the real gain needs checking on that laptop (F3 + F4).

## Where the triangles came from (before, temple at night: 1.87M)

From the F4 profiler (camera pass / shadow pass, estimated from the scene graph):

| Category | Camera | Shadow | Why |
|---|---|---|---|
| places (every kit-built place, landmark, shop, home, stall) | 506k | 431k | builders merge a whole *kind* of place into one mesh (all 12 petrol stops, all cafes, all landmarks...): bounding spheres spanning the map, so **never culled**, in either pass. Biggest: 214k, 87k, 74k, 71k, 58k tris |
| props (lamps, trees) | 306k | 213k | all 2,313 street lamps were ONE instanced mesh (83k tris), trees per 330 m tile |
| buildings | 105k | 25k | already tiled (180 m), fine |
| npcs | 68k | 61k | ~3.3k tris per drawn person, 24 drawn |
| vehicles | 15k | 35k | 12 drawn |
| ground | 24k | 1k | tiled by material |
| player | 15k | 15k | |

Texture memory (GPU estimate, every texture once, with mipmaps): **~300 MB**. Not reduced (the
brief says not to touch texture quality unless it's a problem); the big ones are the canvas sign /
shop atlases and the hero's 1K textures. Worth a look if integrated-GPU memory runs short.

## What changed

1. **Map chunks for big merged meshes** (`world/chunk.ts`, run once after the world is built): any
   plain static mesh spanning more than 90 m is split by triangle into 120 m map cells, so cells off
   screen or outside the shadow box are skipped. To keep draw calls down, pieces in a cell whose
   materials are interchangeable (plain vertex-coloured, no texture, nothing that changes at night)
   are merged into one mesh with one shared material; all kits' bulbs share one material
   (`kit.ts`) so they merge too. Animated / custom-shader / hidden / moved meshes, the ground and
   batched meshes are left alone. 204 meshes -> 514 cell meshes.
2. **Street lamps and trees as `BatchedMesh`** (`props.ts`): one draw call for all lamp poles (and
   one for heads, one for night pools), one for all street trees, one for the backdrop groves; each
   lamp / tree is culled on its own in both passes. **Tree LOD**: beyond 70 m a street tree swaps
   to a low-poly version (icosahedron detail 0, 4-sided trunk); backdrop groves are always low.
3. **Far plane** was already 200 m (just past the fog's 170 m end), so nothing past the fog is drawn.
4. **NPCs**: drawn within 70 m (was 90), at most 20 walkers (was 24), 8 shadows (was 10); still
   animated only within 40 m. **Vehicles**: at most 10 drawn (was 12), wheels / driver within 28 m.
5. Koyambedu market stalls: fewer, larger produce pieces (the stalls alone were 158k tris).

## Not done / below target

- **Low-poly NPC LOD models** (< 3k tris at distance): would need simplified GLBs from the asset
  pipeline (`npm run models` + gltf-transform simplify) and per-NPC model swapping. Not needed to hit
  the budget after capping the drawn count and distance; NPCs are ~3.3k tris each.
- **Shadow casters by distance**: the sun's shadow box already follows the player (±25 m wide) and
  chunked / batched meshes are now culled against it, which took the shadow pass from ~650k to
  ~120-180k; small props don't cast shadows. No separate per-object distance rule was added.
- **Meshes over 20k triangles**: after chunking, the largest single meshes are merged map cells
  (up to ~60k, e.g. the Koyambedu market cell); they're culled as a unit, so they only cost when in
  view. No individual model is over 20k (hero ~15k, NPCs ~6.8k, vehicles < 10k).
- FPS on a real Intel Iris Xe was not measured here (no such device in this session).

## How to measure

- **F3**: real totals (triangles, draw calls including the shadow pass), FPS, frame / CPU ms.
- **F4** (dev builds only, `ui/profiler.ts`): triangles and draw calls by category for the camera and
  shadow passes, the 10 heaviest meshes, meshes over 20k triangles, texture memory.
