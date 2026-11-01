// ===== 菜鸟星球游乐园：主程序 =====
import * as THREE from 'three';
import { buildWorld, ISLAND_R, SHOPS } from './world.js';
import { buildAvatar, buildPet } from './avatar.js';
import { INV, loadInventory, itemsOf, findItem, slotOf, owns, buy, equip, useItem } from './inventory.js';
import { createAbilities, DURATION } from './abilities.js';
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
scene.add(new THREE.HemisphereLight(0xfff4e0, 0x6b8f3e, 1.3));
const sunL = new THREE.DirectionalLight(0xffffff, 1.8); sunL.position.set(60, 120, 40); scene.add(sunL);
setLoad(20);

const world = buildWorld(scene);
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
  const dn = /^Digit([0-9])$/.exec(e.code); if (dn && !e.repeat) usePropAt((+dn[1] + 9) % 10);
  if (e.code === 'Escape' && player.riding) leaveRide();
});
addEventListener('keyup', e => keys[e.code] = false);

// 拖动屏幕转视角（鼠标左键 / 单指）
let drag = null;
renderer.domElement.addEventListener('pointerdown', e => { sfx.unlock(); drag = { id: e.pointerId, x: e.clientX, y: e.clientY }; renderer.domElement.setPointerCapture(e.pointerId); });
renderer.domElement.addEventListener('pointermove', e => {
  if (!drag || drag.id !== e.pointerId) return;
  cam.yaw -= (e.clientX - drag.x) * .006; cam.pitch = THREE.MathUtils.clamp(cam.pitch + (e.clientY - drag.y) * .004, .05, 1.1);
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
  return '';
}
function action() {
  if (player.riding) { leaveRide(); return; }
  if (!near) return;
  if (near.type === 'ride') {
    if (near.ride.canBoard && !near.ride.canBoard()) { queued = near.ride; return; }   // 排队，回站自动上车
    boardRide(near.ride);
  } else if (near.type === 'shop') openShop(near.shop.key);
  else if (near.type === 'gate') leave();
}
function boardRide(rideObj) {
  queued = null;
  const ride = rideObj.board();
  ride.prevCam = { ...cam };
  player.riding = ride; player.vy = 0; sfx.chime([523, 659, 784]);
  if (ride.camDist) cam.dist = ride.camDist;
  if (ride.camYaw !== undefined) cam.yaw = ride.camYaw;
  if (ride.camPitch !== undefined) cam.pitch = ride.camPitch;
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
      if (it.kind === 'use') toast(`${it.icon} 买好了！背包里有 ${r.qty} 个，按道具栏使用`);
      else { await equip(slot, it.key); applyEquip(slot); toast(`${it.icon} ${it.name} 是你的啦！`); }
      renderProps();
    } else if (act === 'on') { await equip(slot, it.key); applyEquip(slot); sfx.click(); }
    else if (act === 'off') { await equip(slot, null); applyEquip(slot); sfx.click(); }
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

// ---------- 道具栏（背包里的能力道具） ----------
function propList() { return itemsOf('prop').filter(i => i.kind === 'use' && (INV.have[i.key] || 0) > 0); }
function renderProps() {
  const list = propList(), bar = $('props');
  bar.innerHTML = list.map((it, i) => `<button data-k="${it.key}" title="${esc(it.name)}"><span class="e">${it.icon}</span><b>${INV.have[it.key]}</b>${isTouch || i > 9 ? '' : `<i>${(i + 1) % 10}</i>`}</button>`).join('');
  bar.classList.toggle('show', list.length > 0);
  bar.querySelectorAll('button').forEach(b => b.onclick = () => usePropKey(b.dataset.k));
}
function usePropAt(i) { const it = propList()[i]; if (it) usePropKey(it.key); }
async function usePropKey(key) {
  if (shopOpen || player.riding || busy) return;
  const it = findItem(key); const ok = abil.canUse(key);
  if (ok !== true) { toast(ok); return; }
  busy = true;
  try { await useItem(key); abil.start(key); toast(`${it.icon} ${it.name}${DURATION[key] ? ` · ${DURATION[key]} 秒` : ''}`); }
  catch (e) { toast('😅 ' + e.message); }
  finally { busy = false; renderProps(); }
}
const FX_ICON = { jetpack: '🎒', copter: '🚁', balloon: '🎈', spring: '👟', skate: '🛹', grow: '🍄', shrink: '🧪', bubble: '🫧', unicorn: '🦄', 'unicorn-cd': '🦄💤' };
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
  } else {
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
      if ((keys.Space) && player.ground && !shopOpen) { player.vy = JUMP * mod.jumpMul; player.ground = false; }
      player.vy -= GRAV * dt; player.pos.y += player.vy * dt;
      if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.ground = true; }
    }
    // 碰撞：圆形障碍物 + 岛边缘
    world.colliders.forEach(([cx, cz, cr]) => {
      if (player.pos.y > 7) return;                       // 飞得够高就越过障碍物
      const dx = player.pos.x - cx, dz = player.pos.z - cz, d = Math.hypot(dx, dz), min = cr + .55 * mod.scale;
      if (d < min && d > 1e-4) { player.pos.x = cx + dx / d * min; player.pos.z = cz + dz / d * min; }
    });
    const R = Math.hypot(player.pos.x, player.pos.z), maxR = ISLAND_R - 2.5 * mod.scale;
    if (R > maxR) { player.pos.x *= maxR / R; player.pos.z *= maxR / R; }

    me.root.position.copy(player.pos); me.root.position.y += mod.lift * mod.scale; me.root.rotation.set(0, player.face, 0);
    me.rig.shadow.position.y = (.02 - player.pos.y - mod.lift * mod.scale) / mod.scale; me.rig.shadow.material.opacity = .25 / (1 + player.pos.y * .3);
    me.animate(dt, Math.min(1, speed / WALK), !player.ground, false, mod.pose);
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
    const cd = cam.dist * (.55 + mod.scale * .45);
    camPos.set(camLook.x - Math.sin(cam.yaw) * cd * Math.cos(cam.pitch), camLook.y + Math.sin(cam.pitch) * cd, camLook.z - Math.cos(cam.yaw) * cd * Math.cos(cam.pitch));
    camera.position.lerp(camPos, Math.min(1, dt * 8)); camera.lookAt(camLook);

    near = shopOpen ? null : findNear();
    if (queued && (!near || near.ride !== queued)) queued = null;          // 走开就取消排队
    else if (queued && queued.canBoard()) boardRide(queued);
    const txt = isTouch ? promptText(near).replace(/按 E ?/, '点按钮') : promptText(near);
    promptEl.textContent = txt; promptEl.classList.toggle('show', !!txt);
    const act = $('actBtn');
    act.classList.toggle('show', !!near);
    if (near) act.textContent = near.type === 'shop' ? '进入' : near.type === 'gate' ? '起飞' : (near.ride.canBoard && !near.ride.canBoard() ? (queued ? '排队中' : '排队') : '乘坐');
  }

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

let ME = null;
function setCoins(n) { $('coinNum').textContent = n == null ? '--' : n; }
async function refreshMe() {
  ME = await loadMe();
  await loadInventory(ME && ME.user.id);
  setCoins(ME ? (ME.profile.coins || 0) : null);
  applyLook(); renderProps();
}

async function boot() {
  if (isTouch) $('hint').textContent = '左下摇杆走路 · 拖动屏幕转视角 · 走到设施和商店门口点按钮';
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
window.__park = { player, world, cam, action, INV, abil, openShop, usePropKey, refreshMe, get me() { return me; }, get near() { return near; } };
