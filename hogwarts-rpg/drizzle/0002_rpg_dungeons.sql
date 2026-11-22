CREATE TABLE rpg_adventurers (
  account_key text PRIMARY KEY NOT NULL,
  id text NOT NULL,
  name text NOT NULL,
  hero text NOT NULL,
  stage text NOT NULL,
  active_code text
);
--> statement-breakpoint
CREATE UNIQUE INDEX rpg_adventurer_id ON rpg_adventurers(id);
--> statement-breakpoint
CREATE TABLE rpg_dungeons (
  code text PRIMARY KEY NOT NULL,
  founder text NOT NULL,
  create_request text NOT NULL,
  revision integer NOT NULL,
  last_write text NOT NULL,
  state text NOT NULL
);
--> statement-breakpoint
CREATE TABLE rpg_dungeon_requests (
  code text NOT NULL,
  player text NOT NULL,
  request_id text NOT NULL,
  action text NOT NULL,
  PRIMARY KEY(code,player,request_id)
);
--> statement-breakpoint
CREATE TABLE rpg_player_rewards (
  player text NOT NULL,
  entitlement text NOT NULL,
  xp integer NOT NULL,
  skill_points integer NOT NULL,
  PRIMARY KEY(player,entitlement)
);
