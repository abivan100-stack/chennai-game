/**
 * Wanted level (0-3 stars), GTA-style. Pure logic (no three.js) so scripts/check.ts can test it.
 *
 *   1 star  - a warning: police come to arrest you (no shooting).
 *   2 stars - police shoot on sight.
 *   3 stars - police shoot, more aggressively (hit chance up).
 * Distance from the police drops stars one by one (see ESCAPE_STEP).
 */
export type Crime = 'theft' | 'keepStolen' | 'assault' | 'assaultPolice';

export const MAX_STARS = 3;
/**
 * Getting away, star by star: every ESCAPE_STEP metres between you and the nearest police jeep /
 * officer takes one star off (130 m: max 2, 260 m: max 1, 390 m: clear). Each drop needs you
 * to stay past that ring for DROP_SECONDS, one star at a time.
 */
export const ESCAPE_STEP = 130;
export const DROP_SECONDS = 1;
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

  /** Most stars you can still have this far (m) from the nearest police. */
  static allowedAt(dist: number) {
    return Math.max(0, MAX_STARS - Math.floor(dist / ESCAPE_STEP));
  }

  /** dist: metres to the nearest police jeep / officer (Infinity if none are out). */
  update(dt: number, dist: number) {
    if (this.level === 0) return;
    if (dist < ESCAPE_STEP) this.spotted = true;
    // Until they've reached you the police are on their way: stars stay (unless they search in vain too long).
    if (!this.spotted) {
      this.searching += dt;
      if (this.searching < SEARCH_SECONDS) return;
      dist = Infinity;
    }
    if (Wanted.allowedAt(dist) < this.level) {
      this.hidden += dt;
      if (this.hidden >= DROP_SECONDS) {
        this.level--;
        this.hidden = 0;
      }
    } else this.hidden = 0;
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
