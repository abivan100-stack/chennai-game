import * as THREE from 'three';
import { biteCurve, reachCCD } from '../characters/ik';
import type { Input } from '../core/input';
import type { Eatery } from '../world/eateries';
import type { FoodItem } from '../world/food';
import type { PlayerController } from './controller';

const APPROACH_TIMEOUT = 4;
const ARRIVE_DIST = 0.15;
const HIPS_STANDING = 0.9; // same as the auto (ride.ts)
const HIPS_ABOVE_SEAT = 0.1; // hip joint height over the stool top when seated
const STAND_OUT = 0.45; // stand this far in front of the stool before sitting
const TURN_SECONDS = 0.4;
const SIT_SECONDS = 2.1;
const SWIVEL_SECONDS = 0.6; // turn on the stool to face the table
const BITE_SECONDS = 2.2; // plate -> mouth -> chew -> back
const ARM_BLEND = 0.6; // seconds to move the hand onto / off the food
const MOUTH = { forward: 0.13, down: 0.03 }; // from the Head bone
const MOVE_KEYS = ['KeyW', 'KeyA', 'KeyS', 'KeyD'];

type Phase = 'none' | 'approach' | 'turn' | 'sit' | 'swivelIn' | 'eat' | 'swivelOut' | 'stand' | 'snack';

const smooth = (t: number) => {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};
const lerpAngle = (a: number, b: number, t: number) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;


/**
 * Eating, simulated. Hotel: walk to the stool, turn, sit ("Stand To Sit", hips pinned on the
 * stool), then the right hand goes from the banana leaf to the mouth bite after bite (2-bone
 * CCD IK on RightArm/RightForeArm over the seated pose) while the food on the leaf shrinks and
 * energy fills; then stand up. Shop: eat the snack standing, same hand motion. WASD stops early.
 */
export class Meal {
  phase: Phase = 'none';
  /** Called once the meal is over (finished or stopped). */
  onDone: (finished: boolean) => void = () => {};
  /** Each time the hand reaches the mouth (for the munch sound). */
  onBite: () => void = () => {};
  private bitesTaken = 0;

  private readonly player: PlayerController;
  private readonly scene: THREE.Scene;
  private readonly hips: THREE.Object3D;
  private readonly arm: THREE.Object3D;
  private readonly fore: THREE.Object3D;
  private readonly hand: THREE.Object3D;
  private readonly head: THREE.Object3D;
  private readonly plate = new THREE.Group();
  private readonly plateFood: THREE.Mesh;
  private readonly leaf: THREE.Mesh;
  private readonly china: THREE.Group;
  private readonly handFood: THREE.Mesh;
  private eatery: Eatery | null = null;
  private item: FoodItem | null = null;
  private t = 0;
  private eatT = 0;
  private duration = 0;
  private startYaw = 0;
  private yaw = 0;
  private pinned = false;
  private ik = false;
  private finished = false;
  private readonly hipTarget = new THREE.Vector3();
  private readonly standSpot = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly a = new THREE.Vector3();
  private readonly b = new THREE.Vector3();
  private readonly goal = new THREE.Vector3();
  private readonly v1 = new THREE.Vector3();
  private readonly handFoodScale: number;

  constructor(player: PlayerController, scene: THREE.Scene) {
    this.player = player;
    this.scene = scene;
    const bone = (n: string) => player.model.getObjectByName(n)!;
    this.hips = bone('Hips');
    this.arm = bone('RightArm');
    this.fore = bone('RightForeArm');
    this.hand = bone('RightHand');
    this.head = bone('Head');

    // Banana leaf + a heap of food (recoloured per dish).
    this.leaf = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.006, 0.3), new THREE.MeshStandardMaterial({ color: 0x3d8b2f, roughness: 0.5 }));
    // ...or, in the hotel restaurants, a white china plate with a gold rim.
    this.china = new THREE.Group();
    this.china.add(
      new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.12, 0.016, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.25 })),
      new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.005, 4, 24).rotateX(Math.PI / 2).translate(0, 0.009, 0), new THREE.MeshStandardMaterial({ color: 0xc9a24a, roughness: 0.4 })),
    );
    this.plateFood = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8).scale(1, 0.4, 0.8), new THREE.MeshStandardMaterial({ roughness: 0.8 }));
    this.plateFood.position.y = 0.012;
    this.plate.add(this.leaf, this.china, this.plateFood);
    this.plate.visible = false;
    scene.add(this.plate);

    // Snack in the hand. Bones carry the armature's 0.01 scale: undo it (like the lathi).
    player.model.updateWorldMatrix(true, true);
    const k = new THREE.Vector3().setFromMatrixScale(player.model.matrixWorld).x / new THREE.Vector3().setFromMatrixScale(this.hand.matrixWorld).x;
    this.handFood = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.11), new THREE.MeshStandardMaterial({ roughness: 0.7 }));
    this.handFood.scale.setScalar(k);
    this.handFoodScale = k;
    this.handFood.position.set(0, 0.09 * k, 0.03 * k);
    this.handFood.visible = false;
    this.hand.add(this.handFood);
  }

  get busy() {
    return this.phase !== 'none';
  }

  /** Energy the food gives per second while actually eating. */
  get energyRate() {
    const eating = (this.phase === 'eat' || this.phase === 'snack') && this.eatT > ARM_BLEND && this.eatT < this.duration - ARM_BLEND;
    return this.item && eating ? this.item.energy / this.item.seconds : 0;
  }

  start(e: Eatery, item: FoodItem) {
    this.eatery = e;
    this.item = item;
    this.finished = true;
    this.bitesTaken = 0;
    this.duration = item.seconds + 2 * ARM_BLEND;
    (this.plateFood.material as THREE.MeshStandardMaterial).color.set(item.color);
    (this.handFood.material as THREE.MeshStandardMaterial).color.set(item.color);
    if (e.menu.kind === 'hotel') {
      this.standSpot.set(Math.sin(e.seatYaw), 0, Math.cos(e.seatYaw)).multiplyScalar(STAND_OUT).add(e.seat);
      this.standSpot.y = e.seat.y - 0.46; // sidewalk level
      this.player.walkTo(this.standSpot.clone());
      this.go('approach');
    } else {
      this.player.setAway(true);
      this.player.animator.play('idle', { fade: 0.2 });
      this.handFood.visible = true;
      this.ik = true;
      this.eatT = 0;
      this.go('snack');
    }
  }

  /** Arrested / knocked out mid-meal: drop everything. */
  forceStop() {
    if (!this.busy) return;
    this.player.walkTo(null);
    if (this.pinned) {
      this.pinned = false;
      this.player.placeAt(this.standSpot, this.eatery!.seatYaw);
      this.player.attachModel();
    }
    this.end(false);
  }

  private go(phase: Phase) {
    this.phase = phase;
    this.t = 0;
  }

  private end(finished: boolean) {
    this.ik = false;
    this.plate.visible = false;
    this.handFood.visible = false;
    this.player.setAway(false);
    this.player.animator.play('idle', { fade: 0.2 });
    this.phase = 'none';
    this.onDone(finished);
  }

  /** Phase logic, once per frame before the animation update. */
  update(dt: number, input: Input) {
    if (!this.busy) return;
    this.t += dt;
    const e = this.eatery!;
    const wantsToGo = MOVE_KEYS.some((k) => input.wasPressed(k));
    switch (this.phase) {
      case 'approach': {
        const d = Math.hypot(this.standSpot.x - this.player.position.x, this.standSpot.z - this.player.position.z);
        if (d > ARRIVE_DIST && this.t < APPROACH_TIMEOUT) return;
        // Take the model off the capsule; from here the hips are steered directly.
        this.player.walkTo(null);
        this.player.setAway(true);
        const m = this.player.model;
        this.scene.attach(m);
        this.startYaw = this.yaw = m.rotation.y;
        this.hipTarget.copy(this.standSpot).setY(this.standSpot.y + HIPS_STANDING);
        this.pinned = true;
        this.player.animator.play('idle', { fade: 0.2 });
        this.go('turn');
        return;
      }
      case 'turn':
        this.yaw = lerpAngle(this.startYaw, e.seatYaw, smooth(this.t / TURN_SECONDS));
        if (this.t < TURN_SECONDS) return;
        this.player.animator.play('sit_down', { once: true, fade: 0.25 });
        this.go('sit');
        return;
      case 'sit':
        this.hipTarget.copy(this.standSpot).setY(this.standSpot.y + HIPS_STANDING);
        this.hipTarget.lerp(this.tmp.copy(e.seat).setY(e.seat.y + HIPS_ABOVE_SEAT), smooth(this.t / SIT_SECONDS));
        if (this.t < SIT_SECONDS) return;
        this.player.animator.play('sit_idle', { fade: 0.4 }); // relaxed seated loop (Mixamo Sitting)
        this.go('swivelIn');
        return;
      case 'swivelIn':
        this.yaw = lerpAngle(e.seatYaw, e.eatYaw, smooth(this.t / SWIVEL_SECONDS));
        if (this.t < SWIVEL_SECONDS) return;
        // Leaf goes on the table, food heaped on it.
        this.plate.position.copy(e.table);
        this.leaf.visible = !e.china;
        this.china.visible = !!e.china;
        this.plate.rotation.y = e.eatYaw;
        this.plateFood.scale.setScalar(1);
        this.plate.visible = true;
        this.ik = true;
        this.eatT = 0;
        this.go('eat');
        return;
      case 'eat':
      case 'snack': {
        this.eatT += dt;
        if (wantsToGo && this.eatT < this.duration - ARM_BLEND) {
          this.eatT = this.duration - ARM_BLEND; // put it down and go
          this.finished = false;
        }
        // Food shrinks a step at every bite (when the hand reaches the mouth).
        const bites = Math.ceil(this.item!.seconds / BITE_SECONDS);
        const done = Math.min(bites, Math.floor((this.eatT - ARM_BLEND) / BITE_SECONDS + 0.55));
        const left = Math.max(0.15, 1 - done / bites);
        if (done > this.bitesTaken) {
          this.bitesTaken = done;
          this.onBite();
        }
        if (this.phase === 'eat') this.plateFood.scale.setScalar(left);
        else this.handFood.scale.setScalar(left * this.handFoodScale);
        if (this.eatT < this.duration) return;
        this.ik = false;
        if (this.phase === 'snack') {
          this.handFood.scale.setScalar(this.handFoodScale);
          this.end(this.finished);
          return;
        }
        this.plate.visible = false;
        this.go('swivelOut');
        return;
      }
      case 'swivelOut':
        this.yaw = lerpAngle(e.eatYaw, e.seatYaw, smooth(this.t / SWIVEL_SECONDS));
        if (this.t < SWIVEL_SECONDS) return;
        this.player.animator.play('stand_up', { once: true, fade: 0.3 });
        this.go('stand');
        return;
      case 'stand': {
        this.hipTarget.copy(e.seat).setY(e.seat.y + HIPS_ABOVE_SEAT);
        this.hipTarget.lerp(this.tmp.copy(this.standSpot).setY(this.standSpot.y + HIPS_STANDING), smooth(this.t / SIT_SECONDS));
        if (this.t < SIT_SECONDS) return;
        this.pinned = false;
        this.player.placeAt(this.standSpot, e.seatYaw);
        this.player.attachModel();
        this.end(this.finished);
        return;
      }
    }
  }

  /** After the animation has posed the skeleton: pin the hips, then move the hand. */
  lateUpdate() {
    if (!this.busy) return;
    const m = this.player.model;
    if (this.pinned) {
      m.rotation.set(0, this.yaw, 0);
      m.updateMatrixWorld(true);
      this.hips.getWorldPosition(this.tmp);
      m.position.add(this.goal.subVectors(this.hipTarget, this.tmp));
    }
    if (!this.ik) return;
    m.updateMatrixWorld(true);
    // Where the hand is in the plain animation, where the food is, where the mouth is.
    this.hand.getWorldPosition(this.b);
    const rest = this.tmp.copy(this.b);
    const yaw = this.pinned ? this.yaw : this.player.mesh.rotation.y;
    const food = this.phase === 'eat' ? this.plate.localToWorld(this.a.set(0, 0.03, 0)) : this.a.copy(rest).setY(rest.y + 0.15);
    const mouth = this.head.getWorldPosition(this.v1);
    mouth.x += Math.sin(yaw) * MOUTH.forward;
    mouth.z += Math.cos(yaw) * MOUTH.forward;
    mouth.y -= MOUTH.down;
    const u = ((this.eatT - ARM_BLEND) / BITE_SECONDS) % 1;
    this.goal.copy(food).lerp(mouth, this.eatT < ARM_BLEND ? 0 : biteCurve(u < 0 ? 0 : u));
    // Ease the hand on to the food at the start and off it at the end.
    const blend = smooth(this.eatT / ARM_BLEND) * (1 - smooth((this.eatT - (this.duration - ARM_BLEND)) / ARM_BLEND));
    this.goal.lerp(rest, 1 - blend);
    this.reach(this.goal);
  }

  private reach(goal: THREE.Vector3) {
    reachCCD(this.arm, this.fore, this.hand, goal);
  }
}
