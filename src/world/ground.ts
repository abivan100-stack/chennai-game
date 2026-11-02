import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import { BEACH_ROAD, BEACH_X, BOUNDS, RIVER, ROAD_HALF, SETBACK, SIDEWALK_HEIGHT, roadSpans, roads, waterRects, type RoadLine } from './layout';
import { tankRect } from './temple';
import { asphaltTexture, curbTexture, pavingTexture } from './textures';

const WHITE = new THREE.Color(0xffffff);
const UP = new THREE.Vector3(0, 1, 0);
const DASH = 3; // centre-line dash length (m); gaps are the same
const ZEBRA_STRIPES = 8;
const WATER_Y = -1.0; // canal / river surface, below the banks
const BANK_DEPTH = 1.6; // stone bank faces go this far down
const PARAPET = { h: 0.6, w: 0.3 }; // low wall along the banks and the bridges' sides
type Rect = { x0: number; x1: number; z0: number; z1: number };

/** Split the rectangle `area` into cells that avoid every hole (a grid on all the edges). */
function cellsAround(area: Rect, holes: Rect[]): Rect[] {
  const xs = [...new Set([area.x0, area.x1, ...holes.flatMap((h) => [h.x0, h.x1])])].filter((x) => x >= area.x0 && x <= area.x1).sort((a, b) => a - b);
  const zs = [...new Set([area.z0, area.z1, ...holes.flatMap((h) => [h.z0, h.z1])])].filter((z) => z >= area.z0 && z <= area.z1).sort((a, b) => a - b);
  const out: Rect[] = [];
  for (let j = 0; j < zs.length - 1; j++) {
    // Merge runs of free cells along x so the slab needs few colliders.
    let run: Rect | null = null;
    for (let i = 0; i < xs.length - 1; i++) {
      const c = { x0: xs[i], x1: xs[i + 1], z0: zs[j], z1: zs[j + 1] };
      const mx = (c.x0 + c.x1) / 2;
      const mz = (c.z0 + c.z1) / 2;
      const hole = holes.some((h) => mx > h.x0 && mx < h.x1 && mz > h.z0 && mz < h.z1);
      if (hole) {
        if (run) out.push(run);
        run = null;
      } else if (run) run.x1 = c.x1;
      else run = c;
    }
    if (run) out.push(run);
  }
  return out;
}

/** A road runs along `axis` at centre-line `c`. Map (across, height, along) -> world. */
type Road = RoadLine;
const at = (r: Road, across: number, y: number, along: number) =>
  r.axis === 'z' ? new THREE.Vector3(across, y, along) : new THREE.Vector3(along, y, across);
const dir = (r: Road, across: number, along: number) => at(r, across, 0, along).normalize();

/**
 * Ground, asphalt road grid with markings, raised sidewalks with black-and-yellow curbs, and
 * invisible edge walls. 4 draw calls total; sidewalks get colliders (the 0.15 m kerb is climbable).
 */
export function createGround(scene: THREE.Scene, world: RAPIER.World) {
  // Ground: the town's floor with holes for the temple tank's pit, the canal and the river.
  // Earth stops at the beach; the sand (with its own floor collider) and the sea are world/santhome.ts.
  const water = waterRects();
  const area = { x0: BOUNDS.x0, x1: BEACH_X, z0: BOUNDS.z0, z1: BOUNDS.z1 };
  const earth = new GeoBuilder();
  for (const r of cellsAround(area, [tankRect(), ...water])) {
    const c = [new THREE.Vector3(r.x0, 0, r.z0), new THREE.Vector3(r.x1, 0, r.z0), new THREE.Vector3(r.x1, 0, r.z1), new THREE.Vector3(r.x0, 0, r.z1)];
    earth.quad(c[0], c[1], c[2], c[3], [[0, 0], [0, 0], [0, 0], [0, 0]], WHITE, UP);
  }
  // Floor slab (thick: thin colliders let fast things tunnel); the tank pit keeps its own walls.
  for (const r of cellsAround(area, water)) {
    world.createCollider(RAPIER.ColliderDesc.cuboid((r.x1 - r.x0) / 2, 0.5, (r.z1 - r.z0) / 2).setTranslation((r.x0 + r.x1) / 2, -0.5, (r.z0 + r.z1) / 2));
  }
  const ground = new THREE.Mesh(earth.build(), new THREE.MeshStandardMaterial({ color: 0x7d7262, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

  // Canal and river: water surface, stone bank faces, a parapet all round each stretch (on a
  // bridge that's its railing) and an invisible wall so nobody falls in.
  const banks = new GeoBuilder();
  const waterGeo = new GeoBuilder();
  const stone = new THREE.Color(0x8f877a);
  const parapet = new THREE.Color(0xd9d3c4);
  const STONE_UV = [[0, 0], [0, 0], [0, 0], [0, 0]];
  for (const w of water) {
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    waterGeo.quad(V(w.x0, WATER_Y, w.z0), V(w.x1, WATER_Y, w.z0), V(w.x1, WATER_Y, w.z1), V(w.x0, WATER_Y, w.z1), [[w.x0 / 8, w.z0 / 8], [w.x1 / 8, w.z0 / 8], [w.x1 / 8, w.z1 / 8], [w.x0 / 8, w.z1 / 8]], WHITE, UP);
    const edges: [THREE.Vector3, THREE.Vector3, THREE.Vector3][] = [
      [V(w.x0, 0, w.z0), V(w.x1, 0, w.z0), V(0, 0, 1)], // north edge, facing into the water (+z)
      [V(w.x1, 0, w.z1), V(w.x0, 0, w.z1), V(0, 0, -1)],
      [V(w.x0, 0, w.z1), V(w.x0, 0, w.z0), V(1, 0, 0)],
      [V(w.x1, 0, w.z0), V(w.x1, 0, w.z1), V(-1, 0, 0)],
    ];
    for (const [a, b, n] of edges) {
      // A canal stretch opens into the river: no bank or wall on that edge (the river's own
      // parapet across the canal mouth reads as a lock gate).
      const canal = w.z1 - w.z0 !== RIVER.z1 - RIVER.z0;
      if (canal && a.z === b.z && (a.z === RIVER.z0 || a.z === RIVER.z1)) continue;
      banks.quad(a, b, b.clone().setY(-BANK_DEPTH), a.clone().setY(-BANK_DEPTH), STONE_UV, stone, n);
      const len = a.distanceTo(b);
      const mid = a.clone().add(b).multiplyScalar(0.5).addScaledVector(n, -PARAPET.w / 2);
      const along = Math.abs(n.x) > 0.5 ? 'z' : 'x';
      const [sx, sz] = along === 'x' ? [len, PARAPET.w] : [PARAPET.w, len];
      banks.box(sx, PARAPET.h, sz, mid.x, PARAPET.h / 2, mid.z, parapet);
      world.createCollider(RAPIER.ColliderDesc.cuboid(sx / 2, 1, sz / 2).setTranslation(mid.x, 1, mid.z));
    }
  }
  const waterTex = new THREE.CanvasTexture(waterCanvas());
  waterTex.wrapS = waterTex.wrapT = THREE.RepeatWrapping;
  const waterMat = new THREE.MeshStandardMaterial({ map: waterTex, color: 0x5d7f6c, roughness: 0.12, metalness: 0.25 });
  const waterMesh = new THREE.Mesh(waterGeo.build(), waterMat);
  const bankMesh = new THREE.Mesh(banks.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }));
  bankMesh.castShadow = bankMesh.receiveShadow = true;
  waterMesh.receiveShadow = true;
  scene.add(waterMesh, bankMesh);

  const asphaltB = new GeoBuilder();
  const marks = new GeoBuilder();
  const paving = new GeoBuilder();
  const curbs = new GeoBuilder();
  for (const r of roads()) {
    // Asphalt strip, UVs in metres / 4.
    const a0 = r.c - ROAD_HALF;
    const a1 = r.c + ROAD_HALF;
    const corners = [at(r, a0, 0.01, r.from), at(r, a1, 0.01, r.from), at(r, a1, 0.01, r.to), at(r, a0, 0.01, r.to)];
    asphaltB.quad(corners[0], corners[1], corners[2], corners[3], corners.map((p) => [p.x / 4, p.z / 4]), WHITE, UP);
    // The Beach Road's sea side has no side streets: one unbroken promenade.
    if (r.axis === 'z' && r.c === BEACH_ROAD) sidewalk(paving, curbs, world, r, 1, r.from, r.to);

    for (const [s0, s1] of roadSpans(r)) {
      // Dashed centre line, stopping short of the zebra crossings.
      for (let z = s0 + 5; z + DASH < s1 - 5; z += DASH * 2) {
        stripe(marks, r, r.c, z + DASH / 2, 0.15, DASH);
      }
      // Zebra crossings at each end that meets a junction.
      for (const [end, inward] of [[s0, 1], [s1, -1]] as const) {
        if (end === r.from || end === r.to) continue; // road ends at the world edge, no crossing
        const centre = end + inward * 2;
        for (let i = 0; i < ZEBRA_STRIPES; i++) {
          const across = a0 + ((i + 0.5) * (ROAD_HALF * 2)) / ZEBRA_STRIPES;
          stripe(marks, r, across, centre, 0.5, 3);
        }
      }
      // Sidewalks on both sides.
      for (const side of [-1, 1]) {
        if (r.axis === 'z' && r.c === BEACH_ROAD && side === 1) continue; // done above
        sidewalk(paving, curbs, world, r, side, s0, s1);
      }
    }
  }

  const asphalt = asphaltTexture();
  const paveTex = pavingTexture();
  // Rain makes the asphalt darker and shinier (see setWet).
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: 0.95 });
  const meshes = [
    new THREE.Mesh(asphaltB.build(), roadMat),
    new THREE.Mesh(
      marks.build(),
      new THREE.MeshStandardMaterial({ color: 0xe8e8e0, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -2 }),
    ),
    new THREE.Mesh(paving.build(), new THREE.MeshStandardMaterial({ map: paveTex, roughness: 0.9 })),
    new THREE.Mesh(curbs.build(), new THREE.MeshStandardMaterial({ map: curbTexture(), roughness: 0.7 })),
  ];
  for (const m of meshes) {
    m.receiveShadow = true;
    scene.add(m);
  }

  // Physics: the floor slab is built with the ground above; here the 4 edge walls.
  const cx = (BOUNDS.x0 + BOUNDS.x1) / 2;
  const cz = (BOUNDS.z0 + BOUNDS.z1) / 2;
  const hx = (BOUNDS.x1 - BOUNDS.x0) / 2;
  const hz = (BOUNDS.z1 - BOUNDS.z0) / 2;
  let t = 0;
  const wet = {
    /** Ripple the canal and river. */
    update(dt: number) {
      t += dt;
      waterTex.offset.set(t * 0.01, t * 0.02);
    },
    setWet(f: number) {
    roadMat.roughness = 0.95 - 0.6 * f;
    roadMat.metalness = 0.25 * f;
    roadMat.color.setScalar(1 - 0.35 * f);
    },
  };
  // Edge walls (the sea side is walled off in the water by world/santhome.ts).
  for (const [x, z, wx, wz] of [
    [BOUNDS.x1, cz, 0.5, hz],
    [BOUNDS.x0, cz, 0.5, hz],
    [cx, BOUNDS.z1, hx, 0.5],
    [cx, BOUNDS.z0, hx, 0.5],
  ]) {
    world.createCollider(RAPIER.ColliderDesc.cuboid(wx, 10, wz).setTranslation(x, 10, z));
  }
  return wet;
}

/** Soft ripples for the canal and river (drawn once). */
function waterCanvas() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 70; i++) {
    g.strokeStyle = `rgba(150, 175, 160, ${0.25 + Math.random() * 0.3})`;
    g.lineWidth = 1 + Math.random() * 2;
    const x = Math.random() * 128;
    const y = Math.random() * 128;
    g.beginPath();
    g.moveTo(x, y);
    g.quadraticCurveTo(x + 6, y - 3, x + 14, y);
    g.stroke();
  }
  return c;
}

/** Flat painted rectangle on the road: centred at (across, along), size w (across) x l (along). */
function stripe(b: GeoBuilder, r: Road, across: number, along: number, w: number, l: number) {
  const y = 0.02;
  const p = [
    at(r, across - w / 2, y, along - l / 2),
    at(r, across + w / 2, y, along - l / 2),
    at(r, across + w / 2, y, along + l / 2),
    at(r, across - w / 2, y, along + l / 2),
  ];
  b.quad(p[0], p[1], p[2], p[3], [[0, 0], [1, 0], [1, 1], [0, 1]], WHITE, UP);
}

/** One raised sidewalk strip between `a` and `b` on one side of a road, plus its collider. */
function sidewalk(paving: GeoBuilder, curbs: GeoBuilder, world: RAPIER.World, r: Road, side: number, a: number, b: number) {
  const inner = r.c + side * ROAD_HALF; // curb line
  const outer = r.c + side * SETBACK; // building line
  const h = SIDEWALK_HEIGHT;

  const top = [at(r, inner, h, a), at(r, outer, h, a), at(r, outer, h, b), at(r, inner, h, b)];
  paving.quad(top[0], top[1], top[2], top[3], top.map((p) => [p.x, p.z]), WHITE, UP);

  // Curb face toward the road, striped every metre along its length.
  const curb = [at(r, inner, 0, a), at(r, inner, 0, b), at(r, inner, h, b), at(r, inner, h, a)];
  curbs.quad(curb[0], curb[1], curb[2], curb[3], [[a / 2, 0], [b / 2, 0], [b / 2, 1], [a / 2, 1]], WHITE, dir(r, -side, 0));
  // Ends at junctions.
  for (const [along, facing] of [[a, -1], [b, 1]] as const) {
    if (along === r.from || along === r.to) continue;
    const e = [at(r, inner, 0, along), at(r, outer, 0, along), at(r, outer, h, along), at(r, inner, h, along)];
    curbs.quad(e[0], e[1], e[2], e[3], [[0, 0], [1.25, 0], [1.25, 1], [0, 1]], WHITE, dir(r, 0, facing));
  }

  const c = at(r, (inner + outer) / 2, h / 2, (a + b) / 2);
  const half = at(r, Math.abs(outer - inner) / 2, h / 2, (b - a) / 2);
  world.createCollider(RAPIER.ColliderDesc.cuboid(Math.abs(half.x), half.y, Math.abs(half.z)).setTranslation(c.x, c.y, c.z));
}
