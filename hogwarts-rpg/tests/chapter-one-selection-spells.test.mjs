import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSelectionSpells, SELECTION_SPELLS } from '../chapter-one/client/selection-spells.mjs';

const placement = { position: { x: .2, y: 0, z: .9 }, wandTip: { x: -.05, y: 1.14, z: 1.20 } };
const effect = (theatre, name) => theatre.root.getObjectByName(name);
const furnitureNames = ['UnifiedDemonstrationTable', 'CarvedDemonstrationWorkbench', 'SharedPracticeTarget', 'TargetHinge', 'SharedFeatherRest', 'LevitationFeather'];

test('all selections keep the same finished table, target and feather resident at fixed coordinates', () => {
  const theatre = createSelectionSpells();
  assert.deepEqual(Object.keys(SELECTION_SPELLS), ['harry', 'ron', 'hermione']);
  assert.equal(theatre.root.visible, false);
  const objects = furnitureNames.map(name => effect(theatre, name));
  const poses = objects.map(node => node.position.toArray());
  const box = new THREE.Box3().setFromObject(objects[1]);
  assert(box.max.x - box.min.x > 1.5 && box.max.z - box.min.z > .79);
  assert(box.max.y < .66 && box.min.y < .04, 'a physical tabletop and turned legs, not a floor disc');
  for (const [i, id] of Object.keys(SELECTION_SPELLS).entries()) {
    theatre.prepare(id, { position: { x: i * 3 - 2, y: 0, z: i * 2 } });
    assert.deepEqual(theatre.debugSnapshot().visibleProps, ['table', 'target', 'feather']);
    assert.equal(theatre.active, false);
    objects.forEach((node, index) => {
      assert.equal(effect(theatre, furnitureNames[index]), node);
      assert.deepEqual(node.position.toArray(), poses[index]); assert(node.visible);
    });
    assert.equal(effect(theatre, 'SpellEffects').children.some(object => object.visible), false);
  }
  assert.equal(effect(theatre, 'RonTrainingPuppet'), undefined);
  assert.equal(effect(theatre, 'HermioneFeatherStand'), undefined);
  assert.throws(() => theatre.begin('george', placement), /HERO_NOT_ALLOWED/);
  theatre.dispose();
});

test('Harry and Ron send the same travelling basic spell from their wand to the same real target', () => {
  const theatre = createSelectionSpells(), target = effect(theatre, 'SharedPracticeTarget');
  for (const heroId of ['harry', 'ron']) {
    theatre.begin(heroId, placement); theatre.update(0);
    assert.equal(theatre.debugSnapshot().skillId, 'bolt');
    const bolt = effect(theatre, 'BoltCore'), hit = theatre.getAimPoint(heroId);
    assert.deepEqual(bolt.position.toArray(), [-.05, 1.14, 1.20]);
    const midpoint = new THREE.Vector3(-.05, 1.14, 1.2).lerp(hit, .5); midpoint.y += .08;
    theatre.update(.17); assert(bolt.position.distanceTo(midpoint) < 1e-10);
    assert.equal(theatre.debugSnapshot().impactReached, false); assert.equal(theatre.debugSnapshot().targetTilt, 0);
    theatre.update(.17);
    assert.equal(bolt.visible, false); assert.equal(theatre.debugSnapshot().impactReached, true);
    assert(effect(theatre, 'ImpactRing').position.distanceTo(hit) < 1e-10);
    theatre.update(.08); assert(Math.abs(theatre.debugSnapshot().targetTilt) > .01);
    assert.equal(effect(theatre, 'SelectionSpellMotes').visible, true);
    theatre.update(3); assert.equal(theatre.active, false); assert.equal(theatre.debugSnapshot().targetTilt, 0);
    assert.equal(effect(theatre, 'SharedPracticeTarget'), target);
  }
  assert.equal(effect(theatre, 'RonGuardArc'), undefined);
  theatre.dispose();
});

test('projectiles hit the actual student-facing surface and feather rests above its cushion', () => {
  const theatre = createSelectionSpells(); theatre.prepare('harry');
  const target = effect(theatre, 'TargetHinge'), feather = effect(theatre, 'LevitationFeather');
  const hit = theatre.getAimPoint('harry'), from = new THREE.Vector3(-1.38, 1.1, 1.3);
  const ray = new THREE.Raycaster(from, hit.clone().sub(from).normalize());
  theatre.root.updateMatrixWorld(true);
  const intersections = ray.intersectObject(target, true);
  assert(intersections.length); assert(intersections[0].point.distanceTo(hit) < .025);
  assert.deepEqual(theatre.getAimPoint('ron').toArray(), hit.toArray());
  const featherBox = new THREE.Box3().setFromObject(feather);
  assert(featherBox.min.y > .686, 'feather does not penetrate the physical leather cushion');
  assert(featherBox.max.z < 2.52 && featherBox.min.z > 1.72, 'the resting quill fits the same tabletop');
  const targetBox = new THREE.Box3().setFromObject(target);
  assert(targetBox.max.y < 1.4, 'the target stays below the students faces');
  theatre.dispose();
});

test('Hermione lifts the detailed permanent feather and settles it back on the shared workbench', () => {
  const theatre = createSelectionSpells(); theatre.begin('hermione', placement);
  const feather = effect(theatre, 'LevitationFeather'), initialY = feather.position.y;
  let vertices = 0; feather.traverse(node => { if (node.isMesh) vertices += node.geometry.attributes.position.count; });
  assert(vertices > 1000, 'the original vane, quill and dense barbs remain modelled');
  theatre.update(1.5); assert(feather.position.y > initialY + .5);
  const peak = feather.position.y;
  theatre.update(2.6); assert(feather.position.y < peak && feather.position.y > initialY);
  theatre.update(.7); assert.equal(theatre.active, false); assert.equal(feather.position.y, initialY);
  assert.equal(effect(theatre, 'WandSpellTrail').visible, false);
  assert(effect(theatre, 'SharedPracticeTarget').visible);
  theatre.dispose();
});

test('switching mid-levitation retains props and smoothly returns the feather while magic fades', () => {
  const theatre = createSelectionSpells(); theatre.begin('hermione', placement); theatre.update(1.5);
  const feather = effect(theatre, 'LevitationFeather'), original = feather.position.clone(), rotation = feather.quaternion.clone();
  const material = effect(theatre, 'SelectionSpellMotes').material, opacity = material.opacity;
  theatre.cancel(); theatre.prepare('ron', { position: { x: 0, y: 0, z: .9 } });
  assert(feather.position.equals(original)); assert(feather.quaternion.equals(rotation));
  assert.equal(theatre.active, false); assert(theatre.debugSnapshot().settling);
  theatre.update(.1);
  assert(feather.position.y < original.y && feather.position.y > .11);
  assert(material.opacity < opacity && material.opacity > 0);
  const intermediate = feather.position.clone(); theatre.prepare('harry');
  assert(feather.position.equals(intermediate), 'repeated selections do not restart or snap the recovery');
  theatre.update(.5); assert.equal(feather.position.y, .11); assert.equal(theatre.debugSnapshot().settling, false);
  assert.equal(effect(theatre, 'SpellEffects').children.some(object => object.visible), false);
  assert.deepEqual(theatre.debugSnapshot().visibleProps, ['table', 'target', 'feather']);
  theatre.begin('hermione', placement); theatre.update(1); theatre.cancel(); theatre.update(.1);
  const beforeReplay = feather.position.clone(); theatre.begin('hermione', placement); theatre.update(0);
  assert(feather.position.distanceTo(beforeReplay) < 1e-12, 'replaying during return keeps the current feather pose');
  theatre.dispose();
});

test('visual sound cues emit once at release and actual impact, and cancelled casts cannot emit stale hits', () => {
  const cues = [], theatre = createSelectionSpells({ onCue: cue => cues.push(cue) });
  theatre.prepare('harry'); assert.equal(cues.length, 0);
  theatre.begin('harry', placement); theatre.update(.17); theatre.cancel(); theatre.prepare('ron'); theatre.update(2);
  assert.deepEqual(cues, [{ kind: 'cast', skillId: 'bolt', heroId: 'harry', selection: true }]);
  theatre.begin('ron', placement); theatre.update(.33); assert.equal(cues.length, 2);
  theatre.update(.02); theatre.update(.7); theatre.update(5);
  assert.deepEqual(cues.slice(1), [
    { kind: 'cast', skillId: 'bolt', heroId: 'ron', selection: true },
    { kind: 'impact', skillId: 'bolt', heroId: 'ron', selection: true },
  ]);
  theatre.begin('hermione', placement); theatre.update(6);
  assert.deepEqual(cues.at(-1), { kind: 'cast', skillId: 'levitate', heroId: 'hermione', selection: true });
  assert.equal(cues.length, 4); theatre.dispose();
});

test('rapid interruptions reuse all geometry and materials, then dispose instance-owned resources exactly once', () => {
  const theatre = createSelectionSpells(), other = createSelectionSpells(), initial = theatre.debugSnapshot();
  const geometries = new Set(), materials = new Set(), disposed = new Map();
  theatre.root.traverse(node => { if (node.geometry) geometries.add(node.geometry); if (node.material) materials.add(node.material); });
  for (const resource of [...geometries, ...materials]) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1));
  for (let i = 0; i < 24; i++) {
    theatre.begin(['harry', 'ron', 'hermione'][i % 3], placement); theatre.update(.65); theatre.cancel(); theatre.update(.6);
    assert.equal(theatre.active, false); assert.equal(theatre.debugSnapshot().featherHeight, .11);
  }
  const final = theatre.debugSnapshot();
  assert.equal(final.geometries, initial.geometries); assert.equal(final.materials, initial.materials);
  theatre.root.updateMatrixWorld(true); theatre.root.traverse(node => {
    assert(node.matrixWorld.elements.every(Number.isFinite));
    if (node.geometry) assert(geometries.has(node.geometry)); if (node.material) assert(materials.has(node.material));
  });
  theatre.dispose(); theatre.dispose();
  for (const resource of [...geometries, ...materials]) assert.equal(disposed.get(resource), 1);
  assert.equal(theatre.root.children.length, 0);
  other.begin('hermione', placement); other.update(1); assert(other.debugSnapshot().featherHeight > .55); other.dispose();
});

test('timelines and interrupted return are cadence independent, invalid samples remain finite, reset is immediate', () => {
  const a = createSelectionSpells(), b = createSelectionSpells();
  a.begin('hermione', placement); b.begin('hermione', placement);
  for (let i = 0; i < 60; i++) a.update(1 / 60);
  for (let i = 0; i < 20; i++) b.update(1 / 20);
  assert(Math.abs(a.debugSnapshot().featherHeight - b.debugSnapshot().featherHeight) < 1e-10);
  a.cancel(); b.cancel();
  for (let i = 0; i < 12; i++) a.update(1 / 60);
  for (let i = 0; i < 4; i++) b.update(1 / 20);
  assert(Math.abs(a.debugSnapshot().featherHeight - b.debugSnapshot().featherHeight) < 1e-10);
  a.update(NaN); a.update(-2); assert(Number.isFinite(a.debugSnapshot().featherHeight));
  a.reset(); assert.equal(a.root.visible, false); assert.equal(a.debugSnapshot().hero, null); assert.equal(a.debugSnapshot().settling, false);
  a.dispose(); b.dispose();
});
