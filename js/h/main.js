// ===== 菜鸟家园：大致布局（中心广场 + 小路 + 空地块 + 花草树木），还没有房子 =====
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildAvatar, buildPet } from '../p/avatar.js';
import { INV, loadInventory } from '../p/inventory.js';
import { L, createLayout, ribbon } from './layout.js';
import { createGarden, CROPS, LEVELS, itemInfo, chooseSide, inGarden, plotToWorld, worldToPlot } from './garden.js';
import { createHouse, inHouse, HOUSE_NAMES } from './house.js';
import { createGate, fenceMaterial, PEN_FENCE } from './gate.js';
import { createDog } from './dog.js';
import { createCoop, inCoop, COOP } from './coop.js';
import { createPond, inPond, CRITTER } from './pond.js';
import { createBirds, createButterflies } from './birds.js';
import { createLoose } from './loose.js';
import { createNet, createNeighbors, DOG_RANGE } from './neighbors.js';
import { createGrill, createCooker, RECIPES, COOKED_FOOD, FUEL, STOVES, grillSpot } from './cook.js';
import { createRanch, pastureSpots, inPasture, RANCH_FEED, feedFor } from './ranch.js';
import { createStamina, FOOD, MAX as STA_MAX } from './stamina.js';
import { createShop, createStore, SHOP_ITEMS, sellPrice, SHOPS, shopOf } from './shop.js';
import { buildDog } from './dog.js';
import { buildChicken } from './coop.js';
import { createSky, growLight, phaseOf, clockText, gameHour, jumpTo, resetTime, darkness } from './sky.js';

// ---------- 布局：弯弯的主路 + 零零散散的大空地 + 弯弯的小道（见 layout.js） ----------
// 固定种子的随机数：每次打开布局都一样
let seed = 20261107;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const range = (a, b) => a + rnd() * (b - a);
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const LAY = createLayout(rnd), PLOTS = LAY.plots;
const { onPath, onPlot } = LAY;
// 我的空地：先用离出生点最近的那块（以后改成在镇政府领到的那块）；菜园围在它旁边
const DEFAULT_PLOT = PLOTS.slice().sort((a, b) => Math.hypot(a.x - LAY.spawn.x, a.z - LAY.spawn.z) - Math.hypot(b.x - LAY.spawn.x, b.z - LAY.spawn.z))[0];
// 新手：镇长随便分一块没人住的空地（以后联网了，takenPlots 换成别的玩家已经住了的那些）；老玩家还住原来那块
const HOME_KEY = 'xcn_home_plot', MET_KEY = 'xcn_met_mayor';
const takenPlots = () => [];
let metMayor = localStorage.getItem(MET_KEY) === '1';
let homeIdx = parseInt(localStorage.getItem(HOME_KEY), 10);
if (!(homeIdx >= 0 && homeIdx < PLOTS.length)) {
  if (localStorage.getItem('xcn_garden_v1')) { homeIdx = PLOTS.indexOf(DEFAULT_PLOT); metMayor = true; }
  else { const free = PLOTS.map((p, i) => i).filter(i => !takenPlots().includes(i)); homeIdx = free[Math.floor(Math.random() * free.length)]; metMayor = false; }
  try { localStorage.setItem(HOME_KEY, homeIdx); localStorage.setItem(MET_KEY, metMayor ? '1' : '0'); } catch (e) {}
}
const homePlot = PLOTS[homeIdx];
const gardenSide = chooseSide(homePlot, (x, z) => onPath(x, z, 1.5) || onPlot(x, z, 1));
// 三家店的位置：广场外面的草坪上（用户说：商店不要在中间的圆里，移到草坪上），挨在一起，靠近我家那边，面朝广场
const SHOP_SPOTS = (() => {
  const cand = [], homeA = Math.atan2(DEFAULT_PLOT.x, DEFAULT_PLOT.z);   // 商店是大家共用的：位置固定，不跟着各人的空地走
  for (let r = 30; r <= 64; r += 2) for (let a = 0; a < 6.283; a += .03) { const x = Math.sin(a) * r, z = Math.cos(a) * r; if (!onPath(x, z, 7.5) && !onPlot(x, z, 8.5)) cand.push({ x, z, r, a, face: a + Math.PI }); }
  const angD = a => { let d = Math.abs(a - homeA) % 6.283; return Math.min(d, 6.283 - d); };
  cand.sort((p, q) => (p.r + angD(p.a) * 25) - (q.r + angD(q.a) * 25));
  const out = [cand[0]];
  while (out.length < 4) { const nx = cand.filter(c => out.every(o => Math.hypot(o.x - c.x, o.z - c.z) >= 15)).sort((p, q) => Math.hypot(p.x - out[0].x, p.z - out[0].z) - Math.hypot(q.x - out[0].x, q.z - out[0].z))[0]; if (!nx) break; out.push(nx); }
  return out;
})();
const inShopArea = (x, z, m = 0) => SHOP_SPOTS.some(s => Math.hypot(s.x - x, s.z - z) < 7.5 + m);
// 牛、羊的牧场：自家空地后面（被挡住就换到菜园对面那边），入口朝空地
// 用户说：牛圈和商店重叠了 —— 离商店远一点（商店房子 10×8 米，再留 3 米）
const PASTURES = pastureSpots(homePlot, gardenSide, (x, z) => onPath(x, z, 1) || onPlot(x, z, .5) || inGarden(homePlot, gardenSide, x, z, 1) || inShopArea(x, z, 3.5));
const blocked = (x, z, m = .4) => onPath(x, z, m) || onPlot(x, z, m) || inGarden(homePlot, gardenSide, x, z, m) || inShopArea(x, z, m) || inPasture(homePlot, PASTURES, x, z, m);
const WR = L.worldR;

// ---------- 渲染器 / 相机 / 灯光 ----------
const canvas = document.getElementById('scene');
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const colliders = [];   // 圆形障碍物 [x, z, r]：树、灌木、花坛
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, isTouch ? 1.5 : 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xd9efff, 320, 820);
const camera = new THREE.PerspectiveCamera(50, 1, .5, 2400);
camera.position.set(0, 64, 96);

// 天空、太阳、月亮、星星：见 sky.js（白天晚上会变）
const hemi = new THREE.HemisphereLight(0xe4f3ff, 0x5f8f3e, 1.4); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
sun.position.set(160, 230, 105);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 2048 : 4096, isTouch ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -350, right: 350, top: 350, bottom: -350, near: 10, far: 900 });
sun.shadow.bias = -.0006; sun.shadow.normalBias = .4;
scene.add(sun); scene.add(sun.target);

const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .9, ...o });
// 贴在地上的东西用 polygonOffset 一层层叠，避免和草地闪烁
const flatMat = (color, layer) => mat(color, { polygonOffset: true, polygonOffsetFactor: -layer, polygonOffsetUnits: -layer * 4 });
function flat(geo, m, x = 0, z = 0, rotZ = 0) {
  const o = new THREE.Mesh(geo, m); o.rotation.set(-Math.PI / 2, 0, rotZ); o.position.set(x, 0, z); o.receiveShadow = true; scene.add(o); return o;
}

// ---------- 草地（深浅不一的绿色） ----------
{
  const geo = new THREE.PlaneGeometry(1800, 1800, 260, 260), pos = geo.attributes.position, cols = [];
  const a = new THREE.Color(0x78c150), b = new THREE.Color(0x93d463), c = new THREE.Color(0x5fa53f);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const n = Math.sin(x * .05) * Math.cos(y * .06) + Math.sin((x + y) * .11) * .5 + Math.sin(x * .23 - y * .17) * .25;
    const col = a.clone().lerp(n > 0 ? b : c, Math.min(1, Math.abs(n) * .55)); cols.push(col.r, col.g, col.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  flat(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
}

// ---------- 主路和小道：贴地的弯弯的带子 ----------
{
  const road = (pts, w, closed, top, edge, y) => {
    const e = new THREE.Mesh(ribbon(pts, w + .6, closed), edge); e.position.y = y; e.receiveShadow = true; scene.add(e);
    const t = new THREE.Mesh(ribbon(pts, w, closed), top); t.position.y = y + .005; t.receiveShadow = true; scene.add(t);
  };
  const roadTop = flatMat(0xd9b47e, 2), roadEdge = flatMat(0xbd9260, 1), laneTop = flatMat(0xe2c696, 4), laneEdge = flatMat(0xc8a56f, 3);
  LAY.roads.forEach(r => {
    road(r.pts, r.w, r.closed, roadTop, roadEdge, .01);
    if (!r.closed) { const e = r.pts[r.pts.length - 1]; flat(new THREE.CircleGeometry(r.w / 2 + .3, 24), roadEdge, e.x, e.z); flat(new THREE.CircleGeometry(r.w / 2, 24), roadTop, e.x, e.z); }
  });
  LAY.lanes.forEach(l => road(l.pts, l.w, false, laneTop, laneEdge, .015));
}

// ---------- 中心广场：石板地，先空着 ----------
flat(new THREE.CircleGeometry(L.plazaR + .6, 72), flatMat(0xa99c86, 3));
flat(new THREE.CircleGeometry(L.plazaR, 72), flatMat(0xe6dbc4, 4));
for (let r = 3.5; r < L.plazaR; r += 3.5) flat(new THREE.RingGeometry(r - .07, r + .07, 72), flatMat(0xcbbd9f, 5));
for (let k = 0; k < 16; k++) {   // 放射状石板缝
  const a = k / 16 * Math.PI * 2, d = 3.5 + (L.plazaR - 3.5) / 2;
  flat(new THREE.PlaneGeometry(.14, L.plazaR - 3.5), flatMat(0xcbbd9f, 5), Math.sin(a) * d, Math.cos(a) * d, a);
}
// 广场中间一个圆形花坛（矮石圈）
{
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4, .4, 8, 48), mat(0xbdb3a2, { roughness: .8 }));
  ring.rotation.x = Math.PI / 2; ring.position.y = .25; ring.castShadow = ring.receiveShadow = true; scene.add(ring);
  flat(new THREE.CircleGeometry(3.85, 48), flatMat(0x6b4a2e, 6)).position.y = .18;
  colliders.push([0, 0, 4.4]);
}

// ---------- 空地块：浅一点的草坪 + 一圈木栅栏（用户说：一竖一竖的木桩改成一整圈栅栏，门口有大栅栏门，能用钥匙锁） ----------
const plotLawn = flatMat(0xa3db74, 2), plotBorder = flatMat(0x8cc462, 1);
const FENCE_H = 1.15, PLOT_GATE = 6;   // 栅栏高度；空地大门宽 6 米（两扇）
const HOME_GAPS = [];
// 每块空地四条边，去掉门口，剩下的一段段栅栏（空地自己的坐标）
function fenceSegs(p) {
  const h = p.size / 2, out = [];
  const sides = [[-h, -h, h, -h, []], [h, -h, h, h, []], [h, h, -h, h, [[h - PLOT_GATE / 2, h + PLOT_GATE / 2]]], [-h, h, -h, -h, []]];
  if (p === homePlot) { const gs = gardenSide > 0 ? 1 : 3, a = sides[gs], gz = h - 3;   // 自家空地朝菜园那边留个口（接菜园的小路，菜园有自己的栅栏门）
    a[4].push(gardenSide > 0 ? [h + gz - 2.2, h + gz + 2.2] : [h - gz - 2.2, h - gz + 2.2]);
    }
  sides.forEach(([ax, az, bx, bz, gaps], si) => {
    const len = Math.hypot(bx - ax, bz - az); let t = 0;
    // 自家空地的其他口子（菜园、牧场那边）：记下来，每个口子都装一扇能关的栅栏门（用户说：有口子就要有门）
    if (p === homePlot) gaps.forEach(([g0, g1]) => { if (si === 2 && Math.abs((g0 + g1) / 2 - h) < .1) return; HOME_GAPS.push({ si, a: [ax + (bx - ax) * g0 / len, az + (bz - az) * g0 / len], b: [ax + (bx - ax) * g1 / len, az + (bz - az) * g1 / len] }); });
    gaps.sort((u, w) => u[0] - w[0]).concat([[len, len]]).forEach(([g0, g1]) => { if (g0 - t > .05) out.push([ax + (bx - ax) * t / len, az + (bz - az) * t / len, ax + (bx - ax) * g0 / len, az + (bz - az) * g0 / len]); t = g1; });
  });
  return out;
}
let postN = 0, panelN = 0; const FENCE = PLOTS.map(p => { const segs = fenceSegs(p); segs.forEach(([ax, az, bx, bz]) => { const k = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az) / 2.2)); postN += k + 1; panelN += k; }); return segs; });
const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(.16, FENCE_H + .2, .16), mat(0x8a5a30), postN);
const panels = new THREE.InstancedMesh(new THREE.BoxGeometry(1, FENCE_H, .05), fenceMaterial(), panelN);
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
let pi = 0, pj = 0;
const plotGates = [];
const homeInst = { p0: 0, p1: 0, q0: 0, q1: 0 };
PLOTS.forEach((p, idx) => {
  if (p === homePlot) { homeInst.p0 = pi; homeInst.q0 = pj; }
  flat(new THREE.PlaneGeometry(p.size + .5, p.size + .5), plotBorder, p.x, p.z, p.rot);
  flat(new THREE.PlaneGeometry(p.size, p.size), plotLawn, p.x, p.z, p.rot);
  const c = Math.cos(p.rot), sn = Math.sin(p.rot), W = (lx, lz) => [p.x + lx * c + lz * sn, p.z - lx * sn + lz * c];
  FENCE[idx].forEach(([ax, az, bx, bz]) => {
    const len = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.round(len / 2.2)), ang = p.rot - Math.atan2(bz - az, bx - ax);
    for (let i = 0; i <= k; i++) { const [wx, wz] = W(ax + (bx - ax) * i / k, az + (bz - az) * i / k); posts.setMatrixAt(pi++, m4.compose(v.set(wx, (FENCE_H + .2) / 2, wz), q.setFromAxisAngle(up, p.rot), s.set(1, 1, 1))); }
    for (let i = 0; i < k; i++) { const [wx, wz] = W(ax + (bx - ax) * (i + .5) / k, az + (bz - az) * (i + .5) / k); panels.setMatrixAt(pj++, m4.compose(v.set(wx, FENCE_H / 2 + .08, wz), q.setFromAxisAngle(up, ang), s.set(len / k - .14, 1, 1))); }
  });
  if (p === homePlot) { homeInst.p1 = pi; homeInst.q1 = pj; }
  // 大门：在朝路那边（本地 +z）中间；只有自己家的能开关、上锁；别人家的先关着
  const holder = new THREE.Group(); holder.position.set(p.x, 0, p.z); holder.rotation.y = p.rot; scene.add(holder);
  const mine = p === homePlot;
  plotGates.push(createGate({ parent: holder, x: 0, z: p.size / 2, axis: 'x', width: PLOT_GATE - .2, height: FENCE_H, double: true, out: 1, key: mine ? 'xcn_gate_plot' : null, live: mine, shadow: mine, name: '大门' }));
  if (mine) HOME_GAPS.forEach((gp, i) => { const [ax, az] = gp.a, [bx, bz] = gp.b, along = gp.si === 0 || gp.si === 2;
    gp.gate = createGate({ parent: holder, x: (ax + bx) / 2, z: (az + bz) / 2, axis: along ? 'x' : 'z', width: Math.hypot(bx - ax, bz - az) - .2, height: FENCE_H, double: Math.hypot(bx - ax, bz - az) > 3.5, out: gp.si === 0 ? -1 : gp.si === 2 ? 1 : gp.si === 1 ? 1 : -1, key: 'xcn_gate_plot_' + i, name: '空地侧门' }); });
});
posts.castShadow = panels.castShadow = true;
// 🧱 自家栅栏能升级（用户说：升级的时候会更高，更难跳过去）：1 级木栅栏 → 2 级高木栅栏 → 3 级铁栅栏（跳不过去）
const FENCE_LV = { 1: { name: '木栅栏', h: 1.15, jump: .7, price: 0 }, 2: { name: '高木栅栏', h: 1.6, jump: 1.5, price: 150 }, 3: { name: '铁栅栏', h: 2.2, jump: 1.9, price: 400, color: 0x5a6068 } };
let fenceLv = Math.max(1, Math.min(3, +(localStorage.getItem('xcn_fence_lv') || 1)));
for (let i = 0; i < postN; i++) posts.setColorAt(i, new THREE.Color(0xffffff)); for (let i = 0; i < panelN; i++) panels.setColorAt(i, new THREE.Color(0xffffff));
function applyFence() {
  const F = FENCE_LV[fenceLv], k = F.h / FENCE_H, pos = new THREE.Vector3(), rot = new THREE.Quaternion(), sc = new THREE.Vector3(), col = new THREE.Color(F.color || 0xffffff);
  for (let i = homeInst.p0; i < homeInst.p1; i++) { posts.getMatrixAt(i, m4); m4.decompose(pos, rot, sc); sc.y = k; pos.y = (F.h + .2) / 2; posts.setMatrixAt(i, m4.compose(pos, rot, sc)); posts.setColorAt(i, col); }
  for (let i = homeInst.q0; i < homeInst.q1; i++) { panels.getMatrixAt(i, m4); m4.decompose(pos, rot, sc); sc.y = k; pos.y = F.h / 2 + .08; panels.setMatrixAt(i, m4.compose(pos, rot, sc)); panels.setColorAt(i, fenceLv === 3 ? new THREE.Color(0x7d858f) : col); }
  posts.instanceMatrix.needsUpdate = panels.instanceMatrix.needsUpdate = true; posts.instanceColor.needsUpdate = panels.instanceColor.needsUpdate = true;
  try { localStorage.setItem('xcn_fence_lv', String(fenceLv)); } catch (e) {}
}
scene.add(posts); scene.add(panels);
const homeGate = plotGates[PLOTS.indexOf(homePlot)];
function applyFenceGates() { const k = FENCE_LV[fenceLv].h / FENCE_H; homeGate.setHeight(k); HOME_GAPS.forEach(g => g.gate.setHeight(k)); }
applyFence(); applyFenceGates();
// 离自家栅栏多近（不算门口）
function nearHomeFence(pos) { const p = homePlot, c = Math.cos(p.rot), sn = Math.sin(p.rot), dx = pos.x - p.x, dz = pos.z - p.z, lx = dx * c - dz * sn, lz = dx * sn + dz * c;
  return FENCE[PLOTS.indexOf(homePlot)].some(([ax, az, bx, bz]) => { const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, t = (lx - ax) * ux + (lz - az) * uz; return t > .5 && t < len - .5 && Math.abs((lx - ax) * -uz + (lz - az) * ux) < 1.3; }); }
// 自家空地的栅栏挡人，但能跳过去（用户说的）；大门开着才能走过去
function plotFenceCollide(pos, pr = .45) {
  const p = homePlot, h = p.size / 2, c = Math.cos(p.rot), sn = Math.sin(p.rot), dx = pos.x - p.x, dz = pos.z - p.z;
  let lx = dx * c - dz * sn, lz = dx * sn + dz * c; if (Math.abs(lx) > h + 2 || Math.abs(lz) > h + 2 || pos.y > FENCE_LV[fenceLv].jump) return;   // 用户说：栅栏要能跳过去；升级以后更高、更难跳（石墙跳不过去）
  const segs = (homeGate.passable ? FENCE[PLOTS.indexOf(homePlot)] : FENCE[PLOTS.indexOf(homePlot)].concat([[-PLOT_GATE / 2, h, PLOT_GATE / 2, h]])).concat(HOME_GAPS.filter(gp => !gp.gate.passable).map(gp => [...gp.a, ...gp.b]));
  const ox = lx, oz = lz;
  segs.forEach(([ax, az, bx, bz]) => {
    const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, rx = lx - ax, rz = lz - az, t = rx * ux + rz * uz, n = rx * -uz + rz * ux;
    if (t < -pr || t > len + pr || Math.abs(n) > pr) return;
    const push = (n >= 0 ? pr : -pr) - n; lx += -uz * push; lz += ux * push;
  });
  if (lx !== ox || lz !== oz) { pos.x = p.x + lx * c + lz * sn; pos.z = p.z - lx * sn + lz * c; }
}

// ---------- 花 ----------
const FLOWER_COLORS = [0xff6b8a, 0xffd23f, 0xffffff, 0xb48cff, 0xff8c42, 0x6fc3ff, 0xff4d6d, 0xffb3d1];
const flowerSpots = [];
// 一簇一簇地长：先随机找簇中心，再在附近撒花
for (let c = 0; c < 900; c++) {
  const a = rnd() * Math.PI * 2, r = range(26, WR - 10), cx = Math.sin(a) * r, cz = Math.cos(a) * r;
  const color = pick(FLOWER_COLORS), n = 6 + Math.floor(rnd() * 14), spread = range(1.2, 3.2);
  for (let k = 0; k < n; k++) {
    const x = cx + range(-spread, spread), z = cz + range(-spread, spread);
    if (!blocked(x, z)) flowerSpots.push([x, z, rnd() < .85 ? color : pick(FLOWER_COLORS)]);
  }
}
// 路两边的花边
for (let k = 0; k < 2600; k++) {
  const [x, z] = LAY.roadEdge(range(.6, 1.5));
  if (!blocked(x, z, .3)) flowerSpots.push([x, z, pick(FLOWER_COLORS)]);
}
// 广场花坛里的花
for (let k = 0; k < 140; k++) { const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * 3.5; flowerSpots.push([Math.sin(a) * r, Math.cos(a) * r, pick(FLOWER_COLORS), .2]); }
{
  const N = flowerSpots.length;
  const stemGeo = new THREE.CylinderGeometry(.03, .04, .55, 4).translate(0, .275, 0);
  const petalGeo = new THREE.CylinderGeometry(.22, .16, .06, 5).translate(0, .58, 0);
  const coreGeo = new THREE.SphereGeometry(.08, 6, 4).translate(0, .62, 0);
  const stem = new THREE.InstancedMesh(stemGeo, mat(0x3f9a35), N);
  const petal = new THREE.InstancedMesh(petalGeo, mat(0xffffff, { roughness: .6 }), N);
  const core = new THREE.InstancedMesh(coreGeo, mat(0xffc93c, { roughness: .6 }), N);
  const col = new THREE.Color();
  flowerSpots.forEach(([x, z, c, y = 0], i) => {
    const sc = range(.75, 1.35);
    m4.compose(v.set(x, y, z), q.setFromAxisAngle(up, rnd() * 6.28), s.set(sc, sc * range(.8, 1.3), sc));
    stem.setMatrixAt(i, m4); petal.setMatrixAt(i, m4); core.setMatrixAt(i, m4);
    petal.setColorAt(i, col.set(c));
    core.setColorAt(i, col.set(c === 0xffd23f ? 0xff8c42 : 0xffd23f));
  });
  scene.add(stem, petal, core);
}

// ---------- 草丛 ----------
{
  const blade = a => new THREE.ConeGeometry(.09, .7, 3).translate(0, .35, 0).rotateZ(a.z).rotateX(a.x);
  const tuftGeo = mergeGeometries([blade({ z: .25, x: 0 }), blade({ z: -.3, x: .1 }), blade({ z: .05, x: -.3 }), blade({ z: -.1, x: .35 })]);
  const N = isTouch ? 9000 : 24000;
  const tufts = new THREE.InstancedMesh(tuftGeo, mat(0xffffff, { roughness: 1 }), N);
  const col = new THREE.Color(); let n = 0;
  for (let k = 0; k < N * 2 && n < N; k++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (WR + 6), x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (onPath(x, z, .2)) continue;
    if (onPlot(x, z, -.3) && rnd() < .8) continue;   // 空地上草少一点
    if (inGarden(homePlot, gardenSide, x, z, .3) || inHouse(homePlot, x, z, .6) || inCoop(homePlot, gardenSide, x, z, .3) || inShopArea(x, z, .5) || inPasture(homePlot, PASTURES, x, z, .3) || inPond(homePlot, gardenSide, x, z, .5)) continue;   // 菜园里、小木棚里没有野草
    const sc = range(.6, 1.4);
    tufts.setMatrixAt(n, m4.compose(v.set(x, 0, z), q.setFromAxisAngle(up, rnd() * 6.28), s.set(sc, sc * range(.7, 1.4), sc)));
    tufts.setColorAt(n++, col.setHSL(range(.24, .3), range(.45, .6), range(.32, .45)));
  }
  tufts.count = n; scene.add(tufts);
}

// ---------- 灌木（圆滚滚的小树丛） ----------
{
  const N = 420, bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), mat(0xffffff, { flatShading: true }), N * 3);
  const col = new THREE.Color(); let n = 0;
  for (let k = 0; k < N * 6 && n < N * 3; k++) {
    const a = rnd() * Math.PI * 2, r = range(28, WR - 8), x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (blocked(x, z, 2)) continue;
    const base = range(.7, 1.3), hue = range(.26, .33);
    colliders.push([x, z, base * 1.4]);
    for (let j = 0; j < 3 && n < N * 3; j++) {
      const sc = base * range(.6, 1);
      bush.setMatrixAt(n, m4.compose(v.set(x + range(-.9, .9), sc * .7, z + range(-.9, .9)), q.setFromAxisAngle(up, rnd() * 6), s.set(sc, sc * .85, sc)));
      bush.setColorAt(n++, col.setHSL(hue, .5, range(.3, .4)));
    }
  }
  bush.count = n; bush.castShadow = true; bush.receiveShadow = true; scene.add(bush);
}

// ---------- 外圈的树 + 远山 ----------
{
  const N = 520;
  const trunk = new THREE.InstancedMesh(new THREE.CylinderGeometry(.35, .5, 3, 6).translate(0, 1.5, 0), mat(0x8b5a2b), N);
  const crown = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.6, 1).translate(0, 4.6, 0), mat(0xffffff, { flatShading: true }), N);
  const crown2 = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.9, 1).translate(0, 6.6, 0), mat(0xffffff, { flatShading: true }), N);
  const col = new THREE.Color(); let n = 0;
  for (let k = 0; k < N * 4 && n < N; k++) {
    const a = rnd() * Math.PI * 2, r = range(WR - 12, WR + 80), x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (blocked(x, z, 3)) continue;
    const sc = range(.8, 1.5);
    colliders.push([x, z, .55 * sc]);
    m4.compose(v.set(x, 0, z), q.setFromAxisAngle(up, rnd() * 6), s.set(sc, sc * range(.9, 1.2), sc));
    trunk.setMatrixAt(n, m4); crown.setMatrixAt(n, m4); crown2.setMatrixAt(n, m4);
    col.setHSL(range(.25, .32), .5, range(.28, .38)); crown.setColorAt(n, col); crown2.setColorAt(n, col.offsetHSL(0, 0, .05));
    n++;
  }
  [trunk, crown, crown2].forEach(o => { o.count = n; o.castShadow = true; o.receiveShadow = true; scene.add(o); });
  // 远处的小山包
  const hillMat = mat(0x6faf4c, { flatShading: true });
  for (let k = 0; k < 22; k++) {
    const a = k / 22 * Math.PI * 2 + range(-.1, .1), r = range(WR + 230, WR + 310), hgt = range(35, 75);
    const hill = new THREE.Mesh(new THREE.SphereGeometry(range(60, 100), 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    hill.scale.y = hgt / 75; hill.position.set(Math.sin(a) * r, -2, Math.cos(a) * r); scene.add(hill);
  }
}

// ---------- 云 ----------
const clouds = []; let cloudMat = null;
{
  const cm = cloudMat = mat(0xffffff, { roughness: 1, emissive: 0xffffff, emissiveIntensity: .25 });
  for (let k = 0; k < 20; k++) {
    const cloud = new THREE.Group();
    for (let j = 0; j < 5; j++) {
      const b = new THREE.Mesh(new THREE.SphereGeometry(range(4, 7), 10, 8), cm);
      b.position.set(j * 4.5 - 9, range(-1, 2), range(-2, 2)); b.scale.y = .7; cloud.add(b);
    }
    cloud.position.set(range(-520, 520), range(90, 120), range(-520, 520));
    cloud.userData.v = range(1.2, 2.6); scene.add(cloud); clouds.push(cloud);
  }
}

// ---------- 玩家：用自己的皮肤和装饰在家园里走（和游乐园一样） ----------
const $ = id => document.getElementById(id);
// ---------- 我的菜园：先放在离出生点最近的那块空地上（以后改成在镇政府领到的那块） ----------
const garden = createGarden({ scene, plot: homePlot, side: gardenSide, daylight: () => growLight() });
const house = createHouse({ scene, plot: homePlot, side: gardenSide, speed: () => garden.speed, darkness: () => darkness(), wallet: garden.wallet, notify: m => toast(m) });
garden.addContainer('cabinet', house.cabinet, () => house.persist());
garden.addContainer('safe', house.safe, () => house.persist());
const stamina = createStamina();
// 🐶 宠物狗（用户定的：要非常可爱呆萌；饿了自己去狗盆吃；不饿自己玩；忠诚度高帮你看菜园）
const dog = createDog({ scene, isNight: () => darkness() > .55, groundAt: p => house.groundAt(p), collide: p => { house.collide(p, .35); garden.collide(p, .35); plotFenceCollide(p, .35); dog.collideYard(p, .3); },
  guardSpot: () => { const [x, z] = garden.gateWorld(); return { x, z }; }, homeCenter: () => ({ x: homePlot.x, z: homePlot.z }), homeR: homePlot.size * .72,
  notify: m => { if (!nearBed) toast(m); }, onFrisbeeBack: () => {} });
// 🐔 鸡舍（用户说：每个玩家一开始都有一个最低级的鸡舍，只能养鸡）
const onEscape = (k, rec, x, z) => loose.add(k, rec, x, z);
const coop = createCoop({ scene, plot: homePlot, side: gardenSide, isNight: () => darkness() > .55, notify: m => toast(m), onEscape });
// 🐄🐑 牛棚、羊圈（在动物小铺买了才会盖起来）
const cows = createRanch({ scene, plot: homePlot, spot: PASTURES.cow, kind: 'cow', isNight: () => darkness() > .55, notify: m => toast(m), onEscape });
const sheep = createRanch({ scene, plot: homePlot, spot: PASTURES.sheep, kind: 'sheep', isNight: () => darkness() > .55, notify: m => toast(m), onEscape });
const pigs = createRanch({ scene, plot: homePlot, spot: PASTURES.pig, kind: 'pig', isNight: () => darkness() > .55, notify: m => toast(m), onEscape });
const ducks = createRanch({ scene, plot: homePlot, spot: PASTURES.duck, kind: 'duck', isNight: () => darkness() > .55, notify: m => toast(m), onEscape });
const RANCHES = [cows, sheep, pigs, ducks];
// 🔥 做饭：每个人空地里有个烤炉；3 级以上的房子里有灶台（花的柴少、快）
const giveCooked = (k, where) => { if (!garden.bag.add(k, 1)) garden.chest.add(k, 1); renderBag(); toast(`🍳 ${itemInfo(k).name}做好了！（在${where}）放进背包了`); };
const grill = createGrill({ scene, plot: homePlot, side: gardenSide });
const grillCook = createCooker('grill', 'xcn_cook_grill', k => giveCooked(k, '烤炉'));
const houseCook = createCooker('house', 'xcn_cook_house', k => giveCooked(k, '灶台'));
// 🐟 鱼塘（鱼、虾、螃蟹）
const pond = createPond({ scene, plot: homePlot, side: gardenSide, isNight: () => darkness() > .55, notify: m => toast(m) });
const birds = createBirds({ scene, plot: homePlot, side: gardenSide, garden, isNight: () => darkness() > .55, notify: m => toast(m) });
const loose = createLoose({ scene, plot: homePlot, gateOpen: () => homeGate.open, isNight: () => darkness() > .55, notify: m => toast(m),
  avoid: (x, z) => inPasture(homePlot, PASTURES, x, z, 1.5) || inGarden(homePlot, gardenSide, x, z, 1) || coop.inside({ x, z }) || pond.nearSign({ x, z }) });
const bfly = createButterflies({ scene, plot: homePlot, garden, isNight: () => darkness() > .55 });
const KIT_OF = { cow: 'cowshed', sheep: 'sheeppen', pig: 'pigsty', duck: 'duckhouse' };
const PRODUCT = { cow: ['milk', '挤牛奶', '瓶牛奶'], sheep: ['wool', '剪羊毛', '团羊毛'], pig: ['truffle', '捡松露', '个松露'], duck: ['duckegg', '捡鸭蛋', '个鸭蛋'] };
const MEAT_NAME = { beef: '牛肉', mutton: '羊肉', pork: '猪肉', duckmeat: '鸭肉' };
// 空地变大了（地图换了）：以前自己放在地上的狗盆、狗屋、拴狗的木桩都收回背包，重新放一次（只做一次）
try { if (localStorage.getItem('xcn_layout_v') !== '2') {
  if (dog.kennel) { const lv = dog.takeKennel(); if (!garden.bag.add('kennel', 1)) garden.chest.add('kennel', 1); localStorage.setItem('xcn_kennel_bag_lv', String(lv)); }
  if (dog.bowl) { const n = dog.takeBowl(); if (!garden.bag.add('bowl', 1)) garden.chest.add('bowl', 1); if (n) garden.chest.add('dogfood', n); }
  if (dog.chained) { dog.untie(); if (!garden.bag.add('leash', 1)) garden.chest.add('leash', 1); }
  localStorage.setItem('xcn_layout_v', '2'); } } catch (e) {}
// 修 bug 补偿：之前有个版本扔飞盘会把飞盘弄丢，有狗却哪里都找不到飞盘的，还一个（只做一次）
try { if (dog.has && !localStorage.getItem('xcn_fris_fix1')) { if (!garden.bag.count('frisbee') && !garden.chest.count('frisbee') && !house.cabinet.count('frisbee')) { if (!garden.bag.add('frisbee', 1)) garden.chest.add('frisbee', 1); } localStorage.setItem('xcn_fris_fix1', '1'); } } catch (e) {}
let sleeping = null, firstPerson = false, inWater = false;
// 三家店：菜鸟小卖部（小摊）；萌宠小屋、动物小铺是能走进去的大商店（用户说：老板要是人；有些做成大商店）
const SHOP_DECOR = {
  // 萌宠小屋里面：左边一个矮围栏里有两只小狗，右边狗窝、狗盆、一袋袋狗粮、飞盘；货架上一排排狗粮
  pet: (g, { add, M, BOX, CYL, SPH, W, D }) => {
    const pen = M({ color: 0xffffff });
    [[-W + .3, 0, -W + 3.2, 0], [-W + 3.2, 0, -W + 3.2, 2.9], [-W + .3, 2.9, -W + 3.2, 2.9]].forEach(([ax, az, bx, bz]) => add(BOX, pen, [(ax + bx) / 2, .35, (az + bz) / 2], [Math.abs(bx - ax) || .08, .7, Math.abs(bz - az) || .08]));
    add(BOX, M({ color: 0x9fd4ef }), [-W + 1.75, .1, 1.45], [2.8, .04, 2.8]);
    [[-3.6, .9, .8], [-2.6, 2, -2.2]].forEach(([x, z, r]) => { const d = buildDog(); d.root.position.set(x, .1, z); d.root.rotation.y = r; d.head.rotation.z = .3; g.add(d.root); });
    add(CYL, M({ color: 0xffb3c8 }), [3.4, .08, 2.4], [.7, .14, .7]);
    for (let i = 0; i < 4; i++) add(BOX, M({ color: [0xc98a4a, 0xe8b04a][i % 2] }), [2.2 + (i % 2) * .5, .35 + Math.floor(i / 2) * .62, .7], [.42, .6, .3]);   // 一袋袋狗粮
    [[3.4, .9], [3.9, 1.4]].forEach(([x, z]) => add(CYL, M({ color: 0x4f9de8 }), [x, .1, z], [.28, .16, .28]));
    add(CYL, M({ color: 0xff5a4a }), [4.2, .05, 2.8], [.22, .04, .22]);
    for (let i = 0; i < 9; i++) add(BOX, M({ color: [0xff7aa8, 0x6fb7ff, 0xffd23f][i % 3] }), [-2.4 + i * .6, [.75, 1.55, 2.35][i % 3], -D + .6], [.4, .5, .25]);
    return [[-W + 1.75, 1.45, 1.5, 1.5], [2.45, .7, .55, .25], [3.4, 2.4, .7, .7]];
  },
  // 动物小铺里面：左边小围栏里有小鸡和母鸡，右边干草堆、饲料袋；货架上一筐筐鸡蛋
  animal: (g, { add, M, BOX, CYL, SPH, W, D }) => {
    const pen = M({ color: 0x8a5a30 });
    [[-W + .3, 0, -W + 3.2, 0], [-W + 3.2, 0, -W + 3.2, 2.9], [-W + .3, 2.9, -W + 3.2, 2.9]].forEach(([ax, az, bx, bz]) => add(BOX, pen, [(ax + bx) / 2, .3, (az + bz) / 2], [Math.abs(bx - ax) || .08, .6, Math.abs(bz - az) || .08]));
    add(BOX, M({ color: 0xd8b25a }), [-W + 1.75, .09, 1.45], [2.8, .04, 2.8]);
    for (let i = 0; i < 5; i++) { const c = buildChicken(i > 1); c.root.position.set(-4.2 + (i % 3) * .9, .1, .6 + Math.floor(i / 3) * 1.2); c.root.rotation.y = i * 1.3; g.add(c.root); }
    [[3.4, 2.2], [3.4, .9], [2.2, 2.4]].forEach(([x, z]) => add(CYL, M({ color: 0xe0c050 }), [x, .45, z], [.55, 1.1, .55], [0, 0, Math.PI / 2]));
    for (let i = 0; i < 3; i++) add(BOX, M({ color: 0xf2e6c8 }), [1.6 + i * .5, .35, .4], [.42, .7, .32]);
    for (let i = 0; i < 6; i++) { add(BOX, M({ color: 0xc49766 }), [-2.2 + i * .9, [.75, 1.55][i % 2], -D + .6], [.6, .25, .3]); for (let k = 0; k < 3; k++) add(SPH, M({ color: 0xfff4e0 }), [-2.4 + i * .9 + k * .2, [.92, 1.72][i % 2], -D + .6], [.08, .1, .08]); }
    return [[-W + 1.75, 1.45, 1.5, 1.5], [3.4, 1.55, .6, 1.3], [2.2, 2.4, .6, .6], [2.1, .4, .75, .2]];
  },
};
const shops = SHOP_SPOTS.slice(0, 3).map((s, i) => { const kind = ['general', 'pet', 'animal'][i]; const make = kind === 'general' ? createShop : createStore; return make({ scene, x: s.x, z: s.z, face: s.face, buildAvatar, kind, decor: SHOP_DECOR[kind] }); });
const shop = shops[0];
let curShop = 'general';
// 出生在自家空地里、通往菜园的小路旁边，面朝菜园
const ROAD_SPAWN = { ...LAY.spawn };
if (metMayor) { [LAY.spawn.x, LAY.spawn.z] = garden.gateWorld(); LAY.spawn.yaw = garden.gateYaw(); }   // 新手出生在路上（用户说的）

// 在菜鸟家园里默认是小农民的样子；买了别的皮肤的照样穿自己的皮肤
const homeSkin = k => (!k || k === 'explorer') ? 'farmer' : k;
let me = buildAvatar('farmer'), pet = null;
scene.add(me.root);
const player = { pos: new THREE.Vector3(LAY.spawn.x, 0, LAY.spawn.z), vy: 0, ground: true, face: LAY.spawn.yaw };
const petPos = new THREE.Vector3(LAY.spawn.x + 1.5, 0, LAY.spawn.z + 1.5);
const ME = window.__ME;
if (ME) loadInventory(ME.user.id).then(() => {
  const e = INV.equip;
  scene.remove(me.root);
  me = buildAvatar(homeSkin(e.skin), { hand: e.hand, head: e.head, back: e.back });
  scene.add(me.root);
  if (e.pet) { pet = buildPet(e.pet); scene.add(pet.group); }
}).catch(() => {});

const keys = {};
let overview = false;
const cam = { yaw: LAY.spawn.yaw, pitch: .3, dist: 13 };   // 离得远一点：整个人从头到脚都看得见   // 相机在玩家南边，看向北边的广场
addEventListener('keydown', e => {
  if ($('nameUI').classList.contains('show')) return;   // 正在打狗的名字
  keys[e.code] = true;
  { const m = /^Digit([1-9])$/.exec(e.code); if (m && !e.repeat) select(+m[1] - 1); }   // 1~9 选第 1~9 格
  if ((e.code === 'KeyE' || e.code === 'Enter') && !e.repeat) doAction();
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (/^(Key[WASD]|Arrow)/.test(e.code)) $('hint')?.classList.add('hide');
  if (e.code === 'KeyM' && !e.repeat && !chestOpen) overview = !overview;   // M：俯瞰整个小镇
  if (e.code === 'KeyV' && !e.repeat) toggleView();                          // V：第一人称 / 第三人称
  if (e.code === 'KeyF' && !e.repeat && !chestOpen && !shopOpen) eatSelected();   // F：吃掉选中的菜
  if (sleeping && /^(Key[WASD]|Arrow|Space)/.test(e.code)) wakeUp();
  if (e.code === 'Escape' && chestOpen) closeChest();
  if (e.code === 'Escape' && shopOpen) closeShop();
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('blur', () => Object.keys(keys).forEach(k => keys[k] = false));

// 拖动屏幕转视角、滚轮缩放
let drag = null;
canvas.addEventListener('pointerdown', e => { drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
canvas.addEventListener('pointermove', e => {
  if (!drag || drag.id !== e.pointerId) return;
  cam.yaw -= (e.clientX - drag.x) * .006; cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - drag.y) * .004, -1.05, 1.1);
  drag.x = e.clientX; drag.y = e.clientY;
});
['pointerup', 'pointercancel'].forEach(ev => canvas.addEventListener(ev, () => drag = null));
canvas.addEventListener('wheel', e => { if (firstPerson) return; cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * .006, 9, 28); }, { passive: true });

// 触屏：摇杆 + 跳跃键
const stick = $('stick'), knob = stick.querySelector('.knob'), joy = { x: 0, y: 0, id: null };
stick.addEventListener('pointerdown', e => { joy.id = e.pointerId; stick.setPointerCapture(e.pointerId); moveJoy(e); $('hint')?.classList.add('hide'); });
stick.addEventListener('pointermove', e => { if (e.pointerId === joy.id) moveJoy(e); });
const endJoy = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
stick.addEventListener('pointerup', endJoy); stick.addEventListener('pointercancel', endJoy);
function moveJoy(e) {
  const r = stick.getBoundingClientRect(), R = r.width / 2;
  let dx = e.clientX - r.left - R, dy = e.clientY - r.top - R;
  const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
  joy.x = dx / R; joy.y = -dy / R; knob.style.transform = `translate(${dx}px, ${dy}px)`;
}
$('jumpBtn').addEventListener('pointerdown', e => { keys.Space = true; $('jumpBtn').setPointerCapture(e.pointerId); });
['pointerup', 'pointercancel'].forEach(ev => $('jumpBtn').addEventListener(ev, () => keys.Space = false));

// ---------- 菜园操作：快捷栏选东西（按 1~9、0 或者点格子），走到田边按 E（触屏点按钮） ----------
// 快捷栏：第 1 格水壶、第 2 格手套（一直都有），后面是背包里的种子和菜
let nearBed = null, toastT = 0, sel = 0;
const TOOLS = [{ key: 'can', icon: '🪣', name: '水壶（浇水）' }, { key: 'glove', icon: '🧤', name: '手套（抓虫子、收菜）' }];
const hotbarLen = () => TOOLS.length + garden.bag.cap;
function selItem() { if (sel < TOOLS.length) return TOOLS[sel].key; const sl = garden.bag.slots[sel - TOOLS.length]; return sl ? sl.key : null; }
function select(i) { if (i < 0 || i >= hotbarLen()) return; sel = i; renderBag(); const it = selItem(); toast(it ? (sel < TOOLS.length ? TOOLS[sel].name : itemInfo(it).name) : '空格子'); }
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2000); }
function doAction() {
  if (sleeping) return wakeUp();
  if (!shopOpen && !chestOpen && mayorAction()) return renderBag();
  if (!shopOpen && !chestOpen && stealAction()) return renderBag();
  if (!shopOpen && !chestOpen && cookAction()) return renderBag();
  if (!shopOpen && !chestOpen && dogAction()) return renderBag();
  if (!shopOpen && !chestOpen && !nearBed && gateFirst) { toast(gateAct(nearGate, selItem())); return renderBag(); }
  if (!shopOpen && !chestOpen && !nearBed && birdAction()) return renderBag();
  if (!shopOpen && !chestOpen && !nearBed && looseAction()) return renderBag();
  if (!shopOpen && !chestOpen && !nearBed && coopAction()) return renderBag();
  if (!shopOpen && !chestOpen && !nearBed && ranchAction()) return renderBag();
  if (!shopOpen && !chestOpen && !nearBed && pondAction()) return renderBag();
  if (!shopOpen && !chestOpen && !nearBed && !nearGate && fenceAction()) return renderBag();
  if (shopOpen) return closeShop();
  if (chestOpen) return closeChest();
  if (!nearBed && nearShop) return openShop(nearShop.kind);
  if (!nearBed && nearGate) { toast(gateAct(nearGate, selItem())); return renderBag(); }
  if (!nearBed && nearHouse) {
    const r = house.act(nearHouse, selItem(), garden.bag);
    if (r && r.open) return openChest(r.open);
    if (r && r.sleep) return goSleep(r.sleep);
    if (r && r.msg) toast(r.msg);
    return renderBag();
  }
  if (!nearBed && nearBox) return openChest('chest');
  if (!nearBed) return eatSelected();
  const r = garden.useItem(nearBed, selItem());
  if (r && r.msg) toast(r.msg);
  if (r && r.ok !== false && !/没有|不能|🔒|满了/.test(r.msg || '')) stamina.use('work');
  renderBag();
}
$('actBtn').addEventListener('click', () => doAction());
// 快捷栏
// 生的和熟的看起来不一样（用户说）：熟的焦黄色、冒热气 ♨️；生的淡一点、标个“生”
const foodLook = k => COOKED_FOOD[k] ? ' cooked' : RECIPES[k] ? ' raw' : '';
function renderBag() {
  const b = garden.bag, cells = [];
  const num = i => `<u>${i + 1}</u>`;
  TOOLS.forEach((t, i) => cells.push(`<div class="slot tool${sel === i ? ' on' : ''}" data-i="${i}" title="${t.name}">${num(i)}<span class="veg">${t.icon}</span></div>`));
  for (let k = 0; k < b.cap; k++) { const i = k + TOOLS.length, sl = b.slots[k], on = sel === i ? ' on' : '';
    if (!sl) { cells.push(`<div class="slot${on}" data-i="${i}">${num(i)}</div>`); continue; }
    const it = itemInfo(sl.key); cells.push(it.seed
      ? `<div class="slot seed${on}" data-i="${i}" title="${it.name}">${num(i)}<span class="pk"><b>${it.sub}</b></span><i>${sl.n}</i></div>`     // 种子：一个个小纸袋
      : `<div class="slot${on}${foodLook(sl.key)}" data-i="${i}" title="${it.name}">${num(i)}<span class="veg">${it.icon}</span><i>${sl.n}</i></div>`);   // 收获的菜：大大的菜
  }
  $('bag').innerHTML = cells.join('');
}
$('bag').addEventListener('pointerdown', e => { if (chestOpen) return; const c = e.target.closest('.slot'); if (c) { e.preventDefault(); select(+c.dataset.i); } });

// ---------- 🐔 鸡舍：收鸡蛋、往食槽加饲料、摸摸小鸡、升级 ----------
let killT = 0, killB = null;
// 拆养动物的地方（用户说：养动物的东西都要能拆）：拿着手套在门口按两次 E
let demoT = 0, demoWhat = null;
const demoLabel = (what, name, n) => demoT > performance.now() && demoWhat === what ? { label: `⚠️ 再按一次 E：确定拆掉${name}`, sub: n ? `里面的 ${n} 只动物也会一起没有！` : '拆掉就没有了', can: true } : { label: `🔨 拆掉${name}`, sub: n ? `⚠️ 里面还有 ${n} 只动物，拆了它们也没有了` : '拆掉以后可以在动物小铺再买', can: true };
function tryDemolish(what, name, n, doIt) {
  if (!(demoT > performance.now() && demoWhat === what)) { demoT = performance.now() + 3000; demoWhat = what; toast(n ? `⚠️ 里面还有 ${n} 只动物！3 秒内再按一次 E 确定拆掉` : '⚠️ 3 秒内再按一次 E 确定拆掉'); return true; }
  demoT = 0; doIt(); toast(`🔨 ${name}拆掉了`); return true;
}
function coopPrompt(it) {
  if (coop.nearSign(player.pos)) return it === 'coopkit' ? { label: '🐔 在这里盖鸡舍', sub: '这块地就是专门盖鸡舍的地方', can: true } : { label: '🐔 这里是盖鸡舍的地方', sub: '去动物小铺买鸡舍（40 菜币），放进背包，再到这里按 E 盖', can: false };
  if (it === 'glove' && coop.nearCoop(player.pos)) return demoLabel('coop', '鸡舍', coop.count);
  if (coop.nearNest(player.pos)) {
    const n = coop.eggs + coop.gold;
    return n ? { label: `🥚 收鸡蛋（${coop.eggs} 个${coop.gold ? ` + 🌟 金蛋 ${coop.gold} 个` : ''}）`, sub: `鸡蛋能卖钱，也能吃（体力 +8）`, can: true } : { label: '🥚 鸡蛋窝', sub: coop.hungry ? '鸡饿着就不下蛋 —— 往食槽里加饲料' : '还没有蛋，过一会儿再来', can: false };
  }
  if (coop.nearTrough(player.pos)) {
    if (coop.canFeed(it)) return coop.feed >= coop.FEED_MAX ? { label: '🌾 食槽满了', sub: `${coop.feed} / ${coop.FEED_MAX} 份`, can: false } : { label: `🌾 把${itemInfo(it).name}倒进食槽`, sub: `现在 ${coop.feed} / ${coop.FEED_MAX} 份 · 鸡饿了自己来吃`, can: true };
    return { label: `🌾 食槽：${coop.feed} / ${coop.FEED_MAX} 份`, sub: '选中 鸡饲料 / 玉米 / 种子 按 E 倒进去', can: false };
  }
  const b = coop.nearChicken(player.pos);
  if (b && it === 'knife') return { label: killT > performance.now() && killB === b ? '⚠️ 再按一次 E：确定杀掉' : (b.baby ? '🔪 杀小鸡（得到 1 块鸡肉）' : '🔪 杀鸡（得到 2 块鸡肉）'), sub: '杀掉就没有了 · 鸡肉能吃（体力 +15）也能卖', can: true };
  if (b) return { label: b.baby ? '🐣 摸摸小鸡' : '🐔 摸摸母鸡', sub: b.baby ? '小鸡 20 分钟长成母鸡' : '吃饱了才会下蛋', can: true };
  if (coop.nearCoop(player.pos)) { const nx = coop.nextLevel();
    return nx ? { label: `🐔 升级鸡舍：${nx.name}（${nx.price} 菜币）`, sub: `现在 ${coop.lv} 级 ${coop.name} · 住了 ${coop.count} / ${coop.cap} 只 · 升级后能住 ${nx.cap} 只`, can: true }
              : { label: `🐔 ${coop.name}（最高级）`, sub: `住了 ${coop.count} / ${coop.cap} 只 · 偶尔下金蛋 🌟`, can: false }; }
  return null;
}
function coopAction() {
  const it = selItem();
  if (coop.nearSign(player.pos) && it === 'coopkit') { garden.bag.take('coopkit'); coop.rebuild(); toast('🐔 鸡舍盖好了！'); return true; }
  if (it === 'glove' && coop.nearCoop(player.pos)) return tryDemolish('coop', '鸡舍', coop.count, () => coop.demolish());
  if (coop.nearNest(player.pos)) {
    const { n, g } = coop.collectEggs(); if (!n && !g) return false;
    let back = 0, backG = 0;
    for (let i = 0; i < n; i++) if (!garden.bag.add('egg', 1)) back++;
    for (let i = 0; i < g; i++) if (!garden.bag.add('goldegg', 1)) backG++;
    if (back || backG) coop.putBackEggs(back, backG);
    toast(back + backG ? `🎒 背包满了，只拿了 ${n - back + g - backG} 个蛋` : `🥚 收了 ${n} 个鸡蛋${g ? `、🌟 ${g} 个金蛋！` : ''}`); stamina.use('work'); return true;
  }
  if (coop.nearTrough(player.pos) && coop.canFeed(it)) { const v = coop.addFeed(it); if (v < 0) { toast('🌾 食槽装不下了'); return true; } garden.bag.take(it); toast(`🌾 倒进食槽了（${coop.feed} / ${coop.FEED_MAX} 份）`); return true; }
  const b = coop.nearChicken(player.pos);
  if (b && it === 'knife') {   // 杀鸡：按两次 E 确认（免得按错）
    if (!(killT > performance.now() && killB === b)) { killT = performance.now() + 3000; killB = b; toast('⚠️ 3 秒内再按一次 E 确定杀掉'); return true; }
    killT = 0; const meat = coop.kill(b); let got = 0; for (let i = 0; i < meat; i++) if (garden.bag.add('chicken_meat', 1) || garden.chest.add('chicken_meat', 1)) got++;
    toast(`🍗 得到 ${got} 块鸡肉`); stamina.use('work'); return true; }
  if (b) { coop.pet(b); toast(b.baby ? '🐣 叽叽叽～' : '🐔 咯咯哒～'); return true; }
  if (coop.nearCoop(player.pos)) { const nx = coop.nextLevel(); if (!nx) return false;
    if (!garden.wallet.spend(nx.price)) { toast(`菜币不够：要 ${nx.price}`); return true; }
    coop.upgrade(); renderMoney(); toast(`🐔 鸡舍升级成 ${nx.name}！能住 ${nx.cap} 只`); return true; }
  return false;
}
// ---------- 🐄🐑 牛棚、羊圈：挤奶、剪羊毛、喂草料、摸摸、杀、升级 ----------
function ranchPrompt(it) {
  for (const r of RANCHES) {
    const K = r.K, ic = r.look.icon;
    if (r.nearSign(player.pos)) return it === KIT_OF[r.kind] ? { label: `${ic} 在这里盖${K.home[1]}`, sub: '这块地就是专门盖它的地方', can: true } : { label: `${ic} 这里是盖${K.home[1].slice(1)}的地方`, sub: `去动物小铺买${K.home[1].slice(1)}，放进背包，再到这里按 E 盖`, can: false };
    if (!r.built) continue;
    if (it === 'glove' && r.nearHome(player.pos)) return demoLabel(r.kind, r.homeName, r.count);
    const b = r.nearAnimal(player.pos);
    if (b) { const a = r.info(b), nm = b.baby ? K.baby : K.name, [prod, verb] = PRODUCT[r.kind];
      if (it === 'knife') return { label: killT > performance.now() && killB === b ? '⚠️ 再按一次 E：确定杀掉' : `🔪 杀${nm}（得到 ${b.baby ? K.meatN[1] : K.meatN[0]} 块${MEAT_NAME[K.meat]}）`, sub: '杀掉就没有了', can: true };
      if (r.kind === 'pig' && r.dirt(b) > .15) { if (it === 'can') return { label: `🚿 给${nm}洗澡`, sub: '在泥坑里玩脏了 · 太脏的话拱松露会慢一点', can: true }; if (!(a && a.ready)) return { label: `🐷 ${nm}身上好脏`, sub: '选中 🪣 水壶按 E 给它洗澡', can: false }; }
      if (a && a.ready) { if (r.kind !== 'sheep') return { label: `${r.look.prod} ${verb}`, sub: `${itemInfo(prod).name}能卖钱`, can: true };
        return it === 'shears' ? { label: '✂️ 剪羊毛（2 团）', sub: '剪完以后会慢慢再长出来', can: true } : { label: '🧶 羊毛长满了', sub: '选中 ✂️ 剪刀按 E 剪羊毛', can: false }; }
      return { label: `${ic} 摸摸${nm}`, sub: b.baby ? `${K.grow} 分钟长大` : a && a.full < 20 ? '饿了 —— 往食槽里加吃的' : '吃饱了才会有收获', can: true }; }
    if (r.nearTrough(player.pos)) return r.canFeed(it) ? (r.feed >= r.FEED_MAX ? { label: '🌿 食槽满了', sub: '', can: false } : { label: `🌿 把${itemInfo(it).name}倒进食槽`, sub: `现在 ${r.feed} / ${r.FEED_MAX} 份`, can: true })
      : { label: `🌿 食槽：${r.feed} / ${r.FEED_MAX} 份`, sub: { cow: '草料 / 生菜 / 胡萝卜 / 玉米', sheep: '草料 / 生菜 / 胡萝卜 / 玉米', pig: '草料 / 土豆 / 南瓜 / 胡萝卜 / 玉米 / 生菜', duck: '鸡饲料 / 生菜 / 玉米 / 种子' }[r.kind] + ' 选中按 E 倒进去', can: false };
    if (r.nearHome(player.pos)) { const nx = r.next();
      return nx ? { label: `${ic} 升级成${nx.name}（${nx.price} 菜币）`, sub: `现在 ${r.lv} 级 ${r.homeName} · 住了 ${r.count} / ${r.cap} · 升级后能住 ${nx.cap}`, can: true }
                : { label: `${ic} ${r.homeName}（最高级）`, sub: `住了 ${r.count} / ${r.cap}`, can: false }; }
  }
  return null;
}
function ranchAction() {
  const it = selItem();
  for (const r of RANCHES) {
    if (r.nearSign(player.pos) && it === KIT_OF[r.kind]) { garden.bag.take(it); r.build(); toast(`${r.look.icon} ${r.homeName}盖好了！去动物小铺买${r.K.baby}吧`); return true; }
    if (!r.built) continue;
    if (it === 'glove' && r.nearHome(player.pos)) return tryDemolish(r.kind, r.homeName, r.count, () => r.demolish());
    const K = r.K, b = r.nearAnimal(player.pos);
    if (b) { const a = r.info(b);
      if (it === 'knife') {
        if (!(killT > performance.now() && killB === b)) { killT = performance.now() + 3000; killB = b; toast('⚠️ 3 秒内再按一次 E 确定杀掉'); return true; }
        killT = 0; const n = r.kill(b); let got = 0; for (let i = 0; i < n; i++) if (garden.bag.add(K.meat, 1) || garden.chest.add(K.meat, 1)) got++;
        toast(`${itemInfo(K.meat).icon} 得到 ${got} 块${MEAT_NAME[K.meat]}`); stamina.use('work'); return true; }
      if (r.kind === 'pig' && it === 'can' && r.dirt(b) > .15) { r.wash(b); toast(`🚿 给${b.baby ? K.baby : K.name}洗干净了！哼哼～`); stamina.use('work'); return true; }
      if (a && a.ready && (r.kind !== 'sheep' || it === 'shears')) { const n = r.harvest(b), [prod, verb, unit] = PRODUCT[r.kind]; let got = 0; for (let i = 0; i < n; i++) if (garden.bag.add(prod, 1) || garden.chest.add(prod, 1)) got++;
        toast(`${r.look.prod} ${verb}：得到 ${got} ${unit}`); stamina.use('work'); return true; }
      if (a && a.ready) return false;
      r.pet(b); toast(K.sound); return true; }
    if (r.nearTrough(player.pos) && r.canFeed(it)) { const v = r.addFeed(it); if (v < 0) { toast('🌿 食槽装不下了'); return true; } garden.bag.take(it); toast(`🌿 倒进食槽了（${r.feed} / ${r.FEED_MAX} 份）`); return true; }
    if (r.nearHome(player.pos)) { const nx = r.next(); if (!nx) return false;
      if (!garden.wallet.spend(nx.price)) { toast(`菜币不够：要 ${nx.price}`); return true; }
      r.upgrade(); renderMoney(); toast(`升级成${nx.name}了！能住 ${nx.cap} 只`); return true; }
  }
  return false;
}
// ---------- 🔥 做饭：在烤炉 / 灶台旁边，选中生的东西按 E 放上去烤；选中木头、煤按 E 加柴 ----------
function nearCooker() {
  if (grill.near(player.pos)) return grillCook;
  if (nearHouse && nearHouse.kind === 'stove') return houseCook;
  return null;
}
function cookPrompt(it) {
  const c = nearCooker(); if (!c) return null; const S = c.S;
  if (c.busy) return { label: `🔥 正在${S.name === '烤炉' ? '烤' : '煮'}：${itemInfo(RECIPES[c.busy.raw]).name}`, sub: `还要 ${Math.ceil(c.left())} 秒 · 做好了自动放进背包`, can: false };
  if (FUEL[it]) return { label: `${itemInfo(it).icon} 加柴（${itemInfo(it).name}算 ${FUEL[it]} 份）`, sub: `${S.name}里现在有 ${c.fuel} 份柴`, can: true };
  if (RECIPES[it]) { const have = c.fuel + garden.bag.count('wood') * FUEL.wood + garden.bag.count('coal') * FUEL.coal;
    return have >= S.fuel ? { label: `🍳 把${itemInfo(it).name}放上去 → ${itemInfo(RECIPES[it]).name}`, sub: `用 ${S.fuel} 份柴、${S.time} 秒${c.kind === 'house' ? '（房子里的灶台，省柴又快）' : ''}`, can: true }
                          : { label: `🍳 柴不够`, sub: `${S.name}要 ${S.fuel} 份柴：去小卖部买木头或者煤`, can: false }; }
  return { label: `🔥 ${S.name}：有 ${c.fuel} 份柴`, sub: '选中生肉、生鱼、生虾、鸡蛋、土豆、玉米按 E 烧熟 · 选中木头 / 煤按 E 加柴', can: false };
}
function cookAction() {
  const c = nearCooker(); if (!c) return false; const it = selItem();
  if (c.busy) { toast(`🔥 还在做，再等 ${Math.ceil(c.left())} 秒`); return true; }
  if (FUEL[it]) { if (!c.addFuel(it)) { toast('柴够多了'); return true; } garden.bag.take(it); toast(`${itemInfo(it).icon} 加了柴（现在 ${c.fuel} 份）`); return true; }
  if (!RECIPES[it]) return false;
  // 柴不够：自动从背包里拿木头、煤
  while (c.fuel < c.S.fuel) { const f = garden.bag.count('wood') ? 'wood' : garden.bag.count('coal') ? 'coal' : null; if (!f) break; garden.bag.take(f); c.addFuel(f); }
  if (c.fuel < c.S.fuel) { toast(`柴不够：要 ${c.S.fuel} 份，去小卖部买木头或者煤`); return true; }
  garden.bag.take(it); c.start(it); toast(`🔥 开始做${itemInfo(RECIPES[it]).name}（${c.S.time} 秒）`); stamina.use('work'); return true;
}
// ---------- 🐟 鱼塘：挖鱼塘、撒鱼食、用渔网捞、升级、拆 ----------
function fencePrompt(it) {
  // 用户找不到升级栅栏：走到栅栏旁边，不管拿着什么都会提示（要按两次 E 确认，免得按错花了菜币）
  if (nearGate) return null;
  if (nearHomeFence(player.pos)) {
    const F = FENCE_LV[fenceLv], nx = FENCE_LV[fenceLv + 1];
    if (!nx) return { label: `🧱 ${F.name}（最高级）`, sub: `${F.h} 米高，谁也跳不过去`, can: false };
    if (fenceUpT > performance.now() && fenceUpWhat === 'home') return { label: `⚠️ 再按一次 E：花 ${nx.price} 菜币升级成${nx.name}`, sub: `${nx.h} 米高${fenceLv + 1 === 3 ? '，跳不过去' : '，更难跳过去'}`, can: true };
    return { label: `🧱 升级栅栏：${nx.name}（${nx.price} 菜币）`, sub: `现在是${F.name}（${F.h} 米）→ ${nx.h} 米高${fenceLv + 1 === 3 ? '，跳不过去' : '，更难跳过去'}`, can: true };
  }
  // 菜园、鸡舍、牧场的栅栏（用户说：菜园栏杆、动物栏杆也要能升级）
  const e = ENCLOSURES().find(x => x.nearFence(player.pos)); if (!e) return null;
  const lv = e.fenceLv, F = PEN_FENCE[lv], nx = PEN_FENCE[lv + 1];
  if (!nx) return { label: `🧱 ${e.fenceName}：${F.name}（最高级）`, sub: '跳不过去', can: false };
  if (fenceUpT > performance.now() && fenceUpWhat === e) return { label: `⚠️ 再按一次 E：花 ${e.fencePrice[lv + 1]} 菜币升级`, sub: `${e.fenceName}升级成${nx.name}${lv + 1 === 3 ? '，跳不过去' : '，更高、更难跳'}`, can: true };
  return { label: `🧱 升级${e.fenceName}：${nx.name}（${e.fencePrice[lv + 1]} 菜币）`, sub: `现在是${F.name} · 升级后${lv + 1 === 3 ? '跳不过去' : '更高、更难跳过去'}`, can: true };
}
let fenceUpT = 0, fenceUpWhat = null;
const ENCLOSURES = () => [garden, coop, cows, sheep, pigs, ducks];
function fenceAction() {
  let what = null, price = 0, name = '';
  if (nearHomeFence(player.pos)) { const nx = FENCE_LV[fenceLv + 1]; if (!nx) return false; what = 'home'; price = nx.price; name = nx.name; }
  else { const e = ENCLOSURES().find(x => x.nearFence(player.pos)); if (!e) return false; const nx = PEN_FENCE[e.fenceLv + 1]; if (!nx) return false; what = e; price = e.fencePrice[e.fenceLv + 1]; name = nx.name; }
  if (!(fenceUpT > performance.now() && fenceUpWhat === what)) { fenceUpT = performance.now() + 3000; fenceUpWhat = what; toast(`🧱 3 秒内再按一次 E：花 ${price} 菜币升级成${name}`); return true; }
  fenceUpT = 0;
  if (!garden.wallet.spend(price)) { toast(`菜币不够：要 ${price}`); return true; }
  if (what === 'home') { fenceLv++; applyFence(); applyFenceGates(); } else what.upgradeFence();
  renderMoney(); toast(`🧱 ${what === 'home' ? '栅栏' : what.fenceName}升级成${name}了！`); return true;
}



// ---------- 🏛️ 镇长（用户说：新手先站在路上，路牌告诉你镇长在哪；找到镇长，他随便分一块没人住的空地给你，里面有最低级的菜园、鸡舍、房子） ----------
function boardTex(text, w = 256, h = 96, bg = '#f2e1bd', fg = '#5a3a1a', font = 'bold 40px sans-serif') { const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = bg; x.fillRect(0, 0, w, h); x.fillStyle = fg; x.font = font; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, w / 2, h / 2); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
// 镇政府：广场外面草坪上的一栋房子，镇长站在里面的柜台后面（用户说：镇长要有一个房子，不一定在市中心）
const HALL_SPOT = SHOP_SPOTS[3];
const hall = createStore({ scene, x: HALL_SPOT.x, z: HALL_SPOT.z, face: HALL_SPOT.face, buildAvatar, kind: 'hall', decor: (g, { add, M, BOX, CYL, W, D }) => {
  const pole = add(CYL, M({ color: 0xdddddd, metalness: .5 }), [-W - 1.2, 2.5, D - .5], [.06, 5, .06]);
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, .85), new THREE.MeshStandardMaterial({ map: boardTex('菜鸟小镇', 256, 160, '#e8473e', '#ffffff', 'bold 46px sans-serif'), side: THREE.DoubleSide })); flag.position.set(-W - .48, 4.5, D - .5); g.add(flag);
  [-1, 1].forEach(s => add(CYL, M({ color: 0xffffff }), [s * 2.2, 1.7, D + .35], [.18, 3.4, .18]));   // 门口两根白柱子
  return []; } });
const MAYOR = (() => { const [x, z] = hall.door(); return { x, z }; })();
const mayor = { near: p => hall.near(p), update: dt => hall.update(dt, player.pos) };
colliders.push([...(() => { const [x, z] = (() => { const c = Math.cos(HALL_SPOT.face), s2 = Math.sin(HALL_SPOT.face), lx = -5 - 1.2, lz = 4 - .5; return [HALL_SPOT.x + lx * c + lz * s2, HALL_SPOT.z - lx * s2 + lz * c]; })(); return [x, z, .2]; })()]);
// 出生的路边：一块路牌，告诉你镇长在广场
if (!metMayor) { const g = new THREE.Group(); const a = Math.atan2(-ROAD_SPAWN.x, -ROAD_SPAWN.z), sx = ROAD_SPAWN.x + Math.sin(a + Math.PI / 2) * 3.2, sz = ROAD_SPAWN.z + Math.cos(a + Math.PI / 2) * 3.2; g.position.set(sx, 0, sz); g.rotation.y = a + Math.PI; scene.add(g);
  const p = new THREE.Mesh(new THREE.BoxGeometry(.1, 2, .1), mat(0x9a6a3c)); p.position.y = 1; g.add(p);
  const b = new THREE.Mesh(new THREE.BoxGeometry(1.8, .6, .05), new THREE.MeshStandardMaterial({ map: boardTex('🏛️ 镇政府在广场旁边', 384, 128, '#f2e1bd', '#5a3a1a', 'bold 40px sans-serif') })); b.position.y = 1.8; g.add(b); colliders.push([sx, sz, .2]); }
let guideHome = localStorage.getItem('xcn_guide_home') === '1';
if (!metMayor) homeGate.setLock(true);   // 还没找镇长：自己的空地大门先锁着
function talk(msg, sec = 7) { const el = $('talk'); el.innerHTML = msg; el.classList.add('show'); clearTimeout(talk.t); talk.t = setTimeout(() => el.classList.remove('show'), sec * 1000); }
$('talk').onclick = () => $('talk').classList.remove('show');
function dirWord(x, z) { const d = Math.hypot(x - MAYOR.x, z - MAYOR.z); return `离这里大约 ${Math.round(d / 10) * 10} 米`; }
function mayorPrompt() {
  if (!mayor.near(player.pos)) return null;
  return metMayor ? { label: '🏛️ 和镇长打招呼', sub: '你的空地已经领到了', can: true } : { label: '🏛️ 和镇长说话：领一块空地', sub: '镇长会分给你一块没人住的空地', can: true };
}
function mayorAction() {
  if (!mayor.near(player.pos)) return false;
  if (metMayor) { talk('🏛️ <b>镇长</b>：好好种菜呀！有什么事，随时来广场找我。'); return true; }
  metMayor = true; guideHome = true; homeGate.setLock(false);
  net.claim(homeIdx).then(ok => { if (ok) publishMe(); else { toast('这块空地刚被别人领走了，镇长给你换一块'); setTimeout(() => location.reload(), 2500); } });
  try { localStorage.setItem(MET_KEY, '1'); localStorage.setItem('xcn_guide_home', '1'); } catch (e) {}
  talk(`🏛️ <b>镇长</b>：欢迎来到菜鸟小镇！<br>这块没人住的空地就分给你啦（${dirWord(homeGateW.x, homeGateW.z)}）。<br>里面给你准备了一个小菜园、一个小鸡窝和一间小木屋，大门钥匙在你背包里。<br>跟着上面的箭头走过去吧！`, 12);
  return true;
}
const homeGateW = (() => { const [x, z] = plotToWorld(homePlot, 0, homePlot.size / 2); return { x, z }; })();
let guideT = 0;
function updateGuide(dt) {
  if ((guideT += dt) < .2) return; guideT = 0;
  const el = $('guide');
  let tx, tz, text;
  if (!metMayor) { tx = MAYOR.x; tz = MAYOR.z; text = '去镇政府找镇长，领一块空地'; }
  else if (guideHome) {
    const [lx, lz] = worldToPlot(homePlot, player.pos.x, player.pos.z), hs = homePlot.size / 2;
    if (Math.abs(lx) < hs && Math.abs(lz) < hs) { guideHome = false; try { localStorage.setItem('xcn_guide_home', '0'); } catch (e) {} toast('🏡 到家啦！这块空地就是你的了'); el.classList.remove('show'); return; }
    tx = homeGateW.x; tz = homeGateW.z; text = '去你的空地';
  } else { el.classList.remove('show'); return; }
  const d = Math.hypot(tx - player.pos.x, tz - player.pos.z), ang = (cam.yaw - Math.atan2(tx - player.pos.x, tz - player.pos.z)) * 180 / Math.PI;
  el.innerHTML = `<b style="transform:rotate(${ang.toFixed(0)}deg)">⬆</b><span>🧭 ${text} · ${Math.round(d)} 米</span>`; el.classList.add('show');
}

// ---------- 🥬 联网：别人家的菜园、偷菜、帮忙（用户说的） ----------
// 跳过矮栅栏、或者跑着使劲撞开栅栏（很费体力，2 分钟后自己修好），进别人家菜园挖菜；
// 他家有狗：你挖第一棵菜时，狗在 4 个菜园远以内就会冲过来咬你，把你撞开；咬 3 次你就被赶回自己家。
// 偷菜时被在线的主人看到：1 小时内不能再偷他家的菜。也可以帮别人抓虫、浇水。
const net = createNet(ME);
const neighbors = createNeighbors({ scene, plots: PLOTS, myIdx: homeIdx, onPath, onPlot, daylight: () => growLight(), buildAvatar, onBite: (g, h) => {
  const dx = player.pos.x - g.pos.x, dz = player.pos.z - g.pos.z, d = Math.hypot(dx, dz) || 1;
  player.pos.x += dx / d * 3; player.pos.z += dz / d * 3; player.vy = 5; player.ground = false; stamina.use('work', 15);
  if (g.bites >= 3) { g.mode = 'back'; g.bites = 0; player.pos.set(LAY.spawn.x, 0, LAY.spawn.z); player.face = LAY.spawn.yaw; toast(`🐶 被${h.name}家的${g.name}咬了好几口，逃回自己家了！`); }
  else toast(`🐶 ${h.name}家的${g.name}咬了你一口！（${g.bites} / 3）`);
} });
const banUntil = uid => +(localStorage.getItem('xcn_ban_' + uid) || 0);
const stolenHere = new Set();   // 这次去过谁家挖了菜（挖第一棵时狗冲过来）
function stealPrompt(it) {
  const n = neighbors.nearBed(player.pos); if (!n) return null;
  const { h, bd } = n, b = bd.st, C = b.crop && CROPS[b.crop], who = `${h.name}家的菜园`;
  if (it === 'glove' && b.crop && b.phase === 'ripe') {
    if (banUntil(h.uid) > Date.now()) return { label: `😳 现在不能偷${h.name}家的菜`, sub: `被他发现了，还要 ${Math.ceil((banUntil(h.uid) - Date.now()) / 60000)} 分钟`, can: false };
    return { label: `🧤 偷偷挖走一棵${C.name}`, sub: `${who} · 还剩 ${b.plants} 棵${h.guard ? ` · 小心他家的狗${h.guard.name}` : ''}`, can: true };
  }
  if (it === 'glove' && b.bugs > 0) return { label: `🧤 帮${h.name}抓虫子（${b.bugs} 只）`, sub: who, can: true };
  if (it === 'can') return { label: `💧 帮${h.name}浇水`, sub: who, can: true };
  return { label: `🥬 ${who}`, sub: (C ? `${C.name} · ${b.phase === 'ripe' ? '熟了' : '还没熟'}` : '空的田') + ' · 选 🧤 手套挖菜 / 抓虫，选 🪣 水壶浇水', can: false };
}
function stealAction() {
  const n = neighbors.nearBed(player.pos); if (!n) return false;
  const { h, bd, i } = n, b = bd.st, it = selItem();
  if (it === 'glove' && b.crop && b.phase === 'ripe') {
    if (banUntil(h.uid) > Date.now()) { toast(`😳 被${h.name}发现过，1 小时内不能再偷他家的菜`); return true; }
    const got = h.garden.stealOne(i); if (!got) return true;
    if (!garden.bag.add(got[0], got[1])) garden.chest.add(got[0], got[1]);
    neighbors.hold(h.uid); net.send(h.uid, 'steal', i, 1); stamina.use('work');
    toast(`🤫 挖走了 ${got[1]} 个${itemInfo(got[0]).name}`);
    if (!stolenHere.has(h.uid)) { stolenHere.add(h.uid); const g = h.guard; if (g && Math.hypot(player.pos.x - g.home.x, player.pos.z - g.home.z) < DOG_RANGE) { g.mode = 'chase'; g.bites = 0; setTimeout(() => toast(`🐶 ${h.name}家的${g.name}冲过来了！快跑！`), 900); } }
    const owner = neighbors.online(h.uid);
    if (owner && Math.hypot(owner.x - player.pos.x, owner.z - player.pos.z) < 30) {
      try { localStorage.setItem('xcn_ban_' + h.uid, Date.now() + 3600e3); } catch (e) {}
      net.send(h.uid, 'caught'); setTimeout(() => toast(`😳 被${h.name}看到了！1 小时内不能再偷他家的菜`), 1600);
    }
    return true;
  }
  if (it === 'glove' && b.bugs > 0) { h.garden.helpShoo(i); neighbors.hold(h.uid); net.send(h.uid, 'shoo', i); toast(`👍 帮${h.name}抓走了一只虫子`); return true; }
  if (it === 'can') { h.garden.helpWater(i); neighbors.hold(h.uid); net.send(h.uid, 'water', i); toast(`💧 帮${h.name}浇了水`); return true; }
  return false;
}
// 跑着使劲撞别人家的栅栏：撞 1 秒就撞开
let ramT = 0, ramWho = null;
function ramCheck(dt, hit, running) {
  if (hit && running && !hit.garden.broken) { if (ramWho !== hit) { ramWho = hit; ramT = 0; } ramT += dt; stamina.use('work', dt * 3);
    if (ramT > 1) { ramT = 0; hit.garden.breakFence(120); stamina.use('work', 20); toast(`💥 撞开了${hit.name}家菜园的栅栏！（2 分钟后会自己修好）`); } }
  else if (!hit) { ramT = Math.max(0, ramT - dt); }
}
// 主人这边：收到偷菜 / 帮忙的消息，照着改自己的菜园
async function readInbox() {
  const rows = await net.inbox(); if (!rows.length) return;
  const by = {};
  rows.forEach(e => {
    const nm = neighbors.nameOf(e.actor_id) || '有人', x = by[nm] ||= { steal: 0, help: 0, caught: 0 };
    if (e.kind === 'steal') { for (let k = 0; k < (e.n || 1); k++) if (garden.stealOne(e.bed)) x.steal++; }
    else if (e.kind === 'shoo') { if (garden.helpShoo(e.bed)) x.help++; }
    else if (e.kind === 'water') { if (garden.helpWater(e.bed)) x.help++; }
    else if (e.kind === 'caught') x.caught++;
  });
  Object.entries(by).forEach(([nm, x], k) => setTimeout(() => toast([x.steal ? `🥕 ${nm}偷了你 ${x.steal} 棵菜` : '', x.help ? `👍 ${nm}帮你干了 ${x.help} 次活` : '', x.caught ? `👀 你抓到${nm}在偷菜！他 1 小时内不能再来` : ''].filter(Boolean).join('，')), k * 2200));
  publishMe();
}
const publishMe = () => net.publish(homeIdx, garden.snapshot(), dog.has ? { has: true, name: dog.name, loyal: dog.loyal } : { has: false });
async function pullNeighbors() { neighbors.sync(await net.states()); }
const live = net.presence(p => neighbors.onPos(p));
if (net.ok) {
  // 空地以数据库为准：我已经有一块 → 就住那块；我这块被别人住了 → 换一块空的
  (async () => {
    const rows = await net.plots(); if (!rows) return;
    const mine = rows.find(r => r.user_id === net.id), taken = rows.filter(r => r.user_id !== net.id).map(r => r.plot_index);
    const moveTo = i => { try { localStorage.setItem(HOME_KEY, i); } catch (e) {} location.reload(); };
    if (mine) { if (mine.plot_index !== homeIdx) moveTo(mine.plot_index); return; }
    if (taken.includes(homeIdx)) { const free = PLOTS.map((p, i) => i).filter(i => !taken.includes(i)); if (free.length) moveTo(free[Math.floor(Math.random() * free.length)]); return; }
    if (metMayor) await net.claim(homeIdx);
    publishMe();
  })();
  pullNeighbors(); readInbox();
  setInterval(pullNeighbors, 20000); setInterval(readInbox, 10000); setInterval(() => { if (metMayor) publishMe(); }, 20000);
  setInterval(() => live.send({ x: +player.pos.x.toFixed(2), y: +player.pos.y.toFixed(2), z: +player.pos.z.toFixed(2), face: +player.face.toFixed(2), plot: homeIdx, skin: ME && INV.equip ? homeSkin(INV.equip.skin) : 'farmer' }), 400);
  document.addEventListener('visibilitychange', () => { if (document.hidden && metMayor) publishMe(); });
}
// ---------- 🪢 跑出来的动物、牵绳（用户说：门开着动物会跑出来；用牵绳牵回去） ----------
const HOMES = { chicken: coop, cow: cows, sheep, pig: pigs, duck: ducks };
const homeNameOf = k => k === 'chicken' ? coop.name : HOMES[k].homeName;
function penAnimalNear() {
  const c = coop.nearChicken && coop.nearChicken(player.pos); if (c) return { b: c, home: coop, kind: 'chicken', nm: c.baby ? '小鸡' : '母鸡' };
  for (const [k, r] of Object.entries(HOMES)) { if (k === 'chicken' || !r.built) continue; const b = r.nearAnimal(player.pos); if (b) return { b, home: r, kind: k, nm: b.baby ? r.K.baby : r.K.name }; }
  return null;
}
const meatOf = a => a.kind === 'chicken' ? ['chicken_meat', a.baby ? 1 : 2] : [HOMES[a.kind].K.meat, a.baby ? HOMES[a.kind].K.meatN[1] : HOMES[a.kind].K.meatN[0]];
function loosePrompt(it) {
  const L = loose.led;
  if (it === 'rope' && L) return { label: '🪢 松开牵绳', sub: `正牵着${loose.nameOf(L)} · 带它走进${homeNameOf(L.kind)}的围栏里，它就自己回去了`, can: true };
  const a = loose.nearest(player.pos);
  if (a && a !== L) {
    const nm = loose.nameOf(a);
    if (it === 'rope') return { label: `🪢 用牵绳牵住${nm}`, sub: `带它走进${homeNameOf(a.kind)}的围栏里，它就回去了`, can: true };
    if (it === 'knife') return { label: killT > performance.now() && killB === a ? '⚠️ 再按一次 E：确定杀掉' : `🔪 杀${nm}`, sub: '杀掉就没有了', can: true };
    return { label: `${loose.iconOf(a)} 跑出来的${nm}`, sub: `选中 🪢 牵绳按 E 牵住它，带回${homeNameOf(a.kind)}（动物小铺有卖牵绳）`, can: false };
  }
  if (it === 'rope') { const b = penAnimalNear(); return b ? { label: `🪢 把${b.nm}牵出来遛遛`, sub: '牵回围栏里就自己回去了', can: true } : { label: '🪢 牵绳', sub: '走到跑出来的动物旁边按 E 牵住它', can: false }; }
  return null;
}
function looseAction() {
  const it = selItem(), L = loose.led;
  if (it === 'rope' && L) { loose.unlead(); toast(`🪢 松开了${loose.nameOf(L)}`); return true; }
  const a = loose.nearest(player.pos);
  if (a && a !== L) {
    if (it === 'rope') { loose.lead(a); toast(`🪢 牵住${loose.nameOf(a)}了：带它走进${homeNameOf(a.kind)}的围栏里`); return true; }
    if (it === 'knife') { if (!(killT > performance.now() && killB === a)) { killT = performance.now() + 3000; killB = a; toast('⚠️ 3 秒内再按一次 E 确定杀掉'); return true; }
      killT = 0; const [meat, n] = meatOf(a); loose.remove(a); if (!garden.bag.add(meat, n)) garden.chest.add(meat, n); toast(`🔪 得到 ${n} 块${itemInfo(meat).name}`); return true; }
    return false;
  }
  if (it === 'rope' && !L) { const b = penAnimalNear(); if (!b) return false; const r = b.home.takeOut(b.b); if (!r) return false; const x = loose.add(b.kind, r.rec, r.x, r.z, true); toast(`🪢 把${loose.nameOf(x)}牵出来了`); return true; }
  return false;
}
// 牵着的动物走进自己窝的围栏：自动回去
function looseHome() {
  const a = loose.led; if (!a) return; const home = HOMES[a.kind];
  if (!home.inside(a)) { a.warned = false; return; }
  if (home.takeBack(a.rec)) { loose.remove(a); toast(`${loose.iconOf(a)} ${loose.nameOf(a)}回到${homeNameOf(a.kind)}了`); }
  else if (!a.warned) { a.warned = true; toast(`${homeNameOf(a.kind)}住满了，先升级再牵回来`); }
}
// ---------- 🐦 小鸟、鸟笼、鸟屋；🦋 蝴蝶、蝴蝶网（用户说的） ----------
const BIRD_ITEMS = ['birdseed', 'cage', 'cagebird', 'birdhouse', 'bugnet', 'butterfly'];
function birdPrompt(it) {
  const p = player.pos;
  if (birds.nearSite(p)) {
    if (!birds.built) return it === 'birdhouse' ? { label: '🏡 把鸟屋立在这里', sub: '这块地就是专门放鸟屋的地方', can: true } : { label: '🏡 这里是放鸟屋的地方', sub: '去动物小铺买鸟屋，放进背包，再到这里按 E', can: false };
    if (it === 'glove') return demoLabel('birdhouse', '鸟屋', 0);
    if (birds.eggs) return { label: `🪺 收鸟蛋（${birds.eggs} 个）`, sub: '不收的话，过一阵可能会孵出小鸟宝宝', can: true };
    if (!BIRD_ITEMS.includes(it) || it === 'birdhouse') return { label: '🏡 鸟屋', sub: `住着 ${birds.residents} 只小鸟（好感 50 以上的会住进来）· 两只住进来才会下蛋`, can: false };
  }
  if (it === 'birdhouse') return birds.built ? { label: '🏡 你已经立了一个鸟屋', sub: '一家只能有一个', can: false } : { label: '🏡 鸟屋要放在“鸟屋的地方”', sub: '空地里有块写着“鸟屋的地方”的小木牌，走到那里按 E', can: false };
  if (it === 'birdseed') { const b = birds.nearestBird(p, 5); return { label: '🌻 撒一把鸟食', sub: b ? `${birds.nameOf(b)} 好感 ${b.d.love}/100 · 撒完站着别动` : '撒完站着别动，小鸟会飞过来吃（好感变高）', can: true }; }
  if (it === 'cage') { const b = birds.nearestBird(p, 2); return b ? { label: `🧺 把${birds.nameOf(b)}关进鸟笼`, sub: `好感 ${b.d.love}/100 · 关进去就能拿着走、拿去卖`, can: true } : { label: '🧺 鸟笼', sub: '走到小鸟旁边按 E（小鸟怕人：先撒鸟食，站着别动等它过来）', can: false }; }
  if (it === 'cagebird') return { label: `🐦 打开笼子，放${birds.lastCaged()}出来`, sub: '笼子里的小鸟可以拿着到处走 · 也能拿去动物小铺卖', can: true };
  if (it === 'bugnet') return bfly.nearest(p) ? { label: '🥍 抓蝴蝶', sub: '抓到的蝴蝶能卖，也能放走', can: true } : { label: '🥍 蝴蝶网', sub: darkness() > .55 ? '晚上蝴蝶都躲起来了' : '走到蝴蝶旁边按 E · 菜园那边蝴蝶多', can: false };
  if (it === 'butterfly') return { label: '🦋 放走蝴蝶', sub: '放走的蝴蝶会留在你家飞来飞去', can: true };
  return null;
}
function birdAction() {
  const it = selItem(), p = player.pos, bag = garden.bag;
  const give = (k, n = 1) => { if (!bag.add(k, n)) garden.chest.add(k, n); };
  if (birds.nearSite(p)) {
    if (!birds.built) { if (it !== 'birdhouse') return false; bag.take('birdhouse'); birds.build(); toast('🏡 鸟屋立好了！好感高的小鸟晚上会回来住'); return true; }
    if (it === 'glove') return tryDemolish('birdhouse', '鸟屋', 0, () => birds.demolish());
    if (birds.eggs) { const n = birds.collectEggs(); give('birdegg', n); toast(`🪺 收了 ${n} 个鸟蛋`); return true; }
    if (!BIRD_ITEMS.includes(it) || it === 'birdhouse') return false;
  }
  if (it === 'birdhouse') { toast(birds.built ? '🏡 你已经立了一个鸟屋' : '🏡 鸟屋要放在“鸟屋的地方”（空地里的小木牌）'); return true; }
  if (it === 'birdseed') { const [x, z] = frontOf(1.4); bag.take('birdseed'); birds.seed(x, z); toast('🌻 撒了一把鸟食：站着别动，等小鸟飞过来'); return true; }
  if (it === 'cage') { const b = birds.nearestBird(p, 2); if (!b) { toast('🧺 走到小鸟旁边再按 E'); return true; } const nm = birds.catchBird(b); bag.take('cage'); give('cagebird'); toast(`🧺 把${nm}关进鸟笼了：选中它就能拿着看`); return true; }
  if (it === 'cagebird') { const [x, z] = frontOf(1); const nm = birds.release(x, z); bag.take('cagebird'); give('cage'); toast(`🐦 ${nm}飞出来了`); return true; }
  if (it === 'bugnet') { if (!bfly.catchOne(p)) { toast('🥍 没抓到，走近一点'); return true; } give('butterfly'); toast('🦋 抓到一只蝴蝶！'); stamina.use('work'); return true; }
  if (it === 'butterfly') { const [x, z] = frontOf(1); bag.take('butterfly'); bfly.release(x, z); toast('🦋 蝴蝶飞走了'); return true; }
  return false;
}
// 🎣 钓鱼（用户说：站在岸上用鱼竿；等一会儿鱼竿会动，及时收杆就钓到鱼、虾或者螃蟹，螃蟹概率小）
let fishing = null;
const bobber = new THREE.Group(); bobber.visible = false; scene.add(bobber);
{ const top = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xe8352b)); bobber.add(top); const bot = new THREE.Mesh(new THREE.SphereGeometry(.09, 12, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), mat(0xffffff)); bobber.add(bot); }
const fishLineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
const fishLine = new THREE.Line(fishLineGeo, new THREE.LineBasicMaterial({ color: 0xeeeeee })); fishLine.frustumCulled = false; fishLine.visible = false; scene.add(fishLine);
const rodMesh = new THREE.Mesh(new THREE.CylinderGeometry(.015, .03, 2.2, 6), mat(0x8a5a2b)); rodMesh.visible = false; scene.add(rodMesh);
function fishAction() {
  if (inWater) { toast('🎣 走到岸上再钓'); return true; }
  if (!fishing) {
    const [bx, bz] = pond.bobberSpot(player.pos), kinds = pond.grownKinds();
    fishing = { phase: 'wait', t: 0, biteT: 3 + Math.random() * 5, bx, bz, at: { x: player.pos.x, z: player.pos.z }, none: !Object.keys(kinds).length };
    if (fishing.none) fishing.biteT = 999;
    player.face = Math.atan2(bx - player.pos.x, bz - player.pos.z); toast('🎣 甩竿！等浮漂动……'); return true; }
  if (fishing.phase === 'wait') { fishing = null; toast('🎣 收早了，什么也没钓到'); return true; }
  // 咬钩了：按种类挑一只（螃蟹概率小）
  const kinds = pond.grownKinds(), W = { fish: 1, shrimp: 1, crab: .3 }; let tot = 0; for (const k in kinds) tot += W[k] * kinds[k];
  let r = Math.random() * tot, pick = null; for (const k in kinds) { r -= W[k] * kinds[k]; if (r <= 0) { pick = k; break; } }
  fishing = null; const item = pick && pond.catchKind(pick);
  if (!item) { toast('🎣 跑掉了……'); return true; }
  if (!garden.bag.add(item, 1)) garden.chest.add(item, 1); toast(`🎣 钓到一只${itemInfo(item).name}！${item === 'goldfish' ? ' ✨' : ''}`); stamina.use('work'); return true;
}
function updateFishing(dt) {
  const on = !!fishing && selItem() === 'rod' && Math.hypot(player.pos.x - fishing.at.x, player.pos.z - fishing.at.z) < 2.5;
  if (fishing && !on) { fishing = null; }
  bobber.visible = fishLine.visible = rodMesh.visible = !!fishing; if (!fishing) return;
  fishing.t += dt;
  if (fishing.phase === 'wait' && fishing.t >= fishing.biteT) { fishing.phase = 'bite'; fishing.biteEnd = fishing.t + 1.6; toast('🎣 浮漂动了！快按 E 收杆！'); }
  if (fishing.phase === 'bite' && fishing.t > fishing.biteEnd) { fishing = null; toast('🎣 太慢了，鱼跑掉了'); return; }
  if (fishing.none && fishing.t > 15) { fishing = null; toast('🎣 等了好久都没有上钩：鱼塘里还没有长大的'); return; }
  const bite = fishing.phase === 'bite', t = fishing.t;
  bobber.position.set(fishing.bx, .12 + (bite ? -.07 + Math.sin(t * 25) * .06 : Math.sin(t * 2) * .015), fishing.bz);
  // 鱼竿：从手里斜着伸出去；咬钩时一抖一抖
  const f = player.face, hx = player.pos.x + Math.sin(f) * .4, hz = player.pos.z + Math.cos(f) * .4, hy = player.pos.y + 1.1;
  const tipX = hx + Math.sin(f) * 1.6, tipZ = hz + Math.cos(f) * 1.6, tipY = hy + 1.3 + (bite ? Math.sin(t * 30) * .12 : 0);
  rodMesh.position.set((hx + tipX) / 2, (hy + tipY) / 2, (hz + tipZ) / 2); rodMesh.lookAt(tipX, tipY, tipZ); rodMesh.rotateX(Math.PI / 2);
  const pa = fishLineGeo.attributes.position; pa.setXYZ(0, tipX, tipY, tipZ); pa.setXYZ(1, bobber.position.x, bobber.position.y + .05, bobber.position.z); pa.needsUpdate = true;
}
function pondPrompt(it) {
  if (pond.nearSign(player.pos)) return it === 'pondkit' ? { label: '🏞️ 在这里挖鱼塘', sub: '这块地就是专门挖鱼塘的地方', can: true } : { label: '🏞️ 这里是挖鱼塘的地方', sub: '去动物小铺买鱼塘，放进背包，再到这里按 E 挖', can: false };
  if (!pond.nearEdge(player.pos)) return null;
  if (it === 'glove') return demoLabel('pond', pond.name, pond.count);
  if (it === 'net') return !inWater ? { label: '🥅 渔网要走进水里才能用', sub: '在岸上用 🎣 鱼竿钓', can: false } : pond.grownCount ? { label: '🥅 用渔网捞一只', sub: `长大的有 ${pond.grownCount} 只`, can: true } : { label: '🥅 还没有长大的', sub: '鱼苗、小虾、小螃蟹长大了才能捞', can: false };
  if (it === 'rod') { if (inWater) return { label: '🎣 站在水里没法钓鱼', sub: '走到岸上再甩竿；水里用 🥅 渔网', can: false };
    if (!fishing) return { label: '🎣 甩竿', sub: '等浮漂动了，赶紧按 E 收杆 · 螃蟹不太容易钓到', can: true };
    return fishing.phase === 'bite' ? { label: '🎣 浮漂动了！快收杆！', sub: '现在按 E', can: true } : { label: '🎣 等鱼上钩……', sub: '浮漂动了再按 E（现在收杆什么也钓不到）', can: true }; }
  if (it === 'fishfood') return pond.food >= pond.FOOD_MAX ? { label: '🍚 鱼食够多了', sub: '', can: false } : { label: '🍚 撒一把鱼食', sub: `水里有 ${pond.food} / ${pond.FOOD_MAX} 份 · 饿着就长不大`, can: true };
  const nx = pond.next();
  return nx ? { label: `🏞️ 升级成${nx.name}（${nx.up} 菜币）`, sub: `现在 ${pond.lv} 级 ${pond.name} · 养了 ${pond.count} / ${pond.cap} · 鱼食 ${pond.food} 份${pond.lv === 1 ? ' · 2 级才能养螃蟹' : ''}`, can: true }
            : { label: `🏞️ ${pond.name}（最高级）`, sub: `养了 ${pond.count} / ${pond.cap} · 鱼食 ${pond.food} 份 · 偶尔有金色的鱼`, can: false };
}
function pondAction() {
  const it = selItem();
  if (pond.nearSign(player.pos) && it === 'pondkit') { garden.bag.take('pondkit'); pond.build(); toast('🏞️ 鱼塘挖好了！去动物小铺买鱼苗、小虾吧'); return true; }
  if (!pond.nearEdge(player.pos)) return false;
  if (it === 'glove') return tryDemolish('pond', pond.name, pond.count, () => pond.demolish());
  if (it === 'rod') return fishAction();
  if (it === 'net') { if (!inWater) { toast('🥅 渔网要走进水里才能用；在岸上用鱼竿钓'); return true; } const k = pond.catchOne(); if (!k) { toast('🥅 还没有长大的'); return true; } if (!garden.bag.add(k, 1)) garden.chest.add(k, 1); toast(`🥅 捞到一只${itemInfo(k).name}！${k === 'goldfish' ? ' ✨' : ''}`); stamina.use('work'); return true; }
  if (it === 'fishfood') { if (!pond.addFood()) { toast('🍚 鱼食够多了'); return true; } garden.bag.take('fishfood'); toast(`🍚 撒了一把鱼食（${pond.food} / ${pond.FOOD_MAX}）`); return true; }
  const nx = pond.next(); if (!nx) return false;
  if (!garden.wallet.spend(nx.up)) { toast(`菜币不够：要 ${nx.up}`); return true; }
  pond.upgrade(); renderMoney(); toast(`🏞️ 升级成${nx.name}了！能养 ${nx.cap} 只`); return true;
}
// ---------- 🐶 和狗互动：摸摸、喂、扔飞盘、放狗盆、加狗粮 ----------
let kennelLvInBag = +(localStorage.getItem('xcn_kennel_bag_lv') || 0);   // 收进背包的狗屋记住等级
let demolishT = 0;
// 狗屋的地方（用户说：每个动物的房子都有自己特定的场地，要走到那里才能放）：空地前面靠菜园那边
const KENNEL_SITE = (() => { const [x, z] = plotToWorld(homePlot, gardenSide * 14, 12), [cx, cz] = plotToWorld(homePlot, 0, -3); return { x, z, face: Math.atan2(cx - x, cz - z) }; })();
const kennelSiteMark = (() => { const g = new THREE.Group(); g.position.set(KENNEL_SITE.x, 0, KENNEL_SITE.z); g.rotation.y = KENNEL_SITE.face; scene.add(g);
  const om = mat(0xc9a66b); for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) { const d = new THREE.Mesh(new THREE.BoxGeometry(.7, .04, .12), om); const a = i * Math.PI / 2; d.position.set(Math.cos(a) * 1.6 + Math.sin(a) * (k - 1) * 1.1, .02, -Math.sin(a) * 1.6 + Math.cos(a) * (k - 1) * 1.1); d.rotation.y = a + Math.PI / 2; g.add(d); }
  const post = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.1, .08), mat(0x9a6a3c)); post.position.set(1.9, .55, 1.9); g.add(post);
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x = c.getContext('2d'); x.fillStyle = '#f2e1bd'; x.fillRect(0, 0, 256, 96); x.fillStyle = '#5a3a1a'; x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.fillText('🛖 狗屋的地方', 128, 60);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const b = new THREE.Mesh(new THREE.BoxGeometry(1.1, .4, .04), new THREE.MeshStandardMaterial({ map: t })); b.position.set(1.9, 1.1, 1.95); g.add(b); return g; })();
const nearKennelSite = p => Math.hypot(p.x - KENNEL_SITE.x, p.z - KENNEL_SITE.z) < 2.6;
const DOG_ITEMS = ['dogfood', 'frisbee', 'bowl', 'kennel', 'leash'];
const KENNEL_UP = lv => dog.KENNEL[lv + 1];
function frontOf(d = 1.4) { return [player.pos.x + Math.sin(player.face) * d, player.pos.z + Math.cos(player.face) * d]; }
function dogPrompt(it) {
  const nm = dog.name;
  // 狗链（用户说：拴上时狗链从背包里拿走，解开后回到背包；拴狗它会不开心）
  if (dog.chained && dog.nearAnchor(player.pos) && !it) return { label: `⛓️ 解开${nm}的狗链`, sub: '空着手在拴狗的地方按 E · 狗链会回到背包里', can: true };   // 用户说：走到拴狗的桩子旁边，空着手就能解开
  if (it === 'leash' && dog.near(player.pos) && !dog.chained) return { label: `⛓️ 把${nm}拴起来`, sub: `${dog.kennel && Math.hypot(dog.pos.x - dog.kennel.x, dog.pos.z - dog.kennel.z) < 8 ? '拴在狗屋门口' : '在这里钉个小木桩拴着'} · 它会有点不开心（忠诚 -5）`, can: true };
  if (it === 'dogfood' && dog.nearBowl(player.pos)) return { label: '🦴 往狗盆里加狗粮', sub: `盆里有 ${dog.bowl.food} / 5 份`, can: true };
  if (it === 'bowl') return { label: dog.bowl ? '🥣 把狗盆挪到这里' : '🥣 把狗盆放在这里', sub: '狗饿了会自己来吃', can: true };
  if (it === 'kennel') return dog.kennel ? { label: '🛖 你已经放了一个狗屋', sub: '狗屋放好以后就不能再挪了', can: false } : nearKennelSite(player.pos) ? { label: '🛖 把狗屋盖在这里', sub: '这块地就是专门放狗屋的地方', can: true } : { label: '🛖 狗屋要放在“狗屋的地方”', sub: '空地前面、靠菜园那边有块小木牌，走到那里再按 E', can: false };
  if (it === 'glove' && dog.nearKennel(player.pos)) return { label: demolishT > performance.now() ? '⚠️ 再按一次 E：确定拆掉狗屋' : '🔨 拆掉狗屋', sub: '拆掉就没有了，不会回到背包里', can: true };
  if (dog.nearKennel(player.pos) && !dog.near(player.pos)) { const k = dog.kennel, up = KENNEL_UP(k.lv);
    return up ? { label: `🛖 升级狗屋：${up.name}（${up.price} 菜币）`, sub: `现在是 ${k.lv} 级 ${dog.KENNEL[k.lv].name}${dog.mode === 'sleep' ? ` · ${nm}在里面睡觉 💤` : ''}`, can: true }
              : { label: `🛖 ${dog.KENNEL[k.lv].name}（最高级）`, sub: dog.mode === 'sleep' ? `${nm}在里面睡觉 💤` : '晚上狗会回来睡觉', can: false }; }
  if (dog.near(player.pos)) {
    if (it === 'dogfood') return { label: `🦴 喂${nm}`, sub: dog.status(), can: true };
    if (it === 'frisbee') return { label: '🥏 扔飞盘', sub: `${nm}会跑去捡回来`, can: !dog.frisbeeOut };
    if ((nearHomeFence(player.pos) && !nearGate) || pond.nearEdge(player.pos) || gateFirst) return null;   // 在栅栏、鱼塘旁边：先给升级栅栏、钓鱼让位置（狗跟得很近时也能看到）
    return { label: `🐶 摸摸${nm}`, sub: `${dog.status()} · ${dog.chained ? '被拴着（空着手走到拴它的木桩 / 狗屋门口按 E 解开）' : dog.moodText()}`, can: true };
  }
  if (it === 'frisbee') return dog.has ? { label: '🥏 扔飞盘', sub: dog.frisbeeOut ? `${nm}正在捡` : `${nm}会跑去捡回来`, can: !dog.frisbeeOut } : { label: '🥏 飞盘', sub: '先去小卖部买一只小狗', can: false };
  if (it === 'bowl') return { label: dog.bowl ? '🥣 把狗盆挪到这里' : '🥣 把狗盆放在这里', sub: '狗饿了会自己来吃', can: true };
  if (it === 'glove' && dog.nearBowl(player.pos)) return { label: '🥣 把狗盆收起来', sub: `里面的 ${dog.bowl.food} 份狗粮也会收回背包`, can: true };
  if (dog.nearBowl(player.pos)) return { label: `🥣 狗盆：还有 ${dog.bowl.food} / 5 份狗粮`, sub: '选中 🦴 狗粮按 E 往里加', can: false };
  return null;
}
function dogAction() {
  const it = selItem();
  if (nearBed && !DOG_ITEMS.includes(it)) return false;
  if (dog.chained && dog.nearAnchor(player.pos) && !it) { dog.untie(); if (!garden.bag.add('leash', 1)) garden.chest.add('leash', 1); toast(`⛓️ 解开了，${dog.name}好开心（狗链回到背包里了）`); return true; }
  if (it === 'leash' && dog.near(player.pos) && !dog.chained) { garden.bag.take('leash'); const k = dog.tie(); toast(`⛓️ 把${dog.name}拴${k ? '在狗屋门口' : '在这里'}了 · ${dog.name}有点不开心（忠诚 -5）`);
    if (dog.bowl && Math.hypot(dog.bowl.x - dog.pos.x, dog.bowl.z - dog.pos.z) > 4) setTimeout(() => toast('🥣 狗盆离得太远，它够不着：把狗盆挪近一点'), 1800); return true; }
  if (it === 'dogfood' && dog.nearBowl(player.pos)) { if (dog.bowl.food >= 5) { toast('🥣 狗盆满了'); return true; } garden.bag.take('dogfood'); toast(`🦴 加了一份狗粮（盆里 ${dog.fillBowl()} / 5）`); return true; }
  if (dog.near(player.pos) && it === 'dogfood') { if (dog.full >= 95) { toast(`🐶 ${dog.name}已经吃饱了`); return true; } garden.bag.take('dogfood'); toast(dog.feed()); return true; }
  if (it === 'frisbee') {
    if (!dog.has) { toast('🥏 先去小卖部买一只小狗'); return true; }
    if (dog.frisbeeOut) { toast(`🐶 ${dog.name}正在捡飞盘`); return true; }
    if (dog.throwFrisbee(player.pos, player.face) === 'chained') { toast(`⛓️ ${dog.name}被拴着，先解开才能玩飞盘`); return true; } stamina.use('work', .5); return true;   // 飞盘一直留在背包里，扔出去只是标记一下（不会弄丢）
  }
  if (it === 'bowl') { const [x, z] = frontOf(); const had = !!dog.bowl; if (!had) garden.bag.take('bowl'); dog.placeBowl(x, z); toast(had ? '🥣 狗盆挪到这里了' : '🥣 狗盆放好了：选中狗粮按 E 往里加'); return true; }   // 已经放了一个：直接挪过来
  if (it === 'kennel') { if (dog.kennel) { toast('🛖 你已经放了一个狗屋（放好就不能再挪了）'); return true; } if (!nearKennelSite(player.pos)) { toast('🛖 狗屋只能放在“狗屋的地方”：空地前面靠菜园那边的小木牌'); return true; } garden.bag.take('kennel'); dog.placeKennel(KENNEL_SITE.x, KENNEL_SITE.z, KENNEL_SITE.face, kennelLvInBag || 1); kennelLvInBag = 0; try { localStorage.setItem('xcn_kennel_bag_lv', '0'); } catch (e) {} toast('🛖 狗屋放好了（不能再挪了）：晚上狗会回来睡觉'); return true; }
  if (it === 'glove' && dog.nearKennel(player.pos)) {   // 拆狗屋：要按两次 E 确认，拆掉不会回到背包（用户说的）
    if (demolishT < performance.now()) { demolishT = performance.now() + 3000; toast('⚠️ 拆掉就没有了：3 秒内再按一次 E 确定'); return true; }
    demolishT = 0; dog.takeKennel(); toast('🔨 狗屋拆掉了'); return true; }
  if (dog.nearKennel(player.pos) && !dog.near(player.pos)) { const k = dog.kennel, up = KENNEL_UP(k.lv); if (!up) return true;
    if (!garden.wallet.spend(up.price)) { toast(`菜币不够：要 ${up.price}`); return true; }
    dog.setKennelLevel(k.lv + 1); renderMoney(); toast(`🛖 狗屋升级成 ${up.name}！`); return true; }
  if (it === 'glove' && dog.nearBowl(player.pos)) { const n = dog.takeBowl(); garden.bag.add('bowl', 1); if (n) garden.bag.add('dogfood', n); toast('🥣 狗盆收起来了'); return true; }
  if (dog.near(player.pos) && !(nearHomeFence(player.pos) && !nearGate) && !pond.nearEdge(player.pos) && !gateFirst && !BIRD_ITEMS.includes(it) && it !== 'rope' && !(it === 'knife' && loose.nearest(player.pos))) { toast(dog.pet()); return true; }
  return false;
}
// 给狗取名（用户说：可以自己给狗取名）：买的时候弹出来；以后点左边的 🐶 条也能改
function askDogName(isNew) {
  const ui = $('nameUI'), inp = $('nameInput');
  $('nameTitle').textContent = isNew ? '🐶 你有了一只小狗！给它取个名字吧' : `🐶 给${dog.name}改个名字`;
  inp.value = isNew ? '' : dog.name; inp.placeholder = dog.name; ui.classList.add('show'); Object.keys(keys).forEach(k => keys[k] = false);
  setTimeout(() => inp.focus(), 50);
  const done = ok => { ui.classList.remove('show'); const n = inp.value.trim().slice(0, 8);
    if (ok && n) dog.rename(n); toast(isNew ? `🐶 ${dog.name}来到你家了！它会跟着你` : `🐶 现在它叫${dog.name}`); renderDogHud(true); };
  $('nameOk').onclick = () => done(true); $('nameSkip').onclick = () => done(false);
  inp.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') done(true); if (e.key === 'Escape') done(false); };
}
$('dogHud').onclick = () => dog.has && askDogName(false);
let dogHudT = 0;
function renderDogHud(now) {
  if (!now && (dogHudT -= 1) > 0) return; dogHudT = 20;
  const el = $('dogHud'); el.style.display = dog.has ? '' : 'none'; if (!dog.has) return;
  el.innerHTML = `🐶 <b>${dog.name}</b> 🍖 ${Math.round(dog.full)}% · ❤️ ${Math.round(dog.loyal)}`;
  el.classList.toggle('hungry', dog.full < 40);
}
// ---------- 体力：睡觉、吃东西、第一人称 ----------
const Y_AXIS = new THREE.Vector3(0, 1, 0), Q_LIE = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, Math.PI / 2, 'XYZ'));
function goSleep(s) {
  if (stamina.value >= STA_MAX - .5) return toast('💪 体力是满的，还不困');
  sleeping = s; stamina.sleep(s.rate); Object.keys(keys).forEach(k => keys[k] = false);
  document.body.classList.add('sleeping'); toast(`💤 躺下睡觉了 —— 时间照常走，睡够了按 E 起床`);
}
function wakeUp() {
  if (!sleeping) return; const s = sleeping; sleeping = null; stamina.wake(); document.body.classList.remove('sleeping');
  player.pos.set(s.x + Math.sin(s.yaw) * 1.5, s.y, s.z + Math.cos(s.yaw) * 1.5); player.vy = 0;
  toast(`☀️ 起床了，体力 ${Math.round(stamina.value)}`);
}
function eatSelected() {
  const k = selItem(); if (!FOOD[k]) return;
  if (stamina.value >= STA_MAX - .5) return toast('😊 已经吃饱了');
  if (!garden.bag.take(k)) return;
  const n = stamina.eat(k); renderBag(); toast(`😋 吃了 1 个${itemInfo(k).name}，体力 +${Math.round(n)}`);
}
function toggleView() { firstPerson = !firstPerson; $('viewBtn').textContent = firstPerson ? '🎥 第三人称 (V)' : '👁️ 第一人称 (V)'; toast(firstPerson ? '👁️ 第一人称：用自己的眼睛看' : '🎥 第三人称'); }
$('viewBtn').onclick = toggleView;
let staShown = -1;
function renderSta() {
  const v = Math.round(stamina.value); if (v === staShown && !sleeping) return; staShown = v;
  const el = $('sta'); el.querySelector('i').style.width = v + '%'; el.querySelector('b').textContent = v;
  el.classList.toggle('low', v < 25); el.classList.toggle('zero', v <= 0); el.classList.toggle('zz', !!sleeping);
}
// ---------- 小卖部：买种子、树苗、蜡烛、杀虫剂；把菜卖掉换菜币 ----------
function renderMoney() { $('money').innerHTML = `<b>🥕 ${garden.wallet.get()}</b> 菜币`; }
function renderShop() {
  $('shopMoney').textContent = garden.wallet.get();
  document.querySelectorAll('#shopUI .tabs button').forEach(b => b.classList.toggle('on', b.dataset.t === shopTab));
  if (shopTab === 'buy') {
    $('shopList').innerHTML = SHOP_ITEMS.map((it, i) => { if (shopOf(it) !== curShop) return ''; const info = itemInfo(it.key), lock = false, poor = garden.wallet.get() < it.price;
      return `<div class="row${lock ? ' lock' : ''}"><span class="ic">${info.seed ? `<span class="pk"><b>${info.sub}</b></span>` : info.icon}</span>
        <span class="nm">${info.name}<small>${lock ? `菜园 ${it.lv} 级才能买` : it.note || ''}</small></span><span class="pr">🥕 ${it.price}</span>
        <button data-i="${i}" data-n="1" ${lock || poor ? 'disabled' : ''}>买 1 个</button>${it.once ? '' : `<button data-i="${i}" data-n="5" ${lock || garden.wallet.get() < it.price * 5 ? 'disabled' : ''}>买 5 个</button>`}</div>`; }).join('');
  } else {
    const rows = []; const seen = new Set();
    garden.bag.slots.forEach(sl => { if (!sl || seen.has(sl.key) || !sellPrice(sl.key)) return; seen.add(sl.key);
      const info = itemInfo(sl.key), n = garden.bag.count(sl.key), p = sellPrice(sl.key);
      rows.push(`<div class="row"><span class="ic">${info.icon}</span><span class="nm">${info.name}<small>背包里有 ${n} 个${SHOP_ITEMS.some(x => x.key === sl.key) ? ` · 买的时候 ${SHOP_ITEMS.find(x => x.key === sl.key).price}` : ''}</small></span><span class="pr">🥕 ${p} / 个</span>
        <button data-k="${sl.key}" data-n="1">卖 1 个</button><button data-k="${sl.key}" data-n="${n}">全部卖掉（${n * p}）</button></div>`); });
    $('shopList').innerHTML = (rows.join('') || '<div class="empty">背包里没有能卖的东西。去菜园收一些菜吧！</div>') + '<div class="empty">🔑 钥匙不能卖 · 从小卖部买的东西按一半的价钱收</div>';
  }
}
$('shopList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (shopTab === 'buy') {
    const it = SHOP_ITEMS[+b.dataset.i], n = +b.dataset.n, cost = it.price * n;
    if (it.key === 'knife' && (garden.bag.count('knife') || garden.chest.count('knife'))) { toast('🔪 你已经有菜刀了'); return; }
    if (it.key === 'leash' && (dog.chained || garden.bag.count('leash') || garden.chest.count('leash'))) { toast('⛓️ 你已经有狗链了'); return; }
    if (it.key === 'kennel' && (dog.kennel || garden.bag.count('kennel') || garden.chest.count('kennel'))) { toast('🛖 你已经有一个狗屋了'); return; }
    // 动物的房子（鸡舍、牛棚、羊圈、猪圈、鸭棚）：买了先放进背包，再走到它自己的那块地上按 E 盖（用户说的）
    const KIT = { coopkit: coop, cowshed: cows, sheeppen: sheep, pigsty: pigs, duckhouse: ducks, pondkit: pond };
    const WATER = { fry: 'fish', shrimpling: 'shrimp', crabling: 'crab' };
    if (WATER[it.key]) { const k = WATER[it.key];
      if (!pond.built) { toast('要先挖鱼塘'); return; }
      if (pond.lv < CRITTER[k].minLv) { toast('螃蟹要 2 级鱼塘（有石头）才能养：先升级鱼塘'); return; }
      if (pond.count >= pond.cap) { toast(`${pond.name}住满了（${pond.cap} 只）：先升级`); return; }
      if (!garden.wallet.spend(it.price)) { toast('菜币不够'); return; }
      pond.add(k, false); renderShop(); renderMoney(); toast(`${itemInfo(it.key).icon} 买了${itemInfo(it.key).name}，已经放进鱼塘了`); return; }
    if (it.key === 'birdhouse' && (birds.built || garden.bag.count('birdhouse') || garden.chest.count('birdhouse'))) { toast('🏡 你已经有鸟屋了'); return; }
    if (it.key === 'rope' && (loose.led || garden.bag.count('rope') || garden.chest.count('rope'))) { toast('🪢 你已经有牵绳了'); return; }
    if (it.key === 'bugnet' && (garden.bag.count('bugnet') || garden.chest.count('bugnet'))) { toast('🥍 你已经有蝴蝶网了'); return; }
    if (it.key === 'net' && (garden.bag.count('net') || garden.chest.count('net'))) { toast('🥅 你已经有渔网了'); return; }
    if (it.key === 'rod' && (garden.bag.count('rod') || garden.chest.count('rod'))) { toast('🎣 你已经有鱼竿了'); return; }
    if (KIT[it.key] && (KIT[it.key].built || garden.bag.count(it.key) || garden.chest.count(it.key))) { toast(`你已经有${itemInfo(it.key).name}了`); return; }
    const BABY = { calf: cows, lamb: sheep, piglet: pigs, duckling: ducks };
    if (BABY[it.key]) { const r = BABY[it.key];
      if (!r.built) { toast(`要先盖${r.K.home[1].slice(1)}`); return; }
      if (r.count >= r.cap) { toast(`${r.homeName}住满了（${r.cap} 只）：先升级`); return; }
      if (!garden.wallet.spend(it.price)) { toast('菜币不够'); return; }
      r.addAnimal(false); renderShop(); renderMoney(); toast(`${itemInfo(it.key).icon} 买了一只${r.K.baby}，已经放进${r.homeName}了`); return; }
    if (it.key === 'shears' && (garden.bag.count('shears') || garden.chest.count('shears'))) { toast('✂️ 你已经有剪刀了'); return; }
    if (it.key === 'chick') {
      if (!coop.built) { toast('要先有鸡舍：拆掉了就在这里再买一个'); return; }
      if (coop.count >= coop.cap) { toast(`🐔 ${coop.name}住满了（${coop.cap} 只）：先升级鸡舍`); return; }
      if (!garden.wallet.spend(it.price)) { toast('菜币不够'); return; }
      coop.addHen(false); toast('🐣 买了一只小鸡，已经放进你的鸡舍了'); renderShop(); renderMoney(); return;
    }
    if (it.key === 'puppy') {
      if (dog.has) { toast(`🐶 你已经有${dog.name}了`); return; }
      if (!garden.wallet.spend(it.price)) { toast('菜币不够'); return; }
      dog.adopt(); renderShop(); renderMoney(); closeShop(); askDogName(true); return;
    }
    if (garden.bag.room(it.key) < n) { toast('🎒 背包放不下了，先把东西放进箱子'); return; }
    if (!garden.wallet.spend(cost)) { toast('菜币不够'); return; }
    garden.bag.add(it.key, n); toast(`买到 ${n} 个${itemInfo(it.key).name}，花了 ${cost} 菜币`);
  } else {
    const k = b.dataset.k, n = +b.dataset.n;
    if (garden.bag.take(k, n) && (k !== 'cagebird' || (birds.soldCaged(n), true))) { garden.wallet.add(sellPrice(k) * n); toast(`卖掉 ${n} 个${itemInfo(k).name}，得到 ${sellPrice(k) * n} 菜币`); }
  }
  renderShop(); renderBag(); renderMoney();
});
document.querySelectorAll('#shopUI .tabs button').forEach(b => b.onclick = () => { shopTab = b.dataset.t; renderShop(); });
function openShop(kind = 'general') { curShop = kind; const S = SHOPS[kind]; $('shopTitle').textContent = `${S.icon} ${S.name}`; $('shopUI').querySelector('.box').style.borderColor = S.a; shopOpen = true; renderShop(); $('shopUI').classList.add('show'); Object.keys(keys).forEach(k => keys[k] = false); }
function closeShop() { shopOpen = false; $('shopUI').classList.remove('show'); }
$('shopClose').onclick = closeShop;
renderMoney(); setInterval(renderMoney, 1000);

// ---------- 箱子：走到旁边按 E 打开；拖动格子搬东西，点一下整格搬到另一边 ----------
let nearShop = false, shopOpen = false, shopTab = 'buy';
let gateFirst = false;   // 站在门跟前：按 E 先开关门（用户说养动物的地方都开不了门）
let nearGate = null; const GATE_NAME = g => g.name || '栅栏门';
// 所有能开关的门：大门、空地侧门、菜园门、鸡舍小门、牛棚羊圈的门、狗狗乐园的小门
const allGates = () => [garden.gate, homeGate, ...HOME_GAPS.map(g => g.gate), coop.gate, cows.gate, sheep.gate, pigs.gate, ducks.gate, dog.yardGate].filter(Boolean);
// 栅栏门：E 开关；选中 🔑 钥匙按 E 上锁 / 开锁
function gateInfo(g, item) {
  const nm = GATE_NAME(g);
  if (item === 'key') return g.locked ? { label: `🔓 用钥匙打开${nm}的锁`, sub: '这是你自己家的钥匙', can: true } : { label: `🔒 把${nm}锁上`, sub: '锁上以后，没有钥匙就进不来', can: true };
  if (g.locked) return { label: `🔒 ${nm}锁着`, sub: '选中背包里的 🔑 钥匙，再按 E 开锁', can: false };
  return { label: g.open ? `🚪 关上${nm}` : `🚪 打开${nm}`, sub: '选中 🔑 钥匙可以上锁', can: true };
}
function gateAct(g, item) {
  const nm = GATE_NAME(g);
  if (item === 'key') { if (g.locked) { g.setLock(false); return `🔓 ${nm}开锁了`; } g.setLock(true); return `🔒 ${nm}锁上了`; }
  if (g.locked) return `🔒 ${nm}锁着 —— 选中 🔑 钥匙再按 E`;
  return g.toggle() ? `🚪 ${nm}开了` : `🚪 ${nm}关上了`;
}
let nearBox = false, nearHouse = null, chestOpen = false, drag2 = null, boxName = 'chest';
const BOX_TITLE = { chest: '📦 我的箱子', get cabinet() { return `🗄️ 柜子（${HOUSE_NAMES[house.level]} · ${house.cabinet.cap} 格）`; }, safe: '🔐 保险箱（12 格）' };
function cellHTML(c, i, sl) {
  if (!sl) return `<div class="slot" data-c="${c}" data-i="${i}"></div>`;
  const it = itemInfo(sl.key);
  return it.seed ? `<div class="slot seed" data-c="${c}" data-i="${i}" title="${it.name}"><span class="pk"><b>${it.sub}</b></span><i>${sl.n}</i></div>`
                 : `<div class="slot${foodLook(sl.key)}" data-c="${c}" data-i="${i}" title="${it.name}"><span class="veg">${it.icon}</span><i>${sl.n}</i></div>`;
}
function renderChest() {
  const ch = garden.box(boxName), bg = garden.bag;
  $('chestTitle').textContent = BOX_TITLE[boxName];
  $('chestGrid').style.gridTemplateColumns = `repeat(${ch.cap > 9 ? 6 : 9}, ${isTouch ? 40 : 46}px)`;
  $('chestGrid').innerHTML = Array.from({ length: ch.cap }, (_, i) => cellHTML(boxName, i, ch.slots[i])).join('');
  $('chestBag').innerHTML = Array.from({ length: bg.cap }, (_, i) => cellHTML('bag', i, bg.slots[i])).join('');
}
function openChest(name = 'chest') { boxName = name; chestOpen = true; renderChest(); $('chestUI').classList.add('show'); Object.keys(keys).forEach(k => keys[k] = false); }
function closeChest() { chestOpen = false; $('chestUI').classList.remove('show'); renderBag(); }
$('chestClose').onclick = closeChest;
$('chestUI').addEventListener('pointerdown', e => {
  const c = e.target.closest('.slot'); if (!c || !c.querySelector('i')) return;
  e.preventDefault();
  const ghost = c.cloneNode(true); ghost.classList.add('ghost'); document.body.appendChild(ghost);
  drag2 = { c: c.dataset.c, i: +c.dataset.i, x: e.clientX, y: e.clientY, moved: false, ghost, el: c };
  ghost.style.left = e.clientX + 'px'; ghost.style.top = e.clientY + 'px';
});
addEventListener('pointermove', e => {
  if (!drag2) return;
  if (Math.hypot(e.clientX - drag2.x, e.clientY - drag2.y) > 6) { drag2.moved = true; drag2.el.classList.add('lift'); drag2.ghost.classList.add('show'); }
  drag2.ghost.style.left = e.clientX + 'px'; drag2.ghost.style.top = e.clientY + 'px';
});
addEventListener('pointerup', e => {
  if (!drag2) return;
  const d = drag2; drag2 = null; d.ghost.remove(); d.el.classList.remove('lift');
  if (!d.moved) { garden.quickMove(d.c, d.i, d.c === 'bag' ? boxName : 'bag'); renderChest(); return; }            // 点一下：整格搬到另一边
  const t = document.elementFromPoint(e.clientX, e.clientY)?.closest('#chestUI .slot');
  if (t) garden.moveItem(d.c, d.i, t.dataset.c, +t.dataset.i);
  renderChest();
});
renderBag();
garden.on(ev => { if (ev === 'allEaten') toast('😱 有一块田的菜被虫子吃光了！'); });
// 管理员测试面板：切换菜园等级、加快生长、送种子、重置
function renderDbg() {
  $('dbgLv').innerHTML = Object.keys(LEVELS).map(l => `<button class="${+l === garden.level ? 'on' : ''}" data-l="${l}">${l} 级 · ${LEVELS[l]} 块</button>`).join('');
  $('dbgSp').innerHTML = [1, 10, 60, 600].map(v => `<button class="${v === garden.speed ? 'on' : ''}" data-v="${v}">${v}×</button>`).join('');
  $('dbgLv').querySelectorAll('button').forEach(b => b.onclick = () => { garden.debug.setLevel(+b.dataset.l); renderDbg(); toast(`菜园变成 ${b.dataset.l} 级：${LEVELS[b.dataset.l]} 块田`); });
  $('dbgSp').querySelectorAll('button').forEach(b => b.onclick = () => { garden.debug.setSpeed(+b.dataset.v); renderDbg(); toast(`生长速度 ${b.dataset.v} 倍`); });
}
renderDbg();
$('dbgSeeds').onclick = () => { const n = garden.debug.giveSeeds(); renderBag(); toast(n ? `🎁 送了 ${n} 种种子，每种 5 颗` : '🎒 背包满了，先把东西放进箱子'); };
$('dbgMoney').onclick = () => { garden.wallet.add(100); renderMoney(); toast('🥕 送了 100 菜币'); };
$('dbgCandle').onclick = () => { const ok = house.debug.giveCandles(garden.bag); renderBag(); toast(ok ? '🕯️ 送了 3 根蜡烛' : '🎒 背包满了'); };
$('dbgTrees').onclick = () => { if (garden.level < 2) return toast('🔒 菜园 2 级以上才能种果树'); const n = garden.debug.giveTrees(); renderBag(); toast(n ? `🌳 送了 ${n} 种树苗，每种 2 棵` : '🎒 背包满了，先把东西放进箱子'); };
$('dbgReset').onclick = () => { if (confirm('把菜园和背包都清空，重新开始？')) garden.debug.reset(); };
$('dbgToggle').onclick = () => $('dbg').classList.toggle('open');
// 在面板里滑动 / 滚轮时，不要让镜头跟着转、跟着缩放
['wheel', 'touchstart', 'touchmove', 'pointerdown', 'mousedown'].forEach(ev => $('dbg').addEventListener(ev, e => e.stopPropagation(), { passive: true }));
function renderDbgHouse() {
  $('dbgHouse').innerHTML = [1, 2, 3, 4, 5].map(l => `<button class="${l === house.level ? 'on' : ''}" data-l="${l}">${l} 级 · ${HOUSE_NAMES[l]}</button>`).join('');
  $('dbgHouse').querySelectorAll('button').forEach(b => b.onclick = () => {
    if (sleeping) wakeUp();
    const l = +b.dataset.l, up = l > house.level; house.debug.setLevel(l); renderDbgHouse();
    // 人在房子里面的话，挪到门口，免得卡在墙里
    if (house.inside(player.pos) || Math.hypot(player.pos.x - house.doorWorld()[0], player.pos.z - house.doorWorld()[1]) < 16) { [player.pos.x, player.pos.z] = house.doorWorld(); player.pos.y = 0; }
    toast(`🏠 房子${up ? '升级' : '变'}成 ${l} 级：${HOUSE_NAMES[l]}`);
  });
}
renderDbgHouse();
$('dbgOil').onclick = () => { const ok = garden.bag.add('oil', 3); renderBag(); toast(ok ? '🛢️ 送了 3 瓶灯油' : '🎒 背包满了'); };
$('dbgStaFull').onclick = () => { stamina.set(STA_MAX); toast('💪 体力满了'); };
$('dbgDog').onclick = () => { if (dog.has) return toast(`🐶 已经有${dog.name}了`); dog.adopt(); askDogName(true); };
$('dbgDogStuff').onclick = () => { const ok = garden.bag.add('bowl', 1) && garden.bag.add('dogfood', 10) && garden.bag.add('frisbee', 1) && garden.bag.add('leash', 1); renderBag(); toast(ok ? '🎁 送了狗盆、10 份狗粮、飞盘、狗链' : '🎒 背包满了，先把东西放进箱子'); };
$('dbgKennel').onclick = () => { if (!dog.has) dog.adopt(); if (dog.kennel) dog.setKennelLevel(dog.kennel.lv % 3 + 1); else dog.placeKennel(KENNEL_SITE.x, KENNEL_SITE.z, KENNEL_SITE.face, 1); toast(`🛖 狗屋：${dog.kennel.lv} 级 ${dog.KENNEL[dog.kennel.lv].name}（再点一下换下一级）`); };
$('dbgCoopLv').onclick = () => { const l = coop.lv % 3 + 1; coop.debug.setLevel(l); toast(`🐔 鸡舍：${l} 级 ${COOP[l].name}（再点换下一级）`); };
$('dbgChick').onclick = () => { toast(coop.addHen(true) ? '🐔 送了一只母鸡' : '🐔 鸡舍住满了'); };
$('dbgEggs').onclick = () => { coop.debug.layNow(); toast('🥚 所有母鸡马上下蛋'); };
$('dbgFeed').onclick = () => { const ok = garden.bag.add('chickfeed', 10); renderBag(); toast(ok ? '🌾 送了 10 份鸡饲料' : '🎒 背包满了'); };
$('dbgCowLv').onclick = () => { const l = cows.built ? cows.lv % 3 + 1 : 1; cows.debug.setLevel(l); toast(`🐄 ${cows.homeName}（再点换下一级）`); };
$('dbgCow').onclick = () => { if (!cows.built) cows.debug.setLevel(1); toast(cows.addAnimal(true) ? '🐄 送了一头奶牛' : '🐄 牛棚住满了'); };
$('dbgSheepLv').onclick = () => { const l = sheep.built ? sheep.lv % 3 + 1 : 1; sheep.debug.setLevel(l); toast(`🐑 ${sheep.homeName}（再点换下一级）`); };
$('dbgSheep').onclick = () => { if (!sheep.built) sheep.debug.setLevel(1); toast(sheep.addAnimal(true) ? '🐑 送了一只绵羊' : '🐑 羊圈住满了'); };
$('dbgPigLv').onclick = () => { const l = pigs.built ? pigs.lv % 3 + 1 : 1; pigs.debug.setLevel(l); toast(`🐷 ${pigs.homeName}（再点换下一级）`); };
$('dbgPig').onclick = () => { if (!pigs.built) pigs.debug.setLevel(1); toast(pigs.addAnimal(true) ? '🐷 送了一头猪' : '🐷 猪圈住满了'); };
$('dbgDuckLv').onclick = () => { const l = ducks.built ? ducks.lv % 3 + 1 : 1; ducks.debug.setLevel(l); toast(`🦆 ${ducks.homeName}（再点换下一级）`); };
$('dbgDuck').onclick = () => { if (!ducks.built) ducks.debug.setLevel(1); toast(ducks.addAnimal(true) ? '🦆 送了一只鸭子' : '🦆 鸭棚住满了'); };
$('dbgFence').onclick = () => { fenceLv = fenceLv % 3 + 1; applyFence(); applyFenceGates(); toast(`🧱 栅栏：${fenceLv} 级 ${FENCE_LV[fenceLv].name}（再点换下一级）`); };
$('dbgPondLv').onclick = () => { const l = pond.built ? pond.lv % 3 + 1 : 1; pond.debug.setLevel(l); toast(`🏞️ ${pond.name}（再点换下一级）`); };
$('dbgPondFill').onclick = () => { if (!pond.built) pond.debug.setLevel(1); ['fish', 'shrimp', 'crab', 'fish'].forEach(k => pond.add(k, true)); garden.bag.add('net', 1); garden.bag.add('rod', 1); garden.bag.add('fishfood', 5); renderBag(); toast(`🐟 放了鱼虾蟹（${pond.count} / ${pond.cap}），送了渔网和鱼食`); };
$('dbgRanchReady').onclick = () => { RANCHES.forEach(r => r.debug.readyNow()); toast('🥛🧶 马上能挤奶、剪毛'); };
$('dbgBirdStuff').onclick = () => { const b = garden.bag; b.add('birdseed', 10); b.add('cage', 2); if (!birds.built && !b.count('birdhouse')) b.add('birdhouse', 1); if (!b.count('bugnet')) b.add('bugnet', 1); renderBag(); toast('🎁 送了鸟食、鸟笼、鸟屋、蝴蝶网'); };
$('dbgBirdLove').onclick = () => { birds.debug.love(); toast('❤️ 所有小鸟好感满了（会帮你吃菜园的虫子）'); };
$('dbgBirdEgg').onclick = () => { toast(birds.debug.egg() ? '🪺 鸟屋里下了一个蛋' : '要先立鸟屋'); };
$('dbgBirdHatch').onclick = () => { birds.debug.hatch(); toast('🐣 鸟屋里的蛋马上孵（60% 能孵出来）'); };
$('dbgBird').onclick = () => { birds.debug.bird(); toast(`🐦 飞来一只小鸟（现在 ${birds.count} 只）`); };
$('dbgBfly').onclick = () => { bfly.debug.add(3); toast(`🦋 多了 3 只蝴蝶（现在 ${bfly.count} 只）`); };
$('dbgLoose').onclick = () => { if (!garden.bag.count('rope') && !loose.led) garden.bag.add('rope', 1); const [x, z] = frontOf(3); loose.add(['cow', 'sheep', 'pig', 'duck', 'chicken'][Math.floor(Math.random() * 5)], { born: Date.now() - 864e5, full: 80, ready: false, next: Date.now() + 6e5 }, x, z); renderBag(); toast('🪢 送了牵绳，前面跑出来一只动物'); };
$('dbgNewbie').onclick = async () => { await net.release(); try { localStorage.setItem(HOME_KEY, Math.floor(Math.random() * PLOTS.length)); localStorage.setItem(MET_KEY, '0'); } catch (e) {} location.reload(); };
$('dbgRanchStuff').onclick = () => { const ok = garden.bag.add('hay', 10) && (garden.bag.count('shears') || garden.bag.add('shears', 1)) && (garden.bag.count('knife') || garden.bag.add('knife', 1)); renderBag(); toast(ok ? '🎁 送了草料、剪刀、菜刀' : '🎒 背包满了'); };
$('dbgDogHungry').onclick = () => { dog.debug.setFull(10); toast('🐶 狗饿了'); };
$('dbgDogLoyal').onclick = () => { dog.debug.setLoyal(100); toast('🐶 忠诚度满了：会帮你看菜园'); };
$('dbgDogReset').onclick = () => { if (confirm('把狗和狗盆都清掉？')) { dog.debug.reset(); toast('🐶 清掉了'); } };
$('dbgStaLow').onclick = () => { stamina.set(0); toast('😩 体力用光了：走路会很慢'); };
setInterval(() => { renderBag(); renderMoney(); }, 1500);
// 自动测试用（只有网址带 ?test 才有）
if (new URLSearchParams(location.search).has('test')) window.__home = { neighbors, net, readInbox, hall, mayor, MAYOR, get metMayor() { return metMayor; }, homeIdx, loose, birds, bfly, get gateFirst() { return gateFirst; }, pondObj: pond, get fishing() { return fishing; }, get inWater() { return inWater; }, grill, grillCook, houseCook, get fenceLv() { return fenceLv; }, pond, pigs, ducks, KENNEL_SITE, pastureHit: (x, z, m = 0) => inPasture(homePlot, PASTURES, x, z, m), cows, sheep, shops, coop, dog, homeGate, get nearGate() { return nearGate; }, player, garden, house, shop, homePlot, stamina, cam, toggleView, goSleep, wakeUp, eatSelected, get sleeping() { return sleeping; }, openShop, act: () => doAction(), select: i => select(i), openChest, closeChest };

const sky = createSky({ scene, sun, hemi, cloudMat, center: () => player.pos });
// 左上角的时钟：几点、白天还是晚上
function renderClock() { const h = gameHour(), p = phaseOf(h); $('clock').innerHTML = `${p.icon} ${p.name} <b>${clockText(h)}</b>${p.name === '晚上' ? '<small>菜长得慢</small>' : ''}`; }
renderClock(); setInterval(renderClock, 1000);
document.querySelectorAll('#dbgTime button').forEach(b => b.onclick = () => { if (b.dataset.h === 'real') resetTime(); else jumpTo(+b.dataset.h); renderClock(); toast(b.dataset.h === 'real' ? '回到真实时间' : `跳到 ${b.textContent}`); });

const WALK = 7.5, RUN = 12, TIRED = 2.2, GRAV = 26, JUMP = 9.5, EDGE = WR - 6;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
camera.position.set(LAY.spawn.x - Math.sin(LAY.spawn.yaw) * 13, 5.5, LAY.spawn.z - Math.cos(LAY.spawn.yaw) * 13);
function step(dt, t) {
  let mx = 0, my = 0;
  if (keys.KeyW || keys.ArrowUp) my += 1;
  if (keys.KeyS || keys.ArrowDown) my -= 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (joy.id !== null) { mx = joy.x; my = joy.y; }
  if (chestOpen || shopOpen || sleeping) mx = my = 0;
  const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
  // 体力：用光了走得很慢、跑不动、跳不起来；快用光时也跑不快
  const tired = stamina.empty, running = (keys.ShiftLeft || keys.ShiftRight) && !tired;
  const speed = (inWater ? .5 : 1) * (tired ? TIRED : running ? (stamina.value < 15 ? WALK * 1.2 : RUN) : WALK) * Math.min(1, len);
  stamina.update(dt, Math.min(1, len), running);
  const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
  const vx = (fx * my - fz * mx) * speed, vz = (fz * my + fx * mx) * speed;
  player.pos.x += vx * dt; player.pos.z += vz * dt;
  if (len > .05) {
    let d = Math.atan2(vx, vz) - player.face; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    player.face += d * Math.min(1, dt * 12);
    if (firstPerson) player.face = cam.yaw;
    else if (my > .3 && !drag) { let dy = player.face - cam.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; cam.yaw += dy * dt * 1.2; }
  }
  // 跳跃 / 重力
  if (keys.Space && player.ground && !sleeping && !tired) { player.vy = JUMP; player.ground = false; stamina.use('jump'); }
  player.vy -= GRAV * dt; player.pos.y += player.vy * dt;
  // 脚下的高度：房子的地板、楼梯、二楼（上台阶时直接迈上去）
  // 鱼塘：水有深度，走进去会沉下去一截（用户说的）
  const wd = pond.depthAt(player.pos), gy = wd > 0 ? -wd : house.groundAt(player.pos);
  if (wd > 0 && !inWater) { pond.splash(player.pos.x, player.pos.z); toast('💦 扑通！掉进水里了'); } inWater = wd > 0;
  if (player.pos.y <= gy || (player.ground && player.pos.y - gy < .45 && player.vy <= 0)) { player.pos.y = gy; player.vy = 0; player.ground = true; } else player.ground = false;
  if (sleeping) { player.pos.set(sleeping.x, sleeping.y, sleeping.z); player.vy = 0; }
  // 碰撞：树、灌木、花坛；走到边上就停住
  const pr = .55;
  garden.collide(player.pos); ramCheck(dt, neighbors.collide(player.pos), running);
  house.collide(player.pos);
  plotFenceCollide(player.pos);
  dog.collideKennel(player.pos);
  dog.collideYard(player.pos);
  coop.collide(player.pos);
  RANCHES.forEach(r => r.collide(player.pos));
  pond.collide(player.pos);
  grill.collide(player.pos); birds.collide(player.pos);
  shops.forEach(s => s.collide(player.pos)); hall.collide(player.pos);
  colliders.forEach(([cx, cz, cr]) => {
    const dx = player.pos.x - cx, dz = player.pos.z - cz, d = Math.hypot(dx, dz), min = cr + pr;
    if (d < min && d > 1e-4 && player.pos.y < 1.5) { player.pos.x = cx + dx / d * min; player.pos.z = cz + dz / d * min; }
  });
  const r = Math.hypot(player.pos.x, player.pos.z); if (r > EDGE) { player.pos.x *= EDGE / r; player.pos.z *= EDGE / r; }

  me.root.position.copy(player.pos); me.root.rotation.set(0, player.face, 0);
  if (sleeping) {   // 躺在床上：头朝枕头那头
    me.root.quaternion.setFromAxisAngle(Y_AXIS, sleeping.yaw).multiply(Q_LIE);
    me.root.position.set(sleeping.x + Math.cos(sleeping.yaw) * .75, sleeping.y + sleeping.top, sleeping.z - Math.sin(sleeping.yaw) * .75);
  }
  me.root.visible = !firstPerson || overview;
  if (me.rig.shadow) { me.rig.shadow.position.y = .02 - player.pos.y; me.rig.shadow.material.opacity = .25 / (1 + player.pos.y * .3); }
  me.animate(dt, Math.min(1, speed / WALK), !player.ground, false);
  if (pet) {
    const want = tmp.set(player.pos.x - Math.sin(player.face) * .7 + Math.cos(player.face) * 1.5, 0, player.pos.z - Math.cos(player.face) * .7 - Math.sin(player.face) * 1.5);
    const d = want.distanceTo(petPos), moving = d > .25;
    if (d > 30) petPos.copy(want);
    else if (moving) { const dir = want.clone().sub(petPos).normalize(); petPos.addScaledVector(dir, Math.min(d, dt * Math.max(4, d * 3))); pet.group.rotation.y = Math.atan2(dir.x, dir.z); }
    pet.group.position.copy(petPos); pet.update(dt, t, moving);
  }
  // 第三人称镜头：在人物身后，可以抬头看天
  camLook.set(player.pos.x, player.pos.y + 1.5, player.pos.z);
  if (firstPerson && !overview) {   // 第一人称：眼睛的位置，往镜头方向看
    const eyeY = sleeping ? sleeping.y + 1.2 : player.pos.y + 1.55, p = THREE.MathUtils.clamp(cam.pitch - .3, -1.2, 1.2);
    camera.position.set(player.pos.x, eyeY, player.pos.z);
    camera.lookAt(player.pos.x + Math.sin(cam.yaw) * Math.cos(p), eyeY - Math.sin(p), player.pos.z + Math.cos(cam.yaw) * Math.cos(p));
    return;
  }
  const inHut = house.inside(player.pos);
  const upk = inHut ? 0 : Math.max(0, -cam.pitch), cd = inHut ? 7.5 : Math.max(8, cam.dist * (1 - upk * .45)), pv = inHut ? Math.max(cam.pitch, 1.05) : Math.max(cam.pitch, -.12);
  camPos.set(camLook.x - Math.sin(cam.yaw) * cd * Math.cos(pv), camLook.y + Math.sin(pv) * cd, camLook.z - Math.cos(cam.yaw) * cd * Math.cos(pv));
  camPos.y = Math.max(camPos.y, .5);
  if (overview) { camPos.set(player.pos.x * .2, 560, player.pos.z * .2 + 80); camLook.set(player.pos.x * .2, 0, player.pos.z * .2); }
  camera.position.lerp(camPos, Math.min(1, dt * (overview ? 3 : 8)));
  if (upk > 0 && !overview) camLook.y += upk * 12;
  camera.lookAt(camLook);
}

function resize() {
  renderer.setSize(innerWidth, innerHeight); camera.aspect = innerWidth / innerHeight;
  camera.fov = camera.aspect < 1 ? 62 : 50;   // 竖屏手机视野放宽，人物不会被切掉
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), .05), t = clock.elapsedTime;
  clouds.forEach(c => { c.position.x += c.userData.v * dt; if (c.position.x > 560) c.position.x = -560; });
  sky.update(dt);
  garden.update(dt);
  house.update(dt, player.pos, firstPerson && !overview);
  renderSta();
  shops.forEach(s => s.update(dt, player.pos));
  dog.update(dt, player.pos, player.face);
  kennelSiteMark.visible = !dog.kennel;
  coop.update(dt);
  RANCHES.forEach(r => r.update(dt));
  pond.update(dt); updateFishing(dt); birds.update(dt, player.pos, player.face, selItem()); bfly.update(dt); loose.update(dt, player); looseHome(); mayor.update(dt); neighbors.update(dt, player); updateGuide(dt);
  grill.update(dt, grillCook.busy); grillCook.update(); houseCook.update();
  renderDogHud();
  homeGate.update(dt); HOME_GAPS.forEach(g => g.gate.update(dt));
  step(dt, t);
  // 站在哪块田旁边：显示能做什么
  nearBed = overview ? null : garden.nearest(player.pos.x, player.pos.z);
  nearBox = !overview && !nearBed && garden.nearChest(player.pos.x, player.pos.z);
  nearHouse = !overview && !nearBed ? house.nearThing(player.pos) : null;
  nearShop = !overview && !nearBed ? shops.find(s => s.near(player.pos)) || false : false;
  nearGate = overview || nearBed ? null : allGates().map(g => [g, g.dist(player.pos.x, player.pos.z) - (g === homeGate ? .8 : 0)]).filter(([, d]) => d < 1.9).sort((a, b) => a[1] - b[1]).map(([g]) => g)[0] || null;
  if (nearGate) { nearBox = false; nearHouse = null; nearShop = false; }
  gateFirst = !!nearGate && nearGate.dist(player.pos.x, player.pos.z) < 1.5 && selItem() !== 'knife';
  if (sleeping) { nearBed = null; nearBox = false; nearHouse = null; nearShop = false; nearGate = null; }
  const pr = $('prompt');
  const dogP = !overview && !sleeping && !chestOpen && !shopOpen ? dogPrompt(selItem()) : null;
  const coopP = (!overview && !sleeping && !chestOpen && !shopOpen ? mayorPrompt() || stealPrompt(selItem()) || cookPrompt(selItem()) : null) || (!gateFirst && !nearBed && !overview && !sleeping && !chestOpen && !shopOpen ? birdPrompt(selItem()) || loosePrompt(selItem()) : null) || (!gateFirst && !dogP && !nearBed && !overview && !sleeping && !chestOpen && !shopOpen ? coopPrompt(selItem()) || ranchPrompt(selItem()) || pondPrompt(selItem()) || fencePrompt(selItem()) : null);
  if (coopP) { pr.innerHTML = `<b>${coopP.can ? (isTouch ? '点按钮 · ' : 'E · ') : ''}${coopP.label}</b><span>${coopP.sub}</span>`; pr.classList.toggle('dim', !coopP.can); pr.classList.add('show'); $('actBtn').textContent = coopP.label.replace(/^\S+\s/, ''); $('actBtn').classList.toggle('show', coopP.can); }
  else if (dogP && (!nearBed || DOG_ITEMS.includes(selItem()))) { pr.innerHTML = `<b>${dogP.can ? (isTouch ? '点按钮 · ' : 'E · ') : ''}${dogP.label}</b><span>${dogP.sub}</span>`; pr.classList.toggle('dim', !dogP.can); pr.classList.add('show'); $('actBtn').textContent = dogP.label.replace(/^\S+\s/, ''); $('actBtn').classList.toggle('show', dogP.can); }
  else if (nearBed) { const a = garden.plan(nearBed, selItem()); pr.innerHTML = `<b>${a.kind ? (isTouch ? '点按钮 · ' : 'E · ') : ''}${a.label}</b><span>${garden.describe(nearBed)}</span>`; pr.classList.toggle('dim', !a.kind); pr.classList.add('show'); $('actBtn').textContent = a.label.replace(/^\S+\s/, '').replace(/（.*）/, ''); $('actBtn').classList.add('show'); }
  else if (nearGate && !chestOpen && !shopOpen) { const d = gateInfo(nearGate, selItem()); pr.innerHTML = `<b>${d.can ? (isTouch ? '点按钮 · ' : 'E · ') : ''}${d.label}</b><span>${d.sub}</span>`; pr.classList.toggle('dim', !d.can); pr.classList.add('show'); $('actBtn').textContent = d.label.replace(/^\S+\s/, ''); $('actBtn').classList.toggle('show', d.can); }
  else if (nearShop && !shopOpen) { const S = SHOPS[nearShop.kind]; pr.innerHTML = `<b>${isTouch ? '点按钮 · ' : 'E · '}${S.icon} 进${S.name}</b><span>${S.desc}</span>`; pr.classList.remove('dim'); pr.classList.add('show'); $('actBtn').textContent = '进' + S.name; $('actBtn').classList.add('show'); }
  else if (nearHouse && !chestOpen) { const d = house.describe(nearHouse, selItem()); pr.innerHTML = `<b>${d.can ? (isTouch ? '点按钮 · ' : 'E · ') : ''}${d.label}</b><span>${d.sub}</span>`; pr.classList.toggle('dim', !d.can); pr.classList.add('show'); $('actBtn').textContent = d.label.replace(/^\S+\s/, ''); $('actBtn').classList.toggle('show', d.can); }
  else if (nearBox && !chestOpen) { pr.innerHTML = `<b>${isTouch ? '点按钮 · ' : 'E · '}📦 打开箱子</b><span>把背包里的东西放进箱子，或者拿出来</span>`; pr.classList.remove('dim'); pr.classList.add('show'); $('actBtn').textContent = '打开箱子'; $('actBtn').classList.add('show'); }
  else if (sleeping) { pr.innerHTML = `<b>💤 正在${sleeping.name}上睡觉</b><span>体力每分钟 +${Math.round(sleeping.rate * 60)} · 按 E 或走路起床</span>`; pr.classList.remove('dim'); pr.classList.add('show'); $('actBtn').textContent = '起床'; $('actBtn').classList.add('show'); }
  else if (FOOD[selItem()] && !chestOpen && !shopOpen) { const k = selItem(); pr.innerHTML = `<b>${isTouch ? '点按钮 · ' : 'E / F · '}😋 吃掉 1 个${itemInfo(k).name}</b><span>体力 +${FOOD[k]}</span>`; pr.classList.remove('dim'); pr.classList.add('show'); $('actBtn').textContent = '吃掉'; $('actBtn').classList.add('show'); }
  else { pr.classList.remove('show'); $('actBtn').classList.remove('show'); }
  renderer.render(scene, camera);
});
document.getElementById('loading')?.classList.add('hide');
