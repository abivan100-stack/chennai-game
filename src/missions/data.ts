/**
 * Fare data: stops, passenger names and their Tanglish lines. Pure data (no three.js), so
 * writers can edit it freely and scripts/check.ts can test the fare maths.
 */

/** A stop at the kerb of a named road. `line` = road centre line; side = which kerb (+1 / -1). */
export interface Stop {
  name: string;
  axis: 'x' | 'z'; // road runs north-south at x = line ('x'), or east-west at z = line ('z')
  line: number;
  along: number;
  side: 1 | -1;
}

export const STAND = 'Mylapore auto stand';
export const CINEMA = 'Kamadhenu Cinemas';
export const COLLEGE = 'Vivekananda College';
/** Game hours when classes start / end: students want autos (ride orders from the college). */
export const COLLEGE_RUSH = [9, 16];
export const TIDEL = 'Tidel Park';
export const STADIUM = 'Chepauk Stadium';
/** Office hours at Tidel Park: IT folks want autos to the MRTS and home. */
export const TIDEL_RUSH = [9, 18, 19];

export const STOPS: Stop[] = [
  { name: 'Kapaleeshwarar Temple', axis: 'x', line: 25, along: 8, side: -1 },
  { name: 'Mylapore Tank bus stop', axis: 'x', line: -70, along: 0, side: 1 },
  { name: 'Luz Corner', axis: 'z', line: -70, along: -58, side: 1 },
  { name: 'North Mada Street flower market', axis: 'z', line: -25, along: 5, side: 1 },
  { name: 'South Mada Street silk shop', axis: 'z', line: 25, along: -8, side: -1 },
  { name: 'Kutchery Road', axis: 'z', line: 70, along: 15, side: -1 },
  { name: 'San Thome High Road', axis: 'x', line: 70, along: 35, side: -1 },
  { name: 'R.K. Mutt Road junction', axis: 'x', line: -70, along: 55, side: 1 },
  // Santhome
  { name: 'San Thome Basilica', axis: 'x', line: 70, along: -5, side: 1 },
  { name: 'Santhome Beach', axis: 'x', line: 125, along: 10, side: 1 },
  { name: 'Lighthouse', axis: 'x', line: 125, along: -72, side: 1 },
  { name: 'Santhome fish market', axis: 'x', line: 125, along: 55, side: 1 },
  { name: 'Isabel Hospital', axis: 'z', line: -70, along: 45, side: 1 },
  // Mandaveli
  { name: 'Mandaveli bus depot', axis: 'z', line: 125, along: 0, side: 1 },
  { name: 'Mandaveli MRTS station', axis: 'x', line: -70, along: 160, side: -1 },
  { name: 'Thirumayilai MRTS station', axis: 'x', line: -70, along: 5, side: -1 },
  { name: 'Venkatakrishna Road', axis: 'z', line: 125, along: -50, side: -1 },
  // Neighbourhood places (world/places.ts)
  { name: 'Luz Church', axis: 'z', line: -70, along: -40, side: 1 },
  { name: 'Nageswara Rao Park', axis: 'z', line: -70, along: -52, side: -1 },
  { name: 'Mylapore vegetable market', axis: 'z', line: 25, along: -55, side: 1 },
  { name: STAND, axis: 'z', line: 25, along: -38, side: 1 },
  { name: CINEMA, axis: 'z', line: 70, along: 47, side: 1 },
  { name: 'Santhome beach fair', axis: 'x', line: 125, along: 112, side: 1 },
  // North, Alwarpet / Teynampet, R.A. Puram / Adyar
  { name: COLLEGE, axis: 'z', line: -70, along: 0, side: -1 },
  { name: 'Dr. Radhakrishnan Salai', axis: 'z', line: -130, along: 40, side: 1 },
  { name: 'Alwarpet TTK Road', axis: 'x', line: -145, along: -40, side: 1 },
  { name: 'Alwarpet signal', axis: 'x', line: -145, along: 100, side: -1 },
  { name: 'Eldams Road', axis: 'x', line: -205, along: 45, side: 1 },
  { name: 'Teynampet signal', axis: 'x', line: -265, along: -45, side: 1 },
  { name: 'Anna Salai bus stop', axis: 'x', line: -265, along: 150, side: 1 },
  { name: 'R.A. Puram', axis: 'z', line: 240, along: -48, side: 1 },
  { name: 'Madras Boat Club', axis: 'z', line: 300, along: 47.5, side: 1 },
  { name: 'Greenways Road', axis: 'z', line: 300, along: -170, side: -1 },
  { name: 'Adyar Banyan Campus', axis: 'z', line: 390, along: 0, side: -1 },
  { name: 'Adyar signal', axis: 'z', line: 390, along: 70, side: -1 },
  // Landmarks (world/landmarks.ts)
  { name: 'Music Academy', axis: 'x', line: -145, along: -108, side: -1 },
  { name: 'Narada Gana Sabha', axis: 'x', line: -145, along: 43, side: -1 },
  { name: 'Semmozhi Poonga', axis: 'x', line: -265, along: -100, side: 1 },
  { name: 'Teynampet Metro', axis: 'x', line: -265, along: 0, side: 1 },
  { name: 'Ramakrishna Math', axis: 'x', line: -70, along: 145, side: 1 },
  { name: 'Vivekanandar Illam', axis: 'x', line: 125, along: -148, side: -1 },
  { name: 'Ambedkar Manimandapam', axis: 'z', line: 300, along: -175, side: -1 },
  { name: 'Tholkappia Poonga', axis: 'z', line: 300, along: 97, side: -1 },
  // Taramani
  { name: TIDEL, axis: 'z', line: 480, along: 0, side: -1 },
  { name: 'Taramani Road', axis: 'z', line: 480, along: -110, side: 1 },
  // Perungudi
  { name: 'Grand Lake Residences', axis: 'x', line: -265, along: 540, side: 1 },
  { name: 'Perungudi Main Road', axis: 'z', line: 600, along: -48, side: -1 },
  // Cafes
  { name: 'Kaapi Kottai, TTK Road', axis: 'x', line: -145, along: -50, side: -1 },
  { name: 'Kadal Cafe, Beach Road', axis: 'x', line: 125, along: 42, side: -1 },
  { name: 'Byte & Brew, Taramani', axis: 'z', line: 480, along: 48, side: -1 },
  // Triplicane / Chepauk / Marina
  { name: STADIUM, axis: 'x', line: 125, along: -265, side: -1 },
  { name: 'Presidency College', axis: 'x', line: 125, along: -195, side: -1 },
  { name: 'Marina Beach', axis: 'x', line: 125, along: -255, side: 1 },
  { name: 'Chepauk MRTS station', axis: 'x', line: -70, along: -265, side: -1 },
  { name: 'Triplicane', axis: 'z', line: -310, along: 0, side: 1 },
  // Besant Nagar
  { name: "Elliot's Beach", axis: 'x', line: 125, along: 478, side: 1 },
  { name: 'Ashtalakshmi Temple', axis: 'x', line: 125, along: 443, side: 1 },
  { name: 'Velankanni Church', axis: 'x', line: 125, along: 515, side: -1 },
  { name: 'Besant Nagar food street', axis: 'x', line: 125, along: 420, side: -1 },
];
export const HOSPITAL = 'Isabel Hospital';

// ---- Places: petrol bunk, mechanic, bank, pharmacy, auto stand, cinema --------------------
export const PLACE_LINES = {
  bunkGreet: 'Petrol podanuma anna? Evlo-ku?',
  bunkFull: 'Tank full-aa irukku anna!',
  filled: '{litres} litre podiyachu. ₹{cost}. Nalla poitu vaanga!',
  mechGreet: 'Enna anna, auto-va nallaa adichutteenga pola. Paakalaam!',
  mechFine: 'Auto super condition-la irukku anna, onnum venaam.',
  repaired: 'Ready anna! Pudhusu maadhiri odum.',
  bankGreet: 'Balance ₹{savings}. Bank-la vecha kaasu safe!',
  deposited: '₹{n} bank-la pottaachu.',
  withdrew: '₹{n} eduthaachu.',
  noSavings: 'Account-la kaasu illa anna.',
  pharmaGreet: 'Enna venum anna? Udambu paathukonga.',
  healed: '{item} saapteenga. Konjam better-aa irukku.',
  standGreet: 'Stand-la line-la nikkiravanga irukaanga. Sawaari venuma?',
  standBusy: 'Ippo oru sawaari irukke anna, adha mudinga first.',
  standRide: '{name} ungalukkaaga wait pannuraanga, stand kitta!',
  showOver: '🎬 Show mudinjiduchu! Kamadhenu Cinemas-la sawaari waiting.',
  tidelRush: '💻 Tidel Park shift mudinjiduchu! IT makkal auto-ku wait pannuraanga.',
  matchNight: '🏏 Chepauk-la innaiku night match! Floodlights on, full crowd.',
  matchOver: '🏏 Match mudinjiduchu! Chepauk gate-la crowd auto-ku wait pannuraanga.',
  musicNight: "🎶 Elliot's Beach-la music night start aachu! Live band, kites, dessert carts - vaanga!",
  collegeRush: '🎓 College rush! Vivekananda College-la students auto-ku wait pannuraanga.',
  lowFuel: 'Petrol kammiyaa irukku! Phone > Map > Petrol: pakkathula bunk-ku vazhi kaattum.',
  noFuel: 'Petrol theernthuduchu! F-la irangi G-la thallunga. Phone > Map > Petrol: pakkathula bunk.',
  crash: 'Dei! Auto-ku adi pattuchu! (condition {cond}%)',
  wrecked: 'Auto romba damage! Mechanic kitta kaattunga (R.K. Mutt Road).',
  pickpocket: ' Mayakkathula pocket-la irundha ₹{n} kaanom!',
};
/** Share of pocket cash lost when you're knocked out on the street (the bank is safe). */
export const PICKPOCKET_SHARE = 0.25;
/** Game hours when a show lets out at the cinema (new ride orders from there). */
export const SHOW_ENDS = [12, 15, 18, 21];
export const PHARMACY = [
  { name: 'Paracetamol + ORS', price: 30, health: 20, energy: 5 },
  { name: 'Glucose drink', price: 40, health: 8, energy: 25 },
  { name: 'First-aid kit', price: 150, health: 60, energy: 0 },
];

// ---- Order types -------------------------------------------------------------------------
/** ride = normal fare; urgent = to the hospital against the clock (double fare on time);
 *  vip = triple fare if you don't bump them around; delivery = a food parcel from a hotel (tip if hot). */
export type OrderKind = 'ride' | 'urgent' | 'vip' | 'delivery';
export const ORDER_WEIGHTS: Record<OrderKind, number> = { ride: 0.5, delivery: 0.2, urgent: 0.15, vip: 0.15 };
export const PAY = { urgentOnTime: 2, vipSmooth: 3, deliveryHotTip: 0.5 };
/** Seconds allowed for a timed job: driving time at a brisk pace plus some slack. */
export function timeLimit(metres: number) {
  return Math.round(metres / 7 + 20);
}
export const VIP_NAMES = ['Cinema director Ramesh', 'Cricket coach Senthil', 'MLA paiyan Arvind', 'Serial actress Nandhini', 'Carnatic singer Lalitha'];
export const PARCEL_FROM = ['Mylai Tiffin Centre', 'Anna Mess', 'Hotel Mylai Bhavan', 'Kapali Bakery'];
export const URGENT_PICKUP = 'Anna, hospital-ku seekiram! Romba vali-aa irukku!';
export const URGENT_ON_TIME = 'Nandri thambi, correct time-ku kondu vandheenga! Double kaasu edunga.';
export const URGENT_LATE = 'Romba late aayiduchu pa... ithula kaasu.';
export const VIP_PICKUP = 'Hmm, AC illaya? Paravaala. Smooth-aa ottunga, shoot-ku poganum.';
export const VIP_BUMP = ['Dei! Paathu ottu! En shirt full-aa coffee!', 'Kuzhi-la viduriya?! Smooth-aa nu sonnen!'];
export const VIP_SMOOTH = 'Semma smooth ride! Indha, triple kaasu. Card vechikko.';
export const VIP_ROUGH = 'Ivlo kuzhi ride-ku idhu dhaan kaasu. Poi auto ottradha kathukko.';
export const PARCEL_HOT = 'Parcel sooda irukku! Indha tip-um.';
export const PARCEL_COLD = 'Saapadu aari pochu... seri, indha kaasu.';
/** While it rains, fares go up (everyone wants an auto). */
export const RAIN_SURCHARGE = 1.3;

export const PASSENGER_NAMES = ['Saraswathi paati', 'Venkat sir', 'Anitha', 'Gopal', 'Revathi', 'Prakash', 'Malini', 'Suresh', 'Jaya akka', 'Karthik'];

/** {place} is replaced with the destination. */
export const PICKUP_LINES = [
  'Auto! {place} ku varuveengala?',
  'Anna, {place} pogalaama? Meter podunga.',
  '{place} ku evlo? Seri seri, po pa!',
  'Thambi, {place} — konjam seekiram!',
];
export const RIDE_LINES = [
  'Konjam seekiram po pa, late aayiduchu.',
  'Inniku veyil romba jaasthi illa?',
  'Unga uncle auto dhaane idhu? Nalla manushan avaru.',
  'Paathu po pa, footpath-la aal irukaanga.',
];
/** {fare} is replaced with the amount paid. */
export const PAID_LINES = ['Indhaanga ₹{fare}. Nandri anna!', 'Super-aa ottuneenga! ₹{fare}, vechukonga.', '₹{fare} — meter-ku mela tip-um irukku!'];

// Fare: a Chennai-style meter, scaled to the size of the town.
export const BASE_FARE = 40;
export const PER_METRE = 1.2;
/** Tip (fraction of the fare) when the ride takes less than the expected time. */
export const QUICK_TIP = 0.2;
export const EXPECTED_SPEED = 6; // m/s, average incl. turns
export const EXPECTED_SLACK = 20; // s

/** Fare for a straight-line trip of `metres`, rounded to ₹5. */
export function fare(metres: number) {
  return Math.round((BASE_FARE + metres * PER_METRE) / 5) * 5;
}

/** Total paid at drop-off: fare, plus a tip if the ride was quick. */
export function payment(metres: number, seconds: number) {
  const base = fare(metres);
  const quick = seconds <= metres / EXPECTED_SPEED + EXPECTED_SLACK;
  return { base, tip: quick ? Math.round(base * QUICK_TIP) : 0 };
}

/** World position of a stop: where the auto pulls up (road) or the passenger waits (sidewalk). */
export function stopPoint(s: Stop, where: 'kerb' | 'sidewalk') {
  const offset = s.side * (where === 'kerb' ? 3.4 : 6.0);
  return s.axis === 'x' ? { x: s.line + offset, z: s.along } : { x: s.along, z: s.line + offset };
}

// ---- Phone messages ------------------------------------------------------------------------
export const UNCLE = 'Chithappa';
export const LENDER = 'Kandasamy (kadan)';
export const MSG_WELCOME_BACK = 'Thirumba vandhutta thambi! Auto, kaasu, kadan ellam appadiye irukku.';
export const MSG_FINE_ON_LOAN = 'Fine kattaradhukku un kitta kaasu illa. ₹{owed} naan kattitten, un kadan-la serthutten. Ippo total kadan ₹{loan}.';
export const MSG_WELCOME =
  'Thambi, en auto ippo unnodadhu. Kandasamy kitta ₹15,000 kadan irukku. Daily ₹500 kattu, illana auto-va eduthuttu poiduvaan. Nalla ottu, nalla per vaangu!';
export const MSG_LENDER_HELLO = 'Naan dhaan Kandasamy. Un chithappa auto-ku ₹15,000 baaki. Daily ₹500 — marakkaadha!';
export const MSG_MISSED = ['Dei! Nethu kattala. Inniku double-aa kattu!', 'Rendu naal aachu kattala. Ippadiye pona auto en kitta dhaan!', 'Kadaisi warning thambi. Naalaiku auto-va eduthuduven!'];
/** {cost} */
export const MSG_SEIZED = 'Moonu naal kattala. Auto-va eduthuttu poitten. ₹{cost} kattu, thirumba tharen. (Phone > Wallet)';
export const MSG_REDEEMED = 'Seri, kaasu vandhuchu. Auto temple pakkathula nikkudhu. Ini ozhunga kattu!';
export const MISSION_SEIZED = "Kandasamy took the auto! Earn ₹{cost} and get it back (Phone > Wallet)";
export const TRAFFIC_POLICE = 'Traffic Police';
export const SIGNAL_FINE = 500;
export const MSG_SIGNAL_JUMP = 'Signal jump panniteenga! ₹{fine} fine. Red-la nillunga!';
/** {paid}, {left} */
export const MSG_PAID = 'Seri, ₹{paid} vandhuchu. Innum ₹{left} baaki.';
export const MSG_PAID_OFF = 'Mudinjuthu! Kadan full-aa kattiteenga. Auto ippo full-aa ungaludhu. Vaazhthukkal!';

// ---- Police --------------------------------------------------------------------------------
export const POLICE = 'Mylapore Police';
export const MSG_THEFT_WARNING = 'Vandi thirudinadhu theriyum! Udane niruthu, illana arrest. Idhu first warning.';
export const MSG_ESCALATE = 'Warning-a mathikala. Ippo shoot-at-sight order!';
export const BUSTED_TITLE = 'ARRESTED';
export const WASTED_TITLE = 'SUTTUTAANGA!';
/** {fine} */
export const BUSTED_SUB = 'Police pidichitaanga. ₹{fine} fine kattitu station-la irundhu veliya vandheenga.';
export const STARVED_TITLE = 'PASI-LA VIZHUNDHUTEENGA!';
export const STARVED_SUB = 'Saapdaama suthuneenga, mayangi vizhundhuteenga. Hospital bill ₹{fine}. Ini time-ku saapdunga!';
export const HUNGRY_LINE = 'Vayiru kaththudhu... edhavadhu saapdanum. (Hotel / store pakkathula E)';
export const TIRED_LINE = 'Kaal thalarudhu, oda mudiyala. Seekiram saapdunga!';
export const WASTED_SUB = 'Gun shot-la vizhundhuteenga. Hospital bill ₹{fine}. Isabel Hospital-la kanna muzhichuteenga.';
