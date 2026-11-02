import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import { BEACH_ROAD, BEACH_X, BOUNDS, ROAD_HALF, SETBACK, SIDEWALK_HEIGHT, roadSpans, roads, type RoadLine } from './layout';
import { tankRect } from './temple';
import { asphaltTexture, curbTexture, pavingTexture } from './textures';

const WHITE = new THREE.Color(0xffffff);
const UP = new THREE.Vector3(0, 1, 0);
const DASH = 3; // centre-line dash length (m); gaps are the same
const ZEBRA_STRIPES = 8;

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
  // Ground: four rectangles around the temple tank's pit.
  const t = tankRect();
  const earth = new GeoBuilder();
  const rect = (x0: number, x1: number, z0: number, z1: number) => {
    const c = [new THREE.Vector3(x0, 0, z0), new THREE.Vector3(x1, 0, z0), new THREE.Vector3(x1, 0, z1), new THREE.Vector3(x0, 0, z1)];
    earth.quad(c[0], c[1], c[2], c[3], [[0, 0], [0, 0], [0, 0], [0, 0]], WHITE, UP);
  };
  // Earth stops at the beach; the sand (with its own floor collider) and the sea are world/santhome.ts.
  const { x0, z0, z1 } = BOUNDS;
  rect(x0, BEACH_X, z0, t.z0);
  rect(x0, BEACH_X, t.z1, z1);
  rect(x0, t.x0, t.z0, t.z1);
  rect(t.x1, BEACH_X, t.z0, t.z1);
  const ground = new THREE.Mesh(earth.build(), new THREE.MeshStandardMaterial({ color: 0x7d7262, roughness: 1 }));
  ground.receiveShadow = true;
  scene.add(ground);

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

  // Physics: thick ground slab (thin colliders let fast things tunnel) + 4 edge walls.
  const cx = (BOUNDS.x0 + BOUNDS.x1) / 2;
  const cz = (BOUNDS.z0 + BOUNDS.z1) / 2;
  const hx = (BOUNDS.x1 - BOUNDS.x0) / 2;
  const hz = (BOUNDS.z1 - BOUNDS.z0) / 2;
  const gx = (BOUNDS.x0 + BEACH_X) / 2; // the town's floor slab stops where the beach starts
  world.createCollider(RAPIER.ColliderDesc.cuboid((BEACH_X - BOUNDS.x0) / 2, 0.5, hz).setTranslation(gx, -0.5, cz));
  const wet = { setWet(f: number) {
    roadMat.roughness = 0.95 - 0.6 * f;
    roadMat.metalness = 0.25 * f;
    roadMat.color.setScalar(1 - 0.35 * f);
  } };
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
