import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const HALF_EXTENTS = { x: 0.7, y: 0.95, z: 1.4 }; // collider box, metres

/** Box at a local offset (front of the auto = +z). */
const box = (w: number, h: number, d: number, x: number, y: number, z: number) =>
  new THREE.BoxGeometry(w, h, d).translate(x, y, z);
const wheel = (x: number, z: number) =>
  new THREE.CylinderGeometry(0.25, 0.25, 0.15, 12).rotateZ(Math.PI / 2).translate(x, 0.25, z);

/**
 * Placeholder auto rickshaw: yellow-and-black boxes merged into 2 draw calls,
 * on a fixed collider. Becomes a dynamic vehicle body in the driving step.
 */
export class AutoRickshaw {
  readonly group = new THREE.Group();
  readonly body: RAPIER.RigidBody;

  constructor(scene: THREE.Scene, world: RAPIER.World, position: THREE.Vector3, heading = 0) {
    const yellow = mergeGeometries([
      box(1.3, 1.0, 1.0, 0, 1.35, -0.8), // rear passenger shell
      box(1.36, 0.08, 2.1, 0, 1.9, -0.1), // roof canopy
      box(0.9, 0.85, 0.35, 0, 0.95, 1.15), // front cowl
    ]);
    const black = mergeGeometries([
      box(1.3, 0.45, 2.6, 0, 0.6, 0), // chassis / floor
      box(0.06, 1.0, 0.06, 0.6, 1.4, 0.75), // front pillars
      box(0.06, 1.0, 0.06, -0.6, 1.4, 0.75),
      box(1.2, 0.08, 0.06, 0, 1.85, 1.0), // windscreen top bar
      wheel(0, 1.1),
      wheel(0.62, -0.85),
      wheel(-0.62, -0.85),
    ]);
    for (const [geo, color] of [[yellow, 0xf2c200], [black, 0x1a1a1a]] as const) {
      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color, roughness: 0.6 }));
      mesh.castShadow = mesh.receiveShadow = true;
      this.group.add(mesh);
    }
    this.group.position.copy(position);
    this.group.rotation.y = heading;
    scene.add(this.group);

    const q = this.group.quaternion;
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed()
        .setTranslation(position.x, position.y + HALF_EXTENTS.y, position.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
    );
    world.createCollider(RAPIER.ColliderDesc.cuboid(HALF_EXTENTS.x, HALF_EXTENTS.y, HALF_EXTENTS.z), this.body);
  }

  /** Horizontal distance check from a world point (e.g. the player). */
  isNear(p: THREE.Vector3, radius: number) {
    const a = this.group.position;
    return Math.hypot(p.x - a.x, p.z - a.z) < radius;
  }
}
