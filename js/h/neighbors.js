// ===== 菜鸟家园 · 联网：别的玩家的空地、菜园、看家的狗、在线的人（用户说：要能去偷别人的菜） =====
// 数据库（Supabase）三张表：homestead_plots 谁住哪块空地；homestead_state 每个人菜园的样子；homestead_events 偷菜 / 帮忙的消息
import * as THREE from 'three';
import { createGarden, chooseSide, plotToWorld } from './garden.js';
import { buildDog } from './dog.js';

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

export function createNeighbors({ scene, plots, myIdx, onPath, onPlot, daylight, buildAvatar, onBite = () => {} }) {
  const homes = new Map();     // user_id → { uid, name, idx, garden, sign, guard, stamp }
  const others = new Map();    // 在线的人 user_id → { av, tag, to, last }
  const hold = new Map();      // 刚偷过 / 帮过：先别拿他发来的旧样子盖掉
  function makeGuard(dogName, x, z) {
    const m = buildDog(); scene.add(m.root);
    return { m, name: dogName || '看家狗', home: new THREE.Vector3(x, 0, z), pos: new THREE.Vector3(x, 0, z), mode: 'sit', bites: 0, cd: 0, face: 0, t: Math.random() * 9 };
  }
  function drop(h) { h.garden.dispose(); scene.remove(h.sign); if (h.guard) scene.remove(h.guard.m.root); homes.delete(h.uid); }
  function sync(rows) {
    const seen = new Set();
    for (const r of rows) {
      const plot = plots[r.plot_index]; if (!plot || r.plot_index === myIdx) continue;
      seen.add(r.user_id);
      let h = homes.get(r.user_id);
      if (h && (h.stamp === r.updated_at || (hold.get(r.user_id) || 0) > Date.now())) { h.name = r.name || h.name; continue; }
      const keepGuard = h && h.guard && h.idx === r.plot_index ? h.guard : null;
      if (h) { h.garden.dispose(); scene.remove(h.sign); if (h.guard && !keepGuard) scene.remove(h.guard.m.root); }
      const side = chooseSide(plot, (x, z) => onPath(x, z, 1.5) || onPlot(x, z, 1));
      const garden = createGarden({ scene, plot, side, daylight, remote: r.garden || {} });
      const [sx, sz] = plotToWorld(plot, 0, plot.size / 2 + 2.5), sign = label(`🏡 ${r.name || '邻居'}的家`); sign.position.set(sx, 3.2, sz); scene.add(sign);
      let guard = keepGuard;
      if (r.dog && r.dog.has && !guard) { const [gx, gz] = garden.gateWorld(); guard = makeGuard(r.dog.name, gx, gz); }
      if (guard && !(r.dog && r.dog.has)) { scene.remove(guard.m.root); guard = null; }
      h = { uid: r.user_id, name: r.name || '邻居', idx: r.plot_index, garden, sign, guard, stamp: r.updated_at };
      homes.set(r.user_id, h);
    }
    [...homes.values()].forEach(h => { if (!seen.has(h.uid)) drop(h); });
  }
  // 在线的人：小人 + 头上名字
  function onPos(p) {
    if (!p || !p.id) return;
    let o = others.get(p.id);
    if (!o) { const av = buildAvatar(p.skin || 'farmer'); scene.add(av.root); const tag = label(p.name || '玩家', '#2f4f8f'); tag.position.y = 2.6; av.root.add(tag); o = { av, tag, to: new THREE.Vector3(p.x, p.y || 0, p.z), face: p.face || 0, last: 0 }; av.root.position.copy(o.to); others.set(p.id, o); }
    o.to.set(p.x, p.y || 0, p.z); o.face = p.face || 0; o.last = performance.now(); o.plot = p.plot;
  }
  function update(dt, player) {
    homes.forEach(h => {
      h.garden.update(dt);
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
    homes.forEach(h => { const x = pos.x, z = pos.z; h.garden.collide(pos); if (x !== pos.x || z !== pos.z) hit = h; });
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
