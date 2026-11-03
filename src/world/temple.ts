import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import { TANK_BLOCK, TEMPLE_BLOCK } from './layout';
import { GOPURAM_TILE, gopuramTexture, pavingTexture, templeStripeTexture } from './textures';

const UP = new THREE.Vector3(0, 1, 0);
const WHITE = new THREE.Color(0xffffff);
const GRANITE = new THREE.Color(0xb9ae9c);
const CARVED = new THREE.Color(0xc9bda6); // granite tint for the carved gopuram base
const CORNICE = new THREE.Color(0xe8dcc0);
const TIER_TINTS = [0xffffff, 0xfff0d6, 0xe3f2ff, 0xffe3ec, 0xf0ffe6].map((c) => new THREE.Color(c));
const STRIPE_PAIR = 1.2; // metres per red+white stripe pair

/** Inset of the tank from its block edge (the promenade around it). */
const TANK_INSET = 2;
const TANK_STEPS = 6;
const STEP_RISE = 0.35;
const STEP_RUN = 0.7;

/** Rectangle of the tank pit, so the ground can leave a hole for it. */
export function tankRect() {
  const b = TANK_BLOCK();
  return { x0: b.x0 + TANK_INSET, x1: b.x1 - TANK_INSET, z0: b.z0 + TANK_INSET, z1: b.z1 - TANK_INSET };
}

interface Parts {
  stone: GeoBuilder; // vertex-coloured, untextured
  stripes: GeoBuilder; // red/white kavi stripes, UV in stripe pairs
  gopuram: GeoBuilder; // painted sculpture tiers
  gold: GeoBuilder;
  paving: GeoBuilder;
  colliders: RAPIER.ColliderDesc[];
}

/**
 * Stylised Kapaleeshwarar temple (centre block) and its tank (block to the west).
 * Six merged draw calls for the lot; the gopurams glow softly at night.
 */
export function createTemple(scene: THREE.Scene, world: RAPIER.World) {
  const p: Parts = {
    stone: new GeoBuilder(),
    stripes: new GeoBuilder(),
    gopuram: new GeoBuilder(),
    gold: new GeoBuilder(),
    paving: new GeoBuilder(),
    colliders: [],
  };
  buildTemple(p);
  buildTank(p);

  const gopuramMat = new THREE.MeshStandardMaterial({ map: gopuramTexture(), vertexColors: true, roughness: 0.85, emissive: 0xffd9a0, emissiveIntensity: 0 });
  const meshes: [GeoBuilder, THREE.Material][] = [
    [p.stone, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })],
    [p.stripes, new THREE.MeshStandardMaterial({ map: templeStripeTexture(), roughness: 0.85 })],
    [p.gopuram, gopuramMat],
    [p.gold, new THREE.MeshStandardMaterial({ color: 0xe0ac3a, metalness: 0.85, roughness: 0.3 })],
    [p.paving, new THREE.MeshStandardMaterial({ map: pavingTexture(), roughness: 0.9 })],
  ];
  for (const [geo, mat] of meshes) {
    const mesh = new THREE.Mesh(geo.build(), mat);
    mesh.castShadow = geo !== p.paving;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }
  const water = new THREE.Mesh(
    waterGeometry(),
    new THREE.MeshStandardMaterial({ color: 0x2c5d60, roughness: 0.08, metalness: 0.35, transparent: true, opacity: 0.93 }),
  );
  water.receiveShadow = true;
  scene.add(water);
  for (const c of p.colliders) world.createCollider(c);
  // Keep people out of the tank water: invisible walls where the steps meet the water.
  const t = tankRect();
  const edge = (TANK_STEPS - 1.5) * STEP_RUN; // inset of the waterline from the pit's rim
  const wx0 = t.x0 + edge, wx1 = t.x1 - edge, wz0 = t.z0 + edge, wz1 = t.z1 - edge;
  const top = 1.5; // wall up to here (well above the rim)
  const bottom = -(TANK_STEPS - 1.5) * STEP_RISE;
  const h = (top - bottom) / 2;
  const y = bottom + h;
  for (const [cx, cz, hx, hz] of [
    [(wx0 + wx1) / 2, wz0, (wx1 - wx0) / 2, 0.1],
    [(wx0 + wx1) / 2, wz1, (wx1 - wx0) / 2, 0.1],
    [wx0, (wz0 + wz1) / 2, 0.1, (wz1 - wz0) / 2],
    [wx1, (wz0 + wz1) / 2, 0.1, (wz1 - wz0) / 2],
  ]) {
    world.createCollider(RAPIER.ColliderDesc.cuboid(hx, h, hz).setTranslation(cx, y, cz));
  }

  return {
    setNight(f: number) {
      gopuramMat.emissiveIntensity = f * 0.35; // floodlit gopurams
    },
  };
}

// ---------------------------------------------------------------------------------------------

/** Axis-aligned box helper that also registers a collider. */
function solid(p: Parts, b: GeoBuilder, w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.Color, collide = true) {
  b.box(w, h, d, x, y, z, color);
  if (collide) p.colliders.push(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y, z));
}

/** Wall segment from (ax, az) to (bx, bz) with kavi stripes on both faces. */
function stripedWall(p: Parts, ax: number, az: number, bx: number, bz: number, h: number, t: number) {
  const len = Math.hypot(bx - ax, bz - az);
  if (len < 0.1) return;
  const g = new THREE.BoxGeometry(len, h, t);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * (len / STRIPE_PAIR));
  const yaw = -Math.atan2(bz - az, bx - ax);
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition((ax + bx) / 2, h / 2, (az + bz) / 2);
  p.stripes.add(g, m, WHITE);
  const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  p.colliders.push(
    RAPIER.ColliderDesc.cuboid(len / 2, h / 2, t / 2).setTranslation((ax + bx) / 2, h / 2, (az + bz) / 2).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
  );
}

/**
 * Gopuram (gateway tower): granite base with a walk-through passage, `tiers` painted
 * storeys that step in as they rise, a barrel-vault crown and golden kalasams.
 * Built facing +z, then turned by `yaw` and placed at (cx, cz).
 */
function gopuram(p: Parts, cx: number, cz: number, yaw: number, width: number, depth: number, tiers: number) {
  const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(cx, 0, cz);
  const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m);
  const box = (b: GeoBuilder, w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.Color, collide = false) => {
    const c = P(x, y, z);
    b.box(w, h, d, c.x, c.y, c.z, color, yaw);
    if (collide) {
      const q = new THREE.Quaternion().setFromAxisAngle(UP, yaw);
      p.colliders.push(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(c.x, c.y, c.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
    }
  };

  // Base: two granite blocks either side of a 3.2 m passage, a lintel, a cornice.
  const baseH = 6.5;
  const passage = 3.2;
  const side = (width - passage) / 2;
  box(p.gopuram, side, baseH, depth, -(passage + side) / 2, baseH / 2, 0, CARVED, true);
  box(p.gopuram, side, baseH, depth, (passage + side) / 2, baseH / 2, 0, CARVED, true);
  box(p.stone, passage, 1.5, depth, 0, baseH - 0.75, 0, GRANITE);
  // Granite posts across both ends of the passage: people walk between them, vehicles can't (0.96 m gap; the auto is 1.28 m).
  for (const z of [-depth / 2 - 0.2, depth / 2 + 0.2]) for (const x of [-0.6, 0.6]) box(p.stone, 0.24, 0.9, 0.24, x, 0.45, z, GRANITE, true);
  box(p.stone, width + 0.6, 0.4, depth + 0.6, 0, baseH + 0.2, 0, CORNICE);

  // Painted tiers.
  let y = baseH + 0.4;
  let w = width;
  let d = depth;
  for (let k = 0; k < tiers; k++) {
    w = width * (1 - (0.55 * k) / tiers);
    d = depth * (1 - (0.45 * k) / tiers);
    const h = GOPURAM_TILE.h;
    const tint = TIER_TINTS[k % TIER_TINTS.length];
    const corners = [[-w / 2, d / 2], [w / 2, d / 2], [w / 2, -d / 2], [-w / 2, -d / 2]];
    for (let s = 0; s < 4; s++) {
      const [ax, az] = corners[s];
      const [bx, bz] = corners[(s + 1) % 4];
      const len = Math.hypot(bx - ax, bz - az);
      const u = len / GOPURAM_TILE.w;
      const out = new THREE.Vector3((ax + bx) / 2, 0, (az + bz) / 2).normalize().transformDirection(m);
      p.gopuram.quad(P(ax, y, az), P(bx, y, bz), P(bx, y + h, bz), P(ax, y + h, az), [[0, 0], [u, 0], [u, 1], [0, 1]], tint, out);
    }
    box(p.stone, w + 0.4, 0.22, d + 0.4, 0, y + h + 0.11, 0, CORNICE);
    y += h + 0.22;
  }

  // Barrel-vault crown along the top tier's width, with kalasams on the ridge.
  const r = d / 2;
  // Half cylinder (theta 0..PI) lying along x after the rotation, curved side up.
  const vault = new THREE.CylinderGeometry(r, r, w, 16, 1, false, 0, Math.PI).rotateZ(Math.PI / 2);
  const vm = new THREE.Matrix4().makeRotationY(yaw).setPosition(P(0, y, 0));
  p.stone.add(vault, vm, new THREE.Color(0xd9893a));
  const kalasam = new THREE.ConeGeometry(0.28, 1.1, 8).translate(0, 0.55, 0);
  const n = Math.max(3, Math.round(w / 1.2));
  for (let i = 0; i < n; i++) {
    const kx = -w / 2 + ((i + 0.5) * w) / n;
    p.gold.add(kalasam, new THREE.Matrix4().setPosition(P(kx, y + r - 0.05, 0)), WHITE);
  }
  return y + r + 1.1;
}

function buildTemple(p: Parts) {
  const b = TEMPLE_BLOCK();
  const wallT = 0.7;
  const wallH = 4.5;
  const inset = wallT / 2;
  const x0 = b.x0 + inset;
  const x1 = b.x1 - inset;
  const z0 = b.z0 + inset;
  const z1 = b.z1 - inset;

  // Stone-paved courtyard.
  const c = [new THREE.Vector3(b.x0, 0.02, b.z0), new THREE.Vector3(b.x1, 0.02, b.z0), new THREE.Vector3(b.x1, 0.02, b.z1), new THREE.Vector3(b.x0, 0.02, b.z1)];
  p.paving.quad(c[0], c[1], c[2], c[3], c.map((v) => [v.x, v.z]), WHITE, UP);

  // Main gopuram on the east wall (facing East Mada Street), a smaller one on the west (facing the tank).
  const eastW = 14;
  const westW = 9;
  const eastD = 9;
  const westD = 6;
  gopuram(p, x1 - eastD / 2 + wallT, 0, Math.PI / 2, eastW, eastD, 7);
  gopuram(p, x0 + westD / 2 - wallT, 0, -Math.PI / 2, westW, westD, 4);

  // Compound wall with gaps where the gopurams stand.
  stripedWall(p, x0, z0, x1, z0, wallH, wallT); // north
  stripedWall(p, x0, z1, x1, z1, wallH, wallT); // south
  stripedWall(p, x1, z0, x1, -eastW / 2, wallH, wallT); // east, either side of the gopuram
  stripedWall(p, x1, eastW / 2, x1, z1, wallH, wallT);
  stripedWall(p, x0, z0, x0, -westW / 2, wallH, wallT); // west
  stripedWall(p, x0, westW / 2, x0, z1, wallH, wallT);

  // Main shrine with its vimana tower.
  const sx = -3;
  solid(p, p.stone, 8, 5, 8, sx, 2.5, 0, GRANITE);
  let y = 5;
  for (const [s, h] of [[7.2, 1.6], [5.6, 1.6], [4.2, 1.5]] as const) {
    p.gopuram.box(s, h, s, sx, y + h / 2, 0, TIER_TINTS[1]);
    p.stone.box(s + 0.3, 0.2, s + 0.3, sx, y + h + 0.1, 0, CORNICE);
    y += h + 0.2;
  }
  p.stone.add(new THREE.SphereGeometry(1.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().setPosition(sx, y, 0), new THREE.Color(0xd9893a));
  p.gold.add(new THREE.ConeGeometry(0.35, 1.3, 8), new THREE.Matrix4().setPosition(sx, y + 2.2, 0), WHITE);

  // Pillared mandapam in front of the shrine.
  const mx = 5;
  p.stone.box(9, 0.3, 8, mx, 0.15, 0, GRANITE);
  p.stone.box(10, 0.4, 9, mx, 4.1, 0, CORNICE);
  const pillar = new THREE.CylinderGeometry(0.25, 0.28, 3.6, 8);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const px = mx - 3.6 + i * 2.4;
      const pz = -3 + j * 2;
      p.stone.add(pillar, new THREE.Matrix4().setPosition(px, 2.1, pz), GRANITE);
      p.colliders.push(RAPIER.ColliderDesc.cylinder(1.8, 0.28).setTranslation(px, 2.1, pz));
    }
  }

  // Golden flag post (dhwajasthambam) between the mandapam and the gopuram.
  const fx = 11.5;
  p.stone.box(1.6, 0.6, 1.6, fx, 0.3, 0, GRANITE);
  p.gold.add(new THREE.CylinderGeometry(0.16, 0.22, 11, 10), new THREE.Matrix4().setPosition(fx, 6.1, 0), WHITE);
  for (const h of [3, 6, 9]) p.gold.add(new THREE.CylinderGeometry(0.3, 0.3, 0.15, 10), new THREE.Matrix4().setPosition(fx, h, 0), WHITE);
  p.colliders.push(RAPIER.ColliderDesc.cylinder(5.5, 0.25).setTranslation(fx, 5.5, 0));
}

function buildTank(p: Parts) {
  const b = TANK_BLOCK();
  const t = tankRect();

  // Paved promenade round the tank.
  const ring = (ox0: number, ox1: number, oz0: number, oz1: number) => {
    const c = [new THREE.Vector3(ox0, 0.02, oz0), new THREE.Vector3(ox1, 0.02, oz0), new THREE.Vector3(ox1, 0.02, oz1), new THREE.Vector3(ox0, 0.02, oz1)];
    p.paving.quad(c[0], c[1], c[2], c[3], c.map((v) => [v.x, v.z]), WHITE, UP);
  };
  ring(b.x0, b.x1, b.z0, t.z0);
  ring(b.x0, b.x1, t.z1, b.z1);
  ring(b.x0, t.x0, t.z0, t.z1);
  ring(t.x1, b.x1, t.z0, t.z1);

  // Stepped sides: striped risers, granite treads, all the way down.
  for (let k = 0; k < TANK_STEPS; k++) {
    const i0 = k * STEP_RUN;
    const i1 = (k + 1) * STEP_RUN;
    const yTop = -k * STEP_RISE;
    const yBot = -(k + 1) * STEP_RISE;
    const r0 = { x0: t.x0 + i0, x1: t.x1 - i0, z0: t.z0 + i0, z1: t.z1 - i0 };
    const r1 = { x0: t.x0 + i1, x1: t.x1 - i1, z0: t.z0 + i1, z1: t.z1 - i1 };
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    // risers (facing into the tank)
    const risers: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
      [V(r0.x0, 0, r0.z0), V(r0.x1, 0, r0.z0), V(0, 0, 1)],
      [V(r0.x1, 0, r0.z1), V(r0.x0, 0, r0.z1), V(0, 0, -1)],
      [V(r0.x0, 0, r0.z1), V(r0.x0, 0, r0.z0), V(1, 0, 0)],
      [V(r0.x1, 0, r0.z0), V(r0.x1, 0, r0.z1), V(-1, 0, 0)],
    ];
    for (const [a, c, facing] of risers) {
      const u = a.distanceTo(c) / STRIPE_PAIR;
      p.stripes.quad(V(a.x, yBot, a.z), V(c.x, yBot, c.z), V(c.x, yTop, c.z), V(a.x, yTop, a.z), [[0, 0], [u, 0], [u, 1], [0, 1]], WHITE, facing);
    }
    // tread: ring between r0 and r1 at yBot, as 4 strips
    const tread = (ax0: number, ax1: number, az0: number, az1: number) => {
      p.stone.quad(V(ax0, yBot, az0), V(ax1, yBot, az0), V(ax1, yBot, az1), V(ax0, yBot, az1), [[0, 0], [0, 0], [0, 0], [0, 0]], GRANITE, UP);
    };
    tread(r0.x0, r0.x1, r0.z0, r1.z0);
    tread(r0.x0, r0.x1, r1.z1, r0.z1);
    tread(r0.x0, r1.x0, r1.z0, r1.z1);
    tread(r1.x1, r0.x1, r1.z0, r1.z1);
  }
  // Floor under the water.
  const depth = -TANK_STEPS * STEP_RISE;
  const inner = TANK_STEPS * STEP_RUN;
  const f = [new THREE.Vector3(t.x0 + inner, depth, t.z0 + inner), new THREE.Vector3(t.x1 - inner, depth, t.z0 + inner), new THREE.Vector3(t.x1 - inner, depth, t.z1 - inner), new THREE.Vector3(t.x0 + inner, depth, t.z1 - inner)];
  p.stone.quad(f[0], f[1], f[2], f[3], [[0, 0], [0, 0], [0, 0], [0, 0]], new THREE.Color(0x4a4a40), UP);

  // Sixteen-pillared mandapam in the middle of the tank.
  const cx = (t.x0 + t.x1) / 2;
  const cz = (t.z0 + t.z1) / 2;
  const base = depth;
  p.stone.box(5.5, 1.8, 5.5, cx, base + 0.9, cz, GRANITE);
  const top = base + 1.8;
  const pillar = new THREE.CylinderGeometry(0.15, 0.17, 2.6, 8);
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) p.stone.add(pillar, new THREE.Matrix4().setPosition(cx - 2.1 + i * 1.4, top + 1.3, cz - 2.1 + j * 1.4), GRANITE);
  }
  p.stone.box(6, 0.35, 6, cx, top + 2.78, cz, CORNICE);
  p.gopuram.box(3, 1.2, 3, cx, top + 3.55, cz, TIER_TINTS[2]);
  p.gold.add(new THREE.ConeGeometry(0.25, 0.9, 8), new THREE.Matrix4().setPosition(cx, top + 4.6, cz), WHITE);

  // Low striped parapet round the tank keeps people (and autos) out.
  const h = 0.9;
  const w = 0.3;
  stripedWall(p, t.x0, t.z0, t.x1, t.z0, h, w);
  stripedWall(p, t.x0, t.z1, t.x1, t.z1, h, w);
  stripedWall(p, t.x0, t.z0, t.x0, t.z1, h, w);
  stripedWall(p, t.x1, t.z0, t.x1, t.z1, h, w);
}

function waterGeometry() {
  const t = tankRect();
  const level = -(TANK_STEPS - 1.5) * STEP_RISE;
  return new THREE.PlaneGeometry(t.x1 - t.x0, t.z1 - t.z0).rotateX(-Math.PI / 2).translate((t.x0 + t.x1) / 2, level, (t.z0 + t.z1) / 2);
}
