// 魔法学院星球：入学序章与自由探索。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildMagicWorld } from './world.js';
import { moveInStation, cameraFraction, canCrossBarrier, canBoardTrain, platformHeight, platformEdgeZ } from './station-navigation.js';
import { onBridge, onWestPier, onEastPier, bridgeStepAllowed, bridgeHeight, pierHeight, landingHeight } from './lakeshore.js';
import { lakesidePlatformHeight } from './railway.js';
import { buildAvatar } from '../p/avatar.js';
import * as sfx from '../u/sfx.js';

const $ = id => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches;
if (isTouch) document.body.classList.add('touch');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true, alpha: false });
  if (!renderer.getContext()) throw new Error('WebGL unavailable');
} catch (error) {
  location.replace('index2d.html');
  throw error;
}
const DPR = Math.min(devicePixelRatio, isTouch ? 1.45 : 2);
renderer.setPixelRatio(DPR); renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.04;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1d2942); scene.fog = new THREE.FogExp2(0x24334d, .0038);
const camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, .1, 900);
scene.add(new THREE.HemisphereLight(0xc3d5f0, 0x35452b, 1.75));
const moon = new THREE.DirectionalLight(0xffe6ba, 2.25); moon.position.set(-70, 130, 55); moon.castShadow = true;
moon.shadow.normalBias = .06;
moon.shadow.bias = -.0004;
moon.shadow.mapSize.set(2048, 2048); moon.shadow.camera.left = moon.shadow.camera.bottom = -150; moon.shadow.camera.right = moon.shadow.camera.top = 150; scene.add(moon);
const fill = new THREE.DirectionalLight(0x718bd2, .8); fill.position.set(100, 50, -80); scene.add(fill);

const world = buildMagicWorld(scene);
let stationAsset = null;
let trainAsset = null;
const stationLoad = loadHighFidelityStation();
const trainLoad = loadHighFidelityTrain();
const avatar = buildAvatar('wizard', { hand: 'wand' }); avatar.root.scale.setScalar(1.04); scene.add(avatar.root);
const player = { pos: world.points.start.clone(), face: Math.PI, moving: false };
avatar.root.position.copy(player.pos);

const chapters = [
  { eyebrow: '第一章 · 入学来信后的清晨', title: '国王十字车站', text: '九号和十号站台之间只有一堵再普通不过的砖墙。知道秘密的人，才会鼓起勇气径直走向它。', objective: '靠近 9 和 10 号牌正中间的砖墙，互动穿墙' },
  { eyebrow: '第二章 · 隐藏的站台', title: '霍格沃茨特快', text: '蒸汽在站台上升起，红色列车已经准备出发。', objective: '沿站台走到第一节客车的后门，互动上车' },
  { eyebrow: '第三章 · 北行列车', title: '窗外的魔法世界', text: '列车离开伦敦，穿过山谷、森林和暮色。', objective: '欣赏沿途风景，等待列车抵达湖畔' },
  { eyebrow: '第四章 · 黑湖岸边', title: '第一次看见城堡', text: '远处的塔楼亮起灯火。新生将从湖面抵达学校。', objective: '沿湖岸走到小船旁，按 E 上船' },
  { eyebrow: '第五章 · 渡过黑湖', title: '城堡越来越近', text: '小船划开水面，宏伟的城堡在夜色中升起。', objective: '乘船前往城堡码头' },
  { eyebrow: '序章完成 · 自由探索', title: '欢迎来到霍格沃茨', text: '城堡、黑湖、禁林和打人柳区域已经开放。后续章节将在这里继续。', objective: '自由探索；靠近打人柳、城堡正门可以触发场景' },
];

const state = {
  chapter: 0, train: 0, boat: 0, cinematic: false, completed: localStorage.getItem('xcn_magic_intro_done') === '1',
  willowUntil: 0, transition: false,
};
const keys = {};
const cam = { yaw: 0, pitch: .32, dist: 12 };
let drag = null, near = null, toastTimer = 0, elapsed = 0, last = performance.now();
const tmp = new THREE.Vector3(), prev = new THREE.Vector3(), move = new THREE.Vector3(), target = new THREE.Vector3();

function loadHighFidelityStation() {
  const loadingText = $('loading').querySelector('p');
  loadingText.textContent = '正在打开九又四分之三站台……';
  return new Promise(resolve => {
    new GLTFLoader().load(
      'assets/3d/magic/station/platform_9_34.glb',
      gltf => {
        stationAsset = gltf.scene;
        stationAsset.name = 'Station_High_Fidelity';
        stationAsset.position.set(0, 0, 112);
        stationAsset.traverse(object => {
          if (!object.isMesh) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          const transparent = materials.some(material => material && material.transparent);
          object.castShadow = !transparent && !materials.every(material => material?.name === 'MAT_Platform_Stone');
          object.receiveShadow = true;
        });
        scene.add(stationAsset);
        world.station.visible = false;
        if (world.platformOwl) world.platformOwl.visible = false;
        loadingText.textContent = '站台已经准备好，列车即将进站……';
        resolve(true);
      },
      event => {
        if (!event.total) return;
        const percent = Math.min(99, Math.round(event.loaded / event.total * 100));
        loadingText.textContent = `正在搭建九又四分之三站台…… ${percent}%`;
      },
      error => {
        console.warn('高精度车站加载失败，继续使用轻量场景。', error);
        loadingText.textContent = '轻量站台已准备好……';
        resolve(false);
      },
    );
  });
}

function loadHighFidelityTrain() {
  const loadingText = $('loading').querySelector('p');
  return new Promise(resolve => {
    new GLTFLoader().load(
      'assets/3d/magic/train/hogwarts_express.glb',
      gltf => {
        const consist = gltf.scene;
        consist.name = 'Hogwarts_Express_High_Fidelity';
        consist.traverse(object => {
          if (!object.isMesh) return;
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          object.castShadow = !materials.some(material => material && material.transparent);
          object.receiveShadow = true;
        });
        if (world.train.attachAsset(consist)) trainAsset = consist;
        loadingText.textContent = '霍格沃茨特快已经进站……';
        resolve(Boolean(trainAsset));
      },
      undefined,
      error => {
        console.warn('高精度列车加载失败，继续使用轻量列车。', error);
        resolve(false);
      },
    );
  });
}

function setChapter(index) {
  state.chapter = index;
  const c = chapters[index];
  $('chapterEyebrow').textContent = c.eyebrow; $('chapterTitle').textContent = c.title;
  $('chapterText').textContent = c.text; $('objective').textContent = c.objective;
  document.querySelectorAll('.story-dot').forEach((dot, i) => {
    dot.classList.toggle('on', i === Math.min(index, 5)); dot.classList.toggle('done', i < index);
  });
  $('chapterNum').textContent = index < 5 ? `${index + 1} / 5` : '自由探索';
  $('story').classList.remove('pulse'); requestAnimationFrame(() => $('story').classList.add('pulse'));
  if (index === 5) {
    state.completed = true; localStorage.setItem('xcn_magic_intro_done', '1');
    document.body.classList.add('story-complete');
    $('map').classList.add('unlocked');
    $('map').querySelector('.map-title span').textContent = '可快速旅行';
  }
}

function toast(message, duration = 2600) {
  const el = $('toast'); el.textContent = message; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

function flash(callback) {
  if (state.transition) return;
  state.transition = true; $('transition').classList.add('on'); sfx.whoosh(1.2, true);
  setTimeout(() => { callback(); $('transition').classList.remove('on'); setTimeout(() => state.transition = false, 650); }, 520);
}

function crossBarrier() {
  const fromPlatform = player.pos.z < 112;
  flash(() => {
    if (fromPlatform) player.pos.set(0, 0, 119);
    else player.pos.copy(world.points.platform);
    cam.yaw = fromPlatform ? Math.PI : 1.08;
    cam.pitch = .18;
    player.face = cam.yaw + Math.PI;
    avatar.root.position.copy(player.pos);
    updateCamera(1);
    if (state.chapter === 0) setChapter(1);
    sfx.chime([523, 659, 784, 1047]); toast(fromPlatform ? '你回到了车站大厅' : '你穿过砖墙，来到了九又四分之三站台');
  });
}

function boardTrain() {
  if (state.transition) return;
  state.train = 0; state.cinematic = true; avatar.root.visible = false; setChapter(2);
  sfx.chime([392, 523, 659]); toast('🚂 霍格沃茨特快出发！', 3200);
}

function finishTrain() {
  state.cinematic = false; avatar.root.visible = true; player.pos.copy(world.points.arrival);
  cam.yaw = Math.PI / 2; cam.pitch = .24; setChapter(3); updateCamera(1); sfx.chime([523, 659, 784]);
  toast('🏰 穿过薄雾，城堡的灯火出现了');
}

function boardBoat() {
  if (state.transition) return;
  state.boat = 0; state.cinematic = true; avatar.root.visible = false; setChapter(4);
  sfx.whoosh(.9, true); toast('🚣 小船离开湖岸……');
}

function finishBoat() {
  state.cinematic = false; avatar.root.visible = true; player.pos.set(-42, landingHeight, -95.9);
  cam.yaw = 0; cam.pitch = .16; setChapter(5); updateCamera(1); sfx.chime([523, 659, 784, 1047, 1319]);
  toast('🦉 入学序章完成！欢迎来到魔法学院', 4200);
}

function restartStory() {
  if (state.transition) return;
  state.train = state.boat = 0; state.cinematic = false; state.transition = false;
  world.train.setProgress(0); world.boat.setProgress(0); avatar.root.visible = true;
  player.pos.copy(world.points.start); cam.yaw = 0; cam.pitch = .32; cam.dist = 12;
  document.body.classList.remove('story-complete'); setChapter(0); toast('📖 入学故事重新开始');
}

function jumpTo(where) {
  if (!state.completed) { toast('🔒 完成入学序章后可以快速旅行'); return; }
  const points = {
    station: [0, 0, 126, 0], lake: [82, platformHeight, -78, Math.PI / 2], castle: [-42, landingHeight, -95.9, 0], willow: [-78, 0, -101, 1.15],
  };
  const p = points[where]; if (!p) return;
  flash(() => {
    state.cinematic = false; state.train = state.boat = 1;
    world.train.setProgress(1); world.boat.setProgress(1);
    avatar.root.visible = true; player.pos.set(p[0], p[1], p[2]); avatar.root.position.copy(player.pos);
    cam.yaw = p[3]; setChapter(5); updateCamera(1);
  });
}

function findNear() {
  const dist = point => Math.hypot(player.pos.x - point.x, player.pos.z - point.z);
  const interact = isTouch ? '点互动' : '按 E';
  if (canCrossBarrier(player.pos, state.chapter)) return { type: 'barrier', text: `🧱 ${interact}穿过砖墙` };
  if (canBoardTrain(player.pos, world.points.board, state.chapter)) return { type: 'train', text: `🚂 ${interact}登上霍格沃茨特快` };
  if (state.chapter === 3 && onEastPier(player.pos.x, player.pos.z) && dist(world.points.boat) < 3) return { type: 'boat', text: `🚣 ${interact}乘船渡过黑湖` };
  if (state.chapter === 5 && dist(world.points.willow) < 13) return { type: 'willow', text: '🌳 按 E 观察打人柳' };
  if (state.chapter === 5 && dist(world.points.castle) < 3) return { type: 'castle', text: `🏰 ${interact}轻叩城堡正门` };
  return null;
}

function action() {
  sfx.unlock();
  if (state.cinematic || state.transition) return;
  near = findNear();
  if (!near) return;
  if (near.type === 'barrier') crossBarrier();
  else if (near.type === 'train') boardTrain();
  else if (near.type === 'boat') boardBoat();
  else if (near.type === 'willow') {
    state.willowUntil = elapsed + 5; sfx.whoosh(.8, false); toast('🌿 小心！树枝猛地挥了过来！');
  } else if (near.type === 'castle') {
    sfx.chime([659, 784, 988]); toast('🚪 城堡内部将在下一章开放：分院仪式与大礼堂');
  }
}

addEventListener('keydown', event => {
  sfx.unlock(); keys[event.code] = true;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) event.preventDefault();
  if (event.code === 'KeyE' && !event.repeat) action();
  if (event.code === 'Escape') $('story').classList.toggle('collapsed');
});
addEventListener('keyup', event => keys[event.code] = false);
addEventListener('blur', () => { for (const code of Object.keys(keys)) keys[code] = false; });
renderer.domElement.addEventListener('pointerdown', event => {
  sfx.unlock(); drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
  renderer.domElement.setPointerCapture(event.pointerId);
});
renderer.domElement.addEventListener('pointermove', event => {
  if (!drag || drag.id !== event.pointerId || state.cinematic) return;
  cam.yaw -= (event.clientX - drag.x) * .006;
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + (event.clientY - drag.y) * .004, -.05, .95);
  drag.x = event.clientX; drag.y = event.clientY;
});
renderer.domElement.addEventListener('pointerup', () => drag = null);
renderer.domElement.addEventListener('pointercancel', () => drag = null);
renderer.domElement.addEventListener('wheel', event => cam.dist = THREE.MathUtils.clamp(cam.dist + event.deltaY * .012, 7, 23), { passive: true });

const stick = $('stick'), knob = stick.querySelector('.knob'), joy = { x: 0, y: 0, id: null };
function moveJoy(event) {
  const rect = stick.getBoundingClientRect(), radius = rect.width / 2;
  let dx = event.clientX - rect.left - radius, dy = event.clientY - rect.top - radius;
  const length = Math.hypot(dx, dy); if (length > radius) { dx *= radius / length; dy *= radius / length; }
  joy.x = dx / radius; joy.y = -dy / radius; knob.style.transform = `translate(${dx}px, ${dy}px)`;
}
stick.addEventListener('pointerdown', event => { joy.id = event.pointerId; stick.setPointerCapture(event.pointerId); moveJoy(event); });
stick.addEventListener('pointermove', event => { if (event.pointerId === joy.id) moveJoy(event); });
function endJoy(event) { if (event.pointerId !== joy.id) return; joy.id = null; joy.x = joy.y = 0; knob.style.transform = ''; }
stick.addEventListener('pointerup', endJoy); stick.addEventListener('pointercancel', endJoy);
$('actBtn').onclick = action; $('restart').onclick = restartStory;
$('collapseStory').onclick = () => $('story').classList.toggle('collapsed');
document.querySelectorAll('[data-jump]').forEach(button => button.onclick = () => jumpTo(button.dataset.jump));

const mute = $('mute');
function paintMute() { mute.textContent = sfx.isMuted() ? '🔇' : '🔊'; }
mute.onclick = () => { sfx.setMuted(!sfx.isMuted()); paintMute(); }; paintMute();

function canWalkOutsideStation(x, z) {
  if (Math.abs(x) < 52 && z > 70 && z < 149) return true;
  if (onBridge(x, z) || onWestPier(x, z) || onEastPier(x, z)) return true;
  if (((x - world.lake.x) / world.lake.rx) ** 2 + ((z - world.lake.z) / world.lake.rz) ** 2 < 1) return false;
  if (((x + 42) / 40.7) ** 2 + ((z + 153) / 20) ** 2 < 1) return false;
  if (Math.hypot(x + 92, z + 108) < 4.2) return false;
  for (const tree of world.forest.children) {
    if (Math.abs(x - tree.position.x) < 1.1 && Math.hypot(x - tree.position.x, z - tree.position.z) < 1.1) return false;
  }
  return true;
}

function floorAt(x, z) {
  if (Math.abs(x) <= 52 && ((z >= platformEdgeZ && z < 112) || (z >= 70.25 && z <= 83.75))) return platformHeight;
  if (onBridge(x, z)) return bridgeHeight(z);
  if (onWestPier(x, z)) return pierHeight(x);
  if (onEastPier(x, z)) return Math.max(.4, lakesidePlatformHeight(x, z));
  return lakesidePlatformHeight(x, z);
}

function updatePlayer(dt) {
  if (state.cinematic || state.transition) { player.moving = false; avatar.animate(dt, 0, false, false); return; }
  let forward = 0, side = 0;
  if (keys.KeyW || keys.ArrowUp) forward += 1;
  if (keys.KeyS || keys.ArrowDown) forward -= 1;
  if (keys.KeyD || keys.ArrowRight) side += 1;
  if (keys.KeyA || keys.ArrowLeft) side -= 1;
  if (joy.id !== null) { forward = joy.y; side = joy.x; }
  move.set(-Math.sin(cam.yaw) * forward + Math.cos(cam.yaw) * side, 0, -Math.cos(cam.yaw) * forward - Math.sin(cam.yaw) * side);
  let amount = Math.min(1, move.length()); player.moving = amount > .08;
  if (player.moving) {
    prev.copy(player.pos);
    const speed = keys.ShiftLeft || keys.ShiftRight ? 11 : 7;
    move.normalize();
    moveInStation(player.pos, move.x * speed * dt * amount, move.z * speed * dt * amount);
    if (!bridgeStepAllowed(prev.x, prev.z, player.pos.x, prev.z) ||
        !canWalkOutsideStation(player.pos.x, prev.z)) player.pos.x = prev.x;
    if (!bridgeStepAllowed(player.pos.x, prev.z, player.pos.x, player.pos.z) ||
        !canWalkOutsideStation(player.pos.x, player.pos.z)) player.pos.z = prev.z;
    player.pos.y = floorAt(player.pos.x, player.pos.z);
    player.face = Math.atan2(move.x, move.z);
    amount = Math.min(1, Math.hypot(player.pos.x - prev.x, player.pos.z - prev.z) / Math.max(.001, speed * dt));
    player.moving = amount > .01;
  }
  player.pos.x = THREE.MathUtils.clamp(player.pos.x, -190, 190); player.pos.z = THREE.MathUtils.clamp(player.pos.z, -190, 152);
  avatar.root.position.copy(player.pos);
  const turn = player.face - avatar.root.rotation.y;
  avatar.root.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 12);
  avatar.animate(dt, amount, false, false);
}

function updateStory(dt) {
  if (state.chapter === 2) {
    state.train = Math.min(1, state.train + dt / 18); const eased = THREE.MathUtils.smootherstep(state.train, 0, 1);
    world.train.setProgress(eased);
    if (state.train >= 1) finishTrain();
  }
  if (state.chapter === 4) {
    state.boat = Math.min(1, state.boat + dt / 13); world.boat.setProgress(state.boat);
    if (state.boat >= 1) finishBoat();
  }
  near = findNear();
  $('prompt').textContent = near ? near.text : '';
  $('prompt').classList.toggle('show', !!near);
  $('actBtn').classList.toggle('show', !!near && !state.cinematic);
}

function updateCamera(dt) {
  if (state.chapter === 2) {
    const train = world.train.group;
    tmp.set(-15, 9, -19).applyAxisAngle(new THREE.Vector3(0, 1, 0), train.rotation.y).add(train.position);
    camera.position.lerp(tmp, Math.min(1, dt * 2.3)); target.copy(train.position).add(new THREE.Vector3(0, 3, 0));
  } else if (state.chapter === 4) {
    const boat = world.boat.group;
    tmp.set(12, 7, 15).applyAxisAngle(new THREE.Vector3(0, 1, 0), boat.rotation.y).add(boat.position);
    camera.position.lerp(tmp, Math.min(1, dt * 2.5)); target.copy(boat.position).add(new THREE.Vector3(0, 1.4, 0));
  } else {
    target.copy(player.pos); target.y += 1.8;
    const horizontal = Math.cos(cam.pitch) * cam.dist;
    tmp.set(Math.sin(cam.yaw) * horizontal, Math.sin(cam.pitch) * cam.dist + 2.2, Math.cos(cam.yaw) * horizontal).add(target);
    camera.position.lerp(tmp, Math.min(1, dt * 7));
    const fraction = cameraFraction(target, camera.position, state.train === 0);
    camera.position.lerpVectors(target, camera.position, fraction);
  }
  camera.lookAt(target);
}

function tick() {
  const now = performance.now(), dt = Math.min((now - last) / 1000, .05); last = now; elapsed += dt;
  updatePlayer(dt); updateStory(dt); updateCamera(dt);
  world.update(dt, elapsed, { willowActive: elapsed < state.willowUntil });
  renderer.render(scene, camera); requestAnimationFrame(tick);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
});

// 支持测试和后续章节直接定位；普通访问始终从故事开端开始。
const debugChapter = Number(new URLSearchParams(location.search).get('chapter'));
if (debugChapter === 5) { state.completed = true; state.train = state.boat = 1; player.pos.set(-42, landingHeight, -95.9); world.train.setProgress(1); world.boat.setProgress(1); setChapter(5); }
else setChapter(0);
if (state.completed) $('map').classList.add('unlocked');

camera.position.set(0, 8, 145); camera.lookAt(0, 2, 132);
Promise.all([stationLoad, trainLoad, new Promise(resolve => setTimeout(resolve, 650))]).then(() => {
  $('loading').classList.add('done');
  setTimeout(() => $('loading').remove(), 800);
});
tick();

window.__magic = {
  state, player, world,
  get stationAsset() { return stationAsset; },
  get trainAsset() { return trainAsset; },
  restartStory, jumpTo,
};
