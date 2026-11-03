import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import { createKit, frame, type Frame } from './kit';
import { STORE_LOTS } from './layout';

/**
 * Brand stores on the wide main roads (invented names), three looks:
 *   - 'mall': a big department store with a cinema on top, like the old Chennai ones: cream
 *     rusticated facade, arched windows with posters, a navy name band, framed posters and the
 *     cinema's logo box above, cornice + balustrade, lantern posts on the forecourt.
 *   - 'boutique': a white two-storey boutique: dark serif letters on the plain wall, a wavy
 *     relief band, two big display windows in pale-green frames with dressed mannequins, plants.
 *   - 'brand': a menswear brand outlet: glazed ground floor up a few steps, lit racks and
 *     mannequins, a deep wood-clad fascia with white letters and downlights under it, a tall
 *     offer banner, plain floors above.
 * Draw calls: the kit (3), the see-through glass (1), letters + posters (1).
 */

type Look = 'mall' | 'boutique' | 'brand';
/** Order matches layout.STORE_LOTS. accent: band / frame / fascia colour; letters: name colour. */
export const STORES: { name: string; look: Look; accent: number; letters: string; cinema?: string }[] = [
  { name: 'stylebay', look: 'mall', accent: 0x1f3557, letters: '#ffffff', cinema: 'MAYA' },
  { name: 'Kalyani Mart', look: 'mall', accent: 0x6a1b2a, letters: '#ffe9a8', cinema: 'RAAGAM' },
  { name: 'newtrend', look: 'mall', accent: 0x0f4c5c, letters: '#ffffff', cinema: 'THIRAI' },
  { name: 'NILAVU', look: 'boutique', accent: 0x9cc9b8, letters: '#3b2433' },
  { name: 'COASTLINE', look: 'brand', accent: 0x4e342e, letters: '#ffffff' },
  { name: 'KAATRU', look: 'brand', accent: 0x263238, letters: '#ffffff' },
  { name: 'Mallige', look: 'boutique', accent: 0xe3c7a0, letters: '#2e2a26' },
  { name: 'MADRAS LINEN', look: 'brand', accent: 0x5d4037, letters: '#fff3d6' },
  { name: 'Ilai', look: 'boutique', accent: 0xa8c5d6, letters: '#24323d' },
  { name: 'URBAN KOLAM', look: 'brand', accent: 0x3e2723, letters: '#ffffff' },
  { name: 'PAVAZHAM', look: 'boutique', accent: 0xe8b4a8, letters: '#4a1f1a' },
  { name: 'TERRA MYLAI', look: 'brand', accent: 0x4e3b2a, letters: '#ffffff' },
  { name: 'Aruvi', look: 'boutique', accent: 0x9cc9b8, letters: '#1f3a33' },
  { name: 'SOUTHLINE', look: 'brand', accent: 0x37474f, letters: '#ffffff' },
];

const C = (hex: number) => new THREE.Color(hex);
const WHITE = C(0xf6f4ee);
const CREAM = C(0xe9dcc0);
const CREAM_D = C(0xcdbd9c); // grooves, mouldings in shade
const ORNATE = C(0xfbf6ea);
const DARK = C(0x1d1d1d);
const INTERIOR = C(0xfff1d8);
const SKIN = C(0xc69c7d);
const CLOTHES = [0x1e3a5f, 0xffffff, 0x8d6e63, 0x546e7a, 0xd84315, 0x2e7d32, 0xf9a825, 0x6a1b9a, 0x37474f, 0xc2185b].map(C);
const PLANT = C(0x3f7f35);
const POT = C(0x8d5a3b);

/**
 * One texture for every name and poster: text rows (transparent, alpha-tested) on top and
 * poster cells below. Posters are code-drawn: colour fields, a faceless figure or skyline, big text.
 */
const ATLAS_W = 1024;
const ROW_H = 128;
const CELL_W = 256;
const CELL_H = 320;
const POSTERS = [
  { bg: ['#f06292', '#7b1fa2'], text: ['END OF', 'SEASON', 'SALE'], figure: 'dress' },
  { bg: ['#26c6da', '#1a237e'], text: ['NEW', 'ARRIVALS'], figure: 'shirt' },
  { bg: ['#ffca28', '#e65100'], text: ['FLAT', '50%', 'OFF'], figure: 'bags' },
  { bg: ['#263238', '#b71c1c'], text: ['NOW', 'SHOWING'], figure: 'film' },
  { bg: ['#a5d6a7', '#00695c'], text: ['FESTIVE', 'COLLECTION'], figure: 'dress' },
  { bg: ['#ffab91', '#4e342e'], text: ['KIDS', 'WEEK'], figure: 'shirt' },
];

function buildAtlas() {
  const rows: { text: string; font: string; fill: string; stroke?: string }[] = [];
  STORES.forEach((s) => {
    const font = s.look === 'boutique' ? '600 104px Georgia, "Times New Roman", serif'
      : s.look === 'brand' ? '700 92px Georgia, "Times New Roman", serif'
      : '700 italic 110px "Segoe UI", system-ui, sans-serif';
    rows.push({ text: s.name, font, fill: s.letters });
    if (s.cinema) rows.push({ text: `${s.cinema} CINEMAS`, font: '900 108px "Segoe UI", system-ui, sans-serif', fill: '#ffffff', stroke: '#ffc107' });
  });
  const posterRows = Math.ceil(POSTERS.length / (ATLAS_W / CELL_W));
  const c = document.createElement('canvas');
  c.width = ATLAS_W;
  c.height = rows.length * ROW_H + posterRows * CELL_H;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  rows.forEach((r, i) => {
    g.font = r.font;
    g.shadowColor = '#0006';
    g.shadowBlur = 6;
    g.shadowOffsetY = 3;
    if (r.stroke) {
      g.lineWidth = 8;
      g.strokeStyle = r.stroke;
      g.strokeText(r.text, ATLAS_W / 2, (i + 0.5) * ROW_H, 1000);
    }
    g.fillStyle = r.fill;
    g.fillText(r.text, ATLAS_W / 2, (i + 0.5) * ROW_H, 1000);
  });
  g.shadowColor = 'transparent';
  const top = rows.length * ROW_H;
  POSTERS.forEach((p, n) => {
    const x = (n % 4) * CELL_W;
    const y = top + Math.floor(n / 4) * CELL_H;
    const grad = g.createLinearGradient(x, y, x, y + CELL_H);
    grad.addColorStop(0, p.bg[0]);
    grad.addColorStop(1, p.bg[1]);
    g.fillStyle = grad;
    g.fillRect(x, y, CELL_W, CELL_H);
    g.fillStyle = '#ffffff22';
    g.beginPath();
    g.arc(x + CELL_W * 0.7, y + CELL_H * 0.35, 90, 0, Math.PI * 2);
    g.fill();
    // A faceless figure / goods, drawn as flat shapes.
    const fx = x + CELL_W * 0.68;
    const fy = y + CELL_H * 0.2;
    g.fillStyle = '#ffffffd0';
    if (p.figure === 'dress' || p.figure === 'shirt') {
      g.beginPath();
      g.arc(fx, fy, 16, 0, Math.PI * 2);
      g.fill();
      g.fillRect(fx - 5, fy + 14, 10, 10);
      g.beginPath();
      if (p.figure === 'dress') {
        g.moveTo(fx - 18, fy + 24); g.lineTo(fx + 18, fy + 24); g.lineTo(fx + 52, fy + 200); g.lineTo(fx - 52, fy + 200);
      } else {
        g.moveTo(fx - 34, fy + 24); g.lineTo(fx + 34, fy + 24); g.lineTo(fx + 30, fy + 130); g.lineTo(fx - 30, fy + 130);
        g.rect(fx - 26, fy + 130, 22, 80); g.rect(fx + 4, fy + 130, 22, 80);
      }
      g.fill();
    } else if (p.figure === 'bags') {
      for (const [dx, h, col] of [[-40, 90, '#ffffff'], [10, 120, '#ffe082']] as const) {
        g.fillStyle = col;
        g.fillRect(fx + dx, fy + 200 - h, 60, h);
        g.strokeStyle = col;
        g.lineWidth = 5;
        g.beginPath();
        g.arc(fx + dx + 30, fy + 200 - h, 16, Math.PI, 0);
        g.stroke();
      }
    } else {
      // Film: a skyline and a big title.
      g.fillStyle = '#00000088';
      for (let i = 0; i < 9; i++) g.fillRect(x + i * 29, y + CELL_H * 0.55 - ((i * 37) % 70), 26, 90 + ((i * 37) % 70));
      g.fillStyle = '#ffc107';
      g.font = '900 64px "Segoe UI", system-ui, sans-serif';
      g.fillText('VETRI', x + CELL_W / 2, y + 60, CELL_W - 20);
    }
    g.textAlign = 'left';
    g.fillStyle = '#ffffff';
    p.text.forEach((t, i) => {
      g.font = `900 ${t.length > 7 ? 34 : 46}px "Segoe UI", system-ui, sans-serif`;
      g.fillText(t, x + 16, y + CELL_H - 30 - (p.text.length - 1 - i) * 46, CELL_W - 30);
    });
    g.textAlign = 'center';
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  /** UV rect [u0, v0, u1, v1] of a text row or a poster cell. */
  const uvRow = (row: number) => [0, 1 - ((row + 1) * ROW_H) / c.height, 1, 1 - (row * ROW_H) / c.height];
  const uvPoster = (n: number) => {
    const x = (n % 4) * CELL_W;
    const y = top + Math.floor(n / 4) * CELL_H;
    return [x / ATLAS_W, 1 - (y + CELL_H) / c.height, (x + CELL_W) / ATLAS_W, 1 - y / c.height];
  };
  return { tex: t, uvRow, uvPoster };
}

export function createBrandStores(scene: THREE.Scene, world: RAPIER.World) {
  const k = createKit(world, [['', '', '#000000', '#000000']]);
  const { box, shape } = k;
  const glass = new GeoBuilder();
  const flat = new GeoBuilder(); // letters + posters (atlas)
  const atlas = buildAtlas();
  let row = 0;
  let garment = 0;

  /** A flat atlas quad facing the road: centred at u, bottom at y, standing at depth v. */
  const decal = (f: Frame, uv: number[], u: number, y: number, v: number, w: number, h: number) => {
    const [u0, v0, u1, v1] = uv;
    const out = f.at(0, -1).sub(f.at(0, 0));
    flat.quad(f.at(u + w / 2, v, y), f.at(u - w / 2, v, y), f.at(u - w / 2, v, y + h), f.at(u + w / 2, v, y + h), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], WHITE, out);
  };
  const pane = (f: Frame, u: number, y: number, v: number, w: number, h: number, tint = 0xd6ecf7) => {
    const p = f.at(u, v);
    glass.box(w, h, 0.04, p.x, y + h / 2, p.z, C(tint), f.yaw);
  };
  /** A mannequin (dressed in c) standing at (u, v) on floor height y. */
  const mannequin = (f: Frame, u: number, y: number, v: number, c: THREE.Color, dress: boolean) => {
    box(f, 0.5, 0.08, 0.5, u, y, v, C(0xffffff), false);
    if (dress) shape(f, new THREE.CylinderGeometry(0.14, 0.34, 1.05, 8).translate(0, 0.53, 0), u, y + 0.08, v, c);
    else {
      shape(f, new THREE.CylinderGeometry(0.09, 0.11, 0.85, 6).translate(-0.1, 0.43, 0), u, y + 0.08, v, CLOTHES[8]);
      shape(f, new THREE.CylinderGeometry(0.09, 0.11, 0.85, 6).translate(0.1, 0.43, 0), u, y + 0.08, v, CLOTHES[0]);
    }
    shape(f, new THREE.CylinderGeometry(0.15, 0.14, 0.55, 8).translate(0, 0.28, 0), u, y + 0.95, v, c);
    shape(f, new THREE.SphereGeometry(0.1, 8, 6), u, y + 1.62, v, SKIN);
  };
  /** A clothes rail with hanging garments across [-w/2, w/2] at depth v. */
  const rack = (f: Frame, u: number, y: number, v: number, w: number) => {
    box(f, w, 0.04, 0.04, u, y + 1.6, v, C(0x8a8a8a), false);
    for (let x = u - w / 2 + 0.25; x < u + w / 2 - 0.2; x += 0.38) box(f, 0.32, 0.8, 0.06, x, y + 0.78, v, CLOTHES[(garment++ * 7) % CLOTHES.length], false);
  };
  const plant = (f: Frame, u: number, v: number, s = 1) => {
    box(f, 0.6 * s, 0.6 * s, 0.6 * s, u, 0, v, POT, false);
    shape(f, new THREE.IcosahedronGeometry(0.55 * s, 0).scale(1, 1.3, 1), u, 0.6 * s + 0.4 * s, v, PLANT);
  };

  STORE_LOTS().forEach((lot, i) => {
    const s = STORES[i % STORES.length];
    const f = frame(lot);
    const nameRow = row++;
    const cinemaRow = s.cinema ? row++ : -1;
    if (s.look === 'mall') mall(f, s, nameRow, cinemaRow, i);
    else if (s.look === 'boutique') boutique(f, s, nameRow);
    else brand(f, s, nameRow, i);
  });

  /** Big department store with a cinema on top (like the old Chennai ones). */
  function mall(f: Frame, s: (typeof STORES)[number], nameRow: number, cinemaRow: number, i: number) {
    const { w, d } = f;
    const bw = w - 1;
    const fv = 4; // facade line: a forecourt in front
    const H = 24;
    const accent = C(s.accent);
    box(f, bw, H, d - fv, 0, 0, fv + (d - fv) / 2, CREAM); // the block
    // Rustication: thin shaded grooves every 0.7 m up the facade.
    for (let y = 0.7; y < H - 3; y += 0.7) box(f, bw, 0.06, 0.04, 0, y, fv - 0.02, CREAM_D, false);
    // Forecourt paving, a step, lantern posts, gate kiosks.
    box(f, bw, 0.12, fv, 0, 0, fv / 2, C(0xb7ad9c), false);
    box(f, bw, 0.25, 0.8, 0, 0, fv - 0.4, C(0xa59a87), false);
    for (const u of [-bw / 2 + 2, -6, 6, bw / 2 - 2]) {
      shape(f, new THREE.CylinderGeometry(0.09, 0.14, 4.2, 8).translate(0, 2.1, 0), u, 0, 1.2, DARK);
      for (const sg of [-1, 1]) {
        box(f, 0.7, 0.05, 0.05, u + sg * 0.35, 3.9, 1.2, DARK, false);
        k.shape(f, new THREE.CylinderGeometry(0.16, 0.12, 0.42, 6).translate(0, 0.21, 0), u + sg * 0.68, 3.45, 1.2, C(0xfff0c0), 0, k.bulbs);
        shape(f, new THREE.ConeGeometry(0.22, 0.22, 6).translate(0, 0.11, 0), u + sg * 0.68, 3.87, 1.2, DARK);
      }
      k.solid(f, 0.3, 4, 0.3, u, 0, 1.2);
    }
    for (const sg of [-1, 1]) {
      box(f, 2.2, 2.6, 1.6, sg * (bw / 2 - 1.6), 0, 2.6, C(0x2e4a3a)); // security kiosk
      box(f, 2.6, 0.2, 2, sg * (bw / 2 - 1.6), 2.6, 2.6, DARK, false);
    }

    // Ground + first floor: arched bays with posters behind glass; the middle bay is the entrance.
    const bays = 5;
    const bayW = bw / bays;
    for (let b = 0; b < bays; b++) {
      const u = -bw / 2 + (b + 0.5) * bayW;
      const main = b === Math.floor(bays / 2);
      const ow = main ? bayW - 1.6 : bayW - 2.6; // opening width
      const oh = main ? 6.8 : 5.2;
      const y0 = main ? 0.25 : 1.2;
      // Recess (dark), poster / glass, the arch head (half disc), mouldings.
      box(f, ow, oh, 0.3, u, y0, fv + 0.1, C(0x2b2b2b), false);
      if (main) {
        k.shape(f, new THREE.BoxGeometry(ow - 0.4, 3, 0.05).translate(0, 1.5, 0), u, y0, fv - 0.05, INTERIOR, 0, k.bulbs);
        decal(f, atlas.uvPoster(3 + (i % 3)), u, y0 + 3.4, fv - 0.06, ow - 1.2, (ow - 1.2) * 1.25);
        pane(f, u, y0, fv - 0.1, ow - 0.4, 3);
        box(f, ow + 1.6, 0.25, 2.4, u, 3.3, fv - 1.2, DARK, false); // canopy over the doors
      } else {
        decal(f, atlas.uvPoster((b + i) % 3), u, y0 + 0.2, fv - 0.06, ow - 0.4, oh - 0.4);
        pane(f, u, y0, fv - 0.1, ow, oh);
      }
      shape(f, new THREE.CylinderGeometry(ow / 2, ow / 2, 0.3, 16).rotateX(Math.PI / 2), u, y0 + oh, fv + 0.1, C(0x2b2b2b)); // arch head (lower half hides behind the glass)
      // Ornate frame: piers either side and a keystone.
      for (const sg of [-1, 1]) box(f, 0.45, oh + ow / 2, 0.35, u + sg * (ow / 2 + 0.22), y0 - 0.2, fv - 0.15, ORNATE, false);
      box(f, 0.7, 0.9, 0.4, u, y0 + oh + ow / 2 - 0.1, fv - 0.18, ORNATE, false);
    }

    // Name band (navy / maroon) wrapping the front, letters on it, lit edge below.
    box(f, bw + 0.2, 2.2, 0.6, 0, 11.4, fv - 0.25, accent, false);
    const nw = Math.min(14, bw / 2.6);
    for (const u of [-bw / 3, bw / 3]) decal(f, atlas.uvRow(nameRow), u, 11.55, fv - 0.57, nw, nw / 8 * 1.6);
    k.shape(f, new THREE.BoxGeometry(bw + 0.2, 0.1, 0.1), 0, 11.3, fv - 0.55, C(0xffffff), 0, k.bulbs);
    // Upper floors: framed posters either side and the cinema logo box in the middle.
    for (const sg of [-1, 1]) {
      const u = sg * bw * 0.3;
      box(f, 6.4, 6.6, 0.3, u, 14.6, fv - 0.15, ORNATE, false);
      decal(f, atlas.uvPoster(sg > 0 ? 4 : 1), u, 14.9, fv - 0.32, 4.8, 6);
    }
    box(f, 9, 4.2, 1, 0, 15.4, fv - 0.5, C(0x101820), false); // cinema box
    decal(f, atlas.uvRow(cinemaRow), 0, 16.6, fv - 1.02, 8, 1.6);
    k.shape(f, new THREE.BoxGeometry(8.4, 0.12, 0.1), 0, 15.7, fv - 1.03, C(0xffc107), 0, k.bulbs);
    k.shape(f, new THREE.BoxGeometry(8.4, 0.12, 0.1), 0, 19.0, fv - 1.03, C(0xffc107), 0, k.bulbs);
    // Cornice, balustrade, corner pavilions.
    box(f, bw + 0.8, 0.6, 1.2, 0, H - 2.2, fv - 0.3, ORNATE, false);
    for (let u = -bw / 2 + 0.6; u < bw / 2 - 0.4; u += 0.7) box(f, 0.22, 0.9, 0.22, u, H, fv + 0.2, ORNATE, false);
    box(f, bw, 0.2, 0.5, 0, H + 0.9, fv + 0.2, ORNATE, false);
    for (const sg of [-1, 1]) {
      box(f, 4, 3, 4, sg * (bw / 2 - 2), H, fv + 2, CREAM);
      shape(f, new THREE.SphereGeometry(1.6, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), sg * (bw / 2 - 2), H + 3, fv + 2, ORNATE);
    }
  }

  /** White two-storey boutique: serif letters, wavy band, framed display windows, plants. */
  function boutique(f: Frame, s: (typeof STORES)[number], nameRow: number) {
    const { w, d } = f;
    const bw = w - 0.6;
    const fv = 1.6;
    const H = 8.6;
    const frameC = C(s.accent);
    const room = 2.2; // display depth behind the glass
    box(f, bw, H, d - fv - room, 0, 0, fv + room + (d - fv - room) / 2, WHITE);
    box(f, bw, H - 4.2, room, 0, 4.2, fv + room / 2, WHITE); // first floor over the display room
    box(f, bw, 0.4, room, 0, 0, fv + room / 2, C(0xd8d2c6), false); // display floor
    k.shape(f, new THREE.BoxGeometry(bw - 1, 3.6, 0.05).translate(0, 1.8, 0), 0, 0.4, fv + room - 0.03, C(0xf3efe6), 0, k.bulbs);
    // Two windows in thick pale frames, a wood-and-glass door between.
    const win = (bw - 3.6) / 2;
    for (const sg of [-1, 1]) {
      const u = sg * (1.8 + win / 2);
      box(f, win + 0.5, 0.35, 0.3, u, 0.4, fv - 0.1, frameC, false);
      box(f, win + 0.5, 0.35, 0.3, u, 3.55, fv - 0.1, frameC, false);
      for (const e of [-1, 1]) box(f, 0.3, 3.5, 0.3, u + e * (win / 2 + 0.1), 0.4, fv - 0.1, frameC, false);
      pane(f, u, 0.75, fv, win - 0.2, 2.8);
      k.solid(f, win, 3.6, 0.2, u, 0, fv);
      mannequin(f, u - win * 0.22, 0.4, fv + 0.9, CLOTHES[(nameRow + (sg > 0 ? 4 : 7)) % CLOTHES.length], true);
      mannequin(f, u + win * 0.22, 0.4, fv + 1.1, CLOTHES[(nameRow + (sg > 0 ? 1 : 9)) % CLOTHES.length], true);
      plant(f, u + win * 0.42, fv + 1.5, 0.8);
      box(f, 0.5, 0.9, 0.5, u, 0.4, fv + 1.5, C(0xffffff), false); // birdcage-white display stand
    }
    box(f, 3.2, 3.4, 0.2, 0, 0, fv + room - 0.1, C(0x5d4037)); // door
    pane(f, 0, 0.3, fv + room - 0.22, 2.2, 2.8, 0xc9e3ea);
    box(f, bw, 0.25, 1.1, 0, 4.15, fv - 0.5, WHITE, false); // slim sunshade over the windows
    // Wavy relief band and the name.
    for (let u = -bw / 2 + 0.4; u < bw / 2 - 0.2; u += 0.8) {
      shape(f, new THREE.TorusGeometry(0.28, 0.06, 4, 10, Math.PI), u, 5.3, fv - 0.02, C(0xe6e2d8));
    }
    decal(f, atlas.uvRow(nameRow), 0, 6.1, fv - 0.04, Math.min(bw - 2, 11), Math.min(bw - 2, 11) / 8 * 1.1);
    // Little upstairs windows, parapet, front planting strip.
    for (const sg of [-1, 1]) {
      box(f, 1.6, 1.1, 0.06, sg * (bw / 2 - 1.8), 6.4, fv - 0.03, C(0x5e6f74), false);
    }
    box(f, bw, 0.6, d - fv, 0, H, fv + (d - fv) / 2, WHITE, false);
    box(f, bw - 1, 0.35, 1.1, 0, 0, 0.7, C(0x9e9384), false);
    for (let u = -bw / 2 + 0.8; u < bw / 2 - 0.5; u += 1.1) {
      if (Math.abs(u) < 1.8) continue; // keep the door clear
      shape(f, new THREE.IcosahedronGeometry(0.42, 0).scale(1, 0.8, 1), u, 0.55, 0.7, PLANT);
    }
    k.tree(f, bw / 2 - 0.5, 0.6, 0.7);
  }

  /** Brand outlet: glazed ground floor up some steps, deep wood fascia with letters and downlights. */
  function brand(f: Frame, s: (typeof STORES)[number], nameRow: number, i: number) {
    const { w, d } = f;
    const bw = w - 0.6;
    const fv = 2.4; // shopfront line (steps in front)
    const plinth = 0.75;
    const G = 4.4; // ground floor height above the plinth
    const H = plinth + G + 2 * 3.6;
    const wood = C(s.accent);
    const room = 4.5;
    box(f, bw, H, d - fv - room, 0, 0, fv + room + (d - fv - room) / 2, C(0xe8e3da));
    box(f, bw, H - plinth - G, room, 0, plinth + G, fv + room / 2, C(0xe8e3da));
    box(f, bw, plinth, room + 0.5, 0, 0, fv + room / 2 - 0.25, C(0x9a9a96)); // raised floor
    // Steps (terracotta) across the middle, plain ramps either side.
    for (let n = 0; n < 3; n++) box(f, 6, plinth * (3 - n) / 3, 0.45, 0, 0, fv - 0.25 - n * 0.45, C(0x9c4a38), n === 0);
    for (const sg of [-1, 1]) box(f, (bw - 6) / 2, plinth, 1.4, sg * (3 + (bw - 6) / 4), 0, fv - 0.7, C(0xb9b3a8));
    // Inside: a bright back wall with shelves, racks, a table of folded shirts, mannequins at the glass.
    const y = plinth;
    k.shape(f, new THREE.BoxGeometry(bw - 1, G - 0.4, 0.05).translate(0, (G - 0.4) / 2, 0), 0, y, fv + room - 0.03, INTERIOR, 0, k.bulbs);
    for (let sh = 0; sh < 3; sh++) box(f, bw - 2, 0.05, 0.4, 0, y + 0.8 + sh * 0.7, fv + room - 0.25, C(0x6d4c41), false);
    for (let u = -bw / 2 + 1.3; u < bw / 2 - 1; u += 0.5) box(f, 0.4, 0.25, 0.3, u, y + 0.85 + ((u * 3) & 1) * 0.7, fv + room - 0.25, CLOTHES[(garment++ * 3) % CLOTHES.length], false);
    rack(f, -bw / 4, y, fv + room - 1.4, bw / 2 - 1.5);
    rack(f, bw / 4, y, fv + room - 1.4, bw / 2 - 1.5);
    box(f, 2, 0.8, 1, 0, y, fv + 2.2, C(0x5d4037), false);
    for (let n = 0; n < 4; n++) box(f, 0.4, 0.1, 0.35, -0.6 + n * 0.4, y + 0.8, fv + 2.2, CLOTHES[(n + i) % CLOTHES.length], false);
    for (const u of [-bw / 2 + 1.4, -bw / 2 + 2.6, bw / 2 - 2.6, bw / 2 - 1.4]) mannequin(f, u, y, fv + 0.8, CLOTHES[(garment++ * 5) % CLOTHES.length], false);
    // Glass front: full width, door in the middle, thin black mullions.
    pane(f, 0, y, fv, bw - 0.8, G - 0.3);
    k.solid(f, bw, G, 0.2, 0, y, fv);
    for (const u of [-bw / 2 + 0.4, -1.2, 1.2, bw / 2 - 0.4]) box(f, 0.07, G - 0.3, 0.07, u, y, fv, DARK, false);
    // Accent side pillar (yellow on the left, like the neighbour's) and a tall offer banner.
    box(f, 0.8, H, 0.8, -bw / 2 + 0.4, 0, fv - 0.2, C(0xf0b400));
    box(f, 1.1, 3.4, 0.25, bw / 2 - 0.9, y, fv - 0.9, C(0xc62828), false);
    decal(f, atlas.uvPoster(2), bw / 2 - 0.9, y + 0.5, fv - 1.04, 1, 1.25);
    // The fascia: a deep wood box over the front, white letters, downlights in its soffit.
    const fy = y + G - 0.2;
    box(f, bw, 2.1, 2.2, 0, fy, fv - 0.6, wood, false);
    for (let u = -bw / 2 + 0.3; u < bw / 2; u += 0.55) box(f, 0.03, 2.1, 0.02, u, fy, fv - 1.71, C(s.accent).multiplyScalar(0.75), false); // cladding joints
    decal(f, atlas.uvRow(nameRow), 0, fy + 0.35, fv - 1.73, Math.min(bw - 1.5, 11), Math.min(bw - 1.5, 11) / 8 * 1.25);
    for (let u = -bw / 2 + 1; u < bw / 2 - 0.5; u += 1.6) {
      for (const v of [fv - 1.3, fv + 0.2]) k.shape(f, new THREE.CylinderGeometry(0.09, 0.09, 0.03, 8), u, fy - 0.03, v, C(0xffffff), 0, k.bulbs);
    }
    // Upper floors: a band of windows each, a parapet.
    for (let fl = 0; fl < 2; fl++) {
      const wy = fy + 2.6 + fl * 3.6;
      box(f, bw - 2.4, 1.6, 0.06, 0.4, wy, fv - 0.02, C(0x55656b), false);
      box(f, bw - 2, 0.15, 0.5, 0.4, wy - 0.15, fv - 0.15, C(0xd6d0c4), false);
    }
    box(f, bw, 0.7, d - fv, 0, H, fv + (d - fv) / 2, C(0xd6d0c4), false);
  }

  const glassMesh = new THREE.Mesh(glass.build(), new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.4, depthWrite: false }));
  glassMesh.renderOrder = 1;
  const flatMat = new THREE.MeshStandardMaterial({ map: atlas.tex, emissiveMap: atlas.tex, emissive: 0xffffff, emissiveIntensity: 0.08, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.6 });
  scene.add(glassMesh, new THREE.Mesh(flat.build(), flatMat));
  const setKit = k.build(scene);
  return {
    setNight(night: number) {
      setKit(night);
      flatMat.emissiveIntensity = 0.08 + night * 0.7;
    },
  };
}
