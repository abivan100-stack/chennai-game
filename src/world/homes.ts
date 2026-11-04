import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { createKit, frame, type Frame } from './kit';
import { HOME_LOTS } from './layout';

/**
 * Standard Chennai homes you can walk into. The rented one is a small single-storey house; the ones
 * for sale are bigger independent houses: the same ground floor plus an upper floor (master
 * bedroom, a second room, a front balcony) up an outside staircase, and a car porch with its own
 * gate. All of them: a house behind a compound wall
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
  { name: 'House for sale', area: 'R.A. Puram', price: 30000, wall: 0xcfe3d0 },
  { name: 'House for sale', area: 'R.A. Puram', price: 40000, wall: 0xf2c9c1 },
  { name: 'House for sale', area: 'Alwarpet', price: 60000, wall: 0xd6e0f0 },
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
  const wallU = (f: Frame, v: number, u0: number, u1: number, colour: THREE.Color, gaps: [number, number][] = [], y0 = PLINTH) => {
    let a = u0;
    for (const [g0, g1] of [...gaps, [u1, u1] as [number, number]]) {
      if (g0 > a) box(f, g0 - a, H, T, (a + g0) / 2, y0, v, colour);
      if (g1 > g0) box(f, g1 - g0, H - 2.2, T, (g0 + g1) / 2, y0 + 2.2, v, colour, false);
      a = g1;
    }
  };
  /** A wall going inwards (v) at u, from v0 to v1, with gaps. */
  const wallV = (f: Frame, u: number, v0: number, v1: number, colour: THREE.Color, gaps: [number, number][] = [], y0 = PLINTH) => {
    let a = v0;
    for (const [g0, g1] of [...gaps, [v1, v1] as [number, number]]) {
      if (g0 > a) box(f, T, H, g0 - a, u, y0, (a + g0) / 2, colour);
      if (g1 > g0) box(f, T, H - 2.2, g1 - g0, u, y0 + 2.2, (g0 + g1) / 2, colour, false);
      a = g1;
    }
  };
  const fan = (f: Frame, u: number, v: number, y0 = PLINTH) => {
    box(f, 0.05, 0.4, 0.05, u, H + y0 - 0.45, v, C(0xffffff), false);
    for (let b = 0; b < 3; b++) shape(f, new THREE.BoxGeometry(0.9, 0.02, 0.12).translate(0.45, 0, 0), u, H + y0 - 0.5, v, C(0xf0ece4), (b / 3) * Math.PI * 2);
  };
  const tube = (f: Frame, u: number, v: number, along: 'u' | 'v', y0 = PLINTH) =>
    k.shape(f, new THREE.BoxGeometry(along === 'u' ? 1.2 : 0.06, 0.06, along === 'v' ? 1.2 : 0.06), u, y0 + 2.35, v, C(0xffffff), 0, k.bulbs);
  const window = (f: Frame, u: number, v: number, w: number, side: 'u' | 'v', y0 = PLINTH) => {
    // Glass with a white grill, both faces of the wall.
    const g = side === 'u' ? [w, 1.2, T + 0.04] : [T + 0.04, 1.2, w];
    box(f, g[0], g[1], g[2], u, y0 + 1, v, C(0x3d5a73), false);
    for (let x = -w / 2 + 0.15; x < w / 2; x += 0.2) {
      if (side === 'u') box(f, 0.03, 1.2, T + 0.08, u + x, y0 + 1, v, C(0xffffff), false);
      else box(f, T + 0.08, 1.2, 0.03, u, y0 + 1, v + x, C(0xffffff), false);
    }
    if (side === 'u') box(f, w + 0.3, 0.08, 0.5, u, y0 + 2.3, v - 0.25, C(0xd9d2c3), false); // sunshade
  };

  const signs: THREE.Mesh[] = [];
  HOME_LOTS().forEach((lot, i) => {
    const hm = HOMES[i];
    const F = frame(lot);
    const big = hm.price > 0;
    const du = big ? -2.5 : 0; // house shifted left on the big plots: porch + stairs on the right
    const f: Frame = { ...F, w: 11, at: (u: number, v: number, y = 0) => F.at(u + du, v, y) };
    const wall = C(hm.wall);
    const x0 = -5.5;
    const x1 = 5.5;
    const v0 = 2.5; // front wall
    const v1 = 12.5; // back wall
    const vMid = 7.5; // hall / kitchen | bedroom
    const uMid = 1; // hall | kitchen

    // ---- Yard: compound wall with a gate, kolam at the door, potted plants ----
    const gate: [number, number] = [DOOR.u + du - 0.9, DOOR.u + du + 0.9];
    const drive: [number, number] = [4.4, 8.4]; // the car gate on the big plots
    const COMPOUND = C(0xe8e0d0);
    const gaps = big ? [gate, drive] : [gate];
    let a0 = -F.w / 2;
    for (const [g0, g1] of [...gaps, [F.w / 2, F.w / 2]]) {
      if (g0 > a0) box(F, g0 - a0, 1.2, 0.2, (a0 + g0) / 2, 0, 0.15, COMPOUND);
      a0 = g1;
    }
    for (const u of [...gate, ...(big ? drive : [])]) box(F, 0.35, 1.5, 0.35, u, 0, 0.15, COMPOUND);
    const sideD = big ? F.d : v0;
    box(F, 0.2, 1.2, sideD, -F.w / 2 + 0.1, 0, sideD / 2, COMPOUND);
    box(F, 0.2, 1.2, sideD, F.w / 2 - 0.1, 0, sideD / 2, COMPOUND);
    if (big) box(F, F.w, 1.2, 0.2, 0, 0, F.d - 0.1, COMPOUND); // back wall
    box(F, F.w - 0.4, 0.03, big ? F.d - 0.4 : v0, 0, 0, (big ? F.d - 0.4 : v0) / 2, C(0x9e9384), false); // yard floor
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
    if (!big) {
      for (const [w, d, u, v] of [[x1 - x0 + 0.3, 0.15, 0, v0 - 0.08], [x1 - x0 + 0.3, 0.15, 0, v1 + 0.08], [0.15, v1 - v0, x0 - 0.08, (v0 + v1) / 2], [0.15, v1 - v0, x1 + 0.08, (v0 + v1) / 2]] as const) box(f, w, 0.8, d, u, H + PLINTH + 0.25, v, wall, false);
      shape(f, new THREE.CylinderGeometry(0.6, 0.6, 1.2, 14).translate(0, 0.6, 0), 3.5, H + PLINTH + 0.25, 10.5, C(0x1c1c1c)); // water tank
    }
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

    // ---- Big plots: upper floor up an outside staircase, front balcony, car porch ----
    const Y1 = H + PLINTH + 0.25; // upper floor level (top of the ground floor roof)
    const upDoor: [number, number] = [11.3, 12.3]; // side door from the stair landing (v)
    if (big) {
      // Stairs along the right wall, rising towards the back, a landing at the top, a rail.
      const STEPS = 17;
      const rise = Y1 / STEPS;
      const run = 0.5;
      const su = x1 + 0.75;
      for (let n = 0; n < STEPS; n++) box(f, 1.1, rise * (n + 1), run, su, 0, 2.9 + n * run + run / 2, C(0xcfc6b4));
      box(f, 1.1, Y1, 1.4, su, 0, 2.9 + STEPS * run + 0.7, C(0xcfc6b4));
      for (let n = 0; n <= STEPS; n += 2) box(f, 0.05, 0.9, 0.05, su + 0.52, rise * n + 0.1, 2.9 + n * run, C(0x3a3a3a), false);
      const railLen = Math.hypot(STEPS * run, Y1);
      shape(f, new THREE.BoxGeometry(0.06, 0.06, railLen).rotateX(-Math.atan2(Y1, STEPS * run)), su + 0.52, 1.0 + Y1 / 2, 2.9 + (STEPS * run) / 2, C(0x3a3a3a));
      // Upper floor: balcony strip at the front, two rooms behind it.
      const vb = 4.3; // balcony | rooms
      const UP = C(0xf6f1e6);
      wallU(f, vb, x0, x1, wall, [[-4.4, -3.3], [2.2, 3.3]], Y1);
      wallU(f, v1, x0, x1, wall, [], Y1);
      wallV(f, x0, vb, v1, wall, [], Y1);
      wallV(f, x1, vb, v1, wall, [upDoor], Y1);
      wallV(f, -0.5, vb, v1, UP, [[8, 9.1]], Y1);
      box(f, x1 - x0 + 0.3, 0.25, v1 - vb + 0.3, 0, Y1 + H, (vb + v1) / 2, C(0xe8e0d0)); // upper roof
      for (const [w, d, u, v] of [[x1 - x0 + 0.3, 0.15, 0, vb - 0.08], [x1 - x0 + 0.3, 0.15, 0, v1 + 0.08], [0.15, v1 - vb, x0 - 0.08, (vb + v1) / 2], [0.15, v1 - vb, x1 + 0.08, (vb + v1) / 2]] as const) box(f, w, 0.7, d, u, Y1 + H + 0.25, v, wall, false);
      shape(f, new THREE.CylinderGeometry(0.6, 0.6, 1.2, 14).translate(0, 0.6, 0), 3.5, Y1 + H + 0.25, 10.5, C(0x1c1c1c)); // water tank
      box(f, x1 - x0 - 0.4, 0.01, v1 - vb - 0.4, 0, Y1 + 0.005, (vb + v1) / 2, C(0xd7c7a8), false); // floor tiles
      // Balcony railing (front and sides), plants, two plastic chairs.
      box(f, x1 - x0, 1.0, 0.12, 0, Y1, v0 - 0.02, wall);
      for (const u of [x0 + 0.06, x1 - 0.06]) box(f, 0.12, 1.0, vb - v0, u, Y1, (v0 + vb) / 2, wall);
      for (const u of [x0 + 0.6, x1 - 0.6]) {
        shape(f, new THREE.CylinderGeometry(0.22, 0.17, 0.4, 10).translate(0, 0.2, 0), u, Y1, v0 + 0.5, C(0xb5552f));
        shape(f, new THREE.IcosahedronGeometry(0.35, 0), u, Y1 + 0.6, v0 + 0.5, C(0x3f7f35));
      }
      for (const u of [-1.2, 0.2]) {
        box(f, 0.5, 0.42, 0.5, u, Y1, 3.4, C(0x2e7d32), false);
        box(f, 0.5, 0.5, 0.06, u, Y1 + 0.42, 3.62, C(0x2e7d32), false);
      }
      // Master bedroom (left): double cot, almirah, dressing table, fan, light, windows.
      box(f, 2, 0.45, 2.2, -3.2, Y1, 11.1, WOOD);
      box(f, 1.95, 0.15, 2.1, -3.2, Y1 + 0.45, 11.05, C(0xfff3e0), false);
      box(f, 1.96, 0.03, 1.2, -3.2, Y1 + 0.6, 10.6, C(0x8e244d), false);
      for (const s2 of [-1, 1]) box(f, 0.7, 0.12, 0.35, -3.2 + s2 * 0.5, Y1 + 0.6, 11.9, C(0xffffff), false);
      box(f, 2, 1.0, 0.08, -3.2, Y1, 12.3, WOOD, false);
      box(f, 1, 1.9, 0.55, x0 + 0.6, Y1, 6.0, C(0x8f979c));
      box(f, 0.9, 0.75, 0.45, -1.3, Y1, 12.1, WOOD);
      box(f, 0.6, 0.8, 0.04, -1.3, Y1 + 0.75, 12.3, C(0xbfe0ea), false);
      fan(f, -3, 8.5, Y1);
      tube(f, -3, v1 - 0.25, 'u', Y1);
      window(f, -3, v1, 1.6, 'u', Y1);
      window(f, x0, 9, 1.4, 'v', Y1);
      // Second room (right): a study desk + chair, a bookshelf, a single cot.
      box(f, 1.4, 0.75, 0.6, 2.6, Y1, 12.0, WOOD);
      box(f, 0.45, 0.45, 0.45, 2.6, Y1, 11.2, C(0x37474f));
      box(f, 0.5, 0.06, 0.4, 2.6, Y1 + 0.75, 11.9, C(0x263238), false); // laptop
      box(f, 1.2, 1.8, 0.35, 0.4, Y1, 12.2, WOOD);
      for (let n = 0; n < 8; n++) box(f, 0.1, 0.28, 0.25, -0.05 + n * 0.13, Y1 + 0.95 + (n % 2) * 0.45, 12.15, [C(0xc62828), C(0x1565c0), C(0x2e7d32), C(0xf9a825)][n % 4], false);
      box(f, 1.0, 0.45, 2.0, x1 - 0.7, Y1, 6.4, WOOD);
      box(f, 0.95, 0.12, 1.9, x1 - 0.7, Y1 + 0.45, 6.4, C(0xe3f2fd), false);
      fan(f, 2.5, 8.5, Y1);
      tube(f, 2.5, v1 - 0.25, 'u', Y1);
      window(f, 2.5, v1, 1.4, 'u', Y1);
      // Car porch on the right: paved, a slab on two pillars, a light.
      const pu0 = drive[0] - du;
      const pu1 = drive[1] - du;
      box(F, drive[1] - drive[0] + 0.6, 0.04, F.d - 4, (drive[0] + drive[1]) / 2, 0, 2 + (F.d - 4) / 2, C(0x8d8478), false);
      for (const v of [2.4, 9.5]) box(f, 0.3, 2.9, 0.3, pu1 + 0.1, 0, v, wall);
      box(f, pu1 - pu0 + 0.5, 0.18, 8, (pu0 + pu1) / 2 + 0.35, 2.9, 6, C(0xe8e0d0)); // starts past the stairs (headroom)
      k.shape(f, new THREE.BoxGeometry(0.5, 0.05, 0.5), (pu0 + pu1) / 2 + 0.35, 2.85, 6, C(0xffffff), 0, k.bulbs);
      k.tree(F, -F.w / 2 + 1.2, F.d - 1.6, 0.9); // a backyard tree
    }

    // ---- Door lock: invisible walls in the doorways while the house isn't yours ----
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), f.yaw);
    const rot = { x: q.x, y: q.y, z: q.z, w: q.w };
    const dp = f.at(DOOR.u, v0);
    const locks = [world.createCollider(RAPIER.ColliderDesc.cuboid(DOOR.w / 2, 1.2, 0.15).setTranslation(dp.x, 1.2 + PLINTH, dp.z).setRotation(rot))];
    if (big) {
      const up = f.at(x1, (upDoor[0] + upDoor[1]) / 2);
      locks.push(world.createCollider(RAPIER.ColliderDesc.cuboid(0.15, 1.2, (upDoor[1] - upDoor[0]) / 2).setTranslation(up.x, Y1 + 1.2, up.z).setRotation(rot)));
    }

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
      const sp = F.at(gate[1] + 0.6, -0.02, 1.55);
      sign.position.copy(sp);
      sign.rotation.y = F.yaw + Math.PI;
      scene.add(sign);
      signs.push(sign);
    }

    const bed = big ? f.at(-3.2, 9.6, Y1) : f.at(-3.6, 9.7, PLINTH);
    const sale = F.at(gate[1] + 0.6, -1);
    const s = sign;
    homes.push({
      name: hm.name, area: hm.area, price: hm.price, sale, bed,
      setOwned(owned: boolean) {
        for (const l of locks) l.setEnabled(!owned);
        if (s) s.visible = !owned;
      },
    });
  });

  return { homes, setNight: k.build(scene, false) };
}
