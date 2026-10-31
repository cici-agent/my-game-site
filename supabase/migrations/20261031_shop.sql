-- ===== 菜鸟星球商店：商品、背包、装备、购买 =====
-- 只新增表和函数，不改动已有表结构。金币的扣除只在服务器端函数里完成。

create table if not exists public.shop_items (
  key text primary key,
  kind text not null check (kind in ('ship','skin','prop')),
  name text not null,
  price int not null default 0 check (price >= 0),
  slot text check (slot in ('ship','skin','hand','head','back','pet','fx')),
  consumable boolean not null default false,
  sort_order int not null default 0,
  is_active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.user_items (
  user_id uuid not null references auth.users(id) on delete cascade,
  item_key text not null references public.shop_items(key) on update cascade,
  qty int not null default 1 check (qty >= 0),
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

create table if not exists public.user_equipment (
  user_id uuid primary key references auth.users(id) on delete cascade,
  ship text not null default 'rookie',
  skin text not null default 'explorer',
  hand text, head text, back text, pet text, fx text,
  updated_at timestamptz not null default now()
);

alter table public.shop_items enable row level security;
alter table public.user_items enable row level security;
alter table public.user_equipment enable row level security;

create or replace function public.shop_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and (role = 'admin' or is_admin is true));
$$;

drop policy if exists shop_items_read on public.shop_items;
create policy shop_items_read on public.shop_items for select using (true);
drop policy if exists shop_items_admin on public.shop_items;
create policy shop_items_admin on public.shop_items for all using (public.shop_is_admin()) with check (public.shop_is_admin());

drop policy if exists user_items_own on public.user_items;
create policy user_items_own on public.user_items for select using (auth.uid() = user_id);

-- 装备是公开的（以后多人模式里别人要看到你的造型）；只能通过函数修改
drop policy if exists user_equipment_read on public.user_equipment;
create policy user_equipment_read on public.user_equipment for select using (true);

-- 购买：检查价格 → 扣金币（余额不足则失败）→ 记账 → 放进背包
create or replace function public.buy_item(p_key text, p_qty int default 1)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); it shop_items; cost int; left_coins int; have int;
begin
  if uid is null then raise exception 'not_logged_in'; end if;
  select * into it from shop_items where key = p_key and is_active;
  if not found then raise exception 'no_such_item'; end if;
  if it.consumable then
    if p_qty is null or p_qty < 1 or p_qty > 10 then raise exception 'bad_qty'; end if;
  else
    p_qty := 1;
    if it.price = 0 or exists (select 1 from user_items where user_id = uid and item_key = p_key and qty > 0) then
      raise exception 'already_owned';
    end if;
  end if;
  cost := it.price * p_qty;
  update profiles set coins = coins - cost where id = uid and coalesce(coins,0) >= cost returning coins into left_coins;
  if not found then raise exception 'not_enough_coins'; end if;
  insert into coin_transactions(user_id, amount, source, description)
    values (uid, -cost, 'shop', '购买 ' || it.name || case when p_qty > 1 then ' ×' || p_qty else '' end);
  insert into user_items(user_id, item_key, qty) values (uid, p_key, p_qty)
    on conflict (user_id, item_key) do update set qty = user_items.qty + excluded.qty
    returning qty into have;
  return jsonb_build_object('coins', left_coins, 'qty', have);
end $$;

-- 装备 / 卸下（p_key 为 null 表示卸下；飞船和皮肤不能卸下，只能换）
create or replace function public.equip_item(p_slot text, p_key text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); it shop_items; r user_equipment;
begin
  if uid is null then raise exception 'not_logged_in'; end if;
  if p_slot not in ('ship','skin','hand','head','back','pet','fx') then raise exception 'bad_slot'; end if;
  if p_key is not null then
    select * into it from shop_items where key = p_key;
    if not found or it.slot is distinct from p_slot then raise exception 'bad_item'; end if;
    if it.price > 0 and not exists (select 1 from user_items where user_id = uid and item_key = p_key and qty > 0) then
      raise exception 'not_owned';
    end if;
  elsif p_slot in ('ship','skin') then raise exception 'cannot_unequip';
  end if;
  insert into user_equipment(user_id) values (uid) on conflict (user_id) do nothing;
  execute format('update user_equipment set %I = $1, updated_at = now() where user_id = $2', p_slot) using p_key, uid;
  select * into r from user_equipment where user_id = uid;
  return to_jsonb(r);
end $$;

-- 使用一次能力道具
create or replace function public.use_item(p_key text)
returns int language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid(); left_qty int;
begin
  if uid is null then raise exception 'not_logged_in'; end if;
  update user_items u set qty = u.qty - 1
    from shop_items s
   where u.user_id = uid and u.item_key = p_key and s.key = u.item_key and s.consumable and u.qty > 0
  returning u.qty into left_qty;
  if not found then raise exception 'none_left'; end if;
  return left_qty;
end $$;

revoke all on function public.buy_item(text,int), public.equip_item(text,text), public.use_item(text) from public, anon;
grant execute on function public.buy_item(text,int), public.equip_item(text,text), public.use_item(text) to authenticated;

insert into public.shop_items(key, kind, name, price, slot, consumable, sort_order) values
('rookie','ship','小菜鸟号',0,'ship',false,0),
('thunder','ship','雷电号',50,'ship',false,1),
('starry','ship','星空号',100,'ship',false,2),
('explorer','skin','小探险家',0,'skin',false,3),
('chef','skin','小厨师',15,'skin',false,4),
('astro','skin','小宇航员',25,'skin',false,5),
('knight','skin','小骑士',30,'skin',false,6),
('wizard','skin','小魔法师',40,'skin',false,7),
('chick','skin','小黄鸡',20,'skin',false,8),
('bunny','skin','小兔子',25,'skin',false,9),
('panda','skin','熊猫',30,'skin',false,10),
('corgi','skin','柯基',30,'skin',false,11),
('dino','skin','小恐龙',50,'skin',false,12),
('robot','skin','机器人',60,'skin',false,13),
('unicorn','skin','独角兽',100,'skin',false,14),
('jetpack','prop','喷气背包',50,null,true,15),
('copter','prop','竹蜻蜓',20,null,true,16),
('balloon','prop','气球束',20,null,true,17),
('spring','prop','弹簧鞋',25,null,true,18),
('skate','prop','飞速滑板',25,null,true,19),
('grow','prop','变大蘑菇',15,null,true,20),
('shrink','prop','变小药水',15,null,true,21),
('snowball','prop','雪球',5,null,true,22),
('firework','prop','烟花筒',10,null,true,23),
('bubble','prop','泡泡机',10,null,true,24),
('lolly','prop','棒棒糖',5,'hand',false,25),
('icecream','prop','冰淇淋',5,'hand',false,26),
('wand','prop','魔法棒',15,'hand',false,27),
('flag','prop','小旗子',8,'hand',false,28),
('glow','prop','荧光棒',10,'hand',false,29),
('partyhat','prop','派对帽',8,'head',false,30),
('crown','prop','小皇冠',25,'head',false,31),
('catears','prop','猫耳发箍',12,'head',false,32),
('wings','prop','小翅膀',30,'back',false,33),
('cape','prop','披风',20,'back',false,34),
('petchick','prop','宠物小黄鸡',25,'pet',false,35),
('petcat','prop','宠物小猫',35,'pet',false,36),
('petdog','prop','宠物小狗',40,'pet',false,37),
('steps','prop','星星脚印',15,'fx',false,38),
('hearts','prop','爱心脚印',15,'fx',false,39)

on conflict (key) do nothing;
