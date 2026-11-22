export const WORKSHOP_COMMIT = '65154a9106f34fc3f76fb1b9613cf28c2f93b6cd';
export const ASSET_VERSION = 'workshop-65154a9106f3';
export const HISTORICAL_ASSET_VERSION = 'workshop-612434e54cf7';
export const PACKAGE_ROOT = new URL('../../assets/chapter-one/workshop/65154a9106f3/', import.meta.url);
export const HISTORICAL_PACKAGE_ROOT = new URL('../../assets/chapter-one/workshop/612434e54cf7/', import.meta.url);

const historical = {
  harry: { filename: 'harry-pathfinder.glb', sha256: 'df19f8637d16c1735e5e1689915057b88fcf38fb993f4192ebb01757c91ec241', jointCount: 22, look: 'pathfinder', defaultWand: 'pathfinder', wandNodes: { pathfinder: 'HF_Pathfinder_Wand_05' }, calibratedWalkMps: 1.308, calibratedRunMps: 2.808 },
  hermione: { filename: 'hermione.glb', sha256: 'b0a2e59fa78574b78bbcf0e20dbed086562406e0329a7b7442c1a0a6fafa6b8b', jointCount: 15, look: 'standard', defaultWand: 'vine', wandNodes: { holly: 'Wand_holly', vine: 'Wand_vine', willow: 'Wand_willow' }, calibratedWalkMps: 1.2635282607078553, calibratedRunMps: 2.7125285596847535 },
  ron: { filename: 'ron.glb', sha256: 'fad5723d7ebbd0941f981f672d8400849c5ef853af2e3d0194bbfe019a1678c3', jointCount: 15, look: 'standard', defaultWand: 'willow', wandNodes: { holly: 'Wand_holly', vine: 'Wand_vine', willow: 'Wand_willow' }, calibratedWalkMps: 1.3799399313926697, calibratedRunMps: 2.9624398527145384 },
};
const descriptions = {
  harry: { ...historical.harry },
  hermione: { ...historical.hermione, filename: 'hermione-scholar.glb', sha256: '691534dcd8311af0ac9673cb6dcec15d305f8fe8b6c5f2ddbaa09062ae274020', jointCount: 22, look: 'scholar', wandNodes: { vine: 'Hermione_Vine_Wand' } },
  ron: { ...historical.ron, filename: 'ron-weasley.glb', sha256: '3b1da7d34014c3799d2dc4696bf716d5f81151b377e1ade5a0328739f9bbcac4', jointCount: 22, look: 'keeper', wandNodes: { willow: 'Ron_Willow_Wand' } },
};
for (const value of [...Object.values(descriptions), ...Object.values(historical)]) {
  value.fixedLook = value.look !== 'standard';
  Object.freeze(value.wandNodes);
  Object.freeze(value);
}
export const CHARACTER_ASSETS = Object.freeze(descriptions);
export const HISTORICAL_CHARACTER_ASSETS = Object.freeze(historical);
export const RIG_NAMES = Object.freeze(['Hips', 'Chest', 'Head', 'ArmL', 'ArmR', 'ForearmL', 'ForearmR', 'HandL', 'HandR', 'ThighL', 'ThighR', 'ShinL', 'ShinR', 'FootL', 'FootR']);

export function resolveCharacterAsset(heroId, assetVersion = ASSET_VERSION) {
  const current = assetVersion === ASSET_VERSION;
  if (!current && assetVersion !== HISTORICAL_ASSET_VERSION) throw new Error(`UNRELEASED_ASSET_VERSION:${assetVersion}`);
  const descriptor = (current ? CHARACTER_ASSETS : HISTORICAL_CHARACTER_ASSETS)[heroId];
  if (!descriptor) throw new Error(`NO_PUBLISHED_WORKSHOP_ASSET:${heroId}`);
  return { ...descriptor, heroId, assetVersion, url: new URL(`assets/3d/magic/characters/${descriptor.filename}`, current ? PACKAGE_ROOT : HISTORICAL_PACKAGE_ROOT).href };
}

export function registerRig(root, descriptor) {
  const bones = new Map();
  const morphs = new Set();
  root.traverse(node => {
    if (node.isBone) {
      if (bones.has(node.name) && bones.get(node.name) !== node) throw new Error(`AMBIGUOUS_RIG_BONE:${node.name}`);
      bones.set(node.name, node);
    }
    for (const name of Object.keys(node.morphTargetDictionary ?? {})) morphs.add(name);
  });
  const missing = RIG_NAMES.filter(name => !bones.has(name));
  if (missing.length || bones.size !== descriptor.jointCount) throw new Error(`RIG_CONTRACT_MISMATCH:${descriptor.heroId}:${missing.join(',')}:${bones.size}`);
  const namedBack = root.getObjectByName('backAccessory') ?? root.getObjectByName('BackAccessory');
  const back = namedBack ?? bones.get('Chest') ?? bones.get('Hips');
  return { bones, morphs, back, backSource: namedBack ? 'authored_anchor' : `mapped_bone:${back.name}` };
}
