/**
 * Chapter 2 story missions: special auto rides handed out one at a time on the phone (they
 * show up in Orders with a 📖). Each is a ride from one stop to another with its own rules.
 * Pure data + the pass / fail judge (scripts/check.ts tests it); missions/jobs.ts runs them.
 */

import { QUESTS, type Quest } from './quests.ts';

export interface StoryMission {
  id: string;
  title: string;
  passenger: string;
  from: string; // stop names (missions/data.ts STOPS)
  to: string;
  /** A detour revealed `viaAfter` s into the ride: stop there for `viaWait` s, then go on. */
  via?: string;
  viaAfter?: number;
  /** Time allowed = the usual limit for the whole trip x tight (no clock if absent). */
  tight?: number;
  /** Most hard jolts (sudden braking / crashes) the passenger will put up with. */
  maxBumps?: number;
  /** Most red lights you may jump. */
  maxReds?: number;
  /** Game hours [from, to) when it's offered (to < from wraps past midnight); any time if absent. */
  hours?: [number, number];
  /** Marigold garland on the auto for the ride. */
  garland?: boolean;
  reward: number;
  lines: {
    offer: string; // phone notification
    pickup: string;
    ride: string[];
    via?: string; // when the detour is revealed
    viaDone?: string;
    bump?: string[];
    red?: string;
    success: string; // {reward}
    fail: string; // {fare}
  };
}

export const VIA_WAIT = 5; // s parked at the detour stop

export const STORY_MISSIONS: StoryMission[] = [
  {
    id: 'kalyanam',
    title: 'Kalyanam Rush',
    passenger: 'Mappillai Ramesh + Mama',
    from: 'Alwarpet signal',
    to: 'Kapaleeshwarar Temple',
    tight: 0.85,
    garland: true,
    reward: 1500,
    lines: {
      offer: '📖 Kalyanam rush! Mappillai stuck at Alwarpet signal, muhurtham at the temple. Seekiram!',
      pickup: 'Anna! Muhurtham 9:30-ku! Car breakdown aayiduchu, ponnu veetla ellarum wait pannuraanga! Malai potaachu, po po po!',
      ride: ['Mama: "Dei, thaali bag ennoda kitta dhaane irukku?" ... "Aama aama!"', 'Mappillai: Anna, signal-la nikkaadheenga please!', 'Mama: Indha auto dhaan namma kalyana car ippo. Malai-la paathu!'],
      success: 'Correct time! Mela thaalam sound kekkudhu! Indha ₹{reward}, kalyana saapadu-ku vaanga anna!',
      fail: 'Muhurtham thaandiduchu... paravaala, aiyar wait pannuvaaru. Indha ₹{fare}.',
    },
  },
  {
    id: 'labour',
    title: 'Prasava Vali',
    passenger: 'Kavitha (and her amma)',
    from: 'Mandaveli bus depot',
    to: 'Isabel Hospital',
    maxBumps: 1,
    maxReds: 0,
    reward: 2000,
    lines: {
      offer: '📖 Emergency! A pregnant lady at Mandaveli depot needs to get to Isabel Hospital. Gently!',
      pickup: 'Amma: Thambi, en ponnu-ku vali vandhuduchu! Hospital-ku... mella, aana seekiram!',
      ride: ['Kavitha: Aaaah... konjam mella anna...', 'Amma: Kanna, moochu vidu... inhale... exhale...', 'Amma: Kuzhi-la ellam vidaadheenga thambi!'],
      bump: ['Amma: AIYO! Mella-nu sonnen la!', 'Kavitha: Aaaah! Anna please...'],
      red: 'Amma: Signal-la nikkanum thambi, police pudicha innum late aagum!',
      success: 'Nurse: Correct time-la vandheenga! ... Amma (later): Paiyan porandhaan! Indha ₹{reward}, swami maadhiri vandheenga.',
      fail: 'Amma: Romba kashta paduthiteenga... seri, vandhaachu. Indha ₹{fare}.',
    },
  },
  {
    id: 'exam',
    title: 'Exam Day',
    passenger: 'Student Arjun',
    from: 'R.A. Puram',
    to: 'Presidency College',
    via: 'Venkatakrishna Road',
    viaAfter: 12,
    tight: 1.15,
    reward: 1200,
    lines: {
      offer: '📖 A student in R.A. Puram is late for his exam at Presidency College!',
      pickup: 'Anna, Presidency College! Exam 10 manikku, already late!',
      ride: ['Arjun: Formula ellam marandhudumo... E = mc... seri seri.', 'Arjun: Anna, shortcut theriyuma?'],
      via: 'AIYO! Hall ticket veetla marandhutten! Venkatakrishna Road-la en veedu, please anna!',
      viaDone: 'Kedachiduchu! Ippo college, full speed!',
      success: 'Bell adikkardhukku munnaadi vandhaachu! Thank you anna! Indha ₹{reward}, result vandhadhum treat!',
      fail: 'Late aayiduchu... sir ulla vidamaattaaru-nu nenaikkiren. Indha ₹{fare}.',
    },
  },
  {
    id: 'tourist',
    title: 'Foreign Tourist',
    passenger: 'Emma from Germany',
    from: 'Lighthouse',
    to: 'Kapaleeshwarar Temple',
    via: 'San Thome Basilica',
    viaAfter: 3,
    maxBumps: 3,
    reward: 1300,
    lines: {
      offer: '📖 A foreign tourist at the Lighthouse wants a heritage tour: Santhome Basilica, then Kapaleeshwarar Temple.',
      pickup: 'Vanakkam! (did I say it right?) I want to see the old Chennai. Can you show me?',
      ride: ['Emma: Is it always this... loud? I love it!', 'Emma: What is the white powder pattern in front of the houses? Kolam? Beautiful!', 'Emma: My guidebook says Mylapore is older than the city itself!'],
      via: 'Emma: Oh, the Basilica first please! They say Saint Thomas is buried there. Can we stop a moment?',
      viaDone: 'Emma: Wow. So white and calm inside. Now the big colourful temple!',
      bump: ['Emma: Whoa! Careful, my camera!', 'Emma: Ha, this is better than a roller coaster... but slower please?'],
      success: 'Emma: Danke! That gopuram with all the gods... unbelievable. ₹{reward}, and I will tell everyone about "Auto Anna"!',
      fail: 'Emma: Bit of a bumpy tour... but thank you. ₹{fare}.',
    },
  },
  {
    id: 'match',
    title: 'Match Night',
    passenger: 'Karthik + Dinesh (cricket fans)',
    from: 'Mylapore Tank bus stop',
    to: 'Chepauk Stadium',
    tight: 0.9,
    hours: [16, 19.5],
    reward: 1400,
    lines: {
      offer: '📖 Match night! Two cricket fans at the Mylapore Tank bus stop need to reach Chepauk before the toss!',
      pickup: 'Anna, Chepauk! Toss 7 manikku! Ticket ₹3,000 kuduthu vaangirukom, miss panna koodadhu!',
      ride: ['Karthik: Whistle podu! Whistle podu!', 'Dinesh: Dei, captain innaiku aaduvaara?', 'Karthik: Anna, stadium pakkam traffic jam aagum, munnaadiye poidunga!'],
      success: 'Toss-ku munnaadi vandhaachu! Anna, indha ₹{reward}, namma team jeichaa innum tharom!',
      fail: 'Toss mudinjiduchu... first over miss aayiduchu. Indha ₹{fare}.',
    },
  },
  {
    id: 'nurse',
    title: 'Night Shift',
    passenger: 'Sister Mercy',
    from: 'Isabel Hospital',
    to: 'Adyar signal',
    hours: [22, 4],
    maxBumps: 2,
    reward: 900,
    lines: {
      offer: '📖 Midnight passenger: a nurse finishing her night shift at Isabel Hospital needs a ride home to Adyar.',
      pickup: 'Thambi, Adyar pakkam... 14 mani neram duty. Mella ponga, konjam kann moodikiren.',
      ride: ['Mercy: Indha time-la auto kedaikaradhe kashtam, nalla velai neenga vandheenga.', 'Mercy: Adyar bridge pakkam oru vellai saree amma nippaanga-nu solluvaanga... nambaadheenga, kadhai dhaan. (laughs)', 'Mercy: Innaiku moonu delivery, onnu twins!'],
      bump: ['Mercy: Aiyo! Thookam pochu...', 'Mercy: Thambi, kuzhi paathu!'],
      success: 'Mercy: Romba nandri thambi. Indha ₹{reward}, night duty-la neenga dhaan en auto ippo! (She saves your number.)',
      fail: 'Mercy: Thookam varaama pochu... seri, indha ₹{fare}.',
    },
  },
];

/** Did the ride pass? */
export function judge(m: StoryMission, r: { onTime: boolean; bumps: number; reds: number }) {
  return r.onTime && r.bumps <= (m.maxBumps ?? Infinity) && r.reds <= (m.maxReds ?? Infinity);
}

/** The next ride not done yet (in order), or null when all are done. */
export function nextMission(done: readonly string[]) {
  return STORY_MISSIONS.find((m) => !done.includes(m.id)) ?? null;
}

/** Chapter 2's story missions in the order they come up: auto rides and quests (missions/quests.ts) mixed. */
export const STORY_ORDER = ['kalyanam', 'lostchild', 'labour', 'chain', 'exam', 'film', 'flowers', 'lostbag', 'tourist', 'follow', 'match', 'nurse'];

/** Chapter 3's story missions (Ganesh, the rival fleet): offered first from Chapter 3, then any Chapter 2 leftovers. */
export const GANESH_ORDER = ['tyres', 'tidel', 'complaint'];
/** Chapter 4's story missions (Anna Travels & Logistics): offered first from Chapter 4. */
export const LOGISTICS_ORDER = ['poach', 'firstload', 'staffbus'];

/** Is game hour `h` inside [from, to) (wrapping past midnight when to < from)? */
export const inHours = (h: number, [a, b]: [number, number]) => (a <= b ? h >= a && h < b : h >= a || h < b);

/**
 * The next story mission to hand out: a ride (phone order) or a quest (started straight away).
 * With `hour`, rides that only run at certain hours are skipped until their time comes.
 */
export function nextStory(done: readonly string[], hour?: number, chapter = 2): { ride: StoryMission } | { quest: Quest } | null {
  const fits = (i: string) => {
    const h = STORY_MISSIONS.find((m) => m.id === i)?.hours;
    return hour === undefined || !h || inHours(hour, h);
  };
  const order = chapter >= 4 ? [...LOGISTICS_ORDER, ...GANESH_ORDER, ...STORY_ORDER] : chapter >= 3 ? [...GANESH_ORDER, ...STORY_ORDER] : STORY_ORDER;
  const id = order.find((i) => !done.includes(i) && fits(i));
  if (!id) return null;
  const ride = STORY_MISSIONS.find((m) => m.id === id);
  if (ride) return { ride };
  const quest = QUESTS.find((q) => q.id === id);
  return quest ? { quest } : null;
}

/** A story mission's title (rides and quests). */
export const storyTitle = (id: string) => STORY_MISSIONS.find((m) => m.id === id)?.title ?? QUESTS.find((q) => q.id === id)?.title ?? id;
