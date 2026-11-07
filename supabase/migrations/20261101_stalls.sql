-- 摆摊小游戏：玩一局要花金币，玩得好有奖励
-- 价格放在 shop_items 里（key 以 __ 开头，管理员可以在后台改价格）

insert into shop_items (key, kind, name, price, is_active) values
  ('__stall_balloon', 'prop', '射气球（一局）', 10, false),
  ('__stall_pot', 'prop', '投壶（一局）', 10, false),
  ('__stall_ring', 'prop', '套圈（一局）', 10, false),
  ('__stall_mole', 'prop', '打地鼠（一局）', 10, false),
  ('__stall_duck', 'prop', '捞小鸭（一局）', 10, false),
  ('__stall_wheel', 'prop', '幸运转盘（一次）', 15, false)
on conflict (key) do nothing;

-- 每一局的记录：开局时扣钱、生成一条；结束时用它来领奖（一局只能领一次）
create table if not exists stall_plays (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game text not null check (game in ('balloon', 'pot', 'ring', 'mole', 'duck', 'wheel')),
  wheel int,                                   -- 转盘：开局时服务器就决定转到哪一格
  created_at timestamptz not null default now(),
  score int,
  prize int,
  claimed_at timestamptz
);
alter table stall_plays enable row level security;
drop policy if exists stall_plays_own on stall_plays;
create policy stall_plays_own on stall_plays for select using (user_id = auth.uid());

-- 开一局：扣掉这一局的价钱，返回 { play, coins }
create or replace function public.stall_play(p_game text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); cost int; left_coins int; pid uuid;
begin
  if uid is null then raise exception 'not_logged_in'; end if;
  if p_game not in ('balloon', 'pot', 'ring', 'mole', 'duck', 'wheel') then raise exception 'bad_game'; end if;
  select price into cost from shop_items where key = '__stall_' || p_game;
  cost := coalesce(cost, 10);
  update profiles set coins = coins - cost where id = uid and coalesce(coins, 0) >= cost returning coins into left_coins;
  if not found then raise exception 'not_enough_coins'; end if;
  insert into stall_plays (user_id, game, wheel) values (uid, p_game, case when p_game = 'wheel' then floor(random() * 8)::int end) returning id into pid;
  return jsonb_build_object('play', pid, 'coins', left_coins, 'cost', cost, 'wheel', (select wheel from stall_plays where id = pid));
end $$;

-- 领奖：按分数给金币（有上限），一局只能领一次，开局 10 分钟内有效；返回 { prize, coins }
create or replace function public.stall_claim(p_play uuid, p_score int)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); pl stall_plays; s int; v_prize int := 0; left_coins int; again uuid;
begin
  if uid is null then raise exception 'not_logged_in'; end if;
  select * into pl from stall_plays where id = p_play and user_id = uid for update;
  if not found then raise exception 'no_play'; end if;
  if pl.claimed_at is not null then raise exception 'already_claimed'; end if;
  if pl.created_at < now() - interval '10 minutes' then raise exception 'too_late'; end if;
  if pl.game = 'balloon' then
    s := least(greatest(p_score, 0), 10);               -- 10 支飞镖，最多扎破 10 个
    v_prize := case when s >= 9 then 20 when s >= 7 then 10 when s >= 5 then 5 else 0 end;                 -- 简单：奖得少
  elsif pl.game = 'pot' then
    s := least(greatest(p_score, 0), 15);               -- 投壶最难：奖得最多
    v_prize := case when s >= 10 then 60 when s >= 6 then 30 when s >= 4 then 15 when s >= 2 then 6 else 0 end;
  elsif pl.game = 'ring' then
    s := least(greatest(p_score, 0), 15);               -- 套圈：比较难
    v_prize := case when s >= 10 then 40 when s >= 6 then 20 when s >= 4 then 10 when s >= 2 then 5 else 0 end;
  elsif pl.game = 'mole' then
    s := least(greatest(p_score, 0), 45);               -- 30 秒打地鼠
    v_prize := case when s >= 25 then 30 when s >= 18 then 15 when s >= 12 then 8 when s >= 6 then 3 else 0 end;
  elsif pl.game = 'duck' then
    s := least(greatest(p_score, 0), 30);               -- 捞 6 只，每只 1~5 分
    v_prize := case when s >= 24 then 20 when s >= 18 then 10 when s >= 12 then 5 else 0 end;               -- 捞小鸭比较简单
  else                                                  -- 转盘：格子是开局时服务器定的，不看客户端
    s := pl.wheel;
    v_prize := (array[5, 10, 0, 20, 15, 50, 0, 10])[pl.wheel + 1];
  end if;
  update stall_plays set score = s, prize = v_prize, claimed_at = now() where id = p_play;
  update profiles set coins = coalesce(coins, 0) + v_prize where id = uid returning coins into left_coins;
  -- 转到「再转一次」：免费再开一局
  if pl.game = 'wheel' and pl.wheel = 2 then
    insert into stall_plays (user_id, game, wheel) values (uid, 'wheel', floor(random() * 8)::int) returning id into again;
    return jsonb_build_object('prize', 0, 'coins', left_coins, 'score', s, 'again', again, 'wheel', (select wheel from stall_plays where id = again));
  end if;
  return jsonb_build_object('prize', v_prize, 'coins', left_coins, 'score', s);
end $$;

grant execute on function public.stall_play(text) to authenticated;
grant execute on function public.stall_claim(uuid, int) to authenticated;
