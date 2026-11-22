import * as THREE from 'three';
import { buildCreature } from '../../world/chapter-creature.mjs';
import { createNpc, createSculptureKit } from './npcs.mjs';
import { creatureCollision } from '../combat/collision-profiles.mjs';
import { createCommonSpider, createCommonBat } from './ordinary-creatures.mjs';
import { creatureSurface, creatureTufts, leafBladeGeometry, organicLoft, blinkAmount, visualDt, creatureFloorSupport } from './creature-detail.mjs';

const disposeTree = (root, owner = {}) => {
  const geometry = new Set(), material = new Set();
  root.traverse(n => { if (n.geometry) geometry.add(n.geometry); for (const m of [].concat(n.material ?? [])) material.add(m); });
  for (const g of geometry) if (!owner.geometries?.has(g)) g.dispose(); for (const m of material) if (!owner.materials?.has(m)) m.dispose();
};
const detailOval = (kit, parent, material, at, scale, rotation) => kit.mesh(parent, new THREE.SphereGeometry(1, 16, 12), material, at, scale, rotation);
const pivot = (parent, name, p) => { const g = new THREE.Group(); g.name = name; g.position.set(...p); parent.add(g); return g; };

function createTroll() {
  const source = buildCreature('troll'), kit = createSculptureKit(), root = new THREE.Group();
  root.name = 'DetailedCreature:MountainTroll'; source.root.rotation.y = Math.PI; root.add(source.root);
  const body = source.root.getObjectByName('CreatureBody'), torso = source.root.getObjectByName('CreatureTorso');
  const club = source.root.getObjectByName('CreatureClub');
  const pore = creatureSurface(kit, 'skin'), clothMap = kit.texture('cloth'), woodMap = kit.texture('wood');
  source.root.traverse(node => {
    if (!node.isMesh) return;
    const prior = node.geometry, p = prior.parameters ?? {};
    if (prior.type === 'SphereGeometry') node.geometry = new THREE.SphereGeometry(p.radius, 32, 24);
    else if (prior.type === 'CylinderGeometry') node.geometry = new THREE.CylinderGeometry(p.radiusTop, p.radiusBottom, p.height, 28, 3);
    if (node.geometry !== prior) prior.dispose();
    if (node.material.isMeshStandardMaterial) {
      node.castShadow = true; node.receiveShadow = true;
      const color = node.material.color.getHexString();
      const skinSurface = ['839886','697c69','858b83','69716b'].includes(color);
      const wooden = ['694c35','8a6747','9d7a55'].includes(color);
      const fabric = ['75604a','4f4235'].includes(color);
      node.material.roughness = skinSurface ? .86 : wooden ? .8 : fabric ? .95 : .62;
      node.material.map = skinSurface ? pore : wooden ? woodMap : fabric ? clothMap : null;
      node.material.bumpMap = node.material.map; node.material.bumpScale = skinSurface ? .004 : wooden ? .006 : .002;
      if (node.material.color.getHexString() === '839886') node.material.color.set('#858b83');
      if (node.material.color.getHexString() === '697c69') node.material.color.set('#69716b');
    }
  });
  const skin = kit.material({ color: '#8b9189', roughness: .82, map: pore, bumpMap: pore, bumpScale: .004 });
  const dark = kit.material({ color: '#657066', roughness: .9, map: pore, bumpMap: pore, bumpScale: .003 });
  const lips = kit.material({ color: '#656a62', roughness: .7 });
  const ivory = kit.material({ color: '#cfc4a2', roughness: .72 });
  const iris = kit.material({ color: '#816a3c', roughness: .28 });
  const pupil = kit.material({ color: '#161b16', roughness: .2 });
  const hide = kit.material({ color: '#806b55', roughness: 1, map: clothMap, bumpMap: clothMap, bumpScale: .005 });
  const seam = kit.material({ color: '#b6a181', roughness: .94 });
  const iron = kit.material({ color: '#454944', metalness: .35, roughness: .66 });
  const wood = kit.material({ color: '#997551', roughness: .86, map: woodMap, bumpMap: woodMap, bumpScale: .008 });
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
  const eyelids = [-1,1].map(side => {
    const lid=detailOval(kit,head,skin,[side*.20,.174,.448],[.070,.018,.014]);lid.name=`TrollEyelid:${side}`;lid.userData.keepSeparate=true;return lid;
  });
  kit.bake(head); kit.bake(torso); kit.bake(club);
  const floorSupport = creatureFloorSupport(body);
  let time = 0, down = 0, disposed = false, lastAction = 'idle';
  function update(dt, state = {}) {
    if (disposed) return; dt = visualDt(dt); time += dt;
    const action = state.action ?? 'idle', sleeping=['downed','dead'].includes(action);
    if (action === 'hurt' && lastAction !== action) source.react('hit', .8);
    lastAction = action;
    const phase = action === 'attack' ? 'windup' : state.attackPhase === 'recover' ? 'opening' : state.attackPhase === 'vulnerable' ? 'vulnerable' : 'waiting';
    // Own the reversible collapse blend here: the legacy terminal won pose
    // resets instantly on revival and rolls the shoulder through the floor.
    source.update({ dt, status: 'active', started: true, phase: sleeping ? 'waiting' : phase,
      moveSpeed: sleeping ? 0 : state.speed ?? 0, windupProgress: state.windupProgress ?? (action === 'attack' ? (time % 1.6) / 1.6 : undefined),
    }, time, null);
    down = THREE.MathUtils.damp(down,sleeping?1:0,4.5,dt);
    body.rotation.z = THREE.MathUtils.lerp(body.rotation.z,1.27,down);
    body.position.y = THREE.MathUtils.lerp(body.position.y,.28,down);
    torso.rotation.x *= 1-down; torso.rotation.y *= 1-down; torso.rotation.z *= 1-down;
    const blink=sleeping?1:blinkAmount(time,.4,6.1);
    eyelids.forEach(lid=>{lid.position.y=.174-blink*.06;lid.scale.y=.018+blink*.035;});
    head.rotation.x=Math.sin(time*.75)*.018*(sleeping?0:1)+(action==='attack'?-.035*(state.windupProgress??0):0);
    head.rotation.y=Math.sin(time*.53)*.025*(action==='idle'?1:0);
    if (down > .0001) floorSupport.lift(.002);
    // The original telegraph ring is disabled: server-driven ground telegraphs
    // belong to the world renderer, never to the cosmetic creature animation.
    const ring = source.root.children.find(n => n.isMesh && n.geometry?.type === 'RingGeometry'); if (ring) ring.visible = false;
  }
  function dispose() { if (disposed) return; disposed = true; root.removeFromParent(); disposeTree(source.root,kit); kit.dispose(); root.clear(); }
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
  const leafMap = creatureSurface(kit, 'leaf');
  const edge = kit.material({ color: '#8e9d6a', map: leafMap, bumpMap: leafMap, bumpScale: .001, roughness: .82, side: THREE.DoubleSide });
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
      const leaf = pivot(vine, `LeafBlade:${i}:${j}`, [.13, y, -.05]); leaf.rotation.set(.1, -side * Math.PI / 2, side * .25);
      kit.mesh(leaf, leafBladeGeometry(.29, .09, .03), edge);
      kit.tube(leaf, bark, [[0,0,0],[0,.03,-.14],[0,0,-.29]], .0022);
      for(const veinSide of [-1,1]) for(let vein=0;vein<3;vein++) {
        const z=-.055-vein*.058, width=Math.sin(Math.PI*(-z/.29))*.075;
        kit.tube(leaf,bark,[[0,.024,z],[veinSide*width,.012,z-.025]],.0008);
      }
      // Leaves stay static on their animated vine; fold them into its two
      // material batches instead of adding a draw call for every small vein.
      leaf.updateMatrix(); for (const mesh of [...leaf.children]) { mesh.applyMatrix4(leaf.matrix); vine.add(mesh); } leaf.removeFromParent();
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
  const furMap = creatureSurface(kit, 'fur');
  const fur = kit.material({ color: '#625044', map: furMap, roughness: .94, bumpMap: furMap, bumpScale: .0035 });
  const softFur = kit.material({ color: '#78614d', roughness: 1, emissive: '#33291f', emissiveIntensity: .2 });
  const earFur = kit.material({ color: '#3e342c', map: furMap, roughness: .96, bumpMap: furMap, bumpScale: .006, side: THREE.DoubleSide });
  const muzzle = kit.material({ color: '#83694f', map: furMap, roughness: .88, bumpMap: furMap, bumpScale: .003 });
  const nose = kit.material({ color: '#252720', roughness: .54 });
  const mouth = kit.material({ color: '#392b29', roughness: .86 });
  const teeth = kit.material({ color: '#cdbd98', roughness: .74 });
  const eyes = kit.material({ color: '#7a683b', roughness: .26 });
  const glint = teeth;
  const body = pivot(root, 'HoundBody', [0, 0, 0]);
  kit.mesh(body, organicLoft([
    { z: -.72, y: 1.18, rx: .04, ry: .06 }, { z: -.60, y: 1.18, rx: .47, ry: .48 },
    { z: -.32, y: 1.18, rx: .65, ry: .62 }, { z: .10, y: 1.10, rx: .61, ry: .58 },
    { z: .48, y: 1.04, rx: .49, ry: .46 }, { z: .86, y: 1.08, rx: .43, ry: .41 },
    { z: 1.14, y: 1.08, rx: .32, ry: .33 }, { z: 1.27, y: 1.08, rx: .03, ry: .04 },
  ]), fur);
  creatureTufts(kit, body, softFur, { name: 'HoundShoulderFur', center: [0, 1.16, -.16], radii: [.64, .60, .53], count: 1800, length: .035, lower: -.65, comb:[0,-.45,.65] });
  const heads = [];
  for (let i = 0; i < 3; i++) {
    const x = (i - 1) * .56, head = pivot(body, `HoundHead${i}`, [x, 1.67 + (i === 1 ? .18 : 0), -.58]);
    // Neck, cheekbone, brow and upper muzzle form one tapered surface.
    kit.mesh(head, organicLoft([
      { z: .34, y: -.30, rx: .07, ry: .11 }, { z: .22, y: -.20, rx: .26, ry: .34 },
      { z: .04, y: 0, rx: .27, ry: .31 }, { z: -.10, y: .06, rx: .30, ry: .25 },
      { z: -.23, y: .035, rx: .285, ry: .20 }, { z: -.32, y: -.025, rx: .215, ry: .135 },
      { z: -.44, y: -.08, rx: .16, ry: .10 }, { z: -.63, y: -.085, rx: .14, ry: .085 }, { z: -.69, y: -.08, rx: .05, ry: .035 },
    ]), fur);
    const jaw = pivot(head, `HoundJaw${i}`, [0, -.13, -.29]);
    kit.mesh(jaw, organicLoft([
      { z: .06, y: -.025, rx: .025, ry: .03 }, { z: -.05, y: -.03, rx: .18, ry: .075 },
      { z: -.23, y: -.035, rx: .16, ry: .065 }, { z: -.37, y: -.02, rx: .09, ry: .04 },
      { z: -.39, y: -.02, rx: .012, ry: .012 },
    ]), muzzle);
    detailOval(kit, jaw, mouth, [0, .015, -.19], [.14, .022, .17]);
    detailOval(kit, head, nose, [0, -.025, -.666], [.12, .068, .043]);
    for (const side of [-1, 1]) {
      detailOval(kit, head, muzzle, [side * .092, -.075, -.54], [.11, .075, .12]);
      detailOval(kit, head, nose, [side * .06, -.026, -.705], [.024, .019, .009]);
      kit.tube(head, nose, [[side * .025, -.126, -.66], [side * .15, -.143, -.51], [side * .21, -.11, -.34]], .008);
      for (let j = 0; j < 3; j++) {
        kit.mesh(head, new THREE.ConeGeometry(j === 0 ? .018 : .012, j === 0 ? .085 : .04, 8), teeth, [side * .156, -.17, -.48 + j * .07], [1, 1, 1], [Math.PI, 0, 0]);
        kit.mesh(jaw, new THREE.ConeGeometry(.011, .038, 8), teeth, [side * .135, .037, -.21 + j * .06]);
      }
      // Drooping, folded ears read as a heavy hound rather than round toy ears.
      const ear = pivot(head, `HoundEar${i}:${side}`, [side * .31, .19, -.15]);
      const earGeometry = leafBladeGeometry(.34, .12, .065); earGeometry.rotateX(-Math.PI / 2); earGeometry.rotateY(side * -.5); earGeometry.rotateZ(side * -.12);
      kit.mesh(ear, earGeometry, earFur, [0, .025, 0]); kit.bake(ear);
      detailOval(kit, head, eyes, [side * .177, .132, -.36], [.041, .031, .019]);
      detailOval(kit, head, nose, [side * .178, .132, -.376], [.017, .018, .006]);
      detailOval(kit, head, glint, [side * .170, .142, -.381], [.004, .004, .003]);
      kit.tube(head, fur, [[side * .10, .19, -.34], [side * .18, .192, -.365], [side * .25, .16, -.29]], .025);
      const lid = detailOval(kit, head, fur, [side * .177, .17, -.385], [.045, .014, .01]); lid.name = `HoundLid${i}:${side}`; lid.userData.keepSeparate = true;
      for (let dot = 0; dot < 4; dot++) detailOval(kit, head, nose, [side * (.10 + (dot % 2) * .035), -.065 - Math.floor(dot / 2) * .026, -.636 + (dot % 2) * .03], [.003, .003, .002]);
    }
    creatureTufts(kit, head, softFur, { name: `HoundNeckFur${i}`, center: [0, -.10, .08], radii: [.27, .34, .25], count: 500, length: .035, lower: -.7, comb:[0,-.8,.2] });
    kit.bake(jaw); kit.bake(head);
    heads.push({ head, jaw, lids: [-1, 1].map(side => head.getObjectByName(`HoundLid${i}:${side}`)), ears: [-1, 1].map(side => head.getObjectByName(`HoundEar${i}:${side}`)) });
  }
  const legs = [];
  for (const x of [-.46, .46]) for (const z of [-.42, .88]) {
    const front = z < 0, leg = pivot(body, `HoundLeg:${x}:${z}`, [x, .92, z]);
    const knee = pivot(leg, `HoundKnee:${x}:${z}`, [0, -.32, front ? .015 : .10]);
    const paw = pivot(knee, `HoundPaw:${x}:${z}`, [0, -.43, front ? -.035 : -.10]);
    kit.lathe(leg, fur, [[.105, -.36], [.14, -.22], [.19, 0], [.22, .17], [.12, .27]], [0, 0, 0], [1, 1, 1.15]);
    kit.lathe(knee, fur, [[.075, -.45], [.078, -.28], [.10, -.12], [.12, .04]], [0, 0, 0], [1, 1, 1.1]);
    detailOval(kit, paw, muzzle, [0, -.065, -.085], [.17, .10, .22]);
    for (let toe = -1; toe <= 1; toe++) {
      detailOval(kit, paw, fur, [toe * .081, -.06, -.24], [.055, .07, .085]);
      detailOval(kit, paw, nose, [toe * .081, -.058, -.305], [.018, .018, .038]);
    }
    kit.bake(leg); kit.bake(knee); kit.bake(paw); legs.push({ leg, knee, paw, front, side: Math.sign(x) });
  }
  const tail = pivot(body, 'HoundTail', [0, 1.32, 1.12]); kit.tube(tail, fur, [[0, 0, 0], [.10, .19, .30], [.22, .25, .57]], .075); kit.bake(tail); kit.bake(body);
  let time = 0, phase = 0, sleep = 0, recoil = 0, releaseAge = 2, lastAction = 'idle', disposed = false;
  function update(dt, state = {}) {
    if (disposed) return; dt = visualDt(dt); time += dt;
    const action = state.action ?? 'idle', speed = Math.max(0, state.speed ?? 0), resting = ['downed','dead','sleep'].includes(action);
    if (action === 'hurt' && lastAction !== action) recoil = 1;
    if (lastAction === 'attack' && state.attackPhase === 'recover' && !resting && action !== 'hurt') releaseAge = 0;
    if (resting) releaseAge = 2;
    releaseAge += dt; recoil *= Math.exp(-dt * 8); lastAction = action; phase += speed * dt * 3.7;
    sleep = THREE.MathUtils.damp(sleep, resting ? 1 : 0, 3, dt);
    const moving = Math.min(1, speed) * (1 - sleep), charge = action === 'attack' ? THREE.MathUtils.clamp(state.windupProgress ?? .5, 0, 1) : 0;
    const bite = releaseAge < .34 ? Math.sin(releaseAge / .34 * Math.PI) : 0;
    // Fold the hocks before settling the torso so the paws stay above the floor.
    body.position.set(0, -(sleep ** 3) * .49 + Math.sin(time * 1.1) * .009 * (1 - sleep), recoil * .055 - bite * .075);
    body.rotation.x = -charge * .035 + recoil * .065; body.rotation.z = Math.sin(phase) * .014 * moving;
    heads.forEach(({head, jaw, lids, ears}, i) => {
      head.rotation.x = .42 * sleep + Math.sin(time * (1.1 + i * .1) + i) * .022 * (1 - sleep) - charge * .11 + bite * .12;
      head.rotation.y = Math.sin(time * .6 + i * 2) * .085 * (1 - sleep) * (1 - charge);
      jaw.rotation.x = -(charge * (.20 + i * .035) + bite * .32 + (.045 + Math.sin(time * 1.2 + i) * .012) * (1 - sleep));
      const blink = Math.max(sleep, blinkAmount(time, i * 1.23));
      lids.forEach(lid => { lid.position.y = .17 - blink * .037; lid.scale.y = .014 + blink * .023; });
      ears.forEach((ear, side) => ear.rotation.z = Math.sin(time * 1.5 + i + side) * .035 + (side ? -1 : 1) * recoil * .11);
    });
    legs.forEach(({leg,knee,paw,front,side}) => {
      const angle = phase + (front === (side < 0) ? 0 : Math.PI), swing = Math.max(0, Math.sin(angle));
      leg.rotation.x = Math.cos(angle) * .21 * moving + sleep * (front ? -1.45 : 1.35);
      knee.rotation.x = swing * .35 * moving + sleep * (front ? 2.45 : -2.5);
      paw.rotation.x = -leg.rotation.x - knee.rotation.x + swing * .07 * moving;
      knee.position.z=(front?.015:.10)*(1-sleep);paw.position.z=(front?-.035:-.10)*(1-sleep);
    });
    tail.rotation.z = Math.sin(time * 1.7) * .11 * (1 - sleep);
  }
  update(0); root.userData.visualKind = 'three-headed-hound';
  return { root, forward: 'negative-z', update,
    debugSnapshot: () => ({ heads: heads.length, legs: legs.length, sleep, recoil, releaseAge, jawAngles: heads.map(h=>h.jaw.rotation.x), kneeAngles: legs.map(l=>l.knee.rotation.x) }),
    dispose() { if (disposed) return; disposed = true; root.removeFromParent(); kit.dispose(); root.clear(); } };
}

function createDragon() {
  const kit = createSculptureKit(), root = new THREE.Group(); root.name = 'DetailedCreature:Norbert';
  const scaleMap = creatureSurface(kit, 'scales');
  const scales = kit.material({ color: '#798b78', roughness: .72, map: scaleMap, bumpMap: scaleMap, bumpScale: .004 });
  const membrane = kit.material({ color: '#826f54', roughness: .84, side: THREE.DoubleSide, bumpMap: scaleMap, bumpScale: .001 });
  const horn = kit.material({ color: '#b9ab8b', roughness: .8 });
  const eye = kit.material({ color: '#b29345', roughness: .25 });
  const dark = kit.material({ color: '#242d24', roughness: .7 });
  const body = pivot(root, 'DragonBody', [0, 0, 0]);
  kit.mesh(body, organicLoft([
    {z:-.36,y:.38,rx:.03,ry:.05},{z:-.23,y:.39,rx:.18,ry:.23},{z:.04,y:.35,rx:.23,ry:.27},
    {z:.28,y:.32,rx:.19,ry:.20},{z:.48,y:.32,rx:.045,ry:.06},
  ]), scales);
  const head = pivot(body, 'DragonHead', [0, .56, -.36]);
  kit.mesh(head, organicLoft([
    {z:.18,y:-.03,rx:.04,ry:.07},{z:.07,y:0,rx:.17,ry:.18},{z:-.10,y:0,rx:.19,ry:.16},
    {z:-.20,y:-.035,rx:.125,ry:.09},{z:-.35,y:-.045,rx:.09,ry:.055},{z:-.39,y:-.045,rx:.01,ry:.015},
  ]), scales);
  const jaw = pivot(head, 'DragonJaw', [0, -.085, -.13]);
  kit.mesh(jaw, organicLoft([{z:.06,y:0,rx:.015,ry:.02},{z:-.045,y:0,rx:.105,ry:.035},{z:-.20,y:.005,rx:.075,ry:.025},{z:-.24,y:.006,rx:.01,ry:.008}]), scales);
  detailOval(kit, jaw, dark, [0, .023, -.10], [.08,.009,.10]);
  const lids = [];
  for (const side of [-1, 1]) {
    detailOval(kit, head, eye, [side * .147, .035, -.15], [.033, .026, .020]); detailOval(kit, head, dark, [side * .15, .035, -.168], [.007, .022, .005]);
    kit.tube(head, scales, [[side*.10,.08,-.16],[side*.16,.08,-.13],[side*.19,.05,-.08]],.019);
    const lid=detailOval(kit, head,scales,[side*.147,.067,-.173],[.035,.012,.007]);lid.name=`DragonLid:${side}`;lid.userData.keepSeparate=true;lids.push(lid);
    detailOval(kit, head,dark,[side*.052,-.031,-.362],[.011,.007,.006]);
    kit.mesh(head, new THREE.ConeGeometry(.031, .18, 12), horn, [side * .13, .17, .04], [1, 1, 1], [.4, 0, -side * .3]);
    for(let i=0;i<4;i++)kit.mesh(jaw,new THREE.ConeGeometry(.006,.021,6),horn,[side*.069,.035,-.045-i*.036]);
  }
  const tail = [], tailRoot = pivot(body,'DragonTailBase',[0,.34,.36]); let tailParent=tailRoot;
  for(let i=0;i<3;i++){
    const segment = i===0?tailRoot:pivot(tailParent,`DragonTailJoint${i}`,[0,-.025,.22]);
    kit.tube(segment,scales,[[0,0,0],[.015,-.02,.12],[0,-.025,.23]],.058-i*.016);
    kit.mesh(segment,new THREE.ConeGeometry(.017-i*.003,.07-i*.01,7),horn,[0,.03,.13]);kit.bake(segment);tail.push(segment);tailParent=segment;
  }
  for (let i = 0; i < 6; i++) kit.mesh(body, new THREE.ConeGeometry(.025, .09, 8), horn, [0, .61 - i * .038, -.08 + i * .085]);
  const wings = [], legs=[];
  for (const side of [-1, 1]) {
    const wing = pivot(body, `DragonWing${side}`, [side * .17, .48, .05]), shape = new THREE.Shape(); wings.push({wing,side});
    shape.moveTo(0,0); shape.quadraticCurveTo(side*.18,-.18,side*.38,-.21); shape.lineTo(side*.67,-.08);
    shape.quadraticCurveTo(side*.42,-.02,side*.55,.32);shape.quadraticCurveTo(side*.30,.17,side*.31,.39);
    shape.quadraticCurveTo(side*.13,.23,side*.065,.23);shape.lineTo(0,0);
    const g=new THREE.ShapeGeometry(shape,20);g.rotateX(Math.PI/2);const positions=g.attributes.position;
    for(let i=0;i<positions.count;i++)positions.setY(i,-.045*Math.sin(Math.abs(positions.getX(i))/.68*Math.PI));g.computeVertexNormals();
    kit.mesh(wing,g,membrane).name=`DragonWingMembrane:${side}`;
    const elbow=[side*.18,.025,-.12],wrist=[side*.38,0,-.21];
    kit.tube(wing,scales,[[0,0,0],elbow,wrist],.017);
    for(const tip of [[side*.67,0,-.08],[side*.55,0,.32],[side*.31,0,.39],[side*.065,0,.23]]){
      kit.tube(wing,scales,[wrist,[tip[0]*.85,-.025,tip[2]*.65],tip],.008);
      kit.tube(wing,horn,[elbow,[tip[0]*.60,-.03,tip[2]*.56],[tip[0]*.80,-.02,tip[2]*.83]],.0018);
    }
    kit.mesh(wing,new THREE.ConeGeometry(.016,.07,8),horn,[side*.22,.04,-.16],[1,1,1],[0,0,-side*.7]);
    kit.bake(wing);
    for (const z of [-.20, .29]) {
      const leg = pivot(body, `DragonLeg${side}:${z}`, [side * .17, .24, z]),knee=pivot(leg,`DragonKnee${side}:${z}`,[0,-.105,.025]),foot=pivot(knee,`DragonFoot${side}:${z}`,[0,-.10,-.025]);
      kit.lathe(leg,scales,[[.032,-.12],[.05,-.04],[.065,.03]], [0,0,0]);kit.lathe(knee,scales,[[.024,-.10],[.03,-.06],[.035,.025]],[0,0,0]);
      detailOval(kit, foot,scales,[0,-.01,-.025],[.045,.025,.065]);
      for(let toe=-1;toe<=1;toe++)detailOval(kit, foot,horn,[toe*.027,-.015,-.08],[.010,.010,.036]);
      kit.bake(leg);kit.bake(knee);kit.bake(foot);legs.push({leg,knee,foot,front:z<0,side});
    }
  }
  kit.bake(body); kit.bake(head);kit.bake(jaw);
  let time=0,gait=0,down=0,recoil=0,lastAction='idle',releaseAge=2,disposed=false;
  function update(dt,state={}){
    if(disposed)return;dt=visualDt(dt);time+=dt;const action=state.action??'idle',speed=Math.max(0,state.speed??0),dead=['downed','dead','sleep'].includes(action);
    if(action==='hurt'&&lastAction!==action)recoil=1;
    if(lastAction==='attack'&&state.attackPhase==='recover'&&!dead&&action!=='hurt')releaseAge=0;
    if(dead)releaseAge=2;
    recoil*=Math.exp(-dt*9);releaseAge+=dt;lastAction=action;gait+=dt*speed*9;down=THREE.MathUtils.damp(down,dead?1:0,5,dt);
    const charge=action==='attack'?THREE.MathUtils.clamp(state.windupProgress??.5,0,1):0,breath=releaseAge<.4?Math.sin(releaseAge/.4*Math.PI):0,moving=Math.min(1,speed)*(1-down);
    body.position.set(0,Math.sin(time*1.8)*.007*(1-down)-down*.08,recoil*.035);body.rotation.z=down*.08+recoil*.06;
    head.rotation.y=Math.sin(time*1.1)*.10*(1-down)*(1-charge);head.rotation.x=charge*-.20+breath*.10+down*.20;
    jaw.rotation.x=-charge*.13-breath*.26-(.018+Math.sin(time*1.6)*.012)*(1-down);
    const blink=Math.max(down,blinkAmount(time,.7,5.3));lids.forEach(lid=>{lid.position.y=.067-blink*.029;lid.scale.y=.012+blink*.015;});
    wings.forEach(({wing,side})=>{wing.rotation.z=-side*((.32+Math.sin(time*2.2)*.09)*(1-down)-down*.7+charge*.23);wing.rotation.y=side*(Math.sin(time*1.7)*.045+breath*.12-down);});
    tail.forEach((segment,i)=>{segment.rotation.y=Math.sin(time*1.5-i*.65)*(.09+i*.035)*(1-down);segment.rotation.x=down*.07+Math.sin(time*1.1-i*.5)*.025;});
    legs.forEach(({leg,knee,foot,front,side})=>{const phase=gait+(front===(side<0)?0:Math.PI),swing=Math.max(0,Math.sin(phase));leg.rotation.x=Math.cos(phase)*.26*moving-down*1.3; knee.rotation.x=swing*.48*moving+down*2.2;foot.rotation.x=-leg.rotation.x-knee.rotation.x;});
  }
  update(0);root.userData.visualKind='norwegian-ridgeback-hatchling';
  return{root,forward:'negative-z',update,debugSnapshot:()=>({wings:wings.length,tailJoints:tail.length,legs:legs.length,down,recoil,releaseAge,kneeAngles:legs.map(l=>l.knee.rotation.x),tailAngles:tail.map(t=>t.rotation.y)}),dispose(){if(disposed)return;disposed=true;root.removeFromParent();kit.dispose();root.clear();}};
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
  // The scene can release an arena twice after an interrupted transition. Every
  // creature shares the same idempotent lifecycle, including legacy variants.
  const update = result.update, dispose = result.dispose; let disposed = false;
  result.update = (dt,state) => { if (!disposed) update(visualDt(dt),state); };
  result.dispose = () => { if (disposed) return; disposed = true; dispose(); };
  return result;
}
