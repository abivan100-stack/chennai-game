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
export const LOSE_SECONDS = 20;
/** Driving a stolen vehicle this long after the warning escalates to 2 stars. */
export const KEEP_STOLEN_SECONDS = 15;

export class Wanted {
  level = 0;
  /** Seconds out of police sight (counts towards losing a star). */
  hidden = 0;

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
      case 'assaultPolice':
        this.level = MAX_STARS;
        break;
    }
    if (this.level > before) this.hidden = 0;
    return this.level;
  }

  /** seen: any police officer or car has eyes on the player this frame. */
  update(dt: number, seen: boolean) {
    if (this.level === 0) return;
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
  }
}
