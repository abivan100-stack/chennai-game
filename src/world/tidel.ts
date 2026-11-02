import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { createKit, frame, type Frame, type SignDef } from './kit';
import { GeoBuilder } from './geo';
import { TIDEL_LOT } from './layout';

/**
 * Tidel Park, Taramani (stylised): Chennai's landmark IT park, in glass. Two glass office wings
 * (16 floors) either side of a taller atrium core, a white concrete frame and crown, an entrance canopy, a
 * boom-barrier gate with a security cabin and a car park. Glass reflects the sky by day and
 * the offices light up at night. 5 draw calls.
 */

const SIGNS: SignDef[] = [
  ['டைடல் பார்க்', 'TIDEL PARK', '#0d3b66', '#ffffff'],
  ['டைடல் பார்க் · தரமணி', 'TIDEL PARK · TARAMANI · IT PARK', '#ffffff', '#0d3b66'],
];
const FLOOR_H = 3.8;
const PANE_W = 3; // m: the glass texture holds 2 panes x 2 floors
const C = (hex: number) => new THREE.Color(hex);
const FRAME = C(0xf2f2ee);
const GLASS_TINT = C(0x9cc3d6);
const ATRIUM_TINT = C(0xcfe6ef);
const ASPHALT = C(0x4a4a4a);
const CARS = [0xd8d8d8, 0x2b5fb3, 0xb3202a, 0x1a1a1a, 0xf4f4f4, 0x607d8b].map((c) => C(c));

/** Pale panes with dark mullions and a spandrel at each slab; `night` = lit offices. */
function curtainWall(night: boolean) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = night ? '#000000' : '#2d3a44';
  g.fillRect(0, 0, 256, 256);
  for (let fy = 0; fy < 2; fy++) {
    for (let px = 0; px < 2; px++) {
      const x = px * 128 + 4;
      const y = fy * 128 + 4;
      if (night) {
        if ((px + fy * 3) % 3 === 2) continue; // a dark office here and there
        g.fillStyle = '#fff1c8';
        g.fillRect(x, y, 120, 100);
        continue;
      }
      const grad = g.createLinearGradient(x, y, x + 120, y + 100);
      grad.addColorStop(0, '#f4fafc');
      grad.addColorStop(1, '#8fb3c6');
      g.fillStyle = grad;
      g.fillRect(x, y, 120, 100);
    }
    if (!night) {
      g.fillStyle = '#5b6870';
      g.fillRect(0, fy * 128 + 106, 256, 22);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

export function createTidelPark(scene: THREE.Scene, world: RAPIER.World) {
  const k = createKit(world, SIGNS);
  const { box, board, tree, shape } = k;
  const glass = new GeoBuilder();
  const f = frame(TIDEL_LOT());
  const { w, d } = f;

  /** Glass box in the lot frame: four glass walls (UVs in panes / floors), a frame roof slab. */
  const glassBlock = (fr: Frame, bw: number, h: number, bd: number, u: number, v: number, tint: THREE.Color) => {
    const corners = [[-bw / 2, -bd / 2], [bw / 2, -bd / 2], [bw / 2, bd / 2], [-bw / 2, bd / 2]];
    for (let i = 0; i < 4; i++) {
      const [au, av] = corners[i];
      const [bu, bv] = corners[(i + 1) % 4];
      const len = Math.hypot(bu - au, bv - av);
      const a = fr.at(u + au, v + av, 0);
      const b = fr.at(u + bu, v + bv, 0);
      const out = fr.at(u + (au + bu), v + (av + bv)).sub(fr.at(u, v)).normalize();
      const uu = len / (PANE_W * 2);
      const vv = h / (FLOOR_H * 2);
      glass.quad(a, b, b.clone().setY(h), a.clone().setY(h), [[0, 0], [uu, 0], [uu, vv], [0, vv]], tint, out);
    }
    box(fr, bw + 0.4, 0.8, bd + 0.4, u, h, v, FRAME, false); // roof slab
    k.solid(fr, bw, h, bd, u, 0, v);
  };

  // Forecourt and car park.
  box(f, w - 1, 0.03, d - 1, 0, 0, d / 2, ASPHALT, false);
  let n = 0;
  for (const v of [6, 12]) for (let u = -w / 2 + 3; u < w / 2 - 3; u += 2.6) {
    if (n++ % 3 === 2 || Math.abs(u) < 3) continue; // empty bays, and the drive to the door
    box(f, 1.8, 1.3, 4.2, u, 0.05, v, CARS[n % CARS.length]);
  }

  // The building: two 16-floor glass wings either side of a taller atrium core, on a podium.
  const depth = 50;
  const bv = 20 + depth / 2; // centre, in from the road
  const front = bv - depth / 2;
  const floors = 16;
  const h = floors * FLOOR_H;
  const wingW = 11;
  const wingU = w / 2 - 1 - wingW / 2;
  box(f, w - 1.5, 1.5, depth + 2, 0, 0, bv, FRAME, true); // podium
  glassBlock(f, wingW, h, depth, -wingU, bv, GLASS_TINT);
  glassBlock(f, wingW, h, depth, wingU, bv, GLASS_TINT);
  const coreW = 2 * (wingU - wingW / 2) + 0.4;
  glassBlock(f, coreW, h + 8, depth - 10, 0, bv, ATRIUM_TINT);
  // White frame: corner piers on the wings, a tall portal round the atrium, floor bands.
  for (const s of [-1, 1]) {
    for (const t of [-1, 1]) box(f, 1.1, h + 1, 1.1, s * (wingU + t * (wingW / 2)), 0, front, FRAME, false);
    box(f, 1.2, h + 9, 1.2, s * (coreW / 2), 0, front + 4.6, FRAME, false);
  }
  for (let fl = 2; fl <= floors; fl += 2) box(f, coreW, 0.35, 0.6, 0, fl * FLOOR_H, front + 4.4, FRAME, false);
  for (let fl = 4; fl <= floors; fl += 4) for (const s of [-1, 1]) box(f, wingW + 0.4, 0.45, depth + 0.4, s * wingU, fl * FLOOR_H, bv, FRAME, false);
  // Crown over the atrium carrying the name, and a helipad on one wing.
  box(f, coreW + 2.4, 5, 1.4, 0, h + 8, front + 4.6, FRAME, false);
  board(f, 0, 0, h + 8.7, front + 3.85, coreW + 1, 3.6);
  shape(f, new THREE.CylinderGeometry(4, 4, 0.3, 20), wingU, h + 0.8, bv + 12, C(0x5a5a5a));
  shape(f, new THREE.TorusGeometry(2.6, 0.18, 4, 24).rotateX(Math.PI / 2), wingU, h + 1, bv + 12, C(0xffd54f));
  // Entrance canopy, doors, steps.
  box(f, 14, 0.6, 7, 0, 6, front - 2, FRAME, false);
  for (const s of [-1, 1]) box(f, 0.7, 6, 0.7, s * 6.3, 0, front - 5, FRAME);
  box(f, 12, 1.5, 4, 0, 0, front - 1.5, C(0xbdbdbd), false);
  // Gate: pillars, sign, security cabin, boom barrier.
  for (const s of [-1, 1]) box(f, 1, 3, 1, s * 4.5, 0, 0.6, FRAME);
  board(f, 1, 0, 3.1, 0.1, 10, 1.3);
  box(f, 2.4, 2.6, 2.4, 7, 0, 2.5, C(0xe0e0e0));
  box(f, 6, 0.12, 0.12, 2, 1, 1.4, C(0xd32f2f), false);
  const side = (w - 10) / 2;
  for (const s of [-1, 1]) box(f, side, 1.4, 0.3, s * (5 + side / 2), 0, 0.2, FRAME);
  for (const u of [-w / 2 + 2, w / 2 - 2]) tree(f, u, 16.5, 0.9);

  const setKitNight = k.build(scene);
  const glassMat = new THREE.MeshStandardMaterial({
    map: curtainWall(false), emissiveMap: curtainWall(true), emissive: 0xfff0d0, emissiveIntensity: 0,
    vertexColors: true, roughness: 0.12, metalness: 0.6,
  });
  const glassMesh = new THREE.Mesh(glass.build(), glassMat);
  glassMesh.castShadow = glassMesh.receiveShadow = true;
  scene.add(glassMesh);
  return {
    setNight(n: number) {
      setKitNight(n);
      glassMat.emissiveIntensity = n * 0.7;
    },
  };
}
