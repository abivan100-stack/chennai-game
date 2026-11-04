/**
 * Chapter 2: your own vehicles. Auto upgrades sold at every mechanic, and the second-hand
 * vehicle dealer's stock on R.K. Mutt Road. Pure data + the effect maths (scripts/check.ts).
 */

export type UpgradeId = 'cng' | 'music' | 'meter' | 'seats' | 'sticker';

export const UPGRADES: { id: UpgradeId; name: string; price: number; note: string }[] = [
  { id: 'cng', name: 'CNG kit', price: 1500, note: 'fuel 40% cheaper' },
  { id: 'music', name: 'Music system', price: 1000, note: 'fares +10% (passengers love it)' },
  { id: 'meter', name: 'Digital fare meter', price: 600, note: 'fares +10% (no haggling)' },
  { id: 'seats', name: 'Soft seat covers', price: 400, note: 'passengers mind bumps less' },
  { id: 'sticker', name: '"Amma Appa Aasirvadham" sticker', price: 150, note: 'every Chennai auto needs one' },
];

/** Paint jobs for the auto (body colour); yellow is how Chithappa kept it. */
export const PAINTS: { name: string; colour: number }[] = [
  { name: 'Classic yellow', colour: 0xf5c400 },
  { name: 'Leaf green', colour: 0x2e9e4f },
  { name: 'Sky blue', colour: 0x3a8fd6 },
  { name: 'Mango orange', colour: 0xf08a1c },
];
export const PAINT_PRICE = 1500;

/** Petrol price multiplier (CNG is cheaper to run). */
export const fuelFactor = (has: readonly string[]) => (has.includes('cng') ? 0.6 : 1);
/** Fare multiplier from the upgrades. */
export const fareFactor = (has: readonly string[]) => 1 + (has.includes('music') ? 0.1 : 0) + (has.includes('meter') ? 0.1 : 0);
/** m/s lost in one frame that a passenger counts as a bump (seat covers soften it). */
export const bumpDecel = (has: readonly string[]) => (has.includes('seats') ? 5 : 3.5);

/** The dealer's stock: each item can be bought once. kind = traffic vehicle kind. */
export const DEALER_STOCK: { id: string; kind: 'scooter' | 'bike' | 'van' | 'taxi'; name: string; colour: number; price: number }[] = [
  { id: 'scooter', kind: 'scooter', name: 'Scooter (2016, one owner)', colour: 0x90caf9, price: 6000 },
  { id: 'bike', kind: 'bike', name: 'Motorbike (150 cc)', colour: 0x212121, price: 8000 },
  { id: 'van', kind: 'van', name: 'Omni-style van', colour: 0xfafafa, price: 15000 },
  { id: 'taxi', kind: 'taxi', name: 'Ambassador-style taxi', colour: 0xf4f1e6, price: 25000 },
];
export const DELIVER_HOME = 150; // ₹ to have an owned vehicle brought to your house
