import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildJournal, deriveDisplayState, selectHud, updateOptionalTracking, planReturnRecap, findNextWaypoint, RETURN_THRESHOLD_MS } from '../chapter-one/quests/journal.mjs';
import { contentData } from '../chapter-one/data/index.mjs';

const read = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'));
const quests = await read('../../planning/20261121-stone-questline/main-quests.json');
const spec = await read('../../planning/20261121-stone-prd-v2/journal-spec.json');
const catalog = { mainQuests: quests.quests, sideQuests: spec.sideQuests, commissions: spec.commissionIndex };
const fresh = () => ({ characterId: 'own-harry', progressRevision: 3, completedQuestIds: ['M01'],
  mainQuestStates: { M02: { serverState: 'active', pendingRequest: true, pendingRequestId: 'req-2' } },
  collectionIds: [], acceptedSideQuestIds: [], commissionRuns: [] });

test('journal exposes seven display states while pending never fabricates completion', () => {
  for (const serverState of ['locked', 'available', 'active', 'completed']) assert.equal(deriveDisplayState({ serverState }), serverState);
  assert.equal(deriveDisplayState({ serverState: 'active', pendingRequest: true }), 'reward_pending');
  assert.equal(deriveDisplayState({ serverState: 'active', retryable: true }), 'retryable');
  assert.equal(deriveDisplayState({ serverState: 'active', confirmedObjectivesComplete: true, turnInRequired: true }), 'ready_to_turn_in');
  assert.equal(deriveDisplayState({ serverState: 'active', confirmedObjectivesComplete: true }), 'active');
  assert.equal(deriveDisplayState({ serverState: 'completed', pendingRequest: true }), 'completed');
  assert.throws(() => deriveDisplayState({ serverState: 'claimed_locally' }));
});

test('real catalog has 36 main tasks; early observation aligns side quest without new rewards', () => {
  const character = fresh(); character.collectionIds = ['COLLECT-FIELD-01'];
  const before = structuredClone(character), result = buildJournal({ ...catalog, character });
  assert.equal(result.main.length, 36); assert.equal(result.side.length, 4);
  assert.equal(result.currentMain.id, 'M02'); assert.equal(result.currentMain.displayState, 'reward_pending');
  assert.equal(result.side[0].serverState, 'completed'); assert.equal(result.side[1].serverState, 'locked');
  assert.deepEqual(character, before); assert.equal('xpDelta' in result, false);
  result.currentMain.objectives.push('unconfirmed'); assert.deepEqual(character, before);
});

test('repeat commission history never hides the new active run', () => {
  const character = fresh(); character.commissionRuns = [
    { cycleId: 'LIBRARY-M10', runId: 'run-1', serverState: 'completed' },
    { cycleId: 'LIBRARY-M10', runId: 'run-2', serverState: 'active' },
  ];
  const result = buildJournal({ ...catalog, character });
  assert.equal(result.commission.length, 2);
  assert.equal(result.history.filter(item => item.type === 'commission').length, 1);
  const hud = selectHud(result, result.commission.map(item => item.key));
  assert.equal(hud.optional.length, 1); assert.equal(hud.optional[0].runId, 'run-2');
  character.commissionRuns.push(character.commissionRuns[1]);
  assert.throws(() => buildJournal({ ...catalog, character }), /Duplicate/);
});

test('generated A journal catalog keeps COM IDs, names and active runs isolated by cycle', () => {
  const generatedCatalog = {
    mainQuests: contentData.quests, sideQuests: contentData.sideQuests,
    commissions: contentData.journalCommissionIndex,
  };
  assert.deepEqual(generatedCatalog.commissions, spec.commissionIndex);
  const [first, second] = generatedCatalog.commissions;
  const character = { ...fresh(), commissionRuns: [
    { cycleId: first.cycleId, runId: 'first-active', serverState: 'active' },
    { cycleId: first.cycleId, runId: 'first-history', serverState: 'completed' },
    { cycleId: second.cycleId, runId: 'second-active', serverState: 'active' },
  ] };
  const journal = buildJournal({ ...generatedCatalog, character });
  assert.equal(journal.commissionEntries.length, 11);
  for (const entry of journal.commissionEntries) {
    const source = generatedCatalog.commissions.find(row => row.cycleId === entry.cycleId);
    assert.equal(entry.id, source.id);
    assert.match(entry.id, /^COM-/);
    assert.equal(entry.name, source.displayName);
    const expectedRuns = entry.cycleId === first.cycleId ? ['first-active']
      : entry.cycleId === second.cycleId ? ['second-active'] : [];
    assert.deepEqual(entry.activeRunIds, expectedRuns, entry.cycleId);
  }
  assert.deepEqual(journal.commission.map(row => [row.id, row.cycleId]), [
    [first.id, first.cycleId], [first.id, first.cycleId], [second.id, second.cycleId],
  ]);
  assert.throws(() => buildJournal({ ...generatedCatalog, commissions: contentData.commissionCycles, character }), /Invalid commission id/);
});

test('first-time players see all commission entries and server-confirmed eligible practice without a run', () => {
  const character = fresh();
  character.commissionEntryStates = { 'LIBRARY-M10': { available: true } };
  const result = buildJournal({ ...catalog, character });
  assert.equal(result.commission.length, 0);
  assert.equal(result.commissionEntries.length, 11);
  const entry = result.commissionEntries.find(item => item.cycleId === 'LIBRARY-M10');
  assert.equal(entry.serverState, 'available'); assert.equal(entry.unavailableReason, null);
  assert.deepEqual(entry.activeRunIds, []);
  assert.equal(result.commissionEntries.find(item => item.cycleId !== 'LIBRARY-M10').serverState, 'locked');
  assert.equal(character.commissionRuns.length, 0); // Viewing does not create a run or reward.
});

test('tracking a third optional task requires an explicit replacement', () => {
  const args = { trackedIds: ['a', 'b'], targetId: 'c', allowedIds: ['a', 'b', 'c'] };
  assert.deepEqual(updateOptionalTracking(args), { ok: false, code: 'CHOOSE_REPLACEMENT', trackedIds: ['a', 'b'] });
  assert.deepEqual(updateOptionalTracking({ ...args, replaceId: 'b' }).trackedIds, ['a', 'c']);
  assert.deepEqual(args.trackedIds, ['a', 'b']);
  assert.equal(updateOptionalTracking({ ...args, targetId: 'unknown' }).code, 'UNAVAILABLE_TARGET');
});

test('recap uses prior server time at exact seven day boundary and defers during danger', () => {
  const journal = buildJournal({ ...catalog, character: fresh() });
  const args = { journal, priorLastSeenAtMs: 1000, nowMs: 1000 + RETURN_THRESHOLD_MS, sessionId: 's1', safeToShow: true };
  assert.equal(planReturnRecap({ ...args, nowMs: args.nowMs - 1 }).status, 'not_due');
  assert.equal(planReturnRecap({ ...args, newCharacter: true }).status, 'not_due');
  assert.equal(planReturnRecap({ ...args, safeToShow: false }).status, 'deferred');
  const recap = planReturnRecap(args);
  assert.equal(recap.status, 'ready'); assert.equal(recap.currentTask.id, 'M02');
  assert.deepEqual(recap.pendingRequests, ['req-2']);
  assert.equal(planReturnRecap({ ...args, seenRecapId: recap.recapId }).status, 'already_seen');
  assert.equal(planReturnRecap({ ...args, journal: { ...journal, progressRevision: 4 }, seenRecapId: recap.recapId }).status, 'already_seen');
  assert.equal(planReturnRecap({ ...args, manual: true, nowMs: 1000 }).status, 'ready');
  assert.throws(() => planReturnRecap({ ...args, priorLastSeenAtMs: args.nowMs + 1 }));
});

test('helper progress is never substituted for personal next task; completed chapter creates no next-book quest', () => {
  const own = buildJournal({ ...catalog, character: fresh() });
  const helper = buildJournal({ ...catalog, character: { ...fresh(), characterId: 'helper', completedQuestIds: catalog.mainQuests.map(q => q.id) } });
  assert.equal(selectHud(own).main.id, 'M02'); assert.equal(selectHud(helper).main, null);
  const recap = planReturnRecap({ journal: helper, priorLastSeenAtMs: null, nowMs: 1, sessionId: 's', manual: true, safeToShow: true });
  assert.equal(recap.chapterComplete, true); assert.equal(recap.currentTask, null);
});

test('navigation points to a legal stair/door node, never through locked shortcuts', () => {
  const args = { start: 'hall', target: 'class', edges: { hall: ['lockedDoor', 'stairs'], lockedDoor: ['class'], stairs: ['landing'], landing: ['class'] }, unlockedNodeIds: ['hall', 'stairs', 'landing', 'class'] };
  assert.deepEqual(findNextWaypoint(args), { status: 'reachable', next: 'stairs' });
  assert.equal(findNextWaypoint({ ...args, unlockedNodeIds: ['hall', 'class'] }).status, 'unreachable');
  assert.equal(findNextWaypoint({ ...args, target: 'lockedDoor' }).status, 'locked');
  assert.equal(findNextWaypoint({ ...args, target: 'hall' }).status, 'arrived');
});
