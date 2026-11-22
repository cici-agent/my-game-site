import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import * as Three from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createSelectionStage as residentStage, SELECTABLE_HEROES, selectionCameraPose } from '../chapter-one/client/selection-stage.mjs';
import * as geometry from '../chapter-one/client/scene-geometry.mjs';
import * as targeting from '../chapter-one/client/targeting.mjs';
import * as movement from '../chapter-one/movement.mjs';
import { abilityState } from '../chapter-one/client/ability-state.mjs';
import { createActionTimeline } from '../chapter-one/presentation/action-layer.mjs';
import { applyEquipmentAppearance, resetEquipmentAppearance } from '../chapter-one/presentation/equipment-appearance.mjs';
import { createEnemyWarning, createEnemyStrike } from '../chapter-one/client/enemy-fx.mjs';
import { createBoltVisual, createImpactVisual } from '../chapter-one/client/spell-fx.mjs';
import { contentData } from '../chapter-one/data/index.mjs';
import { createBoatMotion } from '../chapter-one/client/scene-landscape.mjs';
import * as atlas from '../chapter-one/world-atlas.mjs';
import { createWorldStreaming as realStreaming, areaOffset } from '../chapter-one/client/world-streaming.mjs';
import { trainPassengers, trainConversationTargets } from '../chapter-one/client/train-life.mjs';
import { runtimeQuests, getSceneView } from '../chapter-one/online/catalog.mjs';
import { replayAreaMovement } from '../chapter-one/online/location.mjs';
import * as people from '../chapter-one/people.mjs';
import { createMouseLook } from '../chapter-one/client/mouse-look.mjs';

// Execute the complete production controller and frame loop. Only the browser,
// GPU and asset construction boundaries are replaced; Three's cameras/rays,
// collision rules, target selection and the resident stage are real.
const source = (await readFile(new URL('../chapter-one/client/world.mjs', import.meta.url), 'utf8'))
  .replace(/^import .*;\s*$/gm, '')
  .replace(/^export\s+(?=(?:async\s+)?(?:function|class|const|let|var)\b)/gm, '');
const flush = () => new Promise(resolve => setImmediate(resolve));
class Events {
  listeners = new Map();
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, detail = {}) { const event = { target: { tagName: 'DIV' }, preventDefault() {}, repeat: false, ...detail }; for (const fn of this.listeners.get(type) ?? []) fn(event); }
}
function avatar(heroId) {
  const root = new Three.Group(), timeline = createActionTimeline(), calls = { prepare: [], cancelPreparation: 0, travel: [], actions: [], results: [], cancel: [], dispose: 0 };
  root.name = heroId;
  return { root, model: root, calls, walkSpeed: 1.308, runSpeed: 2.808,
    capabilities: { appearance: 'fixed-published-look' },
    updateTravel(dt, distance, grounded, verticalVelocity, seated) { calls.travel.push({ dt, distance, grounded, verticalVelocity, seated }); timeline.advance(dt); },
    prepareJump(value) { calls.prepare.push(value); return true; }, cancelJumpPreparation() { calls.cancelPreparation++; return true; },
    resetPresentation({ position, yaw } = {}) { if (position) root.position.fromArray(position); if (Number.isFinite(yaw)) root.rotation.y = yaw; },
    setPresentationState() {}, setExpressionContext() {}, playStudioCast() { return true; },
    playAuthoritativeAction(action) { calls.actions.push(action); const result = timeline.play(action); calls.results.push(result); return result; }, cancelAction(id, reason) { calls.cancel.push({ id, reason }); return timeline.cancel(id, reason); }, playHit() {},
    getCastOriginWorld(out = new Three.Vector3()) { return root.localToWorld(out.set(0, 1.2, -.2)); },
    debugSnapshot() { return { timeline: timeline.debug(), pose: timeline.pose, clips: { Cast: { duration: 76 / 24 } }, statePresentation: { hipHeight: .88 } }; },
    dispose() { calls.dispose++; root.removeFromParent(); },
  };
}
async function harness(t, { encounter = null, members = [], request = null, boatMotion = null, pointerLock = false } = {}) {
  let now = 1000, frame, camera, renderedScene;
  const window = new Events(), document = new Events(), canvas = new Events(), actors = [], npcs = [], actions = [], aims = [], walls = [], environments = [], streams = [];
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720 }); canvas.setPointerCapture = () => {};
  document.pointerLockElement=null;document.exitPointerLock=()=>{document.pointerLockElement=null;document.emit('pointerlockchange');};
  if(pointerLock)canvas.requestPointerLock=()=>{document.pointerLockElement=canvas;document.emit('pointerlockchange');return Promise.resolve();};
  const draw = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }) }, { get: (object, key) => object[key] ?? (() => {}) });
  document.createElement = () => ({ width: 0, height: 0, getContext: () => draw }); document.hidden = false;
  class Renderer {
    shadowMap = {}; info = { render: {}, memory: {} };
    setPixelRatio() {} setSize() {} dispose() {}
    render(scene, view) { scene.updateMatrixWorld(true); view.updateMatrixWorld(true); camera = view; renderedScene = scene; }
  }
  const loadCharacter = async id => { const value = avatar(id); actors.push(value); return value; };
  const loadNpc = async identity => {
    const root = new Three.Group(), calls = [];
    const npc = { ...identity, root, calls, disposals:0, update(dt, state) { calls.push({ dt, ...state, lookAt: state.lookAt?.clone(), position: root.position.clone(), yaw: root.rotation.y }); }, dispose() { npc.disposals++; root.removeFromParent(); } };
    npcs.push(npc); return npc;
  };
  const harmlessFx = () => ({ root: new Three.Group(), prepare() {}, begin() {}, update() {}, cancel() {}, reset() {}, dispose() {} });
  const environment = (id,root=new Three.Group()) => {
    const record={id,root,disposals:0,updates:0,portalDisposals:0,contexts:[]},landmark=new Three.Object3D();landmark.name=`Landmark:${id}`;landmark.position.set(1,1,1);root.add(landmark);record.landmark=landmark;environments.push(record);
    return {root,record,update(dt){record.updates++;if(id==='SC03')boatMotion?.update(dt);},dispose(){record.disposals++;},setEscort(value){if(id==='SC03')boatMotion?.setEscort(value);},setContext(value){record.contexts.push(value);},setTrainStopped(){},getBoatPose:id==='SC03'&&boatMotion?role=>boatMotion.getPose(role):undefined};
  };
  const context = vm.createContext({
    THREE: { ...Three, WebGLRenderer: Renderer }, RoundedBoxGeometry, createMouseLook,
    ...geometry, ...targeting, ...movement, ...atlas, ...people, areaOffset, trainPassengers, trainConversationTargets, contentData, abilityState, applyEquipmentAppearance, resetEquipmentAppearance, createBoltVisual, createImpactVisual, createEnemyWarning, createEnemyStrike, SELECTABLE_HEROES, selectionCameraPose,
    createSelectionStage: options => residentStage({ ...options, loadCharacter }), createSelectionSpells: harmlessFx,
    loadPlayableCharacter: loadCharacter, loadNpc,
    createCreature: () => ({ root: new Three.Group(), update() {}, dispose() {} }),
    createSceneEnvironment: (id,root) => environment(id,root),
    getSceneNavigation: () => ({ bounds: [-40, 40, -40, 40], walls }),
    createWorldStreaming: scene => {const cache=realStreaming(scene,{createRoom:(sceneId,root)=>environment(root.name.replace('WorldArea:',''),root),createConnector:area=>environment(area.id),openPortals:(root,area)=>({dispose(){environments.find(record=>record.root===root).portalDisposals++;}})});streams.push(cache);return cache;},
    window, document, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    performance: { now: () => now }, console,
    addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window),
    requestAnimationFrame: fn => { frame = fn; return 1; }, cancelAnimationFrame() {},
  });
  vm.runInContext(source + '\nglobalThis.makeWorld=createStoneWorld;', context);
  const world = context.makeWorld(canvas, { onAction: action => { actions.push(action); return request ? request(action) : Promise.resolve(); }, onAim: value => aims.push(value) });
  let released=false;const dispose=()=>{if(!released){released=true;world.dispose();}};t.after(dispose);await world.prepareSelection('harry');
  let character = { id: 'self', heroId: 'harry', sceneId: 'SC04', hp: 100, position: { x: 0, y: 0, z: 5, yaw: 0 }, currentQuestId: 'M04', skills: ['bolt', 'dodge', 'rescue', 'levitate', 'H1', 'mark'], lastAcceptedMoveSequence: 0, encounter };
  let room = members.length ? { code: 'TEST', members, encounter } : null;
  let view = { navigation: {bounds: [-40,40,-40,40],walls}, sceneId: 'SC04', name: 'Test room', quest: { id: 'M04', name: 'Practice', npc: '' }, targets: [], serverTime: 10000 };
  const snapshot = async (next = {}, viewPatch = {}) => { view = { ...view, ...viewPatch }; character = { ...character, ...next }; if (room) room = { ...room, encounter: character.encounter }; await world.setSnapshot(character, room, view); await Promise.resolve(); };
  await snapshot();
  function advance(count = 1, milliseconds = 10) { for (let i = 0; i < count; i++) { now += milliseconds; const callback = frame; frame = null; assert(callback, 'the production frame loop must remain alive'); callback(now); } }
  advance(30);
  return { world, actions, aims, actors, npcs, walls, character, snapshot, advance, environments,streams,dispose,scene: () => renderedScene, blur: () => window.emit('blur'),
    state:()=>({character,view,room}),setMembers(values){room={code:'TEST',members:values,encounter:character.encounter};},cameraPosition:()=>camera.position.clone(),setCameraPosition(value){camera.position.set(value.x,value.y,value.z);},
    key(code, type = 'keydown', detail = {}) { let prevented = false; window.emit(type, { code, preventDefault() { prevented = true; }, ...detail }); return prevented; },
    pointerAt(point) { const ndc = new Three.Vector3(point.x, point.y, point.z).project(camera); canvas.emit('pointerdown', { button: 0, clientX: (ndc.x + 1) * 640, clientY: (1 - ndc.y) * 360, pointerId: 1 }); },
    clickWorld(x=640,y=360){canvas.emit('pointerdown',{button:0,pointerType:'mouse',clientX:x,clientY:y,pointerId:1});},
    mouseMove(dx,dy=0){document.emit('mousemove',{movementX:dx,movementY:dy});},
    nativeMouseRelease(){document.exitPointerLock();},
    ndc(point) { const p = new Three.Vector3(point.x, point.y, point.z).project(camera); return new Three.Vector2(p.x, p.y); },
    dragCamera(dx,dy=0) { canvas.emit('pointerdown',{button:2,clientX:640,clientY:360,pointerId:2});canvas.emit('pointermove',{clientX:640+dx,clientY:360+dy,pointerId:2});canvas.emit('pointerup',{pointerId:2}); },
    cameraDirection: () => camera.getWorldDirection(new Three.Vector3()),
  };
}
const combat = () => ({ id: 'test-battle', status: 'active', players: { self: { id: 'self', hp: 100, focus: 100, position: { x: 0, y: 0, z: 5 }, cooldowns: {}, gcdUntil: 0, action: null, learnedSkillIds: ['bolt', 'dodge', 'rescue', 'levitate', 'H1', 'mark'], potions: { health: 1, focus: 1 }, potionUses: 0 } }, enemies: { crate: { id: 'crate', templateId: 'BOX-L1', name: 'Low crate', hp: 100, maxHp: 100, radius: .45, collisionHeight: .85, position: { x: 1.5, y: 0, z: 0 } } }, events: [] });

test('train passengers keep one seated story Ron across dialogue changes without duplicating the player', async t => {
  const h = await harness(t), player = h.actors.find(actor => actor.root.name === 'harry'), selectionRon = h.actors.find(actor => actor.root.name === 'ron');
  const originalActors = new Set(h.actors), quest = runtimeQuests.find(quest => quest.id === 'M02');
  const target = { ...quest.objectives.find(objective => objective.kind === 'talk'), active: true, completed: false };
  await h.snapshot({ sceneId: 'SC02', currentQuestId: 'M02', position: { x: -.3, y: 0, z: -3.2, yaw: 0 } }, {
    sceneId: 'SC02', quest: { id: quest.id, name: quest.name, npc: quest.initiatorNpc }, targets: [target],
  });
  await flush(); h.advance(80);
  const loadedCompanions = h.actors.filter(actor => !originalActors.has(actor));
  assert.deepEqual(loadedCompanions.map(actor=>actor.root.name).sort(),['hermione','ron'],'the selected Harry has no extra story copy');
  const ron = loadedCompanions.find(actor=>actor.root.name==='ron');assert.equal(loadedCompanions.filter(actor=>actor.root.name==='ron').length,1);
  assert.deepEqual(h.npcs.map(npc=>npc.id).sort(),['draco','neville','trolley'],'only supporting passengers use the NPC loader');
  assert.notEqual(ron, player); assert.notEqual(ron, selectionRon); assert.notEqual(ron.root.parent, player.root.parent);
  assert.equal(player.root.parent, h.scene()); assert.equal(player.calls.dispose, 0); assert.equal(selectionRon.calls.dispose, 0);
  assert(ron.calls.travel.length > 0, 'the world frame loop drives the workshop companion animation');
  assert(ron.calls.travel.every(call=>call.seated),'the resident Ron keeps his bench seat');
  assert.equal(h.world.getNearest()?.id, target.id);
  h.key('KeyE'); assert.equal(h.actions.at(-1)?.targetId, 'M02-3'); assert.equal(h.actions.at(-1)?.type, 'interact');
  const companionPosition = ron.root.position.clone(), playerPosition = player.root.position.clone();
  h.key('KeyW'); h.advance(20); h.key('KeyW', 'keyup');
  assert(player.root.position.distanceTo(playerPosition) > .2, 'movement input still controls the original player actor');
  assert(ron.root.position.distanceTo(companionPosition) < 1e-8, 'player input cannot move the separate companion instance');
  await h.snapshot({}, { targets: [] }); h.advance();
  assert.equal(ron.calls.dispose, 0, 'ending dialogue keeps the resident passenger');
  assert(ron.root.position.distanceTo(companionPosition)<1e-8);assert(ron.calls.travel.at(-1).seated);
  await h.snapshot({sceneId:'SC03',currentQuestId:'M03'}, {sceneId:'SC03',targets:[],quest:{id:'M03',npc:''}});h.advance();
  assert.equal(ron.calls.dispose,1,'leaving the coach releases its story passenger');
  assert(loadedCompanions.every(actor=>actor.calls.dispose===1));assert(h.npcs.every(npc=>npc.disposals===1));
  assert.equal(player.calls.dispose, 0); assert.equal(selectionRon.calls.dispose, 0); assert.equal(player.root.parent, h.scene());
});

test('standing beside Ron keeps his active main-story dialogue ahead of repeatable small talk', async t => {
  const h=await harness(t),quest=runtimeQuests.find(quest=>quest.id==='M02');
  const target={...quest.objectives.find(objective=>objective.kind==='talk'),active:true,completed:false};
  await h.snapshot({areaId:'SC02_LONDON',sceneId:'SC02',currentQuestId:'M02',position:{x:-.7,y:0,z:-5.2,yaw:0}},
    {sceneId:'SC02',quest:{id:quest.id,name:quest.name,npc:quest.initiatorNpc},targets:[target]});
  await flush();h.advance(80);
  assert.equal(h.world.getNearest()?.id,target.id,'the closer repeatable conversation must not hide an in-range story interaction with the same passenger');
  h.key('KeyE');assert.equal(h.actions.at(-1)?.targetId,target.id);assert.equal(h.actions.at(-1)?.type,'interact');
  await h.snapshot({}, {targets:[]});h.advance();
  assert.equal(h.world.getNearest()?.id,'passenger-ron','small talk becomes available again after the story step');
});

test('a nearby service NPC faces the player and engages, then stops greeting when the player walks away', async t => {
  const h = await harness(t), target = { id: 'school-supply', npc: '诺拉·佩恩', kind: 'service', label: '学校补给', position: { x: 1.2, y: 0, z: 4.2 }, radius: 2, active: true, actionType: 'service' };
  await h.snapshot({}, { targets: [target] }); await flush(); h.advance(150);
  const npc = h.npcs[0]; assert.equal(npc.id, 'supply'); assert.equal(h.npcs.length, 1);
  const towardPlayer = () => h.actors[0].root.position.clone().sub(npc.root.position).normalize();
  const forward = () => new Three.Vector3(0, 0, -1).applyQuaternion(npc.root.quaternion);
  assert(npc.calls.at(-1).engaged); assert(npc.calls.at(-1).talking);
  assert.equal(npc.calls.at(-1).interactionKind, 'service'); assert.equal(npc.calls.at(-1).action, 'idle');
  assert(forward().dot(towardPlayer()) > .999, 'the actual body faces the player, rather than showing its back');
  assert(npc.calls.at(-1).lookAt.distanceTo(h.actors[0].root.position) < 1e-8);
  h.key('KeyE'); assert.equal(h.actions.at(-1)?.targetId, target.id, 'the engaged actor is the same target that E activates');
  h.key('KeyS'); h.key('ShiftLeft'); h.advance(200); h.key('KeyS', 'keyup'); h.key('ShiftLeft', 'keyup'); h.advance(30);
  assert(h.actors[0].root.position.distanceTo(npc.root.position) > 6);
  assert.equal(npc.calls.at(-1).engaged, false); assert.equal(npc.calls.at(-1).talking, false); assert.equal(npc.calls.at(-1).lookAt, undefined);
  const heading = npc.root.rotation.y; h.advance(50); assert.equal(npc.root.rotation.y, heading, 'an out-of-range player no longer drives an interaction turn');
  const actionsBefore = h.actions.length; h.key('KeyE'); assert.equal(h.actions.length, actionsBefore, 'the departed service is no longer interactable');
  assert.equal(h.npcs.length, 1, 'distance changes do not recreate or reload the actor');
});

test('Hagrid keeps escort travel direction and the real boat seat through crossing and disembarkation', async t => {
  const boat = createBoatMotion(), h = await harness(t, { boatMotion: boat });
  const guideView = (kind, progress, position) => ({
    sceneId: 'SC03', quest: { id: 'M03', name: 'Crossing the lake', npc: '海格' },
    targets: [{ id: 'follow-hagrid', npc: '海格', kind, label: '跟上海格', position, radius: 2, active: true }],
    escort: { npc: '海格', targetId: 'follow-hagrid', kind, progress, position },
  });
  await h.snapshot({ sceneId: 'SC03', currentQuestId: 'M03' }, guideView('escort', .1, { x: 1, y: 0, z: 4.4 })); await flush(); h.advance(5);
  const npc = h.npcs[0], start = npc.root.position.clone(); assert.equal(npc.id, 'hagrid');
  const destination = { x: 1.6, y: 0, z: 3.8 };
  await h.snapshot({}, guideView('escort', .3, destination)); npc.calls.length = 0; h.advance(30);
  assert(npc.root.position.distanceTo(start) > .49 && npc.root.position.distanceTo(start) < .53, 'legacy guide corrections retain a bounded 1.7 m/s walk'); assert(npc.calls.every(sample => sample.action === 'walk' && sample.speed > .1 && !sample.engaged && !sample.talking));
  const travelDirection = npc.root.position.clone().sub(start).normalize();
  assert(new Three.Vector3(0, 0, -1).applyQuaternion(npc.root.quaternion).dot(travelDirection) > .995, 'escort body smoothly turns into its actual movement');
  const beforeE=h.actions.length;h.key('KeyE');assert.equal(h.actions.length,beforeE,'an already walking guide needs no repeat interaction');
  h.advance(200);const travelHeading=npc.root.rotation.y;h.advance(50);
  assert.equal(npc.calls.at(-1).action, 'idle'); assert.equal(npc.calls.at(-1).engaged, false); assert(Math.abs(npc.root.rotation.y - travelHeading) < 1e-8, 'waiting escort does not turn to greet the nearby follower');

  const checkBoatFrame = () => {
    h.advance(); const pose = boat.getPose('guide'), sample = npc.calls.at(-1);
    assert(npc.root.position.distanceTo(new Three.Vector3(pose.position.x, pose.position.y, pose.position.z)) < 1e-8, 'Hagrid stays on the guide anchor, separate from the player seat');
    assert(Math.abs(Math.atan2(Math.sin(npc.root.rotation.y - pose.yaw), Math.cos(npc.root.rotation.y - pose.yaw))) < 1e-8, 'the boat owns guide facing on every frame');
    assert.equal(sample.engaged, false); assert.equal(sample.talking, false); assert.equal(sample.lookAt, undefined);
    if (pose.seated) assert.equal(sample.action, 'sit');
    return sample;
  };
  await h.snapshot({}, guideView('boat', .25, { x: 1.2, y: 0, z: -.9 }));
  for (let i = 0; i < 100; i++) checkBoatFrame();
  assert.equal(h.world.getPose().riding, true); assert.equal(h.actors[0].calls.travel.at(-1).seated, true);
  assert(npc.root.position.distanceTo(h.actors[0].root.position) > 1, 'guide and player never collapse into one seat');
  const firstSeat = npc.root.position.clone();
  await h.snapshot({}, guideView('boat', .75, { x: -1.2, y: 0, z: -3.1 }));
  for (let i = 0; i < 90; i++) checkBoatFrame();
  assert(npc.root.position.distanceTo(firstSeat) > 2, 'the test exercises a moving boat, not only a static seated pose');
  await h.snapshot({}, guideView('boat', 1, { x: -1.5, y: 0, z: -4 }));
  let walkingOffBoat = false;
  for (let i = 0; i < 90; i++) { const sample = checkBoatFrame(); walkingOffBoat ||= sample.action === 'walk'; }
  assert(walkingOffBoat, 'Hagrid stands and walks during the real landing blend');
  await h.snapshot({}, guideView('escort', .1, { x: -1.5, y: 0, z: -5.1 })); h.advance(100);
  assert.equal(boat.getPose().phase, 'docked'); assert.equal(h.world.getPose().riding, false);
  assert.equal(npc.calls.at(-1).action, 'idle'); assert.equal(npc.calls.at(-1).engaged, false);
  assert.equal(h.npcs.length, 1, 'one Hagrid actor survives walking, boarding, sailing and landing');
});

test('the actual frame loop walks a clocked guide continuously without polling or waiting for a distant player', async t => {
  const h=await harness(t),origin={x:1,y:0,z:4},destination={x:1,y:0,z:-12};
  await h.snapshot({sceneId:'SC03',currentQuestId:'M03',position:{x:-10,y:0,z:20}}, {
    sceneId:'SC03',serverTime:20000,quest:{id:'M03',npc:'海格'},
    targets:[{id:'M03-1',npc:'海格',kind:'escort',active:true,position:origin}],
    escort:{npc:'海格',targetId:'M03-1',kind:'escort',position:origin,origin,destination,startedAt:20000,durationSeconds:10,serverTime:20000,awaitingStart:false,progress:0}
  });await flush();const npc=h.npcs[0];npc.calls.length=0;
  h.advance(600);assert(Math.abs(npc.root.position.z+5.6)<.03,'six seconds of walking progress with no new snapshot');
  assert(npc.calls.every(call=>call.action==='walk'&&Math.abs(call.speed-1.6)<.001),'every rendered walking frame retains its natural route speed');
  assert.equal(h.world.getPose().z,20,'the player stays behind');h.advance(500);
  assert(Math.abs(npc.root.position.z+12)<.001);assert.equal(npc.calls.at(-1).action,'idle');assert.equal(h.actions.length,0);
});

test('real Space input waits for the preparation pose before takeoff, then lands once', async t => {
  const h = await harness(t), actor = h.actors[0]; actor.calls.travel.length = 0;
  h.key('Space'); h.advance(9);
  assert.equal(actor.calls.prepare.length, 1); assert.equal(actor.calls.prepare[0].durationMs, 110);
  assert.equal(h.world.getPose().y, 0); assert(actor.calls.travel.every(sample => sample.grounded));
  h.advance(5); assert(h.world.getPose().y > 0); assert.equal(h.world.getPose().grounded, false);
  let peak = h.world.getPose().y; for (let frame = 0; frame < 120; frame++) { h.advance(); peak = Math.max(peak, h.world.getPose().y); }
  assert(peak > 1.1 && peak < 1.3); assert.equal(h.world.getPose().grounded, true); assert.equal(h.world.getPose().y, 0);
  assert.equal(actor.calls.prepare.length, 1, 'holding Space does not repeatedly trigger jumps');
});

test('opening a blocking panel during anticipation cancels the pending jump', async t => {
  const h = await harness(t), actor = h.actors[0]; h.key('Space'); h.advance(3); h.world.setBlocked(true); h.advance(20);
  assert.equal(actor.calls.cancelPreparation, 1); assert.equal(h.world.getPose().y, 0);
  h.world.setBlocked(false); h.advance(30); assert.equal(h.world.getPose().y, 0); assert.equal(actor.calls.prepare.length, 1);
});

test('arrow keys adjust the aiming camera without acting as walking keys', async t => {
  const h = await harness(t), initial = { ...h.world.getPose() }, before = h.cameraDirection();
  h.key('ArrowDown'); h.advance(40); h.key('ArrowDown', 'keyup');
  const after = h.cameraDirection(); assert(after.y < before.y - .1);
  assert.equal(h.world.getPose().x, initial.x); assert.equal(h.world.getPose().z, initial.z);
  h.key('KeyW'); h.advance(100); h.key('KeyW', 'keyup');
  assert(initial.z - h.world.getPose().z > 1.9, 'W drives the actual world movement at the shared speed');
});

test('mouse capture rotates the real camera without walking or casting on the initial click', async t => {
  const h=await harness(t,{encounter:combat(),pointerLock:true}),position={...h.world.getPose()},before=h.cameraDirection();
  h.pointerAt(targeting.targetCenter(combat().enemies.crate));assert.equal(h.world.getMouseLookState().locked,true);assert.equal(h.actions.length,0);
  h.mouseMove(180,-50);h.advance(20);assert(h.cameraDirection().dot(before)<.9);assert(h.cameraDirection().y>before.y+.1);
  assert.equal(h.world.getPose().x,position.x);assert.equal(h.world.getPose().z,position.z);
});

test('locked left clicks use the centre aim and retain an explicit Tab target regardless of old cursor coordinates', async t => {
  const reference=await harness(t,{encounter:combat()}),h=await harness(t,{encounter:combat(),pointerLock:true});
  reference.world.cast('bolt');h.clickWorld(40,650);h.clickWorld(1100,30);
  const actual=h.actions.at(-1),expected=reference.actions.at(-1);assert.equal(actual.skillId,'bolt');
  for(const axis of ['x','y','z'])assert(Math.abs(actual.aimPoint[axis]-expected.aimPoint[axis])<1e-8,'capture position never becomes the aim ray');
  await flush();h.advance(60);h.key('Tab');h.clickWorld(10,10);assert.equal(h.actions.at(-1).targetId,'crate','Tab locking has the same meaning for mouse and keyboard spells');
});

test('panels and focus loss release mouse control and stop held movement and repeated casting', async t => {
  const h=await harness(t,{encounter:combat(),pointerLock:true});h.world.requestMouseLook();h.key('KeyW');h.key('Digit1');h.advance(20);
  h.world.setBlocked(true);assert.equal(h.world.getMouseLookState().locked,false);const before=h.cameraDirection(),position={...h.world.getPose()},actions=h.actions.length;
  h.mouseMove(600,100);h.dragCamera(300,100);h.advance(30);assert(h.cameraDirection().distanceTo(before)<1e-8);assert.equal(h.world.getPose().z,position.z);
  h.world.setBlocked(false);h.advance(100);assert.equal(h.world.getMouseLookState().locked,false);assert.equal(h.actions.length,actions);
  h.world.requestMouseLook();h.key('KeyW');h.advance(10);h.blur();assert.equal(h.world.getMouseLookState().locked,false);const stopped={...h.world.getPose()};h.advance(50);assert.equal(h.world.getPose().z,stopped.z);
});

test('mouse control survives normal polling, but selection releases it', async t => {
  const h=await harness(t,{pointerLock:true});h.world.requestMouseLook();h.mouseMove(120,-20);h.advance(15);const before=h.cameraDirection();
  await h.snapshot();h.advance();assert.equal(h.world.getMouseLookState().locked,true);assert(h.cameraDirection().distanceTo(before)<1e-8);
  h.world.selectionStage('ron');assert.equal(h.world.getMouseLookState().locked,false);h.mouseMove(500,500);h.advance();assert.equal(h.world.getSelectionState().selected,'ron');
});

test('clicking a low target locks the actual hurt volume and self-use actions ignore that lock', async t => {
  const battle = combat(), h = await harness(t, { encounter: battle });
  h.pointerAt(targeting.targetCenter(battle.enemies.crate));
  assert.equal(h.actions.at(-1)?.targetId, 'crate'); assert.equal(h.actions.at(-1)?.skillId, 'bolt'); assert(h.actions.at(-1).aim.y < 0);
  await flush(); h.walls.push({ x: .75, z: 2.5, w: 3, d: .3, height: 3 });
  const before = h.actions.length; h.world.cast('bolt'); assert.equal(h.actions.length, before, 'the lock cannot shoot through a new obstruction');
  h.world.cast('potion-health'); assert.equal(h.actions.at(-1)?.skillId, 'potion-health', 'a wall between the enemy and player cannot block drinking a potion');
  await flush(); battle.players.self.action = { skillId: 'rescue' }; battle.players.self.gcdUntil = 999999;
  h.world.cast('dodge'); assert.equal(h.actions.at(-1)?.skillId, 'dodge', 'dodge can cancel the existing action despite global cooldown');
});

test('rescue input can select a downed teammate at body height', async t => {
  const battle = combat(); battle.enemies = {};
  const friend = { id: 'friend', heroId: 'ron', name: 'Ron', sceneId: 'SC04', hp: 0, position: { x: 1.2, y: 0, z: 4 }, lastSeenAt: 10000 };
  battle.players.friend = { ...friend, downedUntil: 20000, rescued: false };
  const h = await harness(t, { encounter: battle, members: [friend] }); h.advance(5);
  h.world.cast('rescue', h.ndc({ x: 1.2, y: .312, z: 4 }));
  assert.equal(h.actions.at(-1)?.skillId, 'rescue'); assert.equal(h.actions.at(-1)?.targetId, 'friend');
});

function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
function objectsNamed(scene, name) { const result = []; scene.traverse(object => { if (object.name === name) result.push(object); }); return result; }

test('rapid casting keeps one request and preview; a lost response retains its ID until settled', async t => {
  const request = deferred(), battle = combat(), h = await harness(t, { encounter: battle, request: () => request.promise });
  for (let i = 0; i < 12; i++) h.world.cast('bolt');
  assert.equal(h.actions.length, 1); assert.equal(h.actors[0].calls.actions.length, 1);
  const id = h.actions[0].clientActionId;
  assert.match(id, /^[a-zA-Z0-9_-]{8,96}$/); assert.equal(h.world.getAbilitySnapshot().pending.clientActionId, id);
  h.advance(15); assert.equal(objectsNamed(h.scene(), 'RedGoldSpellBolt').length, 1, 'the preview releases a visible projectile after actual windup');
  assert.equal(battle.enemies.crate.hp, 100, 'a preview must never change enemy health');
  request.reject(Object.assign(new Error('offline'), { code: 'NETWORK' })); await flush();
  assert.equal(h.world.getAbilitySnapshot().pending.status, 'retrying');
  h.world.cast('H1'); assert.equal(h.actions.length, 1); assert.equal(h.world.getAbilitySnapshot().queuedSkillId, null);
  h.world.setAbilityRequestStatus('another-request', 'settled'); assert.equal(h.world.getAbilitySnapshot().pending.clientActionId, id);
  h.world.setAbilityRequestStatus(id, 'settled'); assert.equal(h.world.getAbilitySnapshot().pending, null);
});

test('same-ID confirmation preserves the preview pose and never creates a second bolt', async t => {
  const request = deferred(), battle = combat(), h = await harness(t, { encounter: battle, request: () => request.promise });
  h.world.cast('bolt'); const id = h.actions[0].clientActionId, startedAt = h.world.getAbilitySnapshot().pending.startedAt;
  h.advance(14); const before = h.actors[0].debugSnapshot().pose.sampleProgress;
  battle.players.self.gcdUntil = startedAt + 800;
  battle.events = [{ id: 'confirmed-start', type: 'action_started', playerId: 'self', actionId: id, skillId: 'bolt', at: startedAt + 90, startAt: startedAt + 90, releaseAt: startedAt + 210 }];
  await h.snapshot(); h.advance();
  assert(h.actors[0].debugSnapshot().pose.sampleProgress >= before);
  assert.equal(h.actors[0].calls.results.at(-1).reconciled, true);
  const bolt = objectsNamed(h.scene(), 'RedGoldSpellBolt')[0]; assert(bolt);
  battle.events.push({ id: 'confirmed-release', type: 'action_released', playerId: 'self', actionId: id, skillId: 'bolt', at: startedAt + 210, direction: { x: 0, y: 0, z: -1 }, position: { x: 0, y: 1.2, z: 5 } });
  await h.snapshot(); assert.equal(objectsNamed(h.scene(), 'RedGoldSpellBolt')[0], bolt);
  request.resolve(); await flush(); assert.equal(h.actors[0].calls.cancel.length, 0, 'settling an accepted request cannot cancel its authoritative action');
  battle.events.push({ id: 'wall-impact', type: 'wall_hit', playerId: 'self', actionId: id, at: startedAt + 230, position: { x: 0, y: 1.2, z: 1 } });
  await h.snapshot(); assert.equal(objectsNamed(h.scene(), 'RedGoldSpellBolt').length, 0); assert.equal(objectsNamed(h.scene(), 'WallEmberImpact').length, 1);
});

test('held basic casting respects authority cooldown and stops on release or target death', async t => {
  const battle = combat(), h = await harness(t, { encounter: battle }); h.key('Tab'); h.key('Digit1'); await flush();
  const firstTime = h.actors[0].calls.actions[0].startAtMs; battle.players.self.gcdUntil = firstTime + 800;
  h.advance(75); await flush(); assert.equal(h.actions.length, 1);
  h.advance(7); await flush(); assert.equal(h.actions.length, 2);
  h.advance(4); await flush(); assert.equal(h.actions.length, 2, 'a single frame cannot create a fresh burst after acknowledgement');
  battle.enemies.crate.hp = 0; await h.snapshot(); h.advance(100); await flush(); assert.equal(h.actions.length, 2);
  battle.enemies.crate.hp = 100; await h.snapshot(); h.advance(100); await flush(); assert.equal(h.actions.length, 2, 'a revived/new target does not restart the released intent');
  h.key('Digit1'); await flush(); const count = h.actions.length; h.key('Digit1', 'keyup'); h.advance(120); await flush(); assert.equal(h.actions.length, count);
});

test('cooldown buffering contains exactly one cast in the final 400ms and rechecks resources', async t => {
  const battle = combat(), h = await harness(t, { encounter: battle }); h.key('Tab');
  const now = h.world.getAbilitySnapshot().now; battle.players.self.cooldowns.H1 = now + 600;
  h.world.cast('H1'); assert.equal(h.world.getAbilitySnapshot().queuedSkillId, null);
  h.advance(25); for (let i = 0; i < 8; i++) h.world.cast('H1');
  assert.equal(h.world.getAbilitySnapshot().queuedSkillId, 'H1'); assert.equal(h.actions.length, 0);
  h.advance(36); await flush(); assert.equal(h.actions.length, 1); assert.equal(h.world.getAbilitySnapshot().queuedSkillId, null);
  assert.equal(h.actors[0].calls.actions[0].releaseAtMs - h.actors[0].calls.actions[0].startAtMs, 150);
  battle.players.self.cooldowns.H1 = h.world.getAbilitySnapshot().now + 200; h.world.cast('H1'); battle.players.self.focus = 0;
  h.advance(25); await flush(); assert.equal(h.actions.length, 1, 'resource loss cancels a previously legal buffered intention');
});

test('stale action objects do not add a polling delay and potion guards match the action bar', async t => {
  const battle = combat(), h = await harness(t, { encounter: battle });
  battle.players.self.action = { id: 'old-cast', skillId: 'bolt', startAt: 9000, releaseAt: 9120 };
  h.world.cast('H1'); assert.equal(h.actions.length, 1); await flush();
  battle.players.self.potions.health = 0; h.world.cast('potion-health'); assert.equal(h.actions.length, 1);
  battle.players.self.potionUses = 1; h.world.cast('potion-focus'); assert.equal(h.actions.length, 1);
  battle.players.self.potionUses = 0; h.world.cast('potion-focus'); assert.equal(h.actions.length, 2);
  const preview = h.actors[0].calls.actions.at(-1); assert.equal(preview.releaseAtMs - preview.startAtMs, 1000);
});

test('blocking UI, focus loss, and scene return clear held and buffered inputs without losing unknown requests', async t => {
  const battle = combat(), request = deferred(), h = await harness(t, { encounter: battle, request: () => request.promise });
  h.key('Digit1'); h.world.setBlocked(true); h.world.setBlocked(false); h.blur();
  const id = h.actions[0].clientActionId; assert.equal(h.world.getAbilitySnapshot().pending.clientActionId, id);
  request.resolve(); await flush(); h.advance(120); await flush(); assert.equal(h.actions.length, 1);
  battle.players.self.cooldowns.H1 = h.world.getAbilitySnapshot().now + 200; h.world.cast('H1'); assert.equal(h.world.getAbilitySnapshot().queuedSkillId, 'H1');
  h.world.selectionStage('ron'); h.advance(80); await flush();
  assert.equal(h.world.getAbilitySnapshot().pending, null); assert.equal(h.world.getAbilitySnapshot().queuedSkillId, null); assert.equal(h.actions.length, 1);
});

test('a skill waiting for a lost response limits movement prediction after 1.5 seconds', async t => {
  const request = deferred(), h = await harness(t, { encounter: combat(), request: () => request.promise });
  h.world.cast('bolt'); h.key('KeyW'); h.advance(170); const stopped = h.world.getPose().z;
  h.advance(150); assert(Math.abs(stopped - h.world.getPose().z) < .04);
  request.resolve(); await flush(); h.advance(50); assert(h.world.getPose().z < stopped - .8);
});

test('presentation server clock never rewinds on duplicate snapshots and caps RTT compensation', async t => {
  const h = await harness(t); const before = h.world.getAbilitySnapshot().now;
  await h.snapshot({}, { serverTime: 10000, clientTiming: { rttMs: 9000 } }); assert.equal(h.world.getAbilitySnapshot().now, before);
  await h.snapshot({}, { serverTime: 20000, clientTiming: { rttMs: 9000 } }); assert.equal(h.world.getAbilitySnapshot().now, 20250);
  h.advance(10); await h.snapshot({}, { serverTime: 20000, clientTiming: { rttMs: 20 } }); assert.equal(h.world.getAbilitySnapshot().now, 20350);
});

test('restoring a 160-event combat history does not replay old strikes, hits, or bolt releases', async t => {
  const battle = combat();
  battle.events = Array.from({ length: 160 }, (_, index) => {
    const common = { id: `history-${index}`, at: 7000 + index, playerId: 'self', actionId: `old-spell-${index}` };
    if (index % 4 === 0) return { ...common, type: 'enemy_attack_resolved', enemyId: 'crate', templateId: 'BOX-L1', hit: true, attack: { id: `old-strike-${index}`, origin: { x: 1, y: 0, z: 0 }, aim: { x: 0, y: 0, z: 5 } } };
    if (index % 4 === 1) return { ...common, type: 'enemy_damaged', enemyId: 'crate', damage: 20, impactPosition: { x: 1, y: .5, z: 0 } };
    if (index % 4 === 2) return { ...common, type: 'wall_hit', position: { x: 0, y: 1, z: 1 } };
    return { ...common, type: 'action_released', skillId: 'bolt', direction: { x: 0, y: 0, z: -1 }, position: { x: 0, y: 1, z: 5 } };
  });
  const h = await harness(t, { encounter: battle });
  let historyEffects = 0; h.scene().traverse(object => { if (/^(EnemyStrike:|TargetMagicImpact|WallEmberImpact|RedGoldSpellBolt)/.test(object.name)) historyEffects++; });
  assert.equal(historyEffects, 0); assert.equal(h.actors[0].calls.actions.length, 0);
  const fresh = { id: 'current-strike', type: 'enemy_attack_resolved', at: h.world.getAbilitySnapshot().now, enemyId: 'crate', templateId: 'BOX-L1', hit: false, attack: { id: 'current', origin: { x: 1, y: 0, z: 0 }, aim: { x: 0, y: 0, z: 5 } } };
  battle.events.push(fresh); await h.snapshot();
  assert.equal(objectsNamed(h.scene(), 'EnemyStrike:current').length, 1, 'current authoritative attacks still render');
  await h.snapshot(); assert.equal(objectsNamed(h.scene(), 'EnemyStrike:current').length, 1, 'the next snapshot does not replay even a recent event');
});

test('a historical start restores a currently active channel but not a cancelled one', async t => {
  const battle = combat();
  battle.players.self.action = { id: 'active-channel', skillId: 'levitate', startAt: 8500, releaseAt: 9300, completeAt: 11300, channel: true };
  battle.events = [
    { id: 'cancelled-channel-start', actionId: 'cancelled-channel', type: 'action_started', playerId: 'self', skillId: 'levitate', at: 8400, startAt: 8400, releaseAt: 9200, channelEndAt: 11200 },
    { id: 'active-channel-start', actionId: 'active-channel', type: 'action_started', playerId: 'self', skillId: 'levitate', at: 8500, startAt: 8500, releaseAt: 9300, channelEndAt: 11300 },
  ];
  const h = await harness(t, { encounter: battle });
  assert.equal(h.actors[0].calls.actions.length, 1); assert.equal(h.actors[0].calls.actions[0].actionId, 'active-channel');
  assert.equal(h.actors[0].debugSnapshot().timeline.phase, 'channel');
  h.advance(150); assert.equal(h.actors[0].debugSnapshot().timeline.phase, 'idle');
});

async function flyingLesson(h, flight = { allowed: true, canLand: true, maxHeight: 3 }) {
  await h.snapshot({ sceneId: 'SC09', currentQuestId: 'M06', skills: [], position: { x: 0, y: 0, z: 5, yaw: 0 }, flying: false }, { sceneId: 'SC09', quest: { id: 'M06', name: '飞行课' }, flight, targets: [{ id: 'M06-1', kind: 'flight', active: true, position: { x: 0, y: 0, z: 5 }, minY: .6 }] });
  h.advance();
}

test('Space ascends and Z descends during the actual flight lesson, without a locked broom skill request', async t => {
  const h = await harness(t); await flyingLesson(h);
  assert.equal(h.key('KeyX'), true); assert.equal(h.world.getFlightState().mode, 'flying');
  assert.equal(h.actions.length, 0, 'a trial mount is confirmed by movement, not an unlearned skill mutation');
  h.key('Space'); h.advance(100); h.key('Space', 'keyup'); const high = h.world.getPose().y;
  assert(high > 2 && high <= 2.7); assert.equal(h.world.getPose().flying, true);
  assert.equal(h.key('KeyZ'), true, 'the descent key suppresses browser defaults'); h.advance(50);
  assert(h.world.getPose().y < high - .5, `descent ${high} -> ${h.world.getPose().y}`); h.advance(100); h.key('KeyZ', 'keyup');
  assert.equal(h.world.getPose().y, 0); assert.equal(h.world.getPose().grounded, true); assert.equal(h.world.getPose().flying, false); assert.equal(h.world.getFlightState().mode, 'grounded');
  h.advance(40); assert.equal(h.world.getPose().y, 0, 'landing is stable, with no automatic bounce or jump');
});

for (const down of ['ControlLeft', 'ControlRight']) test(`${down} remains a descent key and takes precedence over a simultaneously held Space`, async t => {
  const h = await harness(t); await flyingLesson(h); h.world.setFlying(true); h.key('Space'); h.advance(80);
  const high = h.world.getPose().y; assert.equal(h.key(down), true); h.advance(50);
  assert(h.world.getPose().y < high - .5, `descent ${high} -> ${h.world.getPose().y}`); h.key('Space', 'keyup'); h.advance(100); h.key(down, 'keyup');
  assert.equal(h.world.getPose().flying, false); assert.equal(h.world.getPose().y, 0);
});

test('X retains flight mode throughout automatic landing and flight packets do not become high-altitude jumps', async t => {
  const h = await harness(t); await flyingLesson(h); h.key('KeyX'); h.key('Space'); h.advance(105); h.key('Space', 'keyup');
  for (let i = 0; i < 3; i++) h.world.takeMovementPacket();
  h.key('KeyX'); assert.equal(h.world.getFlightState().mode, 'landing'); assert.equal(h.world.getFlightState().canAscend, false);
  let samples = 0;
  while (h.world.getPose().flying && samples++ < 200) {
    h.advance(); const pose = h.world.getPose(), packet = h.world.takeMovementPacket();
    if (pose.y > .01) { assert.equal(pose.flying, true); assert.equal(packet.flying, true); assert.equal(pose.grounded, false); }
  }
  assert(samples < 200); assert.equal(h.world.getPose().y, 0); assert.equal(h.world.getPose().flying, false);
  assert.equal(h.world.takeMovementPacket().flying, false); assert.equal(h.actions.length, 0);
});

test('switching from a flight objective to its landing objective preserves a controlled descent across snapshots', async t => {
  const h = await harness(t); await flyingLesson(h); h.key('KeyX'); h.key('Space'); h.advance(80); h.key('Space', 'keyup');
  const position = { ...h.world.getPose() }, packet = h.world.takeMovementPacket(); h.world.noteMovementSent(1, packet.position);
  await h.snapshot({ position, flying: true, lastAcceptedMoveSequence: 1 }, { targets: [{ id: 'M06-3', kind: 'move', active: true, position: { x: 0, y: 0, z: 5 } }], flight: { allowed: false, canLand: true, maxHeight: 3 } });
  assert.equal(h.world.getFlightState().mode, 'landing'); assert.equal(h.world.getPose().flying, true);
  h.key('Space'); h.advance(35); h.key('Space', 'keyup'); assert(h.world.getPose().y < position.y - .5, `revoked ascent ${position.y} -> ${h.world.getPose().y}`);
  const descending = h.world.takeMovementPacket(); h.world.noteMovementSent(2, descending.position);
  await h.snapshot({ position: { ...h.world.getPose() }, flying: true, lastAcceptedMoveSequence: 2 }); assert.equal(h.world.getFlightState().mode, 'landing');
  h.advance(150); assert.equal(h.world.getPose().y, 0); assert.equal(h.world.getPose().flying, false);
  assert.equal(h.world.getNearest()?.id,'M06-3');assert.equal(h.world.getNearest()?.requiresInteraction,false,'landing is completed by the authoritative arrival check');const before=h.actions.length;h.key('KeyE');assert.equal(h.actions.length,before,'landing needs no extra E press');
});

test('active flying-key targets alone cannot bypass the dungeon broom authorization', async t => {
  const h = await harness(t);
  await h.snapshot({ sceneId: 'SC14', currentQuestId: 'M30', skills: ['broom'] }, { sceneId: 'SC14', quest: { id: 'M30' }, dungeon: { flightEnabledFor: [] }, targets: [{ id: 'key', kind: 'flight', active: true, position: { x: 0, y: 1.8, z: 0 } }] });
  h.advance(); h.key('KeyX'); assert.equal(h.world.getFlightState().available, false); assert.equal(h.world.getFlightState().mode, 'grounded');
  await h.snapshot({}, { dungeon: { flightEnabledFor: ['self'] }, flight: { allowed: true, canLand: true, maxHeight: 3 } });
  h.advance(); assert.equal(h.world.getFlightState().mode, 'flying');
});

async function enterArea(h,id,patch={}){
  const area=atlas.getWorldArea(id),current=h.state().character;
  const next={...current,areaId:id,sceneId:area.sceneId,currentQuestId:'M04',completedQuestIds:['M01','M02','M03'],collectionIds:[],acceptedSideQuestIds:[],position:{...area.spawn},locationEpoch:(current.locationEpoch??0)+1,...patch};
  await h.snapshot(next,getSceneView(next,10000));await flush();h.advance();return next;
}

test('train arrival keeps the same interior pose, camera and held movement while the outside realm changes', async t => {
  const h=await harness(t);
  await enterArea(h,'SC02_LONDON',{currentQuestId:'M03',completedQuestIds:['M01','M02'],position:{x:0,y:0,z:4,yaw:0},locationEpoch:6,transit:{startedAt:0,arriveAt:120000,toAreaId:'SC02_HOGSMEADE'}});
  await h.snapshot({}, {transit:{progress:.99}});h.advance(80);
  const cache=h.streams[0];assert(cache.entries.filter(entry=>entry.area.id!=='SC02_LONDON').every(entry=>!entry.root.visible),'station regions hide while the train is moving');
  h.key('ArrowLeft');h.advance(8);h.key('ArrowLeft','keyup');h.key('KeyW');h.advance(5);
  const before=h.world.getLocationState(),pose=h.world.getPose(),next={...h.state().character,areaId:'SC02_HOGSMEADE',locationEpoch:7,position:{...pose},transit:null,lastTransition:{kind:'train',fromAreaId:'SC02_LONDON',toAreaId:'SC02_HOGSMEADE'}};
  await h.snapshot(next,{...getSceneView(next,120000),transit:null});await flush();
  const after=h.world.getLocationState();assert.deepEqual(after.player,before.player,'arrival never applies the unrelated world-origin delta to the coach interior');assert.deepEqual(after.camera,before.camera);
  assert(cache.entries.every(entry=>entry.root.visible),'arriving restores the destination platform and station views');
  h.advance(10);h.key('KeyW','keyup');
  assert(h.world.getPose().z<pose.z-.1,'a held direction continues inside the same coach');
  const packet=h.world.takeMovementPacket();assert.equal(packet.areaId,'SC02_HOGSMEADE');assert.equal(packet.locationEpoch,7);assert(packet.steps.every(step=>Math.hypot(step.dx,step.dy,step.dz)<.05));
});

for(const areaId of ['SC02_LONDON','SC02_HOGSMEADE'])test(`${areaId} camera stays inside the solid vestibule end wall from the first rendered frame`,async t=>{
  for(const z of [13.75,16.5,17.1]){
    const h=await harness(t);await enterArea(h,areaId,{position:{x:.95,y:0,z,yaw:0}});
    // Reproduce the observed camera beyond the new z17.4 end wall. Checking
    // every actual frame catches smoothing through the wall, not just a final
    // desired position that eventually converges back inside.
    h.setCameraPosition({x:1.57,y:2,z:19});
    for(let frame=0;frame<40;frame++){h.advance();assert(h.cameraPosition().z<17.22,`camera crossed solid end wall at player z=${z}, frame=${frame}`);}
    assert.equal(h.world.getPose().z,z,'camera collision never rewrites the authoritative player pose');
  }
});

for(const [areaId,side]of [['SC02_LONDON',-1],['SC02_HOGSMEADE',1]])test(`${areaId} keeps the full platform doorway open to the camera while the opposite side remains solid`,async t=>{
  for(const lateral of [-.8,0,.8]){
    const h=await harness(t),position={x:side*.95,y:0,z:15.4+lateral,yaw:side*Math.PI/2};
    await enterArea(h,areaId,{position});const intended=geometry.chaseCameraPose(position,position.yaw,.1,4.8);
    h.setCameraPosition(intended.eye);h.advance();
    assert(h.cameraPosition().distanceTo(new Three.Vector3(intended.eye.x,intended.eye.y,intended.eye.z))<1e-7,'the camera can look through an actual open doorway without a virtual boundary panel');
    assert(Math.abs(h.cameraPosition().x)>4.1);
  }
  const h=await harness(t),position={x:-side*.95,y:0,z:15.4,yaw:-side*Math.PI/2};
  await enterArea(h,areaId,{position});h.setCameraPosition(geometry.chaseCameraPose(position,position.yaw,.1,4.8).eye);h.advance();
  assert(Math.abs(h.cameraPosition().x)<3.0,'the closed side panel still stops the camera');
});

test('the lake camera frames both boat passengers above the water and retains free right-drag look',async t=>{
  const boat=createBoatMotion(),h=await harness(t,{boatMotion:boat}),position={x:0,y:0,z:21};
  await enterArea(h,'SC03',{currentQuestId:'M03',position:{...position,yaw:0}});
  await h.snapshot({}, {escort:{npc:'海格',targetId:'lake-guide',kind:'boat',progress:.5,position},targets:[{id:'lake-guide',npc:'海格',kind:'boat',label:'乘船',position,active:true}]});
  await flush();h.advance(180);
  const player=h.world.getPose(),guide=boat.getPose('guide').position,camera=h.cameraPosition();
  assert(player.riding);assert(camera.y>player.y+3.8,'the raised viewpoint clears Hagrid and the hull');
  assert(Math.hypot(camera.x-player.x,camera.z-player.z)>8,'the wider framing includes the boat and landscape');
  for(const p of [{...player},{...player,y:player.y+1.75},{...guide},{...guide,y:guide.y+3.5}]){const ndc=h.ndc(p);assert(Math.abs(ndc.x)<.95&&Math.abs(ndc.y)<.95,'both passenger silhouettes remain on screen');}
  const castle=h.ndc({x:0,y:10,z:-42}),hagrid=h.ndc({...guide,y:guide.y+2});
  assert(Math.abs(castle.x-hagrid.x)>.13,'the offset composition leaves the castle clear of Hagrid');
  const before=h.cameraDirection();h.dragCamera(130,-20);h.advance(45);
  assert(h.cameraDirection().distanceTo(before)>.5,'right dragging still turns the actual boat camera');assert(h.world.getPose().riding);
});

for(const [direction,x,y] of [['up',-3.5,2.5],['down',3.5,7.5]])test(`jumping ${direction} an elevated stair flight rejoins the changing floor without a legacy-ground rebound`, async t => {
  const h=await harness(t),area=atlas.getWorldArea('STAIR_G1');
  await enterArea(h,area.id,{position:{x,y,z:0,yaw:0}});
  h.world.takeMovementPacket();h.key('KeyW');h.key('Space');
  let authoritative={...h.state().character},maxHeight=0,last={...h.world.getPose()},airborneFrames=0;
  for(let frame=0;frame<150;frame++){
    h.advance();if(frame===1)h.key('Space','keyup');
    const pose={...h.world.getPose()},floor=atlas.areaFloor(area.id,pose);maxHeight=Math.max(maxHeight,pose.y-floor);
    if(!pose.grounded)airborneFrames++;
    assert(pose.y>=floor-1e-8);assert(Math.abs(pose.y-last.y)<.08,'the animation moves on a continuous arc, never resets to the old floor');last=pose;
    if(frame%10===9){
      const packet=h.world.takeMovementPacket(),path=movement.movementPath(authoritative.position,packet.position,packet.steps);
      const server=replayAreaMovement(authoritative,path.points,area.navigation);
      assert(Math.hypot(server.x-packet.position.x,server.y-packet.position.y,server.z-packet.position.z)<1e-7,'the server replays the actual RAF packet against the same stair surface');
      authoritative={...authoritative,position:{...server,yaw:pose.yaw},lastAcceptedMoveSequence:100+frame};
      h.world.noteMovementSent(100+frame,packet.position);await h.snapshot(authoritative);
    }
  }
  h.key('KeyW','keyup');assert(maxHeight>.4);assert(airborneFrames>20);assert(h.world.getPose().grounded);assert(Math.abs(h.world.getPose().y-y)>.75,'the landing follows the changed surface');
});
const nearVector=(actual,expected,label)=>{for(const axis of ['x','y','z'])assert(Math.abs(actual[axis]-expected[axis])<1e-7,`${label}.${axis}: ${actual[axis]} vs ${expected[axis]}`);};

test('advancing the quest within one area preserves the real environment, player position and camera',async t=>{
  const h=await harness(t);await enterArea(h,'SC04');h.advance(100);
  const active=h.streams[0].active,builds=h.environments.length,player=h.actors[0].root.position.clone(),camera=h.cameraPosition();
  const next={...h.state().character,currentQuestId:'M05',completedQuestIds:['M01','M02','M03','M04'],position:{...h.world.getPose()}};
  await h.snapshot(next,getSceneView(next,11000));
  assert.equal(h.streams[0].active,active);assert.equal(h.environments.length,builds,'new objectives do not rebuild room art');
  nearVector(h.actors[0].root.position,player,'player before RAF');nearVector(h.cameraPosition(),camera,'camera before RAF');
  h.advance();nearVector(h.actors[0].root.position,player,'player after quest advancement');assert.equal(active.map.record.disposals,0);
});

test('held W crosses a wide station doorway with exact camera and landmark continuity and a fresh movement epoch',async t=>{
  let resolveTravel;const h=await harness(t,{request:action=>action.type==='travel'?new Promise(resolve=>{resolveTravel=resolve;}):Promise.resolve()});
  await enterArea(h,'SC01',{currentQuestId:'M02',completedQuestIds:['M01'],position:{x:.8,y:0,z:-10.4,yaw:0},locationEpoch:5});h.advance(90);
  const platform=h.streams[0].entries.find(entry=>entry.area.id==='LONDON_PLATFORM');assert(platform);
  h.key('KeyW');for(let frame=0;frame<200&&!h.actions.some(action=>action.type==='travel');frame++)h.advance();
  const action=h.actions.find(action=>action.type==='travel');assert(action,'off-centre entry at x=.8 must trigger across the full door width');assert.equal(action.fromAreaId,'SC01');assert.equal(action.locationEpoch,5);
  const player=h.actors[0].root.position.clone(),camera=h.cameraPosition(),landmark=platform.map.record.landmark.getWorldPosition(new Three.Vector3()),relative=landmark.clone().sub(camera);
  h.world.noteMovementSent(50,{...h.world.getPose()});const delta=areaOffset('SC01','LONDON_PLATFORM'),position={x:player.x+delta.x,y:player.y+delta.y,z:player.z+delta.z,yaw:h.world.getPose().yaw};
  const next={...h.state().character,areaId:'LONDON_PLATFORM',sceneId:'LONDON_PLATFORM',position,locationEpoch:6};
  await h.snapshot(next,getSceneView(next,11000));
  assert.equal(h.streams[0].active,platform,'the preloaded map becomes active without reconstruction');
  nearVector(h.actors[0].root.position,new Three.Vector3(position.x,position.y,position.z),'rebased player');nearVector(h.cameraPosition(),camera.clone().add(new Three.Vector3(delta.x,delta.y,delta.z)),'rebased camera');
  nearVector(platform.map.record.landmark.getWorldPosition(new Three.Vector3()).sub(h.cameraPosition()),relative,'same physical landmark relative to camera');
  resolveTravel();await flush();const before=h.actors[0].root.position.clone();h.advance(5);
  assert(h.actors[0].root.position.z<before.z-.08,'held W and its velocity survive the seam without another keydown');
  const packet=h.world.takeMovementPacket();assert.equal(packet.areaId,'LONDON_PLATFORM');assert.equal(packet.locationEpoch,6);assert(packet.steps.length>0);assert(packet.steps.every(step=>Math.hypot(step.dx,step.dy,step.dz)<.05),'render-origin shifts never enter persisted movement deltas');
  h.key('KeyW','keyup');
});

test('the actual RAF controller climbs both stair flights continuously using the shared floor surface',async t=>{
  const h=await harness(t);await enterArea(h,'STAIR_G1',{currentQuestId:'M05',position:{x:-3.5,y:0,z:11.5,yaw:0}});h.advance(75);
  let previous=h.world.getPose();const heights=[];
  const walkUntil=(key,done)=>{h.key(key);for(let frame=0;frame<1400&&!done(h.world.getPose());frame++){h.advance();const pose=h.world.getPose();assert(Math.abs(pose.y-previous.y)<.035,'walking cannot teleport up a floor');assert(Math.abs(pose.y-atlas.areaFloor('STAIR_G1',pose))<1e-7);heights.push(pose.y);previous=pose;}h.key(key,'keyup');assert(done(h.world.getPose()),key+' reaches the authored stair landing');};
  walkUntil('KeyW',pose=>pose.z<=-10.5);h.advance(30);previous=h.world.getPose();
  walkUntil('KeyD',pose=>pose.x>=3.4);h.advance(30);previous=h.world.getPose();
  walkUntil('KeyS',pose=>pose.z>=10.5);
  assert(Math.max(...heights)>9.99);assert(heights.some(y=>y>2&&y<3));assert(heights.some(y=>y>7&&y<8));assert.equal(h.world.getPose().flying,false);
  const steps=[];let packet=h.world.takeMovementPacket();while(packet.steps.length){assert.equal(packet.areaId,'STAIR_G1');steps.push(...packet.steps);packet=h.world.takeMovementPacket();}
  assert(steps.some(step=>step.dy>0));assert(steps.every(step=>Math.abs(step.dy)<.035));
});

test('returning to character selection releases cached areas once and re-entry builds independent maps',async t=>{
  const h=await harness(t);await enterArea(h,'SC01');const old=h.streams[0].entries.map(entry=>entry.map.record),selected=h.actors.slice(0,3);
  h.world.selectionStage('hermione');h.advance();assert.equal(h.streams[0].entries.length,0);assert.equal(h.world.getPose(),null);assert(old.every(record=>record.disposals===1));assert(selected.every(actor=>actor.calls.dispose===0),'selection retains its resident workshop actors');
  await enterArea(h,'SC01');assert(h.streams[0].entries.length>0);assert(h.streams[0].entries.every(entry=>!old.includes(entry.map.record)));
  h.dispose();assert(old.every(record=>record.disposals===1));assert(h.environments.every(record=>record.disposals===1));assert(selected.every(actor=>actor.calls.dispose===1));
});

test('party actors use independent area identities even when two rooms share the same legacy scene',async t=>{
  const h=await harness(t),original=new Set(h.actors),member=(id,heroId,areaId,lastSeenAt=10000)=>({id,heroId,areaId,sceneId:'SC14',position:{x:1,y:0,z:4,yaw:0},hp:100,lastSeenAt});
  h.setMembers([member('same','ron','SC14-M29'),member('elsewhere','hermione','SC14-M30'),member('offline','harry','SC14-M29',-40000)]);
  await enterArea(h,'SC14-M29',{currentQuestId:'M29'});await flush();h.advance();
  const peers=h.actors.filter(actor=>!original.has(actor));assert.deepEqual(peers.map(actor=>actor.root.name),['ron']);assert.equal(peers[0].calls.dispose,0);
  h.setMembers([member('same','ron','SC14-M30'),member('elsewhere','hermione','SC14-M29')]);await h.snapshot();await flush();h.advance();
  assert.equal(peers[0].calls.dispose,1,'a peer leaving this area is removed');const active=h.actors.filter(actor=>!original.has(actor)&&actor.calls.dispose===0);assert.deepEqual(active.map(actor=>actor.root.name),['hermione']);
});

test('a standing NPC blocks sprinting, allows walking around and keeps the interaction reachable', async t => {
  const h = await harness(t);
  const target = { id:'meet-molly', kind:'talk', npc:'韦斯莱夫人', label:'韦斯莱夫人：准备出发', active:true, position:{x:0,y:0,z:2}, radius:2 };
  await h.snapshot({}, { targets:[target] }); await flush(); h.advance(10);
  h.key('KeyW'); h.key('ShiftLeft'); h.advance(150); h.key('KeyW','keyup'); h.key('ShiftLeft','keyup'); h.advance(20);
  let pose=h.world.getPose(); assert(pose.z>=2.63 && pose.z<2.8,'the player stops against the actual person instead of passing through');
  assert.equal(h.world.getNearest()?.id,target.id); h.key('KeyE'); assert.equal(h.actions.at(-1)?.targetId,target.id);
  h.key('KeyD'); h.advance(60); h.key('KeyD','keyup'); h.key('KeyW'); h.advance(130); h.key('KeyW','keyup'); h.advance(20);
  pose=h.world.getPose(); assert(pose.x>1); assert(pose.z<1,'the person can be passed on their side without a trap or teleport');
});

test('an active party member occupies space while somebody on another floor does not', async t => {
  const peer={id:'friend',heroId:'ron',name:'Friend',hp:100,areaId:'SC04',sceneId:'SC04',position:{x:0,y:0,z:2},lastSeenAt:10000};
  const h=await harness(t,{members:[peer]}); await flush(); h.key('KeyW'); h.key('ShiftLeft'); h.advance(130); h.key('KeyW','keyup');h.key('ShiftLeft','keyup');h.advance(20);
  assert(h.world.getPose().z>=2.63,'walking through the other player is blocked');
  h.setMembers([{...peer,position:{x:0,y:10,z:2}}]);await h.snapshot();h.advance(80);h.key('KeyW');h.advance(180);h.key('KeyW','keyup');h.advance(20);
  assert(h.world.getPose().z<1,'a body at another elevation cannot block the ground-floor route');
});

test('an NPC has no duplicate shoulder-height interaction plaque but other world target labels remain',async t=>{
  const h=await harness(t),person={id:'molly',kind:'talk',npc:'韦斯莱夫人',label:'韦斯莱夫人：你好',active:true,position:{x:0,y:0,z:2},radius:2},object={id:'look-object',kind:'collect',label:'拾取物品',active:true,position:{x:1.5,y:0,z:2},radius:2};
  await h.snapshot({}, {targets:[person,object]});await flush();h.advance(30);
  const markers=[];h.scene().traverse(node=>{if(node.userData.target&&node.userData.tag)markers.push(node);});
  assert.equal(markers.find(node=>node.userData.target.id===person.id).userData.tag.visible,false,'no dark strip remains across the NPC torso');
  assert.equal(markers.find(node=>node.userData.target.id===object.id).userData.tag.visible,true,'non-person target labels are unaffected');
});
