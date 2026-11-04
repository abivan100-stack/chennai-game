import * as THREE from 'three';
import { reachCCD } from './ik';

/**
 * Sitting a Mixamo-rigged person on a vehicle properly: hips on the seat, a little forward lean,
 * hands on the grips / steering wheel, feet on the pegs / floorboard / pedals. Applied on top of
 * the seated Driving clip after the mixer has posed the body (the hero every frame, traffic
 * drivers once when they're seated). All points are in the vehicle's model space.
 */
export interface RiderPose {
  hips: THREE.Vector3;
  /** Left / right wrist targets (left = +x: the vehicle faces +z). */
  hands: [THREE.Vector3, THREE.Vector3];
  /** Left / right ankle targets. */
  feet: [THREE.Vector3, THREE.Vector3];
  /** Forward lean of the upper body (radians). */
  lean: number;
}

interface Rig {
  hips: THREE.Object3D;
  spine: THREE.Object3D;
  arms: [THREE.Object3D, THREE.Object3D, THREE.Object3D][];
  legs: [THREE.Object3D, THREE.Object3D, THREE.Object3D][];
}
const rigs = new WeakMap<THREE.Object3D, Rig | null>();

function rigOf(body: THREE.Object3D): Rig | null {
  if (rigs.has(body)) return rigs.get(body)!;
  const b = (n: string) => body.getObjectByName(n);
  const names = ['Hips', 'Spine', 'LeftArm', 'LeftForeArm', 'LeftHand', 'RightArm', 'RightForeArm', 'RightHand', 'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'RightUpLeg', 'RightLeg', 'RightFoot'];
  const bones = names.map(b);
  const rig: Rig | null = bones.every(Boolean)
    ? {
        hips: bones[0]!,
        spine: bones[1]!,
        arms: [[bones[2]!, bones[3]!, bones[4]!], [bones[5]!, bones[6]!, bones[7]!]],
        legs: [[bones[8]!, bones[9]!, bones[10]!], [bones[11]!, bones[12]!, bones[13]!]],
      }
    : null; // not a Mixamo rig: leave the clip's pose alone
  rigs.set(body, rig);
  return rig;
}

const tmp = new THREE.Vector3();
const goal = new THREE.Vector3();
const axis = new THREE.Vector3();
const q = new THREE.Quaternion();
const pq = new THREE.Quaternion();
const pqi = new THREE.Quaternion();

/**
 * Pose `body` (the skinned model) on `vehicle`. `mover` is the object to shift so the hips land
 * on the seat (the body's root group). Call after the animation update for this frame.
 */
export function poseRider(body: THREE.Object3D, mover: THREE.Object3D, vehicle: THREE.Object3D, pose: RiderPose) {
  const rig = rigOf(body);
  // Hips onto the seat (whole body moves).
  mover.rotation.set(0, 0, 0);
  vehicle.updateMatrixWorld();
  mover.updateMatrixWorld(true);
  const hips = vehicle.worldToLocal((rig?.hips ?? body).getWorldPosition(tmp));
  mover.position.add(hips.subVectors(pose.hips, hips)); // mover is a direct child of the vehicle
  if (!rig) return;
  mover.updateMatrixWorld(true);
  // Lean forward: turn the spine about the vehicle's sideways (x) axis.
  if (pose.lean) {
    axis.set(1, 0, 0).transformDirection(vehicle.matrixWorld);
    q.setFromAxisAngle(axis, pose.lean);
    rig.spine.parent!.getWorldQuaternion(pq);
    rig.spine.quaternion.premultiply(pqi.copy(pq).invert().multiply(q).multiply(pq));
    rig.spine.updateMatrixWorld(true);
  }
  for (let s = 0; s < 2; s++) {
    const [upLeg, leg, foot] = rig.legs[s];
    reachCCD(upLeg, leg, foot, vehicle.localToWorld(goal.copy(pose.feet[s])), 3);
    const [arm, fore, hand] = rig.arms[s];
    reachCCD(arm, fore, hand, vehicle.localToWorld(goal.copy(pose.hands[s])), 3);
  }
}

/** Mirror a right-side point to the left (x -> -x): poses are built from one side. */
export const pair = (x: number, y: number, z: number): [THREE.Vector3, THREE.Vector3] => [new THREE.Vector3(Math.abs(x), y, z), new THREE.Vector3(-Math.abs(x), y, z)];
/** Pair centred on cx (a steering wheel off the middle). */
export const pairAt = (cx: number, dx: number, y: number, z: number): [THREE.Vector3, THREE.Vector3] => [new THREE.Vector3(cx + dx, y, z), new THREE.Vector3(cx - dx, y, z)];
