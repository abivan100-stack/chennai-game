import * as THREE from 'three';

/**
 * Small procedural canvas textures for the town (no downloads, a few hundred KB of VRAM).
 * Facade tiles are drawn to a known metre size so geometry can use world-metre UVs.
 */

/** Window facade tile: 2 windows wide x 2 floors high. */
export const FACADE_TILE = { w: 6, h: 6.4 };
/**
 * The facade tile's windows (metres, drawn at the canvas's horizontal scale): 2 x 2 of them, centred
 * in each 3 m half, sill above the floor. buildings.ts windowDepth() recesses exactly these.
 */
export const FACADE_WIN = { w: 1.2, h: 1.4, sill: 0.9 };
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

const normalCache = new WeakMap<THREE.Texture, THREE.Texture>();
/**
 * Normal map made from a colour texture's brightness: dark = sunk in (window glass, joints, cracks,
 * recess shadows), light = raised (sills, frames, slab bands). Not exact, but the painted relief
 * now catches the sun from any side. Computed once at half size (smooths grain, 1/4 the memory);
 * same wrap and repeat as the source, cached per texture so shared textures share it too.
 * minEdge > 0 keeps only strong edges (frames, sills, joints): faint paint stains and rain streaks
 * would otherwise turn into ridges.
 */
export function normalMapFor(src: THREE.Texture, strength: number, minEdge = 0) {
  const hit = normalCache.get(src);
  if (hit) return hit;
  const img = src.image as HTMLCanvasElement;
  const w = Math.max(1, img.width >> 1);
  const h = Math.max(1, img.height >> 1);
  const [c, g] = canvas(w, h);
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h);
  const d = px.data;
  const lum = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) lum[i] = (d[i * 4] * 0.299 + d[i * 4 + 1] * 0.587 + d[i * 4 + 2] * 0.114) / 255;
  const at = (x: number, y: number) => lum[((y + h) % h) * w + ((x + w) % w)]; // wraps: tiles stay seamless
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let dx = at(x + 1, y - 1) + 2 * at(x + 1, y) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x - 1, y) - at(x - 1, y + 1);
      let dy = at(x - 1, y + 1) + 2 * at(x, y + 1) + at(x + 1, y + 1) - at(x - 1, y - 1) - 2 * at(x, y - 1) - at(x + 1, y - 1);
      let k = strength;
      if (minEdge > 0) {
        const t = Math.min(1, Math.max(0, (Math.hypot(dx, dy) - minEdge) / (minEdge * 2)));
        k *= t * t * (3 - 2 * t);
      }
      dx *= k;
      dy *= k;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      d[i] = (-dx / len * 0.5 + 0.5) * 255;
      d[i + 1] = (dy / len * 0.5 + 0.5) * 255; // canvas y runs down, tangent-space y up
      d[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  g.putImageData(px, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.NoColorSpace;
  t.anisotropy = src.anisotropy;
  t.wrapS = src.wrapS;
  t.wrapT = src.wrapT;
  t.repeat.copy(src.repeat);
  t.offset.copy(src.offset);
  normalCache.set(src, t);
  return t;
}

/** Deterministic noise so textures look the same every load. */
function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/** Per-pixel brightness noise over a region (device pixels): flat fills stop looking like plastic. */
function grain(g: CanvasRenderingContext2D, w: number, h: number, rand: () => number, strength: number) {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (rand() - 0.5) * strength;
    d[i] += n;
    d[i + 1] += n;
    d[i + 2] += n;
  }
  g.putImageData(img, 0, 0);
}

/** Soft stains / patches: n round blotches of `rgb` (e.g. '90,80,60'), drawn wrapped so the tile repeats cleanly. */
function blotches(g: CanvasRenderingContext2D, w: number, h: number, rand: () => number, n: number, size: number, rgb: string, alpha: number) {
  for (let i = 0; i < n; i++) {
    const x = rand() * w;
    const y = rand() * h;
    const r = size * (0.4 + rand());
    for (const ox of [0, -w, w]) {
      for (const oy of [0, -h, h]) {
        if (x + ox + r < 0 || x + ox - r > w || y + oy + r < 0 || y + oy - r > h) continue;
        const grad = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grad.addColorStop(0, `rgba(${rgb},${alpha})`);
        grad.addColorStop(1, `rgba(${rgb},0)`);
        g.fillStyle = grad;
        g.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
      }
    }
  }
}

/** A fade from `rgba` to clear: down (dir 1) or up (dir -1) from y over len. Shadows, rain streaks, dirt. */
function fade(g: CanvasRenderingContext2D, x: number, y: number, w: number, len: number, rgb: string, alpha: number, dir = 1) {
  const grad = g.createLinearGradient(0, y, 0, y + dir * len);
  grad.addColorStop(0, `rgba(${rgb},${alpha})`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(x, dir > 0 ? y : y - len, w, len);
}

/** Worn tarmac, 4 m per tile: tar patches, stone chips of many greys, hairline cracks. */
export function asphaltTexture() {
  const S = 512;
  const [c, g] = canvas(S, S);
  const rand = seeded(7);
  g.fillStyle = '#414145';
  g.fillRect(0, 0, S, S);
  blotches(g, S, S, rand, 34, 70, '0,0,0', 0.16);
  blotches(g, S, S, rand, 26, 80, '150,145,135', 0.07);
  for (let i = 0; i < 16000; i++) {
    const v = rand() < 0.07 ? 92 + rand() * 36 : 38 + rand() * 46;
    g.fillStyle = `rgb(${v},${v},${v + 3})`;
    const s = 1 + rand() * 1.6;
    g.fillRect(rand() * S, rand() * S, s, s);
  }
  g.strokeStyle = 'rgba(12,12,14,0.55)';
  g.lineWidth = 1.2;
  for (let k = 0; k < 4; k++) {
    let x = 80 + rand() * (S - 160);
    let y = 80 + rand() * (S - 160);
    let a = rand() * Math.PI * 2;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 14; s++) {
      a += (rand() - 0.5) * 1.1;
      x = Math.min(S - 30, Math.max(30, x + Math.cos(a) * 9));
      y = Math.min(S - 30, Math.max(30, y + Math.sin(a) * 9));
      g.lineTo(x, y);
    }
    g.stroke();
  }
  grain(g, S, S, rand, 16);
  return texture(c);
}

/** Chennai curbs: painted black and yellow, 1 m each; chipped, scuffed, dusty at the road. */
export function curbTexture() {
  const W = 256;
  const H = 32;
  const [c, g] = canvas(W, H);
  const rand = seeded(23);
  g.fillStyle = '#e9bb0a';
  g.fillRect(0, 0, W / 2, H);
  g.fillStyle = '#1f1f1f';
  g.fillRect(W / 2, 0, W / 2, H);
  for (let i = 0; i < 70; i++) { // chips down to the concrete
    g.fillStyle = `rgba(${150 + rand() * 40},${145 + rand() * 35},${130 + rand() * 30},${0.5 + rand() * 0.4})`;
    g.fillRect(rand() * W, rand() * H, 1 + rand() * 6, 1 + rand() * 3);
  }
  fade(g, 0, H, W, H * 0.6, '95,85,70', 0.55, -1); // road dust at the foot
  fade(g, 0, 0, W, 4, '255,255,255', 0.18);
  grain(g, W, H, rand, 22);
  return texture(c);
}

/** Paving slabs for the sidewalk tops (1 m slabs; the tile is 2 x 2 of them so neighbours differ). */
let pavingCache: THREE.Texture | undefined;
/** Shared: every caller gets the same texture (one copy on the GPU). */
export function pavingTexture() {
  return (pavingCache ??= drawPaving());
}
function drawPaving() {
  const S = 256;
  const T = S / 2;
  const [c, g] = canvas(S, S);
  const rand = seeded(31);
  for (let i = 0; i < 2; i++) {
    for (let j = 0; j < 2; j++) {
      const v = 186 + rand() * 22;
      g.fillStyle = `rgb(${v + 6},${v},${v - 14})`;
      g.fillRect(i * T, j * T, T, T);
    }
  }
  blotches(g, S, S, rand, 22, 34, '70,60,45', 0.12);
  blotches(g, S, S, rand, 10, 30, '255,250,240', 0.1);
  for (let k = 0; k <= 2; k++) { // joints: dark gap, a lighter worn edge beside it
    g.fillStyle = '#857d6d';
    g.fillRect((k * T - 2 + S) % S, 0, 4, S);
    g.fillRect(0, (k * T - 2 + S) % S, S, 4);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect((k * T + 2) % S, 0, 2, S);
    g.fillRect(0, (k * T + 2) % S, S, 2);
  }
  grain(g, S, S, rand, 20);
  const t = texture(c);
  t.repeat.set(0.5, 0.5); // UVs are in metres; the tile is 2 m
  return t;
}

/**
 * Residential facade tile (white walls: building colour comes from vertex colours).
 * map + emissiveMap: all four windows glow; windowDepth.ts picks which are lit per building.
 */
let facadeCache: { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } | undefined;
export function facadeTextures() {
  return (facadeCache ??= drawFacade());
}
function drawFacade() {
  // 1024 px over 6 m (170 px/m): sharp up close. Weathered plaster, rain streaks under every slab
  // and sill, windows drawn with depth (frame bevel, recess shadow, curtains, grille, stone sill,
  // sunshade casting a shadow), one AC unit. The glow map is smaller: light is soft anyway.
  const W = 1024;
  const H = 1024;
  const E = 512;
  const [c, g] = canvas(W, H);
  const [e, ge] = canvas(E, E);
  const rand = seeded(11);
  ge.fillStyle = '#000';
  ge.fillRect(0, 0, E, E);
  ge.scale(E / W, E / H); // same coordinates as the colour map
  g.fillStyle = '#f1ede4';
  g.fillRect(0, 0, W, H);
  blotches(g, W, H, rand, 46, 150, '120,100,70', 0.06); // damp, uneven paint
  blotches(g, W, H, rand, 30, 120, '255,255,255', 0.1);

  const pxPerM = W / FACADE_TILE.w;
  const floorPx = H / 2;
  const frames = ['#2e7dbf', '#3c8d5a', '#8a5a2b', '#2e7dbf'];
  const curtains = ['#b9453f', '', '#d9c7a0', '#5f8f8a'];
  const F = 13; // frame width
  for (let floor = 0; floor < 2; floor++) {
    const top = floor * floorPx; // canvas y of this floor's ceiling
    // Floor slab: a projecting band, lit on top, a shadow and rain streaks on the wall beneath it.
    const band = top + floorPx - 22;
    g.fillStyle = '#e3ddcf';
    g.fillRect(0, band, W, 22);
    g.fillStyle = 'rgba(255,255,255,0.5)';
    g.fillRect(0, band, W, 3);
    fade(g, 0, top, W, 46, '40,30,20', 0.3);
    for (let s = 0; s < 46; s++) fade(g, rand() * W, top, 3 + rand() * 12, (0.25 + rand() * 0.9) * pxPerM, '85,72,55', 0.05 + rand() * 0.09);

    for (let col = 0; col < 2; col++) {
      const i = floor * 2 + col;
      const cx = (col + 0.5) * 3 * pxPerM;
      const ww = FACADE_WIN.w * pxPerM;
      const wh = FACADE_WIN.h * pxPerM;
      const wx = cx - ww / 2;
      const wy = top + floorPx - FACADE_WIN.sill * pxPerM - wh;
      // frame with a bevel
      g.fillStyle = frames[i];
      g.fillRect(wx - F, wy - F, ww + F * 2, wh + F * 2);
      g.fillStyle = 'rgba(255,255,255,0.3)';
      g.fillRect(wx - F, wy - F, ww + F * 2, 3);
      g.fillRect(wx - F, wy - F, 3, wh + F * 2);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(wx - F, wy + wh + F - 3, ww + F * 2, 3);
      g.fillRect(wx + ww + F - 3, wy - F, 3, wh + F * 2);
      // glass: sky at the top, dark room below, a slanting reflection
      const glass = g.createLinearGradient(0, wy, 0, wy + wh);
      glass.addColorStop(0, '#7690a6');
      glass.addColorStop(0.45, '#33424f');
      glass.addColorStop(1, '#161d24');
      g.fillStyle = glass;
      g.fillRect(wx, wy, ww, wh);
      g.save();
      g.beginPath();
      g.rect(wx, wy, ww, wh);
      g.clip();
      if (curtains[i]) { // a curtain drawn half across, with folds
        g.fillStyle = curtains[i];
        g.globalAlpha = 0.75;
        g.fillRect(wx, wy, ww * 0.45, wh);
        g.globalAlpha = 1;
        g.fillStyle = 'rgba(0,0,0,0.22)';
        for (let f = 0; f < 6; f++) g.fillRect(wx + (f + 0.6) * ((ww * 0.45) / 6), wy, 4, wh);
      }
      g.fillStyle = 'rgba(255,255,255,0.1)';
      g.beginPath();
      g.moveTo(wx + ww * 0.5, wy);
      g.lineTo(wx + ww * 0.85, wy);
      g.lineTo(wx + ww * 0.45, wy + wh);
      g.lineTo(wx + ww * 0.1, wy + wh);
      g.fill();
      g.restore();
      // the glass sits back in the wall: shadow along the top and left of the opening
      fade(g, wx, wy, ww, 26, '0,0,0', 0.5);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(wx, wy, 8, wh);
      // grille
      for (let b = 1; b < 5; b++) {
        g.fillStyle = '#161b20';
        g.fillRect(wx + (b * ww) / 5 - 2, wy, 5, wh);
        g.fillStyle = 'rgba(255,255,255,0.2)';
        g.fillRect(wx + (b * ww) / 5 - 2, wy, 1, wh);
      }
      g.fillStyle = '#161b20';
      g.fillRect(wx, wy + wh / 2 - 2, ww, 5);
      // stone sill, its shadow, and the dirt that runs off its ends
      const sy = wy + wh + F;
      g.fillStyle = '#dcd6c8';
      g.fillRect(wx - F - 12, sy, ww + F * 2 + 24, 13);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(wx - F - 12, sy, ww + F * 2 + 24, 3);
      fade(g, wx - F - 12, sy + 13, ww + F * 2 + 24, 18, '0,0,0', 0.32);
      for (const ex of [wx - F - 12, wx + ww + F + 4]) fade(g, ex, sy + 13, 9, (0.35 + rand() * 0.4) * pxPerM, '80,68,50', 0.22);
      // sunshade (chajja) above the window and the shadow it throws across the frame
      const cw = 1.7 * pxPerM;
      const cy = wy - F - 30;
      g.fillStyle = '#e4dfd3';
      g.fillRect(cx - cw / 2, cy, cw, 22);
      g.fillStyle = 'rgba(255,255,255,0.6)';
      g.fillRect(cx - cw / 2, cy, cw, 4);
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.fillRect(cx - cw / 2, cy + 18, cw, 4);
      fade(g, cx - cw / 2, cy + 22, cw, 54, '0,0,0', 0.42);
      if (i === 3) { // window AC on its bracket, with a drip stain
        const ax = cx + 0.75 * pxPerM;
        const ay = wy + wh * 0.5;
        fade(g, ax + 6, ay + 78, 0.7 * pxPerM, 20, '0,0,0', 0.35);
        g.fillStyle = '#e8e8e2';
        g.fillRect(ax, ay, 0.7 * pxPerM, 78);
        g.fillStyle = '#c9c9c2';
        for (let l = 0; l < 7; l++) g.fillRect(ax + 8, ay + 10 + l * 9, 0.7 * pxPerM - 16, 3);
        g.fillStyle = 'rgba(0,0,0,0.25)';
        g.fillRect(ax + 0.7 * pxPerM - 4, ay, 4, 78);
        fade(g, ax + 30, ay + 78, 8, 0.8 * pxPerM, '70,60,45', 0.3);
      }
      { // every room lit (windowDepth.ts switches each window on / off and tints it per building)
        const lit = ge.createLinearGradient(0, wy, 0, wy + wh);
        lit.addColorStop(0, '#ffd595');
        lit.addColorStop(1, '#e29a4e');
        ge.fillStyle = lit;
        ge.fillRect(wx, wy, ww, wh);
        if (curtains[i]) {
          ge.fillStyle = 'rgba(120,50,30,0.55)';
          ge.fillRect(wx, wy, ww * 0.45, wh);
        }
        ge.fillStyle = '#1a1208';
        for (let b = 1; b < 5; b++) ge.fillRect(wx + (b * ww) / 5 - 2, wy, 5, wh);
        ge.fillRect(wx, wy + wh / 2 - 2, ww, 5);
      }
    }
  }
  grain(g, W, H, rand, 13);
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
  const S = 3; // colour map drawn at 3x (128 px/m) in the same coordinates; the glow map stays small
  const [c, g] = canvas(W * S, H * SHOP_ROWS * S);
  g.scale(S, S);
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
    for (let y = top + 3; y < bottom; y += 5) {
      g.fillStyle = line;
      g.fillRect(x0, y, x1 - x0, 1);
      g.fillStyle = 'rgba(255,255,255,0.22)'; // each slat catches the light
      g.fillRect(x0, y + 1, x1 - x0, 0.7);
    }
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
      rect(x0, y0 + lintel, x1 - x0, H - lintel, '#fbfbfb', '#8c8a80'); // glow kept low: a white shop at full glow burns out at night
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
    // Depth: the board / awning shades the top of each opening, pillars are rounded off by a
    // highlight and a shadow edge, street dirt climbs the bottom, a worn step along the foot.
    for (const s of [0, 1]) fade(g, s * 128 + 7, y0 + lintel, 114, 0.5 * pxPerM, '0,0,0', 0.5);
    for (const x of [0, 121, 128, 249]) {
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x, y0, 1, H);
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(x + 6, y0, 1, H);
    }
    g.fillStyle = 'rgba(0,0,0,0.25)';
    g.fillRect(0, y0 + lintel - 1, W, 1);
    fade(g, 0, y0 + H, W, 0.45 * pxPerM, '70,55,38', 0.4, -1);
    g.fillStyle = '#8f887a';
    g.fillRect(0, y0 + H - 2.5, W, 2.5);
    g.fillStyle = 'rgba(255,255,255,0.3)';
    g.fillRect(0, y0 + H - 2.5, W, 0.6);
  });
  g.resetTransform();
  grain(g, W * S, H * SHOP_ROWS * S, rand, 14);
  return { map: texture(c), emissive: texture(e) };
}

/** Signboard atlas: one row per shop name, Tamil above English. */
export function signTextures() {
  const W = 512;
  const ROW = 64;
  // Drawn at 2x so the lettering is sharp from the pavement. Each board is a printed flex sign:
  // a light-to-dark sheen, a darker end panel with a round emblem, a thin inner border, the name
  // in Tamil over English with a drop shadow, a small line of trade text.
  const S = 2;
  const [c, g] = canvas(W * S, ROW * SIGNS.length * S);
  g.scale(S, S);
  const trade = ['Tea · Coffee · Snacks', 'Medicines · 24 hrs', 'Provisions · Wholesale', 'Tiffin · Meals', 'Sarees · Readymades', 'Meals ready', 'Sales · Service · Recharge', 'Garlands · Bouquets', 'Veg · A/C dining', 'Cakes · Puffs · Juice'];
  SIGNS.forEach((s, i) => {
    const y = i * ROW;
    g.fillStyle = s.bg;
    g.fillRect(0, y, W, ROW);
    const sheen = g.createLinearGradient(0, y, 0, y + ROW);
    sheen.addColorStop(0, 'rgba(255,255,255,0.22)');
    sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
    sheen.addColorStop(1, 'rgba(0,0,0,0.25)');
    g.fillStyle = sheen;
    g.fillRect(0, y, W, ROW);
    for (const x of [0, W - 62]) { // end panels
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(x, y, 62, ROW);
      g.fillStyle = s.fg;
      g.beginPath();
      g.arc(x + 31, y + ROW / 2, 19, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = s.bg;
      g.beginPath();
      g.arc(x + 31, y + ROW / 2, 15, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = s.fg;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.font = '800 20px system-ui, sans-serif';
      g.fillText(s.en[0], x + 31, y + ROW / 2 + 1);
    }
    g.strokeStyle = s.fg;
    g.lineWidth = 1.5;
    g.strokeRect(3, y + 3, W - 6, ROW - 6);
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const [d, colour] of [[1.2, 'rgba(0,0,0,0.35)'], [0, s.fg]] as const) {
      g.fillStyle = colour;
      g.font = '700 19px "Nirmala UI", "Latha", "Tamil Sangam MN", "Noto Sans Tamil", sans-serif';
      g.fillText(s.ta, W / 2 + d, y + 16 + d, W - 140);
      g.font = '800 21px system-ui, sans-serif';
      g.fillText(s.en.toUpperCase(), W / 2 + d, y + 37 + d, W - 140);
    }
    g.fillStyle = s.fg;
    g.globalAlpha = 0.85;
    g.font = '600 9px system-ui, sans-serif';
    g.fillText(trade[i % trade.length], W / 2, y + 54);
    g.globalAlpha = 1;
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
  const S = 3; // drawn at 3x for sharp edges up close
  const [c, g] = canvas(W * S, H * S);
  g.scale(S, S);
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
    // carved depth: the niche's own shadow over the figure's head, a lit edge on the pilaster
    fade(g, x + 14, 36, 44, 30, '0,0,0', 0.4);
    g.fillStyle = 'rgba(255,255,255,0.4)';
    g.fillRect(x, 22, 1.5, H - 22);
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(x + 6.5, 22, 1.5, H - 22);
  }
  fade(g, 0, 22, W, 10, '0,0,0', 0.35); // the cornice overhangs
  for (let s = 0; s < 30; s++) fade(g, rand() * W, 22, 1 + rand() * 3, 20 + rand() * 60, '70,60,45', 0.12); // monsoon streaks
  g.resetTransform();
  grain(g, W * S, H * S, rand, 14);
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
/**
 * A cluster of leaves on transparency, near-white so each tree kind's vertex colour tints it
 * (leaf cards on the tree canopies, props.ts leafCards; alpha-tested).
 */
export function leafClusterTexture() {
  const S = 256;
  const [c, g] = canvas(S, S);
  const rand = seeded(23);
  for (let i = 0; i < 110; i++) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand()) * S * 0.42; // denser in the middle
    const x = S / 2 + Math.cos(a) * r;
    const y = S / 2 + Math.sin(a) * r;
    const len = 9 + rand() * 9;
    g.save();
    g.translate(x, y);
    g.rotate(rand() * Math.PI * 2);
    const l = 58 + rand() * 34;
    g.fillStyle = `hsl(${80 + rand() * 30}, 18%, ${l}%)`;
    g.beginPath();
    g.ellipse(0, 0, len, len * 0.42, 0, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = `hsla(90, 20%, ${l - 25}%, 0.6)`; // midrib
    g.lineWidth = 1;
    g.beginPath();
    g.moveTo(-len * 0.8, 0);
    g.lineTo(len * 0.8, 0);
    g.stroke();
    g.restore();
  }
  return texture(c, false);
}

export function glowTexture() {
  const [c, g] = canvas(64, 64);
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,214,150,1)');
  grad.addColorStop(1, 'rgba(255,214,150,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return texture(c, false);
}


/**
 * Greyscale surface detail, 4 m per tile, multiplied over plain painted walls / concrete by world
 * position (chunk.ts surfaceDetail): uneven paint, damp patches, rain streaks, fine grain.
 * Values sit just under white so colours keep their strength.
 */
export function plasterDetailTexture() {
  const S = 512;
  const [c, g] = canvas(S, S);
  const rand = seeded(41);
  g.fillStyle = '#e9e9e9';
  g.fillRect(0, 0, S, S);
  blotches(g, S, S, rand, 40, 90, '70,70,70', 0.1);
  blotches(g, S, S, rand, 30, 80, '255,255,255', 0.22);
  for (let s = 0; s < 22; s++) { // streaks run down the tile (down a wall)
    const x = rand() * S;
    const y = rand() * S;
    const len = 60 + rand() * 200;
    const w = 8 + rand() * 24;
    const a = 0.02 + rand() * 0.04;
    for (const oy of [0, -S]) fade(g, x, y + oy, w, len, '60,60,60', a);
  }
  grain(g, S, S, rand, 22);
  const t = texture(c);
  t.colorSpace = THREE.NoColorSpace; // a multiplier, not a colour
  return t;
}
