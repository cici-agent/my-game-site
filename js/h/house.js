// ===== 菜鸟家园 · 房子：五个等级（最低级、低级、中级、高级、最高级） =====
// 最低级（用户定的）：木头小棚子；稻草床；草绳拴的门（不太安全）；小柜子；放蜡烛的地方（蜡烛会烧完，要再买）
// 用户说：房子都要做得人能舒服地走进去；中级是电灯泡 + 开关；高级、最高级是更高级的灯 + 开关
// 其他等级的样子按设计图《菜鸟家园 · 五个等级的房子》（Claude 的建议，等用户改）
import * as THREE from 'three';
import { createBag, plotToWorld, worldToPlot } from './garden.js';
import { BED_RATE } from './stamina.js';

export const HOUSE_NAMES = { 1: '小木棚', 2: '小木屋', 3: '砖瓦小屋', 4: '两层小楼', 5: '花园小别墅' };
const CANDLE_LIFE = 30 * 60, OIL_LIFE = 2 * 3600;   // 现实里的秒：蜡烛只烧半小时（用户定的），油灯 2 小时（不跟着管理员加速走）
// 电费（用户说：用电灯的房子要交电费，但要特别低）：每盏电灯开着，每个现实小时 0.5 菜币；攒够 1 菜币自动扣
export const POWER_RATE = .5;
const CAB_CAP = { 1: 9, 2: 18, 3: 27, 4: 45, 5: 72 };

// 房子在空地里的中心（空地自己的坐标，门朝 +z，也就是朝路）
export function houseSpot() { return { x: 0, z: -3 }; }
// 最大的房子（最高级 + 温室 + 塔楼）占的范围：种花草时避开
export function inHouse(plot, x, z, m = 0) {
  const [lx, lz] = worldToPlot(plot, x, z), c = houseSpot();
  return Math.abs(lx - c.x) < 13 + m && lz - c.z > -8 - m && lz - c.z < 7 + m;
}

// ---------- 贴图 ----------
function tex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; return t;
}
const R = Math.random;
const TEX = {
  plank: tex(64, 256, (g, w, h) => { g.fillStyle = '#a7713c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(${70 + R() * 40},${40 + R() * 20},15,${.15 + R() * .2})`; g.lineWidth = 1 + R() * 2; const x = R() * w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, h * .3, x - 6, h * .6, x + 3, h); g.stroke(); }
    for (let i = 0; i < 3; i++) { g.fillStyle = 'rgba(60,30,10,.45)'; g.beginPath(); g.ellipse(10 + R() * 44, R() * h, 4, 7, 0, 0, Math.PI * 2); g.fill(); } }),
  straw: tex(128, 128, (g, w, h) => { g.fillStyle = '#d8b25a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { const x = R() * w, y = R() * h; g.strokeStyle = ['#f0d17a', '#b88a35', '#e6c066', '#9c7428'][i % 4]; g.lineWidth = 1 + R() * 1.5; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - .5) * 6, y + 10 + R() * 26); g.stroke(); } }),
  dirt: tex(128, 128, (g, w, h) => { g.fillStyle = '#8a6a45'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${60 + R() * 60},${40 + R() * 40},20,.35)`; g.fillRect(R() * w, R() * h, 2, 2); }
    for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(230,200,110,.6)'; const x = R() * w, y = R() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6, y + 2); g.stroke(); } }),
  // 圆木墙：一根根横着的木头
  log: tex(256, 256, (g, w, h) => { const n = 8, lh = h / n;
    for (let i = 0; i < n; i++) { const gr = g.createLinearGradient(0, i * lh, 0, (i + 1) * lh); gr.addColorStop(0, '#6e4320'); gr.addColorStop(.25, '#b47a42'); gr.addColorStop(.6, '#a06630'); gr.addColorStop(1, '#5a3417'); g.fillStyle = gr; g.fillRect(0, i * lh, w, lh);
      for (let k = 0; k < 6; k++) { g.strokeStyle = 'rgba(60,30,10,.25)'; g.beginPath(); const y = i * lh + 4 + R() * (lh - 8); g.moveTo(0, y); g.lineTo(w, y + (R() - .5) * 4); g.stroke(); } } }),
  brick: tex(256, 256, (g, w, h) => { g.fillStyle = '#d9cbb6'; g.fillRect(0, 0, w, h); const bw = 64, bh = 28;
    for (let r = 0; r < h / bh + 1; r++) for (let c = -1; c < w / bw + 1; c++) { const x = c * bw + (r % 2) * bw / 2, y = r * bh; const v = 170 + R() * 40;
      g.fillStyle = `rgb(${v},${70 + R() * 25},${50 + R() * 20})`; g.fillRect(x + 3, y + 3, bw - 6, bh - 6); } }),
  plaster: tex(128, 128, (g, w, h) => { g.fillStyle = '#f3e6cc'; g.fillRect(0, 0, w, h); for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${150 + R() * 60},${130 + R() * 50},${100 + R() * 40},.08)`; g.fillRect(R() * w, R() * h, 3, 3); } }),
  white: tex(128, 128, (g, w, h) => { g.fillStyle = '#fbf8f1'; g.fillRect(0, 0, w, h); for (let i = 0; i < 700; i++) { g.fillStyle = 'rgba(180,170,150,.07)'; g.fillRect(R() * w, R() * h, 3, 3); } }),
  stone: tex(256, 128, (g, w, h) => { g.fillStyle = '#8d8a83'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) { const v = 120 + R() * 60; g.fillStyle = `rgb(${v},${v - 4},${v - 10})`; g.beginPath(); g.ellipse(R() * w, R() * h, 18 + R() * 16, 12 + R() * 8, R(), 0, Math.PI * 2); g.fill(); g.strokeStyle = 'rgba(40,40,40,.35)'; g.stroke(); } }),
  floor: tex(256, 256, (g, w, h) => { const n = 8, bh = h / n;
    for (let i = 0; i < n; i++) { const v = 150 + R() * 40; g.fillStyle = `rgb(${v},${v * .62},${v * .35})`; g.fillRect(0, i * bh, w, bh - 2); g.fillStyle = 'rgba(60,30,10,.4)'; g.fillRect(R() * w, i * bh, 2, bh); } }),
  tile: tex(128, 128, (g, w, h) => { for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) { g.fillStyle = (r + c) % 2 ? '#e9e2d4' : '#cfc3ad'; g.fillRect(c * 32, r * 32, 32, 32); } }),
  shingle: tex(256, 256, (g, w, h) => { g.fillStyle = '#6b3d1c'; g.fillRect(0, 0, w, h); const sw = 40, sh = 32;
    for (let r = 0; r < h / sh + 1; r++) for (let c = -1; c < w / sw + 1; c++) { const v = 90 + R() * 40; g.fillStyle = `rgb(${v + 30},${v - 10},${v - 40})`; g.fillRect(c * sw + (r % 2) * sw / 2 + 1, r * sh, sw - 3, sh - 3); } }),
  rooftile: tex(256, 256, (g, w, h) => { g.fillStyle = '#8e2b18'; g.fillRect(0, 0, w, h);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const gr = g.createLinearGradient(c * 32, 0, c * 32 + 32, 0); gr.addColorStop(0, '#a83420'); gr.addColorStop(.5, '#d65a3c'); gr.addColorStop(1, '#9a2e1a'); g.fillStyle = gr; g.beginPath(); g.ellipse(c * 32 + 16, r * 32 + 18, 15, 16, 0, 0, Math.PI * 2); g.fill(); } }),
  slate: tex(256, 256, (g, w, h) => { g.fillStyle = '#3c5068'; g.fillRect(0, 0, w, h); const sw = 32, sh = 24;
    for (let r = 0; r < h / sh + 1; r++) for (let c = -1; c < w / sw + 1; c++) { const v = 70 + R() * 30; g.fillStyle = `rgb(${v},${v + 18},${v + 38})`; g.fillRect(c * sw + (r % 2) * sw / 2 + 1, r * sh, sw - 2, sh - 2); } }),
  purple: tex(256, 256, (g, w, h) => { g.fillStyle = '#3e2a6b'; g.fillRect(0, 0, w, h); const sw = 32, sh = 24;
    for (let r = 0; r < h / sh + 1; r++) for (let c = -1; c < w / sw + 1; c++) { const v = R() * 30; g.fillStyle = `rgb(${95 + v},${70 + v},${150 + v})`; g.beginPath(); g.ellipse(c * sw + (r % 2) * sw / 2 + sw / 2, r * sh + sh / 2, sw / 2 - 1, sh / 2, 0, 0, Math.PI); g.fill(); } }),
};
const MAT = {};
const M = o => new THREE.MeshStandardMaterial({ roughness: .9, ...o });
const mt = (name, o = {}) => (MAT[name + JSON.stringify(o)] ||= M({ map: TEX[name], ...o }));

// 方块，贴图按真实尺寸铺（tile 米铺一张），不会被拉长
function tbox(w, h, d, mat, tile = 1.5) {
  const g = new THREE.BoxGeometry(w, h, d), uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / tile, uv.getY(i) * dims[f][1] / tile); }
  const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; return m;
}
const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 14), SPH = new THREE.SphereGeometry(1, 14, 10);

// ---------- 五个等级的房子（尺寸单位：米；W、D 是半宽、半深） ----------
const LEVELS = {
  1: { W: 3.5, D: 3.05, H: 3.1, wall: 'plankwall', roof: 'thatch', rise: 1.8, floorTex: 'dirt', door: { w: 1.35, h: 2.6, x: 0, style: 'rope' },
       windows: [{ side: 'right', t: .4, y0: 1.35, y1: 2.2, w: 1.2, shutter: true }] },
  2: { W: 4.4, D: 3.8, H: 3.2, wall: 'log', roof: 'shingle', rise: 2.1, floorTex: 'floor', door: { w: 1.4, h: 2.6, x: 0, style: 'latch' }, chimney: [3, -2.2],
       windows: [{ side: 'front', t: -2.6, y0: 1.1, y1: 2.2, w: 1.3 }, { side: 'front', t: 2.6, y0: 1.1, y1: 2.2, w: 1.3 }, { side: 'right', t: .5, y0: 1.1, y1: 2.2, w: 1.3 }] },
  3: { W: 5.6, D: 4.4, H: 3.3, wall: 'brick', roof: 'rooftile', rise: 2.4, floorTex: 'floor', door: { w: 1.5, h: 2.7, x: .9, style: 'arch' }, chimney: [3.6, -2.6], smoke: true, flowerBox: true,
       inner: [{ x: -1.2, z0: -4.4, z1: 4.4, gap: [-.2, 1.2] }],
       windows: [{ side: 'front', t: -3.4, y0: 1.1, y1: 2.3, w: 1.5 }, { side: 'front', t: 3.6, y0: 1.1, y1: 2.3, w: 1.5 }, { side: 'left', t: 0, y0: 1.1, y1: 2.3, w: 1.5 }, { side: 'right', t: .6, y0: 1.1, y1: 2.3, w: 1.4 }] },
  4: { W: 6.4, D: 4.8, H: 3.5, H2: 3.2, wall: 'plaster', roof: 'slate', rise: 2.5, floorTex: 'floor', floor2Tex: 'floor', door: { w: 2.1, h: 2.8, x: 0, style: 'double' }, chimney: [-4.6, -3], porch: true, balcony: true,
       stairs: { x: 5.3, z0: 3.6, z1: -.8, w: 1.4 },
       windows: [{ side: 'front', t: -4, y0: 1.1, y1: 2.4, w: 1.4 }, { side: 'front', t: 4, y0: 1.1, y1: 2.4, w: 1.4 }, { side: 'left', t: 0, y0: 1.1, y1: 2.4, w: 1.6 },
                 { side: 'front', t: -4, y0: 4.6, y1: 5.9, w: 1.4, up: true }, { side: 'front', t: 4, y0: 4.6, y1: 5.9, w: 1.4, up: true }, { side: 'right', t: 0, y0: 4.6, y1: 5.9, w: 1.6, up: true }] },
  5: { W: 7.2, D: 5.2, H: 3.7, H2: 3.4, wall: 'white', roof: 'purple', rise: 2.7, floorTex: 'tile', floor2Tex: 'floor', door: { w: 2.4, h: 3.1, x: 0, style: 'grand' }, chimney: [4.8, -3.4], tower: true, greenhouse: true, lamps: true, base: true,
       stairs: { x: 6.1, z0: 4, z1: -.6, w: 1.4 },
       windows: [{ side: 'front', t: -4.6, y0: 1.1, y1: 2.6, w: 1.5 }, { side: 'front', t: 4.6, y0: 1.1, y1: 2.6, w: 1.5 }, { side: 'right', t: -1.5, y0: 1.1, y1: 2.6, w: 1.5 },
                 { side: 'front', t: -4.6, y0: 4.9, y1: 6.3, w: 1.5, up: true }, { side: 'front', t: -1.6, y0: 4.9, y1: 6.3, w: 1.3, up: true }, { side: 'front', t: 1.6, y0: 4.9, y1: 6.3, w: 1.3, up: true }, { side: 'front', t: 4.6, y0: 4.9, y1: 6.3, w: 1.5, up: true }, { side: 'right', t: 0, y0: 4.9, y1: 6.3, w: 1.5, up: true }] },
};

export function createHouse({ scene, plot, side = 1, rnd = Math.random, save = true, speed = () => 1, darkness = () => 0, wallet = null, notify = () => {} }) {
  const spot = houseSpot();
  const group = new THREE.Group(); group.position.set(plot.x, 0, plot.z); group.rotation.y = plot.rot; scene.add(group);
  const toWorld = (lx, lz) => plotToWorld(plot, spot.x + lx, spot.z + lz);
  const toLocal = (x, z) => { const [a, b] = worldToPlot(plot, x, z); return [a - spot.x, b - spot.z]; };

  // ---------- 存档 ----------
  const KEY = 'xcn_house_v1';
  let st = null;
  try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (!st) st = { level: 1, cabinet: [{ key: 'candle', n: 3 }], candles: {}, lights: {}, doors: {}, safe: [], t: Date.now() };
  st.candles = Array.isArray(st.candles) ? { c0: st.candles[0], c1: st.candles[1] } : (st.candles || {});
  st.lights ||= {}; st.doors ||= {}; st.safe ||= [];
  if (st.door !== undefined) { st.doors.front = !!st.door; delete st.door; }
  const cabinet = createBag(CAB_CAP[st.level] || 9, 50);
  cabinet.slots = (st.cabinet || []).slice(0, cabinet.cap).map(x => x || null);
  const safe = createBag(12, 99);
  safe.slots = st.safe.slice(0, 12).map(x => x || null);
  { const away = Math.max(0, (Date.now() - (st.t || Date.now())) / 1000); for (const k in st.candles) st.candles[k] = Math.max(0, st.candles[k] - away); }
  function persist() { if (!save) return; st.cabinet = cabinet.slots; st.safe = safe.slots; st.t = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  // 当前这一级的东西
  let L, root, roof, upper, things, solids, walls, inner, lights, doors, stairs, floorH;

  function build() {
    if (root) { group.remove(root); root.traverse(o => { if (o.geometry && o.geometry !== BOX && o.geometry !== CYL && o.geometry !== SPH) o.geometry.dispose(); }); }
    L = LEVELS[st.level]; root = new THREE.Group(); root.position.set(spot.x, 0, spot.z); group.add(root);
    roof = new THREE.Group(); root.add(roof); upper = new THREE.Group(); root.add(upper);
    things = []; solids = []; walls = []; inner = []; lights = []; doors = []; stairs = null; floorH = L.H2 ? L.H + .2 : 0;
    cabinet.cap = CAB_CAP[st.level];
    const { W, D, H } = L;
    const add = (geo, mat, p, s, r, parent = root) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); if (s) m.scale.set(...s); if (r) m.rotation.set(...r); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
    const put = (mesh, p, r, parent = root) => { mesh.position.set(...p); if (r) mesh.rotation.set(...r); parent.add(mesh); return mesh; };
    const wallMat = { plankwall: mt('plank'), log: mt('log'), brick: mt('brick'), plaster: mt('plaster'), white: mt('white') }[L.wall];
    const tileOf = { plankwall: 1, log: 2.4, brick: 1.6, plaster: 2, white: 2 }[L.wall];
    const trim = M({ color: L.wall === 'white' ? 0xd8c9a8 : L.wall === 'plaster' ? 0x8a6a46 : 0x6b4423 });

    // 地面
    const fl = tbox(W * 2 - .1, .08, D * 2 - .1, mt(L.floorTex), L.floorTex === 'tile' ? 1.2 : 2.5); put(fl, [0, .04, 0]); fl.castShadow = false;
    if (L.base) { const b = tbox(W * 2 + .4, .5, D * 2 + .4, mt('stone'), 1.6); put(b, [0, -.05, 0]); fl.position.y = .22; }
    const fy = L.base ? .2 : 0;   // 地面高度（最高级有石头台基）

    // ---------- 墙 ----------
    // 一面墙：从 a 到 b，holes：[[沿墙位置 t0, t1, 高度 y0, y1]]；up=true 是二楼的墙
    function wall(ax, az, bx, bz, holes, y0 = 0, h = H, parent = root) {
      const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax);
      if (L.wall === 'plankwall') {   // 竖木板（有些板之间有缝）
        const PW = .36;
        for (let t = PW / 2; t < len; t += PW + (rnd() < .18 ? .03 : .005)) {
          const x = ax + (bx - ax) * t / len, z = az + (bz - az) * t / len, top = h + (rnd() - .5) * .15;
          const hole = holes.find(([t0, t1]) => t > t0 && t < t1), segs = hole ? [[0, hole[2]], [hole[3], top]] : [[0, top]];
          segs.forEach(([s0, s1]) => { if (s1 - s0 < .05) return; const pl = tbox(PW - .01, s1 - s0, .09, [mt('plank'), mt('plank', { color: 0xd9c0a0 }), mt('plank', { color: 0xc4a07a })][Math.floor(rnd() * 3)], 3);
            put(pl, [x, y0 + (s0 + s1) / 2, z], [0, -ang, (rnd() - .5) * .025], parent); });
        }
        [.45, 2.3].forEach(y => { const b = tbox(len, .13, .05, mt('plank', { color: 0xc4a07a }), 3); put(b, [(ax + bx) / 2, y0 + y, (az + bz) / 2], [0, -ang, 0], parent).translateZ(.07); });
      } else {   // 实心墙：按门窗切成一块块
        const cuts = [0, len, ...holes.flatMap(h2 => [h2[0], h2[1]])].filter(c => c >= 0 && c <= len).sort((a, b) => a - b);
        for (let i = 0; i < cuts.length - 1; i++) {
          const c0 = cuts[i], c1 = cuts[i + 1]; if (c1 - c0 < .01) continue;
          const over = holes.filter(h2 => h2[0] <= c0 + 1e-6 && h2[1] >= c1 - 1e-6).sort((a, b) => a[2] - b[2]);
          let y = 0; const segs = [];
          over.forEach(h2 => { if (h2[2] > y) segs.push([y, h2[2]]); y = Math.max(y, h2[3]); });
          if (y < h) segs.push([y, h]);
          segs.forEach(([s0, s1]) => { const m = (c0 + c1) / 2, b = tbox(c1 - c0, s1 - s0, .24, wallMat, tileOf);
            put(b, [ax + (bx - ax) * m / len, y0 + (s0 + s1) / 2, az + (bz - az) * m / len], [0, -ang, 0], parent); });
        }
      }
      walls.push({ ax, az, bx, bz, holes, y0, h });
    }
    // 某面墙上的门窗洞（t 是从墙中心算的位置）
    const holesOf = (sideName, up) => {
      const out = [], len = sideName === 'front' || sideName === 'back' ? W * 2 : D * 2;
      if (sideName === 'front' && !up) out.push([W + L.door.x - L.door.w / 2, W + L.door.x + L.door.w / 2, 0, L.door.h]);
      if (sideName === 'front' && up && L.balcony) out.push([W - .7, W + .7, 0, 2.5]);   // 通往阳台的门
      (L.windows || []).filter(w => w.side === sideName && !!w.up === !!up).forEach(w => out.push([len / 2 + w.t - w.w / 2, len / 2 + w.t + w.w / 2, w.y0 - (up ? floorH : 0), w.y1 - (up ? floorH : 0)]));
      return out;
    };
    wall(-W, D, W, D, holesOf('front'), fy);
    wall(W, D, W, -D, holesOf('right'), fy);
    wall(W, -D, -W, -D, holesOf('back'), fy);
    wall(-W, -D, -W, D, holesOf('left'), fy);
    // 角柱 / 墙角
    [[-W, -D], [W, -D], [W, D], [-W, D]].forEach(([x, z]) => {
      if (L.wall === 'plankwall' || L.wall === 'log') add(CYL, M({ color: 0x7a5230 }), [x, fy + H / 2, z], [.16, H + .1, .16]);
      else { const c = tbox(.36, H + (L.H2 ? L.H2 + .2 : 0), .36, L.wall === 'brick' ? mt('brick', { color: 0xe9e2d4 }) : trim, 1); put(c, [x, fy + (H + (L.H2 ? L.H2 + .2 : 0)) / 2, z]); }
    });
    // 屋里的隔墙（中级：卧室 | 厨房）
    (L.inner || []).forEach(iw => { const gap = iw.gap; const len = iw.z1 - iw.z0;
      wall(iw.x, iw.z0, iw.x, iw.z1, [[gap[0] - iw.z0, gap[1] - iw.z0, 0, 2.6]], fy, H);
      const w = walls.pop(); inner.push(w); });

    // ---------- 门 ----------
    const dx = L.door.x, dw = L.door.w, dh = L.door.h;
    const lintel = tbox(dw + .5, .18, .3, trim, 1); put(lintel, [dx, fy + dh + .09, D]);
    function leaf(px, w, sgn, style) {   // 一扇门：px 是转轴位置，sgn=1 往右开，-1 往左
      const pivot = new THREE.Group(); pivot.position.set(px, fy, D); root.add(pivot);
      const wood = style === 'rope' ? mt('plank') : style === 'latch' ? mt('plank', { color: 0x9a6a3a }) : M({ color: style === 'grand' ? 0x7a3e1d : 0x5e3a1a });
      if (style === 'rope' || style === 'latch') {
        for (let k = 0; k < 3; k++) put(tbox(w / 3 - .015, dh - .04, .06, wood, 3), [sgn * (w / 6 + k * w / 3), dh / 2, 0], null, pivot);
        [.45, dh - .45].forEach(y => put(tbox(w - .06, .12, .04, wood, 3), [sgn * w / 2, y, .05], null, pivot));
        put(tbox(.1, dh - .9, .04, wood, 3), [sgn * w / 2, dh / 2, .05], [0, 0, sgn * .55], pivot);
        if (style === 'rope') add(new THREE.TorusGeometry(.09, .02, 6, 14), M({ color: 0xcfae6e }), [sgn * (w - .12), 1.3, .09], null, [0, Math.PI / 2, 0], pivot);
        else { add(BOX, M({ color: 0x2b2b2b, metalness: .6, roughness: .4 }), [sgn * (w - .2), 1.3, .09], [.3, .07, .04], null, pivot);
          [.5, dh - .5].forEach(y => add(BOX, M({ color: 0x2b2b2b, metalness: .6 }), [sgn * .25, y, .09], [.45, .1, .03], null, pivot)); }
      } else {
        put(tbox(w, dh - (style === 'arch' || style === 'grand' ? w / 2 : 0), .1, wood, 1), [sgn * w / 2, (dh - (style === 'arch' || style === 'grand' ? w / 2 : 0)) / 2, 0], null, pivot);
        if (style === 'arch' || style === 'grand') { const top = add(new THREE.CylinderGeometry(w / 2, w / 2, .1, 20, 1, false, 0, Math.PI), wood, [sgn * w / 2, dh - w / 2, 0], null, [Math.PI / 2, 0, Math.PI / 2], pivot); top.rotation.set(-Math.PI / 2, 0, -Math.PI / 2); }
        // 门板上的花纹
        for (let k = 0; k < 2; k++) add(BOX, M({ color: 0x4a2a12 }), [sgn * w / 2, .8 + k * 1.0, .06], [w * .7, .8, .02], null, pivot);
        const metal = M({ color: style === 'grand' ? 0xe0b84a : 0x9aa3ad, metalness: .7, roughness: .3 });
        if (style === 'double') [.35, dh - .4].forEach(y => add(BOX, metal, [sgn * w / 2, y, .07], [w, .1, .02], null, pivot));
        add(SPH, metal, [sgn * (w - .15), 1.3, .1], [.06, .06, .06], null, pivot);
        if (style === 'arch') add(BOX, M({ color: 0x3a2210 }), [sgn * (w - .15), 1.1, .08], [.04, .1, .02], null, pivot);   // 锁眼
        if (style === 'grand' && sgn > 0) add(BOX, metal, [.12, 1.35, .09], [.16, .26, .04], null, pivot);                  // 密码锁
      }
      return pivot;
    }
    const ds = L.door.style;
    const leaves = ds === 'double' || ds === 'grand' ? [leaf(dx - dw / 2, dw / 2, 1, ds), leaf(dx + dw / 2, dw / 2, -1, ds)] : [leaf(dx - dw / 2, dw, 1, ds)];
    // 锁：锁上时门把手旁边挂一把金色的锁
    const lock = new THREE.Group(); leaves[0].add(lock);
    const lw = ds === 'double' || ds === 'grand' ? dw / 2 : dw, gold = M({ color: 0xe0b84a, metalness: .75, roughness: .3 });
    const lb = new THREE.Mesh(BOX, gold); lb.scale.set(.2, .18, .07); lb.position.set(lw - .14, 1.05, .14); lock.add(lb);
    const sh = new THREE.Mesh(new THREE.TorusGeometry(.065, .018, 6, 14, Math.PI), M({ color: 0xbfc5cc, metalness: .8, roughness: .25 })); sh.position.set(lw - .14, 1.14, .14); lock.add(sh);
    doors.push({ id: 'front', leaves, x: dx, z: D, w: dw, ang: st.doors.front ? 1 : 0, lock });
    // 门口台阶
    put(tbox(dw + .6, .16 + fy, .9, L.base ? mt('stone') : mt('plank', { color: 0x9a6a3a }), 1.5), [dx, (.16 + fy) / 2, D + .55]);
    if (ds === 'double') add(SPH, M({ color: 0xe0b84a, metalness: .7, roughness: .3 }), [dx + dw / 2 + .45, fy + 1.6, D + .14], [.08, .08, .08]);   // 门铃

    // ---------- 窗户 ----------
    const glass = M({ color: 0xbfe3f7, transparent: true, opacity: .35, roughness: .1, metalness: .1 });
    (L.windows || []).forEach(w => {
      const along = w.side === 'front' || w.side === 'back', sgn = w.side === 'front' || w.side === 'right' ? 1 : -1;
      const cx = along ? w.t * (w.side === 'front' ? 1 : -1) : sgn * W, cz = along ? sgn * D : w.t * (w.side === 'right' ? -1 : 1);
      const ry = along ? 0 : Math.PI / 2, cy = fy + (w.y0 + w.y1) / 2, hh = w.y1 - w.y0;
      const g = new THREE.Group(); g.position.set(cx, cy, cz); g.rotation.y = ry; (w.up ? upper : root).add(g);
      if (w.shutter) { const sh = tbox(.6, .8, .05, mt('plank', { color: 0xd9c0a0 }), 3); put(sh, [.55, -.1, .12], [0, .35, .12], g); return; }
      const pane = new THREE.Mesh(new THREE.PlaneGeometry(w.w, hh), glass); g.add(pane);
      const fm = L.wall === 'white' ? M({ color: 0xffffff }) : L.wall === 'plaster' ? M({ color: 0xffffff }) : M({ color: 0x5e3a1a });
      [[0, hh / 2, w.w + .16, .1], [0, -hh / 2, w.w + .3, .14], [0, 0, w.w, .06]].forEach(([x, y, ww, hh2]) => add(BOX, fm, [x, y, .05], [ww, hh2, .14], null, g));
      [[-w.w / 2, 0], [w.w / 2, 0], [0, 0]].forEach(([x]) => add(BOX, fm, [x, 0, .05], [x ? .1 : .06, hh, .14], null, g));
      if (L.flowerBox && !w.up && w.side === 'front') { add(BOX, M({ color: 0x8a5a2b }), [0, -hh / 2 - .15, .3], [w.w + .1, .25, .3], null, g);
        for (let k = 0; k < 5; k++) add(SPH, M({ color: [0xff7aa2, 0xffd23f, 0xb48cff][k % 3] }), [-w.w / 2 + .2 + k * (w.w - .4) / 4, -hh / 2 + .05, .3], [.1, .1, .1], null, g); }
    });

    // ---------- 二楼（高级、最高级） ----------
    if (L.H2) {
      const s = L.stairs;
      // 二楼地板（楼梯口留个洞）
      const holeX0 = s.x - s.w / 2 - .1, holeZ0 = s.z1, holeZ1 = s.z0;
      const slabMat = mt(L.floor2Tex || 'floor');
      put(tbox(holeX0 + W, .2, D * 2, slabMat, 2.5), [(holeX0 - W) / 2, fy + floorH - .1, 0], null, upper);
      put(tbox(W - holeX0, .2, D - holeZ1, slabMat, 2.5), [(holeX0 + W) / 2, fy + floorH - .1, (holeZ1 + D) / 2], null, upper);
      put(tbox(W - holeX0, .2, holeZ0 + D, slabMat, 2.5), [(holeX0 + W) / 2, fy + floorH - .1, (holeZ0 - D) / 2], null, upper);
      // 楼梯：一级一级
      const n = 14; stairs = { ...s, n, top: floorH };
      for (let i = 0; i < n; i++) { const z = s.z0 + (s.z1 - s.z0) * (i + .5) / n, y = floorH * (i + 1) / n;
        put(tbox(s.w, .12, Math.abs(s.z1 - s.z0) / n + .02, mt('plank', { color: 0x9a6a3a }), 2), [s.x, fy + y - .06, z]); }
      add(BOX, trim, [s.x - s.w / 2 - .05, fy + floorH / 2 + .5, (s.z0 + s.z1) / 2], [.08, .08, Math.abs(s.z1 - s.z0)], [Math.atan2(floorH, s.z0 - s.z1), 0, 0]);
      // 二楼的墙
      wall(-W, D, W, D, holesOf('front', true), fy + floorH, L.H2, upper);
      wall(W, D, W, -D, holesOf('right', true), fy + floorH, L.H2, upper);
      wall(W, -D, -W, -D, holesOf('back', true), fy + floorH, L.H2, upper);
      wall(-W, -D, -W, D, holesOf('left', true), fy + floorH, L.H2, upper);
      walls.slice(-4).forEach(w => w.up = true);
      // 两层之间的一圈腰线
      [[0, D + .02, W * 2 + .4, .1], [0, -D - .02, W * 2 + .4, .1]].forEach(([x, z, w2, d2]) => add(BOX, trim, [x, fy + floorH, z], [w2, .2, d2]));
      // 阳台（高级）
      if (L.balcony) {
        put(tbox(4, .2, 1.8, mt('stone'), 1.5), [0, fy + floorH - .1, D + .9]);
        for (let k = 0; k <= 12; k++) add(BOX, M({ color: 0xffffff }), [-2 + k / 3, fy + floorH + .5, D + 1.75], [.06, 1, .06]);
        add(BOX, M({ color: 0xffffff }), [0, fy + floorH + 1.02, D + 1.75], [4.1, .08, .1]);
        [-1.95, 1.95].forEach(x => add(BOX, M({ color: 0xffffff }), [x, fy + floorH + 1.02, D + .9], [.1, .08, 1.8]));
      }
    }
    // 门廊柱子（高级）
    if (L.porch) { [-1.9, 1.9].forEach(x => add(CYL, M({ color: 0xffffff }), [x, fy + (L.H) / 2, D + 1.6], [.16, L.H, .16])); }

    // ---------- 屋顶 ----------
    const topY = fy + (L.H2 ? floorH + L.H2 : H), OV = .5, rise = L.rise, sl = Math.hypot(D + OV, rise);
    const roofMat = L.roof === 'thatch' ? mt('straw', { side: THREE.DoubleSide }) : mt(L.roof);
    [-1, 1].forEach(sg => {
      const half = tbox(W * 2 + OV * 2, .24, sl, roofMat, L.roof === 'thatch' ? 1.6 : 2.2);
      half.position.set(0, topY + rise / 2, sg * (D + OV) / 2); half.rotation.x = sg * Math.atan2(rise, D + OV); roof.add(half);
      if (L.roof === 'thatch') for (let k = 0; k < 40; k++) { const tuft = new THREE.Mesh(new THREE.ConeGeometry(.1, .4 + rnd() * .2, 4), M({ color: rnd() < .5 ? 0xd8b25a : 0xc49a44 }));
        tuft.position.set(-W - OV + (k + .5) * (W * 2 + OV * 2) / 40, topY - .15, sg * (D + OV + .02)); tuft.rotation.x = Math.PI; roof.add(tuft); }
    });
    const ridge = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, W * 2 + OV * 2 + .2, 8), L.roof === 'thatch' ? M({ color: 0x7a5230 }) : M({ color: { shingle: 0x4e2a10, rooftile: 0x7c2614, slate: 0x2f465c, purple: 0x2d1e52 }[L.roof] }));
    ridge.rotation.z = Math.PI / 2; ridge.position.y = topY + rise + .05; roof.add(ridge);
    [-1, 1].forEach(sg => { const shape = new THREE.Shape(); shape.moveTo(-D, 0); shape.lineTo(D, 0); shape.lineTo(0, rise); shape.lineTo(-D, 0);
      const gm = L.wall === 'plankwall' ? mt('plank', { color: 0xd9c0a0, side: THREE.DoubleSide }) : L.wall === 'log' ? mt('plank', { color: 0xb07a40, side: THREE.DoubleSide }) : new THREE.MeshStandardMaterial({ map: wallMat.map, roughness: .9, side: THREE.DoubleSide });
      const gable = new THREE.Mesh(new THREE.ShapeGeometry(shape), gm); gable.rotation.y = Math.PI / 2; gable.position.set(sg * W, topY, 0); roof.add(gable); });
    if (L.chimney) { const [cx, cz] = L.chimney; const ch = tbox(.8, rise + 1.6, .8, L.wall === 'brick' ? mt('brick') : mt('stone'), 1.2); ch.position.set(cx, topY + (rise + 1.6) / 2 - .3, cz); roof.add(ch);
      if (L.smoke) for (let k = 0; k < 3; k++) { const p = new THREE.Mesh(SPH, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .55 })); p.scale.setScalar(.35 + k * .15); p.position.set(cx + k * .2, topY + rise + 1.6 + k * .55, cz); p.userData.smoke = k; roof.add(p); } }
    roof.traverse(o => { if (o.isMesh) { o.castShadow = true; o.material = o.material.clone(); o.material.transparent = true; } });
    upper.traverse(o => { if (o.isMesh && o.material) { o.material = o.material.clone(); o.material.transparent = true; } });

    // ---------- 最高级：塔楼、温室、门口路灯 ----------
    const extraFloor = { gh: null };
    if (L.tower) {   // 后面角上的圆塔（装饰）
      const tx = -side * (W - .2), tz = -D + .2, th = topY + 1.5;
      const tw = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.1, th, 24), wallMat); tw.position.set(tx, th / 2, tz); tw.castShadow = tw.receiveShadow = true; root.add(tw);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(2.6, 3.4, 24), mt('purple')); cone.position.set(tx, th + 1.7, tz); cone.castShadow = true; roof.add(cone);
      add(SPH, M({ color: 0xffd23f, emissive: 0xffb000, emissiveIntensity: .4 }), [tx, th + 3.5, tz], [.18, .18, .18], null, roof);
      for (let k = 0; k < 3; k++) { const a = k * 2.1 + .5, win = new THREE.Mesh(new THREE.PlaneGeometry(.7, 1.1), glass); win.position.set(tx + Math.sin(a) * 2.05, th * .45 + k * 2.4, tz + Math.cos(a) * 2.05); win.rotation.y = a; root.add(win); }
      solids.push({ x: tx, z: tz, hx: 2, hz: 2, floor: 'all' });
    }
    if (L.greenhouse) {   // 侧面的玻璃温室，从屋里能走过去
      const gx = -side * (W + 2.6), gw = 2.6, gd = 2.6, gh = 3;
      const gg = new THREE.Group(); gg.position.set(gx, fy, D - 1.4 - gd + 1.4); root.add(gg);
      const frame = M({ color: 0xffffff });
      for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) add(BOX, frame, [i * gw, gh / 2, j * gd], [.1, gh, .1], null, gg);
      [[0, gh, gd, gw * 2, .1], [0, gh, -gd, gw * 2, .1]].forEach(([x, y, z, w2, d2]) => add(BOX, frame, [x, y, z], [w2, .1, d2], null, gg));
      [[0, 0, -gd, gw * 2, gh, 0], [-side * gw, 0, 0, gd * 2, gh, Math.PI / 2]].forEach(([x, y, z, w2, h2, ry]) => { const pn = new THREE.Mesh(new THREE.PlaneGeometry(w2, h2), glass); pn.position.set(x, h2 / 2, z); pn.rotation.y = ry; gg.add(pn); });
      const groof = new THREE.Mesh(new THREE.PlaneGeometry(gw * 2, gd * 2), glass); groof.rotation.x = -Math.PI / 2; groof.position.y = gh; gg.add(groof);
      put(tbox(gw * 2, .06, gd * 2, mt('tile'), 1.2), [0, .03, 0], null, gg);
      [[-1, -1.6], [1, -1.6], [-1, 1.6], [1, 1.6]].forEach(([i, z]) => { add(BOX, M({ color: 0x8a5a2b }), [i * 1.4, .35, z], [1.6, .7, .7], null, gg);
        for (let k = 0; k < 4; k++) add(SPH, M({ color: [0x5fae4a, 0xe8352b, 0xffd23f, 0x7dbf3a][k] }), [i * 1.4 - .6 + k * .4, .82, z], [.15, .2, .15], null, gg); });
      extraFloor.gh = { x: gx, z: gg.position.z, w: gw, d: gd };
      // 温室：前面敞开，从外面走进去；另外两面玻璃挡路
      walls.push({ ax: gx - gw, az: gg.position.z - gd, bx: gx + gw, bz: gg.position.z - gd, holes: [], y0: 0, h: gh });
      walls.push({ ax: gx - side * gw, az: gg.position.z - gd, bx: gx - side * gw, bz: gg.position.z + gd, holes: [], y0: 0, h: gh });
      things.push({ kind: 'greenhouse', x: gx, z: gg.position.z, floor: 0 });
    }
    if (L.lamps) [-dw / 2 - 1.6, dw / 2 + 1.6].forEach((x, i) => {   // 门口两盏路灯（天黑自动亮）
      add(CYL, M({ color: 0x2d2d2d, metalness: .6 }), [x, 1.3, D + 1.4], [.07, 2.6, .07]);
      const bulb = add(SPH, M({ color: 0xfff1b8, emissive: 0xffd36b, emissiveIntensity: 0 }), [x, 2.75, D + 1.4], [.22, .26, .22]);
      add(new THREE.ConeGeometry(.32, .25, 8), M({ color: 0x2d2d2d }), [x, 3.05, D + 1.4]);
      const pl = new THREE.PointLight(0xffd59a, 0, 14, 1.5); pl.position.set(x, 2.7, D + 1.6); root.add(pl);
      lights.push({ id: 'lamp' + i, kind: 'auto', bulb, light: pl, power: 3.2 });
    });

    // ---------- 家具 ----------
    const F = FURN[st.level];
    F.forEach(f => {
      const g = new THREE.Group(); g.position.set(f.x, fy + (f.up ? floorH : 0), f.z); g.rotation.y = f.ry || 0; (f.up ? upper : root).add(g);
      const r = makeFurniture(f.type, g, f);
      if (r && r.box) solids.push({ x: f.x, z: f.z, hx: (f.ry && Math.abs(Math.sin(f.ry)) > .5) ? r.box[1] : r.box[0], hz: (f.ry && Math.abs(Math.sin(f.ry)) > .5) ? r.box[0] : r.box[1], floor: f.up ? 1 : 0 });
      if (r && r.light) lights.push({ ...r.light, id: f.id || f.type + f.x, room: f.room, floor: f.up ? 1 : 0 });
      if (r && r.thing) things.push({ ...r.thing, type: f.type, bx: f.x, bz: f.z, by: fy + (f.up ? floorH : 0), ry: f.ry || 0, x: f.x + (r.thing.dx || 0) * Math.cos(f.ry || 0) + (r.thing.dz || 0) * Math.sin(f.ry || 0), z: f.z - (r.thing.dx || 0) * Math.sin(f.ry || 0) + (r.thing.dz || 0) * Math.cos(f.ry || 0), floor: f.up ? 1 : 0, id: f.id || f.type + f.x, room: f.room });
    });
    things.push({ kind: 'door', x: dx, z: D, floor: 0, id: 'front' });
    lights.forEach(l => { if (l.kind === 'candle' || l.kind === 'oil') { const max = l.kind === 'oil' ? OIL_LIFE : CANDLE_LIFE;
      if (st.candles[l.id] === undefined) st.candles[l.id] = max * (lights.indexOf(l) ? .6 : 1);
      st.candles[l.id] = Math.min(st.candles[l.id], max); } });   // 以前按老规则点的蜡烛，剩下的时间也不能超过现在的上限
  }

  // ---------- 家具库 ----------
  function makeFurniture(type, g, f) {
    const add = (geo, mat, p, s, r) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); if (s) m.scale.set(...s); if (r) m.rotation.set(...r); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
    const wood = mt('plank', { color: 0xb98a55 }), darkWood = M({ color: 0x6b4423 }), cloth = c => M({ color: c, roughness: 1 });
    switch (type) {
      case 'bedStraw':
        add(BOX, M({ color: 0x7a5230 }), [0, .15, 0], [2.4, .3, 1.4]); add(BOX, mt('straw'), [0, .42, 0], [2.3, .26, 1.3]);
        add(BOX, cloth(0x8c6a4a), [.3, .58, .05], [1.4, .06, 1.2]); add(SPH, mt('straw', { color: 0xf0e2c0 }), [-.85, .62, 0], [.35, .12, .45]);
        return { box: [1.2, .7], thing: { kind: 'bed', dz: .9, name: '稻草床' } };
      case 'bedWood':
        add(BOX, darkWood, [0, .22, 0], [2.4, .44, 1.5]); add(BOX, darkWood, [-1.2, .7, 0], [.12, 1.4, 1.5]);
        add(BOX, cloth(0xf3ead6), [.05, .55, 0], [2.2, .22, 1.4]); add(BOX, cloth(0x4f7fbf), [.4, .68, 0], [1.5, .08, 1.45]); add(BOX, cloth(0xffffff), [-.85, .72, 0], [.4, .14, .9]);
        return { box: [1.2, .75], thing: { kind: 'bed', dz: 1, name: '木床' } };
      case 'bedSoft':
        add(BOX, M({ color: 0xc58a5a }), [0, .25, 0], [2.4, .5, 1.7]); add(BOX, M({ color: 0xc58a5a }), [-1.2, .85, 0], [.15, 1.7, 1.7]);
        add(BOX, cloth(0xfff4ec), [.05, .65, 0], [2.2, .3, 1.6]); add(BOX, cloth(0xf4a6b8), [.45, .82, 0], [1.4, .1, 1.65]); add(SPH, cloth(0xffffff), [-.8, .88, 0], [.3, .14, .6]);
        return { box: [1.2, .85], thing: { kind: 'bed', dz: 1.1, name: '软床' } };
      case 'bedDouble':
        add(BOX, M({ color: 0x5e3a1a }), [0, .25, 0], [2.6, .5, 2.4]); add(BOX, M({ color: 0x5e3a1a }), [-1.3, 1, 0], [.18, 2, 2.4]);
        add(BOX, cloth(0xfaf6ee), [.05, .7, 0], [2.4, .32, 2.3]); add(BOX, cloth(0x6f8fbf), [.5, .88, 0], [1.4, .1, 2.35]);
        [-.55, .55].forEach(z => add(SPH, cloth(0xffffff), [-.85, .95, z], [.3, .14, .45]));
        return { box: [1.3, 1.2], thing: { kind: 'bed', dz: 1.5, name: '双人大床' } };
      case 'bedCanopy':
        add(BOX, M({ color: 0xf2e6d0 }), [0, .3, 0], [2.8, .6, 2.6]); add(BOX, cloth(0xffffff), [.05, .78, 0], [2.6, .36, 2.5]); add(BOX, cloth(0xb48cff), [.5, .98, 0], [1.6, .1, 2.55]);
        [-.6, .6].forEach(z => add(SPH, cloth(0xffffff), [-.95, 1.05, z], [.32, .15, .5]));
        [[-1.4, -1.3], [1.4, -1.3], [-1.4, 1.3], [1.4, 1.3]].forEach(([x, z]) => add(CYL, M({ color: 0xe0b84a, metalness: .5 }), [x, 1.4, z], [.05, 2.8, .05]));
        add(BOX, M({ color: 0xd9c4f5, transparent: true, opacity: .55, side: THREE.DoubleSide }), [0, 2.8, 0], [2.9, .05, 2.7]);
        [-1.42, 1.42].forEach(x => add(BOX, M({ color: 0xd9c4f5, transparent: true, opacity: .35, side: THREE.DoubleSide }), [x, 2.1, 0], [.02, 1.4, 2.6]));
        return { box: [1.4, 1.3], thing: { kind: 'bed', dz: 1.6, name: '带帐子的大床' } };
      case 'cabSmall':
        add(BOX, mt('plank', { color: 0xb98a55 }), [0, .7, 0], [1.25, 1.4, .7]); add(BOX, mt('plank', { color: 0x8f6034 }), [0, 1.43, 0], [1.33, .08, .76]);
        [-1, 1].forEach(s => { add(BOX, mt('plank', { color: 0xa27445 }), [s * .3, .7, .36], [.55, 1.2, .04]); add(SPH, M({ color: 0x3a3a3a, metalness: .6 }), [s * .08, .78, .4], [.04, .04, .04]); });
        return { box: [.65, .38], thing: { kind: 'cabinet', dz: .9, name: '小木柜' } };
      case 'cabWood': case 'wardrobe': case 'bigCab': {
        const h = type === 'cabWood' ? 1.7 : 2.2, w = type === 'bigCab' ? 1.8 : 1.4, col = type === 'wardrobe' ? 0xc58a5a : 0xa8713c;
        add(BOX, mt('plank', { color: col }), [0, h / 2, 0], [w, h, .7]); add(BOX, darkWood, [0, h + .04, 0], [w + .1, .08, .78]);
        [-1, 1].forEach(s => { add(BOX, mt('plank', { color: col - 0x101010 }), [s * w / 4, h / 2, .36], [w / 2 - .06, h - .2, .04]); add(BOX, M({ color: 0xd8b25a, metalness: .6 }), [s * .08, h / 2, .4], [.04, .25, .04]); });
        return { box: [w / 2 + .02, .38], thing: { kind: 'cabinet', dz: .9, name: { cabWood: '木柜', wardrobe: '衣柜', bigCab: '大柜子' }[type] } };
      }
      case 'safe':
        add(BOX, M({ color: 0x55595f, metalness: .7, roughness: .35 }), [0, .55, 0], [1, 1.1, .8]);
        add(CYL, M({ color: 0xe0b84a, metalness: .8, roughness: .2 }), [0, .65, .41], [.16, .04, .16], [Math.PI / 2, 0, 0]);
        add(BOX, M({ color: 0xe0b84a, metalness: .8 }), [.3, .45, .42], [.06, .3, .04]);
        return { box: [.52, .42], thing: { kind: 'safe', dz: .9, name: '保险箱' } };
      case 'table':
        add(BOX, wood, [0, .82, 0], [f.w || 1.4, .08, f.d || .9]);
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([i, j]) => add(BOX, darkWood, [i * ((f.w || 1.4) / 2 - .1), .4, j * ((f.d || .9) / 2 - .1)], [.08, .8, .08]));
        return { box: [(f.w || 1.4) / 2, (f.d || .9) / 2] };
      case 'stool': add(CYL, wood, [0, .45, 0], [.22, .06, .22]); [0, 2.1, 4.2].forEach(a => add(CYL, darkWood, [Math.cos(a) * .14, .22, Math.sin(a) * .14], [.03, .44, .03])); return { box: [.2, .2] };
      case 'chair': add(BOX, wood, [0, .48, 0], [.5, .06, .5]); add(BOX, wood, [0, .9, -.22], [.5, .8, .06]); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([i, j]) => add(BOX, darkWood, [i * .2, .23, j * .2], [.05, .46, .05])); return { box: [.26, .26] };
      case 'sofa': add(BOX, cloth(f.color || 0x9cc0de), [0, .3, 0], [2.4, .6, 1]); add(BOX, cloth(f.color || 0x9cc0de), [0, .75, -.4], [2.4, .9, .2]); [-1.15, 1.15].forEach(x => add(BOX, cloth(f.color || 0x9cc0de), [x, .55, 0], [.2, .5, 1]));
        [-.6, .6].forEach(x => add(BOX, cloth(0xffffff), [x, .7, -.2], [.5, .4, .15])); return { box: [1.25, .55] };
      case 'rug': { const r = new THREE.Mesh(new THREE.CircleGeometry(1, 40), M({ color: f.color || 0xe7b3c8, roughness: 1 })); r.rotation.x = -Math.PI / 2; r.scale.set(f.w || 1.4, f.d || 1, 1); r.position.y = .1; r.receiveShadow = true; g.add(r); return null; }
      case 'stove':
        add(BOX, mt('brick'), [0, .45, 0], [1.4, .9, .8]); add(BOX, M({ color: 0x2b2b2b, metalness: .5 }), [0, .93, 0], [1.4, .06, .8]);
        add(CYL, M({ color: 0x8a8f96, metalness: .7 }), [-.3, 1.1, 0], [.25, .3, .25]); add(CYL, M({ color: 0x3a3a3a }), [.35, 1.0, .05], [.2, .08, .2]);
        return { box: [.72, .42], thing: { kind: 'stove', dz: .9, name: '灶台' } };
      case 'counter': add(BOX, mt('plank', { color: 0xd7a86e }), [0, .45, 0], [f.w || 2, .9, .7]); add(BOX, M({ color: 0xe8e2d6 }), [0, .93, 0], [(f.w || 2) + .05, .06, .75]); return { box: [(f.w || 2) / 2, .38] };
      case 'fireplace': {
        add(BOX, mt('stone'), [0, .9, 0], [2, 1.8, .7]); add(BOX, M({ color: 0x1a1410 }), [0, .55, .2], [1.1, .9, .4]); add(BOX, mt('stone'), [0, 1.9, .05], [2.3, .15, .85]);
        const fire = add(new THREE.ConeGeometry(.28, .6, 8), new THREE.MeshBasicMaterial({ color: 0xff8a2a }), [0, .45, .25]);
        const fire2 = add(new THREE.ConeGeometry(.18, .45, 8), new THREE.MeshBasicMaterial({ color: 0xffd36b }), [.15, .4, .3]);
        const pl = new THREE.PointLight(0xff9a4a, 0, 10, 1.4); pl.position.set(0, .8, .9); g.add(pl);
        return { box: [1, .4], light: { kind: 'fire', light: pl, flame: [fire, fire2], power: 3 }, thing: { kind: 'fire', dz: 1.1, name: '壁炉' } };
      }
      case 'candle': {   // 墙上的烛台
        add(BOX, M({ color: 0x2d2d2d, metalness: .5 }), [0, 1.9, .14], [.05, .05, .28]); add(CYL, M({ color: 0x2d2d2d, metalness: .5 }), [0, 1.92, .28], [.1, .04, .1]);
        const wax = add(CYL, M({ color: 0xfaf3df, roughness: .6 }), [0, 2.05, .28], [.045, .26, .045]);
        const flame = new THREE.Mesh(new THREE.ConeGeometry(.04, .12, 8), new THREE.MeshBasicMaterial({ color: 0xffc04d })); flame.position.set(0, 2.25, .28); g.add(flame);
        const pl = new THREE.PointLight(0xffb45a, 0, 9, 1.4); pl.position.set(0, 2.3, .4); g.add(pl);
        return { light: { kind: 'candle', wax, flame, light: pl, power: 2.4 }, thing: { kind: 'candle', dz: .7, name: '烛台' } };
      }
      case 'oilLamp': {   // 桌上的油灯
        add(CYL, M({ color: 0x8a6a3a, metalness: .5 }), [0, .9, 0], [.14, .1, .14]);
        const glassM = add(SPH, M({ color: 0xfff1c8, transparent: true, opacity: .6, emissive: 0xffc04d, emissiveIntensity: 0 }), [0, 1.08, 0], [.12, .16, .12]);
        const pl = new THREE.PointLight(0xffc070, 0, 11, 1.4); pl.position.set(0, 1.2, 0); g.add(pl);
        return { light: { kind: 'oil', bulb: glassM, light: pl, power: 3 }, thing: { kind: 'candle', dz: .6, name: '油灯' } };
      }
      case 'bulb': case 'chandelier': case 'crystal': {   // 电灯：天花板上挂着
        const y = (f.ceil || 3.2) - .1;
        add(CYL, M({ color: 0x333333 }), [0, y - .25, 0], [.015, .5, .015]);
        let bulb;
        if (type === 'bulb') { add(new THREE.ConeGeometry(.28, .22, 16, 1, true), M({ color: 0xffffff, side: THREE.DoubleSide }), [0, y - .55, 0]); bulb = add(SPH, M({ color: 0xfffbe8, emissive: 0xfff1b0, emissiveIntensity: 0 }), [0, y - .68, 0], [.11, .13, .11]); }
        else { const n = type === 'crystal' ? 8 : 5, rr = type === 'crystal' ? .7 : .5; add(new THREE.TorusGeometry(rr, .03, 6, 24), M({ color: 0xe0b84a, metalness: .7 }), [0, y - .6, 0], null, [Math.PI / 2, 0, 0]);
          bulb = new THREE.Group(); g.add(bulb); const bm = M({ color: 0xfffbe8, emissive: 0xfff1b0, emissiveIntensity: 0 });
          for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; const b = new THREE.Mesh(SPH, type === 'crystal' ? M({ color: 0xe8f6ff, emissive: 0xdff0ff, emissiveIntensity: 0, transparent: true, opacity: .85 }) : bm); b.scale.setScalar(.09); b.position.set(Math.cos(a) * rr, y - .52, Math.sin(a) * rr); bulb.add(b); }
          if (type === 'crystal') for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; add(new THREE.OctahedronGeometry(.06), M({ color: 0xffffff, transparent: true, opacity: .7, metalness: .2, roughness: .05 }), [Math.cos(a) * .45, y - .85, Math.sin(a) * .45]); } }
        const pl = new THREE.PointLight(type === 'crystal' ? 0xfff6e6 : 0xffecc0, 0, type === 'bulb' ? 12 : 15, 1.3); pl.position.set(0, y - .9, 0); g.add(pl);
        return { light: { kind: 'electric', bulb, light: pl, power: type === 'bulb' ? 3.4 : 4.2 } };
      }
      case 'switch':   // 墙上的开关
        add(BOX, M({ color: 0xffffff }), [0, 1.3, .03], [.14, .22, .04]); add(BOX, M({ color: 0xdddddd }), [0, 1.33, .06], [.05, .08, .03]);
        return { thing: { kind: 'switch', dz: .7, name: '开关' } };
      case 'bookshelf': add(BOX, darkWood, [0, 1.1, 0], [1.6, 2.2, .5]);
        for (let s2 = 0; s2 < 4; s2++) for (let k = 0; k < 9; k++) add(BOX, M({ color: [0xc0392b, 0x2e86c1, 0x27ae60, 0xf1c40f, 0x8e44ad][k % 5] }), [-.65 + k * .16, .35 + s2 * .5, .05], [.12, .38, .35]);
        return { box: [.8, .28] };
      case 'desk': add(BOX, wood, [0, .78, 0], [1.4, .06, .7]); [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([i, j]) => add(BOX, darkWood, [i * .6, .38, j * .28], [.06, .76, .06])); add(BOX, M({ color: 0xfaf6ee }), [-.2, .83, 0], [.4, .02, .3]); return { box: [.72, .38] };
      case 'bathtub': add(BOX, M({ color: 0xffffff, roughness: .3 }), [0, .35, 0], [1.8, .7, .9]); add(BOX, M({ color: 0x9fd4ef, roughness: .1 }), [0, .62, 0], [1.6, .04, .7]); return { box: [.92, .48] };
      case 'plant': add(CYL, M({ color: 0xb8653a }), [0, .25, 0], [.25, .5, .25]); add(SPH, M({ color: 0x4f9a3a }), [0, .8, 0], [.4, .45, .4]); return { box: [.28, .28] };
      case 'kitchenTable':
        add(BOX, wood, [0, .82, 0], [2.4, .08, 1]); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([i, j]) => add(BOX, darkWood, [i * 1.1, .4, j * .4], [.08, .8, .08]));
        return { box: [1.2, .5] };
    }
  }

  // ---------- 每一级的家具摆放（x、z 是房子中心算起的位置；up=true 在二楼） ----------
  const FURN = {
    1: [ { type: 'bedStraw', x: -2.1, z: -2.1 }, { type: 'cabSmall', x: 2.6, z: -2.55 },
         { type: 'candle', x: -3.4, z: -.3, ry: Math.PI / 2, id: 'c0' }, { type: 'candle', x: -1.2, z: -2.95, id: 'c1' } ],
    2: [ { type: 'bedWood', x: -2.9, z: -2.75 }, { type: 'cabWood', x: 3.3, z: -3.35 }, { type: 'table', x: .8, z: -.6 }, { type: 'stool', x: -.1, z: -.6 }, { type: 'stool', x: 1.7, z: -.6 },
         { type: 'oilLamp', x: .8, z: -.6, id: 'oil0' }, { type: 'candle', x: -4.3, z: .4, ry: Math.PI / 2, id: 'c0' }, { type: 'rug', x: .8, z: 1.4, color: 0xc0705a, w: 1.6, d: 1.1 } ],
    3: [ // 左边卧室
         { type: 'bedSoft', x: -4.2, z: -3.2 }, { type: 'wardrobe', x: -5.1, z: 1.8, ry: Math.PI / 2 }, { type: 'rug', x: -3.2, z: .4, color: 0xe7b3c8 },
         { type: 'bulb', x: -3.4, z: -.6, ceil: 3.3, room: 'bed', id: 'b0' }, { type: 'switch', x: -1.35, z: 2, ry: -Math.PI / 2, room: 'bed', id: 's0' },
         // 右边厨房
         { type: 'stove', x: 4.6, z: -3.85 }, { type: 'counter', x: 2.4, z: -4, w: 2.4 }, { type: 'kitchenTable', x: 2.6, z: .2 }, { type: 'chair', x: 1.6, z: 1, ry: Math.PI }, { type: 'chair', x: 3.6, z: 1, ry: Math.PI },
         { type: 'bulb', x: 2.6, z: -.8, ceil: 3.3, room: 'kit', id: 'b1' }, { type: 'switch', x: 2.3, z: 4.25, ry: Math.PI, room: 'kit', id: 's1' }, { type: 'plant', x: 5, z: 3.6 } ],
    4: [ // 一楼：客厅、厨房、储藏
         { type: 'fireplace', x: -3.4, z: -4.35 }, { type: 'sofa', x: -3.4, z: -1.2, ry: Math.PI }, { type: 'rug', x: -3.4, z: -2.6, color: 0xd9b3a0, w: 1.8, d: 1.2 },
         { type: 'chandelier', x: -3, z: -1.8, ceil: 3.5, room: 'down', id: 'b0' },
         { type: 'stove', x: 2.4, z: -4.35 }, { type: 'counter', x: .6, z: -4.4, w: 1.8 }, { type: 'kitchenTable', x: 1.6, z: -1.6 },
         { type: 'bigCab', x: -5.95, z: 2.2, ry: Math.PI / 2 }, { type: 'bigCab', x: -5.95, z: .2, ry: Math.PI / 2 }, { type: 'plant', x: 3.6, z: 4.2 },
         { type: 'bulb', x: 1.6, z: -2.2, ceil: 3.5, room: 'down', id: 'b1' }, { type: 'switch', x: -1.4, z: 4.65, ry: Math.PI, room: 'down', id: 's0' },
         // 二楼：卧室
         { type: 'bedDouble', x: -4.6, z: -2.9, up: true }, { type: 'wardrobe', x: -1.8, z: -4.35, up: true }, { type: 'desk', x: 2, z: -4.2, up: true }, { type: 'rug', x: -2.6, z: 0, color: 0x9cc0de, up: true },
         { type: 'chandelier', x: -1.5, z: -1, ceil: 3.2, room: 'up', id: 'b2', up: true }, { type: 'switch', x: 4.4, z: -1.2, ry: 0, room: 'up', id: 's1', up: true } ],
    5: [ // 一楼：大客厅、餐厅、厨房、储藏室（大柜子 + 保险箱）
         { type: 'fireplace', x: -3.8, z: -4.75 }, { type: 'sofa', x: -3.8, z: -1.4, ry: Math.PI, color: 0xc9b6ea }, { type: 'rug', x: -3.8, z: -2.8, color: 0xe9d9f5, w: 2, d: 1.3 },
         { type: 'crystal', x: -3.6, z: -2, ceil: 3.7, room: 'down', id: 'b0' },
         { type: 'kitchenTable', x: 1.4, z: -1.2 }, { type: 'chair', x: .6, z: -.4, ry: Math.PI }, { type: 'chair', x: 2.2, z: -.4, ry: Math.PI }, { type: 'chair', x: .6, z: -2, ry: 0 }, { type: 'chair', x: 2.2, z: -2, ry: 0 },
         { type: 'crystal', x: 1.4, z: -1.2, ceil: 3.7, room: 'down', id: 'b1' },
         { type: 'stove', x: 3.4, z: -4.75 }, { type: 'counter', x: 1.4, z: -4.8, w: 2.2 },
         { type: 'bigCab', x: -6.75, z: 2.6, ry: Math.PI / 2 }, { type: 'safe', x: -6.6, z: .8, ry: Math.PI / 2 }, { type: 'plant', x: 4.4, z: 4.6 }, { type: 'plant', x: -4.4, z: 4.6 },
         { type: 'switch', x: -1.7, z: 5.05, ry: Math.PI, room: 'down', id: 's0' },
         // 二楼：主卧、小卧室、书房、浴室
         { type: 'bedCanopy', x: -5.2, z: -3.4, up: true }, { type: 'wardrobe', x: -2.4, z: -4.75, up: true }, { type: 'sofa', x: 2.8, z: -4.1, up: true, color: 0xf4c6d6 },   // 用户说：一个房子一张床就够了
        
         { type: 'desk', x: -1.4, z: 3.8, up: true, ry: Math.PI }, { type: 'bookshelf', x: -3.6, z: 4.85, up: true, ry: Math.PI }, { type: 'bathtub', x: 4.4, z: 3.9, up: true },
         { type: 'crystal', x: -2, z: -1, ceil: 3.4, room: 'up', id: 'b2', up: true }, { type: 'bulb', x: 3, z: 1, ceil: 3.4, room: 'up', id: 'b3', up: true },
         { type: 'switch', x: 5.2, z: -1, ry: 0, room: 'up', id: 's1', up: true } ],
  };

  // ---------- 碰撞、地面高度 ----------
  const fyNow = () => (L.base ? .2 : 0);
  function floorOf(y) { return L.H2 && y > fyNow() + floorH - .8 ? 1 : 0; }
  // 脚下有多高：楼梯上按台阶算，二楼地板上是二楼的高度
  function groundAt(pos) {
    const [lx, lz] = toLocal(pos.x, pos.z), fy = fyNow();
    if (Math.abs(lx) > L.W || Math.abs(lz) > L.D) {
      if (L.balcony && pos.y > fy + floorH - .8 && Math.abs(lx) < 2 && lz > L.D && lz < L.D + 1.8) return fy + floorH;
      if (L.base && Math.abs(lx) < L.W + .2 && Math.abs(lz) < L.D + .2) return fy;
      return 0;
    }
    if (stairs) {
      const s = stairs, inX = Math.abs(lx - s.x) < s.w / 2, lo = Math.min(s.z0, s.z1), hi = Math.max(s.z0, s.z1);
      if (inX && lz > lo && lz < hi) { const k = (s.z0 - lz) / (s.z0 - s.z1); return fy + Math.max(0, Math.min(1, k)) * s.top; }
      const inHole = lx > s.x - s.w / 2 - .1 && lz > lo && lz < hi;
      if (!inHole && pos.y > fy + floorH - .8) return fy + floorH;
    }
    return fy;
  }
  function collide(pos, pr = .45) {
    let [lx, lz] = toLocal(pos.x, pos.z);
    if (Math.abs(lx) > L.W + 9 || Math.abs(lz) > L.D + 9) return;
    const ox = lx, oz = lz, fl = floorOf(pos.y), up = fl === 1;
    const segs = walls.filter(w => (L.H2 ? !!w.up === up || w.h > 4 : true) && pos.y < (w.y0 || 0) + w.h).concat(up ? [] : inner);
    segs.forEach(w => {
      const len = Math.hypot(w.bx - w.ax, w.bz - w.az), ux = (w.bx - w.ax) / len, uz = (w.bz - w.az) / len;
      const rx = lx - w.ax, rz = lz - w.az, t = rx * ux + rz * uz, n = rx * -uz + rz * ux;
      if (t < -pr || t > len + pr || Math.abs(n) > pr) return;
      // 门洞 / 通道：门开着才能过；窗户不让过
      const yRel = pos.y - (w.y0 || 0) + .3;
      const hole = w.holes.find(h => t > h[0] + .1 && t < h[1] - .1 && h[2] <= .05 && yRel < h[3]);
      if (hole) { const isFront = w === walls[0]; if (!isFront || doors[0].ang > .6) return; }
      const push = (n >= 0 ? pr : -pr) - n; lx += -uz * push; lz += ux * push;
    });
    solids.filter(b => b.floor === 'all' || b.floor === fl).forEach(b => { const ex = b.hx + pr - Math.abs(lx - b.x), ez = b.hz + pr - Math.abs(lz - b.z);
      if (ex > 0 && ez > 0) { if (ex < ez) lx = b.x + Math.sign(lx - b.x || 1) * (b.hx + pr); else lz = b.z + Math.sign(lz - b.z || 1) * (b.hz + pr); } });
    if (lx !== ox || lz !== oz) { const [wx, wz] = toWorld(lx, lz); pos.x = wx; pos.z = wz; }
  }
  function inside(pos) { const [lx, lz] = toLocal(pos.x, pos.z); return Math.abs(lx) < L.W - .1 && Math.abs(lz) < L.D - .1; }

  // ---------- 旁边有什么可以按 E ----------
  const fmt = sec => sec < 60 ? Math.ceil(sec) + ' 秒' : sec < 3600 ? Math.ceil(sec / 60) + ' 分钟' : (sec / 3600).toFixed(1) + ' 小时';
  function nearThing(pos) {
    const [lx, lz] = toLocal(pos.x, pos.z), fl = floorOf(pos.y);
    const best = things.filter(t => t.floor === fl || t.kind === 'door').map(t => ({ t, d: Math.hypot(lx - t.x, lz - t.z) - (t.kind === 'door' ? .5 : 0) }))
      .filter(o => o.d < 1.3 && (o.t.kind !== 'door' || fl === 0)).sort((a, b) => a.d - b.d)[0];
    return best ? best.t : null;
  }
  const lightOf = t => lights.find(l => l.id === t.id);
  const roomOn = room => !!st.lights[room];
  const DOOR_TEXT = { rope: '薄木板门，用草绳拴着 —— 不太安全', latch: '实木门 + 铁插销 —— 比草绳结实', arch: '拱形木门 + 钥匙锁 —— 要撞很久才撞得开', double: '包铁皮的双开门 + 门铃 —— 很难撞开', grand: '大拱门 + 密码锁 + 警铃 —— 几乎撞不开' };
  function describe(t, item) {
    if (t.kind === 'door') {
      const locked = !!st.doors.lock, open = doors[0].ang > .5;
      if (item === 'key') return locked ? { label: '🔓 用钥匙开锁', sub: '这是你自己家的钥匙', can: true } : { label: open ? '🔒 关门、上锁' : '🔒 上锁', sub: '锁上以后，没有钥匙就开不了门', can: true };
      if (locked) return { label: '🔒 门锁着', sub: '选中背包里的 🔑 钥匙，再按 E 开锁', can: false };
      return { label: open ? '🚪 关门' : '🚪 开门', sub: DOOR_TEXT[L.door.style] + ' · 选中 🔑 钥匙可以上锁', can: true };
    }
    if (t.kind === 'cabinet') return { label: `🗄️ 打开${t.name}`, sub: `${t.name}：${cabinet.cap} 格`, can: true };
    if (t.kind === 'safe') return { label: '🔐 打开保险箱', sub: '保险箱：12 格 —— 别人破门也偷不走', can: true };
    if (t.kind === 'bed') return { label: `🛏️ 在${t.name}上睡觉`, sub: `睡觉回体力（${t.name}：每分钟 +${Math.round((BED_RATE[t.type] || .06) * 60)}）· 时间照常走`, can: true };
    if (t.kind === 'stove') return { label: '🍳 灶台', sub: '做饭的玩法以后再做', can: false };
    if (t.kind === 'greenhouse') return { label: '🌱 温室', sub: '冬天也能种菜（和天气一起做）', can: false };
    if (t.kind === 'switch') return { label: roomOn(t.room) ? '💡 关灯' : '💡 开灯', sub: `电灯不会烧完 · 电费：每盏开 1 小时 ${POWER_RATE} 菜币（已经交了 ${st.paid || 0} 菜币）`, can: true };
    if (t.kind === 'fire') return { label: st.lights.fire ? '🔥 把壁炉的火灭掉' : '🔥 点壁炉', sub: '又亮又暖', can: true };
    if (t.kind === 'candle') {
      const l = lightOf(t), left = st.candles[t.id] || 0, oil = l && l.kind === 'oil', need = oil ? 'oil' : 'candle', nm = oil ? '灯油' : '蜡烛';
      if (left > 0) return { label: oil ? '🪔 油灯在亮' : '🕯️ 蜡烛在烧', sub: `还能${oil ? '亮' : '烧'} ${fmt(left)}`, can: false };
      return item === need ? { label: oil ? '🪔 加灯油' : '🕯️ 点上一根新蜡烛', sub: `${nm}烧完了`, can: true } : { label: oil ? '🪔 油灯没油了' : '🕯️ 蜡烛烧完了', sub: `选中背包里的${nm}，再按 E`, can: false };
    }
  }
  function act(t, item, bag) {
    if (t.kind === 'door') {
      if (item === 'key') {
        if (st.doors.lock) { st.doors.lock = false; persist(); return { msg: '🔓 开锁了' }; }
        st.doors.lock = true; st.doors.front = false; persist(); return { msg: '🔒 门锁上了' };
      }
      if (st.doors.lock) return { msg: '🔒 门锁着 —— 选中 🔑 钥匙再按 E' };
      st.doors.front = !(doors[0].ang > .5); persist(); return { msg: st.doors.front ? '🚪 门开了' : '🚪 门关上了' };
    }
    if (t.kind === 'cabinet') return { open: 'cabinet' };
    if (t.kind === 'safe') return { open: 'safe' };
    if (t.kind === 'bed') { const [wx, wz] = toWorld(t.bx, t.bz); return { sleep: { name: t.name, top: { bedStraw: .7, bedWood: .82, bedSoft: .97, bedDouble: 1, bedCanopy: 1.1 }[t.type] || .8, rate: BED_RATE[t.type] || .06, x: wx, z: wz, y: t.by, yaw: plot.rot + t.ry } }; }
    if (t.kind === 'switch') { if (!roomOn(t.room) && wallet && wallet.get() < 1 && (st.bill || 0) > 0) return { msg: '⚡ 没有菜币交电费，灯开不了' }; st.lights[t.room] = !roomOn(t.room); persist(); return { msg: st.lights[t.room] ? '💡 灯开了' : '💡 灯关了' }; }
    if (t.kind === 'fire') { st.lights.fire = !st.lights.fire; persist(); return { msg: st.lights.fire ? '🔥 壁炉点起来了' : '🔥 火灭了' }; }
    if (t.kind === 'candle') {
      const l = lightOf(t), oil = l && l.kind === 'oil', need = oil ? 'oil' : 'candle';
      if ((st.candles[t.id] || 0) > 0) return { msg: oil ? '🪔 油灯还亮着' : '🕯️ 这根蜡烛还在烧' };
      if (item !== need || !bag.take(need)) return { msg: oil ? '没有灯油了，去小卖部买' : '没有蜡烛了，去小卖部买' };
      st.candles[t.id] = oil ? OIL_LIFE : CANDLE_LIFE; persist(); return { msg: oil ? '🪔 加好灯油了' : '🕯️ 点上了新蜡烛' };
    }
    const d = describe(t, item); return { msg: d.sub };
  }

  // ---------- 每一帧 ----------
  let t0 = 0, saveT = 0, roofFade = 1, upFade = 1;
  function update(dt, playerPos, firstPerson = false) {
    t0 += dt;
    doors.forEach(d => { d.lock.visible = !!st.doors.lock; const target = st.doors[d.id] ? 1 : 0; d.ang += (target - d.ang) * Math.min(1, dt * 6);
      d.leaves.forEach((p, i) => p.rotation.y = (d.leaves.length > 1 ? (i ? 1 : -1) : -1) * d.ang * 1.6); });
    const dark = darkness();
    for (const k in st.candles) st.candles[k] = Math.max(0, st.candles[k] - dt);   // 管理员的加速只加速菜，不加速蜡烛
    let powered = 0;
    lights.forEach((l, i) => {
      let on = false, pow = l.power;
      if (l.kind === 'candle') { const max = CANDLE_LIFE, left = (st.candles[l.id] || 0) / max; on = left > 0;
        l.wax.scale.y = .04 + .26 * Math.max(.05, left); l.wax.position.y = 1.94 + l.wax.scale.y / 2;
        l.flame.visible = on; l.flame.position.y = l.wax.position.y + l.wax.scale.y / 2 + .06; l.flame.scale.set(1 + Math.sin(t0 * 17 + i) * .12, 1 + Math.sin(t0 * 11 + i * 2) * .2, 1);
        pow *= 1 + Math.sin(t0 * 13 + i) * .12; }
      else if (l.kind === 'oil') { on = (st.candles[l.id] || 0) > 0; l.bulb.material.emissiveIntensity = on ? 1.2 : 0; pow *= 1 + Math.sin(t0 * 9 + i) * .06; }
      else if (l.kind === 'electric') { on = roomOn(l.room); const em = on ? 1.6 : 0; (l.bulb.isMesh ? [l.bulb] : l.bulb.children).forEach(b => b.material.emissiveIntensity = em); }
      else if (l.kind === 'fire') { on = !!st.lights.fire; l.flame.forEach((f, k) => { f.visible = on; f.scale.set(1 + Math.sin(t0 * 12 + k) * .15, 1 + Math.sin(t0 * 9 + k * 2) * .25, 1); }); pow *= 1 + Math.sin(t0 * 11) * .15 + Math.sin(t0 * 23) * .08; }
      else if (l.kind === 'auto') { on = dark > .3; l.bulb.material.emissiveIntensity = on ? 2 : 0; }
      l.light.intensity = on ? pow : 0;
      if (on && (l.kind === 'electric' || l.kind === 'auto')) powered++;
    });
    // 人在屋里：屋顶变透明；在一楼时二楼也变透明，好看到屋里
    const ins = playerPos && inside(playerPos) && !firstPerson, fl = playerPos ? floorOf(playerPos.y) : 0;
    roofFade += ((ins ? 0 : 1) - roofFade) * Math.min(1, dt * 5);
    upFade += ((ins && fl === 0 ? 0 : 1) - upFade) * Math.min(1, dt * 5);
    roof.traverse(o => { if (o.isMesh) { o.material.opacity = o.userData.smoke !== undefined ? .55 * roofFade : roofFade; o.castShadow = roofFade > .5; } });
    roof.visible = roofFade > .05;
    upper.traverse(o => { if (o.isMesh && o.material) { o.material.opacity = upFade; o.castShadow = upFade > .5; } });
    upper.visible = upFade > .05;
    roof.children.forEach(o => { if (o.userData.smoke !== undefined) { const k = o.userData.smoke; o.position.y += dt * .5; o.scale.multiplyScalar(1 + dt * .2); if (o.position.y > fyNow() + 12) { o.position.y -= 2; o.scale.setScalar(.35 + k * .15); } } });
    // 电费：按开着的电灯数慢慢累计，攒够 1 菜币扣一次；没钱了就停电
    if (powered && wallet) {
      st.bill = (st.bill || 0) + powered * POWER_RATE * dt / 3600;
      if (st.bill >= 1) {
        const n = Math.floor(st.bill);
        if (wallet.spend(n)) { st.bill -= n; st.paid = (st.paid || 0) + n; }
        else { st.lights = {}; persist(); notify('⚡ 菜币不够交电费，停电了'); }
      }
    }
    saveT += dt; if (saveT > 3) { saveT = 0; persist(); }
  }

  const debug = {
    giveCandles(bag) { const ok = bag.add('candle', 3); persist(); return ok; },
    setLevel(l) { st.level = l; build(); persist(); },
    get level() { return st.level; },
    bill(v) { st.bill = v; },   // 测试用
  };
  build();
  return { update, collide, inside, groundAt, floorOf, nearThing, describe, act, cabinet, safe, persist, debug,
    get level() { return st.level; }, get name() { return HOUSE_NAMES[st.level]; },
    doorWorld: () => toWorld(L.door.x, L.D + 1.4) };
}
