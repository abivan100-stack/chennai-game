# Credits

Every third-party asset shipped in `public/models/`. Add a row here whenever you add an asset.

## Characters

| Asset | Game file(s) | Author | Source | License |
|---|---|---|---|---|
| "Indian Teenager" (the hero's body, fitted onto the Mixamo skeleton; facial blend shapes, eyelashes, teeth, corneas dropped; simplified) | `hero.glb` | Nodeaxis Interactive (ar.jethin) | https://sketchfab.com/3d-models/indian-teenager-b2804b40f671431ca7b5cc53b239175e | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Hero skeleton (Mixamo "Ch42" rig; the source of every hero animation's bind pose) | (in `hero.glb`) | Adobe Mixamo | https://www.mixamo.com | Mixamo terms (as below) |
| Breathing Idle, Walking, Running, Jumping animations | `idle.glb`, `walk.glb`, `run.glb`, `jump.glb` | Adobe Mixamo | https://www.mixamo.com | Mixamo terms (as above) |
| Talking, Yelling, Stand To Sit, Sit To Stand, Driving animations | `talk.glb`, `yell.glb`, `sit_down.glb`, `stand_up.glb`, `drive.glb` (talk + yell are also retargeted onto the NPCs at load) | Adobe Mixamo | https://www.mixamo.com | Mixamo terms (as above) |
| Punching, Stable Sword Outward Slash (lathi), Flying Kick, Body Block, Fist Fight A combo animations | `punch.glb`, `swing.glb`, `kick.glb`, `block.glb`, `combo.glb` (combo + punch are also retargeted onto the NPCs) | Adobe Mixamo | https://www.mixamo.com | Mixamo terms (as above) |
| Falling Back Death, Kneel, Kneeling Idle, Hit Reaction, Sitting animations | `death.glb`, `kneel.glb`, `kneel_idle.glb`, `hit_react.glb`, `sit_idle.glb` | Adobe Mixamo | https://www.mixamo.com | Mixamo terms (as above) |
| Pushing, Hook Punch, Sitting Talking, Jump, Jumping Down, Standing Idle, Pistol Run, Hit Reaction (2nd) animations | `push.glb`, `hook.glb`, `sit_talk.glb`, `jump.glb`, `fall.glb`, `idle_stick.glb`, `pistol_run.glb`, `hit_react2.glb` | Adobe Mixamo | https://www.mixamo.com | Mixamo terms (as above) |
| 3 Mixamo characters (police body, two tracksuit joggers) | `npc-mx08.glb`, `npc-mx09.glb`, `npc-mx10.glb` | Adobe Mixamo | https://www.mixamo.com | Mixamo terms (as above) |
| "Indian Man In Tshirt" (NPC; fitted onto the Mixamo skeleton, simplified, textures packed into one atlas; glasses / eyelashes / teeth dropped) | `npc-sf-indian-man-in-tshirt.glb` | Nodeaxis Interactive (ar.jethin) | https://sketchfab.com/3d-models/091381a4eeb14e3b9814e3aaf075ac59 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "Indian Man In Casuals" (NPC; fitted onto the Mixamo skeleton, simplified, textures packed into one atlas; glasses / eyelashes / teeth dropped) | `npc-sf-indian-man-in-casuals.glb` | Nodeaxis Interactive (ar.jethin) | https://sketchfab.com/3d-models/fe7de2e1fbb642c9aebb7c3f698bec5e | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "indian man in pattern shirt" (NPC; fitted onto the Mixamo skeleton, simplified, textures packed into one atlas; glasses / eyelashes / teeth dropped) | `npc-sf-indian-man-in-pattern-shirt.glb` | Nodeaxis Interactive (ar.jethin) | https://sketchfab.com/3d-models/13b46cdd311043d7a460245276c9771b | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "Indian Overweight Man Striped Shirt" (NPC; fitted onto the Mixamo skeleton, simplified, textures packed into one atlas; glasses / eyelashes / teeth dropped) | `npc-sf-indian-overweight-man-striped-shirt.glb` | Nodeaxis Interactive (ar.jethin) | https://sketchfab.com/3d-models/0a6adb6858464e3eb4ffcd2a99d7ba91 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "Indian Man in suit" (NPC; fitted onto the Mixamo skeleton, simplified, textures packed into one atlas; glasses / eyelashes / teeth dropped) | `npc-sf-indian-man-in-suit.glb` | Nodeaxis Interactive (ar.jethin) | https://sketchfab.com/3d-models/985dd9756d89464b9380414b5b12d8aa | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "Modern Indian Woman" (NPC; fitted onto the Mixamo skeleton, simplified, textures packed into one atlas; glasses / eyelashes / teeth dropped) | `npc-sf-modern-indian-woman.glb` | Nodeaxis Interactive (ar.jethin) | https://sketchfab.com/3d-models/830d8ed3236a4221862290b81807f408 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "modern indian woman 2" (NPC; fitted onto the Mixamo skeleton, simplified, textures packed into one atlas; glasses / eyelashes / teeth dropped) | `npc-sf-modern-indian-woman-2.glb` | Nodeaxis Interactive (ar.jethin) | https://sketchfab.com/3d-models/1ab2e8ecceee4e6e897f8fddb17d2b02 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "Indian Office Woman" (NPC; fitted onto the Mixamo skeleton, simplified, textures packed into one atlas; glasses / eyelashes / teeth dropped) | `npc-sf-indian-office-woman.glb` | Nodeaxis Interactive (ar.jethin) | https://sketchfab.com/3d-models/e6c60cafd33c4d54b0b840c4146ed244 | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| "Indian Teenager, Woman in Hoodie" (NPC; fitted onto the Mixamo skeleton, simplified, textures packed into one atlas; glasses / eyelashes / teeth dropped) | `npc-sf-indian-teenager-woman-in-hoodie.glb` | Nodeaxis Interactive (ar.jethin) | https://sketchfab.com/3d-models/3cffef3bcde9469aa3d1ad36755b363c | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

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
