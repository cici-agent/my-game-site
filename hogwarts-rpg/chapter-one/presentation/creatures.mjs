import * as THREE from 'three';
import { buildCreature } from '../../world/chapter-creature.mjs';
import { createNpc, createSculptureKit } from './npcs.mjs';
import { creatureCollision } from '../combat/collision-profiles.mjs';
import { createCommonSpider, createCommonBat } from './ordinary-creatures.mjs';

const disposeTree = root => {
  const geometry = new Set(), material = new Set();
  root.traverse(n => { if (n.geometry) geometry.add(n.geometry); for (const m of [].concat(n.material ?? [])) material.add(m); });
  for (const g of geometry) g.dispose(); for (const m of material) m.dispose();
};
const pivot = (parent, name, p) => { const g = new THREE.Group(); g.name = name; g.position.set(...p); parent.add(g); return g; };

function createTroll() {
  const source = buildCreature('troll'), kit = createSculptureKit(), root = new THREE.Group();
  root.name = 'DetailedCreature:MountainTroll'; source.root.rotation.y = Math.PI; root.add(source.root);
  const body = source.root.getObjectByName('CreatureBody'), torso = source.root.getObjectByName('CreatureTorso');
  const club = source.root.getObjectByName('CreatureClub');
  const pore = kit.texture('skin'), clothMap = kit.texture('cloth');
  source.root.traverse(node => {
    if (!node.isMesh) return;
    const prior = node.geometry, p = prior.parameters ?? {};
    if (prior.type === 'SphereGeometry') node.geometry = new THREE.SphereGeometry(p.radius, 32, 24);
    else if (prior.type === 'CylinderGeometry') node.geometry = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 28, 3);
    if (node.geometry !== prior) prior.dispose();
    if (node.material.isMeshStandardMaterial) {
      node.castShadow = true; node.receiveShadow = true;
      node.material.roughness = .88; node.material.bumpMap = pore; node.material.bumpScale = .004;
      if (node.material.color.getHexString() === '839886') node.material.color.set('#858b83');
      if (node.material.color.getHexString() === '697c69') node.material.color.set('#69716b');
    }
  });
  const skin = kit.material({ color: '#858b83', roughness: .82, bumpMap: pore, bumpScale: .004 });
  const dark = kit.material({ color: '#5c675e', roughness: .9, bumpMap: pore, bumpScale: .003 });
  const lips = kit.material({ color: '#656a62', roughness: .7 });
  const ivory = kit.material({ color: '#cfc4a2', roughness: .72 });
  const iris = kit.material({ color: '#816a3c', roughness: .28 });
  const pupil = kit.material({ color: '#161b16', roughness: .2 });
  const hide = kit.material({ color: '#665647', roughness: 1, bumpMap: clothMap, bumpScale: .005 });
  const seam = kit.material({ color: '#b6a181', roughness: .94 });
  const iron = kit.material({ color: '#454944', metalness: .35, roughness: .66 });
  const wood = kit.material({ color: '#795b3d', roughness: .92, bumpMap: kit.texture('wood'), bumpScale: .008 });
  const grain = kit.material({ color: '#523b29', roughness: .98 });
  const at = (x, y, z) => [x, y - 1.1, z];
  for (const side of [-1, 1]) {
    kit.oval(torso, skin, at(side * .29, 2.48, .31), [.16, .15, .15]);
    kit.oval(torso, lips, at(side * .46, 2.55, .13), [.067, .11, .055]);
    kit.oval(torso, skin, at(side * .20, 2.70, .45), [.13, .045, .06], [0, 0, side * .12]);
    kit.oval(torso, iris, at(side * .20, 2.64, .51), [.034, .040, .019]);
    kit.oval(torso, pupil, at(side * .20, 2.64, .525), [.016, .027, .008]);
    kit.oval(torso, ivory, at(side * .19, 2.655, .532), [.006, .006, .003]);
    kit.oval(torso, dark, at(side * .082, 2.51, .582), [.025, .016, .012]);
    kit.tube(torso, dark, [at(side * .11, 2.70, .45), at(side * .20, 2.736, .40), at(side * .35, 2.72, .31)], .008);
    kit.tube(torso, dark, [at(side * .20, 2.60, .462), at(side * .27, 2.57, .43), at(side * .32, 2.59, .38)], .006);
    kit.tube(torso, lips, [at(side * .08, 2.47, .48), at(side * .16, 2.41, .50), at(side * .30, 2.38, .47)], .010);
    for (let i = 0; i < 3; i++) kit.tube(torso, dark, [at(side * (.11 + i * .035), 2.9, .27), at(side * (.13 + i * .035), 2.82, .34), at(side * (.10 + i * .032), 2.77, .40)], .0038);
  }
  kit.oval(torso, lips, at(0, 2.31, .46), [.24, .055, .06]);
  for (let i = -2; i <= 2; i++) kit.mesh(torso, new THREE.ConeGeometry(.021, .07, 10), ivory, at(i * .075, 2.32, .51), [1, 1, .7], [Math.PI, 0, 0]);
  const pores = [];
  for (let i = 0; i < 48; i++) {
    const a = i * 2.3999, y = 1.28 + (i % 9) * .105;
    pores.push({ position: at(Math.sin(a) * .67, y, Math.cos(a) * .50), scale: [.009, .007, .004] });
  }
  kit.instances(torso, dark, pores);
  kit.lathe(torso, hide, [[.73, 0], [.76, .08], [.72, .22], [.69, .29]], at(0, .79, 0), [1, 1, .74], .045);
  for (let i = 0; i < 30; i++) {
    const a = i * Math.PI * 2 / 30;
    kit.tube(torso, seam, [at(Math.sin(a) * .74, .84, Math.cos(a) * .56), at(Math.sin(a + .014) * .74, .88, Math.cos(a + .014) * .56)], .003);
  }
  kit.tube(torso, hide, [at(-.61, 1.94, -.10), at(-.28, 1.68, .51), at(.31, 1.27, .51), at(.59, 1.18, .12)], .038);
  for (let i = 0; i < 5; i++) kit.oval(torso, iron, at(-.12 + i * .075, 1.61 - i * .054, .55), [.012, .012, .009]);
  for (let i = 0; i < 6; i++) {
    const a = i * Math.PI / 3;
    kit.tube(club, wood, [[Math.cos(a) * .08, .2, Math.sin(a) * .08 + .03], [Math.cos(a) * .17, .65, Math.sin(a) * .17 + .03], [Math.cos(a) * .23, 1.25, Math.sin(a) * .23 + .03]], .009);
  }
  for (const h of [.58, 1.11]) for (let i = 0; i < 8; i++) {
    const a = i * Math.PI / 4, r = h === .58 ? .14 : .205;
    kit.oval(club, iron, [Math.cos(a) * r, h, Math.sin(a) * r + .03], [.016, .016, .016]);
  }
  // Preserve the locomotion/club joints while improving the head-to-shoulder
  // silhouette and replacing mitten-like hands and feet with distinct digits.
  const head = pivot(torso, 'TrollHead', [0, 1.43, .09]);
  for (const node of [...torso.children]) if (node !== head && node.isMesh && !node.isInstancedMesh) {
    node.geometry.computeBoundingBox(); node.updateMatrix();
    const center = node.geometry.boundingBox.getCenter(new THREE.Vector3()).applyMatrix4(node.matrix);
    if (center.y > 1.10) { node.position.sub(head.position); head.add(node); }
  }
  head.scale.set(.79, .85, .86); head.position.y -= .055; head.position.z += .10;
  for (const side of [-1, 1]) {
    kit.oval(torso, skin, at(side * .49, 2.03, -.015), [.32, .29, .36]);
    const arm = source.root.getObjectByName(side < 0 ? 'CreatureFreeArm' : 'CreatureClubArm');
    for (let finger = 0; finger < 4; finger++) {
      const x = side * .30 + (finger - 1.5) * .105, y = -.97 - Math.sin((finger + 1) / 5 * Math.PI) * .055;
      kit.oval(arm, skin, [x, y, .18], [.071, .15, .086], [0, 0, -side * .08]);
      kit.oval(arm, dark, [x, y - .025, .254], [.045, .055, .014]);
    }
    kit.oval(arm, skin, [side * .50, -.82, .13], [.085, .16, .08], [0, 0, side * -.5]);
    const foot = source.root.getObjectByName(side < 0 ? 'CreatureFootL' : 'CreatureFootR');
    for (let toe = 0; toe < 3; toe++) {
      kit.oval(foot, skin, [(toe - 1) * .15, -.04, .39], [.095, .115, .18]);
      kit.oval(foot, dark, [(toe - 1) * .15, -.01, .54], [.061, .047, .023]);
    }
    kit.bake(arm); kit.bake(foot);
  }
  for (let i = 0; i < 18; i++) {
    const a = i * Math.PI * 2 / 18;
    kit.tube(club, grain, [[Math.cos(a) * .095, .22, Math.sin(a) * .095 + .03], [Math.cos(a + .016) * .17, .73, Math.sin(a + .016) * .17 + .03], [Math.cos(a) * .22, 1.23, Math.sin(a) * .22 + .03]], .0035);
  }
  kit.bake(head); kit.bake(torso); kit.bake(club);
  let time = 0, disposed = false, lastAction = 'idle';
  function update(dt, state = {}) {
    if (disposed) return; dt = Math.min(.1, Math.max(0, dt)); time += dt;
    const action = state.action ?? 'idle';
    if (action === 'hurt' && lastAction !== action) source.react('hit', .8);
    lastAction = action;
    const phase = action === 'attack' ? 'windup' : state.attackPhase === 'recover' ? 'opening' : state.attackPhase === 'vulnerable' ? 'vulnerable' : 'waiting';
    source.update({ dt, status: action === 'downed' || action === 'dead' ? 'won' : 'active', started: true, phase,
      moveSpeed: state.speed ?? 0, windupProgress: state.windupProgress ?? (action === 'attack' ? (time % 1.6) / 1.6 : undefined),
    }, time, null);
    // The original telegraph ring is disabled: server-driven ground telegraphs
    // belong to the world renderer, never to the cosmetic creature animation.
    const ring = source.root.children.find(n => n.isMesh && n.geometry?.type === 'RingGeometry'); if (ring) ring.visible = false;
  }
  function dispose() { if (disposed) return; disposed = true; root.removeFromParent(); disposeTree(source.root); kit.dispose(); root.clear(); }
  root.userData.visualKind = 'mountain-troll'; root.userData.visualTier = 'detailed_supporting_creature_pending_render_review';
  return { root, update, dispose, react: source.react, forward: 'negative-z', dimensions: { height: 3.8, radius: .95 } };
}

function createBooks() {
  const kit = createSculptureKit(), root = new THREE.Group(); root.name = 'DetailedCreature:AnimatedBooks';
  const pages = kit.material({ color: '#d0bfa0', roughness: 1, bumpMap: kit.texture('cloth'), bumpScale: .001 });
  const leather = kit.material({ color: '#663f31', roughness: .81, bumpMap: kit.texture('skin'), bumpScale: .002 });
  const gold = kit.material({ color: '#ab8b55', metalness: .45, roughness: .5 });
  const dark = kit.material({ color: '#514d43', roughness: .9 });
  const book = pivot(root, 'FlyingBook', [0, 1.05, 0]), wings = [];
  for (const side of [-1, 1]) {
    const cover = pivot(book, side < 0 ? 'LeftCover' : 'RightCover', [0, 0, 0]); wings.push(cover);
    kit.mesh(cover, new THREE.BoxGeometry(.31, .025, .43), leather, [side * .155, -.025, 0]);
    kit.mesh(cover, new THREE.BoxGeometry(.29, .064, .41), pages, [side * .15, .021, 0]);
    for (let i = 0; i < 8; i++) kit.tube(cover, dark, [[side * .025, .006 + i * .007, -.202], [side * .287, .007 + i * .007, -.202]], .0009);
    for (let i = 0; i < 4; i++) kit.mesh(cover, new THREE.BoxGeometry(.02, .004, .026), gold, [side * (i % 2 ? .28 : .035), -.008, i < 2 ? -.18 : .18]);
    kit.tube(cover, gold, [[side * .025, -.012, -.18], [side * .278, -.012, -.18], [side * .278, -.012, .18], [side * .025, -.012, .18]], .002);
    kit.bake(cover);
  }
  kit.lathe(book, leather, [[.035, 0], [.035, .43]], [0, 0, -.215], [1, 1, .75]);
  let time = 0, death = 0;
  return { root, forward: 'negative-z', update(dt, state = {}) {
    time += dt; death = THREE.MathUtils.damp(death, state.action === 'downed' ? 1 : 0, 6, dt);
    book.position.y = THREE.MathUtils.lerp(1.05 + Math.sin(time * 2.1) * .08, .10, death);
    book.rotation.x = state.action === 'attack' ? -.9 * Math.sin(Math.PI * (state.windupProgress ?? .5)) : Math.sin(time * 1.7) * .09;
    book.rotation.z = Math.sin(time * 1.3) * .07 * (1 - death);
    for (let i = 0; i < 2; i++) wings[i].rotation.z = (i ? -1 : 1) * (.22 + Math.sin(time * 7 + i * .5) * .18) * (1 - death);
  }, dispose() { root.removeFromParent(); kit.dispose(); root.clear(); } };
}

function createPlant(elite = false) {
  const kit = createSculptureKit(), root = new THREE.Group(); root.name = elite ? 'DetailedCreature:RootMass' : 'DetailedCreature:TrainingVine';
  const bark = kit.material({ color: elite ? '#4e5943' : '#61714a', roughness: .93, bumpMap: kit.texture('skin'), bumpScale: .004 });
  const edge = kit.material({ color: '#87916a', roughness: .88 });
  const earth = kit.material({ color: '#322a22', roughness: 1 });
  const clay = kit.material({ color: '#865940', roughness: .97, bumpMap: kit.texture('skin'), bumpScale: .003 });
  if (!elite) kit.lathe(root, clay, [[.29, 0], [.30, .04], [.36, .36], [.39, .38], [.39, .43], [.35, .44]], [0, 0, 0], [1, 1, 1]);
  kit.oval(root, earth, [0, elite ? .08 : .38, 0], [elite ? .65 : .34, .08, elite ? .65 : .34]);
  const vines = [];
  for (let i = 0; i < (elite ? 7 : 4); i++) {
    const a = i * Math.PI * 2 / (elite ? 7 : 4), vine = pivot(root, `VineJoint${i}`, [Math.sin(a) * .15, elite ? .18 : .39, Math.cos(a) * .15]);
    vine.rotation.y = a; vines.push(vine);
    const height = elite ? 1.5 + (i % 3) * .22 : .9 + (i % 2) * .2;
    kit.tube(vine, bark, [[0, 0, 0], [.13, height * .3, -.1], [.19, height * .7, -.05], [.42, height, -.12]], elite ? .075 : .04);
    for (let j = 0; j < 4; j++) {
      const y = height * (.2 + j * .18), side = j % 2 ? 1 : -1;
      kit.oval(vine, edge, [.12 + side * .10, y, -.05], [.14, .034, .067], [0, 0, side * -.45]);
      kit.tube(vine, bark, [[.13, y, -.05], [.13 + side * .18, y + .08, -.05]], .004);
    }
    kit.bake(vine);
  }
  if (elite) {
    for (let i = 0; i < 7; i++) { const a = i * Math.PI * 2 / 7; kit.tube(root, bark, [[0, .18, 0], [Math.cos(a) * .5, .08, Math.sin(a) * .5], [Math.cos(a + .2) * .8, .03, Math.sin(a + .2) * .8]], .07); }
    kit.oval(root, edge, [0, .35, 0], [.26, .38, .26]);
  }
  let time = 0, down = 0;
  return { root, forward: 'negative-z', update(dt, state = {}) {
    time += dt; down = THREE.MathUtils.damp(down, state.action === 'downed' ? 1 : 0, 5, dt);
    for (let i = 0; i < vines.length; i++) {
      const attack = state.action === 'attack' ? Math.sin(Math.PI * (state.windupProgress ?? .5)) : 0;
      vines[i].rotation.x = Math.sin(time * 1.6 + i * .9) * .07 - attack * .65 + down * 1.15;
      vines[i].rotation.z = Math.sin(time * 1.1 + i * 1.7) * .10 * (1 - down);
    }
  }, dispose() { root.removeFromParent(); kit.dispose(); root.clear(); } };
}

function createBox() {
  const kit = createSculptureKit(), root = new THREE.Group(), box = pivot(root, 'AnimatedCrate', [0, .38, 0]); root.name = 'DetailedCreature:TrainingCrate';
  const wood = kit.material({ color: '#8d6643', roughness: .94, bumpMap: kit.texture('cloth'), bumpScale: .004 });
  const dark = kit.material({ color: '#594733', roughness: .9 });
  const iron = kit.material({ color: '#4c4e45', metalness: .4, roughness: .65 });
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * .145;
    for (const z of [-.36, .36]) kit.mesh(box, new THREE.BoxGeometry(.138, .7, .05), wood, [x, 0, z]);
    for (const side of [-1, 1]) kit.mesh(box, new THREE.BoxGeometry(.05, .7, .138), wood, [side * .36, 0, x]);
  }
  const lid = pivot(box, 'CrateLid', [0, .34, .34]); kit.mesh(lid, new THREE.BoxGeometry(.77, .06, .77), wood, [0, .03, -.34]);
  for (const y of [-.22, .22]) {
    for (const z of [-.397, .397]) kit.mesh(box, new THREE.BoxGeometry(.75, .055, .025), dark, [0, y, z]);
    for (const x of [-.3, .3]) for (const z of [-.415, .415]) kit.oval(box, iron, [x, y, z], [.014, .014, .008]);
  }
  kit.bake(box); kit.bake(lid); let time = 0, down = 0;
  return { root, forward: 'negative-z', update(dt, state = {}) {
    time += dt; down = THREE.MathUtils.damp(down, state.action === 'downed' ? 1 : 0, 6, dt);
    const walking = (state.speed ?? 0) > .01, attack = state.action === 'attack';
    box.position.y = .38 + (walking ? Math.abs(Math.sin(time * 5)) * .06 : Math.sin(time * 1.4) * .005);
    box.rotation.z = (walking ? Math.sin(time * 5) * .08 : 0) + down * 1.45;
    lid.rotation.x = THREE.MathUtils.damp(lid.rotation.x, attack ? -.36 : -.035, 8, dt);
  }, dispose() { root.removeFromParent(); kit.dispose(); root.clear(); } };
}

function createPaper() {
  const kit = createSculptureKit(), root = new THREE.Group(); root.name = 'DetailedCreature:FoldedPracticeFigure';
  const paper = kit.material({ color: '#d4c8ad', roughness: .98, side: THREE.DoubleSide, bumpMap: kit.texture('cloth'), bumpScale: .001 });
  const ink = kit.material({ color: '#725e4d', roughness: 1 });
  const body = pivot(root, 'PaperBody', [0, .78, 0]);
  kit.mesh(body, new THREE.BoxGeometry(.34, .55, .055), paper, [0, 0, 0]);
  kit.oval(body, paper, [0, .39, 0], [.16, .18, .035]);
  for (const side of [-1, 1]) {
    kit.oval(body, ink, [side * .056, .415, -.035], [.013, .012, .004]);
    kit.tube(body, ink, [[side * .15, -.24, -.03], [side * .11, .22, -.03]], .002);
    kit.mesh(root, new THREE.BoxGeometry(.09, .45, .05), paper, [side * .105, .28, 0]);
  }
  const arms = [-1, 1].map(side => {
    const arm = pivot(body, `PaperArm${side}`, [side * .2, .17, 0]);
    kit.mesh(arm, new THREE.BoxGeometry(.09, .38, .04), paper, [side * .04, -.17, 0], [1, 1, 1], [0, 0, side * -.18]); kit.bake(arm); return arm;
  });
  kit.tube(body, ink, [[-.04, .34, -.038], [0, .32, -.04], [.04, .34, -.038]], .002);
  kit.bake(body); kit.bake(root); let time = 0, down = 0;
  return { root, forward: 'negative-z', update(dt, state = {}) {
    time += dt; down = THREE.MathUtils.damp(down, state.action === 'downed' ? 1 : 0, 7, dt);
    body.rotation.z = Math.sin(time * 2) * .035 * (1 - down); body.scale.y = 1 - down * .75;
    for (let i = 0; i < arms.length; i++) arms[i].rotation.x = state.action === 'attack' ? -1.1 * (state.windupProgress ?? .5) : Math.sin(time * 2.2 + i * Math.PI) * .06;
  }, dispose() { root.removeFromParent(); kit.dispose(); root.clear(); } };
}

function createKey() {
  const kit = createSculptureKit(), root = new THREE.Group(); root.name = 'DetailedCreature:FlyingKey';
  const brass = kit.material({ color: '#b39b64', metalness: .75, roughness: .38 }), feather = kit.material({ color: '#c9d1c9', roughness: .72, side: THREE.DoubleSide });
  kit.mesh(root, new THREE.TorusGeometry(.10, .018, 8, 24), brass, [0, .1, 0]);
  kit.mesh(root, new THREE.CylinderGeometry(.016, .02, .27, 10), brass, [0, -.12, 0]);
  kit.mesh(root, new THREE.BoxGeometry(.08, .025, .025), brass, [.03, -.225, 0]);
  const wings = [-1, 1].map(side => {
    const wing = pivot(root, `KeyWing${side}`, [side * .04, .06, 0]);
    for (let i = 0; i < 5; i++) kit.oval(wing, feather, [side * (.06 + i * .032), .015 + i * .023, 0], [.025, .10 - i * .009, .006], [0, 0, -side * .8]);
    kit.bake(wing); return wing;
  }); kit.bake(root); let time = 0;
  return { root, forward: 'negative-z', update(dt) { time += dt; for (let i = 0; i < 2; i++) wings[i].rotation.y = Math.sin(time * 22) * .65 * (i ? 1 : -1); }, dispose() { root.removeFromParent(); kit.dispose(); root.clear(); } };
}

function createFluffy() {
  const kit = createSculptureKit(), root = new THREE.Group(); root.name = 'DetailedCreature:ThreeHeadedHound';
  const fur = kit.material({ color: '#493b2f', roughness: .97, bumpMap: kit.texture('skin'), bumpScale: .005 });
  const muzzle = kit.material({ color: '#655442', roughness: .95 });
  const nose = kit.material({ color: '#24231e', roughness: .45 });
  const teeth = kit.material({ color: '#d9c9a3', roughness: .75 });
  const eyes = kit.material({ color: '#af813e', emissive: '#5b3811', emissiveIntensity: .15, roughness: .3 });
  const body = pivot(root, 'HoundBody', [0, 0, 0]);
  kit.oval(body, fur, [0, 1.11, .25], [.67, .68, 1.0]);
  const heads = [];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * .56, head = pivot(body, `HoundHead${i}`, [x, 1.67 + (i === 1 ? .18 : 0), -.58]); heads.push(head);
    kit.oval(head, fur, [0, -.15, .03], [.31, .45, .34]); kit.oval(head, fur, [0, .12, -.14], [.32, .34, .36]);
    kit.oval(head, muzzle, [0, -.015, -.44], [.235, .17, .30]); kit.oval(head, nose, [0, .05, -.68], [.15, .085, .07]);
    for (const side of [-1, 1]) {
      kit.oval(head, fur, [side * .28, .29, -.03], [.12, .23, .08], [0, 0, side * -.3]);
      kit.oval(head, eyes, [side * .14, .18, -.435], [.051, .042, .025]); kit.oval(head, nose, [side * .14, .18, -.46], [.014, .030, .006]);
      kit.tube(head, nose, [[side * .04, -.11, -.68], [side * .18, -.11, -.53], [side * .23, -.09, -.34]], .012);
      for (let j = 0; j < 3; j++) kit.mesh(head, new THREE.ConeGeometry(.018, .065, 9), teeth, [side * .18, -.13, -.52 + j * .08], [1, 1, 1], [Math.PI, 0, 0]);
    }
    kit.bake(head);
  }
  const legs = [];
  for (const x of [-.46, .46]) for (const z of [-.42, .88]) {
    const leg = pivot(body, `HoundLeg:${x}:${z}`, [x, .92, z]); legs.push(leg);
    kit.oval(leg, fur, [0, -.33, 0], [.16, .43, .19]); kit.oval(leg, muzzle, [0, -.80, -.08], [.21, .13, .27]);
    for (let i = -1; i <= 1; i++) kit.oval(leg, nose, [i * .075, -.82, -.30], [.026, .023, .055]); kit.bake(leg);
  }
  const tail = pivot(body, 'HoundTail', [0, 1.32, 1.12]); kit.tube(tail, fur, [[0, 0, 0], [.10, .19, .30], [.22, .25, .57]], .085); kit.bake(tail); kit.bake(body);
  let time = 0, phase = 0, sleep = 0;
  return { root, forward: 'negative-z', update(dt, state = {}) {
    time += dt; const speed = state.speed ?? 0; phase += speed * dt * 3.7;
    sleep = THREE.MathUtils.damp(sleep, ['downed', 'sleep'].includes(state.action) ? 1 : 0, 3, dt);
    body.position.y = -sleep * .53 + Math.sin(time * 1.1) * .013;
    heads.forEach((head, i) => { head.rotation.x = .45 * sleep + Math.sin(time * (1.1 + i * .1) + i) * .035; head.rotation.y = Math.sin(time * .6 + i * 2) * .11 * (1 - sleep); });
    legs.forEach((leg, i) => { leg.rotation.x = Math.sin(phase + (i % 3 ? Math.PI : 0)) * .24 * Math.min(1, speed); });
    tail.rotation.z = Math.sin(time * 1.7) * .17;
  }, dispose() { root.removeFromParent(); kit.dispose(); root.clear(); } };
}

function createDragon() {
  const kit = createSculptureKit(), root = new THREE.Group(); root.name = 'DetailedCreature:Norbert';
  const scales = kit.material({ color: '#647568', roughness: .85, bumpMap: kit.texture('skin'), bumpScale: .003 });
  const membrane = kit.material({ color: '#7e6b52', roughness: .86, side: THREE.DoubleSide });
  const horn = kit.material({ color: '#c5b593', roughness: .8 });
  const eye = kit.material({ color: '#c09a3e', roughness: .3 });
  const dark = kit.material({ color: '#252c27', roughness: .75 });
  const body = pivot(root, 'DragonBody', [0, 0, 0]);
  kit.oval(body, scales, [0, .35, .05], [.23, .28, .43]);
  const head = pivot(body, 'DragonHead', [0, .56, -.36]);
  kit.oval(head, scales, [0, 0, 0], [.20, .18, .24]); kit.oval(head, scales, [0, -.055, -.22], [.13, .085, .17]);
  for (const side of [-1, 1]) {
    kit.oval(head, eye, [side * .14, .045, -.15], [.04, .035, .03]); kit.oval(head, dark, [side * .15, .045, -.175], [.009, .026, .007]);
    kit.mesh(head, new THREE.ConeGeometry(.035, .18, 12), horn, [side * .13, .17, .04], [1, 1, 1], [.4, 0, -side * .3]);
  }
  kit.tube(body, scales, [[0, .34, .36], [.03, .24, .62], [.15, .14, .86], [.24, .24, 1.02]], .065);
  for (let i = 0; i < 7; i++) kit.mesh(body, new THREE.ConeGeometry(.028, .10, 8), horn, [0, .60 - i * .045, -.05 + i * .12]);
  const wings = [];
  for (const side of [-1, 1]) {
    const wing = pivot(body, `DragonWing${side}`, [side * .17, .48, .05]); wings.push(wing);
    const points = [[0, 0, 0], [side * .54, .33, .06], [side * .67, .05, .37], [side * .34, -.08, .30], [side * .12, -.12, .25]];
    const g = new THREE.BufferGeometry(); const vertices = [];
    for (let i = 1; i < points.length - 1; i++) vertices.push(...points[0], ...points[i], ...points[i + 1]);
    g.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); g.computeVertexNormals(); kit.mesh(wing, g, membrane);
    for (const p of points.slice(1)) kit.tube(wing, scales, [[0, 0, 0], p], .014);
    kit.bake(wing);
    for (const z of [-.20, .29]) { const leg = pivot(body, `DragonLeg${side}:${z}`, [side * .17, .24, z]); kit.oval(leg, scales, [0, -.1, 0], [.055, .14, .06]); for (let i = -1; i <= 1; i++) kit.oval(leg, horn, [i * .023, -.22, -.045], [.012, .012, .035]); kit.bake(leg); }
  }
  kit.bake(body); kit.bake(head); let time = 0;
  return { root, forward: 'negative-z', update(dt, state = {}) { time += dt; head.rotation.y = Math.sin(time * 1.1) * .13; head.rotation.x = state.action === 'attack' ? -.25 : Math.sin(time * .8) * .045; wings.forEach((wing, i) => { wing.rotation.z = (i ? -1 : 1) * (.35 + Math.sin(time * 2.2) * .11); }); body.position.y = Math.sin(time * 1.8) * .009; }, dispose() { root.removeFromParent(); kit.dispose(); root.clear(); } };
}

function createPeeves() {
  const actor = createNpc({ id: 'generic', scale: .78 }); actor.root.name = 'DetailedCreature:Peeves';
  const kit = createSculptureKit(), head = actor.root.getObjectByName('Head');
  const plum = kit.material({ color: '#665775', roughness: .82, transparent: true, opacity: .8 });
  const bell = kit.material({ color: '#b8a67a', metalness: .3, roughness: .6 });
  kit.lathe(head, plum, [[.19, 0], [.17, .08], [.08, .18], [.01, .25]], [0, .20, 0], [1.15, .7, 1]);
  for (const side of [-1, 1]) { kit.tube(head, plum, [[side * .12, .28, 0], [side * .25, .34, 0], [side * .29, .22, 0]], .025); kit.oval(head, bell, [side * .29, .19, 0], [.034, .034, .034]); }
  actor.root.traverse(node => { if (!node.isMesh) return; for (const m of [].concat(node.material)) { m.transparent = true; m.opacity = .76; m.depthWrite = false; } node.castShadow = false; });
  let time = 0; const baseUpdate = actor.update, baseDispose = actor.dispose;
  return { ...actor, forward: 'negative-z', update(dt, state = {}) { time += dt; baseUpdate(dt, { ...state, speed: 0 }); const body = actor.root.getObjectByName('Body'); body.position.y += .8 + Math.sin(time * 1.8) * .16; body.rotation.z += Math.sin(time * 1.1) * .08; }, dispose() { baseDispose(); kit.dispose(); } };
}

export function createCreature({ templateId = 'PAPER-L1', kind, scale = 1 } = {}) {
  let result;
  if (templateId === 'PAPER-L1') result = createCommonSpider();
  else if (templateId === 'BOX-L6') result = createCommonBat();
  else if (templateId === 'B1-E07' || kind === 'troll') result = createTroll();
  else if (templateId === 'B1-E15' || kind === 'stone' || kind === 'quirrell') result = { ...createNpc({ id: 'quirrell' }), forward: 'negative-z' };
  else if (templateId.startsWith('BOOKS')) result = createBooks();
  else if (templateId.startsWith('VINE')) result = createPlant(false);
  else if (templateId.startsWith('ROOT')) result = createPlant(true);
  else if (templateId.startsWith('BOX')) result = createBox();
  else if (templateId === 'key') result = createKey();
  else if (templateId === 'B1-E10' || kind === 'fluffy') result = createFluffy();
  else if (templateId === 'B1-E08' || kind === 'norbert') result = createDragon();
  else if (templateId === 'B1-E04' || kind === 'peeves') result = createPeeves();
  else result = createPaper();
  result.root.scale.multiplyScalar(scale); result.root.userData.templateId = templateId;
  result.collision = creatureCollision(templateId); result.root.userData.collision = result.collision;
  return result;
}
