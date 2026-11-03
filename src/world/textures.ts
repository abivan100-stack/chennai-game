import * as THREE from 'three';

/**
 * Small procedural canvas textures for the town (no downloads, a few hundred KB of VRAM).
 * Facade tiles are drawn to a known metre size so geometry can use world-metre UVs.
 */

/** Window facade tile: 2 windows wide x 2 floors high. */
export const FACADE_TILE = { w: 6, h: 6.4 };
/** Shopfront tile: 2 shops wide x 1 floor high. */
export const SHOP_TILE = { w: 6, h: 3.2 };

const SIGNS = [
  { en: 'Kapali Tea Stall', ta: 'கபாலி டீ ஸ்டால்', bg: '#b71c1c', fg: '#fff3c4' },
  { en: 'Lakshmi Medicals', ta: 'லக்ஷ்மி மெடிக்கல்ஸ்', bg: '#0d47a1', fg: '#ffffff' },
  { en: 'Sri Vinayaga Stores', ta: 'ஸ்ரீ விநாயகா ஸ்டோர்ஸ்', bg: '#f9a825', fg: '#3e1b00' },
  { en: 'Mylai Tiffin Centre', ta: 'மயிலை டிஃபன் சென்டர்', bg: '#1b5e20', fg: '#fff8e1' },
  { en: 'Selvi Textiles', ta: 'செல்வி டெக்ஸ்டைல்ஸ்', bg: '#880e4f', fg: '#ffe0f0' },
  { en: 'Anna Mess', ta: 'அண்ணா மெஸ்', bg: '#fafafa', fg: '#c62828' },
  { en: 'Kumaran Mobiles', ta: 'குமரன் மொபைல்ஸ்', bg: '#e65100', fg: '#ffffff' },
  { en: 'Ganesh Flower Shop', ta: 'கணேஷ் பூக்கடை', bg: '#00695c', fg: '#fff59d' },
  { en: 'Hotel Mylai Bhavan', ta: 'ஹோட்டல் மயிலை பவன்', bg: '#ff8f00', fg: '#3e1b00' },
  { en: 'Kapali Bakery', ta: 'கபாலி பேக்கரி', bg: '#6d4c41', fg: '#ffe0b2' },
];
export const SIGN_COUNT = SIGNS.length;
/** Shop names + board colours (the map shows them too). */
export const SHOP_SIGNS: readonly { en: string; bg: string }[] = SIGNS;

function canvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function texture(c: HTMLCanvasElement, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Deterministic noise so textures look the same every load. */
function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

export function asphaltTexture() {
  const [c, g] = canvas(256, 256);
  const rand = seeded(7);
  g.fillStyle = '#46464a';
  g.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 6000; i++) {
    const v = 50 + rand() * 40;
    g.fillStyle = `rgb(${v},${v},${v + 3})`;
    g.fillRect(rand() * 256, rand() * 256, 1 + rand() * 2, 1 + rand() * 2);
  }
  return texture(c);
}

/** Chennai curbs: painted black and yellow, 1 m each. */
export function curbTexture() {
  const [c, g] = canvas(64, 8);
  g.fillStyle = '#f2c200';
  g.fillRect(0, 0, 32, 8);
  g.fillStyle = '#1c1c1c';
  g.fillRect(32, 0, 32, 8);
  return texture(c);
}

/** Paving slabs for the sidewalk tops (1 m tiles). */
export function pavingTexture() {
  const [c, g] = canvas(64, 64);
  g.fillStyle = '#c9c1b0';
  g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#9c9484';
  g.lineWidth = 2;
  g.strokeRect(1, 1, 62, 62);
  return texture(c);
}

/**
 * Residential facade tile (white walls: building colour comes from vertex colours).
 * map + emissiveMap: two of the four windows glow at night.
 */
export function facadeTextures() {
  const W = 256;
  const H = 256;
  const [c, g] = canvas(W, H);
  const [e, ge] = canvas(W, H);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  g.fillStyle = '#f2efe8';
  g.fillRect(0, 0, W, H);

  const pxPerM = W / FACADE_TILE.w;
  const floorPx = H / 2;
  const frames = ['#2e7dbf', '#3c8d5a', '#8a5a2b', '#2e7dbf'];
  for (let floor = 0; floor < 2; floor++) {
    const top = floor * floorPx; // canvas y of this floor's ceiling
    // grime line at each floor slab
    g.fillStyle = '#d9d3c6';
    g.fillRect(0, top + floorPx - 6, W, 6);
    for (let col = 0; col < 2; col++) {
      const i = floor * 2 + col;
      const cx = (col + 0.5) * 3 * pxPerM;
      const ww = 1.2 * pxPerM;
      const wh = 1.4 * pxPerM;
      const wy = top + floorPx - 0.9 * pxPerM - wh;
      // sunshade (chajja) above the window, with its shadow
      g.fillStyle = 'rgba(0,0,0,0.18)';
      g.fillRect(cx - 0.85 * pxPerM, wy - 10, 1.7 * pxPerM, 12);
      g.fillStyle = '#e4dfd3';
      g.fillRect(cx - 0.85 * pxPerM, wy - 16, 1.7 * pxPerM, 7);
      // frame, glass, grille
      g.fillStyle = frames[i];
      g.fillRect(cx - ww / 2 - 4, wy - 4, ww + 8, wh + 8);
      const glass = g.createLinearGradient(0, wy, 0, wy + wh);
      glass.addColorStop(0, '#5d7286');
      glass.addColorStop(1, '#1e2933');
      g.fillStyle = glass;
      g.fillRect(cx - ww / 2, wy, ww, wh);
      g.fillStyle = '#20262c';
      for (let b = 1; b < 5; b++) g.fillRect(cx - ww / 2 + (b * ww) / 5 - 1, wy, 2, wh);
      g.fillRect(cx - ww / 2, wy + wh / 2 - 1, ww, 2);
      if (i === 1 || i === 2) {
        ge.fillStyle = '#ffc979';
        ge.fillRect(cx - ww / 2, wy, ww, wh);
      }
    }
  }
  const map = texture(c);
  const emissive = texture(e);
  return { map, emissive };
}

/** Shopfront tile: left shop open (goods + lit interior), right shop shutter mostly down. */
/** Rows in the shop atlas: each row is one tile of two shopfronts; a building uses one row. */
export const SHOP_ROWS = 4;

/**
 * Shopfront atlas: SHOP_ROWS tiles stacked vertically, each SHOP_TILE wide and holding two
 * shopfronts, eight designs in all: half-open shutter with goods, a closed shutter painted in
 * a colour, a glass-fronted clothes shop, a sweet shop counter, a bright mobile / electronics
 * shop, hardware with hanging buckets, a textile shop with folded saree piles, a bakery / juice
 * counter. The emissive map lights the open, glass and bright ones at night.
 */
export function shopTextures() {
  const W = 256;
  const H = 136; // one row
  const [c, g] = canvas(W, H * SHOP_ROWS);
  const [e, ge] = canvas(W, H * SHOP_ROWS);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H * SHOP_ROWS);
  g.fillStyle = '#f2efe8';
  g.fillRect(0, 0, W, H * SHOP_ROWS);
  const rand = seeded(3);
  const pxPerM = W / SHOP_TILE.w;
  const lintel = 0.6 * pxPerM; // band at the top, covered by the signboard
  const hue = () => `hsl(${Math.floor(rand() * 360)},70%,${45 + rand() * 20}%)`;
  const rect = (x: number, y: number, w: number, h: number, fill: string, glow?: string) => {
    g.fillStyle = fill;
    g.fillRect(x, y, w, h);
    if (glow) {
      ge.fillStyle = glow;
      ge.fillRect(x, y, w, h);
    }
  };
  const shutter = (x0: number, x1: number, top: number, bottom: number, colour: string, line: string) => {
    rect(x0, top, x1 - x0, bottom - top, colour);
    g.fillStyle = line;
    for (let y = top + 3; y < bottom; y += 5) g.fillRect(x0, y, x1 - x0, 1);
  };
  const designs: ((x0: number, x1: number, y0: number) => void)[] = [
    // 0: shutter half up, shelves of goods below
    (x0, x1, y0) => {
      const b = y0 + lintel + 0.35 * pxPerM;
      rect(x0, y0 + lintel, x1 - x0, H - lintel, '#2b2219', '#000');
      for (let shelf = 0; shelf < 3; shelf++) for (let x = x0 + 4; x < x1 - 8; x += 9) rect(x, b + 8 + shelf * 20, 7, 12, hue());
      ge.fillStyle = '#c9884a';
      ge.fillRect(x0, b, x1 - x0, y0 + H - b);
      shutter(x0, x1, y0 + lintel, b, '#8f9396', '#6f7376');
    },
    // 1: closed shutter painted a colour, with a faded ad panel
    (x0, x1, y0) => {
      const col = ['#2f6fbf', '#2e8b57', '#b23a3a', '#d4a017'][Math.floor(rand() * 4)];
      shutter(x0, x1, y0 + lintel, y0 + H - 4, col, '#0003');
      rect(x0 + 20, y0 + lintel + 22, x1 - x0 - 40, 38, '#f4f1e8');
      rect(x0 + 26, y0 + lintel + 28, x1 - x0 - 52, 10, hue());
      rect(x0 + 26, y0 + lintel + 44, (x1 - x0 - 52) * 0.6, 8, '#555');
    },
    // 2: glass clothes shop: bright inside, garments on a rail, a mannequin
    (x0, x1, y0) => {
      rect(x0, y0 + lintel, x1 - x0, H - lintel, '#f3ead8', '#e8d2a8');
      rect(x0, y0 + lintel + 14, x1 - x0, 2, '#777');
      for (let x = x0 + 6; x < x1 - 30; x += 10) rect(x, y0 + lintel + 16, 8, 34, hue(), '#6a5a40');
      rect(x1 - 24, y0 + lintel + 18, 12, 46, hue());
      rect(x1 - 21, y0 + lintel + 8, 6, 9, '#c69c7d');
      rect(x0, y0 + H - 16, x1 - x0, 16, '#cfc6b6');
      g.fillStyle = '#ffffff55';
      for (let k = 0; k < 3; k++) g.fillRect(x0 + 20 + k * 34, y0 + lintel, 6, H - lintel); // glass glints
      rect(x0 + (x1 - x0) / 2 - 1, y0 + lintel, 2, H - lintel, '#555');
    },
    // 3: sweet shop: glass counter of colourful sweets, white tiles behind
    (x0, x1, y0) => {
      rect(x0, y0 + lintel, x1 - x0, H - lintel, '#f7f7f2', '#d9d0b8');
      g.fillStyle = '#d8d8d0';
      for (let y = y0 + lintel; y < y0 + H; y += 10) g.fillRect(x0, y, x1 - x0, 1);
      for (let x = x0; x < x1; x += 10) g.fillRect(x, y0 + lintel, 1, H - lintel);
      rect(x0 + 4, y0 + H - 46, x1 - x0 - 8, 42, '#9fc4d6', '#7a8a7a');
      for (let r = 0; r < 3; r++) for (let x = x0 + 8; x < x1 - 10; x += 8) rect(x, y0 + H - 42 + r * 12, 6, 8, ['#ff9800', '#ffeb3b', '#e91e63', '#8bc34a', '#fff3e0'][Math.floor(rand() * 5)]);
    },
    // 4: mobile / electronics: white, bright, blue posters, glass door
    (x0, x1, y0) => {
      rect(x0, y0 + lintel, x1 - x0, H - lintel, '#fbfbfb', '#f0f0f0');
      rect(x0 + 8, y0 + lintel + 8, 30, 50, '#1565c0');
      rect(x0 + 12, y0 + lintel + 14, 22, 30, '#90caf9');
      rect(x1 - 38, y0 + lintel + 8, 30, 50, '#d32f2f');
      rect(x0 + 44, y0 + lintel + 4, x1 - x0 - 88, H - lintel - 4, '#cfe3ee');
      rect(x0 + 44, y0 + H - 40, x1 - x0 - 88, 4, '#333');
      rect(x0, y0 + H - 12, x1 - x0, 12, '#bdbdbd');
    },
    // 5: hardware: dark inside, buckets and pipes hanging, goods on the floor
    (x0, x1, y0) => {
      rect(x0, y0 + lintel, x1 - x0, H - lintel, '#3a3127', '#3a2a10');
      for (let x = x0 + 6; x < x1 - 12; x += 16) {
        g.fillStyle = hue();
        g.beginPath();
        g.arc(x + 6, y0 + lintel + 22, 6, 0, Math.PI * 2);
        g.fill();
      }
      for (let x = x0 + 4; x < x1 - 6; x += 5) rect(x, y0 + lintel + 40, 2, 30, '#9e9e9e');
      for (let x = x0 + 4; x < x1 - 14; x += 14) rect(x, y0 + H - 22, 12, 22, hue());
    },
    // 6: textile: wooden shelves of folded saree piles, warm light
    (x0, x1, y0) => {
      rect(x0, y0 + lintel, x1 - x0, H - lintel, '#5a3a22', '#7a5020');
      for (let shelf = 0; shelf < 4; shelf++) {
        const y = y0 + lintel + 6 + shelf * 21;
        rect(x0 + 2, y + 17, x1 - x0 - 4, 2, '#3a2412');
        for (let x = x0 + 4; x < x1 - 10; x += 12) for (let k = 0; k < 3; k++) rect(x, y + k * 5, 10, 4, hue());
      }
    },
    // 7: bakery / juice counter: pastel tiles, a glass case of cakes, fruit on top
    (x0, x1, y0) => {
      rect(x0, y0 + lintel, x1 - x0, H - lintel, '#f8d7e3', '#e0b8c0');
      rect(x0 + 6, y0 + H - 44, x1 - x0 - 12, 40, '#fff8e1', '#c8b890');
      for (let x = x0 + 12; x < x1 - 16; x += 14) rect(x, y0 + H - 34, 10, 10, ['#8d6e63', '#ffcc80', '#f48fb1', '#fff59d'][Math.floor(rand() * 4)]);
      for (let x = x0 + 10; x < x1 - 10; x += 9) {
        g.fillStyle = ['#ff9800', '#4caf50', '#ffeb3b', '#f44336'][Math.floor(rand() * 4)];
        g.beginPath();
        g.arc(x, y0 + H - 50, 4, 0, Math.PI * 2);
        g.fill();
      }
      rect(x0 + 20, y0 + lintel + 10, x1 - x0 - 40, 22, '#ffffff');
      rect(x0 + 26, y0 + lintel + 16, x1 - x0 - 52, 10, '#ec407a');
    },
  ];
  // Rows pair up designs that look good side by side.
  const pairs = [[0, 2], [3, 1], [4, 6], [5, 7]];
  pairs.forEach(([a, b], row) => {
    const y0 = row * H;
    for (const [s, d] of [[0, a], [1, b]]) designs[d](s * 128 + 7, s * 128 + 121, y0);
    // Lintel band and the pillars between shops, a little different per row.
    rect(0, y0, W, lintel, ['#efe6d2', '#e8e1d8', '#f2e9e1', '#e6e0cf'][row]);
    for (const x of [0, 121, 128, 249]) rect(x, y0, 7, H, '#d9cfbd');
  });
  return { map: texture(c), emissive: texture(e) };
}

/** Signboard atlas: one row per shop name, Tamil above English. */
export function signTextures() {
  const W = 512;
  const ROW = 64;
  const [c, g] = canvas(W, ROW * SIGNS.length);
  SIGNS.forEach((s, i) => {
    const y = i * ROW;
    g.fillStyle = s.bg;
    g.fillRect(0, y, W, ROW);
    g.strokeStyle = s.fg;
    g.lineWidth = 3;
    g.strokeRect(4, y + 4, W - 8, ROW - 8);
    g.fillStyle = s.fg;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '600 20px "Nirmala UI", "Latha", "Tamil Sangam MN", "Noto Sans Tamil", sans-serif';
    g.fillText(s.ta, W / 2, y + 21);
    g.font = '700 22px system-ui, sans-serif';
    g.fillText(s.en.toUpperCase(), W / 2, y + 45);
  });
  const map = texture(c, false);
  return { map, rowV: (i: number) => [1 - (i + 1) / SIGNS.length, 1 - i / SIGNS.length] as const };
}

/**
 * One gopuram tier, 4 m wide x 2.6 m high: niches with brightly painted deity figures between
 * pilasters, a cornice band on top. White base, tinted per tier with vertex colours.
 */
export const GOPURAM_TILE = { w: 4, h: 2.6 };
export function gopuramTexture() {
  const W = 256;
  const H = 168;
  const [c, g] = canvas(W, H);
  const rand = seeded(19);
  const colours = ['#1e63c4', '#d6302b', '#f3c623', '#2f9e4f', '#e66fb0', '#f08a24', '#7a4cc2', '#22a6b3'];
  g.fillStyle = '#f4efe2';
  g.fillRect(0, 0, W, H);
  // cornice band
  g.fillStyle = '#c9b48a';
  g.fillRect(0, 0, W, 22);
  for (let x = 6; x < W; x += 16) {
    g.fillStyle = colours[Math.floor(rand() * colours.length)];
    g.beginPath();
    g.arc(x, 14, 6, Math.PI, 0);
    g.fill();
  }
  // four niches per tile
  for (let n = 0; n < 4; n++) {
    const x = n * 64;
    g.fillStyle = '#d8ccb0'; // pilaster
    g.fillRect(x, 22, 8, H - 22);
    g.fillStyle = '#8a6e4b'; // niche shadow
    g.fillRect(x + 14, 36, 44, H - 44);
    g.beginPath();
    g.arc(x + 36, 36, 22, Math.PI, 0);
    g.fill();
    // deity: body, arms, head, crown
    const body = colours[Math.floor(rand() * colours.length)];
    g.fillStyle = body;
    g.fillRect(x + 26, 70, 20, 60);
    g.fillRect(x + 18, 76, 36, 8);
    g.fillStyle = colours[Math.floor(rand() * colours.length)];
    g.fillRect(x + 24, 118, 24, 34); // dhoti
    g.fillStyle = body;
    g.beginPath();
    g.arc(x + 36, 60, 10, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#e8b931';
    g.beginPath();
    g.moveTo(x + 27, 52);
    g.lineTo(x + 36, 34);
    g.lineTo(x + 45, 52);
    g.fill();
  }
  return texture(c);
}

/** Red-and-white vertical stripes painted on temple walls and tank steps (kavi). 1 m per pair. */
export function templeStripeTexture() {
  const [c, g] = canvas(32, 8);
  g.fillStyle = '#f6f1e6';
  g.fillRect(0, 0, 32, 8);
  g.fillStyle = '#b8352a';
  g.fillRect(0, 0, 16, 8);
  return texture(c);
}

/** Chennai Corporation street-name boards: white on blue, Tamil above English. One row per name. */
export function streetSignTextures(names: [string, string][]) {
  const W = 256;
  const ROW = 64;
  const [c, g] = canvas(W, ROW * names.length);
  names.forEach(([en, ta], i) => {
    const y = i * ROW;
    g.fillStyle = '#0b4ea2';
    g.fillRect(0, y, W, ROW);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 3;
    g.strokeRect(4, y + 4, W - 8, ROW - 8);
    g.fillStyle = '#ffffff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = '600 17px "Nirmala UI", "Latha", "Tamil Sangam MN", "Noto Sans Tamil", sans-serif';
    g.fillText(ta, W / 2, y + 22);
    g.font = '700 16px system-ui, sans-serif';
    g.fillText(en.toUpperCase(), W / 2, y + 45);
  });
  return { map: texture(c, false), rowV: (i: number) => [1 - (i + 1) / names.length, 1 - i / names.length] as const };
}

/** Soft round glow for lamp light pools on the ground. */
export function glowTexture() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,214,150,1)');
  grad.addColorStop(1, 'rgba(255,214,150,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return texture(c, false);
}
