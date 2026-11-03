import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { PoseClip } from '../npcs/npc';
import type { NpcModelId } from '../characters/catalog';
import type { Eatery } from './eateries';
import { PLACE_MENUS } from './food';
import { HOTELS } from './hotels';
import { createKit, frame, type Frame, type SignDef } from './kit';

/**
 * The hotel dining halls. You go in through a hotel's lobby doors (hotels.ts HotelDoor) and
 * come out in its hall, built far off the north edge of the map where nothing else is: a big
 * room (36 x 24 m) with tall open windows on to a garden (palms, fountain, hedge), chandeliers,
 * a buffet counter with a chef, a little music stage, a dozen round tables with diners eating,
 * waiters standing at their stations, the host stand (order here) and the way out.
 * One kit for all three halls: 3 draw calls, drawn without shadows (sunlight comes in from above).
 */

const W = 36; // hall width (along the entrance wall)
const D = 24; // depth
const H = 6.5; // ceiling
const GARDEN = 11; // garden depth behind the window wall
const HALL_Z = -900; // entrance wall line (far north of the map)
const HALL_X = [-150, 0, 150]; // one hall per hotel, in HOTELS order
const FLOOR_TOP = 0.03;
const TABLE_TOP = 0.74; // as eateries.ts: the meal puts the plate here
const SEAT_TOP = 0.46;
const SEAT_GAP = 0.62; // chair centre to table centre (meal.ts swivels to face the table)
const BENCH_TOP = 0.5; // seat height the sitting clips are dropped onto (npc.ts)
const TABLE_U = [-10, -3.5, 3, 9.5];
const TABLE_V = [8, 13, 18];
const DINER_HOURS: [number, number][] = [[7.5, 10.5], [12, 15.5], [19, 23.5]]; // breakfast, lunch, dinner
const STAFF_HOURS: [number, number][] = [[6.5, 24]];
const MUSIC_HOURS: [number, number][] = [[12.5, 14.5], [19, 23]];
const DINERS = ['Mr. Raghavan', 'Mrs. Raghavan', 'Anjali', 'Siddharth', 'Dr. Iyer', 'Farah', 'Kartik', 'Nandini', 'Joseph', 'Lakshmi', 'Arvind', 'Meenakshi', 'Rohan', 'Sneha', 'Vikram', 'Divya'];
/** Diners: smart / casual clothes (no hard hats or tracksuits at a five-star). */
const GUESTS: NpcModelId[] = ['mx02', 'mx06', 'mx04', 'mx07', 'mx13', 'mx08', 'mx05', 'mx14', 'mx03', 'mx01'];
const FOODS = [0xd9a441, 0xc8742a, 0xe07a4a, 0xf3e3b0, 0x8bc34a].map((c) => new THREE.Color(c)); // biryani, curry, fry, appam, salad

const C = (hex: number) => new THREE.Color(hex);
const MARBLE = C(0xece6da);
const CREAM = C(0xf6efe0);
const WOOD = C(0x6b3e1e);
const GOLD = C(0xc9a24a);
const CLOTH = C(0xffffff);
const CHAIR = C(0x7a1f1f);
const LAWN = C(0x5d9440);
const FLOWERS = [0xe53935, 0xffb300, 0xd81b60, 0xffffff, 0x8e24aa, 0xff7043].map((c) => C(c));
const SKYLINE = [0x9aa9b8, 0xa8b4c2, 0x8f9fae, 0xb4bfcb].map((c) => C(c)); // far towers, hazy
const WARM = C(0xfff1c8);

export interface Hall {
  /** Where you appear inside (and the way you face). */
  entry: THREE.Vector3;
  entryYaw: number;
  /** Stand here inside to leave. */
  exit: THREE.Vector3;
}

const title = (t: string) => t.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export function createHotelHalls(scene: THREE.Scene, world: RAPIER.World) {
  const signs: SignDef[] = HOTELS.map((h): SignDef => [h.diner[0], h.diner[1], '#3b1f0f', '#f2d27a']);
  const k = createKit(world, signs);
  const { box, board, shape } = k;
  const halls: Hall[] = [];
  const eateries: Eatery[] = [];
  const posed: { name: string; x: number; y: number; z: number; yaw: number; clip: PoseClip; hours: [number, number][]; eat?: THREE.Vector3; model: NpcModelId }[] = [];

  const palm = (f: Frame, u: number, v: number, h = 6) => {
    shape(f, new THREE.CylinderGeometry(0.16, 0.26, h, 7).translate(0, h / 2, 0), u, 0, v, C(0x7a5a3a));
    for (let a = 0; a < 6; a++) shape(f, new THREE.ConeGeometry(0.5, 3.2, 4).rotateZ(Math.PI / 2 - 0.35).translate(1.5, 0, 0), u, h, v, C(0x2f7a32), (a / 6) * Math.PI * 2);
  };

  HOTELS.forEach((hotel, i) => {
    const ox = HALL_X[i];
    const f = frame({ x0: ox - W / 2, x1: ox + W / 2, z0: HALL_Z, z1: HALL_Z + D, front: 'n' });
    const inward = f.at(0, 1).sub(f.at(0, 0));
    const inYaw = Math.atan2(inward.x, inward.z);
    const dirU = f.at(1, 0).sub(f.at(0, 0));
    const eatYaw = Math.atan2(dirU.x, dirU.z); // facing along the room (+u)
    let guest = i * 3;
    const pose = (name: string, u: number, v: number, yaw: number, clip: PoseClip, hours: [number, number][], y = FLOOR_TOP, eat?: THREE.Vector3, model?: NpcModelId) => {
      const p = f.at(u, v);
      posed.push({ name, x: p.x, y, z: p.z, yaw, clip, hours, eat, model: model ?? GUESTS[guest++ % GUESTS.length] });
    };

    // ---- Floor (with a collider big enough for the garden too), marble, carpet runner ----
    box(f, W + 6, 0.4, D + GARDEN + 4, 0, -0.4, (D + GARDEN) / 2, C(0x8a8378));
    box(f, W, FLOOR_TOP, D, 0, 0, D / 2, MARBLE, false);
    box(f, 2.4, 0.01, D - 2, 0, FLOOR_TOP, D / 2, C(0x8a1c1c), false);

    // ---- Walls: entrance wall with the doorway, side walls, window wall on to the garden ----
    const door = 3;
    for (const s of [-1, 1]) box(f, (W - door) / 2, H, 0.4, s * (door / 2 + (W - door) / 4), 0, 0, CREAM);
    box(f, door, H - 3.2, 0.4, 0, 3.2, 0, CREAM, false);
    box(f, door + 0.6, 0.3, 0.5, 0, 3.2, 0.05, GOLD, false);
    for (const s of [-1, 1]) box(f, 0.4, H, D, s * (W / 2), 0, D / 2, CREAM);
    // Window wall: low sill, piers, lintel; the openings are open air (an invisible wall keeps you in).
    const win = 3.2;
    box(f, W, 0.9, 0.4, 0, 0, D, CREAM);
    box(f, W, H - 3.7, 0.4, 0, 3.7, D, CREAM, false);
    for (let u = -W / 2; u <= W / 2 + 0.01; u += win + 1) box(f, 1, 2.8, 0.45, u, 0.9, D, CREAM, false);
    k.solid(f, W, H, 0.3, 0, 0, D);
    // Wood panelling and gold trim inside, coffered ceiling, chandeliers.
    for (const s of [-1, 1]) box(f, 0.1, 1.2, D - 1, s * (W / 2 - 0.25), 0, D / 2, WOOD, false);
    box(f, W - 1, 0.1, 0.1, 0, H - 0.4, 0.3, GOLD, false);
    box(f, W + 0.8, 0.4, D + 0.8, 0, H, D / 2, C(0xe8dccb)); // roof (keeps the rain off)
    for (let v = 4; v < D; v += 5) box(f, W, 0.35, 0.3, 0, H - 0.35, v, WOOD, false);
    for (const u of [-10, 0, 10]) for (const v of [8, 16]) {
      box(f, 0.05, 1, 0.05, u, H - 1.4, v, GOLD, false);
      for (let a = 0; a < 10; a++) k.shape(f, new THREE.SphereGeometry(0.1, 6, 4), u + Math.cos((a / 10) * Math.PI * 2) * 0.7, H - 1.55, v + Math.sin((a / 10) * Math.PI * 2) * 0.7, WARM, 0, k.bulbs);
      k.shape(f, new THREE.SphereGeometry(0.22, 8, 6), u, H - 1.5, v, WARM, 0, k.bulbs);
    }
    // Name board above the windows, facing the room.
    board(f, i, 0, H - 2.2, D - 0.3, 12, 1.4);

    // ---- Garden outside the windows: lawn, palms, a fountain, a hedge ----
    box(f, W, 0.05, GARDEN, 0, 0, D + GARDEN / 2, LAWN, false);
    for (const u of [-14, -6, 6, 14]) palm(f, u, D + 5 + (u % 3), 5.5);
    shape(f, new THREE.CylinderGeometry(2, 2.1, 0.5, 20).translate(0, 0.25, 0), 0, 0, D + 6, CREAM);
    shape(f, new THREE.CylinderGeometry(1.8, 1.8, 0.05, 20), 0, 0.48, D + 6, C(0x5aa9d6));
    shape(f, new THREE.CylinderGeometry(0.2, 0.3, 1.3, 10).translate(0, 0.65, 0), 0, 0.5, D + 6, CREAM);
    // Stone path to the fountain, flower beds, garden lamps, benches, a pergola.
    box(f, 2, 0.02, GARDEN - 1, 0, 0.05, D + GARDEN / 2, C(0xcfc6b4), false);
    for (const [u, v] of [[-11, 3], [-4, 8.5], [4, 8.5], [11, 3], [-15, 8], [15, 8]] as const) {
      box(f, 3.2, 0.25, 1.1, u, 0, D + v, C(0x6b4a2e), false);
      for (let n = 0; n < 6; n++) shape(f, new THREE.IcosahedronGeometry(0.28, 0), u - 1.25 + n * 0.5, 0.35, D + v + ((n % 2) - 0.5) * 0.3, FLOWERS[(n + Math.abs(u)) % FLOWERS.length]);
    }
    for (const u of [-1.6, 1.6]) for (const v of [2, 5, 9]) {
      box(f, 0.08, 1.4, 0.08, u, 0, D + v, C(0x2b2b2b), false);
      k.shape(f, new THREE.SphereGeometry(0.16, 8, 6), u, 1.55, D + v, WARM, 0, k.bulbs);
    }
    for (const u of [-8, 8]) {
      box(f, 1.8, 0.08, 0.5, u, 0.45, D + 5.5, WOOD, false); // bench seat
      box(f, 1.8, 0.45, 0.08, u, 0.5, D + 5.75, WOOD, false);
      for (const e of [-0.8, 0.8]) box(f, 0.08, 0.45, 0.45, u + e, 0, D + 5.5, C(0x2b2b2b), false);
    }
    for (const u of [12, 17]) for (const v of [2, 6]) box(f, 0.2, 2.8, 0.2, u, 0, D + v, CREAM, false); // pergola
    for (let v = 1.8; v <= 6.2; v += 0.55) box(f, 5.6, 0.12, 0.12, 14.5, 2.8, D + v, WOOD, false);
    for (let n = 0; n < 9; n++) shape(f, new THREE.IcosahedronGeometry(0.45, 0).scale(1, 0.5, 1), 12.2 + (n % 3) * 2.3, 3, D + 2 + Math.floor(n / 3) * 2, C(0x3f8a3a));

    // A stone balustrade at the garden's edge, then a lake out to a far shore with a skyline.
    box(f, W, 0.25, 0.5, 0, 0, D + GARDEN - 0.3, CREAM);
    box(f, W, 0.15, 0.55, 0, 0.95, D + GARDEN - 0.3, CREAM, false);
    for (let u = -W / 2 + 0.3; u < W / 2; u += 0.45) shape(f, new THREE.CylinderGeometry(0.07, 0.1, 0.7, 6).translate(0, 0.35, 0), u, 0.25, D + GARDEN - 0.3, CREAM);
    box(f, W + 6, 1.4, 0.4, 0, -1.4, D + GARDEN + 0.1, C(0xb8ad98), false); // retaining wall down to the water
    // (Everything within ~120 m: the town's fog swallows anything further, see sky.ts.)
    box(f, 360, 0.05, 140, 0, -1.2, D + GARDEN + 70, C(0x3f7fa8), false); // lake
    box(f, 360, 0.6, 14, 0, -1.2, D + GARDEN + 100, C(0xc9b98f), false); // far shore
    for (let n = 0; n < 26; n++) {
      const u = -125 + n * 10 + ((n * 37) % 5);
      const h = 6 + ((n * 53) % 22);
      box(f, 5 + ((n * 7) % 6), h, 6, u, -0.6, D + GARDEN + 104 + ((n * 13) % 8), SKYLINE[n % SKYLINE.length], false);
    }
    for (let n = 0; n < 5; n++) {
      // Sailboats: a hull and a white sail.
      const u = -40 + n * 21 + ((n * 17) % 9);
      const v = D + GARDEN + 25 + ((n * 23) % 45);
      box(f, 2.2, 0.4, 0.8, u, -1.2, v, C(0x8a5a3a), false);
      shape(f, new THREE.ConeGeometry(1, 3, 3).scale(0.2, 1, 1), u, -0.8, v, C(0xf4f1ea));
    }

    // ---- Buffet along the left wall, a chef behind it ----
    box(f, 1.1, 0.95, 9, -W / 2 + 1.6, 0, 12, C(0xf3eee4));
    box(f, 1.2, 0.05, 9.1, -W / 2 + 1.6, 0.95, 12, GOLD, false);
    for (let v = 8.2; v <= 15.8; v += 1.25) {
      shape(f, new THREE.CylinderGeometry(0.3, 0.24, 0.16, 12), -W / 2 + 1.6, 1.0, v, C(0xd8d8d8));
      shape(f, new THREE.SphereGeometry(0.24, 10, 6).scale(1, 0.4, 1), -W / 2 + 1.6, 1.12, v, FOODS[Math.floor(v) % FOODS.length]);
    }
    pose(`Chef (${title(hotel.en.split(' ·')[0])})`, -W / 2 + 0.6, 12, eatYaw, 'idle', STAFF_HOURS, FLOOR_TOP, undefined, 'mx06');

    // ---- Music stage in the corner: a low platform, a stool, the musician ----
    box(f, 5, 0.4, 4, W / 2 - 3, 0, 4, WOOD);
    shape(f, new THREE.CylinderGeometry(0.22, 0.2, SEAT_TOP, 10).translate(0, SEAT_TOP / 2, 0), W / 2 - 3, 0.4, 4.4, C(0x3b1f0f));
    pose('Veena player', W / 2 - 3, 4.4, eatYaw + Math.PI, 'sit_idle', MUSIC_HOURS, 0.4 + SEAT_TOP - BENCH_TOP, undefined, 'mx14');

    // ---- Host stand by the door: order here ----
    box(f, 1, 1.15, 0.6, 3, FLOOR_TOP, 2.4, WOOD);
    const spot = f.at(3, 1.6, FLOOR_TOP);
    pose('Head waiter', 3, 3.1, inYaw + Math.PI, 'idle', STAFF_HOURS, FLOOR_TOP, undefined, 'mx07');
    pose('Waiter', -6.5, 10.5, eatYaw, 'idle', STAFF_HOURS, FLOOR_TOP, undefined, 'mx08');
    pose('Waitress', 6.5, 15.5, eatYaw + Math.PI, 'idle', STAFF_HOURS, FLOOR_TOP, undefined, 'mx02');

    // ---- Tables: white cloth, a candle, two chairs facing along the room ----
    let t = 0;
    for (const tv of TABLE_V) for (const tu of TABLE_U) {
      shape(f, new THREE.CylinderGeometry(0.42, 0.42, 0.04, 16), tu, FLOOR_TOP + TABLE_TOP - 0.04, tv, CLOTH);
      shape(f, new THREE.CylinderGeometry(0.43, 0.46, 0.08, 16).translate(0, 0.04, 0), tu, FLOOR_TOP + TABLE_TOP - 0.12, tv, C(0xf6f3ec));
      shape(f, new THREE.CylinderGeometry(0.05, 0.08, TABLE_TOP - 0.12, 8).translate(0, (TABLE_TOP - 0.12) / 2, 0), tu, FLOOR_TOP, tv, GOLD);
      k.shape(f, new THREE.CylinderGeometry(0.03, 0.03, 0.12, 6), tu, FLOOR_TOP + TABLE_TOP, tv, C(0xffd27a), 0, k.bulbs);
      k.solid(f, 0.84, TABLE_TOP, 0.84, tu, 0, tv);
      for (const sg of [-1, 1]) {
        const cu = tu + sg * SEAT_GAP;
        box(f, 0.44, 0.06, 0.44, cu, FLOOR_TOP + SEAT_TOP - 0.06, tv, CHAIR, false);
        box(f, 0.06, 0.6, 0.44, cu + sg * 0.22, FLOOR_TOP + SEAT_TOP, tv, WOOD, false);
        for (const lu of [-0.18, 0.18]) for (const lv of [-0.18, 0.18]) box(f, 0.04, SEAT_TOP - 0.06, 0.04, cu + lu, FLOOR_TOP, tv + lv, WOOD, false);
        const seat = f.at(cu, tv, FLOOR_TOP + SEAT_TOP);
        if (t === 1 && sg < 0) {
          // Your table: order at the host stand and the meal walks you here and serves you.
          eateries.push({ name: `${title(hotel.diner[1].split(' ·')[0])}, ${title(hotel.en.split(' ·')[0])}`, menu: PLACE_MENUS.fine, spot, seat, seatYaw: eatYaw - Math.PI / 2, eatYaw, table: f.at(tu - 0.22, tv, FLOOR_TOP + TABLE_TOP), china: true });
        } else if ((t * 2 + (sg > 0 ? 1 : 0) + i) % 4 !== 3) {
          const pu = tu + sg * 0.24;
          shape(f, new THREE.CylinderGeometry(0.15, 0.12, 0.016, 18), pu, FLOOR_TOP + TABLE_TOP, tv, C(0xffffff));
          shape(f, new THREE.SphereGeometry(0.08, 10, 6).scale(1, 0.45, 1), pu, FLOOR_TOP + TABLE_TOP + 0.016, tv, FOODS[(t + (sg > 0 ? 1 : 0) + i) % FOODS.length]);
          pose(`${DINERS[(i * 5 + t * 2 + (sg > 0 ? 1 : 0)) % DINERS.length]} dining`, cu, tv, sg < 0 ? eatYaw : eatYaw + Math.PI, 'sit_idle', DINER_HOURS, FLOOR_TOP + SEAT_TOP - BENCH_TOP, f.at(pu, tv, FLOOR_TOP + TABLE_TOP + 0.04));
        }
      }
      t++;
    }

    halls.push({ entry: f.at(0, 1.8, FLOOR_TOP), entryYaw: inYaw, exit: f.at(0, 0.7, FLOOR_TOP) });
  });

  return { halls, eateries, posed, setNight: k.build(scene, false) };
}
