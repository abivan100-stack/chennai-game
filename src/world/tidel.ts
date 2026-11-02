import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { createKit, frame, type Frame, type SignDef } from './kit';
import { GeoBuilder } from './geo';
import { SETBACK, TIDEL_LOT, TIDEL_ROADS } from './layout';

/**
 * Tidel Park, Taramani (stylised): Chennai's landmark IT park, in glass, ~125 m wide across
 * three blocks with two roads passing under it. Two glass office wings
 * (16 floors) either side of a taller atrium core, glass bridges over the roads, a white concrete frame and crown, an entrance canopy, a
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

  /** Glass box in the lot frame from height y0: four glass walls (UVs in panes / floors), frame slabs. */
  const glassBlock = (fr: Frame, bw: number, h: number, bd: number, u: number, v: number, tint: THREE.Color, y0 = 0) => {
    const corners = [[-bw / 2, -bd / 2], [bw / 2, -bd / 2], [bw / 2, bd / 2], [-bw / 2, bd / 2]];
    for (let i = 0; i < 4; i++) {
      const [au, av] = corners[i];
      const [bu, bv] = corners[(i + 1) % 4];
      const len = Math.hypot(bu - au, bv - av);
      const a = fr.at(u + au, v + av, y0);
      const b = fr.at(u + bu, v + bv, y0);
      const out = fr.at(u + (au + bu), v + (av + bv)).sub(fr.at(u, v)).normalize();
      const uu = len / (PANE_W * 2);
      const vv = h / (FLOOR_H * 2);
      glass.quad(a, b, b.clone().setY(y0 + h), a.clone().setY(y0 + h), [[0, 0], [uu, 0], [uu, vv], [0, vv]], tint, out);
    }
    box(fr, bw + 0.4, 0.8, bd + 0.4, u, y0 + h, v, FRAME, false); // roof slab
    if (y0 > 0) box(fr, bw + 0.4, 0.8, bd + 0.4, u, y0 - 0.8, v, FRAME, false); // soffit over the road
    else k.solid(fr, bw, h, bd, u, 0, v);
  };

  // Lot layout across the frontage (u): the two roads pass under the building in gateways.
  const lot = TIDEL_LOT();
  const cx = (lot.x0 + lot.x1) / 2;
  const roadsU = TIDEL_ROADS.map((x) => -(x - cx)); // front 's': u runs towards -x
  const GAP = SETBACK + 0.5; // road + sidewalks, kept clear at ground level
  const segments: [number, number][] = []; // ground strips between the roads
  {
    const cuts = [...roadsU].sort((p, q) => p - q);
    let a0 = -w / 2;
    for (const r of cuts) {
      segments.push([a0, r - GAP]);
      a0 = r + GAP;
    }
    segments.push([a0, w / 2]);
  }

  // Forecourt, car park, compound walls with a gate in each strip.
  for (const [s0, s1] of segments) {
    const mid = (s0 + s1) / 2;
    const sw = s1 - s0;
    box(f, sw - 0.6, 0.03, d - 1, mid, 0, d / 2, ASPHALT, false);
    let n = 0;
    for (const v of [6, 12]) for (let u = s0 + 3; u < s1 - 3; u += 2.6) {
      if (n++ % 3 === 2 || Math.abs(u - mid) < 3) continue; // empty bays, and the drive in
      box(f, 1.8, 1.3, 4.2, u, 0.05, v, CARS[n % CARS.length]);
    }
    const side = (sw - 8) / 2;
    for (const sgn of [-1, 1]) {
      box(f, side, 1.4, 0.3, mid + sgn * (4 + side / 2), 0, 0.2, FRAME);
      box(f, 1, 3, 1, mid + sgn * 4, 0, 0.6, FRAME);
    }
    for (const u of [s0 + 0.15, s1 - 0.15]) box(f, 0.3, 1.4, d - 0.4, u, 0, d / 2, FRAME);
    box(f, sw, 1.4, 0.3, mid, 0, d - 0.15, FRAME);
    tree(f, s0 + 2.2, 16.5, 0.9);
    tree(f, s1 - 2.2, 16.5, 0.9);
  }
  board(f, 1, 0, 3.1, 0.1, 12, 1.4); // main gate, centre strip
  box(f, 2.4, 2.6, 2.4, 8, 0, 2.5, C(0xe0e0e0)); // security cabin
  box(f, 6, 0.12, 0.12, 2, 1, 1.4, C(0xd32f2f), false); // boom barrier

  // The building: two broad 16-floor glass wings, a taller atrium in the middle, and glass
  // bridges over the two roads (16 m clear) joining them into one ~125 m frontage.
  const depth = 50;
  const bv = 20 + depth / 2;
  const front = bv - depth / 2;
  const floors = 16;
  const h = floors * FLOOR_H;
  const CLEAR = 16; // headroom over the roads
  for (const [s0, s1] of segments) {
    const mid = (s0 + s1) / 2;
    const sw = s1 - s0;
    const core = Math.abs(mid) < 1;
    box(f, sw - 0.6, 1.5, depth + 2, mid, 0, bv, FRAME, true); // podium
    glassBlock(f, sw - 1, core ? h + 8 : h, core ? depth - 6 : depth, mid, bv, core ? ATRIUM_TINT : GLASS_TINT);
    for (const t of [-1, 1]) box(f, 1.2, (core ? h + 8 : h) + 1, 1.2, mid + t * ((sw - 1) / 2), 0, core ? front + 3 : front, FRAME, false);
    for (let fl = 4; fl <= floors; fl += 4) box(f, sw - 0.6, 0.45, (core ? depth - 6 : depth) + 0.4, mid, fl * FLOOR_H, bv, FRAME, false);
  }
  for (const r of roadsU) {
    glassBlock(f, 2 * GAP + 1, h - CLEAR, depth - 4, r, bv, GLASS_TINT, CLEAR);
    for (const t of [-1, 1]) box(f, 1.6, CLEAR, 1.6, r + t * (GAP + 0.2), 0, front + 2, FRAME); // gateway piers
  }
  // Crown over the atrium carrying the name, helipads on the wings, entrance canopy.
  const coreW = segments.find(([a0, a1]) => Math.abs((a0 + a1) / 2) < 1)!;
  const coreWidth = coreW[1] - coreW[0];
  box(f, coreWidth + 2, 5.5, 1.4, 0, h + 8, front + 3, FRAME, false);
  board(f, 0, 0, h + 8.7, front + 2.25, coreWidth - 2, 4);
  for (const [s0, s1] of segments) {
    const mid = (s0 + s1) / 2;
    if (Math.abs(mid) < 1) continue;
    shape(f, new THREE.CylinderGeometry(5, 5, 0.3, 20), mid, h + 0.8, bv + 10, C(0x5a5a5a));
    shape(f, new THREE.TorusGeometry(3.2, 0.2, 4, 24).rotateX(Math.PI / 2), mid, h + 1, bv + 10, C(0xffd54f));
  }
  box(f, 16, 0.6, 7, 0, 6, front - 2, FRAME, false);
  for (const sgn of [-1, 1]) box(f, 0.7, 6, 0.7, sgn * 7.3, 0, front - 5, FRAME);
  box(f, 14, 1.5, 4, 0, 0, front - 1.5, C(0xbdbdbd), false);

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
