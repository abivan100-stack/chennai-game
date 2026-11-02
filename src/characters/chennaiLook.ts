import * as THREE from 'three';

/**
 * Turns the Mixamo hero (red tee, denim shorts, white sneakers) into a Chennai auto driver:
 * khaki uniform shirt, a checked lungi folded up to the knee, brown chappals, browner skin,
 * a thundu (towel) over the shoulder, a moustache, and vibhuti + kumkum on the forehead.
 * The clothes are recoloured in the texture once at load (pixel classification by colour),
 * so the model and its animations are untouched.
 */

const KHAKI = [184, 160, 112];
const CHAPPAL = [92, 56, 32];
const SKIN_TONE = [0.72, 0.58, 0.47]; // multiplies the (pale) source skin
// A dark madras-check lungi: navy ground, bottle-green bands, thin cream and maroon lines.
const LUNGI = { base: [28, 42, 78], band: [26, 74, 58], line: [214, 205, 180], thin: [120, 32, 40], period: 44 };

/** RGB 0-255 -> hue (deg), saturation, value (0-1). */
function hsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max / 255 };
}

/** Madras-check lungi colour at texel (x, y). */
function lungi(x: number, y: number) {
  const p = LUNGI.period;
  const u = x % p;
  const v = y % p;
  if (u < 2 || v < 2) return LUNGI.line;
  if (Math.abs(u - p / 2) < 1 || Math.abs(v - p / 2) < 1) return LUNGI.thin;
  // Where a vertical and a horizontal band cross, the weave reads darker (like real madras).
  const bu = u > p * 0.62 && u < p * 0.86;
  const bv = v > p * 0.62 && v < p * 0.86;
  if (bu && bv) return [LUNGI.band[0] * 0.7, LUNGI.band[1] * 0.7, LUNGI.band[2] * 0.7];
  return bu || bv ? LUNGI.band : LUNGI.base;
}

function recolourTexture(old: THREE.Texture) {
  const img = old.image as CanvasImageSource & { width: number; height: number };
  const w = img.width;
  const h = img.height;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const data = g.getImageData(0, 0, w, h);
  const px = data.data;
  // Find the tee's printed logo (saturated yellow / green on the shirt half of the atlas) so the
  // whole patch, outlines included, can be painted over.
  let bx0 = w, by0 = h, bx1 = 0, by1 = 0;
  for (let i = 0; i < px.length; i += 4) {
    const x = (i / 4) % w;
    if (x > w * 0.45) continue;
    const y = Math.floor(i / 4 / w);
    const { h: hue, s, v } = hsv(px[i], px[i + 1], px[i + 2]);
    if (hue > 35 && hue < 160 && s > 0.45 && v > 0.35) {
      bx0 = Math.min(bx0, x); bx1 = Math.max(bx1, x);
      by0 = Math.min(by0, y); by1 = Math.max(by1, y);
    }
  }
  const pad = w * 0.012;
  const inPrint = (x: number, y: number) => x > bx0 - pad && x < bx1 + pad && y > by0 - pad && y < by1 + pad;
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const gr = px[i + 1];
    const b = px[i + 2];
    const { h: hue, s, v } = hsv(r, gr, b);
    const x = (i / 4) % w;
    const y = Math.floor(i / 4 / w);
    // The eye texture sits on red too: leave the eye block alone (upper middle of the atlas).
    const eyeBlock = x > w * 0.3 && x < w * 0.52 && y > h * 0.24 && y < h * 0.38;
    let out: number[] | null = null;
    let shade = v;
    if (!eyeBlock && (hue < 18 || hue > 340) && s > 0.45 && v > 0.25) {
      out = KHAKI; // red tee -> khaki shirt
      shade = Math.min(1.15, v / 0.75);
    } else if (!eyeBlock && bx1 > bx0 && inPrint(x, y)) {
      out = KHAKI; // the tee's printed logo, outlines and all
      shade = 0.95;
    } else if (hue > 185 && hue < 230 && s > 0.12 && s < 0.7 && v > 0.25) {
      out = lungi(x, y); // denim shorts -> checked lungi
      shade = Math.min(1.25, 0.35 + v * 0.9); // keep the folds' shading
    } else if (s < 0.25 && v > 0.4 && y > h * 0.33) {
      out = CHAPPAL; // white sneakers (and their grey soles) -> brown leather chappals
      shade = Math.min(1, v + 0.15);
    } else if (hue >= 0 && hue < 45 && s > 0.12 && s < 0.6 && v > 0.3) {
      // skin: deeper brown, keep the shading and the tattoos' contrast
      px[i] = r * SKIN_TONE[0];
      px[i + 1] = gr * SKIN_TONE[1];
      px[i + 2] = b * SKIN_TONE[2];
    }
    if (out) {
      px[i] = Math.min(255, out[0] * shade);
      px[i + 1] = Math.min(255, out[1] * shade);
      px[i + 2] = Math.min(255, out[2] * shade);
    }
  }
  g.putImageData(data, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.flipY = old.flipY;
  tex.colorSpace = old.colorSpace;
  tex.wrapS = old.wrapS;
  tex.wrapT = old.wrapT;
  tex.anisotropy = old.anisotropy;
  tex.channel = old.channel;
  return tex;
}

/** Thundu: cream cotton with a red-and-maroon border along both long edges, faint weave. */
function towelTexture() {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#eee6d2';
  g.fillRect(0, 0, 64, 256);
  g.fillStyle = 'rgba(120, 100, 70, 0.08)';
  for (let y = 0; y < 256; y += 3) g.fillRect(0, y, 64, 1);
  for (const x of [3, 55]) {
    g.fillStyle = '#b3202a';
    g.fillRect(x, 0, 6, 256);
    g.fillStyle = '#5a1018';
    g.fillRect(x + 1, 0, 1, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * The towel as one draped strip (model space): hangs down the chest, curves over the left
 * shoulder, hangs down the back. A segmented ribbon, so it reads as cloth, not boxes.
 */
function towelGeometry(shoulder: THREE.Vector3) {
  const W = 0.13;
  const SEGS = 24;
  const FRONT = 0.3; // hanging length in front / behind
  const R = 0.105; // half the shoulder's depth
  const top = shoulder.y + 0.075;
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= SEGS; i++) {
    const t = i / SEGS;
    let y: number;
    let z: number;
    if (t < 0.35) {
      const k = (0.35 - t) / 0.35;
      z = R + 0.015 * k; // falls slightly away from the chest
      y = top - FRONT * k;
    } else if (t > 0.65) {
      const k = (t - 0.65) / 0.35;
      z = -R - 0.01 * k;
      y = top - FRONT * 0.8 * k;
    } else {
      const a = ((t - 0.35) / 0.3) * Math.PI;
      z = R * Math.cos(a);
      y = top + 0.03 * Math.sin(a);
    }
    pts.push(new THREE.Vector3(shoulder.x + 0.045, y, shoulder.z + z));
  }
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  pts.forEach((p, i) => {
    pos.push(p.x - W / 2, p.y, p.z, p.x + W / 2, p.y, p.z);
    uv.push(0, i / SEGS, 1, i / SEGS);
    if (i < SEGS) {
      const a = i * 2;
      idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/**
 * Attach a rigid prop to a bone, at a position / rotation given in the MODEL's space (metres,
 * front = +z, up = +y), measured in the bind pose. Bones carry the armature's 0.01 scale, so
 * the offset is converted through the bone's inverse world matrix.
 */
function attach(model: THREE.Object3D, boneName: string, mesh: THREE.Mesh, modelPos: THREE.Vector3, modelRot = new THREE.Euler()) {
  const bone = model.getObjectByName(boneName);
  if (!bone) return;
  model.updateWorldMatrix(true, true);
  const world = modelPos.clone().applyMatrix4(model.matrixWorld);
  const inv = bone.matrixWorld.clone().invert();
  mesh.position.copy(world.applyMatrix4(inv));
  const boneQ = bone.getWorldQuaternion(new THREE.Quaternion());
  const modelQ = model.getWorldQuaternion(new THREE.Quaternion());
  mesh.quaternion.copy(boneQ.invert().multiply(modelQ).multiply(new THREE.Quaternion().setFromEuler(modelRot)));
  const k = new THREE.Vector3().setFromMatrixScale(model.matrixWorld).x / new THREE.Vector3().setFromMatrixScale(bone.matrixWorld).x;
  mesh.scale.setScalar(k);
  mesh.castShadow = true;
  bone.add(mesh);
}

/** Apply the look to the hero model (call once, before it's first rendered). */
export function applyChennaiLook(model: THREE.Object3D) {
  model.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const mat = o.material as THREE.MeshStandardMaterial;
    if (mat.name === 'Ch42_Body' && mat.map) {
      mat.map = recolourTexture(mat.map);
      mat.roughness = 0.82; // cotton and skin: matte, so the environment light doesn't make it look wet
    }
  });

  // Measure the bind pose in model space to place the props.
  model.updateWorldMatrix(true, true);
  const inModel = (name: string) => {
    const b = model.getObjectByName(name);
    return b ? model.worldToLocal(b.getWorldPosition(new THREE.Vector3())) : null;
  };
  const head = inModel('Head');
  const shoulder = inModel('LeftShoulder');
  const neck = inModel('Neck');
  if (!head || !shoulder || !neck) return;

  // Thundu draped over the left shoulder (geometry in model space, so it's attached at the origin).
  const towelMat = new THREE.MeshStandardMaterial({ map: towelTexture(), roughness: 0.95, side: THREE.DoubleSide });
  attach(model, 'LeftShoulder', new THREE.Mesh(towelGeometry(shoulder), towelMat), new THREE.Vector3());

  // Face details, relative to the head bone (base of the skull): front of the face is ~0.1 m forward.
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.9 });
  attach(model, 'Head', new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.009, 0.012), dark), new THREE.Vector3(head.x, head.y + 0.035, head.z + 0.105));
  const ash = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 1 });
  for (const dy of [0, 0.009, 0.018]) {
    attach(model, 'Head', new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.003, 0.004), ash), new THREE.Vector3(head.x, head.y + 0.115 + dy, head.z + 0.1));
  }
  const kumkum = new THREE.MeshStandardMaterial({ color: 0xc00020, roughness: 0.6 });
  attach(model, 'Head', new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), kumkum), new THREE.Vector3(head.x, head.y + 0.104, head.z + 0.104));
}
