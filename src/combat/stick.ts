import * as THREE from 'three';

const LENGTH = 1.0;
const SWING_SECONDS = 0.42;
const STRIKE_AT = 0.2; // s into the swing when the blow lands
export const STICK_REACH = 1.9; // m in front of the hero

/**
 * A bamboo lathi in the hero's right hand. 1 toggles it, click swings it. The swing is
 * procedural (no Mixamo clip needed): the upper arm and forearm are turned on top of whatever
 * the animation is doing, and `update` returns true on the frame the blow lands.
 */
export class Stick {
  equipped = false;
  private readonly mesh: THREE.Mesh;
  private readonly arm: THREE.Object3D;
  private readonly fore: THREE.Object3D;
  private t = -1; // seconds into the current swing, -1 = idle
  private readonly q = new THREE.Quaternion();
  private readonly axis = new THREE.Vector3();

  constructor(hero: THREE.Object3D) {
    const hand = hero.getObjectByName('RightHand')!;
    this.arm = hero.getObjectByName('RightArm')!;
    this.fore = hero.getObjectByName('RightForeArm')!;
    const geo = new THREE.CylinderGeometry(0.018, 0.022, LENGTH, 8).translate(0, LENGTH / 2 - 0.15, 0);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xa8814a, roughness: 0.8 }));
    this.mesh.castShadow = true;
    this.mesh.visible = false;
    // Hand space: the stick runs across the palm, sticking out past the thumb (gripped like a lathi).
    this.mesh.rotation.set(Math.PI / 2, 0, 0);
    this.mesh.position.set(0, 0.08, 0.02);
    // Bones are scaled by the hero's armature (0.01 * fit): undo it so the stick keeps its size.
    hand.updateWorldMatrix(true, false);
    const s = new THREE.Vector3().setFromMatrixScale(hand.matrixWorld);
    const heroScale = new THREE.Vector3().setFromMatrixScale(hero.matrixWorld);
    this.mesh.scale.setScalar(heroScale.x / s.x);
    this.mesh.position.multiplyScalar(heroScale.x / s.x);
    hand.add(this.mesh);
  }

  toggle() {
    this.equipped = !this.equipped;
    this.mesh.visible = this.equipped;
  }

  /** Start a swing (if holding the stick and not already swinging). */
  swing() {
    if (!this.equipped || this.t >= 0) return false;
    this.t = 0;
    return true;
  }

  get swinging() {
    return this.t >= 0;
  }

  /**
   * After the animation update: add the swing on top of the arm pose.
   * Returns true on the frame the blow lands.
   */
  update(dt: number) {
    if (this.t < 0) return false;
    const before = this.t;
    this.t += dt;
    // Raise (0 -> -1) then strike down/across (-1 -> +0.6) then settle (-> 0).
    const k = this.t / SWING_SECONDS;
    const lift = k < 0.4 ? -k / 0.4 : k < 0.7 ? -1 + ((k - 0.4) / 0.3) * 1.6 : 0.6 * (1 - (k - 0.7) / 0.3);
    // Upper arm swings forward/up around its local Z, forearm bends with it.
    this.arm.quaternion.multiply(this.q.setFromAxisAngle(this.axis.set(0, 0, 1), lift * 1.3));
    this.arm.quaternion.multiply(this.q.setFromAxisAngle(this.axis.set(1, 0, 0), lift * 0.6));
    this.fore.quaternion.multiply(this.q.setFromAxisAngle(this.axis.set(0, 0, 1), Math.abs(lift) * 0.8));
    const struck = before < STRIKE_AT && this.t >= STRIKE_AT;
    if (this.t >= SWING_SECONDS) this.t = -1;
    return struck;
  }
}
