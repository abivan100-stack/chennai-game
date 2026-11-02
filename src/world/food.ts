/**
 * What each eatery sells (pure data, checked). Keyed by the shop's signboard name.
 * hotel = sit at a table and eat off a banana leaf; shop = buy a snack and eat it standing.
 */

export type EateryKind = 'hotel' | 'shop';

export interface FoodItem {
  name: string;
  price: number; // ₹
  energy: number; // added over the meal
  seconds: number; // how long it takes to eat
  color: string; // the food on the leaf / in the hand
}

export interface Menu {
  kind: EateryKind;
  greet: string; // the owner, when you walk up
  items: FoodItem[];
}

export const MENUS: Record<string, Menu> = {
  'Mylai Tiffin Centre': {
    kind: 'hotel',
    greet: 'Vaanga anna, ukkaarunga! Enna saapdreenga?',
    items: [
      { name: 'Idli vada', price: 40, energy: 25, seconds: 7, color: '#f4f1e6' },
      { name: 'Masala dosa', price: 60, energy: 35, seconds: 9, color: '#d9a441' },
      { name: 'Pongal', price: 50, energy: 30, seconds: 8, color: '#efd9a0' },
      { name: 'Filter coffee', price: 20, energy: 8, seconds: 4, color: '#8a5a32' },
    ],
  },
  'Anna Mess': {
    kind: 'hotel',
    greet: 'Saapadu ready anna! Ilai pottudren.',
    items: [
      { name: 'Full meals (saapadu)', price: 90, energy: 60, seconds: 13, color: '#f2e9d0' },
      { name: 'Curd rice', price: 50, energy: 30, seconds: 8, color: '#fbfaf3' },
      { name: 'Parotta salna', price: 70, energy: 45, seconds: 10, color: '#c98a3c' },
    ],
  },
  'Hotel Mylai Bhavan': {
    kind: 'hotel',
    greet: 'Vanakkam! Table free-a irukku, ukkaarunga.',
    items: [
      { name: 'Mini tiffin', price: 80, energy: 50, seconds: 11, color: '#f0e2c0' },
      { name: 'Ghee roast', price: 90, energy: 45, seconds: 10, color: '#e0a83c' },
      { name: 'Lemon rice', price: 50, energy: 30, seconds: 8, color: '#f3d23a' },
      { name: 'Filter coffee', price: 25, energy: 8, seconds: 4, color: '#8a5a32' },
    ],
  },
  'Kapali Tea Stall': {
    kind: 'shop',
    greet: 'Tea podava anna? Vada sudaa irukku!',
    items: [
      { name: 'Tea', price: 15, energy: 6, seconds: 4, color: '#c8955a' },
      { name: 'Medu vada', price: 15, energy: 10, seconds: 4, color: '#b8742a' },
      { name: 'Bun butter jam', price: 30, energy: 18, seconds: 5, color: '#e8c48a' },
    ],
  },
  'Sri Vinayaga Stores': {
    kind: 'shop',
    greet: 'Enna venum anna?',
    items: [
      { name: 'Banana', price: 10, energy: 10, seconds: 4, color: '#f2d43a' },
      { name: 'Biscuit packet', price: 20, energy: 14, seconds: 5, color: '#d9572b' },
      { name: 'Murukku', price: 30, energy: 18, seconds: 5, color: '#c99a4a' },
    ],
  },
  'Kapali Supermarket': {
    kind: 'shop',
    greet: 'Welcome sir! Offer-la juice irukku.',
    items: [
      { name: 'Bread & jam', price: 45, energy: 28, seconds: 6, color: '#e9c89a' },
      { name: 'Banana bunch', price: 40, energy: 30, seconds: 7, color: '#f2d43a' },
      { name: 'Mango juice', price: 35, energy: 15, seconds: 4, color: '#f59e1b' },
      { name: 'Chips', price: 20, energy: 12, seconds: 4, color: '#f7e27a' },
    ],
  },
};

export const NO_MONEY = 'Kaasu illaiye anna... sambadhichitu vaanga.';
export const MEAL_DONE = 'Saapdu semma! Vayiru full.';
