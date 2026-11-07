import assert from 'node:assert/strict';
import test from 'node:test';
import { groundPlaces, groundsTrails, groundsCollision, pathDistance } from '../js/magic/grounds-layout.js';
import { onBridge, onWestPier } from '../js/magic/lakeshore.js';

test('every section of the signposted route stays on the piers or on dry ground', () => {
  for (const trail of groundsTrails) for (let i = 1; i < trail.length; i++) {
    const [ax, az] = trail[i - 1], [bx, bz] = trail[i];
    const count = Math.ceil(Math.hypot(bx - ax, bz - az) / .3);
    for (let step = 0; step <= count; step++) {
      const t = step / count, x = ax + (bx - ax) * t, z = az + (bz - az) * t;
      if (onWestPier(x, z) || onBridge(x, z)) continue;
      assert.ok(((x - 5) / 73) ** 2 + ((z + 87) / 54) ** 2 >= 1);
      assert.ok(((x + 42) / 40.7) ** 2 + ((z + 153) / 20) ** 2 >= 1);
    }
  }
  for (const p of groundPlaces) {
    if (p.id === 'lake') assert.ok(onWestPier(p.x, p.z));
    else if (p.id !== 'pitch') assert.ok(pathDistance(p.x,p.z) < .01, p.name);
  }
});

test('a rotated grandstand and a round trunk block movement across spatial cell boundaries', () => {
  const map = groundsCollision();
  map.box(10, -20, 8, 2, 7, Math.PI / 2);
  map.circle(-.15, -.15, .8, 10);
  assert.equal(map.canWalk(10, -16.1), false);
  assert.equal(map.canWalk(10, -24.2), false);
  assert.equal(map.canWalk(12, -19), true);
  assert.equal(map.canWalk(.7, .1), false);
  assert.equal(map.canWalk(.95, 1), true);
});

test('outbuilding roofs admit pedestrians and clip the following camera', () => {
  const map = groundsCollision();
  map.box(0, 0, 10, 10, 7, 0, 4);
  assert.equal(map.canWalk(0, 0), true);
  assert.equal(map.cameraFraction({ x: 0, y: 1.7, z: 0 }, { x: 2, y: 2, z: 0 }), 1);
  const fraction = map.cameraFraction({ x: 0, y: 1.7, z: 0 }, { x: 2, y: 7.7, z: 0 });
  assert.ok(fraction > .29 && fraction < .4);
});
