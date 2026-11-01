// ===== 鬼屋：坐小车穿过四个房间（适合小朋友：有点吓人但很可爱） =====
// 会动的画像 → 蝙蝠洞 → 小幽灵跳出来 → 南瓜灯房间 + 大幽灵喊 Boo! → 出口
// 每个人自己坐自己的车（不用共享时钟）；坐车时屋里是黑的，只有每个房间的彩色灯
import * as THREE from 'three';
import * as SFX from '../u/sfx.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .7, ...o });
const add = (p, geo, mat, pos = [0, 0, 0], rot = null, sc = null) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if (rot) m.rotation.set(...rot); if (sc) m.scale.set(...sc); p.add(m); return m; };
function canvasTex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

// 一只可爱的小幽灵
function ghost(scale = 1) {
  const g = new THREE.Group(), white = M(0xffffff, { emissive: 0xd0ebff, emissiveIntensity: .35, roughness: .4 });
  add(g, new THREE.SphereGeometry(.6, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), white, [0, .5, 0]);
  const skirt = new THREE.CylinderGeometry(.6, .7, 1, 20, 3, true), p = skirt.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getY(i) < -.4) { const a = Math.atan2(p.getZ(i), p.getX(i)); p.setY(i, p.getY(i) + Math.sin(a * 6) * .12); }
  skirt.computeVertexNormals(); add(g, skirt, M(0xffffff, { emissive: 0xd0ebff, emissiveIntensity: .35, side: THREE.DoubleSide }), [0, 0, 0]);
  [-1, 1].forEach(s => { add(g, new THREE.SphereGeometry(.09, 10, 8), M(0x1b1b2a), [s * .2, .62, .52]); add(g, new THREE.SphereGeometry(.035, 6, 6), M(0xffffff), [s * .2 + .03, .66, .6]); add(g, new THREE.SphereGeometry(.08, 8, 6), M(0xff8fab, { transparent: true, opacity: .8 }), [s * .34, .45, .48], null, [1, .6, .4]); });
  add(g, new THREE.TorusGeometry(.1, .025, 6, 12, Math.PI), M(0x1b1b2a), [0, .4, .56], [0, 0, Math.PI]);
  [-1, 1].forEach(s => add(g, new THREE.CapsuleGeometry(.1, .3, 4, 8), white, [s * .65, .2, .1], [0, 0, s * .9]));
  g.scale.setScalar(scale); return g;
}
function bat() {
  const g = new THREE.Group(), m = M(0x2b2140);
  add(g, new THREE.SphereGeometry(.18, 10, 8), m);
  [-1, 1].forEach(s => { add(g, new THREE.ConeGeometry(.06, .16, 4), m, [s * .09, .18, 0]); add(g, new THREE.SphereGeometry(.035, 6, 6), M(0xffe066, { emissive: 0xffe066, emissiveIntensity: 1 }), [s * .07, .04, .16]); });
  const wings = [-1, 1].map(s => { const w = new THREE.Group(); w.position.x = s * .12; g.add(w);
    const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.lineTo(s * .55, .15); shape.lineTo(s * .45, -.05); shape.lineTo(s * .3, .02); shape.lineTo(s * .18, -.08); shape.closePath();
    add(w, new THREE.ShapeGeometry(shape), M(0x3b2a5c, { side: THREE.DoubleSide })); return w; });
  g.userData.wings = wings; return g;
}
function pumpkin(s = 1) {
  const g = new THREE.Group(), o = M(0xff922b, { emissive: 0xff6b00, emissiveIntensity: .5 });
  for (let i = 0; i < 6; i++) add(g, new THREE.SphereGeometry(.42, 12, 10), o, [Math.cos(i / 6 * 6.283) * .16, 0, Math.sin(i / 6 * 6.283) * .16], null, [.7, .85, .7]);
  add(g, new THREE.CylinderGeometry(.05, .07, .22, 6), M(0x2f9e44), [0, .42, 0]);
  const face = M(0xffe066, { emissive: 0xffd43b, emissiveIntensity: 2 });
  [-1, 1].forEach(s => add(g, new THREE.ConeGeometry(.08, .12, 3), face, [s * .15, .1, .45], [Math.PI / 2, 0, 0]));
  add(g, new THREE.TorusGeometry(.14, .035, 6, 12, Math.PI), face, [0, -.08, .46], [0, 0, Math.PI]);
  g.scale.setScalar(s); return g;
}

export function hauntedHouse(cx, cz, rotY = 0) {
  const g = new THREE.Group(); g.position.set(cx, 0, cz); g.rotation.y = rotY;
  const HW = 9, HD = 7, H = 7.5;           // 半宽、半深、高
  const wallM = M(0x5f4b8b), wallIn = M(0x2a2140, { side: THREE.DoubleSide }), roofM = M(0x2b2140), trim = M(0x1b1430);
  // 外墙（薄盒子：外面浅紫，里面深色）
  const wall = (w, h, d, x, y, z) => add(g, new THREE.BoxGeometry(w, h, d), [wallM, wallM, wallM, wallM, wallM, wallM], [x, y, z]);
  wall(HW * 2, H, .4, 0, H / 2, -HD); wall(.4, H, HD * 2, -HW, H / 2, 0); wall(.4, H, HD * 2, HW, H / 2, 0);
  // 前墙留两个门洞（入口左、出口右）
  [[-HW + 1.1, 2.2], [-.0, 6.2], [HW - 1.1, 2.2]].forEach(([x, w]) => wall(w, H, .4, x, H / 2, HD));
  wall(3, H - 3.6, .4, -5.5, H - (H - 3.6) / 2, HD); wall(3, H - 3.6, .4, 5.5, H - (H - 3.6) / 2, HD);
  add(g, new THREE.BoxGeometry(HW * 2, .3, HD * 2), wallIn, [0, H, 0]);                         // 天花板
  add(g, new THREE.BoxGeometry(HW * 2 - .4, .1, HD * 2 - .4), M(0x231a35), [0, .05, 0]);        // 地板
  // 室内深色内衬（让里面看起来是黑的）
  add(g, new THREE.BoxGeometry(HW * 2 - .5, H - .1, .05), wallIn, [0, H / 2, -HD + .25]);
  add(g, new THREE.BoxGeometry(.05, H - .1, HD * 2 - .5), wallIn, [-HW + .25, H / 2, 0]);
  add(g, new THREE.BoxGeometry(.05, H - .1, HD * 2 - .5), wallIn, [HW - .25, H / 2, 0]);
  // 中间的隔墙，把屋子分成前后左右四个房间（路线绕一圈）
  add(g, new THREE.BoxGeometry(.3, H - .2, HD * 2 - 6), wallIn, [0, H / 2, -1]);
  // 屋顶 + 两个小塔
  const roof = add(g, new THREE.ConeGeometry(HW * 1.25, 4.5, 4), roofM, [0, H + 2.2, 0], [0, Math.PI / 4, 0]); roof.scale.set(1, 1, .8);
  [[-HW + 1.5, -HD + 1.5], [HW - 1.5, -HD + 1.5]].forEach(([x, z]) => { add(g, new THREE.CylinderGeometry(1.2, 1.3, H + 4, 10), wallM, [x, (H + 4) / 2, z]); add(g, new THREE.ConeGeometry(1.6, 3, 10), roofM, [x, H + 5.5, z]); });
  // 歪歪的发光窗户（晚上更亮）
  const winM = M(0x2b2140, { emissive: 0xffd43b, emissiveIntensity: .4 });
  [[-6, 5], [6, 5.2], [-2.5, 5.6], [2.5, 5]].forEach(([x, y], i) => add(g, new THREE.BoxGeometry(1.4, 1.6, .1), winM, [x, y, HD + .22], [0, 0, (i % 2 ? .1 : -.12)]));
  // 门口的招牌 + 南瓜
  const sign = canvasTex(512, 128, (c, w, h) => { c.fillStyle = '#2b2140'; c.beginPath(); c.roundRect(6, 6, w - 12, h - 12, 30); c.fill(); c.strokeStyle = '#b197fc'; c.lineWidth = 8; c.stroke();
    c.fillStyle = '#e5dbff'; c.font = 'bold 70px "PingFang SC","Microsoft YaHei",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('👻 鬼屋', w / 2, h / 2 + 4); });
  add(g, new THREE.PlaneGeometry(7, 1.75), new THREE.MeshBasicMaterial({ map: sign }), [0, 4.6, HD + .25]);
  [[-7.5, HD + 1.2], [-3.5, HD + 1.2], [3.5, HD + 1.2], [7.5, HD + 1.2]].forEach(([x, z]) => { const p = pumpkin(.9); p.position.set(x, .35, z); g.add(p); });
  // 门口的小幽灵招手
  const doorGhost = ghost(.9); doorGhost.position.set(0, 1.4, HD + 1.6); g.add(doorGhost);

  // ---------- 屋里 ----------
  const inside = new THREE.Group(); g.add(inside);
  // 房间灯（只有坐车的时候开）
  const lights = [[0x69db7c, -4.5, 3.5], [0x9775fa, -4.5, -3.5], [0x4dabf7, 4.5, -3.5], [0xff922b, 4.5, 3.5]].map(([c, x, z]) => { const l = new THREE.PointLight(c, 0, 12, 1.5); l.position.set(x, 4.5, z); inside.add(l); return l; });
  // 1. 画像：眼睛跟着人转
  const eyes = [];
  [[-HW + .35, 4.8], [-HW + .35, 2.2]].forEach(([x, z], i) => {
    const fr = new THREE.Group(); fr.position.set(x, 3.6, z); fr.rotation.y = Math.PI / 2; inside.add(fr);
    add(fr, new THREE.BoxGeometry(2, 2.5, .12), M(0xc9a227, { metalness: .5 }));
    const pic = canvasTex(128, 160, (c, w, h) => { c.fillStyle = i ? '#3b5bdb' : '#862e9c'; c.fillRect(0, 0, w, h); c.fillStyle = '#ffd8a8'; c.beginPath(); c.ellipse(64, 76, 40, 50, 0, 0, 7); c.fill();
      c.fillStyle = i ? '#5c3c1c' : '#212529'; c.beginPath(); c.ellipse(64, 40, 44, 26, 0, Math.PI, 0); c.fill(); c.fillStyle = '#c92a2a'; c.beginPath(); c.arc(64, 108, 10, 0, Math.PI); c.fill(); });
    add(fr, new THREE.PlaneGeometry(1.7, 2.2), new THREE.MeshStandardMaterial({ map: pic }), [0, 0, .07]);
    [-.3, .3].forEach(dx => { const e = add(fr, new THREE.SphereGeometry(.17, 12, 10), M(0xffffff, { emissive: 0xffffff, emissiveIntensity: .3 }), [dx, .25, .1]); const pu = add(e, new THREE.SphereGeometry(.08, 8, 6), M(0x111111), [0, 0, .12]); eyes.push(pu); });
  });
  // 蜡烛
  for (let k = 0; k < 4; k++) { const c = add(inside, new THREE.CylinderGeometry(.08, .08, .5, 8), M(0xfff3bf), [-7.6 + k * .5, 1.2, 1.2]); add(c, new THREE.SphereGeometry(.07, 6, 6), new THREE.MeshBasicMaterial({ color: 0xffd43b }), [0, .32, 0]); }
  // 2. 蝙蝠洞
  const bats = Array.from({ length: 12 }, (_, i) => { const b = bat(); b.userData.a = i / 12 * 6.283; b.userData.r = 1.2 + (i % 3) * .5; b.userData.h = 3 + (i % 4) * .5; inside.add(b); return b; });
  // 蜘蛛网
  const webM = new THREE.LineBasicMaterial({ color: 0xdee2e6, transparent: true, opacity: .6 });
  [[-HW + .3, H - .3, -HD + .3], [HW - .3, H - .3, -HD + .3]].forEach(([x, y, z]) => { const pts = []; for (let k = 0; k < 6; k++) { const a = -Math.PI / 2 * k / 5; pts.push(new THREE.Vector3(x, y, z), new THREE.Vector3(x - Math.sign(x) * Math.cos(a) * 2.2, y + Math.sin(a) * 2.2, z)); }
    for (let r = .5; r < 2.3; r += .5) for (let k = 0; k < 5; k++) { const a0 = -Math.PI / 2 * k / 5, a1 = -Math.PI / 2 * (k + 1) / 5; pts.push(new THREE.Vector3(x - Math.sign(x) * Math.cos(a0) * r, y + Math.sin(a0) * r, z), new THREE.Vector3(x - Math.sign(x) * Math.cos(a1) * r, y + Math.sin(a1) * r, z)); }
    inside.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), webM)); });
  // 3. 箱子后面的小幽灵
  const crates = [[2.5, -4.5], [6.5, -5], [4.2, -2.2], [7.5, -2.5]];
  const ghosts = crates.map(([x, z], i) => { add(inside, new THREE.BoxGeometry(1.3, 1.1, 1.3), M(0x8b5a2b), [x, .55, z], [0, i * .4, 0]);
    const gh = ghost(.8); gh.position.set(x, .3, z); gh.scale.setScalar(.01); gh.userData = { x, z, base: .8, t: -1, d: i * .35 }; inside.add(gh); return gh; });
  // 4. 南瓜灯房间 + 大幽灵
  [[2.5, 5.2], [3.5, 4.5], [7.5, 5.5], [6.8, 2], [8, 3.6], [1.8, 2.5]].forEach(([x, z], i) => { const p = pumpkin(.8 + (i % 3) * .2); p.position.set(x, .35, z); p.rotation.y = -Math.PI / 2 + (i - 2) * .3; inside.add(p); });
  const bigGhost = ghost(2.2); bigGhost.position.set(7.4, -3, 4); bigGhost.rotation.y = -Math.PI / 2; inside.add(bigGhost);
  const booTex = canvasTex(256, 128, (c, w, h) => { c.fillStyle = '#fff'; c.beginPath(); c.roundRect(4, 4, w - 8, h - 30, 30); c.fill(); c.beginPath(); c.moveTo(70, h - 28); c.lineTo(60, h - 2); c.lineTo(100, h - 28); c.fill();
    c.fillStyle = '#7048e8'; c.font = 'bold 72px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('Boo!', w / 2, 52); });
  const boo = new THREE.Sprite(new THREE.SpriteMaterial({ map: booTex, transparent: true, depthTest: false })); boo.scale.set(3, 1.5, 1); boo.position.set(6.6, 5.6, 4); boo.visible = false; inside.add(boo);

  // ---------- 路线（屋子局部坐标）：从左门进 → 左前 → 左后 → 右后 → 右前 → 右门出 ----------
  const P = [[-5.5, 9], [-5.5, 6], [-5.5, 3.2], [-5, .2], [-4.6, -2.6], [-2.6, -4.6], [0, -5.5], [2.6, -4.6], [4.6, -3], [4.8, 0], [4.6, 3], [5.5, 5.5], [5.5, 9]];
  const curve = new THREE.CatmullRomCurve3(P.map(([x, z]) => new THREE.Vector3(x, .25, z)), false, 'centripetal');
  const L = curve.getLength();
  add(g, new THREE.TubeGeometry(curve, 120, .08, 6, false), M(0x495057, { metalness: .6 }), [0, -.15, 0]);
  // 停下来看的点（u = 路线上的位置）+ 朝哪看
  const STOPS = [{ u: .2, look: [-HW, 3.2, 3.6], dur: 4, fx: 'eyes' }, { u: .4, look: [-3, 3.5, -4], dur: 4, fx: 'bats' }, { u: .63, look: [5, 1, -3.5], dur: 4.5, fx: 'ghosts' }, { u: .84, look: [7.4, 2.5, 4], dur: 4.5, fx: 'boo' }];
  const SPEED = 2.4;
  // 小车
  const cart = new THREE.Group(); g.add(cart);
  add(cart, new THREE.BoxGeometry(1.5, .6, 1.9), M(0x7048e8, { roughness: .4 }), [0, .45, 0]);
  add(cart, new THREE.BoxGeometry(1.5, .9, .2), M(0x5f3dc4), [0, .95, -.85]);
  [-1, 1].forEach(s => add(cart, new THREE.ConeGeometry(.2, .5, 3), M(0x2b2140), [s * .8, 1.2, -.8], [0, 0, s * .6]));
  add(cart, new THREE.TorusGeometry(.5, .05, 6, 16, Math.PI), M(0xdee2e6, { metalness: .6 }), [0, 1.1, .45]);
  const seat = new THREE.Object3D(); seat.position.set(0, .55, -.2); cart.add(seat);
  cart.position.copy(curve.getPointAt(0));
  // 别人坐鬼屋时看不到（在屋里）——给多人同步用的座位放在地下
  const hiddenSeat = new THREE.Object3D(); hiddenSeat.position.set(0, -40, 0); g.add(hiddenSeat);

  let ride = null;                          // { t, u, stop, stopT, done }
  const tmp = new THREE.Vector3(), lookV = new THREE.Vector3(), wp = new THREE.Vector3();
  function fx(name, on) {
    if (name === 'ghosts' && on) ghosts.forEach(gh => gh.userData.t = 0);
    if (name === 'boo' && on) { bigGhost.userData.t = 0; }
    if (on) { if (name === 'boo') SFX.boo && SFX.boo(); else if (name === 'bats') SFX.squeak && SFX.squeak(); else SFX.woo && SFX.woo(); }
  }
  function lightsOn(on) { lights.forEach(l => l.intensity = on ? 22 : 0); }
  return {
    name: '鬼屋', icon: '👻', group: g, seats: [hiddenSeat],
    entry: (() => { const v = new THREE.Vector3(-5.5, 0, HD + 3).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY); return [cx + v.x, cz + v.z]; })(), entryR: 4,
    colliders: (() => { const out = []; for (let x = -HW; x <= HW; x += 2.2) for (let z = -HD; z <= HD; z += 2.2) { const v = new THREE.Vector3(x, 0, z).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY); out.push([cx + v.x, cz + v.z, 1.7]); } return out; })(),
    status() { return ride ? '鬼屋里有人，稍等一下…' : '按 E 进鬼屋（有点点吓人哦）'; },
    canBoard() { return !ride; },
    update(dt, t) {
      doorGhost.position.y = 1.4 + Math.sin(t * 2) * .2; doorGhost.rotation.y = Math.sin(t * .8) * .4;
      if (!ride) return;
      // 车往前走；到停靠点停一会儿，转向要看的东西
      const R = ride; R.t += dt;
      const st = STOPS[R.stop];
      if (R.stopT > 0) { R.stopT -= dt; if (R.stopT <= 0) { fx(st.fx, false); R.stop++; } }
      else { R.u = Math.min(1, R.u + SPEED * dt / L); if (st && R.u >= st.u) { R.u = st.u; R.stopT = st.dur; fx(st.fx, true); } }
      curve.getPointAt(R.u, tmp); cart.position.copy(tmp);
      curve.getPointAt(Math.min(1, R.u + .01), lookV);
      if (R.stopT > 0 && st) lookV.set(...st.look).setY(tmp.y);                        // 停下来时车头转向那个东西
      const want = Math.atan2(lookV.x - tmp.x, lookV.z - tmp.z);
      let d = want - cart.rotation.y; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      cart.rotation.y += d * Math.min(1, dt * 3);
      if (R.u >= 1) { R.done = true; }
      // 画像的眼睛看着小车
      cart.getWorldPosition(wp);
      eyes.forEach(e => { const par = e.parent; par.worldToLocal(tmp.copy(wp).setY(wp.y + 1.5)); tmp.normalize().multiplyScalar(.12); e.position.set(tmp.x, tmp.y, Math.max(.05, tmp.z)); });
      // 蝙蝠绕圈飞，翅膀扇
      bats.forEach((b, i) => { const u = b.userData, a = u.a + t * (1.2 + (i % 3) * .3), near = R.stop === 1 && R.stopT > 0;
        b.position.set(-3 + Math.cos(a) * u.r * (near ? 1.6 : 1), u.h + Math.sin(t * 3 + i) * .3, -4 + Math.sin(a) * u.r * (near ? 1.4 : 1));
        b.rotation.y = -a; b.userData.wings.forEach((w, k) => w.rotation.z = (k ? -1 : 1) * Math.sin(t * 22 + i) * .7); });
      // 小幽灵从箱子后面冒出来，晃一晃
      ghosts.forEach(gh => { const u = gh.userData; if (u.t < 0) return; u.t += dt; const k = Math.min(1, Math.max(0, (u.t - u.d) / .35));
        gh.scale.setScalar(.01 + u.base * (k < 1 ? k * 1.15 : 1)); gh.position.y = .3 + k * 1.3 + Math.sin(u.t * 3 + u.d * 5) * .15; gh.lookAt(wp.x, gh.position.y, wp.z); });
      // 大幽灵升起来喊 Boo!
      if (bigGhost.userData.t >= 0) { const u = bigGhost.userData; u.t += dt; bigGhost.position.y = -3 + Math.min(1, u.t / .7) * 3.6 + Math.sin(u.t * 2) * .2; boo.visible = u.t > .6 && u.t < 4; boo.scale.set(3 * (1 + Math.sin(u.t * 8) * .04), 1.5, 1); }
    },
    board() {
      ride = { t: 0, u: 0, stop: 0, stopT: 0, done: false };
      ghosts.forEach(gh => { gh.userData.t = -1; gh.scale.setScalar(.01); }); bigGhost.userData.t = -1; bigGhost.position.y = -3; boo.visible = false;
      cart.rotation.y = Math.PI; lightsOn(true);
      const exit = (() => { const v = new THREE.Vector3(5.5, 0, HD + 3).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY); return [cx + v.x, cz + v.z]; })();
      return { seat, seatIndex: 0, view: 'pov', dark: true, exitPos: exit,
        done: () => { if (ride && ride.done) { ride = null; lightsOn(false); return true; } return false; },
        cancel: () => { ride = null; lightsOn(false); } };
    },
  };
}
