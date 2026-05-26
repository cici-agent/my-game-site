-- ===== 金币流水记录表 =====
-- 在 Supabase SQL Editor 中执行此脚本

CREATE TABLE IF NOT EXISTS coin_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  amount INT NOT NULL,           -- 正数为增加，负数为减少
  source TEXT NOT NULL,          -- 来源：register/typing_challenge/typing_rank/game_play/ai_publish/admin
  description TEXT,              -- 显示给用户看的文字，如"打字挑战赛第3级通关"
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 索引：按用户+时间倒序查询
CREATE INDEX IF NOT EXISTS idx_coin_transactions_user_time 
  ON coin_transactions(user_id, created_at DESC);

-- 启用行级安全
ALTER TABLE coin_transactions ENABLE ROW LEVEL SECURITY;

-- RLS 策略：用户只能读取自己的记录
CREATE POLICY "users can read own transactions" 
  ON coin_transactions FOR SELECT 
  USING (auth.uid() = user_id);

-- RLS 策略：允许服务端（service_role）插入记录
-- 前端也可以插入自己的记录（用于打字奖励等场景）
CREATE POLICY "users can insert own transactions" 
  ON coin_transactions FOR INSERT 
  WITH CHECK (auth.uid() = user_id);
