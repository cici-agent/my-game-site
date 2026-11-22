import { Euler, Group, MathUtils, Quaternion, Vector3 } from 'three';
import { createBroom } from './broom.mjs';

// Gameplay owns actor.root. Only an extra visual pivot and reversible joint
// overlays move here: authority coordinates, GLB bytes and source tracks stay intact.
export function attachCharacterStatePresentation(actor) {
  const root = actor.root, nodes = [...root.children], sourceRig = Boolean(actor.model.getObjectByName('Hips'));
  const hips = actor.model.getObjectByName('Hips') ?? actor.model.getObjectByName('LegL');
  root.updateMatrixWorld(true);
  const hipHeight = MathUtils.clamp(hips ? root.worldToLocal(hips.getWorldPosition(new Vector3())).y : .75, .55, 1.2);
  const pivot = new Group(), offset = new Group(); pivot.name = 'ReversibleTravelAndDownedPresentation'; offset.name = 'OriginalVisualOrigin';
  root.add(pivot); pivot.add(offset); nodes.forEach(node => offset.add(node));
  pivot.position.y = hipHeight; offset.position.y = -hipHeight;
  const broom = createBroom(); broom.root.name = 'MountedBroom'; broom.root.position.set(0, hipHeight - .09, .08); broom.root.visible = false; root.add(broom.root);
  const saved = new Map(), q = new Quaternion(), euler = new Euler();
  const named = name => actor.model.getObjectByName(name);
  let desired = { flying: false, downed: false, floorY: 0 }, ride = 0, down = 0, enabled = true, disposed = false;
  function restore() { for (const [node, rotation] of saved) node.quaternion.copy(rotation); saved.clear(); }
  function bend(name, x = 0, y = 0, z = 0) {
    const node = named(name); if (!node) return;
    if (!saved.has(node)) saved.set(node, node.quaternion.clone());
    q.setFromEuler(euler.set(x, y, z)); node.quaternion.multiply(q);
  }
  function aimJoint(node, endpoint, destination, weight) {
    if (!node) return;
    const start = node.getWorldPosition(new Vector3()), from = endpoint.clone().sub(start), to = destination.clone().sub(start);
    if (from.lengthSq() < 1e-8 || to.lengthSq() < 1e-8) return;
    if (!saved.has(node)) saved.set(node, node.quaternion.clone());
    const change = new Quaternion().setFromUnitVectors(from.normalize(), to.normalize());
    const desiredWorld = change.multiply(node.getWorldQuaternion(new Quaternion()));
    const local = node.parent.getWorldQuaternion(new Quaternion()).invert().multiply(desiredWorld);
    node.quaternion.slerp(local, weight); root.updateMatrixWorld(true);
  }
  function foldArm(side, target, weight) {
    const upper = named('Arm' + side), lower = named(sourceRig ? 'Forearm' + side : side === 'L' ? 'Elbow-1' : 'Elbow1'), hand = named(sourceRig ? 'Hand' + side : side === 'L' ? 'Wrist-1' : 'Wrist1');
    if (!upper || !lower || !hand) return;
    root.updateMatrixWorld(true);
    const start = upper.getWorldPosition(new Vector3()), elbow = lower.getWorldPosition(new Vector3()), end = hand.getWorldPosition(new Vector3());
    const lengthA = start.distanceTo(elbow), lengthB = elbow.distanceTo(end), destination = root.localToWorld(new Vector3(...target));
    const direction = destination.clone().sub(start), distance = MathUtils.clamp(direction.length(), .02, lengthA + lengthB - .003); direction.normalize();
    destination.copy(start).addScaledVector(direction, distance);
    const pole = new Vector3(1, 0, 0).applyQuaternion(root.getWorldQuaternion(new Quaternion())); pole.addScaledVector(direction, -pole.dot(direction)).normalize();
    const along = (lengthA * lengthA - lengthB * lengthB + distance * distance) / (2 * distance);
    const elbowGoal = start.clone().addScaledVector(direction, along).addScaledVector(pole, Math.sqrt(Math.max(0, lengthA * lengthA - along * along)));
    aimJoint(upper, elbow, elbowGoal, weight);
    aimJoint(lower, hand.getWorldPosition(new Vector3()), destination, weight);
  }
  function resetVisual() { restore(); ride = down = 0; pivot.rotation.set(0, 0, 0); pivot.position.set(0, hipHeight, 0); broom.root.visible = false; }
  const result = {
    ...actor,
    capabilities: Object.freeze({ ...actor.capabilities, visibleBroom: true, mountedPose: true, downedAndRevivePose: true }),
    setPresentationState({ flying = false, downed = false, floorY = 0 } = {}) {
      if (!Number.isFinite(floorY)) throw new Error('INVALID_PRESENTATION_FLOOR');
      if (downed && !desired.downed) {
        const actionId = actor.debugSnapshot?.().actionId; if (actionId) actor.cancelAction(actionId, 'downed');
      }
      if ((flying && !desired.flying) || (downed && !desired.downed)) actor.resetJumpPresentation?.();
      desired = { flying: Boolean(flying) && !downed, downed: Boolean(downed), floorY };
    },
    updateTravel(dt, distance = 0, grounded = true, verticalVelocity = 0, seated = false, seat = null) {
      if (disposed) throw new Error('PRESENTATION_DISPOSED');
      restore();
      const stateOnly = desired.flying || desired.downed;
      const value = actor.updateTravel(dt, stateOnly ? 0 : distance, stateOnly ? true : grounded, stateOnly ? 0 : verticalVelocity, stateOnly ? false : seated, stateOnly ? null : seat);
      if (!enabled) { resetVisual(); return value; }
      ride = MathUtils.damp(ride, desired.flying ? 1 : 0, 10, dt);
      down = MathUtils.damp(down, desired.downed ? 1 : 0, desired.downed ? 8 : 5, dt);
      if (ride < .001) ride = 0; if (down < .001) down = 0;
      const mounting = ride * (1 - down), direction = sourceRig ? -1 : 1;
      const casting = mounting > .001 && Boolean(actor.debugSnapshot?.().actionId);
      for (const [side, sign] of [['L', -1], ['R', 1]]) {
        bend(sourceRig ? 'Thigh' + side : 'Leg' + side, direction * (.88 * mounting + (side === 'L' ? .60 : .75) * down), 0, sign * (.16 * mounting - .10 * down));
        bend(sourceRig ? 'Shin' + side : side === 'L' ? 'Knee-1' : 'Knee1', -direction * (1.38 * mounting + (side === 'L' ? 1.05 : 1.20) * down));
        if (sourceRig) bend('Foot' + side, -.30 * mounting - .32 * down);
        if (side === 'L' || !casting) {
          bend('Arm' + side, direction * (.50 * mounting + .33 * down), sign * .05 * mounting, -sign * .10 * mounting);
          bend(sourceRig ? 'Forearm' + side : side === 'L' ? 'Elbow-1' : 'Elbow1', direction * (.66 * mounting + .24 * down));
        }
      }
      if (sourceRig) { bend('Chest', -.06 * mounting + .10 * down); bend('Head', .10 * mounting + .13 * down); }
      // Collapse around the hips onto a shallow floor clearance. This remains
      // near the ground even if the last network position was mid-jump.
      pivot.position.y = hipHeight * (1 - down) + (.25 + desired.floorY - root.position.y) * down;
      pivot.rotation.set(-.16 * mounting, 0, Math.PI * .5 * down);
      if (down > .01) {
        const scale = hipHeight / .89, floor = desired.floorY - root.position.y;
        foldArm('L', [-.48 * scale, floor + .13, -.39 * scale], down);
        foldArm('R', [-.40 * scale, floor + .22, -.28 * scale], down);
        const hand = named('HandR');
        if (hand && sourceRig) {
          const start = hand.getWorldPosition(new Vector3()), tip = actor.getCastOriginWorld(new Vector3());
          const restingDirection = new Vector3(-1, .03, -.2).applyQuaternion(root.getWorldQuaternion(new Quaternion()));
          aimJoint(hand, tip, start.clone().add(restingDirection), down);
        }
      }
      broom.root.visible = mounting > .02; broom.root.scale.setScalar(Math.max(.01, Math.min(1, mounting * 2)));
      broom.update(dt, { speed: desired.flying && dt > 0 ? distance / dt : 0, bank: 0 });
      return value;
    },
    playAuthoritativeAction(...args) { if (desired.downed) return { accepted: false, reason: 'DOWNED_PRESENTATION' }; return actor.playAuthoritativeAction(...args); },
    playStudioCast(id) { if (desired.downed || desired.flying) return false; return actor.playStudioCast(id); },
    prepareJump(options) { if (desired.downed || desired.flying || !enabled) return false; return actor.prepareJump?.(options) ?? false; },
    cancelJumpPreparation() { return actor.cancelJumpPreparation?.() ?? false; },
    setMotionLayersEnabled(value) { enabled = Boolean(value); if (!enabled) resetVisual(); actor.setMotionLayersEnabled(value); },
    resetPresentation(snapshot = {}) { resetVisual(); desired = { flying: false, downed: false, floorY: 0 }; actor.resetPresentation(snapshot); },
    debugSnapshot() { return { ...actor.debugSnapshot?.(), statePresentation: { flying: desired.flying, downed: desired.downed, rideWeight: ride, downWeight: down, broomVisible: broom.root.visible, hipHeight } }; },
    dispose() { if (disposed) return; disposed = true; restore(); broom.dispose(); actor.dispose(); },
  };
  return result;
}
