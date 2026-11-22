import * as THREE from 'three';
import { loadPlayableCharacter } from '../presentation/playable-character.mjs';

export const SELECTABLE_HEROES = Object.freeze(['harry', 'ron', 'hermione']);
// This is the published Cast release sample; the full source clip plays at 1×.
const CAST_RELEASE = 59 / 24, CAST_DURATION = 76 / 24;
const roles = { harry: { pace: 1, pause: .14 }, ron: { pace: .94, pause: .24 }, hermione: { pace: 1.02, pause: .34 } };
const angleDelta = (from, to) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const valid = id => { if (!SELECTABLE_HEROES.includes(id)) throw new Error(`UNSELECTABLE_HERO:${id}`); return id; };

export function selectionCameraPose(aspect = 1) {
  // Desktop side panels occupy the outer quarters. Portrait keeps all three in
  // a single row between the short title and the bottom character controls.
  const portrait = aspect < .9;
  const span = portrait ? 2.85 : 4.7;
  const available = portrait ? .90 : .49;
  const framed = Math.max(portrait ? 5.0 : 6.2, span / (2 * Math.tan(24 * Math.PI / 180) * Math.max(.25, aspect) * available));
  const distance = portrait ? framed : framed * .79;
  return { eye: [0, 1.64, distance + .7], focus: [0, portrait ? .93 : 1.03, .12] };
}

/** A resident pool and interruptible, visual-only character performance. */
export function createSelectionStage({ loadCharacter = loadPlayableCharacter, spells } = {}) {
  const root = new THREE.Group(); root.name = 'ResidentThreeCharacterSelection'; root.visible = false;
  const focus = new THREE.Object3D(); focus.position.y = 1.1; root.add(focus);
  const faceLight = new THREE.DirectionalLight(0xffedda, .65); faceLight.position.set(1, 3.5, 5); faceLight.target = focus; root.add(faceLight);
  const rimLight = new THREE.DirectionalLight(0xc2dcf4, .38); rimLight.position.set(-3, 2.8, -2); rimLight.target = focus; root.add(rimLight);
  if (spells?.root) root.add(spells.root);
  const entries = new Map(), loading = new Map();
  let selected = 'harry', generation = 0, mode = 'selection', aspect = 1.6, disposed = false, time = 0;
  const ready = () => SELECTABLE_HEROES.every(id => entries.has(id));
  function home(id) { const index = SELECTABLE_HEROES.indexOf(id) - 1; return new THREE.Vector3(index * (aspect < .9 ? .89 : 1.50), 0, -.65 - (index === 0 ? .12 : 0)); }
  function display(id) { const p = home(id); p.x *= .92; p.z = .92; return p; }
  function assertLive() { if (disposed) throw new Error('SELECTION_STAGE_DISPOSED'); }
  function cancelDisplays() {
    for (const entry of entries.values()) {
      if (entry.displayId) entry.actor.cancelAction?.(entry.displayId, 'selection-changed');
      entry.displayId = null; entry.castAge = 0; entry.released = false; entry.wait = 0;
    }
    spells?.cancel?.();
  }
  function select(heroId) {
    assertLive(); valid(heroId); selected = heroId; generation++; cancelDisplays();
    for (const [id, entry] of entries) { entry.phase = id === selected ? 'approach' : 'returning'; entry.intent = generation; }
    if (mode === 'selection') spells?.prepare?.(selected, { position: display(selected) });
    return entries.get(heroId)?.actor ?? null;
  }
  function load(id) {
    if (entries.has(id)) return Promise.resolve(entries.get(id).actor);
    if (loading.has(id)) return loading.get(id);
    const promise = Promise.resolve().then(() => loadCharacter(id)).then(actor => {
      if (disposed) { actor.dispose(); throw new Error('SELECTION_STAGE_DISPOSED'); }
      const at = home(id); actor.resetPresentation?.({ position: at.toArray(), yaw: Math.PI }); actor.root.visible = true; root.add(actor.root);
      entries.set(id, { actor, phase: id === selected ? 'approach' : 'returning', intent: generation, speed: 0, wait: 0, displayId: null, castAge: 0, released: false, releases: 0 });
      return actor;
    }).finally(() => loading.delete(id));
    loading.set(id, promise); return promise;
  }
  async function prepare(heroId = selected) {
    assertLive(); select(heroId);
    const results = await Promise.allSettled(SELECTABLE_HEROES.map(load));
    if (disposed) throw new Error('SELECTION_STAGE_DISPOSED');
    root.visible = mode === 'selection' && ready();
    const failures = results.filter(result => result.status === 'rejected').map(result => result.reason);
    if (failures.length) throw new AggregateError(failures, '部分角色尚未准备完成，请重试');
    return entries.get(selected).actor;
  }
  function enterGameplay(heroId = selected) {
    assertLive(); valid(heroId); const entry = entries.get(heroId);
    if (!entry) throw new Error(`CHARACTER_NOT_READY:${heroId}`);
    selected = heroId; generation++; mode = 'gameplay'; cancelDisplays(); root.visible = false;
    entry.actor.root.removeFromParent(); entry.actor.root.visible = true;
    entry.actor.resetPresentation?.(); spells?.reset?.();
    return entry.actor;
  }
  function returnToStage(heroId = selected) {
    assertLive(); valid(heroId); mode = 'selection'; cancelDisplays(); spells?.reset?.();
    for (const [id, entry] of entries) {
      root.add(entry.actor.root); entry.actor.root.visible = true; entry.speed = 0;
      entry.actor.resetPresentation?.({ position: home(id).toArray(), yaw: Math.PI });
      entry.actor.setPresentationState?.({});
    }
    root.visible = ready(); return select(heroId);
  }
  function update(dt, viewport = {}) {
    assertLive();
    if (!Number.isFinite(dt) || dt < 0) throw new Error('INVALID_SELECTION_DT');
    if (Number.isFinite(viewport.aspect) && viewport.aspect > 0) aspect = viewport.aspect;
    if (mode !== 'selection' || !ready()) return;
    const step = Math.min(dt, .1); time += step;
    for (const [id, entry] of entries) {
      const actor = entry.actor, active = id === selected, target = active ? display(id) : home(id), p = actor.root.position;
      const delta = target.clone().sub(p); delta.y = 0; const remaining = delta.length(); let traveled = 0;
      actor.setPresentationState?.({});
      if (remaining > .001) {
        if (entry.phase === 'casting') { actor.cancelAction?.(entry.displayId, 'stage-reflow'); entry.displayId = null; spells?.cancel?.(); }
        entry.phase = active ? 'approach' : 'returning'; entry.wait = 0;
        const maximum = (actor.walkSpeed ?? 1.3) * roles[id].pace;
        const desired = Math.min(maximum, Math.sqrt(5 * remaining));
        entry.speed = THREE.MathUtils.damp(entry.speed, desired, 10, step);
        traveled = Math.min(remaining, entry.speed * step);
        p.addScaledVector(delta, traveled / remaining);
        const heading = Math.atan2(-delta.x, -delta.z);
        actor.root.rotation.y += angleDelta(actor.root.rotation.y, heading) * (1 - Math.exp(-12 * step));
      } else {
        entry.speed = 0;
        const facing = Math.PI + (active ? 0 : .035 * Math.sin(time * .45 + SELECTABLE_HEROES.indexOf(id)));
        const turn = angleDelta(actor.root.rotation.y, facing);
        actor.root.rotation.y += turn * (1 - Math.exp(-10 * step));
        if (!active) entry.phase = 'home';
        else if (!['casting', 'effects', 'idle'].includes(entry.phase)) {
          entry.phase = 'turning'; entry.wait += step;
          if (Math.abs(turn) < .035 && entry.wait >= roles[id].pause) {
            const actionId = `selection:${generation}:${id}`;
            if (actor.playStudioCast(actionId)) {
              entry.displayId = actionId; entry.phase = 'casting'; entry.castAge = 0; entry.released = false;
              spells?.prepare?.(id, { position: p.clone() });
            }
          }
        }
      }
      actor.setExpressionContext?.({ mood: active ? 'curious' : 'neutral', intensity: active ? .55 : .3, lookX: active ? 0 : THREE.MathUtils.clamp((entries.get(selected)?.actor.root.position.x ?? 0) - p.x, -1, 1) * .15, lookY: 0, talking: false });
      actor.updateTravel(step, traveled, true, 0);
      if (active && entry.phase === 'casting') {
        entry.castAge += step;
        if (!entry.released && entry.castAge >= CAST_RELEASE) {
          entry.released = true; entry.releases++;
          spells?.begin?.(id, { position: p.clone(), wandTip: actor.getCastOriginWorld?.(new THREE.Vector3()) });
        }
        const duration = actor.debugSnapshot?.().clips?.Cast?.duration ?? CAST_DURATION;
        if (entry.castAge >= duration) entry.phase = spells?.active ? 'effects' : 'idle';
      }
      if (active && entry.phase === 'effects' && !spells?.active) entry.phase = 'idle';
    }
    const actor = entries.get(selected).actor;
    spells?.update?.(step, { position: actor.root.position.clone(), wandTip: actor.getCastOriginWorld?.(new THREE.Vector3()) });
  }
  function pick(raycaster) {
    if (disposed || mode !== 'selection' || !ready()) return null;
    // Stable body volumes are cheaper and more reliable than intersecting every
    // individual hair fibre. This intentionally excludes spell props and labels.
    let nearest = Infinity, picked = null;
    for (const [id, entry] of entries) {
      const p = entry.actor.root.getWorldPosition(new THREE.Vector3());
      const box = new THREE.Box3(p.clone().add(new THREE.Vector3(-.36, .04, -.30)), p.clone().add(new THREE.Vector3(.36, 1.96, .30)));
      const hit = raycaster.ray.intersectBox(box, new THREE.Vector3());
      if (hit) { const distance = hit.distanceToSquared(raycaster.ray.origin); if (distance < nearest) { nearest = distance; picked = id; } }
    }
    return picked;
  }
  function getState() {
    return Object.freeze({ selected, generation, mode, ready: ready(), actorCount: entries.size,
      actors: Object.freeze([...entries].map(([heroId, entry]) => Object.freeze({ heroId, phase: entry.phase, position: Object.freeze(entry.actor.root.position.toArray()), yaw: entry.actor.root.rotation.y, displayId: entry.displayId, releases: entry.releases }))) });
  }
  return { root, prepare, select, enterGameplay, returnToStage, update, pick, getState, getActor: id => entries.get(id)?.actor ?? null,
    dispose() { if (disposed) return; disposed = true; generation++; cancelDisplays(); for (const entry of entries.values()) entry.actor.dispose(); entries.clear(); spells?.dispose?.(); root.removeFromParent(); root.clear(); } };
}
