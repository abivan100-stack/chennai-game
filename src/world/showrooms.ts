import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import { createKit, frame, type SignDef } from './kit';
import { SHOWROOM_LOTS } from './layout';

/**
 * Silk street on Eldams Road: big multi-storey textile / clothing showrooms (the T. Nagar kind,
 * invented names). Each: a full-height glass ground floor with mannequins in sarees and suits,
 * a grand entrance with gold pillars, window bands per floor, a huge name board across the top,
 * a vertical banner and light strips that glow at night. One kit: 3 draw calls for all of them.
 */

/** Order matches layout.SHOWROOM_LOTS. [Tamil, English, board colour, text colour, facade, floors] */
export const SHOWROOMS: [string, string, string, string, number, number][] = [
  ['ஸ்ரீ மீனாட்சி சில்க்ஸ்', 'SRI MEENAKSHI SILKS', '#7a1020', '#ffd75e', 0x8c1c2c, 7],
  ['திருமகள் டெக்ஸ்டைல்ஸ்', 'THIRUMAGAL TEXTILES', '#0b3d2e', '#f6d27a', 0x1f5a45, 6],
  ['ராஜம் பட்டு மாளிகை', 'RAJAM PATTU MAALIGAI', '#5a1a5e', '#ffe08a', 0x6e2a72, 7],
  ['ஆதிரா ஃபேஷன்ஸ்', 'AADHIRA FASHIONS', '#111111', '#ffffff', 0xece6da, 5],
  ['காவேரி சில்க் ஹவுஸ்', 'KAVERI SILK HOUSE', '#0d3b66', '#ffd166', 0x23507e, 6],
  ['வசந்தம் ரெடிமேட்ஸ்', 'VASANTHAM READYMADES', '#c2185b', '#ffffff', 0xf2e8d5, 5],
];
const TAGLINE = SHOWROOMS.length; // sign rows after the names
const SIGNS: SignDef[] = [
  ...SHOWROOMS.map(([ta, en, bg, fg]): SignDef => [ta, en, bg, fg]),
  ['பட்டு · ஜவுளி · திருமண சேலைகள்', 'SILKS · SAREES · WEDDING COLLECTION', '#b8860b', '#ffffff'],
  ['ஆண்கள் · பெண்கள் · குழந்தைகள்', 'MEN · WOMEN · KIDS · READYMADES', '#222222', '#ffd166'],
];

const C = (hex: number) => new THREE.Color(hex);
const GOLD = C(0xd4a537);
const INSIDE = C(0xe8c98f); // warm, bright shop interior behind the glass (glows at night)
const STONE = C(0xc9c1b1);
const DARK = C(0x262626);
const SKIN = C(0x8d5a3b);
const DRAPES = [0xd81b60, 0xffb300, 0x00897b, 0x8e24aa, 0xe53935, 0x1e88e5, 0xfdd835].map(C);
const FLOOR_H = 3.6;

export function createShowrooms(scene: THREE.Scene, world: RAPIER.World) {
  const k = createKit(world, SIGNS);
  const { box, board, shape } = k;
  const names: string[] = [];
  const glass = new GeoBuilder(); // see-through shopfronts (one transparent draw call)

  SHOWROOM_LOTS().forEach((lot, i) => {
    const [, en, , , facadeHex, floors] = SHOWROOMS[i % SHOWROOMS.length];
    names.push(en.replace(/\b(\w)(\w*)/g, (_, a: string, b: string) => a + b.toLowerCase()));
    const f = frame(lot);
    const { w, d } = f;
    const facade = C(facadeHex);
    const light = facadeHex === 0xece6da || facadeHex === 0xf2e8d5;
    const trim = light ? C(0x8c1c2c) : GOLD;
    const front = 1.2; // facade line, in from the lot edge
    const bw = w - 1;
    const bd = d - front - 0.5;
    const H = floors * FLOOR_H;

    // Forecourt paving and steps.
    box(f, w, 0.12, front + 0.2, 0, 0, front / 2, STONE, false);
    box(f, 10, 0.3, 1.2, 0, 0, front - 0.4, STONE, false);
    // The block: upper floors flush with the front, the glass ground floor set back 1 m behind its pillars.
    const gH = FLOOR_H * 2 - 0.4;
    const recess = 1;
    box(f, bw, gH, bd - recess, 0, 0, front + recess + (bd - recess) / 2, facade);
    box(f, bw, H - gH, bd, 0, gH, front + bd / 2, facade);
    box(f, bw - 0.4, 0.1, recess, 0, 0.12, front + recess / 2, STONE, false); // showroom floor
    for (const s of [-1, 1]) box(f, 0.6, gH, recess, s * (bw / 2 - 0.3), 0, front + recess / 2, facade);
    box(f, bw + 0.4, 0.6, bd + 0.4, 0, H, front + bd / 2, trim, false); // cornice
    // Ground floor: two storeys of glass, warm inside, mannequins in the window.
    k.shape(f, new THREE.BoxGeometry(bw - 1.4, gH - 0.2, 0.05).translate(0, (gH - 0.2) / 2, 0), 0, 0.2, front + recess - 0.03, INSIDE, 0, k.bulbs);
    for (let u = -bw / 2 + 1; u <= bw / 2 - 1 + 0.01; u += (bw - 2) / 6) box(f, 0.18, gH, 0.14, u, 0.2, front - 0.08, trim, false);
    box(f, bw - 1.6, 0.25, 0.3, 0, FLOOR_H - 0.2, front - 0.12, trim, false); // mezzanine line
    // Shelves of folded sarees on the back wall, mannequins on plinths in the window.
    for (let row = 0; row < 3; row++) for (let n = 0; n < 9; n++) {
      const u = -bw / 2 + 2 + n * ((bw - 4) / 8);
      box(f, 2.6, 0.5, 0.25, u, 0.9 + row * 1.3, front + recess - 0.2, DRAPES[(i + row * 2 + n) % DRAPES.length], false);
    }
    for (let m = 0; m < 6; m++) {
      const u = -bw / 2 + 3 + m * ((bw - 6) / 5);
      if (Math.abs(u) < 3.4) continue; // the doorway
      const drape = DRAPES[(i * 3 + m) % DRAPES.length];
      box(f, 0.7, 0.3, 0.7, u, 0.12, front + 0.45, C(0xf5f0e6), false);
      shape(f, new THREE.CylinderGeometry(0.12, 0.3, 1.1, 8).translate(0, 0.55, 0), u, 0.42, front + 0.45, drape); // saree / skirt
      shape(f, new THREE.CylinderGeometry(0.12, 0.14, 0.45, 8).translate(0, 0.22, 0), u, 1.52, front + 0.45, drape);
      shape(f, new THREE.SphereGeometry(0.1, 8, 6), u, 2.07, front + 0.45, SKIN);
    }
    { // the glass itself, with a gap for the doors
      const p = f.at(0, front + 0.06);
      const side = (bw - 1.4 - 4) / 2;
      for (const s of [-1, 1]) {
        const q = f.at(s * (2 + side / 2), front + 0.06);
        glass.box(side, gH - 0.2, 0.04, q.x, 0.2 + (gH - 0.2) / 2, q.z, C(0xcfe8f5), f.yaw);
        k.solid(f, side, gH, 0.12, s * (2 + side / 2), 0, front + 0.06);
      }
      glass.box(4, gH - 3.3, 0.04, p.x, 3.1 + (gH - 3.3) / 2, p.z, C(0xcfe8f5), f.yaw); // transom above the doors
    }
    // Grand entrance: gold pillars, glass doors, a canopy.
    for (const s of [-1, 1]) {
      shape(f, new THREE.CylinderGeometry(0.32, 0.36, gH, 12).translate(0, gH / 2, 0), s * 3, 0.2, front - 0.6, GOLD);
      k.solid(f, 0.7, gH, 0.7, s * 3, 0, front - 0.6);
    }
    box(f, 4, 2.8, 0.08, 0, 0.3, front + recess - 0.08, C(0x6b4a2a), false);
    box(f, 8.5, 0.35, 2.2, 0, gH + 0.2, front - 0.9, trim, false);
    // Upper floors: a window band per floor with a gold sill line.
    for (let fl = 2; fl < floors; fl++) {
      const y = fl * FLOOR_H + 0.6;
      const lit = (fl + i) % 3 !== 0;
      k.shape(f, new THREE.BoxGeometry(bw - 2.4, 2.1, 0.06).translate(0, 1.05, 0), 0, y, front - 0.04, lit ? C(0x9cb6c8) : C(0x7d98ad), 0, lit ? k.bulbs : k.geo);
      box(f, bw - 1.8, 0.14, 0.4, 0, y - 0.2, front - 0.2, trim, false);
    }
    // Huge name board near the top and a vertical banner on one side.
    const boardY = H - 4.4;
    box(f, bw - 1, 4.2, 0.25, 0, boardY - 0.1, front - 0.3, DARK, false);
    board(f, i % SHOWROOMS.length, 0, boardY, front - 0.45, bw - 2, 4);
    const side = i % 2 ? 1 : -1;
    box(f, 2.4, H - 9, 0.3, side * (bw / 2 - 1.4), FLOOR_H * 2, front - 0.5, trim, false);
    board(f, TAGLINE + (i % 2), side * (bw / 2 - 1.4), H - 6.5, front - 0.68, 2.2, 0.9);
    // Light strips along the edges and the cornice (on at night).
    for (const s of [-1, 1]) k.shape(f, new THREE.BoxGeometry(0.15, H - gH, 0.1).translate(0, (H - gH) / 2, 0), s * (bw / 2 - 0.1), gH, front - 0.1, C(0xfff2c0), 0, k.bulbs);
    k.shape(f, new THREE.BoxGeometry(bw, 0.15, 0.1), 0, H + 0.65, front - 0.15, C(0xfff2c0), 0, k.bulbs);
  });

  const glassMesh = new THREE.Mesh(glass.build(), new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.25, roughness: 0.05, metalness: 0.4, depthWrite: false }));
  glassMesh.renderOrder = 1;
  scene.add(glassMesh);
  return { names, setNight: k.build(scene) };
}
