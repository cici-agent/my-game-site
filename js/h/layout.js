// ===== 菜鸟家园布局：弯弯的主路 + 零零散散的大空地 + 弯弯的小道 =====
// 用固定种子的随机数生成，每次打开都一样；以后空地分给玩家时按 id 对应。
import * as THREE from 'three';

export const L = {
  plazaR: 22,        // 中心广场半径（以后放镇政府、商店、留言板）
  roadW: 5,          // 主路宽度
  laneW: 2.4,        // 小道宽度
  worldR: 330,       // 小镇范围
  plotMin: 64,       // 空地边长 64~72 米（用户说：把地扩得特别大，能放牛圈、羊圈和以后更多的东西）
  plotMax: 72,
  count: 24,         // 地大了，先做 24 块
};

export function createLayout(rnd) {
  const range = (a, b) => a + rnd() * (b - a);
  const V = (x, z) => new THREE.Vector3(x, 0, z);

  // ---------- 主路 ----------
  const roads = [];
  // 一条弯弯曲曲的环路
  {
    const pts = [], p1 = range(0, 6), p2 = range(0, 6);
    for (let k = 0; k < 16; k++) {
      const a = k / 16 * Math.PI * 2, r = 165 + 30 * Math.sin(3 * a + p1) + 16 * Math.sin(5 * a + p2);
      pts.push(V(Math.sin(a) * r, Math.cos(a) * r));
    }
    roads.push({ pts: new THREE.CatmullRomCurve3(pts, true, 'catmullrom', .5).getSpacedPoints(520), closed: true, w: L.roadW });
  }
  // 5 条从广场伸出去的弯路，方向不完全均匀
  {
    const n = 5, base = range(0, 6);
    for (let k = 0; k < n; k++) {
      const a0 = base + k / n * Math.PI * 2 + range(-.3, .3), wig = range(.2, .45) * (rnd() < .5 ? -1 : 1), ph = range(0, 6);
      const len = range(250, 300);
      const ctrl = [L.plazaR - 1, 60, 110, 165, 220, len].map((r, i) => {
        const a = a0 + Math.sin(i * 1.3 + ph) * wig * Math.min(1, i / 2) * (60 / Math.max(60, r)) * 1.6;
        return V(Math.sin(a) * r, Math.cos(a) * r);
      });
      const c = new THREE.CatmullRomCurve3(ctrl);
      roads.push({ pts: c.getSpacedPoints(Math.round(c.getLength() / 2)), closed: false, w: L.roadW });
    }
  }

  // ---------- 用网格加速"这个点在不在路上"的判断 ----------
  const CELL = 12, grid = new Map(), PAD = 5;
  const key = (i, j) => i * 10007 + j;
  function addPath(pts, w, closed) {
    const n = closed ? pts.length : pts.length - 1;
    for (let k = 0; k < n; k++) {
      const a = pts[k], b = pts[(k + 1) % pts.length], s = { ax: a.x, az: a.z, bx: b.x, bz: b.z, w };
      const r = w / 2 + PAD;
      for (let i = Math.floor((Math.min(a.x, b.x) - r) / CELL); i <= Math.floor((Math.max(a.x, b.x) + r) / CELL); i++)
        for (let j = Math.floor((Math.min(a.z, b.z) - r) / CELL); j <= Math.floor((Math.max(a.z, b.z) + r) / CELL); j++) {
          const kk = key(i, j); if (!grid.has(kk)) grid.set(kk, []); grid.get(kk).push(s);
        }
    }
  }
  function segDist(s, x, z) {
    const dx = s.bx - s.ax, dz = s.bz - s.az, l2 = dx * dx + dz * dz;
    let t = l2 ? ((x - s.ax) * dx + (z - s.az) * dz) / l2 : 0; t = Math.max(0, Math.min(1, t));
    return Math.hypot(x - s.ax - dx * t, z - s.az - dz * t);
  }
  function onPath(x, z, m = 0) {
    if (Math.hypot(x, z) < L.plazaR + m) return true;
    const list = grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL)));
    return !!list && list.some(s => segDist(s, x, z) < s.w / 2 + m);
  }
  roads.forEach(r => addPath(r.pts, r.w, r.closed));

  // ---------- 空地：沿着主路零零散散地放，离路远近不一、大小不一、方向跟着路 ----------
  const plots = [];
  const toLocal = (p, x, z) => { const dx = x - p.x, dz = z - p.z, c = Math.cos(p.rot), s = Math.sin(p.rot); return [dx * c - dz * s, dx * s + dz * c]; };
  const inPlot = (p, x, z, m = 0) => { const [lx, lz] = toLocal(p, x, z); return Math.abs(lx) < p.size / 2 + m && Math.abs(lz) < p.size / 2 + m; };
  const onPlot = (x, z, m = 0) => plots.some(p => inPlot(p, x, z, m));
  // 所有主路上的点（离广场太近的不要）
  const samples = [];
  roads.forEach(r => r.pts.forEach((p, i) => {
    if (Math.hypot(p.x, p.z) < L.plazaR + 18) return;
    const a = r.pts[Math.max(0, i - 1)], b = r.pts[Math.min(r.pts.length - 1, i + 1)];
    const t = V(b.x - a.x, b.z - a.z).normalize();
    samples.push({ p, t });
  }));
  const lanes = [];
  function bezier(a, c, b, n = 16) { const out = []; for (let i = 0; i <= n; i++) { const t = i / n, u = 1 - t; out.push(V(u * u * a.x + 2 * u * t * c.x + t * t * b.x, u * u * a.z + 2 * u * t * c.z + t * t * b.z)); } return out; }
  for (let tries = 0; tries < 6000 && plots.length < L.count; tries++) {
    const { p, t } = samples[Math.floor(rnd() * samples.length)];
    const side = rnd() < .5 ? -1 : 1, nx = t.z * side, nz = -t.x * side;           // 垂直于路，朝向放空地的一边
    const size = Math.round(range(L.plotMin, L.plotMax)), setback = range(9, 26);
    const d = L.roadW / 2 + setback + size / 2;
    // 顺着路方向再随便挪一点，不要正对着
    const slide = range(-8, 8);
    const plot = { id: 0, size, x: p.x + nx * d + t.x * slide, z: p.z + nz * d + t.z * slide, rot: 0, face: [-nx, -nz] };
    plot.rot = Math.atan2(-nx, -nz) + range(-.22, .22);                              // 门口大致朝着路，稍微歪一点
    const R = Math.hypot(plot.x, plot.z);
    if (R < L.plazaR + size || R > L.worldR - 40) continue;
    // 和其他空地隔开（至少 14 米）
    if (plots.some(o => Math.hypot(o.x - plot.x, o.z - plot.z) < (o.size + size) / 2 * 1.42 + 14)) continue;
    // 空地上不能有路穿过
    let hit = false;
    for (let i = Math.floor((plot.x - size) / CELL); i <= Math.floor((plot.x + size) / CELL) && !hit; i++)
      for (let j = Math.floor((plot.z - size) / CELL); j <= Math.floor((plot.z + size) / CELL) && !hit; j++) {
        const list = grid.get(key(i, j)); if (!list) continue;
        hit = list.some(s => [[s.ax, s.az], [s.bx, s.bz], [(s.ax + s.bx) / 2, (s.az + s.bz) / 2]].some(([x, z]) => inPlot(plot, x, z, s.w / 2 + 3)));
      }
    if (hit) continue;
    // 门口的位置（在空地朝路那条边的正中间）
    const fc = Math.sin(plot.rot), fz = Math.cos(plot.rot);
    plot.gate = V(plot.x + fc * size / 2, plot.z + fz * size / 2);
    plot.face = [fc, fz];
    // 门口小道：从主路弯弯地通到门口
    const mid = V((p.x + plot.gate.x) / 2 + t.x * range(-5, 5), (p.z + plot.gate.z) / 2 + t.z * range(-5, 5));
    const lane = bezier(p, mid, V(plot.gate.x - fc * .6, plot.gate.z - fz * .6), 18);
    if (lane.slice(2, -2).some(q => plots.some(o => inPlot(o, q.x, q.z, 1.5)))) continue;
    plot.id = plots.length + 1;
    plots.push(plot);
    lanes.push({ pts: lane, w: L.laneW });
  }
  // 相邻空地之间再连一些小道（每块最多连一条，连最近的那块）
  const linked = new Set();
  plots.forEach(a => {
    let best = null, bd = 80;
    plots.forEach(b => { if (b === a) return; const dd = a.gate.distanceTo(b.gate); if (dd < bd) { bd = dd; best = b; } });
    if (!best) return;
    const k = [a.id, best.id].sort((x, y) => x - y).join('-'); if (linked.has(k)) return;
    const m = V((a.gate.x + best.gate.x) / 2, (a.gate.z + best.gate.z) / 2);
    const off = V(-(best.gate.z - a.gate.z), best.gate.x - a.gate.x).normalize().multiplyScalar(range(-8, 8));
    const pts = bezier(V(a.gate.x - a.face[0] * .6, a.gate.z - a.face[1] * .6), m.add(off), V(best.gate.x - best.face[0] * .6, best.gate.z - best.face[1] * .6), 22);
    if (pts.slice(2, -2).some(q => plots.some(o => inPlot(o, q.x, q.z, 1)))) return;
    // 和已有的路 / 小道挨得太近（会变成两条并排的路）就不连
    lanes.forEach(l => addPath(l.pts, l.w, false));
    const near = pts.slice(3, -3).filter(q => onPath(q.x, q.z, 4)).length;
    grid.clear(); roads.forEach(r => addPath(r.pts, r.w, r.closed));
    if (near > (pts.length - 6) * .3) return;
    linked.add(k); lanes.push({ pts, w: L.laneW });
  });
  lanes.forEach(l => addPath(l.pts, l.w, false));

  // 路边随便一个点（用来种路边的花）
  function roadEdge(m) {
    const all = rnd() < .75 ? roads : lanes, r = all[Math.floor(rnd() * all.length)];
    const i = Math.floor(rnd() * (r.pts.length - 1)), a = r.pts[i], b = r.pts[i + 1];
    const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1, side = rnd() < .5 ? -1 : 1;
    const o = r.w / 2 + m;
    return [a.x + tz / l * o * side, a.z - tx / l * o * side];
  }

  // 出生点：第一条放射路上，离广场不远，面朝广场
  const sp = roads[1].pts[Math.min(roads[1].pts.length - 1, 8)];
  const spawn = { x: sp.x, z: sp.z, yaw: Math.atan2(-sp.x, -sp.z) };

  return { roads, lanes, plots, onPath, onPlot, roadEdge, spawn, toLocal };
}

// 把一条折线做成贴地的带子（路面）
export function ribbon(pts, w, closed = false) {
  const pos = [], idx = [], n = pts.length;
  for (let i = 0; i < n; i++) {
    const a = pts[closed ? (i - 1 + n) % n : Math.max(0, i - 1)], b = pts[closed ? (i + 1) % n : Math.min(n - 1, i + 1)];
    const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1, nx = tz / l * w / 2, nz = -tx / l * w / 2;
    pos.push(pts[i].x + nx, 0, pts[i].z + nz, pts[i].x - nx, 0, pts[i].z - nz);
  }
  const segs = closed ? n : n - 1;
  for (let i = 0; i < segs; i++) { const j = (i + 1) % n; idx.push(i * 2, i * 2 + 1, j * 2, i * 2 + 1, j * 2 + 1, j * 2); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  // 法线朝上（三角形方向不一定一致）
  const nrm = g.attributes.normal; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  return g;
}
