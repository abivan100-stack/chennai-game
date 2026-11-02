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
| Ultimate Modular Men Pack: Casual_2, Farmer, Worker (+ Idle/Walk/Run clips) | `npc-man-casual.glb`, `npc-man-farmer.glb`, `npc-man-worker.glb` | Quaternius | https://quaternius.com/packs/ultimatemodularcharacters.html | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Ultimate Modular Women Pack: Casual, Formal, Suit (+ Idle/Walk/Run clips) | `npc-woman-casual.glb`, `npc-woman-formal.glb`, `npc-woman-suit.glb` | Quaternius | https://quaternius.com/packs/ultimatemodularwomen.html | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |

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
