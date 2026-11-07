// ===== 环园小火车：绕乐园最外圈一圈，南、北两个车站；上车以后可以在车厢里走来走去 =====
// 按共用时钟开（大家看到的火车位置一样）：南站停 15 秒 → 开到北站 → 北站停 15 秒 → 开回南站（一直往同一个方向绕）
import * as THREE from 'three';
import { buildPerson } from './npc.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .6, ...o });
export const TRAIN_R = 205;
const DWELL = 15, RUN = 75, CYCLE = 2 * (DWELL + RUN), NCAR = 4, CAR_L = 7.2, GAP = .5, TS = 1.6;      // TS：整列火车放大 1.6 倍，人站得下、坐得下
const ST_A = Math.PI / 2, ST_B = Math.PI * 1.5;                 // 南站、北站的角度（x = R cosθ, z = R sinθ）

function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

// 一节车厢：局部坐标 x = 左右（±1.3），z = 前后（±3.6），地板高 1.0
function buildCar(color, k) {
  const g = new THREE.Group();
  const C = M(color), white = M(0xffffff), dark = M(0x343a40);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(2.8, .3, CAR_L), M(0x8b5a2b)); floor.position.y = .85; g.add(floor);
  const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.9, .5, CAR_L - .2), C); skirt.position.y = .5; g.add(skirt);
  [-1, 1].forEach(sz => [-1, 1].forEach(sx => { const w = new THREE.Mesh(new THREE.CylinderGeometry(.38, .38, .25, 16), dark); w.rotation.z = Math.PI / 2; w.position.set(sx * 1.25, .38, sz * (CAR_L / 2 - 1)); g.add(w); }));
  // 柱子 + 顶棚
  [-1, 1].forEach(sx => [-1, 0, 1].forEach(sz => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 3.0, 8), white); p.position.set(sx * 1.3, 2.5, sz * (CAR_L / 2 - .15)); g.add(p); }));
  const roof = new THREE.Mesh(new THREE.BoxGeometry(3.1, .18, CAR_L + .1), C); roof.position.y = 4.0; g.add(roof);
  // （车顶上不再加白色的拱形盖子，只留和车厢同色的平顶）
  // 两边的栏杆（中间留门）
  [-1, 1].forEach(sx => [[-CAR_L / 2 + .1, -.8], [.8, CAR_L / 2 - .1]].forEach(([z0, z1]) => { const L = z1 - z0; const r = new THREE.Mesh(new THREE.BoxGeometry(.08, .08, L), white); r.position.set(sx * 1.3, 1.75, (z0 + z1) / 2); g.add(r);
    const pan = new THREE.Mesh(new THREE.BoxGeometry(.05, .55, L), C); pan.position.set(sx * 1.32, 1.3, (z0 + z1) / 2); g.add(pan); }));
  // 两排长凳（面朝中间）
  const seats = [];
  [-1, 1].forEach(sx => { const bench = new THREE.Mesh(new THREE.BoxGeometry(.6, .45, CAR_L - 2.2), M(0xfab005)); bench.position.set(sx * .85, 1.22, 0); g.add(bench);
    for (let i = 0; i < 4; i++) { const s = new THREE.Object3D(); s.position.set(sx * .85, 1.42, -2.1 + i * 1.4); s.rotation.y = sx > 0 ? -Math.PI / 2 : Math.PI / 2; g.add(s); seats.push(s); } });
  // 车厢号
  const num = new THREE.Mesh(new THREE.PlaneGeometry(.6, .4), new THREE.MeshBasicMaterial({ map: tex(64, 48, (x) => { x.fillStyle = '#fff'; x.fillRect(0, 0, 64, 48); x.fillStyle = '#212529'; x.font = 'bold 36px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(k + 1, 32, 26); }), side: THREE.DoubleSide }));
  num.position.set(1.46, .55, 0); num.rotation.y = Math.PI / 2; g.add(num);
  // 晚上亮的小灯
  for (let i = 0; i < 6; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd9d4c8 })); b.position.set((i % 2 ? 1 : -1) * 1.45, 3.9, -3 + Math.floor(i / 2) * 3); b.userData.nightBulb = 0xffe066; g.add(b); }
  return { g, seats };
}
function buildLoco() {
  const g = new THREE.Group(), red = M(0xe03131, { metalness: .3 }), black = M(0x212529, { metalness: .4 }), gold = M(0xffd43b, { metalness: .6 });
  const base = new THREE.Mesh(new THREE.BoxGeometry(2.8, .5, 6.6), black); base.position.y = .6; g.add(base);
  const boiler = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 4, 20), red); boiler.rotation.x = Math.PI / 2; boiler.position.set(0, 1.85, 1); g.add(boiler);
  const face = new THREE.Mesh(new THREE.CircleGeometry(.95, 20), M(0x343a40)); face.position.set(0, 1.85, 3.02); g.add(face);
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(.25, 12, 10), new THREE.MeshBasicMaterial({ color: 0xfff3bf })); lamp.position.set(0, 2.5, 3.05); g.add(lamp);
  const chim = new THREE.Mesh(new THREE.CylinderGeometry(.35, .25, 1.2, 12), black); chim.position.set(0, 3.2, 2.2); g.add(chim);
  const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 2.2), red); cab.position.set(0, 2.05, -2); g.add(cab);
  const croof = new THREE.Mesh(new THREE.BoxGeometry(3, .2, 2.6), black); croof.position.set(0, 3.35, -2); g.add(croof);
  [-1, 1].forEach(s => { const w = new THREE.Mesh(new THREE.PlaneGeometry(1, .8), new THREE.MeshBasicMaterial({ color: 0xa5d8ff, side: THREE.DoubleSide })); w.position.set(s * 1.31, 2.4, -2); w.rotation.y = Math.PI / 2; g.add(w); });
  [[-1, 1.8], [1, 1.8], [-1, -.2], [1, -.2], [-1, -2.2], [1, -2.2]].forEach(([sx, z]) => { const w = new THREE.Mesh(new THREE.CylinderGeometry(.55, .55, .22, 18), red); w.rotation.z = Math.PI / 2; w.position.set(sx * 1.3, .55, z); g.add(w);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, .25, 10), gold); hub.rotation.z = Math.PI / 2; hub.position.set(sx * 1.32, .55, z); g.add(hub); });
  [0, 1].forEach(i => { const band = new THREE.Mesh(new THREE.TorusGeometry(1.01, .05, 6, 24), gold); band.position.set(0, 1.85, i ? 2.6 : -.4); g.add(band); });
  // 烟
  const puffs = [];
  for (let i = 0; i < 6; i++) { const p = new THREE.Mesh(new THREE.SphereGeometry(.4, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf1f3f5, transparent: true, opacity: .6 })); p.userData.t = i / 6; g.add(p); puffs.push(p); }
  return { g, puffs };
}

export function buildTrain(scene) {
  const R = TRAIN_R, root = new THREE.Group(); scene.add(root);
  // 轨道：两条钢轨 + 枕木
  [-.75, .75].forEach(o => { const t = new THREE.Mesh(new THREE.TorusGeometry(R + o, .07, 6, 512), M(0x868e96, { metalness: .8, roughness: .3 })); t.rotation.x = Math.PI / 2; t.position.y = .28; root.add(t); });
  { const n = Math.round(Math.PI * 2 * R / 1.2), im = new THREE.InstancedMesh(new THREE.BoxGeometry(2.2, .16, .32), M(0x6d4c2f), n), o = new THREE.Object3D();
    for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2; o.position.set(Math.cos(a) * R, .12, Math.sin(a) * R); o.rotation.set(0, -a, 0); o.updateMatrix(); im.setMatrixAt(i, o.matrix); } root.add(im);
    const bed = new THREE.Mesh(new THREE.RingGeometry(R - 1.6, R + 1.6, 256), M(0xb8a88a)); bed.rotation.x = -Math.PI / 2; bed.position.y = .03; root.add(bed); }
  // 车站：站台在轨道里面（靠乐园那边）
  const stations = [ST_A, ST_B].map((a, i) => {
    const g = new THREE.Group(); g.position.set(Math.cos(a) * (R - 4.2), 0, Math.sin(a) * (R - 4.2)); g.rotation.y = -a - Math.PI / 2; root.add(g);   // 局部 x 沿着轨道，z 朝乐园里面
    const plat = new THREE.Mesh(new THREE.BoxGeometry(64, 1.75, 4.6), M(0xdee2e6)); plat.position.y = .875; g.add(plat);
    const edge = new THREE.Mesh(new THREE.BoxGeometry(64, .05, .3), M(0xffd43b)); edge.position.set(0, 1.77, -2.15); g.add(edge);
    [-27, -9, 9, 27].forEach(x => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.15, .15, 5, 8), M(0x495057)); p.position.set(x, 4.2, 1.6); g.add(p); });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(64, .25, 4), M(0x1c7ed6)); roof.position.set(0, 6.7, .6); roof.rotation.x = -.08; g.add(roof);
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.2), new THREE.MeshBasicMaterial({ map: tex(512, 104, (x, w, h) => { x.fillStyle = '#1c7ed6'; x.beginPath(); x.roundRect(4, 4, w - 8, h - 8, 24); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 56px "PingFang SC","Microsoft YaHei",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(i ? '🚂 北站' : '🚂 南站', w / 2, h / 2 + 3); }), side: THREE.DoubleSide }));
    sg.position.set(0, 7.7, .6); g.add(sg);
    // 台阶（朝乐园那边）
    [0, 1, 2, 3, 4, 5].forEach(k => { const st = new THREE.Mesh(new THREE.BoxGeometry(8, .3 * (k + 1), .5), M(0xced4da)); st.position.set(0, .15 * (k + 1), 2.3 + .25 + (5 - k) * .5); g.add(st); });
    g.updateMatrixWorld(true);
    const board = g.localToWorld(new THREE.Vector3(0, 0, 6));            // 站在台阶下面按 E 上车
    return { g, a, board: [board.x, board.z], name: i ? '北站' : '南站' };
  });
  // 火车
  const loco = buildLoco(); root.add(loco.g); loco.g.scale.setScalar(TS);
  const COL = [0x4dabf7, 0x69db7c, 0xffa94d, 0xda77f2];
  const cars = COL.map((c, k) => buildCar(c, k)); cars.forEach(c => { root.add(c.g); c.g.scale.setScalar(TS); });
  // ---------- 车上的 NPC 乘客：大部分坐着，一两个站着走来走去；到站有人下车、有人上车 ----------
  const seatInfo = []; cars.forEach((c, k) => c.seats.forEach((st, i) => seatInfo.push({ k, lx: st.position.x, lz: st.position.z, ly: st.position.y, yaw: st.rotation.y })));
  const pax = [];
  let rs = 12345; const rnd = () => (rs = (rs * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 30; i++) { const p = buildPerson(3000 + i * 23); root.add(p.root); pax.push({ p, state: 'off', k: 0, lx: 0, lz: 0, seat: -1, path: [], w: new THREE.Vector3(), face: 0, speed: 0 }); }
  let playerSeat = -1;
  const seatTaken = i => i === playerSeat || pax.some(q => q.seat === i && q.state !== 'off');
  // 一开始：坐满七成，两个人站着
  seatInfo.forEach((si, i) => { if (rnd() < .72) { const q = pax.find(q => q.state === 'off'); if (q) { q.state = 'seat'; q.seat = i; q.k = si.k; q.lx = si.lx; q.lz = si.lz; } } });
  for (let n = 0; n < 2; n++) { const q = pax.find(q => q.state === 'off'); if (q) { q.state = 'stand'; q.k = n * 2 + 1; q.lx = 0; q.lz = (rnd() - .5) * 4; q.dir = 1; } }
  const tw = new THREE.Vector3(), inward = new THREE.Vector3();
  function doorWorld(k, out) { return carToWorld(k, -1.35, 0, out); }
  function inwardDir(k) { const yaw = cars[k].g.rotation.y; return inward.set(-Math.cos(yaw), 0, Math.sin(yaw)); }      // 局部 -x（朝站台、朝乐园里面）
  function onDwell() {
    // 3~5 个人下车，3~5 个人上车
    const seated = pax.filter(q => q.state === 'seat'); const nOff = 3 + Math.floor(rnd() * 3);
    for (let n = 0; n < nOff && seated.length; n++) { const q = seated.splice(Math.floor(rnd() * seated.length), 1)[0]; q.state = 'alight'; q.delay = rnd() * 5; q.path = [[0, q.lz], [0, 0], [-1.3, 0]]; }
    const nOn = 3 + Math.floor(rnd() * 3);
    for (let n = 0; n < nOn; n++) { const q = pax.find(q => q.state === 'off'); if (!q) break; const free = seatInfo.map((_, i) => i).filter(i => !seatTaken(i)); if (!free.length) break;
      const si = free[Math.floor(rnd() * free.length)]; q.state = 'boardW'; q.seat = si; q.k = seatInfo[si].k; q.delay = 3 + rnd() * 6;
      doorWorld(q.k, tw); const d = inwardDir(q.k); q.w.copy(tw).addScaledVector(d, 7 + rnd() * 3).add(new THREE.Vector3((rnd() - .5) * 4, 0, (rnd() - .5) * 4)); q.w.y = 1.75; q.p.root.visible = false; }
  }
  const WALK = 2.2 / TS;               // 在车厢里走路的速度（局部单位）
  function stepPax(dt) {
    const dwell = S.phase === 'dwell';
    for (const q of pax) {
      const P = q.p; q.speed = 0;
      if (q.state === 'off') { P.root.visible = false; continue; }
      P.root.visible = true;
      if (q.delay > 0) { q.delay -= dt; if (q.state === 'boardW') { P.root.visible = false; continue; } }
      if (q.state === 'seat' || (q.state === 'alight' && q.delay > 0)) {
        const si = seatInfo[q.seat]; carToWorld(si.k, si.lx, si.lz, tw); tw.y = .3 + si.ly * TS - .62;
        P.root.position.copy(tw); P.root.rotation.set(0, cars[si.k].g.rotation.y + si.yaw, 0); P.animate(dt, 0, false, true); continue;
      }
      if (q.state === 'stand') {                                    // 在过道里走来走去
        q.lz += q.dir * WALK * .6 * dt; if (q.lz > 2.9) q.dir = -1; if (q.lz < -2.9) q.dir = 1;
        carToWorld(q.k, 0, q.lz, tw); P.root.position.copy(tw); P.root.rotation.set(0, cars[q.k].g.rotation.y + (q.dir > 0 ? 0 : Math.PI), 0); P.animate(dt, .3, false, false); continue;
      }
      if (q.state === 'alight') {                                   // 下车：走到门口，再走到站台上，然后走掉
        if (q.path.length) { const [tx, tz] = q.path[0]; const dx = tx - q.lx, dz = tz - q.lz, d = Math.hypot(dx, dz);
          if (d < .05) q.path.shift(); else { const st = Math.min(d, WALK * dt); q.lx += dx / d * st; q.lz += dz / d * st; q.face = Math.atan2(dx, dz); }
          if (q.seat >= 0 && q.path.length < 3) q.seat = -1;
          carToWorld(q.k, q.lx, q.lz, tw); P.root.position.copy(tw); P.root.rotation.set(0, cars[q.k].g.rotation.y + q.face, 0); P.animate(dt, .4, false, false);
          if (!q.path.length) { q.state = 'leave'; q.w.copy(tw); const d2 = inwardDir(q.k); q.tgt = tw.clone().addScaledVector(d2, 9); q.tgt.y = 1.75; q.w.y = 1.75; }
        }
        continue;
      }
      if (q.state === 'leave' || q.state === 'boardW') {             // 在站台上走（世界坐标）
        let tgt = q.tgt;
        if (q.state === 'boardW') { tgt = doorWorld(q.k, tw).clone(); tgt.y = 1.75; if (!dwell) { q.state = 'off'; q.seat = -1; continue; } }
        const dx = tgt.x - q.w.x, dz = tgt.z - q.w.z, d = Math.hypot(dx, dz);
        if (d < .15) {
          if (q.state === 'leave') { q.state = 'off'; P.root.visible = false; continue; }
          q.state = 'boardC'; const si = seatInfo[q.seat]; q.lx = -1.3; q.lz = 0; q.path = [[0, 0], [0, si.lz], [si.lx * .4, si.lz], [si.lx, si.lz]]; continue;
        }
        const st = Math.min(d, 2.2 * dt); q.w.x += dx / d * st; q.w.z += dz / d * st;
        P.root.position.copy(q.w); P.root.rotation.set(0, Math.atan2(dx, dz), 0); P.animate(dt, .4, false, false); continue;
      }
      if (q.state === 'boardC') {                                   // 上车以后：走过道，坐到座位上
        const [tx, tz] = q.path[0]; const dx = tx - q.lx, dz = tz - q.lz, d = Math.hypot(dx, dz);
        if (d < .05) { q.path.shift(); if (!q.path.length) { q.state = 'seat'; continue; } }
        else { const st = Math.min(d, WALK * dt); q.lx += dx / d * st; q.lz += dz / d * st; q.face = Math.atan2(dx, dz); }
        carToWorld(q.k, q.lx, q.lz, tw); P.root.position.copy(tw); P.root.rotation.set(0, cars[q.k].g.rotation.y + q.face, 0); P.animate(dt, .4, false, false);
      }
    }
  }
  function carToWorld(k, lx, lz, out = new THREE.Vector3()) { const c = cars[k].g; c.updateMatrixWorld(); return out.set(lx, 1.0, lz).applyMatrix4(c.matrixWorld); }
  // ---- 按时钟算火车在哪 ----
  const F = s => { const run = RUN, e = 6; return s < e ? s * s / (2 * e) : s < run - e ? e / 2 + (s - e) : run - e - (run - s) ** 2 / (2 * e); };
  const HALF = Math.PI, FTOT = RUN - 6;
  function state(now) {
    const c = ((now % CYCLE) + CYCLE) % CYCLE, lap = Math.floor(now / CYCLE);
    let th, phase, left, at = null, speed = 0;
    if (c < DWELL) { th = ST_A; phase = 'dwell'; left = DWELL - c; at = 0; }
    else if (c < DWELL + RUN) { const s = c - DWELL; th = ST_A + HALF * F(s) / FTOT; phase = 'run'; left = DWELL + RUN - c; speed = 1; }
    else if (c < 2 * DWELL + RUN) { th = ST_B; phase = 'dwell'; left = 2 * DWELL + RUN - c; at = 1; }
    else { const s = c - 2 * DWELL - RUN; th = ST_B + HALF * F(s) / FTOT; phase = 'run'; left = CYCLE - c; speed = 1; }
    return { th, phase, left, at, stop: lap * 2 + (c >= DWELL + RUN ? 1 : 0) };
  }
  const place = (obj, th) => { obj.position.set(Math.cos(th) * R, .3, Math.sin(th) * R); obj.rotation.set(0, -th, 0); };     // 局部 +z = 前进方向（角度变大的方向）
  let S = state(Date.now() / 1000), lastStop = -1;
  function update(dt) {
    S = state(Date.now() / 1000);
    place(loco.g, S.th);
    cars.forEach((c, k) => place(c.g, S.th - ((k + 1) * (CAR_L + GAP) * TS - .3 * TS) / R));
    loco.puffs.forEach((p, i) => { p.userData.t = (p.userData.t + dt * (S.phase === 'run' ? .9 : .3)) % 1; const t = p.userData.t; p.position.set(0, 3.8 + t * 3, 2.2 - t * (S.phase === 'run' ? 4 : .5)); p.scale.setScalar(.6 + t * 1.6); p.material.opacity = .65 * (1 - t); });
    if (S.phase === 'dwell') { if (S.stop !== lastStop && lastStop >= 0) onDwell(); lastStop = S.stop; } else lastStop = S.stop;
    stepPax(dt);
  }
  update(0);
  return {
    root, stations, cars, loco, update,
    get state() { return S; },
    // 车厢的局部坐标 ↔ 世界坐标
    carToWorld,
    TS,
    // 玩家要坐下：离得最近的空座位（同一节车厢里，局部距离 1 以内）
    seatNear(k, lx, lz) { let best = -1, bd = 1.0; seatInfo.forEach((si, i) => { if (si.k !== k || seatTaken(i)) return; const d = Math.hypot(si.lx - lx, si.lz - lz); if (d < bd) { bd = d; best = i; } }); return best; },
    seatInfo, setPlayerSeat(i) { playerSeat = i; }, get paxStates() { const c = {}; pax.forEach(q => c[q.state] = (c[q.state] || 0) + 1); return c; },
    carYaw(k) { return cars[k].g.rotation.y; },
    CAR_L, NCAR,
    // 站台附近：哪个车站？
    stationNear(x, z, r = 3) { return stations.find(s => Math.hypot(s.board[0] - x, s.board[1] - z) < r) || null; },
    colliders: stations.map(s => ({ box: [s.g.position.x, s.g.position.z, 32, 2.3, s.g.rotation.y] })),
  };
}
