import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Input } from '../core/input';

const RADIUS = 0.35;
const HALF_HEIGHT = 0.5; // half of the straight middle part; total height = 2 * (0.5 + 0.35) = 1.7 m
const WALK_SPEED = 4; // m/s
const RUN_SPEED = 8;
const JUMP_SPEED = 6;
const GRAVITY = 20; // stronger than 9.81 so jumps feel snappy
const ACCEL = 10; // higher = reaches target speed faster
const DECEL = 12;
const TURN_RATE = 12;

/**
 * Third-person walker: Rapier kinematic capsule + KinematicCharacterController
 * (handles sliding along walls, steps and slopes). We own velocity and gravity.
 */
export class PlayerController {
  readonly mesh = new THREE.Group();
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  /** Capsule centre in world space, synced after each physics step. */
  readonly position = new THREE.Vector3();

  private readonly ctrl: RAPIER.KinematicCharacterController;
  private readonly vel = new THREE.Vector3();
  private readonly wish = new THREE.Vector3();
  private grounded = false;

  constructor(world: RAPIER.World, scene: THREE.Scene, spawn: THREE.Vector3) {
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(spawn.x, spawn.y, spawn.z),
    );
    this.collider = world.createCollider(RAPIER.ColliderDesc.capsule(HALF_HEIGHT, RADIUS), this.body);

    this.ctrl = world.createCharacterController(0.05);
    this.ctrl.enableAutostep(0.4, 0.2, true);
    this.ctrl.enableSnapToGround(0.3);
    this.ctrl.setMaxSlopeClimbAngle(THREE.MathUtils.degToRad(45));

    // Placeholder look: capsule body + a "nose" so facing direction is visible.
    const capsule = new THREE.Mesh(
      new THREE.CapsuleGeometry(RADIUS, HALF_HEIGHT * 2, 4, 12),
      new THREE.MeshStandardMaterial({ color: 0x2f6fd6, roughness: 0.6 }),
    );
    const nose = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.12, 0.25),
      new THREE.MeshStandardMaterial({ color: 0xffd9a8 }),
    );
    nose.position.set(0, 0.55, RADIUS);
    capsule.castShadow = nose.castShadow = true;
    this.mesh.add(capsule, nose);
    scene.add(this.mesh);
    this.position.copy(spawn);
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

    if (this.grounded && input.wasPressed('Space')) this.vel.y = JUMP_SPEED;
    this.vel.y -= GRAVITY * dt;

    const desiredY = this.vel.y * dt;
    this.ctrl.computeColliderMovement(this.collider, { x: this.vel.x * dt, y: desiredY, z: this.vel.z * dt });
    const move = this.ctrl.computedMovement();
    this.grounded = this.ctrl.computedGrounded();
    if (this.grounded && this.vel.y < 0) this.vel.y = 0;
    if (desiredY > 0 && move.y < desiredY * 0.5) this.vel.y = 0; // bumped head

    const t = this.body.translation();
    this.body.setNextKinematicTranslation({ x: t.x + move.x, y: t.y + move.y, z: t.z + move.z });
  }

  /** Sync the mesh to physics and turn it toward the movement direction. Call AFTER world.step(). */
  sync(dt: number) {
    const t = this.body.translation();
    this.position.set(t.x, t.y, t.z);
    this.mesh.position.copy(this.position);

    if (Math.hypot(this.vel.x, this.vel.z) > 0.3) {
      const target = Math.atan2(this.vel.x, this.vel.z);
      const delta = Math.atan2(Math.sin(target - this.mesh.rotation.y), Math.cos(target - this.mesh.rotation.y));
      this.mesh.rotation.y += delta * (1 - Math.exp(-TURN_RATE * dt));
    }
  }
}
