import { Euler, Quaternion, Vector3 } from 'three';
import { createJumpPose } from './jump-pose.mjs';
import { solveSeatedContact } from './seating.mjs';

const clamp = value => Math.max(0, Math.min(1, value));
const ease = value => { const t = clamp(value); return t * t * (3 - 2 * t); };
const upperWeights = { Chest: .34, Cervical: .25, Head: .22, ArmR: 1, ForearmR: 1, HandR: 1, ArmL: .42, ForearmL: .42, HandL: .32 };
const visualProgress = state => state.now <= state.release ? clamp((state.now - state.start) / Math.max(1, state.release - state.start)) : 1 + clamp((state.now - state.holdUntil) / Math.max(1, state.end - state.holdUntil));
const timing = skill => ({ release: skill === 'H1' || skill === 'interrupt' ? 150 : 120, duration: 520 });

// This clock emits visual cues only. It never invokes damage/reward callbacks.
// All timestamps share the server clock and use milliseconds; dt uses seconds.
export function createActionTimeline() {
  let current = null, tail = null;
  const events = [], seen = new Set();
  function play(input, ...legacy) {
    if (typeof input === 'string') {
      const [skillId, start = 0, release, end, outcome] = legacy;
      input = { actionId: input, skillId, startAtMs: start * 1000, releaseAtMs: release * 1000, endAtMs: end * 1000, nowMs: start * 1000, outcome };
    }
    if (!input || typeof input.actionId !== 'string' || !input.actionId || input.actionId.length > 160) throw new Error('ACTION_ID_REQUIRED');
    const defaults = timing(input.skillId), start = input.startAtMs ?? input.nowMs ?? 0;
    const release = input.releaseAtMs ?? start + defaults.release;
    const end = input.endAtMs ?? Math.max(release + 180, start + defaults.duration);
    const holdUntil = input.holdUntilMs ?? release;
    const now = input.nowMs ?? start;
    if (![start, release, holdUntil, end, now].every(Number.isFinite) || release < start || holdUntil < release || holdUntil >= end || end <= release || end - start > 30000) throw new Error('INVALID_ACTION_TIMELINE');
    // Promote this instance's preview in place. The authoritative clock owns
    // cues; a separate monotonic pose phase prevents a delayed confirmation
    // from dragging an already raised wand back through its windup.
    if (input.confirmPreview && current?.preview && current.actionId === input.actionId) {
      const sampleProgress = Math.max(current.sampleProgress, visualProgress(current));
      Object.assign(current, { start, release, holdUntil, end, now, preview: false, released: false, sampleProgress });
      advance(0);
      return { accepted: true, reconciled: true, actionId: input.actionId };
    }
    if (seen.has(input.actionId)) return { accepted: false, reason: 'DUPLICATE_ACTION' };
    seen.add(input.actionId); if (seen.size > 256) seen.delete(seen.values().next().value);
    if (now >= end) return { accepted: false, reason: 'EXPIRED_ACTION' };
    if (current) cancel(current.actionId, 'superseded');
    current = { actionId: input.actionId, skillId: input.skillId ?? 'bolt', start, release, holdUntil, end, now, released: false, sampleProgress: 0, preview: Boolean(input.preview), outcome: input.outcome ?? null };
    tail = null;
    return { accepted: true, actionId: current.actionId, startAtMs: start, releaseAtMs: release, endAtMs: end };
  }
  function cancel(id, reason = 'cancelled') {
    if (!current || current.actionId !== id) return false;
    tail = { state: { ...current }, age: 0, duration: 120 };
    if (!current.preview) events.push({ type: 'cancel', actionId: id, reason }); current = null;
    return true;
  }
  function advance(dt) {
    if (!Number.isFinite(dt) || dt < 0) throw new Error('INVALID_ACTION_DELTA');
    if (tail) { tail.age += dt * 1000; if (tail.age >= tail.duration) tail = null; }
    if (!current) return;
    current.now += dt * 1000;
    current.sampleProgress = Math.max(current.sampleProgress, visualProgress(current));
    if (!current.released && current.now >= current.release) {
      current.released = true;
      if (!current.preview) events.push({ type: 'release', actionId: current.actionId, skillId: current.skillId, atMs: current.release, lateMs: Math.max(0, current.now - current.release), outcome: current.outcome });
    }
    if (current.now >= current.end) { if (!current.preview) events.push({ type: 'end', actionId: current.actionId, atMs: current.end }); current = null; }
  }
  return {
    play, cancel, advance,
    get current() { return current; },
    get pose() { return current ? { ...current, cancellationWeight: 1 } : tail ? { ...tail.state, cancellationWeight: 1 - ease(tail.age / tail.duration) } : null; },
    consumeEvents() { return events.splice(0); },
    reset() { current = null; tail = null; events.length = 0; },
    debug() { return { actionId: current?.actionId ?? null, phase: current ? current.now < current.start ? 'queued' : current.now < current.release ? 'windup' : current.now < current.holdUntil ? 'channel' : 'recovery' : tail ? 'cancel_fade' : 'idle', nowMs: current?.now ?? null }; },
  };
}

// No source tracks are rewritten. Only selected upper-body poses near the
// authored release are sampled into an instance-owned, reversible overlay.
export function createCombatPoseLayer({ model, bones, clips, enabled = true, seatRig = null }) {
  const saved = new Map(), savedMorphs = new Map(), cast = clips.find(clip => clip.name === 'Cast');
  const samplers = new Map();
  for (const name of Object.keys(upperWeights)) {
    const track = cast?.tracks.find(track => track.name === name + '.quaternion');
    if (track && bones.has(name)) samplers.set(name, track.createInterpolant(new Float32Array(4)));
  }
  const q = new Quaternion(), turn = new Quaternion(), euler = new Euler();
  const morphParts = [];
  model.traverse(mesh => {
    if (mesh.morphTargetInfluences && mesh.morphTargetDictionary) morphParts.push(mesh);
  });
  const timeline = createActionTimeline();
  const jump = createJumpPose();
  const footPoint = new Vector3();
  const seatSoles = Array.from({ length: 4 }, () => new Vector3());
  let sitting = 0, impact = 0, impactDirection = 1, hipCompression = 0, seatContact = null, lastSeat = null, initialized = false, context = { mood: 'neutral', intensity: .65, lookX: 0, lookY: 0, talking: false }, clock = 0;
  function remember(bone) {
    if (!saved.has(bone)) saved.set(bone, { quaternion: bone.quaternion.clone(), position: bone.position.clone() });
  }
  function rotate(name, x, y = 0, z = 0) {
    const bone = bones.get(name); if (!bone) return;
    remember(bone); turn.setFromEuler(euler.set(x, y, z)); bone.quaternion.multiply(turn);
  }
  function morph(name, value) {
    for (const mesh of morphParts) {
      const index = mesh.morphTargetDictionary[name]; if (index === undefined) continue;
      let values = savedMorphs.get(mesh); if (!values) { values = new Map(); savedMorphs.set(mesh, values); }
      if (!values.has(index)) values.set(index, mesh.morphTargetInfluences[index]);
      mesh.morphTargetInfluences[index] = clamp(mesh.morphTargetInfluences[index] + value);
    }
  }
  function restore() {
    for (const [bone, state] of saved) { bone.quaternion.copy(state.quaternion); bone.position.copy(state.position); }
    saved.clear();
    for (const [mesh, values] of savedMorphs) for (const [index, value] of values) mesh.morphTargetInfluences[index] = value;
    savedMorphs.clear();
  }
  function fitSeat(seat) {
    const solution = solveSeatedContact(seatRig?.metrics, seat);
    if (!solution || !seatRig || sitting < .00001) return false;
    const root = seatRig.root, hips = bones.get('Hips');
    root.updateMatrixWorld(true);
    const rootRotation = root.getWorldQuaternion(new Quaternion());
    const rootPosition = bone => root.worldToLocal(bone.getWorldPosition(new Vector3()));
    const hipLeft = rootPosition(bones.get('ThighL')), hipRight = rootPosition(bones.get('ThighR'));
    const centre = hipLeft.clone().add(hipRight).multiplyScalar(.5);
    const shift = new Vector3(0, solution.hipTarget.y - centre.y, solution.hipTarget.z - centre.z).multiplyScalar(sitting);
    // Transform a displacement, not a point: neither gameplay root nor the
    // source model changes when a bench is on an upper floor or turned around.
    const from = hips.getWorldPosition(new Vector3()), to = root.localToWorld(root.worldToLocal(from.clone()).add(shift));
    hips.parent.worldToLocal(to); remember(hips); hips.position.copy(to);
    root.updateMatrixWorld(true);
    const aim = (bone, endpoint, direction) => {
      const start = bone.getWorldPosition(new Vector3()), current = endpoint.getWorldPosition(new Vector3()).sub(start);
      const desired = direction.clone().applyQuaternion(rootRotation);
      const change = new Quaternion().setFromUnitVectors(current.normalize(), desired.normalize());
      const world = change.multiply(bone.getWorldQuaternion(new Quaternion()));
      const local = bone.parent.getWorldQuaternion(new Quaternion()).invert().multiply(world);
      remember(bone); bone.quaternion.slerp(local, sitting); root.updateMatrixWorld(true);
    };
    for (const side of ['L', 'R']) {
      const thigh = bones.get('Thigh' + side), shin = bones.get('Shin' + side), foot = bones.get('Foot' + side);
      aim(thigh, shin, new Vector3(0, -Math.cos(solution.hipAngle), -Math.sin(solution.hipAngle)));
      const lowerAngle = solution.hipAngle + solution.kneeAngle;
      aim(shin, foot, new Vector3(0, -Math.cos(lowerAngle), -Math.sin(lowerAngle)));
      const upright = foot.parent.getWorldQuaternion(new Quaternion()).invert().multiply(rootRotation.clone().multiply(seatRig.feet.get(side)));
      remember(foot); foot.quaternion.slerp(upright, sitting); root.updateMatrixWorld(true);
    }
    // During the sit/stand blend the hips can descend before both knees have
    // folded. Use the workshop's real heel/toe pads to keep that transient pose
    // above the deck; the adjustment vanishes once the seat is supporting it.
    if (seatRig.readSoleContacts?.(seatSoles)) {
      const lowest = Math.min(...seatSoles.map(point => root.worldToLocal(point).y));
      if (lowest < seat.floorY) {
        const localHip = rootPosition(hips); localHip.y += seat.floorY - lowest;
        hips.position.copy(hips.parent.worldToLocal(root.localToWorld(localHip)));
        root.updateMatrixWorld(true);
      }
    }
    seatContact = solution;
    return true;
  }
  function apply(dt, grounded, verticalVelocity, seated = false, seat = null) {
    clock += dt; timeline.advance(dt);
    if (!enabled) return;
    const jumpPose = jump.sample(dt, { grounded, verticalVelocity, suppressed: seated });
    if (!initialized && seated && seat) sitting = 1;
    initialized = true;
    sitting += ((seated ? 1 : 0) - sitting) * (1 - Math.exp(-12 * dt));
    if (seated) lastSeat = seat;
    if (sitting < .00001) { lastSeat = null; seatContact = null; }
    const fittedSeat = Boolean(lastSeat && seatRig);
    // Capture garment weights in the untouched standing pose, before fitting
    // the joints; only instance-owned buffers change during the reversible fold.
    seatRig?.wardrobe.update(fittedSeat ? sitting : 0);
    impact *= Math.exp(-10 * dt);
    const armInfluence = timeline.pose ? .25 : 1;
    const hips = bones.get('Hips');
    const support = hips && jumpPose.support > .0001 && Math.abs(jumpPose.thighL) + Math.abs(jumpPose.thighR) > .0001;
    const ankleHeight = () => {
      let height = 0;
      for (const side of ['L', 'R']) { const foot = bones.get('Foot' + side); if (foot) { foot.getWorldPosition(footPoint); hips.parent.worldToLocal(footPoint); height += footPoint.y * .5; } }
      return height;
    };
    const beforeFeet = support ? ankleHeight() : 0;
    for (const [side, sign] of [['L', -1], ['R', 1]]) {
      const thigh = jumpPose['thigh' + side], knee = jumpPose['knee' + side];
      rotate('Thigh' + side, thigh - (fittedSeat ? 0 : sitting * 1.15));
      rotate('Shin' + side, knee + (fittedSeat ? 0 : sitting * 1.38));
      rotate('Foot' + side, jumpPose['ankle' + side] - (fittedSeat ? 0 : sitting * .2));
      rotate('Arm' + side, jumpPose.arm * armInfluence, 0, sign * jumpPose.spread * armInfluence);
      rotate('Forearm' + side, jumpPose.elbow * armInfluence);
    }
    rotate('Chest', jumpPose.chest - impact * .13, impactDirection * impact * .025);
    rotate('Head', impact * .09 + jumpPose.head);
    // Compare the actual posed ankles, including the workshop's already bent
    // idle/walk knees. A neutral-leg approximation leaves the shoes hovering.
    hipCompression = support ? Math.max(0, ankleHeight() - beforeFeet) * jumpPose.support : 0;
    if (hips && (hipCompression || sitting && !fittedSeat)) { remember(hips); hips.position.y -= hipCompression + (fittedSeat ? 0 : sitting * .10); }
    if (fittedSeat) fitSeat(lastSeat);

    const action = timeline.pose;
    if (action && action.now >= action.start) {
      const progress = action.sampleProgress ?? visualProgress(action), before = progress <= 1;
      const phase = ease(before ? progress : progress - 1);
      const sampleTime = before ? 2.20 + .2583333333 * phase : 2.4583333333 + .22 * phase;
      const weight = (before ? phase : 1 - ease((phase - .1) / .9)) * action.cancellationWeight;
      for (const [name, sample] of samplers) {
        const bone = bones.get(name); remember(bone);
        q.fromArray(sample.evaluate(Math.min(sampleTime, cast.duration)));
        bone.quaternion.slerp(q, weight * upperWeights[name]);
      }
      morph('CastingGrip', weight * .9); morph('FaceFocus', weight * .35); morph('FaceLipPress', weight * .20);
    }
    const amount = context.intensity;
    if (context.mood === 'focused' || context.mood === 'combat') { morph('FaceFocus', amount * .55); morph('FaceLipPress', amount * .22); }
    if (context.mood === 'happy') { morph('FaceCorner', amount * .36); morph('FaceCheekLiftL', amount * .3); morph('FaceCheekLiftR', amount * .3); }
    if (context.mood === 'hurt') { morph('FaceBlinkL', amount * .25); morph('FaceBlinkR', amount * .32); morph('FaceFocus', amount * .4); }
    if (context.mood === 'curious') { morph('FaceBrowLiftL', amount * .35); morph('FaceBrowLiftR', amount * .25); }
    morph('FaceLookLeft', Math.max(0, -context.lookX) * .5); morph('FaceLookRight', Math.max(0, context.lookX) * .5);
    morph('FaceLookUp', Math.max(0, context.lookY) * .4); morph('FaceLookDown', Math.max(0, -context.lookY) * .4);
    if (context.talking) { morph('FaceJawBreath', (.1 + .09 * Math.sin(clock * 13)) * amount); morph('FaceLipRound', (.08 + .07 * Math.sin(clock * 9.7)) * amount); }
    if (impact > .005) { morph('FaceBlinkL', impact * .38); morph('FaceBlinkR', impact * .28); }
  }
  return {
    timeline, restore, apply,
    setEnabled(value) { restore(); enabled = Boolean(value); if (!enabled) { jump.reset(); seatRig?.wardrobe.update(0); } },
    get enabled() { return enabled; },
    playHit({ strength = 1, direction = 1 } = {}) {
      if (!Number.isFinite(strength) || !Number.isFinite(direction)) throw new Error('INVALID_HIT_POSE');
      impact = clamp(strength); impactDirection = Math.sign(direction) || 1;
    },
    setExpressionContext(value = {}) {
      if (!['neutral', 'focused', 'combat', 'happy', 'hurt', 'curious'].includes(value.mood ?? 'neutral')) throw new Error('UNKNOWN_EXPRESSION_MOOD');
      const intensity = value.intensity ?? .65, lookX = value.lookX ?? 0, lookY = value.lookY ?? 0;
      if (![intensity, lookX, lookY].every(Number.isFinite)) throw new Error('INVALID_EXPRESSION_CONTEXT');
      context = { mood: value.mood ?? 'neutral', intensity: clamp(intensity), lookX: Math.max(-1, Math.min(1, lookX)), lookY: Math.max(-1, Math.min(1, lookY)), talking: Boolean(value.talking) };
      return { applied: morphParts.length > 0, reason: morphParts.length ? null : 'PUBLISHED_MODEL_HAS_NO_FACIAL_MORPHS' };
    },
    prepareJump(options) { return enabled && jump.prepare(options); },
    cancelJumpPreparation: jump.cancelPreparation,
    resetJumpPresentation: jump.reset,
    reset() { restore(); timeline.reset(); jump.reset(); sitting = impact = hipCompression = 0; seatContact = lastSeat = null; initialized = false; seatRig?.wardrobe.update(0); },
    debug() { const state = jump.debug(); return { ...timeline.debug(), enabled, airWeight: state.airWeight, landing: state.landingWeight, jump: { ...state, compression: hipCompression }, sitting, seatContact, impact, expression: { ...context }, sampledUpperBones: [...samplers.keys()] }; },
  };
}
