import * as THREE from 'three';
import type { Footprint } from './buildings';

/**
 * Rooftop hoardings, like the film and party banners above every Chennai street. Three
 * original designs painted in code (no real photos or faces): a "JAILER 2" film poster, a
 * "SCENE" film poster and a TVK party thank-you banner. One instanced mesh per design + one for
 * the steel frames: 4 draw calls in all.
 */

const BOARD = { w: 7.2, h: 4.2 }; // metres
const LEGS = 1.6; // board bottom above the roof
const MIN_WIDTH = 8; // only on buildings at least this wide
const EVERY = 7; // one in every N suitable buildings gets a hoarding

/** A man's silhouette walking towards you (generic, not anyone in particular). */
function silhouette(g: CanvasRenderingContext2D, cx: number, base: number, s: number, fill: string) {
  g.fillStyle = fill;
  g.beginPath();
  g.ellipse(cx, base - 172 * s, 15 * s, 18 * s, 0, 0, Math.PI * 2); // head
  g.fill();
  g.beginPath(); // torso + arms
  g.moveTo(cx - 34 * s, base - 150 * s);
  g.lineTo(cx + 34 * s, base - 150 * s);
  g.lineTo(cx + 44 * s, base - 70 * s);
  g.lineTo(cx + 30 * s, base - 68 * s);
  g.lineTo(cx + 24 * s, base - 120 * s);
  g.lineTo(cx + 22 * s, base - 80 * s);
  g.lineTo(cx - 22 * s, base - 80 * s);
  g.lineTo(cx - 24 * s, base - 120 * s);
  g.lineTo(cx - 30 * s, base - 68 * s);
  g.lineTo(cx - 44 * s, base - 70 * s);
  g.closePath();
  g.fill();
  g.beginPath(); // legs, mid-stride
  g.moveTo(cx - 22 * s, base - 82 * s);
  g.lineTo(cx + 22 * s, base - 82 * s);
  g.lineTo(cx + 26 * s, base);
  g.lineTo(cx + 10 * s, base);
  g.lineTo(cx, base - 50 * s);
  g.lineTo(cx - 14 * s, base);
  g.lineTo(cx - 30 * s, base);
  g.closePath();
  g.fill();
}

function canvas(w = 1024, h = 600) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!] as const;
}

function toTexture(c: HTMLCanvasElement) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Film poster: smoky dark orange, a lone figure, big gold title. */
function jailerPoster() {
  const [c, g] = canvas();
  const bg = g.createRadialGradient(512, 330, 40, 512, 300, 620);
  bg.addColorStop(0, '#f08a24');
  bg.addColorStop(0.45, '#7a2a0c');
  bg.addColorStop(1, '#120705');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 600);
  for (let i = 0; i < 60; i++) { // smoke
    g.fillStyle = `rgba(255, 210, 160, ${0.03 + Math.random() * 0.04})`;
    g.beginPath();
    g.arc(Math.random() * 1024, 250 + Math.random() * 350, 30 + Math.random() * 90, 0, Math.PI * 2);
    g.fill();
  }
  silhouette(g, 512, 590, 2.6, '#0d0604');
  g.textAlign = 'center';
  g.font = '900 150px Impact, "Arial Black", sans-serif';
  g.lineWidth = 10;
  g.strokeStyle = '#2a0d02';
  g.strokeText('JAILER 2', 512, 150);
  const gold = g.createLinearGradient(0, 60, 0, 160);
  gold.addColorStop(0, '#ffe9a0');
  gold.addColorStop(1, '#d48a12');
  g.fillStyle = gold;
  g.fillText('JAILER 2', 512, 150);
  g.font = '700 46px "Nirmala UI", "Latha", "Noto Sans Tamil", sans-serif';
  g.fillStyle = '#ffd27a';
  g.fillText('ஜெயிலர் 2', 512, 215);
  g.font = '800 34px system-ui, sans-serif';
  g.fillStyle = '#fff3d6';
  g.fillText('IN CINEMAS  ·  விரைவில்', 512, 572);
  return toTexture(c);
}

/** Film poster: teal jail corridor with light at the end, slanted yellow title. */
function scenePoster() {
  const [c, g] = canvas();
  const bg = g.createLinearGradient(0, 0, 0, 600);
  bg.addColorStop(0, '#0d2a33');
  bg.addColorStop(1, '#06141a');
  g.fillStyle = bg;
  g.fillRect(0, 0, 1024, 600);
  const glow = g.createRadialGradient(512, 300, 10, 512, 300, 260);
  glow.addColorStop(0, 'rgba(200, 240, 255, 0.9)');
  glow.addColorStop(1, 'rgba(200, 240, 255, 0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 1024, 600);
  g.strokeStyle = 'rgba(10, 20, 24, 0.9)';
  g.lineWidth = 9;
  for (let i = 0; i < 14; i++) { // cell bars on both sides, converging
    const x = 40 + i * 28;
    g.beginPath(); g.moveTo(x, 0); g.lineTo(x + i * 6, 600); g.stroke();
    g.beginPath(); g.moveTo(1024 - x, 0); g.lineTo(1024 - x - i * 6, 600); g.stroke();
  }
  silhouette(g, 512, 585, 2.3, '#050b0d');
  g.save();
  g.translate(512, 135);
  g.rotate(-0.08);
  g.textAlign = 'center';
  g.font = 'italic 900 170px Impact, "Arial Black", sans-serif';
  g.lineWidth = 14;
  g.strokeStyle = '#a3241c';
  g.strokeText('SCENE', 0, 40);
  g.fillStyle = '#ffcf1f';
  g.fillText('SCENE', 0, 40);
  g.restore();
  g.textAlign = 'center';
  g.font = '700 40px "Nirmala UI", "Latha", "Noto Sans Tamil", sans-serif';
  g.fillStyle = '#e0f4ff';
  g.fillText('சீன்  ·  NOW SHOWING', 512, 570);
  return toTexture(c);
}

/** Party banner: TVK red and yellow, the whistle symbol, a thank-you line. No portrait. */
function tvkBanner() {
  const [c, g] = canvas();
  g.fillStyle = '#f7c21a';
  g.fillRect(0, 0, 1024, 600);
  g.fillStyle = '#c1121f';
  g.beginPath(); // big brush-stroke red band
  g.moveTo(0, 120); g.bezierCurveTo(300, 80, 700, 170, 1024, 110);
  g.lineTo(1024, 470); g.bezierCurveTo(700, 520, 300, 430, 0, 490);
  g.closePath();
  g.fill();
  g.fillStyle = '#7a0d14';
  g.fillRect(0, 0, 1024, 26);
  g.fillRect(0, 574, 1024, 26);
  // The whistle: barrel + mouthpiece + ring, white with a dark outline.
  g.save();
  g.translate(165, 300);
  g.scale(0.85, 0.85);
  g.lineWidth = 8;
  g.strokeStyle = '#2b0a0a';
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(0, 0, 78, 0, Math.PI * 2); g.fill(); g.stroke();
  g.beginPath(); g.rect(40, -78, 120, 60); g.fill(); g.stroke();
  g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.arc(-70, -64, 22, 0, Math.PI * 2); g.stroke();
  g.restore();
  g.textAlign = 'left';
  g.fillStyle = '#ffffff';
  g.font = '800 64px "Nirmala UI", "Latha", "Noto Sans Tamil", sans-serif';
  const textW = 1024 - 330 - 36; // keep every line on the banner
  g.fillText('தமிழக வெற்றிக் கழகம்', 330, 230, textW);
  g.fillStyle = '#ffe14d';
  g.font = '900 120px Impact, "Arial Black", sans-serif';
  g.fillText('TVK', 330, 360, textW);
  g.fillStyle = '#ffffff';
  g.font = '800 54px "Nirmala UI", "Latha", "Noto Sans Tamil", sans-serif';
  g.fillText('நன்றி! நன்றி!! நன்றி!!!', 330, 445, textW);
  return toTexture(c);
}

export function createPosters(scene: THREE.Scene, footprints: Footprint[]) {
  // Buildings that can carry a hoarding: wide, flat-roofed. Every Nth, so they're spread out.
  const spots = footprints.filter((f) => !f.oldHouse && f.w >= MIN_WIDTH).filter((_, i) => i % EVERY === 3);
  const designs = [jailerPoster(), tvkBanner(), scenePoster()];
  const boardGeo = new THREE.PlaneGeometry(BOARD.w, BOARD.h);
  const frameGeo = new THREE.BoxGeometry(BOARD.w + 0.3, BOARD.h + 0.3, 0.15).translate(0, 0, -0.1); // backing frame
  const legGeo = new THREE.BoxGeometry(0.15, LEGS + BOARD.h / 2, 0.15);
  const byDesign: THREE.Matrix4[][] = designs.map(() => []);
  const frames: THREE.Matrix4[] = [];
  const legs: THREE.Matrix4[] = [];
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  spots.forEach((f, i) => {
    q.setFromAxisAngle(up, f.yaw);
    // Near the front edge of the roof, facing the street.
    const fx = f.cx + Math.sin(f.yaw) * (f.d / 2 - 1.2);
    const fz = f.cz + Math.cos(f.yaw) * (f.d / 2 - 1.2);
    const y = f.h + LEGS + BOARD.h / 2;
    const at = new THREE.Vector3(fx, y, fz);
    byDesign[i % designs.length].push(new THREE.Matrix4().compose(at, q, one));
    frames.push(new THREE.Matrix4().compose(at, q, one));
    const side = new THREE.Vector3(Math.cos(f.yaw), 0, -Math.sin(f.yaw));
    for (const s of [-1, 1]) {
      const l = new THREE.Vector3(fx, f.h + (LEGS + BOARD.h / 2) / 2, fz).addScaledVector(side, s * (BOARD.w / 2 - 0.6));
      l.addScaledVector(new THREE.Vector3(Math.sin(f.yaw), 0, Math.cos(f.yaw)), -0.25);
      legs.push(new THREE.Matrix4().compose(l, q, one));
    }
  });
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, ms: THREE.Matrix4[]) => {
    const m = new THREE.InstancedMesh(geo, mat, ms.length);
    ms.forEach((x, i) => m.setMatrixAt(i, x));
    m.computeBoundingSphere();
    m.castShadow = true;
    scene.add(m);
    return m;
  };
  const boardMats = designs.map((t) => new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.7 }));
  designs.forEach((_, i) => inst(boardGeo, boardMats[i], byDesign[i]));
  const steel = new THREE.MeshStandardMaterial({ color: 0x3a3d42, roughness: 0.6, metalness: 0.4 });
  const steelLegs = inst(legGeo, steel, legs);
  const steelFrames = inst(frameGeo, steel, frames);
  steelFrames.castShadow = steelLegs.castShadow = true;
  return {
    count: spots.length,
    /** Lit at night (floodlights on the hoardings). */
    setNight(f: number) {
      for (const m of boardMats) m.emissiveIntensity = f * 0.55;
    },
  };
}
