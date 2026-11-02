import * as THREE from 'three';
import type { Input } from '../core/input';
import { AutoRickshaw, ENTRY_OFFSET, SEAT } from '../vehicles/auto';
import type { PlayerController } from './controller';

const APPROACH_TIMEOUT = 4; // s; give up walking and climb in anyway
const ARRIVE_DIST = 0.15;
const SIT_LIFT = 0.42; // how far the feet rise while sitting down (auto floor + seat)
const SLIDE_SECONDS = 0.7;
const STAND_UP_TRAVEL = 0.46; // m the Mixamo "Sit To Stand" clip moves the hips forward
const EXIT_MAX_SPEED = 1.5; // m/s: you can only hop out when (nearly) stopped

type Phase = 'onFoot' | 'approach' | 'sitDown' | 'slideIn' | 'driving' | 'slideOut' | 'standUp';

const smooth = (t: number) => t * t * (3 - 2 * t);
const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/**
 * Getting into, driving, and getting out of the auto.
 *
 *   approach: player walks to the side of the auto
 *   sitDown:  "Stand To Sit" facing outward, stepping up onto the floor
 *   slideIn:  shuffle onto the driver seat and turn forward, blending into "Driving"
 *   driving:  W/S throttle, A/D steer, Space handbrake, F to get out (when slow)
 *   slideOut / standUp: the reverse, using "Sit To Stand"
 *
 * The hero model is parented to the auto while inside; the capsule is switched off.
 */
export class Ride {
  phase: Phase = 'onFoot';
  /** Called when the player starts / stops driving (camera, HUD, mission text). */
  onDrivingChange: (driving: boolean) => void = () => {};

  private readonly player: PlayerController;
  private readonly auto: AutoRickshaw;
  private readonly hips: THREE.Object3D;
  private side = 1; // +1 = auto's local +x side
  private t = 0;
  private readonly from = new THREE.Vector3();
  private fromYaw = 0;

  constructor(player: PlayerController, auto: AutoRickshaw) {
    this.player = player;
    this.auto = auto;
    this.hips = player.model.getObjectByName('Hips')!;
  }

  get driving() {
    return this.phase === 'driving';
  }

  /** Busy with an enter/exit animation (blocks other interactions). */
  get busy() {
    return this.phase !== 'onFoot' && this.phase !== 'driving';
  }

  get canExit() {
    return this.driving && Math.abs(this.auto.speed) < EXIT_MAX_SPEED;
  }

  /** Entry point (local to the auto) for a side. */
  private entry(side: number, out = new THREE.Vector3()) {
    return out.set(side * ENTRY_OFFSET.x, 0, ENTRY_OFFSET.z);
  }

  enter() {
    if (this.phase !== 'onFoot') return;
    const local = this.auto.group.worldToLocal(this.player.position.clone());
    this.side = local.x >= 0 ? 1 : -1;
    const target = this.auto.group.localToWorld(this.entry(this.side));
    this.player.walkTo(target);
    this.phase = 'approach';
    this.t = 0;
  }

  exit() {
    if (!this.canExit) return;
    this.auto.park();
    const m = this.player.model;
    this.from.copy(m.position);
    this.fromYaw = m.rotation.y;
    this.player.animator.play('stand_up', { once: true, fade: 0.5 });
    this.player.animator.setSpeed(0); // hold the seated first frame while sliding
    this.phase = 'slideOut';
    this.t = 0;
    this.onDrivingChange(false);
  }

  update(dt: number, input: Input) {
    this.t += dt;
    const m = this.player.model;
    switch (this.phase) {
      case 'approach': {
        const target = this.auto.group.localToWorld(this.entry(this.side));
        const d = Math.hypot(target.x - this.player.position.x, target.z - this.player.position.z);
        if (d > ARRIVE_DIST && this.t < APPROACH_TIMEOUT) return;
        this.player.walkTo(null);
        this.player.setAway(true);
        this.auto.park();
        this.auto.group.attach(m);
        m.position.copy(this.entry(this.side));
        m.rotation.set(0, (this.side * Math.PI) / 2, 0); // back to the auto
        this.player.animator.play('sit_down', { once: true, fade: 0.25 });
        this.phase = 'sitDown';
        this.t = 0;
        return;
      }
      case 'sitDown': {
        const dur = 2.1;
        m.position.y = SIT_LIFT * smooth(Math.min(this.t / (dur * 0.7), 1));
        if (this.t < dur) return;
        this.from.copy(m.position);
        this.fromYaw = m.rotation.y;
        this.player.animator.play('drive', { fade: SLIDE_SECONDS });
        this.phase = 'slideIn';
        this.t = 0;
        return;
      }
      case 'slideIn': {
        const k = smooth(Math.min(this.t / SLIDE_SECONDS, 1));
        m.position.lerpVectors(this.from, SEAT, k);
        m.rotation.y = lerpAngle(this.fromYaw, 0, k);
        if (k < 1) return;
        this.phase = 'driving';
        this.onDrivingChange(true);
        return;
      }
      case 'driving': {
        const throttle = Number(input.isDown('KeyW')) - Number(input.isDown('KeyS'));
        const steer = Number(input.isDown('KeyA')) - Number(input.isDown('KeyD'));
        this.auto.control(throttle, steer, input.isDown('Space'));
        return;
      }
      case 'slideOut': {
        // Turn to face out and shuffle to the seat edge so standing up lands at the entry point.
        const edge = this.entry(this.side);
        edge.x -= this.side * STAND_UP_TRAVEL;
        edge.y = SIT_LIFT;
        const k = smooth(Math.min(this.t / SLIDE_SECONDS, 1));
        m.position.lerpVectors(this.from, edge, k);
        m.rotation.y = lerpAngle(this.fromYaw, (this.side * Math.PI) / 2, k);
        if (k < 1) return;
        this.player.animator.setSpeed(1);
        this.phase = 'standUp';
        this.t = 0;
        return;
      }
      case 'standUp': {
        const dur = 2.1;
        m.position.y = SIT_LIFT * (1 - smooth(Math.min(this.t / (dur * 0.6), 1)));
        if (this.t < dur) return;
        // Hand control back: capsule goes where the hips ended up, model back on the capsule.
        const feet = this.hips.getWorldPosition(new THREE.Vector3());
        feet.y = this.auto.group.position.y;
        const out = new THREE.Vector3(this.side, 0, 0).transformDirection(this.auto.group.matrixWorld);
        this.player.placeAt(feet, Math.atan2(out.x, out.z));
        this.player.attachModel();
        this.player.animator.play('idle', { fade: 0.2 });
        this.player.setAway(false);
        this.phase = 'onFoot';
        return;
      }
    }
  }

  /** Keep the player's logical position on the auto while inside (camera, NPCs, prompts). */
  syncPosition() {
    if (this.phase === 'onFoot' || this.phase === 'approach') return;
    this.player.position.copy(this.auto.group.position);
    this.player.position.y += 1;
  }
}
