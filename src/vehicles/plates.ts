import * as THREE from 'three';

/** Chennai RTO codes. */
const RTO = ['01', '02', '03', '04', '05', '06', '07', '09', '10', '11', '12', '14', '22'];
const LETTERS = 'ABCDEFGHJKLMNPRSTUVWXYZ';

export type PlateKind = 'private' | 'commercial' | 'government';

/** A random Tamil Nadu registration, e.g. "TN 09 BX 4821" (government vehicles use the G series). */
export function randomPlate(kind: PlateKind = 'private') {
  const r = (n: number) => Math.floor(Math.random() * n);
  const series = kind === 'government' ? 'G' : LETTERS[r(LETTERS.length)] + LETTERS[r(LETTERS.length)];
  return `TN ${RTO[r(RTO.length)]} ${series} ${String(1000 + r(9000))}`;
}

/** Plate texture: black on white for private cars, black on yellow for autos/buses/taxis. */
export function plateTexture(text: string, kind: PlateKind = 'private') {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = kind === 'commercial' ? '#ffd400' : '#f7f7f2';
  g.fillRect(0, 0, 256, 64);
  g.strokeStyle = '#111';
  g.lineWidth = 5;
  g.strokeRect(3, 3, 250, 58);
  g.fillStyle = '#111';
  g.font = '700 34px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 128, 34);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Front + back plates on a vehicle (front faces +z). */
export function addPlates(group: THREE.Group, text: string, kind: PlateKind, front: { y: number; z: number }, back: { y: number; z: number }, width = 0.42) {
  const mat = new THREE.MeshStandardMaterial({ map: plateTexture(text, kind), roughness: 0.5 });
  const geo = new THREE.PlaneGeometry(width, width / 4);
  const f = new THREE.Mesh(geo, mat);
  f.position.set(0, front.y, front.z + 0.01);
  const b = new THREE.Mesh(geo, mat);
  b.position.set(0, back.y, back.z - 0.01);
  b.rotation.y = Math.PI;
  group.add(f, b);
}
