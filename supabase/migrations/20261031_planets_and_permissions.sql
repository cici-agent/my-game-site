-- ============================================================
-- 2026-10-31：星球配置 + 修复权限漏洞
--
-- A. 权限修复（不影响现有功能）
--    1) 普通用户不能再把自己改成管理员（role / is_admin / deleted_at 只有管理员能改）
--    2) 注册时不能给自己写管理员身份或超过 50 的初始金币
--    3) 删除"任何人都能改任何游戏"的规则；评分改由数据库在评论变化时自动计算
--    4) 普通用户不能把自己的游戏直接改成"已上线"（必须管理员审核），也不能改所属星球
-- B. 星球配置（3D 宇宙首页）
--    5) 新表 planets：名字、emoji、颜色、一句话简介、排序、功能类型(kind)、是否默认星球
--       kind：plaza 菜鸟星球 / games 游戏星球 / coins 金币星球 / create 创作星球 / home 我的星球
--    6) games 新增 planet_id：官方打字挑战赛、打字排名赛 → 金币星球，其余 → 游戏星球；
--       新游戏不填 planet_id，3D 首页里显示在默认星球（游戏星球），管理员审核时可改
--
-- 说明：金币目前仍由前端直接修改（审查报告第 9 条），这次不动，避免影响扣费/奖励功能。
-- ============================================================

-- ---------- 工具函数：当前登录用户是不是管理员 ----------
create or replace function public.current_user_is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and deleted_at is null
  );
$$;
revoke all on function public.current_user_is_admin() from public;
grant execute on function public.current_user_is_admin() to anon, authenticated;

-- ---------- 1+2. profiles：保护角色字段 ----------
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
    new.coins := least(coalesce(new.coins, 0), 50);
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

drop trigger if exists trg_guard_profile_columns on public.profiles;
create trigger trg_guard_profile_columns
  before insert or update on public.profiles
  for each row execute function public.guard_profile_columns();

-- ---------- 3. 评分：由数据库自动计算 ----------
drop policy if exists "games_update_rating" on public.games;

create or replace function public.refresh_game_rating()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  gid uuid := coalesce(new.game_id, old.game_id);
begin
  update public.games
     set rating = coalesce((select round(avg(rating)::numeric, 1) from public.reviews where game_id = gid), 0)
   where id = gid;
  return null;
end;
$$;

drop trigger if exists trg_reviews_refresh_rating on public.reviews;
create trigger trg_reviews_refresh_rating
  after insert or update or delete on public.reviews
  for each row execute function public.refresh_game_rating();

-- ---------- 5. 星球表 ----------
create table if not exists public.planets (
  id            uuid primary key default gen_random_uuid(),
  kind          text not null,                    -- 功能类型，决定降落后广场里显示什么
  name          text not null,
  icon          text not null default '🪐',      -- emoji
  color         text not null default '#ff6b35', -- 主题色，3D 星球按它生成纹理
  description   text,                             -- 一句话简介，显示在星球名字下面
  sort_order    int  not null default 0,
  is_default    boolean not null default false,   -- 没分配星球的游戏显示在这里
  is_active     boolean not null default true,    -- 关掉后前台不显示
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint planets_kind_valid check (kind in ('plaza','games','coins','create','home')),
  constraint planets_color_hex check (color ~ '^#[0-9a-fA-F]{6}$'),
  constraint planets_name_len check (char_length(name) between 1 and 20)
);
create unique index if not exists planets_only_one_default on public.planets ((true)) where is_default;

alter table public.planets enable row level security;
drop policy if exists "planets_read" on public.planets;
create policy "planets_read" on public.planets
  for select using (is_active or public.current_user_is_admin());
drop policy if exists "planets_admin_insert" on public.planets;
create policy "planets_admin_insert" on public.planets
  for insert to authenticated with check (public.current_user_is_admin());
drop policy if exists "planets_admin_update" on public.planets;
create policy "planets_admin_update" on public.planets
  for update to authenticated using (public.current_user_is_admin()) with check (public.current_user_is_admin());
drop policy if exists "planets_admin_delete" on public.planets;
create policy "planets_admin_delete" on public.planets
  for delete to authenticated using (public.current_user_is_admin());

-- ---------- 6. 游戏所属星球 ----------
alter table public.games add column if not exists planet_id uuid references public.planets(id) on delete set null;
create index if not exists idx_games_planet on public.games(planet_id);

-- ---------- 4. games：普通用户不能自己上线、不能改星球 ----------
create or replace function public.guard_game_changes()
returns trigger language plpgsql set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') or public.current_user_is_admin() then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status is null or new.status not in ('draft', 'pending') then
      new.status := 'pending';
    end if;
    new.planet_id := null;
    return new;
  end if;

  if new.status = 'online' and old.status is distinct from 'online' then
    raise exception '游戏需要管理员审核后才能上线' using errcode = '42501';
  end if;
  if new.planet_id is distinct from old.planet_id or new.author_id is distinct from old.author_id then
    raise exception '没有权限修改游戏归属' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_game_changes on public.games;
create trigger trg_guard_game_changes
  before insert or update on public.games
  for each row execute function public.guard_game_changes();

-- ---------- 初始数据：5 颗星球 + 游戏归位 ----------
insert into public.planets (kind, name, icon, color, description, sort_order, is_default)
select * from (values
  ('plaza',  '菜鸟星球', '🐣', '#ffb84d', '大家都在这里：排行榜、商店、找小伙伴', 1, false),
  ('games',  '游戏星球', '🎮', '#ff6b35', '所有游戏，玩个痛快',                 2, true),
  ('coins',  '金币星球', '🪙', '#ffd23f', '闯关学习，赚金币',                   3, false),
  ('create', '创作星球', '🎨', '#8b6bff', '说出点子，AI 帮你做游戏',            4, false),
  ('home',   '我的星球', '🏠', '#2ec4b6', '我的金币、头像和作品',               5, false)
) v(kind, name, icon, color, description, sort_order, is_default)
where not exists (select 1 from public.planets);

-- 官方赚金币挑战 → 金币星球；其余游戏 → 游戏星球
update public.games g set planet_id = p.id
  from public.planets p
 where g.planet_id is null
   and p.kind = case
     when g.file_url ~ '/games/(typing-challenge|typing-rank|math-challenge|spelling-bee|grammar-challenge|listening-challenge)/' then 'coins'
     else 'games'
   end;
