import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addPlates, CAB_COMPANIES, MAKERS, MODELS, pick, randomPlate, type BadgeSpot, type PlateKind } from './plates';

/**
 * Procedural vehicle models (front = +z, ground y = 0). Parts sharing a material are merged, so a
 * car is ~7 draw calls. Each returns its wheel meshes (to spin) and lights (to switch on at night).
 */
export interface VehicleModel {
  wheels: THREE.Object3D[];
  wheelR: number;
  lights: THREE.MeshStandardMaterial[];
  /** Police only: red/blue light bar materials. */
  beacons?: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
}

const flat = (g: THREE.BufferGeometry) => (g.index ? g.toNonIndexed() : g);
const box = (w: number, h: number, d: number, x: number, y: number, z: number) => flat(new THREE.BoxGeometry(w, h, d).translate(x, y, z));
const rbox = (w: number, h: number, d: number, r: number, x: number, y: number, z: number) => flat(new RoundedBoxGeometry(w, h, d, 3, r).translate(x, y, z));

function add(group: THREE.Group, geos: THREE.BufferGeometry[], mat: THREE.Material, shadow = true) {
  const m = new THREE.Mesh(mergeGeometries(geos), mat);
  m.castShadow = shadow;
  m.receiveShadow = true;
  group.add(m);
  return m;
}

const trim = () => new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
const glass = () => new THREE.MeshStandardMaterial({ color: 0x9fb8c8, roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.35, depthWrite: false });
/** Modern cars' tinted glass: dark enough to read as windows, the driver still shows through. */
const tinted = () => new THREE.MeshStandardMaterial({ color: 0x0f161d, roughness: 0.08, metalness: 0.25, transparent: true, opacity: 0.74, depthWrite: false });

/**
 * Shape a slab-sided body like a real car: the sides lean in towards the window line
 * (tumblehome) and the nose and tail round off in plan view.
 */
function sculpt(g: THREE.BufferGeometry, c: { L: number; belt: number; clear: number }) {
  const p = g.attributes.position;
  const half = c.L / 2;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const z = p.getZ(i);
    const up = THREE.MathUtils.smoothstep(y, c.belt - 0.35, c.belt + 0.05);
    const low = 1 - THREE.MathUtils.smoothstep(y, c.clear, c.clear + 0.18);
    const end = Math.max(0, (Math.abs(z) - (half - 0.55)) / 0.55);
    p.setX(i, p.getX(i) * (1 - 0.07 * up - 0.03 * low - 0.1 * end * end));
  }
  // Normals kept from the extrusion: recomputing on unindexed triangles would facet the curves.
  return g;
}
const headlight = () => new THREE.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff0c0, emissiveIntensity: 0.2 });
const taillight = () => new THREE.MeshStandardMaterial({ color: 0xa00000, emissive: 0xff2000, emissiveIntensity: 0.4 });

/** Tyre + hub as one vertex-coloured mesh: 1 draw call per wheel, not 2 (traffic has ~80 wheels). */
const WHEEL_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 });
function coloured(g: THREE.BufferGeometry, hex: number) {
  const c = new THREE.Color(hex);
  const n = g.attributes.position.count;
  g.setAttribute('color', new THREE.Float32BufferAttribute(new Array(n * 3).fill(0).map((_, i) => [c.r, c.g, c.b][i % 3]), 3));
  return g;
}
function wheels(group: THREE.Group, r: number, at: number[][], width = 0.24, custom?: THREE.BufferGeometry) {
  const geo = custom ?? mergeGeometries([
    coloured(new THREE.CylinderGeometry(r, r, width, 14).rotateZ(Math.PI / 2).toNonIndexed(), 0x141414),
    coloured(new THREE.CylinderGeometry(r * 0.55, r * 0.55, width + 0.02, 10).rotateZ(Math.PI / 2).toNonIndexed(), 0xa8acb0),
  ]);
  return at.map(([x, z]) => {
    const w = new THREE.Mesh(geo, WHEEL_MAT);
    w.position.set(x, r, z);
    w.castShadow = false; // the body's shadow covers them; saves a shadow draw call each
    group.add(w);
    return w;
  });
}

/** Compact sedan (the common Chennai family car / call taxi). */
export function carModel(group: THREE.Group, colour: number, plate = randomPlate('private')): VehicleModel {
  return modernCar(group, colour, SEDAN, { plate });
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Chennai MTC bus with route board and livery. */
export function busModel(group: THREE.Group, route = '21G', to = 'BROADWAY', plate = randomPlate('commercial')): VehicleModel {
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1d4fa8, roughness: 0.5 });
  add(group, [rbox(2.5, 2.6, 10, 0.2, 0, 1.85, 0)], white);
  add(group, [box(2.53, 0.5, 9.9, 0, 0.95, 0), box(2.53, 0.12, 9.9, 0, 3.05, 0)], blue);
  add(group, [box(2.55, 0.9, 8.8, 0, 2.3, -0.5), box(2.2, 1.1, 0.05, 0, 2.2, 5.01)], glass(), false);
  add(group, [
    box(0.04, 2.0, 1.0, 1.27, 1.45, 3.8), // front + rear doors (left side: kerb side in India)
    box(0.04, 2.0, 1.0, 1.27, 1.45, -1.5),
    box(2.4, 0.3, 0.2, 0, 0.5, 5.0), // bumpers
    box(2.4, 0.3, 0.2, 0, 0.5, -5.0),
  ], trim());
  // Route board (orange LED look) front and left side; livery panel on both sides.
  const board = canvasTex(256, 48, (g) => {
    g.fillStyle = '#111';
    g.fillRect(0, 0, 256, 48);
    g.fillStyle = '#ff9a1a';
    g.font = '700 30px ui-monospace, monospace';
    g.textBaseline = 'middle';
    g.fillText(route, 10, 25);
    g.font = '700 22px ui-monospace, monospace';
    g.fillText(to, 90, 26);
  });
  const boardMat = new THREE.MeshStandardMaterial({ map: board, emissiveMap: board, emissive: 0xffffff, emissiveIntensity: 0.6 });
  const front = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.38), boardMat);
  front.position.set(0, 2.95, 5.02);
  const side = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.3), boardMat);
  side.position.set(1.27, 2.95, 2.5);
  side.rotation.y = Math.PI / 2;
  const livery = canvasTex(512, 64, (g) => {
    g.fillStyle = '#f2f2ee';
    g.fillRect(0, 0, 512, 64);
    g.fillStyle = '#1d4fa8';
    g.font = '700 26px "Nirmala UI", "Latha", "Noto Sans Tamil", sans-serif';
    g.textBaseline = 'middle';
    g.fillText('மாநகர் போக்குவரத்துக் கழகம்  ·  MTC CHENNAI', 14, 34);
  });
  const liveryMat = new THREE.MeshStandardMaterial({ map: livery, roughness: 0.5 });
  for (const sx of [1, -1]) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.75), liveryMat);
    l.position.set(sx * 1.265, 1.45, -1.2);
    l.rotation.y = (sx * Math.PI) / 2;
    group.add(l);
  }
  group.add(front, side);
  const hl = headlight();
  const tl = taillight();
  add(group, [box(0.35, 0.2, 0.05, 0.9, 0.8, 5.02), box(0.35, 0.2, 0.05, -0.9, 0.8, 5.02)], hl, false);
  add(group, [box(0.3, 0.3, 0.05, 1.0, 0.9, -5.02), box(0.3, 0.3, 0.05, -1.0, 0.9, -5.02)], tl, false);
  addPlates(group, plate, 'commercial', { y: 0.72, z: 5.03 }, { y: 0.8, z: -5.03 }, 0.55);
  return { wheels: wheels(group, 0.5, [[1.1, 3.4], [-1.1, 3.4], [1.1, -3.2], [-1.1, -3.2]]), wheelR: 0.5, lights: [hl, tl, boardMat] };
}

/** Tamil Nadu Police jeep (Bolero-style): white with POLICE decals and a red/blue light bar. */
export function policeModel(group: THREE.Group, plate = randomPlate('government')): VehicleModel {
  const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.45, metalness: 0.2 });
  add(group, [rbox(1.78, 1.0, 4.1, 0.1, 0, 0.95, 0), rbox(1.7, 0.08, 2.6, 0.04, 0, 2.05, -0.5)], white);
  add(group, [
    box(1.84, 0.3, 4.12, 0, 0.55, 0), // dark lower band
    box(1.8, 0.2, 0.2, 0, 0.5, 2.08), // bumpers
    box(1.8, 0.2, 0.2, 0, 0.5, -2.08),
    box(1.2, 0.3, 0.04, 0, 0.95, 2.06), // grille
    box(0.06, 0.6, 0.06, 0.82, 1.75, 0.78), // pillars
    box(0.06, 0.6, 0.06, -0.82, 1.75, 0.78),
    box(1.0, 0.08, 0.3, 0, 2.12, 0.3), // light bar base
  ], trim());
  add(group, [rbox(1.66, 0.62, 2.55, 0.08, 0, 1.75, -0.48)], glass(), false);
  const red = new THREE.MeshStandardMaterial({ color: 0xc00000, emissive: 0xff0000, emissiveIntensity: 0 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x0030c0, emissive: 0x2060ff, emissiveIntensity: 0 });
  add(group, [box(0.42, 0.14, 0.26, 0.24, 2.23, 0.3)], red, false);
  add(group, [box(0.42, 0.14, 0.26, -0.24, 2.23, 0.3)], blue, false);
  const decal = canvasTex(512, 96, (g) => {
    g.fillStyle = '#f4f4f0';
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#b8141c';
    g.fillRect(0, 70, 512, 10);
    g.fillStyle = '#0d2c7a';
    g.font = '800 46px system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.fillText('POLICE', 20, 38);
    g.font = '700 34px "Nirmala UI", "Latha", "Noto Sans Tamil", sans-serif';
    g.fillText('காவல்', 250, 40);
  });
  const decalMat = new THREE.MeshStandardMaterial({ map: decal, roughness: 0.5 });
  for (const sx of [1, -1]) {
    const d = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.5), decalMat);
    d.position.set(sx * 0.9, 1.05, -0.2);
    d.rotation.y = (sx * Math.PI) / 2;
    group.add(d);
  }
  const hl = headlight();
  const tl = taillight();
  add(group, [box(0.3, 0.18, 0.05, 0.62, 1.05, 2.06), box(0.3, 0.18, 0.05, -0.62, 1.05, 2.06)], hl, false);
  add(group, [box(0.2, 0.3, 0.05, 0.75, 1.05, -2.06), box(0.2, 0.3, 0.05, -0.75, 1.05, -2.06)], tl, false);
  addPlates(group, plate, 'government', { y: 0.55, z: 2.19 }, { y: 0.75, z: -2.19 }, 0.5);
  return { wheels: wheels(group, 0.36, [[0.8, 1.35], [-0.8, 1.35], [0.8, -1.35], [-0.8, -1.35]]), wheelR: 0.36, lights: [hl, tl], beacons: [red, blue] };
}

const paintMat = (colour: number) => new THREE.MeshStandardMaterial({ color: colour, roughness: 0.3, metalness: 0.45 });

// ---- Small parts: frames, engines, seats, chrome, dashboards --------------------------------
/**
 * One shared vertex-coloured material for every small non-paint part, so a bike's frame, engine,
 * seat, exhaust and mirrors (or a car's dashboard, seats and steering wheel) are ONE draw call.
 */
const PARTS_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.35 });
type V3 = [number, number, number];
const BLACK = 0x161616;
const CHROME = 0xd4d8dc;
const ALLOY = 0xb9bec4;
const RUBBER = 0x1f1f1f;
const DARK = 0x2e3134;
const INDICATOR = 0xff9800;
/** A coloured piece for the parts mesh. */
const pc = (g: THREE.BufferGeometry, hex: number) => coloured(flat(g), hex);
const pbox = (w: number, h: number, d: number, at: V3, hex: number, rx = 0) => pc(new THREE.BoxGeometry(w, h, d).rotateX(rx).translate(...at), hex);
const prbox = (w: number, h: number, d: number, r: number, at: V3, hex: number, rx = 0) => pc(new RoundedBoxGeometry(w, h, d, 2, r).rotateX(rx).translate(...at), hex);
/** A round tube from a to b. */
function tube(a: V3, b: V3, r: number, hex: number, seg = 8) {
  const va = new THREE.Vector3(...a);
  const vb = new THREE.Vector3(...b);
  const g = new THREE.CylinderGeometry(r, r, va.distanceTo(vb), seg);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), vb.clone().sub(va).normalize()));
  g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2);
  return pc(g, hex);
}
/** A cylinder lying along x (axle direction) at `at`. */
const xcyl = (r: number, len: number, at: V3, hex: number, seg = 12) => pc(new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2).translate(...at), hex);
/**
 * A curved mudguard round a wheel centred at (y, z): an arc of a flattened torus from angle a0
 * (0 = straight ahead, PI/2 = on top, PI = behind) for `arc` radians, `w` wide.
 */
function guard(R: number, w: number, y: number, z: number, a0: number, arc: number) {
  return flat(new THREE.TorusGeometry(R, 0.03, 3, 16, arc).rotateZ(a0).rotateY(-Math.PI / 2).scale(w / 0.06, 1, 1).translate(0, y, z));
}
/** Two-wheeler wheel: tyre, rim, `spokes` alloy spokes and a hub, one vertex-coloured mesh (axle along x). */
function spokedWheel(r: number, tyre: number, width: number, spokes: number) {
  const rim = r - tyre * 1.9;
  const parts = [
    pc(new THREE.TorusGeometry(r - tyre, tyre, 8, 28).rotateY(Math.PI / 2).scale(width / (2 * tyre), 1, 1), RUBBER),
    pc(new THREE.TorusGeometry(rim, 0.018, 4, 28).rotateY(Math.PI / 2), ALLOY),
    xcyl(0.06, width * 1.1, [0, 0, 0], DARK, 10),
    xcyl(0.035, width * 1.4, [0, 0, 0], CHROME, 8),
  ];
  for (let i = 0; i < spokes; i++) parts.push(pc(new THREE.BoxGeometry(0.022, rim - 0.05, 0.034).translate(0, (rim + 0.05) / 2, 0).rotateX((i / spokes) * Math.PI * 2), ALLOY));
  return mergeGeometries(parts)!;
}
/** Car wheel: tyre + a five-spoke alloy face on both sides (the same mesh is used left and right). */
function alloyWheel(r: number, width: number) {
  const parts = [
    xcyl(r, width, [0, 0, 0], RUBBER, 18),
    xcyl(r * 0.66, width + 0.012, [0, 0, 0], DARK, 16),
    xcyl(r * 0.16, width + 0.03, [0, 0, 0], ALLOY, 10),
  ];
  for (const side of [-1, 1])
    for (let i = 0; i < 5; i++) parts.push(pc(new THREE.BoxGeometry(0.012, r * 0.52, r * 0.16).translate(side * (width / 2 + 0.008), r * 0.36, 0).rotateX((i / 5) * Math.PI * 2), ALLOY));
  return mergeGeometries(parts)!;
}
/** Steering wheel at `c`, tilted towards the driver, + its column. */
const steering = (c: V3) => [
  pc(new THREE.TorusGeometry(0.17, 0.018, 6, 20).rotateX(-0.35).translate(...c), RUBBER),
  pc(new THREE.BoxGeometry(0.3, 0.03, 0.02).rotateX(-0.35).translate(...c), DARK),
  tube(c, [c[0], c[1] - 0.12, c[2] + 0.3], 0.03, DARK),
];
/** A car seat facing forward with its cushion top at y, centred at (x, z). */
const seat = (x: number, y: number, z: number, w: number, hex: number) => [
  prbox(w, 0.12, 0.5, 0.04, [x, y - 0.06, z], hex),
  prbox(w, 0.62, 0.12, 0.04, [x, y + 0.27, z - 0.27], hex, -0.18),
];

/**
 * A side silhouette extruded across the vehicle: `draw` traces the outline in (z, y) (z forward,
 * y up) on a Shape; the result is `w` wide, centred on x = 0, with rounded (bevelled) edges.
 */
function profile(w: number, bevel: number, draw: (s: THREE.Shape) => void) {
  const s = new THREE.Shape();
  draw(s);
  const g = new THREE.ExtrudeGeometry(s, { depth: w - 2 * bevel, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 3, curveSegments: 10 });
  // Shape x -> forward (z), extrusion depth -> across (x).
  return flat(g.rotateY(-Math.PI / 2).translate(w / 2 - bevel, 0, 0));
}

/** Step-through scooter (Activa / Jupiter style): leg shield, floorboard, big rounded rear body. */
export function scooterModel(group: THREE.Group, colour: number, plate = randomPlate('private')): VehicleModel {
  const R = 0.24;
  const FZ = 0.66;
  const RZ = -0.58;
  // One curved body: leg shield in front, the floorboard, the rear body sweeping over the engine.
  const body = profile(0.4, 0.05, (s) => {
    s.moveTo(0.26, 0.2);
    s.quadraticCurveTo(0.4, 0.2, 0.4, 0.32);
    s.quadraticCurveTo(0.5, 0.62, 0.62, 1.0); // leg shield, front face
    s.lineTo(0.4, 1.05);
    s.quadraticCurveTo(0.33, 0.66, 0.3, 0.42); // leg shield, rider's side
    s.quadraticCurveTo(0.3, 0.33, 0.22, 0.33);
    s.lineTo(-0.1, 0.33); // floorboard
    s.quadraticCurveTo(-0.2, 0.36, -0.2, 0.72); // rear body rises to the seat
    s.lineTo(-0.8, 0.76);
    s.quadraticCurveTo(-0.94, 0.76, -0.94, 0.62); // tail
    s.quadraticCurveTo(-0.94, 0.5, -0.8, 0.5);
    s.lineTo(-0.36, 0.5); // over the rear wheel
    s.quadraticCurveTo(-0.24, 0.5, -0.22, 0.2);
    s.lineTo(0.26, 0.2);
  });
  add(group, [
    body,
    rbox(0.58, 0.15, 0.3, 0.07, 0, 1.1, 0.52), // handlebar cowl (headlamp housing)
    guard(R + 0.05, 0.13, R, FZ, 0.25, 1.75), // front fender
  ], paintMat(colour));
  add(group, [
    prbox(0.3, 0.025, 0.34, 0.01, [0, 0.335, 0.06], RUBBER), // floor mat
    prbox(0.34, 0.11, 0.66, 0.05, [0, 0.81, -0.47], 0x2a1f19), // seat
    prbox(0.3, 0.05, 0.26, 0.03, [0, 0.86, -0.66], 0x2a1f19), // pillion hump
    tube([0.17, 0.8, -0.72], [0.17, 0.82, -0.92], 0.016, BLACK), tube([-0.17, 0.8, -0.72], [-0.17, 0.82, -0.92], 0.016, BLACK), // grab rail
    tube([0.17, 0.82, -0.92], [-0.17, 0.82, -0.92], 0.016, BLACK),
    prbox(0.1, 0.17, 0.42, 0.04, [0.15, 0.36, -0.52], 0x6b7075), // CVT / engine casing (left)
    xcyl(0.055, 0.05, [0.2, 0.36, -0.38], 0x8a9096),
    tube([-0.14, 0.32, -0.38], [-0.17, 0.4, -0.8], 0.055, BLACK, 10), // silencer (right)
    tube([-0.21, 0.35, -0.42], [-0.23, 0.42, -0.74], 0.02, CHROME), // heat guard
    tube([0.05, 0.56, 0.6], [0.05, R, FZ], 0.026, DARK), tube([-0.05, 0.56, 0.6], [-0.05, R, FZ], 0.026, DARK), // front fork (below the fender)
    tube([0.27, 1.11, 0.48], [0.38, 1.1, 0.44], 0.023, RUBBER), tube([-0.27, 1.11, 0.48], [-0.38, 1.1, 0.44], 0.023, RUBBER), // grips
    tube([0.27, 1.14, 0.52], [0.36, 1.13, 0.49], 0.008, ALLOY), tube([-0.27, 1.14, 0.52], [-0.36, 1.13, 0.49], 0.008, ALLOY), // brake levers
    tube([0.2, 1.16, 0.52], [0.24, 1.34, 0.5], 0.009, BLACK), tube([-0.2, 1.16, 0.52], [-0.24, 1.34, 0.5], 0.009, BLACK), // mirror stalks
    prbox(0.14, 0.09, 0.03, 0.02, [0.25, 1.37, 0.5], BLACK), prbox(0.14, 0.09, 0.03, 0.02, [-0.25, 1.37, 0.5], BLACK),
    pbox(0.16, 0.06, 0.03, [0, 1.17, 0.42], 0x10151a), // speedometer
    pbox(0.07, 0.04, 0.05, [0.26, 1.08, 0.64], INDICATOR), pbox(0.07, 0.04, 0.05, [-0.26, 1.08, 0.64], INDICATOR),
    pbox(0.06, 0.04, 0.05, [0.17, 0.66, -0.94], INDICATOR), pbox(0.06, 0.04, 0.05, [-0.17, 0.66, -0.94], INDICATOR),
    tube([0.13, 0.86, 0.6], [0.0, 0.52, 0.485], 0.011, CHROME), tube([-0.13, 0.86, 0.6], [0.0, 0.52, 0.485], 0.011, CHROME), // chrome "V" on the leg shield
    pc(guard(R + 0.05, 0.12, R, RZ, 1.55, 1.4), BLACK), // rear hugger
    tube([-0.12, 0.22, -0.1], [-0.18, 0.04, -0.14], 0.015, BLACK), // side stand
  ], PARTS_MAT);
  const hl = headlight();
  const tl = taillight();
  add(group, [box(0.22, 0.08, 0.04, 0, 1.1, 0.67), box(0.1, 0.06, 0.03, 0, 0.9, 0.58)], hl, false);
  add(group, [box(0.24, 0.07, 0.05, 0, 0.66, -0.96)], tl, false);
  addPlates(group, plate, 'private', { y: 0.5, z: 0.475 }, { y: 0.44, z: -0.95 }, 0.24);
  const w = spokedWheel(R, 0.065, 0.11, 5);
  return { wheels: wheels(group, R, [[0, FZ], [0, RZ]], 0.1, w), wheelR: R, lights: [hl, tl] };
}

/** Commuter motorbike (Splendor / Shine style): teardrop tank with stripes, air-cooled engine, alloys. */
export function bikeModel(group: THREE.Group, colour: number, plate = randomPlate('private')): VehicleModel {
  const R = 0.31;
  const FZ = 0.67;
  const RZ = -0.62;
  const head: V3 = [0, 0.98, 0.44]; // steering head
  add(group, [
    flat(new RoundedBoxGeometry(0.3, 0.21, 0.48, 3, 0.09).rotateX(0.12).translate(0, 0.88, 0.17)), // tank
    rbox(0.05, 0.17, 0.3, 0.02, 0.125, 0.66, -0.22), rbox(0.05, 0.17, 0.3, 0.02, -0.125, 0.66, -0.22), // side panels
    flat(new RoundedBoxGeometry(0.2, 0.1, 0.42, 2, 0.04).rotateX(-0.12).translate(0, 0.8, -0.68)), // tail panel
    rbox(0.24, 0.24, 0.17, 0.08, 0, 1.0, 0.6), // headlamp cowl
    guard(R + 0.04, 0.1, R, FZ, 0.35, 1.5), // front mudguard
  ], paintMat(colour));
  const stripe = (c: number, dy: number) => [1, -1].map((s) => pbox(0.012, 0.025, 0.36, [s * 0.152, 0.86 + dy, 0.17], c, 0.25));
  add(group, [
    ...stripe(0x1e5aa8, 0.03), ...stripe(0xd32f2f, -0.01), // tank stripes
    tube(head, [0, 0.8, -0.2], 0.028, BLACK), // backbone
    tube([0, 0.9, 0.42], [0, 0.42, 0.22], 0.026, BLACK), // down tube
    tube([0, 0.8, -0.2], [0, 0.8, -0.8], 0.022, BLACK), // rear subframe
    tube([0.1, 0.4, -0.1], [0.1, R, RZ], 0.025, BLACK), tube([-0.1, 0.4, -0.1], [-0.1, R, RZ], 0.025, BLACK), // swingarm
    tube([0.13, R + 0.05, RZ + 0.04], [0.13, 0.79, -0.44], 0.03, CHROME), tube([-0.13, R + 0.05, RZ + 0.04], [-0.13, 0.79, -0.44], 0.03, CHROME), // shocks
    tube([0.08, 1.0, 0.45], [0.08, R, FZ], 0.024, CHROME), tube([-0.08, 1.0, 0.45], [-0.08, R, FZ], 0.024, CHROME), // fork
    tube([0.08, 0.6, 0.57], [0.08, R, FZ], 0.034, BLACK), tube([-0.08, 0.6, 0.57], [-0.08, R, FZ], 0.034, BLACK), // fork legs
    // Engine: finned cylinder leaning forward, silver crankcase, round side covers.
    pbox(0.18, 0.2, 0.18, [0, 0.55, 0.24], 0x8d9399, 0.35),
    ...[0, 1, 2, 3, 4].map((i) => pbox(0.24, 0.012, 0.22, [0, 0.47 + i * 0.04, 0.22 + i * 0.015], 0x5f656b, 0.35)),
    prbox(0.24, 0.24, 0.38, 0.06, [0, 0.38, 0.0], 0xa3a9af),
    xcyl(0.12, 0.05, [0.14, 0.38, 0.02], 0xc2c7cc), xcyl(0.1, 0.05, [-0.14, 0.37, -0.02], 0xc2c7cc),
    // Exhaust: header down from the cylinder, long chrome silencer on the right.
    tube([-0.06, 0.5, 0.32], [-0.13, 0.27, 0.2], 0.026, CHROME), tube([-0.13, 0.27, 0.2], [-0.16, 0.29, -0.22], 0.026, CHROME),
    tube([-0.17, 0.3, -0.2], [-0.19, 0.38, -0.78], 0.052, CHROME, 12), xcyl(0.035, 0.02, [-0.19, 0.38, -0.79], BLACK),
    pbox(0.03, 0.06, 0.58, [0.13, 0.36, -0.33], BLACK), // chain guard
    prbox(0.27, 0.09, 0.66, 0.04, [0, 0.86, -0.34], 0x1b1b1b), // seat
    tube([0.12, 0.84, -0.52], [0.12, 0.85, -0.86], 0.016, CHROME), tube([-0.12, 0.84, -0.52], [-0.12, 0.85, -0.86], 0.016, CHROME), // carrier
    tube([0.12, 0.85, -0.86], [-0.12, 0.85, -0.86], 0.016, CHROME),
    tube([-0.33, 1.07, 0.38], [0.33, 1.07, 0.38], 0.016, BLACK), // handlebar
    tube([0.33, 1.07, 0.38], [0.43, 1.07, 0.36], 0.024, RUBBER), tube([-0.33, 1.07, 0.38], [-0.43, 1.07, 0.36], 0.024, RUBBER), // grips
    tube([0.3, 1.1, 0.42], [0.41, 1.09, 0.4], 0.008, ALLOY), tube([-0.3, 1.1, 0.42], [-0.41, 1.09, 0.4], 0.008, ALLOY), // levers
    tube([0.24, 1.08, 0.4], [0.28, 1.26, 0.38], 0.009, BLACK), tube([-0.24, 1.08, 0.4], [-0.28, 1.26, 0.38], 0.009, BLACK), // mirror stalks
    prbox(0.12, 0.08, 0.03, 0.02, [0.29, 1.3, 0.38], BLACK), prbox(0.12, 0.08, 0.03, 0.02, [-0.29, 1.3, 0.38], BLACK),
    xcyl(0.055, 0.12, [0, 1.12, 0.47], 0x10151a), // speedometer pod
    pbox(0.06, 0.04, 0.06, [0.15, 0.98, 0.64], INDICATOR), pbox(0.06, 0.04, 0.06, [-0.15, 0.98, 0.64], INDICATOR),
    pbox(0.05, 0.04, 0.05, [0.13, 0.76, -0.86], INDICATOR), pbox(0.05, 0.04, 0.05, [-0.13, 0.76, -0.86], INDICATOR),
    pbox(0.14, 0.03, 0.05, [0.2, 0.36, -0.02], RUBBER), pbox(0.14, 0.03, 0.05, [-0.2, 0.36, -0.02], RUBBER), // foot pegs
    pbox(0.12, 0.03, 0.05, [0.18, 0.4, -0.45], RUBBER), pbox(0.12, 0.03, 0.05, [-0.18, 0.4, -0.45], RUBBER), // pillion pegs
    pc(guard(R + 0.04, 0.11, R, RZ, 1.45, 1.35), BLACK), // rear mudguard
    tube([0.1, 0.3, -0.1], [0.2, 0.03, -0.12], 0.014, BLACK), // side stand
  ], PARTS_MAT);
  const hl = headlight();
  const tl = taillight();
  add(group, [flat(new THREE.CylinderGeometry(0.085, 0.085, 0.04, 16).rotateX(Math.PI / 2).translate(0, 1.02, 0.69))], hl, false);
  add(group, [box(0.15, 0.06, 0.05, 0, 0.8, -0.9)], tl, false);
  addPlates(group, plate, 'private', { y: 0.8, z: 0.705 }, { y: 0.66, z: -0.92 }, 0.24);
  const w = spokedWheel(R, 0.05, 0.1, 5);
  return { wheels: wheels(group, R, [[0, FZ], [0, RZ]], 0.1, w), wheelR: R, lights: [hl, tl] };
}

/**
 * Modern car shape, sized by these numbers (metres, model space: front = +z, ground y = 0).
 * hood = where the windscreen starts, roofF / roofB = roof front / back edge.
 */
export interface CarShape {
  L: number;
  W: number;
  r: number; // wheel radius
  axle: number; // wheel z (front +axle, rear -axle)
  clear: number; // body bottom
  belt: number; // window line
  roof: number;
  hood: number;
  roofF: number;
  roofB: number;
  tail: 'hatch' | 'boot';
  seatY: number; // front cushion top
  driverZ: number; // front seats' z
  suv?: boolean; // black cladding + roof rails
  type: 'hatch' | 'sedan' | 'suv' | 'mpv';
}

/** Swift-style hatchback. */
export const HATCH: CarShape = { L: 3.85, W: 1.7, r: 0.3, axle: 1.22, clear: 0.22, belt: 0.98, roof: 1.48, hood: 0.78, roofF: -0.02, roofB: -1.28, tail: 'hatch', seatY: 0.6, driverZ: -0.05, type: 'hatch' };
/** Compact sedan (Dzire-style). */
export const SEDAN: CarShape = { L: 3.99, W: 1.7, r: 0.3, axle: 1.24, clear: 0.22, belt: 0.96, roof: 1.48, hood: 0.86, roofF: 0.06, roofB: -1.08, tail: 'boot', seatY: 0.6, driverZ: 0.02, type: 'sedan' };
/** Creta-style compact SUV. */
export const SUV: CarShape = { L: 4.3, W: 1.8, r: 0.34, axle: 1.3, clear: 0.3, belt: 1.15, roof: 1.68, hood: 0.92, roofF: 0.1, roofB: -1.55, tail: 'hatch', seatY: 0.78, driverZ: 0.1, suv: true, type: 'suv' };
/** Seven-seater MPV (Ertiga-style): the city's call taxi. */
export const MPV: CarShape = { L: 4.4, W: 1.74, r: 0.31, axle: 1.36, clear: 0.24, belt: 1.02, roof: 1.62, hood: 1.0, roofF: 0.22, roofB: -1.98, tail: 'hatch', seatY: 0.66, driverZ: 0.32, type: 'mpv' };

/** Where a car's driver sits (hips), and passengers' seats, in model space. */
export const driverOf = (c: CarShape) => new THREE.Vector3(-(c.W / 2 - 0.45), c.seatY + 0.08, c.driverZ);
export const rearOf = (c: CarShape) => new THREE.Vector3(c.W / 2 - 0.45, c.seatY + 0.06, c.driverZ - 0.85);
export const wheelOf = (c: CarShape) => new THREE.Vector3(-(c.W / 2 - 0.45), c.seatY + 0.5, c.driverZ + 0.5);

/** Body, glass cabin, interior, lights: a modern Indian car in the given shape. */
export function modernCar(group: THREE.Group, colour: number, c: CarShape, opts: { plate?: string; kind?: PlateKind; cab?: string } = {}): VehicleModel {
  const kind = opts.kind ?? 'private';
  const plate = opts.plate ?? randomPlate(kind);
  const { L, W, r, axle, clear, belt, roof, hood, roofF, roofB } = c;
  const f = L / 2;
  const back = -L / 2;
  const glassBase = c.tail === 'hatch' ? back + 0.12 : back + 0.85; // where the rear window meets the body
  const arch = r + 0.07;
  const body = profile(W, 0.1, (s) => {
    s.moveTo(back + 0.12, clear);
    s.lineTo(-axle - arch, clear);
    s.absarc(-axle, r, arch, Math.PI, 0, true); // rear wheel arch
    s.lineTo(-axle + arch, clear);
    s.lineTo(axle - arch, clear);
    s.absarc(axle, r, arch, Math.PI, 0, true); // front wheel arch
    s.lineTo(axle + arch, clear);
    s.lineTo(f - 0.12, clear);
    s.quadraticCurveTo(f, clear, f, clear + 0.2); // front bumper
    s.lineTo(f - 0.02, belt - 0.24);
    s.quadraticCurveTo(f - 0.04, belt - 0.13, f - 0.2, belt - 0.12); // nose
    s.lineTo(hood, belt); // bonnet
    s.lineTo(glassBase, belt + 0.02);
    if (c.tail === 'boot') s.lineTo(back + 0.08, belt - 0.02); // boot lid
    s.quadraticCurveTo(back, belt - 0.02, back, belt - 0.2);
    s.lineTo(back, clear + 0.18);
    s.quadraticCurveTo(back, clear, back + 0.12, clear);
  });
  const paint = paintMat(colour);
  add(group, [sculpt(body, c), rbox(W - 0.3, 0.06, roofF - roofB + 0.1, 0.03, 0, roof + 0.01, (roofF + roofB) / 2)], paint);
  const cabin = profile(W - 0.16, 0.08, (s) => {
    s.moveTo(hood, belt - 0.02);
    s.lineTo(roofF, roof);
    s.lineTo(roofB, roof);
    s.lineTo(glassBase, belt);
  });
  add(group, [cabin], tinted(), false);
  const hw = W / 2 - 0.13;
  const pillar = c.suv ? BLACK : DARK;
  const mid = (roofF + roofB) / 2 + 0.05;
  const d = driverOf(c);
  const wh = wheelOf(c);
  const rear = rearOf(c);
  const parts = [
    // Pillars (A and B dark like modern cars; C in body colour), door lines, handles, mirrors.
    ...[1, -1].flatMap((sx) => [
      tube([sx * hw, belt, hood - 0.04], [sx * (hw - 0.05), roof, roofF], 0.035, pillar),
      tube([sx * hw, belt, mid], [sx * (hw - 0.05), roof, mid], 0.04, pillar),
      tube([sx * hw, belt, glassBase + 0.06], [sx * (hw - 0.05), roof, roofB], 0.06, colour),
      pbox(0.01, belt - clear - 0.12, 0.012, [sx * (W / 2 + 0.002), (belt + clear) / 2, mid], 0x202020),
      pbox(0.01, belt - clear - 0.12, 0.012, [sx * (W / 2 + 0.002), (belt + clear) / 2, mid + 1.0], 0x202020),
      pbox(0.02, 0.025, 0.12, [sx * (W / 2 + 0.01), belt - 0.12, mid + 0.75], CHROME),
      pbox(0.02, 0.025, 0.12, [sx * (W / 2 + 0.01), belt - 0.12, mid - 0.25], CHROME),
      prbox(0.16, 0.1, 0.08, 0.03, [sx * (W / 2 + 0.06), belt + 0.06, hood - 0.12], colour),
      pbox(0.02, 0.03, 0.08, [sx * (W / 2 + 0.005), belt - 0.22, f - 0.55], INDICATOR), // side repeater
    ]),
    // Face: grille, lower intake, fog lamps; plastic lower bumpers.
    prbox(W * 0.42, 0.16, 0.06, 0.04, [0, belt - 0.32, f - 0.01], 0x15181b),
    pbox(W * 0.38, 0.015, 0.02, [0, belt - 0.27, f + 0.02], CHROME),
    prbox(W * 0.55, 0.1, 0.05, 0.03, [0, clear + 0.14, f - 0.02], 0x15181b),
    ...[1, -1].map((sx) => pc(new THREE.CylinderGeometry(0.045, 0.045, 0.02, 10).rotateX(Math.PI / 2).translate(sx * W * 0.33, clear + 0.16, f), 0xeeeeee)), // fog lamps
    pbox(W - 0.1, 0.06, 0.04, [0, clear + 0.06, f - 0.06], 0x1b1d20),
    pbox(W - 0.1, 0.06, 0.04, [0, clear + 0.06, back + 0.06], 0x1b1d20),
    pbox(W * 0.5, 0.03, 0.02, [0, belt - 0.42, back - 0.005], CHROME), // boot / tailgate chrome
    // Interior: dashboard, steering wheel, seats, rear bench.
    prbox(W - 0.24, 0.22, 0.4, 0.06, [0, belt - 0.02, hood - 0.28], 0x24262a),
    ...steering([wh.x, wh.y, wh.z]),
    ...seat(d.x, c.seatY, c.driverZ, 0.5, 0x3b3b40),
    ...seat(-d.x, c.seatY, c.driverZ, 0.5, 0x3b3b40),
    ...seat(0, rear.y - 0.06, rear.z, W - 0.36, 0x3b3b40),
    ...(c.type === 'mpv' ? seat(0, rear.y - 0.04, rear.z - 0.85, W - 0.4, 0x3b3b40) : []), // third row
    pbox(W - 0.2, 0.05, L - 1.2, [0, clear + 0.12, -0.2], 0x2a2a2a), // floor
  ];
  if (c.suv)
    parts.push(
      ...[1, -1].flatMap((sx) => [
        tube([sx * (W / 2 - 0.22), roof + 0.1, roofF - 0.15], [sx * (W / 2 - 0.22), roof + 0.1, roofB + 0.1], 0.025, 0x2b2b2b), // roof rails
        tube([sx * (W / 2 - 0.22), roof + 0.03, roofF - 0.1], [sx * (W / 2 - 0.22), roof + 0.1, roofF - 0.15], 0.025, 0x2b2b2b),
        tube([sx * (W / 2 - 0.22), roof + 0.03, roofB + 0.05], [sx * (W / 2 - 0.22), roof + 0.1, roofB + 0.1], 0.025, 0x2b2b2b),
        pbox(0.04, 0.16, L - 0.9, [sx * (W / 2 + 0.005), clear + 0.12, 0], 0x1d1f22), // side cladding
        pc(guard(arch + 0.02, 0.1, r, axle, 0.1, 2.94), 0x1d1f22).translate(sx * (W / 2 - 0.03), 0, 0), // arch cladding
        pc(guard(arch + 0.02, 0.1, r, -axle, 0.1, 2.94), 0x1d1f22).translate(sx * (W / 2 - 0.03), 0, 0),
      ]),
      pbox(W * 0.5, 0.04, 0.06, [0, clear + 0.05, f + 0.01], 0xaab0b6), // skid plate
    );
  add(group, parts, PARTS_MAT);
  const hl = headlight();
  const tl = taillight();
  // Swept headlamps at the corners; tail lamps wrap round the back.
  add(group, [1, -1].map((sx) => flat(new RoundedBoxGeometry(0.36, 0.13, 0.12, 2, 0.04).rotateY(sx * 0.35).translate(sx * (W / 2 - 0.24), belt - 0.2, f - 0.07))), hl, false);
  add(group, [1, -1].map((sx) => flat(new RoundedBoxGeometry(0.24, 0.16, 0.1, 2, 0.04).rotateY(-sx * 0.4).translate(sx * (W / 2 - 0.15), belt - 0.12, back + 0.05))), tl, false);
  // Maker + model in chrome on the tailgate and the grille; a cab's company name on the doors and roof sign instead.
  const spots: BadgeSpot[] = [];
  if (opts.cab) {
    const sideY = (belt + clear) / 2 + 0.08;
    spots.push({ x: W / 2 + 0.015, y: sideY, z: mid + 0.45, w: 1.0, ry: Math.PI / 2 }, { x: -(W / 2 + 0.015), y: sideY, z: mid + 0.45, w: 1.0, ry: -Math.PI / 2 });
    spots.push({ y: roof + 0.16, z: (roofF + roofB) / 2 + 0.08, w: 0.6, ry: 0 }, { y: roof + 0.16, z: (roofF + roofB) / 2 - 0.08, w: 0.6, ry: Math.PI });
    add(group, [pbox(0.64, 0.2, 0.15, [0, roof + 0.16, (roofF + roofB) / 2], 0xffd400)], PARTS_MAT); // roof sign
  } else {
    spots.push({ y: belt - 0.17, z: back - 0.015, w: 0.42, ry: Math.PI }, { y: belt - 0.32, z: f + 0.04, w: 0.24, ry: 0 });
  }
  addPlates(group, plate, kind, { y: clear + 0.26, z: f + 0.01 }, { y: belt - 0.3, z: back - 0.01 }, 0.5, {
    text: opts.cab ?? `${pick(MAKERS)} ${pick(MODELS[c.type])}`,
    bg: opts.cab ? 0xffd400 : colour,
    style: opts.cab ? 'livery' : 'chrome',
    at: spots,
  });
  return { wheels: wheels(group, r, [[W / 2 - 0.15, axle], [-(W / 2 - 0.15), axle], [W / 2 - 0.15, -axle], [-(W / 2 - 0.15), -axle]], 0.22, alloyWheel(r, 0.22)), wheelR: r, lights: [hl, tl] };
}

/** Call taxi: a white seven-seater MPV with a cab company's name on the doors and a yellow roof sign. */
export function taxiModel(group: THREE.Group, colour: number, plate = randomPlate('commercial')): VehicleModel {
  return modernCar(group, colour, MPV, { plate, kind: 'commercial', cab: pick(CAB_COMPANIES) });
}

/** Small van (Eeco style): short nose, raked windscreen, tall box body, sliding doors. */
export function vanModel(group: THREE.Group, colour: number, plate = randomPlate('private')): VehicleModel {
  const W = 1.5;
  const r = 0.27;
  const ax = 1.2;
  const arch = r + 0.06;
  const body = profile(W, 0.08, (s) => {
    s.moveTo(-1.72, 0.24);
    s.lineTo(-ax - arch, 0.24);
    s.absarc(-ax, r, arch, Math.PI, 0, true);
    s.lineTo(-ax + arch, 0.24);
    s.lineTo(ax - arch, 0.24);
    s.absarc(ax, r, arch, Math.PI, 0, true);
    s.lineTo(ax + arch, 0.24);
    s.lineTo(1.72, 0.24);
    s.quadraticCurveTo(1.85, 0.24, 1.85, 0.42); // front bumper
    s.lineTo(1.83, 0.78);
    s.quadraticCurveTo(1.81, 0.93, 1.62, 0.95); // short bonnet
    s.lineTo(1.24, 1.76); // windscreen rake
    s.quadraticCurveTo(1.14, 1.85, 0.98, 1.85);
    s.lineTo(-1.72, 1.85); // roof
    s.quadraticCurveTo(-1.85, 1.85, -1.85, 1.7);
    s.lineTo(-1.85, 0.38);
    s.quadraticCurveTo(-1.85, 0.24, -1.72, 0.24);
  });
  add(group, [sculpt(body, { L: 3.7, belt: 1.25, clear: 0.24 })], paintMat(colour));
  // Windows: raked windscreen, a long band down each side, the back glass.
  add(group, [
    flat(new THREE.BoxGeometry(W - 0.22, 0.86, 0.02).rotateX(-0.44).translate(0, 1.36, 1.445)),
    box(0.02, 0.48, 2.95, W / 2 - 0.035, 1.47, -0.2),
    box(0.02, 0.48, 2.95, -(W / 2 - 0.035), 1.47, -0.2),
    box(W - 0.26, 0.5, 0.02, 0, 1.45, -1.855),
  ], tinted(), false);
  const hw = W / 2 - 0.025;
  add(group, [
    ...[1, -1].flatMap((sx) => [
      pbox(0.03, 0.5, 0.07, [sx * hw, 1.47, 0.72], BLACK), // B pillar
      pbox(0.03, 0.5, 0.07, [sx * hw, 1.47, -0.42], BLACK), // C pillar
      pbox(0.012, 0.02, 1.25, [sx * (W / 2 + 0.002), 1.2, 0.05], 0x222222), // sliding-door rail
      pbox(0.01, 1.0, 0.012, [sx * (W / 2 + 0.002), 0.8, 0.72], 0x222222), // door lines
      pbox(0.01, 1.0, 0.012, [sx * (W / 2 + 0.002), 0.8, -0.55], 0x222222),
      pbox(0.02, 0.03, 0.12, [sx * (W / 2 + 0.01), 1.12, 1.0], BLACK), // handles
      pbox(0.02, 0.03, 0.12, [sx * (W / 2 + 0.01), 1.12, -0.4], BLACK),
      prbox(0.14, 0.12, 0.06, 0.03, [sx * (W / 2 + 0.06), 1.3, 1.25], BLACK), // mirrors
      pbox(0.02, 0.03, 0.07, [sx * (W / 2 + 0.005), 0.75, 1.55], INDICATOR),
    ]),
    prbox(W + 0.02, 0.2, 0.12, 0.04, [0, 0.36, 1.82], BLACK), // bumpers
    prbox(W + 0.02, 0.2, 0.12, 0.04, [0, 0.36, -1.82], BLACK),
    prbox(0.7, 0.14, 0.04, 0.03, [0, 0.66, 1.84], 0x15181b), // grille
    pbox(0.4, 0.02, 0.02, [0, 0.62, 1.865], CHROME),
    pbox(W - 0.1, 0.03, 0.02, [0, 1.12, -1.86], CHROME), // tailgate strip
    // Interior: seats, dashboard, steering wheel.
    ...seat(-0.36, 0.8, 0.85, 0.5, 0x37474f),
    ...seat(0.36, 0.8, 0.85, 0.5, 0x37474f),
    ...seat(0, 0.78, -0.25, 1.2, 0x37474f),
    prbox(1.3, 0.16, 0.28, 0.04, [0, 1.06, 1.45], 0x263238),
    ...steering([-0.36, 1.25, 1.32]),
  ], PARTS_MAT);
  const hl = headlight();
  const tl = taillight();
  add(group, [1, -1].map((sx) => flat(new RoundedBoxGeometry(0.3, 0.16, 0.08, 2, 0.03).translate(sx * 0.52, 0.8, 1.83))), hl, false);
  add(group, [1, -1].map((sx) => flat(new RoundedBoxGeometry(0.14, 0.34, 0.06, 2, 0.02).translate(sx * 0.62, 0.95, -1.84))), tl, false);
  addPlates(group, plate, 'private', { y: 0.42, z: 1.89 }, { y: 0.66, z: -1.89 }, 0.45, {
    text: `${pick(MAKERS)} ${pick(MODELS.van)}`,
    bg: colour,
    style: 'chrome',
    at: [{ y: 1.25, z: -1.865, w: 0.42, ry: Math.PI }],
  });
  return { wheels: wheels(group, r, [[0.64, ax], [-0.64, ax], [0.64, -ax], [-0.64, -ax]], 0.2), wheelR: r, lights: [hl, tl] };
}

/** Mini goods carrier (Ace-style) with a few sacks in the back. */
export function tempoModel(group: THREE.Group, colour: number, plate = randomPlate('commercial')): VehicleModel {
  add(group, [rbox(1.45, 1.25, 1.35, 0.12, 0, 1.1, 1.25)], paintMat(colour));
  add(group, [box(1.25, 0.55, 0.05, 0, 1.38, 1.93)], glass(), false);
  add(group, [
    box(1.55, 0.08, 2.4, 0, 0.72, -0.75), // bed
    box(0.05, 0.4, 2.4, 0.76, 0.96, -0.75), // drop sides
    box(0.05, 0.4, 2.4, -0.76, 0.96, -0.75),
    box(1.55, 0.4, 0.05, 0, 0.96, -1.95),
  ], new THREE.MeshStandardMaterial({ color: 0x8a6a3a, roughness: 0.8 }));
  add(group, [
    rbox(0.6, 0.35, 0.45, 0.12, 0.35, 0.95, -0.4), // sacks
    rbox(0.6, 0.35, 0.45, 0.12, -0.35, 0.95, -0.45),
    rbox(0.6, 0.35, 0.45, 0.12, 0.0, 0.95, -1.1),
  ], new THREE.MeshStandardMaterial({ color: 0xd8c9a0, roughness: 0.9 }));
  add(group, [
    box(1.5, 0.16, 0.12, 0, 0.5, 1.95), // bumper
    box(0.6, 0.06, 2.2, 0, 0.5, 0), // chassis
    box(0.14, 0.1, 0.06, 0.8, 1.35, 1.75), // mirrors
    box(0.14, 0.1, 0.06, -0.8, 1.35, 1.75),
  ], trim());
  const hl = headlight();
  const tl = taillight();
  add(group, [box(0.26, 0.14, 0.05, 0.5, 0.8, 1.94), box(0.26, 0.14, 0.05, -0.5, 0.8, 1.94)], hl, false);
  add(group, [box(0.14, 0.16, 0.05, 0.65, 0.65, -1.99), box(0.14, 0.16, 0.05, -0.65, 0.65, -1.99)], tl, false);
  addPlates(group, plate, 'commercial', { y: 0.5, z: 2.02 }, { y: 0.62, z: -2.0 }, 0.45);
  return { wheels: wheels(group, 0.28, [[0.66, 1.25], [-0.66, 1.25], [0.66, -1.2], [-0.66, -1.2]], 0.2), wheelR: 0.28, lights: [hl, tl] };
}

/** Tamil Nadu lorry: decorated cab, high painted wooden body. */
export function lorryModel(group: THREE.Group, colour: number, plate = randomPlate('commercial')): VehicleModel {
  add(group, [
    rbox(2.3, 1.55, 1.7, 0.12, 0, 1.9, 2.75), // cab
    box(2.35, 0.25, 0.1, 0, 2.85, 3.62), // painted visor
  ], paintMat(colour));
  add(group, [box(1.95, 0.7, 0.05, 0, 2.15, 3.61)], glass(), false);
  add(group, [
    box(2.4, 1.4, 0.08, 0, 1.95, 1.75), // headboard
    box(0.08, 1.2, 5.0, 1.18, 1.85, -0.8), // high sides
    box(0.08, 1.2, 5.0, -1.18, 1.85, -0.8),
    box(2.4, 1.2, 0.08, 0, 1.85, -3.28), // tailgate
  ], new THREE.MeshStandardMaterial({ color: 0x1f6fb5, roughness: 0.7 }));
  // Yellow bands painted round the body.
  add(group, [
    box(0.1, 0.12, 5.0, 1.2, 2.3, -0.8),
    box(0.1, 0.12, 5.0, -1.2, 2.3, -0.8),
    box(2.42, 0.12, 0.1, 0, 2.3, -3.3),
  ], new THREE.MeshStandardMaterial({ color: 0xffc107, roughness: 0.6 }));
  add(group, [
    box(2.36, 0.1, 5.0, 0, 1.25, -0.8), // deck
    box(1.0, 0.25, 7.0, 0, 0.75, 0), // chassis
    box(2.4, 0.3, 0.2, 0, 0.75, 3.65), // bumper
    box(0.2, 0.18, 0.08, 1.3, 2.3, 3.4), // mirrors
    box(0.2, 0.18, 0.08, -1.3, 2.3, 3.4),
  ], trim());
  const hl = headlight();
  const tl = taillight();
  add(group, [box(0.3, 0.2, 0.05, 0.85, 1.25, 3.62), box(0.3, 0.2, 0.05, -0.85, 1.25, 3.62)], hl, false);
  add(group, [box(0.2, 0.2, 0.05, 1.0, 0.95, -3.33), box(0.2, 0.2, 0.05, -1.0, 0.95, -3.33)], tl, false);
  addPlates(group, plate, 'commercial', { y: 0.95, z: 3.77 }, { y: 1.3, z: -3.34 }, 0.55);
  return {
    wheels: wheels(group, 0.5, [[1.0, 2.6], [-1.0, 2.6], [1.0, -1.6], [-1.0, -1.6], [1.0, -2.65], [-1.0, -2.65]], 0.3),
    wheelR: 0.5,
    lights: [hl, tl],
  };
}

/** Compact SUV (Creta / Seltos style). */
export function suvModel(group: THREE.Group, colour: number, plate = randomPlate('private')): VehicleModel {
  return modernCar(group, colour, SUV, { plate });
}

/** Hatchback (Swift style). */
export function hatchModel(group: THREE.Group, colour: number, plate = randomPlate('private')): VehicleModel {
  return modernCar(group, colour, HATCH, { plate });
}

/** Water tanker lorry: blue cab and a big tank ("drinking water"). */
export function tankerModel(group: THREE.Group, plate = randomPlate('commercial')): VehicleModel {
  add(group, [rbox(2.3, 1.55, 1.7, 0.12, 0, 1.9, 2.75), box(2.35, 0.25, 0.1, 0, 2.85, 3.62)], paintMat(0x1565c0));
  add(group, [box(1.95, 0.7, 0.05, 0, 2.15, 3.61)], glass(), false);
  add(group, [new THREE.CylinderGeometry(1.1, 1.1, 5.0, 16).rotateX(Math.PI / 2).translate(0, 2.25, -0.85)].map(flat), new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.5 }));
  add(group, [
    box(2.25, 0.25, 0.25, 0, 2.25, 1.65), box(0.2, 0.2, 5.1, 1.1, 2.25, -0.85), box(0.2, 0.2, 5.1, -1.1, 2.25, -0.85), // blue bands
  ], new THREE.MeshStandardMaterial({ color: 0x1565c0, roughness: 0.5 }));
  add(group, [
    box(1.0, 0.25, 7.0, 0, 0.75, 0), box(2.4, 0.3, 0.2, 0, 0.75, 3.65),
    box(0.2, 0.18, 0.08, 1.3, 2.3, 3.4), box(0.2, 0.18, 0.08, -1.3, 2.3, 3.4),
    box(0.3, 0.3, 0.6, 0, 1.3, -3.4), // tap
  ], trim());
  const hl = headlight();
  const tl = taillight();
  add(group, [box(0.3, 0.2, 0.05, 0.85, 1.25, 3.62), box(0.3, 0.2, 0.05, -0.85, 1.25, 3.62)], hl, false);
  add(group, [box(0.2, 0.2, 0.05, 1.0, 0.95, -3.4), box(0.2, 0.2, 0.05, -1.0, 0.95, -3.4)], tl, false);
  addPlates(group, plate, 'commercial', { y: 0.95, z: 3.77 }, { y: 1.3, z: -3.5 }, 0.55);
  return { wheels: wheels(group, 0.5, [[1.0, 2.6], [-1.0, 2.6], [1.0, -1.6], [-1.0, -1.6], [1.0, -2.65], [-1.0, -2.65]], 0.3), wheelR: 0.5, lights: [hl, tl] };
}

/** Food delivery scooter: a scooter with a big orange insulated box on the back. */
export function deliveryModel(group: THREE.Group, plate = randomPlate('private')): VehicleModel {
  const m = scooterModel(group, 0x37474f, plate);
  add(group, [rbox(0.5, 0.5, 0.5, 0.05, 0, 1.15, -0.6)], new THREE.MeshStandardMaterial({ color: 0xff6f00, roughness: 0.6 }));
  return m;
}
