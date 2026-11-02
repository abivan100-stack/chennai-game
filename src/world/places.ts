import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { buildAutoModel } from '../vehicles/auto';
import { PLACE_MENUS } from './food';
import type { Eatery } from './eateries';
import { GeoBuilder } from './geo';
import { frame, type Frame } from './kit';
import { BEACH_FAIR, BOAT_CLUB_LOT, CAMPUS_LOT, COLLEGE_LOT, FISH_MARKET, PLACE_LOTS } from './layout';
import { jailerPoster } from './posters';
import { sandY } from './santhome';

/**
 * Neighbourhood places built from code: Nageswara Rao Park and Luz Church on Luz Church Road,
 * the vegetable market and the auto stand (with a chai kadai) south of the tank, a petrol bunk
 * and a mechanic on R.K. Mutt Road, Kamadhenu Cinemas, a bank (ATM) and a pharmacy on Kutchery
 * Road, and on Santhome beach the fish market and the evening fair (merry-go-round, giant wheel).
 *
 * Draw calls: one merged mesh for everything static, one for the night bulbs, one for all the
 * signboards (a single atlas texture), the cinema poster, the merry-go-round and the giant
 * wheel + its cabins. Services (petrol, repair, bank, medicine, sawaari) are returned for
 * main.ts; the snack counters are returned as eateries so the normal menu / eating works.
 */

export type ServiceKind = 'fuel' | 'mechanic' | 'bank' | 'pharmacy' | 'stand';
export interface Service {
  kind: ServiceKind;
  name: string;
  at: THREE.Vector3;
  /** How close you have to be (metres, on the ground plane). */
  radius: number;
  /** Usable from the driver's seat of uncle's auto (petrol, repairs). */
  inAuto: boolean;
}

const C = (hex: number) => new THREE.Color(hex);
const WHITE = C(0xf6f4ee);
const CREAM = C(0xefe2c4);
const GREY = C(0x8f8c86);
const DARK = C(0x2b2b2b);
const STEEL = C(0xb4b9be);
const WOOD = C(0x7a5534);
const GRASS = C(0x5d9440);
const PATH = C(0xcbb994);
const LEAF = C(0x3f7f35);
const TRUNK = C(0x6a5038);
const BLUE = C(0x1e4fa3);
const GREEN = C(0x2e7d32);
const TIN = C(0x8d9aa3);
const TARP = C(0x2f6fbf);

const SIGN_ROW = 128; // atlas row height (px)
/** Every board: [Tamil, English, background, text colour]. */
const SIGNS: [string, string, string, string][] = [
  ['நாகேஸ்வர ராவ் பூங்கா', 'NAGESWARA RAO PARK', '#2e7d32', '#ffffff'],
  ['லஸ் தேவாலயம்', 'OUR LADY OF LIGHT · LUZ CHURCH', '#f3efe2', '#1b3a6b'],
  ['மயிலை காய்கறி சந்தை', 'MYLAPORE VEGETABLE MARKET', '#f2b300', '#5a1a00'],
  ['ஆட்டோ ஸ்டாண்ட் · டீ கடை', 'AUTO STAND · MURUGAN TEA STALL', '#1d1d1d', '#ffd21f'],
  ['மயிலை எரிபொருள் நிலையம்', 'MYLAI FUELS · PETROL BUNK', '#d84315', '#ffffff'],
  ['முருகன் ஆட்டோ ஒர்க்ஸ்', 'MURUGAN AUTO WORKS · MECHANIC', '#263238', '#ffeb3b'],
  ['காமதேனு திரையரங்கம்', 'KAMADHENU CINEMAS', '#7b1fa2', '#ffe082'],
  ['மயிலாப்பூர் கூட்டுறவு வங்கி', 'MYLAPORE CO-OP BANK · ATM', '#0d47a1', '#ffffff'],
  ['ஸ்ரீ ராம் மெடிக்கல்ஸ்', 'SRI RAM MEDICALS · PHARMACY', '#ffffff', '#1b5e20'],
  ['சாந்தோம் மீன் சந்தை', 'SANTHOME FISH MARKET', '#0277bd', '#ffffff'],
  ['சாந்தோம் பீச் திருவிழா', 'SANTHOME BEACH FAIR', '#ad1457', '#fff59d'],
  ['விவேகானந்தா கல்லூரி', 'VIVEKANANDA COLLEGE', '#8d2b1e', '#ffe9b0'],
  ['மெட்ராஸ் படகு சங்கம்', 'MADRAS BOAT CLUB · EST. 1867', '#ffffff', '#0d3b66'],
  ['அடையார் ஆலமர வளாகம்', 'ADYAR BANYAN CAMPUS', '#33691e', '#ffffff'],
];
const SIGN = { park: 0, church: 1, market: 2, stand: 3, bunk: 4, mechanic: 5, cinema: 6, bank: 7, pharmacy: 8, fish: 9, fair: 10, college: 11, boat: 12, campus: 13 };

function signAtlas() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = SIGN_ROW * SIGNS.length;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  SIGNS.forEach(([ta, en, bg, fg], i) => {
    const y = i * SIGN_ROW;
    g.fillStyle = bg;
    g.fillRect(0, y, 1024, SIGN_ROW);
    g.strokeStyle = fg;
    g.lineWidth = 5;
    g.strokeRect(8, y + 8, 1008, SIGN_ROW - 16);
    g.fillStyle = fg;
    g.font = '700 44px "Nirmala UI", "Latha", "Noto Sans Tamil", sans-serif';
    g.fillText(ta, 512, y + 42, 960);
    g.font = '800 40px system-ui, sans-serif';
    g.fillText(en, 512, y + 92, 960);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}


export function createPlaces(scene: THREE.Scene, world: RAPIER.World) {
  const geo = new GeoBuilder();
  const bulbs = new GeoBuilder(); // glow at night
  const signs = new GeoBuilder();
  const services: Service[] = [];
  const eateries: Eatery[] = [];
  const q = new THREE.Quaternion();
  const UP = new THREE.Vector3(0, 1, 0);

  /** Box in a lot's frame (u across, y up from the ground, v inwards), optionally solid. */
  const box = (f: Frame, w: number, h: number, d: number, u: number, y: number, v: number, c: THREE.Color, solid = true, turn = 0) => {
    const p = f.at(u, v);
    geo.box(w, h, d, p.x, y + h / 2, p.z, c, f.yaw + turn);
    if (solid) {
      q.setFromAxisAngle(UP, f.yaw + turn);
      world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(p.x, y + h / 2, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    }
  };
  const shape = (f: Frame, g: THREE.BufferGeometry, u: number, y: number, v: number, c: THREE.Color, turn = 0, target = geo) => {
    const p = f.at(u, v);
    target.add(g, new THREE.Matrix4().makeRotationY(f.yaw + turn).setPosition(p.x, y, p.z), c);
  };
  /** Signboard facing the road, centred at u, bottom at y, standing at depth v. */
  const board = (f: Frame, row: number, u: number, y: number, v: number, w: number, h: number) => {
    const v0 = 1 - (row + 1) / SIGNS.length;
    const v1 = 1 - row / SIGNS.length;
    const out = f.at(0, -1).sub(f.at(0, 0));
    const a = f.at(u + w / 2, v - 0.02, y);
    const b = f.at(u - w / 2, v - 0.02, y);
    const c = f.at(u - w / 2, v - 0.02, y + h);
    const d = f.at(u + w / 2, v - 0.02, y + h);
    signs.quad(a, b, c, d, [[0, v0], [1, v0], [1, v1], [0, v1]], WHITE, out);
  };
  const tree = (f: Frame, u: number, v: number, s = 1) => {
    shape(f, new THREE.CylinderGeometry(0.15 * s, 0.25 * s, 3 * s, 6).translate(0, 1.5 * s, 0), u, 0, v, TRUNK);
    shape(f, new THREE.IcosahedronGeometry(2 * s, 1).scale(1, 0.8, 1), u, 4 * s, v, LEAF);
    const p = f.at(u, v);
    world.createCollider(RAPIER.ColliderDesc.cylinder(1.5 * s, 0.25 * s).setTranslation(p.x, 1.5 * s, p.z));
  };
  const service = (kind: ServiceKind, name: string, at: THREE.Vector3, radius: number, inAuto: boolean) =>
    services.push({ kind, name, at, radius, inAuto });
  const snackBar = (name: string, menu: keyof typeof PLACE_MENUS, spot: THREE.Vector3) =>
    eateries.push({ name, menu: PLACE_MENUS[menu], spot, seat: spot.clone(), seatYaw: 0, eatYaw: 0, table: spot.clone() });
  /** A parked auto as plain coloured geometry (no extra draw calls). */
  const parkedAuto = (p: THREE.Vector3, yaw: number, lift = 0) => {
    const g = new THREE.Group();
    buildAutoModel(g);
    g.position.set(p.x, p.y + lift, p.z);
    g.rotation.y = yaw;
    g.updateMatrixWorld(true);
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      const mat = m.material as THREE.MeshStandardMaterial | undefined;
      if (!m.isMesh || !mat || mat.transparent) return;
      geo.add(m.geometry, m.matrixWorld, mat.color);
    });
    q.setFromAxisAngle(UP, yaw);
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.75, 0.9, 1.5).setTranslation(p.x, p.y + lift + 0.9, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
  };

  const lots = PLACE_LOTS();

  // ---- Nageswara Rao Park: railing, lawn, a path loop, benches, trees, swings, fountain ----
  {
    const f = frame(lots.park);
    const { w, d } = f;
    box(f, w - 1, 0.03, d - 1, 0, 0, d / 2, GRASS, false);
    const ring = (inset: number, c: THREE.Color, y: number) => {
      box(f, w - 2 * inset, 0.02, 1.6, 0, y, inset, c, false);
      box(f, w - 2 * inset, 0.02, 1.6, 0, y, d - inset, c, false);
      box(f, 1.6, 0.02, d - 2 * inset, -w / 2 + inset, y, d / 2, c, false);
      box(f, 1.6, 0.02, d - 2 * inset, w / 2 - inset, y, d / 2, c, false);
    };
    ring(3.5, PATH, 0.035);
    box(f, 2.4, 0.02, 3.5, 0, 0.035, 1.75, PATH, false); // from the gate
    // Railing with a gate gap on the road side: low cream wall, green bars, a top rail.
    const gate = 3;
    const side = (w - gate) / 2;
    const railing = (len: number, u: number, v: number, alongU: boolean) => {
      const [lw, ld] = alongU ? [len, 0.25] : [0.25, len];
      box(f, lw, 0.35, ld, u, 0, v, CREAM, false);
      const p = f.at(u, v);
      q.setFromAxisAngle(UP, f.yaw);
      world.createCollider(RAPIER.ColliderDesc.cuboid(lw / 2, 0.6, ld / 2).setTranslation(p.x, 0.6, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
      box(f, alongU ? len : 0.3, 0.06, alongU ? 0.3 : len, u, 1.1, v, GREEN, false);
      const n = Math.floor(len / 0.6);
      for (let i = 0; i <= n; i++) {
        const t = -len / 2 + (i * len) / n;
        box(f, 0.05, 0.75, 0.05, alongU ? u + t : u, 0.35, alongU ? v : v + t, GREEN, false);
      }
    };
    for (const s of [-1, 1]) {
      railing(side, s * (gate / 2 + side / 2), 0.2, true);
      box(f, 0.5, 1.5, 0.5, s * (gate / 2 + 0.25), 0, 0.2, CREAM);
    }
    railing(w, 0, d - 0.2, true);
    railing(d, -w / 2 + 0.2, d / 2, false);
    railing(d, w / 2 - 0.2, d / 2, false);
    board(f, SIGN.park, -side / 2 - gate / 2, 1.2, 0.1, 7, 0.9);
    // Benches facing the path.
    for (const [u, v, t] of [[-8, 5.6, 0], [8, 5.6, 0], [-8, d - 5.6, Math.PI], [8, d - 5.6, Math.PI]] as const) {
      box(f, 2, 0.08, 0.5, u, 0.45, v, WOOD, false, t);
      box(f, 2, 0.5, 0.08, u, 0.5, v + (t ? -0.25 : 0.25), WOOD, false, t);
      box(f, 1.8, 0.45, 0.4, u, 0, v, GREY, true, t);
    }
    // Fountain in the middle, trees around it.
    const mid = d / 2;
    shape(f, new THREE.CylinderGeometry(2.4, 2.6, 0.6, 16), 0, 0.3, mid, CREAM);
    shape(f, new THREE.CylinderGeometry(2.1, 2.1, 0.05, 16), 0, 0.58, mid, C(0x4f9fc9));
    shape(f, new THREE.CylinderGeometry(0.25, 0.4, 1.6, 8), 0, 1.1, mid, CREAM);
    world.createCollider(RAPIER.ColliderDesc.cylinder(0.4, 2.6).setTranslation(f.at(0, mid).x, 0.4, f.at(0, mid).z));
    for (const [u, v, s] of [[-11, 8, 1.1], [11, 8, 1], [-12, d - 2.5, 1.2], [12, d - 2.5, 1], [-5, d - 2, 0.9], [5, 9, 0.8]] as const) tree(f, u, v, s);
    // Kids' corner: swing frame + slide.
    const su = 9;
    const sv = mid + 1;
    for (const s of [-1, 1]) box(f, 0.1, 2.4, 0.1, su + s * 1.4, 0, sv, C(0xd84315));
    box(f, 3, 0.1, 0.1, su, 2.4, sv, C(0xd84315), false);
    for (const s of [-0.6, 0.6]) box(f, 0.5, 0.05, 0.25, su + s, 0.5, sv, C(0x1565c0), false);
    box(f, 0.8, 1.6, 0.8, -su, 0, sv, C(0xf9a825));
    box(f, 0.7, 0.06, 3, -su, 0.85, sv + 1.6, C(0x1565c0), false, 0);
  }

  // ---- Luz Church: white facade with a pediment and a bell tower, compound wall ----
  {
    const f = frame(lots.church);
    const set = 6;
    const nave = { w: 12, h: 9, d: 16 };
    box(f, nave.w, nave.h, nave.d, 0, 0, set + nave.d / 2, WHITE);
    box(f, nave.w + 0.4, 0.4, nave.d + 0.4, 0, nave.h, set + nave.d / 2, CREAM, false);
    // Facade: tall front wall, pediment steps, a tower with a cross.
    box(f, nave.w + 2, 11, 1.2, 0, 0, set + 0.6, WHITE);
    box(f, 9, 1.4, 1.2, 0, 11, set + 0.6, WHITE, false);
    box(f, 5, 1.4, 1.2, 0, 12.4, set + 0.6, WHITE, false);
    box(f, 3, 4, 3, 0, 13.8, set + 1.5, WHITE, false);
    shape(f, new THREE.ConeGeometry(2.1, 3, 4).rotateY(Math.PI / 4), 0, 19.3, set + 1.5, C(0xc9a24a));
    box(f, 0.25, 2, 0.25, 0, 20.6, set + 1.5, C(0xffd54f), false);
    box(f, 1.2, 0.25, 0.25, 0, 21.8, set + 1.5, C(0xffd54f), false);
    box(f, 2.2, 3.6, 0.1, 0, 0, set - 0.05, C(0x4a2e1c), false); // door
    for (const s of [-1, 1]) {
      box(f, 0.6, 9, 0.6, s * 3.2, 0, set - 0.2, CREAM, false); // pilasters
      box(f, 0.6, 9, 0.6, s * 6.6, 0, set - 0.2, CREAM, false);
      box(f, 1.2, 2.2, 0.08, s * 4.9, 4.5, set - 0.05, C(0x5a7fa8), false); // windows
    }
    box(f, 1.6, 1.6, 0.08, 0, 7.2, set - 0.05, C(0x3d6fa8), false); // rose window
    box(f, 6, 0.3, 2.5, 0, 0, set - 1.25, GREY, false); // steps
    board(f, SIGN.church, 0, 0.3, 0.35, 8, 1);
    // Compound wall with a gate.
    const gate = 6;
    const side = (f.w - gate) / 2;
    for (const s of [-1, 1]) box(f, side, 1.2, 0.25, s * (gate / 2 + side / 2), 0, 0.2, CREAM);
    box(f, 0.25, 1.2, f.d, -f.w / 2, 0, f.d / 2, CREAM);
    box(f, 0.25, 1.2, f.d, f.w / 2, 0, f.d / 2, CREAM);
    // Mary's grotto in the yard.
    box(f, 1.6, 2.2, 1, -9, 0, 3.5, C(0x9e9a90));
    box(f, 0.5, 1.2, 0.3, -9, 0.9, 2.9, C(0x90caf9), false);
    tree(f, 9, 3.5, 0.9);
  }

  // ---- Vegetable market: tin-roofed shed, rows of stalls with heaps ----
  {
    const f = frame(lots.market);
    const { w, d } = f;
    for (const u of [-w / 2 + 0.5, 0, w / 2 - 0.5]) for (const v of [1, d / 2, d - 1]) box(f, 0.2, 3.6, 0.2, u, 0, v, STEEL);
    box(f, w + 0.6, 0.1, d - 0.4, 0, 3.7, d / 2, TIN, false, 0);
    const heaps = [C(0xd32f2f), C(0x7b1fa2), C(0x558b2f), C(0xf9a825), C(0xff7043), C(0xfafafa), C(0x8d6e63), C(0x2e7d32)];
    const heap = new THREE.IcosahedronGeometry(0.32, 0).scale(1, 0.6, 1);
    let k = 0;
    for (const v of [4, 9, 14]) {
      for (const u of [-5.5, 0, 5.5]) {
        box(f, 3.6, 0.8, 1.4, u, 0, v, WOOD);
        box(f, 3.8, 0.04, 1.6, u, 0.8, v, C(0x6d4c41), false);
        for (let i = 0; i < 4; i++) shape(f, heap, u - 1.3 + i * 0.86, 0.9, v, heaps[k++ % heaps.length]);
        // Hanging banana bunch on the shed pole side.
        shape(f, new THREE.IcosahedronGeometry(0.22, 0).scale(1, 1.6, 1), u + 1.6, 2.4, v - 0.6, C(0xfdd835));
      }
    }
    board(f, SIGN.market, 0, 3.9, 0.2, 9, 1.1);
  }

  // ---- Auto stand + chai kadai ----
  {
    const f = frame(lots.stand);
    const { w } = f;
    // Shelter with a bench.
    for (const u of [-w / 2 + 1, w / 2 - 5]) for (const v of [1.2, 5]) box(f, 0.15, 2.8, 0.15, u, 0, v, C(0xf9a825));
    box(f, w - 3, 0.12, 4.6, -2, 2.8, 3.1, C(0x1565c0), false);
    box(f, 5, 0.45, 0.6, -2, 0, 4.6, GREY);
    board(f, SIGN.stand, -2, 3, 0.75, 6.5, 0.8);
    parkedAuto(f.at(-4.5, 8.5), f.yaw);
    parkedAuto(f.at(-1.2, 8.5), f.yaw);
    // Chai kadai: counter, big kettle, glass jars, a bench.
    const cu = w / 2 - 2.4;
    box(f, 3.4, 1.05, 1.2, cu, 0, 3, C(0x8d2b2b));
    box(f, 3.6, 0.06, 1.4, cu, 1.05, 3, STEEL, false);
    for (const v of [2.4, 5.6]) for (const s of [-1, 1]) box(f, 0.1, 2.5, 0.1, cu + s * 1.7, 0, v, WOOD);
    box(f, 3.8, 0.1, 3.8, cu, 2.5, 4, C(0x00897b), false);
    box(f, 3.4, 1.4, 0.1, cu, 1.1, 5.6, C(0x6d4c41), false);
    shape(f, new THREE.CylinderGeometry(0.22, 0.28, 0.45, 10), cu + 1, 1.3, 3, STEEL);
    for (let i = 0; i < 3; i++) shape(f, new THREE.CylinderGeometry(0.12, 0.12, 0.3, 8), cu - 1.2 + i * 0.35, 1.25, 3.2, C(0xd7ccc8));
    box(f, 2.2, 0.45, 0.4, cu, 0, 0.9, WOOD);
    const p = f.at(cu, 1.6);
    snackBar('Murugan Tea Stall', 'chai', new THREE.Vector3(p.x, 0, p.z));
    const sp = f.at(-2, 1);
    service('stand', 'Mylapore auto stand', new THREE.Vector3(sp.x, 0, sp.z), 3.5, false);
  }

  // ---- Petrol bunk: canopy on pillars, two pumps, a kiosk, price board ----
  {
    const f = frame(lots.bunk);
    const { w, d } = f;
    box(f, w - 1, 0.02, d - 1, 0, 0.01, d / 2, C(0x9e9e9e), false); // forecourt
    const pv = 4;
    for (const s of [-1, 1]) box(f, 0.5, 4.6, 0.5, s * 4, 0, pv, WHITE);
    box(f, 13, 0.6, 7, 0, 4.6, pv, WHITE, false);
    box(f, 13.1, 0.3, 7.1, 0, 4.7, pv, C(0xd84315), false);
    for (const s of [-1, 1]) {
      box(f, 0.8, 1.8, 0.6, s * 2, 0, pv, C(0xd84315));
      box(f, 0.7, 0.5, 0.05, s * 2, 1.1, pv - 0.33, C(0x111111), false);
      box(f, 0.84, 0.25, 0.64, s * 2, 1.8, pv, WHITE, false);
    }
    box(f, 5, 3, 4, 0, 0, d - 3, CREAM);
    box(f, 2, 2.2, 0.08, 0, 0, d - 5.05, C(0x5a7fa8), false);
    board(f, SIGN.bunk, 0, 5.3, pv - 3.6, 9, 1.1);
    // Tall price pole by the road.
    box(f, 0.25, 5, 0.25, w / 2 - 1.5, 0, 0.6, STEEL);
    box(f, 1.6, 2, 0.15, w / 2 - 1.5, 5, 0.6, C(0xd84315), false);
    const p = f.at(0, pv);
    service('fuel', 'Mylai Fuels', new THREE.Vector3(p.x, 0, p.z), 11, true);
  }

  // ---- Mechanic: open tin shed, an auto up on a jack, tyre stacks, tool board ----
  {
    const f = frame(lots.mechanic);
    const { w, d } = f;
    for (const u of [-w / 2 + 0.6, w / 2 - 0.6]) for (const v of [1, d - 1]) box(f, 0.2, 3.4, 0.2, u, 0, v, STEEL);
    box(f, w, 0.1, d, 0, 3.4, d / 2, TIN, false);
    box(f, w - 1, 3.4, 0.15, 0, 0, d - 0.6, C(0x546e7a));
    box(f, 3, 1.6, 0.1, -3, 1, d - 0.75, C(0x37474f), false); // tool board
    box(f, w - 1, 0.02, d - 1, 0, 0.01, d / 2, C(0x5d5d5d), false); // oily floor
    parkedAuto(f.at(2.5, d / 2), f.yaw + Math.PI / 2, 0.35);
    box(f, 0.6, 0.35, 0.6, 2.5, 0, d / 2, C(0xd32f2f), false); // jack
    const tyre = new THREE.TorusGeometry(0.32, 0.12, 6, 12).rotateX(Math.PI / 2);
    for (let i = 0; i < 4; i++) shape(f, tyre, -w / 2 + 1.6, 0.12 + i * 0.24, 2, DARK);
    for (let i = 0; i < 3; i++) shape(f, tyre, -w / 2 + 1.6, 0.12 + i * 0.24, 3, DARK);
    box(f, 1.2, 0.9, 0.6, -4, 0, d - 2, C(0xc62828)); // tool chest
    board(f, SIGN.mechanic, 0, 3.55, 0.6, 9, 1);
    const p = f.at(0, 2);
    service('mechanic', 'Murugan Auto Works', new THREE.Vector3(p.x, 0, p.z), 10, true);
  }

  // ---- Kamadhenu Cinemas: big hall, marquee, a JAILER 2 poster on the front ----
  let poster: THREE.Mesh;
  {
    const f = frame(lots.cinema);
    const { w, d } = f;
    const set = 5;
    const hall = { w: w - 4, h: 12, d: d - set - 1 };
    box(f, hall.w, hall.h, hall.d, 0, 0, set + hall.d / 2, C(0xe8dcc8));
    box(f, hall.w + 0.4, 0.6, hall.d + 0.4, 0, hall.h, set + hall.d / 2, C(0x7b1fa2), false);
    box(f, hall.w, 0.5, 3.5, 0, 3.6, set - 1.75, C(0x7b1fa2), false); // marquee
    for (const s of [-1, 1]) box(f, 0.4, 3.6, 0.4, s * (hall.w / 2 - 1), 0, set - 3.3, CREAM);
    for (const s of [-3, 0, 3]) box(f, 2, 2.6, 0.08, s, 0, set - 0.05, C(0x3a1f12), false); // doors
    box(f, 1.6, 1.2, 0.5, -hall.w / 2 + 2.5, 0.9, set - 0.25, C(0xffe082)); // ticket window
    board(f, SIGN.cinema, 0, 4.15, set - 3.5, 12, 1.4);
    // Poster board above the marquee (its own texture).
    const pw = 12;
    const ph = 7;
    const pp = f.at(0, set - 0.12, 4.6 + ph / 2);
    poster = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({ map: jailerPoster(), emissiveMap: null, emissive: 0x000000, roughness: 0.7 }));
    poster.position.copy(pp);
    poster.rotation.y = f.yaw + Math.PI; // faces the road
    // Bulb rows around the marquee.
    for (let i = 0; i < 24; i++) shape(f, new THREE.SphereGeometry(0.09, 6, 4), -hall.w / 2 + 0.6 + (i * (hall.w - 1.2)) / 23, 4.15, set - 3.55, C(0xffe082), 0, bulbs);
  }

  // ---- Bank with an ATM booth ----
  {
    const f = frame(lots.bank);
    box(f, f.w - 1, 7, f.d - 4, 0, 0, 3 + (f.d - 4) / 2, C(0xdfe6ee));
    box(f, f.w - 0.6, 0.4, f.d - 3.6, 0, 3.5, 3 + (f.d - 4) / 2, BLUE, false);
    for (const s of [-1, 1]) box(f, 0.5, 3.5, 0.5, s * 3.5, 0, 2.2, WHITE);
    box(f, 3, 0.2, 2, 0, 3.5, 2, WHITE, false);
    box(f, 2.2, 2.6, 0.08, 0, 0, 2.95, C(0x3b5f7d), false);
    // ATM booth: glass box with a lit panel.
    box(f, 2.4, 2.8, 2.2, f.w / 2 - 2, 0, 3.2, C(0x9fc4d6));
    box(f, 2.5, 0.5, 2.3, f.w / 2 - 2, 2.8, 3.2, BLUE, false);
    box(f, 1.6, 0.3, 0.06, f.w / 2 - 2, 3, 2.03, C(0xffffff), false, 0);
    board(f, SIGN.bank, -1, 4.2, 2.9, 8, 1);
    const p = f.at(f.w / 2 - 2, 1.2);
    service('bank', 'Mylapore Co-op Bank ATM', new THREE.Vector3(p.x, 0, p.z), 2.6, false);
  }

  // ---- Pharmacy: shop with a green cross that lights up ----
  {
    const f = frame(lots.pharmacy);
    box(f, f.w - 0.6, 6.5, f.d - 3, 0, 0, 3 + (f.d - 3) / 2, C(0xf1f8e9));
    box(f, f.w - 1.6, 2.6, 0.08, 0, 0, 2.97, C(0xb3e5fc), false); // glass front
    box(f, f.w - 1.6, 1, 0.8, 0, 0, 3.5, C(0xffffff), false); // counter inside
    board(f, SIGN.pharmacy, 0, 3.1, 2.9, f.w - 1.4, 1);
    for (const [w, h] of [[1.4, 0.45], [0.45, 1.4]]) box(f, w, h, 0.12, f.w / 2 - 1.2, 5 - h / 2, 2.85, C(0x00e676), false, 0);
    box(f, 1.4, 0.45, 0.12, f.w / 2 - 1.2, 4.55, 2.85, C(0x00e676), false);
    const p = f.at(0, 1.6);
    service('pharmacy', 'Sri Ram Medicals', new THREE.Vector3(p.x, 0, p.z), 2.6, false);
  }

  // ---- Vivekananda College: red-brick block with a clock tower, playground, compound wall ----
  {
    const f = frame(COLLEGE_LOT());
    const { w, d } = f;
    const brick = C(0xb5533c);
    const trim = C(0xf3ead8);
    const bv = d - 9; // main block depth position
    box(f, w - 4, 10.5, 8, 0, 0, bv, brick);
    for (const y of [3.5, 7]) box(f, w - 3.8, 0.3, 8.2, 0, y, bv, trim, false);
    box(f, w - 3.6, 0.6, 8.4, 0, 10.5, bv, trim, false);
    for (let i = 0; i < 9; i++) for (const y of [1.4, 4.9, 8.4]) box(f, 1.2, 1.6, 0.08, -w / 2 + 4.5 + i * ((w - 9) / 8), y, bv - 4.03, C(0x2f3d4a), false);
    // Clock tower over the entrance.
    box(f, 4.2, 6, 4.2, 0, 10.5, bv - 1, brick, false);
    box(f, 4.6, 0.4, 4.6, 0, 16.5, bv - 1, trim, false);
    shape(f, new THREE.ConeGeometry(3.1, 3, 4).rotateY(Math.PI / 4), 0, 18.4, bv - 1, C(0x5d4037));
    shape(f, new THREE.CylinderGeometry(1.1, 1.1, 0.12, 20).rotateX(Math.PI / 2), 0, 13.6, bv - 3.13, WHITE);
    box(f, 2.6, 3, 0.1, 0, 0, bv - 4.05, C(0x4a2e1c), false); // door
    // Playground with a cricket pitch and goalposts, trees along the side.
    box(f, w - 6, 0.03, bv - 12, 0, 0, 3 + (bv - 12) / 2, C(0xc8b27a), false);
    box(f, 2.4, 0.04, 14, 0, 0.01, 3 + (bv - 12) / 2, C(0xe2d3a0), false);
    for (const v of [3 + (bv - 12) / 2 - 6.8, 3 + (bv - 12) / 2 + 6.8]) for (const s of [-0.2, 0, 0.2]) box(f, 0.05, 0.7, 0.05, s, 0, v, WHITE, false);
    for (const u of [-w / 2 + 2, w / 2 - 2]) for (let v = 4; v < bv - 5; v += 7) tree(f, u, v, 0.9);
    // Compound wall with the gate arch on Luz Church Road.
    const gate = 6;
    const side = (w - gate) / 2;
    for (const s of [-1, 1]) {
      box(f, side, 1.6, 0.3, s * (gate / 2 + side / 2), 0, 0.2, trim);
      box(f, 0.8, 4.5, 0.8, s * (gate / 2 + 0.4), 0, 0.2, brick);
    }
    box(f, gate + 1.6, 0.5, 0.8, 0, 4.5, 0.2, brick, false);
    board(f, SIGN.college, 0, 5, -0.25, gate + 2, 1.1);
    box(f, 0.3, 1.6, d, -w / 2, 0, d / 2, trim);
    box(f, 0.3, 1.6, d, w / 2, 0, d / 2, trim);
    box(f, w, 1.6, 0.3, 0, 0, d - 0.2, trim);
  }

  // ---- Madras Boat Club on the Adyar's north bank: clubhouse, lawn, jetty and rowing boats ----
  {
    const lot = BOAT_CLUB_LOT();
    const f = frame(lot);
    const { w, d } = f;
    box(f, w - 1, 0.03, d - 0.5, 0, 0, d / 2, GRASS, false);
    box(f, 15, 4.2, 5.5, -4, 0, d - 3.2, WHITE);
    shape(f, new THREE.ConeGeometry(9, 2.2, 4).rotateY(Math.PI / 4).scale(1, 1, 0.42), -4, 5.3, d - 3.2, C(0xa0442a));
    for (let i = 0; i < 6; i++) box(f, 0.25, 3.2, 0.25, -10.5 + i * 2.6, 0, d - 6.3, WHITE);
    box(f, 15.4, 0.25, 1.5, -4, 3.2, d - 5.8, C(0xa0442a), false); // verandah roof
    board(f, SIGN.boat, 6, 1.1, 0.05, 8, 1);
    box(f, 0.8, 1.4, 0.8, 1.5, 0, 0.4, WHITE);
    box(f, w - 2, 1, 0.2, 0, 0, 0.2, WHITE, true, 0);
    // Jetty and boats on the river (seen over the parapet).
    const jy = -0.75;
    box(f, 3, 0.15, 12, 8, jy, d + 6.5, WOOD, false);
    for (const s of [-1.3, 1.3]) for (let v = d + 1; v < d + 13; v += 3) box(f, 0.15, 0.8, 0.15, 8 + s, jy - 0.6, v, C(0x4e342e), false);
    const hull = new THREE.CylinderGeometry(0.28, 0.28, 7.5, 8, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2).scale(1, 0.5, 1);
    for (const [u, v, c] of [[3, d + 4, C(0xf5f5f5)], [2.4, d + 8, C(0x1565c0)], [13, d + 10, C(0xc62828)]] as const) shape(f, hull, u, -0.85, v, c, Math.PI / 2);
  }

  // ---- Adyar Banyan Campus across the river: lawns, a heritage hall, giant banyans ----
  {
    const lot = CAMPUS_LOT();
    const f = frame(lot);
    const { w, d } = f;
    box(f, w - 1, 0.03, d - 1, 0, 0, d / 2, C(0x6b9e45), false);
    box(f, 14, 6, 8, 0, 0, d - 7, C(0xf4efe2));
    for (let i = 0; i < 7; i++) box(f, 0.5, 5, 0.5, -6 + i * 2, 0, d - 11.3, WHITE);
    box(f, 14.6, 0.6, 1.4, 0, 5, d - 11.3, C(0xf4efe2), false);
    shape(f, new THREE.SphereGeometry(2.6, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 6, d - 7, C(0xd7ccc8));
    // Banyans: wide crowns on thick trunks with hanging roots.
    for (const [u, v, s] of [[-11, 7, 1.5], [10, 9, 1.3], [-10, d - 6, 1.1]] as const) {
      shape(f, new THREE.CylinderGeometry(0.5 * s, 0.75 * s, 4.5 * s, 8).translate(0, 2.25 * s, 0), u, 0, v, TRUNK);
      shape(f, new THREE.IcosahedronGeometry(3 * s, 1).scale(1.6, 0.55, 1.6), u, 5.6 * s, v, LEAF);
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        shape(f, new THREE.CylinderGeometry(0.06, 0.08, 4.2 * s, 4).translate(0, 2.1 * s, 0), u + Math.cos(a) * 3 * s, 0, v + Math.sin(a) * 3 * s, TRUNK);
      }
      const p = f.at(u, v);
      world.createCollider(RAPIER.ColliderDesc.cylinder(2.2 * s, 0.75 * s).setTranslation(p.x, 2.2 * s, p.z));
    }
    const gate = 5;
    const side = (w - gate) / 2;
    for (const s of [-1, 1]) box(f, side, 1.4, 0.3, s * (gate / 2 + side / 2), 0, 0.2, C(0xe9e2d0));
    board(f, SIGN.campus, -(gate / 2 + side / 2), 1.5, 0.05, 8, 1);

  }

  // ---- Santhome fish market: tarp roofs, fish tables, ice boxes ----
  {
    const r = FISH_MARKET;
    const f = frame({ ...r, front: 'w' }); // faces the promenade (west)
    const y0 = sandY(r.x0);
    const fish = new THREE.SphereGeometry(0.12, 6, 4).scale(3, 0.6, 1);
    for (const u of [-8, 0, 8]) {
      for (const v of [4, 11]) {
        for (const s of [-1, 1]) for (const t of [-1, 1]) box(f, 0.12, 2.6, 0.12, u + s * 2, y0, v + t * 2, WOOD);
        box(f, 4.6, 0.08, 4.6, u, y0 + 2.6, v, (u + v) % 2 ? TARP : C(0xef6c00), false);
        box(f, 3.4, 0.85, 1.3, u, y0, v, C(0xb0bec5));
        for (let i = 0; i < 6; i++) shape(f, fish, u - 1.3 + (i % 3) * 1.2, y0 + 0.9, v - 0.3 + Math.floor(i / 3) * 0.55, i % 2 ? C(0xcfd8dc) : C(0x90a4ae), 0.3 * i);
        box(f, 0.9, 0.6, 0.6, u + 2.4, y0, v + 1.5, (u + v) % 3 ? C(0x1565c0) : WHITE); // ice box
      }
    }
    box(f, 3, 0.12, 0.12, 0, y0 + 3.5, 0.4, WOOD, false);
    for (const s of [-1, 1]) box(f, 0.15, 3.5, 0.15, s * 3, y0, 0.4, WOOD);
    board(f, SIGN.fish, 0, y0 + 3.6, 0.4, 7, 0.9);
    const p = f.at(0, 4);
    snackBar('Santhome Fish Fry', 'fish', new THREE.Vector3(p.x - 1.2, y0, p.z));
  }

  // ---- Beach fair: merry-go-round, giant wheel, food stalls, balloon seller, bulbs ----
  const spin: { mesh: THREE.Object3D; speed: number }[] = [];
  let cabins: THREE.InstancedMesh;
  const wheel = { x: 0, y: 0, z: 0, r: 8, n: 8 };
  {
    const r = BEACH_FAIR;
    const f = frame({ ...r, front: 'w' });
    const y0 = sandY((r.x0 + r.x1) / 2);
    // Entrance arch with the board.
    for (const s of [-1, 1]) box(f, 0.4, 5, 0.4, s * 4, y0, 0.5, C(0xad1457));
    box(f, 8.8, 0.5, 0.5, 0, y0 + 5, 0.5, C(0xad1457), false);
    board(f, SIGN.fair, 0, y0 + 5.5, 0.5, 8, 1);
    // Food stalls along the north side, with striped awnings.
    const awnings = [C(0xe53935), C(0xfdd835), C(0x43a047), C(0x1e88e5)];
    for (let i = 0; i < 4; i++) {
      const u = -f.w / 2 + 4 + i * 4.2;
      box(f, 3, 1, 1.4, u, y0, 6, WOOD);
      box(f, 3.4, 0.1, 2.2, u, y0 + 2.5, 6.2, awnings[i], false);
      for (const s of [-1, 1]) box(f, 0.1, 2.5, 0.1, u + s * 1.6, y0, 7.1, WOOD);
    }
    const sp = f.at(-f.w / 2 + 8.2, 4.4);
    snackBar('Beach fair stalls', 'fair', new THREE.Vector3(sp.x, y0, sp.z));
    // Balloon seller's bunch.
    const bp = f.at(6, 4);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      bulbs.add(new THREE.SphereGeometry(0.28, 8, 6), new THREE.Matrix4().setPosition(bp.x + Math.cos(a) * 0.5, y0 + 2.6 + (i % 3) * 0.35, bp.z + Math.sin(a) * 0.5), awnings[i % 4]);
    }
    geo.add(new THREE.CylinderGeometry(0.02, 0.02, 2.4, 4), new THREE.Matrix4().setPosition(bp.x, y0 + 1.2, bp.z), C(0xeeeeee));

    // Merry-go-round (spins): base, centre pole, striped canopy, horses on poles.
    const mg = new GeoBuilder();
    mg.add(new THREE.CylinderGeometry(4, 4, 0.4, 24), new THREE.Matrix4().setPosition(0, 0.2, 0), C(0xffecb3));
    mg.add(new THREE.CylinderGeometry(0.4, 0.4, 4, 10), new THREE.Matrix4().setPosition(0, 2.4, 0), C(0xffd54f));
    const canopy = new THREE.ConeGeometry(4.6, 1.8, 16);
    mg.add(canopy, new THREE.Matrix4().setPosition(0, 5.3, 0), C(0xe53935));
    mg.add(new THREE.CylinderGeometry(4.6, 4.6, 0.5, 16, 1, true), new THREE.Matrix4().setPosition(0, 4.2, 0), C(0xfdd835));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const x = Math.cos(a) * 3.1;
      const z = Math.sin(a) * 3.1;
      mg.add(new THREE.CylinderGeometry(0.05, 0.05, 4, 6), new THREE.Matrix4().setPosition(x, 2.4, z), C(0xffd54f));
      const m = new THREE.Matrix4().makeRotationY(-a).setPosition(x, 1.5 + (i % 2) * 0.3, z);
      mg.add(new THREE.BoxGeometry(0.3, 0.5, 1.2), m, i % 2 ? WHITE : C(0x8d6e63));
      mg.add(new THREE.BoxGeometry(0.25, 0.6, 0.3).translate(0, 0.4, 0.5), m, i % 2 ? WHITE : C(0x8d6e63));
    }
    const mgMesh = new THREE.Mesh(mg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }));
    const mp = f.at(-4, 20);
    mgMesh.position.set(mp.x, y0, mp.z);
    mgMesh.castShadow = true;
    scene.add(mgMesh);
    spin.push({ mesh: mgMesh, speed: 0.6 });
    world.createCollider(RAPIER.ColliderDesc.cylinder(1.2, 4.1).setTranslation(mp.x, y0 + 1.2, mp.z));

    // Giant wheel (turns; cabins hang level): two A-frames, rim, spokes.
    const wp = f.at(9, 24);
    Object.assign(wheel, { x: wp.x, y: y0 + wheel.r + 1.5, z: wp.z });
    for (const s of [-1, 1]) {
      for (const t of [-1, 1]) {
        const leg = new THREE.CylinderGeometry(0.12, 0.15, wheel.r + 2.2, 6).rotateZ(t * 0.32).translate(-t * 1.6, (wheel.r + 1.5) / 2, s * 1.1);
        geo.add(leg, new THREE.Matrix4().makeRotationY(f.yaw + Math.PI / 2).setPosition(wp.x, y0, wp.z), STEEL);
      }
    }
    world.createCollider(RAPIER.ColliderDesc.cuboid(2.2, 1, 1.5).setTranslation(wp.x, y0 + 1, wp.z));
    const wg = new GeoBuilder();
    for (const s of [-0.9, 0.9]) wg.add(new THREE.TorusGeometry(wheel.r, 0.1, 6, 40), new THREE.Matrix4().setPosition(0, 0, s), C(0xe0e0e0));
    for (let i = 0; i < wheel.n; i++) {
      const a = (i / wheel.n) * Math.PI;
      wg.add(new THREE.CylinderGeometry(0.06, 0.06, wheel.r * 2, 4), new THREE.Matrix4().makeRotationZ(a), C(0xbdbdbd));
    }
    wg.add(new THREE.CylinderGeometry(0.35, 0.35, 2.2, 10).rotateX(Math.PI / 2), new THREE.Matrix4(), C(0xffd54f));
    const wheelMesh = new THREE.Mesh(wg.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }));
    wheelMesh.position.set(wheel.x, wheel.y, wheel.z);
    wheelMesh.rotation.y = f.yaw + Math.PI / 2;
    wheelMesh.castShadow = true;
    scene.add(wheelMesh);
    spin.push({ mesh: wheelMesh, speed: 0 }); // turned in update() together with the cabins
    const cabinGeo = new THREE.BoxGeometry(1.2, 1.1, 1.4).translate(0, -0.75, 0);
    cabins = new THREE.InstancedMesh(cabinGeo, new THREE.MeshStandardMaterial({ roughness: 0.6 }), wheel.n * 2);
    for (let i = 0; i < wheel.n * 2; i++) cabins.setColorAt(i, awnings[i % 4]);
    cabins.castShadow = true;
    scene.add(cabins);
    // String lights from the arch to the rides.
    const from = f.at(0, 0.5, y0 + 5.2);
    for (const to of [f.at(-4, 20, y0 + 5.6), f.at(9, 24, y0 + 3), f.at(-f.w / 2 + 2, 8, y0 + 2.6)]) {
      for (let i = 1; i < 14; i++) {
        const t = i / 14;
        const p = from.clone().lerp(to, t);
        p.y -= Math.sin(t * Math.PI) * 0.8;
        bulbs.add(new THREE.SphereGeometry(0.08, 6, 4), new THREE.Matrix4().setPosition(p.x, p.y, p.z), awnings[i % 4]);
      }
    }
  }

  // ---- Meshes ----
  const staticMesh = new THREE.Mesh(geo.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  staticMesh.castShadow = staticMesh.receiveShadow = true;
  const bulbMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffe0a0, emissiveIntensity: 0, roughness: 0.4 });
  const bulbMesh = new THREE.Mesh(bulbs.build(), bulbMat);
  const atlas = signAtlas();
  const signMat = new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.6, side: THREE.DoubleSide });
  const signMesh = new THREE.Mesh(signs.build(), signMat);
  scene.add(staticMesh, bulbMesh, signMesh, poster!);
  const posterMat = poster!.material as THREE.MeshStandardMaterial;
  posterMat.emissiveMap = posterMat.map;
  posterMat.emissive.set(0xffffff);
  posterMat.emissiveIntensity = 0;

  let angle = 0;
  const m = new THREE.Matrix4();
  const wheelMesh = spin[1].mesh;
  const axisSide = new THREE.Vector3(Math.cos(wheelMesh.rotation.y), 0, -Math.sin(wheelMesh.rotation.y)); // wheel plane, across
  return {
    services,
    eateries,
    update(dt: number) {
      spin[0].mesh.rotation.y += dt * spin[0].speed;
      angle += dt * 0.12;
      wheelMesh.rotation.z = angle;
      // Cabins hang from the rim, always upright.
      for (let i = 0; i < wheel.n * 2; i++) {
        const a = angle + (i / (wheel.n * 2)) * Math.PI * 2;
        const along = Math.cos(a) * wheel.r;
        m.makeTranslation(wheel.x + axisSide.x * along, wheel.y + Math.sin(a) * wheel.r, wheel.z + axisSide.z * along);
        cabins.setMatrixAt(i, m);
      }
      cabins.instanceMatrix.needsUpdate = true;
    },
    /** 0 = day, 1 = night: boards, bulbs and the poster light up. */
    setNight(f: number) {
      signMat.emissiveIntensity = 0.05 + f * 0.5;
      bulbMat.emissiveIntensity = f * 2.2;
      posterMat.emissiveIntensity = f * 0.55;
    },
  };
}
