import test from 'node:test';
import assert from 'node:assert/strict';
import { HERO_PRESETS, ENEMY_PRESETS, normalizeHero, normalizeEnemy, deriveStats, createBattle, actBattle, stepBattle, simulateBattle, summarizeBattle } from '../js/magic/lab-rules.mjs';

const near = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-6, message ?? `${actual} ≠ ${expected}`);
const hero = overrides => ({ ...HERO_PRESETS[0].stats, crit: 0, regen: 0, ...overrides });
const enemy = overrides => ({ ...ENEMY_PRESETS[0].stats, power: 100, interval: 1, windup: 0.5, ...overrides });

test('defense has diminishing reduction, a cap, and opponent-level scaling', () => {
  const a = deriveStats(hero({ armor: 0, ward: 100 }));
  const b = deriveStats(hero({ armor: 100 }));
  const c = deriveStats(hero({ armor: 200 }));
  near(a.physicalReduction, 0);
  near(a.magicReduction, 0.5);
  near(b.physicalReduction, 0.5);
  near(c.physicalReduction, 2 / 3);
  assert.ok(c.physicalReduction - b.physicalReduction < b.physicalReduction - a.physicalReduction);
  near(deriveStats(hero({ armor: 2000 })).physicalReduction, 0.7);
  assert.ok(deriveStats(hero({ armor: 100 }), 10).physicalReduction < b.physicalReduction);
  near(b.effectivePhysicalHP, b.hp * 2);
});

test('physical, magic and mixed hits apply only the corresponding defense', () => {
  for (const [type, expected] of [['physical', 50], ['magic', 100], ['mixed', 75]]) {
    const state = createBattle({ hero: hero({ hp: 500, armor: 100, ward: 0 }), enemy: enemy({ type }) });
    stepBattle(state, 1);
    near(state.metrics.damageTaken, expected);
    near(state.metrics.rawIncoming, 100);
    near(state.metrics.mitigated, 100 - expected);
  }
});

test('armor reduction resolves before shield absorption, then actual HP loss', () => {
  const state = createBattle({ hero: hero({ hp: 500, power: 1, armor: 100 }), enemy: enemy() });
  assert.equal(actBattle(state, 'shield').ok, true);
  const capacity = state.shield;
  stepBattle(state, 1);
  near(state.metrics.mitigated, 50);
  near(state.metrics.absorbed, capacity);
  near(state.metrics.damageTaken, 50 - capacity);
  near(state.metrics.rawIncoming, state.metrics.mitigated + state.metrics.absorbed + state.metrics.damageTaken + state.metrics.incomingOverkill);
  assert.equal(state.shield, 0);
});

test('spell damage respects magic defense and records overkill separately', () => {
  const state = createBattle({ hero: hero({ power: 200 }), enemy: enemy({ hp: 50, armor: 2000, ward: 100 }) });
  assert.equal(actBattle(state, 'bolt').ok, true);
  assert.equal(state.status, 'won');
  near(state.metrics.rawOutgoing, 200);
  near(state.metrics.enemyMitigated, 100);
  near(state.metrics.damageDealt, 50);
  near(state.metrics.outgoingOverkill, 50);
  assert.equal(state.enemyHp, 0);
  assert.equal(actBattle(state, 'bolt').ok, false);
});

test('range and timed dodge avoid attacks; an early dodge expires', () => {
  const outside = createBattle({ hero: hero(), enemy: enemy() });
  stepBattle(outside, 1, { distance: 4 });
  near(outside.metrics.damageTaken, 0);
  assert.equal(outside.metrics.rangeMisses, 1);
  assert.equal(actBattle(outside, 'bolt', { distance: 13 }).ok, false);
  const timed = createBattle({ hero: hero(), enemy: enemy() });
  stepBattle(timed, 0.75);
  assert.equal(actBattle(timed, 'dodge').ok, true);
  stepBattle(timed, 0.25);
  assert.equal(timed.metrics.dodges, 1);
  near(timed.metrics.damageTaken, 0);
  const early = createBattle({ hero: hero(), enemy: enemy() });
  actBattle(early, 'dodge');
  stepBattle(early, 1);
  assert.equal(early.metrics.dodges, 0);
  assert.ok(early.metrics.damageTaken > 0);
});

test('cooldowns, focus and a live shield prevent repeated resource spending', () => {
  const state = createBattle({ hero: hero({ focus: 25, regen: 0 }), enemy: enemy({ interval: 8 }) });
  assert.equal(actBattle(state, 'shield').ok, true);
  near(state.focus, 5);
  assert.equal(actBattle(state, 'shield').ok, false);
  stepBattle(state, 1);
  assert.equal(actBattle(state, 'burst').ok, false);
  assert.equal(actBattle(state, 'bolt').ok, true);
  near(state.focus, 5);
  assert.equal(state.metrics.focusSpent, 20);
  stepBattle(state, 4);
  near(state.shield, 0);
  assert.ok(state.events.some(event => event.type === 'shield-expired'));
});

test('same seed and automatic strategy reproduce exactly across frame sizes', () => {
  const config = { heroId: 'george', enemy: ENEMY_PRESETS[2].stats, seed: 765, mode: 'auto', policy: 'balanced' };
  const a = createBattle(config);
  const b = createBattle(config);
  while (a.status === 'active') stepBattle(a, 0.016);
  while (b.status === 'active') stepBattle(b, 0.23);
  assert.deepEqual(summarizeBattle(a), summarizeBattle(b));
  assert.deepEqual(summarizeBattle(a), summarizeBattle(simulateBattle(config)));
});

test('raising physical defense changes survival but not outgoing damage rolls', () => {
  const config = { hero: hero({ hp: 5000, armor: 0 }), enemy: enemy({ hp: 10000 }), seed: 11, mode: 'auto', policy: 'offense' };
  const low = createBattle(config);
  const high = createBattle({ ...config, hero: { ...config.hero, armor: 100 } });
  stepBattle(low, 10);
  stepBattle(high, 10);
  near(high.metrics.damageTaken, low.metrics.damageTaken / 2);
  near(high.metrics.damageDealt, low.metrics.damageDealt);
});

test('haste increases actual attack frequency and defensive strategy spends opportunities', () => {
  const base = { hero: hero({ hp: 5000, haste: 0 }), enemy: enemy({ hp: 10000 }), mode: 'auto', policy: 'offense' };
  const slow = createBattle(base);
  const fast = createBattle({ ...base, hero: { ...base.hero, haste: 60 } });
  const guarded = createBattle({ ...base, policy: 'balanced' });
  stepBattle(slow, 15);
  stepBattle(fast, 15);
  stepBattle(guarded, 15);
  assert.ok(fast.metrics.damageDealt > slow.metrics.damageDealt);
  assert.ok(guarded.metrics.absorbed > 0);
  assert.ok(guarded.metrics.damageDealt < slow.metrics.damageDealt);
});

test('five presets have finite, distinct results and simulations stop at a bounded time', () => {
  const results = HERO_PRESETS.map(preset => summarizeBattle(simulateBattle({ heroId: preset.id, seed: 2026, policy: 'offense' })));
  assert.equal(new Set(results.map(result => `${result.elapsed}/${result.hp}`)).size, 5);
  for (const result of results) {
    assert.ok(['won', 'lost', 'timeout'].includes(result.status));
    assert.ok(result.elapsed > 0 && result.elapsed <= 120);
    for (const value of Object.values(result.metrics)) assert.ok(Number.isFinite(value));
    assert.ok(result.focus >= 0 && result.hp >= 0 && result.enemyHp >= 0);
  }
  const stalled = createBattle({ hero: hero({ hp: 5000 }), enemy: enemy({ power: 1 }) });
  stepBattle(stalled, 300);
  assert.equal(stalled.status, 'timeout');
  assert.equal(stalled.elapsed, 120);
  assert.ok(stalled.events.length <= 100);
});

test('invalid inputs are normalized, and snapshots do not mutate the supplied configuration', () => {
  const bad = normalizeHero({ hp: -50, power: Infinity, armor: NaN, crit: 900, haste: '', level: 2.7 });
  assert.equal(bad.hp, 50);
  assert.equal(bad.crit, 60);
  assert.equal(bad.level, 3);
  for (const value of Object.values(bad)) assert.ok(Number.isFinite(value));
  const monster = normalizeEnemy({ type: 'unknown', interval: -1, windup: 1000 });
  assert.equal(monster.type, 'physical');
  assert.ok(monster.windup < monster.interval);
  const source = hero();
  const state = createBattle({ hero: source });
  source.hp = 999;
  assert.notEqual(state.hero.hp, source.hp);
  assert.equal(actBattle(state, '__proto__').ok, false);
  stepBattle(state, NaN);
  assert.equal(state.elapsed, 0);
});
