import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { CharacterAsset, NpcModelId } from '../characters/catalog';
import { ROAD_HALF, SETBACK, SIDEWALK_HEIGHT, block } from '../world/layout';
import { BUMPED, DRIVE_BUMPED } from './dialogue';
import { Npc, type NpcOptions } from './npc';

/** NPCs farther than this from the player are frozen (no animation, no movement). */
const ACTIVE_RADIUS = 40;
/** ...and beyond this they aren't drawn at all. */
const DRAW_RADIUS = 90;
/** At most this many people drawn at once (nearest first): each costs a draw call + a shadow. */
const MAX_DRAWN = 24;
/** ...and only the nearest few cast a shadow. */
const MAX_SHADOWS = 10;
/** How close (m) the player must be to talk (E). */
const TALK_RADIUS = 2.2;
/** Bumping: centre distance (m) and minimum speed (m/s), on foot and in the auto. */
const BUMP = { foot: { dist: 0.9, speed: 3 }, auto: { dist: 1.9, speed: 1.5 } };

// Two lanes on each 2.5 m sidewalk, measured out from the building line:
// one nearer the road (A), one nearer the shops (B, clear of verandahs and the gopuram steps).
const LANE_A = SETBACK - (ROAD_HALF + 0.7);
const LANE_B = 1.1;
const y = SIDEWALK_HEIGHT;
const v = (x: number, z: number) => new THREE.Vector3(x, y, z);

/** Loop round the sidewalks of block (i, j) (grid indices from layout.blocks()). */
function blockLoop(i: number, j: number, lane: number, reverse = false) {
  const b = block(i, j);
  const loop = [v(b.x0 - lane, b.z0 - lane), v(b.x1 + lane, b.z0 - lane), v(b.x1 + lane, b.z1 + lane), v(b.x0 - lane, b.z1 + lane)];
  return reverse ? loop.reverse() : loop;
}

/**
 * A pedestrian: walks round block (i, j) at a lane offset, or round its own `loop` of [x, z]
 * points (beaches, temple courts). `hours`: when they're out ([from, to] in IST hours, may wrap
 * past midnight); by default the streets empty out late at night.
 */
type Spawn = Omit<NpcOptions, 'path' | 'position'> & {
  model: NpcModelId; block?: [number, number]; lane?: number; reverse?: boolean; start: number;
  loop?: [number, number][]; y?: number; hours?: [number, number][];
};
const DAYTIME: [number, number][] = [[5.5, 23.5]];
const inHours = (h: number, ranges: [number, number][]) => ranges.some(([a, b]) => (a <= b ? h >= a && h < b : h >= a || h < b));

// Blocks: temple = [2, 2], tank = [1, 2]; [3, 2] is across East Mada Street, etc.
/**
 * The crowd: devotees circling the temple (pradakshinam), walkers round the tank and the
 * shopping blocks. `start` = how far along the loop (0..1) they begin.
 */
const SPAWNS: Spawn[] = [
  { name: 'Murugan anna', model: 'man-farmer', block: [2, 2], lane: LANE_B, start: 0.05, height: 1.66 },
  { name: 'Lakshmi akka', model: 'woman-formal', block: [2, 2], lane: LANE_A, start: 0.3, height: 1.6 },
  { name: 'Meena madam', model: 'woman-suit', block: [2, 2], lane: LANE_B, start: 0.55, height: 1.62 },
  { name: 'Raman', model: 'man-farmer', block: [2, 2], lane: LANE_A, start: 0.8, height: 1.64, tint: 0xe0d8c0 },
  { name: 'Kavitha', model: 'woman-casual', block: [1, 2], lane: LANE_B, reverse: true, start: 0.1, height: 1.58 },
  { name: 'Arun', model: 'man-casual', block: [1, 2], lane: LANE_A, start: 0.6, pace: 'run', height: 1.7 },
  { name: 'Selvam', model: 'man-worker', block: [3, 2], lane: LANE_A, start: 0.75, height: 1.72 },
  { name: 'Divya', model: 'woman-formal', block: [3, 2], lane: LANE_B, reverse: true, start: 0.2, height: 1.6, tint: 0xd0e8ff },
  { name: 'Ravi', model: 'man-casual', block: [2, 1], lane: LANE_A, start: 0.4, height: 1.75, tint: 0xd8c8b0 },
  { name: 'Kumar', model: 'man-worker', block: [2, 3], lane: LANE_B, reverse: true, start: 0.6, height: 1.68, tint: 0xb8c8e0 },
  { name: 'Priya', model: 'woman-casual', block: [3, 3], lane: LANE_A, start: 0.55, height: 1.6, tint: 0xffd0d0 },
  { name: 'Babu', model: 'man-worker', block: [3, 1], lane: LANE_B, reverse: true, start: 0.85, height: 1.7, tint: 0xf0d0a0 },
  // Santhome: pilgrims round the basilica block, shoppers either side of it.
  { name: 'Mary aunty', model: 'woman-formal', block: [4, 2], lane: LANE_B, start: 0.15, height: 1.58, tint: 0xf5f5f5 },
  { name: 'Joseph', model: 'man-casual', block: [4, 2], lane: LANE_A, reverse: true, start: 0.6, height: 1.72 },
  { name: 'Fathima', model: 'woman-casual', block: [4, 1], lane: LANE_A, start: 0.4, height: 1.6, tint: 0xd1c4e9 },
  { name: 'Dhanush', model: 'man-worker', block: [4, 3], lane: LANE_B, start: 0.7, height: 1.68 },
  // Mandaveli
  { name: 'Sundari paati', model: 'woman-formal', block: [1, 5], lane: LANE_B, start: 0.3, height: 1.55, tint: 0xffe0b2 },
  { name: 'Ganesan', model: 'man-farmer', block: [3, 5], lane: LANE_A, reverse: true, start: 0.5, height: 1.66 },
  { name: 'Keerthana', model: 'woman-casual', block: [2, 4], lane: LANE_A, start: 0.8, height: 1.6, tint: 0xb2dfdb },
  // Alwarpet / Teynampet
  { name: 'Srinivasan sir', model: 'man-casual', block: [-1, 1], lane: LANE_A, start: 0.2, height: 1.7, tint: 0xeeeeee },
  { name: 'Nithya', model: 'woman-suit', block: [-2, 2], lane: LANE_B, reverse: true, start: 0.5, height: 1.6 },
  { name: 'Imran', model: 'man-worker', block: [0, 1], lane: LANE_A, start: 0.7, height: 1.72 },
  // R.A. Puram / Adyar: evening walkers
  { name: 'Padma maami', model: 'woman-formal', block: [1, 6], lane: LANE_B, start: 0.35, height: 1.56, tint: 0xf8bbd0 },
  { name: 'Venkat', model: 'man-casual', block: [2, 7], lane: LANE_A, start: 0.6, pace: 'run', height: 1.74 },
  { name: 'Shalini', model: 'woman-casual', block: [3, 8], lane: LANE_A, reverse: true, start: 0.15, height: 1.6 },

  // ---- Crowds that come out at the right time of day ----
  // Kapaleeshwarar temple: morning and evening pooja.
  ...crowdOf(['Kamala paati', 'Seshadri', 'Gowri', 'Balu', 'Revathi', 'Ganapathy'], { block: [2, 2], lane: LANE_B, hours: [[6, 9.5], [17, 20.5]] }),
  // Vegetable market by the tank: early morning shoppers.
  ...crowdOf(['Saroja', 'Muthu', 'Valli', 'Anand'], { block: [1, 3], lane: LANE_A, hours: [[6, 11]] }),
  // Santhome beach: evening walkers on the sand (Marina-style crowd).
  ...crowdOf(['Ravi & family', 'Priya', 'Karthik', 'Nisha', 'Selvi akka'], { loop: [[146, -40], [178, -40], [178, 40], [146, 40]], y: 0.1, hours: [[16.5, 21]] }),
  // Elliot's Beach, Besant Nagar: the big evening crowd.
  ...crowdOf(['Arjun', 'Meera', 'Sanjay', 'Divya', 'Rohit', 'Lavanya', 'Hari', 'Ananya', 'Vikram', 'Sneha'], { loop: [[141, 395], [178, 395], [178, 585], [141, 585]], y: 0.1, hours: [[16.5, 21.5]] }),
  // Morning joggers on Elliot's Beach.
  ...crowdOf(['Jogger Ramesh', 'Jogger Kavya'], { loop: [[142, 380], [150, 380], [150, 595], [142, 595]], y: 0.11, hours: [[5.5, 8]], pace: 'run' }),
  // Besant Nagar food street: late evening.
  ...crowdOf(['Nikhil', 'Aishwarya', 'Farhan', 'Pooja'], { block: [4, 9], lane: LANE_B, hours: [[18, 23]] }),
  // Tidel Park: office-goers at shift change.
  ...crowdOf(['Techie Arun', 'Techie Swathi', 'Techie Manoj', 'Techie Deepa', 'Techie Kiran'], { block: [2, 9], lane: LANE_A, hours: [[8.5, 10], [17.5, 19.5]] }),
  // Vivekananda College: students before and after class.
  ...crowdOf(['Student Gokul', 'Student Janani', 'Student Ashwin', 'Student Fathima'], { block: [2, 0], lane: LANE_B, hours: [[8.5, 9.5], [15.5, 16.5]] }),
  // Kamadhenu Cinemas: crowds round the show times.
  ...crowdOf(['Rajini fan Senthil', 'Vijay fan Prakash', 'Moviegoer Latha'], { block: [3, 4], lane: LANE_A, hours: [[11.5, 12.5], [14.5, 15.5], [17.5, 18.5], [20.5, 21.5]] }),
  // Ashtalakshmi temple: evening devotees on the sand.
  ...crowdOf(['Bhavani', 'Krishnan'], { loop: [[154, 428], [184, 428], [184, 460], [154, 460]], y: 0.1, hours: [[17, 20.5]] }),
  // Nageswara Rao Park: morning and evening walkers on the path loop.
  ...crowdOf(['Walker Rangan', 'Walker Uma', 'Walker Sekar', 'Walker Jaya', 'Walker Mani'], { loop: [[-59, -119], [-36, -119], [-36, -81], [-59, -81]], y: 0.05, hours: [[5.5, 9], [17, 20]] }),
  // San Thome Basilica: mass-goers.
  ...crowdOf(['Agnes', 'Thomas', 'Rosy'], { block: [4, 2], lane: LANE_A, hours: [[6, 9], [17, 19.5]] }),
  // Santhome fish market: before sunrise to mid-morning.
  ...crowdOf(['Fisherman Kuppan', 'Meen vikkira Amma', 'Hotel buyer Raju', 'Selvi'], { loop: [[146, 58], [160, 58], [160, 78], [146, 78]], y: 0.11, hours: [[5, 9.5]] }),
  // Santhome beach fair: evening families.
  ...crowdOf(['Family Suresh', 'Kutty Anu', 'Family Banu', 'Kutty Vishal', 'Balloon buyer Ravi', 'Couple Arun', 'Couple Divya'], { loop: [[148, 104], [182, 104], [182, 134], [148, 134]], y: 0.1, hours: [[17, 22]] }),
  // Late-night tea at the auto stand.
  ...crowdOf(['Auto driver Pandi', 'Night watchman', 'Auto driver Babu'], { block: [1, 3], lane: LANE_B, hours: [[21, 1.5]] }),
  // Anna Salai / Teynampet shoppers and office crowd.
  ...crowdOf(['Shopper Latha', 'Clerk Mohan', 'Shopper Ayesha', 'Sales Ravi'], { block: [-2, 2], lane: LANE_A, hours: [[9.5, 21.5]] }),
  ...crowdOf(['Shopper Geetha', 'Peon Kannan', 'Shopper Rekha'], { block: [-2, 4], lane: LANE_B, hours: [[9.5, 21.5]] }),
  // TTK Road / Alwarpet.
  ...crowdOf(['Sabha rasika Mami', 'Cafe-goer Tara', 'Musician Hari'], { block: [-1, 2], lane: LANE_A, hours: [[8, 22]] }),
  // Mandaveli streets.
  ...crowdOf(['Milkman Velu', 'School kid Abi', 'Ammini', 'Tailor Bashir'], { block: [1, 4], lane: LANE_B, hours: [[6.5, 21]] }),
  ...crowdOf(['Kolam paati', 'Vendor Murugesan', 'Nurse Joyce'], { block: [3, 5], lane: LANE_A, hours: [[6.5, 21]] }),
  // R.A. Puram: evening walkers.
  ...crowdOf(['Retired Iyer', 'Lakshmi mami', 'Dog walker Neha'], { block: [2, 6], lane: LANE_B, hours: [[6, 8], [17, 20]] }),
  // Adyar Main Road shoppers.
  ...crowdOf(['Shopper Kala', 'Student Rahul', 'Bank clerk Mary', 'Shopper Vinod'], { block: [1, 9], lane: LANE_A, hours: [[9, 22]] }),
  // Taramani office streets.
  ...crowdOf(['Techie Sharmila', 'Techie Naveen', 'Delivery boy Imran'], { block: [3, 9], lane: LANE_B, hours: [[8, 20.5]] }),
  // Velachery gated community residents.
  ...crowdOf(['Resident Anand', 'Resident Kavitha', 'Watchman Gurkha', 'Resident Sid'], { block: [-2, 10], lane: LANE_A, hours: [[6, 9], [16.5, 21.5]] }),
  // Beach events: the music night audience, a beach cricket game, kite flyers.
  ...crowdOf(['Fan Deepak', 'Fan Swetha', 'Fan Karthi', 'Fan Monisha', 'Fan Ajay', 'Fan Ritu', 'Fan Gautham', 'Fan Leela'], { loop: [[152, 592], [162, 592], [162, 608], [152, 608]], y: 0.1, hours: [[18, 22]] }),
  ...crowdOf(['Batsman Dinesh', 'Bowler Vicky', 'Fielder Sam', 'Fielder Bala', 'Keeper Ashok'], { loop: [[155, 196], [166, 196], [166, 224], [155, 224]], y: 0.1, hours: [[15, 18]], pace: 'run' }),
  ...crowdOf(['Kite flyer Raja', 'Kite flyer Pavithra', 'Kite flyer Sundar'], { loop: [[150, -130], [172, -130], [172, -100], [150, -100]], y: 0.1, hours: [[15, 18.5]] }),
  // Luz Church Road shoppers.
  ...crowdOf(['Shopper Indira', 'Flower seller Ponni'], { block: [1, 1], lane: LANE_B, hours: [[7, 21]] }),
];

/** A group of people sharing a route and hours, spread out along it, with varied looks. */
function crowdOf(names: string[], o: Pick<Spawn, 'block' | 'lane' | 'loop' | 'y' | 'hours' | 'pace'>): Spawn[] {
  const models: NpcModelId[] = ['woman-casual', 'man-casual', 'woman-formal', 'man-worker', 'woman-suit', 'man-farmer'];
  // Colour variants so the same six models don't look like twins in a crowd.
  const tints = [undefined, 0xd0e8ff, 0xffd0d0, 0xe0f0d0, 0xf0e0c0, 0xe8d0f0, 0xffe0b2, 0xc8e6c9, 0xbbdefb, 0xf8bbd0, 0xd7ccc8, 0xfff59d];
  return names.map((name, i) => ({
    ...o,
    name,
    model: models[(name.length + i) % models.length],
    start: (i + 0.5) / names.length,
    reverse: i % 2 === 1,
    height: 1.55 + ((name.length * 7 + i * 3) % 20) / 100,
    tint: tints[(i + name.length) % tints.length],
  }));
}

/** Point a fraction `t` of the way round a closed loop. */
function along(loop: THREE.Vector3[], t: number) {
  const lens = loop.map((p, i) => p.distanceTo(loop[(i + 1) % loop.length]));
  let d = t * lens.reduce((a, b) => a + b, 0);
  for (let i = 0; i < loop.length; i++) {
    if (d <= lens[i]) return loop[i].clone().lerp(loop[(i + 1) % loop.length], d / lens[i]);
    d -= lens[i];
  }
  return loop[0].clone();
}

export class Crowd {
  readonly npcs: Npc[];
  /** NPCs updated last frame (shown in the F3 panel). */
  activeCount = 0;
  /** Damage NPCs fighting back dealt to the player this frame. */
  damageToPlayer = 0;
  /** Closest NPC the player can talk to right now, or null. */
  nearest: Npc | null = null;
  /** Called when an NPC says something on its own (e.g. after being bumped). */
  onSay: (name: string, line: string) => void = () => {};

  constructor(scene: THREE.Scene, world: RAPIER.World, assets: Map<NpcModelId, CharacterAsset>) {
    this.npcs = SPAWNS.map((s) => {
      const yy = s.y ?? y;
      const custom = s.loop?.map(([x, z]) => new THREE.Vector3(x, yy, z));
      const path = custom ? (s.reverse ? custom.reverse() : custom) : blockLoop(s.block![0], s.block![1], s.lane ?? LANE_A, s.reverse);
      return new Npc(scene, world, assets.get(s.model)!, { ...s, path, position: along(path, s.start) });
    });
    this.hours = SPAWNS.map((s) => s.hours ?? DAYTIME);
    this.present = SPAWNS.map(() => true);
    this.dist = new Float32Array(SPAWNS.length).fill(Infinity);
    this.order = SPAWNS.map((_, i) => i);
  }

  private readonly dist: Float32Array;
  private readonly order: number[];

  private readonly hours: [number, number][][];
  private readonly present: boolean[];

  /** inAuto: the player is driving (bigger bump radius, different complaints, no chatting). */
  /** hour: IST game hour (0-24); NPCs only come out during their hours. */
  update(dt: number, playerPos: THREE.Vector3, playerSpeed: number, inAuto: boolean, hour = 12) {
    this.activeCount = 0;
    this.damageToPlayer = 0;
    this.nearest = null;
    let nearestDist = TALK_RADIUS;
    const bump = inAuto ? BUMP.auto : BUMP.foot;
    for (const [i, npc] of this.npcs.entries()) {
      const out = inHours(hour, this.hours[i]);
      if (out !== this.present[i]) {
        this.present[i] = out;
        npc.setPresent(out);
      }
      if (!out) {
        this.dist[i] = Infinity;
        continue;
      }
      const p = npc.root.position;
      const dist = Math.hypot(p.x - playerPos.x, p.z - playerPos.z);
      const active = dist < ACTIVE_RADIUS;
      this.dist[i] = dist < DRAW_RADIUS ? dist : Infinity; // drawn-or-not decided below
      if (active) this.activeCount++;
      this.damageToPlayer += npc.update(dt, active, playerPos);

      if (!inAuto && dist < nearestDist && npc.canTalk) {
        nearestDist = dist;
        this.nearest = npc;
      }
      if (dist < bump.dist && playerSpeed > bump.speed) {
        const line = npc.scold(inAuto ? DRIVE_BUMPED : BUMPED);
        if (line) this.onSay(npc.name, line);
      }
    }
    // Draw only the nearest MAX_DRAWN (within DRAW_RADIUS); the rest are too far to notice.
    for (let i = 0; i < this.order.length; i++) this.order[i] = i;
    this.order.sort((a, b) => this.dist[a] - this.dist[b]);
    this.order.forEach((idx, rank) => {
      const npc = this.npcs[idx];
      npc.root.visible = this.present[idx] && rank < MAX_DRAWN && this.dist[idx] !== Infinity;
      npc.setShadow(rank < MAX_SHADOWS);
    });
  }
}
