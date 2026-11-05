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
Step 11 done: bigger map (BOUNDS x -300..250, z -160..420): the Buckingham Canal now runs through town (layout.CANAL; bridges wherever a road crosses, parapets + invisible walls; MRTS viaduct above it, piers kept off the bridges, stations moved between cross roads) with Alwarpet (TTK Road, bungalow blocks) and Teynampet (Eldams Road, Anna Salai) to the west; Dr. Radhakrishnan Salai + Vivekananda College to the north; R.A. Puram (2nd Main Road, Greenways Road), the Adyar river (layout.RIVER, bridges on every north-south road, Madras Boat Club on its bank) and Adyar (Banyan Campus, Adyar Main Road) to the south. Block indices keep the old numbering (new west / north blocks are negative). 'houses' blocks: detached houses set back behind compound walls with a yard tree. Ground has holes for water (ground.ts cellsAround); buildings are merged per 180 m tile and street trees instanced per 330 m tile so off-screen tiles are culled. College rush (9:00, 16:00) gives ride orders. New stops, traffic and pedestrians in the new areas.
Step 11b done: buildings look like their real area (buildings.ts areaKind): Mylapore/Santhome old shop-houses, Mandaveli/Adyar 3-5 floor flats with a balcony on every floor, Anna Salai/Teynampet/Dr. Radhakrishnan Salai 4-7 floor painted-concrete commercial blocks (chajja sunshades, big name boards, showrooms; no glass towers), TTK Road low showrooms, Alwarpet/R.A. Puram bungalows. Real landmarks (world/landmarks.ts, layout.LANDMARK_LOTS, built with world/kit.ts): Music Academy + Narada Gana Sabha (TTK Road), Semmozhi Poonga + Teynampet Metro entrance (Anna Salai), Ramakrishna Math (R.K. Mutt Road), Vivekanandar Illam (Beach Road), Ambedkar Manimandapam (Greenways Road), Tholkappia Poonga (Adyar). Phone Wallet has a bank card (deposit / withdraw anywhere). auto.ts TURBO = true for now (~130 km/h top speed; set false for the normal auto).
Step 11c done: Taramani added south of Adyar (BOUNDS.z1 540, Taramani Road z = 480) with Tidel Park in glass (world/tidel.ts: glass wings + atrium core, white frame, crown sign, car park, gate; offices light up at night); Tidel shift ends (9, 18, 19) give ride orders.
Step 11d done: Tidel Park enlarged (three blocks wide, ~125 m: West / East Mada Street pass under it through 16 m gateways, layout.TIDEL_ROADS; 16-floor glass wings, 18-floor atrium, helipad); Perungudi added (BOUNDS.z1 660, Perungudi Main Road z = 600) with Grand Lake Residences in Velachery, south-west, away from Tidel (world/complex.ts: invented name, Casagrand-style gated community, Phase 1 = 4 towers + clubhouse + pool on Anna Salai, Phase 2 = 3 towers on Taramani Road; lit windows at night); 12 aesthetic cafes / boutiques (world/cafes.ts + cafeSpots.ts on layout.CAFE_LOTS: minimal / pastel / heritage / garden looks, decks, tables, string lights; cafes are eateries with cafe / bakery menus).
Step 11e done: Besant Nagar (world/besant.ts, layout.BESANT): Annai Velankanni church on the Beach Road, Elliot's Beach with the Ashtalakshmi temple, Karl Schmidt memorial, snack carts (two are eateries), 3 more cafes on the food street. Crowds by time of day (crowd.ts Spawn.hours + crowdOf groups; off-hours NPCs are hidden with their collider disabled): temple pooja crowds 6-9:30 / 17-20:30, market mornings, beach evenings (Santhome, Elliot's), joggers at dawn, food street nights, Tidel shift changes, college, cinema show times; the regular street crowd is out 5:30-23:30.
Step 11f done: 125 pedestrians (crowdOf groups with hours in every area: park walkers, mass-goers, fish market, beach fair, late-night tea, Anna Salai, TTK Road, Mandaveli, R.A. Puram, Adyar, Taramani, Velachery residents) with 12 tint variants; only the nearest 24 are drawn (MAX_DRAWN) and the nearest 10 cast shadows (MAX_SHADOWS) to stay under the draw-call budget. Only 6 NPC models exist (assets-source/quaternius); more need the full Quaternius packs downloaded by hand.
Step 11g done: beach life (world/beachLife.ts): ~70 stalls scattered at random spots / angles on Santhome and Elliot's beaches (corn roasters, coconut carts, balloon shooting, bangles, toys, snack tarps), 18 pastel dessert carts on spoked wheels (rose milk, jigarthanda, kulfi, falooda...; eateries with the dessert menu), 4 instanced dessert carts pushed along the sand 16-22 h with turning wheels (their eatery spot moves with them); events by the clock: kites 15-18:30, pony rides 16-20, beach cricket 15-18, music stage at Elliot's 18-22 (lights, audience, phone alert).
Step 11h done: north extension (BOUNDS.z0 -400, Wallajah Road z = -220, Bharathi Salai z = -310): Triplicane old streets, Chepauk (world/chepauk.ts: M.A. Chidambaram stadium with tiered stands, wavy roof, floodlights lit on match nights 19-23 h + phone alert + ride orders after the match; Presidency College; Marina Beach arch), Chepauk MRTS station, Marina stalls + evening / dawn crowds. Crowd groups no longer walk single file: crowdOf gives each person their own wandering loop on open ground and their own lane offset on pavements.
Step 11i done: people who stay put (Npc pose: idle shopkeepers behind ~80 beach stalls / dessert carts 7-23 h; ~50 moon-watchers sitting (sit_idle, shared with NPC rigs) on benches and catamaran logs facing the sea 18:30-23:30; Crowd.addPosed). Perf: hidden NPCs / traffic skip matrix updates (matrixWorldAutoUpdate) and animation; at most 20 people and 12 traffic vehicles drawn (nearest first); traffic DRAW_DIST 95 / DETAIL_DIST 40; each tree kind is one instanced mesh per tile (trunk + canopy merged, vertex colours).
Step 11j done: service stops in every area (world/serviceHubs.ts, layout.SERVICE_HUBS: 12 lots, each a petrol bunk + mechanic + ATM + medicals; one kit, 3 draw calls). Empty tank = engine dead: G beside the auto pushes it (auto.push: walking pace, W/S push / pull, A/D steer; the hero walks beside it via walkTo). Navigation like a phone maps app: pick a place on the phone (Map app: category chips -> nearest by road -> Go) or click one on the big map (right-click / X clears); route on every map, turn-by-turn banner (route.ts nextTurn, checked), arrival at 14 m. Maps reworked: place icons + names drawn at screen size over the town picture with overlap culling (mapArt.drawOverlay, TownMap.pois), big map with drag pan, zoom at the cursor, hover, legend (L), sea past the edge; phone map is live (every frame), heading-up or north-up, zoom buttons.
Step 11k done: new Mixamo clips: push (hero pushes the auto from behind, controller.pose holds a clip + facing, rate matched to ground speed), hook (punch, punch = jab then Hook Punch; police alternate jab / hook), sit_talk (shared with NPCs: half the moon-watchers chat; customers chat at the cafe tables 8-10:30 / 16:30-22:30), jump (newer Mixamo Jump, JUMP_START 0.62; old source kept as jump_old.fbx), fall (Jumping Down's landing only: crouch + get up after > 0.7 s in the air).
Step 11l done: hero idle is the original Mixamo idle, now in place (its root motion made the hero drift); with the lathi out he stands in Standing Idle (`idle_stick`, controller.idleClip set by Melee). NPCs no longer borrow the hero's talk / yell / combo: talking = their own wave then idle, scolding = hit then idle, and bystanders never fight back. Seated NPCs react seated (sit_talk, no knock-back); posed NPCs drift back to their spot.
Step 11m done: silk street on Eldams Road (world/showrooms.ts, layout.SHOWROOM_LOTS: 6 multi-storey textile / clothing showrooms, invented names: recessed glass ground floor with saree shelves + mannequins, real transparent glass (1 extra draw call), gold pillars, huge name boards, light strips) and 3 luxury hotels (world/hotels.ts, layout.HOTEL_LOTS: Hotel Kaveri Palace on Anna Salai = heritage palace with domes; The Alwarpet Residency on TTK Road and Adyar Grand = podium + glass tower, lit crown; gated forecourt, fountain, palms, flags, drive-under porte-cochere; lobby restaurants are eateries with PLACE_MENUS.fine). Both on the maps.
Step 11n done: rain stops at roofs (weather.roofAt: topmost static collider per 2 m cell, cached; kit / places flat slabs above 2.2 m get colliders via kit.isRoof; MRTS deck + station roofs too). Fewer street shops (buildings.ts NO_SHOP_CHANCE 0.4 of old-town buildings are homes, SHOP_WIDTH 4.5-9 m bays). Fashion street showrooms rebuilt like modern chain stores (invented brands vastra / aadai / NOOL / thari / uduppu / kolam): white frame, glazed lit floors with racks + mannequins, brand letters on the glass (transparent letters atlas, +1 draw call) and a rooftop sign box, coloured band, posters, balloon arch, steps.
Step 11o done: dine-in at the luxury hotels: a glass-fronted restaurant room cut into each hotel's ground floor (hotels.ts baseBlock / restaurant: marble floor, panelling, chandeliers, white-cloth tables, host stand + head waiter, diners in sit_talk 12-15:30 / 19-23:30); order at the host stand (PLACE_MENUS.fine is now kind 'hotel') and the meal walks you to your chair, sits you down and serves you. Street shops vary: textures.shopTextures is an atlas of 8 shopfront designs (SHOP_ROWS rows of pairs, picked per building), shopfronts only lightly tinted, half get coloured / striped fabric awnings, signboard heights vary.
Step 11p done: hotel diners eat properly: a plate of food in front of each, seated idle pose + hand-to-mouth bites by CCD IK on the NPC rig (characters/ik.ts reachCCD / biteCurve, shared with the hero's meal; Npc pose.eat = food point); short tablecloths so knees fit under the tables.
Step 11q done: 12 Mixamo characters as NPCs (assets-source/mixamo-npcs/mxNN.fbx -> npc-mxNN.glb via `ONLY=^npc-mx npm run models`: simplified to ~6.8k tris, 512 px textures, no clips: they use the hero's clips, renamed via catalog MIXAMO_AS; asset.clipSpeed matches the hero's walk / run). Who appears where: crowd.ts LOOKS (office at Tidel / Anna Salai / TTK / hotels, young casuals on the beaches / food street / college / cinema, tracksuits at dawn and in the park, workers at the markets, delivery riders at night; 'mixed' elsewhere). Each Mixamo NPC gets dark hair and a warm skin tint of its own. Seated / posed people stay Quaternius (their sitting drop is tuned for those rigs).
Step 11r done: the old Quaternius NPCs are gone (only the police keep that body: their aim / shoot clips need it); everyone else is one of 14 Mixamo characters (mx13 / mx14 added; two re-downloads were duplicates). npcs/look.ts varies each person by name: natural skin tone, black / dark-brown hair, build (x/z 0.93-1.07), and face bits from the measured face (glasses, moustache for men, bindi for women; one merged mesh on the Head bone); catalog FEMALE marks the women (a little shorter). Mixamo sitters put their hips on the seat (their sitting clips already lower the hips); eating IK uses the Mixamo arm bones. Clothes: 60% of people get a hue turn on clearly non-skin hues only (look.ts CLOTHES_GLSL: HSV hue 0.2-0.9, saturated; reds / oranges / yellows / greys never change, so faces are safe). Hotel restaurants serve on a white china plate in front of your chair (Eatery.china).
Step 11s done: ambient pedestrians (crowd.addAmbient: 40 everyday walkers on block loops; every 0.5 s any that are > 85 m away are rerouted (Npc.reroute) onto a pavement loop 18-60 m from the player, out of the camera's view when closer than 45 m; most out 6:00-22:30, a few night owls), so every street has people, not just the hot spots. People drawn at once: 24 (MAX_DRAWN).
Step 11t done: hotels have people all day (hotels.ts: doorman, gate guard, two guests chatting by the lobby, guests strolling round the fountain and waiters walking between the tables via crowd.addWalkers; diners also at breakfast). Mixamo NPC materials are matte (catalog.matte: roughness 1, no roughness / metalness maps): no more shine. Far-away (frozen) NPCs get one animation frame so they never show the T-pose.
Step 11u done: hotel dining halls (world/hotelHalls.ts): E at a hotel's lobby doors (hotels.ts HotelDoor) takes you into its hall, built off the north edge of the map (z -900; main.ts HALL_ZONE, the maps show you at the hotel while inside): 36 x 24 m room, tall open windows on to a garden (palms, fountain, hedge), chandeliers, coffered ceiling, red carpet, buffet + chef, music stage + veena player, 12 tables with diners eating (smart clothes), waiters standing at stations (no walking indoors), host stand to order; E at the door inside takes you back out. The old glass restaurant room in the hotel front is gone. Posed people can name their model (addPosed model). Kit.build(scene, castShadow) lets interiors skip shadows.
Step 11v done: hotel entrances are grand (brass-framed glass double doors, glass canopy with downlights and the hotel's name, lanterns, potted palms, steps, red carpet; lobby glass with brass mullions). The halls' window view: garden with flower beds, lamps, benches, pergola, stone balustrade, then a lake with sailboats, a far shore with hills and a hazy skyline (kept within ~110 m: the fog ends at 170).
Step 11w done: police are Mixamo too (the last Quaternius model is gone): catalog 'police' loads the suited body separately and chennaiLook.applyPoliceLook repaints it in Tamil Nadu khaki (shirt / trousers by body part, black shoes, belt, peaked cap). Officers chase in Pistol Run, stagger with the 2nd Hit Reaction, punch / hook with the hero's clips; aiming and shooting = idle + right arm reached at the player by IK (left hand cups it, recoil kick per shot), since there's no Mixamo pistol idle / shoot clip.
Step 11x done: beachfront shops + restaurants (world/beachfront.ts, layout.BEACHFRONT_LOTS: 6 big modern storefronts on the Beach Road facing Elliot's / Besant Nagar: grey cladding top, poster banner (code-drawn atlas), two-colour name board, glass ground floor + arched entrance; 4 restaurants with PLACE_MENUS seafood / biryani / chettinad / icecream, 2 shops). Step 11y: beachfront now has three looks so neighbours never match (banner storefront; tall 'tower' restaurant like the big family restaurants: jali screen texture + logo, window-band frame, canopy, palms; 'small' two-storey pastel shop with striped awning, flower boxes, string lights) and 10 lots (4 small shops added up the Beach Road at Santhome). Crowds spread out: crowdOf spaces a group evenly round its loop; ambient walkers: 32, max 3 per block, never placed within 6 m of anyone.
Step 11z done: hero outfit = plain mustard t-shirt (short sleeves, untucked: hem 7 cm below the waist, split exactly per triangle with a hard gradient so it's straight) + ordinary charcoal cotton trousers (leg vertices nudged out 3-8 mm so they aren't skin-tight: chennaiLook.loosenTrousers), the model's own white sneakers, bare forearms repainted plain skin (no tattoos). No belt.
Step 12 done: homes (world/homes.ts, layout.HOME_LOTS): a standard house you walk into (compound wall + gate + kolam, hall with sofa / TV / coffee table / fan, kitchen with granite L-counter / gas stove + cylinder / fridge / sink / steel dabbas, bedroom with cot / almirah / mirror table, flat roof + water tank). Home 0 (Mandaveli) is your rented house; three more are for sale (R.A. Puram ₹30,000 / ₹40,000, Alwarpet ₹60,000): E at the FOR SALE board on the gate buys it (cash, then the bank). Homes you don't own are locked (invisible wall in the doorway). E at your own bed sleeps: to 6 am at night, a 3-hour nap in the day; full health. Owned homes are saved (SaveData.homes).
Step 12b done: chapter system (missions/story.ts, checked: CHAPTERS with goals judged from a snapshot - loan, rides, cash, savings, homes bought; the story never advances into a chapter with no goals yet, and a saved chapter falls back to the last built one). Paying the kadan opens Chapter 2 "Sondha Kaal": full-screen chapter card (hud.chapterCard), Kandasamy hands over the RC book (phone messages), the auto is yours; phone Story app (goals with progress, chapter list). Saved in SaveData.story.
Step 13 done: T. Nagar to the west (BOUNDS.x0 -620, X_LINES add -520 / -440 / -360; Usman Road x = -440 and Anna Salai x = -265 have planted medians (world/medians.ts, layout.MEDIAN_X); T. Nagar names for the east-west roads west of TNAGAR_X; map art 3 px/m). world/tnagar.ts (layout.TNAGAR): Ranganathan Street bazaar lane (shop rows, signs, goods, bunting, hawkers, gateway arch, shoppers), Mambalam station + the suburban railway along the west edge (layout.RAIL_X, fenced, boom gates at road crossings, platforms, footbridge, parked EMU), Panagal Park, Pondy Bazaar promenade; silk houses on Usman Road (showrooms.ts). Traffic: new kinds suv / hatch / shareauto / tanker / delivery (models.ts); an ambient pool of 28 (traffic.ts AMBIENT_FLEET) is moved onto block loops 45-120 m round the player (out of view within 80 m), so every area has traffic; MAX_DRAWN 12, DETAIL_DIST 32. Note: one view at the start spot (Mylapore, looking south-west) is ~370 draw calls without traffic: over budget before this step too.
Step 13b done: wide main roads (layout.WIDE_X / WIDE_Z, roadHalf(axis, c), setbackOf: Usman Road, Anna Salai, TTK Road, Dr. Radhakrishnan Salai, Adyar Main Road are 15 m, two lanes each way with lane lines; everything else stays 10 m; blocks, sidewalks, zebras, lamps, sign posts, map art follow the per-road width; traffic keeps to the outer lane). Brand stores (world/brandStores.ts, layout.STORE_LOTS, invented names) replace some shop-houses on the wide roads: 3 big department stores with a cinema on top (rusticated cream facade, arched poster bays, name band, framed posters, cinema box, balustrade, lantern posts: stylebay + MAYA on Anna Salai, Kalyani Mart + RAAGAM on Usman Road, newtrend + THIRAI on Guindy Road) and 11 medium stores: white 'boutique' (serif letters, wavy band, framed display windows, plants) and 'brand' outlets (glazed front up steps, wood fascia with lit letters + downlights, offer banner). One atlas for letters + code-drawn posters; 5 draw calls for all of them.
Step 13c done: traffic gridlock fix (traffic.ts: never wait for oncoming vehicles, two waiting for each other -> lower id goes, after PATIENCE 4 s in a queue nose through for PUSH_ON s, wedged > STUCK_AFTER s -> put back on the lane). Venkatanarayana Road (T. Nagar) shops: 16 more STORE_LOTS in mixed looks: 10 'small' shopfronts (stone pilasters, plank fascia, spotlights or a fabric awning, black-framed window showing clothes / shoes / bags / pottery, open door, 3-storey building; colours per shop), 2 'sweets' shops (sandstone, jali screens from the atlas, glass counters of sweets, jar shelves, railing with finials, potted palms), 2 boutiques, 2 brand outlets.
Step 12c done (Chapter 2, part 1): rent (missions/rent.ts, checked: ₹1,000 every 7 game days on the Mandaveli house from Chapter 2 until you buy a home; reminder the day before; 3 unpaid weeks = locked out of the house until paid; Phone > Wallet rent card; landlord Rajeswari amma's messages). Story rides (missions/storyMissions.ts, checked: data + judge; jobs.ts kind 'story', addStory / redLight / onStory): one at a time on the phone from Chapter 2 (Orders, 📖), in order, failed ones come back: Kalyanam Rush (Alwarpet -> temple against the clock, marigold garland on the auto), Prasava Vali (Mandaveli depot -> Isabel Hospital: at most 1 bump, no red lights), Exam Day (R.A. Puram -> Presidency College; hall ticket forgotten: a detour stop revealed mid-ride, park VIA_WAIT s). Chapter 2 goal 'Story rides 3/3'. Saved in SaveData.story.done / SaveData.rent. Signal jump fine ₹100. stopPoint uses each road's width (wide roads had passengers waiting on the road).
Step 12d done (Chapter 2, part 2): story quests that aren't auto rides (missions/quests.ts data + missions/questRunner.ts: steps goto / talk / search / escort / chase / carry; people spawned per quest, ground found by raycast, markers follow movers): Kaanaama Pona Kuzhandhai (lost child at the beach fair: ask stall keepers, find, walk him back), Chain Thirudan (snatcher runs along the pavements: catch with E or ram him), Shooting Spot (fragile camera box to Marina, any vehicle, max 2 hard knocks, timer), Poo Maalai Rush (garlands to Mandaveli on foot only). storyMissions.ts STORY_ORDER mixes rides and quests (7). Garage (vehicles/garage.ts, checked): auto upgrades at every mechanic from Chapter 2 (CNG -40% fuel, music +10% fares, digital meter +10%, seat covers soften bumps, sticker on the back, 4 paint colours); Mylai Used Vehicles on R.K. Mutt Road (world/dealer.ts, layout.DEALER_LOT): scooter / bike / Omni-style van / Ambassador-style taxi parked + locked (traffic.addParked, Vehicle.locked), E buys (cash then bank), yours = driverless parked vehicle (no police); Phone > Garage lists them and brings one to your house (₹150). Saved in SaveData.garage.
Step 12e done: houses for sale are bigger (18 x 17 m plots: the ground floor plus an upper floor up an outside staircase with a master bedroom (where you sleep), a second room and a front balcony; car porch with its own gate; full compound wall, backyard tree; the upstairs door is locked too until you buy it). Your rented house is 'My house (Mandaveli)' on every map (top-rank 🏠, PoiCat 'home') and the phone map has a 🏠 Home chip; a new game's first messages say where it is. Sleep (player/sleep.ts, checked): game hours awake; past 18 h drowsy (no running, 85% speed, faster hunger, a warning), at 24 h you collapse (THOOKAM ILLAAMA VIZHUNDHUTEENGA!), sleep 8 h at Isabel Hospital (bill) and walk out slowly for 45 s; any bed resets it. Saved in SaveData.awake.
Step 12f done (Chapter 2, part 3): five more story missions (12 in STORY_ORDER): Foreign Tourist (Lighthouse -> Santhome Basilica stop -> temple, gentle), Follow That Car! (quest step 'tail': a silver car drives the left lane Luz Corner -> Elliot's Beach; stay 9-60 m behind in any vehicle, too close 3 s = spotted, too far 8 s = lost; the rider sits in your vehicle), Match Night (to Chepauk before the toss, 16-19:30 only), Night Shift (nurse from Isabel Hospital to Adyar, 22-4 only: StoryMission.hours, nextStory(done, hour) skips rides out of hours), Kaanaama Pona Bag (return a cash bag to Seshadri sir on TTK Road: sets up Chapter 3).
Balance: kadan ₹5,000; Chapter 2 needs ₹10,000 saved + a home + Seshadri sir's bag returned (25 rides optional); houses ₹30-60k, dealer vehicles ₹6-25k. Delivered vehicles park in the side yard north of the Mandaveli house (between it and the white building), or in a bought home's backyard.
Step 14 done (Chapter 3 "Muthal Mudhalaali", part 1): Anna Travels (missions/fleet.ts, checked): buy autos (₹8,000, Phone > Business, shown from Chapter 3), hire one of 6 drivers per auto (honest / fast / lazy: takings vs no-shows, police fines, breakdowns), driver keeps 50%, each new game day the rest goes to the bank with a report message; from 2 autos Ganesh's men sometimes slash tyres. Chapter 3 goals: 3 autos, ₹10,000 from the fleet, ₹25,000 saved. Chapter 4 has no goals yet, so Chapter 3 waits. Fleet autos aren't shown in the world yet.
Step 14b done: vehicles rebuilt (vehicles/models.ts): Splendor-style commuter bike and Activa-style scooter (extruded side-profile bodies via `profile()`, alloy `spokedWheel`s, engine / exhaust / mirrors in one vertex-coloured PARTS_MAT mesh), modern cars from one parametric `modernCar(CarShape)` (HATCH Swift-style, SEDAN, SUV Creta-style with cladding + rails, MPV): sculpted body with wheel arches, tinted glass cabin, interior (dashboard, steering wheel, seats), alloys; the taxi is now an MPV call taxi with a cab company's name (doors + roof sign); Eeco-style van. Invented maker + model badges (plates.ts MAKERS / MODELS / CAB_COMPANIES) are drawn in the plate texture: no extra draw calls. Riders: characters/rider.ts poseRider (hips on the seat, spine lean, CCD IK hands to the grips / wheel, feet to the pegs / floorboard / pedals) from traffic.ts RIDER_POSE, for the hero every frame and traffic drivers once. Rides in owned vehicles (jobs.ts Carrier, main.ts carrierFor): cars / van / taxi take passengers on the rear seat (PASSENGER_SEAT); bikes and scooters take parcel orders only (PARCEL_SPOT; jobs.canTake, the board turns to parcels); upgrades only boost the auto. Dealer sells a hatchback and an SUV too. Fleet takings x2.5.
Step 14c done: faster vehicles (traffic.ts AI_SPEED 1.15 x SPEC speeds; anything you drive PLAYER_TOP 1.35 x its HANDLING top, PLAYER_ACCEL 1.25). Fuel for every vehicle you own (upkeep.ts FUEL_SPEC per kind: tank + litres/km; Upkeep(tank, perKm)); the auto now has a 10 L tank at 0.5 L/km (~20 km); owned vehicles keep their own fuel + condition (saved in SaveData.garage.vehicles), refuel / repair at any bunk / mechanic from the driver's seat (main.ts curUpkeep), empty = crawl (Vehicle.limit 0.15). Crashes with traffic (traffic.onCrash, judged on pre-step velocities pvx / pvz): you ramming them shoves them and dents your vehicle, their driver shouts; when you cut in close in front of a moving vehicle it reacts late LATE_CHANCE (12%) of the time and hits you (your fault: they say so). Owned cars / van / taxi wear yellow commercial plates (plates.ts setPlateKind).
Step 14d done: shopping bag (player/bag.ts, checked; saved in SaveData.bag): buy a cloth bag (₹80) with B at a supermarket counter; then paid groceries go into it (6 slots, overflow eaten now), and in any hotel / shop menu B switches to parcel mode (the order goes in the bag). B on foot opens the bag, 1-6 eats an item standing. Traffic jams clear themselves (stalled 10 s / off-lane 5 s -> relocated to a free gap on the lane); vehicles you drive clear kerbs (collider from 0.22 m, height follows the ground); bunk / mechanic on foot serve your nearest vehicle.
Step 14e done (Chapter 3, part 2): Ganesh story missions (quests.ts, storyMissions.ts GANESH_ORDER, offered first from Chapter 3, then Chapter 2 leftovers): Tyre Kizhippu (catch Ganesh's man at the auto stand), Tidel Contract (server box Tidel -> Grand Lake, on time, max 2 knocks; won = fleet takings x1.2, Fleet.contract), Poi Complaint (police station -> find the witness near the auto stand -> walk him to the station -> face Ganesh; won = no more slashed tyres, Fleet.peace). Chapter 3 goal 'Stand up to Ganesh 3/3'. Fleet autos still aren't shown in the world.
Police escape = search circle (combat/wanted.ts SEARCH_RADIUS 150 / 200 / 250 m by stars): it starts where the stars went up and follows you while a unit is within SIGHT_DIST (60 m); leave it and the police give up. Drawn red on the minimap + big map. New / re-sent units go to the circle's centre (police.ts PoliceContext.search), never right beside you. Stolen (not owned) vehicles can't take orders or progress missions. Vehicle damage is gentler (CRASH_DV 4.5, 3 pts per m/s; 90% / 75% speed when battered).
Next: Chapter 2 content (roadmap C), then the map decision (deliveries, VIP fares), traffic lights at the Mada Street junctions, flooding in heavy rain, sound.

## Story roadmap (chapter by chapter)
Decision: build the story systems on the CURRENT map first; expand the map in Chapter 4, when the
business needs new districts. The map is already ~550 x 1060 m with 15+ areas; every system below
(chapters, ownership, vehicles, homes, jobs, missions) works the same on a bigger map, and keeping
the map fixed keeps the 330 draw-call budget safe while the systems are built.

### Chapter 1 - "Chithappa's Auto" (now)
Pay Kandasamy the ₹5,000 kadan (₹500 a day). Ends when the loan reaches 0:
- Kandasamy hands over the RC book in a short scene: the auto is yours forever (no more daily due,
  no seizure). Chapter card: "Chapter 2 - Sondha Kaal (On your own feet)".
- Build: core/story.ts (chapter number + flags, pure, checked) saved in SaveData; a chapter-card
  overlay in hud.ts; a Story app on the phone (current goal, progress, chapter list).

### Chapter 2 - "Sondha Kaal" (On your own feet)
Every rupee is yours now. Goals: rent, savings, a first owned home, a better auto, other vehicles.
1. Rent: the Mandaveli house costs ₹3,000 a month (phone reminder; three missed months = evicted to
   a lodge). Buying a home ends the rent.
2. Second-hand vehicle dealer (R.K. Mutt Road) + a garage at your home: buy a bike / scooter / Omni van
   / Ambassador; owned vehicles are kept (no police for driving your own).
3. Auto upgrades at the mechanic: CNG kit (cheaper fuel), music system (passengers tip more), paint
   jobs, seat covers, a "Rajini" sticker.
4. Creative auto missions (data-driven in missions/data.ts, one at a time on the phone):
   - Kalyanam rush: groom's party late for the muhurtham at a Mylapore kalyana mandapam (timer, garland on the auto).
   - Labour pain: a pregnant passenger to Isabel Hospital, no bumps, every red light counts.
   - Foreign tourist: a temple + Santhome + Marina tour with stops; tips for the stories you pick.
   - "Follow that car!": a passenger chasing a cheating husband / a thief (keep distance, don't lose them).
   - Film shoot: carry a JAILER 2 crew's camera box to Marina before the light goes.
   - Exam day: a student late for Presidency College; the hall ticket is forgotten at home (detour).
   - Lost child at the beach fair: find the parents (clues from stall keepers).
   - Match night: two fans to Chepauk before the toss, through stadium traffic.
   - Rain rescue: in heavy rain, ferry people out of flooded streets.
   - Midnight passenger: the drunk / the ghost-story regular / the nurse after a night shift.
   - Lost bag: a passenger leaves a bag full of cash. Return it (story) or keep it (wanted + bad karma).

### Chapter 3 - "Muthal Mudhalaali" (The first boss)
The trigger: the lost-bag passenger was Seshadri sir, a retired transport businessman. Impressed by
your honesty, he offers to back you: "Anna Travels". The business path:
1. A second auto + hiring drivers (NPC drivers on routes, a daily share; pick honest / fast ones).
2. Running it: fuel, repairs, a driver who doesn't turn up, a breakdown in the rain, police checks.
3. The office: rent the shed at the Mylapore auto stand; phone "Business" app (fleet, income, staff).
4. The rival: Kandasamy's nephew Ganesh runs a competing fleet and plays dirty (slashed tyres,
   stolen passengers, a fake complaint): missions to win drivers and customers back.
5. Goal: 5 autos, ₹2 lakh in the bank, a bought home.
(Other careers, if business isn't wanted: a beach dessert cart -> a juice bar -> a restaurant chain,
or a mechanic shop -> a garage chain; same structure.)

### Chapter 4 - "Anna Travels & Logistics" (map expansion here)
New districts the business needs: T. Nagar (Ranganathan Street shopping crowds, Pondy Bazaar),
Guindy (industrial estate, race course), Koyambedu (bus terminus + wholesale market), the airport.
Business: cabs for Tidel shifts, delivery vans for the hotels / beach restaurants, a staff bus contract.

### Chapter 5 - "Chennai Raja" (finale)
The city transport tender against Ganesh; the final showdown; a bungalow in Alwarpet or a beach
house; the auto stays in the garage, polished, the first thing you ever owned.

### Build order
A. Homes (done, step 12).  B. Chapter system + Chapter 1 ending (done, step 12b).  C. Chapter 2: rent, dealer + garage, upgrades, 7 story missions (done); next: more missions, Chapter 3.  D. Chapter 3: fleet business.
E. Map expansion + Chapter 4.  F. Chapter 5.

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
    retarget.ts        bake a clip from one rig onto another (Mixamo seated / driving poses -> Quaternius NPCs)
    ik.ts              two-bone CCD reach + bite curve (hero meals, NPCs eating)
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
    kit.ts             lot frame + box/shape/board/tree helpers + sign atlas (3 draw calls per user)
    complex.ts         Grand Lake Residences, gated apartment towers (Velachery)
    beachLife.ts       beach stalls (random), dessert carts (some moving), kites, ponies, music stage
    chepauk.ts         Chepauk stadium (match nights), Presidency College, Marina arch
    besant.ts          Besant Nagar: Velankanni church, Elliot's Beach, Ashtalakshmi temple, beach carts
    cafes.ts           aesthetic cafes + boutiques (data in cafeSpots.ts)
    tidel.ts           Tidel Park, Taramani (glass IT park, curtain-wall texture)
    serviceHubs.ts     petrol bunk + mechanic + ATM + medicals on every layout.SERVICE_HUBS lot
    showrooms.ts       fashion street: modern glass-fronted clothing stores (layout.SHOWROOM_LOTS)
    hotels.ts          luxury hotels, palace or tower style (layout.HOTEL_LOTS); lobby doors into the dining halls
    hotelHalls.ts      the hotels' big dining halls (off the map, entered through the lobby doors)
    beachfront.ts      big shops + restaurants facing the beach (layout.BEACHFRONT_LOTS)
    homes.ts           houses you can walk into, sleep in and buy (layout.HOME_LOTS)
    landmarks.ts       real landmarks per area (Music Academy, Ramakrishna Math, Ice House, ...)
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
- Hero clip names: `idle walk run jump talk yell sit_down stand_up drive swing punch combo kick block death kneel kneel_idle hit_react sit_idle push hook sit_talk fall idle_stick`. sit_down / stand_up / drive keep their root motion (the Ride choreography relies on it).
- **New NPC model**: drop the glTF/GLB in `assets-source/<pack>/`, add `{ src, out, rig }` to `NPCS` in `build-models.mjs` and the same id/file/rig to `NPC_MODELS` in `src/characters/catalog.ts`, then use it in `src/npcs/crowd.ts` (`SPAWNS`). Models sharing a `rig` (identical skeleton) share clips; only the first file of each rig keeps them. A model on a **new** skeleton must bring its own `Idle`/`Walk`/`Run` clips (map names in `NPC_CLIPS`) or be retargeted (`SkeletonUtils.retargetClip`).
- Always add a row to `CREDITS.md`. Only CC0, or CC-BY with credit. No NC / no-redistribution / unclear licenses.

Current sources: Mixamo files from mixamo.com (login required). Quaternius packs: https://quaternius.com/packs/ultimatemodularcharacters.html (men) and https://quaternius.com/packs/ultimatemodularwomen.html (women): Google Drive → Individual Characters → glTF.

## Performance rules
- **Draw calls under ~330** per frame (check F3; target machine: ThinkPad, integrated graphics). Busiest spots (start, Tidel Park) run ~260-290 with ~700k triangles (incl. shadow pass).
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
