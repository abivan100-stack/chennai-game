import * as THREE from 'three';
import { BOUNDS } from './layout';

/**
 * Street-lamp light on everything, without a single real light: the lamps' light on the ground is
 * splatted once into a map-sized texture (1 texel per TEXEL m), and every standard material adds
 * `colour x lamp map(x, z) x height fade` to its diffuse light. So walls, roads, trees, cars and
 * people glow warm near a lamp and fall dark between them. One texture read per pixel; no draw
 * calls, no shadows. Materials are patched by `patchLampLight(scene)` (call again for new ones).
 */
const TEXEL = 1; // m
/** Horizontal falloff: half brightness at about this distance (m) from the lamp head. */
const SPREAD = 6.5;
const RADIUS = 18; // m: splat radius
/** The texture stores light / SCALE (8 bits, so overlapping lamps don't clip too soon). */
const SCALE = 3;
/** Lamp strength on a surface right under it, before exposure. */
const STRENGTH = 1.15;
/** Light fades out upwards, gone this high (m): lamps are ~6 m up and point down. */
const REACH_H = 11;

export type LampSource = { x: number; z: number; r: number; g: number; b: number; k?: number };

const W = Math.ceil((BOUNDS.x1 - BOUNDS.x0) / TEXEL);
const H = Math.ceil((BOUNDS.z1 - BOUNDS.z0) / TEXEL);

export const uniforms = {
  uLampMap: { value: null as THREE.Texture | null },
  uLampOn: { value: 0 },
  uLampBox: { value: new THREE.Vector4(BOUNDS.x0, BOUNDS.z0, 1 / (W * TEXEL), 1 / (H * TEXEL)) },
};

/** Build the lamp map from the light sources (street lamps, lit shopfronts...). */
export function buildLampMap(sources: LampSource[]) {
  const acc = new Float32Array(W * H * 3);
  const rc = Math.ceil(RADIUS / TEXEL);
  for (const s of sources) {
    const k = (s.k ?? 1) * STRENGTH;
    const cx = (s.x - BOUNDS.x0) / TEXEL;
    const cz = (s.z - BOUNDS.z0) / TEXEL;
    for (let j = Math.max(1, Math.floor(cz) - rc); j <= Math.min(H - 2, Math.floor(cz) + rc); j++) {
      for (let i = Math.max(1, Math.floor(cx) - rc); i <= Math.min(W - 2, Math.floor(cx) + rc); i++) {
        const d2 = ((i + 0.5 - cx) ** 2 + (j + 0.5 - cz) ** 2) * TEXEL * TEXEL;
        if (d2 > RADIUS * RADIUS) continue;
        const f = k * (1 - d2 / (RADIUS * RADIUS)) / (1 + d2 / (SPREAD * SPREAD)) ** 1.4;
        const o = (j * W + i) * 3;
        acc[o] += s.r * f;
        acc[o + 1] += s.g * f;
        acc[o + 2] += s.b * f;
      }
    }
  }
  const data = new Uint8Array(W * H * 4);
  for (let p = 0; p < W * H; p++) {
    for (let c = 0; c < 3; c++) data[p * 4 + c] = Math.min(255, Math.round((acc[p * 3 + c] / SCALE) * 255));
    data[p * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, W, H);
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.needsUpdate = true;
  uniforms.uLampMap.value = tex;
}

/** 0 = lamps off (day), 1 = full night. */
export function setLampLight(f: number) {
  uniforms.uLampOn.value = f;
}

const patched = new WeakSet<THREE.Material>();

function patch(m: THREE.MeshStandardMaterial) {
  const prev = m.onBeforeCompile;
  const prevKey = m.customProgramCacheKey;
  m.onBeforeCompile = (shader, renderer) => {
    prev.call(m, shader, renderer);
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLampW;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 lampW = vec4( transformed, 1.0 );
        #ifdef USE_BATCHING
          lampW = batchingMatrix * lampW;
        #endif
        #ifdef USE_INSTANCING
          lampW = instanceMatrix * lampW;
        #endif
        vLampW = ( modelMatrix * lampW ).xyz;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vLampW;\nuniform sampler2D uLampMap;\nuniform float uLampOn;\nuniform vec4 uLampBox;')
      .replace(
        '#include <lights_fragment_end>',
        `#include <lights_fragment_end>
        if ( uLampOn > 0.0 ) {
          vec3 lamp = texture2D( uLampMap, ( vLampW.xz - uLampBox.xy ) * uLampBox.zw ).rgb * ${SCALE.toFixed(1)};
          float up = ( vec4( normal, 0.0 ) * viewMatrix ).y; // world-space normal's y
          float fade = clamp( 1.0 - vLampW.y / ${REACH_H.toFixed(1)}, 0.0, 1.0 );
          reflectedLight.directDiffuse += material.diffuseColor * lamp * ( uLampOn * fade * fade * clamp( 0.6 + 0.4 * up, 0.15, 1.0 ) );
        }`,
      );
  };
  // The default key is onBeforeCompile's source, which is now this wrapper's for everyone: key on
  // the wrapped function instead, or differently patched materials would share one program.
  const base = prevKey === THREE.Material.prototype.customProgramCacheKey ? prev.toString() : prevKey.call(m);
  m.customProgramCacheKey = () => `${base}|lamp`;
  m.needsUpdate = true;
}

/** Add lamp light to every standard material in the scene not done yet. */
export function patchLampLight(root: THREE.Object3D) {
  root.traverse((o) => {
    const mats = (o as THREE.Mesh).material;
    if (!mats) return;
    for (const m of Array.isArray(mats) ? mats : [mats]) {
      if (patched.has(m)) continue;
      patched.add(m);
      if ((m as THREE.MeshStandardMaterial).isMeshStandardMaterial) patch(m as THREE.MeshStandardMaterial);
    }
  });
}
