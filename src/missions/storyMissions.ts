/**
 * Chapter 2 story missions: special auto rides handed out one at a time on the phone (they
 * show up in Orders with a 📖). Each is a ride from one stop to another with its own rules.
 * Pure data + the pass / fail judge (scripts/check.ts tests it); missions/jobs.ts runs them.
 */

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
];

/** Did the ride pass? */
export function judge(m: StoryMission, r: { onTime: boolean; bumps: number; reds: number }) {
  return r.onTime && r.bumps <= (m.maxBumps ?? Infinity) && r.reds <= (m.maxReds ?? Infinity);
}

/** The next mission not done yet (in order), or null when all are done. */
export function nextMission(done: readonly string[]) {
  return STORY_MISSIONS.find((m) => !done.includes(m.id)) ?? null;
}
