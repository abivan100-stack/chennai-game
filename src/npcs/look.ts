import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { CharacterAsset } from '../characters/catalog';

/**
 * Makes each Mixamo NPC look like a different person, although only ~14 bodies exist:
 * - skin: a natural warmer / browner tone; hair: black or dark brown;
 * - clothes: for some, coloured clothes change colour (see CLOTHES_GLSL: skin hues are never touched);
 * - build: slightly slimmer or broader (height comes from the spawn);
 * - face: glasses, a moustache (men) or a bindi (women), placed from the model's measured face.
 * Everything is picked from a seed (the NPC's name), so a person looks the same every visit.
 */

/** Share of people whose clothes get a new colour. */
const CLOTHES_CHANCE = 0.6;
const SKIN = [0xf2dcc6, 0xe6c9ac, 0xdbb894, 0xcfa781, 0xc4996f, 0xfff4ea];
const HAIR = [0x141010, 0x1c1410, 0x241a12, 0x30231a, 0x0d0d0d];
const ACCESSORY = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 });

/**
 * Clothes recolour, safe for faces: only clearly non-skin hues (green, blue, purple, pink; HSV hue
 * 0.2-0.9) that are well saturated get their hue turned. Reds, oranges, yellows (every skin tone,
 * lips) and greys / blacks / whites are never touched.
 */
const CLOTHES_GLSL = /* glsl */ `
{
  vec3 c = diffuseColor.rgb;
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  vec3 hsv = vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
  float w = smoothstep(0.2, 0.26, hsv.x) * (1.0 - smoothstep(0.86, 0.9, hsv.x)) * smoothstep(0.25, 0.4, hsv.y);
  vec3 h2 = vec3(fract(hsv.x + uClothHue), hsv.y, hsv.z);
  vec3 P = abs(fract(h2.xxx + vec3(1.0, 2.0 / 3.0, 1.0 / 3.0)) * 6.0 - 3.0);
  vec3 turned = h2.z * mix(vec3(1.0), clamp(P - 1.0, 0.0, 1.0), h2.y);
  diffuseColor.rgb = mix(c, turned, w);
}
`;

function hashString(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Where the face is on a model (body space, bind pose), measured once per model. */
interface Face {
  headY: number;
  noseY: number;
  front: number; // z of the nose tip
}
const faces = new WeakMap<CharacterAsset, Face | null>();
function faceOf(asset: CharacterAsset, body: THREE.Object3D): Face | null {
  if (faces.has(asset)) return faces.get(asset)!;
  body.updateMatrixWorld(true);
  const head = body.getObjectByName('Head');
  let face: Face | null = null;
  if (head) {
    const hp = head.getWorldPosition(new THREE.Vector3());
    const v = new THREE.Vector3();
    let best = -Infinity;
    let noseY = hp.y + 0.07;
    body.traverse((o) => {
      const m = o as THREE.SkinnedMesh;
      if (!m.isSkinnedMesh || /hair|lash/i.test((m.material as THREE.Material).name)) return;
      const pos = m.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(m.matrixWorld);
        if (Math.abs(v.x - hp.x) > 0.05 || v.y < hp.y + 0.03 || v.y > hp.y + 0.11) continue;
        if (v.z > best) {
          best = v.z;
          noseY = v.y;
        }
      }
    });
    if (best > -Infinity) face = { headY: hp.y, noseY, front: best };
  }
  faces.set(asset, face);
  return face;
}

/** Glasses / moustache / bindi as one small mesh in body space (merged: one draw call). */
function accessories(face: Face, female: boolean, rnd: () => number) {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, x: number, y: number, z: number, colour: number) => {
    g.translate(x, y, z);
    const c = new THREE.Color(colour);
    const n = g.attributes.position.count;
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, k) => [c.r, c.g, c.b][k % 3]), 3));
    parts.push(g.index ? g.toNonIndexed() : g);
  };
  const eyeY = face.noseY + 0.03;
  if (rnd() < 0.3) {
    // Glasses: two round frames and a bridge.
    for (const s of [-1, 1]) add(new THREE.TorusGeometry(0.019, 0.003, 4, 14), s * 0.031, eyeY, face.front - 0.012, 0x1a1a1a);
    add(new THREE.BoxGeometry(0.024, 0.004, 0.004), 0, eyeY + 0.004, face.front - 0.01, 0x1a1a1a);
  }
  if (!female && rnd() < 0.5) add(new THREE.BoxGeometry(0.048, 0.01, 0.012), 0, face.noseY - 0.028, face.front - 0.012, 0x15100c); // moustache
  if (female && rnd() < 0.55) add(new THREE.CircleGeometry(0.0045, 10), 0, eyeY + 0.03, face.front - 0.008, 0xc0122a); // bindi
  return parts.length ? mergeGeometries(parts) : null;
}

/**
 * Restyle one cloned Mixamo body for the person named `seed`. Returns the build factor (scale
 * the root's x / z by it).
 */
export function varyLook(body: THREE.Object3D, asset: CharacterAsset, seed: string, female: boolean) {
  let s = (hashString(seed) % 2147483646) + 1;
  const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647; // Park-Miller: 0 < r < 1
  const skin = SKIN[Math.floor(rnd() * SKIN.length)];
  const hair = HAIR[Math.floor(rnd() * HAIR.length)];
  const newClothes = rnd() < CLOTHES_CHANCE;
  const clothHue = 0.15 + rnd() * 0.7; // turn of the hue wheel for their clothes
  body.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    if (/hair/i.test(mat.name)) mat.color.set(hair);
    else {
      mat.color.set(skin); // a natural skin tone (multiplies the texture: no odd colours)
      if (newClothes) {
        mat.onBeforeCompile = (sh) => {
          sh.uniforms.uClothHue = { value: clothHue };
          sh.fragmentShader = 'uniform float uClothHue;\n' + sh.fragmentShader.replace('#include <map_fragment>', '#include <map_fragment>\n' + CLOTHES_GLSL);
        };
        mat.customProgramCacheKey = () => 'npc-clothes'; // one shader program for everyone recoloured
      }
    }
    m.material = mat;
  });
  const face = faceOf(asset, body);
  const head = body.getObjectByName('Head');
  if (face && head) {
    const geo = accessories(face, female, rnd);
    if (geo) {
      body.updateMatrixWorld(true);
      const mesh = new THREE.Mesh(geo, ACCESSORY);
      mesh.applyMatrix4(head.matrixWorld.clone().invert()); // body space -> head space: follows the head
      head.add(mesh);
    }
  }
  return 0.93 + rnd() * 0.14;
}
