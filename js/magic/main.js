// 魔法学院星球：入学序章与自由探索。
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildMagicWorld } from './world.js';
import { CASTLE_ENTRY, castleLocation, castleCameraFraction, castlePassageAt, moveInCastle, nearCastleExit } from './castle-layout.js';
import { buildCastleInterior } from './castle-interior.js';
import { createCastleAtlas } from './castle-atlas.js';
import { moveInStation, cameraFraction, canCrossBarrier, canBoardTrain, platformHeight, platformEdgeZ } from './station-navigation.js';
import { onBridge, onWestPier, onEastPier, bridgeStepAllowed, bridgeHeight, pierHeight, landingHeight } from './lakeshore.js';
import { lakesidePlatformHeight } from './railway.js';
import { rideSeconds, rideSceneAt, routeProgress } from './express-ride.js';
import { arrivalGreeting, buildWelcomeParty } from './welcome.js';
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
const ambientSky = new THREE.HemisphereLight(0xc3d5f0, 0x35452b, 1.75);
scene.add(ambientSky);
const moon = new THREE.DirectionalLight(0xffe6ba, 2.25); moon.position.set(-70, 130, 55); moon.castShadow = true;
moon.shadow.normalBias = .06;
moon.shadow.bias = -.0004;
moon.shadow.mapSize.set(2048, 2048); moon.shadow.camera.left = moon.shadow.camera.bottom = -150; moon.shadow.camera.right = moon.shadow.camera.top = 150; scene.add(moon);
const fill = new THREE.DirectionalLight(0x718bd2, .8); fill.position.set(100, 50, -80); scene.add(fill);

const outdoors = new THREE.Group();
scene.add(outdoors);
const world = buildMagicWorld(outdoors);
const welcomeParty = buildWelcomeParty(outdoors);
let rideShot = null, lastTrainTick = 0, cutToShot = false;
document.addEventListener('visibilitychange', () => { lastTrainTick = performance.now(); });
const outdoorFog = scene.fog, outdoorSky = scene.background;
const indoorFog = new THREE.FogExp2(0x45403e, .011);
let interior;
let stationAsset = null;
let trainAsset = null;
const stationLoad = loadHighFidelityStation();
const trainLoad = loadHighFidelityTrain();
const avatar = buildAvatar('hogwarts-student', { hand: 'wand' }); avatar.root.scale.setScalar(1.04); scene.add(avatar.root);
const player = { pos: world.points.start.clone(), face: Math.PI, moving: false };
avatar.root.position.copy(player.pos);

const chapters = [
  { eyebrow: '第一章 · 入学来信后的清晨', title: '国王十字车站', text: '九号和十号站台之间只有一堵再普通不过的砖墙。知道秘密的人，才会鼓起勇气径直走向它。', objective: '靠近 9 和 10 号牌正中间的砖墙，互动穿墙' },
  { eyebrow: '第二章 · 隐藏的站台', title: '霍格沃茨特快', text: '蒸汽在站台上升起，红色列车已经准备出发。', objective: '沿站台走到第一节客车的后门，互动上车' },
  { eyebrow: '第三章 · 霍格沃茨特快', title: '北上霍格莫德', text: '列车驶出伦敦。', objective: '欣赏沿线风景' },
  { eyebrow: '第四章 · 新生到站', title: '霍格莫德车站', text: '', objective: '与站台上的海格交谈，或沿坡道去码头乘船' },
  { eyebrow: '第五章 · 渡过黑湖', title: '城堡越来越近', text: '小船划开水面，宏伟的城堡在夜色中升起。', objective: '乘船前往城堡码头' },
  { eyebrow: '序章完成 · 自由探索', title: '欢迎来到霍格沃茨', text: '小船靠岸了。沿桥走向城堡正门，或从西码头踏上校地的小径。', objective: '靠近正门互动，进入城堡门厅' },
];

const state = {
  chapter: 0, train: 0, boat: 0, cinematic: false, completed: localStorage.getItem('xcn_magic_intro_done') === '1',
  willowUntil: 0, transition: false, area: 'grounds',
};
const keys = {};
const cam = { yaw: 0, pitch: .32, dist: 12 };
let drag = null, near = null, toastTimer = 0, elapsed = 0, last = performance.now();
const tmp = new THREE.Vector3(), prev = new THREE.Vector3(), move = new THREE.Vector3(), target = new THREE.Vector3();

const entry = new URLSearchParams(location.search);
const arrival = entry.get('arrival');

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
        outdoors.add(stationAsset);
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
  $('story').classList.toggle('aboard-express', index === 2);
  document.body.classList.toggle('riding-express', index === 2);
  $('skipExpress').hidden = index !== 2;
  $('expressProgress').hidden = index !== 2;
  document.body.classList.toggle('on-campus', index === 5);
  document.body.classList.toggle('crossing', index >= 2 && index <= 4);
  document.body.classList.toggle('lake-crossing', index === 4);
  document.querySelector('.brand small').textContent = index === 5 ? '小菜鸟宇宙 · 校园探索' : '小菜鸟宇宙 · 入学序章';
  $('campusHud').hidden = index !== 5;
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
  rideShot = null;
  lastTrainTick = performance.now();
  $('expressProgress').value = 0;
  state.train = 0; state.cinematic = true; avatar.root.visible = false; setChapter(2);
  sfx.chime([392, 523, 659]); toast('🚂 霍格沃茨特快出发！', 3200);
}

function finishTrain() {
  state.train = 1;
  world.train.setProgress(1);
  state.cinematic = false; avatar.root.visible = true; player.pos.copy(world.points.arrival);
  avatar.root.position.copy(player.pos);
  cam.yaw = 2.32; cam.pitch = .54; player.face = -.14; avatar.root.rotation.y = player.face;
  setChapter(3); updateCamera(1); sfx.chime([523, 659, 784]);
  showWelcomeLine(arrivalGreeting);
}

function showWelcomeLine(line) {
  if (!line) return;
  const speech = line.name + '：“' + line.text + '”';
  if (state.chapter === 3) {
    $('chapterText').textContent = speech;
    if ($('story').classList.contains('collapsed')) toast(speech, 5500);
  } else toast(speech, 5500);
}

function boardBoat() {
  if (state.transition) return;
  state.boat = 0; state.cinematic = true;
  world.boat.setProgress(0);
  avatar.root.visible = true; setChapter(4);
  sfx.whoosh(.9, true); toast('🚣 小船离开湖岸……');
}

function startAtLake() {
  if (state.transition || state.cinematic) return;
  setArea('grounds');
  state.train = 1; world.train.setProgress(1);
  boardBoat();
  updateStory(0); updateCamera(1);
}

function finishBoat() {
  state.cinematic = false; avatar.root.visible = true; player.pos.set(-42, landingHeight, -95.9);
  placePlayer(player.pos, 0, .16);
  setChapter(5); sfx.chime([523, 659, 784, 1047, 1319]);
  updateCamera(1);
  toast('小船已经靠岸。沿石桥前行，到正门按互动进入城堡。', 4400);
}

function setArea(area) {
  if (state.area === area) return;
  state.area = area;
  const inside = area === 'castle';
  if (inside && !interior) {
    interior = buildCastleInterior();
    scene.add(interior.group);
  }
  if (interior) interior.group.visible = inside;
  outdoors.visible = !inside;
  scene.fog = inside ? indoorFog : outdoorFog;
  scene.background = inside ? indoorFog.color : outdoorSky;
  moon.castShadow = !inside;
  moon.intensity = inside ? .28 : 2.25;
  ambientSky.intensity = inside ? .42 : 1.75;
  fill.intensity = inside ? .22 : .8;
}

function placePlayer(point, yaw = 0, pitch = .14) {
  player.pos.copy(point);
  player.face = yaw + Math.PI;
  avatar.root.rotation.y = player.face;
  avatar.root.position.copy(player.pos);
  avatar.root.visible = true;
  cam.yaw = yaw; cam.pitch = pitch;
}

function travelTo(place) {
  if (state.chapter !== 5 || state.cinematic || state.transition) return;
  flash(() => {
    setArea(place.area);
    placePlayer(place.point, place.yaw);
    if (state.area === 'castle') interior.update(player.pos, elapsed);
    updateCamera(1);
    updateCampusLocation();
  });
}

function enterCastle() {
  travelTo({ area: 'castle', point: CASTLE_ENTRY, yaw: 0 });
}

function leaveCastle() {
  const z = -131.7;
  travelTo({ area: 'grounds', point: {x: -42, y: bridgeHeight(z), z}, yaw: Math.PI });
}

function restartStory() {
  if (state.transition) return;
  welcomeParty.reset();
  setArea('grounds');
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
    setArea('grounds');
    state.cinematic = false; state.train = state.boat = 1;
    world.train.setProgress(1); world.boat.setProgress(1);
    avatar.root.visible = true; player.pos.set(p[0], p[1], p[2]); avatar.root.position.copy(player.pos);
    cam.yaw = p[3]; cam.pitch = where === 'lake' ? .70 : .26; setChapter(5); updateCamera(1);
  });
}

function findNear() {
  if (state.cinematic || state.transition) return null;
  const dist = point => Math.hypot(player.pos.x - point.x, player.pos.z - point.z);
  const interact = isTouch ? '点互动' : '按 E';
  if (state.area === 'castle') {
    if (nearCastleExit(player.pos)) return {type: 'exit', text: `${interact}走出城堡`};
    const passage = castlePassageAt(player.pos);
    if (passage) return {type: 'passage', text: `${interact}${passage.label}`, passage};
    const room = castleLocation(player.pos).room;
    if (room?.id === 'owlery' && Math.hypot(player.pos.x-room.doorX,player.pos.z-room.z2+2) < 3.2)
      return {type: 'tower-down', text: `${interact}沿西塔楼梯回到校地`};
    return null;
  }
  if (canCrossBarrier(player.pos, state.chapter)) return { type: 'barrier', text: `🧱 ${interact}穿过砖墙` };
  if (canBoardTrain(player.pos, world.points.board, state.chapter)) return { type: 'train', text: `🚂 ${interact}登上霍格沃茨特快` };
  if (state.chapter === 3 && onEastPier(player.pos.x, player.pos.z) && dist(world.points.boat) < 3) return { type: 'boat', text: `🚣 ${interact}乘船渡过黑湖` };
  if (state.chapter === 3 || state.chapter === 5) {
    const person = welcomeParty.nearby(player.pos);
    if (person) return { type: 'talk', id: person.id, text: `${interact}与${person.name}交谈` };
  }
  if (state.chapter === 5 && dist(world.points.willow) < 13) return { type: 'willow', text: `${interact}观察打人柳` };
  if (state.chapter === 5 && dist(world.points.castle) < 3 && onBridge(player.pos.x, player.pos.z)) return { type: 'castle', text: `${interact}推开城堡正门` };
  if (state.chapter === 5 && dist(world.grounds.places.find(p => p.id === 'owlery')) < 3)
    return {type: 'tower-up', text: `${interact}登上西塔猫头鹰棚屋`};
  return null;
}

function action() {
  if (atlas.isOpen) return;
  sfx.unlock();
  if (state.cinematic || state.transition) return;
  near = findNear();
  if (!near) return;
  if (near.type === 'barrier') crossBarrier();
  else if (near.type === 'train') boardTrain();
  else if (near.type === 'boat') boardBoat();
  else if (near.type === 'talk') showWelcomeLine(welcomeParty.talk(near.id));
  else if (near.type === 'willow') {
    state.willowUntil = elapsed + 5; sfx.whoosh(.8, false); toast('🌿 小心！树枝猛地挥了过来！');
  } else if (near.type === 'castle') enterCastle();
  else if (near.type === 'exit') leaveCastle();
  else if (near.type === 'passage') travelTo({area:'castle', point:near.passage.destination, yaw:0});
  else if (near.type === 'tower-up') travelTo(atlas.getPlace('castle', 'owlery'));
  else if (near.type === 'tower-down') travelTo(atlas.getPlace('grounds', 'owlery'));
}

addEventListener('keydown', event => {
  if (atlas.isOpen || event.defaultPrevented) return;
  if (event.code === 'KeyM' && state.chapter === 5 && !state.transition) {
    event.preventDefault(); if (!event.repeat) atlas.open(); return;
  }
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
  cam.pitch = THREE.MathUtils.clamp(cam.pitch + (event.clientY - drag.y) * .004, -.58, .95);
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
$('lakeStart').onclick = startAtLake;
$('skipExpress').onclick = () => {
  if (state.chapter === 2 && !state.transition) flash(finishTrain);
};
$('collapseStory').onclick = () => $('story').classList.toggle('collapsed');
document.querySelectorAll('[data-jump]').forEach(button => button.onclick = () => jumpTo(button.dataset.jump));

const mute = $('mute');
function paintMute() { mute.textContent = sfx.isMuted() ? '🔇' : '🔊'; }
mute.onclick = () => { sfx.setMuted(!sfx.isMuted()); paintMute(); }; paintMute();

function canWalkOutsideStation(x, z) {
  if (welcomeParty.blocks(x, z)) return false;
  if (Math.abs(x) < 52 && z > 70 && z < 149) return true;
  if (onBridge(x, z) || onWestPier(x, z) || onEastPier(x, z)) return true;
  if (((x - world.lake.x) / world.lake.rx) ** 2 + ((z - world.lake.z) / world.lake.rz) ** 2 < 1) return false;
  if (((x + 42) / 40.7) ** 2 + ((z + 153) / 20) ** 2 < 1) return false;
  return Math.hypot(x + 92, z + 108) >= 4.2 && world.grounds.canWalk(x, z);
}

function floorAt(x, z) {
  if (Math.abs(x) <= 52 && ((z >= platformEdgeZ && z < 112) || (z >= 70.25 && z <= 83.75))) return platformHeight;
  if (onBridge(x, z)) return bridgeHeight(z);
  if (onWestPier(x, z)) return pierHeight(x);
  if (onEastPier(x, z)) return Math.max(.4, lakesidePlatformHeight(x, z));
  return lakesidePlatformHeight(x, z);
}

function moveOutdoors(dx, dz) {
  moveInStation(player.pos, dx, dz);
  if (!bridgeStepAllowed(prev.x, prev.z, player.pos.x, prev.z) ||
      !canWalkOutsideStation(player.pos.x, prev.z)) player.pos.x = prev.x;
  if (!bridgeStepAllowed(player.pos.x, prev.z, player.pos.x, player.pos.z) ||
      !canWalkOutsideStation(player.pos.x, player.pos.z)) player.pos.z = prev.z;
  player.pos.x = THREE.MathUtils.clamp(player.pos.x, -190, 190);
  player.pos.z = THREE.MathUtils.clamp(player.pos.z, -190, 152);
  player.pos.y = floorAt(player.pos.x, player.pos.z);
}

function updatePlayer(dt) {
  if (state.cinematic || state.transition) {
    player.moving = false;
    avatar.animate(dt, 0, false, state.chapter === 4);
    return;
  }
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
    const distance = speed * dt * amount;
    if (state.area === 'castle') moveInCastle(player.pos, move.x * distance, move.z * distance, interior.solids);
    else moveOutdoors(move.x * distance, move.z * distance);
    player.face = Math.atan2(move.x, move.z);
    amount = Math.min(1, Math.hypot(player.pos.x - prev.x, player.pos.z - prev.z) / Math.max(.001, speed * dt));
    player.moving = amount > .01;
  }
  avatar.root.position.copy(player.pos);
  const turn = player.face - avatar.root.rotation.y;
  avatar.root.rotation.y += Math.atan2(Math.sin(turn), Math.cos(turn)) * Math.min(1, dt * 12);
  avatar.animate(dt, amount, false, false);
}

function updateStory(dt) {
  if (state.chapter === 2) {
    const now = performance.now();
    const step = document.hidden ? 0 : (now - lastTrainTick) / 1000;
    lastTrainTick = now;
    state.train = Math.min(1, state.train + step / rideSeconds);
    const distance = routeProgress(state.train);
    world.train.setProgress(distance);
    $('expressProgress').value = distance;
    const shot = rideSceneAt(distance);
    if (rideShot !== shot) {
      rideShot = shot; cutToShot = true;
      $('chapterTitle').textContent = shot.title;
      $('chapterText').textContent = shot.text;
    }
    if (state.train >= 1 && !state.transition) finishTrain();
  }
  if (state.chapter === 4) {
    state.boat = Math.min(1, state.boat + dt / 13); world.boat.setProgress(state.boat);
    avatar.root.position.set(0, -.32, -.88);
    world.boat.group.localToWorld(avatar.root.position);
    avatar.root.rotation.y = world.boat.group.rotation.y;
    if (state.boat >= 1) finishBoat();
  }
  near = findNear();
  const onPlatformChapter = state.area === 'grounds' && (state.chapter === 3 || state.chapter === 5);
  // The two stations share one world. Show London only while it is within the player's region.
  const inLondon = state.chapter < 2 || (state.chapter === 2 && state.train < .19) ||
    (state.chapter === 5 && player.pos.z > 45 && Math.abs(player.pos.x) < 105);
  if (stationAsset) stationAsset.visible = inLondon;
  world.station.visible = !stationAsset && inLondon;
  world.platformOwl.visible = !stationAsset && inLondon;
  welcomeParty.update(dt, elapsed, onPlatformChapter && !state.cinematic ? player.pos : null);
  $('prompt').textContent = near ? near.text : '';
  $('prompt').classList.toggle('show', !!near);
  $('actBtn').classList.toggle('show', !!near && !state.cinematic);
}

const atlas = createCastleAtlas({
  grounds: world.grounds.places, gate: world.points.castle,
  context: () => ({ area:state.area, position:player.pos, yaw:cam.yaw }),
  onTravel: travelTo, onRestart: restartStory,
  onOpen() {
    for (const key of Object.keys(keys)) keys[key] = false;
    drag = null; joy.id = null; joy.x = joy.y = 0; knob.style.transform = '';
  },
});
let lastLocation = '';
function updateCampusLocation() {
  if (state.chapter !== 5) return;
  const current = atlas.locate();
  const key = `${current.layer}/${current.id}`;
  if (lastLocation === key) return;
  lastLocation = key;
  $('placeFloor').textContent = current.layer;
  $('placeName').textContent = current.name;
  $('placeDetail').textContent = current.description;
  atlas.visit(current);
}

function updateCamera(dt) {
  if (state.chapter === 2) {
    const train = world.train.group;
    const shot = rideShot ?? rideSceneAt(0);
    if (shot.lake) {
      // Orbit on the landward side so the water stays behind the engine around the bend.
      target.set(shot.lake.x - train.position.x, 0, shot.lake.z - train.position.z).normalize();
      tmp.set(0, 12, -11).applyQuaternion(train.quaternion).add(train.position).addScaledVector(target, -24);
      target.multiplyScalar(10).add(train.position).y += 2;
    } else {
      tmp.fromArray(shot.eye).applyQuaternion(train.quaternion).add(train.position);
      target.fromArray(shot.look).applyQuaternion(train.quaternion).add(train.position);
    }
    camera.position.lerp(tmp, cutToShot ? 1 : 1 - Math.exp(-dt * 8));
    cutToShot = false;
  } else if (state.chapter === 4) {
    const boat = world.boat.group;
    // Keep the castle above the bow throughout the crossing, including portrait screens.
    const dx = -42 - boat.position.x, dz = -159 - boat.position.z;
    const range = Math.hypot(dx, dz);
    const nx = dx / range, nz = dz / range;
    tmp.copy(boat.position);
    tmp.x -= nx * 9 + nz * 1.25; tmp.z -= nz * 9 - nx * 1.25; tmp.y += 3.5;
    camera.position.lerp(tmp, Math.min(1, dt * 2.5));
    target.copy(boat.position); target.x += nx * 22; target.z += nz * 22; target.y += 6.8;
  } else {
    const inside = state.area === 'castle';
    target.copy(player.pos); target.y += inside ? 1.68 : 1.8;
    const onApproach = !inside && state.chapter === 5 && Math.abs(player.pos.x + 42) < 6 &&
      (onWestPier(player.pos.x, player.pos.z) || onBridge(player.pos.x, player.pos.z));
    const lookUp = onApproach ? 2.7 * Math.max(0, Math.cos(cam.yaw)) : 0;
    target.y += lookUp;
    const distance = inside ? Math.min(cam.dist * .55, 6.5) : cam.dist;
    const horizontal = Math.cos(cam.pitch) * distance;
    tmp.set(Math.sin(cam.yaw) * horizontal, Math.sin(cam.pitch) * distance + (inside ? .62 : 2.2), Math.cos(cam.yaw) * horizontal).add(target);
    tmp.y -= lookUp * 1.9;
    if (!inside) tmp.y = Math.max(tmp.y, floorAt(tmp.x, tmp.z) + .5);
    camera.position.lerp(tmp, Math.min(1, dt * 7));
    const fraction = inside ? castleCameraFraction(target, camera.position, interior.solids) :
      Math.min(cameraFraction(target, camera.position, state.train === 0), world.grounds.cameraFraction(target, camera.position));
    camera.position.lerpVectors(target, camera.position, fraction);
    avatar.root.visible = camera.position.distanceToSquared(target) > 1.1;
    if (fraction < .001) camera.position.lerpVectors(target, tmp, .004);
  }
  camera.lookAt(target);
}

let sceneReady = false;
function tick() {
  requestAnimationFrame(tick);
  const now = performance.now(), dt = Math.min((now - last) / 1000, .05); last = now;
  if (!sceneReady || atlas.isOpen) return;
  elapsed += dt;
  updatePlayer(dt); updateStory(dt); updateCamera(dt);
  if (state.area === 'castle') interior.update(player.pos, elapsed);
  else world.update(dt, elapsed, { willowActive: elapsed < state.willowUntil });
  updateCampusLocation();
  renderer.render(scene, camera);
}

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight);
});

// 支持测试和后续章节直接定位；普通访问始终从故事开端开始。
const debugChapter = Number(entry.get('chapter'));
if (debugChapter === 5 || arrival === 'castle') {
  state.train = state.boat = 1; world.train.setProgress(1); world.boat.setProgress(1); setChapter(5);
  if (arrival === 'castle') { setArea('castle'); placePlayer(CASTLE_ENTRY); }
  else placePlayer({x:-42, y:landingHeight, z:-95.9});
}
else setChapter(0);
if (state.completed) $('map').classList.add('unlocked');

camera.position.set(0, 8, 145); updateCamera(1);
Promise.all([stationLoad, trainLoad, new Promise(resolve => setTimeout(resolve, 650))]).then(() => {
  sceneReady = true;
  $('loading').classList.add('done');
  if (debugChapter === 2) boardTrain();
  if (debugChapter === 3) finishTrain();
  if (arrival === 'lake') startAtLake();
  setTimeout(() => $('loading').remove(), 800);
});
tick();

window.__magic = {
  state, player, world,
  get stationAsset() { return stationAsset; },
  get trainAsset() { return trainAsset; },
  restartStory, jumpTo,
};
