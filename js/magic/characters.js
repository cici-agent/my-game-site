import { AnimationMixer, MathUtils } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OUTFITS, WANDS, normalizeSelection } from './character-catalog.js';
export { HEROES, OUTFITS, WANDS } from './character-catalog.js';

const loader = new GLTFLoader();

// Preview models can be transferred into the game. Each instance owns its GPU resources.
export function releaseModel(root) {
  root.removeFromParent();
  const geometries = new Set(), materials = new Set(), textures = new Set(), images = new Set();
  root.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) {
      for (const mat of [].concat(node.material)) materials.add(mat);
    }
    node.skeleton?.dispose();
  });
  for (const material of materials) {
    for (const value of Object.values(material)) {
      if (value?.isTexture) textures.add(value);
    }
    material.dispose();
  }
  for (const texture of textures) {
    if (texture.image?.close) images.add(texture.image);
    texture.dispose();
  }
  for (const image of images) image.close();
  for (const geometry of geometries) geometry.dispose();
}

export async function loadCharacter(value) {
  const selection = normalizeSelection(value);
  const url = new URL(`../../assets/3d/magic/characters/${selection.hero}.glb`, import.meta.url);
  const { scene: root, animations } = await loader.loadAsync(url.href);
  const mixer = new AnimationMixer(root);
  try {
    const variants = (prefix, options) => options.map(({ id }) => {
      const node = root.getObjectByName(`${prefix}_${id}`);
      if (!node) throw new Error(`Missing ${prefix}_${id} in ${selection.hero}`);
      return [id, node];
    });
    const outfits = variants('Outfit', OUTFITS), wands = variants('Wand', WANDS);
    root.traverse(node => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      // Alternative equipment is masked on export for stand-alone GLB viewers.
      for (const material of [].concat(node.material)) {
        if (material.opacity === 0) material.opacity = 1;
      }
    });
    function setEquipment({ outfit, wand }) {
      for (const [id, node] of outfits) node.visible = id === outfit;
      for (const [id, node] of wands) node.visible = id === wand;
    }
    setEquipment(selection);

    const idle = mixer.clipAction(animations.find(clip => clip.name === 'Idle')).play();
    const walk = mixer.clipAction(animations.find(clip => clip.name === 'Walk')).play();
    walk.setEffectiveWeight(0);
    const seatJoints = ['ThighL', 'ThighR', 'ShinL', 'ShinR'].map((name, index) => {
      const bone = root.getObjectByName(name);
      return bone && {bone, rest:bone.rotation.x, angle:index < 2 ? -1.34 : 1.37};
    }).filter(Boolean);
    let movement = 0;
    let wasSeated = false;
    return {
      root, setEquipment,
      animate(dt, speed = 0, _air = false, seated = false) {
        if (wasSeated && !seated) for (const joint of seatJoints) joint.bone.rotation.x = joint.rest;
        movement = MathUtils.damp(movement, Math.min(1, speed), 14, dt);
        idle.setEffectiveWeight(1 - movement);
        walk.setEffectiveWeight(movement);
        walk.setEffectiveTimeScale(Math.max(.65, speed));
        mixer.update(dt);
        if (seated) for (const joint of seatJoints) joint.bone.rotation.x = joint.rest + joint.angle;
        wasSeated = seated;
      },
      dispose() {
        mixer.stopAllAction();
        mixer.uncacheRoot(root);
        releaseModel(root);
      },
    };
  } catch (error) {
    mixer.stopAllAction();
    mixer.uncacheRoot(root);
    releaseModel(root);
    throw error;
  }
}
