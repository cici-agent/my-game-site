// ===== 菜鸟家园 · 房子（先做最低级：小木棚） =====
// 用户定的：木头小棚子；里面一张低级的床（稻草床）、一扇不太安全的门（草绳拴着）、一个柜子、几个放蜡烛的地方；
// 蜡烛会烧完，烧完要再买（商店以后做，现在管理员面板可以送蜡烛）
import * as THREE from 'three';
import { createBag, plotToWorld, worldToPlot } from './garden.js';

// 小木棚在空地里的位置（空地自己的坐标：门朝 +z，也就是朝路那边）
const HW = 2.6, HD = 2.25, WALL_H = 2.3, DOOR_W = 1.0, DOOR_H = 1.95;
const SC = 1.35;   // 整个小木棚放大 1.35 倍：人能舒服地走进去，但和人比还是小小的（里面约 7×6 米，墙高 3.1 米）
export function houseSpot(plot) { return { x: 0, z: -3 }; }
export function inHouse(plot, x, z, m = 0) {
  const c = houseSpot(plot), [lx, lz] = worldToPlot(plot, x, z);
  return Math.abs(lx - c.x) < HW * SC + m && Math.abs(lz - c.z) < HD * SC + m;
}

const CANDLE_LIFE = 3 * 3600;      // 一根蜡烛能烧 3 小时（按游戏时间算，管理员加速时也会烧得快）

// ---------- 贴图：木板、稻草 ----------
function tex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const plankTex = tex(64, 256, (g, w, h) => {
  g.fillStyle = '#a7713c'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 40; i++) { g.strokeStyle = `rgba(${70 + Math.random() * 40},${40 + Math.random() * 20},15,${.15 + Math.random() * .2})`; g.lineWidth = 1 + Math.random() * 2; const x = Math.random() * w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 6, h * .3, x - 6, h * .6, x + 3, h); g.stroke(); }
  for (let i = 0; i < 3; i++) { const y = Math.random() * h, x = 10 + Math.random() * 44; g.fillStyle = 'rgba(60,30,10,.45)'; g.beginPath(); g.ellipse(x, y, 4, 7, 0, 0, Math.PI * 2); g.fill(); }
});
const strawTex = tex(128, 128, (g, w, h) => {
  g.fillStyle = '#d8b25a'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 260; i++) { const x = Math.random() * w, y = Math.random() * h, l = 10 + Math.random() * 26;
    g.strokeStyle = ['#f0d17a', '#b88a35', '#e6c066', '#9c7428'][i % 4]; g.lineWidth = 1 + Math.random() * 1.5;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (Math.random() - .5) * 6, y + l); g.stroke(); }
});
const dirtTex = tex(128, 128, (g, w, h) => {
  g.fillStyle = '#8a6a45'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${60 + Math.random() * 60},${40 + Math.random() * 40},20,.35)`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
  for (let i = 0; i < 40; i++) { g.strokeStyle = 'rgba(230,200,110,.6)'; const x = Math.random() * w, y = Math.random() * h; g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6, y + 2); g.stroke(); }
});
const M = (o) => new THREE.MeshStandardMaterial({ roughness: .9, ...o });

export function createHouse({ scene, plot, rnd = Math.random, save = true, speed = () => 1 }) {
  const spot = houseSpot(plot);
  const group = new THREE.Group(); group.position.set(plot.x, 0, plot.z); group.rotation.y = plot.rot; scene.add(group);
  const root = new THREE.Group(); root.position.set(spot.x, 0, spot.z); root.scale.setScalar(SC); group.add(root);
  const toWorld = (lx, lz) => plotToWorld(plot, spot.x + lx * SC, spot.z + lz * SC);
  const toLocal = (x, z) => { const [a, b] = worldToPlot(plot, x, z); return [(a - spot.x) / SC, (b - spot.z) / SC]; };
  const add = (geo, mat, p, s, r, parent = root) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); if (s) m.scale.set(...s); if (r) m.rotation.set(...r); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 10), SPH = new THREE.SphereGeometry(1, 12, 8);

  // ---------- 存档：柜子里的东西、蜡烛还能烧多久、门开没开 ----------
  const KEY = 'xcn_house_v1';
  let st = null;
  try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (!st) st = { level: 1, cabinet: [{ key: 'candle', n: 3 }], candles: [CANDLE_LIFE, CANDLE_LIFE * .6], door: false, t: Date.now() };
  const cabinet = createBag(9, 50);   // 小木柜：9 格
  cabinet.slots = (st.cabinet || []).slice(0, 9).map(x => x || null);
  // 下线的时间里蜡烛也在烧
  { const away = Math.max(0, (Date.now() - (st.t || Date.now())) / 1000); st.candles = st.candles.map(c => Math.max(0, c - away)); }
  function persist() { if (!save) return; st.cabinet = cabinet.slots; st.t = Date.now(); try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }

  // ---------- 地面：踩实的泥土地，门口一块木台阶 ----------
  add(new THREE.PlaneGeometry(HW * 2, HD * 2), M({ map: dirtTex, polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -24 }), [0, .03, 0], null, [-Math.PI / 2, 0, 0]).castShadow = false;
  add(BOX, M({ map: plankTex, color: 0x9a6a3a }), [0, .07, HD + .45], [1.4, .14, .7]);

  // ---------- 木板墙：一块块竖着的木板，长短颜色有点不一样，有些板之间有缝 ----------
  const plankMats = [M({ map: plankTex, color: 0xffffff }), M({ map: plankTex, color: 0xd9c0a0 }), M({ map: plankTex, color: 0xc4a07a })];
  const walls = [];   // 碰撞用：{ ax, az, bx, bz, gaps: [[t0, t1]] }
  // 一面墙：从 (ax,az) 到 (bx,bz)；holes：[[t0, t1, y0, y1]] 这段（沿墙的长度）在 y0~y1 之间不放木板（门、窗）
  function wall(ax, az, bx, bz, holes = []) {
    const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax), PW = .27;
    for (let t = PW / 2; t < len; t += PW + (rnd() < .18 ? .025 : .004)) {
      const x = ax + (bx - ax) * t / len, z = az + (bz - az) * t / len, top = WALL_H + (rnd() - .5) * .12;
      const hole = holes.find(([t0, t1]) => t > t0 && t < t1);
      const segs = hole ? [[0, hole[2]], [hole[3], top]] : [[0, top]];
      segs.forEach(([y0, y1]) => { if (y1 - y0 < .05) return;
        add(BOX, plankMats[Math.floor(rnd() * 3)], [x, (y0 + y1) / 2, z], [PW - .01, y1 - y0, .07 + rnd() * .02], [0, -ang, (rnd() - .5) * .025]); });
    }
    // 里外各两根横木条把木板钉在一起
    [.35, 1.75].forEach(y => add(BOX, plankMats[2], [(ax + bx) / 2, y, (az + bz) / 2], [len, .1, .04], [0, -ang, 0]).translateZ(.06));
    walls.push({ ax, az, bx, bz, holes });
  }
  const DOOR_T0 = HW - DOOR_W / 2 - .15, DOOR_T1 = HW + DOOR_W / 2 + .15;   // 前墙从左往右，门在正中间
  wall(-HW, HD, HW, HD, [[DOOR_T0, DOOR_T1, 0, DOOR_H]]);              // 前墙（门）
  wall(HW, HD, HW, -HD, [[1.2, 2.2, 1.0, 1.65]]);                        // 右墙（小窗）
  wall(HW, -HD, -HW, -HD);                                               // 后墙
  wall(-HW, -HD, -HW, HD);                                               // 左墙
  // 四个角的粗木桩
  const logM = M({ color: 0x7a5230 });
  [[-HW, -HD], [HW, -HD], [HW, HD], [-HW, HD]].forEach(([x, z]) => add(CYL, logM, [x, WALL_H / 2 + .05, z], [.13, WALL_H + .1, .13]));
  // 门框上面的横木
  add(BOX, logM, [0, DOOR_H + .08, HD], [DOOR_W + .5, .14, .14]);
  // 小窗：没有玻璃，一块歪着挂的木板挡着
  add(BOX, logM, [HW, 1.68, -.95 + HD - 2.2 + .5], [.14, .08, 1.1]);
  const shutter = add(BOX, plankMats[1], [HW + .1, 1.25, -.4], [.05, .62, .5], [0, 0, .12]);
  shutter.rotation.y = .25;

  // ---------- 茅草屋顶 ----------
  const roof = new THREE.Group(); root.add(roof);
  const OV = .45, RISE = 1.35, slope = Math.hypot(HD + OV, RISE);
  const strawM = M({ map: strawTex, color: 0xffffff, side: THREE.DoubleSide });
  [-1, 1].forEach(s => {
    const half = new THREE.Mesh(new THREE.BoxGeometry(HW * 2 + OV * 2, .22, slope), strawM);
    half.position.set(0, WALL_H + RISE / 2, s * (HD + OV) / 2); half.rotation.x = s * Math.atan2(RISE, HD + OV); half.castShadow = true; half.receiveShadow = true; roof.add(half);
    // 屋檐垂下来的一缕缕稻草
    for (let k = 0; k < 34; k++) {
      const x = -HW - OV + (k + .5) * (HW * 2 + OV * 2) / 34;
      const tuft = new THREE.Mesh(new THREE.ConeGeometry(.08, .32 + rnd() * .15, 4), M({ color: rnd() < .5 ? 0xd8b25a : 0xc49a44 }));
      tuft.position.set(x, WALL_H - .12 - rnd() * .05, s * (HD + OV + .02)); tuft.rotation.x = Math.PI; roof.add(tuft);
    }
  });
  const ridge = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, HW * 2 + OV * 2 + .2, 8), logM); ridge.rotation.z = Math.PI / 2; ridge.position.y = WALL_H + RISE + .05; ridge.castShadow = true; roof.add(ridge);
  // 两头的三角形山墙（木板）
  [-1, 1].forEach(s => {
    const shape = new THREE.Shape(); shape.moveTo(-HD, 0); shape.lineTo(HD, 0); shape.lineTo(0, RISE); shape.lineTo(-HD, 0);
    const gable = new THREE.Mesh(new THREE.ShapeGeometry(shape), M({ map: plankTex, color: 0xd9c0a0, side: THREE.DoubleSide }));
    gable.rotation.y = Math.PI / 2; gable.position.set(s * HW, WALL_H, 0); roof.add(gable);
  });
  roof.traverse(o => { if (o.isMesh) { o.material = o.material.clone(); o.material.transparent = true; } });

  // ---------- 草绳拴着的薄木门（不太安全） ----------
  const doorPivot = new THREE.Group(); doorPivot.position.set(-DOOR_W / 2, 0, HD); root.add(doorPivot);
  for (let k = 0; k < 3; k++) add(BOX, plankMats[k % 3], [DOOR_W / 6 + k * DOOR_W / 3, DOOR_H / 2, 0], [DOOR_W / 3 - .015, DOOR_H - .04, .05], null, doorPivot);
  [.35, 1.55].forEach(y => add(BOX, plankMats[2], [DOOR_W / 2, y, .045], [DOOR_W - .06, .1, .03], null, doorPivot));
  add(BOX, plankMats[2], [DOOR_W / 2, .95, .045], [.08, 1.35, .03], [0, 0, .62], doorPivot);   // 斜撑（Z 字）
  const rope = add(new THREE.TorusGeometry(.07, .015, 6, 14), M({ color: 0xcfae6e }), [DOOR_W - .1, 1.0, .08], null, [0, Math.PI / 2, 0], doorPivot);
  let doorAng = st.door ? -1.6 : 0;

  // ---------- 屋里：稻草床、小木柜、两个烛台 ----------
  // 稻草床（左后角）
  const bed = new THREE.Group(); bed.position.set(-HW + 1.05, 0, -HD + .75); root.add(bed);
  add(BOX, logM, [0, .12, 0], [1.9, .24, 1.1], null, bed);
  add(BOX, M({ map: strawTex, color: 0xffffff }), [0, .33, 0], [1.8, .2, 1.0], null, bed);
  add(BOX, M({ color: 0x8c6a4a }), [.25, .45, .05], [1.1, .05, .95], [0, 0, .02], bed);   // 粗布毯子
  add(SPH, M({ map: strawTex, color: 0xf0e2c0 }), [-.68, .48, 0], [.28, .1, .38], null, bed);   // 枕头
  // 小木柜（右后角）
  const cab = new THREE.Group(); cab.position.set(HW - .65, 0, -HD + .45); root.add(cab);
  add(BOX, M({ map: plankTex, color: 0xb98a55 }), [0, .55, 0], [.95, 1.1, .55], null, cab);
  add(BOX, M({ map: plankTex, color: 0x8f6034 }), [0, 1.12, 0], [1.02, .06, .6], null, cab);
  [-1, 1].forEach(s => { add(BOX, M({ map: plankTex, color: 0xa27445 }), [s * .23, .55, .285], [.43, .95, .03], null, cab); add(SPH, M({ color: 0x3a3a3a, metalness: .6 }), [s * .06, .6, .31], [.03, .03, .03], null, cab); });
  // 烛台：墙上的铁架子 + 蜡烛（越烧越短）+ 火苗 + 灯光
  const holders = [[-HW + .12, 1.45, -.2, Math.PI / 2], [-.9, 1.45, -HD + .12, 0]].map(([x, y, z, ry], i) => {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; root.add(g);
    add(BOX, M({ color: 0x2d2d2d, metalness: .5 }), [0, 0, .12], [.04, .04, .24], null, g);
    add(CYL, M({ color: 0x2d2d2d, metalness: .5 }), [0, .02, .24], [.08, .03, .08], null, g);
    const wax = add(CYL, M({ color: 0xfaf3df, roughness: .6 }), [0, .14, .24], [.035, .22, .035], null, g);
    const flame = new THREE.Mesh(new THREE.ConeGeometry(.03, .09, 8), new THREE.MeshBasicMaterial({ color: 0xffc04d })); flame.position.set(0, .3, .24); g.add(flame);
    const light = new THREE.PointLight(0xffb45a, 0, 9, 1.4); light.position.set(0, .35, .3); g.add(light);
    return { g, wax, flame, light, i, local: [x + Math.sin(ry) * .3, z + Math.cos(ry) * .3] };
  });

  // ---------- 碰撞：墙、关着的门、床、柜子 ----------
  const solids = [ // 屋里的家具（本地坐标的方块）
    { x: bed.position.x, z: bed.position.z, hx: .95, hz: .55 },
    { x: cab.position.x, z: cab.position.z, hx: .5, hz: .3 },
  ];
  function collide(pos, pr0 = .45) {
    const pr = pr0 / SC;
    if (pos.y > WALL_H * SC) return;
    let [lx, lz] = toLocal(pos.x, pos.z);
    if (Math.abs(lx) > HW + 2 || Math.abs(lz) > HD + 2) return;
    const ox = lx, oz = lz;
    const doorOpen = doorAng < -1;
    // 前墙 / 后墙（沿 x）
    [[HD, true], [-HD, false]].forEach(([wz, front]) => {
      if (Math.abs(lx) > HW + pr) return;
      if (front && Math.abs(lx) < DOOR_W / 2 - .05 && doorOpen) return;   // 门开着可以走过去
      if (Math.abs(lz - wz) < pr) lz = wz + (lz >= wz ? pr : -pr);
    });
    // 左墙 / 右墙（沿 z）
    [HW, -HW].forEach(wx => { if (Math.abs(lz) > HD + pr) return; if (Math.abs(lx - wx) < pr) lx = wx + (lx >= wx ? pr : -pr); });
    solids.forEach(b => { const dx = lx - b.x, dz = lz - b.z, ox2 = b.hx + pr - Math.abs(dx), oz2 = b.hz + pr - Math.abs(dz);
      if (ox2 > 0 && oz2 > 0) { if (ox2 < oz2) lx = b.x + Math.sign(dx || 1) * (b.hx + pr); else lz = b.z + Math.sign(dz || 1) * (b.hz + pr); } });
    if (lx !== ox || lz !== oz) { const [wx, wz] = toWorld(lx, lz); pos.x = wx; pos.z = wz; }
  }
  function inside(pos) { const [lx, lz] = toLocal(pos.x, pos.z); return Math.abs(lx) < HW - .1 && Math.abs(lz) < HD - .1; }

  // ---------- 旁边有什么可以按 E ----------
  const fmt = sec => sec < 60 ? Math.ceil(sec) + ' 秒' : sec < 3600 ? Math.ceil(sec / 60) + ' 分钟' : (sec / 3600).toFixed(1) + ' 小时';
  function nearThing(pos) {
    const [lx, lz] = toLocal(pos.x, pos.z), d = (x, z) => Math.hypot(lx - x, lz - z);
    const list = [];
    list.push({ kind: 'door', d: d(0, HD) - .4 });   // 门口范围大一点，里外都能开
    list.push({ kind: 'cabinet', d: d(cab.position.x, cab.position.z + .6) });
    holders.forEach(h => list.push({ kind: 'candle', h, d: d(h.local[0], h.local[1]) }));
    list.push({ kind: 'bed', d: d(bed.position.x, bed.position.z + .2) - .5 });
    const best = list.filter(t => t.d < 1.3).sort((a, b) => a.d - b.d)[0];
    return best || null;
  }
  function describe(t, item) {
    if (t.kind === 'door') return { label: doorAng < -1 ? '🚪 关门' : '🚪 开门', sub: '薄木板门，用草绳拴着 —— 不太安全', can: true };
    if (t.kind === 'cabinet') return { label: '🗄️ 打开小木柜', sub: '小木柜：9 格', can: true };
    if (t.kind === 'bed') return { label: '🛏️ 稻草床', sub: '低级的床（睡觉的玩法以后再做）', can: false };
    if (t.kind === 'candle') {
      const left = st.candles[t.h.i];
      if (left > 0) return { label: '🕯️ 蜡烛在烧', sub: `还能烧 ${fmt(left / speed())}`, can: false };
      return item === 'candle' ? { label: '🕯️ 点上一根新蜡烛', sub: '蜡烛烧完了', can: true } : { label: '🕯️ 蜡烛烧完了', sub: '选中背包里的蜡烛，再按 E 点上新的', can: false };
    }
  }
  // 返回给玩家看的一句话；{ open: 'cabinet' } 表示要打开柜子
  function act(t, item, bag) {
    if (t.kind === 'door') { st.door = !(doorAng < -1); persist(); return { msg: st.door ? '🚪 门开了' : '🚪 门关上了，用草绳拴好' }; }
    if (t.kind === 'cabinet') return { open: 'cabinet' };
    if (t.kind === 'candle') {
      if (st.candles[t.h.i] > 0) return { msg: '🕯️ 这根蜡烛还在烧' };
      if (item !== 'candle' || !bag.take('candle')) return { msg: '没有蜡烛了，要再去买' };
      st.candles[t.h.i] = CANDLE_LIFE; persist(); return { msg: '🕯️ 点上了新蜡烛' };
    }
    if (t.kind === 'bed') return { msg: '🛏️ 稻草床：睡觉的玩法以后再做' };
  }

  // ---------- 每一帧 ----------
  let t0 = 0, saveT = 0, roofFade = 1;
  function update(dt, playerPos) {
    t0 += dt;
    // 门慢慢转开 / 关上
    const target = st.door ? -1.6 : 0; doorAng += (target - doorAng) * Math.min(1, dt * 6); doorPivot.rotation.y = doorAng;
    // 蜡烛：越烧越短；烧完就灭
    st.candles = st.candles.map(c => Math.max(0, c - dt * speed()));
    holders.forEach(h => {
      const left = st.candles[h.i] / CANDLE_LIFE, on = left > 0;
      h.wax.scale.y = .03 + .22 * Math.max(.05, left); h.wax.position.y = .035 + h.wax.scale.y / 2;
      h.flame.visible = on; h.flame.position.y = h.wax.position.y + h.wax.scale.y / 2 + .045;
      h.flame.scale.set(1 + Math.sin(t0 * 17 + h.i) * .12, 1 + Math.sin(t0 * 11 + h.i * 2) * .2, 1);
      h.light.intensity = on ? 2.2 + Math.sin(t0 * 13 + h.i) * .35 + Math.sin(t0 * 7.3) * .2 : 0;
    });
    // 人在屋里：屋顶慢慢变透明，好看到屋里
    const want = playerPos && inside(playerPos) ? 0 : 1;
    roofFade += (want - roofFade) * Math.min(1, dt * 5);
    roof.traverse(o => { if (o.isMesh) o.material.opacity = roofFade; });
    roof.visible = roofFade > .05;
    roof.traverse(o => { if (o.isMesh) o.castShadow = roofFade > .5; });   // 透明的屋顶不要再投影子
    saveT += dt; if (saveT > 3) { saveT = 0; persist(); }
  }

  const debug = { giveCandles(bag) { const ok = bag.add('candle', 3); persist(); return ok; } };
  return { update, collide, inside, nearThing, describe, act, cabinet, persist, debug, doorWorld: () => toWorld(0, HD + 1.2) };
}
