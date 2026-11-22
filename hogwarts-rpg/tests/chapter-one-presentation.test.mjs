import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { SOURCE, verifyWorkshop } from '../chapter-one/presentation/import-workshop.mjs';
import { ASSET_VERSION, HISTORICAL_ASSET_VERSION, HISTORICAL_PACKAGE_ROOT, CHARACTER_ASSETS, resolveCharacterAsset } from '../chapter-one/presentation/registry.mjs';
import { createCharacterPresentation, createPresentationLibrary } from '../chapter-one/presentation/character-adapter.mjs';
import { attachCharacterStatePresentation } from '../chapter-one/presentation/state-layer.mjs';
import { loadPlayableCharacter } from '../chapter-one/presentation/playable-character.mjs';

// Parse real geometry, skins, morphs and animation tracks. Node has no image DOM;
// texture decoding/rendering is deliberately outside these headless assertions.
async function parseAsset(heroId, assetVersion = ASSET_VERSION) {
  const descriptor = resolveCharacterAsset(heroId, assetVersion);
  const bytes = await readFile(new URL(descriptor.url));
  const loader = new GLTFLoader();
  loader.register(() => ({ name: 'HEADLESS_NO_TEXTURE_DECODE', loadTexture: () => Promise.resolve(null) }));
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}
const models = new Map();
async function model(heroId, assetVersion = ASSET_VERSION) {
  const key = `${heroId}:${assetVersion}`;
  if (!models.has(key)) models.set(key, parseAsset(heroId, assetVersion));
  return models.get(key);
}
const firstMesh = root => { let result; root.traverse(node => { if (!result && node.isMesh) result = node; }); return result; };
const morphMesh = root => { let result; root.traverse(node => { if (!result && node.morphTargetInfluences?.length) result = node; }); return result; };
function tracksDigest(gltf) {
  const hash = createHash('sha256');
  for (const clip of gltf.animations) for (const track of clip.tracks) {
    hash.update(track.name); hash.update(Buffer.from(track.times.buffer)); hash.update(Buffer.from(track.values.buffer));
  }
  return hash.digest('hex');
}

test('B01: three detailed published characters, ten exact current blobs and intact historical package', async () => {
  assert.equal((await verifyWorkshop()).files, 10);
  assert.equal(SOURCE.commit, '65154a9106f34fc3f76fb1b9613cf28c2f93b6cd');
  assert(SOURCE.files.some(file => file.path.endsWith('/hermione-scholar.glb')));
  assert(SOURCE.files.some(file => file.path.endsWith('/ron-weasley.glb')));
  const historical = JSON.parse(await readFile(new URL('../chapter-one/presentation/frozen-sources.612434e54cf7.json', import.meta.url), 'utf8'));
  assert.equal((await verifyWorkshop(new URL(HISTORICAL_PACKAGE_ROOT).pathname, historical)).files, 10);
  assert.equal(SOURCE.files.find(file => file.path.endsWith('/harry-pathfinder.glb')).sha256, historical.files.find(file => file.path.endsWith('/harry-pathfinder.glb')).sha256);
  for (const descriptor of Object.values(CHARACTER_ASSETS)) {
    const file = SOURCE.files.find(file => file.path.endsWith(`/${descriptor.filename}`));
    assert.equal(file.sha256, descriptor.sha256);
  }
  assert.throws(() => resolveCharacterAsset('hermione', 'unreleased-scholar'), /UNRELEASED/);
  assert.throws(() => resolveCharacterAsset('neville'), /NO_PUBLISHED/);
});

test('B02: real 15/22-joint rigs retain source bones and use only a parent facing conversion', async () => {
  for (const [heroId, assetVersion] of [['harry', ASSET_VERSION], ['hermione', ASSET_VERSION], ['ron', ASSET_VERSION], ['hermione', HISTORICAL_ASSET_VERSION]]) {
    const source = await model(heroId, assetVersion), originalRotation = source.scene.quaternion.toArray();
    const originalTracks = tracksDigest(source);
    const actor = createCharacterPresentation(source, { heroId, assetVersion });
    assert.equal(actor.capabilities.jointCount, resolveCharacterAsset(heroId, assetVersion).jointCount);
    for (const name of ['Hips', 'Chest', 'HandR', 'FootL', 'FootR']) assert(actor.capabilities.boneNames.includes(name));
    if (heroId === 'harry') for (const name of ['Cervical', 'CueThumbL', 'GarnetLight']) assert(actor.capabilities.boneNames.includes(name));
    assert.deepEqual(actor.model.quaternion.toArray(), originalRotation);
    const forward = actor.model.parent.localToWorld(new Vector3(0, 0, 1));
    assert(Math.abs(forward.x) < 1e-9 && Math.abs(forward.z + 1) < 1e-9);
    assert.equal(actor.capabilities.backAccessorySource, 'mapped_bone:Chest');
    assert(actor.getAnchorWorldMatrix('backAccessory').equals(actor.model.getObjectByName('Chest').matrixWorld));
    actor.updateTravel(1 / 60, actor.walkSpeed / 60);
    actor.dispose();
    assert.deepEqual(source.scene.quaternion.toArray(), originalRotation);
    assert.equal(tracksDigest(source), originalTracks);
  }
});

test('source-calibrated speeds and zero collision-resolved distance never advance walk phase', async () => {
  for (const heroId of ['harry', 'hermione', 'ron']) {
    const actor = createCharacterPresentation(await model(heroId), { heroId });
    assert(Math.abs(actor.walkSpeed - CHARACTER_ASSETS[heroId].calibratedWalkMps) < 1e-8);
    assert(Math.abs(actor.runSpeed - CHARACTER_ASSETS[heroId].calibratedRunMps) < 1e-8);
    for (let i = 0; i < 20; i++) actor.updateTravel(1 / 60, 0);
    assert.equal(actor.debugSnapshot().clips.Walk.weight, 0);
    for (let i = 0; i < 30; i++) actor.updateTravel(1 / 60, actor.walkSpeed / 60);
    const moving = actor.debugSnapshot().clips.Walk;
    assert(moving.weight > .9);
    actor.updateTravel(1 / 60, 0);
    const blocked = actor.debugSnapshot().clips.Walk;
    assert.equal(blocked.time, moving.time, 'wall contact must not advance a stationary footfall');
    assert(blocked.weight < moving.weight, 'original stop fade is retained');
    for (let i = 0; i < 100; i++) actor.updateTravel(1 / 60, 0);
    assert.equal(actor.debugSnapshot().clips.Walk.weight, 0);
    assert.throws(() => actor.updateTravel(.1, -1), /INVALID_TRAVEL/);
    actor.dispose();
  }
});

test('three current faces have real morphs, historical no-morph models still explicitly degrade', async () => {
  for (const heroId of ['harry', 'hermione', 'ron']) {
    const actor = createCharacterPresentation(await model(heroId), { heroId });
    assert(actor.capabilities.morphNames.includes('FaceBlinkL'));
    assert.equal(actor.capabilities.morphNames.length, heroId === 'harry' ? 17 : 23);
    assert.equal(actor.capabilities.facialMorphs, true);
    actor.dispose();
  }
  const source = await model('harry');
  const a = createCharacterPresentation(source, { heroId: 'harry' });
  const b = createCharacterPresentation(source, { heroId: 'harry' });
  assert(a.capabilities.morphNames.includes('FaceBlinkL'));
  const am = morphMesh(a.model), bm = morphMesh(b.model), sm = morphMesh(source.scene);
  assert.notEqual(am.morphTargetInfluences, bm.morphTargetInfluences);
  assert.notEqual(am.morphTargetInfluences, sm.morphTargetInfluences);
  const original = bm.morphTargetInfluences[0];
  am.morphTargetInfluences[0] = .371;
  assert.equal(bm.morphTargetInfluences[0], original);
  a.dispose(); b.dispose();
  for (const heroId of ['hermione', 'ron']) {
    const actor = createCharacterPresentation(await model(heroId, HISTORICAL_ASSET_VERSION), { heroId, assetVersion: HISTORICAL_ASSET_VERSION });
    assert.equal(actor.capabilities.facialMorphs, false);
    assert.equal(actor.capabilities.facialDegradation, 'PUBLISHED_MODEL_HAS_NO_FACIAL_MORPHS');
    assert.equal(actor.setExpressionContext({ happy: true }).applied, false);
    actor.dispose();
  }
});

test('detailed wand origin follows source skinning and all three published fixed looks are protected', async () => {
  for (const heroId of ['harry', 'hermione', 'ron']) {
    const actor = createCharacterPresentation(await model(heroId), { heroId });
    const start = actor.getCastOriginWorld();
    actor.root.position.set(3, 2, -4);
    assert(actor.getCastOriginWorld().distanceTo(start.clone().add(new Vector3(3, 2, -4))) < 1e-6);
    actor.playStudioCast('demo');
    actor.updateTravel(.8, 0);
    assert(actor.getCastOriginWorld().distanceTo(start.clone().add(new Vector3(3, 2, -4))) > .01);
    const beforeLook = actor.getCastOriginWorld();
    assert.equal(actor.setVisualLoadout({ wand: 'holly', outfit: 'travel' }).reason, 'FIXED_PUBLISHED_LOOK');
    assert(actor.getCastOriginWorld().distanceTo(beforeLook) < 1e-9);
    actor.dispose();
  }
  const legacy = createCharacterPresentation(await model('hermione', HISTORICAL_ASSET_VERSION), { heroId: 'hermione', assetVersion: HISTORICAL_ASSET_VERSION });
  legacy.setVisualLoadout({ wand: 'holly' }); const short = legacy.getCastOriginWorld();
  legacy.setVisualLoadout({ wand: 'willow' }); const long = legacy.getCastOriginWorld();
  assert(short.distanceTo(long) > .03, 'historical source wand variants remain independently mapped');
  legacy.dispose();
});

test('published footwear calibration exposes four finite world-space sole contacts', async () => {
  for (const heroId of ['harry', 'hermione', 'ron']) {
    const actor = createCharacterPresentation(await model(heroId), { heroId });
    const contacts = Array.from({ length: 4 }, () => new Vector3());
    assert.equal(actor.readSoleContacts(contacts), true);
    assert(contacts.every(point => point.toArray().every(Number.isFinite)));
    const before = contacts.map(point => point.clone());
    actor.root.position.set(3, 2, -4);
    assert.equal(actor.readSoleContacts(contacts), true);
    for (let i = 0; i < 4; i++) assert(contacts[i].distanceTo(before[i].add(new Vector3(3, 2, -4))) < 1e-6);
    actor.dispose();
  }
});

test('five instances isolate cast cancellation, materials, skeletons and disposal', async () => {
  let loads = 0;
  const library = createPresentationLibrary({ loadGltf: async () => { loads++; return parseAsset('hermione'); } });
  const [a, b, c, d, e] = await Promise.all(Array.from({ length: 5 }, () => library.loadCharacterPresentation('hermione')));
  assert.equal(loads, 1);
  assert.equal(library.activeAssets, 1);
  assert.notEqual(a.model.getObjectByName('HandR'), b.model.getObjectByName('HandR'));
  const am = firstMesh(a.model), bm = firstMesh(b.model);
  assert.equal(am.geometry, bm.geometry, 'read-only geometry may be shared');
  assert.notEqual(am.material, bm.material);
  const amaterial = [].concat(am.material)[0], bmaterial = [].concat(bm.material)[0];
  const bOpacity = bmaterial.opacity;
  amaterial.opacity = .317;
  assert.equal(bmaterial.opacity, bOpacity);
  let geometryDisposals = 0;
  bm.geometry.addEventListener('dispose', () => geometryDisposals++);
  assert(a.playStudioCast('a')); assert(b.playStudioCast('b'));
  a.updateTravel(.4, 0); b.updateTravel(.4, 0);
  assert.equal(a.cancelAction('wrong-id'), false);
  assert.equal(a.cancelAction('a'), true);
  a.updateTravel(.2, 0);
  assert.equal(a.debugSnapshot().actionId, null);
  assert.equal(b.debugSnapshot().actionId, 'b');
  const before = b.debugSnapshot().clips.Cast.time;
  a.dispose(); a.dispose();
  assert.equal(geometryDisposals, 0);
  assert.equal(library.activeAssets, 1);
  b.updateTravel(.1, 0);
  assert(b.debugSnapshot().clips.Cast.time > before);
  for (const actor of [c, d, e]) assert.equal(actor.debugSnapshot().actionId, null);
  b.dispose();
  assert.equal(geometryDisposals, 0);
  c.dispose(); d.dispose(); e.dispose();
  assert.equal(geometryDisposals, 1);
  assert.equal(library.activeAssets, 0);
  assert.throws(() => a.getCastOriginWorld(), /PRESENTATION_DISPOSED/);
});

test('source full Cast stays full-length while independent combat, airborne and seated layers work', async () => {
  const source = await model('hermione');
  const actor = createCharacterPresentation(source, { heroId: 'hermione' });
  assert(actor.playStudioCast('teaching'));
  actor.updateTravel(.2, 0);
  const cast = actor.debugSnapshot().clips.Cast;
  assert(Math.abs(cast.duration - 3.1666667) < 1e-6);
  assert.equal(cast.timeScale, 1);
  assert.equal(source.parser.json.animations.find(clip => clip.name === 'Cast').extras.phases.release, 2.4583333333333335);
  assert.equal(actor.playAuthoritativeAction('fast', 'bolt', 0, .12, .5, 'hit').accepted, true);
  assert.equal(actor.updateTravel(.1, .2, false, 1).supported, true);
  assert.equal(actor.updateTravel(.1, 0, true, 0, true).supported, true);
  assert.equal(actor.debugSnapshot().clips.Cast.timeScale, 1);
  actor.resetPresentation({ position: [1, 2, 3], yaw: .5 });
  assert.equal(actor.debugSnapshot().actionId, null);
  assert.deepEqual(actor.root.position.toArray(), [1, 2, 3]);
  assert.equal(actor.capabilities.combatFastCast, true);
  actor.dispose();
});

test('B03: real upper-body casts follow authority release once while legs keep distance-driven phase', async () => {
  for (const heroId of ['harry', 'hermione', 'ron']) {
    const source = await model(heroId), digest = tracksDigest(source);
    const actor = createCharacterPresentation(source, { heroId });
    const before = actor.getCastOriginWorld();
    assert.equal(actor.playAuthoritativeAction({ actionId: 'bolt-1', skillId: 'bolt', startAtMs: 1000, releaseAtMs: 1120, endAtMs: 1520, nowMs: 1000 }).accepted, true);
    actor.updateTravel(.119, actor.walkSpeed * .119);
    assert.equal(actor.consumePresentationEvents().length, 0);
    const phase = actor.debugSnapshot().clips.Walk.time;
    actor.updateTravel(.001, actor.walkSpeed * .001);
    assert.deepEqual(actor.consumePresentationEvents().map(e => [e.type, e.atMs]), [['release', 1120]]);
    assert.notEqual(actor.debugSnapshot().clips.Walk.time, phase);
    assert(actor.debugSnapshot().layers.sampledUpperBones.includes('HandR'));
    assert(actor.getCastOriginWorld().distanceTo(before) > .01);
    actor.updateTravel(.5, actor.walkSpeed * .5);
    assert.deepEqual(actor.consumePresentationEvents().map(e => e.type), ['end']);
    assert.equal(actor.debugSnapshot().actionId, null);
    assert.equal(tracksDigest(source), digest);
    actor.dispose();
  }
});

test('B03: duplicate, stale, canceled and delayed authority events cannot replay release cues', async () => {
  const actor = createCharacterPresentation(await model('harry'), { heroId: 'harry' });
  const event = { actionId: 'interrupt-1', skillId: 'H1', startAtMs: 100, nowMs: 100 };
  assert(actor.playAuthoritativeAction(event).accepted);
  actor.updateTravel(.149, 0);
  assert.equal(actor.consumePresentationEvents().length, 0);
  assert.equal(actor.cancelAction('incorrect'), false);
  assert.equal(actor.cancelAction(event.actionId, 'stunned'), true);
  actor.updateTravel(.3, 0);
  assert.deepEqual(actor.consumePresentationEvents().map(e => e.type), ['cancel']);
  assert.equal(actor.playAuthoritativeAction(event).reason, 'DUPLICATE_ACTION');
  assert.equal(actor.playAuthoritativeAction({ ...event, actionId: 'stale', nowMs: 900 }).reason, 'EXPIRED_ACTION');
  assert(actor.playAuthoritativeAction({ ...event, actionId: 'late', nowMs: 290 }).accepted);
  actor.updateTravel(0, 0);
  assert.deepEqual(actor.consumePresentationEvents().map(e => [e.type, e.atMs]), [['release', 250]]);
  actor.updateTravel(.02, 0);
  assert.equal(actor.consumePresentationEvents().length, 0);
  assert.throws(() => actor.playAuthoritativeAction({ actionId: 'bad', startAtMs: 100, releaseAtMs: 90 }), /INVALID_ACTION_TIMELINE/);
  actor.dispose();
});

test('B03: jump-cast, descent, landing and seated poses are finite and reversible without moving physics root', async () => {
  const actor = createCharacterPresentation(await model('hermione'), { heroId: 'hermione' });
  actor.root.position.set(4, 1.2, -8);
  actor.playAuthoritativeAction({ actionId: 'air-cast', skillId: 'bolt', nowMs: 0 });
  for (let frame = 0; frame < 25; frame++) actor.updateTravel(.016, .018, false, 4 - frame * .3);
  assert(actor.debugSnapshot().layers.airWeight > .95);
  assert.deepEqual(actor.root.position.toArray(), [4, 1.2, -8]);
  assert(actor.getCastOriginWorld().toArray().every(Number.isFinite));
  actor.updateTravel(.016, .018, true, 0);
  assert(actor.debugSnapshot().layers.landing > .7);
  for (let frame = 0; frame < 50; frame++) actor.updateTravel(.016, 0, true, 0, true);
  assert(actor.debugSnapshot().layers.sitting > .99);
  actor.setMotionLayersEnabled(false);
  actor.updateTravel(.016, 0);
  assert.equal(actor.debugSnapshot().layers.enabled, false);
  actor.resetPresentation();
  assert.equal(actor.debugSnapshot().layers.airWeight, 0);
  assert.equal(actor.debugSnapshot().layers.sitting, 0);
  assert.deepEqual(actor.root.position.toArray(), [4, 1.2, -8]);
  actor.dispose();
});

test('B03: context expression and hit overlays are per-instance, bounded and removable', async () => {
  const source = await model('ron'), a = createCharacterPresentation(source, { heroId: 'ron' }), b = createCharacterPresentation(source, { heroId: 'ron' });
  a.setExpressionContext({ mood: 'happy', intensity: .9, talking: true, lookX: .5 });
  a.playHit({ strength: .8, direction: -1 });
  a.updateTravel(.016, 0); b.updateTravel(.016, 0);
  let am; a.model.traverse(mesh => { if (!am && mesh.morphTargetDictionary?.FaceCorner !== undefined) am = mesh; });
  const bm = b.model.getObjectByName(am.name);
  assert.notDeepEqual(am.morphTargetInfluences, bm.morphTargetInfluences);
  assert(am.morphTargetInfluences.every(v => Number.isFinite(v) && v >= 0 && v <= 1));
  assert.equal(b.debugSnapshot().layers.impact, 0);
  a.setExpressionContext({ mood: 'neutral', intensity: 0 }); a.resetPresentation(); b.resetPresentation();
  a.updateTravel(0, 0); b.updateTravel(0, 0);
  assert.deepEqual(am.morphTargetInfluences, bm.morphTargetInfluences);
  assert.throws(() => a.setExpressionContext({ intensity: NaN }), /INVALID_EXPRESSION/);
  a.dispose(); b.dispose();
});

test('B03: Neville and George use their existing rig behind the same playable interface', async () => {
  for (const heroId of ['neville', 'george']) {
    const actor = await loadPlayableCharacter(heroId);
    assert.equal(actor.capabilities.appearance, 'existing-procedural-character');
    assert.equal(actor.capabilities.facialMorphs, false);
    assert(actor.playAuthoritativeAction({ actionId: 'legacy-cast', skillId: 'bolt', nowMs: 1000 }).accepted);
    for (let i = 0; i < 8; i++) actor.updateTravel(.02, actor.walkSpeed * .02, i < 3, 2);
    assert.deepEqual(actor.consumePresentationEvents().map(e => e.type), ['release']);
    assert(actor.getCastOriginWorld().toArray().every(Number.isFinite));
    assert.equal(actor.updateTravel(.05, 0, true, 0, true).supported, true);
    assert.equal(actor.setExpressionContext({ mood: 'happy' }).applied, false);
    actor.cancelAction('legacy-cast'); actor.updateTravel(.2, 0);
    assert.deepEqual(actor.consumePresentationEvents().map(e => e.type), ['cancel']);
    actor.resetPresentation({ position: [2, 0, 3] });
    assert.deepEqual(actor.root.position.toArray(), [2, 0, 3]);
    actor.dispose(); actor.dispose();
  }
});


test('B03: levitation holds the release pose through the channel, and interruption never releases twice', async () => {
  const actor = createCharacterPresentation(await model('harry'), { heroId: 'harry' });
  actor.playAuthoritativeAction({ actionId: 'steady-levitation', skillId: 'levitate', startAtMs: 1000, releaseAtMs: 1800, holdUntilMs: 3800, endAtMs: 4180, nowMs: 1000 });
  actor.updateTravel(.801, 0); assert.deepEqual(actor.consumePresentationEvents().map(e => e.type), ['release']);
  const hand = actor.model.getObjectByName('HandR').quaternion.clone();
  actor.updateTravel(1.2, 0); assert.equal(actor.debugSnapshot().layers.phase, 'channel');
  assert(actor.model.getObjectByName('HandR').quaternion.angleTo(hand) < 1e-6);
  assert.equal(actor.consumePresentationEvents().length, 0);
  actor.cancelAction('steady-levitation', 'movement'); actor.updateTravel(2, 0);
  assert.deepEqual(actor.consumePresentationEvents().map(e => e.type), ['cancel']); actor.dispose();
});


test('B03: immediate input anticipation has no release cue and authority takes over exactly once', async () => {
  const actor = createCharacterPresentation(await model('harry'), { heroId: 'harry' });
  const before = actor.model.getObjectByName('HandR').quaternion.clone();
  actor.playAuthoritativeAction({ actionId: 'input-preview', skillId: 'bolt', nowMs: 1000, releaseAtMs: 1120, holdUntilMs: 1900, endAtMs: 2020, preview: true });
  actor.updateTravel(.15, 0); assert.equal(actor.consumePresentationEvents().length, 0);
  assert(actor.model.getObjectByName('HandR').quaternion.angleTo(before) > .01);
  actor.playAuthoritativeAction({ actionId: 'server-bolt', skillId: 'bolt', startAtMs: 1070, releaseAtMs: 1190, endAtMs: 1570, nowMs: 1200 });
  actor.updateTravel(.001, 0); assert.deepEqual(actor.consumePresentationEvents().map(e => [e.type, e.actionId]), [['release', 'server-bolt']]);
  assert.equal(actor.cancelAction('input-preview', 'response-settled'), false);
  actor.updateTravel(.5, 0); assert.deepEqual(actor.consumePresentationEvents().map(e => e.type), ['end']); actor.dispose();
});


test('mounted and downed layers preserve authority transforms and source assets, then recover all three workshop actors', async () => {
  for (const heroId of ['harry', 'hermione', 'ron']) {
    const source = await model(heroId), digest = tracksDigest(source);
    const actor = attachCharacterStatePresentation(createCharacterPresentation(source, { heroId }));
    actor.root.position.set(4, 1.2, -3); actor.root.rotation.y = .4;
    actor.setPresentationState({ flying: true });
    for (let frame = 0; frame < 70; frame++) actor.updateTravel(1/60, .035, false, 0);
    assert.equal(actor.debugSnapshot().statePresentation.broomVisible, true);
    assert(actor.debugSnapshot().statePresentation.rideWeight > .99);
    assert(actor.root.getObjectByName('MountedBroom').children.length > 0);
    assert(actor.getCastOriginWorld().toArray().every(Number.isFinite));
    assert.deepEqual(actor.root.position.toArray(), [4, 1.2, -3]); assert.equal(actor.root.rotation.y, .4);
    actor.setPresentationState({ downed: true, floorY: 0 });
    for (let frame = 0; frame < 100; frame++) actor.updateTravel(1/60, 0, true, 0);
    actor.root.updateMatrixWorld(true);
    const headY = actor.model.getObjectByName('Head').getWorldPosition(new Vector3()).y;
    assert(headY < .65 && headY > .05, `${heroId} head lies close to floor: ${headY}`);
    assert.equal(actor.debugSnapshot().statePresentation.broomVisible, false);
    assert.equal(actor.playAuthoritativeAction({ actionId: 'downed-cast', nowMs: 0 }).accepted, false);
    assert.deepEqual(actor.root.position.toArray(), [4, 1.2, -3]);
    actor.setPresentationState({ downed: false });
    for (let frame = 0; frame < 120; frame++) actor.updateTravel(1/60, 0, true, 0);
    actor.root.updateMatrixWorld(true); assert(actor.model.getObjectByName('Head').getWorldPosition(new Vector3()).y > 2.6);
    assert.equal(actor.debugSnapshot().statePresentation.downWeight, 0);
    assert.equal(tracksDigest(source), digest); actor.dispose(); actor.dispose();
  }
});

test('Neville and George mount and collapse with independent reversible state and broom ownership', async () => {
  const a = await loadPlayableCharacter('neville'), b = await loadPlayableCharacter('george');
  a.setPresentationState({ flying: true }); b.setPresentationState({ downed: true });
  for (let frame = 0; frame < 100; frame++) { a.updateTravel(1/60, .03, false, 0); b.updateTravel(1/60, 0, true, 0); }
  assert.equal(a.debugSnapshot().statePresentation.broomVisible, true); assert.equal(b.debugSnapshot().statePresentation.broomVisible, false);
  assert.equal(a.debugSnapshot().statePresentation.downWeight, 0); assert(b.debugSnapshot().statePresentation.downWeight > .99);
  a.setMotionLayersEnabled(false); assert.equal(a.debugSnapshot().statePresentation.broomVisible, false);
  b.resetPresentation({ position: [2, 0, 1], yaw: 0 }); assert.equal(b.debugSnapshot().statePresentation.downWeight, 0);
  a.dispose(); assert(b.getCastOriginWorld().toArray().every(Number.isFinite)); b.dispose();
});
