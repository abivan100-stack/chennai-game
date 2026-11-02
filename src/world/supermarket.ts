import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Animator } from '../characters/animator';
import { CHARACTER_HEIGHT, type CharacterAsset } from '../characters/catalog';
import { SHELVES, type FoodItem, type Shelf } from './food';
import { GeoBuilder } from './geo';
import { SIDEWALK_HEIGHT, SUPERMARKET_LOTS } from './layout';

// Store layout in store space: entrance wall at +z, x across the frontage (metres).
const W = 16;
const D = 14;
const H = 4.2;
const WALL = 0.25;
const DOOR = 3.2; // entrance gap width
const FLOOR_Y = SIDEWALK_HEIGHT;
const SHELF = { len: 7, depth: 0.8, h: 1.8, z0: -4.5 };
const SHELF_X = [-6, -2.5, 1];
const SHELF_LEVELS = [0.32, 0.72, 1.12, 1.52];
const COUNTER = { x: 5, z: 4.2, w: 3, d: 0.8, h: 1.0 };
const PICK_RADIUS = 1.1;
const PAY_RADIUS = 1.3;
const ACTIVE_RADIUS = 35; // animate the cashier only this close
/** Where you stand to pick from each shelf (store space) + which shelf data it sells. */
const PICK_SPOTS: { x: number; z: number; shelf: number }[] = [
  { x: -4.9, z: -2.5, shelf: 0 }, // biscuits & snacks (left wall unit, inner face)
  { x: -3.6, z: 0.5, shelf: 1 }, // fruits
  { x: -1.4, z: -2.5, shelf: 2 }, // bakery
  { x: 0.0, z: 1.0, shelf: 3 }, // cold drinks (front of the middle-right unit)
  { x: -2.5, z: -5.5, shelf: 3 }, // cold drinks (fridge at the back)
];

const WHITE = new THREE.Color(0xf4f2ec);
const TILE = new THREE.Color(0xdedad0);
const GREEN = new THREE.Color(0x2e7d32);
const SHELF_C = new THREE.Color(0x8d9399);
const COUNTER_C = new THREE.Color(0xb5651d);
const PRODUCT_COLOURS = [0xd32f2f, 0xf9a825, 0x1565c0, 0x2e7d32, 0xef6c00, 0x6a1b9a, 0xfafafa, 0x00897b, 0xc2185b, 0x5d4037];

export interface Store {
  name: string;
  /** Store space -> world. */
  toWorld: (x: number, z: number, out?: THREE.Vector3) => THREE.Vector3;
  toLocal: (p: THREE.Vector3) => { x: number; z: number };
  yaw: number;
  cashier: { root: THREE.Group; anim: Animator };
}

function signTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 160;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2e7d32';
  g.fillRect(0, 0, 1024, 160);
  g.fillStyle = '#ffeb3b';
  g.fillRect(0, 140, 1024, 20);
  g.fillStyle = '#ffffff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '800 64px system-ui, sans-serif';
  g.fillText('KAPALI SUPERMARKET', 512, 52);
  g.font = '700 40px "Nirmala UI", "Latha", "Noto Sans Tamil", sans-serif';
  g.fillText('கபாலி சூப்பர் மார்க்கெட்', 512, 112);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * Walk-in supermarkets on their reserved lots (layout.SUPERMARKET_LOTS): glass front with an
 * open entrance, aisles of stocked shelves (products are one InstancedMesh), a drinks fridge,
 * a checkout counter with a cashier. Lit from inside (emissive), so no extra lights.
 * Pick items into a basket at the shelves (E), pay at the counter (E). Walk out without paying
 * and the cashier calls the police.
 */
export function createSupermarkets(scene: THREE.Scene, world: RAPIER.World, cashierAsset: CharacterAsset) {
  const shell = new GeoBuilder(); // outside walls + roof
  const inside = new GeoBuilder(); // interior: floor, shelves, counter (self-lit)
  const stores: Store[] = [];
  const products: THREE.Matrix4[] = [];
  const productColours: THREE.Color[] = [];
  const glassPanes: THREE.Matrix4[] = [];
  const signs: THREE.Matrix4[] = [];
  let seed = 11;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  for (const lot of SUPERMARKET_LOTS()) {
    const yaw = lot.facing === 's' ? 0 : -Math.PI / 2; // entrance faces south or west
    const cx = (lot.x0 + lot.x1) / 2;
    const cz = (lot.z0 + lot.z1) / 2;
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const toWorld = (x: number, z: number, out = new THREE.Vector3()) => out.set(cx + x * cos + z * sin, 0, cz - x * sin + z * cos);
    const toLocal = (p: THREE.Vector3) => {
      const dx = p.x - cx;
      const dz = p.z - cz;
      return { x: dx * cos - dz * sin, z: dx * sin + dz * cos };
    };
    const q = new THREE.Quaternion().setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    const tmp = new THREE.Vector3();
    /** Box in store space (y = bottom), optional collider. */
    const box = (b: GeoBuilder, w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.Color, collide = true) => {
      const p = toWorld(x, z, tmp);
      b.box(w, h, d, p.x, y + h / 2, p.z, c, yaw);
      if (collide) {
        const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, y + h / 2, p.z).setRotation(q));
        world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2), rb);
      }
    };

    // Shell: back + side walls, front wall either side of the entrance, roof.
    box(shell, W, H, WALL, 0, FLOOR_Y, -D / 2 + WALL / 2, GREEN);
    box(shell, WALL, H, D, -W / 2 + WALL / 2, FLOOR_Y, 0, GREEN);
    box(shell, WALL, H, D, W / 2 - WALL / 2, FLOOR_Y, 0, GREEN);
    const side = (W - DOOR) / 2;
    for (const s of [-1, 1]) {
      const x = s * (DOOR / 2 + side / 2);
      box(shell, side, 0.6, WALL, x, FLOOR_Y, D / 2 - WALL / 2, GREEN); // sill under the glass
      box(shell, side, 0.9, WALL, x, FLOOR_Y + H - 0.9, D / 2 - WALL / 2, GREEN); // band over the glass
      // Glass pane (instanced, transparent) + its collider.
      const p = toWorld(x, D / 2 - WALL / 2);
      glassPanes.push(new THREE.Matrix4().compose(new THREE.Vector3(p.x, FLOOR_Y + 0.6 + (H - 1.5) / 2, p.z), q, new THREE.Vector3(side, H - 1.5, 0.05)));
      const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, FLOOR_Y + H / 2, p.z).setRotation(q));
      world.createCollider(RAPIER.ColliderDesc.cuboid(side / 2, H / 2, WALL / 2), rb);
    }
    box(shell, DOOR, 0.9, WALL, 0, FLOOR_Y + H - 0.9, D / 2 - WALL / 2, GREEN); // lintel
    box(shell, W + 0.4, 0.3, D + 0.4, 0, FLOOR_Y + H, 0, WHITE); // roof (also stops the camera)
    box(shell, W - 2, 0.15, 1.6, 0, FLOOR_Y + H - 1.0, D / 2 + 0.8, GREEN, false); // entrance canopy
    // Big signboard over the entrance.
    const sp = toWorld(0, D / 2 + 0.05);
    signs.push(new THREE.Matrix4().compose(new THREE.Vector3(sp.x, FLOOR_Y + H - 0.45, sp.z), q, new THREE.Vector3(9, 1.4, 1)));

    // Interior: tiled floor, ceiling panel lights, shelves with products, fridge, counter.
    box(inside, W - 2 * WALL, 0.02, D - 2 * WALL, 0, FLOOR_Y - 0.01, 0, TILE, false);
    for (const lx of [-4.5, 0, 4.5]) for (const lz of [-3.5, 1.5]) box(inside, 2.4, 0.04, 0.5, lx, FLOOR_Y + H - 0.06, lz, WHITE, false);
    /** Shelf unit centred at (x, z), running along `along`: backboard, boards, plinth, top; one collider. */
    const unit = (x: number, z: number, along: 'x' | 'z', len: number, depth: number, h: number, faces: number[], c: THREE.Color) => {
      const [lw, ld] = along === 'z' ? [depth, len] : [len, depth];
      const [bw, bd] = along === 'z' ? [0.08, len] : [len, 0.08];
      box(inside, bw, h, bd, x, FLOOR_Y, z, c, false); // backboard
      box(inside, lw, 0.22, ld, x, FLOOR_Y, z, c, false); // plinth
      for (const y of [...SHELF_LEVELS, h - 0.03]) box(inside, lw, 0.03, ld, x, FLOOR_Y + y - 0.03, z, c, false); // boards
      for (const s of [-1, 1]) box(inside, along === 'z' ? depth : 0.05, h, along === 'z' ? 0.05 : depth, along === 'z' ? x : x + (s * len) / 2, FLOOR_Y, along === 'z' ? z + (s * len) / 2 : z, c, false); // end posts
      const p = toWorld(x, z);
      const rb = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(p.x, FLOOR_Y + h / 2, p.z).setRotation(q));
      world.createCollider(RAPIER.ColliderDesc.cuboid(lw / 2, h / 2, ld / 2), rb);
      // Products on every board, on each open face.
      for (const y of SHELF_LEVELS) {
        for (const face of faces) {
          for (let s = -len / 2 + 0.18; s < len / 2 - 0.1; s += 0.26 + rand() * 0.08) {
            const w = 0.14 + rand() * 0.1;
            const ph = 0.16 + rand() * 0.18;
            const off = face * (depth / 2 - 0.13);
            const pp = toWorld(along === 'z' ? x + off : x + s, along === 'z' ? z + s : z + off);
            const size = along === 'z' ? new THREE.Vector3(0.18, ph, w) : new THREE.Vector3(w, ph, 0.18);
            products.push(new THREE.Matrix4().compose(new THREE.Vector3(pp.x, FLOOR_Y + y + ph / 2, pp.z), q, size));
            productColours.push(new THREE.Color(PRODUCT_COLOURS[Math.floor(rand() * PRODUCT_COLOURS.length)]));
          }
        }
      }
    };
    SHELF_X.forEach((x, i) => unit(x, SHELF.z0 + SHELF.len / 2, 'z', SHELF.len, SHELF.depth, SHELF.h, i === 0 ? [1] : [-1, 1], SHELF_C));
    unit(-2.5, -D / 2 + WALL + 0.35, 'x', 9, 0.7, 2.1, [1], new THREE.Color(0xcfd8dc)); // drinks fridge along the back wall
    box(inside, COUNTER.w, COUNTER.h, COUNTER.d, COUNTER.x, FLOOR_Y, COUNTER.z, COUNTER_C);
    box(inside, 0.45, 0.3, 0.4, COUNTER.x + 0.8, FLOOR_Y + COUNTER.h, COUNTER.z, new THREE.Color(0x263238), false); // till

    // Cashier behind the counter, facing the entrance.
    const body = cloneSkinned(cashierAsset.scene);
    const root = new THREE.Group();
    root.add(body);
    root.scale.setScalar(1.62 / CHARACTER_HEIGHT);
    const cp = toWorld(COUNTER.x - 0.4, COUNTER.z - 0.9);
    root.position.set(cp.x, FLOOR_Y, cp.z);
    root.rotation.y = yaw;
    scene.add(root);
    const anim = new Animator(body, cashierAsset.clips);
    anim.play('idle', { fade: 0 });

    stores.push({ name: 'Kapali Supermarket', toWorld, toLocal, yaw, cashier: { root, anim } });
  }

  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, shadow: boolean) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = shadow;
    m.receiveShadow = true;
    scene.add(m);
  };
  add(shell.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }), true);
  // The interior lights itself (store tube lights), so it isn't black under the roof's shadow:
  // emissive = its own colour * 0.45, which brightens the vertex colours instead of washing them white.
  const insideMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 });
  insideMat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * 0.45;');
  };
  add(inside.build(), insideMat, false);

  const instanced = (geo: THREE.BufferGeometry, mat: THREE.Material, mats: THREE.Matrix4[], colours?: THREE.Color[]) => {
    const im = new THREE.InstancedMesh(geo, mat, mats.length);
    mats.forEach((m, i) => im.setMatrixAt(i, m));
    colours?.forEach((c, i) => im.setColorAt(i, c));
    scene.add(im);
    return im;
  };
  instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ roughness: 0.6, emissive: 0x333333 }), products, productColours);
  instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0xa9cfe0, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.3, depthWrite: false }), glassPanes);
  const signTex = signTexture();
  instanced(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: 0xffffff, emissiveIntensity: 0.25 }), signs);

  const local = (s: Store, p: THREE.Vector3) => s.toLocal(p);

  return {
    stores,
    /** The store you're inside, or null. */
    storeAt(p: THREE.Vector3) {
      for (const s of stores) {
        const l = local(s, p);
        if (Math.abs(l.x) < W / 2 - WALL && l.z > -D / 2 && l.z < D / 2 - WALL / 2) return s;
      }
      return null;
    },
    /** Shelf you're standing at inside `store`, or null. */
    shelfAt(store: Store, p: THREE.Vector3): Shelf | null {
      const l = local(store, p);
      for (const s of PICK_SPOTS) if (Math.hypot(l.x - s.x, l.z - s.z) < PICK_RADIUS) return SHELVES[s.shelf];
      return null;
    },
    atCounter(store: Store, p: THREE.Vector3) {
      const l = local(store, p);
      return Math.hypot(l.x - COUNTER.x, l.z - (COUNTER.z + 1.0)) < PAY_RADIUS;
    },
    update(dt: number, playerPos: THREE.Vector3) {
      for (const s of stores) {
        const c = s.cashier.root.position;
        if (Math.hypot(c.x - playerPos.x, c.z - playerPos.z) < ACTIVE_RADIUS) s.cashier.anim.update(dt);
      }
    },
  };
}

export type Basket = FoodItem[];
