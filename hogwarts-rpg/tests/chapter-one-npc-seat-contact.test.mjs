import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Matrix4 } from 'three';
import { createNpc } from '../chapter-one/presentation/npcs.mjs';
import { solveSeatedContact } from '../chapter-one/presentation/seating.mjs';
import { getTrainSeat, BOAT_SEATS } from '../chapter-one/train-layout.mjs';

const trainSeat = getTrainSeat('neville').seat;
const step = (actor, state, frames = 120) => { for (let i = 0; i < frames; i++) actor.update(1 / 60, state); };
function geometryContact(actor, seat) {
  actor.root.updateMatrixWorld(true);
  const inverse = new Matrix4().copy(actor.root.matrixWorld).invert(), v = new Vector3();
  let legsInside = 0, clothInside = 0, minimumSole = Infinity, minimumCushionSkin = Infinity, vertices = 0;
  actor.root.traverse(mesh => {
    const leg = mesh.isSkinnedMesh && /^Leg[LR]$/.test(mesh.parent.name), garment = mesh.userData.seatedWardrobe;
    if (!leg && !garment) return;
    const sole = leg && mesh.material.color?.getHexString() === '171817';
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
      mesh.getVertexPosition(i, v).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse); vertices++;
      if (sole) minimumSole = Math.min(minimumSole, v.y);
      if (Math.abs(v.x) < seat.width / 2 && v.z > seat.frontZ && v.z < seat.backZ) {
        minimumCushionSkin = Math.min(minimumCushionSkin, v.y);
        if (v.y < seat.surfaceY - .002 && v.y > seat.surfaceY - .16) {
          if (leg) legsInside++; else clothInside++;
        }
      }
    }
  });
  return { legsInside, clothInside, minimumSole, minimumCushionSkin, vertices };
}

test('the shared solver uses measured legs and soles for a low seat and a high seat', () => {
  const metrics = { thighLength: .42, shinLength: .40, soleBelowAnkle: .09, thighRadius: .09, calfRadius: .08, restHip: { y: .9, z: 0 } };
  const low = solveSeatedContact(metrics, { ...trainSeat, surfaceY: .30 });
  assert.equal(low.footMode, 'grounded'); assert(Math.abs(low.soleY) < 1e-10);
  assert(low.ankleTarget.z < low.kneeTarget.z, 'a lower seat lets the feet extend forwards');
  const high = solveSeatedContact(metrics, { ...trainSeat, surfaceY: .75 });
  assert.equal(high.footMode, 'dangling'); assert(high.soleY > .3);
  assert(high.kneeTarget.z + metrics.calfRadius < trainSeat.frontZ);
  assert.equal(high.hipAngle + high.kneeAngle + high.ankleAngle, 0, 'boots keep a level sole');
  assert.equal(solveSeatedContact(metrics, { ...trainSeat, backZ: -1 }), null);
  assert.equal(solveSeatedContact({ ...metrics, shinLength: NaN }, trainSeat), null);
});

test('actual student and adult skinned vertices and robe folds stay outside the real cushion', () => {
  const bench = getTrainSeat('neville'), cushion = bench.parts.find(part => part.id.endsWith(':cushion'));
  assert(Math.abs(cushion.y + cushion.h / 2 - bench.position.y - trainSeat.surfaceY) < 1e-10);
  assert(Math.abs(-(cushion.z + cushion.d / 2 - bench.position.z) - trainSeat.frontZ) < 1e-10);
  assert(Math.abs(-(cushion.z - cushion.d / 2 - bench.position.z) - trainSeat.backZ) < 1e-10);
  assert.equal(cushion.w, trainSeat.width);
  for (const id of ['neville', 'draco', 'wood', 'molly', 'snape', 'flitwick']) {
    const actor = createNpc({ id });
    try {
      actor.root.position.set(4, .4, -3); actor.root.rotation.y = Math.PI * .73;
      actor.update(1 / 60, { action: 'sit', seat: trainSeat });
      for (const frames of [0, 120]) {
        step(actor, { action: 'sit', seat: trainSeat, talking: true }, frames);
        const contact = geometryContact(actor, trainSeat);
        assert(contact.vertices > 40000, 'test uses rendered geometry, not a hip-only proxy');
        assert.equal(contact.legsInside, 0, `${id} leg vertices inside seat`);
        assert.equal(contact.clothInside, 0, `${id} robe vertices inside seat`);
        assert(contact.minimumCushionSkin >= trainSeat.surfaceY - .002, `${id} actual contact stays above top`);
        assert(contact.minimumSole >= trainSeat.floorY - .002, `${id} boot below floor`);
        assert(Math.abs(contact.minimumSole - actor.debugSnapshot().seating.soleY) < .003, `${id} measured sole agrees with solver`);
        assert.deepEqual(actor.root.position.toArray(), [4, .4, -3]); assert.equal(actor.root.rotation.y, Math.PI * .73);
      }
    } finally { actor.dispose(); }
  }
});

test('low chairs plant the actual boot soles without stretching their geometry', () => {
  for (const id of ['neville', 'draco', 'molly']) {
    const actor = createNpc({ id }), seat = { ...trainSeat, surfaceY: .24 };
    try {
      const source = actor.root.getObjectByName('LegL').children.filter(mesh => mesh.isSkinnedMesh).map(mesh => [...mesh.geometry.attributes.position.array]);
      step(actor, { action: 'sit', seat });
      const contact = geometryContact(actor, seat);
      assert.equal(actor.debugSnapshot().seating.footMode, 'grounded');
      assert(Math.abs(contact.minimumSole) < .003, `${id} actual sole contact ${contact.minimumSole}`);
      assert.equal(contact.legsInside, 0); assert.equal(contact.clothInside, 0);
      assert.deepEqual(actor.root.getObjectByName('LegL').children.filter(mesh => mesh.isSkinnedMesh).map(mesh => [...mesh.geometry.attributes.position.array]), source);
    } finally { actor.dispose(); }
  }
});

test('standing and walking recover the unchanged wardrobe and calibrated ground height', () => {
  const actor = createNpc({ id: 'draco' }), control = createNpc({ id: 'draco' });
  try {
    const garments = actor.root.getObjectByName('Body').children.filter(mesh => mesh.userData.seatedWardrobe);
    const source = garments.map(mesh => [...mesh.geometry.attributes.position.array]);
    step(actor, { action: 'sit', seat: trainSeat }); step(control, { action: 'idle' });
    step(actor, { action: 'walk', speed: 1.4 }, 180); step(control, { action: 'walk', speed: 1.4 }, 180);
    assert(garments.every(mesh => mesh.morphTargetInfluences[0] === 0));
    assert.deepEqual(garments.map(mesh => [...mesh.geometry.attributes.position.array]), source);
    assert.deepEqual(actor.root.getObjectByName('Body').position.toArray(), control.root.getObjectByName('Body').position.toArray());
    for (const joint of ['LegL', 'KneeL', 'AnkleL', 'LegR', 'KneeR', 'AnkleR']) {
      assert.deepEqual(actor.root.getObjectByName(joint).rotation.toArray(), control.root.getObjectByName(joint).rotation.toArray());
    }
  } finally { actor.dispose(); control.dispose(); }
});

test('Hagrid retains the old boat pose without a seat contract and fits an explicit boat bench', () => {
  const legacy = createNpc({ id: 'hagrid' }), seated = createNpc({ id: 'hagrid' });
  try {
    step(legacy, { action: 'sit' });
    assert.equal(legacy.debugSnapshot().seating, null);
    assert(Math.abs(legacy.root.getObjectByName('Body').position.y + .23) < .02);
    const seat = BOAT_SEATS.guide.seat;
    step(seated, { action: 'sit', seat });
    const contact = geometryContact(seated, seat);
    assert.equal(contact.legsInside, 0); assert.equal(contact.clothInside, 0);
    assert(contact.minimumSole >= seat.floorY - .002);
    assert.deepEqual(seated.root.position.toArray(), [0, 0, 0]);
  } finally { legacy.dispose(); seated.dispose(); }
});
