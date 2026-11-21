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
    for (const clip of ['Idle', 'Walk', 'Run', 'Cast']) {
      const animation = model.animations.find(item => item.name === clip);
      assert.ok(animation?.channels.some(channel => channel.target.path === 'rotation'));
      assert.ok(animation.samplers.some(sampler => model.accessors[sampler.input].max[0] > .5));
    }
    const walk = model.animations.find(clip => clip.name === 'Walk');
    const run = model.animations.find(clip => clip.name === 'Run');
    assert.ok(Number.isFinite(walk.extras?.groundSpeed) && walk.extras.groundSpeed > 0);
    assert.ok(Number.isFinite(run.extras?.groundSpeed) && run.extras.groundSpeed > walk.extras.groundSpeed);
    assert.ok(model.images.every(image => image.bufferView >= 0), 'textures must travel with the model');
    assert.ok(model.images.some(image => image.name.includes(hero.id)), 'missing personal portrait maps');
  });
}

test('the workshop outfit ships as a complete fixed look with the shared movement actions', () => {
  const model = readModel('harry-pathfinder');
  const names = new Set(model.nodes.map(node => node.name));
  for (const name of ['Hips', 'Pathfinder_Boot_L', 'Pathfinder_Boot_R', 'HF_Pathfinder_Wand_05']) {
    assert.ok(names.has(name), 'missing workshop component ' + name);
  }
  for (const name of ['Idle', 'Walk', 'Run', 'Cast']) {
    const clip = model.animations.find(animation => animation.name === name);
    assert.ok(clip?.channels.some(channel => channel.target.node === model.nodes.findIndex(node => node.name === 'Hips')));
  }
});


test('the scholar look belongs to Hermione and carries her own animated hair, face, robe and wand', () => {
  assert.equal(normalizeSelection({hero:'hermione',look:'scholar'}).look, 'scholar');
  assert.equal(normalizeSelection({hero:'harry',look:'scholar'}).look, undefined);
  assert.equal(normalizeSelection({hero:'hermione',look:'pathfinder'}).look, undefined);
  const model = readModel('hermione-scholar');
  const meshes = new Map(model.nodes.filter(node => node.mesh !== undefined)
    .map(node => [node.name, model.meshes[node.mesh]]));
  assert.ok(meshes.has('Hermione_Vine_Wand'));
  assert.ok(meshes.has('Hermione_Oxford_L') && meshes.has('Hermione_Oxford_R'));
  for (const [nodeName,shape] of [
    ['Portrait','FaceCheekLiftL'],
    ['Hermione_Chestnut_Crown_and_Curls','HairSettle'],
    ['Hermione_Gryffindor_Robe_and_Hood','RobeAir']
  ]) {
    assert.ok(meshes.get(nodeName)?.extras?.targetNames?.includes(shape));
    const node = model.nodes.findIndex(n => n.name === nodeName);
    for (const name of ['Run','Cast']) {
      assert.ok(model.animations.find(a => a.name === name).channels.some(c =>
        c.target.node === node && c.target.path === 'weights'));
    }
  }
  const standard = readModel('hermione');
  for (const name of ['Run','Walk']) {
    assert.equal(model.animations.find(c => c.name === name).extras.groundSpeed,
      standard.animations.find(c => c.name === name).extras.groundSpeed);
  }
});

test('Ron wears his own school uniform and keeps the willow wand in his casting hand', () => {
  assert.equal(normalizeSelection({hero:'ron', look:'keeper'}).look, 'keeper');
  for (const hero of ['harry', 'hermione']) {
    assert.equal(normalizeSelection({hero, look:'keeper'}).look, undefined);
  }
  const model = readModel('ron-weasley');
  const nodes = new Map(model.nodes.map((node, index) => [node.name, {...node, index}]));
  const mesh = name => model.meshes[nodes.get(name)?.mesh];
  for (const name of ['Ron_School_Trousers', 'Ron_VNeck_Shirt_and_Tie', 'Ron_Derby_L', 'Ron_Derby_R']) {
    assert.ok(mesh(name), name);
  }
  const wand = nodes.get('Ron_Willow_Wand');
  assert.equal(wand.extras.wood, 'willow');
  assert.ok(wand.extras.shaftLength > .35 && wand.extras.shaftLength < .36);
  assert.ok(model.skins[wand.skin].joints.includes(nodes.get('HandR').index));
  assert.ok(mesh('Portrait').extras.targetNames.includes('FaceCheekLiftL'));
  const animations = new Map(model.animations.map(clip => [clip.name, clip]));
  const ordinary = readModel('ron');
  for (const name of ['Walk', 'Run']) {
    assert.equal(animations.get(name).extras.groundSpeed,
      ordinary.animations.find(clip => clip.name === name).extras.groundSpeed);
  }
  for (const name of ['Run', 'Cast']) {
    for (const part of ['Portrait', 'Ron_Gryffindor_Robe', 'Ron_Swept_Copper_Waves']) {
      assert.ok(animations.get(name).channels.some(c => c.target.node === nodes.get(part).index
        && c.target.path === 'weights'), name + ' should animate ' + part);
    }
  }
  assert.ok(model.images.some(im => /ron/i.test(im.name) && im.bufferView >= 0));
  assert.ok(model.images.every(im => im.bufferView >= 0));
});
