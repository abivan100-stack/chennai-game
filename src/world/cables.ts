import * as THREE from 'three';

/**
 * Overhead cables (phone, cable TV, the odd power line): sagging wires between neighbouring street
 * poles along each kerb, bundles of 1-3, and some looping across the road to a pole on the other
 * side. Thin lines (LineSegments), one draw call per TILE, no shadows: nearly free, and the most
 * "Chennai" thing a street can have overhead.
 */
const TILE = 60;
const SEGS = 8; // per wire
const ALONG_MAX = 18; // m: neighbouring poles further apart than this aren't wired
const CROSS_CHANCE = 0.3;
const CROSS: [number, number] = [11, 26]; // m: span of a wire across the road
const BASE_H = 5.0; // m above the pole foot
const WIRE_GAP = 0.32;
const COLOUR = 0x1a1a1a;
/** Wires are a pixel thin: past this they can't be seen, so their tiles aren't drawn. */
const DRAW_DIST = 60;

export function overheadCables(poles: THREE.Matrix4[]) {
  let seed = 97;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pts = poles.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
  const tiles = new Map<string, number[]>();
  const a = new THREE.Vector3();

  const wire = (p: THREE.Vector3, q: THREE.Vector3, hp: number, hq: number, sag: number) => {
    const key = `${Math.floor((p.x + q.x) / 2 / TILE)},${Math.floor((p.z + q.z) / 2 / TILE)}`;
    let out = tiles.get(key);
    if (!out) tiles.set(key, (out = []));
    let px = p.x, py = p.y + hp, pz = p.z;
    for (let k = 1; k <= SEGS; k++) {
      const t = k / SEGS;
      a.lerpVectors(p, q, t);
      const y = p.y + hp + (q.y + hq - p.y - hp) * t - sag * 4 * t * (1 - t); // parabola: close enough to a catenary
      out.push(px, py, pz, a.x, y, a.z);
      px = a.x; py = y; pz = a.z;
    }
  };

  // Along the kerb: poles are stored in order along each side of each road.
  for (let i = 0; i + 1 < pts.length; i++) {
    const d = pts[i].distanceTo(pts[i + 1]);
    if (d < 4 || d > ALONG_MAX) continue;
    const n = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k++) wire(pts[i], pts[i + 1], BASE_H + k * WIRE_GAP, BASE_H + k * WIRE_GAP + (rand() - 0.5) * 0.2, (0.2 + rand() * 0.35) * (d / 14));
  }

  // Across the road: a coarse grid to find a pole on the other side.
  const cell = 30;
  const grid = new Map<string, number[]>();
  pts.forEach((p, i) => {
    const key = `${Math.floor(p.x / cell)},${Math.floor(p.z / cell)}`;
    (grid.get(key) ?? grid.set(key, []).get(key)!).push(i);
  });
  pts.forEach((p, i) => {
    if (rand() > CROSS_CHANCE) return;
    const gx = Math.floor(p.x / cell);
    const gz = Math.floor(p.z / cell);
    const near: number[] = [];
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      for (const j of grid.get(`${gx + dx},${gz + dz}`) ?? []) {
        if (Math.abs(j - i) <= 1) continue; // its own kerb
        const d = p.distanceTo(pts[j]);
        if (d >= CROSS[0] && d <= CROSS[1]) near.push(j);
      }
    }
    if (!near.length) return;
    const q = pts[near[Math.floor(rand() * near.length)]];
    const d = p.distanceTo(q);
    const n = 1 + Math.floor(rand() * 2);
    for (let k = 0; k < n; k++) wire(p, q, BASE_H + 0.5 + k * WIRE_GAP, BASE_H + 0.3 + k * WIRE_GAP, (0.4 + rand() * 0.5) * (d / 15));
  });

  const group = new THREE.Group();
  group.name = 'cables';
  const mat = new THREE.LineBasicMaterial({ color: COLOUR });
  for (const verts of tiles.values()) {
    const g = new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    g.computeBoundingSphere();
    group.add(new THREE.LineSegments(g, mat));
  }
  const reach = DRAW_DIST + TILE * 0.7;
  return {
    group,
    /** Show only the tiles near the camera (call a few times a second). */
    update(eye: THREE.Vector3) {
      for (const l of group.children) {
        const c = (l as THREE.LineSegments).geometry.boundingSphere!.center;
        l.visible = (c.x - eye.x) ** 2 + (c.z - eye.z) ** 2 < reach * reach;
      }
    },
  };
}
