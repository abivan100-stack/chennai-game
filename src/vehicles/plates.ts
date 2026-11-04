import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

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

/** Invented makers and models (no real brands): badges on cars, names on cab company livery. */
export const MAKERS = ['KAVERI', 'VEGA', 'SURYA', 'NILA', 'ORBIS', 'TARA', 'VAAYU', 'MAGIZH'];
export const MODELS: Record<'hatch' | 'sedan' | 'suv' | 'mpv' | 'van', string[]> = {
  hatch: ['Zippy', 'Kutty', 'Spark', 'Pulse'],
  sedan: ['Aura', 'Vista', 'Regal', 'Sedana'],
  suv: ['Ranger', 'Thunder', 'Ghat', 'Malai'],
  mpv: ['Family', 'Yatra', 'Saathi'],
  van: ['Cargo', 'Vaahan', 'Eezy'],
};
export const CAB_COMPANIES = ['MADRAS CABS', 'NAMMA TAXI', 'KAVERI CALL TAXI', 'SPEED CABS', 'MARINA TAXI', 'CHENNAI FAST CABS'];
export const pick = <T,>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];

/** A badge or a livery name placed on the body: centre, width, turned ry about y (0 = facing forward). */
export interface BadgeSpot {
  x?: number;
  y: number;
  z: number;
  w: number;
  ry: number;
}
export interface Badge {
  text: string;
  /** Background (the paint colour for a badge; the livery colour for a cab name). */
  bg: number;
  /** 'chrome' lettering (car badges) or plain dark lettering (cab livery). */
  style: 'chrome' | 'livery';
  at: BadgeSpot[];
}

/** Plate texture: black on white for private cars, black on yellow for autos/buses/taxis. Bottom half: the badge, if any. */
export function plateTexture(text: string, kind: PlateKind = 'private', badge?: Badge) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = badge ? 128 : 64;
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
  if (badge) {
    g.fillStyle = `#${badge.bg.toString(16).padStart(6, '0')}`;
    g.fillRect(0, 64, 256, 64);
    const size = Math.min(44, Math.floor(420 / Math.max(6, badge.text.length)));
    g.font = `italic 800 ${size}px system-ui, sans-serif`;
    if (badge.style === 'chrome') {
      const grad = g.createLinearGradient(0, 74, 0, 118);
      grad.addColorStop(0, '#ffffff');
      grad.addColorStop(0.5, '#9aa2aa');
      grad.addColorStop(1, '#e8ecef');
      g.fillStyle = grad;
      g.strokeStyle = 'rgba(0,0,0,0.55)';
      g.lineWidth = 3;
      g.strokeText(badge.text, 128, 97);
    } else g.fillStyle = '#141414';
    g.fillText(badge.text, 128, 97);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A quad showing rows v0..v1 of the plate texture. */
function quad(w: number, v0: number, v1: number) {
  const g = new THREE.PlaneGeometry(w, w / 4);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) > 0.5 ? v1 : v0);
  return g;
}

/**
 * Front + back plates on a vehicle (front faces +z), and optionally a badge / livery name in the
 * same texture and mesh: still one draw call per vehicle.
 */
export function addPlates(group: THREE.Group, text: string, kind: PlateKind, front: { y: number; z: number }, back: { y: number; z: number }, width = 0.42, badge?: Badge) {
  const mat = new THREE.MeshStandardMaterial({ map: plateTexture(text, kind, badge), roughness: 0.5 });
  const [p0, p1] = badge ? [0.5, 1] : [0, 1];
  const geos = [
    quad(width, p0, p1).translate(0, front.y, front.z + 0.01),
    quad(width, p0, p1).rotateY(Math.PI).translate(0, back.y, back.z - 0.01),
  ];
  for (const b of badge?.at ?? []) geos.push(quad(b.w, 0, 0.5).rotateY(b.ry).translate(b.x ?? 0, b.y, b.z));
  const mesh = new THREE.Mesh(mergeGeometries(geos)!, mat);
  mesh.name = 'plates';
  mesh.userData.plate = { text, kind, badge };
  group.add(mesh);
}

/**
 * Repaint a vehicle's plates as another kind (a car you own and run as a cab gets the yellow
 * commercial plate; same registration, same badge).
 */
export function setPlateKind(group: THREE.Object3D, kind: PlateKind) {
  const mesh = group.getObjectByName('plates') as THREE.Mesh | undefined;
  const info = mesh?.userData.plate as { text: string; kind: PlateKind; badge?: Badge } | undefined;
  if (!mesh || !info || info.kind === kind) return;
  const mat = mesh.material as THREE.MeshStandardMaterial;
  mat.map?.dispose();
  mat.map = plateTexture(info.text, kind, info.badge);
  mat.needsUpdate = true;
  info.kind = kind;
}
