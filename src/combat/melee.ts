import * as THREE from 'three';
import type { PlayerController } from '../player/controller';

export type Move = 'punch' | 'swing' | 'kick';
/** Moves the player can play: the hook is the second blow of a punch chain and lands as a punch. */
type Spec = Move | 'hook';

interface MoveSpec {
  clip: string;
  speed: number; // playback rate
  len: number; // clip seconds the move owns the body (cut before the clip's long recovery)
  hit: [number, number]; // clip seconds when the blow can connect
  reach: number; // punch / kick: how far in front the blow lands (m)
  closeTo: number; // step in until the target is this close (m) during the wind-up
  lunge: { speed: number; from: number; to: number } | null; // real seconds
  as?: Move; // reported to the game as this move (damage, sound)
}

/**
 * Mixamo clips: Punching, Hook Punch, Stable Sword Outward Slash (lathi), Flying Kick. Hit windows
 * were measured from the clips (where the fist / foot / stick tip moves fastest).
 */
export const MOVES: Record<Spec, MoveSpec> = {
  punch: { clip: 'punch', speed: 1.15, len: 0.85, hit: [0.4, 0.5], reach: 1.5, closeTo: 0.85, lunge: null },
  hook: { clip: 'hook', speed: 1.3, len: 1.4, hit: [0.95, 1.08], reach: 1.5, closeTo: 0.85, lunge: null, as: 'punch' },
  swing: { clip: 'swing', speed: 1.3, len: 1.35, hit: [0.76, 1.05], reach: 0, closeTo: 0.95, lunge: null },
  kick: { clip: 'kick', speed: 1, len: 1.3, hit: [0.55, 0.7], reach: 1.9, closeTo: 0, lunge: { speed: 3.2, from: 0.15, to: 0.7 } },
};
const STICK_LENGTH = 1.05;
const STICK_SAMPLES = [0.35, 0.6, 0.85, 1]; // points along the stick (fraction) tested against bodies
const BODY_RADIUS = 0.5; // target capsule radius, generous so near-misses still land
const BODY_HEIGHT = 2.05; // the lathi slash comes in at head height
const STEP_IN_TIME = 0.25; // seconds of the wind-up spent stepping towards the target
const STEP_IN_MAX = 1.3; // metres
const AIM_RANGE = 3.2; // turn to face the nearest person this close when attacking...
const AIM_CONE = 0.0; // ...if they're not behind you (cos of the angle off your facing)

/** Someone who can be hit: feet position + whatever main.ts needs to apply the hit. */
export interface Target<T = unknown> {
  p: THREE.Vector3;
  ref: T;
}

/**
 * The player's fists, feet and lathi. Left click attacks (punch, or swing with the lathi out),
 * Q kicks, right mouse blocks, 1 takes the lathi out / puts it away. Clicking during a move
 * queues the next one. `update` returns who got hit this frame.
 */
export class Melee {
  stickOut = false;
  private readonly player: PlayerController;
  private readonly stick: THREE.Mesh;
  private pending: { move: Spec; t: number; hit: Set<unknown> } | null = null;
  private queued: Spec | null = null;
  private audio: AudioContext | null = null;
  private readonly sample = new THREE.Vector3();

  constructor(player: PlayerController) {
    this.player = player;
    const hand = player.model.getObjectByName('RightHand')!;
    // Bones carry the armature's 0.01 scale: undo it so the stick keeps real size.
    player.model.updateWorldMatrix(true, true);
    const k = new THREE.Vector3().setFromMatrixScale(player.model.matrixWorld).x / new THREE.Vector3().setFromMatrixScale(hand.matrixWorld).x;
    // Gripped in the fist: runs along the hand's local Z (through the closed fingers), mostly out the thumb side.
    const geo = new THREE.CylinderGeometry(0.017, 0.022, STICK_LENGTH, 8).rotateX(Math.PI / 2).translate(0, 0, STICK_LENGTH * 0.35);
    this.stick = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xa8814a, roughness: 0.8 }));
    this.stick.scale.setScalar(k);
    this.stick.position.set(0, 0.08 * k, 0.02 * k);
    this.stick.castShadow = true;
    this.stick.visible = false;
    hand.add(this.stick);
  }

  toggleStick() {
    this.stickOut = !this.stickOut;
    this.stick.visible = this.stickOut;
    this.player.idleClip = this.stickOut ? 'idle_stick' : 'idle';
  }

  /** Start an attack, turning towards the nearest target. Mid-move: queue it for after the blow. */
  attack(targets: () => Target[], move: Spec = this.stickOut ? 'swing' : 'punch') {
    if (this.pending) {
      // Buffered: starts as soon as this move ends. Punch, punch = jab then hook (then jab again).
      this.queued = move === 'punch' && this.pending.move === 'punch' ? 'hook' : move;
      return;
    }
    const m = MOVES[move];
    const target = this.nearest(targets());
    let lunge = m.lunge;
    // Target a step away: close the gap during the wind-up so the blow can reach.
    if (target && !lunge && target.d > m.closeTo + 0.1) {
      lunge = { speed: Math.min(target.d - m.closeTo, STEP_IN_MAX) / STEP_IN_TIME, from: 0, to: STEP_IN_TIME };
    }
    if (!this.player.playAction(m.clip, m.len / m.speed, lunge, m.speed)) return;
    if (target) this.player.mesh.rotation.y = target.yaw;
    this.pending = { move, t: 0, hit: new Set() };
  }

  /** Targets hit this frame (each at most once per move). `targets` is only called when needed. */
  update<T>(dt: number, targets: () => Target<T>[]): { move: Move; hits: T[] } | null {
    if (!this.pending) {
      if (this.queued && !this.player.acting) {
        const q = this.queued;
        this.queued = null;
        this.attack(targets, q);
      }
      return null;
    }
    const p = this.pending;
    const m = MOVES[p.move];
    p.t += dt * m.speed; // clip time
    const hits: T[] = [];
    if (p.t >= m.hit[0] && p.t <= m.hit[1] + dt * m.speed) {
      for (const tg of targets()) {
        if (p.hit.has(tg.ref)) continue;
        if (p.move === 'swing' ? this.stickTouches(tg.p) : this.inReach(tg.p, m.reach)) {
          p.hit.add(tg.ref);
          hits.push(tg.ref);
        }
      }
      // Punches and kicks connect once, at the start of the window.
      if (p.move !== 'swing') p.t = Math.max(p.t, m.hit[1] + 1e-3);
    }
    if (p.t >= m.len) this.pending = null;
    const move = m.as ?? (p.move as Move);
    if (hits.length) this.thwack(move);
    return hits.length ? { move, hits } : null;
  }

  private stickTouches(feet: THREE.Vector3) {
    for (const f of STICK_SAMPLES) {
      // Stick runs along local Z from -0.15 L to +0.85 L (see the geometry translate).
      this.sample.set(0, 0, STICK_LENGTH * (f - 0.15)).applyMatrix4(this.stick.matrixWorld);
      const h = this.sample.y - feet.y;
      if (h < 0 || h > BODY_HEIGHT) continue;
      if (Math.hypot(this.sample.x - feet.x, this.sample.z - feet.z) < BODY_RADIUS) return true;
    }
    return false;
  }

  private inReach(p: THREE.Vector3, reach: number) {
    const me = this.player.position;
    const yaw = this.player.mesh.rotation.y;
    const dx = p.x - me.x;
    const dz = p.z - me.z;
    const d = Math.hypot(dx, dz);
    return d < reach && (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / (d || 1) > 0.3;
  }

  /** Soft lock-on: the closest target in range that isn't behind us. */
  private nearest(targets: Target[]) {
    const me = this.player.position;
    const yaw = this.player.mesh.rotation.y;
    let best: THREE.Vector3 | null = null;
    let bestD = AIM_RANGE;
    for (const t of targets) {
      const dx = t.p.x - me.x;
      const dz = t.p.z - me.z;
      const d = Math.hypot(dx, dz);
      if (d < bestD && (dx * Math.sin(yaw) + dz * Math.cos(yaw)) / (d || 1) > AIM_CONE) {
        bestD = d;
        best = t.p;
      }
    }
    return best ? { d: bestD, yaw: Math.atan2(best.x - me.x, best.z - me.z) } : null;
  }

  /** Short noise burst through a low-pass: a dull thud (fist / foot) or a sharper crack (lathi). */
  private thwack(move: Move) {
    try {
      this.audio ??= new AudioContext();
    } catch {
      return;
    }
    const ctx = this.audio;
    const len = Math.floor(ctx.sampleRate * 0.09);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 4;
    const src = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = move === 'swing' ? 2600 : 900;
    const gain = ctx.createGain();
    gain.gain.value = 0.6;
    src.buffer = buf;
    src.connect(filter).connect(gain).connect(ctx.destination);
    src.start();
  }
}
