import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Eatery } from './eateries';
import { PLACE_MENUS } from './food';
import { GeoBuilder } from './geo';
import { createKit, type Frame, type SignDef } from './kit';
import { BEACH_FAIR, BESANT, FISH_MARKET } from './layout';
import { sandY } from './santhome';

/**
 * Life on Santhome beach and Elliot's Beach: ~70 stalls scattered at random (not in rows) -
 * corn roasters, coconut carts, balloon shooting, bangles, toys, snack tarps - and pastel
 * dessert carts on big spoked wheels (rose milk, jigarthanda, kulfi, falooda), four of which are
 * pushed slowly along the sand in the evening, wheels turning. Events by the clock: kites in the
 * afternoon sky, pony rides, a beach cricket game, and the evening music stage at Elliot's.
 * Draw calls: 2 kits (3 each) + moving carts (2) + kites (2) + ponies (1).
 */

const SEED = 77;
const STALLS = 95;
const DESSERT_CARTS = 18;
const ZONES = [
  { x0: 141, x1: 176, z0: -150, z1: 300 }, // Santhome beach (stalls stay near the promenade)
  { x0: 141, x1: 176, z0: 362, z1: 650 }, // Elliot's Beach
  { x0: 141, x1: 176, z0: -395, z1: -165 }, // Marina Beach
];
const MOVE_SPEED = 0.7; // m/s, a cart being pushed
const KITE_HOURS: [number, number] = [15, 18.5];
const PONY_HOURS: [number, number] = [16, 20];
const STAGE_HOURS: [number, number] = [18, 22];
const CART_MOVE_HOURS: [number, number] = [16, 22];
const STAGE = { x: 170, z: 600 };

const C = (hex: number) => new THREE.Color(hex);
const PASTELS = [0xf8c8dc, 0xbde0fe, 0xcdeac0, 0xffe5a5, 0xe0c3fc, 0xffd6a5, 0xa0e7e5].map(C);
const BRIGHT = [0xe63946, 0x2a9d8f, 0xf4a261, 0x457b9d, 0xe9c46a, 0x8338ec, 0xff006e, 0x06d6a0].map(C);
const WOOD = C(0x8b5a2b);
const STEEL = C(0xb0b6bb);
const DARK = C(0x2b2b2b);
const WHITE = C(0xffffff);

const DESSERTS: { name: string; ta: string; bg: string; fg: string }[] = [
  { name: 'Rose Milk Station', ta: 'ரோஸ் மில்க்', bg: '#f8c8dc', fg: '#8a2846' },
  { name: 'Jigarthanda Junction', ta: 'ஜிகர்தண்டா', bg: '#5c3d2e', fg: '#f6e3c3' },
  { name: 'Kulfi Wala', ta: 'குல்ஃபி', bg: '#ffe5a5', fg: '#7a4a00' },
  { name: 'Falooda Factory', ta: 'ஃபலூடா', bg: '#e0c3fc', fg: '#4a1d6b' },
  { name: 'Gola Ganda', ta: 'ஐஸ் கோலா', bg: '#bde0fe', fg: '#023e8a' },
  { name: 'Cotton Candy Cloud', ta: 'பஞ்சு மிட்டாய்', bg: '#ffc8dd', fg: '#c9184a' },
  { name: 'Gelato Gaadi', ta: 'ஜெலாட்டோ வண்டி', bg: '#cdeac0', fg: '#2d6a4f' },
  { name: 'Waffle on Wheels', ta: 'வாஃபிள் வண்டி', bg: '#ffd6a5', fg: '#9c4a1a' },
  { name: 'Paal Kova Corner', ta: 'பால்கோவா', bg: '#fff1e6', fg: '#8a5a44' },
  { name: 'Ice Cream Thatha', ta: 'ஐஸ்கிரீம் தாத்தா', bg: '#a0e7e5', fg: '#05668d' },
  { name: 'Sundae Sunset', ta: 'சண்டே சன்செட்', bg: '#ffb4a2', fg: '#6d2e46' },
  { name: 'Payasam Point', ta: 'பாயசம்', bg: '#fefae0', fg: '#bc6c25' },
  { name: 'Mango Mastani', ta: 'மாம்பழ மஸ்தானி', bg: '#ffd166', fg: '#7f4f24' },
  { name: 'Choco Lava Cart', ta: 'சாக்கோ லாவா', bg: '#3d2b1f', fg: '#f6e3c3' },
  { name: 'Badam Milk Bandi', ta: 'பாதாம் பால்', bg: '#fff3b0', fg: '#9e6b00' },
  { name: 'Kalakand Corner', ta: 'கலாகந்த்', bg: '#f1faee', fg: '#1d3557' },
  { name: 'Ice Ball Annan', ta: 'ஐஸ் பால்', bg: '#caf0f8', fg: '#0077b6' },
  { name: 'Beach Brownies', ta: 'பிரவுனி', bg: '#6f4518', fg: '#ffe8d6' },
];
const STAGE_SIGN = DESSERTS.length;

function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}
const inHours = (h: number, [a, b]: [number, number]) => h >= a && h < b;

/** A frame at a point with a yaw (front = local -v, like the lot frames). */
function spotFrame(x: number, z: number, yaw: number): Frame {
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return { yaw, w: 0, d: 0, at: (u: number, v: number, y = 0) => new THREE.Vector3(x + u * c + v * s, y, z - u * s + v * c) };
}

/** Spoked cart wheel lying in the local YZ plane (axle along x), radius r. */
function wheelGeometry(r: number) {
  const g = new GeoBuilder();
  g.add(new THREE.TorusGeometry(r, 0.035, 5, 18).rotateY(Math.PI / 2), new THREE.Matrix4(), DARK);
  for (let i = 0; i < 6; i++) g.add(new THREE.CylinderGeometry(0.015, 0.015, r * 2, 4).rotateX((i / 6) * Math.PI), new THREE.Matrix4(), STEEL);
  g.add(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8).rotateZ(Math.PI / 2), new THREE.Matrix4(), STEEL);
  return g.build();
}

export function createBeachLife(scene: THREE.Scene, world: RAPIER.World, obstacles: { x: number; z: number; r: number }[]) {
  const signs: SignDef[] = [...DESSERTS.map((d): SignDef => [d.ta, d.name.replace('Moving: ', '').toUpperCase(), d.bg, d.fg]), ['இசை இரவு · எலியட்ஸ் கடற்கரை', 'BEACH MUSIC NIGHT · LIVE', '#14213d', '#fca311']];
  const k = createKit(world, signs);
  const stageKit = createKit(world, signs);
  const eateries: Eatery[] = [];
  const rand = seeded(SEED);
  const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)];

  // Keep clear of everything already on the sand, and of each other.
  const taken: { x: number; z: number; r: number }[] = [
    ...obstacles,
    ...[FISH_MARKET, BEACH_FAIR].map((r) => ({ x: (r.x0 + r.x1) / 2, z: (r.z0 + r.z1) / 2, r: Math.hypot(r.x1 - r.x0, r.z1 - r.z0) / 2 + 3 })),
    { x: (BESANT.temple.x0 + BESANT.temple.x1) / 2, z: (BESANT.temple.z0 + BESANT.temple.z1) / 2, r: 20 },
    { x: BESANT.memorial.x, z: BESANT.memorial.z, r: 6 },
    { x: 142, z: 478, r: 8 }, // Elliot's board
    { x: 138, z: -255, r: 9 }, // Marina arch
    { x: STAGE.x, z: STAGE.z, r: 16 },
    { x: 160, z: 210, r: 14 }, // cricket pitch
    ...Array.from({ length: 13 }, (_, i) => ({ x: 142, z: 390 + i * 17, r: 3 })), // Elliot's carts
  ];
  const freeSpot = (r: number) => {
    for (let tries = 0; tries < 200; tries++) {
      const zone = pick(ZONES);
      const x = zone.x0 + rand() * (zone.x1 - zone.x0);
      const z = zone.z0 + rand() * (zone.z1 - zone.z0);
      if (taken.some((o) => Math.hypot(o.x - x, o.z - z) < o.r + r)) continue;
      taken.push({ x, z, r });
      // Mostly facing the promenade (west), turned a little at random.
      return { x, z, yaw: Math.PI / 2 + (rand() - 0.5) * 1.6 };
    }
    return null;
  };

  // ---- Scattered stalls ----
  const stallKinds = ['tarp', 'corn', 'coconut', 'balloons', 'bangles', 'toys'] as const;
  for (let n = 0; n < STALLS; n++) {
    const s = freeSpot(3.2);
    if (!s) break;
    const f = spotFrame(s.x, s.z, s.yaw);
    const y = sandY(s.x);
    const kind = stallKinds[n % stallKinds.length];
    const top = pick(BRIGHT);
    if (kind === 'tarp' || kind === 'toys' || kind === 'bangles') {
      for (const [u, v] of [[-1.3, -0.8], [1.3, -0.8], [-1.3, 0.8], [1.3, 0.8]]) k.box(f, 0.08, 2.4, 0.08, u, y, v, WOOD, false);
      k.shape(f, new THREE.BoxGeometry(3, 0.06, 2.2).rotateX(0.18), 0, y + 2.4, 0, top);
      k.box(f, 2.4, 0.85, 0.9, 0, y, -0.4, WOOD);
      for (let i = 0; i < 8; i++) {
        const g = kind === 'bangles' ? new THREE.TorusGeometry(0.1, 0.025, 4, 10) : kind === 'toys' ? new THREE.BoxGeometry(0.22, 0.22, 0.22) : new THREE.SphereGeometry(0.12, 6, 4);
        k.shape(f, g, -1 + (i % 4) * 0.65, y + 0.95 + Math.floor(i / 4) * 0.25, -0.4 - (i % 2) * 0.2, pick(BRIGHT));
      }
    } else if (kind === 'corn') {
      k.box(f, 1.2, 0.8, 0.8, 0, y + 0.25, 0, C(0x6d6875));
      k.box(f, 1.1, 0.12, 0.7, 0, y + 1.05, 0, C(0xff7b00), false, 0); // coals
      k.shape(f, new THREE.BoxGeometry(1.1, 0.12, 0.7), 0, y + 1.06, 0, C(0xff5400), 0, k.bulbs); // glowing at night
      for (let i = 0; i < 5; i++) k.shape(f, new THREE.CylinderGeometry(0.05, 0.05, 0.4, 6).rotateZ(Math.PI / 2), -0.4 + i * 0.2, y + 1.18, 0, C(0xffd60a));
      for (const v of [-0.45, 0.45]) k.shape(f, wheelGeometry(0.28), 0, y + 0.28, v, WHITE, Math.PI / 2); // axle across, rolls along the cart
      const p = f.at(0, -1);
      eateries.push({ name: 'Bhutta (roast corn) cart', menu: PLACE_MENUS.fair, spot: new THREE.Vector3(p.x, y, p.z), seat: p.clone(), seatYaw: 0, eatYaw: 0, table: p.clone() });
    } else if (kind === 'coconut') {
      k.box(f, 1.8, 0.12, 1.1, 0, y + 0.6, 0, WOOD);
      for (const v of [-0.6, 0.6]) k.shape(f, wheelGeometry(0.32), 0, y + 0.32, v, WHITE, Math.PI / 2);
      for (let i = 0; i < 12; i++) k.shape(f, new THREE.SphereGeometry(0.17, 7, 5), -0.6 + (i % 4) * 0.4, y + 0.82 + Math.floor(i / 4) * 0.2, -0.3 + (i % 3) * 0.3, C(0x55a630));
      k.solid(f, 1.8, 1, 1.1, 0, y, 0);
    } else {
      // Balloon shooting: a board of balloons, a counter, toy guns.
      k.box(f, 2.6, 2, 0.1, 0, y + 0.4, 0.8, C(0x14213d));
      for (let i = 0; i < 24; i++) k.shape(f, new THREE.SphereGeometry(0.1, 6, 4), -1.1 + (i % 8) * 0.31, y + 0.65 + Math.floor(i / 8) * 0.55, 0.7, pick(BRIGHT));
      k.box(f, 2.4, 0.9, 0.5, 0, y, -0.6, C(0xd62828));
      for (const u of [-0.6, 0.6]) k.box(f, 0.5, 0.06, 0.06, u, y + 0.95, -0.6, DARK, false);
      for (const u of [-1.3, 1.3]) k.box(f, 0.08, 2.6, 0.08, u, y, 0.8, WOOD, false);
    }
  }

  // ---- Static dessert carts: pastel, big wheels, umbrella, a display of scoops, lights ----
  const dessertCart = (f: Frame, y: number, i: number, kit = k) => {
    const body = PASTELS[i % PASTELS.length];
    kit.box(f, 1.8, 0.9, 0.9, 0, y + 0.45, 0, body);
    kit.box(f, 1.9, 0.08, 1, 0, y + 1.35, 0, WHITE, false);
    kit.box(f, 1.4, 0.35, 0.6, 0, y + 1.43, 0, C(0xd8f3ff), false); // glass display
    for (let s = 0; s < 6; s++) kit.shape(f, new THREE.SphereGeometry(0.09, 7, 5), -0.5 + s * 0.2, y + 1.55, 0, PASTELS[(i + s + 1) % PASTELS.length]);
    for (const v of [-0.52, 0.52]) kit.shape(f, wheelGeometry(0.42), 0.1, y + 0.42, v, WHITE, Math.PI / 2);
    kit.shape(f, new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5).translate(0, 0.8, 0), 0.7, y + 1.4, 0.3, STEEL);
    kit.shape(f, new THREE.ConeGeometry(1.25, 0.5, 12, 1, true), 0.7, y + 3.2, 0.3, i % 2 ? WHITE : PASTELS[(i + 3) % PASTELS.length]);
    kit.shape(f, new THREE.ConeGeometry(0.9, 0.38, 12, 1, true), 0.7, y + 3.25, 0.3, PASTELS[(i + 2) % PASTELS.length]);
    kit.board(f, i, 0, y + 1.0, -0.47, 1.7, 0.42);
    for (let n = 0; n <= 8; n++) {
      const t = n / 8;
      kit.shape(f, new THREE.SphereGeometry(0.05, 5, 4), -0.9 + t * 1.8, y + 1.95 - Math.sin(t * Math.PI) * 0.25, -0.45, C(0xfff1c1), 0, kit.bulbs);
    }
    for (const u of [-0.9, 0.9]) kit.box(f, 0.03, 0.6, 0.03, u, y + 1.4, -0.45, STEEL, false);
  };
  for (let i = 0; i < DESSERT_CARTS; i++) {
    const s = freeSpot(2.6);
    if (!s) break;
    const f = spotFrame(s.x, s.z, s.yaw);
    const y = sandY(s.x);
    dessertCart(f, y, i);
    k.solid(f, 1.9, 1.4, 1, 0, y, 0);
    const p = f.at(0, -1.1);
    eateries.push({ name: DESSERTS[i].name, menu: PLACE_MENUS.dessert, spot: new THREE.Vector3(p.x, y, p.z), seat: p.clone(), seatYaw: 0, eatYaw: 0, table: p.clone() });
  }

  // ---- Moving dessert carts (instanced): pushed along the sand in the evening ----
  const cartGeo = (() => {
    const g = new GeoBuilder();
    g.box(1.8, 0.9, 0.9, 0, 0.9, 0, C(0xffffff)); // tinted per cart
    g.box(1.9, 0.08, 1, 0, 1.39, 0, WHITE);
    g.box(1.4, 0.35, 0.6, 0, 1.6, 0, C(0xd8f3ff));
    for (let s = 0; s < 6; s++) g.add(new THREE.SphereGeometry(0.09, 7, 5), new THREE.Matrix4().setPosition(-0.5 + s * 0.2, 1.8, 0), C(0xffd1dc));
    g.add(new THREE.CylinderGeometry(0.03, 0.03, 1.6, 5), new THREE.Matrix4().setPosition(0.7, 2.2, 0.3), STEEL);
    g.add(new THREE.ConeGeometry(1.25, 0.5, 12, 1, true), new THREE.Matrix4().setPosition(0.7, 3.2, 0.3), WHITE);
    g.box(0.06, 0.06, 1.2, -1.05, 1.1, 0, STEEL); // push handle
    return g.build();
  })();
  const movers = [
    { z0: -60, z1: 60 }, { z0: 150, z1: 290 }, { z0: 385, z1: 520 }, { z0: 530, z1: 645 },
  ].map((r, i) => ({ ...r, x: 139.5 + (i % 2) * 2, z: r.z0, dir: 1, pause: 0, spin: 0 }));
  const cartMesh = new THREE.InstancedMesh(cartGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6 }), movers.length);
  const wheelMesh = new THREE.InstancedMesh(wheelGeometry(0.42), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.3 }), movers.length * 2);
  movers.forEach((_, i) => cartMesh.setColorAt(i, PASTELS[(i * 2) % PASTELS.length]));
  cartMesh.castShadow = wheelMesh.castShadow = true;
  scene.add(cartMesh, wheelMesh);
  const moverEateries = movers.map((m, i) => {
    const e: Eatery = { name: `${['Rose Milk Wala', 'Kulfi on Wheels', 'Gola Thatha', 'Falooda Gaadi'][i]} (moving cart)`, menu: PLACE_MENUS.dessert, spot: new THREE.Vector3(m.x, 0.1, m.z), seat: new THREE.Vector3(), seatYaw: 0, eatYaw: 0, table: new THREE.Vector3() };
    eateries.push(e);
    return e;
  });

  // ---- Kites (afternoon) ----
  const KITES = 10;
  const kiteShape = new THREE.Shape([new THREE.Vector2(0, 0.7), new THREE.Vector2(0.5, 0), new THREE.Vector2(0, -0.8), new THREE.Vector2(-0.5, 0)]);
  const kiteMesh = new THREE.InstancedMesh(new THREE.ShapeGeometry(kiteShape), new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.7 }), KITES);
  const kites = Array.from({ length: KITES }, (_, i) => {
    const zone = ZONES[i % 2];
    return { ax: 150 + rand() * 25, az: zone.z0 + 20 + rand() * (zone.z1 - zone.z0 - 40), h: 22 + rand() * 14, off: 12 + rand() * 8, ph: rand() * 6 };
  });
  kites.forEach((_, i) => kiteMesh.setColorAt(i, BRIGHT[i % BRIGHT.length]));
  const strings = new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(KITES * 6), 3)), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.5 }));
  strings.frustumCulled = false;
  kiteMesh.frustumCulled = false;
  scene.add(kiteMesh, strings);

  // ---- Pony rides (evening): ponies walking a loop on the sand ----
  const ponyGeo = (() => {
    const g = new GeoBuilder();
    g.box(0.5, 0.6, 1.5, 0, 1.15, 0, C(0xffffff));
    g.add(new THREE.BoxGeometry(0.3, 0.7, 0.35).rotateX(-0.5), new THREE.Matrix4().setPosition(0, 1.55, 0.75), C(0xffffff));
    g.box(0.26, 0.3, 0.55, 0, 1.85, 1.0, C(0xffffff));
    for (const [x, z] of [[-0.18, 0.55], [0.18, 0.55], [-0.18, -0.55], [0.18, -0.55]]) g.box(0.1, 0.85, 0.1, x, 0.43, z, C(0xeeeeee));
    g.box(0.52, 0.12, 0.6, 0, 1.5, 0, C(0xc1121f)); // saddle
    g.box(0.08, 0.5, 0.08, 0, 1.1, -0.8, C(0x333333)); // tail
    return g.build();
  })();
  const ponyLoops = [
    [[150, 230], [178, 230], [178, 290], [150, 290]],
    [[150, 610], [180, 610], [180, 645], [150, 645]],
    [[150, 610], [180, 610], [180, 645], [150, 645]],
  ].map((pts) => pts.map(([x, z]) => new THREE.Vector3(x, 0, z)));
  const ponies = ponyLoops.map((loop, i) => ({ loop, t: i * 0.45, len: loop.reduce((s, p, j) => s + p.distanceTo(loop[(j + 1) % loop.length]), 0) }));
  const ponyMesh = new THREE.InstancedMesh(ponyGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), ponies.length);
  [C(0x8b5a2b), C(0xf1f1f1), C(0x4a3728)].forEach((c, i) => ponyMesh.setColorAt(i, c));
  ponyMesh.castShadow = true;
  ponyMesh.frustumCulled = false;
  scene.add(ponyMesh);

  // ---- Beach cricket pitch (stumps) at Santhome ----
  for (const z of [200, 220]) {
    const f = spotFrame(160, z, 0);
    for (const u of [-0.12, 0, 0.12]) k.box(f, 0.04, 0.7, 0.04, u, sandY(160), 0, C(0xf1e3c8), false);
  }

  // ---- Music stage at Elliot's (lights + crowd in the evening) ----
  {
    const f = spotFrame(STAGE.x, STAGE.z, Math.PI / 2); // facing west, towards the promenade
    const y = sandY(STAGE.x);
    stageKit.box(f, 10, 1.2, 6, 0, y, 0, C(0x2b2d42));
    for (const u of [-5, 5]) for (const v of [-3, 3]) stageKit.box(f, 0.25, 6, 0.25, u, y, v, STEEL);
    stageKit.box(f, 10.5, 0.4, 0.4, 0, y + 6, -3, STEEL, false);
    stageKit.box(f, 10.5, 0.4, 0.4, 0, y + 6, 3, STEEL, false);
    stageKit.box(f, 0.4, 0.4, 6.4, -5, y + 6, 0, STEEL, false);
    stageKit.box(f, 0.4, 0.4, 6.4, 5, y + 6, 0, STEEL, false);
    stageKit.box(f, 10, 5, 0.2, 0, y + 1.2, 2.9, C(0x14213d), false); // backdrop
    stageKit.board(f, STAGE_SIGN, 0, y + 6.5, -3.3, 9, 1.3);
    for (const u of [-4.2, 4.2]) stageKit.box(f, 1.1, 1.8, 0.9, u, y + 1.2, -2.2, DARK, false); // speakers
    for (let i = 0; i < 12; i++) stageKit.shape(f, new THREE.SphereGeometry(0.18, 8, 6), -4.6 + i * 0.84, y + 5.6, -3, BRIGHT[i % BRIGHT.length], 0, stageKit.bulbs);
    stageKit.box(f, 0.1, 1.5, 0.1, 0, y + 1.2, -1.5, STEEL, false); // mic stand
  }

  const setNight = k.build(scene);
  const setStage = stageKit.build(scene);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const wp = new THREE.Vector3();
  const wq = new THREE.Quaternion();
  const at = new THREE.Vector3();
  const one = new THREE.Vector3(1, 1, 1);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  let time = 0;

  return {
    eateries,
    /** Is the music night on (for the phone alert)? */
    stageOn: (hour: number) => inHours(hour, STAGE_HOURS),
    update(dt: number, hour: number, night: number) {
      time += dt;
      setNight(night);
      setStage(inHours(hour, STAGE_HOURS) ? Math.max(night, 0.8) : 0);

      // Moving dessert carts: back and forth, a pause at each end and now and then.
      const moving = inHours(hour, CART_MOVE_HOURS);
      movers.forEach((c, i) => {
        if (moving) {
          if (c.pause > 0) c.pause -= dt;
          else {
            c.z += c.dir * MOVE_SPEED * dt;
            c.spin += (MOVE_SPEED * dt) / 0.42;
            if (c.z > c.z1 || c.z < c.z0) {
              c.dir *= -1;
              c.z = THREE.MathUtils.clamp(c.z, c.z0, c.z1);
              c.pause = 8;
            } else if (Math.random() < dt * 0.02) c.pause = 6 + Math.random() * 6; // a customer
          }
        }
        const y = sandY(c.x);
        // The cart's length (local x, handle at -x) points the way it's pushed (+z or -z).
        q.setFromEuler(e.set(0, c.dir > 0 ? -Math.PI / 2 : Math.PI / 2, 0));
        m.compose(pos.set(c.x, y, c.z), q, one);
        cartMesh.setMatrixAt(i, m);
        // Wheels either side (world x), rolling along z: spin about the x axle.
        wq.setFromEuler(e.set(c.spin * c.dir, 0, 0));
        for (const w of [0, 1]) {
          m.compose(wp.set(c.x + (w ? 0.52 : -0.52), y + 0.42, c.z), wq, one);
          wheelMesh.setMatrixAt(i * 2 + w, m);
        }
        moverEateries[i].spot.set(c.x - 1.2, y, c.z);
      });
      cartMesh.instanceMatrix.needsUpdate = wheelMesh.instanceMatrix.needsUpdate = true;

      // Kites: up in the afternoon, bobbing on the wind; strings down to the flyers.
      const kitesUp = inHours(hour, KITE_HOURS);
      const sp = strings.geometry.attributes.position as THREE.BufferAttribute;
      kites.forEach((kt, i) => {
        if (!kitesUp) {
          kiteMesh.setMatrixAt(i, hidden);
          sp.setXYZ(i * 2, 0, -1000, 0);
          sp.setXYZ(i * 2 + 1, 0, -1000, 0);
          return;
        }
        const t = time * 0.6 + kt.ph;
        const kx = kt.ax - kt.off + Math.sin(t) * 2;
        const ky = kt.h + Math.sin(t * 1.3) * 1.5;
        const kz = kt.az + Math.cos(t * 0.8) * 3;
        q.setFromEuler(e.set(-0.4 + Math.sin(t * 2) * 0.2, Math.PI / 2, Math.sin(t * 1.7) * 0.4));
        m.compose(pos.set(kx, ky, kz), q, one.set(2.2, 2.2, 2.2));
        kiteMesh.setMatrixAt(i, m);
        one.set(1, 1, 1);
        sp.setXYZ(i * 2, kt.ax, sandY(kt.ax) + 1.2, kt.az);
        sp.setXYZ(i * 2 + 1, kx, ky - 1.6, kz);
      });
      kiteMesh.instanceMatrix.needsUpdate = true;
      sp.needsUpdate = true;
      strings.visible = kitesUp;

      // Pony rides: walking their loops, a little bob in the stride.
      const poniesOut = inHours(hour, PONY_HOURS);
      ponies.forEach((p, i) => {
        if (!poniesOut) {
          ponyMesh.setMatrixAt(i, hidden);
          return;
        }
        p.t = (p.t + (dt * 1.1) / p.len) % 1;
        let d = p.t * p.len;
        let a = p.loop[0];
        let b = p.loop[1];
        for (let j = 0; j < p.loop.length; j++) {
          a = p.loop[j];
          b = p.loop[(j + 1) % p.loop.length];
          const seg = a.distanceTo(b);
          if (d <= seg) break;
          d -= seg;
        }
        const dir = pos.subVectors(b, a).normalize();
        const yaw = Math.atan2(dir.x, dir.z);
        at.copy(a).addScaledVector(dir, d);
        q.setFromEuler(e.set(0, yaw, 0));
        m.compose(at.setY(sandY(at.x) + Math.abs(Math.sin(time * 6 + i)) * 0.06), q, one);
        ponyMesh.setMatrixAt(i, m);
      });
      ponyMesh.instanceMatrix.needsUpdate = true;
    },
  };
}
