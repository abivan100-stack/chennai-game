import * as THREE from 'three';

/**
 * Dev-only F4 overlay: where the frame's triangles and draw calls come from, by category, for
 * the main pass (camera frustum) and the shadow pass (sun shadow camera frustum), plus the 10
 * heaviest meshes. An estimate from the scene graph (bounding spheres vs frustums); the F3 panel
 * shows the renderer's real totals (renderer.info counts the shadow pass too).
 *
 * Categories: objects get `userData.perf` when they're created (main.ts tags scene children
 * after each world builder); skinned meshes are NPCs (or the player), traffic groups vehicles.
 */
export type PerfRow = { cat: string; tris: number; calls: number; shadowTris: number; shadowCalls: number };
export interface PerfReport {
  rows: PerfRow[];
  top: { name: string; cat: string; tris: number; instances: number; shadow: boolean }[];
  total: PerfRow;
  big: { name: string; cat: string; tris: number }[];
  textureMB: number;
}

const REFRESH_MS = 500;
const _frustum = new THREE.Frustum();
const _m = new THREE.Matrix4();
const _sphere = new THREE.Sphere();

/** Triangles one draw of this mesh's geometry renders (indexed or not, respecting draw range). */
function trisOf(g: THREE.BufferGeometry) {
  const n = g.index ? g.index.count : g.attributes.position?.count ?? 0;
  const range = Math.min(n, g.drawRange.count);
  return Math.floor(range / 3);
}

export class Profiler {
  private readonly el: HTMLDivElement;
  private acc = 0;
  last: PerfReport | null = null;
  private readonly scene: THREE.Scene;
  private readonly camera: THREE.Camera;
  private readonly shadowCam: () => THREE.Camera | null;
  private readonly classify: (o: THREE.Object3D) => string | null;
  private readonly renderer: THREE.WebGLRenderer;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, shadowCam: () => THREE.Camera | null, classify: (o: THREE.Object3D) => string | null) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.shadowCam = shadowCam;
    this.classify = classify;
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed', right: '8px', top: '60px', zIndex: '50', display: 'none', background: 'rgba(0,0,0,0.78)', color: '#e8e8e8',
      font: '12px ui-monospace, monospace', padding: '8px 10px', borderRadius: '6px', whiteSpace: 'pre', pointerEvents: 'none',
    } as Partial<CSSStyleDeclaration>);
    document.body.appendChild(this.el);
  }

  get visible() {
    return this.el.style.display === 'block';
  }

  toggle() {
    this.el.style.display = this.visible ? 'none' : 'block';
  }

  /** Category of a mesh: the first tag up its ancestor chain (or the classifier's answer). */
  private catOf(o: THREE.Object3D) {
    const c = this.classify(o);
    if (c) return c;
    for (let a: THREE.Object3D | null = o; a; a = a.parent) if (a.userData.perf) return a.userData.perf as string;
    return 'other';
  }

  /** Walk the scene once and total everything up. */
  measure(): PerfReport {
    this.camera.updateMatrixWorld();
    _frustum.setFromProjectionMatrix(_m.multiplyMatrices(this.camera.projectionMatrix, this.camera.matrixWorldInverse));
    const main = _frustum.clone();
    const sc = this.shadowCam();
    let shadow: THREE.Frustum | null = null;
    if (sc && this.renderer.shadowMap.enabled) {
      sc.updateMatrixWorld();
      shadow = new THREE.Frustum().setFromProjectionMatrix(_m.multiplyMatrices(sc.projectionMatrix, sc.matrixWorldInverse));
    }
    const rows = new Map<string, PerfRow>();
    const top: PerfReport['top'] = [];
    const big: PerfReport['big'] = [];
    const seen = new Set<THREE.BufferGeometry>();
    this.scene.traverseVisible((o) => {
      const mesh = o as THREE.Mesh;
      if (!(mesh.isMesh || (o as THREE.Points).isPoints || (o as THREE.Line).isLine)) return;
      const g = mesh.geometry as THREE.BufferGeometry;
      if (!g?.attributes?.position) return;
      const inst = (o as THREE.InstancedMesh).isInstancedMesh ? (o as THREE.InstancedMesh).count : 1;
      const per = trisOf(g);
      const mats = Array.isArray(mesh.material) ? mesh.material.length : 1;
      let inView = true;
      let inShadow = !!shadow && o.castShadow;
      if (o.frustumCulled) {
        if ((o as THREE.InstancedMesh).isInstancedMesh) {
          const im = o as THREE.InstancedMesh;
          if (!im.boundingSphere) im.computeBoundingSphere();
          _sphere.copy(im.boundingSphere!).applyMatrix4(o.matrixWorld);
        } else {
          if (!g.boundingSphere) g.computeBoundingSphere();
          _sphere.copy(g.boundingSphere!).applyMatrix4(o.matrixWorld);
        }
        inView = main.intersectsSphere(_sphere);
        if (inShadow) inShadow = shadow!.intersectsSphere(_sphere);
      }
      const cat = this.catOf(o);
      let r = rows.get(cat);
      if (!r) rows.set(cat, (r = { cat, tris: 0, calls: 0, shadowTris: 0, shadowCalls: 0 }));
      const tris = per * inst;
      if (inView) {
        r.tris += tris;
        r.calls += mats;
      }
      if (inShadow) {
        r.shadowTris += tris;
        r.shadowCalls += mats;
      }
      if (inView || inShadow) top.push({ name: o.name || g.name || `${o.type}${(mesh.material as THREE.Material)?.type ? ':' + (mesh.material as THREE.Material).type : ''}`, cat, tris, instances: inst, shadow: inShadow });
      if (!seen.has(g)) {
        seen.add(g);
        if (per > 20000) big.push({ name: o.name || g.name || o.type, cat, tris: per });
      }
    });
    top.sort((a, b) => b.tris - a.tris);
    const list = [...rows.values()].sort((a, b) => b.tris + b.shadowTris - a.tris - a.shadowTris);
    const total = list.reduce((t, r) => ({ cat: 'TOTAL', tris: t.tris + r.tris, calls: t.calls + r.calls, shadowTris: t.shadowTris + r.shadowTris, shadowCalls: t.shadowCalls + r.shadowCalls }), { cat: 'TOTAL', tris: 0, calls: 0, shadowTris: 0, shadowCalls: 0 });
    // Texture memory (GPU estimate): width x height x 4 bytes x 4/3 for mipmaps, every texture once.
    const tex = new Set<THREE.Texture>();
    this.scene.traverse((o) => {
      const ms = (o as THREE.Mesh).material;
      for (const m of Array.isArray(ms) ? ms : ms ? [ms] : []) for (const v of Object.values(m)) if ((v as THREE.Texture)?.isTexture) tex.add(v as THREE.Texture);
    });
    let bytes = 0;
    for (const t of tex) {
      const img = t.image as { width?: number; height?: number } | undefined;
      if (img?.width && img.height) bytes += img.width * img.height * 4 * (t.generateMipmaps ? 4 / 3 : 1);
    }
    this.last = { rows: list, top: top.slice(0, 10), total, big: big.sort((a, b) => b.tris - a.tris), textureMB: bytes / 1048576 };
    return this.last;
  }

  /** Call once per frame (after render); refreshes the overlay twice a second while it's open. */
  update(frameMs: number) {
    if (!this.visible) return;
    this.acc += frameMs;
    if (this.acc < REFRESH_MS) return;
    this.acc = 0;
    const r = this.measure();
    const k = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(0)}k` : `${n}`);
    const line = (x: PerfRow) => `${x.cat.padEnd(11)} ${k(x.tris).padStart(6)} ${String(x.calls).padStart(5)}  ${k(x.shadowTris).padStart(6)} ${String(x.shadowCalls).padStart(5)}`;
    const info = this.renderer.info.render;
    this.el.textContent = [
      'F4 perf (estimate)    main         shadow',
      'category      tris  calls    tris  calls',
      ...r.rows.map(line),
      line(r.total),
      `renderer.info (real, main+shadow): ${k(info.triangles)} tris, ${info.calls} calls`,
      `textures ~${r.textureMB.toFixed(0)} MB`,
      '',
      'heaviest meshes (tris x instances)',
      ...r.top.map((t) => `${k(t.tris).padStart(6)}  ${t.cat.padEnd(10)} ${t.instances > 1 ? `x${t.instances} ` : ''}${t.shadow ? '[s] ' : ''}${t.name.slice(0, 34)}`),
      ...(r.big.length ? ['', 'meshes over 20k tris:', ...r.big.slice(0, 6).map((b) => `${k(b.tris).padStart(6)}  ${b.cat} ${b.name.slice(0, 34)}`)] : []),
    ].join('\n');
  }
}
