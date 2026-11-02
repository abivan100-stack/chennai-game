import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { HALF, ROAD_HALF, ROAD_LINES, SIDEWALK_HEIGHT, roadSpans } from './layout';
import { glowTexture } from './textures';

const CURB_OFFSET = 0.35; // props stand this far onto the sidewalk from the curb
const LAMP_SPACING = 25;
const TREE_SPACING = 13;
const LAMP_HEIGHT = 6.5;

function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/**
 * Street lamps (glow + light pool at night) and neem-style trees along every sidewalk.
 * Instanced: 5 draw calls for all of them. Each gets a thin collider.
 */
export function createProps(scene: THREE.Scene, world: RAPIER.World) {
  const rand = seeded(11);
  const lamps: THREE.Matrix4[] = [];
  const trees: THREE.Matrix4[] = [];
  const y0 = SIDEWALK_HEIGHT;

  for (const c of ROAD_LINES) {
    for (const axis of ['x', 'z'] as const) {
      for (const [a, b] of roadSpans()) {
        for (const side of [-1, 1]) {
          const across = c + side * (ROAD_HALF + CURB_OFFSET);
          const place = (along: number) => (axis === 'z' ? new THREE.Vector3(across, y0, along) : new THREE.Vector3(along, y0, across));
          // Lamp arm points over the road: local +x -> towards the road.
          const toRoad = axis === 'z' ? (side > 0 ? Math.PI : 0) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
          const lampAlongs: number[] = [];
          const start = a + (side > 0 ? 6 : 6 + LAMP_SPACING / 2);
          for (let s = start; s < b - 4; s += LAMP_SPACING) {
            if (Math.abs(s) > HALF - 3) continue;
            lampAlongs.push(s);
            lamps.push(new THREE.Matrix4().makeRotationY(toRoad).setPosition(place(s)));
          }
          for (let s = a + 4 + rand() * 4; s < b - 4; s += TREE_SPACING * (0.7 + rand() * 0.6)) {
            if (lampAlongs.some((l) => Math.abs(l - s) < 3) || Math.abs(s) > HALF - 3) continue;
            const scale = 0.8 + rand() * 0.5;
            trees.push(new THREE.Matrix4().makeRotationY(rand() * Math.PI * 2).scale(new THREE.Vector3(scale, scale, scale)).setPosition(place(s)));
          }
        }
      }
    }
  }

  // --- Lamps: pole + arm (grey), head (glows at night), light pool on the ground.
  const poleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.06, 0.09, LAMP_HEIGHT, 6).translate(0, LAMP_HEIGHT / 2, 0),
    new THREE.BoxGeometry(1.3, 0.06, 0.06).translate(0.6, LAMP_HEIGHT - 0.1, 0),
  ]);
  const headGeo = new THREE.BoxGeometry(0.5, 0.1, 0.22).translate(1.2, LAMP_HEIGHT - 0.18, 0);
  const poolGeo = new THREE.PlaneGeometry(7, 7).rotateX(-Math.PI / 2).translate(1.2, 0.03, 0);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffd28a, emissiveIntensity: 0 });
  const poolMat = new THREE.MeshBasicMaterial({
    map: glowTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffc070,
  });
  const poles = instanced(poleGeo, new THREE.MeshStandardMaterial({ color: 0x5b6066, roughness: 0.6, metalness: 0.4 }), lamps);
  const heads = instanced(headGeo, headMat, lamps);
  const pools = instanced(poolGeo, poolMat, lamps);
  poles.castShadow = true;
  pools.renderOrder = 1;

  // --- Trees: trunk + low-poly canopy with colour variation.
  const trunks = instanced(
    new THREE.CylinderGeometry(0.14, 0.22, 3.2, 6).translate(0, 1.6, 0),
    new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 }),
    trees,
  );
  const canopyGeo = new THREE.IcosahedronGeometry(2, 1).scale(1, 0.75, 1).translate(0, 4, 0);
  const canopies = instanced(canopyGeo, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), trees);
  const leaf = new THREE.Color();
  trees.forEach((_, i) => canopies.setColorAt(i, leaf.setHSL(0.25 + rand() * 0.07, 0.45, 0.28 + rand() * 0.1)));
  trunks.castShadow = canopies.castShadow = true;

  scene.add(poles, heads, pools, trunks, canopies);

  // --- Colliders: lamp poles and tree trunks.
  const p = new THREE.Vector3();
  for (const m of lamps) {
    p.setFromMatrixPosition(m);
    world.createCollider(RAPIER.ColliderDesc.cylinder(LAMP_HEIGHT / 2, 0.1).setTranslation(p.x, p.y + LAMP_HEIGHT / 2, p.z));
  }
  for (const m of trees) {
    p.setFromMatrixPosition(m);
    world.createCollider(RAPIER.ColliderDesc.cylinder(1.5, 0.22).setTranslation(p.x, p.y + 1.5, p.z));
  }

  return {
    lampCount: lamps.length,
    treeCount: trees.length,
    setNight(f: number) {
      headMat.emissiveIntensity = f * 4;
      poolMat.opacity = f * 0.55;
      pools.visible = f > 0.01;
    },
  };
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, matrices: THREE.Matrix4[]) {
  const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.computeBoundingSphere();
  mesh.receiveShadow = true;
  return mesh;
}
