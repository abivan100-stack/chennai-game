import * as THREE from 'three';

/**
 * Split big merged static meshes into map chunks so whole chunks off screen (or outside the sun's
 * shadow box) are culled, and merge what shares a look within each chunk to keep draw calls down.
 *
 * Many world builders merge a whole kind of place into one mesh (every petrol stop, cafe or
 * landmark on the map): its bounding sphere then covers half the town and it is never culled,
 * costing ~0.5M triangles a frame plus the shadow pass. Splitting alone multiplies draw calls,
 * because each builder has its own (identical) materials; so inside each cell, pieces whose
 * materials are interchangeable (plain vertex-coloured, no texture, nothing that changes at night)
 * are merged into one mesh with one shared material.
 *
 * Only plain meshes sitting directly in the scene at the origin, with a standard / basic material
 * (no shader tricks, no material groups) are touched. Big ones (> MIN_RADIUS) are split; small
 * plain ones are pulled into their cell's merge too. Shadow flags, render order and userData carry
 * over; the originals are removed.
 */
const CHUNK = 120; // m
const MIN_RADIUS = 90; // m: smaller meshes already cull fine (but may still be merged)

type Piece = { geo: THREE.BufferGeometry; tris: number[] | null; src: THREE.Mesh };

/** Same look = can share one material. Null: keep its own (texture, glow that changes at night...). */
function signature(m: THREE.Material, mesh: THREE.Mesh) {
  const s = m as THREE.MeshStandardMaterial;
  if (!s.isMeshStandardMaterial || !s.vertexColors || s.map || s.transparent || s.emissiveMap) return null;
  if (s.emissive && s.emissive.getHex() !== 0) return null; // night glow is driven per material
  return ['std', s.roughness, s.metalness, s.side, s.flatShading, s.color.getHex(), mesh.castShadow, mesh.receiveShadow, mesh.renderOrder].join('|');
}

function plain(o: THREE.Object3D) {
  const mesh = o as THREE.Mesh;
  if (!mesh.isMesh || (o as THREE.InstancedMesh).isInstancedMesh || (o as THREE.SkinnedMesh).isSkinnedMesh || (o as THREE.BatchedMesh).isBatchedMesh) return null;
  if (Array.isArray(mesh.material) || !mesh.visible) return null;
  const mat = mesh.material as THREE.Material;
  if (!((mat as THREE.MeshStandardMaterial).isMeshStandardMaterial || (mat as THREE.MeshBasicMaterial).isMeshBasicMaterial)) return null;
  if (mat.onBeforeCompile !== THREE.Material.prototype.onBeforeCompile) return null; // custom shader (e.g. the sea)
  if (o.position.lengthSq() || o.rotation.x || o.rotation.y || o.rotation.z || o.scale.x !== 1 || o.scale.y !== 1 || o.scale.z !== 1) return null;
  const g = mesh.geometry as THREE.BufferGeometry;
  if (g.groups.length > 1 || g.morphAttributes.position || !g.attributes.position) return null;
  return mesh;
}

export function chunkStaticMeshes(scene: THREE.Scene) {
  // cell -> group key (signature or material uuid) -> pieces
  const cells = new Map<string, Map<string, Piece[]>>();
  const shared = new Map<string, THREE.Material>();
  const removed: THREE.Mesh[] = [];
  const cellOf = (x: number, z: number) => `${Math.floor(x / CHUNK)},${Math.floor(z / CHUNK)}`;
  const put = (cell: string, key: string, p: Piece) => {
    let c = cells.get(cell);
    if (!c) cells.set(cell, (c = new Map()));
    let l = c.get(key);
    if (!l) c.set(key, (l = []));
    l.push(p);
  };
  // Materials used by several meshes (e.g. every kit's bulbs) can merge too, without a signature.
  const uses = new Map<THREE.Material, number>();
  for (const o of scene.children) {
    const m = plain(o);
    if (m) uses.set(m.material as THREE.Material, (uses.get(m.material as THREE.Material) ?? 0) + 1);
  }
  for (const o of [...scene.children]) {
    const mesh = plain(o);
    if (!mesh || o.userData.perf === 'ground') continue; // the ground is already tiled by material
    const g = mesh.geometry as THREE.BufferGeometry;
    if (!g.boundingSphere) g.computeBoundingSphere();
    const big = g.boundingSphere!.radius >= MIN_RADIUS;
    const sig = signature(mesh.material as THREE.Material, mesh);
    if (!big && !sig && (uses.get(mesh.material as THREE.Material) ?? 0) < 2) continue; // small and unique: leave it alone
    const key = sig ?? `${(mesh.material as THREE.Material).uuid}|${mesh.castShadow}|${mesh.receiveShadow}|${mesh.renderOrder}`;
    if (sig && !shared.has(sig)) shared.set(sig, mesh.material as THREE.Material);
    const flat = g.index ? g.toNonIndexed() : g;
    if (!big) {
      put(cellOf(g.boundingSphere!.center.x, g.boundingSphere!.center.z), key, { geo: flat, tris: null, src: mesh });
    } else {
      const pos = flat.attributes.position;
      const per = new Map<string, number[]>();
      for (let t = 0; t < pos.count / 3; t++) {
        const cx = (pos.getX(t * 3) + pos.getX(t * 3 + 1) + pos.getX(t * 3 + 2)) / 3;
        const cz = (pos.getZ(t * 3) + pos.getZ(t * 3 + 1) + pos.getZ(t * 3 + 2)) / 3;
        const c = cellOf(cx, cz);
        let l = per.get(c);
        if (!l) per.set(c, (l = []));
        l.push(t);
      }
      for (const [c, tris] of per) put(c, key, { geo: flat, tris, src: mesh });
    }
    removed.push(mesh);
  }
  // Build one mesh per cell per group.
  let made = 0;
  for (const groups of cells.values()) {
    for (const [key, pieces] of groups) {
      // Attributes every piece has (a merged mesh needs the same set on all of them).
      const names = Object.keys(pieces[0].geo.attributes).filter((n) => pieces.every((p) => p.geo.attributes[n] && p.geo.attributes[n].itemSize === pieces[0].geo.attributes[n].itemSize));
      let total = 0;
      for (const p of pieces) total += p.tris ? p.tris.length : p.geo.attributes.position.count / 3;
      const part = new THREE.BufferGeometry();
      for (const n of names) {
        const size = pieces[0].geo.attributes[n].itemSize;
        const out = new Float32Array(total * 3 * size);
        let o = 0;
        for (const p of pieces) {
          const a = p.geo.attributes[n] as THREE.BufferAttribute;
          if (!p.tris) {
            for (let i = 0; i < a.count * size; i++) out[o++] = a.array[i];
          } else {
            for (const t of p.tris) for (let i = t * 3 * size; i < (t + 1) * 3 * size; i++) out[o++] = a.array[i];
          }
        }
        part.setAttribute(n, new THREE.BufferAttribute(out, size, pieces[0].geo.attributes[n].normalized));
      }
      part.computeBoundingSphere();
      const src = pieces[0].src;
      const m = new THREE.Mesh(part, shared.get(key) ?? (src.material as THREE.Material));
      m.castShadow = src.castShadow;
      m.receiveShadow = src.receiveShadow;
      m.renderOrder = src.renderOrder;
      m.userData = { ...src.userData };
      m.matrixAutoUpdate = false; // static: never moves
      scene.add(m);
      made++;
    }
  }
  for (const m of removed) scene.remove(m);
  console.log(`[perf] ${removed.length} static meshes -> ${made} map-chunk meshes`);
}
