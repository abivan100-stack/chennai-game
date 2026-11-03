import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { GeoBuilder } from './geo';
import type { Lot } from './layout';

/**
 * Shared toolkit for building places out of boxes in a lot's own frame: merged coloured
 * geometry (1 draw call), glowing bulbs (1), and signboards from one atlas texture (1).
 */

/** Signboard: [Tamil, English, background, text colour]. */
export type SignDef = [string, string, string, string];

const SIGN_ROW = 128; // atlas row height (px)
const WHITE = new THREE.Color(0xffffff);
const UP = new THREE.Vector3(0, 1, 0);
/** A flat slab up high (canopy, shed roof, marquee): gets a collider so rain stops under it. */
export const isRoof = (w: number, h: number, d: number, y: number) => y >= 2.2 && h <= 1.2 && w * d >= 4;

export function signAtlas(signs: SignDef[]) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = SIGN_ROW * signs.length;
  const g = c.getContext('2d')!;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  signs.forEach(([ta, en, bg, fg], i) => {
    const y = i * SIGN_ROW;
    g.fillStyle = bg;
    g.fillRect(0, y, 1024, SIGN_ROW);
    g.strokeStyle = fg;
    g.lineWidth = 5;
    g.strokeRect(8, y + 8, 1008, SIGN_ROW - 16);
    g.fillStyle = fg;
    g.font = '700 44px "Nirmala UI", "Latha", "Noto Sans Tamil", sans-serif';
    g.fillText(ta, 512, y + 42, 960);
    g.font = '800 40px system-ui, sans-serif';
    g.fillText(en, 512, y + 92, 960);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/**
 * A lot's own frame: u runs along the frontage, v goes inwards from the road (v = 0 at the
 * lot's front edge). yaw turns a box from lot space into world space.
 */
export function frame(lot: Lot) {
  const yaw = lot.front === 'n' ? 0 : lot.front === 's' ? Math.PI : lot.front === 'e' ? -Math.PI / 2 : Math.PI / 2;
  const ns = lot.front === 'n' || lot.front === 's';
  const fx = ns ? (lot.x0 + lot.x1) / 2 : lot.front === 'e' ? lot.x1 : lot.x0;
  const fz = !ns ? (lot.z0 + lot.z1) / 2 : lot.front === 'n' ? lot.z0 : lot.z1;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  return {
    yaw,
    w: ns ? lot.x1 - lot.x0 : lot.z1 - lot.z0,
    d: ns ? lot.z1 - lot.z0 : lot.x1 - lot.x0,
    at: (u: number, v: number, y = 0) => new THREE.Vector3(fx + u * c + v * s, y, fz - u * s + v * c),
  };
}
export type Frame = ReturnType<typeof frame>;

export function createKit(world: RAPIER.World, signDefs: SignDef[]) {
  const geo = new GeoBuilder();
  const bulbs = new GeoBuilder();
  const signs = new GeoBuilder();
  const q = new THREE.Quaternion();
  const leaf = new THREE.Color(0x3f7f35);
  const trunk = new THREE.Color(0x6a5038);
  const rot = (yaw: number) => {
    q.setFromAxisAngle(UP, yaw);
    return { x: q.x, y: q.y, z: q.z, w: q.w };
  };
  const kit = {
    geo,
    bulbs,
    /** Box in a lot's frame (u across, y up from the ground, v inwards), optionally solid. */
    box(f: Frame, w: number, h: number, d: number, u: number, y: number, v: number, c: THREE.Color, solid = true, turn = 0) {
      const p = f.at(u, v);
      geo.box(w, h, d, p.x, y + h / 2, p.z, c, f.yaw + turn);
      if (solid || isRoof(w, h, d, y)) world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(p.x, y + h / 2, p.z).setRotation(rot(f.yaw + turn)));
    },
    /** Any geometry (origin at its base) placed in a lot's frame. */
    shape(f: Frame, g: THREE.BufferGeometry, u: number, y: number, v: number, c: THREE.Color, turn = 0, target = geo) {
      const p = f.at(u, v);
      target.add(g, new THREE.Matrix4().makeRotationY(f.yaw + turn).setPosition(p.x, y, p.z), c);
    },
    /** Invisible wall / solid in a lot's frame. */
    solid(f: Frame, w: number, h: number, d: number, u: number, y: number, v: number) {
      const p = f.at(u, v);
      world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2).setTranslation(p.x, y + h / 2, p.z).setRotation(rot(f.yaw)));
    },
    /** Signboard `row` facing the road, centred at u, bottom at y, standing at depth v. */
    board(f: Frame, row: number, u: number, y: number, v: number, w: number, h: number) {
      const v0 = 1 - (row + 1) / signDefs.length;
      const v1 = 1 - row / signDefs.length;
      const out = f.at(0, -1).sub(f.at(0, 0));
      const a = f.at(u + w / 2, v - 0.02, y);
      const b = f.at(u - w / 2, v - 0.02, y);
      const c = f.at(u - w / 2, v - 0.02, y + h);
      const d = f.at(u + w / 2, v - 0.02, y + h);
      signs.quad(a, b, c, d, [[0, v0], [1, v0], [1, v1], [0, v1]], WHITE, out);
    },
    /** A round shade tree with a trunk collider. */
    tree(f: Frame, u: number, v: number, s = 1) {
      kit.shape(f, new THREE.CylinderGeometry(0.15 * s, 0.25 * s, 3 * s, 6).translate(0, 1.5 * s, 0), u, 0, v, trunk);
      kit.shape(f, new THREE.IcosahedronGeometry(2 * s, 1).scale(1, 0.8, 1), u, 4 * s, v, leaf);
      const p = f.at(u, v);
      world.createCollider(RAPIER.ColliderDesc.cylinder(1.5 * s, 0.25 * s).setTranslation(p.x, 1.5 * s, p.z));
    },
    /** Make the meshes; returns setNight for the signs and bulbs. */
    build(scene: THREE.Scene) {
      const mesh = new THREE.Mesh(geo.build(), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
      mesh.castShadow = mesh.receiveShadow = true;
      const bulbMat = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffe0a0, emissiveIntensity: 0, roughness: 0.4 });
      const atlas = signAtlas(signDefs);
      const signMat = new THREE.MeshStandardMaterial({ map: atlas, emissiveMap: atlas, emissive: 0xffffff, emissiveIntensity: 0.05, roughness: 0.6, side: THREE.DoubleSide });
      scene.add(mesh, new THREE.Mesh(bulbs.build(), bulbMat), new THREE.Mesh(signs.build(), signMat));
      return (night: number) => {
        signMat.emissiveIntensity = 0.05 + night * 0.5;
        bulbMat.emissiveIntensity = night * 2.2;
      };
    },
  };
  return kit;
}
