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
function balloonStall(x, z) {
  const g = booth('🎈 射气球', '#ff6b6b'); g.position.set(x, 0, z);      // 正面朝北（-z），玩家从北边走过来
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
function potStall(x, z) {
  const g = booth('🏺 投壶', '#1c7ed6'); g.position.set(x, 0, z);
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

export function buildStalls(scene, cx, cz) {
  const root = new THREE.Group(); scene.add(root);
  const bal = balloonStall(cx - 12, cz), pot = potStall(cx + 12, cz);
  root.add(bal.group, pot.group);
  // 中间放一个卖冰淇淋的小车 + 一些彩旗
  const cart = new THREE.Group(); cart.position.set(cx, 0, cz + 1); root.add(cart);
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.1, 1.3), M(0xfff0f6)); body.position.y = 1; cart.add(body);
  [-.9, .9].forEach(x2 => { const w = new THREE.Mesh(new THREE.CylinderGeometry(.35, .35, .15, 16), M(0x495057)); w.rotation.x = Math.PI / 2; w.position.set(x2, .35, .7); cart.add(w); });
  const umb = new THREE.Mesh(new THREE.ConeGeometry(1.8, .9, 12), M(0xf783ac)); umb.position.y = 3.2; cart.add(umb);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.4, 6), M(0xdee2e6)); pole.position.y = 2.2; cart.add(pole);
  [[-.6, 0xffc9de], [0, 0xfff3bf], [.6, 0x8b5a2b]].forEach(([x2, c]) => { const cone = new THREE.Mesh(new THREE.ConeGeometry(.12, .35, 10), M(0xd9a441)); cone.rotation.x = Math.PI; cone.position.set(x2, 1.75, 0); cart.add(cone);
    const sc = new THREE.Mesh(new THREE.SphereGeometry(.15, 10, 8), M(c)); sc.position.set(x2, 1.98, 0); cart.add(sc); });
  const toW = (stall, v) => stall.group.localToWorld(v.clone());
  bal.group.updateMatrixWorld(true); pot.group.updateMatrixWorld(true);
  const bStand = toW(bal, bal.standLocal), pStand = toW(pot, pot.standLocal);
  return {
    root,
    colliders: [{ box: [cx - 12, cz + 1.05, 3.6, 2.8, 0] }, { box: [cx + 12, cz + 1.05, 3.6, 2.8, 0] }, [cx, cz + 1, 1.5]],
    interact: [{ type: 'stall', game: 'balloon', name: '射气球', icon: '🎈', pos: [bStand.x, bStand.z], r: 2.6 }, { type: 'stall', game: 'pot', name: '投壶', icon: '🏺', pos: [pStand.x, pStand.z], r: 2.6 }],
    bal, pot,
  };
}

// ---------------- 玩游戏（镜头固定，鼠标瞄准） ----------------
export function createStallGame({ scene, camera, stalls, sfx, onEnd, hud }) {
  let G = null;                         // 当前在玩的游戏
  const ray = new THREE.Raycaster(), v = new THREE.Vector3(), aim = { x: 0, y: 0 };
  const best = k => +(localStorage.getItem('stallBest_' + k) || 0);
  function camSetup(stall, eyeY, lookLocal) {
    const eye = stall.group.localToWorld(new THREE.Vector3(0, eyeY, -3.4)), look = stall.group.localToWorld(lookLocal.clone());
    camera.position.copy(eye); camera.up.set(0, 1, 0); camera.lookAt(look);
  }
  const parts = [];
  function pop(pos, color) {
    const n = 26, geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { p.set([pos.x, pos.y, pos.z], i * 3); const a = Math.random() * 6.283, b = Math.acos(Math.random() * 2 - 1), s = 2 + Math.random() * 3; vel.push(Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s); }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: .09, transparent: true })); scene.add(pts);
    parts.push({ pts, vel, life: .7 });
  }
  function tickParts(dt) {
    for (let k = parts.length - 1; k >= 0; k--) { const q = parts[k]; q.life -= dt; const a = q.pts.geometry.attributes.position.array;
      for (let i = 0; i < q.vel.length / 3; i++) { q.vel[i * 3 + 1] -= 9 * dt; a[i * 3] += q.vel[i * 3] * dt; a[i * 3 + 1] += q.vel[i * 3 + 1] * dt; a[i * 3 + 2] += q.vel[i * 3 + 2] * dt; }
      q.pts.geometry.attributes.position.needsUpdate = true; q.pts.material.opacity = Math.max(0, q.life / .7);
      if (q.life <= 0) { scene.remove(q.pts); parts.splice(k, 1); } }
  }
  // 飞镖 / 箭
  function makeDart(color = 0xff6b6b) { const d = new THREE.Group(); const sh = new THREE.Mesh(new THREE.CylinderGeometry(.015, .015, .45, 6), M(0xdee2e6)); sh.rotation.x = Math.PI / 2; d.add(sh);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.03, .1, 6), M(0x495057, { metalness: .8 })); tip.rotation.x = Math.PI / 2; tip.position.z = .27; d.add(tip);
    const fl = new THREE.Mesh(new THREE.ConeGeometry(.07, .14, 4), M(color)); fl.rotation.x = -Math.PI / 2; fl.position.z = -.22; d.add(fl); return d; }
  function makeArrow() { const d = new THREE.Group(); const sh = new THREE.Mesh(new THREE.CylinderGeometry(.02, .02, .9, 6), M(0x8b5a2b)); sh.rotation.x = Math.PI / 2; d.add(sh);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(.04, .12, 6), M(0x868e96, { metalness: .8 })); tip.rotation.x = Math.PI / 2; tip.position.z = .5; d.add(tip);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(.01, .12, .18), M(0xff6b6b)); fl.position.z = -.4; d.add(fl); const fl2 = fl.clone(); fl2.rotation.z = Math.PI / 2; d.add(fl2); return d; }
  const flying = [];

  function startBalloon() {
    const st = stalls.bal; st.balloons.forEach(b => { b.userData.alive = true; b.visible = true; b.scale.set(1, 1.18, 1); });
    G = { kind: 'balloon', st, left: 10, score: 0, t: 0, over: 0, name: '射气球' };
  }
  function startPot() { G = { kind: 'pot', st: stalls.pot, left: 5, score: 0, t: 0, over: 0, charge: 0, charging: false, yaw: 0, name: '投壶' }; }
  function updHud() {
    if (!G) return;
    const b = best(G.kind), unit = G.kind === 'balloon' ? '支飞镖' : '支箭';
    hud(G.over ? `🎉 结束啦！得分 ${G.score}${G.score >= b && G.score > 0 ? ' · ⭐ 新纪录！' : ` · 最高 ${b}`}　点一下 / 按空格再玩一局 · 按 E 离开`
      : `${G.kind === 'balloon' ? '🎈' : '🏺'} 剩 ${G.left} ${unit} · 得分 ${G.score} · 最高 ${b}　${G.kind === 'balloon' ? '点气球扔飞镖' : '左右瞄准 · 按住蓄力 · 松开扔'}`, G.kind === 'pot' && G.charging ? G.charge : null);
  }
  function finish() { G.over = 1; if (G.score > best(G.kind)) localStorage.setItem('stallBest_' + G.kind, G.score); sfx.chime && sfx.chime(G.score > 0 ? [784, 988, 1318] : [440, 392]); updHud(); }
  function throwDart(nx, ny) {
    if (!G || G.over || G.left <= 0) return;
    G.left--; sfx.whoosh && sfx.whoosh(.3, true);
    ray.setFromCamera({ x: nx, y: ny }, camera);
    const alive = G.st.balloons.filter(b => b.userData.alive), hits = ray.intersectObjects(alive, false);
    const target = hits.length ? hits[0].point.clone() : ray.ray.at(4, new THREE.Vector3());
    const d = makeDart(BAL_C[G.left % BAL_C.length]); const from = camera.position.clone().add(new THREE.Vector3(.25, -.35, 0).applyQuaternion(camera.quaternion));
    d.position.copy(from); d.lookAt(target); scene.add(d);
    flying.push({ obj: d, from, to: target, t: 0, dur: .22, hit: hits.length ? hits[0].object : null, kind: 'dart' });
    updHud();
  }
  function throwArrow() {
    if (!G || G.over || G.left <= 0) return;
    G.left--; sfx.whoosh && sfx.whoosh(.4, true);
    const st = G.st, p0 = st.group.localToWorld(new THREE.Vector3(.2, 1.5, -2.6));
    const power = .2 + G.charge * .8, speed = 4.6 + power * 5.2, up = .72;
    const dirL = new THREE.Vector3(Math.sin(G.yaw) * Math.cos(up), Math.sin(up), Math.cos(G.yaw) * Math.cos(up));       // 局部：+z 往摊里
    const dirW = dirL.applyQuaternion(st.group.quaternion).multiplyScalar(speed);
    const a = makeArrow(); a.position.copy(p0); scene.add(a);
    flying.push({ obj: a, pos: p0.clone(), vel: dirW, kind: 'arrow', t: 0 });
    G.charge = 0; G.charging = false; updHud();
  }
  function stepFlying(dt) {
    for (let k = flying.length - 1; k >= 0; k--) {
      const f = flying[k]; f.t += dt;
      if (f.kind === 'dart') {
        const u = Math.min(1, f.t / f.dur); f.obj.position.lerpVectors(f.from, f.to, u); f.obj.position.y -= Math.sin(u * Math.PI) * .05;
        if (u >= 1) {
          if (f.hit && f.hit.userData.alive && G) { f.hit.userData.alive = false; f.hit.visible = false; pop(f.hit.getWorldPosition(v), f.hit.material.color); sfx.boom && sfx.boom(.35); G.score++; updHud(); }
          if (f.t > f.dur + .6) { scene.remove(f.obj); flying.splice(k, 1); if (G && G.kind === 'balloon' && !G.over && G.left <= 0 && !flying.length) finish(); }
        }
      } else {
        if (f.done) { if (f.t > 1.2) { scene.remove(f.obj); flying.splice(k, 1); if (G && G.kind === 'pot' && !G.over && G.left <= 0 && !flying.length) finish(); } continue; }
        const prevY = f.pos.y; f.vel.y -= 9.8 * dt; f.pos.addScaledVector(f.vel, dt); f.obj.position.copy(f.pos); f.obj.lookAt(v.copy(f.pos).add(f.vel));
        // 落到壶口的高度：看看进没进
        if (G && G.kind === 'pot') for (const pot of G.st.pots) { const c = pot.g.getWorldPosition(v), top = c.y + 1.0;
          if (prevY > top && f.pos.y <= top && f.vel.y < 0) { const d = Math.hypot(f.pos.x - c.x, f.pos.z - c.z);
            if (d < pot.r) { f.done = true; f.t = 0; f.pos.y = top - .2; f.obj.position.copy(f.pos); G.score += pot.pts; sfx.chime && sfx.chime(pot.pts >= 3 ? [1046, 1318, 1568] : [880, 1175]); pop(v.set(c.x, top + .1, c.z), 0xffd43b); updHud(); }
            else if (d < pot.r + .12) { f.vel.x *= -.3; f.vel.z *= -.3; sfx.click && sfx.click(); } } }
        if (!f.done && f.pos.y < .15) { f.done = true; f.t = 0; f.pos.y = .15; f.obj.position.copy(f.pos); }
      }
    }
  }
  return {
    get playing() { return !!G; },
    start(kind) { if (G && G.guide) G.st.group.remove(G.guide); if (kind === 'balloon') startBalloon(); else startPot(); aim.x = aim.y = 0; updHud(); },
    stop() { if (G && G.guide) G.st.group.remove(G.guide); G = null; flying.splice(0).forEach(f => scene.remove(f.obj)); hud(null); },
    pointer(type, nx, ny) {
      if (!G) return;
      aim.x = nx; aim.y = ny;
      if (G.over) { if (type === 'down') this.start(G.kind); return; }
      if (G.kind === 'balloon') { if (type === 'down') throwDart(nx, ny); }
      else { G.yaw = THREE.MathUtils.clamp(-nx * .75, -.7, .7); if (type === 'down') { G.charging = true; G.charge = 0; G.dir = 1; } if (type === 'up' && G.charging) throwArrow(); }
    },
    key(code, down) {
      if (!G) return;
      if (G.over) { if (code === 'Space' && down) this.start(G.kind); return; }
      if (G.kind === 'balloon') { if (code === 'Space' && down) throwDart(aim.x, aim.y); }
      else if (code === 'Space') { if (down && !G.charging) { G.charging = true; G.charge = 0; G.dir = 1; } else if (!down && G.charging) throwArrow(); }
    },
    update(dt, keys) {
      tickParts(dt); stepFlying(dt);
      if (!G) return;
      G.t += dt;
      if (G.kind === 'balloon') {
        camSetup(G.st, 1.75, new THREE.Vector3(0, 2.4, 3.3));
        // 第二排、第四排的气球左右晃
        G.st.balloons.forEach(b => { const u = b.userData; const sway = u.r % 2 ? Math.sin(G.t * (1.2 + u.r * .3)) * .5 : 0; b.position.x = u.bx + sway; b.position.y = u.by + Math.sin(G.t * 2 + u.c) * .04; });
        if (keys && (keys.ArrowLeft || keys.KeyA)) aim.x = Math.max(-1, aim.x - dt * 1.2); if (keys && (keys.ArrowRight || keys.KeyD)) aim.x = Math.min(1, aim.x + dt * 1.2);
        if (keys && (keys.ArrowUp || keys.KeyW)) aim.y = Math.min(1, aim.y + dt * 1.2); if (keys && (keys.ArrowDown || keys.KeyS)) aim.y = Math.max(-1, aim.y - dt * 1.2);
      } else {
        camSetup(G.st, 3.0, new THREE.Vector3(0, .3, 2.4));
        if (keys && (keys.ArrowLeft || keys.KeyA)) G.yaw = Math.min(.7, G.yaw + dt * .8); if (keys && (keys.ArrowRight || keys.KeyD)) G.yaw = Math.max(-.7, G.yaw - dt * .8);
        if (G.charging) { G.charge += G.dir * dt * 1.1; if (G.charge >= 1) { G.charge = 1; G.dir = -1; } if (G.charge <= 0) { G.charge = 0; G.dir = 1; } updHud(); }
        // 瞄准线：地上画一排小点
        if (!G.guide) { G.guide = new THREE.Group(); for (let i = 0; i < 8; i++) { const d = new THREE.Mesh(new THREE.CircleGeometry(.06, 10), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .7 })); d.rotation.x = -Math.PI / 2; G.guide.add(d); } G.st.group.add(G.guide); }
        G.guide.children.forEach((d, i) => { const r = .6 + i * .55; d.position.set(.2 + Math.sin(G.yaw) * r, .13, -2.6 + Math.cos(G.yaw) * r); });
      }
      return { aim };
    },
    get aim() { return aim; }, get kind() { return G && G.kind; },
  };
}
