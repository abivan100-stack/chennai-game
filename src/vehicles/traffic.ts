import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { block, SETBACK } from '../world/layout';
import { buildAutoModel } from './auto';

const LANE = SETBACK - 2.5; // lane centre: 2.5 m left of the road centre line (we drive on the left)
const CORNER_R = 4;
const ACCEL = 3;
const BRAKE = 9;
const CORNER_SPEED = 4;
const LOOKAHEAD = 7; // m along the path to judge an upcoming turn
const HONK_AFTER = 2.5; // s blocked before honking
const HONK_EVERY = 4;

type Kind = 'auto' | 'car' | 'bus';
const SPEC: Record<Kind, { speed: number; length: number; width: number; height: number }> = {
  auto: { speed: 7, length: 2.6, width: 1.3, height: 1.9 },
  car: { speed: 9, length: 3.8, width: 1.65, height: 1.5 },
  bus: { speed: 6, length: 10, width: 2.5, height: 3.1 },
};

/** Closed loop with rounded corners, sampled by distance. */
class Path {
  readonly pts: THREE.Vector3[] = [];
  private readonly cum: number[] = [0];
  readonly length: number;

  constructor(corners: THREE.Vector3[]) {
    const n = corners.length;
    for (let i = 0; i < n; i++) {
      const prev = corners[(i + n - 1) % n];
      const c = corners[i];
      const next = corners[(i + 1) % n];
      const a = c.clone().add(prev.clone().sub(c).setLength(CORNER_R));
      const b = c.clone().add(next.clone().sub(c).setLength(CORNER_R));
      for (let k = 0; k <= 6; k++) {
        const t = k / 6; // quadratic Bezier a -> c -> b approximates the arc
        this.pts.push(a.clone().multiplyScalar((1 - t) ** 2).add(c.clone().multiplyScalar(2 * t * (1 - t))).add(b.clone().multiplyScalar(t * t)));
      }
    }
    for (let i = 1; i <= this.pts.length; i++) {
      this.cum.push(this.cum[i - 1] + this.pts[i - 1].distanceTo(this.pts[i % this.pts.length]));
    }
    this.length = this.cum[this.cum.length - 1];
  }

  /** Position and unit direction at distance s along the loop. */
  at(s: number, pos: THREE.Vector3, dir: THREE.Vector3) {
    s = ((s % this.length) + this.length) % this.length;
    let i = 0;
    while (this.cum[i + 1] < s) i++;
    const a = this.pts[i];
    const b = this.pts[(i + 1) % this.pts.length];
    const t = (s - this.cum[i]) / (this.cum[i + 1] - this.cum[i] || 1);
    pos.lerpVectors(a, b, t);
    dir.subVectors(b, a).normalize();
  }
}

/** Loop round block (i, j) in the left-hand lane: the block stays on the driver's left. */
function blockRoute(i: number, j: number) {
  const b = block(i, j);
  const v = (x: number, z: number) => new THREE.Vector3(x, 0, z);
  return new Path([v(b.x1 + LANE, b.z1 + LANE), v(b.x1 + LANE, b.z0 - LANE), v(b.x0 - LANE, b.z0 - LANE), v(b.x0 - LANE, b.z1 + LANE)]);
}

function carModel(group: THREE.Group, colour: number) {
  const body = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.35, metalness: 0.4 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x1d2830, roughness: 0.1, metalness: 0.5 });
  const lower = new THREE.Mesh(new RoundedBoxGeometry(1.65, 0.6, 3.8, 3, 0.15).translate(0, 0.6, 0), body);
  const cabin = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.55, 2.1, 3, 0.15).translate(0, 1.15, -0.2), glass);
  const roof = new THREE.Mesh(new RoundedBoxGeometry(1.45, 0.08, 1.8, 2, 0.04).translate(0, 1.44, -0.25), body);
  group.add(lower, cabin, roof);
  return wheels(group, 0.3, [[0.75, 1.25], [-0.75, 1.25], [0.75, -1.25], [-0.75, -1.25]]);
}

function busModel(group: THREE.Group) {
  const white = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.5 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x1d4fa8, roughness: 0.5 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x22303a, roughness: 0.1, metalness: 0.4 });
  group.add(
    new THREE.Mesh(new RoundedBoxGeometry(2.5, 2.6, 10, 3, 0.2).translate(0, 1.85, 0), white),
    new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.5, 9.9).translate(0, 0.95, 0), blue),
    new THREE.Mesh(new THREE.BoxGeometry(2.54, 0.9, 9.4).translate(0, 2.3, -0.2), glass),
    new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.0, 0.05).translate(0, 2.2, 5.0), glass),
  );
  return wheels(group, 0.5, [[1.1, 3.4], [-1.1, 3.4], [1.1, -3.2], [-1.1, -3.2]]);
}

function wheels(group: THREE.Group, r: number, at: number[][]) {
  const geo = new THREE.CylinderGeometry(r, r, 0.25, 12).rotateZ(Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 });
  return at.map(([x, z]) => {
    const w = new THREE.Mesh(geo, mat);
    w.position.set(x, r, z);
    group.add(w);
    return w;
  });
}

interface Vehicle {
  kind: Kind;
  group: THREE.Group;
  wheels: THREE.Object3D[];
  wheelR: number;
  body: RAPIER.RigidBody;
  path: Path;
  s: number;
  v: number;
  blockedFor: number;
  honkIn: number;
}

/** Things traffic must not drive into (position + whether it's worth honking at). */
export interface Obstacle {
  x: number;
  z: number;
  honk: boolean;
}

/**
 * Background traffic: other autos, hatchbacks and an MTC bus looping round the central blocks
 * in the left-hand lane. Kinematic bodies (you bump into them, they don't get pushed); they
 * slow for corners and stop for anything in front, honking if it's you.
 */
export class Traffic {
  readonly vehicles: Vehicle[] = [];
  private readonly pos = new THREE.Vector3();
  private readonly dir = new THREE.Vector3();
  private readonly ahead = new THREE.Vector3();
  private readonly aheadDir = new THREE.Vector3();
  private audio: AudioContext | null = null;

  constructor(scene: THREE.Scene, world: RAPIER.World) {
    const fleet: [Kind, number, number, number, number?][] = [
      // kind, block i, j, start fraction, colour
      ['bus', 1, 2, 0.1],
      ['auto', 2, 2, 0.6],
      ['car', 2, 2, 0.15, 0xd8d8d8],
      ['auto', 3, 2, 0.2],
      ['car', 3, 2, 0.7, 0xb3202a],
      ['car', 2, 1, 0.5, 0x2b5fb3],
      ['auto', 2, 3, 0.4],
      ['car', 3, 3, 0.1, 0xf4f4f4],
    ];
    for (const [kind, i, j, start, colour] of fleet) {
      const group = new THREE.Group();
      let wheelMeshes: THREE.Object3D[];
      let wheelR = 0.21;
      if (kind === 'auto') wheelMeshes = buildAutoModel(group).wheels;
      else if (kind === 'car') {
        wheelMeshes = carModel(group, colour ?? 0xcccccc);
        wheelR = 0.3;
      } else {
        wheelMeshes = busModel(group);
        wheelR = 0.5;
      }
      group.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
      });
      scene.add(group);
      const sp = SPEC[kind];
      const body = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased());
      world.createCollider(RAPIER.ColliderDesc.cuboid(sp.width / 2, sp.height / 2, sp.length / 2).setTranslation(0, sp.height / 2, 0), body);
      const path = blockRoute(i, j);
      this.vehicles.push({ kind, group, wheels: wheelMeshes, wheelR, body, path, s: start * path.length, v: sp.speed, blockedFor: 0, honkIn: 0 });
    }
  }

  update(dt: number, obstacles: Obstacle[]) {
    for (const veh of this.vehicles) {
      const sp = SPEC[veh.kind];
      veh.path.at(veh.s, this.pos, this.dir);
      // Slow down for an upcoming turn.
      veh.path.at(veh.s + LOOKAHEAD, this.ahead, this.aheadDir);
      const turning = this.dir.dot(this.aheadDir) < 0.9;
      let target = turning ? Math.min(CORNER_SPEED, sp.speed) : sp.speed;

      // Stop for anything in the lane ahead.
      const reach = sp.length / 2 + 3 + veh.v * 1.2;
      let honkable = false;
      let blocked = false;
      const check = (x: number, z: number, honk: boolean) => {
        const rx = x - this.pos.x;
        const rz = z - this.pos.z;
        const along = rx * this.dir.x + rz * this.dir.z;
        const side = Math.abs(rx * this.dir.z - rz * this.dir.x);
        if (along > 0 && along < reach && side < sp.width / 2 + 0.6) {
          blocked = true;
          honkable ||= honk;
        }
      };
      for (const o of obstacles) check(o.x, o.z, o.honk);
      for (const other of this.vehicles) if (other !== veh) check(other.group.position.x, other.group.position.z, false);
      if (blocked) target = 0;

      veh.v = target > veh.v ? Math.min(target, veh.v + ACCEL * dt) : Math.max(target, veh.v - BRAKE * dt);
      veh.s += veh.v * dt;
      veh.path.at(veh.s, this.pos, this.dir);
      veh.group.position.copy(this.pos);
      veh.group.rotation.y = Math.atan2(this.dir.x, this.dir.z);
      for (const w of veh.wheels) w.rotation.x += (veh.v * dt) / veh.wheelR;
      veh.body.setNextKinematicTranslation(this.pos);
      veh.body.setNextKinematicRotation(veh.group.quaternion);

      // Chennai rules: if you're in the way, they let you know.
      veh.blockedFor = blocked && veh.v < 0.5 ? veh.blockedFor + dt : 0;
      veh.honkIn -= dt;
      if (honkable && veh.blockedFor > HONK_AFTER && veh.honkIn <= 0) {
        veh.honkIn = HONK_EVERY;
        this.honk(veh.kind);
      }
    }
  }

  /** Two short beeps via WebAudio (no sound files). */
  private honk(kind: Kind) {
    try {
      this.audio ??= new AudioContext();
      const ctx = this.audio;
      const freq = kind === 'bus' ? 220 : kind === 'car' ? 400 : 520;
      for (const start of [0, 0.22]) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.06, ctx.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + start + 0.18);
        osc.connect(gain).connect(ctx.destination);
        osc.start(ctx.currentTime + start);
        osc.stop(ctx.currentTime + start + 0.2);
      }
    } catch {
      // Audio blocked until the first click; no honk then.
    }
  }
}
