-- ============================================================
-- AI游戏工坊 - 草稿暂存 & 下架修改 功能
-- 在 Supabase Dashboard → SQL Editor 中执行
-- ============================================================

-- 1. 给 games 表添加 status 字段（如果还没有的话）
-- 注意：现有数据已有 status 字段（online/pending），此语句仅在字段不存在时需要执行
-- 如果已存在 status 字段，跳过此步骤即可
-- ALTER TABLE games ADD COLUMN IF NOT EXISTS status text DEFAULT 'pending';

-- 2. 确保现有已上线游戏的 status 为 'online'（通常已经是了）
-- UPDATE games SET status = 'online' WHERE status IS NULL;

-- 3. 添加 draft_code 字段，用于暂存草稿的游戏代码（不上传 Storage）
ALTER TABLE games ADD COLUMN IF NOT EXISTS draft_code text;

-- 4. 添加 draft_conversation 字段，用于暂存对话上下文
ALTER TABLE games ADD COLUMN IF NOT EXISTS draft_conversation text;

-- 5. RLS 策略：确保草稿只有作者本人可见
-- 先删除可能冲突的旧策略（报错可忽略）
DROP POLICY IF EXISTS "games_select_published" ON games;
DROP POLICY IF EXISTS "games_select_own" ON games;
DROP POLICY IF EXISTS "games_select_all" ON games;

-- 公开游戏（online）所有人可见
CREATE POLICY "games_select_published" ON games
  FOR SELECT USING (status = 'online');

-- 自己的游戏（包括 draft/pending）自己可见
CREATE POLICY "games_select_own" ON games
  FOR SELECT USING (auth.uid() = author_id);

-- 更新策略：只能更新自己的游戏
DROP POLICY IF EXISTS "games_update_own" ON games;
CREATE POLICY "games_update_own" ON games
  FOR UPDATE USING (auth.uid() = author_id);

-- 插入策略：登录用户可以插入
DROP POLICY IF EXISTS "games_insert_auth" ON games;
CREATE POLICY "games_insert_auth" ON games
  FOR INSERT WITH CHECK (auth.uid() = author_id);

-- 确保 RLS 已启用
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
