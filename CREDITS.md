# Credits

Every third-party asset shipped in `public/models/`. Add a row here whenever you add an asset.

## Characters

| Asset | Game file(s) | Author | Source | License |
|---|---|---|---|---|
| Hero character (Mixamo "Ch42") | `hero.glb` | Adobe Mixamo | https://www.mixamo.com | [Mixamo terms](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html): free to use in personal and commercial projects; not to be redistributed as standalone asset files |
| Breathing Idle, Walking, Running, Jumping animations | `idle.glb`, `walk.glb`, `run.glb`, `jump.glb` | Adobe Mixamo | https://www.mixamo.com | Mixamo terms (as above) |
| Talking, Yelling, Stand To Sit, Sit To Stand, Driving animations | `talk.glb`, `yell.glb`, `sit_down.glb`, `stand_up.glb`, `drive.glb` (talk + yell are also retargeted onto the NPCs at load) | Adobe Mixamo | https://www.mixamo.com | Mixamo terms (as above) |
| Punching, Stable Sword Outward Slash (lathi), Flying Kick, Body Block, Fist Fight A combo animations | `punch.glb`, `swing.glb`, `kick.glb`, `block.glb`, `combo.glb` (combo + punch are also retargeted onto the NPCs) | Adobe Mixamo | https://www.mixamo.com | Mixamo terms (as above) |
| Falling Back Death, Kneel, Kneeling Idle, Hit Reaction, Sitting animations | `death.glb`, `kneel.glb`, `kneel_idle.glb`, `hit_react.glb`, `sit_idle.glb` | Adobe Mixamo | https://www.mixamo.com | Mixamo terms (as above) |
| Pushing, Hook Punch, Sitting Talking, Jump, Jumping Down, Standing Idle, Pistol Run, Hit Reaction (2nd) animations | `push.glb`, `hook.glb`, `sit_talk.glb`, `jump.glb`, `fall.glb`, `idle_stick.glb`, `pistol_run.glb`, `hit_react2.glb` | Adobe Mixamo | https://www.mixamo.com | Mixamo terms (as above) |
| 14 Mixamo characters (NPCs: office wear, casual, tracksuits, worker, delivery rider) | `npc-mx01.glb` … `npc-mx14.glb` | Adobe Mixamo | https://www.mixamo.com | Mixamo terms (as above) |

## Vehicles

Downloaded from Sketchfab under CC BY 4.0 (attribution required). Converted at load by `src/vehicles/imported.ts` (one car picked out of each file, rescaled, recoloured, TN plates added); textures resized to 512 px WebP and Meshopt-compressed with glTF-Transform. No maker badges are used.

| Asset | Game file | Author | Source | License |
|---|---|---|---|---|
| "Auto Rickshaw" (traffic autos) | `vehicles/auto.glb` | rSquare | https://sketchfab.com/3d-models/auto-rickshaw-44776bcb34e04c1a8b9c18a70376304e | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "Small Hatchback #1" (hatchbacks) | `vehicles/hatch.glb` | Han66st | https://sketchfab.com/3d-models/small-hatchback-1-ca238cea4bd649d096ceffc8ed2fbf0a | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "Lowpoly Sedan & Wagon" (sedans) | `vehicles/sedan.glb` | Han66st | https://sketchfab.com/3d-models/lowpoly-sedan-wagon-e11a46478c674b279fe9d299b2125c30 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "Lowpoly MPV/SUV" (call taxis) | `vehicles/mpv.glb` | Han66st | https://sketchfab.com/3d-models/lowpoly-mpvsuv-cc118f44b28f4ac8b54ed76fe969a49f | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "Tamilnadu Lorry" (mini trucks) | `vehicles/lorry.glb` | Car Simulator 2-Preview (playmode280513) | https://sketchfab.com/3d-models/tamilnadu-lorry-f14b631d441d41a382a9015c603930b9 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

All models were converted and optimised by `scripts/build-models.mjs` (simplified, merged draw calls, 1K WebP textures, Meshopt compression). CC0 needs no attribution; Quaternius is credited anyway.

Note: the Mixamo-derived GLBs are fine inside the game, but keep them out of any public asset pack or a public repo that hands them out as standalone files.

## Everything else

The town (roads, buildings, temple, tank, signboards, lamps, trees) and the auto rickshaw are generated in code; their textures are drawn on canvases at load. Shop names on the signboards are made up. The layout is a stylised take on Mylapore (temple facing east, tank to the west, the four Mada Streets, R.K. Mutt Road), from public descriptions such as Wikipedia's Kapaleeshwarar Temple article; no map data or images are copied.

## Data

| Data | Source | License |
|---|---|---|
| Live Chennai weather (temperature, rain, cloud cover) | [Open-Meteo.com](https://open-meteo.com/) | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) — weather data by Open-Meteo.com |

## Code libraries

three.js (MIT), Rapier (Apache-2.0), Vite (MIT), glTF-Transform (MIT), meshoptimizer (MIT).
