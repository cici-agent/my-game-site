/**
 * Chapter-one deterministic rules. No storage, clock, random source, identity or network.
 * All XP inputs/outputs use integer hundredths. Authoritative callers must validate
 * participation, ownership and once-per-character/run receipts BEFORE settlement.
 */
import { growthData, contentData, contentManifest } from '../data/index.mjs';
import { deepFreeze } from './freeze.mjs';
import {
  RuleValidationError, requireSafeInteger, decimalFraction, roundHalfUpRatio, safeNumber,
} from './numeric.mjs';

export { RuleValidationError, decimalXpToCents, formatXpCents } from './numeric.mjs';
export const contentVersion = contentManifest.contentVersion;
export const LEVEL_CAP = growthData.levelCap;
export const MAX_XP_CENTS = growthData.levels.at(-1).cumulativeXpCents;
export const HERO_TEMPLATE_IDS = Object.freeze(growthData.heroes.map(hero => hero.id));

const heroById = new Map(growthData.heroes.map(hero => [hero.id, hero]));
const skillById = new Map(contentData.skills.map(skill => [skill.id, skill]));
const eventById = new Map(contentData.rewardEvents.map(event => [event.id, event]));
const questIds = new Set([
  ...contentData.quests.flatMap(quest => [quest.id, ...(quest.subObjectives ?? []).map(row => row.id)]),
  ...contentData.sideQuests.map(quest => quest.id),
]);

function inputObject(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new RuleValidationError('INVALID_INPUT', 'Expected a rule input object');
  }
  return input;
}
function known(map, id, label) {
  if (typeof id !== 'string' || !map.has(id)) {
    throw new RuleValidationError(`UNKNOWN_${label}`, `Unknown ${label.toLowerCase()} ID`);
  }
  return map.get(id);
}
function characterLevel(level) {
  return requireSafeInteger(level, 'character level', { min: 1, max: LEVEL_CAP });
}
function completedQuestSet(ids) {
  if (!Array.isArray(ids) && !(ids instanceof Set)) {
    throw new RuleValidationError('INVALID_QUEST_LIST', 'completedQuestIds must be an array or Set of known quest IDs');
  }
  const result = new Set();
  for (const id of ids) {
    if (typeof id !== 'string' || !questIds.has(id)) {
      throw new RuleValidationError('UNKNOWN_QUEST', 'completedQuestIds contains an unknown quest ID');
    }
    result.add(id);
  }
  return result;
}

/** Frozen threshold lookup, including exact threshold equality. Stored XP is capped. */
export function getLevelFromXpCents(totalXpCents) {
  requireSafeInteger(totalXpCents, 'total XP cents', { max: MAX_XP_CENTS });
  let low = 0, high = growthData.levels.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if (growthData.levels[middle].cumulativeXpCents <= totalXpCents) low = middle;
    else high = middle - 1;
  }
  return growthData.levels[low].level;
}

export function getXpProgress(totalXpCents) {
  const level = getLevelFromXpCents(totalXpCents);
  const row = growthData.levels[level - 1];
  const earnedThisLevelCents = totalXpCents - row.cumulativeXpCents;
  return {
    level, totalXpCents, thresholdXpCents: row.cumulativeXpCents,
    earnedThisLevelCents, requiredThisLevelCents: row.xpToNextCents,
    remainingXpCents: row.xpToNextCents - earnedThisLevelCents,
    atCap: level === LEVEL_CAP,
  };
}

/** Return the immutable row as approved, with no runtime formula/refitting. */
export function getHeroStats(heroTemplateId, level) {
  const hero = known(heroById, heroTemplateId, 'HERO');
  return hero.levels[characterLevel(level) - 1];
}

export function getRewardEvent(eventId) {
  return known(eventById, eventId, 'EVENT');
}

/**
 * Repeat XP before cap overflow: level gap uses the actual content level;
 * reward base uses min(contentLevel, characterLevel + 3). Party size never scales
 * an individual's XP. units may be a finite plain decimal number/string.
 */
export function calculateRepeatXpCents(input) {
  const { characterLevel: level, contentLevel, units } = inputObject(input);
  characterLevel(level);
  requireSafeInteger(contentLevel, 'content level', { min: 1, max: LEVEL_CAP });
  const quantity = decimalFraction(units, 'XP units');
  if (level === LEVEL_CAP) return 0;
  const gap = contentLevel - level;
  const multiplier = growthData.gapMultipliers.find(row => gap >= row.minGap && gap <= row.maxGap);
  const baseUnitXp = 20 + 5 * Math.min(contentLevel, level + 3);
  return safeNumber(roundHalfUpRatio(
    BigInt(baseUnitXp) * quantity.numerator * BigInt(multiplier.basisPoints) * 100n,
    quantity.denominator * 10000n,
  ), 'repeat XP cents');
}

/**
 * Settle one configured event after server authorization. This function does NOT
 * grant rewards or deduplicate receipts. Repeated calls with the same inputs are
 * deliberately identical; caller persists XP and receipt atomically.
 */
export function settleXp(input) {
  const { totalXpCents, eventId } = inputObject(input);
  const levelBefore = getLevelFromXpCents(totalXpCents);
  const event = getRewardEvent(eventId);
  const uncappedAwardXpCents = levelBefore === LEVEL_CAP ? 0
    : event.type === 'first_goal' ? event.fixedXpCents
      : calculateRepeatXpCents({ characterLevel: levelBefore, contentLevel: event.contentLevel, units: event.unitsDecimal });
  const awardedXpCents = Math.min(uncappedAwardXpCents, MAX_XP_CENTS - totalXpCents);
  const resultXpCents = totalXpCents + awardedXpCents;
  return {
    contentVersion, eventId, totalXpCentsBefore: totalXpCents,
    totalXpCents: resultXpCents, levelBefore, levelAfter: getLevelFromXpCents(resultXpCents),
    awardedXpCents, uncappedAwardXpCents, discardedXpCents: uncappedAwardXpCents - awardedXpCents,
  };
}

/** Derive the highest earned capacity, never add slots while replaying a receipt. */
export function getBagCapacity(completedQuestIds = []) {
  const completed = completedQuestSet(completedQuestIds);
  return contentData.bagCapacityTiers.reduce((slots, tier) =>
    !tier.requiredCompletedQuestId || completed.has(tier.requiredCompletedQuestId)
      ? Math.max(slots, tier.targetSlots) : slots, 0);
}

export function getSkillDefinition(skillId) {
  return known(skillById, skillId, 'SKILL');
}

/** Permanent learning only. Course trial authorization belongs to the course/run server. */
export function getSkillEligibility(input) {
  const { heroTemplateId, level, skillId, completedQuestIds = [] } = inputObject(input);
  known(heroById, heroTemplateId, 'HERO');
  characterLevel(level);
  const skill = getSkillDefinition(skillId);
  const completed = completedQuestSet(completedQuestIds);
  const reasons = [];
  if (skill.role !== 'all' && skill.role !== heroTemplateId) reasons.push('ROLE_MISMATCH');
  if (!completed.has(skill.unlockTask)) reasons.push('COURSE_INCOMPLETE');
  if (level < skill.minLevel) reasons.push('LEVEL_TOO_LOW');
  return {
    skillId, heroTemplateId, mode: 'permanent', allowed: reasons.length === 0, reasons,
    requiredQuestId: skill.unlockTask, minimumLevel: skill.minLevel,
  };
}

/** Identity, wallet, inventory instances and receipts are owned by the server store. */
export function getInitialCharacterRules(heroTemplateId) {
  const baseStats = getHeroStats(heroTemplateId, 1);
  return {
    contentVersion, heroTemplateId, level: 1, xpCents: 0, baseStats,
    bagCapacity: getBagCapacity([]), completedQuestIds: [], learnedSkillIds: [],
  };
}

export const ruleContract = deepFreeze({
  xpUnit: 'integer_hundredths', rounding: 'HALF_UP_non_negative',
  stateXpRange: [0, MAX_XP_CENTS], maxPartySize: growthData.maxPartySize,
  xpSharing: 'same_personal_reward_at_1_to_5_players',
  receiptResponsibility: 'server_transaction', skillEligibilityMode: 'permanent_only',
});
