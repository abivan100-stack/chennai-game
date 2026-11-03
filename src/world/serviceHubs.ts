import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { createKit, frame, type SignDef } from './kit';
import { SERVICE_HUBS } from './layout';
import type { Service } from './places';

/**
 * Roadside service stops on layout.SERVICE_HUBS, one in every area: a petrol bunk (canopy, two
 * pump islands, kiosk, price pole), a mechanic's tin shed, an ATM booth and a small medical
 * shop. All of them share one kit: 3 draw calls in total.
 */

const C = (hex: number) => new THREE.Color(hex);
const WHITE = C(0xf6f4ee);
const CREAM = C(0xefe2c4);
const STEEL = C(0xb4b9be);
const DARK = C(0x2b2b2b);
const TIN = C(0x8d9aa3);
const FLOOR = C(0x9e9e9e);
const GLASS = C(0x9fc4d6);
const BLUE = C(0x0d47a1);
/** Fuel brands (invented): canopy colour + board colours, picked per hub. */
const BRANDS: [number, string, string][] = [[0xd84315, '#d84315', '#ffffff'], [0x2e7d32, '#2e7d32', '#ffeb3b'], [0x1565c0, '#1565c0', '#ffffff']];

export function createServiceHubs(scene: THREE.Scene, world: RAPIER.World) {
  const signs: SignDef[] = [
    ['மெக்கானிக்', 'AUTO WORKS · MECHANIC', '#263238', '#ffeb3b'],
    ['ஏ.டி.எம்.', 'ATM · 24 HRS', '#0d47a1', '#ffffff'],
    ['மருந்தகம்', 'MEDICALS', '#ffffff', '#1b5e20'],
    ...SERVICE_HUBS.map((h, i): SignDef => [`${h.ta} எரிபொருள் நிலையம்`, `${h.area.toUpperCase()} FUELS · PETROL`, BRANDS[i % 3][1], BRANDS[i % 3][2]]),
  ];
  const k = createKit(world, signs);
  const { box, board, shape } = k;
  const services: Service[] = [];
  const tyre = new THREE.TorusGeometry(0.32, 0.12, 6, 12).rotateX(Math.PI / 2);

  SERVICE_HUBS.forEach((hub, i) => {
    const f = frame(hub.lot());
    const brand = C(BRANDS[i % 3][0]);
    const svc = (kind: Service['kind'], name: string, u: number, v: number, radius: number, inAuto: boolean) => {
      const p = f.at(u, v);
      services.push({ kind, name, at: new THREE.Vector3(p.x, 0, p.z), radius, inAuto });
    };

    // ---- Petrol bunk (u -17..1) ----
    box(f, 18, 0.02, 16, -8, 0.01, 8, FLOOR, false);
    for (const u of [-11.5, -4.5]) {
      box(f, 1.2, 0.2, 4.4, u, 0, 6, C(0xd0d0d0)); // pump island
      box(f, 0.8, 1.8, 0.6, u, 0.2, 6, brand);
      box(f, 0.7, 0.5, 0.05, u, 1.2, 5.67, DARK, false);
      box(f, 0.84, 0.25, 0.64, u, 2, 6, WHITE, false);
      box(f, 0.45, 4.6, 0.45, u, 0.2, 7.8, WHITE); // canopy pillar
    }
    box(f, 15, 0.6, 9, -8, 4.8, 6, WHITE, false);
    box(f, 15.1, 0.5, 9.1, -8, 5.1, 6, brand, false);
    for (let u = -13; u <= -3; u += 2.5) box(f, 1.6, 0.06, 0.4, u, 4.75, 6, C(0xfff4d6), false); // lights under the canopy
    for (let u = -13; u <= -3; u += 2.5) k.shape(f, new THREE.BoxGeometry(1.5, 0.05, 0.3), u, 4.72, 6, C(0xfff4d6), 0, k.bulbs);
    board(f, 3 + i, -8, 5.1, 1.42, 13, 0.5);
    box(f, 6, 3, 4, -8, 0, 13.5, CREAM); // kiosk
    box(f, 2, 2.2, 0.08, -8, 0, 11.46, C(0x5a7fa8), false);
    box(f, 0.25, 5, 0.25, -16, 0, 0.8, STEEL); // price pole
    box(f, 1.6, 2, 0.15, -16, 5, 0.8, brand, false);
    svc('fuel', `${hub.area} Fuels`, -8, 6, 7.5, true);

    // ---- Mechanic shed (u 2..9) ----
    for (const u of [2.2, 8.8]) for (const v of [1, 15]) box(f, 0.2, 3.4, 0.2, u, 0, v, STEEL);
    box(f, 7.2, 0.1, 15, 5.5, 3.4, 8, TIN, false);
    box(f, 7, 3.4, 0.15, 5.5, 0, 15.2, C(0x546e7a));
    box(f, 6.6, 0.02, 14, 5.5, 0.01, 8, C(0x5d5d5d), false);
    box(f, 2.4, 1.4, 0.1, 4.5, 1, 15.05, C(0x37474f), false); // tool board
    box(f, 1.2, 0.9, 0.6, 7.6, 0, 13.5, C(0xc62828)); // tool chest
    for (let n = 0; n < 4; n++) shape(f, tyre, 3, 0.12 + n * 0.24, 12, DARK);
    board(f, 0, 5.5, 3.5, 0.9, 6.6, 0.9);
    svc('mechanic', `${hub.area} Auto Works`, 5.5, 4, 4.5, true);

    // ---- ATM booth (u ~11) ----
    box(f, 2.6, 2.8, 2.4, 11, 0, 3.2, GLASS);
    box(f, 2.7, 0.5, 2.5, 11, 2.8, 3.2, BLUE, false);
    board(f, 1, 11, 2.85, 1.9, 2.6, 0.45);
    k.shape(f, new THREE.BoxGeometry(0.7, 0.5, 0.05), 11, 1.3, 1.98, C(0xd8f0ff), 0, k.bulbs); // screen
    svc('bank', `${hub.area} ATM`, 11, 0.9, 1.8, false);

    // ---- Medical shop (u 13..17) ----
    box(f, 4, 5, 9, 15, 0, 6.5, C(0xf1f8e9));
    box(f, 3.2, 2.4, 0.08, 15, 0, 1.97, C(0xb3e5fc), false);
    board(f, 2, 15, 2.6, 1.95, 3.8, 0.7);
    for (const [w, h] of [[1, 0.32], [0.32, 1]]) k.shape(f, new THREE.BoxGeometry(w, h, 0.1), 15, 4.3, 1.9, C(0x00e676), 0, k.bulbs);
    svc('pharmacy', `${hub.area} Medicals`, 15, 0.9, 1.8, false);
  });

  return { services, setNight: k.build(scene) };
}
