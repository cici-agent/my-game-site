import test from 'node:test';
import assert from 'node:assert/strict';
import { getPlatformIntro, getPlatformWallAdvice } from '../chapter-one/client/platform-dialogue.mjs';

function snapshot(index = 0, id = 'harry-save') {
  return {
    character: { id, heroId: 'harry', name: '旅行者', areaId: 'SC01', sceneId: 'SC01', currentQuestId: 'M01', objectiveIndex: index, completedQuestIds: [] },
    view: { areaId: 'SC01', sceneId: 'SC01', quest: { id: 'M01' }, serverTime: 1000,
      targets: [{ id: 'M01-1', active: index === 0, completed: index > 0 }, { id: 'M01-2', active: index === 1, completed: false }],
      escort: index === 0 ? { targetId: 'M01-1', awaitingStart: true } : null },
  };
}
const interact = { type: 'interact', targetId: 'M01-1' };

test('the waiting station guide offers the ticket question and an explicit follow confirmation', () => {
  const { character, view } = snapshot();
  const intro = getPlatformIntro(character, view, interact);
  assert.equal(intro.npc, '韦斯莱夫人');
  assert.equal(intro.lines[0].speaker, '哈利');
  assert.match(intro.lines[0].text, /车票.*九又四分之三.*9.*10/);
  assert.match(intro.lines[1].text, /跟我走/);
  assert.equal(intro.lines[1].speaker, intro.npc);
  assert.equal(intro.confirmLabel, '跟随韦斯莱夫人');
});

test('closing the introduction does not consume the interaction or alter saved progress', () => {
  const state = snapshot(), before = structuredClone(state);
  const first = getPlatformIntro(state.character, state.view, interact);
  first.lines[1].text = 'caller-owned display';
  const reopened = getPlatformIntro(state.character, state.view, interact);
  assert.match(reopened.lines[1].text, /跟我走/);
  assert.deepEqual(state, before);
  assert.deepEqual(interact, { type: 'interact', targetId: 'M01-1' });
});

test('only the live first objective and matching interaction can open the introduction', () => {
  const patches = [
    state => { state.view.escort.awaitingStart = false; },
    state => { state.view.escort.targetId = 'M03-1'; },
    state => { state.view.escort = null; },
    state => { state.view.targets[0].active = false; },
    state => { state.view.targets[0].completed = true; },
    state => { state.character.objectiveIndex = 1; },
    state => { state.character.currentQuestId = 'M02'; },
    state => { state.view.quest.id = 'M02'; },
    state => { state.character.activity = { questId: 'M03', objectiveIndex: 0 }; },
    state => { state.character.completedQuestIds = ['M01']; },
    state => { state.character.chapterComplete = true; },
  ];
  for (const patch of patches) {
    const state = snapshot(); patch(state);
    assert.equal(getPlatformIntro(state.character, state.view, interact), null);
  }
  const { character, view } = snapshot();
  for (const action of [null, { type: 'travel', targetId: 'M01-1' }, { type: 'interact', targetId: 'M01-2' }]) {
    assert.equal(getPlatformIntro(character, view, action), null);
  }
  assert.equal(getPlatformIntro(null, null, interact), null);
});

test('the selected playable identity speaks without renaming the existing guide', () => {
  const { character, view } = snapshot();
  for (const [heroId, speaker] of [['ron', '罗恩'], ['hermione', '赫敏']]) {
    const intro = getPlatformIntro({ ...character, heroId }, view, interact);
    assert.equal(intro.lines[0].speaker, speaker);
    assert.equal(intro.npc, '韦斯莱夫人');
  }
});

test('Ron asks his mother naturally while Harry and Hermione keep the newcomer conversation', () => {
  const { character, view } = snapshot();
  const ron = getPlatformIntro({ ...character, heroId: 'ron' }, view, interact);
  assert.match(ron.lines[0].text, /^妈妈，.*车票.*九又四分之三.*9.*10.*怎么过去/);
  assert.match(ron.lines[1].text, /第一次去霍格沃茨.*跟我走.*入口/);
  assert.equal(ron.npc, '韦斯莱夫人');
  assert.equal(ron.lines[1].speaker, '韦斯莱夫人');
  for (const heroId of ['harry', 'hermione']) {
    const intro = getPlatformIntro({ ...character, heroId }, view, interact);
    assert.match(intro.lines[0].text, /^打扰一下，/);
    assert.doesNotMatch(intro.lines[0].text, /妈妈/);
    assert.equal(intro.lines[1].text, '第一次来，是不是？别担心，跟我走。我带你去找入口。');
  }
});

test('reaching the brick wall and resuming there give the advice once per accepted stage entry', () => {
  const first = snapshot(0), wall = snapshot(1), laterPoll = structuredClone(wall);
  wall.view.serverTime = 2000; laterPoll.view.serverTime = 3000;
  const advice = getPlatformWallAdvice(first, wall);
  assert.equal(advice.npc, '韦斯莱夫人');
  assert.match(advice.text, /砖墙.*勇敢.*穿过去.*九又四分之三/);
  assert.deepEqual(getPlatformWallAdvice(null, wall), advice);
  assert.equal(getPlatformWallAdvice(wall, laterPoll), null);
  assert.equal(getPlatformWallAdvice(laterPoll, laterPoll), null);
  assert.equal(getPlatformWallAdvice(null, first), null);
  assert.equal(getPlatformWallAdvice(wall, null), null);
});

test('a different saved character may receive their own wall advice', () => {
  assert(getPlatformWallAdvice(snapshot(1, 'first-save'), snapshot(1, 'second-save')));
});

test('neither dialogue leaks across areas or a stale area/view pairing', () => {
  for (const change of [
    state => { state.character.areaId = 'PLATFORM_LONDON'; },
    state => { state.view.areaId = 'PLATFORM_LONDON'; },
    state => { delete state.character.areaId; state.character.visitSceneId = 'SC03'; },
    state => { delete state.view.areaId; state.view.sceneId = 'SC03'; },
  ]) {
    const first = snapshot(); change(first);
    assert.equal(getPlatformIntro(first.character, first.view, interact), null);
    const wall = snapshot(1); change(wall);
    assert.equal(getPlatformWallAdvice(null, wall), null);
  }
  const left = snapshot(1); left.character.areaId = left.view.areaId = 'PLATFORM_LONDON';
  assert(getPlatformWallAdvice(left, snapshot(1)), 'returning to the still-unfinished wall can remind the player');
});

test('completed quests and stale snapshots cannot produce a new wall instruction', () => {
  const wall = snapshot(1), done = snapshot(1);
  done.character.completedQuestIds = ['M01'];
  assert.equal(getPlatformWallAdvice(wall, done), null);
  const previous = snapshot(0); previous.view.serverTime = 3000;
  assert.equal(getPlatformWallAdvice(previous, wall), null);
  const before = structuredClone(wall);
  getPlatformWallAdvice(null, wall);
  assert.deepEqual(wall, before);
});

test('legacy scene-only saves still receive the introduction in the real station', () => {
  const state = snapshot(); delete state.character.areaId; delete state.view.areaId;
  assert(getPlatformIntro(state.character, state.view, interact));
});
