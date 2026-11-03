import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { DEALER_STOCK } from '../vehicles/garage';
import { createKit, frame } from './kit';
import { DEALER_LOT } from './layout';

/**
 * Mylai Used Vehicles, the second-hand dealer on R.K. Mutt Road: an open forecourt with the
 * stock lined up nose to the road, a price board by each, an office cabin, an arch sign and
 * bunting. The vehicles themselves are real traffic vehicles, parked and locked
 * (main.ts spawns them at `spots` and sells them with E).
 */

const C = (hex: number) => new THREE.Color(hex);
const FLAGS = [0xe53935, 0xfdd835, 0x43a047, 0x1e88e5, 0xffffff].map(C);

export function createDealer(scene: THREE.Scene, world: RAPIER.World) {
  const signs: [string, string, string, string][] = [
    ['மயிலை பழைய வண்டி விற்பனை', 'MYLAI USED VEHICLES', '#0d47a1', '#ffffff'],
    ...DEALER_STOCK.map((s) => [`₹${s.price.toLocaleString('en-IN')}`, s.name, '#fffde7', '#b71c1c'] as [string, string, string, string]),
    ['அலுவலகம்', 'OFFICE · LOAN AVAILABLE', '#ffffff', '#0d47a1'],
  ];
  const k = createKit(world, signs);
  const { box, shape, board } = k;
  const lot = DEALER_LOT();
  const f = frame(lot);
  const { w, d } = f;
  const out = f.at(0, -1).sub(f.at(0, 0));
  const heading = Math.atan2(out.x, out.z); // nose towards the road

  // Forecourt: paving with painted bays, a low kerb at the sides.
  box(f, w, 0.05, d, 0, 0, d / 2, C(0x9e9e9e), false);
  const spots: { x: number; z: number; heading: number }[] = [];
  DEALER_STOCK.forEach((_, i) => {
    const u = -w / 2 + 4 + i * ((w - 8) / (DEALER_STOCK.length - 1));
    for (const s of [-1, 1]) box(f, 0.12, 0.02, 5.5, u + s * 2.6, 0.05, 6, C(0xffffff), false);
    const p = f.at(u, 6);
    spots.push({ x: p.x, z: p.z, heading });
    // Price board on a stand, just in front of the bay (to one side, so you can drive out).
    box(f, 0.08, 1.2, 0.08, u + 2.0, 0, 2.6, C(0x424242), false);
    board(f, i + 1, u + 2.0, 1.2, 2.55, 1.7, 0.6);
  });
  for (const s of [-1, 1]) box(f, 0.25, 0.3, d, s * (w / 2 - 0.12), 0, d / 2, C(0xf2c200));

  // Office cabin at the back, with a window, door and a sign.
  const cu = -w / 2 + 6;
  box(f, 9, 3.2, 4.2, cu + 1.5, 0, d - 2.3, C(0xeeeeee));
  box(f, 9.6, 0.25, 5, cu + 1.5, 3.2, d - 2.5, C(0x1565c0), false);
  box(f, 3, 1.3, 0.05, cu, 1.2, d - 4.43, C(0x546e7a), false);
  box(f, 1.1, 2.2, 0.05, cu + 3.4, 0, d - 4.43, C(0x6d4c41), false);
  board(f, signs.length - 1, cu + 1.5, 2.65, d - 4.45, 4.8, 0.55);
  k.shape(f, new THREE.BoxGeometry(8, 0.1, 0.1), cu + 1.5, 3.1, d - 4.9, C(0xffffff), 0, k.bulbs);
  // A spare tyre stack and an oil drum by the cabin.
  for (let n = 0; n < 4; n++) shape(f, new THREE.TorusGeometry(0.3, 0.12, 6, 14).rotateX(Math.PI / 2), w / 2 - 2.5, 0.12 + n * 0.24, d - 2, C(0x1a1a1a));
  shape(f, new THREE.CylinderGeometry(0.3, 0.3, 0.9, 10), w / 2 - 4, 0, d - 1.5, C(0x1e88e5));

  // Arch sign on two poles at the front, bunting from it to the cabin.
  for (const s of [-1, 1]) box(f, 0.3, 5.2, 0.3, s * (w / 2 - 0.6), 0, 0.6, C(0x0d47a1));
  box(f, w - 0.6, 1.4, 0.25, 0, 4.2, 0.6, C(0x0d47a1), false);
  board(f, 0, 0, 4.25, 0.46, w - 3, 1.3);
  k.shape(f, new THREE.BoxGeometry(w - 1, 0.1, 0.1), 0, 4.1, 0.45, C(0xffffff), 0, k.bulbs);
  for (const s of [-1, 1]) {
    for (let n = 0; n < 12; n++) {
      const t = n / 11;
      const u = s * (w / 2 - 0.6) * (1 - t) + (cu + 1.5 + s * 4) * t;
      const v = 0.6 + t * (d - 5.2);
      const sag = Math.sin(t * Math.PI) * 0.8;
      shape(f, new THREE.ConeGeometry(0.18, 0.35, 3).rotateX(Math.PI), u, 4.8 - sag - t * 1.2, v, FLAGS[n % FLAGS.length]);
    }
  }
  return { spots, setNight: k.build(scene) };
}
