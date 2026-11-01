// ===== 跳楼机：坐在高塔四周的座位上，慢慢升到 36 米高看全乐园，停几秒……突然掉下来！ =====
// 一轮一轮：上座 14 秒 → 慢慢升上去 → 在最高处停 2~5 秒（每一轮不一样）→ 自由落体 → 刹车 → 慢慢落地
import * as THREE from 'three';
import { rideClock } from './rides.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .5, ...o });
const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const seeded = n => { let a = (n * 2654435761) >>> 0; a ^= a >>> 15; a = Math.imul(a, 2246822519); a ^= a >>> 13; return ((a >>> 0) % 10000) / 10000; };

export function dropTower(cx, cz, faceTo = [0, 0]) {
  const g = new THREE.Group(); g.position.set(cx, 0, cz);
  const H = 44, TOP = 36, BOARD = 14, LIFT = 14, HOLDMAX = 5, FALL = Math.sqrt(2 * (TOP - 12) / 9.8), VF = 9.8 * Math.sqrt(2 * (TOP - 12) / 9.8), BRAKE = 2 * 10.8 / (9.8 * Math.sqrt(2 * (TOP - 12) / 9.8)), SETTLE = 4;
  const CYCLE = BOARD + LIFT + HOLDMAX + FALL + BRAKE + SETTLE;
  // 底座 + 塔身
  const base = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.6, .6, 32), M(0xdee2e6)); base.position.y = .3; g.add(base);
  const ring2 = new THREE.Mesh(new THREE.TorusGeometry(6.2, .12, 8, 48), M(0xffd43b)); ring2.rotation.x = Math.PI / 2; ring2.position.y = .62; g.add(ring2);
  const stripes = tex(64, 256, (x) => { for (let i = 0; i < 16; i++) { x.fillStyle = i % 2 ? '#e03131' : '#ffffff'; x.fillRect(0, i * 16, 64, 16); } });
  stripes.wrapS = stripes.wrapT = THREE.RepeatWrapping; stripes.repeat.set(1, 3);
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.4, H, 20), M(0xffffff, { map: stripes, metalness: .2 })); tower.position.y = H / 2; g.add(tower);
  const crown = new THREE.Mesh(new THREE.ConeGeometry(2.2, 3.5, 20), M(0x5f3dc4)); crown.position.y = H + 1.75; g.add(crown);
  const star = new THREE.Mesh(new THREE.OctahedronGeometry(.6), M(0xffd43b, { emissive: 0xffd43b, emissiveIntensity: .6 })); star.position.y = H + 4; g.add(star);
  // 塔上一圈圈彩灯（晚上亮）
  for (let i = 0; i < 40; i++) { const a = i * 2.4, y = 2 + i * (H - 3) / 40, b = new THREE.Mesh(new THREE.SphereGeometry(.13, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd9d4c8 })); b.position.set(Math.cos(a) * 1.25, y, Math.sin(a) * 1.25); b.userData.nightBulb = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c][i % 4]; g.add(b); }
  // 招牌（朝乐园那边）
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.4), new THREE.MeshBasicMaterial({ map: tex(512, 120, (x, w, h) => { x.fillStyle = '#5f3dc4'; x.beginPath(); x.roundRect(4, 4, w - 8, h - 8, 26); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 64px "PingFang SC","Microsoft YaHei",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🗼 跳楼机', w / 2, h / 2 + 3); }), side: THREE.DoubleSide }));
  const fa = Math.atan2(faceTo[0] - cx, faceTo[1] - cz); sg.position.set(Math.sin(fa) * 1.6, 7, Math.cos(fa) * 1.6); sg.rotation.y = fa; g.add(sg);
  // 座位圈：一圈 12 个座位，面朝外
  const car = new THREE.Group(); g.add(car);
  const collar = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 1.6, 24, 1, true), M(0xffd43b, { side: THREE.DoubleSide, metalness: .4 })); collar.position.y = .8; car.add(collar);
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, .2, 32), M(0x495057)); plate.position.y = .1; car.add(plate);
  const seats = [], harness = [];
  const SC = [0xff6b6b, 0x4dabf7, 0x69db7c, 0xda77f2];
  for (let k = 0; k < 12; k++) {
    const a = k / 12 * Math.PI * 2, sg2 = new THREE.Group(); sg2.position.set(Math.sin(a) * 2.9, 0, Math.cos(a) * 2.9); sg2.rotation.y = a; car.add(sg2);      // +z 朝外
    const back = new THREE.Mesh(new THREE.BoxGeometry(.8, 1.5, .15), M(SC[k % 4])); back.position.set(0, 1.25, -.35); sg2.add(back);
    const seatM = new THREE.Mesh(new THREE.BoxGeometry(.8, .15, .6), M(SC[k % 4])); seatM.position.set(0, .55, -.05); sg2.add(seatM);
    const har = new THREE.Mesh(new THREE.TorusGeometry(.32, .06, 8, 16, Math.PI), M(0xadb5bd, { metalness: .7 })); har.position.set(0, 1.35, .05); har.rotation.set(-.4, 0, 0); sg2.add(har); harness.push(har);
    const seat = new THREE.Object3D(); seat.position.set(0, .68, .02); sg2.add(seat); seats.push(seat);
  }
  // 时刻
  let phase = 'board', boardLeft = 0, cycleN = 0, h = 0, lastPhase = '';
  function height(c, n) {
    const hold = 2 + seeded(n) * 3;
    if (c < BOARD) return [0, 'board'];
    let s = c - BOARD;
    if (s < LIFT) { const u = s / LIFT; return [TOP * (u * u * (3 - 2 * u)), 'lift']; }
    s -= LIFT; if (s < hold) return [TOP, 'hold'];
    s -= hold; if (s < FALL) return [TOP - .5 * 9.8 * s * s, 'fall'];
    s -= FALL; if (s < BRAKE) return [12 - (VF * s - .5 * (VF / BRAKE) * s * s), 'brake'];          // 均匀减速，刚好停在 1.2 米
    s -= BRAKE; const u = Math.min(1, s / (SETTLE - .5)); return [1.2 * (1 - u * u * (3 - 2 * u)), 'settle'];
  }
  const api = {
    name: '跳楼机', icon: '🗼', group: g, seats, capacity: seats.length,
    gate: [cx + Math.sin(fa) * 7.6, cz + Math.cos(fa) * 7.6], entry: [cx + Math.sin(fa) * 7.6, cz + Math.cos(fa) * 7.6], entryR: 3, out: [Math.sin(fa), Math.cos(fa)],
    colliders: [[cx, cz, 6.4]],
    update() {
      const now = rideClock(), c = now % CYCLE; cycleN = Math.floor(now / CYCLE);
      const [hh, ph] = height(c, cycleN); h = hh; phase = ph; boardLeft = BOARD - c;
      car.position.y = h;
      harness.forEach(hr => hr.rotation.x = phase === 'board' && boardLeft > 2 ? -1.4 : -.4);         // 上座的时候安全杠是抬起来的
      if (phase !== lastPhase) { if (phase === 'fall' && api.onDrop) api.onDrop(); if (phase === 'hold' && api.onTop) api.onTop(); lastPhase = phase; }
    },
    status() { return '按 E 坐跳楼机'; },
    canBoard() { return phase === 'board' && boardLeft > 1; },
    boardTime() { return phase === 'board' ? boardLeft : 0; },
    // 上座：走到座位前面
    boardSpot(k) { const a = k / 12 * Math.PI * 2; return [cx + Math.sin(a) * 4.3, cz + Math.cos(a) * 4.3]; },
    board(taken = [], want = null) {
      const k = want != null && seats[want] && !taken.includes(want) ? want : seats.findIndex((_, i) => !taken.includes(i)); if (k < 0) return null;
      const start = cycleN, a = k / 12 * Math.PI * 2;
      return { seat: seats[k], seatIndex: k, view: 'pov', exitPos: [cx + Math.sin(a) * 7.4, cz + Math.cos(a) * 7.4], done: () => cycleN > start && phase === 'board' };
    },
    get phase() { return phase; },
  };
  return api;
}
