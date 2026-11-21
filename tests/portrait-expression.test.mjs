import assert from 'node:assert/strict';
import test from 'node:test';
import {createTravelExpression} from '../js/magic/portrait-expression.js';

function mesh(names, weights = names.map(() => 0)) {
  return {
    isMesh: true, morphTargetInfluences: [...weights],
    morphTargetDictionary: Object.fromEntries(names.map((name, i) => [name, i]))
  };
}
const root = (...meshes) => ({traverse: visit => meshes.forEach(visit)});

test('no registered facial targets leaves rigid characters and equipment alone', () => {
  assert.equal(createTravelExpression(root(mesh(['CastingGrip', 'eyesWide', 'jawForward', 'blink-light']))), null);
});

test('full character and independent split primitives retain authored baselines', () => {
  const iris = mesh(['FaceLookLeft', 'FaceLookRight'], [.1,.05]);
  const lips = mesh(['FaceJawBreath', 'FaceCheekLiftL'], [.6,.35]);
  const face = mesh(['FaceJawBreath', 'FaceCheekLiftL'], [.2,.41]);
  const eyelids = mesh(['FaceBlinkL', 'FaceBlinkR'], [.34,.42]);
  const parts = [iris,lips,face,eyelids];
  const initial = parts.map(m => [...m.morphTargetInfluences]);
  const layer = createTravelExpression(root(...parts));
  layer.apply(1/60,1,1);
  assert.ok(lips.morphTargetInfluences[0] > .6);
  assert.ok(face.morphTargetInfluences[0] > .2);
  assert.ok(Math.abs(lips.morphTargetInfluences[0]-face.morphTargetInfluences[0]-.4) < 1e-10);
  layer.restore();
  assert.deepEqual(parts.map(m => m.morphTargetInfluences), initial);
  layer.apply(.1,0,0);
  assert.deepEqual(parts.map(m => m.morphTargetInfluences), initial);
});

test('ARKit left gaze drives anatomical directions and named VRM blink works alone', () => {
  const eyes = mesh(['eyeLookOutLeft','eyeLookInLeft','eyeLookInRight','eyeLookOutRight','eyeWideLeft']);
  const lids = mesh(['blink', 'jawForward'], [0,.73]);
  const layer = createTravelExpression(root(eyes,lids));
  let closed = false;
  for (let i = 0; i < 230; ++i) {
    layer.restore();layer.apply(1/60,1,0);
    closed ||= lids.morphTargetInfluences[0] > .95;
  }
  assert.ok(closed);
  const [leftOut,leftIn,rightIn,rightOut,leftWide] = eyes.morphTargetInfluences;
  assert.ok(leftOut>.25 && leftOut===rightIn);
  assert.equal(leftIn,0);assert.equal(rightOut,0);assert.equal(leftWide,0);
  assert.equal(lids.morphTargetInfluences[1],.73);
  layer.restore();
  assert.deepEqual(lids.morphTargetInfluences,[0,.73]);
});

test('partial custom face moves the registered channel and preserves similar names', () => {
  const lips = mesh(['Part lips','jawOpenWide','robeLip','WandBlink'],[.12,.22,.33,.44]);
  const layer = createTravelExpression(root(lips),{aliases:{jaw:'Part lips'}});
  layer.apply(.1,1,1);
  assert.ok(lips.morphTargetInfluences[0]>.12);
  assert.deepEqual(lips.morphTargetInfluences.slice(1),[.22,.33,.44]);
  layer.restore();
  assert.deepEqual(lips.morphTargetInfluences,[.12,.22,.33,.44]);
});
