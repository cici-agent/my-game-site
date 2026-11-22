import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { snapshotJourneyEnvironment, blendJourneyEnvironment } from '../chapter-one/client/world.mjs';
import { createSceneEnvironment } from '../chapter-one/client/scene-environment.mjs';

const context = new Proxy({ measureText: text => ({ width: String(text).length * 12 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, { get: (object, key) => key in object ? object[key] : () => {} });
globalThis.document = { createElement: () => ({ width: 512, height: 512, getContext: () => context }) };

test('prebuilding the real Great Hall preserves the lake sky and cannot double the global lighting', () => {
  const scene = new THREE.Scene(), oldArea = new THREE.Group(), nextArea = new THREE.Group(); scene.add(oldArea);
  const lake = createSceneEnvironment('SC03', oldArea);
  scene.background = new THREE.Color(0x2d4352); scene.fog = new THREE.Fog(0x2d4352, 25, 85);
  const from = snapshotJourneyEnvironment(scene, oldArea);
  scene.add(nextArea); const hall = createSceneEnvironment('SC04', nextArea), to = snapshotJourneyEnvironment(scene, nextArea);
  assert.notEqual(scene.background.getHex(), from.background.getHex(), 'legacy scene construction actually overwrites the global sky');
  const transition = blendJourneyEnvironment(scene, from, to);
  assert.equal(scene.background.getHex(), from.background.getHex()); assert.equal(scene.fog.color.getHex(), from.fog.color.getHex());
  from.lights.forEach(({ light, intensity }) => assert.equal(light.intensity, intensity));
  to.lights.forEach(({ light }) => assert.equal(light.intensity, 0));
  transition.update(.44); assert.equal(scene.background.getHex(), from.background.getHex());
  transition.update(.65);
  const close = (actual, expected) => assert(Math.abs(actual - expected) < 1e-8);
  from.lights.forEach(({ light, intensity }) => close(light.intensity, intensity / 2));
  to.lights.forEach(({ light, intensity }) => close(light.intensity, intensity / 2));
  const halfway = from.background.clone().lerp(to.background, .5);
  close(scene.background.r, halfway.r); close(scene.background.g, halfway.g); close(scene.background.b, halfway.b);
  close(scene.fog.near, (from.fog.near + to.fog.near) / 2);
  transition.finish();
  assert.equal(scene.background.getHex(), to.background.getHex()); assert.equal(scene.fog.color.getHex(), to.fog.color.getHex());
  from.lights.forEach(({ light }) => assert.equal(light.intensity, 0)); to.lights.forEach(({ light, intensity }) => assert.equal(light.intensity, intensity));
  transition.update(.1); assert.equal(scene.background.getHex(), to.background.getHex(), 'late progress cannot undo completion or cancellation');
  lake.dispose(); hall.dispose();
});

test('cancelling a journey mid-blend restores the retained destination without leaving dimmed lamps', () => {
  const scene = new THREE.Scene(), oldArea = new THREE.Group(), nextArea = new THREE.Group();
  oldArea.add(new THREE.HemisphereLight(0xffffff, 0x111111, 2)); nextArea.add(new THREE.DirectionalLight(0xffffff, 3));
  scene.background = new THREE.Color(0x123456); scene.fog = new THREE.Fog(0x123456, 20, 80); const from = snapshotJourneyEnvironment(scene, oldArea);
  scene.background = new THREE.Color(0xabcdef); scene.fog = new THREE.Fog(0xabcdef, 30, 90); const to = snapshotJourneyEnvironment(scene, nextArea);
  const transition = blendJourneyEnvironment(scene, from, to); transition.update(.6); transition.finish(); transition.finish();
  assert.equal(nextArea.children[0].intensity, 3); assert.equal(oldArea.children[0].intensity, 0);
  assert.equal(scene.background.getHex(), 0xabcdef); assert.equal(scene.fog.far, 90);
});
