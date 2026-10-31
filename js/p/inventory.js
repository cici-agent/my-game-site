// ===== 商店数据：价格（数据库为准）、我的背包、我的装备、购买 / 装备 / 使用 =====
import { CATALOG } from './catalog.js';

const sb = () => (typeof getSupabase === 'function' ? getSupabase() : null);

const ERR = {
  not_logged_in: '请先登录',
  not_enough_coins: '金币不够哦，去金币星球赚一点吧',
  already_owned: '你已经有这个啦',
  not_owned: '还没有买这个',
  none_left: '这个道具用完了',
  bad_qty: '一次最多买 10 个',
  no_such_item: '这个商品下架了',
};
const msgOf = e => {
  const m = (e && (e.message || e.details)) || '';
  const k = Object.keys(ERR).find(k => m.includes(k));
  return k ? ERR[k] : '网络好像有点问题，再试一次';
};

export const INV = {
  ready: false,
  prices: {},          // key -> { price, active }
  have: {},            // key -> 数量（永久物品 = 1）
  equip: { ship: 'rookie', skin: 'explorer', hand: null, head: null, back: null, pet: null, fx: null },
  coins: null,
};

// 商品目录 + 数据库价格合并
export function itemsOf(shopKey) {
  return CATALOG[shopKey]
    .map(it => ({ ...it, price: INV.prices[it.key] ? INV.prices[it.key].price : it.price, active: INV.prices[it.key] ? INV.prices[it.key].active : true }))
    .filter(it => it.active);
}
export const findItem = key => {
  for (const k of Object.keys(CATALOG)) { const it = CATALOG[k].find(i => i.key === key); if (it) return { ...it, shop: k, price: INV.prices[key] ? INV.prices[key].price : it.price }; }
  return null;
};
export const slotOf = it => it.shop === 'ship' ? 'ship' : it.shop === 'skin' ? 'skin' : it.kind === 'decor' ? it.slot : null;
export const owns = key => { const it = findItem(key); return !!it && (it.price === 0 && it.kind !== 'use' || (INV.have[key] || 0) > 0); };

export async function loadInventory(userId) {
  const c = sb(); if (!c) return INV;
  const jobs = [c.from('shop_items').select('key,price,is_active')];
  if (userId) {
    jobs.push(c.from('user_items').select('item_key,qty').eq('user_id', userId));
    jobs.push(c.from('user_equipment').select('*').eq('user_id', userId).maybeSingle());
  }
  try {
    const [items, mine, eq] = await Promise.all(jobs);
    (items.data || []).forEach(r => INV.prices[r.key] = { price: r.price, active: r.is_active });
    INV.have = {};
    if (mine) (mine.data || []).forEach(r => INV.have[r.item_key] = r.qty);
    if (eq && eq.data) Object.keys(INV.equip).forEach(k => { if (k in eq.data) INV.equip[k] = eq.data[k]; });
    INV.ready = true;
  } catch (e) { console.warn('inventory', e); }
  return INV;
}

export async function buy(key, qty = 1) {
  const { data, error } = await sb().rpc('buy_item', { p_key: key, p_qty: qty });
  if (error) throw new Error(msgOf(error));
  INV.coins = data.coins; INV.have[key] = data.qty;
  return data;
}
export async function equip(slot, key) {
  const { data, error } = await sb().rpc('equip_item', { p_slot: slot, p_key: key });
  if (error) throw new Error(msgOf(error));
  Object.keys(INV.equip).forEach(k => { if (k in data) INV.equip[k] = data[k]; });
  return INV.equip;
}
export async function useItem(key) {
  const { data, error } = await sb().rpc('use_item', { p_key: key });
  if (error) throw new Error(msgOf(error));
  INV.have[key] = data;
  return data;
}
