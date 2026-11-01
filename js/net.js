// ===== 多人连线：Supabase Realtime（presence 记录谁在线，broadcast 发位置和事件） =====
// 没登录的人：能看到别人，但自己不出现（不 track、不发消息）。
// 免费版额度有限：位置只在移动时每秒发 8 次，静止时每 2 秒发 1 次。

const sb = () => (typeof getSupabase === 'function' ? getSupabase() : null);

export function joinRoom(room, me /* {id, name, ...look} 或 null */) {
  const client = sb();
  const handlers = {};
  const peers = new Map();          // id -> { id, name, ...presence, lastSeen }
  const api = {
    peers, me, ready: false,
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); return api; },
    send() {}, setPresence() {}, close() {},
  };
  if (!client || !client.channel) return api;
  const emit = (ev, ...a) => (handlers[ev] || []).forEach(f => { try { f(...a); } catch (e) { console.warn(e); } });

  const key = me ? me.id : 'guest-' + Math.random().toString(36).slice(2, 9);
  const test = new URLSearchParams(location.search).get('mproom');      // 测试用的独立房间，不打扰真实玩家
  const ch = client.channel('xcn-' + room + (test ? '-t-' + test : ''), { config: { broadcast: { self: false, ack: false }, presence: { key } } });
  let presence = me ? { ...me } : null;

  ch.on('presence', { event: 'sync' }, () => {
    const st = ch.presenceState(), seen = new Set();
    Object.entries(st).forEach(([id, metas]) => {
      if (!metas || !metas.length || id === key || id.startsWith('guest-')) return;
      const m = metas[metas.length - 1]; seen.add(id);
      const old = peers.get(id);
      const p = Object.assign(old || { id, lastSeen: performance.now() }, m);
      if (!old) { peers.set(id, p); emit('join', p); } else emit('update', p);
    });
    [...peers.keys()].forEach(id => { if (!seen.has(id)) { const p = peers.get(id); peers.delete(id); emit('leave', p); } });
  });
  ch.on('broadcast', { event: 'm' }, ({ payload }) => {
    if (!payload || payload.f === key) return;
    const p = peers.get(payload.f);
    if (p) p.lastSeen = performance.now();
    emit(payload.t, payload.d, p || { id: payload.f }, payload.f);
  });
  ch.subscribe(async status => {
    if (status === 'SUBSCRIBED') { api.ready = true; if (presence) await ch.track(presence); emit('ready'); }
  });

  // 只有登录用户才往外发
  api.send = (type, data) => { if (!me || !api.ready) return; ch.send({ type: 'broadcast', event: 'm', payload: { f: key, t: type, d: data } }); };
  api.setPresence = (patch) => { if (!me) return; presence = { ...presence, ...patch }; if (api.ready) ch.track(presence); };
  api.close = () => { try { client.removeChannel(ch); } catch (e) {} };
  addEventListener('pagehide', api.close);
  return api;
}

// 位置节流：移动时 8 次/秒，静止 2 秒一次
export function throttle() {
  let last = 0, lastSig = '';
  return (now, moving, sig) => {
    const gap = moving ? 125 : 2000;
    if (now - last < gap && sig === lastSig) return false;
    if (now - last < 125) return false;
    last = now; lastSig = sig; return true;
  };
}

// 把世界坐标点放到屏幕上的名字标签
export function nameTag(container, name, color = '#fff') {
  const el = document.createElement('div');
  el.className = 'mp-tag'; el.style.setProperty('--c', color);
  el.textContent = name;
  container.appendChild(el);
  return el;
}
const r1 = n => Math.round(n * 10) / 10;
const r2 = n => Math.round(n * 100) / 100;
export { r1, r2 };
