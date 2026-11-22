import * as THREE from 'three';
import { createSculptureKit } from '../presentation/npcs.mjs';

// Selection-only theatre: these effects never issue a spell, damage, or network
// command. Positions and wand tips are expressed in the scene's world space.
export const SELECTION_SPELLS = Object.freeze({
  harry: Object.freeze({ skillId: 'bolt', name: '基础咒击', duration: 2.1 }),
  ron: Object.freeze({ skillId: 'R1', name: '佯攻牵制', duration: 3.4 }),
  hermione: Object.freeze({ skillId: 'levitate', name: '漂浮咒', duration: 4.8 }),
});
const clamp = (x, a = 0, b = 1) => THREE.MathUtils.clamp(x, a, b);
const FEATHER_REST_Y = .59;
const ease = x => { const n = clamp(x); return n * n * (3 - 2 * n); };
const sample = (v, fallback) => Number.isFinite(v?.x) && Number.isFinite(v?.y) && Number.isFinite(v?.z) ? v : fallback;
const namedGroup = (parent, name, position = [0, 0, 0]) => { const g = new THREE.Group(); g.name = name; g.position.set(...position); parent.add(g); return g; };

export function createSelectionSpells() {
  const root = new THREE.Group(); root.name = 'SelectionSpellTheatre'; root.visible = false;
  const kit = createSculptureKit(), extraMaterials = new Set(), extraGeometries = new Set();
  const wood = kit.material({ color: '#967047', roughness: .77, bumpMap: kit.texture('wood'), bumpScale: .002 });
  const darkWood = kit.material({ color: '#483423', roughness: .89, bumpMap: kit.texture('wood'), bumpScale: .001 });
  const brass = kit.material({ color: '#b59964', roughness: .38, metalness: .7 });
  const leather = kit.material({ color: '#513427', roughness: .91, bumpMap: kit.texture('cloth'), bumpScale: .001 });
  const ivory = kit.material({ color: '#e4d9b8', roughness: .66 });
  const featherLight = kit.material({ color: '#eee9da', roughness: .82, side: THREE.DoubleSide });
  const featherShade = kit.material({ color: '#c6c9c0', roughness: .9, side: THREE.DoubleSide });
  const glow = (color, opacity = 1) => { const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }); extraMaterials.add(m); return m; };
  const effectMesh = (parent, geometry, material, name) => { extraGeometries.add(geometry); const m = new THREE.Mesh(geometry, material); m.name = name; parent.add(m); return m; };
  const props = {};
  const pedestal = parent => {
    kit.lathe(parent, darkWood, [[.20, 0], [.205, .025], [.17, .05], [.145, .075]], [0, 0, 0]);
    kit.lathe(parent, brass, [[.18, 0], [.18, .015]], [0, .042, 0]);
    for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; kit.oval(parent, brass, [Math.cos(a) * .18, .034, Math.sin(a) * .18], [.012, .008, .012]); }
  };

  // Woodgrain, brass rim, separate concentric inlays, bolted hinge and a footed
  // stand give the practice target a physical object silhouette at game scale.
  props.harry = namedGroup(root, 'HarryPracticeTarget'); pedestal(props.harry);
  kit.lathe(props.harry, darkWood, [[.045, 0], [.043, .74]], [0, .07, 0]);
  for (let i = 0; i < 3; i++) kit.mesh(props.harry, new THREE.TorusGeometry(.047, .006, 6, 24), brass, [0, .18 + i * .20, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  const targetPivot = namedGroup(props.harry, 'TargetHinge', [0, .94, 0]);
  kit.mesh(targetPivot, new THREE.CylinderGeometry(.33, .33, .055, 48), wood, [0, 0, 0], [1, 1, 1], [Math.PI / 2, 0, 0]);
  for (const [radius, material, thickness] of [[.327, brass, .012], [.255, leather, .014], [.175, brass, .009], [.09, leather, .014]]) kit.mesh(targetPivot, new THREE.TorusGeometry(radius, thickness, 8, 56), material, [0, 0, .034]);
  kit.oval(targetPivot, brass, [0, 0, .036], [.036, .036, .009]);
  for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; kit.oval(targetPivot, brass, [Math.cos(a) * .307, Math.sin(a) * .307, .040], [.009, .009, .008]); }
  kit.mesh(targetPivot, new THREE.CylinderGeometry(.037, .037, .12, 16), brass, [0, -.31, 0], [1, 1, 1], [0, 0, Math.PI / 2]);
  kit.bake(targetPivot); kit.bake(props.harry);
  props.harry.scale.setScalar(.84);

  // A jointed training puppet turns toward Ron, demonstrating his actual
  // attention-steering ability rather than the retired character's decoy skill.
  props.ron = namedGroup(root, 'RonTrainingPuppet'); pedestal(props.ron);
  kit.lathe(props.ron, brass, [[.035, 0], [.035, .24]], [0, .07, 0]);
  const puppet = namedGroup(props.ron, 'PuppetTurntable', [0, .26, 0]);
  kit.lathe(puppet, wood, [[.11, 0], [.12, .07], [.17, .29], [.15, .34], [.075, .38]], [0, 0, 0], [1, 1, .70]);
  kit.lathe(puppet, darkWood, [[.07, 0], [.065, .08]], [0, .37, 0]);
  kit.oval(puppet, wood, [0, .52, 0], [.115, .135, .10]);
  kit.oval(puppet, darkWood, [-.042, .54, .092], [.012, .009, .006]);
  kit.oval(puppet, darkWood, [.042, .54, .092], [.012, .009, .006]);
  kit.tube(puppet, leather, [[-.036, .476, .085], [0, .47, .097], [.036, .476, .085]], .004);
  kit.mesh(puppet, new THREE.TorusGeometry(.07, .006, 6, 32), brass, [0, .23, .12]);
  for (const sign of [-1, 1]) {
    kit.oval(puppet, brass, [sign * .16, .30, 0], [.04, .04, .04]);
    kit.tube(puppet, wood, [[sign * .18, .30, 0], [sign * .24, .16, .035], [sign * .23, .07, .05]], .035);
    kit.oval(puppet, brass, [sign * .24, .16, .035], [.038, .033, .035]);
    kit.oval(puppet, wood, [sign * .23, .045, .05], [.038, .049, .035]);
    for (let i = 0; i < 3; i++) kit.tube(puppet, darkWood, [[sign * (.215 + i * .012), .044, .079], [sign * (.216 + i * .012), .016, .077]], .0018);
  }
  for (let i = 0; i < 4; i++) kit.oval(puppet, brass, [0, .09 + i * .07, .12], [.008, .008, .005]);
  kit.bake(puppet); kit.bake(props.ron);

  // A light quill rests on a cloth-topped brass support. Its vane is a thin,
  // cambered surface with individual barbs, not a sphere or a flat white leaf.
  props.hermione = namedGroup(root, 'HermioneFeatherStand'); pedestal(props.hermione);
  kit.lathe(props.hermione, brass, [[.027, 0], [.023, .38], [.065, .42]], [0, .07, 0]);
  kit.oval(props.hermione, leather, [0, .50, 0], [.22, .025, .15]);
  const feather = namedGroup(props.hermione, 'LevitationFeather', [0, FEATHER_REST_Y, 0]);
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
  kit.bake(feather); kit.bake(props.hermione);

  const effects = namedGroup(root, 'SpellEffects');
  const boltMaterial = glow('#ffd8a2'), haloMaterial = glow('#ed6847', .3), ringMaterial = glow('#ffc780', .7), blueMaterial = glow('#b6edff', .8);
  const bolt = effectMesh(effects, new THREE.SphereGeometry(.024, 12, 8), boltMaterial, 'BoltCore');
  const boltHalo = effectMesh(bolt, new THREE.SphereGeometry(.061, 12, 8), haloMaterial, 'BoltHalo');
  boltHalo.scale.set(1, 1, 1.5);
  const impact = effectMesh(effects, new THREE.TorusGeometry(.10, .009, 6, 40), ringMaterial, 'ImpactRing');
  const lureRings = [];
  for (let i = 0; i < 3; i++) lureRings.push(effectMesh(effects, new THREE.TorusGeometry(.14, .008, 6, 40), glow('#e9a64f', .65), `AttentionRipple:${i}`));
  const shield = effectMesh(effects, new THREE.TorusGeometry(.46, .009, 6, 64, Math.PI * 1.45), glow('#efd09b', .5), 'RonGuardArc');
  shield.scale.set(.82, 1.2, 1);
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
  const defaultWand = new THREE.Vector3(), particleCenter = new THREE.Vector3(), offset = new THREE.Vector3(.64, 0, .65);
  let hero = null, time = 0, active = false, disposed = false, impactReached = false;
  const hideEffects = () => { for (const object of effects.children) object.visible = false; };
  function restoreProps() {
    targetPivot.rotation.set(0, 0, 0); puppet.rotation.set(0, -.82, 0);
    feather.position.set(0, FEATHER_REST_Y, 0); feather.rotation.set(Math.PI / 2, 0, -.68); feather.scale.setScalar(1);
  }
  function pose(options = {}) {
    caster.copy(sample(options.position, caster));
    defaultWand.set(caster.x - .20, caster.y + 1.05, caster.z + .32);
    wand.copy(sample(options.wandTip, defaultWand));
  }
  function prepare(heroId, options = {}) {
    if (disposed) throw new Error('SELECTION_SPELLS_DISPOSED');
    if (!SELECTION_SPELLS[heroId]) throw new Error('SELECTION_HERO_NOT_ALLOWED');
    hero = heroId; active = false; time = 0; impactReached = false; pose(options);
    if (options.targetOffset) offset.copy(sample(options.targetOffset, offset)); else offset.set(caster.x > .3 ? -.64 : .64, 0, .65);
    for (const [id, prop] of Object.entries(props)) { prop.visible = id === hero; prop.position.copy(caster).add(offset); }
    restoreProps(); hideEffects(); root.visible = true;
    return SELECTION_SPELLS[hero];
  }
  function begin(heroId, options = {}) {
    prepare(heroId, options); active = true;
    origin.copy(wand); return SELECTION_SPELLS[hero].duration;
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
    if (!active) return;
    const nextTime = Number.isFinite(options.elapsed) ? Math.max(0, options.elapsed) : time + Math.max(0, Number.isFinite(dt) ? dt : 0);
    time = Math.min(nextTime, SELECTION_SPELLS[hero].duration);
    hideEffects();
    if (hero === 'harry') {
      // The target is a modest prop beside the actor. Derive its impact point
      // from the actual transformed hinge, including the prop's local scale.
      targetPivot.localToWorld(destination.set(0, 0, .04));
      const flight = clamp(time / .34), after = Math.max(0, time - .34);
      bolt.visible = time < .34; trail.visible = time < .45;
      bolt.position.copy(path(origin, destination, flight, .08));
      line(origin, destination, Math.max(0, flight - .32), flight, .08); lineMaterial.color.set('#ffd9aa'); lineMaterial.opacity = 1 - clamp((time - .34) / .11);
      impactReached = time >= .34;
      if (impactReached) {
        targetPivot.rotation.x = -.21 * Math.exp(-after * 3.8) * Math.sin(after * 14);
        impact.visible = after < .5; impact.position.copy(destination); impact.scale.setScalar(1 + after * 5); ringMaterial.opacity = .75 * (1 - clamp(after / .5));
        particles.visible = after < .9; particleMaterial.color.set('#ffd797'); particleMaterial.opacity = 1 - clamp(after / .9); motes(destination, after, .04 + after * .70);
      }
    } else if (hero === 'ron') {
      destination.copy(props.ron.position); destination.y += .78;
      const angle = Math.atan2(caster.x - props.ron.position.x, caster.z - props.ron.position.z);
      const difference = Math.atan2(Math.sin(angle + .82), Math.cos(angle + .82));
      puppet.rotation.y = -.82 + difference * ease((time - .12) / .65);
      puppet.rotation.z = Math.sin(time * 5) * .025 * Math.sin(Math.PI * clamp(time / 3.4));
      for (let i = 0; i < 3; i++) {
        const t = time - i * .18; const ring = lureRings[i]; ring.visible = t >= 0 && t < 1.05;
        ring.position.copy(path(origin, destination, ease(t / .80), .07)); ring.scale.setScalar(.45 + clamp(t / 1.05) * 1.65); ring.material.opacity = .62 * Math.sin(Math.PI * clamp(t / 1.05));
      }
      shield.visible = time > .30 && time < 3.1; shield.position.copy(caster); shield.position.y += .98; shield.position.z += .28; shield.rotation.z = -.60 + Math.sin(time * 2) * .06;
      shield.material.opacity = .46 * ease((time - .30) / .35) * (1 - ease((time - 2.5) / .6));
      particles.visible = time > .5 && time < 2; particleMaterial.color.set('#eeb35c'); particleMaterial.opacity = .45 * (1 - ease((time - 1.2) / .8)); motes(destination, time, .12, true);
    } else {
      const lift = ease(time / 1.35) * (1 - ease((time - 3.25) / 1.55));
      feather.position.set(Math.sin(time * 1.4) * .055 * lift, FEATHER_REST_Y + lift * .63, Math.cos(time * 1.1) * .045 * lift);
      feather.rotation.set(Math.PI / 2 * (1 - lift) + (.08 + Math.sin(time * 2.1) * .12) * lift, time * .7 * lift, -.68 + Math.sin(time * 1.5) * .20 * lift);
      destination.copy(props.hermione.position).add(feather.position);
      trail.visible = time < 1.1; lineMaterial.color.set('#aedfff'); lineMaterial.opacity = .65 * (1 - ease((time - .45) / .65)); line(wand, destination, 0, 1, .12);
      featherHalo.visible = time < 4.65; featherHalo.position.copy(destination); featherHalo.position.y -= .17; featherHalo.rotation.z = time * .9; blueMaterial.opacity = .42 * lift;
      particles.visible = time > .1 && time < 4.6; particleMaterial.color.set('#c9efff'); particleMaterial.opacity = .58 * lift; particleCenter.copy(destination); motes(particleCenter, time, .19 + lift * .04, true);
    }
    if (time >= SELECTION_SPELLS[hero].duration) { active = false; hideEffects(); if (hero === 'harry') targetPivot.rotation.x = 0; if (hero === 'hermione') { feather.position.set(0, FEATHER_REST_Y, 0); feather.rotation.set(Math.PI / 2, 0, -.68); } }
  }
  function cancel() { if (disposed) return; active = false; time = 0; impactReached = false; restoreProps(); hideEffects(); }
  function reset() { cancel(); hero = null; root.visible = false; for (const prop of Object.values(props)) prop.visible = false; }
  function dispose() { if (disposed) return; reset(); disposed = true; root.removeFromParent(); kit.dispose(); for (const g of extraGeometries) g.dispose(); for (const m of extraMaterials) m.dispose(); root.clear(); }
  function debugSnapshot() { return { hero, skillId: SELECTION_SPELLS[hero]?.skillId ?? null, active, time, duration: SELECTION_SPELLS[hero]?.duration ?? 0, impactReached, visibleProps: Object.entries(props).filter(([, g]) => g.visible && root.visible).map(([id]) => id), featherHeight: feather.position.y, puppetYaw: puppet.rotation.y, targetTilt: targetPivot.rotation.x, geometries: kit.geometries.size + extraGeometries.size, materials: kit.materials.size + extraMaterials.size, disposed }; }
  reset();
  return { root, prepare, begin, update, cancel, reset, dispose, debugSnapshot, get active() { return active; }, get duration() { return SELECTION_SPELLS[hero]?.duration ?? 0; } };
}
