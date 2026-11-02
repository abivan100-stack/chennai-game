import type RAPIER from '@dimforge/rapier3d-compat';
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

/** Test-town crowd: 5 standing near the start facing the road, 5 moving loops round nearby blocks. */
const SPAWNS: (NpcOptions & { model: NpcModelId })[] = [
  // Standing
  { name: 'Murugan anna', model: 'man-farmer', position: v(STAND_LANE, 10), heading: -Math.PI / 2, height: 1.66 },
  { name: 'Lakshmi akka', model: 'woman-formal', position: v(-STAND_LANE, 3), heading: Math.PI / 2, height: 1.6 },
  { name: 'Selvam', model: 'man-worker', position: v(12, STAND_LANE), heading: Math.PI, height: 1.72 },
  { name: 'Kavitha', model: 'woman-casual', position: v(-14, -STAND_LANE), heading: 0, height: 1.58 },
  { name: 'Ravi', model: 'man-casual', position: v(STAND_LANE, -14), heading: -Math.PI / 2, height: 1.75, tint: 0xd8c8b0 },
  // Moving (start somewhere on their loop)
  { name: 'Arun', model: 'man-casual', position: v(WALK_LANE, 20), path: blockLoop(1, 1), pace: 'run', height: 1.7 },
  { name: 'Meena madam', model: 'woman-suit', position: v(-WALK_LANE, 30), path: blockLoop(-1, 1), height: 1.62 },
  { name: 'Kumar', model: 'man-worker', position: v(20, -WALK_LANE), path: blockLoop(1, -1), height: 1.68, tint: 0xb8c8e0 },
  { name: 'Priya', model: 'woman-casual', position: v(-WALK_LANE, -25), path: blockLoop(-1, -1), height: 1.6, tint: 0xffd0d0 },
  { name: 'Raman', model: 'man-farmer', position: v(30, FAR), path: blockLoop(1, 1).reverse(), height: 1.64, tint: 0xe0d8c0 },
];

/** How close (m) the player must be to talk (E). */
const TALK_RADIUS = 2.2;
/** Running into an NPC: centre distance (m) and minimum player speed (m/s). */
const BUMP_DIST = 0.9;
const BUMP_SPEED = 3;

export class Crowd {
  readonly npcs: Npc[];
  /** NPCs updated last frame (shown in the F3 panel). */
  activeCount = 0;
  /** Closest NPC the player can talk to right now, or null. */
  nearest: Npc | null = null;
  /** Called when an NPC says something on its own (e.g. after being bumped). */
  onSay: (name: string, line: string) => void = () => {};

  constructor(scene: THREE.Scene, world: RAPIER.World, assets: Map<NpcModelId, CharacterAsset>) {
    this.npcs = SPAWNS.map((s) => new Npc(scene, world, assets.get(s.model)!, s));
  }

  update(dt: number, playerPos: THREE.Vector3, playerSpeed: number) {
    this.activeCount = 0;
    this.nearest = null;
    let nearestDist = TALK_RADIUS;
    for (const npc of this.npcs) {
      const p = npc.root.position;
      const dist = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      const active = dist < ACTIVE_RADIUS;
      if (active) this.activeCount++;
      npc.update(dt, active, playerPos);

      if (dist < nearestDist && npc.canTalk) {
        nearestDist = dist;
        this.nearest = npc;
      }
      if (dist < BUMP_DIST && playerSpeed > BUMP_SPEED) {
        const line = npc.bump();
        if (line) this.onSay(npc.name, line);
      }
    }
  }
}
