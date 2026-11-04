import type { FoodItem } from '../world/food.ts';

/**
 * The shopping bag: bought once at a supermarket counter, holds BAG_SLOTS food items (groceries
 * paid at the counter, parcels from hotels and shops) to eat later anywhere. Pure logic
 * (scripts/check.ts tests it).
 */
export const BAG_PRICE = 80;
export const BAG_SLOTS = 6;

export class Bag {
  owned = false;
  items: FoodItem[] = [];

  get full() {
    return this.items.length >= BAG_SLOTS;
  }

  /** Put an item in. False if there's no bag or no room. */
  add(item: FoodItem) {
    if (!this.owned || this.full) return false;
    this.items.push({ ...item });
    return true;
  }

  /** Take item i out (to eat it). */
  take(i: number) {
    return this.items.splice(i, 1)[0] ?? null;
  }

  snapshot() {
    return { owned: this.owned, items: this.items.map((it) => ({ ...it })) };
  }

  restore(s: { owned: boolean; items: FoodItem[] }) {
    this.owned = s.owned;
    this.items = s.items.slice(0, BAG_SLOTS).map((it) => ({ ...it }));
  }
}
