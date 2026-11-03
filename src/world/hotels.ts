import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { PoseClip } from '../npcs/npc';
import type { NpcModelId } from '../characters/catalog';
import { createKit, frame, type Frame, type SignDef } from './kit';
import { HOTEL_LOTS } from './layout';

/**
 * Luxury hotels in the rich areas (invented names): a gated forecourt with a driveway loop, a
 * fountain, palms and flags, a pillared porte-cochere you can drive the auto under, and the
 * building itself: a heritage "palace" (sandstone, colonnade, domes) or a modern tower (podium,
 * glass bands, lit crown). Lobby restaurants are eateries (fine-dining menu). 3 draw calls.
 */

type Style = 'palace' | 'tower';
/** Order matches layout.HOTEL_LOTS. */
export const HOTELS: { ta: string; en: string; style: Style; floors: number; wall: number; glass: number; diner: [string, string] }[] = [
  { ta: 'ஹோட்டல் காவேரி பேலஸ்', en: 'HOTEL KAVERI PALACE', style: 'palace', floors: 5, wall: 0xe2c79a, glass: 0x4a5b6b, diner: ['சோழ மண்டபம்', 'CHOLA MANDAPAM · DINING'] },
  { ta: 'தி ஆழ்வார்பேட்டை ரெசிடென்சி', en: 'THE ALWARPET RESIDENCY', style: 'tower', floors: 11, wall: 0xf3f1ec, glass: 0x5f86a8, diner: ['மல்லிகை', 'MALLIGAI · ALL-DAY DINING'] },
  { ta: 'அடையார் கிராண்ட்', en: 'ADYAR GRAND · HOTEL & SPA', style: 'tower', floors: 14, wall: 0xd9d4ca, glass: 0x3e6d8e, diner: ['கடற்கரை கிச்சன்', 'THE COAST KITCHEN'] },
];
/** A hotel's lobby door: stand at `at` to go in to its dining hall; you come back out at `out`. */
export interface HotelDoor {
  name: string; // restaurant
  hotel: string;
  at: THREE.Vector3;
  out: THREE.Vector3;
  outYaw: number;
}
const SIGNS: SignDef[] = [
  ...HOTELS.map((h): SignDef => [h.ta, h.en, '#14213d', '#f2d27a']),
  ...HOTELS.map((h): SignDef => [h.diner[0], h.diner[1], '#3b1f0f', '#f2d27a']),
];
/** Guest names (crowd.addPosed). */
const DINERS = ['Mr. Raghavan', 'Mrs. Raghavan', 'Anjali', 'Siddharth', 'Dr. Iyer', 'Farah', 'Kartik', 'Nandini', 'Joseph', 'Lakshmi'];
const STAFF_HOURS: [number, number][] = [[6.5, 24]];
const GUEST_HOURS: [number, number][] = [[8, 22.5]];

const C = (hex: number) => new THREE.Color(hex);
/** 'HOTEL KAVERI PALACE' -> 'Hotel Kaveri Palace'. */
const title = (t: string) => t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
const CREAM = C(0xf6efe0);
const GOLD = C(0xc9a24a);
const PAVING = C(0xbfb6a6);
const LAWN = C(0x4f8f3a);
const WATER = C(0x5aa9d6);
const PALM_TRUNK = C(0x7a5a3a);
const PALM_LEAF = C(0x2f7a32);
const FLAGS = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047].map(C);
const WARM = C(0xffd99a);
const FLOOR_H = 3.4;

export function createHotels(scene: THREE.Scene, world: RAPIER.World) {
  const k = createKit(world, SIGNS);
  const { box, board, shape } = k;
  const posed: { name: string; x: number; y: number; z: number; yaw: number; clip: PoseClip; hours: [number, number][]; model?: NpcModelId }[] = [];
  /** Lobby doors: stand at `at` to go in to the dining hall; you come back out at `out`. */
  const doors: HotelDoor[] = [];

  const palm = (f: Frame, u: number, v: number, h = 6) => {
    shape(f, new THREE.CylinderGeometry(0.16, 0.26, h, 7).translate(0, h / 2, 0), u, 0, v, PALM_TRUNK);
    for (let a = 0; a < 6; a++) shape(f, new THREE.ConeGeometry(0.5, 3.2, 4).rotateZ(Math.PI / 2 - 0.35).translate(1.5, 0, 0), u, h, v, PALM_LEAF, (a / 6) * Math.PI * 2);
    k.solid(f, 0.5, h, 0.5, u, 0, v);
  };

  HOTEL_LOTS().forEach((lot, i) => {
    const h = HOTELS[i % HOTELS.length];
    const f = frame(lot);
    const { w, d } = f;
    const wall = C(h.wall);
    const glass = C(h.glass);

    // ---- Forecourt: compound wall with in / out gates, driveway, fountain, lawns, palms, flags ----
    const gate = 6;
    const gu = w / 2 - 4 - gate / 2; // gate centres at ±gu
    const segs: [number, number][] = [[-w / 2, -gu - gate / 2], [-gu + gate / 2, gu - gate / 2], [gu + gate / 2, w / 2]];
    for (const [a, b] of segs) {
      box(f, b - a, 1.2, 0.35, (a + b) / 2, 0, 0.2, CREAM);
      for (let u = a + 0.2; u <= b; u += 3) box(f, 0.45, 1.6, 0.45, u, 0, 0.2, GOLD, false);
    }
    for (const s of [-1, 1]) for (const e of [-1, 1]) box(f, 0.7, 2.6, 0.7, s * gu + e * (gate / 2 + 0.35), 0, 0.2, CREAM);
    box(f, 1.6, 2.4, 1.6, gu + gate / 2 + 2, 0, 1.6, CREAM); // guard booth
    box(f, w - 0.8, 0.03, 16, 0, 0.01, 8.4, PAVING, false); // driveway
    for (const s of [-1, 1]) box(f, w / 2 - 9.5, 0.06, 9, s * (w / 4 + 4.75), 0.02, 9.5, LAWN, false);
    // Fountain in the middle of the loop.
    shape(f, new THREE.CylinderGeometry(2.4, 2.5, 0.6, 20).translate(0, 0.3, 0), 0, 0, 8, CREAM);
    shape(f, new THREE.CylinderGeometry(2.1, 2.1, 0.05, 20), 0, 0.58, 8, WATER);
    shape(f, new THREE.CylinderGeometry(0.25, 0.4, 1.6, 10).translate(0, 0.8, 0), 0, 0.6, 8, CREAM);
    shape(f, new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 2.2, 8, WATER);
    k.solid(f, 4.6, 1.2, 4.6, 0, 0, 8);
    for (const s of [-1, 1]) {
      for (const v of [6, 12]) palm(f, s * (w / 2 - 3), v, 5.5 + (v % 4));
      for (let n = 0; n < 3; n++) {
        const u = s * (5 + n * 1.6);
        box(f, 0.1, 8, 0.1, u, 0, 2.2, C(0xdddddd), false); // flag poles
        box(f, 1.2, 0.8, 0.04, u + 0.62, 7, 2.2, FLAGS[(n + (s > 0 ? 2 : 0)) % 4], false);
      }
    }
    // Low stone sign by the gate.
    box(f, 7, 1.6, 0.6, -gu - gate / 2 - 4.5, 0, 2, C(0x3a3a3a));
    board(f, i, -gu - gate / 2 - 4.5, 0.2, 1.68, 6.6, 0.85);

    // ---- Porte-cochere: drive under it to the lobby doors ----
    const pv = 16;
    for (const s of [-1, 1]) for (const v of [pv - 2.5, pv + 2.5]) {
      shape(f, new THREE.CylinderGeometry(0.35, 0.4, 5, 12).translate(0, 2.5, 0), s * 5.5, 0, v, h.style === 'palace' ? CREAM : C(0xb0b6bb));
      k.solid(f, 0.8, 5, 0.8, s * 5.5, 0, v);
    }
    box(f, 13, 0.7, 7, 0, 5, pv, h.style === 'palace' ? wall : C(0xffffff), false);
    box(f, 13.2, 0.25, 7.2, 0, 5.7, pv, GOLD, false);
    for (let u = -5; u <= 5; u += 2.5) k.shape(f, new THREE.BoxGeometry(0.8, 0.05, 0.8), u, 4.97, pv, WARM, 0, k.bulbs);
    if (h.style === 'palace') shape(f, new THREE.SphereGeometry(2, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 5.95, pv, GOLD);

    // ---- The building ----
    const bv0 = pv + 3.5; // front face
    const bd = d - bv0 - 0.5;
    const bw = w - 4;
    const lobbyH = FLOOR_H * 1.5;
    const baseBlock = (hb: number) => box(f, bw, hb, bd, 0, 0, bv0 + bd / 2, wall);
    const band = (u: number, y: number, v: number, width: number, lit: boolean) =>
      k.shape(f, new THREE.BoxGeometry(width, 2.1, 0.06).translate(0, 1.05, 0), u, y, v, lit ? glass : glass.clone().multiplyScalar(0.6), 0, lit ? k.bulbs : k.geo);
    // Lobby: tall glass front with a warm glow, revolving door.
    k.shape(f, new THREE.BoxGeometry(14, lobbyH - 0.4, 0.05).translate(0, (lobbyH - 0.4) / 2, 0), 0, 0, bv0 - 0.06, WARM, 0, k.bulbs);
    box(f, 3, 3, 3, 0, 0, bv0 - 1.2, glass, false);

    if (h.style === 'palace') {
      // Sandstone wings with a colonnade, a raised centre with a big dome, corner chhatris.
      const H = h.floors * FLOOR_H;
      baseBlock(H);
      box(f, bw + 0.6, 0.7, bd + 0.6, 0, H, bv0 + bd / 2, CREAM, false);
      for (let u = -bw / 2 + 1.5; u <= bw / 2 - 1.5; u += 3) {
        if (Math.abs(u) < 7.5) continue;
        shape(f, new THREE.CylinderGeometry(0.3, 0.34, lobbyH, 10).translate(0, lobbyH / 2, 0), u, 0, bv0 - 1.4, CREAM);
      }
      box(f, bw, 0.5, 2, 0, lobbyH, bv0 - 1, CREAM, false);
      for (let fl = 2; fl < h.floors; fl++) {
        for (let u = -bw / 2 + 2; u <= bw / 2 - 2; u += 3.2) band(u, fl * FLOOR_H, bv0 - 0.04, 1.6, (fl * 7 + Math.round(u)) % 3 !== 0);
        box(f, bw, 0.2, 0.5, 0, fl * FLOOR_H - 0.1, bv0 - 0.2, CREAM, false);
      }
      box(f, 16, FLOOR_H * 2, bd - 4, 0, H, bv0 + bd / 2, wall);
      shape(f, new THREE.SphereGeometry(6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, H + FLOOR_H * 2, bv0 + bd / 2, GOLD);
      shape(f, new THREE.ConeGeometry(0.4, 2.6, 10), 0, H + FLOOR_H * 2 + 6.8, bv0 + bd / 2, GOLD);
      for (const s of [-1, 1]) for (const v of [bv0 + 1.5, bv0 + bd - 1.5]) {
        for (const e of [-1, 1]) for (const g of [-1, 1]) box(f, 0.3, 2.4, 0.3, s * (bw / 2 - 1.5) + e * 1.1, H + 0.7, v + g * 1.1, CREAM, false);
        shape(f, new THREE.SphereGeometry(1.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), s * (bw / 2 - 1.5), H + 3.1, v, GOLD);
      }
      board(f, i, 0, H + 0.8, bv0 + 1.7, 12, 1.5);
    } else {
      // Two-storey podium, a slab tower on top with glass bands and a lit crown.
      const podH = FLOOR_H * 2;
      baseBlock(podH);
      for (const sg of [-1, 1]) band(sg * (bw / 4 + 3), FLOOR_H + 0.5, bv0 - 0.04, bw / 2 - 8, true);
      const tw = Math.min(bw - 8, 30);
      const td = Math.min(bd - 4, 14);
      const tv = bv0 + 2 + td / 2;
      const H = podH + h.floors * FLOOR_H;
      box(f, tw, H - podH, td, 0, podH, tv, wall);
      for (let fl = 0; fl < h.floors; fl++) {
        const y = podH + fl * FLOOR_H + 0.5;
        band(0, y, tv - td / 2 - 0.04, tw - 1.6, (fl * 5 + i) % 4 !== 0);
        box(f, tw + 0.4, 0.18, 1, 0, y - 0.6, tv - td / 2 - 0.4, CREAM, false); // balcony slab line
      }
      for (const s of [-1, 1]) box(f, 1.2, H - podH, td + 0.4, s * (tw / 2 + 0.3), podH, tv, glass.clone().multiplyScalar(0.8)); // glass fins at the ends
      box(f, tw + 1, 2.2, td + 1, 0, H, tv, C(0x1e2a36), false); // crown
      k.shape(f, new THREE.BoxGeometry(tw + 1.1, 0.2, 0.1), 0, H + 2.2, tv - td / 2 - 0.55, WARM, 0, k.bulbs);
      board(f, i, 0, H + 0.1, tv - td / 2 - 0.56, Math.min(tw, 20), 2);
      // Rooftop pool deck on the podium beside the tower.
      if (bw - tw > 14) {
        const pu = tw / 2 + (bw / 2 - tw / 2) / 2;
        box(f, (bw - tw) / 2 - 3, 0.2, 8, pu, podH, bv0 + 6, WATER, false);
        palm(f, pu, bv0 + 12, 4);
      }
    }

    // The restaurant's board over the entrance; walk up to the glass doors to go in (hotelHalls.ts).
    board(f, HOTELS.length + i, 0, lobbyH + 0.2, h.style === 'palace' ? bv0 - 2.1 : bv0 - 0.12, 9, 1);
    const toRoad = f.at(0, -1).sub(f.at(0, 0));
    const roadYaw = Math.atan2(toRoad.x, toRoad.z);
    doors.push({ name: title(h.diner[1].split(' ·')[0]), hotel: title(h.en.split(' ·')[0]), at: f.at(0, bv0 - 3), out: f.at(0, bv0 - 4.6), outYaw: roadYaw });

    // ---- People about the hotel: doorman, gate guard, guests chatting by the lobby ----
    const stand = (name: string, u: number, v: number, yaw: number, hours: [number, number][], model: NpcModelId) => {
      const p = f.at(u, v);
      posed.push({ name, x: p.x, y: 0, z: p.z, yaw, clip: 'idle', hours, model });
    };
    stand('Doorman', -3.6, pv - 2, roadYaw, STAFF_HOURS, 'mx07');
    stand('Security guard', gu + gate / 2 + 2, 3.2, roadYaw, [[0, 24]], 'mx11');
    const a = f.at(3.4, bv0 - 2.2);
    const b = f.at(4.5, bv0 - 2.9);
    posed.push({ name: `${DINERS[(i * 3 + 1) % DINERS.length]} (guest)`, x: a.x, y: 0, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z), clip: 'idle', hours: GUEST_HOURS });
    posed.push({ name: `${DINERS[(i * 3 + 2) % DINERS.length]} (guest)`, x: b.x, y: 0, z: b.z, yaw: Math.atan2(a.x - b.x, a.z - b.z), clip: 'idle', hours: GUEST_HOURS });
  });

  return { doors, posed, setNight: k.build(scene) };
}
