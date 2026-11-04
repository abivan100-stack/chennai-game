/**
 * Wanted level (0-3 stars), GTA-style. Pure logic (no three.js) so scripts/check.ts can test it.
 *
 *   1 star  - a warning: police come to arrest you (no shooting).
 *   2 stars - police shoot on sight.
 *   3 stars - police shoot, more aggressively (hit chance up).
 * Leave the search circle (SEARCH_RADIUS) and the police give up.
 */
export type Crime = 'theft' | 'keepStolen' | 'assault' | 'assaultPolice';

export const MAX_STARS = 3;
/**
 * Getting away: a search circle on the map, centred on where the police last had you (it moves
 * with you while a unit is within SIGHT_DIST). Get outside it and they give up the chase.
 * Its radius grows with the stars.
 */
export const SEARCH_RADIUS = [0, 150, 200, 250]; // m, by stars
export const SIGHT_DIST = 60;
/** Driving a stolen vehicle this long after the warning escalates to 2 stars. */
export const KEEP_STOLEN_SECONDS = 15;

export class Wanted {
  level = 0;
  /** Seconds out of police sight (counts towards losing a star). */
  hidden = 0;
  /** The search circle's centre (where they last had you). */
  cx = 0;
  cz = 0;

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
    if (this.level > before) this.hidden = 0;
    return this.level;
  }

  /** The circle's radius now (0 = not wanted). */
  get radius() {
    return SEARCH_RADIUS[this.level];
  }

  /** Centre the search on (x, z): the crime scene, or wherever the police can see you. */
  seenAt(x: number, z: number) {
    this.cx = x;
    this.cz = z;
  }

  /**
   * (x, z): you. copDist: metres to the nearest police unit. Close police keep the circle on you;
   * outside the circle they give up. Returns true the moment they give up.
   */
  update(_dt: number, x: number, z: number, copDist: number) {
    if (this.level === 0) return false;
    if (copDist < SIGHT_DIST) this.seenAt(x, z);
    if (Math.hypot(x - this.cx, z - this.cz) <= this.radius) return false;
    this.clear();
    return true;
  }

  get shootOnSight() {
    return this.level >= 2;
  }

  clear() {
    this.level = 0;
    this.hidden = 0;
  }
}
