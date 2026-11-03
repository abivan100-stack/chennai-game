import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { createKit, frame, type Frame } from './kit';
import { HOME_LOTS } from './layout';

/**
 * Standard Chennai homes you can walk into: a small single-storey house behind a compound wall
 * and gate, with a hall (sofa, TV, coffee table, fan), a kitchen (granite counter, gas stove +
 * cylinder, fridge, sink, steel dabbas) and a bedroom (bed, steel almirah, mirror table). Flat
 * roof with the black water tank. Home 0 is the rented house you start in; the others are for
 * sale (board on the gate). A home you don't own is locked (an invisible wall in the doorway).
 * One kit for all of them: 3 draw calls (no shadows: the roof would leave the rooms dark), plus
 * one small "for sale" sign per house for sale.
 */

/** Order matches layout.HOME_LOTS. price 0 = the rented house you start in. */
export const HOMES: { name: string; area: string; price: number; wall: number }[] = [
  { name: 'Your rented house', area: 'Mandaveli', price: 0, wall: 0xf3d9a4 },
  { name: 'House for sale', area: 'R.A. Puram', price: 150000, wall: 0xcfe3d0 },
  { name: 'House for sale', area: 'R.A. Puram', price: 180000, wall: 0xf2c9c1 },
  { name: 'House for sale', area: 'Alwarpet', price: 250000, wall: 0xd6e0f0 },
];

const C = (hex: number) => new THREE.Color(hex);
const INSIDE = C(0xf6efe0);
const FLOOR = C(0xd9cfbd);
const KITCHEN_TILE = C(0xe8f0f2);
const WOOD = C(0x7a5534);
const STEEL = C(0xb4b9be);
const GRANITE = C(0x2e2e30);
const H = 3; // ceiling
const T = 0.2; // wall thickness
const PLINTH = 0.15;
const DOOR = { u: -2.7, w: 1.1 }; // front door: centre along the frontage, width

export interface Home {
  name: string;
  area: string;
  price: number;
  /** Stand here (outside the gate) to buy it. */
  sale: THREE.Vector3;
  /** Lie down here (E) to sleep. */
  bed: THREE.Vector3;
  /** Lock / unlock the front door. */
  setOwned(owned: boolean): void;
}

export function createHomes(scene: THREE.Scene, world: RAPIER.World) {
  const k = createKit(world, [['', '', '#000000', '#000000']]);
  const { box, shape } = k;
  const homes: Home[] = [];
  const q = new THREE.Quaternion();

  /** A wall along the frontage direction (u) at depth v, with gaps [u0, u1] (doors: lintel above). */
  const wallU = (f: Frame, v: number, u0: number, u1: number, colour: THREE.Color, gaps: [number, number][] = []) => {
    let a = u0;
    for (const [g0, g1] of [...gaps, [u1, u1] as [number, number]]) {
      if (g0 > a) box(f, g0 - a, H, T, (a + g0) / 2, PLINTH, v, colour);
      if (g1 > g0) box(f, g1 - g0, H - 2.2, T, (g0 + g1) / 2, PLINTH + 2.2, v, colour, false);
      a = g1;
    }
  };
  /** A wall going inwards (v) at u, from v0 to v1, with gaps. */
  const wallV = (f: Frame, u: number, v0: number, v1: number, colour: THREE.Color, gaps: [number, number][] = []) => {
    let a = v0;
    for (const [g0, g1] of [...gaps, [v1, v1] as [number, number]]) {
      if (g0 > a) box(f, T, H, g0 - a, u, PLINTH, (a + g0) / 2, colour);
      if (g1 > g0) box(f, T, H - 2.2, g1 - g0, u, PLINTH + 2.2, (g0 + g1) / 2, colour, false);
      a = g1;
    }
  };
  const fan = (f: Frame, u: number, v: number) => {
    box(f, 0.05, 0.4, 0.05, u, H + PLINTH - 0.45, v, C(0xffffff), false);
    for (let b = 0; b < 3; b++) shape(f, new THREE.BoxGeometry(0.9, 0.02, 0.12).translate(0.45, 0, 0), u, H + PLINTH - 0.5, v, C(0xf0ece4), (b / 3) * Math.PI * 2);
  };
  const tube = (f: Frame, u: number, v: number, along: 'u' | 'v') =>
    k.shape(f, new THREE.BoxGeometry(along === 'u' ? 1.2 : 0.06, 0.06, along === 'v' ? 1.2 : 0.06), u, 2.5, v, C(0xffffff), 0, k.bulbs);
  const window = (f: Frame, u: number, v: number, w: number, side: 'u' | 'v') => {
    // Glass with a white grill, both faces of the wall.
    const g = side === 'u' ? [w, 1.2, T + 0.04] : [T + 0.04, 1.2, w];
    box(f, g[0], g[1], g[2], u, PLINTH + 1, v, C(0x3d5a73), false);
    for (let x = -w / 2 + 0.15; x < w / 2; x += 0.2) {
      if (side === 'u') box(f, 0.03, 1.2, T + 0.08, u + x, PLINTH + 1, v, C(0xffffff), false);
      else box(f, T + 0.08, 1.2, 0.03, u, PLINTH + 1, v + x, C(0xffffff), false);
    }
    if (side === 'u') box(f, w + 0.3, 0.08, 0.5, u, PLINTH + 2.3, v - 0.25, C(0xd9d2c3), false); // sunshade
  };

  const signs: THREE.Mesh[] = [];
  HOME_LOTS().forEach((lot, i) => {
    const hm = HOMES[i];
    const f = frame(lot);
    const wall = C(hm.wall);
    const x0 = -5.5;
    const x1 = 5.5;
    const v0 = 2.5; // front wall
    const v1 = 12.5; // back wall
    const vMid = 7.5; // hall / kitchen | bedroom
    const uMid = 1; // hall | kitchen

    // ---- Yard: compound wall with a gate, kolam at the door, potted plants ----
    const gate: [number, number] = [DOOR.u - 0.9, DOOR.u + 0.9];
    for (const [a, b] of [[-f.w / 2, gate[0]], [gate[1], f.w / 2]]) box(f, b - a, 1.2, 0.2, (a + b) / 2, 0, 0.15, C(0xe8e0d0));
    for (const u of gate) box(f, 0.35, 1.5, 0.35, u, 0, 0.15, C(0xe8e0d0));
    box(f, 0.2, 1.2, v0, -f.w / 2 + 0.1, 0, v0 / 2, C(0xe8e0d0));
    box(f, 0.2, 1.2, v0, f.w / 2 - 0.1, 0, v0 / 2, C(0xe8e0d0));
    box(f, f.w - 0.4, 0.03, v0, 0, 0, v0 / 2, C(0x9e9384), false); // yard floor
    for (let r = 0; r < 3; r++) shape(f, new THREE.TorusGeometry(0.15 + r * 0.15, 0.015, 3, 24).rotateX(Math.PI / 2), DOOR.u, 0.04, v0 - 0.8, C(0xffffff)); // kolam
    for (const u of [x1 - 0.6, x1 - 1.4]) {
      shape(f, new THREE.CylinderGeometry(0.22, 0.17, 0.4, 10).translate(0, 0.2, 0), u, 0, 1.2, C(0xb5552f));
      shape(f, new THREE.IcosahedronGeometry(0.35, 0), u, 0.6, 1.2, C(0x3f7f35));
    }

    // ---- Shell: plinth floor, walls, flat roof with parapet and water tank ----
    box(f, x1 - x0, PLINTH, v1 - v0, 0, 0, (v0 + v1) / 2, FLOOR);
    box(f, uMid - x0 - T, 0.005, vMid - v0 - T, (x0 + uMid) / 2, PLINTH, (v0 + vMid) / 2, C(0xc9b89a), false); // hall floor (red-oxide-ish)
    box(f, x1 - uMid - T, 0.005, vMid - v0 - T, (uMid + x1) / 2, PLINTH, (v0 + vMid) / 2, C(0xdde3e6), false); // kitchen floor tiles
    box(f, 1.6, PLINTH, 0.6, DOOR.u, 0, v0 - 0.3, C(0xbdb5a5)); // step
    wallU(f, v0, x0, x1, wall, [[DOOR.u - DOOR.w / 2, DOOR.u + DOOR.w / 2]]);
    wallU(f, v1, x0, x1, wall);
    wallV(f, x0, v0, v1, wall);
    wallV(f, x1, v0, v1, wall);
    // Inner walls: hall | kitchen (wide opening), front rooms | bedroom (a door).
    wallV(f, uMid, v0, vMid, INSIDE, [[3.8, 5.6]]);
    wallU(f, vMid, x0, x1, INSIDE, [[-2.6, -1.6]]);
    // Interior faces (a cream coat just inside the outer walls).
    box(f, x1 - x0 - 2 * T, H, 0.02, 0, PLINTH, v1 - T / 2 - 0.01, INSIDE, false);
    box(f, 0.02, H, v1 - v0 - 2 * T, x0 + T / 2 + 0.01, PLINTH, (v0 + v1) / 2, INSIDE, false);
    box(f, 0.02, H, v1 - v0 - 2 * T, x1 - T / 2 - 0.01, PLINTH, (v0 + v1) / 2, INSIDE, false);
    box(f, 3.9, 1.2, 0.02, 3.2, PLINTH + 1, vMid - T / 2 - 0.01, KITCHEN_TILE, false); // kitchen splashback
    box(f, x1 - x0 + 0.3, 0.25, v1 - v0 + 0.3, 0, H + PLINTH, (v0 + v1) / 2, C(0xe8e0d0)); // roof
    for (const [w, d, u, v] of [[x1 - x0 + 0.3, 0.15, 0, v0 - 0.08], [x1 - x0 + 0.3, 0.15, 0, v1 + 0.08], [0.15, v1 - v0, x0 - 0.08, (v0 + v1) / 2], [0.15, v1 - v0, x1 + 0.08, (v0 + v1) / 2]] as const) box(f, w, 0.8, d, u, H + PLINTH + 0.25, v, wall, false);
    shape(f, new THREE.CylinderGeometry(0.6, 0.6, 1.2, 14).translate(0, 0.6, 0), 3.5, H + PLINTH + 0.25, 10.5, C(0x1c1c1c)); // water tank
    // Front door: a wooden leaf swung open against the wall, a name plate.
    box(f, 0.05, 2.1, 1, DOOR.u + DOOR.w / 2 + 0.05, PLINTH, v0 + 0.6, C(0x6b3e1e), false);
    box(f, 0.6, 0.2, 0.03, DOOR.u + 1.2, PLINTH + 1.7, v0 - 0.12, C(0xc9a24a), false);
    window(f, -0.2, v0, 1.6, 'u');
    window(f, 3.4, v0, 1.4, 'u');
    window(f, 0, v1, 2, 'u');
    window(f, x0, 10, 1.4, 'v');

    // ---- Hall: sofa, coffee table, rug, TV unit, shoe rack, fan, tube light, a calendar ----
    box(f, 0.8, 0.45, 2.2, x0 + 0.6, PLINTH, 4.9, C(0x8a3b2e)); // sofa seat
    box(f, 0.2, 0.85, 2.2, x0 + 0.3, PLINTH, 4.9, C(0x7a3226), false); // sofa back
    for (const s of [-1, 1]) box(f, 0.8, 0.6, 0.15, x0 + 0.6, PLINTH, 4.9 + s * 1.1, C(0x7a3226), false);
    box(f, 2.4, 0.01, 1.8, -2.4, PLINTH + 0.01, 4.9, C(0x2f5d8a), false); // rug
    box(f, 1.1, 0.42, 0.6, -2.6, PLINTH, 4.9, WOOD); // coffee table
    box(f, 0.45, 0.6, 1.8, uMid - 0.35, PLINTH, 6.6, WOOD); // TV unit (on the kitchen wall)
    box(f, 0.06, 0.65, 1.15, uMid - 0.3, PLINTH + 0.6, 6.6, C(0x111111), false); // TV
    box(f, 0.8, 0.5, 0.3, DOOR.u + 1.4, PLINTH, v0 + 0.35, WOOD); // shoe rack
    box(f, 0.04, 0.5, 0.35, x0 + 0.22, PLINTH + 1.6, 3.4, C(0xffffff), false); // calendar
    box(f, 0.04, 0.25, 0.3, x0 + 0.23, PLINTH + 1.75, 3.4, C(0xd84315), false);
    fan(f, -2.3, 5);
    tube(f, x0 + 0.25, 5, 'v');

    // ---- Kitchen: L-shaped granite counter, stove + cylinder, sink, fridge, steel dabbas ----
    const ct = 0.9;
    box(f, x1 - uMid - 0.6, ct, 0.6, (uMid + x1) / 2 + 0.2, PLINTH, vMid - 0.45, C(0xd9d2c3)); // back counter
    box(f, 0.6, ct, 3.4, x1 - 0.45, PLINTH, 4.9, C(0xd9d2c3)); // side counter
    box(f, x1 - uMid - 0.5, 0.04, 0.64, (uMid + x1) / 2 + 0.2, PLINTH + ct, vMid - 0.45, GRANITE, false);
    box(f, 0.64, 0.04, 3.4, x1 - 0.45, PLINTH + ct, 4.9, GRANITE, false);
    box(f, 0.7, 0.08, 0.4, 2.8, PLINTH + ct + 0.04, vMid - 0.45, C(0x3a3a3a), false); // gas stove
    for (const s of [-1, 1]) shape(f, new THREE.TorusGeometry(0.08, 0.015, 4, 12).rotateX(Math.PI / 2), 2.8 + s * 0.18, PLINTH + ct + 0.13, vMid - 0.45, C(0x111111));
    shape(f, new THREE.CylinderGeometry(0.13, 0.12, 0.22, 12).translate(0, 0.11, 0), 2.62, PLINTH + ct + 0.13, vMid - 0.45, STEEL); // pressure cooker
    shape(f, new THREE.CylinderGeometry(0.16, 0.16, 0.6, 12).translate(0, 0.3, 0), 2.8, PLINTH, vMid - 0.2, C(0xc62828)); // LPG cylinder
    box(f, 0.5, 0.15, 0.4, x1 - 0.45, PLINTH + ct - 0.1, 3.7, STEEL, false); // sink
    box(f, 0.03, 0.3, 0.03, x1 - 0.65, PLINTH + ct + 0.04, 3.7, STEEL, false); // tap
    box(f, 0.7, 1.75, 0.7, uMid + 0.55, PLINTH, v0 + 0.55, C(0xe9e9e9)); // fridge
    box(f, 2.6, 0.04, 0.3, 3.2, PLINTH + 1.9, vMid - 0.3, WOOD, false); // shelf
    for (let n = 0; n < 7; n++) shape(f, new THREE.CylinderGeometry(0.08, 0.08, 0.2, 10).translate(0, 0.1, 0), 2.1 + n * 0.35, PLINTH + 1.94, vMid - 0.3, STEEL);
    tube(f, 3.2, vMid - 0.25, 'u');

    // ---- Bedroom: bed with pillows, steel almirah, mirror table, fan, tube light ----
    box(f, 1.6, 0.45, 2.1, -3.6, PLINTH, 11.2, WOOD); // cot
    box(f, 1.55, 0.15, 2, -3.6, PLINTH + 0.45, 11.15, C(0xe8f0ff), false); // mattress
    box(f, 1.56, 0.03, 1.2, -3.6, PLINTH + 0.6, 10.75, C(0x5c6bc0), false); // bedsheet
    for (const s of [-1, 1]) box(f, 0.6, 0.12, 0.35, -3.6 + s * 0.4, PLINTH + 0.6, 12, C(0xffffff), false); // pillows
    box(f, 1.6, 0.9, 0.08, -3.6, PLINTH, 12.3, WOOD, false); // headboard
    box(f, 1, 1.9, 0.55, x1 - 0.7, PLINTH, 11.9, C(0x8f979c)); // steel almirah
    box(f, 0.02, 1.7, 0.02, x1 - 0.7, PLINTH + 0.1, 11.6, C(0x6d7478), false);
    box(f, 0.9, 0.75, 0.45, 2, PLINTH, 12.1, WOOD); // dressing table
    box(f, 0.6, 0.8, 0.04, 2, PLINTH + 0.75, 12.3, C(0xbfe0ea), false); // mirror
    fan(f, -0.5, 10);
    tube(f, 0, v1 - 0.25, 'u');

    // ---- Door lock: an invisible wall in the doorway while the house isn't yours ----
    const dp = f.at(DOOR.u, v0);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw);
    const lock = world.createCollider(RAPIER.ColliderDesc.cuboid(DOOR.w / 2, 1.2, 0.15).setTranslation(dp.x, 1.2 + PLINTH, dp.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));

    // ---- For sale: a board on the gate post ----
    let sign: THREE.Mesh | null = null;
    if (hm.price > 0) {
      const c = document.createElement('canvas');
      c.width = 256;
      c.height = 160;
      const g = c.getContext('2d')!;
      g.fillStyle = '#c62828';
      g.fillRect(0, 0, 256, 160);
      g.fillStyle = '#ffffff';
      g.fillRect(8, 8, 240, 144);
      g.fillStyle = '#c62828';
      g.textAlign = 'center';
      g.font = '800 34px system-ui, sans-serif';
      g.fillText('FOR SALE', 128, 46);
      g.font = '700 22px "Nirmala UI", "Latha", sans-serif';
      g.fillText('வீடு விற்பனைக்கு', 128, 82);
      g.font = '800 30px system-ui, sans-serif';
      g.fillStyle = '#1b5e20';
      g.fillText(`₹${hm.price.toLocaleString('en-IN')}`, 128, 128);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.56), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6, side: THREE.DoubleSide }));
      const sp = f.at(gate[1] + 0.6, -0.02, 1.55);
      sign.position.copy(sp);
      sign.rotation.y = f.yaw + Math.PI;
      scene.add(sign);
      signs.push(sign);
    }

    const bed = f.at(-3.6, 9.7, PLINTH);
    const sale = f.at(gate[1] + 0.6, -1);
    const s = sign;
    homes.push({
      name: hm.name, area: hm.area, price: hm.price, sale, bed,
      setOwned(owned: boolean) {
        lock.setEnabled(!owned);
        if (s) s.visible = !owned;
      },
    });
  });

  return { homes, setNight: k.build(scene, false) };
}
