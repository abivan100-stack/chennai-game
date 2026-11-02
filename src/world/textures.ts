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
];
export const SIGN_COUNT = SIGNS.length;

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
export function shopTextures() {
  const W = 256;
  const H = 136;
  const [c, g] = canvas(W, H);
  const [e, ge] = canvas(W, H);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, W, H);
  g.fillStyle = '#f2efe8';
  g.fillRect(0, 0, W, H);
  const rand = seeded(3);
  const pxPerM = W / SHOP_TILE.w;
  const lintel = 0.6 * pxPerM; // band at the top, covered by the signboard
  for (let s = 0; s < 2; s++) {
    const x0 = s * 128 + 7;
    const x1 = s * 128 + 121;
    const open = s === 0;
    const shutterBottom = open ? lintel + 0.35 * pxPerM : H - 0.5 * pxPerM;
    // interior
    g.fillStyle = '#2b2219';
    g.fillRect(x0, lintel, x1 - x0, H - lintel);
    if (open) {
      for (let shelf = 0; shelf < 3; shelf++) {
        const y = shutterBottom + 8 + shelf * 20;
        for (let x = x0 + 4; x < x1 - 8; x += 9) {
          g.fillStyle = `hsl(${rand() * 360},70%,${45 + rand() * 20}%)`;
          g.fillRect(x, y, 7, 12);
        }
      }
      ge.fillStyle = '#c9884a';
      ge.fillRect(x0, shutterBottom, x1 - x0, H - shutterBottom);
    }
    // rolling shutter
    g.fillStyle = '#8f9396';
    g.fillRect(x0, lintel, x1 - x0, shutterBottom - lintel);
    g.fillStyle = '#6f7376';
    for (let y = lintel + 3; y < shutterBottom; y += 5) g.fillRect(x0, y, x1 - x0, 1);
  }
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
