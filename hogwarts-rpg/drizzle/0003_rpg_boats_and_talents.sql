CREATE TABLE rpg_boat_trips (
  code text PRIMARY KEY NOT NULL,
  depart_at integer NOT NULL,
  arrive_at integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE rpg_player_talents (
  player text NOT NULL,
  hero text NOT NULL,
  talent text NOT NULL,
  PRIMARY KEY(player,hero)
);
