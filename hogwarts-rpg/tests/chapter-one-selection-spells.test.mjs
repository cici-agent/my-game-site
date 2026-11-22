import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSelectionSpells, SELECTION_SPELLS } from '../chapter-one/client/selection-spells.mjs';

const placement = { position: { x: .2, y: 0, z: .9 }, wandTip: { x: -.05, y: 1.14, z: 1.20 } };
const effect = (theatre, name) => theatre.root.getObjectByName(name);

test('each trio member prepares a distinct physical prop without starting a spell', () => {
  const theatre = createSelectionSpells();
  assert.deepEqual(Object.keys(SELECTION_SPELLS), ['harry', 'ron', 'hermione']);
  assert.equal(theatre.root.visible, false);
  for (const id of Object.keys(SELECTION_SPELLS)) {
    theatre.prepare(id, placement);
    assert.deepEqual(theatre.debugSnapshot().visibleProps, [id]);
    assert.equal(theatre.active, false);
    assert(effect(theatre, id === 'harry' ? 'TargetHinge' : id === 'ron' ? 'PuppetTurntable' : 'LevitationFeather'));
    assert.equal(effect(theatre, 'SpellEffects').children.some(object => object.visible), false);
  }
  assert.throws(() => theatre.begin('george', placement), /HERO_NOT_ALLOWED/);
  theatre.dispose();
});

test('Harry sends a real travelling projectile from the provided tip before the target reacts', () => {
  const theatre = createSelectionSpells(); theatre.begin('harry', placement);
  theatre.update(0);
  const bolt = effect(theatre, 'BoltCore');
  assert.deepEqual(bolt.position.toArray(), [-.05, 1.14, 1.20]);
  theatre.update(.17);
  assert(bolt.position.distanceTo(new THREE.Vector3(...Object.values(placement.wandTip))) > .1);
  assert.equal(theatre.debugSnapshot().impactReached, false);
  assert.equal(theatre.debugSnapshot().targetTilt, 0);
  theatre.update(.25);
  assert.equal(bolt.visible, false); assert.equal(theatre.debugSnapshot().impactReached, true);
  assert(Math.abs(theatre.debugSnapshot().targetTilt) > .01);
  assert.equal(effect(theatre, 'SelectionSpellMotes').visible, true);
  theatre.update(3);
  assert.equal(theatre.active, false); assert.equal(theatre.debugSnapshot().targetTilt, 0);
  theatre.dispose();
});

test('Ron turns the actual puppet toward himself and displays a bounded guard, not a decoy', () => {
  const theatre = createSelectionSpells(); theatre.begin('ron', placement);
  const originalYaw = theatre.debugSnapshot().puppetYaw;
  theatre.update(1);
  assert(Math.abs(theatre.debugSnapshot().puppetYaw - originalYaw) > .5);
  assert.equal(effect(theatre, 'RonGuardArc').visible, true);
  assert.equal(effect(theatre, 'BoltCore').visible, false);
  assert.equal(theatre.debugSnapshot().skillId, 'R1');
  theatre.update(3);
  assert.equal(theatre.active, false); assert.equal(effect(theatre, 'RonGuardArc').visible, false);
  theatre.dispose();
});

test('Harry prop scaling keeps the projectile and impact on the actual smaller target', () => {
  const theatre = createSelectionSpells(); theatre.begin('harry', placement);
  const prop = effect(theatre, 'HarryPracticeTarget');
  assert.deepEqual(prop.scale.toArray(), [.84, .84, .84]);
  assert.deepEqual(effect(theatre, 'RonTrainingPuppet').scale.toArray(), [1, 1, 1]);
  assert.deepEqual(effect(theatre, 'HermioneFeatherStand').scale.toArray(), [1, 1, 1]);
  const target = effect(theatre, 'TargetHinge').localToWorld(new THREE.Vector3(0, 0, .04));
  assert(Math.abs(target.y - (.94 * .84)) < 1e-10);
  theatre.update(.17);
  const midpoint = new THREE.Vector3(placement.wandTip.x, placement.wandTip.y, placement.wandTip.z).lerp(target, .5);
  midpoint.y += .08;
  assert(effect(theatre, 'BoltCore').position.distanceTo(midpoint) < 1e-10);
  theatre.update(.17);
  assert(effect(theatre, 'ImpactRing').position.distanceTo(target) < 1e-10);
  theatre.dispose();
});

test('Hermione levitates a shaped feather and returns it gently to its original support', () => {
  const theatre = createSelectionSpells(); theatre.begin('hermione', placement);
  const feather = effect(theatre, 'LevitationFeather'), initialY = feather.position.y;
  let vertices = 0; feather.traverse(node => { if (node.isMesh) vertices += node.geometry.attributes.position.count; });
  assert(vertices > 1000, 'feather has a vane, quill, and densely modelled barbs');
  theatre.update(1.5); assert(feather.position.y > initialY + .5);
  const peak = feather.position.y;
  theatre.update(2.6); assert(feather.position.y < peak && feather.position.y > initialY);
  theatre.update(.7); assert.equal(theatre.active, false); assert.equal(feather.position.y, initialY);
  assert.equal(effect(theatre, 'WandSpellTrail').visible, false);
  theatre.dispose();
});

test('rapid interruptions reuse geometry, reset previous effects and dispose instance-owned resources once', () => {
  const theatre = createSelectionSpells(), other = createSelectionSpells(), initial = theatre.debugSnapshot();
  const geometries = new Set(), materials = new Set(), disposed = new Map();
  theatre.root.traverse(node => { if (node.geometry) geometries.add(node.geometry); if (node.material) materials.add(node.material); });
  for (const resource of [...geometries, ...materials]) resource.addEventListener('dispose', () => disposed.set(resource, (disposed.get(resource) ?? 0) + 1));
  for (let i = 0; i < 24; i++) {
    const id = ['harry', 'ron', 'hermione'][i % 3];
    theatre.begin(id, placement); theatre.update(.65); theatre.cancel();
    assert.equal(theatre.active, false);
    assert.equal(effect(theatre, 'SpellEffects').children.some(object => object.visible), false);
    assert.equal(theatre.debugSnapshot().featherHeight, .59);
  }
  const final = theatre.debugSnapshot();
  assert.equal(final.geometries, initial.geometries); assert.equal(final.materials, initial.materials);
  theatre.root.updateMatrixWorld(true); theatre.root.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite)));
  theatre.dispose(); theatre.dispose();
  for (const resource of [...geometries, ...materials]) assert.equal(disposed.get(resource), 1);
  assert.equal(theatre.root.children.length, 0);
  other.begin('hermione', placement); other.update(1); assert(other.debugSnapshot().featherHeight > .55); other.dispose();
});

test('effect timelines have the same pose under different frame cadences and ignore invalid time samples', () => {
  const a = createSelectionSpells(), b = createSelectionSpells();
  a.begin('hermione', placement); b.begin('hermione', placement);
  for (let i = 0; i < 60; i++) a.update(1 / 60);
  for (let i = 0; i < 20; i++) b.update(1 / 20);
  assert(Math.abs(a.debugSnapshot().featherHeight - b.debugSnapshot().featherHeight) < 1e-10);
  a.update(NaN); a.update(-2); assert(Number.isFinite(a.debugSnapshot().featherHeight));
  a.reset(); assert.equal(a.root.visible, false); assert.equal(a.debugSnapshot().hero, null);
  a.dispose(); b.dispose();
});
