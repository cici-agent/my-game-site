// ===== 菜鸟家园 · 牛和羊（还有它们的家） =====
// 用户说：把牛、羊这些动物和它们住的地方做上；动物都可以杀（杀了得到肉）
// 样子按设计画布《菜鸟家园 · 动物和它们的家》：牛棚 1 级小牛棚 → 2 级红色牛棚 → 3 级大牧场牛棚；羊圈 1 级小羊圈 → 2 级羊圈 → 3 级山坡牧场
// 数字是 Claude 定的（现实里的秒），以后可以改
import * as THREE from 'three';
import { plotToWorld, worldToPlot } from './garden.js';
import { createGate, PEN_FENCE, nearSegs } from './gate.js';

export const SPECIES = {
  cow: { name: '牛', baby: '小牛', home: { 1: '小牛棚', 2: '红色牛棚', 3: '大牧场牛棚' }, cap: { 1: 1, 2: 3, 3: 6 }, up: { 2: 150, 3: 300 },
    RW: 6, RD: 5, product: 'milk', every: [25, 35], meat: 'beef', meatN: [3, 1], grow: 30, sound: '哞～', speed: 1.1 },
  sheep: { name: '羊', baby: '小羊', home: { 1: '小羊圈', 2: '羊圈', 3: '山坡牧场' }, cap: { 1: 2, 2: 4, 3: 8 }, up: { 2: 120, 3: 250 },
    RW: 5, RD: 4.5, product: 'wool', every: [35, 45], meat: 'mutton', meatN: [2, 1], grow: 25, sound: '咩～', speed: 1 },
  // 用户说：再多做一些动物和它们的家
  pig: { name: '猪', baby: '小猪', home: { 1: '小猪圈', 2: '猪圈', 3: '小猪乐园' }, cap: { 1: 1, 2: 3, 3: 6 }, up: { 2: 120, 3: 260 },
    RW: 5, RD: 4.5, product: 'truffle', every: [30, 40], meat: 'pork', meatN: [3, 1], grow: 25, sound: '哼哼～', speed: 1 },
  duck: { name: '鸭子', baby: '小鸭', home: { 1: '小鸭棚', 2: '鸭棚', 3: '鸭子小屋' }, cap: { 1: 2, 2: 5, 3: 10 }, up: { 2: 90, 3: 200 },
    RW: 5.5, RD: 4.5, product: 'duckegg', every: [25, 32], meat: 'duckmeat', meatN: [2, 1], grow: 20, sound: '嘎嘎～', speed: 1.1 },
};
// 每种动物的小细节（图标、提示、样子）
export const LOOK = {
  cow: { icon: '🐄', prod: '🥛', ready: '🥛 奶牛可以挤奶了', grass: 0x86c65a, babyS: .5, sleepY: -.45, emoY: 2.1, styles: { 1: [3.2, 2.4, 2.4, 'open'], 2: [4.4, 3, 3, 'barn'], 3: [5.4, 3.4, 3.6, 'barn'] }, wall: { open: 0x9a6a3c, barn: 0xc23626 }, roof: { open: 0xc23626, barn: 0x5a2a18 }, near: 1.8 },
  sheep: { icon: '🐑', prod: '🧶', ready: '🧶 羊毛长好了，可以剪了', grass: 0x93cf62, babyS: .55, sleepY: -.3, emoY: 1.45, styles: { 1: [2.8, 2, 1.9, 'straw'], 2: [3.6, 2.4, 2.4, 'house'], 3: [4.4, 2.8, 2.8, 'house'] }, wall: { straw: 0xe0c890, house: 0xf6efe0 }, roof: { straw: 0xd8b25a, house: 0x4f7fbf }, near: 1.4 },
  pig: { icon: '🐷', prod: '🍄', ready: '🍄 小猪拱出松露了！', grass: 0x9bc768, babyS: .55, sleepY: -.25, emoY: 1.3, styles: { 1: [2.4, 2, 1.7, 'straw'], 2: [3.2, 2.4, 2.2, 'house'], 3: [4, 2.6, 2.6, 'house'] }, wall: { straw: 0xc49766, house: 0xffd1dc }, roof: { straw: 0x8a5a2b, house: 0xc25a7a }, near: 1.4, mud: true },
  duck: { icon: '🦆', prod: '🥚', ready: '🥚 鸭子下蛋了', grass: 0x93cf62, babyS: .6, sleepY: -.08, emoY: .95, styles: { 1: [2.2, 1.8, 1.5, 'straw'], 2: [3, 2.2, 2, 'house'], 3: [3.6, 2.6, 2.4, 'house'] }, wall: { straw: 0xc49766, house: 0xf6efe0 }, roof: { straw: 0x5a8a3a, house: 0x3f86d8 }, near: 1.1, pond: true },
};
const HUNGER = 100 / 2400, MEAL = 50, FEED_MAX = 20;
// 牛羊吃的东西：草料 1 份；生菜、胡萝卜 1 份；玉米 2 份
export const RANCH_FEED = { hay: 1, lettuce: 1, carrot: 1, corn: 2 };
// 猪还爱吃土豆、南瓜；鸭子吃鸡饲料、生菜、种子
export const FEEDS = { cow: RANCH_FEED, sheep: RANCH_FEED, pig: { hay: 1, potato: 2, pumpkin: 3, carrot: 1, corn: 2, lettuce: 1 }, duck: { chickfeed: 1, lettuce: 1, corn: 2 } };
export const feedFor = (kind, k) => FEEDS[kind][k] || (kind === 'duck' && k && k.startsWith('seed_') ? 1 : 0);

// ---------- 牧场放在哪：自家空地后面（或者菜园对面那一边），入口朝着空地 ----------
export function pastureSpots(plot, side, isBlocked) {
  // 用户说：不要放在外面，把地扩大，牛圈羊圈都放在自家空地里 —— 放在空地后面两个角，入口朝房子那边
  const h = plot.size / 2;
  return { cow: { x: -side * (h - 10), z: -(h - 9), rot: 0 }, sheep: { x: side * (h - 9), z: -(h - 8.5), rot: 0 },
    pig: { x: -side * (h - 8), z: 4, rot: side * -Math.PI / 2 }, duck: { x: side * (h - 9), z: 4, rot: side * Math.PI / 2 } };   // 猪圈、鸭棚在空地两边中间，入口朝房子
}
export function pastureSpotsOutside(plot, side, isBlocked) {
  const h = plot.size / 2, C = SPECIES.cow, S = SPECIES.sheep;
  const options = [
    { cow: { x: -(C.RW + .6), z: -h - 1.8 - C.RD, rot: 0 }, sheep: { x: S.RW + .6, z: -h - 1.8 - S.RD, rot: 0 } },
    { cow: { x: -side * (h + 1.8 + C.RD), z: C.RW + .6, rot: side * Math.PI / 2 }, sheep: { x: -side * (h + 1.8 + S.RD), z: -(S.RW + .6), rot: side * Math.PI / 2 } },
    { cow: { x: -(C.RW + .6), z: h + 1.8 + C.RD, rot: Math.PI }, sheep: { x: S.RW + .6, z: h + 1.8 + S.RD, rot: Math.PI } },
  ];
  // 数一数牧场范围里有几个点被挡住（0 = 完全空着）；都不行就选挡得最少的
  const bad = (sp, K) => { const c = Math.cos(sp.rot), s = Math.sin(sp.rot); let n = 0;
    for (let a = -K.RW - 1; a <= K.RW + 1; a += .75) for (let b = -K.RD - 1; b <= K.RD + 1; b += .75) {
      const lx = sp.x + a * c + b * s, lz = sp.z - a * s + b * c, [x, z] = plotToWorld(plot, lx, lz); if (isBlocked(x, z)) n++; }
    return n; };
  return options.map(o => ({ o, n: bad(o.cow, C) + bad(o.sheep, S) })).sort((p, q) => p.n - q.n)[0].o;
}
// 某个点在不在牧场里（种花种草时避开）
export function inPasture(plot, spots, x, z, m = 0) {
  const [lx, lz] = worldToPlot(plot, x, z);
  return Object.keys(spots).some(k => { const sp = spots[k], K = SPECIES[k], c = Math.cos(sp.rot), s = Math.sin(sp.rot), dx = lx - sp.x, dz = lz - sp.z;
    const a = dx * c - dz * s, b = dx * s + dz * c; return Math.abs(a) < K.RW + m && Math.abs(b) < K.RD + m; });
}

// ---------- 模型 ----------
const SPH = new THREE.SphereGeometry(1, 16, 12), CYL = new THREE.CylinderGeometry(1, 1, 1, 10);
const MM = {}; const M = (c, o = {}) => (MM[c + JSON.stringify(o)] ||= new THREE.MeshStandardMaterial({ color: c, roughness: .8, ...o }));
function part(parent, geo, mat, p, s, r) { const m = new THREE.Mesh(geo, mat); m.position.set(...p); if (s) m.scale.set(...s); if (r) m.rotation.set(...r); m.castShadow = true; parent.add(m); return m; }
function eyes(head, x, y, z, r = .06) {
  [-1, 1].forEach(s => { part(head, SPH, M(0x1d1712, { roughness: .3 }), [s * x, y, z], [r, r * 1.15, r * .8]);
    part(head, SPH, new THREE.MeshBasicMaterial({ color: 0xffffff }), [s * x + r * .35, y + r * .4, z + r * .55], [r * .32, r * .36, r * .2]);
    part(head, SPH, M(0xff9aa8, { transparent: true, opacity: .55 }), [s * (x + r * 1.3), y - r * 1.6, z - r * .4], [r * .9, r * .5, r * .3]); });
}
// 奶牛：黑白花、粉鼻子、小角、大眼睛
function buildCow(baby) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const W = M(0xfbfaf7), B = M(0x2b2b2b), P = M(0xffc2cf), hoof = M(0x3a2a20);
  part(body, SPH, W, [0, .95, 0], [.5, .45, .78]);
  [[.3, 1.15, .2, .2], [-.35, .95, -.3, .24], [.2, .8, -.45, .18], [-.1, 1.3, .35, .14]].forEach(([x, y, z, r]) => part(body, SPH, B, [x * 1.02, y, z], [r * .5, r, r]).position.x = x > 0 ? .42 : -.42);
  part(body, SPH, B, [0, 1.36, -.2], [.22, .06, .2]);
  part(body, SPH, P, [0, .55, -.25], [.16, .1, .14]);   // 小奶包
  const legs = [[-.27, .45], [.27, .45], [-.27, -.45], [.27, -.45]].map(([x, z]) => { const l = new THREE.Group(); l.position.set(x, .7, z); body.add(l);
    part(l, CYL, W, [0, -.3, 0], [.11, .6, .11]); part(l, CYL, hoof, [0, -.64, 0], [.12, .1, .12]); return l; });
  const tail = new THREE.Group(); tail.position.set(0, 1.15, -.75); body.add(tail); part(tail, CYL, W, [0, -.25, 0], [.025, .5, .025]); part(tail, SPH, B, [0, -.52, 0], [.06, .1, .06]);
  const head = new THREE.Group(); head.position.set(0, 1.25, .78); body.add(head);
  part(head, SPH, W, [0, 0, 0], [.36, .34, .33]);
  part(head, SPH, P, [0, -.15, .26], [.24, .15, .12]); [-1, 1].forEach(s => part(head, SPH, M(0xa5566a), [s * .08, -.14, .37], [.035, .03, .02]));
  eyes(head, .14, .07, .27, .065);
  [-1, 1].forEach(s => { part(head, new THREE.ConeGeometry(.05, .18, 8), M(0xe8d9a8), [s * .2, .32, -.02], null, [0, 0, -s * .5]);
    part(head, SPH, W, [s * .38, .08, -.04], [.15, .06, .09], [0, 0, s * .3]); part(head, SPH, P, [s * .39, .08, -.02], [.1, .035, .06], [0, 0, s * .3]); });
  part(head, SPH, B, [.12, .2, .15], [.12, .08, .1]);
  const bell = part(body, SPH, M(0xffd23f, { metalness: .6, roughness: .3 }), [0, .95, .92], [.07, .08, .07]);
  part(body, new THREE.TorusGeometry(.26, .03, 6, 18), M(0xe8352b), [0, 1.08, .78], null, [Math.PI / 2 - .4, 0, 0]);
  root.scale.setScalar(baby ? .55 : 1);
  return { root, body, head, legs, tail };
}
// 绵羊：一团团的白毛、黑脸黑腿；剪了毛以后瘦瘦的
function buildSheep(baby) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const wool = new THREE.Group(); body.add(wool);
  const WM = M(0xfbfaf7, { roughness: 1 }), F = M(0x3a3a3a), skin = M(0xf1e4d6);
  part(body, SPH, skin, [0, .62, 0], [.3, .27, .42]);   // 剪了毛以后看到的身子
  [[0, .7, 0, .42], [.22, .78, .25, .26], [-.22, .78, .25, .26], [.22, .78, -.25, .26], [-.22, .78, -.25, .26], [0, .9, .05, .28], [0, .85, -.3, .26], [0, .82, .35, .24], [.3, .62, 0, .24], [-.3, .62, 0, .24]]
    .forEach(([x, y, z, r]) => part(wool, SPH, WM, [x, y, z], [r, r * .92, r]));
  const legs = [[-.18, .25], [.18, .25], [-.18, -.25], [.18, -.25]].map(([x, z]) => { const l = new THREE.Group(); l.position.set(x, .45, z); body.add(l); part(l, CYL, F, [0, -.22, 0], [.055, .45, .055]); return l; });
  const tail = new THREE.Group(); tail.position.set(0, .75, -.5); body.add(tail); part(tail, SPH, WM, [0, 0, -.05], [.09, .09, .09]);
  const head = new THREE.Group(); head.position.set(0, .95, .5); body.add(head);
  part(head, SPH, F, [0, 0, 0], [.2, .24, .2]);
  [[-.07, .2], [0, .23], [.07, .2]].forEach(([x, y]) => part(head, SPH, WM, [x, y, -.03], [.09, .08, .09]));   // 头顶一撮毛
  [-1, 1].forEach(s => part(head, SPH, F, [s * .24, .03, -.03], [.13, .05, .07], [0, 0, s * .4]));
  [-1, 1].forEach(s => { part(head, SPH, new THREE.MeshBasicMaterial({ color: 0xffffff }), [s * .085, .06, .15], [.055, .06, .04]); part(head, SPH, M(0x111111), [s * .085, .05, .18], [.03, .035, .02]); });
  part(head, SPH, M(0xff9aa8), [0, -.12, .17], [.04, .025, .02]);
  root.scale.setScalar(baby ? .6 : 1);
  return { root, body, head, legs, tail, wool };
}
// 小猪：粉粉圆圆、大鼻子、卷尾巴
function buildPig(baby) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const P = M(0xffb3c4), D = M(0xef8aa3);
  part(body, SPH, P, [0, .5, 0], [.36, .32, .48]);
  const legs = [[-.18, .25], [.18, .25], [-.18, -.25], [.18, -.25]].map(([x, z]) => { const l = new THREE.Group(); l.position.set(x, .3, z); body.add(l); part(l, CYL, P, [0, -.15, 0], [.08, .3, .08]); part(l, CYL, D, [0, -.29, 0], [.085, .04, .085]); return l; });
  const tail = new THREE.Group(); tail.position.set(0, .62, -.47); body.add(tail); part(tail, new THREE.TorusGeometry(.06, .015, 6, 14, Math.PI * 1.6), D, [0, .04, -.03], null, [0, Math.PI / 2, 0]);
  const head = new THREE.Group(); head.position.set(0, .66, .42); body.add(head);
  part(head, SPH, P, [0, 0, 0], [.28, .26, .25]);
  part(head, CYL, D, [0, -.04, .24], [.12, .1, .12], [Math.PI / 2, 0, 0]); [-1, 1].forEach(s => part(head, SPH, M(0xa5405a), [s * .045, -.04, .3], [.025, .035, .015]));
  eyes(head, .11, .07, .2, .045);
  [-1, 1].forEach(s => part(head, new THREE.ConeGeometry(.08, .16, 4), P, [s * .16, .25, -.02], null, [.3, 0, s * .4]));
  // 身上的泥点（玩泥巴以后慢慢变多，洗了就没了）
  const mudMat = new THREE.MeshStandardMaterial({ color: 0x6b4a2b, roughness: 1, transparent: true, opacity: 0 }), mud = [];
  [[.25, .55, .1, .14], [-.28, .5, -.15, .16], [.1, .78, -.2, .13], [-.15, .7, .25, .11], [.3, .4, -.3, .12], [-.2, .35, .3, .1], [0, .8, .15, .12]].forEach(([x, y, z, r]) => {
    const d = part(body, SPH, mudMat, [x * 1.05, y, z], [r, r * .55, r]); d.lookAt(d.position.clone().multiplyScalar(2)); d.castShadow = false; mud.push(d); });
  root.scale.setScalar(baby ? .55 : 1);
  return { root, body, head, legs, tail, mudMat };
}
// 鸭子：黄白色、橘色扁嘴、会在池塘里游
function buildDuck(baby) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const W = M(baby ? 0xffe066 : 0xfffaf0), O = M(0xff8a2a);
  part(body, SPH, W, [0, .28, 0], [.2, .17, .28]);
  part(body, SPH, W, [0, .36, -.24], [.09, .07, .1], [-.6, 0, 0]);
  [-1, 1].forEach(s => part(body, SPH, M(baby ? 0xf5cf3a : 0xeee6d2), [s * .17, .3, -.02], [.05, .1, .18]));
  const legs = [-1, 1].map(s => { const l = new THREE.Group(); l.position.set(s * .07, .14, 0); body.add(l); part(l, CYL, O, [0, -.06, 0], [.015, .12, .015]); part(l, new THREE.BoxGeometry(.08, .01, .09), O, [0, -.12, .03]); return l; });
  const tail = new THREE.Group(); tail.position.set(0, .4, -.28); body.add(tail);
  const head = new THREE.Group(); head.position.set(0, .5, .18); body.add(head);
  part(head, SPH, W, [0, 0, 0], [.12, .12, .12]);
  part(head, SPH, O, [0, -.02, .13], [.06, .025, .07]);
  eyes(head, .055, .03, .09, .022);
  root.scale.setScalar(baby ? .7 : 1.15);
  return { root, body, head, legs, tail };
}
export const ANIMAL_MODELS = { cow: buildCow, sheep: buildSheep, pig: buildPig, duck: buildDuck };

// 头上冒的小图标（🥛、🧶、💤）
const EMO = {};
function emoTex(e) { if (EMO[e]) return EMO[e]; const c = document.createElement('canvas'); c.width = c.height = 96; const g = c.getContext('2d');
  g.fillStyle = 'rgba(255,255,255,.92)'; g.beginPath(); g.arc(48, 44, 38, 0, 7); g.fill(); g.font = '46px sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(e, 48, 46);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return EMO[e] = t; }

// ---------- 棚子 / 羊圈 ----------
function buildHome(kind, lv) {
  const K = SPECIES[kind], g = new THREE.Group(), { RW, RD } = K;
  const box = (w, h, d, mat, p, r, parent = g) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(...p); if (r) m.rotation.set(...r); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  // 草地颜色深一点，表示是牧场
  const LK = LOOK[kind], grass = new THREE.Mesh(new THREE.PlaneGeometry(RW * 2, RD * 2), M(LK.grass, { roughness: 1 })); grass.rotation.x = -Math.PI / 2; grass.position.y = .015; grass.receiveShadow = true; g.add(grass);
  // 木头围栏（两道横木），前面（+z，朝空地）中间留个口
  const wood = M(0x9a6a3c), FH = 1;
  const segs = [[-RW, RD, -1.2, RD], [1.2, RD, RW, RD], [RW, RD, RW, -RD], [RW, -RD, -RW, -RD], [-RW, -RD, -RW, RD]];
  const nKids = g.children.length;
  segs.forEach(([ax, az, bx, bz]) => { const len = Math.hypot(bx - ax, bz - az), ang = -Math.atan2(bz - az, bx - ax), mx = (ax + bx) / 2, mz = (az + bz) / 2;
    [.4, .82].forEach(y => box(len, .1, .07, wood, [mx, y, mz], [0, ang, 0]));
    const n = Math.max(1, Math.round(len / 1.5)); for (let i = 0; i <= n; i++) box(.12, FH + .1, .12, wood, [ax + (bx - ax) * i / n, (FH + .1) / 2, az + (bz - az) * i / n]); });
  const fenceG = new THREE.Group(); g.children.slice(nKids).forEach(c => fenceG.add(c)); g.add(fenceG);   // 栅栏单独一组：升级时整体变高
  // 棚子：门朝 +z，靠在后边
  const S = LK.styles[lv];
  const [w, d, h, style] = S, hz = -RD + d / 2 + .5, H = new THREE.Group(); H.position.set(-RW * .25, 0, hz); g.add(H);
  const wallC = LK.wall[style], roofC = LK.roof[style];
  const wallM = M(wallC), roofM = M(roofC), white = M(0xffffff), rise = h * .45;
  if (style === 'open') {   // 只有柱子和屋顶的小棚
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([i, j]) => box(.16, h, .16, wood, [i * (w / 2 - .1), h / 2, j * (d / 2 - .1)], null, H));
    box(w, h * .5, .1, wallM, [0, h * .75, -d / 2], null, H);
  } else {
    const DW = Math.min(1.8, w * .42), DH = Math.min(h * .75, 2.4);
    box(w, h, .14, wallM, [0, h / 2, -d / 2], null, H);
    [-1, 1].forEach(s => box(.14, h, d, wallM, [s * w / 2, h / 2, 0], null, H));
    [-1, 1].forEach(s => box((w - DW) / 2, h, .14, wallM, [s * (DW / 2 + (w - DW) / 4), h / 2, d / 2], null, H));
    box(DW, h - DH, .14, wallM, [0, DH + (h - DH) / 2, d / 2], null, H);
    if (style === 'barn') { [-1, 1].forEach(s => { box(.1, DH, .06, white, [s * DW / 2, DH / 2, d / 2 + .08], null, H); const x1 = box(.08, Math.hypot(DW / 2, DH), .05, white, [s * DW / 4, DH / 2, d / 2 + .1], [0, 0, s * Math.atan2(DW / 2, DH)], H); });
      box(DW, .1, .06, white, [0, DH, d / 2 + .08], null, H); [-1, 1].forEach(s => box(.1, h, .06, white, [s * w / 2, h / 2, d / 2 + .08], null, H)); }
    if (style === 'house') { box(.5, .4, .04, M(0xbfe3f7, { roughness: .2 }), [w * .3, h * .6, d / 2 + .08], null, H); }
  }
  const sl = Math.hypot(w / 2 + .3, rise);
  [-1, 1].forEach(s => box(sl, .12, d + .4, roofM, [s * (w / 2 + .3) / 2, h + rise / 2, 0], [0, 0, -s * Math.atan2(rise, w / 2 + .3)], H));
  if (style !== 'open') [-1, 1].forEach(s => { const sh = new THREE.Shape(); sh.moveTo(-w / 2, 0); sh.lineTo(w / 2, 0); sh.lineTo(0, rise); sh.lineTo(-w / 2, 0);
    const gm = new THREE.Mesh(new THREE.ShapeGeometry(sh), new THREE.MeshStandardMaterial({ color: wallC, roughness: .85, side: THREE.DoubleSide })); gm.position.set(0, h, s * d / 2); H.add(gm); });
  if (style === 'straw') for (let i = 0; i < 12; i++) box(.06, .3, .06, M(0xc49a44), [-w / 2 + i * w / 11, h - .1, d / 2 + .22], [0, 0, 0], H);
  // 3 级：牛棚旁边的草料塔；羊圈后面一个小山坡
  if (lv === 3 && kind === 'cow') { const silo = new THREE.Group(); silo.position.set(RW * .55, 0, hz); g.add(silo);
    const s1 = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, 4.6, 18), M(0xcfd6dd, { metalness: .3 })); s1.position.y = 2.3; s1.castShadow = true; silo.add(s1);
    const s2 = new THREE.Mesh(new THREE.SphereGeometry(.9, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(0x8a96a3)); s2.position.y = 4.6; silo.add(s2); }
  // 猪圈：一个泥坑（3 级还有个小滑梯）；鸭棚：一个池塘（越高级越大，3 级有小木码头）
  if (LK.mud) { g.userData.mud = { x: RW * .35, z: RD * .25, rx: (1.4 + lv * .5) * .8, rz: (1 + lv * .3) * .8 }; const mud = new THREE.Mesh(new THREE.CircleGeometry(1, 28), M(0x7a5a38, { roughness: .6 })); mud.rotation.x = -Math.PI / 2; mud.scale.set(1.4 + lv * .5, 1 + lv * .3, 1); mud.position.set(RW * .35, .02, RD * .25); g.add(mud);
    if (lv === 3) { box(.5, .06, 2, M(0xffd23f), [RW * .35 - 1.6, .5, RD * .25], [0, 0, .45]); box(.08, 1, .08, M(0xffd23f), [RW * .35 - 2.05, .5, RD * .25 - .3]); } }
  if (LK.pond) { const pond = new THREE.Mesh(new THREE.CircleGeometry(1, 32), M(0x6fbfe6, { roughness: .15, metalness: .1 })); pond.rotation.x = -Math.PI / 2; pond.scale.set(1.6 + lv * .5, 1.1 + lv * .3, 1); pond.position.set(RW * .3, .03, RD * .2); g.add(pond);
    const rim = new THREE.Mesh(new THREE.RingGeometry(.97, 1.08, 32), M(0x9a8a6a)); rim.rotation.x = -Math.PI / 2; rim.scale.copy(pond.scale); rim.position.set(pond.position.x, .035, pond.position.z); g.add(rim);
    if (lv >= 2) for (let i = 0; i < 4; i++) box(.04, .7, .04, M(0x4f8f3a), [pond.position.x + pond.scale.x * .9, .35, pond.position.z - .4 + i * .25]);
    if (lv === 3) box(1.6, .08, .5, M(0x8a5a2b), [pond.position.x - pond.scale.x * .6, .2, pond.position.z]);
    g.userData.pond = { x: pond.position.x, z: pond.position.z, rx: pond.scale.x * .85, rz: pond.scale.y * .85 }; }
  if (lv === 3 && kind === 'sheep') { const hill = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M(0x7dbb4f, { roughness: 1 })); hill.scale.y = .35; hill.position.set(RW * .5, 0, -RD * .4); hill.receiveShadow = true; g.add(hill); }
  // 食槽（院子前面左边）
  const trough = new THREE.Group(); trough.position.set(-RW + 1.4, 0, RD - 1.3); g.add(trough);
  [[1.5, .06, .5, 0, .3, 0], [1.5, .25, .05, 0, .42, .25], [1.5, .25, .05, 0, .42, -.25], [.05, .25, .5, .75, .42, 0], [.05, .25, .5, -.75, .42, 0], [.08, .3, .08, -.65, .15, 0], [.08, .3, .08, .65, .15, 0]]
    .forEach(([a, b, c, x, y, z]) => box(a, b, c, wood, [x, y, z], null, trough));
  const hay = box(1.4, .14, .42, M(0xd9c25a, { roughness: 1 }), [0, .4, 0], null, trough);
  // 门口的小木牌
  const sign = new THREE.Group(); sign.position.set(1.8, 0, RD + .4); g.add(sign);
  box(.08, 1.1, .08, wood, [0, .55, 0], null, sign);
  const st = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d'); x.fillStyle = '#f2e1bd'; x.fillRect(0, 0, 256, 96); x.fillStyle = '#5a3a1a'; x.font = 'bold 44px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(LK.icon + ' ' + K.home[lv], 128, 50); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  box(1, .38, .05, new THREE.MeshStandardMaterial({ map: st }), [0, 1.05, .05], null, sign);
  return { fenceG, mud: g.userData.mud, pond: g.userData.pond, group: g, hay, troughPos: trough.position, door: { x: H.position.x, z: hz + d / 2 + .8 }, houseBox: { x: H.position.x, z: hz, hw: w / 2 + .1, hd: d / 2 + .1 }, sleep: { x: H.position.x, z: hz }, fence: segs, roofH: h + rise };
}

// ---------- 一个牧场（牛的或者羊的） ----------
export function createRanch({ scene, plot, spot, kind, isNight = () => false, notify = () => {} }) {
  const K = SPECIES[kind], KEY = 'xcn_ranch_' + kind + '_v1';
  let st = null; try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  st ||= { built: false, lv: 1, feed: 0, animals: [], t: Date.now() };
  const save = () => { st.t = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const holder = new THREE.Group(); holder.position.set(plot.x, 0, plot.z); holder.rotation.y = plot.rot; scene.add(holder);
  const base = new THREE.Group(); base.position.set(spot.x, 0, spot.z); base.rotation.y = spot.rot; holder.add(base);
  const toLocal = (x, z) => { const [a, b] = worldToPlot(plot, x, z), dx = a - spot.x, dz = b - spot.z, c = Math.cos(spot.rot), s = Math.sin(spot.rot); return [dx * c - dz * s, dx * s + dz * c]; };
  const toWorld = (lx, lz) => { const c = Math.cos(spot.rot), s = Math.sin(spot.rot); return plotToWorld(plot, spot.x + lx * c + lz * s, spot.z - lx * s + lz * c); };
  const GROW = K.grow * 60 * 1000, rndEvery = () => (K.every[0] + Math.random() * (K.every[1] - K.every[0])) * 60 * 1000;
  // 还没买的时候：空地上插一块小木牌
  let H = null, placeholder = null;
  function build() {
    if (H) base.remove(H.group); if (placeholder) { base.remove(placeholder); placeholder = null; }
    if (!st.built) { placeholder = new THREE.Group(); base.add(placeholder);
      const p = new THREE.Mesh(new THREE.BoxGeometry(.1, 1.2, .1), M(0x9a6a3c)); p.position.y = .6; placeholder.add(p);
      const c = document.createElement('canvas'); c.width = 320; c.height = 120; const x = c.getContext('2d'); x.fillStyle = '#f2e1bd'; x.fillRect(0, 0, 320, 120); x.fillStyle = '#5a3a1a'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center';
      x.fillText(`${LOOK[kind].icon} 这里盖${K.home[1].slice(1)}`, 160, 50); x.font = '26px sans-serif'; x.fillText('去动物小铺买', 160, 92);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const b = new THREE.Mesh(new THREE.BoxGeometry(1.4, .52, .05), new THREE.MeshStandardMaterial({ map: t })); b.position.set(0, 1.2, .06); placeholder.add(b);
      p.position.z = K.RD - .5; b.position.z = K.RD - .5 + .06;
      // 地上画出这块地的边（一圈虚线木条），告诉大家这里是盖它的地方
      const om = M(0xc9a66b); for (const [x0, z0, x1, z1] of [[-K.RW, -K.RD, K.RW, -K.RD], [K.RW, -K.RD, K.RW, K.RD], [K.RW, K.RD, -K.RW, K.RD], [-K.RW, K.RD, -K.RW, -K.RD]]) {
        const len = Math.hypot(x1 - x0, z1 - z0), n = Math.floor(len / 1.2); for (let i = 0; i < n; i++) { const t = (i + .25) / n, t2 = (i + .75) / n;
          const d = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0) ? (t2 - t) * len : .12, .04, Math.abs(z1 - z0) ? (t2 - t) * len : .12), om); d.position.set(x0 + (x1 - x0) * (t + t2) / 2, .02, z0 + (z1 - z0) * (t + t2) / 2); placeholder.add(d); } }
      H = null; return; }
    H = buildHome(kind, st.lv); base.add(H.group); showFeed();
    H.gate = createGate({ parent: H.group, x: 0, z: K.RD, axis: 'x', width: 2.3, height: 1, double: true, out: 1, key: 'xcn_gate_' + kind, name: K.home[st.lv] + '的门' });
    const fk = PEN_FENCE[st.fenceLv || 1].k; H.fenceG.scale.y = fk; H.gate.setHeight(fk);
  }
  function showFeed() { if (!H) return; H.hay.visible = st.feed > 0; H.hay.scale.y = Math.max(.25, Math.min(1, st.feed / 8)); }
  // 离线：饿、吃食槽、产奶 / 长毛
  function tick(dt, now) {
    st.animals.forEach(a => {
      a.full = Math.max(0, a.full - dt * HUNGER);
      if (a.full < 50 && st.feed > 0) { st.feed--; a.full = Math.min(100, a.full + MEAL); }
      if (now - a.born >= GROW && !a.ready && now >= a.next) { if (a.full >= 20 && !(a.dirt >= .9 && Math.random() < .5)) a.ready = true; else a.next = now + 5 * 60 * 1000; }   // 太脏的小猪不太爱干活，拱松露慢一点
    });
  }
  if (st.built) { let left = Math.max(0, (Date.now() - st.t) / 1000); while (left > 0) { const s = Math.min(60, left); left -= s; tick(s, Date.now() - left * 1000); } }
  const beasts = [];
  function sync() {
    while (beasts.length > st.animals.length) { const b = beasts.pop(); base.remove(b.m.root); }
    st.animals.forEach((a, i) => {
      const baby = Date.now() - a.born < GROW;
      if (beasts[i] && beasts[i].baby === baby) return;
      if (beasts[i]) base.remove(beasts[i].m.root);
      const m = ANIMAL_MODELS[kind](baby); base.add(m.root);
      const em = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false })); em.scale.set(.6, .6, 1); em.visible = false; em.renderOrder = 9; m.root.add(em);
      const b = beasts[i] || { x: (Math.random() - .5) * 3, z: (Math.random() - .2) * 3, face: Math.random() * 6.28, tx: 0, tz: 0, t: 0, act: 'idle', ph: Math.random() * 10 };
      b.m = m; b.baby = baby; b.em = em; beasts[i] = b;
    });
  }
  build(); sync();
  const puffs = [];
  function splash(x, z) { const g = new THREE.Group(); g.position.set(x, 1.1, z); base.add(g); const mat = new THREE.MeshStandardMaterial({ color: 0x8fd3ff, transparent: true, roughness: .1 });
    for (let i = 0; i < 24; i++) { const f = new THREE.Mesh(SPH, mat); f.scale.setScalar(.05 + Math.random() * .05); f.userData.v = new THREE.Vector3((Math.random() - .5) * 2.2, Math.random() * 1.2, (Math.random() - .5) * 2.2); g.add(f); } puffs.push({ g, mat, t: 0 }); }
  function puff(x, z, color) { const g = new THREE.Group(); g.position.set(x, .6, z); base.add(g); const mat = new THREE.MeshStandardMaterial({ color, transparent: true, roughness: 1 });
    for (let i = 0; i < 16; i++) { const f = new THREE.Mesh(SPH, mat); f.scale.setScalar(.08 + Math.random() * .08); f.userData.v = new THREE.Vector3((Math.random() - .5) * 2.5, 1 + Math.random() * 1.5, (Math.random() - .5) * 2.5); g.add(f); } puffs.push({ g, mat, t: 0 }); }

  let t0 = 0, saveT = 0, syncT = 0, readyWas = 0;
  function update(dt) {
    if (!st.built) return;
    H.gate.update(dt);
    t0 += dt; tick(dt, Date.now());
    if ((syncT += dt) > 5) { syncT = 0; sync(); }
    const nReady = st.animals.filter(a => a.ready).length; if (nReady > readyWas) notify(LOOK[kind].ready); readyWas = nReady;
    const night = isNight(), { RW, RD } = K, hb = H.houseBox, sp = H.sleep;
    beasts.forEach((b, i) => {
      const a = st.animals[i], r = b.m.root; if (!a) return;
      b.t -= dt;
      if (night) {   // 晚上回棚子里趴着睡
        const tx = sp.x + ((i % 3) - 1) * .9, tz = sp.z + (Math.floor(i / 3) - .5) * .8, d = Math.hypot(tx - b.x, tz - b.z);
        if (d > .2) { b.face = Math.atan2(tx - b.x, tz - b.z); b.x += Math.sin(b.face) * Math.min(d, 1.4 * dt); b.z += Math.cos(b.face) * Math.min(d, 1.4 * dt); b.act = 'walk'; } else b.act = 'sleep';
      } else {
        if (b.act === 'sleep') b.act = 'idle';
        if (b.t <= 0) { const k = Math.random(); b.act = k < .4 ? 'walk' : k < .85 ? 'graze' : 'idle'; b.t = 2 + Math.random() * 4;
          if (H.mud && Math.random() < .3) { b.act = 'walk'; b.toMud = true; b.tx = H.mud.x + (Math.random() - .5) * H.mud.rx; b.tz = H.mud.z + (Math.random() - .5) * H.mud.rz; b.t = 12; }   // 小猪去泥坑里玩
          if (b.act === 'walk') { b.tx = (Math.random() * 2 - 1) * (RW - .9); b.tz = (Math.random() * 2 - 1) * (RD - .9); if (a.full < 50 && st.feed > 0) { b.tx = H.troughPos.x + (Math.random() - .5); b.tz = H.troughPos.z - .9; } } }
        if (b.act === 'walk') { const dx = b.tx - b.x, dz = b.tz - b.z, d = Math.hypot(dx, dz);
          if (d > .05) { const want = Math.atan2(dx, dz); let df = want - b.face; while (df > Math.PI) df -= 6.283; while (df < -Math.PI) df += 6.283; b.face += df * Math.min(1, dt * 3); const s = Math.min(d, K.speed * (b.baby ? .8 : 1) * dt); b.x += Math.sin(b.face) * s; b.z += Math.cos(b.face) * s; } else if (b.toMud) { b.toMud = false; b.act = 'wallow'; b.t = 4 + Math.random() * 4; } else b.act = 'graze'; }
        // 在泥坑里打滚：身上越来越脏
        if (b.act === 'wallow') { a.dirt = Math.min(1, (a.dirt || 0) + dt * .12); }
        b.x = Math.max(-RW + .7, Math.min(RW - .7, b.x)); b.z = Math.max(-RD + .7, Math.min(RD - .7, b.z));
        const ex = hb.hw + .5 - Math.abs(b.x - hb.x), ez = hb.hd + .5 - Math.abs(b.z - hb.z); if (ex > 0 && ez > 0) { if (ex < ez) b.x = hb.x + Math.sign(b.x - hb.x || 1) * (hb.hw + .5); else b.z = hb.z + Math.sign(b.z - hb.z || 1) * (hb.hd + .5); }
      }
      if (b.baby) { const k = Math.min(1, (Date.now() - a.born) / GROW); r.scale.setScalar(LOOK[kind].babyS + .4 * k); }
      r.position.set(b.x, 0, b.z); r.rotation.y = b.face;
      const walk = b.act === 'walk', ph = t0 * 7 + b.ph, m = b.m;
      m.legs.forEach((l, k) => l.rotation.x = b.act === 'sleep' ? (k < 2 ? -1.3 : 1.3) : walk ? Math.sin(ph + (k === 0 || k === 3 ? 0 : Math.PI)) * .45 : 0);
      const inPond = H.pond && ((b.x - H.pond.x) / H.pond.rx) ** 2 + ((b.z - H.pond.z) / H.pond.rz) ** 2 < 1;   // 鸭子在池塘里：浮在水上游
      m.body.position.y = b.act === 'sleep' ? LOOK[kind].sleepY : inPond ? -.12 : walk ? Math.abs(Math.sin(ph)) * .03 : 0;
      if (inPond) m.legs.forEach(l => l.rotation.x = 0);
      if (b.act === 'wallow') { m.body.rotation.z = Math.sin(t0 * 2.5 + b.ph) * .6; m.body.position.y = -.12; m.legs.forEach((l, k) => l.rotation.x = Math.sin(t0 * 6 + k) * .6); } else m.body.rotation.z = 0;
      if (m.mudMat) m.mudMat.opacity = Math.min(1, (a.dirt || 0) * 1.3);
      m.head.rotation.x = b.act === 'graze' ? .7 + Math.sin(t0 * 5 + b.ph) * .08 : b.act === 'sleep' ? .35 : 0;
      m.tail.rotation.z = Math.sin(t0 * 3 + b.ph) * .4;
      if (m.wool) { const g = a.ready ? 1 : Math.max(0, Math.min(1, 1 - (a.next - Date.now()) / ((K.every[0] + K.every[1]) / 2 * 60000))); m.wool.scale.setScalar(.55 + .45 * g); m.wool.visible = g > .05; }
      // 头上的小图标：能挤奶 / 能剪毛 / 睡觉
      const e = b.act === 'sleep' ? '💤' : a.ready ? LOOK[kind].prod : null;
      b.em.visible = false;   // 用户说：动物、宠物头上不要显示状态（比如睡觉）
      if (false) b.em.visible = !!e; if (e && b.em.material.map !== emoTex(e)) { b.em.material.map = emoTex(e); b.em.material.needsUpdate = true; } b.em.position.y = LOOK[kind].emoY + Math.sin(t0 * 3 + b.ph) * .05;
    });
    for (let k = puffs.length - 1; k >= 0; k--) { const p = puffs[k]; p.t += dt; p.g.children.forEach(f => { f.userData.v.y -= 2.5 * dt; f.position.addScaledVector(f.userData.v, dt); }); p.mat.opacity = Math.max(0, 1 - p.t / 1.6); if (p.t > 1.6) { base.remove(p.g); puffs.splice(k, 1); } }
    if ((saveT += dt) > 5) { saveT = 0; save(); }
  }
  // 围栏挡人（能跳过去）；棚子挡人
  function collide(p, pr = .45) {
    if (!st.built) return;
    let [lx, lz] = toLocal(p.x, p.z); if (Math.abs(lx) > K.RW + 2 || Math.abs(lz) > K.RD + 2) return; const ox = lx, oz = lz;
    if (p.y < PEN_FENCE[st.fenceLv || 1].jump) (H.gate.passable ? H.fence : H.fence.concat([[-1.2, K.RD, 1.2, K.RD]])).forEach(([ax, az, bx, bz]) => { const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, rx = lx - ax, rz = lz - az, t = rx * ux + rz * uz, n = rx * -uz + rz * ux;
      if (t < -pr || t > len + pr || Math.abs(n) > pr) return; const push = (n >= 0 ? pr : -pr) - n; lx += -uz * push; lz += ux * push; });
    const hb = H.houseBox, ex = hb.hw + pr - Math.abs(lx - hb.x), ez = hb.hd + pr - Math.abs(lz - hb.z);
    if (ex > 0 && ez > 0 && p.y < H.roofH) { if (ex < ez) lx = hb.x + Math.sign(lx - hb.x || 1) * (hb.hw + pr); else lz = hb.z + Math.sign(lz - hb.z || 1) * (hb.hd + pr); }
    if (lx !== ox || lz !== oz) { const [wx, wz] = toWorld(lx, lz); p.x = wx; p.z = wz; }
  }
  const near = (p, pt, r) => { const [lx, lz] = toLocal(p.x, p.z); return Math.hypot(lx - pt.x, lz - pt.z) < r; };
  return {
    get fenceLv() { return st.fenceLv || 1; }, fencePrice: { 2: 80, 3: 220 }, get fenceName() { return K.home[st.lv] + '的栅栏'; },
    nearFence(p) { if (!st.built || !H) return false; const [lx, lz] = toLocal(p.x, p.z); return nearSegs(lx, lz, H.fence); },
    upgradeFence() { const l = (st.fenceLv || 1) + 1; if (!PEN_FENCE[l]) return false; st.fenceLv = l; save(); build(); sync(); return true; },
    kind, K, update, collide, get gate() { return st.built && H ? H.gate : null; },
    get built() { return st.built; }, get lv() { return st.lv; }, get homeName() { return K.home[st.lv]; }, get cap() { return K.cap[st.lv]; }, get count() { return st.animals.length; }, get feed() { return st.feed; }, FEED_MAX,
    build() { if (st.built) return false; st.built = true; st.lv = 1; st.feed = 4; save(); build(); return true; },
    nearHome(p) { return st.built && (near(p, H.door, 1.8)); },
    nearTrough(p) { return st.built && near(p, H.troughPos, 1.6); },
    nearSign(p) { if (st.built) return false; const [lx, lz] = toLocal(p.x, p.z); return Math.abs(lx) < K.RW + 1 && Math.abs(lz) < K.RD + 1; },
    nearAnimal(p) { if (!st.built) return null; const [lx, lz] = toLocal(p.x, p.z); let best = null, bd = LOOK[kind].near; beasts.forEach(b => { const d = Math.hypot(lx - b.x, lz - b.z); if (d < bd) { bd = d; best = b; } }); return best; },
    info(b) { const a = st.animals[beasts.indexOf(b)]; return a; },
    addFeed(k) { const v = feedFor(kind, k); if (!v) return 0; if (st.feed + v > FEED_MAX) return -1; st.feed += v; save(); showFeed(); return v; },
    addAnimal(adult) { if (!st.built || st.animals.length >= K.cap[st.lv]) return false; const now = Date.now(); st.animals.push({ born: adult ? now - GROW : now, full: 80, ready: false, next: now + (adult ? 3 * 60 * 1000 : GROW + rndEvery()) }); save(); sync(); return true; },
    // 挤奶 / 剪毛：拿到产品，过一阵子才能再挤 / 再长
    harvest(b) { const a = st.animals[beasts.indexOf(b)]; if (!a || !a.ready) return 0; a.ready = false; a.next = Date.now() + rndEvery(); b.act = 'idle'; save(); return kind === 'sheep' ? 2 : 1; },
    canFeed: k => !!feedFor(kind, k), look: LOOK[kind],
    kill(b) { const i = beasts.indexOf(b); if (i < 0) return 0; const n = b.baby ? K.meatN[1] : K.meatN[0]; puff(b.x, b.z, kind === 'pig' ? 0xffd1dc : 0xffffff); base.remove(b.m.root); beasts.splice(i, 1); st.animals.splice(i, 1); save(); return n; },
    // 拆掉：动物、饲料都没有了，回到空地 + 小木牌
    demolish() { if (!st.built) return 0; const n = st.animals.length; st.built = false; st.animals = []; st.feed = 0; st.lv = 1; save(); sync(); build(); return n; },
    // 洗澡（用户说：猪在泥里玩会变脏，你可以给它洗）：用水壶
    dirt(b) { const a = st.animals[beasts.indexOf(b)]; return a ? a.dirt || 0 : 0; },
    wash(b) { const a = st.animals[beasts.indexOf(b)]; if (!a) return false; a.dirt = 0; save(); splash(b.x, b.z); b.act = 'idle'; b.t = 1.5; return true; },
    pet(b) { b.act = 'idle'; b.t = 1.5; b.face += Math.PI * .1; },
    upgrade() { if (!K.cap[st.lv + 1]) return false; st.lv++; save(); build(); sync(); beasts.forEach(b => { b.x = 0; b.z = K.RD * .3; }); return true; },
    next() { const l = st.lv + 1; return K.cap[l] ? { lv: l, name: K.home[l], cap: K.cap[l], price: K.up[l] } : null; },
    debug: { setLevel(l) { if (!st.built) { st.built = true; st.feed = 4; } st.lv = l; while (st.animals.length > K.cap[l]) st.animals.pop(); save(); build(); sync(); }, readyNow() { st.animals.forEach(a => { a.born = Math.min(a.born, Date.now() - GROW); a.ready = true; a.full = Math.max(a.full, 60); }); save(); sync(); } },
    entrance: () => toWorld(0, K.RD + 1.5),
  };
}
