import test from 'node:test';
import assert from 'node:assert/strict';
import { aimFromPlayer, targetCenter, targetingObstacles, pickAimTarget, targetAvailability, cycleAimTarget } from '../chapter-one/client/targeting.mjs';
import { sweep } from '../chapter-one/combat/geometry.mjs';
const player = { x: 0, y: 0, z: 5 };
const low = { id: 'low', hp: 100, position: { x: 1.5, y: 0, z: 0 }, radius: .45, collisionBase: 0, collisionHeight: .85 };
test('a clicked low creature receives a canonical chest ray through its actual hurt volume', () => {
  const point = targetCenter(low), aim = aimFromPlayer(player, point), origin = { ...player, y: 1.2 };
  const end = { x: origin.x + aim.x * 12, y: origin.y + aim.y * 12, z: origin.z + aim.z * 12 };
  assert.equal(sweep(origin, end, [low], [], .08)?.id, 'low');
  assert(aim.y < 0); assert(aim.x > 0);
});
test('mouse picking uses the clicked ray and cannot choose a creature through a wall', () => {
  const front = { ...low, id: 'front', position: { x: 0, y: 0, z: 1 }, collisionHeight: 2 };
  const origin = { x: 0, y: 1.2, z: 5 }, end = { x: 0, y: 1.2, z: -10 };
  assert.equal(pickAimTarget(origin, end, [low, front])?.id, 'front');
  const walls = targetingObstacles([{ x: 0, z: 3, w: 2, d: .3, height: 3 }]);
  assert.equal(pickAimTarget(origin, end, [front], walls), null);
  assert.equal(targetAvailability(player, front, 12, walls).status, 'blocked');
});
test('target cycle excludes dead, offscreen, blocked and out-of-range enemies and wraps predictably', () => {
  const a = { ...low, id: 'a', screenDistance: .1 }, b = { ...low, id: 'b', screenDistance: .3 };
  const all = [b, { ...a, id: 'dead', hp: 0 }, { ...a, id: 'behind', onScreen: false }, { ...a, id: 'far', position: { x: 0, z: -30 } }, a];
  assert.equal(cycleAimTarget(all, null, player)?.id, 'a');
  assert.equal(cycleAimTarget(all, 'a', player)?.id, 'b');
  assert.equal(cycleAimTarget(all, 'b', player)?.id, 'a');
  assert.equal(targetAvailability(player, all[3], 12).status, 'far');
});

test('rescue picks the low body of a downed friend while healing excludes that friend', () => {
  const downed = { id: 'friend-down', hp: 0, downedUntil: 5000, rescued: false, position: { x: 0, y: 0, z: 0 }, radius: .4, collisionHeight: .6 };
  const standing = { ...downed, id: 'friend-up', hp: 60, position: { x: 0, y: 0, z: 1 }, collisionHeight: 1.7 };
  const origin = { x: 0, y: 1.2, z: 2 }, end = targetCenter(downed), options = { purpose: 'rescue', now: 2000 };
  assert.equal(pickAimTarget(origin, end, [standing, downed], [], options)?.id, downed.id);
  assert.equal(pickAimTarget(origin, end, [downed], [], { purpose: 'heal' }), null);
  assert.equal(pickAimTarget(origin, end, [standing], [], { purpose: 'heal' })?.id, standing.id);
  assert.equal(targetAvailability({ x: 0, y: 0, z: 1 }, downed, 2, [], options).status, 'ready');
  assert.equal(targetAvailability({ x: 0, y: 0, z: 1 }, standing, 2, [], options).status, 'none');
  const aboveBody = { x: 0, y: 1.2, z: -2 };
  assert.equal(pickAimTarget(origin, aboveBody, [downed], [], options), null, 'a ray through the former standing head does not select empty air');
});

test('rescue retains wall and range checks and cannot select an expired or already rescued friend', () => {
  const downed = { id: 'friend', hp: 0, downedUntil: 5000, position: { x: 0, y: 0, z: 0 }, radius: .4, collisionHeight: .6 };
  const origin = { x: 0, y: 1.2, z: 2 }, options = { purpose: 'rescue', now: 2000 };
  const walls = targetingObstacles([{ x: 0, z: 1, w: 2, d: .3, height: 3 }]);
  assert.equal(pickAimTarget(origin, targetCenter(downed), [downed], walls, options), null);
  assert.equal(targetAvailability({ x: 0, y: 0, z: 2 }, downed, 2, walls, options).status, 'blocked');
  assert.equal(targetAvailability({ x: 0, y: 0, z: 3 }, downed, 2, [], options).status, 'far');
  assert.equal(pickAimTarget(origin, targetCenter(downed), [{ ...downed, rescued: true }], [], options), null);
  assert.equal(pickAimTarget(origin, targetCenter(downed), [downed], [], { ...options, now: 5000 }), null);
  assert.equal(cycleAimTarget([downed], null, { x: 0, z: 1 }, [], 2, options)?.id, downed.id);
  assert.equal(cycleAimTarget([downed], null, { x: 0, z: 1 }), null, 'normal enemy cycling still ignores downed bodies');
});
