import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Eatery } from './eateries';
import type { PoseClip } from '../npcs/npc';
import { GeoBuilder } from './geo';
import { PLACE_MENUS } from './food';
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
const SIGNS: SignDef[] = [
  ...HOTELS.map((h): SignDef => [h.ta, h.en, '#14213d', '#f2d27a']),
  ...HOTELS.map((h): SignDef => [h.diner[0], h.diner[1], '#3b1f0f', '#f2d27a']),
];
/** People at the other tables (crowd.addPosed). */
const DINERS = ['Mr. Raghavan', 'Mrs. Raghavan', 'Anjali', 'Siddharth', 'Dr. Iyer', 'Farah', 'Kartik', 'Nandini', 'Joseph', 'Lakshmi'];
const FOODS = [0xd9a441, 0xc8742a, 0xe07a4a, 0xf3e3b0].map((c) => new THREE.Color(c)); // biryani, curry, fry, appam
const DINNER_HOURS: [number, number][] = [[7.5, 10.5], [12, 15.5], [19, 23.5]]; // breakfast, lunch, dinner
const STAFF_HOURS: [number, number][] = [[6.5, 24]];
const GUEST_HOURS: [number, number][] = [[8, 22.5]];
const ROOM_D = 8; // restaurant room depth
const ROOM_H = 4.4;
const FLOOR_TOP = 0.06; // restaurant floor
const TABLE_TOP = 0.74; // as eateries.ts: the meal puts the leaf here
const SEAT_TOP = 0.46;
const SEAT_GAP = 0.62; // chair centre to table centre (meal.ts swivels to face the table)
const BENCH_TOP = 0.5; // seat height the sitting clips are dropped onto (npc.ts)

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
  const eateries: Eatery[] = [];
  const posed: { name: string; x: number; y: number; z: number; yaw: number; clip: PoseClip; hours: [number, number][]; eat?: THREE.Vector3 }[] = [];
  const glassGeo = new GeoBuilder(); // restaurant windows (one transparent draw call)
  const walkers: { name: string; loop: [number, number][]; y: number; hours: [number, number][] }[] = [];

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
    // Restaurant room: the left end of the ground floor, glass to the forecourt.
    const roomW = Math.min(bw / 2 - 8.5, 14);
    const r0 = -bw / 2 + 0.5;
    const r1 = r0 + roomW;
    /** The lowest block of the building, with the restaurant room cut out of its ground floor. */
    const baseBlock = (hb: number) => {
      box(f, bw, hb - ROOM_H, bd, 0, ROOM_H, bv0 + bd / 2, wall);
      box(f, bw / 2 - r1, ROOM_H, bd, (r1 + bw / 2) / 2, 0, bv0 + bd / 2, wall);
      box(f, 0.5, ROOM_H, bd, -bw / 2 + 0.25, 0, bv0 + bd / 2, wall);
      box(f, roomW, ROOM_H, bd - ROOM_D, (r0 + r1) / 2, 0, bv0 + ROOM_D + (bd - ROOM_D) / 2, wall);
    };
    const restaurant = () => {
      const rc = (r0 + r1) / 2;
      const gold = GOLD;
      box(f, roomW, FLOOR_TOP, ROOM_D, rc, 0, bv0 + ROOM_D / 2, C(0xe9e2d6), false); // marble floor
      k.shape(f, new THREE.BoxGeometry(roomW, ROOM_H - 0.3, 0.05).translate(0, (ROOM_H - 0.3) / 2, 0), rc, FLOOR_TOP, bv0 + ROOM_D - 0.03, C(0xf3d9a4), 0, k.bulbs); // warm back wall
      for (let u = r0 + 1.2; u < r1 - 0.6; u += 2.4) box(f, 0.25, ROOM_H - 0.4, 0.12, u, FLOOR_TOP, bv0 + ROOM_D - 0.1, C(0x7a4a22), false); // wood panelling
      box(f, roomW, 0.12, ROOM_D, rc, ROOM_H - 0.12, bv0 + ROOM_D / 2, CREAM, false); // ceiling
      // Chandeliers.
      for (let u = r0 + 3; u < r1 - 1.5; u += 5) {
        box(f, 0.04, 0.8, 0.04, u, ROOM_H - 0.9, bv0 + ROOM_D / 2, gold, false);
        for (let a = 0; a < 8; a++) k.shape(f, new THREE.SphereGeometry(0.09, 6, 4), u + Math.cos((a / 8) * Math.PI * 2) * 0.45, ROOM_H - 1.05, bv0 + ROOM_D / 2 + Math.sin((a / 8) * Math.PI * 2) * 0.45, C(0xfff1c8), 0, k.bulbs);
      }
      // Glass front with gold mullions, a door gap near the lobby end.
      const doorU = r1 - 1.4;
      for (const [a, b] of [[r0, doorU - 0.8], [doorU + 0.8, r1]]) {
        if (b - a < 0.2) continue;
        const p = f.at((a + b) / 2, bv0 + 0.04);
        glassGeo.box(b - a, ROOM_H - 0.2, 0.04, p.x, FLOOR_TOP + (ROOM_H - 0.2) / 2, p.z, C(0xf2e6c8), f.yaw);
        k.solid(f, b - a, ROOM_H, 0.15, (a + b) / 2, 0, bv0 + 0.04);
      }
      for (let u = r0; u <= r1 + 0.01; u += roomW / 6) box(f, 0.1, ROOM_H, 0.1, u, 0, bv0, gold, false);
      box(f, roomW + 0.4, 0.9, 0.3, rc, ROOM_H + 0.1, bv0 - 0.2, C(0x3b1f0f), false);
      board(f, HOTELS.length + i, rc, ROOM_H + 0.15, bv0 - 0.36, Math.min(roomW - 1, 9), 0.8);
      // Host stand by the door: order here.
      box(f, 0.9, 1.1, 0.5, doorU, FLOOR_TOP, bv0 + 1.6, C(0x5a3418));
      const spot = f.at(doorU, bv0 + 1.0, FLOOR_TOP);
      const waiter = f.at(doorU, bv0 + 2.2);
      const toDoor = f.at(0, -1).sub(f.at(0, 0));
      posed.push({ name: 'Head waiter', x: waiter.x, y: FLOOR_TOP, z: waiter.z, yaw: Math.atan2(toDoor.x, toDoor.z), clip: 'idle', hours: [[7, 24]] });
      // Tables: round, white cloth, a candle, two chairs facing each other along the room.
      const dirU = f.at(1, 0).sub(f.at(0, 0));
      const eatYaw = Math.atan2(dirU.x, dirU.z);
      const tv = bv0 + 4.6;
      let t = 0;
      for (let tu = r0 + 2; tu < r1 - 2.6; tu += 3.6, t++) {
        shape(f, new THREE.CylinderGeometry(0.42, 0.42, 0.04, 16), tu, FLOOR_TOP + TABLE_TOP - 0.04, tv, C(0xffffff));
        shape(f, new THREE.CylinderGeometry(0.43, 0.46, 0.08, 16).translate(0, 0.04, 0), tu, FLOOR_TOP + TABLE_TOP - 0.12, tv, C(0xf6f3ec)); // short cloth drop: knees fit under
        shape(f, new THREE.CylinderGeometry(0.05, 0.08, TABLE_TOP - 0.34, 8).translate(0, (TABLE_TOP - 0.34) / 2, 0), tu, FLOOR_TOP, tv, gold);
        k.shape(f, new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6), tu, FLOOR_TOP + TABLE_TOP, tv, C(0xffd27a), 0, k.bulbs); // candle
        k.solid(f, 0.84, TABLE_TOP, 0.84, tu, 0, tv);
        for (const sg of [-1, 1]) {
          const cu = tu + sg * SEAT_GAP;
          box(f, 0.44, 0.06, 0.44, cu, FLOOR_TOP + SEAT_TOP - 0.06, tv, C(0x7a1f1f), false);
          box(f, 0.06, 0.55, 0.44, cu + sg * 0.22, FLOOR_TOP + SEAT_TOP, tv, C(0x5a3418), false); // backrest
          for (const lu of [-0.18, 0.18]) for (const lv of [-0.18, 0.18]) box(f, 0.04, SEAT_TOP - 0.06, 0.04, cu + lu, FLOOR_TOP, tv + lv, C(0x5a3418), false);
          const seat = f.at(cu, tv, FLOOR_TOP + SEAT_TOP);
          if (t === 0 && sg < 0) {
            // Your table: the meal walks you here, sits you down and serves you.
            const table = f.at(tu - 0.22, tv, FLOOR_TOP + TABLE_TOP); // your plate goes in front of you, not mid-table
            eateries.push({ name: `${title(HOTELS[i].diner[1].split(' ·')[0])}, ${title(HOTELS[i].en.split(' ·')[0])}`, menu: PLACE_MENUS.fine, spot, seat, seatYaw: eatYaw - Math.PI / 2, eatYaw, table, china: true });
          } else if ((t + (sg > 0 ? 1 : 0)) % 3 !== 2) {
            // A plate in front of them, and they eat from it.
            const pu = tu + sg * 0.24;
            shape(f, new THREE.CylinderGeometry(0.14, 0.12, 0.015, 16), pu, FLOOR_TOP + TABLE_TOP, tv, C(0xffffff));
            shape(f, new THREE.SphereGeometry(0.08, 10, 6).scale(1, 0.45, 1), pu, FLOOR_TOP + TABLE_TOP + 0.015, tv, FOODS[(t + (sg > 0 ? 1 : 0) + i) % FOODS.length]);
            const plate = f.at(pu, tv, FLOOR_TOP + TABLE_TOP + 0.04);
            posed.push({ name: `${DINERS[(i * 4 + t * 2 + (sg > 0 ? 1 : 0)) % DINERS.length]} dining`, x: seat.x, y: FLOOR_TOP + SEAT_TOP - BENCH_TOP, z: seat.z, yaw: sg < 0 ? eatYaw : eatYaw + Math.PI, clip: 'sit_idle', hours: DINNER_HOURS, eat: plate });
          }
        }
      }
    };
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
      band(bw / 4 + 3, FLOOR_H + 0.5, bv0 - 0.04, bw / 2 - 8, true); // right side only: the restaurant is on the left
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

    restaurant();

    // ---- People about the hotel: doorman, gate guard, guests chatting by the lobby, guests
    // strolling round the fountain, waiters walking between the tables ----
    const toRoad = f.at(0, -1).sub(f.at(0, 0));
    const roadYaw = Math.atan2(toRoad.x, toRoad.z);
    const stand = (name: string, u: number, v: number, yaw: number, hours: [number, number][], y = 0) => {
      const p = f.at(u, v);
      posed.push({ name, x: p.x, y, z: p.z, yaw, clip: 'idle', hours });
    };
    stand('Doorman', -3.6, pv - 2, roadYaw, STAFF_HOURS);
    stand('Security guard', gu + gate / 2 + 2, 3.2, roadYaw, [[0, 24]]);
    const a = f.at(3.4, bv0 - 2.2);
    const b = f.at(4.5, bv0 - 2.9);
    posed.push({ name: `${DINERS[(i * 3 + 1) % DINERS.length]} (guest)`, x: a.x, y: 0, z: a.z, yaw: Math.atan2(b.x - a.x, b.z - a.z), clip: 'idle', hours: GUEST_HOURS });
    posed.push({ name: `${DINERS[(i * 3 + 2) % DINERS.length]} (guest)`, x: b.x, y: 0, z: b.z, yaw: Math.atan2(a.x - b.x, a.z - b.z), clip: 'idle', hours: GUEST_HOURS });
    const loop = (pts: [number, number][]) => pts.map(([u, v]): [number, number] => {
      const p = f.at(u, v);
      return [p.x, p.z];
    });
    walkers.push({ name: 'Guest strolling', loop: loop([[-4.2, 4.2], [4.2, 4.2], [4.2, 11.8], [-4.2, 11.8]]), y: 0, hours: GUEST_HOURS });
    walkers.push({ name: 'Guest on a call', loop: loop([[4.2, 11.8], [-4.2, 11.8], [-4.2, 4.2], [4.2, 4.2]]), y: 0, hours: [[9, 21]] });
    for (const [n, name] of ['Waiter Joseph', 'Waitress Priya'].entries()) {
      const pts: [number, number][] = [[r0 + 0.75, bv0 + 2.4], [r1 - 2.5, bv0 + 2.4], [r1 - 2.5, bv0 + 6.8], [r0 + 0.75, bv0 + 6.8]];
      walkers.push({ name, loop: loop(n ? pts.reverse() : pts), y: FLOOR_TOP, hours: STAFF_HOURS });
    }
  });

  const glassMesh = new THREE.Mesh(glassGeo.build(), new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.4, depthWrite: false }));
  glassMesh.renderOrder = 1;
  scene.add(glassMesh);
  return { eateries, posed, walkers, setNight: k.build(scene) };
}
