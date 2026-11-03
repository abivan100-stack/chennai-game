import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Animator } from '../characters/animator';
import { CHARACTER_HEIGHT, NPC_MODELS, type CharacterAsset, type NpcModelId } from '../characters/catalog';
import { AutoRickshaw, BENCH } from '../vehicles/auto';
import { SIDEWALK_HEIGHT } from '../world/layout';
import {
  HOSPITAL, ORDER_WEIGHTS, PAID_LINES, PARCEL_COLD, PARCEL_FROM, PARCEL_HOT, PASSENGER_NAMES, PAY, PICKUP_LINES, RIDE_LINES, STOPS,
  URGENT_LATE, URGENT_ON_TIME, URGENT_PICKUP, VIP_BUMP, VIP_NAMES, VIP_PICKUP, VIP_ROUGH, VIP_SMOOTH,
  fare, payment, stopPoint, timeLimit, type OrderKind, type Stop,
} from './data';
import { VIA_WAIT, judge, type StoryMission } from './storyMissions';

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
const BUMP_DECEL = 3.5; // m/s lost in one frame = a bump the passenger feels

type Phase = 'off' | 'idle' | 'waiting' | 'boarding' | 'seating' | 'riding' | 'alighting';

/** A ride request on the phone. */
export interface Order {
  id: number;
  name: string;
  from: Stop;
  to: Stop;
  fare: number; // what it pays (best case)
  expires: number; // seconds left
  kind: OrderKind;
  /** Seconds allowed from pickup to drop (urgent / delivery), or null. */
  limit: number | null;
  /** A story mission (kind 'story'). */
  story?: StoryMission;
}

const OPEN_ORDERS = 3;
const ORDER_LIFETIME = [70, 140];

const rand = <T>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];
const smooth = (t: number) => {
  const c = THREE.MathUtils.clamp(t, 0, 1);
  return c * c * (3 - 2 * c);
};

/** Glowing beam + ground ring marking a pickup or drop-off. */
export class Marker {
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
  /** Fare multiplier (rain surcharge), set by the game each frame. */
  fareBoost = 1;
  /** m/s lost in one frame that a passenger feels as a bump (seat covers raise it). */
  bumpDecel = BUMP_DECEL;
  /** A new ride request arrived on the phone. */
  onNewOrder: (order: Order) => void = () => {};
  /** A story mission ended (passed or not). */
  onStory: (id: string, passed: boolean) => void = () => {};
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
  private kind: OrderKind = 'ride';
  private limit: number | null = null;
  private bumps = 0;
  private lastSpeed = 0;
  private parcel: THREE.Mesh | null = null;
  // Story mission in progress.
  private story: StoryMission | null = null;
  private via: Stop | null = null;
  private viaShown = false;
  private viaDone = false;
  private viaHold = 0;
  private reds = 0;
  private readonly garland: THREE.InstancedMesh;
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
    // Marigold garland across the front of the auto (wedding rides).
    const N = 26;
    this.garland = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.055, 0), new THREE.MeshStandardMaterial({ roughness: 0.8 }), N);
    const m = new THREE.Matrix4();
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1) * 2 - 1; // -1..1 across
      m.setPosition(t * 0.62, 1.62 - 0.32 * (1 - t * t), 1.3);
      this.garland.setMatrixAt(i, m);
      this.garland.setColorAt(i, new THREE.Color(i % 3 === 2 ? 0xffd54f : 0xff8f00));
    }
    this.garland.visible = false;
    auto.group.add(this.garland);
  }

  /** A story order is waiting on the phone or being driven. */
  get storyOpen() {
    return this.story !== null || this.orders.some((o) => o.kind === 'story');
  }

  /** Put a story mission on the phone (it doesn't expire). */
  addStory(m: StoryMission) {
    const from = STOPS.find((s) => s.name === m.from)!;
    const to = STOPS.find((s) => s.name === m.to)!;
    const via = m.via ? STOPS.find((s) => s.name === m.via)! : null;
    const p = (st: Stop) => stopPoint(st, 'kerb');
    const dist = (a: Stop, b: Stop) => Math.hypot(p(a).x - p(b).x, p(a).z - p(b).z);
    const metres = via ? dist(from, via) + dist(via, to) : dist(from, to);
    const order: Order = {
      id: this.nextId++,
      name: `📖 ${m.title}: ${m.passenger}`,
      from,
      to,
      fare: m.reward,
      expires: Infinity,
      kind: 'story',
      limit: m.tight ? Math.round(timeLimit(metres) * m.tight + (via ? VIA_WAIT + 6 : 0)) : null,
      story: m,
    };
    this.orders.unshift(order);
    this.onNewOrder(order);
  }

  /** The driver jumped a red light (main.ts fines it): story passengers notice. */
  redLight() {
    if (!this.story || this.phase !== 'riding') return;
    this.reds++;
    if (this.story.lines.red) this.onSay(this.name, this.story.lines.red);
  }

  /** Where to go next (for the minimap): pickup while waiting, destination while riding. */
  get target(): { x: number; z: number; kind: 'pickup' | 'drop' } | null {
    if (this.phase === 'waiting' || this.phase === 'boarding') return { ...stopPoint(this.from, 'sidewalk'), kind: 'pickup' };
    if (this.phase === 'riding' && this.via && this.viaShown && !this.viaDone) return { ...stopPoint(this.via, 'kerb'), kind: 'drop' };
    if (this.phase === 'seating' || this.phase === 'riding') return { ...stopPoint(this.to, 'kerb'), kind: 'drop' };
    return null;
  }

  /** Mission line for the HUD. */
  get mission() {
    switch (this.phase) {
      case 'waiting':
      case 'boarding':
        return this.kind === 'delivery' ? `Collect the parcel at ${this.from.name} (yellow marker)` : `Pick up ${this.name} at ${this.from.name} (yellow marker)`;
      case 'seating':
      case 'riding': {
        const clock = this.limit !== null && this.phase === 'riding' ? ` ⏱ ${Math.max(0, Math.ceil(this.limit - this.rideTime))}s` : '';
        if (this.story && this.via && this.viaShown && !this.viaDone) return `📖 Detour: stop at ${this.via.name} and wait${clock}`;
        const rules = this.story ? `${this.story.maxBumps !== undefined ? ' · no bumps' : ''}${this.story.maxReds !== undefined ? ' · no red lights' : ''}` : '';
        const what = this.story ? `📖 ${this.story.title}: drop ${this.name}` : this.kind === 'delivery' ? 'Deliver the parcel' : `Drop ${this.name}`;
        return `${what} at ${this.to.name} (green marker)${clock}${rules}`;
      }
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
    this.kind = o.kind;
    this.limit = o.limit;
    this.bumps = 0;
    this.story = o.story ?? null;
    this.via = this.story?.via ? STOPS.find((s) => s.name === this.story!.via)! : null;
    this.viaShown = this.viaDone = false;
    this.viaHold = 0;
    this.reds = 0;
    if (this.story) this.name = this.story.passenger;
    this.garland.visible = !!this.story?.garland;
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
    // A sudden loss of speed = the passenger got thrown about (VIPs mind).
    if (this.phase === 'riding' && this.lastSpeed - speed > this.bumpDecel) {
      this.bumps++;
      if (this.kind === 'vip') this.onSay(this.name, rand(VIP_BUMP));
      if (this.story?.lines.bump) this.onSay(this.name, rand(this.story.lines.bump));
    }
    this.lastSpeed = speed;
    const autoPos = this.auto.group.position;

    switch (this.phase) {
      case 'idle':
        return;

      case 'waiting': {
        if (this.kind === 'delivery') {
          const pp = this.parcel!.position;
          if (!stopped || Math.hypot(autoPos.x - pp.x, autoPos.z - pp.z) > PICKUP_RADIUS) return;
          // Parcel goes on the back bench; straight off to the customer.
          this.auto.group.attach(this.parcel!);
          this.parcel!.position.set(0, BENCH.y - 0.25, BENCH.z);
          this.pickupMarker.hide();
          this.dropMarker.show(stopPoint(this.to, 'kerb'));
          this.onSay(this.from.name, 'Parcel ready! Sooda irukkum bodhe kudunga.');
          this.rideTime = 0;
          this.go('riding');
          return;
        }
        const d = this.root!.position.distanceTo(this.tmp.set(autoPos.x, this.root!.position.y, autoPos.z));
        if (!this.waved && d < NOTICE_RADIUS) {
          this.waved = true;
          this.animator!.play('wave', { once: true, then: 'idle' });
        }
        this.faceTowards(autoPos, dt);
        if (stopped && d < PICKUP_RADIUS) {
          this.side = this.auto.group.worldToLocal(this.root!.position.clone()).x >= 0 ? 1 : -1;
          const line = this.story ? this.story.lines.pickup : this.kind === 'urgent' ? URGENT_PICKUP : this.kind === 'vip' ? VIP_PICKUP : rand(PICKUP_LINES);
          this.onSay(this.name, line.replace('{place}', this.to.name));
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
        this.rideTime += dt;
        if (this.kind !== 'delivery') {
          this.hipTarget.copy(BENCH);
          this.pin(0);
        }
        this.chatter -= dt;
        if (this.chatter <= 0 && this.kind !== 'delivery') {
          this.chatter = CHATTER_EVERY;
          this.onSay(this.name, rand(this.story ? this.story.lines.ride : RIDE_LINES));
        }
        // Story detour: revealed a little into the ride; park there a few seconds, then go on.
        if (this.via && !this.viaDone) {
          if (!this.viaShown && this.rideTime > (this.story!.viaAfter ?? 0)) {
            this.viaShown = true;
            this.onSay(this.name, this.story!.lines.via ?? '');
            this.dropMarker.show(stopPoint(this.via, 'kerb'));
          }
          if (this.viaShown) {
            const v = stopPoint(this.via, 'kerb');
            this.viaHold = stopped && Math.hypot(autoPos.x - v.x, autoPos.z - v.z) < DROP_RADIUS ? this.viaHold + dt : 0;
            if (this.viaHold >= VIA_WAIT) {
              this.viaDone = true;
              this.onSay(this.name, this.story!.lines.viaDone ?? '');
              this.dropMarker.show(stopPoint(this.to, 'kerb'));
            }
          }
          return;
        }
        const drop = stopPoint(this.to, 'kerb');
        if (stopped && Math.hypot(autoPos.x - drop.x, autoPos.z - drop.z) < DROP_RADIUS) {
          const a = stopPoint(this.from, 'kerb');
          const paid = payment(Math.hypot(drop.x - a.x, drop.z - a.z), this.rideTime);
          const base = Math.round(paid.base * this.fareBoost);
          let tip = paid.tip;
          let line = rand(PAID_LINES);
          const onTime = this.limit === null || this.rideTime <= this.limit;
          if (this.kind === 'urgent') {
            tip = onTime ? base * (PAY.urgentOnTime - 1) : 0;
            line = onTime ? URGENT_ON_TIME : URGENT_LATE;
          } else if (this.kind === 'vip') {
            tip = this.bumps === 0 ? base * (PAY.vipSmooth - 1) : 0;
            line = this.bumps === 0 ? VIP_SMOOTH : VIP_ROUGH;
          } else if (this.kind === 'delivery') {
            tip = onTime ? Math.round(base * PAY.deliveryHotTip) : 0;
            line = onTime ? PARCEL_HOT : PARCEL_COLD;
          } else if (this.story) {
            const passed = judge(this.story, { onTime, bumps: this.bumps, reds: this.reds });
            tip = passed ? Math.max(0, this.story.reward - base) : 0;
            line = (passed ? this.story.lines.success : this.story.lines.fail).replace('{reward}', String(base + tip));
            this.onStory(this.story.id, passed);
            this.story = null;
            this.via = null;
            this.garland.visible = false;
          }
          this.rides++;
          this.onPaid(base, tip);
          this.onSay(this.kind === 'delivery' ? 'Customer' : this.name, line.replace('{fare}', String(base + tip)));
          this.dropMarker.hide();
          if (this.kind === 'delivery') {
            this.parcel?.removeFromParent();
            this.parcel = null;
            this.go('idle');
            return;
          }
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

  /** A plain ride from a named stop (auto stand, cinema crowd). Returns the new order. */
  addOrderFrom(stopName: string, notify = true) {
    return this.addOrder(notify, STOPS.find((s) => s.name === stopName), 'ride');
  }

  /** New order (ride / urgent / VIP / parcel) between two stops at least MIN_TRIP apart. */
  private addOrder(notify: boolean, fromStop?: Stop, forceKind?: OrderKind) {
    let r = Math.random();
    let kind: OrderKind = forceKind ?? 'ride';
    for (const [k, w] of forceKind ? [] : Object.entries(ORDER_WEIGHTS) as [OrderKind, number][]) {
      if ((r -= w) < 0) {
        kind = k;
        break;
      }
    }
    const hospital = STOPS.find((s) => s.name === HOSPITAL)!;
    const from = fromStop ?? rand(STOPS.filter((s) => kind !== 'urgent' || s !== hospital));
    const fp = stopPoint(from, 'kerb');
    const to = kind === 'urgent' ? hospital : rand(STOPS.filter((s) => {
      const p = stopPoint(s, 'kerb');
      return s !== from && Math.hypot(p.x - fp.x, p.z - fp.z) > MIN_TRIP;
    }));
    const tp = stopPoint(to, 'kerb');
    const metres = Math.hypot(tp.x - fp.x, tp.z - fp.z);
    const base = fare(metres);
    const name = kind === 'vip' ? `⭐ ${rand(VIP_NAMES)}` : kind === 'urgent' ? `🚑 ${rand(PASSENGER_NAMES)} (urgent)` : kind === 'delivery' ? `📦 Parcel: ${rand(PARCEL_FROM)}` : rand(PASSENGER_NAMES);
    const best = kind === 'vip' ? base * PAY.vipSmooth : kind === 'urgent' ? base * PAY.urgentOnTime : kind === 'delivery' ? Math.round(base * (1 + PAY.deliveryHotTip)) : base;
    const order: Order = {
      id: this.nextId++,
      name,
      from,
      to,
      fare: best,
      expires: ORDER_LIFETIME[0] + Math.random() * (ORDER_LIFETIME[1] - ORDER_LIFETIME[0]),
      kind,
      limit: kind === 'urgent' || kind === 'delivery' ? timeLimit(metres) : null,
    };
    this.orders.push(order);
    if (notify) this.onNewOrder(order);
    return order;
  }

  /** The accepted order's passenger (or parcel) appears at the pickup. */
  private spawnPassenger() {
    if (this.kind === 'delivery') {
      const sp = stopPoint(this.from, 'sidewalk');
      this.parcel = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.22, 0.32), new THREE.MeshStandardMaterial({ color: 0xc8a165, roughness: 0.8 }));
      this.parcel.position.set(sp.x, SIDEWALK_HEIGHT + 0.11, sp.z);
      this.parcel.castShadow = true;
      this.scene.add(this.parcel);
      this.pickupMarker.show(sp);
      this.go('waiting');
      return;
    }

    const id = rand((Object.keys(NPC_MODELS) as NpcModelId[]).filter((m) => m !== 'police'));
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
