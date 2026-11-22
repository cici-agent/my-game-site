import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSceneEnvironment, SCENE_MAPS } from '../chapter-one/client/scene-environment.mjs';
import { DEFAULT_ARENA } from '../chapter-one/combat/geometry.mjs';

const context = new Proxy({ measureText: text => ({ width: String(text).length * 12 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, { get: (object, key) => key in object ? object[key] : () => {} });
globalThis.document = { createElement: () => ({ width: 512, height: 512, getContext: () => context }) };
function environment(id, options = {}) { const scene = new THREE.Scene(), area = new THREE.Group(); scene.add(area); return { scene, area, env: createSceneEnvironment(id, area, options) }; }
function staticMetrics(root) {
  let draws = 0, triangles = 0;
  const walk = object => {
    if (!object.visible || object.userData.dynamic) return;
    if (object.isMesh) {
      draws++; triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object.isInstancedMesh ? object.count : 1);
      const positions = object.geometry.attributes.position.array;
      assert(positions.every(Number.isFinite), 'no non-finite vertices reach the renderer');
    }
    for (const child of object.children) walk(child);
  };
  walk(root); return { draws, triangles };
}

test('all sixteen environments stay within a bounded static rendering budget after finishing', () => {
  for (const id of Object.keys(SCENE_MAPS)) {
    const { area, env } = environment(id);
    const { draws, triangles } = staticMetrics(area);
    assert(draws <= 200, `${id}: ${draws} static draws exceeds the scene budget`);
    assert(triangles <= 450000, `${id}: ${triangles} static triangles exceeds the scene budget`);
    if (['SC05', 'SC06', 'SC07', 'SC10', 'SC13', 'SC15'].includes(id)) {
      assert(draws <= 90, `${id}: finished room must not require hundreds of separate draws`);
      assert(triangles <= 130000, `${id}: room detailing must remain cheaper than the large arrival environments`);
    }
    env.dispose();
  }
});

test('refined interiors and terrain release their owned meshes, textures and materials exactly once', () => {
  for (const id of ['SC05', 'SC06', 'SC07', 'SC09', 'SC10', 'SC11', 'SC12', 'SC13', 'SC14', 'SC15']) {
    const { area, env } = environment(id), resources = new Map();
    const own = resource => { if (resource && !resources.has(resource)) { resources.set(resource, 0); resource.addEventListener('dispose', () => resources.set(resource, resources.get(resource) + 1)); } };
    area.traverse(object => {
      own(object.geometry);
      for (const material of [].concat(object.material ?? [])) { own(material); for (const value of Object.values(material)) if (value?.isTexture) own(value); }
    });
    env.dispose(); env.dispose();
    for (const [resource, count] of resources) assert.equal(count, 1, `${id} ${resource.type ?? resource.constructor.name} is disposed exactly once`);
    assert.equal(area.children.length, 0, `${id}: no detached visible area remains`);
  }
});

test('the courtyard is open overhead and rustic cabin floor cannot inherit the glossy photo material', () => {
  const courtyard = environment('SC06');
  courtyard.area.updateMatrixWorld(true);
  const sky = new THREE.Raycaster(new THREE.Vector3(0, 2, 1), new THREE.Vector3(0, 1, 0), 0, 10);
  const visible = object => { for (let node = object; node; node = node.parent) if (!node.visible) return false; return true; };
  assert.equal(sky.intersectObject(courtyard.area, true).filter(hit => visible(hit.object)).length, 0, 'central courtyard opens to the sky');
  courtyard.env.dispose();
  const cabin = environment('SC10');
  const floor = []; cabin.area.traverse(object => {
    if (object.isMesh && object.geometry.type === 'PlaneGeometry' && object.material.map?.repeat.x === 5 && object.material.map?.repeat.y === 8) floor.push(object);
  });
  assert.equal(floor.length, 1, 'one reused floor receives the cabin material');
  assert(floor[0].material.roughness >= .93); assert.equal(floor[0].material.roughnessMap, null);
  assert.equal(floor[0].userData.environmentSurface, undefined); assert.equal(floor[0].material.userData.environmentSurface, undefined);
  assert.equal(floor[0].material.map.colorSpace, THREE.SRGBColorSpace); assert.equal(floor[0].material.bumpMap.colorSpace, THREE.NoColorSpace);
  cabin.env.dispose();
});

test('grass and forest floor use separate repeated colour and linear height textures without extra geometry', () => {
  for (const id of ['SC09', 'SC12']) {
    const { area, env } = environment(id), grounds = [];
    area.traverse(object => { if (object.isMesh && object.material.map?.repeat.x === 12 && object.material.map?.repeat.y === 12) grounds.push(object); });
    assert.equal(grounds.length, 1, id);
    const material = grounds[0].material;
    assert.notEqual(material.map, material.bumpMap); assert.equal(material.map.colorSpace, THREE.SRGBColorSpace); assert.equal(material.bumpMap.colorSpace, THREE.NoColorSpace);
    assert(material.roughness >= .9); assert(material.bumpScale <= .003);
    env.dispose();
  }
});

test('washroom basins have an open rim and recessed interior rather than a solid ellipsoid', () => {
  const { area, env } = environment('SC13'); area.updateMatrixWorld(true);
  const visible = object => { for (let node = object; node; node = node.parent) if (!node.visible) return false; return true; };
  const surfaceY = (x, z) => {
    const ray = new THREE.Raycaster(new THREE.Vector3(x, 1.8, z), new THREE.Vector3(0, -1, 0), 0, 1.8);
    return ray.intersectObject(area, true).find(hit => visible(hit.object))?.point.y;
  };
  for (const x of [-5.62, 5.62]) for (const z of [-6, -1.2, 4.9]) {
    const inside = surfaceY(x, z + .12), rim = surfaceY(x, z + .55);
    assert(Number.isFinite(inside) && Number.isFinite(rim));
    assert(rim - inside > .14, `basin ${x},${z} has a real concave interior`);
  }
  env.dispose();
});

test('battle location dressing preserves authority arena walls and has a bounded rendering cost', () => {
  for (const [id, kind] of [['SC13', 'troll'], ['SC12', 'monster'], ['SC15', 'stone']]) {
    const combat = { kind, arena: structuredClone(DEFAULT_ARENA) }, { area, env } = environment(id, { combat });
    assert.deepEqual(env.bounds, [-14, 14, -14, 14]);
    assert.deepEqual(env.walls, combat.arena.obstacles, 'visual details must not silently become spell blockers or movement obstacles');
    const { draws, triangles } = staticMetrics(area);
    assert(draws < 55, `${id} battle scenery costs ${draws} draws`); assert(triangles < 120000, `${id} battle scenery costs ${triangles} triangles`);
    env.dispose();
  }
});
