import assert from 'node:assert/strict';
import test from 'node:test';
import { rideSceneAt, rideSeconds, routeProgress } from '../js/magic/express-ride.js';
import { stationHouse, parcelOffice } from '../js/magic/lakeside-layout.js';
import { cameraFraction, moveInStation } from '../js/magic/station-navigation.js';

test('the journey advances to the terminus once and eases at both stops', () => {
  assert.equal(routeProgress(-.1), 0);
  assert.equal(routeProgress(1.1), 1);
  const progress = Array.from({ length: rideSeconds + 1 }, (_, second) => routeProgress(second / rideSeconds));
  assert.equal(progress[0], 0);
  assert.equal(progress.at(-1), 1);
  assert.ok(progress.slice(1).every((p, i) => p > progress[i] && p <= 1));
  const middle = Math.floor(rideSeconds / 2);
  const cruisingStep = progress[middle] - progress[middle - 1];
  assert.ok(progress[1] < cruisingStep && 1 - progress.at(-2) < cruisingStep);
});

test('passengers see each lake and the forest between departure and arrival', () => {
  const visited = new Map();
  for (let second = 0; second < rideSeconds; second++) {
    const { title } = rideSceneAt(routeProgress(second / rideSeconds));
    visited.set(title, (visited.get(title) ?? 0) + 1);
  }
  assert.deepEqual([...visited.keys()], ['离开国王十字', '沿湖向北', '穿过针叶林', '高地湖湾', '驶入霍格莫德']);
  for (const dwell of visited.values()) assert.ok(dwell >= 4, 'scenery should remain visible for several seconds');
});

test('the ramp from the carriage door to the lakeside is open in both directions', () => {
  for (const z of [-79, -78, -77]) {
    const traveler = { x: 82, z };
    moveInStation(traveler, -6, 0);
    assert.deepEqual(traveler, { x: 76, z });
    moveInStation(traveler, 6, 0);
    assert.deepEqual(traveler, { x: 82, z });
  }
});

test('both arrival buildings stop walking and the chase camera at their landward walls', () => {
  for (const house of [stationHouse, parcelOffice]) {
    const westWall = house.x - house.w / 2;
    const traveler = { x: westWall - 3, z: house.z };
    moveInStation(traveler, house.w + 6, 0);
    assert.ok(traveler.x > westWall - 3 && traveler.x < westWall);
    const from = { x: westWall - 3, y: 3, z: house.z }, to = { ...from, x: house.x };
    const hit = from.x + (to.x - from.x) * cameraFraction(from, to);
    assert.ok(hit > from.x && hit < westWall);
  }
});
