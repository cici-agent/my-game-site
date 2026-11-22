import { WALK_SPEED, RUN_SPEED, MAX_MOVE_CREDIT_SECONDS, movementPath } from '../movement.mjs';
import { replayMovement } from '../client/scene-geometry.mjs';
import { contentData } from '../data/index.mjs';
import { getHeroStats } from '../rules/index.mjs';
import { DEFAULT_ARENA, distance, position, direction, spellDirection, sweep, visible, slideMovement, findArenaPath } from './geometry.mjs';
import { creatureCollision, SPELL_MUZZLE_HEIGHT } from './collision-profiles.mjs';
export { DEFAULT_ARENA } from './geometry.mjs';

const skills = new Map(contentData.skills.map(skill => [skill.id, skill]));
const copy = value => structuredClone(value);
const rounded = n => Math.round((n + Number.EPSILON) * 100) / 100;
const living = state => Object.values(state.players).filter(player => player.hp > 0);
const hostile = state => Object.values(state.enemies).filter(enemy => enemy.hp > 0);
const personalSkill = { harry: 'H1', ron: 'R1', hermione: 'M1', neville: 'N1', george: 'G1' };
export class CombatError extends Error { constructor(code) { super(code); this.name = 'CombatError'; this.code = code; } }
function assert(condition, code) { if (!condition) throw new CombatError(code); }
function finite(value) { return Number.isFinite(value); }
function pointValid(p) { return p && finite(p.x) && finite(p.z) && (p.y === undefined || finite(p.y)); }
function identifier(id) { return typeof id === 'string' && /^[A-Za-z0-9][A-Za-z0-9:_-]{0,119}$/.test(id) && !['constructor', 'prototype', '__proto__'].includes(id); }
function emit(state, type, fields = {}, at = state.now) {
  const seq = ++state.eventSequence;
  const event = { ...fields, seq, id: `${state.id}:${seq}`, type, at };
  state.events.push(event); if (state.events.length > 160) state.events.shift(); return event;
}
function random(state) { let x = state.randomState; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; state.randomState = x >>> 0; return state.randomState / 4294967296; }
export function calculateDamage(raw, defense, attackerLevel, multiplier = 1) {
  const armor = Math.max(0, defense), k = 100 + 10 * (attackerLevel - 1);
  return rounded(Math.max(0, raw) * (1 - Math.min(.7, armor / (armor + k))) * multiplier);
}
export function createEncounter({ id = 'encounter', kind = 'monster', enemyId, players, now = 0, seed = 1827, arena = DEFAULT_ARENA } = {}) {
  assert(identifier(id) && finite(now) && now >= 0, 'INVALID_ENCOUNTER');
  assert(Array.isArray(players) && players.length >= 1 && players.length <= 5, 'PARTY_SIZE_1_TO_5');
  assert(new Set(players.map(p => p.id)).size === players.length && players.every(p => identifier(p.id)), 'INVALID_ROSTER');
  if (kind === 'quirrell') kind = 'stone';
  assert(['trainer', 'monster', 'troll', 'stone'].includes(kind), 'UNKNOWN_ENCOUNTER_KIND');
  const boss = ['troll', 'stone'].includes(kind);
  const template = boss ? contentData.bosses.find(e => e.id === (kind === 'troll' ? 'B1-E07' : 'B1-E15'))
    : contentData.enemies.find(e => e.id === (enemyId ?? (kind === 'trainer' ? 'PAPER-L1' : 'BOOKS-L10')));
  assert(template, 'UNKNOWN_ENEMY');
  const state = { schemaVersion: 1, id, kind, templateId: template.id, level: template.level, status: 'active',
    now, startedAt: now, lockedPlayerCount: players.length, lockedPlayerIds: players.map(p => p.id),
    arena: copy(arena), players: {}, enemies: {}, projectiles: [], effects: [], events: [], eventSequence: 0,
    randomState: (seed >>> 0) || 1, actionReceipts: {}, rescueBudget: Math.max(0, players.length - 1),
    mechanics: { dodged: false, rescue: false, levitated: false, mirror: false, passage: false },
    validParticipants: [], groupNextAttackAt: now + 2000, reward: { units: template.xpUnits, contentLevel: template.level, templateId: template.id },
  };
  for (const [index, input] of players.entries()) {
    const heroId = input.heroId ?? input.heroTemplateId;
    const level = input.level ?? 1;
    const base = getHeroStats(heroId, level);
    // These stats are constructed by the server; no public action can overwrite them.
    const stats = { ...base, ...(input.stats ?? {}) };
    for (const key of ['hp', 'spellPower', 'physicalDefense', 'magicDefense', 'focusMax', 'focusRegenPerSecond', 'crit', 'haste']) assert(finite(stats[key]) && stats[key] >= 0, 'INVALID_PLAYER_STATS');
    const learned = input.learnedSkillIds ?? input.skills ?? ['bolt', 'dodge'];
    assert(Array.isArray(learned) && learned.every(s => skills.has(s)), 'INVALID_SKILLS');
    const spawn = input.position ?? { x: (index - (players.length - 1) / 2) * 1.1, y: 0, z: 5 };
    assert(pointValid(spawn), 'INVALID_POSITION');
    if (input.hp !== undefined) assert(finite(input.hp) && input.hp >= 0 && input.hp <= stats.hp, 'INVALID_INITIAL_HP');
    if (input.focus !== undefined) assert(finite(input.focus) && input.focus >= 0 && input.focus <= stats.focusMax, 'INVALID_INITIAL_FOCUS');
    state.players[input.id] = { id: input.id, heroId, name: input.name ?? heroId, level, stats,
      position: position(spawn), yaw: 0, hp: input.hp ?? stats.hp, maxHp: stats.hp, focus: input.focus ?? stats.focusMax, maxFocus: stats.focusMax,
      learnedSkillIds: [...new Set(learned)], cooldowns: {}, gcdUntil: 0, focusResumeAt: now, action: null,
      lastMoveAt: now, lastMovePosition: position(spawn), movementAllowance: .08, downedUntil: null, rescued: false,
      protectedUntil: 0, rootedUntil: 0, herbCharges: 3, potionUses: 0, potions: { health: 1, focus: 1, ...(input.potions ?? {}) },
      contribution: { damage: 0, effectiveHealing: 0, controls: 0, mechanisms: 0, rescued: 0, avoided: 0 },
    };
  }
  const count = boss ? 1 : template.groupSize;
  for (let i = 0; i < count; i++) {
    const hp = boss ? template.hpByPlayers[players.length] : template.hpEach;
    const id = `enemy-${i}`;
    state.enemies[id] = { id, templateId: template.id, name: template.name, level: template.level,
      tier: boss ? 'boss' : template.tier, hp, maxHp: hp, physicalDefense: template.physicalDefense, magicDefense: template.magicDefense,
      position: { x: (i - (count - 1) / 2) * 1.8, y: 0, z: -1 - (i % 2) }, radius: boss ? .9 : .45, ...creatureCollision(template.id),
      phase: 1, phaseLocked: false, attack: null, attacks: copy(template.attacks ?? template.skills), attackCount: 0,
      hazardSlots: boss ? template.hazardSlotsByPlayers[players.length] : 1,
      nextAttackAt: now + 2000 + i * 2500, attackCooldowns: {}, targetId: null, threat: {},
      controlledUntil: 0, controlImmuneUntil: 0, decoyImmuneUntil: 0, forcedTarget: null, windowUntil: 0, windowExtended: false,
    };
  }
  emit(state, 'encounter_started', { kind, lockedPlayerCount: players.length });
  return state;
}
// Restore the current appearance on historical encounters without replacing
// their health, damage, cooldowns, threat or reward ledger.
function refreshTrainingAppearance(enemy) {
  if (!['PAPER-L1', 'BOX-L6'].includes(enemy.templateId)) return;
  const template = contentData.enemies.find(e => e.id === enemy.templateId);
  enemy.name = template.name; Object.assign(enemy, creatureCollision(enemy.templateId));
  for (const [index, attack] of (enemy.attacks ?? []).entries()) if (template.skills[index]) attack.name = template.skills[index].name;
  if (enemy.attack && template.skills[enemy.attack.index]) enemy.attack.name = template.skills[enemy.attack.index].name;
}
function participant(state, player, kind, amount = 1) {
  if (amount <= 0) return;
  player.contribution[kind] = rounded(player.contribution[kind] + amount);
  if (!state.validParticipants.includes(player.id)) state.validParticipants.push(player.id);
}
function cancel(state, player, reason) {
  if (!player.action) return;
  const action = player.action; player.action = null;
  emit(state, 'action_cancelled', { playerId: player.id, actionId: action.id, skillId: action.skillId, reason });
  if (state.actionReceipts[action.id]) state.actionReceipts[action.id].result = { ok: false, code: reason, actionId: action.id };
}
function takeDamage(state, player, raw, type, source) {
  if (player.hp <= 0 || state.now < player.protectedUntil) return 0;
  let damage = calculateDamage(raw, type === 'magic' ? player.stats.magicDefense : player.stats.physicalDefense, source.level);
  if (player.guardUntil > state.now) { damage = rounded(damage * .5); player.guardUntil = 0; }
  damage = Math.min(player.hp, damage); player.hp = rounded(player.hp - damage);
  if (damage > 0) {
    if (['N1', 'rescue', 'interact', 'potion-health', 'potion-focus'].includes(player.action?.skillId) || player.action?.channel) cancel(state, player, 'DAMAGE_INTERRUPTED');
    emit(state, 'player_damaged', { playerId: player.id, enemyId: source.id, damage, position: copy(player.position) });
  }
  if (player.hp <= 0) {
    player.downedUntil = state.now + 30000; cancel(state, player, 'DOWNED');
    emit(state, 'player_downed', { playerId: player.id, downedUntil: player.downedUntil });
  }
  return damage;
}
function phaseGoal(state, phase) {
  return state.kind === 'troll' ? phase === 1 ? state.mechanics.dodged : phase === 2 ? state.mechanics.rescue : state.mechanics.levitated
    : phase === 1 ? state.mechanics.mirror : phase === 2 ? state.mechanics.passage : true;
}
function updateBossPhase(state, enemy) {
  if (enemy.tier !== 'boss') return;
  while (enemy.phase < 3 && enemy.hp <= enemy.maxHp * (enemy.phase === 1 ? .7 : .35) + .01 && phaseGoal(state, enemy.phase)) {
    enemy.phase++; enemy.phaseLocked = false; enemy.attack = null;
    enemy.windowUntil = state.now + 6000; enemy.windowExtended = false; enemy.nextAttackAt = enemy.windowUntil;
    emit(state, 'boss_phase', { enemyId: enemy.id, phase: enemy.phase, windowUntil: enemy.windowUntil });
  }
}
function hitEnemy(state, enemy, player, raw, skillId, collision = {}) {
  if (enemy.hp <= 0) return;
  let damage = calculateDamage(raw, enemy.magicDefense, player.level);
  let floor = 0;
  if (enemy.tier === 'boss') {
    updateBossPhase(state, enemy);
    if (!phaseGoal(state, enemy.phase)) floor = enemy.maxHp * (enemy.phase === 1 ? .7 : enemy.phase === 2 ? .35 : .01);
  }
  damage = rounded(Math.max(0, Math.min(damage, enemy.hp - floor)));
  enemy.hp = rounded(enemy.hp - damage); enemy.threat[player.id] = (enemy.threat[player.id] ?? 0) + damage;
  participant(state, player, 'damage', damage);
  emit(state, damage > 0 ? 'enemy_damaged' : 'phase_locked', { enemyId: enemy.id, playerId: player.id, skillId, damage, hp: enemy.hp, position: copy(enemy.position), ...collision });
  if (enemy.tier === 'boss' && enemy.hp <= floor + .01 && floor > 0) {
    enemy.phaseLocked = true;
    if (enemy.windowUntil <= state.now) { enemy.windowUntil = state.now + 6000; enemy.attack = null; enemy.nextAttackAt = enemy.windowUntil; }
  }
  updateBossPhase(state, enemy);
  if (enemy.hp <= 0) { enemy.attack = null; emit(state, 'enemy_defeated', { enemyId: enemy.id, playerId: player.id }); }
}
function targeted(state, player, action) {
  const target = state.enemies[action.targetId] ?? state.players[action.targetId];
  const range = action.skill?.rangeMeters ?? 2;
  if (!target || distance(player.position, target.position) > range + .001 || !visible(player.position, target.position, state.arena)) return null;
  return target;
}
function castOrigin(state, player, aim) {
  const chest = { ...player.position, y: SPELL_MUZZLE_HEIGHT + player.position.y };
  const origin = { x: chest.x + aim.x * .35, y: chest.y + aim.y * .35, z: chest.z + aim.z * .35 };
  const obstruction = sweep(chest, origin, [], state.arena.obstacles, .08);
  if (obstruction) {
    const ratio = Math.max(0, obstruction.t - .001);
    origin.x = player.position.x + (origin.x - player.position.x) * ratio;
    origin.y = chest.y + (origin.y - chest.y) * ratio;
    origin.z = player.position.z + (origin.z - player.position.z) * ratio;
  }
  return origin;
}
function sweepSpell(a, b, targets, arena, radius = 0) {
  const hit = sweep(a, b, targets, arena.obstacles, radius);
  if (b.y < radius && b.y < a.y) {
    const groundT = Math.max(0, (a.y - radius) / (a.y - b.y));
    if (!hit || groundT <= hit.t) return { t: groundT, kind: 'wall', id: 'ground' };
  }
  return hit;
}
const along = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: (a.y ?? 0) + ((b.y ?? 0) - (a.y ?? 0)) * t, z: a.z + (b.z - a.z) * t });
export function mechanismTargets(state) {
  const enemy = Object.values(state.enemies)[0];
  if (state.kind === 'troll') return [
    { id: 'rescue-point', name: '救出被困学生', position: { x: 3, y: 0, z: 1 }, complete: state.mechanics.rescue, enabled: enemy.phase >= 2 && enemy.windowUntil > state.now, range: 2 },
    { id: 'club', name: '漂浮巨怪木棒', position: { ...enemy.position, x: enemy.position.x + 1 }, complete: state.mechanics.levitated, enabled: enemy.phase >= 3 && enemy.windowUntil > state.now, range: 8 },
  ];
  if (state.kind === 'stone') return [
    { id: 'mirror', name: '保护厄里斯魔镜', position: { x: -3, y: 0, z: 1 }, complete: state.mechanics.mirror, enabled: enemy.phase >= 1 && enemy.windowUntil > state.now, range: 2 },
    { id: 'passage', name: '开启安全通路', position: { x: 3, y: 0, z: 1 }, complete: state.mechanics.passage, enabled: enemy.phase >= 2 && enemy.windowUntil > state.now, range: 2 },
  ];
  return [];
}
function semanticError(state, player, action, releasing = false) {
  const id = action.skillId, enemy = state.enemies[action.targetId];
  if (id === 'H1') {
    if (!enemy || enemy.hp <= 0) return 'TARGET_INVALID';
    if (enemy.tier === 'boss' || enemy.controlImmuneUntil > state.now) return 'CONTROL_IMMUNE';
    if (!enemy.attack?.interruptible) return 'NOT_INTERRUPTIBLE';
    if (!releasing && !targeted(state, player, action)) return 'OUT_OF_RANGE_OR_BLOCKED';
  }
  if (id === 'R1') { if (!enemy || enemy.hp <= 0) return 'TARGET_INVALID'; if (!targeted(state, player, action)) return 'OUT_OF_RANGE_OR_BLOCKED'; }
  if (id === 'M1') {
    if (!enemy || enemy.windowUntil <= state.now || enemy.windowExtended) return 'NO_EXTENDABLE_WINDOW';
    if (!targeted(state, player, action)) return 'OUT_OF_RANGE_OR_BLOCKED';
  }
  if (id === 'N1') {
    const target = state.players[action.targetId];
    if (!target || target.hp <= 0) return 'TARGET_INVALID';
    if (target.herbUntil > state.now) return 'HERB_ALREADY_ACTIVE';
    if (player.herbCharges < 1) return 'NO_CHARGES';
    if (!targeted(state, player, action)) return 'OUT_OF_RANGE_OR_BLOCKED';
  }
  if (id === 'G1') {
    const point = action.aimPoint;
    if (!point || distance(player.position, point) > 6.001 || !visible(player.position, point, state.arena)) return 'INVALID_GROUND_TARGET';
    const valid = hostile(state).find(e => e.tier !== 'boss' && !e.attack && e.decoyImmuneUntil <= state.now && distance(e.position, point) <= 2);
    if (!valid) return 'NO_VALID_DECOY_TARGET';
    action.decoyTargetId = valid.id;
  }
  if (id === 'rescue') {
    const target = state.players[action.targetId];
    if (!target || target.hp > 0 || target.downedUntil <= state.now || target.rescued) return 'TARGET_NOT_RESCUABLE';
    if (state.rescueBudget < 1) return 'NO_RESCUE_CHARGES';
    if (Object.values(state.players).some(p => p.id !== player.id && p.action?.skillId === 'rescue' && p.action.targetId === target.id)) return 'RESCUE_RESERVED';
    if (!targeted(state, player, action)) return 'OUT_OF_RANGE_OR_BLOCKED';
  }
  if (id === 'levitate' || id === 'interact') {
    const target = mechanismTargets(state).find(t => t.id === action.targetId);
    if (!target || target.complete || !target.enabled) return 'MECHANISM_UNAVAILABLE';
    if ((target.id === 'club') !== (id === 'levitate')) return 'WRONG_MECHANISM_ACTION';
    if (distance(player.position, target.position) > target.range + .001 || !visible(player.position, target.position, state.arena)) return 'OUT_OF_RANGE_OR_BLOCKED';
  }
  if (id === 'broom') return 'FLIGHT_NOT_AUTHORIZED_IN_COMBAT';
  if (id.startsWith('potion-')) {
    const type = id.slice(7);
    if (player.potionUses >= 1 || (player.potions[type] ?? 0) < 1) return 'NO_POTION_USES';
  }
  return null;
}
function release(state, player) {
  const action = player.action;
  const problem = semanticError(state, player, action, true);
  if (problem) { cancel(state, player, problem); return; }
  const skill = action.skill, id = action.skillId;
  const cost = skill?.focusCost ?? 0;
  if (player.focus < cost) { cancel(state, player, 'NO_FOCUS'); return; }
  if (!action.channelCommitted) {
    player.focus = rounded(player.focus - cost);
    if (cost > 0) player.focusResumeAt = state.now + 2000;
    if (skill?.cooldownSeconds) player.cooldowns[id] = state.now + skill.cooldownSeconds * 1000;
  }
  const muzzle = castOrigin(state, player, action.aim);
  let rayEnd, rayHit;
  if (id === 'H1') {
    rayEnd = { x: muzzle.x + action.aim.x * 12, y: muzzle.y + action.aim.y * 12, z: muzzle.z + action.aim.z * 12 };
    rayHit = sweepSpell(muzzle, rayEnd, hostile(state), state.arena);
    if (rayHit) rayEnd = along(muzzle, rayEnd, rayHit.t);
  }
  if (!action.channelCommitted) emit(state, 'action_released', { playerId: player.id, actionId: action.id, skillId: id, position: muzzle, direction: action.aim, targetId: action.targetId, releaseAt: state.now, channelEndAt: action.completeAt, ...(rayEnd ? { endPosition: rayEnd, collision: rayHit?.kind ?? 'miss' } : {}) });
  if (action.channel && !action.channelCommitted) {
    action.channelCommitted = true; action.releaseAt = action.completeAt;
    state.actionReceipts[action.id].result = { ok: true, code: 'CHANNELING', actionId: action.id, completeAt: action.completeAt };
    return;
  }
  player.action = null;
  if (id === 'bolt') {
    state.projectiles.push({ id: action.id, ownerId: player.id, skillId: id, position: muzzle, direction: action.aim, speed: 24, radius: .08, distance: 0, range: 12, rawDamage: player.stats.spellPower * (random(state) < player.stats.crit ? 1.5 : 1) });
  } else if (id === 'H1') {
    const hit = rayHit;
    const enemy = hit?.kind === 'target' ? state.enemies[hit.id] : null;
    if (enemy && enemy.tier !== 'boss' && enemy.attack?.interruptible && enemy.controlImmuneUntil <= state.now) {
      const duration = enemy.tier === 'elite' ? 1000 : 2500 + (enemy.attack.releaseAt - state.now <= 550 ? 1000 : 0);
      enemy.attack = null; enemy.controlledUntil = state.now + duration; enemy.controlImmuneUntil = enemy.controlledUntil + (enemy.tier === 'elite' ? 8000 : 3000);
      participant(state, player, 'controls'); emit(state, 'enemy_interrupted', { playerId: player.id, enemyId: enemy.id, until: enemy.controlledUntil, actionId: action.id, impactPosition: rayEnd });
    } else emit(state, hit?.kind === 'wall' ? 'wall_hit' : 'spell_missed', { playerId: player.id, actionId: action.id, skillId: id, position: rayEnd, obstacleId: hit?.kind === 'wall' ? hit.id : undefined });
  } else if (id === 'R1') {
    const enemy = state.enemies[action.targetId];
    const duration = enemy.targetId && enemy.targetId !== player.id ? 2500 : 2000;
    player.guardUntil = state.now + 3000;
    if (!enemy.attack) {
      enemy.forcedTarget = { id: player.id, until: state.now + duration };
      if (enemy.tier !== 'boss') enemy.nextAttackAt += enemy.tier === 'elite' ? 1000 : 2000;
      participant(state, player, 'controls');
    }
  } else if (id === 'M1') {
    const enemy = state.enemies[action.targetId]; enemy.windowUntil += 2000; enemy.nextAttackAt = Math.max(enemy.nextAttackAt, enemy.windowUntil); enemy.windowExtended = true; participant(state, player, 'controls');
  } else if (id === 'N1') {
    const target = state.players[action.targetId], total = rounded(target.maxHp * .16 + player.stats.spellPower * .6);
    player.herbCharges--; target.herbUntil = state.now + 4000;
    state.effects.push({ id: action.id, kind: 'herb', playerId: player.id, targetId: target.id, nextAt: state.now + 1000, ticks: 0, total, healed: 0 });
  } else if (id === 'G1') {
    const enemy = state.enemies[action.decoyTargetId]; enemy.decoy = { position: action.aimPoint, until: state.now + 3000 }; enemy.decoyImmuneUntil = state.now + 8000; participant(state, player, 'controls');
  } else if (id === 'rescue') {
    const target = state.players[action.targetId]; state.rescueBudget--; target.rescued = true; target.downedUntil = null;
    target.hp = rounded(target.maxHp * .35); target.focus = rounded(target.maxFocus * .25); target.protectedUntil = state.now + 1500;
    participant(state, player, 'rescued'); emit(state, 'player_rescued', { playerId: player.id, targetId: target.id });
  } else if (id === 'interact' || id === 'levitate') {
    const key = { 'rescue-point': 'rescue', club: 'levitated', mirror: 'mirror', passage: 'passage' }[action.targetId];
    state.mechanics[key] = true; participant(state, player, 'mechanisms');
    const enemy = Object.values(state.enemies)[0];
    if (id === 'levitate' && player.heroId === 'hermione') enemy.windowUntil += 1000;
    emit(state, 'mechanism_completed', { playerId: player.id, targetId: action.targetId }); updateBossPhase(state, enemy);
  } else if (id.startsWith('potion-')) {
    const type = id.slice(7); player.potionUses++; player.potions[type]--;
    if (type === 'health') player.hp = Math.min(player.maxHp, rounded(player.hp + player.maxHp * .3));
    else player.focus = Math.min(player.maxFocus, rounded(player.focus + player.maxFocus * .4));
    player.cooldowns[id] = state.now + 60000;
  } else if (id === 'light') player.light = !player.light;
  else if (id === 'mark') player.markedTargetId = action.targetId ?? null;
  state.actionReceipts[action.id].result = { ok: true, code: 'RELEASED', actionId: action.id, releaseAt: state.now };
}
function chooseTarget(state, enemy) {
  const candidates = living(state); if (!candidates.length) return null;
  const forced = candidates.find(p => p.id === enemy.forcedTarget?.id && enemy.forcedTarget.until > state.now);
  if (forced) return forced;
  const current = candidates.find(p => p.id === enemy.targetId);
  const sorted = [...candidates].sort((a, b) => (enemy.threat[b.id] ?? 0) - (enemy.threat[a.id] ?? 0) || distance(a.position, enemy.position) - distance(b.position, enemy.position));
  if (current && (enemy.threat[sorted[0].id] ?? 0) <= (enemy.threat[current.id] ?? 0) * 1.1) return current;
  return sorted[0];
}
function resolveEnemyAttack(state, enemy) {
  const attack = enemy.attack; enemy.attack = null;
  let anyHit = false;
  const recordAvoid = player => {
    if (player.id !== attack.targetId || distance(player.position, attack.targetStartPosition ?? attack.aim) < .2) return;
    participant(state, player, 'avoided'); if (state.kind === 'troll') state.mechanics.dodged = true;
  };
  for (const player of living(state)) {
    if (!visible(attack.origin, player.position, state.arena)) {
      recordAvoid(player);
      continue;
    }
    const offset = { x: player.position.x - attack.origin.x, z: player.position.z - attack.origin.z };
    let hit = false;
    if (attack.shape === 'circle') hit = (attack.areas ?? [attack.aim]).some(point => distance(player.position, point) <= attack.radius + .28);
    else if (attack.shape === 'line') hit = !!sweep(attack.origin, { x: attack.origin.x + attack.direction.x * attack.range, z: attack.origin.z + attack.direction.z * attack.range }, [{ id: player.id, position: player.position, radius: .28 }], [], attack.radius);
    else hit = Math.hypot(offset.x, offset.z) <= attack.range + .28 && (offset.x * attack.direction.x + offset.z * attack.direction.z) / Math.max(.001, Math.hypot(offset.x, offset.z)) >= Math.cos(.8);
    if (hit && !attack.decoy) {
      anyHit = true;
      if (attack.damageType === 'control') { player.rootedUntil = state.now + (enemy.tier === 'elite' ? 3000 : 2000); cancel(state, player, 'HARD_CONTROL'); }
      else takeDamage(state, player, attack.rawDamage, attack.damageType, enemy);
    } else recordAvoid(player);
  }
  emit(state, 'enemy_attack_resolved', { enemyId: enemy.id, templateId: enemy.templateId, attackId: attack.id, attack: copy(attack), hit: anyHit, shape: attack.shape, position: attack.aim });
  if (attack.heavy || enemy.phaseLocked) {
    enemy.windowUntil = state.now + (enemy.tier === 'boss' ? 6000 : 2500); enemy.windowExtended = false;
    enemy.nextAttackAt = Math.max(enemy.nextAttackAt, enemy.windowUntil);
  } else enemy.nextAttackAt = Math.max(enemy.nextAttackAt, state.now + 600);
  updateBossPhase(state, enemy);
}
function enemyTick(state, enemy, dt) {
  if (enemy.hp <= 0 || enemy.controlledUntil > state.now) return;
  if (enemy.attack) { if (enemy.attack.releaseAt <= state.now) resolveEnemyAttack(state, enemy); return; }
  if (enemy.windowUntil > state.now) return;
  const target = chooseTarget(state, enemy); if (!target) return;
  enemy.targetId = target.id;
  const destination = enemy.decoy?.until > state.now ? enemy.decoy.position : target.position;
  const d = distance(enemy.position, destination), to = direction({ x: destination.x - enemy.position.x, z: destination.z - enemy.position.z });
  const desiredRange = state.kind === 'stone' || enemy.templateId.startsWith('PAPER') ? 8 : 2.3;
  const hasSight = visible(enemy.position, destination, state.arena);
  if (d > desiredRange || !hasSight) {
    const speed = enemy.tier === 'boss' ? 1.25 : 1.1;
    let steering = destination;
    if (sweep(enemy.position, destination, [], state.arena.obstacles, enemy.radius)) {
      if (!enemy.navigation || enemy.navigation.refreshAt <= state.now || distance(enemy.navigation.destination, destination) > 2) {
        enemy.navigation = { destination: copy(destination), refreshAt: state.now + 1500, points: findArenaPath(enemy.position, destination, state.arena, enemy.radius) };
      }
      while (enemy.navigation.points.length > 1 && distance(enemy.position, enemy.navigation.points[0]) < .3) enemy.navigation.points.shift();
      steering = enemy.navigation.points[0] ?? destination;
    } else enemy.navigation = null;
    const toward = direction({ x: steering.x - enemy.position.x, z: steering.z - enemy.position.z });
    enemy.position = slideMovement(enemy.position, { x: enemy.position.x + toward.x * speed * dt, y: 0, z: enemy.position.z + toward.z * speed * dt }, state.arena, enemy.radius);
  }
  if (!hasSight || state.now < enemy.nextAttackAt || state.now < state.groupNextAttackAt || d > (desiredRange === 8 ? 13 : 4.5)) return;
  const available = enemy.attacks.map((a, index) => ({ ...a, index })).filter(a => (enemy.attackCooldowns[a.index] ?? 0) <= state.now);
  if (!available.length) return;
  // Rotate into ready special attacks, with one shared queue for groups and bosses.
  const chosen = available.find(a => a.index === enemy.attackCount % enemy.attacks.length) ?? available[0];
  const heavy = chosen.index > 0;
  const shape = chosen.damageType === 'control' || chosen.index >= 2 ? 'circle' : state.kind === 'stone' || enemy.templateId.startsWith('PAPER') || enemy.templateId.startsWith('BOX') || enemy.templateId.startsWith('BOOKS') ? 'line' : heavy ? 'circle' : 'cone';
  enemy.attackCount++;
  enemy.attack = { id: `${enemy.id}:${enemy.attackCount}`, name: chosen.name, index: chosen.index,
    origin: copy(enemy.position), aim: copy(destination), direction: to, shape, radius: shape === 'circle' ? 1.3 : .24,
    range: desiredRange === 8 ? 13 : shape === 'line' ? 5 : 3.7, targetId: target.id, targetStartPosition: copy(target.position), decoy: Boolean(enemy.decoy?.until > state.now),
    rawDamage: chosen.rawDamage ?? 0, damageType: chosen.damageType, heavy,
    startAt: state.now, releaseAt: state.now + chosen.windupSeconds * 1000, interruptible: enemy.tier !== 'boss',
  };
  if (shape === 'circle') {
    const marked = [target, ...living(state).filter(p => p.id !== target.id)];
    enemy.attack.areas = marked.slice(0, chosen.index >= 2 ? enemy.hazardSlots : 1).map(p => copy(p.position));
  }
  enemy.attackCooldowns[chosen.index] = state.now + chosen.cooldownSeconds * 1000;
  enemy.nextAttackAt = state.now + chosen.cooldownSeconds * 1000;
  state.groupNextAttackAt = state.now + (Object.keys(state.enemies).length > 1 ? 2500 : chosen.windupSeconds * 1000);
  if (enemy.decoy?.until > state.now) enemy.decoy = null;
  emit(state, 'enemy_telegraph', { enemyId: enemy.id, ...copy(enemy.attack) });
}
function tick(state, to) {
  const dt = (to - state.now) / 1000; state.now = to;
  for (const player of Object.values(state.players)) {
    if (player.hp <= 0) continue;
    if (state.now >= player.focusResumeAt) player.focus = Math.min(player.maxFocus, rounded(player.focus + player.stats.focusRegenPerSecond * dt));
    if (player.dash) {
      const dash = player.dash, ratio = Math.min(1, (to - dash.startAt) / 500);
      player.position = slideMovement(player.position, { x: dash.start.x + dash.direction.x * 1.8 * ratio, y: player.position.y, z: dash.start.z + dash.direction.z * 1.8 * ratio }, state.arena);
      if (ratio >= 1) player.dash = null;
    }
    if (player.action && player.action.releaseAt <= state.now) release(state, player);
  }
  for (const effect of state.effects) {
    if (effect.kind !== 'herb' || effect.ticks >= 4 || effect.nextAt > state.now) continue;
    const target = state.players[effect.targetId], caster = state.players[effect.playerId];
    if (target.hp <= 0) { effect.ticks = 4; continue; }
    const portion = effect.ticks === 3 ? rounded(effect.total - effect.healed) : Math.floor(effect.total * 100 / 4) / 100;
    effect.healed = rounded(effect.healed + portion); effect.ticks++; effect.nextAt += 1000;
    const actual = rounded(Math.min(target.maxHp - target.hp, portion)); target.hp = rounded(target.hp + actual);
    participant(state, caster, 'effectiveHealing', actual);
    for (const enemy of hostile(state)) enemy.threat[caster.id] = (enemy.threat[caster.id] ?? 0) + actual * .5;
    emit(state, 'player_healed', { playerId: caster.id, targetId: target.id, amount: actual });
  }
  state.effects = state.effects.filter(e => e.ticks < 4);
  state.projectiles = state.projectiles.filter(projectile => {
    const travel = Math.min(projectile.range - projectile.distance, projectile.speed * dt);
    const next = { x: projectile.position.x + projectile.direction.x * travel, y: projectile.position.y + projectile.direction.y * travel, z: projectile.position.z + projectile.direction.z * travel };
    const hit = sweepSpell(projectile.position, next, hostile(state), state.arena, projectile.radius);
    if (hit) {
      const impactPosition = along(projectile.position, next, hit.t);
      if (hit.kind === 'target') hitEnemy(state, state.enemies[hit.id], state.players[projectile.ownerId], projectile.rawDamage, projectile.skillId, { actionId: projectile.id, impactPosition });
      else emit(state, 'wall_hit', { playerId: projectile.ownerId, actionId: projectile.id, skillId: projectile.skillId, obstacleId: hit.id, position: impactPosition });
      return false;
    }
    projectile.position = next; projectile.distance += travel;
    if (projectile.distance >= projectile.range - .001) { emit(state, 'spell_missed', { playerId: projectile.ownerId, actionId: projectile.id, skillId: projectile.skillId, position: copy(next) }); return false; }
    return true;
  });
  if (!hostile(state).length) { state.status = 'won'; state.completedAt = state.now; emit(state, 'encounter_won', { validParticipants: [...state.validParticipants] }); }
  if (state.status === 'active') for (const enemy of hostile(state)) enemyTick(state, enemy, dt);
  if (!living(state).length && state.status === 'active') { state.status = 'lost'; state.completedAt = state.now; emit(state, 'encounter_lost'); }
}
/** Returns a fresh JSON state; never mutates the caller's durable snapshot. */
export function advanceEncounter(input, now) {
  assert(finite(now) && now >= input.now, 'INVALID_SERVER_TIME');
  const state = copy(input);
  for (const enemy of Object.values(state.enemies)) {
    if (!finite(enemy.collisionHeight)) Object.assign(enemy, creatureCollision(enemy.templateId));
    refreshTrainingAppearance(enemy);
  }
  // Fixed bounded steps preserve swept collisions and chronological damage. Normal
  // room polls advance 1–4 steps; dormant battles naturally resolve before catchup.
  let steps = 0;
  while (state.status === 'active' && state.now < now && steps++ < 18000) tick(state, Math.min(now, state.now + 50));
  state.catchupPending = state.status === 'active' && state.now < now;
  if (state.status !== 'active') state.now = now;
  return state;
}
export function applyCombatIntent(input, intent) {
  const state = advanceEncounter(input, intent.now ?? input.now);
  const player = state.players[intent.playerId];
  const actionId = intent.actionId;
  assert(player && identifier(actionId), 'INVALID_ACTOR_OR_ACTION');
  const id = intent.skillId === 'special' ? personalSkill[player.heroId] : intent.skillId;
  const fingerprint = JSON.stringify([player.id, id, intent.targetId ?? null, intent.aim ?? intent.aimDirection ?? null, intent.aimPoint ?? null]);
  const prior = state.actionReceipts[actionId];
  if (prior) { assert(prior.fingerprint === fingerprint, 'ACTION_ID_CONFLICT'); return { state, result: copy(prior.result) }; }
  const reject = code => ({ state, result: { ok: false, code, actionId } });
  if (state.catchupPending) return reject('CATCHING_UP');
  if (state.status !== 'active') return reject('ENCOUNTER_FINISHED');
  if (id === 'cancel') { cancel(state, player, 'PLAYER_CANCELLED'); return { state, result: { ok: true, code: 'CANCELLED', actionId } }; }
  if (player.hp <= 0) return reject('DOWNED');
  if (player.rootedUntil > state.now && id !== 'mark' && id !== 'light') return reject('HARD_CONTROL');
  const skill = skills.get(id);
  const extra = ['interact', 'potion-health', 'potion-focus'].includes(id);
  if (!skill && !extra) return reject('UNKNOWN_SKILL');
  if (skill && !player.learnedSkillIds.includes(id)) return reject('SKILL_NOT_LEARNED');
  if (skill && skill.role !== 'all' && skill.role !== player.heroId) return reject('WRONG_ROLE');
  if (skill?.gcd && player.gcdUntil > state.now) return reject('GLOBAL_COOLDOWN');
  if ((player.cooldowns[id] ?? 0) > state.now) return reject('COOLDOWN');
  if (player.focus < (skill?.focusCost ?? 0)) return reject('NO_FOCUS');
  if (player.action && id !== 'dodge') return reject('ACTION_IN_PROGRESS');
  const aimRaw = intent.aimDirection ?? intent.aim ?? { x: 0, z: -1 };
  if (!pointValid(aimRaw) || (intent.aimPoint && !pointValid(intent.aimPoint))) return reject('INVALID_AIM');
  const targetId = intent.targetId ?? (id === 'N1' ? player.id : undefined);
  if (targetId !== undefined && !identifier(targetId)) return reject('INVALID_TARGET');
  const aimedFromChest = intent.aimPoint ? { x: intent.aimPoint.x - player.position.x, y: (intent.aimPoint.y ?? 0) - player.position.y - SPELL_MUZZLE_HEIGHT, z: intent.aimPoint.z - player.position.z } : aimRaw;
  const action = { id: actionId, skillId: id, skill: skill ? copy(skill) : null, targetId, aim: ['bolt', 'H1'].includes(id) ? spellDirection(aimedFromChest) : direction(aimRaw), aimPoint: intent.aimPoint ? position(intent.aimPoint) : undefined, startAt: state.now, startPosition: copy(player.position) };
  const problem = semanticError(state, player, action); if (problem) return reject(problem);
  player.protectedUntil = 0;
  if (skill?.gcd) player.gcdUntil = state.now + Math.max(.6, .8 / (1 + player.stats.haste)) * 1000;
  if (id === 'dodge') {
    cancel(state, player, 'DODGE_CANCELLED'); player.dash = { start: copy(player.position), direction: action.aim, startAt: state.now }; player.cooldowns.dodge = state.now + 3000;
    emit(state, 'action_released', { playerId: player.id, actionId, skillId: id, direction: action.aim, position: copy(player.position) });
    const result = { ok: true, code: 'RELEASED', actionId, releaseAt: state.now }; state.actionReceipts[actionId] = { fingerprint, result }; return { state, result };
  }
  const castSeconds = id === 'rescue' && player.heroId === 'neville' ? 2 : id === 'interact' ? 2 : id.startsWith('potion-') ? 1 : skill.castSeconds;
  // Boss club uses the required 2 s steady channel after the authored 0.8 s windup.
  action.channel = id === 'levitate';
  action.releaseAt = state.now + castSeconds * 1000;
  if (action.channel) action.completeAt = action.releaseAt + 2000;
  player.action = action;
  const result = { ok: true, code: 'ACCEPTED', actionId, startAt: state.now, releaseAt: action.releaseAt };
  state.actionReceipts[actionId] = { fingerprint, result };
  emit(state, 'action_started', { playerId: player.id, actionId, skillId: id, startAt: state.now, releaseAt: action.releaseAt, channelEndAt: action.completeAt, position: copy(player.position), direction: action.aim, targetId });
  if (action.releaseAt <= state.now) release(state, player);
  return { state, result: copy(state.actionReceipts[actionId].result) };
}
export function moveCombatPlayer(input, { playerId, position: next, yaw = 0, now = input.now, sprint = false, steps } = {}) {
  const state = advanceEncounter(input, now), player = state.players[playerId];
  assert(player && pointValid(next) && finite(yaw), 'INVALID_MOVEMENT');
  if (state.status !== 'active' || player.hp <= 0 || player.rootedUntil > state.now || player.dash) return state;
  const elapsed = Math.max(0, Math.min(MAX_MOVE_CREDIT_SECONDS * 1000, now - player.lastMoveAt));
  const maxSpeed = (sprint ? RUN_SPEED : WALK_SPEED) * (player.action?.skillId === 'levitate' && !player.action.channelCommitted ? .4 : 1);
  const path = movementPath(player.position, next, steps), delta = path.travel;
  const allowance = Math.min(maxSpeed * MAX_MOVE_CREDIT_SECONDS + .08, player.movementAllowance + maxSpeed * elapsed / 1000);
  assert(delta <= allowance + .000001, 'MOVEMENT_TOO_FAST');
  if ((delta > .03 || (next.y ?? 0) > .05) && (['rescue', 'N1', 'broom', 'interact', 'potion-health', 'potion-focus'].includes(player.action?.skillId) || player.action?.channelCommitted)) cancel(state, player, 'MOVEMENT_INTERRUPTED');
  if (sprint && player.action) cancel(state, player, 'SPRINT_CANCELLED');
  const moved = replayMovement(player.position, path.points, state.arena.bounds, state.arena.obstacles);
  player.movementAllowance = Math.min(.3, Math.max(0, allowance - delta));
  player.position = moved; player.yaw = yaw; player.lastMoveAt = now;
  return state;
}
export function rewardEligibility(state) { return state.status === 'won' ? [...state.validParticipants] : []; }
export function getEncounterView(state, playerId) {
  const view = copy(state);
  for (const enemy of Object.values(view.enemies)) refreshTrainingAppearance(enemy);
  delete view.randomState; delete view.actionReceipts;
  view.mechanismTargets = mechanismTargets(state);
  if (playerId) view.selfId = playerId;
  return view;
}
export const applyCombatAction = applyCombatIntent;
