// Shape names are exact, normalized spellings. An imported rig can explicitly
// register its own names per semantic; unrelated targets are never inferred.
const targetNames = {
  blink: ['blink', 'eyesClosed', 'Fcl_EYE_Close'],
  blinkLeft: ['FaceBlinkL', 'eyeBlinkLeft', 'blinkLeft', 'blink_L', 'Fcl_EYE_Close_L'],
  blinkRight: ['FaceBlinkR', 'eyeBlinkRight', 'blinkRight', 'blink_R', 'Fcl_EYE_Close_R'],
  lookLeft: ['FaceLookLeft', 'lookLeft', 'eyesLookLeft'],
  lookRight: ['FaceLookRight', 'lookRight', 'eyesLookRight'],
  lookUp: ['FaceLookUp', 'lookUp', 'eyesLookUp'],
  lookDown: ['FaceLookDown', 'lookDown', 'eyesLookDown'],
  leftEyeLeft: ['eyeLookOutLeft'],
  leftEyeRight: ['eyeLookInLeft'],
  rightEyeLeft: ['eyeLookInRight'],
  rightEyeRight: ['eyeLookOutRight'],
  leftEyeUp: ['eyeLookUpLeft'],
  leftEyeDown: ['eyeLookDownLeft'],
  rightEyeUp: ['eyeLookUpRight'],
  rightEyeDown: ['eyeLookDownRight'],
  jaw: ['FaceJawBreath', 'jawOpen', 'mouthOpen'],
  lips: ['FaceLipRound', 'mouthFunnel'],
  nose: ['FaceNoseBreath', 'nostrilFlare', 'noseFlare'],
  cheekLeft: ['FaceCheekLiftL', 'cheekSquintLeft', 'cheekRaiseLeft'],
  cheekRight: ['FaceCheekLiftR', 'cheekSquintRight', 'cheekRaiseRight']
};

const normalize = name => name.toLowerCase().replace(/[\s._-]/g, '');
const clamp01 = value => Math.min(1, Math.max(0, value));

function shapeNames(aliases) {
  const map = new Map();
  for (const [key, defaults] of Object.entries(targetNames)) {
    const supplied = aliases[key];
    const names = supplied == null ? [] : [supplied].flat();
    for (const name of [...defaults, ...names]) {
      if (typeof name !== 'string' || !name.trim()) continue;
      const normalized = normalize(name);
      const earlier = map.get(normalized);
      if (earlier && earlier !== key) {
        throw new Error('Facial shape "' + name + '" has two different meanings.');
      }
      map.set(normalized, key);
    }
  }
  return map;
}

// The original API takes just a Three.js root. An optional aliases object maps
// our semantic keys (e.g. blinkLeft, jaw) to one or more custom shape names.
export function createTravelExpression(root, { aliases = root.userData?.expressionAliases ?? {} } = {}) {
  const names = shapeNames(aliases);
  const parts = [];
  const seen = new Set();
  root.traverse(mesh => {
    const weights = mesh.morphTargetInfluences;
    if (!mesh.isMesh || !mesh.morphTargetDictionary || !weights || seen.has(weights)) return;
    const channels = new Map();
    const indices = new Set();
    for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
      const key = names.get(normalize(name));
      if (!key || channels.has(key) || indices.has(index)) continue;
      if (!Number.isInteger(index) || index < 0 || index >= weights.length) continue;
      channels.set(key, index);
      indices.add(index);
    }
    if (!channels.size) return;
    seen.add(weights);
    parts.push({weights, channels, saved: new Map()});
  });
  if (!parts.length) return null;

  // The baseline belongs to each individual mesh. For example, a mouth opening
  // and the surrounding skin may carry different strengths in an authored clip.
  function restore() {
    for (const {weights, saved} of parts) {
      for (const [i, base] of saved) weights[i] = base;
      saved.clear();
    }
  }
  function ease(value) {
    const u = clamp01(value);
    return u*u*(3-2*u);
  }
  function blink(seconds) {
    return ease(seconds/.077) * (1-ease((seconds-.096)/.143));
  }

  let time = 0, lastBlink = -1, nextBlink = 2.73, whichBlink = 0;
  const intervals = [4.26, 3.31, 5.02, 3.87, 4.63];
  const fixations = [[.04,0], [.35,.15], [-.17,.06], [-.30,-.09], [.21,.08], [.10,-.04]];
  const attentionDurations = [2.36,1.57,2.70,2.13,1.86,2.62];
  let fixation = 0, switchedAt = 0, breath = .26;

  function apply(dt, amount, running) {
    time += dt;
    if (time >= nextBlink) {
      lastBlink = time;
      nextBlink = time + intervals[whichBlink++ % intervals.length];
    }
    if (time-switchedAt > attentionDurations[fixation]) {
      fixation = (fixation+1)%fixations.length;
      switchedAt = time;
    }
    if (amount < .0001) return;
    const prev = fixations[(fixation+fixations.length-1)%fixations.length], next = fixations[fixation];
    const u = ease((time-switchedAt)/.105);
    const gx = prev[0]+(next[0]-prev[0])*u, gy = prev[1]+(next[1]-prev[1])*u;
    const gazeX = gx*amount*(1-.22*running), gazeY = gy*amount;
    const leftBlink = amount*blink(time-lastBlink);
    const rightBlink = amount*blink(time-lastBlink-.013);
    breath += dt * (2.05+1.98*running);
    const swell = Math.sin(breath);
    for (const {weights, channels, saved} of parts) {
      const base = key => weights[channels.get(key)] ?? 0;
      function set(key, value) {
        const i = channels.get(key);
        if (i === undefined) return;
        if (!saved.has(i)) saved.set(i, weights[i]);
        weights[i] = clamp01(value);
      }
      function gaze(positive, negative, shift) {
        const v = base(positive)-base(negative)+shift;
        set(positive, Math.max(0, v));
        set(negative, Math.max(0, -v));
      }
      function close(key, portion) { set(key, base(key)+(1-base(key))*portion); }
      function add(key, delta) { set(key, base(key)+amount*delta); }
      if (channels.has('lookLeft') || channels.has('lookRight')) {
        gaze('lookLeft', 'lookRight', gazeX);
      } else {
        gaze('leftEyeLeft', 'leftEyeRight', gazeX);
        gaze('rightEyeLeft', 'rightEyeRight', gazeX);
      }
      if (channels.has('lookUp') || channels.has('lookDown')) {
        gaze('lookUp', 'lookDown', gazeY);
      } else {
        gaze('leftEyeUp', 'leftEyeDown', gazeY);
        gaze('rightEyeUp', 'rightEyeDown', gazeY);
      }
      if (channels.has('blink') && !(channels.has('blinkLeft') && channels.has('blinkRight'))) {
        close('blink', leftBlink);
      } else {
        close('blinkLeft', leftBlink); close('blinkRight', rightBlink);
      }
      add('jaw', (.115+.118*running)*swell);
      add('lips', (.11+.09*running)*swell);
      add('nose', (.20+.10*running)*Math.sin(breath+.48));
      add('cheekLeft', .07*Math.sin(breath-.40)+.10*Math.max(gx,0));
      add('cheekRight', .055*Math.sin(breath-.43)+.12*Math.max(-gx,0));
    }
  }
  return { restore, apply };
}
