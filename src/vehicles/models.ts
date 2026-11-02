import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { addPlates, randomPlate } from './plates';

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
const headlight = () => new THREE.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff0c0, emissiveIntensity: 0.2 });
const taillight = () => new THREE.MeshStandardMaterial({ color: 0xa00000, emissive: 0xff2000, emissiveIntensity: 0.4 });

function wheels(group: THREE.Group, r: number, at: number[][], width = 0.24) {
  const geo = mergeGeometries([
    new THREE.CylinderGeometry(r, r, width, 14).rotateZ(Math.PI / 2).toNonIndexed(),
    new THREE.CylinderGeometry(r * 0.55, r * 0.55, width + 0.02, 10).rotateZ(Math.PI / 2).toNonIndexed(),
  ], true);
  const mats = [new THREE.MeshStandardMaterial({ color: 0x141414, roughness: 0.85 }), new THREE.MeshStandardMaterial({ color: 0xa8acb0, metalness: 0.7, roughness: 0.35 })];
  return at.map(([x, z]) => {
    const w = new THREE.Mesh(geo, mats);
    w.position.set(x, r, z);
    w.castShadow = true;
    group.add(w);
    return w;
  });
}

/** Indian hatchback. */
export function carModel(group: THREE.Group, colour: number, plate = randomPlate('private')): VehicleModel {
  const paint = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.3, metalness: 0.45 });
  add(group, [
    rbox(1.65, 0.6, 3.8, 0.15, 0, 0.62, 0), // body
    rbox(1.45, 0.08, 1.85, 0.04, 0, 1.43, -0.25), // roof
    box(0.08, 0.55, 0.08, 0.7, 1.15, 0.72), // A pillars
    box(0.08, 0.55, 0.08, -0.7, 1.15, 0.72),
    box(0.08, 0.55, 0.08, 0.7, 1.15, -1.15), // C pillars
    box(0.08, 0.55, 0.08, -0.7, 1.15, -1.15),
  ], paint);
  add(group, [
    box(1.72, 0.18, 0.16, 0, 0.42, 1.88), // bumpers
    box(1.72, 0.18, 0.16, 0, 0.42, -1.88),
    box(1.1, 0.22, 0.04, 0, 0.66, 1.9), // grille
    box(0.02, 0.5, 0.02, 0.83, 0.62, 0.2), // door seams
    box(0.02, 0.5, 0.02, -0.83, 0.62, 0.2),
    box(0.02, 0.5, 0.02, 0.83, 0.62, -0.75),
    box(0.02, 0.5, 0.02, -0.83, 0.62, -0.75),
    box(0.18, 0.1, 0.06, 0.92, 1.0, 0.68), // mirrors
    box(0.18, 0.1, 0.06, -0.92, 1.0, 0.68),
  ], trim());
  add(group, [rbox(1.42, 0.52, 1.95, 0.12, 0, 1.15, -0.22)], glass(), false);
  const hl = headlight();
  const tl = taillight();
  add(group, [box(0.34, 0.14, 0.05, 0.55, 0.76, 1.9), box(0.34, 0.14, 0.05, -0.55, 0.76, 1.9)], hl, false);
  add(group, [box(0.3, 0.14, 0.05, 0.6, 0.78, -1.9), box(0.3, 0.14, 0.05, -0.6, 0.78, -1.9)], tl, false);
  addPlates(group, plate, 'private', { y: 0.42, z: 1.97 }, { y: 0.6, z: -1.97 }, 0.5);
  return { wheels: wheels(group, 0.3, [[0.76, 1.25], [-0.76, 1.25], [0.76, -1.25], [-0.76, -1.25]]), wheelR: 0.3, lights: [hl, tl] };
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
const cyl = (r: number, len: number, x: number, y: number, z: number) => flat(new THREE.CylinderGeometry(r, r, len, 12).rotateX(Math.PI / 2).translate(x, y, z));

/** Step-through scooter (Activa-style). */
export function scooterModel(group: THREE.Group, colour: number, plate = randomPlate('private')): VehicleModel {
  add(group, [
    rbox(0.5, 0.42, 0.95, 0.15, 0, 0.5, -0.35), // rear body over the engine
    rbox(0.44, 0.75, 0.14, 0.06, 0, 0.62, 0.52), // front apron / leg shield
    rbox(0.26, 0.16, 0.22, 0.06, 0, 1.0, 0.58), // headset
    box(0.12, 0.08, 0.5, 0, 0.32, 0.6), // front mudguard
  ], paintMat(colour));
  add(group, [
    box(0.36, 0.05, 0.5, 0, 0.27, 0.12), // floorboard
    rbox(0.32, 0.1, 0.62, 0.05, 0, 0.78, -0.3), // seat
    box(0.62, 0.035, 0.035, 0, 1.06, 0.55), // handlebar
    box(0.04, 0.5, 0.04, 0, 0.75, 0.62), // fork
    box(0.12, 0.08, 0.03, 0.26, 1.2, 0.52), // mirrors
    box(0.12, 0.08, 0.03, -0.26, 1.2, 0.52),
  ], trim());
  const hl = headlight();
  const tl = taillight();
  add(group, [box(0.16, 0.08, 0.04, 0, 1.0, 0.7)], hl, false);
  add(group, [box(0.2, 0.06, 0.04, 0, 0.66, -0.83)], tl, false);
  addPlates(group, plate, 'private', { y: 0.45, z: 0.66 }, { y: 0.52, z: -0.84 }, 0.26);
  return { wheels: wheels(group, 0.24, [[0, 0.62], [0, -0.55]], 0.1), wheelR: 0.24, lights: [hl, tl] };
}

/** Commuter motorbike (Splendor-style). */
export function bikeModel(group: THREE.Group, colour: number, plate = randomPlate('private')): VehicleModel {
  add(group, [
    rbox(0.3, 0.22, 0.52, 0.08, 0, 0.88, 0.18), // tank
    rbox(0.26, 0.16, 0.42, 0.05, 0, 0.72, -0.62), // tail panel
    box(0.12, 0.06, 0.45, 0, 0.4, 0.68), // front mudguard
  ], paintMat(colour));
  add(group, [
    rbox(0.28, 0.08, 0.6, 0.04, 0, 0.88, -0.32), // seat
    box(0.26, 0.3, 0.42, 0, 0.48, 0.05), // engine
    box(0.06, 0.06, 1.1, 0, 0.68, 0.05), // frame
    box(0.04, 0.62, 0.04, 0, 0.72, 0.62), // fork
    box(0.66, 0.035, 0.035, 0, 1.08, 0.5), // handlebar
    box(0.12, 0.08, 0.03, 0.28, 1.22, 0.48), // mirrors
    box(0.12, 0.08, 0.03, -0.28, 1.22, 0.48),
  ], trim());
  add(group, [cyl(0.05, 0.9, -0.2, 0.36, -0.35)], new THREE.MeshStandardMaterial({ color: 0xb0b4b8, metalness: 0.8, roughness: 0.3 })); // silencer
  const hl = headlight();
  const tl = taillight();
  add(group, [cyl(0.09, 0.08, 0, 0.98, 0.72)], hl, false);
  add(group, [box(0.16, 0.06, 0.04, 0, 0.78, -0.84)], tl, false);
  addPlates(group, plate, 'private', { y: 0.55, z: 0.82 }, { y: 0.62, z: -0.86 }, 0.26);
  return { wheels: wheels(group, 0.3, [[0, 0.68], [0, -0.62]], 0.1), wheelR: 0.3, lights: [hl, tl] };
}

/** Old rounded sedan (Ambassador-style), the classic Chennai taxi. */
export function taxiModel(group: THREE.Group, colour: number, plate = randomPlate('commercial')): VehicleModel {
  add(group, [
    rbox(1.7, 0.72, 4.3, 0.28, 0, 0.72, 0), // body
    rbox(1.52, 0.5, 2.1, 0.3, 0, 1.3, -0.25), // rounded cabin
    rbox(1.1, 0.1, 1.1, 0.05, 0, 1.12, 1.45), // bonnet hump
  ], paintMat(colour));
  add(group, [rbox(1.5, 0.42, 1.95, 0.22, 0, 1.33, -0.25)], glass(), false);
  const chrome = new THREE.MeshStandardMaterial({ color: 0xd8dcdf, metalness: 0.9, roughness: 0.2 });
  add(group, [
    box(1.76, 0.16, 0.14, 0, 0.42, 2.17), // chrome bumpers
    box(1.76, 0.16, 0.14, 0, 0.42, -2.17),
    box(0.9, 0.28, 0.04, 0, 0.72, 2.16), // the big grille
  ], chrome);
  add(group, [
    box(0.02, 0.5, 0.02, 0.86, 0.78, 0.4), // door seams
    box(0.02, 0.5, 0.02, -0.86, 0.78, 0.4),
    box(0.02, 0.5, 0.02, 0.86, 0.78, -0.75),
    box(0.02, 0.5, 0.02, -0.86, 0.78, -0.75),
    box(0.16, 0.1, 0.06, 0.88, 1.02, 0.9), // mirrors
    box(0.16, 0.1, 0.06, -0.88, 1.02, 0.9),
  ], trim());
  const hl = headlight();
  const tl = taillight();
  add(group, [cyl(0.12, 0.05, 0.6, 0.8, 2.15), cyl(0.12, 0.05, -0.6, 0.8, 2.15)], hl, false); // round headlamps
  add(group, [box(0.18, 0.2, 0.05, 0.7, 0.8, -2.16), box(0.18, 0.2, 0.05, -0.7, 0.8, -2.16)], tl, false);
  addPlates(group, plate, 'commercial', { y: 0.42, z: 2.25 }, { y: 0.62, z: -2.25 }, 0.5);
  return { wheels: wheels(group, 0.32, [[0.74, 1.4], [-0.74, 1.4], [0.74, -1.35], [-0.74, -1.35]]), wheelR: 0.32, lights: [hl, tl] };
}

/** Small boxy van (Omni-style). */
export function vanModel(group: THREE.Group, colour: number, plate = randomPlate('private')): VehicleModel {
  add(group, [rbox(1.45, 1.35, 3.4, 0.14, 0, 0.98, 0)], paintMat(colour));
  add(group, [
    box(1.47, 0.42, 2.7, 0, 1.3, -0.25), // side windows band
    box(1.2, 0.5, 0.05, 0, 1.3, 1.69), // windscreen
  ], glass(), false);
  add(group, [
    box(1.5, 0.16, 0.12, 0, 0.42, 1.72), // bumpers
    box(1.5, 0.16, 0.12, 0, 0.42, -1.72),
    box(0.02, 0.9, 0.02, 0.74, 0.95, 0.75), // sliding door seams
    box(0.02, 0.9, 0.02, -0.74, 0.95, 0.75),
    box(0.02, 0.04, 1.2, -0.74, 1.08, 0.1),
    box(0.14, 0.1, 0.06, 0.8, 1.15, 1.45), // mirrors
    box(0.14, 0.1, 0.06, -0.8, 1.15, 1.45),
  ], trim());
  const hl = headlight();
  const tl = taillight();
  add(group, [box(0.28, 0.14, 0.05, 0.5, 0.7, 1.71), box(0.28, 0.14, 0.05, -0.5, 0.7, 1.71)], hl, false);
  add(group, [box(0.16, 0.28, 0.05, 0.6, 0.85, -1.71), box(0.16, 0.28, 0.05, -0.6, 0.85, -1.71)], tl, false);
  addPlates(group, plate, 'private', { y: 0.42, z: 1.79 }, { y: 0.6, z: -1.79 }, 0.45);
  return { wheels: wheels(group, 0.26, [[0.66, 1.05], [-0.66, 1.05], [0.66, -1.05], [-0.66, -1.05]], 0.2), wheelR: 0.26, lights: [hl, tl] };
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
