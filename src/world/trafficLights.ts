import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GeoBuilder } from './geo.ts';
import { ROAD_HALF, SIDEWALK_HEIGHT } from './layout.ts';

// ---------------------------------------------------------------------------------------------
// Pure logic (no three / DOM): the signal cycle. scripts/check.ts can import this under Node.
// ---------------------------------------------------------------------------------------------

export type Axis = 'ns' | 'ew'; // ns = traffic moving along z (north-south roads), ew = along x
export type Light = 'green' | 'amber' | 'red';
export const SIGNAL = { green: 14, amber: 3, allRed: 1.5 }; // seconds

/**
 * ns green -> ns amber -> all red -> ew green -> ew amber -> all red, repeating.
 * One cycle drives all four Mada Street junctions (a coordinated corridor): simple to read for the
 * player, and traffic released from one junction meets the same phase at the next.
 */
export class SignalCycle {
  t: number; // seconds into the cycle

  constructor(offset = 0) {
    this.t = 0;
    this.update(offset);
  }

  get length() {
    return 2 * (SIGNAL.green + SIGNAL.amber + SIGNAL.allRed);
  }

  update(dt: number) {
    const L = this.length;
    this.t = (((this.t + dt) % L) + L) % L; // also handles negative offsets
  }

  state(axis: Axis): Light {
    const half = this.length / 2;
    // ew runs the same pattern half a cycle later.
    const t = axis === 'ns' ? this.t : (this.t + half) % this.length;
    if (t < SIGNAL.green) return 'green';
    if (t < SIGNAL.green + SIGNAL.amber) return 'amber';
    return 'red';
  }
}

// ---------------------------------------------------------------------------------------------
// World: posts, lamps, stop lines, colliders, and queries for the traffic AI / fines.
// ---------------------------------------------------------------------------------------------

const JUNCTIONS = [
  { x: -25, z: -25 },
  { x: 25, z: -25 },
  { x: 25, z: 25 },
  { x: -25, z: 25 },
];
/**
 * Junction centre -> stop line. The zebra crossings (ground.ts) cover 5.5..8.5 m from the centre,
 * so the stop line sits ~1.5 m before them; vehicles stopping here leave the zebra clear.
 */
export const STOP_DIST = 10;
const STOP_LINE_W = 0.4;
const POST_ALONG = 8; // post stands beside the far edge of the zebra (corners hold street-name posts)
const POST_SETBACK = 0.6; // from the kerb
const POLE_H = 3.4;
const POLE_R = 0.07;
const HEAD_W = 0.36;
const HEAD_H = 1.0;
const HEAD_D = 0.24;
const LAMP_R = 0.12;
const LAMP_STEP = 0.3; // vertical spacing between lamps
const LAMP_ON = 2.5; // emissiveIntensity
const BASE_STRIPES = 4; // yellow-black bands at the pole foot, 0.2 m each

const LIGHTS: Light[] = ['red', 'amber', 'green'];
const LAMP_COLOR: Record<Light, number> = { red: 0xff2a1a, amber: 0xffa000, green: 0x20ff60 };

/** One approach per travel direction into each junction (unit dx, dz). */
const APPROACHES = [
  { dx: 1, dz: 0 },
  { dx: -1, dz: 0 },
  { dx: 0, dz: 1 },
  { dx: 0, dz: -1 },
];

export function createTrafficLights(scene: THREE.Scene, world: RAPIER.World) {
  const cycle = new SignalCycle();
  const posts = new GeoBuilder();
  const lines = new GeoBuilder();
  const lamps: Record<Axis, Record<Light, GeoBuilder>> = {
    ns: { red: new GeoBuilder(), amber: new GeoBuilder(), green: new GeoBuilder() },
    ew: { red: new GeoBuilder(), amber: new GeoBuilder(), green: new GeoBuilder() },
  };
  const dark = new THREE.Color(0x1c1e20);
  const yellow = new THREE.Color(0xf2c200);
  const white = new THREE.Color(0xf0f0ea);
  const pole = new THREE.CylinderGeometry(POLE_R, POLE_R, POLE_H, 8).translate(0, POLE_H / 2, 0);
  const band = new THREE.CylinderGeometry(POLE_R + 0.01, POLE_R + 0.01, 0.2, 8);
  const lens = new THREE.CircleGeometry(LAMP_R, 12);
  const m = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  const y0 = SIDEWALK_HEIGHT;
  const headY = y0 + POLE_H + HEAD_H / 2 - 0.1;

  for (const j of JUNCTIONS) {
    for (const a of APPROACHES) {
      const axis: Axis = a.dx !== 0 ? 'ew' : 'ns';
      // Left of the travel direction (+y up, left-hand traffic): (dz, -dx).
      const lx = a.dz;
      const lz = -a.dx;
      // Post on the left sidewalk, before the junction.
      const across = ROAD_HALF + POST_SETBACK;
      const px = j.x - a.dx * POST_ALONG + lx * across;
      const pz = j.z - a.dz * POST_ALONG + lz * across;
      const face = Math.atan2(-a.dx, -a.dz); // head's +z looks back at the approaching drivers

      posts.add(pole, m.makeTranslation(px, y0, pz), dark);
      for (let i = 0; i < BASE_STRIPES; i++) {
        posts.add(band, m.makeTranslation(px, y0 + 0.1 + i * 0.2, pz), i % 2 ? dark : yellow);
      }
      posts.box(HEAD_W, HEAD_H, HEAD_D, px, headY, pz, dark, face);
      // Visor plate behind the lamps, a touch wider: a yellow rim around the head, easy to spot.
      posts.box(HEAD_W + 0.14, HEAD_H + 0.14, 0.02, px - Math.sin(face) * 0.01, headY, pz - Math.cos(face) * 0.01, yellow, face);
      LIGHTS.forEach((light, i) => {
        m.makeRotationY(face).setPosition(
          px + Math.sin(face) * (HEAD_D / 2 + 0.003),
          headY + (1 - i) * LAMP_STEP,
          pz + Math.cos(face) * (HEAD_D / 2 + 0.003),
        );
        lamps[axis][light].add(lens, m, white);
      });
      world.createCollider(RAPIER.ColliderDesc.cylinder(POLE_H / 2, POLE_R + 0.03).setTranslation(px, y0 + POLE_H / 2, pz));

      // Stop line across the left lane (centre line -> left kerb), STOP_DIST before the centre.
      const sx = j.x - a.dx * STOP_DIST;
      const sz = j.z - a.dz * STOP_DIST;
      const hw = STOP_LINE_W / 2;
      const y = 0.012;
      // Corners: along the travel dir ±hw, across from the centre line (0) to the kerb (ROAD_HALF).
      const c = (al: number, ac: number) => new THREE.Vector3(sx + a.dx * al + lx * ac, y, sz + a.dz * al + lz * ac);
      lines.quad(c(-hw, 0), c(hw, 0), c(hw, ROAD_HALF), c(-hw, ROAD_HALF), [[0, 0], [1, 0], [1, 1], [0, 1]], white, up);
    }
  }

  const postMesh = new THREE.Mesh(posts.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3 }));
  postMesh.castShadow = postMesh.receiveShadow = true;
  const lineMesh = new THREE.Mesh(
    lines.build(),
    new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }),
  );
  lineMesh.receiveShadow = true;
  scene.add(postMesh, lineMesh);

  // 6 shared lamp materials: switching a light is one emissiveIntensity write for 8 heads.
  const mats = {} as Record<Axis, Record<Light, THREE.MeshStandardMaterial>>;
  for (const axis of ['ns', 'ew'] as const) {
    mats[axis] = {} as Record<Light, THREE.MeshStandardMaterial>;
    for (const light of LIGHTS) {
      const col = new THREE.Color(LAMP_COLOR[light]);
      const mat = new THREE.MeshStandardMaterial({
        color: col.clone().multiplyScalar(0.15), emissive: col, emissiveIntensity: 0, roughness: 0.3,
      });
      mats[axis][light] = mat;
      scene.add(new THREE.Mesh(lamps[axis][light].build(), mat));
    }
  }

  const apply = () => {
    for (const axis of ['ns', 'ew'] as const) {
      const on = cycle.state(axis);
      for (const light of LIGHTS) mats[axis][light].emissiveIntensity = light === on ? LAMP_ON : 0;
    }
  };
  apply();

  // Reused result: valid until the next ahead() call (no per-frame allocation in the traffic loop).
  const hit = { light: 'red' as Light, distToStop: 0 };

  return {
    cycle,
    junctions: JUNCTIONS,
    update(dt: number) {
      cycle.update(dt);
      apply();
    },
    /** Nearest signal stop line ahead within lookAhead. The returned object is reused per call. */
    ahead(x: number, z: number, dx: number, dz: number, lookAhead: number): { light: Light; distToStop: number } | null {
      const ew = Math.abs(dx) > Math.abs(dz);
      const sign = ew ? Math.sign(dx) : Math.sign(dz);
      if (sign === 0) return null;
      let best = Infinity;
      for (const j of JUNCTIONS) {
        // Must be on this junction's road (within the 10 m carriageway).
        if (Math.abs(ew ? z - j.z : x - j.x) >= ROAD_HALF) continue;
        const pos = ew ? x : z;
        const centre = ew ? j.x : j.z;
        const d = sign > 0 ? centre - STOP_DIST - pos : pos - (centre + STOP_DIST);
        if (d >= 0 && d <= lookAhead && d < best) best = d;
      }
      if (best === Infinity) return null;
      hit.light = cycle.state(ew ? 'ew' : 'ns');
      hit.distToStop = best;
      return hit;
    },
    /** Index of the junction box containing the point, or -1. */
    inJunction(x: number, z: number) {
      for (let i = 0; i < JUNCTIONS.length; i++) {
        if (Math.abs(x - JUNCTIONS[i].x) < ROAD_HALF && Math.abs(z - JUNCTIONS[i].z) < ROAD_HALF) return i;
      }
      return -1;
    },
  };
}
