/**
 * Rent on the Mandaveli house (Chapter 2 onwards): RENT every RENT_EVERY game days to the house
 * owner. Unpaid weeks pile up; EVICT_AFTER unpaid weeks and you're locked out until you clear
 * them. Buying a home of your own ends it. Pure logic (scripts/check.ts tests it).
 */
export const RENT = 1000;
export const RENT_EVERY = 7; // game days
export const EVICT_AFTER = 3; // unpaid weeks

export type RentEvent = 'reminder' | 'due' | 'missed' | 'evicted' | null;

export class Rent {
  active = false;
  /** Game day the next week's rent falls due. */
  dueDay = 0;
  /** Unpaid rent so far. */
  owed = 0;
  evicted = false;
  /** Last day tick() saw (so each day is handled once). */
  private seen: number | null = null;

  /** Start renting: the first week is due RENT_EVERY days from `day`. */
  start(day: number) {
    if (this.active) return;
    this.active = true;
    this.dueDay = day + RENT_EVERY;
    this.seen = day;
  }

  /** You own a home now: no more rent (and nothing owed is chased any more). */
  stop() {
    this.active = false;
    this.owed = 0;
    this.evicted = false;
  }

  get unpaidWeeks() {
    return Math.ceil(this.owed / RENT);
  }

  /** Call with the current game day; returns what happened on a new day (at most one event). */
  tick(day: number): RentEvent {
    if (!this.active) return null;
    if (this.seen === null) this.seen = day;
    if (day === this.seen) return null;
    this.seen = day;
    let ev: RentEvent = null;
    while (day >= this.dueDay) {
      const late = this.owed > 0;
      this.owed += RENT;
      this.dueDay += RENT_EVERY;
      ev = late ? 'missed' : 'due';
      if (this.unpaidWeeks >= EVICT_AFTER && !this.evicted) {
        this.evicted = true;
        ev = 'evicted';
      }
    }
    if (!ev && this.dueDay - day === 1) ev = 'reminder';
    return ev;
  }

  /** Pay up to `cash` towards what's owed (or next week's rent in advance if nothing is). Returns the amount paid. */
  pay(cash: number) {
    const want = this.owed > 0 ? this.owed : RENT;
    const n = Math.max(0, Math.min(cash, want));
    if (this.owed > 0) this.owed -= n;
    else if (n === RENT) {
      this.dueDay += RENT_EVERY; // paid a week ahead
    } else return 0;
    if (this.owed <= 0) this.evicted = false;
    return n;
  }

  snapshot() {
    const { active, dueDay, owed, evicted } = this;
    return { active, dueDay, owed, evicted };
  }

  restore(s: ReturnType<Rent['snapshot']>) {
    Object.assign(this, s);
  }
}
