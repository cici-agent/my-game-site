-- ============================================================
-- cici2.fun 数据库说明书
-- 文件路径：database/schema.sql
--
-- ⚠️  重要：每次修改数据库结构（新增字段、新增表、修改 RLS）
--     必须同步更新此文件，保持与 Supabase 实际状态一致。
--
-- 本文件是幂等的，可以反复执行不报错：
--   - 建表使用 CREATE TABLE IF NOT EXISTS
--   - 索引使用 CREATE INDEX IF NOT EXISTS
--   - RLS 策略先 DROP IF EXISTS 再 CREATE
--
-- 在 Supabase Dashboard → SQL Editor 中执行此文件可完整恢复数据库结构。
-- ============================================================


-- ============================================================
-- 1. profiles — 用户资料
-- ============================================================
CREATE TABLE IF NOT EXISTS profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  coins INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 所有人可查看用户名（用于显示作者名、房主名等）
DROP POLICY IF EXISTS "profiles_select_username" ON profiles;
CREATE POLICY "profiles_select_username" ON profiles
  FOR SELECT USING (true);

-- 用户只能读写自己的完整资料
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

DROP POLICY IF EXISTS "profiles_insert_own" ON profiles;
CREATE POLICY "profiles_insert_own" ON profiles
  FOR INSERT WITH CHECK (auth.uid() = id);


-- ============================================================
-- 2. games — 游戏列表（AI 游戏工坊发布的游戏）
-- ============================================================
CREATE TABLE IF NOT EXISTS games (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  code TEXT,                        -- 游戏 HTML 代码（已上线）
  author_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  play_count INT DEFAULT 0,
  rating NUMERIC(3,2) DEFAULT 0,
  review_count INT DEFAULT 0,
  status TEXT DEFAULT 'pending',    -- 'pending' | 'online' | 'offline'
  draft_code TEXT,                  -- 草稿代码（未发布）
  draft_conversation TEXT           -- AI 对话上下文（草稿状态）
);

CREATE INDEX IF NOT EXISTS idx_games_author ON games(author_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_created ON games(created_at DESC);

ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- 公开游戏（online）所有人可见
DROP POLICY IF EXISTS "games_select_published" ON games;
CREATE POLICY "games_select_published" ON games
  FOR SELECT USING (status = 'online');

-- 自己的游戏（包括 draft/pending）自己可见
DROP POLICY IF EXISTS "games_select_own" ON games;
CREATE POLICY "games_select_own" ON games
  FOR SELECT USING (auth.uid() = author_id);

-- 登录用户可以发布游戏
DROP POLICY IF EXISTS "games_insert_auth" ON games;
CREATE POLICY "games_insert_auth" ON games
  FOR INSERT WITH CHECK (auth.uid() = author_id);

-- 用户只能更新自己的游戏
DROP POLICY IF EXISTS "games_update_own" ON games;
CREATE POLICY "games_update_own" ON games
  FOR UPDATE USING (auth.uid() = author_id);


-- ============================================================
-- 3. reviews — 游戏评论与评分
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  game_id UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_name TEXT,
  rating INT CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_reviews_game ON reviews(game_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user ON reviews(user_id);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

-- 所有人可查看评论
DROP POLICY IF EXISTS "reviews_select_all" ON reviews;
CREATE POLICY "reviews_select_all" ON reviews
  FOR SELECT USING (true);

-- 登录用户可以发表评论
DROP POLICY IF EXISTS "reviews_insert_auth" ON reviews;
CREATE POLICY "reviews_insert_auth" ON reviews
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- 用户只能修改自己的评论
DROP POLICY IF EXISTS "reviews_update_own" ON reviews;
CREATE POLICY "reviews_update_own" ON reviews
  FOR UPDATE USING (auth.uid() = user_id);


-- ============================================================
-- 4. coin_transactions — 金币流水
-- ============================================================
CREATE TABLE IF NOT EXISTS coin_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount INT NOT NULL,              -- 正数为增加，负数为减少
  source TEXT NOT NULL,             -- 来源：register/typing_challenge/typing_rank/game_play/ai_publish/admin
  description TEXT,                 -- 显示给用户看的文字，如"打字挑战赛第3级通关"
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_time
  ON coin_transactions(user_id, created_at DESC);

ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;

-- 用户只能读取自己的记录
DROP POLICY IF EXISTS "users can read own transactions" ON coin_transactions;
CREATE POLICY "users can read own transactions" ON coin_transactions
  FOR SELECT USING (auth.uid() = user_id);

-- 用户可以插入自己的记录（前端打字奖励等场景）
DROP POLICY IF EXISTS "users can insert own transactions" ON coin_transactions;
CREATE POLICY "users can insert own transactions" ON coin_transactions
  FOR INSERT WITH CHECK (auth.uid() = user_id);


-- ============================================================
-- 5. catch_rooms — 抓人游戏房间列表
-- ============================================================
CREATE TABLE IF NOT EXISTS catch_rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  room_code TEXT UNIQUE NOT NULL,   -- 4位房间号
  room_name TEXT NOT NULL,
  host_nick TEXT NOT NULL,
  player_count INT DEFAULT 1,
  max_players INT DEFAULT 8,
  is_public BOOLEAN DEFAULT true,
  last_active TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_catch_rooms_code ON catch_rooms(room_code);
CREATE INDEX IF NOT EXISTS idx_catch_rooms_active ON catch_rooms(last_active DESC);

ALTER TABLE catch_rooms ENABLE ROW LEVEL SECURITY;

-- 所有人（包括匿名用户）可以查看房间列表
DROP POLICY IF EXISTS "catch_rooms_select_all" ON catch_rooms;
CREATE POLICY "catch_rooms_select_all" ON catch_rooms
  FOR SELECT USING (true);

-- 登录用户可以创建房间
DROP POLICY IF EXISTS "catch_rooms_insert_auth" ON catch_rooms;
CREATE POLICY "catch_rooms_insert_auth" ON catch_rooms
  FOR INSERT WITH CHECK (true);

-- 登录用户可以更新房间（心跳、人数等）
DROP POLICY IF EXISTS "catch_rooms_update_auth" ON catch_rooms;
CREATE POLICY "catch_rooms_update_auth" ON catch_rooms
  FOR UPDATE USING (true);

-- 登录用户可以删除房间（房主离开时）
DROP POLICY IF EXISTS "catch_rooms_delete_auth" ON catch_rooms;
CREATE POLICY "catch_rooms_delete_auth" ON catch_rooms
  FOR DELETE USING (true);


-- ============================================================
-- 6. spelling — 拼写练习进度
-- ============================================================
CREATE TABLE IF NOT EXISTS spelling (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  level INT DEFAULT 1,
  score INT DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spelling_user ON spelling(user_id);

ALTER TABLE spelling ENABLE ROW LEVEL SECURITY;

-- 用户只能读写自己的进度
DROP POLICY IF EXISTS "spelling_select_own" ON spelling;
CREATE POLICY "spelling_select_own" ON spelling
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "spelling_insert_own" ON spelling;
CREATE POLICY "spelling_insert_own" ON spelling
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "spelling_update_own" ON spelling;
CREATE POLICY "spelling_update_own" ON spelling
  FOR UPDATE USING (auth.uid() = user_id);


-- ============================================================
-- 7. grammar — 语法练习进度
-- ============================================================
CREATE TABLE IF NOT EXISTS grammar (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  level INT DEFAULT 1,
  score INT DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_grammar_user ON grammar(user_id);

ALTER TABLE grammar ENABLE ROW LEVEL SECURITY;

-- 用户只能读写自己的进度
DROP POLICY IF EXISTS "grammar_select_own" ON grammar;
CREATE POLICY "grammar_select_own" ON grammar
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "grammar_insert_own" ON grammar;
CREATE POLICY "grammar_insert_own" ON grammar
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "grammar_update_own" ON grammar;
CREATE POLICY "grammar_update_own" ON grammar
  FOR UPDATE USING (auth.uid() = user_id);


-- ============================================================
-- 8. listening_progress — 英语听力挑战进度
-- ============================================================
CREATE TABLE IF NOT EXISTS listening_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  level INT DEFAULT 1,
  score INT DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_listening_user ON listening_progress(user_id);

ALTER TABLE listening_progress ENABLE ROW LEVEL SECURITY;

-- 用户只能读写自己的进度
DROP POLICY IF EXISTS "listening_select_own" ON listening_progress;
CREATE POLICY "listening_select_own" ON listening_progress
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "listening_insert_own" ON listening_progress;
CREATE POLICY "listening_insert_own" ON listening_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "listening_update_own" ON listening_progress;
CREATE POLICY "listening_update_own" ON listening_progress
  FOR UPDATE USING (auth.uid() = user_id);


-- ============================================================
-- 9. math_progress — 数学练习进度
-- ============================================================
CREATE TABLE IF NOT EXISTS math_progress (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  level INT DEFAULT 1,
  score INT DEFAULT 0,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_math_user ON math_progress(user_id);

ALTER TABLE math_progress ENABLE ROW LEVEL SECURITY;

-- 用户只能读写自己的进度
DROP POLICY IF EXISTS "math_select_own" ON math_progress;
CREATE POLICY "math_select_own" ON math_progress
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "math_insert_own" ON math_progress;
CREATE POLICY "math_insert_own" ON math_progress
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "math_update_own" ON math_progress;
CREATE POLICY "math_update_own" ON math_progress
  FOR UPDATE USING (auth.uid() = user_id);


-- ============================================================
-- 辅助函数：更新游戏评分（在 reviews 插入/更新后调用）
-- ============================================================
CREATE OR REPLACE FUNCTION update_game_rating(p_game_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE games
  SET
    rating = (SELECT COALESCE(AVG(rating::numeric), 0) FROM reviews WHERE game_id = p_game_id),
    review_count = (SELECT COUNT(*) FROM reviews WHERE game_id = p_game_id)
  WHERE id = p_game_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
