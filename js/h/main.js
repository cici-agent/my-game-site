// ===== 菜鸟家园：大致布局（中心广场 + 小路 + 空地块 + 花草树木），还没有房子 =====
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildAvatar, buildPet } from '../p/avatar.js';
import { INV, loadInventory } from '../p/inventory.js';
import { L, createLayout, ribbon } from './layout.js';

// ---------- 布局：弯弯的主路 + 零零散散的大空地 + 弯弯的小道（见 layout.js） ----------
// 固定种子的随机数：每次打开布局都一样
let seed = 20261107;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
const range = (a, b) => a + rnd() * (b - a);
const pick = arr => arr[Math.floor(rnd() * arr.length)];
const LAY = createLayout(rnd), PLOTS = LAY.plots;
const { onPath, onPlot } = LAY;
const blocked = (x, z, m = .4) => onPath(x, z, m) || onPlot(x, z, m);
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

// 天空：上蓝下浅的渐变大球
{
  const g = new THREE.SphereGeometry(1400, 32, 16), pos = g.attributes.position, cols = [];
  const top = new THREE.Color(0x5eaefc), bottom = new THREE.Color(0xe8f6ff);
  for (let i = 0; i < pos.count; i++) { const c = bottom.clone().lerp(top, Math.pow(Math.max(0, pos.getY(i) / 1400), .55)); cols.push(c.r, c.g, c.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  scene.add(new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false })));
}
scene.add(new THREE.HemisphereLight(0xe4f3ff, 0x5f8f3e, 1.4));
const sun = new THREE.DirectionalLight(0xfff0d8, 2.3);
sun.position.set(160, 230, 105);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 2048 : 4096, isTouch ? 2048 : 4096);
Object.assign(sun.shadow.camera, { left: -350, right: 350, top: 350, bottom: -350, near: 10, far: 900 });
sun.shadow.bias = -.0006; sun.shadow.normalBias = .4;
scene.add(sun);

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

// ---------- 空地块：浅一点的草坪 + 一圈矮木桩（门口留空），大小、方向都不一样，以后在这里盖小屋 ----------
const plotLawn = flatMat(0xa3db74, 2), plotBorder = flatMat(0x8cc462, 1);
const postGeo = new THREE.CylinderGeometry(.13, .16, .9, 6);
const postCount = PLOTS.reduce((n, p) => n + 4 * Math.floor(p.size / 4), 0);
const posts = new THREE.InstancedMesh(postGeo, mat(0xa06a3c), postCount);
const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1), up = new THREE.Vector3(0, 1, 0);
let pi = 0;
PLOTS.forEach(p => {
  flat(new THREE.PlaneGeometry(p.size + .5, p.size + .5), plotBorder, p.x, p.z, p.rot);
  flat(new THREE.PlaneGeometry(p.size, p.size), plotLawn, p.x, p.z, p.rot);
  const h = p.size / 2, n = Math.floor(p.size / 4), c = Math.cos(p.rot), sn = Math.sin(p.rot);
  for (let side = 0; side < 4; side++) for (let k = 0; k < n; k++) {
    const t = -h + k * (p.size / n);
    const [lx, lz] = [[t, -h], [h, t], [-t, h], [-h, -t]][side];
    const gate = lz === h && Math.abs(lx) < 3;                  // 门口：朝路那条边（本地 +z）中间留空
    const corner = Math.abs(lx) === h && Math.abs(lz) === h;
    const wx = p.x + lx * c + lz * sn, wz = p.z - lx * sn + lz * c;
    posts.setMatrixAt(pi++, m4.compose(v.set(wx, gate ? -5 : (corner ? .45 : .3), wz), q.setFromAxisAngle(up, p.rot), s.set(1, corner ? 1 : .65, 1)));
  }
});
posts.castShadow = true;
scene.add(posts);

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
const clouds = [];
{
  const cm = mat(0xffffff, { roughness: 1, emissive: 0xffffff, emissiveIntensity: .25 });
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
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (/^(Key[WASD]|Arrow)/.test(e.code)) $('hint')?.classList.add('hide');
  if (e.code === 'KeyM' && !e.repeat) overview = !overview;   // M：俯瞰整个小镇
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
canvas.addEventListener('wheel', e => { cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * .006, 9, 28); }, { passive: true });

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

const WALK = 7.5, RUN = 12, GRAV = 26, JUMP = 9.5, EDGE = WR - 6;
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), tmp = new THREE.Vector3();
camera.position.set(LAY.spawn.x - Math.sin(LAY.spawn.yaw) * 13, 5.5, LAY.spawn.z - Math.cos(LAY.spawn.yaw) * 13);
function step(dt, t) {
  let mx = 0, my = 0;
  if (keys.KeyW || keys.ArrowUp) my += 1;
  if (keys.KeyS || keys.ArrowDown) my -= 1;
  if (keys.KeyA || keys.ArrowLeft) mx -= 1;
  if (keys.KeyD || keys.ArrowRight) mx += 1;
  if (joy.id !== null) { mx = joy.x; my = joy.y; }
  const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
  const running = keys.ShiftLeft || keys.ShiftRight;
  const speed = (running ? RUN : WALK) * Math.min(1, len);
  const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
  const vx = (fx * my - fz * mx) * speed, vz = (fz * my + fx * mx) * speed;
  player.pos.x += vx * dt; player.pos.z += vz * dt;
  if (len > .05) {
    let d = Math.atan2(vx, vz) - player.face; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    player.face += d * Math.min(1, dt * 12);
    if (my > .3 && !drag) { let dy = player.face - cam.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; cam.yaw += dy * dt * 1.2; }
  }
  // 跳跃 / 重力
  if (keys.Space && player.ground) { player.vy = JUMP; player.ground = false; }
  player.vy -= GRAV * dt; player.pos.y += player.vy * dt;
  if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.ground = true; }
  // 碰撞：树、灌木、花坛；走到边上就停住
  const pr = .55;
  colliders.forEach(([cx, cz, cr]) => {
    const dx = player.pos.x - cx, dz = player.pos.z - cz, d = Math.hypot(dx, dz), min = cr + pr;
    if (d < min && d > 1e-4 && player.pos.y < 1.5) { player.pos.x = cx + dx / d * min; player.pos.z = cz + dz / d * min; }
  });
  const r = Math.hypot(player.pos.x, player.pos.z); if (r > EDGE) { player.pos.x *= EDGE / r; player.pos.z *= EDGE / r; }

  me.root.position.copy(player.pos); me.root.rotation.set(0, player.face, 0);
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
  const upk = Math.max(0, -cam.pitch), cd = Math.max(8, cam.dist * (1 - upk * .45)), pv = Math.max(cam.pitch, -.12);
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
  step(dt, t);
  renderer.render(scene, camera);
});
document.getElementById('loading')?.classList.add('hide');
