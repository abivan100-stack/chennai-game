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
];

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
