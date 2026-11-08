// ===== 菜鸟家园 · 做饭（烤炉、灶台） =====
// 用户说：杀动物得到的是生肉，捞上来的鱼虾也是生的；每个人都有一个灶，要煤或者木头才能烧；
// 烧熟了回的体力多，卖得也贵；高级房子里自己有灶台，在那里烧花的煤 / 木头少一点，速度也快
import * as THREE from 'three';
import { plotToWorld } from './garden.js';

// 生的 → 熟的
export const RECIPES = {
  beef: 'steak', mutton: 'lambskewer', pork: 'roastpork', chicken_meat: 'roastchicken', duckmeat: 'roastduck',
  fish: 'grilledfish', shrimp: 'cookedshrimp', crab: 'steamedcrab', egg: 'friedegg', duckegg: 'boiledduckegg', potato: 'bakedpotato', corn: 'roastcorn',
};
export const COOKED_ITEMS = {
  steak: { icon: '🥩', name: '香煎牛排' }, lambskewer: { icon: '🍢', name: '烤羊肉串' }, roastpork: { icon: '🍖', name: '红烧肉' }, roastchicken: { icon: '🍗', name: '烤鸡腿' }, roastduck: { icon: '🦆', name: '烤鸭' },
  grilledfish: { icon: '🐟', name: '烤鱼' }, cookedshrimp: { icon: '🍤', name: '炸虾' }, steamedcrab: { icon: '🦀', name: '清蒸螃蟹' }, friedegg: { icon: '🍳', name: '煎蛋' }, boiledduckegg: { icon: '🥚', name: '咸鸭蛋' },
  bakedpotato: { icon: '🥔', name: '烤土豆' }, roastcorn: { icon: '🌽', name: '烤玉米' },
  wood: { icon: '🪵', name: '木头' }, coal: { icon: '⚫', name: '煤' },
};
// 吃了回多少体力（熟的比生的多很多）、卖多少钱（熟的贵一点）
export const COOKED_FOOD = { steak: 32, lambskewer: 28, roastpork: 30, roastchicken: 24, roastduck: 26, grilledfish: 20, cookedshrimp: 14, steamedcrab: 18, friedegg: 16, boiledduckegg: 16, bakedpotato: 16, roastcorn: 18 };
export const COOKED_SELL = { steak: 50, lambskewer: 38, roastpork: 42, roastchicken: 22, roastduck: 34, grilledfish: 22, cookedshrimp: 18, steamedcrab: 34, friedegg: 10, boiledduckegg: 14, bakedpotato: 9, roastcorn: 14 };
export const FUEL = { wood: 1, coal: 3 };   // 一块木头算 1 份柴，一块煤算 3 份
// 室外烤炉：一道菜 2 份柴、20 秒；房子里的灶台（3 级以上的房子才有）：1 份柴、8 秒
export const STOVES = { grill: { fuel: 2, time: 20, name: '烤炉' }, house: { fuel: 1, time: 8, name: '灶台' } };

export function grillSpot(plot, side) { return { x: side * 6, z: 8 }; }

// 一个“锅”：放进柴，放进生的，过一会儿变熟
export function createCooker(kind, KEY, onDone) {
  let st = null; try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  st ||= { fuel: 0, busy: null };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const S = STOVES[kind];
  // 离开游戏时正在烧的：回来时已经好了
  if (st.busy && Date.now() >= st.busy.end) { const r = st.busy.raw; st.busy = null; save(); setTimeout(() => onDone(RECIPES[r]), 500); }
  return {
    kind, S,
    get fuel() { return st.fuel; }, get busy() { return st.busy; },
    left() { return st.busy ? Math.max(0, (st.busy.end - Date.now()) / 1000) : 0; },
    addFuel(k) { const v = FUEL[k]; if (!v || st.fuel >= 30) return 0; st.fuel += v; save(); return v; },
    start(raw) { if (st.busy || !RECIPES[raw] || st.fuel < S.fuel) return false; st.fuel -= S.fuel; st.busy = { raw, end: Date.now() + S.time * 1000 }; save(); return true; },
    update() { if (st.busy && Date.now() >= st.busy.end) { const r = st.busy.raw; st.busy = null; save(); onDone(RECIPES[r]); } },
  };
}

// 室外的小烤炉：一圈石头 + 铁架子 + 烧起来时有火和烟
export function createGrill({ scene, plot, side }) {
  const sp = grillSpot(plot, side), [x, z] = plotToWorld(plot, sp.x, sp.z);
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = plot.rot; scene.add(g);
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .8, ...o });
  const SPH = new THREE.SphereGeometry(1, 10, 8);
  for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, s = new THREE.Mesh(SPH, M(0x8d8a83)); s.scale.set(.28, .22, .3); s.position.set(Math.cos(a) * .7, .15, Math.sin(a) * .7); s.castShadow = true; g.add(s); }
  // 柴火
  for (let i = 0; i < 4; i++) { const l = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, .9, 6), M(0x6b4423)); l.rotation.set(Math.PI / 2, i * .8, 0); l.position.y = .12; g.add(l); }
  // 铁架子 + 一口小锅
  [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .8, 6), M(0x333333, { metalness: .6 })); p.position.set(s * .65, .4, 0); g.add(p); });
  const rack = new THREE.Mesh(new THREE.BoxGeometry(1.3, .03, .7), M(0x444444, { metalness: .6, roughness: .4 })); rack.position.y = .62; g.add(rack);
  for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(.02, .02, .7), M(0x222222)); b.position.set(-.6 + i * .2, .64, 0); g.add(b); }
  // 火（烧的时候才看得见）
  const fire = new THREE.Group(); fire.visible = false; g.add(fire);
  [[0, 0, .3, .55, 0xff7a1a], [.15, .05, .2, .4, 0xffb030], [-.12, -.05, .18, .38, 0xffd23f]].forEach(([fx, fz, r, h, c]) => { const f = new THREE.Mesh(new THREE.ConeGeometry(r, h, 8), new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: .9 })); f.position.set(fx, .25 + h / 2, fz); fire.add(f); });
  const light = new THREE.PointLight(0xff9a4a, 0, 7, 1.4); light.position.y = .8; g.add(light);
  // 正在烤的东西（一块小肉 / 小鱼）
  const food = new THREE.Mesh(SPH, M(0xc0583a)); food.scale.set(.18, .07, .12); food.position.y = .7; food.visible = false; g.add(food);
  const smoke = []; for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xdddddd, transparent: true, opacity: .4 })); s.visible = false; s.userData.k = i; g.add(s); smoke.push(s); }
  // 木牌
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const x2 = c.getContext('2d'); x2.fillStyle = '#f2e1bd'; x2.fillRect(0, 0, 256, 96); x2.fillStyle = '#5a3a1a'; x2.font = 'bold 42px sans-serif'; x2.textAlign = 'center'; x2.fillText('🔥 烤炉', 128, 62);
  const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
  const post = new THREE.Mesh(new THREE.BoxGeometry(.08, 1.1, .08), M(0x9a6a3c)); post.position.set(1.3, .55, .4); g.add(post);
  const board = new THREE.Mesh(new THREE.BoxGeometry(.9, .34, .04), new THREE.MeshStandardMaterial({ map: tx })); board.position.set(1.3, 1.1, .43); g.add(board);
  let t = 0;
  return {
    pos: { x, z },
    near: p => Math.hypot(p.x - x, p.z - z) < 1.9,
    collide(p, pr = .45) { const dx = p.x - x, dz = p.z - z, d = Math.hypot(dx, dz), m = .9 + pr; if (d < m && d > 1e-4 && p.y < .8) { p.x = x + dx / d * m; p.z = z + dz / d * m; } },
    update(dt, busy) {
      t += dt; fire.visible = food.visible = !!busy; light.intensity = busy ? 2.4 + Math.sin(t * 13) * .4 : 0;
      fire.children.forEach((f, i) => f.scale.set(1 + Math.sin(t * 11 + i) * .15, 1 + Math.sin(t * 8 + i * 2) * .25, 1));
      smoke.forEach(s => { s.visible = !!busy; const k = (t * .5 + s.userData.k / 4) % 1; s.position.set(Math.sin(k * 6) * .1, .9 + k * 2, 0); s.scale.setScalar(.15 + k * .3); s.material.opacity = .45 * (1 - k); });
    },
  };
}
