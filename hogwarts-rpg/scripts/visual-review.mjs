// Cosmetic-only local inspection; no API client, account, or persistence operations.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createNpc } from '../chapter-one/presentation/npcs.mjs';
import { createCreature } from '../chapter-one/presentation/creatures.mjs';
import { loadPlayableCharacter } from '../chapter-one/presentation/playable-character.mjs';
import { createSceneEnvironment, SCENE_MAPS } from '../chapter-one/client/scene-environment.mjs';
import { runtimeQuests } from '../chapter-one/online/catalog.mjs';
import { contentData } from '../chapter-one/data/index.mjs';

const ui = Object.fromEntries([...document.querySelectorAll('[id]')].map(node => [node.id, node]));
const heroEntries = [['harry', '哈利 · 工坊原角色'], ['hermione', '赫敏 · 工坊原角色'], ['ron', '罗恩 · 工坊原角色']].map(([id, name]) => ({ id: `hero:${id}`, sourceId: id, name, type: 'hero' }));
const npcEntries = [
  ['hagrid', '鲁伯·海格'], ['molly', '韦斯莱夫人'], ['firenze', '费伦泽'], ['mcgonagall', '麦格教授'], ['flitwick', '弗立维教授'],
  ['snape', '斯内普教授'], ['dumbledore', '邓布利多'], ['quirrell', '奇洛'], ['pomfrey', '庞弗雷夫人'], ['sprout', '斯普劳特教授'],
  ['hooch', '霍琦夫人'], ['wood', '奥利弗·伍德'], ['pince', '平斯夫人'], ['filch', '费尔奇'], ['draco', '德拉科·马尔福'],
  ['supply', '诺拉·佩恩 · 补给'], ['gear', '埃文·里德 · 装备'], ['tools', '米拉·格林 · 工具'], ['post', '艾达·莫斯 · 邮务'],
].map(([id, name]) => ({ id: `npc:${id}`, sourceId: id, name, type: 'npc' }));
const creatureEntries = [...contentData.enemies, ...contentData.bosses, { id: 'key', name: '有翅膀的钥匙' }, { id: 'B1-E10', name: '路威 · 三头犬' }, { id: 'B1-E08', name: '诺伯 · 挪威脊背龙幼龙' }, { id: 'B1-E04', name: '皮皮鬼' }]
  .map(entry => ({ ...entry, sourceId: entry.id, id: `creature:${entry.id}`, type: 'creature', name: `${entry.name}${entry.level ? ` · ${entry.level} 级` : ' · 情节生物'}` }));
const entries = [...heroEntries, ...npcEntries, ...creatureEntries], entryMap = new Map(entries.map(entry => [entry.id, entry]));
for (const [label, values] of [['工坊原角色（实际游戏状态层）', heroEntries], ['人物', npcEntries], ['生物 / 怪物等级变体', creatureEntries]]) {
  const group = document.createElement('optgroup'); group.label = label;
  for (const entry of values) group.append(new Option(entry.name, entry.id)); ui.model.append(group);
}
ui.scene.append(new Option('中性光照 · 人物摄影棚', 'studio'));
for (const entry of contentData.scenes.filter(entry => SCENE_MAPS[entry.id])) ui.scene.append(new Option(`${entry.id} · ${entry.name}`, entry.id));
ui.quest.append(new Option('无主线情节', ''));
for (const quest of runtimeQuests) ui.quest.append(new Option(`${quest.id} · ${quest.name}`, quest.id));

const renderer = new THREE.WebGLRenderer({ canvas: ui.view, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(46, 1, .05, 200);
const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true; controls.minDistance = .18; controls.maxDistance = 85; controls.maxPolarAngle = Math.PI * .93; controls.listenToKeyEvents(window);
const studio = new THREE.Group(); scene.add(studio);
studio.add(new THREE.HemisphereLight(0xdbe7ee, 0x6a6259, 2.2));
const keyLight = new THREE.DirectionalLight(0xffe5c1, 3.1); keyLight.position.set(-4, 7, -5); keyLight.castShadow = true; keyLight.shadow.mapSize.set(2048, 2048); keyLight.shadow.camera.left = keyLight.shadow.camera.bottom = -8; keyLight.shadow.camera.right = keyLight.shadow.camera.top = 8; keyLight.shadow.bias = -.0003; keyLight.shadow.normalBias = .02; studio.add(keyLight);
const rim = new THREE.DirectionalLight(0xa9bfd4, 1.7); rim.position.set(3, 4, 5); studio.add(rim);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: '#414c51', roughness: .95 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; studio.add(ground);
const grid = new THREE.GridHelper(8, 16, 0x667575, 0x4a5a5d); grid.position.y = .003; studio.add(grid);
const markers = new THREE.Group(); scene.add(markers);
let actor, actorKind, area, environment, generation = 0, actorGeneration = 0, elapsed = 0, actorTime = 0, lastTime = performance.now(), inspectionBounds = new THREE.Box3(), lastStatsAt = 0, lastVisualAction = 'idle', actionSequence = 0, disposed = false;
const frameTimes = [], party = [];
let partyGeneration = 0;
function positionParty() {
  const spawn = environment?.spawn ?? [0, 0];
  for (const [i, member] of party.entries()) {
    member.root.position.set(spawn[0] + (i - 2) * 1.1, 0, spawn[1] - 1.7);
    member.root.rotation.y = 0;
  }
}
async function changeParty() {
  const request = ++partyGeneration;
  for (const member of party) member.dispose();
  party.length = 0; frameTimes.length = 0;
  if (!ui['party-preview'].checked) return;
  setStatus('准备五人同屏渲染检查…');
  const results = await Promise.allSettled(['harry', 'ron', 'hermione', 'harry', 'ron'].map(id => loadPlayableCharacter(id)));
  if (disposed || request !== partyGeneration) {
    for (const result of results) if (result.status === 'fulfilled') result.value.dispose();
    return;
  }
  for (const result of results) if (result.status === 'fulfilled') { party.push(result.value); scene.add(result.value.root); }
  positionParty(); frameTimes.length = 0;
  setStatus(party.length === 5 ? '五位工坊角色已就位；仅检查本机渲染，不代表五人联网验收。' : '部分人物未加载完成，请重试。', party.length !== 5);
}

function setStatus(text, error = false) { ui.status.textContent = text; ui.status.classList.toggle('error', error); }
function writeUrl() { const q = new URLSearchParams({ model: ui.model.value, scene: ui.scene.value, action: ui.action.value }); if (ui.quest.value) q.set('quest', ui.quest.value); history.replaceState(null, '', `${location.pathname}?${q}`); }
function clearMarkers() { for (const node of [...markers.children]) { node.geometry?.dispose(); node.material?.map?.dispose(); node.material?.dispose(); node.removeFromParent(); } }
function targetLabel(target) {
  const canvas = document.createElement('canvas'); canvas.width = 480; canvas.height = 96; const c = canvas.getContext('2d');
  c.fillStyle = '#10232bdb'; c.fillRect(0, 0, 480, 96); c.fillStyle = '#efdba5'; c.font = '24px system-ui'; c.textAlign = 'center'; c.fillText(target.label.slice(0, 17), 240, 57);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false })); sprite.scale.set(3.2, .64, 1); sprite.position.set(target.position.x, 1.1 + (target.position.y ?? 0), target.position.z); markers.add(sprite);
  const circle = new THREE.Mesh(new THREE.RingGeometry(.35, .43, 48), new THREE.MeshBasicMaterial({ color: 0xddb35f, side: THREE.DoubleSide })); circle.rotation.x = -Math.PI / 2; circle.position.set(target.position.x, .02, target.position.z); markers.add(circle);
}
function refreshTargets() { clearMarkers(); const quest = runtimeQuests.find(q => q.id === ui.quest.value); if (quest && quest.sceneId === ui.scene.value) for (const t of quest.objectives) if (t.position) targetLabel(t); markers.visible = ui.targets.checked; }
function placeActor() {
  if (!actor) return;
  const spawn = environment?.spawn ?? [0, 0]; actor.root.position.set(spawn[0], ui.model.value === 'creature:key' ? 1.4 : 0, spawn[1]); actor.root.rotation.set(0, 0, 0); actor.root.visible = ui['actor-visible'].checked;
  actor.root.updateMatrixWorld(true); inspectionBounds.setFromObject(actor.root);
}
function focus(kind = 'front') {
  if (kind === 'overview') {
    controls.target.set(0, .6, -1); camera.position.set(14, 19, 22);
  } else if (kind === 'spawn' && environment) {
    const [x, z] = environment.spawn; controls.target.set(x, 1.5, z - 5); camera.position.set(x, 2.4, z + 3.5);
  } else if (actor) {
    const center = inspectionBounds.getCenter(new THREE.Vector3()), size = inspectionBounds.getSize(new THREE.Vector3());
    const radius = Math.max(size.x, size.y, size.z, .5), distance = radius * 2.0;
    if (kind === 'face') { center.y = inspectionBounds.max.y - size.y * .14; controls.target.copy(center); camera.position.set(center.x + size.x * .10, center.y + .03, inspectionBounds.min.z - Math.max(.35, size.y * .38)); }
    else { controls.target.copy(center); const angle = kind === 'back' ? Math.PI : kind === 'side' ? -Math.PI / 2 : .20; camera.position.set(center.x + Math.sin(angle) * distance, center.y + radius * .10, center.z - Math.cos(angle) * distance); }
  }
  controls.update();
}
function animateActor(dt, state) {
  if (!actor) return;
  if (actorKind !== 'hero') { actor.update(dt, { ...state, action: state.action === 'flying' ? 'idle' : state.action }); return; }
  const flying = state.action === 'flying', downed = state.action === 'downed';
  actor.setPresentationState({ flying, downed, floorY: 0 });
  actor.root.position.y = THREE.MathUtils.damp(actor.root.position.y, flying ? 1.0 : 0, 8, dt);
  actor.updateTravel(dt, state.speed * dt, true, 0, state.action === 'sit');
  if (state.action !== lastVisualAction) {
    if (state.action === 'attack') actor.playStudioCast(`review-cast-${++actionSequence}`);
    if (state.action === 'hurt') actor.playHit({ strength: .8 });
  }
  lastVisualAction = state.action;
}
async function changeActor() {
  frameTimes.length = 0;
  const request = ++actorGeneration, entry = entryMap.get(ui.model.value);
  try {
    setStatus(entry.type === 'hero' ? `正在加载${entry.name}…` : '正在准备模型…');
    const next = entry.type === 'hero' ? await loadPlayableCharacter(entry.sourceId) : entry.type === 'npc' ? createNpc({ id: entry.sourceId }) : createCreature({ templateId: entry.sourceId });
    if (disposed || request !== actorGeneration) { next.dispose(); return; }
    actor?.dispose(); actor = next; actorKind = entry.type; scene.add(actor.root); actorTime = 0; lastVisualAction = 'idle';
    ui.action.querySelector('option[value="flying"]').disabled = actorKind !== 'hero';
    if (actorKind !== 'hero' && ui.action.value === 'flying') ui.action.value = 'idle';
    animateActor(.016, { action: 'idle', speed: 0 }); placeActor(); focus(); ui.caption.textContent = entry.name; writeUrl(); setStatus(actorKind === 'hero' ? '已加载工坊原角色，可检查扫帚骑乘、倒地与复起。' : '拖动视角检查比例、材质与动作。');
  } catch (error) { if (request === actorGeneration) setStatus(`模型加载失败：${error.message}`, true); console.error(error); }
}
async function changeScene() {
  frameTimes.length = 0;
  const request = ++generation; environment?.dispose(); area?.removeFromParent(); environment = null; area = null; scene.background = new THREE.Color('#303c43'); scene.fog = null; studio.visible = ui.scene.value === 'studio';
  try {
    if (!studio.visible) {
      area = new THREE.Group(); scene.add(area); environment = createSceneEnvironment(ui.scene.value, area, { questId: ui.quest.value || undefined });
      const sky = ({ SC03: 0x2d4352, SC08: 0xb0bca5, SC09: 0xa6c5cc, SC11: 0x3c5363, SC12: 0x43584d })[ui.scene.value];
      if (sky) { scene.background = new THREE.Color(sky); scene.fog = new THREE.Fog(sky, 25, 85); }
      setStatus('加载场景材质…'); const pending = environment.materialReady;
      placeActor(); positionParty(); focus('spawn'); refreshTargets(); writeUrl(); await pending;
      if (generation !== request) return; setStatus(`场景就绪 · 材质 ${area.userData.materialState ?? 'ready'}`);
    } else { placeActor(); positionParty(); focus(); refreshTargets(); writeUrl(); setStatus('中性光照摄影棚就绪。'); }
  } catch (error) { setStatus(`场景加载失败：${error.message}`, true); console.error(error); }
}
ui.model.addEventListener('change', changeActor);
ui.scene.addEventListener('change', () => { const quest = runtimeQuests.find(q => q.id === ui.quest.value); if (quest?.sceneId !== ui.scene.value) ui.quest.value = ''; changeScene(); });
ui.quest.addEventListener('change', () => { const quest = runtimeQuests.find(q => q.id === ui.quest.value); if (quest) ui.scene.value = quest.sceneId; changeScene(); });
ui.action.addEventListener('change', () => { actorTime = 0; animateActor(.001, { action: 'idle', speed: 0 }); writeUrl(); });
ui.targets.addEventListener('change', refreshTargets); ui['actor-visible'].addEventListener('change', () => { if (actor) actor.root.visible = ui['actor-visible'].checked; });
ui['party-preview'].addEventListener('change', changeParty);
ui.speed.addEventListener('input', () => { ui['speed-label'].textContent = `${Number(ui.speed.value).toFixed(1)}×`; });
ui.exposure.addEventListener('input', () => { renderer.toneMappingExposure = Number(ui.exposure.value); ui['exposure-label'].textContent = renderer.toneMappingExposure.toFixed(2); });
for (const button of document.querySelectorAll('[data-camera]')) button.addEventListener('click', () => { if (actor) { actor.root.updateMatrixWorld(true); inspectionBounds.setFromObject(actor.root); } focus(button.dataset.camera); });
ui.toggle.addEventListener('click', () => { const closed = ui.panel.classList.toggle('collapsed'); ui.toggle.textContent = closed ? '展开验收面板' : '收起'; });
addEventListener('keydown', event => { if (event.code === 'Space' && !['INPUT', 'SELECT'].includes(event.target.tagName)) { event.preventDefault(); ui.pause.checked = !ui.pause.checked; } });
function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
addEventListener('resize', resize); resize();
const query = new URLSearchParams(location.search); for (const name of ['model', 'scene', 'quest', 'action']) if ([...ui[name].options].some(option => option.value === query.get(name))) ui[name].value = query.get(name);
if (ui.quest.value) ui.scene.value = runtimeQuests.find(q => q.id === ui.quest.value).sceneId;
changeActor(); changeScene();
function frame(now) {
  requestAnimationFrame(frame);
  const frameMs = now - lastTime;
  if (!document.hidden && frameMs > 0 && frameMs < 1000) { frameTimes.push(frameMs); if (frameTimes.length > 240) frameTimes.shift(); }
  const realDt = Math.min(.06, frameMs / 1000); lastTime = now;
  const dt = ui.pause.checked ? 0 : realDt * Number(ui.speed.value); elapsed += dt; actorTime += dt;
  if (actor) {
    let action = ui.action.value, speed = action === 'walk' ? 1.1 : action === 'run' ? 2.6 : 0;
    const cycle = actorTime % 2.8, windupProgress = Math.min(1, cycle / 1.5), attackPhase = cycle < 1.5 ? 'windup' : 'recover';
    if (action === 'run') action = 'walk';
    if (action === 'revive') action = actorTime % 7 < 2.5 ? 'downed' : 'idle';
    if (action === 'attack' && cycle >= 1.5) action = 'idle';
    if (action === 'hurt' && actorTime % 1.8 > .65) action = 'idle';
    if (dt) animateActor(dt, { time: elapsed, action: action === 'talk' ? 'idle' : action, speed, windupProgress, attackPhase,
      talking: action === 'talk', engaged: action === 'talk', interactionKind: 'service', lookAt: action === 'talk' ? camera.position : undefined });
    if (ui.turntable.checked) actor.root.rotation.y += dt * .25;
  }
  for (const member of party) member.updateTravel(dt, 0, true, 0);
  environment?.update(dt, elapsed); controls.update(); renderer.render(scene, camera);
  if (now - lastStatsAt > 500) {
    lastStatsAt = now; const size = inspectionBounds.getSize(new THREE.Vector3());
    const timings = [...frameTimes].sort((a, b) => a - b), median = timings[Math.floor(timings.length * .5)] ?? 0, p95 = timings[Math.floor(timings.length * .95)] ?? 0;
    ui.details.textContent = `初始尺寸 ${size.x.toFixed(2)} × ${size.y.toFixed(2)} × ${size.z.toFixed(2)} 米\n场景绘制 ${renderer.info.render.calls} 次 · 三角形 ${renderer.info.render.triangles.toLocaleString()}\n显存资源：${renderer.info.memory.geometries} 几何 / ${renderer.info.memory.textures} 纹理\n最近${timings.length}帧：中位 ${median.toFixed(1)}ms · P95 ${p95.toFixed(1)}ms\n当前画布 ${renderer.domElement.width} × ${renderer.domElement.height}；仅此设备此机位。\n生物条目含同类等级变体，不代表 19 种独立骨架。`;
  }
}
requestAnimationFrame(frame);
addEventListener('pagehide', () => {
  disposed = true; actorGeneration++; partyGeneration++;
  for (const member of party) member.dispose();
  party.length = 0; actor?.dispose(); environment?.dispose(); clearMarkers(); controls.dispose(); renderer.dispose();
});
