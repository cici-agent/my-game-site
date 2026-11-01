// ===== 卡丁车岛：一座单独的大浮空岛 + 8 字形双层赛道（有高架、立交、飞跃断桥） =====
// 赛道中心线：8 字形（Gerono 曲线），中间一段爬上 10 米高架，在 8 字中心从另一条路头顶上过去；还有一条穿湖的近路和一条隧道
// 高架上有两个缺口（前面有跳台），要开快才能飞过去；掉下去按 R / 「回到赛道」回到检查点
import * as THREE from 'three';
import { buildKart } from './kart.js';
import { glowTex } from '../u/tex.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .7, ...o });
export const KI = { x: 0, z: -900, R: 262 };          // 岛的位置和大小（离乐园很远，互相看不见）

export function buildKartIsland(scene) {
  const g = new THREE.Group(); g.position.set(KI.x, 0, KI.z); scene.add(g);
  // ---------- 岛 ----------
  const grass = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#6fbf5a'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 1500; i++) { x.fillStyle = Math.random() < .5 ? '#64b350' : '#7dcc68'; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 5); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(40, 40); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const top = new THREE.Mesh(new THREE.CircleGeometry(KI.R, 160), M(0xffffff, { map: grass })); top.rotation.x = -Math.PI / 2; g.add(top);
  const rock = new THREE.Mesh(new THREE.ConeGeometry(KI.R, 100, 56, 6, true), M(0x8c6d52, { flatShading: true, side: THREE.DoubleSide })); rock.rotation.x = Math.PI; rock.position.y = -50.2; g.add(rock);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(KI.R, KI.R - 1, 2.4, 160, 1, true), M(0x5d8a3a, { side: THREE.DoubleSide })); rim.position.y = -1.2; g.add(rim);
  { const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(.12, .12, 1.3, 6), M(0xffffff), 340), o = new THREE.Object3D(); for (let k = 0; k < 340; k++) { const a = k / 340 * Math.PI * 2, rr = KI.R - 1.2; o.position.set(Math.cos(a) * rr, .65, Math.sin(a) * rr); o.updateMatrix(); im.setMatrixAt(k, o.matrix); } g.add(im); }
  const rail = new THREE.Mesh(new THREE.TorusGeometry(KI.R - 1.2, .08, 6, 280), M(0xff9f43)); rail.rotation.x = Math.PI / 2; rail.position.y = 1.2; g.add(rail);

  // ---------- 主赛道：8 字形 ----------
  const N = 1500, W = 12, A = 205, B = 300, H = 10;
  const T = i => i / N * Math.PI * 2;
  const GAPS = [[2.4, 2.46], [3.86, 3.92]];                     // 两个断桥
  const TUNNEL = [.3, .78];                                       // 隧道
  const FORK = [5.0, 5.9];                                        // 岔路（近路穿过湖）
  const inGap = t => GAPS.some(([a, b]) => t > a && t < b);
  const kicker = t => GAPS.reduce((h, [a]) => h + (t > a - .06 && t <= a ? 1.6 * Math.pow((t - (a - .06)) / .06, 1.3) : 0), 0);
  const waves = t => (t > 1.0 && t < 1.42 ? .7 * Math.max(0, Math.sin((t - 1.0) * 60)) : 0);
  const height = t => { const d = Math.abs(t - Math.PI); return (d < 1.5 ? H * (.5 + .5 * Math.cos(Math.PI * d / 1.5)) : 0) + kicker(t) + waves(t); };
  const mainPos = t => new THREE.Vector3(A * Math.sin(t), height(t), B * Math.sin(t) * Math.cos(t));
  // 统一的“路段”：主赛道（闭合）+ 岔路（不闭合）；每个点记住它在一圈里的位置 s
  const segs = [];
  function makeSeg(points, closed, sOf, flags = () => ({})) {
    const n = points.length, tan = [], side = [], f = points.map((_, i) => flags(i));
    for (let i = 0; i < n; i++) { const a = closed ? points[(i + 1) % n] : points[Math.min(n - 1, i + 1)], b = closed ? points[(i - 1 + n) % n] : points[Math.max(0, i - 1)];
      const t = new THREE.Vector3().subVectors(a, b); const flat = t.clone().setY(0).normalize(); tan.push(t.normalize()); side.push(new THREE.Vector3(flat.z, 0, -flat.x)); }
    const seg = { pt: points, tan, side, closed, n, s: points.map((_, i) => sOf(i)), gap: f.map(x => !!x.gap), water: f.map(x => !!x.water), tunnel: f.map(x => !!x.tunnel) };
    segs.push(seg); return seg;
  }
  const main = makeSeg(Array.from({ length: N }, (_, i) => mainPos(T(i))), true, i => i / N, i => { const t = T(i); return { gap: inGap(t), tunnel: t > TUNNEL[0] && t < TUNNEL[1] }; });
  // 岔路：从主路的 FORK[0] 分出去，往里绕，穿过一片浅湖，到 FORK[1] 合回来
  const ia = Math.round(FORK[0] / (Math.PI * 2) * N), ib = Math.round(FORK[1] / (Math.PI * 2) * N);
  const C = new THREE.Vector3(-115, 0, -10);                         // 左边那个圈的中间
  const ctrl = [0, .12, .3, .5, .7, .88, 1].map((u, k) => { const t = FORK[0] + (FORK[1] - FORK[0]) * u, p = mainPos(t).setY(0); const off = [0, 12, 30, 38, 30, 12, 0][k]; const dir = C.clone().sub(p).setY(0).normalize(); return p.addScaledVector(dir, off); });
  const bcurve = new THREE.CatmullRomCurve3(ctrl, false, 'centripetal'), BN = 240;
  const bpts = bcurve.getSpacedPoints(BN - 1);
  const lakeC = bcurve.getPointAt(.5), LAKE = { x: lakeC.x, z: lakeC.z, rx: 26, rz: 18 };
  const inLake = (x, z) => ((x - LAKE.x) / LAKE.rx) ** 2 + ((z - LAKE.z) / LAKE.rz) ** 2 < 1;
  bpts.forEach(p => { p.y = inLake(p.x, p.z) ? -.35 : 0; });
  const branch = makeSeg(bpts, false, k => (ia + (ib - ia) * k / (BN - 1)) / N, k => ({ water: inLake(bpts[k].x, bpts[k].z) }));
  const pt = main.pt, tan = main.tan, side = main.side, gap = main.gap;

  // ---------- 路面（有厚度的板子；断桥 / 湖里不画） ----------
  const asphalt = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#4a4e57'; x.fillRect(0, 0, 64, 64); for (let i = 0; i < 300; i++) { x.fillStyle = Math.random() < .5 ? '#555a64' : '#40444c'; x.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
    x.fillStyle = '#ffffff'; x.fillRect(30, 0, 4, 28);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const dirt = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#b08968'; x.fillRect(0, 0, 64, 64); for (let i = 0; i < 260; i++) { x.fillStyle = Math.random() < .5 ? '#9c7656' : '#c4a07a'; x.fillRect(Math.random() * 64, Math.random() * 64, 3, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: .9 }), dirtMat = new THREE.MeshStandardMaterial({ map: dirt, roughness: 1 }), slabMat = M(0x868e96), edgeMat = new THREE.MeshStandardMaterial({ color: 0xff6b6b, side: THREE.DoubleSide });
  function ribbon(seg, i0, i1, mat, thick) {
    const top = [], uv = [], idx = [], bot = [], bidx = []; let n = 0;
    for (let i = i0; i <= i1; i++) {
      const k = seg.closed ? i % seg.n : i, p = seg.pt[k], sd = seg.side[k];
      const L = [p.x + sd.x * W / 2, p.y + .05, p.z + sd.z * W / 2], R = [p.x - sd.x * W / 2, p.y + .05, p.z - sd.z * W / 2];
      top.push(...L, ...R); uv.push(0, i / 4, 1, i / 4); bot.push(L[0], L[1] - .7, L[2], R[0], R[1] - .7, R[2]);
      if (i < i1) { idx.push(n * 2, n * 2 + 1, n * 2 + 2, n * 2 + 1, n * 2 + 3, n * 2 + 2); bidx.push(n * 2, n * 2 + 2, n * 2 + 1, n * 2 + 1, n * 2 + 2, n * 2 + 3); }
      n++;
    }
    const mk = (pos, ind, mt, uvs) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (uvs) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(ind); geo.computeVertexNormals(); g.add(new THREE.Mesh(geo, mt)); };
    mk(top, idx, mat, uv);
    if (!thick) return;
    mk(bot, bidx, slabMat);
    for (const s of [0, 1]) { const pos = [], ind = []; for (let k = 0; k < n; k++) { pos.push(...top.slice((k * 2 + s) * 3, (k * 2 + s) * 3 + 3), ...bot.slice((k * 2 + s) * 3, (k * 2 + s) * 3 + 3)); if (k < n - 1) ind.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2); } mk(pos, ind, edgeMat); }
  }
  function ribbons(seg, skip, mat, thick) { let start = null; const last = seg.closed ? seg.n : seg.n - 1;
    for (let i = 0; i <= last; i++) { const k = seg.closed ? i % seg.n : i; const off = skip(k) || i === last; if (!skip(k) && start === null) start = i; if (off && start !== null) { ribbon(seg, start, skip(k) ? i - 1 : i, mat, thick); start = null; } } }
  ribbons(main, k => main.gap[k], roadMat, true);
  ribbons(branch, k => branch.water[k], dirtMat, false);          // 近路是土路

  // 路肩（地面的部分）+ 护栏（高架上，缺口前后不放）+ 柱子
  const kerbA = M(0xe03131), kerbB = M(0xffffff), postM = M(0xdee2e6), railM = M(0xffd43b), pillarM = M(0xced4da);
  const nearGap = i => { for (let d = -10; d <= 10; d++) if (gap[(i + d + N) % N]) return true; return false; };
  const kerbList = [[], []];
  for (let i = 0; i < N; i += 3) {
    const p = pt[i], sd = side[i], tt = tan[i];
    if (gap[i]) continue;
    [1, -1].forEach(s => {
      if (p.y < 1) { const kb = new THREE.Object3D(); kb.position.set(p.x + sd.x * s * (W / 2 + .35), p.y + .08, p.z + sd.z * s * (W / 2 + .35)); kb.lookAt(kb.position.clone().add(tt)); kb.updateMatrix(); kerbList[(i / 3) % 2 ? 0 : 1].push(kb.matrix.clone()); }
      else if (i % 6 === 0 && !nearGap(i)) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 1.2, 6), postM); post.position.set(p.x + sd.x * s * (W / 2 - .2), p.y + .6, p.z + sd.z * s * (W / 2 - .2)); g.add(post); }
    });
  }
  kerbList.forEach((list, c) => { const im = new THREE.InstancedMesh(new THREE.BoxGeometry(.7, .16, 2.2), c ? kerbB : kerbA, list.length); list.forEach((mt, k) => im.setMatrixAt(k, mt)); g.add(im); });
  { const posts = []; g.children.forEach(o => { if (o.isMesh && o.geometry.type === 'CylinderGeometry' && o.material === postM && o.geometry.parameters.height === 1.2) posts.push(o); });
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(.09, .09, 1.2, 6), postM, posts.length); posts.forEach((o, k) => { o.updateMatrix(); im.setMatrixAt(k, o.matrix); g.remove(o); }); g.add(im); }
  [1, -1].forEach(s => { let run = [];
    const flush = () => { if (run.length > 3) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(run), run.length, .09, 6, false), railM)); run = []; };
    for (let i = 0; i <= N; i += 2) { const k = i % N, p = pt[k], sd = side[k]; if (p.y > 1 && !nearGap(k)) run.push(new THREE.Vector3(p.x + sd.x * s * (W / 2 - .2), p.y + 1.15, p.z + sd.z * s * (W / 2 - .2))); else flush(); }
    flush(); });
  // 地面那一半的路离柱子远一点：柱子不能挡在下面的路上
  const groundPts = pt.filter(p => p.y < 1.5);
  for (let i = 0; i < N; i += 14) { const p = pt[i]; if (p.y < 2.2 || gap[i]) continue;
    [1, -1].forEach(s => { const x = p.x + side[i].x * s * (W / 2 - 1), z = p.z + side[i].z * s * (W / 2 - 1);
      if (groundPts.some(q => Math.hypot(q.x - x, q.z - z) < W / 2 + 1)) return;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(.45, .6, p.y - .6, 10), pillarM); col.position.set(x, (p.y - .6) / 2, z); g.add(col); }); }
  // 断桥前的跳台箭头 + 警示条
  GAPS.forEach(([a]) => { const i = Math.round(a / (Math.PI * 2) * N) - 12; const p = pt[i], tt = tan[i];
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(W * .8, 2.2), new THREE.MeshBasicMaterial({ map: (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d');
      x.fillStyle = '#ffd43b'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#212529'; for (let k = -2; k < 12; k++) { x.beginPath(); x.moveTo(k * 26, 64); x.lineTo(k * 26 + 14, 64); x.lineTo(k * 26 + 40, 0); x.lineTo(k * 26 + 26, 0); x.fill(); }
      x.fillStyle = '#e03131'; x.fillRect(48, 10, 160, 44); x.fillStyle = '#fff'; x.font = 'bold 30px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('⚡ 加速飞过去！', 128, 33); return new THREE.CanvasTexture(x.canvas); })(), side: THREE.DoubleSide }));
    sign.position.set(p.x, p.y + 4.2, p.z); sign.lookAt(sign.position.clone().sub(tt)); g.add(sign);
    [1, -1].forEach(s => { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 4.4, 6), postM); pole.position.set(p.x + side[i].x * s * W * .4, p.y + 2.2, p.z + side[i].z * s * W * .4); g.add(pole); }); });
  // 起点：黑白格 + 拱门
  const p0 = pt[0], t0 = tan[0];
  const chk = (() => { const c = document.createElement('canvas'); c.width = 96; c.height = 16; const x = c.getContext('2d'); for (let i = 0; i < 24; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 4, j * 4, 4, 4); } const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t; })();
  const line = new THREE.Mesh(new THREE.PlaneGeometry(W, 2), new THREE.MeshBasicMaterial({ map: chk })); line.rotation.x = -Math.PI / 2; line.rotation.z = Math.atan2(t0.x, t0.z); line.position.set(p0.x, p0.y + .08, p0.z); g.add(line);
  // 起点在 8 字中间（地面那一条），头顶就是高架——拱门放在起点后面一点
  const iar = N - 40, pa = pt[iar], ta = tan[iar];
  const arch = new THREE.Group(); arch.position.set(pa.x, pa.y, pa.z); arch.rotation.y = Math.atan2(ta.x, ta.z); g.add(arch);
  const archM = M(0x1c7ed6, { metalness: .3 });
  [-1, 1].forEach(s => { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 8, 10), archM); pole.position.set(s * (W / 2 + 1.2), 4, 0); arch.add(pole); });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 3, 1.6, .5), archM); beam.position.y = 8; arch.add(beam);
  const archSign = (() => { const c = document.createElement('canvas'); c.width = 384; c.height = 64; const x = c.getContext('2d'); for (let i = 0; i < 48; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 8, j * 8, 8, 8); }
    x.fillStyle = 'rgba(255,107,53,.95)'; x.fillRect(92, 6, 200, 52); x.fillStyle = '#fff'; x.font = 'bold 36px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🏁 卡丁车岛', 192, 33); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  [1, -1].forEach(s => { const sp = new THREE.Mesh(new THREE.PlaneGeometry(W + 2.6, 1.4), new THREE.MeshBasicMaterial({ map: archSign })); sp.position.set(0, 8, s * .27); if (s < 0) sp.rotation.y = Math.PI; arch.add(sp); });
  // 一圈彩旗 + 灯泡（晚上会亮）
  const flagC = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2];
  for (let i = 0; i < N; i += 22) { const p = pt[i]; if (p.y > 1 || gap[i] || main.tunnel[i]) continue; const s = (i / 22) % 2 ? 1 : -1, x = p.x + side[i].x * s * (W / 2 + 3), z = p.z + side[i].z * s * (W / 2 + 3);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 3.6, 6), postM); pole.position.set(x, 1.8, z); g.add(pole);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(1, .6), M(flagC[(i / 22) % 5], { side: THREE.DoubleSide })); fl.position.set(x + .5, 3.3, z); g.add(fl);
    const b = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), new THREE.MeshBasicMaterial({ color: flagC[(i / 22) % 5] })); b.position.set(x, 3.7, z); b.userData.nightBulb = flagC[(i / 22) % 5]; g.add(b); }
  // 近路两边的小木桩
  for (let k = 0; k < branch.n; k += 6) { if (branch.water[k]) continue; const p = branch.pt[k], sd = branch.side[k];
    [1, -1].forEach(s => { const st = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, .8, 6), M(0x8b5a2b)); st.position.set(p.x + sd.x * s * (W / 2 + .4), .4, p.z + sd.z * s * (W / 2 + .4)); g.add(st); }); }

  // ---------- 湖：浅浅的水 + 沙滩 ----------
  const sand = new THREE.Mesh(new THREE.CircleGeometry(1, 48), M(0xe9d8a6)); sand.scale.set(LAKE.rx + 4, LAKE.rz + 4, 1); sand.rotation.x = -Math.PI / 2; sand.position.set(LAKE.x, .03, LAKE.z); g.add(sand);
  const bed = new THREE.Mesh(new THREE.CircleGeometry(1, 48), M(0x6c8ea0)); bed.scale.set(LAKE.rx, LAKE.rz, 1); bed.rotation.x = -Math.PI / 2; bed.position.set(LAKE.x, -.4, LAKE.z); g.add(bed);
  const waterTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#4dabf7'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 2; for (let i = 0; i < 18; i++) { x.beginPath(); const y = Math.random() * 128, x0 = Math.random() * 128; x.moveTo(x0, y); x.quadraticCurveTo(x0 + 10, y - 4, x0 + 20, y); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 4); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const water = new THREE.Mesh(new THREE.CircleGeometry(1, 48), new THREE.MeshStandardMaterial({ map: waterTex, transparent: true, opacity: .75, roughness: .1, metalness: .1 }));
  water.scale.set(LAKE.rx, LAKE.rz, 1); water.rotation.x = -Math.PI / 2; water.position.set(LAKE.x, .12, LAKE.z); g.add(water);
  for (let k = 0; k < 8; k++) { const a = k / 8 * 6.283; const lp = new THREE.Mesh(new THREE.CircleGeometry(.9, 12), M(0x40c057)); lp.rotation.x = -Math.PI / 2; lp.position.set(LAKE.x + Math.cos(a) * LAKE.rx * .7, .14, LAKE.z + Math.sin(a) * LAKE.rz * .75); g.add(lp); }
  // 岔路口的指示牌
  { const p = pt[ia], t0 = tan[ia], sd = side[ia];
    const tx = (() => { const c = document.createElement('canvas'); c.width = 640; c.height = 112; const x = c.getContext('2d'); x.fillStyle = '#1c7ed6'; x.beginPath(); x.roundRect(0, 0, 640, 112, 22); x.fill();
      x.fillStyle = '#fff'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('⬅ 正路      🌊 近路（过湖）➡', 320, 58); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.1), new THREE.MeshBasicMaterial({ map: tx, side: THREE.DoubleSide }));
    const q = pt[(ia - 30 + N) % N]; sg.position.set(q.x - sd.x * (W / 2 + 4), 4.2, q.z - sd.z * (W / 2 + 4)); sg.lookAt(sg.position.clone().sub(t0)); g.add(sg);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 4, 6), M(0xdee2e6)); pole.position.set(sg.position.x, 2, sg.position.z); g.add(pole); }

  // ---------- 隧道：沿着路做一个拱形，外面堆成一座小山，里面一排灯 ----------
  { const i0 = Math.round(TUNNEL[0] / (Math.PI * 2) * N), i1 = Math.round(TUNNEL[1] / (Math.PI * 2) * N), RT = W / 2 + 2.5, HT = 1.05, SEGS = 16;
    const pos = [], idx = []; let n = 0;
    for (let i = i0; i <= i1; i++) { const p = pt[i], sd = side[i];
      for (let k = 0; k <= SEGS; k++) { const a = k / SEGS * Math.PI; pos.push(p.x + sd.x * Math.cos(a) * RT, p.y + Math.sin(a) * RT * HT, p.z + sd.z * Math.cos(a) * RT); }
      if (i < i1) for (let k = 0; k < SEGS; k++) { const a0 = n * (SEGS + 1) + k, b0 = a0 + SEGS + 1; idx.push(a0, b0, a0 + 1, a0 + 1, b0, b0 + 1); }
      n++; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    g.add(new THREE.Mesh(geo, M(0x5c4d3c, { side: THREE.DoubleSide, flatShading: true })));
    // 洞口的石头框
    [i0, i1].forEach(i => { const p = pt[i], t = tan[i]; const arch = new THREE.Mesh(new THREE.TorusGeometry(RT, .8, 8, 20, Math.PI), M(0x868e96, { flatShading: true })); arch.position.set(p.x, p.y, p.z); arch.lookAt(arch.position.clone().add(t)); arch.scale.y = HT; g.add(arch); });
    // 山
    for (let i = i0 + 6; i <= i1 - 6; i += 14) { const p = pt[i]; [-1, 0, 1].forEach(s => { const r = s ? 5 + Math.random() * 2 : 4 + Math.random() * 2; const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), M(s ? 0x6b8f3e : 0x7a6a55, { flatShading: true })); rock.position.set(p.x + side[i].x * s * (RT + 1), p.y + (s ? RT * .55 : RT * HT + r * .35), p.z + side[i].z * s * (RT + 1)); rock.rotation.set(Math.random(), Math.random(), 0); g.add(rock); }); }
    // 里面的灯
    for (let i = i0 + 4; i < i1; i += 8) { const p = pt[i]; [-1, 1].forEach(s => { const b = new THREE.Mesh(new THREE.SphereGeometry(.35, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe066 })); b.position.set(p.x + side[i].x * s * (RT - .8), p.y + 4.5, p.z + side[i].z * s * (RT - .5)); g.add(b); }); }
  }
  // ---------- 维修区 + 看台 + 传送门 ----------
  const pitL = new THREE.Vector3(0, 0, 70);                 // 岛的局部坐标
  const pit = new THREE.Group(); pit.position.copy(pitL); g.add(pit);
  const pf = new THREE.Mesh(new THREE.BoxGeometry(16, .25, 9), M(0xced4da)); pf.position.y = .12; pit.add(pf);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(17, .4, 10), M(0xff922b)); roof.position.y = 4.6; pit.add(roof);
  [[-8, -4.4], [8, -4.4], [-8, 4.4], [8, 4.4]].forEach(([x, z]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, 4.5, 8), M(0xffffff)); p.position.set(x, 2.3, z); pit.add(p); });
  [-5, 0, 5].forEach((x, i) => { const k = buildKart([0xff6b6b, 0x4dabf7, 0xffd43b][i]); k.group.position.set(x, .25, 0); k.group.rotation.y = Math.PI; pit.add(k.group); });
  const stand = new THREE.Group(); stand.position.set(-34, 0, 30); stand.rotation.y = .35; g.add(stand);
  for (let r = 0; r < 5; r++) { const step = new THREE.Mesh(new THREE.BoxGeometry(22, .6, 1.4), M(r % 2 ? 0x74c0fc : 0x4dabf7)); step.position.set(0, .3 + r * .6, -r * 1.4); stand.add(step); }
  const portal = (lx, lz, color, label) => { const pg = new THREE.Group(); pg.position.set(lx, 0, lz); g.add(pg);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, .3, 12, 48), M(color, { emissive: color, emissiveIntensity: .8 })); ring.position.y = 2.8; pg.add(ring);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .45, side: THREE.DoubleSide })); disc.position.y = 2.8; pg.add(disc);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false })); gl.position.y = 2.8; gl.scale.setScalar(8); pg.add(gl);
    const lt = (() => { const c = document.createElement('canvas'); c.width = 320; c.height = 64; const x = c.getContext('2d'); x.fillStyle = 'rgba(26,20,70,.85)'; x.beginPath(); x.roundRect(0, 0, 320, 64, 30); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(label, 160, 34); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt, transparent: true })); lab.position.y = 6.2; lab.scale.set(6, 1.2, 1); pg.add(lab);
    pg.userData.spin = disc; return pg; };
  const back = portal(22, 82, 0x9775fa, '🎡 回乐园');
  const arrive = new THREE.Vector3(KI.x + 34, 0, KI.z + 62);    // 从乐园传送过来时站的地方（离回去的门远一点）
  // 树（避开赛道）
  const treeM = M(0x2f9e44, { flatShading: true }), trunkM = M(0x8b5a2b);
  for (let k = 0; k < 260; k++) { const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * (KI.R - 28), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (pt.some(p => Math.hypot(p.x - x, p.z - z) < W / 2 + 5) || branch.pt.some(p => Math.hypot(p.x - x, p.z - z) < W / 2 + 4) || ((x - LAKE.x) / (LAKE.rx + 6)) ** 2 + ((z - LAKE.z) / (LAKE.rz + 6)) ** 2 < 1 || Math.hypot(x - pitL.x, z - pitL.z) < 14 || Math.hypot(x - 22, z - 82) < 8 || Math.hypot(x + 34, z - 30) < 16) continue;
    const t = new THREE.Group(); t.position.set(x, 0, z); g.add(t); const s = .9 + Math.random() * .7;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(.25 * s, .35 * s, 2 * s, 6), trunkM); tr.position.y = s; t.add(tr);
    const cn = new THREE.Mesh(new THREE.ConeGeometry(1.6 * s, 3.6 * s, 7), treeM); cn.position.y = 3.4 * s; t.add(cn); }

  // ---------- 查询：路面支撑（考虑上下两层 + 岔路 + 湖） ----------
  const CELL = 10, grid = new Map();
  segs.forEach((sg, si) => sg.pt.forEach((p, i) => { const key = Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL); (grid.get(key) || grid.set(key, []).get(key)).push(si, i); }));
  function nearby(lx, lz) { const out = [], cx = Math.floor(lx / CELL), cz = Math.floor(lz / CELL); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = grid.get((cx + a) + ',' + (cz + b)); if (l) out.push(...l); } return out; }
  const mainIdx = (sg, i) => Math.round(sg.s[i] * N) % N;
  const api = {
    name: '卡丁车', icon: '🏎️', kind: 'kart', W, N, group: g,
    entry: [KI.x + pitL.x, KI.z + pitL.z + 6], entryR: 7,
    colliders: [],
    arrive, backPortal: { pos: [KI.x + 22, KI.z + 82], obj: back },
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
      return { i: mainIdx(bs, bi), y: p.y, lat: dx * bs.side[bi].x + dz * bs.side[bi].z, side: bs.side[bi], tan: bs.tan[bi], high: p.y > 1, railed: isMain && ((p.y > 1 && !nearGap(bi)) || main.tunnel[bi]), gap: bs.gap[bi], water: bs.water[bi], tunnel: bs.tunnel[bi], branch: !isMain };
    },
    pointAt(i) { const p = pt[((i % N) + N) % N]; return [KI.x + p.x, p.y, KI.z + p.z]; },
    tanAt(i) { return tan[((i % N) + N) % N]; },
    blocks() { return false; },
    debug: { segs, LAKE, ia, ib, TUNNEL, GAPS },
    update(dt) { back.userData.spin.rotation.z += dt; },
  };
  return api;
}
