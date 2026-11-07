import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { ambulanceModel } from '../vehicles/heavy';
import { GeoBuilder } from './geo';
import { HOSPITAL_LOT, SIDEWALK_HEIGHT } from './layout';
import { FACADE_TILE, facadeTextures } from './textures';

/**
 * Isabel Hospital on Luz Church Road: a three-storey white block with a green band, a red
 * cross, a lit Tamil / English board, an entrance canopy, a low compound wall and an ambulance
 * in the forecourt. Its front faces north onto the road. Where you wake up after collapsing
 * from hunger or being shot (arrests still go to the police station).
 */

const FLOORS = 3;
const FLOOR_H = 3.4;
const DEPTH = 12;
const SETBACK = 5; // forecourt between the compound wall and the building
const WHITE = new THREE.Color(0xf4f4f0);
const GREEN = new THREE.Color(0x2e8b57);
const GREY = new THREE.Color(0x9a978f);
const WALL = new THREE.Color(0xe8e4da);

function board() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 200;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, 1024, 200);
  g.fillStyle = '#d32f2f'; // red cross
  g.fillRect(60, 70, 100, 60);
  g.fillRect(80, 50, 60, 100);
  g.fillStyle = '#1b5e20';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.font = '700 58px "Nirmala UI", "Latha", "Noto Sans Tamil", sans-serif';
  g.fillText('இசபெல் மருத்துவமனை', 590, 66);
  g.font = '800 62px system-ui, sans-serif';
  g.fillStyle = '#c62828';
  g.fillText('ISABEL HOSPITAL', 590, 146);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createHospital(scene: THREE.Scene, world: RAPIER.World) {
  const lot = HOSPITAL_LOT();
  const cx = (lot.x0 + lot.x1) / 2;
  const w = lot.x1 - lot.x0 - 4;
  const h = FLOORS * FLOOR_H;
  const front = lot.z0 + SETBACK; // north face
  const bz = front + DEPTH / 2;
  const plain = new GeoBuilder();
  const facade = new GeoBuilder();
  const solid = (sw: number, sh: number, sd: number, x: number, y: number, z: number, c: THREE.Color, collide = true) => {
    plain.box(sw, sh, sd, x, y, z, c);
    if (collide) world.createCollider(RAPIER.ColliderDesc.cuboid(sw / 2, sh / 2, sd / 2).setTranslation(x, y, z));
  };

  // Main block, windows on the street face, green band between floors, parapet.
  solid(w, h, DEPTH, cx, h / 2, bz, WHITE);
  const P = (x: number, y: number) => new THREE.Vector3(x, y, front - 0.02);
  const u = Math.round(w / 3) / 2;
  facade.quad(P(cx + w / 2, 0), P(cx - w / 2, 0), P(cx - w / 2, h), P(cx + w / 2, h), [[0, 0], [u, 0], [u, h / FACADE_TILE.h], [0, h / FACADE_TILE.h]], WHITE, new THREE.Vector3(0, 0, -1));
  for (let f = 1; f < FLOORS; f++) solid(w + 0.3, 0.35, DEPTH + 0.3, cx, f * FLOOR_H, bz, GREEN, false);
  solid(w + 0.4, 0.6, DEPTH + 0.4, cx, h + 0.3, bz, GREEN, false);
  // Entrance: canopy on two pillars, glass doors, a ramp.
  solid(8, 0.3, 4, cx, FLOOR_H - 0.15, front - 2, WHITE, false);
  for (const s of [-1, 1]) solid(0.35, FLOOR_H - 0.3, 0.35, cx + s * 3.6, (FLOOR_H - 0.3) / 2, front - 3.7, WHITE);
  solid(3, 2.6, 0.1, cx, 1.3, front - 0.06, new THREE.Color(0x6aa7c9), false);
  solid(8.4, 0.2, 4.4, cx, 0.1, front - 2, GREY, false);
  // Compound wall with a gate gap on the road side.
  const gate = 7;
  const side = (lot.x1 - lot.x0 - gate) / 2;
  solid(side, 1.2, 0.25, lot.x0 + side / 2, 0.6, lot.z0, WALL);
  solid(side, 1.2, 0.25, lot.x1 - side / 2, 0.6, lot.z0, WALL);
  solid(0.25, 1.2, lot.z1 - lot.z0, lot.x0, 0.6, (lot.z0 + lot.z1) / 2, WALL);
  solid(0.25, 1.2, lot.z1 - lot.z0, lot.x1, 0.6, (lot.z0 + lot.z1) / 2, WALL);
  plain.box(lot.x1 - lot.x0, 0.02, SETBACK, cx, 0.02, lot.z0 + SETBACK / 2, GREY); // forecourt

  const fTex = facadeTextures();
  const signTex = board();
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 1.75), new THREE.MeshStandardMaterial({ map: signTex, emissiveMap: signTex, emissive: 0xffffff, emissiveIntensity: 0.2 }));
  sign.position.set(cx, h - 1.2, front - 0.05);
  sign.rotation.y = Math.PI; // faces the road (north)
  const meshes = [
    new THREE.Mesh(plain.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 })),
    new THREE.Mesh(facade.build(), new THREE.MeshStandardMaterial({ map: fTex.map, vertexColors: true, roughness: 0.85 })),
    sign,
  ];
  for (const m of meshes) {
    m.castShadow = m.receiveShadow = true;
    scene.add(m);
  }

  // Ambulance in the forecourt, light bar flashing (same model as the ones in traffic).
  const amb = new THREE.Group();
  ambulanceModel(amb);
  amb.position.set(lot.x0 + 4.5, 0, lot.z0 + 2.6);
  amb.rotation.y = Math.PI / 2;
  scene.add(amb);
  world.createCollider(RAPIER.ColliderDesc.cuboid(1.0, 1.35, 2.8).setTranslation(amb.position.x, 1.35, amb.position.z).setRotation({ x: 0, y: Math.SQRT1_2, z: 0, w: Math.SQRT1_2 }));

  return {
    /** Where you come round after collapsing or being shot: the sidewalk outside the gate. */
    releaseSpot: new THREE.Vector3(cx, SIDEWALK_HEIGHT, lot.z0 - 1.4),
    releaseYaw: Math.PI, // facing the road (north)
    setNight(f: number) {
      (sign.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.2 + f * 0.6;
    },
  };
}
