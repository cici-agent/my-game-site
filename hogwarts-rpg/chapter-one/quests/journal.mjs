// Presentation of confirmed character state. This module never grants rewards.
export const RETURN_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;
const SERVER_STATES = new Set(['locked', 'available', 'active', 'completed']);
const copy = value => structuredClone(value);
function unique(values = []) { return [...new Set(values)]; }
function validId(value, label) {
  if (typeof value !== 'string' || !value.length || value.length > 256) throw new TypeError(`Invalid ${label}`);
  return value;
}

export function deriveDisplayState({ serverState, pendingRequest = false, retryable = false,
  confirmedObjectivesComplete = false, turnInRequired = false }) {
  if (!SERVER_STATES.has(serverState)) throw new TypeError('Unknown authoritative quest state');
  if (serverState !== 'active') return serverState;
  if (pendingRequest) return 'reward_pending';
  if (retryable) return 'retryable';
  if (confirmedObjectivesComplete && turnInRequired) return 'ready_to_turn_in';
  return 'active';
}

function row(definition, record, type, key) {
  const serverState = record.serverState ?? 'locked';
  return {
    key, id: definition.id, type, name: definition.name ?? definition.title ?? definition.displayName ?? definition.id,
    serverState, displayState: deriveDisplayState({ ...record, serverState }),
    objectives: copy(record.confirmedObjectives ?? []),
    checkpointId: record.checkpointId ?? null, pendingRequestId: record.pendingRequestId ?? null,
    // Recommended level is display-only; it does not unlock or lock a task.
    recommendedLevel: definition.recommendedLevel ?? definition.contentLevel ?? null,
    nextStep: copy(record.nextStep ?? null),
    completed: serverState === 'completed', runId: record.runId ?? null,
  };
}

export function buildJournal({ mainQuests, sideQuests, commissions, character }) {
  validId(character.characterId, 'characterId');
  const completed = new Set(character.completedQuestIds ?? []);
  const collections = new Set(character.collectionIds ?? []);
  const accepted = new Set(character.acceptedSideQuestIds ?? []);
  const main = mainQuests.map(definition => {
    const record = copy(character.mainQuestStates?.[definition.id] ?? {});
    if (completed.has(definition.id)) record.serverState = 'completed';
    return row(definition, record, 'main', `main:${definition.id}`);
  });
  const side = sideQuests.map(definition => {
    const observed = collections.has(definition.reward.collectionId);
    const unlocked = definition.prerequisites.completedQuestIds.every(id => completed.has(id));
    const serverState = observed ? 'completed' : accepted.has(definition.id) && unlocked ? 'active' : unlocked ? 'available' : 'locked';
    return row(definition, { serverState }, 'side', `side:${definition.id}`);
  });
  // The journal catalog is A's journalCommissionIndex, not its numeric commissionCycles.
  // Validate the boundary so missing IDs cannot accidentally merge unrelated runs.
  const knownCycles = new Map(), knownCommissionIds = new Set();
  for (const definition of commissions) {
    validId(definition.id, 'commission id');
    validId(definition.cycleId, 'commission cycleId');
    if (knownCycles.has(definition.cycleId) || knownCommissionIds.has(definition.id)) {
      throw new TypeError('Duplicate commission catalog ID');
    }
    knownCycles.set(definition.cycleId, definition);
    knownCommissionIds.add(definition.id);
  }
  const seenRuns = new Set();
  const commission = [];
  for (const record of character.commissionRuns ?? []) {
    const definition = knownCycles.get(record.cycleId);
    if (!definition) throw new TypeError('Unknown commission cycle');
    validId(record.runId, 'runId');
    const key = `commission:${record.cycleId}:${record.runId}`;
    if (seenRuns.has(key)) throw new TypeError('Duplicate commission run');
    seenRuns.add(key);
    commission.push({ ...row(definition, record, 'commission', key), cycleId: definition.cycleId });
  }
  // A repeatable activity's entry exists before its first run and after a clear.
  // Unlock decisions are supplied by the server, never parsed from prose here.
  const commissionEntries = commissions.map(definition => {
    const eligibility = character.commissionEntryStates?.[definition.cycleId];
    return {
      key: `commission_entry:${definition.cycleId}`, id: definition.id, cycleId: definition.cycleId,
      name: definition.displayName, contentLevel: definition.contentLevel,
      serverState: eligibility?.available === true ? 'available' : 'locked',
      unavailableReason: eligibility?.available === true ? null : eligibility?.reason ?? 'ELIGIBILITY_NOT_CONFIRMED',
      activeRunIds: commission.filter(item => item.cycleId === definition.cycleId && item.serverState === 'active').map(item => item.runId),
    };
  });
  const all = [...main, ...side, ...commission];
  return {
    characterId: character.characterId, progressRevision: character.progressRevision ?? 0,
    main, side, commission, commissionEntries, history: all.filter(item => item.completed),
    currentMain: main.find(item => ['active', 'available'].includes(item.serverState)) ?? null,
  };
}

export function selectHud(journal, trackedIds = []) {
  const available = new Map([...journal.side, ...journal.commission]
    .filter(item => ['available', 'active'].includes(item.serverState)).map(item => [item.key, item]));
  const retainedIds = unique(trackedIds).filter(id => available.has(id)).slice(0, 2);
  return { main: copy(journal.currentMain), optional: retainedIds.map(id => copy(available.get(id))), trackedIds: retainedIds };
}

export function updateOptionalTracking({ trackedIds, targetId, allowedIds, replaceId = null, remove = false }) {
  const allowed = new Set(allowedIds);
  const current = unique(trackedIds).filter(id => allowed.has(id)).slice(0, 2);
  if (remove) return { ok: true, trackedIds: current.filter(id => id !== targetId) };
  if (!allowed.has(targetId)) return { ok: false, code: 'UNAVAILABLE_TARGET', trackedIds: current };
  if (current.includes(targetId)) return { ok: true, trackedIds: current };
  if (current.length < 2) return { ok: true, trackedIds: [...current, targetId] };
  if (!replaceId || !current.includes(replaceId)) return { ok: false, code: 'CHOOSE_REPLACEMENT', trackedIds: current };
  return { ok: true, trackedIds: current.map(id => id === replaceId ? targetId : id) };
}

export function planReturnRecap({ journal, priorLastSeenAtMs, nowMs, sessionId, safeToShow,
  seenRecapId = null, manual = false, newCharacter = false }) {
  validId(sessionId, 'sessionId');
  if (!Number.isSafeInteger(nowMs) || nowMs < 0 || (priorLastSeenAtMs !== null &&
    (!Number.isSafeInteger(priorLastSeenAtMs) || priorLastSeenAtMs < 0 || priorLastSeenAtMs > nowMs))) {
    throw new TypeError('Recap requires valid server timestamps in milliseconds');
  }
  // Caller preserves the prior server timestamp for this session before updating lastSeenAt.
  const due = manual || (!newCharacter && priorLastSeenAtMs !== null && nowMs - priorLastSeenAtMs >= RETURN_THRESHOLD_MS);
  if (!due) return { status: 'not_due' };
  const recapId = JSON.stringify([journal.characterId, sessionId, journal.progressRevision]);
  let seen = null;
  try { seen = JSON.parse(seenRecapId); } catch { /* Damaged presentation preference is not progress. */ }
  if (!manual && Array.isArray(seen) && seen[0] === journal.characterId && seen[1] === sessionId) {
    return { status: 'already_seen', recapId };
  }
  if (!safeToShow) return { status: 'deferred', recapId };
  const lastMain = journal.main.filter(item => item.completed).at(-1) ?? null;
  return {
    status: 'ready', recapId, dismissible: true,
    lastCompleted: lastMain ? { id: lastMain.id, name: lastMain.name } : null,
    currentTask: copy(journal.currentMain),
    // IDs for existing controls; UI can render at most three localized tips.
    controlTips: ['J', 'E', 'M'],
    pendingRequests: unique([...journal.main, ...journal.commission].map(item => item.pendingRequestId).filter(Boolean)),
    chapterComplete: journal.main.length > 0 && journal.main.every(item => item.completed),
  };
}

// Returns the next legal graph node for a marker. Never moves or teleports a player.
export function findNextWaypoint({ start, target, edges, unlockedNodeIds }) {
  const allowed = new Set(unlockedNodeIds);
  if (!allowed.has(start) || !allowed.has(target)) return { status: 'locked', next: null };
  if (start === target) return { status: 'arrived', next: null };
  const queue = [start], parents = new Map([[start, null]]);
  for (let index = 0; index < queue.length; index++) {
    const node = queue[index];
    for (const next of edges[node] ?? []) {
      if (!allowed.has(next) || parents.has(next)) continue;
      parents.set(next, node); queue.push(next);
      if (next === target) {
        let step = target;
        while (parents.get(step) !== start) step = parents.get(step);
        return { status: 'reachable', next: step };
      }
    }
  }
  return { status: 'unreachable', next: null };
}
