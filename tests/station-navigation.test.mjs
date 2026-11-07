import assert from 'node:assert/strict';
import test from 'node:test';
import { cameraFraction, canBoardTrain, canCrossBarrier, moveInStation } from '../js/magic/station-navigation.js';

test('normal walking and a long sprint both stop at the solid barrier', () => {
  for (const [step, frames] of [[-.35, 100], [-30, 1]]) {
    const player = { x: 0, z: 132 };
    for (let frame = 0; frame < frames; frame++) moveInStation(player, 0, step);
    assert.ok(player.z > 112.45 && player.z < 116, `stopped at ${player.z}`);
    assert.equal(player.x, 0);
  }
});

test('diagonal input slides along the wall and the player can step away from it', () => {
  const player = { x: 0, z: 115 };
  for (let frame = 0; frame < 24; frame++) moveInStation(player, .2, -.2);
  assert.ok(player.z > 112.45);
  assert.ok(player.x > 4);
  const contact = player.z;
  moveInStation(player, 0, .5);
  assert.ok(player.z > contact);
});

test('the platform side of the secret wall is solid during normal movement', () => {
  const player = { x: 0, z: 104 };
  moveInStation(player, 0, 30);
  assert.ok(player.z > 105 && player.z < 111.55);
});

test('the concourse back wall and ends prevent walking around the secret wall', () => {
  const back = { x: 0, z: 140 };
  moveInStation(back, 0, 25);
  assert.ok(back.z > 140 && back.z < 148);
  for (const side of [-1, 1]) {
    const player = { x: side * 47, z: 132 };
    moveInStation(player, side * 15, 0);
    assert.ok(Math.abs(player.x) < 52);
    moveInStation(player, 0, -40);
    assert.ok(player.z > 112.45);
  }
});

test('trolleys and benches occupy space on their respective sides', () => {
  const trolley = { x: -10, z: 129 };
  moveInStation(trolley, 0, -12);
  assert.ok(trolley.z > 121.5 && trolley.z < 127);
  const bench = { x: -10, z: 107 };
  moveInStation(bench, 0, -9);
  assert.ok(bench.z > 101.6 && bench.z < 106);
});

test('walking towards the train stops on the platform', () => {
  const player = { x: 0, z: 100 };
  moveInStation(player, 0, -25);
  assert.ok(player.z > 92.25 && player.z < 95);
});

test('the carriage door can be reached from the landing and boarding is deliberate', () => {
  const player = { x: 0, z: 100 };
  const door = { x: -11.4, z: 93.8 };
  assert.equal(canBoardTrain(player, door, 1), false);
  moveInStation(player, 0, door.z - player.z);
  moveInStation(player, door.x - player.x, 0);
  assert.ok(Math.hypot(player.x - door.x, player.z - door.z) < .01);
  assert.equal(canBoardTrain(player, door, 1), true);
  assert.equal(canBoardTrain(player, door, 0), false);
  assert.equal(canBoardTrain({ x: door.x, z: 92 }, door, 1), false);
});

test('the crossing action is limited to the secret spot and the permitted chapter', () => {
  const front = { x: 0, z: 113.5 };
  const back = { x: 0, z: 110.5 };
  assert.equal(canCrossBarrier(front, 0), true);
  assert.equal(canCrossBarrier(back, 0), false);
  assert.equal(canCrossBarrier(back, 1), false);
  assert.equal(canCrossBarrier(front, 5), true);
  assert.equal(canCrossBarrier(back, 5), true);
  assert.equal(canCrossBarrier({ x: 9, z: front.z }, 0), false);
  assert.equal(canCrossBarrier({ x: 0, z: 130 }, 0), false);
});

test('camera stays on the same side of solid walls as its target', () => {
  for (const [startZ, endZ] of [[116, 105], [108, 120]]) {
    const target = { x: 0, y: 2, z: startZ };
    const desired = { x: 0, y: 5, z: endZ };
    const fraction = cameraFraction(target, desired);
    assert.ok(fraction > 0 && fraction < 1);
    const actualZ = startZ + fraction * (endZ - startZ);
    assert.ok((actualZ - 112) * (startZ - 112) > 0);
  }
  const clear = cameraFraction({ x: 0, y: 2, z: 129 }, { x: 0, y: 5, z: 136 });
  assert.equal(clear, 1);
});

test('the chase camera avoids the parked train and can see across the empty track after departure', () => {
  const target = { x: -11.4, y: 3, z: 94 };
  const desired = { x: -11.4, y: 4, z: 85 };
  assert.ok(cameraFraction(target, desired, true) < 1);
  assert.equal(cameraFraction(target, desired, false), 1);
});

test('the lakeside rail bed also blocks approaching the parked train from the arrival platform', () => {
  const player = { x: 82, z: -78 };
  moveInStation(player, 14, 0);
  assert.ok(player.x >= 82 && player.x < 85.25);
});

test('movement away from either station is unmodified', () => {
  const player = { x: 15, z: 30 };
  moveInStation(player, -1, 2);
  assert.deepEqual(player, { x: 14, z: 32 });
});
