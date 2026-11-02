import * as THREE from 'three';
import { loadModel } from '../core/assets';

/** Every character model is scaled to this height (metres) when loaded. */
export const CHARACTER_HEIGHT = 1.7;

/** A ready-to-clone character: scaled, feet at y = 0, facing +z, plus its animation clips. */
export interface CharacterAsset {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

/** Hero (Mixamo): one model file + one file per clip. Clip names: idle, walk, run, jump. */
const HERO = { model: 'hero.glb', clips: ['idle.glb', 'walk.glb', 'run.glb', 'jump.glb'] };

/**
 * Background NPCs (Quaternius, CC0). `rig` = skeleton family: models of the same rig share
 * clips, and only one file per rig ships them (see scripts/build-models.mjs).
 */
export const NPC_MODELS = {
  'man-casual': { file: 'npc-man-casual.glb', rig: 'qmen' },
  'man-farmer': { file: 'npc-man-farmer.glb', rig: 'qmen' },
  'man-worker': { file: 'npc-man-worker.glb', rig: 'qmen' },
  'woman-casual': { file: 'npc-woman-casual.glb', rig: 'qwomen' },
  'woman-formal': { file: 'npc-woman-formal.glb', rig: 'qwomen' },
  'woman-suit': { file: 'npc-woman-suit.glb', rig: 'qwomen' },
} as const;
export type NpcModelId = keyof typeof NPC_MODELS;

/** Scale to CHARACTER_HEIGHT, stand on y = 0, cast shadows, precompute bounds for culling. */
function fit(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  root.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    o.castShadow = true;
    o.skeleton.update(); // bone matrices start zeroed; bounds need the bind pose
    o.computeBoundingBox();
    o.computeBoundingSphere(); // clones copy this, so they never cull against an empty sphere
    box.union(o.boundingBox!.clone().applyMatrix4(o.matrixWorld));
  });
  const scale = CHARACTER_HEIGHT / (box.max.y - box.min.y);
  root.scale.multiplyScalar(scale);
  root.position.y -= box.min.y * scale;
  return root;
}

export async function loadCharacters() {
  const heroFiles = [HERO.model, ...HERO.clips].map(loadModel);
  const npcIds = Object.keys(NPC_MODELS) as NpcModelId[];
  const npcFiles = npcIds.map((id) => loadModel(NPC_MODELS[id].file));
  const [heroModel, ...heroClips] = await Promise.all(heroFiles);
  const npcGltfs = await Promise.all(npcFiles);

  const hero: CharacterAsset = { scene: fit(heroModel.scene), clips: heroClips.flatMap((g) => g.animations) };

  const rigClips = new Map<string, THREE.AnimationClip[]>();
  npcIds.forEach((id, i) => {
    if (npcGltfs[i].animations.length) rigClips.set(NPC_MODELS[id].rig, npcGltfs[i].animations);
  });
  const npcs = new Map<NpcModelId, CharacterAsset>();
  npcIds.forEach((id, i) => {
    npcs.set(id, { scene: fit(npcGltfs[i].scene), clips: rigClips.get(NPC_MODELS[id].rig) ?? [] });
  });
  return { hero, npcs };
}
