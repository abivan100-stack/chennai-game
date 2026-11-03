import * as THREE from 'three';

const a = new THREE.Vector3();
const b = new THREE.Vector3();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();
const dq = new THREE.Quaternion();
const pq = new THREE.Quaternion();
const pqi = new THREE.Quaternion();

/**
 * Two-bone CCD: turn the forearm, then the upper arm, so the hand points at `goal` (world).
 * A few passes converge. Applied on top of whatever pose the animation left (call after the
 * mixer update). Used by the hero's meals and by NPCs eating at tables.
 */
export function reachCCD(upper: THREE.Object3D, fore: THREE.Object3D, hand: THREE.Object3D, goal: THREE.Vector3, passes = 4) {
  for (let pass = 0; pass < passes; pass++) {
    for (const bone of [fore, upper]) {
      bone.getWorldPosition(a);
      hand.getWorldPosition(b);
      v1.subVectors(b, a).normalize();
      v2.subVectors(goal, a).normalize();
      dq.setFromUnitVectors(v1, v2);
      bone.parent!.getWorldQuaternion(pq);
      // world delta -> bone-local: parent^-1 * delta * parent
      bone.quaternion.premultiply(pqi.copy(pq).invert().multiply(dq).multiply(pq));
      bone.updateMatrixWorld(true);
    }
  }
}

/** Hand path through one bite: 0 = at the food, 1 = at the mouth. */
export function biteCurve(u: number) {
  const s = (t: number) => t * t * (3 - 2 * t);
  if (u < 0.2) return 0; // scoop
  if (u < 0.45) return s((u - 0.2) / 0.25); // up
  if (u < 0.65) return 1; // chew
  return 1 - s((u - 0.65) / 0.35); // back down
}
