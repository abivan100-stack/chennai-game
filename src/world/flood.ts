import * as THREE from 'three';
import { GeoBuilder } from './geo';

/**
 * Chennai floods: in heavy rain the low stretches of road fill with muddy water, and drain
 * slowly once it stops. Vehicles and people slow down in it (see slowAt). One draw call.
 */

/** Low-lying road stretches (world rectangles). */
const ZONES = [
  { x0: 64, x1: 76, z0: 30, z1: 64 }, // San Thome High Road dip
  { x0: -20, x1: 20, z0: 64, z1: 76 }, // Kutchery Road
  { x0: 119, x1: 131, z0: 36, z1: 80 }, // Beach Road by the fish market
  { x0: -76, x1: -64, z0: -60, z1: -32 }, // R.K. Mutt Road
];
const RAIN_TO_FLOOD = 0.55; // rain (0..1) above this makes water rise
const RISE_PER_SEC = 0.025; // flood level (0..1) per second in heavy rain
const DRAIN_PER_SEC = 0.008; // ...and how fast it drains when the rain eases
const MAX_DEPTH = 0.32; // metres of water at full flood
const SLOWEST = 0.35; // speed multiplier in a full flood

export function createFlood(scene: THREE.Scene) {
  const geo = new GeoBuilder();
  const up = new THREE.Vector3(0, 1, 0);
  const white = new THREE.Color(0xffffff);
  for (const z of ZONES) {
    const c = [new THREE.Vector3(z.x0, 0, z.z0), new THREE.Vector3(z.x1, 0, z.z0), new THREE.Vector3(z.x1, 0, z.z1), new THREE.Vector3(z.x0, 0, z.z1)];
    geo.quad(c[0], c[1], c[2], c[3], [[0, 0], [1, 0], [1, 1], [0, 1]], white, up);
  }
  const mat = new THREE.MeshStandardMaterial({ color: 0x6b6247, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.82, depthWrite: false });
  const water = new THREE.Mesh(geo.build(), mat);
  water.visible = false;
  water.renderOrder = 1;
  scene.add(water);

  let level = 0;
  const inZone = (x: number, z: number) => ZONES.some((r) => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);

  return {
    /** 0 = dry .. 1 = fully flooded. */
    get level() {
      return level;
    },
    update(dt: number, rain: number) {
      level = rain > RAIN_TO_FLOOD ? Math.min(1, level + RISE_PER_SEC * dt * rain) : Math.max(0, level - DRAIN_PER_SEC * dt);
      water.visible = level > 0.02;
      water.position.y = 0.01 + level * MAX_DEPTH;
    },
    /** Water depth (m) at a point. */
    depthAt(x: number, z: number) {
      return level > 0.02 && inZone(x, z) ? level * MAX_DEPTH : 0;
    },
    /** Speed multiplier at a point (1 = dry). */
    slowAt(x: number, z: number) {
      return level > 0.02 && inZone(x, z) ? 1 - (1 - SLOWEST) * level : 1;
    },
  };
}
