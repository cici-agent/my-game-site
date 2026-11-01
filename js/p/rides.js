// ===== 游乐设施：摩天轮、过山车、旋转木马 =====
// 每个设施返回 { name, icon, entry:[x,z], entryR, group, colliders, update(dt,t), status(), board() }
// board() 返回 { seat: Object3D, done(): bool, view: 'follow' | 'pov', exitPos:[x,z] }
import * as THREE from 'three';

// 所有玩家共用同一个时钟（按真实时间算），大家看到的设施转到同一个位置，别人坐的座位才对得上
export const rideClock = () => Date.now() / 1000;

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .5, ...o });
const RAINBOW = [0xff6b6b, 0xffa94d, 0xffd43b, 0x69db7c, 0x4dabf7, 0x9775fa, 0xf783ac, 0x3bc9db];

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
    const b = new THREE.Mesh(new THREE.SphereGeometry(.16, 6, 6), new THREE.MeshBasicMaterial({ color: RAINBOW[k % RAINBOW.length] }));
    b.position.set(Math.cos(a) * R, Math.sin(a) * R, 1.45); wheel.add(b);
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
  let rot = 0, rider = null;
  const worldPos = new THREE.Vector3();
  return {
    name: '摩天轮', icon: '🎡', group: g,
    entry: [x + Math.sin(faceAngle) * 6, z + Math.cos(faceAngle) * 6], entryR: 4.5,
    colliders: [[x, z, 5.5]],
    seats: cabins.map(c => c.seat),
    update() {
      rot = (rideClock() * SPEED) % (Math.PI * 2 * 1e4); wheel.rotation.z = rot;
      cabins.forEach(c => { const a = c.pivot.userData.a0;
        c.pivot.position.set(Math.cos(a) * R, Math.sin(a) * R, 0); c.cab.rotation.z = -rot; });
    },
    status() { return '按 E 坐摩天轮'; },
    board(taken = []) {
      // 选当前最低、没人坐的吊舱，坐满一圈
      let best = cabins[0], lowY = Infinity;
      cabins.forEach((c, k) => { if (taken.includes(k)) return; c.seat.getWorldPosition(worldPos); if (worldPos.y < lowY) { lowY = worldPos.y; best = c; } });
      const start = rot;
      rider = best;
      // 相机放在转轮正面（入口那一侧），不会被支架挡住
      return { seat: best.seat, seatIndex: cabins.indexOf(best), view: 'follow', camDist: 15, camYaw: faceAngle + Math.PI, camPitch: .18, exitPos: this.entry, done: () => rot - start >= Math.PI * 2 - .05 };
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
  [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([a, b]) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 5, 6), supMat);
    const pp = st.clone().addScaledVector(side, 1.3 + a * 2.6).addScaledVector(tan, b * 4);
    pole.position.set(pp.x, 2.5, pp.z); g.add(pole);
  });
  // 列车：两节小车
  const train = [];
  for (let k = 0; k < 2; k++) {
    const car = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.7, .8, 2.2), M(k ? 0x4dabf7 : 0xffd23f)); body.position.y = .5; car.add(body);
    const front = new THREE.Mesh(new THREE.SphereGeometry(.85, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(k ? 0x4dabf7 : 0xffd23f));
    front.rotation.x = Math.PI / 2; front.position.set(0, .5, 1.1); front.scale.set(1, .6, .5); car.add(front);
    const seatBack = new THREE.Mesh(new THREE.BoxGeometry(1.5, .9, .2), M(0x2b2d42)); seatBack.position.set(0, 1.1, -.9); car.add(seatBack);
    const bar = new THREE.Mesh(new THREE.TorusGeometry(.55, .06, 6, 16, Math.PI), M(0xdddddd, { metalness: .6 })); bar.position.set(0, 1.1, .5); car.add(bar);
    const seat = new THREE.Object3D(); seat.position.set(0, .35, -.3); car.add(seat);
    car.userData.seat = seat; g.add(car); train.push(car);
  }
  // 运动：站台停 4 秒，链条匀速拉上坡，然后靠"重力"跑
  const hTop = Math.max(...samples.map(p => p.y));
  // 预先算好跑一圈的时刻表（和以前一样的“重力”速度），之后按共享时钟查表
  const DWELL = 4, table = [[0, 0]];
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
    entry: [platPos.x + side.x * 3.1, platPos.z + side.z * 3.1], entryR: 4.5,
    // 站台是长方形：[x, z, 半宽, 半长, 朝向]；外加顶棚的柱子
    colliders: [{ box: [platPos.x, platPos.z, 1.75, 4, Math.atan2(tan.x, tan.z)] },
      ...[[1, -1], [1, 1]].map(([a, b]) => { const pp = st.clone().addScaledVector(side, 1.3 + a * 2.6).addScaledVector(tan, b * 4); return [pp.x, pp.z, .3]; })],
    seats: train.map(c => c.userData.seat),
    update() {
      const now = rideClock(), c = now % CYCLE;
      lap = Math.floor(now / CYCLE);
      if (c < DWELL) { dwell = DWELL - c; u = 0; }
      else { dwell = 0; u = uAt(c - DWELL); }
      train.forEach((car, k) => place(car, u - k * 2.6 / L));
    },
    status(queued) { return dwell > 0 ? '按 E 坐过山车' : queued ? '排队中，过山车回站就上车…' : '按 E 排队，过山车回站就上车'; },
    canBoard() { return dwell > .3; },
    board(taken = []) {
      const k = taken.includes(0) && !taken.includes(1) ? 1 : 0;      // 第一节有人就坐第二节
      const startLap = lap; rider = train[k];
      return { seat: train[k].userData.seat, seatIndex: k, view: 'pov', exitPos: this.entry, done: () => lap > startLap && dwell > 0 };
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
  const horses = [];
  for (let k = 0; k < 8; k++) {
    const a = k / 8 * Math.PI * 2;
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 5, 6), M(0xdddddd, { metalness: .7 })); rod.position.set(Math.cos(a) * 4.3, 3.4, Math.sin(a) * 4.3); spin.add(rod);
    const h = horse(RAINBOW[k]); h.position.set(Math.cos(a) * 4.3, 2.2, Math.sin(a) * 4.3); h.rotation.y = -a; spin.add(h);
    h.userData.phase = k; horses.push(h);
  }
  let t0 = 0, rider = null;
  const wp = new THREE.Vector3();
  return {
    name: '旋转木马', icon: '🎠', group: g,
    entry: [x, z + R + 3.5], entryR: 4,
    colliders: [[x, z, R + 1]],
    seats: horses.map(h => h.userData.seat),
    update() {
      const now = rideClock() % 1e5;
      spin.rotation.y = now * .5; t0 = now;
      horses.forEach(h => h.position.y = 2.2 + Math.sin(now * 2.2 + h.userData.phase * 1.3) * .45);
    },
    status() { return '按 E 骑旋转木马'; },
    board(taken = []) {
      let best = horses[0], bd = Infinity;
      horses.forEach((h, k) => { if (taken.includes(k)) return; h.getWorldPosition(wp); const d = Math.hypot(wp.x - this.entry[0], wp.z - this.entry[1]); if (d < bd) { bd = d; best = h; } });
      const start = t0;
      // 相机自动绕到木马外侧、从顶篷下面看进来
      return { seat: best.userData.seat, seatIndex: horses.indexOf(best), view: 'follow', camDist: 10, camPitch: .1, camOutFrom: [x, z], exitPos: this.entry, done: () => t0 - start > 25 };
    },
  };
}
