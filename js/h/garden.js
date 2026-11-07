// ===== 菜鸟家园 · 菜园（试玩版：数据先存在浏览器里，以后换成数据库） =====
// 规则见《菜鸟家园-功能规划》：
//   每块田 5 棵；种 → 浇水 → 长大 → 成熟才能收；不浇水就不长（不会枯死）
//   水分：刚浇完最湿、土最深色、长得最快；越干越慢，干了就停
//   虫子：不会让菜变小，但长得慢；越来越多，越多吃掉的菜越多；不会爬到别的田；按 E 一只一只赶走
//   收法：拔（整棵拔起来，给种子）/ 摘（只摘果子，不给种子；过一阵还会结，结太多次会枯萎，枯萎时小概率给几颗种子）
//   收获装进背包，背包满了就装不下
import * as THREE from 'three';

// ---------- 作物（数值以后后台可改） ----------
// grow：第一次成熟要多少秒（水分充足、没虫时按 1 倍算）；regrow：摘完再结果要多少秒；picks：能结几次
// yield：每棵每次收几个；seeds：拔的时候给几颗种子 [最少, 最多]；witherSeed：枯萎时给种子的概率
export const CROPS = {
  radish:     { name: '小萝卜', icon: '🔴', lv: 1, kind: 'pull', grow: 5 * 60,      yield: 1, seeds: [1, 2], price: 2 },
  lettuce:    { name: '生菜',   icon: '🥬', lv: 1, kind: 'pull', grow: 15 * 60,     yield: 1, seeds: [1, 2], price: 3 },
  carrot:     { name: '胡萝卜', icon: '🥕', lv: 1, kind: 'pull', grow: 30 * 60,     yield: 1, seeds: [1, 2], price: 4 },
  potato:     { name: '土豆',   icon: '🥔', lv: 1, kind: 'pull', grow: 60 * 60,     yield: 2, seeds: [1, 3], price: 4 },
  tomato:     { name: '番茄',   icon: '🍅', lv: 2, kind: 'pick', grow: 90 * 60,     regrow: 40 * 60, picks: 4, yield: 2, witherSeed: .2, price: 6 },
  corn:       { name: '玉米',   icon: '🌽', lv: 2, kind: 'pick', grow: 120 * 60,    regrow: 60 * 60, picks: 2, yield: 1, witherSeed: .2, price: 8 },
  strawberry: { name: '草莓',   icon: '🍓', lv: 3, kind: 'pick', grow: 180 * 60,    regrow: 60 * 60, picks: 5, yield: 2, witherSeed: .2, price: 8 },
  pumpkin:    { name: '南瓜',   icon: '🎃', lv: 3, kind: 'pick', grow: 6 * 3600,    regrow: 3 * 3600, picks: 2, yield: 1, witherSeed: .2, price: 40 },
  watermelon: { name: '西瓜',   icon: '🍉', lv: 4, kind: 'pick', grow: 10 * 3600,   regrow: 5 * 3600, picks: 2, yield: 1, witherSeed: .1, price: 70 },
};
// 菜园等级：田的数量（第 1 级 12 块，以后每级多 4 块）
export const LEVELS = { 1: 12, 2: 16, 3: 20, 4: 24 };
const PER_BED = 5;
const DRY_TIME = 3 * 3600;          // 浇一次水，大约 3 小时从全湿到全干
const BUG_EVERY = 20 * 60;          // 平均 20 分钟可能来一只虫
const BUG_MAX = 5;
const BUG_EAT = 30 * 60;            // 1 只虫 30 分钟吃掉 1 棵；虫越多吃得越快
const SHOO_CD = .9;                 // 用手赶虫很慢：每赶走一只要等一会儿

// 生长速度跟着水分走：0 → 停，50% → 1 倍，100% → 1.5 倍；每只虫慢 12%
export function growRate(b) {
  const m = b.moist, w = m <= .5 ? m * 2 : 1 + (m - .5);
  return w * Math.max(.2, 1 - .12 * b.bugs);
}

// ---------- 背包 ----------
export function createBag(cap = 12, stack = 50) {
  const bag = { cap, stack, slots: [] };
  const count = key => bag.slots.filter(s => s.key === key).reduce((n, s) => n + s.n, 0);
  function room(key) {
    let r = 0; bag.slots.forEach(s => { if (s.key === key) r += stack - s.n; });
    return r + (cap - bag.slots.length) * stack;
  }
  function add(key, n) {
    if (room(key) < n) return false;
    for (const s of bag.slots) if (s.key === key && s.n < stack) { const k = Math.min(n, stack - s.n); s.n += k; n -= k; if (!n) return true; }
    while (n > 0) { const k = Math.min(n, stack); bag.slots.push({ key, n: k }); n -= k; }
    return true;
  }
  function take(key, n = 1) {
    if (count(key) < n) return false;
    for (let i = bag.slots.length - 1; i >= 0 && n; i--) { const s = bag.slots[i]; if (s.key !== key) continue; const k = Math.min(n, s.n); s.n -= k; n -= k; if (!s.n) bag.slots.splice(i, 1); }
    return true;
  }
  // 一次放好几样东西：要么全放进去，要么一样都不放
  function addAll(list) {
    const copy = JSON.stringify(bag.slots);
    for (const [k, n] of list) if (n > 0 && !add(k, n)) { bag.slots = JSON.parse(copy); return false; }
    return true;
  }
  return Object.assign(bag, { count, room, add, take, addAll });
}
export const itemInfo = key => {
  if (key.startsWith('seed_')) { const c = CROPS[key.slice(5)]; return { icon: '🌱', sub: c.icon, name: c.name + '种子', seed: true }; }
  const c = CROPS[key]; return c ? { icon: c.icon, name: c.name } : { icon: '❓', name: key };
};

// ---------- 模型小工具 ----------
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .75, ...o });
const MAT = {
  leaf: M(0x4caf50), leafDark: M(0x2e8b3a), leafLight: M(0x8bd35a), stem: M(0x5a9e3a), dead: M(0x9a7b4f), deadLeaf: M(0xb59a62),
  radish: M(0xe0335a, { roughness: .45 }), white: M(0xfaf5ea), carrot: M(0xff8a1f, { roughness: .5 }), potato: M(0xb88b56),
  tomato: M(0xe8352b, { roughness: .35 }), green: M(0x7dbf3a, { roughness: .45 }), corn: M(0xf7c948, { roughness: .5 }), husk: M(0xc9d97a),
  straw: M(0xe0383e, { roughness: .4 }), seedDot: M(0xffe08a), pumpkin: M(0xf28a1c, { roughness: .55 }), wood: M(0x9b6a3c), flower: M(0xffffff),
  yellowFlower: M(0xffd43b), bug: M(0x7cc94a, { roughness: .4 }), bugHead: M(0x3d8b2a), eye: M(0x111111),
};
{
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#2f7d32'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#9ad35a';
  for (let x = 0; x < 64; x += 16) { g.beginPath(); g.moveTo(x + 3, 0); g.bezierCurveTo(x + 9, 20, x - 3, 44, x + 5, 64); g.lineTo(x + 10, 64); g.bezierCurveTo(x + 2, 44, x + 14, 20, x + 8, 0); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  MAT.melon = M(0xffffff, { map: t, roughness: .4 });
}
const G = {
  sph: new THREE.SphereGeometry(1, 14, 10), leaf: new THREE.SphereGeometry(1, 8, 6), cone: new THREE.ConeGeometry(1, 1, 10),
  cyl: new THREE.CylinderGeometry(1, 1, 1, 8), box: new THREE.BoxGeometry(1, 1, 1),
};
function part(parent, geo, mat, pos, scale, rot) {
  const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if (scale) m.scale.set(...scale); if (rot) m.rotation.set(...rot);
  m.castShadow = true; parent.add(m); return m;
}
// 一片叶子：扁扁的椭圆，从中心往外斜
function leafRing(g, n, len, w, tilt, y, mat = MAT.leaf, phase = 0) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = i / n * Math.PI * 2 + phase, holder = new THREE.Group(); holder.rotation.y = a; holder.position.y = y; g.add(holder);
    const l = part(holder, G.leaf, mat, [0, len * .45 * Math.cos(tilt), len * .5 * Math.sin(tilt)], [w, len * .5, w * .25], [tilt, 0, 0]);
    out.push(l);
  }
  return out;
}

// ---------- 每种作物一棵的模型；set(g, phase) 按生长进度调整 ----------
// g：0~1（第一次长大的进度）；phase：grow / ripe / regrow / withered
function buildPlant(key) {
  const root = new THREE.Group(), parts = {};
  const sprout = new THREE.Group(); root.add(sprout);
  leafRing(sprout, 2, .18, .07, .9, .02, MAT.leafLight);
  const body = new THREE.Group(); root.add(body);
  const fruits = [];
  switch (key) {
    case 'radish':
      leafRing(body, 5, .42, .11, .5, .12, MAT.leaf);
      parts.bulb = part(body, G.sph, MAT.radish, [0, .07, 0], [.13, .12, .13]);
      part(parts.bulb, G.sph, MAT.white, [0, -.8, 0], [.45, .6, .45]);
      break;
    case 'lettuce':
      for (let k = 0; k < 3; k++) leafRing(body, 6, .34 - k * .07, .19 - k * .03, .95 - k * .3, .05 + k * .04, [MAT.leafLight, MAT.leaf, MAT.leafLight][k], k * .5);
      part(body, G.sph, MAT.leafLight, [0, .14, 0], [.13, .1, .13]);
      break;
    case 'carrot':
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, h = new THREE.Group(); h.rotation.y = a; body.add(h);
        part(h, G.cyl, MAT.stem, [0, .22, .05], [.012, .44, .012], [.25, 0, 0]);
        for (let j = 0; j < 3; j++) part(h, G.leaf, MAT.leafDark, [0, .2 + j * .1, .07 + j * .025], [.06, .03, .018], [.3, 0, 0]); }
      parts.top = part(body, G.cone, MAT.carrot, [0, .02, 0], [.09, .14, .09], [Math.PI, 0, 0]);
      break;
    case 'potato':
      for (let k = 0; k < 3; k++) leafRing(body, 5, .3, .12, .7 - k * .15, .12 + k * .1, k ? MAT.leaf : MAT.leafDark, k);
      for (let k = 0; k < 4; k++) fruits.push(part(body, G.sph, MAT.flower, [Math.cos(k * 1.6) * .12, .42 + (k % 2) * .05, Math.sin(k * 1.6) * .12], [.04, .03, .04]));
      parts.spuds = [0, 1, 2].map(k => part(body, G.sph, MAT.potato, [Math.cos(k * 2.1) * .2, .03, Math.sin(k * 2.1) * .2], [.08, .06, .07]));
      break;
    case 'tomato':
      part(body, G.cyl, MAT.wood, [.08, .4, 0], [.015, .8, .015]);
      part(body, G.cyl, MAT.stem, [0, .3, 0], [.025, .6, .025]);
      for (let k = 0; k < 3; k++) leafRing(body, 4, .22, .09, 1.1, .2 + k * .17, MAT.leaf, k * .7);
      for (let k = 0; k < 4; k++) fruits.push(part(body, G.sph, MAT.tomato, [Math.cos(k * 1.7) * .13, .25 + k * .1, Math.sin(k * 1.7) * .13], [.065, .06, .065]));
      break;
    case 'corn':
      part(body, G.cyl, MAT.stem, [0, .7, 0], [.035, 1.4, .035]);
      for (let k = 0; k < 6; k++) { const h = new THREE.Group(); h.rotation.y = k * 2.4; h.position.y = .25 + k * .2; body.add(h);
        part(h, G.leaf, MAT.leaf, [0, .1, .2], [.05, .03, .26], [-.5, 0, 0]); }
      part(body, G.cone, MAT.yellowFlower, [0, 1.48, 0], [.06, .18, .06]);
      for (let k = 0; k < 2; k++) { const cob = new THREE.Group(); cob.position.set(Math.cos(k * 3) * .06, .75 + k * .2, Math.sin(k * 3) * .06); cob.rotation.z = k ? -.35 : .35; body.add(cob);
        part(cob, G.sph, MAT.corn, [0, 0, 0], [.05, .14, .05]); part(cob, G.cone, MAT.husk, [0, -.06, 0], [.06, .2, .06]); fruits.push(cob); }
      break;
    case 'strawberry':
      leafRing(body, 6, .22, .1, 1.15, .05, MAT.leaf);
      leafRing(body, 4, .16, .08, .8, .08, MAT.leafDark, .5);
      for (let k = 0; k < 2; k++) part(body, G.sph, MAT.flower, [Math.cos(k * 2.5) * .1, .15, Math.sin(k * 2.5) * .1], [.035, .015, .035]);
      for (let k = 0; k < 4; k++) fruits.push(part(body, G.cone, MAT.straw, [Math.cos(k * 1.6 + .4) * .16, .06, Math.sin(k * 1.6 + .4) * .16], [.05, .08, .05], [Math.PI, 0, 0]));
      break;
    case 'pumpkin':
    case 'watermelon': {
      for (let k = 0; k < 5; k++) { const h = new THREE.Group(); h.rotation.y = k * 1.25; body.add(h);
        part(h, G.cyl, MAT.stem, [0, .03, .22], [.012, .44, .012], [Math.PI / 2, 0, 0]);
        part(h, G.leaf, MAT.leaf, [.05, .08, .38], [.13, .03, .12]); part(h, G.leaf, MAT.leafDark, [-.05, .08, .18], [.1, .03, .09]); }
      const f = new THREE.Group(); f.position.set(.05, .14, 0); body.add(f);
      if (key === 'pumpkin') { for (let k = 0; k < 6; k++) part(f, G.sph, MAT.pumpkin, [Math.cos(k / 6 * Math.PI * 2) * .06, 0, Math.sin(k / 6 * Math.PI * 2) * .06], [.13, .14, .13]); part(f, G.cyl, MAT.stem, [0, .15, 0], [.02, .08, .02]); }
      else part(f, G.sph, MAT.melon, [0, 0, 0], [.22, .17, .17]);
      fruits.push(f);
      break;
    }
  }
  root.userData.fruits = fruits;
  fruits.forEach(f => f.userData.s0 = f.scale.clone());   // 果子原来的大小
  let wasDead = null;
  function set(g, phase) {
    const dead = phase === 'withered';
    sprout.visible = !dead && phase === 'grow' && g < .35;
    if (sprout.visible) sprout.scale.setScalar(.5 + g * 2);
    body.visible = dead || phase !== 'grow' || g >= .25;
    // 第一次长大：从小到大；摘过以后植物保持大小，只有果子重新长
    body.scale.setScalar(phase === 'grow' ? THREE.MathUtils.clamp((g - .25) / .65, .15, 1) : 1);
    if (dead !== wasDead) {                       // 枯萎了：整棵变成枯黄色、歪下去
      wasDead = dead; body.rotation.z = dead ? .35 : 0;
      body.traverse(o => { if (!o.isMesh) return; if (o.userData.base === undefined) o.userData.base = o.material;
        const leafy = [MAT.leaf, MAT.leafDark, MAT.leafLight, MAT.stem].includes(o.userData.base);
        o.material = dead ? (leafy ? MAT.deadLeaf : MAT.dead) : o.userData.base; });
    }
    // 果子：成熟前小小的，成熟时最大
    const fg = phase === 'grow' ? THREE.MathUtils.clamp((g - .6) / .4, 0, 1) : phase === 'regrow' ? g : phase === 'ripe' ? 1 : 0;
    fruits.forEach(f => { f.visible = !dead && fg > .02; f.scale.copy(f.userData.s0).multiplyScalar(.25 + fg * .75); });
    if (parts.spuds) parts.spuds.forEach(sp => sp.visible = phase === 'ripe');
    if (parts.bulb) parts.bulb.scale.set(.13 * (.3 + .7 * fg), .12 * (.3 + .7 * fg), .13 * (.3 + .7 * fg));
    if (parts.top) parts.top.visible = fg > .3;
  }
  return { root, set };

}

// 虫子：小小的绿毛毛虫，在田里慢慢爬
function buildBug() {
  const g = new THREE.Group();
  for (let k = 0; k < 4; k++) part(g, G.sph, k === 3 ? MAT.bugHead : MAT.bug, [0, .035, -k * .045 + .07], [.035, .032, .035]);
  part(g, G.sph, MAT.eye, [.018, .055, .105], [.008, .008, .008]); part(g, G.sph, MAT.eye, [-.018, .055, .105], [.008, .008, .008]);
  g.scale.setScalar(1.6);
  return g;
}

// ---------- 菜园 ----------
// plot：所在的空地（中心、大小、朝向）；菜园放在空地靠门口的一半
export function createGarden({ scene, plot, rnd = Math.random, save = true }) {
  const BED_W = 2.6, BED_D = 1.2, GAP_X = .9, GAP_Z = 1.1, COLS = 4;
  const c = Math.cos(plot.rot), s = Math.sin(plot.rot);
  const toWorld = (lx, lz) => [plot.x + lx * c + lz * s, plot.z - lx * s + lz * c];
  const toLocal = (x, z) => { const dx = x - plot.x, dz = z - plot.z; return [dx * c - dz * s, dx * s + dz * c]; };
  const group = new THREE.Group(); group.position.set(plot.x, 0, plot.z); group.rotation.y = plot.rot; scene.add(group);

  const KEY = 'xcn_garden_v1';
  let st = null;
  try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (!st || !st.beds) st = { level: 1, speed: 1, coins: 0, beds: [], bag: null, t: Date.now() };
  while (st.beds.length < LEVELS[4]) st.beds.push({ crop: null, g: 0, phase: 'grow', plants: PER_BED, picks: 0, moist: 0, bugs: 0, eat: 0 });
  const bag = createBag();
  if (st.bag) bag.slots = st.bag; else { bag.add('seed_radish', 6); bag.add('seed_lettuce', 4); bag.add('seed_carrot', 2); }   // 刚领到菜园送的种子
  function persist() { if (!save) return; st.bag = bag.slots; st.t = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  // 小牌子
  {
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const g = cv.getContext('2d');
    g.fillStyle = '#c99a5b'; g.fillRect(0, 0, 256, 96); g.strokeStyle = '#7a5230'; g.lineWidth = 8; g.strokeRect(4, 4, 248, 88);
    g.fillStyle = '#4a2e14'; g.font = 'bold 44px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('🥕 我的菜园', 128, 50);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Group(); sign.position.set(-COLS * (BED_W + GAP_X) / 2 - .8, 0, plot.size / 2 - 2.2); group.add(sign);
    part(sign, G.cyl, MAT.wood, [0, .6, 0], [.06, 1.2, .06]);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .52), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide })); board.position.y = 1.25; sign.add(board);
  }

  // 每块田：木框 + 土（颜色跟着水分变） + 5 棵菜 + 虫子
  const frameMat = M(0x8b5a2b), DRY = new THREE.Color(0xc29a66), WET = new THREE.Color(0x4a2c17);
  const beds = st.beds.map((b, i) => {
    const col = i % COLS, row = Math.floor(i / COLS);
    const lx = (col - (COLS - 1) / 2) * (BED_W + GAP_X), lz = plot.size / 2 - 4 - row * (BED_D + GAP_Z);
    const g = new THREE.Group(); g.position.set(lx, 0, lz); group.add(g);
    const soilMat = M(0xc29a66, { roughness: 1 });
    const soil = part(g, G.box, soilMat, [0, .14, 0], [BED_W - .16, .2, BED_D - .16]); soil.castShadow = false; soil.receiveShadow = true;
    [[0, BED_D / 2 - .05, BED_W, .1], [0, -BED_D / 2 + .05, BED_W, .1]].forEach(([x, z, w, d]) => part(g, G.box, frameMat, [x, .14, z], [w, .28, d]));
    [[BED_W / 2 - .05, 0], [-BED_W / 2 + .05, 0]].forEach(([x, z]) => part(g, G.box, frameMat, [x, .14, z], [.1, .28, BED_D - .2]));
    // 土上面一道道小沟
    for (let k = 0; k < 3; k++) { const r = part(g, G.box, M(0x000000, { transparent: true, opacity: .08 }), [0, .245, (k - 1) * .3], [BED_W - .3, .005, .06]); r.castShadow = false; }
    const plantsG = new THREE.Group(); plantsG.position.y = .24; g.add(plantsG);
    const bugsG = new THREE.Group(); bugsG.position.y = .24; g.add(bugsG);
    const [wx, wz] = toWorld(lx, lz);
    return { i, st: b, g, soilMat, plantsG, bugsG, plants: [], bugs: [], key: null, lx, lz, wx, wz };
  });

  function rebuildPlants(bd) {
    bd.plantsG.clear(); bd.plants = [];
    const b = bd.st; bd.key = b.crop;
    if (!b.crop) return;
    for (let k = 0; k < PER_BED; k++) {
      const p = buildPlant(b.crop); p.root.position.set((k - 2) * .48, 0, (k % 2 ? .12 : -.12)); p.root.rotation.y = k * 1.3;
      p.root.scale.setScalar(b.crop === 'pumpkin' || b.crop === 'watermelon' ? 1.25 : 1);
      bd.plantsG.add(p.root); bd.plants.push(p);
    }
  }
  function syncBugs(bd) {
    while (bd.bugs.length < bd.st.bugs) { const bug = buildBug(); bug.userData = { a: rnd() * 6.28, x: (rnd() - .5) * (BED_W - .6), z: (rnd() - .5) * (BED_D - .5), sp: .1 + rnd() * .1 }; bd.bugsG.add(bug); bd.bugs.push(bug); }
    while (bd.bugs.length > bd.st.bugs) bd.bugsG.remove(bd.bugs.pop());
  }

  // ---------- 时间往前走（游戏秒） ----------
  function stepBed(b, gs) {
    b.moist = Math.max(0, b.moist - gs / DRY_TIME);
    if (!b.crop) { b.bugs = 0; return null; }
    const C = CROPS[b.crop];
    let event = null;
    if (b.phase === 'grow' || b.phase === 'regrow') {
      b.g += gs * growRate(b) / (b.phase === 'grow' ? C.grow : C.regrow);
      if (b.g >= 1) { b.g = 1; b.phase = 'ripe'; event = 'ripe'; }
    }
    if (b.phase !== 'withered') {
      // 虫子：随机来，越来越多（最多 5 只）
      if (b.bugs < BUG_MAX && rnd() < 1 - Math.exp(-gs / BUG_EVERY)) { b.bugs++; event = event || 'bug'; }
      // 虫子吃菜：虫越多吃得越快
      if (b.bugs > 0) {
        b.eat += gs * b.bugs;
        while (b.eat >= BUG_EAT && b.plants > 0) { b.eat -= BUG_EAT; b.plants--; event = 'eaten'; }
        if (b.plants <= 0) { Object.assign(b, { crop: null, g: 0, phase: 'grow', plants: PER_BED, picks: 0, bugs: 0, eat: 0 }); event = 'allEaten'; }
      } else b.eat = 0;
    }
    return event;
  }
  // 下线这段时间也要长（按 1 倍速度补上，最多补 2 天；分小步算）
  {
    const away = Math.min(2 * 86400, Math.max(0, (Date.now() - (st.t || Date.now())) / 1000));
    for (let left = away; left > 0; left -= 60) st.beds.forEach(b => stepBed(b, Math.min(60, left)));
  }

  const listeners = [];
  const on = fn => listeners.push(fn);
  const emit = (...a) => listeners.forEach(f => f(...a));
  let saveT = 0, anim = 0;
  const splashes = [];
  const dropGeo = new THREE.SphereGeometry(.05, 6, 4), dropMat = new THREE.MeshBasicMaterial({ color: 0x7cc8ff, transparent: true, opacity: .85 });
  function splash(bd) {
    for (let k = 0; k < 26; k++) {
      const d = new THREE.Mesh(dropGeo, dropMat); d.position.set((rnd() - .5) * BED_W, 1.2 + rnd() * .4, (rnd() - .5) * BED_D);
      d.userData = { vy: -1 - rnd() * 2, life: .5 + rnd() * .4 }; bd.g.add(d); splashes.push({ d, bd });
    }
  }

  function update(dt) {
    anim += dt;
    const gs = dt * st.speed;
    const active = LEVELS[st.level];
    beds.forEach((bd, i) => {
      const on = i < active; bd.g.visible = on;
      if (!on) return;
      const ev = stepBed(bd.st, gs);
      if (ev) emit(ev, bd);
      if (bd.key !== bd.st.crop) rebuildPlants(bd);
      // 被吃掉的菜不见了
      bd.plants.forEach((p, k) => { p.root.visible = k < bd.st.plants; p.set(bd.st.g, bd.st.phase); });
      bd.soilMat.color.copy(DRY).lerp(WET, bd.st.moist);
      bd.soilMat.roughness = 1 - bd.st.moist * .45;
      syncBugs(bd);
      bd.bugs.forEach(bug => {
        const u = bug.userData; u.a += (Math.sin(anim * .7 + u.x * 9) * .8) * dt;
        u.x = THREE.MathUtils.clamp(u.x + Math.sin(u.a) * u.sp * dt, -BED_W / 2 + .25, BED_W / 2 - .25);
        u.z = THREE.MathUtils.clamp(u.z + Math.cos(u.a) * u.sp * dt, -BED_D / 2 + .2, BED_D / 2 - .2);
        bug.position.set(u.x, .02 + Math.abs(Math.sin(anim * 6 + u.a)) * .01, u.z); bug.rotation.y = u.a;
        bug.scale.set(1.6, 1.6, 1.6 * (1 + Math.sin(anim * 8 + u.a) * .12));
      });
    });
    for (let k = splashes.length - 1; k >= 0; k--) {
      const { d, bd } = splashes[k]; d.userData.vy -= 9 * dt; d.position.y += d.userData.vy * dt; d.userData.life -= dt;
      if (d.position.y < .25 || d.userData.life <= 0) { bd.g.remove(d); splashes.splice(k, 1); }
    }
    saveT += dt; if (saveT > 2) { saveT = 0; persist(); }
  }

  // 站在哪块田旁边
  function nearest(x, z) {
    const [lx, lz] = toLocal(x, z), active = LEVELS[st.level];
    let best = null, bd = Infinity;
    beds.forEach((b, i) => {
      if (i >= active) return;
      const dx = Math.max(0, Math.abs(lx - b.lx) - BED_W / 2), dz = Math.max(0, Math.abs(lz - b.lz) - BED_D / 2), d = Math.hypot(dx, dz);
      if (d < 1.1 && d < bd) { bd = d; best = b; }
    });
    return best;
  }
  // 田是挡路的（矮木框），跳起来可以跨过去
  function collide(pos, pr = .45) {
    if (pos.y > .45) return;
    const [lx, lz] = toLocal(pos.x, pos.z), active = LEVELS[st.level];
    if (Math.abs(lx) > 12 || lz > plot.size / 2 || lz < plot.size / 2 - 20) return;
    let px = lx, pz = lz;
    beds.forEach((b, i) => {
      if (i >= active) return;
      const hx = BED_W / 2 + pr, hz = BED_D / 2 + pr, dx = px - b.lx, dz = pz - b.lz;
      const ox = hx - Math.abs(dx), oz = hz - Math.abs(dz);
      if (ox > 0 && oz > 0) { if (ox < oz) px = b.lx + Math.sign(dx || 1) * hx; else pz = b.lz + Math.sign(dz || 1) * hz; }
    });
    if (px !== lx || pz !== lz) { const [wx, wz] = toWorld(px, pz); pos.x = wx; pos.z = wz; }
  }

  // ---------- 现在按 E 会做什么 ----------
  let shooCd = 0;
  function actionFor(bd) {
    const b = bd.st;
    if (b.crop && b.bugs > 0) return { kind: 'shoo', label: `赶走虫子（还有 ${b.bugs} 只）` };
    if (b.crop && b.phase === 'ripe') return { kind: 'harvest', label: CROPS[b.crop].kind === 'pull' ? `拔${CROPS[b.crop].name}` : `摘${CROPS[b.crop].name}` };
    if (b.crop && b.phase === 'withered') return { kind: 'clear', label: '拔掉枯掉的苗' };
    if (!b.crop) return { kind: 'plant', label: '种菜' };
    return { kind: 'water', label: '浇水' };
  }
  // 这块田的状态说明
  function describe(bd) {
    const b = bd.st;
    const wet = Math.round(b.moist * 100);
    if (!b.crop) return `空的田 · 水分 ${wet}%`;
    const C = CROPS[b.crop], parts = [`${C.icon} ${C.name}`];
    if (b.phase === 'withered') parts.push('已经枯萎');
    else if (b.phase === 'ripe') parts.push('成熟啦！');
    else {
      const rate = growRate(b), total = b.phase === 'grow' ? C.grow : C.regrow;
      parts.push((b.phase === 'regrow' ? '又在结果 ' : '') + Math.floor(b.g * 100) + '%');
      if (rate <= 0) parts.push('太干了，不长了');
      else { const sec = (1 - b.g) * total / rate / st.speed; parts.push('还要 ' + fmt(sec)); }
    }
    parts.push(`水分 ${wet}%`);
    if (b.plants < PER_BED) parts.push(`被虫吃掉 ${PER_BED - b.plants} 棵`);
    if (C.kind === 'pick' && b.phase !== 'withered') parts.push(`还能结 ${C.picks - b.picks} 次`);
    return parts.join(' · ');
  }
  const fmt = sec => sec < 60 ? Math.ceil(sec) + ' 秒' : sec < 3600 ? Math.ceil(sec / 60) + ' 分钟' : (sec / 3600).toFixed(1) + ' 小时';

  // 执行；返回给玩家看的一句话（或 { pick: true } 表示要选种子）
  function act(bd, seedKey) {
    const b = bd.st, a = actionFor(bd);
    if (a.kind === 'shoo') {
      if (shooCd > performance.now()) return { msg: '🐛 慢慢来…', soft: true };
      shooCd = performance.now() + SHOO_CD * 1000; b.bugs--; syncBugs(bd);
      return { msg: b.bugs ? `👋 赶走了一只虫子，还有 ${b.bugs} 只` : '👋 虫子都赶走啦！' };
    }
    if (a.kind === 'water') { b.moist = 1; splash(bd); return { msg: '💧 浇好水了，土变湿了' }; }
    if (a.kind === 'plant') {
      if (!seedKey) return { pick: true };
      const C = CROPS[seedKey];
      if (C.lv > st.level) return { msg: `🔒 ${C.name}要菜园 ${C.lv} 级才能种` };
      if (!bag.take('seed_' + seedKey)) return { msg: `没有${C.name}种子了` };
      Object.assign(b, { crop: seedKey, g: 0, phase: 'grow', plants: PER_BED, picks: 0, bugs: 0, eat: 0 });
      rebuildPlants(bd);
      return { msg: `🌱 种下了 ${PER_BED} 棵${C.name}${b.moist < .05 ? '，记得浇水哦' : ''}` };
    }
    if (a.kind === 'clear') { Object.assign(b, { crop: null, g: 0, phase: 'grow', plants: PER_BED, picks: 0, bugs: 0, eat: 0 }); rebuildPlants(bd); return { msg: '🧹 枯苗拔掉了，可以种新的了' }; }
    if (a.kind === 'harvest') {
      const C = CROPS[b.crop], n = b.plants * C.yield, got = [[b.crop, n]];
      let seedN = 0;
      if (C.kind === 'pull') seedN = C.seeds[0] + Math.floor(rnd() * (C.seeds[1] - C.seeds[0] + 1));
      const lastPick = C.kind === 'pick' && b.picks + 1 >= C.picks;
      if (lastPick && rnd() < C.witherSeed) seedN = 1 + Math.floor(rnd() * 2);
      if (seedN) got.push(['seed_' + b.crop, seedN]);
      if (!bag.addAll(got)) return { msg: '🎒 背包满了，装不下了' };
      const name = C.name;
      let msg = `${C.icon} ${C.kind === 'pull' ? '拔' : '摘'}到 ${n} 个${name}` + (seedN ? `，还有 ${seedN} 颗种子` : '');
      if (C.kind === 'pull') { Object.assign(b, { crop: null, g: 0, phase: 'grow', plants: PER_BED, picks: 0, bugs: 0, eat: 0 }); rebuildPlants(bd); }
      else { b.picks++; if (b.picks >= C.picks) { b.phase = 'withered'; msg += '；结了好多次，它枯萎了'; } else { b.phase = 'regrow'; b.g = 0; msg += `，过一阵还会再结`; } }
      return { msg };
    }
  }

  // ---------- 管理员测试用 ----------
  const debug = {
    setLevel(l) { st.level = l; persist(); },
    setSpeed(v) { st.speed = v; persist(); },
    giveSeeds() { Object.keys(CROPS).forEach(k => { if (CROPS[k].lv <= st.level) bag.add('seed_' + k, 5); }); persist(); },
    reset() { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); },
    get level() { return st.level; }, get speed() { return st.speed; },
  };
  beds.forEach(rebuildPlants);
  return { beds, update, nearest, collide, actionFor, describe, act, bag, debug, on, get level() { return st.level; }, get speed() { return st.speed; } };
}
