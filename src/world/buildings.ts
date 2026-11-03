import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import { CHEPAUK_LOT, PRESIDENCY_LOT, BESANT, CAFE_LOTS, COMPLEX_LOTS, TIDEL_LOT, LANDMARK_LOTS, BOAT_CLUB_LOT, CAMPUS_LOT, COLLEGE_LOT, DEPOT_LOT, HOSPITAL_LOT, PLACE_LOTS, POLICE_LOT, SERVICE_HUBS, SHOWROOM_LOTS, HOTEL_LOTS, BEACHFRONT_LOTS, SUPERMARKET_LOTS, WATER_LOTS, blocks } from './layout';
import { SHOP_ROWS, SIGN_COUNT, facadeTextures, shopTextures, signTextures } from './textures';

const DEPTH = [9, 15];
const ALLEY_CHANCE = 0.12;
const ALLEY_WIDTH = 1.5;
const BALCONY_CHANCE = 0.45;
const TANK_CHANCE = 0.5;
const STAIR_ROOM_CHANCE = 0.3;
const OLD_HOUSE_CHANCE = 0.14; // tiled-roof house with a pillared verandah (thinnai), no shop
const SHOWROOM_CHANCE = 0.08; // one wide shop with a big signboard
const NO_SHOP_CHANCE = 0.4; // old-town buildings that are just homes (no ground-floor shops)
const SHOP_WIDTH: [number, number] = [4.5, 9]; // m per shop bay (wider bays = fewer, bigger shops)
const AWNING_CHANCE = 0.5; // shops with a sloping fabric awning instead of the concrete sunshade
const STRIPED_CHANCE = 0.35; // ...of which striped
const AWNINGS = [0xc62828, 0x2e7d32, 0x1565c0, 0xf9a825, 0x6a1b9a, 0x00838f, 0xef6c00, 0xad1457].map((c) => new THREE.Color(c));
const AWNING_TILT = 0.4; // rad, front edge down
const WHITE = new THREE.Color(0xffffff);
const AWNING_BOX = new THREE.BoxGeometry(1, 0.05, 1.1); // scaled to each stripe's width
const SHOP_TINT = 0.7; // how far shopfronts are lightened towards white (keeps the shop designs' own colours)
const TILE = 180; // metres: buildings are merged per tile (frustum culling works per tile)
/**
 * Each area looks like its real counterpart:
 *   old    - Mylapore / Santhome shop-houses (2-4 floors, shops + boards, the odd tiled house)
 *   flats  - Mandaveli / Adyar apartment blocks (3-5 floors, a balcony on every floor)
 *   commercial - Anna Salai / Teynampet / Dr. Radhakrishnan Salai commercial blocks: 4-7 floors of
 *            painted concrete, a sunshade (chajja) over every row of windows, a big name board,
 *            showrooms on the ground floor (no glass towers: Chennai's main roads look like this)
 *   house  - Alwarpet / R.A. Puram bungalows (1-2 floors, behind compound walls)
 */
type Kind = 'old' | 'flats' | 'commercial' | 'house';
const COMMERCIAL = [0xf3ead2, 0xffffff, 0xe9e4da, 0xf6e3b4, 0xd9dde0, 0xf0d9c4, 0xe6d3b3];
const BAND = new THREE.Color(0xd6d3cc);
const FLAT_PALETTE = [0xf5f1e6, 0xe8e2d4, 0xf2d7b6, 0xd9e6ee, 0xf0e0e8, 0xe4edd9];

/** Leafy residential blocks (Alwarpet, R.A. Puram, Adyar): detached houses behind compound walls. */
const HOUSE = { yard: 3.5, gap: 2.5, width: [9, 15], oldChance: 0.3, wallH: 1.3, gate: 2.2 };
const YARD_TREE = new THREE.IcosahedronGeometry(1.6, 1).scale(1, 0.85, 1);
const YARD_TRUNK = new THREE.CylinderGeometry(0.12, 0.18, 2.6, 6);
const LEAF = new THREE.Color(0x3f7f35);
const BARK = new THREE.Color(0x6a5038);
const COMPOUND = new THREE.Color(0xe9e2d0);

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
  /** Height of the roof (top of the walls), metres. */
  h: number;
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
  // The town is split into square tiles, 4 merged meshes each, so the renderer can skip tiles
  // that are off screen (and the shadow pass only draws the tiles near the player).
  const tiles = new Map<string, { facade: GeoBuilder; shops: GeoBuilder; plain: GeoBuilder; signs: GeoBuilder }>();
  let facade!: GeoBuilder;
  let shops!: GeoBuilder;
  let plain!: GeoBuilder;
  let signs!: GeoBuilder;
  const useTile = (x: number, z: number) => {
    const key = `${Math.floor(x / TILE)},${Math.floor(z / TILE)}`;
    let t = tiles.get(key);
    if (!t) tiles.set(key, (t = { facade: new GeoBuilder(), shops: new GeoBuilder(), plain: new GeoBuilder(), signs: new GeoBuilder() }));
    ({ facade, shops, plain, signs } = t);
  };
  const sign = signTextures();
  let count = 0;
  const footprints: Footprint[] = [];

  /** One building: frontage w, depth d, centre (cx, cz), facing the road. */
  const reserved = [POLICE_LOT(), DEPOT_LOT(), HOSPITAL_LOT(), COLLEGE_LOT(), BOAT_CLUB_LOT(), CAMPUS_LOT(), ...WATER_LOTS(), ...SUPERMARKET_LOTS(), ...Object.values(PLACE_LOTS()), ...Object.values(LANDMARK_LOTS()), TIDEL_LOT(), ...COMPLEX_LOTS(), ...CAFE_LOTS(), BESANT.church(), CHEPAUK_LOT(), PRESIDENCY_LOT(), ...SERVICE_HUBS.map((h) => h.lot()), ...SHOWROOM_LOTS(), ...HOTEL_LOTS(), ...BEACHFRONT_LOTS()];
  function building(w: number, d: number, cx: number, cz: number, facing: Facing, showroom: boolean, kind: Kind = 'old', yard = false, lowRise = false) {
    const house = kind === 'house';
    const office = kind === 'commercial'; // Anna Salai-style commercial block
    const flats = kind === 'flats';
    // Leave the police station's and supermarkets' lots empty (rotated footprint: swap w/d for east/west facing).
    const hw0 = (facing === 'e' || facing === 'w' ? d : w) / 2;
    const hd0 = (facing === 'e' || facing === 'w' ? w : d) / 2;
    if (reserved.some((lot) => cx + hw0 > lot.x0 && cx - hw0 < lot.x1 && cz + hd0 > lot.z0 && cz - hd0 < lot.z1)) return;
    count++;
    useTile(cx, cz);
    const oldHouse = (kind === 'old' || house) && !showroom && rand() < (house ? HOUSE.oldChance : OLD_HOUSE_CHANCE);
    // Flats sometimes keep a row of shops on the ground floor; offices always have a showroom.
    const noShops = house || (flats && rand() < 0.7) || (kind === 'old' && !showroom && rand() < NO_SHOP_CHANCE);
    if (office) showroom = true;
    if (yard) {
      // Set the house back behind a front yard; a compound wall with a gate on the old front line.
      const yaw0 = YAW[facing];
      const fx = Math.sin(yaw0);
      const fz = Math.cos(yaw0);
      const wm = new THREE.Matrix4().makeRotationY(yaw0).setPosition(cx, 0, cz);
      const W = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyMatrix4(wm);
      const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw0);
      const gateX = (rand() - 0.5) * (w - HOUSE.gate - 2);
      const segs: [number, number][] = [[-w / 2, gateX - HOUSE.gate / 2], [gateX + HOUSE.gate / 2, w / 2]];
      for (const [a, b] of segs) {
        if (b - a < 0.3) continue;
        const p = W((a + b) / 2, d / 2 - 0.1);
        plain.box(b - a, HOUSE.wallH, 0.2, p.x, HOUSE.wallH / 2, p.z, COMPOUND, yaw0);
        world.createCollider(RAPIER.ColliderDesc.cuboid((b - a) / 2, HOUSE.wallH / 2, 0.1).setTranslation(p.x, HOUSE.wallH / 2, p.z).setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }));
      }
      if (w > 8) { // a tree in the yard
        const tp = W(gateX > 0 ? -w / 4 : w / 4, d / 2 - HOUSE.yard / 2);
        plain.add(YARD_TRUNK, new THREE.Matrix4().setPosition(tp.x, 1.3, tp.z), BARK);
        plain.add(YARD_TREE, new THREE.Matrix4().setPosition(tp.x, 3.4, tp.z), LEAF);
        world.createCollider(RAPIER.ColliderDesc.cylinder(1.3, 0.2).setTranslation(tp.x, 1.3, tp.z));
      }
      cx -= fx * HOUSE.yard / 2;
      cz -= fz * HOUSE.yard / 2;
      d -= HOUSE.yard;
    }
    const r = rand();
    const floors = oldHouse ? (r < 0.6 ? 1 : 2)
      : house ? (r < 0.45 ? 1 : 2)
      : flats ? 3 + Math.floor(r * 3)
      : office ? (lowRise ? 2 + Math.floor(r * 3) : 4 + Math.floor(r * 4))
      : r < 0.1 ? 1 : r < 0.42 ? 2 : r < 0.78 ? 3 : 4;
    const groundH = office ? range(4.2, 5) : range(3.2, 4.1);
    const floorH = office ? range(3.4, 3.8) : range(3.0, 3.5);
    const h = groundH + (floors - 1) * floorH;
    const wall = new THREE.Color(pick(office ? COMMERCIAL : flats ? FLAT_PALETTE : PALETTE));
    const fp: Footprint = { cx, cz, w, d, yaw: YAW[facing], color: `#${wall.getHexString()}`, shop: null, shops: [], oldHouse, h };
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
    // Shop bays: 1 for a showroom, otherwise SHOP_WIDTH each. The shop tile holds two shops.
    const bays = showroom ? 1 : Math.max(1, Math.round(w / range(SHOP_WIDTH[0], SHOP_WIDTH[1])));
    const shopShift = rand() < 0.5 ? 0 : 0.5;
    const shopRow = Math.floor(rand() * SHOP_ROWS); // which pair of shop designs this building has

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
      if (wl.front && !oldHouse && !noShops) {
        const u1 = bays / 2 + shopShift;
        const v0 = 1 - (shopRow + 1) / SHOP_ROWS;
        const v1 = 1 - shopRow / SHOP_ROWS;
        shops.quad(g[0], g[1], g[2], g[3], [[shopShift, v0], [u1, v0], [u1, v1], [shopShift, v1]], wall.clone().lerp(WHITE, SHOP_TINT), out);
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
    if (office) {
      // A concrete sunshade over every row of windows, front and sides.
      for (let f = 1; f < floors; f++) {
        const y = groundH + f * floorH - 0.55;
        box(w + 0.2, 0.08, 0.7, 0, y, hd + 0.3, BAND);
        if (rand() < 0.5) {
          box(0.7, 0.08, d, hw + 0.3, y, 0, BAND);
          box(0.7, 0.08, d, -hw - 0.3, y, 0, BAND);
        }
      }
      // The firm's big name board across the first floor.
      if (floors > 2) {
        const idx = Math.floor(rand() * SIGN_COUNT);
        const [v0, v1] = sign.rowV(idx);
        const bw = Math.min(w - 1, 10);
        const bh = Math.min(2, bw / 4.5);
        const y = groundH + 0.6;
        const z = hd + 0.04;
        const s = [P(-bw / 2, y, z), P(bw / 2, y, z), P(bw / 2, y + bh, z), P(-bw / 2, y + bh, z)];
        signs.quad(s[0], s[1], s[2], s[3], [[0, v0], [1, v0], [1, v1], [0, v1]], wall, N(0, 1));
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

      // Sunshade over the shops, one signboard per shop sized to its width (houses: none).
      const bayW = w / bays;
      const awning = !office && !noShops && !showroom && rand() < AWNING_CHANCE;
      if (!noShops && !awning) box(w, 0.1, 0.8, 0, groundH - 0.05, hd + 0.4, office ? BAND : wall);
      if (awning) {
        // A sloping fabric awning over each shop, its own colour (some striped with white).
        for (let bay = 0; bay < bays; bay++) {
          const colour = AWNINGS[Math.floor(rand() * AWNINGS.length)];
          const striped = rand() < STRIPED_CHANCE;
          const aw = bayW - 0.25;
          const n = striped ? Math.max(2, Math.round(aw / 0.45)) : 1;
          for (let k = 0; k < n; k++) {
            const x = -hw + bayW * bay + 0.125 + (aw / n) * (k + 0.5);
            const am = new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(x, groundH - 0.2, hd + 0.55).multiply(new THREE.Matrix4().makeRotationX(AWNING_TILT)).scale(new THREE.Vector3(aw / n - 0.01, 1, 1)));
            plain.add(AWNING_BOX, am, striped && k % 2 ? WHITE : colour);
          }
        }
      }
      for (let bay = 0; bay < (noShops ? 0 : bays); bay++) {
        if (!showroom && rand() < 0.1) continue; // the odd shop without a board
        const x = -hw + bayW * (bay + 0.5);
        const sw = bayW - 0.3;
        const sh = THREE.MathUtils.clamp((sw / 7) * range(0.85, 1.5), 0.45, showroom ? 1.6 : 1.3); // board heights vary
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
    // A first-floor balcony would sit right in front of the shop signboards, so shops start one floor up.
    // Flats: a balcony on every floor, in every other bay (one railing colour per building).
    const flatRail = pick(RAILINGS);
    for (let f = fp.shops.length ? 2 : 1; f < (office ? 0 : floors); f++) {
      const bayW = w / windowBays;
      const xs = flats ? Array.from({ length: windowBays }, (_, i) => i).filter((i) => i % 2 === 0) : rand() > BALCONY_CHANCE ? [] : [Math.floor(rand() * windowBays)];
      for (const i of xs) {
        const x = -hw + bayW * (i + 0.5);
        const y = groundH + (f - 1) * floorH;
        const bw = Math.min(2.4, bayW - 0.2);
        const rail = flats ? flatRail : pick(RAILINGS);
        box(bw, 0.12, 0.9, x, y, hd + 0.45, wall);
        box(bw, 0.9, 0.05, x, y + 0.5, hd + 0.88, rail);
        box(0.05, 0.9, 0.9, x - bw / 2 + 0.02, y + 0.5, hd + 0.45, rail);
        box(0.05, 0.9, 0.9, x + bw / 2 - 0.02, y + 0.5, hd + 0.45, rail);
      }
    }

    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(hw, h / 2, hd)
        .setTranslation(cx, h / 2, cz)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
    );
  }

  /** Fill a street frontage from `a` to `b` with buildings of varied width (and the odd alley). */
  function row(a: number, b: number, place: (start: number, width: number, depth: number, showroom: boolean) => void, houses = false) {
    // (houses = detached plots with yards: wider, always a gap between them)
    let x = a;
    while (b - x >= 4) {
      const showroom = !houses && rand() < SHOWROOM_CHANCE;
      let w = Math.round((showroom ? range(13, 18) : houses ? range(HOUSE.width[0], HOUSE.width[1]) : range(4, 13)) * 2) / 2;
      w = Math.min(w, b - x);
      if (b - x - w < 4) w = b - x; // last one takes the remainder
      place(x, w, range(DEPTH[0], DEPTH[1]) + (houses ? HOUSE.yard : 0), showroom);
      x += w;
      if (houses) x += HOUSE.gap; // detached
      else if (rand() < ALLEY_CHANCE) x += ALLEY_WIDTH;
    }
  }

  for (const blk of blocks()) {
    if (blk.kind !== 'shops' && blk.kind !== 'houses') continue;
    const h = blk.kind === 'houses';
    const { x0, x1, z0, z1, road } = blk;
    const dMax = DEPTH[1] + (h ? HOUSE.yard : 0);
    const put = (f: Facing) => (s: number, w: number, d: number, sr: boolean) => {
      const [kind, lowRise] = areaKind(blk.i, blk.j, f, rand());
      const cx = f === 'n' || f === 's' ? s + w / 2 : f === 'w' ? x0 + d / 2 : x1 - d / 2;
      const cz = f === 'e' || f === 'w' ? s + w / 2 : f === 'n' ? z0 + d / 2 : z1 - d / 2;
      building(w, d, cx, cz, f, sr, kind, h && kind !== 'commercial', lowRise); // showrooms sit on the pavement, no compound wall
    };
    if (road.n) row(x0, x1, put('n'), h);
    if (road.s) row(x0, x1, put('s'), h);
    // Side rows fit between the north/south rows.
    const za = road.n ? z0 + dMax : z0;
    const zb = road.s ? z1 - dMax : z1;
    if (road.w) row(za, zb, put('w'), h);
    if (road.e) row(za, zb, put('e'), h);
  }

  const fTex = facadeTextures();
  const sTex = shopTextures();
  const lit = (map: THREE.Texture, emissiveMap: THREE.Texture) =>
    new THREE.MeshStandardMaterial({ map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, vertexColors: true, roughness: 0.9 });
  const facadeMat = lit(fTex.map, fTex.emissive);
  const shopMat = lit(sTex.map, sTex.emissive);
  const signMat = new THREE.MeshStandardMaterial({ map: sign.map, emissiveMap: sign.map, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.6 });
  const plainMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, side: THREE.DoubleSide });
  for (const t of tiles.values()) {
    for (const [geo, mat] of [[t.facade, facadeMat], [t.shops, shopMat], [t.plain, plainMat], [t.signs, signMat]] as const) {
      if (geo.empty) continue;
      const mesh = new THREE.Mesh(geo.build(), mat);
      mesh.castShadow = mat !== signMat;
      mesh.receiveShadow = true;
      scene.add(mesh);
    }
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

/**
 * Which kind of building goes on block (i, j), facing f, like the real area (r = random 0..1).
 * Returns [kind, lowRise] (lowRise: a 2-4 floor showroom block rather than a 4-7 floor one).
 */
function areaKind(i: number, j: number, f: Facing, r: number): [Kind, boolean] {
  if (i <= -2) return r < 0.7 ? ['commercial', false] : ['old', false]; // Teynampet, Anna Salai
  if ((j === -1 && f === 's') || (j === 0 && f === 'n')) return r < 0.6 ? ['commercial', false] : ['old', false]; // Dr. Radhakrishnan Salai
  if (j <= -1) return ['old', false]; // Triplicane: old shop-houses and mansions
  if (i === -1) return f === 'e' && r < 0.75 ? ['commercial', true] : ['house', false]; // Alwarpet: TTK Road showrooms, bungalows behind
  if (j >= 9) return f === 'n' ? ['commercial', true] : r < 0.55 ? ['commercial', false] : ['flats', false]; // Taramani: IT offices + flats; Adyar Main Road shops
  if (j >= 8) return (j === 8 && f === 's') || (j === 9 && f === 'n') ? (r < 0.6 ? ['commercial', true] : ['flats', false]) : r < 0.65 ? ['flats', false] : ['house', false]; // Adyar
  if (j >= 6) return r < 0.25 ? ['flats', false] : ['house', false]; // R.A. Puram
  if (j === 4 || j === 5) return r < 0.6 ? ['flats', false] : ['old', false]; // Mandaveli
  return ['old', false]; // Mylapore, Santhome
}
