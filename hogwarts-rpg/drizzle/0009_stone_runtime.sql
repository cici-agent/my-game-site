CREATE TABLE IF NOT EXISTS stone_accounts (
 account_id TEXT PRIMARY KEY NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS stone_rooms (
 code TEXT PRIMARY KEY NOT NULL,
 revision INTEGER NOT NULL DEFAULT 0,
 state TEXT NOT NULL,
 updated_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS stone_receipts (
 account_id TEXT NOT NULL,
 request_id TEXT NOT NULL,
 payload_hash TEXT NOT NULL,
 response TEXT NOT NULL,
 created_at INTEGER NOT NULL,
 PRIMARY KEY(account_id, request_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS stone_commit_guard (
 transaction_id TEXT PRIMARY KEY NOT NULL,
 valid INTEGER NOT NULL CHECK(valid=1)
);
