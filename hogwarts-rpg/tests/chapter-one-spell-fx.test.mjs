import test from 'node:test';
import assert from 'node:assert/strict';
import { Box3, Group, Vector3 } from 'three';
import { createBoltVisual, createImpactVisual } from '../chapter-one/client/spell-fx.mjs';

const at = new Vector3(2, 1.2, -4), direction = new Vector3(1, .2, -1).normalize();
function resources(root) {
  const found = new Set(); root.traverse(node => { if (node.geometry) found.add(node.geometry); if (node.material) found.add(node.material); }); return found;
}
function assertFinite(root) { root.updateMatrixWorld(true); root.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite), `${node.name} has a non-finite transform`)); }

test('bolt points along its requested direction and the tail remains behind the core', () => {
  const bolt = createBoltVisual({ origin: at, direction });
  try {
    assert(new Vector3(0, 0, -1).applyQuaternion(bolt.root.quaternion).distanceTo(direction) < 1e-9);
    const local = createBoltVisual({ origin: new Vector3(), direction: new Vector3(0, 0, -1) });
    try {
      const extent = new Box3().setFromObject(local.root);
      assert(extent.max.z > Math.abs(extent.min.z) * 2, 'the visible trail should extend behind the flight direction');
    } finally { local.dispose(); }
    const initial = bolt.root.position.clone(), rotation = bolt.root.quaternion.clone();
    for (let frame = 0; frame < 120; frame++) { bolt.update(1 / 60); assertFinite(bolt.root); }
    assert(bolt.root.position.equals(initial)); assert(bolt.root.quaternion.equals(rotation));
    assert(at.equals(new Vector3(2, 1.2, -4)), 'caller origin is read-only');
  } finally { bolt.dispose(); }
});

test('bolt instances own isolated visual resources and do not overwrite caller movement', () => {
  const first = createBoltVisual({ origin: at, direction }), second = createBoltVisual({ origin: at, direction });
  try {
    const a = resources(first.root), b = resources(second.root);
    for (const resource of a) assert(!b.has(resource));
    const secondBefore = [...b].filter(value => value.isMaterial).map(value => value.opacity);
    first.root.position.set(-3, 5, 2); first.root.rotation.set(.2, .4, .8);
    const rotation = first.root.quaternion.clone(); first.update(.137);
    assert.deepEqual(first.root.position.toArray(), [-3, 5, 2]); assert(first.root.quaternion.equals(rotation));
    assert.deepEqual([...b].filter(value => value.isMaterial).map(value => value.opacity), secondBefore);
    first.dispose(); second.update(.1); assertFinite(second.root); assert(second.root.children.length > 0);
  } finally { first.dispose(); second.dispose(); }
});

test('wall and target impacts remain finite, have distinct materials, and finish without moving the impact center', () => {
  const wall = createImpactVisual({ kind: 'wall', position: at }), target = createImpactVisual({ kind: 'target', position: at });
  try {
    const colors = effect => [...resources(effect.root)].filter(value => value.isMaterial).map(value => value.color.getHex());
    assert.notDeepEqual(colors(wall), colors(target));
    for (const effect of [wall, target]) {
      assert(effect.duration > 0 && effect.duration < 1); assert.equal(effect.update(0), true);
      for (let frame = 0; frame < 90; frame++) { effect.update(1 / 60); assertFinite(effect.root); }
      assert.equal(effect.update(0), false); assert(effect.root.position.equals(at));
      for (const resource of resources(effect.root)) if (resource.isMaterial) assert.equal(resource.opacity, 0);
    }
  } finally { wall.dispose(); target.dispose(); }
});

test('every visual resource is released once and detached even after repeated disposal', () => {
  for (const effect of [createBoltVisual({ origin: at, direction }), createImpactVisual({ kind: 'wall', position: at }), createImpactVisual({ kind: 'target', position: at })]) {
    const parent = new Group(); parent.add(effect.root); const counts = new Map();
    for (const resource of resources(effect.root)) { counts.set(resource, 0); resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1)); }
    effect.dispose(); effect.dispose(); assert.equal(effect.root.parent, null); assert.equal(parent.children.length, 0);
    for (const count of counts.values()) assert.equal(count, 1);
    assert.equal(effect.update(.1), false);
  }
});

test('invalid inputs cannot create non-finite spell geometry', () => {
  assert.throws(() => createBoltVisual({ origin: at, direction: new Vector3() }));
  assert.throws(() => createBoltVisual({ origin: [NaN, 1, 0], direction }));
  assert.throws(() => createBoltVisual({ origin: {}, direction }));
  assert.throws(() => createBoltVisual({ origin: at, direction: [1e308, 0, 0] }));
  assert.throws(() => createImpactVisual({ kind: 'unknown', position: at }));
  const effect = createBoltVisual({ origin: at, direction });
  try { for (const dt of [-1, NaN, Infinity]) assert.throws(() => effect.update(dt)); } finally { effect.dispose(); }
});
