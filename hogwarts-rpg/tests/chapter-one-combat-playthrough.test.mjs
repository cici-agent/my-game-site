import test from 'node:test';
import assert from 'node:assert/strict';
import { createEncounter, advanceEncounter, applyCombatIntent, moveCombatPlayer, mechanismTargets, rewardEligibility } from '../chapter-one/combat/engine.mjs';
import { contentData } from '../chapter-one/data/index.mjs';

// Ideal-input regression, not a human difficulty benchmark. Uses only public pure
// server operations at 200 ms intervals; no HP, stage, immunity or stats edits.
for (const kind of ['troll', 'stone']) test(`full-health ${kind} is solo-completable with frozen stats and real pillars`, () => {
  let state = createEncounter({ id: kind, kind, players: [{ id: 'p', heroId: 'harry', level: kind === 'troll' ? 18 : 23,
    skills: contentData.skills.filter(s => s.role === 'all' || s.role === 'harry').map(s => s.id) }] });
  const startingHp = state.enemies['enemy-0'].hp;
  let avoid = null, lastAttack = null, seq = 0;
  for (let now = 0; now < 300000 && state.status === 'active'; now += 200) {
    state = advanceEncounter(state, now);
    let player = state.players.p, enemy = state.enemies['enemy-0'];
    const target = mechanismTargets(state).find(t => !t.complete && t.enabled);
    if (enemy.attack && enemy.attack.id !== lastAttack) {
      lastAttack = enemy.attack.id; const a = enemy.attack;
      if (a.shape === 'line') avoid = { x: player.position.x + a.direction.z * 2.3, z: player.position.z - a.direction.x * 2.3 };
      else {
        const origin = a.shape === 'circle' ? a.aim : a.origin;
        let dx = player.position.x - origin.x, dz = player.position.z - origin.z;
        const length = Math.hypot(dx, dz) || 1;
        if (dx === 0 && dz === 0) dx = 1;
        const range = a.shape === 'circle' ? 2.4 : 5;
        avoid = { x: origin.x + dx / length * range, z: origin.z + dz / length * range };
      }
    }
    if (!enemy.attack) avoid = null;
    const goal = avoid ?? target?.position;
    if (goal && (!player.action || ['bolt', 'H1'].includes(player.action.skillId))) {
      const dx = goal.x - player.position.x, dz = goal.z - player.position.z, length = Math.hypot(dx, dz);
      const stop = avoid ? .1 : Math.min(1.3, target.range * .75);
      if (length > stop) {
        const step = Math.min(.6, length - stop);
        state = moveCombatPlayer(state, { playerId: 'p', position: { x: player.position.x + dx / length * step, z: player.position.z + dz / length * step }, now, sprint: true });
      }
    }
    player = state.players.p; enemy = state.enemies['enemy-0'];
    if (!player.action && target && Math.hypot(player.position.x - target.position.x, player.position.z - target.position.z) <= target.range) {
      state = applyCombatIntent(state, { playerId: 'p', actionId: `a${seq++}`, skillId: target.id === 'club' ? 'levitate' : 'interact', targetId: target.id, now }).state;
    }
    player = state.players.p;
    if (!player.action && !avoid) state = applyCombatIntent(state, { playerId: 'p', actionId: `a${seq++}`, skillId: 'bolt', aim: { x: enemy.position.x - player.position.x, z: enemy.position.z - player.position.z }, now }).state;
  }
  assert.equal(state.status, 'won'); assert.equal(state.enemies['enemy-0'].hp, 0);
  assert.equal(state.enemies['enemy-0'].maxHp, startingHp);
  assert.deepEqual(rewardEligibility(state), ['p']);
  assert.ok(state.players.p.hp > 0);
  assert.equal(state.mechanics[kind === 'troll' ? 'rescue' : 'mirror'], true);
  assert.equal(state.mechanics[kind === 'troll' ? 'levitated' : 'passage'], true);
});

for (const kind of ['troll', 'stone']) test(`five different heroes can finish full-health ${kind} with individual contribution`, () => {
  const heroes = ['harry', 'ron', 'hermione', 'neville', 'george'];
  let state = createEncounter({ id: `party-${kind}`, kind, players: heroes.map((heroId, index) => ({
    id: `p${index}`, heroId, level: kind === 'troll' ? 18 : 23, position: { x: (index - 2) * 1.1, z: 5 + index % 2 },
    skills: contentData.skills.filter(s => s.role === 'all' || s.role === heroId).map(s => s.id),
  })) });
  assert.equal(state.enemies['enemy-0'].maxHp, kind === 'troll' ? 35700 : 62000);
  const controls = {}; let sequence = 0;
  for (let now = 0; now < 300000 && state.status === 'active'; now += 200) {
    state = advanceEncounter(state, now);
    for (const id of Object.keys(state.players)) {
      let player = state.players[id], enemy = state.enemies['enemy-0'];
      if (player.hp <= 0) continue;
      const control = controls[id] ??= { avoid: null, lastAttack: null };
      const target = mechanismTargets(state).find(t => !t.complete && t.enabled);
      if (enemy.attack && enemy.attack.id !== control.lastAttack) {
        control.lastAttack = enemy.attack.id; const attack = enemy.attack;
        if (attack.shape === 'line') control.avoid = { x: player.position.x + attack.direction.z * 2.3, z: player.position.z - attack.direction.x * 2.3 };
        else {
          const origin = attack.shape === 'circle' ? [...attack.areas].sort((a, b) => Math.hypot(a.x - player.position.x, a.z - player.position.z) - Math.hypot(b.x - player.position.x, b.z - player.position.z))[0] : attack.origin;
          let dx = player.position.x - origin.x, dz = player.position.z - origin.z;
          const length = Math.hypot(dx, dz) || 1; if (dx === 0 && dz === 0) dx = 1;
          const range = attack.shape === 'circle' ? 2.4 : 5;
          control.avoid = { x: origin.x + dx / length * range, z: origin.z + dz / length * range };
        }
      }
      if (!enemy.attack) control.avoid = null;
      const goal = control.avoid ?? target?.position;
      if (goal && (!player.action || ['bolt', 'H1'].includes(player.action.skillId))) {
        const dx = goal.x - player.position.x, dz = goal.z - player.position.z, length = Math.hypot(dx, dz);
        const stop = control.avoid ? .1 : Math.min(1.3, target.range * .75);
        if (length > stop) {
          const step = Math.min(.6, length - stop);
          state = moveCombatPlayer(state, { playerId: id, position: { x: player.position.x + dx / length * step, z: player.position.z + dz / length * step }, sprint: true, now });
        }
      }
      player = state.players[id]; enemy = state.enemies['enemy-0'];
      if (!player.action && target && Math.hypot(player.position.x - target.position.x, player.position.z - target.position.z) <= target.range) state = applyCombatIntent(state, { playerId: id, actionId: `action${sequence++}`, skillId: target.id === 'club' ? 'levitate' : 'interact', targetId: target.id, now }).state;
      player = state.players[id];
      if (!player.action && !control.avoid) state = applyCombatIntent(state, { playerId: id, actionId: `action${sequence++}`, skillId: 'bolt', aim: { x: enemy.position.x - player.position.x, z: enemy.position.z - player.position.z }, now }).state;
    }
  }
  assert.equal(state.status, 'won'); assert.equal(state.enemies['enemy-0'].hp, 0);
  assert.deepEqual(rewardEligibility(state).sort(), heroes.map((_, i) => `p${i}`));
  assert.ok(Object.values(state.players).every(p => p.contribution.damage > 0));
});
