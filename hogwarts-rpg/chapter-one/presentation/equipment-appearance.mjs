// Instance-only wardrobe policy for the detailed, pinned workshop characters.
// Numerical equipment is deliberately not presented as a new authored outfit.
const plans = new WeakMap();
const wardrobe = {
  harry: { outer: [/^Atelier.*0[12467](?:_|\s|\|)/], inner: [/^Atelier.*03(?:_|\s|\|)/], wand: ['HF_Pathfinder_Wand_05', 'Pathfinder_Wand_Garnet_Catchlight'], mixedSleeves: true },
  ron: { outer: [/^Ron_Gryffindor_Robe(?:_|$)/, /^Ron_Lapel_and_Hem(?:_|$)/, /^Ron_Lined_Hood(?:_|$)/, /^Ron_Embroidered_Crest(?:_|$)/], inner: [/^Ron_VNeck_Shirt_and_Tie(?:_|$)/], wand: ['Ron_Willow_Wand'] },
  hermione: { outer: [/^Hermione_Gryffindor_Robe_and_Hood(?:_|$)/, /^Hermione_Corded_Lapels_and_Pick_Stitch(?:_|$)/, /^Hermione_Embroidered_Lion_Shield(?:_|$)/, /^Hermione_Lined_Cowl_and_Back_Yoke(?:_|$)/], inner: [/^Hermione_VNeck_Shirt_and_House_Tie(?:_|$)/], wand: ['Hermione_Vine_Wand'] },
};
function planFor(actor) {
  const model = actor?.model, heroId = actor?.capabilities?.heroId, definition = wardrobe[heroId];
  if (!model || !definition || actor.capabilities.appearance !== 'fixed-published-look') return null;
  if (plans.has(model)) return plans.get(model);
  const outer = [], inner = [], wand = [];
  model.traverse(node => {
    if (definition.outer.some(pattern => pattern.test(node.name))) outer.push({ node, visible: node.visible });
    if (definition.inner.some(pattern => pattern.test(node.name))) inner.push(node);
    if (definition.wand.includes(node.name)) wand.push({ node, visible: node.visible });
  });
  const plan = { outer, inner, wand, mixedSleeves: Boolean(definition.mixedSleeves) };
  plans.set(model, plan); return plan;
}

export function applyEquipmentAppearance(actor, character = {}) {
  const plan = planFor(actor);
  if (!plan || !plan.outer.length || !plan.inner.length) return { applied: false, reason: 'NO_VERIFIED_SEPARATE_WORKSHOP_CLOTHING' };
  const hasEquipment = character.equipment !== null && typeof character.equipment === 'object' && !Array.isArray(character.equipment);
  const equipment = hasEquipment ? character.equipment : {}, emptyTop = hasEquipment && equipment.top == null, emptyWand = hasEquipment && equipment.weapon == null;
  for (const entry of plan.outer) entry.node.visible = emptyTop ? false : entry.visible;
  for (const entry of plan.wand) entry.node.visible = emptyWand ? false : entry.visible;
  return { applied: true, top: emptyTop ? 'workshop-inner-layer' : 'workshop-original-outer', weapon: emptyWand ? 'unequipped' : 'workshop-original-wand', individualTopModels: false, individualWandModels: false, gloves: 'attributes-only', preservedMixedSleeves: plan.mixedSleeves, outerNodes: plan.outer.length, innerNodes: plan.inner.length };
}

export function resetEquipmentAppearance(actor) {
  const plan = plans.get(actor?.model); if (!plan) return false;
  for (const entry of [...plan.outer, ...plan.wand]) entry.node.visible = entry.visible;
  return true;
}
