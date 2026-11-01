// ===== 鬼屋（大迷宫，自己走）=====
// 里面很黑、看不远；只有自己的脚步声；走到某些地方会突然冒出东西。找到出口才能出来。
// 迷宫是固定的（大家一样），从入口到出口的必经之路上放了 7 个“惊吓点”。
import * as THREE from 'three';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .85, ...o });
const add = (p, geo, mat, pos = [0, 0, 0], rot = null, sc = null) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if (rot) m.rotation.set(...rot); if (sc) m.scale.set(...sc); p.add(m); return m; };
function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const CW = 9, CH = 7, S = 3.4, WH = 4.2, WT = .3;           // 格子数、格子大小、墙高、墙厚
const W = CW * S, D = CH * S;

export function hauntedMansion(cx, cz, rotY = 0) {
  const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = rotY;
  const cos = Math.cos(rotY), sin = Math.sin(rotY);
  const toLocal = (x, z) => { const dx = x - cx, dz = z - cz; return [dx * cos - dz * sin, dx * sin + dz * cos]; };
  const toWorld = (lx, lz) => [cx + lx * cos + lz * sin, cz - lx * sin + lz * cos];
  const cellC = (i, j) => [-W / 2 + S * (i + .5), -D / 2 + S * (j + .5)];

  // ---------- 迷宫（固定种子，大家一样） ----------
  const r = seeded(20261101);
  const vW = Array.from({ length: CH }, () => Array(CW + 1).fill(true));   // 竖墙：cell(i,j) 左边是 vW[j][i]
  const hW = Array.from({ length: CH + 1 }, () => Array(CW).fill(true));   // 横墙：cell(i,j) 上边是 hW[j][i]
  const seen = Array.from({ length: CH }, () => Array(CW).fill(false));
  (function dfs(i, j) {
    seen[j][i] = true;
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]].sort(() => r() - .5);
    for (const [di, dj] of dirs) { const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= CW || nj >= CH || seen[nj][ni]) continue;
      if (di === 1) vW[j][i + 1] = false; if (di === -1) vW[j][i] = false; if (dj === 1) hW[j + 1][i] = false; if (dj === -1) hW[j][i] = false; dfs(ni, nj); }
  })(0, CH - 1);
  for (let k = 0; k < 7; k++) { const i = 1 + Math.floor(r() * (CW - 2)), j = 1 + Math.floor(r() * (CH - 2)); if (r() < .5) vW[j][i] = false; else hW[j][i] = false; }   // 多开几个口，有岔路
  const ENT = [1, CH - 1], EXIT = [CW - 2, 0];
  hW[CH][ENT[0]] = false; hW[0][EXIT[0]] = false;           // 入口（前墙）、出口（后墙）
  // 从入口到出口的路（BFS）
  const path = (() => { const prev = {}, q = [ENT], key = (i, j) => i + ',' + j; prev[key(...ENT)] = null;
    while (q.length) { const [i, j] = q.shift(); if (i === EXIT[0] && j === EXIT[1]) break;
      [[1, 0, () => !vW[j][i + 1]], [-1, 0, () => !vW[j][i]], [0, 1, () => !hW[j + 1][i]], [0, -1, () => !hW[j][i]]].forEach(([di, dj, open]) => {
        const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= CW || nj >= CH || !open() || key(ni, nj) in prev) return; prev[key(ni, nj)] = [i, j]; q.push([ni, nj]); }); }
    const out = []; let c = EXIT; while (c) { out.unshift(c); c = prev[c[0] + ',' + c[1]]; } return out; })();

  // ---------- 墙、地板、天花板 ----------
  const wallTex = tex(128, 128, (c, w, h) => { c.fillStyle = '#2a2135'; c.fillRect(0, 0, w, h); for (let x = 0; x < w; x += 16) { c.fillStyle = x % 32 ? '#251d30' : '#30263f'; c.fillRect(x, 0, 8, h); }
    c.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 30; i++) c.fillRect(Math.random() * w, Math.random() * h, 2 + Math.random() * 6, 1 + Math.random() * 10); });
  wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping; wallTex.repeat.set(1, 1.3);
  const wallM = new THREE.MeshStandardMaterial({ map: wallTex, roughness: .95 }), outM = M(0x4b3d63);
  const walls = [];                                           // 碰撞用：局部坐标的长方形 [x0, z0, x1, z1]
  const wallGeoH = new THREE.BoxGeometry(S + WT, WH, WT), wallGeoV = new THREE.BoxGeometry(WT, WH, S + WT);
  for (let j = 0; j <= CH; j++) for (let i = 0; i < CW; i++) if (hW[j][i]) {
    const x = -W / 2 + S * (i + .5), z = -D / 2 + S * j, outer = j === 0 || j === CH;
    add(g, wallGeoH, outer ? [outM, outM, outM, outM, wallM, wallM] : wallM, [x, WH / 2, z]); walls.push([x - S / 2 - WT / 2, z - WT / 2, x + S / 2 + WT / 2, z + WT / 2]);
  }
  for (let j = 0; j < CH; j++) for (let i = 0; i <= CW; i++) if (vW[j][i]) {
    const x = -W / 2 + S * i, z = -D / 2 + S * (j + .5), outer = i === 0 || i === CW;
    add(g, wallGeoV, outer ? [wallM, wallM, outM, outM, outM, outM] : wallM, [x, WH / 2, z]); walls.push([x - WT / 2, z - S / 2 - WT / 2, x + WT / 2, z + S / 2 + WT / 2]);
  }
  const floorTex = tex(64, 64, (c, w, h) => { c.fillStyle = '#2a1e18'; c.fillRect(0, 0, w, h); c.fillStyle = '#21170f'; for (let y = 0; y < h; y += 8) c.fillRect(0, y, w, 1); });
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(W / 4, D / 4);
  add(g, new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 1 }), [0, .03, 0], [-Math.PI / 2, 0, 0]);
  add(g, new THREE.PlaneGeometry(W, D), M(0x1a1422, { side: THREE.DoubleSide }), [0, WH, 0], [Math.PI / 2, 0, 0]);
  // 外观：屋顶、塔、发光窗户、招牌
  const roofM = M(0x231a2e);
  const roof = add(g, new THREE.ConeGeometry(Math.hypot(W, D) / 2 + 1, 6, 4), roofM, [0, WH + 3, 0], [0, Math.PI / 4, 0]); roof.scale.set(W / Math.hypot(W, D) * 1.42, 1, D / Math.hypot(W, D) * 1.42);
  [[-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2]].forEach(([x, z]) => { add(g, new THREE.CylinderGeometry(1.6, 1.8, WH + 6, 10), outM, [x, (WH + 6) / 2, z]); add(g, new THREE.ConeGeometry(2.3, 4, 10), roofM, [x, WH + 8, z]); });
  const winM = M(0x1a1422, { emissive: 0xff6b35, emissiveIntensity: .35 });
  for (let k = -3; k <= 3; k++) if (k !== -2 && k !== -3) add(g, new THREE.BoxGeometry(1.4, 1.7, .1), winM, [k * 3.6, 2.6, D / 2 + .2], [0, 0, (k % 2) * .08]);
  const sign = tex(640, 140, (c, w, h) => { c.fillStyle = '#1a1422'; c.beginPath(); c.roundRect(4, 4, w - 8, h - 8, 26); c.fill(); c.strokeStyle = '#8b0000'; c.lineWidth = 8; c.stroke();
    c.fillStyle = '#ffe3e3'; c.font = 'bold 64px "PingFang SC","Microsoft YaHei",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🏚️ 鬼屋 · 找到出口', w / 2, h / 2 + 3); });
  const [ex, ez] = cellC(ENT[0], ENT[1]);
  add(g, new THREE.PlaneGeometry(10, 2.2), new THREE.MeshBasicMaterial({ map: sign }), [ex + 3, WH + 1.4, D / 2 + .25]);
  // 门口的两盏昏暗的灯
  [-1.9, 1.9].forEach(dx => { const l = add(g, new THREE.SphereGeometry(.18, 8, 6), new THREE.MeshBasicMaterial({ color: 0xff922b }), [ex + dx, 3, D / 2 + .4]); l.userData.nightBulb = 0xff922b; });
  const [xx, xz] = cellC(EXIT[0], EXIT[1]);
  const exitSign = tex(256, 80, (c, w, h) => { c.fillStyle = '#2b8a3e'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 46px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('🚪 出口', w / 2, h / 2 + 2); });
  const noEntry = tex(320, 80, (c, w, h) => { c.fillStyle = '#c92a2a'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('⛔ 出口 · 不能进', w / 2, h / 2 + 2); });
  [-1, 1].forEach(s => { const m = add(g, new THREE.PlaneGeometry(s > 0 ? 2.2 : 2.8, .7), new THREE.MeshBasicMaterial({ map: s > 0 ? exitSign : noEntry }), [xx, WH - .6, -D / 2 + s * .2]); if (s > 0) m.rotation.y = 0; else m.rotation.y = Math.PI; });

  // ---------- 屋里的小装饰：蜡烛、画、蜘蛛网 ----------
  const candleM = new THREE.MeshBasicMaterial({ color: 0xffb347 });
  const candles = [];
  [[2, 5], [4, 2], [6, 4], [3, 0], [7, 1], [0, 3], [5, 6]].forEach(([i, j]) => { const [x, z] = cellC(i, j);
    const c = add(g, new THREE.CylinderGeometry(.07, .07, .4, 6), M(0xf1e3c8), [x + S * .35, .2, z + S * .35]); const f = add(c, new THREE.SphereGeometry(.06, 6, 6), candleM, [0, .26, 0]); candles.push(f); });
  const webM = new THREE.LineBasicMaterial({ color: 0x8e8e8e, transparent: true, opacity: .5 });
  for (let k = 0; k < 10; k++) { const i = Math.floor(r() * CW), j = Math.floor(r() * CH); const [x, z] = cellC(i, j); const x0 = x - S / 2 + .2, z0 = z - S / 2 + .2, pts = [];
    for (let q = 0; q < 5; q++) { const a = Math.PI / 2 * q / 4; pts.push(new THREE.Vector3(x0, WH - .1, z0), new THREE.Vector3(x0 + Math.cos(a) * 1.4, WH - .1 - Math.sin(a) * .9, z0 + Math.sin(a) * .2)); }
    g.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), webM)); }

  // ---------- 惊吓点 ----------
  const faceTex = tex(256, 320, (c, w, h) => {
    const gr = c.createRadialGradient(w / 2, h / 2, 20, w / 2, h / 2, w * .6); gr.addColorStop(0, '#f1f3f5'); gr.addColorStop(.7, '#ced4da'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = gr; c.beginPath(); c.ellipse(w / 2, h / 2, w * .42, h * .46, 0, 0, 7); c.fill();
    c.fillStyle = '#0b0b0b'; [[-1, 1]].forEach(() => {});
    [-1, 1].forEach(s => { c.beginPath(); c.ellipse(w / 2 + s * 52, h * .4, 30, 40, s * .2, 0, 7); c.fill(); c.fillStyle = '#ff2b2b'; c.beginPath(); c.arc(w / 2 + s * 52, h * .42, 6, 0, 7); c.fill(); c.fillStyle = '#0b0b0b'; });
    c.beginPath(); c.ellipse(w / 2, h * .74, 46, 54, 0, 0, 7); c.fill();
  });
  const S_ = {};
  // 1. 走廊尽头突然亮红光，出现一张脸
  S_.face = (() => { const m = add(g, new THREE.PlaneGeometry(2, 2.5), new THREE.MeshBasicMaterial({ map: faceTex, transparent: true }), [0, 1.9, 0]); m.visible = false;
    const l = new THREE.PointLight(0xff2020, 0, 9, 1.5); g.add(l); return { m, l }; })();
  // 2. 从天花板掉下来的大蜘蛛
  S_.spider = (() => { const sp = new THREE.Group(); const b = M(0x111111);
    add(sp, new THREE.SphereGeometry(.35, 12, 10), b); add(sp, new THREE.SphereGeometry(.25, 10, 8), b, [0, 0, .4]);
    [-1, 1].forEach(s => { add(sp, new THREE.SphereGeometry(.06, 6, 6), new THREE.MeshBasicMaterial({ color: 0xff2020 }), [s * .1, .08, .62]); for (let k = 0; k < 4; k++) add(sp, new THREE.CylinderGeometry(.03, .02, .9, 4), b, [s * .45, -.1, .2 - k * .18], [0, 0, s * (1.1 + k * .1)]); });
    const thread = add(sp, new THREE.CylinderGeometry(.01, .01, 6, 3), new THREE.MeshBasicMaterial({ color: 0x999999 }), [0, 3, 0]); void thread;
    sp.visible = false; g.add(sp); return sp; })();
  // 3. 身后的人影
  const shadowM = new THREE.MeshBasicMaterial({ color: 0x050505 });
  S_.behind = (() => { const f = new THREE.Group(); add(f, new THREE.CapsuleGeometry(.4, 1.5, 4, 10), shadowM, [0, 1.15, 0]); add(f, new THREE.SphereGeometry(.32, 10, 8), shadowM, [0, 2.25, 0]);
    [-1, 1].forEach(s => add(f, new THREE.SphereGeometry(.05, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffffff }), [s * .11, 2.3, .28])); f.visible = false; g.add(f); return f; })();
  // 4. 黑暗里很多发光的眼睛
  S_.eyes = (() => { const grp = new THREE.Group(), em = new THREE.MeshBasicMaterial({ color: 0xfff176 });
    for (let k = 0; k < 9; k++) { const p = new THREE.Group(); [-1, 1].forEach(s => add(p, new THREE.SphereGeometry(.05, 6, 6), em, [s * .1, 0, 0])); p.position.set((k % 3 - 1) * .9, .6 + Math.floor(k / 3) * .9, 0); p.userData.ph = k * 1.3; grp.add(p); }
    grp.visible = false; g.add(grp); return grp; })();
  // 5. 衣柜门突然打开，里面靠出来一具“骷髅”
  S_.wardrobe = (() => { const w = new THREE.Group(); add(w, new THREE.BoxGeometry(1.6, 3, .9), M(0x3d2b1f), [0, 1.5, 0]);
    const door = new THREE.Group(); door.position.set(-.78, 0, .47); w.add(door); add(door, new THREE.BoxGeometry(1.55, 2.8, .08), M(0x4a3426), [.78, 1.5, 0]);
    add(door, new THREE.SphereGeometry(.06, 6, 6), M(0xc9a227), [1.4, 1.5, .06]);
    const sk = new THREE.Group(); sk.position.set(0, 0, -.1); w.add(sk); const bone = M(0xe9e4d4);
    add(sk, new THREE.SphereGeometry(.28, 12, 10), bone, [0, 2.3, 0]); [-1, 1].forEach(s => add(sk, new THREE.SphereGeometry(.08, 8, 6), new THREE.MeshBasicMaterial({ color: 0x000000 }), [s * .1, 2.33, .24]));
    for (let k = 0; k < 4; k++) add(sk, new THREE.TorusGeometry(.22 - k * .02, .03, 4, 12), bone, [0, 1.8 - k * .18, 0], [Math.PI / 2, 0, 0]);
    [-1, 1].forEach(s => add(sk, new THREE.CylinderGeometry(.04, .04, .9, 4), bone, [s * .35, 1.5, .1], [0, 0, s * .3]));
    w.userData = { door, sk }; g.add(w); return w; })();
  // 6. 远处冲过来的白影
  S_.rush = (() => { const f = new THREE.Group(), wm = new THREE.MeshBasicMaterial({ color: 0xe9ecef, transparent: true, opacity: .85 });
    add(f, new THREE.SphereGeometry(.5, 14, 10), wm, [0, 1.9, 0]); add(f, new THREE.ConeGeometry(.6, 1.8, 12, 1, true), wm, [0, .9, 0], [Math.PI, 0, 0]);
    [-1, 1].forEach(s => add(f, new THREE.SphereGeometry(.1, 6, 6), new THREE.MeshBasicMaterial({ color: 0x000000 }), [s * .17, 2, .42])); f.visible = false; g.add(f); return f; })();
  // 7. 手电筒灭了，亮起来的时候面前站着一个娃娃
  S_.doll = (() => { const d = new THREE.Group(); add(d, new THREE.ConeGeometry(.45, 1.2, 12), M(0x7b1f2b), [0, .6, 0]); add(d, new THREE.SphereGeometry(.32, 14, 10), M(0xf8e1d3), [0, 1.45, 0]);
    add(d, new THREE.SphereGeometry(.34, 14, 10, 0, Math.PI * 2, 0, Math.PI * .55), M(0x111111), [0, 1.5, -.02]);
    [-1, 1].forEach(s => add(d, new THREE.SphereGeometry(.06, 8, 6), M(0x000000), [s * .11, 1.48, .28])); add(d, new THREE.BoxGeometry(.12, .02, .02), M(0x8b0000), [0, 1.32, .3]);
    d.visible = false; g.add(d); return d; })();

  // 惊吓点放在“必经之路”上
  const at = f => path[Math.max(1, Math.min(path.length - 2, Math.round(path.length * f)))];
  const dirAt = c => { const k = path.findIndex(p => p[0] === c[0] && p[1] === c[1]), n = path[Math.min(path.length - 1, k + 1)]; return [n[0] - c[0], n[1] - c[1]]; };
  const SC = [
    { kind: 'face', cell: at(.12) }, { kind: 'spider', cell: at(.26) }, { kind: 'eyes', cell: at(.4) }, { kind: 'behind', cell: at(.52) },
    { kind: 'wardrobe', cell: at(.65) }, { kind: 'rush', cell: at(.78) }, { kind: 'doll', cell: at(.9) },
  ];
  // 衣柜一开始就在那里（靠在没有路的那面墙）
  { const sc = SC.find(s => s.kind === 'wardrobe'), [i, j] = sc.cell, [x, z] = cellC(i, j), d = dirAt(sc.cell);
    const sideDir = d[0] ? [0, 1] : [1, 0]; const w = S_.wardrobe; w.position.set(x + sideDir[0] * (S / 2 - .55), 0, z + sideDir[1] * (S / 2 - .55));
    w.rotation.y = Math.atan2(-sideDir[0], -sideDir[1]); }

  let active = null, fired = {}, flashOff = 0;
  // 从 (lx,lz) 沿方向 dir 往前看，多远会碰到墙（最多 max）
  function clearDist(lx, lz, dir, max = 9) {
    for (let d = .3; d < max; d += .25) { const x = lx + dir[0] * d, z = lz + dir[1] * d;
      if (walls.some(([x0, z0, x1, z1]) => x > x0 - .15 && x < x1 + .15 && z > z0 - .15 && z < z1 + .15)) return d - .3; }
    return max;
  }
  const tmpV = new THREE.Vector3();
  function trigger(sc, lp, look) {
    const [i, j] = sc.cell, [x, z] = cellC(i, j), d = dirAt(sc.cell), ahead = [x + d[0] * S, z + d[1] * S];
    const t0 = performance.now() / 1000;
    const far = Math.max(1.6, clearDist(lp[0], lp[1], look, 8));                                  // 眼前这条走廊的尽头
    const end = [lp[0] + look[0] * far, lp[1] + look[1] * far];
    if (sc.kind === 'face') { const k = Math.min(far, 3.2); const [fx, fz] = [lp[0] + look[0] * k, lp[1] + look[1] * k]; S_.face.m.position.set(fx, 1.75, fz); S_.face.m.lookAt(lp[0], 1.75, lp[1]); S_.face.l.position.set(fx - look[0] * .8, 2.2, fz - look[1] * .8); }
    if (sc.kind === 'spider') { S_.spider.position.set(lp[0] + look[0] * 1.3, WH, lp[1] + look[1] * 1.3); S_.spider.rotation.y = Math.atan2(-look[0], -look[1]); }
    if (sc.kind === 'eyes') { S_.eyes.position.set(end[0], 0, end[1]); S_.eyes.lookAt(lp[0], 0, lp[1]); }
    if (sc.kind === 'behind') { S_.behind.position.set(lp[0] - look[0] * 2.2, 0, lp[1] - look[1] * 2.2); S_.behind.lookAt(lp[0], 0, lp[1]); }
    if (sc.kind === 'rush') { S_.rush.position.set(end[0], 0, end[1]); S_.rush.lookAt(lp[0], 0, lp[1]); }
    active = { sc, t0, ahead: end };
  }
  function clearAll() { S_.face.m.visible = false; S_.face.l.intensity = 0; S_.spider.visible = false; S_.behind.visible = false; S_.eyes.visible = false; S_.rush.visible = false; S_.doll.visible = false; flashOff = 0; }

  let lastInside = -1e9; const exitBlock = [xx - S / 2, -D / 2 - .5, xx + S / 2, -D / 2 - .2];
  const api = {
    name: '鬼屋', icon: '🏚️', group: g, kind: 'mansion', walls,
    // 入口外面一点（提示用）
    entry: toWorld(ex, D / 2 + 2.5), entryR: 3.5,
    inside(x, z) { const [lx, lz] = toLocal(x, z); return Math.abs(lx) < W / 2 - .05 && Math.abs(lz) < D / 2 - .05; },
    near(x, z) { const [lx, lz] = toLocal(x, z); return Math.abs(lx) < W / 2 + 3 && Math.abs(lz) < D / 2 + 3; },
    // 把人推出墙外（局部坐标里做长方形碰撞）
    collide(pos, rad) {
      let [lx, lz] = toLocal(pos.x, pos.z);
      // 出口只能出不能进：从外面走过来时，出口那里当成一堵墙（刚从里面走出来的 2 秒内不挡）
      const now = performance.now();
      if (Math.abs(lx) < W / 2 - .05 && Math.abs(lz) < D / 2 - .05) lastInside = now;
      const list = now - lastInside > 2000 ? walls.concat([exitBlock]) : walls;
      for (const [x0, z0, x1, z1] of list) {
        const nx = Math.max(x0, Math.min(lx, x1)), nz = Math.max(z0, Math.min(lz, z1)), dx = lx - nx, dz = lz - nz, d2 = dx * dx + dz * dz;
        if (d2 < rad * rad) {
          if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (rad - d) / d; lx += dx * k; lz += dz * k; }
          else { const pl = [lx - x0 + rad, x1 - lx + rad, lz - z0 + rad, z1 - lz + rad], m = Math.min(...pl), i = pl.indexOf(m); if (i === 0) lx = x0 - rad; else if (i === 1) lx = x1 + rad; else if (i === 2) lz = z0 - rad; else lz = z1 + rad; }
        }
      }
      const [wx, wz] = toWorld(lx, lz); pos.x = wx; pos.z = wz;
    },
    debugState() { return { active: active && active.sc.kind, fired: Object.keys(fired), face: S_.face.m.visible, facePos: S_.face.m.position.toArray().map(n => +n.toFixed(1)) }; },
    debugPath() { return path.map(([i, j]) => toWorld(...cellC(i, j))); },
    reset() { fired = {}; active = null; clearAll(); const w = S_.wardrobe.userData; w.door.rotation.y = 0; w.sk.position.z = -.1; },
    // 每帧：pos = 玩家位置，yaw = 看的方向；返回 { flashlight: 0..1 }
    update(dt, t, pos, yaw) {
      candles.forEach((c, k) => c.scale.setScalar(.8 + Math.sin(t * 13 + k) * .2 + Math.random() * .1));
      const [lx, lz] = toLocal(pos.x, pos.z), ly = yaw - rotY, look = [Math.sin(ly), Math.cos(ly)];
      const ci = Math.floor((lx + W / 2) / S), cj = Math.floor((lz + D / 2) / S);
      SC.forEach((sc, k) => { if (!fired[k] && sc.cell[0] === ci && sc.cell[1] === cj && (!active || ['eyes', 'behind', 'wardrobe'].includes(active.sc.kind))) {
        if (active && active.sc.kind !== 'wardrobe') clearAll(); fired[k] = 1; trigger(sc, [lx, lz], look); } });
      let flash = 1;
      if (active) {
        const e = performance.now() / 1000 - active.t0, k = active.sc.kind;
        if (k === 'face') { const on = e > .15 && e < 1.5; S_.face.m.visible = on; S_.face.l.intensity = on ? 30 * (1 - (e - .15) / 1.4) : 0; if (e > 1.6) { clearAll(); active = null; } }
        else if (k === 'spider') { S_.spider.visible = true; const drop = Math.min(1, e / .35); S_.spider.position.y = WH - drop * 2.6 + (e > .35 ? Math.sin((e - .35) * 9) * .12 * Math.max(0, 1 - (e - .35)) : 0); if (e > 3.5) { S_.spider.position.y += (e - 3.5) * 6; } if (e > 4.2) { clearAll(); active = null; } }
        else if (k === 'eyes') { S_.eyes.visible = true; S_.eyes.children.forEach(p => p.visible = Math.sin(t * 3 + p.userData.ph) > -.6); const d = Math.hypot(lx - active.ahead[0], lz - active.ahead[1]); if (d < 1.6 || e > 9) { clearAll(); active = null; } }
        else if (k === 'behind') { S_.behind.visible = true; tmpV.set(S_.behind.position.x - lx, 0, S_.behind.position.z - lz).normalize(); const facing = tmpV.x * look[0] + tmpV.z * look[1]; if (facing > .55 || e > 6) { clearAll(); active = null; } }
        else if (k === 'wardrobe') { const w = S_.wardrobe.userData, q = Math.min(1, e / .18); w.door.rotation.y = -q * 1.9; w.sk.position.z = -.1 + Math.min(1, e / .3) * .55; if (e > 3) active = null; }
        else if (k === 'rush') { S_.rush.visible = true; const [sx, sz] = [S_.rush.position.x, S_.rush.position.z]; const dx = lx - sx, dz = lz - sz, d = Math.hypot(dx, dz);
          if (e > .4) { const step = Math.min(d, dt * 14); S_.rush.position.x += dx / d * step; S_.rush.position.z += dz / d * step; } S_.rush.lookAt(lx, 0, lz); if (d < .8 || e > 3) { clearAll(); active = null; } }
        else if (k === 'doll') { if (e < 1.3) flash = Math.random() < .5 && e < .4 ? .3 : 0; else { flash = 1; if (!S_.doll.visible) { S_.doll.visible = true; S_.doll.position.set(lx + look[0] * 1.3, 0, lz + look[1] * 1.3); S_.doll.lookAt(lx, 0, lz); } } if (e > 3) { clearAll(); active = null; } }
      }
      return { flashlight: flash };
    },
  };
  return api;
}
