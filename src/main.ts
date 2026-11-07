import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { loadCharacters } from './characters/catalog';
import { loadingManager } from './core/assets';
import { enablePointerLock, input } from './core/input';
import { startLoop } from './core/loop';
import { QualityManager, SHADOW_MAP_SIZES } from './core/quality';
import { createRenderer, setRenderScale } from './core/renderer';
import { Crowd } from './npcs/crowd';
import { Npc } from './npcs/npc';
import { FollowCamera } from './player/camera';
import { CAPSULE_LIFT, PlayerController } from './player/controller';
import { Ride } from './player/ride';
import { DebugPanel } from './ui/debug';
import { hud } from './ui/hud';
import { loadingScreen } from './ui/loading';
import { AutoRickshaw } from './vehicles/auto';
import { createBuildings } from './world/buildings';
import { createGround } from './world/ground';
import { SIDEWALK_HEIGHT, blocks } from './world/layout';
import { createProps } from './world/props';
import { DayNight } from './world/sky';
import { createTemple } from './world/temple';
import { TaxiJobs } from './missions/jobs';
import { Minimap } from './ui/minimap';
import { BigMap, fmtDist } from './ui/bigMap';
import { drawTownMap, type Dest } from './ui/mapArt';
import { Phone, type NavInfo, type Place } from './ui/phone';
import { Economy } from './missions/economy';
import { LENDER, MSG_FINE_ON_LOAN, MSG_LENDER_HELLO, MSG_MISSED, MSG_PAID, MSG_PAID_OFF, MSG_WELCOME, MSG_WELCOME_BACK, UNCLE } from './missions/data';
import { clearSave, loadSave, writeSave } from './core/save';
import { RENT, Rent } from './missions/rent';
import { GANESH_ORDER, LOGISTICS_ORDER, STORY_ORDER, nextStory, storyTitle } from './missions/storyMissions';
import { QuestRunner } from './missions/questRunner';
import { BAG_PRICE, BAG_SLOTS, Bag } from './player/bag';
import { BAG_LINES } from './world/food';
import { DRIVERS, Fleet, TRAITS, UNITS, WAREHOUSE_PRICE, type UnitKind } from './missions/fleet';
import { DEALER_STOCK, DELIVER_HOME, PAINTS, PAINT_PRICE, UPGRADES, bumpDecel, fareFactor, fuelFactor } from './vehicles/garage';
import { createDealer } from './world/dealer';
import { frame } from './world/kit';
import { HOME_LOTS } from './world/layout';
import { Sound } from './audio/sound';
import { applyChennaiLook } from './characters/chennaiLook';
import { createSanthome } from './world/santhome';
import { createMandaveli } from './world/mandaveli';
import { createPosters } from './world/posters';
import { createHospital } from './world/hospital';
import { createPlaces, type Service } from './world/places';
import { createServiceHubs } from './world/serviceHubs';
import { createShowrooms } from './world/showrooms';
import { createBrandStores } from './world/brandStores';
import { createHotels } from './world/hotels';
import { createHotelHalls } from './world/hotelHalls';
import { createBeachfront } from './world/beachfront';
import { createHomes } from './world/homes';
import { createMedians } from './world/medians';
import { createTNagar } from './world/tnagar';
import { Story } from './missions/story';
import { createLandmarks } from './world/landmarks';
import { createTidelPark } from './world/tidel';
import { createComplex } from './world/complex';
import { createGuindy } from './world/guindy';
import { createKoyambedu } from './world/koyambedu';
import { createCafes } from './world/cafes';
import { createBesantNagar } from './world/besant';
import { createBeachLife } from './world/beachLife';
import { createChepauk } from './world/chepauk';
import { CMBT, CMBT_ARRIVALS, KOYAMBEDU_MARKET, MARKET_RUSH, ESTATE, ESTATE_RUSH, RACE_COURSE, STADIUM, TIDEL, TIDEL_RUSH, CINEMA, COLLEGE, COLLEGE_RUSH, PHARMACY, PICKPOCKET_SHARE, PLACE_LINES, SHOW_ENDS, STAND } from './missions/data';
import { CRASH_DV, FUEL_SPEC, PETROL_PRICE, REPAIR_PRICE, Upkeep } from './vehicles/upkeep';
import { setPlateKind } from './vehicles/plates';
import { createTrafficLights } from './world/trafficLights';
import { createFlood } from './world/flood';
import { MISSION_SEIZED, MSG_REDEEMED, MSG_SEIZED, MSG_SIGNAL_JUMP, RAIN_SURCHARGE, SIGNAL_FINE, TRAFFIC_POLICE } from './missions/data';
import { Weather } from './world/weather';
import { Traffic } from './vehicles/traffic';
import { istTime } from './world/solar';
import { nextTurn, route, routeLength, type Pt } from './missions/route';
import { Police } from './combat/police';
import { Melee, type Target } from './combat/melee';
import { KEEP_STOLEN_SECONDS, Wanted } from './combat/wanted';
import { createPoliceStation } from './world/policeStation';
import { PARCEL_SPOT, PASSENGER_SEAT, RIDER_POSE, SPEC, VEHICLE_NAMES, type Vehicle } from './vehicles/traffic';
import type { Carrier } from './missions/jobs';
import { poseRider } from './characters/rider';
import { BEATEN, HORN_LINES } from './npcs/dialogue';
import { CRASH_LINES, MSG_HOME_HINT, RECOVER_LINE, SLEEPY_LINE, SLEEP_SUB, SLEEP_TITLE } from './missions/data';
import { HOSPITAL_SLEEP, Sleep } from './player/sleep';
import { TIME_SCALE } from './world/sky';
import { BUSTED_SUB, BUSTED_TITLE, HUNGRY_LINE, MSG_ESCALATE, MSG_THEFT_WARNING, ESCAPED_LINE, POLICE, STARVED_SUB, STARVED_TITLE, TIRED_LINE, WASTED_SUB, WASTED_TITLE } from './missions/data';
import { ATTACK_COST, Energy, type Activity } from './player/energy';
import { Meal } from './player/meal';
import { createEateries, type Eatery } from './world/eateries';
import { BASKET_FULL, BASKET_MAX, CASHIER, CASHIER_HELLO, CASHIER_THANKS, MEAL_DONE, NO_MONEY, SHOPLIFT_LINE, type FoodItem, type Shelf } from './world/food';
import { createSupermarkets, type Store } from './world/supermarket';
import { SEA_X, X_LINES, X_ROADS, Z_LINES, streetName } from './world/layout';

const ENTER_RADIUS = 3; // metres from the auto to show "F - Get in"
/** Pushing the auto by hand: where you walk (auto's own frame: behind it, hands on the back) and how far you can fall behind before you let go. */
const PUSH_SPOT = new THREE.Vector3(0, 0, -2.05);
const PUSH_CLIP_SPEED = 1.2; // m/s the Pushing clip's steps are made for
const PUSH_LOSE = 3.5;
/** Where the company bus parks: the estate road inside the Guindy warehouse block (layout.GUINDY.estate()[1]). */
const WAREHOUSE_YARD = { x: -481.25, z: 637.5 };
/** Navigation ends this close to the destination (metres). */
const ARRIVE_M = 14;
/** Lines for buying a home and sleeping (Tanglish). */
/** Messages when a chapter opens. */
const STORY_LINES: Record<number, [string, string][]> = {
  2: [
    ['Kandasamy', 'Kadan full-aa mudinjuthu. Itho, RC book - auto ippo sattappadi ungaludhu. Inimel naan varamaaten!'],
    ['Chithappa (memory)', '"Auto-va paathukko da. Adhu namma kudumbam maadhiri." - you can almost hear him.'],
    ['Auto Anna', 'Chapter 2: every rupee is yours now. Goals in Phone > Story.'],
  ],
  3: [
    ['Seshadri sir', 'Thambi, naan sonnadhu nyaabagam irukka? Un per-la oru business aarambikkalaam: "Anna Travels". Naan backing, nee mudhalaali.'],
    ['Seshadri sir', 'Mylapore auto stand-la oru shed vaadagaikku eduthutten. Phone > Business-la auto vaangu (₹8,000 ovvonnum), nalla driver-a podu. Honest-aana aal dhaan mukkiyam!'],
    ['Kandasamy', 'Enna, mudhalaali aagitiya? En marumagan Ganesh-um auto fleet vechirukkaan. Paathu nadandhukko...'],
    ['Auto Anna', 'Chapter 3: Anna Travels. Goals in Phone > Story.'],
  ],
  4: [
    ['Seshadri sir', 'Shabash thambi! Autos-la nalla per vaangitta. Ippo adutha step: Tidel IT makkal-ku cabs, hotels-ku delivery vans.'],
    ['Seshadri sir', 'Guindy Industrial Estate-la oru warehouse "TO LET"-nu irukku, Velachery Main Road-la. Phone > Business-la lease pannu (₹15,000). Adhu dhaan namma logistics base.'],
    ['Ganesh', 'Cabs-aa? Tidel-aa? Paakalaam yaar jeikkiraanga-nu...'],
    ['Auto Anna', 'Chapter 4: Anna Travels & Logistics. Goals in Phone > Story.'],
  ],
};
const SESHADRI = 'Seshadri sir';
const FLEET_LINES = {
  bought: 'Pudhu {name} Anna Travels-la serndhuduchu! Driver-a podu, illana summa nikkum.',
  cantAfford: '{name} ₹{price} thambi. Konjam saerthu vechittu vaangu.',
  warehouse: 'Guindy warehouse un per-la lease aayiduchu! "Anna Travels & Logistics" board-um ready. Ippo delivery van vaangalaam.',
  hired: '{name} Anna Travels-la join pannittaanga. ({trait})',
  fired: '{name}-a anuppiyaachu.',
  report: '📒 Anna Travels: {income} today.',
};
/** House owner's messages about the rent (Chapter 2). */
/** m/s lost in one frame while driving that counts as a crash for fragile cargo. */
const JOLT_DROP = 4;
const LANDLORD = 'Rajeswari amma (veetu owner)';
const RENT_LINES = {
  start: 'Thambi, kadan mudinjudhu-nu kelvi patten, santhosham! Ini veedu vaadagai ₹{rent} vaaram vaaram kattanum. (Phone > Wallet)',
  reminder: 'Naalaiku vaadagai naal thambi. ₹{rent} ready-aa vechukko.',
  due: 'Inniku vaadagai naal. ₹{rent} kattiru thambi. (Phone > Wallet)',
  missed: 'Vaadagai baaki ₹{owed} aayiduchu! Moonu vaaram aana veetu saavi vaangiduven.',
  evicted: 'Moonu vaaram vaadagai varala. Veetu kadhava pootiten! ₹{owed} kattuna thirandhu tharen.',
  paid: 'Vaadagai vandhuchu, nandri thambi!',
  back: 'Seri, ellam settle aayiduchu. Saavi gate-la vechirukken.',
  ended: 'Sondha veedu vaangiteengala! Vaazhthukkal thambi. Ini vaadagai venaam.',
};
const DEALER = 'Basheer bhai (Mylai Used Vehicles)';
const GARAGE_LINES = {
  cantAfford: 'Sir, ₹{price} aagum. Konjam saerthu vachittu vaanga, naan vechirukken!',
  bought: 'Saavi itho! {name} ippo ungaludhu. RC transfer naan paathukkaren. Nalla ottunga!',
  delivered: '{name} unga veettu vaasal-la nikkudhu.',
  upgraded: 'Mechanic: {name} pottaachu! Auto ippo semma.',
  painted: 'Mechanic: Pudhu paint! {name}-la auto puthusu maadhiri irukku.',
};
const STORY_RIDE_LINES = {
  passed: 'Story ride done: {title}! Phone > Story-la paarunga.',
  failed: "{title} didn't go well. It'll come up again later on the phone.",
};
const HOME_LINES = {
  cantAfford: 'Sir, ₹{price} venum. Konjam saerthu vachittu vaanga!',
  bought: 'Congratulations! {area} veedu ippo ungaludhu. Saavi gate-la irukku.',
  slept: 'Nalla thookam... kaalai aagiduchu!',
  napped: 'Konjam rest edutthaachu. Fresh-aa irukku!',
};
/** How close to a hotel's lobby doors / a hall's door to go in / out (m). */
const DOOR_RADIUS = 1.8;
/** North of this z you're in one of the dining halls (built off the map, hotelHalls.ts). */
const HALL_ZONE = -800;
/** Rain roof probe starts this high (above the tallest building). */
const ROOF_PROBE_TOP = 120;
const PHYSICS_STEP = 1 / 60; // fixed step: vehicle physics needs it
const AUTOSAVE_MS = 10_000;
const HEADLIGHT = { intensity: 40, distance: 38, angle: 0.48, penumbra: 0.55 }; // the vehicle you drive
const HORN_HEARD = 12; // m: pedestrians this close may shout back
const ENV_DAY = 0.35; // environment (reflection) light by day...
const ENV_NIGHT = 0.06; // ...and at night
const EXPOSURE_DAY = 0.6;
const EXPOSURE_NIGHT = 0.85;
const HIT_REACT_COOLDOWN = 1.5; // s between hit flinches
const MAX_STEPS = 4; // per frame; beyond this the game slows down instead of spiralling
const HIT_STOP = { punch: 0.05, swing: 0.08, kick: 0.09 }; // seconds the world freezes when a blow lands
const HIT_STOP_SCALE = 0.05; // how slow the world runs during it

async function main() {
  loadingManager.onProgress = (_url, loaded, total) => loadingScreen.progress(loaded / total);
  const [, characters] = await Promise.all([RAPIER.init(), loadCharacters()]);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = PHYSICS_STEP;
  const { renderer, scene, camera } = createRenderer();
  // Soft image-based light: gives skin, cloth and paint real reflections instead of flat shading.
  // Generated once from three's built-in room scene (no download); its strength follows the sun.
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;

  // World
  const ground = createGround(scene, world);
  const town = createBuildings(scene, world);
  const props = createProps(scene, world);
  const townMap = drawTownMap({ footprints: town.footprints, trees: props.treePoints });
  const weather = new Weather(scene);
  // Rain stops at the first static surface from the sky (roofs, flyovers, the Tidel gateways).
  const roofRay = new RAPIER.Ray({ x: 0, y: ROOF_PROBE_TOP, z: 0 }, { x: 0, y: -1, z: 0 });
  weather.roofAt = (x, z) => {
    roofRay.origin = { x, y: ROOF_PROBE_TOP, z };
    const hit = world.castRay(roofRay, ROOF_PROBE_TOP, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
    return hit ? ROOF_PROBE_TOP - hit.timeOfImpact : 0;
  };
  const traffic = new Traffic(scene, world, characters.npcs);
  traffic.onSay = (name, line) => hud.say(name, line);
  const station = createPoliceStation(scene, world);
  const police = new Police(scene, world, characters.npcs.get('police')!, station.jeepSpot, -Math.PI / 2);
  police.onSay = (line) => hud.say('Police', line);
  const wanted = new Wanted();
  const economy = new Economy();
  const temple = createTemple(scene, world);
  const dayNight = new DayNight(scene);
  const crowd = new Crowd(scene, world, characters.npcs);
  const eateries = createEateries(scene, world, town.footprints);
  const markets = createSupermarkets(scene, world, characters.npcs.get('mx02')!);
  const santhome = createSanthome(scene, world);
  const mandaveli = createMandaveli(scene, world);
  const posters = createPosters(scene, town.footprints);
  const hospital = createHospital(scene, world);
  const places = createPlaces(scene, world);
  const hubs = createServiceHubs(scene, world);
  const showrooms = createShowrooms(scene, world);
  const brandStores = createBrandStores(scene, world);
  const hotels = createHotels(scene, world);
  places.services.push(...hubs.services); // petrol / mechanic / ATM / medicals in every area
  const landmarks = createLandmarks(scene, world);
  const tidel = createTidelPark(scene, world);
  const gated = createComplex(scene, world);
  const guindy = createGuindy(scene, world);
  const koyambedu = createKoyambedu(scene, world);
  const cafes = createCafes(scene, world);
  const besant = createBesantNagar(scene, world);
  const beachLife = createBeachLife(scene, world, santhome.obstacles);
  const chepauk = createChepauk(scene, world);
  crowd.addPosed(beachLife.posed); // stall keepers + moon-watchers on the benches
  crowd.addPosed(cafes.posed); // customers chatting at the cafe tables
  crowd.addPosed(hotels.posed); // doormen, guards and guests at the hotels
  const beachfront = createBeachfront(scene, world); // big shops + restaurants facing the beach
  createMedians(scene, world); // divided big roads (Usman Road, Anna Salai)
  const tnagar = createTNagar(scene, world); // Ranganathan Street, Mambalam station, Panagal Park, Pondy Bazaar
  const homes = createHomes(scene, world); // houses you can walk into, sleep in and buy
  const halls = createHotelHalls(scene, world); // the dining halls you enter through the hotel lobbies
  crowd.addPosed(halls.posed); // diners, waiters, chef, musician
  crowd.addPosed(tnagar.posed); // shopkeepers on Ranganathan Street, commuters at Mambalam
  crowd.addWalkers(tnagar.walkers); // shoppers in the lane, walkers in Panagal Park
  crowd.addAmbient(); // everyday people on whatever street you're on
  let matchWasOn = false;
  eateries.list.push(...places.eateries); // tea stall, fish fry, fair stalls: normal snack menus
  eateries.list.push(...beachfront.eateries);
  eateries.list.push(...halls.eateries); // hotel dining halls (fine dining, sit down)
  eateries.list.push(...cafes.eateries); // aesthetic cafes: E to order
  eateries.list.push(...besant.eateries); // Elliot's Beach snack carts
  eateries.list.push(...beachLife.eateries); // beach stalls + dessert carts (some move)
  let stageWasOn = false;
  let raceWasOn = false;
  const upkeep = new Upkeep();
  const signals = createTrafficLights(scene, world);
  traffic.signals = (x, z, dx, dz, look) => signals.ahead(x, z, dx, dz, look);
  const flood = createFlood(scene);
  traffic.slowAt = (x, z) => flood.slowAt(x, z);
  const sound = new Sound();
  // One headlight for whatever you're driving. Always in the scene (switching it off is just
  // intensity 0), so turning it on never recompiles shaders; no shadows (CLAUDE.md light rule).
  const headlight = new THREE.SpotLight(0xfff1d0, 0, HEADLIGHT.distance, HEADLIGHT.angle, HEADLIGHT.penumbra, 1.2);
  headlight.castShadow = false;
  scene.add(headlight, headlight.target);
  let lightsOn = false;
  let wasNight = false;
  const energy = new Energy();
  const sleep = new Sleep();
  let recoverFor = 0; // s of walking slowly after a night in hospital
  /** Extra energy drain per real second while drowsy. */
  const DROWSY_DRAIN = 0.35;
  const DROWSY_SLOW = 0.85;
  const RECOVER_SECONDS = 45;
  const RECOVER_SLOW = 0.55;
  crowd.onSay = (name, line) => hud.say(name, line);

  // Start outside the temple's main gopuram on East Mada Street; uncle's auto at the kerb,
  // facing north in the left lane.
  // A save game puts you (and the auto) back where you left them.
  const saved = loadSave();
  const spawn = saved ? new THREE.Vector3(saved.player.x, saved.player.y + 0.05, saved.player.z) : new THREE.Vector3(25 - 6.2, SIDEWALK_HEIGHT + CAPSULE_LIFT + 0.05, 7);
  const autoSpot = saved ? new THREE.Vector3(saved.auto.x, 0, saved.auto.z) : new THREE.Vector3(25 - 4.2, 0, -4); // tight to the kerb so traffic can pass
  const player = new PlayerController(world, scene, spawn, characters.hero);
  applyChennaiLook(player.model); // full-sleeve shirt, trousers, shoes, belt, vibhuti
  if (saved) player.mesh.rotation.y = saved.player.yaw;
  // A save from before the temple posts (or any glitch) may have the auto inside a block: back to its kerb.
  const offRoad = blocks().some((b) => (b.kind === 'temple' || b.kind === 'tank') && autoSpot.x > b.x0 && autoSpot.x < b.x1 && autoSpot.z > b.z0 && autoSpot.z < b.z1);
  if (offRoad) autoSpot.set(25 - 4.2, 0, -4);
  const auto = new AutoRickshaw(scene, world, autoSpot, saved && !offRoad ? saved.auto.heading : Math.PI);
  const ride = new Ride(player, auto);
  const melee = new Melee(player);
  let health = 100;
  // Homes you own: the rented one (0) from the start; bought ones from the save.
  const owned = new Set<number>(saved?.homes ?? [0]);
  // The story: older saves start in chapter 1 (the check below moves them on if the kadan is paid).
  const story = new Story(saved?.story);
  // Story rides passed (Chapter 2 missions) and the rent on the Mandaveli house.
  const storyDone: string[] = [...(saved?.story?.done ?? [])];
  let storyRideIn = 45; // s before the next story ride shows up on the phone
  const rent = new Rent();
  if (saved?.rent) rent.restore(saved.rent);
  const homesBought = () => [...owned].filter((i) => i !== 0).length;
  const fleet = new Fleet();
  if (saved?.fleet) fleet.restore(saved.fleet);
  /** Your hired drivers' vehicles drive round town in the company colour. */
  const showFleet = () => traffic.setFleet(fleet.autos.filter((a) => a.driver).map((a) => (a.kind === 'cab' ? 'taxi' : a.kind === 'van' ? 'van' : 'auto')));
  showFleet();
  guindy.setWarehouse(fleet.warehouse);
  const storyState = () => ({
    loan: economy.loan, rides: economy.rides, cash: economy.cash, savings: economy.savings, homesBought: homesBought(), storyRides: storyDone.filter((i) => STORY_ORDER.includes(i)).length,
    seshadri: storyDone.includes('lostbag'), fleet: fleet.autos.length, fleetEarned: fleet.earned,
    ganesh: storyDone.filter((i) => GANESH_ORDER.includes(i)).length,
    warehouse: fleet.warehouse, cabs: fleet.count('cab'), vans: fleet.count('van'),
    logistics: storyDone.filter((i) => LOGISTICS_ORDER.includes(i)).length,
  });
  let storyCheck = 0;
  if (rent.evicted) owned.delete(0); // locked out of the rented house until the rent is paid
  homes.homes.forEach((h, i) => h.setOwned(owned.has(i)));
  if (saved) {
    economy.restore({ ...saved.economy, seized: saved.economy.seized ?? false, savings: saved.economy.savings ?? 0 }); // older saves lack these
    energy.value = saved.energy;
    sleep.awake = saved.awake ?? 0;
    health = saved.health;
    dayNight.timeMs = saved.gameMs;
    if (saved.upkeep) Object.assign(upkeep, saved.upkeep);
  }
  /** A traffic vehicle the player took (null = on foot or in uncle's auto). */
  let stolen: Vehicle | null = null;
  let stolenFor = 0;
  /** Seconds left on the ARRESTED / SUTTUTAANGA screen (controls frozen). */
  let downFor = 0;
  const NO_INPUT = { ...input, isDown: () => false, wasPressed: () => false };
  let wasWet = false;
  let redLatch = 0; // s since the vehicle was at a stop line on red
  const finedAt = new Set<number>(); // junctions already fined for (until you leave them)
  const soundKind = (k: Vehicle['kind']) =>
    k === 'bus' ? 'bus' : k === 'lorry' || k === 'tempo' || k === 'tanker' ? 'truck' : k === 'bike' ? 'bike' : k === 'scooter' || k === 'delivery' ? 'scooter' : k === 'auto' || k === 'shareauto' ? 'auto' : 'car';
  const meal = new Meal(player, scene);
  meal.onBite = () => sound.eat();
  meal.onDone = (finished) => {
    if (finished) hud.say('Neenga', MEAL_DONE);
  };
  let menuFor: Eatery | null = null;
  // Shopping bag: snacks / parcels to eat later. B toggles parcel mode in a food menu, B elsewhere opens the bag.
  const bag = new Bag();
  if (saved?.bag) bag.restore(saved.bag);
  let parcelMode = false;
  let bagOpen = false;
  const openMenu = (e: Eatery) => {
    menuFor = e;
    hud.menu({
      title: parcelMode ? `${e.name} · 🛍 Parcel` : e.name,
      greet: parcelMode ? `Parcel: goes in your bag (${bag.items.length}/${BAG_SLOTS})` : e.menu.greet,
      keys: `1-${e.menu.items.length} order · B ${parcelMode ? 'eat here' : 'parcel'} · E close`,
      rows: e.menu.items.map((it) => ({ label: it.name, price: it.price, energy: it.energy, affordable: economy.cash >= it.price })),
    });
  };
  const openBag = () => {
    bagOpen = true;
    hud.menu({
      title: `🛍 Bag (${bag.items.length}/${BAG_SLOTS})`,
      greet: bag.items.length ? 'Pasikkudha? Edhaavadhu saapdunga.' : BAG_LINES.empty,
      keys: bag.items.length ? `1-${bag.items.length} eat · B / E close` : 'B / E close',
      rows: bag.items.map((it) => ({ label: it.name, price: 0, energy: it.energy, affordable: true })),
    });
  };
  const closeMenu = () => {
    menuFor = null;
    bagOpen = false;
    shelfOpen = null;
    serviceOpen = null;
    hud.menu(null);
  };
  // ---- Places: petrol bunk, mechanic, bank, pharmacy, auto stand ----------------------------
  let serviceOpen: Service | null = null;
  type Row = { label: string; price: number; note: string; run: () => string };
  const fuelPrice = () => Math.round(PETROL_PRICE * (curUpkeep() === upkeep ? fuelFactor(upgrades) : 1));
  const fill = (money: number): Row => {
    const u = curUpkeep();
    const litres = u.litresFor(money, fuelPrice());
    const cost = Math.ceil(litres * fuelPrice());
    return {
      label: money >= u.tank * fuelPrice() ? 'Full tank' : `${upgrades.includes('cng') ? 'Gas' : 'Petrol'} ₹${money}`,
      price: cost,
      note: `${litres.toFixed(1)} L`,
      run: () => {
        u.fill(litres);
        economy.cash -= cost;
        return PLACE_LINES.filled.replace('{litres}', litres.toFixed(1)).replace('{cost}', String(cost));
      },
    };
  };
  const serviceMenu = (s: Service): { greet: string; rows: Row[] } => {
    switch (s.kind) {
      case 'fuel': {
        const u = curUpkeep();
        if (u.fuel >= u.tank - 0.05) return { greet: `${PLACE_LINES.bunkFull} (${upkeepName(u)})`, rows: [] };
        return { greet: `${PLACE_LINES.bunkGreet} (${upkeepName(u)}: ₹${fuelPrice()}/L${upgrades.includes('cng') && u === upkeep ? ' CNG' : ''} · tank ${u.fuel.toFixed(1)}/${u.tank} L)`, rows: [fill(100), fill(500), fill(u.tank * fuelPrice())] };
      }
      case 'mechanic': {
        const u = curUpkeep();
        const broken = 100 - u.condition;
        // Chapter 2: the auto is yours, so you can do it up (one of each; paint any time). Other vehicles: repairs only.
        const ups: Row[] = story.chapter < 2 || u !== upkeep ? [] : [
          ...UPGRADES.filter((u) => !upgrades.includes(u.id)).map((u): Row => ({
            label: u.name, price: u.price, note: u.note,
            run: () => {
              economy.cash -= u.price;
              upgrades.push(u.id);
              if (u.id === 'sticker') auto.setSticker(true);
              saveNow();
              return GARAGE_LINES.upgraded.replace('{name}', u.name);
            },
          })),
          ...PAINTS.filter((p) => p.colour !== paintColour).map((p): Row => ({
            label: `Paint: ${p.name}`, price: PAINT_PRICE, note: 'new colour',
            run: () => {
              economy.cash -= PAINT_PRICE;
              paintColour = p.colour;
              auto.paint(p.colour);
              saveNow();
              return GARAGE_LINES.painted.replace('{name}', p.name);
            },
          })),
        ];
        if (broken < 0.5) return { greet: `${PLACE_LINES.mechFine} (${upkeepName(u)})`, rows: ups.slice(0, 9) };
        const fix = (points: number, label: string): Row => ({
          label, price: Math.ceil(points) * REPAIR_PRICE, note: `+${Math.ceil(points)}%`,
          run: () => {
            economy.cash -= u.repair(points);
            return PLACE_LINES.repaired;
          },
        });
        return { greet: `${PLACE_LINES.mechGreet} (${upkeepName(u)}: condition ${Math.round(u.condition)}%)`, rows: [fix(broken, 'Full repair'), ...(broken > 30 ? [fix(30, 'Quick patch')] : []), ...ups].slice(0, 9) };
      }
      case 'bank': {
        const say = (line: string, n: number) => line.replace('{n}', n.toLocaleString('en-IN'));
        return {
          greet: PLACE_LINES.bankGreet.replace('{savings}', economy.savings.toLocaleString('en-IN')),
          rows: [
            { label: `Deposit all cash (₹${economy.cash})`, price: 0, note: 'safe from pickpockets', run: () => say(PLACE_LINES.deposited, economy.deposit()) },
            { label: 'Withdraw ₹500', price: 0, note: '', run: () => (economy.savings > 0 ? say(PLACE_LINES.withdrew, economy.withdraw(500)) : PLACE_LINES.noSavings) },
            { label: `Withdraw all (₹${economy.savings})`, price: 0, note: '', run: () => (economy.savings > 0 ? say(PLACE_LINES.withdrew, economy.withdraw(economy.savings)) : PLACE_LINES.noSavings) },
          ],
        };
      }
      case 'pharmacy':
        return {
          greet: PLACE_LINES.pharmaGreet,
          rows: PHARMACY.map((it) => ({
            label: it.name, price: it.price, note: [it.health ? `+${it.health}❤` : '', it.energy ? `+${it.energy}⚡` : ''].filter(Boolean).join(' '),
            run: () => {
              economy.cash -= it.price;
              health = Math.min(100, health + it.health);
              energy.eat(it.energy);
              return PLACE_LINES.healed.replace('{item}', it.name);
            },
          })),
        };
      case 'stand':
        return {
          greet: PLACE_LINES.standGreet,
          rows: [{
            label: 'Sawaari edu (take a passenger)', price: 0, note: 'ride from the stand',
            run: () => {
              if (jobs.busy) return PLACE_LINES.standBusy;
              if (jobs.carrier.parcelOnly) return PLACE_LINES.standBike;
              if (jobs.phase === 'off') jobs.start();
              const o = jobs.addOrderFrom(STAND, false);
              jobs.accept(o.id);
              return PLACE_LINES.standRide.replace('{name}', o.name);
            },
          }],
        };
    }
  };
  const openService = (s: Service) => {
    serviceOpen = s;
    const m = serviceMenu(s);
    hud.menu({
      title: s.name,
      greet: m.greet,
      keys: m.rows.length ? `1-${m.rows.length} choose · E close` : 'E close',
      rows: m.rows.map((r) => ({ label: r.label, price: r.price, note: r.note, affordable: economy.cash >= r.price })),
    });
  };
  const nearService = (p: THREE.Vector3, inAuto: boolean) => {
    for (const s of places.services) {
      if (inAuto && !s.inAuto) continue;
      if (Math.hypot(p.x - s.at.x, p.z - s.at.z) < s.radius) return s;
    }
    return null;
  };
  let lastAutoSpeed = 0;
  let crashCooldown = 0;
  let lastStars = 0; // wanted level last frame (new stars re-centre the search circle)
  let lastOwnSpeed = 0;
  let ownFuelWarned = false;
  /** You and a traffic vehicle hit each other: your vehicle takes a dent, their driver shouts. */
  traffic.onCrash = (v, closing, theirs) => {
    if (crashCooldown > 0) return;
    const yours = ride.driving ? upkeep : ownedNow()?.upkeep ?? null;
    if (yours) {
      yours.crash(CRASH_DV + closing * 0.25);
      dented(yours);
    } else {
      crashCooldown = 1;
      sound.hit('kick');
      cam.shake(0.08);
    }
    if (v.driver) {
      const lines = theirs ? CRASH_LINES.theirs : CRASH_LINES.yours;
      hud.say(`${VEHICLE_NAMES[v.kind]} driver`, lines[Math.floor(Math.random() * lines.length)]);
    }
  };
  /** Your vehicle took a knock: sound, shake, condition on the HUD. */
  const dented = (u: Upkeep) => {
    crashCooldown = 1;
    sound.hit('kick');
    cam.shake(0.08);
    const name = u === upkeep ? 'Auto' : ownedNow() ? DEALER_STOCK.find((d) => d.id === ownedNow()!.stock)?.name ?? 'Vandi' : 'Vandi';
    hud.say(name, u === upkeep && u.condition < 15 ? PLACE_LINES.wrecked : CRASH_LINES.dent.replace('{name}', name).replace('{cond}', String(Math.round(u.condition))));
  };
  let fuelWarned = false;
  let pushing = false;
  let insideHall = -1; // which hotel's dining hall you're in (-1 = outside)
  const viewDir = new THREE.Vector3(); // camera forward on the ground (ambient walkers spawn out of view)
  let pushT = 0; // seconds since you took hold (walking round to the back first)
  const pushAt = new THREE.Vector3();
  const stopPush = () => {
    pushing = false;
    auto.push = false;
    player.walkTo(null);
    player.pose = null;
    if (ride.phase === 'onFoot') auto.park();
  };
  let lastShowHour = -1;

  // Supermarket shopping: pick into the basket at the shelves, pay at the counter.
  let basket: FoodItem[] = [];
  let shelfOpen: Shelf | null = null;
  let inStore: Store | null = null;
  const basketTotal = () => basket.reduce((sum, it) => sum + it.price, 0);
  const openShelf = (s: Shelf) => {
    shelfOpen = s;
    hud.menu({
      title: s.name,
      greet: `Basket: ${basket.length}/${BASKET_MAX}${basket.length ? ` · ₹${basketTotal()}` : ''}`,
      rows: s.items.map((it) => ({ label: it.name, price: it.price, energy: it.energy, affordable: economy.cash >= basketTotal() + it.price })),
    });
  };
  /** Paid groceries are eaten standing, like a snack from a shop. */
  const SHOP_EATERY: Eatery = {
    name: CASHIER, menu: { kind: 'shop', greet: '', items: [] },
    spot: new THREE.Vector3(), seat: new THREE.Vector3(), seatYaw: 0, eatYaw: 0, table: new THREE.Vector3(),
  };
  type Officer = ReturnType<typeof police.officersOut>[number];
  /** Everyone the player can hit: pedestrians and officers on foot (built only mid-attack). */
  const meleeTargets = (): Target<Npc | Officer>[] => [
    ...crowd.npcs.map((npc) => ({ p: npc.root.position, ref: npc })),
    ...police.officersOut().map((o) => ({ p: o.root.position, ref: o })),
  ];
  let hitStop = 0;
  const camDir = new THREE.Vector3();
  /** Keep the seated hero's hips on a seat (vehicle space) while the Driving clip plays. */
  const cam = new FollowCamera(camera, world, player.collider);
  cam.yaw = 1.15; // from the east, looking back at the gopuram with the auto in view
  cam.pitch = 0.08;
  enablePointerLock(renderer.domElement, (locked) => {
    hud.showPlayHint(!locked);
    if (locked) sound.unlock(); // browsers only allow audio after a click
  });

  // Fares: start once the player has climbed into the auto for the first time.
  const jobs = new TaxiJobs(scene, characters.npcs, auto);
  const minimap = new Minimap(townMap);
  const bigMap = new BigMap(townMap);
  const showMoney = () => hud.setWallet(economy.cash, economy.loan);
  const phone = new Phone({
    jobs,
    economy,
    weather,
    town: townMap,
    police: () => police.blips(),
    clock: () => dayNight.clockLabel,
    player: () => ({ x: player.position.x, z: player.position.z, yaw: ride.driving ? auto.heading : player.mesh.rotation.y }),
    auto: () => jobs.carrier.group.position as THREE.Vector3,
    guide: () => guide,
    view: () => cam.yaw,
    places: () => navPlaces(),
    dest: () => nav,
    navigate: (d) => navigate(d),
    navInfo: () => navInfo,
    newGame: () => newGame(),
    redeem: () => redeemAuto(),
    story: () => ({ chapter: story.chapter, state: storyState() }),
    rent: () => ({ active: rent.active, owed: rent.owed, evicted: rent.evicted, weekly: RENT, daysLeft: Math.max(0, rent.dueDay - Math.floor(istTime(dayNight.timeMs).day)) }),
    garage: () => ({
      list: mine.map((m) => ({
        name: DEALER_STOCK.find((s) => s.id === m.stock)?.name ?? m.veh.kind,
        away: Math.round(Math.hypot(m.veh.currPos.x - player.position.x, m.veh.currPos.z - player.position.z)),
        inUse: stolen === m.veh,
      })),
      upgrades: UPGRADES.filter((u) => upgrades.includes(u.id)).map((u) => u.name),
      deliverPrice: DELIVER_HOME,
    }),
    business: () => ({
      open: story.chapter >= 3,
      earned: fleet.earned,
      shop: (story.chapter >= 4 ? (['auto', 'cab', 'van'] as const) : (['auto'] as const)).map((kind) => ({
        kind, name: UNITS[kind].name, icon: UNITS[kind].icon, price: UNITS[kind].price,
        note: kind === 'van' && !fleet.warehouse ? 'Vans need a base: lease the Guindy warehouse first.' : undefined,
      })),
      warehouse: story.chapter >= 4 ? { rented: fleet.warehouse, price: WAREHOUSE_PRICE } : null,
      autos: fleet.autos.map((a) => {
        const d = a.driver ? DRIVERS.find((x) => x.id === a.driver)! : null;
        const u = UNITS[a.kind ?? 'auto'];
        return { driver: d ? `${d.name} (${d.trait})` : null, name: u.name, icon: u.icon };
      }),
      candidates: fleet.candidates.map((d) => ({ id: d.id, name: d.name, trait: TRAITS[d.trait].label, blurb: d.blurb })),
    }),
    buyUnit: (kind: UnitKind) => {
      const u = UNITS[kind];
      if (kind === 'van' && !fleet.warehouse) return;
      if (!economy.spend(u.price)) return phone.addMessage(SESHADRI, FLEET_LINES.cantAfford.replace('{name}', u.name).replace('{price}', u.price.toLocaleString('en-IN')));
      fleet.buy(kind);
      showMoney();
      phone.addMessage(SESHADRI, FLEET_LINES.bought.replace('{name}', u.name));
      saveNow();
    },
    rentWarehouse: () => {
      if (fleet.warehouse || story.chapter < 4) return;
      if (!economy.spend(WAREHOUSE_PRICE)) return phone.addMessage(SESHADRI, FLEET_LINES.cantAfford.replace('{name}', 'Warehouse lease').replace('{price}', WAREHOUSE_PRICE.toLocaleString('en-IN')));
      fleet.warehouse = true;
      guindy.setWarehouse(true);
      showMoney();
      sound.coin();
      phone.addMessage(SESHADRI, FLEET_LINES.warehouse);
      saveNow();
    },
    hire: (i, id) => {
      if (!fleet.hire(i, id)) return;
      showFleet();
      const d = DRIVERS.find((x) => x.id === id)!;
      phone.addMessage(SESHADRI, FLEET_LINES.hired.replace('{name}', d.name).replace('{trait}', TRAITS[d.trait].label));
      saveNow();
    },
    fire: (i) => {
      const d = DRIVERS.find((x) => x.id === fleet.autos[i]?.driver);
      fleet.fire(i);
      showFleet();
      if (d) phone.addMessage(SESHADRI, FLEET_LINES.fired.replace('{name}', d.name));
      saveNow();
    },
    deliver: (i) => {
      const m = mine[i];
      if (!m || stolen === m.veh || m.veh.kind === 'bus' || !economy.spend(DELIVER_HOME)) return; // the bus lives at the warehouse
      const p = homeSpot(i);
      traffic.place(m.veh, p.x, p.z, p.heading);
      showMoney();
      const name = DEALER_STOCK.find((s) => s.id === m.stock)?.name ?? m.veh.kind;
      phone.addMessage(DEALER, GARAGE_LINES.delivered.replace('{name}', name));
      saveNow();
    },
    payRent: () => {
      const paid = rent.pay(economy.cash);
      if (!paid) return;
      economy.cash -= paid;
      showMoney();
      sound.coin();
      if (!rent.evicted && !owned.has(0)) {
        owned.add(0);
        homes.homes[0].setOwned(true);
        phone.addMessage(LANDLORD, RENT_LINES.back);
      } else phone.addMessage(LANDLORD, RENT_LINES.paid);
      saveNow();
    },
    bank: (op, amount) => {
      const n = op === 'deposit' ? economy.deposit(amount) : economy.withdraw(amount);
      if (!n) return;
      showMoney();
      sound.coin();
      const line = (op === 'deposit' ? PLACE_LINES.deposited : PLACE_LINES.withdrew).replace('{n}', n.toLocaleString('en-IN'));
      phone.notify(`🏦 ${line}`);
    },
    pay: (amount) => {
      const paid = economy.pay(amount);
      if (!paid) return;
      showMoney();
      phone.addMessage(LENDER, economy.paidOff ? MSG_PAID_OFF : MSG_PAID.replace('{paid}', paid.toLocaleString('en-IN')).replace('{left}', economy.loan.toLocaleString('en-IN')));
    },
  });
  jobs.onSay = (name, line) => hud.say(name, line);
  jobs.onPaid = (fare, tip) => {
    economy.earn(fare + tip);
    showMoney();
    sound.coin();
    console.log(`[fare] ₹${fare}${tip ? ` + ₹${tip} tip` : ''}`);
  };
  jobs.onNewOrder = (o) => {
    if (o.story) phone.notify(o.story.lines.offer);
    else if (!jobs.busy) phone.notify(`🛺 New order: ${o.from.name} → ${o.to.name} · ₹${o.fare}`);
  };
  /** A story mission (ride or quest) ended. */
  const storyFinished = (id: string, passed: boolean) => {
    if (passed && !storyDone.includes(id)) storyDone.push(id);
    // Chapter 3 wins change how the fleet runs.
    if (passed && id === 'tidel') fleet.contract = true;
    if (passed && id === 'complaint') fleet.peace = true;
    if (passed && id === 'staffbus') fleet.busContract = true;
    storyRideIn = 90;
    phone.addMessage('Auto Anna', (passed ? STORY_RIDE_LINES.passed : STORY_RIDE_LINES.failed).replace('{title}', storyTitle(id)));
    saveNow();
  };
  jobs.onStory = storyFinished;
  const quests = new QuestRunner(scene, world, characters.npcs);
  // ---- Rides in vehicles you own: cars / van / taxi carry passengers, two-wheelers parcels ----
  const autoCarrier = jobs.carrier;
  const carrierFor = (v: Vehicle): Carrier | null => {
    const parcel = PARCEL_SPOT[v.kind];
    const seat = PASSENGER_SEAT[v.kind];
    if (!parcel && !seat) return null;
    const speed = () => Math.hypot(v.body.linvel().x, v.body.linvel().z);
    const name = DEALER_STOCK.find((d) => d.kind === v.kind)?.name ?? VEHICLE_NAMES[v.kind];
    if (parcel) return { group: v.group, speed, bench: parcel, door: 0.9, parcelAt: parcel, parcelOnly: true, name };
    return { group: v.group, speed, bench: seat!, door: SPEC[v.kind].width / 2 + 0.45, parcelAt: seat!.clone().setY(seat!.y - 0.22), parcelOnly: false, name };
  };
  // ---- Your vehicles (Chapter 2): auto upgrades, the dealer's stock, vehicles you bought ----
  const upgrades: string[] = [...(saved?.garage?.upgrades ?? [])];
  let paintColour = saved?.garage?.paint ?? PAINTS[0].colour;
  auto.paint(paintColour);
  auto.setSticker(upgrades.includes('sticker'));
  const dealer = createDealer(scene, world);
  /** A vehicle you own: its own tank and dents; cars you can run as cabs wear yellow plates. */
  const ownUpkeep = (kind: string, fuel?: number, condition?: number) => {
    const spec = FUEL_SPEC[kind] ?? FUEL_SPEC.hatch;
    const u = new Upkeep(spec.tank, spec.perKm);
    if (fuel !== undefined) u.fuel = Math.min(spec.tank, fuel);
    if (condition !== undefined) u.condition = condition;
    return u;
  };
  const ownPlates = (veh: Vehicle) => {
    if (PASSENGER_SEAT[veh.kind]) setPlateKind(veh.group, 'commercial');
  };
  const mine: { stock: string; veh: Vehicle; upkeep: Upkeep }[] = (saved?.garage?.vehicles ?? []).map((v) => {
    const veh = traffic.addParked(v.kind as Vehicle['kind'], v.colour, v.x, v.z, v.heading);
    ownPlates(veh);
    return { stock: v.stock, veh, upkeep: ownUpkeep(v.kind, v.fuel, v.condition) };
  });
  /** The company bus (Chapter 4 staff bus trial): parked in the warehouse yard, yours to keep. */
  const giveCompanyBus = () => {
    if (mine.some((m) => m.stock === 'staffbus')) return;
    const veh = traffic.addParked('bus', undefined, WAREHOUSE_YARD.x, WAREHOUSE_YARD.z, Math.PI);
    mine.push({ stock: 'staffbus', veh, upkeep: ownUpkeep('bus') });
    saveNow();
  };
  /** The owned vehicle you're driving, if any. */
  const ownedNow = () => (stolen ? mine.find((m) => m.veh === stolen) ?? null : null);
  /**
   * Petrol / repairs go to whatever of yours you're sitting in; on foot, to your vehicle parked
   * nearest you (the auto, or one you bought), so a mechanic can fix any of them.
   */
  const curUpkeep = () => {
    const own = ownedNow();
    if (own) return own.upkeep;
    if (ride.driving || stolen) return upkeep;
    const pp = player.position;
    let best = upkeep;
    let d = Math.hypot(auto.group.position.x - pp.x, auto.group.position.z - pp.z);
    for (const m of mine) {
      const dm = Math.hypot(m.veh.currPos.x - pp.x, m.veh.currPos.z - pp.z);
      if (dm < d && dm < 20) {
        best = m.upkeep;
        d = dm;
      }
    }
    return best;
  };
  /** What the bunk / mechanic calls the vehicle they're working on. */
  const upkeepName = (u: Upkeep) => {
    const m = mine.find((x) => x.upkeep === u);
    return m ? DEALER_STOCK.find((d) => d.id === m.stock)?.name ?? VEHICLE_NAMES[m.veh.kind] : 'Auto';
  };
  const dealerStock = DEALER_STOCK.map((s, i) => ({ s, veh: mine.some((m) => m.stock === s.id) ? null : traffic.addParked(s.kind, s.colour, dealer.spots[i].x, dealer.spots[i].z, dealer.spots[i].heading, true) }));
  /**
   * Where an owned vehicle is delivered: the home you own nearest to you. At the rented Mandaveli
   * house, the open yard beside it; at a bought house, its drive inside the car gate (under the
   * porch). One behind another, facing the road, so they drive straight out.
   */
  const homeSpot = (n: number) => {
    const lots = HOME_LOTS();
    const mineHomes = [...owned];
    const pp = player.position;
    const idx = mineHomes.length
      ? mineHomes.reduce((best, i) => {
          const c = (k: number) => Math.hypot((lots[k].x0 + lots[k].x1) / 2 - pp.x, (lots[k].z0 + lots[k].z1) / 2 - pp.z);
          return c(i) < c(best) ? i : best;
        }, mineHomes[0])
      : 0;
    const f = frame(lots[idx]);
    const toRoad = f.at(0, -1).sub(f.at(0, 0));
    const across = f.at(1, 0).sub(f.at(0, 0));
    const facing = (d: THREE.Vector3) => Math.atan2(d.x, d.z);
    // Parking slots: two columns in the Mandaveli yard; the drive (under the porch) then the backyard of a bought house.
    const slots = idx === 0
      ? [7.7, 11.0].flatMap((u) => [2.6, 7.6, 12.6].map((v) => ({ p: f.at(u, v), h: facing(toRoad) })))
      : [...[3.2, 8.2, 13.2].map((v) => ({ p: f.at(6.4, v), h: facing(toRoad) })), ...[-4.5, 0].map((u) => ({ p: f.at(u, 14.9), h: facing(across) }))];
    // The first slot with room to spare; if they're all taken, the one with the most room.
    const room = (sl: { p: THREE.Vector3 }) => Math.min(Infinity, ...mine.filter((_, j) => j !== n).map((m) => Math.hypot(m.veh.currPos.x - sl.p.x, m.veh.currPos.z - sl.p.z)));
    const free = slots.find((sl) => room(sl) > 2.5) ?? slots.reduce((a, b) => (room(b) > room(a) ? b : a));
    return { x: free.p.x, z: free.p.z, heading: free.h };
  };
  quests.onSay = (name, line) => hud.say(name, line);
  const heroFeet = new THREE.Vector3();
  let lastVSpeed = 0;
  /** What the quest runner needs to know about the player this frame. */
  const questCtx = (jolt = false) => ({
    hero: heroFeet.copy(player.position).setY(player.position.y - CAPSULE_LIFT),
    heroYaw: player.mesh.rotation.y,
    onFoot: player.onFoot && !stolen && ride.phase === 'onFoot',
    vehicle: stolen ? stolen.group.position : ride.driving ? auto.group.position : null,
    jolt,
    stolen: !!stolen && !mine.some((m) => m.veh === stolen),
    vehicleKind: stolen ? stolen.kind : ride.driving ? 'auto' : null,
    speed: stolen ? Math.abs(traffic.speedOf(stolen)) : ride.driving ? Math.abs(auto.speed) : 0,
  });
  quests.onDone = (id, passed, reward) => {
    hud.setMission(''); // on foot nothing else rewrites the line, so the finished quest would stay up
    if (reward) {
      economy.cash += reward;
      economy.earnedToday += reward;
      showMoney();
      sound.coin();
    }
    storyFinished(id, passed);
  };
  let online = false;
  // Road route from the auto (or the player on foot) to the job target; refreshed a few times a second.
  let guide: { x: number; z: number }[] | null = null;
  let guideAge = 0;
  // Navigation (Google Maps style): a place picked on the phone or the big map. Overrides the job route while set.
  let nav: Dest | null = null;
  let navLeft = 0;
  let navInfo: NavInfo | null = null;
  const navigate = (d: Dest | null) => {
    nav = d;
    guideAge = 1; // re-route now
    if (d) phone.notify(`🧭 Route to ${d.name}`);
  };
  bigMap.onNavigate = navigate;
  let placeList: Place[] | null = null;
  /** Every map place plus every eatery (built once, on first use). */
  const navPlaces = () => (placeList ??= [
    ...townMap.pois,
    ...eateries.list.filter((e) => !townMap.pois.some((p) => p.name === e.name)).map((e): Place => ({ name: e.name, x: e.spot.x, z: e.spot.z, cat: 'food', icon: '🍛', colour: '#ef6c00' })),
  ]);
  const roadName = (a: Pt, b: Pt) => (Math.abs(b.x - a.x) < 0.5 ? X_ROADS[a.x]?.[0] : streetName('x', a.z, (a.x + b.x) / 2)?.[0]);
  ride.onDrivingChange = (driving) => {
    sound.door();
    if (driving && upkeep.fuel > 0) sound.autoStart(); // no petrol: it won't start
    cam.mode = driving ? 'drive' : 'foot';
    cam.ignore = driving ? auto.collider : player.collider;
    hud.setSpeed(driving ? 0 : null);
    if (driving) jobs.useCarrier(autoCarrier);
    if (driving && !online) {
      online = true;
      jobs.start();
      phone.addMessage(LENDER, MSG_LENDER_HELLO);
      phone.notify(`🛺 ${jobs.orders.length} ride orders waiting`);
    }
  };

  // Quality
  const quality = new QualityManager();
  quality.onChange = (s) => {
    setRenderScale(renderer, s.resScale);
    dayNight.setShadowMapSize(SHADOW_MAP_SIZES[s.shadows]);
    dayNight.setEffects(s.effects);
  };
  quality.onChange(quality.settings);
  const debug = new DebugPanel(quality);

  // Dev-only console handle: inspect state with `game.player.position` etc.
  if (import.meta.env.DEV) Object.assign(window, { game: { world, player, cam, auto, ride, jobs, phone, economy, weather, traffic, police, wanted, melee, quality, dayNight, crowd, energy, meal, eateries, markets, santhome, signals, flood, sound, upkeep, places, story, rent, quests, sleep, mine, fleet, bag, homes, owned, storyDone, save: () => saveNow(), getHealth: () => health, setHealth: (h: number) => (health = h) } });

  // ---- Crime & punishment ------------------------------------------------------------------
  const takeVehicle = (v: Vehicle) => {
    const theft = traffic.take(v);
    sound.door();
    stolen = v;
    stolenFor = 0;
    player.setAway(true);
    if (melee.stickOut) melee.toggleStick();
    // Sit at the wheel in the Driving pose (hips pinned to the driver's seat every frame).
    v.group.add(player.model);
    player.model.rotation.set(0, 0, 0);
    player.animator.play('drive', { fade: 0.2 });
    cam.mode = 'drive';
    cam.ignore = v.collider;
    cam.size = Math.max(1, SPEC[v.kind].length / 4.4); // buses / lorries: pull the camera back
    hud.setSpeed(0);
    const own = mine.some((m) => m.veh === v) ? carrierFor(v) : null;
    if (own && jobs.useCarrier(own)) {
      if (jobs.phase === 'off') jobs.start();
      phone.notify(own.parcelOnly ? `📦 ${own.name}: parcel orders only (Phone > Orders)` : `🚖 Ride app on in your ${own.name} (Phone > Orders)`);
    }
    if (theft) {
      if (quests.active || jobs.busy) hud.say('Auto Anna', 'Thirutu vandi-la ride / mission edhuvum odaadhu! Un vandi illa nadandhu po.');
      wanted.report('theft');
      hud.say(POLICE, MSG_THEFT_WARNING);
      phone.addMessage(POLICE, MSG_THEFT_WARNING);
    }
  };
  const leaveVehicle = () => {
    if (!stolen) return;
    sound.door();
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(stolen.group.quaternion);
    const out = stolen.group.position.clone().addScaledVector(side, SPEC[stolen.kind].width / 2 + 0.8);
    out.y += 0.2;
    traffic.release(stolen);
    player.attachModel();
    player.animator.play('idle', { fade: 0.2 });
    stolen = null;
    player.placeAt(out, Math.atan2(side.x, side.z));
    player.setAway(false);
    cam.mode = 'foot';
    cam.ignore = player.collider;
    cam.size = 1;
    hud.setSpeed(null);
  };
  // ---- Kandasamy takes the auto after too many missed days ------------------------------
  const AUTO_HOME = new THREE.Vector3(25 - 4.2, 0, -4);
  const seizeAuto = () => {
    if (ride.phase !== 'onFoot') ride.forceOut();
    auto.group.visible = false;
    auto.body.setEnabled(false);
  };
  const redeemAuto = () => {
    if (!economy.redeem()) return;
    showMoney();
    auto.placeAt(AUTO_HOME, Math.PI);
    auto.body.setEnabled(true);
    auto.group.visible = true;
    phone.addMessage(LENDER, MSG_REDEEMED);
    hud.say(LENDER, MSG_REDEEMED);
  };
  let fallen = false; // knocked out on foot: kneeling / lying until released
  let toHospital = false; // where the next release puts you
  let hitReactCooldown = 0;
  if (economy.seized) seizeAuto(); // loaded a save where it had been taken
  /** Arrested or shot down: fine, then released outside the station. */
  const knockOut = (cause: 'busted' | 'shot' | 'starved' | 'sleep') => {
    const fine = cause === 'busted' ? 500 * Math.max(1, wanted.level) : 300;
    const { owed } = economy.charge(fine); // short of cash: Kandasamy pays the rest and adds it to the kadan
    showMoney();
    const [title, sub] = cause === 'busted' ? [BUSTED_TITLE, BUSTED_SUB] : cause === 'shot' ? [WASTED_TITLE, WASTED_SUB] : cause === 'sleep' ? [SLEEP_TITLE, SLEEP_SUB] : [STARVED_TITLE, STARVED_SUB];
    if (cause === 'sleep') {
      // A night in the hospital: the clock moves on, you've slept, and you'll be slow for a while.
      dayNight.timeMs += HOSPITAL_SLEEP * 3600 * 1000;
      sleep.rest();
      recoverFor = RECOVER_SECONDS;
    }
    const onLoan = owed > 0 ? ` Kaasu pathala: ₹${owed} kadan-la serthaachu.` : '';
    const lifted = cause === 'busted' ? 0 : economy.pickpocket(PICKPOCKET_SHARE); // bank money is safe
    showMoney();
    const lost = lifted > 0 ? PLACE_LINES.pickpocket.replace('{n}', String(lifted)) : '';
    hud.banner(title, sub.replace('{fine}', String(fine)) + onLoan + lost);
    if (owed > 0) phone.addMessage(LENDER, MSG_FINE_ON_LOAN.replace('{owed}', owed.toLocaleString('en-IN')).replace('{loan}', economy.loan.toLocaleString('en-IN')));
    meal.forceStop();
    closeMenu();
    basket = [];
    downFor = 3.5;
    // On foot: kneel for the arrest, or fall flat when shot / fainting (Mixamo clips).
    // Arrested: out of the police station. Shot or fainted from hunger: you come round at the hospital.
    toHospital = cause !== 'busted';
    fallen = player.onFoot && !stolen && ride.phase === 'onFoot';
    if (fallen) player.forceAction(cause === 'busted' ? 'kneel' : 'death', 3.6, cause === 'busted' ? 'kneel_idle' : undefined);
  };
  const release = () => {
    if (fallen) player.animator.play('idle', { fade: 0.3 }); // back on your feet
    fallen = false;
    hud.banner(null);
    leaveVehicle();
    ride.forceOut();
    if (toHospital) player.placeAt(hospital.releaseSpot, hospital.releaseYaw);
    else player.placeAt(station.releaseSpot, 0);
    wanted.clear();
    police.reset();
    health = 100;
    energy.value = Math.max(energy.value, 60); // fed at the hospital
  };

  showMoney();
  phone.addMessage(UNCLE, saved ? MSG_WELCOME_BACK : MSG_WELCOME);
  if (!saved) phone.addMessage(UNCLE, MSG_HOME_HINT);

  // Autosave every few seconds and when the tab closes.
  let resetting = false;
  const saveNow = () => {
    if (resetting || downFor > 0) return; // never save the "arrested" moment
    const inVehicle = stolen ?? (ride.phase !== 'onFoot' ? auto : null);
    let p = player.position;
    let yaw = player.mesh.rotation.y;
    if (inVehicle) {
      // Load back up standing beside the vehicle you were in.
      const side = new THREE.Vector3(1, 0, 0).applyQuaternion(inVehicle.group.quaternion);
      p = inVehicle.group.position.clone().addScaledVector(side, 2.2);
      p.y = CAPSULE_LIFT + 0.3;
      yaw = Math.atan2(side.x, side.z);
    }
    const a = auto.group.position;
    writeSave({
      gameMs: dayNight.timeMs,
      economy: economy.snapshot(),
      energy: energy.value,
      awake: sleep.awake,
      health: Math.max(1, health),
      player: { x: p.x, y: p.y, z: p.z, yaw },
      auto: { x: a.x, y: a.y, z: a.z, heading: auto.heading },
      upkeep: { fuel: upkeep.fuel, condition: upkeep.condition },
      homes: [...owned],
      story: { ...story.snapshot(), done: storyDone },
      fleet: fleet.snapshot(),
      bag: bag.snapshot(),
      rent: rent.snapshot(),
      garage: {
        upgrades,
        paint: paintColour,
        vehicles: mine.map((m) => ({ stock: m.stock, kind: m.veh.kind, colour: m.veh.colour, x: m.veh.currPos.x, z: m.veh.currPos.z, heading: traffic.headingOf(m.veh), fuel: m.upkeep.fuel, condition: m.upkeep.condition })),
      },
    });
  };
  window.setInterval(saveNow, AUTOSAVE_MS);
  window.addEventListener('pagehide', saveNow);
  const newGame = () => {
    resetting = true;
    clearSave();
    location.reload();
  };
  hud.setMission("Find your uncle's auto");
  console.log(`[world] ${town.count} buildings, ${props.lampCount} lamps, ${props.treeCount} trees, ${crowd.npcs.length} NPCs`);

  await renderer.compileAsync(scene, camera); // compile shaders behind the loading screen, not mid-game
  loadingScreen.done();

  let accumulator = 0;
  startLoop((dt, frameMs) => {
    const t0 = performance.now();
    // Hit-stop: the world nearly freezes for a few frames when a blow lands.
    if (hitStop > 0) {
      hitStop -= dt;
      dt *= HIT_STOP_SCALE;
    }
    const mouse = input.consumeMouse();
    cam.rotate(mouse.x, mouse.y);

    // --- Interactions (F: auto / any vehicle, E: talk, 1: stick, click: swing)
    if (input.wasPressed('Tab')) bigMap.toggle(player.position);
    const free = downFor <= 0 && !bigMap.isOpen; // the full map takes the keys while it's open
    const onFootFree = free && player.onFoot && ride.phase === 'onFoot' && !stolen && !meal.busy;
    const nearAuto = onFootFree && auto.group.visible && auto.isNear(player.position, ENTER_RADIUS);
    const other = onFootFree && !nearAuto ? traffic.enterable(player.position) : null;
    // Hotels / shops: E opens the menu (not while the police are after you).
    const eatery = onFootFree && !nearAuto && !other && wanted.level === 0 ? eateries.nearest(player.position) : null;
    if (menuFor && menuFor !== eatery) closeMenu();
    if (eatery && input.wasPressed('KeyE')) {
      if (menuFor) closeMenu();
      else openMenu(eatery);
    } else if (menuFor && input.wasPressed('KeyB')) {
      if (!bag.owned) hud.say(menuFor.name, BAG_LINES.noBag.replace('{price}', String(BAG_PRICE)));
      else {
        parcelMode = !parcelMode;
        openMenu(menuFor);
      }
    } else if (menuFor) {
      const at = menuFor;
      const i = at.menu.items.findIndex((_, n) => input.wasPressed(`Digit${n + 1}`));
      const item = at.menu.items[i];
      if (item && economy.cash < item.price) hud.say(at.name, NO_MONEY);
      else if (item && parcelMode) {
        if (!bag.add(item)) hud.say(at.name, BAG_LINES.full);
        else {
          economy.cash -= item.price;
          showMoney();
          sound.coin();
          hud.say(at.name, BAG_LINES.parcel.replace('{item}', item.name).replace('{price}', String(item.price)));
          openMenu(at); // the bag count
          saveNow();
        }
      } else if (item) {
        economy.cash -= item.price;
        showMoney();
        closeMenu();
        hud.say(at.name, `${item.name} ready! ₹${item.price}`);
        if (melee.stickOut) melee.toggleStick();
        meal.start(at, item);
      }
    }
    // Supermarket: shelves -> basket -> counter. Walking out with unpaid items = theft.
    const store = markets.storeAt(player.position);
    if (inStore && !store && basket.length && !meal.busy) {
      hud.say(CASHIER, SHOPLIFT_LINE);
      wanted.report('theft');
      energy.eat(basket.reduce((sum, it) => sum + it.energy, 0)); // scoffed on the run
      basket = [];
    }
    if (store && !inStore && free) hud.say(CASHIER, CASHIER_HELLO);
    inStore = store;
    const shelf = store && onFootFree ? markets.shelfAt(store, player.position) : null;
    const counter = !!store && onFootFree && !shelf && markets.atCounter(store, player.position);
    if (shelfOpen && shelfOpen !== shelf) closeMenu();
    if (shelf && input.wasPressed('KeyE')) {
      if (shelfOpen) closeMenu();
      else openShelf(shelf);
    } else if (shelfOpen) {
      const open = shelfOpen;
      const item = open.items.find((_, n) => input.wasPressed(`Digit${n + 1}`));
      if (item && basket.length >= BASKET_MAX) hud.say(CASHIER, BASKET_FULL);
      else if (item) {
        basket.push(item);
        hud.say('Basket', `${item.name} ₹${item.price} (${basket.length}/${BASKET_MAX})`);
        openShelf(open); // refresh the basket line
      }
    }
    if (counter && !bag.owned && input.wasPressed('KeyB')) {
      if (!economy.spend(BAG_PRICE)) hud.say(CASHIER, NO_MONEY);
      else {
        bag.owned = true;
        showMoney();
        hud.say(CASHIER, BAG_LINES.bought);
        saveNow();
      }
    }
    if (counter && basket.length && input.wasPressed('KeyE') && bag.owned) {
      // With a bag: it all goes in (what doesn't fit, you eat now).
      const total = basketTotal();
      if (economy.cash < total) hud.say(CASHIER, NO_MONEY);
      else {
        economy.cash -= total;
        showMoney();
        const packed = basket.filter((it) => bag.add(it)).length;
        const rest = basket.slice(packed);
        hud.say(CASHIER, rest.length ? BAG_LINES.fullEat : BAG_LINES.packed.replace('{n}', String(packed)));
        if (rest.length) {
          if (melee.stickOut) melee.toggleStick();
          meal.start(SHOP_EATERY, { name: rest.map((it) => it.name).join(' + '), price: 0, energy: rest.reduce((n, it) => n + it.energy, 0), seconds: Math.min(12, rest.reduce((n, it) => n + it.seconds, 0)), color: rest[0].color });
        }
        basket = [];
        saveNow();
      }
    } else if (counter && basket.length && input.wasPressed('KeyE')) {
      const total = basketTotal();
      if (economy.cash < total) hud.say(CASHIER, NO_MONEY);
      else {
        economy.cash -= total;
        showMoney();
        hud.say(CASHIER, CASHIER_THANKS);
        if (melee.stickOut) melee.toggleStick();
        meal.start(SHOP_EATERY, {
          name: basket.map((it) => it.name).join(' + '),
          price: total,
          energy: basket.reduce((sum, it) => sum + it.energy, 0),
          seconds: Math.min(12, basket.reduce((sum, it) => sum + it.seconds, 0)),
          color: basket[0].color,
        });
        basket = [];
      }
    }
    // The bag: B opens it (on foot, nothing else open); 1-6 eats that item standing.
    if (bagOpen) {
      if (!onFootFree || input.wasPressed('KeyB') || input.wasPressed('KeyE')) closeMenu();
      else {
        const i = bag.items.findIndex((_, n) => input.wasPressed(`Digit${n + 1}`));
        if (i >= 0) {
          const it = bag.take(i)!;
          closeMenu();
          if (melee.stickOut) melee.toggleStick();
          meal.start(SHOP_EATERY, it);
          saveNow();
        }
      }
    } else if (onFootFree && bag.owned && !menuFor && !shelfOpen && !serviceOpen && !counter && input.wasPressed('KeyB')) openBag();
    // Places: E opens the service menu (on foot, or stopped in the auto for petrol / repairs).
    const autoStopped = ((ride.driving && Math.abs(auto.speed) < 1) || pushing) && free;
    const ownStopped = !!ownedNow() && Math.abs(traffic.speedOf(stolen!)) < 1 && free;
    const service = onFootFree && !nearAuto && !other && !eatery && !store ? nearService(player.position, false)
      : autoStopped ? nearService(auto.group.position, true)
      : ownStopped ? nearService(stolen!.group.position, true) : null;
    if (serviceOpen && serviceOpen !== service) closeMenu();
    if (service && input.wasPressed('KeyE')) {
      if (serviceOpen) closeMenu();
      else openService(service);
    } else if (serviceOpen) {
      const open = serviceOpen;
      const rows = serviceMenu(open).rows;
      const row = rows.find((_, n) => input.wasPressed(`Digit${n + 1}`));
      if (row && economy.cash < row.price) hud.say(open.name, NO_MONEY);
      else if (row) {
        hud.say(open.name, row.run());
        showMoney();
        sound.coin();
        openService(open); // refresh balances / tank
      }
    }
    // Lighthouse: E at the door takes you up to the gallery, E up there brings you back down.
    // Homes: buy one at its gate (cash first, then the bank), sleep in your own bed.
    const nearPt = (p: THREE.Vector3, r: number) => Math.hypot(player.position.x - p.x, player.position.z - p.z) < r && Math.abs(player.position.y - p.y) < 2;
    const forSale = onFootFree ? homes.homes.findIndex((h, i) => !owned.has(i) && h.price > 0 && nearPt(h.sale, 2)) : -1;
    const myBed = onFootFree ? homes.homes.findIndex((h, i) => owned.has(i) && nearPt(h.bed, 1.4)) : -1;
    if (forSale >= 0 && input.wasPressed('KeyE')) {
      const h = homes.homes[forSale];
      if (!economy.spend(h.price)) hud.say('Owner', HOME_LINES.cantAfford.replace('{price}', h.price.toLocaleString('en-IN')));
      else {
        owned.add(forSale);
        h.setOwned(true);
        showMoney();
        sound.coin();
        phone.addMessage('Owner', HOME_LINES.bought.replace('{area}', h.area));
        saveNow();
      }
    } else if (myBed >= 0 && input.wasPressed('KeyE')) {
      // Sleep: through the night to 6 am, or a 3-hour nap in the day. Full health, a little hungry.
      const now = istTime(dayNight.timeMs).hours;
      const skip = now >= 20 || now < 5 ? ((30 - now) % 24) : 3;
      dayNight.timeMs += skip * 3600 * 1000;
      health = 100;
      energy.spend(skip * 2);
      sleep.rest();
      hud.say('You', skip > 3 ? HOME_LINES.slept : HOME_LINES.napped);
      saveNow();
    }
    const lh = santhome.lighthouse;
    const atLighthouseDoor = onFootFree && Math.hypot(player.position.x - lh.door.x, player.position.z - lh.door.z) < 2.4 && player.position.y < lh.centre.y + 5;
    const onLighthouseTop = onFootFree && player.position.y > lh.centre.y + 20 && Math.hypot(player.position.x - lh.centre.x, player.position.z - lh.centre.z) < 4;
    if ((atLighthouseDoor || onLighthouseTop) && input.wasPressed('KeyE')) {
      if (atLighthouseDoor) {
        player.placeAt(lh.top, -Math.PI / 2); // facing out over the town (west)
        cam.yaw = Math.PI / 2;
      } else {
        player.placeAt(lh.door, Math.PI / 2);
      }
    }
    // Hotels: E at the lobby doors takes you in to the dining hall, E at the hall door brings you back out.
    const near = (p: THREE.Vector3) => Math.hypot(player.position.x - p.x, player.position.z - p.z) < DOOR_RADIUS && Math.abs(player.position.y - p.y) < 3;
    const hotelDoor = onFootFree ? hotels.doors.findIndex((d) => near(d.at)) : -1;
    const hallExit = onFootFree ? halls.halls.findIndex((h) => near(h.exit)) : -1;
    if (hotelDoor >= 0 && input.wasPressed('KeyE')) {
      const h = halls.halls[hotelDoor];
      player.placeAt(h.entry, h.entryYaw);
      cam.yaw = h.entryYaw + Math.PI;
      insideHall = hotelDoor;
    } else if (hallExit >= 0 && input.wasPressed('KeyE')) {
      const d = hotels.doors[hallExit];
      player.placeAt(d.out, d.outYaw);
      cam.yaw = d.outYaw + Math.PI;
      insideHall = -1;
    }
    const talkTo = onFootFree && !nearAuto && !other && !eatery && !store && !service && !atLighthouseDoor && !onLighthouseTop && hotelDoor < 0 && hallExit < 0 ? crowd.nearest : null;
    const stolenSpeed = stolen ? traffic.speedOf(stolen) : 0;
    if (free && input.wasPressed('KeyF')) {
      if (stolen) {
        if (Math.abs(stolenSpeed) < 3) leaveVehicle();
      } else if (nearAuto) ride.enter();
      else if (ride.canExit) ride.exit();
      else if (other) takeVehicle(other);
    }
    // Pushing uncle's auto (empty tank): G beside it; W/S push / pull, A/D steer, G to let go.
    if (pushing) pushT += dt;
    const pushGap = pushing ? Math.hypot(player.position.x - auto.group.localToWorld(pushAt.copy(PUSH_SPOT)).x, player.position.z - pushAt.z) : 0;
    if (pushing && (!onFootFree || (pushT > 3 && pushGap > PUSH_LOSE) || input.wasPressed('KeyG'))) stopPush();
    else if (!pushing && nearAuto && input.wasPressed('KeyG')) {
      pushing = true;
      pushT = 0;
      auto.push = true;
      if (melee.stickOut) melee.toggleStick();
    }
    // (meal.busy: the same key press may have just ordered food from a menu this frame)
    if (onFootFree && !meal.busy && !menuFor && !shelfOpen && !serviceOpen && !bagOpen && input.wasPressed('Digit1')) melee.toggleStick();
    if (onFootFree && input.wasPressed('Mouse0')) {
      melee.attack(meleeTargets);
      energy.spend(ATTACK_COST);
    }
    if (onFootFree && input.wasPressed('KeyQ')) {
      melee.attack(meleeTargets, 'kick');
      energy.spend(ATTACK_COST);
    }
    player.blocking = onFootFree && input.isDown('Mouse2') && !player.acting;
    // Dealer: E next to a vehicle on show buys it (cash first, then the bank).
    const sale = onFootFree ? dealerStock.find((f) => f.veh?.locked && Math.hypot(f.veh.currPos.x - player.position.x, f.veh.currPos.z - player.position.z) < 3.4) ?? null : null;
    if (sale && sale.veh && input.wasPressed('KeyE')) {
      const { s, veh } = sale;
      if (!economy.spend(s.price)) hud.say(DEALER, GARAGE_LINES.cantAfford.replace('{price}', s.price.toLocaleString('en-IN')));
      else {
        veh.locked = false;
        mine.push({ stock: s.id, veh, upkeep: ownUpkeep(s.kind) });
        ownPlates(veh);
        sale.veh = null;
        showMoney();
        sound.coin();
        const line = GARAGE_LINES.bought.replace('{name}', s.name);
        hud.say(DEALER, line);
        phone.addMessage(DEALER, line);
        saveNow();
      }
    }
    // Story quest: E for its prompt comes first.
    const questE = !!quests.prompt && free && input.wasPressed('KeyE') && quests.interact(questCtx());
    if (talkTo && !questE && input.wasPressed('KeyE')) {
      const p = talkTo.root.position;
      player.talk(Math.atan2(p.x - player.position.x, p.z - player.position.z), 4.5);
      hud.say(talkTo.name, talkTo.talk());
    }
    const otherName = other ? VEHICLE_NAMES[other.kind] : '';
    hud.setPrompt(
      !free ? null
        : quests.prompt && player.onFoot && !stolen ? quests.prompt
        : sale ? `E - Buy the ${sale.s.name}: ₹${sale.s.price.toLocaleString('en-IN')}`
        : stolen ? (Math.abs(stolenSpeed) < 3 ? 'F - Get out' : null)
        : pushing ? 'W/S - Push · A/D - Steer · G - Let go · F - Get in'
        : nearAuto ? (upkeep.fuel <= 0 ? 'F - Get in · G - Push the auto (no petrol)' : 'F - Get in · G - Push')
        : service && !serviceOpen ? `E - ${service.name}`
        : ride.canExit ? 'F - Get out'
        : other ? (other.driver ? `F - Steal the ${otherName} (police will come!)` : `F - Get in the ${otherName}`)
        : shelf ? (shelfOpen ? null : `E - ${shelf.name} (basket ${basket.length}/${BASKET_MAX})`)
        : counter ? `${basket.length ? `E - Pay ₹${basketTotal()}${bag.owned ? ' (into the bag)' : ''}` : 'Cashier: pick something from the shelves first'}${bag.owned ? '' : ` · B - Buy a cloth bag ₹${BAG_PRICE}`}`
        : store && basket.length && !meal.busy ? `Basket: ${basket.length} item(s), ₹${basketTotal()} - pay at the counter`
        : forSale >= 0 ? `E - Buy this house in ${homes.homes[forSale].area} (₹${homes.homes[forSale].price.toLocaleString('en-IN')})`
        : myBed >= 0 ? 'E - Sleep'
        : hotelDoor >= 0 ? `E - Enter ${hotels.doors[hotelDoor].hotel} (${hotels.doors[hotelDoor].name})`
        : hallExit >= 0 ? `E - Leave ${hotels.doors[hallExit].name}`
        : atLighthouseDoor ? 'E - Go up the lighthouse'
        : onLighthouseTop ? 'E - Go back down'
        : eatery ? (menuFor ? null : `E - Saapdalaam: ${eatery.name} (${eatery.menu.kind === 'hotel' ? 'hotel' : 'snacks'})`)
        : meal.phase === 'eat' || meal.phase === 'snack' ? 'W/A/S/D - Stop eating'
        : talkTo ? `E - Talk to ${talkTo.name}` : null,
    );

    // --- Simulation: input once per frame, physics in fixed steps
    if (pushing) {
      const k = free ? input : NO_INPUT;
      const hands = pushGap < 0.9; // only moves once you're at the back with your hands on it
      auto.control(hands ? Number(k.isDown('KeyW')) - Number(k.isDown('KeyS')) : 0, hands ? Number(k.isDown('KeyA')) - Number(k.isDown('KeyD')) : 0, false);
      player.walkTo(auto.group.localToWorld(pushAt.copy(PUSH_SPOT)));
      player.pose = { clip: 'push', yaw: auto.heading, clipSpeed: PUSH_CLIP_SPEED };
    }
    player.handleInput(free ? input : NO_INPUT, cam.yaw);
    ride.update(dt, free ? input : NO_INPUT);
    meal.update(dt, free ? input : NO_INPUT);
    if (stolen) {
      const k = free ? input : NO_INPUT;
      traffic.control(stolen, Number(k.isDown('KeyW')) - Number(k.isDown('KeyS')), Number(k.isDown('KeyA')) - Number(k.isDown('KeyD')), k.isDown('Space'));
    }
    if (input.wasPressed('KeyP')) phone.toggle();
    if (input.wasPressed('KeyR')) weather.cycleOverride();
    // Traffic stops for the player and the player's auto (and honks at them).
    traffic.update(dt, [
      { x: auto.group.position.x, z: auto.group.position.z, honk: !player.onFoot, player: ride.driving, vx: auto.body.linvel().x, vz: auto.body.linvel().z },
      ...(player.onFoot ? [{ x: player.position.x, z: player.position.z, honk: true }] : []),
    ]);
    accumulator = Math.min(accumulator + dt, PHYSICS_STEP * MAX_STEPS);
    while (accumulator >= PHYSICS_STEP) {
      player.step(PHYSICS_STEP);
      auto.update(PHYSICS_STEP);
      traffic.step(PHYSICS_STEP);
      police.step();
      const yoursVel = stolen ? stolen.body.linvel() : ride.driving ? auto.body.linvel() : null; // before the bounce
      world.step();
      traffic.afterStep(world, [auto.collider, player.collider, ...police.jeepColliders, ...(stolen ? [stolen.collider] : [])], stolen ? stolen.collider : ride.driving ? auto.collider : null, yoursVel);
      police.afterStep(PHYSICS_STEP);
      // Ramming the police jeep is an attack on the police.
      const ram = stolen ? stolen.collider : !player.onFoot ? auto.collider : null;
      if (ram && wanted.level > 0) for (const jc of police.jeepColliders) world.contactPair(ram, jc, () => wanted.report('assaultPolice'));
      player.capture();
      auto.capture();
      // Uncle's auto: petrol burns with distance; a sudden loss of speed is a crash.
      const autoSpeed = Math.abs(auto.speed);
      if (ride.driving) {
        upkeep.drive(autoSpeed * PHYSICS_STEP);
        const dmg = crashCooldown > 0 ? 0 : upkeep.crash(lastAutoSpeed - autoSpeed);
        if (dmg > 0 && crashCooldown <= 0) {
          crashCooldown = 1;
          sound.hit('kick');
          cam.shake(0.08);
          hud.say('Auto', upkeep.condition < 15 ? PLACE_LINES.wrecked : PLACE_LINES.crash.replace('{cond}', String(Math.round(upkeep.condition))));
        }
      }
      lastAutoSpeed = autoSpeed;
      // Your own other vehicles: petrol by distance, dents from sudden stops.
      const own = ownedNow();
      if (own) {
        const v = Math.abs(traffic.speedOf(own.veh));
        own.upkeep.drive(v * PHYSICS_STEP);
        const dmg = crashCooldown > 0 ? 0 : own.upkeep.crash(lastOwnSpeed - v);
        if (dmg > 0) dented(own.upkeep);
        lastOwnSpeed = v;
      }
      accumulator -= PHYSICS_STEP;
    }
    const alpha = accumulator / PHYSICS_STEP; // how far we are into the next physics step
    player.sync(dt, alpha);
    auto.sync(dayNight.night, alpha);
    traffic.sync(dt, alpha, dayNight.night, camera.position);
    police.sync(dt, alpha);
    // Melee: who the fist / foot / lathi tip touched this frame.
    const struck = melee.update(dt, meleeTargets);
    if (struck) {
      let crime = false;
      let copHit = false;
      for (const ref of struck.hits) {
        if (ref instanceof Npc) {
          const line = ref.struck(struck.move, BEATEN);
          if (line) hud.say(ref.name, line);
          crime = true;
        } else {
          police.hitOfficer(ref, struck.move, player.position);
          copHit = true;
        }
      }
      if (copHit) wanted.report('assaultPolice'); // one blow = one crime, however many it hit
      if (crime) wanted.report('assault');
      hitStop = HIT_STOP[struck.move];
      sound.hit(struck.move);
      cam.shake(struck.move === 'punch' ? 0.05 : 0.09);
    }
    if (stolen) poseRider(player.model, player.model, stolen.group, RIDER_POSE[stolen.kind]); // seat, bars / wheel, pegs / pedals
    ride.lateUpdate(); // pin the driver's hips after the animation has posed them
    meal.lateUpdate(); // seated hips + hand-to-mouth
    jobs.inStolen = !!stolen && !mine.some((m) => m.veh === stolen);
    jobs.update(dt, jobs.autoCarrier ? ride.driving : !!stolen && stolen.group === jobs.carrier.group);
    ride.syncPosition();
    if (stolen) {
      player.position.copy(stolen.group.position);
      player.position.y += 1;
      cam.update(dt, stolen.group.position, traffic.headingOf(stolen));
      const own = ownedNow();
      hud.setSpeed(Math.abs(stolenSpeed) * 3.6, own ? `⛽ ${own.upkeep.fuel.toFixed(1)} L · 🔧 ${Math.round(own.upkeep.condition)}%` : undefined);
    } else if (ride.driving) {
      cam.update(dt, auto.group.position, auto.heading);
      hud.setSpeed(Math.abs(auto.speed) * 3.6, `⛽ ${upkeep.fuel.toFixed(1)} L · 🔧 ${Math.round(upkeep.condition)}%`);
    } else {
      cam.update(dt, player.position);
    }

    weather.update(dt, camera.position);
    dayNight.rain = weather.rain;
    dayNight.cloud = weather.cloud;
    ground.setWet(weather.rain);
    ground.update(dt);
    dayNight.update(dt, input.isDown('KeyT'), player.position);
    scene.environmentIntensity = ENV_NIGHT + (ENV_DAY - ENV_NIGHT) * (1 - dayNight.night);
    renderer.toneMappingExposure = EXPOSURE_DAY + (EXPOSURE_NIGHT - EXPOSURE_DAY) * dayNight.night; // eyes adjust at night
    // New IST day: settle the moneylender's daily amount.
    const today = Math.floor(istTime(dayNight.timeMs).day);
    const settled = economy.tickDay(today);
    // Rent (Chapter 2 on, until you own a home).
    if (story.chapter >= 2 && homesBought() === 0 && !rent.active) {
      rent.start(today);
      phone.addMessage(LANDLORD, RENT_LINES.start.replace('{rent}', RENT.toLocaleString('en-IN')));
    }
    if (rent.active && homesBought() > 0) {
      rent.stop();
      if (!owned.has(0)) {
        owned.add(0);
        homes.homes[0].setOwned(true);
      }
      phone.addMessage(LANDLORD, RENT_LINES.ended);
    }
    // Anna Travels (Chapter 3): the drivers' takings each new day go to the bank.
    if (story.chapter >= 3) fleet.open(today);
    const fleetDay = fleet.tick(today);
    if (fleetDay && fleetDay.lines.length) {
      if (fleetDay.income >= 0) economy.savings += fleetDay.income;
      else economy.charge(-fleetDay.income);
      showMoney();
      phone.addMessage(SESHADRI, [FLEET_LINES.report.replace('{income}', `₹${fleetDay.income.toLocaleString('en-IN')}`), ...fleetDay.lines].join('\n'));
      saveNow();
    }
    const rentEv = rent.tick(today);
    if (rentEv) {
      const msg = RENT_LINES[rentEv].replace('{rent}', RENT.toLocaleString('en-IN')).replace('{owed}', rent.owed.toLocaleString('en-IN'));
      phone.addMessage(LANDLORD, msg);
      if (rentEv !== 'reminder') hud.say(LANDLORD, msg);
      if (rentEv === 'evicted') {
        owned.delete(0);
        homes.homes[0].setOwned(false);
      }
    }
    if (settled === 'missed') phone.addMessage(LENDER, MSG_MISSED[Math.min(economy.missedDays, MSG_MISSED.length) - 1]);
    if (economy.seized && auto.group.visible) {
      seizeAuto();
      const msg = MSG_SEIZED.replace('{cost}', economy.redeemCost.toLocaleString('en-IN'));
      phone.addMessage(LENDER, msg);
      hud.say(LENDER, msg);
    }
    town.setNight(dayNight.night);
    props.setNight(dayNight.night);
    temple.setNight(dayNight.night);
    const inAuto = !player.onFoot;
    markets.update(dt, player.position);
    camera.getWorldDirection(viewDir).setY(0).normalize();
    traffic.recycle(dt, player.position, viewDir, istTime(dayNight.timeMs).hours);
    crowd.update(dt, player.position, stolen ? Math.abs(stolenSpeed) : inAuto ? Math.abs(auto.speed) : player.speed, inAuto, istTime(dayNight.timeMs).hours, viewDir);

    // Police: chase, arrest, shoot. Wanted level fades when they lose you.
    const vehicleCollider = stolen ? stolen.collider : !player.onFoot ? auto.collider : null;
    const pev = police.update(dt, {
      search: wanted.level > 0 ? { x: wanted.cx, z: wanted.cz } : null,
      player: player.position,
      playerSpeed: stolen ? Math.abs(stolenSpeed) : vehicleCollider ? Math.abs(auto.speed) : player.speed,
      vehicle: vehicleCollider,
      level: downFor > 0 ? 0 : wanted.level,
      camera: camera.position,
      cameraDir: camera.getWorldDirection(camDir),
      blocking: player.blocking,
    });
    if (pev.arresting) hud.setPrompt('🚓 Kai-ya thooku! Run, or be arrested');
    // Getting away: out of the search circle (centred where the police last had you) = they give up.
    const me = stolen ? stolen.group.position : ride.driving ? auto.group.position : player.position;
    const copDist = police.blips().reduce((d, b) => Math.min(d, Math.hypot(b.x - me.x, b.z - me.z)), Infinity);
    if (wanted.level > lastStars) wanted.seenAt(me.x, me.z); // new stars: the search starts here
    if (wanted.update(dt, me.x, me.z, copDist)) hud.say(POLICE, ESCAPED_LINE);
    lastStars = wanted.level;
    if (pev.officerHit) wanted.report('assaultPolice');
    if (stolen && wanted.level === 1) {
      stolenFor += dt;
      if (stolenFor > KEEP_STOLEN_SECONDS) {
        wanted.report('keepStolen');
        hud.say(POLICE, MSG_ESCALATE);
      }
    }
    const hurt = pev.damage + crowd.damageToPlayer * (player.blocking ? 0.3 : 1);
    if (hurt > 0 && downFor <= 0) {
      health -= hurt;
      hud.hurt();
      // Flinch (Mixamo Hit Reaction), but not so often that gunfire stun-locks you.
      if (hurt > 2 && health > 0 && player.onFoot && !player.acting && !meal.busy && hitReactCooldown <= 0) {
        player.forceAction('hit_react', 0.45, undefined, 1.6);
        hitReactCooldown = HIT_REACT_COOLDOWN;
      }
    }
    hitReactCooldown -= dt;
    if (wanted.level === 0 && energy.value > 0) health = Math.min(100, health + 4 * dt); // no healing on an empty stomach
    const starving = energy.value <= 0;
    if (downFor <= 0 && (health <= 0 || pev.busted)) knockOut(pev.busted && health > 0 ? 'busted' : starving ? 'starved' : 'shot');
    if (downFor > 0) {
      downFor -= dt;
      if (downFor <= 0) release();
    }
    hud.setStatus(health, wanted.level);

    // ---- Santhome, signals, floods, sound --------------------------------------------------
    santhome.update(dt);
    santhome.setNight(dayNight.night);
    mandaveli.update(dt);
    mandaveli.setNight(dayNight.night);
    posters.setNight(dayNight.night);
    hospital.setNight(dayNight.night);
    signals.update(dt);
    flood.update(dt, weather.rain);
    jobs.fareBoost = (weather.rain > 0.5 ? RAIN_SURCHARGE : 1) * (jobs.autoCarrier ? fareFactor(upgrades) : 1); // upgrades are the auto's
    jobs.bumpDecel = jobs.autoCarrier ? bumpDecel(upgrades) : 3.5;
    const drivingAny = ride.driving || !!stolen;
    const vPos = stolen ? stolen.group.position : ride.driving ? auto.group.position : player.position;
    const vSpeed = stolen ? Math.abs(stolenSpeed) : ride.driving ? Math.abs(auto.speed) : player.speed;
    // Story quests: a sudden loss of speed while driving = a hard knock (fragile cargo minds).
    quests.update(dt, questCtx(drivingAny && lastVSpeed - vSpeed > JOLT_DROP));
    lastVSpeed = drivingAny ? vSpeed : 0;
    auto.speedLimit = flood.slowAt(auto.group.position.x, auto.group.position.z) * upkeep.speedFactor;
    // Your own other vehicles: battered = slower; empty tank = a crawl to the nearest bunk.
    const ownCar = ownedNow();
    if (ownCar) {
      const u = ownCar.upkeep;
      ownCar.veh.limit = u.fuel <= 0 ? 0.15 : u.speedFactor;
      if (u.fuel < u.tank * 0.1 && !ownFuelWarned) {
        ownFuelWarned = true;
        hud.say('Vandi', u.fuel <= 0 ? CRASH_LINES.noFuel : CRASH_LINES.lowFuel);
      }
      if (u.fuel >= u.tank * 0.1) ownFuelWarned = false;
    }
    crashCooldown -= dt;
    if (ride.driving && upkeep.fuel < 1 && !fuelWarned) {
      fuelWarned = true;
      hud.say('Auto', upkeep.fuel <= 0 ? PLACE_LINES.noFuel : PLACE_LINES.lowFuel);
    }
    if (upkeep.fuel >= 1) fuelWarned = false;
    places.update(dt);
    places.setNight(dayNight.night);
    hubs.setNight(dayNight.night);
    showrooms.setNight(dayNight.night);
    brandStores.setNight(dayNight.night);
    hotels.setNight(dayNight.night);
    halls.setNight(dayNight.night);
    beachfront.setNight(dayNight.night);
    homes.setNight(dayNight.night);
    tnagar.setNight(dayNight.night);
    landmarks.setNight(dayNight.night);
    tidel.setNight(dayNight.night);
    gated.setNight(dayNight.night);
    guindy.setNight(dayNight.night);
    koyambedu.setNight(dayNight.night);
    cafes.setNight(dayNight.night);
    besant.setNight(dayNight.night);
    const istHour = istTime(dayNight.timeMs).hours;
    beachLife.update(dt, istHour, dayNight.night);
    guindy.update(dt, istHour, vPos);
    // Races at Guindy: a phone alert when they start, ride orders from the gate when they end.
    const raceOn = guindy.racing(istHour);
    if (raceOn && !raceWasOn) phone.notify(PLACE_LINES.raceDay);
    if (!raceOn && raceWasOn && jobs.phase !== 'off') {
      jobs.addOrderFrom(RACE_COURSE);
      jobs.addOrderFrom(RACE_COURSE);
      jobs.addOrderFrom(RACE_COURSE);
      phone.notify(PLACE_LINES.raceOver);
    }
    raceWasOn = raceOn;
    const stageOn = beachLife.stageOn(istHour);
    if (stageOn && !stageWasOn) phone.notify(PLACE_LINES.musicNight);
    stageWasOn = stageOn;
    chepauk.update(istHour, dayNight.night);
    const matchOn = chepauk.matchOn(istHour);
    if (matchOn && !matchWasOn) phone.notify(PLACE_LINES.matchNight);
    if (!matchOn && matchWasOn && jobs.phase !== 'off') {
      jobs.addOrderFrom(STADIUM);
      jobs.addOrderFrom(STADIUM);
      jobs.addOrderFrom(STADIUM);
      phone.notify(PLACE_LINES.matchOver);
    }
    matchWasOn = matchOn;
    // A show lets out at the cinema: a couple of ride orders from there.
    const hour = Math.floor(istTime(dayNight.timeMs).hours);
    if (hour !== lastShowHour) {
      if (lastShowHour >= 0 && SHOW_ENDS.includes(hour) && jobs.phase !== 'off') {
        jobs.addOrderFrom(CINEMA);
        jobs.addOrderFrom(CINEMA);
        phone.notify(PLACE_LINES.showOver);
      }
      if (lastShowHour >= 0 && TIDEL_RUSH.includes(hour) && jobs.phase !== 'off') {
        jobs.addOrderFrom(TIDEL);
        jobs.addOrderFrom(TIDEL);
        phone.notify(PLACE_LINES.tidelRush);
      }
      if (lastShowHour >= 0 && CMBT_ARRIVALS.includes(hour) && jobs.phase !== 'off') {
        jobs.addOrderFrom(CMBT);
        jobs.addOrderFrom(CMBT);
        phone.notify(PLACE_LINES.cmbtArrivals);
      }
      if (lastShowHour >= 0 && MARKET_RUSH.includes(hour) && jobs.phase !== 'off') {
        jobs.addOrderFrom(KOYAMBEDU_MARKET);
        jobs.addOrderFrom(KOYAMBEDU_MARKET);
        phone.notify(PLACE_LINES.marketRush);
      }
      if (lastShowHour >= 0 && ESTATE_RUSH.includes(hour) && jobs.phase !== 'off') {
        jobs.addOrderFrom(ESTATE);
        jobs.addOrderFrom(ESTATE);
        phone.notify(PLACE_LINES.estateRush);
      }
      if (lastShowHour >= 0 && COLLEGE_RUSH.includes(hour) && jobs.phase !== 'off') {
        jobs.addOrderFrom(COLLEGE);
        jobs.addOrderFrom(COLLEGE);
        phone.notify(PLACE_LINES.collegeRush);
      }
      lastShowHour = hour;
    }
    player.speedScale = flood.slowAt(player.position.x, player.position.z) * (sleep.tired ? DROWSY_SLOW : 1) * (recoverFor > 0 && downFor <= 0 ? RECOVER_SLOW : 1);
    const wet = flood.depthAt(vPos.x, vPos.z) > 0.05;
    if (wet && !wasWet && vSpeed > 2) sound.splash();
    wasWet = wet;
    // Jumping a red: you were at the stop line on red, moving, and then entered the junction.
    if (drivingAny && downFor <= 0) {
      const yaw = stolen ? traffic.headingOf(stolen) : auto.heading;
      const sig = signals.ahead(vPos.x, vPos.z, Math.sin(yaw), Math.cos(yaw), 6);
      if (sig && sig.light === 'red' && sig.distToStop < 3 && vSpeed > 2) redLatch = 1.5;
      redLatch -= dt;
      const j = signals.inJunction(vPos.x, vPos.z);
      if (j >= 0 && redLatch > 0 && !finedAt.has(j)) {
        finedAt.add(j);
        const { owed } = economy.charge(SIGNAL_FINE);
        showMoney();
        const msg = MSG_SIGNAL_JUMP.replace('{fine}', String(SIGNAL_FINE)) + (owed > 0 ? ` (₹${owed} kadan-la)` : '');
        hud.say(TRAFFIC_POLICE, msg);
        phone.addMessage(TRAFFIC_POLICE, msg);
        jobs.redLight();
      }
      if (j < 0 && redLatch <= 0) finedAt.clear();
    }
    sound.update(dt, {
      inVehicle: drivingAny,
      vehicleKind: stolen ? soundKind(stolen.kind) : ride.driving ? 'auto' : null,
      speed: drivingAny ? vSpeed : 0,
      throttle: drivingAny ? Number(input.isDown('KeyW')) - Number(input.isDown('KeyS')) : 0,
      footSpeed: drivingAny || !player.onFoot ? 0 : player.speed,
      nearTemple: Math.max(0, 1 - Math.hypot(player.position.x, player.position.z) / 45),
      nearSea: THREE.MathUtils.clamp(1 - (SEA_X - vPos.x) / 70, 0, 1),
      rain: weather.rain,
      night: dayNight.night,
    });
    if (input.wasPressed('KeyM')) sound.setMuted(!sound.muted);

    // Horn (H) and headlights (L; they also come on by themselves at dusk and go off at dawn).
    const isNight = dayNight.night > 0.5;
    if (isNight !== wasNight) lightsOn = isNight;
    wasNight = isNight;
    if (drivingAny && input.wasPressed('KeyL')) lightsOn = !lightsOn;
    if (drivingAny && free && input.wasPressed('KeyH')) {
      sound.horn(stolen ? soundKind(stolen.kind) : 'auto');
      let near: (typeof crowd.npcs)[number] | null = null;
      let nearD = HORN_HEARD;
      for (const n of crowd.npcs) {
        const d = n.root.position.distanceTo(vPos);
        if (d < nearD) {
          near = n;
          nearD = d;
        }
      }
      const line = near && Math.random() < 0.5 ? near.scold(HORN_LINES) : null;
      if (near && line) hud.say(near.name, line);
    }
    const lit = drivingAny && lightsOn;
    headlight.intensity = lit ? HEADLIGHT.intensity : 0;
    if (lit) {
      const g = stolen ? stolen.group : auto.group;
      const front = stolen ? SPEC[stolen.kind].length / 2 : 1.3;
      g.localToWorld(headlight.position.set(0, 1.0, front));
      g.localToWorld(headlight.target.position.set(0, 0, front + 14));
    }

    // Energy: drains with activity, refills while eating; at zero, health goes.
    const activity: Activity = ride.driving || stolen ? 'drive' : player.speed > 4 ? 'run' : player.speed > 0.3 ? 'walk' : 'idle';
    const wasLow = energy.low;
    const wasTired = energy.tired;
    if (downFor <= 0) health -= energy.update(dt, activity);
    energy.eat(meal.energyRate * dt);
    if (energy.low && !wasLow) hud.say('Vayiru', HUNGRY_LINE);
    if (energy.tired && !wasTired) hud.say('Vayiru', TIRED_LINE);
    // Sleep: hours awake tick with the game clock (not while down / in the hospital).
    if (downFor <= 0) {
      const sev = sleep.add((dt * TIME_SCALE) / 3600);
      if (sev === 'tired') {
        hud.say('Kann', SLEEPY_LINE);
        phone.addMessage('Auto Anna', SLEEPY_LINE);
      }
      if (sev === 'collapse') knockOut('sleep');
    }
    if (sleep.tired) energy.spend(dt * DROWSY_DRAIN);
    if (recoverFor > 0 && downFor <= 0) {
      if (recoverFor === RECOVER_SECONDS) hud.say('You', RECOVER_LINE);
      recoverFor = Math.max(0, recoverFor - dt);
    }
    player.canRun = !energy.tired && !sleep.tired && recoverFor <= 0;
    hud.setEnergy(energy.value, energy.low);
    if (input.wasPressed('F3')) debug.toggle();
    if (economy.seized) hud.setMission(MISSION_SEIZED.replace('{cost}', economy.redeemCost.toLocaleString('en-IN')));
    else if (quests.active && !jobs.busy) hud.setMission(quests.mission);
    else if (jobs.phase !== 'off') {
      hud.setMission(jobs.rides === 0 ? `${jobs.mission}  ·  W/S drive, A/D steer, Space brake` : jobs.mission);
    }
    const pp = player.position;
    guideAge += dt;
    if (guideAge > 0.25) {
      guideAge = 0;
      const from = stolen ? stolen.group.position : player.onFoot ? player.position : auto.group.position;
      if (nav && Math.hypot(nav.x - from.x, nav.z - from.z) < ARRIVE_M) {
        phone.notify(`📍 Vandhaachu! ${nav.name}`);
        nav = null;
      }
      const t = nav ?? (quests.active && !jobs.busy ? quests.target : jobs.target);
      guide = t ? route({ x: from.x, z: from.z }, t, X_LINES, Z_LINES) : null;
      navLeft = guide ? routeLength(guide) : 0;
      const turn = guide ? nextTurn(guide) : null;
      navInfo = null;
      if (turn && t) {
        const name = nav ? nav.name : 'kind' in t && t.kind === 'pickup' ? 'Pickup' : 'Drop-off';
        const road = turn.next ? roadName(turn.at, turn.next) : undefined;
        const mins = Math.max(1, Math.round(navLeft / (player.onFoot ? 1.8 : 9) / 60));
        navInfo = {
          arrow: turn.kind === 'left' ? '↰' : turn.kind === 'right' ? '↱' : '📍',
          dist: fmtDist(turn.dist),
          line: turn.kind === 'arrive' ? `${name}${turn.side ? ` on your ${turn.side}` : ''}` : `Turn ${turn.kind}${road ? ` onto ${road}` : ''}`,
          sub: `${fmtDist(navLeft)} · ~${mins} min${nav ? '' : ` · ${quests.active && !jobs.busy ? quests.mission : jobs.mission}`}`,
        };
      }
      hud.setNav(navInfo);
    }
    // Inside a dining hall (off the map), the maps show you at the hotel.
    insideHall = player.position.z < HALL_ZONE ? halls.halls.reduce((best, h, i) => (Math.abs(h.entry.x - pp.x) < Math.abs(halls.halls[best].entry.x - pp.x) ? i : best), 0) : -1;
    const mapAt = insideHall >= 0 ? hotels.doors[insideHall].at : pp;
    // Story rides: from Chapter 2, one at a time on the phone while you're online.
    storyRideIn -= dt;
    // Rides need the ride app online (you're in the auto); quests start wherever you are.
    if (story.chapter >= 2 && storyRideIn <= 0 && !jobs.storyOpen && !quests.active && downFor <= 0) {
      storyRideIn = 30;
      const next = nextStory(storyDone, istTime(dayNight.timeMs).hours, story.chapter);
      if (next && 'ride' in next && jobs.phase !== 'off') jobs.addStory(next.ride);
      // Your first warehouse load waits until you've leased the warehouse.
      if (next && 'quest' in next && !(['firstload', 'staffbus'].includes(next.quest.id) && !fleet.warehouse)) {
        if (next.quest.id === 'staffbus') giveCompanyBus();
        quests.start(next.quest);
        phone.notify(next.quest.offer);
        phone.addMessage('Auto Anna', next.quest.offer);
      }
    }
    // Story: once a second, see if this chapter is finished; the next one opens with its card.
    storyCheck -= dt;
    if (storyCheck <= 0) {
      storyCheck = 1;
      const next = story.update(storyState());
      if (next) {
        hud.chapterCard(next.n, next.title, next.ta, next.blurb);
        storyCheck = 10; // never two cards on top of each other
        for (const [from, line] of STORY_LINES[next.n] ?? []) phone.addMessage(from, line);
        saveNow();
      }
    }
    phone.update(performance.now());
    minimap.update(performance.now(), {
      player: { x: mapAt.x, z: mapAt.z, yaw: ride.driving ? auto.heading : stolen ? traffic.headingOf(stolen) : player.mesh.rotation.y },
      view: cam.yaw,
      auto: auto.group.position,
      marker: quests.active && !jobs.busy ? quests.target : jobs.target,
      guide,
      police: police.blips(),
      search: wanted.level > 0 ? { x: wanted.cx, z: wanted.cz, r: wanted.radius } : null,
      dest: nav,
    });
    bigMap.update(dt, input, {
      player: { x: mapAt.x, z: mapAt.z, yaw: ride.driving ? auto.heading : stolen ? traffic.headingOf(stolen) : player.mesh.rotation.y },
      auto: auto.group.visible ? auto.group.position : null,
      marker: quests.active && !jobs.busy ? quests.target : jobs.target,
      guide,
      police: police.blips(),
      search: wanted.level > 0 ? { x: wanted.cx, z: wanted.cz, r: wanted.radius } : null,
      dest: nav,
      destLeft: navLeft,
    });

    renderer.render(scene, camera);

    quality.sample(frameMs);
    const p = player.position;
    debug.update(frameMs, performance.now() - t0, renderer, {
      quality: quality.label(),
      time: dayNight.clockLabel,
      position: `${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`,
      npcs: `${crowd.activeCount}/${crowd.npcs.length} animated`,
      auto: `${(auto.speed * 3.6).toFixed(0)} km/h, ${ride.phase}`,
    });
    input.endFrame();
  });
}

main().catch((err) => {
  console.error(err);
  loadingScreen.fail('Could not load the game. Check the console (F12) and reload.');
});
