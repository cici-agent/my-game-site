// ===== 小菜鸟宇宙：主程序 =====
import * as THREE from 'three';
import { loadPlanets, loadGames, loadMe } from './data.js';
import { layoutPlanets, buildPlanet, createGate } from './planets.js';
import { buildShip } from './ships.js';
import { glowTex, rand } from './tex.js';
import { renderStation } from './stations.js';
import { askLogin } from './login.js';
import * as sfx from './sfx.js';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');
const setLoad = p => { const b = $('loadBar'); if (b) b.style.width = p + '%'; };

// ---------- 渲染器（不支持 WebGL 就降级到 2D 页面） ----------
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true, alpha: true });
  if (!renderer.getContext()) throw new Error('no webgl');
} catch (e) {
  location.replace('index2d.html');
  throw e;
}
const DPR = Math.min(devicePixelRatio, isTouch ? 1.5 : 2);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x120e3a, 180, 480);
const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.1, 1200);
scene.add(new THREE.HemisphereLight(0xbfd8ff, 0x3a2266, 1.1));
const sun = new THREE.DirectionalLight(0xfff1dd, 2.2); sun.position.set(80, 120, 60); scene.add(sun);

// ---------- 星空 ----------
{
  const N = 2500, pos = new Float32Array(N * 3), col = new Float32Array(N * 3), r = rand(7);
  for (let i = 0; i < N; i++) {
    const u = r() * 2 - 1, th = r() * Math.PI * 2, R = 480 + r() * 300, s = Math.sqrt(1 - u * u);
    pos.set([R * s * Math.cos(th), R * u, R * s * Math.sin(th)], i * 3);
    const tint = r(); col.set(tint < .15 ? [1, .8, .6] : tint < .3 ? [.7, .8, 1] : [1, 1, 1], i * 3);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ size: 2.8, vertexColors: true, map: glowTex(), transparent: true, depthWrite: false, fog: false })));
}
const dust = (() => {
  const N = 700, pos = new Float32Array(N * 3), r = rand(11);
  for (let i = 0; i < N; i++) pos.set([(r() - .5) * 500, (r() - .5) * 60, (r() - .5) * 500], i * 3);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const p = new THREE.Points(geo, new THREE.PointsMaterial({ size: .5, color: 0xaab8ff, map: glowTex(), transparent: true, depthWrite: false, opacity: .7 }));
  scene.add(p); return p;
})();
{
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffc46b, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
  s.position.set(300, 200, -500); s.scale.setScalar(220); scene.add(s);
}

// ---------- 星门 ----------
const gate = createGate(); scene.add(gate);

// ---------- 飞船 ----------
const shipObj = buildShip('rookie');
const ship = shipObj.group; ship.rotation.order = 'YXZ'; scene.add(ship);
const { flame, engineLight } = shipObj;
const TRAIL = 160;
const trail = (() => {
  const pos = new Float32Array(TRAIL * 3).fill(9999), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size: .9, color: 0xffb36b, map: glowTex(), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, opacity: .8 }));
  pts.frustumCulled = false; scene.add(pts);
  return { pts, pos, life: new Float32Array(TRAIL), i: 0 };
})();

// ---------- 超空间光线 ----------
const warpCv = $('warp'), wg = warpCv.getContext('2d');
const streaks = Array.from({ length: 220 }, () => ({ a: Math.random() * Math.PI * 2, r: Math.random(), v: .4 + Math.random() }));
let warpColor = '#ffb36b';
const sizeWarp = () => { warpCv.width = innerWidth * DPR; warpCv.height = innerHeight * DPR; };
sizeWarp();
function drawWarp(level, dt) {
  warpCv.style.opacity = level;
  if (level < .01) return;
  const w = warpCv.width, h = warpCv.height, cx = w / 2, cy = h * .45, maxR = Math.hypot(w, h) * .6;
  wg.clearRect(0, 0, w, h); wg.globalCompositeOperation = 'lighter'; wg.lineCap = 'round';
  streaks.forEach((s, i) => {
    s.r += dt * s.v * (.6 + level * 2.6) * (s.r + .08);
    if (s.r > 1.05) { s.r = Math.random() * .15; s.a = Math.random() * Math.PI * 2; }
    const r0 = s.r * maxR, r1 = r0 * (1 + .12 + level * .35);
    wg.strokeStyle = i % 3 ? `rgba(255,255,255,${.55 * s.r + .1})` : warpColor;
    wg.lineWidth = (1 + s.r * 3.5) * DPR;
    wg.beginPath(); wg.moveTo(cx + Math.cos(s.a) * r0, cy + Math.sin(s.a) * r0); wg.lineTo(cx + Math.cos(s.a) * r1, cy + Math.sin(s.a) * r1); wg.stroke();
  });
  wg.globalCompositeOperation = 'source-over';
}

// ---------- 状态 ----------
// mode: fly 飞行 / landing 降落动画 / landed 在星球广场 / takeoff 起飞动画
const state = { mode: 'fly', heading: 0, speed: 0, bank: 0, target: null, landed: null, boost: false, cooldown: null, warp: 0, fovBoost: 0 };
const cine = { t: 0, p: null, next: null, travelled: 0, gateDist: 13, flashedAt: -1, setup: false };
let PLANETS = [], GAMES = [], ME = null;
const planetMeshes = [];

// ---------- 输入 ----------
const keys = {};
addEventListener('keydown', e => {
  sfx.unlock();
  keys[e.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) e.preventDefault();
  if (e.code === 'Escape' && state.mode === 'landed') takeOff();
  if (/^(Arrow|Key[WASD])/.test(e.code)) state.target = null;
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('pointerdown', () => sfx.unlock());

const stick = $('stick'), knob = stick.querySelector('.knob');
const joy = { x: 0, y: 0, id: null };
stick.addEventListener('pointerdown', e => { joy.id = e.pointerId; stick.setPointerCapture(e.pointerId); moveJoy(e); state.target = null; });
stick.addEventListener('pointermove', e => { if (e.pointerId === joy.id) moveJoy(e); });
const endJoy = e => { if (e.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; };
stick.addEventListener('pointerup', endJoy); stick.addEventListener('pointercancel', endJoy);
function moveJoy(e) {
  const r = stick.getBoundingClientRect(), R = r.width / 2;
  let dx = e.clientX - r.left - R, dy = e.clientY - r.top - R;
  const d = Math.hypot(dx, dy); if (d > R) { dx *= R / d; dy *= R / d; }
  joy.x = dx / R; joy.y = -dy / R; knob.style.transform = `translate(${dx}px, ${dy}px)`;
}
const boostBtn = $('boost');
boostBtn.addEventListener('pointerdown', () => state.boost = true);
['pointerup', 'pointerleave', 'pointercancel'].forEach(t => boostBtn.addEventListener(t, () => state.boost = false));

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', e => downAt = [e.clientX, e.clientY]);
renderer.domElement.addEventListener('pointerup', e => {
  if (state.mode !== 'fly' || !downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 8) return;
  ndc.set(e.clientX / innerWidth * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  const hit = ray.intersectObjects(planetMeshes)[0];
  if (hit) flyTo(hit.object.userData.planet);
});

// 点星球 / 底栏：飞行中 → 自动驾驶；在别的星球上 → 先起飞再飞过去（没有直接跳转）
function flyTo(p) {
  if (state.mode === 'landing' || state.mode === 'takeoff') return;
  if (state.mode === 'landed') { if (state.landed !== p) takeOff(p); return; }
  state.target = p; markDock(p); hideHint();
}

// ---------- UI ----------
const labelsEl = $('labels'), dock = $('dock');
let takeoffBtn;
function buildUI() {
  labelsEl.innerHTML = '';
  PLANETS.forEach(p => {
    const d = document.createElement('div'); d.className = 'label'; d.style.setProperty('--c', p.color);
    d.innerHTML = `<div class="name">${p.icon} ${p.name}</div><div class="sub">${p.description || ''}</div>`;
    d.onclick = () => flyTo(p); labelsEl.appendChild(d); p.label = d;
  });
  dock.innerHTML = '';
  PLANETS.forEach(p => {
    const b = document.createElement('button'); b.dataset.k = p.kind; b.style.setProperty('--c', p.color);
    b.innerHTML = `<span class="e">${p.icon}</span>${p.name}`; b.onclick = () => flyTo(p); dock.appendChild(b);
  });
  const sep = document.createElement('div'); sep.className = 'sep'; dock.appendChild(sep);
  takeoffBtn = document.createElement('button');
  takeoffBtn.className = 'takeoff'; takeoffBtn.disabled = true;
  takeoffBtn.innerHTML = '<span class="e">🚀</span>起飞';
  takeoffBtn.onclick = () => takeOff();
  dock.appendChild(takeoffBtn);
}
function markDock(p) { dock.querySelectorAll('button[data-k]').forEach(b => b.classList.toggle('active', !!p && b.dataset.k === p.kind)); }
function refreshUI() {
  const landed = state.mode === 'landed';
  takeoffBtn.disabled = !landed; takeoffBtn.classList.toggle('ready', landed);
  document.body.classList.toggle('flying', state.mode === 'fly');
  $('where').textContent = landed ? '· ' + state.landed.name : '';
}
function showCoins() { $('coinNum').textContent = ME ? (ME.profile.coins || 0) : '--'; }
const hintEl = $('hint');
let hintHidden = false;
function hideHint() { if (!hintHidden) { hintHidden = true; setTimeout(() => hintEl.style.opacity = 0, 2500); } }

// 静音按钮
const muteBtn = $('mute');
const paintMute = () => muteBtn.textContent = sfx.isMuted() ? '🔇' : '🔊';
muteBtn.onclick = () => { sfx.setMuted(!sfx.isMuted()); paintMute(); };
paintMute();

// ---------- 星球广场 ----------
async function openStation(p) {
  const st = $('station'); st.style.setProperty('--c', p.color);
  $('stEmoji').textContent = p.icon; $('stTitle').textContent = p.name; $('stDesc').textContent = p.description || '';
  $('stCount').textContent = '';
  st.classList.add('show');
  const body = $('stBody'); body.scrollTop = 0;
  const count = await renderStation(body, p, { games: GAMES, me: ME, onLogout: onLogout });
  $('stCount').textContent = count || '';
}
async function onLogout() {
  ME = null; showCoins();
  takeOff();
}

// ---------- 降落 / 起飞 ----------
const flashEl = $('flash');
function flash(on, p) { if (p) flashEl.style.setProperty('--c', p.color); flashEl.classList.toggle('on', on); }
const fwd = new THREE.Vector3(), tmp = new THREE.Vector3(), out = new THREE.Vector3();
const camTarget = new THREE.Vector3(), lookAt = new THREE.Vector3();
const easeOutBack = x => 1 + 2.7 * Math.pow(x - 1, 3) + 1.7 * Math.pow(x - 1, 2);

function startLanding(p) {
  if (state.mode !== 'fly') return;
  state.mode = 'landing'; state.target = null; markDock(p); hideHint();
  Object.assign(cine, { t: 0, p, travelled: 0, flashedAt: -1, gateDist: 13 });
  fwd.set(Math.sin(state.heading), 0, Math.cos(state.heading));
  gate.position.copy(ship.position).addScaledVector(fwd, cine.gateDist);
  gate.lookAt(ship.position); gate.scale.setScalar(.01); gate.visible = true; gate.userData.tint(p.color);
  warpColor = p.color; refreshUI();
  sfx.whoosh(1.4, true);
}
function parkAt(p, inward) {
  out.set(ship.position.x - p.pos[0], 0, ship.position.z - p.pos[2]);
  if (out.lengthSq() < .01) out.set(0, 0, -1);
  out.normalize();
  ship.position.set(p.pos[0] + out.x * (p.radius + 14), p.pos[1], p.pos[2] + out.z * (p.radius + 14));
  state.heading = inward ? Math.atan2(-out.x, -out.z) : Math.atan2(out.x, out.z);
}
async function finishLanding() {
  const p = cine.p;
  // 菜鸟星球：进入 3D 游乐园页面（闪光保持着，直接切页面）
  if (p.kind === 'plaza') {
    if (!ME && !(await requireLogin(p))) return;
    location.href = 'park.html';
    return;
  }
  state.mode = 'landed'; state.landed = p; state.speed = 0; state.warp = 0;
  gate.visible = false; parkAt(p, true);
  flash(false); refreshUI();
  if (!ME && !(await requireLogin(p))) return;
  sfx.chime();
  openStation(p);
}
// 没登录 → 弹出登录；取消就起飞离开
async function requireLogin(p) {
  flash(false);
  if (state.mode !== 'landed') { state.mode = 'landed'; state.landed = p; state.speed = 0; state.warp = 0; gate.visible = false; parkAt(p, true); refreshUI(); }
  const ok = await askLogin(p);
  if (ok) { ME = await loadMe(); showCoins(); return true; }
  takeOff();
  return false;
}
function takeOff(next) {
  if (state.mode !== 'landed') return;
  const p = state.landed;
  state.mode = 'takeoff'; state.landed = null;
  Object.assign(cine, { t: 0, p, next: next || null, setup: false });
  $('station').classList.remove('show');
  flash(true, p); warpColor = p.color; gate.userData.tint(p.color);
  markDock(next || null); refreshUI();
  sfx.whoosh(1.6, false);
}
function setupTakeoff() {
  const p = cine.p;
  parkAt(p, false);
  state.speed = 75; state.bank = 0;
  fwd.set(Math.sin(state.heading), 0, Math.cos(state.heading));
  gate.position.copy(ship.position).addScaledVector(fwd, -1.5);
  gate.lookAt(tmp.copy(gate.position).add(fwd)); gate.scale.setScalar(1); gate.visible = true;
  camera.position.copy(ship.position).addScaledVector(fwd, -14); camera.position.y += 5;
  lookAt.copy(ship.position).addScaledVector(fwd, 8);
  state.warp = 1; state.fovBoost = 1;
  cine.setup = true; flash(false);
}
function finishTakeoff() {
  state.mode = 'fly'; gate.visible = false; state.cooldown = cine.p;
  if (cine.next) state.target = cine.next;
  refreshUI();
}

// ---------- 主循环 ----------
let lastT = performance.now(), elapsed = 0;
const MAX = 28;
function wrapAngle(a) { while (a > Math.PI) a -= Math.PI * 2; while (a < -Math.PI) a += Math.PI * 2; return a; }
function planetDist(p) { return Math.hypot(ship.position.x - p.pos[0], ship.position.z - p.pos[2]) - p.radius; }

function tick() {
  const now = performance.now(), dt = Math.min((now - lastT) / 1000, .05); lastT = now; elapsed += dt; const t = elapsed;
  let turn = 0, thrust = 0;
  if (state.mode === 'fly') {
    if (keys.ArrowLeft || keys.KeyA) turn -= 1;
    if (keys.ArrowRight || keys.KeyD) turn += 1;
    if (keys.ArrowUp || keys.KeyW) thrust = 1;
    if (keys.ArrowDown || keys.KeyS) thrust = -.5;
    if (joy.id !== null) { turn = joy.x; thrust = Math.max(-.5, joy.y); }
    if (state.boost) thrust = Math.max(thrust, 1);
    if (turn || thrust) hideHint();
    if (state.target) {
      const p = state.target;
      tmp.set(p.pos[0] - ship.position.x, 0, p.pos[2] - ship.position.z);
      const diff = wrapAngle(Math.atan2(tmp.x, tmp.z) - state.heading);
      turn = THREE.MathUtils.clamp(-diff * 2.2, -1, 1);
      thrust = Math.abs(diff) > 1.2 ? .3 : THREE.MathUtils.clamp((planetDist(p) - 4) / 18, .25, 1);
      if (planetDist(p) < 14) startLanding(p);
    }
    state.heading = wrapAngle(state.heading - turn * dt * 2.1);
    const targetSpeed = thrust * MAX * (state.boost ? 1.4 : 1);
    state.speed += (targetSpeed - state.speed) * Math.min(1, dt * (thrust ? 1.6 : 2.4));
  }
  fwd.set(Math.sin(state.heading), 0, Math.cos(state.heading));

  if (state.mode === 'landing') {
    cine.t += dt;
    gate.scale.setScalar(Math.max(.01, easeOutBack(Math.min(1, cine.t / .45))));
    const opening = cine.t < .6;
    state.speed += ((opening ? 10 : 80) - state.speed) * Math.min(1, dt * (opening ? 4 : 5));
    cine.travelled += state.speed * dt;
    state.warp = Math.min(1, Math.max(0, cine.t - .35) / .5); state.fovBoost = state.warp;
    if (cine.flashedAt < 0 && (cine.travelled > cine.gateDist - .5 || cine.t > 2)) { cine.flashedAt = cine.t; flash(true, cine.p); }
    if (cine.flashedAt >= 0 && cine.t - cine.flashedAt > .3 && !cine.done) { cine.done = true; finishLanding().finally(() => cine.done = false); }
  } else if (state.mode === 'takeoff') {
    cine.t += dt;
    if (!cine.setup && cine.t > .22) setupTakeoff();
    if (cine.setup) {
      const k = cine.t - .22;
      state.speed += (12 - state.speed) * Math.min(1, dt * 1.6);
      gate.scale.setScalar(Math.max(.01, k < .5 ? 1 : 1 - (k - .5) / .4));
      if (k > .9) gate.visible = false;
      state.warp = Math.max(0, 1 - Math.max(0, k - .5) / .8); state.fovBoost = state.warp;
      if (k > 1.5) finishTakeoff();
    }
  } else if (state.mode === 'fly') {
    state.warp += (0 - state.warp) * Math.min(1, dt * 4); state.fovBoost = state.warp;
  }
  if (gate.visible) gate.userData.spin(dt);
  if (state.mode === 'fly' || state.mode === 'takeoff' || (state.mode === 'landing' && cine.flashedAt < 0))
    ship.position.addScaledVector(fwd, state.speed * dt);

  let nearest = null, nd = Infinity, targetY = 0;
  PLANETS.forEach(p => { const d = planetDist(p); if (d < nd) { nd = d; nearest = p; } });
  if (state.mode === 'fly') {
    PLANETS.forEach(p => {
      const dx = ship.position.x - p.pos[0], dz = ship.position.z - p.pos[2], d = Math.hypot(dx, dz), min = p.radius + 4;
      if (d < min) { ship.position.x = p.pos[0] + dx / d * min; ship.position.z = p.pos[2] + dz / d * min; }
    });
    if (state.cooldown && planetDist(state.cooldown) > 26) state.cooldown = null;
    // 手动开到星球附近、机头正对（±20°）往前飞 → 自动降落；擦边不触发
    if (nearest && nd < 14 && nearest !== state.cooldown && state.speed > 3) {
      const face = wrapAngle(Math.atan2(nearest.pos[0] - ship.position.x, nearest.pos[2] - ship.position.z) - state.heading);
      if (Math.abs(face) < .35) startLanding(nearest);
    }
    const R = Math.hypot(ship.position.x, ship.position.z);
    if (R > 240) { ship.position.x *= 240 / R; ship.position.z *= 240 / R; }
  }
  if (nearest && nd < 30) targetY = nearest.pos[1] * (1 - nd / 30);
  if (state.mode === 'fly' || state.mode === 'takeoff') ship.position.y += (targetY + Math.sin(t * 2) * .25 - ship.position.y) * Math.min(1, dt * 2);

  state.bank += (turn * .55 - state.bank) * Math.min(1, dt * 5);
  ship.rotation.y = state.heading; ship.rotation.z = state.bank;
  ship.rotation.x = -Math.min(1, state.speed / MAX) * .08;
  ship.visible = state.mode !== 'landed';

  const power = Math.min(1.6, Math.abs(state.speed) / MAX);
  flame.scale.setScalar(1.2 + power * 3 + Math.random() * .4);
  engineLight.intensity = 10 + power * 40;
  sfx.engineLevel(ship.visible ? power : 0);
  if (ship.visible && (power > .05 || Math.random() < .2)) {
    const i = trail.i = (trail.i + 1) % TRAIL;
    tmp.set((Math.random() - .5) * .6, (Math.random() - .5) * .6, shipObj.tailZ).applyEuler(ship.rotation).add(ship.position);
    trail.pos.set([tmp.x, tmp.y, tmp.z], i * 3); trail.life[i] = 1;
  }
  for (let i = 0; i < TRAIL; i++) {
    if (trail.life[i] <= 0) continue;
    trail.life[i] -= dt * 1.6;
    if (trail.life[i] <= 0) trail.pos[i * 3 + 1] = 9999; else trail.pos[i * 3 + 1] += dt * .3;
  }
  trail.pts.geometry.attributes.position.needsUpdate = true;

  PLANETS.forEach((p, i) => {
    p.mesh.rotation.y += dt * (.08 + i * .015);
    p.group.position.y = p.pos[1] + Math.sin(t * .6 + i) * .6;
    p.updateDecor(t);
    p.moons.forEach(m => {
      const u = m.userData, a = t * u.speed + u.phase;
      m.position.set(Math.cos(a) * u.orbit, Math.sin(a) * u.orbit * u.tilt, Math.sin(a) * u.orbit);
      m.rotation.x += dt; m.rotation.y += dt * .7;
    });
  });
  dust.rotation.y += dt * .004;

  if (state.mode === 'landed') {
    const p = state.landed, a = t * .12;
    camTarget.set(p.pos[0] + Math.sin(a) * p.radius * 3.6, p.pos[1] + p.radius * 1.2, p.pos[2] + Math.cos(a) * p.radius * 3.6);
    lookAt.lerp(tmp.set(...p.pos), Math.min(1, dt * 3));
  } else {
    const portrait = Math.max(1, 1.25 / camera.aspect);
    const back = (13 + Math.min(1, power) * 4) * portrait;
    camTarget.copy(ship.position).addScaledVector(fwd, -back); camTarget.y += 5.5 * portrait;
    lookAt.lerp(tmp.copy(ship.position).addScaledVector(fwd, 8), Math.min(1, dt * 6));
  }
  camera.position.lerp(camTarget, Math.min(1, dt * (state.mode === 'landing' ? 5 : 3)));
  const baseFov = camera.aspect < 1 ? 74 : 60;
  camera.fov += ((baseFov + Math.min(1, power) * 12 + state.fovBoost * 30) - camera.fov) * Math.min(1, dt * 4);
  camera.updateProjectionMatrix();
  camera.lookAt(lookAt);

  drawWarp(state.warp, dt);

  PLANETS.forEach(p => {
    if (!p.label) return;
    tmp.copy(p.group.position); tmp.y += p.radius + 4; tmp.project(camera);
    const vis = state.mode === 'fly' && tmp.z < 1 && Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2;
    // 远处的星球只显示名字，近了才显示一句话简介，避免标签挤在一起
    p.label.classList.toggle('far', planetDist(p) > 150);
    p.label.style.opacity = vis ? 1 : 0; p.label.style.pointerEvents = vis ? 'auto' : 'none';
    p.label.style.transform = `translate(${(tmp.x + 1) / 2 * innerWidth}px, ${(1 - tmp.y) / 2 * innerHeight}px) translate(-50%, -100%)`;
  });

  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight); sizeWarp();
});

// ---------- 每个游戏一颗小卫星 ----------
function buildMoons() {
  PLANETS.forEach(p => {
    p.moons.forEach(m => p.group.remove(m)); p.moons = [];
    if (p.kind !== 'games') return;
    const list = GAMES.filter(g => g.planetKind === 'games').slice(0, 24);
    list.forEach((gm, k) => {
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(.9, 0),
        new THREE.MeshStandardMaterial({ color: 0xffe0cc, emissive: p.color, emissiveIntensity: .35, flatShading: true }));
      m.userData = { orbit: p.radius + 3 + (k % 3) * 1.6, speed: .25 + (k % 4) * .08, phase: k / Math.max(1, list.length) * Math.PI * 2, tilt: (k % 5 - 2) * .25 };
      p.group.add(m); p.moons.push(m);
    });
  });
}

// ---------- 启动 ----------
async function boot() {
  setLoad(20);
  const [planets, me] = await Promise.all([loadPlanets(), loadMe()]);
  ME = me; showCoins();
  PLANETS = layoutPlanets(planets);
  try { sessionStorage.setItem('xcn_planets', JSON.stringify(Object.fromEntries(planets.map(p => [p.kind, [p.name, p.icon]])))); } catch (e) {}
  PLANETS.forEach((p, i) => { scene.add(buildPlanet(p, i)); p.moons = []; planetMeshes.push(p.mesh); });
  setLoad(60);
  buildUI();
  GAMES = await loadGames(PLANETS);
  buildMoons();
  setLoad(90);

  // 出生点：宇宙里（星球圈外），面朝圈内
  ship.position.set(0, 0, -205); state.heading = 0;
  camera.position.set(0, 9, -225); lookAt.set(0, 0, -195);

  // 从其他页面回来：?land=games 直接落在该星球；?takeoff=plaza 从该星球起飞
  const land = PLANETS.find(p => p.kind === params.get('land'));
  const fromTake = PLANETS.find(p => p.kind === params.get('takeoff'));
  if (land || fromTake) {
    const p = land || fromTake;
    ship.position.set(p.pos[0], p.pos[1], p.pos[2] - p.radius - 14);
    state.mode = 'landed'; state.landed = p; parkAt(p, true); refreshUI(); markDock(p);
    camera.position.set(p.pos[0], p.pos[1] + p.radius * 1.2, p.pos[2] - p.radius * 3.6); lookAt.set(...p.pos);
    if (land) { if (ME) openStation(p); else requireLogin(p).then(ok => ok && openStation(p)); }
    else takeOff();
    hintEl.style.opacity = 0; hintHidden = true;
    history.replaceState(null, '', location.pathname);
  }
  refreshUI();
  tick();
  setLoad(100);
  setTimeout(() => { const l = $('loading'); l.style.opacity = 0; setTimeout(() => l.remove(), 600); }, 300);
}
boot();

// 自动化测试用
window.__space = { state, get PLANETS() { return PLANETS; }, flyTo, takeOff, cine, ship };
