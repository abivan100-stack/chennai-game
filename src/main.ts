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
import { SIDEWALK_HEIGHT } from './world/layout';
import { createProps } from './world/props';
import { DayNight } from './world/sky';
import { createTemple } from './world/temple';
import { TaxiJobs } from './missions/jobs';
import { Minimap } from './ui/minimap';
import { drawTownMap } from './ui/mapArt';
import { Phone } from './ui/phone';
import { Economy } from './missions/economy';
import { LENDER, MSG_FINE_ON_LOAN, MSG_LENDER_HELLO, MSG_MISSED, MSG_PAID, MSG_PAID_OFF, MSG_WELCOME, MSG_WELCOME_BACK, UNCLE } from './missions/data';
import { clearSave, loadSave, writeSave } from './core/save';
import { Sound } from './audio/sound';
import { applyChennaiLook } from './characters/chennaiLook';
import { createSanthome } from './world/santhome';
import { createTrafficLights } from './world/trafficLights';
import { createFlood } from './world/flood';
import { MISSION_SEIZED, MSG_REDEEMED, MSG_SEIZED, MSG_SIGNAL_JUMP, RAIN_SURCHARGE, SIGNAL_FINE, TRAFFIC_POLICE } from './missions/data';
import { Weather } from './world/weather';
import { Traffic } from './vehicles/traffic';
import { istTime } from './world/solar';
import { route } from './missions/route';
import { Police } from './combat/police';
import { Melee, type Target } from './combat/melee';
import { KEEP_STOLEN_SECONDS, Wanted } from './combat/wanted';
import { createPoliceStation } from './world/policeStation';
import { DRIVER_SEAT, SPEC, VEHICLE_NAMES, type Vehicle } from './vehicles/traffic';
import { BEATEN } from './npcs/dialogue';
import { BUSTED_SUB, BUSTED_TITLE, HUNGRY_LINE, MSG_ESCALATE, MSG_THEFT_WARNING, POLICE, STARVED_SUB, STARVED_TITLE, TIRED_LINE, WASTED_SUB, WASTED_TITLE } from './missions/data';
import { ATTACK_COST, Energy, type Activity } from './player/energy';
import { Meal } from './player/meal';
import { createEateries, type Eatery } from './world/eateries';
import { BASKET_FULL, BASKET_MAX, CASHIER, CASHIER_HELLO, CASHIER_THANKS, MEAL_DONE, NO_MONEY, SHOPLIFT_LINE, type FoodItem, type Shelf } from './world/food';
import { createSupermarkets, type Store } from './world/supermarket';
import { SEA_X, X_LINES, Z_LINES } from './world/layout';

const ENTER_RADIUS = 3; // metres from the auto to show "F - Get in"
const PHYSICS_STEP = 1 / 60; // fixed step: vehicle physics needs it
const AUTOSAVE_MS = 10_000;
const ENV_DAY = 0.35; // environment (reflection) light by day...
const ENV_NIGHT = 0.06; // ...and at night
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
  const traffic = new Traffic(scene, world, characters.npcs);
  traffic.onSay = (name, line) => hud.say(name, line);
  const station = createPoliceStation(scene, world);
  const police = new Police(scene, world, characters.npcs.get('man-casual')!, station.jeepSpot, -Math.PI / 2);
  police.onSay = (line) => hud.say('Police', line);
  const wanted = new Wanted();
  const economy = new Economy();
  const temple = createTemple(scene, world);
  const dayNight = new DayNight(scene);
  const crowd = new Crowd(scene, world, characters.npcs);
  const eateries = createEateries(scene, world, town.footprints);
  const markets = createSupermarkets(scene, world, characters.npcs.get('woman-formal')!);
  const santhome = createSanthome(scene, world);
  const signals = createTrafficLights(scene, world);
  traffic.signals = (x, z, dx, dz, look) => signals.ahead(x, z, dx, dz, look);
  const flood = createFlood(scene);
  traffic.slowAt = (x, z) => flood.slowAt(x, z);
  const sound = new Sound();
  const energy = new Energy();
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
  const auto = new AutoRickshaw(scene, world, autoSpot, saved ? saved.auto.heading : Math.PI);
  const ride = new Ride(player, auto);
  const melee = new Melee(player);
  const heroHips = player.model.getObjectByName('Hips')!;
  let health = 100;
  if (saved) {
    economy.restore({ ...saved.economy, seized: saved.economy.seized ?? false }); // older saves had no "seized"
    energy.value = saved.energy;
    health = saved.health;
    dayNight.timeMs = saved.gameMs;
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
    k === 'bus' ? 'bus' : k === 'lorry' || k === 'tempo' ? 'truck' : k === 'bike' ? 'bike' : k === 'scooter' ? 'scooter' : k === 'auto' ? 'auto' : 'car';
  // Bike / scooter riders sit astride: knees swung out around the tank (world-space turn of each thigh).
  const up = new THREE.Vector3(0, 1, 0);
  const legQ = new THREE.Quaternion();
  const parentQ = new THREE.Quaternion();
  const parentInv = new THREE.Quaternion();
  const thighs = [player.model.getObjectByName('LeftUpLeg')!, player.model.getObjectByName('RightUpLeg')!];
  const straddle = (angle: number) => {
    thighs.forEach((bone, i) => {
      legQ.setFromAxisAngle(up, i === 0 ? angle : -angle); // left thigh to +x (its side), right to -x
      bone.parent!.getWorldQuaternion(parentQ);
      parentInv.copy(parentQ).invert();
      bone.quaternion.premultiply(parentInv.multiply(legQ).multiply(parentQ));
    });
  };
  const meal = new Meal(player, scene);
  meal.onBite = () => sound.eat();
  meal.onDone = (finished) => {
    if (finished) hud.say('Neenga', MEAL_DONE);
  };
  let menuFor: Eatery | null = null;
  const openMenu = (e: Eatery) => {
    menuFor = e;
    hud.menu({
      title: e.name,
      greet: e.menu.greet,
      rows: e.menu.items.map((it) => ({ label: it.name, price: it.price, energy: it.energy, affordable: economy.cash >= it.price })),
    });
  };
  const closeMenu = () => {
    menuFor = null;
    shelfOpen = null;
    hud.menu(null);
  };
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
  const pinHips = (vehicle: THREE.Object3D, seat: THREE.Vector3) => {
    const m = player.model;
    m.rotation.set(0, 0, 0);
    vehicle.updateMatrixWorld();
    m.updateMatrixWorld(true);
    const local = vehicle.worldToLocal(heroHips.getWorldPosition(new THREE.Vector3()));
    m.position.add(seat.clone().sub(local));
  };
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
  const showMoney = () => hud.setWallet(economy.cash, economy.loan);
  const phone = new Phone({
    jobs,
    economy,
    weather,
    town: townMap,
    police: () => police.blips(),
    clock: () => dayNight.clockLabel,
    player: () => ({ x: player.position.x, z: player.position.z, yaw: ride.driving ? auto.heading : player.mesh.rotation.y }),
    auto: () => auto.group.position,
    guide: () => guide,
    newGame: () => newGame(),
    redeem: () => redeemAuto(),
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
    if (!jobs.busy) phone.notify(`🛺 New order: ${o.from.name} → ${o.to.name} · ₹${o.fare}`);
  };
  let online = false;
  // Road route from the auto (or the player on foot) to the job target; refreshed a few times a second.
  let guide: { x: number; z: number }[] | null = null;
  let guideAge = 0;
  ride.onDrivingChange = (driving) => {
    sound.door();
    cam.mode = driving ? 'drive' : 'foot';
    cam.ignore = driving ? auto.collider : player.collider;
    hud.setSpeed(driving ? 0 : null);
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
  if (import.meta.env.DEV) Object.assign(window, { game: { world, player, cam, auto, ride, jobs, phone, economy, weather, traffic, police, wanted, melee, quality, dayNight, crowd, energy, meal, eateries, markets, santhome, signals, flood, sound, save: () => saveNow(), getHealth: () => health, setHealth: (h: number) => (health = h) } });

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
    hud.setSpeed(0);
    if (theft) {
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
  let hitReactCooldown = 0;
  if (economy.seized) seizeAuto(); // loaded a save where it had been taken
  /** Arrested or shot down: fine, then released outside the station. */
  const knockOut = (cause: 'busted' | 'shot' | 'starved') => {
    const fine = cause === 'busted' ? 500 * Math.max(1, wanted.level) : 300;
    const { owed } = economy.charge(fine); // short of cash: Kandasamy pays the rest and adds it to the kadan
    showMoney();
    const [title, sub] = cause === 'busted' ? [BUSTED_TITLE, BUSTED_SUB] : cause === 'shot' ? [WASTED_TITLE, WASTED_SUB] : [STARVED_TITLE, STARVED_SUB];
    const onLoan = owed > 0 ? ` Kaasu pathala: ₹${owed} kadan-la serthaachu.` : '';
    hud.banner(title, sub.replace('{fine}', String(fine)) + onLoan);
    if (owed > 0) phone.addMessage(LENDER, MSG_FINE_ON_LOAN.replace('{owed}', owed.toLocaleString('en-IN')).replace('{loan}', economy.loan.toLocaleString('en-IN')));
    meal.forceStop();
    closeMenu();
    basket = [];
    downFor = 3.5;
    // On foot: kneel for the arrest, or fall flat when shot / fainting (Mixamo clips).
    fallen = player.onFoot && !stolen && ride.phase === 'onFoot';
    if (fallen) player.forceAction(cause === 'busted' ? 'kneel' : 'death', 3.6, cause === 'busted' ? 'kneel_idle' : undefined);
  };
  const release = () => {
    if (fallen) player.animator.play('idle', { fade: 0.3 }); // back on your feet
    fallen = false;
    hud.banner(null);
    leaveVehicle();
    ride.forceOut();
    player.placeAt(station.releaseSpot, 0);
    wanted.clear();
    police.reset();
    health = 100;
    energy.value = Math.max(energy.value, 60); // fed at the hospital
  };

  showMoney();
  phone.addMessage(UNCLE, saved ? MSG_WELCOME_BACK : MSG_WELCOME);

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
      health: Math.max(1, health),
      player: { x: p.x, y: p.y, z: p.z, yaw },
      auto: { x: a.x, y: a.y, z: a.z, heading: auto.heading },
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
    const free = downFor <= 0;
    const onFootFree = free && player.onFoot && ride.phase === 'onFoot' && !stolen && !meal.busy;
    const nearAuto = onFootFree && auto.group.visible && auto.isNear(player.position, ENTER_RADIUS);
    const other = onFootFree && !nearAuto ? traffic.enterable(player.position) : null;
    // Hotels / shops: E opens the menu (not while the police are after you).
    const eatery = onFootFree && !nearAuto && !other && wanted.level === 0 ? eateries.nearest(player.position) : null;
    if (menuFor && menuFor !== eatery) closeMenu();
    if (eatery && input.wasPressed('KeyE')) {
      if (menuFor) closeMenu();
      else openMenu(eatery);
    } else if (menuFor) {
      const at = menuFor;
      const i = at.menu.items.findIndex((_, n) => input.wasPressed(`Digit${n + 1}`));
      const item = at.menu.items[i];
      if (item && economy.cash < item.price) hud.say(at.name, NO_MONEY);
      else if (item) {
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
    if (counter && basket.length && input.wasPressed('KeyE')) {
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
    const talkTo = onFootFree && !nearAuto && !other && !eatery && !store ? crowd.nearest : null;
    const stolenSpeed = stolen ? traffic.speedOf(stolen) : 0;
    if (free && input.wasPressed('KeyF')) {
      if (stolen) {
        if (Math.abs(stolenSpeed) < 3) leaveVehicle();
      } else if (nearAuto) ride.enter();
      else if (ride.canExit) ride.exit();
      else if (other) takeVehicle(other);
    }
    // (meal.busy: the same key press may have just ordered food from a menu this frame)
    if (onFootFree && !meal.busy && !menuFor && !shelfOpen && input.wasPressed('Digit1')) melee.toggleStick();
    if (onFootFree && input.wasPressed('Mouse0')) {
      melee.attack(meleeTargets);
      energy.spend(ATTACK_COST);
    }
    if (onFootFree && input.wasPressed('KeyQ')) {
      melee.attack(meleeTargets, 'kick');
      energy.spend(ATTACK_COST);
    }
    player.blocking = onFootFree && input.isDown('Mouse2') && !player.acting;
    if (talkTo && input.wasPressed('KeyE')) {
      const p = talkTo.root.position;
      player.talk(Math.atan2(p.x - player.position.x, p.z - player.position.z), 4.5);
      hud.say(talkTo.name, talkTo.talk());
    }
    const otherName = other ? VEHICLE_NAMES[other.kind] : '';
    hud.setPrompt(
      !free ? null
        : stolen ? (Math.abs(stolenSpeed) < 3 ? 'F - Get out' : null)
        : nearAuto ? 'F - Get in'
        : ride.canExit ? 'F - Get out'
        : other ? (other.driver ? `F - Steal the ${otherName} (police will come!)` : `F - Get in the ${otherName}`)
        : shelf ? (shelfOpen ? null : `E - ${shelf.name} (basket ${basket.length}/${BASKET_MAX})`)
        : counter ? (basket.length ? `E - Pay ₹${basketTotal()} at the counter` : 'Cashier: pick something from the shelves first')
        : store && basket.length && !meal.busy ? `Basket: ${basket.length} item(s), ₹${basketTotal()} - pay at the counter`
        : eatery ? (menuFor ? null : `E - Saapdalaam: ${eatery.name} (${eatery.menu.kind === 'hotel' ? 'hotel' : 'snacks'})`)
        : meal.phase === 'eat' || meal.phase === 'snack' ? 'W/A/S/D - Stop eating'
        : talkTo ? `E - Talk to ${talkTo.name}` : null,
    );

    // --- Simulation: input once per frame, physics in fixed steps
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
      { x: auto.group.position.x, z: auto.group.position.z, honk: !player.onFoot },
      ...(player.onFoot ? [{ x: player.position.x, z: player.position.z, honk: true }] : []),
    ]);
    accumulator = Math.min(accumulator + dt, PHYSICS_STEP * MAX_STEPS);
    while (accumulator >= PHYSICS_STEP) {
      player.step(PHYSICS_STEP);
      auto.update(PHYSICS_STEP);
      traffic.step(PHYSICS_STEP);
      police.step();
      world.step();
      traffic.afterStep(world, [auto.collider, player.collider, ...police.jeepColliders, ...(stolen ? [stolen.collider] : [])]);
      police.afterStep(PHYSICS_STEP);
      // Ramming the police jeep is an attack on the police.
      const ram = stolen ? stolen.collider : !player.onFoot ? auto.collider : null;
      if (ram && wanted.level > 0) for (const jc of police.jeepColliders) world.contactPair(ram, jc, () => wanted.report('assaultPolice'));
      player.capture();
      auto.capture();
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
    if (stolen) pinHips(stolen.group, DRIVER_SEAT[stolen.kind]);
    if (stolen && (stolen.kind === 'bike' || stolen.kind === 'scooter')) straddle(stolen.kind === 'bike' ? 0.32 : 0.12);
    ride.lateUpdate(); // pin the driver's hips after the animation has posed them
    meal.lateUpdate(); // seated hips + hand-to-mouth
    jobs.update(dt, ride.driving);
    ride.syncPosition();
    if (stolen) {
      player.position.copy(stolen.group.position);
      player.position.y += 1;
      cam.update(dt, stolen.group.position, traffic.headingOf(stolen));
      hud.setSpeed(Math.abs(stolenSpeed) * 3.6);
    } else if (ride.driving) {
      cam.update(dt, auto.group.position, auto.heading);
      hud.setSpeed(Math.abs(auto.speed) * 3.6);
    } else {
      cam.update(dt, player.position);
    }

    weather.update(dt, camera.position);
    dayNight.rain = weather.rain;
    dayNight.cloud = weather.cloud;
    ground.setWet(weather.rain);
    dayNight.update(dt, input.isDown('KeyT'), player.position);
    scene.environmentIntensity = ENV_NIGHT + (ENV_DAY - ENV_NIGHT) * (1 - dayNight.night);
    // New IST day: settle the moneylender's daily amount.
    const settled = economy.tickDay(Math.floor(istTime(dayNight.timeMs).day));
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
    crowd.update(dt, player.position, stolen ? Math.abs(stolenSpeed) : inAuto ? Math.abs(auto.speed) : player.speed, inAuto);

    // Police: chase, arrest, shoot. Wanted level fades when they lose you.
    const vehicleCollider = stolen ? stolen.collider : !player.onFoot ? auto.collider : null;
    const pev = police.update(dt, {
      player: player.position,
      playerSpeed: stolen ? Math.abs(stolenSpeed) : vehicleCollider ? Math.abs(auto.speed) : player.speed,
      vehicle: vehicleCollider,
      level: downFor > 0 ? 0 : wanted.level,
      camera: camera.position,
      cameraDir: camera.getWorldDirection(camDir),
      blocking: player.blocking,
    });
    if (pev.arresting) hud.setPrompt('🚓 Kai-ya thooku! Run, or be arrested');
    wanted.update(dt, pev.seen);
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
    signals.update(dt);
    flood.update(dt, weather.rain);
    jobs.fareBoost = weather.rain > 0.5 ? RAIN_SURCHARGE : 1;
    const drivingAny = ride.driving || !!stolen;
    const vPos = stolen ? stolen.group.position : ride.driving ? auto.group.position : player.position;
    const vSpeed = stolen ? Math.abs(stolenSpeed) : ride.driving ? Math.abs(auto.speed) : player.speed;
    auto.speedLimit = flood.slowAt(auto.group.position.x, auto.group.position.z);
    player.speedScale = flood.slowAt(player.position.x, player.position.z);
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

    // Energy: drains with activity, refills while eating; at zero, health goes.
    const activity: Activity = ride.driving || stolen ? 'drive' : player.speed > 4 ? 'run' : player.speed > 0.3 ? 'walk' : 'idle';
    const wasLow = energy.low;
    const wasTired = energy.tired;
    if (downFor <= 0) health -= energy.update(dt, activity);
    energy.eat(meal.energyRate * dt);
    if (energy.low && !wasLow) hud.say('Vayiru', HUNGRY_LINE);
    if (energy.tired && !wasTired) hud.say('Vayiru', TIRED_LINE);
    player.canRun = !energy.tired;
    hud.setEnergy(energy.value, energy.low);
    if (input.wasPressed('F3')) debug.toggle();
    if (economy.seized) hud.setMission(MISSION_SEIZED.replace('{cost}', economy.redeemCost.toLocaleString('en-IN')));
    else if (jobs.phase !== 'off') {
      hud.setMission(jobs.rides === 0 ? `${jobs.mission}  ·  W/S drive, A/D steer, Space brake` : jobs.mission);
    }
    const pp = player.position;
    guideAge += dt;
    if (guideAge > 0.25) {
      guideAge = 0;
      const t = jobs.target;
      const from = player.onFoot ? player.position : auto.group.position;
      guide = t ? route({ x: from.x, z: from.z }, t, X_LINES, Z_LINES) : null;
    }
    phone.update(performance.now());
    minimap.update(performance.now(), {
      player: { x: pp.x, z: pp.z, yaw: ride.driving ? auto.heading : stolen ? stolen.group.rotation.y : player.mesh.rotation.y },
      view: cam.yaw,
      auto: auto.group.position,
      marker: jobs.target,
      guide,
      police: police.blips(),
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
