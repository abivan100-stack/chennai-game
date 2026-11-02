import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { createKit, frame, type SignDef } from './kit';
import { LANDMARK_LOTS } from './layout';

/**
 * Real Chennai landmarks, stylised from code (no photos, logos or likenesses):
 *   TTK Road: the Music Academy (columned white concert hall) and Narada Gana Sabha;
 *   Anna Salai: Semmozhi Poonga (botanical garden) and the Teynampet Metro entrance;
 *   R.K. Mutt Road: Ramakrishna Math (domed universal temple);
 *   Beach Road: Vivekanandar Illam, the round colonnaded Ice House;
 *   Greenways Road: Ambedkar Manimandapam (domed memorial pavilion);
 *   by the Adyar: Tholkappia Poonga (eco park: ponds, boardwalks, mangroves, a watch tower).
 * 3 draw calls for all of them (kit.ts).
 */

const SIGNS: SignDef[] = [
  ['மியூசிக் அகாடமி', 'THE MUSIC ACADEMY', '#f7f2e4', '#7a1f1f'],
  ['நாரத கான சபா', 'NARADA GANA SABHA', '#7a1f1f', '#ffe7a8'],
  ['செம்மொழிப் பூங்கா', 'SEMMOZHI POONGA', '#2e7d32', '#ffffff'],
  ['தேனாம்பேட்டை மெட்ரோ', 'TEYNAMPET METRO', '#1d4fa8', '#ffffff'],
  ['ஸ்ரீ ராமகிருஷ்ண மடம்', 'SRI RAMAKRISHNA MATH', '#f3e2c4', '#8a3b12'],
  ['விவேகானந்தர் இல்லம்', 'VIVEKANANDAR ILLAM · ICE HOUSE', '#ffffff', '#8a1c3b'],
  ['அம்பேத்கர் மணிமண்டபம்', 'AMBEDKAR MANIMANDAPAM', '#1a3c8f', '#ffffff'],
  ['தொல்காப்பியப் பூங்கா', 'THOLKAPPIA POONGA · ADYAR ECO PARK', '#33691e', '#ffffff'],
];
const SIGN = { academy: 0, sabha: 1, poonga: 2, metro: 3, math: 4, illam: 5, mandapam: 6, eco: 7 };

const C = (hex: number) => new THREE.Color(hex);
const WHITE = C(0xf8f6f0);
const CREAM = C(0xefe2c4);
const PEACH = C(0xf2cfa5);
const STONE = C(0xb8b0a0);
const GREY = C(0x8f8c86);
const GRASS = C(0x5d9440);
const PATH = C(0xcbb994);
const DARK = C(0x3a2a1e);
const WATER = C(0x4f7f8f);
const WOOD = C(0x7a5534);
const MAROON = C(0x7a1f1f);

export function createLandmarks(scene: THREE.Scene, world: RAPIER.World) {
  const k = createKit(world, SIGNS);
  const { box, shape, board, tree, solid } = k;
  const L = LANDMARK_LOTS();
  /** Low compound wall round a lot with a gate gap at the front. */
  const compound = (f: ReturnType<typeof frame>, gate: number, c: THREE.Color, h = 1.3) => {
    const side = (f.w - gate) / 2;
    for (const s of [-1, 1]) box(f, side, h, 0.3, s * (gate / 2 + side / 2), 0, 0.2, c);
    box(f, 0.3, h, f.d, -f.w / 2 + 0.15, 0, f.d / 2, c);
    box(f, 0.3, h, f.d, f.w / 2 - 0.15, 0, f.d / 2, c);
    box(f, f.w, h, 0.3, 0, 0, f.d - 0.15, c);
  };
  const columns = (f: ReturnType<typeof frame>, n: number, span: number, v: number, h: number, r: number, c: THREE.Color) => {
    for (let i = 0; i < n; i++) {
      const u = -span / 2 + (i * span) / (n - 1);
      shape(f, new THREE.CylinderGeometry(r, r * 1.1, h, 10).translate(0, h / 2, 0), u, 0, v, c);
      solid(f, r * 2, h, r * 2, u, 0, v);
    }
  };

  // ---- The Music Academy (TTK Road): big white concert hall with a columned front ----
  {
    const f = frame(L.musicAcademy);
    box(f, f.w - 4, 0.03, 8, 0, 0, 4, PATH, false);
    box(f, 24, 12, 16, 0, 0, 20, WHITE);
    box(f, 25, 1.2, 17, 0, 12, 20, CREAM, false);
    box(f, 22, 0.6, 5, 0, 8.6, 9.5, CREAM, false); // portico roof
    columns(f, 8, 20, 8.2, 8.6, 0.38, WHITE);
    box(f, 22, 0.6, 3.5, 0, 0, 10, STONE, false); // steps
    for (const u of [-6, 0, 6]) box(f, 2.4, 3.6, 0.1, u, 0.6, 11.95, DARK, false);
    board(f, SIGN.academy, 0, 9.4, 7, 14, 1.6);
    compound(f, 8, CREAM);
    tree(f, -12, 4, 1.1);
    tree(f, 12, 4, 1.1);
  }

  // ---- Narada Gana Sabha (TTK Road): maroon-trimmed sabha hall with a canopy ----
  {
    const f = frame(L.naradaGanaSabha);
    box(f, 16, 9, 13, 0, 0, 13, CREAM);
    box(f, 16.6, 1, 13.6, 0, 9, 13, MAROON, false);
    box(f, 10, 0.4, 4, 0, 4, 4.6, MAROON, false); // entrance canopy
    for (const s of [-1, 1]) box(f, 0.4, 4, 0.4, s * 4.6, 0, 2.8, CREAM);
    box(f, 3, 3, 0.1, 0, 0, 6.45, DARK, false);
    board(f, SIGN.sabha, 0, 5.6, 6.4, 11, 1.4);
    // Concert season boards by the gate.
    for (const s of [-1, 1]) box(f, 2.4, 1.6, 0.1, s * 7, 1, 1.2, C(0xffe0b2), false);
    compound(f, 7, CREAM);
  }

  // ---- Semmozhi Poonga (Anna Salai): gardens, flower beds, fountain, pergola ----
  {
    const f = frame(L.semmozhiPoonga);
    const { w, d } = f;
    box(f, w - 1, 0.03, d - 1, 0, 0, d / 2, GRASS, false);
    box(f, 3, 0.02, d - 2, 0, 0.035, d / 2, PATH, false);
    box(f, w - 2, 0.02, 3, 0, 0.035, d / 2, PATH, false);
    const beds = [C(0xe53935), C(0xfdd835), C(0x8e24aa), C(0xff7043), C(0xf8bbd0)];
    let i = 0;
    for (const u of [-14, -7, 7, 14]) for (const v of [8, 14, d - 14, d - 8]) box(f, 4.5, 0.35, 3.5, u, 0, v, beds[i++ % beds.length], false);
    shape(f, new THREE.CylinderGeometry(3, 3.2, 0.7, 20), 0, 0.35, d / 2, STONE);
    shape(f, new THREE.CylinderGeometry(2.7, 2.7, 0.05, 20), 0, 0.7, d / 2, C(0x5fa8d3));
    solid(f, 6, 0.9, 6, 0, 0, d / 2);
    // Pergola walk on one side.
    for (let v = 6; v < d - 6; v += 4) for (const s of [-1, 1]) box(f, 0.25, 2.8, 0.25, w / 2 - 6 + s * 1.5, 0, v, WHITE);
    box(f, 3.6, 0.2, d - 12, w / 2 - 6, 2.8, d / 2, C(0x6d8f3a), false);
    for (const [u, v, s] of [[-18, 4, 1.1], [18, 4, 1], [-18, d - 4, 1.2], [-10, d / 2 + 8, 0.9], [10, d / 2 - 8, 0.9]] as const) tree(f, u, v, s);
    // Gate arch on Anna Salai.
    for (const s of [-1, 1]) box(f, 1, 4.5, 1, s * 3.5, 0, 0.5, C(0x8d6e63));
    box(f, 8, 0.8, 1.2, 0, 4.5, 0.5, C(0x8d6e63), false);
    board(f, SIGN.poonga, 0, 5.3, 0.4, 8, 1);
    const side = (w - 7) / 2;
    for (const s of [-1, 1]) {
      box(f, side, 0.5, 0.3, s * (3.5 + side / 2), 0, 0.2, STONE, false);
      for (let t = 0; t <= side; t += 0.5) box(f, 0.05, 0.8, 0.05, s * (3.5 + t), 0.5, 0.2, C(0x2e7d32), false);
      solid(f, side, 1.3, 0.3, s * (3.5 + side / 2), 0, 0.2);
    }
  }

  // ---- Teynampet Metro entrance (Anna Salai): canopy over stairs going down ----
  {
    const f = frame(L.metro);
    box(f, 10, 0.3, 8, 0, 3.6, 4.5, WHITE, false);
    shape(f, new THREE.CylinderGeometry(5, 5, 8, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.25, 1), 0, 3.9, 4.5, C(0x9fc4d6));
    for (const s of [-1, 1]) box(f, 0.3, 3.6, 8, s * 4.85, 0, 4.5, C(0x1d4fa8));
    box(f, 9.4, 3.6, 0.3, 0, 0, 8.4, C(0x1d4fa8));
    box(f, 6, 0.04, 6, 0, 0.02, 4.5, C(0x222222), false); // the stairwell
    board(f, SIGN.metro, 0, 4.3, 0.4, 9, 1.2);
    shape(f, new THREE.SphereGeometry(0.5, 12, 8), 6, 3.5, 1, C(0x1d4fa8), 0, k.bulbs);
    box(f, 0.15, 3.5, 0.15, 6, 0, 1, GREY);
  }

  // ---- Sri Ramakrishna Math (R.K. Mutt Road): domed universal temple, lawns ----
  {
    const f = frame(L.ramakrishnaMath);
    const { w, d } = f;
    box(f, w - 1, 0.03, d - 1, 0, 0, d / 2, GRASS, false);
    box(f, 4, 0.02, 12, 0, 0.035, 6, PATH, false);
    const tv = 19;
    box(f, 20, 1.2, 16, 0, 0, tv, STONE); // plinth
    box(f, 18, 9, 14, 0, 1.2, tv, PEACH);
    box(f, 19, 0.8, 15, 0, 10.2, tv, CREAM, false);
    // Facade: a tall arched entrance flanked by columns, a pediment over it.
    box(f, 7, 8, 1.5, 0, 1.2, tv - 7.5, CREAM, false);
    shape(f, new THREE.CylinderGeometry(1.8, 1.8, 1.6, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), 0, 6, tv - 7.6, CREAM);
    box(f, 3.2, 4.6, 0.1, 0, 1.2, tv - 8.3, DARK, false);
    columns(f, 4, 6, tv - 8.6, 7.6, 0.3, WHITE);
    box(f, 7.6, 0.6, 1.8, 0, 9.2, tv - 7.6, CREAM, false);
    // Drum and dome, with a small lantern on top.
    shape(f, new THREE.CylinderGeometry(5, 5.4, 3, 20), 0, 12.5, tv, CREAM);
    shape(f, new THREE.SphereGeometry(5.2, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.15, 1), 0, 14, tv, C(0xf6e9d2));
    shape(f, new THREE.CylinderGeometry(0.6, 0.8, 1.6, 10), 0, 20.6, tv, CREAM);
    shape(f, new THREE.ConeGeometry(0.5, 1.2, 10), 0, 22.2, tv, C(0xc9a24a));
    for (const s of [-1, 1]) shape(f, new THREE.SphereGeometry(1.4, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), s * 7.5, 10.9, tv - 5.5, C(0xf6e9d2));
    box(f, 9, 0.5, 4, 0, 0, tv - 10, STONE, false); // front steps
    board(f, SIGN.math, 0, 1.5, 0.4, 9, 1);
    compound(f, 6, PEACH, 1.5);
    for (const [u, v, s] of [[-14, 5, 1.1], [14, 5, 1.1], [-14, d - 5, 1.2], [14, d - 5, 1]] as const) tree(f, u, v, s);
  }

  // ---- Vivekanandar Illam (Beach Road): the round, colonnaded Ice House ----
  {
    const f = frame(L.vivekanandarIllam);
    const cv = 12;
    const floors = 3;
    const fh = 3.6;
    shape(f, new THREE.CylinderGeometry(6.5, 6.5, floors * fh, 24), 0, (floors * fh) / 2, cv, C(0xf3d9de));
    const p = f.at(0, cv);
    world.createCollider(RAPIER.ColliderDesc.cylinder((floors * fh) / 2, 8.4).setTranslation(p.x, (floors * fh) / 2, p.z));
    for (let fl = 0; fl < floors; fl++) {
      const y = fl * fh;
      shape(f, new THREE.CylinderGeometry(8.6, 8.6, 0.35, 28), 0, y + fh - 0.17, cv, WHITE); // verandah floor / roof ring
      for (let i = 0; i < 20; i++) {
        const a = (i / 20) * Math.PI * 2;
        k.geo.add(new THREE.CylinderGeometry(0.18, 0.2, fh - 0.35, 8).translate(0, (fh - 0.35) / 2, 0), new THREE.Matrix4().setPosition(p.x + Math.cos(a) * 8.2, y, p.z + Math.sin(a) * 8.2), WHITE);
      }
    }
    shape(f, new THREE.CylinderGeometry(8.8, 8.8, 0.8, 28), 0, floors * fh + 0.2, cv, C(0x8a1c3b)); // parapet band
    box(f, 4, 0.5, 3, 0, 0, 2.5, STONE, false);
    board(f, SIGN.illam, 0, 1.2, 0.4, 10, 1.2);
    compound(f, 5, WHITE, 1.2);
    tree(f, -8, 3, 0.9);
  }

  // ---- Ambedkar Manimandapam (Greenways Road): domed pavilion on a stepped platform ----
  {
    const f = frame(L.ambedkarManimandapam);
    const { w, d } = f;
    box(f, w - 1, 0.03, d - 1, 0, 0, d / 2, GRASS, false);
    const cv = d / 2 + 2;
    for (const [s, h] of [[16, 0.5], [13, 1], [10, 1.5]] as const) box(f, s, h, s, 0, 0, cv, STONE, h === 0.5);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const at = f.at(Math.cos(a) * 4, cv + Math.sin(a) * 4);
      k.geo.add(new THREE.CylinderGeometry(0.3, 0.35, 5, 10).translate(0, 2.5, 0), new THREE.Matrix4().setPosition(at.x, 1.5, at.z), WHITE);
    }
    shape(f, new THREE.CylinderGeometry(5, 5, 0.6, 20), 0, 6.8, cv, WHITE);
    shape(f, new THREE.SphereGeometry(4.6, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 7.1, cv, C(0x1a3c8f));
    shape(f, new THREE.CylinderGeometry(0.9, 1.2, 1.4, 10), 0, 1.5 + 0.7, cv, C(0x9e9a90)); // pedestal
    solid(f, 10, 1.5, 10, 0, 0, cv);
    box(f, 5, 0.03, cv - 8, 0, 0.04, (cv - 8) / 2, PATH, false);
    board(f, SIGN.mandapam, 0, 1.2, 0.4, 10, 1.2);
    compound(f, 6, C(0xe9e2d0), 1.2);
    for (const u of [-w / 2 + 4, w / 2 - 4]) for (const v of [5, d - 5]) tree(f, u, v, 1);
  }

  // ---- Tholkappia Poonga (Adyar Eco Park): ponds, boardwalks, mangroves, watch tower ----
  {
    const f = frame(L.tholkappiaPoonga);
    const { w, d } = f;
    box(f, w - 1, 0.03, d - 1, 0, 0, d / 2, C(0x6b8f3e), false);
    for (const [u, v, pw, pd] of [[-9, 14, 14, 10], [8, 26, 16, 12], [-6, 36, 18, 7]] as const) {
      box(f, pw, 0.04, pd, u, 0.02, v, WATER, false);
      solid(f, pw, 1, pd, u, 0, v); // keep out of the ponds
    }
    // Boardwalk across the ponds, on posts (walk around it; it's for show).
    box(f, 2, 0.15, d - 10, 0, 0.6, d / 2 + 2, WOOD, false);
    for (let v = 8; v < d - 2; v += 3) for (const s of [-1, 1]) box(f, 0.12, 0.6, 0.12, s * 0.9, 0, v, DARK, false);
    // Mangroves and reeds round the water.
    const bush = new THREE.IcosahedronGeometry(0.9, 0).scale(1.3, 0.7, 1.3);
    for (let i = 0; i < 40; i++) {
      const u = -w / 2 + 3 + ((i * 37) % (w - 6));
      const v = 6 + ((i * 53) % (d - 10));
      shape(f, bush, u, 0.4, v, i % 3 ? C(0x2f5d2a) : C(0x4a7a3a));
    }
    // Watch tower.
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) box(f, 0.25, 6, 0.25, w / 2 - 6 + a * 1.4, 0, 8 + b * 1.4, WOOD);
    box(f, 3.6, 0.25, 3.6, w / 2 - 6, 6, 8, WOOD, false);
    shape(f, new THREE.ConeGeometry(2.8, 1.6, 4).rotateY(Math.PI / 4), w / 2 - 6, 8.2, 8, C(0x8d6e63));
    for (const s of [-1, 1]) box(f, 1, 3.5, 1, s * 3, 0, 0.5, WOOD);
    box(f, 7, 0.6, 1, 0, 3.5, 0.5, WOOD, false);
    board(f, SIGN.eco, 0, 4.1, 0.4, 9, 1.1);
    const side = (w - 6) / 2;
    for (const s of [-1, 1]) {
      box(f, side, 1, 0.15, s * (3 + side / 2), 0, 0.2, C(0x5d4037));
      box(f, side, 0.08, 0.2, s * (3 + side / 2), 1.0, 0.2, WOOD, false);
    }
  }

  return { setNight: k.build(scene) };
}
