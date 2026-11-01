// ===== 卡丁车：赛道 + 自己开的小车 =====
// 赛道是“操场形”（两条直道 + 两个半圆弯），沿 Z 方向放；在维修区按 E 上车，WASD 开，按 E 下车
import * as THREE from 'three';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .55, ...o });
const KART_COLORS = [0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c, 0xda77f2, 0xff922b, 0x3bc9db, 0xf783ac];
export const kartColorOf = id => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return KART_COLORS[h % KART_COLORS.length]; };

export function kartTrack(cx, cz) {
  // 赛道中心线：极坐标里的一条波浪形闭合曲线（三个大弯 + 小 S 弯，不会自己交叉）
  // 高度：两段上坡下坡；起点附近是平的
  const W = 10, N = 360;
  const R0 = 34, SX = 1.05, SZ = 1.45;
  const rad = t => R0 * (1 + .2 * Math.cos(3 * t + .4) + .07 * Math.sin(5 * t));
  const hill = (t, c, w, h) => { let d = Math.abs(((t - c) % (Math.PI * 2) + Math.PI * 3) % (Math.PI * 2) - Math.PI); return d < w ? h * (.5 + .5 * Math.cos(Math.PI * d / w)) : 0; };
  const height = t => hill(t, 1.75, .75, 6.5) + hill(t, 4.25, .6, 4.5);
  const local = [];
  for (let i = 0; i < N; i++) { const t = -i / N * Math.PI * 2; const r = rad(t); local.push(new THREE.Vector3(Math.cos(t) * r * SX, height(t), Math.sin(t) * r * SZ)); }
  const g = new THREE.Group(); g.position.set(cx, 0, cz);
  // 每个点的切线、侧向
  const tan = [], side = [], up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < N; i++) { const t = new THREE.Vector3().subVectors(local[(i + 1) % N], local[(i - 1 + N) % N]); const flat = t.clone().setY(0).normalize(); tan.push(t.normalize()); side.push(new THREE.Vector3().crossVectors(flat, up).normalize()); }
  // 路面（带纹理）+ 两侧土坡（高的地方能看出是土堆起来的）
  const pos = [], uv = [], idx = [], skirt = [], sidx = [];
  for (let i = 0; i <= N; i++) {
    const k = i % N, p = local[k], sd = side[k];
    pos.push(p.x + sd.x * W / 2, p.y + .06, p.z + sd.z * W / 2, p.x - sd.x * W / 2, p.y + .06, p.z - sd.z * W / 2); uv.push(0, i / 3, 1, i / 3);
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
    [1, -1].forEach(s => { const ox = p.x + sd.x * s * W / 2, oz = p.z + sd.z * s * W / 2, sx2 = p.x + sd.x * s * (W / 2 + p.y * 1.1), sz2 = p.z + sd.z * s * (W / 2 + p.y * 1.1); skirt.push(ox, p.y + .05, oz, sx2, 0, sz2); });
    if (i < N) [0, 1].forEach(s => { const b = i * 4 + s * 2, n = (i + 1) * 4 + s * 2; sidx.push(b, b + 1, n, b + 1, n + 1, n); });
  }
  const road = new THREE.BufferGeometry(); road.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); road.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); road.setIndex(idx); road.computeVertexNormals();
  const asphalt = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#4a4e57'; x.fillRect(0, 0, 64, 64); for (let i = 0; i < 300; i++) { x.fillStyle = Math.random() < .5 ? '#555a64' : '#40444c'; x.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
    x.fillStyle = '#ffffff'; x.fillRect(30, 0, 4, 28);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  g.add(new THREE.Mesh(road, new THREE.MeshStandardMaterial({ map: asphalt, roughness: .9, side: THREE.DoubleSide })));
  const sk = new THREE.BufferGeometry(); sk.setAttribute('position', new THREE.Float32BufferAttribute(skirt, 3)); sk.setIndex(sidx); sk.computeVertexNormals();
  g.add(new THREE.Mesh(sk, M(0x8fbf5a, { side: THREE.DoubleSide, flatShading: true })));
  // 红白路肩；高的地方加护栏
  for (let i = 0; i < N; i += 3) {
    const p = local[i], sd = side[i], t = tan[i];
    [1, -1].forEach(s => {
      const kb = new THREE.Mesh(new THREE.BoxGeometry(.6, .16, 1.6), M((i / 3) % 2 ? 0xffffff : 0xe03131));
      kb.position.set(p.x + sd.x * s * (W / 2 + .3), p.y + .08, p.z + sd.z * s * (W / 2 + .3)); kb.lookAt(kb.position.clone().add(t)); g.add(kb);
      if (p.y > 1.2 && i % 6 === 0) { const post = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, 1.1, 6), M(0xdee2e6)); post.position.set(p.x + sd.x * s * (W / 2 + .7), p.y + .55, p.z + sd.z * s * (W / 2 + .7)); g.add(post); }
    });
  }
  // 护栏横杆
  [1, -1].forEach(s => { let run = [];
    const flush = () => { if (run.length > 2) g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(run), run.length * 2, .07, 6, false), M(0xff6b6b))); run = []; };
    for (let i = 0; i <= N; i++) { const k = i % N, p = local[k], sd = side[k]; if (p.y > 1.2) run.push(new THREE.Vector3(p.x + sd.x * s * (W / 2 + .7), p.y + 1.05, p.z + sd.z * s * (W / 2 + .7))); else flush(); }
    flush(); });
  // 起点线（黑白格）+ 拱门
  const p0 = local[0], s0 = side[0], t0 = tan[0];
  const chk = (() => { const c = document.createElement('canvas'); c.width = 80; c.height = 16; const x = c.getContext('2d');
    for (let i = 0; i < 20; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 4, j * 4, 4, 4); }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t; })();
  const line = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.6), new THREE.MeshBasicMaterial({ map: chk }));
  line.rotation.x = -Math.PI / 2; line.rotation.z = Math.atan2(t0.x, t0.z); line.position.set(p0.x, .08, p0.z); g.add(line);
  const arch = new THREE.Group(); arch.position.set(p0.x, 0, p0.z); arch.rotation.y = Math.atan2(t0.x, t0.z); g.add(arch);
  const archM = M(0x1c7ed6, { metalness: .3 });
  [-1, 1].forEach(s => { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.25, .25, 6.5, 8), archM); pole.position.set(s * (W / 2 + 1), 3.25, 0); arch.add(pole); });
  arch.add(Object.assign(new THREE.Mesh(new THREE.BoxGeometry(W + 2.4, 1.3, .4), archM), {}));
  arch.children[arch.children.length - 1].position.y = 6.5;
  const sign = (() => { const c = document.createElement('canvas'); c.width = 320; c.height = 48; const x = c.getContext('2d');
    for (let i = 0; i < 40; i++) for (let j = 0; j < 6; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 8, j * 8, 8, 8); }
    x.fillStyle = 'rgba(255,107,53,.95)'; x.fillRect(80, 4, 160, 40); x.fillStyle = '#fff'; x.font = 'bold 28px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🏁 卡丁车', 160, 25);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  [1, -1].forEach(s => { const sp = new THREE.Mesh(new THREE.PlaneGeometry(W + 2.2, 1.2), new THREE.MeshBasicMaterial({ map: sign })); sp.position.set(0, 6.5, s * .22); if (s < 0) sp.rotation.y = Math.PI; arch.add(sp); });
  // 轮胎墙（弯道外侧，平地上）
  const tyreM = M(0x212529), tyreStripe = M(0xffd43b);
  for (let i = 0; i < N; i += 9) {
    const p = local[i], pn = local[(i + 6) % N], pp = local[(i - 6 + N) % N];
    const turn = (pn.x - p.x) * (p.z - pp.z) - (pn.z - p.z) * (p.x - pp.x);
    if (Math.abs(turn) < 2.2 || p.y > .3) continue;
    const s = turn > 0 ? 1 : -1, sd = side[i];
    for (let h = 0; h < 2; h++) { const ty = new THREE.Mesh(new THREE.TorusGeometry(.5, .24, 8, 14), h ? tyreStripe : tyreM); ty.rotation.x = Math.PI / 2; ty.position.set(p.x + sd.x * s * (W / 2 + 1.6), .24 + h * .46, p.z + sd.z * s * (W / 2 + 1.6)); g.add(ty); }
  }
  // 高架下面的柱子
  for (let i = 0; i < N; i += 8) { const p = local[i]; if (p.y < 2.5) continue; const col = new THREE.Mesh(new THREE.CylinderGeometry(.35, .45, p.y, 8), M(0xced4da)); col.position.set(p.x, p.y / 2, p.z); g.add(col); }
  // 维修区小棚子（上车的地方）：在起点外侧
  const pitLocal = p0.clone().addScaledVector(s0, -(W / 2 + 6)).addScaledVector(t0, -6);
  const pit = new THREE.Group(); pit.position.set(pitLocal.x, 0, pitLocal.z); pit.rotation.y = Math.atan2(t0.x, t0.z); g.add(pit);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(6, .2, 9), M(0xced4da)); floor.position.y = .1; pit.add(floor);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(6.6, .3, 9.6), M(0xff922b)); roof.position.y = 4.2; pit.add(roof);
  [[-2.9, -4.4], [2.9, -4.4], [-2.9, 4.4], [2.9, 4.4]].forEach(([x, z]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 4.1, 6), M(0xffffff)); p.position.set(x, 2.1, z); pit.add(p); });
  [-1.6, 1.6].forEach((z, i) => { const parked = buildKart([0xff6b6b, 0x4dabf7][i]); parked.group.position.set(0, .2, z * 1.5); pit.add(parked.group); });

  const pitWorld = new THREE.Vector3(cx + pitLocal.x, 0, cz + pitLocal.z);
  const startLocal = p0.clone().addScaledVector(t0, -5);
  const api = {
    name: '卡丁车', icon: '🏎️', group: g, kind: 'kart',
    entry: [pitWorld.x, pitWorld.z], entryR: 6,
    colliders: [],
    W, start: { x: cx + startLocal.x, z: cz + startLocal.z, heading: Math.atan2(t0.x, t0.z) },
    // 离中心线多远、在一圈里的位置 0..1、那里的路面高度和坡度
    track(x, z) {
      const lx = x - cx, lz = z - cz;
      let best = 0, bd = Infinity;
      for (let i = 0; i < N; i++) { const d = (local[i].x - lx) ** 2 + (local[i].z - lz) ** 2; if (d < bd) { bd = d; best = i; } }
      const c = local[best], tt = tan[best];
      return { off: Math.sqrt(bd), s: best / N, cx: c.x + cx, cz: c.z + cz, y: c.y, tan: tt };
    },
    // 种树时避开赛道
    blocks(x, z) { return this.track(x, z).off < W / 2 + 5; },
    pointAt(i) { const p = local[((i % N) + N) % N]; return [cx + p.x, p.y, cz + p.z]; }, N,
    update() {},
  };
  // 走路的人不能走进高架下面（只挡比较高的地方）
  for (let i = 0; i < N; i += 4) if (local[i].y > 1) api.colliders.push([cx + local[i].x, cz + local[i].z, W / 2 + .6]);
  return api;
}

// 一辆小卡丁车：底盘、四个轮子、座椅、方向盘、前后保险杠、号码牌
export function buildKart(color) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const C = M(color, { metalness: .2, roughness: .4 }), dark = M(0x2b2d42), black = M(0x111111);
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.5, .22, 2.5), dark); chassis.position.y = .25; body.add(chassis);
  const shell = new THREE.Mesh(new THREE.CapsuleGeometry(.5, 1.2, 6, 12), C); shell.rotation.x = Math.PI / 2; shell.scale.set(1.25, 1, .55); shell.position.set(0, .42, .25); body.add(shell);
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.5, .3, .5), C); nose.position.set(0, .35, 1.35); body.add(nose);
  const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.7, .16, .2), black); bumper.position.set(0, .3, -1.35); body.add(bumper);
  const seat = new THREE.Mesh(new THREE.BoxGeometry(.75, .7, .2), black); seat.position.set(0, .7, -.55); seat.rotation.x = -.25; body.add(seat);
  const wheelS = new THREE.Mesh(new THREE.TorusGeometry(.2, .04, 6, 16), black); wheelS.position.set(0, .82, .55); wheelS.rotation.x = -.9; body.add(wheelS);
  const num = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#fff'; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill(); x.fillStyle = '#111'; x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(String(1 + Math.floor(Math.random() * 9)), 32, 34);
    return new THREE.CanvasTexture(c); })();
  const plate = new THREE.Mesh(new THREE.CircleGeometry(.22, 20), new THREE.MeshBasicMaterial({ map: num })); plate.position.set(0, .51, 1.61); body.add(plate);
  const wheels = [];
  [[-.78, .75], [.78, .75], [-.8, -.8], [.8, -.8]].forEach(([x, z], i) => {
    const w = new THREE.Group(); w.position.set(x, .28, z); g.add(w);
    const tyre = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, .26, 16), black); tyre.rotation.z = Math.PI / 2; w.add(tyre);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, .27, 10), M(0xdee2e6, { metalness: .6 })); hub.rotation.z = Math.PI / 2; w.add(hub);
    w.userData.front = i < 2; wheels.push(w);
  });
  const seatPt = new THREE.Object3D(); seatPt.position.set(0, .55, -.35); g.add(seatPt);
  g.scale.setScalar(1.6);                 // 和人的大小配起来
  let roll = 0;
  return { group: g, seat: seatPt, update(dt, speed, steer) {
    roll += speed * dt / .28;
    wheels.forEach(w => { w.children.forEach(c => c.rotation.x = roll); if (w.userData.front) w.rotation.y = steer * .45; });
    body.rotation.z = -steer * Math.min(1, Math.abs(speed) / 14) * .06;
  } };
}
