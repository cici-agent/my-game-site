// ===== 卡丁车岛：一座单独的大浮空岛 + 一圈约 2.6 公里的四层赛道 =====
// 地下隧道（-8 米，很黑，里面有小汽车在慢慢开）· 地面 · 10 米高架（有断桥要飞过去）· 螺旋坡转上 22 米最高层
// 岔路：主路钻隧道；近路沿着岛边、穿过一片浅湖，在起点前合回来
import * as THREE from 'three';
import { buildKart } from './kart.js';
import { glowTex } from '../u/tex.js';
import { kartLayout } from './kartlayout.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .7, ...o });
export const KI = { x: 0, z: -1150, R: 380 };          // 岛的位置和大小（离乐园很远，互相看不见）

export function buildKartIsland(scene) {
  const g = new THREE.Group(); g.position.set(KI.x, 0, KI.z); scene.add(g);
  const LY = kartLayout(), W = LY.W, N = LY.N;

  // ---------- 路段数据：主路（闭合）+ 岔路（不闭合），每个点记住它在一圈里的位置 s ----------
  const segs = [];
  function makeSeg(points, closed, sOf, flags) {
    const n = points.length, tan = [], side = [];
    for (let i = 0; i < n; i++) { const a = closed ? points[(i + 1) % n] : points[Math.min(n - 1, i + 1)], b = closed ? points[(i - 1 + n) % n] : points[Math.max(0, i - 1)];
      const t = new THREE.Vector3().subVectors(a, b); const flat = t.clone().setY(0).normalize(); tan.push(t.normalize()); side.push(new THREE.Vector3(flat.z, 0, -flat.x)); }
    const f = k => flags.map(x => !!x[k]);
    const seg = { pt: points, tan, side, closed, n, s: points.map((_, i) => sOf(i)), gap: f('gap'), water: f('water'), tunnel: f('tunnel'), trench: f('trench') };
    segs.push(seg); return seg;
  }
  const main = makeSeg(LY.pts, true, i => i / N, LY.flagsMain);
  const ia = LY.ia, ib = LY.ib, span = (ib - ia + N) % N;
  const branch = makeSeg(LY.bpts, false, k => ((ia + span * k / (LY.bpts.length - 1)) % N) / N, LY.flagsBranch);
  const pt = main.pt, tan = main.tan, side = main.side, gap = main.gap;
  const inLake = LY.inLake;

  // 空间格子：查附近的路点
  const CELL = 10, grid = new Map();
  segs.forEach((sg, si) => sg.pt.forEach((p, i) => { const key = Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL); (grid.get(key) || grid.set(key, []).get(key)).push(si, i); }));
  function nearby(lx, lz, r = 1) { const out = [], cx = Math.floor(lx / CELL), cz = Math.floor(lz / CELL); for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const l = grid.get((cx + a) + ',' + (cz + b)); if (l) out.push(...l); } return out; }
  // 某个位置附近 d 米内有没有满足条件的路点
  function anyRoad(x, z, d, test) { const L = nearby(x, z, Math.ceil(d / CELL)); for (let n = 0; n < L.length; n += 2) { const sg = segs[L[n]], i = L[n + 1], p = sg.pt[i]; if ((p.x - x) ** 2 + (p.z - z) ** 2 < d * d && test(sg, i, p)) return true; } return false; }

  // ---------- 岛：草地是一张格子网，地下隧道的“坡道沟”那里挖空 ----------
  const grassTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#6fbf5a'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 1500; i++) { x.fillStyle = Math.random() < .5 ? '#64b350' : '#7dcc68'; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 5); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  { const S = 4, R = KI.R, n = Math.ceil(R * 2 / S), pos = [], uv = [], idx = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) { let x = -R + i * S, z = -R + j * S; const r = Math.hypot(x, z); if (r > R) { x *= R / r; z *= R / r; } pos.push(x, 0, z); uv.push(x / 12, z / 12); }
    const V = (i, j) => j * (n + 1) + i;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const cx = -R + (i + .5) * S, cz = -R + (j + .5) * S; if (Math.hypot(cx, cz) > R + S) continue;
      if (Math.hypot(-R + i * S, -R + j * S) > R && Math.hypot(-R + (i + 1) * S, -R + j * S) > R && Math.hypot(-R + i * S, -R + (j + 1) * S) > R && Math.hypot(-R + (i + 1) * S, -R + (j + 1) * S) > R) continue;
      if (anyRoad(cx, cz, W / 2 + 1.5, (sg, k) => sg.trench[k])) continue;          // 坡道沟：挖空
      idx.push(V(i, j), V(i, j + 1), V(i + 1, j), V(i + 1, j), V(i, j + 1), V(i + 1, j + 1));
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, M(0xffffff, { map: grassTex }))); }
  const rock = new THREE.Mesh(new THREE.ConeGeometry(KI.R, 110, 64, 6, true), M(0x8c6d52, { flatShading: true, side: THREE.DoubleSide })); rock.rotation.x = Math.PI; rock.position.y = -55.2; g.add(rock);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(KI.R, KI.R - 1, 2.4, 180, 1, true), M(0x5d8a3a, { side: THREE.DoubleSide })); rim.position.y = -1.2; g.add(rim);
  { const C = 420, im = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .12, 1.3, 6), M(0xffffff), C), o = new THREE.Object3D(); for (let k = 0; k < C; k++) { const a = k / C * Math.PI * 2, rr = KI.R - 1.2; o.position.set(Math.cos(a) * rr, .65, Math.sin(a) * rr); o.updateMatrix(); im.setMatrixAt(k, o.matrix); } g.add(im); }
  const rail = new THREE.Mesh(new THREE.TorusGeometry(KI.R - 1.2, .08, 6, 320), M(0xff9f43)); rail.rotation.x = Math.PI / 2; rail.position.y = 1.2; g.add(rail);

  // ---------- 路面 ----------
  const mkTex = (base, dots, line) => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = base; x.fillRect(0, 0, 64, 64); for (let i = 0; i < 300; i++) { x.fillStyle = dots[i % 2]; x.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
    if (line) { x.fillStyle = line; x.fillRect(30, 0, 4, 28); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; };
  const asphalt = mkTex('#4a4e57', ['#555a64', '#40444c'], '#ffffff'), dirtT = mkTex('#b08968', ['#9c7656', '#c4a07a']);
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: .9 }), tunRoadMat = new THREE.MeshLambertMaterial({ map: asphalt, color: 0x777777 });
  const dirtMat = new THREE.MeshStandardMaterial({ map: dirtT, roughness: 1 }), slabMat = M(0x868e96), edgeMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b, side: THREE.DoubleSide });
  const mkMesh = (pos, ind, mt, uvs) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (uvs) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(ind); geo.computeVertexNormals(); const m = new THREE.Mesh(geo, mt); g.add(m); return m; };
  // 沿着路做一条带子：off0/off1 是横向位置，h0/h1 是相对路面的高度（可以是函数）
  function strip(seg, i0, i1, f, mat, uvScale = 0) {
    const pos = [], uv = [], ind = []; let n = 0;
    for (let i = i0; i <= i1; i++) { const k = seg.closed ? i % seg.n : i, p = seg.pt[k], sd = seg.side[k]; const [a, b] = f(p, k);
      pos.push(p.x + sd.x * a[0], a[1], p.z + sd.z * a[0], p.x + sd.x * b[0], b[1], p.z + sd.z * b[0]); uv.push(0, i * uvScale, 1, i * uvScale);
      if (i < i1) ind.push(n * 2, n * 2 + 1, n * 2 + 2, n * 2 + 1, n * 2 + 3, n * 2 + 2); n++; }
    return mkMesh(pos, ind, mat, uvScale ? uv : null);
  }
  function runs(seg, test, cb) { let start = null; const last = seg.closed ? seg.n : seg.n - 1;
    for (let i = 0; i <= last; i++) { const k = seg.closed ? i % seg.n : i, on = test(k) && i < last; if (on && start === null) start = i; if (!on && start !== null) { cb(start, Math.min(i, last)); start = null; } } }
  // 主路：亮的路 / 隧道里暗一点的路；底板 + 红色侧边
  const roadTop = (p) => [[W / 2, p.y + .05], [-W / 2, p.y + .05]];
  runs(main, k => !gap[k] && !main.tunnel[k], (a, b) => { strip(main, a, b, roadTop, roadMat, .25); });
  runs(main, k => main.tunnel[k], (a, b) => { strip(main, a, b, roadTop, tunRoadMat, .25); });
  runs(main, k => !gap[k] && pt[k].y > .4, (a, b) => {
    strip(main, a, b, p => [[-W / 2, p.y - .65], [W / 2, p.y - .65]], slabMat);
    [1, -1].forEach(s => strip(main, a, b, p => [[s * W / 2, p.y + .05], [s * W / 2, p.y - .65]], edgeMat));
  });
  runs(branch, k => !branch.water[k], (a, b) => strip(branch, a, b, roadTop, dirtMat, .25));

  // ---------- 地下隧道：坡道沟（两边水泥墙）+ 盖着的隧道（墙 + 顶，里面黑） ----------
  const concrete = M(0xadb5bd), tunWall = new THREE.MeshLambertMaterial({ color: 0x3a3a44, side: THREE.DoubleSide });
  const under = k => main.trench[k] || main.tunnel[k];
  runs(main, under, (a, b) => {
    [1, -1].forEach(s => strip(main, a, b, (p, k) => [[s * (W / 2 + .3), p.y - .7], [s * (W / 2 + .3), main.tunnel[k] ? -.5 : 0]], new THREE.MeshLambertMaterial({ color: 0x8a8f96, side: THREE.DoubleSide })));
  });
  runs(main, k => main.tunnel[k], (a, b) => strip(main, a, b, () => [[W / 2 + .4, -.5], [-W / 2 - .4, -.5]], tunWall));
  runs(main, k => main.tunnel[k], (a, b) => [1, -1].forEach(s => strip(main, a, b, p => [[s * (W / 2 + .25), p.y + .2], [s * (W / 2 + .25), -.6]], tunWall)));
  // 沟两边地面上的水泥边 + 黄色护栏（盖住草地格子挖空留下的锯齿）
  const railY = M(0xffd43b);
  runs(main, k => main.trench[k], (a, b) => {
    [1, -1].forEach(s => { strip(main, Math.max(0, a - 4), b + 4, () => [[s * (W / 2 + .3), .03], [s * (W / 2 + 5), .03]], concrete);
      const run = []; for (let i = a; i <= b; i += 2) { const p = pt[i % N], sd = side[i % N]; run.push(new THREE.Vector3(p.x + sd.x * s * (W / 2 + .8), 1.1, p.z + sd.z * s * (W / 2 + .8))); }
      if (run.length > 3) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(run), run.length, .1, 6, false), railY)); });
  });
  // 洞口：水泥门框 + 牌子
  const sign = (text, w, h, bg = '#1c7ed6', fg = '#fff', font = 34) => { const c = document.createElement('canvas'); c.width = 640; c.height = Math.round(640 * h / w); const x = c.getContext('2d');
    x.fillStyle = bg; x.beginPath(); x.roundRect(0, 0, c.width, c.height, 22); x.fill(); x.fillStyle = fg; x.font = `bold ${font}px sans-serif`; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, c.width / 2, c.height / 2 + 2);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); };
  const portals = [];
  for (let i = 0; i < N; i++) { if (main.tunnel[i] && !main.tunnel[(i - 1 + N) % N]) portals.push([i, 1]); if (main.tunnel[i] && !main.tunnel[(i + 1) % N]) portals.push([i, -1]); }
  portals.forEach(([i, dir]) => { const p = pt[i], t = tan[i], fr = new THREE.Group(); fr.position.set(p.x, 0, p.z); fr.lookAt(p.x + t.x, 0, p.z + t.z); g.add(fr);
    const top = new THREE.Mesh(new THREE.BoxGeometry(W + 3, 2.4, 1.2), concrete); top.position.y = -.2; fr.add(top);
    [-1, 1].forEach(s => { const col = new THREE.Mesh(new THREE.BoxGeometry(1.5, 9, 1.2), concrete); col.position.set(s * (W / 2 + .9), p.y + 3.5, 0); fr.add(col); });
    if (dir > 0) { const sg = sign('🚇 地下隧道 · 小心车辆', 12, 1.8, '#212529', '#ffd43b', 54); sg.position.set(0, .4, -.65); sg.rotation.y = Math.PI; fr.add(sg); } });
  // 隧道里稀稀拉拉的灯（每 30 米一对，很暗的隧道里就靠它们）
  const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffd8a8 });
  { const list = []; for (let i = 0; i < N; i += 30) if (main.tunnel[i]) list.push(i);
    const im = new THREE.InstancedMesh(new THREE.BoxGeometry(.25, .25, 1.6), bulbMat, list.length * 2), o = new THREE.Object3D(); let c = 0;
    list.forEach(i => [1, -1].forEach(s => { const p = pt[i]; o.position.set(p.x + side[i].x * s * (W / 2), p.y + 5.2, p.z + side[i].z * s * (W / 2)); o.lookAt(o.position.clone().add(tan[i])); o.updateMatrix(); im.setMatrixAt(c++, o.matrix); }));
    g.add(im); }

  // ---------- 路肩 / 护栏 / 柱子 ----------
  const kerbA = M(0xe03131), kerbB = M(0xffffff), postM = M(0xdee2e6), pillarM = M(0xced4da);
  const nearGap = i => { for (let d = -10; d <= 10; d++) if (gap[(i + d + N) % N]) return true; return false; };
  { const kerbs = [[], []], posts = [], o = new THREE.Object3D();
    for (let i = 0; i < N; i += 3) { const p = pt[i], sd = side[i], tt = tan[i]; if (gap[i] || under(i)) continue;
      [1, -1].forEach(s => {
        if (p.y < 1) { if (i > ia && i < ia + 40) return; o.position.set(p.x + sd.x * s * (W / 2 + .35), p.y + .08, p.z + sd.z * s * (W / 2 + .35)); o.lookAt(o.position.clone().add(tt)); o.updateMatrix(); kerbs[(i / 3) % 2].push(o.matrix.clone()); }
        else if (i % 6 === 0 && !nearGap(i)) { o.position.set(p.x + sd.x * s * (W / 2 - .2), p.y + .6, p.z + sd.z * s * (W / 2 - .2)); o.rotation.set(0, 0, 0); o.updateMatrix(); posts.push(o.matrix.clone()); }
      }); }
    kerbs.forEach((list, c) => { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(.7, .16, 2.2), c ? kerbA : kerbB, list.length); list.forEach((mt, k) => im.setMatrixAt(k, mt)); g.add(im); });
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(.09, .09, 1.2, 6), postM, posts.length); posts.forEach((mt, k) => im.setMatrixAt(k, mt)); g.add(im); }
  [1, -1].forEach(s => { let run = [];
    const flush = () => { if (run.length > 3) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(run), run.length, .09, 6, false), railY)); run = []; };
    for (let i = 0; i <= N; i += 2) { const k = i % N, p = pt[k], sd = side[k]; if (p.y > 1 && !nearGap(k)) run.push(new THREE.Vector3(p.x + sd.x * s * (W / 2 - .2), p.y + 1.15, p.z + sd.z * s * (W / 2 - .2))); else flush(); }
    flush(); });
  // 柱子：不能插在下面一层的路上
  { const cols = [], o = new THREE.Object3D();
    for (let i = 0; i < N; i += 12) { const p = pt[i]; if (p.y < 2.2 || gap[i]) continue;
      [1, -1].forEach(s => { const x = p.x + side[i].x * s * (W / 2 - 1), z = p.z + side[i].z * s * (W / 2 - 1);
        if (anyRoad(x, z, W / 2 + 1.2, (sg, k, q) => q.y < p.y - 2 && q.y > -7)) return;
        o.position.set(x, (p.y - .6) / 2, z); o.scale.set(1, p.y - .6, 1); o.updateMatrix(); cols.push(o.matrix.clone()); }); }
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(.5, .65, 1, 10), pillarM, cols.length); cols.forEach((mt, k) => im.setMatrixAt(k, mt)); g.add(im); }
  // 断桥前的牌子
  const gapStarts = []; for (let i = 0; i < N; i++) if (gap[i] && !gap[(i - 1 + N) % N]) gapStarts.push(i);
  gapStarts.forEach(gi => { const i = (gi - 14 + N) % N, p = pt[i], tt = tan[i];
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(W * .8, 2.2), new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
      x.fillStyle = '#ffd43b'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#212529'; for (let k = -2; k < 12; k++) { x.beginPath(); x.moveTo(k * 26, 64); x.lineTo(k * 26 + 14, 64); x.lineTo(k * 26 + 40, 0); x.lineTo(k * 26 + 26, 0); x.fill(); }
      x.fillStyle = '#e03131'; x.fillRect(48, 10, 160, 44); x.fillStyle = '#fff'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('⚡ 加速飞过去！', 128, 33); return new THREE.CanvasTexture(x.canvas); })(), side: THREE.DoubleSide }));
    sg.position.set(p.x, p.y + 5.2, p.z); sg.lookAt(sg.position.clone().sub(tt)); g.add(sg);
    [1, -1].forEach(s => { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 5.4, 6), postM); pole.position.set(p.x + side[i].x * s * W * .4, p.y + 2.7, p.z + side[i].z * s * W * .4); g.add(pole); }); });

  // ---------- 起点：黑白格 + 拱门 ----------
  const p0 = pt[0], t0 = tan[0];
  const chk = (() => { const c = document.createElement('canvas'); c.width = 96; c.height = 16; const x = c.getContext('2d'); for (let i = 0; i < 24; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 4, j * 4, 4, 4); } const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t; })();
  const line = new THREE.Mesh(new THREE.PlaneGeometry(W, 2), new THREE.MeshBasicMaterial({ map: chk })); line.rotation.x = -Math.PI / 2; line.rotation.z = Math.atan2(t0.x, t0.z); line.position.set(p0.x, p0.y + .08, p0.z); g.add(line);
  { const pa = pt[N - 30], ta = tan[N - 30];
    const arch = new THREE.Group(); arch.position.set(pa.x, pa.y, pa.z); arch.rotation.y = Math.atan2(ta.x, ta.z); g.add(arch);
    const archM = M(0x1c7ed6, { metalness: .3 });
    [-1, 1].forEach(s => { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 8, 10), archM); pole.position.set(s * (W / 2 + 1.2), 4, 0); arch.add(pole); });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 3, 1.6, .5), archM); beam.position.y = 8; arch.add(beam);
    [1, -1].forEach(s => { const sp = sign('🏁 卡丁车岛', W + 2.6, 1.4, '#ff6b35', '#fff', 60); sp.position.set(0, 8, s * .27); if (s < 0) sp.rotation.y = Math.PI; arch.add(sp); }); }
  // 彩旗 + 灯泡（晚上会亮）
  const flagC = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2];
  for (let i = 0; i < N; i += 26) { const p = pt[i]; if (p.y > 1 || p.y < -.2 || gap[i] || (i > ia && i < ia + 60)) continue; const s = (i / 26) % 2 ? 1 : -1, x = p.x + side[i].x * s * (W / 2 + 3), z = p.z + side[i].z * s * (W / 2 + 3);
    if (anyRoad(x, z, W / 2 + 1, (sg, k, q) => q.y > -2 && q.y < 3)) continue;
    const c = flagC[(i / 26) % 5];
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 3.6, 6), postM); pole.position.set(x, 1.8, z); g.add(pole);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(1, .6), M(c, { side: THREE.DoubleSide })); fl.position.set(x + .5, 3.3, z); g.add(fl);
    const b = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), new THREE.MeshBasicMaterial({ color: c })); b.position.set(x, 3.7, z); b.userData.nightBulb = c; g.add(b); }

  // ---------- 近路：土路 + 小木桩 + 湖 ----------
  { const list = [], o = new THREE.Object3D(); for (let k = 30; k < branch.n - 30; k += 6) { if (branch.water[k]) continue; const p = branch.pt[k], sd = branch.side[k];
      [1, -1].forEach(s => { const x = p.x + sd.x * s * (W / 2 + .4), z = p.z + sd.z * s * (W / 2 + .4); if (anyRoad(x, z, W / 2 - .5, (sg) => sg === main)) return; o.position.set(x, .4, z); o.updateMatrix(); list.push(o.matrix.clone()); }); }
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(.14, .14, .8, 6), M(0x8b5a2b), list.length); list.forEach((mt, k) => im.setMatrixAt(k, mt)); g.add(im); }
  const lk = LY.lake;
  const sand = new THREE.Mesh(new THREE.CircleGeometry(1, 56), M(0xe9d8a6)); sand.scale.set(lk.rx + 5, lk.rz + 5, 1); sand.rotation.x = -Math.PI / 2; sand.position.set(lk.x, .03, lk.z); g.add(sand);
  const bed = new THREE.Mesh(new THREE.CircleGeometry(1, 56), M(0x6c8ea0)); bed.scale.set(lk.rx, lk.rz, 1); bed.rotation.x = -Math.PI / 2; bed.position.set(lk.x, -.4, lk.z); g.add(bed);
  const waterTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#4dabf7'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2; for (let i = 0; i < 18; i++) { x.beginPath(); const y = Math.random() * 128, x0 = Math.random() * 128; x.moveTo(x0, y); x.quadraticCurveTo(x0 + 10, y - 4, x0 + 20, y); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 8); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 56), new THREE.MeshStandardMaterial({ map: waterTex, transparent: true, opacity: .75, roughness: .1, metalness: .1 }));
  water.scale.set(lk.rx, lk.rz, 1); water.rotation.x = -Math.PI / 2; water.position.set(lk.x, .12, lk.z); g.add(water);
  for (let k = 0; k < 12; k++) { const a = k / 12 * 6.283; const lp = new THREE.Mesh(new THREE.CircleGeometry(1, 12), M(0x40c057)); lp.rotation.x = -Math.PI / 2; lp.position.set(lk.x + Math.cos(a) * lk.rx * .8, .14, lk.z + Math.sin(a) * lk.rz * .85); g.add(lp); }
  // 岔路口的指示牌（自动判断近路在左边还是右边）
  { const q = branch.pt[40], d = side[ia].x * (q.x - pt[ia].x) + side[ia].z * (q.z - pt[ia].z), left = d > 0;   // side 指向左边
    const txt = left ? '⬅ 🌊 近路（过湖）     🚇 隧道 ➡' : '⬅ 🚇 隧道     🌊 近路（过湖）➡';
    const i = (ia - 40 + N) % N, p = pt[i], sg = sign(txt, 14, 2.2, '#1c7ed6', '#fff', 54); sg.position.set(p.x, p.y + 6, p.z); sg.lookAt(sg.position.clone().sub(tan[i])); g.add(sg);
    [1, -1].forEach(s => { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 6, 6), postM); pole.position.set(p.x + side[i].x * s * 6.8, 3, p.z + side[i].z * s * 6.8); g.add(pole); }); }

  // ---------- 隧道里的小汽车（大家看到的一样：按共同的时钟开） ----------
  const tunRuns = []; runs(main, k => main.tunnel[k], (a, b) => tunRuns.push([a, b]));
  const [c0, c1] = tunRuns.sort((A, B) => (B[1] - B[0]) - (A[1] - A[0]))[0] || [0, 0], CL = c1 - c0, CAR_V = 9, NCAR = 7;
  const cars = [];
  const carColors = [0xe03131, 0x1971c2, 0xf08c00, 0x2f9e44, 0x7048e8, 0xf8f9fa, 0x495057];
  for (let k = 0; k < NCAR; k++) {
    const cg = new THREE.Group(); g.add(cg); const C = M(carColors[k], { metalness: .3, roughness: .4 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.2, .9, 4.4), C); body.position.y = .75; cg.add(body);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(1.9, .75, 2.2), M(0x1e2a3a, { metalness: .4, roughness: .2 })); cab.position.set(0, 1.55, -.2); cg.add(cab);
    [[-1, 1.4], [1, 1.4], [-1, -1.4], [1, -1.4]].forEach(([x, z]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(.42, .42, .3, 12), M(0x111111)); w.rotation.z = Math.PI / 2; w.position.set(x * 1.1, .42, z); cg.add(w); });
    [-.7, .7].forEach(x => { const h = new THREE.Mesh(new THREE.BoxGeometry(.45, .22, .08), new THREE.MeshBasicMaterial({ color: 0xfff9db })); h.position.set(x, .85, 2.22); cg.add(h);
      const tl = new THREE.Mesh(new THREE.BoxGeometry(.45, .2, .08), new THREE.MeshBasicMaterial({ color: 0xff2020 })); tl.position.set(x, .85, -2.22); cg.add(tl); });
    const beam = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xfff3bf, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false })); beam.position.set(0, .8, 4); beam.scale.set(4, 2, 1); cg.add(beam);
    cars.push({ g: cg, lat: (k % 2 ? 1 : -1) * 4.3, off: k * CL / NCAR + (k % 2) * 13, pos: new THREE.Vector3(), tan: new THREE.Vector3(), side: new THREE.Vector3() });
  }
  function placeCars(t) {
    cars.forEach(c => { const s = ((t * CAR_V + c.off) % CL + CL) % CL, f = c0 + s, i = Math.floor(f), u = f - i, a = pt[i % N], b = pt[(i + 1) % N];
      c.tan.copy(tan[i % N]); c.side.copy(side[i % N]);
      c.pos.set(a.x + (b.x - a.x) * u + c.side.x * c.lat, a.y + (b.y - a.y) * u, a.z + (b.z - a.z) * u + c.side.z * c.lat);
      c.g.position.copy(c.pos); c.g.rotation.set(0, Math.atan2(c.tan.x, c.tan.z), 0); });
  }

  // ---------- 维修区 + 看台 + 传送门 ----------
  const pitL = new THREE.Vector3(0, 0, 205);
  const pit = new THREE.Group(); pit.position.copy(pitL); g.add(pit);
  const pf = new THREE.Mesh(new THREE.BoxGeometry(16, .25, 9), M(0xced4da)); pf.position.y = .12; pit.add(pf);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(17, .4, 10), M(0xff922b)); roof.position.y = 4.6; pit.add(roof);
  [[-8, -4.4], [8, -4.4], [-8, 4.4], [8, 4.4]].forEach(([x, z]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, 4.5, 8), M(0xffffff)); p.position.set(x, 2.3, z); pit.add(p); });
  [-5, 0, 5].forEach((x, i) => { const k = buildKart([0xff6b6b, 0x4dabf7, 0xffd43b][i]); k.group.position.set(x, .25, 0); pit.add(k.group); });
  const stand = new THREE.Group(); stand.position.set(-45, 0, 212); g.add(stand);
  for (let r = 0; r < 5; r++) { const step = new THREE.Mesh(new THREE.BoxGeometry(26, .6, 1.4), M(r % 2 ? 0x74c0fc : 0x4dabf7)); step.position.set(0, .3 + r * .6, -r * 1.4); stand.add(step); }
  const portal = (lx, lz, color, label) => { const pg = new THREE.Group(); pg.position.set(lx, 0, lz); g.add(pg);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, .3, 12, 48), M(color, { emissive: color, emissiveIntensity: .8 })); ring.position.y = 2.8; pg.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .45, side: THREE.DoubleSide })); disc.position.y = 2.8; pg.add(disc);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false })); gl.position.y = 2.8; gl.scale.setScalar(8); pg.add(gl);
    const lt = (() => { const c = document.createElement('canvas'); c.width = 320; c.height = 64; const x = c.getContext('2d'); x.fillStyle = 'rgba(26,20,70,.85)'; x.beginPath(); x.roundRect(0, 0, 320, 64, 30); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, 160, 34); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt, transparent: true })); lab.position.y = 6.2; lab.scale.set(6, 1.2, 1); pg.add(lab);
    pg.userData.spin = disc; return pg; };
  const BP = [30, 192];
  const back = portal(BP[0], BP[1], 0x9775fa, '🎡 回乐园');
  const arrive = new THREE.Vector3(KI.x + 46, 0, KI.z + 178);
  // 树（避开路、湖、维修区）
  { const treeM = M(0x2f9e44, { flatShading: true }), trunkM = M(0x8b5a2b), trs = [], cns = [], o = new THREE.Object3D();
    for (let k = 0; k < 700; k++) { const a = Math.random() * Math.PI * 2, d = 20 + Math.sqrt(Math.random()) * (KI.R - 30), x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (anyRoad(x, z, W / 2 + 5, (sg, i, q) => q.y > -7 && q.y < 8) || ((x - lk.x) / (lk.rx + 7)) ** 2 + ((z - lk.z) / (lk.rz + 7)) ** 2 < 1 || Math.hypot(x - pitL.x, z - pitL.z) < 18 || Math.hypot(x - BP[0], z - BP[1]) < 10 || Math.hypot(x - 46, z - 178) < 6 || Math.hypot(x + 45, z - 208) < 18) continue;
      const s = .9 + Math.random() * .7;
      o.position.set(x, s, z); o.scale.set(s, s, s); o.updateMatrix(); trs.push(o.matrix.clone());
      o.position.set(x, 3.4 * s, z); o.updateMatrix(); cns.push(o.matrix.clone()); }
    const ti = new THREE.InstancedMesh(new THREE.CylinderGeometry(.25, .35, 2, 6), trunkM, trs.length); trs.forEach((m, k) => ti.setMatrixAt(k, m)); g.add(ti);
    const ci = new THREE.InstancedMesh(new THREE.ConeGeometry(1.6, 3.6, 7), treeM, cns.length); cns.forEach((m, k) => ci.setMatrixAt(k, m)); g.add(ci); }

  // 走路的时候不能掉进坡道沟：沿着沟放一串圆形障碍
  const colliders = [];
  for (let i = 0; i < N; i += 7) if (main.trench[i] || (main.tunnel[i] && (main.trench[(i + 7) % N] || main.trench[(i - 7 + N) % N]))) colliders.push([KI.x + pt[i].x, KI.z + pt[i].z, W / 2 + .5]);

  // ---------- 查询 ----------
  const mainIdx = (sg, i) => Math.round(sg.s[i] * N) % N;
  const api = {
    name: '卡丁车', icon: '🏎️', kind: 'kart', W, N, group: g,
    entry: [KI.x + pitL.x, KI.z + pitL.z + 6], entryR: 7,
    colliders,
    arrive, backPortal: { pos: [KI.x + BP[0], KI.z + BP[1]], obj: back },
    start: (() => { const i = N - 25, p = pt[i], tt = tan[i]; return { x: KI.x + p.x, z: KI.z + p.z, y: p.y, heading: Math.atan2(tt.x, tt.z), idx: i }; })(),
    onIsland(x, z) { return Math.hypot(x - KI.x, z - KI.z) < KI.R + 4; },
    inWater(x, z) { return inLake(x - KI.x, z - KI.z); },
    // 车脚下的路：只算比车高不超过 1.2 米的路面（这样在立交下面不会“吸”到上面那层）
    support(x, y, z) {
      const lx = x - KI.x, lz = z - KI.z, L = nearby(lx, lz); let best = null, bd = Infinity;
      for (let n = 0; n < L.length; n += 2) {
        const sg = segs[L[n]], i = L[n + 1], p = sg.pt[i], sd = sg.side[i], tn = sg.tan[i], dx = lx - p.x, dz = lz - p.z, lat = Math.abs(dx * sd.x + dz * sd.z), lon = Math.abs(dx * tn.x + dz * tn.z);
        if (lon > 2 || p.y > y + 1.2 || sg.gap[i]) continue;
        if (lat < W / 2 + .3) { if (!best || p.y > best.y + .5 || (Math.abs(p.y - best.y) <= .5 && lat < bd)) { best = { i: mainIdx(sg, i), y: p.y, lat, side: sd, p, water: sg.water[i] }; bd = lat; } }
      }
      if (!best && inLake(lx, lz) && y > -1) best = { i: -1, y: -.35, lat: 0, side: null, p: null, water: true };
      return best;
    },
    // 离哪一段路最近（同一层），用来挡护栏、算进度（岔路上的点换算成主路的进度）
    nearest(x, y, z) {
      const lx = x - KI.x, lz = z - KI.z, L = nearby(lx, lz); let bs = null, bi = 0, bd = Infinity;
      for (let n = 0; n < L.length; n += 2) { const sg = segs[L[n]], i = L[n + 1], p = sg.pt[i]; if (Math.abs(p.y - y) > 2.5) continue; const d = (lx - p.x) ** 2 + (lz - p.z) ** 2; if (d < bd) { bd = d; bs = sg; bi = i; } }
      if (!bs) return null;
      const p = bs.pt[bi], dx = lx - p.x, dz = lz - p.z, isMain = bs === main;
      return { i: mainIdx(bs, bi), y: p.y, lat: dx * bs.side[bi].x + dz * bs.side[bi].z, side: bs.side[bi], tan: bs.tan[bi], high: p.y > 1,
        railed: isMain && ((p.y > 1 && !nearGap(bi)) || bs.trench[bi] || bs.tunnel[bi]), gap: bs.gap[bi], water: bs.water[bi], tunnel: bs.tunnel[bi], under: bs.tunnel[bi] || bs.trench[bi], branch: !isMain };
    },
    // 撞到隧道里的小汽车了吗？
    hitCar(x, y, z) {
      const lx = x - KI.x, lz = z - KI.z;
      for (const c of cars) { if (Math.abs(c.pos.y - y) > 2) continue; const dx = lx - c.pos.x, dz = lz - c.pos.z; if (dx * dx + dz * dz > 25) continue;
        const lon = dx * c.tan.x + dz * c.tan.z, lat = dx * c.side.x + dz * c.side.z;
        if (Math.abs(lon) < 3.1 && Math.abs(lat) < 2.1) return { lon, lat, tan: c.tan, side: c.side, speed: CAR_V }; }
      return null;
    },
    pointAt(i) { const p = pt[((i % N) + N) % N]; return [KI.x + p.x, p.y, KI.z + p.z]; },
    tanAt(i) { return tan[((i % N) + N) % N]; },
    blocks() { return false; },
    debug: { segs, LAKE: lk, ia, ib, cars, tunnel: [c0, c1] },
    update(dt) { back.userData.spin.rotation.z += dt; placeCars(Date.now() / 1000); },
  };
  placeCars(Date.now() / 1000);
  return api;
}
