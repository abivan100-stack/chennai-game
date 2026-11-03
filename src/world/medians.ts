import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import { BOUNDS, MEDIAN_X, roadSpans } from './layout';

/**
 * Divided roads (Usman Road, Anna Salai): a raised concrete median down the centre line with
 * black-and-yellow kerbs, a strip of soil and shrubs, and a gap at every junction so traffic can
 * turn. One merged mesh, one collider per stretch.
 */

const W = 1.0; // median width
const H = 0.25;
const GAP = 1.5; // m kept clear before each junction
const C = (hex: number) => new THREE.Color(hex);

export function createMedians(scene: THREE.Scene, world: RAPIER.World) {
  const g = new GeoBuilder();
  const shrub = new THREE.IcosahedronGeometry(0.42, 0).scale(1, 0.7, 1);
  for (const x of MEDIAN_X) {
    for (const [a, b] of roadSpans({ axis: 'z', c: x, from: BOUNDS.z0, to: BOUNDS.z1 })) {
      const z0 = a + GAP;
      const z1 = b - GAP;
      if (z1 - z0 < 3) continue;
      const len = z1 - z0;
      const mid = (z0 + z1) / 2;
      g.box(W, H, len, x, H / 2, mid, C(0xbdb5a5));
      // Painted kerb stripes (yellow / black) down both sides.
      for (let z = z0; z < z1; z += 1) for (const s of [-1, 1]) g.box(0.03, H - 0.02, 0.5, x + s * (W / 2 + 0.01), H / 2, z + 0.25, (Math.floor(z) % 2 ? C(0x1a1a1a) : C(0xf2c200)));
      g.box(W - 0.2, 0.04, len - 0.2, x, H + 0.02, mid, C(0x5b3d26)); // soil
      for (let z = z0 + 1; z < z1 - 0.5; z += 2.2) g.add(shrub, new THREE.Matrix4().setPosition(x + ((z * 7) % 3 - 1) * 0.08, H + 0.3, z), z % 4.4 < 2.2 ? C(0x3f7f35) : C(0x4f9a3f));
      world.createCollider(RAPIER.ColliderDesc.cuboid(W / 2, H / 2, len / 2).setTranslation(x, H / 2, mid));
    }
  }
  const mesh = new THREE.Mesh(g.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  mesh.receiveShadow = mesh.castShadow = true;
  scene.add(mesh);
  return mesh;
}
