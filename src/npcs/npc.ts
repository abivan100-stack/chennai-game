import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Animator } from '../characters/animator';
import { CHARACTER_HEIGHT, type CharacterAsset } from '../characters/catalog';
import { BUMPED, GREETINGS, nextLine } from './dialogue';

// Movement
const SPEED = { walk: 1.3, run: 3.4 }; // m/s; roughly matches the Quaternius cycles at 1x
const TURN_RATE = 6;
const ARRIVE_DIST = 0.2;
const PAUSE_CHANCE = 0.35; // at each corner, a walker may stop for a while
const PAUSE_SECONDS = [2, 5];
const FIDGET_SECONDS = [4, 9]; // standing NPCs swap idle pose / glance around this often
const GLANCE_RADIANS = 0.6;
const BLOCK_DIST = 1.4; // a walker waits if the player stands this close in front of it

// Reactions to the player
const LOOK_RADIUS = 3; // standing NPCs turn to watch the player
const GREET_RADIUS = 4.5;
const GREET_CHANCE = 0.5;
const GREET_COOLDOWN = 30;
const TALK_SECONDS = 4;
const BUMP_SECONDS = 1.2;
const BUMP_COOLDOWN = 3;

// Collider (kinematic capsule, for a 1.7 m NPC; scaled with height)
const RADIUS = 0.3;
const HALF_HEIGHT = 0.55;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export interface NpcOptions {
  name: string; // shown when they talk
  position: THREE.Vector3;
  heading?: number; // radians, 0 = facing +z
  height?: number; // metres
  tint?: THREE.ColorRepresentation; // multiplies the material colour (variants of one model)
  map?: THREE.Texture; // swap the colour texture
  path?: THREE.Vector3[]; // looping waypoints; omit to stand
  pace?: 'walk' | 'run';
}

/**
 * Background pedestrian. A SkeletonUtils clone of a shared model (geometry + clips shared).
 * Walkers loop a path, pause at corners and wait for the player; standers fidget, watch the
 * player and sometimes wave. Talk (E) and bumping interrupt either for a few seconds.
 */
export class Npc {
  readonly name: string;
  readonly root = new THREE.Group();
  private readonly animator: Animator;
  private readonly body: RAPIER.RigidBody;
  private readonly colliderLift: number;
  private readonly path: THREE.Vector3[] | undefined;
  private readonly moveClip: 'walk' | 'run';
  private readonly speed: number;
  private readonly homeYaw: number;
  private yaw: number; // where the NPC wants to face
  private target = 0;
  private busy = 0; // talking / reacting
  private pause = 0;
  private fidget = rand(FIDGET_SECONDS[0], FIDGET_SECONDS[1]);
  private greetCooldown = 0;
  private bumpCooldown = 0;
  private lineIndex = Math.floor(Math.random() * GREETINGS.length);
  private readonly toPlayer = new THREE.Vector3();

  constructor(scene: THREE.Scene, world: RAPIER.World, asset: CharacterAsset, opts: NpcOptions) {
    this.name = opts.name;
    const body = cloneSkinned(asset.scene);
    if (opts.tint !== undefined || opts.map) {
      body.traverse((o) => {
        if (!(o instanceof THREE.Mesh)) return;
        const mat = (o.material as THREE.MeshStandardMaterial).clone(); // same shader, no extra compile
        if (opts.tint !== undefined) mat.color.set(opts.tint);
        if (opts.map) mat.map = opts.map;
        o.material = mat;
      });
    }
    const scale = (opts.height ?? CHARACTER_HEIGHT) / CHARACTER_HEIGHT;
    this.root.add(body);
    this.root.scale.setScalar(scale);
    this.root.position.copy(opts.position);
    this.homeYaw = this.yaw = this.root.rotation.y = opts.heading ?? 0;
    scene.add(this.root);

    this.path = opts.path;
    this.moveClip = opts.pace ?? 'walk';
    this.speed = SPEED[this.moveClip] * rand(0.9, 1.1);

    // Kinematic capsule: blocks the player; ignored by the camera (see FollowCamera).
    this.colliderLift = (HALF_HEIGHT + RADIUS) * scale;
    const p = this.root.position;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y + this.colliderLift, p.z),
    );
    world.createCollider(RAPIER.ColliderDesc.capsule(HALF_HEIGHT * scale, RADIUS * scale), this.body);

    this.animator = new Animator(body, asset.clips);
    this.animator.play(this.path ? this.moveClip : 'idle', { fade: 0 });
    this.animator.setSpeed(this.speed / SPEED[this.moveClip]);
    this.animator.randomizePhase();
  }

  /** Free to start a conversation (not mid-reaction). */
  get canTalk() {
    return this.busy <= 0;
  }

  /** Player pressed E: face them, wave, return a line. */
  talk() {
    this.react('wave', TALK_SECONDS);
    this.greetCooldown = GREET_COOLDOWN;
    return nextLine(GREETINGS, this.lineIndex++);
  }

  /** Player ran into us. Returns a complaint, or null if we complained recently. */
  bump() {
    if (this.bumpCooldown > 0) return null;
    this.bumpCooldown = BUMP_COOLDOWN;
    this.react('hit', BUMP_SECONDS);
    return nextLine(BUMPED, Math.floor(Math.random() * BUMPED.length));
  }

  /** active = false freezes the NPC completely (pose, position, collider) to save CPU. */
  update(dt: number, active: boolean, playerPos: THREE.Vector3) {
    if (!active) return;
    this.greetCooldown -= dt;
    this.bumpCooldown -= dt;
    this.toPlayer.subVectors(playerPos, this.root.position).setY(0);
    const playerDist = this.toPlayer.length();
    const playerYaw = Math.atan2(this.toPlayer.x, this.toPlayer.z);

    if (this.busy > 0) {
      this.yaw = playerYaw;
      this.busy -= dt;
      if (this.busy <= 0) this.resume();
    } else if (this.path) {
      this.updateWalker(dt, playerDist, playerYaw);
    } else {
      this.updateStander(dt, playerDist, playerYaw);
    }

    this.root.rotation.y += angleDelta(this.root.rotation.y, this.yaw) * (1 - Math.exp(-TURN_RATE * dt));
    this.animator.update(dt);
    const p = this.root.position;
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + this.colliderLift, z: p.z });
  }

  private updateWalker(dt: number, playerDist: number, playerYaw: number) {
    if (this.pause > 0) {
      this.pause -= dt;
      this.animator.play('idle');
      return;
    }
    // Player standing in front of us: wait instead of walking into them.
    if (playerDist < BLOCK_DIST && Math.abs(angleDelta(this.root.rotation.y, playerYaw)) < 0.8) {
      this.animator.play('idle');
      return;
    }
    this.animator.play(this.moveClip);
    this.animator.setSpeed(this.speed / SPEED[this.moveClip]);

    const pos = this.root.position;
    const goal = this.path![this.target];
    const dx = goal.x - pos.x;
    const dz = goal.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < ARRIVE_DIST) {
      this.target = (this.target + 1) % this.path!.length;
      if (Math.random() < PAUSE_CHANCE) this.pause = rand(PAUSE_SECONDS[0], PAUSE_SECONDS[1]);
      return;
    }
    const step = Math.min(dist, this.speed * dt);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    this.yaw = Math.atan2(dx, dz);
  }

  private updateStander(dt: number, playerDist: number, playerYaw: number) {
    this.fidget -= dt;
    if (this.fidget <= 0) {
      this.fidget = rand(FIDGET_SECONDS[0], FIDGET_SECONDS[1]);
      this.animator.play(Math.random() < 0.5 ? 'idle' : 'idle2', { fade: 0.5 });
      this.yaw = this.homeYaw + rand(-GLANCE_RADIANS, GLANCE_RADIANS);
    }
    if (playerDist < GREET_RADIUS && this.greetCooldown <= 0) {
      this.greetCooldown = GREET_COOLDOWN;
      if (Math.random() < GREET_CHANCE) this.react('wave', 2);
    }
    if (playerDist < LOOK_RADIUS) this.yaw = playerYaw;
  }

  /** Play a one-shot gesture facing the player, then hold idle until `seconds` pass. */
  private react(clip: string, seconds: number) {
    this.busy = seconds;
    this.pause = 0;
    this.animator.play(clip, { once: true, then: 'idle', fade: 0.15 });
    this.animator.setSpeed(1);
  }

  private resume() {
    this.yaw = this.path ? this.yaw : this.homeYaw;
    this.animator.play(this.path ? this.moveClip : 'idle');
  }
}
