import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HEROES, OUTFITS, WANDS, normalizeSelection } from '../js/magic/character-catalog.js';

function readModel(id) {
  const file = readFileSync(new URL(`../assets/3d/magic/characters/${id}.glb`, import.meta.url));
  assert.equal(file.toString('ascii', 0, 4), 'glTF');
  assert.equal(file.readUInt32LE(4), 2);
  assert.equal(file.readUInt32LE(8), file.length);
  return JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12)));
}

test('a partially saved character keeps its valid choices and recovers its own wand', () => {
  assert.deepEqual(normalizeSelection({ hero: 'hermione', outfit: 'travel', wand: 'retired' }),
    { hero: 'hermione', outfit: 'travel', wand: 'vine' });
  assert.deepEqual(normalizeSelection(null), { hero: 'harry', outfit: 'robe', wand: 'holly' });
});

for (const hero of HEROES) {
  test(`${hero.english} ships with visible default equipment, interchangeable meshes and animated joints`, () => {
    const model = readModel(hero.id);
    const { nodes, meshes, skins, materials } = model;
    const equipment = new Map(nodes.map(node => [node.name, node]));
    const outfitNames = OUTFITS.map(item => 'Outfit_' + item.id);
    const wandNames = WANDS.map(item => 'Wand_' + item.id);
    for (const name of [...outfitNames, ...wandNames]) {
      const node = equipment.get(name);
      assert.ok(node && skins[node.skin], name + ' must follow the character skeleton');
      const primitives = meshes[node.mesh].primitives;
      assert.ok(primitives.length > 0);
      const defaultVisible = name === 'Outfit_robe' || name === 'Wand_' + hero.defaultWand;
      for (const primitive of primitives) {
        const mat = materials[primitive.material];
        assert.equal(mat.pbrMetallicRoughness?.baseColorFactor?.[3] ?? 1, defaultVisible ? 1 : 0);
        if (!defaultVisible) assert.equal(mat.alphaMode, 'MASK');
        assert.ok(primitive.attributes.WEIGHTS_0 >= 0 && primitive.attributes.JOINTS_0 >= 0);
      }
    }
    for (const clip of ['Idle', 'Walk']) {
      const animation = model.animations.find(item => item.name === clip);
      assert.ok(animation?.channels.some(channel => channel.target.path === 'rotation'));
      assert.ok(animation.samplers.some(sampler => model.accessors[sampler.input].max[0] > .5));
    }
    assert.ok(model.images.every(image => image.bufferView >= 0), 'textures must travel with the model');
    assert.ok(model.images.some(image => image.name.includes(hero.id)), 'missing personal portrait maps');
  });
}
