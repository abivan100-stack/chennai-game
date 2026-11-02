import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Eatery } from './eateries';
import { PLACE_MENUS } from './food';
import { createKit, frame, type Frame, type SignDef } from './kit';
import { CAFE_LOTS } from './layout';
import { CAFE_SPOTS as SPOTS, type Look } from './cafeSpots';

/**
 * Aesthetic cafes and boutiques, the kind that line TTK Road, Besant Nagar and Adyar: small
 * one/two-storey places set back behind a wooden deck with outdoor tables, potted plants and
 * string lights. Four looks: minimal (white + wood slats, big glass front), pastel (striped
 * awning), heritage (Chettinad red oxide with arches and a tiled roof), garden (plant wall,
 * pergola). Cafes are eateries (E to order); boutiques are just to look at. 3 draw calls.
 */


const C = (hex: number) => new THREE.Color(hex);
const DECK = C(0xb08355);
const WOOD = C(0x7a5534);
const GLASS = C(0xa9cfe0);
const GLOW = C(0x6b5a40); // interior panel: dark-ish by day, warm glow at night (bulb mesh)
const POT = C(0xb5552f);
const PLANT = C(0x3f7f35);
const IRON = C(0x2b2b2b);
const BULBS = [C(0xfff1c1), C(0xffd27a), C(0xffe9a8)];
const LOOK_WALL: Record<Look, THREE.Color[]> = {
  minimal: [C(0xf7f5f0), C(0xeeeae2)],
  pastel: [C(0xbfe3e0), C(0xf6d6d6), C(0xd8e2f3), C(0xf9e4b7)],
  heritage: [C(0xa8452c), C(0xb5552f)],
  garden: [C(0x5a7d5a), C(0x6b8f71)],
};

export function createCafes(scene: THREE.Scene, world: RAPIER.World) {
  const signs: SignDef[] = SPOTS.map((s) => [s.ta, s.name.toUpperCase(), s.bg, s.fg]);
  const k = createKit(world, signs);
  const { box, board, shape } = k;
  const eateries: Eatery[] = [];

  const potted = (f: Frame, u: number, v: number, s = 1) => {
    shape(f, new THREE.CylinderGeometry(0.32 * s, 0.24 * s, 0.6 * s, 10).translate(0, 0.3 * s, 0), u, 0.15, v, POT);
    shape(f, new THREE.IcosahedronGeometry(0.55 * s, 0), u, 0.15 + 0.9 * s, v, PLANT);
  };
  const table = (f: Frame, u: number, v: number, umbrella: THREE.Color | null) => {
    shape(f, new THREE.CylinderGeometry(0.45, 0.45, 0.05, 14), u, 0.9, v, C(0xf4f1ea));
    shape(f, new THREE.CylinderGeometry(0.05, 0.08, 0.75, 6).translate(0, 0.375, 0), u, 0.15, v, IRON);
    for (const s of [-1, 1]) {
      box(f, 0.45, 0.06, 0.45, u + s * 0.75, 0.6, v, WOOD, false);
      box(f, 0.45, 0.5, 0.06, u + s * 0.75, 0.66, v + 0.22, WOOD, false);
    }
    k.solid(f, 0.9, 0.9, 0.9, u, 0, v);
    if (umbrella) {
      shape(f, new THREE.CylinderGeometry(0.03, 0.03, 2.2, 6).translate(0, 1.1, 0), u, 0.95, v, IRON);
      shape(f, new THREE.ConeGeometry(1.4, 0.6, 10), u, 3.1, v, umbrella);
    }
  };

  CAFE_LOTS().forEach((lot, i) => {
    const spot = SPOTS[i % SPOTS.length];
    const f = frame(lot);
    const { w, d } = f;
    const wall = LOOK_WALL[spot.look][i % LOOK_WALL[spot.look].length];
    const deckD = 4.6;
    const bd = d - deckD - 0.5; // building depth
    const bv = deckD + bd / 2;
    const two = spot.look !== 'heritage' && i % 2 === 0;
    const h = two ? 7.4 : 4.4;

    // Deck, a low planter edge on the road side, tables.
    box(f, w - 0.4, 0.15, deckD, 0, 0, deckD / 2, DECK, false);
    for (let x = -w / 2 + 0.5; x < w / 2; x += 0.5) box(f, 0.04, 0.005, deckD, x, 0.15, deckD / 2, C(0x8f6a45), false); // plank lines
    for (const s of [-1, 1]) box(f, w / 2 - 1.4, 0.55, 0.45, s * (w / 4 + 0.7), 0.15, 0.3, spot.look === 'heritage' ? C(0x8d3a24) : C(0xd9d2c3));
    for (let x = -w / 2 + 0.8; x < w / 2 - 0.5; x += 0.9) if (Math.abs(x) > 1.2) shape(f, new THREE.IcosahedronGeometry(0.32, 0), x, 0.85, 0.3, PLANT);
    if (spot.cafe) {
      const umb = spot.look === 'pastel' ? C(0xf4a7b9) : spot.look === 'garden' ? null : spot.look === 'minimal' ? C(0xf4f1ea) : null;
      table(f, -4, 2.6, umb);
      table(f, 4, 2.6, umb);
    } else {
      potted(f, -4, 2.4, 1.3);
      potted(f, 4, 2.4, 1.3);
    }

    // The building.
    box(f, w - 0.6, h, bd, 0, 0, bv, wall);
    const frontV = deckD - 0.02;
    // Big glass shopfront with a warm interior behind it.
    const gw = w - 3;
    k.shape(f, new THREE.BoxGeometry(gw, 2.8, 0.05).translate(0, 1.4, 0), 0, 0.15, frontV + 0.25, GLOW, 0, k.bulbs);
    box(f, gw, 2.8, 0.06, 0, 0.15, frontV, GLASS, false);
    for (let x = -gw / 2; x <= gw / 2 + 0.01; x += gw / 4) box(f, 0.08, 2.8, 0.1, x, 0.15, frontV - 0.02, IRON, false); // mullions
    box(f, 1.2, 2.5, 0.08, 0, 0.15, frontV - 0.04, WOOD, false); // door
    board(f, i % SPOTS.length, 0, 3.15, frontV - 0.1, Math.min(9, w - 3), 1);

    if (spot.look === 'minimal') {
      // Vertical wood slats over the upper wall, a flat canopy.
      for (let x = -w / 2 + 0.6; x < w / 2 - 0.4; x += 0.4) box(f, 0.12, h - 4.2, 0.12, x, 4.2, frontV - 0.08, WOOD, false);
      box(f, w, 0.15, 1.6, 0, 4.25, frontV - 0.8, C(0xf4f1ea), false);
    } else if (spot.look === 'pastel') {
      // Striped fabric awning.
      for (let s = 0; s < 10; s++) {
        const x = -w / 2 + 0.7 + (s * (w - 1.4)) / 10 + (w - 1.4) / 20;
        shape(f, new THREE.BoxGeometry((w - 1.4) / 10, 0.06, 1.8).rotateX(-0.35), x, 4.0, frontV - 0.85, s % 2 ? C(0xffffff) : C(0xe76f51));
      }
      if (two) for (const s of [-1, 1]) box(f, 1.6, 1.5, 0.08, s * 3, 5.2, frontV - 0.02, GLASS, false);
    } else if (spot.look === 'heritage') {
      // Chettinad front: pillars with arches, a sloping tiled roof.
      for (const x of [-w / 2 + 0.8, -2.2, 2.2, w / 2 - 0.8]) {
        shape(f, new THREE.CylinderGeometry(0.16, 0.18, 3.6, 10).translate(0, 1.8, 0), x, 0.15, frontV - 1.4, C(0xf4ead2));
        k.solid(f, 0.36, 3.6, 0.36, x, 0, frontV - 1.4);
      }
      box(f, w - 0.4, 0.3, 1.6, 0, 3.75, frontV - 0.8, C(0xf4ead2), false);
      shape(f, new THREE.ConeGeometry(w * 0.72, 1.8, 4).rotateY(Math.PI / 4).scale(1, 1, (bd + 1.6) / w), 0, h + 0.9, bv - 0.8, C(0xa0442a));
    } else {
      // Garden: a plant wall up the front and a pergola over the deck.
      for (let y = 4.4; y < h - 0.3; y += 0.6) for (let x = -w / 2 + 0.8; x < w / 2 - 0.6; x += 0.7) shape(f, new THREE.IcosahedronGeometry(0.33, 0), x + ((y * 10) % 3) * 0.1, y, frontV - 0.1, (x + y) % 2 > 1 ? PLANT : C(0x5c9a4a));
      for (const x of [-w / 2 + 0.6, w / 2 - 0.6]) for (const v of [0.8, deckD - 0.4]) box(f, 0.15, 3, 0.15, x, 0.15, v, WOOD);
      for (let x = -w / 2 + 0.6; x <= w / 2 - 0.6; x += 0.8) box(f, 0.1, 0.12, deckD, x, 3.1, deckD / 2, WOOD, false);
      for (let x = -w / 2 + 1; x < w / 2 - 1; x += 1.3) shape(f, new THREE.IcosahedronGeometry(0.4, 0).scale(1, 0.6, 1), x, 3.3, 1 + (x * 7 % 3), PLANT);
    }
    // Parapet / roof edge and, on two-storey ones, a rooftop umbrella.
    if (spot.look !== 'heritage') box(f, w - 0.4, 0.5, bd + 0.2, 0, h, bv, spot.look === 'minimal' ? C(0xd9d2c3) : wall, false);

    // String lights sagging across the front of the deck.
    for (let n = 0; n <= 18; n++) {
      const t = n / 18;
      const x = -w / 2 + 0.4 + t * (w - 0.8);
      const y = 3.0 - Math.sin(t * Math.PI) * 0.55;
      shape(f, new THREE.SphereGeometry(0.07, 6, 4), x, y, 0.15, BULBS[n % 3], 0, k.bulbs);
    }
    for (const x of [-w / 2 + 0.4, w / 2 - 0.4]) box(f, 0.06, 3, 0.06, x, 0.15, 0.15, IRON);

    if (spot.cafe) {
      const p = f.at(0, deckD - 0.9);
      eateries.push({ name: spot.name, menu: PLACE_MENUS[spot.cafe], spot: new THREE.Vector3(p.x, 0.15, p.z), seat: p.clone(), seatYaw: 0, eatYaw: 0, table: p.clone() });
    }
  });

  return { eateries, names: SPOTS.map((s) => s.name), setNight: k.build(scene) };
}
