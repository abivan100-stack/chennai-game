// Self-check for the pure logic modules. Run: npm run check (Node 22.18+ runs .ts directly).
import { sunDirection, istClock } from '../src/world/solar.ts';
import { PRESETS, stepDown, stepUp, type QualitySettings } from '../src/core/quality.ts';
import { STOPS, fare, payment, stopPoint } from '../src/missions/data.ts';
import { DAILY_DUE, Economy, LOAN_TOTAL } from '../src/missions/economy.ts';
import { nextTurn, route, routeLength } from '../src/missions/route.ts';
import { LOSE_SECONDS, Wanted } from '../src/combat/wanted.ts';
import { DRAIN, ENERGY_MAX, ENERGY_START, Energy } from '../src/player/energy.ts';
import { BASKET_MAX, MENUS, SHELVES } from '../src/world/food.ts';
import { SHOP_SIGNS } from '../src/world/textures.ts';
import { SignalCycle } from '../src/world/trafficLights.ts';
import { BOUNDS, inWater } from '../src/world/layout.ts';
import { CRASH_DV, PETROL_PRICE, REPAIR_PRICE, TANK, Upkeep } from '../src/vehicles/upkeep.ts';

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
  assert(Math.hypot(k.x - w.x, k.z - w.z) > 2 && k.x > BOUNDS.x0 && k.x < 205 && k.z > BOUNDS.z0 && k.z < BOUNDS.z1 && !inWater(k.x, k.z, 1) && !inWater(w.x, w.z, 1), `stop ${s.name} inside the town (not in the sea)`);
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
// Turn-by-turn: north up a road, then east = right turn; the door hop at the end = arrive.
const t1 = nextTurn([{ x: 2, z: 100 }, { x: 0, z: 100 }, { x: 0, z: 0 }, { x: 50, z: 0 }, { x: 50, z: -6 }]);
assert(t1?.kind === 'right' && Math.abs(t1.dist - 100) < 0.01 && t1.next?.x === 50, `north then east is a right turn in 100 m: ${JSON.stringify(t1)}`);
const t2 = nextTurn([{ x: 0, z: 0 }, { x: 50, z: 0 }, { x: 50, z: -6 }]);
assert(t2?.kind === 'arrive' && t2.side === 'left' && Math.abs(t2.dist - 50) < 0.01, `east then a hop north = arrive on the left: ${JSON.stringify(t2)}`);

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

// --- Auto upkeep: petrol, crashes, repair ---
const upk = new Upkeep();
upk.drive(1000);
assert(upk.fuel < TANK && upk.fuel > 0, 'driving burns petrol');
upk.drive(100_000);
assert(upk.fuel === 0 && upk.speedFactor === 0, 'an empty tank stops the engine');
assert(Math.abs(upk.litresFor(PETROL_PRICE * 2) - 2) < 1e-9 && upk.litresFor(1e6) === TANK, 'petrol money buys litres up to a full tank');
upk.fill(TANK);
assert(upk.crash(CRASH_DV - 0.5) === 0, 'braking is not a crash');
const dmg = upk.crash(CRASH_DV + 4);
assert(dmg > 0 && upk.condition === 100 - dmg && upk.repairCost === dmg * REPAIR_PRICE, 'a crash dents the auto; repair costs per point');
upk.repair();
assert(upk.condition === 100 && upk.speedFactor === 1, 'repaired and fuelled = full speed');

// --- Bank: savings cover fines before the kadan grows; pickpockets only get the cash ---
const bk = new Economy();
bk.cash = 1000;
assert(bk.deposit(600) === 600 && bk.cash === 400 && bk.savings === 600, 'deposit');
const fineRes = bk.charge(700);
assert(fineRes.owed === 0 && bk.cash === 0 && bk.savings === 300, 'fine paid from cash, then the bank');
assert(bk.withdraw(1000) === 300 && bk.cash === 300 && bk.savings === 0, 'withdraw is capped by savings');
assert(bk.pickpocket(0.25) === 75 && bk.cash === 225, 'pickpocket takes a share of the cash');

// --- Canal and river: water between the bridges, dry on every road crossing ---
assert(inWater(-115, 0) && inWater(-115, 100) && inWater(0, 330) && inWater(-175, 330), 'canal and river are water');
assert(!inWater(-115, -25) && !inWater(-115, 70) && !inWater(-25, 330) && !inWater(125, 330), 'roads cross the water on bridges');

console.log('check: all passed');

// --- Story: chapters advance when their needed goals are done ---
{
  const { Story } = await import('../src/missions/story.ts');
  const st = new Story();
  const base = { loan: 15000, rides: 0, cash: 0, savings: 0, homesBought: 0, storyRides: 0 };
  assert(st.update(base) === null && st.chapter === 1, 'chapter 1 while the kadan is unpaid');
  assert(st.update({ ...base, loan: 0 })?.n === 2 && st.chapter === 2, 'paying the kadan opens chapter 2');
  assert(st.update({ ...base, loan: 0, savings: 60000 }) === null, 'chapter 2 needs a home too');
  assert(st.update({ ...base, loan: 0, savings: 60000, homesBought: 1 }) === null && st.chapter === 2, 'chapter 2 waits while chapter 3 is not built');
  assert(new Story({ chapter: 99 }).chapter === 2, 'a saved chapter is clamped to the last one that is built');
}
console.log('check: story passed');

// --- Rent (chapter 2) and story rides ---
{
  const { Rent, RENT, RENT_EVERY, EVICT_AFTER } = await import('../src/missions/rent.ts');
  const r = new Rent();
  assert(r.tick(10) === null, 'no rent before it starts');
  r.start(10);
  assert(r.tick(10 + RENT_EVERY - 1) === 'reminder', 'reminder the day before');
  assert(r.tick(10 + RENT_EVERY) === 'due' && r.owed === RENT, 'first week falls due');
  assert(r.pay(RENT * 5) === RENT && r.owed === 0, 'paying clears only what is owed');
  let ev = null;
  for (let d = 10 + RENT_EVERY + 1; d <= 10 + RENT_EVERY * (EVICT_AFTER + 1); d++) ev = r.tick(d) ?? ev;
  assert(r.evicted && ev === 'evicted' && r.unpaidWeeks === EVICT_AFTER, `evicted after ${EVICT_AFTER} unpaid weeks`);
  assert(r.pay(RENT) === RENT && r.evicted, 'part payment keeps you locked out');
  r.pay(r.owed);
  assert(!r.evicted && r.owed === 0, 'paying it all lets you back in');
  r.stop();
  assert(r.tick(999) === null && !r.active, 'no rent once you own a home');

  const { STORY_MISSIONS, judge, nextMission } = await import('../src/missions/storyMissions.ts');
  for (const m of STORY_MISSIONS) {
    for (const n of [m.from, m.to, m.via].filter(Boolean)) assert(STOPS.some((s) => s.name === n), `story ride ${m.id}: stop "${n}" exists`);
  }
  const labour = STORY_MISSIONS.find((m) => m.id === 'labour')!;
  assert(judge(labour, { onTime: true, bumps: 0, reds: 0 }) && !judge(labour, { onTime: true, bumps: 0, reds: 1 }) && !judge(labour, { onTime: true, bumps: 2, reds: 0 }), 'labour ride: no red lights, at most one bump');
  assert(nextMission([])?.id === STORY_MISSIONS[0].id && nextMission(STORY_MISSIONS.map((m) => m.id)) === null, 'story rides come in order, then stop');
}
console.log('check: rent + story rides passed');

// --- Every stop's passenger waits on a pavement: not in any road, not inside a block ---
{
  const { X_LINES, Z_LINES, roadHalf, BEACH_ROAD, blocks } = await import('../src/world/layout.ts');
  const bl = blocks();
  for (const s of STOPS) {
    const p = stopPoint(s, 'sidewalk');
    assert(!X_LINES.some((c) => Math.abs(p.x - c) < roadHalf('z', c)), `stop "${s.name}": waits in a north-south road`);
    assert(!(p.x < BEACH_ROAD + 5 && Z_LINES.some((c) => Math.abs(p.z - c) < roadHalf('x', c))), `stop "${s.name}": waits in an east-west road`);
    assert(!bl.some((b) => p.x > b.x0 + 0.3 && p.x < b.x1 - 0.3 && p.z > b.z0 + 0.3 && p.z < b.z1 - 0.3), `stop "${s.name}": waits inside a block`);
  }
}
console.log('check: stops on pavements passed');

// --- Story quests: ids resolve, steps name real people, nobody stands inside a block ---
{
  const { QUESTS } = await import('../src/missions/quests.ts');
  const { STORY_ORDER, nextStory } = await import('../src/missions/storyMissions.ts');
  const { blocks } = await import('../src/world/layout.ts');
  const solid = blocks().filter((b) => b.kind !== 'beach');
  const inside = (p: { x: number; z: number }) => solid.some((b) => p.x > b.x0 + 0.3 && p.x < b.x1 - 0.3 && p.z > b.z0 + 0.3 && p.z < b.z1 - 0.3);
  for (let i = 0; i < STORY_ORDER.length; i++) assert(nextStory(STORY_ORDER.slice(0, i)) !== null, `story mission "${STORY_ORDER[i]}" exists`);
  assert(nextStory(STORY_ORDER) === null, 'no story missions after the last');
  for (const q of QUESTS) {
    assert(STORY_ORDER.includes(q.id), `quest ${q.id} is in STORY_ORDER`);
    for (const st of q.steps) {
      if ('who' in st) assert(st.who in q.people, `quest ${q.id}: step names a real person (${st.who})`);
      if (st.kind === 'search') for (const c of st.clues) assert(c.who in q.people, `quest ${q.id}: clue person ${c.who}`);
    }
    for (const [id, p] of Object.entries(q.people)) if (!p.hidden) assert(!inside(p.at), `quest ${q.id}: ${id} stands inside a block`);
  }
}
console.log('check: quests passed');

// --- Garage: upgrade effects, dealer stock ---
{
  const { UPGRADES, DEALER_STOCK, fuelFactor, fareFactor, bumpDecel } = await import('../src/vehicles/garage.ts');
  assert(fuelFactor([]) === 1 && fuelFactor(['cng']) < 1, 'CNG makes fuel cheaper');
  assert(fareFactor([]) === 1 && Math.abs(fareFactor(['music', 'meter']) - 1.2) < 1e-9, 'music + meter = fares +20%');
  assert(bumpDecel(['seats']) > bumpDecel([]), 'seat covers soften bumps');
  assert(new Set(UPGRADES.map((u) => u.id)).size === UPGRADES.length && new Set(DEALER_STOCK.map((d) => d.id)).size === DEALER_STOCK.length, 'ids are unique');
}
console.log('check: garage passed');
