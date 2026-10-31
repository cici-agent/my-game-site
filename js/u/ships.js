// ===== 三艘飞船的 3D 模型 =====
// 按概念图（俯视图坐标，单位 px）拉伸成带倒角的立体零件，再加发光线条、灯、尾焰。
// 所有飞船机头朝 +Z。返回 { group, flames[], flame, engineLight, tailZ, update(t) }
import * as THREE from 'three';
import { glowTex } from './tex.js';

const S = 1 / 36;   // 概念图 36px = 1 单位

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .38, metalness: .35, ...o });
const glow = color => new THREE.MeshBasicMaterial({ color });

// 概念图坐标 → 三维（x 右为飞船右侧，y 向上为机头方向）
function P3(x, y, h, cx, cy) { return new THREE.Vector3(-(x - cx) * S, h, -(y - cy) * S); }
function shapeOf(pts, cx, cy) {
  const sh = new THREE.Shape();
  pts.forEach(([x, y], i) => { const X = -(x - cx) * S, Y = -(y - cy) * S; i ? sh.lineTo(X, Y) : sh.moveTo(X, Y); });
  sh.closePath(); return sh;
}
// 平板零件：轮廓 pts 拉伸 thick 厚，中心高度 yMid
function plate(pts, cx, cy, thick, mat, yMid = 0, bevel = .04) {
  const geo = new THREE.ExtrudeGeometry(shapeOf(pts, cx, cy), { depth: thick, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 8 });
  geo.rotateX(Math.PI / 2); geo.translate(0, thick / 2 + yMid, 0);
  return new THREE.Mesh(geo, mat);
}
const mirror = (pts, cx) => pts.map(([x, y]) => [2 * cx - x, y]).reverse();
function both(g, pts, cx, cy, thick, mat, yMid, bevel) { g.add(plate(pts, cx, cy, thick, mat, yMid, bevel)); g.add(plate(mirror(pts, cx), cx, cy, thick, mat, yMid, bevel)); }
// 发光线：沿概念图折线贴在表面
function neon(g, pts, cx, cy, h, color, r = .035, closed = false) {
  const v = pts.map(([x, y]) => P3(x, y, h, cx, cy));
  const path = new THREE.CurvePath();
  for (let i = 0; i < v.length - 1; i++) path.add(new THREE.LineCurve3(v[i], v[i + 1]));
  if (closed) path.add(new THREE.LineCurve3(v[v.length - 1], v[0]));
  const m = new THREE.Mesh(new THREE.TubeGeometry(path, v.length * 8, r, 5, false), glow(color));
  g.add(m); return m;
}
function neonBoth(g, pts, cx, cy, h, color, r) { neon(g, pts, cx, cy, h, color, r); neon(g, pts.map(([x, y]) => [2 * cx - x, y]), cx, cy, h, color, r); }
function halo(g, pos, color, size, opacity = .8) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  s.position.copy(pos); s.scale.setScalar(size); g.add(s); return s;
}
function flameAt(g, pos, color, size = 1) {
  const f = halo(g, pos, color, size, 1); f.userData.base = size; return f;
}
// 椭球（座舱玻璃等）
function blob(g, pos, r, scale, mat) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat); m.position.copy(pos); m.scale.set(...scale); g.add(m); return m;
}
// 沿 Z 方向的圆柱（发动机舱、导弹）
function tubeZ(g, pos, r, len, mat, seg = 16) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, seg), mat); m.rotation.x = Math.PI / 2; m.position.copy(pos); g.add(m); return m;
}
function coneZ(g, pos, r, len, mat) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, len, 16), mat); m.rotation.x = Math.PI / 2; m.position.copy(pos); g.add(m); return m;
}

// =============== 1. 小菜鸟号：白身橙翼 + 青色能量条 ===============
function rookie() {
  const g = new THREE.Group(), cx = 220, cy = 170;
  const white = std(0xf4f6fb, { metalness: .25 }), whiteDk = std(0xd9e0ec, { metalness: .3 });
  const orange = std(0xff6b35, { metalness: .2 }), dark = std(0x2b3550, { metalness: .6, roughness: .4 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x5fd3ff, roughness: .05, metalness: .1, clearcoat: 1, emissive: 0x0d4a6e, emissiveIntensity: .5 });
  // 机身（厚倒角，圆润）
  // 圆润的胶囊机身（保持"友好"的感觉）+ 橙色锥形机鼻
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.66, 4.6, 10, 24), white); body.rotation.x = Math.PI / 2; body.position.copy(P3(220, 190, 0, cx, cy)); g.add(body);
  coneZ(g, P3(220, 78, 0, cx, cy), .66, 1.5, orange);
  const sensor = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), dark); sensor.position.copy(P3(220, 60, .22, cx, cy)); g.add(sensor);
  // 座舱
  blob(g, P3(220, 126, .5, cx, cy), .5, [.72, .55, 1.6], glass);
  const frame = new THREE.Mesh(new THREE.TorusGeometry(.37, .045, 6, 24), dark); frame.position.copy(P3(220, 126, .52, cx, cy)); frame.rotation.x = Math.PI / 2; frame.scale.set(1, 2.1, 1); g.add(frame);
  // 机身装饰环
  [170, 250].forEach(y => { const r = new THREE.Mesh(new THREE.TorusGeometry(.665, .025, 6, 32), whiteDk); r.position.copy(P3(220, y, 0, cx, cy)); g.add(r); });
  // 主翼 + 橙色翼条 + 青色边线
  both(g, [[196, 170], [90, 240], [88, 268], [110, 270], [198, 245]], cx, cy, .2, white, -.15, .04);
  both(g, [[192, 190], [98, 248], [100, 256], [194, 205]], cx, cy, .22, orange, -.13, .02);
  neonBoth(g, [[112, 268], [196, 242]], cx, cy, -.02, 0x3ee8ff, .03);
  // 翼尖吊舱 + 航行灯（左红右绿，会闪）
  const lights = [];
  [[85, 0xff4d6d], [355, 0x4dff88]].forEach(([x, c]) => {
    tubeZ(g, P3(x, 252, -.12, cx, cy), .15, 1.05, whiteDk);
    const l = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), glow(c)); l.position.copy(P3(x, 232, -.12, cx, cy)); g.add(l);
    lights.push(halo(g, l.position, c, .9));
  });
  // 尾翼
  both(g, [[204, 250], [176, 294], [200, 294]], cx, cy, .16, orange, .1, .03);
  const vfin = new THREE.Mesh(new THREE.BoxGeometry(.1, .9, 1.1), orange); vfin.position.copy(P3(220, 262, .85, cx, cy)); vfin.rotation.x = -.35; g.add(vfin);
  // 能量条 + 箭头
  const strip = new THREE.Mesh(new THREE.BoxGeometry(.16, .06, .8), glow(0x3ee8ff)); strip.position.copy(P3(220, 194, .64, cx, cy)); g.add(strip);
  neon(g, [[212, 222], [220, 230], [228, 222]], cx, cy, .62, 0x3ee8ff, .028);
  neon(g, [[212, 232], [220, 240], [228, 232]], cx, cy, .6, 0x3ee8ff, .028);
  // 两侧进气口
  [196, 244].forEach(x => {
    const box = new THREE.Mesh(new THREE.BoxGeometry(.3, .42, .9), dark); box.position.copy(P3(x, 194, .2, cx, cy)); g.add(box);
    for (let k = 0; k < 3; k++) { const sl = new THREE.Mesh(new THREE.BoxGeometry(.32, .04, .05), whiteDk); sl.position.copy(P3(x, 184 + k * 9, .43, cx, cy)); g.add(sl); }
  });
  // 主引擎
  tubeZ(g, P3(220, 296, 0, cx, cy), .52, .5, dark);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(.38, .07, 8, 24), glow(0xff9d3d)); ring.position.copy(P3(220, 306, 0, cx, cy)); g.add(ring);
  const flame = flameAt(g, P3(220, 316, 0, cx, cy), 0xffa04d, 1.4);
  const engineLight = new THREE.PointLight(0xff8a3d, 30, 14); engineLight.position.copy(P3(220, 320, 0, cx, cy)); g.add(engineLight);
  return { group: g, flames: [flame], flame, engineLight, tailZ: -4.3,
    update(t) { const on = Math.sin(t * 6) > .3; lights.forEach(l => l.material.opacity = on ? .9 : .15); strip.material.color.setHSL(.52, 1, .55 + Math.sin(t * 3) * .08); } };
}

// =============== 2. 雷电号：参考 SR-71 —— 细长机身 + 边条 + 三角翼 + 翼中发动机舱 ===============
function thunder() {
  const g = new THREE.Group(), cx = 495, cy = 170;
  const red = std(0xd6283f, { metalness: .4 }), redDk = std(0x9e1a2e, { metalness: .45 });
  const blue = std(0x1f4fc4, { metalness: .45 }), steel = std(0x5b6478, { metalness: .8, roughness: .3 }), cone = std(0xd8dee9, { metalness: .9, roughness: .2 });
  const dark = std(0x1a1f30, { metalness: .6 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x7fd8ff, roughness: .05, clearcoat: 1, emissive: 0x0d3a5e, emissiveIntensity: .6 });
  // 细长机身 + 两侧边条（像刀刃）
  g.add(plate([[495, 32], [506, 100], [512, 200], [512, 270], [504, 304], [486, 304], [478, 270], [478, 200], [484, 100]], cx, cy, .62, red, .05, .24));
  both(g, [[492, 56], [462, 200], [476, 200], [486, 110]], cx, cy, .08, redDk, -.02, .02);
  g.add(plate([[495, 32], [500, 56], [490, 56]], cx, cy, .5, dark, .05, .2));                  // 雷达罩尖
  // 三角翼 + 红色前缘 + 闪电能量线
  both(g, [[480, 150], [396, 270], [408, 284], [482, 276]], cx, cy, .16, blue, -.08, .03);
  both(g, [[480, 150], [396, 270], [401, 272], [481, 162]], cx, cy, .18, red, -.07, .015);
  neonBoth(g, [[470, 200], [452, 224], [462, 226], [418, 266]], cx, cy, .03, 0xffe14d, .035);
  // 翼中发动机舱：进气锥（兼炮口）+ 舱体 + 斜垂尾
  const muzzles = [];
  [441, 549].forEach((x, i) => {
    tubeZ(g, P3(x, 240, .05, cx, cy), .33, 2.7, steel, 20);
    coneZ(g, P3(x, 186, .05, cx, cy), .3, .9, cone);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(.08, 8, 6), glow(0x3ee8ff)); tip.position.copy(P3(x, 172, .05, cx, cy)); g.add(tip);
    muzzles.push(halo(g, tip.position, 0x3ee8ff, .7));
    neon(g, [[x, 206], [x, 278]], cx, cy, .39, 0x3ee8ff, .025);
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(.36, .28, .35, 20, 1, true), dark); nozzle.rotation.x = Math.PI / 2;
    nozzle.position.copy(P3(x, 292, .05, cx, cy)); g.add(nozzle);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.26, .05, 8, 20), glow(0x5fb8ff)); ring.position.copy(P3(x, 297, .05, cx, cy)); g.add(ring);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(.07, .8, .9), blue);
    fin.position.copy(P3(x, 262, .55, cx, cy)); fin.rotation.z = (i ? 1 : -1) * .25; fin.rotation.x = -.3; g.add(fin);
  });
  // 双座舱（前后串列）
  blob(g, P3(495, 92, .5, cx, cy), .32, [.85, .6, 2.2], glass);
  blob(g, P3(495, 134, .48, cx, cy), .28, [.85, .55, 1.4], glass);
  // 脊背闪电涂装
  g.add(plate([[499, 168], [487, 196], [497, 196], [489, 224], [509, 188], [499, 188], [505, 168]], cx, cy, .02, glow(0xffe14d), .46, 0));
  tubeZ(g, P3(495, 304, .05, cx, cy), .18, .3, dark);
  const flames = [flameAt(g, P3(441, 306, .05, cx, cy), 0x5fb8ff, 1.2), flameAt(g, P3(549, 306, .05, cx, cy), 0x5fb8ff, 1.2)];
  const engineLight = new THREE.PointLight(0x5fb8ff, 30, 14); engineLight.position.copy(P3(495, 312, 0, cx, cy)); g.add(engineLight);
  return { group: g, flames, flame: flames[0], engineLight, tailZ: -3.9,
    update(t) { muzzles.forEach(m => m.material.opacity = .5 + Math.sin(t * 4) * .3); } };
}

// =============== 3. 星空号：深蓝飞翼 + 青色电路 + 能量核心 + 双联导弹舱 ===============
function starry() {
  const g = new THREE.Group(), cx = 220, cy = 170;
  const navy = std(0x1e2a6e, { metalness: .5, roughness: .32 }), navy2 = std(0x33419a, { metalness: .5, roughness: .3 });
  const silver = std(0xaab3c8, { metalness: .85, roughness: .25 }), redTip = std(0xff3d6e), dark = std(0x0b0f26, { metalness: .6 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x9b6dff, roughness: .05, clearcoat: 1, emissive: 0x3a1a8c, emissiveIntensity: .7 });
  const wing = [[220, 30], [330, 220], [350, 262], [318, 288], [270, 272], [220, 290], [170, 272], [122, 288], [90, 262], [110, 220]];
  g.add(plate(wing, cx, cy, .3, navy, -.05, .1));
  neon(g, wing, cx, cy, .12, 0x3ee8ff, .04, true);                                            // 外轮廓发光
  g.add(plate([[220, 24], [242, 100], [240, 282], [200, 282], [198, 100]], cx, cy, .5, navy2, .05, .2));   // 中央机身
  // 电路纹
  neonBoth(g, [[226, 82], [300, 210], [280, 210], [262, 240]], cx, cy, .23, 0x3ee8ff, .03);
  neonBoth(g, [[256, 150], [280, 182], [308, 182]], cx, cy, .23, 0xb388ff, .025);
  neonBoth(g, [[244, 250], [270, 262], [308, 270]], cx, cy, .23, 0xb388ff, .025);
  [[308, 182], [132, 182], [308, 270], [132, 270]].forEach(([x, y]) => { const n = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), glow(0xb388ff)); n.position.copy(P3(x, y, .23, cx, cy)); g.add(n); });
  // 星点
  const stars = [];
  [[176, 226], [268, 230], [300, 248], [140, 248], [250, 206], [190, 206], [118, 232], [322, 236], [150, 244], [292, 230]].forEach(([x, y], i) => {
    const s = new THREE.Mesh(new THREE.SphereGeometry(i > 7 ? .07 : .04, 6, 4), glow(0xffffff)); s.position.copy(P3(x, y, .22, cx, cy)); g.add(s); stars.push(s);
  });
  // 紫色水滴座舱
  blob(g, P3(220, 112, .5, cx, cy), .3, [.85, .55, 1.6], glass);
  // 机炮口
  [198, 242].forEach(x => { const b = new THREE.Mesh(new THREE.BoxGeometry(.12, .1, .45), glow(0x3ee8ff)); b.position.copy(P3(x, 126, .25, cx, cy)); g.add(b); });
  // 能量核心（会转）
  const corePos = P3(220, 190, .5, cx, cy);
  const coreRing = new THREE.Mesh(new THREE.TorusGeometry(.5, .07, 10, 32), glow(0x3ee8ff)); coreRing.rotation.x = Math.PI / 2; coreRing.position.copy(corePos); g.add(coreRing);
  const coreRing2 = new THREE.Mesh(new THREE.TorusGeometry(.36, .03, 8, 24), glow(0xb388ff)); coreRing2.position.copy(corePos); coreRing2.position.y += .08; g.add(coreRing2);
  const core = new THREE.Mesh(new THREE.SphereGeometry(.22, 16, 12), glow(0xe8fbff)); core.position.copy(corePos); g.add(core);
  const coreGlow = halo(g, corePos, 0x3ee8ff, 2.2, .7);
  // 双联导弹舱（机翼下方）
  [133.5, 147.5, 292.5, 306.5].forEach(x => {
    tubeZ(g, P3(x, 182, -.28, cx, cy), .15, 1.6, silver, 12);
    coneZ(g, P3(x, 145, -.28, cx, cy), .15, .45, redTip);
    const band = new THREE.Mesh(new THREE.TorusGeometry(.155, .03, 6, 12), glow(0x3ee8ff)); band.position.copy(P3(x, 198, -.28, cx, cy)); g.add(band);
  });
  [140, 300].forEach(x => { const pylon = new THREE.Mesh(new THREE.BoxGeometry(.5, .15, 1.3), dark); pylon.position.copy(P3(x, 180, -.14, cx, cy)); g.add(pylon); });
  // 翼尖紫灯
  const tipLights = [96, 344].map(x => { const l = new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 6), glow(0xb388ff)); l.position.copy(P3(x, 262, .12, cx, cy)); g.add(l); return halo(g, l.position, 0xb388ff, .8); });
  // 三个引擎
  const flames = [];
  [[203, 283, .9], [220, 287, 1.4], [237, 283, .9]].forEach(([x, y, size]) => {
    tubeZ(g, P3(x, y, .05, cx, cy), .2 + size * .06, .4, dark);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(.18 + size * .05, .04, 6, 16), glow(0x3ee8ff)); ring.position.copy(P3(x, y + 7, .05, cx, cy)); g.add(ring);
    flames.push(flameAt(g, P3(x, y + 16, .05, cx, cy), 0x3ee8ff, size));
  });
  const engineLight = new THREE.PointLight(0x3ee8ff, 30, 14); engineLight.position.copy(P3(220, 312, 0, cx, cy)); g.add(engineLight);
  return { group: g, flames, flame: flames[1], engineLight, tailZ: -3.8,
    update(t) {
      coreRing.rotation.z = t * 1.5; coreRing2.rotation.x = t * 2; coreRing2.rotation.y = t * 1.3;
      coreGlow.material.opacity = .55 + Math.sin(t * 3) * .2;
      stars.forEach((s, i) => s.scale.setScalar(.7 + .5 * Math.abs(Math.sin(t * 2 + i))));
      tipLights.forEach(l => l.material.opacity = Math.sin(t * 5) > .2 ? .9 : .2);
    } };
}

export const SHIP_BUILDERS = { rookie, thunder, starry };
export function buildShip(key) {
  const s = (SHIP_BUILDERS[key] || rookie)();
  s.group.traverse(o => { if (o.isMesh) o.frustumCulled = true; });
  return s;
}
