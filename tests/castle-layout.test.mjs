import assert from 'node:assert/strict';
import test from 'node:test';
import { furnishCastleRoom } from '../js/magic/castle-furnishings.js';
import {
  CASTLE_ENTRY, FLOOR_HEIGHT, castleFloors, castleRooms, castlePassages,
  castleLocation, castlePassageAt, castleCameraFraction, nearCastleExit, moveInCastle, roomArrival,
} from '../js/magic/castle-layout.js';

// Collect real mesh footprints independently of WebGL so moving a bookcase into
// a doorway or onto a secret entrance breaks the route test.
const solids = [];
const draw = { box() {}, part() {}, image() {}, beam() {} };
for (const floor of castleFloors) {
  for (const room of floor.rooms) furnishCastleRoom(draw, room, floor, solids);
}
function walkTo(pos, x, z) {
  moveInCastle(pos, x - pos.x, z - pos.z, solids);
  assert.ok(Math.hypot(pos.x - x, pos.z - z) < .015, `blocked at ${JSON.stringify(pos)}, wanted (${x}, ${z})`);
}

function climb(pos, direction) {
  const base = pos.y;
  const first = direction > 0 ? -3 : 3;
  walkTo(pos, first, 0);
  walkTo(pos, first, -22.5);
  assert.ok(Math.abs(pos.y - base - direction * FLOOR_HEIGHT / 2) < .015);
  walkTo(pos, -first, -22.5);
  walkTo(pos, -first, 0);
  assert.ok(Math.abs(pos.y - base - direction * FLOOR_HEIGHT) < .015);
}

test('from the castle threshold a visitor can walk to every storey, enter its rooms and return', () => {
  assert.equal(new Set(castleRooms.map(r => r.id)).size, castleRooms.length);
  const pos = { ...CASTLE_ENTRY };
  assert.equal(castleLocation(pos).room.id, 'entrance');
  assert.equal(nearCastleExit(pos), false);
  walkTo(pos, 0, 23);
  assert.ok(nearCastleExit(pos));
  walkTo(pos, 0, 0);
  while (pos.y > castleFloors[0].y + .1) climb(pos, -1);
  const visited = new Set();
  for (const [index, floor] of castleFloors.entries()) {
    assert.equal(castleLocation(pos).level, floor.level);
    for (const room of floor.rooms) {
      if (room.secret) continue;
      const arrival = roomArrival(room);
      walkTo(pos, room.doorX, 0);
      walkTo(pos, arrival.x, arrival.z);
      assert.equal(castleLocation(pos).room.id, room.id);
      visited.add(room.id);
      const portal = castlePassages.find(p => p.from === room.id);
      if (portal) {
        walkTo(pos, portal.x, portal.z);
        assert.equal(castlePassageAt(pos), portal);
        const destination = { ...portal.destination };
        assert.equal(castleLocation(destination).room.id, portal.to);
        visited.add(portal.to);
        const back = castlePassages.find(p => p.from === portal.to && p.to === room.id);
        walkTo(destination, back.x, back.z);
        assert.equal(castlePassageAt(destination), back);
        Object.assign(pos, back.destination);
      }
      walkTo(pos, room.doorX, 0);
    }
    if (index < castleFloors.length - 1) climb(pos, 1);
  }
  assert.equal(visited.size, castleRooms.length);
  while (pos.y > .1) climb(pos, -1);
  walkTo(pos, 0, 0);
  walkTo(pos, 0, 23);
  assert.ok(nearCastleExit(pos));
});

test('a long stride cannot cross a wall, enter a sealed chamber or walk through a table', () => {
  const room = castleRooms.find(r => r.id === 'great-hall');
  const walker = { x: room.doorX - 7, z: 0, y: 0 };
  moveInCastle(walker, 0, -40);
  assert.ok(walker.z < -3 && walker.z > -4);
  walkTo(walker, room.doorX, walker.z);
  walkTo(walker, room.doorX, -9);
  const table = { level: 0, x1: room.doorX - 1, x2: room.doorX + 1, z1: -15, z2: -11 };
  moveInCastle(walker, 0, -12, [table]);
  assert.ok(walker.z > -11 && walker.z < -10);
  const sealed = castleRooms.find(r => r.id === 'chamber');
  const outside = { x: sealed.doorX, y: sealed.level * FLOOR_HEIGHT, z: 0 };
  moveInCastle(outside, 0, -14);
  assert.equal(castleLocation(outside).room, null);
  assert.ok(outside.z > sealed.doorZ);
});

test('no input can step across the stairwell void or jump to another storey', () => {
  const walker = { x: -3, y: 0, z: -6 };
  walkTo(walker, -3, -14);
  const foot = walker.y;
  moveInCastle(walker, 12, 0);
  assert.ok(walker.x < 0 && walker.x >= -.5);
  assert.equal(walker.y, foot);
  const top = { x: -3, y: castleFloors.at(-1).y, z: 0 };
  moveInCastle(top, 0, -25);
  assert.ok(top.z >= -8.01);
  assert.equal(top.y, castleFloors.at(-1).y);
});

test('camera path stays inside walls and under floors, while it can look through an open door', () => {
  const room = castleRooms.find(r => r.id === 'great-hall');
  const wallSide = { x: room.doorX - 7, y: 2, z: -2 };
  assert.ok(castleCameraFraction(wallSide, { ...wallSide, z: -10 }) < .25);
  const inDoor = { x: room.doorX, y: 2, z: -2 };
  assert.equal(castleCameraFraction(inDoor, { ...inDoor, z: -9 }), 1);
  assert.ok(castleCameraFraction(inDoor, { ...inDoor, y: 11 }) < .67);
  assert.equal(castleCameraFraction(inDoor, { ...inDoor, z: 2 }), 1);
  const tower = roomArrival(castleRooms.find(r => r.id === 'astronomy'));
  tower.y += 2;
  assert.ok(castleCameraFraction(tower, { ...tower, y: tower.y + 10 }) < .6);
});
