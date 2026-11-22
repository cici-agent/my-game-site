-- ============================================================
-- 2026-11-22：每日签到功能 + 注册金币从 50 改为 100
--
-- A. profiles 新增签到字段
-- B. 注册金币上限从 50 改为 100（更新 guard_profile_columns 触发器）
-- C. daily_checkin() RPC 函数：签到 + 阶梯金币 + 抽奖
-- ============================================================

-- ---------- A. profiles 新增签到字段 ----------
alter table public.profiles
  add column if not exists last_checkin_date date,
  add column if not exists checkin_streak int not null default 0;

-- ---------- B. 更新注册金币上限 50 → 100 ----------
-- guard_profile_columns 触发器在 INSERT 时把 coins 截断为 least(coins, 50)
-- 现在改成 100
create or replace function public.guard_profile_columns()
returns trigger language plpgsql set search_path = public
as $$
begin
  -- 只限制网站前端过来的请求（anon / authenticated）；后台函数、SQL 编辑器不受限
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role := 'user';
    new.is_admin := false;
    new.deleted_at := null;
    new.coins := least(coalesce(new.coins, 0), 100);
    return new;
  end if;

  if (new.role is distinct from old.role
      or new.is_admin is distinct from old.is_admin
      or new.deleted_at is distinct from old.deleted_at
      or new.id is distinct from old.id)
     and not public.current_user_is_admin() then
    raise exception '没有权限修改账号角色' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- ---------- C. daily_checkin() 签到函数 ----------
-- 返回 jsonb: { streak, fixed_coins, lottery_coins, total, coins }
-- 错误码：not_logged_in / no_profile / already_checked_in
create or replace function public.daily_checkin()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  p record;
  today_date date;
  last_date date;
  new_streak int;
  fixed_coins int;
  lottery_coins int;
  total_reward int;
  new_balance int;
begin
  if uid is null then raise exception 'not_logged_in'; end if;

  -- 锁定当前用户行
  select * into p from public.profiles where id = uid for update;
  if not found then raise exception 'no_profile'; end if;

  -- 北京时间（UTC+8）的日期
  today_date := (now() + interval '8 hours')::date;
  last_date := p.last_checkin_date;

  -- 今天已经签过了
  if last_date = today_date then
    raise exception 'already_checked_in';
  end if;

  -- 计算连续签到天数
  if last_date = today_date - 1 then
    new_streak := coalesce(p.checkin_streak, 0) + 1;
  else
    new_streak := 1;
  end if;

  -- 阶梯金币
  -- 第1天10 / 第2天15 / 第3天20 / 第4天22 / 第5天25
  -- 第6天起每天+1，封顶50
  if new_streak = 1 then
    fixed_coins := 10;
  elsif new_streak = 2 then
    fixed_coins := 15;
  elsif new_streak = 3 then
    fixed_coins := 20;
  elsif new_streak = 4 then
    fixed_coins := 22;
  elsif new_streak = 5 then
    fixed_coins := 25;
  else
    fixed_coins := 25 + (new_streak - 5);
    if fixed_coins > 50 then fixed_coins := 50; end if;
  end if;

  -- 抽奖：5 / 10 / 15 金币，等概率 1/3
  lottery_coins := case floor(random() * 3)::int
    when 0 then 5
    when 1 then 10
    when 2 then 15
  end;

  total_reward := fixed_coins + lottery_coins;

  -- 更新金币余额、签到日期、连续天数
  update public.profiles
    set coins = coins + total_reward,
        last_checkin_date = today_date,
        checkin_streak = new_streak
    where id = uid
    returning coins into new_balance;

  -- 记录金币流水
  insert into public.coin_transactions (user_id, amount, source, description)
    values (uid, fixed_coins, 'checkin',
            '每日签到奖励（连续' || new_streak || '天）');
  insert into public.coin_transactions (user_id, amount, source, description)
    values (uid, lottery_coins, 'checkin_lottery',
            '签到抽奖奖励');

  return jsonb_build_object(
    'streak', new_streak,
    'fixed_coins', fixed_coins,
    'lottery_coins', lottery_coins,
    'total', total_reward,
    'coins', new_balance
  );
end;
$$;

revoke all on function public.daily_checkin() from public, anon;
grant execute on function public.daily_checkin() to authenticated;
