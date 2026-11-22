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
async function harness(t, { encounter = null, members = [], request = null } = {}) {
  let now = 1000, frame, camera, renderedScene;
  const window = new Events(), document = new Events(), canvas = new Events(), actors = [], actions = [], aims = [], walls = [];
  canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1280, height: 720 }); canvas.setPointerCapture = () => {};
  const draw = new Proxy({ createRadialGradient: () => ({ addColorStop() {} }) }, { get: (object, key) => object[key] ?? (() => {}) });
  document.createElement = () => ({ width: 0, height: 0, getContext: () => draw }); document.hidden = false;
  class Renderer {
    shadowMap = {}; info = { render: {}, memory: {} };
    setPixelRatio() {} setSize() {} dispose() {}
    render(scene, view) { scene.updateMatrixWorld(true); view.updateMatrixWorld(true); camera = view; renderedScene = scene; }
  }
  const loadCharacter = async id => { const value = avatar(id); actors.push(value); return value; };
  const harmlessFx = () => ({ root: new Three.Group(), prepare() {}, begin() {}, update() {}, cancel() {}, reset() {}, dispose() {} });
  const context = vm.createContext({
    THREE: { ...Three, WebGLRenderer: Renderer }, RoundedBoxGeometry,
    ...geometry, ...targeting, ...movement, contentData, abilityState, applyEquipmentAppearance, resetEquipmentAppearance, createBoltVisual, createImpactVisual, createEnemyWarning, createEnemyStrike, SELECTABLE_HEROES, selectionCameraPose,
    createSelectionStage: options => residentStage({ ...options, loadCharacter }), createSelectionSpells: harmlessFx,
    loadPlayableCharacter: loadCharacter, loadNpc: async () => ({ root: new Three.Group(), update() {}, dispose() {} }),
    createCreature: () => ({ root: new Three.Group(), update() {}, dispose() {} }),
    createSceneEnvironment: () => ({ update() {}, dispose() {}, setEscort() {}, setContext() {} }),
    getSceneNavigation: () => ({ bounds: [-40, 40, -40, 40], walls }),
    planJourney: () => null, createJourneyTransition: () => { throw new Error('Journey construction is outside this control test'); }, configureGateway: () => null,
    window, document, innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1,
    performance: { now: () => now }, console,
    addEventListener: window.addEventListener.bind(window), removeEventListener: window.removeEventListener.bind(window),
    requestAnimationFrame: fn => { frame = fn; return 1; }, cancelAnimationFrame() {},
  });
  vm.runInContext(source + '\nglobalThis.makeWorld=createStoneWorld;', context);
  const world = context.makeWorld(canvas, { onAction: action => { actions.push(action); return request ? request(action) : Promise.resolve(); }, onAim: value => aims.push(value) });
  t.after(() => world.dispose()); await world.prepareSelection('harry');
  let character = { id: 'self', heroId: 'harry', sceneId: 'SC04', hp: 100, position: { x: 0, y: 0, z: 5, yaw: 0 }, currentQuestId: 'M04', skills: ['bolt', 'dodge', 'rescue', 'levitate', 'H1', 'mark'], lastAcceptedMoveSequence: 0, encounter };
  let room = members.length ? { code: 'TEST', members, encounter } : null;
  let view = { sceneId: 'SC04', name: 'Test room', quest: { id: 'M04', name: 'Practice', npc: '' }, targets: [], serverTime: 10000 };
  const snapshot = async (next = {}, viewPatch = {}) => { view = { ...view, ...viewPatch }; character = { ...character, ...next }; if (room) room = { ...room, encounter: character.encounter }; await world.setSnapshot(character, room, view); await Promise.resolve(); };
  await snapshot();
  function advance(count = 1, milliseconds = 10) { for (let i = 0; i < count; i++) { now += milliseconds; const callback = frame; frame = null; assert(callback, 'the production frame loop must remain alive'); callback(now); } }
  advance(30);
  return { world, actions, aims, actors, walls, character, snapshot, advance, scene: () => renderedScene, blur: () => window.emit('blur'),
    key(code, type = 'keydown', detail = {}) { let prevented = false; window.emit(type, { code, preventDefault() { prevented = true; }, ...detail }); return prevented; },
    pointerAt(point) { const ndc = new Three.Vector3(point.x, point.y, point.z).project(camera); canvas.emit('pointerdown', { button: 0, clientX: (ndc.x + 1) * 640, clientY: (1 - ndc.y) * 360, pointerId: 1 }); },
    ndc(point) { const p = new Three.Vector3(point.x, point.y, point.z).project(camera); return new Three.Vector2(p.x, p.y); },
    cameraDirection: () => camera.getWorldDirection(new Three.Vector3()),
  };
}
const combat = () => ({ id: 'test-battle', status: 'active', players: { self: { id: 'self', hp: 100, focus: 100, position: { x: 0, y: 0, z: 5 }, cooldowns: {}, gcdUntil: 0, action: null, learnedSkillIds: ['bolt', 'dodge', 'rescue', 'levitate', 'H1', 'mark'], potions: { health: 1, focus: 1 }, potionUses: 0 } }, enemies: { crate: { id: 'crate', templateId: 'BOX-L1', name: 'Low crate', hp: 100, maxHp: 100, radius: .45, collisionHeight: .85, position: { x: 1.5, y: 0, z: 0 } } }, events: [] });

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
  h.key('KeyE'); assert.equal(h.actions.at(-1)?.targetId, 'M06-3', 'the grounded character can interact with the course completion target');
});

test('active flying-key targets alone cannot bypass the dungeon broom authorization', async t => {
  const h = await harness(t);
  await h.snapshot({ sceneId: 'SC14', currentQuestId: 'M30', skills: ['broom'] }, { sceneId: 'SC14', quest: { id: 'M30' }, dungeon: { flightEnabledFor: [] }, targets: [{ id: 'key', kind: 'flight', active: true, position: { x: 0, y: 1.8, z: 0 } }] });
  h.advance(); h.key('KeyX'); assert.equal(h.world.getFlightState().available, false); assert.equal(h.world.getFlightState().mode, 'grounded');
  await h.snapshot({}, { dungeon: { flightEnabledFor: ['self'] }, flight: { allowed: true, canLand: true, maxHeight: 3 } });
  h.advance(); assert.equal(h.world.getFlightState().mode, 'flying');
});
