// ===== 菜鸟家园 · 菜园（试玩版：数据先存在浏览器里，以后换成数据库） =====
// 规则见《菜鸟家园-功能规划》：
//   每块田 5 棵；种 → 浇水 → 长大 → 成熟才能收；不浇水就不长（不会枯死）
//   水分：刚浇完最湿、土最深色、长得最快；越干越慢，干了就停
//   虫子：不会让菜变小，但长得慢；越来越多，越多吃掉的菜越多；不会爬到别的田；按 E 一只一只赶走
//   收法：拔（整棵拔起来，给种子）/ 摘（只摘果子，不给种子；过一阵还会结，结太多次会枯萎，枯萎时小概率给几颗种子）
//   收获装进背包，背包满了就装不下
import * as THREE from 'three';

// ---------- 作物（数值以后后台可改） ----------
// grow：第一次成熟要多少秒（水分充足、没虫时按 1 倍算）；regrow：摘完再结果要多少秒；picks：能结几次 [最少, 最多]，种下时随机定
// yield：每棵每次收几个；seeds：拔的时候给几颗种子 [最少, 最多]；witherSeed：枯萎时给种子的概率
export const CROPS = {
  radish:     { name: '小萝卜', icon: '🔴', lv: 1, kind: 'pull', grow: 5 * 60,      yield: 1, seeds: [1, 2], price: 2 },
  lettuce:    { name: '生菜',   icon: '🥬', lv: 1, kind: 'pull', grow: 15 * 60,     yield: 1, seeds: [1, 2], price: 3 },
  carrot:     { name: '胡萝卜', icon: '🥕', lv: 1, kind: 'pull', grow: 30 * 60,     yield: 1, seeds: [1, 2], price: 4 },
  potato:     { name: '土豆',   icon: '🥔', lv: 1, kind: 'pull', grow: 60 * 60,     yield: 2, seeds: [1, 3], price: 4 },
  tomato:     { name: '番茄',   icon: '🍅', lv: 2, kind: 'pick', grow: 90 * 60,     regrow: 40 * 60, picks: [3, 5], yield: 2, witherSeed: .2, price: 6 },
  corn:       { name: '玉米',   icon: '🌽', lv: 2, kind: 'pick', grow: 120 * 60,    regrow: 60 * 60, picks: [1, 3], yield: 1, witherSeed: .2, price: 8 },
  strawberry: { name: '草莓',   icon: '🍓', lv: 3, kind: 'pick', grow: 180 * 60,    regrow: 60 * 60, picks: [4, 6], yield: 2, witherSeed: .2, price: 8 },
  pumpkin:    { name: '南瓜',   icon: '🎃', lv: 3, kind: 'pick', grow: 6 * 3600,    regrow: 3 * 3600, picks: [1, 3], yield: 1, witherSeed: .2, price: 40 },
  // 果树：一块田种一棵；长得慢，但能结很多次（一次结 5 个果子，樱桃 10 个）
  apple:      { name: '苹果',   icon: '🍎', lv: 2, kind: 'tree', tree: '苹果树', grow: 24 * 3600, regrow: 4 * 3600, picks: [10, 14], yield: 1, witherSeed: .2, price: 6, fruit: 0xd8312b },
  orange:     { name: '橘子',   icon: '🍊', lv: 3, kind: 'tree', tree: '橘子树', grow: 24 * 3600, regrow: 5 * 3600, picks: [10, 14], yield: 1, witherSeed: .2, price: 7, fruit: 0xff9a1f },
  peach:      { name: '桃子',   icon: '🍑', lv: 3, kind: 'tree', tree: '桃树',   grow: 36 * 3600, regrow: 6 * 3600, picks: [8, 12],  yield: 1, witherSeed: .2, price: 10, fruit: 0xffa38a },
  cherry:     { name: '樱桃',   icon: '🍒', lv: 4, kind: 'tree', tree: '樱桃树', grow: 48 * 3600, regrow: 6 * 3600, picks: [8, 12],  yield: 2, witherSeed: .2, price: 6, fruit: 0xa3101e },
  watermelon: { name: '西瓜',   icon: '🍉', lv: 4, kind: 'pick', grow: 10 * 3600,   regrow: 5 * 3600, picks: [1, 3], yield: 1, witherSeed: .1, price: 70 },
};
// 菜园等级：田的数量（第 1 级 12 块，以后每级多 4 块）
export const LEVELS = { 1: 12, 2: 16, 3: 20, 4: 24 };
const PER_BED = 5;
const DRY_TIME = 3 * 3600;          // 浇一次水，大约 3 小时从全湿到全干
// 虫子规则（用户定的）：
//   菜园里没有别的虫时，一棵菜长一轮大约 40%~60% 会来一只虫；菜园里种的菜越多越容易来，菜很少就不太来
//   菜园里已经有虫了，新虫来得更勤；虫越多越容易来
//   一块田里虫太多会互相打架，慢慢减少到一定数量，然后开始往外飞（飞到别的田，或者飞走）
//   所以空的田也会有虫，但比种了菜的田少；空田上的虫不吃东西
const BUG_FIGHT = 6;                // 一块田虫子到 6 只就开始打架
const BUG_CALM = 3;                 // 打到剩 3 只左右就不打了
const BUG_FLY = 4;                  // 4 只以上开始有虫往外飞
const BUG_HARD_MAX = 9;
const EMPTY_BUG = 8 * 3600;         // 空田：没有别的虫时，平均 8 小时才可能来一只
const BUG_EAT = 30 * 60;            // 1 只虫 30 分钟吃掉 1 棵；虫越多吃得越快
const SHOO_CD = .9;                 // 用手赶虫很慢：每赶走一只要等一会儿

// 生长速度跟着水分走：0 → 停，50% → 1 倍，100% → 1.5 倍；每只虫慢 12%
export function growRate(b) {
  const m = b.moist, w = m <= .5 ? m * 2 : 1 + (m - .5);
  return w * Math.max(.2, 1 - .12 * b.bugs);
}

// ---------- 背包 ----------
export function createBag(cap = 7, stack = 50) {   // 快捷栏一共 9 格：水壶、手套 + 背包 7 格
  const bag = { cap, stack, slots: [] };   // slots[i] 是 { key, n } 或 null（空格子）；格子位置固定
  const used = () => bag.slots.filter(Boolean).length;
  const count = key => bag.slots.reduce((n, s) => n + (s && s.key === key ? s.n : 0), 0);
  function room(key) {
    let r = 0; bag.slots.forEach(s => { if (s && s.key === key) r += stack - s.n; });
    return r + (cap - used()) * stack;
  }
  function add(key, n) {
    if (room(key) < n) return false;
    for (const s of bag.slots) if (s && s.key === key && s.n < stack) { const k = Math.min(n, stack - s.n); s.n += k; n -= k; if (!n) return true; }
    while (n > 0) {
      const k = Math.min(n, stack), i = bag.slots.indexOf(null);
      if (i >= 0) bag.slots[i] = { key, n: k }; else bag.slots.push({ key, n: k });
      n -= k;
    }
    return true;
  }
  function take(key, n = 1) {
    if (count(key) < n) return false;
    for (let i = bag.slots.length - 1; i >= 0 && n; i--) { const s = bag.slots[i]; if (!s || s.key !== key) continue; const k = Math.min(n, s.n); s.n -= k; n -= k; if (!s.n) bag.slots[i] = null; }
    while (bag.slots.length && !bag.slots[bag.slots.length - 1]) bag.slots.pop();
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
  if (key.startsWith('seed_')) { const c = CROPS[key.slice(5)]; return { icon: '🌱', sub: c.icon, name: c.kind === 'tree' ? c.tree + '苗' : c.name + '种子', seed: true }; }
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
    case 'apple': case 'orange': case 'peach': case 'cherry': {
      const C = CROPS[key], bark = MAT.wood, fm = M(C.fruit, { roughness: .35 });
      part(body, G.cyl, bark, [0, .75, 0], [.09, 1.5, .09]);
      part(body, G.cyl, bark, [.18, 1.2, 0], [.04, .5, .04], [0, 0, -.7]);
      part(body, G.cyl, bark, [-.15, 1.3, .05], [.035, .45, .035], [.2, 0, .7]);
      const leaves = key === 'peach' ? MAT.leafLight : key === 'cherry' ? MAT.leafDark : MAT.leaf;
      [[0, 2.0, 0, .75], [.45, 1.75, .15, .5], [-.42, 1.8, -.1, .52], [.1, 1.75, -.45, .5], [-.1, 1.8, .45, .5], [0, 2.45, 0, .45]].forEach(([x, y, z, r]) =>
        part(body, G.leaf, leaves, [x, y, z], [r, r * .85, r]));
      // 果子挂在树冠外面
      for (let k = 0; k < (key === 'cherry' ? 14 : 9); k++) {
        const a = k * 2.4, h = 1.5 + (k % 3) * .3, rr = .62 + (k % 2) * .12;
        const f = part(body, G.sph, fm, [Math.cos(a) * rr, h, Math.sin(a) * rr], key === 'cherry' ? [.05, .05, .05] : [.1, .1, .1]);
        fruits.push(f);
      }
      break;
    }
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

// ---------- 菜园的位置：在自家空地旁边多围出来的一块地（空地本身留着盖房子） ----------
const BED_W = 1.9, BED_D = 1.9, GAP_X = .3, GAP_Z = .3, COLS = 4, MARGIN = 1, SIDE_GAP = 3;   // 正方形的田，田和田之间只留一条窄缝
const rowsOf = level => LEVELS[level] / COLS;
const SPOTS = [[-.5, -.5], [.5, -.5], [0, 0], [-.5, .5], [.5, .5]];   // 一块田里 5 棵菜的位置
export const gardenSize = level => ({ w: COLS * BED_W + (COLS - 1) * GAP_X + MARGIN * 2, d: rowsOf(level) * BED_D + (rowsOf(level) - 1) * GAP_Z + MARGIN * 2 });
// 菜园这块地在空地的哪一边（-1 左 / 1 右），以空地自己的坐标算
export function gardenRect(plot, side, level = 4) {
  const { w, d } = gardenSize(level), h = plot.size / 2;
  const x0 = side > 0 ? h + SIDE_GAP : -h - SIDE_GAP - w;
  const xn = side > 0 ? x0 : x0 + w;          // 靠空地的那条边
  return { x0, x1: x0 + w, z1: h, z0: h - d, cx: x0 + w / 2, xn, gz: h - 3 };   // 前边（z1）和空地门口那边对齐；门在靠空地那条边上，离前边 3 米
}
export function plotToWorld(plot, lx, lz) { const c = Math.cos(plot.rot), s = Math.sin(plot.rot); return [plot.x + lx * c + lz * s, plot.z - lx * s + lz * c]; }
export function worldToPlot(plot, x, z) { const dx = x - plot.x, dz = z - plot.z, c = Math.cos(plot.rot), s = Math.sin(plot.rot); return [dx * c - dz * s, dx * s + dz * c]; }
// 选一边：最大的菜园（4 级）也不会压到路、别人的空地
export function chooseSide(plot, isBlocked) {
  for (const side of [1, -1]) {
    const r = gardenRect(plot, side, 4); let ok = true;
    for (let lx = r.x0 - 1; lx <= r.x1 + 1 && ok; lx += 1.5) for (let lz = r.z0 - 1; lz <= r.z1 + 1 && ok; lz += 1.5) {
      const [x, z] = plotToWorld(plot, lx, lz); if (isBlocked(x, z)) ok = false;
    }
    if (ok) return side;
  }
  return 1;
}
// 某个世界坐标点是不是在菜园范围里（种花种草时避开）
export function inGarden(plot, side, x, z, m = 0) {
  const r = gardenRect(plot, side, 4), [lx, lz] = worldToPlot(plot, x, z);
  return lx > r.x0 - m && lx < r.x1 + m && lz > r.z0 - m && lz < r.z1 + m + 2.5;
}

// 飘在田上面的小图标（💧 要浇水 / 🐛 有虫 / ✨ 熟了）
const iconTex = {};
function iconSprite(ch) {
  if (!iconTex[ch]) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.arc(64, 60, 50, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(50, 104); g.lineTo(78, 104); g.lineTo(64, 124); g.fill();
    g.font = '64px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(ch, 64, 64);
    iconTex[ch] = new THREE.CanvasTexture(c); iconTex[ch].colorSpace = THREE.SRGBColorSpace;
  }
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: iconTex[ch], depthTest: false, transparent: true }));
  sp.scale.setScalar(.85); sp.renderOrder = 5; return sp;
}
function textSprite(text) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d');
  g.font = 'bold 56px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 10; g.strokeStyle = 'rgba(60,40,10,.85)'; g.strokeText(text, 128, 50); g.fillStyle = '#fff6c8'; g.fillText(text, 128, 50);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, depthTest: false, transparent: true })); sp.scale.set(2.2, .82, 1); sp.renderOrder = 6; return sp;
}

// ---------- 菜园 ----------
export function createGarden({ scene, plot, side = 1, rnd = Math.random, save = true }) {
  const toWorld = (lx, lz) => plotToWorld(plot, lx, lz);
  const toLocal = (x, z) => worldToPlot(plot, x, z);
  const group = new THREE.Group(); group.position.set(plot.x, 0, plot.z); group.rotation.y = plot.rot; scene.add(group);

  const KEY = 'xcn_garden_v1';
  let st = null;
  try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (!st || !st.beds) st = { level: 1, speed: 1, beds: [], bag: null, t: Date.now() };
  while (st.beds.length < LEVELS[4]) st.beds.push({ crop: null, g: 0, phase: 'grow', plants: PER_BED, picks: 0, moist: 0, bugs: 0, eat: 0 });
  const bag = createBag();
  // 以前存的背包可能比 7 格多，多出来的放不下；第一次来送一些种子
  if (st.bag) bag.slots = st.bag.filter(Boolean).slice(0, bag.cap);
  else { bag.add('seed_radish', 6); bag.add('seed_lettuce', 4); bag.add('seed_carrot', 2); }
  function persist() { if (!save) return; st.bag = bag.slots; st.t = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  // ---------- 围起来的菜地：踩实的土地 + 一圈木栅栏（前面留门） + 小路连到空地门口 ----------
  const yard = new THREE.Group(); group.add(yard);
  const FLAT = (color, layer) => M(color, { roughness: 1, polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer * 4 });
  const groundMat = FLAT(0xc7a678, 2), pathMat = FLAT(0xe2c696, 3), fenceMat = M(0xa8784a), railMat = M(0xc49766);
  const GATE_W = 2.4;
  let rect = null;
  function buildYard() {
    yard.clear();
    rect = gardenRect(plot, side, st.level);
    const w = rect.x1 - rect.x0, d = rect.z1 - rect.z0;
    const g = new THREE.Mesh(new THREE.PlaneGeometry(w, d), groundMat); g.rotation.x = -Math.PI / 2; g.position.set(rect.cx, .02, (rect.z0 + rect.z1) / 2); g.receiveShadow = true; yard.add(g);
    // 栅栏：四边每 1.6 米一根桩 + 两道横杆；前边中间留门
    const edges = [[rect.x0, rect.z0, rect.x1, rect.z0], [rect.x1, rect.z0, rect.x1, rect.z1], [rect.x1, rect.z1, rect.x0, rect.z1], [rect.x0, rect.z1, rect.x0, rect.z0]];
    edges.forEach(([ax, az, bx, bz], ei) => {
      const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 1.6));
      // 门：开在靠空地的那条边上（左边是第 3 条边，右边是第 1 条边）
      const gateEdge = side > 0 ? 3 : 1, gt = side > 0 ? rect.z1 - rect.gz : rect.gz - rect.z0;
      const segs = ei === gateEdge ? [[0, gt - GATE_W / 2], [gt + GATE_W / 2, len]] : [[0, len]];
      segs.forEach(([t0, t1]) => {
        const k0 = Math.ceil(t0 / (len / n) - 1e-6), k1 = Math.floor(t1 / (len / n) + 1e-6);
        for (let k = k0; k <= k1; k++) { const t = Math.min(t1, Math.max(t0, k * len / n)) / len; part(yard, G.box, fenceMat, [ax + (bx - ax) * t, .45, az + (bz - az) * t], [.12, .9, .12]); }
        if (ei === gateEdge) { const t = (t0 === 0 ? t1 : t0) / len; part(yard, G.box, fenceMat, [ax + (bx - ax) * t, .55, az + (bz - az) * t], [.16, 1.1, .16]); }   // 门两边的柱子高一点
        const ang = Math.atan2(bz - az, bx - ax), l = t1 - t0, m = (t0 + t1) / 2 / len;
        [.35, .7].forEach(y => part(yard, G.box, railMat, [ax + (bx - ax) * m, y, az + (bz - az) * m], [l, .07, .05], [0, -ang, 0]));
      });
    });
    // 从空地（盖房子的地方）走到菜园门口的小路
    const ph = plot.size / 2, pathPts = [[side * (ph - 2), rect.gz], [rect.xn + side * .8, rect.gz]];
    for (let k = 0; k < pathPts.length - 1; k++) {
      const [ax, az] = pathPts[k], [bx, bz] = pathPts[k + 1], l = Math.hypot(bx - ax, bz - az);
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.6, l + 1.6), pathMat); p.rotation.set(-Math.PI / 2, 0, Math.atan2(bx - ax, bz - az)); p.position.set((ax + bx) / 2, .025, (az + bz) / 2); p.receiveShadow = true; yard.add(p);
    }
    // 小牌子
    const cv = document.createElement('canvas'); cv.width = 256; cv.height = 96; const cg = cv.getContext('2d');
    cg.fillStyle = '#c99a5b'; cg.fillRect(0, 0, 256, 96); cg.strokeStyle = '#7a5230'; cg.lineWidth = 8; cg.strokeRect(4, 4, 248, 88);
    cg.fillStyle = '#4a2e14'; cg.font = 'bold 40px sans-serif'; cg.textAlign = 'center'; cg.textBaseline = 'middle'; cg.fillText(`🥕 我的菜园 Lv${st.level}`, 128, 50);
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Group(); sign.position.set(rect.xn - side * 1.3, 0, rect.gz + GATE_W / 2 + .5); sign.rotation.y = -side * Math.PI / 2; yard.add(sign);   // 牌子朝着空地
    part(sign, G.cyl, M(0x9b6a3c), [0, .65, 0], [.06, 1.3, .06]);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(1.5, .56), new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide })); board.position.y = 1.35; sign.add(board);
    beds.forEach((bd, i) => placeBed(bd, i));
  }

  // ---------- 每块田：平地上一块深色的土 + 一道道垄（颜色跟着水分变）+ 5 棵菜 + 虫子 ----------
  const DRY = new THREE.Color(0xb48d5c), WET = new THREE.Color(0x3f2614);
  const beds = st.beds.map((b, i) => {
    const g = new THREE.Group(); group.add(g);
    const soilMat = FLAT(0xb48d5c, 4), ridgeMat = M(0xb48d5c, { roughness: 1 });
    const soil = new THREE.Mesh(new THREE.PlaneGeometry(BED_W, BED_D), soilMat); soil.rotation.x = -Math.PI / 2; soil.position.y = .03; soil.receiveShadow = true; g.add(soil);
    const plantsG = new THREE.Group(); plantsG.position.y = .035; g.add(plantsG);
    const bugsG = new THREE.Group(); bugsG.position.y = .035; g.add(bugsG);
    const icon = new THREE.Group(); icon.position.y = 2.1; g.add(icon);
    return { i, st: b, g, soilMat, ridgeMat, plantsG, bugsG, icon, iconCh: null, plants: [], bugs: [], key: null, lx: 0, lz: 0, wx: 0, wz: 0 };
  });
  function placeBed(bd, i) {
    const col = i % COLS, row = Math.floor(i / COLS);
    bd.lx = rect.cx + (col - (COLS - 1) / 2) * (BED_W + GAP_X);
    bd.lz = rect.z1 - MARGIN - BED_D / 2 - row * (BED_D + GAP_Z);
    bd.g.position.set(bd.lx, 0, bd.lz);
    [bd.wx, bd.wz] = toWorld(bd.lx, bd.lz);
  }

  function rebuildPlants(bd) {
    bd.plantsG.clear(); bd.plants = [];
    const b = bd.st; bd.key = b.crop;
    if (!b.crop) return;
    if (CROPS[b.crop].kind === 'tree') {   // 果树：一块田一棵，种在正中间
      const p = buildPlant(b.crop); p.tree = true; bd.plantsG.add(p.root); bd.plants.push(p); return;
    }
    for (let k = 0; k < PER_BED; k++) {
      const p = buildPlant(b.crop); p.root.position.set(SPOTS[k][0], 0, SPOTS[k][1]); p.root.rotation.y = k * 1.3;
      p.root.scale.setScalar(b.crop === 'pumpkin' || b.crop === 'watermelon' ? 1.6 : 1.35);   // 菜做大一点，长的过程看得清楚
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
    if (!b.crop) { b.eat = 0; return null; }
    const C = CROPS[b.crop];
    let event = null;
    if (b.phase === 'grow' || b.phase === 'regrow') {
      b.g += gs * growRate(b) / (b.phase === 'grow' ? C.grow : C.regrow);
      if (b.g >= 1) { b.g = 1; b.phase = 'ripe'; event = 'ripe'; }
    }
    if (b.phase !== 'withered') {
      if (b.bugs > 0) {
        b.eat += gs * b.bugs;
        const floor = C.kind === 'tree' ? 1 : 0;   // 果树不会被吃掉，只是果子变少
        while (b.eat >= BUG_EAT && b.plants > floor) { b.eat -= BUG_EAT; b.plants--; event = 'eaten'; }
        if (b.plants <= 0) { Object.assign(b, { crop: null, g: 0, phase: 'grow', plants: PER_BED, picks: 0, eat: 0 }); event = 'allEaten'; }
      } else b.eat = 0;
    }
    return event;
  }
  // 旁边的田（上下左右）
  const neighbors = (list, b) => { const i = list.indexOf(b), c = i % COLS, r = Math.floor(i / COLS), rows = list.length / COLS;
    return [[c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1]].filter(([x, y]) => x >= 0 && x < COLS && y >= 0 && y < rows).map(([x, y]) => list[y * COLS + x]); };
  // 虫子从一块田跑到旁边的田（70% 落到旁边的田，30% 落到菜园里随便哪块）
  function landSomewhere(list, from) {
    const nb = neighbors(list, from), to = nb.length && rnd() < .7 ? nb[Math.floor(rnd() * nb.length)] : list[Math.floor(rnd() * list.length)];
    if (to && to !== from && to.bugs < BUG_HARD_MAX) { to.bugs++; return to; }
    return null;
  }
  // 整个菜园的虫子：来虫、打架、往外飞
  const hz = (gs, per) => 1 - Math.exp(-gs / per);            // 平均 per 秒发生一次，在 gs 秒里发生的概率
  function stepBugs(list, gs) {
    const planted = list.filter(b => b.crop && b.phase !== 'withered').length;
    const density = .4 + 1.2 * planted / list.length;           // 种得少 → 0.4 倍；种满 → 1.6 倍
    const total = list.reduce((n, b) => n + b.bugs, 0);
    const crowd = 1 + .15 * Math.min(total, 10);                 // 菜园里虫越多，来得越勤（最多快 2.5 倍，免得一下子全是虫）
    const events = [];
    list.forEach(b => {
      if (b.bugs >= BUG_HARD_MAX) return;
      let per;
      if (b.crop && b.phase !== 'withered') {
        // 一轮生长里来虫的概率 p（种下时在 40%~60% 之间随机定）→ 换算成平均多久来一只
        const C = CROPS[b.crop], cycle = b.phase === 'regrow' ? C.regrow : C.grow, p = b.bugP || .5;
        per = cycle / -Math.log(1 - p) / Math.max(.2, growRate(b));   // 长得慢（缺水）时按实际要长的时间算
      } else per = EMPTY_BUG;
      if (rnd() < hz(gs, per / (density * crowd))) { b.bugs++; events.push(['bug', b]); }
    });
    list.forEach(b => {
      // 打架：太多了就慢慢减少
      if (b.bugs >= BUG_FIGHT) { if (rnd() < hz(gs, 8 * 60 / (b.bugs - BUG_CALM))) { b.bugs--; events.push(['fight', b]); } }
      // 往外飞：一部分落到别的田（包括空田），一部分飞走
      if (b.bugs >= BUG_FLY && rnd() < hz(gs, 15 * 60)) {
        b.bugs--;
        if (rnd() < .6) { const to = landSomewhere(list, b); if (to) events.push(['flyIn', to]); }
        events.push(['flyOut', b]);
      }
    });
    return events;
  }
  {
    const away = Math.min(2 * 86400, Math.max(0, (Date.now() - (st.t || Date.now())) / 1000));
    const list = st.beds.slice(0, LEVELS[st.level]);
    for (let left = away; left > 0; left -= 60) { const g = Math.min(60, left); list.forEach(b => stepBed(b, g)); stepBugs(list, g); }
  }

  const listeners = [];
  const on = fn => listeners.push(fn);
  const emit = (...a) => listeners.forEach(f => f(...a));
  let saveT = 0, anim = 0;
  const fx = [];
  const dropGeo = new THREE.SphereGeometry(.05, 6, 4), dropMat = new THREE.MeshBasicMaterial({ color: 0x7cc8ff, transparent: true, opacity: .85 });
  const seedMat = new THREE.MeshBasicMaterial({ color: 0xe8c77a });
  function burst(bd, mat, n, y0) {
    for (let k = 0; k < n; k++) {
      const d = new THREE.Mesh(dropGeo, mat); d.position.set((rnd() - .5) * BED_W, y0 + rnd() * .4, (rnd() - .5) * BED_D);
      d.userData = { vy: -1 - rnd() * 2, life: .5 + rnd() * .4 }; bd.g.add(d); fx.push({ d, bd });
    }
  }
  // 收获时飘起来的 "+5 🥕"
  const pops = [];
  function pop(bd, text) { const sp = textSprite(text); sp.position.set(0, 1.2, 0); bd.g.add(sp); pops.push({ sp, bd, t: 0 }); }

  const flyers = [];
  function flyAway(bd) {
    const bug = buildBug(); bug.position.set((rnd() - .5) * BED_W, .1, (rnd() - .5) * BED_D); bd.g.add(bug);
    flyers.push({ bug, bd, t: 0, dx: rnd() - .5, dz: rnd() - .5 });
  }
  // 用手套抓住的虫子：缩小、消失，冒一点小灰尘
  const caught = [];
  function catchBug(bd) {
    const bug = bd.bugs[bd.bugs.length - 1]; if (!bug) return;
    bd.bugs.pop(); caught.push({ bug, bd, t: 0 });
  }
  function setIcon(bd, ch) {
    if (bd.iconCh === ch) return;
    bd.iconCh = ch; bd.icon.clear(); if (ch) bd.icon.add(iconSprite(ch));
  }

  function update(dt) {
    anim += dt;
    const gs = dt * st.speed, active = LEVELS[st.level];
    const bugEvents = stepBugs(st.beds.slice(0, active), gs);
    bugEvents.forEach(([kind, b]) => { const bd = beds.find(x => x.st === b); if (kind === 'flyOut' && bd) flyAway(bd); if (kind === 'bug' || kind === 'flyIn') emit('bug', bd); });
    beds.forEach((bd, i) => {
      const on = i < active; bd.g.visible = on;
      if (!on) return;
      const b = bd.st, ev = stepBed(b, gs);
      if (ev) emit(ev, bd);
      if (bd.key !== b.crop) rebuildPlants(bd);
      bd.plants.forEach((p, k) => { p.root.visible = p.tree || k < b.plants; p.set(b.g, b.phase); });
      bd.soilMat.color.copy(DRY).lerp(WET, b.moist); bd.ridgeMat.color.copy(bd.soilMat.color).multiplyScalar(1.08);
      syncBugs(bd);
      bd.bugs.forEach(bug => {
        const u = bug.userData; u.a += (Math.sin(anim * .7 + u.x * 9) * .8) * dt;
        u.x = THREE.MathUtils.clamp(u.x + Math.sin(u.a) * u.sp * dt, -BED_W / 2 + .25, BED_W / 2 - .25);
        u.z = THREE.MathUtils.clamp(u.z + Math.cos(u.a) * u.sp * dt, -BED_D / 2 + .2, BED_D / 2 - .2);
        bug.position.set(u.x, .04 + Math.abs(Math.sin(anim * 6 + u.a)) * .01, u.z); bug.rotation.y = u.a;
        bug.scale.set(1.8, 1.8, 1.8 * (1 + Math.sin(anim * 8 + u.a) * .12));
      });
    });
    for (let k = fx.length - 1; k >= 0; k--) {
      const { d, bd } = fx[k]; d.userData.vy -= 9 * dt; d.position.y += d.userData.vy * dt; d.userData.life -= dt;
      if (d.position.y < .06 || d.userData.life <= 0) { bd.g.remove(d); fx.splice(k, 1); }
    }
    for (let k = caught.length - 1; k >= 0; k--) {
      const c = caught[k]; c.t += dt; const s0 = Math.max(0, 1 - c.t / .35);
      c.bug.scale.setScalar(1.8 * s0); c.bug.position.y += dt * .3;
      if (c.t > .35) { c.bd.bugsG.remove(c.bug); caught.splice(k, 1); }
    }
    for (let k = flyers.length - 1; k >= 0; k--) {
      const f = flyers[k]; f.t += dt;
      f.bug.position.x += f.dx * dt * 2; f.bug.position.z += f.dz * dt * 2; f.bug.position.y = .1 + f.t * 1.5 + Math.sin(f.t * 12) * .1;
      f.bug.rotation.y += dt * 6;
      if (f.t > 2.5) { f.bd.g.remove(f.bug); flyers.splice(k, 1); }
    }
    for (let k = pops.length - 1; k >= 0; k--) {
      const p = pops[k]; p.t += dt; p.sp.position.y = 1.2 + p.t * 1.4; p.sp.material.opacity = Math.max(0, 1 - p.t / 1.4);
      if (p.t > 1.4) { p.bd.g.remove(p.sp); pops.splice(k, 1); }
    }
    saveT += dt; if (saveT > 2) { saveT = 0; persist(); }
  }

  // 站在哪块田旁边（或者田里）
  function nearest(x, z) {
    const [lx, lz] = toLocal(x, z), active = LEVELS[st.level];
    let best = null, bd = Infinity;
    beds.forEach((b, i) => {
      if (i >= active) return;
      const dx = Math.max(0, Math.abs(lx - b.lx) - BED_W / 2), dz = Math.max(0, Math.abs(lz - b.lz) - BED_D / 2), d = Math.hypot(dx, dz) + Math.hypot(lx - b.lx, lz - b.lz) * .01;
      if (d < .9 && d < bd) { bd = d; best = b; }
    });
    return best;
  }
  // 栅栏挡路（门口能进出），跳起来能跨过去
  function collide(pos, pr = .45) {
    if (pos.y > .7 || !rect) return;
    let [lx, lz] = toLocal(pos.x, pos.z);
    if (lx < rect.x0 - 2 || lx > rect.x1 + 2 || lz < rect.z0 - 2 || lz > rect.z1 + 2) return;
    const ox = lx, oz = lz;
    const push = (v, line) => Math.abs(v - line) < pr ? line + (v >= line ? pr : -pr) : v;
    if (lz > rect.z0 - pr && lz < rect.z1 + pr) {
      const inGate = Math.abs(lz - rect.gz) < GATE_W / 2 - .1;            // 门口那一段不挡
      if (!(inGate && rect.xn === rect.x0)) lx = push(lx, rect.x0);
      if (!(inGate && rect.xn === rect.x1)) lx = push(lx, rect.x1);
    }
    if (lx > rect.x0 - pr && lx < rect.x1 + pr) { lz = push(lz, rect.z0); lz = push(lz, rect.z1); }
    if (lx !== ox || lz !== oz) { const [wx, wz] = toWorld(lx, lz); pos.x = wx; pos.z = wz; }
  }

  // ---------- 现在按 E 会做什么 ----------
  let shooCd = 0;
  function actionFor(bd) {
    const b = bd.st;
    if (b.bugs > 0) return { kind: 'shoo', label: `赶走虫子（还有 ${b.bugs} 只）` };
    if (b.crop && b.phase === 'ripe') return { kind: 'harvest', label: CROPS[b.crop].kind === 'pull' ? `拔${CROPS[b.crop].name}` : `摘${CROPS[b.crop].name}` };
    if (b.crop && b.phase === 'withered') return { kind: 'clear', label: '拔掉枯掉的苗' };
    if (!b.crop) return { kind: 'plant', label: '种菜' };
    return { kind: 'water', label: '浇水' };
  }
  const STAGE = g => g < .25 ? '发芽' : g < .6 ? '小苗' : g < 1 ? '长大中' : '成熟';
  function describe(bd) {
    const b = bd.st, wet = Math.round(b.moist * 100);
    if (!b.crop) return `空的田 · 水分 ${wet}%` + (b.bugs ? ` · 有 ${b.bugs} 只虫` : '');
    const C = CROPS[b.crop], parts = [`${C.icon} ${C.name}`];
    if (b.phase === 'withered') parts.push('已经枯萎');
    else if (b.phase === 'ripe') parts.push('成熟啦！');
    else {
      const rate = growRate(b), total = b.phase === 'grow' ? C.grow : C.regrow;
      parts.push((b.phase === 'regrow' ? '又在结果 ' : STAGE(b.g) + ' ') + Math.floor(b.g * 100) + '%');
      if (rate <= 0) parts.push('太干了，不长了');
      else parts.push('还要 ' + fmt((1 - b.g) * total / rate / st.speed));
    }
    parts.push(`水分 ${wet}%`);
    if (b.plants < PER_BED) parts.push(C.kind === 'tree' ? `果子被虫吃掉 ${PER_BED - b.plants} 份` : `被虫吃掉 ${PER_BED - b.plants} 棵`);
    return parts.join(' · ');
  }
  const fmt = sec => sec < 60 ? Math.ceil(sec) + ' 秒' : sec < 3600 ? Math.ceil(sec / 60) + ' 分钟' : (sec / 3600).toFixed(1) + ' 小时';

  function act(bd, seedKey, kind) {
    const b = bd.st, a = kind ? { kind } : actionFor(bd);
    if (a.kind === 'shoo') {
      if (shooCd > performance.now()) return { msg: '🐛 慢慢来…', soft: true };
      shooCd = performance.now() + SHOO_CD * 1000; b.bugs--; catchBug(bd); syncBugs(bd);
      const list = st.beds.slice(0, LEVELS[st.level]);
      if (rnd() < .35 && landSomewhere(list, b)) return { msg: '👋 虫子飞到别的田上去了…' + (b.bugs ? `这块还有 ${b.bugs} 只` : '') };
      return { msg: b.bugs ? `👋 赶走了一只虫子，还有 ${b.bugs} 只` : '👋 这块田的虫子都赶走啦！' };
    }
    if (a.kind === 'water') { b.moist = 1; burst(bd, dropMat, 30, 1.3); return { msg: '💧 浇好水了，土变深了' }; }
    if (a.kind === 'plant') {
      if (!seedKey) return { pick: true };
      const C = CROPS[seedKey];
      if (C.lv > st.level) return { msg: `🔒 ${C.name}要菜园 ${C.lv} 级才能种` };
      if (!bag.take('seed_' + seedKey)) return { msg: `没有${C.kind === 'tree' ? C.tree + '苗' : C.name + '种子'}了` };
      const pr = C.picks || [1, 1];
      Object.assign(b, { crop: seedKey, g: 0, phase: 'grow', plants: PER_BED, picks: 0, eat: 0, bugP: .4 + rnd() * .2, maxPicks: pr[0] + Math.floor(rnd() * (pr[1] - pr[0] + 1)) });
      rebuildPlants(bd); burst(bd, seedMat, 14, .6);
      return { msg: `🌱 种下了${C.kind === 'tree' ? '一棵' + C.tree : ` ${PER_BED} 棵${C.name}`}${b.moist < .05 ? '，记得浇水哦' : ''}` };
    }
    if (a.kind === 'clear') { Object.assign(b, { crop: null, g: 0, phase: 'grow', plants: PER_BED, picks: 0, eat: 0 }); rebuildPlants(bd); return { msg: '🧹 枯苗拔掉了，可以种新的了' }; }
    if (a.kind === 'harvest') {
      const C = CROPS[b.crop], n = b.plants * C.yield, got = [[b.crop, n]];
      let seedN = 0;
      if (C.kind === 'pull') seedN = C.seeds[0] + Math.floor(rnd() * (C.seeds[1] - C.seeds[0] + 1));
      const maxP = b.maxPicks || (C.picks ? C.picks[1] : 1);
      const lastPick = C.kind === 'pick' && b.picks + 1 >= maxP;
      if (lastPick && rnd() < C.witherSeed) seedN = 1 + Math.floor(rnd() * 2);
      if (seedN) got.push(['seed_' + b.crop, seedN]);
      if (!bag.addAll(got)) return { msg: '🎒 背包满了，装不下了' };
      pop(bd, `+${n} ${C.icon}`);
      let msg = `${C.icon} ${C.kind === 'pull' ? '拔' : '摘'}到 ${n} 个${C.name}` + (seedN ? `，还有 ${seedN} 颗种子` : '');
      if (C.kind === 'pull') { Object.assign(b, { crop: null, g: 0, phase: 'grow', plants: PER_BED, picks: 0, eat: 0 }); rebuildPlants(bd); }
      else { b.picks++; if (b.picks >= maxP) { b.phase = 'withered'; msg += '；结了好多次，它枯萎了'; } else { b.phase = 'regrow'; b.g = 0; b.bugP = .4 + rnd() * .2; if (C.kind === 'tree') b.plants = PER_BED; msg += '，过一阵还会再结'; } }
      return { msg };
    }
  }

  // ---------- 手上拿着什么，按 E 就做什么 ----------
  // item：'can' 水壶 / 'glove' 手套 / 'seed_xxx' 种子 / 菜 / null
  function plan(bd, item) {
    const b = bd.st;
    if (item === 'can') return { kind: 'water', label: '💧 浇水' };
    if (item === 'glove') {
      if (b.bugs > 0) return { kind: 'shoo', label: `🧤 抓虫子（${b.bugs} 只）` };
      if (b.crop && b.phase === 'ripe') return { kind: 'harvest', label: `🧤 ${CROPS[b.crop].kind === 'pull' ? '拔' : '摘'}${CROPS[b.crop].name}` };
      if (b.crop && b.phase === 'withered') return { kind: 'clear', label: '🧤 拔掉枯苗' };
      return { kind: null, label: '🧤 这里没有虫子', msg: b.crop ? '这块田没有虫子，菜还没熟' : '这块田没有虫子' };
    }
    if (item && item.startsWith('seed_')) {
      const k = item.slice(5), C = CROPS[k];
      if (b.crop) return { kind: null, label: `${C.icon} 这里已经有菜了`, msg: '这块田已经种了菜，不能再种' };
      if (C.lv > st.level) return { kind: null, label: `🔒 ${C.name}要 ${C.lv} 级菜园`, msg: `🔒 ${C.name}要菜园 ${C.lv} 级才能种` };
      return { kind: 'plant', seed: k, label: `${C.icon} 种${C.name}` };
    }
    return { kind: null, label: '按数字键选水壶、手套或种子', msg: '先按数字键选一样东西：1 水壶、2 手套、后面是种子' };
  }
  function useItem(bd, item) {
    const p = plan(bd, item);
    if (!p.kind) return { msg: p.msg };
    return act(bd, p.seed, p.kind);
  }

  const debug = {
    setLevel(l) { st.level = l; buildYard(); persist(); },
    setSpeed(v) { st.speed = v; persist(); },
    giveSeeds() { Object.keys(CROPS).forEach(k => { if (CROPS[k].lv <= st.level) bag.add('seed_' + k, 5); }); persist(); },
    reset() { try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); },
  };
  buildYard();
  beds.forEach(rebuildPlants);
  // 菜园门口（世界坐标），出生点用
  const gateWorld = () => toWorld(side * (plot.size / 2 - 4), rect.gz);
  const gateYaw = () => { const [ax, az] = toWorld(0, 0), [bx, bz] = toWorld(side, 0); return Math.atan2(bx - ax, bz - az); };
  return { beds, update, nearest, collide, actionFor, describe, act, plan, useItem, bag, debug, on, gateWorld, gateYaw, get level() { return st.level; }, get speed() { return st.speed; } };
}
