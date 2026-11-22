import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createNpc } from '../chapter-one/presentation/npcs.mjs';
import { createCreature } from '../chapter-one/presentation/creatures.mjs';

test('supporting actor poses remain finite, seated layer returns to standing, disposal is instance-local', () => {
  const hagrid = createNpc({ id: 'hagrid' }), other = createNpc({ id: 'hagrid' });
  const body = hagrid.root.getObjectByName('Body');
  for (let i = 0; i < 60; i++) hagrid.update(1 / 30, { action: 'sit' });
  assert.ok(body.position.y < -.20 && body.position.y > -.26);
  assert.ok(hagrid.root.getObjectByName('LegL').rotation.x > 1.1, 'seated knees bend toward the -Z facing direction');
  for (let i = 0; i < 120; i++) hagrid.update(1 / 30, { action: 'walk', speed: 1.2 });
  assert.ok(body.position.y > -.1);
  hagrid.root.updateMatrixWorld(true);
  hagrid.root.traverse(n => assert.ok(n.matrixWorld.elements.every(Number.isFinite)));
  hagrid.dispose(); other.update(.1, { speed: 1 });
  assert.ok(other.root.children.length > 0); other.dispose();
});

test('first-book creatures have distinct anatomy and can animate and release independent resources', () => {
  const names = new Set();
  for (const templateId of ['PAPER-L1', 'BOX-L6', 'BOOKS-L10', 'VINE-L14', 'ROOT-L16', 'B1-E07', 'B1-E15', 'key', 'B1-E10', 'B1-E08', 'B1-E04']) {
    const creature = createCreature({ templateId }); names.add(creature.root.name);
    for (const action of ['idle', 'walk', 'attack', 'hurt', 'downed']) for (let i = 0; i < 20; i++) creature.update(.05, { action, speed: action === 'walk' ? 1 : 0, windupProgress: i / 20 });
    creature.root.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(creature.root);
    assert.ok(!bounds.isEmpty() && [bounds.min.x, bounds.min.y, bounds.min.z, bounds.max.x, bounds.max.y, bounds.max.z].every(Number.isFinite));
    creature.dispose(); assert.equal(creature.root.children.length, 0);
  }
  assert.equal(names.size, 11);
  const centaur = createNpc({ id: 'firenze' });
  let legs = 0; centaur.root.traverse(n => { if (n.name.startsWith('HorseLeg:')) legs++; });
  assert.equal(legs, 4); centaur.dispose();
});
