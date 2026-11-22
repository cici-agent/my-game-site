import test from 'node:test';
import assert from 'node:assert/strict';
import { WALK_SPEED, RUN_SPEED, PLAYER_RADIUS, JUMP_SPEED, GRAVITY, MAX_MOVE_STEPS, movementPath } from '../chapter-one/movement.mjs';
import { canOccupy, moveWithCollisions, replayMovement, standingFloor, correctionPlan } from '../chapter-one/client/scene-geometry.mjs';
import { getSceneNavigation } from '../chapter-one/client/scene-navigation.mjs';

const near = (actual, expected, message, epsilon = 1e-8) => assert(Math.abs(actual - expected) <= epsilon, `${message}: ${actual} != ${expected}`);
function nearPosition(actual, expected, message) {
  for (const axis of ['x', 'y', 'z']) near(actual[axis] ?? 0, expected[axis] ?? 0, `${message}.${axis}`);
}
function predict(from, frames, velocity, navigation) {
  const points = []; let at = { ...from };
  for (let frame = 0; frame < frames; frame++) {
    at = moveWithCollisions(at, { x: at.x + velocity.x / 60, y: at.y, z: at.z + velocity.z / 60 }, navigation.bounds, navigation.walls);
    points.push({ ...at });
  }
  return points;
}
function deltas(from, points) {
  let previous = from;
  return points.map(point => {
    const step = { dx: point.x - previous.x, dy: (point.y ?? 0) - (previous.y ?? 0), dz: point.z - previous.z };
    previous = point; return step;
  });
}

test('movement paths charge the full route, including a return to the starting endpoint', () => {
  const from = { x: 0, y: 0, z: 0 };
  const route = movementPath(from, from, [{ dx: 1, dy: 0, dz: 0 }, { dx: 0, dy: .2, dz: 1 }, { dx: -1, dy: -.2, dz: 0 }, { dx: 0, dy: 0, dz: -1 }]);
  near(route.travel, 4, 'a zero-distance endpoint must not hide four metres of travel');
  assert.equal(route.points.length, 4);
  nearPosition(route.points.at(-1), from, 'closed route endpoint');
  const legacy = movementPath(from, { x: 3, y: .5, z: 4 });
  near(legacy.travel, 5, 'legacy direct route');
  nearPosition(legacy.points.at(-1), { x: 3, y: .5, z: 4 }, 'legacy endpoint');
});

test('movement paths reject unbounded or non-finite input before collision replay', () => {
  const from = { x: 0, y: 0, z: 0 }, zero = { dx: 0, dy: 0, dz: 0 };
  const invalid = [
    Array.from({ length: MAX_MOVE_STEPS + 1 }, () => ({ ...zero })),
    [{ ...zero, dx: Infinity }], [{ ...zero, dz: NaN }], [{ ...zero, dy: '0' }],
    [{ dx: 0, dz: 0 }], [null], {},
  ];
  for (const steps of invalid) assert.throws(() => movementPath(from, from, steps), error => error.code === 'INVALID_MOVEMENT_STEPS');
  assert.equal(movementPath(from, from, Array.from({ length: MAX_MOVE_STEPS }, () => ({ ...zero }))).points.length, MAX_MOVE_STEPS);
});

test('relative steps start at the authority pose and cannot teleport to an unrelated client endpoint', () => {
  const from = { x: 2, y: 0, z: 1 }, untrustedEndpoint = { x: 100, y: 0, z: -100 };
  const path = movementPath(from, untrustedEndpoint, [{ dx: .05, dy: 0, dz: -.1 }]);
  nearPosition(path.points[0], { x: 2.05, y: 0, z: .9 }, 'only the bounded relative input is replayed');
  near(path.travel, Math.hypot(.05, .1), 'endpoint discrepancy is not authorised travel');
  const standing = movementPath(from, untrustedEndpoint, []);
  assert.deepEqual(standing.points, []);
  near(standing.travel, 0, 'standing rotation has no travel');
  nearPosition(replayMovement(from, standing.points, [-5, 5, -5, 5], []), from, 'standing cannot teleport');
});

test('SC12 nine-frame run around a real pillar replays the curved route without a server bounce', () => {
  const navigation = getSceneNavigation('SC12'), from = { x: -5.6, y: 0, z: -.1 }, angle = Math.PI * .75;
  const points = predict(from, 9, { x: Math.cos(angle) * RUN_SPEED, z: Math.sin(angle) * RUN_SPEED }, navigation);
  assert(points.every(point => canOccupy(point, navigation.walls, PLAYER_RADIUS)));
  const path = movementPath(from, points.at(-1), deltas(from, points));
  const accepted = replayMovement(from, path.points, navigation.bounds, navigation.walls);
  nearPosition(accepted, points.at(-1), 'replayed prediction');
  assert(accepted.z > .2, 'the player must actually move around the pillar');
  assert(path.travel <= RUN_SPEED * .15 + 1e-8, 'colliding/sliding never increases the charged travel');
});

test('a character slides along a narrow door jamb and passes the opening without crossing either wall', () => {
  const navigation = { bounds: [-4, 4, -5, 5], walls: [{ x: -1.05, z: 0, w: 1, d: 4, height: 3 }, { x: 1.05, z: 0, w: 1, d: 4, height: 3 }] };
  const from = { x: 0, y: 0, z: 1.8 }, velocity = { x: WALK_SPEED * .4, z: -WALK_SPEED * .9 };
  const points = predict(from, 96, velocity, navigation);
  assert(points.every(point => canOccupy(point, navigation.walls, PLAYER_RADIUS)), 'every intermediate pose remains outside the door frame');
  assert(points.at(-1).z < -1.2, 'pressing diagonally into a jamb still permits forward progress');
  assert(points.at(-1).x <= .55 - PLAYER_RADIUS + 1e-8);
  nearPosition(replayMovement(from, points, navigation.bounds, navigation.walls), points.at(-1), 'doorway replay');
});

test('replaying malicious long steps still cannot tunnel through a wall', () => {
  const from = { x: -2, y: 0, z: 0 }, walls = [{ x: 0, z: 0, w: .1, d: 5, height: 3 }];
  const accepted = replayMovement(from, [{ x: 2, y: 0, z: 0 }, { x: 3, y: 0, z: 1 }], [-5, 5, -5, 5], walls);
  assert(accepted.x <= -.05 - PLAYER_RADIUS + .001);
  assert(canOccupy(accepted, walls, PLAYER_RADIUS));
});

test('SC01 low furniture supports a landing across the complete character footprint', () => {
  const navigation = getSceneNavigation('SC01');
  const wall = navigation.walls.find(w => w.x === -7.25 && w.z === -1 && w.height === 1.1);
  assert(wall, 'the regression uses a real rendered station suitcase');
  const landing = { x: -6.41, y: .98, z: -1 };
  near(standingFloor(landing, 1.15, [wall]), wall.height, 'capsule edge landing support');
  const accepted = replayMovement({ ...landing, y: 1.15 }, [landing], navigation.bounds, [wall]);
  near(accepted.y, wall.height, 'authoritative landing elevation');
  assert(canOccupy(accepted, [wall], PLAYER_RADIUS));
});

test('an old save overlapping a low furniture edge can walk outward but cannot move deeper through it', () => {
  const navigation = getSceneNavigation('SC01');
  const wall = navigation.walls.find(w => w.x === -7.25 && w.z === -1 && w.height === 1.1);
  const from = { x: -6.41, y: 0, z: -1 };
  assert.equal(canOccupy(from, [wall], PLAYER_RADIUS), false, 'fixture must begin in the former trapped strip');
  let at = from;
  for (let frame = 0; frame < 60; frame++) {
    const next = moveWithCollisions(at, { ...at, x: at.x + .02 }, navigation.bounds, [wall]);
    assert(next.x >= at.x - 1e-8, 'recovery must follow the requested outward direction'); at = next;
  }
  assert(canOccupy(at, [wall], PLAYER_RADIUS));
  assert(at.x > from.x + .5, 'the former trap no longer blocks ordinary walking');
  const inward = moveWithCollisions(from, { ...from, x: from.x - .02 }, navigation.bounds, [wall]);
  assert(inward.x >= from.x - 1e-8, 'overlap recovery is not permission to walk through a wall');
});

test('rounded rectangle corners use the same footprint for collision and landing support', () => {
  const walls = [{ x: 0, z: 0, w: 1, d: 1, height: 1 }];
  for (const point of [{ x: .7, y: .9, z: .7 }, { x: .75, y: .9, z: .75 }]) {
    const intersects = !canOccupy({ ...point, y: 0 }, walls, PLAYER_RADIUS);
    assert.equal(standingFloor(point, 1.05, walls) > 0, intersects, `corner ${point.x},${point.z}`);
  }
});

test('jump samples return to the floor and stay within the authorised jump envelope', () => {
  let y = 0, velocity = JUMP_SPEED, peak = 0; const points = [];
  for (let frame = 0; frame < 60; frame++) { velocity -= GRAVITY / 60; y = Math.max(0, y + velocity / 60); peak = Math.max(peak, y); points.push({ x: 0, y, z: -frame * WALK_SPEED / 60 }); }
  assert(peak > 1 && peak < 1.4, 'the visible jump fits the server jump envelope');
  const accepted = replayMovement({ x: 0, y: 0, z: 0 }, points, [-5, 5, -5, 5], []);
  near(accepted.y, 0, 'landing');
  near(accepted.z, points.at(-1).z, 'horizontal jump movement');
});

test('a delayed acknowledgement preserves input predicted after the transmitted position', () => {
  const local = { x: 5, y: .6, z: -2 }, sent = { x: 3, y: .3, z: -1 }, server = { x: 2, y: .2, z: -.5 };
  const plan = correctionPlan(local, server, { x: 1, y: 0, z: 0 }, 0, { acknowledgedSequence: 11, previousAcknowledgedSequence: 10, acknowledgedPosition: sent });
  assert.notEqual(plan.mode, 'none');
  nearPosition(plan.delta, { x: -1, y: -.1, z: .5 }, 'authoritative correction');
  nearPosition(plan.target, { x: 4, y: .5, z: -1.5 }, 'pending prediction preserved');
  const matched = correctionPlan(local, sent, { x: 1, y: 0, z: 0 }, 0, { acknowledgedSequence: 11, previousAcknowledgedSequence: 10, acknowledgedPosition: sent });
  assert.equal(matched.mode, 'none', 'accepted predicted movement is not an error even while local input has advanced');
});

test('duplicate and out-of-order acknowledgements cannot drag a moving character back', () => {
  const local = { x: 8, y: 0, z: 0 }, previous = { x: 2, y: 0, z: 0 };
  for (const sequence of [9, 10]) {
    const plan = correctionPlan(local, sequence === 9 ? { x: 0, y: 0, z: 0 } : previous, previous, 20, { acknowledgedSequence: sequence, previousAcknowledgedSequence: 10, acknowledgedPosition: { x: 1, y: 0, z: 0 } });
    assert.equal(plan.mode, 'none', `sequence ${sequence} must not mistake prediction lead for a collision`);
  }
});

test('server movement with an unchanged acknowledgement applies only the new authoritative displacement', () => {
  const plan = correctionPlan({ x: 5, y: 0, z: 1 }, { x: 2.5, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, 0, { acknowledgedSequence: 10, previousAcknowledgedSequence: 10 });
  assert.notEqual(plan.mode, 'none');
  nearPosition(plan.delta, { x: .5, y: 0, z: 0 }, 'server-driven displacement');
  nearPosition(plan.target, { x: 5.5, y: 0, z: 1 }, 'predicted lead is retained');
});

test('an explicitly rejected movement corrects its sent endpoint without discarding newer input', () => {
  const plan = correctionPlan({ x: 5, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, { x: 2, y: 0, z: 0 }, 0, { acknowledgedSequence: 10, previousAcknowledgedSequence: 10, acknowledgedPosition: { x: 3, y: 0, z: 0 }, rejectedMovement: true });
  assert.notEqual(plan.mode, 'none');
  nearPosition(plan.delta, { x: -1, y: 0, z: 0 }, 'rejection delta');
  nearPosition(plan.target, { x: 4, y: 0, z: 0 }, 'input after rejected request survives');
});
