import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { Animator } from '../characters/animator';
import { CHARACTER_HEIGHT, NPC_MODELS, type CharacterAsset, type NpcModelId } from '../characters/catalog';
import { varyLook } from '../npcs/look';
import { carModel } from '../vehicles/models';
import { X_LINES, Z_LINES, roadHalf } from '../world/layout';
import { Marker } from './jobs';
import type { Person, Pt, Quest, Step } from './quests';
import { route } from './route';

/**
 * Runs one story quest at a time (missions/quests.ts): spawns its people, shows where to go,
 * and works through the steps (go somewhere, talk, search, escort, chase, carry). main.ts feeds
 * it the player's state each frame and E presses; it reports lines, the prompt and the result.
 */

const TALK_RADIUS = 2.3;
const FOUND_RADIUS = 2.6;
const CATCH_RADIUS = 2.1; // on foot, with E
const RAM_RADIUS = 2.8; // in a vehicle: drive into them
const LOSE_DIST = 45; // m: further than this for loseAfter s and the runner gets away
const ARRIVE_RADIUS = 6;
const FOLLOW_GAP = 1.6;
const CRY_RADIUS = 14;
const LINGER = 8; // s the people stay after the quest ends
const SPOT_AFTER = 3; // s too close behind the car you're tailing before they notice
const LOSE_AFTER = 8; // s too far behind before it's gone
const LANE = 2.6; // m left of the road centre: the tailed car keeps to the left lane
const RAY_FLAGS = RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC | RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC | RAPIER.QueryFilterFlags.EXCLUDE_SENSORS;

interface Actor {
  person: Person;
  root: THREE.Group;
  animator: Animator;
  walk: number; // clip speeds (m/s at 1x)
  run: number;
}

export interface QuestCtx {
  /** The hero's feet, facing, and whether walking (not in any vehicle). */
  hero: THREE.Vector3;
  heroYaw: number;
  onFoot: boolean;
  /** The vehicle being driven (position), or null on foot. */
  vehicle: THREE.Vector3 | null;
  /** A hard knock this frame (crash / sudden stop) while driving. */
  jolt: boolean;
  /** Driving a stolen vehicle: missions don't count (the clock still runs). */
  stolen?: boolean;
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

export class QuestRunner {
  quest: Quest | null = null;
  onSay: (name: string, line: string) => void = () => {};
  onDone: (id: string, passed: boolean, reward: number) => void = () => {};
  /** Prompt for the HUD (E ...), or null. */
  prompt: string | null = null;

  private step = 0;
  private t = 0;
  private readonly people = new Map<string, Actor>();
  private lingering: { actors: Actor[]; t: number } | null = null;
  private readonly marker: Marker;
  private readonly scene: THREE.Scene;
  private readonly world: RAPIER.World;
  private readonly assets: Map<NpcModelId, CharacterAsset>;
  private readonly box: THREE.Mesh;
  private readonly garland: THREE.Group;
  private readonly bag: THREE.Mesh;
  /** The car being tailed (built for the tail step only). */
  private car: THREE.Group | null = null;
  private near = 0;
  // Step state.
  private path: Pt[] = [];
  private pathI = 0;
  private far = 0;
  private jolts = 0;
  private cried = false;
  private warned = false;
  private caught = false;
  private gap = -1; // m to the tailed car (HUD)
  private readonly ray = new RAPIER.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 });

  constructor(scene: THREE.Scene, world: RAPIER.World, assets: Map<NpcModelId, CharacterAsset>) {
    this.scene = scene;
    this.world = world;
    this.assets = assets;
    this.marker = new Marker(scene, 0xffd21f);
    this.box = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.36, 0.38), new THREE.MeshStandardMaterial({ color: 0x2b2f33, roughness: 0.5, metalness: 0.4 }));
    this.box.castShadow = true;
    this.garland = new THREE.Group();
    const ring = new THREE.TorusGeometry(0.22, 0.06, 6, 16);
    [0xff8f00, 0xffd54f, 0xff8f00].forEach((c, i) => {
      const m = new THREE.Mesh(ring, new THREE.MeshStandardMaterial({ color: c, roughness: 0.8 }));
      m.rotation.x = Math.PI / 2;
      m.position.y = i * 0.09;
      this.garland.add(m);
    });
    this.bag = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.3, 0.16), new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 0.45 }));
    this.bag.castShadow = true;
    this.box.visible = this.garland.visible = this.bag.visible = false;
    scene.add(this.box, this.garland, this.bag);
  }

  get active() {
    return this.quest !== null;
  }

  private get cur(): Step | null {
    return this.quest ? this.quest.steps[this.step] ?? null : null;
  }

  /** Where to go (minimap marker + route line). */
  get target(): { x: number; z: number; kind: 'pickup' | 'drop' } | null {
    const s = this.cur;
    if (!s) return null;
    if (s.kind === 'goto') return { ...s.at, kind: 'pickup' };
    if (s.kind === 'tail') return this.car ? { x: this.car.position.x, z: this.car.position.z, kind: 'pickup' } : null;
    if (s.kind === 'talk' || s.kind === 'chase') {
      const a = this.people.get(s.who);
      return a ? { x: a.root.position.x, z: a.root.position.z, kind: 'pickup' } : null;
    }
    if (s.kind === 'search') return { ...this.centre(s.spots), kind: 'pickup' };
    return { ...s.to, kind: 'drop' };
  }

  /** Mission line for the HUD. */
  get mission() {
    const s = this.cur;
    if (!s || !this.quest) return '';
    const clock = s.kind === 'carry' ? ` ⏱ ${Math.max(0, Math.ceil(s.limit - this.t))}s` : '';
    const knocks = s.kind === 'carry' && s.maxJolts !== undefined ? ` · knocks ${this.jolts}/${s.maxJolts}` : '';
    const gap = s.kind === 'tail' && this.gap >= 0 ? ` · ${Math.round(this.gap)} m` : '';
    return `📖 ${this.quest.title}: ${s.text}${clock}${knocks}${gap}`;
  }

  start(q: Quest) {
    this.clear();
    this.quest = q;
    for (const [id, p] of Object.entries(q.people)) if (!p.hidden) this.spawn(id, p, p.at);
    this.enter(0);
  }

  /** E pressed while a prompt is showing. Returns true if the quest used it. */
  interact(ctx: QuestCtx) {
    const s = this.cur;
    if (!s || !ctx.onFoot) return false;
    if (s.kind === 'talk') {
      const a = this.people.get(s.who);
      if (!a || this.dist(ctx.hero, a.root.position) > TALK_RADIUS) return false;
      this.greet(a, ctx.hero);
      this.onSay(a.person.name, s.line);
      this.next();
      return true;
    }
    if (s.kind === 'search') {
      for (const c of s.clues) {
        const a = this.people.get(c.who);
        if (a && this.dist(ctx.hero, a.root.position) < TALK_RADIUS) {
          this.greet(a, ctx.hero);
          this.onSay(a.person.name, c.line);
          return true;
        }
      }
    }
    if (s.kind === 'chase' && !this.caught) {
      const a = this.people.get(s.who);
      if (a && this.dist(ctx.hero, a.root.position) < CATCH_RADIUS) {
        this.catch(a, s);
        return true;
      }
    }
    return false;
  }

  update(dt: number, ctx: QuestCtx) {
    this.marker.update(dt);
    if (this.lingering) {
      this.lingering.t -= dt;
      for (const a of this.lingering.actors) a.animator.update(dt);
      if (this.lingering.t <= 0) {
        for (const a of this.lingering.actors) a.root.removeFromParent();
        this.lingering = null;
      }
    }
    this.prompt = null;
    const s = this.cur;
    if (!s) return;
    this.t += dt;
    if (ctx.stolen) {
      for (const a of this.people.values()) a.animator.update(dt);
      this.prompt = 'Stolen vandi: missions need your own vehicle (or go on foot)';
      return;
    }
    const me = ctx.vehicle ?? ctx.hero;
    for (const a of this.people.values()) a.animator.update(dt);
    // People who aren't busy turn to face you when you're close.
    for (const [id, a] of this.people) {
      const moving = (s.kind === 'escort' || s.kind === 'chase') && s.who === id;
      if (!moving && this.dist(ctx.hero, a.root.position) < 8) this.face(a, ctx.hero, dt);
    }
    const t = this.target;
    if (t) this.marker.show(t); // follows people who move
    switch (s.kind) {
      case 'goto': {
        if (this.dist(me, s.at) < (s.radius ?? ARRIVE_RADIUS)) {
          if (s.onFoot && !ctx.onFoot) this.prompt = 'Get out and walk';
          else this.next();
        }
        return;
      }
      case 'talk': {
        const a = this.people.get(s.who);
        if (a && ctx.onFoot && this.dist(ctx.hero, a.root.position) < TALK_RADIUS) this.prompt = `E - Talk to ${a.person.name}`;
        return;
      }
      case 'search': {
        const hid = this.people.get(s.who)!;
        for (const c of s.clues) {
          const a = this.people.get(c.who);
          if (a && ctx.onFoot && this.dist(ctx.hero, a.root.position) < TALK_RADIUS) this.prompt = `E - Ask ${a.person.name}`;
        }
        const d = this.dist(me, hid.root.position);
        if (!this.cried && d < CRY_RADIUS) {
          this.cried = true;
          this.onSay(hid.person.name, 'Ammaaa...! (sniff sniff)');
        }
        if (d < FOUND_RADIUS) {
          this.greet(hid, ctx.hero);
          this.onSay(hid.person.name, s.found);
          this.next();
        }
        return;
      }
      case 'escort': {
        const a = this.people.get(s.who)!;
        if (!ctx.onFoot) {
          if (!this.warned) {
            this.warned = true;
            this.onSay(a.person.name, "Enakku vandi-la bayam... nadandhu varalaama? (walk with them)");
          }
          this.idle(a);
        } else this.follow(a, ctx.hero, dt);
        if (this.dist(a.root.position, s.to) < 3) {
          this.onSay('', s.done);
          this.next();
        }
        return;
      }
      case 'chase': {
        const a = this.people.get(s.who)!;
        if (this.caught) return;
        this.run(a, s.speed, dt);
        const d = this.dist(me, a.root.position);
        if (ctx.onFoot && d < CATCH_RADIUS + 0.4) this.prompt = 'E - Pidi! (grab him)';
        if (ctx.vehicle && d < RAM_RADIUS) {
          this.catch(a, s);
          return;
        }
        this.far = d > LOSE_DIST ? this.far + dt : 0;
        if (this.far > s.loseAfter || this.pathI >= this.path.length) this.finish(false, s.escaped);
        return;
      }
      case 'tail': {
        const car = this.car!;
        if (!ctx.vehicle) {
          this.prompt = 'Get in a vehicle to follow the car';
          this.gap = -1;
          return; // the car waits at the kerb until you're driving
        }
        const d = this.dist(ctx.vehicle, car.position);
        this.gap = d;
        this.drive(car, s.speed, dt);
        const rider = s.rider ? this.people.get(s.rider)!.person.name : '';
        // Too close: they notice in the mirror. Too far: gone.
        this.near = d < s.near ? this.near + dt : 0;
        this.far = d > s.lose ? this.far + dt : 0;
        if (this.near > 0 && !this.warned) {
          this.warned = true;
          this.onSay(rider, s.warnNear);
        }
        if (this.far > 0 && !this.cried) {
          this.cried = true;
          this.onSay(rider, s.warnFar);
        }
        if (this.near === 0 && this.far === 0) this.warned = this.cried = false;
        if (this.near > SPOT_AFTER) return this.finish(false, s.spotted);
        if (this.far > LOSE_AFTER) return this.finish(false, s.lost);
        if (this.pathI >= this.path.length) {
          if (d > s.lose) return this.finish(false, s.lost);
          if (s.rider) this.showRider(s.rider, ctx.vehicle);
          this.onSay(rider, s.arrived);
          this.next();
        }
        return;
      }
      case 'carry': {
        const item = s.item === 'box' ? this.box : s.item === 'bag' ? this.bag : this.garland;
        item.visible = true;
        if (ctx.vehicle) item.position.set(ctx.vehicle.x, ctx.vehicle.y + 1.25, ctx.vehicle.z);
        else item.position.set(ctx.hero.x + Math.sin(ctx.heroYaw) * 0.38, ctx.hero.y + 1.05, ctx.hero.z + Math.cos(ctx.heroYaw) * 0.38);
        item.rotation.y = ctx.heroYaw;
        if (ctx.jolt) {
          this.jolts++;
          if (s.maxJolts !== undefined && this.jolts <= s.maxJolts) this.onSay('', `💥 Paathu! (${this.jolts}/${s.maxJolts})`);
        }
        if ((s.maxJolts !== undefined && this.jolts > s.maxJolts) || (s.onFoot && ctx.vehicle)) return this.finish(false, s.broken ?? s.late);
        if (this.t > s.limit) return this.finish(false, s.late);
        if (this.dist(me, s.to) < ARRIVE_RADIUS) this.next();
        return;
      }
    }
  }

  // ---- steps ---------------------------------------------------------------------------------

  private enter(i: number) {
    this.step = i;
    this.t = 0;
    this.far = 0;
    this.jolts = 0;
    this.cried = false;
    this.warned = false;
    this.caught = false;
    this.near = 0;
    this.gap = -1;
    this.box.visible = this.garland.visible = this.bag.visible = false;
    this.dropCar();
    const s = this.cur;
    if (!s) return;
    if (s.kind === 'tail') {
      this.path = this.lanePath(route(s.from, s.to, X_LINES, Z_LINES));
      this.pathI = 1;
      this.car = new THREE.Group();
      carModel(this.car, s.colour);
      const [a, b] = this.path;
      this.car.position.set(a.x, 0, a.z);
      this.car.rotation.y = Math.atan2(b.x - a.x, b.z - a.z);
      this.scene.add(this.car);
      // The rider gets into your vehicle.
      if (s.rider) this.people.get(s.rider)!.root.visible = false;
    }
    if (s.kind === 'search') {
      const spot = s.spots[Math.floor(Math.random() * s.spots.length)];
      this.spawn(s.who, this.quest!.people[s.who], spot);
    }
    if (s.kind === 'chase') {
      const a = this.people.get(s.who)!;
      this.path = this.pavementPath(route({ x: a.root.position.x, z: a.root.position.z }, s.to, X_LINES, Z_LINES));
      this.pathI = 1;
    }
    for (const [who, line] of 'shout' in s && s.shout ? s.shout : []) this.onSay(who, line);
    const t = this.target;
    if (t) this.marker.show(t);
  }

  private next() {
    const q = this.quest!;
    if (this.step + 1 >= q.steps.length) {
      this.finish(true, q.success.replace('{reward}', q.reward.toLocaleString('en-IN')));
      return;
    }
    this.enter(this.step + 1);
  }

  private catch(a: Actor, s: Extract<Step, { kind: 'chase' }>) {
    this.caught = true;
    a.animator.play('fall', { once: true, fade: 0.1 });
    this.onSay(a.person.name, s.caught);
    this.next();
  }

  private finish(passed: boolean, line: string) {
    const q = this.quest!;
    this.onSay(passed ? '✅' : '❌', line);
    this.quest = null;
    this.marker.hide();
    this.box.visible = this.garland.visible = this.bag.visible = false;
    this.dropCar();
    for (const a of this.people.values()) a.root.visible = true;
    this.lingering = { actors: [...this.people.values()], t: LINGER };
    for (const a of this.people.values()) if (a.animator.currentName !== 'fall') a.animator.play('idle', { fade: 0.3 });
    this.people.clear();
    this.onDone(q.id, passed, passed ? q.reward : 0);
  }

  private clear() {
    for (const a of this.people.values()) a.root.removeFromParent();
    this.people.clear();
    this.marker.hide();
    this.dropCar();
  }

  private dropCar() {
    if (!this.car) return;
    this.car.removeFromParent();
    this.car.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
    this.car = null;
  }

  /** The tailed car drives along its path, slowing for turns. */
  private drive(car: THREE.Group, speed: number, dt: number) {
    if (this.pathI >= this.path.length) return;
    const goal = this.path[this.pathI];
    const p = car.position;
    const dx = goal.x - p.x;
    const dz = goal.z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 1) {
      this.pathI++;
      return;
    }
    const yaw = Math.atan2(dx, dz);
    const turn = Math.atan2(Math.sin(yaw - car.rotation.y), Math.cos(yaw - car.rotation.y));
    car.rotation.y += turn * Math.min(1, dt * 4);
    const v = speed * (d < 12 && this.pathI < this.path.length - 1 ? 0.55 : 1) * (Math.abs(turn) > 0.5 ? 0.5 : 1);
    const step = Math.min(d, v * dt);
    p.x += (dx / d) * step;
    p.z += (dz / d) * step;
  }

  /** A quest person steps out beside your vehicle. */
  private showRider(id: string, at: THREE.Vector3) {
    const a = this.people.get(id)!;
    a.root.visible = true;
    a.root.position.set(at.x + 1.6, this.groundY(at.x + 1.6, at.y + 1.5, at.z), at.z);
  }

  // ---- people --------------------------------------------------------------------------------

  private spawn(id: string, p: Person, at: Pt) {
    const ids = (Object.keys(NPC_MODELS) as NpcModelId[]).filter((m) => m !== 'police' && this.assets.has(m));
    const pool = p.look === 'woman' ? ids.filter((m) => this.assets.get(m)!.female) : p.look === 'man' ? ids.filter((m) => !this.assets.get(m)!.female) : ids;
    const model = (pool.length ? pool : ids)[hash(p.name) % (pool.length || ids.length)];
    const asset = this.assets.get(model)!;
    const body = cloneSkinned(asset.scene);
    const build = asset.mixamo ? varyLook(body, asset, p.name, !!asset.female) : 1;
    const root = new THREE.Group();
    root.add(body);
    const h = p.look === 'child' ? 1.0 : 1.6 + (hash(p.name) % 15) / 100;
    root.scale.setScalar(h / CHARACTER_HEIGHT);
    root.scale.x *= build;
    root.scale.z *= build;
    root.position.set(at.x, this.groundY(at.x, 3, at.z), at.z);
    body.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) o.castShadow = true;
    });
    this.scene.add(root);
    const animator = new Animator(body, asset.clips);
    animator.play('idle', { fade: 0 });
    const cs = asset.clipSpeed ?? { walk: 1.4, run: 4 };
    this.people.set(id, { person: { ...p, name: p.name }, root, animator, walk: cs.walk, run: cs.run });
  }

  private greet(a: Actor, hero: THREE.Vector3) {
    a.root.rotation.y = Math.atan2(hero.x - a.root.position.x, hero.z - a.root.position.z);
    if (a.animator.has('wave')) a.animator.play('wave', { once: true, then: 'idle', fade: 0.2 });
  }

  private face(a: Actor, p: THREE.Vector3, dt: number) {
    const yaw = Math.atan2(p.x - a.root.position.x, p.z - a.root.position.z);
    const d = Math.atan2(Math.sin(yaw - a.root.rotation.y), Math.cos(yaw - a.root.rotation.y));
    a.root.rotation.y += d * (1 - Math.exp(-4 * dt));
  }

  private idle(a: Actor) {
    if (a.animator.currentName !== 'idle' && a.animator.currentName !== 'wave') a.animator.play('idle', { fade: 0.3 });
  }

  /** Walk (or run, when far behind) after the hero, stopping a step away. */
  private follow(a: Actor, hero: THREE.Vector3, dt: number) {
    const p = a.root.position;
    const d = this.dist(p, hero);
    if (d < FOLLOW_GAP) return this.idle(a);
    const speed = d > 5 ? 4.2 : 1.6;
    const clip = speed > 2.5 ? 'run' : 'walk';
    this.move(a, hero, speed, clip, dt);
  }

  /** Run along the path. */
  private run(a: Actor, speed: number, dt: number) {
    if (this.pathI >= this.path.length) return;
    const goal = this.path[this.pathI];
    if (this.dist(a.root.position, goal) < 0.6) {
      this.pathI++;
      return;
    }
    this.move(a, goal, speed, 'run', dt);
  }

  private move(a: Actor, goal: Pt, speed: number, clip: 'walk' | 'run', dt: number) {
    const p = a.root.position;
    const dx = goal.x - p.x;
    const dz = goal.z - p.z;
    const d = Math.hypot(dx, dz) || 1;
    const step = Math.min(d, speed * dt);
    p.x += (dx / d) * step;
    p.z += (dz / d) * step;
    p.y += (this.groundY(p.x, p.y + 1.2, p.z) - p.y) * Math.min(1, dt * 12);
    a.root.rotation.y = Math.atan2(dx, dz);
    if (a.animator.currentName !== clip) a.animator.play(clip, { fade: 0.2 });
    a.animator.setSpeed(speed / (clip === 'run' ? a.run : a.walk));
  }

  /** Height of whatever is under (x, z), probing down from y. */
  private groundY(x: number, y: number, z: number) {
    this.ray.origin = { x, y, z };
    const hit = this.world.castRay(this.ray, y + 2, true, RAY_FLAGS);
    return hit ? y - hit.timeOfImpact : 0;
  }

  /** A road-centre route moved onto the pavement on the right of travel (runners keep off the traffic). */
  private pavementPath(pts: Pt[]): Pt[] {
    return this.offsetPath(pts, (half) => half + 1.2);
  }

  /** A road-centre route moved into the left-hand lane (Indian traffic keeps left). */
  private lanePath(pts: Pt[]): Pt[] {
    return this.offsetPath(pts, (half) => -Math.min(LANE, half - 1.5));
  }

  /** Each segment shifted sideways by off(road half-width) to the right of travel (negative = left). */
  private offsetPath(pts: Pt[], off: (half: number) => number): Pt[] {
    if (pts.length < 2) return pts;
    const segOff = (a: Pt, b: Pt) => {
      const dx = Math.sign(b.x - a.x);
      const dz = Math.sign(b.z - a.z);
      // Along x: the road is an east-west line z = a.z; along z: north-south x = a.x.
      const o = off(Math.abs(dx) > Math.abs(dz) ? roadHalf('x', a.z) : roadHalf('z', a.x));
      return { x: -dz * o, z: dx * o };
    };
    const out: Pt[] = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
      const o1 = segOff(pts[i - 1], pts[i]);
      const o2 = segOff(pts[i], pts[i + 1]);
      // Perpendicular turns: both offsets add; straight on: one of them.
      const same = Math.abs(o1.x - o2.x) < 1e-6 && Math.abs(o1.z - o2.z) < 1e-6;
      out.push({ x: pts[i].x + o1.x + (same ? 0 : o2.x), z: pts[i].z + o1.z + (same ? 0 : o2.z) });
    }
    out.push(pts[pts.length - 1]);
    return out;
  }

  private centre(ps: Pt[]) {
    return { x: ps.reduce((s, p) => s + p.x, 0) / ps.length, z: ps.reduce((s, p) => s + p.z, 0) / ps.length };
  }

  private dist(a: Pt, b: Pt) {
    return Math.hypot(a.x - b.x, a.z - b.z);
  }
}
