import * as THREE from 'three';
import type { PlayerController } from '../player/controller';

export type Move = 'punch' | 'swing' | 'kick';

/**
 * Mixamo clips: Punching, Great Sword Attack (lathi), Flying Kick. `strike` = seconds into the
 * clip where the hand/foot is fastest (measured from the clips), `len` = how long the move owns
 * the body (cut a little before the clip ends so you can chain moves).
 */
export const MOVES: Record<Move, { clip: string; len: number; strike: number; reach: number; lunge: { speed: number; from: number; to: number } | null }> = {
  punch: { clip: 'punch', len: 0.85, strike: 0.43, reach: 1.5, lunge: null },
  swing: { clip: 'swing', len: 1.1, strike: 0.5, reach: 2.1, lunge: null },
  kick: { clip: 'kick', len: 1.3, strike: 0.6, reach: 1.9, lunge: { speed: 3.2, from: 0.15, to: 0.7 } },
};
const STICK_LENGTH = 1.05;

/**
 * The player's fists, feet and lathi. Left click attacks (punch, or swing with the lathi out),
 * Q kicks, right mouse blocks, 1 takes the lathi out / puts it away. `update` reports the move
 * on the frame its blow lands, so main.ts can apply hits.
 */
export class Melee {
  stickOut = false;
  private readonly player: PlayerController;
  private readonly stick: THREE.Mesh;
  private pending: { move: Move; t: number } | null = null;

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
  }

  /** Start an attack; returns false if the body is busy (mid-move, jumping, in a vehicle). */
  attack(move: Move = this.stickOut ? 'swing' : 'punch') {
    const m = MOVES[move];
    if (!this.player.playAction(m.clip, m.len, m.lunge)) return false;
    this.pending = { move, t: 0 };
    return true;
  }

  /** Returns the move whose blow lands this frame, if any. */
  update(dt: number): Move | null {
    if (!this.pending) return null;
    const before = this.pending.t;
    this.pending.t += dt;
    const m = MOVES[this.pending.move];
    const landed = before < m.strike && this.pending.t >= m.strike ? this.pending.move : null;
    if (this.pending.t >= m.len) this.pending = null;
    return landed;
  }
}
