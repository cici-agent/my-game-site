import * as THREE from 'three';

// Physical scale is in metres. These details sit outside the existing navigation
// footprint; they never silently introduce a new obstacle into authored quests.
function surface(a, kind, color, repeat = [1, 1]) {
  const m = a.material(color); m.userData.environmentSurface = { kind, repeat };
  return m;
}
function arch(a, x, y, z, rx, ry, stone, iron) {
  const segments = 20;
  for (let i = 0; i < segments; i++) {
    const angle = (i + .5) / segments * Math.PI;
    const width = Math.hypot(rx * Math.sin(angle), ry * Math.cos(angle)) * Math.PI / segments - .012;
    const block = a.box(width, .20, .32, stone, x + Math.cos(angle) * rx, y + Math.sin(angle) * ry, z, .015);
    block.rotation.z = Math.atan2(ry * Math.cos(angle), -rx * Math.sin(angle));
  }
  for (const side of [-1, 1]) {
    a.box(.14, .19, .41, iron, x + side * rx, y, z + .04, .012);
    for (const dz of [-.11, .11]) a.sphere(.018, iron, x + side * rx, y + .04, z + dz);
  }
  a.box(.28, .32, .40, stone, x, y + ry + .015, z + .02, .025);
}
function tiledFloor(a, width, depth, centerZ, palette) {
  const sizeX = 1.18, sizeZ = .88, cols = Math.floor(width / sizeX), rows = Math.floor(depth / sizeZ);
  const mats = palette.map(c => surface(a, 'floor', c, [.59, .44]));
  for (let row = 0; row < rows; row++) for (let col = 0; col < cols; col++) {
    const x = (col - (cols - 1) / 2) * sizeX, z = centerZ + (row - (rows - 1) / 2) * sizeZ;
    // A shallow rounded edge catches grazing light without lifting the walking
    // plane appreciably or changing the character's foot placement.
    const tile = a.box(sizeX - .014, .025, sizeZ - .014, mats[(col * 7 + row * 3) % mats.length], x, -.0025, z, .010);
    tile.castShadow = false;
  }
}
function markLegacySurfaces(group, sceneId, hideFloor) {
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), rotation = new THREE.Quaternion();
  group.traverse(object => {
    if (!object.isInstancedMesh || !object.material?.isMeshStandardMaterial) return;
    object.getMatrixAt(0, matrix); matrix.decompose(position, rotation, scale);
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(rotation);
    if (object.geometry.type === 'PlaneGeometry' && object.material.map && !object.material.transparent) {
      if (Math.abs(normal.y) > .95 && scale.x > 6 && scale.y > 8 && position.y < .05) {
        if (hideFloor) object.visible = false;
        else object.userData.environmentSurface = { kind: 'floor', repeat: [scale.x / 2, scale.y / 2] };
      } else if (Math.abs(normal.y) < .1 && scale.x > 8 && scale.y > 4) {
        object.userData.environmentSurface = { kind: sceneId === 'SC01' ? 'brick' : 'stone', repeat: [scale.x / 2, scale.y / 2] };
      }
    }
    const color = object.material.color.getHexString();
    if (!object.material.map && ['70482e', '926444', '534333', '755b43', '8a553d', '73452e', '785138', '83583d'].includes(color)) {
      object.userData.environmentSurface = { kind: 'wood', repeat: [2, 2], keepTint: true };
    }
  });
}

function refineCoach(a, group) {
  group.traverse(object => {
    if (object.isInstancedMesh && ['843e37', '96473d'].includes(object.material?.color?.getHexString())) object.visible = false;
  });
  const upholstery = a.surface('cloth', '#824d45'), seam = a.material(0xbaa18a), bronze = a.material(0xbda16c, .58);
  const wood = surface(a, 'wood', 0x9a7454, [.5, 1.2]);
  const glass = a.material(0xb3c8bc); glass.transparent = true; glass.opacity = .11; glass.depthWrite = false; glass.roughness = .18;
  for (const side of [-1, 1]) for (let z = -12.6; z < 13; z += 3.25) {
    const x = side * 2.03;
    a.box(1.47, .33, 1.06, upholstery, x, .705, z + .58, .11);
    const back = a.box(1.47, .88, .235, upholstery, x, 1.06, z + .07, .095); back.rotation.x = -.08;
    for (const dx of [-.68, .68]) {
      a.box(.017, .63, .025, seam, x + dx, 1.09, z + .20, .007);
      a.box(.12, .11, .88, wood, x + dx, .98, z + .55, .045);
      a.box(.085, .20, .10, bronze, x + dx, .84, z + .83, .018);
    }
    for (const yy of [.72, 1.43]) a.box(1.32, .014, .020, seam, x, yy, z + .20, .007);
    a.box(1.30, .016, .020, seam, x, .82, z + 1.09, .007);
    for (const dx of [-.42, 0, .42]) for (const yy of [1.0, 1.27]) a.sphere(.020, seam, x + dx, yy, z + .198);
    for (const yy of [.22, .95]) a.box(.055, .055, 2.91, wood, side * 2.956, yy, z + 1.52, .010);
    for (const dz of [.20, 1.13, 2.06, 2.95]) a.box(.055, .73, .045, wood, side * 2.956, .59, z + dz, .009);
    const pane = a.box(.016, 1.04, 2.94, glass, side * 3.025, 2.16, z + 1.52, .003); pane.castShadow = false;
    for (const yy of [1.62, 2.70]) a.box(.065, .056, 3.02, bronze, side * 2.96, yy, z + 1.52, .010);
    for (const dz of [.07, 2.99]) a.box(.065, 1.10, .048, bronze, side * 2.96, 2.16, z + dz, .008);
    for (const dz of [.15, 2.91]) a.sphere(.024, bronze, side * 2.92, 2.65, z + dz);
    for (const dx of [-.60, -.3, 0, .3, .60]) a.box(.023, .025, 1.01, bronze, x + dx, 2.80, z + .55, .006);
    if (Math.round((z + 12.6) / 3.25) % 2 === 0) {
      a.box(.75, .36, .48, a.surface('leather', '#80634a'), x, 3.04, z + .50, .047);
      for (const dx of [-.25, .25]) a.box(.045, .37, .49, bronze, x + dx, 3.04, z + .5, .008);
      a.torus(.06, .012, bronze, x, 3.03, z + .75);
    }
  }
  for (let z = -10; z < 12; z += 1.5) a.box(2.30, .022, 1.47, a.material(0xd5c6a9), 0, 3.67, z, .010);
}

export function refineArchitecture(a, group, sceneId) {
  const station = sceneId === 'SC01', hall = ['SC00', 'SC04'].includes(sceneId);
  markLegacySurfaces(group, sceneId, station || hall);
  if (sceneId === 'SC02') { refineCoach(a, group); return; }
  if (!station && !hall) return;
  const limestone = surface(a, 'stone', 0xc8bfa9, [.45, .3]);
  const darkerStone = surface(a, 'stone', 0xb0a894, [.45, .3]);
  const mortar = a.material(0x776f60), metal = a.material(0x34473f, .55), bronze = a.material(0xb49a69, .65);
  const wood = surface(a, 'wood', 0x8e785c, [.4, 1]);
  tiledFloor(a, station ? 18.8 : 17.6, station ? 32.5 : 26.4, station ? .3 : 1.25,
    station ? [0xc7c4b6, 0xbebaae, 0xcac5b8, 0xc2bfb2] : [0xbbb8aa, 0xc6c0af, 0xbdb9a7, 0xc9c2b2]);
  const sideX = station ? 9.30 : 8.24, frontZ = station ? -11.22 : -11.76;
  // Separate stone plinth courses and recessed joints give the broad wall faces
  // a physical edge and a quiet dirt line, instead of a single smooth block.
  for (const side of [-1, 1]) {
    for (let row = 0; row < 3; row++) for (let col = 0; col < 24; col++) {
      const z = frontZ + .55 + col * 1.08 + (row % 2 ? .3 : 0);
      a.box(.21, .29, 1.065, row % 2 ? limestone : darkerStone, side * sideX, .17 + row * .305, z, .016);
    }
    a.box(.23, .045, 26.2, mortar, side * sideX, .035, 1.15, .008);
    a.box(.29, .075, 26.3, limestone, side * sideX, .98, 1.15, .014);
  }
  for (let col = -8; col <= 8; col++) for (let row = 0; row < 2; row++) {
    const x = col * 1.05;
    if (Math.abs(x) < 1.5) continue;
    a.box(1.035, .30, .22, row ? limestone : darkerStone, x, .19 + row * .315, frontZ, .016);
  }
  if (station) {
    for (const side of [-1, 1]) for (let z = -12; z < 15; z += 4) {
      const x = side * 9.25;
      a.box(.39, .18, .55, darkerStone, x, .10, z, .025);
      for (let row = 0; row < 9; row++) a.box(.27, .60, .31, limestone, x, .48 + row * .615, z, .018);
      for (const y of [1.6, 4.75, 5.65]) {
        a.box(.32, .12, .37, metal, x, y, z, .014);
        for (const dz of [-.11, .11]) a.sphere(.022, bronze, x - side * .17, y, z + dz);
      }
      a.box(.51, .18, .64, limestone, x, 5.9, z, .025);
      const brace = a.box(.14, .8, .12, metal, x - side * .25, 6.16, z, .014); brace.rotation.z = side * -.45;
    }
    for (const x of [-3.7, 3.7]) {
      arch(a, x, 4.43, -10.79, 2.0, 1.12, limestone, metal);
      for (const side of [-1, 1]) {
        a.box(.19, 4.42, .25, limestone, x + side * 2, 2.22, -10.85, .022);
        a.box(.07, 4.1, .09, metal, x + side * 1.76, 2.23, -10.76, .009);
      }
      a.box(4.2, .16, .46, limestone, x, .15, -10.82, .025);
      for (const yy of [.62, 2.24, 3.83]) for (const xx of [-1.36, 0, 1.36]) a.sphere(.025, bronze, x + xx, yy, -10.83);
    }
    arch(a, 0, 3.45, -10.56, 1.34, 1.55, limestone, metal);
  } else {
    // Recessed panel rails, capitals and tenons at human eye height make the
    // hall's large structure readable from the normal chase camera as well.
    for (const side of [-1, 1]) for (let z = -11.4; z < 14.4; z += 4.2) {
      const x = side * 8.20;
      a.box(.70, .23, .74, darkerStone, x, .13, z, .035);
      for (let row = 0; row < 10; row++) a.box(.48, .64, .44, limestone, x, .59 + row * .655, z, .024);
      for (const [yy, w, d] of [[.35, .60, .62], [5.9, .59, .58], [6.65, .75, .76]]) a.box(w, .13, d, limestone, x, yy, z, .022);
      for (const yy of [.78, 1.43]) a.box(.18, .055, 3.65, wood, x - side * .11, yy, z + 2.1, .009);
      for (const dz of [.55, 1.15, 1.75, 2.35, 2.95, 3.55]) a.box(.13, .65, .045, wood, x - side * .13, 1.1, z + dz, .008);
      a.box(.55, .19, .54, metal, x, 6.91, z, .012);
      for (const dz of [-.16, .16]) a.sphere(.03, bronze, x - side * .29, 6.91, z + dz);
    }
    for (let i = -3; i <= 3; i++) {
      const x = i * 8.5 * .245;
      a.box(1.73, .15, .35, limestone, x, 2.5, -11.68, .022);
      for (const side of [-1, 1]) a.box(.09, 2.8, .17, limestone, x + side * .72, 3.9, -11.69, .014);
      a.box(.045, 2.75, .1, metal, x, 3.9, -11.60, .006);
    }
  }
}
