import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { Box3, Vector3, Group, InstancedMesh, BoxGeometry, Mesh, Raycaster } from 'three';
import { createNpc, createSculptureKit } from '../chapter-one/presentation/npcs.mjs';
import { FACE_VERTICES, FACE_TRIANGLES } from '../chapter-one/presentation/npc-face-topology.mjs';

const identities = ['hagrid', 'mcgonagall', 'flitwick', 'snape', 'dumbledore', 'quirrell', 'pomfrey', 'sprout', 'molly', 'hooch', 'wood', 'pince', 'filch', 'draco', 'supply', 'gear', 'tools', 'post'];
const finite = actor => { actor.root.updateMatrixWorld(true); actor.root.traverse(node => assert(node.matrixWorld.elements.every(Number.isFinite), node.name)); };
const step = (actor, seconds, state = {}, rate = 60) => { for (let i = 0; i < seconds * rate; i++) actor.update(1 / rate, state); };
const stats = root => { let draws = 0, triangles = 0; root.traverse(node => { if (node.isMesh) { draws++; triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3 * (node.isInstancedMesh ? node.count : 1); } }); return { draws, triangles }; };

test('all chapter staff, instructors, student rivals and four service hosts have explicit independent identities', () => {
  const names = new Set();
  for (const id of identities) {
    const actor = createNpc({ id });
    try {
      assert.equal(actor.root.userData.visualKind, id); assert.equal(actor.root.userData.explicitGenericFallback, false); names.add(actor.name);
      const face = actor.root.getObjectByName('SculptedFace'); assert.equal(face.userData.sourceTopology, 'mediapipe-canonical-468');
      assert(face.geometry.attributes.position.count > 468); assert(face.geometry.attributes.color);
      const bounds = new Box3().setFromObject(actor.root), size = bounds.getSize(new Vector3());
      assert(size.y > 1.2 && size.y < 3.5, `${id} human scale`); assert(size.x < 2.1 && size.z < 1.5, `${id} wardrobe does not escape silhouette`);
      const budget = stats(actor.root); assert(budget.draws <= 50, `${id} draw budget ${budget.draws}`); assert(budget.triangles < 200000, `${id} triangle budget ${budget.triangles}`);
      finite(actor);
    } finally { actor.dispose(); }
  }
  assert.equal(names.size, identities.length);
  const fallback = createNpc({ id: 'unknown' }); assert(fallback.root.userData.explicitGenericFallback); fallback.dispose();
});

test('NPC facial data exactly preserves the existing licensed workshop canonical topology', async () => {
  const original = await readFile(new URL('../../tools/blender/face_topology/canonical_face_model.obj', import.meta.url), 'utf8');
  const vertices = [], faces = [];
  for (const line of original.split('\n')) {
    if (line.startsWith('v ')) vertices.push(line.split(/\s+/).slice(1).map(Number));
    if (line.startsWith('f ')) faces.push(line.split(/\s+/).slice(1).map(v => Number(v.split('/')[0]) - 1));
  }
  assert.deepEqual(FACE_VERTICES, vertices); assert.deepEqual(FACE_TRIANGLES, faces);
  const before = createHash('sha256').update(JSON.stringify([FACE_VERTICES, FACE_TRIANGLES])).digest('hex');
  const hagrid = createNpc({ id: 'hagrid' }), snape = createNpc({ id: 'snape' });
  assert.notDeepEqual(hagrid.debugSnapshot().face, snape.debugSnapshot().face);
  for (const actor of [hagrid, snape]) {
    const face = actor.root.getObjectByName('SculptedFace'), position = face.geometry.attributes.position, normal = face.geometry.attributes.normal;
    let projectedNose = 0;
    for (let i = 0; i < position.count; i++) if (position.getZ(i) < -.18) { projectedNose++; assert(normal.getZ(i) < .35, 'facial front normals point outward'); }
    assert(projectedNose > 10, 'real nose bridge and nostril surface protrude from the cheeks');
    actor.dispose();
  }
  assert.equal(createHash('sha256').update(JSON.stringify([FACE_VERTICES, FACE_TRIANGLES])).digest('hex'), before);
});

test('Hagrid rear-temple hair sits in front of the actual scalp from the boat camera',()=>{
 const actor=createNpc({id:'hagrid'});
 try{
  const face=actor.root.getObjectByName('SculptedFace'),hair=actor.root.getObjectByName('FittedRearHairRoots');assert(hair);
  const skinProbe=new Mesh(face.geometry,face.material),hairProbe=new Mesh(hair.geometry,hair.material),ray=new Raycaster();let samples=0;
  for(const x of[-.15,-.12,.12,.15])for(const y of[.055,.105,.155,.195]){
   ray.set(new Vector3(x,y,1),new Vector3(0,0,-1));const skin=ray.intersectObject(skinProbe)[0];if(!skin)continue;
   const cover=ray.intersectObject(hairProbe)[0];assert(cover,`rear scalp covered at ${x},${y}`);assert(cover.distance<skin.distance-.003,`hair lies outside skin at ${x},${y}`);samples++;
  }
  assert(samples>=12,'both posterior temples are tested across their full height');
  const p=hair.geometry.attributes.position;for(const index of hair.geometry.index.array)assert(p.getZ(index)>-.12,'fringe and facial features are not covered by the rear repair');
  step(actor,1,{action:'sit'});finite(actor);
 }finally{actor.dispose();}
});

test('natural blinks close fully, gaze moves within the sockets, and speech deforms the lower face only', () => {
  const actor = createNpc({ id: 'mcgonagall' });
  try {
    const face = actor.root.getObjectByName('SculptedFace'), rest = [...face.geometry.attributes.position.array];
    let maximumBlink = 0, openFrames = 0, maximumMouth = 0;
    for (let i = 0; i < 1200; i++) {
      actor.update(1 / 60, { talking: true, lookAt: { x: 2, z: -3 } });
      const expression = actor.debugSnapshot().expression; maximumBlink = Math.max(maximumBlink, expression.blink); maximumMouth = Math.max(maximumMouth, expression.mouthOpen); if (expression.blink < .01) openFrames++;
      assert(Math.abs(expression.gazeX) < .004); assert(face.morphTargetInfluences[0] >= 0 && face.morphTargetInfluences[0] <= 1);
    }
    assert(maximumBlink > .97); assert(openFrames > 1000, 'brief blinks do not leave lids half closed'); assert(maximumMouth > .5);
    assert.deepEqual([...face.geometry.attributes.position.array], rest, 'speech uses an isolated morph, not rewritten source vertices');
    const delta = face.geometry.morphAttributes.position;
    for (let i = 0; i < face.geometry.attributes.position.count; i++) if (face.geometry.attributes.position.getY(i) > 0) assert(Math.abs(delta[0].getY(i)) === 0, 'forehead remains stable during speech');
    step(actor, 2, { action: 'idle' }); assert(actor.debugSnapshot().expression.speaking < .001); assert(face.morphTargetInfluences[0] < .001);
    finite(actor);
  } finally { actor.dispose(); }
});

test('conversation, sitting, walking and recovery never change the authority root or leave a gesture stuck', () => {
  for (const id of ['hagrid', 'snape', 'supply', 'post']) {
    const actor = createNpc({ id }); actor.root.position.set(3, .2, -4); actor.root.rotation.y = .7;
    try {
      step(actor, 2, { engaged: true, talking: true, interactionKind: 'service', lookAt: { x: 2, z: -8 } }); assert(actor.debugSnapshot().engagement > .99);
      step(actor, 2, { action: 'walk', speed: 1.3 }); assert(actor.debugSnapshot().engagement < .001);
      step(actor, 2, { action: 'sit' }); assert(actor.debugSnapshot().seated > .99);
      step(actor, 2, { action: 'downed', talking: true }); assert(actor.debugSnapshot().expression.speaking < .001);
      step(actor, 2, { action: 'idle', lookAt: { x: NaN, z: Infinity }, speed: NaN });
      assert.deepEqual(actor.root.position.toArray(), [3, .2, -4]); assert.equal(actor.root.rotation.y, .7); assert(actor.debugSnapshot().seated < .001); finite(actor);
    } finally { actor.dispose(); }
  }
});

test('face tracking and greeting converge across frame rates and actor instances remain isolated', () => {
  const low = createNpc({ id: 'pince' }), high = createNpc({ id: 'pince' });
  try {
    const state = { engaged: true, talking: true, lookAt: { x: -1, z: -2 } };
    step(low, 2, state, 30); step(high, 2, state, 120);
    assert(Math.abs(low.debugSnapshot().expression.gazeX - high.debugSnapshot().expression.gazeX) < .0001);
    assert(Math.abs(low.root.getObjectByName('Head').rotation.y - high.root.getObjectByName('Head').rotation.y) < .004);
    low.dispose(); step(high, 1, { action: 'walk', speed: 1 }); finite(high);
  } finally { low.dispose(); high.dispose(); }
});

test('visible NPC resources are owned and disposed exactly once per instance', () => {
  const actor = createNpc({ id: 'hagrid' }), resources = new Set(), counts = new Map();
  actor.root.traverse(node => {
    if (!node.isMesh) return;
    resources.add(node.geometry); for (const material of [].concat(node.material)) { resources.add(material); for (const value of Object.values(material)) if (value?.isTexture) resources.add(value); }
  });
  for (const resource of resources) resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) ?? 0) + 1));
  actor.dispose(); actor.dispose(); actor.update(.1, { action: 'walk', speed: 1 });
  for (const resource of resources) assert.equal(counts.get(resource), 1, resource.type);
  assert.equal(actor.root.children.length, 0);
});

test('adult and student anatomy keeps stature and floor, with 45–48 percent leg proportions and intact feet', () => {
  for (const id of identities) {
    const actor = createNpc({ id });
    try {
      const proportions = actor.debugSnapshot().proportions;
      if (['hagrid', 'flitwick'].includes(id)) { assert.equal(proportions, null); continue; }
      const bounds = new Box3().setFromObject(actor.root, true), head = actor.root.getObjectByName('Head');
      const hip = actor.root.getObjectByName('LegL'), knee = actor.root.getObjectByName('KneeL'), ankle = actor.root.getObjectByName('AnkleL');
      const crownY = head.localToWorld(new Vector3(0, .264, 0)).y;
      const ratio = (hip.getWorldPosition(new Vector3()).y - bounds.min.y) / (crownY - bounds.min.y);
      assert(ratio >= .45 && ratio <= .48, `${id} anatomical leg ratio ${ratio}`);
      assert(Math.abs(bounds.max.y - bounds.min.y - proportions.originalHeight) < .00002, `${id} original stature`);
      assert(Math.abs(bounds.min.y - proportions.originalFloor) < .00002, `${id} original floor`);
      assert(Math.abs((bounds.max.x - bounds.min.x) / proportions.originalWidth - .92) < .005, `${id} narrowed silhouette`);
      assert(Math.abs(knee.position.y + proportions.thigh) < 1e-9); assert(Math.abs(ankle.position.y + proportions.shin) < 1e-9);
      const sole = hip.children.find(node => node.isSkinnedMesh && node.material.color?.getHexString() === '171817');
      assert(sole, 'sole remains separately material bound'); sole.geometry.computeBoundingBox();
      const size = sole.geometry.boundingBox.getSize(new Vector3());
      assert(Math.abs(size.y - .036) < .00001, 'feet retain their original thickness rather than being stretched with the legs');
      assert(Math.abs(size.x - .186) < .00001 && Math.abs(size.z - .286) < .00001, 'foot shape is intact');
      const actual = new Vector3(), original = new Vector3(), position = sole.geometry.attributes.position;
      for (let i = 0; i < position.count; i += 137) {
        sole.getVertexPosition(i, actual); original.fromBufferAttribute(position, i);
        assert(actual.distanceTo(original) < .00001, `${id} skin bind matches the new joint rest pose`);
      }
    } finally { actor.dispose(); }
  }
});

test('retargeted legs keep planted soles level during walking and preserve seated hip and deck contact', () => {
  for (const id of ['molly', 'mcgonagall', 'snape', 'draco']) {
    const actor = createNpc({ id }), p = actor.debugSnapshot().proportions;
    try {
      const body = actor.root.getObjectByName('Body'), leg = actor.root.getObjectByName('LegL');
      const soles = ['LegL', 'LegR'].map(name => actor.root.getObjectByName(name).children.find(node => node.isSkinnedMesh && node.material.color?.getHexString() === '171817'));
      let lowest = Infinity;
      for (let frame = 0; frame < 180; frame++) {
        actor.update(1 / 60, { action: 'walk', speed: 1.4 });
        if (frame % 12) continue;
        actor.root.updateMatrixWorld(true);
        for (const sole of soles) lowest = Math.min(lowest, new Box3().setFromObject(sole, true).min.y);
      }
      assert(lowest > -.06, `${id} feet do not sink below ground: ${lowest}`);
      step(actor, 3, { action: 'sit' }); actor.root.updateMatrixWorld(true);
      for (const sole of soles) assert(Math.abs(new Box3().setFromObject(sole, true).min.y - p.originalFloor) < .025, `${id} seated foot stays near the boat deck`);
      const oldHipWorld = .65 * body.scale.y / p.heightFit;
      assert(Math.abs(leg.getWorldPosition(new Vector3()).y - (oldHipWorld - .23)) < .012, `${id} original boat seat height`);
      step(actor, 3, { action: 'idle' }); actor.root.updateMatrixWorld(true);
      for (const sole of soles) assert(Math.abs(new Box3().setFromObject(sole, true).min.y - p.originalFloor) < .025, `${id} standing contact recovers`);
      finite(actor);
    } finally { actor.dispose(); }
  }
});

test('sculpture kit disposes instance GPU buffers once for both factory and explicitly tracked meshes', () => {
  const kit = createSculptureKit(), parent = new Group(), material = kit.material({ color: '#7e6658' });
  const automatic = kit.instances(parent, material, [{ position: [0, 0, 0], scale: [1, 1, 1] }]);
  const external = new InstancedMesh(kit.geometry(new BoxGeometry()), material, 1);
  assert.equal(kit.trackInstance(external), external); kit.trackInstance(external);
  let automaticDisposals = 0, externalDisposals = 0;
  automatic.addEventListener('dispose', () => automaticDisposals++); external.addEventListener('dispose', () => externalDisposals++);
  kit.dispose(); kit.dispose(); assert.equal(automaticDisposals, 1); assert.equal(externalDisposals, 1);
});
