import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import { blocks } from './layout';
import { FACADE_TILE, SHOP_TILE, SIGN_COUNT, facadeTextures, shopTextures, signTextures } from './textures';

const FLOOR_H = 3.2;
const WIDTHS = [6, 6, 9, 9, 12]; // frontage options (multiples of the 3 m window bay)
const DEPTH = [10, 14];
const ALLEY_CHANCE = 0.12;
const ALLEY_WIDTH = 1.5;
const BALCONY_CHANCE = 0.45;
const TANK_CHANCE = 0.55;

/** Mylapore-ish painted walls. */
const PALETTE = [0xf4b6c2, 0x9fd3e6, 0xd8e89a, 0xf6e7c1, 0xf7b267, 0xc7b8ea, 0xa8e6cf, 0xfafafa, 0xf9e079, 0xe0a899];
const ROOF = new THREE.Color(0xa59d90);
const TANK = new THREE.Color(0x1d1d1d);
const RAILINGS = [0xffffff, 0x3a6ea5, 0x2f7d4f, 0x333333].map((c) => new THREE.Color(c));

/** Tiny seeded RNG so the town is identical on every load. */
function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

type Facing = 'n' | 's' | 'e' | 'w';
/** Yaw that turns a building's local +z (its front) to face the road. */
const YAW: Record<Facing, number> = { s: 0, e: Math.PI / 2, n: Math.PI, w: -Math.PI / 2 };

/**
 * Rows of attached 1-4 storey shop-houses along every road: shops + signboards on the ground
 * floor, windows with sunshades above, balconies, roof parapets and black water tanks.
 * Merged into 4 draw calls; one cuboid collider per building. Windows/shops glow at night.
 */
export function createBuildings(scene: THREE.Scene, world: RAPIER.World) {
  const rand = seeded(42);
  const pick = <T>(arr: readonly T[]) => arr[Math.floor(rand() * arr.length)];
  const facade = new GeoBuilder();
  const shops = new GeoBuilder();
  const plain = new GeoBuilder();
  const signs = new GeoBuilder();
  const sign = signTextures();
  let count = 0;

  /** One building: frontage w, depth d, centre (cx, cz), facing the road. */
  function building(w: number, d: number, cx: number, cz: number, facing: Facing) {
    count++;
    const r = rand();
    const floors = r < 0.12 ? 1 : r < 0.45 ? 2 : r < 0.8 ? 3 : 4;
    const h = floors * FLOOR_H;
    const wall = new THREE.Color(pick(PALETTE));
    const m = new THREE.Matrix4().makeRotationY(YAW[facing]).setPosition(cx, 0, cz);
    const P = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z).applyMatrix4(m);
    const N = (x: number, z: number) => new THREE.Vector3(x, 0, z).transformDirection(m);
    const hw = w / 2;
    const hd = d / 2;

    // Walls: [from, to] corners in local x/z, outward normal. Front = +z.
    const walls = [
      { a: [-hw, hd], b: [hw, hd], n: [0, 1], len: w, front: true },
      { a: [hw, hd], b: [hw, -hd], n: [1, 0], len: d, front: false },
      { a: [hw, -hd], b: [-hw, -hd], n: [0, -1], len: w, front: false },
      { a: [-hw, -hd], b: [-hw, hd], n: [-1, 0], len: d, front: false },
    ];
    const shopShift = rand() < 0.5 ? 0 : 0.5; // start with an open or a shuttered shop
    for (const wl of walls) {
      const [ax, az] = wl.a;
      const [bx, bz] = wl.b;
      const facing3 = N(wl.n[0], wl.n[1]);
      // Ground floor: shops on the street side, plain wall elsewhere.
      const g = [P(ax, 0, az), P(bx, 0, bz), P(bx, FLOOR_H, bz), P(ax, FLOOR_H, az)];
      if (wl.front) {
        const u1 = wl.len / SHOP_TILE.w + shopShift;
        shops.quad(g[0], g[1], g[2], g[3], [[shopShift, 0], [u1, 0], [u1, 1], [shopShift, 1]], wall, facing3);
      } else {
        plain.quad(g[0], g[1], g[2], g[3], [[0, 0], [0, 0], [0, 0], [0, 0]], wall, facing3);
      }
      // Upper floors: windows (the tile is 2 bays x 2 floors).
      if (floors > 1) {
        const u = [P(ax, FLOOR_H, az), P(bx, FLOOR_H, bz), P(bx, h, bz), P(ax, h, az)];
        const u1 = wl.len / FACADE_TILE.w;
        const v1 = (h - FLOOR_H) / FACADE_TILE.h;
        facade.quad(u[0], u[1], u[2], u[3], [[0, 0], [u1, 0], [u1, v1], [0, v1]], wall, facing3);
      }
    }

    // Roof slab + parapet.
    const roof = [P(-hw, h, -hd), P(hw, h, -hd), P(hw, h, hd), P(-hw, h, hd)];
    plain.quad(roof[0], roof[1], roof[2], roof[3], [[0, 0], [0, 0], [0, 0], [0, 0]], ROOF, new THREE.Vector3(0, 1, 0));
    const pw = 0.15;
    const ph = 0.8;
    const yaw = YAW[facing];
    const box = (bw: number, bh: number, bd: number, x: number, y: number, z: number, color: THREE.Color) => {
      const p = P(x, y, z);
      plain.box(bw, bh, bd, p.x, p.y, p.z, color, yaw);
    };
    box(w, ph, pw, 0, h + ph / 2, hd - pw / 2, wall);
    box(w, ph, pw, 0, h + ph / 2, -hd + pw / 2, wall);
    box(pw, ph, d - 2 * pw, hw - pw / 2, h + ph / 2, 0, wall);
    box(pw, ph, d - 2 * pw, -hw + pw / 2, h + ph / 2, 0, wall);

    // Sunshade over the shops, with one signboard per 3 m bay standing on its front edge.
    box(w, 0.1, 0.8, 0, FLOOR_H - 0.05, hd + 0.4, wall);
    for (let bay = 0; bay < Math.floor(w / 3); bay++) {
      const x = -hw + 1.5 + bay * 3;
      const [v0, v1] = sign.rowV(Math.floor(rand() * SIGN_COUNT));
      const z = hd + 0.78;
      const s = [P(x - 1.35, FLOOR_H, z), P(x + 1.35, FLOOR_H, z), P(x + 1.35, FLOOR_H + 0.45, z), P(x - 1.35, FLOOR_H + 0.45, z)];
      signs.quad(s[0], s[1], s[2], s[3], [[0, v0], [1, v0], [1, v1], [0, v1]], wall, N(0, 1));
    }

    // Balconies on upper floors, in front of a window bay.
    for (let f = 1; f < floors; f++) {
      if (rand() > BALCONY_CHANCE) continue;
      const x = -hw + 1.5 + 3 * Math.floor(rand() * Math.floor(w / 3));
      const y = f * FLOOR_H;
      const rail = pick(RAILINGS);
      box(2.4, 0.12, 0.9, x, y, hd + 0.45, wall);
      box(2.4, 0.9, 0.05, x, y + 0.5, hd + 0.88, rail);
      box(0.05, 0.9, 0.9, x - 1.18, y + 0.5, hd + 0.45, rail);
      box(0.05, 0.9, 0.9, x + 1.18, y + 0.5, hd + 0.45, rail);
    }

    // Black plastic water tank on the roof.
    if (rand() < TANK_CHANCE) {
      const p = P((rand() - 0.5) * (w - 2), h + 0.55, (rand() - 0.5) * (d - 2));
      plain.add(TANK_GEO, new THREE.Matrix4().setPosition(p), TANK);
    }

    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hw, h / 2, hd)
        .setTranslation(cx, h / 2, cz)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
    );
  }

  /** Fill a street frontage from `a` to `b` with buildings side by side (and the odd alley). */
  function row(a: number, b: number, place: (start: number, width: number, depth: number) => void) {
    let x = a;
    while (b - x >= 6) {
      let w = Math.min(pick(WIDTHS), b - x);
      if (b - x - w < 6) w = b - x; // last one takes the remainder
      place(x, w, DEPTH[0] + rand() * (DEPTH[1] - DEPTH[0]));
      x += w;
      if (rand() < ALLEY_CHANCE) x += ALLEY_WIDTH;
    }
  }

  for (const blk of blocks()) {
    const { x0, x1, z0, z1, road } = blk;
    const dN = DEPTH[1];
    const dS = DEPTH[1];
    if (road.n) row(x0, x1, (s, w, d) => building(w, d, s + w / 2, z0 + d / 2, 'n'));
    if (road.s) row(x0, x1, (s, w, d) => building(w, d, s + w / 2, z1 - d / 2, 's'));
    // Side rows fit between the north/south rows.
    const za = road.n ? z0 + dN : z0;
    const zb = road.s ? z1 - dS : z1;
    if (road.w) row(za, zb, (s, w, d) => building(w, d, x0 + d / 2, s + w / 2, 'w'));
    if (road.e) row(za, zb, (s, w, d) => building(w, d, x1 - d / 2, s + w / 2, 'e'));
  }

  const fTex = facadeTextures();
  const sTex = shopTextures();
  const lit = (map: THREE.Texture, emissiveMap: THREE.Texture | null) =>
    new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: emissiveMap ? 0xffffff : 0x000000, emissiveIntensity: 0, vertexColors: true, roughness: 0.9 });
  const facadeMat = lit(fTex.map, fTex.emissive);
  const shopMat = lit(sTex.map, sTex.emissive);
  const signMat = new THREE.MeshStandardMaterial({ map: sign.map, emissiveMap: sign.map, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6 });
  const plainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
  for (const [geo, mat] of [[facade, facadeMat], [shops, shopMat], [plain, plainMat], [signs, signMat]] as const) {
    const mesh = new THREE.Mesh(geo.build(), mat);
    mesh.castShadow = mat !== signMat;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  return {
    count,
    /** 0 = day, 1 = night: lights up windows, shops and signs. */
    setNight(f: number) {
      facadeMat.emissiveIntensity = f * 0.9;
      shopMat.emissiveIntensity = f * 1.1;
      signMat.emissiveIntensity = f * 0.45;
    },
  };
}

const TANK_GEO = new THREE.CylinderGeometry(0.55, 0.55, 1.1, 10);
