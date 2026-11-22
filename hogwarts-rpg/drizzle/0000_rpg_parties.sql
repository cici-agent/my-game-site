CREATE TABLE `rpg_parties` (
	`code` text PRIMARY KEY NOT NULL,
	`creator` text NOT NULL,
	`access` text NOT NULL,
	`campaign` text NOT NULL,
	`revision` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rpg_receipts` (
	`code` text NOT NULL,
	`revision` integer NOT NULL,
	`member` text NOT NULL,
	`choice` integer NOT NULL,
	PRIMARY KEY(`code`, `revision`)
);
