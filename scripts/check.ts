// Self-check for the pure logic modules. Run: npm run check (Node 22.18+ runs .ts directly).
import { sunDirection, istClock } from '../src/world/solar.ts';
import { PRESETS, stepDown, stepUp, type QualitySettings } from '../src/core/quality.ts';
import { STOPS, fare, payment, stopPoint } from '../src/missions/data.ts';
import { DAILY_DUE, Economy, LOAN_TOTAL } from '../src/missions/economy.ts';
import { route, routeLength } from '../src/missions/route.ts';
import { LOSE_SECONDS, Wanted } from '../src/combat/wanted.ts';
import { DRAIN, ENERGY_MAX, ENERGY_START, Energy } from '../src/player/energy.ts';
import { BASKET_MAX, MENUS, SHELVES } from '../src/world/food.ts';
import { SHOP_SIGNS } from '../src/world/textures.ts';
import { SignalCycle } from '../src/world/trafficLights.ts';

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FAIL: ${msg}`);
}
const ist = (iso: string) => Date.parse(`${iso}+05:30`);
const elevDeg = (iso: string) => (Math.asin(sunDirection(ist(iso)).y) * 180) / Math.PI;

// --- Sun ---
assert(istClock(ist('2026-06-21T14:05:00')) === '14:05', 'istClock formats IST');
assert(Math.abs(elevDeg('2026-06-21T12:09:00') - 79.6) < 2, 'June noon: sun ~80° high');
assert(sunDirection(ist('2026-06-21T12:09:00')).z < 0, 'June noon: sun to the north (Chennai is south of the tropic)');
assert(Math.abs(elevDeg('2026-12-21T12:09:00') - 53.5) < 2, 'December noon: sun ~53° high');
assert(sunDirection(ist('2026-12-21T12:09:00')).z > 0, 'December noon: sun to the south');
assert(elevDeg('2026-03-20T00:00:00') < -60, 'midnight: sun well below horizon');
assert(sunDirection(ist('2026-03-20T08:00:00')).x > 0.5, 'morning: sun in the east');
assert(sunDirection(ist('2026-03-20T17:00:00')).x < -0.5, 'evening: sun in the west');
assert(elevDeg('2026-03-20T05:50:00') < 0 && elevDeg('2026-03-20T06:40:00') > 0, 'sunrise ~6:15 IST');

// --- Quality ladder: resolution first, then shadows, then effects ---
const order: string[] = [];
let s: QualitySettings | null = { ...PRESETS.high };
let prev = s;
while ((s = stepDown(prev))) {
  order.push(s.resScale !== prev.resScale ? 'res' : s.shadows !== prev.shadows ? 'shadows' : 'effects');
  prev = s;
}
assert(order.join(',') === 'res,res,res,res,res,shadows,shadows,effects', `step-down order: ${order}`);
assert(prev.resScale === 0.5 && prev.shadows === 0 && !prev.effects, 'bottom of ladder');
let up: QualitySettings = prev;
for (let i = 0; i < 8; i++) up = stepUp(up) ?? up;
assert(JSON.stringify(up) === JSON.stringify(PRESETS.high), 'step-up climbs back to high');
assert(stepUp(PRESETS.high) === null, 'high is the ceiling');

// --- Fares ---
assert(fare(0) === 40, 'minimum fare is the base fare');
assert(fare(100) === 160 && fare(100) % 5 === 0, 'fare grows with distance, rounded to ₹5');
assert(payment(100, 10).tip === 32 && payment(100, 120).tip === 0, 'quick rides tip 20%, slow ones none');
for (const s of STOPS) {
  const k = stopPoint(s, 'kerb');
  const w = stopPoint(s, 'sidewalk');
  assert(Math.hypot(k.x - w.x, k.z - w.z) > 2 && k.x > -100 && k.x < 205 && Math.abs(k.z) < 100, `stop ${s.name} inside the town (not in the sea)`);
}

// --- Economy ---
const eco = new Economy();
assert(eco.tickDay(100) === null, 'first day just starts');
eco.earn(300);
assert(eco.pay(1000) === 300 && eco.cash === 0 && eco.loan === LOAN_TOTAL - 300, 'pay limited by cash');
assert(eco.dueToday === DAILY_DUE - 300, 'part of today paid');
assert(eco.tickDay(101) === 'missed' && eco.missedDays === 1, 'short payment = missed day');
eco.earn(600);
eco.pay(DAILY_DUE);
assert(eco.tickDay(102) === 'ok' && eco.missedDays === 0, 'full payment resets the count');
eco.earn(LOAN_TOTAL * 2);
eco.pay(Infinity);
assert(eco.paidOff && eco.loan === 0 && eco.dueToday === 0, 'loan can be paid off, never below zero');

// --- Route guidance ---
const LINES = [-70, -25, 25, 70];
const r1 = route({ x: 21.6, z: -4 }, { x: -64, z: 0 }, LINES, LINES); // East Mada St -> tank bus stop
for (let i = 1; i < r1.length - 2; i++) {
  const a = r1[i], b = r1[i + 1];
  assert(a.x === b.x || a.z === b.z, `route leg ${i} follows a road`);
}
assert(Math.abs(routeLength(r1) - (3.4 + 21 + 50 + 45 + 25 + 6)) < 1, `shortest route via a Mada St junction: ${routeLength(r1).toFixed(1)}`);
const r2 = route({ x: 23, z: -10 }, { x: 23, z: 10 }, LINES, LINES);
const r3 = route({ x: 20, z: 0 }, { x: 128, z: -60 }, [-70, -25, 25, 70, 125], LINES); // temple -> Beach Road
assert(r3[r3.length - 2].x === 125 && r3.every((p, i) => i === 0 || i === r3.length - 1 || p.x <= 125), 'beach route ends on the Beach Road, never past it'); // same street
assert(r2.length === 4 && routeLength(r2) < 25, 'same street: straight along it');

// --- Wanted level ---
const w = new Wanted();
assert(w.report('theft') === 1 && !w.shootOnSight, 'theft = warning star, no shooting');
assert(w.report('keepStolen') === 2 && w.shootOnSight, 'keeping the stolen ride = shoot on sight');
assert(w.report('assaultPolice') === 3 && w.report('assault') === 3, 'capped at 3 stars');
w.update(LOSE_SECONDS - 1, false);
w.update(0.5, true);
w.update(LOSE_SECONDS - 0.1, false);
assert(w.level === 3, 'being seen resets the escape timer');
w.update(0.2, false);
assert(w.level === 2, 'out of sight long enough: lose a star');
w.clear();
assert(w.report('assault') === 1, 'first assault = 1 star');

// --- Energy + food ---
const en = new Energy();
assert(en.update(10, 'run') === 0 && en.value < ENERGY_START, 'running drains energy, no damage while not empty');
en.value = 0.01;
assert(en.update(1, 'idle') > 0 && en.value === 0, 'empty: health starts to go');
en.eat(500);
assert(en.value === ENERGY_MAX && !en.low, 'eating caps at max');
assert(ENERGY_MAX / DRAIN.walk > 10 * 60, 'walking from full lasts over 10 minutes');
for (const [shop, menu] of Object.entries(MENUS)) {
  assert(menu.items.length >= 1 && menu.items.length <= 4, `${shop}: 1-4 items (keys 1-4)`);
  for (const it of menu.items) assert(it.price > 0 && it.energy > 0 && it.seconds >= 3, `${shop} / ${it.name}: sane numbers`);
  assert(SHOP_SIGNS.some((s) => s.en === shop), `${shop}: has a signboard`);
}
for (const shelf of SHELVES) {
  assert(shelf.items.length >= 1 && shelf.items.length <= 4, `${shelf.name}: 1-4 items (keys 1-4)`);
  for (const it of shelf.items) assert(it.price > 0 && it.energy > 0, `${shelf.name} / ${it.name}: sane numbers`);
}
assert(BASKET_MAX >= 1, 'basket holds something');
const wp = new Wanted();
assert(wp.report('assaultPolice') === 2 && wp.report('assaultPolice') === 3, 'hitting police: 2 stars, then 3');

// --- Fines on the loan + save snapshot ---
const ec = new Economy();
ec.cash = 200;
const fine = ec.charge(500);
assert(fine.paid === 200 && fine.owed === 300 && ec.cash === 0 && ec.loan === LOAN_TOTAL + 300, 'fine short of cash: the rest goes on the kadan');
const ec2 = new Economy();
ec2.restore(ec.snapshot());
assert(ec2.loan === ec.loan && ec2.cash === ec.cash, 'economy survives a save / load');

// --- Kadan: three missed days and the auto is taken; pay the overdue + penalty to get it back ---
const ks = new Economy();
ks.tickDay(1);
for (let d = 2; d <= 4; d++) ks.tickDay(d);
assert(ks.seized && ks.missedDays === 3, 'three missed days: auto seized');
ks.cash = ks.redeemCost - 1;
assert(!ks.redeem(), 'cannot redeem without enough cash');
ks.cash = ks.redeemCost;
const loanBefore = ks.loan;
assert(ks.redeem() && !ks.seized && ks.cash === 0 && ks.loan === loanBefore - 3 * DAILY_DUE, 'redeem: overdue off the loan, penalty kept');

// --- Traffic signals ---
const sc = new SignalCycle();
assert(sc.length === 37, 'signal cycle is 37 s');
const at = (t: number) => { sc.t = t; return `${sc.state('ns')}/${sc.state('ew')}`; };
assert(at(1) === 'green/red' && at(15) === 'amber/red' && at(18) === 'red/red' && at(20) === 'red/green' && at(33) === 'red/amber' && at(36) === 'red/red', 'signal phases: ns green, amber, all red, ew green, amber, all red');

console.log('check: all passed');
