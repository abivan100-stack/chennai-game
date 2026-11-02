import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { createKit, frame, type SignDef } from './kit';
import { CHEPAUK_LOT, PRESIDENCY_LOT } from './layout';
import { sandY } from './santhome';

/**
 * Chepauk and the Marina, stylised: the M.A. Chidambaram cricket stadium (an oval of tiered
 * stands, wavy white roof panels, four floodlight towers that light up on match nights, the
 * pitch, a gate on the Beach Road), Presidency College (red Indo-Saracenic block with domes and
 * a clock tower) and the Marina Beach entrance arch on the promenade. 6 draw calls (2 kits).
 */

const SIGNS: SignDef[] = [
  ['எம்.ஏ. சிதம்பரம் மைதானம்', 'M.A. CHIDAMBARAM STADIUM · CHEPAUK', '#f9c80e', '#0b3d91'],
  ['மாநிலக் கல்லூரி', 'PRESIDENCY COLLEGE · EST. 1840', '#7a1f1f', '#f6e3c3'],
  ['மெரினா கடற்கரை', 'MARINA BEACH', '#0d3b66', '#ffffff'],
];
export const MATCH_HOURS: [number, number] = [19, 23];
const C = (hex: number) => new THREE.Color(hex);
const WHITE = C(0xf6f6f2);
const CONCRETE = C(0xd6d1c4);
const SEATS = [C(0xf9c80e), C(0x0b3d91), C(0xf9c80e), C(0xe8e8e8)];
const GRASS = C(0x4c9a2a);
const PITCH = C(0xc8a165);
const BRICK = C(0xa8432a);
const TRIM = C(0xf3ead8);
const STEEL = C(0xb0b6bb);

export function createChepauk(scene: THREE.Scene, world: RAPIER.World) {
  const k = createKit(world, SIGNS);
  const lights = createKit(world, SIGNS); // floodlights: only lit on match nights
  const { box, board, shape } = k;

  // ---- Stadium: an oval of rising stands round the ground ----
  {
    const f = frame(CHEPAUK_LOT());
    const cv = f.d / 2;
    const A = f.w / 2 - 2; // half-length along the frontage (u)
    const B = f.d / 2 - 1.5; // half-width going in (v)
    // Ground: grass oval, the square and the pitch.
    shape(f, new THREE.CylinderGeometry(1, 1, 0.05, 40).scale(A * 0.66, 1, B * 0.6), 0, 0.03, cv, GRASS);
    box(f, 3, 0.03, 20, 0, 0.06, cv, PITCH, false, Math.PI / 2);
    for (const du of [-10, 10]) for (const s of [-0.12, 0, 0.12]) box(f, 0.05, 0.7, 0.05, du, 0, cv + s, WHITE, false);
    // Stands: three tiers stepping up and out, in segments round the oval.
    const N = 48;
    for (let i = 0; i < N; i++) {
      const a0 = (i / N) * Math.PI * 2;
      const a1 = ((i + 1) / N) * Math.PI * 2;
      for (let t = 0; t < 3; t++) {
        const r = 0.7 + t * 0.1; // fraction of the outer ellipse
        const pa = [Math.cos(a0) * A * r, Math.sin(a0) * B * r];
        const pb = [Math.cos(a1) * A * r, Math.sin(a1) * B * r];
        const mu = (pa[0] + pb[0]) / 2;
        const mv = (pa[1] + pb[1]) / 2;
        const len = Math.hypot(pb[0] - pa[0], pb[1] - pa[1]) + 0.3;
        const turn = -Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
        const h = 3 + t * 3.5;
        const depth = (B * 0.1) + 0.6;
        const gate = t === 0 && i % 12 === 0; // gaps for the entrances
        if (!gate) box(f, len, h, depth, mu, 0, cv + mv, t === 2 ? CONCRETE : SEATS[(i + t) % SEATS.length], t === 2, turn);
        if (t === 2) {
          // Wavy roof panels over the top tier, tilted up and out.
          const out = Math.hypot(mu, mv) || 1;
          const g = new THREE.BoxGeometry(len + 0.2, 0.25, 6).rotateX(-0.22 + (i % 2) * 0.12).translate(0, 0, 2.5);
          k.shape(f, g, mu + (mu / out) * 0.5, h + 2.5 + (i % 2) * 0.8, cv + mv + (mv / out) * 0.5, WHITE, turn + Math.PI);
          if (i % 2 === 0) box(f, 0.3, 2.5, 0.3, mu, h, cv + mv, STEEL, false);
        }
      }
    }
    // Floodlight towers at four corners, with lamp banks that glow on match nights.
    for (const [su, sv] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const u = su * A * 0.92;
      const v = cv + sv * B * 0.92;
      box(f, 0.8, 34, 0.8, u, 0, v, STEEL);
      lights.box(f, 5, 3.2, 0.6, u, 33, v, C(0x444444), false, sv * su * 0.6);
      for (let r = 0; r < 3; r++) for (let c = 0; c < 5; c++) lights.shape(f, new THREE.BoxGeometry(0.75, 0.75, 0.2), u - 2 + c, 33.3 + r * 1, v - sv * 0.35, C(0xfff7d6), sv * su * 0.6, lights.bulbs);
    }
    board(f, 0, 0, 7, cv - B * 0.98, 16, 2);
  }

  // ---- Presidency College: red brick, white arches, domes and a clock tower ----
  {
    const f = frame(PRESIDENCY_LOT());
    const bv = 22;
    box(f, f.w - 2, 0.03, 14, 0, 0, 8, GRASS, false);
    box(f, 34, 9, 11, 0, 0, bv, BRICK);
    box(f, 34.4, 0.5, 11.4, 0, 9, bv, TRIM, false);
    for (const y of [1.2, 5.6]) for (let i = 0; i < 11; i++) {
      const u = -15 + i * 3;
      box(f, 1.4, 2.6, 0.1, u, y, bv - 5.55, TRIM, false);
      shape(f, new THREE.CylinderGeometry(0.7, 0.7, 0.1, 10, 1, false, 0, Math.PI).rotateZ(Math.PI / 2).rotateY(Math.PI / 2), u, y + 2.6, bv - 5.56, TRIM);
    }
    // Clock tower with a dome, and domed turrets at the corners.
    box(f, 5, 17, 5, 0, 0, bv - 4, BRICK);
    shape(f, new THREE.CylinderGeometry(1, 1, 0.1, 20).rotateX(Math.PI / 2), 0, 14, bv - 6.6, WHITE);
    shape(f, new THREE.SphereGeometry(2.8, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0, 17, bv - 4, TRIM);
    shape(f, new THREE.ConeGeometry(0.3, 1.4, 8), 0, 20.4, bv - 4, C(0xd9a520));
    for (const s of [-1, 1]) {
      box(f, 3, 12, 3, s * 16.5, 0, bv - 4.5, BRICK);
      shape(f, new THREE.SphereGeometry(1.7, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), s * 16.5, 12, bv - 4.5, TRIM);
    }
    box(f, 6, 0.5, 3, 0, 0, bv - 7.5, CONCRETE, false);
    board(f, 1, 0, 1.2, 0.4, 12, 1.4);
    for (const s of [-1, 1]) box(f, (f.w - 8) / 2, 1.2, 0.3, s * (4 + (f.w - 8) / 4), 0, 0.2, TRIM);
  }

  // ---- Marina Beach entrance arch on the promenade ----
  {
    const f = frame({ x0: 136, x1: 140, z0: -262, z1: -248, front: 'w' });
    const y = sandY(138);
    for (const s of [-1, 1]) box(f, 0.8, 5, 0.8, s * 5.5, y, 1, C(0x0d3b66));
    box(f, 12, 0.9, 1, 0, y + 5, 1, C(0x0d3b66), false);
    board(f, 2, 0, y + 5.9, 0.6, 11, 1.4);
  }

  const setNight = k.build(scene);
  const setLights = lights.build(scene);
  return {
    update(hour: number, night: number) {
      setNight(night);
      setLights(hour >= MATCH_HOURS[0] && hour < MATCH_HOURS[1] ? 1.2 : 0);
    },
    matchOn: (hour: number) => hour >= MATCH_HOURS[0] && hour < MATCH_HOURS[1],
  };
}
