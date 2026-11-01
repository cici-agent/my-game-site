// ===== 菜鸟星球多人：看见别人的形象 / 道具效果 / 用雪球互相砸 =====
import * as THREE from 'three';
import { joinRoom, throttle, nameTag, r1, r2 } from '../net.js';
import { buildAvatar, buildPet } from './avatar.js';
import { createAbilities } from './abilities.js';

const LOOK_KEYS = ['skin', 'hand', 'head', 'back', 'pet', 'fx'];

export function createParkMP({ scene, camera, player, getMe, getLook, getAvatar, abil, toast, sfx }) {
  const tagsEl = document.getElementById('mpTags');
  const remotes = new Map();
  let net = null;
  const send = throttle();
  const tmp = new THREE.Vector3();

  function lookSig(l) { return LOOK_KEYS.map(k => l && l[k] || '').join('|'); }
  function build(r, look) {
    const vis = r.av ? r.av.root.visible : true;
    if (r.av) scene.remove(r.av.root);
    if (r.pet) { scene.remove(r.pet.group); r.pet = null; }
    r.look = look || {}; r.sig = lookSig(r.look);
    r.av = buildAvatar(r.look.skin || 'explorer', { hand: r.look.hand, head: r.look.head, back: r.look.back });
    r.av.root.visible = vis; scene.add(r.av.root);
    if (r.look.pet) { r.pet = buildPet(r.look.pet); r.pet.group.position.copy(r.p.pos); scene.add(r.pet.group); }
    r.abil && r.abil.reattach();
  }
  function addRemote(p) {
    if (remotes.has(p.id)) return remotes.get(p.id);
    const r = { id: p.id, name: p.name || '玩家', p: { pos: new THREE.Vector3(0, 0, 70), face: 0, vy: 0, ground: true }, tgt: new THREE.Vector3(0, 0, 70),
      face: 0, spd: 0, flags: 0, got: false, av: null, pet: null, petPos: new THREE.Vector3(), tag: nameTag(tagsEl, p.name || '玩家', '#ffd23f') };
    r.abil = createAbilities({ scene, player: r.p, getAvatar: () => r.av, remote: true });
    build(r, p.look);
    r.av.root.visible = false;
    remotes.set(p.id, r); return r;
  }
  function removeRemote(r) {
    scene.remove(r.av.root); if (r.pet) scene.remove(r.pet.group); r.tag.remove(); remotes.delete(r.id);
  }

  // 我丢出去的雪球：大家都模拟同一颗；只有被砸的人自己判定砸中
  function myHitTest(pos) {
    const av = getAvatar(), sc = av.root.scale.x;
    const dy = pos.y - (player.pos.y + 1.3 * sc);
    return Math.hypot(pos.x - player.pos.x, pos.z - player.pos.z) < .8 * sc && Math.abs(dy) < 1.5 * sc;
  }
  function remoteThrowHitTest() {
    // 别人丢的雪球：看会不会砸到我
    let done = false;
    return pos => {
      if (done) return true;
      if (!net || !net.me || player.riding) return false;
      if (myHitTest(pos)) { done = true; onSnowHit(); return true; }
      return false;
    };
  }
  let lastThrower = null;
  function onSnowHit() {
    abil.slow(5);
    net.send('hit', { by: lastThrower });
    const r = remotes.get(lastThrower);
    toast(`❄️ 被${r ? ' ' + r.name + ' ' : ''}的雪球砸中了！走路变慢 5 秒`);
    sfx.whoosh && sfx.whoosh(.4, false);
  }

  function connect() {
    const ME = getMe();
    const meObj = ME ? { id: ME.user.id, name: ME.profile.username || '小菜鸟', look: getLook() } : null;
    if (net) { net.setMe(meObj); return; }                      // 登录 / 退出：同一个频道里换身份
    net = joinRoom('park', meObj);
    const upd = p => { const r = remotes.get(p.id); if (!r) return addRemote(p); r.name = p.name || r.name; r.tag.textContent = r.name; if (p.look && lookSig(p.look) !== r.sig) build(r, p.look); };
    net.on('join', upd);
    net.on('update', upd);
    net.on('leave', p => { const r = remotes.get(p.id); if (r) removeRemote(r); });
    net.on('st', (d, p) => {
      const r = remotes.get(p.id) || addRemote({ id: p.id, name: p.name });
      const [x, y, z, face, spd, flags] = d;
      r.tgt.set(x, y, z); r.face = face; r.spd = spd; r.flags = flags;
      if (!r.got) { r.p.pos.set(x, y, z); r.got = true; r.av.root.visible = true; }
      r.abil.setRemoteFly(!!(flags & 8));
    });
    net.on('fx', (d, p) => {
      const r = remotes.get(p.id); if (!r) return;
      if (d.k === 'snowball') {
        lastThrower = p.id;
        // 用一个专门判定“砸到我”的实例来模拟这颗雪球
        snowSim.start('snowball', d);
      } else r.abil.start(d.k);
    });
    net.on('hit', (d, p) => {
      const r = remotes.get(p.id); if (r) r.abil.slow(5);
      if (net.me && d.by === net.me.id) { toast(`🎯 雪球砸中了${r ? ' ' + r.name : ''}！`); sfx.chime && sfx.chime([880, 1175, 1568]); }
    });
  }
  // 模拟别人雪球的实例（雪球需要知道有没有砸到“我”）
  let snowHit = remoteThrowHitTest();
  const snowSim = createAbilities({ scene, player, getAvatar, remote: true, hitTest: pos => snowHit(pos) });
  const _start = snowSim.start;
  snowSim.start = (k, d) => { snowHit = remoteThrowHitTest(); return _start(k, d); };

  // 我用了道具 → 告诉别人
  function usedProp(key, data) { net && net.send('fx', { k: key, ...(data || {}) }); }
  function lookChanged() { net && net.setPresence({ look: getLook() }); }

  // ---------- 每帧 ----------
  function update(dt, t, my) {
    // 发自己的位置（坐设施时发座位的位置）
    if (net && net.me) {
      const root = getAvatar().root;
      const pos = player.riding ? root.position : player.pos;
      const flags = (player.ground ? 0 : 1) | (player.riding ? 2 : 0) | (my.pose === 'skate' ? 4 : 0) | (my.uniFly ? 8 : 0) | (my.pose === 'fly' ? 16 : 0);
      const moving = my.speed > .05 || !player.ground || !!player.riding;
      if (send(performance.now(), moving, flags + ':' + Math.round(pos.x) + ':' + Math.round(pos.z))) {
        const yaw = player.riding ? new THREE.Euler().setFromQuaternion(root.quaternion, 'YXZ').y : player.face;
        net.send('st', [r1(pos.x), r1(pos.y), r1(pos.z), r2(yaw), r2(my.speed), flags]);
      }
    }
    snowSim.step(dt, t, { moving: false });
    remotes.forEach(r => {
      if (!r.got) return;
      // 平滑移动 + 往前预测一点
      r.p.pos.lerp(r.tgt, Math.min(1, dt * 8));
      let dh = r.face - r.p.face; while (dh > Math.PI) dh -= Math.PI * 2; while (dh < -Math.PI) dh += Math.PI * 2;
      r.p.face += dh * Math.min(1, dt * 10);
      r.p.ground = !(r.flags & 1);
      const mod = r.abil.step(dt, t, { moving: r.spd > .05 && r.p.ground, fx: r.look.fx });
      const sitting = !!(r.flags & 2);
      r.av.root.position.copy(r.p.pos); if (!sitting) r.av.root.position.y += mod.lift * mod.scale;
      r.av.root.rotation.set(0, r.p.face, 0);
      r.av.rig.shadow.visible = !sitting;
      const pose = r.flags & 16 ? 'fly' : r.flags & 4 ? 'skate' : mod.pose;
      r.av.animate(dt, Math.min(1, r.spd), !r.p.ground, sitting, pose);
      if (r.pet) {
        const want = tmp.set(r.p.pos.x - Math.sin(r.p.face) * .7 + Math.cos(r.p.face) * 1.5, 0, r.p.pos.z - Math.cos(r.p.face) * .7 - Math.sin(r.p.face) * 1.5);
        const d = want.distanceTo(r.petPos), moving = d > .25;
        if (d > 30) r.petPos.copy(want);
        else if (moving) { const dir = want.clone().sub(r.petPos).normalize(); r.petPos.addScaledVector(dir, Math.min(d, dt * Math.max(4, d * 3))); r.pet.group.rotation.y = Math.atan2(dir.x, dir.z); }
        r.pet.group.position.copy(r.petPos); r.pet.update(dt, t, moving);
      }
      // 名字
      tmp.copy(r.av.root.position); tmp.y += 3.2 * mod.scale; tmp.project(camera);
      const vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1 && r.p.pos.distanceTo(player.pos) < 80;
      r.tag.style.opacity = vis ? 1 : 0;
      if (vis) { r.tag.style.transform = `translate(${(tmp.x + 1) / 2 * innerWidth}px, ${(1 - tmp.y) / 2 * innerHeight}px) translate(-50%, -100%)`; r.tag.classList.toggle('ice', r.abil.slowed); }
    });
  }

  return { connect, update, usedProp, lookChanged, get remotes() { return remotes; }, get net() { return net; } };
}
