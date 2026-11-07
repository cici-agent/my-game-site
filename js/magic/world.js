// 魔法学院星球的轻量程序化世界；车站和列车会由 main.js 加载的原创 Blender GLB 替换。
import * as THREE from 'three';
import { bridgeHeight, bridgeEnd, bridgeStart, gateHeight, landingHeight, pierHeight } from './lakeshore.js';
import { platformEdgeZ, platformHeight, stationFixtures } from './station-navigation.js';
import { buildRailway, inRailwayClearing, placeBogie, placeTrainPart, railOffset, trainStop, travelledDistance, vehicleOffsets } from './railway.js';

const firstCoachRearDoor = 14.7 + 4.7;

const M = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .72, ...options });
const stone = M(0x686579), darkStone = M(0x3f4053), roof = M(0x17233a, { roughness: .65 });
const gold = M(0xe7bd5b, { emissive: 0x7a4d12, emissiveIntensity: .35, metalness: .25 });

function add(parent, geometry, material, position = [0, 0, 0], rotation = null, scale = null) {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(...position);
  if (rotation) mesh.rotation.set(...rotation);
  if (scale) mesh.scale.set(...scale);
  mesh.castShadow = true; mesh.receiveShadow = true;
  parent.add(mesh);
  return mesh;
}

function seeded(seed = 19) {
  let x = seed >>> 0;
  return () => ((x = Math.imul(1664525, x) + 1013904223 >>> 0) / 4294967296);
}

function label(text, color = '#f3d889', width = 420) {
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'rgba(14,17,31,.88)'; ctx.beginPath(); ctx.roundRect(4, 4, width - 8, 88, 26); ctx.fill();
  ctx.strokeStyle = color; ctx.lineWidth = 4; ctx.stroke();
  ctx.fillStyle = '#fff9e8'; ctx.font = '700 34px "PingFang SC", sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, width / 2, 50);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(width / 32, 3, 1);
  return sprite;
}

function buildStation(scene) {
  const group = new THREE.Group(); scene.add(group);
  const brick = M(0x8b4f42), cream = M(0xd8c7a7), iron = M(0x252c38, { metalness: .55, roughness: .4 });
  const wood = M(0x63432d), stoneFloor = M(0x8d8272);
  const glass = M(0xb2d9e5, { transparent: true, opacity: .15, depthWrite: false, side: THREE.DoubleSide });
  const yellow = M(0xc6a353), lampGlass = M(0xffe7a0, { emissive: 0xffc34d, emissiveIntensity: 1.2 });
  const box = (width, height, depth, mat, x, y, z) => add(group, new THREE.BoxGeometry(width, height, depth), mat, [x, y, z]);
  box(104, .56, 36, stoneFloor, 0, -.28, 130);
  box(104, 10, .85, brick, 0, 5, 148);
  box(104, 14, .9, brick, 0, 7, 112);
  const farEdge = 83.75;
  [[platformEdgeZ, 112], [70.25, farEdge]].forEach(([min, max]) => {
    box(104, platformHeight, max - min, cream, 0, platformHeight / 2, (max + min) / 2);
  });
  [platformEdgeZ + .28, farEdge - .28].forEach(z => box(104, .012, .5, yellow, 0, platformHeight + .006, z));
  for (const x of [-52, 52]) {
    box(.6, 4.4, 36, brick, x, 2.2, 130);
    box(.4, 4.4, 36, glass, x, 6.6, 130);
    for (const [start, end] of [[platformEdgeZ, 112], [70.25, farEdge]]) {
      for (let z = start + .3; z < end; z += 2) box(.13, 1.4, .13, iron, x, platformHeight + .7, z);
      box(.25, .16, end - start, iron, x, platformHeight + 1.35, (end + start) / 2);
    }
  }
  for (let x = -48; x <= 48; x += 16) box(.85, 11.6, .5, cream, x, 5.8, 112.52);

  // The arched roof spans the tracks and both platforms; its axis follows the rails.
  const radius = 47, halfAngle = Math.asin(39 / radius);
  const roofCenterY = 8.8 - Math.sqrt(radius ** 2 - 39 ** 2);
  const arcPoint = angle => new THREE.Vector3(0, roofCenterY + radius * Math.cos(angle), 109 + radius * Math.sin(angle));
  const arc = Array.from({length: 25}, (_, i) => arcPoint(-halfAngle + i * halfAngle / 12));
  const rib = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 28, .13, 5, false);
  for (let x = -48; x <= 48; x += 8) add(group, rib, iron, [x, 0, 0]);
  const roofSkin = add(group, new THREE.CylinderGeometry(radius, radius, 100, 30, 1, true, -halfAngle, halfAngle * 2), glass, [0, roofCenterY, 109]);
  roofSkin.quaternion.setFromAxisAngle(new THREE.Vector3(1, 1, 1).normalize(), -2 * Math.PI / 3);
  roofSkin.castShadow = false;
  for (let i = 0; i <= 12; i++) {
    const {y, z} = arc[i * 2]; box(100, .11, .11, iron, 0, y, z);
  }

  const plaque = (text, x, y, z, width, facesHall) => {
    const sprite = label(text, '#d7b36c', 280);
    const panel = add(group, new THREE.PlaneGeometry(width, width * 96 / 280),
      new THREE.MeshBasicMaterial({ map: sprite.material.map, transparent: true }), [x, y, z]);
    sprite.material.dispose();
    if (!facesHall) panel.rotation.y = Math.PI;
  };
  plaque('国王十字车站', 18.5, 7.3, 147.45, 14, false);
  plaque('9', -8, 4.4, 112.55, 3.5, true);
  plaque('10', 8, 4.4, 112.55, 3.5, true);
  plaque('9¾', 0, 8, 111.4, 4, false);
  const warmA = new THREE.PointLight(0xffc77a, 24, 60, 1.6); warmA.position.set(-22, 12, 126); group.add(warmA);
  const warmB = new THREE.PointLight(0xffd69b, 22, 55, 1.6); warmB.position.set(22, 10, 101); group.add(warmB);

  for (const z of [trainStop.z, 85.8]) {
    box(104, .28, 3.3, darkStone, 0, .04, z);
    for (const offset of [-railOffset, railOffset]) box(104, .3, .15, iron, 0, .48, z + offset);
    const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(.28, .18, 2.6), wood, 85);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < ties.count; i++) ties.setMatrixAt(i, matrix.makeTranslation(-50.4 + 1.2 * i, .24, z));
    ties.receiveShadow = true; group.add(ties);
  }
  for (const {kind, x, z, width, depth, height} of stationFixtures) {
    const floor = z < 112 ? platformHeight : 0;
    if (kind === 'column' || kind === 'lamp') {
      add(group, new THREE.CylinderGeometry(width * .22, width * .25, height, 12), iron, [x, floor + height / 2, z]);
      add(group, new THREE.CylinderGeometry(width / 2, width / 2, .42, 12), iron, [x, floor + .21, z]);
      if (kind === 'lamp') add(group, new THREE.SphereGeometry(.4, 10, 8), lampGlass, [x, floor + height, z]);
    } else if (kind === 'bench') {
      box(width, .18, depth, wood, x, floor + .85, z);
      box(width, height - .85, .12, wood, x, floor + (height + .85) / 2, z - depth / 2 + .06);
      for (const side of [-1, 1]) box(.14, .8, depth * .8, iron, x + side * width * .38, floor + .4, z);
    } else if (kind === 'rack') {
      for (const side of [-1, 1]) box(.1, height, .12, iron, x + side * (width / 2 - .1), floor + height / 2, z);
      for (const y of [.7, 1.5, height - .05]) box(width, .09, depth, wood, x, floor + y, z);
    } else if (kind === 'trolley') {
      box(width, .14, depth, iron, x, floor + .5, z);
      box(.1, height - .5, depth * .75, iron, x - width / 2 + .08, floor + (height + .5) / 2, z);
      box(width * .68, 1.12, depth * .7, wood, x + .1, floor + 1.1, z);
      for (const dx of [-.37, .37]) {
        for (const dz of [-.32, .32]) add(group, new THREE.CylinderGeometry(.21, .21, .12, 8), iron,
          [x + dx * width, floor + .23, z + dz * depth], [0, 0, Math.PI / 2]);
      }
    } else if (kind === 'trunk') {
      box(width, height, depth, wood, x, floor + height / 2, z);
    }
  }
  return group;
}

function wheel(parent, x, z, radius = .65) {
  const rotor = new THREE.Group();
  rotor.name = 'WHL_Rotor_Fallback'; rotor.position.set(x, radius + .12, z); parent.add(rotor);
  add(rotor, new THREE.CylinderGeometry(radius, radius, .24, 20), darkStone, [0,0,0], [0, 0, Math.PI / 2]);
  const spoke = new THREE.BoxGeometry(.06, radius * 1.7, .07);
  for (const angle of [0, Math.PI / 3, -Math.PI / 3]) {
    add(rotor, spoke, stone, [Math.sign(x) * .13,0,0], [angle,0,0]);
  }
}

function buildTrain(scene) {
  const train = new THREE.Group(); scene.add(train);
  const fallback = new THREE.Group(); fallback.name = 'Train_Procedural_Fallback'; scene.add(fallback);
  const red = M(0x7d1f2c), red2 = M(0x4d1620), black = M(0x15171c, { metalness: .35 }), glass = M(0x9ed2e3, { emissive: 0x234c62, emissiveIntensity: .25 });
  const engine = new THREE.Group(); engine.name = 'VEH_Engine'; fallback.add(engine);
  add(engine, new THREE.CylinderGeometry(1.7, 1.7, 6.8, 20), red, [0, 2.25, 0], [Math.PI / 2, 0, 0]);
  add(engine, new THREE.BoxGeometry(3.3, 3.8, 2.9), red2, [0, 2.2, -3.8]);
  add(engine, new THREE.BoxGeometry(3.5, .3, 10.4), black, [0, .95, -.35]);
  add(engine, new THREE.CylinderGeometry(.55, .82, 2.2, 16), black, [0, 4.3, 1.2]);
  add(engine, new THREE.CylinderGeometry(.55, .55, .45, 16), gold, [0, 2.35, 3.5], [Math.PI / 2, 0, 0]);
  [-1, 1].forEach(x => [-2.05, 0, 2.15, 4.25].forEach(z => wheel(engine, x * railOffset, z, z > 3 ? .52 : .84)));
  const lamp = add(engine, new THREE.SphereGeometry(.35, 12, 8), M(0xfff3b0, { emissive: 0xffd35c, emissiveIntensity: 1.6 }), [0, 2.8, 3.55]);
  lamp.castShadow = false;

  const tender = new THREE.Group(); tender.name = 'VEH_Tender'; fallback.add(tender);
  add(tender, new THREE.BoxGeometry(3, 2.4, 3.7), red2, [0, 1.94, -.8]);
  [-1, 1].forEach(x => [-1.3, 1.4].forEach(z => wheel(tender, x * railOffset, z, .52)));
  for (let i = 1; i <= 3; i++) {
    const car = new THREE.Group(); car.name = 'VEH_Coach_' + i; fallback.add(car);
    add(car, new THREE.BoxGeometry(3.12, 3.12, 10.2), red, [0, 2.55, 0]);
    add(car, new THREE.BoxGeometry(3.36, .5, 10.45), black, [0, 4.2, 0]);
    for (const side of [-1, 1]) {
      for (const z of [-3.85, -2.3, -.75, .8, 2.35, 3.9]) {
        add(car, new THREE.BoxGeometry(.08, 1.2, 1.14), glass, [side * 1.58, 2.95, z]);
      }
      for (const z of [-4.7, 4.7]) add(car, new THREE.BoxGeometry(.08, 2.9, .54), red2, [side * 1.58, 2.55, z]);
    }
    for (const [index, z] of [3.25, -3.25].entries()) {
      const bogie = new THREE.Group(); bogie.name = 'BOG_Coach_' + i + '_' + (index + 1);
      bogie.position.z = z; car.add(bogie);
      for (const side of [-1,1]) {
        for (const axle of [-.5,.5]) wheel(bogie, side * railOffset, axle, .49);
      }
    }
  }

  const smoke = [];
  for (let i = 0; i < 9; i++) {
    const puff = add(train, new THREE.SphereGeometry(.45 + i * .04, 10, 8), M(0xe8edf2, { transparent: true, opacity: .42, depthWrite: false }), [0, 5, 3.5]);
    puff.castShadow = false; puff.userData.phase = i / 9; smoke.push(puff);
  }
  let vehicles = [], wheels = [], progress = 0;
  function register(root) {
    vehicles = Object.entries(vehicleOffsets).map(([name, offset]) => {
      const object = root.getObjectByName(name);
      const coach = name.startsWith('VEH_Coach_');
      const bogies = coach ? [1,2].map(i => object.getObjectByName(name.replace('VEH_', 'BOG_') + '_' + i)) : [];
      const engine = name === 'VEH_Engine';
      const halfWheelbase = coach ? 3.25 : (engine ? 3.15 : 1.35);
      return { object, offset, halfWheelbase, axleMidpoint: engine ? 1.1 : 0, bogies };
    });
    wheels = [];
    root.traverse(object => {
      if (object.name.startsWith('WHL_Rotor_')) wheels.push({ object, radius: object.position.y - .12 });
    });
  }
  function setProgress(value) {
    progress = THREE.MathUtils.clamp(value, 0, 1);
    for (const {object, offset, halfWheelbase, axleMidpoint, bogies} of vehicles) {
      placeTrainPart(object, progress, offset, halfWheelbase, axleMidpoint);
      bogies.forEach((bogie,i) => {
        if (bogie) placeBogie(bogie, progress, offset + (i === 0 ? -3.25 : 3.25), object);
      });
    }
    const distance = travelledDistance(progress);
    for (const {object,radius} of wheels) object.rotation.x = distance / radius;
    placeTrainPart(train, progress, 0, 3.15, 1.1);
  }
  function attachAsset(root) {
    // Some clients can still have the previous single-piece GLB cached.
    if (!Object.keys(vehicleOffsets).every(name => root.getObjectByName(name))) return false;
    scene.add(root); register(root); fallback.visible = false; setProgress(progress);
    return true;
  }
  register(fallback);
  setProgress(0);
  return { group: train, fallback, smoke, setProgress, attachAsset };
}

function tower(parent, x, z, h, radius, sides = 10) {
  const g = new THREE.Group(); g.position.set(x, 0, z); parent.add(g);
  add(g, new THREE.CylinderGeometry(radius * .92, radius, h, sides), stone, [0, h / 2, 0]);
  add(g, new THREE.ConeGeometry(radius * 1.28, radius * 2.2, sides), roof, [0, h + radius * 1.1, 0]);
  for (let y = 4; y < h - 2; y += 4.2) {
    [0, Math.PI / 2, Math.PI, -Math.PI / 2].forEach(a => {
      const win = add(g, new THREE.PlaneGeometry(.45, 1.15), M(0xffdc83, { emissive: 0xffad33, emissiveIntensity: .9 }), [Math.sin(a) * (radius + .02), y, Math.cos(a) * (radius + .02)]);
      win.rotation.y = a; win.castShadow = false;
    });
  }
  return g;
}

function buildCastle(scene) {
  const castle = new THREE.Group(); castle.position.set(-42, 2, -145); scene.add(castle);
  // 岩壁与城堡地基
  add(castle, new THREE.CylinderGeometry(34, 40, 12, 14), M(0x454653), [0, 4, -8], null, [1, 1, .48]);
  add(castle, new THREE.BoxGeometry(34, 16, 23), stone, [0, 18, 0]);
  add(castle, new THREE.BoxGeometry(25, 11, 31), darkStone, [12, 15, -13]);
  add(castle, new THREE.BoxGeometry(42, 2, 27), roof, [0, 27, 0]);
  tower(castle, -18, 8, 31, 4.2); tower(castle, 18, 8, 34, 4.5); tower(castle, -15, -15, 28, 3.8); tower(castle, 22, -20, 39, 5.2);
  tower(castle, 4, -20, 46, 5.8, 12);

  // 大礼堂高窗
  for (let x = -12; x <= 12; x += 4) {
    const w = add(castle, new THREE.PlaneGeometry(1.1, 4.5), M(0xffd97a, { emissive: 0xff9d2e, emissiveIntensity: 1.1 }), [x, 19, 11.53]);
    w.castShadow = false;
  }
  add(castle, new THREE.BoxGeometry(6, 8, .3), M(0x241b18), [0, 14, 11.65]);
  add(castle, new THREE.TorusGeometry(3, .55, 10, 24, Math.PI), stone, [0, 18, 11.8]);
  const castleLabel = label('霍格沃茨魔法学校', '#d7b968', 520); castleLabel.position.set(0, 37, 13); castle.add(castleLabel);

  // 通向正门的石桥和火把
  const rise = gateHeight - landingHeight, run = bridgeStart - bridgeEnd;
  const span = Math.hypot(run, rise), tilt = Math.atan2(rise, run);
  const midZ = (bridgeStart + bridgeEnd) / 2, midY = bridgeHeight(midZ);
  add(scene, new THREE.BoxGeometry(12, 1, span), M(0x67636e),
    [-42, midY - .5 * Math.cos(tilt), midZ - .5 * Math.sin(tilt)], [tilt, 0, 0]);
  [-1, 1].forEach(side => {
    add(scene, new THREE.BoxGeometry(.65, 1.5, span), darkStone, [-42 + side * 5.8, midY + .7, midZ], [tilt, 0, 0]);
    for (let z = -100; z >= -132; z -= 8) {
      add(scene, new THREE.CylinderGeometry(.12, .16, 2.5, 8), darkStone, [-42 + side * 5.65, bridgeHeight(z) + 1.85, z]);
      const flame = add(scene, new THREE.ConeGeometry(.22, .7, 8), M(0xffc14d, { emissive: 0xff7b19, emissiveIntensity: 1.5 }), [-42 + side * 5.65, bridgeHeight(z) + 3.4, z]);
      flame.userData.flame = true;
    }
  });
  // The landing also leads west to dry ground and the willow.
  const timber = M(0x604631);
  for (let x = -73; x <= -36.5; x += .5) {
    add(scene, new THREE.BoxGeometry(.49, .24, 6.4), timber, [x, pierHeight(x) - .12, -95.9]);
  }
  for (let x = -69; x <= -37; x += 4) {
    for (const z of [-98.7, -93.2]) add(scene, new THREE.CylinderGeometry(.16, .19, 1.8, 8), timber, [x, 0, z]);
  }
  add(scene, new THREE.BoxGeometry(5.3, .40, 5.4), timber, [75.45, .2, -78.4]);
  return { group: castle, gate: new THREE.Vector3(-42, gateHeight, bridgeEnd + 1) };
}

function buildLake(scene) {
  const waterMat = new THREE.MeshPhysicalMaterial({ color: 0x244a68, roughness: .18, metalness: .05, transparent: true, opacity: .86, transmission: .08, side: THREE.DoubleSide });
  const water = add(scene, new THREE.CircleGeometry(54, 80), waterMat, [5, .08, -87], [-Math.PI / 2, 0, 0], [1.35, 1, 1]);
  water.receiveShadow = true;
  const shore = add(scene, new THREE.RingGeometry(53, 58, 80), M(0x5a5948), [5, .01, -87], [-Math.PI / 2, 0, 0], [1.35, 1, 1]);
  shore.receiveShadow = true;
  return water;
}

function buildBoat(scene) {
  const boat = new THREE.Group(); boat.position.set(73, .25, -82); scene.add(boat);
  const wood = M(0x5b3425), trim = M(0xc59b55);
  const hull = new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  wood.side = THREE.DoubleSide;
  add(boat, hull, wood, [0, .65, 0], null, [1.35, .98, 2.75]);
  for (const z of [-.95, .85]) add(boat, new THREE.BoxGeometry(2.45, .12, .34), trim, [0, .48, z]);
  [-1, 1].forEach(s => add(boat, new THREE.CylinderGeometry(.07, .1, 3.8, 8), trim, [s * 1.6, .8, 0], [0, 0, s * 1.2]));
  const start = new THREE.Vector3(73, .25, -82.4), end = new THREE.Vector3(-42, .25, -91.4);
  function setProgress(value) {
    const k = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(value, 0, 1), 0, 1);
    boat.position.lerpVectors(start, end, k); boat.rotation.y = Math.atan2(end.x - start.x, end.z - start.z);
    boat.position.y = .25 + Math.sin(k * Math.PI * 12) * .06;
  }
  setProgress(0);
  return { group: boat, start, end, setProgress };
}

function buildWillow(scene) {
  const willow = new THREE.Group(); willow.position.set(-92, 0, -108); scene.add(willow);
  const bark = M(0x4a2d20), leaves = M(0x59643b, { flatShading: true });
  add(willow, new THREE.CylinderGeometry(2.1, 3.5, 13, 10), bark, [0, 6.5, 0], null, [1, 1, 1]);
  const branches = [];
  for (let i = 0; i < 8; i++) {
    const pivot = new THREE.Group(); pivot.position.set(0, 10 + (i % 3) * 1.4, 0); pivot.rotation.y = i / 8 * Math.PI * 2; willow.add(pivot);
    const branch = add(pivot, new THREE.CylinderGeometry(.22, .65, 10 + (i % 2) * 2, 7), bark, [0, 2.8, 0], [0, 0, 1.12]);
    branch.position.x = 4.4; pivot.userData = { base: pivot.rotation.y, phase: i * .7 }; branches.push(pivot);
    for (let j = 0; j < 4; j++) add(pivot, new THREE.IcosahedronGeometry(2.3 + (j % 2) * .5, 0), leaves, [3 + j * 1.8, 2 + Math.sin(j) * 1.2, 0]);
  }
  const willowLabel = label('打人柳', '#9eb06b', 230); willowLabel.position.set(0, 17, 0); willow.add(willowLabel);
  return { group: willow, branches, activeUntil: 0 };
}

function buildForest(scene) {
  const forest = new THREE.Group(); scene.add(forest);
  const rand = seeded(31), trunk = M(0x493326), needles = [M(0x173f31, { flatShading: true }), M(0x214c38, { flatShading: true }), M(0x2b563d, { flatShading: true })];
  let made = 0;
  while (made < 180) {
    const x = rand() * 330 - 165, z = rand() * 330 - 170;
    const inLake = Math.pow((x - 5) / 76, 2) + Math.pow((z + 87) / 58, 2) < 1;
    const nearStation = z > 72 && Math.abs(x) < 72;
    const nearCastle = Math.abs(x + 42) < 52 && Math.abs(z + 145) < 48;
    if (inLake || nearStation || nearCastle || inRailwayClearing(x,z) || Math.hypot(x + 92, z + 108) < 14) continue;
    const h = 5 + rand() * 8, tree = new THREE.Group(); tree.position.set(x, 0, z); tree.rotation.y = rand() * Math.PI; forest.add(tree);
    add(tree, new THREE.CylinderGeometry(.22, .38, h * .5, 7), trunk, [0, h * .25, 0]);
    for (let i = 0; i < 3; i++) add(tree, new THREE.ConeGeometry(h * (.24 - i * .025), h * .48, 8), needles[(made + i) % needles.length], [0, h * (.42 + i * .18), 0]);
    made++;
  }
  return forest;
}

function buildSky(scene) {
  const count = 900, positions = new Float32Array(count * 3), rand = seeded(7);
  for (let i = 0; i < count; i++) {
    const a = rand() * Math.PI * 2, radius = 250 + rand() * 180, y = 80 + rand() * 190;
    positions.set([Math.cos(a) * radius, y, Math.sin(a) * radius], i * 3);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0xfff4cf, size: 1.2, transparent: true, opacity: .8, depthWrite: false }));
  scene.add(stars); return stars;
}

export function buildMagicWorld(scene) {
  add(scene, new THREE.PlaneGeometry(430, 430), M(0x334b32), [0, -.04, -35], [-Math.PI / 2, 0, 0]);
  buildRailway(scene);
  const station = buildStation(scene), train = buildTrain(scene), water = buildLake(scene), castle = buildCastle(scene);
  const boat = buildBoat(scene), willow = buildWillow(scene), forest = buildForest(scene), stars = buildSky(scene);
  const platformOwl = label('霍格沃茨特快', '#b73f4d', 420); platformOwl.position.set(-12, 9, 96); scene.add(platformOwl);

  const flameMeshes = [];
  scene.traverse(o => { if (o.userData && o.userData.flame) flameMeshes.push(o); });
  function update(dt, time, options = {}) {
    water.position.y = .08 + Math.sin(time * .7) * .035;
    water.material.opacity = .82 + Math.sin(time * .45) * .04;
    stars.rotation.y = time * .004;
    train.smoke.forEach((p, i) => {
      const phase = (time * .14 + p.userData.phase) % 1;
      p.position.set(Math.sin(i) * phase * .5, 5 + phase * 7, 3.5 - phase * 1.5);
      p.scale.setScalar(.5 + phase * 2.1); p.material.opacity = (1 - phase) * .36;
    });
    const willowPower = options.willowActive ? 1 : .12;
    willow.branches.forEach((b, i) => {
      b.rotation.y = b.userData.base + Math.sin(time * (options.willowActive ? 4.5 : .7) + b.userData.phase) * .34 * willowPower;
      b.rotation.z = Math.sin(time * 3.7 + i) * .18 * willowPower;
    });
    flameMeshes.forEach((f, i) => { f.scale.y = .8 + Math.sin(time * 9 + i) * .25; f.rotation.y = time * 4 + i; });
  }
  return {
    station, train, water, castle, boat, willow, forest, stars, platformOwl, update,
    lake: { x: 5, z: -87, rx: 73, rz: 54 },
    points: {
      start: new THREE.Vector3(0, 0, 132), barrier: new THREE.Vector3(0, 0, 114), platform: new THREE.Vector3(0, platformHeight, 100),
      board: new THREE.Vector3(trainStop.x - firstCoachRearDoor, platformHeight, platformEdgeZ + 1.55),
      arrival: new THREE.Vector3(82, platformHeight, -78), boat: new THREE.Vector3(76, 0, -80),
      castle: castle.gate, willow: new THREE.Vector3(-88, 0, -104),
    },
  };
}
