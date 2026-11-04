/**
 * Wanted level (0-3 stars), GTA-style. Pure logic (no three.js) so scripts/check.ts can test it.
 *
 *   1 star  - a warning: police come to arrest you (no shooting).
 *   2 stars - police shoot on sight.
 *   3 stars - police shoot, more aggressively (hit chance up).
 * Out of police sight for LOSE_SECONDS drops one star at a time.
 */
export type Crime = 'theft' | 'keepStolen' | 'assault' | 'assaultPolice';

export const MAX_STARS = 3;
export const LOSE_SECONDS = 10; // per star, out of sight once they've found you: 3 stars gone in ~30 s
/** The police haven't found you yet: they keep looking this long before giving up. */
export const SEARCH_SECONDS = 45;
/** Driving a stolen vehicle this long after the warning escalates to 2 stars. */
export const KEEP_STOLEN_SECONDS = 15;

export class Wanted {
  level = 0;
  /** Seconds out of police sight (counts towards losing a star). */
  hidden = 0;
  /** The police have had eyes on you since the stars went up (stars only fade after that). */
  spotted = false;
  private searching = 0;

  /** Report a crime. Returns the new level. */
  report(crime: Crime) {
    const before = this.level;
    switch (crime) {
      case 'theft':
        this.level = Math.max(this.level, 1);
        break;
      case 'keepStolen':
        this.level = Math.max(this.level, 2);
        break;
      case 'assault':
        this.level = Math.min(MAX_STARS, Math.max(1, this.level + 1));
        break;
      case 'assaultPolice': // +1 star, at least 2 (they shoot from a distance now)
        this.level = Math.min(MAX_STARS, Math.max(2, this.level + 1));
        break;
    }
    if (this.level > before) {
      this.hidden = 0;
      this.spotted = false;
      this.searching = 0;
    }
    return this.level;
  }

  /** seen: any police officer or car has eyes on the player this frame. */
  update(dt: number, seen: boolean) {
    if (this.level === 0) return;
    if (seen) this.spotted = true;
    // Until they've found you the police are on their way: stars don't fade (unless they search in vain too long).
    if (!this.spotted) {
      this.searching += dt;
      if (this.searching < SEARCH_SECONDS) return;
    }
    this.hidden = seen ? 0 : this.hidden + dt;
    if (this.hidden >= LOSE_SECONDS) {
      this.level--;
      this.hidden = 0;
    }
  }

  get shootOnSight() {
    return this.level >= 2;
  }

  clear() {
    this.level = 0;
    this.hidden = 0;
    this.spotted = false;
    this.searching = 0;
  }
}
