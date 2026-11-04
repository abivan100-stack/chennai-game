import { STORY_ORDER } from './storyMissions.ts';

/**
 * The story, chapter by chapter (see CLAUDE.md "Story roadmap"). Pure logic (no DOM / three.js)
 * so scripts/check.ts can test it: which chapter you're in, its goals, and when it's finished.
 * Goals are worked out from a snapshot of the game, so nothing has to be "ticked" by hand.
 */

export interface StoryState {
  loan: number;
  rides: number;
  cash: number;
  savings: number;
  homesBought: number; // homes owned beyond the rented one
  storyRides: number; // story missions passed (missions/storyMissions.ts)
  seshadri: boolean; // returned Seshadri sir's lost bag (story mission 'lostbag')
  fleet: number; // autos in Anna Travels (missions/fleet.ts)
  fleetEarned: number; // what the fleet has paid you so far
}

export interface Goal {
  text: string;
  done: (s: StoryState) => boolean;
  /** Optional progress line, e.g. "₹4,500 left". */
  progress?: (s: StoryState) => string;
}

export interface Chapter {
  n: number;
  title: string;
  ta: string;
  blurb: string;
  goals: Goal[];
  /** Finishing these goals ends the chapter (the rest are optional). */
  needed: number[];
}

const rupees = (n: number) => `₹${Math.max(0, Math.round(n)).toLocaleString('en-IN')}`;

export const CHAPTERS: Chapter[] = [
  {
    n: 1,
    title: "Chithappa's Auto",
    ta: 'சித்தப்பாவின் ஆட்டோ',
    blurb: "Chithappa left you his old auto, and his ₹5,000 kadan to Kandasamy. ₹500 a day, or the auto goes.",
    goals: [
      { text: 'Pay off the kadan to Kandasamy', done: (s) => s.loan <= 0, progress: (s) => `${rupees(s.loan)} left` },
      { text: 'Give your first 10 rides', done: (s) => s.rides >= 10, progress: (s) => `${Math.min(s.rides, 10)}/10` },
    ],
    needed: [0],
  },
  {
    n: 2,
    title: 'Sondha Kaal',
    ta: 'சொந்தக் கால்',
    blurb: 'The auto is yours now, the RC book in your pocket. Every rupee you earn is yours. Time to stand on your own feet.',
    goals: [
      { text: 'Save ₹10,000 in the bank', done: (s) => s.savings >= 10000, progress: (s) => `${rupees(s.savings)} / ₹10,000` },
      { text: 'Buy your own home', done: (s) => s.homesBought > 0 },
      { text: 'Give 25 rides', done: (s) => s.rides >= 25, progress: (s) => `${Math.min(s.rides, 25)}/25` },
      { text: 'Story missions (Phone > Orders / messages)', done: (s) => s.storyRides >= STORY_ORDER.length, progress: (s) => `${Math.min(s.storyRides, STORY_ORDER.length)}/${STORY_ORDER.length}` },
      { text: "Return the lost bag to its owner (story)", done: (s) => s.seshadri },
    ],
    needed: [0, 1, 4],
  },
  {
    n: 3,
    title: 'Muthal Mudhalaali',
    ta: 'முதல் முதலாளி',
    blurb: "Seshadri sir backs you: Anna Travels is born. Buy autos, hire drivers, keep them honest. And watch out for Kandasamy's nephew Ganesh.",
    goals: [
      { text: 'Run 3 autos in Anna Travels (Phone > Business)', done: (s) => s.fleet >= 3, progress: (s) => `${Math.min(s.fleet, 3)}/3` },
      { text: 'Earn ₹10,000 from the fleet', done: (s) => s.fleetEarned >= 10000, progress: (s) => `${rupees(s.fleetEarned)} / ₹10,000` },
      { text: 'Save ₹25,000 in the bank', done: (s) => s.savings >= 25000, progress: (s) => `${rupees(s.savings)} / ₹25,000` },
    ],
    needed: [0, 1, 2],
  },
  {
    n: 4,
    title: 'Anna Travels & Logistics',
    ta: 'அண்ணா டிராவல்ஸ்',
    blurb: 'Coming soon: cabs, delivery vans, a staff bus contract, and new districts.', // no goals = not built: chapter 3 waits
    goals: [],
    needed: [],
  },
];

export class Story {
  chapter = 1;

  constructor(saved?: { chapter: number }) {
    if (saved) this.chapter = Math.min(Math.max(1, saved.chapter), CHAPTERS.length);
    while (this.chapter > 1 && !this.current.goals.length) this.chapter--; // not built yet: the last chapter that is
  }

  get current() {
    return CHAPTERS[this.chapter - 1];
  }

  /**
   * Move on if the current chapter's needed goals are done. Returns the new chapter (to show its
   * card), or null. A finished last chapter stays put.
   */
  update(s: StoryState): Chapter | null {
    const c = this.current;
    if (!c.needed.length || this.chapter >= CHAPTERS.length) return null;
    if (!CHAPTERS[this.chapter].goals.length) return null; // the next chapter isn't built yet: wait here
    if (!c.needed.every((i) => c.goals[i].done(s))) return null;
    this.chapter++;
    return this.current;
  }

  snapshot() {
    return { chapter: this.chapter };
  }
}
