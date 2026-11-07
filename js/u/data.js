// ===== 宇宙数据层：星球、游戏、当前用户 =====
// 数据库还没迁移（没有 planets 表 / planet_id 字段）时自动用内置默认值，保证页面能跑。

export const SITE = '';   // 同域相对路径

// 默认星球（和数据库迁移里的初始数据一致）
export const DEFAULT_PLANETS = [
  { kind: 'plaza',  name: '菜鸟星球', icon: '🐣', color: '#ffb84d', description: '游乐园、商店，和小伙伴一起玩', sort_order: 1 },
  { kind: 'games',  name: '游戏星球', icon: '🎮', color: '#ff6b35', description: '所有游戏，玩个痛快',           sort_order: 2, is_default: true },
  { kind: 'coins',  name: '金币星球', icon: '🪙', color: '#ffd23f', description: '闯关学习，赚金币',             sort_order: 3 },
  { kind: 'create', name: '创作星球', icon: '🎨', color: '#8b6bff', description: '说出点子，AI 帮你做游戏',      sort_order: 4 },
  { kind: 'home',   name: '我的星球', icon: '🏠', color: '#2ec4b6', description: '我的金币、头像和作品',         sort_order: 5 },
  { kind: 'homestead', name: '菜鸟家园', icon: '🏡', color: '#7bc950', description: '自己的小屋、菜园和小动物（开发中）', sort_order: 7, coming_soon: true },
];

// 赚金币的挑战：识别方式 = 游戏文件路径。数学/拼写/语法/听力 4 个目前不在 games 表里，这里补上
const COIN_GAME_RE = /\/games\/(typing-challenge|typing-rank|math-challenge|spelling-bee|grammar-challenge|listening-challenge)\//;
export const COIN_EXTRAS = [
  { id: 'math',      title: '数学闯关',     file_url: '/games/math-challenge/index.html',      icon: '🧮', sub: '口算、应用题，闯关赚金币' },
  { id: 'spelling',  title: '英语拼读',     file_url: '/games/spelling-bee/index.html',        icon: '🐝', sub: 'Spelling Bee 拼单词' },
  { id: 'grammar',   title: '语法词汇挑战', file_url: '/games/grammar-challenge/index.html',   icon: '📝', sub: '英语语法和词汇' },
  { id: 'listening', title: '英语听力挑战', file_url: '/games/listening-challenge/index.html', icon: '🎧', sub: '听一听，选一选' },
];
export const isCoinGame = g => COIN_GAME_RE.test(g.file_url || '');

export const CAT_NAME = { action: '动作', shooter: '射击', shooting: '射击', runner: '跑酷', puzzle: '益智', 'tower-defense': '塔防',
  learning: '学习', education: '学习', casual: '休闲', raising: '养成', other: '其他' };
export const CAT_ICON = { 动作: '💥', 射击: '🔫', 跑酷: '🏃', 益智: '🧩', 塔防: '🏰', 学习: '📚', 休闲: '🎪', 养成: '🌱', 其他: '🎮' };
export const catName = c => CAT_NAME[c] || c || '其他';

const sb = () => (typeof getSupabase === 'function' ? getSupabase() : null);

export async function loadPlanets() {
  try {
    const r = await sb().from('planets').select('*').eq('is_active', true).order('sort_order');
    if (!r.error && r.data && r.data.length) return r.data;
  } catch (e) { /* 表还不存在 */ }
  return DEFAULT_PLANETS.map(p => ({ ...p }));
}

// 返回已上线游戏，每个带 planetKind（games / coins）
export async function loadGames(planets) {
  const client = sb();
  if (!client) return [];
  let rows = null;
  let r = await client.from('games')
    .select('id,title,category,rating,cover_url,file_url,play_count,created_at,planet_id,profiles(username,deleted_at)')
    .eq('status', 'online').order('created_at', { ascending: false });
  if (r.error) { // 还没有 planet_id 字段
    r = await client.from('games')
      .select('id,title,category,rating,cover_url,file_url,play_count,created_at,profiles(username,deleted_at)')
      .eq('status', 'online').order('created_at', { ascending: false });
  }
  rows = r.data || [];
  const kindById = {};
  planets.forEach(p => { if (p.id) kindById[p.id] = p.kind; });
  return rows.map(g => ({
    ...g,
    author: g.profiles ? (g.profiles.deleted_at ? '已注销' : g.profiles.username) : '',
    planetKind: (g.planet_id && kindById[g.planet_id]) || (isCoinGame(g) ? 'coins' : 'games'),
  }));
}

export async function loadMe() {
  if (typeof getCurrentUser !== 'function') return null;
  const user = await getCurrentUser();
  if (!user) return null;
  const profile = await getUserProfile(user.id);
  if (!profile || profile.deleted_at) return null;
  return { user, profile };
}

// 我装备的飞船 / 皮肤 / 装饰（没有记录 = 全部默认）
export async function loadEquipment(userId) {
  const client = sb(); if (!client || !userId) return null;
  try {
    const { data, error } = await client.from('user_equipment').select('*').eq('user_id', userId).maybeSingle();
    if (error) return null;
    return data || { ship: 'rookie', skin: 'explorer' };
  } catch (e) { return null; }
}

export async function loadMyHome(userId) {
  const client = sb();
  const [tx, mine, played] = await Promise.all([
    client.from('coin_transactions').select('amount,source,description,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
    client.from('games').select('id,title,status,category,cover_url,rating,play_count,created_at').eq('author_id', userId).order('created_at', { ascending: false }),
    client.from('game_plays').select('game_id, games(id,title,category,cover_url,status)').eq('user_id', userId).limit(40),
  ]);
  return { tx: tx.data || [], mine: mine.data || [], played: (played.data || []).map(x => x.games).filter(Boolean) };
}

export async function loadDrafts(userId) {
  const r = await sb().from('games').select('id,title,created_at').eq('author_id', userId).eq('status', 'draft').order('created_at', { ascending: false });
  return r.data || [];
}
