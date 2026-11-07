import assert from 'node:assert/strict';
import test from 'node:test';
import { bridgeHeight, bridgeStepAllowed, onBridge, onWestPier } from '../js/magic/lakeshore.js';

test('walking from the landing reaches the gate without dropping off the bridge end', () => {
  const x = -42;
  for (const stride of [.08, .35, .55]) {
    let z = -95.9;
    const landingZ = z;
    for (let step = 0; step < 600; step++) {
      const next = z - stride;
      if (!bridgeStepAllowed(x, z, x, next)) break;
      assert.ok(onWestPier(x, next) || onBridge(x, next));
      z = next;
    }
    assert.ok(z < -132 && z > -133);
    assert.ok(bridgeHeight(z) > 11);
    while (z < landingZ) {
      assert.ok(bridgeStepAllowed(x, z, x, z + stride));
      z += stride;
    }
  }
});

test('the bridge railing blocks lateral steps over open water', () => {
  assert.equal(bridgeStepAllowed(-37.3, -120, -37, -120), false);
  assert.equal(bridgeStepAllowed(-46.7, -120, -47, -120), false);
});
