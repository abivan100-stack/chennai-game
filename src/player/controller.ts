import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Animator } from '../characters/animator';
import type { CharacterAsset } from '../characters/catalog';
import type { Input } from '../core/input';

const RADIUS = 0.35;
const HALF_HEIGHT = 0.5; // half of the straight middle part; total height = 2 * (0.5 + 0.35) = 1.7 m
const SKIN = 0.05; // character-controller gap: the capsule hovers this far above the ground
/** Capsule centre height above the feet. */
export const CAPSULE_LIFT = HALF_HEIGHT + RADIUS + SKIN;
const WALK_SPEED = 2; // m/s
const RUN_SPEED = 6;
const JUMP_SPEED = 6;
const GRAVITY = 20; // stronger than 9.81 so jumps feel snappy
const ACCEL = 10; // higher = reaches target speed faster
const DECEL = 12;
const TURN_RATE = 12;

// Animation tuning. Clip speeds = how fast the Mixamo clip travelled before root motion was
// stripped (walk: 1.68 m in 1.03 s, run: 3.42 m in 0.63 s); playback scales to match real speed.
const CLIP_SPEED = { walk: 1.63, run: 5.4 };
const RUN_ABOVE = (WALK_SPEED + RUN_SPEED) / 2;
const MOVE_ABOVE = 0.2;
const JUMP_START = 0.45; // s into the Mixamo jump clip where the feet leave the ground
const FALL_AFTER = 0.15; // s airborne (without jumping) before the fall pose kicks in

/**
 * Third-person walker: Rapier kinematic capsule (invisible collider) + KinematicCharacterController
 * (slides along walls, climbs steps/slopes). We own velocity and gravity; the animated model
 * follows the capsule.
 *
 * Modes: normal input; `walkTo()` (scripted approach, e.g. to the auto); `away` (the body is
 * somewhere else, e.g. driving: physics off, the Ride owns the model and its animation).
 */
export class PlayerController {
  /** Follows the capsule; turns to face movement. */
  readonly mesh = new THREE.Group();
  /** The hero, feet at its origin. Re-parented by Ride while in the auto. */
  readonly model = new THREE.Group();
  readonly animator: Animator;
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  /** Capsule centre in world space (or the auto's position while driving). */
  readonly position = new THREE.Vector3();

  private readonly ctrl: RAPIER.KinematicCharacterController;
  private readonly vel = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();
  private grounded = false;
  private moveSpeed = 0; // actual horizontal speed after collisions (drives animation)
  private jumpQueued = false;
  private jumped = false;
  private airTime = 0;
  private walkTarget: THREE.Vector3 | null = null;
  private talkTime = 0;
  private talkYaw = 0;
  private away = false;
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();

  constructor(world: RAPIER.World, scene: THREE.Scene, spawn: THREE.Vector3, hero: CharacterAsset) {
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z),
    );
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS), this.body);

    this.ctrl = world.createCharacterController(SKIN);
    this.ctrl.enableAutostep(0.4, 0.2, true);
    this.ctrl.enableSnapToGround(0.3);
    this.ctrl.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(45));

    this.model.add(hero.scene);
    this.attachModel();
    scene.add(this.mesh);
    this.animator = new Animator(hero.scene, hero.clips);
    this.animator.play('idle', { fade: 0 });
    this.position.copy(spawn);
    this.prevPos.copy(spawn);
    this.currPos.copy(spawn);
  }

  /** Horizontal speed the player is trying to move at (m/s). */
  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /** True while the player can walk around (not in the auto or a cutscene). */
  get onFoot() {
    return !this.away;
  }

  /** Put the model back on the capsule (feet on the ground). */
  attachModel() {
    this.mesh.add(this.model);
    this.model.position.set(0, -CAPSULE_LIFT, 0);
    this.model.rotation.set(0, 0, 0);
  }

  /** away = true: no physics, no input; collider off. The caller owns model + animation. */
  setAway(away: boolean) {
    this.away = away;
    this.collider.setEnabled(!away);
    this.walkTarget = null;
    this.vel.set(0, 0, 0);
    this.moveSpeed = 0;
  }

  /** Teleport the capsule so the feet stand at `feet`, facing `yaw`. */
  placeAt(feet: THREE.Vector3, yaw: number) {
    this.body.setTranslation({ x: feet.x, y: feet.y + CAPSULE_LIFT, z: feet.z }, true);
    this.position.set(feet.x, feet.y + CAPSULE_LIFT, feet.z);
    this.prevPos.copy(this.position);
    this.currPos.copy(this.position);
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = yaw;
  }

  /** Scripted walk to a point (null = back to player control). */
  walkTo(target: THREE.Vector3 | null) {
    this.walkTarget = target;
  }

  /** Talking gesture facing `yaw` for `seconds`; any movement key cancels it. */
  talk(yaw: number, seconds: number) {
    this.talkYaw = yaw;
    this.talkTime = seconds;
  }

  /** Read input once per frame. */
  handleInput(input: Input, cameraYaw: number) {
    if (this.away) return;
    if (this.walkTarget) {
      this.wish.set(this.walkTarget.x - this.position.x, 0, this.walkTarget.z - this.position.z);
      const d = this.wish.length();
      this.wish.multiplyScalar(d > 0.05 ? WALK_SPEED / d : 0);
      return;
    }
    const f = Number(input.isDown('KeyW')) - Number(input.isDown('KeyS'));
    const r = Number(input.isDown('KeyD')) - Number(input.isDown('KeyA'));
    if (f || r) this.talkTime = 0;
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    // Camera-relative: forward = (-sin, 0, -cos), right = (cos, 0, -sin).
    this.wish.set(r * cos - f * sin, 0, -r * sin - f * cos);
    if (this.wish.lengthSq() > 1) this.wish.normalize();
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    this.wish.multiplyScalar(running ? RUN_SPEED : WALK_SPEED);
    if (input.wasPressed('Space')) this.jumpQueued = true;
  }

  /** One physics step of movement. Call BEFORE world.step(). */
  step(dt: number) {
    if (this.away) return;
    // Exponential smoothing = frame-rate independent acceleration/deceleration.
    const k = 1 - Math.exp(-(this.wish.lengthSq() > 0 ? ACCEL : DECEL) * dt);
    this.vel.x += (this.wish.x - this.vel.x) * k;
    this.vel.z += (this.wish.z - this.vel.z) * k;

    if (this.jumpQueued && this.grounded) {
      this.vel.y = JUMP_SPEED;
      this.jumped = true;
    }
    this.jumpQueued = false;
    this.vel.y -= GRAVITY * dt;

    const desiredY = this.vel.y * dt;
    this.ctrl.computeColliderMovement(this.collider, { x: this.vel.x * dt, y: desiredY, z: this.vel.z * dt });
    const move = this.ctrl.computedMovement();
    this.grounded = this.ctrl.computedGrounded();
    // Smoothed so brushing along a wall doesn't flicker between walk and idle.
    const actual = dt > 0 ? Math.hypot(move.x, move.z) / dt : 0;
    this.moveSpeed += (actual - this.moveSpeed) * (1 - Math.exp(-15 * dt));
    if (this.grounded && this.vel.y < 0) this.vel.y = 0;
    if (desiredY > 0 && move.y < desiredY * 0.5) this.vel.y = 0; // bumped head

    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + move.x, y: t.y + move.y, z: t.z + move.z });
  }

  /** Record the capsule position after each physics step (for interpolation). */
  capture() {
    const t = this.body.translation();
    this.prevPos.copy(this.currPos);
    this.currPos.set(t.x, t.y, t.z);
  }

  /**
   * Sync the model to physics, face the movement direction, pick the animation. Once per frame.
   * alpha blends the last two physics steps so walking is smooth on any refresh rate.
   */
  sync(dt: number, alpha = 1) {
    if (this.away) {
      this.animator.update(dt);
      return;
    }
    this.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.mesh.position.copy(this.position);

    const speed = this.moveSpeed; // pressing into a wall = idle, not running on the spot
    let faceYaw: number | null = null;
    if (this.speed > 0.3) faceYaw = Math.atan2(this.vel.x, this.vel.z);
    else if (this.talkTime > 0) faceYaw = this.talkYaw;
    if (faceYaw !== null) {
      const delta = Math.atan2(Math.sin(faceYaw - this.mesh.rotation.y), Math.cos(faceYaw - this.mesh.rotation.y));
      this.mesh.rotation.y += delta * (1 - Math.exp(-TURN_RATE * dt));
    }

    this.talkTime -= dt;
    this.airTime = this.grounded ? 0 : this.airTime + dt;
    if (this.grounded) this.jumped = false;
    if (this.jumped || this.airTime > FALL_AFTER) {
      this.animator.play('jump', { once: true, startAt: JUMP_START });
    } else if (speed > RUN_ABOVE) {
      this.animator.play('run');
      this.animator.setSpeed(speed / CLIP_SPEED.run);
    } else if (speed > MOVE_ABOVE) {
      this.animator.play('walk');
      this.animator.setSpeed(THREE.MathUtils.clamp(speed / CLIP_SPEED.walk, 0.5, 2));
    } else if (this.talkTime > 0) {
      this.animator.play('talk');
    } else {
      this.animator.play('idle');
    }
    this.animator.update(dt);
  }
}
