import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Footprint } from './buildings';
import { MENUS, type Menu } from './food';
import { SIDEWALK_HEIGHT } from './layout';
import { SHOP_SIGNS } from './textures';

const TABLE_TOP = 0.74; // m above the sidewalk
const STOOL_TOP = 0.46;
const OUT_SEAT = 0.75; // stool distance out from the shopfront (under the sunshade)
const ASK_DIST = 1.4; // where you stand to order, out from the shopfront
const ORDER_RADIUS = 1.6;
const TABLE_GAP = 0.6; // stool centre to table centre

export interface Eatery {
  name: string;
  menu: Menu;
  /** Where you stand to order (sidewalk). */
  spot: THREE.Vector3;
  /** Hotels: stool top centre; you sit down facing the road (seatYaw), then swivel to face the table (eatYaw). */
  seat: THREE.Vector3;
  seatYaw: number;
  eatYaw: number;
  table: THREE.Vector3;
  /** Served on a white china plate instead of a banana leaf (the hotel restaurants). */
  china?: boolean;
}

/**
 * Every shop whose board has a menu (tiffin centres, mess, hotels, tea stalls, stores,
 * supermarkets) is an eatery. Hotels get a steel table and a plastic stool out front
 * (2 instanced draw calls for the whole town); the table blocks the player.
 */
export function createEateries(scene: THREE.Scene, world: RAPIER.World, footprints: Footprint[]) {
  const list: Eatery[] = [];
  for (const fp of footprints) {
    for (const s of fp.shops) {
      const name = SHOP_SIGNS[s.sign].en;
      const menu = MENUS[name];
      if (!menu) continue;
      const f = new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw)); // out to the road
      const t = new THREE.Vector3(Math.cos(s.yaw), 0, -Math.sin(s.yaw)); // along the shopfront
      const base = new THREE.Vector3(s.x, SIDEWALK_HEIGHT, s.z);
      // Stool, and the table in front of it along the shopfront (knees go under the table).
      const seat = base.clone().addScaledVector(f, OUT_SEAT).addScaledVector(t, -0.3);
      const table = seat.clone().addScaledVector(t, TABLE_GAP);
      seat.y += STOOL_TOP;
      table.y += TABLE_TOP;
      list.push({ name, menu, spot: base.clone().addScaledVector(f, ASK_DIST), seat, seatYaw: s.yaw, eatYaw: s.yaw + Math.PI / 2, table });
    }
  }

  const hotels = list.filter((e) => e.menu.kind === 'hotel');
  const tableGeo = mergeGeometries([
    new THREE.BoxGeometry(0.62, 0.04, 0.5).translate(0, TABLE_TOP - 0.02, 0),
    ...[-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.BoxGeometry(0.04, TABLE_TOP - 0.04, 0.04).translate(sx * 0.27, (TABLE_TOP - 0.04) / 2, sz * 0.21))),
  ])!;
  const stoolGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.17, 0.15, 0.04, 12).translate(0, STOOL_TOP - 0.02, 0),
    new THREE.CylinderGeometry(0.14, 0.17, STOOL_TOP - 0.04, 12, 1, true).translate(0, (STOOL_TOP - 0.04) / 2, 0),
  ])!;
  const tables = new THREE.InstancedMesh(tableGeo, new THREE.MeshStandardMaterial({ color: 0xb8bcc2, metalness: 0.6, roughness: 0.35 }), hotels.length);
  const stools = new THREE.InstancedMesh(stoolGeo, new THREE.MeshStandardMaterial({ color: 0xc62828, roughness: 0.6, side: THREE.DoubleSide }), hotels.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const one = new THREE.Vector3(1, 1, 1);
  hotels.forEach((e, i) => {
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, e.eatYaw);
    tables.setMatrixAt(i, m.compose(new THREE.Vector3(e.table.x, SIDEWALK_HEIGHT, e.table.z), q, one));
    stools.setMatrixAt(i, m.compose(new THREE.Vector3(e.seat.x, SIDEWALK_HEIGHT, e.seat.z), q, one));
    const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(e.table.x, SIDEWALK_HEIGHT + TABLE_TOP / 2, e.table.z).setRotation(q));
    world.createCollider(RAPIER.ColliderDesc.cuboid(0.31, TABLE_TOP / 2, 0.25), body);
  });
  for (const mesh of [tables, stools]) {
    mesh.castShadow = mesh.receiveShadow = true;
    scene.add(mesh);
  }

  return {
    list,
    /** Closest eatery you're standing at, or null. */
    nearest(p: THREE.Vector3) {
      let best: Eatery | null = null;
      let bestD = ORDER_RADIUS;
      for (const e of list) {
        const d = Math.hypot(e.spot.x - p.x, e.spot.z - p.z);
        if (d < bestD) {
          bestD = d;
          best = e;
        }
      }
      return best;
    },
  };
}
