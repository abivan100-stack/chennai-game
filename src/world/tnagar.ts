import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { PoseClip } from '../npcs/npc';
import { GeoBuilder } from './geo';
import { createKit, frame, type Frame, type SignDef } from './kit';
import { BOUNDS, RAIL_HALF, RAIL_X, SETBACK, SIDEWALK_HEIGHT, TNAGAR, Z_LINES } from './layout';

/**
 * T. Nagar, stylised (invented shop names):
 * - Ranganathan Street: a packed pedestrian bazaar lane from Usman Road to Mambalam station.
 *   Narrow 3-5 storey shops both sides, stacks of signboards and vertical banners, goods spilling
 *   out (clothes racks, steel vessels, bangles, bags), hawker carts, bunting and lights strung
 *   across, a gateway arch at the Usman Road end;
 * - Mambalam station on the suburban railway: platforms with sheds, a footbridge, the yellow
 *   station board, a parked EMU train; the line runs the whole map (fenced, level crossings);
 * - Panagal Park: railings, lawn, paths, trees, the statue, a fountain, benches;
 * - Pondy Bazaar: the paved promenade on Sir Thyagaraya Road (bollards, planters, heritage
 *   lamps, benches) and a gantry board over the road.
 * One kit (3 draw calls) + the rail mesh (1).
 */

const SHOP_NAMES: [string, string, string, string][] = [
  ['லக்ஷ்மி ஸ்டீல்ஸ்', 'LAKSHMI STEELS', '#0d47a1', '#ffffff'],
  ['கணேஷ் ஃபேன்சி', 'GANESH FANCY STORE', '#c62828', '#ffeb3b'],
  ['வேலன் பாத்திரக்கடை', 'VELAN VESSELS', '#37474f', '#ffffff'],
  ['மீனாட்சி வளையல்', 'MEENAKSHI BANGLES', '#ad1457', '#ffffff'],
  ['அன்னை ஃபேஷன்ஸ்', 'ANNAI FASHIONS', '#6a1b9a', '#fff59d'],
  ['கண்ணன் ரெடிமேட்ஸ்', 'KANNAN READYMADES', '#1b5e20', '#ffffff'],
  ['முருகன் ஸ்டோர்ஸ்', 'SRI MURUGAN STORES', '#e65100', '#ffffff'],
  ['ராஜா ஃபுட்வேர்', 'RAJA FOOTWEAR', '#212121', '#ffd54f'],
  ['செல்வி சில்க்ஸ்', 'SELVI SILKS', '#880e4f', '#ffd54f'],
  ['தங்கம் ஜுவல்லரி', 'THANGAM JEWELLERY', '#b8860b', '#ffffff'],
  ['பொன்னி பிளாஸ்டிக்ஸ்', 'PONNI PLASTICS', '#00838f', '#ffffff'],
  ['சக்தி மொபைல்ஸ்', 'SAKTHI MOBILES', '#1565c0', '#ffffff'],
  ['மகாலட்சுமி சாரீஸ்', 'MAHALAKSHMI SAREES', '#d81b60', '#ffffff'],
  ['வேல் டாய்ஸ்', 'VEL TOYS', '#f9a825', '#1a1a1a'],
  ['பிரியா பேக்ஸ்', 'PRIYA BAGS', '#4e342e', '#ffffff'],
  ['சரவண டெக்ஸ்', 'SARAVANA TEX', '#283593', '#ffeb3b'],
];
const S = {
  arch: SHOP_NAMES.length,
  station: SHOP_NAMES.length + 1,
  panagal: SHOP_NAMES.length + 2,
  pondy: SHOP_NAMES.length + 3,
};
const SIGNS: SignDef[] = [
  ...SHOP_NAMES,
  ['ரங்கநாதன் தெரு', 'RANGANATHAN STREET', '#b71c1c', '#ffffff'],
  ['மாம்பலம்', 'MAMBALAM', '#ffd400', '#111111'],
  ['பனகல் பூங்கா', 'PANAGAL PARK', '#2e7d32', '#ffffff'],
  ['பாண்டி பஜார்', 'PONDY BAZAAR · WALK & SHOP', '#0d3b66', '#ffffff'],
];

const C = (hex: number) => new THREE.Color(hex);
const FACADES = [0xf3e2b3, 0xe8c8a8, 0xd6e4ea, 0xf2d0d8, 0xe3e3d1, 0xcfe0c8, 0xf6d9a8, 0xd9d2e9].map(C);
const GOODS = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0x8e24aa, 0xff7043, 0xffffff, 0x26c6da, 0xec407a].map(C);
const STEEL = C(0xc4c9ce);
const DARK = C(0x2b2b2b);
const PAVING = C(0xcfc6b4);
/** Modulo that stays positive (x is negative out here in T. Nagar). */
const mod = (a: number, n: number) => ((a % n) + n) % n;

type Posed = { name: string; x: number; y: number; z: number; yaw: number; clip: PoseClip; hours: [number, number][] };
type Walker = { name: string; loop: [number, number][]; y: number; hours: [number, number][] };

export function createTNagar(scene: THREE.Scene, world: RAPIER.World) {
  const k = createKit(world, SIGNS);
  const { box, board, shape } = k;
  const posed: Posed[] = [];
  const walkers: Walker[] = [];
  let seed = 7;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];

  // ---------------------------------------------------------------- Ranganathan Street
  const rb = TNAGAR.ranganathan();
  const lane = TNAGAR.lane;
  const y0 = SIDEWALK_HEIGHT;
  // Lane floor, level with the pavements.
  box(frame({ x0: rb.x0, x1: rb.x1, z0: lane.z0, z1: lane.z1, front: 's' }), rb.x1 - rb.x0, y0, lane.z1 - lane.z0, 0, 0, (lane.z1 - lane.z0) / 2, PAVING);
  /** One row of narrow shops facing the lane. */
  const shopRow = (f: Frame, side: number) => {
    let u = -f.w / 2;
    let n = 0;
    while (u < f.w / 2 - 2.5) {
      const w = Math.min(f.w / 2 - u, 4 + rnd() * 3.5);
      const cu = u + w / 2;
      const floors = 3 + Math.floor(rnd() * 3);
      const h = 3.4 + floors * 3.1;
      const d = f.d - 0.4;
      const facade = pick(FACADES);
      box(f, w - 0.1, h, d - 1, cu, 0, 1 + (d - 1) / 2, facade);
      // Open shopfront: a dark interior, shelves of goods, the shutter rolled up.
      box(f, w - 0.7, 2.8, 0.1, cu, y0, 1.05, C(0x2a2018), false);
      for (let r = 0; r < 3; r++) for (let x = -w / 2 + 0.6; x < w / 2 - 0.5; x += 0.45) box(f, 0.35, 0.4, 0.12, cu + x, y0 + 0.4 + r * 0.8, 1.0, pick(GOODS), false);
      box(f, w - 0.6, 0.35, 0.3, cu, y0 + 2.85, 1.0, C(0x8f9396), false); // rolled shutter
      // Big board over the shop, a smaller one above, a vertical banner, an awning.
      const sign = (n * 5 + side * 3) % SHOP_NAMES.length;
      board(f, sign, cu, y0 + 3.1, 0.95, w - 0.4, 1.1);
      if (floors > 3 && rnd() < 0.7) board(f, (sign + 7) % SHOP_NAMES.length, cu, y0 + 6.6, 0.95, w * 0.8, 0.9);
      if (rnd() < 0.65) box(f, 0.9, h - 5, 0.12, cu + (rnd() < 0.5 ? -1 : 1) * (w / 2 - 0.6), 4.5, 0.85, pick(GOODS), false);
      shape(f, new THREE.BoxGeometry(w - 0.2, 0.05, 1.3).rotateX(-0.35), cu, y0 + 2.75, 0.4, pick(GOODS));
      // Upper floors: windows and the odd AC unit.
      for (let fl = 1; fl < floors; fl++) {
        const yy = 3.4 + fl * 3.1 - 2.2;
        box(f, w * 0.5, 1.3, 0.08, cu, yy, 0.95, C(0x3d5a73), false);
        if (rnd() < 0.35) box(f, 0.8, 0.5, 0.4, cu + w * 0.3, yy - 0.2, 0.75, C(0xeeeeee), false);
      }
      // Goods spilling out in front: a clothes rack or a stack of steel vessels or a table of bangles.
      const kind = n % 3;
      if (kind === 0) {
        box(f, w * 0.7, 0.05, 0.05, cu, y0 + 1.7, 0.45, DARK, false);
        for (let x = -w * 0.33; x < w * 0.33; x += 0.3) box(f, 0.24, 0.9, 0.05, cu + x, y0 + 0.8, 0.45, pick(GOODS), false);
      } else if (kind === 1) {
        for (let s2 = 0; s2 < 4; s2++) shape(f, new THREE.CylinderGeometry(0.25 - s2 * 0.04, 0.22 - s2 * 0.04, 0.22, 12), cu - 0.6, y0 + s2 * 0.22, 0.5, STEEL);
        for (let s2 = 0; s2 < 3; s2++) shape(f, new THREE.CylinderGeometry(0.2, 0.18, 0.3, 12), cu + 0.5, y0 + s2 * 0.3, 0.5, STEEL);
      } else {
        box(f, 1.4, 0.8, 0.6, cu, y0, 0.45, C(0x7a5534), false);
        for (let x = -0.55; x <= 0.55; x += 0.18) shape(f, new THREE.TorusGeometry(0.06, 0.015, 4, 10).rotateX(Math.PI / 2), cu + x, y0 + 0.82, 0.45, pick(GOODS));
      }
      // The shopkeeper at the door.
      const at = f.at(cu - w / 4, 1.6);
      const out = f.at(cu, 0).sub(f.at(cu, 1));
      if (n % 2 === 0) posed.push({ name: `${SHOP_NAMES[sign][1].split(' ')[0][0]}${SHOP_NAMES[sign][1].split(' ')[0].slice(1).toLowerCase()} kadai owner`, x: at.x, y: y0, z: at.z, yaw: Math.atan2(out.x, out.z), clip: 'idle', hours: [[9, 22]] });
      u += w;
      n++;
    }
  };
  shopRow(frame({ x0: rb.x0, x1: rb.x1, z0: rb.z0, z1: lane.z0, front: 's' }), 0);
  shopRow(frame({ x0: rb.x0, x1: rb.x1, z0: lane.z1, z1: rb.z1, front: 'n' }), 1);
  // Bunting and string lights across the lane, hawker carts along it.
  const lf = frame({ x0: rb.x0, x1: rb.x1, z0: lane.z0, z1: lane.z1, front: 's' });
  for (let u = -lf.w / 2 + 3; u < lf.w / 2 - 2; u += 5) {
    for (let t = 0; t <= 10; t++) {
      const v = (t / 10) * lf.d;
      const yy = 5.2 - Math.sin((t / 10) * Math.PI) * 0.5;
      shape(lf, new THREE.ConeGeometry(0.12, 0.25, 3).rotateX(Math.PI), u, yy, v, GOODS[mod(t + Math.round(u), GOODS.length)]);
      if (t % 2 === 0) k.shape(lf, new THREE.SphereGeometry(0.06, 6, 4), u + 2.5, yy - 0.2, v, C(0xffe9a8), 0, k.bulbs);
    }
  }
  for (let u = -lf.w / 2 + 6; u < lf.w / 2 - 4; u += 11) {
    const v = mod(Math.round(u), 2) ? 0.9 : lf.d - 0.9;
    box(lf, 1.4, 0.8, 0.8, u, y0 + 0.3, v, C(0x8d6e63));
    for (const e of [-0.6, 0.6]) box(lf, 0.05, 1.6, 0.05, u + e, y0 + 1.1, v, DARK, false);
    box(lf, 1.8, 0.05, 1.2, u, y0 + 2.7, v, pick(GOODS), false);
    for (let x = -0.5; x <= 0.5; x += 0.25) shape(lf, new THREE.IcosahedronGeometry(0.1, 0), u + x, y0 + 1.2, v, pick(GOODS));
  }
  // Gateway arch at the Usman Road end.
  {
    const af = frame({ x0: rb.x1 - 1, x1: rb.x1, z0: lane.z0, z1: lane.z1, front: 'e' });
    for (const s of [-1, 1]) box(af, 0.45, 6.2, 0.45, s * 3.4, 0, 0.6, C(0xb71c1c));
    box(af, 7.4, 1.4, 0.4, 0, 6.2, 0.6, C(0xb71c1c), false);
    board(af, S.arch, 0, 6.3, 0.38, 6.8, 1.2);
  }
  // Crowd: shoppers walking the lane both ways.
  for (let n = 0; n < 16; n++) {
    const off = lane.z0 + 0.9 + (n % 5) * 1.1;
    const a = rb.x0 + 3 + (n % 3);
    const b2 = rb.x1 - 3 - (n % 4);
    walkers.push({ name: ['Shopper Kala', 'Shopper Revathi', 'Shopper Prabhu', 'Shopper Anitha', 'Bride-to-be Divya', 'Amma & daughter', 'Shopper Manoj', 'Shopper Fathima'][n % 8], loop: n % 2 ? [[a, off], [b2, off + 0.3]] : [[b2, off], [a, off + 0.3]], y: y0, hours: [[9, 22]] });
  }

  // ---------------------------------------------------------------- Station lane + Mambalam station
  {
    const sl = TNAGAR.stationLane;
    const sf = frame(sl);
    box(sf, sf.w - 0.2, y0, sf.d, 0, 0, sf.d / 2, PAVING);
    for (let u = -sf.w / 2 + 2; u < sf.w / 2; u += 4.5) {
      for (const v of [0.8, sf.d - 0.8]) {
        box(sf, 2.2, 0.08, 1.6, u, y0 + 2.2, v, pick(GOODS), false); // tarp
        for (const e of [-1, 1]) box(sf, 0.05, 2.2, 0.05, u + e, y0, v, DARK, false);
        box(sf, 1.6, 0.7, 0.8, u, y0, v, C(0x8d6e63));
      }
    }
  }
  {
    const st = TNAGAR.station;
    const f = frame(st);
    const { w, d } = f;
    box(f, w, 0.9, d, 0, 0, d / 2, C(0xc9c3b6)); // concourse floor (platform height)
    for (const s of [-1, 1]) box(f, 1.2, 0.9, 2, s * 0, 0, 0, C(0xbdb5a5), false);
    box(f, w - 1, 3.6, 0.3, 0, 0.9, d - 0.15, C(0xf3e2b3)); // back wall to the tracks side
    box(f, w + 0.8, 0.3, d + 0.8, 0, 4.5, d / 2, C(0x8a8f94), false); // roof
    for (const s of [-1, 1]) box(f, 0.4, 3.6, 0.4, s * (w / 2 - 0.4), 0.9, 1, C(0xd6cfc2));
    box(f, w, 1.4, 0.3, 0, 4.8, 0.3, C(0xffd400), false);
    board(f, S.station, 0, 4.85, 0.12, w - 1.6, 1.3);
    box(f, 3, 1.1, 0.6, -w / 2 + 3, 0.9, d - 2, C(0x5d4037)); // ticket counter
    // Ramp up from the lane.
    shape(f, new THREE.BoxGeometry(4, 0.1, 5).rotateX(0.18).translate(0, 0, 0), 0, 0.45, -2.2, C(0xbdb5a5));
    k.solid(f, 4, 0.9, 5, 0, -0.45, -2.2);
  }
  // The railway: two tracks the whole length of the map, ballast, a fence each side with gaps
  // at the level crossings, platforms with sheds at the station, a footbridge, an EMU train.
  const rail = new GeoBuilder();
  const tracks = [RAIL_X - 3, RAIL_X + 3];
  const crossings = Z_LINES.map((z) => [z - SETBACK, z + SETBACK] as [number, number]);
  const spans: [number, number][] = [];
  let zz = BOUNDS.z0;
  for (const [a, b] of crossings) {
    if (a > zz) spans.push([zz, a]);
    zz = b;
  }
  spans.push([zz, BOUNDS.z1]);
  rail.box(RAIL_HALF * 1.6, 0.1, BOUNDS.z1 - BOUNDS.z0, RAIL_X, 0.05, (BOUNDS.z0 + BOUNDS.z1) / 2, C(0x7a7064)); // ballast
  for (const tx of tracks) {
    for (const s of [-0.75, 0.75]) rail.box(0.08, 0.12, BOUNDS.z1 - BOUNDS.z0, tx + s, 0.16, (BOUNDS.z0 + BOUNDS.z1) / 2, C(0x8a8a8a));
    for (let z = BOUNDS.z0; z < BOUNDS.z1; z += 1.2) rail.box(2.3, 0.08, 0.25, tx, 0.12, z, C(0x6d6359));
  }
  for (const [a, b] of spans) {
    for (const s of [-1, 1]) {
      const x = RAIL_X + s * (RAIL_HALF - 0.3);
      // No fence on the station side along the platform (people walk up from the lane).
      const pieces: [number, number][] = s > 0 && a < TNAGAR.platform.z1 && b > TNAGAR.platform.z0 ? [[a, Math.max(a, TNAGAR.platform.z0)], [Math.min(b, TNAGAR.platform.z1), b]] : [[a, b]];
      for (const [p0, p1] of pieces) {
        if (p1 - p0 < 1) continue;
        rail.box(0.2, 1.6, p1 - p0, x, 0.8, (p0 + p1) / 2, C(0xd6cfc2));
        world.createCollider(RAPIER.ColliderDesc.cuboid(0.1, 0.8, (p1 - p0) / 2).setTranslation(x, 0.8, (p0 + p1) / 2));
      }
    }
  }
  // Level crossings: boom gates (raised) at each road.
  for (const z of Z_LINES) for (const s of [-1, 1]) {
    rail.box(0.3, 1.2, 0.3, RAIL_X + s * (RAIL_HALF - 0.5), 0.6, z + s * 4.2, C(0xffffff));
    rail.box(0.12, 4.5, 0.12, RAIL_X + s * (RAIL_HALF - 0.5), 3.4, z + s * 4.2, (Math.round(z) % 2 ? C(0xd32f2f) : C(0xffffff)));
  }
  // Platforms either side of the tracks, with sheds.
  const pz0 = TNAGAR.platform.z0;
  const pz1 = TNAGAR.platform.z1;
  for (const px of [RAIL_X - 7.4, RAIL_X + 7.4]) {
    rail.box(3.6, 0.9, pz1 - pz0, px, 0.45, (pz0 + pz1) / 2, C(0xc9c3b6));
    rail.box(0.3, 0.02, pz1 - pz0, px + (px < RAIL_X ? 1.65 : -1.65), 0.91, (pz0 + pz1) / 2, C(0xf2c200));
    world.createCollider(RAPIER.ColliderDesc.cuboid(1.8, 0.45, (pz1 - pz0) / 2).setTranslation(px, 0.45, (pz0 + pz1) / 2));
    for (let z = pz0 + 5; z < pz1 - 4; z += 8) rail.box(0.25, 3.4, 0.25, px, 2.6, z, C(0x6d7478));
    rail.box(4.2, 0.15, pz1 - pz0 - 10, px, 4.35, (pz0 + pz1) / 2, C(0x8a8f94));
    for (let z = pz0 + 6; z < pz1 - 4; z += 12) {
      rail.box(1.6, 0.35, 0.08, px, 1.6, z, C(0xffd400)); // station name boards
      rail.box(1.5, 0.08, 0.5, px, 1.35, z + 3, C(0x5d4037)); // bench
    }
  }
  // Footbridge over the tracks near the station.
  rail.box(RAIL_HALF * 1.6, 0.3, 2.4, RAIL_X, 6.2, 48, C(0x9e9e9e));
  for (const s of [-1, 1]) rail.box(RAIL_HALF * 1.6, 1.1, 0.1, RAIL_X, 6.85, 48 + s * 1.15, C(0x607d8b));
  // A parked EMU on the east track: two coaches, blue and white, with windows.
  const coach = 13.6;
  for (let c = 0; c < 2; c++) {
    const cz = pz0 + 0.5 + coach / 2 + c * (coach + 0.4);
    rail.box(3, 2.7, coach, tracks[1], 1.75, cz, C(0xf2f2ee));
    rail.box(3.02, 0.6, coach, tracks[1], 1.1, cz, C(0x1d4fa8));
    rail.box(3.04, 0.7, coach - 2, tracks[1], 2.4, cz, C(0x23323f));
    rail.box(2.4, 0.2, coach - 1, tracks[1], 3.2, cz, C(0xb0b6bb));
    for (const s of [-1, 1]) for (const dz of [-4, 0, 4]) rail.box(0.06, 1.9, 1.2, tracks[1] + s * 1.52, 1.4, cz + dz, C(0x1d4fa8));
  }
  world.createCollider(RAPIER.ColliderDesc.cuboid(1.5, 1.6, coach + 0.2).setTranslation(tracks[1], 1.6, pz0 + 0.7 + coach));
  const railMesh = new THREE.Mesh(rail.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  railMesh.receiveShadow = railMesh.castShadow = true;
  scene.add(railMesh);
  // People waiting on the platform.
  for (let n = 0; n < 6; n++) {
    const z = pz0 + 2 + n * 4.8;
    posed.push({ name: ['Office-goer Ravi', 'Student Priya', 'Commuter Suresh', 'Vendor Amma', 'Commuter Joseph', 'Student Arjun', 'Commuter Lakshmi', 'Clerk Mohan'][n], x: RAIL_X + 7.8, y: 0.9, z, yaw: -Math.PI / 2, clip: 'idle', hours: [[6, 22.5]] });
  }

  // ---------------------------------------------------------------- Panagal Park
  {
    const f = frame(TNAGAR.panagal());
    const { w, d } = f;
    box(f, w - 0.4, 0.05, d - 0.4, 0, 0, d / 2, C(0x5d9440), false);
    for (const [a, b, v] of [[-w / 2, -2, 0.2], [2, w / 2, 0.2]] as const) box(f, b - a, 0.5, 0.25, (a + b) / 2, 0, v, C(0xd6cfc2));
    box(f, w, 0.5, 0.25, 0, 0, d - 0.2, C(0xd6cfc2));
    box(f, 0.25, 0.5, d, -w / 2 + 0.1, 0, d / 2, C(0xd6cfc2));
    box(f, 0.25, 0.5, d, w / 2 - 0.1, 0, d / 2, C(0xd6cfc2));
    for (let u = -w / 2; u <= w / 2; u += 1) for (const v of [0.2, d - 0.2]) box(f, 0.04, 1.1, 0.04, u, 0.5, v, C(0x2e7d32), false); // railings
    box(f, 3.6, 0.03, d - 1, 0, 0.05, d / 2, C(0xcbb994), false); // path in from the gate
    box(f, w - 6, 0.03, 2.4, 0, 0.05, d / 2, C(0xcbb994), false);
    box(f, 3, 1.6, 3, 0, 0, d / 2, C(0xd6cfc2)); // statue pedestal
    shape(f, new THREE.CylinderGeometry(0.35, 0.45, 2, 10).translate(0, 1, 0), 0, 1.6, d / 2, C(0x6d6d6d));
    shape(f, new THREE.SphereGeometry(0.3, 10, 8), 0, 3.85, d / 2, C(0x6d6d6d));
    for (const s of [-1, 1]) {
      shape(f, new THREE.CylinderGeometry(1.6, 1.7, 0.5, 18).translate(0, 0.25, 0), s * (w / 4 + 4), 0, d / 2, C(0xd6cfc2));
      shape(f, new THREE.CylinderGeometry(1.4, 1.4, 0.05, 18), s * (w / 4 + 4), 0.48, d / 2, C(0x5aa9d6));
      for (const v of [4, d - 4]) for (let u = 6; u < w / 2 - 2; u += 7) k.tree(f, s * u, v, 1.1);
      box(f, 1.6, 0.45, 0.5, s * 6, 0, d / 2 + 2.2, C(0x7a5534));
    }
    board(f, S.panagal, 0, 1.2, 0.05, 6, 0.9);
    for (const s of [-1, 1]) box(f, 0.4, 2.2, 0.4, s * 2, 0, 0.2, C(0xd6cfc2));
    for (let n = 0; n < 6; n++) walkers.push({ name: ['Walker Rajan', 'Walker Kamala', 'Retired Iyer', 'Walker Mani', 'Walker Uma', 'Jogger Hari'][n], loop: [f.at(-w / 2 + 3 + n, 3), f.at(w / 2 - 3 - n, 3), f.at(w / 2 - 3 - n, d - 3), f.at(-w / 2 + 3 + n, d - 3)].map((p) => [p.x, p.z] as [number, number]), y: 0.05, hours: [[5.5, 9.5], [16.5, 20.5]] });
  }

  // ---------------------------------------------------------------- Pondy Bazaar promenade
  {
    const p = TNAGAR.pondy;
    for (const side of [-1, 1]) {
      const zc = p.z + side * 5.6;
      for (let x = p.x0 + 3; x < p.x1 - 3; x += 3) {
        if ([-520, -440, -360, -265].some((c) => Math.abs(x - c) < SETBACK + 1.5)) continue;
        const f = frame({ x0: x - 0.5, x1: x + 0.5, z0: zc - 0.5, z1: zc + 0.5, front: side > 0 ? 'n' : 's' });
        box(f, 0.18, 0.75, 0.18, 0, y0, 0.5, DARK); // bollard
        if (mod(Math.round(x), 15) === 0) {
          shape(f, new THREE.CylinderGeometry(0.45, 0.38, 0.6, 12).translate(0, 0.3, 0), 0, y0, 0.5, C(0xb0aa9c)); // planter
          shape(f, new THREE.IcosahedronGeometry(0.55, 0), 0, y0 + 1.1, 0.5, C(0x3f7f35));
        } else if (mod(Math.round(x), 15) === 6) {
          box(f, 0.12, 4, 0.12, 0, y0, 0.5, C(0x1a1a1a), false); // heritage lamp
          for (const e of [-0.35, 0.35]) k.shape(f, new THREE.SphereGeometry(0.18, 8, 6), e, y0 + 4, 0.5, C(0xfff1c8), 0, k.bulbs);
        } else if (mod(Math.round(x), 15) === 9) {
          box(f, 1.5, 0.45, 0.45, 0, y0, 0.8, C(0x9e9384)); // granite bench
        }
      }
    }
    // Gantry board across the road.
    const gf = frame({ x0: -392, x1: -388, z0: p.z - 7, z1: p.z + 7, front: 'e' });
    for (const s of [-1, 1]) box(gf, 0.35, 7, 0.35, s * 6.6, 0, 2, C(0x37474f));
    box(gf, 13.6, 1.6, 0.3, 0, 7, 2, C(0x0d3b66), false);
    board(gf, S.pondy, 0, 7.1, 1.82, 12.8, 1.4);
  }

  return { posed, walkers, setNight: k.build(scene) };
}
