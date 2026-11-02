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
  const traffic = new Traffic(scene, world);
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
    clock: () => dayNight.clockLabel,
    player: () => ({ x: player.position.x, z: player.position.z, yaw: ride.driving ? auto.heading : player.mesh.rotation.y }),
    auto: () => auto.group.position,
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
  if (import.meta.env.DEV) Object.assign(window, { game: { world, player, cam, auto, ride, jobs, phone, economy, weather, traffic, quality, dayNight, crowd } });

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

    // --- Interactions (F: auto, E: talk)
    const nearAuto = ride.phase === 'onFoot' && auto.isNear(player.position, ENTER_RADIUS);
    const talkTo = player.onFoot && !nearAuto && ride.phase === 'onFoot' ? crowd.nearest : null;
    if (input.wasPressed('KeyF')) {
      if (nearAuto) ride.enter();
      else if (ride.canExit) ride.exit();
    }
    if (talkTo && input.wasPressed('KeyE')) {
      const p = talkTo.root.position;
      player.talk(Math.atan2(p.x - player.position.x, p.z - player.position.z), 4.5);
      hud.say(talkTo.name, talkTo.talk());
    }
    hud.setPrompt(nearAuto ? 'F - Get in' : ride.canExit ? 'F - Get out' : talkTo ? `E - Talk to ${talkTo.name}` : null);

    // --- Simulation: input once per frame, physics in fixed steps
    player.handleInput(input, cam.yaw);
    ride.update(dt, input);
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
      world.step();
      player.capture();
      auto.capture();
      accumulator -= PHYSICS_STEP;
    }
    const alpha = accumulator / PHYSICS_STEP; // how far we are into the next physics step
    player.sync(dt, alpha);
    auto.sync(dayNight.night, alpha);
    ride.lateUpdate(); // pin the driver's hips after the animation has posed them
    jobs.update(dt, ride.driving);
    ride.syncPosition();
    if (ride.driving) {
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
    crowd.update(dt, player.position, inAuto ? Math.abs(auto.speed) : player.speed, inAuto);
    if (input.wasPressed('F3')) debug.toggle();
    if (jobs.phase !== 'off') {
      hud.setMission(jobs.rides === 0 ? `${jobs.mission}  ·  W/S drive, A/D steer, Space brake` : jobs.mission);
    }
    const pp = player.position;
    phone.update(performance.now());
    minimap.update(performance.now(), { x: pp.x, z: pp.z, yaw: ride.driving ? auto.heading : player.mesh.rotation.y }, auto.group.position, jobs.target);

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
