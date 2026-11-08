// ===== 菜鸟家园 · 鱼塘（鱼、虾、螃蟹） =====
// 用户说：池塘里的动物也要做；动物的家都有自己的场地，买了放进背包、走到场地上才能盖
// 样子按设计画布《菜鸟家园 · 动物和它们的家》：1 级小水塘 → 2 级鱼塘（有石头，螃蟹才能住）→ 3 级荷花鱼塘（荷花、小木桥、亭子，偶尔有金色的鱼）
// 数字是 Claude 定的（现实里的秒），以后可以改
import * as THREE from 'three';
import { plotToWorld, worldToPlot } from './garden.js';

export const POND = {
  1: { name: '小水塘', cap: 3, R: 3, up: 0 },
  2: { name: '鱼塘', cap: 8, R: 4, up: 100 },
  3: { name: '荷花鱼塘', cap: 15, R: 5, up: 240 },
};
export const CRITTER = {
  fish: { name: '鱼', baby: '鱼苗', grow: 25, item: 'fish', minLv: 1 },
  shrimp: { name: '虾', baby: '小虾', grow: 20, item: 'shrimp', minLv: 1 },
  crab: { name: '螃蟹', baby: '小螃蟹', grow: 30, item: 'crab', minLv: 2 },   // 二级鱼塘有石头，螃蟹才能住
};
const HUNGER = 100 / 2400, MEAL = 50, FOOD_MAX = 20;
export function pondSpot(plot, side) { const h = plot.size / 2; return { x: -side * 12, z: Math.min(14, h - 18) }; }
export function inPond(plot, side, x, z, m = 0) { const s = pondSpot(plot, side), [lx, lz] = worldToPlot(plot, x, z); return Math.hypot(lx - s.x, lz - s.z) < 6.6 + m; }

const SPH = new THREE.SphereGeometry(1, 14, 10);
const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .6, ...o });
function part(p, geo, mat, pos, s, r) { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if (s) m.scale.set(...s); if (r) m.rotation.set(...r); p.add(m); return m; }
// 小鱼 / 小虾 / 小螃蟹
function buildCritter(kind, baby, gold) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  if (kind === 'fish') {
    const c = gold ? M(0xffd23f, { metalness: .6, roughness: .2, emissive: 0x5a4000, emissiveIntensity: .4 }) : M(0xff8a2a);
    part(body, SPH, c, [0, 0, 0], [.09, .11, .22]);
    const tail = part(body, new THREE.ConeGeometry(.1, .16, 4), c, [0, 0, -.25], null, [-Math.PI / 2, 0, 0]); tail.scale.set(1, 1, .3);
    part(body, SPH, M(0x111111), [.06, .03, .14], [.022, .022, .022]); part(body, SPH, M(0x111111), [-.06, .03, .14], [.022, .022, .022]);
    g.userData.tail = tail;
  } else if (kind === 'shrimp') {
    const c = M(0xff9a9a);
    for (let i = 0; i < 5; i++) part(body, SPH, c, [0, Math.sin(i * .5) * .05, .1 - i * .06], [.05 - i * .006, .045 - i * .005, .05]);
    part(body, new THREE.ConeGeometry(.045, .08, 4), c, [0, .04, -.22], null, [-1.2, 0, 0]);
    part(body, SPH, M(0x111111), [.03, .04, .14], [.012, .012, .012]); part(body, SPH, M(0x111111), [-.03, .04, .14], [.012, .012, .012]);
  } else {
    const c = M(0xe8513e);
    part(body, SPH, c, [0, 0, 0], [.16, .07, .12]);
    [-1, 1].forEach(s => { part(body, SPH, c, [s * .2, .02, .12], [.07, .05, .06]); for (let k = 0; k < 3; k++) part(body, new THREE.CylinderGeometry(.012, .012, .14, 5), c, [s * .17, -.03, -.05 + k * .06], null, [0, 0, s * 1.1]); });
    [-1, 1].forEach(s => { part(body, new THREE.CylinderGeometry(.01, .01, .06, 5), c, [s * .05, .08, .1]); part(body, SPH, M(0x111111), [s * .05, .11, .1], [.02, .02, .02]); });
  }
  g.scale.setScalar(baby ? .55 : 1.25);
  return g;
}

function buildPondModel(lv) {
  const K = POND[lv], g = new THREE.Group(), R = K.R;
  const water = new THREE.Mesh(new THREE.CircleGeometry(R, 40), M(0x4fa8d8, { roughness: .1, metalness: .15, transparent: true, opacity: .9 })); water.rotation.x = -Math.PI / 2; water.position.y = .1; water.renderOrder = 2; g.add(water);
  const bottom = new THREE.Mesh(new THREE.CircleGeometry(R, 40), M(0x2f6f8a)); bottom.rotation.x = -Math.PI / 2; bottom.position.y = -.25; g.add(bottom);
  // 一圈石头
  const stoneM = M(0x9a9a92, { roughness: .9 });
  const n = Math.round(R * 8); for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, s = .22 + Math.random() * .15; const st = part(g, SPH, stoneM, [Math.cos(a) * (R + .15), .05, Math.sin(a) * (R + .15)], [s, s * .55, s * 1.2], [0, a, 0]); st.castShadow = true; }
  // 二级：水里的大石头（螃蟹躲在这里）+ 芦苇
  if (lv >= 2) { [[.55, .3], [-.5, -.45]].forEach(([x, z]) => part(g, SPH, M(0x8a8a82), [x * R, .05, z * R], [.45, .28, .38]));
    for (let i = 0; i < 6; i++) part(g, new THREE.CylinderGeometry(.025, .025, .9, 5), M(0x4f8f3a), [R * .75 + (i % 3) * .12, .45, -R * .55 + Math.floor(i / 3) * .15]); }
  // 三级：荷叶荷花、小木桥、红顶亭子
  if (lv === 3) {
    [[-.4, .2], [-.2, .5], [.1, -.3], [.35, .55], [-.55, -.2]].forEach(([x, z]) => { const leaf = new THREE.Mesh(new THREE.CircleGeometry(.35, 16), M(0x4f9a3a)); leaf.rotation.x = -Math.PI / 2; leaf.position.set(x * R, .13, z * R); g.add(leaf);
      part(g, SPH, M(0xffb3d1), [x * R + .05, .2, z * R], [.12, .1, .12]); });
    const bridge = new THREE.Group(); bridge.position.set(0, 0, 0); g.add(bridge);
    for (let i = 0; i < 9; i++) { const t = i / 8 - .5; part(bridge, new THREE.BoxGeometry(.25, .06, 1.1), M(0x9a6a3c), [t * R * 1.4, .35 + Math.cos(t * Math.PI) * .4, -R * .25]); }
    const pav = new THREE.Group(); pav.position.set(-R - 1.6, 0, -R * .2); g.add(pav);
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([i, j]) => part(pav, new THREE.CylinderGeometry(.08, .08, 2.2, 8), M(0xc23626), [i * .8, 1.1, j * .8]));
    part(pav, new THREE.ConeGeometry(1.5, .9, 4), M(0x5a2a18), [0, 2.6, 0], null, [0, Math.PI / 4, 0]);
  }
  // 喂食的小木台 + 小木牌
  const dock = part(g, new THREE.BoxGeometry(1.2, .1, .8), M(0x9a6a3c), [0, .15, R + .6]); dock.castShadow = true;
  return { group: g, water, R, dock: { x: 0, z: R + .6 } };
}

export function createPond({ scene, plot, side, isNight = () => false, notify = () => {} }) {
  const KEY = 'xcn_pond_v1';
  let st = null; try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  st ||= { built: false, lv: 1, food: 0, list: [], t: Date.now() };
  const save = () => { st.t = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const spot = pondSpot(plot, side);
  const holder = new THREE.Group(); holder.position.set(plot.x, 0, plot.z); holder.rotation.y = plot.rot; scene.add(holder);
  const base = new THREE.Group(); base.position.set(spot.x, 0, spot.z); holder.add(base);
  const toLocal = (x, z) => { const [a, b] = worldToPlot(plot, x, z); return [a - spot.x, b - spot.z]; };
  const toWorld = (lx, lz) => plotToWorld(plot, spot.x + lx, spot.z + lz);
  let P = null, sign = null;
  function build() {
    if (P) base.remove(P.group); if (sign) base.remove(sign); P = null; sign = null;
    if (!st.built) {   // 还没盖：画一个圆圈 + 小木牌
      sign = new THREE.Group(); base.add(sign);
      const om = M(0xc9a66b); for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const d = part(sign, new THREE.BoxGeometry(.7, .04, .12), om, [Math.cos(a) * 3.2, .02, Math.sin(a) * 3.2], null, [0, -a + Math.PI / 2, 0]); }
      part(sign, new THREE.BoxGeometry(.1, 1.2, .1), M(0x9a6a3c), [0, .6, 3.6]);
      const c = document.createElement('canvas'); c.width = 320; c.height = 120; const x = c.getContext('2d'); x.fillStyle = '#f2e1bd'; x.fillRect(0, 0, 320, 120); x.fillStyle = '#5a3a1a'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.fillText('🐟 这里挖鱼塘', 160, 50); x.font = '26px sans-serif'; x.fillText('去动物小铺买', 160, 92);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; part(sign, new THREE.BoxGeometry(1.4, .52, .05), new THREE.MeshStandardMaterial({ map: t }), [0, 1.2, 3.66]);
      return; }
    P = buildPondModel(st.lv); base.add(P.group);
  }
  // 离线：饿、吃鱼食
  function tick(dt) { st.list.forEach(c => { c.full = Math.max(0, c.full - dt * HUNGER); if (c.full < 50 && st.food > 0) { st.food--; c.full = Math.min(100, c.full + MEAL); } if (c.full > 10) c.age = (c.age || 0) + dt; }); }
  if (st.built) { let left = Math.max(0, (Date.now() - st.t) / 1000); while (left > 0) { const s = Math.min(60, left); left -= s; tick(s); } }
  const grown = c => (c.age || 0) >= CRITTER[c.kind].grow * 60;
  const swim = [];
  function sync() {
    swim.forEach(s => base.remove(s.m)); swim.length = 0;
    if (!P) return;
    st.list.forEach(c => { const m = buildCritter(c.kind, !grown(c), c.gold); base.add(m); swim.push({ c, m, a: Math.random() * 6.28, r: .6 + Math.random() * (P.R - 1.2), sp: (c.kind === 'crab' ? .15 : .35) * (Math.random() > .5 ? 1 : -1), ph: Math.random() * 10, baby: !grown(c) }); });
  }
  build(); sync();
  let t0 = 0, saveT = 0, syncT = 0;
  function update(dt) {
    if (!P) return;
    t0 += dt; tick(dt);
    if ((syncT += dt) > 5) { syncT = 0; if (swim.some(s => s.baby && grown(s.c))) { sync(); notify('🐟 鱼塘里有长大的了，用渔网捞'); } }
    P.water.material.opacity = .88 + Math.sin(t0 * 1.5) * .04;
    swim.forEach(s => {
      s.a += s.sp * dt; const r = s.r + Math.sin(t0 * .5 + s.ph) * .3;
      const x = Math.cos(s.a) * r, z = Math.sin(s.a) * r;
      if (s.c.kind === 'crab') { s.m.position.set(x, .04, z); s.m.rotation.y = -s.a; }   // 螃蟹在水底横着走
      else { s.m.position.set(x, s.c.kind === 'fish' ? .05 + Math.sin(t0 * 2 + s.ph) * .02 : .04, z); s.m.rotation.y = -s.a + (s.sp > 0 ? 0 : Math.PI); if (s.m.userData.tail) s.m.userData.tail.rotation.y = Math.sin(t0 * 10 + s.ph) * .5; }
    });
    for (let k = drops.length - 1; k >= 0; k--) { const d = drops[k]; d.t += dt; d.g.children.forEach(f => { if (f.userData.v) { f.userData.v.y -= 9 * dt; f.position.addScaledVector(f.userData.v, dt); } });
      d.g.userData.ring.scale.setScalar(1 + d.t * 4); d.g.userData.ring.material.opacity = Math.max(0, .8 - d.t); d.mat.opacity = Math.max(0, 1 - d.t / 1.2); if (d.t > 1.2) { base.remove(d.g); drops.splice(k, 1); } }
    if ((saveT += dt) > 5) { saveT = 0; save(); }
  }
  // 用户说：水有一定深度，人能走进去（会沉下去一截）。1 级齐腰，越高级越深
  const DEPTH = { 1: .55, 2: .75, 3: .95 };
  function collide() {}
  function depthAt(p) { if (!P) return 0; const [lx, lz] = toLocal(p.x, p.z), d = Math.hypot(lx, lz); if (d > P.R - .2) return 0; return DEPTH[st.lv] * Math.min(1, (P.R - .2 - d) / .8 + .35); }
  // 掉进水里溅起水花
  const drops = [];
  function splash(x, z) { const [lx, lz] = toLocal(x, z), g = new THREE.Group(); g.position.set(lx, .15, lz); base.add(g); const mat = new THREE.MeshStandardMaterial({ color: 0xbfe8ff, transparent: true, roughness: .1 });
    for (let i = 0; i < 26; i++) { const f = new THREE.Mesh(SPH, mat); f.scale.setScalar(.05 + Math.random() * .06); f.userData.v = new THREE.Vector3((Math.random() - .5) * 2.4, 1.5 + Math.random() * 2, (Math.random() - .5) * 2.4); g.add(f); }
    const ring = new THREE.Mesh(new THREE.RingGeometry(.3, .4, 24), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8, side: THREE.DoubleSide })); ring.rotation.x = -Math.PI / 2; ring.position.y = -.03; g.add(ring); g.userData.ring = ring;
    drops.push({ g, mat, t: 0 }); }
  const dist = p => { const [lx, lz] = toLocal(p.x, p.z); return Math.hypot(lx, lz); };
  return {
    update, collide, depthAt, splash,
    get built() { return st.built; }, get lv() { return st.lv; }, get name() { return POND[st.lv].name; }, get cap() { return POND[st.lv].cap; }, get count() { return st.list.length; }, get food() { return st.food; }, FOOD_MAX,
    get grownCount() { return st.list.filter(grown).length; },
    nearSign(p) { return !st.built && dist(p) < 5.2; },
    nearEdge(p) { return st.built && P && dist(p) < P.R + 1.8; },
    build() { if (st.built) return false; st.built = true; st.lv = 1; st.food = 4; save(); build(); sync(); return true; },
    demolish() { if (!st.built) return 0; const n = st.list.length; st.built = false; st.list = []; st.food = 0; st.lv = 1; save(); build(); sync(); return n; },
    canAdd(kind) { return st.built && st.list.length < POND[st.lv].cap && st.lv >= CRITTER[kind].minLv; },
    add(kind, adult) { if (!this.canAdd(kind)) return false; st.list.push({ kind, full: 80, age: adult ? CRITTER[kind].grow * 60 : 0, gold: kind === 'fish' && st.lv === 3 && Math.random() < .08 }); save(); sync(); return true; },
    addFood() { if (st.food >= FOOD_MAX) return false; st.food++; save(); return true; },
    // 用渔网捞一个长大的
    // 鱼竿用：长大的各有几只；钓到某一种（鱼可能是金色的）；浮漂落在水里的哪儿
    grownKinds() { const o = {}; st.list.filter(grown).forEach(c => o[c.kind] = (o[c.kind] || 0) + 1); return o; },
    catchKind(kind) { const i = st.list.findIndex(c => c.kind === kind && grown(c)); if (i < 0) return null; const c = st.list.splice(i, 1)[0]; save(); sync(); return c.gold ? 'goldfish' : CRITTER[c.kind].item; },
    bobberSpot(p) { const [lx, lz] = toLocal(p.x, p.z), d = Math.hypot(lx, lz) || 1, r = Math.max(.6, Math.min(P.R - .6, d - 2.3)); return toWorld(lx / d * r, lz / d * r); },
    get inside() { return P ? P.R : 0; },
    catchOne() { const i = st.list.findIndex(grown); if (i < 0) return null; const c = st.list.splice(i, 1)[0]; save(); sync(); return c.gold ? 'goldfish' : CRITTER[c.kind].item; },
    next() { const l = st.lv + 1; return POND[l] ? { lv: l, ...POND[l] } : null; },
    upgrade() { if (!POND[st.lv + 1]) return false; st.lv++; save(); build(); sync(); return true; },
    debug: { setLevel(l) { st.built = true; st.lv = l; while (st.list.length > POND[l].cap) st.list.pop(); save(); build(); sync(); }, growAll() { st.list.forEach(c => c.age = CRITTER[c.kind].grow * 60); save(); sync(); } },
    entrance: () => toWorld(0, (P ? P.R : 3) + 1.6),
  };
}
