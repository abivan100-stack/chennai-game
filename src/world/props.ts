import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder } from './geo';
import { ROAD_HALF, SIDEWALK_HEIGHT, X_LINES, X_ROADS, Z_LINES, Z_ROADS, roadSpans, roads } from './layout';
import { glowTexture, streetSignTextures } from './textures';

const CURB_OFFSET = 0.3; // props stand this far onto the sidewalk from the curb
const LAMP_SPACING = 14; // close enough that the light pools join up along the street at night
const TREE_SPACING = 13;
const LAMP_HEIGHT = 6.5;
/** Backdrop groves past the edges: [x0, x1, z0, z1, count] (north, south, and beyond the canal). */
const OUTSKIRT_GROVES: [number, number, number, number, number][] = [
  [-100, 130, -260, -110, 70],
  [-100, 130, 230, 380, 70],
  [-400, -130, -300, 400, 90],
];

interface TreeKind {
  weight: number;
  trunk: THREE.BufferGeometry;
  canopy: THREE.BufferGeometry;
  trunkR: number;
  colour: (out: THREE.Color, r: number) => THREE.Color;
}

/** Low-poly Chennai street trees, all standing at the origin (y = 0 at the root). */
function treeKinds(): TreeKind[] {
  const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  const ico = (r: number, sx: number, sy: number, sz: number, x: number, y: number, z: number) => new THREE.IcosahedronGeometry(r, 1).scale(sx, sy, sz).translate(x, y, z);
  const cyl = (r0: number, r1: number, h: number, x = 0, z = 0, tilt = 0) => {
    const g = new THREE.CylinderGeometry(r0, r1, h, 6).translate(0, h / 2, 0);
    if (tilt) g.rotateZ(tilt);
    return g.translate(x, 0, z);
  };
  return [
    { // neem: round canopy
      weight: 0.38, trunkR: 0.22,
      trunk: merge([cyl(0.14, 0.22, 3.2)]),
      canopy: merge([ico(2, 1, 0.75, 1, 0, 4, 0)]),
      colour: (c, r) => c.setHSL(0.25 + r * 0.07, 0.45, 0.28 + r * 0.1),
    },
    { // rain tree: wide flat umbrella on a forked trunk
      weight: 0.2, trunkR: 0.3,
      trunk: merge([cyl(0.2, 0.3, 3.6), cyl(0.1, 0.16, 2.2, 0.5, 0, -0.5).translate(0, 3.0, 0), cyl(0.1, 0.16, 2.2, -0.5, 0, 0.5).translate(0, 3.0, 0)]),
      canopy: merge([ico(2, 2.1, 0.5, 2.1, 0, 5.4, 0), ico(1.6, 1.2, 0.55, 1.2, 1.6, 5.8, 0.8)]),
      colour: (c, r) => c.setHSL(0.22 + r * 0.05, 0.5, 0.25 + r * 0.08),
    },
    { // gulmohar: umbrella crown in flame red-orange
      weight: 0.17, trunkR: 0.2,
      trunk: merge([cyl(0.12, 0.2, 3.4), cyl(0.08, 0.12, 1.8, 0.4, 0, -0.6).translate(0, 2.8, 0)]),
      canopy: merge([ico(2, 1.6, 0.55, 1.6, 0, 4.6, 0)]),
      colour: (c, r) => c.setHSL(0.02 + r * 0.04, 0.8, 0.45 + r * 0.08),
    },
    { // ashoka (polyalthia): tall narrow column of drooping leaves
      weight: 0.18, trunkR: 0.12,
      trunk: merge([cyl(0.08, 0.12, 1.2)]),
      canopy: merge([new THREE.ConeGeometry(0.95, 7.5, 7).translate(0, 1 + 3.75, 0), new THREE.ConeGeometry(0.75, 3, 7).translate(0, 7.5, 0)]),
      colour: (c, r) => c.setHSL(0.3 + r * 0.04, 0.55, 0.18 + r * 0.06),
    },
    { // banyan: huge, with aerial roots hanging from the branches
      weight: 0.07, trunkR: 0.6,
      trunk: merge([
        cyl(0.45, 0.65, 4.5),
        ...[[2.2, 0.8], [-1.8, 1.6], [1.2, -2.2], [-1.6, -1.4], [2.6, -1.0]].map(([x, z]) => cyl(0.06, 0.08, 5, x, z)),
      ]),
      canopy: merge([ico(2.4, 1.7, 0.6, 1.7, 0, 6.2, 0), ico(2, 1.2, 0.55, 1.2, 2.4, 6.0, 1.2), ico(2, 1.2, 0.55, 1.2, -2.2, 6.1, -1.4)]),
      colour: (c, r) => c.setHSL(0.27 + r * 0.04, 0.45, 0.22 + r * 0.06),
    },
  ];
}

function pickKind(kinds: TreeKind[], r: number) {
  for (let i = 0; i < kinds.length; i++) {
    if ((r -= kinds[i].weight) < 0) return i;
  }
  return 0;
}

function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/**
 * Street lamps (glow + light pool at night) and a mix of street trees along every sidewalk
 * (neem, rain tree, gulmohar, ashoka, banyan), plus groves past the town's edges.
 * Instanced: 3 draw calls for the lamps, 2 per tree kind. Lamps and street trees get colliders.
 */
export function createProps(scene: THREE.Scene, world: RAPIER.World) {
  const rand = seeded(11);
  const lamps: THREE.Matrix4[] = [];
  const trees: THREE.Matrix4[] = [];
  const y0 = SIDEWALK_HEIGHT;

  for (const r of roads()) {
    const { c, axis } = r;
    const offEnd = (s: number) => s < r.from + 3 || s > r.to - 3; // keep clear of the world edge
    {
      for (const [a, b] of roadSpans(r)) {
        for (const side of [-1, 1]) {
          const across = c + side * (ROAD_HALF + CURB_OFFSET);
          const place = (along: number) => (axis === 'z' ? new THREE.Vector3(across, y0, along) : new THREE.Vector3(along, y0, across));
          // Lamp arm points over the road: local +x -> towards the road.
          const toRoad = axis === 'z' ? (side > 0 ? Math.PI : 0) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
          const lampAlongs: number[] = [];
          const start = a + (side > 0 ? 6 : 6 + LAMP_SPACING / 2);
          for (let s = start; s < b - 4; s += LAMP_SPACING) {
            if (offEnd(s)) continue;
            lampAlongs.push(s);
            lamps.push(new THREE.Matrix4().makeRotationY(toRoad).setPosition(place(s)));
          }
          for (let s = a + 4 + rand() * 4; s < b - 4; s += TREE_SPACING * (0.7 + rand() * 0.6)) {
            if (lampAlongs.some((l) => Math.abs(l - s) < 3) || offEnd(s)) continue;
            const scale = 0.8 + rand() * 0.5;
            trees.push(new THREE.Matrix4().makeRotationY(rand() * Math.PI * 2).scale(new THREE.Vector3(scale, scale, scale)).setPosition(place(s)));
          }
        }
      }
    }
  }

  // --- Lamps: pole + arm (grey), head (glows at night), light pool on the ground.
  const poleGeo = mergeGeometries([
    new THREE.CylinderGeometry(0.06, 0.09, LAMP_HEIGHT, 6).translate(0, LAMP_HEIGHT / 2, 0),
    new THREE.BoxGeometry(1.3, 0.06, 0.06).translate(0.6, LAMP_HEIGHT - 0.1, 0),
  ]);
  const headGeo = new THREE.BoxGeometry(0.5, 0.1, 0.22).translate(1.2, LAMP_HEIGHT - 0.18, 0);
  const poolGeo = new THREE.PlaneGeometry(10, 10).rotateX(-Math.PI / 2).translate(1.2, 0.03, 0);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffd28a, emissiveIntensity: 0 });
  const poolMat = new THREE.MeshBasicMaterial({
    map: glowTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffc070,
  });
  const poles = instanced(poleGeo, new THREE.MeshStandardMaterial({ color: 0x5b6066, roughness: 0.6, metalness: 0.4 }), lamps);
  const heads = instanced(headGeo, headMat, lamps);
  const pools = instanced(poolGeo, poolMat, lamps);
  poles.castShadow = true;
  pools.renderOrder = 1;

  // --- Trees: several Chennai street trees, each kind a trunk + canopy instanced pair.
  // Street trees on the sidewalks, plus a backdrop of trees past the town's edges.
  const kinds = treeKinds();
  const placed: { kind: number; m: THREE.Matrix4 }[] = trees.map((m) => ({ kind: pickKind(kinds, rand()), m }));
  for (const [x0, x1, z0, z1, n] of OUTSKIRT_GROVES) {
    for (let i = 0; i < n; i++) {
      const s = 0.9 + rand() * 0.6;
      const m = new THREE.Matrix4().makeRotationY(rand() * Math.PI * 2).scale(new THREE.Vector3(s, s, s)).setPosition(x0 + rand() * (x1 - x0), 0, z0 + rand() * (z1 - z0));
      placed.push({ kind: pickKind(kinds, rand()), m });
    }
  }
  const treeMeshes: THREE.Object3D[] = [];
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
  const leaf = new THREE.Color();
  kinds.forEach((k, ki) => {
    const mine = placed.filter((t) => t.kind === ki).map((t) => t.m);
    if (!mine.length) return;
    const trunk = instanced(k.trunk, trunkMat, mine);
    const canopy = instanced(k.canopy, new THREE.MeshStandardMaterial({ roughness: 0.9, flatShading: true }), mine);
    mine.forEach((_, i) => canopy.setColorAt(i, k.colour(leaf, rand())));
    trunk.castShadow = canopy.castShadow = true;
    treeMeshes.push(trunk, canopy);
  });

  scene.add(poles, heads, pools, ...treeMeshes, streetSigns(world));

  // --- Colliders: lamp poles and tree trunks.
  const p = new THREE.Vector3();
  for (const m of lamps) {
    p.setFromMatrixPosition(m);
    world.createCollider(RAPIER.ColliderDesc.cylinder(LAMP_HEIGHT / 2, 0.1).setTranslation(p.x, p.y + LAMP_HEIGHT / 2, p.z));
  }
  for (const t of placed.slice(0, trees.length)) { // street trees only: the backdrop is out of reach
    p.setFromMatrixPosition(t.m);
    world.createCollider(RAPIER.ColliderDesc.cylinder(1.5, kinds[t.kind].trunkR).setTranslation(p.x, p.y + 1.5, p.z));
  }

  return {
    lampCount: lamps.length,
    treeCount: trees.length,
    /** Tree positions (for the map). */
    treePoints: trees.map((m) => ({ x: m.elements[12], z: m.elements[14] })),
    setNight(f: number) {
      headMat.emissiveIntensity = f * 4;
      poolMat.opacity = f * 0.85;
      pools.visible = f > 0.01;
    },
  };
}

/**
 * Street-name signs: a post at two opposite corners of every junction, carrying one board per
 * street (each board runs parallel to the street it names). Two draw calls in total.
 */
function streetSigns(world: RAPIER.World) {
  const names = [...X_LINES.map((c) => X_ROADS[c]), ...Z_LINES.map((c) => Z_ROADS[c])];
  const tex = streetSignTextures(names);
  const posts = new GeoBuilder();
  const boards = new GeoBuilder();
  const grey = new THREE.Color(0x4a4f55);
  const white = new THREE.Color(0xffffff);
  const BOARD_W = 1.12;
  const BOARD_H = 0.28;
  const POLE_H = 3.1;
  const pole = new THREE.CylinderGeometry(0.04, 0.05, POLE_H, 6).translate(0, POLE_H / 2, 0);

  /** Two-sided board centred at p, running along `along` (unit x or z). */
  const board = (p: THREE.Vector3, along: 'x' | 'z', row: number) => {
    const [v0, v1] = tex.rowV(row);
    const dx = along === 'x' ? BOARD_W / 2 : 0;
    const dz = along === 'z' ? BOARD_W / 2 : 0;
    const a = new THREE.Vector3(p.x - dx, p.y - BOARD_H / 2, p.z - dz);
    const b = new THREE.Vector3(p.x + dx, p.y - BOARD_H / 2, p.z + dz);
    const c = new THREE.Vector3(p.x + dx, p.y + BOARD_H / 2, p.z + dz);
    const d = new THREE.Vector3(p.x - dx, p.y + BOARD_H / 2, p.z - dz);
    const n = along === 'x' ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(-1, 0, 0);
    boards.quad(a, b, c, d, [[0, v0], [1, v0], [1, v1], [0, v1]], white, n);
    boards.quad(b, a, d, c, [[0, v0], [1, v0], [1, v1], [0, v1]], white, n.clone().negate()); // readable from behind too
  };

  const corner = ROAD_HALF + 0.55;
  for (const [xi, x] of X_LINES.entries()) {
    for (const [zi, z] of Z_LINES.entries()) {
      for (const [sx, sz] of [[1, -1], [-1, 1]]) {
        const p = new THREE.Vector3(x + sx * corner, SIDEWALK_HEIGHT, z + sz * corner);
        posts.add(pole, new THREE.Matrix4().setPosition(p), grey);
        board(new THREE.Vector3(p.x, p.y + POLE_H - 0.55, p.z), 'z', xi); // names the north-south street
        board(new THREE.Vector3(p.x, p.y + POLE_H - 0.18, p.z), 'x', X_LINES.length + zi); // the east-west one
        world.createCollider(RAPIER.ColliderDesc.cylinder(POLE_H / 2, 0.06).setTranslation(p.x, p.y + POLE_H / 2, p.z));
      }
    }
  }
  const group = new THREE.Group();
  const postMesh = new THREE.Mesh(posts.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.4 }));
  const boardMesh = new THREE.Mesh(boards.build(), new THREE.MeshStandardMaterial({ map: tex.map, roughness: 0.5 }));
  postMesh.castShadow = boardMesh.castShadow = true;
  group.add(postMesh, boardMesh);
  return group;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, matrices: THREE.Matrix4[]) {
  const mesh = new THREE.InstancedMesh(geo, mat, matrices.length);
  matrices.forEach((m, i) => mesh.setMatrixAt(i, m));
  mesh.computeBoundingSphere();
  mesh.receiveShadow = true;
  return mesh;
}
