import { AnimationMixer, Group, Matrix4, Quaternion, Vector3 } from 'three';
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

function createSeatedWardrobe(root, model, bones, metrics) {
  const owned = [], point = new Vector3(), target = new Vector3(), boneMatrix = new Matrix4(), skinMatrix = new Matrix4();
  let initialized = false, previous = -1;
  function initialize() {
    initialized = true; root.updateMatrixWorld(true);
    const legAxes = Object.fromEntries(['L', 'R'].map(side => [side, {
      hip: root.worldToLocal(bones.get('Thigh' + side).getWorldPosition(new Vector3())),
      knee: root.worldToLocal(bones.get('Shin' + side).getWorldPosition(new Vector3())),
    }]));
    model.traverse(mesh => {
      if (!mesh.isSkinnedMesh) return;
      const source = mesh.geometry, { position, skinIndex, skinWeight } = source.attributes;
      const hips = mesh.skeleton.bones.indexOf(bones.get('Hips'));
      if (hips < 0 || !skinWeight) return;
      const thighSlots = ['L', 'R'].map(side => mesh.skeleton.bones.indexOf(bones.get('Thigh' + side)));
      const changed = [], foldedPositions = position.clone();
      for (let i = 0; i < position.count; i++) {
        let hipWeight = 0, thighWeight = 0;
        for (let j = 0; j < 4; j++) {
          const index = skinIndex.getComponent(i, j);
          if (index === hips) hipWeight += skinWeight.getComponent(i, j);
          if (thighSlots.includes(index)) thighWeight += skinWeight.getComponent(i, j);
        }
        if (hipWeight + thighWeight < .05) continue;
        const weights = new Map();
        for (let j = 0; j < 4; j++) { const index = skinIndex.getComponent(i, j), weight = skinWeight.getComponent(i, j); if (weight > 0) weights.set(index, (weights.get(index) ?? 0) + weight); }
        mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld); root.worldToLocal(point);
        // Lower panels follow the lap only while sitting. The waist keeps its
        // source attachment; boots, skin, faces and upper garments are untouched.
        const t = Math.max(0, Math.min(1, (metrics.restHip.y - .02 - point.y) / .10));
        const fold = t * t * (3 - 2 * t); if (fold < .001) continue;
        const side = point.x < 0 ? 'L' : 'R', thigh = mesh.skeleton.bones.indexOf(bones.get('Thigh' + side));
        if (thigh < 0) continue;
        const indices = [...new Set([...weights.keys(), thigh])];
        if (indices.length > 4) continue;
        while (indices.length < 4) indices.push(hips);
        const rest = indices.map((index, slot) => indices.indexOf(index) === slot ? weights.get(index) ?? 0 : 0), folded = [...rest];
        const transfer = hipWeight * fold;
        if (transfer) { folded[indices.indexOf(hips)] -= transfer; folded[indices.indexOf(thigh)] += transfer; }
        changed.push({ vertex: i, indices, rest, folded });
        // Coat tails are thicker than the trouser cross-section. Fold their
        // rear cloth against the underside of the lap, rather than lifting the
        // entire student or allowing a vertical tail through the upholstery.
        const { hip, knee } = legAxes[side], along = Math.max(0, Math.min(1, (hip.y - point.y) / Math.max(.01, hip.y - knee.y)));
        const back = hip.z + (knee.z - hip.z) * along + Math.max(.035, metrics.thighRadius - .025);
        if (point.z > back) {
          target.copy(point); target.z += (back - point.z) * fold;
          root.localToWorld(target); mesh.worldToLocal(target);
          skinMatrix.elements.fill(0);
          for (const [index, weight] of weights) {
            boneMatrix.multiplyMatrices(mesh.skeleton.bones[index].matrixWorld, mesh.skeleton.boneInverses[index]);
            for (let j = 0; j < 16; j++) skinMatrix.elements[j] += boneMatrix.elements[j] * weight;
          }
          skinMatrix.premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix).invert();
          target.applyMatrix4(skinMatrix); foldedPositions.setXYZ(i, target.x, target.y, target.z);
        }
      }
      if (!changed.length) return;
      const geometry = source.clone(); mesh.geometry = geometry;
      for (const entry of changed) for (let j = 0; j < 4; j++) geometry.attributes.skinIndex.setComponent(entry.vertex, j, entry.indices[j]);
      geometry.attributes.skinIndex.needsUpdate = true;
      const normalGeometry = source.clone(); normalGeometry.setAttribute('position', foldedPositions); normalGeometry.computeVertexNormals();
      const foldedNormals = normalGeometry.attributes.normal.clone(); normalGeometry.dispose();
      if (geometry.morphTargetsRelative) for (let i = 0; i < position.count; i++) {
        foldedPositions.setXYZ(i, foldedPositions.getX(i) - position.getX(i), foldedPositions.getY(i) - position.getY(i), foldedPositions.getZ(i) - position.getZ(i));
        const normal = source.attributes.normal; foldedNormals.setXYZ(i, foldedNormals.getX(i) - normal.getX(i), foldedNormals.getY(i) - normal.getY(i), foldedNormals.getZ(i) - normal.getZ(i));
      }
      const morphIndex = geometry.morphAttributes.position?.length ?? 0;
      geometry.morphAttributes.position = [...(geometry.morphAttributes.position ?? []), foldedPositions];
      geometry.morphAttributes.normal = [...(geometry.morphAttributes.normal ?? []), foldedNormals];
      const influences = [...(mesh.morphTargetInfluences ?? [])]; mesh.updateMorphTargets();
      influences.forEach((value, index) => { mesh.morphTargetInfluences[index] = value; });
      mesh.morphTargetInfluences[morphIndex] = 0;
      owned.push({ mesh, geometry, changed, morphIndex });
    });
  }
  return {
    update(weight) {
      if (weight > .00001 && !initialized) initialize();
      if (!initialized || Math.abs(weight - previous) < 1e-7) return;
      previous = weight;
      for (const { mesh, geometry, changed, morphIndex } of owned) {
        for (const entry of changed) for (let j = 0; j < 4; j++) geometry.attributes.skinWeight.setComponent(entry.vertex, j, entry.rest[j] + (entry.folded[j] - entry.rest[j]) * weight);
        geometry.attributes.skinWeight.needsUpdate = true;
        mesh.morphTargetInfluences[morphIndex] = weight;
      }
    },
    dispose() { for (const { geometry } of owned) geometry.dispose(); owned.length = 0; },
  };
}

// Measure the published rig once. Seat contacts use metres in the gameplay
// root, including each student's authored scale and actual trouser/shoe shape.
function measureSeatedRig(root, model, bones, motion) {
  root.updateMatrixWorld(true);
  const local = bone => root.worldToLocal(bone.getWorldPosition(new Vector3()));
  const legs = ['L', 'R'].map(side => ({ side, hip: local(bones.get('Thigh' + side)), knee: local(bones.get('Shin' + side)), ankle: local(bones.get('Foot' + side)) }));
  const soles = Array.from({ length: 4 }, () => new Vector3());
  const hasSoles = motion.readSoleContacts?.(soles);
  if (hasSoles) soles.forEach(point => root.worldToLocal(point));
  const metrics = {
    thighLength: legs.reduce((sum, leg) => sum + leg.hip.distanceTo(leg.knee), 0) / 2,
    shinLength: legs.reduce((sum, leg) => sum + leg.knee.distanceTo(leg.ankle), 0) / 2,
    soleBelowAnkle: legs.reduce((sum, leg, i) => sum + leg.ankle.y - (hasSoles ? Math.min(soles[i * 2].y, soles[i * 2 + 1].y) : 0), 0) / 2,
    thighRadius: .055, calfRadius: .045,
    restHip: { y: (legs[0].hip.y + legs[1].hip.y) / 2, z: (legs[0].hip.z + legs[1].hip.z) / 2 },
  };
  const vertex = new Vector3(), axis = new Vector3(), offset = new Vector3();
  model.traverse(mesh => {
    if (!mesh.isSkinnedMesh || ![].concat(mesh.material).some(material => /pants|trousers/i.test(material.name))) return;
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    const hips = mesh.skeleton.bones.indexOf(bones.get('Hips'));
    for (const leg of legs) for (const [joint, start, end, metric] of [['Thigh', leg.hip, leg.knee, 'thighRadius'], ['Shin', leg.knee, leg.ankle, 'calfRadius']]) {
      const slot = mesh.skeleton.bones.indexOf(bones.get(joint + leg.side));
      if (slot < 0) continue;
      axis.subVectors(end, start); const length = axis.length(); axis.divideScalar(length);
      for (let i = 0; i < position.count; i++) {
        let weight = 0, hipWeight = 0;
        for (let j = 0; j < 4; j++) {
          if (skinIndex.getComponent(i, j) === slot) weight += skinWeight.getComponent(i, j);
          if (skinIndex.getComponent(i, j) === hips) hipWeight += skinWeight.getComponent(i, j);
        }
        if (weight + (joint === 'Thigh' ? hipWeight : 0) < .65) continue;
        mesh.getVertexPosition(i, vertex).applyMatrix4(mesh.matrixWorld); root.worldToLocal(vertex);
        if (weight < .65 && (vertex.x < 0 ? 'L' : 'R') !== leg.side) continue;
        offset.subVectors(vertex, start); const along = offset.dot(axis);
        if (along < length * .15 || along > length * .8) continue;
        metrics[metric] = Math.max(metrics[metric], offset.addScaledVector(axis, -along).length());
      }
    }
  });
  const inverse = root.getWorldQuaternion(new Quaternion()).invert();
  const feet = new Map(legs.map(({ side }) => [side, inverse.clone().multiply(bones.get('Foot' + side).getWorldQuaternion(new Quaternion()))]));
  return { root, metrics, feet, readSoleContacts: motion.readSoleContacts, wardrobe: createSeatedWardrobe(root, model, bones, metrics) };
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
  let rig, motion, gesture, endpoints, poseLayer, seatRig;
  let selection = { outfit: 'robe', wand: descriptor.defaultWand };
  const assertLive = () => { if (disposed) throw new Error('PRESENTATION_DISPOSED'); };
  function dispose() {
    if (disposed) return;
    disposed = true;
    poseLayer?.reset();
    seatRig?.wardrobe.dispose();
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
    seatRig = measureSeatedRig(root, model, rig.bones, motion);
    poseLayer = createCombatPoseLayer({ model, bones: rig.bones, clips: gltf.animations, enabled: actionLayersEnabled, seatRig });
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
    updateTravel(dt, actualHorizontalDistance = 0, grounded = true, verticalVelocity = 0, seated = false, seat = null) {
      assertLive();
      if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(actualHorizontalDistance) || actualHorizontalDistance < 0 || !Number.isFinite(verticalVelocity)) throw new Error('INVALID_TRAVEL_SAMPLE');
      unsupportedTravelState = null;
      poseLayer.restore();
      if (seated || !grounded || actualHorizontalDistance > 1e-6) gesture?.cancel();
      const influence = 1 - (gesture?.advance(dt) ?? 0);
      motion.update(dt, grounded && !seated ? actualHorizontalDistance : 0, influence);
      poseLayer.apply(dt, grounded, verticalVelocity, seated, seat);
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
