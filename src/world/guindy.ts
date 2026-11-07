import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import { createKit, frame, signAtlas, type Frame, type SignDef } from './kit';
import { GUINDY } from './layout';

/**
 * Guindy: the race course (oval track, grandstand, totaliser, horses racing in the afternoon),
 * the industrial estate (sawtooth-roof factory sheds, warehouses, containers, a chimney, parked
 * lorries; company names are invented) and Guindy National Park (fenced woods, a pond, spotted
 * deer grazing). One kit (3 draw calls) + instanced horses, jockeys and deer (3).
 */

/** Game hours when there's racing (horses on the track, crowd at the stand). */
export const RACE_HOURS: [number, number] = [14, 18];
const HORSES = 8;
const DEER = 12;
/** Track: straight half-length, outer / inner radius, centre depth in the race lot's frame. */
const L = 27;
const R_OUT = 21;
const R_IN = 15;
const CV = 40;
/** The race course gate (u along the front), clear of the grandstand. */
const GATE_U = 30;
const GALLOP = 15; // m/s
const ACTIVE_DIST = 260; // m: animals further than this from the player aren't updated

const SIGNS: SignDef[] = [
  ['கிண்டி குதிரைப் பந்தய மைதானம்', 'GUINDY RACE COURSE', '#14532d', '#ffffff'],
  ['கிண்டி தொழிற்பேட்டை', 'GUINDY INDUSTRIAL ESTATE', '#1e3a5f', '#ffd54f'],
  ['கிண்டி தேசிய பூங்கா', 'GUINDY NATIONAL PARK', '#3f2a14', '#f1e3c4'],
  ['காவேரி பம்ப்ஸ்', 'KAVERI PUMPS & MOTORS', '#0d47a1', '#ffffff'],
  ['சோழா காஸ்டிங்ஸ்', 'CHOLA CASTINGS PVT LTD', '#5d4037', '#ffecb3'],
  ['அன்பு எலக்ட்ரிகல்ஸ்', 'ANBU ELECTRICALS', '#c62828', '#ffffff'],
  ['ஸ்ரீ முருகன் இன்ஜினியரிங்', 'SRI MURUGAN ENGINEERING WORKS', '#f9a825', '#1a1a1a'],
  ['பாரத் போல்ட்ஸ்', 'BHARATH BOLTS & NUTS', '#37474f', '#ffffff'],
  ['தென்றல் டெக்ஸ்டைல்ஸ்', 'THENDRAL TEXTILE MILLS', '#6a1b9a', '#ffffff'],
  ['கிடங்கு வாடகைக்கு', 'WAREHOUSE TO LET', '#ffffff', '#c62828'],
  ['வெற்றி · இடம்', 'TOTE · WIN · PLACE', '#111111', '#ffd54f'],
];

const C = (hex: number) => new THREE.Color(hex);
const GRASS = C(0x5f9a45);
const INFIELD = C(0x79b85a);
const TRACK = C(0x9a7550);
const WHITE = C(0xf5f5f5);
const CONCRETE = C(0xbdb8ad);
const TARMAC = C(0x4a4a4a);
const WALL = C(0xd8d0c0);

/** Stadium (running-track) outline: straights of half-length l, ends of radius r. */
function stadium(l: number, r: number) {
  const s = new THREE.Shape();
  s.moveTo(-l, -r);
  s.lineTo(l, -r);
  s.absarc(l, 0, r, -Math.PI / 2, Math.PI / 2, false);
  s.lineTo(-l, r);
  s.absarc(-l, 0, r, Math.PI / 2, (3 * Math.PI) / 2, false);
  return s;
}
const ring = (l: number, ro: number, ri: number) => {
  const s = stadium(l, ro);
  s.holes.push(new THREE.Path(stadium(l, ri).getPoints(24).reverse()));
  return s;
};
/** A point on the track's lane of radius r, d metres round from the start (near straight, going +u). */
function lanePoint(d: number, r: number, out: { u: number; v: number }) {
  const p = 4 * L + 2 * Math.PI * r;
  d = ((d % p) + p) % p;
  if (d < 2 * L) return Object.assign(out, { u: -L + d, v: CV - r });
  d -= 2 * L;
  const arc = Math.PI * r;
  if (d < arc) {
    const a = -Math.PI / 2 + d / r;
    return Object.assign(out, { u: L + r * Math.cos(a), v: CV + r * Math.sin(a) });
  }
  d -= arc;
  if (d < 2 * L) return Object.assign(out, { u: L - d, v: CV + r });
  d -= 2 * L;
  const a = Math.PI / 2 + d / r;
  return Object.assign(out, { u: -L + r * Math.cos(a), v: CV + r * Math.sin(a) });
}

export function createGuindy(scene: THREE.Scene, world: RAPIER.World) {
  const k = createKit(world, SIGNS);
  const { box, board, tree, shape } = k;
  const flat = (s: THREE.Shape, f: Frame, y: number, c: THREE.Color) => shape(f, new THREE.ShapeGeometry(s, 24).rotateX(-Math.PI / 2), 0, y, CV, c);
  const prism = (len: number, w: number, h: number) => new THREE.CylinderGeometry(1, 1, len, 3).rotateZ(Math.PI / 2).rotateX(Math.PI / 6).scale(1, h / 1.5, w / Math.sqrt(3)).translate(0, h / 3, 0);

  // ---------------- Race course ----------------
  const race = frame(GUINDY.race());
  {
    const f = race;
    box(f, f.w - 1, 0.02, f.d - 1, 0, 0, f.d / 2, GRASS, false);
    flat(ring(L, R_OUT, R_IN), f, 0.04, TRACK);
    flat(stadium(L, R_IN), f, 0.035, INFIELD);
    // White rails on both sides of the track, on posts.
    for (const r of [R_OUT + 0.3, R_IN - 0.3]) {
      shape(f, new THREE.ExtrudeGeometry(ring(L, r + 0.07, r - 0.07), { depth: 0.08, bevelEnabled: false, curveSegments: 24 }).rotateX(-Math.PI / 2), 0, 1.0, CV, WHITE);
      const p = { u: 0, v: 0 };
      const per = 4 * L + 2 * Math.PI * r;
      for (let d = 0; d < per; d += 5) {
        lanePoint(d, r, p);
        box(f, 0.08, 1.0, 0.08, p.u, 0, p.v, WHITE, false);
      }
    }
    // Grandstand: stepped tiers facing the track, roof on posts, the name on top facing the road.
    for (let t = 0; t < 6; t++) box(f, 44, 0.5 + t * 0.55, 1.5, 0, 0, 15.2 - t * 1.5, t % 2 ? C(0x2e7d32) : C(0xe8e2d4));
    box(f, 44, 7, 0.4, 0, 0, 5.6, WALL);
    for (const u of [-21, -7, 7, 21]) box(f, 0.35, 6.4, 0.35, u, 0, 15.5, WHITE);
    box(f, 46, 0.35, 11, 0, 6.4, 10.5, C(0x1b5e20), false);
    board(f, 0, 0, 7, 5.3, 20, 2.2);
    // Winning post and judges' box at the finish line, the totaliser board, a paddock ring.
    box(f, 0.2, 3.2, 0.2, 0, 0, CV - R_OUT - 0.6, WHITE, false);
    shape(f, new THREE.CylinderGeometry(0.6, 0.6, 0.08, 16).rotateX(Math.PI / 2), 0, 3.2, CV - R_OUT - 0.6, C(0xc62828));
    box(f, 3, 2.6, 3, 3.5, 3, CV - R_OUT - 2.2, WHITE);
    box(f, 0.3, 3, 0.3, 2.2, 0, CV - R_OUT - 1, WHITE, false);
    box(f, 0.3, 3, 0.3, 4.8, 0, CV - R_OUT - 1, WHITE, false);
    box(f, 12, 4, 0.5, -38, 2, 6, C(0x111111));
    board(f, 10, -38, 4.2, 5.7, 11, 1.4);
    for (let i = 0; i < 12; i++) box(f, 0.5, 0.5, 0.1, -43 + i * 0.9, 2.6 + (i % 3) * 0.5, 5.7, C(0xffd54f), false, 0);
    box(f, 0.3, 2, 0.3, -42, 0, 6.2, C(0x333333));
    box(f, 0.3, 2, 0.3, -34, 0, 6.2, C(0x333333));
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      box(f, 0.1, 1.1, 0.1, 40 + Math.cos(a) * 7, 0, 10 + Math.sin(a) * 4.5, WHITE, false);
    }
    box(f, 12, 0.03, 7, 40, 0.03, 10, C(0x8d6e4a), false);
    // Gate on Usman Road (beside the stand, by the paddock) with a ticket cabin; lamps along the front.
    for (const s of [-1, 1]) box(f, 1, 4, 1, GATE_U + s * 4.5, 0, 0.6, WALL);
    box(f, 3, 2.6, 2.4, GATE_U - 7, 0, 2, C(0xfff3e0));
    for (const u of [-48, -16, 16, 48]) {
      box(f, 0.15, 5, 0.15, u, 0, 1.5, C(0x555555), false);
      box(f, 0.6, 0.25, 0.6, u, 5, 1.5, C(0xfff2c0), false);
      k.shape(f, new THREE.BoxGeometry(0.5, 0.15, 0.5), u, 4.9, 1.5, C(0xfff2c0), 0, k.bulbs);
    }
    // Compound wall round the lot (the gate gap at GATE_U on the front).
    const left = f.w / 2 + GATE_U - 4.5;
    const right = f.w / 2 - GATE_U - 4.5;
    box(f, left, 1.6, 0.3, -f.w / 2 + left / 2, 0, 0.15, WALL);
    box(f, right, 1.6, 0.3, f.w / 2 - right / 2, 0, 0.15, WALL);
    box(f, 0.3, 1.6, f.d, -f.w / 2 + 0.15, 0, f.d / 2, WALL);
    box(f, 0.3, 1.6, f.d, f.w / 2 - 0.15, 0, f.d / 2, WALL);
    box(f, f.w, 1.6, 0.3, 0, 0, f.d - 0.15, WALL);
    for (const u of [-45, -30, 30, 45]) tree(f, u, f.d - 3, 0.9);
  }

  // ---------------- Industrial estate ----------------
  const [e1, e2] = GUINDY.estate().map(frame);
  const ownBoard = new THREE.Mesh(new THREE.PlaneGeometry(16.2, 1.7));
  /** A factory shed: walls, a sawtooth roof of gable prisms, a roller shutter on the estate road, its name on the front. */
  const shed = (f: Frame, u: number, v: number, w: number, d: number, h: number, wall: THREE.Color, sign: number, roof = C(0x8e9aa3)) => {
    box(f, w, h, d, u, 0, v + d / 2, wall);
    const ridges = Math.max(2, Math.round(d / 7));
    for (let i = 0; i < ridges; i++) shape(f, prism(w, d / ridges, 2.2), u, h, v + (i + 0.5) * (d / ridges), roof);
    const toRoad = u < 0 ? 1 : -1; // shutter on the side facing the estate road
    box(f, 0.1, 4.2, 5, u + toRoad * (w / 2 + 0.05), 0, v + d / 2, C(0x6d7b85), false);
    box(f, 0.12, 0.5, 6, u + toRoad * (w / 2 + 0.1), 4.2, v + d / 2, C(0xf9a825), false);
    board(f, sign, u, h - 2.4, v - 0.05, Math.min(w - 2, 16), 1.6);
  };
  const lorry = (f: Frame, u: number, v: number, c: THREE.Color) => {
    box(f, 2.4, 2.6, 2, u, 0.4, v, c);
    box(f, 2.4, 2.8, 6, u, 0.6, v + 4.2, C(0x3e5c76));
    for (const dv of [0.4, 3.6, 6.2]) for (const s of [-1, 1]) shape(f, new THREE.CylinderGeometry(0.5, 0.5, 0.3, 10).rotateZ(Math.PI / 2), u + s * 1.15, 0.5, v + dv, C(0x1a1a1a));
  };
  const container = (f: Frame, u: number, v: number, y: number, c: THREE.Color) => box(f, 2.5, 2.6, 6.1, u, y, v, c);
  const roadDown = (f: Frame) => {
    box(f, 8, 0.03, f.d - 1, 0, 0.02, f.d / 2, TARMAC, false);
    for (let v = 4; v < f.d - 4; v += 6) box(f, 0.2, 0.035, 2.5, 0, 0.03, v, WHITE, false);
    box(f, f.w - 1, 0.015, f.d - 1, 0, 0, f.d / 2, CONCRETE, false);
  };
  const estateWall = (f: Frame) => {
    const side = (f.w - 10) / 2;
    for (const s of [-1, 1]) box(f, side, 2.2, 0.3, s * (5 + side / 2), 0, 0.15, WALL);
    box(f, 0.3, 2.2, f.d, -f.w / 2 + 0.15, 0, f.d / 2, WALL);
    box(f, 0.3, 2.2, f.d, f.w / 2 - 0.15, 0, f.d / 2, WALL);
    box(f, f.w, 2.2, 0.3, 0, 0, f.d - 0.15, WALL);
  };
  const lamps = (f: Frame) => {
    for (let v = 10; v < f.d - 5; v += 18) {
      for (const s of [-1, 1]) {
        box(f, 0.15, 6, 0.15, s * 4.6, 0, v, C(0x555555), false);
        k.shape(f, new THREE.BoxGeometry(0.9, 0.18, 0.4), s * 4.2, 6, v, C(0xfff2c0), 0, k.bulbs);
      }
    }
  };
  {
    const f = e1;
    roadDown(f);
    estateWall(f);
    lamps(f);
    // Gate arch with the estate's name, security cabin, boom barrier.
    for (const s of [-1, 1]) box(f, 1.2, 6, 1.2, s * 5, 0, 0.8, C(0x1e3a5f));
    box(f, 11.2, 1.2, 1.4, 0, 6, 0.8, C(0x1e3a5f), false);
    board(f, 1, 0, 6.1, 0.05, 10.4, 1.4);
    box(f, 2.4, 2.6, 2.4, 7.5, 0, 3, C(0xe0e0e0));
    box(f, 7, 0.12, 0.12, 1.5, 1, 1.9, C(0xd32f2f), false);
    shed(f, -18, 6, 24, 30, 7, C(0xd7ccc8), 3);
    shed(f, 18, 6, 24, 26, 8, C(0xcfd8dc), 4, C(0x7b5e57));
    shed(f, -18, 42, 24, 28, 6.5, C(0xfff3e0), 5);
    shed(f, 18, 38, 24, 30, 7.5, C(0xe8eaf6), 6);
    shed(f, -18, 76, 24, 26, 7, C(0xe0f2f1), 7);
    // Chimney (red and white bands), water tank on legs, containers and a lorry at the back.
    for (let i = 0; i < 6; i++) shape(f, new THREE.CylinderGeometry(0.9 - i * 0.06, 0.95 - i * 0.06, 4, 12), 26, i * 4, 74, i % 2 ? WHITE : C(0xc62828));
    for (const [du, dv] of [[-1.8, -1.8], [1.8, -1.8], [-1.8, 1.8], [1.8, 1.8]]) box(f, 0.3, 12, 0.3, 14 + du, 0, 90 + dv, C(0x666666));
    shape(f, new THREE.CylinderGeometry(3, 3, 3.5, 14), 14, 12, 90, C(0x90a4ae));
    container(f, 22, 92, 0, C(0x1565c0));
    container(f, 26, 92, 0, C(0xc62828));
    container(f, 24, 92, 2.6, C(0x2e7d32));
    lorry(f, 8, 78, C(0xf57c00));
    lorry(f, 2.6, 36, C(0x1976d2));
  }
  {
    const f = e2;
    roadDown(f);
    estateWall(f);
    lamps(f);
    for (const s of [-1, 1]) box(f, 1, 3, 1, s * 5, 0, 0.6, C(0x1e3a5f));
    shed(f, -18, 5, 24, 40, 9, C(0xf5f5f5), 8, C(0x9e9e9e));
    // The empty warehouse (a hook for Anna Travels & Logistics later).
    shed(f, 18, 5, 24, 30, 9, C(0xeeeeee), 9, C(0xb0bec5));
    // Once you lease it (Chapter 4), your own name board covers the TO LET one.
    const t = signAtlas([['அண்ணா டிராவல்ஸ் & லாஜிஸ்டிக்ஸ்', 'ANNA TRAVELS & LOGISTICS', '#1f9d55', '#ffffff']]);
    ownBoard.material = new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.1, roughness: 0.6 });
    ownBoard.position.copy(f.at(18, 4.9, 7.4));
    ownBoard.rotation.y = f.yaw + Math.PI;
    ownBoard.visible = false;
    scene.add(ownBoard);
    container(f, 14, 40, 0, C(0xf9a825));
    container(f, 18, 40, 0, C(0x6a1b9a));
    lorry(f, 25, 38, C(0x2e7d32));
  }

  // ---------------- Guindy National Park ----------------
  const park = frame(GUINDY.park());
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const pondAt = { u: 18, v: 50 };
  {
    const f = park;
    box(f, f.w - 1, 0.025, f.d - 1, 0, 0, f.d / 2, C(0x4f7f3a), false);
    shape(f, new THREE.CircleGeometry(9, 24).scale(1.4, 1, 1).rotateX(-Math.PI / 2), pondAt.u, 0.05, pondAt.v, C(0x3d7ea6));
    k.solid(f, 22, 1, 15, pondAt.u, 0, pondAt.v);
    // Walking path loop, gate arch + ticket counter, low railing fence all round.
    for (const [u, v, w, d] of [[0, 8, 70, 2.4], [0, 70, 70, 2.4], [-35, 39, 2.4, 62], [35, 39, 2.4, 62], [0, 4, 2.4, 8]] as const) box(f, w, 0.03, d, u, 0.03, v, C(0xc9b38a), false);
    for (const s of [-1, 1]) box(f, 1.4, 5, 1.4, s * 3.5, 0, 0.8, C(0x5d4037));
    box(f, 8.4, 1.2, 1.6, 0, 5, 0.8, C(0x5d4037), false);
    board(f, 2, 0, 5.1, 0.0, 7.6, 1.1);
    box(f, 3, 2.6, 2.4, -7, 0, 2.2, C(0xd7ccc8));
    const side = (f.w - 7) / 2;
    for (const s of [-1, 1]) box(f, side, 1.4, 0.15, s * (3.5 + side / 2), 0, 0.1, C(0x2e3b2e));
    box(f, 0.15, 1.4, f.d, -f.w / 2 + 0.1, 0, f.d / 2, C(0x2e3b2e));
    box(f, 0.15, 1.4, f.d, f.w / 2 - 0.1, 0, f.d / 2, C(0x2e3b2e));
    box(f, f.w, 1.4, 0.15, 0, 0, f.d - 0.1, C(0x2e3b2e));
    // Woods: trees everywhere off the path and away from the pond.
    for (let n = 0; n < 60; n++) {
      const u = (rnd() - 0.5) * (f.w - 8);
      const v = 6 + rnd() * (f.d - 10);
      const onPath = Math.abs(v - 8) < 3 || Math.abs(v - 70) < 3 || Math.abs(Math.abs(u) - 35) < 3 || (Math.abs(u) < 4 && v < 12);
      if (onPath || Math.hypot((u - pondAt.u) / 1.4, v - pondAt.v) < 12) continue;
      tree(f, u, v, 0.8 + rnd() * 0.6);
    }
  }

  // ---------------- Animals (instanced) ----------------
  const horseGeo = (() => {
    const g = new GeoBuilder();
    g.box(0.45, 0.6, 1.6, 0, 1.25, 0, WHITE);
    g.add(new THREE.BoxGeometry(0.26, 0.75, 0.32).rotateX(-0.6), new THREE.Matrix4().setPosition(0, 1.65, 0.85), WHITE);
    g.box(0.22, 0.26, 0.6, 0, 1.95, 1.15, WHITE);
    for (const [x, z] of [[-0.15, 0.6], [0.15, 0.6], [-0.15, -0.6], [0.15, -0.6]]) g.box(0.09, 0.95, 0.09, x, 0.48, z, WHITE);
    g.box(0.07, 0.6, 0.07, 0, 1.2, -0.85, WHITE);
    return g.build();
  })();
  const jockeyGeo = (() => {
    const g = new GeoBuilder();
    g.add(new THREE.BoxGeometry(0.34, 0.42, 0.3).rotateX(0.9), new THREE.Matrix4().setPosition(0, 1.85, 0.15), WHITE);
    g.box(0.2, 0.2, 0.22, 0, 2.08, 0.38, WHITE); // cap
    g.box(0.36, 0.2, 0.3, 0, 1.62, -0.05, C(0xeeeeee)); // breeches
    return g.build();
  })();
  const deerGeo = (() => {
    const g = new GeoBuilder();
    g.box(0.32, 0.38, 0.9, 0, 0.78, 0, WHITE);
    g.add(new THREE.BoxGeometry(0.14, 0.4, 0.16).rotateX(-0.5), new THREE.Matrix4().setPosition(0, 1.05, 0.48), WHITE);
    g.box(0.13, 0.15, 0.3, 0, 1.25, 0.62, WHITE);
    for (const [x, z] of [[-0.1, 0.35], [0.1, 0.35], [-0.1, -0.35], [0.1, -0.35]]) g.box(0.05, 0.62, 0.05, x, 0.31, z, C(0xdddddd));
    for (const s of [-1, 1]) g.add(new THREE.BoxGeometry(0.03, 0.35, 0.03).rotateZ(s * 0.4), new THREE.Matrix4().setPosition(s * 0.08, 1.45, 0.58), C(0x6d4c2f));
    return g.build();
  })();
  const mat = () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 });
  const horseMesh = new THREE.InstancedMesh(horseGeo, mat(), HORSES);
  const jockeyMesh = new THREE.InstancedMesh(jockeyGeo, mat(), HORSES);
  const deerMesh = new THREE.InstancedMesh(deerGeo, mat(), DEER);
  const COATS = [0x6b3e1f, 0x2b1b12, 0x8b5a2b, 0xd8d2c8, 0x4a2c17, 0x9c6b3c, 0x1c1c1c, 0x7a4a26];
  const SILKS = [0xc62828, 0x1565c0, 0xf9a825, 0x2e7d32, 0x6a1b9a, 0xef6c00, 0x00838f, 0xad1457];
  for (let i = 0; i < HORSES; i++) {
    horseMesh.setColorAt(i, C(COATS[i]));
    jockeyMesh.setColorAt(i, C(SILKS[i]));
  }
  for (let i = 0; i < DEER; i++) deerMesh.setColorAt(i, C(i % 4 === 3 ? 0x5a3a22 : 0xa86b3c));
  for (const m of [horseMesh, jockeyMesh, deerMesh]) {
    m.castShadow = true;
    m.frustumCulled = false;
    scene.add(m);
  }

  const horses = Array.from({ length: HORSES }, (_, i) => ({ d: -i * 1.2, r: R_IN + 1 + i * 0.6, phase: i * 1.7 }));
  const deer = Array.from({ length: DEER }, () => ({ u: (rnd() - 0.5) * (park.w - 14), v: 14 + rnd() * (park.d - 24), tu: 0, tv: 0, wait: rnd() * 6, yaw: rnd() * 6 }));
  deer.forEach((d) => Object.assign(d, { tu: d.u, tv: d.v }));
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  const p = { u: 0, v: 0 };
  const ahead = { u: 0, v: 0 };
  const raceMid = race.at(0, CV);
  const parkMid = park.at(0, park.d / 2);
  let time = 0;
  let racing: boolean | null = null;

  return {
    setNight: (() => {
      const kitNight = k.build(scene);
      return (night: number) => {
        kitNight(night);
        (ownBoard.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.1 + night * 0.6;
      };
    })(),
    /** Your lease on the warehouse: shows the Anna Travels & Logistics board. */
    setWarehouse(rented: boolean) {
      ownBoard.visible = rented;
    },
    /** Are the horses out right now (game hour)? */
    racing: (hour: number) => hour >= RACE_HOURS[0] && hour < RACE_HOURS[1],
    update(dt: number, hour: number, player: THREE.Vector3) {
      time += dt;
      const on = hour >= RACE_HOURS[0] && hour < RACE_HOURS[1];
      // Horses: a gallop round the oval, each with its own surges so the order keeps changing.
      if (on && Math.hypot(player.x - raceMid.x, player.z - raceMid.z) < ACTIVE_DIST) {
        horses.forEach((h, i) => {
          h.d += dt * GALLOP * (1 + 0.08 * Math.sin(time * 0.35 + h.phase) + 0.04 * Math.sin(time * 1.3 + h.phase * 2));
          lanePoint(h.d, h.r, p);
          lanePoint(h.d + 0.6, h.r, ahead);
          const a = race.at(p.u, p.v);
          const b = race.at(ahead.u, ahead.v);
          q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(b.x - a.x, b.z - a.z));
          a.y = Math.abs(Math.sin(time * 9 + h.phase)) * 0.18;
          m.compose(a, q, one);
          horseMesh.setMatrixAt(i, m);
          jockeyMesh.setMatrixAt(i, m);
        });
        horseMesh.instanceMatrix.needsUpdate = jockeyMesh.instanceMatrix.needsUpdate = true;
      } else if (racing !== on || on) {
        for (let i = 0; i < HORSES; i++) {
          horseMesh.setMatrixAt(i, hidden);
          jockeyMesh.setMatrixAt(i, hidden);
        }
        horseMesh.instanceMatrix.needsUpdate = jockeyMesh.instanceMatrix.needsUpdate = true;
      }
      racing = on;
      // Deer: graze, then amble to a new spot in the woods.
      if (Math.hypot(player.x - parkMid.x, player.z - parkMid.z) < ACTIVE_DIST) {
        deer.forEach((d, i) => {
          if (d.wait > 0) d.wait -= dt;
          else {
            const du = d.tu - d.u;
            const dv = d.tv - d.v;
            const dist = Math.hypot(du, dv);
            if (dist < 0.2) {
              d.wait = 3 + rnd() * 8;
              d.tu = Math.max(-park.w / 2 + 6, Math.min(park.w / 2 - 6, d.u + (rnd() - 0.5) * 16));
              d.tv = Math.max(12, Math.min(park.d - 6, d.v + (rnd() - 0.5) * 16));
            } else {
              const step = Math.min(dist, dt * 1.2);
              d.u += (du / dist) * step;
              d.v += (dv / dist) * step;
              const a = park.at(d.u, d.v);
              const b = park.at(d.u + du, d.v + dv);
              d.yaw = Math.atan2(b.x - a.x, b.z - a.z);
            }
          }
          const at = park.at(d.u, d.v);
          q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, d.yaw);
          m.compose(at, q, one);
          deerMesh.setMatrixAt(i, m);
        });
        deerMesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}
