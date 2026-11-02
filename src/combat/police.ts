import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Animator } from '../characters/animator';
import { CHARACTER_HEIGHT, type CharacterAsset } from '../characters/catalog';
import { route } from '../missions/route';
import { ROAD_LINES } from '../world/layout';
import { policeModel } from '../vehicles/models';

// Jeep
const CHASE_SPEED = 14;
const TURN_SPEED = 6;
const STOP_DIST = 12; // jeep stops and officers get out this close to you
const REBOARD_DIST = 32; // you got away from the officers: they jump back in
const SIGHT = 45; // police "see" you within this distance (keeps the wanted level up)
const MASS = 1600;
// Officers
const OFFICERS = 2;
const RUN_SPEED = 4.6;
const SHOOT_RANGE = 18;
const ARREST_DIST = 1.6;
const FIRE_EVERY = [0.9, 1.5];
const DAMAGE = { foot: 12, vehicle: 7 };
const UNIFORM = 0xc9b07a; // Tamil Nadu Police khaki

type State = 'parked' | 'chase' | 'onFoot';

interface Officer {
  root: THREE.Group;
  anim: Animator;
  gun: THREE.Object3D;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  cooldown: number;
  down: number; // s left knocked down
}

export interface PoliceContext {
  /** Player position (capsule centre, or vehicle position while driving). */
  player: THREE.Vector3;
  playerSpeed: number;
  /** The vehicle the player is in (its collider), or null on foot. */
  vehicle: RAPIER.Collider | null;
  level: number; // wanted stars
}

export interface PoliceEvents {
  damage: number;
  busted: boolean;
  seen: boolean;
  /** An officer was hit by a vehicle (counts as assaulting police). */
  officerHit: boolean;
}

/**
 * Mylapore police: one jeep parked at the station and two officers. With a wanted level the jeep
 * drives the road route to you (lights + siren); close in, the officers get out. 1 star: they run
 * at you to arrest you. 2+ stars: they shoot when they have a clear line of sight.
 */
export class Police {
  state: State = 'parked';
  readonly jeep = new THREE.Group();
  readonly jeepCollider: RAPIER.Collider;
  private readonly body: RAPIER.RigidBody;
  private readonly world: RAPIER.World;
  private readonly scene: THREE.Scene;
  private readonly spot: THREE.Vector3;
  private readonly spotYaw: number;
  private readonly beacons: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
  private readonly wheels: THREE.Object3D[];
  private readonly officers: Officer[] = [];
  private readonly tracer: THREE.Line;
  private readonly flash: THREE.Mesh;
  private flashT = 0;
  private path: { x: number; z: number }[] = [];
  private repath = 0;
  private t = 0;
  private arrestT = 0;
  private audio: AudioContext | null = null;
  private siren: { osc: OscillatorNode; gain: GainNode } | null = null;
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();
  private readonly prevRot = new THREE.Quaternion();
  private readonly currRot = new THREE.Quaternion();
  private readonly tmp = new THREE.Vector3();

  constructor(scene: THREE.Scene, world: RAPIER.World, officerAsset: CharacterAsset, spot: THREE.Vector3, spotYaw = -Math.PI / 2) {
    this.scene = scene;
    this.world = world;
    this.spot = spot.clone();
    this.spotYaw = spotYaw;
    const m = policeModel(this.jeep);
    this.beacons = m.beacons!;
    this.wheels = m.wheels;
    scene.add(this.jeep);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), spotYaw);
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(spot.x, 0.02, spot.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
        .enabledRotations(false, true, false)
        .setLinearDamping(0.8)
        .setAngularDamping(2)
        .setCanSleep(false),
    );
    this.jeepCollider = world.createCollider(RAPIER.ColliderDesc.cuboid(0.9, 1.0, 2.1).setTranslation(0, 1.05, 0).setMass(MASS).setFriction(0.3), this.body);
    this.currPos.copy(spot);
    this.prevPos.copy(spot);
    this.currRot.copy(q);
    this.prevRot.copy(q);

    for (let i = 0; i < OFFICERS; i++) this.officers.push(this.makeOfficer(officerAsset));

    this.tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffe08a }));
    this.tracer.visible = false;
    this.tracer.frustumCulled = false;
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd060 }));
    this.flash.visible = false;
    scene.add(this.tracer, this.flash);
  }

  /** All police colliders (things that count as "police" when hit). */
  get colliders() {
    return [this.jeepCollider, ...this.officers.map((o) => o.collider)];
  }

  /** Officers within `r` of p (for stick hits). */
  officersNear(p: THREE.Vector3, r: number) {
    return this.officers.filter((o) => o.root.visible && o.root.position.distanceTo(this.tmp.set(p.x, o.root.position.y, p.z)) < r);
  }

  /** Stick hit on an officer. */
  hitOfficer(o: Officer) {
    o.down = 2;
    o.anim.play('hit', { once: true, then: 'idle', fade: 0.1 });
  }

  /** Called once per frame. */
  update(dt: number, ctx: PoliceContext): PoliceEvents {
    this.t += dt;
    const ev: PoliceEvents = { damage: 0, busted: false, seen: false, officerHit: false };
    this.flashT -= dt;
    this.tracer.visible = this.flash.visible = this.flashT > 0;
    const on = ctx.level > 0;
    // Lights and siren.
    const blink = Math.floor(this.t * 6) % 2 === 0;
    this.beacons[0].emissiveIntensity = on ? (blink ? 4 : 0.2) : 0;
    this.beacons[1].emissiveIntensity = on ? (blink ? 0.2 : 4) : 0;
    this.setSiren(on && this.state !== 'parked');

    if (!on) {
      if (this.state !== 'parked') this.goHome();
      return ev;
    }
    const jp = this.currPos;
    const dJeep = Math.hypot(jp.x - ctx.player.x, jp.z - ctx.player.z);
    ev.seen = dJeep < SIGHT;

    if (this.state === 'parked') this.state = 'chase';
    if (this.state === 'chase') {
      this.repath -= dt;
      if (this.repath <= 0) {
        this.repath = 0.5;
        this.path = route({ x: jp.x, z: jp.z }, { x: ctx.player.x, z: ctx.player.z }, ROAD_LINES);
      }
      if (dJeep < STOP_DIST) this.dismount();
      return ev;
    }

    // On foot.
    let nearest = Infinity;
    for (const o of this.officers) {
      const p = o.root.position;
      const dx = ctx.player.x - p.x;
      const dz = ctx.player.z - p.z;
      const d = Math.hypot(dx, dz);
      nearest = Math.min(nearest, d);
      if (d < SIGHT) ev.seen = true;
      // Run over by a vehicle?
      this.world.contactPairsWith(o.collider, (other) => {
        if (other === ctx.vehicle && o.down <= 0 && ctx.playerSpeed > 2) {
          o.down = 5;
          o.anim.play('fall', { once: true, fade: 0.1 });
          ev.officerHit = true;
        }
      });
      if (o.down > 0) {
        o.down -= dt;
        if (o.down <= 0) o.anim.play('idle', { fade: 0.4 });
        o.anim.update(dt);
        continue;
      }
      o.root.rotation.y = Math.atan2(dx, dz);
      const shoot = ctx.level >= 2 && d < SHOOT_RANGE && this.lineOfSight(o, ctx);
      if (shoot) {
        o.anim.play('shoot');
        o.cooldown -= dt;
        if (o.cooldown <= 0) {
          o.cooldown = FIRE_EVERY[0] + Math.random() * (FIRE_EVERY[1] - FIRE_EVERY[0]);
          ev.damage += this.fire(o, ctx);
        }
      } else if (d > (ctx.level >= 2 ? SHOOT_RANGE * 0.7 : ARREST_DIST)) {
        o.anim.play('run');
        const step = Math.min(d, RUN_SPEED * dt);
        p.x += (dx / d) * step;
        p.z += (dz / d) * step;
      } else {
        o.anim.play(ctx.level >= 2 ? 'aim' : 'idle');
      }
      o.anim.update(dt);
      o.body.setNextKinematicTranslation({ x: p.x, y: p.y + 0.85, z: p.z });
    }

    // Arrest (1 star): an officer reaches you on foot, or stands by your stopped vehicle.
    const close = nearest < (ctx.vehicle ? 3 : ARREST_DIST);
    this.arrestT = close && ctx.playerSpeed < 1 ? this.arrestT + dt : 0;
    if (ctx.level === 1 && this.arrestT > (ctx.vehicle ? 2 : 0.3)) ev.busted = true;

    if (nearest > REBOARD_DIST) this.remount();
    return ev;
  }

  /** Each physics step: drive the jeep along the route (or hold it still). */
  step(_dt: number) {
    if (this.state !== 'chase' || this.path.length < 2) {
      const lv = this.body.linvel();
      this.body.setLinvel({ x: lv.x * 0.9, y: lv.y, z: lv.z * 0.9 }, true);
      this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }
    const t = this.body.translation();
    // Aim at the point ~7 m along the route.
    let left = 7;
    let aim = this.path[this.path.length - 1];
    for (let i = 1; i < this.path.length; i++) {
      const a = i === 1 ? { x: t.x, z: t.z } : this.path[i - 1];
      const b = this.path[i];
      const seg = Math.hypot(b.x - a.x, b.z - a.z);
      if (seg >= left) {
        aim = { x: a.x + ((b.x - a.x) * left) / seg, z: a.z + ((b.z - a.z) * left) / seg };
        break;
      }
      left -= seg;
    }
    const dx = aim.x - t.x;
    const dz = aim.z - t.z;
    const d = Math.hypot(dx, dz) || 1;
    const r = this.body.rotation();
    const yaw = Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.x * r.x));
    const err = Math.atan2(Math.sin(Math.atan2(dx, dz) - yaw), Math.cos(Math.atan2(dx, dz) - yaw));
    const speed = Math.abs(err) > 0.5 ? TURN_SPEED : CHASE_SPEED;
    const lv = this.body.linvel();
    this.body.setLinvel({ x: lv.x + ((dx / d) * speed - lv.x) * 0.25, y: lv.y, z: lv.z + ((dz / d) * speed - lv.z) * 0.25 }, true);
    this.body.setAngvel({ x: 0, y: err * 5, z: 0 }, true);
  }

  /** After each physics step: record the jeep pose. */
  afterStep() {
    const t = this.body.translation();
    const r = this.body.rotation();
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
    this.currPos.set(t.x, t.y, t.z);
    this.currRot.set(r.x, r.y, r.z, r.w);
  }

  sync(dt: number, alpha: number) {
    this.jeep.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.jeep.quaternion.slerpQuaternions(this.prevRot, this.currRot, alpha);
    const lv = this.body.linvel();
    const speed = Math.hypot(lv.x, lv.z);
    for (const w of this.wheels) w.rotation.x += (speed * dt) / 0.36;
  }

  /** Everyone back to the station (wanted level cleared, or you were arrested). */
  goHome() {
    this.state = 'parked';
    for (const o of this.officers) this.hideOfficer(o);
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), this.spotYaw);
    this.body.setTranslation({ x: this.spot.x, y: 0.02, z: this.spot.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.currPos.copy(this.spot);
    this.prevPos.copy(this.spot);
    this.currRot.copy(q);
    this.prevRot.copy(q);
    this.setSiren(false);
  }

  // ---- internals ---------------------------------------------------------------------------

  private dismount() {
    this.state = 'onFoot';
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(this.currRot);
    this.officers.forEach((o, i) => {
      const s = i === 0 ? 1 : -1;
      o.root.position.copy(this.currPos).addScaledVector(side, s * 1.4);
      o.root.position.y = 0;
      o.root.visible = true;
      o.collider.setEnabled(true);
      o.body.setTranslation({ x: o.root.position.x, y: 0.85, z: o.root.position.z }, true);
      o.cooldown = 0.8 + i * 0.4;
      o.down = 0;
      o.anim.play('run', { fade: 0 });
    });
  }

  private remount() {
    this.state = 'chase';
    for (const o of this.officers) this.hideOfficer(o);
  }

  private hideOfficer(o: Officer) {
    o.root.visible = false;
    o.collider.setEnabled(false);
  }

  /** Clear shot? Ray from the officer's chest to the player (ignoring people and the player's vehicle). */
  private lineOfSight(o: Officer, ctx: PoliceContext) {
    const from = this.tmp.copy(o.root.position).setY(1.4);
    const to = new THREE.Vector3(ctx.player.x, ctx.vehicle ? 1.2 : ctx.player.y + 0.4, ctx.player.z);
    const dir = to.clone().sub(from);
    const len = dir.length();
    dir.normalize();
    const hit = this.world.castRay(new RAPIER.Ray(from, dir), len - 0.8, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC, undefined, ctx.vehicle ?? undefined);
    return hit === null;
  }

  /** One shot: tracer + flash + bang; returns damage dealt. */
  private fire(o: Officer, ctx: PoliceContext) {
    const gunPos = o.gun.getWorldPosition(new THREE.Vector3());
    const level3 = ctx.level >= 3;
    let chance = level3 ? 0.55 : 0.4;
    if (ctx.playerSpeed > 5) chance *= 0.55;
    if (ctx.vehicle) chance *= 0.75;
    const hit = Math.random() < chance;
    const target = new THREE.Vector3(ctx.player.x, ctx.vehicle ? 1.2 : ctx.player.y + 0.3, ctx.player.z);
    if (!hit) target.add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 1.5, (Math.random() - 0.5) * 3));
    const pos = this.tracer.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, gunPos.x, gunPos.y, gunPos.z);
    pos.setXYZ(1, target.x, target.y, target.z);
    pos.needsUpdate = true;
    this.flash.position.copy(gunPos);
    this.flashT = 0.06;
    this.bang();
    return hit ? (ctx.vehicle ? DAMAGE.vehicle : DAMAGE.foot) : 0;
  }

  private makeOfficer(asset: CharacterAsset): Officer {
    const body = cloneSkinned(asset.scene);
    body.traverse((m) => {
      if (!(m instanceof THREE.Mesh)) return;
      const mat = (m.material as THREE.MeshStandardMaterial).clone();
      mat.color.set(UNIFORM);
      m.material = mat;
    });
    const root = new THREE.Group();
    root.add(body);
    root.scale.setScalar(1.74 / CHARACTER_HEIGHT);
    root.visible = false;
    this.scene.add(root);
    // Pistol in the right hand.
    const gun = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.22), new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.6, roughness: 0.4 }));
    gun.position.set(0, 0.08, 0.06);
    (body.getObjectByName('WristR') ?? body).add(gun);
    const anim = new Animator(body, asset.clips);
    anim.play('idle', { fade: 0 });
    const rb = this.world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0));
    const collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.3), rb);
    collider.setEnabled(false);
    return { root, anim, gun, body: rb, collider, cooldown: 1, down: 0 };
  }

  // ---- sound (WebAudio, no files) ----------------------------------------------------------

  private ctx() {
    try {
      this.audio ??= new AudioContext();
      return this.audio;
    } catch {
      return null;
    }
  }

  private bang() {
    const ctx = this.ctx();
    if (!ctx) return;
    const len = Math.floor(ctx.sampleRate * 0.12);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
    const src = ctx.createBufferSource();
    const gain = ctx.createGain();
    gain.gain.value = 0.25;
    src.buffer = buf;
    src.connect(gain).connect(ctx.destination);
    src.start();
  }

  /** Two-tone wailing siren while chasing. */
  private setSiren(on: boolean) {
    if (on && !this.siren) {
      const ctx = this.ctx();
      if (!ctx) return;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      gain.gain.value = 0.025;
      osc.connect(gain).connect(ctx.destination);
      const now = ctx.currentTime;
      for (let i = 0; i < 600; i++) osc.frequency.setValueAtTime(i % 2 ? 960 : 700, now + i * 0.45);
      osc.start();
      this.siren = { osc, gain };
    } else if (!on && this.siren) {
      this.siren.osc.stop();
      this.siren = null;
    }
  }
}
