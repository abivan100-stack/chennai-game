import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Eatery } from './eateries';
import { PLACE_MENUS } from './food';
import { createKit, frame, type SignDef } from './kit';
import { BESANT } from './layout';
import { sandY } from './santhome';

/**
 * Besant Nagar, stylised: the Annai Velankanni church (white, Gothic, a tall central spire) on
 * the Beach Road; on Elliot's Beach the Ashtalakshmi temple (stacked tiers by the shore), the
 * small white Karl Schmidt memorial and a row of snack carts (two sell sundal and bajji).
 * 3 draw calls (kit.ts).
 */

const SIGNS: SignDef[] = [
  ['அன்னை வேளாங்கண்ணி ஆலயம்', 'ANNAI VELANKANNI CHURCH', '#ffffff', '#1d3557'],
  ['அஷ்டலட்சுமி கோயில்', 'ARULMIGU ASHTALAKSHMI TEMPLE', '#7a1f1f', '#ffe7a8'],
  ['எலியட்ஸ் கடற்கரை', "ELLIOT'S BEACH · BESANT NAGAR", '#0d3b66', '#ffffff'],
];

const C = (hex: number) => new THREE.Color(hex);
const WHITE = C(0xfbfaf6);
const CREAM = C(0xf3e6c8);
const OCHRE = C(0xe0a43c);
const SAFFRON = C(0xe46a1f);
const MAROON = C(0x8a2b1f);
const GOLD = C(0xd9a520);
const DARK = C(0x2f3640);
const STONE = C(0xbdb5a5);
const CART_TOPS = [0xe63946, 0x2a9d8f, 0xf4a261, 0x457b9d, 0xe9c46a, 0x8338ec].map((c) => C(c));

export function createBesantNagar(scene: THREE.Scene, world: RAPIER.World) {
  const k = createKit(world, SIGNS);
  const { box, board, shape, tree } = k;
  const eateries: Eatery[] = [];

  // ---- Annai Velankanni church: white Gothic nave, twin turrets, tall central spire ----
  {
    const f = frame(BESANT.church());
    const { w, d } = f;
    const nv = 24; // nave centre, in from the road
    box(f, 14, 11, 26, 0, 0, nv, WHITE);
    shape(f, new THREE.ConeGeometry(10.5, 5, 4).rotateY(Math.PI / 4).scale(0.7, 1, 1.25), 0, 13.5, nv, C(0xd8dde3)); // pitched roof
    // Facade: taller front wall with a pointed gable, a central tower and spire.
    box(f, 16, 15, 2, 0, 0, nv - 13.5, WHITE);
    shape(f, new THREE.ConeGeometry(8, 5, 4).rotateY(Math.PI / 4).scale(1, 1, 0.18), 0, 17.5, nv - 13.5, WHITE);
    box(f, 4.5, 12, 4.5, 0, 15, nv - 13, WHITE);
    shape(f, new THREE.ConeGeometry(3.1, 12, 8), 0, 33, nv - 13, WHITE);
    box(f, 0.3, 2.4, 0.3, 0, 39, nv - 13, GOLD, false);
    box(f, 1.4, 0.3, 0.3, 0, 40.2, nv - 13, GOLD, false);
    for (const s of [-1, 1]) {
      box(f, 2.6, 18, 2.6, s * 7.4, 0, nv - 13.5, WHITE);
      shape(f, new THREE.ConeGeometry(1.8, 6, 8), s * 7.4, 21, nv - 13.5, WHITE);
      for (const y of [3, 8.5]) box(f, 1.4, 3.6, 0.08, s * 3.8, y, nv - 14.55, C(0x5a7fa8), false); // pointed windows
    }
    shape(f, new THREE.CylinderGeometry(1.6, 1.6, 0.1, 20).rotateX(Math.PI / 2), 0, 11.5, nv - 14.6, C(0x3d6fa8)); // rose window
    box(f, 3, 5, 0.1, 0, 0, nv - 14.55, C(0x4a2e1c), false);
    box(f, 8, 0.5, 3, 0, 0, nv - 16, STONE, false);
    board(f, 0, 0, 0.3, 0.4, 10, 1.2);
    // Grotto with a statue of Mary (a simple white figure) and lawns.
    box(f, 3, 3, 1.6, -11, 0, 8, STONE);
    shape(f, new THREE.CylinderGeometry(0.25, 0.4, 1.7, 10), -11, 0.85, 7, C(0x90caf9));
    shape(f, new THREE.SphereGeometry(0.22, 10, 8), -11, 1.95, 7, WHITE);
    const gate = 6;
    const side = (w - gate) / 2;
    for (const s of [-1, 1]) box(f, side, 1.3, 0.3, s * (gate / 2 + side / 2), 0, 0.2, WHITE);
    box(f, 0.3, 1.3, d, -w / 2 + 0.15, 0, d / 2, WHITE);
    box(f, 0.3, 1.3, d, w / 2 - 0.15, 0, d / 2, WHITE);
    tree(f, 11, 6, 1);
  }

  // ---- Ashtalakshmi temple: stacked tiers by the sea ----
  {
    const t = BESANT.temple;
    const f = frame(t);
    const y0 = sandY((t.x0 + t.x1) / 2);
    const cv = 14;
    box(f, 20, 1.6, 20, 0, y0, cv, STONE); // platform
    box(f, 8, 0.6, 3, 0, y0, cv - 11.5, STONE, false); // steps
    let size = 15;
    let y = y0 + 1.6;
    for (let tier = 0; tier < 6; tier++) {
      const h = tier === 0 ? 4.2 : 2.4;
      box(f, size, h, size, 0, y, cv, tier % 2 ? CREAM : C(0xf6dfb0), tier === 0);
      box(f, size + 0.5, 0.45, size + 0.5, 0, y + h, cv, tier % 2 ? SAFFRON : OCHRE, false); // cornice band
      for (const s of [-1, 1]) box(f, 0.6, h - 0.6, 0.6, s * (size / 2 - 0.8), y, cv - size / 2 - 0.1, MAROON, false);
      y += h + 0.45;
      size -= 2.3;
    }
    shape(f, new THREE.SphereGeometry(2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, y, cv, OCHRE);
    shape(f, new THREE.ConeGeometry(0.45, 1.6, 10), 0, y + 2.6, cv, GOLD);
    // Front mandapam on pillars.
    box(f, 9, 0.5, 6, 0, y0 + 5.2, cv - 10.5, CREAM, false);
    for (const s of [-3.8, -1.3, 1.3, 3.8]) {
      shape(f, new THREE.CylinderGeometry(0.25, 0.28, 3.6, 10).translate(0, 1.8, 0), s, y0 + 1.6, cv - 12.8, CREAM);
      k.solid(f, 0.5, 3.6, 0.5, s, y0 + 1.6, cv - 12.8);
    }
    board(f, 1, 0, y0 + 5.8, cv - 13.6, 9, 1.1);
  }

  // ---- Karl Schmidt memorial: a small white pillared shelter on the sand ----
  {
    const m = BESANT.memorial;
    const f = frame({ x0: m.x - 3, x1: m.x + 3, z0: m.z - 3, z1: m.z + 3, front: 'w' });
    const y0 = sandY(m.x);
    box(f, 6, 0.6, 6, 0, y0, 3, WHITE);
    for (const [u, v] of [[-2.4, 0.6], [2.4, 0.6], [-2.4, 5.4], [2.4, 5.4]] as const) box(f, 0.45, 2.8, 0.45, u, y0 + 0.6, v, WHITE);
    box(f, 6.4, 0.5, 6.4, 0, y0 + 3.4, 3, WHITE, false);
    box(f, 1.2, 0.8, 0.15, 0, y0 + 0.6, 3, STONE, false);
  }

  // ---- Elliot's Beach: board, snack carts along the promenade edge ----
  {
    const b = BESANT.beach;
    const cartX = b.x0 + 4;
    const f0 = frame({ x0: b.x0, x1: b.x0 + 4, z0: 470, z1: 486, front: 'w' });
    for (const s of [-1, 1]) box(f0, 0.4, 4, 0.4, s * 5, sandY(b.x0), 1, C(0x0d3b66));
    board(f0, 2, 0, sandY(b.x0) + 3.2, 0.9, 10, 1.2);
    let i = 0;
    for (let z = b.z0 + 30; z < b.z1 - 10; z += 17, i++) {
      if (Math.abs(z - 478) < 8) continue; // keep the board clear
      const f = frame({ x0: cartX - 1, x1: cartX + 1, z0: z - 1, z1: z + 1, front: 'w' });
      const y0 = sandY(cartX);
      box(f, 2, 0.9, 1.1, 0, y0 + 0.3, 1, CART_TOPS[i % CART_TOPS.length]);
      box(f, 2.1, 0.06, 1.2, 0, y0 + 1.2, 1, C(0xb0b6bb), false);
      for (const s of [-1, 1]) box(f, 0.05, 1.3, 0.05, s * 0.95, y0 + 1.2, 1.5, DARK, false);
      box(f, 2.4, 0.08, 1.6, 0, y0 + 2.5, 1.1, CART_TOPS[(i + 2) % CART_TOPS.length], false);
      shape(f, new THREE.CylinderGeometry(0.3, 0.3, 0.25, 10), 0.4, y0 + 1.35, 0.8, C(0x222222)); // kadai / sundal pot
      if (i % 4 === 1) {
        const p = f.at(0, -0.4);
        eateries.push({ name: i % 8 === 1 ? "Elliot's Sundal Cart" : 'Beach Bajji Kadai', menu: PLACE_MENUS.fair, spot: new THREE.Vector3(p.x, y0, p.z), seat: p.clone(), seatYaw: 0, eatYaw: 0, table: p.clone() });
      }
    }
  }

  return { eateries, setNight: k.build(scene) };
}
