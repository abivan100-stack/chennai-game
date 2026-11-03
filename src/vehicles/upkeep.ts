/**
 * Uncle's auto: petrol in the tank and how battered it is. Pure logic (no three.js) so
 * scripts/check.ts can test it. Driving burns petrol; crashes (a sudden loss of speed) dent it.
 * An empty tank stops the engine (push it to a bunk); a wrecked auto only crawls.
 */
export const TANK = 6; // litres
export const LITRES_PER_KM = 1.2; // a town's worth of driving per tank
export const PETROL_PRICE = 105; // ₹ per litre
export const REPAIR_PRICE = 12; // ₹ per point of damage
export const CRASH_DV = 3; // m/s lost in one physics step that counts as a crash
export const CRASH_DAMAGE = 7; // condition points per m/s over CRASH_DV
export const EMPTY_CRAWL = 0; // empty tank: the engine won't go, you push it (G)
export const WRECK_CRAWL = 0.35; // ...and when the auto is nearly wrecked

export class Upkeep {
  fuel = TANK;
  /** 100 = like new, 0 = wreck. */
  condition = 100;

  /** Burn petrol for `metres` driven. */
  drive(metres: number) {
    this.fuel = Math.max(0, this.fuel - (metres / 1000) * LITRES_PER_KM);
  }

  /** Speed lost in one step (m/s). Returns the damage done (0 if it wasn't a crash). */
  crash(speedLost: number) {
    if (speedLost <= CRASH_DV) return 0;
    const dmg = Math.min(this.condition, Math.round((speedLost - CRASH_DV) * CRASH_DAMAGE) + 2);
    this.condition -= dmg;
    return dmg;
  }

  /** Top-speed multiplier: full when fuelled and healthy, crawling when empty or wrecked. */
  get speedFactor() {
    if (this.fuel <= 0) return EMPTY_CRAWL;
    if (this.condition < 15) return WRECK_CRAWL;
    if (this.condition < 40) return 0.7;
    return 1;
  }

  /** Litres a given amount of money buys (capped by the space in the tank). */
  litresFor(money: number, price = PETROL_PRICE) {
    return Math.min(TANK - this.fuel, money / price);
  }

  fill(litres: number) {
    this.fuel = Math.min(TANK, this.fuel + litres);
  }

  get repairCost() {
    return Math.ceil(100 - this.condition) * REPAIR_PRICE;
  }

  /** Fix `points` of damage (all of it by default). Returns the cost of that much. */
  repair(points = 100) {
    const fixed = Math.min(points, 100 - this.condition);
    this.condition += fixed;
    return Math.ceil(fixed) * REPAIR_PRICE;
  }
}
