import { AnimationMixer, Group, Matrix4, Vector3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { createCharacterMotion } from '../../assets/chapter-one/workshop/65154a9106f3/js/magic/character-motion.js';
import { createWandGesture } from '../../assets/chapter-one/workshop/65154a9106f3/js/magic/wand-gesture.js';
import { ASSET_VERSION, resolveCharacterAsset, registerRig } from './registry.mjs';
import { createCombatPoseLayer } from './action-layer.mjs';

// Rendering policy mirrors the pinned workshop loader. These are instance-local
// material copies: source models, animation clips and shared textures stay intact.
function prepareMaterials(model, studio) {
  const copies = new Map();
  model.traverse(node => {
    if (!node.isMesh) return;
    const materialCopy = original => {
      if (copies.has(original)) return copies.get(original);
      const material = original.clone();
      copies.set(original, material);
      if (studio && /^HF fibre /i.test(material.name)) {
        material.transparent = true; material.opacity = .72; material.depthWrite = false;
      } else if (studio && /ink brown layered hair/i.test(material.name)) {
        material.alphaTest = .035; material.transparent = true; material.depthWrite = false;
      } else if (!studio && material.opacity === 0) material.opacity = 1;
      return material;
    };
    node.material = Array.isArray(node.material) ? node.material.map(materialCopy) : materialCopy(node.material);
    if (node.morphTargetInfluences) node.morphTargetInfluences = [...node.morphTargetInfluences];
    if (node.morphTargetDictionary) node.morphTargetDictionary = { ...node.morphTargetDictionary };
    const materials = [].concat(node.material);
    node.castShadow = !studio || materials.some(material => /^(Atelier \/ (coat|wool|collar|shirt|leather|pants|boot|sole)$|harry_skin$|HF umber hair roots$|Fabric_(robe|hood|knit|trousers)$|Hermione \| (polished oxford leather|scalp skin)$|Ron \| (scalp skin|leather|quarter|photographed copper roots)$)/i.test(material.name));
    node.receiveShadow = !studio || !materials.some(material => /^HF fibre |ink brown layered hair/i.test(material.name));
    if (studio) node.frustumCulled = false;
  });
  return [...copies.values()];
}

function disposeSkeletons(root) {
  const skeletons = new Set();
  root.traverse(node => { if (node.skeleton) skeletons.add(node.skeleton); });
  for (const skeleton of skeletons) skeleton.dispose();
}

// Pinned wands all extend toward increasing source-space Z and are weighted to
// HandR. Pick an actual distal mesh vertex once; sample its skin/morph transform
// at query time. Never approximate the muzzle with a camera or face offset.
function wandEndpoints(model, descriptor) {
  const endpoints = {};
  for (const [wandId, nodeName] of Object.entries(descriptor.wandNodes)) {
    const group = model.getObjectByName(nodeName);
    if (!group) throw new Error(`MISSING_WAND_NODE:${nodeName}`);
    let endpoint;
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      const positions = mesh.geometry.getAttribute('position');
      for (let vertex = 0; vertex < positions.count; vertex++) {
        const z = positions.getZ(vertex);
        if (!endpoint || z > endpoint.sourceZ) endpoint = { mesh, vertex, sourceZ: z, group };
      }
    });
    if (!endpoint) throw new Error(`MISSING_WAND_GEOMETRY:${nodeName}`);
    endpoints[wandId] = endpoint;
  }
  return endpoints;
}

export function createCharacterPresentation(gltf, { heroId, assetVersion = ASSET_VERSION, visualLoadout = {}, actionLayersEnabled = true, onDispose = () => {} } = {}) {
  const descriptor = resolveCharacterAsset(heroId, assetVersion);
  const model = cloneSkeleton(gltf.scene);
  const root = new Group();
  root.name = `ChapterOnePresentation:${heroId}`;
  const basis = new Group();
  basis.name = 'WorkshopPositiveZToControllerNegativeZ';
  basis.rotation.y = Math.PI;
  root.add(basis); basis.add(model);
  const materials = prepareMaterials(model, descriptor.fixedLook);
  const mixer = new AnimationMixer(model);
  let disposed = false, actionId = null, unsupportedTravelState = null;
  let rig, motion, gesture, endpoints, poseLayer;
  let selection = { outfit: 'robe', wand: descriptor.defaultWand };
  const assertLive = () => { if (disposed) throw new Error('PRESENTATION_DISPOSED'); };
  function dispose() {
    if (disposed) return;
    disposed = true;
    poseLayer?.reset();
    gesture?.stop();
    mixer.stopAllAction(); mixer.uncacheRoot(model);
    disposeSkeletons(model);
    for (const material of materials) material.dispose();
    root.removeFromParent(); root.clear();
    onDispose();
  }
  function setVisualLoadout(value = {}) {
    assertLive();
    if (descriptor.fixedLook) return { applied: false, reason: 'FIXED_PUBLISHED_LOOK', look: descriptor.look };
    const outfit = value.outfit ?? selection.outfit, wand = value.wand ?? selection.wand;
    if (!['robe', 'uniform', 'travel'].includes(outfit) || !endpoints[wand]) throw new Error('UNKNOWN_PUBLISHED_VISUAL_LOADOUT');
    for (const id of ['robe', 'uniform', 'travel']) {
      const node = model.getObjectByName(`Outfit_${id}`);
      if (!node) throw new Error(`MISSING_OUTFIT_NODE:${id}`);
      node.visible = id === outfit;
    }
    for (const [id, endpoint] of Object.entries(endpoints)) endpoint.group.visible = id === wand;
    selection = { outfit, wand };
    return { applied: true, ...selection };
  }
  try {
    rig = registerRig(model, descriptor);
    endpoints = wandEndpoints(model, descriptor);
    setVisualLoadout(visualLoadout);
    motion = createCharacterMotion(mixer, gltf.animations, gltf.parser?.json?.animations ?? []);
    gesture = createWandGesture(mixer, gltf.animations);
    poseLayer = createCombatPoseLayer({ model, bones: rig.bones, clips: gltf.animations, enabled: actionLayersEnabled });
  } catch (error) { dispose(); throw error; }

  const capabilities = Object.freeze({
    heroId, assetVersion, jointCount: rig.bones.size,
    boneNames: Object.freeze([...rig.bones.keys()]),
    morphNames: Object.freeze([...rig.morphs]),
    facialMorphs: rig.morphs.size > 0,
    facialDegradation: rig.morphs.size ? null : 'PUBLISHED_MODEL_HAS_NO_FACIAL_MORPHS',
    travelExpression: rig.morphs.size > 0,
    distanceDrivenWalkRun: true,
    studioFullCast: !!gesture,
    combatFastCast: true, movingCast: true, jumpingCast: true,
    jumpAnticipation: true, jumpTuck: true, landingCompression: true,
    airborneMotion: true, seatedMotion: true,
    appearance: descriptor.fixedLook ? 'fixed-published-look' : 'published-outfit-wand-groups',
    backAccessorySource: rig.backSource,
    validation: 'B01_B02_B03_HEADLESS_VERIFIED_RENDERED_NATURALNESS_AND_FIVE_PLAYER_PERFORMANCE_PENDING',
  });

  return {
    root, model, capabilities,
    walkSpeed: motion.walkSpeed, runSpeed: motion.runSpeed,
    updateTravel(dt, actualHorizontalDistance = 0, grounded = true, verticalVelocity = 0, seated = false) {
      assertLive();
      if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(actualHorizontalDistance) || actualHorizontalDistance < 0 || !Number.isFinite(verticalVelocity)) throw new Error('INVALID_TRAVEL_SAMPLE');
      unsupportedTravelState = null;
      poseLayer.restore();
      if (seated || !grounded || actualHorizontalDistance > 1e-6) gesture?.cancel();
      const influence = 1 - (gesture?.advance(dt) ?? 0);
      motion.update(dt, grounded && !seated ? actualHorizontalDistance : 0, influence);
      poseLayer.apply(dt, grounded, verticalVelocity, seated);
      if (!gesture?.active) actionId = null;
      return { supported: unsupportedTravelState === null, reason: unsupportedTravelState };
    },
    playStudioCast(id) {
      assertLive();
      if (typeof id !== 'string' || !id) throw new Error('ACTION_ID_REQUIRED');
      if (unsupportedTravelState || actionId || poseLayer.timeline.current || !gesture?.start()) return false;
      actionId = id; return true;
    },
    prepareJump(options) { assertLive(); gesture?.cancel(); return poseLayer.prepareJump(options); },
    cancelJumpPreparation() { assertLive(); return poseLayer.cancelJumpPreparation(); },
    resetJumpPresentation() { assertLive(); poseLayer.resetJumpPresentation(); },
    playAuthoritativeAction(...args) {
      assertLive();
      const result = poseLayer.timeline.play(...args);
      if (result.accepted) { gesture?.stop(); actionId = null; }
      return result;
    },
    cancelAction(id, reason = 'cancelled') {
      assertLive();
      if (poseLayer.timeline.cancel(id, reason)) return true;
      if (!actionId || id !== actionId) return false;
      gesture?.cancel(); return true;
    },
    consumePresentationEvents() { assertLive(); return poseLayer.timeline.consumeEvents(); },
    playHit(options) { assertLive(); poseLayer.playHit(options); },
    setMotionLayersEnabled(value) { assertLive(); poseLayer.setEnabled(value); },
    getCastOriginWorld(out = new Vector3()) {
      assertLive();
      const endpoint = endpoints[selection.wand];
      root.updateWorldMatrix(true, false);
      // SkinnedMesh updates its attached bind inverse in updateMatrixWorld;
      // Object3D.updateWorldMatrix alone leaves translated muzzles double moved.
      root.updateMatrixWorld(true);
      endpoint.mesh.getVertexPosition(endpoint.vertex, out);
      return out.applyMatrix4(endpoint.mesh.matrixWorld);
    },
    getAnchorWorldMatrix(name, out = new Matrix4()) {
      assertLive();
      if (name !== 'backAccessory') throw new Error(`UNKNOWN_PRESENTATION_ANCHOR:${name}`);
      rig.back.updateWorldMatrix(true, false);
      return out.copy(rig.back.matrixWorld);
    },
    readSoleContacts(out) {
      assertLive();
      if (!out || out.length !== 4) throw new Error('FOUR_SOLE_CONTACT_VECTORS_REQUIRED');
      return motion.readSoleContacts?.(out) ?? false;
    },
    setVisualLoadout,
    setExpressionContext(context) {
      assertLive();
      return poseLayer.setExpressionContext(context);
    },
    resetPresentation(snapshot = {}) {
      assertLive();
      poseLayer.reset(); gesture?.stop(); actionId = null; unsupportedTravelState = null; motion.reset();
      if (snapshot.position) root.position.fromArray(snapshot.position);
      if (Number.isFinite(snapshot.yaw)) root.rotation.y = snapshot.yaw;
    },
    debugSnapshot() {
      assertLive();
      return { actionId: poseLayer.timeline.current?.actionId ?? actionId, unsupportedTravelState, layers: poseLayer.debug(), clips: Object.fromEntries(gltf.animations.map(clip => { const action = mixer.existingAction(clip); return [clip.name, { duration: clip.duration, time: action?.time ?? 0, weight: action?.getEffectiveWeight() ?? 0, timeScale: action?.timeScale ?? 1 }]; })) };
    },
    dispose,
  };
}

function releaseSource(root) {
  const geometries = new Set(), materials = new Set(), textures = new Set(), images = new Set();
  root.traverse(node => {
    if (node.geometry) geometries.add(node.geometry);
    if (node.material) for (const material of [].concat(node.material)) materials.add(material);
  });
  disposeSkeletons(root);
  for (const material of materials) {
    for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    material.dispose();
  }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) { if (texture.image?.close) images.add(texture.image); texture.dispose(); }
  for (const source of images) source.close();
}

export function createPresentationLibrary({ loadGltf = url => new GLTFLoader().loadAsync(url) } = {}) {
  const assets = new Map();
  return {
    async loadCharacterPresentation(heroId, assetVersion = ASSET_VERSION, visualLoadout = {}) {
      const descriptor = resolveCharacterAsset(heroId, assetVersion);
      let entry = assets.get(descriptor.url);
      if (!entry) {
        entry = { refs: 0, value: null, promise: Promise.resolve().then(() => loadGltf(descriptor.url)) };
        assets.set(descriptor.url, entry);
      }
      entry.refs++;
      let released = false;
      const release = () => {
        if (released) return;
        released = true; entry.refs--;
        if (!entry.refs) {
          assets.delete(descriptor.url);
          if (entry.value) releaseSource(entry.value.scene);
        }
      };
      try {
        const gltf = await entry.promise;
        entry.value = gltf;
        return createCharacterPresentation(gltf, { heroId, assetVersion, visualLoadout, onDispose: release });
      } catch (error) { release(); throw error; }
    },
    get activeAssets() { return assets.size; },
  };
}

const defaultLibrary = createPresentationLibrary();
export const loadCharacterPresentation = (...args) => defaultLibrary.loadCharacterPresentation(...args);
