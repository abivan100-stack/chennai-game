/**
 * Anna Travels (Chapter 3): autos you own that hired drivers run for you. Each game day every
 * auto with a driver earns a day's takings; the driver keeps DRIVER_SHARE and you get the rest
 * (into the bank). Drivers have a trait that trades income for trouble: no-shows, police fines,
 * breakdowns. Once the fleet grows, Ganesh (Kandasamy's nephew, the rival fleet) makes trouble.
 * Pure logic: `rand` can be passed in so scripts/check.ts can test it.
 */

export type Trait = 'honest' | 'fast' | 'lazy';

export interface Driver {
  id: string;
  name: string;
  trait: Trait;
  blurb: string;
}

export const FLEET_AUTO_PRICE = 8000;
export const DRIVER_SHARE = 0.5;
/** A day's takings per trait, and the chance of each kind of trouble. */
export const TRAITS: Record<Trait, { takings: number; noShow: number; fine: number; breakdown: number; label: string }> = {
  honest: { takings: 1800, noShow: 0.05, fine: 0.02, breakdown: 0.05, label: 'Honest: steady, careful' },
  fast: { takings: 2500, noShow: 0.05, fine: 0.2, breakdown: 0.12, label: 'Fast: earns more, collects fines + dents' },
  lazy: { takings: 1100, noShow: 0.25, fine: 0.05, breakdown: 0.05, label: 'Lazy: cheap to keep, often missing' },
};
export const FINE = 300;
export const REPAIR = 800;
/** Ganesh starts making trouble once you run this many autos; chance per day. */
export const RIVAL_FROM = 2;
export const RIVAL_CHANCE = 0.12;
export const RIVAL_COST = 500;
/** The Tidel staff contract (story mission 'tidel') lifts every driver's takings. */
export const CONTRACT_BONUS = 1.2;

export const DRIVERS: Driver[] = [
  { id: 'murugan', name: 'Murugan', trait: 'honest', blurb: '20 years on Mylapore roads. Never misses a day.' },
  { id: 'selvam', name: 'Selvam', trait: 'fast', blurb: 'Knows every shortcut. Also every traffic police.' },
  { id: 'babu', name: 'Babu', trait: 'lazy', blurb: 'Nice fellow. Sleeps till 10.' },
  { id: 'jaya', name: 'Jayalakshmi', trait: 'honest', blurb: 'The first woman auto driver at the stand. Regulars love her.' },
  { id: 'rocky', name: 'Rocky Raja', trait: 'fast', blurb: 'Drives like a film chase. Passengers tip, police fine.' },
  { id: 'kumar', name: 'Kumar', trait: 'lazy', blurb: 'Says he is on the way. He is not on the way.' },
];

export interface FleetAuto {
  driver: string | null;
}

export interface DayReport {
  income: number; // to you, after the drivers' share and costs (can be negative)
  lines: string[];
}

const driver = (id: string) => DRIVERS.find((d) => d.id === id)!;
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export class Fleet {
  autos: FleetAuto[] = [];
  /** Everything the fleet has paid you so far. */
  earned = 0;
  /** Last game day settled (each day is settled once). */
  private seen: number | null = null;
  /** Won the Tidel contract: takings x CONTRACT_BONUS. */
  contract = false;
  /** Ganesh warned off by the police (story mission 'complaint'): no more slashed tyres. */
  peace = false;

  get hired() {
    return this.autos.filter((a) => a.driver).map((a) => a.driver!);
  }

  /** Drivers you could still hire. */
  get candidates() {
    return DRIVERS.filter((d) => !this.hired.includes(d.id));
  }

  buy() {
    this.autos.push({ driver: null });
  }

  hire(i: number, id: string) {
    if (!this.autos[i] || this.hired.includes(id) || !DRIVERS.some((d) => d.id === id)) return false;
    this.autos[i].driver = id;
    return true;
  }

  fire(i: number) {
    if (this.autos[i]) this.autos[i].driver = null;
  }

  /** Start counting days from `day` (call once the business opens). */
  open(day: number) {
    if (this.seen === null) this.seen = day;
  }

  /** New game day: settle every day since the last one. Null if nothing to settle. */
  tick(day: number, rand: () => number = Math.random): DayReport | null {
    if (this.seen === null || day <= this.seen) return null;
    const out: DayReport = { income: 0, lines: [] };
    for (let d = this.seen + 1; d <= day; d++) {
      const r = this.settle(rand);
      out.income += r.income;
      out.lines.push(...r.lines);
    }
    this.seen = day;
    this.earned += Math.max(0, out.income);
    return out;
  }

  private settle(rand: () => number): DayReport {
    const r: DayReport = { income: 0, lines: [] };
    const rival = !this.peace && this.autos.length >= RIVAL_FROM && rand() < RIVAL_CHANCE;
    this.autos.forEach((a, i) => {
      if (!a.driver) return;
      const dr = driver(a.driver);
      const t = TRAITS[dr.trait];
      if (rival && i === 0) {
        r.income -= RIVAL_COST;
        r.lines.push(`🔪 Ganesh's men slashed the tyres on ${dr.name}'s auto. No takings today, ${rupees(RIVAL_COST)} for new tyres.`);
        return;
      }
      if (rand() < t.noShow) {
        r.lines.push(`😴 ${dr.name} didn't turn up today.`);
        return;
      }
      let net = t.takings * (this.contract ? CONTRACT_BONUS : 1) * (0.8 + rand() * 0.4) * (1 - DRIVER_SHARE);
      let note = '';
      if (rand() < t.fine) {
        net -= FINE;
        note += ` Police fine ${rupees(FINE)}.`;
      }
      if (rand() < t.breakdown) {
        net -= REPAIR;
        note += ` Breakdown, repair ${rupees(REPAIR)}.`;
      }
      r.income += net;
      r.lines.push(`🛺 ${dr.name}: ${rupees(net)} to you.${note}`);
    });
    r.income = Math.round(r.income);
    return r;
  }

  snapshot() {
    return { autos: this.autos.map((a) => ({ ...a })), earned: this.earned, seen: this.seen, contract: this.contract, peace: this.peace };
  }

  restore(s: { autos: FleetAuto[]; earned: number; seen: number | null; contract?: boolean; peace?: boolean }) {
    this.autos = s.autos.map((a) => ({ driver: a.driver && DRIVERS.some((d) => d.id === a.driver) ? a.driver : null }));
    this.earned = s.earned;
    this.seen = s.seen;
    this.contract = !!s.contract;
    this.peace = !!s.peace;
  }
}
