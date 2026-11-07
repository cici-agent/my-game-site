// ===== 各星球降落后的"广场"内容 =====
import { catName, CAT_ICON, COIN_EXTRAS, loadMyHome, loadDrafts } from './data.js';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
// 数据库里有些链接写死了 https://cici2.fun，统一转成站内相对路径（预览环境也能用）
export const localUrl = u => String(u || '').replace(/^https?:\/\/(www\.)?cici2\.fun/, '');
const COVER_BG = ['linear-gradient(135deg,#ff6b35,#ffd166)', 'linear-gradient(135deg,#4a90e2,#4ecdc4)', 'linear-gradient(135deg,#a855f7,#ff6b9d)',
  'linear-gradient(135deg,#52c41a,#4ecdc4)', 'linear-gradient(135deg,#ffd166,#ff6b35)', 'linear-gradient(135deg,#ff6b9d,#a855f7)'];

function cover(g, i, icon) {
  const src = localUrl(g.cover_url);
  const img = src && !/\.html?$/i.test(src) ? `<img src="${esc(src)}" alt="" loading="lazy" onerror="this.remove()">` : '';
  return `<div class="card-cover" style="background:${COVER_BG[i % COVER_BG.length]}">${icon}${img}</div>`;
}
function gameCard(g, i, href, extraMeta = '') {
  const cat = catName(g.category);
  return `<a class="game-card" style="animation-delay:${Math.min(i, 12) * .04}s" href="${esc(href)}">
    ${cover(g, i, CAT_ICON[cat] || '🎮')}
    <div class="card-info"><h3>${esc(g.title)}</h3><div class="card-meta"><span>${esc(cat)}</span>
    ${g.author ? `<span class="author">👤 ${esc(g.author)}</span>` : ''}${extraMeta || `<span class="rating">⭐ ${Number(g.rating || 0)}</span>`}</div></div></a>`;
}
const empty = t => `<div class="empty">${t}</div>`;

// ---------- 🎮 游戏星球 ----------
function renderGames(el, { games }) {
  const list = games.filter(g => g.planetKind === 'games');
  const cats = [...new Set(list.map(g => catName(g.category)))];
  const tabs = [['all', '🎯 全部'], ['new', '✨ 新游戏'], ['hot', '🔥 热门'], ...cats.map(c => [c, (CAT_ICON[c] || '🎮') + ' ' + c])];
  el.innerHTML = `<div class="st-tabs">${tabs.map(([k, t], i) => `<button data-k="${esc(k)}" class="${i ? '' : 'on'}">${esc(t)}</button>`).join('')}</div>
    <div class="games-grid" id="gGrid"></div>`;
  const grid = el.querySelector('#gGrid');
  const show = k => {
    let arr = list;
    if (k === 'new') arr = [...list].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 12);
    else if (k === 'hot') arr = [...list].sort((a, b) => (b.play_count || 0) - (a.play_count || 0)).slice(0, 12);
    else if (k !== 'all') arr = list.filter(g => catName(g.category) === k);
    grid.innerHTML = arr.length ? arr.map((g, i) => gameCard(g, i, `game.html?id=${encodeURIComponent(g.id)}&from=games`)).join('')
      : empty('🐣 这里还没有游戏，去创作星球做一个吧！');
  };
  el.querySelectorAll('.st-tabs button').forEach(b => b.onclick = () => {
    el.querySelectorAll('.st-tabs button').forEach(x => x.classList.toggle('on', x === b)); show(b.dataset.k);
  });
  show('all');
  return list.length + ' 个游戏';
}

// ---------- 🪙 金币星球：只有赚金币的挑战，免费玩 ----------
function renderCoins(el, { games, me }) {
  const db = games.filter(g => g.planetKind === 'coins');
  const have = new Set(db.map(g => localUrl(g.file_url)));
  const extras = COIN_EXTRAS.filter(x => !have.has(x.file_url));
  const icons = { '打字挑战赛': '⌨️', '打字排名赛': '🏆' };
  const cards = [
    ...db.map((g, i) => gameCard({ ...g, author: '' }, i, localUrl(g.file_url) + '?from=coins', '<span class="free">免费 · 赚金币</span>').replace(/(card-cover"[^>]*>)[^<]*/, `$1${icons[g.title] || '🪙'}`)),
    ...extras.map((x, i) => `<a class="game-card" style="animation-delay:${(db.length + i) * .04}s" href="${x.file_url}?from=coins">
        <div class="card-cover" style="background:${COVER_BG[(db.length + i) % COVER_BG.length]}">${x.icon}</div>
        <div class="card-info"><h3>${esc(x.title)}</h3><div class="card-meta"><span>${esc(x.sub)}</span><span class="free">免费 · 赚金币</span></div></div></a>`),
  ];
  el.innerHTML = `<div class="coin-rule"><div class="big">🪙</div><div><b>玩游戏要花金币，在这里闯关赚金币！</b>
      <div>这里的挑战都是免费玩的，答得越好，赚得越多。</div></div>
      <div class="mine">我的金币<b>${me ? (me.profile.coins || 0) : '--'}</b></div></div>
    <div class="games-grid">${cards.join('') || empty('挑战还在准备中…')}</div>`;
  return cards.length + ' 个挑战';
}

// ---------- 🎨 创作星球 ----------
async function renderCreate(el, { me }) {
  el.innerHTML = `<div class="create-row">
      <a class="big-card" href="editor.html?from=create" style="--g:linear-gradient(135deg,#8b6bff,#ff6b9d)">
        <div class="ic">🪄</div><div><h3>AI 游戏工坊</h3><p>说出你的点子，AI 几秒钟帮你做出一个游戏</p></div><span class="go">开始创作</span></a>
      <a class="big-card" href="upload.html?from=create" style="--g:linear-gradient(135deg,#1e88e5,#42a5f5)">
        <div class="ic">📤</div><div><h3>上传游戏</h3><p>已经做好的游戏文件，直接上传发布</p></div><span class="go">去上传</span></a>
    </div>
    <h4 class="st-h">📝 我的草稿</h4><div class="draft-list" id="drafts"><div class="empty">加载中…</div></div>
    <p class="st-note">发布后的游戏要等管理员审核，通过后会出现在游戏星球。</p>`;
  if (!me) return '';
  const drafts = await loadDrafts(me.user.id);
  el.querySelector('#drafts').innerHTML = drafts.length
    ? drafts.map(d => `<a class="draft" href="editor.html?game_id=${encodeURIComponent(d.id)}&from=create">📝 <b>${esc(d.title || '未命名游戏')}</b>
        <span>${new Date(d.created_at).toLocaleDateString('zh-CN')}</span><span class="go">继续做</span></a>`).join('')
    : empty('还没有草稿，点上面的"AI 游戏工坊"开始做第一个游戏吧！');
  return '';
}

// ---------- 🏠 我的星球 ----------
const STATUS = { online: ['已上线', 'ok'], pending: ['审核中', 'wait'], draft: ['草稿', 'draft'], offline: ['已下线', 'off'] };
const AVATARS = Array.from({ length: 12 }, (_, i) => `assets/avatars/avatar_${String(i + 1).padStart(2, '0')}.png`);

async function renderHome(el, ctx) {
  const { me } = ctx;
  if (!me) { el.innerHTML = empty('请先登录'); return ''; }
  const p = me.profile, isAdmin = p.role === 'admin';
  el.innerHTML = `<div class="home-card">
      <img class="av" id="hAv" src="${esc(p.avatar_url || AVATARS[0])}" alt="">
      <div class="who"><h3>${esc(p.username)}</h3><div class="coins">🪙 <b>${p.coins || 0}</b> 金币</div></div>
      <div class="acts">
        <button id="hAvBtn">🎨 换头像</button>
        ${isAdmin ? '<a href="admin.html?from=home">⚙️ 管理后台</a>' : ''}
        <button id="hOut" class="out">🚪 退出登录</button>
      </div></div>
    <div class="av-pick" id="avPick">${AVATARS.map(a => `<img src="${a}" data-a="${a}" class="${a === p.avatar_url ? 'on' : ''}" alt="">`).join('')}</div>
    <div class="st-tabs"><button data-k="tx" class="on">🪙 金币明细</button><button data-k="mine">🎯 我发布的游戏</button><button data-k="played">🕹️ 我玩过的游戏</button></div>
    <div id="hBody"><div class="empty">加载中…</div></div>`;
  el.querySelector('#hOut').onclick = async () => { await signOut(); ctx.onLogout && ctx.onLogout(); };
  el.querySelector('#hAvBtn').onclick = () => el.querySelector('#avPick').classList.toggle('show');
  el.querySelectorAll('#avPick img').forEach(img => img.onclick = async () => {
    const r = await getSupabase().from('profiles').update({ avatar_url: img.dataset.a }).eq('id', me.user.id);
    if (!r.error) { p.avatar_url = img.dataset.a; el.querySelector('#hAv').src = img.dataset.a;
      el.querySelectorAll('#avPick img').forEach(i => i.classList.toggle('on', i === img)); el.querySelector('#avPick').classList.remove('show'); }
  });
  const data = await loadMyHome(me.user.id);
  const body = el.querySelector('#hBody');
  const views = {
    tx: () => data.tx.length ? `<div class="tx-list">${data.tx.map(t => `<div class="tx"><span class="d">${esc(t.description || t.source)}</span>
        <span class="t">${new Date(t.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        <b class="${t.amount >= 0 ? 'plus' : 'minus'}">${t.amount >= 0 ? '+' : ''}${t.amount}</b></div>`).join('')}</div>`
      : empty('还没有金币记录，去金币星球赚一些吧！'),
    mine: () => data.mine.length ? `<div class="games-grid">${data.mine.map((g, i) => {
        const [txt, cls] = STATUS[g.status] || [g.status, 'off'];
        const href = g.status === 'draft' ? `editor.html?game_id=${encodeURIComponent(g.id)}&from=home` : `game.html?id=${encodeURIComponent(g.id)}&preview=1&from=home`;
        return gameCard(g, i, href, `<span class="st ${cls}">${txt}</span>`);
      }).join('')}</div>` : empty('还没有发布游戏，去创作星球做一个吧！'),
    played: () => data.played.length ? `<div class="games-grid">${data.played.map((g, i) => gameCard(g, i, `game.html?id=${encodeURIComponent(g.id)}&from=home`, '')).join('')}</div>`
      : empty('还没有玩过游戏，去游戏星球看看吧！'),
  };
  const show = k => body.innerHTML = views[k]();
  el.querySelectorAll('.st-tabs button').forEach(b => b.onclick = () => {
    el.querySelectorAll('.st-tabs button').forEach(x => x.classList.toggle('on', x === b)); show(b.dataset.k);
  });
  show('tx');
  return '';
}

// ---------- 🏡 菜鸟家园（开发中） ----------
function renderComingSoon(el) {
  el.innerHTML = `<div class="empty" style="padding:40px 16px;line-height:1.9">
    <div style="font-size:64px">🏡🚧</div>
    <div style="font-size:22px;font-weight:700;margin:8px 0">菜鸟家园正在开发中</div>
    <div>以后每个人在这里都会有一个自己的小家。<br>敬请期待！</div></div>`;
  return '';
}

const RENDER = { homestead: renderComingSoon, games: renderGames, coins: renderCoins, create: renderCreate, home: renderHome };
export async function renderStation(el, planet, ctx) {
  const fn = RENDER[planet.kind];
  if (!fn) { el.innerHTML = empty('这颗星球还在建设中…'); return ''; }
  return await fn(el, ctx);
}
