import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { GeoBuilder } from './geo';
import { pavingTexture } from './textures';

/*
 * Santhome, east of Mylapore: San Thome Basilica, Marina-style lighthouse, beach and sea.
 * Numbers are hard-coded here on purpose: layout.ts is being reworked and this module only
 * needs the fixed Beach Road edge (x = 132.5) and the basilica lot.
 * 10 draw calls: sand, sea, foam, paving, basilica walls / stone / windows, beach props,
 * lantern, beam.
 */

const PROM_X0 = 132.5; // east sidewalk edge of Kamarajar Salai
const PROM_X1 = 136.5; // promenade -> sand
const PROM_Y = 0.15; // same as the sidewalks, so walking off the pavement is flush
const SHORE_X = 205;
const BEACH_Z = 100;
const SAND_END_X = 215; // the sand floor runs on under the water so waders have something to stand on
const SEA_X0 = 198; // sea starts under the wet sand; the sand slope decides where the shoreline shows
const SEA_X1 = 700;
const SEA_Z = 400;
const SEA_Y = -0.05;
const SEA_WALL_X = 212;
const LOT = { x0: 77.5, x1: 117.5, z0: -17.5, z1: 17.5 };
const LIGHTHOUSE = { x: 150, z: -80 };
const LANTERN_Y = 27.7; // above the sand
const BEAM_SPEED = 0.5; // rad/s
const BEAM_LENGTH = 70;
const FOAM_X = 204;
const FOAM_SWASH = 2.2; // metres the foam band washes up and back
const FOAM_PERIOD = 0.45; // rad/s of the swash
const CART_ZS = [-50, -22, 4, 28, 52];
const CART_X = 140;
const PALM_COUNT = 26;
const BOAT_COUNT = 10;
const HUTS: [number, number][] = [[168, 66], [177, 72], [166, 81], [179, 89]];
const SEED = 23; // prop scatter; change for a different beach layout

const UP = new THREE.Vector3(0, 1, 0);
const DOWN = new THREE.Vector3(0, -1, 0);
const WHITE = new THREE.Color(0xffffff);
const WALL = new THREE.Color(0xf3efe6);
const CREAM = new THREE.Color(0xe2d8c2);
const SLATE = new THREE.Color(0x6d727a);
const LAWN = new THREE.Color(0x5f8f3e);
const DOOR = new THREE.Color(0x4a2e1c);
const WOOD = new THREE.Color(0x6b4a2f);
const TRUNK = new THREE.Color(0x8a7258);
const DRY_SAND = new THREE.Color(0xe8d4a2);
const WET_SAND = new THREE.Color(0xb39a6a);
const NO_UV = [[0, 0], [0, 0], [0, 0], [0, 0]];
const QUAD_UV = [[0, 0], [1, 0], [1, 1], [0, 1]];

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const _q = new THREE.Quaternion();

function seeded(seed: number) {
  return () => (seed = (seed * 16807) % 2147483647) / 2147483647;
}

/** Beach profile: flat-ish dry sand, a gentle fall to the waterline, then under the sea. */
function sandY(x: number) {
  if (x < 140) return 0.12;
  if (x < 196) return 0.12 - ((x - 140) / 56) * 0.09;
  if (x < SHORE_X) return 0.03 - ((x - 196) / (SHORE_X - 196)) * 0.09;
  return -0.06 - Math.min(1, (x - SHORE_X) / 10) * 0.54;
}

function cuboid(cols: RAPIER.ColliderDesc[], hx: number, hy: number, hz: number, x: number, y: number, z: number, rotY = 0) {
  _q.setFromAxisAngle(UP, rotY);
  cols.push(RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setRotation({ x: _q.x, y: _q.y, z: _q.z, w: _q.w }));
}

export function createSanthome(scene: THREE.Scene, world: RAPIER.World) {
  const cols: RAPIER.ColliderDesc[] = [];
  const walls = new GeoBuilder(); // basilica white walls (glow at night)
  const stone = new GeoBuilder(); // basilica roof, trim, lawn, compound wall
  const windows = new GeoBuilder(); // pointed-arch windows (stained glass glows at night)
  const paving = new GeoBuilder();
  const beach = new GeoBuilder(); // lighthouse, boats, carts, palms, huts
  const carts: THREE.Vector3[] = [];

  buildBasilica(walls, stone, windows, paving, cols);
  buildPromenade(paving, cols);
  buildLighthouse(beach, cols);
  const obstacles: { x: number; z: number; r: number }[] = [{ x: LIGHTHOUSE.x, z: LIGHTHOUSE.z, r: 9 }];
  buildCarts(beach, cols, carts, obstacles);
  buildHuts(beach, cols, obstacles);
  buildBoats(beach, cols, obstacles);
  buildPalms(beach, cols, obstacles);

  const wallMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, emissive: 0xfff0d6, emissiveIntensity: 0 });
  const [winMap, winGlow] = windowTextures();
  const winMat = new THREE.MeshStandardMaterial({ map: winMap, emissiveMap: winGlow, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.4 });
  const solids: [GeoBuilder, THREE.Material, boolean][] = [
    [walls, wallMat, true],
    [stone, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), true],
    [windows, winMat, false],
    [paving, new THREE.MeshStandardMaterial({ map: pavingTexture(), roughness: 0.9 }), false],
    [beach, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), true],
  ];
  for (const [geo, mat, cast] of solids) {
    const mesh = new THREE.Mesh(geo.build(), mat);
    mesh.castShadow = cast;
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // --- Sand: one sloped plane, vertex-coloured dry -> wet; its own trimesh collider.
  const sandGeo = new THREE.PlaneGeometry(SAND_END_X - PROM_X1, 2 * BEACH_Z, 40, 4).rotateX(-Math.PI / 2).translate((PROM_X1 + SAND_END_X) / 2, 0, 0);
  {
    const pos = sandGeo.attributes.position;
    const uv = sandGeo.attributes.uv;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      pos.setY(i, sandY(x));
      uv.setXY(i, x / 4, pos.getZ(i) / 4);
      c.lerpColors(DRY_SAND, WET_SAND, THREE.MathUtils.smoothstep(x, 186, 203)).toArray(col, i * 3);
    }
    sandGeo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    sandGeo.computeVertexNormals();
    world.createCollider(RAPIER.ColliderDesc.trimesh(pos.array as Float32Array, new Uint32Array(sandGeo.index!.array)));
  }
  const sand = new THREE.Mesh(sandGeo, new THREE.MeshStandardMaterial({ map: sandTexture(), vertexColors: true, roughness: 0.95 }));
  sand.receiveShadow = true;

  // --- Sea: swell displaced in the vertex shader (bigger offshore, almost flat at the shore).
  const uTime = { value: 0 };
  const seaMat = new THREE.MeshStandardMaterial({ color: 0x1f6f8b, roughness: 0.22, metalness: 0.1 });
  seaMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader = SWELL_GLSL + shader.vertexShader
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvec3 sw = swell(position.xz);\nobjectNormal = normalize(vec3(-sw.y, 1.0, -sw.z));')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += sw.x;');
  };
  seaMat.customProgramCacheKey = () => 'santhome-sea';
  // Mesh sits at the origin, so position.xz in the shader are world metres.
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(SEA_X1 - SEA_X0, 2 * SEA_Z, 80, 40).rotateX(-Math.PI / 2).translate((SEA_X0 + SEA_X1) / 2, SEA_Y, 0),
    seaMat,
  );
  sea.receiveShadow = true;

  // --- Foam band washing up and down the shoreline.
  const foamTex = foamTexture();
  foamTex.repeat.set(1, 20);
  const foamMat = new THREE.MeshStandardMaterial({ map: foamTex, transparent: true, depthWrite: false, roughness: 1, opacity: 0.7 });
  const foam = new THREE.Mesh(new THREE.PlaneGeometry(8, 2 * BEACH_Z).rotateX(-Math.PI / 2).translate(FOAM_X, 0.045, 0), foamMat);
  foam.renderOrder = 1;

  // --- Lighthouse lantern + rotating beam (two opposed cones, additive, night only).
  const gy = sandY(LIGHTHOUSE.x);
  const lanternMat = new THREE.MeshStandardMaterial({ color: 0xcfe6ee, emissive: 0xffe28a, emissiveIntensity: 0, roughness: 0.2, metalness: 0.3 });
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 12).translate(LIGHTHOUSE.x, gy + LANTERN_Y, LIGHTHOUSE.z), lanternMat);
  const cone = new THREE.ConeGeometry(2.8, BEAM_LENGTH, 12, 1, true).translate(0, -BEAM_LENGTH / 2, 0).rotateZ(Math.PI / 2); // tip at origin, opens to +x
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xfff1c0, map: beamTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const beam = new THREE.Mesh(mergeGeometries([cone, cone.clone().rotateY(Math.PI)]), beamMat);
  beam.position.set(LIGHTHOUSE.x, gy + LANTERN_Y, LIGHTHOUSE.z);
  beam.visible = false;
  beam.renderOrder = 2;

  scene.add(sand, sea, foam, lantern, beam);

  // Invisible wall a few metres into the water: wade, don't swim off the map.
  cols.push(RAPIER.ColliderDesc.cuboid(0.5, 1.5, SEA_Z).setTranslation(SEA_WALL_X + 0.5, 1.0, 0));
  for (const c of cols) world.createCollider(c);

  let t = 0;
  return {
    /** 0 = day, 1 = night: basilica glow, lighthouse lantern + beam. */
    setNight(f: number) {
      wallMat.emissiveIntensity = f * 0.28;
      winMat.emissiveIntensity = f * 1.3;
      lanternMat.emissiveIntensity = f * 3;
      beamMat.opacity = f * 0.35;
      beam.visible = f > 0.05;
    },
    /** Per frame: sea swell, foam, lighthouse beam rotation. */
    update(dt: number) {
      t += dt;
      uTime.value = t;
      foam.position.x = Math.sin(t * FOAM_PERIOD) * FOAM_SWASH;
      foamMat.opacity = 0.55 + 0.25 * Math.sin(t * FOAM_PERIOD + 0.8);
      foamTex.offset.y = t * 0.01;
      if (beam.visible) beam.rotation.y += dt * BEAM_SPEED;
    },
    /** Food carts on the beach (for later: buying snacks there). World positions at the cart counter. */
    carts,
    /** A nice spot on the promenade facing the sea (+x) (for spawning / missions). */
    beachSpot: new THREE.Vector3((PROM_X0 + PROM_X1) / 2, PROM_Y, 10),
  };
}

// --- Sea shader ------------------------------------------------------------------------------

/** (height, d/dx, d/dz) of two travelling sine swells; rollers move towards the shore (-x). */
const SWELL_GLSL = /* glsl */ `
uniform float uTime;
vec3 swell(vec2 p) {
  float a = mix(0.04, 0.35, smoothstep(${SHORE_X.toFixed(1)}, 280.0, p.x));
  float ph1 = p.x * 0.21 + uTime * 1.3;
  float ph2 = (p.x + p.y) * 0.09 + uTime * 0.8;
  float h = a * (0.6 * sin(ph1) + 0.4 * sin(ph2));
  float dx = a * (0.6 * 0.21 * cos(ph1) + 0.4 * 0.09 * cos(ph2));
  float dz = a * 0.4 * 0.09 * cos(ph2);
  return vec3(h, dx, dz);
}
`;

// --- San Thome Basilica ----------------------------------------------------------------------

/** Pointed-arch window quad just proud of a wall facing ±x or ±z. */
function archWindow(b: GeoBuilder, cx: number, cy: number, cz: number, w: number, h: number, facing: THREE.Vector3) {
  const spanX = Math.abs(facing.z) > 0.5;
  const dx = spanX ? w / 2 : 0;
  const dz = spanX ? 0 : w / 2;
  const x = cx + facing.x * 0.04;
  const z = cz + facing.z * 0.04;
  b.quad(V(x - dx, cy - h / 2, z - dz), V(x + dx, cy - h / 2, z + dz), V(x + dx, cy + h / 2, z + dz), V(x - dx, cy + h / 2, z - dz), QUAD_UV, WHITE, facing);
}

function buildBasilica(walls: GeoBuilder, stone: GeoBuilder, win: GeoBuilder, paving: GeoBuilder, cols: RAPIER.ColliderDesc[]) {
  const solid = (b: GeoBuilder, w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.Color) => {
    b.box(w, h, d, x, y, z, c);
    cuboid(cols, w / 2, h / 2, d / 2, x, y, z);
  };
  const W = V(-1, 0, 0);
  const E = V(1, 0, 0);
  const N = V(0, 0, -1);
  const S = V(0, 0, 1);

  // Lawn over the lot, paved path from the west gate to the door.
  const l = LOT;
  stone.quad(V(l.x0, 0.03, l.z0), V(l.x1, 0.03, l.z0), V(l.x1, 0.03, l.z1), V(l.x0, 0.03, l.z1), NO_UV, LAWN, UP);
  const p = [V(l.x0, 0.04, -3), V(84, 0.04, -3), V(84, 0.04, 3), V(l.x0, 0.04, 3)];
  paving.quad(p[0], p[1], p[2], p[3], p.map((v) => [v.x, v.z]), WHITE, UP);

  // Front tower (west), nave, apse (east).
  const TX0 = 84;
  const TX1 = 90;
  const TH = 20;
  const NX1 = 112;
  const NW = 7; // nave half-width
  const NH = 11;
  const RIDGE = 16.2;
  solid(walls, TX1 - TX0, TH, 6.4, (TX0 + TX1) / 2, TH / 2, 0, WALL);
  solid(walls, NX1 - TX1, NH, 2 * NW, (TX1 + NX1) / 2, NH / 2, 0, WALL);
  walls.add(new THREE.CylinderGeometry(4.5, 4.5, 10, 12, 1, false, 0, Math.PI), new THREE.Matrix4().setPosition(NX1, 5, 0), WALL);
  cols.push(RAPIER.ColliderDesc.cylinder(5, 4.5).setTranslation(NX1, 5, 0));
  stone.add(new THREE.ConeGeometry(4.8, 4, 12, 1, false, 0, Math.PI), new THREE.Matrix4().setPosition(NX1, 12, 0), SLATE);

  // Steep slate roof with a little overhang (top and underside) and white gables.
  const rx0 = TX1;
  const rx1 = NX1 + 0.3;
  for (const s of [-1, 1]) {
    const a = V(rx0, NH - 0.3, s * (NW + 0.6));
    const b = V(rx1, NH - 0.3, s * (NW + 0.6));
    const c = V(rx1, RIDGE, 0);
    const d = V(rx0, RIDGE, 0);
    stone.quad(a, b, c, d, NO_UV, SLATE, V(0, 1, s));
    stone.quad(a, b, c, d, NO_UV, SLATE, V(0, -1, -s));
  }
  walls.quad(V(NX1, NH, -NW), V(NX1, NH, NW), V(NX1, RIDGE - 0.2, 0), V(NX1, RIDGE - 0.2, 0), NO_UV, WALL, E);
  walls.quad(V(TX1, NH, -NW), V(TX1, NH, NW), V(TX1, RIDGE - 0.2, 0), V(TX1, RIDGE - 0.2, 0), NO_UV, WALL, W);
  stone.box(0.15, 1.4, 0.15, NX1 + 0.1, RIDGE + 0.6, 0, CREAM); // small cross on the east gable
  stone.box(0.15, 0.15, 0.8, NX1 + 0.1, RIDGE + 0.9, 0, CREAM);

  // Buttresses between the nave bays, a pointed window in each bay.
  const bays = 5;
  const bay = (NX1 - TX1) / bays;
  for (const s of [-1, 1]) {
    for (let i = 0; i <= bays; i++) {
      const x = TX1 + i * bay;
      solid(walls, 1, 8, 0.9, x, 4, s * (NW + 0.45), WALL);
      walls.box(1, 2, 0.5, x, 9, s * (NW + 0.25), WALL);
    }
    for (let i = 0; i < bays; i++) archWindow(win, TX1 + (i + 0.5) * bay, 6.2, s * NW, 1.6, 4.4, s > 0 ? S : N);
  }

  // Tower: door, arch windows, cornices, belfry with corner pinnacles, slate spire, cross.
  walls.box(0.15, 4.2, 2.4, TX0 - 0.05, 2.1, 0, DOOR);
  archWindow(win, TX0, 8.5, 0, 2, 4.4, W);
  archWindow(win, TX0, 14.5, 0, 1.4, 2.8, W);
  for (const s of [-1, 1]) {
    archWindow(win, (TX0 + TX1) / 2, 8.5, s * 3.2, 1.4, 3.2, s > 0 ? S : N);
    archWindow(win, (TX0 + TX1) / 2, 14.5, s * 3.2, 1.4, 2.8, s > 0 ? S : N);
  }
  const tcx = (TX0 + TX1) / 2;
  stone.box(6.6, 0.4, 7, tcx, TH + 0.2, 0, CREAM);
  walls.box(5.6, 4.6, 5.6, tcx, TH + 0.4 + 2.3, 0, WALL);
  for (const f of [W, E, N, S]) archWindow(win, tcx + f.x * 2.8, TH + 2.7, f.z * 2.8, 1.5, 3.4, f);
  const top = TH + 5;
  stone.box(6.2, 0.4, 6.2, tcx, top + 0.2, 0, CREAM);
  const pinnacle = new THREE.ConeGeometry(0.4, 2.2, 4);
  for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
    walls.add(pinnacle, new THREE.Matrix4().setPosition(tcx + sx * 2.8, top + 1.5, sz * 2.8), WALL);
  }
  const spireH = 9.5;
  const spire = new THREE.ConeGeometry(2.7 * Math.SQRT2, spireH, 4).rotateY(Math.PI / 4); // square base, flush with the belfry
  stone.add(spire, new THREE.Matrix4().setPosition(tcx, top + 0.4 + spireH / 2, 0), SLATE);
  const apex = top + 0.4 + spireH;
  stone.box(0.18, 1.9, 0.18, tcx, apex + 0.9, 0, CREAM);
  stone.box(0.18, 0.18, 1.1, tcx, apex + 1.3, 0, CREAM);

  // Low compound wall with the gate gap on the west (San Thome High Road) side.
  const wx0 = l.x0 + 0.3;
  const wx1 = l.x1 - 0.3;
  const wz0 = l.z0 + 0.3;
  const wz1 = l.z1 - 0.3;
  const WH = 1.3;
  const WT = 0.35;
  const gate = 4;
  solid(stone, wx1 - wx0, WH, WT, (wx0 + wx1) / 2, WH / 2, wz0, WALL);
  solid(stone, wx1 - wx0, WH, WT, (wx0 + wx1) / 2, WH / 2, wz1, WALL);
  solid(stone, WT, WH, wz1 - wz0, wx1, WH / 2, 0, WALL);
  solid(stone, WT, WH, -gate - wz0, wx0, WH / 2, (wz0 - gate) / 2, WALL);
  solid(stone, WT, WH, wz1 - gate, wx0, WH / 2, (wz1 + gate) / 2, WALL);
  for (const s of [-1, 1]) solid(stone, 0.8, 2.2, 0.8, wx0, 1.1, s * (gate + 0.4), CREAM);
}

// --- Promenade -------------------------------------------------------------------------------

function buildPromenade(paving: GeoBuilder, cols: RAPIER.ColliderDesc[]) {
  const z0 = -BEACH_Z;
  const z1 = BEACH_Z;
  const t = [V(PROM_X0, PROM_Y, z0), V(PROM_X1, PROM_Y, z0), V(PROM_X1, PROM_Y, z1), V(PROM_X0, PROM_Y, z1)];
  paving.quad(t[0], t[1], t[2], t[3], t.map((v) => [v.x, v.z]), WHITE, UP);
  paving.quad(V(PROM_X1, 0, z0), V(PROM_X1, 0, z1), V(PROM_X1, PROM_Y, z1), V(PROM_X1, PROM_Y, z0), [[0, 0], [200, 0], [200, PROM_Y], [0, PROM_Y]], WHITE, V(1, 0, 0));
  cuboid(cols, (PROM_X1 - PROM_X0) / 2, PROM_Y / 2, BEACH_Z, (PROM_X0 + PROM_X1) / 2, PROM_Y / 2, 0);
}

// --- Lighthouse ------------------------------------------------------------------------------

/** Triangular, tapering concrete shaft in red/white bands, like the modern Marina lighthouse. */
function buildLighthouse(b: GeoBuilder, cols: RAPIER.ColliderDesc[]) {
  const { x, z } = LIGHTHOUSE;
  const g = sandY(x);
  const red = new THREE.Color(0xc62828);
  const white = new THREE.Color(0xf2f2ee);
  const dark = new THREE.Color(0x3a3f44);
  b.box(8, 3.5, 8, x, g + 1.75, z, CREAM);
  b.box(0.12, 2.2, 1.4, x - 4.02, g + 1.1, z, DOOR);
  cuboid(cols, 4, 1.75, 4, x, g + 1.75, z);

  const SHAFT = 26;
  const BANDS = 8;
  const r = (y: number) => 3.1 - (y / SHAFT) * 0.9;
  for (let i = 0; i < BANDS; i++) {
    const y0 = (i * SHAFT) / BANDS;
    const y1 = ((i + 1) * SHAFT) / BANDS;
    b.add(new THREE.CylinderGeometry(r(y1), r(y0), y1 - y0, 3), new THREE.Matrix4().setPosition(x, g + (y0 + y1) / 2, z), i % 2 ? white : red);
  }
  cols.push(RAPIER.ColliderDesc.cylinder(SHAFT / 2, 2.6).setTranslation(x, g + SHAFT / 2, z));

  b.add(new THREE.CylinderGeometry(2.9, 2.5, 0.5, 12), new THREE.Matrix4().setPosition(x, g + SHAFT + 0.25, z), dark); // gallery
  b.add(new THREE.CylinderGeometry(2.8, 2.8, 0.9, 12, 1, true), new THREE.Matrix4().setPosition(x, g + SHAFT + 0.95, z), dark); // railing
  b.add(new THREE.SphereGeometry(1.6, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.Matrix4().setPosition(x, g + LANTERN_Y + 1.2, z), red); // dome
  b.add(new THREE.ConeGeometry(0.15, 1, 6), new THREE.Matrix4().setPosition(x, g + LANTERN_Y + 3.2, z), dark);
}

// --- Beach props -----------------------------------------------------------------------------

/** Umbrella canopy: 8 alternating-colour sectors, visible from above and below. */
function umbrella(b: GeoBuilder, x: number, y: number, z: number, r: number, c1: THREE.Color, c2: THREE.Color) {
  const apex = V(x, y + 0.5, z);
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2;
    const a1 = ((i + 1) / 8) * Math.PI * 2;
    const p0 = V(x + Math.cos(a0) * r, y, z + Math.sin(a0) * r);
    const p1 = V(x + Math.cos(a1) * r, y, z + Math.sin(a1) * r);
    const c = i % 2 ? c1 : c2;
    b.quad(apex, p0, p1, p1, NO_UV, c, UP);
    b.quad(apex, p0, p1, p1, NO_UV, c, DOWN);
  }
}

const CART_COLOURS = [[0xc62828, 0xfdd835], [0x1565c0, 0xffffff], [0x2e7d32, 0xff8f00], [0x6a1b9a, 0xfdd835], [0xef6c00, 0x00838f]];

/** Sundal / bajji / corn pushcarts, long side along z, counter facing the promenade (-x). */
function buildCarts(b: GeoBuilder, cols: RAPIER.ColliderDesc[], out: THREE.Vector3[], obstacles: { x: number; z: number; r: number }[]) {
  const wheel = new THREE.CylinderGeometry(0.32, 0.32, 0.08, 10).rotateZ(Math.PI / 2);
  const pole = new THREE.CylinderGeometry(0.03, 0.03, 2.1, 6);
  const kadai = new THREE.CylinderGeometry(0.28, 0.18, 0.15, 10);
  const steel = new THREE.Color(0xb0b6bb);
  const glass = new THREE.Color(0xcfe6ee);
  const black = new THREE.Color(0x222222);
  CART_ZS.forEach((z, i) => {
    const x = CART_X;
    const y = sandY(x);
    const [c1, c2] = CART_COLOURS[i % CART_COLOURS.length].map((c) => new THREE.Color(c));
    b.box(1.0, 0.7, 1.8, x, y + 0.75, z, c1);
    b.box(1.1, 0.06, 1.9, x, y + 1.13, z, steel);
    b.box(0.6, 0.4, 0.9, x + 0.15, y + 1.36, z + 0.35, glass);
    b.add(kadai, new THREE.Matrix4().setPosition(x + 0.1, y + 1.24, z - 0.5), black);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.add(wheel, new THREE.Matrix4().setPosition(x + sx * 0.55, y + 0.32, z + sz * 0.55), black);
    b.add(pole, new THREE.Matrix4().setPosition(x + 0.35, y + 2.2, z), steel);
    umbrella(b, x + 0.35, y + 2.9, z, 1.5, c1, c2);
    cuboid(cols, 0.55, 0.6, 0.95, x, y + 0.6, z);
    out.push(new THREE.Vector3(x - 0.9, y, z));
    obstacles.push({ x, z, r: 3 });
  });
}

/** Fishermen's huts at the south end: mud walls, thatched pyramid roof. */
function buildHuts(b: GeoBuilder, cols: RAPIER.ColliderDesc[], obstacles: { x: number; z: number; r: number }[]) {
  const rand = seeded(SEED + 1);
  const mud = new THREE.Color(0xb88a5a);
  const thatch = new THREE.Color(0xc9a85c);
  const roof = new THREE.ConeGeometry(2.5, 1.8, 4).rotateY(Math.PI / 4).scale(1.3, 1, 1.05);
  for (const [x, z] of HUTS) {
    const y = sandY(x);
    const yaw = (rand() - 0.5) * 0.6;
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
    b.box(3.2, 2, 2.6, x, y + 1, z, mud, yaw);
    b.add(roof, new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y + 2.9, z), thatch);
    const door = V(-1.62, 0.75, 0).applyMatrix4(m);
    b.box(0.06, 1.5, 0.8, door.x, door.y, door.z, DOOR, yaw);
    cuboid(cols, 1.6, 1.2, 1.3, x, y + 1.2, z, yaw);
    obstacles.push({ x, z, r: 5 });
  }
}

/** Fibre-glass fishing boat: pointed both ends, sheer rising at the ends, covered deck. */
function fibreBoat(b: GeoBuilder, m: THREE.Matrix4, hull: THREE.Color, deck: THREE.Color) {
  const L = 5.5;
  const W = 0.8;
  const H = 0.85;
  const n = 6;
  const P = (x: number, y: number, z: number) => V(x, y, z).applyMatrix4(m);
  const F = (x: number, y: number, z: number) => V(x, y, z).transformDirection(m);
  const st: { x: number; w: number; k: number; top: number; bot: number }[] = [];
  for (let i = 0; i <= n; i++) {
    const t = -1 + (2 * i) / n;
    const w = W * Math.sqrt(Math.max(0, 1 - t ** 4));
    st.push({ x: (t * L) / 2, w, k: w * 0.35, top: H + 0.3 * t * t, bot: 0.08 + 0.15 * t * t });
  }
  for (let i = 0; i < n; i++) {
    const a = st[i];
    const c = st[i + 1];
    for (const s of [-1, 1]) {
      b.quad(P(a.x, a.top, s * a.w), P(c.x, c.top, s * c.w), P(c.x, c.bot, s * c.k), P(a.x, a.bot, s * a.k), NO_UV, hull, F(0, 0, s));
    }
    b.quad(P(a.x, a.bot, -a.k), P(c.x, c.bot, -c.k), P(c.x, c.bot, c.k), P(a.x, a.bot, a.k), NO_UV, hull, F(0, -1, 0));
    b.quad(P(a.x, a.top, -a.w), P(c.x, c.top, -c.w), P(c.x, c.top, c.w), P(a.x, a.top, a.w), NO_UV, deck, F(0, 1, 0));
  }
}

/** Kattumaram: five logs lashed together with an upturned prow. */
function kattumaram(b: GeoBuilder, m: THREE.Matrix4) {
  const log = new THREE.CylinderGeometry(0.17, 0.15, 5.6, 6).rotateZ(Math.PI / 2);
  const prow = new THREE.ConeGeometry(0.42, 1.3, 6).rotateZ(-Math.PI / 2).rotateZ(0.35);
  const tie = new THREE.BoxGeometry(0.08, 0.1, 1.6);
  const local = new THREE.Matrix4();
  for (let i = 0; i < 5; i++) b.add(log, local.makeTranslation(0, 0.17, -0.68 + i * 0.34).premultiply(m), WOOD);
  b.add(prow, local.makeTranslation(3.2, 0.42, 0).premultiply(m), WOOD);
  for (const tx of [-1.8, 0, 1.8]) b.add(tie, local.makeTranslation(tx, 0.34, 0).premultiply(m), DOOR);
}

const BOAT_COLOURS = [0x1565c0, 0xef6c00, 0x2e7d32, 0xf5f5f5, 0xc62828, 0x00838f];

function buildBoats(b: GeoBuilder, cols: RAPIER.ColliderDesc[], obstacles: { x: number; z: number; r: number }[]) {
  const rand = seeded(SEED + 2);
  const net = new THREE.DodecahedronGeometry(0.9).scale(1, 0.35, 1);
  const nets = [new THREE.Color(0x3d5a4a), new THREE.Color(0x6b4f3a)];
  const deck = new THREE.Color(0x5d4a3a);
  for (let i = 0; i < BOAT_COUNT; i++) {
    const z = -60 + i * 12 + (rand() - 0.5) * 4;
    const x = 190 + rand() * 5;
    const yaw = (rand() - 0.5) * 0.5 + (rand() < 0.5 ? Math.PI : 0);
    const y = sandY(x);
    const m = new THREE.Matrix4().makeRotationY(yaw).setPosition(x, y, z);
    if (i % 3 === 1) {
      kattumaram(b, m);
      cuboid(cols, 3.2, 0.3, 0.85, x, y + 0.3, z, yaw);
    } else {
      fibreBoat(b, m, new THREE.Color(BOAT_COLOURS[i % BOAT_COLOURS.length]), deck);
      cuboid(cols, 2.75, 0.5, 0.8, x, y + 0.5, z, yaw);
    }
    if (i % 2 === 0) b.add(net, new THREE.Matrix4().setPosition(x - 1, y + 0.15, z + 2.3), nets[(i / 2) % 2]);
    obstacles.push({ x, z, r: 4.5 });
  }
}

/** Leaf segment from A to B, `side` horizontal across the leaf; both faces emitted. */
function leaf(b: GeoBuilder, a: THREE.Vector3, c: THREE.Vector3, wa: number, wc: number, side: THREE.Vector3, col: THREE.Color) {
  const p0 = a.clone().addScaledVector(side, -wa);
  const p1 = a.clone().addScaledVector(side, wa);
  const p2 = c.clone().addScaledVector(side, wc);
  const p3 = c.clone().addScaledVector(side, -wc);
  b.quad(p0, p1, p2, p3, NO_UV, col, UP);
  b.quad(p0, p1, p2, p3, NO_UV, col, DOWN);
}

function buildPalms(b: GeoBuilder, cols: RAPIER.ColliderDesc[], obstacles: { x: number; z: number; r: number }[]) {
  const rand = seeded(SEED);
  const seg = new THREE.CylinderGeometry(0.9, 1, 1, 6, 1, true); // unit trunk piece, scaled per segment
  const nut = new THREE.IcosahedronGeometry(0.18, 0);
  const nutCol = new THREE.Color(0x6d5a2a);
  const mid = new THREE.Vector3();
  const dir = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const q = new THREE.Quaternion();
  let placed = 0;
  for (let tries = 0; placed < PALM_COUNT && tries < 500; tries++) {
    const x = 143 + rand() * 41;
    const z = -96 + rand() * 192;
    if (obstacles.some((o) => Math.hypot(o.x - x, o.z - z) < o.r)) continue;
    obstacles.push({ x, z, r: 3.5 });
    placed++;

    const y0 = sandY(x);
    const H = 7 + rand() * 3;
    const lean = 1 + rand() * 2.2;
    const la = rand() * Math.PI * 2;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 5; i++) {
      const t = i / 5;
      pts.push(V(x + Math.cos(la) * lean * t * t, y0 + H * t, z + Math.sin(la) * lean * t * t));
    }
    for (let i = 0; i < 5; i++) {
      const len = pts[i].distanceTo(pts[i + 1]);
      q.setFromUnitVectors(UP, dir.subVectors(pts[i + 1], pts[i]).normalize());
      const r = 0.24 - i * 0.025;
      b.add(seg, new THREE.Matrix4().compose(mid.addVectors(pts[i], pts[i + 1]).multiplyScalar(0.5), q, scale.set(r, len * 1.04, r)), TRUNK);
    }
    const top = pts[5];
    const green = new THREE.Color().setHSL(0.24 + rand() * 0.06, 0.5, 0.26 + rand() * 0.08);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + rand() * 0.3;
      const d = V(Math.cos(a), 0, Math.sin(a));
      const side = V(-d.z, 0, d.x);
      const droop = 0.5 + rand() * 0.5;
      const p1 = top.clone().addScaledVector(d, 1.6).add(V(0, 0.45, 0));
      const p2 = top.clone().addScaledVector(d, 3.2).add(V(0, -droop, 0));
      leaf(b, top, p1, 0.08, 0.55, side, green);
      leaf(b, p1, p2, 0.55, 0.05, side, green);
    }
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      b.add(nut, new THREE.Matrix4().setPosition(top.x + Math.cos(a) * 0.25, top.y - 0.25, top.z + Math.sin(a) * 0.25), nutCol);
    }
    cols.push(RAPIER.ColliderDesc.cylinder(1.5, 0.25).setTranslation(x, y0 + 1.5, z));
  }
}

// --- Textures --------------------------------------------------------------------------------

function canvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: boolean) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/** Near-white grain: the dry/wet hue comes from the sand's vertex colours. */
function sandTexture() {
  const rand = seeded(5);
  return canvasTexture(128, 128, (g) => {
    g.fillStyle = '#f2f2f2';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 2500; i++) {
      const v = (190 + rand() * 65) | 0;
      g.fillStyle = `rgb(${v},${v},${v})`;
      g.fillRect(rand() * 128, rand() * 128, 1 + rand() * 1.5, 1 + rand() * 1.5);
    }
  }, true);
}

/** Foam streaks: bright at the landward edge (u = 0), thinning out seawards. */
function foamTexture() {
  const rand = seeded(9);
  return canvasTexture(128, 128, (g) => {
    for (let i = 0; i < 900; i++) {
      const u = rand();
      const a = u < 0.3 ? 0.4 + (u / 0.3) * 0.6 : (1 - u) / 0.7;
      g.fillStyle = `rgba(255,255,255,${(a * (0.4 + rand() * 0.6)).toFixed(2)})`;
      g.beginPath();
      g.ellipse(u * 128, rand() * 128, 2 + rand() * 4, 3 + rand() * 8, 0, 0, Math.PI * 2);
      g.fill();
    }
  }, true);
}

/** Bright at the lantern (canvas top = cone tip), fading along the beam. */
function beamTexture() {
  return canvasTexture(4, 64, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 64);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 4, 64);
  }, false);
}

/** Equilateral pointed arch from x0 to x1, springing at ySpring, down to yBot. */
function archPath(g: CanvasRenderingContext2D, x0: number, x1: number, ySpring: number, yBot: number) {
  const w = x1 - x0;
  g.beginPath();
  g.moveTo(x0, yBot);
  g.lineTo(x0, ySpring);
  g.arc(x1, ySpring, w, Math.PI, (Math.PI * 4) / 3);
  g.arc(x0, ySpring, w, (Math.PI * 5) / 3, Math.PI * 2);
  g.lineTo(x1, yBot);
  g.closePath();
}

/** Window map (wall-white surround, stone frame, dark glass) + emissive map (stained glass). */
function windowTextures() {
  const glass = (g: CanvasRenderingContext2D) => archPath(g, 16, 48, 50, 119);
  const mullions = (g: CanvasRenderingContext2D, colour: string) => {
    g.strokeStyle = colour;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(32, 26);
    g.lineTo(32, 119);
    g.moveTo(16, 82);
    g.lineTo(48, 82);
    g.stroke();
  };
  const map = canvasTexture(64, 128, (g) => {
    g.fillStyle = '#f3efe6';
    g.fillRect(0, 0, 64, 128);
    archPath(g, 10, 54, 46, 125);
    g.fillStyle = '#9b8f78';
    g.fill();
    glass(g);
    g.fillStyle = '#2c3b52';
    g.fill();
    mullions(g, '#9b8f78');
  }, false);
  const glow = canvasTexture(64, 128, (g) => {
    g.fillStyle = '#000';
    g.fillRect(0, 0, 64, 128);
    glass(g);
    g.save();
    g.clip();
    const grad = g.createLinearGradient(0, 20, 0, 119);
    grad.addColorStop(0, '#ffcc66');
    grad.addColorStop(0.5, '#ff7a4a');
    grad.addColorStop(1, '#6a9cff');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 128);
    g.restore();
    mullions(g, '#000');
  }, false);
  return [map, glow] as const;
}
