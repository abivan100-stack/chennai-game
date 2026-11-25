import * as THREE from 'three';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();

/**
 * Collects many quads/boxes/shapes into ONE BufferGeometry (one draw call), each with a
 * flat vertex colour. Used for the town's static geometry.
 */
export class GeoBuilder {
  private readonly pos: number[] = [];
  private readonly nor: number[] = [];
  private readonly uv: number[] = [];
  private readonly col: number[] = [];

  /**
   * Quad a-b-c-d (corners in order around the edge). uvs: one [u, v] per corner.
   * facing: the side the quad should be visible from; the winding is flipped to match.
   */
  quad(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, d: THREE.Vector3, uvs: number[][], color: THREE.Color, facing?: THREE.Vector3) {
    _n.crossVectors(_e1.subVectors(b, a), _e2.subVectors(c, a)).normalize();
    let order = [0, 1, 2, 0, 2, 3];
    if (facing && _n.dot(facing) < 0) {
      _n.negate();
      order = [0, 2, 1, 0, 3, 2];
    }
    for (const i of order) {
      const p = [a, b, c, d][i];
      this.pos.push(p.x, p.y, p.z);
      this.nor.push(_n.x, _n.y, _n.z);
      this.uv.push(uvs[i][0], uvs[i][1]);
      this.col.push(color.r, color.g, color.b);
    }
  }

  /** Any geometry, transformed, in one flat colour. */
  add(geo: THREE.BufferGeometry, matrix: THREE.Matrix4, color: THREE.Color) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const uv = g.attributes.uv;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.pos.push(_v.x, _v.y, _v.z);
      _v.fromBufferAttribute(n, i).applyMatrix3(normalMatrix).normalize();
      this.nor.push(_v.x, _v.y, _v.z);
      this.uv.push(uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0);
      this.col.push(color.r, color.g, color.b);
    }
  }

  /** Axis-aligned box (optionally turned about Y) centred at x, y, z. */
  box(w: number, h: number, d: number, x: number, y: number, z: number, color: THREE.Color, rotY = 0) {
    const m = new THREE.Matrix4().makeRotationY(rotY).setPosition(x, y, z).multiply(new THREE.Matrix4().makeScale(w, h, d));
    this.add(UNIT_BOX, m, color);
  }

  get empty() {
    return this.pos.length === 0;
  }

  /**
   * Baked ground-contact occlusion: where a wall at least AO_MIN_WALL tall meets the ground, its
   * bottom corners are darkened, so the colour fades in up the wall. Free at runtime.
   * Low things (kerbs, steps) are left alone: they would just go dark all over.
   */
  private bakeAo() {
    const { pos, nor, col } = this;
    for (let t = 0; t < pos.length; t += 9) {
      if (Math.abs(nor[t + 1]) > 0.3) continue; // walls only
      const y0 = pos[t + 1];
      const y1 = pos[t + 4];
      const y2 = pos[t + 7];
      const lo = Math.min(y0, y1, y2);
      if (lo > AO_GROUND || lo < -AO_GROUND || Math.max(y0, y1, y2) - lo < AO_MIN_WALL) continue;
      for (let v = 0; v < 9; v += 3) {
        if (pos[t + v + 1] - lo > 0.05) continue;
        col[t + v] *= AO_DARK;
        col[t + v + 1] *= AO_DARK;
        col[t + v + 2] *= AO_DARK;
      }
    }
  }

  build() {
    this.bakeAo();
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.computeBoundingSphere();
    return g;
  }
}

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
/** Walls whose foot is within this height of y = 0 (road / pavement level) get contact shading. */
const AO_GROUND = 0.4;
const AO_MIN_WALL = 1.2;
/** Colour multiplier at the foot of a wall. */
const AO_DARK = 0.6;
