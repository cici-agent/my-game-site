import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { decimalXpToCents, decimalFraction, roundHalfUpRatio, safeNumber } from '../chapter-one/rules/numeric.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const gameRoot = resolve(projectRoot, 'rpg-online');
const sourcePaths = {
  xp: 'planning/20261121-xp-exponential/xp-config.json',
  gameplay: 'planning/20261121-stone-prd-v2/gameplay-spec.json',
  quests: 'planning/20261121-stone-questline/main-quests.json',
  training: 'planning/20261121-stone-questline/training-hubs.json',
  ledger: 'planning/20261121-stone-questline/reward-ledger.json',
  combat: 'planning/20261121-stone-volume/combat-design.json',
  experience: 'planning/20261121-stone-prd-v2/experience-spec.json',
  economy: 'planning/20261121-stone-prd-v2/economy-spec.json',
  world: 'planning/20261121-stone-prd-v2/world-spec.json',
  inventory: 'planning/20261121-stone-prd-v2/inventory-ux-spec.json',
  journal: 'planning/20261121-stone-prd-v2/journal-spec.json',
  spells: 'planning/20261121-stone-prd-v2/spell-presentation-spec.json',
};
const hash = text => createHash('sha256').update(text).digest('hex');
function demand(condition, message) {
  if (!condition) throw new Error(`Chapter-one source validation: ${message}`);
}
function unique(rows, key, label) {
  const ids = rows.map(row => row[key]);
  demand(ids.every(id => typeof id === 'string' && id.length > 0), `${label} has an invalid ID`);
  demand(new Set(ids).size === ids.length, `${label} has duplicate IDs`);
  return new Set(ids);
}
function allValuesForKey(value, keys, result = new Set()) {
  if (Array.isArray(value)) for (const row of value) allValuesForKey(row, keys, result);
  else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) {
    if (keys.includes(key) && typeof child === 'string') result.add(child);
    allValuesForKey(child, keys, result);
  }
  return result;
}
function exactIntegerProduct(base, numerator, denominator) {
  return safeNumber(roundHalfUpRatio(BigInt(base) * numerator, denominator));
}
export function validateSources(s) {
  const questIds = unique(s.quests.quests, 'id', 'main quests');
  const subQuestIds = s.quests.quests.flatMap(q => (q.subObjectives ?? []).map(o => o.id));
  const allQuestIds = new Set([...questIds, ...subQuestIds]);
  demand(allQuestIds.size === questIds.size + subQuestIds.length, 'sub-objective IDs must be unique across quests');
  const heroIds = unique(s.gameplay.heroBaselinesAndLevels, 'id', 'hero templates');
  const skillIds = unique(s.gameplay.skills, 'id', 'skills');
  const itemIds = unique(s.economy.items, 'itemId', 'items');
  const serviceIds = unique(s.economy.services, 'serviceId', 'services');
  const sceneIds = unique(s.experience.sceneBundles, 'id', 'scenes');
  const contentIds = allValuesForKey(s.training, ['contentId', 'cycleId']);
  unique(s.ledger.events, 'id', 'reward events');
  unique(s.ledger.referenceSimulation.events, 'eventId', 'reference replay');
  unique(s.combat.variants, 'id', 'enemy variants');
  unique(s.combat.numericStats.bosses, 'id', 'bosses');
  demand(s.training.hubs.length === 7 && s.training.accountingCycles.length === 11, 'expected 7 training hubs and 11 accounting cycles');
  const cycleById = new Map(s.training.accountingCycles.map(row => [row.cycleId, row]));
  unique(s.journal.commissionIndex, 'id', 'journal commission IDs');
  const journalCycleIds = unique(s.journal.commissionIndex, 'cycleId', 'journal commission cycles');
  demand(journalCycleIds.size === cycleById.size, 'journal commission index must cover all accounting cycles');
  for (const row of s.journal.commissionIndex) {
    const baseline = cycleById.get(row.cycleId);
    demand(baseline && row.hubId === baseline.hubId && row.contentLevel === baseline.contentLevel,
      `${row.id} journal commission points to a missing or different cycle`);
    demand(typeof row.displayName === 'string' && row.displayName.length > 0, `${row.id} needs a journal display name`);
    for (const [key, value] of Object.entries(baseline)) {
      demand(row.baselineMirror[key] === value, `${row.id} journal accounting mirror mismatch at ${key}`);
    }
  }
  demand(questIds.size === 36 && heroIds.size === 5 && skillIds.size === 12, 'expected 36 quests, 5 heroes and 12 skills');
  demand(itemIds.size === 44 && serviceIds.size === 4 && sceneIds.size === 16, 'expected 44 items, 4 services and 16 scenes');
  demand(s.xp.levels.length === 40, 'expected the frozen 40-level table');
  let cumulative = 0;
  for (const [index, row] of s.xp.levels.entries()) {
    const gp = s.gameplay.growth.xpThresholds[index];
    demand(row.level === index + 1, `XP levels must be sequential at ${index}`);
    demand(decimalXpToCents(row.cumulativeXp) === cumulative, `XP cumulative threshold mismatch at ${row.level}`);
    demand(decimalXpToCents(row.xpToNext) === row.xpToNextCents, `XP cents mismatch at ${row.level}`);
    demand(Number.isSafeInteger(row.xpToNextCents) && (row.level === 40 ? row.xpToNextCents === 0 : row.xpToNextCents > 0), `invalid next-level threshold at ${row.level}`);
    demand(gp.level === row.level && decimalXpToCents(gp.cumulativeXp) === cumulative && decimalXpToCents(gp.xpToNext) === row.xpToNextCents, `v2 XP threshold drift at ${row.level}`);
    cumulative += row.xpToNextCents;
  }
  demand(s.xp.levels[39].xpToNextCents === 0, 'level 40 must have no next-level XP');
  for (let gap = -39; gap <= 39; gap++) {
    demand(s.xp.levelGapMultipliers.filter(row => gap >= row.minGap && gap <= row.maxGap).length === 1, `gap ${gap} must have exactly one multiplier`);
  }
  for (const hero of s.gameplay.heroBaselinesAndLevels) {
    demand(hero.levels.length === 40, `${hero.id} needs 40 immutable attribute rows`);
    for (const [index, row] of hero.levels.entries()) {
      const n = BigInt(index);
      const growth = 2000n + 110n * n + 3n * n * n;
      const expected = {
        hp: exactIntegerProduct(hero.baseHp, growth, 2000n),
        spellPower: exactIntegerProduct(hero.baseSp, growth, 2000n),
        physicalDefense: exactIntegerProduct(hero.basePhysicalDefense, 10n + n, 10n),
        magicDefense: exactIntegerProduct(hero.baseMagicDefense, 10n + n, 10n),
        focusMax: hero.baseFocus + 2 * index,
      };
      demand(row.level === index + 1, `${hero.id} level order mismatch`);
      for (const [key, value] of Object.entries(expected)) demand(row[key] === value, `${hero.id} ${row.level} ${key}: frozen value violates exact HALF_UP`);
      demand(row.crit === hero.crit && row.haste === hero.haste && row.focusRegenPerSecond === hero.baseFocusRegenPerSecond, `${hero.id} fixed stat drift`);
    }
  }
  for (const q of s.quests.quests) {
    for (const id of [...q.prerequisiteQuestIds, ...(q.nextQuestId ? [q.nextQuestId] : [])]) demand(questIds.has(id), `${q.id} references missing quest ${id}`);
    demand(s.experience.questSceneMap[q.id]?.length > 0, `${q.id} needs a scene mapping`);
    for (const id of s.experience.questSceneMap[q.id]) demand(sceneIds.has(id), `${q.id} references missing scene ${id}`);
  }
  for (const skill of s.gameplay.skills) {
    demand(questIds.has(skill.unlockTask), `${skill.id} unlock quest is unknown`);
    demand(skill.role === 'all' || heroIds.has(skill.role), `${skill.id} hero role is unknown`);
    demand(Number.isInteger(skill.minLevel) && skill.minLevel >= 1 && skill.minLevel <= 40, `${skill.id} minimum level is invalid`);
  }
  demand(s.spells.skills.length === skillIds.size, 'skill presentation count mismatch');
  demand(new Set(s.spells.skills.map(skill => skill.id ?? skill.skillId)).size === skillIds.size, 'duplicate skill presentation');
  for (const skill of s.spells.skills) demand(skillIds.has(skill.id ?? skill.skillId), 'skill presentation points to an unknown skill');
  for (const item of s.economy.items) {
    for (const id of [...item.questRefs, ...item.unlock.requiredQuestIds]) demand(allQuestIds.has(id), `${item.itemId} points to unknown quest ${id}`);
    for (const src of item.sources) {
      if (src.serviceId) demand(serviceIds.has(src.serviceId), `${item.itemId} points to unknown service`);
      if (src.questId) demand(allQuestIds.has(src.questId), `${item.itemId} source quest is unknown`);
      if (src.sceneId) demand(sceneIds.has(src.sceneId), `${item.itemId} source scene is unknown`);
      if (src.contentId) demand(contentIds.has(src.contentId), `${item.itemId} source content is unknown`);
    }
  }
  for (const svc of s.economy.services) for (const offer of svc.catalog) demand(itemIds.has(offer.itemId), `${svc.serviceId} offers an unknown item`);
  for (const row of s.economy.rewards.guaranteedGearRewards) {
    demand(questIds.has(row.questId), 'gear reward quest is unknown');
    for (const id of row.itemChoices) demand(itemIds.has(id), 'gear reward item is unknown');
  }
  for (const collection of s.world.collections) {
    demand(itemIds.has(collection.itemId) && sceneIds.has(collection.sceneId), `${collection.id} has an unknown item/scene`);
  }
  for (const region of s.world.regions) demand(sceneIds.has(region.id), `unknown world region ${region.id}`);
  demand(s.ledger.referenceSimulation.events.length === s.ledger.events.length, 'reference replay event count mismatch');
  for (const [index, row] of s.ledger.events.entries()) {
    demand(allQuestIds.has(row.questId), `${row.id} references an unknown quest`);
    demand(s.ledger.referenceSimulation.events[index].eventId === row.id, `${row.id} reference replay order mismatch`);
    if (row.type === 'first_goal') {
      decimalXpToCents(row.xp);
      demand(row.oncePerCharacter === true, `${row.id} first goal needs a personal receipt`);
    } else {
      demand(['story_enemy', 'practice', 'dungeon'].includes(row.type), `${row.id} unknown XP event type`);
      demand(Number.isInteger(row.contentLevel) && row.contentLevel >= 1 && row.contentLevel <= 40, `${row.id} invalid content level`);
      const units = decimalFraction(row.units);
      const expected = safeNumber(roundHalfUpRatio(BigInt(20 + 5 * row.contentLevel) * units.numerator * 100n, units.denominator));
      demand(decimalXpToCents(row.baseXp) === expected, `${row.id} base XP is inconsistent`);
    }
  }
  demand(s.inventory.capacity.tiers.map(row => row.targetSlots).join(',') === '24,30,36', 'bag tiers changed unexpectedly');
  return { questCount: questIds.size, heroAttributeRows: 200, skillCount: skillIds.size, itemCount: itemIds.size, sceneCount: sceneIds.size, referenceEventCount: s.ledger.events.length };
}

function moduleText(exportName, value) {
  return `// Generated by scripts/generate-chapter-one.mjs; do not edit.\nimport { deepFreeze } from '../rules/freeze.mjs';\nexport const ${exportName} = deepFreeze(${JSON.stringify(value, null, 2)});\n`;
}

export async function generateChapterOne({ check = false } = {}) {
  const sources = {}, sourceHashes = [];
  for (const [key, relativePath] of Object.entries(sourcePaths)) {
    const bytes = await readFile(resolve(projectRoot, relativePath));
    sources[key] = JSON.parse(bytes);
    sourceHashes.push({ path: relativePath, sha256: hash(bytes) });
  }
  const counts = validateSources(sources);
  const generatorSha256 = hash(await readFile(fileURLToPath(import.meta.url)));
  const numericSha256 = hash(await readFile(resolve(gameRoot, 'chapter-one/rules/numeric.mjs')));
  const fingerprint = hash(JSON.stringify({ schemaVersion: 1, generatorSha256, numericSha256, sourceHashes }));
  const contentVersion = `stone-prd-v2-${fingerprint.slice(0, 16)}`;
  const s = sources;
  const growth = {
    contentVersion,
    levelCap: 40,
    firstVolumeMilestone: 24,
    maxPartySize: 5,
    levels: s.xp.levels.map(row => ({ level: row.level, cumulativeXpCents: decimalXpToCents(row.cumulativeXp), xpToNextCents: row.xpToNextCents })),
    heroes: s.gameplay.heroBaselinesAndLevels,
    gapMultipliers: s.xp.levelGapMultipliers.map(row => {
      const fraction = decimalFraction(row.multiplier);
      const scaled = fraction.numerator * 10000n;
      demand(scaled % fraction.denominator === 0n, 'gap multiplier must be an exact basis-point value');
      return { minGap: row.minGap, maxGap: row.maxGap, basisPoints: safeNumber(scaled / fraction.denominator) };
    }),
  };
  const rewardEvents = s.ledger.events.map(row => row.type === 'first_goal'
    ? { ...row, fixedXpCents: decimalXpToCents(row.xp) }
    : { ...row, baseXpCents: decimalXpToCents(row.baseXp), unitsDecimal: String(row.units) });
  const content = {
    contentVersion,
    quests: s.quests.quests,
    skills: s.gameplay.skills,
    courseTrialPolicy: s.gameplay.learningTrialPolicy,
    passives: s.gameplay.passives,
    talentPolicy: s.gameplay.skillUpgradePolicy,
    combatMath: s.gameplay.combatMath,
    survival: s.gameplay.survival,
    equipmentCatalog: s.gameplay.equipmentCatalog,
    items: s.economy.items,
    currencies: s.economy.currencies,
    services: s.economy.services,
    economyRewards: s.economy.rewards,
    potionAllocation: s.economy.potionAllocation,
    bagCapacityTiers: s.inventory.capacity.tiers,
    enemies: s.combat.variants,
    bosses: s.combat.numericStats.bosses,
    encounters: s.combat.encounters,
    finalDungeonBudget: s.combat.finalDungeonBudget,
    scenes: s.experience.sceneBundles.map(({ id, name, zones, questIds, minimum }) => ({ id, name, zones, questIds, minimum })),
    questSceneMap: s.experience.questSceneMap,
    world: { regions: s.world.regions, npcs: s.world.npcs, interactables: s.world.interactables, collections: s.world.collections, phaseStates: s.world.phaseStates },
    trainingHubs: s.training.hubs,
    commissionCycles: s.training.accountingCycles,
    journalCommissionIndex: s.journal.commissionIndex,
    sideQuests: s.journal.sideQuests,
    journalPanel: s.journal.panel,
    spellPresentations: s.spells.skills,
    rewardEvents,
    referenceReplay: s.ledger.referenceSimulation.events.map(row => ({ eventId: row.eventId, stageId: row.stageId, levelBefore: row.levelBefore, awardedXpCents: decimalXpToCents(row.awardedXp), cumulativeXpCents: decimalXpToCents(row.cumulativeXp), levelAfter: row.levelAfter })),
    referenceOutcome: { eventCount: s.ledger.referenceSimulation.events.length, xpCents: decimalXpToCents(s.ledger.referenceSimulation.xpAfterBaseRoute), level: s.ledger.referenceSimulation.levelAfterBaseRoute },
  };
  demand(content.referenceReplay.length === content.rewardEvents.length, 'replay/event count mismatch');
  const manifest = { schemaVersion: 1, designVersion: 'stone-prd-v2', contentVersion, fingerprint, generatorSha256, numericSha256, sourceHashes, counts, runtimeStatus: 'data_and_pure_rules_only_not_integrated' };
  const outputs = {
    'growth.mjs': moduleText('growthData', growth),
    'content.mjs': moduleText('contentData', content),
    'manifest.mjs': moduleText('contentManifest', manifest),
    'index.mjs': "// Generated by scripts/generate-chapter-one.mjs; do not edit.\nexport { growthData } from './growth.mjs';\nexport { contentData } from './content.mjs';\nexport { contentManifest } from './manifest.mjs';\n",
  };
  if (!check) await mkdir(resolve(gameRoot, 'chapter-one/data'), { recursive: true });
  for (const [name, text] of Object.entries(outputs)) {
    const outputPath = resolve(gameRoot, 'chapter-one/data', name);
    if (check) {
      const existing = await readFile(outputPath, 'utf8').catch(() => null);
      demand(existing === text, `${name} is missing or stale; run node scripts/generate-chapter-one.mjs`);
    } else await writeFile(outputPath, text);
  }
  return { contentVersion, ...counts, checked: check, files: Object.keys(outputs) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const unknown = process.argv.slice(2).filter(arg => arg !== '--check');
  if (unknown.length) throw new Error(`Unknown generator option: ${unknown.join(', ')}`);
  console.log(JSON.stringify(await generateChapterOne({ check: process.argv.includes('--check') }), null, 2));
}
