import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Animator } from '../characters/animator';
import { reachCCD } from '../characters/ik';
import { CHARACTER_HEIGHT, type CharacterAsset } from '../characters/catalog';
import { route } from '../missions/route';
import { BEACH_ROAD, X_LINES, Z_LINES } from '../world/layout';
import { policeModel } from '../vehicles/models';

// ---- Tuning -------------------------------------------------------------------------------
const CHASE_SPEED = 22;
const CORNER_SPEED = 9;
const STOP_DIST = 13; // jeep stops and officers get out this close to you
const REBOARD_DIST = 30; // you got away from the officers on foot: they get back in
const SPAWN_DIST = [38, 55]; // dispatched units appear on a road this far from you, out of sight
const DISPATCH_FROM = 60; // a unit further than this gets re-dispatched near you
const SIGHT = 40; // police see you within this distance with a clear line of sight
const STUCK_SECONDS = 2.5;
const MASS = 1600;
const RUN_SPEED = 4.4;
const SHOOT_RANGE = 20;
const KEEP_DISTANCE = 9; // officers with guns out hold this far back
const ARREST_DIST = 1.7;
const ARREST_SECONDS = 1.2; // "hands up" time before you're arrested
const FIRE_EVERY = [0.9, 1.6];
const DAMAGE = { foot: 11, vehicle: 6 };
// Fist fights with officers
const OFFICER_HP = 100;
const HIT_DAMAGE = { punch: 25, swing: 40, kick: 35 };
const STAGGER_SECONDS = 0.7;
const KICK_DOWN_SECONDS = 3;
const KO_SECONDS = 25; // beaten officer stays down this long
const MELEE_RANGE = 1.8; // closer than this they punch instead of shooting / arresting
const BRAWL_RANGE = 6; // on foot and this close: they rush in for a fist fight instead of shooting
const MELEE_EVERY = 1.6;
const MELEE_HIT_AT = 0.45; // s into their punch when it lands
const HOOK_HIT_AT = 0.95; // ...and into the Hook Punch clip (every other blow)
const MELEE_DAMAGE = 6;
const LINES = {
  dismount: ['Nillu! Police!', 'Odaadha! Kai-ya thooku!', 'Vandi-la irundhu irangu!'],
  shoot: ['Shoot pannuvom! Saranderu!', 'Kadaisi warning!'],
  arrest: ['Kai-ya thooku! Arrest panrom!'],
  down: ['Aiyo! Backup anuppunga!', 'Dei... police-a adikkariya?!'],
};

const pick = <T>(a: readonly T[]) => a[Math.floor(Math.random() * a.length)];
const yawOf = (r: { x: number; y: number; z: number; w: number }) => Math.atan2(2 * (r.w * r.y + r.x * r.z), 1 - 2 * (r.y * r.y + r.x * r.x));

export interface PoliceContext {
  /** Player position (capsule centre, or vehicle position while driving). */
  player: THREE.Vector3;
  playerSpeed: number;
  /** The vehicle the player is in (its collider), or null on foot. */
  vehicle: RAPIER.Collider | null;
  level: number;
  /** Camera position + look direction: dispatched units appear out of view. */
  camera: THREE.Vector3;
  cameraDir: THREE.Vector3;
  blocking: boolean;
}

export interface PoliceEvents {
  damage: number;
  busted: boolean;
  seen: boolean;
  officerHit: boolean;
  /** An officer is next to you and you're about to be arrested (show "hands up"). */
  arresting: boolean;
}

interface Officer {
  root: THREE.Group;
  anim: Animator;
  gun: THREE.Object3D;
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  cooldown: number;
  down: number;
  hp: number;
  /** Seconds into the current punch, -1 = not punching. */
  punchT: number;
  punchCooldown: number;
  /** The next blow is a hook (they alternate jab, hook). */
  hook: boolean;
  /** Standing with the pistol pointed at the player (arms posed by IK over the idle clip). */
  aiming: boolean;
  /** Kick of the last shot (decays). */
  recoil: number;
  arms: { ra: THREE.Object3D; rf: THREE.Object3D; rh: THREE.Object3D; la: THREE.Object3D; lf: THREE.Object3D; lh: THREE.Object3D };
}

/** One police jeep with two officers. */
class Unit {
  state: 'parked' | 'chase' | 'onFoot' = 'parked';
  readonly jeep = new THREE.Group();
  readonly collider: RAPIER.Collider;
  readonly body: RAPIER.RigidBody;
  readonly officers: Officer[] = [];
  private readonly beacons: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
  private readonly wheels: THREE.Object3D[];
  path: { x: number; z: number }[] = [];
  repath = 0;
  stuck = 0;
  readonly prevPos = new THREE.Vector3();
  readonly currPos = new THREE.Vector3();
  readonly prevRot = new THREE.Quaternion();
  readonly currRot = new THREE.Quaternion();

  readonly home: THREE.Vector3;
  readonly homeYaw: number;

  constructor(scene: THREE.Scene, world: RAPIER.World, home: THREE.Vector3, homeYaw: number, officerAsset: CharacterAsset) {
    this.home = home;
    this.homeYaw = homeYaw;
    const m = policeModel(this.jeep);
    this.beacons = m.beacons!;
    this.wheels = m.wheels;
    scene.add(this.jeep);
    this.body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().enabledRotations(false, true, false).setLinearDamping(0.8).setAngularDamping(2).setCanSleep(false),
    );
    this.collider = world.createCollider(RAPIER.ColliderDesc.cuboid(0.9, 1.0, 2.1).setTranslation(0, 1.05, 0).setMass(MASS).setFriction(0).setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min), this.body); // velocity-driven: ground friction would only drag it
    this.place(home, homeYaw);
    for (let i = 0; i < 2; i++) this.officers.push(makeOfficer(scene, world, officerAsset));
  }

  /** Teleport the jeep (parked / dispatched). */
  place(p: { x: number; z: number }, yaw: number) {
    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    this.body.setTranslation({ x: p.x, y: 0.02, z: p.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.currPos.set(p.x, 0.02, p.z);
    this.prevPos.copy(this.currPos);
    this.currRot.copy(q);
    this.prevRot.copy(q);
    this.stuck = 0;
  }

  lights(on: boolean, t: number) {
    const blink = Math.floor(t * 6) % 2 === 0;
    this.beacons[0].emissiveIntensity = on ? (blink ? 4 : 0.2) : 0;
    this.beacons[1].emissiveIntensity = on ? (blink ? 0.2 : 4) : 0;
  }

  sync(dt: number, alpha: number) {
    this.jeep.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.jeep.quaternion.slerpQuaternions(this.prevRot, this.currRot, alpha);
    const lv = this.body.linvel();
    const speed = Math.hypot(lv.x, lv.z);
    for (const w of this.wheels) w.rotation.x += (speed * dt) / 0.36;
  }
}

function makeOfficer(scene: THREE.Scene, world: RAPIER.World, asset: CharacterAsset): Officer {
  const body = cloneSkinned(asset.scene); // already in khaki (chennaiLook.applyPoliceLook)
  const root = new THREE.Group();
  root.add(body);
  root.scale.setScalar(1.74 / CHARACTER_HEIGHT);
  root.visible = false;
  scene.add(root);
  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.22), new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.6, roughness: 0.4 }));
  gun.position.set(0, 0.08, 0.06);
  const b = (n: string) => body.getObjectByName(n)!;
  b('RightHand').add(gun);
  const anim = new Animator(body, asset.clips);
  anim.play('idle', { fade: 0 });
  const rb = world.createRigidBody(RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, -50, 0));
  const collider = world.createCollider(RAPIER.ColliderDesc.capsule(0.55, 0.3), rb);
  collider.setEnabled(false);
  return {
    root, anim, gun, body: rb, collider, cooldown: 1, down: 0, hp: OFFICER_HP, punchT: -1, punchCooldown: 0, hook: false, aiming: false, recoil: 0,
    arms: { ra: b('RightArm'), rf: b('RightForeArm'), rh: b('RightHand'), la: b('LeftArm'), lf: b('LeftForeArm'), lh: b('LeftHand') },
  };
}

/**
 * Mylapore police, GTA-style. Wanted level 1-2 = one unit, 3 = two. A unit that's far away is
 * dispatched to a road out of your sight ~45 m away and drives the road route to you with lights
 * and siren; close in, its two officers get out. 1 star: they walk you down to arrest you
 * ("hands up!"). 2+ stars: they keep their distance and shoot when they can see you.
 */
export class Police {
  readonly units: Unit[];
  /** An officer shouts something (HUD speech). */
  onSay: (line: string) => void = () => {};
  private readonly world: RAPIER.World;
  private readonly ctrl: RAPIER.KinematicCharacterController;
  private readonly tracer: THREE.Line;
  private readonly flash: THREE.Mesh;
  private flashT = 0;
  private t = 0;
  private arrestT = 0;
  private shoutCooldown = 0;
  private audio: AudioContext | null = null;
  private siren: OscillatorNode | null = null;
  private readonly tmp = new THREE.Vector3();
  private readonly aimFrom = new THREE.Vector3();
  private readonly aimTo = new THREE.Vector3();
  private readonly aimGoal = new THREE.Vector3();
  private readonly aimHand = new THREE.Vector3();

  constructor(scene: THREE.Scene, world: RAPIER.World, officerAsset: CharacterAsset, home: THREE.Vector3, homeYaw = -Math.PI / 2) {
    this.world = world;
    this.units = [0, 1].map((i) => new Unit(scene, world, home.clone().add(new THREE.Vector3(-6 * i, 0, 0)), homeYaw, officerAsset));
    // Officers walk with a character controller: they slide along walls instead of through them.
    this.ctrl = world.createCharacterController(0.05);
    this.ctrl.enableAutostep(0.4, 0.2, true);
    this.ctrl.enableSnapToGround(0.3);
    this.tracer = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xffe08a }));
    this.tracer.frustumCulled = false;
    this.flash = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffd060 }));
    this.tracer.visible = this.flash.visible = false;
    scene.add(this.tracer, this.flash);
  }

  /** Jeep colliders (for "you rammed the police"). */
  get jeepColliders() {
    return this.units.map((u) => u.collider);
  }

  /** Minimap blips: jeeps on duty and officers on foot. */
  blips() {
    const out: { x: number; z: number }[] = [];
    for (const u of this.units) {
      if (u.state === 'parked') continue;
      if (u.state === 'chase') out.push({ x: u.currPos.x, z: u.currPos.z });
      else for (const o of u.officers) out.push({ x: o.root.position.x, z: o.root.position.z });
    }
    return out;
  }

  /** Officers within `r` of p (for melee hits). */
  officersNear(p: THREE.Vector3, r: number) {
    return this.units.flatMap((u) => u.officers).filter((o) => o.root.visible && Math.hypot(o.root.position.x - p.x, o.root.position.z - p.z) < r);
  }

  /** Officers out of their jeeps (melee targets). */
  officersOut() {
    return this.units.flatMap((u) => u.officers).filter((o) => o.root.visible);
  }

  /** Melee hit on an officer: stagger, knocked over (kick) or out cold (no health left). */
  hitOfficer(o: Officer, move: 'punch' | 'swing' | 'kick', from: THREE.Vector3) {
    if (o.hp <= 0) return;
    o.hp -= HIT_DAMAGE[move];
    o.punchT = -1;
    // Knocked back a little, away from the player.
    const p = o.root.position;
    const d = Math.hypot(p.x - from.x, p.z - from.z) || 1;
    const push = move === 'punch' ? 0.25 : 0.5;
    p.x += ((p.x - from.x) / d) * push;
    p.z += ((p.z - from.z) / d) * push;
    o.anim.play('idle', { fade: 0 }); // restart the reaction clip even if it's already playing
    if (o.hp <= 0) {
      o.down = KO_SECONDS;
      o.collider.setEnabled(false); // you can step over him
      o.anim.play('fall', { once: true, fade: 0.08 });
      this.shout(pick(LINES.down));
    } else {
      o.down = move === 'kick' ? KICK_DOWN_SECONDS : STAGGER_SECONDS;
      o.anim.play(move === 'kick' ? 'fall' : 'hit_react2', { once: true, fade: 0.05 });
    }
  }

  update(dt: number, ctx: PoliceContext): PoliceEvents {
    this.t += dt;
    this.shoutCooldown -= dt;
    const ev: PoliceEvents = { damage: 0, busted: false, seen: false, officerHit: false, arresting: false };
    this.flashT -= dt;
    this.tracer.visible = this.flash.visible = this.flashT > 0;

    const wanted = ctx.level > 0 ? (ctx.level >= 3 ? 2 : 1) : 0; // units on duty
    let nearestOfficer = Infinity;
    this.units.forEach((u, i) => {
      const onDuty = i < wanted;
      u.lights(onDuty, this.t + i * 0.08);
      if (!onDuty) {
        if (u.state !== 'parked') this.goHome(u);
        return;
      }
      const d = Math.hypot(u.currPos.x - ctx.player.x, u.currPos.z - ctx.player.z);
      if (u.state === 'parked' || (u.state === 'chase' && d > DISPATCH_FROM)) this.dispatch(u, ctx);
      if (u.state === 'chase') {
        if (d < SIGHT && this.canSee(u.currPos, 1.6, ctx)) ev.seen = true;
        u.repath -= dt;
        if (u.repath <= 0) {
          u.repath = 0.5;
          u.path = route({ x: u.currPos.x, z: u.currPos.z }, { x: ctx.player.x, z: ctx.player.z }, X_LINES, Z_LINES);
        }
        if (d < STOP_DIST) this.dismount(u);
        return;
      }
      // Officers on foot.
      let nearest = Infinity;
      for (const o of u.officers) {
        const r = this.updateOfficer(o, dt, ctx);
        nearest = Math.min(nearest, r.dist);
        nearestOfficer = Math.min(nearestOfficer, r.arrestDist);
        ev.damage += r.damage;
        ev.seen ||= r.seen;
        ev.officerHit ||= r.runOver;
      }
      // Got away from them: back in the jeep. (Not while one of them lies beaten on the road.)
      if (nearest > REBOARD_DIST && u.officers.every((o) => o.hp > 0)) this.remount(u);
    });
    this.setSiren(this.units.some((u) => u.state === 'chase'));

    // Arrest at 1 star: an officer next to you while you're (nearly) still, for a moment.
    const close = nearestOfficer < (ctx.vehicle ? 3 : ARREST_DIST);
    const canArrest = ctx.level === 1 && close && ctx.playerSpeed < 1.5;
    this.arrestT = canArrest ? this.arrestT + dt : Math.max(0, this.arrestT - dt * 2);
    ev.arresting = canArrest;
    if (this.arrestT > (ctx.vehicle ? 2 : ARREST_SECONDS)) {
      ev.busted = true;
      this.arrestT = 0;
    }
    return ev;
  }

  /** Each physics step: drive chasing jeeps along their route. */
  step() {
    for (const u of this.units) {
      if (u.state !== 'chase' || u.path.length < 2) {
        const lv = u.body.linvel();
        u.body.setLinvel({ x: lv.x * 0.9, y: lv.y, z: lv.z * 0.9 }, true);
        u.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        continue;
      }
      const t = u.body.translation();
      // Drop route points we've already driven past (the route is rebuilt only every 0.5 s,
      // so its first points end up behind us; aiming at them made the jeep weave and brake).
      while (u.path.length > 2) {
        const a = u.path[1];
        const b = u.path[2];
        if ((t.x - a.x) * (b.x - a.x) + (t.z - a.z) * (b.z - a.z) <= 0) break;
        u.path.splice(1, 1);
      }
      // Aim at a point ~7 m along the route; slow down if a turn is coming.
      let left = 7;
      let aim = u.path[u.path.length - 1];
      let corner = false;
      for (let i = 1; i < u.path.length; i++) {
        const a = i === 1 ? { x: t.x, z: t.z } : u.path[i - 1];
        const b = u.path[i];
        const seg = Math.hypot(b.x - a.x, b.z - a.z);
        if (seg >= left) {
          aim = { x: a.x + ((b.x - a.x) * left) / seg, z: a.z + ((b.z - a.z) * left) / seg };
          corner = i < u.path.length - 1 && seg - left < 4;
          break;
        }
        left -= seg;
      }
      const dx = aim.x - t.x;
      const dz = aim.z - t.z;
      const yaw = yawOf(u.body.rotation());
      const err = Math.atan2(Math.sin(Math.atan2(dx, dz) - yaw), Math.cos(Math.atan2(dx, dz) - yaw));
      // Drive where the nose points (not sideways), turning towards the aim point.
      const speed = Math.abs(err) > 0.6 || corner ? CORNER_SPEED : CHASE_SPEED;
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const lv = u.body.linvel();
      const want = speed * Math.max(0.3, Math.cos(err));
      u.body.setLinvel({ x: lv.x + (fx * want - lv.x) * 0.35, y: lv.y, z: lv.z + (fz * want - lv.z) * 0.35 }, true);
      u.body.setAngvel({ x: 0, y: THREE.MathUtils.clamp(err * 4, -2.5, 2.5), z: 0 }, true);
    }
  }

  /** After each physics step: record poses; unstick jeeps. */
  afterStep(dt: number) {
    for (const u of this.units) {
      const t = u.body.translation();
      const r = u.body.rotation();
      u.prevPos.copy(u.currPos);
      u.prevRot.copy(u.currRot);
      u.currPos.set(t.x, t.y, t.z);
      u.currRot.set(r.x, r.y, r.z, r.w);
      if (u.state !== 'chase') continue;
      // Measured by real movement: the velocity we set each step says nothing about walls.
      const moved = Math.hypot(u.currPos.x - u.prevPos.x, u.currPos.z - u.prevPos.z);
      u.stuck = moved < 1 * dt ? u.stuck + dt : 0;
      if (u.stuck > STUCK_SECONDS && u.path.length > 2) {
        // Wedged on a kerb, a wall or traffic: hop to the next junction on its route.
        const next = u.path[2];
        u.place(next, Math.atan2(next.x - t.x, next.z - t.z));
      }
    }
  }

  sync(dt: number, alpha: number) {
    for (const u of this.units) u.sync(dt, alpha);
  }

  /** Everyone back to the station (wanted level gone, or you were arrested). */
  reset() {
    for (const u of this.units) this.goHome(u);
    this.arrestT = 0;
    this.setSiren(false);
  }

  // ---- internals ---------------------------------------------------------------------------

  /** Put a unit on a road ~45 m from the player, preferably behind the camera, heading their way. */
  private dispatch(u: Unit, ctx: PoliceContext) {
    let best: { x: number; z: number } | null = null;
    let bestScore = -Infinity;
    // Road points inside the grid (not the dead ends at the world edge).
    const candidates: { x: number; z: number }[] = [];
    for (const x of X_LINES) for (let z = Z_LINES[0]; z <= Z_LINES[Z_LINES.length - 1]; z += 5) candidates.push({ x, z });
    for (const z of Z_LINES) for (let x = X_LINES[0]; x <= BEACH_ROAD; x += 5) candidates.push({ x, z });
    {
      {
        for (const p of candidates) {
          const d = Math.hypot(p.x - ctx.player.x, p.z - ctx.player.z);
          if (d < SPAWN_DIST[0] || d > SPAWN_DIST[1]) continue;
          // Behind the camera = out of view.
          const vx = p.x - ctx.camera.x;
          const vz = p.z - ctx.camera.z;
          const facing = (vx * ctx.cameraDir.x + vz * ctx.cameraDir.z) / (Math.hypot(vx, vz) || 1);
          const score = -facing + Math.random() * 0.2;
          if (score > bestScore) {
            bestScore = score;
            best = p;
          }
        }
      }
    }
    if (!best) best = { x: u.home.x, z: u.home.z };
    u.place(best, Math.atan2(ctx.player.x - best.x, ctx.player.z - best.z));
    u.state = 'chase';
    u.repath = 0;
  }

  private dismount(u: Unit) {
    u.state = 'onFoot';
    const side = new THREE.Vector3(1, 0, 0).applyQuaternion(u.currRot);
    u.officers.forEach((o, i) => {
      const s = i === 0 ? 1 : -1;
      o.root.position.copy(u.currPos).addScaledVector(side, s * 1.5);
      o.root.position.y = 0;
      o.root.visible = true;
      o.collider.setEnabled(true);
      o.body.setTranslation({ x: o.root.position.x, y: 0.9, z: o.root.position.z }, true);
      o.cooldown = 1 + i * 0.5;
      o.down = 0;
      o.hp = OFFICER_HP;
      o.punchT = -1;
      o.anim.play('run', { fade: 0 });
    });
    this.shout(pick(LINES.dismount));
  }

  private remount(u: Unit) {
    u.state = 'chase';
    u.repath = 0;
    for (const o of u.officers) hide(o);
  }

  private goHome(u: Unit) {
    u.state = 'parked';
    for (const o of u.officers) hide(o);
    u.place(u.home, u.homeYaw);
  }

  /** One officer's turn: move (with collisions), arrest or shoot. */
  private updateOfficer(o: Officer, dt: number, ctx: PoliceContext) {
    const r = { dist: Infinity, arrestDist: Infinity, damage: 0, seen: false, runOver: false };
    let aiming = false;
    if (!o.root.visible) return r;
    const p = o.root.position;
    const dx = ctx.player.x - p.x;
    const dz = ctx.player.z - p.z;
    const d = Math.hypot(dx, dz);
    r.dist = d;
    // Run over by the player's vehicle?
    this.world.contactPairsWith(o.collider, (other) => {
      if (other === ctx.vehicle && o.down <= 0 && ctx.playerSpeed > 2) {
        o.down = 4;
        o.anim.play('fall', { once: true, fade: 0.08 });
        r.runOver = true;
      }
    });
    if (o.down > 0) {
      o.down -= dt;
      if (o.down <= 0) {
        if (o.hp <= 0) {
          o.hp = OFFICER_HP / 2; // groggy, but back up
          o.collider.setEnabled(true);
        }
        o.anim.play('idle', { fade: 0.4 });
      }
      o.anim.update(dt);
      return r;
    }
    r.arrestDist = d; // only officers on their feet can arrest you
    const see = d < SIGHT && this.canSee(p, 1.45, ctx);
    r.seen = see;
    o.root.rotation.y = Math.atan2(dx, dz);
    const armed = ctx.level >= 2;
    let move = 0;
    o.punchCooldown -= dt;
    if (o.punchT >= 0) {
      // Mid-punch: it lands once, if you're still in reach.
      const before = o.punchT;
      o.punchT += dt;
      const hitAt = o.hook ? HOOK_HIT_AT : MELEE_HIT_AT;
      if (before < hitAt && o.punchT >= hitAt && d < MELEE_RANGE + 0.3 && !ctx.vehicle) {
        r.damage = MELEE_DAMAGE * (ctx.blocking ? 0.3 : 1);
      }
      if (o.punchT > MELEE_EVERY * 0.8) o.punchT = -1;
    } else if (armed && d < MELEE_RANGE && !ctx.vehicle) {
      // Too close for the gun: fists.
      if (o.punchCooldown <= 0) {
        o.punchCooldown = MELEE_EVERY;
        o.punchT = 0;
        o.hook = !o.hook;
        o.anim.play('idle', { fade: 0 });
        o.anim.play(o.hook ? 'hook' : 'punch', { once: true, fade: 0.08 });
      }
    } else if (armed && d < BRAWL_RANGE && !ctx.vehicle) {
      o.anim.play('run');
      move = RUN_SPEED * 0.8; // close in for the fight
    } else if (armed && see && d < SHOOT_RANGE) {
      o.anim.play('idle');
      aiming = true;
      o.cooldown -= dt;
      if (o.cooldown <= 0) {
        o.cooldown = FIRE_EVERY[0] + Math.random() * (FIRE_EVERY[1] - FIRE_EVERY[0]);
        o.recoil = 1;
        r.damage = this.fire(o, ctx);
      }
      if (d > KEEP_DISTANCE + 4) move = RUN_SPEED * 0.6; // close in while firing
    } else if (d > (armed ? KEEP_DISTANCE : ARREST_DIST * 0.8)) {
      o.anim.play(armed ? 'pistol_run' : 'run');
      move = RUN_SPEED;
    } else {
      o.anim.play('idle');
      aiming = armed;
    }
    if (move > 0 && d > 0.01) {
      // Character controller: slides along walls, steps up kerbs.
      this.ctrl.computeColliderMovement(o.collider, { x: (dx / d) * move * dt, y: -0.05, z: (dz / d) * move * dt }, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC);
      const m = this.ctrl.computedMovement();
      p.x += m.x;
      p.z += m.z;
      p.y = Math.max(0, p.y + m.y);
    }
    o.anim.update(dt);
    o.aiming = aiming;
    if (aiming) this.aim(o, ctx, dt);
    o.body.setNextKinematicTranslation({ x: p.x, y: p.y + 0.9, z: p.z });
    return r;
  }

  /**
   * Pistol pointed at the player: no Mixamo pistol-idle clip, so the right arm is reached out at
   * shoulder height towards them over the idle pose, the left hand cups the right, and a shot
   * kicks the gun up for a moment.
   */
  private aim(o: Officer, ctx: PoliceContext, dt: number) {
    o.recoil = Math.max(0, o.recoil - dt * 6);
    o.root.updateMatrixWorld(true);
    const sh = o.arms.ra.getWorldPosition(this.aimFrom);
    const to = this.aimTo.set(ctx.player.x - sh.x, (ctx.vehicle ? 1.2 : ctx.player.y + 0.4) - sh.y, ctx.player.z - sh.z).normalize();
    const goal = this.aimGoal.copy(sh).addScaledVector(to, 0.62);
    goal.y += 0.06 + o.recoil * 0.12;
    reachCCD(o.arms.ra, o.arms.rf, o.arms.rh, goal, 4);
    o.arms.rh.getWorldPosition(this.aimHand);
    reachCCD(o.arms.la, o.arms.lf, o.arms.lh, this.aimHand.addScaledVector(to, -0.04), 4);
  }

  /** Clear line from `from` (at chest height `h`) to the player, ignoring people and the player's vehicle. */
  private canSee(from: THREE.Vector3, h: number, ctx: PoliceContext) {
    const a = this.tmp.set(from.x, h, from.z);
    const b = new THREE.Vector3(ctx.player.x, ctx.vehicle ? 1.2 : ctx.player.y + 0.5, ctx.player.z);
    const dir = b.clone().sub(a);
    const len = dir.length();
    if (len < 1) return true;
    dir.divideScalar(len);
    const hit = this.world.castRay(new RAPIER.Ray(a, dir), len - 1, true, RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC, undefined, ctx.vehicle ?? undefined, undefined, (c) => !this.jeepColliders.includes(c));
    return hit === null;
  }

  private fire(o: Officer, ctx: PoliceContext) {
    const gunPos = o.gun.getWorldPosition(new THREE.Vector3());
    let chance = ctx.level >= 3 ? 0.5 : 0.35;
    if (ctx.playerSpeed > 5) chance *= 0.5;
    if (ctx.vehicle) chance *= 0.75;
    const hit = Math.random() < chance;
    const target = new THREE.Vector3(ctx.player.x, ctx.vehicle ? 1.2 : ctx.player.y + 0.3, ctx.player.z);
    if (!hit) target.add(new THREE.Vector3((Math.random() - 0.5) * 3, Math.random() * 1.5, (Math.random() - 0.5) * 3));
    const pos = this.tracer.geometry.attributes.position as THREE.BufferAttribute;
    pos.setXYZ(0, gunPos.x, gunPos.y, gunPos.z);
    pos.setXYZ(1, target.x, target.y, target.z);
    pos.needsUpdate = true;
    this.flash.position.copy(gunPos);
    this.flashT = 0.07;
    this.bang();
    if (this.shoutCooldown <= 0 && Math.random() < 0.3) this.shout(pick(LINES.shoot));
    if (!hit) return 0;
    const dmg = ctx.vehicle ? DAMAGE.vehicle : DAMAGE.foot;
    return ctx.blocking ? dmg * 0.5 : dmg;
  }

  private shout(line: string) {
    if (this.shoutCooldown > 0) return;
    this.shoutCooldown = 5;
    this.onSay(line);
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

  /** Two-tone siren while any unit is chasing. */
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
      for (let i = 0; i < 800; i++) osc.frequency.setValueAtTime(i % 2 ? 960 : 700, now + i * 0.45);
      osc.start();
      this.siren = osc;
    } else if (!on && this.siren) {
      this.siren.stop();
      this.siren = null;
    }
  }
}

function hide(o: Officer) {
  o.root.visible = false;
  o.collider.setEnabled(false);
}
