// ===== 宇宙多人：看见别人的飞船 + 星门 + 子弹 / 导弹 / 防御盾 / 冰冻 =====
import * as THREE from 'three';
import { joinRoom, throttle, nameTag, r1, r2 } from '../net.js';
import { buildShip } from './ships.js';
import { createGate } from './planets.js';
import { glowTex } from './tex.js';

// 每艘飞船有什么武器（防御盾人人都有）
export const WEAPONS = { rookie: [], thunder: ['bullet'], starry: ['bullet', 'missile'] };
const MODE = { fly: 0, landing: 1, landed: 2, takeoff: 3 };
const FIRE_CD = .5, FREEZE = 3, INVINCIBLE = 3, SHIELD = 3, SHIELD_CD = 60;
const BULLET_V = 95, BULLET_LIFE = 1.6, MISSILE_V = 28, MISSILE_TURN = 1.1, MISSILE_LIFE = 5;
const SHIP_R = 2.6;

export function createUniverseMP(ctx) {
  const { scene, camera, ship, state, getShipKey, getMe, sfx, toast, onFreeze } = ctx;
  const tagsEl = document.getElementById('mpTags');
  const remotes = new Map();
  const shots = [];
  let net = null, shotN = 0;
  const send = throttle();

  // 我的战斗状态
  const me = { weapon: 'bullet', fireCd: 0, shieldUntil: 0, shieldReady: 0, frozenUntil: 0, invUntil: 0, knock: new THREE.Vector3(), aiming: false, aimTarget: null, t: 0 };

  // ---------- 模型小零件 ----------
  const glowMat = color => new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false });
  function shieldBubble() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.SphereGeometry(3.6, 32, 20), new THREE.MeshBasicMaterial({ color: 0x66e0ff, transparent: true, opacity: .18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
    const w = new THREE.Mesh(new THREE.IcosahedronGeometry(3.65, 2), new THREE.MeshBasicMaterial({ color: 0x9df3ff, wireframe: true, transparent: true, opacity: .35, blending: THREE.AdditiveBlending, depthWrite: false }));
    g.add(m, w); g.visible = false; g.userData.w = w; return g;
  }
  function iceBlock() {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(7.5, 3.2, 7.5), new THREE.MeshPhysicalMaterial({ color: 0xbfefff, transparent: true, opacity: .45, roughness: .05, metalness: 0, depthWrite: false }));
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(m.geometry), new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .8 }));
    g.add(m, e); g.rotation.y = .3; g.visible = false; return g;
  }
  const myShield = shieldBubble(), myIce = iceBlock();
  ship.add(myShield, myIce);

  // ---------- 别人的飞船 ----------
  function addRemote(p) {
    if (remotes.has(p.id)) return remotes.get(p.id);
    const holder = new THREE.Group(); holder.rotation.order = 'YXZ'; holder.visible = false; scene.add(holder);
    const r = { id: p.id, name: p.name || '玩家', key: null, holder, obj: null, tag: nameTag(tagsEl, p.name || '玩家'),
      tgt: new THREE.Vector3(), h: 0, b: 0, s: 0, mode: -1, flags: 0, got: false, color: '#ffb84d',
      gate: null, gateT: 0, gateKind: null, shield: shieldBubble(), ice: iceBlock(), outline: null, leaving: false };
    holder.add(r.shield, r.ice);
    setRemoteShip(r, p.ship || 'rookie');
    remotes.set(p.id, r); return r;
  }
  function setRemoteShip(r, key) {
    if (r.key === key) return;
    if (r.obj) r.holder.remove(r.obj.group);
    r.key = key; r.obj = buildShip(key); r.holder.add(r.obj.group);
    if (r.outline) { r.outline = null; }
  }
  function removeRemote(r) {
    scene.remove(r.holder); r.tag.remove();
    if (r.gate) scene.remove(r.gate);
    remotes.delete(r.id);
    if (me.aimTarget === r) me.aimTarget = null;
  }
  function openGate(r, kind) {
    if (!r.gate) { r.gate = createGate(); scene.add(r.gate); }
    r.gate.userData.tint(r.color); r.gate.visible = true; r.gateT = 0; r.gateKind = kind;
    const fwd = new THREE.Vector3(Math.sin(r.h), 0, Math.cos(r.h));
    if (kind === 'in') { r.gate.position.copy(r.holder.position).addScaledVector(fwd, 13); r.gate.lookAt(r.holder.position); }
    else { r.gate.position.copy(r.tgt).addScaledVector(fwd, -1.5); r.gate.lookAt(r.gate.position.clone().add(fwd)); }
    r.gate.scale.setScalar(kind === 'in' ? .01 : 1);
  }

  // ---------- 子弹 / 导弹 ----------
  function makeShotMesh(kind, color) {
    const g = new THREE.Group();
    if (kind === 'bullet') {
      g.add(new THREE.Mesh(new THREE.CapsuleGeometry(.18, 1.4, 4, 8).rotateX(Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xffffff })));
      const s = new THREE.Sprite(glowMat(color)); s.scale.setScalar(2.6); g.add(s);
    } else {
      g.add(new THREE.Mesh(new THREE.CylinderGeometry(.22, .22, 1.6, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe9ecef, metalness: .5, roughness: .3 })));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(.22, .6, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xff3b3b, emissive: 0xff3b3b, emissiveIntensity: .6 })); tip.position.z = 1.1; g.add(tip);
      [0, 1, 2, 3].forEach(i => { const f = new THREE.Mesh(new THREE.BoxGeometry(.05, .5, .4), new THREE.MeshStandardMaterial({ color: 0x3ee8ff })); f.rotation.z = i * Math.PI / 2; f.position.z = -.6; f.translateY(.28); g.add(f); });
      const fl = new THREE.Sprite(glowMat(0xffa94d)); fl.scale.setScalar(2.2); fl.position.z = -1.1; g.add(fl);
    }
    scene.add(g); return g;
  }
  function spawnShot({ i, k, p, v, tg, o, c }) {
    const s = { id: i, owner: o, kind: k, pos: new THREE.Vector3(...p), vel: new THREE.Vector3(...v), target: tg || null, life: k === 'bullet' ? BULLET_LIFE : MISSILE_LIFE, mesh: makeShotMesh(k, c), puff: 0 };
    s.mesh.position.copy(s.pos); s.mesh.lookAt(s.pos.clone().add(s.vel));
    shots.push(s); return s;
  }
  function killShot(s, boom) {
    const i = shots.indexOf(s); if (i < 0) return;
    shots.splice(i, 1); scene.remove(s.mesh);
    if (boom) sparks(s.pos, boom);
  }
  const sparkList = [];
  function sparks(pos, color, n = 24) {
    const geo = new THREE.BufferGeometry(), a = new Float32Array(n * 3), v = [];
    for (let i = 0; i < n; i++) { a.set([pos.x, pos.y, pos.z], i * 3); const d = new THREE.Vector3().randomDirection().multiplyScalar(6 + Math.random() * 8); v.push(d); }
    geo.setAttribute('position', new THREE.BufferAttribute(a, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: 1.1, color, map: glowTex(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
    pts.frustumCulled = false; scene.add(pts); sparkList.push({ pts, v, life: .7 });
  }
  const posOf = id => id === (net && net.me && net.me.id) ? ship.position : (remotes.get(id) && remotes.get(id).holder.visible ? remotes.get(id).holder.position : null);

  // ---------- 我的操作 ----------
  const fwdOf = h => new THREE.Vector3(Math.sin(h), 0, Math.cos(h));
  function canAct() { return state.mode === 'fly' && me.t >= me.frozenUntil; }
  function weapons() { return WEAPONS[getShipKey()] || []; }
  function fire(target) {
    if (!net || !net.me) { toast('登录后才能开火哦'); return; }
    if (!canAct() || me.fireCd > 0) return;
    const ws = weapons(); if (!ws.length) return;
    const kind = ws.includes(me.weapon) ? me.weapon : ws[0];
    me.fireCd = FIRE_CD;
    const f = fwdOf(state.heading);
    const color = getShipKey() === 'thunder' ? 0xffe066 : 0x3ee8ff;
    const muzzles = getShipKey() === 'thunder' ? [-2.1, 2.1] : [0];
    const side = new THREE.Vector3(f.z, 0, -f.x);
    const shotsOut = kind === 'bullet' ? muzzles : [0];
    shotsOut.forEach(off => {
      const p = ship.position.clone().addScaledVector(f, 3).addScaledVector(side, off);
      const v = f.clone().multiplyScalar(kind === 'bullet' ? BULLET_V + Math.max(0, state.speed) : MISSILE_V);
      const data = { i: net.me.id + ':' + (++shotN), k: kind, p: [r2(p.x), r2(p.y), r2(p.z)], v: [r2(v.x), r2(v.y), r2(v.z)], tg: kind === 'missile' && target ? target.id : null, o: net.me.id, c: color };
      spawnShot(data); net.send('shot', data);
    });
    sfx.chime && sfx.chime(kind === 'bullet' ? [1400, 900] : [300, 500, 800]);
  }
  function shield() {
    if (!net || !net.me) { toast('登录后才能用防御盾'); return; }
    if (state.mode !== 'fly') return;
    if (me.t < me.shieldReady) { toast(`🛡️ 防御盾还要 ${Math.ceil(me.shieldReady - me.t)} 秒才能再用`); return; }
    me.shieldUntil = me.t + SHIELD; me.shieldReady = me.t + SHIELD_CD;
    net.send('fx', { k: 'shield' }); sfx.chime && sfx.chime([523, 784, 1046]);
  }
  function setWeapon(w) {
    const ws = weapons(); if (!ws.includes(w)) return;
    me.weapon = w; toast(w === 'bullet' ? '🔫 切换到子弹' : '🚀 切换到追踪导弹：按住 E 瞄准，松开发射');
    paintHud();
  }
  // E 按下 / 松开
  function triggerDown() {
    if (me.weapon === 'missile' && weapons().includes('missile')) { if (canAct()) me.aiming = true; }
    else { me.holdFire = true; fire(); }
  }
  function triggerUp() {
    me.holdFire = false;
    if (me.aiming) { me.aiming = false; fire(me.aimTarget); setOutline(null); }
  }

  // 瞄准：鼠标附近（或屏幕中间）最近的飞船，加白色轮廓
  let pointer = null;
  addEventListener('pointermove', e => { if (e.pointerType === 'mouse') pointer = [e.clientX, e.clientY]; });
  const scr = new THREE.Vector3();
  function pickTarget() {
    let best = null, bd = Infinity;
    const cx = pointer ? pointer[0] : innerWidth / 2, cy = pointer ? pointer[1] : innerHeight * .45;
    remotes.forEach(r => {
      if (!r.holder.visible || r.mode !== MODE.fly) return;
      if (r.holder.position.distanceTo(ship.position) > 170) return;
      scr.copy(r.holder.position).project(camera); if (scr.z > 1) return;
      const x = (scr.x + 1) / 2 * innerWidth, y = (1 - scr.y) / 2 * innerHeight, d = Math.hypot(x - cx, y - cy);
      if (d < bd && d < (pointer ? 260 : innerWidth * .45)) { bd = d; best = r; }
    });
    return best;
  }
  const outlineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide, transparent: true, opacity: .95 });
  function setOutline(r) {
    if (me.aimTarget === r) return;
    if (me.aimTarget && me.aimTarget.outline) { me.aimTarget.holder.remove(me.aimTarget.outline); me.aimTarget.outline = null; }
    me.aimTarget = r;
    if (!r) return;
    const o = new THREE.Group();
    r.obj.group.traverse(m => {
      if (!m.isMesh || !m.material || m.material.blending === THREE.AdditiveBlending || m.material.transparent) return;
      const c = new THREE.Mesh(m.geometry, outlineMat);
      m.updateWorldMatrix(true, false);
      const rel = new THREE.Matrix4().copy(r.obj.group.matrixWorld).invert().multiply(m.matrixWorld);
      rel.decompose(c.position, c.quaternion, c.scale); c.scale.multiplyScalar(1.12);
      o.add(c);
    });
    r.obj.group.add(o); r.outline = o;
  }

  // ---------- 被打中（以被打的人为准） ----------
  function vulnerable() { return state.mode === 'fly' && me.t >= me.frozenUntil && me.t >= me.invUntil; }
  function gotHit(s) {
    const blocked = me.t < me.shieldUntil;
    killShot(s, blocked ? 0x9df3ff : 0xbfefff);
    if (blocked) { net.send('hit', { s: s.id, b: 1 }); sfx.chime && sfx.chime([1600, 1200]); return; }
    me.frozenUntil = me.t + FREEZE; me.invUntil = me.frozenUntil + INVINCIBLE;
    if (s.kind === 'missile') me.knock.copy(s.vel).setY(0).normalize().multiplyScalar(40);
    state.target = null;
    net.send('hit', { s: s.id, k: s.kind, by: s.owner });
    const shooter = remotes.get(s.owner);
    toast(`❄️ 被${shooter ? ' ' + shooter.name + ' ' : ''}${s.kind === 'missile' ? '的导弹' : '的子弹'}打中，冰冻 3 秒！`);
    sfx.whoosh && sfx.whoosh(.6, false);
    onFreeze && onFreeze(FREEZE);
  }

  // ---------- 网络 ----------
  function connect() {
    const ME = getMe();
    if (net) net.close();
    remotes.forEach(removeRemote);
    net = joinRoom('universe', ME ? { id: ME.user.id, name: ME.profile.username || '小菜鸟', ship: getShipKey() } : null);
    const upd = p => { const r = remotes.get(p.id); if (!r) return addRemote(p); r.name = p.name || r.name; r.tag.textContent = r.name; if (p.ship) setRemoteShip(r, p.ship); };
    net.on('join', upd);
    net.on('update', upd);
    net.on('leave', p => { const r = remotes.get(p.id); if (!r) return; if (r.mode === MODE.landing) { r.leaving = true; setTimeout(() => removeRemote(r), 1500); } else removeRemote(r); });
    net.on('st', (d, p) => {
      const r = remotes.get(p.id) || (p.id && addRemote({ id: p.id, name: p.name }));
      if (!r) return;
      const [x, y, z, h, b, s, mode, flags] = d;
      const was = r.mode;
      r.tgt.set(x, y, z); r.h = h; r.b = b; r.s = s; r.flags = flags;
      if (!r.got) { r.holder.position.set(x, y, z); r.holder.rotation.y = h; r.got = true; }
      if (mode !== was) {
        r.mode = mode;
        if (mode === MODE.landing) openGate(r, 'in');
        if (mode === MODE.takeoff) { r.holder.position.set(x, y, z); r.holder.rotation.y = h; openGate(r, 'out'); }
      }
    });
    net.on('gate', (d, p) => { const r = remotes.get(p.id); if (r && d.c) r.color = d.c; });
    net.on('shot', d => { if (!shots.find(s => s.id === d.i)) spawnShot(d); });
    net.on('hit', (d, p) => {
      const s = shots.find(x => x.id === d.s); if (s) killShot(s, d.b ? 0x9df3ff : 0xbfefff);
      if (!d.b && d.by === (net.me && net.me.id)) { const r = remotes.get(p.id); toast(`🎯 打中了${r ? ' ' + r.name : ''}！对方冰冻 3 秒`); sfx.chime && sfx.chime([880, 1175, 1568]); }
    });
    net.on('fx', (d, p) => { const r = remotes.get(p.id); if (r && d.k === 'shield') r.shieldUntil = me.t + SHIELD; });
  }

  // 降落 / 起飞时告诉别人星门的颜色
  function gateEvent(color) { net && net.send('gate', { c: color }); }

  // ---------- HUD ----------
  const hud = document.getElementById('weaponHud');
  function paintHud() {
    if (!hud) return;
    const ws = weapons(), logged = !!(net && net.me);
    hud.classList.toggle('show', logged && state.mode === 'fly');
    hud.querySelectorAll('[data-w]').forEach(b => { b.style.display = ws.includes(b.dataset.w) && ws.length > 1 ? '' : 'none'; b.classList.toggle('on', me.weapon === b.dataset.w); });
    const fireBtn = hud.querySelector('#fireBtn'); if (fireBtn) fireBtn.style.display = ws.length ? '' : 'none';
  }
  let hudSig = '';
  function hudTick() {
    const sh = hud && hud.querySelector('#shieldBtn'); if (!sh) return;
    const left = Math.max(0, me.shieldReady - me.t), active = me.t < me.shieldUntil;
    const sig = (hud.classList.contains('show') ? 1 : 0) + ':' + Math.ceil(left) + ':' + active + ':' + getShipKey() + ':' + state.mode + ':' + me.weapon;
    if (sig === hudSig) return; hudSig = sig;
    sh.querySelector('small').textContent = active ? '开启中' : left > 0 ? Math.ceil(left) + 's' : (matchMedia('(pointer: coarse)').matches ? '防御盾' : 'Q');
    sh.classList.toggle('cd', left > 0 && !active);
    paintHud();
  }

  // ---------- 每帧 ----------
  const tmp = new THREE.Vector3();
  function update(dt, t) {
    me.t = t;
    if (me.fireCd > 0) me.fireCd -= dt;
    if (me.holdFire && me.weapon === 'bullet') fire();
    const frozen = t < me.frozenUntil;
    myIce.visible = frozen;
    myShield.visible = t < me.shieldUntil;
    if (myShield.visible) myShield.userData.w.rotation.y += dt;
    // 冰冻结束后无敌 3 秒：飞船闪烁
    ship.children.forEach(c => { if (c !== myShield && c !== myIce) c.visible = !(t > me.frozenUntil && t < me.invUntil && Math.sin(t * 30) > 0); });
    if (me.knock.lengthSq() > .01) { ship.position.addScaledVector(me.knock, dt); me.knock.multiplyScalar(Math.max(0, 1 - dt * 3)); }
    if (me.aiming) setOutline(canAct() ? pickTarget() : null); else if (me.aimTarget) setOutline(null);
    hudTick();

    // 发送自己的位置
    if (net && net.me) {
      const mode = MODE[state.mode] ?? 0, flags = (t < me.shieldUntil ? 1 : 0) | (frozen ? 2 : 0) | (t < me.invUntil && !frozen ? 4 : 0);
      const moving = Math.abs(state.speed) > .5 || state.mode !== 'fly' && state.mode !== 'landed';
      if (send(performance.now(), moving, mode + ':' + flags)) net.send('st', [r1(ship.position.x), r1(ship.position.y), r1(ship.position.z), r2(state.heading), r2(state.bank), r1(state.speed), mode, flags]);
    }

    // 别人的飞船：位置预测 + 平滑
    remotes.forEach(r => {
      if (!r.got) return;
      const show = r.mode !== MODE.landed && !(r.mode === MODE.landing && r.gateT > .8) && !r.leaving;
      r.holder.visible = show;
      r.tgt.addScaledVector(tmp.set(Math.sin(r.h), 0, Math.cos(r.h)), r.s * dt);
      r.holder.position.lerp(r.tgt, Math.min(1, dt * 6));
      let dh = r.h - r.holder.rotation.y; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      r.holder.rotation.y += dh * Math.min(1, dt * 8); r.holder.rotation.z += (r.b - r.holder.rotation.z) * Math.min(1, dt * 6);
      const power = Math.min(1.6, Math.abs(r.s) / 28);
      r.obj.flames.forEach(f => f.scale.setScalar((f.userData.base || 1) * (1 + power * 2.5) + Math.random() * .4));
      r.obj.update && r.obj.update(t);
      r.shield.visible = !!(r.flags & 1) || !!(r.shieldUntil && t < r.shieldUntil); if (r.shield.visible) r.shield.userData.w.rotation.y += dt;
      r.ice.visible = !!(r.flags & 2);
      if (r.flags & 4) r.obj.group.visible = Math.sin(t * 30) > 0; else r.obj.group.visible = true;
      // 星门
      if (r.gate && r.gate.visible) {
        r.gateT += dt; r.gate.userData.spin(dt);
        if (r.gateKind === 'in') r.gate.scale.setScalar(r.gateT < .5 ? Math.max(.01, r.gateT / .45) : Math.max(.01, 1 - (r.gateT - 1.2) / .4));
        else r.gate.scale.setScalar(r.gateT < .6 ? 1 : Math.max(.01, 1 - (r.gateT - .6) / .4));
        if (r.gateT > 1.7) r.gate.visible = false;
      }
      // 名字标签
      tmp.copy(r.holder.position); tmp.y += 3.4; tmp.project(camera);
      const vis = show && tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1 && r.holder.position.distanceTo(ship.position) < 200 && state.mode !== 'landed';
      r.tag.style.opacity = vis ? 1 : 0;
      if (vis) { r.tag.style.transform = `translate(${(tmp.x + 1) / 2 * innerWidth}px, ${(1 - tmp.y) / 2 * innerHeight}px) translate(-50%, -100%)`; r.tag.classList.toggle('ice', !!(r.flags & 2)); r.tag.classList.toggle('aim', me.aimTarget === r); }
    });

    // 子弹 / 导弹
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      s.life -= dt;
      if (s.kind === 'missile' && s.target && s.life > 0) {
        const tp = posOf(s.target);
        if (tp) {
          const want = tmp.copy(tp).sub(s.pos).normalize(), cur = s.vel.clone().normalize();
          const ang = cur.angleTo(want), k = Math.min(1, MISSILE_TURN * dt / Math.max(ang, 1e-4));
          s.vel.copy(cur.lerp(want, k).normalize().multiplyScalar(MISSILE_V));
        }
        s.puff -= dt; if (s.puff <= 0) { s.puff = .05; sparks(s.pos.clone(), 0xffa94d, 2); }
      }
      s.pos.addScaledVector(s.vel, dt);
      s.mesh.position.copy(s.pos); s.mesh.lookAt(tmp.copy(s.pos).add(s.vel));
      if (s.life <= 0) { killShot(s, s.kind === 'missile' ? 0xffa94d : null); continue; }
      if (net && net.me && s.owner !== net.me.id && vulnerable() || (net && net.me && s.owner !== net.me.id && t < me.shieldUntil && state.mode === 'fly')) {
        if (s.pos.distanceTo(ship.position) < SHIP_R + (t < me.shieldUntil ? 1 : 0)) gotHit(s);
      }
    }
    for (let i = sparkList.length - 1; i >= 0; i--) {
      const sp = sparkList[i]; sp.life -= dt;
      const a = sp.pts.geometry.attributes.position.array;
      sp.v.forEach((v, k) => { a[k * 3] += v.x * dt; a[k * 3 + 1] += v.y * dt; a[k * 3 + 2] += v.z * dt; });
      sp.pts.geometry.attributes.position.needsUpdate = true; sp.pts.material.opacity = Math.max(0, sp.life / .7);
      if (sp.life <= 0) { scene.remove(sp.pts); sparkList.splice(i, 1); }
    }
  }

  return {
    connect, update, fire, shield, setWeapon, triggerDown, triggerUp, gateEvent, paintHud,
    get frozen() { return me.t < me.frozenUntil; },
    shipChanged() { me.weapon = (weapons()[0]) || 'bullet'; net && net.setPresence({ ship: getShipKey() }); paintHud(); },
    get remotes() { return remotes; }, get net() { return net; }, me,
  };
}
