// ===== 乐园里的 NPC 小游客：到处乱逛，有时候去排队玩项目（摩天轮、过山车、旋转木马、海盗船、鬼屋） =====
// 只在自己的屏幕上跑（每个人看到的小游客各不一样），不占用网络
import * as THREE from 'three';
import { buildAvatar } from './avatar.js';
import { nameTag } from '../net.js';

const NAMES = ['小美', '阿乐', '豆豆', '小虎', '糖糖', '乐乐', '星星', '果果', '小鹿', '团团'];
const SKINS = ['explorer', 'chef', 'astro', 'knight', 'wizard', 'robot', 'bunny', 'panda', 'corgi', 'chick', 'dino', 'explorer'];
const SPEED = 3.2;

export function createNPCs({ scene, world, camera, tagsEl, islandR, playerRef, takenByOthers, count = 8 }) {
  const rnd = Math.random;
  const npcs = [];
  const tmp = new THREE.Vector3(), seatPos = new THREE.Vector3(), seatQ = new THREE.Quaternion();
  const mansion = world.mansion;
  // 能去玩的项目：所有有座位的游乐设施 + 鬼屋
  const spots = world.rides.map((r, i) => ({ kind: 'ride', ride: r, idx: i, pos: r.entry })).concat(mansion ? [{ kind: 'mansion', pos: mansion.entry }] : []);

  function blocked(x, z, pad = .6) {
    if (Math.hypot(x, z) > islandR - 4) return true;
    if (mansion && mansion.near(x, z)) return true;
    for (const c of world.colliders) {
      if (c.box) { const [bx, bz, hw, hl, yaw] = c.box, co = Math.cos(yaw), si = Math.sin(yaw), dx = x - bx, dz = z - bz, lx = dx * co - dz * si, lz = dx * si + dz * co; if (Math.abs(lx) < hw + pad && Math.abs(lz) < hl + pad) return true; }
      else if (Math.hypot(x - c[0], z - c[1]) < c[2] + pad) return true;
    }
    return false;
  }
  function randomPoint() { for (let k = 0; k < 40; k++) { const a = rnd() * Math.PI * 2, d = 8 + Math.sqrt(rnd()) * (islandR - 20), x = Math.cos(a) * d, z = Math.sin(a) * d; if (!blocked(x, z, 1.5)) return [x, z]; } return [0, 60]; }
  function push(n) {          // 把人推出障碍物
    const p = n.pos;
    for (const c of world.colliders) {
      if (c.box) { const [bx, bz, hw, hl, yaw] = c.box, co = Math.cos(yaw), si = Math.sin(yaw), dx = p.x - bx, dz = p.z - bz; let lx = dx * co - dz * si, lz = dx * si + dz * co;
        const ox = hw + .5 - Math.abs(lx), oz = hl + .5 - Math.abs(lz); if (ox > 0 && oz > 0) { if (ox < oz) lx = Math.sign(lx) * (hw + .5); else lz = Math.sign(lz) * (hl + .5); p.x = bx + lx * co + lz * si; p.z = bz - lx * si + lz * co; } }
      else { const dx = p.x - c[0], dz = p.z - c[1], d = Math.hypot(dx, dz), r = c[2] + .5; if (d < r && d > 1e-4) { p.x = c[0] + dx / d * r; p.z = c[1] + dz / d * r; } }
    }
    if (mansion && mansion.near(p.x, p.z) && !n.inMansion) mansion.collide(p, .45);
    const r = Math.hypot(p.x, p.z); if (r > islandR - 3) { p.x *= (islandR - 3) / r; p.z *= (islandR - 3) / r; }
  }
  function seatsTaken(ri) { const out = takenByOthers(ri); npcs.forEach(n => { if (n.ride && n.ride.rideIdx === ri) out.push(n.ride.seatIndex); }); return out; }

  for (let k = 0; k < count; k++) {
    const skin = SKINS[k % SKINS.length], av = buildAvatar(skin, {}); scene.add(av.root);
    const [x, z] = randomPoint();
    const n = { name: NAMES[k % NAMES.length], av, pos: new THREE.Vector3(x, 0, z), face: rnd() * 6.28, speed: 0, state: 'idle', timer: 1 + rnd() * 4,
      target: null, spot: null, ride: null, wait: 0, stuckT: 0, lastD: 1e9, inMansion: false, tag: nameTag(tagsEl, NAMES[k % NAMES.length], '#a5d8ff') };
    n.tag.classList.add('npc');
    npcs.push(n);
  }
  function decide(n) {
    if (rnd() < .45) { const s = spots[Math.floor(rnd() * spots.length)]; n.spot = s;
      const er = s.ride ? s.ride.entryR || 3 : 3;
      if (er > 5) { const a = Math.atan2(n.pos.x - s.pos[0], n.pos.z - s.pos[1]) + (rnd() - .5); n.target = [s.pos[0] + Math.sin(a) * (er - 1.2), s.pos[1] + Math.cos(a) * (er - 1.2)]; }   // 旋转木马：从哪边都能上
      else n.target = [s.pos[0] + (rnd() - .5) * 2, s.pos[1] + (rnd() - .5) * 2]; n.state = 'toSpot'; }
    else { n.target = randomPoint(); n.state = 'walk'; }
    n.stuckT = 0; n.lastD = 1e9;
  }
  function walkTo(n, dt) {
    const dx = n.target[0] - n.pos.x, dz = n.target[1] - n.pos.z, d = Math.hypot(dx, dz);
    if (d < 1.2) return true;
    const want = Math.atan2(dx, dz); let df = want - n.face; df = Math.atan2(Math.sin(df), Math.cos(df)); n.face += df * Math.min(1, dt * 5);
    n.pos.x += Math.sin(n.face) * SPEED * dt; n.pos.z += Math.cos(n.face) * SPEED * dt; n.speed = SPEED;
    push(n);
    // 卡住了（绕不过障碍物）：换个地方走
    n.stuckT += dt; if (n.stuckT > 2.5) { if (d > n.lastD - 1.5) { n.target = randomPoint(); n.state = 'walk'; n.spot = null; } n.stuckT = 0; n.lastD = d; }
    return false;
  }
  function tryBoard(n) {
    const r = n.spot.ride;
    if (r.canBoard && !r.canBoard()) return false;
    const taken = seatsTaken(n.spot.idx);
    const prev = r.playerPos; r.playerPos = [n.pos.x, n.pos.z];
    const ride = r.board(taken); r.playerPos = prev;
    if (taken.includes(ride.seatIndex)) return false;          // 没空位了
    ride.rideIdx = n.spot.idx; n.ride = ride; n.state = 'ride'; return true;
  }

  return {
    // 玩家要上的座位：把 NPC 坐着的也算进去
    takenSeats(ri) { return npcs.filter(n => n.ride && n.ride.rideIdx === ri).map(n => n.ride.seatIndex); },
    list: npcs,
    update(dt, show = true) {
      for (const n of npcs) {
        n.speed = 0;
        if (n.state === 'idle') { n.timer -= dt; if (n.timer <= 0) decide(n); }
        else if (n.state === 'walk') { if (walkTo(n, dt)) { n.state = 'idle'; n.timer = 1 + rnd() * 5; } }
        else if (n.state === 'toSpot') {
          if (walkTo(n, dt)) {
            if (n.spot.kind === 'mansion') { n.state = 'mansion'; n.inMansion = true; n.timer = 30 + rnd() * 40; }
            else { n.state = 'queue'; n.wait = 0; }
          }
        } else if (n.state === 'queue') {
          n.wait += dt;
          if (!tryBoard(n) && n.wait > 45) { n.state = 'idle'; n.timer = 1; n.spot = null; }
        } else if (n.state === 'ride') {
          const r = n.ride;
          if (r.done()) { const e = r.exitPos || n.spot.pos; n.pos.set(e[0] + (rnd() - .5) * 2, 0, e[1] + (rnd() - .5) * 2); push(n); n.ride = null; n.av.root.quaternion.identity(); n.state = 'idle'; n.timer = 1 + rnd() * 3; }
          else { r.seat.getWorldPosition(seatPos); r.seat.getWorldQuaternion(seatQ); n.av.root.position.copy(seatPos).y -= .62; n.av.root.quaternion.copy(seatQ); n.av.animate(dt, 0, false, true); }
        } else if (n.state === 'mansion') {
          n.timer -= dt;
          if (n.timer <= 0) { const e = mansion.exitOut || mansion.entry; n.pos.set(e[0], 0, e[1]); n.inMansion = false; n.face = mansion.exitYaw ?? n.face; n.target = randomPoint(); n.state = 'walk'; }
        }
        const visible = show && n.state !== 'mansion';
        n.av.root.visible = visible;
        if (n.state !== 'ride') { n.av.root.position.copy(n.pos); n.av.root.rotation.set(0, n.face, 0); n.av.animate(dt, n.speed / 7.5, false, false); }
        // 名字标签
        tmp.copy(n.av.root.position); tmp.y += 3.1; tmp.project(camera);
        const vis = visible && tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1 && n.av.root.position.distanceTo(playerRef.pos) < 45;
        n.tag.style.opacity = vis ? 1 : 0;
        if (vis) n.tag.style.transform = `translate(${(tmp.x + 1) / 2 * innerWidth}px, ${(1 - tmp.y) / 2 * innerHeight}px) translate(-50%, -100%)`;
      }
    },
  };
}
