import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Animator } from '../characters/animator';
import { CHARACTER_HEIGHT, type CharacterAsset } from '../characters/catalog';
import { GREETINGS, nextLine } from './dialogue';

// Movement
const SIT_DROP = 0.42; // m: lowers a seated NPC so the hips rest on a ~0.45 m seat
const SPEED = { walk: 1.3, run: 3.4 }; // m/s; roughly matches the Quaternius cycles at 1x
const TURN_RATE = 6;
const ARRIVE_DIST = 0.25;
const AVOID_AHEAD = 1.8; // start stepping around the player this far ahead
const AVOID_WIDTH = 0.9;
const AVOID_STRENGTH = 1.1;

// Reactions
const TALK_SECONDS = 4.5;
const SCOLD_SECONDS = 3.2;
// Getting hit
const KNOCKDOWN_SECONDS = 3.5;
const FIGHT_BACK_CHANCE = 0.6; // after the second blow
const COMBO_SECONDS = 4.7; // Mixamo "Fist Fight A", retargeted
const COMBO_HITS = [0.95, 2.23, 3.45]; // s into the combo where punches land
const COMBO_REACH = 1.7;
const COMBO_DAMAGE = 7;
const SCOLD_COOLDOWN = 4;
const KNOCK = { punch: 2.4, swing: 4.5, kick: 7 }; // m/s right after the blow
const KNOCK_DECAY = 8;

// Collider (kinematic capsule, for a 1.7 m NPC; scaled with height)
const RADIUS = 0.3;
const HALF_HEIGHT = 0.55;

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const angleDelta = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export interface NpcOptions {
  name: string; // shown when they talk
  position: THREE.Vector3; // must lie on the path loop
  path: THREE.Vector3[]; // looping waypoints
  pace?: 'walk' | 'run';
  height?: number; // metres
  tint?: THREE.ColorRepresentation; // multiplies the material colour (variants of one model)
  map?: THREE.Texture; // swap the colour texture
  /** Stays put in this pose facing `yaw` (shopkeepers standing at a counter, people sitting on a bench). */
  pose?: { clip: 'idle' | 'sit_idle'; yaw: number };
}

/**
 * Background pedestrian: a SkeletonUtils clone of a shared model (geometry + clips shared).
 * Always on the move along a looping path, stepping around the player. Stops only to talk
 * (E) or to scold someone who ran / drove into them.
 */
export class Npc {
  readonly name: string;
  readonly root = new THREE.Group();
  private readonly animator: Animator;
  private readonly body: RAPIER.RigidBody;
  private readonly colliderLift: number;
  private readonly path: THREE.Vector3[];
  private readonly moveClip: 'walk' | 'run';
  private readonly speed: number;
  private yaw = 0;
  private target = 0;
  private busy = 0; // talking / scolding
  private readonly pose: NpcOptions['pose'];
  private scoldCooldown = 0;
  private hits = 0; // times the player has hit us recently
  private fightT = -1; // seconds into a fight-back combo, -1 = not fighting
  private downT = 0; // knocked down
  private readonly knock = new THREE.Vector3(); // knock-back velocity, decays fast
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
    scene.add(this.root);

    this.path = opts.path;
    this.target = this.closestWaypointAhead();
    this.moveClip = opts.pace ?? 'walk';
    this.speed = SPEED[this.moveClip] * rand(0.9, 1.1);
    const first = this.path[this.target];
    this.yaw = this.root.rotation.y = Math.atan2(first.x - opts.position.x, first.z - opts.position.z);

    // Kinematic capsule: blocks the player and the auto; ignored by the camera.
    this.colliderLift = (HALF_HEIGHT + RADIUS) * scale;
    const p = this.root.position;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(p.x, p.y + this.colliderLift, p.z),
    );
    world.createCollider(RAPIER.ColliderDesc.capsule(HALF_HEIGHT * scale, RADIUS * scale), this.body);

    this.animator = new Animator(body, asset.clips);
    this.pose = opts.pose;
    if (this.pose) {
      this.yaw = this.root.rotation.y = this.pose.yaw;
      this.animator.play(this.pose.clip, { fade: 0 });
      // The seated clip keeps the hips at standing-stool height: drop onto a bench / log seat.
      if (this.pose.clip === 'sit_idle') this.root.position.y -= SIT_DROP * scale;
    } else {
      this.animator.play(this.moveClip, { fade: 0 });
      this.animator.setSpeed(this.speed / SPEED[this.moveClip]);
    }
    this.animator.randomizePhase();
  }

  private meshes: THREE.Mesh[] | null = null;
  private shadow = true;
  /** Only the nearest few cast shadows (each shadow is another draw call). */
  setShadow(on: boolean) {
    if (on === this.shadow) return;
    this.shadow = on;
    if (!this.meshes) {
      this.meshes = [];
      this.root.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) this.meshes!.push(o as THREE.Mesh);
      });
    }
    for (const m of this.meshes) m.castShadow = on;
  }

  /** Off-schedule NPCs leave the world: no collider (they're also hidden and not updated). */
  setPresent(on: boolean) {
    this.body.setEnabled(on);
  }

  /** Free to start a conversation (not mid-reaction). */
  get canTalk() {
    return this.busy <= 0;
  }

  /** Player pressed E: stop, face them, talk. Returns the line. */
  talk() {
    this.busy = TALK_SECONDS;
    this.animator.play('talk', { fade: 0.3 });
    this.animator.setSpeed(1);
    return nextLine(GREETINGS, this.lineIndex++);
  }

  /** Someone ran/drove into us: flinch, then yell. Returns null if we just did. */
  scold(lines: readonly string[]) {
    if (this.scoldCooldown > 0) return null;
    this.scoldCooldown = SCOLD_COOLDOWN;
    this.busy = SCOLD_SECONDS;
    this.animator.play('hit', { once: true, then: 'yell', fade: 0.1 });
    this.animator.setSpeed(1);
    return nextLine(lines, Math.floor(Math.random() * lines.length));
  }

  /** active = false freezes the NPC completely (pose, position, collider) to save CPU. */
  /**
   * Hit by the player. Kick = knocked down. Punch / lathi = flinch and yell; hit again and they
   * may fight back. Returns a line to show, or null.
   */
  struck(move: 'punch' | 'swing' | 'kick', lines: readonly string[]) {
    this.hits++;
    this.fightT = -1;
    const away = this.toPlayer.lengthSq() > 0 ? this.toPlayer.clone().normalize().negate() : new THREE.Vector3();
    if (move === 'kick') {
      this.downT = KNOCKDOWN_SECONDS;
      this.busy = KNOCKDOWN_SECONDS + 0.6;
      this.knock.copy(away).multiplyScalar(KNOCK.kick);
      this.animator.play('fall', { once: true, fade: 0.08 });
      return nextLine(lines, Math.floor(Math.random() * lines.length));
    }
    this.knock.copy(away).multiplyScalar(KNOCK[move]);
    if (this.hits >= 2 && Math.random() < FIGHT_BACK_CHANCE) {
      this.fightT = 0;
      this.busy = COMBO_SECONDS;
      this.animator.play('hit', { once: true, then: 'combo', fade: 0.08 });
      return nextLine(FIGHT_LINES, Math.floor(Math.random() * FIGHT_LINES.length));
    }
    this.scoldCooldown = 0;
    return this.scold(lines);
  }

  /** Damage dealt to the player this frame (when fighting back). */
  update(dt: number, active: boolean, playerPos: THREE.Vector3, drawn = true) {
    if (!active || (this.pose && !drawn)) return 0; // people who stay put and aren't drawn: nothing to do
    this.scoldCooldown -= dt;
    // Slide back from a blow (distance = speed / KNOCK_DECAY).
    this.root.position.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.exp(-KNOCK_DECAY * dt));
    this.toPlayer.subVectors(playerPos, this.root.position).setY(0);
    let damage = 0;
    if (this.fightT >= 0) {
      const before = this.fightT;
      this.fightT += dt;
      for (const t of COMBO_HITS) {
        if (before < t && this.fightT >= t && this.toPlayer.length() < COMBO_REACH) damage += COMBO_DAMAGE;
      }
      // Step in to stay at punching distance.
      const d = this.toPlayer.length();
      if (d > 1.1) this.root.position.addScaledVector(this.toPlayer, Math.min(1, (1.6 * dt) / d));
      if (this.fightT > COMBO_SECONDS) this.fightT = -1;
    }
    if (this.downT > 0) {
      this.downT -= dt;
      if (this.downT <= 0) this.animator.play('idle', { fade: 0.4 }); // back on their feet
      this.animator.update(dt);
      this.busy -= dt;
      const q = this.root.position;
      this.body.setNextKinematicTranslation({ x: q.x, y: q.y + this.colliderLift, z: q.z });
      return damage;
    }
    if (this.busy <= 0 && this.hits > 0) this.hits = Math.max(0, this.hits - dt * 0.1);

    if (this.busy > 0) {
      this.yaw = Math.atan2(this.toPlayer.x, this.toPlayer.z);
      this.busy -= dt;
      if (this.busy <= 0) {
        this.animator.play(this.pose ? this.pose.clip : this.moveClip, { fade: 0.4 });
        this.animator.setSpeed(this.pose ? 1 : this.speed / SPEED[this.moveClip]);
      }
    } else if (this.pose) {
      this.yaw = this.pose.yaw; // back to watching the sea / minding the stall
    } else {
      this.walk(dt);
    }

    this.root.rotation.y += angleDelta(this.root.rotation.y, this.yaw) * (1 - Math.exp(-TURN_RATE * dt));
    if (drawn) this.animator.update(dt);
    const p = this.root.position;
    this.body.setNextKinematicTranslation({ x: p.x, y: p.y + this.colliderLift, z: p.z });
    return damage;
  }

  private walk(dt: number) {
    const pos = this.root.position;
    const goal = this.path[this.target];
    let dx = goal.x - pos.x;
    let dz = goal.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < ARRIVE_DIST) {
      this.target = (this.target + 1) % this.path.length;
      return;
    }
    dx /= dist;
    dz /= dist;
    // Player in the way: veer to the side away from them instead of stopping.
    const ahead = this.toPlayer.x * dx + this.toPlayer.z * dz;
    const lateral = dx * this.toPlayer.z - dz * this.toPlayer.x; // > 0: player on our right
    if (ahead > 0 && ahead < AVOID_AHEAD && Math.abs(lateral) < AVOID_WIDTH) {
      // ponytail: no knowledge of walls; the sidestep is under a metre, so it rarely clips.
      const away = lateral > 0 ? 1 : -1; // +1: step to our left, -1: to our right
      const lx = dz * away; // our left is (dz, -dx)
      const lz = -dx * away;
      dx += lx * AVOID_STRENGTH;
      dz += lz * AVOID_STRENGTH;
      const n = Math.hypot(dx, dz);
      dx /= n;
      dz /= n;
    }
    const step = this.speed * dt;
    pos.x += dx * step;
    pos.z += dz * step;
    this.yaw = Math.atan2(dx, dz);
  }

  /** Index of the waypoint we should head to first (the next corner along the loop). */
  private closestWaypointAhead() {
    const pos = this.root.position;
    let best = 0;
    let bestScore = Infinity;
    this.path.forEach((p, i) => {
      const prev = this.path[(i + this.path.length - 1) % this.path.length];
      // Distance from pos to the segment prev -> p: start there, heading to p.
      const seg = new THREE.Line3(prev, p);
      const d = seg.closestPointToPoint(pos, true, new THREE.Vector3()).distanceTo(pos);
      if (d < bestScore) {
        bestScore = d;
        best = i;
      }
    });
    return best;
  }
}

const FIGHT_LINES = ['Ennada adikkura?! Vaa da, paapom!', 'Dei! Thirumbi adippen!', 'Ennai adichaa summa viduvena?!'];
