import test from 'node:test';
import assert from 'node:assert/strict';
import { getFlightPermission } from '../chapter-one/rules/flight.mjs';

const character = overrides => ({ id: 'player', hp: 100, currentQuestId: 'M06', sceneId: 'SC09', skills: [], flying: false, position: { x: 0, y: 0, z: 0 }, ...overrides });
const course = { questSceneId: 'SC09', objectiveKind: 'flight' };

test('M06 authorises the whole course, including final landing before permanent learning', () => {
  for (const objectiveKind of ['flight', 'move']) {
    assert.deepEqual(getFlightPermission(character(), { ...course, objectiveKind }), { allowed: true, canLand: false, maxHeight: 3 });
  }
});

test('temporary flight objectives need their actual story scene and reject unrelated visits', () => {
  assert.equal(getFlightPermission(character({ currentQuestId: 'M14' }), course).allowed, true);
  assert.equal(getFlightPermission(character({ sceneId: 'SC04' }), course).allowed, false);
  assert.equal(getFlightPermission(character({ visitSceneId: 'SC04' }), course).allowed, false);
  assert.equal(getFlightPermission(character({ visitSceneId: 'SC09' }), course).allowed, true);
  assert.equal(getFlightPermission(character({ currentQuestId: 'M05' }), { ...course, objectiveKind: 'talk' }).allowed, false);
});

test('M30 authored flight objectives never bypass the room mount authorisation', () => {
  const c = character({ currentQuestId: 'M30', sceneId: 'SC14' }), options = { questSceneId: 'SC14', objectiveKind: 'flight' };
  assert.equal(getFlightPermission(c, options).allowed, false);
  assert.equal(getFlightPermission({ ...c, dungeonRoom: { roomId: 'M30', status: 'active', flyingPlayers: [] } }, options).allowed, false);
  assert.equal(getFlightPermission({ ...c, dungeonRoom: { roomId: 'M30', status: 'active', flyingPlayers: ['someone-else'] } }, options).allowed, false);
  const mounted = { ...c, dungeonRoom: { roomId: 'M30', status: 'active', flyingPlayers: [c.id] } };
  assert.equal(getFlightPermission(mounted, options).allowed, true);
  assert.equal(getFlightPermission({ ...mounted, dungeonRoom: { ...mounted.dungeonRoom, status: 'completed' } }, options).allowed, false);
  assert.equal(getFlightPermission({ ...mounted, dungeonRoom: { ...mounted.dungeonRoom, roomId: 'M29' } }, options).allowed, false);
  assert.equal(getFlightPermission({ ...mounted, sceneId: 'SC04' }, options).allowed, false);
});

test('a permanently learned broom permits free training only in SC09', () => {
  const c = character({ currentQuestId: 'M25', skills: ['broom'], visitSceneId: 'SC09' });
  assert.equal(getFlightPermission(c, { questSceneId: 'SC08', objectiveKind: 'talk' }).allowed, true);
  assert.equal(getFlightPermission({ ...c, sceneId: 'SC08', visitSceneId: 'SC08' }, { questSceneId: 'SC08', objectiveKind: 'talk' }).allowed, false);
  assert.equal(getFlightPermission({ ...c, skills: [] }, { questSceneId: 'SC08', objectiveKind: 'talk' }).allowed, false);
});

test('combat and death override both takeoff and airborne descent permission', () => {
  const airborne = character({ flying: true, position: { y: 2 } });
  for (const hp of [0, -1]) assert.deepEqual(getFlightPermission({ ...airborne, hp }, course), { allowed: false, canLand: false, maxHeight: 3 });
  assert.deepEqual(getFlightPermission(airborne, { ...course, inCombat: true }), { allowed: false, canLand: false, maxHeight: 3 });
});

test('an airborne character retains descent after course or dungeon permission is withdrawn', () => {
  const c = character({ currentQuestId: 'M30', sceneId: 'SC14', flying: true, position: { y: 2 }, dungeonRoom: { roomId: 'M30', status: 'completed', flyingPlayers: ['player'] } });
  assert.deepEqual(getFlightPermission(c, { questSceneId: 'SC14', objectiveKind: 'flight' }), { allowed: false, canLand: true, maxHeight: 3 });
  assert.equal(getFlightPermission({ ...c, flying: false }, { questSceneId: 'SC14' }).canLand, false);
  assert.equal(getFlightPermission({ ...c, position: { y: .04 } }, { questSceneId: 'SC14' }).canLand, false);
  assert.equal(getFlightPermission({ ...c, position: { y: .041 } }, { questSceneId: 'SC14' }).canLand, true);
});

test('replayed course defaults use the activity quest and permission reads do not mutate a save', () => {
  const c = character({ currentQuestId: 'M36', activity: { questId: 'M06' } }), before = structuredClone(c);
  Object.freeze(c.skills); Object.freeze(c.position); Object.freeze(c.activity); Object.freeze(c);
  assert.equal(getFlightPermission(c, { ...course, objectiveKind: 'move' }).allowed, true);
  assert.equal(getFlightPermission(c, { ...course, questId: 'M05', objectiveKind: 'move' }).allowed, false);
  assert.deepEqual(c, before);
});
