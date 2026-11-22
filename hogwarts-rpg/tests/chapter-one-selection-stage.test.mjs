import test from 'node:test';
import assert from 'node:assert/strict';
import { Group, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
import { createSelectionStage, selectionCameraPose } from '../chapter-one/client/selection-stage.mjs';

const heroes = ['harry', 'ron', 'hermione'];
const duration = 76 / 24;
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

function fakeActor(heroId) {
  const root = new Group(); root.name = heroId;
  const calls = { reset: [], travel: [], cast: [], cancel: [], dispose: 0, expression: [] };
  let casting = null, lastCastTime = 0;
  return {
    root, walkSpeed: 1.3, runSpeed: 2.8, calls,
    get casting() { return casting; },
    resetPresentation(snapshot = {}) {
      calls.reset.push(snapshot); casting = null; lastCastTime = 0;
      if (snapshot.position) root.position.fromArray(snapshot.position);
      if (Number.isFinite(snapshot.yaw)) root.rotation.y = snapshot.yaw;
    },
    updateTravel(dt, distance = 0, grounded = true, velocity = 0) {
      calls.travel.push({ dt, distance, grounded, velocity });
      if (distance > 1e-6 && casting) { calls.cancel.push({ id: casting.id, reason: 'travel' }); casting = null; }
      if (casting) {
        casting.time += dt; lastCastTime = casting.time;
        if (casting.time >= duration) casting = null;
      }
    },
    playStudioCast(id) { if (casting) return false; casting = { id, time: 0 }; lastCastTime = 0; calls.cast.push(id); return true; },
    cancelAction(id, reason) { calls.cancel.push({ id, reason }); if (casting?.id !== id) return false; casting = null; return true; },
    setExpressionContext(value) { calls.expression.push(value); },
    getCastOriginWorld(out = new Vector3()) { root.updateWorldMatrix(true, false); return out.set(0, 1.2, -.3).applyMatrix4(root.matrixWorld); },
    debugSnapshot() { return { actionId: casting?.id ?? null, clips: { Cast: { duration, time: casting?.time ?? lastCastTime, weight: casting ? 1 : 0, timeScale: 1 } } }; },
    dispose() { calls.dispose++; root.removeFromParent(); },
  };
}

function fakeSpells() {
  const calls = { prepare: [], begin: [], update: [], cancel: 0, reset: 0, dispose: 0 };
  return {
    root: new Group(), calls, active: false,
    prepare(...args) { calls.prepare.push(args); },
    begin(...args) { calls.begin.push(args); },
    update(...args) { calls.update.push(args); },
    cancel() { calls.cancel++; }, reset() { calls.reset++; }, dispose() { calls.dispose++; },
    debugSnapshot() { return { active: false }; },
  };
}

function setup(t, loader) {
  const actors = new Map(heroes.map(id => [id, fakeActor(id)])), loads = new Map(heroes.map(id => [id, 0])), spells = fakeSpells();
  const loadCharacter = id => { loads.set(id, loads.get(id) + 1); return loader ? loader(id, actors.get(id), loads.get(id)) : Promise.resolve(actors.get(id)); };
  const stage = createSelectionStage({ loadCharacter, spells }); t.after(() => stage.dispose());
  return { stage, actors, loads, spells };
}
function step(stage, seconds, aspect = 1.6) { for (let left = seconds; left > 1e-9; left -= 1 / 60) stage.update(Math.min(1 / 60, left), { aspect }); }
function until(stage, predicate, seconds = 12) { for (let frame = 0; frame < seconds * 60 && !predicate(); frame++) stage.update(1 / 60, { aspect: 1.6 }); assert(predicate(), 'stage did not reach the required observable state'); }
const entry = (stage, id) => stage.getState().actors.find(actor => actor.heroId === id);
function containedBy(node, parent) { for (let current = node; current; current = current.parent) if (current === parent) return true; return false; }

test('selection stage loads all three concurrently, coalesces in-flight requests and retains the resident pool', async t => {
  const gates = new Map(heroes.map(id => [id, deferred()]));
  const { stage, actors, loads } = setup(t, id => gates.get(id).promise);
  const first = stage.prepare('harry'), repeated = stage.prepare('harry');
  await Promise.resolve();
  assert.deepEqual([...loads.values()], [1, 1, 1]); assert.equal(stage.getState().ready, false);
  for (const id of heroes) gates.get(id).resolve(actors.get(id));
  await Promise.all([first, repeated]);
  assert.equal(stage.getState().ready, true); assert.equal(stage.getState().actorCount, 3);
  await stage.prepare('ron'); assert.deepEqual([...loads.values()], [1, 1, 1]);
  for (const id of heroes) assert.equal(stage.getActor(id), actors.get(id));
});

test('a failed character can be retried without reloading or disposing successful characters', async t => {
  const { stage, actors, loads } = setup(t, (id, actor, attempt) => id === 'ron' && attempt === 1 ? Promise.reject(new Error('fixture network failure')) : Promise.resolve(actor));
  await assert.rejects(stage.prepare('harry'), AggregateError);
  assert.equal(stage.getState().ready, false); assert.equal(stage.getState().actorCount, 2);
  assert.equal(stage.getActor('harry'), actors.get('harry')); assert.equal(stage.getActor('hermione'), actors.get('hermione'));
  await stage.prepare('ron'); assert.equal(stage.getState().ready, true);
  assert.deepEqual([...loads.values()], [1, 2, 1]);
  for (const actor of actors.values()) assert.equal(actor.calls.dispose, 0);
});

test('each walking animation receives the actual distance moved, including a superseded selection returning home', async t => {
  const { stage, actors } = setup(t); await stage.prepare('harry'); step(stage, .45); stage.select('ron');
  const totals = new Map(heroes.map(id => [id, 0]));
  for (let frame = 0; frame < 180; frame++) {
    const before = new Map(heroes.map(id => [id, { p: actors.get(id).root.position.clone(), calls: actors.get(id).calls.travel.length }]));
    stage.update(1 / 60, { aspect: 1.6 });
    for (const id of heroes) {
      const actor = actors.get(id), prior = before.get(id), p = actor.root.position;
      const distance = Math.hypot(p.x - prior.p.x, p.z - prior.p.z);
      const animated = actor.calls.travel.slice(prior.calls).reduce((sum, call) => sum + call.distance, 0);
      assert(Math.abs(distance - animated) < 1e-8, `${id}: geometry and stride must agree`); totals.set(id, totals.get(id) + distance);
    }
  }
  assert(totals.get('harry') > .1); assert(totals.get('ron') > 1);
});

test('the full studio cast emits one spell at the published release rather than at the approach or windup', async t => {
  const { stage, actors, spells } = setup(t); await stage.prepare('harry');
  const harry = actors.get('harry'); until(stage, () => Boolean(harry.casting));
  assert.equal(entry(stage, 'harry').releases, 0); assert.equal(spells.calls.begin.length, 0);
  until(stage, () => (harry.casting?.time ?? 0) >= 2.38);
  assert.equal(entry(stage, 'harry').releases, 0);
  step(stage, .12); assert.equal(entry(stage, 'harry').releases, 1);
  assert.equal(spells.calls.begin.length, 1); assert.equal(spells.calls.begin[0][0], 'harry');
  step(stage, 4); assert.equal(entry(stage, 'harry').releases, 1); assert.equal(spells.calls.begin.length, 1);
});

test('switching cancels an unfinished cast and selecting the same character explicitly replays it', async t => {
  const { stage, actors, spells, loads } = setup(t); await stage.prepare('harry');
  const harry = actors.get('harry'), ron = actors.get('ron'); until(stage, () => Boolean(harry.casting)); step(stage, .6);
  const previousDisplay = entry(stage, 'harry').displayId;
  stage.select('ron'); until(stage, () => entry(stage, 'ron').releases === 1);
  assert.equal(entry(stage, 'harry').releases, 0);
  assert(harry.calls.cancel.some(call => call.id === previousDisplay)); assert.equal(harry.casting, null);
  const firstRonDisplay = entry(stage, 'ron').displayId, castCount = ron.calls.cast.length;
  stage.select('ron'); until(stage, () => ron.calls.cast.length > castCount);
  assert.notEqual(entry(stage, 'ron').displayId, firstRonDisplay);
  until(stage, () => entry(stage, 'ron').releases === 2);
  assert.deepEqual(spells.calls.begin.map(args => args[0]), ['ron', 'ron']); assert.deepEqual([...loads.values()], [1, 1, 1]);
});

test('entering the game and returning reuses all instances without moving a leased gameplay actor', async t => {
  const { stage, actors, loads } = setup(t); await stage.prepare('hermione'); step(stage, .5);
  const initialMode = stage.getState().mode, original = actors.get('hermione'), leased = stage.enterGameplay('hermione');
  assert.equal(leased, original); assert.equal(containedBy(leased.root, stage.root), false); assert.notEqual(stage.getState().mode, initialMode);
  leased.root.position.set(7, 2, -4); const travelCount = leased.calls.travel.length;
  step(stage, 2); assert.deepEqual(leased.root.position.toArray(), [7, 2, -4]); assert.equal(leased.calls.travel.length, travelCount);
  stage.returnToStage('hermione'); assert.equal(stage.getState().mode, initialMode);
  assert.notDeepEqual(leased.root.position.toArray(), [7, 2, -4]);
  for (const id of heroes) { assert.equal(stage.getActor(id), actors.get(id)); assert(containedBy(actors.get(id).root, stage.root)); assert.equal(actors.get(id).calls.dispose, 0); }
  assert.deepEqual([...loads.values()], [1, 1, 1]);
});

test('the last selection made during loading remains selected regardless of completion order', async t => {
  const gates = new Map(heroes.map(id => [id, deferred()]));
  const { stage, actors } = setup(t, id => gates.get(id).promise);
  const prepared = stage.prepare('harry'); stage.select('ron'); stage.select('hermione');
  await Promise.resolve();
  gates.get('hermione').resolve(actors.get('hermione')); await Promise.resolve();
  gates.get('harry').resolve(actors.get('harry')); gates.get('ron').resolve(actors.get('ron'));
  await prepared; assert.equal(stage.getState().selected, 'hermione');
  until(stage, () => Boolean(actors.get('hermione').casting));
  assert.equal(actors.get('harry').calls.cast.length, 0); assert.equal(actors.get('ron').calls.cast.length, 0);
});

test('all three bodies can be picked and the resident pool is disposed exactly once', async t => {
  const { stage, actors, spells } = setup(t); await stage.prepare('harry'); stage.root.updateMatrixWorld(true);
  for (const id of heroes) {
    const at = actors.get(id).root.getWorldPosition(new Vector3()).add(new Vector3(0, 1, 0));
    const origin = new Vector3(0, 1.4, 7), ray = new Raycaster(origin, at.clone().sub(origin).normalize());
    assert.equal(stage.pick(ray), id);
  }
  assert.equal(stage.pick(new Raycaster(new Vector3(0, 10, 7), new Vector3(0, 1, 0))), null);
  stage.dispose(); stage.dispose();
  for (const actor of actors.values()) assert.equal(actor.calls.dispose, 1);
  assert.equal(spells.calls.dispose, 1);
});

test('a finished studio cast keeps its spell tail active until the effect itself finishes', async t => {
  const { stage, actors, spells } = setup(t); await stage.prepare('hermione');
  const hermione = actors.get('hermione');
  until(stage, () => Boolean(hermione.casting));
  spells.active = true;
  until(stage, () => hermione.casting === null);
  assert.equal(entry(stage, 'hermione').phase, 'effects');
  assert.equal(entry(stage, 'hermione').releases, 1);
  const cancelCount = spells.calls.cancel, updateCount = spells.calls.update.length;
  step(stage, 2);
  assert.equal(entry(stage, 'hermione').phase, 'effects');
  assert(spells.calls.update.length > updateCount, 'the trailing effect must continue receiving updates');
  assert.equal(spells.calls.cancel, cancelCount, 'finishing the body animation must not cancel the trailing spell');
  spells.active = false; step(stage, 1 / 60);
  assert.equal(entry(stage, 'hermione').phase, 'idle');
  assert.equal(spells.calls.begin.length, 1); assert.equal(hermione.calls.cast.length, 1);
  assert.equal(entry(stage, 'hermione').releases, 1);
});

test('selection cameras keep all three full bodies visible and selectable on wide and narrow screens', async t => {
  for (const [label, aspect] of [['wide', 16 / 9], ['narrow', 350 / 900]]) {
    await t.test(label, async t => {
      const { stage, actors } = setup(t); await stage.prepare('harry');
      const pose = selectionCameraPose(aspect), camera = new PerspectiveCamera(48, aspect, .07, 180);
      camera.position.fromArray(pose.eye); camera.lookAt(...pose.focus);
      camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
      for (const selected of heroes) {
        stage.select(selected); step(stage, 7, aspect); stage.root.updateMatrixWorld(true);
        for (const id of heroes) {
          const actorRoot = actors.get(id).root;
          for (const [part, y] of [['feet', 0], ['head', 1.96]]) {
            const screen = new Vector3(0, y, 0).applyMatrix4(actorRoot.matrixWorld).project(camera);
            for (const axis of ['x', 'y', 'z']) {
              assert(Number.isFinite(screen[axis]) && Math.abs(screen[axis]) < 1,
                `${label}, selected ${selected}: ${id} ${part} must remain within the camera on ${axis}`);
            }
          }
          const body = new Vector3(0, 1, 0).applyMatrix4(actorRoot.matrixWorld).project(camera);
          const ray = new Raycaster(); ray.setFromCamera(new Vector2(body.x, body.y), camera);
          assert.equal(stage.pick(ray), id, `${label}, selected ${selected}: ${id} must remain directly selectable`);
        }
      }
    });
  }
});
