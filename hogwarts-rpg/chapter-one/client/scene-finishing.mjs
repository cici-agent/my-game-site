import * as THREE from 'three';

// Location-specific finishing at human scale. Every standing detail is inside
// an existing furniture footprint or beyond the authored walking boundary.
const SCHOOL_ROOMS = new Set(['SC05', 'SC06', 'SC07', 'SC13', 'SC14', 'SC15']);
const stoneSurface = (a, color, repeat = [1, 1]) => {
  const m = a.material(color); m.userData.environmentSurface = { kind: 'stone', repeat }; return m;
};

function book(a, x, y, z, width = .28, color = 0x6b4d40) {
  const leather = a.material(color), paper = a.material(0xcfc5a7), gold = a.material(0xb49a62, .5);
  a.box(width, .055, .34, paper, x, y, z, .008);
  for (const dy of [-.034, .034]) a.box(width + .025, .014, .37, leather, x, y + dy, z, .006);
  a.box(.022, .08, .37, leather, x - width / 2, y, z, .007);
  for (const dz of [-.12, .12]) a.box(.025, .083, .013, gold, x - width / 2, y, z + dz, .003);
}

function schoolJoinery(a, sceneId) {
  const stone = stoneSurface(a, 0xbcb6a4, [.35, .45]);
  const worn = stoneSurface(a, 0xa9a590, [.4, .35]);
  const wood = a.surface('wood', '#765c43'), metal = a.material(0x536057, .48), brass = a.material(0xb49a62, .5);
  for (const side of [-1, 1]) {
    // Wall skirtings and framing remain behind the room's navigation bounds.
    for (let i = 0; i < 21; i++) a.box(.18, .30, 1.12, i % 3 ? stone : worn, side * 7.04, .17, -9.7 + i * 1.15, .016);
    for (const y of [.36, 1.60]) a.box(.10, .06, 24.5, wood, side * 7.02, y, 2.0, .012);
    for (let z = -9.7; z < 14; z += 4.2) {
      a.box(.44, .13, .47, stone, side * 7.04, .10, z, .025);
      a.box(.43, .15, .47, stone, side * 7.04, 4.70, z, .024);
      for (const yy of [.72, 1.33, 2.0, 2.7, 3.4, 4.1]) a.box(.025, .014, .35, worn, side * 6.995, yy, z, .003);
      for (const dz of [1.0, 2.0, 3.0]) a.box(.07, 1.12, .055, wood, side * 7.03, .98, z + dz, .008);
    }
  }
  // Recessed front window jambs and small mullions catch light in the distance.
  for (const x of [-5.3655, -3.577, 3.577, 5.3655]) {
    a.box(1.40, .12, .26, stone, x, 2.47, -10.19, .020);
    for (const side of [-1, 1]) a.box(.075, 2.55, .17, stone, x + side * .59, 3.78, -10.19, .012);
    a.box(.035, 2.50, .075, metal, x, 3.78, -10.12, .005);
    a.box(1.17, .035, .075, metal, x, 3.45, -10.12, .005);
  }
  for (const side of [-1, 1]) {
    a.box(.18, 2.92, .30, worn, side * 1.36, 1.48, -10.16, .025);
    for (const y of [.15, 2.92]) a.box(.29, .16, .36, stone, side * 1.36, y, -10.13, .022);
  }
  // Iron collars make the repeated roof trusses read as joined construction.
  for (const z of [-10.05, -5.95, -1.85, 2.25, 6.35, 10.45]) {
    for (const x of [-4.5, 0, 4.5]) {
      a.box(.10, .15, .18, metal, x, 5.61, z, .012);
      a.sphere(.025, brass, x, 5.59, z + .10);
    }
  }
}

function classroomDetails(a) {
  const brass = a.material(0xb49a62, .5), ink = a.material(0x243b43), parchment = a.material(0xded2af);
  for (const x of [-4.5, 4.5]) for (const z of [-5.8, -1.6, 2.6, 6.8]) {
    book(a, x + .72, 1.04, z - .14, .26, x < 0 ? 0x694846 : 0x49605d);
    a.cyl(.052, .09, ink, x - .72, 1.07, z, .038, 16);
    a.torus(.052, .007, brass, x - .72, 1.10, z, Math.PI / 2);
    const quill = a.box(.023, .25, .009, parchment, x - .70, 1.24, z, .003); quill.rotation.z = -.32;
    a.box(.45, .009, .012, brass, x, .979, z + .235, .003);
    for (let line = 0; line < 4; line++) a.box(.25 - line * .025, .002, .008, ink, x - .25, .975, z - .075 + line * .045, .001);
  }
}

function courtyardDetails(a, group) {
  group.traverse(object => {
    // The shared room builder has one opaque overhead roof material. Retain
    // its arches and trusses while opening this particular courtyard to sky.
    if (object.isInstancedMesh && object.material?.color?.getHexString() === '435150') object.visible = false;
  });
  let scene = group; while (scene.parent && !scene.isScene) scene = scene.parent;
  if (scene.isScene) { scene.background?.set?.(0xa3b5b6); scene.fog?.color.set(0xa3b5b6); }
  const stem = a.material(0x5d6548), leaves = [a.material(0x647856), a.material(0x72845b)];
  for (const side of [-1, 1]) for (const z of [-7.5, -.6, 6.4]) {
    const vine = a.cyl(.018, 1.70, stem, side * 6.92, 2.25, z, .009, 8); vine.rotation.x = .19;
    for (let i = 0; i < 12; i++) {
      const leaf = a.sphere(1, leaves[i % 2], side * 6.89, 1.55 + i * .125, z + (i % 2 ? -.13 : .13) - i * .024, 8, 4);
      leaf.scale.set(.013, .078, .12); leaf.rotation.x = (i % 2 ? -1 : 1) * .55;
    }
  }
}

function libraryDetails(a) {
  const wood = a.surface('wood', '#765c43'), brass = a.material(0xb49a62, .5), paper = a.material(0xded2af);
  for (const side of [-1, 1]) for (const z of [-6, -1.3, 3.4, 8.1]) {
    const x = side * 5.8;
    for (const y of [.15, 4.36]) a.box(1.08, .06, 4.28, wood, x, y, z, .014);
    for (let shelf = 0; shelf < 5; shelf++) {
      const y = .18 + shelf * .79;
      a.box(.032, .025, 4.05, brass, x - side * .544, y + .015, z, .005);
      a.box(.026, .10, .30, brass, x - side * .55, y - .02, z, .007);
      a.box(.028, .06, .24, paper, x - side * .567, y - .02, z, .003);
    }
    for (const dz of [-1.96, 1.96]) for (const yy of [.25, 1.4, 2.55, 3.7]) a.sphere(.022, brass, x - side * .52, yy, z + dz);
  }
  book(a, 4.28, 1.04, -3.58, .28, 0x4b625a); book(a, 4.26, 1.12, -3.58, .26, 0x815845);
}

function hospitalDetails(a) {
  const brass = a.material(0xb49a62, .5), ivory = a.material(0xd7d5bf), linen = a.surface('cloth', '#c2cabd');
  for (const x of [-4.4, 4.4]) for (const z of [-6.5, 1.25, 6.7]) {
    for (const dz of [-.95, .95]) {
      for (const dx of [-.49, .49]) { a.cyl(.042, .95, brass, x + dx, .75, z + dz); a.sphere(.065, brass, x + dx, 1.24, z + dz); }
      for (const y of [.70, 1.12]) a.box(.95, .035, .035, brass, x, y, z + dz, .012);
      for (const dx of [-.3, -.1, .1, .3]) a.cyl(.012, .41, ivory, x + dx, .91, z + dz, .012, 8);
    }
    for (const dx of [-.43, .43]) a.box(.015, .012, 1.12, linen, x + dx, .895, z + .23, .004);
    for (const dz of [-.17, .61]) a.box(.92, .009, .012, ivory, x, .898, z + dz, .003);
  }
}

function basinGeometry() {
  // One continuous glazed shell, including the inner bowl. The rim and the
  // lower drain are genuinely at different heights, not a dark decal on a ball.
  const profile = [[.16, -.17], [.29, -.14], [.42, -.06], [.47, .05], [.47, .085], [.44, .11], [.405, .065], [.34, -.025], [.20, -.09], [0, -.10]];
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), 32);
}

function washroomDetails(a, group) {
  const brass = a.material(0xada36d, .66), porcelain = a.material(0xd9ded2), joint = a.material(0x687973), dark = a.material(0x43554e);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3();
  group.traverse(object => {
    if (!object.isInstancedMesh || object.geometry.type !== 'SphereGeometry') return;
    for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix); position.setFromMatrixPosition(matrix);
      if (Math.abs(Math.abs(position.x) - 5.62) < .001 && Math.abs(position.y - .91) < .001 && [-6, -1.2, 4.9].some(z => Math.abs(position.z - z) < .001)) {
        object.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); object.instanceMatrix.needsUpdate = true;
      }
    }
  });
  const bowlGeometry = basinGeometry();
  for (const side of [-1, 1]) for (const z of [-6, -1.2, 4.9]) {
    const x = side * 6.25, inside = x - side * .63;
    const bowl = a.custom(bowlGeometry, porcelain, inside, .94, z); bowl.scale.z = 1.23;
    a.cyl(.026, .30, brass, x - side * .31, 1.10, z, .026, 12);
    const spout = a.cyl(.025, .24, brass, x - side * .43, 1.24, z, .025, 12); spout.rotation.z = Math.PI / 2;
    a.cyl(.032, .08, brass, inside, 1.20, z, .032, 12);
    for (const dz of [-.19, .19]) {
      a.cyl(.025, .10, brass, x - side * .31, 1.03, z + dz, .025, 12);
      a.box(.11, .022, .025, porcelain, x - side * .31, 1.09, z + dz, .008);
    }
    // Mirror frame and tiled splashback stay in the original basin footprint.
    for (const dz of [-.56, .56]) a.box(.06, 1.46, .045, brass, x - side * .33, 1.88, z + dz, .012);
    for (const y of [1.16, 2.61]) a.box(.06, .045, 1.16, brass, x - side * .33, y, z, .012);
    for (let line = 0; line < 4; line++) a.box(.014, .012, 2.25, joint, x - side * .14, .47 + line * .33, z, .002);
    a.cyl(.050, .012, dark, inside, .846, z, .050, 16);
  }
}

function cabinDetails(a, group) {
  const matteWood = (color, repeat = [1, 1]) => {
    const material = a.surface('wood', color);
    delete material.userData.environmentSurface;
    material.roughness = .96; material.bumpScale = .0018;
    material.map.repeat.fromArray(repeat); material.bumpMap.repeat.fromArray(repeat);
    return material;
  };
  const wood = matteWood('#88725b', [1, 2.5]), darkWood = matteWood('#514435', [2, 1]), floor = matteWood('#78654f', [5, 8]);
  const hearth = stoneSurface(a, 0x92917d, [.7, .7]), iron = a.material(0x353c37, .5), ceramic = a.material(0xa68b68), charcoal = a.material(0x413b30);
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3();
  group.traverse(object => {
    if (!object.isMesh) return;
    const descriptor = object.userData.environmentSurface;
    if (descriptor?.kind === 'floor') { object.material = floor; delete object.userData.environmentSurface; }
    if (object.isInstancedMesh) for (let i = 0; i < object.count; i++) {
      object.getMatrixAt(i, matrix); matrix.decompose(position, rotation, scale);
      // Replace the inherited two blank puzzle boards, but retain their narrow
      // collision footprint and put an actual kitchen shelf on that footprint.
      if (Math.abs(position.z + 4.4) < .05 && position.x > .3 && position.x < 1.8) {
        object.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); object.instanceMatrix.needsUpdate = true;
      }
    }
    if (!object.isInstancedMesh && object.geometry.type === 'SphereGeometry' && object.position.distanceTo(new THREE.Vector3(3.8, 1.24, -2.5)) < .001) object.visible = false;
  });
  // Warm timber skin overlays the generic stone room, without shortening paths.
  for (const side of [-1, 1]) for (let i = 0; i < 43; i++) a.box(.10, 4.32, .54, i % 3 ? wood : darkWood, side * 7.04, 2.16, -10 + i * .57, .015);
  for (const side of [-1, 1]) for (let i = 0; i < 10; i++) a.box(.54, 4.32, .10, i % 3 ? wood : darkWood, side * (1.62 + i * .57), 2.16, -10.17, .015);
  for (const side of [-1, 1]) for (const y of [.15, 1.36, 4.24]) a.box(.15, .11, 24.7, darkWood, side * 6.96, y, 2, .022);
  a.box(14.3, .12, 24.8, darkWood, 0, 4.42, 2, .015);
  for (const z of [-8, -2, 4, 10]) {
    a.box(14.0, .24, .23, wood, 0, 4.20, z, .025);
    for (const x of [-6.7, 0, 6.7]) a.box(.15, .27, .27, iron, x, 4.18, z, .014);
  }
  // A broad masonry hearth sits behind the authored side benches.
  for (const z of [-3.5, -1.1]) a.box(.70, 2.8, .42, hearth, -6.55, 1.4, z, .045);
  a.box(.76, .28, 2.8, hearth, -6.55, 2.76, -2.3, .045);
  a.box(.16, 2.5, 2.0, iron, -6.97, 1.25, -2.3, .015);
  a.box(.82, .09, 2.8, hearth, -6.55, .045, -2.3, .020);
  for (const z of [-2.9, -2.3, -1.7]) { const log = a.cyl(.10, .72, darkWood, -6.50, .20, z, .09, 12); log.rotation.z = Math.PI / 2; }
  const ember = a.material(0xb7733b); ember.emissive.set(0xbb4b13); ember.emissiveIntensity = .45;
  for (const z of [-2.8, -2.3, -1.8]) a.sphere(.075, ember, -6.14, .21, z, 12, 6);
  // Raised hearth hook and a stout kettle, visible above the bench line.
  a.box(.035, .035, 1.75, iron, -6.28, 1.30, -2.3, .008);
  a.torus(.19, .018, iron, -6.28, 1.03, -2.3, 0, Math.PI / 2);
  a.cyl(.22, .33, iron, -6.28, .72, -2.3, .19, 24);
  // A narrow crockery rack occupies the original notice-board collision volume.
  for (const x of [.46, 1.66]) {
    a.box(.11, 1.8, .16, darkWood, x, .9, -4.4, .020);
    a.box(.23, .14, .23, wood, x, .10, -4.4, .020);
  }
  for (const y of [.24, .74, 1.24, 1.74]) a.box(1.13, .055, .20, wood, 1.06, y, -4.4, .014);
  for (const x of [.72, 1.06, 1.40]) for (const y of [.82, 1.32]) {
    a.cyl(.065, .10, ceramic, x, y, -4.4, .071, 16); a.cyl(.052, .008, charcoal, x, y + .052, -4.4, .052, 16);
    a.torus(.033, .010, ceramic, x + .075, y + .005, -4.4);
  }
  // Real table supports and a pot with a rim, dark opening, handle and spout.
  for (const x of [2.95, 4.65]) for (const z of [-2.96, -2.04]) {
    a.box(.10, .75, .10, darkWood, x, .375, z, .020);
    a.box(.13, .07, .13, wood, x, .13, z, .012);
  }
  a.box(1.85, .12, .06, wood, 3.8, .68, -1.95, .018);
  const pot = a.sphere(.20, ceramic, 3.14, 1.13, -2.50, 24, 16); pot.scale.set(1, .83, 1);
  a.cyl(.11, .035, ceramic, 3.14, 1.30, -2.50, .12, 24); a.cyl(.09, .006, charcoal, 3.14, 1.321, -2.50, .09, 24);
  a.torus(.13, .027, ceramic, 3.38, 1.16, -2.50);
  const spout = a.cyl(.055, .27, ceramic, 2.94, 1.21, -2.50, .035, 16); spout.rotation.z = .72;
  book(a, 4.30, 1.02, -2.62, .32, 0x7c4b35);
}

export function refineLearningSpaces(a, group, sceneId) {
  if (SCHOOL_ROOMS.has(sceneId)) schoolJoinery(a, sceneId);
  if (sceneId === 'SC05') classroomDetails(a);
  if (sceneId === 'SC06') courtyardDetails(a, group);
  if (sceneId === 'SC07') libraryDetails(a);
  if (sceneId === 'SC10') cabinDetails(a, group);
  if (sceneId === 'SC13') washroomDetails(a, group);
  if (sceneId === 'SC15') hospitalDetails(a);
}

export function refineTowerWalk(a) {
  const stone = stoneSurface(a, 0xa5aa98, [.7, .45]), edge = stoneSurface(a, 0xc1c3af, [.7, .15]);
  // Complete parapets surround the existing rooftop, outside [-10,10] bounds.
  for (const side of [-1, 1]) for (let i = 0; i < 22; i++) {
    const z = -13.5 + i * 1.2;
    a.box(.38, 1.12, 1.18, stone, side * 10.65, .56, z, .025);
    a.box(.46, .13, 1.20, edge, side * 10.65, 1.18, z, .023);
    if (i % 2 === 0) a.box(.44, .52, .62, edge, side * 10.65, 1.49, z, .025);
  }
  for (const z of [-14.6, 12.6]) for (let i = -8; i <= 8; i++) {
    if (Math.abs(i) < 2) continue;
    a.box(1.18, 1.12, .38, stone, i * 1.2, .56, z, .025);
    a.box(1.20, .13, .46, edge, i * 1.2, 1.18, z, .023);
    if (i % 2 === 0) a.box(.62, .52, .44, edge, i * 1.2, 1.49, z, .025);
  }
  for (const x of [-10.65, 10.65]) for (const z of [-14.6, 12.6]) {
    a.cyl(.72, 2.2, stone, x, 1.1, z, .69, 24); a.cyl(.80, .16, edge, x, 2.23, z, .82, 24);
    for (let i = 0; i < 8; i++) { const angle = i * Math.PI / 4; a.box(.25, .40, .28, edge, x + Math.sin(angle) * .67, 2.50, z + Math.cos(angle) * .67, .025, angle); }
  }
}

export function refineFlyingField(a) {
  const chalk = a.material(0xc5c8a8), timber = a.surface('wood', '#75654a'), bronze = a.material(0xb39760, .45);
  // Flat practice markings, not collision objects. Leave the central route free.
  for (const x of [-8.6, 8.6]) a.box(.035, .004, 20, chalk, x, -.014, -1, .001);
  for (const z of [-11, 9]) a.box(17.2, .004, .035, chalk, 0, -.014, z, .001);
  a.torus(2.2, .018, chalk, 0, -.015, -1, Math.PI / 2);
  for (const x of [-7, 7]) for (let row = 0; row < 5; row++) {
    const z = 8 + row * .5, y = .2 + row * .35;
    a.box(3.12, .025, .025, timber, x, y + .15, z - .30, .006);
    for (const dx of [-1.45, 1.45]) a.box(.055, .30 + row * .35, .055, bronze, x + dx, (.30 + row * .35) / 2, z, .008);
  }
}

export function refineBattleLocation(a, sceneId, combat) {
  if (combat.kind !== 'troll') return;
  const bounds = combat.arena?.bounds ?? { minX: -14, maxX: 14, minZ: -14, maxZ: 14 };
  const glaze = [a.material(0xaeb9af), a.material(0xa6b2a9)]; glaze.forEach(m => { m.roughness = .90; });
  const chalk = a.material(0xc8cfc2), brass = a.material(0xaaa06c, .55), dark = a.material(0x4a5c55);
  // Ceramic floor seams are visual only and stay below the character's plane.
  let row = 0;
  for (let z = bounds.minZ + .7; z <= bounds.maxZ - .7; z += 1.4, row++) {
    let column = 0;
    for (let x = bounds.minX + .7; x <= bounds.maxX - .7; x += 1.4, column++) a.box(1.385, .008, 1.385, glaze[(row + column) % 2], x, -.008, z, .003);
  }
  const bowlGeometry = basinGeometry();
  for (const side of [-1, 1]) for (const z of [-6, 0, 6]) {
    const x = (side < 0 ? bounds.minX : bounds.maxX) + side * 1.1;
    a.cyl(.16, .80, chalk, x, .40, z, .19, 20);
    const bowl = a.custom(bowlGeometry, chalk, x, .94, z); bowl.scale.set(.96, 1, 1.09);
    a.cyl(.050, .012, dark, x, .846, z, .050, 16);
    a.cyl(.026, .32, brass, x + side * .31, 1.08, z, .026, 12);
    const spout = a.cyl(.026, .25, brass, x + side * .20, 1.23, z, .022, 12); spout.rotation.z = Math.PI / 2;
    for (const dz of [-.20, .20]) a.box(.10, .023, .025, brass, x + side * .28, 1.09, z + dz, .006);
  }
}
