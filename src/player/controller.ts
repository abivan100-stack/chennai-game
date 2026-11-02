import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { Animator } from '../characters/animator';
import type { CharacterAsset } from '../characters/catalog';
import type { Input } from '../core/input';

const RADIUS = 0.35;
const HALF_HEIGHT = 0.5; // half of the straight middle part; total height = 2 * (0.5 + 0.35) = 1.7 m
const SKIN = 0.05; // character-controller gap: the capsule hovers this far above the ground
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
 * just follows the capsule.
 */
export class PlayerController {
  readonly mesh = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  /** Capsule centre in world space, synced after each physics step. */
  readonly position = new THREE.Vector3();

  private readonly ctrl: RAPIER.KinematicCharacterController;
  private readonly animator: Animator;
  private readonly vel = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();
  private grounded = false;
  private moveSpeed = 0; // actual horizontal speed after collisions (drives animation)
  private jumped = false;
  private airTime = 0;

  constructor(world: RAPIER.World, scene: THREE.Scene, spawn: THREE.Vector3, hero: CharacterAsset) {
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z),
    );
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS), this.body);

    this.ctrl = world.createCharacterController(SKIN);
    this.ctrl.enableAutostep(0.4, 0.2, true);
    this.ctrl.enableSnapToGround(0.3);
    this.ctrl.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(45));

    // The model's feet are at its origin; drop it from capsule centre to the ground.
    hero.scene.position.y -= HALF_HEIGHT + RADIUS + SKIN;
    this.mesh.add(hero.scene);
    scene.add(this.mesh);
    this.animator = new Animator(hero.scene, hero.clips);
    this.animator.play('idle', { fade: 0 });
    this.position.copy(spawn);
  }

  /** Horizontal speed the player is trying to move at (m/s). */
  get speed() {
    return Math.hypot(this.vel.x, this.vel.z);
  }

  /** Read input and queue this frame's movement. Call BEFORE world.step(). */
  update(dt: number, input: Input, cameraYaw: number) {
    const f = Number(input.isDown('KeyW')) - Number(input.isDown('KeyS'));
    const r = Number(input.isDown('KeyD')) - Number(input.isDown('KeyA'));
    const sin = Math.sin(cameraYaw);
    const cos = Math.cos(cameraYaw);
    // Camera-relative: forward = (-sin, 0, -cos), right = (cos, 0, -sin).
    this.wish.set(r * cos - f * sin, 0, -r * sin - f * cos);
    if (this.wish.lengthSq() > 1) this.wish.normalize();
    const running = input.isDown('ShiftLeft') || input.isDown('ShiftRight');
    this.wish.multiplyScalar(running ? RUN_SPEED : WALK_SPEED);

    // Exponential smoothing = frame-rate independent acceleration/deceleration.
    const k = 1 - Math.exp(-(this.wish.lengthSq() > 0 ? ACCEL : DECEL) * dt);
    this.vel.x += (this.wish.x - this.vel.x) * k;
    this.vel.z += (this.wish.z - this.vel.z) * k;

    if (this.grounded && input.wasPressed('Space')) {
      this.vel.y = JUMP_SPEED;
      this.jumped = true;
    }
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

  /** Sync the model to physics, face the movement direction, pick the animation. Call AFTER world.step(). */
  sync(dt: number) {
    const t = this.body.translation();
    this.position.set(t.x, t.y, t.z);
    this.mesh.position.copy(this.position);

    if (this.speed > 0.3) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      const delta = Math.atan2(Math.sin(target - this.mesh.rotation.y), Math.cos(target - this.mesh.rotation.y));
      this.mesh.rotation.y += delta * (1 - Math.exp(-TURN_RATE * dt));
    }

    const speed = this.moveSpeed; // pressing into a wall = idle, not running on the spot
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
    } else {
      this.animator.play('idle');
    }
    this.animator.update(dt);
  }
}
