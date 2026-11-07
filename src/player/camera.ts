import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

const MOUSE_SENSITIVITY = 0.0025; // radians per pixel
const PITCH_MIN = -0.35;
const PITCH_MAX = 1.2;
const PROBE_RADIUS = 0.25; // sphere swept toward the camera; keeps the near plane out of walls
const FOLLOW_RATE = 15; // pivot smoothing
const ZOOM_OUT_RATE = 3; // ease back out after an obstruction clears (zoom-in is instant)
const AUTO_ALIGN_AFTER = 1.2; // s without mouse input before the driving camera swings behind
const AUTO_ALIGN_RATE = 2.5;

/** Framing per mode: distance behind the target and pivot height above it. */
const MODES = {
  foot: { distance: 5, height: 0.7 },
  drive: { distance: 6.5, height: 1.3 },
} as const;
export type CameraMode = keyof typeof MODES;

/**
 * Orbit camera. Mouse sets yaw/pitch; a sphere cast from the pivot stops it at the first wall
 * so it never clips through buildings. In drive mode it eases back behind the vehicle when
 * the mouse is left alone.
 */
export class FollowCamera {
  yaw = 0;
  pitch = 0.3;
  mode: CameraMode = 'foot';
  /** Collider the probe ignores (the player's capsule, or the auto while driving). */
  ignore: RAPIER.Collider;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly world: RAPIER.World;
  private readonly pivot = new THREE.Vector3();
  private readonly goal = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly probe = new RAPIER.Ball(PROBE_RADIUS);
  /** Framing scale for big vehicles (a bus needs the camera much further back). */
  size = 1;
  private distance: number = MODES.foot.distance;
  private height: number = MODES.foot.height;
  private idle = 0;
  private first = true;

  constructor(camera: THREE.PerspectiveCamera, world: RAPIER.World, ignore: RAPIER.Collider) {
    this.camera = camera;
    this.world = world;
    this.ignore = ignore;
  }

  rotate(dx: number, dy: number) {
    if (dx || dy) this.idle = 0;
    this.yaw -= dx * MOUSE_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * MOUSE_SENSITIVITY, PITCH_MIN, PITCH_MAX);
  }

  /**
   * target: what to look at. behindYaw (drive mode): heading of the vehicle; the camera
   * swings behind it after a moment without mouse input.
   */
  private shakeT = 0;
  private shakeAmp = 0;

  /** Brief jolt (hits). `amp` in metres. */
  shake(amp: number, seconds = 0.15) {
    this.shakeAmp = amp;
    this.shakeT = seconds;
  }

  update(dt: number, target: THREE.Vector3, behindYaw?: number) {
    const base = MODES[this.mode];
    const m = { distance: base.distance * this.size, height: base.height * this.size };
    this.height += (m.height - this.height) * (1 - Math.exp(-4 * dt));
    this.idle += dt;
    if (behindYaw !== undefined && this.idle > AUTO_ALIGN_AFTER) {
      const want = behindYaw + Math.PI; // camera sits opposite the direction of travel
      this.yaw += Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)) * (1 - Math.exp(-AUTO_ALIGN_RATE * dt));
      this.pitch += (0.22 - this.pitch) * (1 - Math.exp(-AUTO_ALIGN_RATE * dt));
    }

    this.goal.set(target.x, target.y + this.height, target.z);
    if (this.first) this.pivot.copy(this.goal);
    this.pivot.lerp(this.goal, 1 - Math.exp(-FOLLOW_RATE * dt));
    this.first = false;

    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    const hit = this.world.castShape(
      this.pivot, { x: 0, y: 0, z: 0, w: 1 }, this.dir, this.probe,
      // Kinematic bodies (NPCs) don't push the camera in.
      0, m.distance, false, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC, undefined, this.ignore,
    );
    const allowed = hit ? Math.max(0.3, hit.time_of_impact) : m.distance;
    this.distance = allowed < this.distance
      ? allowed
      : this.distance + (allowed - this.distance) * (1 - Math.exp(-ZOOM_OUT_RATE * dt));

    this.camera.position.copy(this.pivot).addScaledVector(this.dir, this.distance);
    this.camera.lookAt(this.pivot);
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const a = this.shakeAmp * Math.max(0, this.shakeT) * 8;
      this.camera.position.x += (Math.random() - 0.5) * a;
      this.camera.position.y += (Math.random() - 0.5) * a;
    }
  }
}
