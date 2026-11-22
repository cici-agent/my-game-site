create table public.mayor_coin_gifts (
  player uuid not null references auth.users(id) on delete cascade,
  village_day integer not null,
  amount integer not null check (amount > 0),
  primary key (player, village_day)
);
alter table public.mayor_coin_gifts enable row level security;
revoke all on public.mayor_coin_gifts from public, anon, authenticated;

create function public.gift_mayor_coins(p_day integer, p_amount integer)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  player_id uuid := auth.uid();
  old_amount integer;
  balance integer;
begin
  if player_id is null then raise exception 'not_logged_in'; end if;
  select coins into balance from public.profiles where id = player_id for update;
  if not found then raise exception 'no_profile'; end if;
  select amount into old_amount from public.mayor_coin_gifts
    where player = player_id and village_day = p_day;
  if found then return old_amount; end if;
  if p_day is distinct from floor(extract(epoch from now()) / 2400)::integer then raise exception 'expired_day'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'bad_amount'; end if;
  if coalesce(balance,0) < p_amount then raise exception 'not_enough_coins'; end if;
  insert into public.mayor_coin_gifts values (player_id, p_day, p_amount);
  update public.profiles set coins = coins - p_amount where id = player_id;
  insert into public.coin_transactions(user_id, amount, source, description)
    values (player_id, -p_amount, 'mayor_gift', '菜鸟家园 · 送给村长的金币');
  return p_amount;
end $$;
revoke all on function public.gift_mayor_coins(integer,integer) from public, anon;
grant execute on function public.gift_mayor_coins(integer,integer) to authenticated;
