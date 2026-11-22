import test from 'node:test';
import assert from 'node:assert/strict';
import { visitMayor } from '../js/h/mayor.js';

function visit(overrides = {}) {
  const args = {
    state: { points: 0 }, day: 1, bag: { take: () => true, add: () => true },
    chest: { add: () => false }, accepts: key => key === 'egg', random: () => 0,
    ...overrides,
  };
  return { state: args.state, result: visitMayor(args) };
}

test('chat and gift build friendship once per village day', () => {
  const { state } = visit();
  visit({ state });
  assert.equal(state.points, 1);
  const { result } = visit({ state, gift: 'egg' });
  assert.equal(result.seed, 'seed_radish');
  assert.equal(result.destination, '背包');
  assert.equal(state.points, 3);
  visit({ state, gift: 'egg', bag: { take: () => assert.fail('duplicate gift') } });
  assert.equal(visit({ state }).result.seed, undefined);
  visit({ state, day: 2, random: () => 0.9 });
  assert.equal(state.points, 4);
  assert.equal(visit({ state, day: 2 }).result.seed, undefined);
});

test('full inventory keeps the offer across reload and delivers it once', () => {
  const { state } = visit({ state: { points: 4 }, bag: { add: () => false } });
  const saved = JSON.parse(JSON.stringify(state));
  assert.equal(saved.pending, 'seed_radish');
  const { result } = visit({ state: saved, bag: { add: () => false }, chest: { add: (k, n) => k === 'seed_radish' && n === 2 } });
  assert.equal(result.destination, '菜园的箱子');
  assert.equal(saved.pending, undefined);
  assert.equal(visit({ state: saved }).result.seed, undefined);
});

test('unavailable and ineligible gifts do not earn friendship', () => {
  for (const gift of ['egg', 'key']) {
    const { state } = visit({ gift, bag: { take: k => { assert.equal(k, 'egg'); return false; } } });
    assert.deepEqual(state, { points: 0 });
  }
});
