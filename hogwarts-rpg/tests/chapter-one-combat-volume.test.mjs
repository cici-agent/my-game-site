import test from 'node:test';
import assert from 'node:assert/strict';
import { createEncounter, applyCombatIntent, advanceEncounter, getEncounterView } from '../chapter-one/combat/engine.mjs';
import { sweep } from '../chapter-one/combat/geometry.mjs';
import { creatureCollision } from '../chapter-one/combat/collision-profiles.mjs';

const arena = { bounds: { minX: -14, maxX: 14, minZ: -14, maxZ: 14 }, obstacles: [] };
function shoot({ enemyId = 'PAPER-L1', aim, position = { x: 0, y: 0, z: 5 }, obstacles = [] }) {
  let state = createEncounter({ id: 'volume', kind: 'monster', enemyId, arena: { ...arena, obstacles }, players: [{ id: 'p', heroId: 'harry', level: 6, skills: ['bolt', 'H1'], position }] });
  const before = state.enemies['enemy-0'].hp;
  state = applyCombatIntent(state, { playerId: 'p', skillId: 'bolt', actionId: 'aimed', aim, now: 0 }).state;
  state = advanceEncounter(state, 750);
  return { state, damaged: state.enemies['enemy-0'].hp < before };
}

test('3D aim hits the low spider body but passes overhead or strikes the ground', () => {
  const torso = shoot({ aim: { x: 0, y: -.15, z: -1 } });
  assert.equal(torso.damaged, true);
  const impact = torso.state.events.find(event => event.type === 'enemy_damaged');
  assert.equal(impact.actionId, 'aimed');
  assert.ok(impact.impactPosition.y > .15 && impact.impactPosition.y < .7);
  const above = shoot({ aim: { x: 0, y: .7, z: -1 } });
  assert.equal(above.damaged, false);
  assert.ok(above.state.events.some(event => event.type === 'spell_missed' && event.position.y > 5));
  const below = shoot({ aim: { x: 0, y: -.8, z: -1 } });
  assert.equal(below.damaged, false);
  const ground = below.state.events.find(event => event.type === 'wall_hit');
  assert.equal(ground.obstacleId, 'ground');
  assert.ok(Math.abs(ground.position.y - .08) < .001);
});

test('a low-flying bat is hit at chest height while downward shots miss underneath; an airborne muzzle preserves height', () => {
  assert.equal(shoot({ enemyId: 'BOX-L6', aim: { x: 0, y: 0, z: -1 } }).damaged, true);
  assert.equal(shoot({ enemyId: 'BOX-L6', aim: { x: 0, y: -.18, z: -1 } }).damaged, false);
  const airborne = shoot({ position: { x: 0, y: 1.5, z: 5 }, aim: { x: 0, y: -.4, z: -1 } });
  assert.equal(airborne.damaged, true);
  const release = airborne.state.events.find(event => event.type === 'action_released');
  assert.ok(release.position.y > 2.5 && release.direction.y < 0);
});

test('finite-height columns and boxes allow shots overhead and catch descending cap hits', () => {
  for (const shape of [{ shape: 'circle', x: 0, z: 0, radius: 1 }, { shape: 'box', minX: -1, maxX: 1, minZ: -1, maxZ: 1 }]) {
    const obstacle = { ...shape, id: 'pillar', height: 3 };
    assert.equal(sweep({ x: 0, y: 3.2, z: 3 }, { x: 0, y: 3.2, z: -3 }, [], [obstacle], .08), null);
    assert.equal(sweep({ x: 0, y: 1.2, z: 3 }, { x: 0, y: 1.2, z: -3 }, [], [obstacle], .08).kind, 'wall');
    const cap = sweep({ x: 0, y: 4, z: 0 }, { x: 0, y: 2, z: 0 }, [], [obstacle]);
    assert.equal(cap.kind, 'wall'); assert.equal(cap.t, .5);
  }
  const book = { id: 'book', position: { x: 0, y: 0, z: 0 }, radius: .45, ...creatureCollision('BOOKS-L10') };
  assert.equal(sweep({ x: 0, y: .2, z: 2 }, { x: 0, y: .2, z: -2 }, [book], []), null, 'flying books have empty space beneath them');
  assert.equal(sweep({ x: 0, y: 1.2, z: 2 }, { x: 0, y: 1.2, z: -2 }, [book], []).id, 'book');
});

test('all authoritative enemy views expose the shared physical height profile', () => {
  for (const [kind, enemyId] of [['monster', 'PAPER-L1'], ['monster', 'BOX-L6'], ['monster', 'BOOKS-L10'], ['monster', 'VINE-L14'], ['monster', 'ROOT-L16'], ['troll', 'B1-E07'], ['stone', 'B1-E15']]) {
    const state = createEncounter({ id: 'height', kind, enemyId, players: [{ id: 'p', heroId: 'harry', level: 18 }] });
    const enemy = getEncounterView(state).enemies['enemy-0'];
    assert.equal(enemy.collisionHeight, creatureCollision(enemyId).collisionHeight);
    assert.equal(enemy.collisionBase, creatureCollision(enemyId).collisionBase);
    assert.ok(state.arena.obstacles.every(obstacle => obstacle.height === 3));
  }
});
