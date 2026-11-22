import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolveCharacterAsset } from '../chapter-one/presentation/registry.mjs';
import { createCharacterPresentation } from '../chapter-one/presentation/character-adapter.mjs';
import { attachCharacterStatePresentation } from '../chapter-one/presentation/state-layer.mjs';
import { createSceneEnvironment } from '../chapter-one/client/scene-environment.mjs';
import { createAtlasEnvironment, openRegionPortals } from '../chapter-one/client/journey-environment.mjs';
import { worldAreas, getWorldArea, getAreaLinks, areaFloor } from '../chapter-one/world-atlas.mjs';
import { getTrainSeat, TRAIN_FURNITURE_PARTS } from '../chapter-one/train-layout.mjs';
import { trainPassengers } from '../chapter-one/client/train-life.mjs';
import { canOccupy, moveWithCollisions } from '../chapter-one/client/scene-geometry.mjs';
const context = new Proxy({ measureText: text => ({ width: String(text).length * 12 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, { get: (object, key) => key in object ? object[key] : () => {} });
globalThis.document = { createElement: () => ({ width: 512, height: 512, getContext: () => context }) };
const visible = object => { for (let node = object; node; node = node.parent) if (!node.visible) return false; return true; };
function build(areaId) {
  const area = getWorldArea(areaId), root = new THREE.Group(), portals = getAreaLinks(area.id), legacy = /^SC\d\d(?:[-_]|$)/.test(area.id);
  const env = legacy ? createSceneEnvironment(area.sceneId, root, { questId: area.questId }) : createAtlasEnvironment(area, { portals });
  if (!legacy) root.add(env.root);
  const opened = legacy ? openRegionPortals(root, area, { portals }) : null;
  root.updateMatrixWorld(true);
  return { root, env, area, dispose() { opened?.dispose(); env.dispose(); } };
}
function hits(root, origin, direction, length) {
  return new THREE.Raycaster(new THREE.Vector3(...origin), new THREE.Vector3(...direction), 0, length).intersectObject(root, true).filter(hit => visible(hit.object) && !hit.object.isSprite && ![].concat(hit.object.material ?? []).some(material => material.transparent));
}
const sources = new Map();
async function source(heroId) {
  if (!sources.has(heroId)) sources.set(heroId, (async () => {
    const bytes = await readFile(new URL(resolveCharacterAsset(heroId).url));
    const loader = new GLTFLoader(); loader.register(() => ({ name: 'HEADLESS_SPATIAL_TEXTURES', loadTexture: () => Promise.resolve(null) }));
    return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  })());
  return sources.get(heroId);
}
function trouserPoints(actor, materials = /pants|trousers/i) {
  const result = [], point = new THREE.Vector3(); actor.root.updateMatrixWorld(true);
  actor.model.traverse(mesh => {
    if (!mesh.isSkinnedMesh || !visible(mesh) || ![].concat(mesh.material).some(material => materials.test(material.name))) return;
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) result.push(mesh.getVertexPosition(i, point).clone().applyMatrix4(mesh.matrixWorld));
  });
  return result;
}
// Raycast actual rendered meshes, not a second copy of authored dimensions.
test('all area spawns have a rendered support floor and a clear standing cylinder', () => {
  const failures = [];
  for (const area of worldAreas) {
    const built = build(area.id), p = area.spawn, floor = areaFloor(area.id, p);
    const support = hits(built.root, [p.x, floor + .3, p.z], [0, -1, 0], .6)[0];
    if (!support || Math.abs(support.point.y - floor) > .22) failures.push(`${area.id}: spawn support ${support?.point.y} vs ${floor}`);
    if (!canOccupy(p, area.navigation.walls)) failures.push(`${area.id}: spawn inside authoritative collision`);
    for (const y of [.35, 1, 1.6]) for (let i = 0; i < 12; i++) {
      const obstruction = hits(built.root, [p.x, floor + y, p.z], [Math.cos(i * Math.PI / 6), 0, Math.sin(i * Math.PI / 6)], .34)[0];
      if (obstruction) failures.push(`${area.id}: body blocked at ${y} by ${obstruction.object.name || obstruction.object.geometry.type}`);
    }
    built.dispose();
  }
  assert.deepEqual([...new Set(failures)], []);
});
test('coach furniture has real surface heights and the central aisle remains navigable', () => {
  for (const areaId of ['SC02_LONDON', 'SC02_HOGSMEADE']) {
    const built = build(areaId);
    try {
      for (const part of TRAIN_FURNITURE_PARTS.filter(part => part.solid)) {
        const y = part.y + part.h / 2;
        const support = hits(built.root, [part.x, y + .025, part.z], [0, -1, 0], .05)[0];
        assert(support && Math.abs(support.point.y - y) < .012, `${part.id}: actual mesh top must match collider height`);
        assert(!canOccupy({ x: part.x, y: 0, z: part.z }, built.area.navigation.walls, .1), `${part.id}: rendered solid must block movement`);
      }
      for (const x of [-.45, 0, .45]) {
        const from = { x, y: 0, z: 16.4 }, end = { x, y: 0, z: -8.5 };
        const moved = moveWithCollisions(from, end, built.area.navigation.bounds, built.area.navigation.walls);
        assert(Math.abs(moved.z - end.z) < .01 && Math.abs(moved.x - x) < .01, 'a body-width aisle continues through the vestibule');
        for (const y of [.35, .9, 1.5]) assert.equal(hits(built.root, [x, y, 16.4], [0, 0, -1], 24.9).length, 0, `actual aisle must clear x=${x}, y=${y}`);
      }
    } finally { built.dispose(); }
  }
});
for (const heroId of ['harry', 'ron', 'hermione']) test(`${heroId}: first rendered seated pose contacts the actual cushion without moving the root`, async () => {
  const actor = attachCharacterStatePresentation(createCharacterPresentation(await source(heroId), { heroId }));
  const built = build('SC02_LONDON'), slot = getTrainSeat(heroId);
  try {
    actor.root.position.set(slot.position.x, slot.position.y, slot.position.z); actor.root.rotation.y = slot.yaw;
    const position = actor.root.position.clone(), quaternion = actor.root.quaternion.clone();
    actor.updateTravel(0, 0, true, 0, true, slot.seat);
    assert.equal(actor.debugSnapshot().layers.sitting, 1, 'a resident passenger never appears standing inside its bench');
    const points = trouserPoints(actor), support = points.filter(point => Math.abs(point.x - slot.position.x) < .5 && point.z > slot.bay + .3 && point.z < slot.bay + .85);
    assert(support.length > 40, 'measure real skinned trouser vertices over the bench');
    const contact = support.reduce((lowest, point) => point.y < lowest.y ? point : lowest, support[0]);
    const cushion = hits(built.root, [contact.x, slot.seat.surfaceY + .06, contact.z], [0, -1, 0], .12)[0];
    assert(cushion, 'the lowest supported thigh has an actual cushion beneath it');
    assert(contact.y >= cushion.point.y - .015, `thigh penetrates cushion: ${contact.y} < ${cushion.point.y}`);
    assert(contact.y - cushion.point.y < .09, `thigh floats above cushion: ${contact.y - cushion.point.y}`);
    const garment = trouserPoints(actor, /pants|trousers|robe|coat|lining|edge|wool|seam/i).filter(point => Math.abs(point.x - slot.position.x) < .5 && point.z > slot.bay + .3 && point.z < slot.bay + .85);
    assert(garment.every(point => point.y >= cushion.point.y - .025), `coat/skirt cannot hang through the upholstered seat: ${Math.min(...garment.map(point => point.y))}`);
    const soles = Array.from({ length: 4 }, () => new THREE.Vector3()); actor.readSoleContacts(soles);
    assert(soles.every(point => point.y >= slot.seat.floorY - .003), 'real heels and toes stay above the floor');
    for (const side of ['L', 'R']) {
      const hip = actor.model.getObjectByName('Thigh' + side).getWorldPosition(new THREE.Vector3()), knee = actor.model.getObjectByName('Shin' + side).getWorldPosition(new THREE.Vector3());
      assert(Math.abs(hip.y - knee.y) < .005, 'actual thigh is horizontal, not a standing leg pushed into the bench');
    }
    assert(actor.root.position.equals(position)); assert(actor.root.quaternion.equals(quaternion));
    assert.equal(trainPassengers({ sceneId: 'SC02' }).find(p => p.appearanceId === heroId).position.y, slot.position.y);
  } finally { actor.dispose(); built.dispose(); }
});
for (const heroId of ['harry', 'ron', 'hermione']) test(`${heroId}: entering and leaving seats keeps actual soles above the floor and restores the source idle`, async () => {
  const gltf = await source(heroId), actor = attachCharacterStatePresentation(createCharacterPresentation(gltf, { heroId })), reference = createCharacterPresentation(gltf, { heroId });
  try {
    actor.root.position.set(4, 3.2, -7); actor.root.rotation.y = .71;
    reference.root.position.copy(actor.root.position); reference.root.rotation.copy(actor.root.rotation);
    actor.updateTravel(0); reference.updateTravel(0);
    const soles = Array.from({ length: 4 }, () => new THREE.Vector3()), seat = getTrainSeat(heroId).seat;
    for (let i = 0; i < 120; i++) {
      actor.updateTravel(1 / 60, 0, true, 0, true, seat); reference.updateTravel(1 / 60);
      actor.readSoleContacts(soles); assert(soles.every(p => p.y >= 3.197), `sit frame ${i}: real sole below floor`);
      assert.deepEqual(actor.root.position.toArray(), [4, 3.2, -7]); assert.equal(actor.root.rotation.y, .71);
    }
    for (let i = 0; i < 120; i++) {
      actor.updateTravel(1 / 60, 0, true, 0, false); reference.updateTravel(1 / 60);
      actor.readSoleContacts(soles); assert(soles.every(p => p.y >= 3.197), `stand frame ${i}: real sole below floor`);
    }
    for (const name of ['Hips', 'ThighL', 'ThighR', 'ShinL', 'ShinR', 'FootL', 'FootR']) {
      const a = actor.model.getObjectByName(name), b = reference.model.getObjectByName(name);
      assert(a.position.distanceTo(b.position) < .0005 && a.quaternion.clone().normalize().angleTo(b.quaternion.clone().normalize()) < .0005, `${name} returns to the authored idle: pos ${a.position.toArray()} vs ${b.position.toArray()}, quat ${a.quaternion.angleTo(b.quaternion)}`);
    }
    const restored = trouserPoints(actor), original = trouserPoints(reference);
    assert.equal(restored.length, original.length);
    assert(restored.every((point, index) => point.distanceTo(original[index]) < .0005), 'the actual garment vertices return to the unmodified source pose');
  } finally { actor.dispose(); reference.dispose(); }
});
test('boat role anchors are supported by real benches at every sampled crossing orientation', () => {
  const built = build('SC03');
  try {
    for (const [progress, x, z] of [[.01, 1.47, 45.5], [.3, .6, 31], [.7, -.6, 11]]) {
      built.env.setEscort?.({ kind: 'boat', progress, position: { x, z } });
      for (let frame = 0; frame < 90; frame++) built.env.update(1 / 60, frame / 60);
      built.root.updateMatrixWorld(true);
      for (const role of ['guide', 'player']) {
        const pose = built.env.getBoatPose(role); assert(pose?.seat);
        const y = pose.position.y + pose.seat.surfaceY;
        const hit = hits(built.root, [pose.position.x, y + .1, pose.position.z], [0, -1, 0], .2)[0];
        assert(hit && Math.abs(hit.point.y - y) < .035, `${role}: pose must sit over its actual bench, not an unrelated point in the hull`);
      }
    }
  } finally { built.dispose(); }
});

test('seated garment adaptation preserves shared source buffers and releases its own geometry once', async t => {
  const fingerprint = model => {
    const hash = createHash('sha256');
    model.traverse(mesh => {
      if (!mesh.geometry) return;
      for (const attribute of [...Object.values(mesh.geometry.attributes), ...Object.values(mesh.geometry.morphAttributes).flat()]) hash.update(Buffer.from(attribute.array.buffer, attribute.array.byteOffset, attribute.array.byteLength));
    });
    return hash.digest('hex');
  };
  for (const heroId of ['harry', 'ron', 'hermione']) {
    const gltf = await source(heroId), before = fingerprint(gltf.scene), actor = createCharacterPresentation(gltf, { heroId });
    const sourceGeometry = new Set(); gltf.scene.traverse(mesh => { if (mesh.geometry) sourceGeometry.add(mesh.geometry); });
    const owned = new Map(); let sourceDisposals = 0;
    const onSourceDispose = () => { sourceDisposals++; };
    for (const geometry of sourceGeometry) geometry.addEventListener('dispose', onSourceDispose);
    try {
      actor.updateTravel(0, 0, true, 0, true, getTrainSeat(heroId).seat);
      actor.root.traverse(mesh => {
        if (mesh.geometry && !sourceGeometry.has(mesh.geometry) && !owned.has(mesh.geometry)) {
          owned.set(mesh.geometry, 0); mesh.geometry.addEventListener('dispose', () => owned.set(mesh.geometry, owned.get(mesh.geometry) + 1));
        }
      });
      assert(owned.size > 0, 'seated wardrobe uses instance-owned geometry');
      assert.equal(fingerprint(gltf.scene), before, 'published vertex, skin and morph buffers are byte-identical');
      let bytes = 0;
      for (const geometry of owned.keys()) {
        assert.equal(geometry.morphAttributes.position.length, geometry.morphAttributes.normal.length, 'GPU morph texture has a matching normal target for every position target');
        bytes += [...Object.values(geometry.attributes), ...Object.values(geometry.morphAttributes).flat()].reduce((sum, attribute) => sum + attribute.array.byteLength, 0);
      }
      t.diagnostic(`${heroId}: ${owned.size} private garment geometries, ${(bytes / 1048576).toFixed(2)} MiB; no extra meshes or triangles`);
      assert(bytes < 8 * 1048576, 'seat adaptation stays below 8 MiB per detailed student');
      actor.dispose(); actor.dispose();
      assert([...owned.values()].every(count => count === 1), 'every private GPU geometry is released exactly once');
      assert.equal(sourceDisposals, 0, 'another actor retains its shared source geometry');
      assert.equal(fingerprint(gltf.scene), before);
    } finally { actor.dispose(); for (const geometry of sourceGeometry) geometry.removeEventListener('dispose', onSourceDispose); }
  }
});
