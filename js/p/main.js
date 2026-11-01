// ===== 菜鸟星球游乐园：主程序 =====
import * as THREE from 'three';
import { buildWorld, ISLAND_R, SHOPS } from './world.js';
import { buildAvatar, buildPet } from './avatar.js';
import { INV, loadInventory, itemsOf, findItem, slotOf, owns, buy, equip, useItem } from './inventory.js';
import { createAbilities, DURATION } from './abilities.js';
import { createParkMP } from './mp.js';
import { createDayNight, jumpTo, isShifted, setGlobalOffset, globalOffset, offsetFor, T_DAY, T_SUNSET, T_NIGHT, SHOW_START, SHOW_LEN, DAY_LEN } from './daynight.js';
import { createFireShow } from './fireshow.js';
import { clockTower, clockText } from './clock.js';
import { buildKart, kartColorOf } from './kart.js';
import { createNPCs } from './npc.js';
import { BUMPER_COLORS } from './bumper.js';
import { createQueues } from './queue.js';
import { createStallGame } from './stalls.js';
import { loadPlanets, loadMe } from '../u/data.js';
import { askLogin } from '../u/login.js';
import { esc } from '../u/stations.js';
import * as sfx from '../u/sfx.js';

const $ = id => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const setLoad = p => { const b = $('loadBar'); if (b) b.style.width = p + '%'; };

let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true }); }
catch (e) { location.replace('index2d.html'); throw e; }
const DPR = Math.min(devicePixelRatio, isTouch ? 1.5 : 2);
renderer.setPixelRatio(DPR); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xffd6b0, 120, 420);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .1, 1500);
const hemi = new THREE.HemisphereLight(0xfff4e0, 0x6b8f3e, 1.3); scene.add(hemi);
const sunL = new THREE.DirectionalLight(0xffffff, 1.8); sunL.position.set(60, 120, 40); scene.add(sunL);
setLoad(20);

const world = buildWorld(scene);
// 大钟楼：在主路旁边，钟面朝着进来的方向
const clock = clockTower(scene, -10, 22, 0); world.colliders.push(clock.collider);
const dayNight = createDayNight({ scene, hemi, sun: sunL, world });
setLoad(60);

// ---------- 玩家 ----------
let me = buildAvatar('explorer');
scene.add(me.root);
const player = { pos: new THREE.Vector3(0, 0, 80), vy: 0, ground: true, face: Math.PI, riding: null };
// 排队区：所有项目（4 个游乐设施 + 碰碰车）
const qRides = [...world.rides, world.bumper], BUMPER_Q = qRides.length - 1;
function getTaken(qi) {
  const out = (qi < world.rides.length && mp ? mp.takenSeats(qi) : []).concat(npcs ? npcs.takenSeats(qi) : []);
  if (player.riding && player.riding.rideIdx === qi) out.push(player.riding.seatIndex ?? 0);
  if (qi === BUMPER_Q && player.bumper) out.push(-1);
  return out;
}
const queues = createQueues({ scene, getTaken, list: qRides.map((r, i) => ({ ride: r, gate: r.gate || r.entry, out: r.out, rows: 4, rowLen: i === 1 ? 8 : 11 })) });
queues.queues.forEach(q => world.colliders.push(q.area));
// 玩家在队伍里的样子：位置就是玩家自己的位置，排到了就上
const pq = { kind: 'player', pos: player.pos, face: 0, speed: 0, queue: null, boarding: null,
  board(ride, taken, want) { if (ride === world.bumper) { const ret = ride.board(taken, 'player', 1, want); if (!ret) return false; startBumper(ret); return true; } return boardRide(ride, taken, want); },
  release(res) { toast(`🎟️ 轮到你了！走过去找个空位，按 E 坐上去`); sfx.chime([659, 880]); } };
// 轮到你的时候：头顶上有个小箭头指着给你留的座位
const seatArrow = new THREE.Mesh(new THREE.ConeGeometry(.35, .7, 12), new THREE.MeshBasicMaterial({ color: 0xffd23f })); seatArrow.rotation.x = Math.PI; seatArrow.visible = false; scene.add(seatArrow);
function seatSpots(res) {          // 这个项目现在空着的座位（和它们在地上的位置）
  const R = res.ride, taken = queues.taken(res.qi, pq), out = [], v = new THREE.Vector3();
  const n = R === world.bumper ? R.capacity : (R.seats || []).length;
  for (let k = 0; k < n; k++) { if (taken.includes(k) && k !== res.k) continue;
    const sp = R.boardSpot ? R.boardSpot(k) : (R.seats[k].getWorldPosition(v), [v.x, v.z]); out.push({ k, sp }); }
  return out;
}
function boardingTick(dt) {
  const res = pq.boarding; if (!res) { seatArrow.visible = false; return null; }
  if (!res.ride.canBoard()) { queues.backToFront(pq); seatArrow.visible = false; toast('😅 这一轮没赶上，排在最前面等下一轮'); return null; }
  const sp = res.ride.boardSpot ? res.ride.boardSpot(res.k) : (() => { const v = new THREE.Vector3(); res.ride.seats[res.k].getWorldPosition(v); return [v.x, v.z, v.y]; })();
  seatArrow.visible = true; seatArrow.position.set(sp[0], (sp[2] || 0) + 3.2 + Math.sin(performance.now() / 200) * .25, sp[1]);
  let best = null, bd = 1.9; seatSpots(res).forEach(o => { const d = Math.hypot(o.sp[0] - player.pos.x, o.sp[1] - player.pos.z); if (d < bd) { bd = d; best = o; } });
  return best;
}
// 乐园里的 NPC 小游客（每个人自己屏幕上的，不联网）
let npcs = null;
try { npcs = createNPCs({ scene, world, camera, tagsEl: $('mpTags'), islandR: ISLAND_R, playerRef: player, queues, qRides }); } catch (e) { console.warn('npc', e); }
me.root.position.copy(player.pos);
let pet = null;
const petPos = new THREE.Vector3(2, 0, 82);

// 按装备重新搭人物（皮肤 / 手上 / 头上 / 背上 / 宠物）
function applyLook() {
  const e = INV.equip, vis = me.root.visible;
  scene.remove(me.root);
  me = buildAvatar(e.skin || 'explorer', { hand: e.hand, head: e.head, back: e.back });
  me.root.visible = vis; scene.add(me.root);
  abil.reattach();
  if (pet) { scene.remove(pet.group); pet = null; }
  if (e.pet) { pet = buildPet(e.pet); petPos.copy(player.pos).add(new THREE.Vector3(1.5, 0, 1.5)); petPos.y = 0; scene.add(pet.group); }
  mp && mp.lookChanged();
}

// ---------- 提示条 ----------
let toastT = 0;
function toast(msg) { const el = $('toast'); el.textContent = msg; el.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), 2600); }
const abil = createAbilities({ scene, player, getAvatar: () => me, sfx, toast });

// ---------- 状态 / 输入 ----------
const keys = {};
let cam = { yaw: Math.PI, pitch: .32, dist: 11 };   // yaw=π：相机在玩家南边看向北
addEventListener('keydown', e => {
  sfx.unlock();
  if (chatNpc) { if (e.code === 'Escape' || (e.code === 'KeyE' && !e.repeat && document.activeElement !== $('npcInput'))) closeChat(); return; }
  if (shopOpen) { if (e.code === 'Escape') closeShop(); return; }
  keys[e.code] = true;
  if (player.stall) { if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) stallGame.key('Space', true); } if ((e.code === 'KeyE' || e.code === 'Escape') && !e.repeat) exitStall(); return; }
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyE' && !e.repeat) action();
  if (e.code === 'Space' && !e.repeat) abil.onJumpPress();
  if (e.code === 'KeyR' && !e.repeat && player.kart) kartRespawn();
  const dn = /^Digit([1-9])$/.exec(e.code); if (dn && !e.repeat) pressSlot(+dn[1] - 1);
  if (e.code === 'Escape' && player.riding) tryLeaveRide();
});
addEventListener('keyup', e => { keys[e.code] = false; if (player.stall && e.code === 'Space') stallGame.key('Space', false); });

// 拖动屏幕转视角（鼠标左键 / 单指）
let drag = null;
const ndc = e => [e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1];
renderer.domElement.addEventListener('pointerdown', e => { sfx.unlock(); if (player.stall) { stallGame.pointer('down', ...ndc(e)); return; } drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointermove', e => {
  if (player.stall) { stallGame.pointer('move', ...ndc(e)); return; }
  if (!drag || drag.id !== e.pointerId) return;
  cam.yaw -= (e.clientX - drag.x) * .006; cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - drag.y) * .004, -1.05, 1.1);   // 往上拖到底 = 抬头看天
  drag.x = e.clientX; drag.y = e.clientY;
});
renderer.domElement.addEventListener('pointerup', e => { if (player.stall) stallGame.pointer('up', ...ndc(e)); drag = null; });
renderer.domElement.addEventListener('wheel', e => { cam.dist = THREE.MathUtils.clamp(cam.dist + e.deltaY * .01, 5, 22); }, { passive: true });

// 触屏：摇杆 + 跳跃 + 动作键
const stick = $('stick'), knob = stick.querySelector('.knob');
const joy = { x: 0, y: 0, id: null };
stick.addEventListener('pointerdown', e => { joy.id = e.pointerId; stick.setPointerCapture(e.pointerId); moveJoy(e); });
stick.addEventListener('pointermove', e => { if (e.pointerId === joy.id) moveJoy(e); });
const endJoy = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
stick.addEventListener('pointerup', endJoy); stick.addEventListener('pointercancel', endJoy);
function moveJoy(e) {
  const r = stick.getBoundingClientRect(), R = r.width / 2;
  let dx = e.clientX - r.left - R, dy = e.clientY - r.top - R;
  const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
  joy.x = dx / R; joy.y = -dy / R; knob.style.transform = `translate(${dx}px, ${dy}px)`;
}
$('jumpBtn').addEventListener('pointerdown', e => { keys.Space = true; abil.onJumpPress(); $('jumpBtn').setPointerCapture(e.pointerId); });
['pointerup', 'pointercancel'].forEach(ev => $('jumpBtn').addEventListener(ev, () => keys.Space = false));
$('actBtn').addEventListener('click', () => action());

// ---------- 交互：设施 / 商店 / 星门 ----------
let near = null, queued = null;
const promptEl = $('prompt');
function findNear() {
  let best = null, bd = Infinity;
  world.interact.forEach(it => { const d = Math.hypot(player.pos.x - it.pos[0], player.pos.z - it.pos[1]); if (d < it.r && d < bd) { bd = d; best = it; } });
  if (!best && queues) { const q = queues.nearEntrance(player.pos.x, player.pos.z); if (q) best = { type: 'queue', q }; }
  if (!best && npcs && !player.riding && !player.kart && !player.bumper) { const n = npcs.near(player.pos.x, player.pos.z); if (n) best = { type: 'npc', npc: n }; }
  return best;
}
function promptText(it) {
  if (!it) return '';
  if (it.type === 'ride') return `${it.ride.icon} ${it.ride.status(queued === it.ride)}`;
  if (it.type === 'shop') return `${it.shop.icon} 按 E 进入${it.shop.name}`;
  if (it.type === 'gate') return '🚀 按 E 起飞离开菜鸟星球';
  if (it.type === 'kart') return '🏎️ 按 E 开卡丁车';
  if (it.type === 'bumper') return '🚗 按 E 开碰碰车';
  if (it.type === 'npc') return `💬 按 E 和 ${it.npc.name} 说话`;
  if (it.type === 'stall') return stallsOpen ? `${it.icon} 按 E 玩${it.name}` : `🌙 ${it.name}晚上收摊了，白天再来`;
  if (it.type === 'queue') { const n = it.q.members.length; return `${it.q.ride.icon} 按 E 排队玩${it.q.ride.name}${n ? `（现在有 ${n} 人在排）` : ''}`; }
  if (it.type === 'mansion') return '🏚️ 鬼屋：直接走进去，找到出口（很黑哦）';
  return '';
}
function action() {
  if (player.stall) { exitStall(); return; }
  if (player.riding) { tryLeaveRide(); return; }
  if (player.kart) { stopKart(); return; }
  if (player.bumper) { tryLeaveBumper(); return; }
  if (pq.queue) { queues.leave(pq); toast('👋 离开了队伍'); return; }
  if (pq.boarding) { const best = boardingTick(0); if (best) { const res = pq.boarding; if (pq.board(res.ride, queues.taken(res.qi, pq), best.k)) { queues.done(pq); seatArrow.visible = false; } } else toast('走到空位旁边再按 E 哦（跟着黄色箭头）'); return; }
  if (!near) return;
  if (near.type === 'kart') { startKart(); return; }
  if (near.type === 'queue') { if (abil.flying) { toast('先落地再排队哦'); return; } queues.join(near.q.idx, pq); sfx.click(); toast(`${near.q.ride.icon} 排进${near.q.ride.name}的队伍啦，前面还有 ${queues.position(pq)} 人`); return; }
  if (near.type === 'npc') { openChat(near.npc); return; }
  if (near.type === 'stall') { enterStall(near); return; }
  if (near.type === 'ride') {
    if (near.ride.canBoard && !near.ride.canBoard()) { queued = near.ride; return; }   // 排队，回站自动上车
    boardRide(near.ride);
  } else if (near.type === 'shop') openShop(near.shop.key);
  else if (near.type === 'gate') leave();
}
// 项目没到站不能下车：到站以后会自动下来
let noLeaveT = 0;
function tryLeaveRide() {
  const r = player.riding; if (!r) return;
  if (r.done && !r.done()) { const now = performance.now(); if (now - noLeaveT > 1500) { noLeaveT = now; toast('🎢 还没到站哦，到站会自动下来'); } return; }
  leaveRide();
}
function boardRide(rideObj, taken, want) {
  queued = null;
  const rideIdx = world.rides.indexOf(rideObj);
  rideObj.playerPos = [player.pos.x, player.pos.z];
  const ride = rideObj.board(taken || getTaken(rideIdx), want);
  if (!ride) return false;
  ride.rideIdx = rideIdx;
  ride.prevCam = { ...cam };
  player.riding = ride; player.vy = 0; sfx.chime([523, 659, 784]);
  if (ride.camDist) cam.dist = ride.camDist;
  if (ride.camYaw !== undefined) cam.yaw = ride.camYaw;
  if (ride.camPitch !== undefined) cam.pitch = ride.camPitch;
  return true;
}
// ---------- 鬼屋：进去以后是第一人称、很黑、只有一点点手电光 ----------
let inMansion = false, stepT = 0;
const flashLight = new THREE.PointLight(0xffe2b0, 0, 9, 1.6); scene.add(flashLight);
// 紧急退出：直接回到鬼屋门口
function mansionEscape() {
  if (!inMansion) return;
  const e = world.mansion.entry; player.pos.set(e[0], 0, e[1]); player.vy = 0;
  cam.yaw += Math.PI;                                  // 背对鬼屋站好
  setMansion(false); toast('🚪 已经回到鬼屋门口啦');
}
$('escBtn').onclick = mansionEscape;
setTimeout(() => { const b = $('kartReset'); if (b) b.onclick = () => player.kart && kartRespawn(); });
function setMansion(on) {
  inMansion = on;
  me.root.visible = !on; if (pet) pet.group.visible = !on;
  if (on) { world.mansion.reset(); scene.fog.near = .5; scene.fog.far = 9; cam.pitch = .32; document.body.classList.add('in-mansion'); }
  else { scene.fog.near = 120; scene.fog.far = 420; flashLight.intensity = 0; document.body.classList.remove('in-mansion'); }
}

// 在哪个岛上就用哪个岛的边界
let portalCD = 0;
function clampIsland(pos, margin) {
  const KI = world.KI, onK = Math.hypot(pos.x - KI.x, pos.z - KI.z) < KI.R + 20;
  const cx = onK ? KI.x : 0, cz = onK ? KI.z : 0, maxR = (onK ? KI.R : ISLAND_R) - margin;
  const dx = pos.x - cx, dz = pos.z - cz, R = Math.hypot(dx, dz);
  if (R > maxR) { pos.x = cx + dx * maxR / R; pos.z = cz + dz * maxR / R; }
}

// ---------- 卡丁车 ----------
let kartObj = null;
const K = { speed: 0, heading: 0, steer: 0, started: false, lap: 0, lapStart: 0, best: null, lastS: 0, cp: false, last: null };
function startKart() {
  if (abil.flying) { toast('先落地再开卡丁车哦'); return; }
  const k = world.kart;
  kartObj = buildKart(kartColorOf(ME ? ME.user.id : 'me')); scene.add(kartObj.group);
  player.kart = true; player.vy = 0; player.ground = true;
  player.pos.set(k.start.x, k.start.y, k.start.z); player.face = K.heading = k.start.heading;
  Object.assign(K, { y: k.start.y, vy: 0, air: false, check: k.start.idx, pitch: 0, speed: 0, steer: 0, started: false, lap: 0, lastS: k.start.idx / k.N, cp: false, last: null });
  cam.yaw = K.heading; cam.pitch = .25;
  if (pet) pet.group.visible = false;
  $('kartHud').classList.add('show'); document.body.classList.add('karting'); renderKartHud(0);
  sfx.chime([523, 784, 1046]); sfx.unlock();
  toast(isTouch ? '🏎️ 摇杆往上加速、左右转弯 · 点「下车」离开' : '🏎️ W 加速 · S 刹车 / 倒车 · A D 转弯 · 按 E 下车');
}
function stopKart() {
  if (!kartObj) return;
  scene.remove(kartObj.group); kartObj = null; player.kart = false;
  splashes.splice(0).forEach(m => scene.remove(m));
  headLight.intensity = 0; if (K.fogT) { K.fogT = false; K.tunnel = false; scene.fog.near = 120; scene.fog.far = 420; }
  const e = world.kart.entry; player.pos.set(e[0] + 1.5, 0, e[1] + 2);
  me.root.rotation.set(0, player.face, 0, 'XYZ'); me.root.visible = true; player.pos.y = 0;
  if (pet) { pet.group.visible = true; petPos.copy(player.pos); }
  $('kartHud').classList.remove('show'); document.body.classList.remove('karting'); sfx.engineLevel(0);
}
const fmtLap = s => s == null ? '--' : (s >= 60 ? Math.floor(s / 60) + ':' : '') + (s % 60).toFixed(1).padStart(s >= 60 ? 4 : 1, '0') + ' 秒';
function renderKartHud(now) {
  $('kartLap').textContent = K.started ? `第 ${K.lap + 1} 圈` : '开过起点线开始计时';
  $('kartTime').textContent = K.started ? fmtLap(now - K.lapStart) : '--';
  $('kartBest').textContent = fmtLap(K.best);
  $('kartSpeed').textContent = Math.round(Math.abs(K.speed) * 3.6) + ' km/h';
}
const kartSeat = new THREE.Vector3();
const headLight = new THREE.PointLight(0xfff1c4, 0, 34, 1.4); scene.add(headLight);   // 隧道里的车灯
function kartRespawn() {
  const k = world.kart, i = K.check ?? k.start.idx, [x, y, z] = k.pointAt(i), tt = k.tanAt(i);
  player.pos.set(x, y + .3, z); K.heading = Math.atan2(tt.x, tt.z); K.speed = 0; K.vy = 0; K.air = false; K.y = y + .3; K.lastS = i / k.N;
  banner('↩ 回到赛道', 1200);
}
// ---------- 和 NPC 聊天 ----------
let chatNpc = null;
function chatLine(who, text) { const d = document.createElement('div'); d.className = 'm ' + who; d.textContent = text; const log = $('npcLog'); log.appendChild(d); log.scrollTop = log.scrollHeight; }
function openChat(n) {
  chatNpc = n; Object.keys(keys).forEach(k => keys[k] = false);
  $('npcName').textContent = `💬 ${n.name}`; $('npcLog').innerHTML = '';
  chatLine('npc', npcs.startChat(n));
  $('npcChat').classList.add('show'); if (!isTouch) setTimeout(() => $('npcInput').focus(), 30);
}
function closeChat() { if (!chatNpc) return; npcs.endChat(chatNpc); chatNpc = null; $('npcChat').classList.remove('show'); $('npcInput').blur(); }
function sendChat(text) {
  if (!chatNpc || !text.trim()) return;
  chatLine('me', text.trim());
  const n = chatNpc; setTimeout(() => { if (chatNpc === n) chatLine('npc', npcs.talk(n, text)); else npcs.talk(n, text); sfx.click && sfx.click(); }, 350 + Math.random() * 400);
}
setTimeout(() => {
  $('npcForm').addEventListener('submit', e => { e.preventDefault(); const i = $('npcInput'); sendChat(i.value); i.value = ''; });
  $('npcClose').addEventListener('click', closeChat);
  document.querySelectorAll('#npcChat .quick button').forEach(b => b.addEventListener('click', () => sendChat(b.textContent)));
  $('npcInput').addEventListener('keydown', e => { e.stopPropagation(); if (e.code === 'Escape' || (e.code === 'KeyE' && !e.isComposing && !e.target.value)) { e.preventDefault(); closeChat(); } });
});
// ---------- 摆摊小游戏 ----------
const stallGame = createStallGame({ scene, camera, stalls: world.stalls, sfx,
  hud(text, charge) { const h = $('stallHud'); if (text == null) { h.classList.remove('show'); return; } h.classList.add('show'); $('stallTxt').textContent = text;
    const bar = $('stallBar'); bar.style.display = charge == null ? 'none' : 'block'; if (charge != null) bar.firstElementChild.style.width = Math.round(charge * 100) + '%'; } });
let stallsOpen = true;
function enterStall(it) {
  if (!stallsOpen) { toast('🌙 晚上小摊都收摊啦，白天再来玩～'); return; }
  if (abil.flying) { toast('先落地再玩哦'); return; }
  player.stall = it.game; Object.keys(keys).forEach(k => keys[k] = false);
  document.body.classList.add('in-stall'); if (pet) pet.group.visible = false;
  stallGame.start(it.game); sfx.chime([659, 784, 988]);
}
function exitStall() {
  if (!player.stall) return;
  stallGame.stop(); player.stall = null; document.body.classList.remove('in-stall'); $('aimDot').classList.remove('on');
  me.root.visible = true; if (pet) { pet.group.visible = true; petPos.copy(player.pos); }
}
// ---------- 碰碰车 ----------
function startBumper(ret) {
  const B = world.bumper;
  player.bumper = ret; B.othersFn = bumperOthers;
  player.vy = 0; player.ground = true;
  if (pet) pet.group.visible = false;
  document.body.classList.add('karting'); sfx.chime([523, 659, 988]); sfx.unlock();
  toast(isTouch ? '🚗 摇杆开车，去撞别人吧！' : '🚗 W 前进 · S 后退 · A D 转弯 · 去撞别人吧！');
}
function tryLeaveBumper() { const now = performance.now(); if (now - noLeaveT > 1500) { noLeaveT = now; toast('🚗 这一轮结束才能下车哦'); } }
function stopBumper() {
  const ret = player.bumper; if (!ret) return;
  ret.release(); player.bumper = null; sfx.engineLevel(0);
  player.pos.set(ret.exitPos[0], 0, ret.exitPos[1]); me.root.rotation.set(0, player.face, 0, 'XYZ'); me.root.visible = true;
  if (pet) { pet.group.visible = true; petPos.copy(player.pos); }
  document.body.classList.remove('karting');
}
function bumperOthers() {
  const B = world.bumper, others = [];
  if (mp) mp.remotes.forEach(r => { if (r.flags & 64) { const [x, z] = B.toLocal(r.p.pos.x, r.p.pos.z); others.push({ x, z, vx: 0, vz: 0, fixed: true }); } });
  return others;
}
let bumpShake = 0;
function bumperTick(dt, t) {
  const B = world.bumper, ret = player.bumper, c = ret.car;
  if (ret.done()) { stopBumper(); return; }
  let thr = 0, st = 0;
  if (keys.KeyW || keys.ArrowUp) thr += 1;
  if (keys.KeyS || keys.ArrowDown) thr -= 1;
  if (keys.KeyA || keys.ArrowLeft) st += 1;
  if (keys.KeyD || keys.ArrowRight) st -= 1;
  if (joy.id !== null) { thr = Math.abs(joy.y) > .15 ? joy.y : 0; st = -joy.x; }
  c.thr = B.phase === 'run' ? thr : 0; c.steer = B.phase === 'run' ? st : 0;
  const hit = B.lastHit || 0; B.lastHit = 0;
  if (hit > 1.5) { sfx.boom && sfx.boom(Math.min(.6, .12 + hit * .05)); bumpShake = Math.min(.5, hit * .06); }
  const [wx, wz] = B.toWorld(c.x, c.z);
  player.pos.set(wx, 0, wz); player.face = c.head;
  c.m.seat.getWorldPosition(kartSeat);
  me.root.position.copy(kartSeat).y -= .62; me.root.rotation.set(0, c.head, 0, 'XYZ'); me.root.scale.setScalar(1); me.root.visible = true;
  me.rig.shadow.visible = false; me.animate(dt, 0, false, true);
  sfx.engineLevel(.15 + Math.hypot(c.vx, c.vz) / 9 * .5);
  // 相机：在车后上方
  bumpShake *= Math.max(0, 1 - dt * 6);
  const fx = Math.sin(c.head), fz = Math.cos(c.head), sh = () => (Math.random() - .5) * bumpShake;
  camPos.set(wx - fx * 7.5 + sh(), 4.3 + sh(), wz - fz * 7.5 + sh());
  camera.position.lerp(camPos, Math.min(1, dt * 4));
  camera.lookAt(wx + fx * 3, 1.2, wz + fz * 3);
  promptEl.textContent = B.phase === 'board' ? `🚗 还有 ${Math.ceil(B.left)} 秒开始，准备好！` : `🚗 这一轮还剩 ${Math.ceil(B.left)} 秒`; promptEl.classList.add('show');
  $('actBtn').classList.remove('show');
  myMove = { speed: Math.hypot(c.vx, c.vz) / 9, bumper: true };
}
// 水花：车在湖里开的时候往两边溅
const splashes = [];
const splashMat = new THREE.MeshBasicMaterial({ color: 0xd0ebff, transparent: true, opacity: .85 });
const splashGeo = new THREE.SphereGeometry(.14, 6, 4);
function kartSplash(dt) {
  const n = Math.min(4, Math.ceil(Math.abs(K.speed) * dt * 6));
  for (let k = 0; k < n; k++) {
    const m = new THREE.Mesh(splashGeo, splashMat); const s = Math.random() < .5 ? -1 : 1, back = -1.4;
    m.position.set(player.pos.x + Math.cos(K.heading) * s * 1.1 + Math.sin(K.heading) * back, -.2, player.pos.z - Math.sin(K.heading) * s * 1.1 + Math.cos(K.heading) * back);
    m.userData.v = new THREE.Vector3(Math.cos(K.heading) * s * (1.5 + Math.random() * 2), 3 + Math.random() * 3, -Math.sin(K.heading) * s * (1.5 + Math.random() * 2));
    m.userData.life = .7; scene.add(m); splashes.push(m);
  }
}
function tickSplashes(dt) {
  for (let k = splashes.length - 1; k >= 0; k--) { const m = splashes[k]; m.userData.life -= dt; m.userData.v.y -= 14 * dt; m.position.addScaledVector(m.userData.v, dt);
    if (m.userData.life <= 0 || m.position.y < -.4) { scene.remove(m); splashes.splice(k, 1); } }
}
function kartTick(dt, t) {
  const k = world.kart;
  let thr = 0, st = 0;
  if (keys.KeyW || keys.ArrowUp) thr += 1;
  if (keys.KeyS || keys.ArrowDown) thr -= 1;
  if (keys.KeyA || keys.ArrowLeft) st += 1;
  if (keys.KeyD || keys.ArrowRight) st -= 1;
  if (joy.id !== null) { thr = Math.abs(joy.y) > .15 ? joy.y : 0; st = -joy.x; }
  const sup = k.support(player.pos.x, K.y + .05, player.pos.z);
  const onRoad = !!sup && Math.abs(sup.y - K.y) < .6;
  const onGrass = !onRoad && K.y < .4 && k.onIsland(player.pos.x, player.pos.z);
  const grounded = !K.air;
  // 油门 / 刹车 / 阻力（在空中不能加速）
  if (grounded) {
    const inWater = !!(sup && sup.water);
    const maxV = inWater ? 9 : onRoad ? 30 : 9;
    K.speed += thr * (thr * K.speed < 0 ? 26 : thr > 0 ? 15 : 8) * dt;
    K.speed -= K.speed * (inWater ? .9 : onRoad ? .28 : 1.4) * dt;
    if (inWater && Math.abs(K.speed) > 2) kartSplash(dt);
    if (inWater && !K.wet) { K.wet = true; sfx.boom && sfx.boom(.15); toast('🌊 下水啦！水里开得慢一点'); } else if (!inWater) K.wet = false;
    if (!thr) K.speed -= Math.sign(K.speed) * Math.min(Math.abs(K.speed), 2.5 * dt);
    if (K.speed > maxV) K.speed += (maxV - K.speed) * Math.min(1, dt * 3);
    K.speed = Math.max(-6, K.speed);
    K.steer += (st - K.steer) * Math.min(1, dt * 8);
    K.heading += K.steer * dt * 2.0 * THREE.MathUtils.clamp(K.speed / 7, -1, 1);
  } else K.steer *= .95;
  const ox = player.pos.x, oz = player.pos.z, oy = K.y;
  player.pos.x += Math.sin(K.heading) * K.speed * dt; player.pos.z += Math.cos(K.heading) * K.speed * dt;
  // 高度：在路面上就贴着路面；路突然没了（断桥 / 跳台尽头）就飞起来
  const sup2 = k.support(player.pos.x, K.y + .05, player.pos.z);
  if (!K.air) {
    const target = sup2 ? sup2.y : (onGrass || (K.y < .4 && k.onIsland(player.pos.x, player.pos.z)) ? 0 : null);
    if (target === null || K.y - target > .45) { K.air = true; K.vy = Math.max(K.vyGround || 0, target === null ? Math.abs(K.speed) * .2 : 0); }   // 冲出跳台会往上抛一点
    else { K.y = target; }
  }
  if (K.air) {
    K.vy -= 24 * dt; K.y += K.vy * dt;
    const land = k.support(player.pos.x, K.y + .3, player.pos.z);
    const floor = land ? land.y : (k.onIsland(player.pos.x, player.pos.z) ? 0 : -999);
    if (K.y <= floor) { K.y = floor; K.air = false; K.vy = 0; if (floor > -999) { kartObj.group.position.y = floor; sfx.boom && sfx.boom(.25); } }
    if (K.y < -25) { kartRespawn(); return; }
  }
  K.vyGround = K.air ? 0 : (K.y - oy) / Math.max(dt, 1e-3);
  // 护栏：高架上不能从侧面开出去（断桥那里没有护栏）
  const nr = k.nearest(player.pos.x, K.y, player.pos.z);
  if (nr && nr.railed && !K.air) {
    const lim = k.W / 2 - .9;
    if (Math.abs(nr.lat) > lim) { const push = Math.abs(nr.lat) - lim; player.pos.x -= nr.side.x * Math.sign(nr.lat) * push; player.pos.z -= nr.side.z * Math.sign(nr.lat) * push; K.speed *= .97; }
  }
  K.tunnel = !!(nr && nr.tunnel && K.y < -3);
  // 隧道里的小汽车：撞上会被弹回来
  K.hitCD = Math.max(0, (K.hitCD || 0) - dt);
  const hc = k.hitCar && k.hitCar(player.pos.x, K.y, player.pos.z);
  if (hc) {
    const fwd = Math.sin(K.heading) * hc.tan.x + Math.cos(K.heading) * hc.tan.z;          // 和小汽车同方向 = 1
    const push = hc.lon > 0 ? 3.15 - hc.lon : -3.15 - hc.lon;                          // 推到车头 / 车尾外面
    if (Math.abs(hc.lat) > 1.6) { const pl = (Math.sign(hc.lat) * 2.15 - hc.lat); player.pos.x += hc.side.x * pl; player.pos.z += hc.side.z * pl; }
    else { player.pos.x += hc.tan.x * push; player.pos.z += hc.tan.z * push; }
    if (!K.hitCD) { K.hitCD = .8; K.speed = -Math.min(6, Math.abs(K.speed) * .3) - 2; void fwd; sfx.boom && sfx.boom(.5); banner('💥 撞车啦！从旁边超车吧', 1400); }
  }
  clampIsland(player.pos, 3);
  player.pos.y = K.y; player.face = K.heading;
  // 坡度：用这一帧的高度变化算车头抬起 / 低下
  const moved = Math.hypot(player.pos.x - ox, player.pos.z - oz);
  const slope = moved > 1e-3 ? (K.y - oy) / moved : 0;
  if (!K.air && onRoad) K.speed -= THREE.MathUtils.clamp(slope, -.6, .6) * 9.8 * .6 * dt;
  const wantPitch = -Math.atan(K.air ? K.vy / Math.max(6, Math.abs(K.speed)) : slope);       // 车头朝上 = 负的
  K.pitch = (K.pitch || 0) + (THREE.MathUtils.clamp(wantPitch, -.5, .5) - (K.pitch || 0)) * Math.min(1, dt * 8);
  // 计圈 + 检查点（只在路上的时候算）
  if (nr && !K.air && Math.abs(nr.lat) < k.W / 2 + .5) {
    const s = nr.i / k.N;
    if (nr.i % 40 === 0 || K.check == null) K.check = nr.i;
    if (s > .4 && s < .6) K.cp = true;
    if (K.lastS > .9 && s < .1) {
      if (!K.started) { K.started = true; K.lapStart = t; K.cp = false; banner('🏁 开始计时！', 1500); }
      else if (K.cp) {
        const lapT = t - K.lapStart, best = K.best == null || lapT < K.best;
        if (best) K.best = lapT;
        K.lap++; K.lapStart = t; K.cp = false;
        banner(`🏁 第 ${K.lap} 圈：${fmtLap(lapT)}${best ? '  ⭐ 最快！' : ''}`, 2500); sfx.chime(best ? [784, 988, 1318, 1568] : [784, 988]);
      }
    }
    if (K.lastS < .1 && s > .9) K.cp = false;
    K.lastS = s;
  }
  // 小车和人
  kartObj.group.position.copy(player.pos); kartObj.group.rotation.set(K.pitch, K.heading, 0, 'YXZ'); kartObj.update(dt, K.speed, K.steer);
  kartObj.seat.getWorldPosition(kartSeat);
  me.root.position.copy(kartSeat).y -= .62; me.root.rotation.set(K.pitch, K.heading, 0, 'YXZ'); me.root.scale.setScalar(1);
  me.rig.shadow.visible = false;
  me.animate(dt, 0, false, true);
  sfx.engineLevel(.25 + Math.abs(K.speed) / 30 * .9);
  // 追尾视角
  const fx = Math.sin(K.heading), fz = Math.cos(K.heading);
  const ct = K.tunnel ? [8, 3.0] : [11, 4.8];
  headLight.intensity = K.tunnel ? 60 : 0; headLight.position.set(player.pos.x + Math.sin(K.heading) * 5, player.pos.y + 2.2, player.pos.z + Math.cos(K.heading) * 5);
  if (K.tunnel !== K.fogT) { K.fogT = K.tunnel; scene.fog.near = K.tunnel ? 2 : 120; scene.fog.far = K.tunnel ? 55 : 420; }
  camPos.set(player.pos.x - fx * ct[0], player.pos.y + ct[1], player.pos.z - fz * ct[0]);
  camera.position.lerp(camPos, Math.min(1, dt * 5));
  camera.lookAt(player.pos.x + fx * 5, player.pos.y + 1.6, player.pos.z + fz * 5);
  if (Math.floor(t * 10) !== K.last) { K.last = Math.floor(t * 10); renderKartHud(t); }
  promptEl.textContent = isTouch ? '点「下车」离开 · 掉下去点「回到赛道」' : '按 E 下车 · 掉下去按 R 回到赛道'; promptEl.classList.add('show');
  $('actBtn').textContent = '下车'; $('actBtn').classList.add('show');
  myMove = { speed: Math.abs(K.speed) / 30, kart: true };
}

function leaveRide() {
  const r = player.riding; if (!r) return;
  if (r.cancel) r.cancel();
  player.riding = null; cam.dist = r.prevCam.dist; cam.pitch = r.prevCam.pitch;
  me.root.visible = true; camera.up.set(0, 1, 0);
  player.pos.set(r.exitPos[0], 0, r.exitPos[1]); player.vy = 0; player.ground = true;
  me.root.rotation.set(0, player.face, 0);
}

// ---------- 商店 ----------
let shopOpen = false, shopKey = null, viewer = null, preview = null, confirmKey = null, confirmT = 0, busy = false;
const GROUPS = { ship: [['all', '']], skin: [['all', '']], prop: [['use', '⚡ 能力道具（买一次用一次，可以多买几个存着）'], ['decor', '🎀 装饰品（买了永久拥有，可以随时换）']] };
const SLOT_NAME = { hand: '手上', head: '头上', back: '背上', pet: '宠物', fx: '脚印' };

function itemState(it) {
  if (it.kind === 'use') return { kind: 'use', have: INV.have[it.key] || 0 };
  const slot = slotOf({ ...it, shop: shopKey });
  return { kind: 'perm', slot, owned: owns(it.key), on: INV.equip[slot] === it.key };
}
function cardButtons(it) {
  const st = itemState(it);
  const price = it.price ? `🪙 ${it.price}` : '免费';
  if (st.kind === 'use') {
    const ask = confirmKey === it.key;
    return `<div class="have">${st.have ? `背包里 ×${st.have}` : ''}</div>
      <div class="buy">${price}<button data-act="buy" class="${ask ? 'ask' : ''}">${ask ? '确定买？' : '买一个'}</button></div>`;
  }
  if (!st.owned) {
    const ask = confirmKey === it.key;
    return `<div class="buy">${price}<button data-act="buy" class="${ask ? 'ask' : ''}">${ask ? '确定买？' : '购买'}</button></div>`;
  }
  if (st.on) return `<div class="buy"><span class="own">✔ 已拥有</span>${['ship', 'skin'].includes(st.slot) ? '<button disabled>使用中</button>' : '<button data-act="off" class="off">卸下</button>'}</div>`;
  return `<div class="buy"><span class="own">✔ 已拥有</span><button data-act="on">${st.slot === 'ship' ? '换这艘' : st.slot === 'skin' ? '换上' : '戴上'}</button></div>`;
}
function renderShop() {
  const key = shopKey, items = itemsOf(key);
  const body = $('shopBody'), scroll = body.scrollTop;
  body.querySelectorAll('.shop-grid, .shop-h').forEach(e => e.remove());
  const html = GROUPS[key].map(([g, title]) => {
    const list = g === 'all' ? items : items.filter(i => i.kind === g);
    return (title ? `<h4 class="shop-h">${title}</h4>` : '') + `<div class="shop-grid">${list.map(it => {
      const st = itemState(it);
      return `<div class="item ${st.on ? 'on' : ''} ${preview === it.key ? 'sel' : ''}" data-key="${it.key}"><div class="ic">${it.icon}</div><div class="nm">${esc(it.name)}</div>
        ${it.group ? `<div class="tag">${esc(it.group)}</div>` : it.slot ? `<div class="tag">${SLOT_NAME[it.slot]}</div>` : ''}
        ${it.desc ? `<div class="ds">${esc(it.desc)}</div>` : ''}
        ${it.perks ? `<ul class="pk">${it.perks.map(p => `<li>${esc(p)}</li>`).join('')}</ul>` : ''}
        ${cardButtons(it)}</div>`;
    }).join('')}</div>`;
  }).join('');
  body.insertAdjacentHTML('beforeend', html);
  body.scrollTop = scroll;
  body.querySelectorAll('.item').forEach(el => {
    el.onclick = e => {
      const it = items.find(i => i.key === el.dataset.key), btn = e.target.closest('button[data-act]');
      if (btn) { onShopAction(it, btn.dataset.act); return; }
      showPreview(it);
    };
  });
}
function showPreview(it) {
  preview = it.key;
  if (shopKey === 'ship' && viewer) viewer.show(it.key);
  if (shopKey !== 'ship' && viewer) {
    const e = { ...INV.equip };
    if (shopKey === 'skin') e.skin = it.key;
    else if (it.kind === 'decor') e[it.slot] = it.key;
    viewer.show(e.skin, e);
  }
  $('shopBody').querySelectorAll('.item').forEach(x => x.classList.toggle('sel', x.dataset.key === it.key));
}
async function onShopAction(it, act) {
  if (busy) return;
  if (!ME) { const ok = await askLogin({ icon: '🐣', name: '菜鸟星球', color: '#ffb84d' }); if (!ok) return; await refreshMe(); renderShop(); return; }
  const slot = slotOf({ ...it, shop: shopKey });
  try {
    busy = true;
    if (act === 'buy') {
      if (confirmKey !== it.key) {                 // 第一次点：让小朋友确认一下
        confirmKey = it.key; clearTimeout(confirmT); confirmT = setTimeout(() => { confirmKey = null; shopOpen && renderShop(); }, 3500);
        renderShop(); return;
      }
      confirmKey = null;
      const r = await buy(it.key, 1);
      setCoins(r.coins); sfx.chime([784, 988, 1318]);
      if (it.kind === 'use') toast(syncBag(it.key) ? `${it.icon} 买好了！已经放进背包（按格子的数字两次就能用）` : `${it.icon} 买好了！不过九格背包满了，用掉一些东西就会放进去`);
      else { await equip(slot, it.key); applyEquip(slot); toast(slot === 'ship' ? `${it.icon} ${it.name} 是你的啦！回到宇宙就能开` : `${it.icon} ${it.name} 是你的啦！已经换上，右边「我的角色」里可以随时换`); }
      renderBag();
    } else if (act === 'on') { await equip(slot, it.key); applyEquip(slot); sfx.click(); }
    else if (act === 'off') { await equip(slot, null); applyEquip(slot); sfx.click(); }
    renderBag();
  } catch (e) { toast('😅 ' + e.message); }
  finally { busy = false; shopOpen && renderShop(); }
}
function applyEquip(slot) {
  if (slot === 'ship') return;                       // 飞船回到宇宙里才看得到
  applyLook();
  if (viewer && shopKey !== 'ship') viewer.show(INV.equip.skin, { ...INV.equip });
}
function openShop(key) {
  shopOpen = true; shopKey = key; preview = null; confirmKey = null; Object.keys(keys).forEach(k => keys[k] = false);
  const shop = SHOPS.find(s => s.key === key);
  const panel = $('shop'); panel.style.setProperty('--c', shop.color);
  $('shopTitle').textContent = shop.icon + ' ' + shop.name;
  $('shopBody').innerHTML = `<div class="${key === 'ship' ? 'ship-stage' : 'ship-stage av-stage'}" id="shipStage"><div class="stage-tip">${key === 'ship' ? '拖动可以旋转飞船 · 点卡片看看别的飞船' : '拖动可以转身 · 点卡片先试穿'}</div></div>`;
  renderShop();
  const loader = key === 'ship' ? import('../u/hangar.js').then(m => m.createShipViewer($('shipStage'))) : import('./stage.js').then(m => m.createAvatarStage($('shipStage')));
  loader.then(v => {
    if (!shopOpen || shopKey !== key) { v.dispose(); return; }
    viewer = v;
    if (key === 'ship') { v.show(INV.equip.ship || 'rookie'); preview = INV.equip.ship || 'rookie'; renderShop(); }
    else v.show(INV.equip.skin, { ...INV.equip });
  });
  panel.classList.add('show');
  sfx.chime([784, 988]);
}
function closeShop() { shopOpen = false; $('shop').classList.remove('show'); if (viewer) { viewer.dispose(); viewer = null; } }
$('shopClose').onclick = closeShop;

// ---------- 九格背包：按数字选中，再按一次同一个数字就使用 ----------
const BAG_N = 9;
let bag = Array(BAG_N).fill(null), bagSel = 0;
const bagKey = () => 'xcn_bag_' + (ME ? ME.user.id : 'guest');
function ownedForBag() {
  // 背包只放会用掉的道具；角色和装扮放在右边的「我的角色」框里，飞船在宇宙里用
  return itemsOf('prop').filter(i => i.kind === 'use' && (INV.have[i.key] || 0) > 0).map(i => i.key);
}
function syncBag(newKey) {
  try { const saved = JSON.parse(localStorage.getItem(bagKey()) || 'null'); if (Array.isArray(saved) && saved.length === BAG_N && !syncBag.loaded) { bag = saved; } } catch (e) {}
  syncBag.loaded = bagKey();
  const owned = ownedForBag();
  bag = bag.map(k => k && owned.includes(k) ? k : null);           // 用完 / 没有了 → 空出格子
  const order = newKey && owned.includes(newKey) ? [newKey, ...owned.filter(k => k !== newKey)] : owned;
  let full = false;
  order.forEach(k => { if (bag.includes(k)) return; const i = bag.indexOf(null); if (i < 0) { if (k === newKey) full = true; return; } bag[i] = k; });
  try { localStorage.setItem(bagKey(), JSON.stringify(bag)); } catch (e) {}
  renderBag();
  return !full;
}
function renderBag() {
  const el = $('bag'); if (!el) return;
  el.classList.toggle('show', !!ME);
  el.innerHTML = bag.map((k, i) => {
    const it = k && findItem(k);
    if (!it) return `<button class="slot empty ${i === bagSel ? 'sel' : ''}" data-i="${i}"><i>${i + 1}</i></button>`;
    const on = it.kind !== 'use' && INV.equip[slotOf(it)] === k;
    return `<button class="slot ${i === bagSel ? 'sel' : ''} ${on ? 'on' : ''}" data-i="${i}" title="${esc(it.name)}"><span class="e">${it.icon}</span>${it.kind === 'use' ? `<b>${INV.have[k]}</b>` : on ? '<b>✔</b>' : ''}<i>${i + 1}</i></button>`;
  }).join('');
  const cur = bag[bagSel] && findItem(bag[bagSel]);
  $('bagName').textContent = cur ? `${cur.icon} ${cur.name} · ${cur.kind === 'use' ? '再按一次使用' : INV.equip[slotOf(cur)] === cur.key ? '再按一次取下' : '再按一次穿戴'}` : '';
  el.querySelectorAll('.slot').forEach(b => b.onclick = () => pressSlot(+b.dataset.i));
  renderWard();
}

// ---------- 右边的「我的角色」框：买过的角色和装扮，点一下就换 ----------
let wardOpen = !isTouch;
function renderWard() {
  const el = $('ward'); if (!el) return;
  el.classList.toggle('show', !!ME);
  const skins = itemsOf('skin').filter(i => owns(i.key));
  const decor = itemsOf('prop').filter(i => i.kind === 'decor' && owns(i.key));
  const cell = (it, on) => `<button class="w ${on ? 'on' : ''}" data-k="${it.key}" title="${esc(it.name)}"><span>${it.icon}</span><em>${esc(it.name)}</em></button>`;
  el.innerHTML = `<button class="w-head" id="wardToggle">👕 我的角色 <b>${wardOpen ? '▾' : '▸'}</b></button>
    <div class="w-body" style="display:${wardOpen ? 'block' : 'none'}">
      <div class="w-grid">${skins.map(it => cell(it, INV.equip.skin === it.key)).join('')}</div>
      ${decor.length ? `<h5>🎀 装扮 <small>点一下戴上 / 取下</small></h5><div class="w-grid">${decor.map(it => cell(it, INV.equip[it.slot] === it.key)).join('')}</div>` : ''}
      ${skins.length < 2 && !decor.length ? '<p class="w-tip">在皮肤商店、道具商店买的角色和装扮会出现在这里</p>' : ''}
    </div>`;
  $('wardToggle').onclick = () => { wardOpen = !wardOpen; renderWard(); };
  el.querySelectorAll('.w[data-k]').forEach(b => b.onclick = () => wardPick(b.dataset.k));
}
async function wardPick(key) {
  if (busy) return;
  const it = findItem(key), slot = slotOf(it), on = INV.equip[slot] === key;
  if (slot === 'skin' && on) return;
  busy = true;
  try { await equip(slot, slot === 'skin' ? key : (on ? null : key)); applyLook(); sfx.click(); }
  catch (e) { toast('😅 ' + e.message); }
  finally { busy = false; renderBag(); }
}
let bagNameT = 0;
function pressSlot(i) {
  if (i < 0 || i >= BAG_N) return;
  if (i !== bagSel) { bagSel = i; renderBag(); flashBagName(); sfx.click(); return; }
  useBagItem(bag[i]);
}
function flashBagName() { const n = $('bagName'); n.classList.add('show'); clearTimeout(bagNameT); bagNameT = setTimeout(() => n.classList.remove('show'), 2200); }
async function useBagItem(key) {
  if (!key) return;
  const it = findItem(key);
  if (it.kind === 'use') return usePropKey(key);
  if (busy) return;
  const slot = slotOf(it), on = INV.equip[slot] === key;
  busy = true;
  try { await equip(slot, on ? (slot === 'skin' ? 'explorer' : null) : key); applyLook(); sfx.click(); toast(`${it.icon} ${on ? '取下了' : '换上了'} ${it.name}`); }
  catch (e) { toast('😅 ' + e.message); }
  finally { busy = false; renderBag(); }
}
const renderProps = () => syncBag();
async function usePropKey(key) {
  if (shopOpen || player.riding || player.kart || player.bumper || busy) return;
  const it = findItem(key); const ok = abil.canUse(key);
  if (ok !== true) { toast(ok); return; }
  busy = true;
  try {
    await useItem(key);
    const data = abil.start(key);
    mp && mp.usedProp(key, data);
    toast(`${it.icon} ${it.name}${DURATION[key] ? ` · ${DURATION[key]} 秒` : ''}`);
  }
  catch (e) { toast('😅 ' + e.message); }
  finally { busy = false; syncBag(); }
}
const FX_ICON = { snow: '❄️ 变慢', jetpack: '🎒', copter: '🚁', balloon: '🎈', spring: '👟', skate: '🛹', grow: '🍄', shrink: '🧪', bubble: '🫧', unicorn: '🦄', 'unicorn-cd': '🦄💤' };
let fxShown = '';
function renderFx() {
  const st = abil.status(), html = st.map(s => `<span>${FX_ICON[s.key] || '✨'} ${Math.ceil(s.left)}s</span>`).join('');
  if (html !== fxShown) { fxShown = html; $('fxBar').innerHTML = html; }
}

// ---------- 离开：回宇宙从菜鸟星球起飞 ----------
function leave(next) {
  $('flash').classList.add('on'); sfx.whoosh(1, false);
  setTimeout(() => location.href = 'index.html?takeoff=plaza' + (next ? '&next=' + next : ''), 380);
}

// ---------- 底部栏 ----------
async function buildDock() {
  const planets = await loadPlanets();
  const dock = $('dock');
  planets.forEach(p => {
    const b = document.createElement('button'); b.style.setProperty('--c', p.color);
    b.innerHTML = `<span class="e">${p.icon}</span>${esc(p.name)}`;
    if (p.kind === 'plaza') { b.classList.add('active'); $('where').textContent = '· ' + p.name; }
    else b.onclick = () => leave(p.kind);
    dock.appendChild(b);
  });
  const sep = document.createElement('div'); sep.className = 'sep'; dock.appendChild(sep);
  const t = document.createElement('button'); t.className = 'takeoff ready'; t.innerHTML = '<span class="e">🚀</span>起飞';
  t.onclick = () => leave(); dock.appendChild(t);
}

// 静音
const muteBtn = $('mute');
const paintMute = () => muteBtn.textContent = sfx.isMuted() ? '🔇' : '🔊';
muteBtn.onclick = () => { sfx.setMuted(!sfx.isMuted()); paintMute(); }; paintMute();

// ---------- 主循环 ----------
const WALK = 7.5, RUN = 12, GRAV = 26, JUMP = 9.5;
const tmp = new THREE.Vector3(), seatPos = new THREE.Vector3(), seatQ = new THREE.Quaternion(), fwdV = new THREE.Vector3();
const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), upV = new THREE.Vector3();
let last = performance.now(), t = 0;

function tick() {
  const now = performance.now(), dt = Math.min((now - last) / 1000, .05); last = now; t += dt;
  world.update(dt, t);
  // 白天 / 晚上、钟楼、烟花秀
  const DI = dayNight.update(dt, camera.position, inMansion || !!(player.riding && player.riding.dark) || !!(player.kart && K.tunnel));
  clock.update(DI);
  fireShow && fireShow.update(DI);
  stallsOpen = DI.phase === 'day' || DI.phase === 'sunrise';
  queues.update(dt);
  updateDnChip(DI);

  if (player.riding) {
    const r = player.riding;
    r.seat.getWorldPosition(seatPos); r.seat.getWorldQuaternion(seatQ);
    me.root.position.copy(seatPos).y -= .62; me.root.quaternion.copy(seatQ);
    me.animate(dt, 0, false, true);
    if (r.done()) {
      leaveRide();                                    // 自动结束：这一帧到此为止，不能再把人物藏起来
    } else if (r.view === 'pov') {
      // 第一人称：相机就在座位上方（人物眼睛的位置），沿着车头方向看
      me.root.visible = false;
      fwdV.set(0, 0, 1).applyQuaternion(seatQ); upV.set(0, 1, 0).applyQuaternion(seatQ);
      camera.position.copy(seatPos).addScaledVector(upV, 1.5).addScaledVector(fwdV, .2);
      camera.up.copy(upV);
      camera.lookAt(camLook.copy(camera.position).addScaledVector(fwdV, 10));
    } else {
      if (r.camOutFrom) cam.yaw = Math.atan2(r.camOutFrom[0] - seatPos.x, r.camOutFrom[1] - seatPos.z);
      camPos.set(seatPos.x - Math.sin(cam.yaw) * cam.dist * Math.cos(cam.pitch), seatPos.y + 1.5 + Math.sin(cam.pitch) * cam.dist, seatPos.z - Math.cos(cam.yaw) * cam.dist * Math.cos(cam.pitch));
      camera.position.lerp(camPos, Math.min(1, dt * 6)); camera.lookAt(seatPos.x, seatPos.y + 1.2, seatPos.z);
    }
    if (player.riding) { promptEl.textContent = '🎢 到站会自动下来'; promptEl.classList.add('show'); $('actBtn').classList.remove('show'); }
  } else if (player.stall) {
    me.root.visible = false;
    const r = stallGame.update(dt, keys);
    if (r && stallGame.kind === 'balloon') { const a = r.aim, el = $('aimDot'); el.classList.add('on'); el.style.left = ((a.x + 1) / 2 * innerWidth) + 'px'; el.style.top = ((1 - a.y) / 2 * innerHeight) + 'px'; } else $('aimDot').classList.remove('on');
    promptEl.classList.remove('show'); $('actBtn').textContent = '离开'; $('actBtn').classList.add('show');
    myMove = { speed: 0 };
  } else if (player.bumper) {
    bumperTick(dt, t);
  } else if (player.kart) {
    kartTick(dt, t);
    tickSplashes(dt);
  } else {
    if (!me.rig.shadow.visible) me.rig.shadow.visible = true;
    // 不在设施上时，人物一定要看得见、相机一定是正的
    if (!me.root.visible && !inMansion) me.root.visible = true;
    if (camera.up.y !== 1) camera.up.set(0, 1, 0);
    // 移动：相对相机方向
    let mx = 0, my = 0;
    if (!shopOpen) {
      if (keys.KeyW || keys.ArrowUp) my += 1;
      if (keys.KeyS || keys.ArrowDown) my -= 1;
      if (keys.KeyA || keys.ArrowLeft) mx -= 1;
      if (keys.KeyD || keys.ArrowRight) mx += 1;
      if (joy.id !== null) { mx = joy.x; my = joy.y; }
      if (pq.queue) { mx = my = 0; }
      // 在鬼屋里是第一人称：左右键 / 摇杆左右 = 转身，不是横着走
      if (inMansion) { cam.yaw -= mx * dt * 2.3; mx = 0; }
    }
    const len = Math.hypot(mx, my); if (len > 1) { mx /= len; my /= len; }
    const mod = abil.step(dt, t, { up: keys.Space, down: keys.ShiftLeft || keys.ShiftRight, jumpHeld: keys.Space, moving: len > .05, fx: INV.equip.fx });
    const running = (keys.ShiftLeft || keys.ShiftRight) && !abil.flying;
    const speed = (running ? RUN : WALK) * Math.min(1, len) * mod.speedMul;
    const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw);
    const vx = (fx * my - fz * mx) * speed, vz = (fz * my + fx * mx) * speed;
    player.pos.x += vx * dt; player.pos.z += vz * dt;
    if (len > .05) {
      const want = Math.atan2(vx, vz);
      let d = want - player.face; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      player.face += d * Math.min(1, dt * 12);
      if (my > .3 && !drag) { let dy = player.face - cam.yaw; while (dy > Math.PI) dy -= Math.PI * 2; while (dy < -Math.PI) dy += Math.PI * 2; cam.yaw += dy * dt * 1.2; }
    }
    // 跳跃 / 重力
    if (mod.gravity) {
      if ((keys.Space) && player.ground && !shopOpen) { player.vy = JUMP * mod.jumpMul * (me.skin === 'bunny' ? 1.22 : 1); player.ground = false; }   // 兔子跳得高一点
      player.vy -= GRAV * dt; player.pos.y += player.vy * dt;
      if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.ground = true; }
    }
    // 鬼屋的墙
    if (world.mansion.near(player.pos.x, player.pos.z)) world.mansion.collide(player.pos, .45 * mod.scale);
    // 碰撞：圆形障碍物 + 岛边缘
    world.colliders.forEach(c => {
      if (player.pos.y > 7 || (c.queueArea && (pq.queue || pq.boarding)) || (pq.boarding && pq.boarding.ride.colliders && pq.boarding.ride.colliders.includes(c))) return;                       // 飞得够高就越过障碍物
      const pr = .55 * mod.scale;
      if (c.box) {
        // 长方形障碍物：换到它自己的坐标里，推到最近的那条边外面
        const [bx, bz, hw, hl, yaw] = c.box, co = Math.cos(yaw), si = Math.sin(yaw);
        const dx = player.pos.x - bx, dz = player.pos.z - bz;
        let lx = dx * co - dz * si, lz = dx * si + dz * co;
        const ox = hw + pr - Math.abs(lx), oz = hl + pr - Math.abs(lz);
        if (ox > 0 && oz > 0) {
          if (ox < oz) lx = Math.sign(lx || 1) * (hw + pr); else lz = Math.sign(lz || 1) * (hl + pr);
          player.pos.x = bx + lx * co + lz * si; player.pos.z = bz - lx * si + lz * co;
        }
        return;
      }
      const [cx, cz, cr] = c;
      const dx = player.pos.x - cx, dz = player.pos.z - cz, d = Math.hypot(dx, dz), min = cr + pr;
      if (d < min && d > 1e-4) { player.pos.x = cx + dx / d * min; player.pos.z = cz + dz / d * min; }
    });
    clampIsland(player.pos, 2.5 * mod.scale);
    // 传送门：走进去就传送（乐园 ⇄ 卡丁车岛）
    for (const pt of world.portals) if (Math.hypot(player.pos.x - pt.pos[0], player.pos.z - pt.pos[1]) < pt.r && !portalCD) {
      portalCD = 1.5; $('flash').classList.add('on'); sfx.whoosh(.8, true);
      setTimeout(() => { player.pos.set(pt.to.x, 0, pt.to.z); player.face = cam.yaw = pt.to.yaw; petPos.copy(player.pos); camera.position.set(pt.to.x - Math.sin(pt.to.yaw) * 10, 6, pt.to.z - Math.cos(pt.to.yaw) * 10); $('flash').classList.remove('on'); banner(pt.label, 2500); }, 300);
    }
    if (portalCD > 0) portalCD = Math.max(0, portalCD - dt);

    me.root.position.copy(player.pos); me.root.position.y += mod.lift * mod.scale; me.root.rotation.set(0, player.face, 0);
    me.rig.shadow.position.y = (.02 - player.pos.y - mod.lift * mod.scale) / mod.scale; me.rig.shadow.material.opacity = .25 / (1 + player.pos.y * .3);
    if (pq.queue) player.face = pq.face;
    me.root.rotation.y = player.face;
    me.animate(dt, pq.queue ? Math.min(1, pq.speed / WALK) : Math.min(1, speed / WALK), !player.ground, false, mod.pose);
    myMove = { speed: Math.min(1, speed / WALK) * (len > .05 ? 1 : 0), pose: mod.pose, uniFly: abil.flying && me.skin === 'unicorn' && mod.pose === 'fly' };
    if (pet) {
      const back = new THREE.Vector3(Math.sin(player.face), 0, Math.cos(player.face)).multiplyScalar(-.7 * mod.scale);
      const want = tmp.set(player.pos.x + back.x + Math.cos(player.face) * 1.5 * mod.scale, 0, player.pos.z + back.z - Math.sin(player.face) * 1.5 * mod.scale);
      const d = want.distanceTo(petPos), moving = d > .25;
      if (d > 30) petPos.copy(want);
      else if (moving) { const step = Math.min(d, dt * Math.max(4, d * 3)); const dir = want.clone().sub(petPos).normalize(); petPos.addScaledVector(dir, step); pet.group.rotation.y = Math.atan2(dir.x, dir.z); }
      pet.group.position.copy(petPos); pet.update(dt, t, moving);
    }
    renderFx();

    camLook.set(player.pos.x, player.pos.y + 2 * mod.scale, player.pos.z);
    // 抬头：pitch < 0 时相机降到人物身后低处、离得近一点，并且往天上看
    const up = Math.max(0, -cam.pitch);
    const cd = cam.dist * (.55 + mod.scale * .45) * (1 - up * .45);
    const pv = Math.max(cam.pitch, -.12);
    camPos.set(camLook.x - Math.sin(cam.yaw) * cd * Math.cos(pv), camLook.y + Math.sin(pv) * cd, camLook.z - Math.cos(cam.yaw) * cd * Math.cos(pv));
    camPos.y = Math.max(camPos.y, .5);
    const nowIn = world.mansion.inside(player.pos.x, player.pos.z);
    if (nowIn !== inMansion) setMansion(nowIn);
    if (inMansion) {
      // 第一人称：眼睛的位置，往看的方向看（上下拖可以抬头低头一点）
      const eye = 1.55 * mod.scale, lookDown = THREE.MathUtils.clamp(cam.pitch - .32, -.6, .6);
      camera.position.set(player.pos.x, player.pos.y + eye, player.pos.z);
      camera.lookAt(player.pos.x + Math.sin(cam.yaw), player.pos.y + eye - Math.tan(lookDown), player.pos.z + Math.cos(cam.yaw));
      const res = world.mansion.update(dt, t, player.pos, cam.yaw);
      flashLight.position.copy(camera.position).add(new THREE.Vector3(Math.sin(cam.yaw) * .6, -.2, Math.cos(cam.yaw) * .6));
      flashLight.intensity = 4.2 * res.flashlight;
      // 脚步声
      if (len > .05 && player.ground) { stepT -= dt * (speed / WALK); if (stepT <= 0) { stepT = .45; sfx.step(); } } else stepT = 0;
    } else {
      camera.position.lerp(camPos, Math.min(1, dt * 8));
      camera.lookAt(camLook.x, camLook.y + Math.tan(Math.min(up, 1.0) * 1.25) * cd, camLook.z);
    }

    near = shopOpen ? null : findNear();
    const txt = isTouch ? promptText(near).replace(/按 E ?/, '点按钮') : promptText(near);
    const seatNear = pq.boarding ? boardingTick(dt) : (seatArrow.visible = false, null);
    if (pq.boarding) { promptEl.textContent = seatNear ? `💺 ${isTouch ? '点按钮' : '按 E'}坐上去！` : `🎟️ 轮到你啦！跟着黄色箭头找个空位${pq.boarding.ride.left != null ? `（还有 ${Math.ceil(pq.boarding.ride.left)} 秒）` : ''}`; promptEl.classList.add('show'); $('actBtn').textContent = '坐上去'; $('actBtn').classList.toggle('show', !!seatNear); }
    else if (pq.queue) { const n = queues.position(pq); const r = pq.queue.ride; const tx2 = n > 0 ? `⏳ 排队中：前面还有 ${n} 人 · ${isTouch ? '点按钮' : '按 E'}离开队伍` : (r.canBoard && r.canBoard() ? '⏳ 马上就到你啦！' : `⏳ 你是第一个！等${r.name}这一轮结束就能上`);
      promptEl.textContent = tx2; promptEl.classList.add('show'); $('actBtn').textContent = '离开队伍'; $('actBtn').classList.add('show'); }
    else { promptEl.textContent = txt; promptEl.classList.toggle('show', !!txt); }
    const act = $('actBtn');
    if (!pq.queue && !pq.boarding) act.classList.toggle('show', !!near && near.type !== 'mansion');
    if (!pq.queue && !pq.boarding && near && near.type !== 'mansion') act.textContent = near.type === 'shop' ? '进入' : near.type === 'gate' ? '起飞' : near.type === 'kart' ? '开车' : near.type === 'queue' ? '排队' : near.type === 'stall' ? '开始玩' : near.type === 'npc' ? '说话' : '';
  }

  { const onK = Math.hypot(player.pos.x - world.KI.x, player.pos.z - world.KI.z) < world.KI.R + 60; world.kart.group.visible = onK; }     // 看不见的岛就不画
  npcs && npcs.update(dt);
  if (chatNpc && chatNpc.pos.distanceTo(player.pos) > 9) closeChat();
  mp && mp.update(dt, t, player.riding ? { speed: 0, ride: [player.riding.rideIdx, player.riding.seatIndex ?? 0] } : myMove);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

let ME = null, mp = null, myMove = { speed: 0 };
// 左上角的小时钟 + 大横幅提示
const fireShow = createFireShow({ abil, banner, music: on => sfx.showMusic && sfx.showMusic(on) });
let bannerT = 0, chipSig = '';
function banner(msg, ms = 4000) { const el = $('dnBanner'); el.textContent = msg; el.classList.add('show'); clearTimeout(bannerT); bannerT = setTimeout(() => el.classList.remove('show'), ms); }
// ---------- 乐园时间：管理员可以给所有人一起切换（存在 shop_items 里一条隐藏记录 __park_time，价格字段 = 偏移秒数） ----------
const TIME_KEY = '__park_time';
async function loadGlobalTime() {
  try {
    const { data } = await getSupabase().from('shop_items').select('price').eq('key', TIME_KEY).maybeSingle();
    setGlobalOffset(data ? data.price : 0);
  } catch (e) {}
}
setInterval(loadGlobalTime, 20000);                    // 每 20 秒同步一次（管理员改了会马上广播，这里是保险）
async function saveGlobalTime(offset) {
  const { error } = await getSupabase().from('shop_items').upsert({ key: TIME_KEY, kind: 'prop', name: '乐园时间（系统用，勿删）', price: offset, consumable: false, is_active: false, sort_order: 9999 });
  if (error) { toast('😅 保存失败：' + error.message); return false; }
  setGlobalOffset(offset);
  mp && mp.net && mp.net.send('time', { o: offset });    // 通知在线的人马上切换
  return true;
}

// 管理员的「测试时间」面板：上面一组只改自己看到的；下面一组所有人一起切换
function setupTimeTest() {
  const el = $('timeTest'); if (!el) return;
  const isAdmin = ME && (ME.profile.role === 'admin' || ME.profile.is_admin);
  el.classList.toggle('show', !!isAdmin);
  if (!isAdmin || el.dataset.ready) return; el.dataset.ready = 1;
  const N0 = T_DAY + T_SUNSET, S0 = N0 + SHOW_START;
  const opts = [['🌇 日落', T_DAY - 3], ['🌙 刚天黑', N0], ['⏱ 烟花秀前 10 秒', S0 - 10], ['🎆 烟花秀开始', S0], ['💥 大结局', S0 + 148], ['🐣 结尾小菜鸟', S0 + SHOW_LEN - 8], ['🌅 日出', DAY_LEN - 90 - 3], ['☀️ 白天', 60]];
  const allOpts = [['🌙 天黑（1 分钟后烟花秀）', N0], ['⏱ 烟花秀前 10 秒', S0 - 10], ['🎆 马上开始烟花秀', S0], ['🌇 日落', T_DAY - 3], ['☀️ 天亮', 60]];
  el.innerHTML = `<button class="tt-head">⏱ 测试时间</button><div class="tt-body">
    <h6>👤 只改我自己看到的</h6>
    ${opts.map(([n, s]) => `<button data-s="${s}">${n}</button>`).join('')}<button data-s="" class="tt-reset">↩ 我这边恢复</button>
    <h6 class="all">🌍 所有人一起切换</h6><p>在线的人会马上一起变；刷新页面也保持</p>
    ${allOpts.map(([n, s]) => `<button data-a="${s}" class="all">${n}</button>`).join('')}<button data-a="" class="tt-reset">↩ 所有人恢复正常时间</button></div>`;
  el.querySelector('.tt-head').onclick = () => el.classList.toggle('open');
  el.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { el.classList.remove('open'); jumpTo(b.dataset.s === '' ? null : +b.dataset.s); el.classList.toggle('shifted', isShifted()); toast(b.dataset.s === '' ? '已恢复正常时间' : '⏱ 我这边跳到：' + b.textContent); });
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = async () => {
    const all = b.dataset.a === '' ? null : +b.dataset.a;
    if (!confirm(all == null ? '让所有人恢复正常时间？' : `让所有人一起切换到「${b.textContent}」？\n正在玩的小朋友都会看到。`)) return;
    el.classList.remove('open'); jumpTo(null); el.classList.remove('shifted');
    if (await saveGlobalTime(all == null ? 0 : offsetFor(all))) toast(all == null ? '🌍 所有人已恢复正常时间' : '🌍 所有人已切换到：' + b.textContent);
  });
}
function updateDnChip(I) {
  const T = clockText(I), sig = T.icon + T.title + T.line + T.big;
  if (sig === chipSig) return; chipSig = sig;
  const el = $('dnChip'); el.innerHTML = `<span>${T.icon}</span> ${T.title} · ${T.line} <b>${T.big}</b>`; el.classList.toggle('hot', !!T.hot);
}
function setCoins(n) { $('coinNum').textContent = n == null ? '--' : n; $('loginBtn').hidden = !!ME; }
$('loginBtn').onclick = async () => {
  const ok = await askLogin(null);
  if (!ok) return;
  await refreshMe();
  if (ME) toast(`👋 欢迎回来，${ME.profile.username || '小菜鸟'}！`);
};
async function refreshMe() {
  ME = await loadMe();
  await loadInventory(ME && ME.user.id);
  setCoins(ME ? (ME.profile.coins || 0) : null);
  syncBag.loaded = null; bag = Array(BAG_N).fill(null);
  applyLook(); syncBag(); setupTimeTest(); loadGlobalTime();
  if (!mp) mp = createParkMP({ scene, camera, player, onTime: o => setGlobalOffset(o), getSeat: (ri, si) => { const r = world.rides[ri]; return r && r.seats && r.seats[si]; }, getMe: () => ME, getLook: () => ({ ...INV.equip }), getAvatar: () => me, abil, toast, sfx });
  mp.connect();
}

async function boot() {
  if (isTouch) $('hint').textContent = '左下摇杆走路 · 拖动屏幕转视角（往上拖可以抬头看天） · 走到设施和商店门口点按钮';
  buildDock();
  await refreshMe();
  setLoad(90);
  camera.position.set(0, 6, 92); camera.lookAt(0, 2, 70);
  tick();
  setTimeout(() => $('hint').style.opacity = 0, 9000);
  setLoad(100);
  setTimeout(() => { const l = $('loading'); l.style.opacity = 0; setTimeout(() => l.remove(), 500); $('flash').classList.remove('on'); }, 250);
  // 从星门里走出来
  const t0 = performance.now();
  (function stepOut() { const k = (performance.now() - t0) / 900; if (k < 1) { player.pos.z = 80 - k * 7; requestAnimationFrame(stepOut); } })();
  if (!ME) {
    const ok = await askLogin({ icon: '🐣', name: '菜鸟星球', color: '#ffb84d' });
    if (!ok) { leave(); return; }
    await refreshMe();
  }
}
boot();
window.__park = { queues, pq, stallGame, exitStall, get npcs() { return npcs; }, K, kartTick, renderer, startKart, stopKart, player, world, cam, action, INV, abil, openShop, usePropKey, refreshMe, pressSlot, get bag() { return bag; }, get mp() { return mp; }, get me() { return me; }, get near() { return near; } };
