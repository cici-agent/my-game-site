// ===== 游乐设施：摩天轮、过山车、旋转木马 =====
// 每个设施返回 { name, icon, entry:[x,z], entryR, group, colliders, update(dt,t), status(), board() }
// board() 返回 { seat: Object3D, done(): bool, view: 'follow' | 'pov', exitPos:[x,z] }
import * as THREE from 'three';

// 所有玩家共用同一个时钟（按真实时间算），大家看到的设施转到同一个位置，别人坐的座位才对得上
export const rideClock = () => Date.now() / 1000;

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .5, ...o });
const RAINBOW = [0xff6b6b, 0xffa94d, 0xffd43b, 0x69db7c, 0x4dabf7, 0x9775fa, 0xf783ac, 0x3bc9db];
// 小灯泡：白天是暗暗的，晚上由 daynight.js 点亮（userData.nightBulb）
function bulb(parent, x, y, z, color, r = .14) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 8, 6), new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, y, z); m.userData.nightBulb = color; parent.add(m); return m;
}

// ---------------- 摩天轮 ----------------
export function ferrisWheel(x, z, faceAngle = 0) {
  const R = 11, hubY = R + 3.5, N = 10, SPEED = .2;
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = faceAngle;
  // 支架
  const white = M(0xffffff, { metalness: .3 });
  [-1, 1].forEach(side => [-1, 1].forEach(s => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.25, .35, hubY + 1, 8), white);
    leg.position.set(s * 3.2, hubY / 2, side * 1.8); leg.rotation.z = -s * .2; g.add(leg);
  }));
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 5, .6, 24), M(0xffe3c2)); base.position.y = .3; g.add(base);
  // 转轮
  const wheel = new THREE.Group(); wheel.position.y = hubY; g.add(wheel);
  const rimMat = M(0xff6b35, { emissive: 0xff6b35, emissiveIntensity: .25, metalness: .3 });
  [-1.2, 1.2].forEach(zz => {
    const rim = new THREE.Mesh(new THREE.TorusGeometry(R, .22, 8, 64), rimMat); rim.position.z = zz; wheel.add(rim);
    const inner = new THREE.Mesh(new THREE.TorusGeometry(R * .55, .12, 6, 48), white); inner.position.z = zz; wheel.add(inner);
    for (let k = 0; k < N; k++) {
      const a = k / N * Math.PI * 2;
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, R, 5), white);
      sp.position.set(Math.cos(a) * R / 2, Math.sin(a) * R / 2, zz); sp.rotation.z = a - Math.PI / 2; wheel.add(sp);
    }
  });
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 3.2, 16), M(0xffd23f, { metalness: .5 })); hub.rotation.x = Math.PI / 2; wheel.add(hub);
  // 彩灯
  for (let k = 0; k < 40; k++) {
    const a = k / 40 * Math.PI * 2;
    bulb(wheel, Math.cos(a) * R, Math.sin(a) * R, 1.45, RAINBOW[k % RAINBOW.length], .18);
    bulb(wheel, Math.cos(a) * R, Math.sin(a) * R, -1.45, RAINBOW[(k + 3) % RAINBOW.length], .18);
    if (k % 2 === 0) bulb(wheel, Math.cos(a) * R * .55, Math.sin(a) * R * .55, 1.3, 0xfff3bf, .12);
  }
  // 吊舱（始终保持竖直）
  const cabins = [];
  for (let k = 0; k < N; k++) {
    const pivot = new THREE.Group(); wheel.add(pivot);
    const cab = new THREE.Group(); pivot.add(cab);
    const c = RAINBOW[k % RAINBOW.length];
    const bottom = new THREE.Mesh(new THREE.CylinderGeometry(1.1, .9, .9, 12, 1, false), M(c)); bottom.position.y = -1.6; cab.add(bottom);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.2, .7, 12), M(c)); roof.position.y = .1; cab.add(roof);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 1.4, 5), white); rod.position.y = -.6; cab.add(rod);
    const seat = new THREE.Object3D(); seat.position.y = -1.85; cab.add(seat);
    pivot.userData = { a0: k / N * Math.PI * 2 }; cab.userData.seat = seat;
    cabins.push({ pivot, cab, seat });
  }
  let rot = 0, rider = null, phase = 'board', boardLeft = 0, cycleN = 0;
  const F_BOARD = 15, F_RUN = 36, F_CYCLE = F_BOARD + F_RUN;
  const worldPos = new THREE.Vector3();
  return {
    name: '摩天轮', icon: '🎡', group: g,
    entry: [x + Math.sin(faceAngle) * 6, z + Math.cos(faceAngle) * 6], entryR: 4.5, out: [Math.sin(faceAngle), Math.cos(faceAngle)],
    colliders: [[x, z, 5.5]],
    seats: cabins.map(c => c.seat),
    update() {
      // 一轮一轮：停下来上下客 15 秒 → 转整整一圈（慢慢起步、慢慢停）
      const now = rideClock(), c = now % F_CYCLE; cycleN = Math.floor(now / F_CYCLE);
      if (c < F_BOARD) { phase = 'board'; boardLeft = F_BOARD - c; } else phase = 'spin';
      const s2 = Math.max(0, c - F_BOARD), F = s2 < 4 ? s2 * s2 / 8 : s2 < F_RUN - 4 ? 2 + (s2 - 4) : F_RUN - 4 - (F_RUN - s2) ** 2 / 8;
      rot = F / (F_RUN - 4) * Math.PI * 2; wheel.rotation.z = rot;
      cabins.forEach(c => { const a = c.pivot.userData.a0;
        c.pivot.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); c.cab.rotation.z = -rot; });
    },
    status() { return '按 E 坐摩天轮'; },
    capacity: N,
    canBoard() { return phase === 'board' && boardLeft > 1; },
    boardTime() { return phase === 'board' ? boardLeft : 0; },
    // 上摩天轮：都走到最下面那个吊舱的门口
    boardSpot() { let lo = null; cabins.forEach(c => { c.seat.getWorldPosition(worldPos); if (!lo || worldPos.y < lo.y) lo = worldPos.clone(); }); return [lo.x, lo.z]; },
    board(taken = [], want = null) {
      const bk = want != null && cabins[want] && !taken.includes(want) ? want : cabins.findIndex((_, k) => !taken.includes(k)); if (bk < 0) return null;      // 坐满了：等下一轮
      const best = cabins[bk];
      const start = cycleN;
      rider = best;
      // 相机放在转轮正面（入口那一侧），不会被支架挡住
      return { seat: best.seat, seatIndex: cabins.indexOf(best), view: 'follow', camDist: 15, camYaw: faceAngle + Math.PI, camPitch: .18, exitPos: this.entry, done: () => cycleN > start && phase === 'board' };
    },
  };
}

// ---------------- 过山车 ----------------
export function rollerCoaster(cx, cz) {
  const g = new THREE.Group();
  // 轨道控制点：(角度, 半径x, 半径z, 高度)；第一段是站台，然后爬坡到最高点再冲下去
  const pts = [];
  const plan = [[0, 2.2], [.06, 2.2], [.12, 5], [.2, 14], [.26, 17], [.31, 15], [.37, 4], [.44, 3], [.5, 10], [.56, 11], [.62, 4],
    [.68, 7.5], [.74, 2.6], [.8, 6], [.86, 8], [.92, 3.2], [.97, 2.2]];
  plan.forEach(([u, h], i) => {
    const a = u * Math.PI * 2, wob = 1 + .18 * Math.sin(a * 3);
    pts.push(new THREE.Vector3(cx + Math.sin(a) * 26 * wob, h, cz + Math.cos(a) * 17 * wob));
  });
  const curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
  const L = curve.getLength();
  const S = 500, samples = curve.getSpacedPoints(S);
  const up = new THREE.Vector3(0, 1, 0);
  const railA = [], railB = [];
  const tan = new THREE.Vector3(), side = new THREE.Vector3();
  for (let i = 0; i < S; i++) {
    curve.getTangentAt(i / S, tan); side.crossVectors(tan, up).normalize();
    railA.push(samples[i].clone().addScaledVector(side, .7)); railB.push(samples[i].clone().addScaledVector(side, -.7));
  }
  const railMat = M(0xff3d6e, { metalness: .4, roughness: .35 });
  [railA, railB].forEach(r => g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(r, true), 600, .14, 6, true), railMat)));
  const spine = new THREE.Mesh(new THREE.TubeGeometry(curve, 600, .18, 6, true), M(0xffd23f)); spine.position.y = -.25; g.add(spine);
  const sleeperGeo = new THREE.BoxGeometry(1.8, .12, .3), sleeperMat = M(0x8b5a2b);
  const supMat = M(0xffffff, { metalness: .3 });
  for (let i = 0; i < S; i += 4) {
    const p = samples[i]; curve.getTangentAt(i / S, tan);
    const sl = new THREE.Mesh(sleeperGeo, sleeperMat); sl.position.copy(p); sl.position.y -= .12;
    sl.lookAt(p.clone().add(tan)); g.add(sl);
    if (i % 16 === 0 && p.y > 1.2) {
      const sp = new THREE.Mesh(new THREE.CylinderGeometry(.13, .18, p.y - .3, 6), supMat); sp.position.set(p.x, (p.y - .3) / 2, p.z); g.add(sp);
    }
  }
  // 站台
  const st = curve.getPointAt(0); curve.getTangentAt(0, tan); side.crossVectors(tan, up).normalize();
  const platform = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.6, 8), M(0xffe3c2));
  const platPos = st.clone().addScaledVector(side, 2.6); platform.position.set(platPos.x, .8, platPos.z);
  platform.lookAt(platPos.x + tan.x, .8, platPos.z + tan.z); g.add(platform);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(6, .3, 9), M(0xff6b35)); roof.position.set(st.x + side.x * 1.3, 5, st.z + side.z * 1.3);
  roof.lookAt(roof.position.x + tan.x, 5, roof.position.z + tan.z); g.add(roof);
  for (let i = -4; i <= 4; i++) [-1, 1].forEach(sd => { const pp = st.clone().addScaledVector(side, 1.3 + sd * 3).addScaledVector(tan, i * 1.05); bulb(g, pp.x, 4.75, pp.z, RAINBOW[(i + 8) % 8], .14); });
  // 轨道上每隔一段一颗灯
  for (let i = 0; i < S; i += 10) { const p = samples[i]; curve.getTangentAt(i / S, tan); side.crossVectors(tan, up).normalize(); bulb(g, p.x + side.x * .95, p.y + .05, p.z + side.z * .95, RAINBOW[(i / 10) % 8], .1); }
  curve.getTangentAt(0, tan); side.crossVectors(tan, up).normalize();
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 5, 6), supMat);
    const pp = st.clone().addScaledVector(side, 1.3 + a * 2.6).addScaledVector(tan, b * 4);
    pole.position.set(pp.x, 2.5, pp.z); g.add(pole);
  });
  // 列车：四节小车，每节坐两个人
  const train = [], cSeats = [];
  for (let k = 0; k < 4; k++) {
    const car = new THREE.Group();
    const cc = [0xffd23f, 0x4dabf7, 0xff6b6b, 0x69db7c, 0xda77f2, 0xff922b][k];
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, .8, 2.2), M(cc)); body.position.y = .5; car.add(body);
    const front = new THREE.Mesh(new THREE.SphereGeometry(.85, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(cc));
    front.rotation.x = Math.PI / 2; front.position.set(0, .5, 1.1); front.scale.set(1, .6, .5); car.add(front);
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(1.5, .9, .2), M(0x2b2d42)); seatBack.position.set(0, 1.1, -.9); car.add(seatBack);
    const bar = new THREE.Mesh(new THREE.TorusGeometry(.55, .06, 6, 16, Math.PI), M(0xdddddd, { metalness: .6 })); bar.position.set(0, 1.1, .5); car.add(bar);
    [-.42, .42].forEach(sx => { const seat = new THREE.Object3D(); seat.position.set(sx, .35, -.3); car.add(seat); cSeats.push(seat); });
    car.userData.seat = cSeats[cSeats.length - 2]; g.add(car); train.push(car);
  }
  // 运动：站台停 4 秒，链条匀速拉上坡，然后靠"重力"跑
  const hTop = Math.max(...samples.map(p => p.y));
  // 预先算好跑一圈的时刻表（和以前一样的“重力”速度），之后按共享时钟查表
  const DWELL = 12, table = [[0, 0]];
  { let uu = 0, tt = 0; const dtS = 1 / 120, pp = new THREE.Vector3();
    while (uu < 1) {
      curve.getPointAt(uu % 1, pp);
      const lift = uu > .07 && uu < .26;
      const vv = lift ? 5 : Math.max(4, Math.sqrt(Math.max(0, 2 * 9.8 * (hTop + .8 - pp.y))) * .95);
      uu += vv * dtS / L; tt += dtS; table.push([tt, Math.min(1, uu)]);
    } }
  const LAP = table[table.length - 1][0], CYCLE = DWELL + LAP;
  function uAt(sec) { let lo = 0, hi = table.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (table[m][0] < sec) lo = m; else hi = m; }
    const [t0, u0] = table[lo], [t1, u1] = table[hi]; return u0 + (u1 - u0) * ((sec - t0) / Math.max(1e-6, t1 - t0)); }
  let u = 0, dwell = 4, lap = 0, rider = null;
  const pos = new THREE.Vector3(), look = new THREE.Vector3();
  function place(car, uu) {
    curve.getPointAt(((uu % 1) + 1) % 1, pos); curve.getTangentAt(((uu % 1) + 1) % 1, tan);
    car.position.copy(pos); car.lookAt(look.copy(pos).add(tan));
  }
  return {
    name: '过山车', icon: '🎢', group: g, curve,
    // 上下车的位置在站台外侧，不会卡进站台里
    entry: [platPos.x + side.x * 3.1, platPos.z + side.z * 3.1], entryR: 4.5, out: [side.x, side.z],
    // 站台是长方形：[x, z, 半宽, 半长, 朝向]；外加顶棚的柱子
    colliders: [{ box: [platPos.x, platPos.z, 1.75, 4, Math.atan2(tan.x, tan.z)] },
      ...[[1, -1], [1, 1]].map(([a, b]) => { const pp = st.clone().addScaledVector(side, 1.3 + a * 2.6).addScaledVector(tan, b * 4); return [pp.x, pp.z, .3]; })],
    seats: cSeats, capacity: cSeats.length,
    update() {
      const now = rideClock(), c = now % CYCLE;
      lap = Math.floor(now / CYCLE);
      if (c < DWELL) { dwell = DWELL - c; u = 0; }
      else { dwell = 0; u = uAt(c - DWELL); }
      train.forEach((car, k) => place(car, u - k * 2.6 / L));
    },
    status(queued) { return dwell > 0 ? '按 E 坐过山车' : queued ? '排队中，过山车回站就上车…' : '按 E 排队，过山车回站就上车'; },
    canBoard() { return dwell > 1; },
    boardTime() { return dwell; },
    board(taken = [], want = null) {
      const k = want != null && cSeats[want] && !taken.includes(want) ? want : cSeats.findIndex((_, i) => !taken.includes(i)); if (k < 0) return null;      // 坐满了：等下一趟
      const startLap = lap; rider = train[k >> 1];
      return { seat: cSeats[k], seatIndex: k, view: 'pov', exitPos: this.entry, done: () => lap > startLap && dwell > 0 };
    },
  };
}

// ---------------- 旋转木马 ----------------
function horse(color) {
  const h = new THREE.Group();
  const m = M(color), white = M(0xffffff);
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.42, 1.1, 6, 12), m); body.rotation.x = Math.PI / 2; h.add(body);
  const neck = new THREE.Mesh(new THREE.CapsuleGeometry(.22, .6, 4, 8), m); neck.position.set(0, .5, .65); neck.rotation.x = -.6; h.add(neck);
  const head = new THREE.Mesh(new THREE.CapsuleGeometry(.22, .45, 4, 8), m); head.position.set(0, .85, .95); head.rotation.x = 1.2; h.add(head);
  const mane = new THREE.Mesh(new THREE.BoxGeometry(.1, .7, .25), M(0xffd23f)); mane.position.set(0, .75, .55); mane.rotation.x = -.6; h.add(mane);
  [[-.22, .5], [.22, .5], [-.22, -.5], [.22, -.5]].forEach(([x, z]) => {
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(.08, .07, .8, 6), m); leg.position.set(x, -.6, z); leg.rotation.x = z > 0 ? -.5 : .5; h.add(leg);
  });
  const saddle = new THREE.Mesh(new THREE.BoxGeometry(.6, .12, .55), M(0xff3d6e)); saddle.position.y = .45; h.add(saddle);
  const seat = new THREE.Object3D(); seat.position.set(0, .25, -.15); h.add(seat); h.userData.seat = seat;
  void white;
  return h;
}
export function carousel(x, z) {
  const R = 6, g = new THREE.Group(); g.position.set(x, 0, z);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(R + .6, R + .9, .6, 32), M(0xffe3c2)); base.position.y = .3; g.add(base);
  const spin = new THREE.Group(); g.add(spin);
  const deck = new THREE.Mesh(new THREE.CylinderGeometry(R, R, .3, 32), M(0xf783ac)); deck.position.y = .75; spin.add(deck);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.6, .6, 6, 16), M(0xffd23f, { metalness: .4 })); pole.position.y = 3.6; spin.add(pole);
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(R + 1, 3, 16), M(0xff6b6b)); canopy.position.y = 7.6; spin.add(canopy);
  for (let k = 0; k < 16; k++) {
    const stripe = new THREE.Mesh(new THREE.ConeGeometry(R + 1.02, 3, 16, 1, true, k / 16 * Math.PI * 2, Math.PI / 16),
      M(0xffffff, { side: THREE.DoubleSide })); stripe.position.y = 7.6; if (k % 2) spin.add(stripe);
  }
  const skirt = new THREE.Mesh(new THREE.CylinderGeometry(R + 1, R + 1, .8, 32, 1, true), M(0xffd23f, { side: THREE.DoubleSide })); skirt.position.y = 5.7; spin.add(skirt);
  const top = new THREE.Mesh(new THREE.SphereGeometry(.5, 12, 8), M(0xffd23f)); top.position.y = 9.3; spin.add(top);
  for (let k = 0; k < 32; k++) { const a = k / 32 * Math.PI * 2; bulb(spin, Math.cos(a) * (R + 1.05), 5.7, Math.sin(a) * (R + 1.05), k % 2 ? 0xfff3bf : 0xff8fab, .16); }
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2; bulb(spin, Math.cos(a) * 1.2, 4.6, Math.sin(a) * 1.2, 0xffe066, .12); }
  const horses = [];
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 5, 6), M(0xdddddd, { metalness: .7 })); rod.position.set(Math.cos(a) * 4.3, 3.4, Math.sin(a) * 4.3); spin.add(rod);
    const h = horse(RAINBOW[k]); h.position.set(Math.cos(a) * 4.3, 2.2, Math.sin(a) * 4.3); h.rotation.y = -a; spin.add(h);
    h.userData.phase = k; horses.push(h);
  }
  let t0 = 0, rider = null, phase = 'board', boardLeft = 0, cycleN = 0, angle = 0, lastNow = 0, bobK = 0;
  const C_BOARD = 12, C_RUN = 26, C_CYCLE = C_BOARD + C_RUN;
  const wp = new THREE.Vector3();
  return {
    name: '旋转木马', icon: '🎠', group: g,
    // 圆形的设施：走到一圈任何地方都能上（以前只有南边一个点，很难找到）
    entry: [x, z], entryR: R + 3.6, exit: [x, z + R + 3.5], gate: [x, z + R + 2.2], out: [0, 1],
    colliders: [[x, z, R + 1]],
    seats: horses.map(h => h.userData.seat),
    capacity: 8,
    update() {
      // 一轮一轮：停下上客 12 秒 → 转 26 秒（慢慢加速、再慢慢停）
      const now = rideClock(), c = now % C_CYCLE; cycleN = Math.floor(now / C_CYCLE); t0 = now;
      if (c < C_BOARD) { phase = 'board'; boardLeft = C_BOARD - c; }
      else phase = 'spin';
      // 转过的角度只看时钟（大家看到的一样）：每一轮转的量一样，起步和停下是慢慢的
      const s2 = Math.max(0, c - C_BOARD), F = s2 < 4 ? s2 * s2 / 8 : s2 < C_RUN - 4 ? 2 + (s2 - 4) : C_RUN - 4 - (C_RUN - s2) ** 2 / 8;
      angle = ((cycleN * (C_RUN - 4) * .5) % (Math.PI * 2)) + F * .5; spin.rotation.y = angle;
      const bob = phase === 'spin' ? 1 : 0; bobK += (bob - bobK) * .05;
      horses.forEach(h => h.position.y = 2.2 + Math.sin(now * 2.2 + h.userData.phase * 1.3) * .45 * bobK);
    },
    status() { return '按 E 骑旋转木马'; },
    canBoard() { return phase === 'board' && boardLeft > 1; },
    boardTime() { return phase === 'board' ? boardLeft : 0; },
    board(taken = [], want = null) {
      if (horses.every((_, k) => taken.includes(k))) return null;
      let best = null, bd = Infinity;
      const me = this.playerPos || [x, z + R + 3.5];
      horses.forEach((h, k) => { if (taken.includes(k)) return; h.getWorldPosition(wp); const d = Math.hypot(wp.x - me[0], wp.z - me[1]); if (d < bd) { bd = d; best = h; } });
      if (want != null && horses[want] && !taken.includes(want)) best = horses[want];
      // 从哪边上就从哪边下
      const ang = Math.atan2(me[0] - x, me[1] - z), exitPos = [x + Math.sin(ang) * (R + 3.2), z + Math.cos(ang) * (R + 3.2)];
      const start = cycleN;
      // 相机自动绕到木马外侧、从顶篷下面看进来
      return { seat: best.userData.seat, seatIndex: horses.indexOf(best), view: 'follow', camDist: 10, camPitch: .1, camOutFrom: [x, z], exitPos, done: () => cycleN > start && phase === 'board' };
    },
  };
}

// ---------------- 海盗船 ----------------
// 大家共用同一个时钟：上船 8 秒 → 摆 26 秒（越摆越高再慢慢停下）→ 再上船……
export function pirateShip(cx, cz) {
  const SC = 1.45;                                   // 整个放大
  const g = new THREE.Group(); g.position.set(cx, 0, cz); g.scale.setScalar(SC);
  const AXLE = 14, ARM = 9, BOARD = 14, SWING = 26, PERIOD = 4.8, CYCLE = BOARD + SWING, AMAX = 1.38;   // 荡得更高（最高约 80°）
  const white = M(0xffffff, { metalness: .3 }), gold = M(0xffd23f, { metalness: .5, roughness: .3 });
  // 两个 A 字形支架 + 横轴
  [-3.4, 3.4].forEach(zz => [-1, 1].forEach(s => {
    const len = Math.hypot(7.5, AXLE), leg = new THREE.Mesh(new THREE.CylinderGeometry(.28, .4, len, 10), M(0x4dabf7, { metalness: .3 }));
    leg.position.set(s * 3.75, AXLE / 2, zz); leg.rotation.z = s * Math.atan2(7.5, AXLE); g.add(leg);
  }));
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, 7.6, 12), gold); axle.rotation.x = Math.PI / 2; axle.position.y = AXLE; g.add(axle);
  const base = new THREE.Mesh(new THREE.BoxGeometry(17, .4, 8.6), M(0xffe3c2)); base.position.y = .2; g.add(base);
  // 上船的台子 + 台阶
  const deck = new THREE.Mesh(new THREE.BoxGeometry(10, 1.2, 2.2), M(0xc8a165)); deck.position.set(0, .6, 5.2); g.add(deck);
  for (let i = 0; i < 3; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(3, .4, .7), M(0xb08a55)); st.position.set(0, .2 + i * .4 - .2, 7 - i * .6); g.add(st); }

  // 会摆动的部分：从横轴挂下来
  const swing = new THREE.Group(); swing.position.y = AXLE; g.add(swing);
  [-2.6, 2.6].forEach(zz => [-1, 1].forEach(s => {
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(.16, .16, ARM + .6, 8), white);
    arm.position.set(s * 1.6, -ARM / 2, zz); arm.rotation.z = -s * .18; swing.add(arm);
    for (let i = 1; i < 8; i++) bulb(swing, s * (.0 + i / 8 * 1.6 * 1.05), -i / 8 * ARM, zz + (zz > 0 ? .2 : -.2), RAINBOW[i % 8], .12);
  }));
  const ship = new THREE.Group(); ship.position.y = -ARM - 1.6; swing.add(ship);
  // 船身：侧面轮廓挤出成立体，两头翘起来
  const hull = new THREE.Shape();
  hull.moveTo(-8.2, 2.6); hull.quadraticCurveTo(-7.4, .2, -5.2, -.6); hull.lineTo(5.2, -.6); hull.quadraticCurveTo(7.4, .2, 8.2, 2.6);
  hull.lineTo(7.2, 2.2); hull.quadraticCurveTo(6.4, 1.2, 5, 1.1); hull.lineTo(-5, 1.1); hull.quadraticCurveTo(-6.4, 1.2, -7.2, 2.2); hull.closePath();
  const hullGeo = new THREE.ExtrudeGeometry(hull, { depth: 3.6, bevelEnabled: true, bevelSize: .2, bevelThickness: .2, bevelSegments: 2 });
  hullGeo.translate(0, 0, -1.8);
  ship.add(new THREE.Mesh(hullGeo, M(0x8b5a2b)));
  // 红色腰线 + 金边 + 圆窗
  const band = new THREE.Shape(); band.moveTo(-6.6, .55); band.lineTo(6.6, .55); band.lineTo(6.9, .95); band.lineTo(-6.9, .95); band.closePath();
  [-1, 1].forEach(s => {
    const b = new THREE.Mesh(new THREE.ExtrudeGeometry(band, { depth: .08, bevelEnabled: false }), M(0xe03131)); b.position.z = s * 2.02 - (s < 0 ? .08 : 0); ship.add(b);
    for (let i = -4; i <= 4; i += 2) {
      const ph = new THREE.Mesh(new THREE.TorusGeometry(.28, .07, 6, 14), gold); ph.position.set(i, .1, s * 2.05); ship.add(ph);
      const gl = new THREE.Mesh(new THREE.CircleGeometry(.24, 14), M(0x74c0fc, { emissive: 0x1c7ed6, emissiveIntensity: .3 })); gl.position.set(i, .1, s * 2.04); gl.rotation.y = s < 0 ? Math.PI : 0; ship.add(gl);
    }
  });
  for (let i = -5; i <= 5; i++) [-1.95, 1.95].forEach(zz => bulb(ship, i, 2.1, zz, i % 2 ? 0xffe066 : 0xff6b6b, .13));
  const rail = new THREE.Mesh(new THREE.BoxGeometry(10.4, .18, .18), gold);
  [-1.95, 1.95].forEach(zz => { const r = rail.clone(); r.position.set(0, 1.9, zz); ship.add(r); });
  // 甲板 + 一排排座位（5 排 × 2 个）
  const floor = new THREE.Mesh(new THREE.BoxGeometry(10.4, .2, 3.6), M(0xd9a35b)); floor.position.y = .9; ship.add(floor);
  const seats = [];
  [-4, -2, 0, 2, 4].forEach(xx => {
    const bench = new THREE.Mesh(new THREE.BoxGeometry(.9, .45, 3.2), M(0x1c7ed6)); bench.position.set(xx, 1.25, 0); ship.add(bench);
    const back = new THREE.Mesh(new THREE.BoxGeometry(.15, .8, 3.2), M(0x1971c2)); back.position.set(xx - Math.sign(xx || 1) * .45, 1.75, 0); ship.add(back);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 3.2, 6), M(0xdddddd, { metalness: .6 })); bar.rotation.x = Math.PI / 2; bar.position.set(xx + Math.sign(xx || 1) * .55, 1.9, 0); ship.add(bar);
    [-1.15, 0, 1.15].forEach(zz => {
      const seat = new THREE.Object3D(); seat.position.set(xx, 1.85, zz);
      seat.rotation.y = (xx < 0 || (xx === 0 && zz <= 0)) ? Math.PI / 2 : -Math.PI / 2;      // 两边的人面朝船中间
      ship.add(seat); seats.push(seat);
    });
  });
  // 船头像：一只金色小鸡；桅杆 + 条纹帆 + 海盗旗（笑脸骷髅）
  const fig = new THREE.Mesh(new THREE.SphereGeometry(.55, 14, 10), gold); fig.position.set(8.4, 2.9, 0); ship.add(fig);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.18, .4, 8), M(0xff922b)); beak.rotation.z = -Math.PI / 2; beak.position.set(9, 2.95, 0); ship.add(beak);
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(.16, .2, 6.5, 8), M(0x6b3e26)); mast.position.set(-6.2, 4.6, 0); ship.add(mast);
  const sailTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 128; const x = c.getContext('2d');
    for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#ff6b6b'; x.fillRect(0, i * 16, 128, 16); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const sail = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3, 6, 4), new THREE.MeshStandardMaterial({ map: sailTex, side: THREE.DoubleSide, roughness: .7 }));
  sail.position.set(-6.2, 4.8, 0); sail.rotation.y = Math.PI / 2; ship.add(sail);
  { const p = sail.geometry.attributes.position; for (let i = 0; i < p.count; i++) p.setZ(i, Math.cos(p.getX(i) / 1.7 * Math.PI / 2) * .5); sail.geometry.computeVertexNormals(); }
  const flagTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 80; const x = c.getContext('2d');
    x.fillStyle = '#212529'; x.fillRect(0, 0, 128, 80); x.fillStyle = '#fff';
    x.beginPath(); x.arc(64, 34, 18, 0, 7); x.fill(); x.fillRect(54, 44, 20, 12);
    x.fillStyle = '#212529'; x.beginPath(); x.arc(57, 32, 5, 0, 7); x.arc(71, 32, 5, 0, 7); x.fill();
    x.strokeStyle = '#212529'; x.lineWidth = 3; x.beginPath(); x.arc(64, 40, 7, .2, Math.PI - .2); x.stroke();
    x.strokeStyle = '#fff'; x.lineWidth = 6; x.beginPath(); x.moveTo(38, 60); x.lineTo(90, 74); x.moveTo(90, 60); x.lineTo(38, 74); x.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.1, 6, 1), new THREE.MeshStandardMaterial({ map: flagTex, side: THREE.DoubleSide }));
  flag.position.set(-6.2 + .95, 7.4, 0); flag.rotation.y = 0; ship.add(flag);
  const flagBase = flag.geometry.attributes.position.array.slice();

  let theta = 0, phase = 'board', boardLeft = BOARD, cycleN = 0;
  return {
    name: '海盗船', icon: '🏴‍☠️', group: g, seats, capacity: seats.length,
    entry: [cx, cz + 7.2 * SC], entryR: 5, out: [0, 1],
    colliders: [{ box: [cx, cz, 9.2 * SC, 3.6 * SC, 0] }, { box: [cx, cz + 5.2 * SC, 5 * SC, 1.1 * SC, 0] }],
    update() {
      const now = rideClock(), c = now % CYCLE;
      cycleN = Math.floor(now / CYCLE);
      if (c < BOARD) { phase = 'board'; boardLeft = BOARD - c; theta = 0; }
      else {
        phase = 'swing'; const s = c - BOARD;
        const amp = AMAX * Math.pow(Math.sin(Math.PI * s / SWING), .8);
        theta = amp * Math.sin(2 * Math.PI * s / PERIOD);
      }
      swing.rotation.z = theta;
      const a = flag.geometry.attributes.position.array;
      for (let i = 0; i < a.length; i += 3) a[i + 2] = Math.sin(now * 6 + flagBase[i] * 3) * .08 * (flagBase[i] + .9);
      flag.geometry.attributes.position.needsUpdate = true;
    },
    status(queued) { return phase === 'board' ? '按 E 坐海盗船' : queued ? '排队中，海盗船停下就上船…' : '按 E 排队，海盗船停下就上船'; },
    canBoard() { return phase === 'board' && boardLeft > .4; },
    boardTime() { return phase === 'board' ? boardLeft : 0; },
    board(taken = [], want = null) {
      const k = want != null && seats[want] && !taken.includes(want) ? want : seats.findIndex((_, i) => !taken.includes(i)); if (k < 0) return null;
      const start = cycleN;
      return { seat: seats[k], seatIndex: k, view: 'follow', camDist: 30, camYaw: Math.PI, camPitch: .15, exitPos: this.entry,
        done: () => cycleN > start && phase === 'board' };
    },
  };
}
