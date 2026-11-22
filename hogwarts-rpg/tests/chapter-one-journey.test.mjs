import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { planJourney, createJourneyTransition, configureGateway, createTrainScenery } from '../chapter-one/client/journey-transition.mjs';
import { createBoatMotion } from '../chapter-one/client/scene-landscape.mjs';
import { createSceneEnvironment } from '../chapter-one/client/scene-environment.mjs';
import { sceneNavigationIds } from '../chapter-one/client/scene-navigation.mjs';

const context = new Proxy({ measureText: text => ({ width: String(text).length * 12 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, { get: (object, key) => key in object ? object[key] : () => {} });
globalThis.document = { createElement: () => ({ width: 512, height: 512, getContext: () => context }) };
const source = { x: 1.4, y: 0, z: -.4 }, destination = { x: 0, y: 0, z: 6 };
const close = (a, b) => assert(Math.abs(a - b) < 1e-7, `${a} != ${b}`);

test('three opening journeys and every scene fallback retain source, destination and a real connecting route', () => {
  // Compatibility helpers remain tested although the runtime now uses the
  // persistent atlas; the expanded lake's old z6 spawn is open water.
  for (const [from, to, kind] of [['SC01', 'SC02', 'boarding'], ['SC02', 'SC03', 'lakeside'], ['SC03', 'SC04', 'castle'], ...sceneNavigationIds.filter(s => s !== 'SC00').map(s => [s, 'SC05', undefined])]) {
    const fromPosition = from === 'SC02' ? { x: .4, y: 0, z: -.4 } : from === 'SC03' ? { x: 1.5, y: 0, z: -6 } : source;
    const arrival=to==='SC03'?{x:0,y:0,z:66}:destination;
    const plan = planJourney({ fromSceneId: from, toSceneId: to, fromPosition, toPosition: arrival });
    assert(plan, `${from}->${to}`); if (kind) assert.equal(plan.kind, kind);
    assert.deepEqual(plan.waypoints[0], fromPosition);
    assert(plan.destinationOffset.z < -20); assert(plan.duration > 2);
    const journey = createJourneyTransition({ plan }); const initial = journey.update(0);
    assert.deepEqual(initial.position, fromPosition); assert.equal(initial.complete, false);
    const end = journey.update(plan.duration + 1); assert.equal(end.complete, true);
    close(end.position.x - plan.destinationOffset.x, arrival.x); close(end.position.z - plan.destinationOffset.z, arrival.z);
    const camera = new THREE.Vector3(1, 2, end.position.z + 4), relative = camera.clone().sub(new THREE.Vector3(...Object.values(end.position)));
    camera.sub(new THREE.Vector3(...Object.values(plan.destinationOffset)));
    assert(camera.clone().sub(new THREE.Vector3(arrival.x, arrival.y, arrival.z)).distanceTo(relative) < 1e-7);
    journey.dispose(); assert.equal(journey.root.children.length, 0);
  }
});

test('journey route navigates around furniture rather than clipping through it', () => {
  const navigation = { bounds: [-5, 5, -10, 10], walls: [{ x: 0, z: 0, w: 2, d: 2, height: 2 }] };
  const plan = planJourney({ fromSceneId: 'SC05', toSceneId: 'SC06', fromPosition: { x: 0, y: 0, z: 4 }, toPosition: destination, fromNavigation: navigation });
  assert(plan); assert(plan.waypoints.some(p => Math.abs(p.x) > 1.3));
  const a = createJourneyTransition({ plan }), b = createJourneyTransition({ plan });
  for (let i = 0; i < 60; i++) a.update(1 / 60);
  b.update(1); close(a.getState().position.z, b.getState().position.z); close(a.getState().position.x, b.getState().position.x);
  a.dispose(); b.dispose();
  const shore = planJourney({ fromSceneId: 'SC03', toSceneId: 'SC05', fromPosition: { x: 1.5, y: 0, z: 60 }, toPosition: destination });
  assert(shore); assert.equal(shore.fromGateway.side, 'entry'); assert.equal(shore.toGateway.side, 'exit'); assert(shore.destinationOffset.z > 20);
  assert(shore.waypoints.every(p => p.z > 46.5));
});

test('gateway opens only intersecting wall instances and restores them without disposing original art', () => {
  const area = new THREE.Group(), geometry = new THREE.BoxGeometry(1, 1, 1), material = new THREE.MeshStandardMaterial();
  const walls = new THREE.InstancedMesh(geometry, material, 2), matrix = new THREE.Matrix4();
  walls.setMatrixAt(0, matrix.compose(new THREE.Vector3(0, 2.5, -11.4), new THREE.Quaternion(), new THREE.Vector3(19, 5, .3)));
  walls.setMatrixAt(1, matrix.compose(new THREE.Vector3(8, 2.5, 0), new THREE.Quaternion(), new THREE.Vector3(.3, 5, 15))); area.add(walls);
  const first = new THREE.Matrix4(), second = new THREE.Matrix4(); walls.getMatrixAt(0, first); walls.getMatrixAt(1, second);
  let originalDisposed = 0; material.addEventListener('dispose', () => originalDisposed++);
  const gateway = configureGateway(area, 'exit', { sceneId: 'SC01' }); assert.equal(gateway.changedCount, 1);
  const untouched = new THREE.Matrix4(); walls.getMatrixAt(1, untouched); assert.deepEqual(untouched.elements, second.elements);
  gateway.dispose(); walls.getMatrixAt(0, untouched); assert.deepEqual(untouched.elements, first.elements); assert.equal(originalDisposed, 0);
  gateway.dispose(); geometry.dispose(); material.dispose();
});

test('real station, train and school doorways have a clear body and shoulder-camera passage', () => {
  for (const sceneId of ['SC01', 'SC02', 'SC04', 'SC05', 'SC06', 'SC07', 'SC10', 'SC13', 'SC14', 'SC15']) {
    const area = new THREE.Group(), env = createSceneEnvironment(sceneId, area), plan = planJourney({ fromSceneId: sceneId, toSceneId: 'SC05', fromPosition: { x: 0, y: 0, z: 6 }, toPosition: destination });
    const gate = configureGateway(area, 'exit', { sceneId }); area.updateMatrixWorld(true);
    for (const x of [0, .62]) {
      const ray = new THREE.Raycaster(new THREE.Vector3(x, 1.75, plan.fromGateway.z + 1.7), new THREE.Vector3(0, 0, -1), 0, 3.4);
      const blocking = ray.intersectObject(area, true).filter(hit => {
        let node = hit.object; while (node) { if (!node.visible) return false; node = node.parent; }
        return ![].concat(hit.object.material ?? []).some(material => material.transparent);
      });
      assert.equal(blocking.length, 0, `${sceneId} x=${x}: ${blocking.map(h => h.object.geometry.type + ':' + h.point.z.toFixed(2))}`);
    }
    gate.dispose(); env.dispose();
  }
});

test('boat remains docked, seats share its anchor, and landing blends without teleporting', () => {
  const motion = createBoatMotion(); assert.equal(motion.getPose().phase, 'moored');
  motion.setEscort({ kind: 'boat', progress: .1, position: { x: 1.2, z: -.9 } });
  for (let i = 0; i < 60; i++) motion.update(1 / 60);
  assert.equal(motion.getPose().seated, true); assert(motion.getPose().rowing > .9);
  assert.notDeepEqual(motion.getPose('guide').position, motion.getPose().position);
  motion.setEscort({ kind: 'boat', progress: 1, position: { x: -1.5, z: -4 } });
  const before = motion.getPose().position; motion.update(1 / 60); const after = motion.getPose().position;
  assert(Math.hypot(after.x - before.x, after.z - before.z) < .7);
  motion.setEscort({ kind: 'escort', position: { x: -1.5, z: -4 } });
  for (let i = 0; i < 240; i++) motion.update(1 / 60);
  const dock = motion.getPose(); assert.equal(dock.phase, 'docked'); assert.equal(dock.seated, false); assert.equal(dock.disembarkProgress, 1); close(dock.position.y, 0); assert(dock.rowing < .001);
  assert(Math.abs(dock.boatPosition.z + 4) < .001); motion.setEscort(null); assert.equal(motion.getPose().phase, 'docked');
});

test('train scenery scrolls in world space, can stop, and releases every owned resource', () => {
  const scenery = createTrainScenery(), mesh = scenery.root.children[0], initial = mesh.position.z;
  scenery.update(1); assert.notEqual(mesh.position.z, initial); scenery.setStopped(true); const stopped = mesh.position.z; scenery.update(3); assert.equal(mesh.position.z, stopped);
  scenery.setStopped(false); scenery.update(200); assert(scenery.root.children.every(child => child.position.z >= -9.5 && child.position.z < 9.5), 'window scenery cannot leak into the previous scene');
  const geos = new Set(), materials = new Set(); scenery.root.traverse(o => { if (o.geometry) geos.add(o.geometry); if (o.material) materials.add(o.material); });
  let disposals = 0; [...geos, ...materials].forEach(r => r.addEventListener('dispose', () => disposals++)); scenery.dispose(); assert.equal(disposals, geos.size + materials.size); scenery.dispose(); assert.equal(disposals, geos.size + materials.size);
});
