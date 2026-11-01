// ===== 卡丁车岛：一座单独的大浮空岛 + 8 字形双层赛道（有高架、立交、飞跃断桥） =====
// 赛道中心线：8 字形（Gerono 曲线），一半在地面、一半爬上 10 米高架，在中间从另一条路头顶上过去
// 高架上有两个缺口（前面有跳台），要开快才能飞过去；掉下去按 R / 「回到赛道」回到检查点
import * as THREE from 'three';
import { buildKart } from './kart.js';
import { glowTex } from '../u/tex.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .7, ...o });
export const KI = { x: 0, z: -820, R: 192 };          // 岛的位置和大小（离乐园很远，互相看不见）

export function buildKartIsland(scene) {
  const g = new THREE.Group(); g.position.set(KI.x, 0, KI.z); scene.add(g);
  // ---------- 岛 ----------
  const grass = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    x.fillStyle = '#6fbf5a'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 1500; i++) { x.fillStyle = Math.random() < .5 ? '#64b350' : '#7dcc68'; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 5); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(30, 30); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const top = new THREE.Mesh(new THREE.CircleGeometry(KI.R, 128), M(0xffffff, { map: grass })); top.rotation.x = -Math.PI / 2; g.add(top);
  const rock = new THREE.Mesh(new THREE.ConeGeometry(KI.R, 80, 48, 6, true), M(0x8c6d52, { flatShading: true, side: THREE.DoubleSide })); rock.rotation.x = Math.PI; rock.position.y = -40.2; g.add(rock);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(KI.R, KI.R - 1, 2.4, 128, 1, true), M(0x5d8a3a, { side: THREE.DoubleSide })); rim.position.y = -1.2; g.add(rim);
  for (let k = 0; k < 260; k++) { const a = k / 260 * Math.PI * 2, rr = KI.R - 1.2; const post = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 1.3, 6), M(0xffffff)); post.position.set(Math.cos(a) * rr, .65, Math.sin(a) * rr); g.add(post); }
  const rail = new THREE.Mesh(new THREE.TorusGeometry(KI.R - 1.2, .08, 6, 220), M(0xff9f43)); rail.rotation.x = Math.PI / 2; rail.position.y = 1.2; g.add(rail);

  // ---------- 赛道中心线 ----------
  const N = 1100, W = 12, A = 150, B = 210, H = 10;
  const T = i => i / N * Math.PI * 2;
  // 断桥（缺口）：在高架上；t 范围
  const GAPS = [[2.36, 2.44], [4.02, 4.1]];
  const inGap = t => GAPS.some(([a, b]) => t > a && t < b);
  // 跳台：直直的斜坡，到边上最陡，车会被抛起来
  const kicker = t => GAPS.reduce((h, [a]) => h + (t > a - .08 && t <= a ? 1.6 * Math.pow((t - (a - .08)) / .08, 1.3) : 0), 0);
  const waves = t => (t > .35 && t < .95 ? .7 * Math.max(0, Math.sin((t - .35) * 52)) : 0) + (t > 5.4 && t < 5.9 ? .6 * Math.max(0, Math.sin((t - 5.4) * 46)) : 0);
  const pt = [], gap = [];
  for (let i = 0; i < N; i++) { const t = T(i); pt.push(new THREE.Vector3(A * Math.sin(t), H * (1 - Math.cos(t)) / 2 + kicker(t) + waves(t), B * Math.sin(t) * Math.cos(t))); gap.push(inGap(t)); }
  const tan = [], side = [];
  for (let i = 0; i < N; i++) { const t = new THREE.Vector3().subVectors(pt[(i + 1) % N], pt[(i - 1 + N) % N]); const flat = t.clone().setY(0).normalize(); tan.push(t.normalize()); side.push(new THREE.Vector3(flat.z, 0, -flat.x)); }
  // ---------- 路面（有厚度的板子；缺口处不画） ----------
  const asphalt = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#4a4e57'; x.fillRect(0, 0, 64, 64); for (let i = 0; i < 300; i++) { x.fillStyle = Math.random() < .5 ? '#555a64' : '#40444c'; x.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
    x.fillStyle = '#ffffff'; x.fillRect(30, 0, 4, 28);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt, roughness: .9 }), slabMat = M(0x868e96), sideMat = M(0xff6b6b);
  function ribbon(i0, i1) {             // 从 i0 到 i1 的一段路
    const top = [], uv = [], idx = [], bot = [], bidx = [], sides = [], sidx = [];
    let n = 0;
    for (let i = i0; i <= i1; i++) {
      const k = i % N, p = pt[k], sd = side[k];
      const L = [p.x + sd.x * W / 2, p.y + .05, p.z + sd.z * W / 2], R = [p.x - sd.x * W / 2, p.y + .05, p.z - sd.z * W / 2];
      top.push(...L, ...R); uv.push(0, i / 4, 1, i / 4);
      bot.push(L[0], L[1] - .7, L[2], R[0], R[1] - .7, R[2]);
      if (i < i1) { idx.push(n * 2, n * 2 + 1, n * 2 + 2, n * 2 + 1, n * 2 + 3, n * 2 + 2); bidx.push(n * 2, n * 2 + 2, n * 2 + 1, n * 2 + 1, n * 2 + 2, n * 2 + 3); }
      n++;
    }
    const mk = (pos, ind, mat, uvs) => { const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); if (uvs) geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geo.setIndex(ind); geo.computeVertexNormals(); g.add(new THREE.Mesh(geo, mat)); };
    mk(top, idx, roadMat, uv); mk(bot, bidx, slabMat);
    // 两侧的边（红色）
    for (const s of [0, 1]) { const pos = [], ind = []; for (let k = 0; k < n; k++) { const a = top.slice((k * 2 + s) * 3, (k * 2 + s) * 3 + 3), b = bot.slice((k * 2 + s) * 3, (k * 2 + s) * 3 + 3); pos.push(...a, ...b); if (k < n - 1) ind.push(k * 2, k * 2 + 1, k * 2 + 2, k * 2 + 1, k * 2 + 3, k * 2 + 2); } const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(ind); geo.computeVertexNormals(); g.add(new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0xff6b6b, side: THREE.DoubleSide }))); }
  }
  { let start = null; for (let i = 0; i <= N; i++) { const k = i % N; if (!gap[k] && start === null) start = i; if ((gap[k] || i === N) && start !== null) { ribbon(start, i === N ? N : i - 1); start = null; } } }
  void sideMat;
  // 路肩（地面的部分）+ 护栏（高架上，缺口前后不放）+ 柱子
  const kerbA = M(0xe03131), kerbB = M(0xffffff), postM = M(0xdee2e6), railM = M(0xffd43b), pillarM = M(0xced4da);
  const nearGap = i => { for (let d = -10; d <= 10; d++) if (gap[(i + d + N) % N]) return true; return false; };
  for (let i = 0; i < N; i += 3) {
    const p = pt[i], sd = side[i], tt = tan[i];
    if (gap[i]) continue;
    [1, -1].forEach(s => {
      if (p.y < 1) { const kb = new THREE.Mesh(new THREE.BoxGeometry(.7, .16, 2.2), (i / 3) % 2 ? kerbA : kerbB); kb.position.set(p.x + sd.x * s * (W / 2 + .35), p.y + .08, p.z + sd.z * s * (W / 2 + .35)); kb.lookAt(kb.position.clone().add(tt)); g.add(kb); }
      else if (i % 6 === 0 && !nearGap(i)) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.09, .09, 1.2, 6), postM); post.position.set(p.x + sd.x * s * (W / 2 - .2), p.y + .6, p.z + sd.z * s * (W / 2 - .2)); g.add(post); }
    });
  }
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
  const i0 = 0, p0 = pt[i0], t0 = tan[i0];
  const chk = (() => { const c = document.createElement('canvas'); c.width = 96; c.height = 16; const x = c.getContext('2d'); for (let i = 0; i < 24; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 4, j * 4, 4, 4); } const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t; })();
  const line = new THREE.Mesh(new THREE.PlaneGeometry(W, 2), new THREE.MeshBasicMaterial({ map: chk })); line.rotation.x = -Math.PI / 2; line.rotation.z = Math.atan2(t0.x, t0.z); line.position.set(p0.x, p0.y + .08, p0.z); g.add(line);
  // 起点在 8 字中间（地面那一条），头顶就是高架——拱门放在起点后面一点
  const ia = N - 40, pa = pt[ia], ta = tan[ia];
  const arch = new THREE.Group(); arch.position.set(pa.x, pa.y, pa.z); arch.rotation.y = Math.atan2(ta.x, ta.z); g.add(arch);
  const archM = M(0x1c7ed6, { metalness: .3 });
  [-1, 1].forEach(s => { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 8, 10), archM); pole.position.set(s * (W / 2 + 1.2), 4, 0); arch.add(pole); });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(W + 3, 1.6, .5), archM); beam.position.y = 8; arch.add(beam);
  const archSign = (() => { const c = document.createElement('canvas'); c.width = 384; c.height = 64; const x = c.getContext('2d'); for (let i = 0; i < 48; i++) for (let j = 0; j < 8; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 8, j * 8, 8, 8); }
    x.fillStyle = 'rgba(255,107,53,.95)'; x.fillRect(92, 6, 200, 52); x.fillStyle = '#fff'; x.font = 'bold 36px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🏁 卡丁车岛', 192, 33); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  [1, -1].forEach(s => { const sp = new THREE.Mesh(new THREE.PlaneGeometry(W + 2.6, 1.4), new THREE.MeshBasicMaterial({ map: archSign })); sp.position.set(0, 8, s * .27); if (s < 0) sp.rotation.y = Math.PI; arch.add(sp); });
  // 一圈彩旗 + 灯泡（晚上会亮）
  const flagC = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2];
  for (let i = 0; i < N; i += 22) { const p = pt[i]; if (p.y > 1 || gap[i]) continue; const s = (i / 22) % 2 ? 1 : -1, x = p.x + side[i].x * s * (W / 2 + 3), z = p.z + side[i].z * s * (W / 2 + 3);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.07, .07, 3.6, 6), postM); pole.position.set(x, 1.8, z); g.add(pole);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(1, .6), M(flagC[(i / 22) % 5], { side: THREE.DoubleSide })); fl.position.set(x + .5, 3.3, z); g.add(fl);
    const b = new THREE.Mesh(new THREE.SphereGeometry(.16, 8, 6), new THREE.MeshBasicMaterial({ color: flagC[(i / 22) % 5] })); b.position.set(x, 3.7, z); b.userData.nightBulb = flagC[(i / 22) % 5]; g.add(b); }

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
  for (let k = 0; k < 120; k++) { const a = Math.random() * Math.PI * 2, d = 20 + Math.random() * (KI.R - 28), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (pt.some(p => Math.hypot(p.x - x, p.z - z) < W / 2 + 5) || Math.hypot(x - pitL.x, z - pitL.z) < 14 || Math.hypot(x - 22, z - 82) < 8 || Math.hypot(x + 34, z - 30) < 16) continue;
    const t = new THREE.Group(); t.position.set(x, 0, z); g.add(t); const s = .9 + Math.random() * .7;
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(.25 * s, .35 * s, 2 * s, 6), trunkM); tr.position.y = s; t.add(tr);
    const cn = new THREE.Mesh(new THREE.ConeGeometry(1.6 * s, 3.6 * s, 7), treeM); cn.position.y = 3.4 * s; t.add(cn); }

  // ---------- 查询：路面支撑（考虑上下两层） ----------
  const CELL = 10, grid = new Map();
  pt.forEach((p, i) => { const key = Math.floor(p.x / CELL) + ',' + Math.floor(p.z / CELL); (grid.get(key) || grid.set(key, []).get(key)).push(i); });
  function nearby(lx, lz) { const out = [], cx = Math.floor(lx / CELL), cz = Math.floor(lz / CELL); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const l = grid.get((cx + a) + ',' + (cz + b)); if (l) out.push(...l); } return out; }
  const api = {
    name: '卡丁车', icon: '🏎️', kind: 'kart', W, N, group: g,
    entry: [KI.x + pitL.x, KI.z + pitL.z + 6], entryR: 7,
    colliders: [],
    arrive, backPortal: { pos: [KI.x + 22, KI.z + 82], obj: back },
    start: (() => { const i = N - 25, p = pt[i], tt = tan[i]; return { x: KI.x + p.x, z: KI.z + p.z, y: p.y, heading: Math.atan2(tt.x, tt.z), idx: i }; })(),
    onIsland(x, z) { return Math.hypot(x - KI.x, z - KI.z) < KI.R + 4; },
    // 车脚下的路：只算比车高不超过 1.2 米的路面（这样在立交下面不会“吸”到上面那层）
    support(x, y, z) {
      const lx = x - KI.x, lz = z - KI.z; let best = null, bd = Infinity;
      for (const i of nearby(lx, lz)) {
        const p = pt[i], dx = lx - p.x, dz = lz - p.z, lat = Math.abs(dx * side[i].x + dz * side[i].z), lon = Math.abs(dx * tan[i].x + dz * tan[i].z);
        if (lon > 2 || p.y > y + 1.2) continue;
        if (lat < W / 2 + .3 && !gap[i]) { if (!best || p.y > best.y + .5 || (Math.abs(p.y - best.y) <= .5 && lat < bd)) { best = { i, y: p.y, lat, side: side[i], p }; bd = lat; } }
      }
      return best;
    },
    // 离哪一段路最近（同一层），用来挡护栏、算进度
    nearest(x, y, z) {
      const lx = x - KI.x, lz = z - KI.z; let best = null, bd = Infinity;
      for (const i of nearby(lx, lz)) { const p = pt[i]; if (Math.abs(p.y - y) > 2.5) continue; const d = (lx - p.x) ** 2 + (lz - p.z) ** 2; if (d < bd) { bd = d; best = i; } }
      if (best === null) return null;
      const p = pt[best], dx = lx - p.x, dz = lz - p.z;
      return { i: best, y: p.y, lat: dx * side[best].x + dz * side[best].z, side: side[best], tan: tan[best], high: p.y > 1, railed: p.y > 1 && !nearGap(best), gap: gap[best] };
    },
    pointAt(i) { const p = pt[((i % N) + N) % N]; return [KI.x + p.x, p.y, KI.z + p.z]; },
    tanAt(i) { return tan[((i % N) + N) % N]; },
    blocks() { return false; },
    update(dt) { back.userData.spin.rotation.z += dt; },
  };
  return api;
}
