// ===== 碰碰车场：一个有顶棚的大场子，里面有几辆电脑开的碰碰车；自己上车以后可以到处撞 =====
// 撞到别的车或者墙会弹开、还会转圈
import * as THREE from 'three';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .5, ...o });
export const BUMPER_COLORS = [0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c, 0xda77f2, 0xff922b, 0x22b8cf, 0xf783ac];

export function buildBumperCar(color) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const C = M(color, { metalness: .35, roughness: .3 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.5, .32, 28), M(0x343a40, { metalness: .5 })); base.position.y = .3; body.add(base);
  const bump = new THREE.Mesh(new THREE.TorusGeometry(1.5, .24, 10, 36), M(0x111111, { roughness: .9 })); bump.rotation.x = Math.PI / 2; bump.position.y = .38; body.add(bump);
  const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.35, .55, 28), C); shell.position.y = .72; shell.scale.z = 1.12; body.add(shell);
  const hood = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), C); hood.scale.set(1, .45, .7); hood.position.set(0, .98, .55); body.add(hood);
  const back = new THREE.Mesh(new THREE.BoxGeometry(1.5, .9, .3), C); back.position.set(0, 1.35, -.95); body.add(back);
  const seatM = new THREE.Mesh(new THREE.BoxGeometry(1.1, .2, .8), M(0x212529)); seatM.position.set(0, 1.02, -.4); body.add(seatM);
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(.26, .05, 8, 20), M(0x212529)); wheel.position.set(0, 1.4, .35); wheel.rotation.x = -.9; body.add(wheel);
  [-1, 1].forEach(s => { const l = new THREE.Mesh(new THREE.SphereGeometry(.13, 10, 8), new THREE.MeshBasicMaterial({ color: 0xfff3bf })); l.position.set(s * .55, .95, 1.3); body.add(l); });
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.04, .04, 5.7, 6), M(0xadb5bd, { metalness: .7 })); pole.position.set(0, 4.15, -1.05); body.add(pole);
  const spark = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), new THREE.MeshBasicMaterial({ color: 0xa5d8ff })); spark.position.set(0, 7.0, -1.05); body.add(spark);
  const seat = new THREE.Object3D(); seat.position.set(0, 1.1, -.35); body.add(seat);
  let t = 0;
  return { group: g, seat, update(dt) { t += dt; spark.visible = Math.sin(t * 37) > .2; spark.scale.setScalar(.7 + Math.random() * .8); } };
}

export function bumperArena(cx, cz) {
  const HX = 27, HZ = 18, CR = 1.55;          // 场子半宽 / 半长、车的半径
  const PX = -HX + 8;                         // 西边是车库：x < PX 的地方停空车，开的车只能在 x > PX 的地方跑
  const NCAR = 14, ROUND = 60, BOARD = 15, CYCLE = ROUND + BOARD;
  const g = new THREE.Group(); g.position.set(cx, 0, cz);
  // 地板：深色的金属格子
  const ft = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#2b3036'; x.fillRect(0, 0, 128, 128);
    x.strokeStyle = '#3d444c'; x.lineWidth = 3; for (let i = 0; i <= 128; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke(); x.beginPath(); x.moveTo(0, i); x.lineTo(128, i); x.stroke(); }
    for (let i = 0; i < 160; i++) { x.fillStyle = 'rgba(255,255,255,.05)'; x.fillRect(Math.random() * 128, Math.random() * 128, 2, 2); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(HX / 2, HZ / 2); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const floor = new THREE.Mesh(new THREE.BoxGeometry(HX * 2 + 2, .2, HZ * 2 + 2), M(0xffffff, { map: ft, metalness: .4, roughness: .45 })); floor.position.y = .1; g.add(floor);
  // 车库的地面（黄色斜线）
  const garage = new THREE.Mesh(new THREE.PlaneGeometry(PX + HX, HZ * 2), M(0x5c4a12, { roughness: .8 })); garage.rotation.x = -Math.PI / 2; garage.position.set((PX - HX) / 2, .21, 0); g.add(garage);
  // 一圈橡胶围栏（黄黑条纹）
  const stripe = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 32; const x = c.getContext('2d'); x.fillStyle = '#ffd43b'; x.fillRect(0, 0, 128, 32); x.fillStyle = '#212529';
    for (let k = -1; k < 8; k++) { x.beginPath(); x.moveTo(k * 20, 32); x.lineTo(k * 20 + 10, 32); x.lineTo(k * 20 + 22, 0); x.lineTo(k * 20 + 12, 0); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const wall = (w, x, z, ry, h = .9) => { const tx = stripe.clone(); tx.needsUpdate = true; tx.repeat.set(w / 3, 1); const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, .5), M(0xffffff, { map: tx })); m.position.set(x, .2 + h / 2, z); m.rotation.y = ry; g.add(m); };
  wall(HX * 2 + 1, 0, -HZ - .25, 0); wall(HX * 2 + 1, 0, HZ + .25, 0); wall(HZ * 2 + 1, -HX - .25, 0, Math.PI / 2); wall(HZ * 2 + 1, HX + .25, 0, Math.PI / 2);
  wall(HZ * 2 - 6, PX - .3, 0, Math.PI / 2, .6);                                          // 车库和场子之间的矮栏杆（两头留口子）
  // 顶棚：柱子 + 天花板电网 + 彩色边
  const roofY = 7.5;
  [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, -1], [0, 1]].forEach(([sx, sz]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.35, .4, roofY, 10), M(0xff6b6b)); p.position.set(sx * (HX + .9), roofY / 2, sz * (HZ + .9)); g.add(p); });
  const grid = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2 + 2, HZ * 2 + 2, 20, 14), new THREE.MeshStandardMaterial({ color: 0x868e96, metalness: .7, roughness: .3, side: THREE.DoubleSide, wireframe: true }));
  grid.rotation.x = Math.PI / 2; grid.position.y = roofY - .4; g.add(grid);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(HX * 2 + 3, .5, HZ * 2 + 3), M(0x5f3dc4)); roof.position.y = roofY + .1; g.add(roof);
  const edgeC = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c];
  for (let k = 0; k < 4; k++) { const long = k < 2, w = long ? HX * 2 + 3.2 : HZ * 2 + 3.2; const e = new THREE.Mesh(new THREE.BoxGeometry(long ? w : .3, .9, long ? .3 : w), M(edgeC[k]));
    e.position.set(long ? 0 : (k === 2 ? -1 : 1) * (HX + 1.6), roofY - .1, long ? (k === 0 ? -1 : 1) * (HZ + 1.6) : 0); g.add(e); }
  for (let i = 0; i < 60; i++) { const u = i / 60, L = HX * 2 + 3, Wd = HZ * 2 + 3, per = 2 * (L + Wd); let d = u * per, x, z;
    if (d < L) { x = -L / 2 + d; z = Wd / 2 + .16; } else if ((d -= L) < Wd) { x = L / 2 + .16; z = Wd / 2 - d; } else if ((d -= Wd) < L) { x = L / 2 - d; z = -Wd / 2 - .16; } else { d -= L; x = -L / 2 - .16; z = -Wd / 2 + d; }
    const b = new THREE.Mesh(new THREE.SphereGeometry(.14, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd9d4c8 })); b.position.set(x, roofY - .55, z); b.userData.nightBulb = edgeC[i % 4]; g.add(b); }
  const signTex = text => { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#ff6b6b'; x.beginPath(); x.roundRect(4, 4, 504, 120, 30); x.fill();
    x.fillStyle = '#fff'; x.font = 'bold 64px "PingFang SC","Microsoft YaHei",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(text, 256, 68); const t = new THREE.CanvasTexture(x.canvas); t.colorSpace = THREE.SRGBColorSpace; return t; };
  const sg = signTex('🚗 碰碰车 💥');
  [1, -1].forEach(s => { const m = new THREE.Mesh(new THREE.PlaneGeometry(10, 2.5), new THREE.MeshBasicMaterial({ map: sg, transparent: true, side: THREE.DoubleSide })); m.position.set(0, roofY + 1.7, s * (HZ + 1.75)); if (s < 0) m.rotation.y = Math.PI; g.add(m); });
  // 车库牌子
  { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x = c.getContext('2d'); x.fillStyle = '#212529'; x.fillRect(0, 0, 256, 64); x.fillStyle = '#ffd43b'; x.font = 'bold 34px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🅿️ 车库', 128, 34);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const m = new THREE.Mesh(new THREE.PlaneGeometry(3.2, .8), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide })); m.position.set(PX - .3, 1.6, 0); m.rotation.y = Math.PI / 2; g.add(m); }
  // 场子上方的倒计时牌
  const cdC = document.createElement('canvas'); cdC.width = 256; cdC.height = 64; const cdX = cdC.getContext('2d'), cdT = new THREE.CanvasTexture(cdC); cdT.colorSpace = THREE.SRGBColorSpace;
  const cd = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: cdT, side: THREE.DoubleSide })); cd.position.set(0, roofY - 1.4, HZ - .2); g.add(cd);
  let cdLast = '';
  const drawCd = text => { if (text === cdLast) return; cdLast = text; cdX.fillStyle = '#1a1446'; cdX.fillRect(0, 0, 256, 64); cdX.fillStyle = '#ffd43b'; cdX.font = 'bold 30px sans-serif'; cdX.textAlign = 'center'; cdX.textBaseline = 'middle'; cdX.fillText(text, 128, 34); cdT.needsUpdate = true; };

  // ---------- 车：一开始全停在车库里，有人坐上去才开出来 ----------
  const rnd = Math.random;
  const park = k => ({ x: -HX + 2.4 + (k % 2) * 3.4, z: -HZ + 2.6 + Math.floor(k / 2) * 4.7, head: Math.PI / 2 });
  const cars = [];
  for (let k = 0; k < NCAR; k++) { const m = buildBumperCar(BUMPER_COLORS[k % BUMPER_COLORS.length]); g.add(m.group); const p = park(k);
    cars.push({ k, m, driver: null, ai: false, x: p.x, z: p.z, vx: 0, vz: 0, head: p.head, spin: 0, steer: 0, thr: 0, tx: 0, tz: 0, retarget: 0, rounds: 0, startRound: 0 }); }
  const sync = c => { c.m.group.position.set(c.x, 0, c.z); c.m.group.rotation.y = c.head; };
  cars.forEach(sync);
  const toPark = c => { const p = park(c.k); Object.assign(c, { x: p.x, z: p.z, head: p.head, vx: 0, vz: 0, spin: 0, thr: 0, steer: 0, driver: null, ai: false }); sync(c); };
  const startSpots = []; for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) startSpots.push({ x: PX + 6 + i * ((HX - PX - 10) / 3), z: -HZ + 4 + j * ((HZ * 2 - 8) / 3) });
  const toStart = c => { const free = startSpots.filter(sp => !cars.some(o => o !== c && o.driver && Math.hypot(o.x - sp.x, o.z - sp.z) < 3)); const sp = free.length ? free[Math.floor(rnd() * free.length)] : startSpots[c.k % startSpots.length];
    Object.assign(c, { x: sp.x, z: sp.z, head: -Math.PI / 2 + (rnd() - .5) * 1.5, vx: 0, vz: 0, spin: 0 }); sync(c); };

  // 共用时钟：上车 15 秒 → 开 60 秒
  let phase = 'board', left = 0, roundN = 0;
  function clock() { const now = Date.now() / 1000, c = now % CYCLE; roundN = Math.floor(now / CYCLE); if (c < BOARD) { phase = 'board'; left = BOARD - c; } else { phase = 'run'; left = CYCLE - c; } }
  clock();

  // 一步物理（只算有人开的车）
  function physics(dt, others) {
    let myHit = 0; const active = cars.filter(c => c.driver && !c.pending);
    for (const c of active) {
      if (phase !== 'run') { c.thr = 0; c.steer = 0; }
      else if (c.ai) {                                 // NPC 开车：找个地方开过去，时不时去撞别人
        c.retarget -= dt;
        if (c.retarget <= 0 || Math.hypot(c.tx - c.x, c.tz - c.z) < 3) { c.retarget = 2.5 + rnd() * 3.5;
          const victims = active.filter(o => o !== c); if (victims.length && rnd() < .45) { const v = victims[Math.floor(rnd() * victims.length)]; c.tx = v.x; c.tz = v.z; }
          else { c.tx = PX + 3 + rnd() * (HX - PX - 6); c.tz = (rnd() - .5) * (HZ * 2 - 6); } }
        const want = Math.atan2(c.tx - c.x, c.tz - c.z); let d = want - c.head; d = Math.atan2(Math.sin(d), Math.cos(d));
        c.steer = THREE.MathUtils.clamp(d * 2, -1, 1); c.thr = Math.abs(d) < 1.4 ? .8 : .3;
      }
      const fx = Math.sin(c.head), fz = Math.cos(c.head);
      c.vx += fx * c.thr * 9 * dt; c.vz += fz * c.thr * 9 * dt;
      const fwd = c.vx * fx + c.vz * fz, sideV = c.vx * fz - c.vz * fx;
      const k = Math.min(1, dt * 2.5); const nf = fwd * (1 - dt * (phase === 'run' ? .9 : 3)), ns = sideV * (1 - k);
      c.vx = fx * nf + fz * ns; c.vz = fz * nf - fx * ns;
      const sp = Math.hypot(c.vx, c.vz); if (sp > 8.5) { c.vx *= 8.5 / sp; c.vz *= 8.5 / sp; }
      c.head += (c.steer * 2.3 * THREE.MathUtils.clamp(Math.abs(fwd) / 3 + .35, 0, 1) * Math.sign(fwd || 1) + c.spin) * dt;
      c.spin *= Math.max(0, 1 - dt * 2.2);
      c.x += c.vx * dt; c.z += c.vz * dt;
      const x0 = PX + CR, x1 = HX - CR, wz = HZ - CR, me = c.driver === 'player';
      if (c.x < x0 || c.x > x1) { c.x = Math.min(x1, Math.max(x0, c.x)); if (Math.abs(c.vx) > 1.5 && me) myHit = Math.max(myHit, Math.abs(c.vx)); c.vx = -c.vx * .7; c.spin += (rnd() - .5) * Math.abs(c.vx) * 1.2; }
      if (Math.abs(c.z) > wz) { c.z = Math.sign(c.z) * wz; if (Math.abs(c.vz) > 1.5 && me) myHit = Math.max(myHit, Math.abs(c.vz)); c.vz = -c.vz * .7; c.spin += (rnd() - .5) * Math.abs(c.vz) * 1.2; }
    }
    const all = active.concat(others);
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
      const a = all[i], b = all[j]; if (a.fixed && b.fixed) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz); if (d >= CR * 2 || d < 1e-4) continue;
      const nx = dx / d, nz = dz / d, over = CR * 2 - d;
      const wa = a.fixed ? 0 : (b.fixed ? 1 : .5), wb = 1 - wa;
      a.x -= nx * over * wa; a.z -= nz * over * wa; b.x += nx * over * wb; b.z += nz * over * wb;
      const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (rv < 0) {
        const jimp = -1.8 * rv;
        if (!a.fixed) { a.vx -= nx * jimp * wa; a.vz -= nz * jimp * wa; a.spin += (rnd() < .5 ? -1 : 1) * Math.min(5, -rv * .9); }
        if (!b.fixed) { b.vx += nx * jimp * wb; b.vz += nz * jimp * wb; b.spin += (rnd() < .5 ? -1 : 1) * Math.min(5, -rv * .9); }
        if (a.driver === 'player' || b.driver === 'player') myHit = Math.max(myHit, -rv);
      }
    }
    active.forEach(sync);
    return myHit;
  }
  let mine = null, lastPhase = phase;
  const api = {
    name: '碰碰车', icon: '🚗', kind: 'bumper', group: g,
    entry: [cx, cz + HZ + 2.6], entryR: 3.2, center: [cx, cz], capacity: NCAR, out: [0, 1],
    colliders: [{ box: [cx, cz, HX + .6, HZ + .6, 0] }],
    seats: cars.map(c => c.m.seat),
    toWorld: (x, z) => [cx + x, cz + z], toLocal: (x, z) => [x - cx, z - cz],
    get phase() { return phase; }, get left() { return left; },
    status() { return phase === 'board' ? '按 E 开碰碰车' : '碰碰车开着呢，等下一轮'; },
    canBoard() { clock(); return phase === 'board' && left > 1.5 && cars.some(c => !c.driver); },
    boardTime() { clock(); return phase === 'board' ? left : 0; },
    freeSeat(taken = []) { const c = cars.find(c => !c.driver && !taken.includes(c.k)); return c ? c.k : -1; },
    boardSpot(k) { const c = cars[k]; return [cx + c.x, cz + c.z]; },
    // 上车（NPC 或玩家）：从车库里拿一辆空车开到场子里；坐 rounds 轮
    board(taken = [], who = 'npc', rounds = 1, want = null) {
      const c = want != null && cars[want] && !cars[want].driver && !taken.includes(want) ? cars[want] : cars.find(c => !c.driver && !taken.includes(c.k)); if (!c) return null;
      c.driver = who; c.ai = who !== 'player'; c.startRound = roundN; c.rounds = rounds; c.pending = true;          // 先坐在车库里，开始的时候再开出来
      if (who === 'player') mine = c;
      return { seat: c.m.seat, seatIndex: c.k, view: 'bumper', car: c, exitPos: [cx + 3 + (rnd() - .5) * 4, cz + HZ + 3.2],
        done: () => phase === 'board' && roundN >= c.startRound + c.rounds, release() { if (mine === c) mine = null; toPark(c); } };
    },
    get mine() { return mine; },
    exitPos: [cx + 3, cz + HZ + 3.2],
    update(dt, others = []) {
      clock();
      cars.forEach(c => c.driver && c.m.update(dt));
      if (phase === 'run') cars.forEach(c => { if (c.driver && c.pending) { c.pending = false; toStart(c); } });
      if (phase !== lastPhase) { lastPhase = phase; if (phase === 'run') cars.forEach(c => { if (c.driver && c.pending) { c.pending = false; toStart(c); } }); }
      drawCd(phase === 'board' ? `上车中 · ${Math.ceil(left)} 秒后开始` : `还剩 ${Math.ceil(left)} 秒`);
      return physics(Math.min(dt, .05), others);
    },
  };
  return api;
}
