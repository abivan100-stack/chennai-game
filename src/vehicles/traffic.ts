import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Animator } from '../characters/animator';
import type { CharacterAsset, NpcModelId } from '../characters/catalog';
import { block, SETBACK } from '../world/layout';
import { buildAutoModel, SEAT } from './auto';
import { busModel, carModel, scooterModel, bikeModel, taxiModel, vanModel, tempoModel, lorryModel } from './models';
import { randomPlate } from './plates';

const LANE = SETBACK - 2.5; // lane centre: 2.5 m left of the road centre line (we drive on the left)
const CORNER_R = 4;
const CORNER_SPEED = 4;
const LOOKAHEAD = 7; // m along the path to judge an upcoming turn
const HONK_AFTER = 2.5; // s blocked before honking
const HONK_EVERY = 4;
const DRAW_DIST = 130; // m from the camera: further vehicles aren't drawn (fog hides them anyway)
const DETAIL_DIST = 55; // ...and beyond this they drop wheels and driver (5 draw calls each)
const SIGNAL_LOOK = 25; // m: start slowing for a red this far before the stop line

export type Kind = 'auto' | 'car' | 'bus' | 'scooter' | 'bike' | 'taxi' | 'van' | 'tempo' | 'lorry';
/** What the prompt calls each kind ("F - Steal the ..."). */
export const VEHICLE_NAMES: Record<Kind, string> = {
  auto: 'auto', car: 'car', bus: 'bus', scooter: 'scooter', bike: 'bike', taxi: 'Ambassador taxi', van: 'van', tempo: 'mini truck', lorry: 'lorry',
};
export const SPEC: Record<Kind, { speed: number; length: number; width: number; height: number; mass: number }> = {
  auto: { speed: 10, length: 2.6, width: 1.3, height: 1.9, mass: 350 },
  car: { speed: 13, length: 3.8, width: 1.65, height: 1.5, mass: 900 },
  bus: { speed: 9, length: 10, width: 2.5, height: 3.1, mass: 8000 },
  scooter: { speed: 11, length: 1.8, width: 0.7, height: 1.2, mass: 150 },
  bike: { speed: 12, length: 2.0, width: 0.75, height: 1.2, mass: 180 },
  taxi: { speed: 12, length: 4.4, width: 1.75, height: 1.6, mass: 1100 },
  van: { speed: 11, length: 3.5, width: 1.5, height: 1.75, mass: 800 },
  tempo: { speed: 10, length: 4.0, width: 1.6, height: 1.8, mass: 1200 },
  lorry: { speed: 8, length: 7.5, width: 2.45, height: 3.0, mass: 9000 },
};
/** After a shove, a vehicle goes limp (pure physics) this long, then steers back to its lane. */
const KNOCK_SECONDS = 2.5;
const STEER_GAIN = 5; // yaw rate per radian of heading error
const GRIP = 0.25; // fraction of the velocity error corrected per step (tyre grip)

/** Handling when the player drives a stolen vehicle (arcade). */
const HANDLING: Record<Kind, { top: number; accel: number; turn: number }> = {
  auto: { top: 18, accel: 6, turn: 1.9 },
  car: { top: 26, accel: 9, turn: 1.6 },
  bus: { top: 15, accel: 3, turn: 0.8 },
  scooter: { top: 20, accel: 8, turn: 2.4 },
  bike: { top: 27, accel: 10, turn: 2.4 },
  taxi: { top: 24, accel: 7, turn: 1.5 },
  van: { top: 22, accel: 7, turn: 1.7 },
  tempo: { top: 19, accel: 5, turn: 1.5 },
  lorry: { top: 14, accel: 2.2, turn: 0.7 },
};
/** Driver's hip position per vehicle (model space). India drives right-hand: driver on the right (-x). */
export const DRIVER_SEAT: Record<Kind, THREE.Vector3> = {
  auto: SEAT,
  car: new THREE.Vector3(-0.38, 0.78, 0.0),
  bus: new THREE.Vector3(-0.8, 1.45, 4.0),
  scooter: new THREE.Vector3(0, 0.9, -0.2),
  bike: new THREE.Vector3(0, 0.98, -0.3),
  taxi: new THREE.Vector3(-0.4, 0.82, 0.15),
  van: new THREE.Vector3(-0.36, 0.88, 0.85),
  tempo: new THREE.Vector3(-0.36, 0.98, 1.1),
  lorry: new THREE.Vector3(-0.55, 1.75, 2.7),
};
const FLEE_SECONDS = 6;
const FLEE_SPEED = 3.5;

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

export interface Vehicle {
  kind: Kind;
  /** ai = drives its loop; player = stolen and driven by the player; parked = abandoned. */
  mode: 'ai' | 'player' | 'parked';
  driver: THREE.Group | null;
  lights: THREE.MeshStandardMaterial[];
  ctl: { throttle: number; steer: number; brake: boolean };
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

  /** Signal ahead of a front bumper at (x, z) heading (dx, dz), if any (world/trafficLights). */
  signals: ((x: number, z: number, dx: number, dz: number, look: number) => { light: 'green' | 'amber' | 'red'; distToStop: number } | null) | null = null;
  /** Speed multiplier at a point (flood water); 1 = dry road. */
  slowAt: (x: number, z: number) => number = () => 1;
  /** A driver was pulled out of their vehicle and says something. */
  onSay: (name: string, line: string) => void = () => {};
  private readonly scene: THREE.Scene;
  private readonly fleeing: { root: THREE.Group; anim: Animator; dx: number; dz: number; t: number }[] = [];

  constructor(scene: THREE.Scene, world: RAPIER.World, npcs: Map<NpcModelId, CharacterAsset>) {
    this.scene = scene;
    const driverModels = [...npcs.values()];
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
      ['scooter', 2, 2, 0.85, 0xd32f2f],
      ['bike', 3, 2, 0.45, 0x1a1a1a],
      ['taxi', 1, 2, 0.55, 0xf4f1e6],
      ['van', 2, 1, 0.1, 0xfafafa],
      ['tempo', 3, 3, 0.6, 0x1e88e5],
      ['lorry', 2, 3, 0.85, 0xf57c00],
      ['scooter', 3, 1, 0.3, 0x90caf9],
      ['bike', 2, 3, 0.1, 0xb71c1c],
      // Santhome
      ['auto', 4, 1, 0.3],
      ['car', 4, 3, 0.6, 0x37474f],
      ['scooter', 4, 2, 0.2, 0xffeb3b],
      ['bus', 4, 2, 0.7],
      // Mandaveli
      ['bus', 2, 5, 0.2],
      ['auto', 1, 5, 0.5],
      ['scooter', 3, 5, 0.3, 0x8e24aa],
      ['car', 2, 4, 0.8, 0x607d8b],
    ];
    for (const [kind, i, j, start, colour] of fleet) {
      const group = new THREE.Group();
      let wheelMeshes: THREE.Object3D[];
      let wheelR = 0.21;
      let lights: THREE.MeshStandardMaterial[] = [];
      if (kind === 'auto') {
        const m = buildAutoModel(group, randomPlate('commercial'));
        wheelMeshes = m.wheels;
        lights = [m.headlight, m.tail];
      } else {
        const c = colour ?? 0xcccccc;
        const m = kind === 'car' ? carModel(group, c) : kind === 'bus' ? busModel(group)
          : kind === 'scooter' ? scooterModel(group, c) : kind === 'bike' ? bikeModel(group, c)
          : kind === 'taxi' ? taxiModel(group, c) : kind === 'van' ? vanModel(group, c)
          : kind === 'tempo' ? tempoModel(group, c) : lorryModel(group, c);
        wheelMeshes = m.wheels;
        wheelR = m.wheelR;
        lights = m.lights;
      }
      scene.add(group);
      const driver = seatDriver(driverModels[Math.floor(Math.random() * driverModels.length)], group, DRIVER_SEAT[kind]);
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
        kind, mode: 'ai', driver, lights, ctl: { throttle: 0, steer: 0, brake: false },
        group, wheels: wheelMeshes, wheelR, body, path, s: s0, v: sp.speed, blockedFor: 0, honkIn: 0,
        collider, target: sp.speed, knocked: 0,
        prevPos: this.pos.clone(), currPos: this.pos.clone(), prevRot: rot.clone(), currRot: rot.clone(),
      });
    }
  }

  /** Once per frame: decide each vehicle's target speed (corners, obstacles) and honk. */
  update(dt: number, obstacles: Obstacle[]) {
    for (const veh of this.vehicles) {
      if (veh.mode !== 'ai') continue;
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
      // Traffic lights: stop at the line on red, and on amber unless too close to stop.
      if (this.signals) {
        const fx = p.x + this.dir.x * sp.length / 2;
        const fz = p.z + this.dir.z * sp.length / 2;
        const sig = this.signals(fx, fz, this.dir.x, this.dir.z, SIGNAL_LOOK);
        if (sig && sig.light !== 'green' && !(sig.light === 'amber' && sig.distToStop < 3)) {
          target = Math.min(target, Math.max(0, (sig.distToStop - 0.8) * 0.9));
        }
      }
      veh.target = target * this.slowAt(p.x, p.z);

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
      if (veh.mode === 'parked') continue; // abandoned: just friction and damping
      if (veh.mode === 'player') {
        this.drivePlayer(veh, dt);
        continue;
      }
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
  /** eye: camera position, for distance detail (far vehicles drop wheels / driver, very far ones aren't drawn). */
  sync(dt: number, alpha: number, night = 0, eye: THREE.Vector3 | null = null) {
    for (let i = this.fleeing.length - 1; i >= 0; i--) {
      const f = this.fleeing[i];
      f.t += dt;
      f.root.position.x += f.dx * FLEE_SPEED * dt;
      f.root.position.z += f.dz * FLEE_SPEED * dt;
      f.anim.update(dt);
      if (f.t > FLEE_SECONDS) {
        f.root.removeFromParent();
        this.fleeing.splice(i, 1);
      }
    }
    for (const veh of this.vehicles) {
      veh.group.position.lerpVectors(veh.prevPos, veh.currPos, alpha);
      veh.group.quaternion.slerpQuaternions(veh.prevRot, veh.currRot, alpha);
      if (eye) {
        const d = veh.group.position.distanceTo(eye);
        veh.group.visible = d < DRAW_DIST || veh.mode === 'player';
        const near = d < DETAIL_DIST || veh.mode === 'player';
        for (const w of veh.wheels) w.visible = near;
        if (veh.driver) veh.driver.visible = near;
      }
      const lv = veh.body.linvel();
      const fwd = this.dir.set(0, 0, 1).applyQuaternion(veh.group.quaternion);
      const speed = lv.x * fwd.x + lv.z * fwd.z;
      for (const w of veh.wheels) w.rotation.x += (speed * dt) / veh.wheelR;
      if (veh.lights[0]) veh.lights[0].emissiveIntensity = veh.mode === 'parked' ? 0 : 0.2 + night * 2.5;
    }
  }

  // ---- Stealing vehicles ------------------------------------------------------------------

  /** A vehicle you could get into from `p` (on foot), or null. */
  enterable(p: THREE.Vector3) {
    let best: Vehicle | null = null;
    let bestD = Infinity;
    for (const v of this.vehicles) {
      const d = Math.hypot(v.currPos.x - p.x, v.currPos.z - p.z) - SPEC[v.kind].length / 2;
      if (d < 1.8 && d < bestD) {
        best = v;
        bestD = d;
      }
    }
    return best;
  }

  /** Player takes the vehicle. Returns true if that was theft (someone was driving it). */
  take(v: Vehicle) {
    const stolen = v.driver !== null;
    if (v.driver) this.eject(v);
    v.mode = 'player';
    v.knocked = 0;
    v.ctl = { throttle: 0, steer: 0, brake: false };
    return stolen;
  }

  /** Player got out: the vehicle stays where it is. */
  release(v: Vehicle) {
    v.mode = 'parked';
  }

  control(v: Vehicle, throttle: number, steer: number, brake: boolean) {
    v.ctl.throttle = throttle;
    v.ctl.steer = steer;
    v.ctl.brake = brake;
  }

  /** Signed forward speed (m/s) of a vehicle. */
  speedOf(v: Vehicle) {
    const lv = v.body.linvel();
    const f = this.dir.set(0, 0, 1).applyQuaternion(v.group.quaternion);
    return lv.x * f.x + lv.z * f.z;
  }

  headingOf(v: Vehicle) {
    const f = this.dir.set(0, 0, 1).applyQuaternion(v.group.quaternion);
    return Math.atan2(f.x, f.z);
  }

  /** Arcade driving for a stolen vehicle: speed along the nose, yaw rate from steering. */
  private drivePlayer(v: Vehicle, dt: number) {
    const h = HANDLING[v.kind];
    const r = v.body.rotation();
    const yaw = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.x * r.x));
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const lv = v.body.linvel();
    let speed = lv.x * fx + lv.z * fz;
    const { throttle, steer, brake } = v.ctl;
    if (brake) speed *= 1 - Math.min(1, 4 * dt);
    else if (throttle > 0) speed = speed < -0.3 ? speed + h.accel * 2 * dt : Math.min(h.top * this.slowAt(v.currPos.x, v.currPos.z), speed + h.accel * dt);
    else if (throttle < 0) speed = speed > 0.3 ? speed - h.accel * 2 * dt : Math.max(-5, speed - h.accel * 0.7 * dt);
    else speed *= 1 - Math.min(1, 0.8 * dt);
    // Tyres kill most sideways slide each step.
    const side = { x: lv.x - fx * (lv.x * fx + lv.z * fz), z: lv.z - fz * (lv.x * fx + lv.z * fz) };
    v.body.setLinvel({ x: fx * speed + side.x * 0.8, y: lv.y, z: fz * speed + side.z * 0.8 }, true);
    const grip = Math.min(1, Math.abs(speed) / 4);
    v.body.setAngvel({ x: 0, y: steer * h.turn * grip * Math.sign(speed || 1), z: 0 }, true);
  }

  /** Pull the driver out: they run away from the vehicle, shouting. */
  private eject(v: Vehicle) {
    const root = v.driver!;
    v.driver = null;
    this.scene.attach(root);
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(v.group.quaternion);
    root.position.copy(v.currPos).addScaledVector(side, SPEC[v.kind].width / 2 + 0.7);
    root.position.y = 0;
    root.rotation.set(0, Math.atan2(side.x, side.z), 0);
    const anim = root.userData.anim as Animator;
    anim.play('run', { fade: 0.2 });
    this.fleeing.push({ root, anim, dx: side.x, dz: side.z, t: 0 });
    this.onSay('Driver', DRIVER_LINES[Math.floor(Math.random() * DRIVER_LINES.length)]);
  }

  /** Two short beeps via WebAudio (no sound files). */
  private honk(kind: Kind) {
    try {
      this.audio ??= new AudioContext();
      const ctx = this.audio;
      const freq = kind === 'bus' || kind === 'lorry' ? 220 : kind === 'scooter' || kind === 'bike' ? 650 : kind === 'auto' ? 520 : 400;
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

const DRIVER_LINES = ['Dei! En vandi! Thirudan, thirudan!', 'Aiyo! Police-a koopdunga!', 'Ennoda vandi da adhu! Nil!'];

/**
 * Sit an NPC in the driver's seat in the (retargeted) Driving pose. The pose is set once and the
 * mixer never updated again, so a seated driver costs almost nothing per frame.
 */
function seatDriver(asset: CharacterAsset, parent: THREE.Group, hips: THREE.Vector3) {
  const body = cloneSkinned(asset.scene);
  const root = new THREE.Group();
  root.add(body);
  root.scale.setScalar(0.95);
  parent.add(root);
  const anim = new Animator(body, asset.clips);
  anim.play('drive', { fade: 0 });
  anim.update(0.01);
  parent.updateMatrixWorld(true);
  const local = parent.worldToLocal(body.getObjectByName('Hips')!.getWorldPosition(new THREE.Vector3()));
  root.position.add(hips.clone().sub(local));
  body.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = false;
  });
  root.userData.anim = anim;
  return root;
}
