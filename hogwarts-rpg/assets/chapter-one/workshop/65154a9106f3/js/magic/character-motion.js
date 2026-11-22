import { createTravelExpression } from './portrait-expression.js';
// The shared Walk and Run cycles both begin on the left heel strike.
const REFERENCE_WALK_SPEED = 1.09;
const REFERENCE_RUN_SPEED = 2.34;
export const GAME_GAIT_RATE = 1.2;
export const DEFAULT_WALK_SPEED = REFERENCE_WALK_SPEED * GAME_GAIT_RATE;
export const DEFAULT_RUN_SPEED = REFERENCE_RUN_SPEED * GAME_GAIT_RATE;
const PASSING_PHASE = 0.27;

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function clipSpeed(definitions, name, fallback) {
  const speed = definitions.find(clip => clip.name === name)?.extras?.groundSpeed;
  return Number.isFinite(speed) && speed > 0 ? speed : fallback;
}

// Quaternion-blended legs can stretch below the two original poses even if
// both source clips have perfect contacts. Collect real, rigidly skinned shoe
// vertices once, then raise the hips only if a blended sole crosses the floor.
function measureFootwear(root) {
  const hips = root.getObjectByName('Hips');
  if (!hips?.parent) return null;
  const groups = [];
  const localPoint = root.position.clone();
  root.traverse(mesh => {
    if (!mesh.isSkinnedMesh) return;
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    if (!position || !skinIndex || !skinWeight) return;
    for (const side of ['L', 'R']) {
      const slot = mesh.skeleton.bones.findIndex(bone => bone.name === 'Foot' + side);
      if (slot < 0) continue;
      const inverseBind = mesh.skeleton.boneInverses[slot];
      const ankleY = inverseBind.clone().invert().elements[13];
      const points = new Map();
      for (let i = 0; i < position.count; i++) {
        let weight = 0;
        for (let j = 0; j < 4; j++) {
          if (skinIndex.getComponent(i, j) === slot) weight += skinWeight.getComponent(i, j);
        }
        if (weight < 0.995) continue;
        localPoint.fromBufferAttribute(position, i).applyMatrix4(mesh.bindMatrix);
        if (localPoint.y > ankleY + 0.025) continue;
        localPoint.applyMatrix4(inverseBind);
        const key = Math.round(localPoint.x * 10000) + ',' + Math.round(localPoint.y * 10000) + ',' + Math.round(localPoint.z * 10000);
        if (!points.has(key)) points.set(key, localPoint.toArray());
      }
      if (points.size) groups.push({ mesh, bone: mesh.skeleton.bones[slot], inverseBind, side, points: [...points.values()].flat() });
    }
  });
  if (!groups.length) return null;
  // Calibrate heel and forefoot centres against the rigid sole in bind
  // space (+Z forward), before converting each pad into foot-bone space.
  const pads = [];
  for (const side of ['L', 'R']) {
    const cloud = [];
    let foot;
    for (const group of groups) {
      if (group.side !== side) continue;
      let ancestor = group.mesh;
      while (ancestor !== root && ancestor.visible) ancestor = ancestor.parent;
      if (ancestor !== root) continue;
      foot = group;
      const bind = group.inverseBind.clone().invert();
      for (let i = 0; i < group.points.length; i += 3) {
        cloud.push(localPoint.clone().fromArray(group.points, i).applyMatrix4(bind));
      }
    }
    if (!cloud.length) continue;
    const bottom = cloud.reduce((y, p) => Math.min(y, p.y), Infinity);
    const low = cloud.filter(p => p.y < bottom + .021);
    const zMin = low.reduce((z, p) => Math.min(z, p.z), Infinity);
    const zMax = low.reduce((z, p) => Math.max(z, p.z), -Infinity);
    for (const fraction of [.15, .80]) {
      const z = zMin + (zMax - zMin) * fraction;
      const band = low.filter(p => Math.abs(p.z-z) <= (zMax-zMin)*.14);
      const points = band.length ? band : low;
      const left = points.reduce((x, p) => Math.min(x, p.x), Infinity);
      const right = points.reduce((x, p) => Math.max(x, p.x), -Infinity);
      const y = points.reduce((min, p) => Math.min(min, p.y), Infinity);
      const local = localPoint.clone().set((left+right)*.5, y, z).applyMatrix4(foot.inverseBind);
      pads.push({bone: foot.bone, local});
    }
  }
  function readContacts(out) {
    if (pads.length !== 4) return false;
    for (let i=0; i<pads.length; i++) {
      const {bone, local} = pads[i];
      bone.updateWorldMatrix(true, false);
      out[i].copy(local).applyMatrix4(bone.matrixWorld);
    }
    return true;
  }
  const rootInverse = root.matrixWorld.clone();
  const transform = root.matrixWorld.clone();
  const priorLift = root.position.clone().set(0, 0, 0);
  function restore() {
    hips.position.sub(priorLift);
    priorLift.set(0, 0, 0);
  }
  function lift() {
    root.updateWorldMatrix(true, false);
    rootInverse.copy(root.matrixWorld).invert();
    let minimum = Infinity;
    for (const { mesh, bone, points } of groups) {
      let ancestor = mesh;
      while (ancestor && ancestor !== root && ancestor.visible) ancestor = ancestor.parent;
      if (ancestor !== root) continue;
      bone.updateWorldMatrix(true, false);
      const e = transform.multiplyMatrices(rootInverse, bone.matrixWorld).elements;
      for (let i = 0; i < points.length; i += 3) {
        minimum = Math.min(minimum, e[1] * points[i] + e[5] * points[i + 1] + e[9] * points[i + 2] + e[13]);
      }
    }
    if (minimum >= 0) return;
    hips.parent.updateWorldMatrix(true, false);
    transform.copy(hips.parent.matrixWorld).invert().multiply(root.matrixWorld);
    priorLift.setFromMatrixColumn(transform, 1).multiplyScalar(Math.min(-minimum, 0.04));
    hips.position.add(priorLift);
  }
  return { restore, lift, readContacts };
}

// Distance is horizontal travel after collision resolution, in scene metres.
// A full-body action can fade the optional influence down while it takes over.
export function createCharacterMotion(mixer, clips, definitions = []) {
  const idleClip = clips.find(clip => clip.name === 'Idle');
  const walkClip = clips.find(clip => clip.name === 'Walk');
  const runClip = clips.find(clip => clip.name === 'Run');
  if (!idleClip || !(walkClip?.duration > 0)) {
    throw new Error('The student rig requires Idle and Walk animation clips.');
  }

  const idle = mixer.clipAction(idleClip).play();
  const walk = mixer.clipAction(walkClip).play();
  const run = runClip?.duration > 0 ? mixer.clipAction(runClip).play() : null;
  // Pose a gait from the shared phase. Only idle and other actions use the
  // mixer's wall clock, so starting a run cannot restart the opposite leg.
  walk.paused = true;
  if (run) run.paused = true;
  const authoredWalkSpeed = clipSpeed(definitions, 'Walk', REFERENCE_WALK_SPEED);
  const authoredRunSpeed = run
    ? clipSpeed(definitions, 'Run', authoredWalkSpeed * REFERENCE_RUN_SPEED / REFERENCE_WALK_SPEED)
    : authoredWalkSpeed * 1.65;
  const walkSpeed = authoredWalkSpeed * GAME_GAIT_RATE;
  const runSpeed = authoredRunSpeed * GAME_GAIT_RATE;
  const footwear = measureFootwear(mixer.getRoot());
  const face = createTravelExpression(mixer.getRoot());
  // Keep the distance between footfalls calibrated to the model. Moving
  // faster then advances the gait phase faster without sliding a planted foot.
  const walkStride = authoredWalkSpeed * walkClip.duration;
  const runStride = run ? authoredRunSpeed * runClip.duration : walkStride;

  let phase = PASSING_PHASE;
  let movement = 0;
  let running = 0;

  function sample(influence) {
    idle.setEffectiveWeight((1 - movement) * influence);
    walk.setEffectiveWeight(movement * (1 - running) * influence);
    walk.time = phase * walkClip.duration;
    if (run) {
      run.setEffectiveWeight(movement * running * influence);
      run.time = phase * runClip.duration;
    }
  }

  function reset() {
    face?.restore();
    footwear?.restore();
    phase = PASSING_PHASE;
    movement = 0;
    running = 0;
    sample(1);
    mixer.update(0);
  }

  function update(dt, horizontalDistance = 0, influence = 1) {
    if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(horizontalDistance)) return;
    if (dt > 0) {
      const distance = Math.max(0, horizontalDistance);
      const speed = distance / dt;
      // Analog input below a full walk shortens the applied step. Keep a
      // small fade on obstacle contact even if physical speed stops instantly.
      const targetMovement = clamp01(speed / (0.84 * walkSpeed));
      const range = Math.max(0.1, runSpeed - walkSpeed);
      const ratio = clamp01((speed - walkSpeed) / range);
      const targetRunning = run ? ratio * ratio * (3 - 2 * ratio) : 0;
      // Midpoint integration keeps variable-frame travel and blending aligned.
      // Substeps affect only three scalars; the rig is sampled once per render.
      const steps = Math.min(30, Math.ceil(dt * 120));
      const interval = dt / steps;
      const covered = distance / steps;
      const movementGain = -Math.expm1(-17 * interval);
      const runGain = -Math.expm1(-13 * interval);
      for (let i = 0; i < steps; i++) {
        const nextMovement = movement + (targetMovement - movement) * movementGain;
        const nextRunning = running + (targetRunning - running) * runGain;
        const midRun = (running + nextRunning) * 0.5;
        const stride = walkStride + (runStride - walkStride) * midRun;
        const size = Math.max(0.32, (movement + nextMovement) * 0.5);
        phase = (phase + covered / (stride * size)) % 1;
        movement = nextMovement;
        running = nextRunning;
      }
      if (distance === 0 && movement < 0.0001) {
        phase = PASSING_PHASE;
        movement = 0;
        running = 0;
      }
    }
    face?.restore();
    footwear?.restore();
    sample(clamp01(influence));
    mixer.update(dt);
    face?.apply(dt, movement * clamp01(influence), running);
    const betweenGaits = movement > 0.0001 && (movement < 0.9999 || (running > 0.0001 && running < 0.9999));
    if (betweenGaits && influence >= 1) footwear?.lift();
  }

  reset();
  return { walkSpeed, runSpeed, update, reset, readSoleContacts: footwear?.readContacts };
}
