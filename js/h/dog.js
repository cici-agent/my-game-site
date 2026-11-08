// ===== 菜鸟家园 · 宠物狗 =====
// 用户定的：狗要非常可爱、呆萌；能跟它玩；商店能买飞盘、狗盆、狗粮；狗盆放在地上能加狗粮，狗粮会被吃完；
// 饿了自己去狗盆吃，不饿就自己玩；忠诚度高的时候很喜欢你，还会帮你守着菜园，不让别人偷菜
// 数字是 Claude 定的（现实里的秒），以后可以改
import * as THREE from 'three';
import { buildKennel, KENNEL } from './kennel.js';

const KEY = 'xcn_dog_v1';
const LEASH = 3.5;   // 狗链长度（米）：拴上以后只能在这一圈里走
const HUNGER_RATE = .012;   // 饱的程度每秒掉多少（100 → 0 大约 2 小时多）
const MEAL = 40, BOWL_MAX = 5, HUNGRY = 40;
export const DOG_NAMES = ['豆豆', '团子', '旺财', '布丁', '小黄'];

// ---------- 小狗模型：大头、大眼睛、耷拉耳朵、短腿、摇尾巴、吐舌头 ----------
function buildDog() {
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .75, ...o });
  const fur = M(0xf1c27d), cream = M(0xfff4e0), brown = M(0xb8743a), black = M(0x1d1712, { roughness: .3 }), white = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const sph = new THREE.SphereGeometry(1, 20, 16);
  const add = (parent, geo, mat, p, s, r) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); if (s) m.scale.set(...s); if (r) m.rotation.set(...r); m.castShadow = true; parent.add(m); return m; };
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  // 身子：圆滚滚
  add(body, sph, fur, [0, .42, -.05], [.34, .3, .44]);
  add(body, sph, cream, [0, .36, .08], [.24, .22, .3]);
  // 四条短短的腿（转轴在上面，走路时前后摆）
  const legs = [];
  [[-.17, .2], [.17, .2], [-.17, -.26], [.17, -.26]].forEach(([x, z]) => {
    const piv = new THREE.Group(); piv.position.set(x, .3, z); body.add(piv);
    add(piv, new THREE.CylinderGeometry(.075, .085, .26, 10), fur, [0, -.13, 0]);
    add(piv, sph, cream, [0, -.27, .03], [.09, .06, .11]);
    legs.push(piv);
  });
  // 尾巴：小小的一团，往上翘
  const tail = new THREE.Group(); tail.position.set(0, .55, -.45); body.add(tail);
  add(tail, sph, fur, [0, .1, -.04], [.07, .16, .07], [-.5, 0, 0]);
  add(tail, sph, cream, [0, .23, -.1], [.065, .07, .065]);
  // 大脑袋
  const head = new THREE.Group(); head.position.set(0, .8, .3); body.add(head);
  add(head, sph, fur, [0, 0, 0], [.36, .33, .33]);
  add(head, sph, cream, [0, -.09, .22], [.19, .14, .15]);   // 嘴巴
  add(head, sph, black, [0, -.02, .36], [.06, .045, .045]);   // 鼻子
  add(head, sph, white, [-.02, -.005, .4], [.015, .012, .01]);
  // 大大的眼睛，有亮光（呆萌）
  const eyes = [];
  [-1, 1].forEach(s => {
    const eg = new THREE.Group(); eg.position.set(s * .14, .07, .27); head.add(eg); eyes.push(eg);   // 睡觉时把眼睛压扁 = 闭眼
    add(eg, sph, black, [0, 0, 0], [.07, .08, .05]);
    add(eg, sph, white, [.025, .03, .04], [.022, .025, .015]);
    add(eg, sph, white, [-.02, -.02, .045], [.01, .011, .008]);
    add(head, sph, M(0xff9aa8, { transparent: true, opacity: .6 }), [s * .22, -.06, .22], [.06, .035, .02]);   // 红脸蛋
    add(head, sph, M(0xffffff, { roughness: 1 }), [s * .13, .22, .25], [.035, .02, .02]);   // 小眉毛白点
  });
  // 嘴巴线 + 舌头
  const mouth = add(head, new THREE.TorusGeometry(.045, .01, 6, 12, Math.PI), black, [0, -.12, .35], null, [0, 0, Math.PI]);
  const tongue = add(head, sph, M(0xff7a8a), [.02, -.17, .33], [.045, .06, .025]);
  // 耷拉的耳朵（转轴在上面，跑起来会甩）
  const ears = [];
  [-1, 1].forEach(s => {
    const piv = new THREE.Group(); piv.position.set(s * .27, .18, 0); piv.rotation.z = s * .35; head.add(piv);
    add(piv, sph, brown, [s * .03, -.15, 0], [.09, .18, .06]);
    ears.push(piv);
  });
  // 红项圈 + 小铃铛
  add(body, new THREE.TorusGeometry(.2, .035, 8, 20), M(0xe8352b), [0, .62, .2], null, [Math.PI / 2 - .35, 0, 0]);
  const bell = add(body, sph, M(0xffd23f, { metalness: .6, roughness: .3 }), [0, .52, .38], [.045, .045, .045]);
  // 地上的影子
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.42, 20), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .2, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .02; shadow.scale.set(1, 1.3, 1); root.add(shadow);
  root.scale.setScalar(1.15);
  return { root, body, head, legs, tail, ears, tongue, mouth, bell, shadow, eyes };
}

// 头上冒的小表情（❤️、💤、😢、🍖）
function emoteSprite() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); sp.scale.set(.7, .7, 1); sp.visible = false; sp.renderOrder = 10;
  sp.set = e => { g.clearRect(0, 0, 128, 128); g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.arc(64, 58, 50, 0, Math.PI * 2); g.fill(); g.beginPath(); g.moveTo(52, 100); g.lineTo(64, 124); g.lineTo(76, 100); g.fill();
    g.font = '60px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 64, 60); t.needsUpdate = true; };
  return sp;
}

export function createDog({ scene, isNight = () => false, groundAt = () => 0, collide = () => {}, guardSpot = () => null, homeCenter = () => null, notify = () => {}, onFrisbeeBack = () => {} }) {
  let st = null;
  try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  st ||= { has: false };
  const save = () => { st.t = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  // 离线这段时间：肚子饿了会自己去吃狗盆里的
  if (st.has && st.t) {
    let away = Math.max(0, (Date.now() - st.t) / 1000);
    while (away > 0) { const step = Math.min(away, 600); st.full = Math.max(0, st.full - step * HUNGER_RATE); away -= step;
      if (st.full < HUNGRY && st.bowl && st.bowl.food > 0) { st.bowl.food--; st.full = Math.min(100, st.full + MEAL); }
      if (st.full <= 0) st.loyal = Math.max(0, st.loyal - step / 600); }
  }

  // ---------- 模型 ----------
  const D = buildDog(), emote = emoteSprite(); D.root.add(emote); emote.position.y = 1.55; D.root.visible = false; scene.add(D.root);
  const pos = D.root.position; let face = 0;
  // 狗盆
  const bowlG = new THREE.Group(); bowlG.visible = false; scene.add(bowlG);
  { const bm = new THREE.MeshStandardMaterial({ color: 0x4f9de8, roughness: .5 });
    const b = new THREE.Mesh(new THREE.CylinderGeometry(.32, .24, .16, 20, 1, true), bm); b.position.y = .08; b.castShadow = true; bowlG.add(b);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(.24, 20), bm); bottom.rotation.x = -Math.PI / 2; bottom.position.y = .01; bowlG.add(bottom);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(.32, .025, 8, 24), new THREE.MeshStandardMaterial({ color: 0xffffff })); rim.rotation.x = Math.PI / 2; rim.position.y = .16; bowlG.add(rim);
    // 爪印
    const paw = new THREE.Mesh(new THREE.CircleGeometry(.05, 10), new THREE.MeshBasicMaterial({ color: 0xffffff })); paw.position.set(0, .08, .29); bowlG.add(paw); }
  const kib = []; { const km = new THREE.MeshStandardMaterial({ color: 0xa0612b, roughness: .9 }), g = new THREE.SphereGeometry(.05, 8, 6);
    for (let i = 0; i < 30; i++) { const k = new THREE.Mesh(g, km); const a = Math.random() * 6.28, r = Math.random() * .2; k.position.set(Math.cos(a) * r, .05 + (i / 30) * .1, Math.sin(a) * r); bowlG.add(k); kib.push(k); } }
  function showBowl() {
    bowlG.visible = !!st.bowl; if (!st.bowl) return;
    bowlG.position.set(st.bowl.x, groundAt({ x: st.bowl.x, z: st.bowl.z, y: 0 }), st.bowl.z);
    kib.forEach((k, i) => k.visible = i < Math.ceil(st.bowl.food / BOWL_MAX * kib.length));
  }
  // 狗屋（用户说：给狗一个住的地方）
  let kennelObj = null;
  const kToWorld = (lx, lz) => { const k = st.kennel, c = Math.cos(k.face), s = Math.sin(k.face); return [k.x + lx * c + lz * s, k.z - lx * s + lz * c]; };
  function showKennel() {
    if (kennelObj) { scene.remove(kennelObj.group); kennelObj = null; }
    if (!st.kennel) return;
    kennelObj = buildKennel(st.kennel.lv, st.name);
    kennelObj.group.position.set(st.kennel.x, groundAt({ x: st.kennel.x, z: st.kennel.z, y: 0 }), st.kennel.z); kennelObj.group.rotation.y = st.kennel.face;
    scene.add(kennelObj.group);
  }
  // 狗链：地上一根小木桩（拴在狗屋时就拴在狗屋门口）+ 一根垂下来的链子
  const stake = new THREE.Group(); stake.visible = false; scene.add(stake);
  { const wm = new THREE.MeshStandardMaterial({ color: 0x8a5a2b, roughness: .9 }); const p = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, .5, 8), wm); p.position.y = .25; p.castShadow = true; stake.add(p);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.07, .015, 6, 12), new THREE.MeshStandardMaterial({ color: 0x9aa3ad, metalness: .7, roughness: .3 })); ring.position.y = .42; stake.add(ring); }
  const CHN = 16, chainGeo = new THREE.BufferGeometry().setFromPoints(Array.from({ length: CHN }, () => new THREE.Vector3()));
  const chainLine = new THREE.Line(chainGeo, new THREE.LineBasicMaterial({ color: 0x7d8691 })); chainLine.frustumCulled = false; chainLine.visible = false; scene.add(chainLine);
  const collar = new THREE.Vector3();
  function drawChain() {
    chainLine.visible = !!st.chain && D.root.visible; stake.visible = !!st.chain && !st.chain.k;
    if (!chainLine.visible) return;
    if (!st.chain.k) stake.position.set(st.chain.x, groundAt({ x: st.chain.x, z: st.chain.z, y: 0 }), st.chain.z);
    D.body.updateWorldMatrix(true, false); collar.set(0, .6, .25).applyMatrix4(D.body.matrixWorld);
    const ax = st.chain.x, ay = (st.chain.k ? .35 : .42) + groundAt({ x: ax, z: st.chain.z, y: 0 }), az = st.chain.z, slack = Math.max(.05, (LEASH - dist2(pos, st.chain)) * .25);
    const pa = chainGeo.attributes.position;
    for (let i = 0; i < CHN; i++) { const t = i / (CHN - 1); pa.setXYZ(i, ax + (collar.x - ax) * t, ay + (collar.y - ay) * t - Math.sin(t * Math.PI) * slack, az + (collar.z - az) * t); }
    pa.needsUpdate = true;
  }
  // 飞盘
  const fris = new THREE.Mesh(new THREE.CylinderGeometry(.22, .2, .04, 20), new THREE.MeshStandardMaterial({ color: 0xff5a4a, roughness: .5 }));
  fris.add(new THREE.Mesh(new THREE.TorusGeometry(.17, .015, 6, 20), new THREE.MeshStandardMaterial({ color: 0xffffff })).rotateX(Math.PI / 2));
  fris.castShadow = true; fris.visible = false; scene.add(fris);
  const fv = new THREE.Vector3(); let frisState = null;   // null / 'fly' / 'ground' / 'mouth'

  // ---------- 行为 ----------
  const circ = new THREE.Vector3(); let entering = false, napT = 0, zzT = 0, fetchT = 0, circA = 0, air = false, vy = 0, jumpCd = 0, mode = 'idle', timer = 0, target = new THREE.Vector3(), emoteT = 0, t0 = 0, petCd = 0, moving = 0, whineT = 0, tilt = 0;
  const say = (e, dur = 2) => { emote.set(e); emote.visible = true; emoteT = dur; };
  function spawnNear(p) { pos.set(p.x + 1.5, 0, p.z + 1.5); }
  function adopt(name) { if (st.has) return false; Object.assign(st, { has: true, name: name || DOG_NAMES[Math.floor(Math.random() * DOG_NAMES.length)], full: 80, loyal: 10, bowl: st.bowl || null }); save(); D.root.visible = true; placed = false; say('❤️', 3); return true; }
  let placed = false;
  const dist2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
  function pick(ppos) {
    // 饿了：有狗粮就去狗盆，没有就跟着主人哼哼
    if (st.full < HUNGRY) {
      if (st.bowl && st.bowl.food > 0 && !(st.chain && dist2(st.bowl, st.chain) > LEASH + .6)) { mode = 'toBowl'; target.set(st.bowl.x, 0, st.bowl.z); return; }
      mode = 'beg'; timer = 4; return;
    }
    // 晚上：有狗屋就回狗屋睡觉；没有就在主人旁边趴着睡
    if (isNight()) {
      if (st.kennel) { mode = 'toBed'; napT = 0; entering = false; return; }
      if (dist2(pos, ppos) < 6 && Math.random() < .6) { mode = 'sleep'; napT = 0; timer = 30; return; }
    }
    // 忠诚度高、主人出门了：去菜园门口看着
    const home = homeCenter(), g = guardSpot();
    if (!st.chain && st.loyal >= 70 && home && g && dist2(ppos, home) > 38) { mode = 'guard'; target.set(g.x, 0, g.z); return; }
    // 主人走远了：跟上去（越忠诚跟得越紧）
    const far = st.loyal >= 70 ? 4 : st.loyal >= 40 ? 9 : 16;
    if (!st.chain && dist2(pos, ppos) > far) { mode = 'follow'; timer = 3; return; }
    const ctr = st.chain || ppos;   // 拴着的话，只在狗链那一圈里玩
    // 不饿就自己玩
    const r = Math.random();
    if (st.kennel && r < .06) { mode = 'toBed'; entering = false; napT = 15 + Math.random() * 20; return; }   // 白天偶尔回狗屋打个盹
    if (st.kennel && st.kennel.lv >= 3 && kennelObj && kennelObj.yard && r < .25) {   // 有狗狗乐园：去院子里玩
      const y = kennelObj.yard, [wx, wz] = kToWorld(y.x + (Math.random() * 2 - 1) * y.w, y.z + (Math.random() * 2 - 1) * y.d);
      mode = 'wander'; target.set(wx, 0, wz); timer = 6; if (Math.random() < .5) say('⚽', 1.5); return;
    }
    if (r < .35) { mode = 'wander'; const a = Math.random() * 6.28, d = st.chain ? Math.random() * LEASH : 2 + Math.random() * 5; target.set(ctr.x + Math.cos(a) * d, 0, ctr.z + Math.sin(a) * d); timer = 6; }
    else if (r < .5) { mode = 'spin'; timer = 1.6; }
    else if (r < .62) { mode = 'circle'; timer = 2.6; circ.set(pos.x - Math.cos(face) * .9, 0, pos.z + Math.sin(face) * .9); circA = Math.atan2(pos.z - circ.z, pos.x - circ.x); say('😆', 1.5); }   // 开心：原地绕个小圈（用户说不要横着打滚）
    else if (r < .78) { mode = 'sit'; timer = 2 + Math.random() * 3; }
    else if (r < .9) { mode = 'sniff'; timer = 2.5; }
    else { mode = 'zoom'; const a = Math.random() * 6.28, d = st.chain ? LEASH : 8; target.set(ctr.x + Math.cos(a) * d, 0, ctr.z + Math.sin(a) * d); timer = 3; }   // 突然撒欢跑一圈
    if (st.loyal >= 70 && Math.random() < .3) say('❤️', 1.5);
  }
  function runTo(tx, tz, speed, dt) {
    const dx = tx - pos.x, dz = tz - pos.z, d = Math.hypot(dx, dz);
    if (d < .05) return d;
    const want = Math.atan2(dx, dz); let df = want - face; while (df > Math.PI) df -= Math.PI * 2; while (df < -Math.PI) df += Math.PI * 2;
    face += df * Math.min(1, dt * 8);
    const s = Math.min(d, speed * dt); pos.x += Math.sin(face) * s; pos.z += Math.cos(face) * s; moving = speed;
    return d;
  }

  function update(dt, ppos, pface) {
    if (!st.has) { D.root.visible = false; return; }
    if (!placed) { spawnNear(ppos); placed = true; D.root.visible = true; showBowl(); }
    t0 += dt; petCd = Math.max(0, petCd - dt); moving = 0;
    st.full = Math.max(0, st.full - dt * HUNGER_RATE);
    if (st.full <= 0) st.loyal = Math.max(0, st.loyal - dt / 600);   // 一直饿着，就没那么喜欢你了
    // 飞盘在天上飞
    if (frisState === 'fly') { fv.y -= 9 * dt; fris.position.addScaledVector(fv, dt); fris.rotation.y += dt * 14;
      const gy = groundAt(fris.position) + .03; if (fris.position.y <= gy) { fris.position.y = gy; frisState = 'ground'; } }
    const dP = dist2(pos, ppos);
    // 离主人太远（比如卡在栅栏后面）就直接跑回身边
    if (dP > 60 && mode !== 'guard' && !st.chain) spawnNear(ppos);
    timer -= dt;
    // 正在玩的时候饿了：马上不玩了，去找吃的
    if (st.full < HUNGRY && ['sleep', 'toBed', 'wander', 'zoom', 'spin', 'circle', 'sit', 'sniff', 'follow', 'guard'].includes(mode)) mode = 'idle';
    switch (mode) {
      case 'fetch': {
        if (frisState === 'mouth') { mode = 'return'; break; }
        fetchT += dt; if (fetchT > 12 && frisState === 'ground') { pos.set(fris.position.x - .5, 0, fris.position.z - .5); fetchT = 0; }   // 够不着（被墙挡住）：直接跑过去
        const d = runTo(fris.position.x, fris.position.z, 9, dt);
        if (d < .7 && fris.position.y < 1.6) { frisState = 'mouth'; mode = 'return'; say('🥏', 1.2); }
        break; }
      case 'return': {
        const d = runTo(ppos.x, ppos.z, 8, dt); fetchT += dt;
        if (d < 1.4 || fetchT > 24) { frisState = null; fris.visible = false; onFrisbeeBack(); st.loyal = Math.min(100, st.loyal + 3); say('❤️', 2); mode = 'sit'; timer = 1.5; save(); }
        break; }
      case 'toBowl': {
        if (!st.bowl || st.bowl.food <= 0) { mode = 'idle'; break; }
        const d = runTo(st.bowl.x, st.bowl.z, 6.5, dt);
        if (d < .75) { mode = 'eat'; timer = 3.5; }
        break; }
      case 'eat':
        if (st.bowl) { const want = Math.atan2(st.bowl.x - pos.x, st.bowl.z - pos.z); face += (want - face) * Math.min(1, dt * 6); }
        if (timer <= 0) { if (st.bowl && st.bowl.food > 0) { st.bowl.food--; st.full = Math.min(100, st.full + MEAL); st.loyal = Math.min(100, st.loyal + 1); showBowl(); save(); say('😋', 1.8); } mode = 'idle'; }
        break;
      case 'beg': {
        const d = dP > 2 ? runTo(ppos.x, ppos.z, 6, dt) : 0;
        whineT -= dt; if (whineT <= 0) { say('😢', 1.6); whineT = 5; if (dP < 10) notify(`🐶 ${st.name}饿了：${st.bowl ? '狗盆里没有狗粮了' : '还没有狗盆'}`); }
        if (timer <= 0) mode = 'idle';
        break; }
      case 'guard': {
        const d = runTo(target.x, target.z, 6.5, dt);
        if (d < .3) { const h = homeCenter(); if (h) { const want = Math.atan2(pos.x - h.x, pos.z - h.z); face += (want - face) * Math.min(1, dt * 3); } }
        if (dist2(ppos, homeCenter() || ppos) < 30 || st.full < HUNGRY) mode = 'idle';
        break; }
      case 'follow': { const d = runTo(ppos.x, ppos.z, dP > 10 ? 9 : 7, dt); if (d < 2.5 || timer <= 0) mode = 'idle'; break; }
      case 'wander': case 'zoom': { const d = runTo(target.x, target.z, mode === 'zoom' ? 10 : 3.2, dt); if (d < .3 || timer <= 0) mode = 'idle'; break; }
      case 'spin': face += dt * 10; moving = 3; if (timer <= 0) mode = 'idle'; break;
      case 'circle': { circA += dt * 4.2; const nx = circ.x + Math.cos(circA) * .9, nz = circ.z + Math.sin(circA) * .9;
        face = Math.atan2(nx - pos.x, nz - pos.z); pos.x = nx; pos.z = nz; moving = 5; if (timer <= 0) mode = 'idle'; break; }
      case 'sit': case 'sniff': if (timer <= 0) mode = 'idle'; break;
      case 'toBed': {
        if (!st.kennel) { mode = 'idle'; break; }
        const [dx, dz] = kToWorld(0, KENNEL[st.kennel.lv].D + .9), [bx, bz] = kToWorld(kennelObj.bed.x, kennelObj.bed.z);
        if (!entering) { if (runTo(dx, dz, 6, dt) > .4) break; entering = true; }   // 先跑到狗屋门口，再钻进去
        if (runTo(bx, bz, 2.5, dt) < .15) { entering = false; mode = 'sleep'; timer = napT || 999; face = st.kennel.face; }   // 再钻进去
        break; }
      case 'sleep': {
        zzT -= dt; if (zzT <= 0) { say('💤', 2.2); zzT = 4; }
        if (st.kennel && !napT) { const [bx, bz] = kToWorld(kennelObj.bed.x, kennelObj.bed.z); pos.x = bx; pos.z = bz; face = st.kennel.face; }
        const wake = napT ? timer <= 0 : st.kennel ? !isNight() : (dP > 8 || timer <= 0 || !isNight());
        if (wake) { mode = 'idle'; say('🥱', 1.5); }
        if (st.kennel && napT) { const [bx, bz] = kToWorld(kennelObj.bed.x, kennelObj.bed.z); pos.x = bx; pos.z = bz; face = st.kennel.face; }
        break; }
      default: if (timer <= 0 || mode === 'idle') { pick(ppos); if (mode === 'idle') timer = .5; }
    }
    // 墙、栅栏挡着
    // 栅栏、墙挡着；被栅栏挡住时跳过去（用户说：狗不能穿过栅栏，但能跳过去）
    jumpCd = Math.max(0, jumpCd - dt);
    const bx = pos.x, bz = pos.z;
    if (!(st.kennel && (mode === 'sleep' || mode === 'toBed') && kennelObj && dist2(pos, st.kennel) < 2)) collide(pos);
    // 拴着：不能跑出狗链那一圈
    if (st.chain) { const cd = dist2(pos, st.chain); if (cd > LEASH) { pos.x = st.chain.x + (pos.x - st.chain.x) * LEASH / cd; pos.z = st.chain.z + (pos.z - st.chain.z) * LEASH / cd; } }
    const gy = groundAt(pos), pushed = Math.hypot(pos.x - bx, pos.z - bz);
    if (air) { vy -= 22 * dt; pos.y += vy * dt; if (pos.y <= gy) { pos.y = gy; air = false; vy = 0; } }
    else { pos.y = gy; if (pushed > .02 && moving > 0 && jumpCd <= 0) { air = true; vy = 6.8; jumpCd = 1.2; } }
    D.root.rotation.y = face;
    // ---------- 动画：摇尾巴、甩耳朵、迈腿、歪头、吐舌头 ----------
    const happy = st.full >= HUNGRY ? .5 + st.loyal / 100 : .15;
    D.tail.rotation.z = Math.sin(t0 * (8 + happy * 14)) * (.3 + happy * .5);
    const run = Math.min(1, moving / 6), step = t0 * (moving > 6 ? 18 : 12);
    D.legs.forEach((l, i) => l.rotation.x = air ? (i < 2 ? -.9 : .9) : moving ? Math.sin(step + (i === 0 || i === 3 ? 0 : Math.PI)) * (.5 + run * .3) : 0);   // 跳起来时前腿往前伸、后腿往后蹬
    D.ears.forEach((e, i) => e.rotation.x = Math.sin(step + i) * .25 * run - run * .3);
    D.body.position.y = moving ? Math.abs(Math.sin(step)) * .06 : 0;
    tilt += ((mode === 'sit' || mode === 'guard' ? Math.sin(t0 * 1.3) * .3 : 0) - tilt) * Math.min(1, dt * 3);   // 坐着时歪头看你（呆萌）
    D.head.rotation.z = tilt;
    D.head.rotation.x = mode === 'eat' ? .5 + Math.sin(t0 * 12) * .12 : mode === 'sniff' ? .45 + Math.sin(t0 * 20) * .05 : mode === 'beg' ? -.15 : 0;
    D.tongue.visible = moving > 4 || mode === 'sit' || mode === 'circle';
    D.body.rotation.x = mode === 'sit' || mode === 'guard' ? -.35 : mode === 'eat' || mode === 'sniff' ? .12 : 0;
    D.body.rotation.z = 0; D.body.position.x = 0;
    // 睡觉：趴下、前腿往前伸、闭眼、尾巴不摇
    const zz = mode === 'sleep';
    D.eyes.forEach(e => e.scale.y += ((zz ? .12 : 1) - e.scale.y) * Math.min(1, dt * 6));
    if (zz) { D.body.position.y = -.15; D.body.rotation.x = 0; D.legs.forEach((l, i) => l.rotation.x = i < 2 ? -1.35 : 1.35); D.head.rotation.x = .3; D.head.rotation.z = .25; D.tail.rotation.z *= .1; D.tongue.visible = false; }
    D.shadow.position.y = .02 - D.body.position.y;
    if (frisState === 'mouth') { const hp = new THREE.Vector3(0, .72, .72).applyEuler(D.root.rotation).multiplyScalar(1.15).add(pos); fris.position.copy(hp); fris.rotation.set(Math.PI / 2, face, 0); }
    drawChain();
    if (emoteT > 0) { emoteT -= dt; emote.position.y = 1.55 + Math.sin(t0 * 4) * .05; if (emoteT <= 0) emote.visible = false; }
    if (Math.floor(t0) % 5 === 0 && Math.floor(t0 - dt) % 5 !== 0) save();
  }

  // ---------- 主人跟它互动 ----------
  const api = {
    get has() { return st.has; }, get name() { return st.name; }, get full() { return st.full; }, get loyal() { return st.loyal; }, get mode() { return mode; }, get pos() { return pos; },
    get bowl() { return st.bowl; }, get frisbeeOut() { return !!frisState; },
    adopt, update, rename(n) { st.name = n; save(); say('❤️', 2); showKennel(); },
    get kennel() { return st.kennel; }, KENNEL,
    nearKennel(p) { if (!st.kennel) return false; const [fx, fz] = kToWorld(0, KENNEL[st.kennel.lv].D + .6); return Math.hypot(p.x - fx, p.z - fz) < 1.6 || dist2(p, st.kennel) < 1.9; },
    placeKennel(x, z, f, lv) { st.kennel = { x, z, face: f, lv: lv || (st.kennel ? st.kennel.lv : 1) }; if (st.chain && st.chain.k) { const [cx, cz] = kToWorld(0, KENNEL[st.kennel.lv].D + .35); st.chain = { x: cx, z: cz, k: true }; } save(); showKennel(); if (mode === 'sleep' || mode === 'toBed') mode = 'idle'; },
    takeKennel() { if (!st.kennel) return 0; if (st.chain && st.chain.k) st.chain = null; const lv = st.kennel.lv; st.kennel = null; save(); showKennel(); if (mode === 'sleep' || mode === 'toBed') mode = 'idle'; return lv; },
    setKennelLevel(lv) { if (!st.kennel) return false; st.kennel.lv = lv; save(); showKennel(); return true; },
    // 狗狗乐园院子的小栅栏：人和狗都走不过去，但能跳过去（用户说的）
    collideYard(p, pr = .4) {
      if (!st.kennel || !kennelObj || !kennelObj.yard || p.y > .45) return; const k = st.kennel, c = Math.cos(k.face), s = Math.sin(k.face), dx = p.x - k.x, dz = p.z - k.z;
      let lx = dx * c - dz * s, lz = dx * s + dz * c; if (Math.abs(lx) > 5 || Math.abs(lz) > 7) return; const ox = lx, oz = lz;
      kennelObj.yard.segs.forEach(([ax, az, bx, bz]) => {
        const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, rx = lx - ax, rz = lz - az, t = rx * ux + rz * uz, n = rx * -uz + rz * ux;
        if (t < -pr || t > len + pr || Math.abs(n) > pr) return; const push = (n >= 0 ? pr : -pr) - n; lx += -uz * push; lz += ux * push;
      });
      if (lx !== ox || lz !== oz) { p.x = k.x + lx * c + lz * s; p.z = k.z - lx * s + lz * c; }
    },
    // 人不能穿过狗屋（狗可以钻进去）
    collideKennel(p, pr = .45) {
      if (!st.kennel || !kennelObj) return; const k = st.kennel, c = Math.cos(k.face), s = Math.sin(k.face), dx = p.x - k.x, dz = p.z - k.z;
      let lx = dx * c - dz * s, lz = dx * s + dz * c; const hw = kennelObj.half.w + pr, hd = kennelObj.half.d + pr;
      const ex = hw - Math.abs(lx), ez = hd - Math.abs(lz); if (ex <= 0 || ez <= 0) return;
      if (ex < ez) lx = Math.sign(lx || 1) * hw; else lz = Math.sign(lz || 1) * hd;
      p.x = k.x + lx * c + lz * s; p.z = k.z - lx * s + lz * c;
    },
    near(p) { return st.has && D.root.visible && dist2(pos, p) < 2.2; },
    nearBowl(p) { return st.bowl && dist2(st.bowl, p) < 1.6; },
    status() { return `饱 ${Math.round(st.full)}% · 忠诚 ${Math.round(st.loyal)}${st.loyal >= 70 ? ' ❤️' : ''}`; },
    moodText() {
      if (mode === 'guard') return '正在菜园门口帮你看家';
      if (st.full < HUNGRY) return st.bowl && st.bowl.food > 0 ? '饿了，去狗盆吃饭' : '饿了 —— 狗盆里要加狗粮';
      if (mode === 'eat') return '正在吃饭';
      if (st.loyal >= 70) return '最喜欢你了';
      if (st.loyal >= 40) return '跟你越来越亲';
      return '还有点害羞，多陪它玩';
    },
    // 摸摸它
    pet() { if (petCd > 0) { say('😊', 1.2); return `🐶 ${st.name}蹭了蹭你`; } petCd = 20; st.loyal = Math.min(100, st.loyal + 2); say('❤️', 2); mode = 'sit'; timer = 2; save(); return `🐶 摸了摸${st.name}，它很开心（忠诚 +2）`; },
    // 用手喂狗粮
    feed() { if (st.full >= 95) { say('😌', 1.5); return `🐶 ${st.name}已经吃饱了`; } st.full = Math.min(100, st.full + MEAL); st.loyal = Math.min(100, st.loyal + 3); say('😋', 2); mode = 'eat'; timer = 1.8; save(); return `🐶 ${st.name}吃得好香（忠诚 +3）`; },
    // 放狗盆
    placeBowl(x, z) { st.bowl = { x, z, food: st.bowl ? st.bowl.food : 0 }; save(); showBowl(); },
    fillBowl() { if (!st.bowl) return false; if (st.bowl.food >= BOWL_MAX) return null; st.bowl.food++; save(); showBowl(); return st.bowl.food; },
    takeBowl() { if (!st.bowl) return false; const left = st.bowl.food; st.bowl = null; save(); showBowl(); return left; },
    // 扔飞盘
    // 拴住 / 解开（用户说：狗拴上以后不能随便乱跑）。有狗屋而且在旁边：拴在狗屋门口；不然在狗站的地方钉个小木桩
    get chained() { return !!st.chain; }, get chainedToKennel() { return !!(st.chain && st.chain.k); },
    tie() {
      if (st.kennel && dist2(pos, st.kennel) < 8) { const [cx, cz] = kToWorld(0, KENNEL[st.kennel.lv].D + .35); st.chain = { x: cx, z: cz, k: true }; }
      else st.chain = { x: pos.x, z: pos.z, k: false };
      if (mode === 'follow' || mode === 'guard' || mode === 'fetch' || mode === 'return') mode = 'idle';
      save(); say('😐', 1.5); return st.chain.k;
    },
    untie() { st.chain = null; save(); say('😆', 2); mode = 'circle'; timer = 2; circ.set(pos.x - .9, 0, pos.z); circA = 0; },
    throwFrisbee(from, yaw) {
      if (!st.has || frisState) return false;
      if (st.chain) return 'chained';
      fris.visible = true; fris.position.set(from.x + Math.sin(yaw) * .6, from.y + 1.3, from.z + Math.cos(yaw) * .6);
      fv.set(Math.sin(yaw) * 19, 4.2, Math.cos(yaw) * 19); fetchT = 0; frisState = 'fly'; mode = 'fetch'; say('❗', 1); return true;   // 扔得更远（大约 22 米）
    },
    debug: { pose(f, m, t = 999) { face = f; mode = m; timer = t; }, setFull(v) { st.full = v; save(); }, setLoyal(v) { st.loyal = v; save(); }, reset() { st = { has: false }; save(); D.root.visible = false; frisState = null; fris.visible = false; showBowl(); } },
    save,
  };
  showBowl(); showKennel();
  return api;
}
