import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import { POLICE_LOT, SUPERMARKET_LOTS, blocks } from './layout';
import { SIGN_COUNT, facadeTextures, shopTextures, signTextures } from './textures';

const DEPTH = [9, 15];
const ALLEY_CHANCE = 0.12;
const ALLEY_WIDTH = 1.5;
const BALCONY_CHANCE = 0.45;
const TANK_CHANCE = 0.5;
const STAIR_ROOM_CHANCE = 0.3;
const OLD_HOUSE_CHANCE = 0.14; // tiled-roof house with a pillared verandah (thinnai), no shop
const SHOWROOM_CHANCE = 0.08; // one wide shop with a big signboard

/** Mylapore-ish painted walls. */
const PALETTE = [0xf4b6c2, 0x9fd3e6, 0xd8e89a, 0xf6e7c1, 0xf7b267, 0xc7b8ea, 0xa8e6cf, 0xfafafa, 0xf9e079, 0xe0a899];
const ROOF = new THREE.Color(0xa59d90);
const TILES = new THREE.Color(0xb5532f); // terracotta roof
const TANK = new THREE.Color(0x1d1d1d);
const PILLAR = new THREE.Color(0xf5f0e6);
const RAILINGS = [0xffffff, 0x3a6ea5, 0x2f7d4f, 0x333333].map((c) => new THREE.Color(c));

/** Tiny seeded RNG so the town is identical on every load. */
function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

type Facing = 'n' | 's' | 'e' | 'w';

/** Building outline for the map: centre, frontage w, depth d, yaw (front = local +z). */
export interface Footprint {
  cx: number;
  cz: number;
  w: number;
  d: number;
  yaw: number;
  color: string;
  shop: number | null; // index into SHOP_SIGNS of its first shop board
  /** Every signed shop: board index + the middle of its shopfront (world x/z) and facing. */
  shops: { sign: number; x: number; z: number; yaw: number }[];
  oldHouse: boolean;
}
/** Yaw that turns a building's local +z (its front) to face the road. */
const YAW: Record<Facing, number> = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };

/**
 * Rows of attached shop-houses along every street (temple and tank blocks excepted).
 * Every building gets its own frontage, depth, floor heights, number of shops, sign sizes and
 * roofline; some are old tiled-roof houses. Merged into 4 draw calls; one collider each.
 * Windows, shops and signs glow at night.
 */
export function createBuildings(scene: THREE.Scene, world: RAPIER.World) {
  const rand = seeded(42);
  const range = (a: number, b: number) => a + rand() * (b - a);
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const facade = new GeoBuilder();
  const shops = new GeoBuilder();
  const plain = new GeoBuilder();
  const signs = new GeoBuilder();
  const sign = signTextures();
  let count = 0;
  const footprints: Footprint[] = [];

  /** One building: frontage w, depth d, centre (cx, cz), facing the road. */
  const reserved = [POLICE_LOT(), ...SUPERMARKET_LOTS()];
  function building(w: number, d: number, cx: number, cz: number, facing: Facing, showroom: boolean) {
    // Leave the police station's and supermarkets' lots empty (rotated footprint: swap w/d for east/west facing).
    const hw0 = (facing === 'e' || facing === 'w' ? d : w) / 2;
    const hd0 = (facing === 'e' || facing === 'w' ? w : d) / 2;
    if (reserved.some((lot) => cx + hw0 > lot.x0 && cx - hw0 < lot.x1 && cz + hd0 > lot.z0 && cz - hd0 < lot.z1)) return;
    count++;
    const oldHouse = !showroom && rand() < OLD_HOUSE_CHANCE;
    const r = rand();
    const floors = oldHouse ? (r < 0.6 ? 1 : 2) : r < 0.1 ? 1 : r < 0.42 ? 2 : r < 0.78 ? 3 : 4;
    const groundH = range(3.2, 4.1);
    const floorH = range(3.0, 3.5);
    const h = groundH + (floors - 1) * floorH;
    const wall = new THREE.Color(pick(PALETTE));
    const fp: Footprint = { cx, cz, w, d, yaw: YAW[facing], color: `#${wall.getHexString()}`, shop: null, shops: [], oldHouse };
    footprints.push(fp);
    const m = new THREE.Matrix4().makeRotationY(YAW[facing]).setPosition(cx, 0, cz);
    const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m);
    const N = (x: number, z: number) => new THREE.Vector3(x, 0, z).transformDirection(m);
    const yaw = YAW[facing];
    const box = (bw: number, bh: number, bd: number, x: number, y: number, z: number, color: THREE.Color) => {
      const p = P(x, y, z);
      plain.box(bw, bh, bd, p.x, p.y, p.z, color, yaw);
    };
    const hw = w / 2;
    const hd = d / 2;
    // Shop bays: 1 for a showroom, otherwise 2.5-7 m each. The shop tile holds two shops.
    const bays = showroom ? 1 : Math.max(1, Math.round(w / range(2.5, 7)));
    const shopShift = rand() < 0.5 ? 0 : 0.5;

    // Walls: [from, to] corners in local x/z, outward normal. Front = +z.
    const walls = [
      { a: [-hw, hd], b: [hw, hd], n: [0, 1], len: w, front: true },
      { a: [hw, hd], b: [hw, -hd], n: [1, 0], len: d, front: false },
      { a: [hw, -hd], b: [-hw, -hd], n: [0, -1], len: w, front: false },
      { a: [-hw, -hd], b: [-hw, hd], n: [-1, 0], len: d, front: false },
    ];
    for (const wl of walls) {
      const [ax, az] = wl.a;
      const [bx, bz] = wl.b;
      const out = N(wl.n[0], wl.n[1]);
      const windowsU = Math.max(1, Math.round(wl.len / 3)) / 2; // the facade tile is 2 windows wide
      const g = [P(ax, 0, az), P(bx, 0, bz), P(bx, groundH, bz), P(ax, groundH, az)];
      if (wl.front && !oldHouse) {
        const u1 = bays / 2 + shopShift;
        shops.quad(g[0], g[1], g[2], g[3], [[shopShift, 0], [u1, 0], [u1, 1], [shopShift, 1]], wall, out);
      } else if (wl.front) {
        facade.quad(g[0], g[1], g[2], g[3], [[0, 0], [windowsU, 0], [windowsU, 0.5], [0, 0.5]], wall, out);
      } else {
        plain.quad(g[0], g[1], g[2], g[3], [[0, 0], [0, 0], [0, 0], [0, 0]], wall, out);
      }
      if (floors > 1) {
        const u = [P(ax, groundH, az), P(bx, groundH, bz), P(bx, h, bz), P(ax, h, az)];
        const v1 = (floors - 1) / 2; // the facade tile is 2 floors high
        facade.quad(u[0], u[1], u[2], u[3], [[0, 0], [windowsU, 0], [windowsU, v1], [0, v1]], wall, out);
      }
    }

    if (oldHouse) {
      // Terracotta gable roof (ridge along the frontage) and a pillared verandah.
      const rh = Math.min(2.2, d * 0.25);
      const ov = 0.5;
      const ridgeL = P(-hw - 0.2, h + rh, 0);
      const ridgeR = P(hw + 0.2, h + rh, 0);
      for (const sz of [1, -1]) {
        const eL = P(-hw - 0.2, h - 0.25, sz * (hd + ov));
        const eR = P(hw + 0.2, h - 0.25, sz * (hd + ov));
        plain.quad(eL, eR, ridgeR, ridgeL, [[0, 0], [0, 0], [0, 0], [0, 0]], TILES, N(0, sz).add(new THREE.Vector3(0, 1, 0)));
      }
      for (const sx of [1, -1]) {
        const gable = [P(sx * hw, h, hd), P(sx * hw, h, -hd), P(sx * hw, h + rh, 0)];
        plain.quad(gable[0], gable[1], gable[2], gable[2], [[0, 0], [0, 0], [0, 0], [0, 0]], wall, N(sx, 0));
      }
      // Shallow so the sidewalk stays walkable.
      const vh = Math.min(groundH, 3);
      box(w, 0.12, 0.9, 0, vh, hd + 0.45, TILES); // verandah roof
      box(w, 0.3, 0.7, 0, 0.15, hd + 0.35, new THREE.Color(0xb44a2e)); // red oxide floor (thinnai)
      const n = Math.max(2, Math.round(w / 2.2));
      for (let i = 0; i <= n; i++) box(0.18, vh, 0.18, -hw + 0.15 + (i * (w - 0.3)) / n, vh / 2, hd + 0.6, PILLAR);
    } else {
      // Flat roof: slab, parapet, maybe a stair room and a black water tank.
      const roof = [P(-hw, h, -hd), P(hw, h, -hd), P(hw, h, hd), P(-hw, h, hd)];
      plain.quad(roof[0], roof[1], roof[2], roof[3], [[0, 0], [0, 0], [0, 0], [0, 0]], ROOF, new THREE.Vector3(0, 1, 0));
      const pw = 0.15;
      const ph = range(0.6, 1.1);
      box(w, ph, pw, 0, h + ph / 2, hd - pw / 2, wall);
      box(w, ph, pw, 0, h + ph / 2, -hd + pw / 2, wall);
      box(pw, ph, d - 2 * pw, hw - pw / 2, h + ph / 2, 0, wall);
      box(pw, ph, d - 2 * pw, -hw + pw / 2, h + ph / 2, 0, wall);
      if (floors > 1 && rand() < STAIR_ROOM_CHANCE) box(2.6, 2.5, 3, range(-hw + 1.5, hw - 1.5), h + 1.25, -hd + 2, wall);
      if (rand() < TANK_CHANCE) {
        const p = P(range(-hw + 1, hw - 1), h + 0.55, range(-hd + 1, hd - 1));
        plain.add(TANK_GEO, new THREE.Matrix4().setPosition(p), TANK);
      }

      // Sunshade over the shops, one signboard per shop sized to its width.
      box(w, 0.1, 0.8, 0, groundH - 0.05, hd + 0.4, wall);
      const bayW = w / bays;
      for (let bay = 0; bay < bays; bay++) {
        if (!showroom && rand() < 0.1) continue; // the odd shop without a board
        const x = -hw + bayW * (bay + 0.5);
        const sw = bayW - 0.3;
        const sh = THREE.MathUtils.clamp(sw / 7, 0.45, showroom ? 1.6 : 1.0);
        const signIndex = Math.floor(rand() * SIGN_COUNT);
        if (fp.shop === null) fp.shop = signIndex;
        const front = P(x, 0, hd);
        fp.shops.push({ sign: signIndex, x: front.x, z: front.z, yaw: fp.yaw });
        const [v0, v1] = sign.rowV(signIndex);
        const z = hd + 0.78;
        const s = [P(x - sw / 2, groundH, z), P(x + sw / 2, groundH, z), P(x + sw / 2, groundH + sh, z), P(x - sw / 2, groundH + sh, z)];
        signs.quad(s[0], s[1], s[2], s[3], [[0, v0], [1, v0], [1, v1], [0, v1]], wall, N(0, 1));
      }
    }

    // Balconies on upper floors, in front of a window bay.
    const windowBays = Math.max(1, Math.round(w / 3));
    for (let f = 1; f < floors; f++) {
      if (rand() > BALCONY_CHANCE) continue;
      const bayW = w / windowBays;
      const x = -hw + bayW * (Math.floor(rand() * windowBays) + 0.5);
      const y = groundH + (f - 1) * floorH;
      const bw = Math.min(2.4, bayW - 0.2);
      const rail = pick(RAILINGS);
      box(bw, 0.12, 0.9, x, y, hd + 0.45, wall);
      box(bw, 0.9, 0.05, x, y + 0.5, hd + 0.88, rail);
      box(0.05, 0.9, 0.9, x - bw / 2 + 0.02, y + 0.5, hd + 0.45, rail);
      box(0.05, 0.9, 0.9, x + bw / 2 - 0.02, y + 0.5, hd + 0.45, rail);
    }

    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hw, h / 2, hd)
        .setTranslation(cx, h / 2, cz)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
    );
  }

  /** Fill a street frontage from `a` to `b` with buildings of varied width (and the odd alley). */
  function row(a: number, b: number, place: (start: number, width: number, depth: number, showroom: boolean) => void) {
    let x = a;
    while (b - x >= 4) {
      const showroom = rand() < SHOWROOM_CHANCE;
      let w = Math.round((showroom ? range(13, 18) : range(4, 13)) * 2) / 2;
      w = Math.min(w, b - x);
      if (b - x - w < 4) w = b - x; // last one takes the remainder
      place(x, w, range(DEPTH[0], DEPTH[1]), showroom);
      x += w;
      if (rand() < ALLEY_CHANCE) x += ALLEY_WIDTH;
    }
  }

  for (const blk of blocks()) {
    if (blk.kind !== 'shops') continue;
    const { x0, x1, z0, z1, road } = blk;
    const dMax = DEPTH[1];
    if (road.n) row(x0, x1, (s, w, d, sr) => building(w, d, s + w / 2, z0 + d / 2, 'n', sr));
    if (road.s) row(x0, x1, (s, w, d, sr) => building(w, d, s + w / 2, z1 - d / 2, 's', sr));
    // Side rows fit between the north/south rows.
    const za = road.n ? z0 + dMax : z0;
    const zb = road.s ? z1 - dMax : z1;
    if (road.w) row(za, zb, (s, w, d, sr) => building(w, d, x0 + d / 2, s + w / 2, 'w', sr));
    if (road.e) row(za, zb, (s, w, d, sr) => building(w, d, x1 - d / 2, s + w / 2, 'e', sr));
  }

  const fTex = facadeTextures();
  const sTex = shopTextures();
  const lit = (map: THREE.Texture, emissiveMap: THREE.Texture) =>
    new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 0.9 });
  const facadeMat = lit(fTex.map, fTex.emissive);
  const shopMat = lit(sTex.map, sTex.emissive);
  const signMat = new THREE.MeshStandardMaterial({ map: sign.map, emissiveMap: sign.map, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6 });
  const plainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  for (const [geo, mat] of [[facade, facadeMat], [shops, shopMat], [plain, plainMat], [signs, signMat]] as const) {
    const mesh = new THREE.Mesh(geo.build(), mat);
    mesh.castShadow = mat !== signMat;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  return {
    count,
    footprints,
    /** 0 = day, 1 = night: lights up windows, shops and signs. */
    setNight(f: number) {
      facadeMat.emissiveIntensity = f * 0.9;
      shopMat.emissiveIntensity = f * 1.1;
      signMat.emissiveIntensity = f * 0.45;
    },
  };
}

const TANK_GEO = new THREE.CylinderGeometry(0.55, 0.55, 1.1, 10);
