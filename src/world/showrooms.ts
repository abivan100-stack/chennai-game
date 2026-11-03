import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import { createKit, frame, type Frame } from './kit';
import { SHOWROOM_LOTS } from './layout';

/**
 * Silk street on Eldams Road: modern fashion stores like the big Chennai chains (invented
 * names). White frame, two fully glazed upper floors with lit interiors (clothes racks,
 * mannequins), the brand in big letters standing on the glass (English on the first floor,
 * Tamil on the second, and on a rooftop sign box), a coloured band, a recessed glass ground
 * floor with poster panels and a balloon arch over the door, steps across the front.
 * Draw calls: the kit (3), the see-through glass (1), the brand letters (1).
 */

/** Order matches layout.SHOWROOM_LOTS. en / ta = brand, accent = band colour, letters = English letter colour. */
export const SHOWROOMS: { en: string; ta: string; accent: number; letters: string }[] = [
  { en: 'vastra', ta: 'வஸ்த்ரா', accent: 0x1d3fbf, letters: '#1d3fbf' },
  { en: 'aadai', ta: 'ஆடை', accent: 0xd62828, letters: '#d62828' },
  { en: 'NOOL', ta: 'நூல்', accent: 0x0f7f7a, letters: '#0f7f7a' },
  { en: 'thari', ta: 'தறி', accent: 0x6a2c91, letters: '#6a2c91' },
  { en: 'uduppu', ta: 'உடுப்பு', accent: 0xef6c00, letters: '#ef6c00' },
  { en: 'kolam', ta: 'கோலம்', accent: 0xc2185b, letters: '#c2185b' },
  // T. Nagar silk houses (South Usman Road).
  { en: 'GANGA SILKS', ta: 'கங்கா சில்க்ஸ்', accent: 0x8c1c2c, letters: '#8c1c2c' },
  { en: 'Kanchi Pattu', ta: 'காஞ்சி பட்டு', accent: 0xb8860b, letters: '#9a6b00' },
  { en: 'NAVARATNA', ta: 'நவரத்னா நகைகள்', accent: 0x1b5e20, letters: '#1b5e20' },
];

const C = (hex: number) => new THREE.Color(hex);
const WHITE = C(0xf4f4f1);
const GREY = C(0x9e9e9e);
const RAIL = C(0x6d6d6d);
const INTERIOR = C(0xfff3dc); // bright shop interior: glows at night (bulb mesh)
const FLOOR = C(0xd9d4cb);
const SKIN = C(0xc69c7d);
const CLOTHES = [0xd81b60, 0xffb300, 0x00897b, 0x8e24aa, 0xe53935, 0x1e88e5, 0xfdd835, 0xffffff, 0x263238, 0x81c784].map(C);
const POSTER = [0xffd54f, 0x4fc3f7, 0xf06292, 0x81c784, 0xba68c8].map(C);
const BALLOONS = [C(0xffffff), C(0x1e88e5)];
const G = 4.6; // ground floor height
const UP = 4.2; // upper floor height
const ROOM = 3.2; // how deep you can see into the glazed floors
const LETTER_ROW = 160; // px per row in the letters atlas

/** Brand letters on a transparent atlas: row 2i = English, 2i + 1 = Tamil (brand colour, white outline). */
function lettersAtlas() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = LETTER_ROW * SHOWROOMS.length * 2;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = '#0007';
  g.shadowBlur = 8;
  g.shadowOffsetY = 4;
  g.lineJoin = 'round';
  g.lineWidth = 10;
  g.strokeStyle = '#ffffff';
  const write = (text: string, font: string, fill: string, y: number) => {
    g.font = font;
    g.strokeText(text, 512, y, 980); // white outline: readable on the lit glass and on the white sign box
    g.fillStyle = fill;
    g.fillText(text, 512, y, 980);
  };
  SHOWROOMS.forEach((s, i) => {
    write(s.en, '900 128px "Segoe UI", system-ui, sans-serif', s.letters, (2 * i + 0.5) * LETTER_ROW);
    write(s.ta, '800 112px "Nirmala UI", "Latha", "Noto Sans Tamil", sans-serif', s.letters, (2 * i + 1.5) * LETTER_ROW);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createShowrooms(scene: THREE.Scene, world: RAPIER.World) {
  const k = createKit(world, [['', '', '#000000', '#000000']]); // no signboards: the letters are their own mesh
  const { box, shape } = k;
  const glass = new GeoBuilder();
  const letters = new GeoBuilder();
  const names: string[] = [];
  const rows = SHOWROOMS.length * 2;
  let garment = 0;

  /** A row of the letters atlas standing just in front of the glass, centred at u, bottom at y. */
  const logo = (f: Frame, row: number, u: number, y: number, v: number, w: number, h: number) => {
    const v0 = 1 - (row + 1) / rows;
    const v1 = 1 - row / rows;
    const out = f.at(0, -1).sub(f.at(0, 0));
    letters.quad(f.at(u + w / 2, v, y), f.at(u - w / 2, v, y), f.at(u - w / 2, v, y + h), f.at(u + w / 2, v, y + h), [[0, v0], [1, v0], [1, v1], [0, v1]], WHITE, out);
  };
  const pane = (f: Frame, u: number, y: number, v: number, w: number, h: number) => {
    const p = f.at(u, v);
    glass.box(w, h, 0.04, p.x, y + h / 2, p.z, C(0xd6ecf7), f.yaw);
  };

  SHOWROOM_LOTS().forEach((lot, i) => {
    const s = SHOWROOMS[i % SHOWROOMS.length];
    names.push(s.en.charAt(0).toUpperCase() + s.en.slice(1).toLowerCase());
    const f = frame(lot);
    const { w, d } = f;
    const accent = C(s.accent);
    const front = 1.6; // facade line (steps in front of it)
    const bw = w - 1;
    const H = G + 2 * UP;

    // Steps across the front.
    for (let n = 0; n < 3; n++) box(f, bw, 0.15 * (n + 1), front - n * 0.45, 0, 0, (front - n * 0.45) / 2, C(0xb8b8b8), false);
    // Solid block behind the glazed rooms.
    const back = d - front - ROOM - 0.5;
    box(f, bw, H, back, 0, 0, front + ROOM + back / 2, WHITE);

    // Rooms behind the glass: floor slabs, a bright back wall, racks of clothes, mannequins.
    for (let fl = 0; fl < 3; fl++) {
      const y0 = fl === 0 ? 0.45 : G + (fl - 1) * UP;
      const hh = fl === 0 ? G - 0.45 : UP;
      box(f, bw - 1.6, 0.12, ROOM, 0, y0 - 0.12, front + ROOM / 2, FLOOR, false);
      k.shape(f, new THREE.BoxGeometry(bw - 1.6, hh - 0.3, 0.05).translate(0, (hh - 0.3) / 2, 0), 0, y0, front + ROOM - 0.03, INTERIOR, 0, k.bulbs);
      k.shape(f, new THREE.BoxGeometry(bw - 2, 0.06, 0.3), 0, y0 + hh - 0.45, front + ROOM / 2, INTERIOR, 0, k.bulbs); // ceiling light strip
      // Two racks: a rail and hanging garments.
      for (const rv of [ROOM - 0.6, ROOM - 1.8]) {
        box(f, bw - 4, 0.05, 0.05, 0, y0 + 1.75, front + rv, RAIL, false);
        for (let u = -bw / 2 + 2.3; u < bw / 2 - 2; u += 0.42) box(f, 0.34, 0.85, 0.06, u, y0 + 0.88, front + rv, CLOTHES[(garment++ * 7 + i) % CLOTHES.length], false);
      }
      // Mannequins in the window.
      for (let m = 0; m < 5; m++) {
        const u = -bw / 2 + 3 + m * ((bw - 6) / 4);
        if (fl === 0 && Math.abs(u) < 3) continue; // the doorway
        const c = CLOTHES[(i * 2 + m + fl) % CLOTHES.length];
        box(f, 0.6, 0.12, 0.6, u, y0, front + 0.6, C(0xffffff), false);
        shape(f, new THREE.CylinderGeometry(0.13, 0.26, 1.0, 8).translate(0, 0.5, 0), u, y0 + 0.12, front + 0.6, c);
        shape(f, new THREE.CylinderGeometry(0.12, 0.14, 0.5, 8).translate(0, 0.25, 0), u, y0 + 1.12, front + 0.6, c);
        shape(f, new THREE.SphereGeometry(0.1, 8, 6), u, y0 + 1.72, front + 0.6, SKIN);
      }
      // Glass in front of the room (the ground floor leaves a gap for the doors).
      if (fl === 0) {
        const side = (bw - 1.6 - 4) / 2;
        for (const sg of [-1, 1]) {
          pane(f, sg * (2 + side / 2), y0, front + 0.05, side, hh - 0.1);
          k.solid(f, side, hh, 0.12, sg * (2 + side / 2), 0, front + 0.05);
        }
        pane(f, 0, y0 + 2.9, front + 0.05, 4, hh - 3);
      } else pane(f, 0, y0 + 0.1, front + 0.05, bw - 1.6, hh - 0.2);
      // Mullions.
      for (let u = -bw / 2 + 0.8; u <= bw / 2 - 0.8 + 0.01; u += (bw - 1.6) / 8) box(f, 0.08, hh, 0.08, u, y0, front, GREY, false);
    }

    // White frame: piers at the sides, slabs between floors, the coloured band, parapet.
    for (const sg of [-1, 1]) box(f, 0.8, H + 1, ROOM + 0.4, sg * (bw / 2 - 0.4), 0, front + ROOM / 2 - 0.2, WHITE);
    box(f, bw, 0.7, 1.2, 0, G - 0.35, front - 0.3, accent, false); // band over the ground floor
    box(f, bw, 0.5, 0.9, 0, G + UP - 0.25, front - 0.25, WHITE, false);
    box(f, bw, 1.1, ROOM + 0.6, 0, H, front + ROOM / 2 - 0.3, WHITE, false); // parapet / roof edge
    k.shape(f, new THREE.BoxGeometry(bw, 0.12, 0.1), 0, G - 0.75, front - 0.92, C(0xffffff), 0, k.bulbs); // light line under the band

    // The brand: English on the first-floor glass, Tamil on the second, Tamil again on a rooftop box.
    logo(f, 2 * i, 0, G + 0.6, front - 0.05, Math.min(bw - 4, 22), 2.9);
    logo(f, 2 * i + 1, 0, G + UP + 0.7, front - 0.05, Math.min(bw - 6, 16), 2.4);
    box(f, 11, 3.2, 3, 0, H + 1.1, front + 3, WHITE);
    box(f, 11.2, 0.2, 3.2, 0, H + 4.3, front + 3, accent, false);
    logo(f, 2 * i + 1, 0, H + 1.5, front + 1.48, 10, 2.5);

    // Entrance: poster panels either side, a balloon arch, a doormat.
    for (const sg of [-1, 1]) {
      box(f, 2.4, 3.4, 0.12, sg * 4.2, 0.45, front - 0.2, accent, false);
      // Poster: two bold colour blocks (a model's outfit on a backdrop), never plain white.
      box(f, 2.0, 1.6, 0.04, sg * 4.2, 0.7, front - 0.28, POSTER[(i + (sg > 0 ? 0 : 2)) % POSTER.length], false);
      box(f, 2.0, 1.3, 0.04, sg * 4.2, 2.3, front - 0.28, POSTER[(i + (sg > 0 ? 1 : 3)) % POSTER.length], false);
      box(f, 0.7, 2.2, 0.03, sg * 4.2, 0.95, front - 0.31, CLOTHES[(i * 3 + (sg > 0 ? 1 : 4)) % 7], false);
    }
    for (let n = 0; n <= 22; n++) {
      const a = (n / 22) * Math.PI;
      shape(f, new THREE.IcosahedronGeometry(0.22, 0), Math.cos(a) * 2.3, 0.45 + Math.sin(a) * 3.1, front - 0.45, BALLOONS[n % 2]);
    }
    box(f, 3.6, 0.03, 1.2, 0, 0.46, front + 0.7, C(0x7a1f1f), false);
  });

  const glassMesh = new THREE.Mesh(glass.build(), new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.4, depthWrite: false }));
  glassMesh.renderOrder = 1;
  const tex = lettersAtlas();
  const letterMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.1, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5 });
  scene.add(glassMesh, new THREE.Mesh(letters.build(), letterMat));
  const setKit = k.build(scene);
  return {
    names,
    setNight(night: number) {
      setKit(night);
      letterMat.emissiveIntensity = 0.1 + night * 0.9;
    },
  };
}
