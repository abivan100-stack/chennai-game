import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { enablePointerLock, input } from './core/input';
import { startLoop } from './core/loop';
import { QualityManager, SHADOW_MAP_SIZES } from './core/quality';
import { createRenderer, setRenderScale } from './core/renderer';
import { FollowCamera } from './player/camera';
import { PlayerController } from './player/controller';
import { DebugPanel } from './ui/debug';
import { hud } from './ui/hud';
import { AutoRickshaw } from './vehicles/auto';
import { createBuildings } from './world/buildings';
import { createGround } from './world/ground';
import { DayNight } from './world/sky';

const ENTER_RADIUS = 3; // metres from the auto to show "F - Get in"

async function main() {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
  const { renderer, scene, camera } = createRenderer();

  // World
  createGround(scene, world);
  const buildingCount = createBuildings(scene, world);
  const dayNight = new DayNight(scene);

  // Player + camera
  const player = new PlayerController(world, scene, new THREE.Vector3(0, 1, 6));
  const cam = new FollowCamera(camera, world, player.collider);
  enablePointerLock(renderer.domElement, (locked) => hud.showPlayHint(!locked));

  // Uncle's auto, parked at the roadside just ahead of the spawn.
  const auto = new AutoRickshaw(scene, world, new THREE.Vector3(3.2, 0, -2), Math.PI);

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
  if (import.meta.env.DEV) Object.assign(window, { game: { world, player, cam, auto, quality, dayNight } });

  hud.setWallet(0);
  hud.setMission("Find your uncle's auto");
  console.log(`[world] ${buildingCount} buildings`);

  startLoop((dt, frameMs) => {
    const mouse = input.consumeMouse();
    cam.rotate(mouse.x, mouse.y);

    player.update(dt, input, cam.yaw);
    world.timestep = dt;
    world.step();
    player.sync(dt);
    cam.update(dt, player.position);

    dayNight.update(dt, input.isDown('KeyT'), player.position);

    const nearAuto = auto.isNear(player.position, ENTER_RADIUS);
    hud.setPrompt(nearAuto ? 'F - Get in' : null);
    if (nearAuto && input.wasPressed('KeyF')) console.log('entered auto');
    if (input.wasPressed('F3')) debug.toggle();

    renderer.render(scene, camera);

    quality.sample(frameMs);
    debug.update(frameMs, renderer, quality.label(), dayNight.clockLabel, player.position);
    input.endFrame();
  });
}

main();
