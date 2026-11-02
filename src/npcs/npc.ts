import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Animator } from '../characters/animator';
import { CHARACTER_HEIGHT, type CharacterAsset } from '../characters/catalog';

const WALK_SPEED = 1.3; // m/s, roughly matches the Quaternius walk cycle
const TURN_RATE = 8;
const ARRIVE_DIST = 0.2;

export interface NpcOptions {
  position: THREE.Vector3;
  heading?: number; // radians, 0 = facing +z
  height?: number; // metres
  tint?: THREE.ColorRepresentation; // multiplies the material colour (variants of one model)
  map?: THREE.Texture; // swap the colour texture
  path?: THREE.Vector3[]; // looping waypoints; omit to stand idle
}

/**
 * Background pedestrian: a SkeletonUtils clone of a shared model (geometry and clips are shared,
 * only bones/material are per-NPC). Idles in place or walks a looping path.
 */
export class Npc {
  readonly root = new THREE.Group();
  private readonly animator: Animator;
  private readonly path: THREE.Vector3[] | undefined;
  private target = 0;

  constructor(scene: THREE.Scene, asset: CharacterAsset, opts: NpcOptions) {
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
    this.root.add(body);
    this.root.scale.setScalar((opts.height ?? CHARACTER_HEIGHT) / CHARACTER_HEIGHT);
    this.root.position.copy(opts.position);
    this.root.rotation.y = opts.heading ?? 0;
    scene.add(this.root);

    this.path = opts.path;
    this.animator = new Animator(body, asset.clips);
    this.animator.play(this.path ? 'walk' : 'idle', { fade: 0 });
    this.animator.randomizePhase();
  }

  /** active = false freezes the NPC completely (pose and position) to save CPU. */
  update(dt: number, active: boolean) {
    if (!active) return;
    if (this.path) this.walk(dt);
    this.animator.update(dt);
  }

  private walk(dt: number) {
    const pos = this.root.position;
    const goal = this.path![this.target];
    const dx = goal.x - pos.x;
    const dz = goal.z - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < ARRIVE_DIST) {
      this.target = (this.target + 1) % this.path!.length;
      return;
    }
    const step = Math.min(dist, WALK_SPEED * dt);
    pos.x += (dx / dist) * step;
    pos.z += (dz / dist) * step;
    const yaw = Math.atan2(dx, dz);
    const delta = Math.atan2(Math.sin(yaw - this.root.rotation.y), Math.cos(yaw - this.root.rotation.y));
    this.root.rotation.y += delta * (1 - Math.exp(-TURN_RATE * dt));
  }
}
