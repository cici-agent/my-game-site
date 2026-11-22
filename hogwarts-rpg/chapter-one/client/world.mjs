import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { loadPlayableCharacter } from '../presentation/playable-character.mjs';
import { applyEquipmentAppearance, resetEquipmentAppearance } from '../presentation/equipment-appearance.mjs';
import { loadNpc } from '../presentation/npcs.mjs';
import { createCreature } from '../presentation/creatures.mjs';
import { createSceneEnvironment } from './scene-environment.mjs';
import { createSelectionStage, SELECTABLE_HEROES, selectionCameraPose } from './selection-stage.mjs';
import { createSelectionSpells } from './selection-spells.mjs';
import { getSceneNavigation } from './scene-navigation.mjs';
import { WALK_SPEED, RUN_SPEED, FLIGHT_SPEED, JUMP_SPEED, GRAVITY } from '../movement.mjs';
import { contentData } from '../data/index.mjs';
import { abilityState } from './ability-state.mjs';
import { createBoltVisual, createImpactVisual } from './spell-fx.mjs';
import { createEnemyWarning, createEnemyStrike } from './enemy-fx.mjs';
import { resolveAreaId, getWorldArea, getAreaLinks, areaFloor, isAtAreaLink } from '../world-atlas.mjs';
import { trainConversationTargets } from './train-life.mjs';
import { scenePeople, personBody, moveAmongPeople } from '../people.mjs';
import { createWorldStreaming, areaOffset } from './world-streaming.mjs';
import { targetCenter, aimFromPlayer, targetingObstacles, pickAimTarget, targetAvailability, cycleAimTarget } from './targeting.mjs';
import { standingFloor, cameraCollisionFraction, telegraphDescriptors, visibleTargets, correctionPlan, npcAppearanceId, chaseCameraPose, visiblePartyMembers, nameplateWidth, sampleEscort, acceptEscortSnapshot, stepNpcMotion } from './scene-geometry.mjs';

const clamp = THREE.MathUtils.clamp, damp = THREE.MathUtils.damp;
const point = p => new THREE.Vector3(p?.x ?? 0, p?.y ?? 0, p?.z ?? 0);
const identity = c => c?.characterId ?? c?.id;
const shortTargetLabel = target => ({ 'rescue-point': '救援同学', club: '漂浮木棒', mirror: '保护魔镜', passage: '开启通路', music: '演奏', fire: '点亮明火', key: '飞钥匙', safe: '安全棋格', gate: '通道' })[target.id] ?? ({ talk: '交谈', conversation: '交谈', escort: '跟随', boat: '乘船', move: '前往', hold: '查看', collect: '拾取', collection: '观察收藏', cast: '施法练习', flight: '飞行目标', service: '补给与用品', training: '练习与委托', side: '接取委托', exit: '出口', passage: target.travelKind === 'train' ? '乘坐列车' : target.label, puzzle: '调查机关' })[target.kind] ?? '互动';
function disposeGroup(root) {
  if (!root) return;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(o => { if (o.geometry) geometries.add(o.geometry); for (const m of [].concat(o.material ?? [])) { materials.add(m); for (const value of Object.values(m)) if (value?.isTexture) textures.add(value); } });
  geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); root.clear(); root.removeFromParent();
}
function label(text, color = '#e8d8ae') {
  const c = document.createElement('canvas'); c.width = 768; c.height = 96;
  const g = c.getContext('2d'); g.font = '28px "PingFang SC",sans-serif'; g.textAlign = 'center'; g.fillStyle = '#10222bd9'; g.beginPath(); g.roundRect(12, 9, 744, 72, 12); g.fill(); g.fillStyle = color; g.fillText(String(text).slice(0, 28), 384, 56, 720);
  const texture = new THREE.CanvasTexture(c); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false })); sprite.scale.set(3.1, .388, 1); sprite.position.y = 2.45; return sprite;
}
function mesh(geometry, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: .67 })); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
}
function targetMarker(target) {
  const g = new THREE.Group(); g.userData.target = target;
  const color = target.active ? 0xe5bd73 : 0x7d8e8b;
  const ring = new THREE.Mesh(new THREE.RingGeometry(.38, .43, 40), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .65, side: THREE.DoubleSide, depthWrite: false })); ring.rotation.x = -Math.PI / 2; ring.position.y = .025; g.add(ring);
  const tag = label(shortTargetLabel(target), target.active ? '#f2dbab' : '#aab9b5'); tag.scale.set(1.7, .213, 1); tag.position.y = 1.6; tag.visible = false; g.add(tag); g.userData.tag = tag;
  const indicator = mesh(new THREE.OctahedronGeometry(.065), color, 0, 1.32, 0); g.add(indicator); g.userData.indicator = indicator;
  const id = target.id;
  if (id === 'key') {
    const key = mesh(new THREE.TorusGeometry(.09, .018, 8, 28), 0xbec8b6, 0, .12, 0); g.add(key); g.add(mesh(new THREE.CylinderGeometry(.018, .018, .24, 12), 0xbec8b6, 0, -.04, 0));
    for (const sign of [-1, 1]) { const wing = mesh(new THREE.SphereGeometry(.12, 14, 8), 0xe0d9ba, sign * .17, .12, 0); wing.scale.set(1, .15, .60); g.add(wing); }
    tag.position.y = .6; indicator.visible = false;
  } else if (/^piece-|safe/.test(id)) {
    if (id === 'safe') { ring.scale.setScalar(2); ring.material.color.set(0x75c8a2); }
    else { g.add(mesh(new THREE.CylinderGeometry(.24, .30, .13, 24), 0xbeb7a3, 0, .09, 0)); g.add(mesh(new THREE.CylinderGeometry(.16, .24, .6, 24), 0xcfc4ab, 0, .45, 0)); g.add(mesh(new THREE.SphereGeometry(.19, 24, 16), 0xcfc4ab, 0, .87, 0)); }
  } else if (/^potion/.test(id)) {
    const flask = mesh(new THREE.SphereGeometry(.18, 24, 18), 0x79a59a, 0, .8, 0); flask.scale.y = 1.25; g.add(flask); g.add(mesh(new THREE.CylinderGeometry(.047, .062, .22, 20), 0xc0b99e, 0, 1.03, 0));
    g.add(mesh(new RoundedBoxGeometry(.65, .65, .55, 2, .025), 0x72563c, 0, .325, 0));
  } else if (id === 'music') {
    const frame = mesh(new THREE.TorusGeometry(.35, .045, 8, 40), 0xb99a60, 0, .95, 0); frame.scale.y = 1.35; g.add(frame);
    for (let i = -2; i <= 2; i++) g.add(mesh(new THREE.CylinderGeometry(.005, .005, .65, 6), 0xdfc884, i * .1, .95, 0));
    g.add(mesh(new RoundedBoxGeometry(.70, .15, .40, 2, .025), 0x71543b, 0, .4, 0));
  } else if (id === 'fire') {
    g.add(mesh(new THREE.CylinderGeometry(.35, .17, .5, 20), 0x806b4a, 0, .45, 0)); const flame = mesh(new THREE.SphereGeometry(.18, 16, 12), 0xffce78, 0, .82, 0); flame.scale.y = 1.8; flame.material.emissive.set(0xee6d32); flame.material.emissiveIntensity = 1.2; g.add(flame);
  } else if (['hold', 'collect', 'collection', 'cast', 'puzzle', 'mechanism'].includes(target.kind) && !['gate', 'rescue-point', 'club'].includes(id)) {
    g.add(mesh(new RoundedBoxGeometry(.72, .62, .52, 2, .025), 0x755a3b, 0, .32, 0));
    const book = mesh(new RoundedBoxGeometry(.42, .065, .28, 2, .007), 0x8e6541, 0, .675, 0); book.rotation.y = .23; g.add(book);
    const pages = mesh(new THREE.BoxGeometry(.40, .037, .26), 0xd6c9a7, 0, .675, 0); pages.rotation.y = .23; g.add(pages);
  }
  if (target.kind === 'flight' && id !== 'key') { const hoop = mesh(new THREE.TorusGeometry(.7, .04, 8, 40), color, 0, 1.1, 0); g.add(hoop); }
  g.position.copy(point(target.position)); return g;
}
function makeWarning(attack, templateId) { return createEnemyWarning(attack, templateId); }

export function snapshotJourneyEnvironment(scene, area) {
  const lights = [];
  area.traverse(light => { if (light.isHemisphereLight || light.isDirectionalLight || light.isAmbientLight) lights.push({ light, intensity: light.intensity }); });
  return { background: scene.background?.isColor ? scene.background.clone() : scene.background, fog: scene.fog?.clone() ?? null, lights };
}

export function blendJourneyEnvironment(scene, from, to) {
  let finished = false;
  const background = from.background?.isColor ? from.background.clone() : from.background;
  const fog = from.fog?.clone() ?? null;
  scene.background = background; scene.fog = fog;
  function apply(weight) {
    if (background?.isColor && to.background?.isColor) background.copy(from.background).lerp(to.background, weight);
    else scene.background = weight < 1 ? from.background : to.background;
    if (fog && to.fog) {
      fog.color.copy(from.fog.color).lerp(to.fog.color, weight);
      if (fog.isFog && to.fog.isFog) { fog.near = THREE.MathUtils.lerp(from.fog.near, to.fog.near, weight); fog.far = THREE.MathUtils.lerp(from.fog.far, to.fog.far, weight); }
      if (fog.isFogExp2 && to.fog.isFogExp2) fog.density = THREE.MathUtils.lerp(from.fog.density, to.fog.density, weight);
    } else scene.fog = weight < 1 ? from.fog : to.fog;
    from.lights.forEach(({ light, intensity }) => { light.intensity = intensity * (1 - weight); });
    to.lights.forEach(({ light, intensity }) => { light.intensity = intensity * weight; });
  }
  apply(0);
  return {
    update(progress) { if (finished) return; const t = clamp((progress - .45) / .4, 0, 1); apply(t * t * (3 - 2 * t)); },
    // World cancellation retains the destination area and releases the old one,
    // so both completion and cancellation must restore the destination lights.
    finish() { if (finished) return; apply(1); scene.background = to.background?.isColor ? to.background.clone() : to.background; scene.fog = to.fog?.clone() ?? null; finished = true; },
  };
}

export function createStoneWorld(canvas, { onAction, onPose, onHint, onError, onLoaded, onSelectHero, onAim, onJourney, onFlight, onSound } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5)); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.12; renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(48, 1, .07, 180); let area = new THREE.Group(), entities = new THREE.Group(); const targetGroup = new THREE.Group(), effects = new THREE.Group(); scene.add(area, entities, targetGroup, effects);
  const shadowCanvas = document.createElement('canvas'); shadowCanvas.width = shadowCanvas.height = 96; const shadowContext = shadowCanvas.getContext('2d'), gradient = shadowContext.createRadialGradient(48, 48, 5, 48, 48, 45); gradient.addColorStop(0, 'rgba(20,26,24,.34)'); gradient.addColorStop(.42, 'rgba(20,26,24,.15)'); gradient.addColorStop(1, 'rgba(20,26,24,0)'); shadowContext.fillStyle = gradient; shadowContext.fillRect(0, 0, 96, 96);
  const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(1.06, .88), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(shadowCanvas), transparent: true, depthWrite: false, opacity: .85 })); contactShadow.rotation.x = -Math.PI / 2; scene.add(contactShadow);
  const keys = new Set(), velocity = new THREE.Vector2(), peers = new Map(), enemies = new Map(), npcs = new Map(), targets = new Map(), seenEvents = new Set(), projectiles = new Map(), flashes = [];
  const aimCenter = new THREE.Vector2(0, 0), raycaster = new THREE.Raycaster();
  const stage = createSelectionStage({ spells: createSelectionSpells({ onCue: onSound }) }), legacyActors = new Map(), legacyLoading = new Map(); scene.add(stage.root);
  const skillById = new Map(contentData.skills.map(skill => [skill.id, skill]));
  const targetRing = new THREE.Mesh(new THREE.RingGeometry(.57, .64, 64), new THREE.MeshBasicMaterial({ color: 0xf4cf79, transparent: true, opacity: .88, side: THREE.DoubleSide, depthWrite: false }));
  targetRing.rotation.x = -Math.PI / 2; targetRing.visible = false; scene.add(targetRing);
  let lockedTargetId = null, aimState = null, aimStamp = '', lastAimAt = 0, feedback = '', feedbackUntil = 0, jumpPreparation = 0, coyote = 0;
  const moveHistory = new Map(), correctionApplied = new THREE.Vector3(); let movementSteps = [], previousAck = -1, movementInFlight = null, rejectedMove = null;
  let map, actor, selected = 'harry', generation = 0, sceneGeneration = 0, snapshotGeneration = 0, localCastSequence = 0, selection = true, blocked = false, view, character, room, combat, sceneStamp = '', lastTime = 0, elapsed = 0, frameId, dy = 0, grounded = true, flying = false, yaw = 0, pitch = .10, cameraDistance = 4.8, drag, selectionClick, jumpGrace = 0, nearest, lastHint = '', selfPose, seenSelfHp = null, serverAt = 0, receivedAt = 0, disposed = false, correction = null, stalledSnapshots = 0;
  let pendingAbility = null, queuedAbility = null, heldBolt = null;
  const localCasts = new Map(), enemyStrikeEffects = [];
  let landing = false, lastFlightAt = 0, lastFlightStamp = '';
  let journey = null, wasBoatRide = false, boarding = null, crossing = null, crossingCooldown = 0;
  const streaming = createWorldStreaming(scene);
  const floorAt = (p, previousY = p.y) => Math.max(selection ? 0 : areaFloor(resolveAreaId(character), p), standingFloor(p, previousY, map?.walls));
  const serverNow = () => serverAt + Math.max(0, performance.now() - receivedAt);
  function resize() { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); }
  addEventListener('resize', resize); resize();
  function removeNpc(entry) { disposeGroup(entry.tag); entry.actor?.dispose(); }
  function removeEnemy(entry) { disposeGroup(entry.warning); disposeGroup(entry.tag); entry.actor?.dispose(); }
  function disposeEffect(entry) { if (entry.visual) entry.visual.dispose(); else disposeGroup(entry.root); }
  function clearEffects() { for (const entry of projectiles.values()) disposeEffect(entry); projectiles.clear(); for (const flash of flashes) disposeEffect(flash); flashes.length = 0; enemyStrikeEffects.forEach(effect => effect.dispose()); enemyStrikeEffects.length = 0; }
  function finishJourney() { journey = null; crossing = null; onJourney?.({ active: false }); }
  function resetArea(sceneId, encounter) {
    sceneGeneration++; boarding = null; landing = false; resetAbilities();
    for (const entry of npcs.values()) removeNpc(entry);
    for (const entry of enemies.values()) removeEnemy(entry);
    for (const entry of peers.values()) { disposeGroup(entry.tag); entry.actor?.dispose(); }
    npcs.clear(); enemies.clear(); peers.clear(); entities.clear();
    for (const object of targets.values()) disposeGroup(object); targets.clear(); clearEffects();
    if (sceneId === 'SC00') {
      if (streaming.active) streaming.clear(); else { map?.dispose(); area.removeFromParent(); }
      area = new THREE.Group(); scene.add(area); map = createSceneEnvironment('SC00', area);
      const nav = getSceneNavigation('SC00'); map.bounds = nav.bounds; map.walls = nav.walls;
    } else {
      if (!streaming.active) { map?.dispose(); area.removeFromParent(); }
      const entry = streaming.activate(resolveAreaId(character), { questId: view?.quest?.id, combat: encounter });
      area = entry.root; map = entry.map;
      const nav = encounter ? getSceneNavigation(sceneId, { arena: encounter.arena }) : view?.navigation ?? entry.area.navigation;
      map.bounds = nav.bounds; map.walls = nav.walls;
      map.cameraWalls = nav.cameraWalls ?? nav.walls;
      const outdoor = ['SC03','SC08','SC09','SC11','SC12'].includes(sceneId) || !/^SC/.test(entry.area.id);
      const sky = encounter ? 0x2c4148 : outdoor ? 0x667d83 : 0x17252b;
      scene.background = new THREE.Color(sky); scene.fog = new THREE.Fog(sky, outdoor ? 65 : 35, outdoor ? 210 : 100);
    }
    seenSelfHp = null;
  }
  function requestPassage(target) {
    if (crossing || blocked || selection || combat || selfPose?.riding || !target?.active) return;
    const fromAreaId = resolveAreaId(character), request = { edgeId: target.edgeId ?? target.id, fromAreaId, locationEpoch: character.locationEpoch ?? 0 };
    crossing = request;
    Promise.resolve(onAction?.({ type: 'travel', ...request, target })).catch(error => onError?.(error)).finally(() => {
      if (crossing === request) crossing = null;
      crossingCooldown = elapsed + .65;
    });
  }
  async function prepareSelection(heroId = selected) {
    if (!selection) selectionStage(heroId);
    const request = ++generation; selected = heroId;
    try {
      const next = await stage.prepare(heroId);
      if (disposed || request !== generation || !selection) return;
      selected = stage.getState().selected; actor = next; onLoaded?.(selected); return actor;
    } catch (error) { if (!disposed && request === generation) onError?.(error); throw error; }
  }
  async function chooseHero(heroId, asSelection = true) {
    if (selected !== heroId) resetAbilities();
    if (asSelection) {
      if (!selection) selectionStage(heroId);
      selected = heroId; generation++; actor = stage.select(heroId);
      return stage.getState().ready ? actor : prepareSelection(heroId);
    }
    if (actor && selected === heroId && actor.root.parent === scene) return actor;
    const request = ++generation;
    let next;
    if (SELECTABLE_HEROES.includes(heroId)) next = stage.getActor(heroId) ?? await stage.prepare(heroId);
    else {
      // Historical saved characters remain valid; only the selection roster is
      // restricted to the three published workshop characters.
      if (!legacyActors.has(heroId) && !legacyLoading.has(heroId)) legacyLoading.set(heroId, loadPlayableCharacter(heroId).then(value => {
        if (disposed) { value.dispose(); return null; } legacyActors.set(heroId, value); return value;
      }).finally(() => legacyLoading.delete(heroId)));
      next = legacyActors.get(heroId) ?? await legacyLoading.get(heroId);
    }
    if (disposed || request !== generation || selection || !next) return;
    if (actor && actor !== next) actor.root.removeFromParent();
    actor = SELECTABLE_HEROES.includes(heroId) ? stage.enterGameplay(heroId) : next;
    if (!SELECTABLE_HEROES.includes(heroId)) stage.root.visible = false;
    selected = heroId; scene.add(actor.root); actor.root.visible = true;
    actor.resetPresentation({ position: [character?.position?.x ?? 0, character?.position?.y ?? 0, character?.position?.z ?? 0], yaw: character?.position?.yaw ?? 0 });
    return actor;
  }
  function selectionStage(heroId = SELECTABLE_HEROES.includes(selected) ? selected : 'harry') {
    for(const id of SELECTABLE_HEROES){const value=stage.getActor(id);if(value)resetEquipmentAppearance(value);}
    for(const value of legacyActors.values())resetEquipmentAppearance(value);
    finishJourney(true); snapshotGeneration++; generation++; selection = true; selected = heroId;
    for (const entry of peers.values()) { disposeGroup(entry.tag); entry.actor?.dispose(); } peers.clear();
    for (const legacy of legacyActors.values()) legacy.root.removeFromParent();
    character = room = view = combat = null; selfPose = nearest = correction = null; seenEvents.clear(); lastHint = ''; onHint?.(null);
    sceneStamp = 'select'; resetArea('SC00'); scene.background = new THREE.Color(0x17252b); scene.fog = new THREE.Fog(0x17252b, 25, 85); actor = stage.returnToStage(heroId);
    stage.update(0, { aspect: camera.aspect }); const pose = selectionCameraPose(camera.aspect); camera.position.fromArray(pose.eye); camera.lookAt(...pose.focus);
    flying = false; grounded = true; dy = 0; jumpGrace = jumpPreparation = 0; keys.clear(); velocity.set(0, 0); drag = selectionClick = null;
    clearTarget(); resetMovement();
  }
  function updateTargets() {
    const expected = new Set();
    const occupiedHeroes = [character?.heroId, ...(room?.members ?? []).filter(member => resolveAreaId(member) === resolveAreaId(character)).map(member => member.heroId)];
    for (const target of [...visibleTargets(view, combat), ...(combat ? [] : trainConversationTargets(view, occupiedHeroes))]) {
      expected.add(target.id); let object = targets.get(target.id); const signature = JSON.stringify([target.label, target.kind, target.active]);
      if (!object || object.userData.signature !== signature) { if (object) disposeGroup(object); object = targetMarker(target); object.userData.signature = signature; targets.set(target.id, object); targetGroup.add(object); }
      object.userData.target = target; object.position.copy(point(target.position));
    }
    for (const [id, object] of targets) if (!expected.has(id)) { disposeGroup(object); targets.delete(id); }
    const desiredNpcs = scenePeople(view, combat, occupiedHeroes), allowed = new Set(desiredNpcs.map(n => n.name));
    for (const [id, entry] of npcs) if (!allowed.has(id)) {
      removeNpc(entry); npcs.delete(id);
    }
    for (const target of desiredNpcs) {
      const { name } = target; let npc = npcs.get(name);
      const escort=target.escort?acceptEscortSnapshot(npc?.escort,target.escort,view.serverTime):null;
      const predicted=sampleEscort(escort,serverNow()),position=predicted?.position??target.position;
      if(npc?.escort?.kind==='boat'&&escort&&escort.kind!=='boat')npc.lastBoatArrival=view.lastBoatArrival??{position:npc.escort.destination??escort.origin??escort.position,arrivedAt:escort.startedAt??view.serverTime};
      if (!npc) {
        npc = { target: point(position), name, generation: sceneGeneration }; npcs.set(name, npc);
        const variant = target.appearanceId ?? npcAppearanceId(name);
        const loading = ['harry', 'ron', 'hermione'].includes(variant) ? loadPlayableCharacter(variant).then(student => ({ root: student.root, dispose: student.dispose, update(dt, state) { student.updateTravel(dt, Math.max(0, state.speed ?? 0) * dt, true, 0, state.action === 'sit'); student.setExpressionContext({ mood: 'curious', talking: state.talking }); } })) : loadNpc({ id: variant, name });
        loading.then(loaded => {
          if (disposed || npcs.get(name) !== npc || npc.generation !== sceneGeneration || npc.actor) { loaded.dispose(); return; }
          npc.actor = loaded; const height = new THREE.Box3().setFromObject(loaded.root).max.y; npc.tag = label(name, '#c9dfcf'); npc.tag.scale.set(2.0, .25, 1); npc.tag.position.y = Number.isFinite(height) ? height + .22 : 2.5; loaded.root.add(npc.tag); loaded.root.position.copy(npc.target); loaded.root.rotation.y = npc.facing ?? Math.PI; entities.add(loaded.root);
          loaded.root.visible = true;
        }).catch(onError);
      }
      npc.target.copy(point(position)); npc.appearanceId = target.appearanceId; npc.escort=escort; npc.routeSpeed=predicted?.speed??0; npc.boat = (escort?.kind??target.kind) === 'boat' && (predicted?predicted.progress>0&&predicted.progress<1:target.seated); npc.seated = npc.boat||(!escort&&target.seated); npc.facing = target.yaw; npc.phase = target.phase; npc.targetId = escort?.targetId??target.targetId; npc.kind = escort?.kind??target.kind;
    }
  }

  function updateEscortPresentation() {
    if(selection||!view)return;
    const now=serverNow();let current=null,currentEntry=null;
    for(const entry of npcs.values())if(entry.escort) {
      const sample=sampleEscort(entry.escort,now);entry.target.set(sample.position.x,sample.position.y,sample.position.z);entry.routeSpeed=sample.speed;
      if(sample.kind==='boat'){entry.boat=sample.progress>0&&sample.progress<1;entry.seated=entry.boat;}
      if(entry.name===view.escort?.npc){current=sample;currentEntry=entry;}
      const marker=targets.get(sample.targetId);
      if(marker){marker.position.set(sample.position.x,sample.position.y,sample.position.z);marker.userData.target.position={...sample.position};}
    }
    const arrival=view.lastBoatArrival??character?.lastBoatArrival??currentEntry?.lastBoatArrival;
    if(current?.kind==='boat')map.setEscort?.(current);
    else if(arrival?.position) {
      // The finished ship stays at its dock while the next walking leg starts.
      if(map.getBoatPose?.()?.phase!=='docked')map.setEscort?.({kind:'boat',progress:1,position:arrival.position});
    } else if(current)map.setEscort?.(current);
  }

  function syncPeers() {
    const members = visiblePartyMembers(room, character, combat, serverNow()), allowed = new Set();
    for (const member of members) {
      const p = member.character ?? member, id = identity(p);
      if (!id || id === identity(character)) continue;
      allowed.add(id); let entry = peers.get(id); const battlePlayer = combat?.players?.[id];
      if (entry && entry.heroId !== p.heroId) { disposeGroup(entry.tag); entry.actor?.dispose(); peers.delete(id); entry = null; }
      if (!entry) {
        entry = { heroId: p.heroId, target: point(battlePlayer?.position ?? p.position), yaw: p.position?.yaw ?? 0 }; peers.set(id, entry);
        loadPlayableCharacter(p.heroId ?? 'harry').then(loaded => {
          if (disposed || peers.get(id) !== entry) { loaded.dispose(); return; }
          entry.actor = loaded; applyEquipmentAppearance(loaded, entry.loadout ?? p); entry.tag = label(p.name ?? '同行巫师', '#bee4e2'); entry.tag.scale.set(1.2, .15, 1); entry.tag.position.y = loaded.capabilities.appearance === 'existing-procedural-character' ? 1.95 : (loaded.debugSnapshot().statePresentation.hipHeight * 2 + .25); entry.tag.userData.standingHeight = entry.tag.position.y; loaded.root.add(entry.tag); loaded.root.position.copy(entry.target); entities.add(loaded.root);
        }).catch(onError);
      }
      entry.loadout=p;if(entry.actor)applyEquipmentAppearance(entry.actor,p);entry.target.copy(point(battlePlayer?.position ?? p.position)); entry.yaw = battlePlayer?.yaw ?? p.position?.yaw ?? 0; entry.hp = battlePlayer?.hp ?? p.hp; entry.flying = !combat && Boolean(p.flying); entry.lastSeenAt = p.lastSeenAt;
    }
    for (const [id, entry] of peers) if (!allowed.has(id)) { disposeGroup(entry.tag); entry.actor?.dispose(); peers.delete(id); }
  }
  function flashText(text, at, color = '#f7dfb7') { const root = label(text, color); root.position.copy(at).add(new THREE.Vector3(0, .4, 0)); root.scale.multiplyScalar(.65); effects.add(root); flashes.push({ root, life: .85, max: .85, rise: .45 }); }
  function burst(at, color = 0xffdb96) { const root = new THREE.Mesh(new THREE.SphereGeometry(.10, 12, 8), new THREE.MeshBasicMaterial({ color, transparent: true })); root.position.copy(at); effects.add(root); flashes.push({ root, life: .25, max: .25, expand: true }); }
  function removeProjectile(id) { const entry = projectiles.get(id); if (entry) { disposeEffect(entry); projectiles.delete(id); } }
  function spawnBolt(id, origin, direction, ownerId, { predicted = false, duration = .5 } = {}) {
    if (projectiles.has(id)) return;
    const visual = createBoltVisual({ origin, direction }); effects.add(visual.root);
    projectiles.set(id, { root: visual.root, visual, direction: direction.clone(), remaining: duration, ownerId, predicted });
  }
  function impact(at, kind) {
    const visual = createImpactVisual({ kind, position: at }); effects.add(visual.root);
    flashes.push({ root: visual.root, visual, life: visual.duration, max: visual.duration });
  }
  function presentEvent(event) {
    const person = event.playerId === identity(character) ? actor : peers.get(event.playerId)?.actor;
    const now = serverNow(), age = now - (event.at ?? now);
    if (age > 1200) {
      // Snapshots retain an event history for reconciliation. A reconnect must
      // consume those IDs without replaying a screenful of historical hits.
      const local = event.playerId === identity(character) ? localCasts.get(event.actionId) : null;
      if (local) {
        if (event.type === 'action_cancelled') setAbilityRequestStatus(event.actionId, 'rejected');
        else if (['action_started', 'action_released', 'spell_missed', 'wall_hit', 'enemy_damaged'].includes(event.type)) {
          local.confirmed = true;
          if (event.type !== 'action_started') { local.released = true; removeProjectile(event.actionId); }
          setAbilityRequestStatus(event.actionId, 'settled');
        }
      }
      const current = combat?.players?.[event.playerId]?.action;
      const deadline = (event.channelEndAt ?? event.releaseAt ?? event.at + 120) + 380;
      const stillActive = event.type === 'action_started' && current?.id === event.actionId && deadline > now;
      if (!stillActive) { if (local && event.type === 'action_started') local.released = true; return; }
    }
    if (event.type === 'action_started') {
      const release = event.releaseAt ?? event.at + 120;
      const local = event.playerId === identity(character) ? localCasts.get(event.actionId) : null;
      if (local) { local.confirmed = true; if (!local.released) local.releaseAt = release; setAbilityRequestStatus(event.actionId, 'settled'); }
      if (!local?.cancelled) person?.playAuthoritativeAction({ actionId: event.actionId ?? event.id, skillId: event.skillId, startAtMs: event.startAt ?? event.at, releaseAtMs: release, holdUntilMs: event.channelEndAt, endAtMs: (event.channelEndAt ?? release) + 380, nowMs: serverNow(), confirmPreview: Boolean(local) });
    }
    if (event.type === 'action_cancelled') {
      person?.cancelAction(event.actionId, event.reason);
      if (event.playerId === identity(character)) setAbilityRequestStatus(event.actionId, 'rejected');
    }
    if (event.type === 'action_released' && !['dodge', 'interact'].includes(event.skillId)) {
      const late = Math.max(0, (serverNow() - event.at) / 1000), direction = point(event.direction ?? { x: 0, y: 0, z: -1 }).normalize();
      const origin = person?.getCastOriginWorld(new THREE.Vector3()) ?? point(event.position);
      if (event.skillId === 'bolt') {
        const local = event.playerId === identity(character) ? localCasts.get(event.actionId) : null;
        if (!local?.released && !local?.cancelled) spawnBolt(event.actionId, origin, direction, event.playerId, { duration: Math.max(.12, .5 - late) });
        if (local) { local.released = true; local.confirmed = true; setAbilityRequestStatus(event.actionId, 'settled'); }
        const projectile = projectiles.get(event.actionId);
        if (projectile) { projectile.predicted = false; projectile.direction.copy(direction); }

      } else if (event.skillId === 'H1') {
        const end = event.endPosition ? point(event.endPosition) : point(event.position).addScaledVector(direction, 12);
        const root = new THREE.Line(new THREE.BufferGeometry().setFromPoints([origin, end]), new THREE.LineBasicMaterial({ color: 0x9ddcdb, transparent: true, opacity: .85 })); effects.add(root); flashes.push({ root, life: .15, max: .15 });
      } else if (late < .8) burst(origin, /potion|N1|rescue/.test(event.skillId) ? 0x89caa1 : 0x9ac9e1);
    }
    if (['spell_missed', 'wall_hit', 'enemy_damaged'].includes(event.type) && event.actionId && localCasts.has(event.actionId)) { const local = localCasts.get(event.actionId); local.released = true; local.confirmed = true; }
    if (event.type === 'spell_missed' || event.type === 'wall_hit') {
      const projectile = projectiles.get(event.actionId), at = event.position ? point(event.position) : projectile?.root.position.clone() ?? person?.getCastOriginWorld(new THREE.Vector3());
      if (at) { if (event.type === 'wall_hit') impact(at, 'wall'); else burst(at, 0x9eafa8); if (event.playerId === identity(character)) flashText(event.type === 'wall_hit' ? '被遮挡' : '未命中', at, '#d3d4bc'); } removeProjectile(event.actionId);
    }
    if (event.playerId === identity(character)) { if (event.type === 'enemy_damaged') combatMessage(`命中 · ${Math.round(event.damage)} 伤害`); if (event.type === 'wall_hit') combatMessage('咒语被障碍挡住'); if (event.type === 'spell_missed') combatMessage('未命中 · 试试点击敌人或按 Tab 锁定'); if (event.type === 'phase_locked') combatMessage('敌人受机制保护，先完成场地目标'); }
    if (event.type === 'enemy_damaged') {
      const enemy = enemies.get(event.enemyId); if (enemy) enemy.hurtUntil = elapsed + .2;
      const at = point(event.impactPosition ?? event.position); if (!event.impactPosition) at.y += 1; impact(at, 'target'); flashText(String(Math.round(event.damage)), at);
      if (event.actionId) removeProjectile(event.actionId);
      else for (const [id, projectile] of projectiles) if (projectile.ownerId === event.playerId) removeProjectile(id);
    }
    if (event.type === 'enemy_attack_resolved') { const enemy = enemies.get(event.enemyId); if (enemy) enemy.recoverUntil = elapsed + .65; const strike = createEnemyStrike({ attack: event.attack, templateId: event.templateId ?? enemy?.state.templateId, hit: event.hit }); if (strike) { effects.add(strike.root); enemyStrikeEffects.push(strike); } }
    if (event.type === 'player_damaged') person?.playHit({ strength: .8 });
  }
  function syncCombat() {
    if (!combat) { for (const entry of enemies.values()) removeEnemy(entry); enemies.clear(); return; }
    const allowed = new Set();
    for (const state of Object.values(combat.enemies ?? {})) {
      allowed.add(state.id); let entry = enemies.get(state.id);
      if (!entry) { const loaded = createCreature({ templateId: state.templateId, name: state.name }); entry = { actor: loaded, root: loaded.root, target: point(state.position), hp: state.hp }; entry.tag = label(state.name, '#ecc4a3'); loaded.root.add(entry.tag); entities.add(loaded.root); enemies.set(state.id, entry); }
      entry.target.copy(point(state.position)); entry.hp = state.hp; entry.state = state;
      entry.tag.position.y = (state.collisionBase ?? 0) + (state.collisionHeight ?? 2.1) + .24;
      if (state.attack?.id !== entry.warningId) { disposeGroup(entry.warning); entry.warning = state.attack ? makeWarning(state.attack, state.templateId) : null; entry.warningId = state.attack?.id; if (entry.warning) entities.add(entry.warning); }
    }
    for (const [id, entry] of enemies) if (!allowed.has(id)) { removeEnemy(entry); enemies.delete(id); }
    const self = combat.players?.[identity(character)]; if (self) { if (seenSelfHp !== null && self.hp < seenSelfHp) actor?.playHit({ strength: .7 }); seenSelfHp = self.hp; }
    for (const event of combat.events ?? []) { const id = event.id ?? `${combat.id}:${event.seq}`; if (seenEvents.has(id)) continue; seenEvents.add(id); if (seenEvents.size > 1000) seenEvents.delete(seenEvents.values().next().value); presentEvent(event); }
  }
  async function setSnapshot(nextCharacter, nextRoom, nextView) {
    const snapshot = ++snapshotGeneration;
    const hadDungeonFlight = view?.dungeon?.flightEnabledFor?.includes(identity(nextCharacter));
    const previous = character, previousView = view; character = nextCharacter; room = nextRoom; view = nextView; selection = false; combat = room?.encounter ?? character.encounter;
    const clock = performance.now(), sample = view.serverTime ?? room?.serverTime ?? Date.now();
    const compensated = sample + Math.min(250, Math.max(0, view.clientTiming?.rttMs ?? 0) / 2);
    serverAt = previous && identity(previous) === identity(character) ? Math.max(serverNow(), compensated) : compensated; receivedAt = clock;
    if (previous && identity(previous) !== identity(character)) resetAbilities();
    const areaId = resolveAreaId(character), previousAreaId = previous ? resolveAreaId(previous) : null;
    const stamp = `${areaId}:${combat?.id ?? ''}`;
    const changed = stamp !== sceneStamp;
    const linked = previousAreaId && previousAreaId !== areaId && getAreaLinks(previousAreaId).find(link => link.to === areaId && link.kind === 'walk');
    const trainArrival = previousAreaId !== areaId && previous?.sceneId === 'SC02' && character.sceneId === 'SC02' && character.lastTransition?.kind === 'train';
    const continuous = changed && actor && previous && identity(previous) === identity(character) && (linked || trainArrival) && !combat;
    if (changed) {
      if (continuous && linked) {
        const delta = point(areaOffset(previousAreaId, areaId));
        actor.root.position.add(delta); camera.position.add(delta);
      }
      resetMovement(); clearTarget(); jumpPreparation = 0; wasBoatRide = false; sceneStamp = stamp;
      resetArea(view.sceneId, combat); dy = 0; grounded = true; flying = false; stalledSnapshots = 0;
      crossing = null; crossingCooldown = elapsed + .65; targetGroup.position.set(0, 0, 0);
      if (!continuous) {
        velocity.set(0, 0); keys.clear(); yaw = character.position.yaw ?? 0;
        if (actor) actor.resetPresentation({ position: [character.position.x, character.position.y ?? 0, character.position.z], yaw });
      }
    }
    if (!actor || selected !== character.heroId || actor.root.parent !== scene) await chooseHero(character.heroId, false);
    if (disposed || selection || snapshot !== snapshotGeneration) return;
    if(actor)applyEquipmentAppearance(actor,character);
    if (actor && !journey) {
      const p = point(character.position), ack = character.lastAcceptedMoveSequence ?? -1;
      const plan = correctionPlan(actor.root.position, p, previous?.position, stalledSnapshots, { acknowledgedSequence: ack, previousAcknowledgedSequence: previousAck, acknowledgedPosition: acknowledgedPoint(ack) });
      if (changed || !previous || identity(previous) !== identity(character)) { actor.root.position.copy(p); if (!continuous) velocity.set(0, 0); correction = null; }
      else if (plan.mode === 'snap') { recordCorrection(point(plan.target).sub(actor.root.position));actor.root.position.copy(point(plan.target)); correction = null; }
      else if (ack > previousAck && moveHistory.has(ack)) correction = plan.mode === 'smooth' ? point(plan.delta) : null;
      else if (plan.mode === 'smooth' && plan.delta) correction = (correction ?? new THREE.Vector3()).add(point(plan.delta));
      previousAck = Math.max(previousAck, ack);
      if (movementInFlight && ack >= movementInFlight.sequence) movementInFlight = null;
      for (const seq of moveHistory.keys()) if (seq <= ack) moveHistory.delete(seq);
    }
    if (changed || !previous || identity(previous) !== identity(character)) { flying = Boolean(character.flying); landing = false; }
    if (!hadDungeonFlight && view.dungeon?.flightEnabledFor?.includes(identity(character))) setFlying(true);
    // A completed flight objective may revoke ascent. Keep the mounted descent
    // until actual ground contact instead of submitting a high-altitude jump.
    if (flying && !canMountBroom()) { landing = true; dy = Math.min(0, dy); }
    updateTargets(); syncPeers(); syncCombat(); updateEscortPresentation(); map.setContext?.(view); map.setTrainStopped?.(!view.transit); streaming.setTransit?.(Boolean(view.transit));
  }
  function canMountBroom() {
    if (combat) return false;
    if (typeof view?.flight?.allowed === 'boolean') return view.flight.allowed;
    // Compatibility with old snapshots must not authorize a dungeon flight
    // merely because a key target is visible before the broom mechanism.
    if (view?.sceneId === 'SC14') return Boolean(view.dungeon?.flightEnabledFor?.includes(identity(character)));
    return Boolean(view?.targets?.some(t => t.active && t.kind === 'flight') || character?.skills?.includes('broom') && view?.sceneId === 'SC09');
  }
  function setFlying(value) {
    if (selection || journey || !actor || (combat?.players?.[identity(character)]?.hp ?? character?.hp) <= 0) return false;
    if (value) {
      if (blocked || !canMountBroom()) return false;
      if (!flying) { flying = true; grounded = false; dy = 0; jumpGrace = jumpPreparation = 0; actor.cancelJumpPreparation?.(); }
      // An explicit takeoff request cannot undo a descent already in progress.
    } else if (flying) { landing = true; dy = Math.min(0, dy); }
    publishFlight(true); return Boolean(flying);
  }
  function getFlightState() {
    const floor = actor ? floorAt(actor.root.position) : 0;
    const available = !selection && !journey && canMountBroom(), height = Math.max(0, (actor?.root.position.y ?? 0) - floor);
    return { available, mode: flying ? landing ? 'landing' : 'flying' : 'grounded', height: Math.round(height * 100) / 100, verticalSpeed: Math.round(dy * 100) / 100, canAscend: Boolean(flying && !landing && available && !blocked), canDescend: Boolean(flying && height > .015 && !blocked), landing: Boolean(flying && landing), controls: { ascend: 'Space', descend: 'Z / Ctrl', toggle: 'X' } };
  }
  function publishFlight(force = false) {
    if (!force && elapsed - lastFlightAt < .1) return;
    lastFlightAt = elapsed; const state = getFlightState(), stamp = JSON.stringify(state);
    if (force || stamp !== lastFlightStamp) { lastFlightStamp = stamp; onFlight?.(state); }
  }
  function scaleNameplate(tag, at, maximum = 1.25) {
    const distance = camera.position.distanceTo(at), width = nameplateWidth(distance, camera.fov, camera.aspect, maximum);
    tag.scale.set(width, width / 8, 1); return distance;
  }
  function nearbyPeopleBodies() {
    const bodies = [];
    for (const [id, entry] of npcs) {
      if (entry.boat) continue;
      bodies.push(personBody({ id, appearanceId: entry.appearanceId ?? npcAppearanceId(entry.name), position: entry.actor?.root.position ?? entry.target, seated: entry.seated }));
    }
    for (const [id, entry] of peers) {
      if (Number.isFinite(entry.lastSeenAt) && serverNow() - entry.lastSeenAt > 30000) continue;
      bodies.push(personBody({ id, appearanceId: entry.heroId, position: entry.actor?.root.position ?? entry.target, downed: entry.hp <= 0 }));
    }
    return bodies;
  }
  function resetMovement() { correctionApplied.set(0,0,0); selfPose = null; movementSteps = []; moveHistory.clear(); previousAck = -1; movementInFlight = rejectedMove = null; correction = null; }
  function recordCorrection(delta) {correctionApplied.add(delta);for(const step of movementSteps){step.position.x+=delta.x;step.position.y+=delta.y;step.position.z+=delta.z;}}
  function acknowledgedPoint(sequence) {const sent=moveHistory.get(sequence);if(!sent)return undefined;const applied=correctionApplied.clone().sub(sent.correctionAtSend??new THREE.Vector3());return{x:sent.x+applied.x,y:sent.y+applied.y,z:sent.z+applied.z};}
  function noteMovementSent(sequence, position) {
    moveHistory.set(sequence, { ...position, correctionAtSend: correctionApplied.clone() }); movementInFlight = { sequence, at: performance.now() };
    while (moveHistory.size > 128) moveHistory.delete(moveHistory.keys().next().value);
  }
  function takeMovementPacket() {
    if (!selfPose || selection || journey) return null;
    const consumed = movementSteps.splice(0, 96), position = consumed.length ? consumed.at(-1).position : selfPose;
    return { areaId: resolveAreaId(character), locationEpoch: character.locationEpoch ?? 0, position: { x: position.x, y: position.y, z: position.z, yaw: position.yaw }, steps: consumed.map(s => s.delta), sprint: consumed.some(s => s.sprint) || selfPose.sprint, flying: consumed.some(s=>s.flying)||selfPose.flying };
  }
  function rejectMovement(sequence, position) {
    const sent = acknowledgedPoint(sequence); if (!sent || !position || !actor) return;
    const plan = correctionPlan(actor.root.position, position, character?.position, 0, { acknowledgedPosition: sent, rejectedMovement: true });
    if (plan.delta) correction = point(plan.delta);
    movementInFlight = null; moveHistory.delete(sequence);
  }
  function clearTarget() { stopAbilityInput(); const existed = lockedTargetId !== null; lockedTargetId = null; aimState = null; aimStamp = ''; targetRing.visible = false; onAim?.(null); return existed; }
  function combatMessage(message) { feedback = message; feedbackUntil = elapsed + 2.1; aimStamp = ''; }
  function aimCandidates(friendly = false) {
    const entries = friendly ? [...peers].filter(([,p]) => p.actor).map(([id,p]) => ({ id, hp: p.hp, position: p.actor.root.position, collisionHeight: p.hp <= 0 ? .6 : 1.7, radius: .32, name: p.name ?? '同伴' }))
      : [...enemies].map(([id,e]) => ({ ...e.state, id, hp: e.hp, position: e.root.position }));
    return entries.map(target => { const p = point(targetCenter(target)).project(camera); return { ...target, onScreen: p.z > -1 && p.z < 1 && Math.abs(p.x) < 1 && Math.abs(p.y) < 1, screenDistance: Math.hypot(p.x, p.y) }; });
  }
  function aimFromRay(ndc, friendly = false, purpose = 'hostile') {
    raycaster.setFromCamera(ndc, camera);
    const candidates = aimCandidates(friendly), origin = raycaster.ray.origin, end = raycaster.ray.at(80, new THREE.Vector3());
    const target = pickAimTarget(origin, end, candidates, targetingObstacles(map?.walls), { purpose });
    return { target, point: target ? targetCenter(target) : raycaster.ray.at(cameraDistance + 12, new THREE.Vector3()) };
  }
  function getAim(skillId = 'bolt', ndc = null) {
    const friendly = ['rescue', 'N1'].includes(skillId), candidates = aimCandidates(friendly);
    const locked = !friendly && lockedTargetId ? candidates.find(t => t.id === lockedTargetId && t.hp > 0) : null;
    const picked = locked && !ndc ? { target: locked, point: targetCenter(locked) } : aimFromRay(ndc ?? aimCenter, friendly, skillId === 'rescue' ? 'rescue' : friendly ? 'heal' : 'hostile');
    const aimPoint = { x: picked.point.x, y: picked.point.y, z: picked.point.z };
    return { aim: aimFromPlayer(actor.root.position, aimPoint), aimPoint, targetId: picked.target?.id };
  }
  function cycleTarget() {
    if (selection || blocked || !actor) return;
    const next = cycleAimTarget(aimCandidates(), lockedTargetId, actor.root.position, targetingObstacles(map?.walls));
    lockedTargetId = next?.id ?? null; aimStamp = '';
    if (!next) combatMessage('视野内没有可锁定的敌人');
  }
  function updateAim() {
    if (selection || journey || !actor || !combat || combat.status !== 'active') { if (aimState) clearTarget(); return; }
    if (elapsed - lastAimAt < .08) return; lastAimAt = elapsed;
    const candidates = aimCandidates();
    if (lockedTargetId && !candidates.some(t => t.id === lockedTargetId && t.hp > 0)) lockedTargetId = null;
    const target = candidates.find(t => t.id === lockedTargetId) ?? aimFromRay(aimCenter).target;
    const availability = targetAvailability(actor.root.position, target, 12, targetingObstacles(map?.walls));
    targetRing.visible = Boolean(target && !blocked);
    if (target) { targetRing.position.set(target.position.x, target.position.y + .025, target.position.z); targetRing.scale.setScalar(Math.max(1, (target.radius ?? .45) / .55)); targetRing.material.color.set(availability.status === 'ready' ? 0xf4cf79 : 0xd87d66); }
    aimState = { targetId: target?.id ?? null, name: target?.name ?? '', hp: target?.hp ?? 0, maxHp: target?.maxHp ?? 0, locked: Boolean(lockedTargetId), status: availability.status, distance: Math.round(availability.distance * 10) / 10, feedback: elapsed < feedbackUntil ? feedback : '', busy: Boolean(blocked) };
    const stamp = JSON.stringify(aimState); if (stamp !== aimStamp) { aimStamp = stamp; onAim?.(aimState); }
  }
  function getAbilitySnapshot() {
    return { character, combat, now: serverNow(), pending: pendingAbility ? { ...pendingAbility } : null, queuedSkillId: queuedAbility?.skillId ?? null };
  }
  function stopAbilityInput() { heldBolt = queuedAbility = null; }
  function resetAbilities() {
    stopAbilityInput();
    for (const [id, cast] of localCasts) if (!cast.confirmed) cast.actor.cancelAction(id, 'context-changed');
    localCasts.clear(); pendingAbility = null;
  }
  function setAbilityRequestStatus(id, status) {
    const cast = localCasts.get(id);
    if (status === 'retrying') { if (pendingAbility?.clientActionId === id) pendingAbility.status = 'retrying'; return; }
    if (!['settled', 'rejected'].includes(status)) return;
    if (pendingAbility?.clientActionId === id) pendingAbility = null;
    if (status === 'rejected' && cast) {
      cast.cancelled = true; cast.actor.cancelAction(id, 'request-rejected'); removeProjectile(id); stopAbilityInput();
    }
  }
  function cast(skillId, ndc = null, { automatic = false } = {}) {
    if (!actor || selection || blocked || journey || selfPose?.riding || disposed) return false;
    // Unknown network outcomes retain their exact request ID. No queued input
    // is allowed to overwrite or submit alongside that request.
    if (pendingAbility) { if (!automatic) combatMessage(pendingAbility.status === 'retrying' ? '等待连接恢复后确认施法' : '等待服务器确认施法'); return false; }
    const state = abilityState({ ...getAbilitySnapshot(), skillId }), skill = skillById.get(skillId);
    if (!state.enabled) {
      const wait = Math.max(state.cooldownRemainingMs, state.gcdRemainingMs, state.cast?.remainingMs ?? 0);
      const queueable = !automatic && skillId !== 'bolt' && ['cooldown', 'gcd'].includes(state.status) && wait > 0 && wait <= 400
        && abilityState({ ...getAbilitySnapshot(), skillId, now: serverNow() + wait + 1 }).enabled;
      if (queueable) {
        const aim = getAim(skillId, ndc);
        queuedAbility = { skillId, ndc: ndc?.clone() ?? null, targetId: aim.targetId ?? null, expiresAt: serverNow() + wait + 500 };
        combatMessage(`${state.name} · 已排队`);
      } else if (!automatic) combatMessage(state.reason);
      if (heldBolt && !['cooldown', 'gcd', 'casting', 'pending', 'retrying'].includes(state.status)) heldBolt = null;
      return false;
    }
    if (ndc && !['rescue', 'N1'].includes(skillId)) { const clicked = aimFromRay(ndc).target; lockedTargetId = clicked?.id ?? null; aimStamp = ''; }
    const mechanism = skillId === 'levitate' && nearest?.active && nearest.kind === 'mechanism' && nearest.skillId === 'levitate' ? nearest : null;
    const aim = mechanism ? { targetId: mechanism.id, aimPoint: { ...mechanism.position }, aim: aimFromPlayer(actor.root.position, mechanism.position) } : getAim(skillId, ndc);
    if (!mechanism && aim.targetId && ['bolt','H1','R1','M1','levitate','G1','mark'].includes(skillId)) {
      const status = targetAvailability(actor.root.position, aimCandidates().find(t => t.id === aim.targetId), skill?.rangeMeters || 12, targetingObstacles(map?.walls));
      if (status.status === 'far' || status.status === 'blocked') {
        if (!automatic) combatMessage(status.status === 'far' ? `目标太远，请靠近至 ${skill?.rangeMeters || 12} 米内` : '前方有障碍，请移到能看见目标的位置');
        return false;
      }
    }
    if (['R1','M1','levitate','rescue'].includes(skillId) && !aim.targetId && !nearest?.skillId) { if (!automatic) combatMessage('先点击目标或按 Tab 锁定，再施放技能'); return false; }
    actor.root.rotation.y = Math.atan2(-aim.aim.x, -aim.aim.z);
    const now = serverNow(), clientActionId = `cast-${Date.now().toString(36)}-${(++localCastSequence).toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
    const releaseAt = now + state.castSeconds * 1000, holdUntil = releaseAt + (skillId === 'levitate' && combat ? 2000 : 0);
    const preview = { actor, skillId, aim, startedAt: now, releaseAt, confirmed: false, released: false, cancelled: false };
    localCasts.set(clientActionId, preview);
    while (localCasts.size > 128) localCasts.delete(localCasts.keys().next().value);
    pendingAbility = { id: clientActionId, clientActionId, skillId, startedAt: now, status: 'sending' };
    queuedAbility = null;
    if (heldBolt && skillId === 'bolt') { heldBolt.targetId = aim.targetId ?? null; heldBolt.nextAt = now + Math.max(600, state.gcdMs); }
    if (!['dodge', 'mark', 'light', 'broom'].includes(skillId)) actor.playAuthoritativeAction({ actionId: clientActionId, skillId, startAtMs: now, releaseAtMs: releaseAt, holdUntilMs: holdUntil, endAtMs: holdUntil + 380, nowMs: now, preview: true });
    combatMessage(`${state.name} · 施放中`);
    const failed = error => {
      if (disposed || !localCasts.has(clientActionId)) return;
      setAbilityRequestStatus(clientActionId, error?.code === 'NETWORK' ? 'retrying' : 'rejected');
    };
    try { Promise.resolve(onAction?.({ type: 'skill', skillId, ...aim, clientActionId })).then(() => setAbilityRequestStatus(clientActionId, 'settled'), failed); }
    catch (error) { failed(error); onError?.(error); }
    return true;
  }
  function advanceAbilityInput() {
    if (selection || blocked || journey || selfPose?.riding || !actor || (combat?.players?.[identity(character)]?.hp ?? character?.hp) <= 0) { stopAbilityInput(); return; }
    const now = serverNow(), alive = id => !id || (combat?.enemies?.[id]?.hp ?? 0) > 0;
    if (heldBolt?.targetId && !alive(heldBolt.targetId)) heldBolt = null;
    if (queuedAbility && (queuedAbility.expiresAt < now || queuedAbility.targetId && combat?.enemies?.[queuedAbility.targetId]?.hp <= 0)) queuedAbility = null;
    for (const [id, cast] of localCasts) {
      if (!cast.soundReleased && !cast.cancelled && cast.actor === actor && now >= cast.releaseAt) {
        cast.soundReleased = true;
        if (!['dodge', 'interact', 'broom'].includes(cast.skillId)) onSound?.({ kind: /potion|rescue|N1/.test(cast.skillId) ? 'heal' : 'cast', skillId: cast.skillId, actionId: id });
      }
      if (cast.skillId !== 'bolt' || cast.released || cast.cancelled || cast.actor !== actor || now < cast.releaseAt) continue;
      cast.released = true;
      // This is a visual prediction only: no damage, collision result, hit text
      // or resource change is produced until an authoritative event arrives.
      const origin = actor.getCastOriginWorld(new THREE.Vector3()), direction = point(cast.aim.aimPoint).sub(origin).normalize();
      spawnBolt(id, origin, direction, identity(character), { predicted: !cast.confirmed, duration: Math.min(.5, Math.max(.06, origin.distanceTo(point(cast.aim.aimPoint)) / 24)) });
    }
    if (pendingAbility) return;
    if (queuedAbility) {
      const queued = queuedAbility, state = abilityState({ ...getAbilitySnapshot(), skillId: queued.skillId });
      if (state.enabled) { queuedAbility = null; cast(queued.skillId, queued.ndc, { automatic: true }); }
      else if (!['cooldown', 'gcd', 'casting'].includes(state.status)) queuedAbility = null;
      return;
    }
    if (heldBolt && now >= heldBolt.nextAt) cast('bolt', null, { automatic: true });
  }

  function interact() { if (nearest?.kind === 'passage') { requestPassage(nearest); return; } if (nearest && nearest.requiresInteraction !== false && !blocked && !journey && !selfPose?.riding) onAction?.({ type: nearest.actionType ?? 'interact', targetId: nearest.id, skillId: nearest.skillId, questId: nearest.questId, target: nearest }); }
  function inputTarget(event) { return /INPUT|TEXTAREA|SELECT/.test(event.target?.tagName) || event.target?.isContentEditable; }
  function keydown(event) {
    if (inputTarget(event) || blocked || selection || journey) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'Space', 'KeyZ', 'ControlLeft', 'ControlRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) { event.preventDefault(); keys.add(event.code); }
    if (event.repeat) return;
    if (event.code === 'Tab') { event.preventDefault(); cycleTarget(); return; }
    if (event.code === 'Space' && !flying) jumpGrace = .15;
    if (event.code === 'KeyE') interact();
    const skills = { Digit1: 'bolt', Digit2: 'levitate', Digit3: ({ harry: 'H1', ron: 'R1', hermione: 'M1', neville: 'N1', george: 'G1' })[character?.heroId], Digit4: 'mark', Digit5: 'rescue', KeyQ: 'potion-health', KeyR: 'potion-focus', KeyF: 'dodge' };
    if (event.code === 'Digit1') { event.preventDefault(); heldBolt = { targetId: null, nextAt: serverNow() }; }
    if (skills[event.code]) cast(skills[event.code]);
    if (event.code === 'KeyX') { event.preventDefault(); setFlying(!flying); }
  }
  function keyup(event) { keys.delete(event.code); if (event.code === 'Digit1') heldBolt = null; }
  function blur() { stopAbilityInput(); keys.clear(); velocity.set(0, 0); drag = selectionClick = null; }
  const listeners = []; function listen(target, type, handler, options) { target.addEventListener(type, handler, options); listeners.push([target, type, handler, options]); }
  listen(canvas, 'contextmenu', event => event.preventDefault());
  listen(canvas, 'pointerdown', event => {
    if (selection) { if (event.button === 0) { selectionClick = { x: event.clientX, y: event.clientY, pointerId: event.pointerId }; canvas.setPointerCapture(event.pointerId); } return; }
    if (event.button === 2) { drag = { x: event.clientX, y: event.clientY }; canvas.setPointerCapture(event.pointerId); } else if (event.button === 0) { const rect = canvas.getBoundingClientRect(); cast('bolt', new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2)); }
  });
  listen(canvas, 'pointermove', event => { if (!selection && drag) { const dx = event.clientX - drag.x, dy = event.clientY - drag.y; yaw -= dx * .005; pitch = clamp(pitch + dy * .004, -.35, .9); drag = { x: event.clientX, y: event.clientY }; } });
  listen(canvas, 'pointerup', event => {
    if (selection && selectionClick?.pointerId === event.pointerId && Math.hypot(event.clientX - selectionClick.x, event.clientY - selectionClick.y) < 9) {
      const rect = canvas.getBoundingClientRect(); raycaster.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), camera);
      const heroId = stage.pick(raycaster); if (heroId) onSelectHero?.(heroId);
    }
    drag = selectionClick = null;
  });
  listen(canvas, 'pointercancel', () => { drag = selectionClick = null; }); listen(canvas, 'lostpointercapture', () => { drag = selectionClick = null; });
  listen(canvas, 'wheel', event => { event.preventDefault(); if (!selection) cameraDistance = clamp(cameraDistance + event.deltaY * .003, 2.5, 7); }, { passive: false });
  listen(window, 'keydown', keydown); listen(window, 'keyup', keyup); listen(window, 'blur', blur); listen(document, 'visibilitychange', () => { if (document.hidden) blur(); });
  function frame(time) {
    if (disposed) return;
    const dt = Math.min(.05, Math.max(0, (time - lastTime) / 1000)); lastTime = time; elapsed += dt; if (selection) map?.update(dt, elapsed); else { updateEscortPresentation(); streaming.update(dt, elapsed); }
    if (actor) {
      if (selection) { stage.update(dt, { aspect: camera.aspect }); actor = stage.getActor(stage.getState().selected); const pose = selectionCameraPose(camera.aspect); camera.position.lerp(new THREE.Vector3().fromArray(pose.eye), 1 - Math.exp(-5 * dt)); camera.lookAt(...pose.focus); }
      else {
        const self = combat?.players?.[identity(character)], boatPose=map.getBoatPose?.('player');
        const boat=Boolean(boatPose&&(boatPose.phase==='crossing'||boatPose.phase==='disembarking'||boatPose.phase==='boarding'&&boatPose.progress>0));
        if(boat&&!wasBoatRide){resetMovement();jumpPreparation=0;actor.cancelJumpPreparation?.();boarding=boatPose.phase==='disembarking'?null:{from:actor.root.position.clone(),elapsed:0};}
        if(!boat)boarding=null;
        let seatedBoat = boat && boatPose.seated;
        const justDisembarked=wasBoatRide&&!boat;wasBoatRide=boat;
        const downed = (self?.hp ?? character?.hp) <= 0; if (downed) flying = false;
        const awaitingConnection = movementInFlight && performance.now() - movementInFlight.at > 1500 || pendingAbility && serverNow() - pendingAbility.startedAt > 1500;
        const canMove = !blocked && !crossing && !boat && !downed && !awaitingConnection; const old = actor.root.position.clone();
        if (!blocked) { yaw += (Number(keys.has('ArrowLeft')) - Number(keys.has('ArrowRight'))) * 1.25 * dt; pitch = clamp(pitch + (Number(keys.has('ArrowDown')) - Number(keys.has('ArrowUp'))) * .70 * dt, -.35, .9); }
        let ix = canMove ? Number(keys.has('KeyD')) - Number(keys.has('KeyA')) : 0, iz = canMove ? Number(keys.has('KeyW')) - Number(keys.has('KeyS')) : 0; const length = Math.max(1, Math.hypot(ix, iz)); ix /= length; iz /= length;
        const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight'), speed = flying ? FLIGHT_SPEED : sprint ? RUN_SPEED : WALK_SPEED;
        if (!crossing) { velocity.x = damp(velocity.x, (Math.cos(yaw) * ix - Math.sin(yaw) * iz) * speed, grounded ? 16 : 7, dt); velocity.y = damp(velocity.y, (-Math.sin(yaw) * ix - Math.cos(yaw) * iz) * speed, grounded ? 16 : 7, dt); }
        const peopleBodies = boat ? [] : nearbyPeopleBodies();
        const moved = moveAmongPeople(old, { x: old.x + (crossing ? 0 : velocity.x * dt), y: old.y, z: old.z + (crossing ? 0 : velocity.y * dt) }, map.bounds, map.walls, peopleBodies); actor.root.position.set(moved.x, moved.y, moved.z);
        if (grounded) coyote = .10; else coyote = Math.max(0, coyote - dt);
        if (jumpGrace > 0 && coyote > 0 && canMove && !jumpPreparation && !flying) { jumpPreparation = .11; actor.prepareJump?.({ durationMs: 110 }); jumpGrace = 0; }
        if (jumpPreparation > 0) { if (!canMove || flying) { jumpPreparation = 0; actor.cancelJumpPreparation?.(); } else { jumpPreparation = Math.max(0, jumpPreparation - dt); if (!jumpPreparation) { dy = JUMP_SPEED; grounded = false; coyote = 0; } } }
        jumpGrace = Math.max(0, jumpGrace - dt);
        if (flying) {
          const floor = floorAt(actor.root.position, old.y), descend = canMove && (keys.has('KeyZ') || keys.has('ControlLeft') || keys.has('ControlRight'));
          const ascend = canMove && !landing && canMountBroom() && keys.has('Space');
          const descending = landing || descend;
          // Z/Ctrl and automatic landing win if Space is also held. A blocked
          // control surface cannot keep a stale key climbing in the background.
          const targetVelocity = awaitingConnection ? 0 : descending ? -2.6 : ascend ? 2.6 : 0;
          dy = damp(dy, targetVelocity, 7, dt);
          const maximum = Math.max(floor, Math.min(2.7, Number.isFinite(view?.flight?.maxHeight) ? view.flight.maxHeight : 2.7));
          const nextY = actor.root.position.y + dy * dt;
          actor.root.position.y = clamp(nextY, floor, Math.max(maximum, old.y)); grounded = false;
          if (descending && nextY <= floor + .005) { actor.root.position.y = floor; dy = 0; grounded = true; flying = false; landing = false; }
          else if (actor.root.position.y >= maximum && dy > 0) dy = 0;
        }
        else { const oldFloor = floorAt(old, old.y); const newFloor = floorAt(actor.root.position, old.y); if (grounded && dy <= 0 && old.y <= oldFloor + .04) actor.root.position.y = newFloor; dy -= GRAVITY * dt; actor.root.position.y += dy * dt; const floor = newFloor; if (actor.root.position.y <= floor) { actor.root.position.y = floor; dy = 0; grounded = true; } else grounded = false; }
        const voluntary = actor.root.position.clone().sub(old);
        if (boat) {
          const seat = point(boatPose.position);
          if (boarding && boatPose.phase !== 'disembarking') {
            boarding.elapsed = Math.min(.7, boarding.elapsed + dt); const t = boarding.elapsed / .7, smooth = t * t * (3 - 2 * t);
            actor.root.position.lerpVectors(boarding.from, seat, smooth); actor.root.position.y += Math.sin(t * Math.PI) * .12;
            seatedBoat = t >= 1 && boatPose.seated; if (t >= 1) boarding = null;
          } else { boarding = null; actor.root.position.copy(seat); }
          actor.root.rotation.y += Math.atan2(Math.sin(boatPose.yaw - actor.root.rotation.y), Math.cos(boatPose.yaw - actor.root.rotation.y)) * (1 - Math.exp(-9 * dt));
          dy=0;grounded=true;velocity.set(0,0);correction=null;
        }
        else if (correction) {
          const portion = correction.clone().multiplyScalar(1 - Math.exp(-14 * dt));
          const resolved = moveAmongPeople(actor.root.position, actor.root.position.clone().add(portion), map.bounds, map.walls, peopleBodies);
          recordCorrection(point(resolved).sub(actor.root.position));actor.root.position.set(resolved.x, resolved.y, resolved.z); correction.sub(portion); if (correction.length() < .015) correction = null;
        }
        const travel = boat ? 0 : Math.hypot(actor.root.position.x - old.x, actor.root.position.z - old.z);
        if (travel > .001) { const angle = Math.atan2(old.x - actor.root.position.x, old.z - actor.root.position.z); actor.root.rotation.y += Math.atan2(Math.sin(angle - actor.root.rotation.y), Math.cos(angle - actor.root.rotation.y)) * (1 - Math.exp(-14 * dt)); }
        actor.setPresentationState?.({ flying, downed, floorY: floorAt(actor.root.position, old.y) });
        actor.updateTravel(dt, boat&&!seatedBoat?actor.root.position.distanceTo(old):travel, grounded, dy, seatedBoat);
        selfPose = { x: actor.root.position.x, y: actor.root.position.y, z: actor.root.position.z, yaw: actor.root.rotation.y, grounded, flying, riding:boat, sprint: sprint || Math.hypot(velocity.x, velocity.y) > WALK_SPEED * 1.2 }; if (!boat && voluntary.lengthSq() > 1e-10) movementSteps.push({ delta: { dx: voluntary.x, dy: voluntary.y, dz: voluntary.z, dt }, position: { ...selfPose }, sprint: selfPose.sprint, flying:selfPose.flying }); if(justDisembarked){movementSteps=[{delta:{dx:selfPose.x-character.position.x,dy:selfPose.y-(character.position.y??0),dz:selfPose.z-character.position.z},position:{...selfPose},sprint:false,flying:false}];} onPose?.(selfPose);
        const cameraAnchor = boat ? actor.root.position.clone().add(new THREE.Vector3(0, .9, 0)) : actor.root.position;
        const pose = chaseCameraPose(cameraAnchor, yaw, boat ? clamp(pitch + .12, -.12, .72) : pitch, cameraDistance + (boat ? 3.7 : 0));
        // On the lake, frame both passengers from above and slightly beside the
        // boat. Hagrid's broad silhouette stays clear of the view of the castle;
        // yaw and pitch still come from the player's normal camera controls.
        if (boat) { pose.eye.x += Math.cos(yaw) * 1.1; pose.eye.z -= Math.sin(yaw) * 1.1; }
        const focus = point(pose.focus), desired = point(pose.eye);
        const cameraWalls = map.cameraWalls ?? map.walls;
        desired.lerpVectors(focus, desired, cameraCollisionFraction(focus, desired, cameraWalls));
        camera.position.lerp(desired, 1 - Math.exp(-15 * dt));
        // A smoothed camera can already be beyond a wall after a doorway,
        // snapshot or fast turn. Constrain the rendered position as well as its
        // desired destination so interpolation never reveals a wall interior.
        camera.position.lerpVectors(focus, camera.position, cameraCollisionFraction(focus, camera.position, cameraWalls));
        camera.lookAt(camera.position.clone().addScaledVector(point(pose.direction), 20)); actor.root.visible = camera.position.distanceTo(focus) > .45;

        nearest = null; let nearestDistance = Infinity, nearestPriority = -1;
        for (const object of targets.values()) { const target = object.userData.target, distance = actor.root.position.distanceTo(point(target.position)); const link = target.kind === 'passage' ? getAreaLinks(resolveAreaId(character)).find(link => link.id === target.edgeId) : null; const closeEnough = link ? isAtAreaLink(actor.root.position, link) : distance < (target.radius ?? 2) + .15; const priority = target.kind === 'conversation' ? 0 : 1; if (target.active && !target.completed && closeEnough && (priority > nearestPriority || priority === nearestPriority && distance < nearestDistance)) { nearestPriority = priority; nearestDistance = distance; nearest = target; } if (object.userData.tag) { const cameraDistance = scaleNameplate(object.userData.tag, object.position, 1.1); let hasNpc = target.kind === 'conversation'; for (const entry of npcs.values()) if (entry.targetId === target.id) { hasNpc = true; break; } object.userData.tag.visible = !hasNpc && distance < 3.8 && cameraDistance > 2.3; } if (object.userData.indicator) { object.userData.indicator.rotation.y += dt; object.userData.indicator.position.y = 1.32 + Math.sin(elapsed * 2) * .04; } }
        if (!crossing && elapsed > crossingCooldown && canMove && grounded && travel > .001) {
          const passage = [...targets.values()].map(object => object.userData.target).find(target => {
            if (target.kind !== 'passage' || target.travelKind !== 'walk' || !target.active) return false;
            const link = getAreaLinks(resolveAreaId(character)).find(link => link.id === target.edgeId);
            return link && isAtAreaLink(actor.root.position, link, { normalTolerance: .45 }) && voluntary.x * link.normal.x + voluntary.z * link.normal.z > .00001;
          });
          if (passage) requestPassage(passage);
        }
        const hint = nearest ? `${nearest.id}/${Math.floor(nearestDistance)}/${nearest.label}/${nearest.active}` : ''; if (hint !== lastHint) { lastHint = hint; onHint?.(nearest, nearestDistance); }
      }
    }
    contactShadow.visible = Boolean(actor) && !selection;
    if (actor) { contactShadow.position.set(actor.root.position.x, grounded ? actor.root.position.y + .018 : .018, actor.root.position.z); contactShadow.material.opacity = grounded ? .85 : .55 / (1 + actor.root.position.y); }
    for (const [id, entry] of peers) if (entry.actor) {
      if (!combat && Number.isFinite(entry.lastSeenAt) && serverNow() - entry.lastSeenAt > 30000) { disposeGroup(entry.tag); entry.actor.dispose(); peers.delete(id); continue; }
      const p = entry.actor.root.position, before = p.clone(); p.lerp(entry.target, 1 - Math.exp(-12 * dt));
      entry.actor.root.rotation.y += Math.atan2(Math.sin(entry.yaw - entry.actor.root.rotation.y), Math.cos(entry.yaw - entry.actor.root.rotation.y)) * (1 - Math.exp(-10 * dt));
      entry.actor.setPresentationState?.({ flying: entry.flying, downed: entry.hp <= 0, floorY: standingFloor(p, before.y, map.walls) });
      entry.actor.updateTravel(dt, Math.hypot(p.x - before.x, p.z - before.z), p.y <= .05, (p.y - before.y) / Math.max(dt, .001));
      const peerDistance = actor ? actor.root.position.distanceTo(p) : Infinity, cameraDistance = scaleNameplate(entry.tag, p, 1.2);
      entry.tag.position.y = entry.hp <= 0 ? .62 - p.y : entry.tag.userData.standingHeight;
      entry.tag.visible = !journey && peerDistance > 2.2 && peerDistance < 12 && cameraDistance > 3.0;
    }
    for (const entry of npcs.values()) if (entry.actor) {
      const p = entry.actor.root.position, before = p.clone(),boatPose=entry.name==='海格'?map.getBoatPose?.('guide'):null;const aboard=boatPose&&(boatPose.phase==='crossing'||boatPose.phase==='disembarking');
      if(aboard){p.copy(point(boatPose.position));entry.actor.root.rotation.y=boatPose.yaw;}
      else { const next=stepNpcMotion(p,entry.target,dt,entry.routeSpeed??0);p.set(next.x,next.y,next.z);if(entry.journeyArrival&&p.distanceTo(entry.target)<.04)entry.journeyArrival=false; }
      const travel=p.distanceTo(before);
      if (travel > .001 && !aboard) {const facing=Math.atan2(before.x-p.x,before.z-p.z);entry.actor.root.rotation.y+=Math.atan2(Math.sin(facing-entry.actor.root.rotation.y),Math.cos(facing-entry.actor.root.rotation.y))*(1-Math.exp(-12*dt));}
      const npcDistance = actor ? actor.root.position.distanceTo(p) : Infinity;
      const engaged = nearest?.id === entry.targetId && ['talk','conversation','service','training','side'].includes(nearest?.kind);
      if (engaged && travel <= .001 && !aboard && !entry.seated && actor) {
        const facing = Math.atan2(p.x - actor.root.position.x, p.z - actor.root.position.z);
        entry.actor.root.rotation.y += Math.atan2(Math.sin(facing - entry.actor.root.rotation.y), Math.cos(facing - entry.actor.root.rotation.y)) * (1 - Math.exp(-5 * dt));
      }
      const tagCameraDistance = scaleNameplate(entry.tag, p, 1.4); entry.tag.visible = !journey && npcDistance > (entry.name.includes('海格') ? 2.6 : 1.2) && npcDistance < 7 && tagCameraDistance > 2.8;
      entry.actor.update(dt, { speed: dt ? travel / dt : 0, time: elapsed, action: aboard&&boatPose.seated || entry.seated ? 'sit' : travel > .001 ? 'walk' : 'idle', lookAt: npcDistance < 6 && !aboard ? actor?.root.position : undefined, talking: engaged || entry.kind === 'passenger' && Math.sin(elapsed * .6 + (entry.phase ?? 0)) > .7, engaged, interactionKind: entry.kind });
    }
    for (const entry of enemies.values()) {
      const before = entry.root.position.clone(); entry.root.position.lerp(entry.target, 1 - Math.exp(-12 * dt));
      const enemyDistance = actor ? actor.root.position.distanceTo(entry.root.position) : Infinity, tagCameraDistance = scaleNameplate(entry.tag, entry.root.position, 1.25); entry.tag.visible = entry.hp > 0 && enemyDistance > 2.3 && enemyDistance < 13 && tagCameraDistance > 3;
      const attack = entry.state.attack, duration = attack ? Math.max(1, attack.releaseAt - attack.startAt) : 1;
      const facing = attack?.direction ?? (actor ? { x: actor.root.position.x - entry.root.position.x, z: actor.root.position.z - entry.root.position.z } : null);
      if (facing && entry.hp > 0) { const nextYaw = Math.atan2(-facing.x, -facing.z); entry.root.rotation.y += Math.atan2(Math.sin(nextYaw - entry.root.rotation.y), Math.cos(nextYaw - entry.root.rotation.y)) * (1 - Math.exp(-8 * dt)); }
      entry.actor.update(dt, { speed: entry.root.position.distanceTo(before) / Math.max(dt, .001), time: elapsed, action: entry.hp <= 0 ? 'downed' : entry.hurtUntil > elapsed ? 'hurt' : attack ? 'attack' : before.distanceTo(entry.target) > .02 ? 'walk' : 'idle', lookAt: actor?.root.position, windupProgress: attack ? clamp((serverNow() - attack.startAt) / duration, 0, 1) : 0, attackPhase: attack ? 'windup' : entry.recoverUntil > elapsed ? 'recover' : 'waiting' });
      if (entry.warning) { entry.warning.userData.update?.(serverNow()); entry.warning.visible = entry.hp > 0; }
    }
    for (let i = enemyStrikeEffects.length - 1; i >= 0; i--) if (enemyStrikeEffects[i].update(dt)) { enemyStrikeEffects[i].dispose(); enemyStrikeEffects.splice(i, 1); }
    for (const [id, projectile] of projectiles) { projectile.remaining -= dt; if (projectile.remaining <= 0) removeProjectile(id); else { projectile.root.position.addScaledVector(projectile.direction, dt * 24); projectile.visual?.update(dt); } }
    for (let i = flashes.length - 1; i >= 0; i--) { const flash = flashes[i]; flash.life -= dt; if (flash.life <= 0) { disposeEffect(flash); flashes.splice(i, 1); } else { flash.visual?.update(dt); if (flash.root.material) flash.root.material.opacity = flash.life / flash.max; if (flash.rise) flash.root.position.y += dt * flash.rise; if (flash.expand) flash.root.scale.addScalar(dt * 2); } }
    updateAim(); advanceAbilityInput(); publishFlight(); renderer.render(scene, camera); frameId = requestAnimationFrame(frame);
  }
  selectionStage(); frameId = requestAnimationFrame(frame);
  return { prepareSelection, chooseHero, selectionStage, setSnapshot, cast, getFlightState, getAbilitySnapshot, setAbilityRequestStatus, interact, clearTarget, getAimState: () => aimState, noteMovementSent, takeMovementPacket, rejectMovement, getSelectionState: () => stage.getState(), getPose: () => selfPose, getNearest: () => nearest, getLocationState: () => ({ areaId: character ? resolveAreaId(character) : null, locationEpoch: character?.locationEpoch ?? 0, player: actor?.root.position.toArray(), camera: camera.position.toArray(), residentAreas: streaming.entries.map(entry => ({ id: entry.area.id, offset: entry.root.position.toArray() })), crossing: crossing?.edgeId ?? null }), setBlocked(value) { blocked = value; if (value) stopAbilityInput(); keys.clear(); velocity.set(0, 0); }, setFlying, getRendererInfo: () => ({ calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, geometries: renderer.info.memory.geometries, textures: renderer.info.memory.textures, environmentMaterials: area.userData.materialState ?? 'unmarked', pbrSurfaces: area.userData.pbrSurfaces ?? 0 }), dispose() { resetAbilities(); finishJourney(true); disposed = true; generation++; sceneGeneration++; cancelAnimationFrame(frameId); removeEventListener('resize', resize); for (const [target, type, handler, options] of listeners) target.removeEventListener(type, handler, options); stage.dispose(); for (const legacy of legacyActors.values()) legacy.dispose(); for (const entry of peers.values()) { disposeGroup(entry.tag); entry.actor?.dispose(); } for (const entry of npcs.values()) removeNpc(entry); for (const entry of enemies.values()) removeEnemy(entry); for (const object of targets.values()) disposeGroup(object); clearEffects(); disposeGroup(contactShadow); targetRing.geometry.dispose(); targetRing.material.dispose(); targetRing.removeFromParent(); if (streaming.active) streaming.dispose(); else map?.dispose(); renderer.dispose(); } };
}
