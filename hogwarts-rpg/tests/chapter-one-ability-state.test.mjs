import test from 'node:test';
import assert from 'node:assert/strict';
import { abilityState } from '../chapter-one/client/ability-state.mjs';
import { contentData } from '../chapter-one/data/index.mjs';
import { createEncounter, applyCombatIntent, advanceEncounter } from '../chapter-one/combat/engine.mjs';

function snapshot() {
  const skills = ['bolt', 'levitate', 'H1', 'dodge', 'mark', 'rescue'];
  const character = { id: 'c', heroId: 'harry', hp: 320, focus: 100, stats: { haste: .1 }, skills, potions: { health: 2, focus: 2 }, completedQuestIds: ['M04'] };
  const combat = { status: 'active', now: 1000, players: { c: { id: 'c', hp: 320, focus: 100, stats: { haste: .1 }, learnedSkillIds: skills, cooldowns: {}, gcdUntil: 0, potions: { health: 1, focus: 1 }, potionUses: 0, action: null } } };
  return { character, combat, now: 1000 };
}

test('skill and GCD countdowns use server deadlines and haste only shortens shared recovery', () => {
  const s = snapshot(), self = s.combat.players.c, source = contentData.skills.find(skill => skill.id === 'H1');
  self.cooldowns.H1 = 3500; self.gcdUntil = 1500;
  const state = abilityState({ ...s, skillId: 'H1' });
  assert.equal(state.cooldownSeconds, source.cooldownSeconds); assert.equal(state.focusCost, source.focusCost); assert.equal(state.castSeconds, source.castSeconds);
  assert.equal(state.status, 'cooldown'); assert.equal(state.remainingMs, 2500); assert.equal(state.cooldownDurationMs, 6000); assert.equal(state.gcdRemainingMs, 500);
  assert.equal(state.gcdMs, .8 / 1.1 * 1000);
  assert.equal(abilityState({ ...s, now: 3501, skillId: 'H1' }).enabled, true);
  self.stats.haste = 3; assert.equal(abilityState({ ...s, skillId: 'H1' }).gcdMs, 600); assert.equal(abilityState({ ...s, skillId: 'H1' }).cooldownSeconds, 6);
  self.cooldowns = {}; assert.equal(abilityState({ ...s, skillId: 'H1' }).status, 'gcd'); assert.equal(abilityState({ ...s, skillId: 'dodge' }).enabled, true);
});

test('zero combat stock is authoritative and both potion types share the successful-use limit', () => {
  const s = snapshot(), self = s.combat.players.c;
  self.potions.health = 0;
  const empty = abilityState({ ...s, skillId: 'potion-health' }); assert.equal(empty.count, 0); assert.equal(empty.enabled, false); assert.equal(empty.status, 'no-stock');
  self.potionUses = 1; self.cooldowns['potion-health'] = 61000;
  const remainingBottle = abilityState({ ...s, skillId: 'potion-focus' }); assert.equal(remainingBottle.count, 1); assert.equal(remainingBottle.status, 'potion-limit'); assert.equal(remainingBottle.potionLimitReached, true);
  assert.match(remainingBottle.reason, /合计.*1 次/);
  assert.equal(abilityState({ ...s, now: 90000, skillId: 'potion-focus' }).enabled, false, 'waiting for sixty seconds cannot grant another potion use');
});

test('levitation has an authoritative windup, a separate channel, and an expired action cannot lock the bar forever', () => {
  const s = snapshot(), self = s.combat.players.c;
  self.action = { id: 'spell-a', skillId: 'levitate', startAt: 1000, releaseAt: 1800, completeAt: 3800, channel: true };
  const windup = abilityState({ ...s, now: 1400, skillId: 'levitate' }); assert.equal(windup.cast.phase, 'windup'); assert.equal(windup.cast.progress, .5); assert.equal(windup.cast.remainingMs, 400);
  const channel = abilityState({ ...s, now: 2300, skillId: 'bolt' }); assert.equal(channel.cast.phase, 'channel'); assert.equal(channel.cast.durationMs, 2000); assert.equal(channel.cast.remainingMs, 1500); assert.equal(channel.enabled, false);
  assert.equal(abilityState({ ...s, now: 2300, skillId: 'dodge' }).enabled, true, 'side step may interrupt the caster');
  const ended = abilityState({ ...s, now: 3900, skillId: 'bolt', pending: { skillId: 'levitate', clientActionId: 'spell-a', startedAt: 990, status: 'sending' } });
  assert.equal(ended.cast, null); assert.equal(ended.enabled, true);
});

test('pending delivery displays uncertainty without inventing a released spell or a cooldown', () => {
  const s = snapshot(), pending = { skillId: 'H1', clientActionId: 'a', startedAt: 800, status: 'sending' };
  const state = abilityState({ ...s, skillId: 'H1', pending }); assert.equal(state.status, 'pending'); assert.equal(state.cast.phase, 'waiting'); assert.equal(state.cast.authoritative, false); assert.equal(state.cast.progress, null); assert.equal(state.cooldownRemainingMs, 0); assert.equal(state.cast.elapsedMs, 200);
  assert.equal(abilityState({ ...s, skillId: 'H1', pending: { ...pending, status: 'retrying' } }).cast.phase, 'retrying');
  s.combat.players.c.action = { id: 'a', skillId: 'H1', startAt: 950, releaseAt: 1100 };
  assert.equal(abilityState({ ...s, skillId: 'H1', pending }).cast.phase, 'windup');
});

test('the real engine committed levitation is shown as its two-second channel, not another windup', () => {
  let combat = createEncounter({ id: 'channel-ui', kind: 'troll', players: [{ id: 'c', heroId: 'harry', level: 18, skills: ['bolt', 'dodge', 'levitate'], position: { x: 0, y: 0, z: 2 } }], arena: { bounds: { minX: -14, maxX: 14, minZ: -14, maxZ: 14 }, obstacles: [] } });
  combat.enemies['enemy-0'].phase = 3; combat.enemies['enemy-0'].windowUntil = 6000; combat.enemies['enemy-0'].nextAttackAt = 6000;
  combat = applyCombatIntent(combat, { playerId: 'c', skillId: 'levitate', actionId: 'lift', targetId: 'club', aim: { x: 0, z: -1 }, now: 0 }).state;
  combat = advanceEncounter(combat, 800); assert.equal(combat.players.c.action.channelCommitted, true); assert.equal(combat.players.c.action.releaseAt, 2800);
  const character = { id: 'c', heroId: 'harry', skills: ['levitate'], hp: 100, focus: 100 };
  const state = abilityState({ skillId: 'levitate', character, combat, now: 1300 });
  assert.equal(state.cast.phase, 'channel'); assert.equal(state.cast.startedAt, 800); assert.equal(state.cast.durationMs, 2000); assert.equal(state.cast.progress, .25); assert.equal(state.cast.remainingMs, 1500); assert.equal(state.queueable, false);
});

test('resource, course, ownership and ended-battle reasons stay explicit', () => {
  const s = snapshot(); s.combat.players.c.focus = 0;
  assert.equal(abilityState({ ...s, skillId: 'H1' }).status, 'no-focus');
  s.combat.players.c.hp = 0; assert.equal(abilityState({ ...s, skillId: 'bolt' }).status, 'downed');
  s.combat.players.c.hp = 320; s.combat.status = 'won'; assert.equal(abilityState({ ...s, skillId: 'bolt' }).status, 'encounter-ended');
  assert.equal(abilityState({ ...s, skillId: 'R1' }).status, 'wrong-role');
  s.combat = null; s.character.skills = []; s.character.courseTrialSkillIds = ['levitate'];
  assert.equal(abilityState({ ...s, skillId: 'levitate' }).status, 'course-trial'); assert.equal(abilityState({ ...s, skillId: 'bolt' }).status, 'not-learned');
  s.character.pendingWorldAction = { skillId: 'levitate', releaseAt: 1800 }; s.character.lastAction = { skillId: 'levitate', startedAt: 1000 };
  assert.equal(abilityState({ ...s, now: 1400, skillId: 'levitate' }).cast.progress, .5);
  assert.equal(abilityState({ ...s, skillId: 'potion-health' }).status, 'combat-only');
  assert.equal(abilityState({ skillId: 'bolt' }).enabled, false);
});

test('only the final four hundred milliseconds of a pure cooldown or GCD can buffer a spell', () => {
  const s = snapshot(), self = s.combat.players.c; self.gcdUntil = 1350;
  assert.equal(abilityState({ ...s, skillId: 'H1' }).queueable, true);
  self.cooldowns.H1 = 1600; assert.equal(abilityState({ ...s, skillId: 'H1' }).queueable, false);
  self.cooldowns.H1 = 1300; self.action = { skillId: 'levitate', startAt: 0, releaseAt: 800, completeAt: 2800, channel: true };
  assert.equal(abilityState({ ...s, skillId: 'H1' }).queueable, false);
  self.action = null; self.focus = 0; assert.equal(abilityState({ ...s, skillId: 'H1' }).queueable, false);
});
