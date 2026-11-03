import * as THREE from 'three';

/**
 * Dresses the Mixamo hero (red tee, denim shorts, white sneakers) as a Chennai guy in a plain
 * mustard t-shirt (untucked) and ordinary charcoal cotton trousers, white sneakers, with browner
 * skin, a moustache and vibhuti + kumkum.
 *
 * The model's forearms and shins are bare skin, so the texture is repainted per BODY PART: each
 * triangle's UVs are rasterised into a mask coloured by the bone that drives it (arm -> sleeve,
 * leg -> trouser, foot -> shoe, hand / head -> skin). Clothes then follow the arms and legs to the
 * wrists and ankles. Done once at load; the mesh and animations are untouched.
 */

// Hero outfit: a plain mustard t-shirt (short sleeves, untucked) and loose charcoal cotton trousers.
const TEE = [206, 150, 48];
const TROUSERS = [62, 64, 70];
const ARM_SKIN = [150, 102, 74]; // bare forearms (matches the browned face / hands)
const TEE_HEM_DROP = 0.07; // m below the waist line where the tee ends
const LOOSE = { hip: 0.003, ankle: 0.008 }; // m the trouser legs stand off the body: ordinary straight trousers, just not skin-tight
const SKIN_TONE = [0.72, 0.58, 0.47]; // multiplies the (pale) source skin
const WAIST_ABOVE_HIPS = 0.05; // m above the hip joint where the shirt meets the trousers (the belt line)
const BELT_HEIGHT = 0.04;
const HERO_HEIGHT = 1.7; // the model's height in metres (catalog fits every character to this)

type Part = 'shirt' | 'pants' | 'shoes' | 'skin' | 'arm' | 'none';
const MASK_COLOUR: Record<Part, string> = { shirt: '#f00', pants: '#0f0', shoes: '#00f', skin: '#ff0', arm: '#0ff', none: '#000' };

/** Which garment covers a bone (Mixamo names, prefix already stripped by the pipeline). */
function partOf(bone: string, shortSleeves = false): Part {
  if (/Hand|Thumb|Index|Middle|Ring|Pinky/.test(bone)) return 'skin';
  if (shortSleeves && /ForeArm/.test(bone)) return 'arm'; // bare forearm: repainted plain skin (the model has tattoos there)
  if (/Foot|Toe/.test(bone)) return 'shoes';
  if (/UpLeg|Leg/.test(bone) || bone === 'Hips') return 'pants';
  if (/Arm|Spine|Shoulder/.test(bone)) return 'shirt';
  return 'none'; // head, neck, eyes
}

/** Cheap repeatable 0..1 noise per texel. */
function hash(x: number, y: number) {
  const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return n - Math.floor(n);
}

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

/** Paint every triangle's UV footprint in the colour of the garment its bones say it is. */
function partMask(mesh: THREE.SkinnedMesh, w: number, h: number, opts: { shortSleeves?: boolean; hemDrop?: number } = {}) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, w, h);
  const geo = mesh.geometry;
  const uv = geo.attributes.uv;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const bones = mesh.skeleton.bones.map((b) => partOf(b.name, opts.shortSleeves));
  // Torso bones: around the waist the hem is decided by height, not by which bone wins.
  const torso = mesh.skeleton.bones.map((b) => b.name === 'Hips' || b.name.startsWith('Spine'));
  const index = geo.index ? Array.from(geo.index.array) : [...Array(uv.count).keys()];
  // Bind-pose world height of each vertex vs the waist line (the model is in its bind pose here).
  const bind = bindPose(mesh);
  const waist = bind.waistY - (opts.hemDrop ?? 0) * bind.unit; // an untucked tee hangs below the waist
  const tmp = new THREE.Vector3();
  const vote = new Map<Part, number>();
  for (let t = 0; t < index.length; t += 3) {
    vote.clear();
    let torsoW = 0;
    let height = 0;
    const hs = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const v = index[t + k];
      hs[k] = bind.at(v, tmp).y;
      height += hs[k] / 3; // rest pose: the same whatever the model is doing now
      for (let j = 0; j < 4; j++) {
        const b = si.getComponent(v, j);
        const wt = sw.getComponent(v, j);
        vote.set(bones[b], (vote.get(bones[b]) ?? 0) + wt);
        if (torso[b]) torsoW += wt;
      }
    }
    let best: Part = 'none';
    let bestW = -1;
    for (const [p, wt] of vote) {
      if (wt > bestW) {
        best = p;
        bestW = wt;
      }
    }
    // Mostly hips / spine: a straight hem at the waist instead of a zig-zag.
    if ((best === 'shirt' || best === 'pants') && (torsoW > 0.8 || Math.abs(height - waist) < 0.12 * bind.unit)) best = height > waist ? 'shirt' : 'pants';
    g.fillStyle = MASK_COLOUR[best];
    g.strokeStyle = MASK_COLOUR[best];
    // A triangle the hem line crosses: split it exactly at the hem (a hard gradient across it).
    if ((best === 'shirt' || best === 'pants') && Math.min(...hs) < waist && Math.max(...hs) > waist) {
      const P = [0, 1, 2].map((k) => [uv.getX(index[t + k]) * w, uv.getY(index[t + k]) * h]);
      const [du1, dv1, dh1] = [P[1][0] - P[0][0], P[1][1] - P[0][1], hs[1] - hs[0]];
      const [du2, dv2, dh2] = [P[2][0] - P[0][0], P[2][1] - P[0][1], hs[2] - hs[0]];
      const det = du1 * dv2 - du2 * dv1;
      if (Math.abs(det) > 1e-6) {
        const a = (dh1 * dv2 - dh2 * dv1) / det; // height per pixel along u
        const b = (du1 * dh2 - du2 * dh1) / det; // ...along v
        const g2 = a * a + b * b;
        if (g2 > 1e-12) {
          const tt = (waist - hs[0]) / g2;
          const cx = P[0][0] + a * tt;
          const cy = P[0][1] + b * tt;
          const len = Math.sqrt(g2);
          const grad = g.createLinearGradient(cx - a / len, cy - b / len, cx + a / len, cy + b / len);
          grad.addColorStop(0, MASK_COLOUR.pants);
          grad.addColorStop(0.5, MASK_COLOUR.pants);
          grad.addColorStop(0.5, MASK_COLOUR.shirt);
          grad.addColorStop(1, MASK_COLOUR.shirt);
          g.fillStyle = grad;
          g.strokeStyle = grad;
        }
      }
    }
    g.lineWidth = 2; // grow islands a little so seams don't keep the old colour
    g.beginPath();
    for (let k = 0; k < 3; k++) {
      const v = index[t + k];
      const x = uv.getX(v) * w;
      const y = uv.getY(v) * h; // glTF textures aren't flipped: v runs down the image
      if (k === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.fill();
    g.stroke();
  }
  return g.getImageData(0, 0, w, h).data;
}

function partAt(mask: Uint8ClampedArray, i: number): Part {
  const r = mask[i] > 128;
  const gr = mask[i + 1] > 128;
  const b = mask[i + 2] > 128;
  if (r && gr) return 'skin';
  if (gr && b) return 'arm';
  if (r) return 'shirt';
  if (gr) return 'pants';
  if (b) return 'shoes';
  return 'none';
}

function recolourTexture(old: THREE.Texture, mesh: THREE.SkinnedMesh) {
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
  const mask = partMask(mesh, w, h, { shortSleeves: true, hemDrop: TEE_HEM_DROP });
  const paint = (i: number, rgb: number[], shade: number) => {
    px[i] = Math.min(255, rgb[0] * shade);
    px[i + 1] = Math.min(255, rgb[1] * shade);
    px[i + 2] = Math.min(255, rgb[2] * shade);
  };
  for (let i = 0; i < px.length; i += 4) {
    const { h: hue, s, v } = hsv(px[i], px[i + 1], px[i + 2]);
    const x = (i / 4) % w;
    // Cloth shading from the original brightness, flattened so tattoos and the tee print
    // don't show through as patterns.
    const shade = THREE.MathUtils.clamp(0.78 + 0.3 * v, 0.86, 1.1);
    switch (partAt(mask, i)) {
      case 'shirt':
        // Cotton tee: the old tee's folds give the shading, a faint knit noise on top.
        paint(i, TEE, shade * (0.96 + 0.06 * hash(x, Math.floor(i / 4 / w))));
        break;
      case 'pants': {
        const weave = 0.94 + 0.08 * hash(x, Math.floor(i / 4 / w));
        paint(i, TROUSERS, shade * weave);
        break;
      }
      case 'shoes':
        break; // keeps the model's own white sneakers
      case 'arm':
        paint(i, ARM_SKIN, THREE.MathUtils.clamp(0.75 + 0.35 * v, 0.85, 1.1));
        break;
      default:
        // Skin (hands, face, neck): deeper brown, keeping its shading.
        if (hue < 45 && s > 0.1 && s < 0.65 && v > 0.25) {
          px[i] *= SKIN_TONE[0];
          px[i + 1] *= SKIN_TONE[1];
          px[i + 2] *= SKIN_TONE[2];
        }
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

/**
 * Attach a rigid prop to a bone, at a position given in the MODEL's space (metres, front = +z,
 * up = +y), measured in the bind pose. Bones carry the armature's 0.01 scale, so the offset is
 * converted through the bone's inverse world matrix.
 */
function attach(model: THREE.Object3D, boneName: string, mesh: THREE.Mesh, modelPos: THREE.Vector3) {
  const bone = model.getObjectByName(boneName);
  if (!bone) return;
  model.updateWorldMatrix(true, true);
  const world = modelPos.clone().applyMatrix4(model.matrixWorld);
  mesh.position.copy(world.applyMatrix4(bone.matrixWorld.clone().invert()));
  const boneQ = bone.getWorldQuaternion(new THREE.Quaternion());
  mesh.quaternion.copy(boneQ.invert().multiply(model.getWorldQuaternion(new THREE.Quaternion())));
  mesh.scale.setScalar(new THREE.Vector3().setFromMatrixScale(model.matrixWorld).x / new THREE.Vector3().setFromMatrixScale(bone.matrixWorld).x);
  bone.add(mesh);
}

/**
 * The skinned mesh's rest ("bind") pose, independent of where the model stands or how it is
 * animated right now: vertex positions, the hip joint, and the units (the armature may be in cm).
 */
function bindPose(mesh: THREE.SkinnedMesh) {
  const pos = mesh.geometry.attributes.position;
  const at = (v: number, out: THREE.Vector3) => out.fromBufferAttribute(pos, v).applyMatrix4(mesh.bindMatrix);
  const tmp = new THREE.Vector3();
  let y0 = Infinity;
  let y1 = -Infinity;
  for (let v = 0; v < pos.count; v++) {
    const y = at(v, tmp).y;
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const unit = (y1 - y0) / HERO_HEIGHT; // bind units per metre
  const hi = mesh.skeleton.bones.findIndex((b) => b.name === 'Hips');
  const hipsInv = hi >= 0 ? mesh.skeleton.boneInverses[hi] : new THREE.Matrix4();
  const hipsY = new THREE.Vector3().setFromMatrixPosition(hipsInv.clone().invert()).y;
  return { at, unit, hipsInv, waistY: hipsY + WAIST_ABOVE_HIPS * unit };
}

/**
 * Leather belt over the shirt / trouser seam: an elliptical band sized from the body's own rest
 * pose at the waist line, built in the hip bone's space so it rides on the hips exactly.
 */
function addBelt(mesh: THREE.SkinnedMesh) {
  const hips = mesh.skeleton.bones.find((b) => b.name === 'Hips');
  if (!hips) return;
  const bind = bindPose(mesh);
  const p = new THREE.Vector3();
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (let v = 0; v < mesh.geometry.attributes.position.count; v++) {
    bind.at(v, p);
    if (Math.abs(p.y - bind.waistY) > 0.02 * bind.unit) continue;
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x);
    z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
  }
  if (!isFinite(x0)) return;
  const u = bind.unit;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const rx = (x1 - x0) / 2 + 0.007 * u;
  const rz = (z1 - z0) / 2 + 0.007 * u;
  // Band: two rings of the ellipse, BELT_HEIGHT apart (rest-pose space), then into hip space.
  const SEG = 32;
  const verts: number[] = [];
  const idx: number[] = [];
  for (let k = 0; k <= SEG; k++) {
    const a = (k / SEG) * Math.PI * 2;
    for (const dy of [-BELT_HEIGHT / 2, BELT_HEIGHT / 2]) verts.push(cx + rx * Math.sin(a), bind.waistY + dy * u, cz + rz * Math.cos(a));
    if (k < SEG) idx.push(2 * k, 2 * k + 1, 2 * k + 2, 2 * k + 1, 2 * k + 3, 2 * k + 2);
  }
  const band = new THREE.BufferGeometry();
  band.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  band.setIndex(idx);
  band.applyMatrix4(bind.hipsInv);
  band.computeVertexNormals();
  const buckleGeo = new THREE.BoxGeometry(0.042 * u, 0.034 * u, 0.008 * u).translate(cx, bind.waistY, cz + rz + 0.002 * u).applyMatrix4(bind.hipsInv);
  const belt = new THREE.Mesh(band, new THREE.MeshStandardMaterial({ color: 0x2a1a12, roughness: 0.6, side: THREE.DoubleSide }));
  const buckle = new THREE.Mesh(buckleGeo, new THREE.MeshStandardMaterial({ color: 0xb8a070, metalness: 0.8, roughness: 0.35 }));
  belt.castShadow = buckle.castShadow = true;
  hips.add(belt, buckle);
}

/**
 * Loose-fit trousers: push the leg surface (vertices driven by the thigh / shin bones, below the
 * hem) out along its normals, a little at the hip and more at the ankle, so the trousers hang
 * off the legs instead of looking painted on. Done once, in the rest pose.
 */
function loosenTrousers(mesh: THREE.SkinnedMesh) {
  const geo = mesh.geometry;
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const si = geo.attributes.skinIndex;
  const sw = geo.attributes.skinWeight;
  const legs = mesh.skeleton.bones.map((b) => /UpLeg|Leg$/.test(b.name) && !/Foot|Toe/.test(b.name));
  const bind = bindPose(mesh);
  const hem = bind.waistY - TEE_HEM_DROP * bind.unit;
  const tmp = new THREE.Vector3();
  const n = new THREE.Vector3();
  for (let v = 0; v < pos.count; v++) {
    let legW = 0;
    for (let j = 0; j < 4; j++) if (legs[si.getComponent(v, j)]) legW += sw.getComponent(v, j);
    if (legW < 0.5) continue;
    const y = bind.at(v, tmp).y;
    if (y > hem) continue;
    const t = THREE.MathUtils.clamp(1 - y / hem, 0, 1); // 0 at the hem, 1 at the floor
    const off = (LOOSE.hip + (LOOSE.ankle - LOOSE.hip) * t) * bind.unit * legW;
    n.fromBufferAttribute(nor, v);
    pos.setXYZ(v, pos.getX(v) + n.x * off, pos.getY(v) + n.y * off, pos.getZ(v) + n.z * off);
  }
  pos.needsUpdate = true;
  geo.computeBoundingSphere();
}

/** Apply the look to the hero model (once; measurements use the rest pose, so any time works). */
export function applyChennaiLook(model: THREE.Object3D) {
  let body: THREE.SkinnedMesh | null = null;
  model.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    const mat = o.material as THREE.MeshStandardMaterial;
    if (mat.name !== 'Ch42_Body' || !mat.map) return;
    mat.map = recolourTexture(mat.map, o);
    // Cotton, denim and skin are matte. The model's own roughness / metalness maps made the
    // clothes glare in the sun, so they go; reflections are toned down too.
    mat.roughnessMap = null;
    mat.metalnessMap = null;
    mat.roughness = 1;
    mat.metalness = 0;
    mat.envMapIntensity = 0.45;
    mat.needsUpdate = true;
    body = o;
  });
  if (body) loosenTrousers(body);

  // Face details, relative to the head bone (base of the skull; the face is ~0.1 m in front).
  model.updateWorldMatrix(true, true);
  const hb = model.getObjectByName('Head');
  if (!hb) return;
  const head = model.worldToLocal(hb.getWorldPosition(new THREE.Vector3()));
  const dark = new THREE.MeshStandardMaterial({ color: 0x1a1210, roughness: 0.9 });
  attach(model, 'Head', new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.009, 0.012), dark), new THREE.Vector3(head.x, head.y + 0.035, head.z + 0.105));
  const ash = new THREE.MeshStandardMaterial({ color: 0xf2f0ea, roughness: 1 });
  for (const dy of [0, 0.009, 0.018]) {
    attach(model, 'Head', new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.003, 0.004), ash), new THREE.Vector3(head.x, head.y + 0.115 + dy, head.z + 0.1));
  }
  const kumkum = new THREE.MeshStandardMaterial({ color: 0xc00020, roughness: 0.6 });
  attach(model, 'Head', new THREE.Mesh(new THREE.SphereGeometry(0.006, 8, 6), kumkum), new THREE.Vector3(head.x, head.y + 0.104, head.z + 0.104));
}

// ---- Police uniform (Tamil Nadu khaki) -------------------------------------------------------
const KHAKI_SHIRT = [196, 170, 112];
const KHAKI_PANTS = [176, 150, 98];
const BOOTS = [24, 20, 18];

/**
 * Dress a Mixamo body (the police officer) in Tamil Nadu Police khaki: shirt and trousers by
 * body part (same bone-weight mask as the hero's outfit), black shoes, the leather belt and a
 * khaki peaked cap with a dark band. Skin goes a shade browner; hair is left alone.
 */
export function applyPoliceLook(model: THREE.Object3D) {
  let body: THREE.SkinnedMesh | null = null;
  model.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    const mat = o.material as THREE.MeshStandardMaterial;
    if (!mat.map || /hair|lash/i.test(mat.name)) return;
    const img = mat.map.image as CanvasImageSource & { width: number; height: number };
    const w = img.width;
    const h = img.height;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d', { willReadFrequently: true })!;
    g.drawImage(img, 0, 0);
    const data = g.getImageData(0, 0, w, h);
    const px = data.data;
    const mask = partMask(o, w, h);
    for (let i = 0; i < px.length; i += 4) {
      const { h: hue, s, v } = hsv(px[i], px[i + 1], px[i + 2]);
      const x = (i / 4) % w;
      const weave = 0.95 + 0.07 * hash(x, Math.floor(i / 4 / w));
      const shade = THREE.MathUtils.clamp(0.8 + 0.3 * v, 0.86, 1.08) * weave;
      const part = partAt(mask, i);
      const rgb = part === 'shirt' ? KHAKI_SHIRT : part === 'pants' ? KHAKI_PANTS : part === 'shoes' ? BOOTS : null;
      if (rgb) {
        px[i] = Math.min(255, rgb[0] * shade);
        px[i + 1] = Math.min(255, rgb[1] * shade);
        px[i + 2] = Math.min(255, rgb[2] * shade);
      } else if (hue < 45 && s > 0.1 && s < 0.65 && v > 0.25) {
        px[i] *= SKIN_TONE[0];
        px[i + 1] *= SKIN_TONE[1];
        px[i + 2] *= SKIN_TONE[2];
      }
    }
    g.putImageData(data, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.flipY = mat.map.flipY;
    tex.colorSpace = mat.map.colorSpace;
    tex.channel = mat.map.channel;
    const m2 = mat.clone(); // the civilians wearing this body keep their own clothes
    m2.map = tex;
    m2.roughness = 1;
    m2.metalness = 0;
    m2.roughnessMap = null;
    m2.metalnessMap = null;
    o.material = m2;
    body = o;
  });
  if (body) addBelt(body);
  // Peaked cap: crown, dark band and a black peak over the brow.
  model.updateWorldMatrix(true, true);
  const hb = model.getObjectByName('Head');
  if (!hb) return;
  const head = model.worldToLocal(hb.getWorldPosition(new THREE.Vector3()));
  const khaki = new THREE.MeshStandardMaterial({ color: 0xb59a62, roughness: 0.9 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, roughness: 0.6 });
  attach(model, 'Head', new THREE.Mesh(new THREE.CylinderGeometry(0.115, 0.1, 0.07, 18), khaki), new THREE.Vector3(head.x, head.y + 0.19, head.z + 0.01));
  attach(model, 'Head', new THREE.Mesh(new THREE.CylinderGeometry(0.102, 0.102, 0.03, 18), dark), new THREE.Vector3(head.x, head.y + 0.145, head.z + 0.01));
  attach(model, 'Head', new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 14, 1, false, -Math.PI / 2, Math.PI).scale(1.2, 1, 1), dark), new THREE.Vector3(head.x, head.y + 0.135, head.z + 0.085));
}
