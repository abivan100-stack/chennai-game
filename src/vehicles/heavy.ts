import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { add, box, canvasTex, coloured, flat, glass, headlight, rbox, taillight, wheels, type VehicleModel } from './models';
import { addPlates, randomPlate } from './plates';

/**
 * Big vehicles, modelled on Chennai streets: MTC buses (the old red-and-yellow body and the new
 * purple electric low-floor), a decorated lorry (two-tone cab, high orange body, tarpaulin), an
 * orange drinking-water tanker and a high-roof ambulance. Front = +z, ground y = 0. Plain parts
 * share one vertex-coloured material (1 draw call per vehicle); livery boards are canvas
 * textures, cached so every vehicle of a kind shares them.
 */

const BODY = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 });
/** One mesh from [geometry, colour] pairs. */
function paint(group: THREE.Group, parts: [THREE.BufferGeometry, number][], shadow = true) {
  return add(group, parts.map(([g, hex]) => coloured(flat(g), hex)), BODY, shadow);
}
/** Flat livery board (texture) on a vehicle's side, front or back. */
function board(group: THREE.Group, mat: THREE.Material, w: number, h: number, x: number, y: number, z: number, yaw: number) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(x, y, z);
  m.rotation.y = yaw;
  group.add(m);
  return m;
}
const cache = new Map<string, THREE.MeshStandardMaterial>();
/** A cached textured material (glow = it lights up at night, like an LED route board). */
function liveryMat(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, glow = false) {
  let m = cache.get(key);
  if (!m) {
    const t = canvasTex(w, h, draw);
    m = new THREE.MeshStandardMaterial(glow ? { map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.6 } : { map: t, roughness: 0.55 });
    cache.set(key, m);
  }
  return m;
}
const TAMIL = '"Nirmala UI", "Latha", "Noto Sans Tamil", sans-serif';
const hexCss = (hex: number) => `#${hex.toString(16).padStart(6, '0')}`;
/** Heavy wheels: tyre, steel rim and a coloured hub. */
const heavyWheel = (r: number, w: number, hub: number) => mergeGeometries([
  coloured(new THREE.CylinderGeometry(r, r, w, 16).rotateZ(Math.PI / 2).toNonIndexed(), 0x161616),
  coloured(new THREE.CylinderGeometry(r * 0.62, r * 0.62, w + 0.02, 12).rotateZ(Math.PI / 2).toNonIndexed(), 0x9aa0a6),
  coloured(new THREE.CylinderGeometry(r * 0.3, r * 0.3, w + 0.05, 8).rotateZ(Math.PI / 2).toNonIndexed(), hub),
]);

// ---------------------------------------------------------------------------------------------
// MTC buses
// ---------------------------------------------------------------------------------------------
export type BusStyle = 'old' | 'electric';
const routeBoard = (route: string, to: string) => liveryMat(`route:${route}:${to}`, 256, 48, (g) => {
  g.fillStyle = '#111';
  g.fillRect(0, 0, 256, 48);
  g.fillStyle = '#ff9a1a';
  g.font = '700 30px ui-monospace, monospace';
  g.textBaseline = 'middle';
  g.fillText(route, 10, 25);
  g.font = '700 22px ui-monospace, monospace';
  g.fillText(to, 90, 26);
}, true);

/** Chennai MTC bus: the old red-and-yellow body or the purple electric low-floor. */
export function busModel(group: THREE.Group, route = '21G', to = 'BROADWAY', plate = randomPlate('commercial'), style: BusStyle = Math.random() < 0.5 ? 'old' : 'electric'): VehicleModel {
  const L = 10;
  const W = 2.5;
  const hl = headlight();
  const tl = taillight();
  const rb = routeBoard(route, to);
  if (style === 'old') {
    const RED = 0xc4231f;
    const YELLOW = 0xf0b73c;
    const CREAM = 0xf3dc9a;
    const FRAME = 0x2a2a2a;
    const parts: [THREE.BufferGeometry, number][] = [
      [rbox(W, 1.05, L, 0.08, 0, 1.0, 0), RED], // lower body
      [box(W + 0.02, 0.32, L - 0.1, 0, 1.68, 0), YELLOW], // waist band
      [box(W + 0.04, 0.06, L - 0.1, 0, 1.6, 0), RED], // red pinstripe in the band
      [box(W + 0.02, 0.22, L - 0.1, 0, 2.73, 0), CREAM], // above the windows
      [rbox(W, 0.3, L, 0.12, 0, 2.95, 0), RED], // roof
      [box(W - 0.3, 0.12, L - 1, 0, 3.12, 0), 0x9e2a22], // roof ribs
      [box(2.3, 0.26, 0.18, 0, 0.55, L / 2), 0x333333], // bumpers
      [box(2.3, 0.26, 0.18, 0, 0.55, -L / 2), 0x333333],
      [box(W - 0.1, 0.5, 0.06, 0, 1.25, L / 2 + 0.02), YELLOW], // yellow front panel under the screen
      [box(W - 0.1, 0.5, 0.06, 0, 1.25, -L / 2 - 0.02), YELLOW],
    ];
    // Window frames (black) and pillars (yellow) along both sides: old buses have many small windows.
    for (const sx of [1, -1]) {
      for (let z = -4.4; z <= 4.4; z += 0.98) {
        if (sx > 0 && (Math.abs(z - 3.68) < 0.6 || Math.abs(z + 1.22) < 0.6)) continue; // doorways (left = kerb side)
        parts.push([box(0.05, 0.8, 0.07, sx * (W / 2 + 0.02), 2.22, z), YELLOW]);
        parts.push([box(0.05, 0.06, 0.86, sx * (W / 2 + 0.02), 2.05, z + 0.49), FRAME]); // sliding sash
      }
    }
    // Doorways on the kerb side: dark opening, steps, grab rail.
    for (const z of [3.68, -1.22]) {
      parts.push([box(0.05, 2.0, 1.0, W / 2 - 0.02, 1.48, z), 0x1b1b1b]);
      parts.push([box(0.4, 0.08, 0.95, W / 2 - 0.25, 0.55, z), YELLOW]);
      parts.push([box(0.4, 0.08, 0.95, W / 2 - 0.4, 0.85, z), 0x777777]);
      parts.push([box(0.04, 1.6, 0.04, W / 2 + 0.02, 1.6, z + 0.5), 0xcccccc]);
    }
    paint(group, parts);
    add(group, [box(W + 0.03, 0.82, L - 0.4, 0, 2.22, 0), box(2.2, 1.0, 0.05, 0, 2.15, L / 2 + 0.01), box(2.1, 0.7, 0.05, 0, 2.2, -L / 2 - 0.01)], glass(), false);
    const tn = liveryMat('bus:old:side', 512, 48, (g) => {
      g.fillStyle = '#f0b73c';
      g.fillRect(0, 0, 512, 48);
      g.fillStyle = '#c4231f';
      g.font = `700 24px ${TAMIL}`;
      g.textBaseline = 'middle';
      g.fillText('மாநகர் போக்குவரத்துக் கழகம்  ·  MTC CHENNAI', 14, 26);
    });
    for (const sx of [1, -1]) board(group, tn, 5.5, 0.28, sx * (W / 2 + 0.035), 1.7, -1.7 * sx, (sx * Math.PI) / 2);
    board(group, rb, 2.0, 0.36, 0, 2.86, L / 2 + 0.03, 0);
    board(group, rb, 1.4, 0.26, W / 2 + 0.04, 2.73, 2.2, Math.PI / 2);
    add(group, [box(0.32, 0.22, 0.05, 0.85, 0.9, L / 2 + 0.03), box(0.32, 0.22, 0.05, -0.85, 0.9, L / 2 + 0.03)], hl, false);
    add(group, [box(0.25, 0.3, 0.05, 1.0, 0.95, -L / 2 - 0.03), box(0.25, 0.3, 0.05, -1.0, 0.95, -L / 2 - 0.03)], tl, false);
    addPlates(group, plate, 'commercial', { y: 0.72, z: L / 2 + 0.11 }, { y: 0.8, z: -L / 2 - 0.11 }, 0.55);
    const geo = heavyWheel(0.5, 0.32, RED);
    return { wheels: wheels(group, 0.5, [[1.08, 3.0], [-1.08, 3.0], [1.08, -3.1], [-1.08, -3.1]], 0.32, geo), wheelR: 0.5, lights: [hl, tl, rb] };
  }
  // Electric low-floor: purple body, a deep black glazing band, a yellow pinstripe, battery pod on the roof.
  const PURPLE = 0x4b3bb5;
  const DARK = 0x111418;
  paint(group, [
    [rbox(W, 0.95, L, 0.1, 0, 0.82, 0), PURPLE], // low skirt (low floor)
    [box(W + 0.02, 0.05, L - 0.2, 0, 1.33, 0), 0xf2b82c], // yellow pinstripe
    [rbox(W, 0.42, L, 0.14, 0, 3.0, 0), PURPLE], // roof
    [rbox(1.8, 0.3, 4.2, 0.1, 0, 3.32, -1.2), 0x3a2f8f], // roof battery pod
    [box(W - 0.1, 0.6, 0.06, 0, 0.75, L / 2 + 0.02), PURPLE], // front valance
    [box(2.3, 0.2, 0.16, 0, 0.42, L / 2 + 0.03), DARK],
    [box(2.3, 0.2, 0.16, 0, 0.42, -L / 2 - 0.03), DARK],
    // Glass doors on the kerb side: frames with yellow handrails behind.
    [box(0.05, 2.2, 1.2, W / 2 + 0.02, 1.5, 3.5), 0x2b2b2b],
    [box(0.05, 2.2, 1.2, W / 2 + 0.02, 1.5, -0.8), 0x2b2b2b],
    [box(0.04, 1.8, 0.04, W / 2 - 0.15, 1.5, 3.5), 0xf2b82c],
    [box(0.04, 1.8, 0.04, W / 2 - 0.15, 1.5, -0.8), 0xf2b82c],
  ]);
  // The big black glazing band (tinted glass over a dark inside) and the black windscreen.
  const black = new THREE.MeshStandardMaterial({ color: DARK, roughness: 0.15, metalness: 0.4 });
  add(group, [box(W + 0.01, 1.42, L - 0.3, 0, 2.06, 0), box(W - 0.2, 1.7, 0.06, 0, 1.95, L / 2 + 0.01), box(W - 0.3, 1.3, 0.06, 0, 2.1, -L / 2 - 0.01)], black, false);
  const side = liveryMat('bus:ev:side', 512, 64, (g) => {
    g.fillStyle = hexCss(PURPLE);
    g.fillRect(0, 0, 512, 64);
    g.fillStyle = '#ffffff';
    g.font = `700 22px ${TAMIL}`;
    g.textBaseline = 'middle';
    g.fillText('மாநகர் போக்குவரத்துக் கழகம்', 14, 22);
    g.font = '800 20px system-ui, sans-serif';
    g.fillText('MTC CHENNAI  ·  ELECTRIC  ⚡', 14, 48);
  });
  for (const sx of [1, -1]) board(group, side, 3.6, 0.45, sx * (W / 2 + 0.03), 0.9, -2.6 * sx, (sx * Math.PI) / 2);
  board(group, rb, 2.0, 0.34, 0, 2.62, L / 2 + 0.05, 0);
  board(group, rb, 1.4, 0.26, W / 2 + 0.03, 2.55, 1.6, Math.PI / 2);
  add(group, [box(0.5, 0.12, 0.05, 0.85, 0.95, L / 2 + 0.05), box(0.5, 0.12, 0.05, -0.85, 0.95, L / 2 + 0.05)], hl, false);
  add(group, [box(0.12, 0.6, 0.05, 1.1, 1.1, -L / 2 - 0.03), box(0.12, 0.6, 0.05, -1.1, 1.1, -L / 2 - 0.03)], tl, false);
  addPlates(group, plate, 'commercial', { y: 0.6, z: L / 2 + 0.12 }, { y: 0.8, z: -L / 2 - 0.1 }, 0.55);
  const geo = heavyWheel(0.48, 0.3, 0xc8ccd0);
  return { wheels: wheels(group, 0.48, [[1.08, 3.2], [-1.08, 3.2], [1.08, -2.9], [-1.08, -2.9]], 0.3, geo), wheelR: 0.48, lights: [hl, tl, rb] };
}

// ---------------------------------------------------------------------------------------------
// Lorry
// ---------------------------------------------------------------------------------------------
/** A Tamil Nadu lorry: cream-and-blue cab with a PERMIT board, a high painted body (colour), tarpaulin over the load. */
export function lorryModel(group: THREE.Group, colour = 0xd9541e, plate = randomPlate('commercial')): VehicleModel {
  const CREAM = 0xf1ece0;
  const BLUE = 0x2c7cc4;
  const BUMPER = 0xf2c230;
  const parts: [THREE.BufferGeometry, number][] = [
    // Cab: cream lower half, blue upper half and roof cap with a sun visor brim.
    [rbox(2.35, 1.05, 1.75, 0.1, 0, 1.15, 2.85), CREAM],
    [rbox(2.35, 1.0, 1.7, 0.1, 0, 2.15, 2.85), BLUE],
    [box(2.45, 0.12, 0.45, 0, 2.7, 3.75), BLUE],
    [box(1.3, 0.22, 0.05, 0, 1.0, 3.74), 0xbfc4c8], // chrome grille bars
    [box(1.3, 0.22, 0.05, 0, 1.3, 3.74), 0xbfc4c8],
    [box(2.4, 0.06, 0.06, 0, 1.62, 3.73), 0xd32f2f], // red and saffron pinstripes
    [box(2.4, 0.06, 0.06, 0, 1.52, 3.73), 0xff9800],
    [box(2.5, 0.28, 0.25, 0, 0.6, 3.8), BUMPER], // yellow bumper
    [box(0.08, 0.35, 0.06, 1.3, 2.3, 3.3), 0x222222], // mirror arms
    [box(0.08, 0.35, 0.06, -1.3, 2.3, 3.3), 0x222222],
    [box(0.22, 0.32, 0.06, 1.4, 2.35, 3.3), 0x222222],
    [box(0.22, 0.32, 0.06, -1.4, 2.35, 3.3), 0x222222],
    // Load body: deck, white lower band, high painted sides with ribs, headboard, tailgate.
    [box(2.45, 0.12, 5.4, 0, 1.2, -0.9), 0x3a3a3a],
    [box(2.47, 0.32, 5.4, 0, 1.42, -0.9), 0xf5f5f5],
    [box(0.08, 1.3, 5.4, 1.2, 2.23, -0.9), colour],
    [box(0.08, 1.3, 5.4, -1.2, 2.23, -0.9), colour],
    [box(2.45, 1.75, 0.1, 0, 2.0, 1.8), colour],
    [box(2.45, 1.3, 0.08, 0, 2.23, -3.6), colour],
    [box(2.5, 0.08, 5.5, 0, 2.9, -0.9), 0xf5f5f5], // top rail
    // Tarpaulin over the load, tied down: a rounded khaki hump.
    [rbox(2.3, 0.55, 5.3, 0.25, 0, 3.05, -0.9), 0x8f8a64],
    // Chassis, fuel tank, mudguards, tassels hanging from the bumper.
    [box(1.0, 0.28, 7.2, 0, 0.75, -0.1), 0x222222],
    [box(0.5, 0.45, 1.0, -1.0, 0.85, 0.9), 0x2a2a2a],
    [box(0.6, 0.06, 1.2, 1.0, 1.08, -2.25), 0x111111],
    [box(0.6, 0.06, 1.2, -1.0, 1.08, -2.25), 0x111111],
  ];
  for (const x of [-1.05, -0.75, 0.75, 1.05]) parts.push([box(0.05, 0.35, 0.03, x, 0.3, 3.86), 0x111111]);
  for (let z = -3.4; z <= 1.6; z += 0.82) for (const sx of [1, -1]) parts.push([box(0.06, 1.3, 0.1, sx * 1.25, 2.23, z), new THREE.Color(colour).multiplyScalar(0.75).getHex()]);
  paint(group, parts);
  add(group, [box(2.0, 0.75, 0.05, 0, 2.18, 3.71), box(0.05, 0.6, 0.9, 1.18, 2.2, 2.9), box(0.05, 0.6, 0.9, -1.18, 2.2, 2.9)], glass(), false);
  // Painted decorations: a permit board on the cab top, side panels, HORN OK PLEASE on the back.
  const permit = liveryMat('lorry:permit', 256, 64, (g) => {
    g.fillStyle = '#f5f5f5';
    g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#c62828';
    g.font = '900 40px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('PERMIT', 128, 34);
  });
  board(group, permit, 1.0, 0.25, 0, 2.95, 3.6, 0);
  const sideMat = liveryMat(`lorry:side:${colour}`, 512, 128, (g) => {
    g.fillStyle = hexCss(colour);
    g.fillRect(0, 0, 512, 128);
    g.strokeStyle = '#ffffff';
    g.lineWidth = 4;
    for (let x = 8; x < 500; x += 84) g.strokeRect(x, 14, 72, 100);
    g.fillStyle = '#ffd54f';
    g.font = '800 22px system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.fillText('NATIONAL PERMIT  ·  PUBLIC CARRIER', 30, 112);
    g.fillStyle = '#1e5aa8';
    for (let x = 44; x < 500; x += 84) {
      g.beginPath();
      g.arc(x, 56, 16, 0, Math.PI * 2);
      g.fill();
    }
  });
  for (const sx of [1, -1]) board(group, sideMat, 5.2, 1.2, sx * 1.26, 2.23, -0.9, (sx * Math.PI) / 2);
  const back = liveryMat('lorry:back', 256, 128, (g) => {
    g.fillStyle = hexCss(colour);
    g.fillRect(0, 0, 256, 128);
    g.fillStyle = '#ffffff';
    g.font = '900 30px system-ui, sans-serif';
    g.textAlign = 'center';
    g.fillText('HORN', 128, 40);
    g.fillText('OK PLEASE', 128, 78);
    g.fillStyle = '#ffd54f';
    g.font = `700 20px ${TAMIL}`;
    g.fillText('தாய் மண்ணே வணக்கம்', 128, 112);
  });
  board(group, back, 2.2, 1.1, 0, 2.23, -3.66, Math.PI);
  const hl = headlight();
  const tl = taillight();
  add(group, [new THREE.CylinderGeometry(0.15, 0.15, 0.06, 12).rotateX(Math.PI / 2).translate(0.85, 1.15, 3.74), new THREE.CylinderGeometry(0.15, 0.15, 0.06, 12).rotateX(Math.PI / 2).translate(-0.85, 1.15, 3.74)].map(flat), hl, false);
  add(group, [box(0.22, 0.2, 0.05, 1.0, 1.0, -3.66), box(0.22, 0.2, 0.05, -1.0, 1.0, -3.66)], tl, false);
  addPlates(group, plate, 'commercial', { y: 0.6, z: 3.94 }, { y: 1.25, z: -3.67 }, 0.55);
  const geo = heavyWheel(0.52, 0.32, 0xd32f2f);
  return { wheels: wheels(group, 0.52, [[1.02, 2.65], [-1.02, 2.65], [1.02, -1.75], [-1.02, -1.75], [1.02, -2.9], [-1.02, -2.9]], 0.32, geo), wheelR: 0.52, lights: [hl, tl] };
}

// ---------------------------------------------------------------------------------------------
// Water tanker
// ---------------------------------------------------------------------------------------------
/** Orange drinking-water tanker: flat-fronted orange cab, an orange tank with the supply's name in blue. */
export function tankerModel(group: THREE.Group, plate = randomPlate('commercial')): VehicleModel {
  const ORANGE = 0xe0661c;
  const parts: [THREE.BufferGeometry, number][] = [
    [rbox(2.3, 2.0, 1.6, 0.12, 0, 1.6, 2.9), ORANGE], // cab
    [box(2.35, 0.1, 0.2, 0, 2.62, 3.7), 0x8a3a10], // visor
    [box(2.3, 0.3, 0.22, 0, 0.62, 3.75), 0x222222], // bumper
    [box(1.2, 0.35, 0.05, 0, 1.05, 3.71), 0x333333], // grille
    [new THREE.CylinderGeometry(1.05, 1.05, 4.7, 18).rotateX(Math.PI / 2).translate(0, 2.05, -0.95), ORANGE], // tank
    [new THREE.CylinderGeometry(1.07, 1.07, 0.08, 18).rotateX(Math.PI / 2).translate(0, 2.05, 1.38), 0x8a3a10], // tank end rings
    [new THREE.CylinderGeometry(1.07, 1.07, 0.08, 18).rotateX(Math.PI / 2).translate(0, 2.05, -3.28), 0x8a3a10],
    [new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12).translate(0, 3.15, -0.2), 0x8a3a10], // manholes
    [new THREE.CylinderGeometry(0.3, 0.3, 0.2, 12).translate(0, 3.15, -2.0), 0x8a3a10],
    [box(1.0, 0.3, 7.2, 0, 0.75, -0.1), 0x222222], // chassis
    [box(2.2, 0.1, 4.8, 0, 0.98, -0.95), 0x333333], // tank cradle
    [new THREE.CylinderGeometry(0.08, 0.08, 1.4, 8).rotateZ(Math.PI / 2).translate(0, 0.9, -3.45), 0x666666], // outlet pipe + tap
    [box(0.25, 0.25, 0.25, 0.6, 0.9, -3.45), 0x1565c0],
    [box(0.08, 0.6, 0.06, 1.25, 2.1, 3.2), 0x222222], // mirrors
    [box(0.08, 0.6, 0.06, -1.25, 2.1, 3.2), 0x222222],
  ];
  for (const y of [1.2, 1.6, 2.0, 2.4, 2.8]) parts.push([box(0.5, 0.05, 0.05, 0.75, y, -3.38), 0x777777]); // ladder rungs
  parts.push([box(0.05, 1.8, 0.05, 0.52, 2.0, -3.38), 0x777777], [box(0.05, 1.8, 0.05, 0.98, 2.0, -3.38), 0x777777]);
  paint(group, parts);
  add(group, [box(2.0, 0.85, 0.05, 0, 2.05, 3.71), box(0.05, 0.6, 0.8, 1.16, 2.05, 2.95), box(0.05, 0.6, 0.8, -1.16, 2.05, 2.95)], glass(), false);
  const band = liveryMat('tanker:side', 512, 96, (g) => {
    g.fillStyle = hexCss(ORANGE);
    g.fillRect(0, 0, 512, 96);
    g.fillStyle = '#ffffff';
    g.fillRect(0, 18, 512, 60);
    g.fillStyle = '#1557a8';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.font = `800 24px ${TAMIL}`;
    g.fillText('குடிநீர் சப்ளை', 256, 34);
    g.font = '900 22px system-ui, sans-serif';
    g.fillText('MYLAI DRINKING WATER SUPPLY', 256, 62);
  });
  for (const sx of [1, -1]) board(group, band, 4.2, 0.8, sx * 1.06, 2.05, -0.95, (sx * Math.PI) / 2);
  const hl = headlight();
  const tl = taillight();
  add(group, [box(0.3, 0.2, 0.05, 0.85, 1.05, 3.72), box(0.3, 0.2, 0.05, -0.85, 1.05, 3.72)], hl, false);
  add(group, [box(0.2, 0.2, 0.05, 1.0, 0.95, -3.4), box(0.2, 0.2, 0.05, -1.0, 0.95, -3.4)], tl, false);
  addPlates(group, plate, 'commercial', { y: 0.62, z: 3.88 }, { y: 1.25, z: -3.5 }, 0.55);
  const geo = heavyWheel(0.5, 0.3, 0x1e88e5);
  return { wheels: wheels(group, 0.5, [[1.0, 2.6], [-1.0, 2.6], [1.0, -1.7], [-1.0, -1.7], [1.0, -2.75], [-1.0, -2.75]], 0.3, geo), wheelR: 0.5, lights: [hl, tl] };
}

// ---------------------------------------------------------------------------------------------
// Ambulance
// ---------------------------------------------------------------------------------------------
/** The roof light bar of every ambulance (one material each colour: they all flash together). */
export const AMBULANCE_BEACONS = [
  new THREE.MeshStandardMaterial({ color: 0xc00000, emissive: 0xff1010, emissiveIntensity: 0 }),
  new THREE.MeshStandardMaterial({ color: 0x0030c0, emissive: 0x2060ff, emissiveIntensity: 0 }),
] as const;
/** High-roof van ambulance (Traveller style): white, red bands, AMBULANCE mirrored on the nose, light bar. */
export function ambulanceModel(group: THREE.Group, plate = randomPlate('commercial')): VehicleModel {
  const WHITE = 0xf7f7f4;
  const RED = 0xd71920;
  paint(group, [
    [rbox(2.0, 2.15, 4.3, 0.14, 0, 1.55, -0.6), WHITE], // box body (high roof)
    [rbox(1.95, 0.85, 1.25, 0.18, 0, 0.88, 2.1), WHITE], // bonnet
    [box(1.9, 0.12, 0.2, 0, 1.2, 2.65), 0x222222], // grille
    [box(2.02, 0.2, 4.32, 0, 1.2, -0.6), RED], // red waist band
    [box(2.02, 0.06, 4.32, 0, 0.95, -0.6), 0x1565c0], // blue pinstripe
    [box(1.95, 0.28, 0.25, 0, 0.55, 2.75), 0x2a2a2a], // bumpers
    [box(1.95, 0.28, 0.2, 0, 0.55, -2.8), 0x2a2a2a],
    [box(1.6, 0.1, 0.4, 0, 2.66, 0.9), 0x333333], // light bar base
    [box(0.06, 0.4, 0.05, 1.05, 1.85, 1.55), 0x222222], // mirrors
    [box(0.06, 0.4, 0.05, -1.05, 1.85, 1.55), 0x222222],
  ]);
  // Windscreen leaning back over the bonnet, cab side windows, rear door windows.
  const screen = new THREE.BoxGeometry(1.8, 0.85, 0.05).rotateX(-0.45).translate(0, 1.85, 1.62);
  add(group, [flat(screen), box(0.05, 0.55, 0.8, 1.01, 1.95, 1.0), box(0.05, 0.55, 0.8, -1.01, 1.95, 1.0), box(0.7, 0.5, 0.05, 0.42, 1.95, -2.76), box(0.7, 0.5, 0.05, -0.42, 1.95, -2.76)], glass(), false);
  add(group, [box(0.6, 0.16, 0.36, 0.38, 2.79, 0.9)], AMBULANCE_BEACONS[0], false);
  add(group, [box(0.6, 0.16, 0.36, -0.38, 2.79, 0.9)], AMBULANCE_BEACONS[1], false);
  const side = liveryMat('amb:side', 512, 128, (g) => {
    g.fillStyle = '#f7f7f4';
    g.fillRect(0, 0, 512, 128);
    g.fillStyle = '#d71920';
    g.font = '900 44px system-ui, sans-serif';
    g.textBaseline = 'middle';
    g.fillText('AMBULANCE', 120, 46);
    g.font = '700 22px system-ui, sans-serif';
    g.fillText('EMERGENCY · 24x7', 122, 96);
    // Star of life.
    g.fillStyle = '#1565c0';
    g.save();
    g.translate(58, 64);
    for (let i = 0; i < 3; i++) {
      g.rotate(Math.PI / 3);
      g.fillRect(-11, -42, 22, 84);
    }
    g.restore();
    g.fillStyle = '#ffffff';
    g.fillRect(55, 36, 6, 56);
  });
  for (const sx of [1, -1]) board(group, side, 2.8, 0.7, sx * 1.01, 1.7, -0.9, (sx * Math.PI) / 2);
  const nose = liveryMat('amb:nose', 256, 48, (g) => {
    g.fillStyle = '#f7f7f4';
    g.fillRect(0, 0, 256, 48);
    g.fillStyle = '#d71920';
    g.font = '900 34px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.scale(-1, 1); // mirrored, so it reads right in a mirror
    g.fillText('AMBULANCE', -128, 26);
  });
  board(group, nose, 1.4, 0.26, 0, 2.45, 1.66, 0);
  const hl = headlight();
  const tl = taillight();
  add(group, [box(0.32, 0.2, 0.05, 0.7, 1.08, 2.73), box(0.32, 0.2, 0.05, -0.7, 1.08, 2.73)], hl, false);
  add(group, [box(0.16, 0.45, 0.05, 0.92, 1.2, -2.77), box(0.16, 0.45, 0.05, -0.92, 1.2, -2.77)], tl, false);
  addPlates(group, plate, 'commercial', { y: 0.55, z: 2.89 }, { y: 0.85, z: -2.91 }, 0.5);
  return { wheels: wheels(group, 0.38, [[0.85, 1.85], [-0.85, 1.85], [0.85, -1.75], [-0.85, -1.75]], 0.26), wheelR: 0.38, lights: [hl, tl] };
}
