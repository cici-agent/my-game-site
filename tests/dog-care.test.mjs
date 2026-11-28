import test from 'node:test';
import assert from 'node:assert/strict';
import { freshCare, advanceCare, advanceAway, services, DIRTY_AFTER, bookBoarding, settleBoarding } from '../js/h/dog-care.js';

const dog = () => ({ has: true, full: 80, loyal: 20, care: freshCare(() => .5) });

test('dirt increases illness risk, washing and treating address distinct needs', () => {
  const muddy = dog(), clean = dog();
  muddy.care.sinceBath = DIRTY_AFTER;
  muddy.care.riskLeft = clean.care.riskLeft = .04;
  advanceCare(muddy, 3600); advanceCare(clean, 3600);
  assert.equal(muddy.care.sick, true);
  assert.equal(clean.care.sick, false);
  services.bath.apply(muddy);
  assert.equal(muddy.care.sinceBath, 0);
  assert.equal(muddy.care.sick, true);
  services.treat.apply(muddy);
  assert.equal(muddy.care.sick, false);
  assert.equal(services.treat.available(muddy), false);
});

test('only continuous empty hunger counts toward death, including after a reload', () => {
  const st = dog();
  advanceCare(st, 40 * 3600);
  assert.equal(st.has, true);
  st.full = 40;
  advanceCare(st, 40 * 3600);
  const loaded = JSON.parse(JSON.stringify(st));
  assert.equal(loaded.has, true);
  advanceAway(loaded, 30 * 3600);
  assert.equal(loaded.has, false);
  assert.equal(loaded.died, true);
});

test('offline meals use reachable food before starvation starts', () => {
  const st = dog();
  st.bowl = { x: 1, z: 0, food: 3 };
  st.chain = { x: 0, z: 0 };
  advanceAway(st, 3 * 3600);
  assert.equal(st.bowl.food, 0);
  assert.equal(st.care.starving, 0);
  st.bowl = { x: 20, z: 0, food: 3 };
  advanceAway(st, 80 * 3600);
  assert.equal(st.has, false);
  assert.equal(st.bowl.food, 3);
});

test('a newly adopted dog can book a paid bath immediately', () => {
  const st = dog();
  assert.ok(services.bath.available(st));
  assert.equal(services.bath.price, 5);
  st.care.sinceBath = DIRTY_AFTER + 1;
  services.bath.apply(st);
  assert.equal(st.care.sinceBath, 0);
  assert.equal(services.bath.available({ has: false }), false);
});

const DAY = 86400000;
test('five paid days protect a sick starving dog while offline', () => {
  const st = dog();
  st.full = 0;
  st.care.starving = st.care.lethalAfter - 1;
  st.care.sick = true;
  st.bowl = { food: 5 };
  let balance = 30;
  const wallet = { spend(n) { if (n > balance) return false; balance -= n; return true; } };
  assert.ok(bookBoarding(st, 5, DAY, wallet));
  const loaded = JSON.parse(JSON.stringify(st));
  advanceAway(loaded, settleBoarding(loaded, DAY, DAY * 6));
  assert.ok(loaded.has && loaded.full >= 40 && !loaded.care.sick);
  assert.equal(loaded.bowl.food, 5);
  assert.equal(balance, 0);
  advanceAway(loaded, settleBoarding(loaded, DAY * 6, DAY * 10));
  assert.equal(loaded.died, true);
});

test('an unpaid or invalid booking changes no care state and extensions preserve time', () => {
  const st = dog(), costs = [];
  const wallet = { spend(n) { costs.push(n); return n <= 24; } };
  assert.equal(bookBoarding(st, 0, DAY, wallet), false);
  assert.equal(bookBoarding(st, 5, DAY, wallet), false);
  assert.equal(st.boarding, undefined);
  assert.ok(bookBoarding(st, 4, DAY, wallet));
  assert.ok(bookBoarding(st, 2, DAY * 2, wallet));
  assert.equal(st.boarding.until, DAY * 7);
  assert.equal(bookBoarding(st, 3, DAY * 2, wallet), false);
  assert.deepEqual(costs, [30,24,12]);
});
