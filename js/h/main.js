// ===== 菜鸟家园：大致布局（中心广场 + 小路 + 空地块 + 花草树木），还没有房子 =====
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildAvatar, buildPet } from '../p/avatar.js';
import { INV, loadInventory } from '../p/inventory.js';
import { L, createLayout, ribbon } from './layout.js';
import { createGarden, CROPS, LEVELS, itemInfo, chooseSide, inGarden } from './garden.js';
import { createHouse, inHouse, HOUSE_NAMES } from './house.js';
import { createGate, fenceMaterial } from './gate.js';
import { createDog } from './dog.js';
import { createStamina, FOOD, MAX as STA_MAX } from './stamina.js';
import { createShop, SHOP_ITEMS, sellPrice } from './shop.js';
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
const homePlot = PLOTS.slice().sort((a, b) => Math.hypot(a.x - LAY.spawn.x, a.z - LAY.spawn.z) - Math.hypot(b.x - LAY.spawn.x, b.z - LAY.spawn.z))[0];
const gardenSide = chooseSide(homePlot, (x, z) => onPath(x, z, 1.5) || onPlot(x, z, 1));
const blocked = (x, z, m = .4) => onPath(x, z, m) || onPlot(x, z, m) || inGarden(homePlot, gardenSide, x, z, m);
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
// 每块空地四条边，去掉门口，剩下的一段段栅栏（空地自己的坐标）
function fenceSegs(p) {
  const h = p.size / 2, out = [];
  const sides = [[-h, -h, h, -h, []], [h, -h, h, h, []], [h, h, -h, h, [[h - PLOT_GATE / 2, h + PLOT_GATE / 2]]], [-h, h, -h, -h, []]];
  if (p === homePlot) { const gs = gardenSide > 0 ? 1 : 3, a = sides[gs], gz = h - 3;   // 自家空地朝菜园那边留个口（接菜园的小路，菜园有自己的栅栏门）
    a[4].push(gardenSide > 0 ? [h + gz - 2.2, h + gz + 2.2] : [h - gz - 2.2, h - gz + 2.2]); }
  sides.forEach(([ax, az, bx, bz, gaps]) => {
    const len = Math.hypot(bx - ax, bz - az); let t = 0;
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
PLOTS.forEach((p, idx) => {
  flat(new THREE.PlaneGeometry(p.size + .5, p.size + .5), plotBorder, p.x, p.z, p.rot);
  flat(new THREE.PlaneGeometry(p.size, p.size), plotLawn, p.x, p.z, p.rot);
  const c = Math.cos(p.rot), sn = Math.sin(p.rot), W = (lx, lz) => [p.x + lx * c + lz * sn, p.z - lx * sn + lz * c];
  FENCE[idx].forEach(([ax, az, bx, bz]) => {
    const len = Math.hypot(bx - ax, bz - az), k = Math.max(1, Math.round(len / 2.2)), ang = p.rot - Math.atan2(bz - az, bx - ax);
    for (let i = 0; i <= k; i++) { const [wx, wz] = W(ax + (bx - ax) * i / k, az + (bz - az) * i / k); posts.setMatrixAt(pi++, m4.compose(v.set(wx, (FENCE_H + .2) / 2, wz), q.setFromAxisAngle(up, p.rot), s.set(1, 1, 1))); }
    for (let i = 0; i < k; i++) { const [wx, wz] = W(ax + (bx - ax) * (i + .5) / k, az + (bz - az) * (i + .5) / k); panels.setMatrixAt(pj++, m4.compose(v.set(wx, FENCE_H / 2 + .08, wz), q.setFromAxisAngle(up, ang), s.set(len / k - .14, 1, 1))); }
  });
  // 大门：在朝路那边（本地 +z）中间；只有自己家的能开关、上锁；别人家的先关着
  const holder = new THREE.Group(); holder.position.set(p.x, 0, p.z); holder.rotation.y = p.rot; scene.add(holder);
  const mine = p === homePlot;
  plotGates.push(createGate({ parent: holder, x: 0, z: p.size / 2, axis: 'x', width: PLOT_GATE - .2, height: FENCE_H, double: true, out: 1, key: mine ? 'xcn_gate_plot' : null, live: mine, shadow: mine }));
});
posts.castShadow = panels.castShadow = true;
scene.add(posts); scene.add(panels);
const homeGate = plotGates[PLOTS.indexOf(homePlot)];
// 自家空地的栅栏挡人，但能跳过去（用户说的）；大门开着才能走过去
function plotFenceCollide(pos, pr = .45) {
  const p = homePlot, h = p.size / 2, c = Math.cos(p.rot), sn = Math.sin(p.rot), dx = pos.x - p.x, dz = pos.z - p.z;
  let lx = dx * c - dz * sn, lz = dx * sn + dz * c; if (Math.abs(lx) > h + 2 || Math.abs(lz) > h + 2 || pos.y > .7) return;   // 用户说：栅栏要能跳过去
  const segs = homeGate.passable ? FENCE[PLOTS.indexOf(homePlot)] : FENCE[PLOTS.indexOf(homePlot)].concat([[-PLOT_GATE / 2, h, PLOT_GATE / 2, h]]);
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
    if (inGarden(homePlot, gardenSide, x, z, .3) || inHouse(homePlot, x, z, .6)) continue;   // 菜园里、小木棚里没有野草
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
const dog = createDog({ scene, isNight: () => darkness() > .55, groundAt: p => house.groundAt(p), collide: p => { house.collide(p, .35); garden.collide(p, .35); plotFenceCollide(p, .35); },
  guardSpot: () => { const [x, z] = garden.gateWorld(); return { x, z }; }, homeCenter: () => ({ x: homePlot.x, z: homePlot.z }),
  notify: m => { if (!nearBed) toast(m); }, onFrisbeeBack: () => {} });
// 修 bug 补偿：之前有个版本扔飞盘会把飞盘弄丢，有狗却哪里都找不到飞盘的，还一个（只做一次）
try { if (dog.has && !localStorage.getItem('xcn_fris_fix1')) { if (!garden.bag.count('frisbee') && !garden.chest.count('frisbee') && !house.cabinet.count('frisbee')) { if (!garden.bag.add('frisbee', 1)) garden.chest.add('frisbee', 1); } localStorage.setItem('xcn_fris_fix1', '1'); } } catch (e) {}
let sleeping = null, firstPerson = false;
// 小卖部：在广场上，背对第一条路，面朝广场中间
const shopAng = Math.atan2(LAY.roads[1].pts[8].x, LAY.roads[1].pts[8].z) + Math.PI * .8;
const shop = createShop({ scene, x: Math.sin(shopAng) * 13, z: Math.cos(shopAng) * 13, face: shopAng + Math.PI, buildAvatar });
// 出生在自家空地里、通往菜园的小路旁边，面朝菜园
[LAY.spawn.x, LAY.spawn.z] = garden.gateWorld();
LAY.spawn.yaw = garden.gateYaw();

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
  if (!shopOpen && !chestOpen && dogAction()) return renderBag();
  if (shopOpen) return closeShop();
  if (chestOpen) return closeChest();
  if (!nearBed && nearShop) return openShop();
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
function renderBag() {
  const b = garden.bag, cells = [];
  const num = i => `<u>${i + 1}</u>`;
  TOOLS.forEach((t, i) => cells.push(`<div class="slot tool${sel === i ? ' on' : ''}" data-i="${i}" title="${t.name}">${num(i)}<span class="veg">${t.icon}</span></div>`));
  for (let k = 0; k < b.cap; k++) { const i = k + TOOLS.length, sl = b.slots[k], on = sel === i ? ' on' : '';
    if (!sl) { cells.push(`<div class="slot${on}" data-i="${i}">${num(i)}</div>`); continue; }
    const it = itemInfo(sl.key); cells.push(it.seed
      ? `<div class="slot seed${on}" data-i="${i}" title="${it.name}">${num(i)}<span class="pk"><b>${it.sub}</b></span><i>${sl.n}</i></div>`     // 种子：一个个小纸袋
      : `<div class="slot${on}" data-i="${i}" title="${it.name}">${num(i)}<span class="veg">${it.icon}</span><i>${sl.n}</i></div>`);   // 收获的菜：大大的菜
  }
  $('bag').innerHTML = cells.join('');
}
$('bag').addEventListener('pointerdown', e => { if (chestOpen) return; const c = e.target.closest('.slot'); if (c) { e.preventDefault(); select(+c.dataset.i); } });

// ---------- 🐶 和狗互动：摸摸、喂、扔飞盘、放狗盆、加狗粮 ----------
let kennelLvInBag = +(localStorage.getItem('xcn_kennel_bag_lv') || 0);   // 收进背包的狗屋记住等级
const DOG_ITEMS = ['dogfood', 'frisbee', 'bowl', 'kennel'];
const KENNEL_UP = lv => dog.KENNEL[lv + 1];
function frontOf(d = 1.4) { return [player.pos.x + Math.sin(player.face) * d, player.pos.z + Math.cos(player.face) * d]; }
function dogPrompt(it) {
  const nm = dog.name;
  if (it === 'dogfood' && dog.nearBowl(player.pos)) return { label: '🦴 往狗盆里加狗粮', sub: `盆里有 ${dog.bowl.food} / 5 份`, can: true };
  if (it === 'bowl') return { label: dog.bowl ? '🥣 把狗盆挪到这里' : '🥣 把狗盆放在这里', sub: '狗饿了会自己来吃', can: true };
  if (it === 'kennel') return { label: '🛖 把狗屋放在这里', sub: '门会朝着你；狗晚上回去睡觉', can: true };
  if (it === 'glove' && dog.nearKennel(player.pos)) return { label: '🛖 把狗屋收起来', sub: '收进背包，可以换个地方放', can: true };
  if (dog.nearKennel(player.pos) && !dog.near(player.pos)) { const k = dog.kennel, up = KENNEL_UP(k.lv);
    return up ? { label: `🛖 升级狗屋：${up.name}（${up.price} 菜币）`, sub: `现在是 ${k.lv} 级 ${dog.KENNEL[k.lv].name}${dog.mode === 'sleep' ? ` · ${nm}在里面睡觉 💤` : ''}`, can: true }
              : { label: `🛖 ${dog.KENNEL[k.lv].name}（最高级）`, sub: dog.mode === 'sleep' ? `${nm}在里面睡觉 💤` : '晚上狗会回来睡觉', can: false }; }
  if (dog.near(player.pos)) {
    if (it === 'dogfood') return { label: `🦴 喂${nm}`, sub: dog.status(), can: true };
    if (it === 'frisbee') return { label: '🥏 扔飞盘', sub: `${nm}会跑去捡回来`, can: !dog.frisbeeOut };
    return { label: `🐶 摸摸${nm}`, sub: `${dog.status()} · ${dog.moodText()}`, can: true };
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
  if (it === 'dogfood' && dog.nearBowl(player.pos)) { if (dog.bowl.food >= 5) { toast('🥣 狗盆满了'); return true; } garden.bag.take('dogfood'); toast(`🦴 加了一份狗粮（盆里 ${dog.fillBowl()} / 5）`); return true; }
  if (dog.near(player.pos) && it === 'dogfood') { if (dog.full >= 95) { toast(`🐶 ${dog.name}已经吃饱了`); return true; } garden.bag.take('dogfood'); toast(dog.feed()); return true; }
  if (it === 'frisbee') {
    if (!dog.has) { toast('🥏 先去小卖部买一只小狗'); return true; }
    if (dog.frisbeeOut) { toast(`🐶 ${dog.name}正在捡飞盘`); return true; }
    dog.throwFrisbee(player.pos, player.face); stamina.use('work', .5); return true;   // 飞盘一直留在背包里，扔出去只是标记一下（不会弄丢）
  }
  if (it === 'bowl') { const [x, z] = frontOf(); const had = !!dog.bowl; if (!had) garden.bag.take('bowl'); dog.placeBowl(x, z); toast(had ? '🥣 狗盆挪到这里了' : '🥣 狗盆放好了：选中狗粮按 E 往里加'); return true; }   // 已经放了一个：直接挪过来
  if (it === 'kennel') { const [x, z] = frontOf(2.4); garden.bag.take('kennel'); dog.placeKennel(x, z, player.face + Math.PI, kennelLvInBag || 1); kennelLvInBag = 0; try { localStorage.setItem('xcn_kennel_bag_lv', '0'); } catch (e) {} toast('🛖 狗屋放好了：晚上狗会回来睡觉'); return true; }
  if (it === 'glove' && dog.nearKennel(player.pos)) { const lv = dog.takeKennel(); if (!garden.bag.add('kennel', 1)) garden.chest.add('kennel', 1); kennelLvInBag = lv; try { localStorage.setItem('xcn_kennel_bag_lv', String(lv)); } catch (e) {} toast('🛖 狗屋收进背包了'); return true; }
  if (dog.nearKennel(player.pos) && !dog.near(player.pos)) { const k = dog.kennel, up = KENNEL_UP(k.lv); if (!up) return true;
    if (!garden.wallet.spend(up.price)) { toast(`菜币不够：要 ${up.price}`); return true; }
    dog.setKennelLevel(k.lv + 1); renderMoney(); toast(`🛖 狗屋升级成 ${up.name}！`); return true; }
  if (it === 'glove' && dog.nearBowl(player.pos)) { const n = dog.takeBowl(); garden.bag.add('bowl', 1); if (n) garden.bag.add('dogfood', n); toast('🥣 狗盆收起来了'); return true; }
  if (dog.near(player.pos)) { toast(dog.pet()); return true; }
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
    $('shopList').innerHTML = SHOP_ITEMS.map((it, i) => { const info = itemInfo(it.key), lock = false, poor = garden.wallet.get() < it.price;
      return `<div class="row${lock ? ' lock' : ''}"><span class="ic">${info.seed ? `<span class="pk"><b>${info.sub}</b></span>` : info.icon}</span>
        <span class="nm">${info.name}<small>${lock ? `菜园 ${it.lv} 级才能买` : it.note || ''}</small></span><span class="pr">🥕 ${it.price}</span>
        <button data-i="${i}" data-n="1" ${lock || poor ? 'disabled' : ''}>买 1 个</button>${it.once ? '' : `<button data-i="${i}" data-n="5" ${lock || garden.wallet.get() < it.price * 5 ? 'disabled' : ''}>买 5 个</button>`}</div>`; }).join('');
  } else {
    const rows = []; const seen = new Set();
    garden.bag.slots.forEach(sl => { if (!sl || seen.has(sl.key) || !sellPrice(sl.key)) return; seen.add(sl.key);
      const info = itemInfo(sl.key), n = garden.bag.count(sl.key), p = sellPrice(sl.key);
      rows.push(`<div class="row"><span class="ic">${info.icon}</span><span class="nm">${info.name}<small>背包里有 ${n} 个</small></span><span class="pr">🥕 ${p} / 个</span>
        <button data-k="${sl.key}" data-n="1">卖 1 个</button><button data-k="${sl.key}" data-n="${n}">全部卖掉（${n * p}）</button></div>`); });
    $('shopList').innerHTML = rows.join('') || '<div class="empty">背包里没有能卖的菜。去菜园收一些吧！</div>';
  }
}
$('shopList').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b || b.disabled) return;
  if (shopTab === 'buy') {
    const it = SHOP_ITEMS[+b.dataset.i], n = +b.dataset.n, cost = it.price * n;
    if (it.key === 'kennel' && (dog.kennel || garden.bag.count('kennel') || garden.chest.count('kennel'))) { toast('🛖 你已经有一个狗屋了'); return; }
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
    if (garden.bag.take(k, n)) { garden.wallet.add(sellPrice(k) * n); toast(`卖掉 ${n} 个${itemInfo(k).name}，得到 ${sellPrice(k) * n} 菜币`); }
  }
  renderShop(); renderBag(); renderMoney();
});
document.querySelectorAll('#shopUI .tabs button').forEach(b => b.onclick = () => { shopTab = b.dataset.t; renderShop(); });
function openShop() { shopOpen = true; renderShop(); $('shopUI').classList.add('show'); Object.keys(keys).forEach(k => keys[k] = false); }
function closeShop() { shopOpen = false; $('shopUI').classList.remove('show'); }
$('shopClose').onclick = closeShop;
renderMoney(); setInterval(renderMoney, 1000);

// ---------- 箱子：走到旁边按 E 打开；拖动格子搬东西，点一下整格搬到另一边 ----------
let nearShop = false, shopOpen = false, shopTab = 'buy';
let nearGate = null; const GATE_NAME = g => g === homeGate ? '大门' : '菜园栅栏门';
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
                 : `<div class="slot" data-c="${c}" data-i="${i}" title="${it.name}"><span class="veg">${it.icon}</span><i>${sl.n}</i></div>`;
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
$('dbgDogStuff').onclick = () => { const ok = garden.bag.add('bowl', 1) && garden.bag.add('dogfood', 10) && garden.bag.add('frisbee', 1); renderBag(); toast(ok ? '🎁 送了狗盆、10 份狗粮、飞盘' : '🎒 背包满了，先把东西放进箱子'); };
$('dbgKennel').onclick = () => { if (!dog.has) dog.adopt(); const [x, z] = frontOf(3); if (dog.kennel) dog.setKennelLevel(dog.kennel.lv % 3 + 1); else dog.placeKennel(x, z, player.face + Math.PI, 1); toast(`🛖 狗屋：${dog.kennel.lv} 级 ${dog.KENNEL[dog.kennel.lv].name}（再点一下换下一级）`); };
$('dbgDogHungry').onclick = () => { dog.debug.setFull(10); toast('🐶 狗饿了'); };
$('dbgDogLoyal').onclick = () => { dog.debug.setLoyal(100); toast('🐶 忠诚度满了：会帮你看菜园'); };
$('dbgDogReset').onclick = () => { if (confirm('把狗和狗盆都清掉？')) { dog.debug.reset(); toast('🐶 清掉了'); } };
$('dbgStaLow').onclick = () => { stamina.set(0); toast('😩 体力用光了：走路会很慢'); };
setInterval(() => { renderBag(); renderMoney(); }, 1500);
// 自动测试用（只有网址带 ?test 才有）
if (new URLSearchParams(location.search).has('test')) window.__home = { dog, homeGate, get nearGate() { return nearGate; }, player, garden, house, shop, homePlot, stamina, cam, toggleView, goSleep, wakeUp, eatSelected, get sleeping() { return sleeping; }, openShop, act: () => doAction(), select: i => select(i), openChest, closeChest };

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
  const speed = (tired ? TIRED : running ? (stamina.value < 15 ? WALK * 1.2 : RUN) : WALK) * Math.min(1, len);
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
  const gy = house.groundAt(player.pos);
  if (player.pos.y <= gy || (player.ground && player.pos.y - gy < .45 && player.vy <= 0)) { player.pos.y = gy; player.vy = 0; player.ground = true; } else player.ground = false;
  if (sleeping) { player.pos.set(sleeping.x, sleeping.y, sleeping.z); player.vy = 0; }
  // 碰撞：树、灌木、花坛；走到边上就停住
  const pr = .55;
  garden.collide(player.pos);
  house.collide(player.pos);
  plotFenceCollide(player.pos);
  dog.collideKennel(player.pos);
  shop.collide(player.pos);
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
  shop.update(dt);
  dog.update(dt, player.pos, player.face);
  renderDogHud();
  homeGate.update(dt);
  step(dt, t);
  // 站在哪块田旁边：显示能做什么
  nearBed = overview ? null : garden.nearest(player.pos.x, player.pos.z);
  nearBox = !overview && !nearBed && garden.nearChest(player.pos.x, player.pos.z);
  nearHouse = !overview && !nearBed ? house.nearThing(player.pos) : null;
  nearShop = !overview && !nearBed && shop.near(player.pos);
  nearGate = overview || nearBed ? null : [garden.gate, homeGate].filter(Boolean).map(g => [g, g.dist(player.pos.x, player.pos.z) - (g === homeGate ? .8 : 0)]).filter(([, d]) => d < 1.9).sort((a, b) => a[1] - b[1]).map(([g]) => g)[0] || null;
  if (nearGate) { nearBox = false; nearHouse = null; nearShop = false; }
  if (sleeping) { nearBed = null; nearBox = false; nearHouse = null; nearShop = false; nearGate = null; }
  const pr = $('prompt');
  const dogP = !overview && !sleeping && !chestOpen && !shopOpen ? dogPrompt(selItem()) : null;
  if (dogP && (!nearBed || DOG_ITEMS.includes(selItem()))) { pr.innerHTML = `<b>${dogP.can ? (isTouch ? '点按钮 · ' : 'E · ') : ''}${dogP.label}</b><span>${dogP.sub}</span>`; pr.classList.toggle('dim', !dogP.can); pr.classList.add('show'); $('actBtn').textContent = dogP.label.replace(/^\S+\s/, ''); $('actBtn').classList.toggle('show', dogP.can); }
  else if (nearBed) { const a = garden.plan(nearBed, selItem()); pr.innerHTML = `<b>${a.kind ? (isTouch ? '点按钮 · ' : 'E · ') : ''}${a.label}</b><span>${garden.describe(nearBed)}</span>`; pr.classList.toggle('dim', !a.kind); pr.classList.add('show'); $('actBtn').textContent = a.label.replace(/^\S+\s/, '').replace(/（.*）/, ''); $('actBtn').classList.add('show'); }
  else if (nearGate && !chestOpen && !shopOpen) { const d = gateInfo(nearGate, selItem()); pr.innerHTML = `<b>${d.can ? (isTouch ? '点按钮 · ' : 'E · ') : ''}${d.label}</b><span>${d.sub}</span>`; pr.classList.toggle('dim', !d.can); pr.classList.add('show'); $('actBtn').textContent = d.label.replace(/^\S+\s/, ''); $('actBtn').classList.toggle('show', d.can); }
  else if (nearShop && !shopOpen) { pr.innerHTML = `<b>${isTouch ? '点按钮 · ' : 'E · '}🏪 进小卖部</b><span>买种子、树苗、蜡烛、杀虫剂；把菜卖掉换菜币</span>`; pr.classList.remove('dim'); pr.classList.add('show'); $('actBtn').textContent = '进小卖部'; $('actBtn').classList.add('show'); }
  else if (nearHouse && !chestOpen) { const d = house.describe(nearHouse, selItem()); pr.innerHTML = `<b>${d.can ? (isTouch ? '点按钮 · ' : 'E · ') : ''}${d.label}</b><span>${d.sub}</span>`; pr.classList.toggle('dim', !d.can); pr.classList.add('show'); $('actBtn').textContent = d.label.replace(/^\S+\s/, ''); $('actBtn').classList.toggle('show', d.can); }
  else if (nearBox && !chestOpen) { pr.innerHTML = `<b>${isTouch ? '点按钮 · ' : 'E · '}📦 打开箱子</b><span>把背包里的东西放进箱子，或者拿出来</span>`; pr.classList.remove('dim'); pr.classList.add('show'); $('actBtn').textContent = '打开箱子'; $('actBtn').classList.add('show'); }
  else if (sleeping) { pr.innerHTML = `<b>💤 正在${sleeping.name}上睡觉</b><span>体力每分钟 +${Math.round(sleeping.rate * 60)} · 按 E 或走路起床</span>`; pr.classList.remove('dim'); pr.classList.add('show'); $('actBtn').textContent = '起床'; $('actBtn').classList.add('show'); }
  else if (FOOD[selItem()] && !chestOpen && !shopOpen) { const k = selItem(); pr.innerHTML = `<b>${isTouch ? '点按钮 · ' : 'E / F · '}😋 吃掉 1 个${itemInfo(k).name}</b><span>体力 +${FOOD[k]}</span>`; pr.classList.remove('dim'); pr.classList.add('show'); $('actBtn').textContent = '吃掉'; $('actBtn').classList.add('show'); }
  else { pr.classList.remove('show'); $('actBtn').classList.remove('show'); }
  renderer.render(scene, camera);
});
document.getElementById('loading')?.classList.add('hide');
