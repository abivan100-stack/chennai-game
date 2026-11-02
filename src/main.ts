import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { loadCharacters } from './characters/catalog';
import { loadingManager } from './core/assets';
import { enablePointerLock, input } from './core/input';
import { startLoop } from './core/loop';
import { QualityManager, SHADOW_MAP_SIZES } from './core/quality';
import { createRenderer, setRenderScale } from './core/renderer';
import { Crowd } from './npcs/crowd';
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
import { LENDER, MSG_LENDER_HELLO, MSG_MISSED, MSG_PAID, MSG_PAID_OFF, MSG_WELCOME, UNCLE } from './missions/data';
import { Weather } from './world/weather';
import { Traffic } from './vehicles/traffic';
import { istTime } from './world/solar';
import { route } from './missions/route';
import { Police } from './combat/police';
import { MOVES, Melee, type Move } from './combat/melee';
import { KEEP_STOLEN_SECONDS, Wanted } from './combat/wanted';
import { createPoliceStation } from './world/policeStation';
import { DRIVER_SEAT, SPEC, type Vehicle } from './vehicles/traffic';
import { BEATEN } from './npcs/dialogue';
import { BUSTED_SUB, BUSTED_TITLE, MSG_ESCALATE, MSG_THEFT_WARNING, POLICE, WASTED_SUB, WASTED_TITLE } from './missions/data';
import { ROAD_LINES } from './world/layout';

const ENTER_RADIUS = 3; // metres from the auto to show "F - Get in"
const PHYSICS_STEP = 1 / 60; // fixed step: vehicle physics needs it
const MAX_STEPS = 4; // per frame; beyond this the game slows down instead of spiralling

async function main() {
  loadingManager.onProgress = (_url, loaded, total) => loadingScreen.progress(loaded / total);
  const [, characters] = await Promise.all([RAPIER.init(), loadCharacters()]);
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  world.timestep = PHYSICS_STEP;
  const { renderer, scene, camera } = createRenderer();

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
  crowd.onSay = (name, line) => hud.say(name, line);

  // Start outside the temple's main gopuram on East Mada Street; uncle's auto at the kerb,
  // facing north in the left lane.
  const spawn = new THREE.Vector3(25 - 6.2, SIDEWALK_HEIGHT + CAPSULE_LIFT + 0.05, 7);
  const autoSpot = new THREE.Vector3(25 - 4.2, 0, -4); // tight to the kerb so traffic can pass
  const player = new PlayerController(world, scene, spawn, characters.hero);
  const auto = new AutoRickshaw(scene, world, autoSpot, Math.PI);
  const ride = new Ride(player, auto);
  const melee = new Melee(player);
  const heroHips = player.model.getObjectByName('Hips')!;
  let health = 100;
  /** A traffic vehicle the player took (null = on foot or in uncle's auto). */
  let stolen: Vehicle | null = null;
  let stolenFor = 0;
  /** Seconds left on the ARRESTED / SUTTUTAANGA screen (controls frozen). */
  let downFor = 0;
  const NO_INPUT = { ...input, isDown: () => false, wasPressed: () => false };
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
  enablePointerLock(renderer.domElement, (locked) => hud.showPlayHint(!locked));

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
  if (import.meta.env.DEV) Object.assign(window, { game: { world, player, cam, auto, ride, jobs, phone, economy, weather, traffic, police, wanted, melee, quality, dayNight, crowd, getHealth: () => health, setHealth: (h: number) => (health = h) } });

  // ---- Crime & punishment ------------------------------------------------------------------
  const takeVehicle = (v: Vehicle) => {
    const theft = traffic.take(v);
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
  /** Arrested or shot down: fine, then released outside the station. */
  const knockOut = (busted: boolean) => {
    const fine = busted ? 500 * Math.max(1, wanted.level) : 300;
    economy.cash = Math.max(0, economy.cash - fine);
    showMoney();
    hud.banner(busted ? BUSTED_TITLE : WASTED_TITLE, (busted ? BUSTED_SUB : WASTED_SUB).replace('{fine}', String(fine)));
    downFor = 3.5;
  };
  const release = () => {
    hud.banner(null);
    leaveVehicle();
    ride.forceOut();
    player.placeAt(station.releaseSpot, 0);
    wanted.clear();
    police.reset();
    health = 100;
  };

  showMoney();
  phone.addMessage(UNCLE, MSG_WELCOME);
  hud.setMission("Find your uncle's auto");
  console.log(`[world] ${town.count} buildings, ${props.lampCount} lamps, ${props.treeCount} trees, ${crowd.npcs.length} NPCs`);

  await renderer.compileAsync(scene, camera); // compile shaders behind the loading screen, not mid-game
  loadingScreen.done();

  let accumulator = 0;
  startLoop((dt, frameMs) => {
    const t0 = performance.now();
    const mouse = input.consumeMouse();
    cam.rotate(mouse.x, mouse.y);

    // --- Interactions (F: auto / any vehicle, E: talk, 1: stick, click: swing)
    const free = downFor <= 0;
    const onFootFree = free && player.onFoot && ride.phase === 'onFoot' && !stolen;
    const nearAuto = onFootFree && auto.isNear(player.position, ENTER_RADIUS);
    const other = onFootFree && !nearAuto ? traffic.enterable(player.position) : null;
    const talkTo = onFootFree && !nearAuto && !other ? crowd.nearest : null;
    const stolenSpeed = stolen ? traffic.speedOf(stolen) : 0;
    if (free && input.wasPressed('KeyF')) {
      if (stolen) {
        if (Math.abs(stolenSpeed) < 3) leaveVehicle();
      } else if (nearAuto) ride.enter();
      else if (ride.canExit) ride.exit();
      else if (other) takeVehicle(other);
    }
    if (onFootFree && input.wasPressed('Digit1')) melee.toggleStick();
    if (onFootFree && input.wasPressed('Mouse0')) melee.attack();
    if (onFootFree && input.wasPressed('KeyQ')) melee.attack('kick');
    player.blocking = onFootFree && input.isDown('Mouse2') && !player.acting;
    if (talkTo && input.wasPressed('KeyE')) {
      const p = talkTo.root.position;
      player.talk(Math.atan2(p.x - player.position.x, p.z - player.position.z), 4.5);
      hud.say(talkTo.name, talkTo.talk());
    }
    const otherName = other ? (other.kind === 'bus' ? 'bus' : other.kind === 'car' ? 'car' : 'auto') : '';
    hud.setPrompt(
      !free ? null
        : stolen ? (Math.abs(stolenSpeed) < 3 ? 'F - Get out' : null)
        : nearAuto ? 'F - Get in'
        : ride.canExit ? 'F - Get out'
        : other ? (other.driver ? `F - Steal the ${otherName} (police will come!)` : `F - Get in the ${otherName}`)
        : talkTo ? `E - Talk to ${talkTo.name}` : null,
    );

    // --- Simulation: input once per frame, physics in fixed steps
    player.handleInput(free ? input : NO_INPUT, cam.yaw);
    ride.update(dt, free ? input : NO_INPUT);
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
    traffic.sync(dt, alpha, dayNight.night);
    police.sync(dt, alpha);
    // Melee: the blow lands mid-animation; anyone in front within reach gets hit.
    const landed: Move | null = melee.update(dt);
    if (landed) {
      const reachM = MOVES[landed].reach;
      const f = new THREE.Vector3(Math.sin(player.mesh.rotation.y), 0, Math.cos(player.mesh.rotation.y));
      const inFront = (p: THREE.Vector3) => {
        const dx = p.x - player.position.x;
        const dz = p.z - player.position.z;
        const d = Math.hypot(dx, dz);
        return d < reachM && (dx * f.x + dz * f.z) / (d || 1) > 0.3;
      };
      let crime = false;
      for (const npc of crowd.npcs) {
        if (!inFront(npc.root.position)) continue;
        const line = npc.struck(landed, BEATEN);
        if (line) hud.say(npc.name, line);
        crime = true;
      }
      for (const o of police.officersNear(player.position, reachM)) {
        police.hitOfficer(o, landed === 'kick');
        wanted.report('assaultPolice');
      }
      if (crime) wanted.report('assault');
    }
    if (stolen) pinHips(stolen.group, DRIVER_SEAT[stolen.kind]);
    ride.lateUpdate(); // pin the driver's hips after the animation has posed them
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
    // New IST day: settle the moneylender's daily amount.
    const settled = economy.tickDay(Math.floor(istTime(dayNight.timeMs).day));
    if (settled === 'missed') phone.addMessage(LENDER, MSG_MISSED[Math.min(economy.missedDays, MSG_MISSED.length) - 1]);
    town.setNight(dayNight.night);
    props.setNight(dayNight.night);
    temple.setNight(dayNight.night);
    const inAuto = !player.onFoot;
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
    }
    if (wanted.level === 0) health = Math.min(100, health + 4 * dt);
    if (downFor <= 0 && (health <= 0 || pev.busted)) knockOut(pev.busted && health > 0);
    if (downFor > 0) {
      downFor -= dt;
      if (downFor <= 0) release();
    }
    hud.setStatus(health, wanted.level);
    if (input.wasPressed('F3')) debug.toggle();
    if (jobs.phase !== 'off') {
      hud.setMission(jobs.rides === 0 ? `${jobs.mission}  ·  W/S drive, A/D steer, Space brake` : jobs.mission);
    }
    const pp = player.position;
    guideAge += dt;
    if (guideAge > 0.25) {
      guideAge = 0;
      const t = jobs.target;
      const from = player.onFoot ? player.position : auto.group.position;
      guide = t ? route({ x: from.x, z: from.z }, t, ROAD_LINES) : null;
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
