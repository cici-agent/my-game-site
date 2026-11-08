// ===== 菜鸟家园 · 鸡和鸡舍 =====
// 用户定的：一开始每个人都有一个最低级的鸡舍，只能养鸡；鸡舍分不同等级
// 样子按设计画布《菜鸟家园 · 动物和它们的家》：1 级小鸡窝（住 2 只）→ 2 级红色鸡舍（5 只）→ 3 级大鸡舍（10 只，偶尔下金蛋）
// 产蛋、喂食、小鸡长大这些数字是 Claude 定的（现实里的秒），以后可以改
import * as THREE from 'three';
import { plotToWorld, worldToPlot } from './garden.js';

export const COOP = {
  1: { name: '小鸡窝', cap: 2, price: 0, RW: 2.3, RD: 2.1, hw: .75, hd: .55, hh: .8, legs: .4, wall: 0xc49766, roof: 0x8a5a2b },
  2: { name: '红色鸡舍', cap: 5, price: 80, RW: 3.1, RD: 2.7, hw: 1.3, hd: .9, hh: 1.5, legs: 0, wall: 0xd65a3c, roof: 0x7a2a18 },
  3: { name: '大鸡舍', cap: 10, price: 200, RW: 3.9, RD: 3.3, hw: 1.7, hd: 1.05, hh: 1.9, legs: 0, wall: 0xf2e6c8, roof: 0xd65a3c, vane: true, golden: .06 },
};
const HUNGER = 100 / 2400;          // 饱 → 饿：大约一天（40 分钟）
const MEAL = 50, FEED_MAX = 20;
const EGG_MIN = 20 * 60, EGG_MAX = 28 * 60;   // 每只母鸡 20~28 分钟下一个蛋（一天 1~2 个）
const GROW = 20 * 60;               // 小鸡 20 分钟长成大鸡
// 能喂鸡的东西：鸡饲料 1 份；玉米 3 份；种子 1 份
export const CHICK_FEED = { chickfeed: 1, corn: 3 };
const feedValue = k => CHICK_FEED[k] || (k && k.startsWith('seed_') ? 1 : 0);

// 鸡舍在自家空地上的位置（空地自己的坐标）：菜园的另一边、靠近空地前面
export function coopSpot(plot, side) { const h = plot.size / 2; return { x: -side * (h - 6), z: h - 6 }; }
export function inCoop(plot, side, x, z, m = 0) { const c = coopSpot(plot, side), [lx, lz] = worldToPlot(plot, x, z); return Math.abs(lx - c.x) < 4.2 + m && Math.abs(lz - c.z) < 3.6 + m; }

// ---------- 小鸡模型（圆滚滚的白母鸡；小鸡是黄色毛球） ----------
const SPH = new THREE.SphereGeometry(1, 16, 12);
function buildChicken(baby) {
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .8, ...o });
  const white = M(baby ? 0xffe066 : 0xfffaf0), red = M(0xe8352b), yellow = M(0xf7b32b), black = M(0x1d1712, { roughness: .3 }), hi = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const add = (p, mat, pos, s, r) => { const m = new THREE.Mesh(SPH, mat); m.position.set(...pos); m.scale.set(...s); if (r) m.rotation.set(...r); m.castShadow = true; p.add(m); return m; };
  add(body, white, [0, .25, 0], [.21, .19, .25]);
  if (!baby) add(body, white, [0, .38, -.2], [.08, .14, .07], [-.5, 0, 0]);   // 尾巴翘起来
  const wings = [-1, 1].map(s => { const w = new THREE.Group(); w.position.set(s * .19, .3, 0); body.add(w); add(w, M(baby ? 0xf5cf3a : 0xf1ead8), [s * .02, -.05, -.02], [.05, .11, .15]); return w; });
  const head = new THREE.Group(); head.position.set(0, .43, .15); body.add(head);
  add(head, white, [0, 0, 0], baby ? [.13, .12, .12] : [.12, .12, .12]);
  if (!baby) { [[-.035, .13], [0, .15], [.035, .13]].forEach(([x, y]) => add(head, red, [x, y, .01], [.035, .045, .03])); add(head, red, [0, -.08, .11], [.025, .04, .02]); }
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.035, .08, 8), yellow); beak.rotation.x = Math.PI / 2; beak.position.set(0, -.01, .14); head.add(beak);
  [-1, 1].forEach(s => { add(head, black, [s * .065, .03, .09], [.022, .026, .02]); add(head, hi, [s * .065 + .007, .04, .105], [.007, .008, .005]); add(head, M(0xff9aa8, { transparent: true, opacity: .55 }), [s * .085, -.025, .07], [.025, .015, .01]); });
  const legs = [-1, 1].map(s => { const l = new THREE.Group(); l.position.set(s * .06, .13, .02); body.add(l);
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .13, 6), yellow); leg.position.y = -.065; l.add(leg);
    const foot = new THREE.Mesh(new THREE.BoxGeometry(.06, .01, .07), yellow); foot.position.set(0, -.13, .02); l.add(foot); return l; });
  root.scale.setScalar(baby ? .75 : 1.25);
  return { root, body, head, wings, legs };
}

// ---------- 鸡舍模型 ----------
function wireTex() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  g.strokeStyle = 'rgba(210,215,220,.95)'; g.lineWidth = 2.5;
  for (let i = -64; i <= 128; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 64, 64); g.stroke(); g.beginPath(); g.moveTo(i, 64); g.lineTo(i + 64, 0); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
let WIRE = null;
function buildCoop(lv) {
  const K = COOP[lv], g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .85, ...o });
  const box = (w, h, d, mat, p, r) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(...p); if (r) m.rotation.set(...r); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  const { RW, RD, hw, hd, hh, legs } = K, hz = -RD + hd + .15, wood = M(0x8a5a30), wall = M(K.wall), roof = M(K.roof), white = M(0xffffff);
  // 院子地面：稍微黄一点的泥土 + 几根稻草
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(RW * 2, RD * 2), M(0xcdb47a, { roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.position.y = .012; ground.receiveShadow = true; g.add(ground);
  // 铁丝网围栏（木柱 + 顶上横木 + 铁丝网），前面中间留个口子
  WIRE ||= wireTex();
  const FH = .85, segs = [[-RW, RD, -.6, RD], [.6, RD, RW, RD], [RW, RD, RW, -RD], [RW, -RD, -RW, -RD], [-RW, -RD, -RW, RD]];
  segs.forEach(([ax, az, bx, bz]) => {
    const len = Math.hypot(bx - ax, bz - az), ang = -Math.atan2(bz - az, bx - ax), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    const wm = new THREE.MeshBasicMaterial({ map: WIRE.clone(), transparent: true, side: THREE.DoubleSide, depthWrite: false }); wm.map.repeat.set(len / .35, FH / .35); wm.map.needsUpdate = true;
    const net = new THREE.Mesh(new THREE.PlaneGeometry(len, FH - .1), wm); net.position.set(mx, FH / 2, mz); net.rotation.y = ang; g.add(net);
    box(len + .06, .06, .08, wood, [mx, FH, mz], [0, ang, 0]);
    const n = Math.max(1, Math.round(len / 1.2));
    for (let i = 0; i <= n; i++) box(.09, FH + .1, .09, wood, [ax + (bx - ax) * i / n, (FH + .1) / 2, az + (bz - az) * i / n]);
  });
  // 鸡舍房子（门朝 +z，开在院子里）
  const H = new THREE.Group(); H.position.set(0, legs, hz); g.add(H);
  const hb = (w, h, d, mat, p, r) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(...p); if (r) m.rotation.set(...r); m.castShadow = m.receiveShadow = true; H.add(m); return m; };
  hb(hw * 2, hh, hd * 2, wall, [0, hh / 2, 0]);
  if (lv === 1) for (let i = 0; i < 4; i++) hb(hw * 2 + .01, .015, hd * 2 + .01, M(0x8a5a30), [0, .15 + i * .18, 0]);   // 木板缝
  const rise = hh * .55, sl = Math.hypot(hw + .15, rise);
  [-1, 1].forEach(s => hb(sl, .07, hd * 2 + .25, roof, [s * (hw + .15) / 2, hh + rise / 2, 0], [0, 0, -s * Math.atan2(rise, hw + .15)]));
  [-1, 1].forEach(s => { const sh = new THREE.Shape(); sh.moveTo(-hw, 0); sh.lineTo(hw, 0); sh.lineTo(0, rise); sh.lineTo(-hw, 0);
    const gb = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ color: K.wall, roughness: .85, side: THREE.DoubleSide })); gb.position.set(0, hh, s * hd); H.add(gb); });
  // 门洞 + 白色交叉门框（二、三级）
  const dw = Math.min(.5, hw * .5), dh = Math.min(hh * .7, 1.1);
  hb(dw, dh, .02, M(0x2a1a0e), [0, dh / 2 + (lv === 1 ? .05 : 0), hd + .01]);
  if (lv >= 2) { [[0, dh + .03, dw + .12, .06], [-dw / 2 - .03, dh / 2, .06, dh], [dw / 2 + .03, dh / 2, .06, dh]].forEach(([x, y, w, h]) => hb(w, h, .04, white, [x, y, hd + .03]));
    const win = hb(.36, .3, .03, M(0xbfe3f7, { roughness: .2 }), [hw * .6, hh * .65, hd + .02]); hb(.42, .05, .05, white, [hw * .6, hh * .65 - .17, hd + .04]); }
  // 一级：架高的小木箱 + 四条腿 + 斜板
  if (legs) { [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([i, j]) => box(.07, legs, .07, wood, [i * (hw - .05), legs / 2, hz + j * (hd - .05)]));
    const ramp = box(.36, .03, Math.hypot(legs, .7), M(0xb8875a), [0, legs / 2, hz + hd + .32], [Math.atan2(legs, .7), 0, 0]);
    for (let i = 0; i < 3; i++) box(.34, .02, .03, wood, [0, legs * (1 - (i + 1) / 4) + .02, hz + hd + .08 + (i + 1) * .16]); }
  // 三级：风向鸡 + 下蛋的小窝
  if (K.vane) { const v = new THREE.Group(); v.position.set(0, legs + hh + rise + .05, hz); g.add(v);
    v.add(new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .5, 6), M(0x333333))).position.y = .25;
    const r = new THREE.Mesh(new THREE.ConeGeometry(.1, .3, 4), M(0xd4a017, { metalness: .6 })); r.rotation.z = Math.PI / 2; r.position.y = .5; v.add(r); }
  // 鸡蛋窝（放在门边的稻草窝里，有蛋就看得见）
  const nest = new THREE.Group(); nest.position.set(hw + .45, 0, hz + hd - .1); g.add(nest);
  const straw = new THREE.Mesh(new THREE.CylinderGeometry(.32, .36, .14, 16), M(0xd8b25a, { roughness: 1 })); straw.position.y = .07; straw.castShadow = true; nest.add(straw);
  const eggs = []; for (let i = 0; i < 8; i++) { const a = i * 2.4, r = i ? .16 : 0; const e = new THREE.Mesh(SPH, M(0xfff4e0, { roughness: .4 })); e.scale.set(.055, .07, .055); e.position.set(Math.cos(a) * r, .17 + (i > 4 ? .05 : 0), Math.sin(a) * r); nest.add(e); eggs.push(e); }
  // 食槽（院子左前方）
  const trough = new THREE.Group(); trough.position.set(-RW + .8, 0, RD - .9); g.add(trough);
  const tb = (w, h, d, p) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), M(0x8a5a30)); m.position.set(...p); m.castShadow = true; trough.add(m); };
  tb(.9, .05, .32, [0, .12, 0]); tb(.9, .14, .04, [0, .19, .15]); tb(.9, .14, .04, [0, .19, -.15]); tb(.04, .14, .32, [.45, .19, 0]); tb(.04, .14, .32, [-.45, .19, 0]);
  [-.38, .38].forEach(x => tb(.05, .12, .05, [x, .06, 0]));
  const grain = new THREE.Mesh(new THREE.BoxGeometry(.84, .08, .26), M(0xe8c35a, { roughness: 1 })); grain.position.y = .19; trough.add(grain);
  return { group: g, eggs, grain, nestPos: nest.position, troughPos: trough.position, door: { x: 0, z: hz + hd + (legs ? .8 : .3) }, houseBox: { x: 0, z: hz, hw: hw + .1, hd: hd + .1 }, fence: segs, RW, RD };
}

export function createCoop({ scene, plot, side, isNight = () => false, notify = () => {} }) {
  const KEY = 'xcn_coop_v1';
  let st = null;
  try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  // 一开始每个人都有一个 1 级小鸡窝，还送一只母鸡
  st ||= { lv: 1, feed: 4, eggs: 0, gold: 0, hens: [{ born: Date.now() - GROW * 1000, full: 80, next: Date.now() + EGG_MIN * 1000 }], t: Date.now() };
  const save = () => { st.t = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const spot = coopSpot(plot, side);
  const root = new THREE.Group(); root.position.set(plot.x, 0, plot.z); root.rotation.y = plot.rot; scene.add(root);
  const holder = new THREE.Group(); holder.position.set(spot.x, 0, spot.z); root.add(holder);
  const toWorld = (lx, lz) => plotToWorld(plot, spot.x + lx, spot.z + lz);
  const toLocal = (x, z) => { const [a, b] = worldToPlot(plot, x, z); return [a - spot.x, b - spot.z]; };
  let C = null;
  function build() { if (C) holder.remove(C.group); C = buildCoop(st.lv); holder.add(C.group); showStuff(); }
  function showStuff() {
    const n = Math.min(C.eggs.length, st.eggs + st.gold);
    C.eggs.forEach((e, i) => { e.visible = i < n; e.material = i < st.gold ? GOLD : EGG; });
    C.grain.visible = st.feed > 0; C.grain.scale.y = Math.max(.2, Math.min(1, st.feed / 8)); C.grain.position.y = .13 + .06 * C.grain.scale.y;
  }
  const EGG = new THREE.MeshStandardMaterial({ color: 0xfff4e0, roughness: .4 }), GOLD = new THREE.MeshStandardMaterial({ color: 0xffd23f, metalness: .8, roughness: .2, emissive: 0x6a4a00, emissiveIntensity: .4 });

  // 离开游戏这段时间：鸡照样会饿、会自己去食槽吃、会下蛋
  function simulate(sec) {
    let left = sec; while (left > 0) { const step = Math.min(left, 60); left -= step; const now = Date.now() - left * 1000; tick(step, now, true); }
  }
  function tick(dt, now, offline) {
    st.hens.forEach(h => {
      h.full = Math.max(0, h.full - dt * HUNGER);
      if (h.full < 50 && st.feed > 0) { st.feed--; h.full = Math.min(100, h.full + MEAL); }
      const adult = now - h.born >= GROW * 1000;
      if (adult && now >= h.next) {
        h.next = now + (EGG_MIN + Math.random() * (EGG_MAX - EGG_MIN)) * 1000;
        if (h.full >= 20 && st.eggs + st.gold < COOP[st.lv].cap * 3) {   // 饿着不下蛋；鸡蛋窝满了也不下
          if (COOP[st.lv].golden && Math.random() < COOP[st.lv].golden) st.gold++; else st.eggs++;
          if (!offline) laid = true;
        }
      }
    });
  }
  let laid = false;
  if (st.t) simulate(Math.max(0, (Date.now() - st.t) / 1000));

  // ---------- 每只鸡在院子里走来走去 ----------
  const birds = [];
  function syncBirds() {
    while (birds.length > st.hens.length) { const b = birds.pop(); holder.remove(b.m.root); }
    st.hens.forEach((h, i) => {
      const baby = Date.now() - h.born < GROW * 1000;
      if (birds[i] && birds[i].baby === baby) return;
      if (birds[i]) holder.remove(birds[i].m.root);
      const m = buildChicken(baby); holder.add(m.root);
      const b = birds[i] || { x: (Math.random() - .5) * 2, z: (Math.random() - .5) * 2, face: Math.random() * 6.28, tx: 0, tz: 0, t: 0, act: 'idle', ph: Math.random() * 10 };
      b.m = m; b.baby = baby; birds[i] = b;
    });
  }
  build(); syncBirds();

  let t0 = 0, saveT = 0, growT = 0;
  function update(dt) {
    t0 += dt; tick(dt, Date.now(), false);
    if (laid) { laid = false; showStuff(); notify('🥚 鸡下蛋了！去鸡舍收鸡蛋'); }
    if ((growT += dt) > 5) { growT = 0; syncBirds(); showStuff(); }
    const night = isNight(), { RW, RD } = C, door = C.door, hb = C.houseBox;
    birds.forEach((b, i) => {
      const r = b.m.root, h = st.hens[i];
      b.t -= dt;
      if (night) {   // 天黑了：回鸡窝里睡觉
        const d = Math.hypot(door.x - b.x, door.z - b.z);
        if (d > .3) { const a = Math.atan2(door.x - b.x, door.z - b.z); b.face = a; b.x += Math.sin(a) * Math.min(d, 1.2 * dt); b.z += Math.cos(a) * Math.min(d, 1.2 * dt); b.act = 'walk'; }
        else { r.visible = false; return; }
      } else {
        r.visible = true;
        if (b.t <= 0) { const k = Math.random(); b.act = k < .45 ? 'walk' : k < .8 ? 'peck' : k < .9 ? 'flap' : 'idle'; b.t = 1 + Math.random() * 3;
          if (b.act === 'walk') { b.tx = (Math.random() * 2 - 1) * (RW - .4); b.tz = (Math.random() * 2 - 1) * (RD - .4); if (h.full < 50 && st.feed > 0) { b.tx = C.troughPos.x + (Math.random() - .5) * .6; b.tz = C.troughPos.z - .35; } } }
        if (b.act === 'walk') { const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
          if (d > .05) { const want = Math.atan2(dx, dz); let df = want - b.face; while (df > Math.PI) df -= 6.283; while (df < -Math.PI) df += 6.283; b.face += df * Math.min(1, dt * 6); const s = Math.min(d, (b.baby ? .9 : 1.1) * dt); b.x += Math.sin(b.face) * s; b.z += Math.cos(b.face) * s; } else b.act = 'peck'; }
        // 不出院子、不钻进鸡舍房子
        b.x = Math.max(-RW + .3, Math.min(RW - .3, b.x)); b.z = Math.max(-RD + .3, Math.min(RD - .3, b.z));
        const ex = hb.hw + .15 - Math.abs(b.x - hb.x), ez = hb.hd + .15 - Math.abs(b.z - hb.z); if (ex > 0 && ez > 0) { if (ex < ez) b.x = hb.x + Math.sign(b.x - hb.x || 1) * (hb.hw + .15); else b.z = hb.z + Math.sign(b.z - hb.z || 1) * (hb.hd + .15); }
      }
      // 小鸡长大：慢慢变大
      if (b.baby && h) { const k = Math.min(1, (Date.now() - h.born) / (GROW * 1000)); r.scale.setScalar(.6 + .3 * k); }
      r.position.set(b.x, 0, b.z); r.rotation.y = b.face;
      const walk = b.act === 'walk', ph = t0 * 14 + b.ph;
      b.m.legs.forEach((l, k) => l.rotation.x = walk ? Math.sin(ph + k * Math.PI) * .6 : 0);
      b.m.body.position.y = walk ? Math.abs(Math.sin(ph)) * .02 : 0;
      b.m.body.rotation.x = walk ? .1 : 0;
      b.m.head.position.z = .15 + (walk ? Math.sin(ph) * .03 : 0);   // 走路时头一伸一缩
      b.m.head.rotation.x = b.act === 'peck' ? Math.max(0, Math.sin(t0 * 9 + b.ph)) * 1.1 : 0;
      b.m.wings.forEach((w, k) => w.rotation.z = b.act === 'flap' ? (k ? -1 : 1) * (.3 + Math.sin(t0 * 30) * .5) : 0);
    });
    if ((saveT += dt) > 5) { saveT = 0; save(); }
  }

  // ---------- 碰撞：鸡舍房子挡人；铁丝网围栏挡人，但能跳过去 ----------
  function collide(p, pr = .45) {
    let [lx, lz] = toLocal(p.x, p.z); if (Math.abs(lx) > C.RW + 2 || Math.abs(lz) > C.RD + 2) return; const ox = lx, oz = lz;
    if (p.y < .6) C.fence.forEach(([ax, az, bx, bz]) => {
      const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, rx = lx - ax, rz = lz - az, t = rx * ux + rz * uz, n = rx * -uz + rz * ux;
      if (t < -pr || t > len + pr || Math.abs(n) > pr) return; const push = (n >= 0 ? pr : -pr) - n; lx += -uz * push; lz += ux * push;
    });
    const hb = C.houseBox, ex = hb.hw + pr - Math.abs(lx - hb.x), ez = hb.hd + pr - Math.abs(lz - hb.z);
    if (ex > 0 && ez > 0 && p.y < COOP[st.lv].hh + COOP[st.lv].legs) { if (ex < ez) lx = hb.x + Math.sign(lx - hb.x || 1) * (hb.hw + pr); else lz = hb.z + Math.sign(lz - hb.z || 1) * (hb.hd + pr); }
    if (lx !== ox || lz !== oz) { const [wx, wz] = toWorld(lx, lz); p.x = wx; p.z = wz; }
  }

  // ---------- 主人能做的事 ----------
  const near = (p, pt, r) => { const [lx, lz] = toLocal(p.x, p.z); return Math.hypot(lx - pt.x, lz - pt.z) < r; };
  const api = {
    get lv() { return st.lv; }, get name() { return COOP[st.lv].name; }, get cap() { return COOP[st.lv].cap; }, get count() { return st.hens.length; },
    get eggs() { return st.eggs; }, get gold() { return st.gold; }, get feed() { return st.feed; },
    get hungry() { return st.hens.filter(h => h.full < 20).length; },
    update, collide,
    nearNest(p) { return near(p, C.nestPos, 1.4); },
    nearTrough(p) { return near(p, C.troughPos, 1.3); },
    nearCoop(p) { return near(p, C.door, 1.5) || near(p, { x: C.houseBox.x, z: C.houseBox.z + C.houseBox.hd + .4 }, 1.6); },
    nearChicken(p) { const [lx, lz] = toLocal(p.x, p.z); return birds.find(b => b.m.root.visible && Math.hypot(lx - b.x, lz - b.z) < 1); },
    collectEggs() { const n = st.eggs, g = st.gold; st.eggs = 0; st.gold = 0; save(); showStuff(); return { n, g }; },
    putBackEggs(n, g) { st.eggs += n; st.gold += g; save(); showStuff(); },
    addFeed(k) { const v = feedValue(k); if (!v) return 0; if (st.feed + v > FEED_MAX) return -1; st.feed += v; save(); showStuff(); return v; },
    canFeed: k => !!feedValue(k), FEED_MAX,
    addHen(adult) { if (st.hens.length >= COOP[st.lv].cap) return false; st.hens.push({ born: adult ? Date.now() - GROW * 1000 : Date.now(), full: 80, next: Date.now() + (EGG_MIN + Math.random() * 300) * 1000 }); save(); syncBirds(); return true; },
    upgrade() { const nx = COOP[st.lv + 1]; if (!nx) return false; st.lv++; save(); build(); syncBirds(); birds.forEach(b => { b.x = 0; b.z = 0; }); return true; },
    nextLevel() { return COOP[st.lv + 1] || null; },
    pet(b) { b.act = 'flap'; b.t = .8; },
    debug: { setLevel(l) { st.lv = l; while (st.hens.length > COOP[l].cap) st.hens.pop(); save(); build(); syncBirds(); }, layNow() { st.hens.forEach(h => { h.next = 0; h.born = Math.min(h.born, Date.now() - GROW * 1000); h.full = Math.max(h.full, 60); }); }, reset() { localStorage.removeItem(KEY); } },
    entrance: () => toWorld(0, C.RD + 1.2),
  };
  return api;
}
