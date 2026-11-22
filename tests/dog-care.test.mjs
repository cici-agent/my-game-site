import test from 'node:test';
import assert from 'node:assert/strict';
import { freshCare, advanceCare, advanceAway, services, DIRTY_AFTER } from '../js/h/dog-care.js';

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

test('a newly adopted dog can use the free bath immediately', () => {
  const st = dog();
  assert.ok(services.bath.available(st));
  assert.equal(services.bath.price, 0);
  st.care.sinceBath = DIRTY_AFTER + 1;
  services.bath.apply(st);
  assert.equal(st.care.sinceBath, 0);
  assert.equal(services.bath.available({ has: false }), false);
});
