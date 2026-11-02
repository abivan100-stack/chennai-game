import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import { POLICE_LOT, SIDEWALK_HEIGHT } from './layout';
import { FACADE_TILE, facadeTextures } from './textures';

const CREAM = new THREE.Color(0xf1e3c2);
const MAROON = new THREE.Color(0x7a2026);
const PILLAR = new THREE.Color(0xfaf6ec);
const GREY = new THREE.Color(0x8d8a84);
const FLOOR_H = 3.4;

/**
 * Mylapore Police Station: two-storey cream building with a maroon band, pillared porch, blue
 * Tamil/English board, compound wall with a gate, flag post. Returns where the police jeep parks
 * and where you get released (after being arrested or knocked out).
 */
export function createPoliceStation(scene: THREE.Scene, world: RAPIER.World) {
  const lot = POLICE_LOT();
  const cx = (lot.x0 + lot.x1) / 2;
  const plain = new GeoBuilder();
  const facade = new GeoBuilder();
  const solid = (w: number, h: number, d: number, x: number, y: number, z: number, c: THREE.Color, collide = true) => {
    plain.box(w, h, d, x, y, z, c);
    if (collide) world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(x, y, z));
  };

  // Main block, set back behind a forecourt; front faces south (+z) onto Kutchery Road.
  const bw = 16;
  const bd = 9;
  const bz = lot.z0 + 1 + bd / 2;
  const front = bz + bd / 2;
  const h = FLOOR_H * 2;
  solid(bw, h, bd, cx, h / 2, bz, CREAM);
  // Windows on the front, both floors (reuse the town's facade tile, cream tint).
  const P = (x: number, y: number) => new THREE.Vector3(x, y, front + 0.02);
  const u = Math.round(bw / 3) / 2;
  facade.quad(P(cx - bw / 2, 0), P(cx + bw / 2, 0), P(cx + bw / 2, h), P(cx - bw / 2, h), [[0, 0], [u, 0], [u, h / FACADE_TILE.h], [0, h / FACADE_TILE.h]], CREAM, new THREE.Vector3(0, 0, 1));
  solid(bw + 0.3, 0.45, bd + 0.3, cx, FLOOR_H, bz, MAROON, false); // floor band
  solid(bw + 0.4, 0.5, bd + 0.4, cx, h + 0.25, bz, MAROON, false); // parapet
  // Porch: roof slab on four pillars over the door.
  solid(7, 0.3, 3.2, cx, FLOOR_H - 0.2, front + 1.6, MAROON, false);
  for (const px of [-3.2, -1.1, 1.1, 3.2]) solid(0.35, FLOOR_H - 0.35, 0.35, cx + px, (FLOOR_H - 0.35) / 2, front + 3, PILLAR);
  solid(2, 2.4, 0.1, cx, 1.2, front + 0.05, new THREE.Color(0x3b2a1e), false); // door
  solid(7.4, 0.25, 3.6, cx, 0.12, front + 1.6, GREY, false); // porch steps

  // Compound wall with a gate gap, and a flag post in the forecourt.
  const wz = lot.z1 - 0.2;
  const gate = 4;
  solid((lot.x1 - lot.x0 - gate) / 2, 1.3, 0.3, (lot.x0 + cx - gate / 2) / 2, 0.65, wz, CREAM);
  solid((lot.x1 - lot.x0 - gate) / 2, 1.3, 0.3, (lot.x1 + cx + gate / 2) / 2, 0.65, wz, CREAM);
  solid(0.3, 1.3, lot.z1 - lot.z0, lot.x0, 0.65, (lot.z0 + lot.z1) / 2, CREAM);
  solid(0.3, 1.3, lot.z1 - lot.z0, lot.x1, 0.65, (lot.z0 + lot.z1) / 2, CREAM);
  solid(0.6, 1.8, 0.6, cx - gate / 2 - 0.3, 0.9, wz, MAROON); // gate posts
  solid(0.6, 1.8, 0.6, cx + gate / 2 + 0.3, 0.9, wz, MAROON);
  const fx = cx + 6;
  const fz = front + 3.5;
  plain.add(new THREE.CylinderGeometry(0.06, 0.08, 8, 8), new THREE.Matrix4().setPosition(fx, 4, fz), new THREE.Color(0xdddddd));
  world.createCollider(RAPIER.ColliderDesc.cylinder(4, 0.1).setTranslation(fx, 4, fz));

  // Forecourt paving.
  const yard = [new THREE.Vector3(lot.x0, 0.03, front), new THREE.Vector3(lot.x1, 0.03, front), new THREE.Vector3(lot.x1, 0.03, lot.z1), new THREE.Vector3(lot.x0, 0.03, lot.z1)];
  plain.quad(yard[0], yard[1], yard[2], yard[3], [[0, 0], [0, 0], [0, 0], [0, 0]], new THREE.Color(0xb9b2a4), new THREE.Vector3(0, 1, 0));

  const fTex = facadeTextures();
  const meshes = [
    new THREE.Mesh(plain.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })),
    new THREE.Mesh(facade.build(), new THREE.MeshStandardMaterial({ map: fTex.map, vertexColors: true, roughness: 0.85 })),
    signBoard(cx, front + 3.25),
    flag(fx, fz),
  ];
  for (const m of meshes) {
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }

  return {
    /** Where the police jeeps wait: in the forecourt behind the wall (out of the traffic lane), facing west. */
    jeepSpot: new THREE.Vector3(cx + 6.5, 0.03, lot.z1 - 2.6),
    /** Where you're let out (sidewalk outside the gate, facing the road). */
    releaseSpot: new THREE.Vector3(cx, SIDEWALK_HEIGHT, lot.z1 + 1.3),
    centre: new THREE.Vector3(cx, 0, (lot.z0 + lot.z1) / 2),
  };
}

/** "காவல் நிலையம் / POLICE STATION, MYLAPORE" board on the porch, white on blue. */
function signBoard(x: number, z: number) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#0b3c8c';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#fff';
  g.lineWidth = 5;
  g.strokeRect(6, 6, 500, 116);
  g.fillStyle = '#fff';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 40px "Nirmala UI", "Latha", "Noto Sans Tamil", sans-serif';
  g.fillText('காவல் நிலையம்', 256, 42);
  g.font = '800 30px system-ui, sans-serif';
  g.fillText('POLICE STATION · MYLAPORE', 256, 92);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: 0.25 }));
  m.position.set(x, 4.1, z);
  return m;
}

/** Indian tricolour on the flag post. */
function flag(x: number, z: number) {
  const c = document.createElement('canvas');
  c.width = 96;
  c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ff9933';
  g.fillRect(0, 0, 96, 22);
  g.fillStyle = '#ffffff';
  g.fillRect(0, 21, 96, 22);
  g.fillStyle = '#138808';
  g.fillRect(0, 42, 96, 22);
  g.strokeStyle = '#000080';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(48, 32, 8, 0, Math.PI * 2);
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.9 }));
  m.position.set(x + 0.8, 7.4, z);
  return m;
}
