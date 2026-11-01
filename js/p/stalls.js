// ===== 摆摊小游戏：🎈 射气球、🏺 投壶 =====
// 站到摊位前按 E 开始：镜头固定在摊位前面，用鼠标 / 手指瞄准
import * as THREE from 'three';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .6, ...o });
const BAL_C = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2, 0xff922b, 0xf783ac, 0x22b8cf];
const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

// 摊位的小房子：条纹顶棚 + 柜台 + 招牌；front 朝 -z（局部），玩家站在柜台前面
function booth(title, color) {
  const g = new THREE.Group();
  const stripe = tex(128, 32, (x) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#ffffff' : color; x.fillRect(i * 16, 0, 16, 32); } });
  stripe.wrapS = THREE.RepeatWrapping; stripe.repeat.set(2, 1);
  const wood = M(0xc8915a), dark = M(0x8b5a2b);
  // 柱子
  [[-3.4, -1.6], [3.4, -1.6], [-3.4, 3.6], [3.4, 3.6]].forEach(([x, z]) => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.13, .13, 4.2, 8), dark); p.position.set(x, 2.1, z); g.add(p); });
  // 顶棚（斜的条纹布）
  const roof = new THREE.Mesh(new THREE.BoxGeometry(7.4, .15, 5.8), M(0xffffff, { map: stripe })); roof.position.set(0, 4.35, 1); roof.rotation.x = -.12; g.add(roof);
  const val = new THREE.Mesh(new THREE.PlaneGeometry(7.4, .7), M(0xffffff, { map: stripe, side: THREE.DoubleSide })); val.position.set(0, 3.95, -1.95); g.add(val);
  // 柜台
  const counter = new THREE.Mesh(new THREE.BoxGeometry(7, 1.05, .7), wood); counter.position.set(0, .53, -1.6); g.add(counter);
  const ctop = new THREE.Mesh(new THREE.BoxGeometry(7.2, .1, .9), M(color)); ctop.position.set(0, 1.08, -1.6); g.add(ctop);
  // 后墙 + 两边
  const back = new THREE.Mesh(new THREE.BoxGeometry(7, 4, .2), M(0x3b2a5c)); back.position.set(0, 2, 3.7); g.add(back);
  [-1, 1].forEach(s => { const w = new THREE.Mesh(new THREE.BoxGeometry(.15, 3.2, 5.2), M(0x5f3dc4)); w.position.set(s * 3.45, 1.6, 1.05); g.add(w); });
  const floor = new THREE.Mesh(new THREE.BoxGeometry(7, .1, 5.3), M(0xe9d8a6)); floor.position.set(0, .05, 1.05); g.add(floor);
  // 招牌
  const sg = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 1.15), new THREE.MeshBasicMaterial({ map: tex(512, 128, (x, w, h) => { x.fillStyle = color; x.beginPath(); x.roundRect(4, 4, w - 8, h - 8, 30); x.fill(); x.strokeStyle = '#fff'; x.lineWidth = 6; x.stroke();
    x.fillStyle = '#fff'; x.font = 'bold 64px "PingFang SC","Microsoft YaHei",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(title, w / 2, h / 2 + 3); }), transparent: true, side: THREE.DoubleSide }));
  sg.position.set(0, 5.1, -2.05); sg.rotation.y = Math.PI; g.add(sg);
  // 灯泡（晚上亮）
  for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd9d4c8 })); b.position.set(-3.3 + i * .6, 3.6, -1.95); b.userData.nightBulb = BAL_C[i % BAL_C.length]; g.add(b); }
  return g;
}

// ---------------- 🎈 射气球 ----------------
function balloonStall(x, z, rot = 0) {
  const g = booth('🎈 射气球', '#ff6b6b'); g.position.set(x, 0, z); g.rotation.y = rot;
  const board = new THREE.Mesh(new THREE.BoxGeometry(6.2, 3, .15), M(0xfff3bf)); board.position.set(0, 2.4, 3.5); g.add(board);
  // 奖品架
  const shelf = new THREE.Mesh(new THREE.BoxGeometry(6.4, .1, .5), M(0x8b5a2b)); shelf.position.set(0, 4.05, 3.4); g.add(shelf);
  for (let i = 0; i < 7; i++) { const toy = new THREE.Mesh(new THREE.SphereGeometry(.22, 10, 8), M(BAL_C[i])); toy.position.set(-2.7 + i * .9, 4.32, 3.4); g.add(toy);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(.09, 8, 6), M(BAL_C[i])); ear.position.set(-2.7 + i * .9 + .14, 4.5, 3.4); g.add(ear); }
  const balloons = [];
  const ROWS = 4, COLS = 8;
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
    const b = new THREE.Mesh(new THREE.SphereGeometry(.26, 14, 12), new THREE.MeshStandardMaterial({ color: BAL_C[(r * 3 + c) % BAL_C.length], roughness: .2, metalness: .1 })); b.scale.y = 1.18;
    b.userData = { r, c, bx: -2.62 + c * .75, by: 1.35 + r * .72, alive: true }; b.position.set(b.userData.bx, b.userData.by, 3.33); g.add(b); balloons.push(b);
  }
  return { group: g, balloons, standLocal: new THREE.Vector3(0, 0, -3.2) };
}

// ---------------- 🏺 投壶 ----------------
function potStall(x, z, rot = 0) {
  const g = booth('🏺 投壶', '#1c7ed6'); g.position.set(x, 0, z); g.rotation.y = rot;
  // 地上铺一块红毯，壶放在上面
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(6.4, 4.8), M(0xc92a2a)); rug.rotation.x = -Math.PI / 2; rug.position.set(0, .11, 1.1); g.add(rug);
  const potM = [M(0x2b8a3e, { roughness: .3, metalness: .2 }), M(0x1971c2, { roughness: .3, metalness: .2 }), M(0xe8590c, { roughness: .3, metalness: .2 })];
  // 三个壶：近（1 分）、中（2 分）、远（3 分）
  const pots = [[-1.6, .2, 1, .34], [1.2, 1.4, 2, .3], [-.3, 3, 3, .26]].map(([px, pz, pts, rr], i) => {
    const pg = new THREE.Group(); pg.position.set(px, .1, pz); g.add(pg);
    const pts2 = [[.05, 0], [.36, .05], [.46, .3], [.42, .6], [.22, .82], [rr, .95], [rr + .05, 1.0]].map(([a, b]) => new THREE.Vector2(a, b));
    pg.add(new THREE.Mesh(new THREE.LatheGeometry(pts2, 24), potM[i]));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(rr + .03, .035, 8, 24), M(0xffd43b, { metalness: .6 })); rim.rotation.x = Math.PI / 2; rim.position.y = 1; pg.add(rim);
    const lab = new THREE.Mesh(new THREE.PlaneGeometry(.55, .3), new THREE.MeshBasicMaterial({ map: tex(128, 64, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#c92a2a'; x.font = 'bold 44px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(pts + '分', w / 2, h / 2 + 2); }) }));
    lab.position.set(0, .5, -.47); lab.rotation.y = Math.PI; pg.add(lab);
    return { g: pg, pts, r: rr, y: 1.1 };
  });
  return { group: g, pots, standLocal: new THREE.Vector3(0, 0, -3.2) };
}


// ---------------- ⭕ 套圈 ----------------
function ringStall(x, z, rot = 0) {
  const g = booth('⭕ 套圈', '#2b8a3e'); g.position.set(x, 0, z); g.rotation.y = rot;
  const table = new THREE.Mesh(new THREE.BoxGeometry(5.6, .5, 3.8), M(0x2f9e44)); table.position.set(0, .35, 1.6); g.add(table);
  const bottles = [];
  [[.5, 1], [1.6, 2], [2.8, 3]].forEach(([bz, pts], row) => [-1.7, 0, 1.7].forEach((bx, k) => {
    const bg = new THREE.Group(); bg.position.set(bx + (row % 2 ? .5 : 0), .6, bz); g.add(bg);
    const c = [0x1971c2, 0xe03131, 0xf59f00][row];
    const body = new THREE.Mesh(new THREE.CylinderGeometry(.13, .15, .42, 12), new THREE.MeshStandardMaterial({ color: c, transparent: true, opacity: .85, roughness: .15 })); body.position.y = .21; bg.add(body);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(.05, .1, .22, 10), body.material); neck.position.y = .53; bg.add(neck);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(.055, .055, .05, 10), M(0xffd43b)); cap.position.y = .66; bg.add(cap);
    bottles.push({ g: bg, pts, top: .6 + .68 });
  }));
  // 牌子：近 1 分 中 2 分 远 3 分
  const lab = new THREE.Mesh(new THREE.PlaneGeometry(4, .5), new THREE.MeshBasicMaterial({ map: tex(512, 64, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#2b8a3e'; x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('蓝 1 分 · 红 2 分 · 黄 3 分', w / 2, h / 2 + 2); }) }));
  lab.position.set(0, 2.9, 3.58); lab.rotation.y = Math.PI; g.add(lab);
  return { group: g, bottles, kind: 'ring' };
}
// ---------------- 🔨 打地鼠 ----------------
function moleStall(x, z, rot = 0) {
  const g = booth('🔨 打地鼠', '#e8590c'); g.position.set(x, 0, z); g.rotation.y = rot;
  const table = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.0, 3), M(0x8b5a2b)); table.position.set(0, .5, .9); g.add(table);
  const top = new THREE.Mesh(new THREE.BoxGeometry(4.3, .08, 3.1), M(0x69db7c)); top.position.set(0, 1.04, .9); g.add(top);
  const moles = [];
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
    const hx = -1.3 + c * 1.3, hz = 0 + r * .95;
    const hole = new THREE.Mesh(new THREE.CircleGeometry(.32, 20), M(0x2b1d14)); hole.rotation.x = -Math.PI / 2; hole.position.set(hx, 1.09, hz); g.add(hole);
    const m = new THREE.Group(); m.position.set(hx, .75, hz); g.add(m);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.26, 16, 12), M(0x8d6e63)); head.scale.y = 1.15; m.add(head);
    const nose = new THREE.Mesh(new THREE.SphereGeometry(.07, 10, 8), M(0xff8787)); nose.position.set(0, .02, -.25); m.add(nose);
    [-1, 1].forEach(sx => { const e = new THREE.Mesh(new THREE.SphereGeometry(.045, 8, 6), M(0x111111)); e.position.set(sx * .1, .12, -.22); m.add(e); });
    const teeth = new THREE.Mesh(new THREE.BoxGeometry(.08, .06, .02), M(0xffffff)); teeth.position.set(0, -.07, -.25); m.add(teeth);
    head.userData.mole = m; moles.push({ m, head, up: 0, until: 0, hit: 0, baseY: .75 });
  }
  return { group: g, moles, kind: 'mole' };
}
// ---------------- 🦆 捞小鸭 ----------------
function duckStall(x, z, rot = 0) {
  const g = booth('🦆 捞小鸭', '#f59f00'); g.position.set(x, 0, z); g.rotation.y = rot;
  const pool = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 2.4, .7, 32), M(0x4dabf7)); pool.position.set(0, .35, 1.2); g.add(pool);
  const rimM = new THREE.Mesh(new THREE.TorusGeometry(2.3, .1, 8, 40), M(0xffffff)); rimM.rotation.x = Math.PI / 2; rimM.position.set(0, .72, 1.2); g.add(rimM);
  const wtex = tex(128, 128, (x) => { x.fillStyle = '#74c0fc'; x.fillRect(0, 0, 128, 128); x.strokeStyle = 'rgba(255,255,255,.4)'; for (let i = 0; i < 14; i++) { x.beginPath(); x.arc(Math.random() * 128, Math.random() * 128, 6 + Math.random() * 10, 0, 3); x.stroke(); } });
  const water = new THREE.Mesh(new THREE.CircleGeometry(2.25, 32), new THREE.MeshStandardMaterial({ map: wtex, roughness: .1 })); water.rotation.x = -Math.PI / 2; water.position.set(0, .71, 1.2); g.add(water);
  const island = new THREE.Mesh(new THREE.CylinderGeometry(.5, .55, .2, 16), M(0xffd43b)); island.position.set(0, .78, 1.2); g.add(island);
  const ducks = [];
  for (let k = 0; k < 12; k++) {
    const d = new THREE.Group(); g.add(d);
    const body = new THREE.Mesh(new THREE.SphereGeometry(.2, 12, 10), M(0xffd43b)); body.scale.set(1, .75, 1.25); d.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(.12, 10, 8), M(0xffd43b)); head.position.set(0, .16, .17); d.add(head);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(.04, .1, 8), M(0xff922b)); beak.rotation.x = Math.PI / 2; beak.position.set(0, .15, .3); d.add(beak);
    const pts = 1 + Math.floor(Math.random() * 5);
    const num = new THREE.Mesh(new THREE.CircleGeometry(.13, 16), new THREE.MeshBasicMaterial({ map: tex(64, 64, (x) => { x.fillStyle = '#fff'; x.beginPath(); x.arc(32, 32, 30, 0, 7); x.fill(); x.fillStyle = '#e03131'; x.font = 'bold 44px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(pts, 32, 35); }) }));
    num.rotation.x = Math.PI / 2; num.position.y = -.16; d.add(num);
    body.userData.duck = k; head.userData.duck = k;
    ducks.push({ d, pts, r: k % 2 ? 1.65 : 1.05, a: k / 12 * Math.PI * 2, sp: (k % 2 ? .35 : -.45), caught: 0, body, head });
  }
  return { group: g, ducks, kind: 'duck' };
}
// ---------------- 🎡 幸运大转盘 ----------------
export const WHEEL_PRIZES = ['🪙 5', '🪙 10', '🎁 再转一次', '🪙 20', '🧸 小熊', '🪙 50', '😅 谢谢', '🪙 10'];
function wheelStall(x, z, rot = 0) {
  const g = booth('🎡 幸运转盘', '#ae3ec9'); g.position.set(x, 0, z); g.rotation.y = rot;
  const W = new THREE.Group(); W.position.set(0, 2.2, 3.45); g.add(W);
  const n = WHEEL_PRIZES.length, cols = ['#ff6b6b', '#ffd43b', '#69db7c', '#4dabf7', '#da77f2', '#ff922b', '#adb5bd', '#22b8cf'];
  const wt = tex(512, 512, (x) => { const c = 256; for (let i = 0; i < n; i++) { x.fillStyle = cols[i]; x.beginPath(); x.moveTo(c, c); x.arc(c, c, 250, (i - .5) / n * Math.PI * 2 - Math.PI / 2, (i + .5) / n * Math.PI * 2 - Math.PI / 2); x.closePath(); x.fill();
      x.save(); x.translate(c, c); x.rotate(i / n * Math.PI * 2); x.fillStyle = '#fff'; x.font = 'bold 40px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(WHEEL_PRIZES[i], 0, -165); x.restore(); }
    x.strokeStyle = '#fff'; x.lineWidth = 10; x.beginPath(); x.arc(c, c, 250, 0, 7); x.stroke(); x.fillStyle = '#fff'; x.beginPath(); x.arc(c, c, 34, 0, 7); x.fill(); });
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.75, 64), new THREE.MeshBasicMaterial({ map: wt })); disc.rotation.y = Math.PI; W.add(disc);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(1.8, .08, 8, 48), M(0xffd43b, { metalness: .6 })); W.add(rim);
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, b = new THREE.Mesh(new THREE.SphereGeometry(.07, 8, 6), new THREE.MeshBasicMaterial({ color: i % 2 ? 0xffffff : 0xffd43b })); b.position.set(Math.cos(a) * 1.8, Math.sin(a) * 1.8, -.05); W.add(b); }
  const ptr = new THREE.Mesh(new THREE.ConeGeometry(.18, .45, 3), M(0xe03131)); ptr.rotation.z = Math.PI; ptr.position.set(0, 4.25, 3.35); g.add(ptr);
  return { group: g, disc, kind: 'wheel' };
}

export function buildStalls(scene, cx, cz) {
  const root = new THREE.Group(); scene.add(root);
  // 两排面对面：北边一排朝南、南边一排朝北，中间是一条小街
  const N_Z = cz - 8, S_Z = cz + 8;
  const list = [ringStall(cx - 26, N_Z, Math.PI), balloonStall(cx, N_Z, Math.PI), moleStall(cx + 26, N_Z, Math.PI),
    potStall(cx - 26, S_Z, 0), wheelStall(cx, S_Z, 0), duckStall(cx + 26, S_Z, 0)];
  const info = { ring: ['⭕', '套圈'], balloon: ['🎈', '射气球'], mole: ['🔨', '打地鼠'], pot: ['🏺', '投壶'], wheel: ['🎡', '幸运转盘'], duck: ['🦆', '捞小鸭'] };
  const kinds = ['ring', 'balloon', 'mole', 'pot', 'wheel', 'duck'];
  list.forEach((st, i) => { st.kind = kinds[i]; root.add(st.group); st.group.updateMatrixWorld(true); });
  // 街尾的冰淇淋车
  const cart = new THREE.Group(); cart.position.set(cx + 44, 0, cz); cart.rotation.y = -Math.PI / 2; root.add(cart);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 1.3), M(0xfff0f6)); body.position.y = 1; cart.add(body);
  [-.9, .9].forEach(x2 => { const w = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, .15, 16), M(0x495057)); w.rotation.x = Math.PI / 2; w.position.set(x2, .35, .7); cart.add(w); });
  const umb = new THREE.Mesh(new THREE.ConeGeometry(1.8, .9, 12), M(0xf783ac)); umb.position.y = 3.2; cart.add(umb);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.4, 6), M(0xdee2e6)); pole.position.y = 2.2; cart.add(pole);
  [[-.6, 0xffc9de], [0, 0xfff3bf], [.6, 0x8b5a2b]].forEach(([x2, c]) => { const cone = new THREE.Mesh(new THREE.ConeGeometry(.12, .35, 10), M(0xd9a441)); cone.rotation.x = Math.PI; cone.position.set(x2, 1.75, 0); cart.add(cone);
    const sc = new THREE.Mesh(new THREE.SphereGeometry(.15, 10, 8), M(c)); sc.position.set(x2, 1.98, 0); cart.add(sc); });
  // 街上空挂一串彩旗
  { const pts = []; for (let i = 0; i <= 40; i++) { const u = i / 40; pts.push(new THREE.Vector3(cx - 40 + u * 80, 5.2 - Math.sin(u * Math.PI) * 1.2, cz)); }
    root.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0x495057 })));
    const fl = new THREE.InstancedMesh(new THREE.ConeGeometry(.35, .7, 3), new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide }), 40), o = new THREE.Object3D(), cc = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2].map(c => new THREE.Color(c));
    for (let i = 0; i < 40; i++) { const p = pts[i]; o.position.set(p.x + 1, p.y - .4, p.z); o.rotation.set(0, 0, Math.PI); o.updateMatrix(); fl.setMatrixAt(i, o.matrix); fl.setColorAt(i, cc[i % 5]); } root.add(fl); }
  const stand = st => { const v = st.group.localToWorld(new THREE.Vector3(0, 0, -3.2)); return [v.x, v.z]; };
  const byKind = {}; list.forEach(st => byKind[st.kind] = st);
  return {
    root, list, byKind, bal: byKind.balloon, pot: byKind.pot,
    colliders: list.map(st => ({ box: [st.group.position.x, st.group.position.z + (st.group.rotation.y ? -.9 : .9), 3.6, 2.8, 0] })).concat([[cx + 44, cz, 1.6]]),
    interact: list.map(st => ({ type: 'stall', game: st.kind, name: info[st.kind][1], icon: info[st.kind][0], pos: stand(st), r: 2.6 })),
  };
}

// ---------------- 玩游戏（镜头固定，鼠标瞄准） ----------------
export function createStallGame({ scene, camera, stalls, sfx, hud }) {
  let G = null;
  const ray = new THREE.Raycaster(), v = new THREE.Vector3(), aim = { x: 0, y: 0 };
  const best = k => +(localStorage.getItem('stallBest_' + k) || 0);
  const VIEW = { balloon: [1.75, [0, 2.4, 3.3]], pot: [3.0, [0, .3, 2.4]], ring: [2.9, [0, .5, 2.2]], mole: [2.9, [0, .9, .7]], duck: [3.0, [0, .6, 1.2]], wheel: [2.1, [0, 2.3, 3.4]] };
  function camSetup(st) { const [eyeY, look] = VIEW[st.kind]; const eye = st.group.localToWorld(new THREE.Vector3(0, eyeY, -3.4)), lk = st.group.localToWorld(new THREE.Vector3(...look));
    camera.position.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(lk); }
  const parts = [];
  function pop(pos, color, n = 26) {
    const geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { p.set([pos.x, pos.y, pos.z], i * 3); const a = Math.random() * 6.283, b = Math.acos(Math.random() * 2 - 1), s = 2 + Math.random() * 3; vel.push(Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s); }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: .09, transparent: true })); scene.add(pts); parts.push({ pts, vel, life: .7 });
  }
  function tickParts(dt) {
    for (let k = parts.length - 1; k >= 0; k--) { const q = parts[k]; q.life -= dt; const a = q.pts.geometry.attributes.position.array;
      for (let i = 0; i < q.vel.length / 3; i++) { q.vel[i * 3 + 1] -= 9 * dt; a[i * 3] += q.vel[i * 3] * dt; a[i * 3 + 1] += q.vel[i * 3 + 1] * dt; a[i * 3 + 2] += q.vel[i * 3 + 2] * dt; }
      q.pts.geometry.attributes.position.needsUpdate = true; q.pts.material.opacity = Math.max(0, q.life / .7);
      if (q.life <= 0) { scene.remove(q.pts); parts.splice(k, 1); } }
  }
  function makeDart(color) { const d = new THREE.Group(); const sh = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, .45, 6), M(0xdee2e6)); sh.rotation.x = Math.PI / 2; d.add(sh);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.03, .1, 6), M(0x495057, { metalness: .8 })); tip.rotation.x = Math.PI / 2; tip.position.z = .27; d.add(tip);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(.07, .14, 4), M(color)); fl.rotation.x = -Math.PI / 2; fl.position.z = -.22; d.add(fl); return d; }
  function makeArrow() { const d = new THREE.Group(); const sh = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .9, 6), M(0x8b5a2b)); sh.rotation.x = Math.PI / 2; d.add(sh);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.04, .12, 6), M(0x868e96, { metalness: .8 })); tip.rotation.x = Math.PI / 2; tip.position.z = .5; d.add(tip);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(.01, .12, .18), M(0xff6b6b)); fl.position.z = -.4; d.add(fl); const fl2 = fl.clone(); fl2.rotation.z = Math.PI / 2; d.add(fl2); return d; }
  function makeRing() { const r = new THREE.Mesh(new THREE.TorusGeometry(.2, .035, 8, 24), M([0xff6b6b, 0xffd43b, 0x4dabf7, 0xda77f2][Math.floor(Math.random() * 4)])); const g = new THREE.Group(); r.rotation.x = Math.PI / 2; g.add(r); return g; }
  const flying = [];
  const TOTAL = { balloon: 10, pot: 5, ring: 5, mole: 30, duck: 6, wheel: 1 };
  function start(kind) {
    clear();
    const st = stalls.byKind[kind];
    G = { kind, st, left: TOTAL[kind], score: 0, t: 0, over: 0, charge: 0, charging: false, yaw: 0 };
    if (kind === 'balloon') st.balloons.forEach(b => { b.userData.alive = true; b.visible = true; });
    if (kind === 'ring') st.rings = [];
    if (kind === 'mole') { st.moles.forEach(m => { m.up = 0; m.until = 0; m.hit = 0; m.m.position.y = m.baseY; }); G.next = .8; }
    if (kind === 'duck') st.ducks.forEach(d => d.caught = 0);
    if (kind === 'wheel') { G.spin = null; }
    updHud();
  }
  function clear() { if (G && G.guide) G.st.group.remove(G.guide); if (G && G.st.rings) { G.st.rings.forEach(r => G.st.group.remove(r)); G.st.rings = []; } flying.splice(0).forEach(f => (f.parent || scene).remove(f.obj)); }
  function updHud() {
    if (!G) return;
    const b = best(G.kind), k = G.kind;
    const unit = { balloon: '支飞镖', pot: '支箭', ring: '个圈', duck: '次', wheel: '次' }[k];
    const how = { balloon: '点气球扔飞镖', pot: '左右瞄准 · 按住蓄力 · 松开扔', ring: '左右瞄准 · 按住蓄力 · 松开扔', mole: '地鼠冒出来就点它！', duck: '点一只小鸭子捞上来', wheel: '点一下转盘开始转' }[k];
    if (G.over) { const extra = k === 'wheel' ? `转到了：${WHEEL_PRIZES[G.score]}` : `得分 ${G.score}${G.score >= b && G.score > 0 ? ' · ⭐ 新纪录！' : ` · 最高 ${b}`}`;
      hud(`🎉 ${extra}　点一下 / 按空格再玩一局 · 按 E 离开`, null); return; }
    const head = k === 'mole' ? `⏱ 还剩 ${Math.ceil(G.left)} 秒 · 打中 ${G.score} 只` : k === 'wheel' ? '🎡 幸运大转盘' : `剩 ${G.left} ${unit} · 得分 ${G.score}`;
    hud(`${head}${k !== 'wheel' ? ` · 最高 ${b}` : ''}　${how}`, (k === 'pot' || k === 'ring') && G.charging ? G.charge : null);
  }
  function finish() { if (!G || G.over) return; G.over = 1; if (G.kind !== 'wheel' && G.score > best(G.kind)) localStorage.setItem('stallBest_' + G.kind, G.score); sfx.chime && sfx.chime(G.score > 0 ? [784, 988, 1318] : [440, 392]); updHud(); }
  // ---- 射气球 ----
  function throwDart(nx, ny) {
    if (G.left <= 0) return; G.left--; sfx.whoosh && sfx.whoosh(.3, true);
    ray.setFromCamera({ x: nx, y: ny }, camera);
    const alive = G.st.balloons.filter(b => b.userData.alive), hits = ray.intersectObjects(alive, false);
    const target = hits.length ? hits[0].point.clone() : ray.ray.at(4, new THREE.Vector3());
    const d = makeDart(BAL_C[G.left % BAL_C.length]); const from = camera.position.clone().add(new THREE.Vector3(.25, -.35, 0).applyQuaternion(camera.quaternion));
    d.position.copy(from); d.lookAt(target); scene.add(d);
    flying.push({ obj: d, from, to: target, t: 0, dur: .22, hit: hits.length ? hits[0].object : null, kind: 'dart' }); updHud();
  }
  // ---- 投壶 / 套圈：抛出去，飞成弧线；碰到摊位的墙、顶就停下 ----
  function throwArc() {
    if (G.left <= 0) return; G.left--; sfx.whoosh && sfx.whoosh(.4, true);
    const st = G.st, ring = G.kind === 'ring';
    const p0L = new THREE.Vector3(.2, ring ? 1.4 : 1.5, -2.6);
    const power = .2 + G.charge * .8, speed = ring ? 3.4 + power * 4.2 : 4.6 + power * 5.2, up = ring ? .62 : .72;
    const velL = new THREE.Vector3(Math.sin(G.yaw) * Math.cos(up), Math.sin(up), Math.cos(G.yaw) * Math.cos(up)).multiplyScalar(speed);
    const o = ring ? makeRing() : makeArrow(); o.position.copy(p0L); st.group.add(o);          // 在摊位自己的坐标里算，方便挡墙
    flying.push({ obj: o, parent: st.group, pos: p0L.clone(), vel: velL, kind: ring ? 'ring' : 'arrow', t: 0, spin: Math.random() * 6 });
    G.charge = 0; G.charging = false; updHud();
  }
  function stepArc(f, dt) {
    const st = G && G.st;
    if (f.done) return f.t > 1.4;
    const prevY = f.pos.y; f.vel.y -= 9.8 * dt; f.pos.addScaledVector(f.vel, dt);
    // 墙：两边 |x|<3.25，后墙 z<3.5，顶 y<4
    if (Math.abs(f.pos.x) > 3.2) { f.pos.x = Math.sign(f.pos.x) * 3.2; f.vel.x *= -.25; f.vel.z *= .5; sfx.click && sfx.click(); }
    if (f.pos.z > 3.45) { f.pos.z = 3.45; f.vel.z *= -.2; f.vel.x *= .5; sfx.click && sfx.click(); }
    if (f.pos.y > 3.9) { f.pos.y = 3.9; f.vel.y = -Math.abs(f.vel.y) * .3; }
    f.obj.position.copy(f.pos);
    if (f.kind === 'arrow') f.obj.lookAt(v.copy(f.pos).add(f.vel)); else { f.spin += dt * 9; f.obj.rotation.set(Math.sin(f.spin) * .2, f.spin, 0); }
    if (st && f.kind === 'arrow' && G.kind === 'pot') for (const pot of st.pots) { const c = pot.g.position, top = c.y + 1.0;
      if (prevY > top && f.pos.y <= top && f.vel.y < 0) { const d = Math.hypot(f.pos.x - c.x, f.pos.z - c.z);
        if (d < pot.r) { f.done = true; f.t = 0; f.pos.y = top - .2; f.obj.position.copy(f.pos); G.score += pot.pts; sfx.chime && sfx.chime(pot.pts >= 3 ? [1046, 1318, 1568] : [880, 1175]); pop(st.group.localToWorld(v.set(c.x, top + .1, c.z)), 0xffd43b); updHud(); }
        else if (d < pot.r + .12) { f.vel.x *= -.3; f.vel.z *= -.3; sfx.click && sfx.click(); } } }
    if (st && f.kind === 'ring' && G.kind === 'ring') for (const b of st.bottles) { const c = b.g.position, top = b.top;
      if (prevY > top && f.pos.y <= top && f.vel.y < 0) { const d = Math.hypot(f.pos.x - c.x, f.pos.z - c.z);
        if (d < .17) { f.done = true; f.t = 0; f.pos.set(c.x, c.y + .35, c.z); f.obj.position.copy(f.pos); f.obj.rotation.set(0, 0, 0); st.rings.push(f.obj); f.keep = true; G.score += b.pts; sfx.chime && sfx.chime(b.pts >= 3 ? [1046, 1318, 1568] : [880, 1175]); pop(st.group.localToWorld(v.set(c.x, top, c.z)), 0x69db7c); updHud(); }
        else if (d < .3) { f.vel.x += (f.pos.x - c.x) * 4; f.vel.z += (f.pos.z - c.z) * 4; f.vel.y *= .3; sfx.click && sfx.click(); } } }
    const floor = (f.kind === 'ring' && st && Math.abs(f.pos.x) < 2.8 && f.pos.z > -.3 && f.pos.z < 3.5) ? .62 : .12;
    if (!f.done && f.pos.y < floor) { f.done = true; f.t = 0; f.pos.y = floor; f.obj.position.copy(f.pos); }
    return false;
  }
  function stepFlying(dt) {
    for (let k = flying.length - 1; k >= 0; k--) {
      const f = flying[k]; f.t += dt;
      if (f.kind === 'dart') {
        const u = Math.min(1, f.t / f.dur); f.obj.position.lerpVectors(f.from, f.to, u); f.obj.position.y -= Math.sin(u * Math.PI) * .05;
        if (u >= 1) {
          if (f.hit && f.hit.userData.alive && G) { f.hit.userData.alive = false; f.hit.visible = false; pop(f.hit.getWorldPosition(v), f.hit.material.color); sfx.boom && sfx.boom(.35); G.score++; updHud(); }
          if (f.t > f.dur + .6) { scene.remove(f.obj); flying.splice(k, 1); if (G && G.kind === 'balloon' && G.left <= 0 && !flying.length) finish(); }
        }
      } else if (stepArc(f, dt)) {
        if (!f.keep) f.parent.remove(f.obj); flying.splice(k, 1);
        if (G && (G.kind === 'pot' || G.kind === 'ring') && G.left <= 0 && !flying.length) finish();
      }
    }
  }
  // ---- 打地鼠 ----
  function stepMole(dt) {
    const st = G.st;
    if (!G.over) { G.left -= dt; if (G.left <= 0) { G.left = 0; finish(); } }
    G.next -= dt;
    if (!G.over && G.next <= 0) { const hidden = st.moles.filter(m => !m.up); if (hidden.length) { const m = hidden[Math.floor(Math.random() * hidden.length)]; m.up = 1; m.hit = 0; m.until = G.t + Math.max(.55, 1.3 - G.t * .02); }
      G.next = Math.max(.3, .8 - G.t * .015) * (.6 + Math.random() * .8); }
    st.moles.forEach(m => { if (m.up && G.t > m.until) m.up = 0; const want = m.up && !m.hit ? m.baseY + .55 : m.baseY; m.m.position.y += (want - m.m.position.y) * Math.min(1, dt * 14); m.m.scale.y = m.hit ? Math.max(.4, m.m.scale.y - dt * 4) : Math.min(1, m.m.scale.y + dt * 4); });
    if (G.t % 1 < dt) updHud();
  }
  function whack(nx, ny) {
    ray.setFromCamera({ x: nx, y: ny }, camera);
    const heads = G.st.moles.filter(m => m.up && !m.hit).map(m => m.head), hits = ray.intersectObjects(heads, false);
    if (hits.length) { const m = G.st.moles.find(mm => mm.head === hits[0].object); m.hit = 1; m.until = G.t + .3; G.score++; sfx.boom && sfx.boom(.3); pop(hits[0].point, 0xffd43b, 14); updHud(); }
    else sfx.click && sfx.click();
  }
  // ---- 捞小鸭 ----
  function stepDuck(dt) {
    G.st.ducks.forEach(d => { d.a += d.sp * dt; const lift = d.caught ? Math.min(1, (G.t - d.caught) * 2) : 0;
      if (d.caught && G.t - d.caught > 3) d.caught = 0;
      d.d.position.set(Math.cos(d.a) * d.r, .78 + lift * 1.3 + Math.sin(G.t * 3 + d.a * 4) * .02, 1.2 + Math.sin(d.a) * d.r);
      d.d.rotation.set(lift * Math.PI, -d.a + (d.sp > 0 ? 0 : Math.PI), 0); });
  }
  function catchDuck(nx, ny) {
    if (G.left <= 0) return;
    ray.setFromCamera({ x: nx, y: ny }, camera);
    const objs = []; G.st.ducks.forEach(d => { if (!d.caught) objs.push(d.body, d.head); });
    const hits = ray.intersectObjects(objs, false);
    if (!hits.length) { sfx.click && sfx.click(); return; }
    const d = G.st.ducks[hits[0].object.userData.duck]; d.caught = G.t; G.left--; G.score += d.pts; sfx.chime && sfx.chime(d.pts >= 4 ? [988, 1318] : [784]); pop(hits[0].point, 0x74c0fc, 18); updHud();
    if (G.left <= 0) setTimeout(() => finish(), 1200);
  }
  // ---- 幸运大转盘 ----
  function spinWheel(target) {
    if (G.spin) return; const n = WHEEL_PRIZES.length, k = target ?? Math.floor(Math.random() * n);
    const cur = G.st.disc.rotation.z, base = cur - (cur % (Math.PI * 2));
    const end = base + Math.PI * 2 * 5 + k / n * Math.PI * 2;
    G.spin = { from: cur, to: end, t: 0, dur: 4.2, k }; sfx.whoosh && sfx.whoosh(1.2, true);
  }
  function stepWheel(dt) {
    const S = G.spin; if (!S || S.done) return;
    S.t += dt; const u = Math.min(1, S.t / S.dur), e = 1 - Math.pow(1 - u, 3);
    const prev = G.st.disc.rotation.z; G.st.disc.rotation.z = S.from + (S.to - S.from) * e;
    if (Math.floor(G.st.disc.rotation.z / (Math.PI / 4)) !== Math.floor(prev / (Math.PI / 4))) sfx.click && sfx.click();
    if (u >= 1) { S.done = true; G.score = S.k; G.left = 0;
      if (WHEEL_PRIZES[S.k].includes('再转')) { setTimeout(() => { if (G && G.kind === 'wheel') { G.spin = null; G.left = 1; updHud(); } }, 1200); sfx.chime && sfx.chime([784, 988, 1318]); hud('🎁 再转一次！点一下转盘', null); }
      else finish(); }
  }
  return {
    get playing() { return !!G; },
    start,
    stop() { clear(); G = null; hud(null); },
    pointer(type, nx, ny) {
      if (!G) return;
      aim.x = nx; aim.y = ny;
      if (G.over) { if (type === 'down') start(G.kind); return; }
      const k = G.kind;
      if (k === 'balloon') { if (type === 'down') throwDart(nx, ny); }
      else if (k === 'mole') { if (type === 'down') whack(nx, ny); }
      else if (k === 'duck') { if (type === 'down') catchDuck(nx, ny); }
      else if (k === 'wheel') { if (type === 'down') spinWheel(); }
      else { G.yaw = THREE.MathUtils.clamp(-nx * .75, -.7, .7); if (type === 'down' && G.left > 0) { G.charging = true; G.charge = 0; G.dir = 1; } if (type === 'up' && G.charging) throwArc(); }
    },
    key(code, down) {
      if (!G || code !== 'Space') return;
      if (G.over) { if (down) start(G.kind); return; }
      const k = G.kind;
      if (k === 'balloon') { if (down) throwDart(aim.x, aim.y); }
      else if (k === 'mole') { if (down) whack(aim.x, aim.y); }
      else if (k === 'duck') { if (down) catchDuck(aim.x, aim.y); }
      else if (k === 'wheel') { if (down) spinWheel(); }
      else { if (down && !G.charging && G.left > 0) { G.charging = true; G.charge = 0; G.dir = 1; } else if (!down && G.charging) throwArc(); }
    },
    update(dt, keys) {
      tickParts(dt); if (G) stepFlying(dt);
      if (!G) return;
      G.t += dt; camSetup(G.st);
      const k = G.kind, mv = (a, b) => keys && (keys[a] || keys[b]);
      if (k === 'balloon') {
        G.st.balloons.forEach(b => { const u = b.userData; const sway = u.r % 2 ? Math.sin(G.t * (1.2 + u.r * .3)) * .5 : 0; b.position.x = u.bx + sway; b.position.y = u.by + Math.sin(G.t * 2 + u.c) * .04; });
      }
      if (k === 'balloon' || k === 'mole' || k === 'duck') {
        if (mv('ArrowLeft', 'KeyA')) aim.x = Math.max(-1, aim.x - dt * 1.2); if (mv('ArrowRight', 'KeyD')) aim.x = Math.min(1, aim.x + dt * 1.2);
        if (mv('ArrowUp', 'KeyW')) aim.y = Math.min(1, aim.y + dt * 1.2); if (mv('ArrowDown', 'KeyS')) aim.y = Math.max(-1, aim.y - dt * 1.2);
      }
      if (k === 'mole') stepMole(dt);
      if (k === 'duck') stepDuck(dt);
      if (k === 'wheel') stepWheel(dt);
      if (k === 'pot' || k === 'ring') {
        if (mv('ArrowLeft', 'KeyA')) G.yaw = Math.min(.7, G.yaw + dt * .8); if (mv('ArrowRight', 'KeyD')) G.yaw = Math.max(-.7, G.yaw - dt * .8);
        if (G.charging) { G.charge += G.dir * dt * 1.1; if (G.charge >= 1) { G.charge = 1; G.dir = -1; } if (G.charge <= 0) { G.charge = 0; G.dir = 1; } updHud(); }
        if (!G.guide) { G.guide = new THREE.Group(); for (let i = 0; i < 8; i++) { const d = new THREE.Mesh(new THREE.CircleGeometry(.06, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .7 })); d.rotation.x = -Math.PI / 2; G.guide.add(d); } G.st.group.add(G.guide); }
        G.guide.children.forEach((d, i) => { const r = .6 + i * .55; d.position.set(.2 + Math.sin(G.yaw) * r, k === 'ring' ? .66 : .13, -2.6 + Math.cos(G.yaw) * r); });
      }
      return { aim, showAim: k === 'balloon' || k === 'mole' || k === 'duck' };
    },
    get aim() { return aim; }, get kind() { return G && G.kind; },
  };
}
