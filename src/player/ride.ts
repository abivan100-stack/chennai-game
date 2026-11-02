import * as THREE from 'three';
import type { Input } from '../core/input';
import { AutoRickshaw, ENTRY_OFFSET, SEAT } from '../vehicles/auto';
import type { PlayerController } from './controller';

const APPROACH_TIMEOUT = 4; // s; give up walking and climb in anyway
const ARRIVE_DIST = 0.15;
const HIPS_STANDING = 0.9; // hip height of the 1.7 m hero standing (measured)
const TURN_SECONDS = 0.4; // turn your back to the auto before sitting
const SIT_SECONDS = 2.1; // Stand To Sit / Sit To Stand clip length we use
const SWIVEL_SECONDS = 0.6; // turn on the seat to face forward / sideways
const EXIT_MAX_SPEED = 1.5; // m/s: you can only hop out when (nearly) stopped

type Phase = 'onFoot' | 'approach' | 'turnOut' | 'sitIn' | 'swivelIn' | 'driving' | 'swivelOut' | 'standOut';

const smooth = (t: number) => {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};
const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

/**
 * Getting into, driving, and getting out of the auto.
 *
 * The hips are steered directly ("pinned") every frame while the clips play, so the body
 * moves in one straight line from standing beside the auto onto the driver's seat, then
 * swivels in place to face the handlebar. Getting out is the exact reverse.
 *
 *   approach -> turnOut (back to the auto) -> sitIn ("Stand To Sit") -> swivelIn (-> "Driving")
 *   -> driving (W/S, A/D, Space) -> swivelOut -> standOut ("Sit To Stand") -> onFoot
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
  private startYaw = 0;
  private yaw = 0; // model yaw inside the auto
  private readonly hipTarget = new THREE.Vector3();
  private pinned = false;
  private readonly tmp = new THREE.Vector3();

  constructor(player: PlayerController, auto: AutoRickshaw) {
    this.player = player;
    this.auto = auto;
    this.hips = player.model.getObjectByName('Hips')!;
  }

  get driving() {
    return this.phase === 'driving';
  }

  get canExit() {
    return this.driving && Math.abs(this.auto.speed) < EXIT_MAX_SPEED;
  }

  /** Standing spot beside the seat (auto-local), at hip height. */
  private standPoint(out: THREE.Vector3) {
    return out.set(this.side * ENTRY_OFFSET.x, HIPS_STANDING, ENTRY_OFFSET.z);
  }

  private get outwardYaw() {
    return (this.side * Math.PI) / 2;
  }

  enter() {
    if (this.phase !== 'onFoot') return;
    const local = this.auto.group.worldToLocal(this.player.position.clone());
    this.side = local.x >= 0 ? 1 : -1;
    this.player.walkTo(this.auto.group.localToWorld(this.standPoint(this.tmp).setY(0)));
    this.go('approach');
  }

  exit() {
    if (!this.canExit) return;
    this.auto.park();
    this.player.animator.play('stand_up', { once: true, fade: SWIVEL_SECONDS });
    this.player.animator.setSpeed(0); // hold the seated first frame while swivelling
    this.go('swivelOut');
    this.onDrivingChange(false);
  }

  private go(phase: Phase) {
    this.phase = phase;
    this.t = 0;
  }

  /** Phase logic. Call once per frame before the animation update. */
  update(dt: number, input: Input) {
    this.t += dt;
    const m = this.player.model;
    switch (this.phase) {
      case 'approach': {
        const target = this.auto.group.localToWorld(this.standPoint(this.tmp).setY(0));
        const d = Math.hypot(target.x - this.player.position.x, target.z - this.player.position.z);
        if (d > ARRIVE_DIST && this.t < APPROACH_TIMEOUT) return;
        // Hand the model over to the auto, keeping where it stands and which way it faces.
        this.player.walkTo(null);
        this.player.setAway(true);
        this.auto.park();
        this.auto.group.attach(m);
        this.startYaw = m.rotation.y;
        this.yaw = this.startYaw;
        this.pinned = true;
        this.standPoint(this.hipTarget);
        this.player.animator.play('idle', { fade: 0.2 });
        this.go('turnOut');
        return;
      }
      case 'turnOut': {
        this.yaw = lerpAngle(this.startYaw, this.outwardYaw, smooth(this.t / TURN_SECONDS));
        if (this.t < TURN_SECONDS) return;
        this.player.animator.play('sit_down', { once: true, fade: 0.25 });
        this.go('sitIn');
        return;
      }
      case 'sitIn': {
        // Straight line from standing beside the auto to the driver's seat.
        this.standPoint(this.hipTarget).lerp(SEAT, smooth(this.t / SIT_SECONDS));
        if (this.t < SIT_SECONDS) return;
        this.player.animator.play('drive', { fade: SWIVEL_SECONDS });
        this.go('swivelIn');
        return;
      }
      case 'swivelIn': {
        this.hipTarget.copy(SEAT);
        this.yaw = lerpAngle(this.outwardYaw, 0, smooth(this.t / SWIVEL_SECONDS));
        if (this.t < SWIVEL_SECONDS) return;
        this.go('driving');
        this.onDrivingChange(true);
        return;
      }
      case 'driving': {
        this.hipTarget.copy(SEAT);
        this.yaw = 0;
        const throttle = Number(input.isDown('KeyW')) - Number(input.isDown('KeyS'));
        const steer = Number(input.isDown('KeyA')) - Number(input.isDown('KeyD'));
        this.auto.control(throttle, steer, input.isDown('Space'));
        return;
      }
      case 'swivelOut': {
        this.hipTarget.copy(SEAT);
        this.yaw = lerpAngle(0, this.outwardYaw, smooth(this.t / SWIVEL_SECONDS));
        if (this.t < SWIVEL_SECONDS) return;
        this.player.animator.setSpeed(1);
        this.go('standOut');
        return;
      }
      case 'standOut': {
        this.hipTarget.copy(SEAT).lerp(this.standPoint(this.tmp), smooth(this.t / SIT_SECONDS));
        if (this.t < SIT_SECONDS) return;
        // Hand control back: the capsule goes under the hips, the model goes back on the capsule.
        const feet = this.hips.getWorldPosition(new THREE.Vector3());
        feet.y = this.auto.group.position.y + 0.2; // drop onto whatever is below (road or kerb)
        this.pinned = false;
        this.player.placeAt(feet, this.auto.heading + this.outwardYaw);
        this.player.attachModel();
        this.player.animator.play('idle', { fade: 0.2 });
        this.player.setAway(false);
        this.go('onFoot');
        return;
      }
    }
  }

  /**
   * After the animation has posed the skeleton: turn the model and shift it so the hips sit
   * exactly on `hipTarget`. Overrides the clips' own root motion.
   */
  lateUpdate() {
    if (!this.pinned) return;
    const m = this.player.model;
    m.rotation.set(0, this.yaw, 0);
    this.auto.group.updateMatrixWorld();
    m.updateMatrixWorld(true);
    const hipsLocal = this.auto.group.worldToLocal(this.hips.getWorldPosition(this.tmp));
    m.position.add(hipsLocal.subVectors(this.hipTarget, hipsLocal));
  }

  /** Get out immediately, no animation (arrested / knocked out). */
  forceOut() {
    if (this.phase === 'onFoot') return;
    const wasDriving = this.phase === 'driving';
    this.player.walkTo(null);
    this.pinned = false;
    const out = this.auto.group.localToWorld(this.standPoint(this.tmp).setY(0));
    this.player.placeAt(out, this.auto.heading + this.outwardYaw);
    this.player.attachModel();
    this.player.animator.play('idle', { fade: 0 });
    this.player.setAway(false);
    this.auto.park();
    this.go('onFoot');
    if (wasDriving) this.onDrivingChange(false);
  }

  /** Keep the player's logical position on the auto while inside (camera, NPCs, prompts). */
  syncPosition() {
    if (this.phase === 'onFoot' || this.phase === 'approach') return;
    this.player.position.copy(this.auto.group.position);
    this.player.position.y += 1;
  }
}
