import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder } from './geo';
import { BOUNDS, roadHalf, SIDEWALK_HEIGHT, inWater, RAIL_HALF, RAIL_X, X_LINES, X_ROADS, Z_LINES, Z_ROADS, Z_ROADS_WEST, TNAGAR_X, roadSpans, roads, GUINDY_GATES } from './layout';
import { overheadCables } from './cables';
import { leafClusterTexture, glowTexture, lightPoolTexture, streetSignTextures } from './textures';

const CURB_OFFSET = 0.3; // props stand this far onto the sidewalk from the curb
const LAMP_SPACING = 14; // close enough that the light pools join up along the street at night
const TREE_SPACING = 13;
/** Trees further than this from the camera swap to their low-poly shape (BatchedMesh LOD). */
const TREE_LOD_DIST = 70;
const LOD_EVERY = 0.4; // s between LOD passes
const LAMP_HEIGHT = 6.5;
/** Width of the glow sprite round a lit lamp head, metres. */
const HALO_SIZE = 3.2;
/** Light pool size on the ground: along the road x across it (m). */
const POOL_ALONG = 15;
const POOL_ACROSS = 10;
const POOL_OPACITY = 0.6;
/** Share of the old orange sodium lamps; the rest are newer white LED ones. */
const SODIUM_SHARE = 0.3;
/** How far a canopy corner is pushed off its smooth ball, metres. */
const FOLIAGE_JITTER = 0.7;
/** Backdrop groves past the edges: [x0, x1, z0, z1, count] (north, south, and beyond the canal). */
const OUTSKIRT_GROVES: [number, number, number, number, number][] = [
  [BOUNDS.x0, 130, BOUNDS.z0 - 160, BOUNDS.z0 - 10, 80],
  [BOUNDS.x0, 130, BOUNDS.z1 + 10, BOUNDS.z1 + 160, 80],
  [BOUNDS.x0 - 260, BOUNDS.x0 - 10, BOUNDS.z0 - 150, BOUNDS.z1 + 150, 110],
];

interface TreeKind {
  weight: number;
  trunk: THREE.BufferGeometry;
  canopy: THREE.BufferGeometry;
  trunkR: number;
  colour: (out: THREE.Color, r: number) => THREE.Color;
}

/** Low-poly Chennai street trees, all standing at the origin (y = 0 at the root). */
function treeKinds(detail = 1): TreeKind[] {
  const merge = (gs: THREE.BufferGeometry[]) => mergeGeometries(gs.map((g) => (g.index ? g.toNonIndexed() : g)))!;
  const ico = (r: number, sx: number, sy: number, sz: number, x: number, y: number, z: number) => new THREE.IcosahedronGeometry(r, detail).scale(sx, sy, sz).translate(x, y, z);
  const cyl = (r0: number, r1: number, h: number, x = 0, z = 0, tilt = 0) => {
    const g = new THREE.CylinderGeometry(r0, r1, h, detail ? 6 : 4).translate(0, h / 2, 0);
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
      canopy: merge([new THREE.ConeGeometry(0.95, 7.5, detail ? 7 : 5).translate(0, 1 + 3.75, 0), new THREE.ConeGeometry(0.75, 3, detail ? 7 : 5).translate(0, 7.5, 0)]),
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

  const gates = GUINDY_GATES();
  for (const r of roads()) {
    const { c, axis } = r;
    const offEnd = (s: number) => s < r.from + 3 || s > r.to - 3; // keep clear of the world edge
    {
      for (const [a, b] of roadSpans(r)) {
        for (const side of [-1, 1]) {
          const across = c + side * (roadHalf(axis, c) + CURB_OFFSET);
          const place = (along: number) => (axis === 'z' ? new THREE.Vector3(across, y0, along) : new THREE.Vector3(along, y0, across));
          // Lamp arm points over the road: local +x -> towards the road.
          const toRoad = axis === 'z' ? (side > 0 ? Math.PI : 0) : side > 0 ? Math.PI / 2 : -Math.PI / 2;
          const lampAlongs: number[] = [];
          const onRail = (p: THREE.Vector3) => Math.abs(p.x - RAIL_X) < RAIL_HALF + 3 || gates.some((g) => Math.hypot(p.x - g.x, p.z - g.z) < 7);
          const start = a + (side > 0 ? 6 : 6 + LAMP_SPACING / 2);
          for (let s = start; s < b - 4; s += LAMP_SPACING) {
            if (offEnd(s) || onRail(place(s))) continue;
            lampAlongs.push(s);
            lamps.push(new THREE.Matrix4().makeRotationY(toRoad).setPosition(place(s)));
          }
          for (let s = a + 4 + rand() * 4; s < b - 4; s += TREE_SPACING * (0.7 + rand() * 0.6)) {
            if (lampAlongs.some((l) => Math.abs(l - s) < 3) || offEnd(s)) continue;
            const at = place(s);
            if (inWater(at.x, at.z, 4) || onRail(at)) continue; // no trees on the bridges or the railway
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
  // Local +x points across the road (the arm), so the plane is POOL_ACROSS in x, POOL_ALONG in z.
  const poolGeo = new THREE.PlaneGeometry(POOL_ACROSS, POOL_ALONG).rotateX(-Math.PI / 2).translate(1.6, 0.03, 0);
  const headMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffd28a, emissiveIntensity: 0 });
  const poolMat = new THREE.MeshBasicMaterial({
    map: lightPoolTexture(), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const poleMat = new THREE.MeshStandardMaterial({ color: 0x5b6066, roughness: 0.6, metalness: 0.4 });
  // One BatchedMesh per part: one draw call for every lamp on the map, each lamp culled on its own
  // (off screen / outside the shadow box) instead of drawing all of them.
  const poles = batched([poleGeo], poleMat, lamps.map((m) => ({ m, geo: 0 })));
  poles.castShadow = true;
  const heads = batched([headGeo], headMat, lamps.map((m) => ({ m, geo: 0 })));
  const pools = batched([poolGeo], poolMat, lamps.map((m) => ({ m, geo: 0 })));
  pools.renderOrder = 1;
  // Per-lamp tint: mostly white LED (slightly cool or warm), some orange sodium.
  const tint = new THREE.Color();
  for (let i = 0; i < pools.instanceCount; i++) {
    if (rand() < SODIUM_SHARE) tint.setRGB(1, 0.62, 0.3);
    else tint.setRGB(1, 0.9 + rand() * 0.06, 0.78 + rand() * 0.14);
    pools.setColorAt(i, tint);
  }
  // Glow round each lamp head at night: one additive point sprite per lamp (one draw call for the
  // lot), a cheap stand-in for bloom.
  const haloPts = new Float32Array(lamps.length * 3);
  const head = new THREE.Vector3();
  lamps.forEach((m, i) => head.set(1.2, LAMP_HEIGHT - 0.2, 0).applyMatrix4(m).toArray(haloPts, i * 3));
  const haloMat = new THREE.PointsMaterial({
    map: glowTexture(), size: HALO_SIZE, sizeAttenuation: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, color: 0xffc070,
  });
  const halos = new THREE.Points(new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(haloPts, 3)), haloMat);
  halos.renderOrder = 2;
  halos.visible = false;
  scene.add(halos);
  const lampMeshes: THREE.Object3D[] = [poles, heads, pools];

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
  // Trunk + canopy merged with vertex colours (brown bark, the kind's leaf colour); each tree gets a
  // brightness variation as its instance colour. All street trees are ONE BatchedMesh (one draw call,
  // culled per tree, with a low-poly shape far away); the backdrop groves another, without shadows.
  const painted = (geo: THREE.BufferGeometry, c: THREE.Color) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return g;
  };
  // Canopies as foliage, not smooth balls: every corner is pushed about (the same way wherever
  // faces share it, so no gaps), leaves are dark underneath and sunlit yellow-green on top, and
  // each facet is a slightly different clump. Same triangle count.
  const foliage = (geo: THREE.BufferGeometry, c: THREE.Color) => {
    const g = painted(geo, c);
    const p = g.attributes.position;
    const col = g.attributes.color;
    const hash = (x: number, y: number, z: number, k: number) => {
      const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719 + k * 11.13) * 43758.5453;
      return s - Math.floor(s);
    };
    g.computeBoundingBox();
    const y0 = g.boundingBox!.min.y;
    const span = g.boundingBox!.max.y - y0 || 1;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i);
      const y = p.getY(i);
      const z = p.getZ(i);
      p.setXYZ(i, x + (hash(x, y, z, 1) - 0.5) * FOLIAGE_JITTER, y + (hash(x, y, z, 2) - 0.5) * FOLIAGE_JITTER * 0.7, z + (hash(x, y, z, 3) - 0.5) * FOLIAGE_JITTER);
      const up = (y - y0) / span;
      const clump = 0.82 + 0.36 * hash(Math.floor(i / 3), 7, 3, 4); // per facet
      const lit = (0.5 + 0.75 * up) * clump;
      col.setXYZ(i, c.r * lit * (1 + 0.25 * up), c.g * lit * (1 + 0.12 * up), c.b * lit * (1 - 0.2 * up));
    }
    return g;
  };
  const bark = new THREE.Color(0x5a4632);
  const low = treeKinds(0);
  const shapeOf = (k: TreeKind, i: number) => mergeGeometries([painted(k.trunk, bark), foliage(k.canopy, kinds[i].colour(new THREE.Color(), 0.5))])!;
  // Geometry ids: kind i near = 2i (trunk only: the canopy is leaf cards), far = 2i + 1 (low-poly solid).
  const treeGeos = kinds.flatMap((k, i) => [painted(k.trunk, bark), shapeOf(low[i], i)]);
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true });
  windSway(treeMat);
  const street = placed.slice(0, trees.length);
  const groves = placed.slice(trees.length);
  const streetTrees = batched(treeGeos, treeMat, street.map((t) => ({ m: t.m, geo: t.kind * 2 })));
  streetTrees.castShadow = true;
  const groveTrees = batched(treeGeos, treeMat, groves.map((t) => ({ m: t.m, geo: t.kind * 2 + 1 }))); // far away: low-poly always
  // Near canopies: alpha-tested leaf cards over each kind's canopy shape (same instance order).
  const leafMat = new THREE.MeshStandardMaterial({ map: leafClusterTexture(), alphaTest: LEAF_ALPHA_TEST, side: THREE.DoubleSide, vertexColors: true, roughness: 0.8 });
  windSway(leafMat, true);
  const cardGeos = kinds.map((k, i) => leafCards(k.canopy, kinds[i].colour(new THREE.Color(), 0.5), rand));
  const leafCanopies = batched(cardGeos, leafMat, street.map((t) => ({ m: t.m, geo: t.kind })));
  leafCanopies.castShadow = true; // alpha-tested: dappled shadows
  const shade = new THREE.Color();
  for (let i = 0; i < streetTrees.instanceCount; i++) {
    shade.setScalar(0.8 + rand() * 0.35);
    streetTrees.setColorAt(i, shade);
    leafCanopies.setColorAt(i, shade);
  }
  for (let i = 0; i < groveTrees.instanceCount; i++) groveTrees.setColorAt(i, shade.setScalar(0.8 + rand() * 0.35));
  const treeMeshes: THREE.Object3D[] = [streetTrees, groveTrees, leafCanopies];
  const streetAt = street.map((t) => ({ x: t.m.elements[12], z: t.m.elements[14], kind: t.kind, far: false }));
  let lodIn = 0;

  const cables = overheadCables(lamps);
  scene.add(...lampMeshes, ...treeMeshes, streetSigns(world), cables.group);

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
      poolMat.opacity = f * POOL_OPACITY;
      pools.visible = halos.visible = f > 0.01;
      haloMat.opacity = f * 0.55;
    },
    /** Street trees far from the camera swap to their low-poly shape (a few times a second). */
    updateLod(dt: number, eye: THREE.Vector3) {
      windTime.value += dt;
      lodIn -= dt;
      if (lodIn > 0) return;
      lodIn = LOD_EVERY;
      cables.update(eye);
      const d2 = TREE_LOD_DIST * TREE_LOD_DIST;
      streetAt.forEach((t, i) => {
        const far = (t.x - eye.x) ** 2 + (t.z - eye.z) ** 2 > d2;
        if (far === t.far) return;
        t.far = far;
        streetTrees.setGeometryIdAt(i, t.kind * 2 + (far ? 1 : 0));
        leafCanopies.setVisibleAt(i, !far);
      });
    },
  };
}

const windTime = { value: 0 };
/** Canopy sway in metres at the top of a tree; trunks below WIND_FROM stay put. */
const WIND_SWAY = 0.12;
const WIND_FROM = 2; // m
const WIND_SPEED = 1.4; // rad/s

/**
 * Trees sway in the vertex shader: a few ALU ops per vertex, no extra draw calls. Each tree gets its
 * own phase from its position (BatchedMesh instance matrix). The shadow pass doesn't sway: at this
 * size the mismatch can't be seen.
 */
function windSway(m: THREE.MeshStandardMaterial, leaves = false) {
  m.onBeforeCompile = (shader) => {
    // Leaf cards: light every card by the canopy's outward normal on both faces, so the crown
    // shades like a soft ball instead of a pile of flat cards (no flip for back faces).
    if (leaves) shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize( vNormal );');
    shader.uniforms.uWindTime = windTime;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uWindTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      #ifdef USE_BATCHING
        float wPh = dot( batchingMatrix[3].xz, vec2( 0.37, 0.23 ) );
      #else
        float wPh = 0.0;
      #endif
      float wUp = max( transformed.y - ${WIND_FROM.toFixed(1)}, 0.0 ) * 0.15;
      float wT = uWindTime * ${WIND_SPEED.toFixed(2)} + wPh;
      transformed.x += ( sin( wT ) + 0.4 * sin( wT * 2.3 + transformed.y ) ) * ${WIND_SWAY.toFixed(3)} * wUp;
      transformed.z += cos( wT * 0.8 ) * ${(WIND_SWAY * 0.6).toFixed(3)} * wUp;`,
    );
  };
  m.customProgramCacheKey = () => (leaves ? 'tree-wind-leaves' : 'tree-wind');
}

/** Leaf cards per m² of canopy surface, and the limits per tree. */
const LEAF_DENSITY = 1.2;
const LEAF_CARDS: [number, number] = [30, 110];
const LEAF_ALPHA_TEST = 0.5;

/**
 * A canopy of leaf cards: quads scattered over the canopy shape's surface (area-weighted), pushed a
 * little inside, facing roughly outwards with a random tilt. Every corner carries the surface's
 * outward normal (soft ball shading), and colour darkens underneath / lightens on top like the solid
 * canopies. About as many triangles as the solid canopy it replaces.
 */
function leafCards(canopy: THREE.BufferGeometry, c: THREE.Color, rand: () => number) {
  const g = canopy.index ? canopy.toNonIndexed() : canopy;
  const p = g.attributes.position;
  const tris = p.count / 3;
  const A = new THREE.Vector3(), B = new THREE.Vector3(), C = new THREE.Vector3();
  const e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  const areas: number[] = [];
  let total = 0;
  for (let t = 0; t < tris; t++) {
    A.fromBufferAttribute(p, t * 3); B.fromBufferAttribute(p, t * 3 + 1); C.fromBufferAttribute(p, t * 3 + 2);
    total += e1.subVectors(B, A).cross(e2.subVectors(C, A)).length() / 2;
    areas.push(total);
  }
  g.computeBoundingBox();
  const y0 = g.boundingBox!.min.y;
  const span = g.boundingBox!.max.y - y0 || 1;
  const n = THREE.MathUtils.clamp(Math.round(total * LEAF_DENSITY), LEAF_CARDS[0], LEAF_CARDS[1]);
  const size = THREE.MathUtils.clamp(Math.sqrt(total / n) * 1.7, 0.9, 2.3);
  const pos: number[] = [], nor: number[] = [], uv: number[] = [], col: number[] = [];
  const P = new THREE.Vector3(), N = new THREE.Vector3(), F = new THREE.Vector3(), U = new THREE.Vector3(), V = new THREE.Vector3(), R = new THREE.Vector3();
  for (let k = 0; k < n; k++) {
    const pickA = rand() * total;
    let t = areas.findIndex((a) => a >= pickA);
    if (t < 0) t = tris - 1;
    A.fromBufferAttribute(p, t * 3); B.fromBufferAttribute(p, t * 3 + 1); C.fromBufferAttribute(p, t * 3 + 2);
    let u = rand(), v = rand();
    if (u + v > 1) { u = 1 - u; v = 1 - v; }
    P.copy(A).addScaledVector(e1.subVectors(B, A), u).addScaledVector(e2.subVectors(C, A), v);
    N.crossVectors(e1, e2).normalize();
    P.addScaledVector(N, -rand() * size * 0.45); // some cards sit inside the crown
    F.set(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(2.4).add(N).normalize(); // card facing
    R.set(rand() - 0.5, rand() - 0.5, rand() - 0.5);
    U.crossVectors(F, R).normalize().multiplyScalar(size / 2);
    V.crossVectors(F, U).normalize().multiplyScalar(size / 2);
    const up = (P.y - y0) / span;
    const lit = (0.55 + 0.65 * up) * (0.85 + 0.3 * rand());
    const cr = c.r * lit * (1 + 0.2 * up), cg = c.g * lit * (1 + 0.1 * up), cb = c.b * lit * (1 - 0.2 * up);
    const corner = (su: number, sv: number, tu: number, tv: number) => {
      pos.push(P.x + U.x * su + V.x * sv, P.y + U.y * su + V.y * sv, P.z + U.z * su + V.z * sv);
      nor.push(N.x, N.y, N.z);
      uv.push(tu, tv);
      col.push(cr, cg, cb);
    };
    corner(-1, -1, 0, 0); corner(1, -1, 1, 0); corner(1, 1, 1, 1);
    corner(-1, -1, 0, 0); corner(1, 1, 1, 1); corner(-1, 1, 0, 1);
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return out;
}

/**
 * Street-name signs: a post at two opposite corners of every junction, carrying one board per
 * street (each board runs parallel to the street it names). Two draw calls in total.
 */
function streetSigns(world: RAPIER.World) {
  // Rows: north-south names, east-west names, then the east-west names west of Anna Salai (T. Nagar).
  const names = [...X_LINES.map((c) => X_ROADS[c]), ...Z_LINES.map((c) => Z_ROADS[c]), ...Z_LINES.map((c) => Z_ROADS_WEST[c] ?? Z_ROADS[c])];
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

  for (const [xi, x] of X_LINES.entries()) {
    for (const [zi, z] of Z_LINES.entries()) {
      for (const [sx, sz] of [[1, -1], [-1, 1]]) {
        const p = new THREE.Vector3(x + sx * (roadHalf('z', x) + 0.55), SIDEWALK_HEIGHT, z + sz * (roadHalf('x', z) + 0.55));
        posts.add(pole, new THREE.Matrix4().setPosition(p), grey);
        board(new THREE.Vector3(p.x, p.y + POLE_H - 0.55, p.z), 'z', xi); // names the north-south street
        board(new THREE.Vector3(p.x, p.y + POLE_H - 0.18, p.z), 'x', X_LINES.length + (p.x < TNAGAR_X ? Z_LINES.length : 0) + zi); // the east-west one
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

/** A BatchedMesh holding `geos` and one instance per item (its matrix and geometry index). */
function batched(geos: THREE.BufferGeometry[], mat: THREE.Material, items: { m: THREE.Matrix4; geo: number }[]) {
  const flat = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  // All geometries in a BatchedMesh need the same attributes: drop extras (e.g. uv) not everywhere.
  const names = Object.keys(flat[0].attributes).filter((n) => flat.every((g) => g.attributes[n]));
  for (const g of flat) for (const n of Object.keys(g.attributes)) if (!names.includes(n)) g.deleteAttribute(n);
  const verts = flat.reduce((n, g) => n + g.attributes.position.count, 0);
  const b = new THREE.BatchedMesh(Math.max(1, items.length), verts, 0, mat);
  const ids = flat.map((g) => b.addGeometry(g));
  for (const it of items) b.setMatrixAt(b.addInstance(ids[it.geo]), it.m);
  b.receiveShadow = true;
  return b;
}

