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

/** Snack counters at the new places (world/places.ts): eaten standing, like a shop snack. */
export const PLACE_MENUS = {
  chai: {
    kind: 'shop', greet: 'Vaanga anna! Sooda tea, fresh bun.',
    items: [
      { name: 'Tea (chai)', price: 15, energy: 8, seconds: 4, color: '#c79a5b' },
      { name: 'Bun butter jam', price: 30, energy: 18, seconds: 5, color: '#e3b56b' },
      { name: 'Medhu vada', price: 15, energy: 12, seconds: 4, color: '#b9772f' },
      { name: 'Sukku malli coffee', price: 20, energy: 9, seconds: 4, color: '#7a4b26' },
    ],
  },
  fish: {
    kind: 'shop', greet: 'Fresh-aa vandha meen anna! Fry pannittu tharen.',
    items: [
      { name: 'Vanjiram fry', price: 120, energy: 40, seconds: 8, color: '#b5652b' },
      { name: 'Prawn fry', price: 100, energy: 32, seconds: 7, color: '#e07a3c' },
      { name: 'Nethili fry', price: 60, energy: 22, seconds: 6, color: '#c98a3c' },
    ],
  },
  seafood: {
    kind: 'shop', greet: 'Welcome! Today catch: seer fish, prawns, crab. Enna venum?',
    items: [
      { name: 'Seer fish tawa fry', price: 320, energy: 45, seconds: 8, color: '#b5652b' },
      { name: 'Prawn biryani', price: 280, energy: 60, seconds: 9, color: '#d9a441' },
      { name: 'Crab masala + appam', price: 360, energy: 55, seconds: 9, color: '#c0442a' },
      { name: 'Fresh lime soda', price: 70, energy: 8, seconds: 4, color: '#c8e6a0' },
    ],
  },
  biryani: {
    kind: 'shop', greet: 'Dum biryani ready sir! Chicken-a mutton-a?',
    items: [
      { name: 'Chicken dum biryani', price: 220, energy: 60, seconds: 9, color: '#d9a441' },
      { name: 'Mutton biryani', price: 310, energy: 65, seconds: 9, color: '#c8742a' },
      { name: 'Chicken 65', price: 180, energy: 35, seconds: 6, color: '#c0392b' },
      { name: 'Bread halwa', price: 90, energy: 20, seconds: 4, color: '#8d3b1f' },
    ],
  },
  chettinad: {
    kind: 'shop', greet: 'Vaanga! Chettinad meals, kaaram konjam jaasthi.',
    items: [
      { name: 'Chettinad meals', price: 240, energy: 65, seconds: 9, color: '#e0a040' },
      { name: 'Pepper chicken + parotta', price: 260, energy: 60, seconds: 8, color: '#7a3b1f' },
      { name: 'Kothu parotta', price: 160, energy: 45, seconds: 7, color: '#c98a3c' },
      { name: 'Paneer butter masala', price: 220, energy: 45, seconds: 7, color: '#e07a3c' },
    ],
  },
  icecream: {
    kind: 'shop', greet: 'Hi! Sundae, shake, kulfi, ellam irukku!',
    items: [
      { name: 'Hot chocolate fudge', price: 190, energy: 25, seconds: 5, color: '#5a3a22' },
      { name: 'Death by chocolate', price: 240, energy: 30, seconds: 6, color: '#3e2415' },
      { name: 'Mango milkshake', price: 140, energy: 22, seconds: 4, color: '#ffb300' },
      { name: 'Belgian waffle', price: 160, energy: 25, seconds: 5, color: '#d9a441' },
    ],
  },
  cafe: {
    kind: 'shop', greet: 'Hi! Welcome. Enna order pannuveenga? Filter coffee is our special.',
    items: [
      { name: 'Filter coffee (davara)', price: 40, energy: 10, seconds: 4, color: '#8a5a32' },
      { name: 'Cold brew', price: 160, energy: 12, seconds: 5, color: '#4a2c17' },
      { name: 'Paneer tikka sandwich', price: 190, energy: 35, seconds: 8, color: '#e8c27a' },
      { name: 'Chocolate brownie', price: 120, energy: 22, seconds: 5, color: '#5a3a22' },
    ],
  },
  fine: {
    kind: 'hotel', // sit down at a table in the hotel restaurant
    greet: 'Good evening sir, welcome! Chef recommends the Chettinad thali today.',
    items: [
      { name: 'Chettinad thali', price: 950, energy: 80, seconds: 10, color: '#c8742a' },
      { name: 'Dum biryani (mutton)', price: 780, energy: 70, seconds: 9, color: '#d9a441' },
      { name: 'Seafood platter', price: 1450, energy: 85, seconds: 10, color: '#e07a4a' },
      { name: 'Filter coffee, silver tumbler', price: 220, energy: 10, seconds: 4, color: '#8a5a32' },
    ],
  },
  bakery: {
    kind: 'shop', greet: 'Fresh-aa oven-la irundhu! Enna venum?',
    items: [
      { name: 'Butter croissant', price: 110, energy: 20, seconds: 5, color: '#e3b56b' },
      { name: 'Sourdough toast + filter coffee', price: 180, energy: 30, seconds: 7, color: '#d9a441' },
      { name: 'Banana walnut cake', price: 90, energy: 18, seconds: 4, color: '#c98a3c' },
      { name: 'Masala tea', price: 50, energy: 8, seconds: 4, color: '#c79a5b' },
    ],
  },
  dessert: {
    kind: 'shop', greet: 'Sweet-aa edhaavadhu? Rose milk, jigarthanda, kulfi, ellam iruku!',
    items: [
      { name: 'Rose milk', price: 40, energy: 12, seconds: 4, color: '#f8a5c2' },
      { name: 'Jigarthanda', price: 70, energy: 18, seconds: 5, color: '#c69c6d' },
      { name: 'Malai kulfi', price: 50, energy: 14, seconds: 4, color: '#f3e3b0' },
      { name: 'Falooda', price: 120, energy: 25, seconds: 6, color: '#ff8fab' },
    ],
  },
  fair: {
    kind: 'shop', greet: 'Sundal, bajji, ice cream! Fair-ku vandheenga, saapdunga!',
    items: [
      { name: 'Thengai maanga sundal', price: 30, energy: 15, seconds: 5, color: '#e6d27a' },
      { name: 'Milagai bajji', price: 40, energy: 20, seconds: 5, color: '#d08a2c' },
      { name: 'Cotton candy', price: 30, energy: 8, seconds: 4, color: '#f7a8c8' },
      { name: 'Kulfi', price: 35, energy: 10, seconds: 4, color: '#f3e3b0' },
    ],
  },
} satisfies Record<string, Menu>;

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
  'Kapali Bakery': {
    kind: 'shop',
    greet: 'Puff ippo dhaan vandhuchu, sooda irukku!',
    items: [
      { name: 'Veg puff', price: 25, energy: 16, seconds: 4, color: '#e0a85a' },
      { name: 'Egg puff', price: 30, energy: 18, seconds: 4, color: '#e8b45e' },
      { name: 'Plum cake', price: 50, energy: 25, seconds: 5, color: '#5d3a1a' },
      { name: 'Tea', price: 15, energy: 6, seconds: 4, color: '#c8955a' },
    ],
  },
};

/** Supermarket shelves (world/supermarket.ts): pick into the basket, pay at the counter. */
export interface Shelf {
  name: string;
  items: FoodItem[];
}
export const SHELVES: Shelf[] = [
  {
    name: 'Biscuits & snacks',
    items: [
      { name: 'Biscuit packet', price: 20, energy: 14, seconds: 5, color: '#d9572b' },
      { name: 'Chips', price: 20, energy: 12, seconds: 4, color: '#f7e27a' },
      { name: 'Murukku', price: 30, energy: 18, seconds: 5, color: '#c99a4a' },
      { name: 'Chocolate', price: 40, energy: 15, seconds: 3, color: '#4e2a14' },
    ],
  },
  {
    name: 'Fruits',
    items: [
      { name: 'Banana', price: 10, energy: 10, seconds: 4, color: '#f2d43a' },
      { name: 'Apple', price: 30, energy: 14, seconds: 5, color: '#c62828' },
      { name: 'Guava', price: 20, energy: 12, seconds: 4, color: '#9ccc65' },
    ],
  },
  {
    name: 'Bakery',
    items: [
      { name: 'Bread & jam', price: 45, energy: 28, seconds: 6, color: '#e9c89a' },
      { name: 'Veg puff', price: 25, energy: 16, seconds: 4, color: '#e0a85a' },
      { name: 'Plum cake', price: 50, energy: 25, seconds: 5, color: '#5d3a1a' },
    ],
  },
  {
    name: 'Cold drinks',
    items: [
      { name: 'Mango juice', price: 35, energy: 15, seconds: 4, color: '#f59e1b' },
      { name: 'Rose milk', price: 30, energy: 14, seconds: 4, color: '#f48fb1' },
      { name: 'Buttermilk', price: 15, energy: 8, seconds: 3, color: '#f5f5f0' },
      { name: 'Water bottle', price: 20, energy: 5, seconds: 3, color: '#90caf9' },
    ],
  },
];
export const BASKET_MAX = 3;
export const CASHIER = 'Cashier';
export const CASHIER_HELLO = 'Vanakkam sir! Basket-la podunga, counter-la pay pannunga.';
export const CASHIER_THANKS = 'Thank you sir, marubadi vaanga!';
export const SHOPLIFT_LINE = 'Dei! Kaasu kudukkaama poriya?! Thirudan, thirudan! Police!';
export const BASKET_FULL = 'Basket full anna. Mudhalla pay pannunga.';
/** The shopping bag (player/bag.ts). */
export const BAG_LINES = {
  bought: 'Idho, thuni pai (cloth bag)! Snacks, parcel ellam ithula vechikalaam. (B - open the bag)',
  packed: '{n} item(s) bag-la vechaachu. Pasikkum bodhu B adichu saapdunga.',
  fullEat: 'Bag full aayiduchu, meedhi ippove saapdunga!',
  parcel: '{item} parcel ready! Bag-la vechaachu. ₹{price}',
  full: 'Bag-la idam illa anna! Mudhalla edhaavadhu saapdunga.',
  noBag: "Parcel-ku pai venum anna. Kapali Supermarket counter-la thuni pai vaangunga (₹{price}).",
  empty: 'Bag kaali. Supermarket / hotel-la parcel vaangi vechukonga.',
};

export const NO_MONEY = 'Kaasu illaiye anna... sambadhichitu vaanga.';
export const MEAL_DONE = 'Saapdu semma! Vayiru full.';
