import test from 'node:test';
import assert from 'node:assert/strict';
import { renderCharacterSheet, characterSheetParts } from '../chapter-one/client/character-sheet.mjs';
import { contentData } from '../chapter-one/data/index.mjs';
const base = () => ({ character: { id: 'a', heroId: 'harry', name: '自己的冒险者', level: 18, hp: 300, focus: 66, xpCents: 12345, xp: { earnedThisLevelCents: 20000, requiredThisLevelCents: 80000, atCap: false }, stats: { hp: 450, spellPower: 57, physicalDefense: 31, magicDefense: 28, focusMax: 120, focusRegenPerSecond: 7.5, crit: .123, haste: .15 }, skills: ['H1'], equipment: { weapon: 'ITEM-GEAR-BASE-WAND', top: 'ITEM-GEAR-BASE-TOP', gloves: 'ITEM-GEAR-BASE-GLOVES' }, inventory: ['ITEM-GEAR-T1-TOP', 'ITEM-GEAR-T1-WAND'] }, hero: { name: '自定义人物称呼', role: '破局者', signature: 'H1', copy: '观察并打断危险动作。', traits: ['准确', '勇气'] } });

test('the sheet exposes one persistent preview and separate identity/equipment/stats update regions', () => {
  const input = base(), html = renderCharacterSheet(input), parts = characterSheetParts(input);
  for (const id of ['character-preview', 'character-identity', 'character-equipment', 'character-stats']) assert.equal(html.split(`id="${id}"`).length - 1, 1);
  assert(html.includes('data-preview-rotate="-0.5"')); assert(html.includes('data-preview-rotate="0.5"')); assert(html.includes('data-preview-reset="true"'));
  assert(parts.identity.includes('自己的冒险者')); assert(parts.identity.includes('自定义人物称呼'));
  for (const fragment of Object.values(parts)) assert(!fragment.includes('id="character-preview"'), 'an ordinary snapshot must not replace the live canvas');
});

test('equipment replacements are filtered by selected slot and empty robes show their real base layer', () => {
  const input = base(), top = contentData.items.find(item => item.effect?.slot === 'top' && item.category === 'equipment');
  input.character.inventory = [top.itemId, 'ITEM-GEAR-T1-WAND']; delete input.character.equipment.top;
  const parts = characterSheetParts({ ...input, selectedSlot: 'top' });
  assert(parts.equipment.includes('未穿校袍 · 显示基础内衫')); assert(parts.equipment.includes('最大生命 +')); assert(!parts.equipment.includes('maxHp'));  assert(parts.equipment.includes(`data-equip="${top.itemId}"`)); assert(!parts.equipment.includes('data-equip="ITEM-GEAR-T1-WAND"'));
  assert(!parts.equipment.includes('data-unequip="top"')); assert(parts.equipment.includes('工坊原款造型'));
  input.character.inventory = []; assert(characterSheetParts(input).equipment.includes('data-panel="inventory"'));
});

test('active combat disables all outfit mutations and reads current combat resources', () => {
  const input = base(), top = contentData.items.find(item => item.effect?.slot === 'top' && item.category === 'equipment');
  input.character.inventory = [top.itemId]; input.character.encounter = { status: 'active', players: { a: { hp: 201, focus: 45, stats: input.character.stats } } };
  const { equipment, stats } = characterSheetParts(input);
  const mutations = equipment.match(/<button[^>]+data-(?:equip|unequip)=[^>]+>/g); assert.equal(mutations.length, 4);
  assert(mutations.every(button => button.includes(' disabled '))); assert(equipment.includes('战斗中无法更换'));
  assert(stats.includes('aria-label="生命" aria-valuemin="0" aria-valuemax="450" aria-valuenow="201"'));
  assert(stats.includes('aria-label="专注" aria-valuemin="0" aria-valuemax="120" aria-valuenow="45"'));
});

test('summary uses supplied aggregate stats and exact experience progress without doubling equipment bonuses', () => {
  const { stats } = characterSheetParts(base());
  assert(stats.includes('<dt>咒力</dt><dd>57</dd>')); assert(stats.includes('<dt>暴击率</dt><dd>12.3%</dd>')); assert(stats.includes('<dt>急速</dt><dd>15.0%</dd>'));
  assert(stats.includes('aria-label="本级经验" aria-valuemin="0" aria-valuemax="100" aria-valuenow="25.0"')); assert(stats.includes('200 / 800 经验'));
  const capped = base(); capped.character.xp = { atCap: true, earnedThisLevelCents: 0, requiredThisLevelCents: 0 };
  const full = characterSheetParts(capped).stats; assert(full.includes('已达到当前等级上限')); assert(!full.includes('NaN')); assert(!full.includes('Infinity'));
});

test('player and hero text cannot create HTML or attributes in the character sheet', () => {
  const input = base(); input.character.name = '<img src=x onerror="alert(1)">'; input.hero.name = '" onmouseover="oops'; input.hero.copy = '<script>bad()</script>'; input.hero.traits = ['<svg/onload=bad()>'];
  const html = renderCharacterSheet(input); assert(!html.includes('<img')); assert(!html.includes('<script')); assert(!html.includes('<svg/onload'));
  assert(html.includes('&lt;img')); assert(html.includes('&lt;script&gt;')); assert(html.includes('&quot; onmouseover=&quot;oops'));
});
