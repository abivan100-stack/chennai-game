import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';

const DISTANCE = 5; // preferred distance behind the player, metres
const PIVOT_HEIGHT = 0.7; // above capsule centre (about head height)
const MOUSE_SENSITIVITY = 0.0025; // radians per pixel
const PITCH_MIN = -0.35;
const PITCH_MAX = 1.2;
const PROBE_RADIUS = 0.25; // sphere swept toward the camera; keeps the near plane out of walls
const FOLLOW_RATE = 15; // pivot smoothing
const ZOOM_OUT_RATE = 3; // ease back out after an obstruction clears (zoom-in is instant)

/**
 * Orbit camera around the player. Mouse sets yaw/pitch; a sphere cast from the
 * player's head stops it at the first wall so it never clips through buildings.
 */
export class FollowCamera {
  yaw = 0;
  pitch = 0.3;

  private readonly camera: THREE.PerspectiveCamera;
  private readonly world: RAPIER.World;
  private readonly ignore: RAPIER.Collider;
  private readonly pivot = new THREE.Vector3();
  private readonly goal = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly probe = new RAPIER.Ball(PROBE_RADIUS);
  private distance = DISTANCE;
  private first = true;

  constructor(camera: THREE.PerspectiveCamera, world: RAPIER.World, ignore: RAPIER.Collider) {
    this.camera = camera;
    this.world = world;
    this.ignore = ignore;
  }

  rotate(dx: number, dy: number) {
    this.yaw -= dx * MOUSE_SENSITIVITY;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dy * MOUSE_SENSITIVITY, PITCH_MIN, PITCH_MAX);
  }

  update(dt: number, target: THREE.Vector3) {
    this.goal.set(target.x, target.y + PIVOT_HEIGHT, target.z);
    if (this.first) this.pivot.copy(this.goal);
    this.pivot.lerp(this.goal, 1 - Math.exp(-FOLLOW_RATE * dt));
    this.first = false;

    const cp = Math.cos(this.pitch);
    this.dir.set(Math.sin(this.yaw) * cp, Math.sin(this.pitch), Math.cos(this.yaw) * cp);

    const hit = this.world.castShape(
      this.pivot, { x: 0, y: 0, z: 0, w: 1 }, this.dir, this.probe,
      // Kinematic bodies (NPCs, later moving vehicles) don't push the camera in.
      0, DISTANCE, false, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC, undefined, this.ignore,
    );
    const allowed = hit ? Math.max(0.3, hit.time_of_impact) : DISTANCE;
    this.distance = allowed < this.distance
      ? allowed
      : this.distance + (allowed - this.distance) * (1 - Math.exp(-ZOOM_OUT_RATE * dt));

    this.camera.position.copy(this.pivot).addScaledVector(this.dir, this.distance);
    this.camera.lookAt(this.pivot);
  }
}
