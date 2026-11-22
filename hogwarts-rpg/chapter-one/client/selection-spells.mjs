import * as THREE from 'three';
import { createSculptureKit } from '../presentation/npcs.mjs';

// Selection-only theatre: these effects never issue a spell, damage, or network
// command. Positions and wand tips are expressed in the scene's world space.
export const SELECTION_SPELLS = Object.freeze({
  harry: Object.freeze({ skillId: 'bolt', name: '基础咒击', duration: 2.1 }),
  ron: Object.freeze({ skillId: 'bolt', name: '基础咒击', duration: 2.1 }),
  hermione: Object.freeze({ skillId: 'levitate', name: '漂浮咒', duration: 4.8 }),
});
const clamp = (x, a = 0, b = 1) => THREE.MathUtils.clamp(x, a, b);
const TABLE_TOP = .64, FEATHER_REST_Y = .11, SETTLE_DURATION = .58;
const ease = x => { const n = clamp(x); return n * n * (3 - 2 * n); };
const sample = (v, fallback) => Number.isFinite(v?.x) && Number.isFinite(v?.y) && Number.isFinite(v?.z) ? v : fallback;
const namedGroup = (parent, name, position = [0, 0, 0]) => { const g = new THREE.Group(); g.name = name; g.position.set(...position); parent.add(g); return g; };

export function createSelectionSpells({ onCue } = {}) {
  const root = new THREE.Group(); root.name = 'SelectionSpellTheatre'; root.visible = false;
  const kit = createSculptureKit(), extraMaterials = new Set(), extraGeometries = new Set();
  // The existing linear grayscale grain drives colour and relief together.
  // Share one texture across both timbers; lighter tints compensate its mean
  // luminance so the fine dark grain remains visible in the hall's soft light.
  const woodGrain = kit.texture('wood');
  const wood = kit.material({ color: '#b68a58', roughness: .66, map: woodGrain, bumpMap: woodGrain, bumpScale: .002 });
  const darkWood = kit.material({ color: '#684d35', roughness: .80, map: woodGrain, bumpMap: woodGrain, bumpScale: .001 });
  const brass = kit.material({ color: '#b59964', roughness: .38, metalness: .7 });
  const leather = kit.material({ color: '#513427', roughness: .91, bumpMap: kit.texture('cloth'), bumpScale: .001 });
  const ivory = kit.material({ color: '#e4d9b8', roughness: .66 });
  const featherLight = kit.material({ color: '#eee9da', roughness: .82, side: THREE.DoubleSide });
  const featherShade = kit.material({ color: '#c6c9c0', roughness: .9, side: THREE.DoubleSide });
  const glow = (color, opacity = 1) => { const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); extraMaterials.add(m); return m; };
  const effectMesh = (parent, geometry, material, name) => { extraGeometries.add(geometry); const m = new THREE.Mesh(geometry, material); m.name = name; parent.add(m); return m; };
  // One resident workbench: selection never moves or replaces its furniture.
  const table = namedGroup(root, 'UnifiedDemonstrationTable', [0, 0, 2.12]);
  const furniture = namedGroup(table, 'CarvedDemonstrationWorkbench');
  const box = (parent, material, at, size) => kit.mesh(parent, new THREE.BoxGeometry(...size), material, at);
  box(furniture, darkWood, [0, TABLE_TOP - .055, 0], [1.52, .11, .80]);
  box(furniture, wood, [0, TABLE_TOP - .012, 0], [1.47, .024, .75]);
  // Fine board joints, a recessed perimeter and brass corner escutcheons.
  for (let i = -2; i <= 2; i++) box(furniture, darkWood, [i * .245, TABLE_TOP + .001, 0], [.003, .002, .69]);
  for (const z of [-.365, .365]) box(furniture, brass, [0, TABLE_TOP - .008, z], [1.47, .012, .008]);
  for (const x of [-.73, .73]) box(furniture, brass, [x, TABLE_TOP - .008, 0], [.008, .012, .73]);
  for (const z of [-.32, .32]) {
    box(furniture, darkWood, [0, .49, z], [1.39, .16, .055]);
    box(furniture, wood, [0, .493, z + Math.sign(z) * .03], [1.22, .105, .012]);
    for (const y of [.453, .536]) box(furniture, brass, [0, y, z + Math.sign(z) * .038], [1.20, .004, .004]);
  }
  for (const x of [-.65, .65]) for (const z of [-.28, .28]) {
    kit.lathe(furniture, darkWood, [[.045, 0], [.052, .035], [.040, .065], [.033, .15], [.04, .18], [.04, .22], [.028, .30], [.052, .42], [.052, .49]], [x, .025, z]);
    kit.lathe(furniture, brass, [[.046, 0], [.047, .025], [.043, .035]], [x, .025, z]);
    kit.lathe(furniture, brass, [[.041, 0], [.041, .013]], [x, .205, z]);
    box(furniture, brass, [x, TABLE_TOP + .002, z], [.10, .003, .075]);
    for (const dx of [-.034, .034]) kit.oval(furniture, darkWood, [x + dx, TABLE_TOP + .004, z], [.004, .002, .004]);
  }
  box(furniture, darkWood, [0, .18, 0], [1.30, .04, .04]);
  for (const x of [-.65, .65]) box(furniture, darkWood, [x, .18, 0], [.04, .04, .58]);
  box(furniture, brass, [0, .492, .369], [.14, .05, .006]);
  kit.mesh(furniture, new THREE.TorusGeometry(.027, .004, 6, 24), brass, [0, .48, .378]);
  for (const x of [-.054, .054]) kit.oval(furniture, darkWood, [x, .492, .374], [.005, .005, .003]);
  kit.bake(furniture);

  const target = namedGroup(table, 'SharedPracticeTarget', [-.37, TABLE_TOP, -.04]);
  kit.lathe(target, darkWood, [[.15, 0], [.155, .023], [.13, .042], [.105, .06]], [0, 0, 0]);
  kit.lathe(target, brass, [[.13, 0], [.13, .01]], [0, .035, 0]);
  kit.lathe(target, darkWood, [[.028, 0], [.027, .43]], [0, .05, 0]);
  for (let i = 0; i < 3; i++) kit.mesh(target, new THREE.TorusGeometry(.03, .004, 6, 24), brass, [0, .12 + i * .12, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  const targetPivot = namedGroup(target, 'TargetHinge', [0, .51, 0]);
  kit.mesh(targetPivot, new THREE.CylinderGeometry(.225, .225, .045, 48), wood, [0, 0, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  // Finish both faces: students aim from behind, the camera sees the front.
  for (const side of [-1, 1]) {
    for (const [radius, material, thickness] of [[.222, brass, .009], [.175, leather, .010], [.12, brass, .006], [.061, leather, .009]]) kit.mesh(targetPivot, new THREE.TorusGeometry(radius, thickness, 8, 48), material, [0, 0, side * .026]);
    kit.oval(targetPivot, brass, [0, 0, side * .027], [.025, .025, .006]);
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; kit.oval(targetPivot, brass, [Math.cos(a) * .208, Math.sin(a) * .208, side * .03], [.006, .006, .005]); }
  }
  kit.mesh(targetPivot, new THREE.CylinderGeometry(.026, .026, .09, 16), brass, [0, -.21, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
  kit.bake(targetPivot); kit.bake(target);

  const featherRest = namedGroup(table, 'SharedFeatherRest', [.35, TABLE_TOP, .015]);
  kit.oval(featherRest, darkWood, [0, .016, 0], [.25, .018, .34]);
  kit.oval(featherRest, leather, [0, .031, 0], [.238, .015, .328]);
  for (const x of [-.075, .075]) kit.tube(featherRest, brass, [[x, .04, -.09], [x, .045, 0], [x, .04, .09]], .003);
  // Preserve the fine quill, curved vane, and individual barbs.
  const feather = namedGroup(featherRest, 'LevitationFeather', [0, FEATHER_REST_Y, 0]);
  const shaft = t => [Math.sin(t * 2.0) * .035, (t - .5) * .64, Math.sin(t * Math.PI) * .03];
  kit.tube(feather, ivory, [0, .2, .4, .6, .8, 1].map(shaft), .0045);
  for (const sign of [-1, 1]) {
    const vertices = [], segments = 38;
    for (let i = 0; i < segments; i++) {
      const t0 = .13 + .87 * i / segments, t1 = .13 + .87 * (i + 1) / segments;
      const a = shaft(t0), b = shaft(t1);
      const width = t => Math.sin(Math.PI * clamp((t - .12) / .88)) ** .85 * (sign < 0 ? .105 : .145);
      const edge = (t, p) => [p[0] + sign * width(t), p[1] - width(t) * .34, p[2] + width(t) * .16];
      const c = edge(t0, a), d = edge(t1, b);
      vertices.push(...a, ...c, ...b, ...b, ...c, ...d);
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(vertices.length / 3 * 2), 2)); g.computeVertexNormals();
    kit.mesh(feather, g, sign < 0 ? featherShade : featherLight);
    for (let i = 0; i < 42; i++) {
      const t = .15 + i * .0195, p = shaft(t), width = Math.sin(Math.PI * clamp((t - .12) / .88)) ** .85 * (sign < 0 ? .105 : .145);
      kit.tube(feather, i % 4 ? featherLight : featherShade, [p, [p[0] + sign * width * .57, p[1] - width * .16, p[2] + .006], [p[0] + sign * width, p[1] - width * .34, p[2] + width * .16]], .0013);
    }
  }
  kit.bake(feather); kit.bake(featherRest);

  const effects = namedGroup(root, 'SpellEffects');
  const boltMaterial = glow('#ffd8a2'), haloMaterial = glow('#ed6847', .3), ringMaterial = glow('#ffc780', .7), blueMaterial = glow('#b6edff', .8);
  const bolt = effectMesh(effects, new THREE.SphereGeometry(.024, 12, 8), boltMaterial, 'BoltCore');
  const boltHalo = effectMesh(bolt, new THREE.SphereGeometry(.061, 12, 8), haloMaterial, 'BoltHalo');
  boltHalo.scale.set(1, 1, 1.5);
  const impact = effectMesh(effects, new THREE.TorusGeometry(.10, .009, 6, 40), ringMaterial, 'ImpactRing');
  const featherHalo = effectMesh(effects, new THREE.TorusGeometry(.18, .005, 6, 48), blueMaterial, 'FeatherOrbit');
  featherHalo.rotation.x = Math.PI / 2;
  const lineGeometry = new THREE.BufferGeometry(), linePositions = new Float32Array(24 * 3);
  lineGeometry.setAttribute('position', new THREE.BufferAttribute(linePositions, 3)); extraGeometries.add(lineGeometry);
  const lineMaterial = new THREE.LineBasicMaterial({ color: '#ffd7a0', transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }); extraMaterials.add(lineMaterial);
  const trail = new THREE.Line(lineGeometry, lineMaterial); trail.name = 'WandSpellTrail'; trail.frustumCulled = false; effects.add(trail);
  const particleGeometry = new THREE.BufferGeometry(), particlePositions = new Float32Array(36 * 3);
  particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3)); extraGeometries.add(particleGeometry);
  const particleMaterial = new THREE.PointsMaterial({ color: '#ffd797', size: .020, transparent: true, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending }); extraMaterials.add(particleMaterial);
  const particles = new THREE.Points(particleGeometry, particleMaterial); particles.name = 'SelectionSpellMotes'; particles.frustumCulled = false; effects.add(particles);
  const caster = new THREE.Vector3(), wand = new THREE.Vector3(), origin = new THREE.Vector3(), destination = new THREE.Vector3(), moving = new THREE.Vector3();
  const defaultWand = new THREE.Vector3(), particleCenter = new THREE.Vector3();
  const restFeatherPosition = new THREE.Vector3(0, FEATHER_REST_Y, 0);
  const restFeatherRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, -.68));
  const settlingPosition = new THREE.Vector3(), settlingRotation = new THREE.Quaternion();
  const castFeatherPosition = new THREE.Vector3(), castFeatherRotation = new THREE.Quaternion();
  const desiredFeatherRotation = new THREE.Quaternion(), featherEuler = new THREE.Euler();
  const fadeMaterials = [...extraMaterials], fadingOpacity = fadeMaterials.map(() => 0);
  let hero = null, time = 0, active = false, disposed = false, impactReached = false;
  let settleAge = SETTLE_DURATION, settleFeather = false, settleTarget = false, fadeEffects = false, settlingTilt = 0, castTargetTilt = 0;
  const hideEffects = () => { for (const object of effects.children) object.visible = false; };
  const isSettling = () => settleFeather || settleTarget || fadeEffects;
  function restoreProps() {
    targetPivot.rotation.set(0, 0, 0);
    feather.position.copy(restFeatherPosition); feather.quaternion.copy(restFeatherRotation);
  }
  function cue(kind) { onCue?.({ kind, skillId: SELECTION_SPELLS[hero].skillId, heroId: hero, selection: true }); }
  function pose(options = {}) {
    caster.copy(sample(options.position, caster));
    defaultWand.set(caster.x - .20, caster.y + 1.05, caster.z + .32);
    wand.copy(sample(options.wandTip, defaultWand));
  }
  function prepare(heroId, options = {}) {
    if (disposed) throw new Error('SELECTION_SPELLS_DISPOSED');
    if (!SELECTION_SPELLS[heroId]) throw new Error('SELECTION_HERO_NOT_ALLOWED');
    if (active) cancel();
    hero = heroId; time = 0; impactReached = false; pose(options);
    root.visible = true;
    return SELECTION_SPELLS[hero];
  }
  function begin(heroId, options = {}) {
    prepare(heroId, options); active = true; fadeEffects = false; hideEffects();
    boltMaterial.opacity = 1; haloMaterial.opacity = .3;
    origin.copy(wand); castTargetTilt = targetPivot.rotation.x;
    castFeatherPosition.copy(feather.position); castFeatherRotation.copy(feather.quaternion);
    if (hero === 'hermione') settleFeather = false; else settleTarget = false;
    cue('cast'); return SELECTION_SPELLS[hero].duration;
  }
  // Each student turns toward the same resident target or feather.
  function getAimPoint(heroId, out = new THREE.Vector3()) {
    if (!SELECTION_SPELLS[heroId]) throw new Error('SELECTION_HERO_NOT_ALLOWED');
    return heroId === 'hermione' ? feather.getWorldPosition(out) : targetPivot.localToWorld(out.set(0, 0, -.033));
  }
  function settle(dt) {
    if (!isSettling()) return;
    settleAge = Math.min(SETTLE_DURATION, settleAge + dt); const progress = ease(settleAge / SETTLE_DURATION);
    if (settleFeather) { feather.position.lerpVectors(settlingPosition, restFeatherPosition, progress); feather.quaternion.slerpQuaternions(settlingRotation, restFeatherRotation, progress); }
    if (settleTarget) targetPivot.rotation.x = settlingTilt * (1 - progress);
    if (fadeEffects) for (let i = 0; i < fadeMaterials.length; i++) fadeMaterials[i].opacity = fadingOpacity[i] * (1 - ease(settleAge / .22));
    if (fadeEffects && settleAge >= .22) { hideEffects(); fadeEffects = false; }
    if (settleAge >= SETTLE_DURATION) {
      if (settleFeather) { feather.position.copy(restFeatherPosition); feather.quaternion.copy(restFeatherRotation); }
      if (settleTarget) targetPivot.rotation.x = 0;
      settleFeather = false; settleTarget = false;
    }
  }
  function path(start, end, fraction, bend = 0) {
    moving.lerpVectors(start, end, fraction); moving.y += Math.sin(fraction * Math.PI) * bend; return moving;
  }
  function line(start, end, from = 0, to = 1, bend = 0) {
    for (let i = 0; i < 24; i++) { const p = path(start, end, from + (to - from) * i / 23, bend); linePositions[i * 3] = p.x; linePositions[i * 3 + 1] = p.y; linePositions[i * 3 + 2] = p.z; }
    lineGeometry.attributes.position.needsUpdate = true;
  }
  function motes(center, age, spread, orbit = false) {
    for (let i = 0; i < 36; i++) {
      const angle = i * 2.399963 + (orbit ? age * 1.2 : 0), radial = spread * (.25 + (i % 7) / 8);
      particlePositions[i * 3] = center.x + Math.cos(angle) * radial;
      particlePositions[i * 3 + 1] = center.y + (orbit ? Math.sin(age * 1.6 + i) * .08 : Math.sin(i * 1.67) * spread - age * age * .22);
      particlePositions[i * 3 + 2] = center.z + Math.sin(angle) * radial;
    }
    particleGeometry.attributes.position.needsUpdate = true;
  }
  function update(dt, options = {}) {
    if (disposed || !hero) return;
    pose(options);
    const step = Math.max(0, Number.isFinite(dt) ? dt : 0);
    settle(step);
    if (!active) return;
    const nextTime = Number.isFinite(options.elapsed) ? Math.max(0, options.elapsed) : time + step;
    time = Math.min(nextTime, SELECTION_SPELLS[hero].duration);
    hideEffects();
    if (hero === 'harry' || hero === 'ron') {
      getAimPoint(hero, destination);
      const flight = clamp(time / .34), after = Math.max(0, time - .34);
      bolt.visible = time < .34; trail.visible = time < .45;
      bolt.position.copy(path(origin, destination, flight, .08));
      line(origin, destination, Math.max(0, flight - .32), flight, .08); lineMaterial.color.set('#ffd9aa'); lineMaterial.opacity = 1 - clamp((time - .34) / .11);
      if (time >= .34 && !impactReached) { impactReached = true; cue('impact'); }
      targetPivot.rotation.x = castTargetTilt * (1 - ease(time / .3));
      if (impactReached) {
        targetPivot.rotation.x = -.21 * Math.exp(-after * 3.8) * Math.sin(after * 14);
        impact.visible = after < .5; impact.position.copy(destination); impact.scale.setScalar(1 + after * 5); ringMaterial.opacity = .75 * (1 - clamp(after / .5));
        particles.visible = after < .9; particleMaterial.color.set('#ffd797'); particleMaterial.opacity = 1 - clamp(after / .9); motes(destination, after, .04 + after * .70);
      }
    } else {
      const lift = ease(time / 1.35) * (1 - ease((time - 3.25) / 1.55));
      const join = ease(time / SETTLE_DURATION);
      feather.position.set(Math.sin(time * 1.4) * .055 * lift, FEATHER_REST_Y + lift * .63, Math.cos(time * 1.1) * .045 * lift);
      // Reselecting during return keeps the current visible pose; no teleport.
      feather.position.addScaledVector(castFeatherPosition, 1 - join).addScaledVector(restFeatherPosition, -(1 - join));
      featherEuler.set(Math.PI / 2 * (1 - lift) + (.08 + Math.sin(time * 2.1) * .12) * lift, time * .7 * lift, -.68 + Math.sin(time * 1.5) * .20 * lift);
      desiredFeatherRotation.setFromEuler(featherEuler);
      feather.quaternion.slerpQuaternions(castFeatherRotation, desiredFeatherRotation, join);
      feather.getWorldPosition(destination);
      trail.visible = time < 1.1; lineMaterial.color.set('#aedfff'); lineMaterial.opacity = .65 * (1 - ease((time - .45) / .65)); line(wand, destination, 0, 1, .12);
      featherHalo.visible = time < 4.65; featherHalo.position.copy(destination); featherHalo.position.y -= .17; featherHalo.rotation.z = time * .9; blueMaterial.opacity = .42 * lift;
      particles.visible = time > .1 && time < 4.6; particleMaterial.color.set('#c9efff'); particleMaterial.opacity = .58 * lift; particleCenter.copy(destination); motes(particleCenter, time, .19 + lift * .04, true);
    }
    if (time >= SELECTION_SPELLS[hero].duration) {
      active = false; hideEffects();
      if (hero === 'hermione') { feather.position.copy(restFeatherPosition); feather.quaternion.copy(restFeatherRotation); }
      else targetPivot.rotation.x = 0;
    }
  }
  function cancel() {
    if (disposed || !active) return;
    active = false; impactReached = false; settleAge = 0;
    settlingPosition.copy(feather.position); settlingRotation.copy(feather.quaternion); settlingTilt = targetPivot.rotation.x;
    settleFeather = true; settleTarget = true;
    fadeEffects = effects.children.some(object => object.visible);
    for (let i = 0; i < fadeMaterials.length; i++) fadingOpacity[i] = fadeMaterials[i].opacity;
  }
  function reset() {
    active = false; hero = null; time = 0; impactReached = false;
    settleAge = SETTLE_DURATION; settleFeather = false; settleTarget = false; fadeEffects = false;
    restoreProps(); hideEffects(); root.visible = false;
  }
  function dispose() { if (disposed) return; reset(); disposed = true; root.removeFromParent(); kit.dispose(); for (const g of extraGeometries) g.dispose(); for (const m of extraMaterials) m.dispose(); root.clear(); }
  function debugSnapshot() { return { hero, skillId: SELECTION_SPELLS[hero]?.skillId ?? null, active, time, duration: SELECTION_SPELLS[hero]?.duration ?? 0, impactReached, settling: isSettling(), visibleProps: root.visible ? ['table', 'target', 'feather'] : [], tablePosition: table.position.toArray(), featherHeight: feather.position.y, targetTilt: targetPivot.rotation.x, geometries: kit.geometries.size + extraGeometries.size, materials: kit.materials.size + extraMaterials.size, disposed }; }
  reset();
  return { root, prepare, begin, update, cancel, reset, dispose, getAimPoint, debugSnapshot, get active() { return active; }, get duration() { return SELECTION_SPELLS[hero]?.duration ?? 0; } };
}
