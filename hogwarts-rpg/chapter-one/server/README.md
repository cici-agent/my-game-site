# F01 character transaction foundation

This server-only library is an isolated foundation. It has **no HTTP routes, authentication, online database connection, room server or legacy-save migration**. The existing game and worker are unchanged. An authenticated host must supply `principal.accountId`; accepting an account ID from a browser would not authenticate it.

## API

```js
import { CharacterStore, FileAccountStorage } from './index.mjs';

const store = new CharacterStore({
  storage: new FileAccountStorage({ directory: '/trusted/local/test-storage' }),
});
const principal = { accountId: 'server_resolved_account' };
const creation = await store.createCharacter(principal, {
  requestId: 'stable_create_request',
  expectedRevision: 0, // Account revision, read with getAccount().
  payload: { heroTemplateId: 'harry', displayName: '新同学' },
});
const renamed = await store.execute(principal, {
  characterId: creation.characterId,
  requestId: 'stable_rename_request',
  expectedRevision: 0, // Character revision, not account revision.
  command: 'profile.rename',
  payload: { displayName: '名字' },
});
await store.close();
```

The five allowed templates, zero XP, initial level, base statistics and bag capacity come from `../rules/index.mjs`. A character's template is immutable. Each account holds at most five independent character records; no account XP, wallet, quest completion or inventory is copied. F01 does not enforce one instance per template or expose deletion. Creation currently initializes **empty gameplay inventory**: starting equipped items and default potions remain the first F02 integration task. Do not show F01 creation as a fully playable birth flow.

`getAccount(principal)` returns `{accountId, revision, characters}`. `getCharacter(principal, characterId)` returns an owned snapshot, otherwise `CHARACTER_NOT_FOUND`. All returned objects are copies.

## Idempotency and revisions

- Creation request IDs are scoped to the account. Command request IDs are scoped to a character. Reusing a request ID on another character does not share progression.
- Requests are bounded plain JSON. Keys are sorted recursively, normalized validated values are hashed with SHA-256, and command, character ID where applicable, and expected revision form part of the digest. Field order is irrelevant; extra fields, unsupported values, prototype keys and accessors are rejected. Display names are trimmed and NFC-normalized.
- A committed matching request returns its **original complete receipt**, even after later mutations or a process restart. It does not return a new receipt or apply the command again. Same ID with a different normalized payload, command or expected revision returns `REQUEST_ID_CONFLICT`.
- Original receipt lookup happens before revision validation. A fresh request with a stale revision fails with `REVISION_CONFLICT`. The client must retain the original envelope while completion is unknown. To intentionally change an operation, obtain the new revision and use a new request ID.
- An applied command increments its character revision and the account aggregate revision exactly once. Creation increments the account revision and starts the new character at revision zero. Concurrent changes to separate characters do not invalidate each other's character revisions.
- State and receipt are committed together. Validation, handler and pre-commit failures leave neither. A failure **after the commit point** can mean the operation succeeded but its acknowledgment was lost: retry the unchanged request. Do not automatically generate a new request ID.
- Receipts are retained indefinitely in this first adapter; production retention/archival needs an explicit policy that preserves replay guarantees.

## Trusted commands and stored state

Only `profile.rename` is registered by default. There is no browser-facing `award`, XP amount, wallet amount, arbitrary patch, template replacement or generic reducer endpoint.

Future authoritative services can supply a constructor-time `commands` registry. Every command has `validate(payload)` and `apply(characterDraft, validatedPayload, context)`. `validate` performs structural validation without state or I/O. `apply` performs server-owned eligibility, participation and configured-event checks, and edits only the isolated draft. Neither callback may perform external side effects: file/network writes would not roll back. The registry is trusted application code, never client data. Registering a permissive award handler would defeat this security boundary.

The store validates immutable identity/template/version fields, XP/level/base-stat agreement against the shared rules, nonnegative integer wallet values, derived bag capacity and snapshot structure before commit. Detailed item-instance, quest-run, economic and reward-event qualification belongs to F02 handlers; an arbitrary trusted handler is not automatically a safe economy implementation.

Journal state reserves `trackedIds` for **at most two optional** `side:`/`commission:` logical keys; the primary quest is derived by the journal module. These are bounded references, not filesystem identifiers. `seenRecap` is `null` or `{recapId, sessionId, progressRevision, acknowledgedAt}`; its opaque `recapId` can contain the journal module's JSON-encoded identifier. Full target eligibility is checked by future journal commands, not by this storage foundation.

## Replaceable storage interface

A production adapter must expose:

```js
await storage.withAccountTransaction(accountId, async isolatedCurrentOrNull => {
  return { state: nextAccountState, result: response };
});
await storage.close();
```

Required semantics: serializable access to the account aggregate; a private draft; atomic durable commit of the entire updated state and all receipts; no commit on a thrown callback; copied results; read operations using unchanged state; close draining already-entered transactions and rejecting later work. Account-level serialization ensures the five-character limit is atomic. Character-level revisions provide independent mutation preconditions.

`MemoryAccountStorage` is for unit tests only. `FileAccountStorage` is a real persistent **local test adapter**, using fixed SHA-256 account filenames, an exclusive lock file, private temporary file, file fsync, atomic rename and directory fsync. Within one process, adapters also share a queue for the same canonical account path. User IDs cannot supply paths; symlink data targets are rejected and reads use `O_NOFOLLOW`. The adapter does not claim safety against a hostile local filesystem administrator.

The file adapter deliberately fails closed on malformed saves and content-version mismatches. It does not auto-reset or migrate old data. Hard termination can leave a lock or orphan temporary file; there is no unsafe timeout-based lock takeover. Operators must recover such files after proving no writer is live. Filesystem rename/fsync guarantees are platform-dependent; this is not a production multi-host database. Replace it with a transactional database adapter and test the same contract before online use.

`beforeCommit` and `afterCommit` hooks are test-only fault injection. A post-commit I/O or cleanup failure is an unknown acknowledgment, not proof of rollback. The persisted receipt resolves that ambiguity on retry.
