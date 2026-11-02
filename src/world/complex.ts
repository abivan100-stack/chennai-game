import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { createKit, frame, type Frame, type SignDef } from './kit';
import { COMPLEX_LOTS } from './layout';

/**
 * Grand Coast Residences, Perungudi: a big gated apartment community of the kind OMR is full of
 * (an invented name, no real developer's branding). Phase 1 by the Beach Road (four sea-view
 * towers, clubhouse, pool) and Phase 2 on Taramani Road (three towers). 15-19 floor painted
 * towers with a balcony stack on the front, window bands that light up at night, a crown on
 * top; landscaped grounds, kids' play area, boom-barrier gates. 3 draw calls (kit.ts).
 */

const SIGNS: SignDef[] = [
  ['கிராண்ட் கோஸ்ட் ரெசிடென்சஸ்', 'GRAND COAST RESIDENCES · PHASE 1', '#1b2a41', '#e8c77a'],
  ['கிராண்ட் கோஸ்ட் ரெசிடென்சஸ்', 'GRAND COAST RESIDENCES · PHASE 2', '#1b2a41', '#e8c77a'],
  ['கிளப் ஹவுஸ்', 'CLUBHOUSE · POOL · GYM', '#ffffff', '#1b2a41'],
];
const FLOOR_H = 3.1;
const C = (hex: number) => new THREE.Color(hex);
const PAINT = [C(0xf4efe6), C(0xe9e1d3), C(0xf2ece4)];
const ACCENT = C(0x8a6a4a); // wood-tone accent panels
const GREY = C(0x6b7075);
const WINDOW = C(0x39424a); // dark by day; the bulb material makes them glow at night
const RAIL = C(0xa9cfe0);
const LAWN = C(0x5d9440);
const PAVING = C(0xd9cfbd);
const POOL = C(0x3fb6d9);

export function createComplex(scene: THREE.Scene, world: RAPIER.World) {
  const k = createKit(world, SIGNS);
  const { box, board, tree, shape } = k;

  /** One residential tower centred at (u, v) in the lot frame, front facing the road. */
  const tower = (f: Frame, u: number, v: number, floors: number, paint: THREE.Color) => {
    const W = 15;
    const D = 14;
    const h = floors * FLOOR_H + 1.5;
    box(f, W, h, D, u, 0, v, paint);
    // Window bands on all four faces, every floor; balconies stacked on the front.
    for (let fl = 1; fl < floors; fl++) {
      const y = 1.5 + fl * FLOOR_H - 2.2;
      for (const [du, dv, bw, bd] of [[0, -D / 2 - 0.03, W - 2, 0.06], [0, D / 2 + 0.03, W - 2, 0.06], [-W / 2 - 0.03, 0, 0.06, D - 2], [W / 2 + 0.03, 0, 0.06, D - 2]] as const) {
        // Some flats have the lights on at night (those bands go in the glowing bulb mesh).
        const lit = (fl * 7 + Math.round(u + v) + Math.round(du + dv)) % 3 === 0;
        k.shape(f, new THREE.BoxGeometry(bw, 1.4, bd).translate(0, 0.7, 0), u + du, y, v + dv, lit ? C(0x4a4a3a) : WINDOW, 0, lit ? k.bulbs : k.geo);
      }
      for (const s of [-1, 1]) {
        box(f, 4.6, 0.18, 1.6, u + s * 3.4, y - 0.95, v - D / 2 - 0.8, paint, false);
        box(f, 4.6, 0.9, 0.06, u + s * 3.4, y - 0.77, v - D / 2 - 1.57, RAIL, false);
      }
    }
    // Wood accent strip up the front, a crown frame, a water tank.
    box(f, 1.2, h, 0.3, u, 0, v - D / 2 - 0.15, ACCENT, false);
    box(f, W + 0.6, 2.2, 0.6, u, h, v - D / 2 + 0.3, paint, false);
    box(f, W + 0.6, 2.2, 0.6, u, h, v + D / 2 - 0.3, paint, false);
    box(f, 4, 2.4, 4, u + 3, h, v + 2, GREY, false);
  };

  /** Gate: arch with the name, security cabin, boom barrier; compound wall round the lot. */
  const gate = (f: Frame, sign: number) => {
    for (const s of [-1, 1]) box(f, 1.2, 4.6, 1.2, s * 5, 0, 0.8, C(0x1b2a41));
    box(f, 11.2, 0.9, 1.4, 0, 4.6, 0.8, C(0x1b2a41), false);
    board(f, sign, 0, 4.7, 0.05, 10.5, 1.2);
    box(f, 2.6, 2.7, 2.6, 7.6, 0, 3, C(0xe0e0e0));
    box(f, 7, 0.12, 0.12, 1.8, 1, 1.8, C(0xd32f2f), false);
    const side = (f.w - 10) / 2;
    for (const s of [-1, 1]) box(f, side, 1.8, 0.3, s * (5 + side / 2), 0, 0.2, C(0xe9e1d3));
    box(f, 0.3, 1.8, f.d, -f.w / 2 + 0.15, 0, f.d / 2, C(0xe9e1d3));
    box(f, 0.3, 1.8, f.d, f.w / 2 - 0.15, 0, f.d / 2, C(0xe9e1d3));
    box(f, f.w, 1.8, 0.3, 0, 0, f.d - 0.15, C(0xe9e1d3));
  };

  const [p1, p2] = COMPLEX_LOTS();

  // ---- Phase 1: four sea-view towers, clubhouse and pool ----
  {
    const f = frame(p1);
    const { w, d } = f;
    box(f, w - 1, 0.03, d - 1, 0, 0, d / 2, LAWN, false);
    box(f, 6, 0.02, d - 2, 0, 0.035, d / 2, PAVING, false); // drive
    box(f, w - 4, 0.02, 4, 0, 0.035, 16, PAVING, false);
    const us = [-38, -13, 13, 38];
    us.forEach((u, i) => tower(f, u, 27, 16 + (i % 2) * 3, PAINT[i % PAINT.length]));
    // Clubhouse with a glass front, pool with a deck and loungers.
    box(f, 14, 6.5, 8, -26, 0, 8, C(0xf8f6f0));
    box(f, 13, 4.5, 0.08, -26, 0.5, 3.96, RAIL, false);
    box(f, 15, 0.4, 9, -26, 6.5, 8, ACCENT, false);
    board(f, 2, -26, 5, 3.9, 9, 1.1);
    box(f, 16, 0.12, 9, 25, 0, 8, PAVING, false);
    box(f, 12, 0.05, 5.5, 25, 0.1, 8, POOL, false);
    k.solid(f, 12, 1, 5.5, 25, 0, 8);
    for (let i = 0; i < 4; i++) box(f, 0.8, 0.35, 1.9, 19.5 + i * 3.6, 0.12, 11.8, C(0xffffff), false);
    for (let i = 0; i < 2; i++) shape(f, new THREE.ConeGeometry(1.4, 0.6, 8), 20 + i * 9, 2.4, 3.6, C(0xf4a261));
    // Kids' play area and trees.
    box(f, 6, 0.05, 6, 0, 0.04, 36, C(0xe76f51), false);
    box(f, 0.8, 2, 0.8, -1.5, 0, 36, C(0xf4a261));
    box(f, 0.6, 0.06, 3, 0.5, 1, 37, C(0x2a9d8f), false);
    for (const u of [-50, -25, 0, 25, 50]) tree(f, u, d - 3, 1);
    for (const u of [-48, 48]) tree(f, u, 10, 0.9);
    gate(f, 0);
  }

  // ---- Phase 2: three towers in a row going back from Taramani Road ----
  {
    const f = frame(p2);
    const { d } = f;
    box(f, f.w - 1, 0.03, d - 1, 0, 0, d / 2, LAWN, false);
    box(f, 5, 0.02, d - 2, -9, 0.035, d / 2, PAVING, false);
    [24, 56, 88].forEach((v, i) => tower(f, 3, v, 15 + i * 2, PAINT[(i + 1) % PAINT.length]));
    for (const v of [10, 40, 72]) tree(f, -11, v, 0.9);
    gate(f, 1);
  }

  return { setNight: k.build(scene) };
}
