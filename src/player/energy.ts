/** Hunger / energy: drains with activity, refilled by eating. At zero you start fainting. */

export const ENERGY_MAX = 100;
export const ENERGY_START = 80;
/** Energy per second by what you're doing (walking from full to empty takes ~18 minutes). */
export const DRAIN = { idle: 0.05, walk: 0.09, run: 0.22, drive: 0.06 } as const;
export const ATTACK_COST = 0.8; // per punch / swing / kick
export const LOW_BELOW = 25; // HUD warning
export const TIRED_BELOW = 12; // too weak to run
export const FAINT_DAMAGE = 2.5; // health per second while at zero energy

export type Activity = keyof typeof DRAIN;

export class Energy {
  value = ENERGY_START;

  /** Drain for this frame. Returns health damage (only when empty). */
  update(dt: number, activity: Activity) {
    this.value = Math.max(0, this.value - DRAIN[activity] * dt);
    return this.value <= 0 ? FAINT_DAMAGE * dt : 0;
  }

  spend(amount: number) {
    this.value = Math.max(0, this.value - amount);
  }

  eat(amount: number) {
    this.value = Math.min(ENERGY_MAX, this.value + amount);
  }

  get low() {
    return this.value < LOW_BELOW;
  }

  get tired() {
    return this.value < TIRED_BELOW;
  }
}
