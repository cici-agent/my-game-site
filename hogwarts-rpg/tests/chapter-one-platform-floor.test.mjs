import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSceneEnvironment } from '../chapter-one/client/scene-environment.mjs';
import { createWorldStreaming } from '../chapter-one/client/world-streaming.mjs';
import { getWorldArea, getAreaLinks } from '../chapter-one/world-atlas.mjs';

const context = new Proxy({ measureText: text => ({ width: String(text).length * 12 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, { get: (object, key) => key in object ? object[key] : () => {} });
globalThis.document = { createElement: () => ({ width: 512, height: 512, getContext: () => context }) };
const visible = object => { for (let node = object; node; node = node.parent) if (!node.visible) return false; return true; };
const owner = object => { for (let node = object; node; node = node.parent) if (node.name.startsWith('WorldArea:')) return node.name.slice('WorldArea:'.length); return null; };
const surface = hit => (hit.object.userData.environmentSurface ?? hit.object.material?.userData.environmentSurface)?.kind;
function down(root, x, z, y = .10, distance = .4) {
  return new THREE.Raycaster(new THREE.Vector3(x, y, z), new THREE.Vector3(0, -1, 0), 0, distance)
    .intersectObject(root, true).filter(hit => visible(hit.object) && !hit.object.isSprite && ![].concat(hit.object.material ?? []).some(material => material.transparent));
}

test('station physical edges stay separate from navigation door overlap', () => {
  for (const [id, index, edge] of [['LONDON_PLATFORM', 1, 11.8], ['HOGSMEADE_STATION', 0, -12.8]]) {
    const area = getWorldArea(id);
    assert.equal(area.physicalBounds[index], edge);
    assert(Math.abs(area.navigation.bounds[index] - edge) >= .89);
    assert.notEqual(area.navigation.bounds, area.physicalBounds);
    assert(Object.isFrozen(area.physicalBounds));
  }
});

test('both streamed station neighbours leave the actual carriage floor continuously wooden', () => {
  const standalone = new THREE.Group(), environment = createSceneEnvironment('SC02', standalone);
  standalone.updateMatrixWorld(true);
  try {
    for (const id of ['SC02_LONDON', 'SC02_HOGSMEADE']) {
      const scene = new THREE.Scene(), stream = createWorldStreaming(scene);
      try {
        stream.activate(id); scene.updateMatrixWorld(true);
        // Include the outer seat edge: centre-aisle probes alone miss the
        // platform's former 0.9-m strip beneath the left/right window seats.
        for (const x of [-3, -2.8, -2.6, -2.4, -2, 2, 2.4, 2.6, 2.8, 3]) {
          for (let z = 4; z <= 7; z += .2) {
            const alone = down(standalone, x, z), together = down(scene, x, z);
            assert.equal(surface(alone[0]), 'wood');
            assert.equal(surface(together[0]), 'wood', `${id} ${x},${z}: ${surface(together[0])}`);
            assert.equal(owner(together[0].object), id);
            assert(Math.abs(together[0].point.y - alone[0].point.y) < 1e-8);
            assert(!together.some(hit => owner(hit.object) !== id && hit.point.y >= -.005), `${id} ${x},${z}: no coplanar station slab or raised mortar seam`);
          }
        }
      } finally { stream.dispose(); }
    }
  } finally { environment.dispose(); }
});

test('both real platform tracks align with the corresponding streamed coach centre', () => {
  for (const [coachId, stationId] of [['SC02_LONDON', 'LONDON_PLATFORM'], ['SC02_HOGSMEADE', 'HOGSMEADE_STATION']]) {
    const scene = new THREE.Scene(), stream = createWorldStreaming(scene), rails = [];
    try {
      stream.activate(coachId); scene.updateMatrixWorld(true);
      const station = stream.entries.find(entry => entry.area.id === stationId);
      station.root.traverse(mesh => {
        if (!mesh.isMesh || mesh.material?.name !== 'atlas-iron') return;
        mesh.geometry.computeBoundingBox();
        for (let index = 0; index < (mesh.isInstancedMesh ? mesh.count : 1); index++) {
          const matrix = new THREE.Matrix4(); if (mesh.isInstancedMesh) mesh.getMatrixAt(index, matrix);
          const bounds = mesh.geometry.boundingBox.clone().applyMatrix4(matrix.premultiply(mesh.matrixWorld));
          const size = bounds.getSize(new THREE.Vector3()), centre = bounds.getCenter(new THREE.Vector3());
          if (Math.abs(size.x - .10) < .001 && Math.abs(size.y - .14) < .001 && size.z > 30 && Math.abs(centre.y + .65) < .001) rails.push(centre);
        }
      });
      assert.equal(rails.length, 2);
      assert(Math.abs((rails[0].x + rails[1].x) / 2) < .00001, `${coachId}: rails follow the physical carriage, not expanded navigation bounds`);
    } finally { stream.dispose(); }
  }
});

test('local platform thresholds still support every doorway across the unchanged walking seam', () => {
  for (const id of ['LONDON_PLATFORM', 'HOGSMEADE_STATION']) {
    const scene = new THREE.Scene(), stream = createWorldStreaming(scene);
    try {
      stream.activate(id); scene.updateMatrixWorld(true);
      for (const link of getAreaLinks(id).filter(link => link.kind === 'walk')) {
        const { anchor, normal } = link;
        for (const forward of [-.8, -.4, 0, .4, .8]) for (const lateral of [-.9, 0, .9]) {
          const x = anchor.x + normal.x * forward - normal.z * lateral;
          const z = anchor.z + normal.z * forward + normal.x * lateral;
          const hit = down(scene, x, z, anchor.y + .12, .35)[0];
          assert(hit && Math.abs(hit.point.y - anchor.y) <= .03, `${link.id}: floor absent at ${forward}/${lateral}, got ${hit?.point.y}`);
        }
      }
    } finally { stream.dispose(); }
  }
});
