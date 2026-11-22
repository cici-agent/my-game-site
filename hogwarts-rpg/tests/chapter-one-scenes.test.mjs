import test from 'node:test';
import assert from 'node:assert/strict';
import { Scene, Group, Mesh, MeshStandardMaterial, BoxGeometry, Texture, SRGBColorSpace, NoColorSpace } from 'three';
import { bindEnvironmentMaterials } from '../chapter-one/client/scene-materials.mjs';
import { runtimeQuests, getSceneView } from '../chapter-one/online/catalog.mjs';
import { createRoom, roomTargets } from '../chapter-one/dungeons/stone-route.mjs';
import { createSceneEnvironment } from '../chapter-one/client/scene-environment.mjs';
import { getSceneNavigation, sceneNavigationIds } from '../chapter-one/client/scene-navigation.mjs';
import { getWorldArea, questAreaId, routeBetween } from '../chapter-one/world-atlas.mjs';
import { canOccupy, moveWithCollisions, standingFloor, cameraCollisionFraction, telegraphDescriptor, telegraphDescriptors, visibleTargets, correctionPlan, sceneNpcTargets, chaseCameraPose, visiblePartyMembers, nameplateWidth } from '../chapter-one/client/scene-geometry.mjs';

// Real geometry/layout construction, without an image decoder or GPU. Canvas
// text and texture pixels are intentionally not claimed as visually verified.
const context = new Proxy({ measureText: text => ({ width: String(text).length * 12 }), createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }) }, { get: (object, key) => key in object ? object[key] : () => {} });
globalThis.document = { createElement: () => ({ width: 512, height: 512, getContext: () => context }) };

function reachable(layout, start, target) {
  const step = .4, [minX, maxX, minZ, maxZ] = layout.bounds;
  const queue = [start], visited = new Set();
  const key = p => `${Math.round((p.x - start.x) / step)}:${Math.round((p.z - start.z) / step)}`;
  visited.add(key(start));
  for (let cursor = 0; cursor < queue.length && cursor < 15000; cursor++) {
    const p = queue[cursor];
    if (Math.hypot(p.x - target.position.x, p.z - target.position.z) <= (target.radius ?? target.range ?? 2) - .15) return p;
    for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
      const next = { x: p.x + dx, y: 0, z: p.z + dz };
      if (next.x < minX + .3 || next.x > maxX - .3 || next.z < minZ + .3 || next.z > maxZ - .3 || visited.has(key(next))) continue;
      const resolved = moveWithCollisions(p, next, layout.bounds, layout.walls);
      if (Math.hypot(resolved.x - next.x, resolved.z - next.z) > .01) continue;
      visited.add(key(next)); queue.push(next);
    }
  }
  return null;
}

test('shared navigation matches the actual sixteen scene environments, including furniture and water', () => {
  assert.equal(sceneNavigationIds.length, 16);
  for (const sceneId of sceneNavigationIds) {
    const scene = new Scene(), group = new Group(); scene.add(group);
    const env = createSceneEnvironment(sceneId, group, { questId: sceneId === 'SC14' ? 'M28' : undefined });
    const layout = getSceneNavigation(sceneId);
    assert.deepEqual(env.bounds, layout.bounds, sceneId);
    assert.deepEqual(env.walls, layout.walls, sceneId);
    const [spawnX,spawnZ]=env.spawn;assert(canOccupy({ x: spawnX, y: 0, z: spawnZ }, layout.walls), `${sceneId} spawn clear`);
    env.dispose();
  }
});

test('all 36 authored main quests and the six underground mechanism rooms have reachable interaction zones', () => {
  for (const quest of runtimeQuests) {
    let area=getWorldArea(quest.objectives[0]?.areaId??questAreaId(quest.id)),at={...area.spawn};
    const character={completedQuestIds:runtimeQuests.slice(0,Number(quest.id.slice(1))-1).map(q=>q.id)};
    const targets = ['M28', 'M29', 'M30', 'M31', 'M32', 'M33'].includes(quest.id)
      ? roomTargets(createRoom({ roomId: quest.id, runId: 'layout-check', playerIds: ['player'], now: 0 }))
      : quest.objectives;
    for (const target of targets) {
      const destination=getWorldArea(target.areaId??questAreaId(quest.id));
      if(destination.id!==area.id){
        const route=routeBetween(area.id,destination.id,character);assert(route?.length,`${quest.id}/${target.id} has a real unlocked route`);
        at={...route.at(-1).arrival};area=destination;
      }
      const layout=area.navigation;
      if (target.kind === 'boat') { at = { ...target.position, y: 0 }; assert(canOccupy(at, layout.walls), 'boat endpoint on shore'); continue; }
      const next = reachable(layout, at, target);
      assert(next, `${quest.id}/${target.id} in ${area.id} cannot reach its real interaction radius`); at = next;
    }
  }
});

test('movement cannot tunnel through furniture or water, slides alongside walls and can land on a low top', () => {
  const wall = [{ x: 0, z: 0, w: 1, d: 5, height: 1 }];
  const moved = moveWithCollisions({ x: -2, y: 0, z: 0 }, { x: 2, y: 0, z: 1 }, [-5, 5, -5, 5], wall);
  assert(moved.x < -.79); assert(moved.z > .9);
  assert.equal(standingFloor({ x: 0, y: .98, z: 0 }, 1.1, wall), 1);
  assert.equal(standingFloor({ x: 0, y: .1, z: 0 }, .2, wall), 0);
  const lake = getSceneNavigation('SC03');
  assert(moveWithCollisions({ x: 0, y: 0, z: 46 }, { x: 0, y: 0, z: 40 }, lake.bounds, lake.walls).z >= 45.299);
  assert(cameraCollisionFraction({ x: -2, y: .5, z: 0 }, { x: 2, y: .5, z: 0 }, wall) < .5);
});

test('telegraphs represent the authoritative circle aim, swept line width and 1.6 rad cone', () => {
  const circle = telegraphDescriptor({ shape: 'circle', origin: { x: 0, z: 0 }, aim: { x: 5, z: 6 }, radius: 1.3 });
  assert.deepEqual([circle.x, circle.z, circle.radius], [5, 6, 1.3]);
  const line = telegraphDescriptor({ shape: 'line', origin: { x: 1, z: 2 }, direction: { x: 1, z: 0 }, radius: .24, range: 10 });
  assert.deepEqual([line.x, line.z, line.width, line.length], [6, 2, .48, 10]);
  const cone = telegraphDescriptor({ shape: 'cone', origin: { x: 3, z: 4 }, direction: { x: 0, z: -1 }, range: 3.7 });
  assert.equal(cone.arc, 1.6); assert.equal(cone.radius, 3.7);
});

test('real server targets expose moving escorts and enabled boss mechanisms without an early exit', () => {
  const character = { currentQuestId: 'M01', objectiveIndex: 0, completedQuestIds: [], collectionIds: [], position: { x: 0, y: 0, z: 6 }, escortOrigin: { x: 0, y: 0, z: 6 } };
  const scene = getSceneView(character, 1000), targets = visibleTargets(scene, null);
  assert.equal(targets.some(t => t.id === 'exit'), false);
  if (scene.escort) assert.deepEqual(targets.find(t => t.id === scene.escort.targetId).position, scene.escort.position);
  const combat = { status: 'active', mechanismTargets: [{ id: 'club', name: '漂浮木棒', position: { x: 1, z: -1 }, range: 8, enabled: true, complete: false }, { id: 'rescue-point', position: { x: 3, z: 1 }, enabled: false, complete: false }] };
  const props = visibleTargets(scene, combat);
  assert.equal(props.find(t => t.id === 'club').skillId, 'levitate'); assert.equal(props.find(t => t.id === 'rescue-point').active, false);
  assert.equal(visibleTargets(scene, { status: 'won' })[0].actionType, 'retry');
});

test('only acknowledged prediction errors correct position; old polls never stall movement', () => {
  const local = { x: 1.2, z: 0 }, server = { x: 0, z: 0 };
  for (let n = 0; n < 10; n++) assert.equal(correctionPlan(local, server, server, n).mode, 'none');
  const plan = correctionPlan(local, server, server, 0, { acknowledgedSequence: 2, previousAcknowledgedSequence: 1, acknowledgedPosition: { x: .5, z: 0 } });
  assert.equal(plan.mode, 'smooth'); assert.equal(plan.target.x, .7);
  assert.equal(correctionPlan({ x: 8, z: 0 }, server, server, 0, { acknowledgedSequence: 2, previousAcknowledgedSequence: 2 }).mode, 'none');
});


test('every authoritative multi-target area is shown and each local NPC service keeps its own actor', () => {
  const warnings = telegraphDescriptors({ shape: 'circle', radius: 1.4, aim: { x: 99, z: 99 }, areas: [{ x: 0, z: 2 }, { x: 4, z: -2 }, { x: -5, z: 4 }] });
  assert.deepEqual(warnings.map(w => [w.x, w.z]), [[0, 2], [4, -2], [-5, 4]]);
  const character = { currentQuestId: 'M05', objectiveIndex: 0, completedQuestIds: ['M01', 'M02', 'M03', 'M04'], collectionIds: [], sceneId: 'SC04', visitSceneId: 'SC04', position: { x: 0, y: 0, z: 6 } };
  const view = getSceneView(character, 2000), npcs = sceneNpcTargets(view, null);
  assert(view.services.length >= 3);
  for (const service of view.services) assert(npcs.some(n => n.name === service.name), service.name);
  assert.equal(new Set(npcs.map(n => n.name)).size, npcs.length);
  assert.deepEqual(sceneNpcTargets(view, { status: 'active' }), []);
  const escort = { quest: { npc: '海格' }, targets: [{ id: 'walk', kind: 'escort', active: true }], escort: { npc: '海格', targetId: 'walk', kind: 'escort', position: { x: 1.8, z: 6 }, progress: .38, waitingForPlayer: false } };
  assert.match(visibleTargets(escort, null)[0].label, /跟上海格/);
  escort.escort.waitingForPlayer = true; assert.match(visibleTargets(escort, null)[0].label, /停下等你/);
});

test('PBR binding is environment-only, uses correct map colour spaces and cancels a disposed scene load', async () => {
  const original = new MeshStandardMaterial({ color: 0xb0b0b0 }), geometry = new BoxGeometry(), parent = new Group(), environment = new Group(); parent.add(environment);
  const floor = new Mesh(geometry, original), protectedCharacter = new Mesh(geometry, original); environment.add(floor); parent.add(protectedCharacter);
  floor.userData.environmentSurface = { kind: 'floor', repeat: [2, 3] };
  const manifest = { materials: { floor: { maps: Object.fromEntries(['albedo', 'normal', 'roughness'].map(k => [k, { url: k }])) } } }, sources = new Map();
  const readers = { loadManifest: async () => manifest, loadTexture: async url => { if (!sources.has(url)) sources.set(url, new Texture()); return sources.get(url); } };
  const binding = bindEnvironmentMaterials(environment, readers); const result = await binding.ready;
  assert.equal(result.applied, 1); assert.equal(protectedCharacter.material, original); assert.notEqual(floor.material, original);
  assert.equal(floor.material.map.colorSpace, SRGBColorSpace); assert.equal(floor.material.normalMap.colorSpace, NoColorSpace); assert.equal(floor.material.roughnessMap.colorSpace, NoColorSpace);
  assert.deepEqual(floor.material.map.repeat.toArray(), [2, 3]);
  binding.dispose(); assert.equal(floor.material, original);
  let finish; const late = bindEnvironmentMaterials(environment, { ...readers, loadManifest: () => new Promise(resolve => { finish = resolve; }) });
  late.dispose(); finish(manifest); assert.equal((await late.ready).disposed, true); assert.equal(floor.material, original);
  sources.forEach(texture => texture.dispose()); original.dispose(); geometry.dispose();
});


test('shoulder camera leaves the reticle beside the player and water never collapses the boat camera', () => {
  const pose = chaseCameraPose({ x: 0, y: 0, z: 0 }, 0, .10, 4.8);
  assert(pose.eye.x > .5); assert(pose.direction.z < -.99);
  const atPlayer = (0 - pose.eye.z) / pose.direction.z;
  assert(Math.abs(pose.eye.x + pose.direction.x * atPlayer) > .5);
  const atEnemy = (-6 - pose.eye.z) / pose.direction.z;
  assert(pose.eye.y + pose.direction.y * atEnemy > .5);
  assert(pose.eye.y + pose.direction.y * atEnemy < 1.4);
  const lake = getSceneNavigation('SC03');
  assert.equal(cameraCollisionFraction({ x: 0, y: 1, z: -2 }, { x: 1, y: 2, z: 2 }, lake.walls), 1);
  const view = { quest: { npc: '麦格教授、级长、弗立维教授' }, targets: [{ id: 'talk', active: true, kind: 'talk', label: '弗立维教授：确认课程完成', position: { x: 1, z: 1 } }] };
  assert.equal(sceneNpcTargets(view, null)[0].name, '弗立维教授');
  view.targets[0].label = '确认课程完成'; assert.equal(sceneNpcTargets(view, null)[0].name, '麦格教授');
});


test('offline and non-participating friends never enter personal arenas, and labels stay within a viewport fraction', () => {
  const me = { id: 'self', sceneId: 'SC04' }, members = [{ id: 'self', sceneId: 'SC04', lastSeenAt: 99900 }, { id: 'online', sceneId: 'SC04', lastSeenAt: 99900 }, { id: 'offline', sceneId: 'SC04', lastSeenAt: 60000 }, { id: 'elsewhere', sceneId: 'SC08', lastSeenAt: 99900 }];
  assert.deepEqual(visiblePartyMembers({ members }, me, null, 100000).map(m => m.id), ['online']);
  assert.deepEqual(visiblePartyMembers({ members }, me, { status: 'active', players: { self: {} } }, 100000), []);
  assert.deepEqual(visiblePartyMembers({ members }, me, { status: 'active', players: { self: {}, online: {} } }, 100000).map(m => m.id), ['online']);
  for (const aspect of [350/900, 1440/900]) for (const distance of [1, 3, 8]) {
    const width = nameplateWidth(distance, 48, aspect);
    assert(width <= 1.25); assert(width / (distance * 2 * Math.tan(48 * Math.PI / 360) * aspect) <= .14 + 1e-8);
  }
});
