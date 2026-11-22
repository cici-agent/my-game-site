import { randomUUID } from 'node:crypto';
import {
  contentVersion, HERO_TEMPLATE_IDS, getInitialCharacterRules,
  getLevelFromXpCents, getHeroStats, getBagCapacity,
} from '../rules/index.mjs';
import {
  StoreError, fail, identifier, exactKeys, nonnegativeInteger,
  canonicalJson, jsonClone, deepFreeze, payloadDigest, displayName,
} from './transaction-contract.mjs';

export { StoreError };
export const MAX_CHARACTERS_PER_ACCOUNT = 5;
const copy = value => JSON.parse(JSON.stringify(value));
const plainMap = value => {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) fail('INVALID_STATE');
};
function instant(value) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))
      || new Date(value).toISOString() !== value) fail('INVALID_TIMESTAMP');
  return value;
}
function increment(value) { return nonnegativeInteger(value + 1, 'revision'); }
function stringIds(value) {
  if (!Array.isArray(value) || new Set(value).size !== value.length) fail('INVALID_STATE');
  value.forEach(id => identifier(id));
}
function logicalReference(value, maxLength = 256) {
  if (typeof value !== 'string' || !value.length || value.length > maxLength
      || /[\u0000-\u001f\u007f]/u.test(value)) fail('INVALID_REFERENCE');
  return value;
}
function validateCharacter(character, accountId, characterId) {
  // Snapshot extensions must be explicitly versioned, never accepted as arbitrary
  // client patches. The larger cap here is separate from the 64 KiB request cap.
  canonicalJson(character, { maxBytes: 1048576, maxNodes: 100000 });
  exactKeys(character, ['characterId', 'accountId', 'heroTemplateId', 'displayName',
    'createdAt', 'updatedAt', 'revision', 'contentVersion', 'xpCents', 'level',
    'baseStats', 'wallet', 'quests', 'inventory', 'journal', 'learnedSkillIds']);
  if (character.accountId !== accountId || character.characterId !== characterId
      || !HERO_TEMPLATE_IDS.includes(character.heroTemplateId)
      || character.contentVersion !== contentVersion) fail('INVALID_STATE');
  identifier(characterId); nonnegativeInteger(character.revision);
  if (displayName(character.displayName) !== character.displayName) fail('INVALID_STATE');
  instant(character.createdAt); instant(character.updatedAt);
  if (getLevelFromXpCents(character.xpCents) !== character.level) fail('INVALID_STATE', 'XP and level differ');
  if (canonicalJson(character.baseStats) !== canonicalJson(getHeroStats(character.heroTemplateId, character.level))) {
    fail('INVALID_STATE', 'Base stats must come from the frozen rules');
  }
  exactKeys(character.wallet, ['coins', 'learningCredits']);
  nonnegativeInteger(character.wallet.coins); nonnegativeInteger(character.wallet.learningCredits);
  exactKeys(character.quests, ['completedQuestIds', 'activeQuestRuns', 'pendingRewardRequestIds']);
  stringIds(character.quests.completedQuestIds); stringIds(character.quests.pendingRewardRequestIds);
  if (!Array.isArray(character.quests.activeQuestRuns)) fail('INVALID_STATE');
  exactKeys(character.inventory, ['bagCapacity', 'items', 'equipmentSlots', 'pendingClaims', 'revision']);
  if (character.inventory.bagCapacity !== getBagCapacity(character.quests.completedQuestIds)) fail('INVALID_STATE');
  nonnegativeInteger(character.inventory.revision);
  if (!Array.isArray(character.inventory.items) || !Array.isArray(character.inventory.pendingClaims)) fail('INVALID_STATE');
  exactKeys(character.inventory.equipmentSlots, ['weapon', 'top', 'gloves']);
  for (const value of Object.values(character.inventory.equipmentSlots)) if (value !== null) identifier(value, 'itemInstanceId');
  exactKeys(character.journal, ['trackedIds', 'lastSeenAt', 'seenRecap']);
  const tracked = character.journal.trackedIds;
  if (!Array.isArray(tracked) || tracked.length > 2 || new Set(tracked).size !== tracked.length) fail('INVALID_STATE');
  for (const key of tracked) {
    logicalReference(key);
    if (!/^(side|commission):.+/.test(key)) fail('INVALID_REFERENCE');
  }
  if (character.journal.lastSeenAt !== null) instant(character.journal.lastSeenAt);
  if (character.journal.seenRecap !== null) {
    exactKeys(character.journal.seenRecap, ['recapId', 'sessionId', 'progressRevision', 'acknowledgedAt']);
    logicalReference(character.journal.seenRecap.recapId, 1024);
    logicalReference(character.journal.seenRecap.sessionId);
    nonnegativeInteger(character.journal.seenRecap.progressRevision);
    instant(character.journal.seenRecap.acknowledgedAt);
  }
  stringIds(character.learnedSkillIds);
}
function emptyAccount(accountId) {
  return { schemaVersion: 1, accountId, revision: 0, characters: {}, creationReceipts: {}, characterReceipts: {} };
}
function validateReceipt(receipt, requestId, scope, account) {
  exactKeys(receipt, ['requestId', 'scope', 'command', 'payloadDigest', 'characterId',
    'revision', 'accountRevision', 'committedAt', 'result', 'character']);
  if (receipt.requestId !== requestId || receipt.scope !== scope
      || typeof receipt.payloadDigest !== 'string' || !/^[0-9a-f]{64}$/.test(receipt.payloadDigest)) fail('INVALID_STATE');
  identifier(receipt.characterId);
  if (!Object.hasOwn(account.characters, receipt.characterId)) fail('INVALID_STATE');
  const current = account.characters[receipt.characterId];
  nonnegativeInteger(receipt.revision); nonnegativeInteger(receipt.accountRevision);
  instant(receipt.committedAt); canonicalJson(receipt.result);
  validateCharacter(receipt.character, account.accountId, receipt.characterId);
  if (receipt.revision !== receipt.character.revision || receipt.revision > current.revision
      || receipt.accountRevision < 1 || receipt.accountRevision > account.revision
      || receipt.character.updatedAt !== receipt.committedAt
      || receipt.character.heroTemplateId !== current.heroTemplateId
      || receipt.character.createdAt !== current.createdAt) fail('INVALID_STATE');
  if (scope === 'account') {
    if (receipt.command !== 'character.create' || receipt.revision !== 0) fail('INVALID_STATE');
  } else if (scope !== receipt.characterId || receipt.revision < 1
      || typeof receipt.command !== 'string' || !/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/.test(receipt.command)) fail('INVALID_STATE');
}
function validateAccount(account, accountId) {
  try {
    exactKeys(account, ['schemaVersion', 'accountId', 'revision', 'characters', 'creationReceipts', 'characterReceipts']);
    if (account.schemaVersion !== 1 || account.accountId !== accountId) fail('INVALID_STATE');
    nonnegativeInteger(account.revision);
    plainMap(account.characters); plainMap(account.creationReceipts); plainMap(account.characterReceipts);
    const ids = Object.keys(account.characters);
    if (ids.length > MAX_CHARACTERS_PER_ACCOUNT || Object.keys(account.characterReceipts).length !== ids.length) fail('INVALID_STATE');
    for (const id of ids) {
      validateCharacter(account.characters[id], accountId, id);
      if (!Object.hasOwn(account.characterReceipts, id)) fail('INVALID_STATE');
      plainMap(account.characterReceipts[id]);
    }
    const creationTargets = new Set();
    const aggregateRevisions = new Set();
    for (const [scope, receipts] of [['account', account.creationReceipts], ...ids.map(id => [id, account.characterReceipts[id]])]) {
      const characterRevisions = new Set();
      for (const [requestId, receipt] of Object.entries(receipts)) {
        identifier(requestId);
        validateReceipt(receipt, requestId, scope, account);
        if (aggregateRevisions.has(receipt.accountRevision)) fail('INVALID_STATE');
        aggregateRevisions.add(receipt.accountRevision);
        if (scope === 'account') {
          if (creationTargets.has(receipt.characterId)) fail('INVALID_STATE');
          creationTargets.add(receipt.characterId);
        } else {
          if (characterRevisions.has(receipt.revision)) fail('INVALID_STATE');
          characterRevisions.add(receipt.revision);
        }
      }
      if (scope !== 'account' && characterRevisions.size !== account.characters[scope].revision) fail('INVALID_STATE');
    }
    if (creationTargets.size !== ids.length || aggregateRevisions.size !== account.revision) fail('INVALID_STATE');
  } catch (cause) { throw new StoreError('CORRUPT_STORAGE', `Stored account failed validation: ${cause.code ?? cause.name}`); }
  return account;
}
function principalAccount(principal) {
  const safe = jsonClone(principal);
  exactKeys(safe, ['accountId'], 'trusted principal');
  return identifier(safe.accountId, 'accountId');
}
function replay(receipts, requestId, digest) {
  if (!Object.hasOwn(receipts, requestId)) return null;
  const receipt = receipts[requestId];
  if (receipt.payloadDigest !== digest) fail('REQUEST_ID_CONFLICT');
  return copy(receipt);
}

const renameCommand = Object.freeze({
  validate(payload) { exactKeys(payload, ['displayName']); return { displayName: displayName(payload.displayName) }; },
  apply(character, payload) { character.displayName = payload.displayName; return { displayName: character.displayName }; },
});

/**
 * Server library, not an authentication boundary or HTTP handler. `principal`
 * must come from an authenticated server session; clients cannot choose it.
 * `commands` are trusted server code, registered at construction, never wire data.
 * validate(payload) is pure structural validation; apply performs state/authority
 * checks and edits only the private character draft. External I/O in either is
 * forbidden: side effects are not rolled back with this transaction.
 */
export class CharacterStore {
  #storage; #commands; #clock; #idFactory;
  constructor({ storage, commands = {}, clock = () => new Date().toISOString(), idFactory = randomUUID } = {}) {
    if (!storage || typeof storage.withAccountTransaction !== 'function' || typeof storage.close !== 'function') fail('INVALID_STORAGE');
    plainMap(commands);
    this.#commands = new Map([['profile.rename', renameCommand]]);
    for (const [name, command] of Object.entries(commands)) {
      if (!/^[a-z][a-z0-9_-]*(\.[a-z][a-z0-9_-]*)+$/.test(name) || this.#commands.has(name)
          || !command || typeof command.validate !== 'function' || typeof command.apply !== 'function') fail('INVALID_COMMAND_REGISTRY');
      this.#commands.set(name, Object.freeze({ validate: command.validate, apply: command.apply }));
    }
    if (typeof clock !== 'function' || typeof idFactory !== 'function') fail('INVALID_CONFIG');
    this.#storage = storage; this.#clock = clock; this.#idFactory = idFactory;
  }
  async createCharacter(principal, request) {
    const accountId = principalAccount(principal);
    const envelope = jsonClone(request);
    exactKeys(envelope, ['requestId', 'expectedRevision', 'payload']);
    const requestId = identifier(envelope.requestId, 'requestId');
    nonnegativeInteger(envelope.expectedRevision, 'expectedRevision');
    exactKeys(envelope.payload, ['heroTemplateId', 'displayName']);
    if (!HERO_TEMPLATE_IDS.includes(envelope.payload.heroTemplateId)) fail('UNKNOWN_HERO');
    const payload = { heroTemplateId: envelope.payload.heroTemplateId, displayName: displayName(envelope.payload.displayName) };
    const digest = payloadDigest({ command: 'character.create', expectedRevision: envelope.expectedRevision, payload });
    return this.#storage.withAccountTransaction(accountId, current => {
      const account = current ? validateAccount(current, accountId) : emptyAccount(accountId);
      const old = replay(account.creationReceipts, requestId, digest);
      if (old) return { state: current, result: old };
      if (envelope.expectedRevision !== account.revision) fail('REVISION_CONFLICT');
      if (Object.keys(account.characters).length >= MAX_CHARACTERS_PER_ACCOUNT) fail('CHARACTER_LIMIT');
      const characterId = identifier(this.#idFactory(), 'generated characterId');
      if (Object.hasOwn(account.characters, characterId)) fail('CHARACTER_ID_COLLISION');
      const now = instant(this.#clock());
      const initial = getInitialCharacterRules(payload.heroTemplateId);
      const character = {
        characterId, accountId, ...payload, createdAt: now, updatedAt: now, revision: 0,
        contentVersion: initial.contentVersion, xpCents: initial.xpCents, level: initial.level,
        baseStats: copy(initial.baseStats), wallet: { coins: 0, learningCredits: 0 },
        quests: { completedQuestIds: [...initial.completedQuestIds], activeQuestRuns: [], pendingRewardRequestIds: [] },
        inventory: { bagCapacity: initial.bagCapacity, items: [], equipmentSlots: { weapon: null, top: null, gloves: null }, pendingClaims: [], revision: 0 },
        journal: { trackedIds: [], lastSeenAt: null, seenRecap: null }, learnedSkillIds: [...initial.learnedSkillIds],
      };
      validateCharacter(character, accountId, characterId);
      account.revision = increment(account.revision);
      account.characters[characterId] = character;
      account.characterReceipts[characterId] = {};
      const receipt = { requestId, scope: 'account', command: 'character.create', payloadDigest: digest,
        characterId, revision: 0, accountRevision: account.revision, committedAt: now,
        result: { characterId }, character: copy(character) };
      account.creationReceipts[requestId] = receipt;
      return { state: account, result: receipt };
    });
  }
  async execute(principal, request) {
    const accountId = principalAccount(principal);
    const envelope = jsonClone(request);
    exactKeys(envelope, ['requestId', 'characterId', 'expectedRevision', 'command', 'payload']);
    const requestId = identifier(envelope.requestId, 'requestId');
    const characterId = identifier(envelope.characterId, 'characterId');
    nonnegativeInteger(envelope.expectedRevision, 'expectedRevision');
    const command = this.#commands.get(envelope.command);
    if (!command) fail('UNKNOWN_COMMAND');
    const payload = deepFreeze(jsonClone(await command.validate(deepFreeze(envelope.payload))));
    const digest = payloadDigest({ characterId, command: envelope.command, expectedRevision: envelope.expectedRevision, payload });
    return this.#storage.withAccountTransaction(accountId, async current => {
      if (!current) fail('CHARACTER_NOT_FOUND');
      const account = validateAccount(current, accountId);
      if (!Object.hasOwn(account.characters, characterId)) fail('CHARACTER_NOT_FOUND');
      const old = replay(account.characterReceipts[characterId], requestId, digest);
      if (old) return { state: current, result: old };
      const before = account.characters[characterId];
      if (envelope.expectedRevision !== before.revision) fail('REVISION_CONFLICT');
      const draft = copy(before);
      const context = deepFreeze({ accountId, characterId, requestId, current: copy(before) });
      const commandResult = await command.apply(draft, payload, context);
      for (const key of ['characterId', 'accountId', 'heroTemplateId', 'createdAt', 'contentVersion', 'revision']) {
        if (draft[key] !== before[key]) fail('IMMUTABLE_FIELD', key);
      }
      draft.revision = increment(before.revision);
      draft.updatedAt = instant(this.#clock());
      validateCharacter(draft, accountId, characterId);
      const result = commandResult === undefined ? null : jsonClone(commandResult);
      account.revision = increment(account.revision);
      account.characters[characterId] = draft;
      const receipt = { requestId, scope: characterId, command: envelope.command, payloadDigest: digest,
        characterId, revision: draft.revision, accountRevision: account.revision,
        committedAt: draft.updatedAt, result, character: copy(draft) };
      account.characterReceipts[characterId][requestId] = receipt;
      return { state: account, result: receipt };
    });
  }
  async getAccount(principal) {
    const accountId = principalAccount(principal);
    return this.#storage.withAccountTransaction(accountId, current => {
      const account = current ? validateAccount(current, accountId) : emptyAccount(accountId);
      return { state: current, result: { accountId, revision: account.revision, characters: Object.values(account.characters).map(copy) } };
    });
  }
  async getCharacter(principal, characterId) {
    identifier(characterId, 'characterId');
    const account = await this.getAccount(principal);
    const character = account.characters.find(row => row.characterId === characterId);
    if (!character) fail('CHARACTER_NOT_FOUND');
    return character;
  }
  close() { return this.#storage.close(); }
}
