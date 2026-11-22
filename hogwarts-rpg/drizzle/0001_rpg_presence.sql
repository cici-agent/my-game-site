CREATE TABLE `rpg_presence` (
	`code` text NOT NULL,
	`member` text NOT NULL,
	`stream` text NOT NULL,
	`scene` text NOT NULL,
	`pose` text NOT NULL,
	`seen_at` integer NOT NULL,
	PRIMARY KEY(`code`, `member`)
);
