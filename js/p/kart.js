// ===== 卡丁车：赛道 + 自己开的小车 =====
// 赛道是“操场形”（两条直道 + 两个半圆弯），沿 Z 方向放；在维修区按 E 上车，WASD 开，按 E 下车
import * as THREE from 'three';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .55, ...o });
const KART_COLORS = [0xff6b6b, 0x4dabf7, 0xffd43b, 0x69db7c, 0xda77f2, 0xff922b, 0x3bc9db, 0xf783ac];
export const kartColorOf = id => { let h = 0; for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return KART_COLORS[h % KART_COLORS.length]; };

export function kartTrack(cx, cz) {
  const Ls = 11, Rr = 9, W = 6.5;                 // 直道半长、弯道半径、路宽
  const g = new THREE.Group(); g.position.set(cx, 0, cz);
  // 中心线上的点（局部坐标），顺时针一圈
  const N = 160, center = [];
  for (let i = 0; i < N; i++) center.push(pointAt(i / N));
  function pointAt(s) {
    // s: 0..1；0 = 东边直道的中间（起点线），往 -Z 方向开
    const straight = 2 * Ls, arc = Math.PI * Rr, L = 2 * straight + 2 * arc;
    let d = (((s % 1) + 1) % 1) * L;
    if (d < Ls) return new THREE.Vector3(Rr, 0, -d);
    d -= Ls;
    if (d < arc) { const a = d / Rr; return new THREE.Vector3(Math.cos(a) * Rr, 0, -Ls - Math.sin(a) * Rr); }
    d -= arc;
    if (d < straight) return new THREE.Vector3(-Rr, 0, -Ls + d);
    d -= straight;
    if (d < arc) { const a = d / Rr; return new THREE.Vector3(-Math.cos(a) * Rr, 0, Ls + Math.sin(a) * Rr); }
    d -= arc;
    return new THREE.Vector3(Rr, 0, Ls - d);
  }
  // 路面：沿中心线做一条带子
  const road = new THREE.BufferGeometry(), pos = [], uv = [], idx = [];
  const tan = new THREE.Vector3(), side = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= N; i++) {
    const p = center[i % N], q = center[(i + 1) % N]; tan.subVectors(q, p).normalize(); side.crossVectors(tan, up).normalize();
    pos.push(p.x + side.x * W / 2, .05, p.z + side.z * W / 2, p.x - side.x * W / 2, .05, p.z - side.z * W / 2);
    uv.push(0, i / 4, 1, i / 4);
    if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2);
  }
  road.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); road.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); road.setIndex(idx); road.computeVertexNormals();
  const asphalt = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 64; const x = c.getContext('2d');
    x.fillStyle = '#4a4e57'; x.fillRect(0, 0, 64, 64); for (let i = 0; i < 300; i++) { x.fillStyle = Math.random() < .5 ? '#555a64' : '#40444c'; x.fillRect(Math.random() * 64, Math.random() * 64, 2, 2); }
    x.fillStyle = '#ffffff'; x.fillRect(30, 0, 4, 28);
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; })();
  g.add(new THREE.Mesh(road, new THREE.MeshStandardMaterial({ map: asphalt, roughness: .9, side: THREE.DoubleSide })));
  // 红白路肩
  for (let i = 0; i < N; i += 2) {
    const p = center[i], q = center[(i + 1) % N]; tan.subVectors(q, p).normalize(); side.crossVectors(tan, up).normalize();
    [1, -1].forEach(sd => {
      const kb = new THREE.Mesh(new THREE.BoxGeometry(.5, .14, 1.1), M((i / 2) % 2 ? 0xffffff : 0xe03131));
      kb.position.set(p.x + side.x * sd * (W / 2 + .25), .07, p.z + side.z * sd * (W / 2 + .25)); kb.lookAt(kb.position.clone().add(tan)); g.add(kb);
    });
  }
  // 起点线（黑白格）
  const chk = (() => { const c = document.createElement('canvas'); c.width = 64; c.height = 16; const x = c.getContext('2d');
    for (let i = 0; i < 16; i++) for (let j = 0; j < 4; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 4, j * 4, 4, 4); }
    const t = new THREE.CanvasTexture(c); t.magFilter = THREE.NearestFilter; return t; })();
  const line = new THREE.Mesh(new THREE.PlaneGeometry(W, 1.2), new THREE.MeshBasicMaterial({ map: chk }));
  line.rotation.x = -Math.PI / 2; line.position.set(Rr, .07, 0); g.add(line);
  // 起点拱门
  const archM = M(0x1c7ed6, { metalness: .3 });
  [-1, 1].forEach(s => { const pole = new THREE.Mesh(new THREE.CylinderGeometry(.18, .18, 4.6, 8), archM); pole.position.set(Rr + s * (W / 2 + .7), 2.3, 0); g.add(pole); });
  const bar = new THREE.Mesh(new THREE.BoxGeometry(W + 1.8, .9, .3), archM); bar.position.set(Rr, 4.6, 0); g.add(bar);
  const sign = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 40; const x = c.getContext('2d');
    for (let i = 0; i < 32; i++) for (let j = 0; j < 5; j++) { x.fillStyle = (i + j) % 2 ? '#111' : '#fff'; x.fillRect(i * 8, j * 8, 8, 8); }
    x.fillStyle = 'rgba(255,107,53,.92)'; x.fillRect(64, 4, 128, 32); x.fillStyle = '#fff'; x.font = 'bold 24px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🏁 卡丁车', 128, 21);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  [1, -1].forEach(s => { const sp = new THREE.Mesh(new THREE.PlaneGeometry(W + 1.6, 1), new THREE.MeshBasicMaterial({ map: sign })); sp.position.set(Rr, 4.6, s * .17); if (s < 0) sp.rotation.y = Math.PI; g.add(sp); });
  // 轮胎墙（弯道外侧）
  const tyreM = M(0x212529), tyreStripe = M(0xffd43b);
  [[0, -Ls], [0, Ls]].forEach(([ox, oz]) => {
    for (let k = 0; k < 9; k++) {
      const a = (k / 8) * Math.PI, sz = oz < 0 ? -1 : 1, R2 = Rr + W / 2 + 1.4;
      const x = Math.cos(a) * R2, z = oz + sz * Math.sin(a) * R2;
      for (let h = 0; h < 2; h++) { const ty = new THREE.Mesh(new THREE.TorusGeometry(.42, .2, 8, 14), h ? tyreStripe : tyreM); ty.rotation.x = Math.PI / 2; ty.position.set(x, .2 + h * .38, z); g.add(ty); }
    }
  });
  // 维修区小棚子（上车的地方）
  const pit = new THREE.Group(); pit.position.set(Rr + W / 2 + 4.2, 0, 6); g.add(pit);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(4, .2, 6), M(0xced4da)); floor.position.y = .1; pit.add(floor);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(4.4, .25, 6.4), M(0xff922b)); roof.position.y = 3.2; pit.add(roof);
  [[-1.9, -2.9], [1.9, -2.9], [-1.9, 2.9], [1.9, 2.9]].forEach(([x, z]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.1, .1, 3.1, 6), M(0xffffff)); p.position.set(x, 1.6, z); pit.add(p); });
  const parked = buildKart(0xff6b6b); parked.group.position.set(0, .2, 0); parked.group.rotation.y = -Math.PI / 2; pit.add(parked.group);

  const world = new THREE.Vector3();
  const api = {
    name: '卡丁车', icon: '🏎️', group: g, kind: 'kart',
    entry: [cx + Rr + W / 2 + 4.2, cz + 6], entryR: 4.2,
    colliders: [[cx + Rr + W / 2 + 4.2 + 1.9, cz + 6 - 2.9, .3], [cx + Rr + W / 2 + 4.2 + 1.9, cz + 6 + 2.9, .3]],
    W, start: { x: cx + Rr, z: cz + 3, heading: Math.PI },          // 起点线后面一点，朝 -Z 开
    status() { return '按 E 开卡丁车'; },
    // 离中心线多远（>W/2 就是在草地上）、在一圈里的位置 0..1、最近的中心线点
    track(x, z) {
      const lx = x - cx, lz = z - cz;
      let best = 0, bd = Infinity;
      for (let i = 0; i < N; i++) { const d = (center[i].x - lx) ** 2 + (center[i].z - lz) ** 2; if (d < bd) { bd = d; best = i; } }
      const c = center[best];
      return { off: Math.sqrt(bd), s: best / N, cx: c.x + cx, cz: c.z + cz };
    },
    update() {},
  };
  void world;
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
  let roll = 0;
  return { group: g, seat: seatPt, update(dt, speed, steer) {
    roll += speed * dt / .28;
    wheels.forEach(w => { w.children.forEach(c => c.rotation.x = roll); if (w.userData.front) w.rotation.y = steer * .45; });
    body.rotation.z = -steer * Math.min(1, Math.abs(speed) / 14) * .06;
  } };
}
