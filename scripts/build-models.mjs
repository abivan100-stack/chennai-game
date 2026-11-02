// Character asset pipeline: assets-source/ -> public/models/.   Run: npm run models
//
// 1. Mixamo FBX -> GLB with Blender (scripts/blender/mixamo_to_glb.py): bone prefix strip, root motion removal.
// 2. gltf-transform: simplify heavy meshes, fix materials, merge draw calls, 1K WebP textures, Meshopt compression.
// 3. Prints a size/triangle report. Edit HERO / NPCS below to add characters.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsSpecular } from '@gltf-transform/extensions';
import { dedup, joinPrimitives, meshopt, palette, prune, resample, simplify, textureCompress, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const SRC = 'assets-source';
const TMP = 'assets-source/build';
const OUT = 'public/models';
const HERO_MAX_TRIS = 15000;
const NPC_MAX_TRIS = 8000;
const TEXTURE_SIZE = 1024;

const WIN_BLENDER = 'C:/Program Files/Blender Foundation/Blender 5.2/blender.exe';
const BLENDER = process.env.BLENDER ?? (existsSync(WIN_BLENDER) ? WIN_BLENDER : 'blender');

/**
 * Mixamo hero: skinned mesh + one GLB per clip (assets-source/mixamo/<name>.fbx).
 * inPlace strips horizontal root motion; capLift stops the hips rising (for jumps).
 */
const HERO = {
  src: 'mixamo/hero.fbx',
  simplifyRatio: 0.29, // 49k -> under 15k tris
  clips: [
    { name: 'idle', inPlace: false },
    { name: 'walk', inPlace: true },
    { name: 'run', inPlace: true },
    { name: 'jump', inPlace: true, capLift: true },
    { name: 'talk', inPlace: true },
    { name: 'yell', inPlace: true },
    // Keep root motion: these move the body onto / off the auto seat.
    { name: 'sit_down', inPlace: false },
    { name: 'stand_up', inPlace: false },
    { name: 'drive', inPlace: false },
    // exit_car.fbx (Mixamo "Exiting Car") is in assets-source but unused: it's a 5.8 s car-door
    // swing; getting out of the auto mirrors getting in with stand_up instead.
  ],
};

/**
 * Background NPCs (Quaternius, CC0). `rig` groups models that share a skeleton:
 * only the first model of each rig keeps the animation clips; the game shares them.
 */
const NPCS = [
  { src: 'quaternius/men/Casual_2.gltf', out: 'npc-man-casual', rig: 'qmen' },
  { src: 'quaternius/men/Farmer.gltf', out: 'npc-man-farmer', rig: 'qmen' },
  { src: 'quaternius/men/Worker.gltf', out: 'npc-man-worker', rig: 'qmen' },
  { src: 'quaternius/women/Casual.gltf', out: 'npc-woman-casual', rig: 'qwomen' },
  { src: 'quaternius/women/Formal.gltf', out: 'npc-woman-formal', rig: 'qwomen' },
  { src: 'quaternius/women/Suit.gltf', out: 'npc-woman-suit', rig: 'qwomen' },
];
// source name -> game name
const NPC_CLIPS = { Idle: 'idle', Idle_Neutral: 'idle2', Walk: 'walk', Run: 'run', Wave: 'wave', HitRecieve: 'hit' };

const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
await MeshoptEncoder.ready;
await MeshoptSimplifier.ready;
mkdirSync(TMP, { recursive: true });
mkdirSync(OUT, { recursive: true });

const report = [];
const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;

function stats(doc) {
  let tris = 0;
  let prims = 0;
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const p of mesh.listPrimitives()) {
      prims++;
      tris += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
    }
  }
  return { tris, prims };
}

/**
 * One draw call per material for a skinned character. gltf-transform's join() skips skinned
 * nodes, so: move every skinned primitive into ONE mesh (safe: glTF ignores a skinned node's own
 * transform, and there is a single shared skin), then join primitives that share a material.
 */
function mergeSkinnedMeshes(doc) {
  const nodes = doc.getRoot().listNodes().filter((n) => n.getMesh() && n.getSkin());
  if (new Set(nodes.map((n) => n.getSkin())).size !== 1) throw new Error('expected exactly one skin');
  const [first, ...rest] = nodes;
  const mesh = first.getMesh();
  for (const node of rest) {
    for (const prim of node.getMesh().listPrimitives()) mesh.addPrimitive(prim);
    node.getMesh().dispose();
    node.dispose();
  }
  const byMaterial = Map.groupBy(mesh.listPrimitives(), (p) => p.getMaterial());
  for (const prims of byMaterial.values()) {
    if (prims.length < 2) continue;
    mesh.addPrimitive(joinPrimitives(prims));
    for (const p of prims) p.dispose();
  }
}

/** Remove vertex colours that are pure white (no visual effect, but they block primitive joining). */
function dropWhiteVertexColors(doc) {
  for (const mesh of doc.getRoot().listMeshes()) {
    for (const prim of mesh.listPrimitives()) {
      const color = prim.getAttribute('COLOR_0');
      if (!color) continue;
      const max = color.getNormalized() ? { 5121: 255, 5123: 65535 }[color.getComponentType()] : 1;
      if (color.getArray().every((v) => v === max)) prim.setAttribute('COLOR_0', null);
    }
  }
}

/**
 * Keep only bone rotations + Hips translation. Other translation/scale tracks bake in the
 * proportions of whichever body the clip was exported with; dropping them lets any Mixamo
 * clip drive any Mixamo character, and makes files smaller.
 */
function rotationsOnly(doc) {
  for (const anim of doc.getRoot().listAnimations()) {
    for (const ch of anim.listChannels()) {
      const keep = ch.getTargetPath() === 'rotation' || (ch.getTargetPath() === 'translation' && ch.getTargetNode()?.getName() === 'Hips');
      if (!keep) {
        ch.getSampler()?.dispose();
        ch.dispose();
      }
    }
  }
}

/**
 * Jump: the physics capsule already rises, so the hips must not ALSO rise above standing
 * height (crouches below it stay). Vertical axis = the dominant component of the Hips rest offset.
 */
function capHipLift(doc) {
  for (const anim of doc.getRoot().listAnimations()) {
    for (const ch of anim.listChannels()) {
      const node = ch.getTargetNode();
      if (node?.getName() !== 'Hips' || ch.getTargetPath() !== 'translation') continue;
      const rest = node.getTranslation();
      const up = rest.reduce((best, x, i) => (Math.abs(x) > Math.abs(rest[best]) ? i : best), 0);
      const sign = Math.sign(rest[up]);
      const output = ch.getSampler().getOutput();
      const values = output.getArray().slice();
      const standing = values[up] * sign; // first frame = standing pose
      for (let i = up; i < values.length; i += 3) values[i] = Math.min(values[i] * sign, standing) * sign;
      output.setArray(values);
    }
  }
}

/** Dispose an animation AND its samplers; otherwise prune() keeps all their keyframe data. */
function dropAnimation(anim) {
  for (const s of anim.listSamplers()) s.dispose();
  for (const c of anim.listChannels()) c.dispose();
  anim.dispose();
}

function blender(src, out, args = []) {
  execFileSync(BLENDER, ['-b', '--factory-startup', '--python', 'scripts/blender/mixamo_to_glb.py', '--', src, out, ...args], {
    stdio: ['ignore', 'ignore', 'inherit'],
  });
}

/** Shared tail of every pipeline: clean up, compress, write, report. */
async function finish(doc, name, srcBytes, before, limit) {
  await doc.transform(dedup(), prune(), resample(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const path = `${OUT}/${name}.glb`;
  await io.write(path, doc);
  const after = stats(doc);
  const flag = limit && after.tris > limit ? ` <-- over ${limit}` : '';
  report.push(`${name.padEnd(18)} ${kb(srcBytes).padStart(9)} -> ${kb(statSync(path).size).padStart(8)}   tris ${String(before.tris).padStart(6)} -> ${String(after.tris).padStart(6)}   draw calls ${after.prims}${flag}`);
}

// ---- Hero -------------------------------------------------------------------------------
{
  const src = `${SRC}/${HERO.src}`;
  const tmp = `${TMP}/hero.glb`;
  blender(src, tmp);
  const doc = await io.read(tmp);
  const before = stats(doc);
  doc.createExtension(KHRMaterialsSpecular).dispose(); // Mixamo spec maps: not worth a texture
  for (const m of doc.getRoot().listMaterials()) {
    m.setMetallicFactor(0); // FBX import guesses 0.5 metallic: skin would look like metal
    if (m.getAlphaMode() === 'BLEND') m.setAlphaMode('MASK').setAlphaCutoff(0.5).setRoughnessFactor(0.7); // hair cards
  }
  mergeSkinnedMeshes(doc);
  await doc.transform(
    weld(),
    simplify({ simplifier: MeshoptSimplifier, ratio: HERO.simplifyRatio, error: 0.01 }),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [TEXTURE_SIZE, TEXTURE_SIZE] }),
  );
  await finish(doc, 'hero', statSync(src).size, before, HERO_MAX_TRIS);

  for (const clip of HERO.clips) {
    const csrc = `${SRC}/mixamo/${clip.name}.fbx`;
    const ctmp = `${TMP}/${clip.name}.glb`;
    blender(csrc, ctmp, ['--anim', clip.name, ...(clip.inPlace ? ['--in-place'] : [])]);
    const cdoc = await io.read(ctmp);
    rotationsOnly(cdoc);
    if (clip.capLift) capHipLift(cdoc);
    await finish(cdoc, clip.name, statSync(csrc).size, stats(cdoc));
  }
}

// ---- NPCs -------------------------------------------------------------------------------
const rigsWithClips = new Set();
for (const npc of NPCS) {
  const src = `${SRC}/${npc.src}`;
  const doc = await io.read(src);
  const before = stats(doc);
  const keepClips = !rigsWithClips.has(npc.rig);
  rigsWithClips.add(npc.rig);
  for (const anim of doc.getRoot().listAnimations()) {
    const name = NPC_CLIPS[anim.getName()];
    if (keepClips && name) anim.setName(name);
    else dropAnimation(anim);
  }
  // Flat-colour materials -> one palette texture -> one material -> one draw call.
  dropWhiteVertexColors(doc);
  await doc.transform(weld(), palette({ min: 2 }));
  mergeSkinnedMeshes(doc);
  await finish(doc, npc.out, statSync(src).size, before, NPC_MAX_TRIS);
}

console.log('\nfile                 source ->   output   triangles             draw calls');
console.log(report.join('\n'));
