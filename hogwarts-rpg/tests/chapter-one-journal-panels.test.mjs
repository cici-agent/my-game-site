import test from 'node:test';
import assert from 'node:assert/strict';
import { contentData } from '../chapter-one/data/index.mjs';
import { DEFAULT_ARENA } from '../chapter-one/combat/geometry.mjs';
import { renderInventoryPanel, renderMagicPanel, renderMapPanel } from '../chapter-one/client/journal-panels.mjs';

const character = overrides => ({ id: 'player', heroId: 'harry', name: '巫师', level: 18, inventory: ['ITEM-GEAR-T2-WAND', 'ITEM-GEAR-T1-TOP'], equipment: { weapon: 'ITEM-GEAR-T1-WAND' }, potions: { health: 2, focus: 0 }, bagCapacity: 24, tools: ['ITEM-TOOL-SKETCHBOARD'], collectionItems: ['ITEM-COLLECT-CARD-01'], appearances: [], pendingClaims: [], wallet: { coins: 93, learningCredits: 2 }, skills: ['bolt', 'dodge'], completedQuestIds: ['M04', 'M10', 'M13'], currentQuestId: 'M14', sceneId: 'SC09', position: { x: 5, y: 0, z: 10, yaw: Math.PI / 2 }, ...overrides });
const total = (markup, expression) => [...markup.matchAll(expression)].length;

test('one inventory grid counts each nonempty potion type as one slot and keeps permanent records outside capacity', () => {
  const c = character(), before = structuredClone(c), html = renderInventoryPanel({ character: c });
  assert.match(html, /背包容量 <strong>3 \/ 24<\/strong>/);
  assert.equal(total(html, /class="journal-item-grid"/g), 1);
  assert.equal(total(html, /data-item-select=/g), 5);
  assert.equal(total(html, /journal-item journal-item-empty/g), 21);
  assert.match(html, /data-item-select="ITEM-POTION-HEALTH"[^>]*aria-label="[^"]*数量 2"/);
  assert.doesNotMatch(html, /data-item-select="ITEM-POTION-FOCUS"|独立药袋/);
  assert.equal(total(html, /data-permanent="true"/g), 2);
  assert.match(html, /永久收藏/);
  assert.deepEqual(c, before, 'rendering must not rearrange or spend inventory');
});

test('inventory filters and equipment details compare the actual occupied slot and preserve equip and claim contracts', () => {
  const c = character({ pendingClaims: [{ id: 'reward', choices: ['ITEM-GEAR-T2-TOP', 'ITEM-GEAR-T2-GLOVES-MAGIC'] }] });
  const html = renderInventoryPanel({ character: c, filter: 'equipment', selectedItemId: 'ITEM-GEAR-T2-WAND' });
  assert.equal(total(html, /data-item-select=/g), 2);
  assert.match(html, /data-equip="ITEM-GEAR-T2-WAND"/);
  assert.match(html, /与当前魔杖对比/);
  assert.match(html, /1阶魔杖校准/);
  assert.match(html, /class="journal-before">2<\/span>/);
  assert.match(html, /data-direction="up">\+2<\/strong>/);
  assert.equal(total(html, /data-claim="reward"/g), 2);
  const restricted = renderInventoryPanel({ character: { ...c, level: 1 }, selectedItemId: 'ITEM-GEAR-T2-WAND' });
  assert.match(restricted, /data-equip="ITEM-GEAR-T2-WAND" disabled/);
  const potions = renderInventoryPanel({ character: c, filter: 'consumables' });
  assert.equal(total(potions, /data-item-select=/g), 1);
  assert.match(potions, /最大生命的 30%/);
  assert.match(potions, /共享每场 1 次/);
});

test('magic book uses the selected character roster, permanent learning and exact content costs', () => {
  for (const [heroId, special] of [['harry', 'H1'], ['ron', 'R1'], ['hermione', 'M1']]) {
    const c = character({ heroId }), html = renderMagicPanel({ character: c, filter: 'signature', selectedSkillId: special });
    const definition = contentData.skills.find(skill => skill.id === special);
    assert.equal(total(html, /data-skill-select=/g), 1);
    assert.match(html, new RegExp(`data-skill-select="${special}"`));
    assert.match(html, new RegExp(`<dt>专注消耗<\/dt><dd>${definition.focusCost}<\/dd>`));
    assert.match(html, new RegExp(`<dt>技能冷却<\/dt><dd>${definition.cooldownSeconds} 秒<\/dd>`));
    assert.match(html, /完成「防御与救援|完成「/);
    assert.doesNotMatch(html, /data-skill-select="N1"|data-skill-select="G1"/);
  }
  const learned = renderMagicPanel({ character: character(), filter: 'learned' });
  assert.equal(total(learned, /data-skill-select=/g), 2);
  const trial = renderMagicPanel({ character: character({ skills: [], courseTrialSkillIds: ['levitate'] }), selectedSkillId: 'levitate' });
  assert.match(trial, /本课程可试用/);
  assert.match(trial, /起手 0.8 秒/);
  assert.match(trial, /2 秒引导/);
  assert.match(trial, /<strong>0<span> \/ 8<\/span>/, 'trial does not count as permanent mastery');
});

test('world atlas shows every playable scene, trusts supplied destinations, and only selects locations', () => {
  const c = character({ sceneId: 'SC04', completedQuestIds: ['M34'] }), html = renderMapPanel({ character: c, view: { sceneId: 'SC04', destinations: [{ sceneId: 'SC01' }] }, selectedSceneId: 'SC14' });
  assert.equal(total(html, /data-scene-select=/g), contentData.scenes.filter(scene => scene.id !== 'SC00').length);
  assert.doesNotMatch(html, /data-scene-select="SC00"|data-travel=/);
  assert.match(html, /data-scene-select="SC04" data-current="true" data-open="true"/);
  assert.match(html, /data-scene-select="SC14" data-current="false" data-open="false" data-selected="true"/);
  assert.match(html, /第一学年 · 世界路线图/);
  assert.match(html, /viewBox="0 0 880 540"/);
  assert.match(html, /此处只查看路线/);
});

test('local atlas projects actual bounds and coordinates and only shows teammates in the same scene', () => {
  const c = character({ sceneId: 'SC04' }), view = { sceneId: 'SC04', name: '礼堂', bounds: { minX: -10, maxX: 10, minZ: -20, maxZ: 20 }, serverTime: 1000, quest: { name: '课程' }, targets: [{ id: 'npc', label: '教授', kind: 'service', active: true, position: { x: 0, z: -10 } }, { id: 'exit', label: '出口', kind: 'exit', active: true, position: { x: 0, z: -7 } }] };
  const room = { members: [{ id: c.id, sceneId: 'SC04', position: c.position }, { id: 'friend', sceneId: 'SC04', name: '同行伙伴', position: { x: -5, z: -10 }, lastSeenAt: 900 }, { id: 'elsewhere', sceneId: 'SC09', name: '远处伙伴', position: { x: 0, z: 0 }, lastSeenAt: 900 }] };
  const html = renderMapPanel({ character: c, view, room, mode: 'local' });
  assert.match(html, /class="atlas-player" data-world-x="5" data-world-z="10" transform="translate\(366\.00 322\.00\)"/);
  assert.match(html, /rotate\(-90\.00\)/);
  assert.equal(total(html, /class="atlas-teammate"/g), 1);
  assert.match(html, /同行伙伴/); assert.doesNotMatch(html, /远处伙伴/);
  assert.match(html, /class="atlas-wall"/);
  assert.match(html, /data-kind="exit"/);
  assert.doesNotMatch(html, /data-travel=/);
});

test('local heading matches world movement: zero yaw faces north and positive quarter turn faces west', () => {
  for (const [yaw, rotation] of [[0, '0.00'], [Math.PI / 2, '-90.00']]) {
    const html = renderMapPanel({ character: character({ position: { x: 0, z: 0, yaw } }), mode: 'local' });
    const arrow = /class="atlas-player"[\s\S]*?<path transform="rotate\(([^)]+)\)"/.exec(html);
    assert.equal(arrow?.[1], rotation);
  }
});

test('battle map uses the combat arena bounds and real circular and box obstacles rather than exploration geometry', () => {
  const arena = { ...DEFAULT_ARENA, obstacles: [...DEFAULT_ARENA.obstacles, { id: 'test-wall', shape: 'box', minX: -2, maxX: 2, minZ: 4, maxZ: 6, height: 3 }] };
  const html = renderMapPanel({ character: character({ sceneId: 'SC04', position: { x: 0, z: 0, yaw: 0 }, encounter: { status: 'active', arena } }), view: { sceneId: 'SC04', bounds: { minX: -7, maxX: 7, minZ: -10, maxZ: 10 } }, mode: 'local' });
  // The authoritative 28m-square arena occupies a 368px square, independently
  // of SC04's narrower exploration bounds. All four .8m pillars remain visible.
  assert.match(html, /class="atlas-floor" x="136\.00" y="46\.00" width="368\.00" height="368\.00"/);
  assert.equal(total(html, /<circle class="atlas-wall"/g), 4);
  assert.equal(total(html, /<rect class="atlas-wall"/g), 1);
  assert.match(html, /<circle class="atlas-wall" cx="254\.29" cy="203\.71" r="10\.51"/);
  assert.match(html, /<rect class="atlas-wall" x="293\.71" y="282\.57" width="52\.57" height="26\.29"/);
});

test('untrusted identifiers and labels remain inert text in every renderer', () => {
  const hostile = '\"><img src=x onerror=alert(1)>', c = character({ inventory: [hostile], pendingClaims: [{ id: hostile, itemId: hostile }] });
  const bag = renderInventoryPanel({ character: c, selectedItemId: hostile });
  assert.doesNotMatch(bag, /<img/); assert.match(bag, /&quot;&gt;&lt;img/);
  const map = renderMapPanel({ character: c, mode: 'local', view: { sceneId: 'SC04', name: hostile, targets: [{ id: hostile, label: hostile, kind: 'service', position: { x: NaN, z: 0 } }] }, room: { members: [{ id: 'peer', sceneId: 'SC04', name: hostile, position: { x: 0, z: 0 } }] } });
  assert.doesNotMatch(map, /<img|translate\([^)]*NaN/); assert.match(map, /&lt;img/);
  assert.doesNotThrow(() => renderInventoryPanel()); assert.doesNotThrow(() => renderMagicPanel()); assert.doesNotThrow(() => renderMapPanel());
});
