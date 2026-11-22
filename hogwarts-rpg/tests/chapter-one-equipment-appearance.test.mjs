import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { resolveCharacterAsset } from '../chapter-one/presentation/registry.mjs';
import { createCharacterPresentation } from '../chapter-one/presentation/character-adapter.mjs';
import { applyEquipmentAppearance, resetEquipmentAppearance } from '../chapter-one/presentation/equipment-appearance.mjs';

async function source(heroId) {
  const descriptor = resolveCharacterAsset(heroId), data = await readFile(new URL(descriptor.url));
  assert.equal(createHash('sha256').update(data).digest('hex'), descriptor.sha256);
  const loader = new GLTFLoader(); loader.register(() => ({ name: 'NO_TEXTURE_DECODE', loadTexture: () => Promise.resolve(null) }));
  return loader.parseAsync(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength), '');
}
function visibility(model) { const result = new Map(); model.traverse(node => result.set(node.uuid, node.visible)); return result; }
function curves(gltf) { const digest = createHash('sha256'); for (const clip of gltf.animations) for (const track of clip.tracks) { digest.update(track.name); digest.update(Buffer.from(track.times.buffer)); digest.update(Buffer.from(track.values.buffer)); } return digest.digest('hex'); }
for (const heroId of ['harry', 'ron', 'hermione']) test(`${heroId}: unequipping removes real outer geometry while preserving the original clothed body and isolated peers`, async () => {
  const gltf = await source(heroId), originalCurves = curves(gltf), sourceVisible = visibility(gltf.scene);
  const actor = createCharacterPresentation(gltf, { heroId }), peer = createCharacterPresentation(gltf, { heroId });
  const before = visibility(actor.model), peerBefore = visibility(peer.model);
  try {
    const result = applyEquipmentAppearance(actor, { equipment: { top: null, weapon: null, gloves: null } });
    assert.equal(result.applied, true); assert.equal(result.top, 'workshop-inner-layer'); assert.equal(result.weapon, 'unequipped'); assert.equal(result.individualTopModels, false);
    let hidden = 0, inner = 0, mixedSleeves = 0;
    actor.model.traverse(node => {
      if (before.get(node.uuid) && !node.visible) hidden++;
      if (/Atelier.*03(?:_|\s|\|)|VNeck_Shirt/.test(node.name)) { inner++; assert.equal(node.visible, true); }
      if (/Atelier.*05(?:_|\s|\|)/.test(node.name)) { mixedSleeves++; assert.equal(node.visible, true); }
      if (/Portrait|Hands_Neck|Trousers|School_Trousers|Pleated_Skirt|Oxford|Derby|Pathfinder_Boot/.test(node.name)) assert.equal(node.visible, before.get(node.uuid));
    });
    assert(hidden > 5); assert(inner > 1); if (heroId === 'harry') assert(mixedSleeves > 1);
    assert.deepEqual(visibility(peer.model), peerBefore); assert.deepEqual(visibility(gltf.scene), sourceVisible);
    actor.updateTravel(.1, 0); actor.playAuthoritativeAction({ actionId: 'wardrobe-cast', skillId: 'bolt', nowMs: 0 }); actor.updateTravel(.15, .1);
    assert(actor.getCastOriginWorld().toArray().every(Number.isFinite), 'hiding the held wand does not corrupt its skin or anchor');
    applyEquipmentAppearance(actor, { equipment: { top: 'different-stat-lining', weapon: 'different-stat-wand' } });
    assert.deepEqual(visibility(actor.model), before, 'all authored visibility is restored, with no fake replacement shape');
    const deleted = applyEquipmentAppearance(actor, { equipment: {} }); assert.equal(deleted.top, 'workshop-inner-layer'); assert.equal(deleted.weapon, 'unequipped');
    const restored = applyEquipmentAppearance(actor, {}); assert.equal(restored.top, 'workshop-original-outer'); assert.deepEqual(visibility(actor.model), before, 'legacy peers without equipment retain their original appearance');
    applyEquipmentAppearance(actor, { equipment: {} }); assert.equal(resetEquipmentAppearance(actor), true); assert.deepEqual(visibility(actor.model), before);
    assert.equal(curves(gltf), originalCurves); assert.deepEqual(visibility(gltf.scene), sourceVisible);
  } finally { actor.dispose(); peer.dispose(); }
});
