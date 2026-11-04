/**
 * Sleep: game hours since you last slept. Past TIRED_AFTER you're drowsy (no running, slower,
 * hungrier); at COLLAPSE_AFTER you drop and wake up at the hospital. Sleeping in a bed (or the
 * hospital stay) resets it. Pure logic (scripts/check.ts tests it).
 */
export const TIRED_AFTER = 18; // game hours awake
export const COLLAPSE_AFTER = 24;
export const HOSPITAL_SLEEP = 8; // game hours you sleep in the hospital after collapsing

export type SleepEvent = 'tired' | 'collapse' | null;

export class Sleep {
  awake = 0; // game hours since the last sleep
  private warned = false;

  get tired() {
    return this.awake >= TIRED_AFTER;
  }

  /** Add `hours` awake; returns 'tired' once when you get drowsy, 'collapse' when you drop. */
  add(hours: number): SleepEvent {
    this.awake += hours;
    if (this.awake >= COLLAPSE_AFTER) return 'collapse';
    if (this.tired && !this.warned) {
      this.warned = true;
      return 'tired';
    }
    return null;
  }

  /** Slept (bed or hospital). */
  rest() {
    this.awake = 0;
    this.warned = false;
  }
}
