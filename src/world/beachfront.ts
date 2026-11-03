import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Eatery } from './eateries';
import { PLACE_MENUS } from './food';
import { GeoBuilder } from './geo';
import { createKit, frame, type SignDef } from './kit';
import { BEACHFRONT_LOTS } from './layout';

/**
 * Big beachfront shops and restaurants on the Beach Road facing Elliot's / Santhome beach, built
 * like the modern Chennai storefronts: a grey cladding top with a frame, a big poster banner, a
 * two-part name board (the name on white, a tagline on a colour panel), a glass ground floor with
 * a lit interior and an arched entrance under a canopy, steps, railings. Invented names.
 * Draw calls: kit (3), posters (1), glass (1).
 */

type Menu = keyof typeof PLACE_MENUS;
/** Order matches layout.BEACHFRONT_LOTS. menu = a restaurant (E to order), null = a shop. */
export const BEACHFRONT: { name: string; ta: string; tag: string; colour: string; panel: string; menu: Menu | null; poster: [string, string, string] }[] = [
  { name: 'Kadal Kitchen', ta: 'கடல் கிச்சன்', tag: 'SEAFOOD · SEA VIEW', colour: '#0d5c8a', panel: '#00838f', menu: 'seafood', poster: ['FRESH CATCH', 'Seer fish · Prawns · Crab', '#0277bd'] },
  { name: 'Dum Pukht Biryani', ta: 'தம் பிரியாணி', tag: 'SINCE 1987', colour: '#7a1f1f', panel: '#b8860b', menu: 'biryani', poster: ['BIRYANI FEST', 'Chicken · Mutton · Prawn', '#c0392b'] },
  { name: 'Chettinad Junction', ta: 'செட்டிநாடு ஜங்ஷன்', tag: 'MEALS · PAROTTA', colour: '#8a3b12', panel: '#2e7d32', menu: 'chettinad', poster: ['KAARAM SPECIAL', 'Pepper chicken · Kothu', '#e65100'] },
  { name: 'Scoops & Shakes', ta: 'ஸ்கூப்ஸ் & ஷேக்ஸ்', tag: 'ICE CREAM · WAFFLES', colour: '#d81b60', panel: '#6a1b9a', menu: 'icecream', poster: ['SUMMER SUNDAES', 'Buy 1 Get 1 · 4-7 pm', '#ec407a'] },
  { name: 'kuttykart', ta: 'குட்டிகார்ட்', tag: '0-12 YEARS', colour: '#e53935', panel: '#5e35b1', menu: null, poster: ['MEGA SALE', 'Kids wear · Toys · Up to 50% off', '#1e88e5'] },
  { name: 'Shore Story', ta: 'ஷோர் ஸ்டோரி', tag: 'BEACHWEAR · SUNGLASSES', colour: '#00897b', panel: '#f57c00', menu: null, poster: ['NEW ARRIVALS', 'Linen · Hats · Flip-flops', '#26a69a'] },
];

const C = (hex: number) => new THREE.Color(hex);
const CLADDING = C(0x8e9196);
const FRAME = C(0xd9dadc);
const STONE = C(0xc9c3b6);
const DARK = C(0x2b2b2b);
const INTERIOR = C(0xfff0d6);
const WOOD = C(0x7a5534);
const G = 4.4; // ground floor height
const H = 15; // building height
const POSTER_ROW = 160;

/** One poster per shop: a bold gradient, shapes standing in for photos, a headline and a line. */
function posterAtlas() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = POSTER_ROW * BEACHFRONT.length;
  const g = c.getContext('2d')!;
  BEACHFRONT.forEach((s, i) => {
    const y = i * POSTER_ROW;
    const grad = g.createLinearGradient(0, y, 1024, y + POSTER_ROW);
    grad.addColorStop(0, s.poster[2]);
    grad.addColorStop(1, '#1a1a2e');
    g.fillStyle = grad;
    g.fillRect(0, y, 1024, POSTER_ROW);
    // "Photos": three rounded silhouettes / plates on the right.
    for (let k = 0; k < 3; k++) {
      g.fillStyle = ['#ffd54f', '#ffffff', '#ff8a65'][k];
      g.beginPath();
      g.arc(660 + k * 120, y + 92, 48 - k * 4, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#00000033';
      g.beginPath();
      g.arc(660 + k * 120, y + 92, 30 - k * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.fillStyle = '#ffffff';
    g.textBaseline = 'middle';
    g.font = '900 64px "Segoe UI", system-ui, sans-serif';
    g.fillText(s.poster[0], 32, y + 58, 560);
    g.font = '600 30px system-ui, sans-serif';
    g.fillText(s.poster[1], 34, y + 118, 560);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export function createBeachfront(scene: THREE.Scene, world: RAPIER.World) {
  // Sign rows: 2i = name (white board, brand colour), 2i + 1 = tagline (white on the panel colour).
  const signs: SignDef[] = BEACHFRONT.flatMap((s): SignDef[] => [[s.ta, s.name.toUpperCase(), '#ffffff', s.colour], ['', s.tag, s.panel, '#ffffff']]);
  const k = createKit(world, signs);
  const { box, board, shape } = k;
  const posters = new GeoBuilder();
  const glass = new GeoBuilder();
  const eateries: Eatery[] = [];

  BEACHFRONT_LOTS().forEach((lot, i) => {
    const s = BEACHFRONT[i % BEACHFRONT.length];
    const f = frame(lot);
    const { w, d } = f;
    const front = 2.4; // facade line; steps and railings in front
    const bw = w - 1;
    const out = f.at(0, -1).sub(f.at(0, 0));

    // Forecourt: paving, steps, a railing with a gap at the steps.
    box(f, w, 0.12, front, 0, 0, front / 2, STONE, false);
    box(f, 7, 0.3, 1, 0, 0, front - 0.5, STONE, false);
    for (const sg of [-1, 1]) {
      const rw = (w - 9) / 2;
      box(f, rw, 0.05, 0.05, sg * (4.5 + rw / 2), 0.95, 0.3, DARK, false);
      for (let u = 4.5; u <= 4.5 + rw; u += 1.2) box(f, 0.05, 0.95, 0.05, sg * u, 0, 0.3, DARK, false);
    }

    // The block behind the facade.
    box(f, bw, H, d - front - 1.2, 0, 0, front + 1.2 + (d - front - 1.2) / 2, C(0xe8e4dc));
    // Ground floor: lit interior behind glass, an arched entrance, a canopy.
    k.shape(f, new THREE.BoxGeometry(bw - 1, G - 0.4, 0.05).translate(0, (G - 0.4) / 2, 0), 0, 0.12, front + 1.15, INTERIOR, 0, k.bulbs);
    box(f, bw - 1, 0.1, 1.2, 0, 0.12, front + 0.6, C(0xd8d2c6), false); // floor
    for (let u = -bw / 2 + 1.5; u < bw / 2 - 1; u += 1.3) {
      if (Math.abs(u) < 2) continue;
      const hue = [0xe53935, 0x1e88e5, 0xfdd835, 0x43a047, 0x8e24aa, 0xff7043][Math.floor((u + 20) * 3) % 6];
      if (s.menu) {
        box(f, 0.7, 0.05, 0.7, u, 0.85, front + 0.7, C(0xffffff), false); // table
        box(f, 0.08, 0.75, 0.08, u, 0.12, front + 0.7, DARK, false);
      } else box(f, 0.5, 1.2, 0.1, u, 0.6, front + 1.05, C(hue), false); // displayed clothes
    }
    for (const sg of [-1, 1]) {
      const pw = (bw - 1 - 4) / 2;
      const p = f.at(sg * (2 + pw / 2), front);
      glass.box(pw, G - 0.4, 0.05, p.x, 0.12 + (G - 0.4) / 2, p.z, C(0xd6ecf7), f.yaw);
      k.solid(f, pw, G, 0.15, sg * (2 + pw / 2), 0, front);
    }
    for (let u = -bw / 2 + 0.5; u <= bw / 2 - 0.5 + 0.01; u += (bw - 1) / 6) box(f, 0.1, G, 0.12, u, 0, front - 0.02, DARK, false);
    // Arched entrance: a curved frame over the doors.
    shape(f, new THREE.TorusGeometry(1.9, 0.14, 6, 18, Math.PI), 0, G - 2.2, front - 0.1, FRAME);
    board(f, 2 * i, 0, G - 0.55, front - 0.25, 3.4, 0.45); // small name over the door
    box(f, bw, 0.25, 1.8, 0, G, front - 0.8, FRAME, false); // canopy
    k.shape(f, new THREE.BoxGeometry(bw - 0.4, 0.04, 0.1), 0, G - 0.03, front - 1.6, C(0xffffff), 0, k.bulbs);

    // Name board: the name on white (two thirds), the tagline on a colour panel (one third).
    const bh = 3.2;
    const by = G + 0.4;
    box(f, bw, bh + 0.3, 0.3, 0, by - 0.15, front - 0.15, FRAME, false);
    board(f, 2 * i, -bw / 6, by, front - 0.32, (bw * 2) / 3 - 0.3, bh);
    board(f, 2 * i + 1, bw / 3, by, front - 0.32, bw / 3 - 0.3, bh);

    // Poster banner above, then the grey cladding top with a light frame.
    const py = by + bh + 0.5;
    const ph = 3.4;
    const v0 = 1 - (i + 1) / BEACHFRONT.length;
    const v1 = 1 - i / BEACHFRONT.length;
    const pa = f.at(bw / 2 - 0.4, front - 0.32, py);
    const pb = f.at(-bw / 2 + 0.4, front - 0.32, py);
    posters.quad(pa, pb, pb.clone().setY(py + ph), pa.clone().setY(py + ph), [[0, v0], [1, v0], [1, v1], [0, v1]], C(0xffffff), out);
    box(f, bw, ph + 0.3, 0.25, 0, py - 0.15, front - 0.15, DARK, false);
    const cy = py + ph + 0.3;
    box(f, bw, H - cy + 0.6, 0.6, 0, cy, front - 0.3, CLADDING, false);
    box(f, bw + 0.3, 0.3, 0.8, 0, H + 0.6, front - 0.3, FRAME, false);
    for (const sg of [-1, 1]) box(f, 0.3, H + 0.9, 0.8, sg * (bw / 2 + 0.05), 0, front - 0.3, FRAME, false);
    for (let y = cy + 1.2; y < H; y += 1.2) box(f, bw - 0.4, 0.04, 0.62, 0, y, front - 0.31, C(0x7b7e83), false); // panel joints

    if (s.menu) {
      const p = f.at(-3, front + 0.9);
      eateries.push({ name: s.name, menu: PLACE_MENUS[s.menu], spot: new THREE.Vector3(p.x, 0.12, p.z), seat: p.clone(), seatYaw: 0, eatYaw: 0, table: p.clone() });
      // The way in: an opening in the glass (no collider) to the counter.
      box(f, 1.4, 1.05, 0.5, -3, 0.12, front + 1.7, WOOD); // counter
    }
  });

  const tex = posterAtlas();
  const posterMat = new THREE.MeshStandardMaterial({ map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.5 });
  const glassMesh = new THREE.Mesh(glass.build(), new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.4, depthWrite: false }));
  glassMesh.renderOrder = 1;
  scene.add(new THREE.Mesh(posters.build(), posterMat), glassMesh);
  const setKit = k.build(scene);
  return {
    eateries,
    setNight(night: number) {
      setKit(night);
      posterMat.emissiveIntensity = 0.1 + night * 0.7;
    },
  };
}
