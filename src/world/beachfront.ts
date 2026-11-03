import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Eatery } from './eateries';
import { PLACE_MENUS } from './food';
import { GeoBuilder } from './geo';
import { createKit, frame, type Frame, type SignDef } from './kit';
import { BEACHFRONT_LOTS } from './layout';

/**
 * Shops and restaurants along the Beach Road facing the sand, in three looks so neighbours
 * never match (invented names):
 * - banner: modern storefront, grey cladding top, big poster banner, two-colour name board,
 *   glass ground floor with an arched entrance;
 * - tower: a tall restaurant building (the big Chennai family-restaurant kind): a carved jali
 *   screen up one side with the logo on top, a cream frame of window bands up the other, a
 *   canopy with the name over the entrance, palms;
 * - small: a pretty two-storey shop: pastel walls, striped awning, wooden door, windows with
 *   flower boxes, string lights, a bench and plants.
 * Draw calls: kit (3), posters (1), jali (1), glass (1).
 */

type Menu = keyof typeof PLACE_MENUS;
type Style = 'banner' | 'tower' | 'small';
/** Order matches layout.BEACHFRONT_LOTS; neighbours (0-1, 2-3, 4-5) always differ in style. */
export const BEACHFRONT: { name: string; ta: string; tag: string; colour: string; panel: string; menu: Menu | null; style: Style; poster?: [string, string, string]; wall?: number }[] = [
  { name: 'Kadal Kitchen', ta: 'கடல் கிச்சன்', tag: 'SEAFOOD · SINCE 1979', colour: '#b71c1c', panel: '#b71c1c', menu: 'seafood', style: 'tower' },
  { name: 'Scoops & Shakes', ta: 'ஸ்கூப்ஸ் & ஷேக்ஸ்', tag: 'ICE CREAM · WAFFLES', colour: '#d81b60', panel: '#6a1b9a', menu: 'icecream', style: 'small', wall: 0xf8d7e3 },
  { name: 'kuttykart', ta: 'குட்டிகார்ட்', tag: '0-12 YEARS', colour: '#e53935', panel: '#5e35b1', menu: null, style: 'banner', poster: ['MEGA SALE', 'Kids wear · Toys · Up to 50% off', '#1e88e5'] },
  { name: 'Dum Pukht Biryani', ta: 'தம் பிரியாணி', tag: 'BIRYANI · BANQUET HALL', colour: '#7a1f1f', panel: '#7a1f1f', menu: 'biryani', style: 'tower' },
  { name: 'Chettinad Junction', ta: 'செட்டிநாடு ஜங்ஷன்', tag: 'MEALS · PAROTTA', colour: '#8a3b12', panel: '#2e7d32', menu: 'chettinad', style: 'small', wall: 0xf3e2b3 },
  { name: 'Shore Story', ta: 'ஷோர் ஸ்டோரி', tag: 'BEACHWEAR · SUNGLASSES', colour: '#00897b', panel: '#f57c00', menu: null, style: 'banner', poster: ['NEW ARRIVALS', 'Linen · Hats · Flip-flops', '#26a69a'] },
  { name: 'Shell & Bead', ta: 'ஷெல் & பீட்', tag: 'HANDMADE JEWELLERY', colour: '#0d5c8a', panel: '#0d5c8a', menu: null, style: 'small', wall: 0xcfe8f2 },
  { name: 'Marina Juice Bar', ta: 'மெரினா ஜூஸ்', tag: 'FRESH JUICE · FALOODA', colour: '#ef6c00', panel: '#ef6c00', menu: 'icecream', style: 'small', wall: 0xfff1c1 },
  { name: 'Coir & Clay', ta: 'கயிறு & களிமண்', tag: 'HOME DECOR · POTTERY', colour: '#6d4c41', panel: '#6d4c41', menu: null, style: 'small', wall: 0xe7d8c9 },
  { name: 'Sundal Stop', ta: 'சுண்டல் ஸ்டாப்', tag: 'SNACKS · SUKKU COFFEE', colour: '#2e7d32', panel: '#2e7d32', menu: 'chettinad', style: 'small', wall: 0xd9ead3 },
];

const C = (hex: number) => new THREE.Color(hex);
const CLADDING = C(0x8e9196);
const FRAME = C(0xd9dadc);
const STONE = C(0xc9c3b6);
const DARK = C(0x2b2b2b);
const INTERIOR = C(0xfff0d6);
const WOOD = C(0x7a5534);
const CREAM = C(0xefe3cc);
const TRIM = C(0x9a6b4a);
const PLANT = C(0x3f7f35);
const POT = C(0xb5552f);
const BULBS = [C(0xfff1c1), C(0xffd27a), C(0xffe9a8)];
const POSTER_ROW = 160;

/** One poster per banner shop: a bold gradient, shapes standing in for photos, a headline and a line. */
function posterAtlas() {
  const rows = BEACHFRONT.filter((s) => s.poster);
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = POSTER_ROW * rows.length;
  const g = c.getContext('2d')!;
  rows.forEach((s, i) => {
    const [head, line, colour] = s.poster!;
    const y = i * POSTER_ROW;
    const grad = g.createLinearGradient(0, y, 1024, y + POSTER_ROW);
    grad.addColorStop(0, colour);
    grad.addColorStop(1, '#1a1a2e');
    g.fillStyle = grad;
    g.fillRect(0, y, 1024, POSTER_ROW);
    for (let k = 0; k < 3; k++) {
      g.fillStyle = ['#ffd54f', '#ffffff', '#ff8a65'][k];
      g.beginPath();
      g.arc(660 + k * 120, y + 92, 48 - k * 4, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffffff';
    g.textBaseline = 'middle';
    g.font = '900 64px "Segoe UI", system-ui, sans-serif';
    g.fillText(head, 32, y + 58, 560);
    g.font = '600 30px system-ui, sans-serif';
    g.fillText(line, 34, y + 118, 560);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return { tex: t, rows: rows.length, rowOf: (s: (typeof BEACHFRONT)[number]) => rows.indexOf(s) };
}

/** A carved jali screen: cream stone with a lattice of diamond and star holes (tiles 1 m square). */
function jaliTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#d8ccb4';
  g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#3a3128';
  for (const [x, y] of [[32, 32], [96, 32], [32, 96], [96, 96], [64, 64], [0, 64], [64, 0], [128, 64], [64, 128], [0, 0], [128, 0], [0, 128], [128, 128]]) {
    g.beginPath();
    g.moveTo(x, y - 18);
    g.lineTo(x + 12, y);
    g.lineTo(x, y + 18);
    g.lineTo(x - 12, y);
    g.closePath();
    g.fill();
  }
  g.fillStyle = '#c4b698';
  for (let k = 0; k <= 128; k += 32) {
    g.fillRect(k - 1, 0, 2, 128);
    g.fillRect(0, k - 1, 128, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function createBeachfront(scene: THREE.Scene, world: RAPIER.World) {
  // Sign rows: 2i = name, 2i + 1 = tagline.
  const signs: SignDef[] = BEACHFRONT.flatMap((s): SignDef[] => [
    [s.ta, s.name.toUpperCase(), '#ffffff', s.colour],
    ['', s.tag, s.panel, '#ffffff'],
  ]);
  const k = createKit(world, signs);
  const { box, board, shape } = k;
  const posterGeo = new GeoBuilder();
  const jaliGeo = new GeoBuilder();
  const glass = new GeoBuilder();
  const atlas = posterAtlas();
  const eateries: Eatery[] = [];

  /** A textured quad facing the road, from (u0, y0) to (u1, y1) at depth v; UVs repeat per metre (jali) or span a row (poster). */
  const facing = (target: GeoBuilder, f: Frame, u0: number, u1: number, y0: number, y1: number, v: number, uv: number[][]) => {
    const out = f.at(0, -1).sub(f.at(0, 0));
    const a = f.at(u1, v, y0);
    const b = f.at(u0, v, y0);
    target.quad(a, b, b.clone().setY(y1), a.clone().setY(y1), uv, C(0xffffff), out);
  };
  const glassPane = (f: Frame, u: number, y: number, v: number, w: number, h: number) => {
    const p = f.at(u, v);
    glass.box(w, h, 0.05, p.x, y + h / 2, p.z, C(0xd6ecf7), f.yaw);
  };
  const potted = (f: Frame, u: number, v: number, s = 1) => {
    shape(f, new THREE.CylinderGeometry(0.32 * s, 0.24 * s, 0.6 * s, 10).translate(0, 0.3 * s, 0), u, 0.12, v, POT);
    shape(f, new THREE.IcosahedronGeometry(0.5 * s, 0), u, 0.12 + 0.9 * s, v, PLANT);
  };
  const palm = (f: Frame, u: number, v: number, h = 5) => {
    shape(f, new THREE.CylinderGeometry(0.14, 0.22, h, 7).translate(0, h / 2, 0), u, 0, v, C(0x7a5a3a));
    for (let a = 0; a < 6; a++) shape(f, new THREE.ConeGeometry(0.45, 2.8, 4).rotateZ(Math.PI / 2 - 0.35).translate(1.3, 0, 0), u, h, v, C(0x2f7a32), (a / 6) * Math.PI * 2);
    k.solid(f, 0.4, h, 0.4, u, 0, v);
  };

  BEACHFRONT_LOTS().forEach((lot, i) => {
    const s = BEACHFRONT[i % BEACHFRONT.length];
    const f = frame(lot);
    const { w, d } = f;
    const bw = w - 1;
    let orderAt: [number, number] = [-3, 3.3];

    if (s.style === 'banner') {
      const front = 2.4;
      const G = 4.4;
      const H = 15;
      box(f, w, 0.12, front, 0, 0, front / 2, STONE, false);
      box(f, 7, 0.3, 1, 0, 0, front - 0.5, STONE, false);
      for (const sg of [-1, 1]) {
        const rw = (w - 9) / 2;
        box(f, rw, 0.05, 0.05, sg * (4.5 + rw / 2), 0.95, 0.3, DARK, false);
        for (let u = 4.5; u <= 4.5 + rw; u += 1.2) box(f, 0.05, 0.95, 0.05, sg * u, 0, 0.3, DARK, false);
      }
      box(f, bw, H, d - front - 1.2, 0, 0, front + 1.2 + (d - front - 1.2) / 2, C(0xe8e4dc));
      k.shape(f, new THREE.BoxGeometry(bw - 1, G - 0.4, 0.05).translate(0, (G - 0.4) / 2, 0), 0, 0.12, front + 1.15, INTERIOR, 0, k.bulbs);
      box(f, bw - 1, 0.1, 1.2, 0, 0.12, front + 0.6, C(0xd8d2c6), false);
      for (let u = -bw / 2 + 1.5; u < bw / 2 - 1; u += 1.3) {
        if (Math.abs(u) < 2) continue;
        box(f, 0.5, 1.2, 0.1, u, 0.6, front + 1.05, C([0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0x8e24aa, 0xff7043][Math.floor((u + 20) * 3) % 6]), false);
      }
      for (const sg of [-1, 1]) {
        const pw = (bw - 1 - 4) / 2;
        glassPane(f, sg * (2 + pw / 2), 0.12, front, pw, G - 0.4);
        k.solid(f, pw, G, 0.15, sg * (2 + pw / 2), 0, front);
      }
      for (let u = -bw / 2 + 0.5; u <= bw / 2 - 0.5 + 0.01; u += (bw - 1) / 6) box(f, 0.1, G, 0.12, u, 0, front - 0.02, DARK, false);
      shape(f, new THREE.TorusGeometry(1.9, 0.14, 6, 18, Math.PI), 0, G - 2.2, front - 0.1, FRAME);
      box(f, bw, 0.25, 1.8, 0, G, front - 0.8, FRAME, false);
      const bh = 3.2;
      const by = G + 0.4;
      box(f, bw, bh + 0.3, 0.3, 0, by - 0.15, front - 0.15, FRAME, false);
      board(f, 2 * i, -bw / 6, by, front - 0.32, (bw * 2) / 3 - 0.3, bh);
      board(f, 2 * i + 1, bw / 3, by, front - 0.32, bw / 3 - 0.3, bh);
      const py = by + bh + 0.5;
      const ph = 3.4;
      const row = atlas.rowOf(s);
      const v0 = 1 - (row + 1) / atlas.rows;
      const v1 = 1 - row / atlas.rows;
      facing(posterGeo, f, -bw / 2 + 0.4, bw / 2 - 0.4, py, py + ph, front - 0.32, [[0, v0], [1, v0], [1, v1], [0, v1]]);
      box(f, bw, ph + 0.3, 0.25, 0, py - 0.15, front - 0.15, DARK, false);
      const cy = py + ph + 0.3;
      box(f, bw, H - cy + 0.6, 0.6, 0, cy, front - 0.3, CLADDING, false);
      box(f, bw + 0.3, 0.3, 0.8, 0, H + 0.6, front - 0.3, FRAME, false);
      for (const sg of [-1, 1]) box(f, 0.3, H + 0.9, 0.8, sg * (bw / 2 + 0.05), 0, front - 0.3, FRAME, false);
      for (let y = cy + 1.2; y < H; y += 1.2) box(f, bw - 0.4, 0.04, 0.62, 0, y, front - 0.31, C(0x7b7e83), false);
      orderAt = [-3, front + 0.9];
    } else if (s.style === 'tower') {
      // ---- Tall restaurant: jali screen (left), window-band frame (right), canopy below ----
      const front = 3.2;
      const G = 4.6;
      const H = 22;
      const jw = bw * 0.42; // jali width
      const ju = -bw / 2 + jw / 2;
      const fu = jw / 2; // frame centre (right part)
      const fw = bw - jw;
      box(f, w, 0.12, front, 0, 0, front / 2, STONE, false);
      box(f, bw, H, d - front - 0.6, 0, 0, front + 0.6 + (d - front - 0.6) / 2, C(0xd9cdb5));
      // Jali screen standing off the wall, from above the canopy to the top; the logo on it.
      facing(jaliGeo, f, -bw / 2, -bw / 2 + jw, G + 0.6, H + 1.5, front + 0.1, [[0, 0], [jw, 0], [jw, H + 0.9 - G], [0, H + 0.9 - G]]);
      box(f, jw + 0.3, 0.3, 0.5, ju, H + 1.5, front + 0.15, CREAM, false);
      box(f, jw - 0.6, 2.2, 0.15, ju, H - 2.4, front, C(0xffffff), false);
      board(f, 2 * i, ju, H - 2.3, front - 0.1, jw - 0.9, 2);
      shape(f, new THREE.CylinderGeometry(0.75, 0.75, 0.1, 20).rotateX(Math.PI / 2), ju - jw / 2 + 1.2, H - 1.3, front - 0.15, C(parseInt(s.colour.slice(1), 16)));
      // Frame of window bands: cream border, a brown inner frame, glass + blinds per floor.
      box(f, fw, H, 0.6, fu + 0.0, 0, front + 0.3, CREAM, false);
      box(f, fw - 1.2, H - G - 1.6, 0.2, fu, G + 0.6, front - 0.05, TRIM, false);
      for (let y = G + 1; y < H - 1.5; y += 3.6) {
        k.shape(f, new THREE.BoxGeometry(fw - 2, 2.2, 0.05).translate(0, 1.1, 0), fu, y, front - 0.17, C(0xe9e4d8), 0, (Math.floor(y) % 2 ? k.bulbs : k.geo));
        for (let b = 0.3; b < 2.2; b += 0.28) box(f, fw - 2, 0.03, 0.06, fu, y + b, front - 0.2, C(0xb0aa9c), false); // blinds
        box(f, fw - 1.4, 0.3, 0.5, fu, y - 0.4, front - 0.2, CREAM, false);
      }
      board(f, 2 * i + 1, fu, H - 4.2, front - 0.22, fw - 2.4, 0.8); // e.g. BANQUET HALL
      // Canopy over the ground floor, the name on its front, glass entrance, palms and planters.
      box(f, bw + 0.4, 0.35, 3, 0, G, 1.7, C(0x5a3a22), false);
      k.solid(f, bw + 0.4, 0.35, 3, 0, G, 1.7);
      box(f, bw, 1.1, 0.2, 0, G + 0.35, 0.3, C(0x3a2416), false);
      board(f, 2 * i, -bw / 4, G + 0.4, 0.18, bw / 2 - 1, 1);
      board(f, 2 * i, bw / 4, G + 0.4, 0.18, bw / 2 - 1, 1);
      for (const sg of [-1, 1]) box(f, 0.25, G, 0.25, sg * (bw / 2 - 0.3), 0, 0.4, C(0x5a3a22));
      k.shape(f, new THREE.BoxGeometry(bw - 2, G - 0.6, 0.05).translate(0, (G - 0.6) / 2, 0), 0, 0.12, front + 0.55, C(0xffe0a8), 0, k.bulbs);
      for (const sg of [-1, 1]) {
        const pw = (bw - 2 - 3) / 2;
        glassPane(f, sg * (1.5 + pw / 2), 0.12, front, pw, G - 0.6);
        k.solid(f, pw, G, 0.15, sg * (1.5 + pw / 2), 0, front);
      }
      for (let u = -bw / 2 + 1; u <= bw / 2 - 1 + 0.01; u += (bw - 2) / 6) box(f, 0.12, G - 0.4, 0.14, u, 0, front - 0.03, C(0x3a2416), false);
      for (const sg of [-1, 1]) {
        palm(f, sg * (bw / 2 + 0.2), 1.2, 5.5);
        potted(f, sg * 2.4, front - 0.6);
      }
      orderAt = [-2.2, front + 0.4];
    } else {
      // ---- Small two-storey shop ----
      const sw = Math.min(bw, 11);
      const front = Math.max(2.4, d - 10);
      const G = 3.4;
      const H = 7;
      const wall = C(s.wall ?? 0xf3e2b3);
      const accent = C(parseInt(s.colour.slice(1), 16));
      box(f, w, 0.12, front, 0, 0, front / 2, C(0xd8cbb2), false); // tiled forecourt
      for (let u = -w / 2 + 0.5; u < w / 2; u += 1) box(f, 0.02, 0.005, front, u, 0.12, front / 2, C(0xbfae8c), false);
      box(f, sw, H, d - front, 0, 0, front + (d - front) / 2, wall);
      box(f, sw + 0.4, 0.35, d - front + 0.4, 0, H, front + (d - front) / 2, C(0xffffff), false); // parapet
      for (const sg of [-1, 1]) box(f, 0.35, H, 0.35, sg * (sw / 2 - 0.1), 0, front - 0.05, C(0xffffff), false);
      // Shop window with a warm interior and the door.
      k.shape(f, new THREE.BoxGeometry(sw - 3.4, G - 1, 0.05).translate(0, (G - 1) / 2, 0), -1.1, 0.6, front + 0.3, INTERIOR, 0, k.bulbs);
      glassPane(f, -1.1, 0.6, front, sw - 3.4, G - 1);
      box(f, sw - 3.2, 0.5, 0.25, -1.1, 0.12, front - 0.08, C(0xffffff), false);
      box(f, 1.3, 2.5, 0.1, sw / 2 - 1.3, 0.12, front - 0.03, WOOD, false); // door
      box(f, 0.06, 0.4, 0.08, sw / 2 - 1.8, 1.2, front - 0.1, C(0xc9a24a), false);
      // Striped awning over the front.
      const n = Math.max(6, Math.round(sw / 0.6));
      for (let k2 = 0; k2 < n; k2++) {
        const u = -sw / 2 + (sw / n) * (k2 + 0.5);
        shape(f, new THREE.BoxGeometry(sw / n, 0.05, 1.5).rotateX(-0.4), u, G + 0.15, front - 0.75, k2 % 2 ? C(0xffffff) : accent);
      }
      k.solid(f, sw, 0.3, 1.5, 0, G - 0.1, front - 0.75);
      board(f, 2 * i, 0, G + 0.75, front - 0.05, sw - 1.5, 1);
      // Upstairs: two windows with shutters and flower boxes.
      for (const sg of [-1, 1]) {
        const u = sg * sw / 4;
        box(f, 1.4, 1.4, 0.06, u, G + 1.9, front - 0.03, C(0x3d5a73), false);
        for (const e of [-1, 1]) box(f, 0.5, 1.5, 0.08, u + e * 1, G + 1.85, front - 0.05, accent, false);
        box(f, 1.5, 0.3, 0.35, u, G + 1.6, front - 0.2, WOOD, false);
        for (let fl = 0; fl < 5; fl++) shape(f, new THREE.IcosahedronGeometry(0.13, 0), u - 0.6 + fl * 0.3, G + 1.95, front - 0.22, C([0xe53935, 0xffb300, 0xd81b60, 0xffffff][fl % 4]));
      }
      // String lights across the front, plants, a bench, a small A-board.
      for (let b = 0; b <= 14; b++) {
        const t = b / 14;
        shape(f, new THREE.SphereGeometry(0.07, 6, 4), -sw / 2 + t * sw, G + 0.05 - Math.sin(t * Math.PI) * 0.35, front - 1.55, BULBS[b % 3], 0, k.bulbs);
      }
      potted(f, -sw / 2 + 0.6, front - 0.6);
      potted(f, sw / 2 - 0.6, front - 0.6, 0.8);
      box(f, 1.6, 0.08, 0.45, -1.6, 0.55, 0.8, WOOD, false);
      for (const e of [-0.7, 0.7]) box(f, 0.08, 0.45, 0.4, -1.6 + e, 0.12, 0.8, DARK, false);
      shape(f, new THREE.BoxGeometry(0.6, 0.9, 0.05).rotateX(0.18), 1.6, 0.12, 0.9, C(0x2b2b2b));
      orderAt = [sw / 2 - 1.3, front + 0.2];
    }

    if (s.menu) {
      const p = f.at(orderAt[0], orderAt[1] - 1.2);
      eateries.push({ name: s.name, menu: PLACE_MENUS[s.menu], spot: new THREE.Vector3(p.x, 0.12, p.z), seat: p.clone(), seatYaw: 0, eatYaw: 0, table: p.clone() });
    }
  });

  const posterMat = new THREE.MeshStandardMaterial({ map: atlas.tex, emissiveMap: atlas.tex, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.5 });
  const jaliMat = new THREE.MeshStandardMaterial({ map: jaliTexture(), roughness: 0.95 });
  const glassMesh = new THREE.Mesh(glass.build(), new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.4, depthWrite: false }));
  glassMesh.renderOrder = 1;
  const jali = new THREE.Mesh(jaliGeo.build(), jaliMat);
  jali.castShadow = jali.receiveShadow = true;
  scene.add(new THREE.Mesh(posterGeo.build(), posterMat), jali, glassMesh);
  const setKit = k.build(scene);
  return {
    eateries,
    setNight(night: number) {
      setKit(night);
      posterMat.emissiveIntensity = 0.1 + night * 0.7;
    },
  };
}
