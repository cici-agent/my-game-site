import test from 'node:test';
import assert from 'node:assert/strict';
import { BUCKET_CAPACITY, IRRIGATORS, tankCapacity, pourIntoTank, drainTank } from '../js/h/irrigation.js';

test('independent tanks run for three, five or seven real days when full', () => {
  for (const [key, days] of Object.keys(IRRIGATORS).map((key, i) => [key, [3, 5, 7][i]])) {
    const capacity = tankCapacity(key);
    const duration = days * 86400;
    assert.equal(capacity, days * BUCKET_CAPACITY);
    const almost = drainTank(capacity, duration - 3600);
    assert.ok(almost.water > 0);
    const empty = drainTank(almost.water, 7200);
    assert.ok(Math.abs(empty.wateredSeconds - 3600) < 1e-6);
    assert.equal(empty.water, 0);
    assert.equal(drainTank(empty.water, 1).wateredSeconds, 0);
  }
});

test('topping up a nearly full barrel keeps the remaining water in the bucket', () => {
  assert.deepEqual(pourIntoTank(8, 23.5, 24), { poured: .5, bucket: 7.5, tankWater: 24 });
  assert.deepEqual(pourIntoTank(0, 23.5, 24), { poured: 0, bucket: 0, tankWater: 23.5 });
});
