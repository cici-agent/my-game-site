import test from 'node:test';
import assert from 'node:assert/strict';
import { occupiedBagSlots } from '../chapter-one/rules/bag.mjs';

test('empty or depleted potion stacks occupy no slots', () => {
  assert.equal(occupiedBagSlots({ inventory: [], potions: { health: 0, focus: 0 } }), 0);
  assert.equal(occupiedBagSlots({ inventory: ['robe'], potions: { health: 0, focus: 0 } }), 1);
  assert.equal(occupiedBagSlots({}), 0);
  assert.equal(occupiedBagSlots(undefined), 0);
  assert.equal(occupiedBagSlots({ inventory: 'legacy-value' }), 0);
});

test('two bottles of one potion type share one slot and different types occupy separate slots', () => {
  for (const potions of [{ health: 1, focus: 0 }, { health: 2, focus: 0 }, { health: 0, focus: 2 }]) {
    assert.equal(occupiedBagSlots({ inventory: ['wand', 'robe'], potions }), 3);
  }
  assert.equal(occupiedBagSlots({ inventory: ['wand', 'robe'], potions: { health: 1, focus: 1 } }), 4);
});

test('drinking the last bottle frees its stack slot', () => {
  const inventory = Array.from({ length: 22 }, (_, index) => `item-${index}`);
  assert.equal(occupiedBagSlots({ inventory, potions: { health: 1, focus: 1 } }), 24);
  assert.equal(occupiedBagSlots({ inventory, potions: { health: 0, focus: 1 } }), 23);
  assert.equal(occupiedBagSlots({ inventory, potions: { health: 0, focus: 0 } }), 22);
});

test('equipped items and permanent collections never consume ordinary bag slots', () => {
  const character = {
    inventory: ['spare-robe'], potions: { health: 1, focus: 1 },
    equipment: { weapon: 'wand', top: 'robe', gloves: 'gloves' },
    tools: ['broom', 'lamp'], appearances: ['hat'], collectionIds: ['collection'],
    collectionItems: ['card'], pendingClaims: [{ itemId: 'unclaimed-reward' }],
  };
  assert.equal(occupiedBagSlots(character), 3);
});

test('old overcapacity saves are counted without clipping, rejection or mutation', () => {
  const character = {
    bagCapacity: 24,
    inventory: Array.from({ length: 24 }, (_, index) => `legacy-${index}`),
    potions: { health: 2, focus: 1 },
  };
  const before = structuredClone(character);
  Object.freeze(character.inventory); Object.freeze(character.potions); Object.freeze(character);
  assert.equal(occupiedBagSlots(character), 26);
  assert.deepEqual(character, before);
});
