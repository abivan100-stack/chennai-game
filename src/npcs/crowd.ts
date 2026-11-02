import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { CharacterAsset, NpcModelId } from '../characters/catalog';
import { ROAD_HALF, SETBACK, SIDEWALK_HEIGHT, block } from '../world/layout';
import { BUMPED, DRIVE_BUMPED } from './dialogue';
import { Npc, type NpcOptions } from './npc';

/** NPCs farther than this from the player are frozen (no animation, no movement). */
const ACTIVE_RADIUS = 40;
/** How close (m) the player must be to talk (E). */
const TALK_RADIUS = 2.2;
/** Bumping: centre distance (m) and minimum speed (m/s), on foot and in the auto. */
const BUMP = { foot: { dist: 0.9, speed: 3 }, auto: { dist: 1.9, speed: 1.5 } };

// Two lanes on each 2.5 m sidewalk, measured out from the building line:
// one nearer the road (A), one nearer the shops (B, clear of verandahs and the gopuram steps).
const LANE_A = SETBACK - (ROAD_HALF + 0.7);
const LANE_B = 1.1;
const y = SIDEWALK_HEIGHT;
const v = (x: number, z: number) => new THREE.Vector3(x, y, z);

/** Loop round the sidewalks of block (i, j) (grid indices from layout.blocks()). */
function blockLoop(i: number, j: number, lane: number, reverse = false) {
  const b = block(i, j);
  const loop = [v(b.x0 - lane, b.z0 - lane), v(b.x1 + lane, b.z0 - lane), v(b.x1 + lane, b.z1 + lane), v(b.x0 - lane, b.z1 + lane)];
  return reverse ? loop.reverse() : loop;
}

type Spawn = Omit<NpcOptions, 'path' | 'position'> & { model: NpcModelId; block: [number, number]; lane: number; reverse?: boolean; start: number };

// Blocks: temple = [2, 2], tank = [1, 2]; [3, 2] is across East Mada Street, etc.
/**
 * The crowd: devotees circling the temple (pradakshinam), walkers round the tank and the
 * shopping blocks. `start` = how far along the loop (0..1) they begin.
 */
const SPAWNS: Spawn[] = [
  { name: 'Murugan anna', model: 'man-farmer', block: [2, 2], lane: LANE_B, start: 0.05, height: 1.66 },
  { name: 'Lakshmi akka', model: 'woman-formal', block: [2, 2], lane: LANE_A, start: 0.3, height: 1.6 },
  { name: 'Meena madam', model: 'woman-suit', block: [2, 2], lane: LANE_B, start: 0.55, height: 1.62 },
  { name: 'Raman', model: 'man-farmer', block: [2, 2], lane: LANE_A, start: 0.8, height: 1.64, tint: 0xe0d8c0 },
  { name: 'Kavitha', model: 'woman-casual', block: [1, 2], lane: LANE_B, reverse: true, start: 0.1, height: 1.58 },
  { name: 'Arun', model: 'man-casual', block: [1, 2], lane: LANE_A, start: 0.6, pace: 'run', height: 1.7 },
  { name: 'Selvam', model: 'man-worker', block: [3, 2], lane: LANE_A, start: 0.75, height: 1.72 },
  { name: 'Divya', model: 'woman-formal', block: [3, 2], lane: LANE_B, reverse: true, start: 0.2, height: 1.6, tint: 0xd0e8ff },
  { name: 'Ravi', model: 'man-casual', block: [2, 1], lane: LANE_A, start: 0.4, height: 1.75, tint: 0xd8c8b0 },
  { name: 'Kumar', model: 'man-worker', block: [2, 3], lane: LANE_B, reverse: true, start: 0.6, height: 1.68, tint: 0xb8c8e0 },
  { name: 'Priya', model: 'woman-casual', block: [3, 3], lane: LANE_A, start: 0.55, height: 1.6, tint: 0xffd0d0 },
  { name: 'Babu', model: 'man-worker', block: [3, 1], lane: LANE_B, reverse: true, start: 0.85, height: 1.7, tint: 0xf0d0a0 },
];

/** Point a fraction `t` of the way round a closed loop. */
function along(loop: THREE.Vector3[], t: number) {
  const lens = loop.map((p, i) => p.distanceTo(loop[(i + 1) % loop.length]));
  let d = t * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < loop.length; i++) {
    if (d <= lens[i]) return loop[i].clone().lerp(loop[(i + 1) % loop.length], d / lens[i]);
    d -= lens[i];
  }
  return loop[0].clone();
}

export class Crowd {
  readonly npcs: Npc[];
  /** NPCs updated last frame (shown in the F3 panel). */
  activeCount = 0;
  /** Closest NPC the player can talk to right now, or null. */
  nearest: Npc | null = null;
  /** Called when an NPC says something on its own (e.g. after being bumped). */
  onSay: (name: string, line: string) => void = () => {};

  constructor(scene: THREE.Scene, world: RAPIER.World, assets: Map<NpcModelId, CharacterAsset>) {
    this.npcs = SPAWNS.map((s) => {
      const path = blockLoop(s.block[0], s.block[1], s.lane, s.reverse);
      return new Npc(scene, world, assets.get(s.model)!, { ...s, path, position: along(path, s.start) });
    });
  }

  /** inAuto: the player is driving (bigger bump radius, different complaints, no chatting). */
  update(dt: number, playerPos: THREE.Vector3, playerSpeed: number, inAuto: boolean) {
    this.activeCount = 0;
    this.nearest = null;
    let nearestDist = TALK_RADIUS;
    const bump = inAuto ? BUMP.auto : BUMP.foot;
    for (const npc of this.npcs) {
      const p = npc.root.position;
      const dist = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      const active = dist < ACTIVE_RADIUS;
      if (active) this.activeCount++;
      npc.update(dt, active, playerPos);

      if (!inAuto && dist < nearestDist && npc.canTalk) {
        nearestDist = dist;
        this.nearest = npc;
      }
      if (dist < bump.dist && playerSpeed > bump.speed) {
        const line = npc.scold(inAuto ? DRIVE_BUMPED : BUMPED);
        if (line) this.onSay(npc.name, line);
      }
    }
  }
}
