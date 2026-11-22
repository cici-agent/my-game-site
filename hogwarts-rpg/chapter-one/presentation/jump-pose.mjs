const clamp = (value, low = 0, high = 1) => Math.max(low, Math.min(high, value));
const ease = value => { const x = clamp(value); return x * x * (3 - 2 * x); };
const mix = (a, b, weight) => a + (b - a) * weight;
const neutral = () => ({ thighL: 0, thighR: 0, kneeL: 0, kneeR: 0, ankleL: 0, ankleR: 0, chest: 0, head: 0, arm: 0, elbow: 0, spread: 0, support: 1 });

// Visual state only: the controller owns takeoff, velocity and floor contact.
// Angles use the published workshop's local bone axes, never retimed clips.
export function createJumpPose() {
  let phase = 'grounded', preparation = null, wasGrounded = true, airAge = 0, landAge = 0, landDuration = .38, landingWeight = 0, previousVelocity = 0, airWeight = 0;
  let pose = neutral();
  function reset() { phase = 'grounded'; preparation = null; wasGrounded = true; airAge = landAge = landingWeight = previousVelocity = airWeight = 0; pose = neutral(); }
  function prepare({ durationMs = 110 } = {}) {
    if (!Number.isFinite(durationMs) || durationMs < 60 || durationMs > 250) throw new Error('INVALID_JUMP_PREPARATION');
    if (!wasGrounded || preparation) return false;
    preparation = { age: 0, duration: durationMs / 1000 }; phase = 'anticipation'; return true;
  }
  function cancelPreparation() { if (!preparation) return false; preparation = null; phase = 'grounded'; return true; }
  function sample(dt, { grounded = true, verticalVelocity = 0, suppressed = false } = {}) {
    if (!Number.isFinite(dt) || dt < 0 || !Number.isFinite(verticalVelocity)) throw new Error('INVALID_JUMP_SAMPLE');
    if (suppressed) { reset(); return { ...pose }; }
    const target = neutral();
    if (!grounded && wasGrounded) { preparation = null; airAge = 0; landingWeight = 0; phase = 'takeoff'; }
    if (grounded && !wasGrounded) { preparation = null; landAge = 0; landingWeight = 1; landDuration = .31 + clamp(-previousVelocity / 7) * .11; phase = 'landing'; }
    if (!grounded) {
      airAge += dt; target.support = 0;
      const lift = ease((airAge - .045) / .20), extension = ease((-verticalVelocity - 1.1) / 4.4);
      phase = airAge < .11 && verticalVelocity > 0 ? 'takeoff' : verticalVelocity > 1.25 ? 'rising' : verticalVelocity >= -1.25 ? 'apex' : 'falling';
      const apex = 1 - clamp(Math.abs(verticalVelocity) / 3.2);
      const tuck = mix(.66, .90, apex);
      const hip = mix(.13, mix(tuck, .18, extension), lift);
      const knee = mix(.22, mix(1.12 + .30 * apex, .37, extension), lift);
      const asymmetry = .09 * lift * (1 - extension);
      target.thighL = -hip - asymmetry; target.thighR = -hip + asymmetry * .65;
      target.kneeL = knee + asymmetry * .5; target.kneeR = knee - asymmetry * .4;
      target.ankleL = -.16 - .18 * lift * (1 - extension); target.ankleR = -.13 - .16 * lift * (1 - extension);
      target.chest = .045 + .08 * lift; target.head = -.035 * lift;
      target.arm = -.28 * (1 - extension * .5); target.elbow = .30 * lift; target.spread = .15 * lift;
    } else if (preparation) {
      preparation.age += dt;
      const bend = ease(preparation.age / preparation.duration);
      // A rejected/buffered input must not leave the actor crouched forever.
      const release = 1 - ease((preparation.age - preparation.duration - .055) / .12);
      const weight = bend * release;
      target.thighL = target.thighR = -.56 * weight;
      target.kneeL = target.kneeR = 1.10 * weight;
      target.ankleL = target.ankleR = -.54 * weight;
      target.chest = .15 * weight; target.head = -.07 * weight; target.arm = .22 * weight; target.elbow = .08 * weight;
      phase = 'anticipation'; if (release <= 0) { preparation = null; phase = 'grounded'; }
    } else if (phase === 'landing') {
      landAge += dt; landingWeight = 1 - clamp(landAge / landDuration);
      const weight = ease(landAge / .065) * (1 - ease((landAge - .065) / (landDuration - .065)));
      target.thighL = -.65 * weight; target.thighR = -.60 * weight;
      target.kneeL = 1.23 * weight; target.kneeR = 1.17 * weight;
      target.ankleL = -.58 * weight; target.ankleR = -.57 * weight;
      target.chest = .17 * weight; target.head = -.07 * weight; target.arm = -.12 * weight; target.elbow = .16 * weight; target.spread = .09 * weight;
      if (landingWeight <= 0) phase = 'grounded';
    }
    const response = 1 - Math.exp(-(grounded && preparation ? 38 : phase === 'landing' ? 30 : 24) * dt);
    for (const key of Object.keys(pose)) { pose[key] = mix(pose[key], target[key], response); if (Math.abs(pose[key] - target[key]) < .00002) pose[key] = target[key]; }
    airWeight = mix(airWeight, grounded ? 0 : 1, 1 - Math.exp(-18 * dt));
    if (airWeight < .00002) airWeight = 0;
    wasGrounded = Boolean(grounded); previousVelocity = verticalVelocity;
    return { ...pose };
  }
  return { prepare, cancelPreparation, sample, reset,
    debug: () => ({ phase, airWeight, landingWeight, preparationRemainingMs: preparation ? Math.max(0, preparation.duration - preparation.age) * 1000 : 0, ...pose }) };
}
