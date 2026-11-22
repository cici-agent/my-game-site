import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, writeFile, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { CharacterStore } from '../chapter-one/server/character-store.mjs';
import { FileAccountStorage, MemoryAccountStorage } from '../chapter-one/server/storage.mjs';
import { canonicalJson, exactKeys, payloadDigest } from '../chapter-one/server/transaction-contract.mjs';
import { HERO_TEMPLATE_IDS, getHeroStats, settleXp } from '../chapter-one/rules/index.mjs';
import { contentData } from '../chapter-one/data/index.mjs';

const principal = { accountId: 'account_one' };
const when = '2026-11-21T08:00:00.000Z';
function makeStore(storage = new MemoryAccountStorage(), options = {}) {
  let ids = 0;
  return new CharacterStore({ storage, clock: () => when, idFactory: () => `character_${++ids}`, ...options });
}
const createRequest = (requestId = 'create_one', expectedRevision = 0, heroTemplateId = 'harry') =>
  ({ requestId, expectedRevision, payload: { heroTemplateId, displayName: '新同学' } });
const renameRequest = (characterId, requestId = 'rename_one', expectedRevision = 0, displayName = '哈利') =>
  ({ characterId, requestId, expectedRevision, command: 'profile.rename', payload: { displayName } });
const rejectCode = (promise, code) => assert.rejects(promise, error => error.code === code);
async function disk(t, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'stone-store-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, storage: new FileAccountStorage({ directory, ...options }) };
}
function fixtureCommands() {
  // Only this test server knows the award event. The client never sends XP/coins.
  const eventId = contentData.rewardEvents.find(event => event.type === 'first_goal').id;
  return {
    'fixture.complete': {
      validate(payload) { exactKeys(payload, []); return {}; },
      apply(character) {
        const xp = settleXp({ totalXpCents: character.xpCents, eventId });
        character.xpCents = xp.totalXpCents;
        character.level = xp.levelAfter;
        character.baseStats = getHeroStats(character.heroTemplateId, character.level);
        character.wallet.coins += 7;
        return { eventId, awardedXpCents: xp.awardedXpCents };
      },
    },
  };
}

test('five fixed templates create independent level-one characters and sixth is rejected', async () => {
  const store = makeStore();
  const receipts = [];
  for (const [i, hero] of HERO_TEMPLATE_IDS.entries()) receipts.push(await store.createCharacter(principal, createRequest(`create_${i}`, i, hero)));
  assert.equal(new Set(receipts.map(row => row.characterId)).size, 5);
  for (const { character } of receipts) {
    assert.equal(character.xpCents, 0); assert.equal(character.level, 1);
    assert.deepEqual(character.wallet, { coins: 0, learningCredits: 0 });
    assert.deepEqual(character.quests.completedQuestIds, []);
    assert.deepEqual(character.inventory.items, []); assert.equal(character.inventory.bagCapacity, 24);
  }
  await rejectCode(store.createCharacter(principal, createRequest('create_6', 5)), 'CHARACTER_LIMIT');
  assert.deepEqual(await store.createCharacter(principal, createRequest('create_0', 0)), receipts[0]);
  await store.close();
});

test('100 duplicate concurrent creations produce one character and the original receipt', async () => {
  const store = makeStore();
  const receipts = await Promise.all(Array.from({ length: 100 }, () => store.createCharacter(principal, createRequest())));
  receipts.forEach(receipt => assert.deepEqual(receipt, receipts[0]));
  assert.equal((await store.getAccount(principal)).characters.length, 1);
  assert.equal((await store.getAccount(principal)).revision, 1);
  await store.close();
});

test('100 duplicate commands settle server-configured rewards exactly once on real disk', async t => {
  const { directory, storage } = await disk(t);
  const store = makeStore(storage, { commands: fixtureCommands() });
  const { characterId } = await store.createCharacter(principal, createRequest());
  const request = { characterId, requestId: 'complete_once', expectedRevision: 0, command: 'fixture.complete', payload: {} };
  const receipts = await Promise.all(Array.from({ length: 100 }, () => store.execute(principal, request)));
  receipts.forEach(receipt => assert.deepEqual(receipt, receipts[0]));
  const character = await store.getCharacter(principal, characterId);
  assert.equal(character.wallet.coins, 7); assert.equal(character.revision, 1);
  assert.equal(character.xpCents, receipts[0].result.awardedXpCents);
  assert.deepEqual((await readdir(directory)).filter(file => !file.endsWith('.json')), []);
  await store.close();
});

test('canonical order and normalized names replay; altered payload or revision conflicts', async () => {
  const store = makeStore();
  const original = await store.createCharacter(principal, createRequest());
  const reordered = { payload: { displayName: '  新同学  ', heroTemplateId: 'harry' }, expectedRevision: 0, requestId: 'create_one' };
  assert.deepEqual(await store.createCharacter(principal, reordered), original);
  await rejectCode(store.createCharacter(principal, createRequest('create_one', 1)), 'REQUEST_ID_CONFLICT');
  await rejectCode(store.createCharacter(principal, createRequest('create_one', 0, 'ron')), 'REQUEST_ID_CONFLICT');
  const first = await store.execute(principal, renameRequest(original.characterId));
  await store.execute(principal, renameRequest(original.characterId, 'rename_two', 1, '新名字'));
  assert.deepEqual(await store.execute(principal, renameRequest(original.characterId)), first);
  await rejectCode(store.execute(principal, renameRequest(original.characterId, 'rename_one', 0, '不同内容')), 'REQUEST_ID_CONFLICT');
  assert.equal((await store.getCharacter(principal, original.characterId)).displayName, '新名字');
  assert.equal(payloadDigest({ z: 1, a: { q: 2, p: 3 } }), payloadDigest({ a: { p: 3, q: 2 }, z: 1 }));
  await store.close();
});

test('stale revisions reject without state or receipt changes; competing different requests serialize', async () => {
  const store = makeStore();
  const { characterId } = await store.createCharacter(principal, createRequest());
  const results = await Promise.allSettled([
    store.execute(principal, renameRequest(characterId, 'first', 0, '一')),
    store.execute(principal, renameRequest(characterId, 'second', 0, '二')),
  ]);
  assert.equal(results.filter(row => row.status === 'fulfilled').length, 1);
  assert.equal(results.find(row => row.status === 'rejected').reason.code, 'REVISION_CONFLICT');
  const before = await store.getAccount(principal);
  await rejectCode(store.execute(principal, renameRequest(characterId, 'third', 0)), 'REVISION_CONFLICT');
  await rejectCode(store.createCharacter(principal, createRequest('new_character', 1, 'ron')), 'REVISION_CONFLICT');
  assert.deepEqual(await store.getAccount(principal), before);
  await store.close();
});

test('request IDs are character scoped; progression never copies to another character or account', async () => {
  const store = makeStore(new MemoryAccountStorage(), { commands: fixtureCommands() });
  const one = await store.createCharacter(principal, createRequest());
  await store.execute(principal, { characterId: one.characterId, requestId: 'reward', expectedRevision: 0, command: 'fixture.complete', payload: {} });
  const two = await store.createCharacter(principal, createRequest('create_two', 2, 'ron'));
  assert.equal(two.character.xpCents, 0); assert.equal(two.character.wallet.coins, 0);
  await store.execute(principal, renameRequest(one.characterId, 'shared_request', 1, '一'));
  await store.execute(principal, renameRequest(two.characterId, 'shared_request', 0, '二'));
  assert.equal((await store.getCharacter(principal, one.characterId)).displayName, '一');
  assert.equal((await store.getCharacter(principal, two.characterId)).displayName, '二');
  const outsider = { accountId: 'account_two' };
  await rejectCode(store.getCharacter(outsider, one.characterId), 'CHARACTER_NOT_FOUND');
  await rejectCode(store.execute(outsider, renameRequest(one.characterId)), 'CHARACTER_NOT_FOUND');
  const three = await store.createCharacter(outsider, createRequest());
  assert.equal(three.character.wallet.coins, 0); assert.equal((await store.getAccount(outsider)).revision, 1);
  await store.close();
});

test('no public award, patch, template-change or client amount command exists', async () => {
  const store = makeStore();
  const { characterId } = await store.createCharacter(principal, createRequest());
  for (const command of ['award', 'wallet.credit', 'character.patch', 'profile.change-template']) {
    await rejectCode(store.execute(principal, { ...renameRequest(characterId), command }), 'UNKNOWN_COMMAND');
  }
  for (const field of ['xpCents', 'coins', 'amount', 'heroTemplateId', 'accountId']) {
    await rejectCode(store.execute(principal, { ...renameRequest(characterId), payload: { displayName: '名字', [field]: 100 } }), 'INVALID_FIELDS');
    await rejectCode(store.createCharacter(principal, { ...createRequest(), [field]: 100 }), 'INVALID_FIELDS');
  }
  assert.equal((await store.getCharacter(principal, characterId)).revision, 0);
  await store.close();
});

test('throwing handlers, immutable edits, invalid state and invalid results all roll back', async () => {
  let mode = 'throw';
  const store = makeStore(new MemoryAccountStorage(), { commands: { 'fixture.fail': {
    validate(payload) { exactKeys(payload, []); return {}; },
    apply(character) {
      character.wallet.coins += 9;
      if (mode === 'throw') throw new Error('injected failure');
      if (mode === 'template') character.heroTemplateId = 'ron';
      if (mode === 'account') character.accountId = 'elsewhere';
      if (mode === 'revision') character.revision++;
      if (mode === 'negative') character.wallet.coins = -1;
      if (mode === 'xp') character.xpCents = 0.5;
      if (mode === 'capacity') character.inventory.bagCapacity = 36;
      if (mode === 'result') return { invalid: undefined };
      return { ok: true };
    },
  } } });
  const { characterId } = await store.createCharacter(principal, createRequest());
  const request = { characterId, requestId: 'failed', expectedRevision: 0, command: 'fixture.fail', payload: {} };
  const before = await store.getAccount(principal);
  for (mode of ['throw', 'template', 'account', 'revision', 'negative', 'xp', 'capacity', 'result']) {
    await assert.rejects(store.execute(principal, request));
    assert.deepEqual(await store.getAccount(principal), before);
  }
  mode = 'okay';
  const receipt = await store.execute(principal, request);
  assert.equal(receipt.character.wallet.coins, 9); assert.equal(receipt.revision, 1);
  await store.close();
});

test('disk before-commit failure rolls back and unchanged request can safely retry', async t => {
  let failing = false;
  const { directory, storage } = await disk(t, { beforeCommit: () => { if (failing) throw new Error('disk failure'); } });
  const store = makeStore(storage);
  const { characterId } = await store.createCharacter(principal, createRequest());
  const [file] = await readdir(directory); const before = await readFile(join(directory, file), 'utf8');
  failing = true;
  await assert.rejects(store.execute(principal, renameRequest(characterId)), /disk failure/);
  assert.equal(await readFile(join(directory, file), 'utf8'), before);
  failing = false;
  assert.equal((await store.execute(principal, renameRequest(characterId))).revision, 1);
  await store.close();
});

test('close/reopen restores the full disk state and exact original receipts', async t => {
  const { directory, storage } = await disk(t);
  let store = makeStore(storage, { commands: fixtureCommands() });
  const creation = await store.createCharacter(principal, createRequest());
  const request = { characterId: creation.characterId, requestId: 'reward', expectedRevision: 0, command: 'fixture.complete', payload: {} };
  const reward = await store.execute(principal, request);
  const before = await store.getAccount(principal);
  await store.close();
  await rejectCode(store.getAccount(principal), 'STORAGE_CLOSED');
  store = makeStore(new FileAccountStorage({ directory }), { commands: fixtureCommands() });
  assert.deepEqual(await store.getAccount(principal), before);
  assert.deepEqual(await store.createCharacter(principal, createRequest()), creation);
  assert.deepEqual(await store.execute(principal, request), reward);
  await store.close();
});

test('lost acknowledgment after commit recovers by request ID without committing twice', async t => {
  let loseResponse = false;
  const { directory, storage } = await disk(t, { afterCommit: () => { if (loseResponse) throw new Error('connection lost'); } });
  const store = makeStore(storage);
  const { characterId } = await store.createCharacter(principal, createRequest());
  loseResponse = true;
  const request = renameRequest(characterId);
  await assert.rejects(store.execute(principal, request), /connection lost/);
  await store.close();
  const reopened = makeStore(new FileAccountStorage({ directory }));
  const receipt = await reopened.execute(principal, request);
  assert.equal(receipt.revision, 1); assert.equal(receipt.accountRevision, 2);
  assert.deepEqual(await reopened.execute(principal, request), receipt);
  assert.equal((await reopened.getAccount(principal)).revision, 2);
  await reopened.close();
});

test('two disk adapters share serialization and cannot bypass account character limit', async t => {
  const { directory, storage } = await disk(t);
  const first = makeStore(storage);
  const second = makeStore(new FileAccountStorage({ directory }), { idFactory: () => 'second_generated' });
  const initial = await first.createCharacter(principal, createRequest());
  const request = renameRequest(initial.characterId);
  const results = await Promise.all(Array.from({ length: 100 }, (_, i) => (i % 2 ? first : second).execute(principal, request)));
  results.forEach(receipt => assert.deepEqual(receipt, results[0]));
  for (let i = 2; i <= 5; i++) await first.createCharacter(principal, createRequest(`create_${i}`, i, HERO_TEMPLATE_IDS[i - 1]));
  const last = await Promise.allSettled([first.createCharacter(principal, createRequest('sixth_a', 6)), second.createCharacter(principal, createRequest('sixth_b', 6))]);
  assert.ok(last.every(result => result.status === 'rejected' && result.reason.code === 'CHARACTER_LIMIT'));
  await first.close(); await second.close();
});

test('invalid IDs, exotic JSON, extra fields and noninteger revisions fail before storage', async () => {
  const store = makeStore();
  for (const accountId of ['../outside', '/tmp/outside', 'a/b', 'a\\b', '%2fescape', '', '__proto__', 'constructor']) {
    await rejectCode(store.getAccount({ accountId }), 'INVALID_ID');
  }
  await rejectCode(store.createCharacter({ ...principal, admin: true }, createRequest()), 'INVALID_FIELDS');
  for (const expectedRevision of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    await rejectCode(store.createCharacter(principal, { ...createRequest(), expectedRevision }), 'INVALID_NUMBER');
  }
  for (const requestId of ['../write', 'a/b', 'a\\b', '__proto__']) {
    await rejectCode(store.createCharacter(principal, createRequest(requestId)), 'INVALID_ID');
  }
  await rejectCode(store.createCharacter(principal, createRequest('unknown', 0, 'dumbledore')), 'UNKNOWN_HERO');
  await rejectCode(store.createCharacter(principal, { ...createRequest(), payload: { heroTemplateId: 'harry', displayName: '' } }), 'INVALID_NAME');
  let getterCalls = 0;
  const getter = { get payload() { getterCalls++; return {}; } };
  await rejectCode(store.createCharacter(principal, getter), 'INVALID_PAYLOAD');
  assert.equal(getterCalls, 0);
  for (const value of [undefined, new Date(), { a: undefined }, new Map(), JSON.parse('{"__proto__":{}}'), [1, , 2]]) {
    assert.throws(() => canonicalJson(value));
  }
  const accessorArray = []; Object.defineProperty(accessorArray, '0', { enumerable: true, get() { getterCalls++; return 1; } });
  assert.throws(() => canonicalJson(accessorArray)); assert.equal(getterCalls, 0);
  assert.throws(() => canonicalJson('x'.repeat(65537)), error => error.code === 'PAYLOAD_TOO_LARGE');
  assert.deepEqual(await store.getAccount(principal), { accountId: principal.accountId, revision: 0, characters: [] });
  await store.close();
});

test('account filenames are fixed hashes and symlink targets cannot escape the storage directory', async t => {
  const { directory, storage } = await disk(t);
  const outside = await mkdtemp(join(tmpdir(), 'stone-outside-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  const sentinel = join(outside, 'sentinel.json'); await writeFile(sentinel, 'do not overwrite');
  const hashed = 'account-' + createHash('sha256').update(principal.accountId).digest('hex') + '.json';
  await symlink(sentinel, join(directory, hashed));
  const store = makeStore(storage);
  await rejectCode(store.createCharacter(principal, createRequest()), 'UNSAFE_STORAGE_PATH');
  await rejectCode(store.getAccount({ accountId: '../sentinel' }), 'INVALID_ID');
  assert.equal(await readFile(sentinel, 'utf8'), 'do not overwrite');
  assert.deepEqual(await readdir(directory), [hashed]);
  await store.close();
});

test('corrupt disk state fails closed, preserves bytes and never silently resets progress', async t => {
  const { directory, storage } = await disk(t);
  const store = makeStore(storage);
  await store.createCharacter(principal, createRequest()); await store.close();
  const [file] = await readdir(directory); const path = join(directory, file);
  const good = JSON.parse(await readFile(path, 'utf8'));
  const badReceipt = structuredClone(good); badReceipt.creationReceipts.create_one.character.wallet.coins = -9;
  const missingReceipt = structuredClone(good); missingReceipt.creationReceipts = {};
  const badReceiptOwner = structuredClone(good); badReceiptOwner.creationReceipts.create_one.characterId = 'not_owned';
  for (const broken of ['{not json', JSON.stringify({ ...good, characters: {} }), JSON.stringify({ ...good, revision: -1 }),
    JSON.stringify(badReceipt), JSON.stringify(missingReceipt), JSON.stringify(badReceiptOwner)]) {
    await writeFile(path, broken);
    const reopened = makeStore(new FileAccountStorage({ directory }));
    await rejectCode(reopened.getAccount(principal), 'CORRUPT_STORAGE');
    await rejectCode(reopened.createCharacter(principal, createRequest()), 'CORRUPT_STORAGE');
    assert.equal(await readFile(path, 'utf8'), broken);
    await reopened.close();
  }
});

test('returned snapshots cannot mutate storage and a template cannot be overwritten through shared references', async () => {
  const store = makeStore();
  const receipt = await store.createCharacter(principal, createRequest());
  receipt.character.wallet.coins = 999; receipt.character.baseStats.hp = 1;
  const view = await store.getAccount(principal); view.characters[0].heroTemplateId = 'ron';
  const saved = await store.getCharacter(principal, receipt.characterId);
  assert.equal(saved.wallet.coins, 0); assert.equal(saved.heroTemplateId, 'harry'); assert.equal(saved.baseStats.hp, 320);
  const replay = await store.createCharacter(principal, createRequest());
  assert.equal(replay.character.wallet.coins, 0);
  await store.close();
});

test('storage close drains in-flight transactions and rejects later reads', async () => {
  let release;
  const pause = new Promise(resolve => { release = resolve; });
  let entered;
  const active = new Promise(resolve => { entered = resolve; });
  const store = makeStore(new MemoryAccountStorage(), { commands: { 'fixture.wait': {
    validate(payload) { exactKeys(payload, []); return {}; },
    async apply(character) { entered(); await pause; character.displayName = '完成'; },
  } } });
  const { characterId } = await store.createCharacter(principal, createRequest());
  const pending = store.execute(principal, { characterId, requestId: 'waiting', expectedRevision: 0, command: 'fixture.wait', payload: {} });
  await active;
  let closed = false; const closing = store.close().then(() => { closed = true; });
  assert.equal(closed, false);
  release(); assert.equal((await pending).character.displayName, '完成');
  await closing; assert.equal(closed, true);
  await rejectCode(store.getCharacter(principal, characterId), 'STORAGE_CLOSED');
});

test('journal saves two optional logical references and opaque recap record without treating them as paths', async t => {
  const { directory, storage } = await disk(t);
  const commands = { 'fixture.journal': {
    validate(payload) { exactKeys(payload, ['trackedIds', 'lastSeenAt', 'seenRecap']); return payload; },
    apply(character, payload) { character.journal = structuredClone(payload); },
  } };
  const store = makeStore(storage, { commands });
  const { characterId } = await store.createCharacter(principal, createRequest());
  const journal = {
    trackedIds: ['side:SQ01', 'commission:LIBRARY-M10:run-2'], lastSeenAt: when,
    seenRecap: { recapId: JSON.stringify([characterId, 'session-2', 4]), sessionId: 'session-2', progressRevision: 4, acknowledgedAt: when },
  };
  const request = { characterId, requestId: 'journal', expectedRevision: 0, command: 'fixture.journal', payload: journal };
  const receipt = await store.execute(principal, request);
  assert.deepEqual(receipt.character.journal, journal);
  for (const trackedIds of [['main:M02'], ['side:SQ01', 'side:SQ02', 'side:SQ03'], ['side:SQ01', 'side:SQ01'], ['commission:\n']]) {
    await assert.rejects(store.execute(principal, { ...request, requestId: 'bad_journal', expectedRevision: 1, payload: { ...journal, trackedIds } }));
  }
  await store.close();
  const restored = makeStore(new FileAccountStorage({ directory }), { commands });
  assert.deepEqual((await restored.getCharacter(principal, characterId)).journal, journal);
  assert.equal((await restored.getCharacter(principal, characterId)).revision, 1);
  await restored.close();
});
