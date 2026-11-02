import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Animator } from '../characters/animator';
import { CHARACTER_HEIGHT, NPC_MODELS, type CharacterAsset, type NpcModelId } from '../characters/catalog';
import { AutoRickshaw, BENCH } from '../vehicles/auto';
import { SIDEWALK_HEIGHT } from '../world/layout';
import { PAID_LINES, PASSENGER_NAMES, PICKUP_LINES, RIDE_LINES, STOPS, fare, payment, stopPoint, type Stop } from './data';

const NOTICE_RADIUS = 18; // passenger waves when the auto comes this close
const PICKUP_RADIUS = 5.5; // stop this close to the passenger to pick them up
const DROP_RADIUS = 7; // stop this close to the destination to drop them
const STOP_SPEED = 1.5; // m/s: "stopped" for pickups and drop-offs
const MIN_TRIP = 50; // m between pickup and destination
const WALK_SPEED = 1.4;
const SIT_SECONDS = 2.1;
const SWIVEL_SECONDS = 0.5;
const HOP_OUT_SECONDS = 0.6;
const LEAVE_SECONDS = 3.5;
const CHATTER_EVERY = 14; // s between passenger remarks while riding

type Phase = 'off' | 'idle' | 'waiting' | 'boarding' | 'seating' | 'riding' | 'alighting';

/** A ride request on the phone. */
export interface Order {
  id: number;
  name: string;
  from: Stop;
  to: Stop;
  fare: number; // meter estimate
  expires: number; // seconds left
}

const OPEN_ORDERS = 3;
const ORDER_LIFETIME = [70, 140];

const rand = <T>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
const smooth = (t: number) => {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/** Glowing beam + ground ring marking a pickup or drop-off. */
class Marker {
  readonly group = new THREE.Group();
  private readonly mat: THREE.MeshBasicMaterial;
  private t = 0;

  constructor(scene: THREE.Scene, color: number) {
    this.mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 30, 16, 1, true).translate(0, 15, 0), this.mat);
    const ring = new THREE.Mesh(new THREE.RingGeometry(1.6, 2.2, 32).rotateX(-Math.PI / 2).translate(0, 0.2, 0), this.mat);
    this.group.add(beam, ring);
    this.group.visible = false;
    scene.add(this.group);
  }

  show(p: { x: number; z: number }) {
    this.group.position.set(p.x, 0, p.z);
    this.group.visible = true;
  }

  hide() {
    this.group.visible = false;
  }

  update(dt: number) {
    this.t += dt;
    this.mat.opacity = 0.25 + 0.12 * Math.sin(this.t * 3);
  }
}

/**
 * The taxi loop: a passenger waits at a named stop, you pull up beside them, they climb onto
 * the back bench, you drive them to their destination and get paid (plus a tip if quick).
 * Then the next passenger appears somewhere else.
 */
export class TaxiJobs {
  phase: Phase = 'off';
  /** Completed rides. */
  rides = 0;
  onSay: (name: string, line: string) => void = () => {};
  onPaid: (fare: number, tip: number) => void = () => {};
  /** A new ride request arrived on the phone. */
  onNewOrder: (order: Order) => void = () => {};
  /** Open ride requests (shown on the phone). */
  readonly orders: Order[] = [];
  private nextId = 1;

  private readonly scene: THREE.Scene;
  private readonly assets: Map<NpcModelId, CharacterAsset>;
  private readonly auto: AutoRickshaw;
  private readonly pickupMarker: Marker;
  private readonly dropMarker: Marker;
  private from!: Stop;
  private to!: Stop;
  private name = '';
  private root: THREE.Group | null = null;
  private animator: Animator | null = null;
  private hips: THREE.Object3D | null = null;
  private side = 1;
  private t = 0;
  private rideTime = 0;
  private chatter = 0;
  private waved = false;
  private readonly hipStart = new THREE.Vector3();
  private readonly hipTarget = new THREE.Vector3();
  private readonly tmp = new THREE.Vector3();
  private readonly leaveFrom = new THREE.Vector3();

  constructor(scene: THREE.Scene, assets: Map<NpcModelId, CharacterAsset>, auto: AutoRickshaw) {
    this.scene = scene;
    this.assets = assets;
    this.auto = auto;
    this.pickupMarker = new Marker(scene, 0xffd21f);
    this.dropMarker = new Marker(scene, 0x35e06b);
  }

  /** Where to go next (for the minimap): pickup while waiting, destination while riding. */
  get target(): { x: number; z: number; kind: 'pickup' | 'drop' } | null {
    if (this.phase === 'waiting' || this.phase === 'boarding') return { ...stopPoint(this.from, 'sidewalk'), kind: 'pickup' };
    if (this.phase === 'seating' || this.phase === 'riding') return { ...stopPoint(this.to, 'kerb'), kind: 'drop' };
    return null;
  }

  /** Mission line for the HUD. */
  get mission() {
    switch (this.phase) {
      case 'waiting':
      case 'boarding':
        return `Pick up ${this.name} at ${this.from.name} (yellow marker)`;
      case 'seating':
      case 'riding':
        return `Drop ${this.name} at ${this.to.name} (green marker)`;
      default:
        return 'Open your phone (P) and accept a ride order';
    }
  }

  /** Turn the ride app on (first time in the auto). */
  start() {
    if (this.phase !== 'off') return;
    this.phase = 'idle';
    while (this.orders.length < OPEN_ORDERS) this.addOrder(false);
  }

  /** True while a ride is in progress (can't take another order). */
  get busy() {
    return this.phase !== 'off' && this.phase !== 'idle';
  }

  /** Accept a ride request: its passenger starts waiting at the pickup. */
  accept(id: number) {
    const i = this.orders.findIndex((o) => o.id === id);
    if (i < 0 || this.busy || this.phase === 'off') return false;
    const [o] = this.orders.splice(i, 1);
    this.from = o.from;
    this.to = o.to;
    this.name = o.name;
    this.spawnPassenger();
    this.addOrder(true);
    return true;
  }

  update(dt: number, driving: boolean) {
    if (this.phase === 'off') return;
    this.t += dt;
    // Orders expire and get replaced by new ones.
    for (let i = this.orders.length - 1; i >= 0; i--) {
      this.orders[i].expires -= dt;
      if (this.orders[i].expires <= 0) this.orders.splice(i, 1);
    }
    while (this.orders.length < OPEN_ORDERS) this.addOrder(true);
    this.pickupMarker.update(dt);
    this.dropMarker.update(dt);
    this.animator?.update(dt);
    const speed = Math.abs(this.auto.speed);
    const stopped = driving && speed < STOP_SPEED;
    const autoPos = this.auto.group.position;

    switch (this.phase) {
      case 'idle':
        return;

      case 'waiting': {
        const d = this.root!.position.distanceTo(this.tmp.set(autoPos.x, this.root!.position.y, autoPos.z));
        if (!this.waved && d < NOTICE_RADIUS) {
          this.waved = true;
          this.animator!.play('wave', { once: true, then: 'idle' });
        }
        this.faceTowards(autoPos, dt);
        if (stopped && d < PICKUP_RADIUS) {
          this.side = this.auto.group.worldToLocal(this.root!.position.clone()).x >= 0 ? 1 : -1;
          this.onSay(this.name, rand(PICKUP_LINES).replace('{place}', this.to.name));
          this.animator!.play('walk');
          this.go('boarding');
        }
        return;
      }

      case 'boarding': {
        if (speed > 2) {
          // Driver pulled away: wait for them to come back.
          this.animator!.play('idle');
          this.go('waiting');
          return;
        }
        const target = this.auto.group.localToWorld(this.tmp.set(this.side * 1.05, 0, BENCH.z));
        const p = this.root!.position;
        const dx = target.x - p.x;
        const dz = target.z - p.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.25 && this.t < 6) {
          const step = Math.min(d, WALK_SPEED * dt);
          p.x += (dx / d) * step;
          p.z += (dz / d) * step;
          p.y += (target.y - p.y) * Math.min(1, dt * 4);
          this.root!.rotation.y = Math.atan2(dx, dz);
          return;
        }
        // Climb in: hand the passenger to the auto, sit down facing out, then swivel forward.
        this.auto.group.attach(this.root!);
        this.root!.updateMatrixWorld(true);
        this.auto.group.worldToLocal(this.hips!.getWorldPosition(this.hipStart));
        this.animator!.play('sit_down', { once: true, fade: 0.25 });
        this.pickupMarker.hide();
        this.dropMarker.show(stopPoint(this.to, 'kerb'));
        this.go('seating');
        return;
      }

      case 'seating': {
        const k = this.t / SIT_SECONDS;
        this.hipTarget.copy(this.hipStart).lerp(BENCH, smooth(k));
        const swivel = smooth((this.t - SIT_SECONDS) / SWIVEL_SECONDS);
        this.pin((this.side * Math.PI / 2) * (1 - swivel));
        if (this.t < SIT_SECONDS + SWIVEL_SECONDS) return;
        this.rideTime = 0;
        this.chatter = CHATTER_EVERY * 0.5;
        this.go('riding');
        return;
      }

      case 'riding': {
        this.hipTarget.copy(BENCH);
        this.pin(0);
        this.rideTime += dt;
        this.chatter -= dt;
        if (this.chatter <= 0) {
          this.chatter = CHATTER_EVERY;
          this.onSay(this.name, rand(RIDE_LINES));
        }
        const drop = stopPoint(this.to, 'kerb');
        if (stopped && Math.hypot(autoPos.x - drop.x, autoPos.z - drop.z) < DROP_RADIUS) {
          const a = stopPoint(this.from, 'kerb');
          const { base, tip } = payment(Math.hypot(drop.x - a.x, drop.z - a.z), this.rideTime);
          this.rides++;
          this.onPaid(base, tip);
          this.onSay(this.name, rand(PAID_LINES).replace('{fare}', String(base + tip)));
          this.dropMarker.hide();
          this.scene.attach(this.root!);
          this.root!.rotation.set(0, this.root!.rotation.y, 0);
          this.leaveFrom.copy(this.root!.position);
          this.animator!.play('idle', { fade: 0.3 });
          this.go('alighting');
        }
        return;
      }

      case 'alighting': {
        const root = this.root!;
        if (this.t < HOP_OUT_SECONDS) {
          // Hop off the bench to the ground beside the auto.
          const out = this.auto.group.localToWorld(this.tmp.set(this.side * 1.3, 0, BENCH.z));
          root.position.lerpVectors(this.leaveFrom, out, smooth(this.t / HOP_OUT_SECONDS));
          return;
        }
        if (this.animator!.currentName !== 'walk') this.animator!.play('walk');
        const goal = stopPoint(this.to, 'sidewalk');
        const dx = goal.x - root.position.x;
        const dz = goal.z - root.position.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.3) {
          root.position.x += (dx / d) * WALK_SPEED * dt;
          root.position.z += (dz / d) * WALK_SPEED * dt;
          root.position.y = d < 2.6 ? SIDEWALK_HEIGHT : 0;
          root.rotation.y = Math.atan2(dx, dz);
        }
        if (this.t < HOP_OUT_SECONDS + LEAVE_SECONDS) return;
        this.despawn();
        this.go('idle');
        return;
      }
    }
  }

  /** New ride request between two stops at least MIN_TRIP apart. */
  private addOrder(notify: boolean) {
    const from = rand(STOPS);
    const fp = stopPoint(from, 'kerb');
    const to = rand(STOPS.filter((s) => {
      const p = stopPoint(s, 'kerb');
      return s !== from && Math.hypot(p.x - fp.x, p.z - fp.z) > MIN_TRIP;
    }));
    const tp = stopPoint(to, 'kerb');
    const order: Order = {
      id: this.nextId++,
      name: rand(PASSENGER_NAMES),
      from,
      to,
      fare: fare(Math.hypot(tp.x - fp.x, tp.z - fp.z)),
      expires: ORDER_LIFETIME[0] + Math.random() * (ORDER_LIFETIME[1] - ORDER_LIFETIME[0]),
    };
    this.orders.push(order);
    if (notify) this.onNewOrder(order);
  }

  /** The accepted order's passenger appears at the pickup. */
  private spawnPassenger() {

    const id = rand(Object.keys(NPC_MODELS) as NpcModelId[]);
    const asset = this.assets.get(id)!;
    const body = cloneSkinned(asset.scene);
    const root = new THREE.Group();
    root.add(body);
    root.scale.setScalar((1.55 + Math.random() * 0.2) / CHARACTER_HEIGHT);
    const sp = stopPoint(this.from, 'sidewalk');
    root.position.set(sp.x, SIDEWALK_HEIGHT, sp.z);
    this.scene.add(root);
    this.root = root;
    this.hips = body.getObjectByName('Hips')!;
    this.animator = new Animator(body, asset.clips);
    this.animator.play('idle', { fade: 0 });
    this.waved = false;
    this.pickupMarker.show(sp);
    this.go('waiting');
  }

  private despawn() {
    if (this.root) this.root.removeFromParent();
    this.root = null;
    this.animator = null;
    this.hips = null;
  }

  private go(phase: Phase) {
    this.phase = phase;
    this.t = 0;
  }

  private faceTowards(p: THREE.Vector3, dt: number) {
    const r = this.root!;
    const yaw = Math.atan2(p.x - r.position.x, p.z - r.position.z);
    const delta = Math.atan2(Math.sin(yaw - r.rotation.y), Math.cos(yaw - r.rotation.y));
    r.rotation.y += delta * (1 - Math.exp(-4 * dt));
  }

  /** Seat the passenger: turn to `yaw` (auto space) and move so the hips sit on hipTarget. */
  private pin(yaw: number) {
    const r = this.root!;
    r.rotation.set(0, yaw, 0);
    this.auto.group.updateMatrixWorld();
    r.updateMatrixWorld(true);
    const hipsLocal = this.auto.group.worldToLocal(this.hips!.getWorldPosition(this.tmp));
    r.position.add(hipsLocal.subVectors(this.hipTarget, hipsLocal));
  }
}
