import * as THREE from 'three';

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
