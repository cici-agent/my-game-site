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
  if (shopOpen) { if (e.code === 'Escape') closeShop(); return; }
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'KeyE' && !e.repeat) action();
  if (e.code === 'Space' && !e.repeat) abil.onJumpPress();
  const dn = /^Digit([1-9])$/.exec(e.code); if (dn && !e.repeat) pressSlot(+dn[1] - 1);
  if (e.code === 'Escape' && player.riding) leaveRide();
});
addEventListener('keyup', e => keys[e.code] = false);

// 拖动屏幕转视角（鼠标左键 / 单指）
let drag = null;
renderer.domElement.addEventListener('pointerdown', e => { sfx.unlock(); drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointermove', e => {
  if (!drag || drag.id !== e.pointerId) return;
  cam.yaw -= (e.clientX - drag.x) * .006; cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - drag.y) * .004, -1.05, 1.1);   // 往上拖到底 = 抬头看天
  drag.x = e.clientX; drag.y = e.clientY;
});
renderer.domElement.addEventListener('pointerup', () => drag = null);
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
  return best;
}
function promptText(it) {
  if (!it) return '';
  if (it.type === 'ride') return `${it.ride.icon} ${it.ride.status(queued === it.ride)}`;
  if (it.type === 'shop') return `${it.shop.icon} 按 E 进入${it.shop.name}`;
  if (it.type === 'gate') return '🚀 按 E 起飞离开菜鸟星球';
  if (it.type === 'kart') return '🏎️ 按 E 开卡丁车';
  return '';
}
function action() {
  if (player.riding) { leaveRide(); return; }
  if (player.kart) { stopKart(); return; }
  if (!near) return;
  if (near.type === 'kart') { startKart(); return; }
  if (near.type === 'ride') {
    if (near.ride.canBoard && !near.ride.canBoard()) { queued = near.ride; return; }   // 排队，回站自动上车
    boardRide(near.ride);
  } else if (near.type === 'shop') openShop(near.shop.key);
  else if (near.type === 'gate') leave();
}
function boardRide(rideObj) {
  queued = null;
  const rideIdx = world.rides.indexOf(rideObj);
  rideObj.playerPos = [player.pos.x, player.pos.z];
  const ride = rideObj.board(mp ? mp.takenSeats(rideIdx) : []);
  ride.rideIdx = rideIdx;
  ride.prevCam = { ...cam };
  player.riding = ride; player.vy = 0; sfx.chime([523, 659, 784]);
  if (ride.camDist) cam.dist = ride.camDist;
  if (ride.camYaw !== undefined) cam.yaw = ride.camYaw;
  if (ride.camPitch !== undefined) cam.pitch = ride.camPitch;
}
// ---------- 卡丁车 ----------
let kartObj = null;
const K = { speed: 0, heading: 0, steer: 0, started: false, lap: 0, lapStart: 0, best: null, lastS: 0, cp: false, last: null };
function startKart() {
  if (abil.flying) { toast('先落地再开卡丁车哦'); return; }
  const k = world.kart;
  kartObj = buildKart(kartColorOf(ME ? ME.user.id : 'me')); scene.add(kartObj.group);
  player.kart = true; player.vy = 0; player.ground = true;
  player.pos.set(k.start.x, 0, k.start.z); player.face = K.heading = k.start.heading;
  Object.assign(K, { speed: 0, steer: 0, started: false, lap: 0, lastS: k.track(player.pos.x, player.pos.z).s, cp: false, last: null });
  cam.yaw = K.heading; cam.pitch = .25;
  if (pet) pet.group.visible = false;
  $('kartHud').classList.add('show'); document.body.classList.add('karting'); renderKartHud(0);
  sfx.chime([523, 784, 1046]); sfx.unlock();
  toast(isTouch ? '🏎️ 摇杆往上加速、左右转弯 · 点「下车」离开' : '🏎️ W 加速 · S 刹车 / 倒车 · A D 转弯 · 按 E 下车');
}
function stopKart() {
  if (!kartObj) return;
  scene.remove(kartObj.group); kartObj = null; player.kart = false;
  const e = world.kart.entry; player.pos.set(e[0] + 1.5, 0, e[1]);
  me.root.rotation.set(0, player.face, 0); me.root.visible = true;
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
function kartTick(dt, t) {
  const k = world.kart;
  let thr = 0, st = 0;
  if (keys.KeyW || keys.ArrowUp) thr += 1;
  if (keys.KeyS || keys.ArrowDown) thr -= 1;
  if (keys.KeyA || keys.ArrowLeft) st += 1;
  if (keys.KeyD || keys.ArrowRight) st -= 1;
  if (joy.id !== null) { thr = Math.abs(joy.y) > .15 ? joy.y : 0; st = -joy.x; }
  const T = k.track(player.pos.x, player.pos.z);
  const onRoad = T.off < k.W / 2 + .3, maxV = onRoad ? 17 : 6.5;
  K.speed += thr * (thr * K.speed < 0 ? 22 : thr > 0 ? 11 : 8) * dt;       // 反方向按 = 刹车（更快）
  K.speed -= K.speed * (onRoad ? .3 : 1.4) * dt;                          // 空气阻力 / 草地更慢
  if (!thr) K.speed -= Math.sign(K.speed) * Math.min(Math.abs(K.speed), 2.5 * dt);
  if (K.speed > maxV) K.speed += (maxV - K.speed) * Math.min(1, dt * 3);
  K.speed = Math.max(-5, K.speed);
  K.steer += (st - K.steer) * Math.min(1, dt * 8);
  K.heading += K.steer * dt * 2.1 * THREE.MathUtils.clamp(K.speed / 7, -1, 1);
  player.pos.x += Math.sin(K.heading) * K.speed * dt; player.pos.z += Math.cos(K.heading) * K.speed * dt;
  // 不能开出赛道太远：推回来并减速
  const T2 = k.track(player.pos.x, player.pos.z), lim = k.W / 2 + 2.6;
  if (T2.off > lim) { const f = (T2.off - lim) / T2.off; player.pos.x += (T2.cx - player.pos.x) * f; player.pos.z += (T2.cz - player.pos.z) * f; K.speed *= .6; }
  player.face = K.heading;
  // 计圈：开过起点线（s 从接近 1 变到接近 0）；中途要经过对面（防止倒着开刷圈）
  const s = T2.s;
  if (s > .4 && s < .6) K.cp = true;
  if (K.lastS > .85 && s < .15) {
    if (!K.started) { K.started = true; K.lapStart = t; K.cp = false; banner('🏁 开始计时！', 1500); }
    else if (K.cp) {
      const lapT = t - K.lapStart, best = K.best == null || lapT < K.best;
      if (best) K.best = lapT;
      K.lap++; K.lapStart = t; K.cp = false;
      banner(`🏁 第 ${K.lap} 圈：${fmtLap(lapT)}${best ? '  ⭐ 最快！' : ''}`, 2500); sfx.chime(best ? [784, 988, 1318, 1568] : [784, 988]);
    }
  }
  if (K.lastS < .15 && s > .85) K.cp = false;             // 倒着开过线不算
  K.lastS = s;
  // 小车和人
  kartObj.group.position.copy(player.pos); kartObj.group.rotation.y = K.heading; kartObj.update(dt, K.speed, K.steer);
  kartObj.seat.getWorldPosition(kartSeat);
  me.root.position.copy(kartSeat).y -= .62; me.root.rotation.set(0, K.heading, 0); me.root.scale.setScalar(1);
  me.rig.shadow.visible = false;
  me.animate(dt, 0, false, true);
  sfx.engineLevel(.25 + Math.abs(K.speed) / 17 * .9);
  // 追尾视角
  const fx = Math.sin(K.heading), fz = Math.cos(K.heading);
  camPos.set(player.pos.x - fx * 8, 3.8, player.pos.z - fz * 8);
  camera.position.lerp(camPos, Math.min(1, dt * 5));
  camera.lookAt(player.pos.x + fx * 4, 1.2, player.pos.z + fz * 4);
  if (Math.floor(t * 10) !== K.last) { K.last = Math.floor(t * 10); renderKartHud(t); }
  promptEl.textContent = isTouch ? '点「下车」离开' : '按 E 下车'; promptEl.classList.add('show');
  $('actBtn').textContent = '下车'; $('actBtn').classList.add('show');
  myMove = { speed: Math.abs(K.speed) / 17, kart: true };
}

function leaveRide() {
  const r = player.riding; if (!r) return;
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
  if (shopOpen || player.riding || player.kart || busy) return;
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
  const DI = dayNight.update(dt, camera.position);
  clock.update(DI);
  fireShow && fireShow.update(DI);
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
    if (player.riding) { promptEl.textContent = isTouch ? '点「下来」离开' : '按 E 下来'; promptEl.classList.add('show'); $('actBtn').textContent = '下来'; $('actBtn').classList.add('show'); }
  } else if (player.kart) {
    kartTick(dt, t);
  } else {
    if (!me.rig.shadow.visible) me.rig.shadow.visible = true;
    // 不在设施上时，人物一定要看得见、相机一定是正的
    if (!me.root.visible) me.root.visible = true;
    if (camera.up.y !== 1) camera.up.set(0, 1, 0);
    // 移动：相对相机方向
    let mx = 0, my = 0;
    if (!shopOpen) {
      if (keys.KeyW || keys.ArrowUp) my += 1;
      if (keys.KeyS || keys.ArrowDown) my -= 1;
      if (keys.KeyA || keys.ArrowLeft) mx -= 1;
      if (keys.KeyD || keys.ArrowRight) mx += 1;
      if (joy.id !== null) { mx = joy.x; my = joy.y; }
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
    // 碰撞：圆形障碍物 + 岛边缘
    world.colliders.forEach(c => {
      if (player.pos.y > 7) return;                       // 飞得够高就越过障碍物
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
    const R = Math.hypot(player.pos.x, player.pos.z), maxR = ISLAND_R - 2.5 * mod.scale;
    if (R > maxR) { player.pos.x *= maxR / R; player.pos.z *= maxR / R; }

    me.root.position.copy(player.pos); me.root.position.y += mod.lift * mod.scale; me.root.rotation.set(0, player.face, 0);
    me.rig.shadow.position.y = (.02 - player.pos.y - mod.lift * mod.scale) / mod.scale; me.rig.shadow.material.opacity = .25 / (1 + player.pos.y * .3);
    me.animate(dt, Math.min(1, speed / WALK), !player.ground, false, mod.pose);
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
    camera.position.lerp(camPos, Math.min(1, dt * 8));
    camera.lookAt(camLook.x, camLook.y + Math.tan(Math.min(up, 1.0) * 1.25) * cd, camLook.z);

    near = shopOpen ? null : findNear();
    if (queued && (!near || near.ride !== queued)) queued = null;          // 走开就取消排队
    else if (queued && queued.canBoard()) boardRide(queued);
    const txt = isTouch ? promptText(near).replace(/按 E ?/, '点按钮') : promptText(near);
    promptEl.textContent = txt; promptEl.classList.toggle('show', !!txt);
    const act = $('actBtn');
    act.classList.toggle('show', !!near);
    if (near) act.textContent = near.type === 'shop' ? '进入' : near.type === 'gate' ? '起飞' : near.type === 'kart' ? '开车' : (near.ride.canBoard && !near.ride.canBoard() ? (queued ? '排队中' : '排队') : '乘坐');
  }

  mp && mp.update(dt, t, player.riding ? { speed: 0, ride: [player.riding.rideIdx, player.riding.seatIndex ?? 0] } : myMove);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

let ME = null, mp = null, myMove = { speed: 0 };
// 左上角的小时钟 + 大横幅提示
const fireShow = createFireShow({ abil, banner });
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
window.__park = { K, startKart, stopKart, player, world, cam, action, INV, abil, openShop, usePropKey, refreshMe, pressSlot, get bag() { return bag; }, get mp() { return mp; }, get me() { return me; }, get near() { return near; } };
