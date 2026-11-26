import * as THREE from 'three';

/**
 * Trees that other builders want (yards, kits, parks): they register a spot here and props.ts
 * plants them with the street trees (leaf-card canopies, wind, LOD, one draw call), so every tree
 * in town looks the same. Builders keep making their own trunk colliders.
 */
export const TREE_SPOTS: THREE.Matrix4[] = [];

let seed = 5;
const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** A tree at (x, y, z) world, `s` = size relative to a street tree. */
export function addTreeSpot(x: number, y: number, z: number, s = 1) {
  TREE_SPOTS.push(new THREE.Matrix4().makeRotationY(rand() * Math.PI * 2).scale(new THREE.Vector3(s, s, s)).setPosition(x, y, z));
}
