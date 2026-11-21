import { AnimationMixer } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createCharacterMotion } from './character-motion.js';
import { createWandGesture } from './wand-gesture.js';
import { OUTFITS, WANDS, fixedLook, normalizeSelection } from './character-catalog.js';
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

function prepareStudioMesh(node) {
  // The third-person camera follows this single actor. Avoid evaluating a
  // skinned and morphed bounding sphere for every detailed submesh on first draw.
  node.frustumCulled = false;
  const materials = [].concat(node.material);
  node.castShadow = materials.some(material =>
    /^(Atelier \/ (coat|wool|collar|shirt|leather|pants|boot|sole)$|harry_skin$|HF umber hair roots$|Fabric_(robe|hood|knit|trousers)$|Hermione \| (polished oxford leather|scalp skin)$)/i.test(material.name));
  node.receiveShadow = true;
  for (const material of materials) {
    if (/^HF fibre /i.test(material.name)) {
      material.transparent = true;
      material.opacity = .72;
      material.depthWrite = false;
      node.receiveShadow = false;
    } else if (/ink brown layered hair/i.test(material.name)) {
      material.alphaTest = .035;
      material.transparent = true;
      material.depthWrite = false;
      node.receiveShadow = false;
    }
  }
}

function prepareWardrobe(root, selection) {
  const variants = (prefix, options) => options.map(({ id }) => {
    const node = root.getObjectByName(`${prefix}_${id}`);
    if (!node) throw new Error(`Missing ${prefix}_${id} in ${selection.hero}`);
    return [id, node];
  });
  const outfits = variants('Outfit', OUTFITS), wands = variants('Wand', WANDS);
  function setEquipment({ outfit, wand }) {
    for (const [id, node] of outfits) node.visible = id === outfit;
    for (const [id, node] of wands) node.visible = id === wand;
  }
  setEquipment(selection);
  return { setEquipment };
}

export async function loadCharacter(value, { look } = {}) {
  const override = fixedLook(look);
  const selection = normalizeSelection(override ? { ...value, hero: override.hero, look } : value);
  const studio = fixedLook(selection.look);
  const id = studio?.asset ?? selection.hero;
  const url = new URL(`../../assets/3d/magic/characters/${id}.glb`, import.meta.url);
  const { scene: root, animations, parser } = await loader.loadAsync(url.href);
  const mixer = new AnimationMixer(root);
  try {
    const equipment = studio ? { look: studio.id } : prepareWardrobe(root, selection);
    root.traverse(node => {
      if (!node.isMesh) return;
      if (studio) {
        prepareStudioMesh(node);
        return;
      }
      node.castShadow = true;
      node.receiveShadow = true;
      // Alternative equipment is masked on export for stand-alone GLB viewers.
      for (const material of [].concat(node.material)) {
        if (material.opacity === 0) material.opacity = 1;
      }
    });
    const motion = createCharacterMotion(mixer, animations, parser.json.animations);
    const gesture = createWandGesture(mixer, animations);
    const seatJoints = ['ThighL', 'ThighR', 'ShinL', 'ShinR'].map((name, index) => {
      const bone = root.getObjectByName(name);
      return bone && {
        bone, standing: bone.quaternion.clone(),
        seatedX: bone.rotation.x + (index < 2 ? -1.34 : 1.37),
      };
    }).filter(Boolean);
    let wasSeated = false;
    function animateTravel(dt, distance = 0, _air = false, seated = false) {
      if (wasSeated) {
        for (const joint of seatJoints) joint.bone.quaternion.copy(joint.standing);
      }
      if (seated || distance > .000001) gesture?.cancel();
      motion.update(dt, seated ? 0 : distance, 1 - (gesture?.advance(dt) ?? 0));
      if (seated) {
        for (const joint of seatJoints) {
          joint.standing.copy(joint.bone.quaternion);
          joint.bone.rotation.x = joint.seatedX;
        }
      }
      wasSeated = seated;
    }
    return {
      root, ...equipment, walkSpeed: motion.walkSpeed, runSpeed: motion.runSpeed,
      animateTravel, readSoleContacts: motion.readSoleContacts,
      canCast: !!gesture, get casting() { return gesture?.active === true; },
      cast: () => !wasSeated && (gesture?.start() ?? false),
      cancelCast: () => gesture?.cancel(),
      resetMotion() { gesture?.stop(); motion.reset(); },
      // Existing preview callers express movement as a fraction of walk speed.
      animate(dt, movement = 0, air = false, seated = false) {
        animateTravel(dt, Math.max(0, movement) * motion.walkSpeed * dt, air, seated);
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
