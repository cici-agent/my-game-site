// ===== 菜鸟家园 · 联网：别的玩家的空地、菜园、看家的狗、在线的人（用户说：要能去偷别人的菜） =====
// 数据库（Supabase）三张表：homestead_plots 谁住哪块空地；homestead_state 每个人菜园的样子；homestead_events 偷菜 / 帮忙的消息
import * as THREE from 'three';
import { createGarden, chooseSide, plotToWorld } from './garden.js';
import { buildDog } from './dog.js';
import { createHouse } from './house.js';
import { createCoop } from './coop.js';
import { createPond } from './pond.js';

export function createNet(me) {
  const sb = typeof getSupabase === 'function' ? getSupabase() : null;
  const id = me && me.user ? me.user.id : null, ok = !!(sb && id);
  const name = me && me.profile ? (me.profile.username || '玩家') : '玩家';
  const q = async p => { try { return await p; } catch (e) { return { data: null, error: e }; } };
  return {
    ok, id, name,
    async plots() { if (!ok) return null; const r = await q(sb.from('homestead_plots').select('plot_index,user_id')); return r.error ? null : r.data || []; },
    async claim(i) { if (!ok) return true; const r = await q(sb.from('homestead_plots').insert({ plot_index: i, user_id: id })); return !r.error; },
    async release() { if (ok) await q(sb.from('homestead_plots').delete().eq('user_id', id)); },
    async publish(plot_index, garden, dog) { if (ok) await q(sb.from('homestead_state').upsert({ user_id: id, plot_index, name, garden, dog, updated_at: new Date().toISOString() })); },
    async states() { if (!ok) return []; const r = await q(sb.from('homestead_state').select('user_id,plot_index,name,garden,dog,updated_at').neq('user_id', id)); return r.data || []; },
    async send(owner_id, kind, bed = null, n = 1) { if (ok) await q(sb.from('homestead_events').insert({ owner_id, actor_id: id, kind, bed, n })); },
    async inbox() {
      if (!ok) return []; const r = await q(sb.from('homestead_events').select('id,actor_id,kind,bed,n,created_at').eq('owner_id', id).order('id'));
      const rows = r.data || []; if (rows.length) await q(sb.from('homestead_events').delete().in('id', rows.map(x => x.id))); return rows;
    },
    // 在线的人：每个人隔一会儿广播一下自己在哪
    presence(onPos) {
      if (!ok || !sb.channel) return { send() {} };
      const ch = sb.channel('homestead-live', { config: { broadcast: { self: false } } });
      ch.on('broadcast', { event: 'pos' }, m => onPos(m.payload)).subscribe();
      return { send(p) { try { ch.send({ type: 'broadcast', event: 'pos', payload: { id, name, ...p } }); } catch (e) {} } };
    },
  };
}

function label(text, color = '#2e5a2e') {
  const c = document.createElement('canvas'); c.width = 512; c.height = 112; const x = c.getContext('2d');
  x.fillStyle = 'rgba(255,250,235,.95)'; x.beginPath(); x.roundRect(4, 4, 504, 104, 40); x.fill(); x.strokeStyle = color; x.lineWidth = 8; x.stroke();
  x.fillStyle = color; x.font = 'bold 54px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 58);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false })); s.scale.set(2.6, .57, 1); s.renderOrder = 8; return s;
}

export const DOG_RANGE = 40;   // 用户说：大概 4 个菜园的距离，狗能感应到你

export function createNeighbors({ scene, plots, myIdx, onPath, onPlot, daylight, darkness = () => 0, isNight = () => false, buildAvatar, onBite = () => {} }) {
  const homes = new Map();     // user_id → 那块空地（有人住的）
  // 用户说：游戏里每一块空地一开始都有一个小木屋、一块最低级的菜园、一个鸡舍，还有一个最低级的小池塘，别的都没有
  const EMPTY = () => ({ level: 1, beds: [], t: Date.now() });
  const lots = plots.map((plot, idx) => {
    if (idx === myIdx) return null;
    const side = chooseSide(plot, (x, z) => onPath(x, z, 1.5) || onPlot(x, z, 1));
    const g = new THREE.Group(); scene.add(g);   // 这块空地的东西都放这里：离得远就整个藏起来（省电）
    const e = { idx, plot, side, g, uid: null, name: '', sign: null, guard: null, stamp: null };
    e.house = createHouse({ scene: g, plot, side, display: true, darkness });
    e.coop = createCoop({ scene: g, plot, side, display: true, isNight });
    e.pond = createPond({ scene: g, plot, side, display: true, isNight });   // 用户说：每个一开始的家都有一个小池塘
    e.garden = createGarden({ scene: g, plot, side, daylight, remote: EMPTY() });
    return e;
  });
  const others = new Map();    // 在线的人 user_id → { av, tag, to, last }
  const hold = new Map();      // 刚偷过 / 帮过：先别拿他发来的旧样子盖掉
  function makeGuard(dogName, x, z) {
    const m = buildDog(); scene.add(m.root);
    return { m, name: dogName || '看家狗', home: new THREE.Vector3(x, 0, z), pos: new THREE.Vector3(x, 0, z), mode: 'sit', bites: 0, cd: 0, face: 0, t: Math.random() * 9 };
  }
  function vacate(e) {   // 主人走了：变回没人住的样子
    e.garden.dispose(); e.garden = createGarden({ scene: e.g, plot: e.plot, side: e.side, daylight, remote: EMPTY() });
    if (e.sign) scene.remove(e.sign); if (e.guard) scene.remove(e.guard.m.root); e.sign = e.guard = null;
    homes.delete(e.uid); e.uid = null; e.stamp = null;
  }
  function sync(rows) {
    const seen = new Set();
    for (const r of rows) {
      const e = lots[r.plot_index]; if (!e) continue;
      seen.add(r.user_id);
      if (e.uid && e.uid !== r.user_id) vacate(e);
      if (e.uid === r.user_id && (e.stamp === r.updated_at || (hold.get(r.user_id) || 0) > Date.now())) { e.name = r.name || e.name; continue; }
      e.garden.dispose(); e.garden = createGarden({ scene: e.g, plot: e.plot, side: e.side, daylight, remote: r.garden || EMPTY() });
      e.name = r.name || '邻居'; e.uid = r.user_id; e.stamp = r.updated_at;
      if (!e.sign) { const [sx, sz] = plotToWorld(e.plot, 0, e.plot.size / 2 + 2.5); e.sign = label(`🏡 ${e.name}的家`); e.sign.position.set(sx, 3.2, sz); scene.add(e.sign); }
      if (r.dog && r.dog.has && !e.guard) { const [gx, gz] = e.garden.gateWorld(); e.guard = makeGuard(r.dog.name, gx, gz); }
      if (e.guard && !(r.dog && r.dog.has)) { scene.remove(e.guard.m.root); e.guard = null; }
      homes.set(r.user_id, e);
    }
    [...homes.values()].forEach(e => { if (!seen.has(e.uid)) vacate(e); });
  }
  // 在线的人：小人 + 头上名字
  function onPos(p) {
    if (!p || !p.id) return;
    let o = others.get(p.id);
    if (!o) { const av = buildAvatar(p.skin || 'farmer'); scene.add(av.root); const tag = label(p.name || '玩家', '#2f4f8f'); tag.position.y = 2.6; av.root.add(tag); o = { av, tag, to: new THREE.Vector3(p.x, p.y || 0, p.z), face: p.face || 0, last: 0 }; av.root.position.copy(o.to); others.set(p.id, o); }
    o.to.set(p.x, p.y || 0, p.z); o.face = p.face || 0; o.last = performance.now(); o.plot = p.plot;
  }
  function update(dt, player) {
    lots.forEach(e => {
      if (!e) return; const d = Math.hypot(player.pos.x - e.plot.x, player.pos.z - e.plot.z);
      e.g.visible = d < 190; if (d > e.plot.size + 60) return;
      e.garden.update(dt); e.coop.update(dt); if (e.pond) e.pond.update(dt); try { e.house.update(dt, player.pos, false); } catch (err) {}
    });
    homes.forEach(h => {
      const g = h.guard; if (!g) return;
      g.t += dt; g.cd -= dt;
      const dp = Math.hypot(player.pos.x - g.pos.x, player.pos.z - g.pos.z), farFromHome = Math.hypot(player.pos.x - g.home.x, player.pos.z - g.home.z) > DOG_RANGE;
      let tx = null, tz = null, sp = 0;
      if (g.mode === 'chase') {
        if (farFromHome) { g.mode = 'back'; g.bites = 0; }
        else { tx = player.pos.x; tz = player.pos.z; sp = 8.5; if (dp < 1.1 && g.cd <= 0) { g.cd = 1.4; g.bites++; onBite(g, h); } }
      }
      if (g.mode === 'back') { tx = g.home.x; tz = g.home.z; sp = 5; if (Math.hypot(g.pos.x - g.home.x, g.pos.z - g.home.z) < .5) g.mode = 'sit'; }
      const r = g.m.root;
      if (tx !== null && sp) { const dx = tx - g.pos.x, dz = tz - g.pos.z, d = Math.hypot(dx, dz); if (d > .9 || g.mode === 'back') { const s = Math.min(d, sp * dt); g.pos.x += dx / (d || 1) * s; g.pos.z += dz / (d || 1) * s; } g.face = Math.atan2(dx, dz);
        if (g.m.legs) g.m.legs.forEach((l, i) => { l.rotation.x = Math.sin(g.t * 18 + i * Math.PI / 2) * .7; }); r.position.y = Math.abs(Math.sin(g.t * 9)) * .08; }
      else { if (dp < 12) g.face = Math.atan2(player.pos.x - g.pos.x, player.pos.z - g.pos.z); if (g.m.legs) g.m.legs.forEach(l => { l.rotation.x = 0; }); r.position.y = 0; if (g.m.tail) g.m.tail.rotation.z = Math.sin(g.t * 6) * .4; }
      r.position.x = g.pos.x; r.position.z = g.pos.z; r.rotation.y = g.face;
    });
    const now = performance.now();
    others.forEach((o, id) => {
      if (now - o.last > 10000) { scene.remove(o.av.root); others.delete(id); return; }
      const r = o.av.root, d = r.position.distanceTo(o.to);
      r.position.lerp(o.to, Math.min(1, dt * 8)); r.rotation.y = o.face;
      try { o.av.animate(dt, Math.min(1, d * 3), false, false); } catch (e) {}
    });
  }
  // 挡路：别人家菜园的栅栏（能跳过去；被撞开了就随便走）。返回挡住你的那家
  function collide(pos) {
    let hit = null;
    lots.forEach(e => { if (!e || Math.abs(pos.x - e.plot.x) > e.plot.size + 20 || Math.abs(pos.z - e.plot.z) > e.plot.size + 20) return;
      const x = pos.x, z = pos.z; e.garden.collide(pos); if ((x !== pos.x || z !== pos.z) && e.uid) hit = e;
      e.house.collide(pos, .45); e.coop.collide(pos); if (e.pond) e.pond.collide(pos); });
    return hit;
  }
  function nearBed(p) { for (const h of homes.values()) { const bd = h.garden.nearest(p.x, p.z); if (bd) return { h, bd, i: h.garden.beds.indexOf(bd) }; } return null; }
  return {
    sync, onPos, update, collide, nearBed, homes,
    hold(uid, sec = 180) { hold.set(uid, Date.now() + sec * 1000); },
    nameOf: uid => (homes.get(uid) || {}).name,
    online: uid => { const o = others.get(uid); return o && performance.now() - o.last < 6000 ? o.av.root.position : null; },
    get count() { return homes.size; },
  };
}
