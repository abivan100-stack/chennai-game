import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Animator } from '../characters/animator';
import { CHARACTER_HEIGHT, type CharacterAsset } from '../characters/catalog';
import { SHELVES, type FoodItem, type Shelf } from './food';
import { GeoBuilder } from './geo';
import { SIDEWALK_HEIGHT, SUPERMARKET_LOTS } from './layout';

// Store layout in store space: entrance wall at +z, x across the frontage (metres).
const W = 16;
const D = 14;
const H = 4.2;
const WALL = 0.25;
const DOOR = 3.2; // entrance gap width
const PLINTH = 0.25; // low wall under the shop glass
const GLASS_TOP = 3.3; // glass / doorway height; the fascia starts here
const FASCIA_H = 3.2; // the clad name board above (taller than the roof: a false front)
const FLOOR_Y = SIDEWALK_HEIGHT;
const SHELF = { len: 7, depth: 0.8, h: 1.8, z0: -4.5 };
const SHELF_X = [-6, -2.5, 1];
const SHELF_LEVELS = [0.32, 0.72, 1.12, 1.52];
const COUNTER = { x: 5, z: 4.2, w: 3, d: 0.8, h: 1.0 };
const PICK_RADIUS = 1.1;
const PAY_RADIUS = 1.3;
const ACTIVE_RADIUS = 35; // animate the cashier only this close
/** Where you stand to pick from each shelf (store space) + which shelf data it sells. */
const PICK_SPOTS: { x: number; z: number; shelf: number }[] = [
  { x: -4.9, z: -2.5, shelf: 0 }, // biscuits & snacks (left wall unit, inner face)
  { x: -3.6, z: 0.5, shelf: 1 }, // fruits
  { x: -1.4, z: -2.5, shelf: 2 }, // bakery
  { x: 0.0, z: 1.0, shelf: 3 }, // cold drinks (front of the middle-right unit)
  { x: -2.5, z: -5.5, shelf: 3 }, // cold drinks (fridge at the back)
];

const WHITE = new THREE.Color(0xf4f2ec);
const TILE = new THREE.Color(0xdedad0);
const SIDE = new THREE.Color(0xd9d5cc); // painted side / back walls
const ORANGE = new THREE.Color(0xee6a14);
const DARK = new THREE.Color(0x1b1b1e);
const ALU = new THREE.Color(0x3b3e43); // shopfront frames, rails
const AWNING = new THREE.Color(0xe6dcc0);
const PICTURE_WHITE = new THREE.Color(0xffffff);
const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const SHELF_C = new THREE.Color(0x8d9399);
const COUNTER_C = new THREE.Color(0xb5651d);
const PRODUCT_COLOURS = [0xd32f2f, 0xf9a825, 0x1565c0, 0x2e7d32, 0xef6c00, 0x6a1b9a, 0xfafafa, 0x00897b, 0xc2185b, 0x5d4037];

export interface Store {
  name: string;
  /** Store space -> world. */
  toWorld: (x: number, z: number, out?: THREE.Vector3) => THREE.Vector3;
  toLocal: (p: THREE.Vector3) => { x: number; z: number };
  yaw: number;
  cashier: { root: THREE.Group; anim: Animator };
}

/** Atlas of everything printed on the storefront (canvas pixels): the two fascia designs, ENTRY / EXIT, offer posters. */
const ATLAS = {
  w: 2048,
  h: 1024,
  fascia: [[0, 0, 2048, 400], [0, 400, 2048, 400]],
  entry: [0, 800, 384, 224],
  exit: [384, 800, 384, 224],
  posters: [0, 1, 2, 3, 4].map((i) => [768 + i * 256, 800, 256, 224]),
} as const;
const TAMIL = '"Nirmala UI", "Latha", "Noto Sans Tamil", sans-serif';

function atlasTexture() {
  const c = document.createElement('canvas');
  const K = 0.75; // drawn in ATLAS pixels on a 1536 x 768 canvas
  c.width = ATLAS.w * K;
  c.height = ATLAS.h * K;
  const g = c.getContext('2d')!;
  g.scale(K, K);
  g.textAlign = 'center';
  g.textBaseline = 'middle';

  // Fascia 0: orange composite panels, a trolley roundel, white name in Tamil over English.
  const grad = g.createLinearGradient(0, 0, 0, 400);
  grad.addColorStop(0, '#f67d22');
  grad.addColorStop(1, '#ea6410');
  g.fillStyle = grad;
  g.fillRect(0, 0, 2048, 400);
  for (let x = 256; x < 2048; x += 256) { // panel joints
    g.fillStyle = 'rgba(0,0,0,0.28)';
    g.fillRect(x, 0, 3, 400);
    g.fillStyle = 'rgba(255,255,255,0.25)';
    g.fillRect(x + 3, 0, 2, 400);
  }
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(0, 199, 2048, 3);
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(250, 200, 140, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#2e9e3f';
  g.fillStyle = '#2e9e3f';
  g.lineWidth = 14;
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.beginPath(); // trolley: handle, basket, wheels
  g.moveTo(150, 135);
  g.lineTo(185, 135);
  g.lineTo(215, 240);
  g.lineTo(320, 240);
  g.lineTo(345, 165);
  g.lineTo(195, 165);
  g.stroke();
  for (const x of [230, 305]) {
    g.beginPath();
    g.arc(x, 275, 14, 0, Math.PI * 2);
    g.fill();
  }
  for (const [dx, colour] of [[4, 'rgba(0,0,0,0.25)'], [0, '#ffffff']] as const) { // drop shadow, then the letters
    g.fillStyle = colour;
    g.font = `700 100px ${TAMIL}`;
    g.fillText('கபாலி சூப்பர் மார்க்கெட்', 1230 + dx, 110 + dx, 1450);
    g.font = '800 150px system-ui, sans-serif';
    g.fillText('Kapali Super Market', 1230 + dx, 280 + dx, 1450);
  }

  // Fascia 1: black box frame, white panel, an orange name band with a dark stripe.
  g.fillStyle = '#17171a';
  g.fillRect(0, 400, 2048, 400);
  g.fillStyle = 'rgba(255,255,255,0.07)';
  for (let x = 128; x < 2048; x += 128) g.fillRect(x, 400, 2, 400);
  g.fillStyle = '#b9b9b4';
  g.fillRect(100, 450, 1848, 300);
  g.fillStyle = '#f5f4f0';
  g.fillRect(106, 456, 1836, 288);
  g.fillStyle = '#f1561c';
  g.fillRect(330, 500, 1388, 200);
  g.fillStyle = '#26262a';
  g.fillRect(330, 640, 1388, 22);
  g.fillStyle = '#ffffff';
  g.font = `800 104px ${TAMIL}`;
  g.fillText('கபாலி', 660, 572, 560);
  g.font = '700 104px system-ui, sans-serif';
  g.fillText('kapali', 1390, 566, 560);
  g.font = '600 30px system-ui, sans-serif';
  g.fillText('h y p e r m a r k e t', 1390, 682);
  g.font = `600 30px ${TAMIL}`;
  g.fillText('ஹைப்பர் மார்க்கெட்', 660, 682);

  // ENTRY / EXIT boxes.
  for (const [x, word, colour] of [[0, 'ENTRY', '#27e06a'], [384, 'EXIT', '#ff3b30']] as const) {
    g.fillStyle = '#0c0c0e';
    g.fillRect(x, 800, 384, 224);
    g.strokeStyle = '#3a3a3e';
    g.lineWidth = 10;
    g.strokeRect(x + 5, 805, 374, 214);
    g.fillStyle = colour;
    g.font = '800 130px system-ui, sans-serif';
    g.fillText(word, x + 192, 918, 330);
  }
  // Offer posters.
  const posters = [
    { bg: '#d81b60', fg: '#fff59d', big: '50% OFF', small: 'தள்ளுபடி விற்பனை' },
    { bg: '#1565c0', fg: '#ffffff', big: 'COMBO ₹99', small: 'Rice + Dal + Oil' },
    { bg: '#2e7d32', fg: '#fffde7', big: 'FRESH', small: 'காய்கறி · பழங்கள்' },
    { bg: '#fdd835', fg: '#b71c1c', big: '1 + 1', small: 'Biscuits & snacks' },
    { bg: '#6a1b9a', fg: '#ffe082', big: 'NEW', small: 'Festival stock in' },
  ];
  posters.forEach((p, i) => {
    const x = 768 + i * 256;
    g.fillStyle = p.bg;
    g.fillRect(x, 800, 256, 224);
    g.fillStyle = 'rgba(255,255,255,0.16)';
    g.beginPath();
    g.arc(x + 210, 830, 90, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = '#ffffff';
    g.lineWidth = 6;
    g.strokeRect(x + 8, 808, 240, 208);
    g.fillStyle = p.fg;
    g.font = '900 64px system-ui, sans-serif';
    g.fillText(p.big, x + 128, 890, 220);
    g.font = `700 26px ${TAMIL}`;
    g.fillText(p.small, x + 128, 962, 220);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Walk-in supermarkets on their reserved lots (layout.SUPERMARKET_LOTS): a tall clad fascia with
 * the name (two looks: orange panels, or a black frame round a white panel), aluminium-framed
 * glass front with posters, goods and trolleys outside, an open entrance, aisles of stocked shelves (products are one InstancedMesh), a drinks fridge,
 * a checkout counter with a cashier. Lit from inside (emissive), so no extra lights.
 * Pick items into a basket at the shelves (E), pay at the counter (E). Walk out without paying
 * and the cashier calls the police.
 */
export function createSupermarkets(scene: THREE.Scene, world: RAPIER.World, cashierAsset: CharacterAsset) {
  const shell = new GeoBuilder(); // outside walls + roof
  const inside = new GeoBuilder(); // interior: floor, shelves, counter (self-lit)
  const stores: Store[] = [];
  const products: THREE.Matrix4[] = [];
  const productColours: THREE.Color[] = [];
  const glassPanes: THREE.Matrix4[] = [];
  const pictures = new GeoBuilder(); // fascia names, ENTRY / EXIT, posters: one atlas, one draw call
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  for (const lot of SUPERMARKET_LOTS()) {
    const yaw = lot.facing === 's' ? 0 : -Math.PI / 2; // entrance faces south or west
    const cx = (lot.x0 + lot.x1) / 2;
    const cz = (lot.z0 + lot.z1) / 2;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const toWorld = (x: number, z: number, out = new THREE.Vector3()) => out.set(cx + x * cos + z * sin, 0, cz - x * sin + z * cos);
    const toLocal = (p: THREE.Vector3) => {
      const dx = p.x - cx;
      const dz = p.z - cz;
      return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
    };
    const q = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    const tmp = new THREE.Vector3();
    /** Box in store space (y = bottom), optional collider. */
    const box = (b: GeoBuilder, w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.Color, collide = true) => {
      const p = toWorld(x, z, tmp);
      b.box(w, h, d, p.x, y + h / 2, p.z, c, yaw);
      if (collide) {
        const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, y + h / 2, p.z).setRotation(q));
        world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2), rb);
      }
    };

    // Shell: back + side walls, glass front either side of the entrance, roof.
    const variant = stores.length % 2; // 0: orange-clad front, 1: black frame round a white panel
    const accent = variant === 0 ? ORANGE : DARK;
    const front = D / 2;
    const pt = (x: number, y: number, z: number) => {
      const p = toWorld(x, z);
      p.y = y;
      return p;
    };
    const FRONT = new THREE.Vector3(sin, 0, cos);
    /** Picture from the atlas on a flat panel facing the street (store space, y from the ground). */
    const picture = (x0: number, x1: number, y0: number, y1: number, z: number, r: readonly number[]) => {
      const u0 = r[0] / ATLAS.w;
      const u1 = (r[0] + r[2]) / ATLAS.w;
      const v1 = 1 - r[1] / ATLAS.h;
      const v0 = 1 - (r[1] + r[3]) / ATLAS.h;
      pictures.quad(pt(x0, y0, z), pt(x1, y0, z), pt(x1, y1, z), pt(x0, y1, z), [[u0, v0], [u1, v0], [u1, v1], [u0, v1]], PICTURE_WHITE, FRONT);
    };
    /** Something for sale outside: one coloured packet / box (shares the shelves' instanced mesh). */
    const goods = (x: number, y: number, z: number, w: number, h: number, d: number, colour?: number) => {
      const p = pt(x, y + h / 2, z);
      products.push(new THREE.Matrix4().compose(p, q, new THREE.Vector3(w, h, d)));
      productColours.push(new THREE.Color(colour ?? PRODUCT_COLOURS[Math.floor(rand() * PRODUCT_COLOURS.length)]));
    };

    box(shell, W, H, WALL, 0, FLOOR_Y, -D / 2 + WALL / 2, SIDE);
    box(shell, WALL, H, D, -W / 2 + WALL / 2, FLOOR_Y, 0, SIDE);
    box(shell, WALL, H, D, W / 2 - WALL / 2, FLOOR_Y, 0, SIDE);
    const side = (W - DOOR) / 2;
    for (const s of [-1, 1]) {
      const x = s * (DOOR / 2 + side / 2);
      box(shell, side, PLINTH, WALL + 0.1, x, FLOOR_Y, front - WALL / 2, accent); // plinth under the glass
      box(shell, side, H - GLASS_TOP, WALL, x, FLOOR_Y + GLASS_TOP, front - WALL / 2, SIDE); // wall over the glass (behind the fascia)
      // Glass pane (instanced, transparent) + its collider.
      const p = toWorld(x, front - WALL / 2);
      glassPanes.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, FLOOR_Y + PLINTH + (GLASS_TOP - PLINTH) / 2, p.z), q, new THREE.Vector3(side, GLASS_TOP - PLINTH, 0.05)));
      const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, FLOOR_Y + H / 2, p.z).setRotation(q));
      world.createCollider(RAPIER.ColliderDesc.cuboid(side / 2, H / 2, WALL / 2), rb);
      // Aluminium shopfront frame: uprights and a transom.
      for (let k = 0; k <= 3; k++) box(shell, 0.09, GLASS_TOP - PLINTH, 0.12, x - side / 2 + (k * side) / 3, FLOOR_Y + PLINTH, front - 0.06, ALU, false);
      box(shell, side, 0.08, 0.12, x, FLOOR_Y + 2.45, front - 0.06, ALU, false);
      // Clad corner pier framing the front.
      box(shell, 0.55, GLASS_TOP, 0.55, s * (W / 2 - 0.07), FLOOR_Y, front + 0.1, accent, false);
      // Offer posters stuck on the glass.
      for (const [k, px] of [[0, -1.9], [1, 1.5]] as const) picture(x + px - 0.55, x + px + 0.55, FLOOR_Y + 1.15, FLOOR_Y + 2.3, front + 0.03, ATLAS.posters[(k + (s > 0 ? 2 : 0) + variant) % ATLAS.posters.length]);
    }
    box(shell, DOOR, H - GLASS_TOP, WALL, 0, FLOOR_Y + GLASS_TOP, front - WALL / 2, SIDE); // lintel
    box(shell, W + 0.4, 0.3, D + 0.4, 0, FLOOR_Y + H, 0, WHITE); // roof (also stops the camera)
    // Tall clad fascia across the whole front carrying the name (the picture covers its face).
    box(shell, W + 0.6, FASCIA_H, 0.7, 0, FLOOR_Y + GLASS_TOP, front + 0.35, accent, false);
    picture(-W / 2 - 0.3, W / 2 + 0.3, FLOOR_Y + GLASS_TOP, FLOOR_Y + GLASS_TOP + FASCIA_H, front + 0.71, ATLAS.fascia[variant]);
    // ENTRY / EXIT boards over the doorway, a door mat.
    picture(-1.45, -0.25, FLOOR_Y + 2.75, FLOOR_Y + 3.2, front + 0.02, ATLAS.entry);
    picture(0.25, 1.45, FLOOR_Y + 2.75, FLOOR_Y + 3.2, front + 0.02, ATLAS.exit);
    box(shell, 2.6, 0.02, 1.0, 0, FLOOR_Y, front + 0.6, new THREE.Color(0x7a2e2e), false);
    if (variant === 0) {
      // Soffit over the pavement with a row of downlights.
      box(shell, W + 0.6, 0.16, 1.9, 0, FLOOR_Y + GLASS_TOP - 0.16, front + 0.95, ORANGE, false);
      for (let lx = -6.5; lx <= 6.5; lx += 2.6) box(inside, 0.3, 0.03, 0.3, lx, FLOOR_Y + GLASS_TOP - 0.19, front + 1.1, WHITE, false);
    } else {
      // Fabric awning sloping out over the pavement (seen from above and below).
      const a0 = pt(-W / 2, FLOOR_Y + GLASS_TOP, front + 0.7);
      const a1 = pt(W / 2, FLOOR_Y + GLASS_TOP, front + 0.7);
      const a2 = pt(W / 2, FLOOR_Y + GLASS_TOP - 0.6, front + 2.3);
      const a3 = pt(-W / 2, FLOOR_Y + GLASS_TOP - 0.6, front + 2.3);
      const uv = [[0, 0], [1, 0], [1, 1], [0, 1]];
      shell.quad(a0, a1, a2, a3, uv, AWNING, UP);
      shell.quad(a0, a1, a2, a3, uv, AWNING.clone().multiplyScalar(0.7), DOWN);
      box(shell, W, 0.12, 0.06, 0, FLOOR_Y + GLASS_TOP - 0.72, front + 2.3, WHITE, false); // valance
    }
    // Goods outside, against the front (the pavement stays clear):
    // a rail of hanging packets and a banner on each side...
    const rail = (x0: number, x1: number, poster: number) => {
      const mid = (x0 + x1) / 2;
      for (const x of [x0, x1]) box(shell, 0.05, 1.9, 0.05, x, FLOOR_Y, front + 0.55, ALU, false);
      for (const y of [1.05, 1.9]) box(shell, x1 - x0, 0.04, 0.04, mid, FLOOR_Y + y, front + 0.55, ALU, false);
      for (let x = x0 + 0.2; x < x1 - 0.1; x += 0.24) goods(x, FLOOR_Y + 1.45 + rand() * 0.1, front + 0.55, 0.2, 0.34, 0.05);
      picture(x0 + 0.05, x1 - 0.05, FLOOR_Y + 0.25, FLOOR_Y + 1.0, front + 0.6, ATLAS.posters[poster]);
      const c = toWorld(mid, front + 0.5);
      const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(c.x, FLOOR_Y + 0.6, c.z).setRotation(q));
      world.createCollider(RAPIER.ColliderDesc.cuboid((x1 - x0) / 2, 0.6, 0.3), rb);
    };
    rail(-6.9, -4.6, variant);
    rail(4.4, 6.9, 3 - variant);
    // ...stacked cartons, water cans, sacks of rice...
    for (let k = 0; k < 5; k++) goods(-3.9 + (k % 3) * 0.55, FLOOR_Y + Math.floor(k / 3) * 0.42, front + 0.5, 0.5, 0.4, 0.45, 0xb98a55);
    for (let k = 0; k < 6; k++) goods(2.3 + (k % 3) * 0.42, FLOOR_Y + Math.floor(k / 3) * 0.5, front + 0.45, 0.36, 0.48, 0.36, 0x3d8fd1);
    for (let k = 0; k < 3; k++) goods(3.75, FLOOR_Y + k * 0.2, front + 0.5, 0.75, 0.19, 0.5, 0xe9e2cf);
    // ...and a row of nested trolleys.
    if (variant === 1) {
      for (let k = 0; k < 6; k++) {
        box(shell, 0.5, 0.42, 0.04, -3.6 + k * 0.28, FLOOR_Y + 0.45, front + 1.1, ALU, false);
        box(shell, 0.04, 0.42, 0.75, -3.6 + k * 0.28 - 0.23, FLOOR_Y + 0.45, front + 0.75, ALU, false);
        goods(-3.6 + k * 0.28, FLOOR_Y + 0.95, front + 0.38, 0.5, 0.05, 0.05, 0xd32f2f);
      }
    }

    // Interior: tiled floor, ceiling panel lights, shelves with products, fridge, counter.
    box(inside, W - 2 * WALL, 0.02, D - 2 * WALL, 0, FLOOR_Y - 0.01, 0, TILE, false);
    for (const lx of [-4.5, 0, 4.5]) for (const lz of [-3.5, 1.5]) box(inside, 2.4, 0.04, 0.5, lx, FLOOR_Y + H - 0.06, lz, WHITE, false);
    /** Shelf unit centred at (x, z), running along `along`: backboard, boards, plinth, top; one collider. */
    const unit = (x: number, z: number, along: 'x' | 'z', len: number, depth: number, h: number, faces: number[], c: THREE.Color) => {
      const [lw, ld] = along === 'z' ? [depth, len] : [len, depth];
      const [bw, bd] = along === 'z' ? [0.08, len] : [len, 0.08];
      box(inside, bw, h, bd, x, FLOOR_Y, z, c, false); // backboard
      box(inside, lw, 0.22, ld, x, FLOOR_Y, z, c, false); // plinth
      for (const y of [...SHELF_LEVELS, h - 0.03]) box(inside, lw, 0.03, ld, x, FLOOR_Y + y - 0.03, z, c, false); // boards
      for (const s of [-1, 1]) box(inside, along === 'z' ? depth : 0.05, h, along === 'z' ? 0.05 : depth, along === 'z' ? x : x + (s * len) / 2, FLOOR_Y, along === 'z' ? z + (s * len) / 2 : z, c, false); // end posts
      const p = toWorld(x, z);
      const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, FLOOR_Y + h / 2, p.z).setRotation(q));
      world.createCollider(RAPIER.ColliderDesc.cuboid(lw / 2, h / 2, ld / 2), rb);
      // Products on every board, on each open face.
      for (const y of SHELF_LEVELS) {
        for (const face of faces) {
          for (let s = -len / 2 + 0.18; s < len / 2 - 0.1; s += 0.26 + rand() * 0.08) {
            const w = 0.14 + rand() * 0.1;
            const ph = 0.16 + rand() * 0.18;
            const off = face * (depth / 2 - 0.13);
            const pp = toWorld(along === 'z' ? x + off : x + s, along === 'z' ? z + s : z + off);
            const size = along === 'z' ? new THREE.Vector3(0.18, ph, w) : new THREE.Vector3(w, ph, 0.18);
            products.push(new THREE.Matrix4().compose(new THREE.Vector3(pp.x, FLOOR_Y + y + ph / 2, pp.z), q, size));
            productColours.push(new THREE.Color(PRODUCT_COLOURS[Math.floor(rand() * PRODUCT_COLOURS.length)]));
          }
        }
      }
    };
    SHELF_X.forEach((x, i) => unit(x, SHELF.z0 + SHELF.len / 2, 'z', SHELF.len, SHELF.depth, SHELF.h, i === 0 ? [1] : [-1, 1], SHELF_C));
    unit(-2.5, -D / 2 + WALL + 0.35, 'x', 9, 0.7, 2.1, [1], new THREE.Color(0xcfd8dc)); // drinks fridge along the back wall
    box(inside, COUNTER.w, COUNTER.h, COUNTER.d, COUNTER.x, FLOOR_Y, COUNTER.z, COUNTER_C);
    box(inside, 0.45, 0.3, 0.4, COUNTER.x + 0.8, FLOOR_Y + COUNTER.h, COUNTER.z, new THREE.Color(0x263238), false); // till

    // Cashier behind the counter, facing the entrance.
    const body = cloneSkinned(cashierAsset.scene);
    const root = new THREE.Group();
    root.add(body);
    root.scale.setScalar(1.62 / CHARACTER_HEIGHT);
    const cp = toWorld(COUNTER.x - 0.4, COUNTER.z - 0.9);
    root.position.set(cp.x, FLOOR_Y, cp.z);
    root.rotation.y = yaw;
    scene.add(root);
    const anim = new Animator(body, cashierAsset.clips);
    anim.play('idle', { fade: 0 });

    stores.push({ name: 'Kapali Supermarket', toWorld, toLocal, yaw, cashier: { root, anim } });
  }

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow: boolean) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    scene.add(m);
  };
  add(shell.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), true);
  // The interior lights itself (store tube lights), so it isn't black under the roof's shadow:
  // emissive = its own colour * 0.45, which brightens the vertex colours instead of washing them white.
  const insideMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  insideMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.45;');
  };
  add(inside.build(), insideMat, false);

  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], colours?: THREE.Color[]) => {
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    colours?.forEach((c, i) => im.setColorAt(i, c));
    scene.add(im);
    return im;
  };
  instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0x333333 }), products, productColours);
  instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xa9cfe0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.3, depthWrite: false }), glassPanes);
  const atlas = atlasTexture();
  add(pictures.build(), new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.5 }), false);

  const local = (s: Store, p: THREE.Vector3) => s.toLocal(p);

  return {
    stores,
    /** The store you're inside, or null. */
    storeAt(p: THREE.Vector3) {
      for (const s of stores) {
        const l = local(s, p);
        if (Math.abs(l.x) < W / 2 - WALL && l.z > -D / 2 && l.z < D / 2 - WALL / 2) return s;
      }
      return null;
    },
    /** Shelf you're standing at inside `store`, or null. */
    shelfAt(store: Store, p: THREE.Vector3): Shelf | null {
      const l = local(store, p);
      for (const s of PICK_SPOTS) if (Math.hypot(l.x - s.x, l.z - s.z) < PICK_RADIUS) return SHELVES[s.shelf];
      return null;
    },
    atCounter(store: Store, p: THREE.Vector3) {
      const l = local(store, p);
      return Math.hypot(l.x - COUNTER.x, l.z - (COUNTER.z + 1.0)) < PAY_RADIUS;
    },
    update(dt: number, playerPos: THREE.Vector3) {
      for (const s of stores) {
        const c = s.cashier.root.position;
        if (Math.hypot(c.x - playerPos.x, c.z - playerPos.z) < ACTIVE_RADIUS) s.cashier.anim.update(dt);
      }
    },
  };
}

export type Basket = FoodItem[];
