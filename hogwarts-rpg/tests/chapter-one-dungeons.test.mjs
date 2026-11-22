import test from 'node:test';
import assert from 'node:assert/strict';
import { createRoom, roomTargets, applyRoomIntent, advanceRoom, getRoomView, bindRoomEncounter, confirmRoomBossVictory } from '../chapter-one/dungeons/stone-route.mjs';
import { createEncounter } from '../chapter-one/combat/engine.mjs';

function interact(state, targetId, id = `${targetId}:${state.now}`) {
  const definition = roomTargets(state).find(t => t.id === targetId);
  const player = { id: 'p', hp: 100, position: definition.position, skills: ['mark', 'broom'] };
  let result = applyRoomIntent(state, { playerId: 'p', actionId: id, targetId, player, now: state.now });
  assert.equal(result.result.ok, true, result.result.code);
  return advanceRoom(result.state, { players: [player], now: state.now + definition.durationMs });
}
const sequence = {
  M28: ['music', 'gate'], M29: ['relax', 'fire', 'root-left', 'root-right', 'gate'],
  M30: ['observe', 'broom', 'key', 'gate'], M31: ['piece-0', 'safe', 'piece-2', 'safe', 'piece-1', 'safe', 'gate'],
  M32: ['trace', 'gate'], M33: ['clue-left', 'clue-right', 'potion-1', 'gate'],
};

test('all six pre-boss rooms can be solved sequentially with one to five players', () => {
  for (const size of [1, 2, 3, 4, 5]) for (const [roomId, targets] of Object.entries(sequence)) {
    let state = createRoom({ roomId, runId: `run-${size}`, playerIds: ['p', ...Array.from({ length: size - 1 }, (_, i) => `friend-${i}`)] });
    for (const targetId of targets) state = interact(state, targetId);
    assert.equal(state.status, 'completed', `${size} players ${roomId}`);
    assert.deepEqual(state.completionReceipt.participants, ['p'], 'idle players do not get retrospective participation');
    assert.equal(state.events.filter(e => e.type === 'room_completed').length, 1);
    if (roomId === 'M33') assert.equal(state.passageDoses, size);
    if (roomId === 'M32') assert.equal(state.completionReceipt.units, 0, 'already dead troll never grants combat XP');
  }
});

test('room actions enforce location, minimum time, skill learning and prerequisite order', () => {
  let state = createRoom({ roomId: 'M29', runId: 'run', playerIds: ['p'] });
  const player = { id: 'p', position: { x: 0, z: -6 }, skills: [] };
  assert.equal(applyRoomIntent(state, { playerId: 'p', player, actionId: 'skip', targetId: 'gate' }).result.code, 'MECHANISM_UNAVAILABLE');
  assert.equal(applyRoomIntent(state, { playerId: 'p', player, actionId: 'far', targetId: 'relax' }).result.code, 'OUT_OF_RANGE');
  player.position = { x: 0, z: 3 };
  state = applyRoomIntent(state, { playerId: 'p', player, actionId: 'relax', targetId: 'relax' }).state;
  state = advanceRoom(state, { now: 1999, players: [player] }); assert.equal(state.flags.relax, undefined);
  state = advanceRoom(state, { now: 2000, players: [player] }); assert.equal(state.flags.relax, true);
  const flying = createRoom({ roomId: 'M30', runId: 'fly', playerIds: ['p'] });
  assert.equal(applyRoomIntent(flying, { playerId: 'p', player, actionId: 'mark', targetId: 'observe' }).result.code, 'SKILL_NOT_LEARNED');
});

test('movement and disconnect cancel only current work, completed flags persist', () => {
  let state = createRoom({ roomId: 'M29', runId: 'run', playerIds: ['p'] });
  state = interact(state, 'relax');
  const player = { id: 'p', position: { x: -1.5, z: -.5 }, skills: [] };
  state = applyRoomIntent(state, { playerId: 'p', player, actionId: 'fire', targetId: 'fire' }).state;
  state = advanceRoom(state, { now: 2300, players: [{ ...player, position: { x: -1, z: -.5 } }] });
  assert.equal(state.pending.p, undefined); assert.equal(state.flags.fire, undefined); assert.equal(state.flags.relax, true);
  state = applyRoomIntent(state, { playerId: 'p', player, actionId: 'fire2', targetId: 'fire' }).state;
  state = advanceRoom(state, { now: 5000, players: [] });
  assert.equal(state.flags.fire, undefined); assert.equal(state.receipts.fire2.result.code, 'PLAYER_NOT_PRESENT');
});

test('key capture requires marked key, actual flight permission and height', () => {
  let state = createRoom({ roomId: 'M30', runId: 'key', playerIds: ['p'] });
  state = interact(state, 'observe');
  let target = roomTargets(state).find(t => t.id === 'key');
  const player = { id: 'p', position: target.position, skills: ['mark', 'broom'] };
  assert.equal(applyRoomIntent(state, { playerId: 'p', player, targetId: 'key', actionId: 'ground' }).result.code, 'MOUNT_AND_APPROACH_KEY');
  state = interact(state, 'broom'); target = roomTargets(state).find(t => t.id === 'key');
  assert.equal(applyRoomIntent(state, { playerId: 'p', player: { ...player, position: { ...target.position, y: 0 } }, targetId: 'key', actionId: 'low' }).result.code, 'MOUNT_AND_APPROACH_KEY');
  state = interact(state, 'key'); assert.equal(state.flags.key, true);
});

test('wrong chess move/potion do not advance, chess safety window times out without resetting past turns', () => {
  let state = createRoom({ roomId: 'M31', runId: 'chess', playerIds: ['p'] });
  state = interact(state, 'piece-1'); assert.equal(state.chessTurn, 0); assert.equal(state.failures, 1);
  state = interact(state, 'piece-0'); state = interact(state, 'safe'); assert.equal(state.chessTurn, 1);
  state = interact(state, 'piece-2');
  state = advanceRoom(state, { now: state.now + 5001, players: [] });
  assert.equal(state.chessCommandAt, null); assert.equal(state.chessTurn, 1);
  let potions = createRoom({ roomId: 'M33', runId: 'potions', playerIds: ['p'] });
  potions = interact(potions, 'clue-left'); potions = interact(potions, 'clue-right'); potions = interact(potions, 'potion-0');
  assert.equal(potions.flags.potion, undefined); assert.equal(potions.failures, 1);
});

test('room idempotency returns original receipt and rejects reused action with different target', () => {
  let state = createRoom({ roomId: 'M28', runId: 'same', playerIds: ['p'] });
  state = interact(state, 'music', 'a');
  const player = { id: 'p', position: { x: -1.5, z: 3 } };
  const retry = applyRoomIntent(state, { playerId: 'p', player, actionId: 'a', targetId: 'music' });
  assert.equal(retry.result.code, 'COMPLETED');
  assert.throws(() => applyRoomIntent(state, { playerId: 'p', player, actionId: 'a', targetId: 'gate' }), /ACTION_ID_CONFLICT/);
  assert.equal(getRoomView(state).receipts, undefined);
});

test('final room cannot complete without a bound actual zero-HP boss victory', () => {
  let room = createRoom({ roomId: 'M34', runId: 'final', playerIds: ['p'] });
  const encounter = createEncounter({ id: 'stone-attempt-1', kind: 'stone', players: [{ id: 'p', heroId: 'harry', level: 23 }], now: 0 });
  room = bindRoomEncounter(room, encounter);
  assert.throws(() => confirmRoomBossVictory(room, encounter), /BOSS_VICTORY_REQUIRED/);
  const won = structuredClone(encounter); won.status = 'won'; won.enemies['enemy-0'].hp = 0; won.mechanics.mirror = true; won.mechanics.passage = true; won.validParticipants = ['p'];
  assert.throws(() => confirmRoomBossVictory(room, { ...won, id: 'old-run' }), /ENCOUNTER_RUN_MISMATCH/);
  const completed = confirmRoomBossVictory(room, won); assert.equal(completed.status, 'completed');
  assert.equal(completed.completionReceipt.units, 20);
});
