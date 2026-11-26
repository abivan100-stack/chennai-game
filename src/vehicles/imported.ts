import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadModel } from '../core/assets';
import { addPlates, randomPlate, type PlateKind } from './plates';
import type { VehicleModel } from './models';

/**
 * Hand-made vehicle models (Sketchfab, CC-BY: see CREDITS.md) turned into game vehicles at load:
 * one car is picked out of each file, turned to face +z, scaled to the game's size for that kind
 * (so physics, seats and drivers still line up), wheels split out so they spin, untextured parts
 * baked into ONE vertex-coloured material (draw calls stay low), paint recoloured per vehicle,
 * TN plates and night lights added. Until (or unless) they load, models.ts builds its own.
 */
type Name = 'hatch' | 'sedan' | 'mpv' | 'lorry' | 'auto';
interface Source {
  file: string;
  /** Body meshes: this node's mesh name and its `_N` primitives. */
  body: string;
  /** Wheel meshes by name (else: tyre / rim materials nearest the body). */
  wheels?: string[];
  /** Size the model is scaled to (m): length, width, height. */
  size: [number, number, number];
  /** Which way the model faces when there's no headlight material to tell. */
  front?: 1 | -1;
  /** Lamps to add when the model has no light materials: [x, y] on the front / back face (m). */
  lamps?: { head: [number, number][]; tail: [number, number][] };
}
const SOURCES: Record<Name, Source> = {
  hatch: { file: 'hatch.glb', body: 'Cube007', size: [3.85, 1.7, 1.5] },
  sedan: { file: 'sedan.glb', body: 'Cube005', size: [4.0, 1.7, 1.46] },
  mpv: { file: 'mpv.glb', body: 'Cube', size: [4.4, 1.74, 1.75] },
  lorry: { file: 'lorry.glb', body: 'Object_12', wheels: ['Object_4', 'Object_6', 'Object_8', 'Object_10'], size: [4.6, 1.65, 2.1], front: 1 },
  // Traffic autos only (wheels are part of the body, colours are in its texture): yours, the
  // fleet's and the stand's stay procedural (paint jobs, seats tuned to the driving pose).
  auto: { file: 'auto.glb', body: 'persp5', wheels: [], size: [2.62, 1.42, 1.84], front: 1, lamps: { head: [[0, 1.0]], tail: [[0.55, 0.7], [-0.55, 0.7]] } },
};
const WHEEL_MAT = /tire|tyre|rim|wheel|blackbase|black_matte/i;
const PAINT_MAT = /paint|^body(\.\d+)?$/i;
const GLASS_MAT = /window|glass/i;
const HEAD_MAT = /headlight/i;
const TAIL_MAT = /taillight|tail/i;
const HIDE_MAT = /numplate/i; // their blank plates: ours go on top

interface Part { geo: THREE.BufferGeometry; mat: THREE.Material; role: 'paint' | 'glass' | 'head' | 'tail' | 'other' }
interface Template { lamps?: Source['lamps']; parts: Part[]; wheels: { geo: THREE.BufferGeometry; at: THREE.Vector3 }[]; wheelR: number; plateY: number; front: number; back: number; roof: number }
const templates = new Map<Name, Template>();

/** Flat-coloured parts share one material: their colour moves into the vertices. */
const BAKED = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.15 });

/** Load and prepare every imported vehicle; failures fall back to the procedural models. */
export async function loadImportedVehicles() {
  await Promise.all(
    (Object.keys(SOURCES) as Name[]).map(async (name) => {
      try {
        templates.set(name, prepare((await loadModel(`vehicles/${SOURCES[name].file}`)).scene, SOURCES[name]));
      } catch (e) {
        console.warn(`[vehicles] ${name}: kept the procedural model`, e);
      }
    }),
  );
  console.log(`[vehicles] imported: ${[...templates.keys()].join(', ')}`);
}

function prepare(root: THREE.Object3D, src: Source): Template {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
  const matName = (m: THREE.Mesh) => (m.material as THREE.Material).name;
  const isBody = (m: THREE.Mesh) => m.name === src.body || m.name.startsWith(`${src.body}_`);
  const body = meshes.filter(isBody);
  const centreOf = (ms: THREE.Mesh[]) => ms.reduce((b, m) => b.union(new THREE.Box3().setFromObject(m)), new THREE.Box3()).getCenter(new THREE.Vector3());
  const bodyC = centreOf(body);

  // Wheels: named, or tyre / rim meshes clustered by centre, the 4 clusters nearest the body.
  let wheelGroups: THREE.Mesh[][];
  if (src.wheels) wheelGroups = src.wheels.map((n) => meshes.filter((m) => m.name === n || m.name.startsWith(`${n}_`)));
  else {
    const loose = meshes.filter((m) => !isBody(m) && WHEEL_MAT.test(matName(m)));
    const clusters: { c: THREE.Vector3; ms: THREE.Mesh[] }[] = [];
    for (const m of loose) {
      const c = new THREE.Box3().setFromObject(m).getCenter(new THREE.Vector3());
      const hit = clusters.find((k) => k.c.distanceTo(c) < 0.35);
      if (hit) hit.ms.push(m);
      else clusters.push({ c, ms: [m] });
    }
    clusters.sort((a, b) => Math.hypot(a.c.x - bodyC.x, a.c.z - bodyC.z) - Math.hypot(b.c.x - bodyC.x, b.c.z - bodyC.z));
    wheelGroups = clusters.slice(0, 4).map((k) => k.ms);
  }
  const wheelC = wheelGroups.map(centreOf);

  // Frame: forward from the rear axle to the front one (the front pair is nearest the headlights).
  const head = body.find((m) => HEAD_MAT.test(matName(m)));
  const headC = head ? centreOf([head]) : null;
  const mid = wheelC.length ? wheelC.reduce((a, c) => a.add(c), new THREE.Vector3()).multiplyScalar(1 / wheelC.length) : bodyC.clone();
  let axis = new THREE.Vector3(0, 0, src.front ?? 1);
  if (headC) {
    const byHead = [...wheelC].sort((a, b) => a.distanceTo(headC) - b.distanceTo(headC));
    axis = byHead[0].clone().add(byHead[1]).sub(byHead[2]).sub(byHead[3]).setY(0).normalize();
  } else if (wheelC.length === 4) {
    // No headlights: the long side of the wheel rectangle, pointing the way src.front says.
    const sorted = [...wheelC].sort((a, b) => (a.z - b.z) * (src.front ?? 1));
    axis = sorted[2].clone().add(sorted[3]).sub(sorted[0]).sub(sorted[1]).setY(0).normalize();
  }
  const yaw = Math.atan2(axis.x, axis.z);
  const toLocal = new THREE.Matrix4().makeRotationY(-yaw).multiply(new THREE.Matrix4().makeTranslation(-mid.x, 0, -mid.z));
  const all = [...body, ...wheelGroups.flat()];
  const bake = (m: THREE.Mesh) => floats(m.geometry).applyMatrix4(new THREE.Matrix4().multiplyMatrices(toLocal, m.matrixWorld));

  // Size in the local frame, then scale to the game's size for this kind.
  const box = new THREE.Box3();
  for (const m of all) box.union(bakedBox(bake(m)));
  const [L, W, H] = src.size;
  const s = new THREE.Vector3(W / (box.max.x - box.min.x), H / (box.max.y - box.min.y), L / (box.max.z - box.min.z));
  const zMid = (box.max.z + box.min.z) / 2;
  const fit = new THREE.Matrix4().makeScale(s.x, s.y, s.z).multiply(new THREE.Matrix4().makeTranslation(0, -box.min.y, -zMid)).multiply(toLocal);
  const local = (m: THREE.Mesh) => floats(m.geometry).applyMatrix4(new THREE.Matrix4().multiplyMatrices(fit, m.matrixWorld));

  // Body parts by role; flat-coloured "other" parts merge into one vertex-coloured mesh.
  const parts: Part[] = [];
  const baked: THREE.BufferGeometry[] = [];
  let plateY = 0.5;
  for (const m of body) {
    const mat = m.material as THREE.MeshStandardMaterial;
    const n = mat.name;
    const g = local(m);
    if (HIDE_MAT.test(n)) {
      plateY = bakedBox(g).getCenter(new THREE.Vector3()).y;
      continue;
    }
    const role: Part['role'] = PAINT_MAT.test(n) ? 'paint' : GLASS_MAT.test(n) ? 'glass' : HEAD_MAT.test(n) ? 'head' : TAIL_MAT.test(n) ? 'tail' : 'other';
    if (role === 'other' && !mat.map) baked.push(colourise(g, mat.color));
    else parts.push({ geo: g, mat, role });
  }
  if (baked.length) parts.push({ geo: mergeGeometries(baked.map(plain))!, mat: BAKED, role: 'other' });

  // Wheels: each one merged and centred on its hub, spun about x by traffic.ts.
  const wheels = wheelGroups.map((ms) => {
    const gs = ms.map((m) => {
      const g = local(m);
      const mat = m.material as THREE.MeshStandardMaterial;
      return mat.map ? g : colourise(g, mat.color);
    });
    const textured = ms.some((m) => (m.material as THREE.MeshStandardMaterial).map);
    const g = textured ? gs[0] : mergeGeometries(gs.map(plain))!;
    const at = bakedBox(g).getCenter(new THREE.Vector3());
    g.translate(-at.x, -at.y, -at.z);
    if (textured) g.userData.mat = ms[0].material;
    return { geo: g, at };
  });
  const wheelR = wheels.length ? bakedBox(wheels[0].geo).getSize(new THREE.Vector3()).y / 2 : 0.3;
  return { lamps: src.lamps, parts, wheels, wheelR, plateY, front: L / 2, back: -L / 2, roof: H };
}

/**
 * Copy with every attribute as plain floats: meshopt-compressed models store positions / normals
 * / UVs quantised to normalised int8 / int16, which applyMatrix4 can't write into.
 */
function floats(src: THREE.BufferGeometry) {
  const g = new THREE.BufferGeometry();
  for (const [k, a] of Object.entries(src.attributes)) {
    const n = a.count;
    const out = new Float32Array(n * a.itemSize);
    for (let i = 0; i < n; i++) for (let c = 0; c < a.itemSize; c++) out[i * a.itemSize + c] = a.getComponent(i, c);
    g.setAttribute(k, new THREE.BufferAttribute(out, a.itemSize));
  }
  if (src.index) g.setIndex(src.index.clone());
  return g;
}
function bakedBox(g: THREE.BufferGeometry) {
  g.computeBoundingBox();
  return g.boundingBox!;
}
/** Only position / normal / colour, so differently-sourced parts can merge. */
function plain(g: THREE.BufferGeometry) {
  const out = (g.index ? g.toNonIndexed() : g).clone();
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'color'].includes(k)) out.deleteAttribute(k);
  if (!out.attributes.normal) out.computeVertexNormals();
  return out;
}
function colourise(g: THREE.BufferGeometry, c: THREE.Color) {
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

const paintCache = new Map<string, THREE.MeshStandardMaterial>();
const wheelMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.2 });

/** Build an imported vehicle into `group` (front +z, ground y 0), or null if it didn't load. */
export function importedModel(name: Name, group: THREE.Group, colour: number | null, kind: PlateKind = 'private', plate = randomPlate(kind)): VehicleModel | null {
  const t = templates.get(name);
  if (!t) return null;
  const head = new THREE.MeshStandardMaterial({ color: 0xfffbe8, emissive: 0xfff0c0, emissiveIntensity: 0.2, roughness: 0.2 });
  const tail = new THREE.MeshStandardMaterial({ color: 0xa00000, emissive: 0xff2000, emissiveIntensity: 0.4, roughness: 0.3 });
  for (const p of t.parts) {
    let mat = p.mat;
    if (p.role === 'head') mat = head;
    else if (p.role === 'tail') mat = tail;
    else if (p.role === 'paint' && colour !== null) {
      const key = `${(p.mat as THREE.Material).uuid}:${colour}`;
      let m = paintCache.get(key);
      if (!m) {
        m = (p.mat as THREE.MeshStandardMaterial).clone();
        m.color.setHex(colour);
        m.metalness = Math.min(m.metalness, 0.4); // no env map up close: fully metallic paint goes black
        m.roughness = 0.25;
        paintCache.set(key, m);
      }
      mat = m;
    }
    const mesh = new THREE.Mesh(p.geo, mat);
    mesh.castShadow = p.role !== 'glass' && p.role !== 'head' && p.role !== 'tail';
    mesh.receiveShadow = true;
    group.add(mesh);
  }
  if (t.lamps) {
    const lamp = (at: [number, number][], z: number, mat: THREE.Material, w: number) => {
      for (const [x, y] of at) {
        const m = new THREE.Mesh(new THREE.BoxGeometry(w, w * 0.7, 0.04), mat);
        m.position.set(x, y, z);
        group.add(m);
      }
    };
    lamp(t.lamps.head, t.front, head, 0.16);
    lamp(t.lamps.tail, t.back, tail, 0.1);
  }
  addPlates(group, plate, kind, { y: t.plateY, z: t.front }, { y: t.plateY + 0.1, z: t.back }, 0.42);
  const wheels = t.wheels.map((w) => {
    const m = new THREE.Mesh(w.geo, (w.geo.userData.mat as THREE.Material) ?? wheelMat);
    m.position.copy(w.at);
    m.castShadow = false;
    group.add(m);
    return m;
  });
  return { wheels, wheelR: t.wheelR, lights: [head, tail] };
}

/** Roof height of an imported model (for a taxi sign), or null. */
export function importedRoof(name: Name) {
  return templates.get(name)?.roof ?? null;
}
