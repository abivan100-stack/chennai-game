import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { block, SETBACK } from '../world/layout';
import { buildAutoModel } from './auto';

const LANE = SETBACK - 2.5; // lane centre: 2.5 m left of the road centre line (we drive on the left)
const CORNER_R = 4;
const CORNER_SPEED = 4;
const LOOKAHEAD = 7; // m along the path to judge an upcoming turn
const HONK_AFTER = 2.5; // s blocked before honking
const HONK_EVERY = 4;

type Kind = 'auto' | 'car' | 'bus';
const SPEC: Record<Kind, { speed: number; length: number; width: number; height: number; mass: number }> = {
  auto: { speed: 7, length: 2.6, width: 1.3, height: 1.9, mass: 350 },
  car: { speed: 9, length: 3.8, width: 1.65, height: 1.5, mass: 900 },
  bus: { speed: 6, length: 10, width: 2.5, height: 3.1, mass: 8000 },
};
/** After a shove, a vehicle goes limp (pure physics) this long, then steers back to its lane. */
const KNOCK_SECONDS = 2.5;
const STEER_GAIN = 5; // yaw rate per radian of heading error
const GRIP = 0.25; // fraction of the velocity error corrected per step (tyre grip)

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

  /** Distance along the loop of the point nearest to (x, z) (projected onto each segment). */
  nearest(x: number, z: number) {
    let best = 0;
    let bestD = Infinity;
    const n = this.pts.length;
    for (let i = 0; i < n; i++) {
      const a = this.pts[i];
      const b = this.pts[(i + 1) % n];
      const ex = b.x - a.x;
      const ez = b.z - a.z;
      const len2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - a.x) * ex + (z - a.z) * ez) / len2));
      const d = (a.x + ex * t - x) ** 2 + (a.z + ez * t - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = this.cum[i] + t * Math.sqrt(len2);
      }
    }
    return best;
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
  collider: RAPIER.Collider;
  target: number; // speed we want (set per frame from corners / obstacles)
  knocked: number; // s left of being pushed around
  prevPos: THREE.Vector3;
  currPos: THREE.Vector3;
  prevRot: THREE.Quaternion;
  currRot: THREE.Quaternion;
}

/** Things traffic must not drive into (position + whether it's worth honking at). */
export interface Obstacle {
  x: number;
  z: number;
  honk: boolean;
}

/**
 * Background traffic: other autos, hatchbacks and an MTC bus looping round the central blocks
 * in the left-hand lane. Dynamic bodies with real mass: they drive by velocity control along
 * their lane, slow for corners and stop for anything in front (honking if it's you). Shove one
 * with the auto (or on foot) and it goes limp for a moment, slides, then steers back.
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
      // Dynamic body with real mass, kept upright: it can be shoved; it drives by velocity control.
      const path = blockRoute(i, j);
      const s0 = start * path.length;
      path.at(s0, this.pos, this.dir);
      const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(this.dir.x, this.dir.z));
      const body = world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(this.pos.x, 0.02, this.pos.z)
          .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
          .enabledRotations(false, true, false)
          .setLinearDamping(0.6)
          .setAngularDamping(2)
          .setCanSleep(false),
      );
      const collider = world.createCollider(
        RAPIER.ColliderDesc.cuboid(sp.width / 2, sp.height / 2, sp.length / 2).setTranslation(0, sp.height / 2 + 0.03, 0).setMass(sp.mass).setFriction(0.3),
        body,
      );
      this.vehicles.push({
        kind, group, wheels: wheelMeshes, wheelR, body, path, s: s0, v: sp.speed, blockedFor: 0, honkIn: 0,
        collider, target: sp.speed, knocked: 0,
        prevPos: this.pos.clone(), currPos: this.pos.clone(), prevRot: rot.clone(), currRot: rot.clone(),
      });
    }
  }

  /** Once per frame: decide each vehicle's target speed (corners, obstacles) and honk. */
  update(dt: number, obstacles: Obstacle[]) {
    for (const veh of this.vehicles) {
      const sp = SPEC[veh.kind];
      const p = veh.currPos;
      veh.path.at(veh.s, this.ahead, this.dir);
      veh.path.at(veh.s + LOOKAHEAD, this.ahead, this.aheadDir);
      const turning = this.dir.dot(this.aheadDir) < 0.9;
      let target = turning ? Math.min(CORNER_SPEED, sp.speed) : sp.speed;

      // Stop for anything in the lane ahead.
      const reach = sp.length / 2 + 3 + Math.max(0, veh.v) * 1.2;
      let honkable = false;
      let blocked = false;
      const check = (x: number, z: number, honk: boolean) => {
        const rx = x - p.x;
        const rz = z - p.z;
        const along = rx * this.dir.x + rz * this.dir.z;
        const side = Math.abs(rx * this.dir.z - rz * this.dir.x);
        if (along > 0 && along < reach && side < sp.width / 2 + 0.6) {
          blocked = true;
          honkable ||= honk;
        }
      };
      for (const o of obstacles) check(o.x, o.z, o.honk);
      for (const other of this.vehicles) if (other !== veh) check(other.currPos.x, other.currPos.z, false);
      if (blocked) target = 0;
      veh.target = target;

      // Chennai rules: if you're in the way, they let you know.
      veh.blockedFor = blocked && veh.v < 0.5 ? veh.blockedFor + dt : 0;
      veh.honkIn -= dt;
      if (honkable && veh.blockedFor > HONK_AFTER && veh.honkIn <= 0) {
        veh.honkIn = HONK_EVERY;
        this.honk(veh.kind);
      }
    }
  }

  /** Each physics step, before world.step(): steer towards the lane, unless just shoved. */
  step(dt: number) {
    for (const veh of this.vehicles) {
      if (veh.knocked > 0) {
        veh.knocked -= dt;
        continue; // let physics push it about
      }
      const t = veh.body.translation();
      const lv = veh.body.linvel();
      // Track progress along the route; re-find it after being pushed off.
      veh.path.at(veh.s, this.pos, this.dir);
      if ((this.pos.x - t.x) ** 2 + (this.pos.z - t.z) ** 2 > 9) veh.s = veh.path.nearest(t.x, t.z);
      veh.v = lv.x * this.dir.x + lv.z * this.dir.z;
      veh.s += Math.max(0, veh.v) * dt;

      // Pure pursuit: aim at a point a little ahead on the lane.
      veh.path.at(veh.s + Math.max(4, veh.v * 0.8), this.ahead, this.aheadDir);
      const dx = this.ahead.x - t.x;
      const dz = this.ahead.z - t.z;
      const d = Math.hypot(dx, dz) || 1;
      const wx = (dx / d) * veh.target;
      const wz = (dz / d) * veh.target;
      // Limited grip: correct only part of the velocity error each step, so shoves still show.
      veh.body.setLinvel({ x: lv.x + (wx - lv.x) * GRIP, y: lv.y, z: lv.z + (wz - lv.z) * GRIP }, true);
      const r = veh.body.rotation();
      const yaw = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.x * r.x));
      const goal = Math.atan2(dx, dz);
      const err = Math.atan2(Math.sin(goal - yaw), Math.cos(goal - yaw));
      veh.body.setAngvel({ x: 0, y: veh.target > 0 || veh.v > 0.3 ? err * STEER_GAIN : 0, z: 0 }, true);
    }
  }

  /**
   * After each world.step(): anything touching a pusher (the player, the player's auto) or an
   * already-shoved vehicle goes limp too. Records poses for interpolation.
   */
  afterStep(world: RAPIER.World, pushers: RAPIER.Collider[]) {
    const limp = new Set(this.vehicles.filter((v) => v.knocked > 0).map((v) => v.collider));
    for (const veh of this.vehicles) {
      world.contactPairsWith(veh.collider, (other) => {
        const byPlayer = pushers.includes(other);
        if (!byPlayer && !limp.has(other)) return;
        if (byPlayer && veh.knocked <= 0) this.honk(veh.kind);
        veh.knocked = KNOCK_SECONDS;
      });
      const t = veh.body.translation();
      const r = veh.body.rotation();
      veh.prevPos.copy(veh.currPos);
      veh.prevRot.copy(veh.currRot);
      veh.currPos.set(t.x, t.y, t.z);
      veh.currRot.set(r.x, r.y, r.z, r.w);
    }
  }

  /** Once per frame: blend the last two physics poses into the models, spin the wheels. */
  sync(dt: number, alpha: number) {
    for (const veh of this.vehicles) {
      veh.group.position.lerpVectors(veh.prevPos, veh.currPos, alpha);
      veh.group.quaternion.slerpQuaternions(veh.prevRot, veh.currRot, alpha);
      const lv = veh.body.linvel();
      const fwd = this.dir.set(0, 0, 1).applyQuaternion(veh.group.quaternion);
      const speed = lv.x * fwd.x + lv.z * fwd.z;
      for (const w of veh.wheels) w.rotation.x += (speed * dt) / veh.wheelR;
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
