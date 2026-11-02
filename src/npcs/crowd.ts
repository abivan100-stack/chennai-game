import * as THREE from 'three';
import type { CharacterAsset, NpcModelId } from '../characters/catalog';
import { Npc, type NpcOptions } from './npc';

/** NPCs farther than this from the player are frozen (no animation, no movement). */
const ACTIVE_RADIUS = 40;

const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);
// Sidewalks run 5-7 m from each road centre line (ground.ts / buildings.ts).
// Walkers use the road-side lane (5.6 m), standers the building-side lane (6.6 m).
const WALK_LANE = 5.6;
const STAND_LANE = 6.6;
const FAR = 50 - WALK_LANE;

/** Loop along the sidewalks of the block between the roads at 0 and 50*sx / 50*sz. */
const blockLoop = (sx: number, sz: number) => [
  v(WALK_LANE * sx, WALK_LANE * sz),
  v(FAR * sx, WALK_LANE * sz),
  v(FAR * sx, FAR * sz),
  v(WALK_LANE * sx, FAR * sz),
];

/** Test-town crowd: 5 standing near the start facing the road, 5 walking loops round nearby blocks. */
const SPAWNS: (NpcOptions & { model: NpcModelId })[] = [
  // Standing
  { model: 'man-farmer', position: v(STAND_LANE, 10), heading: -Math.PI / 2, height: 1.66 },
  { model: 'woman-formal', position: v(-STAND_LANE, 3), heading: Math.PI / 2, height: 1.6 },
  { model: 'man-worker', position: v(12, STAND_LANE), heading: Math.PI, height: 1.72 },
  { model: 'woman-casual', position: v(-14, -STAND_LANE), heading: 0, height: 1.58 },
  { model: 'man-casual', position: v(STAND_LANE, -14), heading: -Math.PI / 2, height: 1.75, tint: 0xd8c8b0 },
  // Walking (start somewhere on their loop)
  { model: 'man-casual', position: v(WALK_LANE, 20), path: blockLoop(1, 1), height: 1.7 },
  { model: 'woman-suit', position: v(-WALK_LANE, 30), path: blockLoop(-1, 1), height: 1.62 },
  { model: 'man-worker', position: v(20, -WALK_LANE), path: blockLoop(1, -1), height: 1.68, tint: 0xb8c8e0 },
  { model: 'woman-casual', position: v(-WALK_LANE, -25), path: blockLoop(-1, -1), height: 1.6, tint: 0xffd0d0 },
  { model: 'man-farmer', position: v(30, FAR), path: blockLoop(1, 1).reverse(), height: 1.64, tint: 0xe0d8c0 },
];

export class Crowd {
  readonly npcs: Npc[];
  /** NPCs updated last frame (shown in the F3 panel). */
  activeCount = 0;

  constructor(scene: THREE.Scene, assets: Map<NpcModelId, CharacterAsset>) {
    this.npcs = SPAWNS.map((s) => new Npc(scene, assets.get(s.model)!, s));
  }

  update(dt: number, playerPos: THREE.Vector3) {
    this.activeCount = 0;
    for (const npc of this.npcs) {
      const active = npc.root.position.distanceToSquared(playerPos) < ACTIVE_RADIUS * ACTIVE_RADIUS;
      if (active) this.activeCount++;
      npc.update(dt, active);
    }
  }
}
