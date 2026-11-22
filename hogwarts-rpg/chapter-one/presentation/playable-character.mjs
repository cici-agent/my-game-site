import { Matrix4, Vector3 } from 'three';
import { createAvatar } from '../../world/player.mjs';
import { loadCharacterPresentation } from './character-adapter.mjs';
import { createActionTimeline } from './action-layer.mjs';
import { attachCharacterStatePresentation } from './state-layer.mjs';

// Neville and George reuse their existing rig. They are deliberately identified
// as legacy art, not silently substituted for any of the three workshop models.
export function createLegacyCharacterPresentation(heroId) {
  if (!['neville', 'george'].includes(heroId)) throw new Error('LEGACY_CHARACTER_NOT_ALLOWED');
  const avatar = createAvatar({ variant: heroId, name: heroId === 'neville' ? '纳威' : '乔治', isPlayer: true });
  const timeline = createActionTimeline();
  const seatPose = [];
  function restoreSeat() { for (const [node, rotation, position] of seatPose) { node.quaternion.copy(rotation); node.position.copy(position); } seatPose.length = 0; }
  let disposed = false, enabled = true, seated = false, lastVisualAge = 0, activeId = null;
  const live = () => { if (disposed) throw new Error('PRESENTATION_DISPOSED'); };
  const actor = {
    root: avatar.root, model: avatar.root,
    walkSpeed: 1.308, runSpeed: 2.808,
    capabilities: Object.freeze({ heroId, assetVersion: 'existing-rpg-procedural', appearance: 'existing-procedural-character', facialMorphs: false, facialDegradation: 'NO_FACE_MORPHS_IN_LEGACY_MODEL', distanceDrivenWalkRun: true, combatFastCast: true, movingCast: true, jumpingCast: true, airborneMotion: true, seatedMotion: true, studioFullCast: false, validation: 'EXISTING_RIG_ADAPTER; DETAILED_WORKSHOP_ART_NOT_AVAILABLE_FOR_THIS_HERO' }),
    updateTravel(dt, distance = 0, grounded = true, verticalVelocity = 0, isSeated = false) {
      live();
      if (![dt, distance, verticalVelocity].every(Number.isFinite) || dt < 0 || distance < 0) throw new Error('INVALID_TRAVEL_SAMPLE');
      seated = isSeated;
      const priorAction = timeline.current;
      timeline.advance(dt);
      let animationDt = dt;
      const action = timeline.current ?? priorAction;
      if (action && action.now >= action.start && enabled) {
        if (activeId !== action.actionId) { activeId = action.actionId; lastVisualAge = 0; avatar.playAction('bolt'); }
        // Remap only the existing short procedural action, never a workshop
        // clip: its 0.14 s release is aligned to the authoritative timestamp.
        const visualAge = Math.min(.56, action.now <= action.release
          ? .14 * (action.now - action.start) / Math.max(1, action.release - action.start)
          : .14 + .42 * Math.max(0, action.now - action.holdUntil) / (action.end - action.holdUntil));
        animationDt = Math.max(0, visualAge - lastVisualAge); lastVisualAge = visualAge;
      } else activeId = null;
      // The old rig advances a stride from speed * dt, so preserve the actual
      // covered distance even during this short action clock conversion.
      const speed = animationDt > 0 && grounded && !seated ? distance / animationDt : 0;
      restoreSeat();
      const steps = Math.max(1, Math.ceil(animationDt / .08));
      for (let i = 0; i < steps; i++) avatar.animate(animationDt / steps, { moving: speed > .001, speed, grounded, verticalVelocity, combat: Boolean(action), casting: false });
      if (seated && enabled) {
        for (const [name, bend] of [['LegL', .9], ['LegR', .9], ['Knee-1', -1.1], ['Knee1', -1.1]]) {
          const node = avatar.root.getObjectByName(name); if (!node) continue;
          seatPose.push([node, node.quaternion.clone(), node.position.clone()]); node.rotation.x += bend;
        }
      }
      return { supported: true, reason: null };
    },
    playAuthoritativeAction(...args) { live(); return timeline.play(...args); },
    cancelAction(id, reason) { live(); const cancelled = timeline.cancel(id, reason); if (cancelled) { avatar.resetMotion(); activeId = null; } return cancelled; },
    consumePresentationEvents() { live(); return timeline.consumeEvents(); },
    playStudioCast() { live(); return false; },
    playHit() { live(); avatar.playAction('hit'); },
    getCastOriginWorld(out = new Vector3()) { live(); return avatar.getWandTip(out); },
    getAnchorWorldMatrix(name, out = new Matrix4()) { live(); if (name !== 'backAccessory') throw new Error('UNKNOWN_PRESENTATION_ANCHOR'); const body = avatar.root.getObjectByName('Body'); body.updateWorldMatrix(true, false); return out.copy(body.matrixWorld); },
    readSoleContacts() { live(); return false; },
    setVisualLoadout() { live(); return { applied: false, reason: 'EXISTING_CHARACTER_APPEARANCE_PRESERVED' }; },
    setExpressionContext() { live(); return { applied: false, reason: 'NO_FACE_MORPHS_IN_LEGACY_MODEL' }; },
    setMotionLayersEnabled(value) { live(); enabled = Boolean(value); if (!enabled) { restoreSeat(); avatar.resetMotion(); } },
    resetPresentation(snapshot = {}) { live(); restoreSeat(); timeline.reset(); avatar.resetMotion(); activeId = null; lastVisualAge = 0; if (snapshot.position) avatar.root.position.fromArray(snapshot.position); if (Number.isFinite(snapshot.yaw)) avatar.root.rotation.y = snapshot.yaw; },
    debugSnapshot() { live(); return { ...timeline.debug(), seated, legacyMotion: avatar.getMotionState() }; },
    dispose() { if (disposed) return; disposed = true; timeline.reset(); avatar.dispose(); },
  };
  return actor;
}

export async function loadPlayableCharacter(heroId, assetVersion, visualLoadout) {
  const actor = ['neville', 'george'].includes(heroId) ? createLegacyCharacterPresentation(heroId) : await loadCharacterPresentation(heroId, assetVersion, visualLoadout);
  return attachCharacterStatePresentation(actor);
}
