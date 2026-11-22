import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  contentVersion, HERO_TEMPLATE_IDS, LEVEL_CAP, MAX_XP_CENTS, RuleValidationError,
  getInitialCharacterRules, getLevelFromXpCents, getXpProgress, getHeroStats,
  calculateRepeatXpCents, settleXp, getBagCapacity, getSkillEligibility,
  getRewardEvent, getSkillDefinition, decimalXpToCents, formatXpCents, ruleContract,
} from '../chapter-one/rules/index.mjs';
import { growthData, contentData, contentManifest } from '../chapter-one/data/index.mjs';
import { validateSources } from '../scripts/generate-chapter-one.mjs';

const projectRoot = new URL('../../', import.meta.url);
const gameRoot = new URL('../', import.meta.url);
const sourceKeys = ['xp', 'gameplay', 'quests', 'training', 'ledger', 'combat', 'experience', 'economy', 'world', 'inventory', 'journal', 'spells'];
const sources = Object.fromEntries(await Promise.all(contentManifest.sourceHashes.map(async (row, index) => [
  sourceKeys[index], JSON.parse(await readFile(new URL(row.path, projectRoot), 'utf8')),
])));
const invalid = (fn, code) => assert.throws(fn, error => error instanceof RuleValidationError && (!code || error.code === code));

test('generated content is reproducible and all 12 source hashes still match', async () => {
  const result = spawnSync(process.execPath, ['scripts/generate-chapter-one.mjs', '--check'], { cwd: fileURLToPath(gameRoot), encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(JSON.parse(result.stdout).contentVersion, contentVersion);
  assert.equal(contentManifest.sourceHashes.length, 12);
  for (const row of contentManifest.sourceHashes) {
    assert.equal(createHash('sha256').update(await readFile(new URL(row.path, projectRoot))).digest('hex'), row.sha256, row.path);
  }
  assert.equal(growthData.contentVersion, contentVersion);
  assert.equal(contentData.contentVersion, contentVersion);
  assert.deepEqual(contentManifest.counts, { questCount: 36, heroAttributeRows: 200, skillCount: 12, itemCount: 44, sceneCount: 16, referenceEventCount: 127 });
});

test('all 40 frozen XP thresholds match the source at exact and preceding cents', () => {
  assert.equal(LEVEL_CAP, 40);
  assert.equal(MAX_XP_CENTS, 228268017);
  assert.equal(getLevelFromXpCents(0), 1);
  for (const row of sources.xp.levels) {
    const threshold = decimalXpToCents(row.cumulativeXp);
    assert.equal(getLevelFromXpCents(threshold), row.level, `threshold ${row.level}`);
    if (row.level > 1) assert.equal(getLevelFromXpCents(threshold - 1), row.level - 1, `preceding cent ${row.level}`);
    assert.deepEqual(growthData.levels[row.level - 1], { level: row.level, cumulativeXpCents: threshold, xpToNextCents: row.xpToNextCents });
  }
  assert.deepEqual(getXpProgress(MAX_XP_CENTS), { level: 40, totalXpCents: MAX_XP_CENTS, thresholdXpCents: MAX_XP_CENTS, earnedThisLevelCents: 0, requiredThisLevelCents: 0, remainingXpCents: 0, atCap: true });
});

test('all 200 immutable hero rows match approved values, including HALF_UP defense ties', () => {
  assert.deepEqual(HERO_TEMPLATE_IDS, ['harry', 'ron', 'hermione', 'neville', 'george']);
  let compared = 0;
  for (const hero of sources.gameplay.heroBaselinesAndLevels) for (const row of hero.levels) {
    assert.deepEqual(getHeroStats(hero.id, row.level), row);
    assert.ok(Object.isFrozen(getHeroStats(hero.id, row.level)));
    compared++;
  }
  assert.equal(compared, 200);
  assert.equal(getHeroStats('harry', 2).physicalDefense, 50); // 45 × 1.1 = 49.5
  assert.equal(getHeroStats('harry', 2).magicDefense, 50);
  assert.equal(getHeroStats('ron', 2).physicalDefense, 105); // 95 × 1.1 = 104.5
  assert.throws(() => { getHeroStats('harry', 1).hp = 1; }, TypeError);
});

test('HALF_UP uses exact decimal arithmetic rather than binary floating multiplication', () => {
  for (const [value, expected] of [['1.005', 101], [1.005, 101], ['1.004999999999999999', 100], ['0.005', 1], ['0.004999999999999999', 0], ['71565.11', 7156511]]) {
    assert.equal(decimalXpToCents(value), expected);
  }
  assert.equal(formatXpCents(7156511), '71565.11');
  assert.equal(formatXpCents(1), '0.01');
  assert.equal(calculateRepeatXpCents({ characterLevel: 1, contentLevel: 1, units: '0.0002' }), 1); // 25 × .0002 XP = .005 XP
  assert.equal(calculateRepeatXpCents({ characterLevel: 1, contentLevel: 1, units: '0.000199999999999999' }), 0);
});

test('all 127 reference events replay individually to 71565.11 XP and level 24', () => {
  assert.equal(contentData.referenceReplay.length, 127);
  assert.equal(contentData.rewardEvents.length, 127);
  let totalXpCents = 0;
  for (const expected of contentData.referenceReplay) {
    const result = settleXp({ totalXpCents, eventId: expected.eventId });
    assert.equal(result.levelBefore, expected.levelBefore, `${expected.eventId}: level before`);
    assert.equal(result.awardedXpCents, expected.awardedXpCents, `${expected.eventId}: award`);
    assert.equal(result.totalXpCents, expected.cumulativeXpCents, `${expected.eventId}: cumulative`);
    assert.equal(result.levelAfter, expected.levelAfter, `${expected.eventId}: level after`);
    totalXpCents = result.totalXpCents;
  }
  assert.equal(totalXpCents, 7156511);
  assert.equal(getLevelFromXpCents(totalXpCents), 24);
  assert.equal(contentData.referenceOutcome.eventCount, 127);
  assert.equal(contentData.referenceOutcome.xpCents, totalXpCents);
  assert.deepEqual(contentData.rewardEvents.filter(row => row.questId === 'M27').map(row => row.id), ['M27A', 'M27B', 'M27C']);
});

test('every level pair follows gray reduction and the +3 base reward ceiling', () => {
  const ratios = new Map([[-4, 25], [-3, 50], [-2, 75], [-1, 90], [0, 100], [1, 105], [2, 110]]);
  for (let player = 1; player <= 40; player++) for (let monster = 1; monster <= 40; monster++) {
    const gap = monster - player;
    const percent = gap <= -5 ? 0 : gap >= 3 ? 115 : ratios.get(gap);
    const expectedCents = player === 40 ? 0 : (20 + 5 * Math.min(monster, player + 3)) * percent;
    assert.equal(calculateRepeatXpCents({ characterLevel: player, contentLevel: monster, units: 1 }), expectedCents, `player ${player}, monster ${monster}`);
  }
  assert.equal(calculateRepeatXpCents({ characterLevel: 10, contentLevel: 1, units: 1000 }), 0);
  assert.equal(calculateRepeatXpCents({ characterLevel: 10, contentLevel: 5, units: 1000 }), 0);
  assert.equal(calculateRepeatXpCents({ characterLevel: 10, contentLevel: 6, units: 1 }), 1250);
  assert.equal(calculateRepeatXpCents({ characterLevel: 1, contentLevel: 40, units: 1 }), 4600);
  assert.equal(calculateRepeatXpCents({ characterLevel: 10, contentLevel: 40, units: 1 }), 9775);
});

test('first goals remain fixed, repeat rewards gray out, and level cap discards overflow', () => {
  const level39Xp = growthData.levels[38].cumulativeXpCents;
  assert.equal(settleXp({ totalXpCents: level39Xp, eventId: 'M01-goal' }).awardedXpCents, 20000);
  const repeat = contentData.rewardEvents.find(row => row.type !== 'first_goal');
  assert.equal(settleXp({ totalXpCents: level39Xp, eventId: repeat.id }).awardedXpCents, 0);
  const almostCapped = settleXp({ totalXpCents: MAX_XP_CENTS - 7, eventId: 'M01-goal' });
  assert.equal(almostCapped.awardedXpCents, 7);
  assert.equal(almostCapped.discardedXpCents, 19993);
  assert.equal(almostCapped.totalXpCents, MAX_XP_CENTS);
  assert.equal(almostCapped.levelAfter, 40);
  for (const event of contentData.rewardEvents) {
    const atCap = settleXp({ totalXpCents: MAX_XP_CENTS, eventId: event.id });
    assert.equal(atCap.awardedXpCents, 0);
    assert.equal(atCap.totalXpCents, MAX_XP_CENTS);
  }
  assert.equal(ruleContract.maxPartySize, 5);
  assert.equal(ruleContract.xpSharing, 'same_personal_reward_at_1_to_5_players');
});

test('bag capacity is derived idempotently at M13 and M24 for each character', () => {
  assert.equal(getBagCapacity(), 24);
  assert.equal(getBagCapacity(['M12', 'SQ01']), 24);
  assert.equal(getBagCapacity(['M13']), 30);
  assert.equal(getBagCapacity(['M13', 'M13']), 30);
  assert.equal(getBagCapacity(new Set(['M13', 'M24'])), 36);
  assert.equal(getBagCapacity(['M24']), 36); // recover an old receipt even if capacity was missing
  assert.equal(getBagCapacity(['M24', 'M13', 'M24']), 36);
  const a = getInitialCharacterRules('harry');
  const b = getInitialCharacterRules('harry');
  a.completedQuestIds.push('M24');
  a.learnedSkillIds.push('bolt');
  assert.equal(getBagCapacity(a.completedQuestIds), 36);
  assert.equal(getBagCapacity(b.completedQuestIds), 24);
  assert.deepEqual(b.learnedSkillIds, []);
  assert.equal(b.xpCents, 0);
  assert.equal(b.level, 1);
  assert.equal(b.contentVersion, contentVersion);
});

test('all 12 permanent skills require course receipt, minimum level and matching role', () => {
  for (const skill of contentData.skills) {
    const heroTemplateId = skill.role === 'all' ? 'harry' : skill.role;
    const ready = { heroTemplateId, level: skill.minLevel, skillId: skill.id, completedQuestIds: [skill.unlockTask] };
    assert.equal(getSkillEligibility(ready).allowed, true, skill.id);
    assert.deepEqual(getSkillEligibility({ ...ready, completedQuestIds: [] }).reasons, ['COURSE_INCOMPLETE'], skill.id);
    if (skill.minLevel > 1) {
      assert.deepEqual(getSkillEligibility({ ...ready, level: skill.minLevel - 1 }).reasons, ['LEVEL_TOO_LOW'], skill.id);
    }
    if (skill.role !== 'all') {
      const otherHero = HERO_TEMPLATE_IDS.find(id => id !== heroTemplateId);
      assert.deepEqual(getSkillEligibility({ ...ready, heroTemplateId: otherHero }).reasons, ['ROLE_MISMATCH'], skill.id);
    }
    assert.equal(getSkillDefinition(skill.id), skill);
  }
  // Completing M11 early does not permanently grant an under-level character their special.
  assert.deepEqual(getSkillEligibility({ heroTemplateId: 'harry', level: 1, skillId: 'H1', completedQuestIds: ['M11'], courseTrial: true }).reasons, ['LEVEL_TOO_LOW']);
  assert.equal(getSkillEligibility({ heroTemplateId: 'harry', level: 1, skillId: 'bolt' }).mode, 'permanent');
});

test('illegal XP, levels, IDs, decimals and forged receipt lists are rejected', () => {
  for (const bad of [-1, 0.5, NaN, Infinity, '0', null, undefined, Number.MAX_SAFE_INTEGER + 1, MAX_XP_CENTS + 1]) {
    invalid(() => getLevelFromXpCents(bad), 'INVALID_INTEGER');
    invalid(() => settleXp({ totalXpCents: bad, eventId: 'M01-goal' }), 'INVALID_INTEGER');
  }
  for (const bad of [0, -1, 1.5, 41, NaN, Infinity, '1']) {
    invalid(() => getHeroStats('harry', bad));
    invalid(() => calculateRepeatXpCents({ characterLevel: bad, contentLevel: 1, units: 1 }));
    invalid(() => calculateRepeatXpCents({ characterLevel: 1, contentLevel: bad, units: 1 }));
  }
  for (const bad of [-1, NaN, Infinity, null, {}, [], '', ' 1', '+1', '-0', '01', '1e3', '0.0000000000000000001']) {
    invalid(() => decimalXpToCents(bad));
    invalid(() => calculateRepeatXpCents({ characterLevel: 10, contentLevel: 10, units: bad }));
  }
  invalid(() => decimalXpToCents(Number.MAX_SAFE_INTEGER), 'NUMERIC_OVERFLOW');
  invalid(() => calculateRepeatXpCents({ characterLevel: 39, contentLevel: 40, units: Number.MAX_SAFE_INTEGER }), 'NUMERIC_OVERFLOW');
  for (const id of ['missing', 'constructor', '__proto__', null]) {
    invalid(() => getHeroStats(id, 1), 'UNKNOWN_HERO');
    invalid(() => getRewardEvent(id), 'UNKNOWN_EVENT');
    invalid(() => getSkillDefinition(id), 'UNKNOWN_SKILL');
  }
  for (const ids of ['M13', null, {}, ['M99'], [42]]) invalid(() => getBagCapacity(ids));
  for (const input of [null, undefined, [], 'x']) {
    invalid(() => calculateRepeatXpCents(input), 'INVALID_INPUT');
    invalid(() => settleXp(input), 'INVALID_INPUT');
    invalid(() => getSkillEligibility(input), 'INVALID_INPUT');
  }
});

test('rules are deterministic and do not mutate caller state or generated data', () => {
  const input = Object.freeze({ totalXpCents: 0, eventId: 'M01-goal' });
  assert.deepEqual(settleXp(input), settleXp(input));
  assert.deepEqual(input, { totalXpCents: 0, eventId: 'M01-goal' });
  assert.ok(Object.isFrozen(contentData.items));
  assert.ok(Object.isFrozen(contentData.items[0]));
  assert.ok(Object.isFrozen(contentData.rewardEvents[0]));
  assert.ok(Object.isFrozen(HERO_TEMPLATE_IDS));
  assert.throws(() => contentData.items.push({}), TypeError);
  assert.equal(getRewardEvent('M01-goal'), contentData.rewardEvents[0]);
});

test('generator rejects broken task, item, scene, skill, reward and HALF_UP references', () => {
  const mutations = [
    s => { s.quests.quests[0].nextQuestId = 'M99'; },
    s => { s.experience.questSceneMap.M01 = ['SC99']; },
    s => { s.gameplay.skills[0].unlockTask = 'M99'; },
    s => { s.gameplay.skills[0].role = 'dumbledore'; },
    s => { s.economy.services.find(service => service.catalog.length).catalog[0].itemId = 'ITEM-MISSING'; },
    s => { s.world.collections[0].itemId = 'ITEM-MISSING'; },
    s => { s.spells.skills[1].id = s.spells.skills[0].id; },
    s => { s.ledger.events[0].questId = 'M99'; },
    s => { s.ledger.referenceSimulation.events.reverse(); },
    s => { s.gameplay.heroBaselinesAndLevels[0].levels[1].physicalDefense = 49; },
    s => { s.xp.levels[1].xpToNextCents++; },
    s => { s.xp.levelGapMultipliers.pop(); },
  ];
  for (const mutate of mutations) {
    const fixture = structuredClone(sources);
    mutate(fixture);
    assert.throws(() => validateSources(fixture), /Chapter-one source validation/);
  }
  assert.equal(validateSources(sources).referenceEventCount, 127);
});

test('runtime data and rules have no Node, storage, clock or network dependency', async () => {
  for (const path of ['chapter-one/rules/index.mjs', 'chapter-one/rules/numeric.mjs', 'chapter-one/rules/freeze.mjs', 'chapter-one/data/index.mjs', 'chapter-one/data/growth.mjs', 'chapter-one/data/content.mjs', 'chapter-one/data/manifest.mjs']) {
    const text = await readFile(new URL(path, gameRoot), 'utf8');
    assert.doesNotMatch(text, /(?:import\s.*?from\s*['"]node:|\brequire\s*\(|\bfetch\s*\(|\blocalStorage\b|\bDate\.now\s*\(|\bMath\.random\s*\()/, path);
  }
});
