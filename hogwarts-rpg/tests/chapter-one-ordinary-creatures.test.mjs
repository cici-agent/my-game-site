import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createCreature } from '../chapter-one/presentation/creatures.mjs';
import { creatureCollision } from '../chapter-one/combat/collision-profiles.mjs';

function resources(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => { if (object.geometry) geometries.add(object.geometry); for (const material of [].concat(object.material ?? [])) { materials.add(material); for (const value of Object.values(material)) if (value?.isTexture) textures.add(value); } });
  return { geometries, materials, textures };
}

test('the two introductory IDs select ordinary spider and bat anatomy without changing other creatures', () => {
  const spider = createCreature({ templateId: 'PAPER-L1' }), bat = createCreature({ templateId: 'BOX-L6' }), box = createCreature({ templateId: 'BOX-L8' });
  assert.equal(spider.root.userData.visualKind, 'common-spider'); assert.equal(spider.debugSnapshot().legs, 8); assert.equal(spider.debugSnapshot().jointsPerLeg, 3);
  assert.equal(spider.root.getObjectByName('SpiderArticulatedLegs').count, 24);
  assert.equal(bat.root.userData.visualKind, 'common-bat'); assert.equal(bat.debugSnapshot().wingCount, 2); assert(bat.root.getObjectByName('BatLeftWing')); assert(bat.root.getObjectByName('BatRightWing')); assert(bat.root.getObjectByName('BatEar:-1'));
  assert(box.root.getObjectByName('AnimatedCrate')); assert.deepEqual(spider.collision, creatureCollision('PAPER-L1')); assert.deepEqual(bat.collision, creatureCollision('BOX-L6'));
  const spiderBounds = new THREE.Box3().setFromObject(spider.root), batBody = bat.root.getObjectByName('BatBody');
  assert(spiderBounds.max.y < .72); assert(spiderBounds.min.y > -.03); assert(Math.abs(batBody.position.y - 1.1) < .001);
  spider.dispose(); bat.dispose(); box.dispose();
});

test('spider legs alternate planted feet and lift the front pair for its attack', () => {
  const spider = createCreature({ templateId: 'PAPER-L1' });
  const initial = spider.debugSnapshot().legPoints;
  for (let i = 0; i < 8; i++) spider.update(1 / 60, { speed: 1.1, action: 'walk' });
  const moving = spider.debugSnapshot().legPoints; assert.notDeepEqual(moving, initial);
  const feetY = Array.from({ length: 8 }, (_, leg) => moving[(leg * 4 + 3) * 3 + 1]);
  assert(feetY.filter(y => y > -.26).length >= 3); assert(feetY.filter(y => y <= -.26).length >= 3);
  spider.update(.05, { speed: 0, action: 'attack', windupProgress: 1 });
  const attack = spider.debugSnapshot().legPoints; assert(attack[10] > attack[22] + .2); assert(attack[58] > attack[70] + .2);
  spider.update(.05, { action: 'idle', attackPhase: 'recover' }); assert(spider.root.getObjectByName('SpiderBody').position.z < 0);
  spider.dispose();
});

test('bat membrane wings flap symmetrically around a low hovering body and react with a short dive', () => {
  const bat = createCreature({ templateId: 'BOX-L6' }); const initial = bat.debugSnapshot().wingAngles;
  bat.update(.05, { action: 'walk', speed: 1.1 }); const flying = bat.debugSnapshot();
  assert.notDeepEqual(flying.wingAngles, initial); assert(Math.abs(flying.wingAngles[0] + flying.wingAngles[1]) < 1e-7); assert(flying.bodyHeight > 1.05 && flying.bodyHeight < 1.15);
  bat.update(.05, { action: 'attack', windupProgress: 1 }); const raised = bat.debugSnapshot().bodyHeight;
  bat.update(.1, { action: 'idle', attackPhase: 'recover' }); assert(bat.debugSnapshot().bodyHeight < raised); assert(bat.root.getObjectByName('BatBody').position.z < 0);
  for (let i = 0; i < 30; i++) bat.update(.1, { action: 'downed' });
  assert(bat.debugSnapshot().bodyHeight < .4,'folded wings and feet support the fallen body');
  const fallenBounds=new THREE.Box3().setFromObject(bat.root);assert(fallenBounds.min.y>=0 && fallenBounds.min.y<.04);
  bat.dispose();
});

test('ordinary creature animations retain geometry and materials and clean up independently', () => {
  for (const templateId of ['PAPER-L1', 'BOX-L6']) {
    const first = createCreature({ templateId }), second = createCreature({ templateId }), initial = resources(first.root), other = resources(second.root);
    assert(![...initial.materials].some(material => other.materials.has(material)));
    for (let i = 0; i < 240; i++) first.update(1 / 60, { action: i % 100 < 70 ? 'walk' : 'attack', speed: 1.1, windupProgress: i % 100 / 100 });
    const after = resources(first.root); assert.deepEqual(after.geometries, initial.geometries); assert.deepEqual(after.materials, initial.materials);
    let disposed = 0, otherDisposed = 0; [...initial.geometries, ...initial.materials, ...initial.textures].forEach(resource => resource.addEventListener('dispose', () => disposed++)); [...other.materials].forEach(resource => resource.addEventListener('dispose', () => otherDisposed++));
    first.dispose(); assert(disposed >= initial.geometries.size + initial.materials.size + initial.textures.size); const once = disposed; first.dispose(); assert.equal(disposed, once); assert.equal(otherDisposed, 0);
    second.update(.05, { action: 'walk', speed: .8 }); second.dispose();
  }
});
