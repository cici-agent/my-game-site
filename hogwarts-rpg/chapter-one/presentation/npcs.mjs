import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createAvatarMotion, createLimbRig } from '../../world/avatar-motion.mjs';
import { createNpcFace } from './npc-face.mjs';
import { createNpcHair } from './npc-hair.mjs';
import { addNpcAttire, addNpcOccupationProp } from './npc-attire.mjs';
import { fitNpcProportions } from './npc-proportions.mjs';

// Independently authored supporting actors. The three protected workshop GLBs are
// never imported or modified here. Smooth geometry, fabric/skin microstructure and
// articulated joints use a restrained palette compatible with their PBR materials.
export function createSculptureKit() {
  const geometries = new Set(), materials = new Set(), textures = new Set(), instanceMeshes = new Set();
  let disposed = false;
  const trackInstance = node => (instanceMeshes.add(node), node);
  const geometry = g => (geometries.add(g), g);
  const material = options => { const m = new THREE.MeshStandardMaterial(options); materials.add(m); return m; };
  function texture(kind = 'cloth', size = 64) {
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4, n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
      const noise = n - Math.floor(n);
      const value = kind === 'wood' ? 155 + 30 * Math.sin(x * .9 + Math.sin(y * .14) * .8) + 12 * Math.sin(x * 3.1 + Math.sin(y * .07)) + noise * 15 : kind === 'cloth' ? 162 + (x % 4 < 2 ? 26 : -14) + (y % 4 < 2 ? 20 : -10) + noise * 18 : 135 + noise * 88;
      data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255;
    }
    const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    map.wrapS = map.wrapT = THREE.RepeatWrapping; map.repeat.set(kind === 'cloth' ? 8 : 3, kind === 'cloth' ? 8 : 3); map.needsUpdate = true;
    textures.add(map); return map;
  }
  function mesh(parent, g, m, at = [0, 0, 0], scale = [1, 1, 1], rotation = [0, 0, 0]) {
    const node = new THREE.Mesh(geometry(g), m); node.position.set(...at); node.scale.set(...scale); node.rotation.set(...rotation);
    node.castShadow = true; node.receiveShadow = true; parent.add(node); return node;
  }
  const oval = (parent, m, at, scale, rotation) => mesh(parent, new THREE.SphereGeometry(1, 28, 20), m, at, scale, rotation);
  const tube = (parent, m, points, radius = .006) => mesh(parent, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p))), Math.max(8, points.length * 4), radius, 6, false), m);
  const lathe = (parent, m, rings, at, scale = [1, 1, 1], folds = 0) => {
    const g = new THREE.LatheGeometry(rings.map(r => new THREE.Vector2(...r)), 48);
    if (folds) {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), y = p.getY(i), theta = Math.atan2(z, x);
        const f = 1 + Math.sin(theta * 11 + y * .8) * folds + Math.sin(theta * 23 - y) * folds * .2;
        p.setXYZ(i, x * f, y, z * f);
      }
      p.needsUpdate = true; g.computeVertexNormals();
    }
    return mesh(parent, g, m, at, scale);
  };
  function instances(parent, m, transforms, shape = 'sphere') {
    const g = geometry(shape === 'curl' ? new THREE.TorusGeometry(1, .30, 4, 9) : shape === 'cylinder' ? new THREE.CylinderGeometry(1, 1, 1, 8) : new THREE.SphereGeometry(1, shape === 'fiber' ? 8 : 14, shape === 'fiber' ? 6 : 10));
    const model = trackInstance(new THREE.InstancedMesh(g, m, transforms.length)), dummy = new THREE.Object3D();
    transforms.forEach((t, i) => { dummy.position.set(...t.position); dummy.scale.set(...t.scale); dummy.rotation.set(...(t.rotation ?? [0, 0, 0])); dummy.updateMatrix(); model.setMatrixAt(i, dummy.matrix); });
    model.instanceMatrix.needsUpdate = true; model.castShadow = true; model.receiveShadow = true; parent.add(model); return model;
  }
  function bake(parent) {
    const grouped = new Map();
    for (const node of [...parent.children]) {
      if (!node.isMesh || node.isInstancedMesh || node.isSkinnedMesh || node.userData.keepSeparate) continue;
      node.updateMatrix();
      // Also retain externally supplied source geometry so merging an existing
      // creature does not orphan GPU allocations when its old meshes are removed.
      geometries.add(node.geometry);
      const g = geometry(node.geometry.clone().applyMatrix4(node.matrix));
      if (g.index) { const unindexed = geometry(g.toNonIndexed()); grouped.set(node.material, [...(grouped.get(node.material) ?? []), unindexed]); }
      else grouped.set(node.material, [...(grouped.get(node.material) ?? []), g]);
      node.removeFromParent();
    }
    const added = [];
    for (const [m, group] of grouped) {
      const merged = geometry(mergeGeometries(group, false));
      const node = new THREE.Mesh(merged, m); node.castShadow = true; node.receiveShadow = true; parent.add(node); added.push(node);
    }
    return added;
  }
  function dispose() {
    if (disposed) return; disposed = true;
    for (const node of instanceMeshes) node.dispose(); instanceMeshes.clear();
    for (const g of geometries) g.dispose(); for (const m of materials) m.dispose(); for (const t of textures) t.dispose();
  }
  return { geometry, material, texture, mesh, oval, tube, lathe, instances, trackInstance, bake, dispose, geometries, materials };
}

const designs = {
  hagrid: { name: '鲁伯·海格', scale: 1.56, width: 1.26, skin: '#b98668', cloth: '#66513b', hair: '#3d2b20', beard: true, longHair: true, coat: true },
  mcgonagall: { name: '麦格教授', scale: 1.14, width: .96, skin: '#c99d85', cloth: '#254c41', hair: '#393b38', hat: true, glasses: true, bun: true },
  flitwick: { name: '弗立维教授', scale: .78, width: 1.05, skin: '#c7a388', cloth: '#4c4059', hair: '#b4b0a1', beard: true, glasses: true },
  snape: { name: '斯内普教授', scale: 1.17, width: .94, skin: '#c4b2a1', cloth: '#22252c', hair: '#17191d', longHair: true },
  dumbledore: { name: '邓布利多', scale: 1.22, width: .98, skin: '#c9a990', cloth: '#544760', hair: '#c5c6bb', beard: true, longBeard: true, glasses: true, longHair: true, hat: true },
  quirrell: { name: '奇洛', scale: 1.12, width: .95, skin: '#c5a18a', cloth: '#4d4359', hair: '#3c2d28', turban: true },
  pomfrey: { name: '庞弗雷夫人', scale: 1.09, width: 1.02, skin: '#c89f87', cloth: '#d0c8b4', hair: '#7b6a59', bun: true },
  sprout: { name: '斯普劳特教授', scale: 1.04, width: 1.14, skin: '#c39172', cloth: '#6c6650', hair: '#70604e', hat: true, longHair: true },
  molly: { name: '韦斯莱夫人', scale: 1.05, width: 1.12, skin: '#cda084', cloth: '#78534e', hair: '#8d462b', bun: true },
  hooch: { name: '霍琦夫人', scale: 1.09, width: .98, skin: '#c8a58d', cloth: '#715c3e', hair: '#c3c1b1', flight: true },
  wood: { name: '奥利弗·伍德', scale: 1.05, width: 1.04, skin: '#c49a7a', cloth: '#68383a', hair: '#3c2e27', student: true, flight: true },
  pince: { name: '平斯夫人', scale: 1.10, width: .92, skin: '#c6ad98', cloth: '#343e46', hair: '#47403b', bun: true, glasses: true, book: true },
  filch: { name: '阿格斯·费尔奇', scale: 1.12, width: .97, skin: '#b59880', cloth: '#585145', hair: '#686052', longHair: true, caretaker: true },
  neville: { name: '纳威·隆巴顿', scale: .96, width: 1.04, skin: '#d0af92', cloth: '#574b43', hair: '#69503b', student: true },
  draco: { name: '德拉科·马尔福', scale: .97, width: .95, skin: '#d1b9a2', cloth: '#25362f', hair: '#c7b684', student: true },
  supply: { name: '诺拉·佩恩', scale: 1.05, width: 1.06, skin: '#b78d72', cloth: '#536650', hair: '#4b3526', bun: true, apron: true },
  gear: { name: '埃文·里德', scale: 1.12, width: 1.08, skin: '#b89175', cloth: '#4f576b', hair: '#59483e', apron: true },
  tools: { name: '米拉·格林', scale: 1.04, width: .98, skin: '#cba28a', cloth: '#586a6a', hair: '#845b3d', bun: true, glasses: true },
  post: { name: '艾达·莫斯', scale: 1.06, width: 1.01, skin: '#c19a7f', cloth: '#786149', hair: '#4c4039', bun: true },
  trolley: { name: '糖果车女巫', scale: 1.02, width: 1.03, skin: '#cba58b', cloth: '#66546b', hair: '#a9a69a', bun: true, apron: true },
  generic: { name: '学校职员', scale: 1.1, width: 1, skin: '#bc997f', cloth: '#53605b', hair: '#615346' },
};
const pivot = (parent, name, x, y, z) => { const group = new THREE.Group(); group.name = name; group.position.set(x, y, z); parent.add(group); return group; };

export function createNpc({ id = 'hagrid', scale = 1 } = {}) {
  if (id === 'firenze') return createFirenze(scale);
  const design = designs[id] ?? designs.generic, kit = createSculptureKit();
  const { material, texture, oval, lathe, mesh, tube, instances } = kit;
  const wool = texture('cloth'), pores = texture('skin');
  const skin = material({ color: design.skin, roughness: .68, bumpMap: pores, bumpScale: .0018 });
  const skinWarm = material({ color: new THREE.Color(design.skin).multiplyScalar(.91), roughness: .77 });
  const cloth = material({ color: design.cloth, roughness: .87, bumpMap: wool, bumpScale: .0015 });
  const edge = material({ color: new THREE.Color(design.cloth).multiplyScalar(.7), roughness: .9, bumpMap: wool, bumpScale: .0015 });
  const hair = material({ color: design.hair, roughness: .9 });
  const hairLight = material({ color: new THREE.Color(design.hair).multiplyScalar(1.2), roughness: .88 });
  const leather = material({ color: '#322a24', roughness: .7, bumpMap: pores, bumpScale: .002 });
  const sole = material({ color: '#171817', roughness: 1 });
  const brass = material({ color: '#92754c', metalness: .62, roughness: .43 });
  const ivory = material({ color: '#dfd6bd', roughness: .82 });
  const root = new THREE.Group(); root.name = `DetailedNPC:${id}`;
  const body = pivot(root, 'Body', 0, 0, 0); body.scale.set(design.scale * design.width * scale, design.scale * scale, design.scale * scale);
  const head = pivot(body, 'Head', 0, 1.53, 0);
  head.scale.setScalar(id === 'hagrid' ? .86 : id === 'flitwick' ? .82 : .75);
  const torsoRings = design.coat ? [[.29, 0], [.30, .06], [.31, .30], [.32, .45], [.315, .65], [.27, .80], [.12, .88]] : [[.32, 0], [.31, .1], [.255, .45], [.24, .65], [.27, .79], [.11, .87]];
  lathe(body, cloth, torsoRings, [0, .47, 0], [1, 1, .72], .024);
  lathe(body, edge, [[.31, 0], [.31, .028]], [0, .472, 0], [1, 1, .73]);
  oval(body, id === 'snape' ? edge : ivory, [0, 1.32, -.075], [.063, .061, .021]);
  for (const side of [-1, 1]) {
    tube(body, edge, [[side * .13, 1.35, -.08], [side * .25, 1.21, -.15], [side * .09, 1.01, -.21]], .014);
    for (let i = 0; i < 4; i++) tube(body, edge, [[side * (.15 + i * .034), .55, -.19], [side * (.13 + i * .032), .70, -.205], [side * (.12 + i * .028), .87, -.19]], .0025);
    oval(body, edge, [side * .185, .80, -.205], [.082, .075, .012]);
    tube(body, brass, [[side * .26, .848, -.22], [side * .18, .844, -.225], [side * .11, .848, -.22]], .003);
  }
  for (let i = 0; i < 6; i++) oval(body, brass, [0, 1.22 - i * .105, -.238], [.012, .012, .006]);
  if (design.coat) {
    lathe(body, leather, [[.306, 0], [.309, .063]], [0, .87, 0], [1, 1, .75]);
    mesh(body, new THREE.TorusGeometry(.034, .006, 8, 20), brass, [.035, .905, -.243], [1.1, .75, 1]);
    oval(body, leather, [.245, .71, .08], [.082, .11, .10]);
  }
  const face = createNpcFace({ kit, head, id, skin, skinWarm, hair, ivory, brass, glasses: design.glasses });
  createNpcHair({ kit, head, id, design, hair });
  if (design.hat) {
    lathe(head, cloth, [[.23, 0], [.245, .015], [.18, .034], [.145, .15], [.08, .27], [.012, .36]], [0, .19, .005], [1, 1, .9], .015);
    lathe(head, brass, [[.176, 0], [.171, .018]], [0, .235, .005], [1, 1, .9]);
  }
  if (design.turban) {
    oval(head, cloth, [0, .16, .02], [.215, .16, .195]);
    for (let i = 0; i < 7; i++) {
      const ring = mesh(head, new THREE.TorusGeometry(.181 - i * .008, .013, 8, 36), edge, [0, .12 + i * .023, .018], [1, 1, .95], [Math.PI / 2, .12 + i * .014, .08]);
      ring.name = `TurbanWrap${i}`;
    }
    lathe(head, cloth, [[.035, 0], [.04, .30], [.055, .34]], [.15, -.20, .13], [1, 1, .5]);
  }
  const attire = addNpcAttire({ kit, body, head, id, design, cloth, edge, leather, ivory, brass, wool });
  const arms = [], legs = [], armRigs = [], legRigs = [];
  for (const side of [-1, 1]) {
    const arm = pivot(body, side < 0 ? 'ArmL' : 'ArmR', side * .285, 1.265, .004);
    const sleeve = new THREE.SplineCurve([[.057, 0], [.067, .035], [.076, .10], [.078, .24], [.091, .34], [.087, .39], [.061, .425], [.025, .442], [0, .445]].map(([x, y]) => new THREE.Vector2(x, y))).getPoints(32).map(p => [Math.max(0, p.x), p.y]);
    lathe(arm, cloth, sleeve, [side * .035, -.39, 0], [1, 1, .95], .012);
    lathe(arm, edge, [[.066, 0], [.066, .028]], [side * .04, -.387, 0]);
    oval(arm, skin, [side * .052, -.43, -.012], [.054, .069, .043]);
    for (let f = 0; f < 4; f++) oval(arm, skin, [side * .047 + (f - 1.5) * .018, -.478, -.019], [.010, .032, .012], [.12, 0, -.025 * side]);
    const leg = pivot(body, side < 0 ? 'LegL' : 'LegR', side * .115, .65, .01);
    oval(leg, edge, [0, -.20, 0], [.10, .24, .096]);
    oval(leg, leather, [0, -.435, -.005], [.083, .145, .084]);
    oval(leg, leather, [0, -.574, -.04], [.09, .064, .14]);
    oval(leg, sole, [0, -.619, -.038], [.093, .018, .143]);
    for (let lace = 0; lace < 4; lace++) tube(leg, brass, [[-.032, -.50 - lace * .017, -.092], [.029, -.505 - lace * .017, -.098]], .0025);
    kit.bake(arm); kit.bake(leg);
    const ar = createLimbRig(arm, 'arm', side), lr = createLimbRig(leg, 'leg', side);
    for (const m of [...arm.children].filter(m => m.isMesh)) ar.skin(m, 'legacy');
    for (const m of [...leg.children].filter(m => m.isMesh)) lr.skin(m, 'legacy');
    arms.push(arm); legs.push(leg); armRigs.push(ar); legRigs.push(lr);
  }
  const held = pivot(armRigs[1].tip, 'HeldProp', 0, -.04, -.01);
  if (id === 'hagrid') {
    const lantern = pivot(armRigs[0].tip, 'Lantern', 0, -.14, 0);
    lathe(lantern, brass, [[.075, 0], [.08, .02], [.06, .035], [.06, .17], [.08, .19], [.03, .22]], [0, -.17, 0]);
    const glass = material({ color: '#e6b35c', emissive: '#c78626', emissiveIntensity: .7, roughness: .25, transparent: true, opacity: .78 });
    oval(lantern, glass, [0, -.065, 0], [.055, .085, .055]);
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; tube(lantern, brass, [[Math.cos(a) * .06, -.16, Math.sin(a) * .06], [Math.cos(a) * .06, .02, Math.sin(a) * .06]], .004); }
    mesh(lantern, new THREE.TorusGeometry(.045, .004, 6, 20), brass, [0, .06, 0]);
    const light = new THREE.PointLight('#ffd6a0', .7, 3, 2); lantern.add(light);
    const pink = material({ color: '#9b6570', roughness: .86 });
    lathe(held, pink, [[.008, 0], [.032, .09], [.035, .46], [.012, .63]], [0, -.44, -.03], [1, 1, 1], .05);
    tube(held, leather, [[0, .20, -.03], [0, .24, -.04], [.025, .25, -.04], [.04, .22, -.04]], .009);
  } else {
    const wand = material({ color: '#493326', roughness: .6 });
    lathe(held, wand, [[.012, 0], [.014, .07], [.008, .20], [.0035, .37]], [0, -.33, -.015]);
  }
  const glow = new THREE.Object3D(); held.add(glow); glow.position.set(0, -.33, -.015);
  addNpcOccupationProp({ kit, hand: armRigs[0].tip, id, brass, leather, ivory, ...attire });
  const proportions = fitNpcProportions({ id, root, body, head, arms, legs, armRigs, legRigs });
  kit.bake(body); kit.bake(head); kit.bake(held);
  const motion = createAvatarMotion({ body, head, arms, legs, armRigs, legRigs, glow, seed: id.length * 13 });
  let time = 0, lastAction = 'idle', disposed = false, seated = 0, engagement = 0, gazeYaw = 0, expression = null;
  function update(dt, state = {}) {
    if (disposed) return;
    dt = Math.max(0, Math.min(.1, Number(dt) || 0)); time += dt;
    const action = state.action ?? 'idle', requestedSpeed = state.speed ?? state.moveSpeed ?? 0, speed = Number.isFinite(requestedSpeed) ? Math.max(0, requestedSpeed) : 0;
    if (action !== lastAction) {
      if (action === 'attack' || action === 'cast') motion.playAction('bolt');
      if (action === 'hurt') motion.playAction('hit');
      lastAction = action;
    }
    motion.animate(dt, { moving: speed > .01, speed: speed / design.scale, grounded: true, combat: id === 'quirrell', downed: action === 'downed' || action === 'dead' });
    proportions?.animate();
    seated = THREE.MathUtils.damp(seated, action === 'sit' ? 1 : 0, 9, dt);
    if (seated > .001) {
      if (proportions) proportions.sit(seated);
      else body.position.y -= .23 * seated;
      // Actors face -Z: positive hip flexion brings knees forward, and the
      // counter-rotated knee leaves shins vertical with feet near the boat deck.
      if (!proportions) for (let i = 0; i < legs.length; i++) { legs[i].rotation.x += 1.25 * seated; legRigs[i].bend.rotation.x -= 1.25 * seated; }
      arms[0].rotation.x += .18 * seated; arms[1].rotation.x += .18 * seated;
      head.rotation.x += Math.sin(time * 1.3) * .012 * seated;
    }
    const inactive = action === 'downed' || action === 'dead';
    let targetYaw = 0;
    if (Number.isFinite(state.lookAt?.x) && Number.isFinite(state.lookAt?.z) && !inactive) {
      const a = Math.atan2(state.lookAt.x - root.position.x, state.lookAt.z - root.position.z) - root.rotation.y - Math.PI;
      targetYaw = THREE.MathUtils.clamp(Math.atan2(Math.sin(a), Math.cos(a)), -.55, .55);
    }
    gazeYaw = THREE.MathUtils.damp(gazeYaw, targetYaw, 7, dt); head.rotation.y += gazeYaw * .55;
    const speaking = Boolean(state.talking || state.engaged) && !inactive;
    expression = face.update(dt, { lookX: gazeYaw / .55, talking: speaking, inactive });
    engagement = THREE.MathUtils.damp(engagement, speaking && speed < .05 && seated < .1 && !['attack', 'cast', 'hurt'].includes(action) ? 1 : 0, 7, dt);
    // A small asymmetrical greeting, with the prop-bearing hand kept low. The
    // controller continues to own root movement and escort destination.
    if (engagement > .001) {
      const measured = ['snape', 'mcgonagall', 'pince'].includes(id) ? .55 : 1;
      const gesture = (.5 + .5 * Math.sin(time * 1.7 + id.length)) * engagement * measured;
      arms[0].rotation.x += .10 * gesture; armRigs[0].bend.rotation.x += .19 * gesture;
      armRigs[0].tip.rotation.z += .055 * gesture;
      head.rotation.x += Math.sin(time * 3.2) * .012 * engagement;
      head.rotation.z += Math.sin(time * .8) * .012 * engagement;
    }
  }
  function dispose() {
    if (disposed) return; disposed = true; root.removeFromParent();
    for (const rig of [...armRigs, ...legRigs]) rig.dispose(); kit.dispose(); root.clear();
  }
  root.userData.visualKind = id; root.userData.explicitGenericFallback = !designs[id]; root.userData.visualTier = 'authored_supporting_actor_v2';
  return { root, name: design.name, update, animate: update, dispose, react: () => motion.playAction('hit'), debugSnapshot: () => ({ face: face.profile, proportions: proportions?.measurements ?? null, expression: expression ? { ...expression } : null, seated, engagement, action: lastAction }), getCastOriginWorld: (out = new THREE.Vector3()) => { root.updateMatrixWorld(true); return glow.getWorldPosition(out); } };
}
export async function loadNpc(options) { return createNpc(typeof options === 'string' ? { id: options } : options); }

function createFirenze(scale) {
  const kit = createSculptureKit(), root = new THREE.Group(); root.name = 'DetailedNPC:Firenze'; root.scale.setScalar(scale);
  const pores = kit.texture('skin');
  const hide = kit.material({ color: '#a98d70', roughness: .88, bumpMap: pores, bumpScale: .003 });
  const skin = kit.material({ color: '#c6a68b', roughness: .7, bumpMap: pores, bumpScale: .002 });
  const dark = kit.material({ color: '#5b5145', roughness: .86 });
  const hair = kit.material({ color: '#c7b68b', roughness: .86 });
  const hoof = kit.material({ color: '#34332d', roughness: .9 });
  const white = kit.material({ color: '#dfd6c4', roughness: .43 });
  const iris = kit.material({ color: '#6092aa', roughness: .25 });
  const body = pivot(root, 'CentaurBody', 0, 0, 0);
  kit.oval(body, hide, [0, 1.19, .20], [.38, .43, .78]);
  kit.oval(body, hide, [0, 1.27, -.44], [.34, .40, .38]);
  const chest = pivot(body, 'HumanTorso', 0, 1.35, -.48);
  kit.lathe(chest, skin, [[.20, 0], [.22, .17], [.26, .37], [.30, .56], [.19, .66], [.10, .72]], [0, 0, 0], [1, 1, .62]);
  for (const side of [-1, 1]) {
    kit.oval(chest, skin, [side * .12, .50, -.13], [.14, .12, .065]);
    kit.tube(chest, dark, [[side * .08, .35, -.142], [side * .10, .20, -.14], [side * .07, .09, -.135]], .002);
  }
  const head = pivot(chest, 'Head', 0, .88, 0);
  kit.oval(head, skin, [0, 0, 0], [.17, .23, .145]);
  kit.oval(head, skin, [0, -.16, .005], [.095, .11, .085]);
  for (const side of [-1, 1]) {
    kit.oval(head, skin, [side * .17, 0, 0], [.032, .062, .033]);
    kit.oval(head, white, [side * .064, .035, -.137], [.031, .020, .017]);
    kit.oval(head, iris, [side * .064, .035, -.152], [.014, .014, .007]);
    kit.oval(head, hoof, [side * .064, .035, -.158], [.006, .009, .004]);
    kit.oval(head, hair, [side * .065, .077, -.13], [.044, .011, .015]);
  }
  kit.oval(head, skin, [0, -.008, -.152], [.029, .044, .036]);
  kit.tube(head, dark, [[-.037, -.08, -.134], [0, -.087, -.147], [.037, -.08, -.134]], .003);
  kit.oval(head, hair, [0, .15, .035], [.18, .12, .15]);
  const locks = Array.from({ length: 40 }, (_, i) => { const a = i * 2.3999; return { position: [Math.sin(a) * .165, .14 - (i % 5) * .045, .04 + Math.cos(a) * .13], scale: [.027, .075, .025], rotation: [.1, 0, .13 * Math.sin(a)] }; }).filter(x => x.position[2] > -.07 || x.position[1] > .08);
  kit.instances(head, hair, locks);
  const arms = [], legs = [];
  for (const side of [-1, 1]) {
    const arm = pivot(chest, `Arm${side}`, side * .28, .57, 0);
    kit.oval(arm, skin, [side * .025, -.15, 0], [.095, .21, .092]);
    kit.oval(arm, skin, [side * .035, -.38, -.025], [.073, .17, .066]);
    kit.oval(arm, skin, [side * .035, -.53, -.025], [.055, .075, .044]);
    kit.bake(arm); arms.push(arm);
    for (const front of [-1, 1]) {
      const leg = pivot(body, `HorseLeg:${side}:${front}`, side * .27, 1.15, front < 0 ? -.45 : .72);
      const knee = pivot(leg, 'Knee', 0, -.47, 0), foot = pivot(knee, 'HoofJoint', 0, -.44, 0);
      kit.oval(leg, hide, [0, -.19, 0], [.12, .30, .14]); kit.oval(knee, hide, [0, -.19, 0], [.072, .24, .075]);
      kit.oval(foot, hoof, [0, -.10, -.025], [.095, .095, .13]); kit.bake(leg); kit.bake(knee); kit.bake(foot); legs.push({ leg, knee, foot, front, side });
    }
  }
  const tail = pivot(body, 'Tail', 0, 1.34, .96);
  for (let i = 0; i < 14; i++) kit.tube(tail, hair, [[(i % 3 - 1) * .016, 0, 0], [.05 * Math.sin(i), -.35, .16], [.07 * Math.sin(i + 1), -.72, .13]], .011);
  kit.bake(body); kit.bake(chest); kit.bake(head); kit.bake(tail);
  let time = 0, phase = 0, gait = 0, disposed = false;
  const update = (dt, state = {}) => {
    if (disposed) return; dt = Math.max(0, Math.min(.1, dt)); time += dt;
    const speed = Math.max(0, state.speed ?? 0); phase += speed * dt / 1.5 * Math.PI * 2; gait = THREE.MathUtils.damp(gait, Math.min(1, speed), 8, dt);
    body.position.y = Math.abs(Math.sin(phase * 2)) * .025 * gait;
    for (const limb of legs) { const p = phase + (limb.side === limb.front ? 0 : Math.PI); limb.leg.rotation.x = Math.sin(p) * .28 * gait; limb.knee.rotation.x = Math.max(0, -Math.sin(p)) * .40 * gait; limb.foot.rotation.x = -(limb.leg.rotation.x + limb.knee.rotation.x); }
    for (let i = 0; i < arms.length; i++) arms[i].rotation.x = Math.sin(phase + i * Math.PI) * .14 * gait;
    chest.rotation.z = Math.sin(phase) * .02 * gait; chest.scale.y = 1 + Math.sin(time * 1.6) * .003;
    head.rotation.y = Math.sin(time * .36) * .07; tail.rotation.z = Math.sin(time * 1.4) * .12;
  };
  return { root, name: '费伦泽', forward: 'negative-z', update, animate: update, dispose() { if (disposed) return; disposed = true; root.removeFromParent(); kit.dispose(); root.clear(); } };
}
