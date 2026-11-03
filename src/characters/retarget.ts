import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

/** Quaternius modular rig bone (names as three.js sanitises them: "UpperArm.L" -> "UpperArmL") -> Mixamo bone. */
export const QUATERNIUS_FROM_MIXAMO: Record<string, string> = (() => {
  const map: Record<string, string> = {
    Hips: 'Hips', Abdomen: 'Spine', Torso: 'Spine1', Chest: 'Spine2', Neck: 'Neck', Head: 'Head',
  };
  for (const [q, m] of [['L', 'Left'], ['R', 'Right']]) {
    Object.assign(map, {
      [`Shoulder${q}`]: `${m}Shoulder`, [`UpperArm${q}`]: `${m}Arm`, [`LowerArm${q}`]: `${m}ForeArm`, [`Wrist${q}`]: `${m}Hand`,
      [`UpperLeg${q}`]: `${m}UpLeg`, [`LowerLeg${q}`]: `${m}Leg`, [`Foot${q}`]: `${m}Foot`,
    });
    for (const f of ['Thumb', 'Index', 'Middle', 'Ring', 'Pinky']) {
      for (const i of [1, 2, 3]) map[`${f}${i}${q}`] = `${m}Hand${f}${i}`;
    }
  }
  return map;
})();

/** Hips and legs (Quaternius names): held at rest by an upper-body-only retarget. */
const LOWER_BODY = new Set(['Hips', 'UpperLegL', 'UpperLegR', 'LowerLegL', 'LowerLegR', 'FootL', 'FootR']);

function bonesOf(root: THREE.Object3D) {
  const bones: THREE.Bone[] = [];
  root.traverse((o) => {
    if ((o as THREE.Bone).isBone) bones.push(o as THREE.Bone);
  });
  return bones;
}

/**
 * Bake a clip from one skeleton onto a differently built one (e.g. Mixamo -> Quaternius).
 * Works in world space: each mapped target bone gets the source bone's rotation *change from
 * its rest pose*, applied on top of the target's own rest pose. Both rigs must share a rest
 * pose (both T-pose here) and face +z. Rotations only: the clip plays in place.
 * upperOnly: hips and legs stay at rest (standing straight). Mixamo's talking / yelling clips
 * crouch with bent knees, which reads as a squat on the shorter Quaternius legs.
 */
export function retargetClip(source: THREE.Object3D, target: THREE.Object3D, clip: THREE.AnimationClip, boneMap: Record<string, string>, fps = 30, upperOnly = false) {
  const src = cloneSkinned(source); // fresh rest pose, the real hero is untouched
  src.updateMatrixWorld(true);
  target.updateMatrixWorld(true);
  const srcBones = new Map(bonesOf(src).map((b) => [b.name, b]));
  const tgtBones = bonesOf(target); // traverse order = parents before children

  const q = () => new THREE.Quaternion();
  const srcRestInv = new Map<string, THREE.Quaternion>();
  for (const [name, b] of srcBones) srcRestInv.set(name, b.getWorldQuaternion(q()).invert());
  const tgtRest = new Map(tgtBones.map((b) => [b, b.getWorldQuaternion(q())]));
  const tgtLocalRest = new Map(tgtBones.map((b) => [b, b.quaternion.clone()]));
  // World rotation of each target root bone's (non-bone) parent: constant.
  const tgtParentRest = new Map(tgtBones.filter((b) => !(b.parent as THREE.Bone)?.isBone).map((b) => [b, b.parent!.getWorldQuaternion(q())]));

  const mapped = tgtBones.filter((b) => srcBones.has(boneMap[b.name]));
  const frames = Math.max(2, Math.round(clip.duration * fps) + 1);
  const times = new Float32Array(frames);
  const values = new Map(mapped.map((b) => [b, new Float32Array(frames * 4)]));

  const mixer = new THREE.AnimationMixer(src);
  mixer.clipAction(clip).play();
  const world = new Map<THREE.Bone, THREE.Quaternion>();
  const delta = q();
  const local = q();
  for (let f = 0; f < frames; f++) {
    const t = (f / (frames - 1)) * clip.duration;
    times[f] = t;
    mixer.setTime(t);
    src.updateMatrixWorld(true);
    for (const b of tgtBones) {
      const parentWorld = world.get(b.parent as THREE.Bone) ?? tgtParentRest.get(b)!;
      const rest = upperOnly && LOWER_BODY.has(b.name);
      const s = rest ? undefined : srcBones.get(boneMap[b.name]);
      let w: THREE.Quaternion;
      if (rest && values.has(b)) tgtLocalRest.get(b)!.toArray(values.get(b)!, f * 4);
      if (s) {
        delta.multiplyQuaternions(s.getWorldQuaternion(q()), srcRestInv.get(s.name)!);
        w = delta.clone().multiply(tgtRest.get(b)!);
        local.copy(parentWorld).invert().multiply(w);
        local.toArray(values.get(b)!, f * 4);
      } else {
        w = parentWorld.clone().multiply(tgtLocalRest.get(b)!);
      }
      world.set(b, w);
    }
  }
  mixer.stopAllAction();

  const tracks = mapped.map((b) => new THREE.QuaternionKeyframeTrack(`${b.name}.quaternion`, times, values.get(b)!));
  return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}
