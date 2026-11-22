import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolveCharacterAsset } from '../chapter-one/presentation/registry.mjs';
import { createCharacterPresentation } from '../chapter-one/presentation/character-adapter.mjs';
import { attachCharacterStatePresentation } from '../chapter-one/presentation/state-layer.mjs';

const sources = new Map();
async function source(heroId) {
  if (!sources.has(heroId)) sources.set(heroId, (async () => {
    const descriptor = resolveCharacterAsset(heroId), bytes = await readFile(new URL(descriptor.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), descriptor.sha256);
    const loader = new GLTFLoader(); loader.register(() => ({ name: 'HEADLESS_JUMP_TEXTURES', loadTexture: () => Promise.resolve(null) }));
    return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  })());
  return sources.get(heroId);
}
function digest(model) {
  const hash = createHash('sha256');
  for (const clip of model.animations) for (const track of clip.tracks) { hash.update(track.name); hash.update(Buffer.from(track.times.buffer)); hash.update(Buffer.from(track.values.buffer)); }
  return hash.digest('hex');
}
const bone = (actor, name) => actor.model.getObjectByName(name);
const position = (actor, name) => bone(actor, name).getWorldPosition(new Vector3());
function measure(actor) {
  actor.root.updateMatrixWorld(true);
  const hip = position(actor, 'ThighL'), knee = position(actor, 'ShinL'), ankle = position(actor, 'FootL');
  return { head: position(actor, 'Head').y, hip: position(actor, 'Hips').y, footBelowHip: hip.y - ankle.y, kneeAngle: hip.clone().sub(knee).angleTo(ankle.clone().sub(knee)) };
}
function sample(actor, reference, dt, grounded, velocity) { actor.updateTravel(dt, 0, grounded, velocity); reference?.updateTravel(dt, 0, true, 0); }

for (const heroId of ['harry', 'hermione', 'ron']) {
  test(`${heroId}: real workshop rig crouches, tucks at apex, extends and cushions without rewriting its source`, async () => {
    const gltf = await source(heroId), before = digest(gltf);
    const actor = createCharacterPresentation(gltf, { heroId }), reference = createCharacterPresentation(gltf, { heroId });
    try {
      actor.root.position.set(4, 1.2, -8); reference.root.position.copy(actor.root.position);
      actor.root.rotation.y = .71; reference.root.rotation.y = .71;
      sample(actor, reference, 0, true, 0); const idle = measure(actor);
      assert.equal(actor.prepareJump({ durationMs: 110 }), true);
      for (let frame = 0; frame < 7; frame++) sample(actor, reference, .11 / 7, true, 0);
      const prep = measure(actor), standing = measure(reference);
      assert(standing.head - prep.head > .08, 'visible anticipation lowers the torso before physics takeoff');
      assert(prep.kneeAngle < idle.kneeAngle - .5, 'anticipation bends real thigh/shin joints');
      const contacts = Array.from({ length: 4 }, () => new Vector3()); actor.readSoleContacts(contacts);
      assert(contacts.every(point => point.y > 1.175 && point.y < 1.24), 'anticipation keeps the four sole probes close to the support floor');
      for (let frame = 0; frame < 23; frame++) sample(actor, reference, 1 / 60, false, 6.2 - (frame + 1) * 16.5 / 60);
      const apex = measure(actor);
      assert.equal(actor.debugSnapshot().layers.jump.phase, 'apex');
      assert(apex.kneeAngle < 2.0 && apex.kneeAngle > .7, 'the knee visibly folds without reversing its hinge');
      assert(idle.footBelowHip - apex.footBelowHip > .18, 'feet tuck towards the hips instead of translating a straight body');
      assert.equal(actor.prepareJump(), false, 'an airborne actor cannot restart ground anticipation');
      for (let frame = 23; frame < 44; frame++) sample(actor, reference, 1 / 60, false, 6.2 - (frame + 1) * 16.5 / 60);
      const descending = measure(actor);
      assert.equal(actor.debugSnapshot().layers.jump.phase, 'falling');
      assert(descending.kneeAngle > apex.kneeAngle + .5, 'legs extend again before floor contact');
      for (let frame = 0; frame < 5; frame++) sample(actor, reference, 1 / 60, true, 0);
      assert.equal(actor.debugSnapshot().layers.jump.phase, 'landing');
      assert(measure(reference).head - measure(actor).head > .07, 'landing absorbs the impact through the hips and knees');
      for (let frame = 0; frame < 90; frame++) sample(actor, reference, 1 / 60, true, 0);
      assert.equal(actor.debugSnapshot().layers.jump.phase, 'grounded');
      for (const name of ['Hips', 'ThighL', 'ShinL', 'FootL', 'ThighR', 'ShinR', 'Chest']) {
        assert(bone(actor, name).quaternion.angleTo(bone(reference, name).quaternion) < .0005, `${name} returns to the untouched idle animation`);
        assert(bone(actor, name).position.distanceTo(bone(reference, name).position) < .0005);
      }
      assert.deepEqual(actor.root.position.toArray(), [4, 1.2, -8]); assert.equal(actor.root.rotation.y, .71);
      assert.equal(digest(gltf), before, 'published animation buffers remain byte-identical');
    } finally { actor.dispose(); reference.dispose(); }
  });

  test(`${heroId}: airborne spell keeps the same wand-arm release while legs remain tucked`, async () => {
    const gltf = await source(heroId), actor = createCharacterPresentation(gltf, { heroId }), grounded = createCharacterPresentation(gltf, { heroId });
    try {
      actor.setExpressionContext({ mood: 'curious', intensity: .8 }); grounded.setExpressionContext({ mood: 'curious', intensity: .8 });
      for (let frame = 0; frame < 18; frame++) sample(actor, grounded, 1 / 60, false, 2);
      const action = { actionId: 'airborne-bolt', skillId: 'bolt', startAtMs: 1000, releaseAtMs: 1120, endAtMs: 1520, nowMs: 1000 };
      assert(actor.playAuthoritativeAction(action).accepted); assert(grounded.playAuthoritativeAction(action).accepted);
      actor.updateTravel(.12, 0, false, 0); grounded.updateTravel(.12, 0, true, 0);
      assert.deepEqual(actor.consumePresentationEvents().map(event => [event.type, event.atMs]), [['release', 1120]]);
      assert(bone(actor, 'ArmR').quaternion.angleTo(bone(grounded, 'ArmR').quaternion) < .0005, 'the source wand-arm release wins over arm balance');
      assert(bone(actor, 'ShinL').quaternion.angleTo(bone(grounded, 'ShinL').quaternion) > .75, 'upper-body casting does not replace the tucked legs');
      assert(actor.getCastOriginWorld().toArray().every(Number.isFinite));
      const faceA = []; actor.model.traverse(node => { if (node.morphTargetInfluences) faceA.push([node.name, [...node.morphTargetInfluences]]); });
      for (const [name, values] of faceA) assert.deepEqual(values, grounded.model.getObjectByName(name).morphTargetInfluences, 'face expression and source morphs survive the jump');
      actor.updateTravel(.5, 0, false, -3);
      assert.deepEqual(actor.consumePresentationEvents().map(event => event.type), ['end']);
    } finally { actor.dispose(); grounded.dispose(); }
  });
}

test('cancelled anticipation, disabled layers, mounted travel and downing leave no stuck jump pose', async () => {
  const gltf = await source('harry'), actor = attachCharacterStatePresentation(createCharacterPresentation(gltf, { heroId: 'harry' }));
  try {
    assert(actor.prepareJump()); actor.updateTravel(.06, 0, true, 0); assert(actor.cancelJumpPreparation());
    for (let frame = 0; frame < 90; frame++) actor.updateTravel(1 / 60, 0, true, 0);
    assert.equal(actor.debugSnapshot().layers.jump.phase, 'grounded');
    assert(actor.debugSnapshot().layers.jump.compression < .0005);
    actor.updateTravel(.2, 0, false, 2); actor.setPresentationState({ flying: true }); actor.updateTravel(.02, 0, false, 0);
    assert.equal(actor.debugSnapshot().layers.jump.phase, 'grounded'); assert.equal(actor.prepareJump(), false);
    actor.setPresentationState({ downed: true }); actor.updateTravel(.02, 0, false, -2); assert.equal(actor.prepareJump(), false);
    actor.resetPresentation(); actor.setMotionLayersEnabled(false); assert.equal(actor.prepareJump(), false);
    actor.updateTravel(.2, 0, false, 3); assert.equal(actor.debugSnapshot().layers.jump.airWeight, 0);
    assert.throws(() => { actor.setMotionLayersEnabled(true); actor.prepareJump({ durationMs: NaN }); }, /INVALID_JUMP/);
  } finally { actor.dispose(); }
});
