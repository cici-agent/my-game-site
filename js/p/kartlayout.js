// 卡丁车岛的赛道走向（纯数学，没有画东西）：主路一圈 + 一条岔路
// 四层：地下隧道（-8 米）· 地面 · 高架（10 米）· 螺旋坡上去的最高层（22 米）
import * as THREE from 'three';

const V = (x, z, y = 0) => new THREE.Vector3(x, y, z);
export const LAYOUT = {
  W: 18,
  startAt: [-60, 250],
  gaps: [[258, -45], [-205, -170]],            // 两个断桥（附近的位置）
  bumps: [[205, 185], [250, 95]],              // 波浪路：从这里到这里
  lake: { x: -276, z: 112, rx: 34, rz: 50 },
};
function mainControls() {
  const c = [
    V(-150, 252, 0), V(-60, 250, 0), V(40, 250, 0), V(130, 240, 0), V(205, 200, 0), V(245, 130, 0),
    V(258, 60, 3), V(260, 0, 8), V(258, -60, 10), V(257, -120, 10),
  ];
  // 螺旋坡：绕 1.25 圈从 10 米爬到 22 米
  const cx = 215, cz = -165, R = 42, turns = 1.25, n = 40;
  for (let k = 0; k <= n; k++) { const u = k / n, th = -u * turns * Math.PI * 2; c.push(V(cx + R * Math.cos(th), cz + R * Math.sin(th), 10 + 12 * u)); }
  c.push(V(140, -228, 22), V(40, -245, 22), V(-60, -240, 21), V(-140, -215, 17), V(-205, -170, 11), V(-250, -110, 4), V(-266, -45, 0),
    // 岔路口在这一段：主路往右下钻进地下隧道
    V(-262, 0, 0), V(-240, 40, -2.5), V(-200, 62, -7), V(-150, 66, -8), V(-80, 40, -8), V(-10, 0, -8), V(60, -5, -8), V(110, 40, -8),
    V(100, 110, -8), V(30, 140, -8), V(-50, 150, -8), V(-110, 168, -6), V(-150, 182, -2), V(-178, 185, 0), V(-200, 196, 0), V(-208, 218, 0), V(-196, 240, 0));
  return c;
}
function branchControls(A, B) {          // A/B：主路上分开 / 合回来的两点（各带方向）
  return [A[0], A[1], V(-290, 30), V(-252, 70), V(-300, 112), V(-252, 152), V(-302, 192), V(-270, 238), V(-230, 262), B[0], B[1]];
}
export function kartLayout() {
  const W = LAYOUT.W;
  const curve = new THREE.CatmullRomCurve3(mainControls(), true, 'centripetal');
  const L = curve.getLength(), N = Math.round(L);
  let pts = curve.getSpacedPoints(N).slice(0, N);
  // 起点线 = 第 0 个点
  const [sx, sz] = LAYOUT.startAt; let i0 = 0, bd = Infinity;
  pts.forEach((p, i) => { const d = (p.x - sx) ** 2 + (p.z - sz) ** 2; if (d < bd) { bd = d; i0 = i; } });
  pts = pts.slice(i0).concat(pts.slice(0, i0));
  const near = (x, z, lo = 0, hi = N) => { let bi = lo, b = Infinity; for (let i = lo; i < hi; i++) { const d = (pts[i].x - x) ** 2 + (pts[i].z - z) ** 2; if (d < b) { b = d; bi = i; } } return bi; };
  const gap = new Array(N).fill(false);
  LAYOUT.gaps.forEach(([x, z]) => { const g = near(x, z); for (let k = 0; k < 10; k++) gap[(g + k) % N] = true; for (let k = 1; k <= 9; k++) pts[(g - k + N) % N].y += 1.7 * Math.pow(1 - k / 9, 1.3); });
  { const a = near(...LAYOUT.bumps[0]), b = near(...LAYOUT.bumps[1]); for (let i = a; i < b; i++) pts[i].y += .65 * Math.max(0, Math.sin((i - a) / 7 * Math.PI * 2)); }
  const flagsMain = pts.map((p, i) => ({ gap: gap[i], tunnel: p.y <= -7.2, trench: p.y < -.25 && p.y > -7.2 }));
  // 岔路：在隧道入口前分开，绕湖，在起点线前合回来
  const ia = near(-266, -30), ib = near(-140, 252, N - 400, N);
  const ibm = ib % N;
  const bc = branchControls([pts[ia], pts[ia + 14]], [pts[(ib - 14) % N], pts[ibm]]);
  const bcurve = new THREE.CatmullRomCurve3(bc, false, 'centripetal'), BN = Math.round(bcurve.getLength());
  const bpts = bcurve.getSpacedPoints(BN - 1);
  const lk = LAYOUT.lake, inLake = (x, z) => ((x - lk.x) / lk.rx) ** 2 + ((z - lk.z) / lk.rz) ** 2 < 1;
  bpts.forEach(p => { p.y = inLake(p.x, p.z) ? -.35 : 0; });
  return { W, N, pts, flagsMain, ia, ib: ibm, bpts, flagsBranch: bpts.map(p => ({ water: inLake(p.x, p.z) })), inLake, L, lake: lk };
}
