import * as THREE from 'three';
import { solveSeatedContact } from './seating.mjs';

// Retarget the independently authored NPCs before the final wardrobe bake.
// Feet and hands retain their shape: added length belongs to the two long bones,
// not to a non-uniformly scaled limb parent (which would shear a bent ankle).
const originalHip = .65, originalThigh = .30, originalShin = .25;
const originalLeg = originalThigh + originalShin;
const originalArm = .205 + .192;

function lengthenRig(parent, rig, kind, stretch) {
  const length = kind === 'leg' ? originalLeg : originalArm;
  const extra = length * (stretch - 1);
  for (const node of parent.children) {
    if (!node.isSkinnedMesh) continue;
    const positions = node.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      const y = positions.getY(i);
      positions.setY(i, y >= -length ? y * stretch : y - extra);
    }
    positions.needsUpdate = true; node.geometry.computeVertexNormals();
    node.geometry.boundingBox = null; node.geometry.boundingSphere = null;
    node.boundingBox = null; node.boundingSphere = null;
  }
  rig.bend.position.y *= stretch; rig.tip.position.y *= stretch;
  rig.tipOffset.copy(rig.bend.position).add(rig.tip.position);
}

function bindRestPose(parent, rig) {
  const meshes = parent.children.filter(node => node.isSkinnedMesh);
  if (!meshes.length) return;
  // All vertices and joints must describe the same final rest pose. Rebinding
  // after the body fit avoids stale inverse matrices from the old short legs.
  meshes[0].skeleton.calculateInverses();
  for (const mesh of meshes) mesh.bind(mesh.skeleton, parent.matrixWorld.clone());
}

export function fitNpcProportions({ id, root, body, head, arms, legs, armRigs, legRigs }) {
  if (id === 'hagrid' || id === 'flitwick') return null;
  root.updateMatrixWorld(true);
  const before = new THREE.Box3().setFromObject(root);
  const oldScale = body.scale.clone(), oldHeight = before.max.y - before.min.y;
  const hipLift = originalHip * .40;
  const legStretch = (originalLeg + hipLift) / originalLeg;
  const upperLift = hipLift;
  for (const child of body.children) child.position.y += upperLift;
  for (let i = 0; i < legs.length; i++) {
    lengthenRig(legs[i], legRigs[i], 'leg', legStretch);
    lengthenRig(arms[i], armRigs[i], 'arm', 1.25);
  }
  const fit = oldHeight / (oldHeight + upperLift * oldScale.y);
  body.scale.multiplyScalar(fit);
  // Keep a deliberate eight-percent narrower silhouette after fitting height.
  body.scale.x *= .92 / fit; body.scale.z *= .92 / fit;
  // Faces keep a uniform fit instead of becoming short/wide during normalization.
  head.scale.x *= fit / .92; head.scale.z *= fit / .92;
  const groundOffset = before.min.y * (1 - fit);
  body.position.y = groundOffset;
  root.updateMatrixWorld(true);
  for (let i = 0; i < legs.length; i++) { bindRestPose(legs[i], legRigs[i]); bindRestPose(arms[i], armRigs[i]); }
  const thigh = originalThigh * legStretch, shin = originalShin * legStretch;
  const ankleDepth = thigh + shin;
  const seatDrop = .23 + legs[0].position.y * body.scale.y - originalHip * oldScale.y + groundOffset;
  const sitHip = Math.acos(THREE.MathUtils.clamp((ankleDepth - seatDrop / body.scale.y - shin) / thigh, -.08, .30));
  const measurements = Object.freeze({
    hip: legs[0].position.y, shoulder: arms[0].position.y, head: head.position.y,
    thigh, shin, legStretch, heightFit: fit, groundOffset, seatDrop,
    originalHeight: oldHeight, originalFloor: before.min.y, originalWidth: before.max.x - before.min.x,
    // Exclude optional pointed hats from anatomical stature.
    anatomicalCrown: head.position.y + .264 * head.scale.y,
    lowerBodyRatio: legs[0].position.y / (head.position.y + .264 * head.scale.y),
  });
  function animate() {
    body.position.y += groundOffset;
    for (let i = 0; i < legs.length; i++) {
      const leg = legs[i], rig = legRigs[i], oldHip = leg.rotation.x, oldKnee = rig.bend.rotation.x;
      const footAngle = oldHip + oldKnee + rig.tip.rotation.x;
      // Reuse the shared controller's contact/swing path, with the ankle lowered
      // by the exact hip lift. This retains planted feet and existing cadence.
      const y = -originalThigh * Math.cos(oldHip) - originalShin * Math.cos(oldHip + oldKnee) - hipLift;
      const z = -originalThigh * Math.sin(oldHip) - originalShin * Math.sin(oldHip + oldKnee);
      const distance = THREE.MathUtils.clamp(Math.hypot(y, z), .12, ankleDepth - .001);
      const hip = Math.atan2(-z, -y) + Math.acos(THREE.MathUtils.clamp((thigh * thigh + distance * distance - shin * shin) / (2 * thigh * distance), -1, 1));
      const knee = -(Math.PI - Math.acos(THREE.MathUtils.clamp((thigh * thigh + shin * shin - distance * distance) / (2 * thigh * shin), -1, 1)));
      leg.rotation.x = hip; rig.bend.rotation.x = knee; rig.tip.rotation.x = footAngle - hip - knee;
    }
  }
  function sit(amount) {
    body.position.y -= seatDrop * amount;
    for (let i = 0; i < legs.length; i++) {
      legs[i].rotation.x = THREE.MathUtils.lerp(legs[i].rotation.x, sitHip, amount);
      legRigs[i].bend.rotation.x = THREE.MathUtils.lerp(legRigs[i].bend.rotation.x, -sitHip, amount);
      legRigs[i].tip.rotation.x = THREE.MathUtils.lerp(legRigs[i].tip.rotation.x, 0, amount);
    }
  }
  return { measurements, animate, sit };
}

// Measure the already-fitted rig and its actual boot/thigh vertices. Neither
// actor identity nor an authored root-height correction determines seat contact.
export function createNpcSeating({ body, legs, legRigs }) {
  const leg = legs[0], rig = legRigs[0], sy = body.scale.y, sz = body.scale.z;
  const thigh = -rig.bend.position.y, shin = -rig.tip.position.y;
  let soleY = Infinity, thighBack = 0, calfBack = 0;
  for (const mesh of leg.children) {
    if (!mesh.isSkinnedMesh) continue;
    const vertices = mesh.geometry.attributes.position;
    for (let i = 0; i < vertices.count; i++) {
      const y = vertices.getY(i), z = vertices.getZ(i);
      soleY = Math.min(soleY, y);
      if (y > -thigh * .66) thighBack = Math.max(thighBack, z);
      if (y < -thigh * .85) calfBack = Math.max(calfBack, z);
    }
  }
  const restBody = { y: body.position.y, z: body.position.z };
  const metrics = Object.freeze({
    thighLength: thigh * sy, shinLength: shin * sy,
    soleBelowAnkle: (-thigh - shin - soleY) * sy,
    thighRadius: thighBack * sy, calfRadius: calfBack * sz,
    restHip: Object.freeze({ y: restBody.y + leg.position.y * sy, z: restBody.z + leg.position.z * sz }),
    pelvisBack: thighBack * sz, forwardScale: sz / sy,
  });
  // The coat is not part of the leg skeleton. Give its lower panels a reversible
  // lap fold, including trim/buttons, instead of letting a standing skirt pass
  // vertically through the cushion. The rest geometry remains byte-identical.
  const garments = [], hipY = leg.position.y, hipZ = leg.position.z;
  for (const mesh of body.children) {
    if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.isInstancedMesh) continue;
    const source = mesh.geometry.attributes.position, folded = source.clone();
    let changed = false;
    for (let i = 0; i < source.count; i++) {
      const y = source.getY(i), z = source.getZ(i), blend = THREE.MathUtils.smoothstep(hipY + .16 - y, 0, .16);
      if (!blend) continue;
      const lapY = Math.max(hipY - (z - hipZ), hipY - thighBack + .012);
      const lapZ = hipZ + Math.min(0, y - hipY);
      folded.setY(i, THREE.MathUtils.lerp(y, lapY, blend));
      folded.setZ(i, THREE.MathUtils.lerp(z, lapZ, blend)); changed = true;
    }
    if (!changed) continue;
    const normalGeometry = mesh.geometry.clone(); normalGeometry.setAttribute('position', folded); normalGeometry.computeVertexNormals();
    mesh.geometry.morphAttributes.position = [folded];
    mesh.geometry.morphAttributes.normal = [normalGeometry.attributes.normal.clone()];
    mesh.geometry.morphTargetsRelative = false; normalGeometry.dispose();
    mesh.updateMorphTargets(); mesh.morphTargetInfluences[0] = 0;
    mesh.userData.seatedWardrobe = true; garments.push(mesh);
  }
  let solution = null;
  function apply(amount, seat) {
    solution = solveSeatedContact(metrics, seat);
    const weight = solution ? amount : 0;
    for (const mesh of garments) mesh.morphTargetInfluences[0] = weight;
    if (!solution) return false;
    body.position.y = THREE.MathUtils.lerp(body.position.y, restBody.y + solution.bodyOffset.y, amount);
    body.position.z = THREE.MathUtils.lerp(body.position.z, restBody.z + solution.bodyOffset.z, amount);
    body.position.x *= 1 - amount;
    body.rotation.x *= 1 - amount; body.rotation.y *= 1 - amount; body.rotation.z *= 1 - amount;
    for (let i = 0; i < legs.length; i++) {
      legs[i].rotation.x = THREE.MathUtils.lerp(legs[i].rotation.x, solution.hipAngle, amount);
      legs[i].rotation.y *= 1 - amount; legs[i].rotation.z *= 1 - amount;
      legRigs[i].bend.rotation.x = THREE.MathUtils.lerp(legRigs[i].bend.rotation.x, solution.kneeAngle, amount);
      legRigs[i].tip.rotation.x = THREE.MathUtils.lerp(legRigs[i].tip.rotation.x, solution.ankleAngle, amount);
    }
    return true;
  }
  return { apply, metrics, snapshot: () => solution && { ...solution, metrics, garmentCount: garments.length } };
}
