import { integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const parties = sqliteTable('rpg_parties', {
  code: text('code').primaryKey(),
  creator: text('creator').notNull(),
  access: text('access').notNull(),
  campaign: text('campaign').notNull(),
  revision: integer('revision').notNull()
});

export const receipts = sqliteTable('rpg_receipts', {
  code: text('code').notNull(),
  revision: integer('revision').notNull(),
  member: text('member').notNull(),
  choice: integer('choice').notNull()
}, table => [primaryKey({columns:[table.code, table.revision]})]);


export const presence = sqliteTable('rpg_presence', {
  code: text('code').notNull(),
  member: text('member').notNull(),
  stream: text('stream').notNull(),
  scene: text('scene').notNull(),
  pose: text('pose').notNull(),
  seenAt: integer('seen_at').notNull()
}, table => [primaryKey({columns:[table.code, table.member]})]);

export const adventurers = sqliteTable('rpg_adventurers', {
  accountKey: text('account_key').primaryKey(),
  id: text('id').notNull(),
  name: text('name').notNull(),
  hero: text('hero').notNull(),
  stage: text('stage').notNull(),
  activeCode: text('active_code')
}, table => [uniqueIndex('rpg_adventurer_id').on(table.id)]);

export const dungeons = sqliteTable('rpg_dungeons', {
  code: text('code').primaryKey(),
  founder: text('founder').notNull(),
  createRequest: text('create_request').notNull(),
  revision: integer('revision').notNull(),
  lastWrite: text('last_write').notNull(),
  state: text('state').notNull()
});

export const dungeonRequests = sqliteTable('rpg_dungeon_requests', {
  code: text('code').notNull(),
  player: text('player').notNull(),
  requestId: text('request_id').notNull(),
  action: text('action').notNull()
}, table => [primaryKey({columns:[table.code, table.player, table.requestId]})]);

export const playerRewards = sqliteTable('rpg_player_rewards', {
  player: text('player').notNull(),
  entitlement: text('entitlement').notNull(),
  xp: integer('xp').notNull(),
  skillPoints: integer('skill_points').notNull()
}, table => [primaryKey({columns:[table.player, table.entitlement]})]);

export const boatTrips = sqliteTable('rpg_boat_trips', {
  code: text('code').primaryKey(),
  departAt: integer('depart_at').notNull(),
  arriveAt: integer('arrive_at').notNull()
});

export const playerTalents = sqliteTable('rpg_player_talents', {
  player: text('player').notNull(),
  hero: text('hero').notNull(),
  talent: text('talent').notNull()
}, table => [primaryKey({columns:[table.player, table.hero]})]);
