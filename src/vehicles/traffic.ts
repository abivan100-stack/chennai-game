import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Animator } from '../characters/animator';
import { pair, pairAt, poseRider, type RiderPose } from '../characters/rider';
import type { CharacterAsset, NpcModelId } from '../characters/catalog';
import { RIVER, block, blocks, SETBACK } from '../world/layout';
import { buildAutoModel, SEAT } from './auto';
import { busModel, carModel, scooterModel, bikeModel, taxiModel, vanModel, tempoModel, lorryModel, suvModel, hatchModel, tankerModel, deliveryModel, driverOf, rearOf, wheelOf, HATCH, MPV, SEDAN, SUV } from './models';
import { randomPlate } from './plates';

const LANE = SETBACK - 2.5; // lane centre: 2.5 m left of the road centre line (we drive on the left)
const CORNER_R = 4;
const CORNER_SPEED = 4;
const LOOKAHEAD = 7; // m along the path to judge an upcoming turn
const HONK_AFTER = 2.5; // s blocked before honking
/** Gridlock breakers: after waiting this long behind other vehicles, nose through them for PUSH_ON s. */
const PATIENCE = 4;
const PUSH_ON = 2.5;
/** Traffic runs this much faster than SPEC's base speeds; vehicles you drive get PLAYER_TOP x their handling. */
const AI_SPEED = 1.15;
const PLAYER_TOP = 1.35;
const PLAYER_ACCEL = 1.25;
/**
 * Your fault, now and then: when you cut in close in front of a moving vehicle (or stop dead in
 * its lane) it reacts late this often, for LATE_SECONDS, and hits you.
 */
const LATE_CHANCE = 0.06;
const CUT_IN_SPEED = 1.5; // m/s sideways into its lane: a real cut-in (stopped / straight ahead never counts)
const LATE_SECONDS = 0.9;
const LATE_MIN_SPEED = 5; // m/s: slow traffic always stops in time
/** Closing speed (m/s) that counts as a crash between a vehicle and yours. */
const CRASH_SPEED = 2.5;
/** The body box starts this high, so it clears kerbs (pavements are 0.15 m); heights are set, not left to gravity. */
const CLEARANCE = 0.22;
const STUCK_AFTER = 5;
/** Jams / pile-ups clear themselves: stopped this long (not at a red light, not for you), or this long knocked off its lane. */
const STALL_AFTER = 10;
const UNTANGLE_AFTER = 5; // s wanting to move but not moving (wedged on a kerb): put it back in its lane
const HONK_EVERY = 4;
const DRAW_DIST = 95; // m from the camera: further vehicles aren't drawn (fog hides them anyway)
const DETAIL_DIST = 32; // ...and beyond this they drop wheels and driver (5 draw calls each)
const MAX_DRAWN = 12; // at most this many vehicles drawn (nearest first)
/** Ambient traffic: a pool that keeps the roads round the player busy wherever they go. */
const AMBIENT_RECYCLE = 140; // m: a pool vehicle this far away gets moved...
const AMBIENT_RING: [number, number] = [45, 120]; // ...onto a road loop this far from the player
const AMBIENT_HIDDEN_WITHIN = 80; // closer than this, only where the camera isn't looking
const AMBIENT_GAP = 14; // m clear of any other vehicle when placed
const AMBIENT_FLEET: [Kind, number?][] = [
  ['auto'], ['auto'], ['auto'], ['shareauto'], ['shareauto'],
  ['hatch', 0xe53935], ['hatch', 0xf4f4f4], ['hatch', 0x1e88e5], ['hatch', 0x9e9e9e], ['hatch', 0xfdd835],
  ['suv', 0xf4f4f4], ['suv', 0x263238], ['suv', 0x8d6e63],
  ['car', 0xb0bec5], ['car', 0x1a237e], ['taxi', 0xf5f5f5],
  ['scooter', 0x90caf9], ['scooter', 0xf48fb1], ['bike', 0x212121], ['bike', 0xb71c1c],
  ['delivery'], ['delivery'], ['bus'], ['bus'], ['tanker'], ['tempo', 0x43a047], ['van', 0xfafafa], ['lorry', 0xf57c00],
];
const SIGNAL_LOOK = 25; // m: start slowing for a red this far before the stop line

export type Kind = 'auto' | 'car' | 'bus' | 'scooter' | 'bike' | 'taxi' | 'van' | 'tempo' | 'lorry' | 'suv' | 'hatch' | 'shareauto' | 'tanker' | 'delivery';
/** What the prompt calls each kind ("F - Steal the ..."). */
export const VEHICLE_NAMES: Record<Kind, string> = {
  auto: 'auto', car: 'car', bus: 'bus', scooter: 'scooter', bike: 'bike', taxi: 'call taxi', van: 'van', tempo: 'mini truck', lorry: 'lorry',
  suv: 'SUV', hatch: 'hatchback', shareauto: 'share auto', tanker: 'water tanker', delivery: 'delivery scooter',
};
export const SPEC: Record<Kind, { speed: number; length: number; width: number; height: number; mass: number }> = {
  auto: { speed: 10, length: 2.6, width: 1.3, height: 1.9, mass: 350 },
  car: { speed: 13, length: 4.0, width: 1.7, height: 1.5, mass: 950 },
  bus: { speed: 9, length: 10, width: 2.5, height: 3.1, mass: 8000 },
  scooter: { speed: 11, length: 1.8, width: 0.7, height: 1.2, mass: 150 },
  bike: { speed: 12, length: 2.0, width: 0.75, height: 1.2, mass: 180 },
  taxi: { speed: 12, length: 4.4, width: 1.74, height: 1.7, mass: 1200 },
  van: { speed: 11, length: 3.7, width: 1.5, height: 1.9, mass: 900 },
  tempo: { speed: 10, length: 4.0, width: 1.6, height: 1.8, mass: 1200 },
  lorry: { speed: 8, length: 7.5, width: 2.45, height: 3.0, mass: 9000 },
  suv: { speed: 13, length: 4.3, width: 1.8, height: 1.7, mass: 1300 },
  hatch: { speed: 12, length: 3.85, width: 1.7, height: 1.5, mass: 900 },
  shareauto: { speed: 9, length: 3.6, width: 1.55, height: 2.2, mass: 600 },
  tanker: { speed: 7.5, length: 7.5, width: 2.4, height: 3.3, mass: 11000 },
  delivery: { speed: 11, length: 1.8, width: 0.7, height: 1.6, mass: 160 },
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
  suv: { top: 27, accel: 8, turn: 1.4 },
  hatch: { top: 25, accel: 9, turn: 1.7 },
  shareauto: { top: 15, accel: 4, turn: 1.4 },
  tanker: { top: 13, accel: 2, turn: 0.7 },
  delivery: { top: 20, accel: 8, turn: 2.4 },
};
/** Driver's hip position per vehicle (model space). India drives right-hand: driver on the right (-x). */
export const DRIVER_SEAT: Record<Kind, THREE.Vector3> = {
  auto: SEAT,
  car: driverOf(SEDAN),
  bus: new THREE.Vector3(-0.8, 1.45, 4.0),
  scooter: new THREE.Vector3(0, 0.95, -0.3),
  bike: new THREE.Vector3(0, 0.99, -0.18),
  taxi: driverOf(MPV),
  van: new THREE.Vector3(-0.36, 0.88, 0.85),
  tempo: new THREE.Vector3(-0.36, 0.98, 1.1),
  lorry: new THREE.Vector3(-0.55, 1.75, 2.7),
  suv: driverOf(SUV),
  hatch: driverOf(HATCH),
  shareauto: new THREE.Vector3(SEAT.x * 1.2, SEAT.y * 1.15, SEAT.z * 1.45),
  tanker: new THREE.Vector3(-0.55, 1.75, 2.7),
  delivery: new THREE.Vector3(0, 0.95, -0.3),
};
/** Hands on a steering wheel centred at `wheel`, feet forward on the pedals. */
const carPose = (hips: THREE.Vector3, wheel: THREE.Vector3): RiderPose => ({
  hips,
  hands: pairAt(wheel.x, 0.16, wheel.y + 0.03, wheel.z - 0.07),
  feet: pairAt(hips.x, 0.13, Math.max(hips.y - 0.42, 0.3), hips.z + 0.7),
  lean: 0,
});
/** Rear seat (passenger hips, model space) of the cars you can own and run rides in. */
export const PASSENGER_SEAT: Partial<Record<Kind, THREE.Vector3>> = {
  car: rearOf(SEDAN),
  hatch: rearOf(HATCH),
  suv: rearOf(SUV),
  taxi: rearOf(MPV),
  van: new THREE.Vector3(0.36, 0.86, -0.25),
};
/** Where a parcel rides on a two-wheeler (bike carrier rack / scooter pillion seat). */
export const PARCEL_SPOT: Partial<Record<Kind, THREE.Vector3>> = {
  bike: new THREE.Vector3(0, 0.98, -0.72),
  scooter: new THREE.Vector3(0, 0.98, -0.66),
  delivery: new THREE.Vector3(0, 0.98, -0.66),
};
/** Where everything goes when someone rides each kind (model space; see characters/rider.ts). */
export const RIDER_POSE: Record<Kind, RiderPose> = {
  auto: { hips: SEAT, hands: pair(0.27, 1.25, 0.54), feet: pair(0.14, 0.55, 0.62), lean: 0.05 },
  shareauto: { hips: DRIVER_SEAT.shareauto, hands: pair(0.32, 1.44, 0.8), feet: pair(0.16, 0.63, 0.9), lean: 0.05 },
  // Bike: knees in by the tank, feet on the pegs, slight lean to the bars.
  bike: { hips: DRIVER_SEAT.bike, hands: pair(0.34, 1.08, 0.33), feet: pair(0.2, 0.44, -0.06), lean: 0.32 },
  // Scooter: upright, feet flat on the floorboard.
  scooter: { hips: DRIVER_SEAT.scooter, hands: pair(0.3, 1.11, 0.41), feet: pair(0.12, 0.43, 0.1), lean: 0.06 },
  delivery: { hips: DRIVER_SEAT.delivery, hands: pair(0.3, 1.11, 0.41), feet: pair(0.12, 0.43, 0.1), lean: 0.06 },
  car: carPose(DRIVER_SEAT.car, wheelOf(SEDAN)),
  hatch: carPose(DRIVER_SEAT.hatch, wheelOf(HATCH)),
  suv: carPose(DRIVER_SEAT.suv, wheelOf(SUV)),
  taxi: carPose(DRIVER_SEAT.taxi, wheelOf(MPV)),
  van: carPose(DRIVER_SEAT.van, new THREE.Vector3(-0.36, 1.25, 1.32)),
  bus: carPose(DRIVER_SEAT.bus, DRIVER_SEAT.bus.clone().add(new THREE.Vector3(0, 0.42, 0.55))),
  tempo: carPose(DRIVER_SEAT.tempo, DRIVER_SEAT.tempo.clone().add(new THREE.Vector3(0, 0.42, 0.5))),
  lorry: carPose(DRIVER_SEAT.lorry, DRIVER_SEAT.lorry.clone().add(new THREE.Vector3(0, 0.42, 0.55))),
  tanker: carPose(DRIVER_SEAT.tanker, DRIVER_SEAT.tanker.clone().add(new THREE.Vector3(0, 0.42, 0.55))),
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
  id: number;
  /** Body colour it was built with (owned vehicles are saved with it). */
  colour?: number;
  /** For sale at the dealer: can't be got into. */
  locked?: boolean;
  /** Heading this frame (unit, on the ground). */
  hx: number;
  hz: number;
  /** The vehicle it's waiting behind (last frame), s waited behind vehicles, s left ignoring them, s stuck. */
  blocker: Vehicle | null;
  waitVeh: number;
  pushOn: number;
  stuck: number;
  /** Top-speed multiplier when you drive it (an owned vehicle out of petrol or battered). */
  limit: number;
  /** s left reacting late to the player (it won't brake for you), and whether you were ahead last frame. */
  late: number;
  sawPlayer: boolean;
  /** Velocity before this physics step (crash speeds are judged on it; after the step they've already bounced). */
  pvx: number;
  pvz: number;
  /** s stopped for no good reason / s knocked off its lane (see STALL_AFTER / UNTANGLE_AFTER). */
  stalled: number;
  tangled: number;
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
  /** The player's own vehicle (traffic may react late to it: see LATE_CHANCE), and its velocity. */
  player?: boolean;
  vx?: number;
  vz?: number;
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
  /**
   * A vehicle and the one you're driving hit each other. closing = m/s; theirs = they ran into
   * you after you cut in (they reacted late) rather than you into them.
   */
  onCrash: (v: Vehicle, closing: number, theirs: boolean) => void = () => {};
  private readonly scene: THREE.Scene;
  private readonly fleeing: { root: THREE.Group; anim: Animator; dx: number; dz: number; t: number }[] = [];

  private readonly world: RAPIER.World;

  constructor(scene: THREE.Scene, world: RAPIER.World, npcs: Map<NpcModelId, CharacterAsset>) {
    this.scene = scene;
    this.world = world;
    this.driverModels = [...npcs.entries()].filter(([id]) => id !== 'police').map(([, a]) => a);
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
      ['taxi', 1, 2, 0.55, 0xf5f5f5],
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
      // Alwarpet / Teynampet (across the canal)
      ['bus', -1, 2, 0.3],
      ['auto', -2, 1, 0.5],
      ['car', -1, 4, 0.2, 0x455a64],
      ['scooter', -2, 3, 0.7, 0x43a047],
      ['car', 0, 0, 0.4, 0xeeeeee],
      // R.A. Puram / Adyar
      ['auto', 1, 6, 0.6],
      ['car', 2, 7, 0.3, 0x1565c0],
      ['bike', 0, 7, 0.5, 0x212121],
      ['auto', 3, 8, 0.2],
      ['bus', 1, 8, 0.6],
      // Taramani (Tidel Park)
      ['car', 2, 9, 0.3, 0xf4f4f4],
      ['auto', 1, 9, 0.6],
      ['car', 3, 9, 0.1, 0x37474f],
      // Triplicane
      ['car', 2, -1, 0.3, 0xf4f4f4],
      ['auto', 3, -1, 0.6],
      ['bus', 1, -1, 0.1],
      // Perungudi
      ['car', 2, 10, 0.5, 0xb0bec5],
      ['auto', 1, 10, 0.2],
    ];
    for (const [kind, i, j, start, colour] of fleet) this.spawn(world, kind, blockRoute(i, j), start, colour);
    // The ambient pool starts spread over the street blocks (it follows the player from then on).
    AMBIENT_FLEET.forEach(([kind, colour], n) => {
      const b = this.streetBlocks[(n * 11) % this.streetBlocks.length];
      this.ambient.push(this.spawn(world, kind, blockRoute(b.i, b.j), (n * 0.37) % 1, colour));
    });
  }

  private readonly driverModels: CharacterAsset[];
  private readonly ambient: Vehicle[] = [];
  private ambientCheck = 0;
  /** Blocks with a road on every side, away from the river: loops traffic can drive round. */
  private readonly streetBlocks = blocks().filter((b) => b.kind !== 'beach' && b.road.w && b.road.e && b.road.n && b.road.s && !(b.z0 < RIVER.z1 + 10 && b.z1 > RIVER.z0 - 10));

  /** Build one AI vehicle on `path`, `start` of the way round. */
  /**
   * A parked vehicle with nobody in it (your own, or the dealer's stock when locked), nose along
   * `heading` (radians, 0 = +z).
   */
  addParked(kind: Kind, colour: number | undefined, x: number, z: number, heading: number, locked = false) {
    const b = this.streetBlocks[0];
    const veh = this.spawn(this.world, kind, blockRoute(b.i, b.j), 0, colour, false);
    veh.mode = 'parked';
    veh.locked = locked;
    this.place(veh, x, z, heading);
    return veh;
  }

  /** Move a vehicle (not while someone drives it) to (x, z) facing `heading`. */
  place(veh: Vehicle, x: number, z: number, heading: number) {
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), heading);
    veh.body.setTranslation({ x, y: 0.05, z }, true);
    veh.body.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w }, true);
    veh.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    veh.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    veh.prevPos.set(x, 0.05, z);
    veh.currPos.set(x, 0.05, z);
    veh.prevRot.copy(rot);
    veh.currRot.copy(rot);
  }

  private spawn(world: RAPIER.World, kind: Kind, path: Path, start: number, colour?: number, withDriver = true) {
    const group = new THREE.Group();
    let wheelMeshes: THREE.Object3D[];
    let wheelR = 0.21;
    let lights: THREE.MeshStandardMaterial[] = [];
    if (kind === 'auto' || kind === 'shareauto') {
      // A share auto is the big Ape-style one: the same auto, scaled up.
      const holder = kind === 'shareauto' ? new THREE.Group() : group;
      if (holder !== group) {
        holder.scale.set(1.2, 1.15, 1.45);
        group.add(holder);
      }
      const m = buildAutoModel(holder, randomPlate('commercial'));
      wheelMeshes = m.wheels;
      if (holder !== group) wheelR *= 1.15;
      lights = [m.headlight, m.tail];
    } else {
      const c = colour ?? 0xcccccc;
      const m = kind === 'car' ? carModel(group, c) : kind === 'bus' ? busModel(group)
        : kind === 'scooter' ? scooterModel(group, c) : kind === 'bike' ? bikeModel(group, c)
        : kind === 'taxi' ? taxiModel(group, c) : kind === 'van' ? vanModel(group, c)
        : kind === 'tempo' ? tempoModel(group, c) : kind === 'suv' ? suvModel(group, c)
        : kind === 'hatch' ? hatchModel(group, c) : kind === 'tanker' ? tankerModel(group)
        : kind === 'delivery' ? deliveryModel(group) : lorryModel(group, c);
      wheelMeshes = m.wheels;
      wheelR = m.wheelR;
      lights = m.lights;
    }
    this.scene.add(group);
    const driver = withDriver ? seatDriver(this.driverModels[Math.floor(Math.random() * this.driverModels.length)], group, RIDER_POSE[kind]) : null;
    const sp = SPEC[kind];
    // Dynamic body with real mass, kept upright: it can be shoved; it drives by velocity control.
    const s0 = start * path.length;
    path.at(s0, this.pos, this.dir);
    const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(this.dir.x, this.dir.z));
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(this.pos.x, 0.02, this.pos.z)
        .setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w })
        .enabledRotations(false, true, false)
        .enabledTranslations(true, false, true) // height comes from the ground under it (see step)
        .setLinearDamping(0.6)
        .setAngularDamping(2)
        .setCanSleep(false),
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.cuboid(sp.width / 2, (sp.height - CLEARANCE) / 2, sp.length / 2).setTranslation(0, CLEARANCE + (sp.height - CLEARANCE) / 2, 0).setMass(sp.mass).setFriction(0.3),
      body,
    );
    const veh: Vehicle = {
      kind, mode: 'ai', driver, lights, ctl: { throttle: 0, steer: 0, brake: false },
      group, wheels: wheelMeshes, wheelR, body, path, s: s0, v: sp.speed, blockedFor: 0, honkIn: 0,
      collider, target: sp.speed, knocked: 0, id: this.vehicles.length, colour, hx: this.dir.x, hz: this.dir.z, blocker: null, waitVeh: 0, pushOn: 0, stuck: 0, limit: 1, late: 0, sawPlayer: false, pvx: 0, pvz: 0, stalled: 0, tangled: 0,
      prevPos: this.pos.clone(), currPos: this.pos.clone(), prevRot: rot.clone(), currRot: rot.clone(),
    };
    this.vehicles.push(veh);
    return veh;
  }

  /**
   * Every half second: any pool vehicle that has fallen far behind is moved onto a block loop
   * round the player (out of the camera's view when close), so every road has traffic.
   * view = the camera's forward on the ground.
   */
  recycle(dt: number, player: THREE.Vector3, view: THREE.Vector3) {
    this.ambientCheck -= dt;
    if (this.ambientCheck > 0) return;
    this.ambientCheck = 0.5;
    for (const veh of this.ambient) {
      if (veh.mode !== 'ai' || !veh.driver) continue; // stolen / abandoned: leave it where it is
      if (Math.hypot(veh.currPos.x - player.x, veh.currPos.z - player.z) < AMBIENT_RECYCLE) continue;
      for (let tries = 0; tries < 10; tries++) {
        const b = this.streetBlocks[Math.floor(Math.random() * this.streetBlocks.length)];
        if (Math.hypot((b.x0 + b.x1) / 2 - player.x, (b.z0 + b.z1) / 2 - player.z) > AMBIENT_RING[1] + 40) continue;
        const path = blockRoute(b.i, b.j);
        const s0 = Math.random() * path.length;
        path.at(s0, this.pos, this.dir);
        const d = Math.hypot(this.pos.x - player.x, this.pos.z - player.z);
        if (d < AMBIENT_RING[0] || d > AMBIENT_RING[1]) continue;
        if (d < AMBIENT_HIDDEN_WITHIN && ((this.pos.x - player.x) * view.x + (this.pos.z - player.z) * view.z) / d > 0.2) continue;
        if (this.vehicles.some((o) => o !== veh && Math.hypot(o.currPos.x - this.pos.x, o.currPos.z - this.pos.z) < AMBIENT_GAP)) continue;
        const rot = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(this.dir.x, this.dir.z));
        veh.path = path;
        veh.s = s0;
        veh.knocked = 0;
        veh.v = 0;
        veh.body.setTranslation({ x: this.pos.x, y: 0.02, z: this.pos.z }, true);
        veh.body.setRotation({ x: rot.x, y: rot.y, z: rot.z, w: rot.w }, true);
        veh.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
        veh.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        veh.prevPos.copy(this.pos);
        veh.currPos.copy(this.pos);
        veh.prevRot.copy(rot);
        veh.currRot.copy(rot);
        break;
      }
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
      let target = turning ? Math.min(CORNER_SPEED, sp.speed * AI_SPEED) : sp.speed * AI_SPEED;

      // Stop for anything in the lane ahead.
      const reach = sp.length / 2 + 3 + Math.max(0, veh.v) * 1.2;
      veh.hx = this.dir.x;
      veh.hz = this.dir.z;
      let honkable = false;
      let blocked = false;
      let nearest = Infinity; // closest thing of yours in the lane (m)
      const inLane = (x: number, z: number) => {
        const rx = x - p.x;
        const rz = z - p.z;
        const along = rx * this.dir.x + rz * this.dir.z;
        const side = Math.abs(rx * this.dir.z - rz * this.dir.x);
        return along > 0 && along < reach && side < sp.width / 2 + 0.6 ? along : -1;
      };
      veh.late = Math.max(0, veh.late - dt);
      let mine = false; // the player (or their vehicle) is in the lane ahead
      let cutIn = 0; // how fast it's coming sideways into this lane (m/s)
      for (const o of obstacles) {
        const along = inLane(o.x, o.z);
        if (along < 0) continue;
        if (o.player) {
          mine = true;
          nearest = Math.min(nearest, along);
          cutIn = Math.max(cutIn, Math.abs((o.vx ?? 0) * this.dir.z - (o.vz ?? 0) * this.dir.x));
          if (veh.late > 0) continue; // reacting late: doesn't brake for you
        }
        blocked = true;
        honkable ||= o.honk;
      }
      // Other vehicles. Gridlock rules: never wait for one coming the other way (it's in its own
      // lane), two waiting for each other -> the lower id goes first, and after PATIENCE s in a
      // queue a vehicle noses through (physics shoves whatever is really there).
      veh.pushOn = Math.max(0, veh.pushOn - dt);
      let blocker: Vehicle | null = null;
      {
        for (const other of this.vehicles) {
          if (other === veh) continue;
          if (veh.pushOn > 0 && other.mode !== 'player') continue; // nosing through a queue, but never through you
          const along = inLane(other.currPos.x, other.currPos.z);
          if (along < 0) continue;
          if (other.mode === 'player') {
            mine = true;
            nearest = Math.min(nearest, along);
            const ov = other.body.linvel();
            cutIn = Math.max(cutIn, Math.abs(ov.x * this.dir.z - ov.z * this.dir.x));
            if (veh.late > 0) continue;
          }
          if (other.mode === 'ai' && other.hx * this.dir.x + other.hz * this.dir.z < -0.3) continue;
          if (other.blocker === veh && veh.id < other.id) continue;
          blocker = other;
          break;
        }
      }
      veh.blocker = blocker;
      // You appeared suddenly and close in front (cut in / braked in their lane): now and then they're late.
      if (mine && !veh.sawPlayer && !turning && cutIn > CUT_IN_SPEED && veh.v > LATE_MIN_SPEED && nearest < reach * 0.55 && Math.random() < LATE_CHANCE) {
        veh.late = LATE_SECONDS;
        if (blocker?.mode === 'player') blocker = veh.blocker = null;
        blocked = obstacles.some((o) => !o.player && inLane(o.x, o.z) >= 0);
      }
      veh.sawPlayer = mine;
      veh.waitVeh = blocker && veh.v < 0.5 ? veh.waitVeh + dt : 0;
      if (veh.waitVeh > PATIENCE) {
        veh.waitVeh = 0;
        veh.pushOn = PUSH_ON;
      }
      if (blocked || blocker) target = 0;
      // Traffic lights: stop at the line on red, and on amber unless too close to stop.
      let atSignal = false;
      if (this.signals) {
        const fx = p.x + this.dir.x * sp.length / 2;
        const fz = p.z + this.dir.z * sp.length / 2;
        const sig = this.signals(fx, fz, this.dir.x, this.dir.z, SIGNAL_LOOK);
        if (sig && sig.light !== 'green' && !(sig.light === 'amber' && sig.distToStop < 3)) {
          target = Math.min(target, Math.max(0, (sig.distToStop - 0.8) * 0.9));
          atSignal = true;
        }
      }
      veh.target = target * this.slowAt(p.x, p.z);
      // Wedged (wants to go, isn't moving): put it back on its lane a little further on.
      veh.stuck = veh.target > 1 && veh.v < 0.3 && veh.knocked <= 0 ? veh.stuck + dt : 0;
      if (veh.stuck > STUCK_AFTER) {
        veh.stuck = 0;
        veh.s += 3;
        veh.path.at(veh.s, this.pos, this.dir);
        veh.body.setTranslation({ x: this.pos.x, y: 0.02, z: this.pos.z }, true);
        veh.body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(this.dir.x, this.dir.z)), true);
        veh.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      }
      // Jams and pile-ups: off its lane / turned sideways, or stopped with no red light and nobody of yours in the way.
      veh.path.at(veh.s, this.pos, this.dir);
      const offLane = Math.hypot(p.x - this.pos.x, p.z - this.pos.z) > 2 || veh.hx * Math.sin(this.headingOf(veh)) + veh.hz * Math.cos(this.headingOf(veh)) < 0.5;
      veh.tangled = offLane && veh.knocked <= 0 ? veh.tangled + dt : 0;
      veh.stalled = veh.v < 0.3 && !atSignal && !mine ? veh.stalled + dt : 0;
      if (veh.tangled > UNTANGLE_AFTER || veh.stalled > STALL_AFTER) this.relocate(veh, obstacles);

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
      const pv = veh.body.linvel();
      veh.pvx = pv.x;
      veh.pvz = pv.z;
      if (veh.mode === 'parked') continue; // abandoned: just friction and damping
      if (veh.mode === 'player') {
        this.drivePlayer(veh, dt);
        this.followGround(veh, dt);
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
  afterStep(world: RAPIER.World, pushers: RAPIER.Collider[], yours: RAPIER.Collider | null = null, yoursVel: { x: number; z: number } | null = null) {
    const limp = new Set(this.vehicles.filter((v) => v.knocked > 0).map((v) => v.collider));
    for (const veh of this.vehicles) {
      world.contactPairsWith(veh.collider, (other) => {
        const byPlayer = pushers.includes(other);
        if (!byPlayer && !limp.has(other)) return;
        if (byPlayer && veh.knocked <= 0) {
          this.honk(veh.kind);
          // Vehicle against vehicle: how hard, and whose fault.
          if (other === yours && veh.mode !== 'player') {
            const b = yoursVel ?? other.parent()!.linvel();
            const closing = Math.hypot(veh.pvx - b.x, veh.pvz - b.z);
            const yoursMoving = Math.hypot(b.x, b.z) > 1.5;
            if (closing > CRASH_SPEED && (veh.late > 0 || yoursMoving)) { // stopped and nobody cut in: not a crash of yours
              const theirs = veh.late > 0;
              // A hard knock shoves the lighter one more (on top of the contact itself).
              const t = veh.body.translation();
              const o = other.parent()!.translation();
              const d = Math.hypot(t.x - o.x, t.z - o.z) || 1;
              const push = theirs ? 0 : SPEC[veh.kind].mass * Math.min(closing, 12) * 0.25;
              veh.body.applyImpulse({ x: ((t.x - o.x) / d) * push, y: 0, z: ((t.z - o.z) / d) * push }, true);
              this.onCrash(veh, closing, theirs);
            }
          }
          veh.late = 0;
        }
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
  private readonly dists: number[] = [];
  private readonly order: number[] = [];
  private readonly rank: number[] = [];

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
    // Only the nearest MAX_DRAWN vehicles are drawn: each is a dozen parts (draw calls).
    if (eye) {
      this.vehicles.forEach((veh, i) => {
        this.dists[i] = veh.mode === 'player' ? -1 : veh.currPos.distanceTo(eye);
        this.order[i] = i;
      });
      this.order.length = this.vehicles.length;
      this.order.sort((a, b) => this.dists[a] - this.dists[b]);
      this.order.forEach((idx, rank) => (this.rank[idx] = rank));
    }
    for (const [i, veh] of this.vehicles.entries()) {
      veh.group.position.lerpVectors(veh.prevPos, veh.currPos, alpha);
      veh.group.quaternion.slerpQuaternions(veh.prevRot, veh.currRot, alpha);
      if (eye) {
        const d = veh.group.position.distanceTo(eye);
        veh.group.visible = (d < DRAW_DIST && this.rank[i] < MAX_DRAWN) || veh.mode === 'player';
        veh.group.matrixWorldAutoUpdate = veh.group.visible; // hidden: skip its parts' (and driver's bones') matrices
        const near = d < DETAIL_DIST || veh.mode === 'player';
        for (const w of veh.wheels) w.visible = near;
        if (veh.driver) {
          veh.driver.visible = near;
          veh.driver.matrixWorldAutoUpdate = near;
        }
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
      if (d < 1.8 && d < bestD && !v.locked) {
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

  /** Put a jammed vehicle back on its lane at the first free gap a little ahead. */
  private relocate(veh: Vehicle, obstacles: Obstacle[]) {
    veh.tangled = veh.stalled = veh.stuck = veh.waitVeh = 0;
    veh.blocker = null;
    const s0 = veh.path.nearest(veh.currPos.x, veh.currPos.z);
    for (let k = 0; k < 12; k++) {
      const s = s0 + 6 + k * 4;
      veh.path.at(s, this.pos, this.dir);
      const clear = this.vehicles.every((o) => o === veh || o.currPos.distanceTo(this.pos) > 5) && obstacles.every((o) => Math.hypot(o.x - this.pos.x, o.z - this.pos.z) > 5);
      if (!clear && k < 11) continue;
      veh.s = s;
      veh.body.setTranslation({ x: this.pos.x, y: 0.02, z: this.pos.z }, true);
      veh.body.setRotation(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(this.dir.x, this.dir.z)), true);
      veh.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      veh.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
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

  /** The vehicle you drive rides up onto pavements / yards and back down (its box clears the kerb). */
  private readonly groundRay = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });
  private followGround(v: Vehicle, dt: number) {
    const t = v.body.translation();
    let top = 0;
    // The highest ground under the nose, middle and tail (so the front climbs the kerb first).
    const f = this.dir.set(0, 0, 1).applyQuaternion(v.group.quaternion);
    for (const k of [-0.4, 0, 0.4]) {
      this.groundRay.origin = { x: t.x + f.x * SPEC[v.kind].length * k, y: t.y + 0.6, z: t.z + f.z * SPEC[v.kind].length * k };
      const hit = this.world.castRay(this.groundRay, 0.9, true, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS);
      if (hit) top = Math.max(top, t.y + 0.6 - hit.timeOfImpact);
    }
    if (top > 0.45) top = t.y; // a wall, not a step: stay put (the body box stops you)
    v.body.setTranslation({ x: t.x, y: t.y + (top - t.y) * Math.min(1, dt * 12), z: t.z }, true);
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
    else if (throttle > 0) speed = speed < -0.3 ? speed + h.accel * 2 * dt : Math.min(h.top * PLAYER_TOP * v.limit * this.slowAt(v.currPos.x, v.currPos.z), speed + h.accel * PLAYER_ACCEL * dt);
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
function seatDriver(asset: CharacterAsset, parent: THREE.Group, pose: RiderPose) {
  const body = cloneSkinned(asset.scene);
  const root = new THREE.Group();
  root.add(body);
  root.scale.setScalar(0.95);
  parent.add(root);
  const anim = new Animator(body, asset.clips);
  anim.play('drive', { fade: 0 });
  anim.update(0.01);
  poseRider(body, root, parent, pose); // hands on the bars / wheel, feet on the pegs / pedals
  body.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = false;
  });
  root.userData.anim = anim;
  return root;
}
