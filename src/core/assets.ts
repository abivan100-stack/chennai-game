import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/** Every asset load goes through this manager, so the loading screen sees all of it. */
export const loadingManager = new THREE.LoadingManager();

// Models are Meshopt-compressed with WebP textures (see scripts/build-models.mjs).
const gltfLoader = new GLTFLoader(loadingManager).setMeshoptDecoder(MeshoptDecoder);

/** Load a GLB from public/models/. */
export function loadModel(file: string): Promise<GLTF> {
  return gltfLoader.loadAsync(`${import.meta.env.BASE_URL}models/${file}`);
}
