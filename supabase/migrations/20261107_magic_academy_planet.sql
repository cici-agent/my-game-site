-- 第六颗星球：魔法学院星球
-- 前端即使在本迁移执行前也会使用内置配置展示星球；本迁移把它写入正式数据层。

alter table public.planets drop constraint if exists planets_kind_valid;
alter table public.planets
  add constraint planets_kind_valid
  check (kind in ('plaza','games','coins','create','home','magic'));

update public.planets
   set name = '魔法学院星球',
       icon = '🦉',
       color = '#6f5bd3',
       description = '穿过站台，坐上列车，前往魔法城堡',
       sort_order = 6,
       is_active = true,
       updated_at = now()
 where kind = 'magic';

insert into public.planets (kind, name, icon, color, description, sort_order, is_default, is_active)
select 'magic', '魔法学院星球', '🦉', '#6f5bd3', '穿过站台，坐上列车，前往魔法城堡', 6, false, true
where not exists (select 1 from public.planets where kind = 'magic');
