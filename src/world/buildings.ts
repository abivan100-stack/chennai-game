import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { ROAD_LINES, ROAD_WIDTH, WORLD_SIZE } from './ground';

/** Mylapore-ish painted-wall colours. */
const PALETTE = [0xe8a0b4, 0x6cc5c1, 0xf3d36b, 0xf2e8cf, 0x9fd8a4, 0xd98c5f, 0xa7b8e8, 0xf5f5f0];
const SIDEWALK = 2; // gap between road edge and building

/** Tiny seeded RNG so the test town looks the same on every load. */
function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/**
 * Box buildings in the blocks between roads: one per block, two in a few.
 * All drawn with ONE InstancedMesh (one draw call); each gets a static cuboid collider.
 */
export function createBuildings(scene: THREE.Scene, world: RAPIER.World) {
  const rand = seeded(42);
  const edges = [-WORLD_SIZE / 2, ...ROAD_LINES, WORLD_SIZE / 2];
  const boxes: { x: number; z: number; w: number; d: number; h: number }[] = [];

  for (let i = 0; i < edges.length - 1; i++) {
    for (let j = 0; j < edges.length - 1; j++) {
      // Usable block = between road edges, minus sidewalk.
      const x0 = edges[i] + ROAD_WIDTH / 2 + SIDEWALK;
      const x1 = edges[i + 1] - ROAD_WIDTH / 2 - SIDEWALK;
      const z0 = edges[j] + ROAD_WIDTH / 2 + SIDEWALK;
      const z1 = edges[j + 1] - ROAD_WIDTH / 2 - SIDEWALK;
      const split = (i * 4 + j) % 6 === 0 ? 2 : 1; // a few blocks get two buildings
      const slot = (x1 - x0) / split;
      for (let k = 0; k < split; k++) {
        const w = slot * (0.45 + rand() * 0.5);
        const d = (z1 - z0) * (0.4 + rand() * 0.55);
        const sx = x0 + slot * k;
        boxes.push({
          w,
          d,
          h: 5 + rand() * 20,
          x: sx + w / 2 + rand() * (slot - w),
          z: z0 + d / 2 + rand() * (z1 - z0 - d),
        });
      }
    }
  }

  const mesh = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ roughness: 0.85 }),
    boxes.length,
  );
  mesh.castShadow = mesh.receiveShadow = true;
  const m = new THREE.Matrix4();
  const color = new THREE.Color();
  boxes.forEach((b, i) => {
    mesh.setMatrixAt(i, m.makeScale(b.w, b.h, b.d).setPosition(b.x, b.h / 2, b.z));
    mesh.setColorAt(i, color.setHex(PALETTE[Math.floor(rand() * PALETTE.length)]));
    world.createCollider(RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2).setTranslation(b.x, b.h / 2, b.z));
  });
  mesh.computeBoundingSphere(); // instances span the whole map; keep frustum culling correct
  scene.add(mesh);
  return boxes.length;
}
