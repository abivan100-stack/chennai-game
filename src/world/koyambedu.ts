import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createKit, frame, type Frame, type SignDef } from './kit';
import { KOYAMBEDU } from './layout';

/**
 * Koyambedu (north-west, on Kodambakkam High Road): the CMBT mofussil bus terminus (terminal
 * building you walk through, four covered platforms, out-of-town buses parked nose-in) and the
 * wholesale market (long open sheds piled with vegetables, fruit, flowers and sacks, lorries
 * unloading, handcarts; busiest before dawn). Parked buses and lorries are simple merged
 * shapes, not traffic vehicles: the whole place is one kit (3 draw calls).
 */

const SIGNS: SignDef[] = [
  ['புறநகர் பேருந்து நிலையம்', 'CMBT · KOYAMBEDU', '#0d3b66', '#ffffff'],
  ['கோயம்பேடு மார்க்கெட்', 'KOYAMBEDU WHOLESALE MARKET', '#1b5e20', '#ffeb3b'],
  ['நடைமேடை 1-2', 'PLATFORM 1-2 · MADURAI · TRICHY', '#f9a825', '#1a1a1a'],
  ['நடைமேடை 3-4', 'PLATFORM 3-4 · COIMBATORE · SALEM', '#f9a825', '#1a1a1a'],
  ['நடைமேடை 5-6', 'PLATFORM 5-6 · BENGALURU · VELLORE', '#f9a825', '#1a1a1a'],
  ['நடைமேடை 7-8', 'PLATFORM 7-8 · PONDY · CHIDAMBARAM', '#f9a825', '#1a1a1a'],
  ['காய்கறி', 'VEGETABLES', '#2e7d32', '#ffffff'],
  ['பழங்கள்', 'FRUITS', '#e65100', '#ffffff'],
  ['பூக்கள்', 'FLOWERS', '#ad1457', '#ffffff'],
];

/** Game hours the market is in full swing (workers, buyers, lorries). */
export const MARKET_HOURS: [number, number] = [3, 11];

const C = (hex: number) => new THREE.Color(hex);
const PAVING = C(0xc9c2b5);
const CONCRETE = C(0xb8b2a6);
const ROOF = C(0x8d99a6);
const PILLAR = C(0xe9e4da);
/** Out-of-town bus liveries: [body, band]. */
const LIVERY: [number, number][] = [[0xf1f1f1, 0x1565c0], [0xc4231f, 0xf0b73c], [0x2e7d32, 0xf5f5f5], [0xf1f1f1, 0xc62828], [0x283593, 0xf5f5f5]];
/**
 * What a stall sells: colour, item radius, item shape (scale x, y, z of a low-poly ball: long =
 * brinjal / carrot / banana), and an accent colour for a few on top (stalks, leaves).
 */
const PRODUCE: { c: number; r: number; s: [number, number, number]; accent?: number }[] = [
  { c: 0xd32f2f, r: 0.09, s: [1, 0.9, 1], accent: 0x2e7d32 }, // tomatoes
  { c: 0x8e3a7a, r: 0.09, s: [1, 0.85, 1] }, // small onions
  { c: 0x9c6b3c, r: 0.1, s: [1.2, 0.8, 1] }, // potatoes
  { c: 0x6d4c2f, r: 0.15, s: [1, 1.1, 1], accent: 0x8bc34a }, // coconuts
  { c: 0xa5d16a, r: 0.17, s: [1, 0.85, 1] }, // cabbages
  { c: 0xf2c94c, r: 0.06, s: [3.2, 0.9, 1] }, // bananas
  { c: 0xef6c00, r: 0.05, s: [1, 1, 3.4] }, // carrots
  { c: 0x5e2a6e, r: 0.07, s: [1, 1, 2.6], accent: 0x2e7d32 }, // brinjal
  { c: 0xff8f00, r: 0.07, s: [1, 0.8, 1], accent: 0xffd54f }, // marigolds
  { c: 0xe6ee9c, r: 0.06, s: [1, 1, 1.2] }, // lemons
];
const WOOD = 0x8d6748;
const SACK = 0xcdb88f;
const STALL_STEP = 2.6; // m between stalls along an aisle
const TILT = 0.24; // display trays lean towards the aisle
const ball = new THREE.IcosahedronGeometry(1, 0);

export function createKoyambedu(scene: THREE.Scene, world: RAPIER.World) {
  const k = createKit(world, SIGNS);
  const { box, board, shape, tree } = k;

  /** A parked bus (nose along +v by default, or -v when flip): body, window band, stripe, wheels. */
  const bus = (f: Frame, u: number, v: number, livery: [number, number], flip = false) => {
    const s = flip ? -1 : 1;
    box(f, 2.5, 2.3, 10, u, 0.45, v, C(livery[0]));
    box(f, 2.54, 0.85, 9.2, u, 1.75, v - 0.2 * s, C(0x1d2730), false);
    box(f, 2.56, 0.25, 9.8, u, 1.3, v, C(livery[1]), false);
    box(f, 2.3, 1.0, 0.06, u, 1.7, v + 5.02 * s, C(0x1d2730), false); // windscreen
    box(f, 1.6, 0.3, 0.06, u, 2.6, v + 5.02 * s, C(0x111111), false); // route board
    for (const dv of [-3.2, 3.2]) for (const du of [-1.1, 1.1]) shape(f, new THREE.CylinderGeometry(0.5, 0.5, 0.3, 12).rotateZ(Math.PI / 2), u + du, 0.5, v + dv, C(0x161616));
  };
  const lorry = (f: Frame, u: number, v: number, c: number) => {
    box(f, 2.4, 2.2, 1.8, u, 0.5, v + 3, C(0x2c7cc4));
    box(f, 2.45, 1.2, 5, u, 1.2, v - 0.6, C(c));
    box(f, 2.3, 0.6, 4.8, u, 2.4, v - 0.6, C(0x8f8a64), false); // load under a tarp
    for (const dv of [2.8, -1.8, -2.8]) for (const du of [-1.0, 1.0]) shape(f, new THREE.CylinderGeometry(0.48, 0.48, 0.3, 12).rotateZ(Math.PI / 2), u + du, 0.48, v + dv, C(0x161616));
  };
  /** A long open shed: pillars and a pitched roof over an aisle along u. */
  const shed = (f: Frame, v: number, len: number, wide: number, h: number) => {
    for (let u = -len / 2; u <= len / 2 + 0.01; u += 8) for (const dv of [-wide / 2, wide / 2]) box(f, 0.35, h, 0.35, u, 0, v + dv, PILLAR);
    shape(f, new THREE.CylinderGeometry(1, 1, len + 1, 3).rotateZ(Math.PI / 2).rotateX(Math.PI / 6).scale(1, 2 / 1.5, (wide + 1.5) / Math.sqrt(3)).translate(0, 2 / 3, 0), 0, h, v, ROOF);
    k.solid(f, len + 1, 0.3, wide + 1.5, 0, h, v); // rain stops under it
    for (let u = -len / 2 + 4; u < len / 2; u += 8) k.shape(f, new THREE.BoxGeometry(0.6, 0.12, 0.6), u, h - 0.2, v, C(0xfff2c0), 0, k.bulbs);
  };

  // ---------------- CMBT bus terminus ----------------
  {
    const f = frame(KOYAMBEDU.cmbt());
    box(f, f.w - 1, 0.02, f.d - 1, 0, 0, f.d / 2, CONCRETE, false);
    box(f, f.w - 6, 0.03, 10, 0, 0.02, 5.5, PAVING, false);
    // Terminal building: two wings with a walk-through entrance and a long canopy between them.
    for (const s of [-1, 1]) {
      box(f, 24, 8, 11, s * 17, 0, 16.5, C(0xece5d6));
      box(f, 22, 2.2, 0.1, s * 17, 3, 10.95, C(0x5d7c96), false); // glass band
      box(f, 22, 0.3, 1.6, s * 17, 2.6, 10.2, C(0x0d3b66), false); // sunshade
    }
    box(f, 10.5, 0.5, 11, 0, 5.5, 16.5, C(0x0d3b66), false);
    box(f, 60, 0.6, 1.2, 0, 8, 11.3, C(0x0d3b66), false);
    board(f, 0, 0, 8.6, 11.0, 26, 3);
    // Ticket counters and benches inside the entrance passage.
    for (const u of [-3.6, 3.6]) box(f, 1.2, 1.1, 5, u, 0, 16.5, C(0x795548));
    // Four covered platforms (rows along u) with buses parked nose-in on the south side of each.
    const rows = [32, 46, 60, 74];
    rows.forEach((v, r) => {
      box(f, 64, 0.25, 3.2, 0, 0, v, C(0xd6cfc0));
      for (let u = -30; u <= 30.01; u += 10) box(f, 0.35, 4.6, 0.35, u, 0.25, v, PILLAR);
      box(f, 66, 0.35, 7, 0, 4.85, v, ROOF, false);
      k.solid(f, 66, 0.35, 7, 0, 4.85, v);
      for (let u = -26; u < 30; u += 13) k.shape(f, new THREE.BoxGeometry(0.8, 0.12, 0.5), u, 4.75, v, C(0xfff2c0), 0, k.bulbs);
      board(f, 2 + r, 0, 3.2, v - 1.7, 9, 1.0);
      for (let u = -24; u <= 24; u += 12) if ((u + r * 12) % 36 !== 0) bus(f, u, v - 7.6, LIVERY[(r * 3 + u / 12 + 10) % LIVERY.length]); // nose in to the platform
      for (let u = -22; u <= 22; u += 11) box(f, 1.8, 0.45, 0.5, u, 0.25, v + 0.9, C(0x546e7a)); // benches
    });
    // Compound wall with the entrance gap on the road side.
    const side = (f.w - 16) / 2;
    for (const s of [-1, 1]) box(f, side, 1.4, 0.3, s * (8 + side / 2), 0, 0.15, C(0xd8d0c0));
    box(f, 0.3, 1.4, f.d, -f.w / 2 + 0.15, 0, f.d / 2, C(0xd8d0c0));
    box(f, 0.3, 1.4, f.d, f.w / 2 - 0.15, 0, f.d / 2, C(0xd8d0c0));
    box(f, f.w, 1.4, 0.3, 0, 0, f.d - 0.15, C(0xd8d0c0));
    for (const u of [-34, 34]) tree(f, u, 4, 0.9);
  }

  /** Produce items scattered over a w x d patch (local, y up from 0), `layers` deep, shrinking upwards: one merged geometry. */
  const pile = (p: (typeof PRODUCE)[number], w: number, d: number, layers: number, count: number) => {
    const parts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < count; i++) {
      const L = Math.floor(rnd() * layers);
      const shrink = 1 - L * 0.3;
      const g = ball.clone().scale(p.r * p.s[0], p.r * p.s[1], p.r * p.s[2]).rotateY(rnd() * Math.PI);
      parts.push(g.translate((rnd() - 0.5) * w * shrink, p.r * (0.8 + L * 1.5), (rnd() - 0.5) * d * shrink));
    }
    return mergeGeometries(parts);
  };
  /**
   * One market stall at (u, v): a raised platform, a wooden tray leaning towards the aisle
   * (toAisle = +1 / -1 along v) heaped with one kind of produce, baskets and sacks in front.
   */
  const stall = (f: Frame, u: number, v: number, toAisle: number) => {
    const p = PRODUCE[Math.floor(rnd() * PRODUCE.length)];
    box(f, 2.4, 0.3, 2.1, u, 0, v, C(0xa39e93));
    for (const du of [-1, 1]) for (const dz of [-0.55, 0.55]) box(f, 0.07, 0.45, 0.07, u + du, 0.3, v + dz, C(WOOD), false);
    const tilt = TILT * toAisle;
    shape(f, new THREE.BoxGeometry(2.2, 0.06, 1.4).rotateX(tilt), u, 0.78, v, C(WOOD));
    shape(f, new THREE.BoxGeometry(2.2, 0.14, 0.05).translate(0, 0.07, 0.7 * toAisle).rotateX(tilt), u, 0.78, v, C(0x6d4c38)); // front lip
    // The heap: a low mound in the produce colour, individual items on top of it.
    shape(f, new THREE.SphereGeometry(1, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.95, 0.16 + p.r, 0.55).rotateX(tilt), u, 0.8, v, C(p.c));
    shape(f, pile(p, 1.8, 1.0, 3, p.r > 0.12 ? 7 : 12).rotateX(tilt), u, 0.82 + p.r * 0.6, v, C(p.c));
    if (p.accent) shape(f, pile({ ...p, r: p.r * 0.45 }, 1.6, 0.9, 1, 4).rotateX(tilt), u, 0.9 + p.r * 1.6, v, C(p.accent));
    // In front: a wicker basket or two of the same, sometimes a sack.
    const front = v + toAisle * 1.35;
    const baskets = 1 + Math.floor(rnd() * 2);
    for (let b = 0; b < baskets; b++) {
      const bu = u - 0.6 + b * 1.1;
      shape(f, new THREE.CylinderGeometry(0.3, 0.22, 0.32, 6, 1, true), bu, 0.16, front, C(0xb08850));
      shape(f, new THREE.CircleGeometry(0.28, 6).rotateX(-Math.PI / 2), bu, 0.3, front, C(p.c));
      shape(f, pile(p, 0.35, 0.35, 2, 3), bu, 0.3, front, C(p.c));
    }
    if (rnd() < 0.45) shape(f, new THREE.SphereGeometry(0.3, 5, 3).scale(1, 1.35, 0.85), u + 0.85, 0.4, front + toAisle * 0.1, C(SACK));
  };

  // ---------------- Wholesale market ----------------
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  KOYAMBEDU.market().forEach((lot, li) => {
    const f = frame(lot);
    box(f, f.w - 1, 0.02, f.d - 1, 0, 0, f.d / 2, CONCRETE, false);
    // Gate arch (west block only) and three long sheds, each piled with produce on both sides of its aisle.
    if (li === 0) {
      for (const s of [-1, 1]) box(f, 1.2, 6, 1.2, s * 6, 0, 0.8, C(0x1b5e20));
      box(f, 13.2, 1.2, 1.4, 0, 6, 0.8, C(0x1b5e20), false);
      board(f, 1, 0, 6.1, 0.05, 12.4, 1.4);
    }
    [18, 40, 62].forEach((v, si) => {
      const len = f.w - 10;
      shed(f, v, len, 12, 5.5);
      board(f, 6 + ((si + li) % 3), -len / 2 + 6, 3.6, v - 6.4, 7, 0.9);
      for (let u = -len / 2 + 2; u < len / 2 - 1; u += STALL_STEP) for (const dv of [-3.6, 3.6]) stall(f, u, v + dv, dv < 0 ? 1 : -1);
    });
    // Lorries backed up to the sheds, handcarts in the aisles.
    lorry(f, -f.w / 2 + 8, 82, 0xd9541e);
    lorry(f, f.w / 2 - 8, 80, 0x2e7d32);
    for (const [u, v] of [[-8, 29], [10, 51], [-14, 51], [6, 29]] as const) {
      box(f, 1.2, 0.12, 2.2, u, 0.7, v, C(0x8d6e63), false);
      for (const s of [-1, 1]) shape(f, new THREE.CylinderGeometry(0.35, 0.35, 0.08, 10).rotateZ(Math.PI / 2), u + s * 0.65, 0.35, v, C(0x333333));
    }
    // Wall with a gate gap on the road.
    const side = (f.w - 14) / 2;
    for (const s of [-1, 1]) box(f, side, 1.6, 0.3, s * (7 + side / 2), 0, 0.15, C(0xd8d0c0));
    box(f, f.w, 1.6, 0.3, 0, 0, f.d - 0.15, C(0xd8d0c0));
    box(f, 0.3, 1.6, f.d, li === 0 ? f.w / 2 - 0.15 : -f.w / 2 + 0.15, 0, f.d / 2, C(0xd8d0c0)); // outer side (u+ = west here); the Usman Road side stays open
  });

  return { setNight: k.build(scene) };
}
