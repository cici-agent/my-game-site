// The native full-body performance owns the pose while its influence is up.
// The travel controller advances this same mixer once per frame.
import { LoopOnce, MathUtils } from 'three';

export function createWandGesture(mixer, clips) {
  const clip = clips.find(candidate => candidate.name === 'Cast' && candidate.duration > 0);
  if (!clip) return null;
  const action = mixer.clipAction(clip);
  action.setLoop(LoopOnce, 1);
  action.clampWhenFinished = true;
  const fadeIn = Math.min(.16, clip.duration * .18);
  const fadeOut = Math.min(.21, clip.duration * .23);
  let active = false, weight = 0, cancelling = null;

  function stop() {
    if (active) action.stop();
    active = false;
    weight = 0;
    cancelling = null;
  }

  return {
    get active() { return active; },
    start() {
      if (active) return false;
      active = true;
      action.reset().setEffectiveWeight(0).play();
      return true;
    },
    cancel() {
      if (active && !cancelling) cancelling = { weight, elapsed: 0 };
    },
    stop,
    advance(dt) {
      if (!active) return 0;
      if (cancelling) {
        cancelling.elapsed += dt;
        weight = cancelling.weight * (1 - MathUtils.smoothstep(cancelling.elapsed, 0, fadeIn));
      } else {
        const t = action.time + dt;
        weight = MathUtils.smoothstep(t, 0, fadeIn) * MathUtils.smoothstep(clip.duration - t, 0, fadeOut);
      }
      if (weight <= 0 && (dt > 0 || cancelling)) stop();
      else action.setEffectiveWeight(weight);
      return weight;
    },
  };
}
