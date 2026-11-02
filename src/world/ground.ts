import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WORLD_SIZE = 200; // metres, square, centred on the origin
export const ROAD_WIDTH = 10;
/** Road centre lines, used on both axes (x = ... and z = ...). Buildings avoid these. */
export const ROAD_LINES = [-50, 0, 50];

const HALF = WORLD_SIZE / 2;

/** Flat ground, a road grid (merged into one draw call) and invisible boundary walls. */
export function createGround(scene: THREE.Scene, world: RAPIER.World) {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x8a8068, roughness: 1 }),
  );
  ground.receiveShadow = true;
  scene.add(ground);

  const strips = ROAD_LINES.flatMap((c) => [
    new THREE.PlaneGeometry(ROAD_WIDTH, WORLD_SIZE).rotateX(-Math.PI / 2).translate(c, 0.02, 0), // north-south
    new THREE.PlaneGeometry(WORLD_SIZE, ROAD_WIDTH).rotateX(-Math.PI / 2).translate(0, 0.02, c), // east-west
  ]);
  const roads = new THREE.Mesh(mergeGeometries(strips), new THREE.MeshStandardMaterial({ color: 0x3a3a3c, roughness: 0.95 }));
  roads.receiveShadow = true;
  scene.add(roads);

  // Physics: a thick slab for the ground (thin colliders let fast things tunnel) + 4 edge walls.
  world.createCollider(RAPIER.ColliderDesc.cuboid(HALF, 0.5, HALF).setTranslation(0, -0.5, 0));
  for (const [x, z, hx, hz] of [
    [HALF, 0, 0.5, HALF],
    [-HALF, 0, 0.5, HALF],
    [0, HALF, HALF, 0.5],
    [0, -HALF, HALF, 0.5],
  ]) {
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, 10, hz).setTranslation(x, 10, z));
  }
}
