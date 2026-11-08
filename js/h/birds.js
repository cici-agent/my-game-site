// ===== 菜鸟家园 · 小鸟和蝴蝶（用户定的） =====
// 小鸟：有点像宠物，有好感度。撒鸟食给它吃，好感会变高；好感满了，它会帮你吃掉菜园里的虫子。
//   小鸟怕人：好感低的时候你一走近它就飞走。先撒鸟食，站着别动，它会过来吃。
//   鸟笼：走到小鸟旁边按 E 把它关进笼子，就能拿着到处走、看它；也只有关进笼子的鸟才能拿去卖。
//   鸟屋：小鸟休息的地方（放在自己专门的那块地上）。两只好感高的小鸟住进鸟屋才会下蛋，
//         蛋在鸟屋里：你收走了就不会孵；不收的话过一阵可能会孵出小鸟宝宝。
// 蝴蝶：飞来飞去当装饰，也会生宝宝；用蝴蝶网抓，抓到的能卖。
import * as THREE from 'three';
import { plotToWorld } from './garden.js';

const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .7, ...o });
const SPH = new THREE.SphereGeometry(1, 14, 10);
const rnd = (a, b) => a + Math.random() * (b - a);

export const BIRD_KINDS = [
  { name: '小蓝雀', body: 0x4f9be8, belly: 0xfff1b0, wing: 0x2f6fc0 },
  { name: '知更鸟', body: 0x9a7a5a, belly: 0xff8a3d, wing: 0x6e5034 },
  { name: '小黄雀', body: 0xffd43b, belly: 0xfff3a0, wing: 0xd99a00 },
  { name: '小麻雀', body: 0xa8835a, belly: 0xefe2cc, wing: 0x6e4f30 },
  { name: '小白鸽', body: 0xf2f2f2, belly: 0xffffff, wing: 0xc9d0da },
];
const LOVE_HOME = 50, LOVE_BRAVE = 60, LOVE_FULL = 100, LOVE_BUG = 80;
const BIRD_GROW = 10 * 60 * 1000;          // 小鸟宝宝 10 分钟长大
const EGG_EVERY = 12 * 60 * 1000;          // 鸟屋里两只好感高的小鸟：12 分钟下一个蛋
const HATCH = 8 * 60 * 1000;               // 蛋放 8 分钟没收：60% 孵出小鸟
const EGG_MAX = 4, BIRD_CAP = 10;
export const BIRD_SITE = (side) => [-side * 7, 8];

export function buildBird(kind) {
  const K = BIRD_KINDS[kind % BIRD_KINDS.length];
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const add = (p, mat, pos, s, r) => { const m = new THREE.Mesh(SPH, mat); m.position.set(...pos); m.scale.set(...s); if (r) m.rotation.set(...r); m.castShadow = true; p.add(m); return m; };
  const bm = M(K.body), wm = M(K.wing);
  add(body, bm, [0, .12, 0], [.075, .07, .095]);
  add(body, M(K.belly), [0, .105, .035], [.06, .055, .07]);
  add(body, wm, [0, .14, -.11], [.035, .012, .065], [.45, 0, 0]);   // 尾巴
  const head = new THREE.Group(); head.position.set(0, .2, .06); body.add(head);
  add(head, bm, [0, 0, 0], [.058, .056, .058]);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.017, .045, 6), M(0xffa630)); beak.rotation.x = Math.PI / 2; beak.position.set(0, -.008, .07); head.add(beak);
  const black = M(0x111111), hi = M(0xffffff);
  [-1, 1].forEach(s => { add(head, black, [s * .032, .015, .042], [.012, .014, .01]); add(head, hi, [s * .032 + .004, .02, .05], [.004, .004, .003]); add(head, M(0xff9aa8, { transparent: true, opacity: .5 }), [s * .042, -.012, .035], [.012, .007, .006]); });
  const wings = [-1, 1].map(s => { const w = new THREE.Group(); w.position.set(s * .07, .145, 0); body.add(w); add(w, wm, [s * .012, -.015, -.01], [.016, .05, .075]); return w; });
  const legM = M(0xe08a2a);
  [-1, 1].forEach(s => { const l = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .06, 4), legM); l.position.set(s * .03, .03, 0); body.add(l); });
  return { root, body, head, wings };
}

// 鸟笼（拿在手上看鸟用）
export function buildCage() {
  const g = new THREE.Group(), gold = M(0xd8b04a, { metalness: .5, roughness: .35 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(.17, .18, .04, 18), gold); base.position.y = .02; g.add(base);
  const bar = new THREE.CylinderGeometry(.005, .005, .34, 4);
  for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, b = new THREE.Mesh(bar, gold); b.position.set(Math.cos(a) * .16, .21, Math.sin(a) * .16); g.add(b); }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.16, .007, 6, 24), gold); ring.rotation.x = Math.PI / 2; ring.position.y = .38; g.add(ring);
  for (let i = 0; i < 3; i++) { const arc = new THREE.Mesh(new THREE.TorusGeometry(.16, .005, 4, 16, Math.PI), gold); arc.position.y = .38; arc.rotation.y = i * Math.PI / 3; g.add(arc); }
  const hook = new THREE.Mesh(new THREE.TorusGeometry(.03, .006, 6, 12), gold); hook.position.y = .57; g.add(hook);
  const perch = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, .3, 4), M(0x8a5a2b)); perch.rotation.z = Math.PI / 2; perch.position.y = .14; g.add(perch);
  return g;
}

function buildBirdhouse() {
  const g = new THREE.Group(), wood = M(0xd9a066), dark = M(0x9a6a3c), roofM = M(0xc23626);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .07, 1.8, 8), dark); pole.position.y = .9; pole.castShadow = true; g.add(pole);
  const box = new THREE.Mesh(new THREE.BoxGeometry(.6, .62, .55), wood); box.position.y = 2.1; box.castShadow = true; g.add(box);
  [-1, 1].forEach(s => { const r = new THREE.Mesh(new THREE.BoxGeometry(.48, .05, .7), roofM); r.position.set(s * .19, 2.53, 0); r.rotation.z = -s * .72; r.castShadow = true; g.add(r); });
  const front = new THREE.Mesh(new THREE.ConeGeometry(.42, .3, 3), wood); front.rotation.set(0, 0, 0); front.scale.set(1, 1, .01); front.position.set(0, 2.5, .27); g.add(front);
  const hole = new THREE.Mesh(new THREE.CircleGeometry(.1, 16), M(0x2a1a0e)); hole.position.set(0, 2.18, .276); g.add(hole);
  const perch = new THREE.Mesh(new THREE.CylinderGeometry(.012, .012, .14, 6), dark); perch.rotation.x = Math.PI / 2; perch.position.set(0, 2.02, .34); g.add(perch);
  // 下面一块小托板，鸟窝和蛋放在这里（看得见）
  const ledge = new THREE.Mesh(new THREE.BoxGeometry(.62, .04, .42), dark); ledge.position.set(0, 1.62, .1); g.add(ledge);
  const nest = new THREE.Mesh(new THREE.TorusGeometry(.13, .05, 8, 16), M(0xa07a48, { roughness: 1 })); nest.rotation.x = Math.PI / 2; nest.position.set(0, 1.67, .12); g.add(nest);
  const eggs = []; for (let i = 0; i < EGG_MAX; i++) { const e = new THREE.Mesh(SPH, M(0xbfe6ff, { roughness: .4 })); e.scale.set(.035, .045, .035); const a = i * 1.6; e.position.set(Math.cos(a) * .06, 1.69, .12 + Math.sin(a) * .06); e.visible = false; g.add(e); eggs.push(e); }
  return { g, eggs };
}

function signPost(text) {
  const g = new THREE.Group(), om = M(0xc9a66b);
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2, d = new THREE.Mesh(new THREE.BoxGeometry(1.6, .04, .1), om); d.position.set(Math.sin(a) * .8, .02, Math.cos(a) * .8); d.rotation.y = a; g.add(d); }
  const post = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.1, .08), M(0x9a6a3c)); post.position.set(1.1, .55, 1.1); g.add(post);
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d'); x.fillStyle = '#f2e1bd'; x.fillRect(0, 0, 256, 96); x.fillStyle = '#5a3a1a'; x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.fillText(text, 128, 60);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, .4, .04), new THREE.MeshStandardMaterial({ map: t })); b.position.set(1.1, 1.1, 1.15); g.add(b);
  return g;
}

export function createBirds({ scene, plot, side, garden, isNight = () => false, notify = () => {} }) {
  const KEY = 'xcn_birds_v1', now0 = Date.now();
  let st = null; try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  st ||= { birds: [0, 1, 2].map((k, i) => ({ id: i + 1, kind: k, love: 0, born: now0 - BIRD_GROW })), caged: [], house: { built: false, eggs: [] }, nextId: 4, arrive: now0 + 15 * 60000, t: now0 };
  const save = () => { st.t = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const h = plot.size / 2;
  const W = (lx, lz) => { const [x, z] = plotToWorld(plot, lx, lz); return new THREE.Vector3(x, 0, z); };
  const [sx, sz] = BIRD_SITE(side), site = W(sx, sz);
  const face = Math.atan2(-site.x + W(0, -3).x, -site.z + W(0, -3).z) + Math.PI;   // 鸟洞朝着前面（背对房子）
  const holder = new THREE.Group(); holder.position.copy(site); holder.rotation.y = face; scene.add(holder);
  let BH = null, sign = null;
  function buildHome() {
    if (BH) holder.remove(BH.g); if (sign) holder.remove(sign); BH = sign = null;
    if (st.house.built) { BH = buildBirdhouse(); holder.add(BH.g); showEggs(); } else { sign = signPost('🐦 鸟屋的地方'); holder.add(sign); }
  }
  const showEggs = () => { if (BH) BH.eggs.forEach((e, i) => { e.visible = i < st.house.eggs.length; }); };
  const holePos = () => new THREE.Vector3(0, 2.18, .5).applyAxisAngle(new THREE.Vector3(0, 1, 0), face).add(site);
  const roofPos = () => new THREE.Vector3(rnd(-.12, .12), 2.66, 0).applyAxisAngle(new THREE.Vector3(0, 1, 0), face).add(site);
  buildHome();

  // 小鸟在空地里随便找个地方落下（不落在房子上）
  function groundSpot(near) {
    for (let i = 0; i < 30; i++) {
      let p;
      if (near) p = new THREE.Vector3(near.x + rnd(-6, 6), 0, near.z + rnd(-6, 6));
      else { const lx = rnd(-h + 3, h - 3), lz = rnd(-h + 3, h - 3); if (Math.abs(lx) < 11 && lz > -12 && lz < 6) continue; p = W(lx, lz); }
      return p;
    }
    return site.clone().add(new THREE.Vector3(1.5, 0, 1.5));
  }
  const farSpot = () => { const a = Math.random() * 6.28; return new THREE.Vector3(plot.x + Math.cos(a) * (h + 30), 14, plot.z + Math.sin(a) * (h + 30)); };

  // ---------- 每只小鸟 ----------
  const live = [];
  const isAdult = d => Date.now() - d.born >= BIRD_GROW;
  function spawn(d, at) {
    const m = buildBird(d.kind); scene.add(m.root);
    const b = { d, m, p: (at || groundSpot()).clone(), state: 'ground', t: rnd(1, 4), fly: null, ph: Math.random() * 10, face: Math.random() * 6.28, bugT: rnd(40, 120), hop: 0 };
    live.push(b); return b;
  }
  function despawn(b) { scene.remove(b.m.root); live.splice(live.indexOf(b), 1); }
  st.birds.forEach(d => spawn(d));
  function flyTo(b, to, then, extra) {
    const dist = b.p.distanceTo(to);
    b.fly = { from: b.p.clone(), to: to.clone(), t: 0, dur: .6 + dist / 6, peak: Math.max(b.p.y, to.y) + 1.2 + Math.min(4, dist * .15), then, ...extra };
    b.state = 'fly'; b.m.root.visible = true;
  }
  const resident = d => st.house.built && d.love >= LOVE_HOME;

  // ---------- 撒的鸟食 ----------
  let seeds = null;
  const seedMat = M(0xe8c070, { roughness: 1 });
  function dropSeeds(x, z) {
    if (seeds) scene.remove(seeds.g);
    const g = new THREE.Group(); g.position.set(x, .02, z); scene.add(g);
    for (let i = 0; i < 26; i++) { const s = new THREE.Mesh(SPH, seedMat); s.scale.set(.025, .012, .018); s.position.set(rnd(-.3, .3), 0, rnd(-.3, .3)); s.rotation.y = rnd(0, 3); g.add(s); }
    seeds = { g, x, z, n: 4, life: 180 };
    // 附近醒着的小鸟会飞过来吃（最多 4 只）
    const day = !isNight();
    live.filter(b => day && b.state !== 'sleep' && b.state !== 'bug' && Math.hypot(b.p.x - x, b.p.z - z) < 35).sort((a, c) => Math.hypot(a.p.x - x, a.p.z - z) - Math.hypot(c.p.x - x, c.p.z - z)).slice(0, 4)
      .forEach((b, i) => setTimeout(() => { if (seeds && b.state !== 'sleep' && live.includes(b)) flyTo(b, new THREE.Vector3(x + rnd(-.35, .35), 0, z + rnd(-.35, .35)), 'seed'); }, 300 + i * 900));
  }

  // ---------- 下蛋、孵小鸟、新的野鸟飞来（离开游戏时也照算） ----------
  function tick(now, quiet) {
    const H = st.house;
    if (H.built) {
      const res = st.birds.filter(d => resident(d) && now - d.born >= BIRD_GROW);
      if (res.length >= 2 && H.eggs.length < EGG_MAX) { H.nextEgg ||= now + EGG_EVERY; if (now >= H.nextEgg) { H.eggs.push({ t: now, kind: res[Math.floor(Math.random() * res.length)].kind }); H.nextEgg = now + EGG_EVERY; if (!quiet) notify('🪺 鸟屋里多了一个鸟蛋'); showEggs(); } }
      else if (res.length < 2) H.nextEgg = 0;
      for (const e of [...H.eggs]) {
        if (e.dud || now - e.t < HATCH) continue;
        if (Math.random() < .6 && st.birds.length < BIRD_CAP) {
          H.eggs.splice(H.eggs.indexOf(e), 1);
          const d = { id: st.nextId++, kind: e.kind, love: LOVE_HOME, born: now }; st.birds.push(d);
          if (!quiet) { spawn(d, site.clone().add(new THREE.Vector3(rnd(-1, 1), 0, rnd(.8, 1.6)))); notify(`🐣 鸟屋里的蛋孵出了一只${BIRD_KINDS[d.kind].name}宝宝！`); }
          showEggs();
        } else e.dud = true;   // 没孵出来：还能收走
      }
    }
    if (st.birds.length < 3 && now >= st.arrive) {
      const d = { id: st.nextId++, kind: Math.floor(Math.random() * BIRD_KINDS.length), love: 0, born: now - BIRD_GROW }; st.birds.push(d);
      if (!quiet) { const b = spawn(d, farSpot()); flyTo(b, groundSpot(), 'ground'); notify(`🐦 一只${BIRD_KINDS[d.kind].name}飞到你家来了`); }
      st.arrive = now + 15 * 60000;
    }
    if (st.birds.length >= 3) st.arrive = Math.max(st.arrive, now + 60000);
  }
  { const from = st.t || now0; for (let t = from + 60000; t < now0; t += 60000) tick(t, true); tick(now0, true); save(); }
  st.birds.forEach(d => { if (!live.find(b => b.d === d)) spawn(d); });
  showEggs();

  // ---------- 手上拿着的鸟笼（看鸟） ----------
  const cage = buildCage(); cage.visible = false; scene.add(cage);
  let cageBird = null, cageKind = -1;

  let lastP = null, pSpeed = 0, saveT = 0, tickT = 0, t0 = 0;
  const Y = new THREE.Vector3(0, 1, 0);
  function update(dt, ppos, pface, held) {
    t0 += dt;
    if (lastP) pSpeed = pSpeed * .8 + .2 * (Math.hypot(ppos.x - lastP.x, ppos.z - lastP.z) / Math.max(dt, .001)); lastP = { x: ppos.x, z: ppos.z };
    if ((tickT += dt) > 5) { tickT = 0; tick(Date.now(), false); }
    if ((saveT += dt) > 4) { saveT = 0; save(); }
    if (seeds && ((seeds.life -= dt) <= 0 || seeds.n <= 0)) { scene.remove(seeds.g); seeds = null; }
    const night = isNight();
    for (const b of [...live]) {
      const r = b.m.root, d = b.d; b.ph += dt; b.t -= dt;
      r.scale.setScalar(isAdult(d) ? 1.9 : 1 + .9 * (Date.now() - d.born) / BIRD_GROW);
      const dp = Math.hypot(b.p.x - ppos.x, b.p.z - ppos.z);
      // 天黑：住鸟屋的回鸟屋，别的飞走；天亮再回来
      if (night && b.state !== 'sleep' && !(b.state === 'fly' && b.fly.then === 'sleep')) flyTo(b, resident(d) ? holePos() : farSpot(), 'sleep');
      if (!night && b.state === 'sleep') { if (!resident(d)) b.p.copy(farSpot()); else b.p.copy(holePos()); flyTo(b, groundSpot(resident(d) ? site : null), 'ground'); }
      if (b.state === 'fly') {
        const f = b.fly; f.t += dt; const k = Math.min(1, f.t / f.dur);
        b.p.lerpVectors(f.from, f.to, k); b.p.y += Math.sin(k * Math.PI) * (f.peak - Math.max(f.from.y, f.to.y)) + (f.from.y > f.to.y ? 0 : 0);
        const dx = f.to.x - f.from.x, dz = f.to.z - f.from.z; if (Math.hypot(dx, dz) > .1) b.face = Math.atan2(dx, dz);
        b.m.wings.forEach((w, i) => { w.rotation.z = (i ? -1 : 1) * (.3 + Math.sin(b.ph * 38) * .9); });
        b.m.body.rotation.x = k < .2 ? -.3 : k > .85 ? .2 : 0;
        if (k >= 1) {
          b.fly = null; b.m.body.rotation.x = 0; b.m.wings.forEach(w => { w.rotation.z = 0; });
          b.state = f.then; b.t = f.then === 'perch' ? rnd(4, 10) : f.then === 'bug' ? 3 : rnd(2, 6);
          if (f.then === 'sleep') r.visible = false;
          if (f.then === 'bug') b.bed = f.bed;
        }
      } else if (b.state !== 'sleep') {
        // 地上：一跳一跳，低头啄
        b.hop = Math.max(0, b.hop - dt);
        const peck = b.state === 'seed' || b.state === 'bug' ? Math.max(0, Math.sin(b.ph * 9)) : Math.max(0, Math.sin(b.ph * 2.3) - .6) * 2.5;
        b.m.head.rotation.x = peck * .8; b.m.head.position.y = .2 - peck * .05;
        if (b.state === 'ground' && Math.random() < dt * .8) { b.hop = .25; b.face += rnd(-1, 1); const s = .12; b.p.x += Math.sin(b.face) * s; b.p.z += Math.cos(b.face) * s; }
        b.p.y = (b.state === 'perch' ? b.p.y : 0);
        r.position.y = b.p.y + Math.sin((b.hop / .25) * Math.PI) * .08;
        // 怕人：好感低，你一走近就飞；好感中等，你跑过来才飞；好感高就不怕
        const scared = d.love < 30 ? (dp < 3.2 && pSpeed > .6) : d.love < LOVE_BRAVE ? (dp < 2.4 && pSpeed > 9) : false;
        if (scared && b.state !== 'bug') { flyTo(b, groundSpot(), 'ground'); continue; }
        if (b.state === 'seed') {
          if (!seeds) b.state = 'ground';
          else if (b.t <= 0) { seeds.n--; b.t = 2.5; const before = d.love; d.love = Math.min(LOVE_FULL, d.love + 8);
            if (dp < 12) notify(`🐦 ${BIRD_KINDS[d.kind].name}吃了你撒的鸟食（好感 ${d.love}/100）${before < LOVE_BUG && d.love >= LOVE_BUG ? ' · 它会帮你吃菜园的虫子了！' : ''}`);
            if (seeds.n <= 0) b.state = 'ground'; }
        } else if (b.state === 'bug') {
          if (b.t <= 0) { b.state = 'ground'; b.t = rnd(2, 5); if (garden.birdEatBug && garden.birdEatBug(b.bed)) notify(`🐦 ${BIRD_KINDS[d.kind].name}帮你吃掉了一只菜园里的虫子`); }
        } else if (b.t <= 0) {
          // 换个地方：飞去别处 / 停到鸟屋顶上
          const c = Math.random();
          if (st.house.built && resident(d) && c < .3) flyTo(b, roofPos(), 'perch');
          else if (c < .65) flyTo(b, groundSpot(resident(d) || !isAdult(d) ? site : null), 'ground');
          else b.t = rnd(2, 5);
        }
        // 好感满的小鸟：时不时去菜园找虫子吃
        if (d.love >= LOVE_BUG && !night && (b.state === 'ground' || b.state === 'perch') && (b.bugT -= dt) <= 0) {
          b.bugT = rnd(60, 150);
          const list = garden.bugBeds ? garden.bugBeds() : [];
          if (list.length) { const bd = list[Math.floor(Math.random() * list.length)]; flyTo(b, new THREE.Vector3(bd.x + rnd(-.6, .6), 0, bd.z + rnd(-.6, .6)), 'bug', { bed: bd.i }); }
        }
      }
      if (b.state !== 'sleep') { r.position.x = b.p.x; r.position.z = b.p.z; if (b.state === 'fly') r.position.y = b.p.y; r.rotation.y = b.face; }
    }
    // 拿在手上的鸟笼
    const show = held === 'cage' || held === 'cagebird';
    cage.visible = show;
    if (show) {
      const k = held === 'cagebird' && st.caged.length ? st.caged[st.caged.length - 1].kind : -1;
      if (k !== cageKind) { if (cageBird) cage.remove(cageBird.root); cageBird = null; cageKind = k; if (k >= 0) { cageBird = buildBird(k); cageBird.root.position.y = .14; cageBird.root.scale.setScalar(1.1); cage.add(cageBird.root); } }
      const rx = Math.cos(pface) * .45, rz = -Math.sin(pface) * .45;
      cage.position.set(ppos.x + Math.sin(pface) * .55 - rx, ppos.y + .8, ppos.z + Math.cos(pface) * .55 - rz); cage.rotation.y = pface; cage.scale.setScalar(1.5);
      if (cageBird) { const s = Math.sin(t0 * 1.7); cageBird.root.rotation.y = s > .3 ? .8 : s < -.3 ? -.8 : 0; cageBird.head.rotation.x = Math.max(0, Math.sin(t0 * 3)) * .4; cageBird.root.position.y = .14 + Math.max(0, Math.sin(t0 * 5)) * .02; }
    }
  }

  const nearSite = p => Math.hypot(p.x - site.x, p.z - site.z) < 2.4;
  function nearestBird(p, r = 2) {
    let best = null, bd = r;
    for (const b of live) { if (b.state === 'fly' || b.state === 'sleep' || b.p.y > .5) continue; const d = Math.hypot(b.p.x - p.x, b.p.z - p.z); if (d < bd) { bd = d; best = b; } }
    return best;
  }
  const api = {
    site, KINDS: BIRD_KINDS, get built() { return st.house.built; }, get eggs() { return st.house.eggs.length; }, get count() { return st.birds.length; }, get caged() { return st.caged; },
    get residents() { return st.birds.filter(resident).length; },
    nearSite, nearestBird, update,
    nameOf: b => BIRD_KINDS[b.d.kind].name,
    build() { st.house.built = true; save(); buildHome(); },
    demolish() { st.house = { built: false, eggs: [] }; save(); buildHome(); },
    collectEggs() { const n = st.house.eggs.length; st.house.eggs = []; save(); showEggs(); return n; },
    seed(x, z) { dropSeeds(x, z); },
    catchBird(b) { const i = st.birds.indexOf(b.d); if (i < 0) return null; st.birds.splice(i, 1); st.caged.push({ kind: b.d.kind, love: b.d.love, born: b.d.born }); despawn(b); save(); return BIRD_KINDS[b.d.kind].name; },
    release(x, z) { const c = st.caged.pop(); if (!c) return null; const d = { id: st.nextId++, kind: c.kind, love: c.love, born: c.born }; st.birds.push(d); const b = spawn(d, new THREE.Vector3(x, 1, z)); flyTo(b, groundSpot({ x, z }), 'ground'); save(); return BIRD_KINDS[c.kind].name; },
    lastCaged() { const c = st.caged[st.caged.length - 1]; return c ? BIRD_KINDS[c.kind].name : '小鸟'; },
    soldCaged(n) { st.caged.splice(Math.max(0, st.caged.length - n), n); save(); },
    collide(p) { if (!st.house.built) return; const dx = p.x - site.x, dz = p.z - site.z, d = Math.hypot(dx, dz); if (d < .4 && d > 1e-4) { p.x = site.x + dx / d * .4; p.z = site.z + dz / d * .4; } },
    debug: {
      love() { st.birds.forEach(d => { d.love = LOVE_FULL; d.born = Math.min(d.born, Date.now() - BIRD_GROW); }); save(); },
      egg() { if (!st.house.built) return false; st.house.eggs.push({ t: Date.now(), kind: Math.floor(Math.random() * BIRD_KINDS.length) }); save(); showEggs(); return true; },
      hatch() { st.house.eggs.forEach(e => { e.t = 0; e.dud = false; }); tick(Date.now(), false); save(); },
      bird() { st.arrive = 0; const n = st.birds.length; if (n >= 3) { const d = { id: st.nextId++, kind: Math.floor(Math.random() * BIRD_KINDS.length), love: 0, born: Date.now() - BIRD_GROW }; st.birds.push(d); const b = spawn(d, farSpot()); flyTo(b, groundSpot(), 'ground'); } else tick(Date.now(), false); save(); },
      live, get seeds() { return seeds; },
    },
  };
  return api;
}

// ---------- 🦋 蝴蝶 ----------
const BFLY_COLORS = [[0xff8c1a, 0x2a1a0e], [0xffe14d, 0x3a2a10], [0x5ab4ff, 0x1a2a4a], [0xffffff, 0x666666], [0xff8ccf, 0x5a1a3a], [0xb18cff, 0x2a1a4a]];
export function buildButterfly(c) {
  const [col, edge] = BFLY_COLORS[c % BFLY_COLORS.length];
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.012, .09, 4, 6), M(0x222222)); body.rotation.x = Math.PI / 2; root.add(body);
  const wm = new THREE.MeshStandardMaterial({ color: col, side: THREE.DoubleSide, roughness: .6 }), em = new THREE.MeshStandardMaterial({ color: edge, side: THREE.DoubleSide });
  const wings = [-1, 1].map(s => {
    const w = new THREE.Group(); root.add(w);
    const up = new THREE.Mesh(new THREE.CircleGeometry(.075, 14), wm); up.rotation.x = -Math.PI / 2; up.position.set(s * .07, 0, .03); up.scale.set(1, 1.2, 1); w.add(up);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(.02, 10), em); dot.rotation.x = -Math.PI / 2; dot.position.set(s * .1, .001, .05); w.add(dot);
    const lo = new THREE.Mesh(new THREE.CircleGeometry(.05, 12), wm); lo.rotation.x = -Math.PI / 2; lo.position.set(s * .05, 0, -.045); w.add(lo);
    return w;
  });
  root.scale.setScalar(1.6);
  return { root, wings };
}
export function createButterflies({ scene, plot, garden, isNight = () => false }) {
  const KEY = 'xcn_bfly_v1', MAX = 14, BREED = 15 * 60 * 1000;
  let st = null; try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  st ||= { n: 5, next: Date.now() + BREED, t: Date.now() };
  // 离开的这段时间：两只以上会生宝宝；少于两只会有新的飞来
  while (st.next <= Date.now()) { if (st.n < MAX) st.n++; st.next += BREED; }
  const save = () => { st.t = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  save();
  const h = plot.size / 2;
  const centers = () => { const beds = garden.beds || []; return beds.length ? beds.map(b => [b.wx, b.wz]) : [[plot.x, plot.z]]; };
  function target(f) {
    if (Math.random() < .7) { const c = centers(), [x, z] = c[Math.floor(Math.random() * c.length)]; return new THREE.Vector3(x + rnd(-2.5, 2.5), rnd(.4, 1.6), z + rnd(-2.5, 2.5)); }
    const [x, z] = plotToWorld(plot, rnd(-h + 4, h - 4), rnd(-h + 4, h - 4)); return new THREE.Vector3(x, rnd(.5, 2.2), z);
  }
  const list = [];
  function sync() {
    while (list.length > st.n) { const f = list.pop(); scene.remove(f.m.root); }
    while (list.length < st.n) { const m = buildButterfly(Math.floor(Math.random() * BFLY_COLORS.length)); scene.add(m.root); const f = { m, p: null, to: null, ph: Math.random() * 10, sp: rnd(1, 1.6) }; f.p = target(f); f.to = target(f); list.push(f); }
  }
  sync();
  let saveT = 0;
  function update(dt) {
    const night = isNight(), now = Date.now();
    if (now >= st.next) { st.next = now + BREED; if (st.n >= 2 ? st.n < MAX : true) { st.n++; sync(); save(); } }
    if ((saveT += dt) > 10) { saveT = 0; save(); }
    list.forEach(f => {
      f.m.root.visible = !night; if (night) return;
      f.ph += dt;
      const d = f.to.clone().sub(f.p), L = d.length();
      if (L < .3) f.to = target(f);
      else f.p.addScaledVector(d, Math.min(1, f.sp * dt / L));
      const r = f.m.root; r.position.set(f.p.x + Math.sin(f.ph * 2.1) * .25, f.p.y + Math.sin(f.ph * 3.3) * .2, f.p.z + Math.cos(f.ph * 1.7) * .25);
      r.rotation.y = Math.atan2(d.x, d.z);
      f.m.wings.forEach((w, i) => { w.rotation.z = (i ? 1 : -1) * Math.sin(f.ph * 16) * 1.1; });
    });
  }
  function nearest(p, r = 2.2) {
    if (isNight()) return null;
    let best = null, bd = r; list.forEach(f => { const q = f.m.root.position, d = Math.hypot(q.x - p.x, q.z - p.z); if (d < bd && q.y < 2.6) { bd = d; best = f; } }); return best;
  }
  return {
    update, nearest, get count() { return st.n; },
    catchOne(p) { const f = nearest(p); if (!f) return false; list.splice(list.indexOf(f), 1); scene.remove(f.m.root); st.n--; if (st.n < 2) st.next = Math.min(st.next, Date.now() + BREED); save(); return true; },
    release(x, z) { st.n++; sync(); const f = list[list.length - 1]; f.p.set(x, 1.2, z); f.to = target(f); save(); },
    debug: { add(k = 3) { st.n = Math.min(MAX, st.n + k); sync(); save(); }, list },
  };
}
