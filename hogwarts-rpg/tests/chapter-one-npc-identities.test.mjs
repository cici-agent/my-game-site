import test from 'node:test';
import assert from 'node:assert/strict';
import { npcAppearanceId, sceneNpcTargets, visibleTargets } from '../chapter-one/client/scene-geometry.mjs';
import { runtimeCatalog, runtimeQuests } from '../chapter-one/online/catalog.mjs';

test('named teachers, caretakers and students resolve to dedicated identities', () => {
  const names = {'霍琦夫人':'hooch','奥利弗·伍德':'wood','平斯夫人':'pince','阿格斯·费尔奇':'filch','德拉科·马尔福':'draco','奇洛教授':'quirrell','麦格教授':'mcgonagall','海格':'hagrid','费伦泽':'firenze','罗恩·韦斯莱':'ron','罗恩':'ron','赫敏':'hermione'};
  for (const [name,id] of Object.entries(names)) assert.equal(npcAppearanceId(name),id,name);
  assert.equal(npcAppearanceId('未命名的学校职员'),'generic');
  assert.equal(npcAppearanceId('平斯夫人负责书籍，斯普劳特负责草药'),'pince','the first speaker in a shared-role description wins');
});

test('the actual four service names have four distinct appearances and retain their target identities', () => {
  const serviceIds = runtimeCatalog.services.map(service=>npcAppearanceId(service.name));
  assert.deepEqual(serviceIds,['supply','gear','tools','post']);
  const targets=runtimeCatalog.services.map(service=>({id:service.serviceId,kind:'service',active:true,npc:service.name,position:service.position}));
  const actors=sceneNpcTargets({targets},null);
  assert.equal(actors.length,4);
  for(const target of targets) assert(actors.some(actor=>actor.targetId===target.id&&actor.name===target.npc&&actor.position===target.position));
  assert.deepEqual(sceneNpcTargets({targets},{status:'active'}),[],'services never appear inside an ongoing encounter');
});

test('an explicit dialogue speaker takes precedence over the first listed quest participant', () => {
  for(const name of ['霍琦夫人','伍德','平斯夫人','费尔奇','奇洛教授']) {
    const view={quest:{npc:'麦格教授、'+name},targets:[{id:'lesson',active:true,kind:'talk',label:name+'：继续谈话',position:{x:1,z:2}}]};
    const actor=sceneNpcTargets(view,null)[0];assert.equal(actor.name,name);assert.equal(actor.targetId,'lesson');
  }
});

test('M02 fills an unoccupied trio story seat without duplicating players or removing the dialogue target', () => {
  const quest = runtimeQuests.find(quest => quest.id === 'M02');
  const target = { ...quest.objectives.find(objective => objective.kind === 'talk'), active: true, completed: false };
  const view = { sceneId: quest.sceneId, quest: { id: quest.id, npc: quest.initiatorNpc }, targets: [target] };
  for (const [occupied, expected] of [
    [['harry'], 'ron'], [['ron'], 'hermione'], [['harry', 'ron'], 'hermione'],
    [['ron', 'hermione'], 'harry'], [['harry', 'ron', 'hermione'], null],
  ]) {
    const before = structuredClone(view), actors = sceneNpcTargets(view, null, occupied);
    assert.equal(actors.length, expected ? 1 : 0, occupied.join('+'));
    if (expected) {
      assert.equal(npcAppearanceId(actors[0].name), expected);
      assert(!occupied.includes(expected), 'the companion is not already controlled by a player');
      assert.equal(actors[0].targetId, target.id); assert.equal(actors[0].position, target.position);
    }
    const interaction = visibleTargets(view, null).find(candidate => candidate.id === 'M02-3');
    assert(interaction?.active); assert.equal(interaction.actionType, 'interact');
    assert.equal(interaction.position, target.position, 'the dialogue stays reachable even when the full trio needs no NPC');
    assert.deepEqual(view, before, 'choosing a presentation actor cannot mutate the authoritative quest target');
  }
});
