# First-book online runtime

`handleChapterOne(request, env)` in `api.mjs` serves `/api/stone/*` using the
`DB` Cloudflare D1 binding and migration `drizzle/0009_stone_runtime.sql`. It is
separate from the old `/api/profile` game and the earlier local F01 adapter in
`chapter-one/server`. No old save, template selection or reward is overwritten.

The browser generates and retains a 256-bit hexadecimal recovery credential.
Send it as `Authorization: Bearer <credential>`. The server stores only its
SHA-256 identity, never sends it to other players, and never accepts an account
ID in a request body. Recovery on another browser uses the same credential.
This is recovery-code identity, not email sign-in or an external identity service.

## Routes

| Route | Behavior |
| --- | --- |
| `GET account` | List up to five independent owned characters. A new account returns an empty list. |
| `GET account?existing=1` | Restore-only probe. Unknown credentials return 404 without creating an empty account. |
| `POST characters` | `{requestId, heroId, name}` creates a Harry, Ron or Hermione character, three equipped starter items and two potions. |
| `GET characters/:id` | Synchronize world/encounter clocks and return confirmed character, room, encounter and scene. |
| `POST characters/:id/actions` | Submit an intent. No route accepts XP, damage, task completion or item counts as authoritative values. |

New selections share `chapter-one/roster.mjs`: `harry`, `ron`, `hermione`.
Each account retains five independent save slots, including repeated templates.
Existing Neville and George characters remain readable and playable; the frozen
five-hero rules and old `/api/profile` API are unchanged. Parties still allow up
to five accounts, and different players may choose the same hero.

Action bodies use `type`. Non-movement requests require a stable `requestId` of
8–96 ASCII letters, digits, `_` or `-`. Retry the identical body with the identical
ID after a lost response. A different payload with the same ID is rejected.
`expectedRevision`, when supplied by a client, is informational; the server
validates current intent eligibility and serializes observed database revisions.
The response's `character.revision` lets clients discard delayed old snapshots.
Party members expose authoritative `hp` and a validated `flying` boolean for
remote presentation. Jumps do not set flying; scene changes, encounters and
checkpoint retries clear it. Membership survives temporary absence; the client
can use `lastSeenAt` to hide stale remote avatars without deleting party seats.

| Type | Additional fields |
| --- | --- |
| `move` | `sequence`, `position:{x,y,z,yaw}`, optional `sprint`/`run`, `flying` |
| `interact` | `targetId`; legacy authored multiple-choice goals also use `choice` |
| `skill` | `skillId`, optional `targetId`, normalized `aim:{x,y,z}`, optional `aimPoint` |
| `encounter` | Story `targetId` or unlocked `cycleId` |
| `retry` | Leave a finished encounter and return to its saved checkpoint |
| `room-create`, `room-leave` | No additional fields |
| `room-join` | `code` or `roomCode` |
| `buy` | `serviceId`, `offerId` |
| `equip` | `itemId`; the equipment slot comes from the server catalog |
| `claim` | `claimId` and, for a choice reward, `itemId` |
| `refill` | `health` and `focus` integer counts totaling two |
| `learn` | `skillId`, checked against personal course receipts and level |
| `track` | Up to two `trackedIds` |
| `side`, `collect` | `questId`; collection also requires its actual scene and location |
| `travel` | `targetId:'exit'`, an already unlocked `sceneId`, within range of the exit |

Resume movement sequence from `character.lastAcceptedMoveSequence + 1`.
Movement uses accumulated server-time credit, not a fresh tolerance per request.
Actual combat positions use the combat engine's collisions and movement rules.
Normal scenes share the same pure `scene-navigation` collision table and swept
movement helper with the renderer. The server returns the actual slide position;
scene transitions and the timed boat transport are separately authorized.
The first escort NPC stands beside the spawn at `(1.8, 0, 5.2)`; later escort
steps continue from their preceding endpoint. Ordinary training carries current
HP and focus between enemies. Core boss starts and explicit checkpoint retries
restore HP and focus. Production encounter seeds come from server cryptographic
randomness; the test harness injects a deterministic seed.

## Progression and persistence

`catalog.mjs` maps all 36 approved main tasks to executable targets and exposes
`getSceneView(character, now)` for the 3D client. It also exposes services,
commission entrances, previously explored exits and optional collection points.
Hagrid's walking state advances only while the player is close, and the boat
persists a real timed trip. Holding an interaction, spell-course timing and the
six underground mechanism rooms advance from trusted positions and clocks.
The underground rooms use `dungeons/stone-route.mjs`, including moving keys,
three chess turns and physical potion choices. M34 only advances on combat victory.
Services and commission entrances occur only in their authored scene. Optional
professor invitations use actual local NPC targets. Collection observations need
one stationary second in a safe scene, interrupt on movement and settle once.
Main-story combat, lessons and mechanisms require their actual story scene.
Leaving the scene interrupts unfinished holds and spell lessons; underground
mechanism attempts cancel while already solved flags remain saved.

Quest XP, coins, credits, equipment, bag expansion, completed state and replay
receipts commit together. First rewards use the frozen IDs and numeric rules.
Repeat commission runs retain their own IDs, enemy objectives and completion
budget. Gray encounters award no repeat XP or repeat credits. Full stone-run
credits require all prior rooms; helping only at the final boss does not qualify.

An account aggregate holds independent characters. Parties reference those
characters, not a shared party save. Boss starts lock 1–5 eligible nearby players;
the list cannot grow during a fight. Waiting or disconnected players do not gain
credit without effective contribution. Players at different quest progress keep
their own progress. A helper reaches the unlocked area through its scene exit.

Every changing operation reads current account/room revisions, then executes one
D1 atomic batch. A `CHECK(valid=1)` guard verifies all observed revisions inside
the same batch; any conflict rolls back all player rewards and the receipt.
The handler retries a bounded number of times. This also covers two simultaneous
requests from different members finishing the same encounter.

The runtime uses bounded HTTP polling and server-time simulation catch-up. It
does not claim WebSocket transport, 30 Hz network delivery, a 50-player capacity
test or production deployment merely because its local tests pass.

## Verification

Workshop originals are stored in source as checksum-pinned 4 MiB chunks under
`assets/chapter-one/workshop-models/`. `node scripts/workshop-assets.mjs restore`
reconstructs missing GLBs byte for byte; it refuses to replace an existing file
whose hash differs. Builds and `npm test` run this restoration automatically.
Run restoration first if invoking individual tests directly after a fresh clone.
The deployed Worker serves the three current heroes from verified immutable R2
objects; source chunking changes neither the model bytes nor runtime asset URLs.

Run `node --test tests/chapter-one-online.test.mjs`. Tests use real SQLite with
the same migration and atomic-batch interface as D1. The suite checks identity,
three-template creation, preserved legacy saves, birth items, isolation,
retry/concurrency, rollback, five-player rooms, movement
credit, Hagrid waiting, real timed chess, shopping, a real spell-fired paper
encounter, and persistent rewards.

The complete 36-task orchestration test starts a real level-one character at zero
XP, executes the actual reference commission runs and six underground mechanisms,
and uses trusted battle-victory fixtures. All 127 resulting XP ledger entries
match the frozen reference level-before, awarded XP, cumulative XP and level-after
values. It reaches level 24 at 71,565.11 XP, 440 first-clear coins and 36-slot
capacity. This is a persistence/quest traversal and reward-budget test, **not**
evidence of full real-time combat balance, average play duration, rendered scene
quality, network performance or online deployment. Those have separate combat,
client and production acceptance gates. First-course defeat is separately tested
with real enemy damage, trial dodge, free retry and pre-shop checkpoint refill.

Two additional API combat tests defeat the full-health solo troll and Quirrell
through actual spells, movement and required mechanisms at a 200 ms simulated
request cadence. Only starting level/story position is a scenario fixture; these
tests never edit combat HP, phase or victory state. A separate smoke test opens
an ephemeral localhost HTTP server backed by an isolated SQLite database, creates
five different student accounts using the three selectable templates (including
repeated heroes), checks concurrent movement and independent snapshots, then
defeats the full 35,700-HP five-player troll. One client stops
sending for four simulated seconds and reconnects with the same identity. An
already-cleared helper receives repeat XP without first-clear coins or gear;
the four first-clear players progress and receive their personal rewards once.
This exercises real HTTP and database commits, using an accelerated authoritative
test clock. It is not a five-browser rendering test, internet latency/load test,
or proof of hosted D1 behavior. The HTTP smoke test needs permission to bind a
localhost port; it never uses the development browser's save database.
