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
  { name: 'Mandaveli MRTS station', axis: 'z', line: 180, along: 2, side: 1 },
  { name: 'Venkatakrishna Road', axis: 'z', line: 125, along: -50, side: -1 },
];
export const HOSPITAL = 'Isabel Hospital';

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
export const WASTED_SUB = 'Gun shot-la vizhundhuteenga. Hospital bill ₹{fine}. Station pakkathula irundhu restart.';
