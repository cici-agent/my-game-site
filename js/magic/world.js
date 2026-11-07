// 魔法学院星球：全部使用 Three.js 基础几何体程序化搭建，不依赖影视素材。
import * as THREE from 'three';

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
  add(group, new THREE.BoxGeometry(118, .7, 80), M(0x8d8272), [0, -.35, 116]);
  add(group, new THREE.BoxGeometry(118, 15, 2), brick, [0, 7.5, 156]);
  // 只保留玻璃顶棚的承重梁，避免用不透明顶板遮住整片天空。
  add(group, new THREE.BoxGeometry(2, 1, 78), iron, [-56, 17, 117]);
  add(group, new THREE.BoxGeometry(2, 1, 78), iron, [56, 17, 117]);
  // 玻璃拱顶的金属骨架
  for (let x = -54; x <= 54; x += 12) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(32, .18, 6, 32, Math.PI), iron);
    rib.rotation.z = Math.PI / 2; rib.rotation.y = Math.PI / 2; rib.position.set(x, 2, 112); group.add(rib);
  }
  const glass = add(group, new THREE.BoxGeometry(110, .12, 76), M(0xa8d8e8, { transparent: true, opacity: .12, depthWrite: false }), [0, 16.4, 117]);
  glass.castShadow = false;

  // 九又四分之三站台的砖墙与拱门
  // 中间留出真正可以穿过的隐藏入口。
  add(group, new THREE.BoxGeometry(51, 12, 2.5), brick, [-33.5, 6, 112]);
  add(group, new THREE.BoxGeometry(51, 12, 2.5), brick, [33.5, 6, 112]);
  add(group, new THREE.BoxGeometry(16, 2.5, 2.5), brick, [0, 11.7, 112]);
  add(group, new THREE.BoxGeometry(9, 10, 3.2), darkStone, [-7, 5, 110.5]);
  add(group, new THREE.BoxGeometry(9, 10, 3.2), darkStone, [7, 5, 110.5]);
  add(group, new THREE.BoxGeometry(23, 2, 3.2), darkStone, [0, 10, 110.5]);
  const arch = add(group, new THREE.TorusGeometry(7, 1.15, 10, 32, Math.PI), darkStone, [0, 9.3, 110.2], [0, 0, 0]);
  arch.rotation.z = 0;
  const platformLabel = label('9 ¾ 站台', '#e7bd5b', 320); platformLabel.position.set(0, 12.5, 108.5); group.add(platformLabel);
  const stationLabel = label('国王十字车站', '#c98b6b', 420); stationLabel.position.set(0, 11.5, 154.4); group.add(stationLabel);
  const warmA = new THREE.PointLight(0xffc77a, 24, 60, 1.6); warmA.position.set(-22, 12, 126); group.add(warmA);
  const warmB = new THREE.PointLight(0xffd69b, 22, 55, 1.6); warmB.position.set(22, 10, 101); group.add(warmB);

  // 站台、轨道、枕木与灯柱
  add(group, new THREE.BoxGeometry(118, .8, 18), cream, [0, .1, 98]);
  [-4, 4].forEach(z => add(group, new THREE.BoxGeometry(118, .18, .2), iron, [0, .17, 84 + z]));
  for (let x = -58; x <= 58; x += 3) add(group, new THREE.BoxGeometry(1.9, .15, 11), M(0x4b352b), [x, .04, 84]);
  for (let x = -48; x <= 48; x += 16) {
    add(group, new THREE.CylinderGeometry(.12, .18, 6, 8), iron, [x, 3, 103]);
    add(group, new THREE.SphereGeometry(.35, 12, 8), M(0xffe7a0, { emissive: 0xffc34d, emissiveIntensity: 1.2 }), [x, 6.2, 103]);
    add(group, new THREE.BoxGeometry(8, .55, 1.5), M(0x5b3528), [x + 4, .7, 105]);
  }
  // 行李与手推车
  const trolley = new THREE.Group(); trolley.position.set(-9, 0, 124); group.add(trolley);
  add(trolley, new THREE.BoxGeometry(2.8, .15, 1.7), iron, [0, .7, 0]);
  add(trolley, new THREE.BoxGeometry(.12, 2.6, 1.7), iron, [-1.3, 1.8, 0]);
  [-1, 1].forEach(x => [-1, 1].forEach(z => add(trolley, new THREE.CylinderGeometry(.24, .24, .16, 12), darkStone, [x, .3, z * .62], [0, 0, Math.PI / 2])));
  add(trolley, new THREE.BoxGeometry(1.8, 1.2, 1.15), M(0x7a3e2d), [.2, 1.4, 0]);
  return group;
}

function wheel(parent, x, z, radius = .65) {
  return add(parent, new THREE.CylinderGeometry(radius, radius, .24, 20), darkStone, [x, .45, z], [0, 0, Math.PI / 2]);
}

function buildTrain(scene) {
  const train = new THREE.Group(); scene.add(train);
  const red = M(0x7d1f2c), red2 = M(0x4d1620), black = M(0x15171c, { metalness: .35 }), glass = M(0x9ed2e3, { emissive: 0x234c62, emissiveIntensity: .25 });
  const engine = new THREE.Group(); train.add(engine);
  add(engine, new THREE.CylinderGeometry(1.7, 1.7, 6.8, 20), red, [0, 2.25, 0], [Math.PI / 2, 0, 0]);
  add(engine, new THREE.BoxGeometry(3.7, 3.8, 3.5), red2, [0, 2.2, -4.7]);
  add(engine, new THREE.BoxGeometry(4.1, .3, 11), black, [0, .75, -1.8]);
  add(engine, new THREE.CylinderGeometry(.55, .82, 2.2, 16), black, [0, 4.3, 1.2]);
  add(engine, new THREE.CylinderGeometry(.55, .55, .45, 16), gold, [0, 2.35, 3.5], [Math.PI / 2, 0, 0]);
  [-1, 1].forEach(x => [-3.8, 0, 2.7].forEach(z => wheel(engine, x * 1.25, z)));
  const lamp = add(engine, new THREE.SphereGeometry(.35, 12, 8), M(0xfff3b0, { emissive: 0xffd35c, emissiveIntensity: 1.6 }), [0, 2.8, 3.55]);
  lamp.castShadow = false;

  for (let i = 0; i < 3; i++) {
    const car = new THREE.Group(); car.position.z = -9.2 - i * 8.2; train.add(car);
    add(car, new THREE.BoxGeometry(4.2, 3.7, 7.4), red, [0, 2.4, 0]);
    add(car, new THREE.BoxGeometry(4.45, .5, 7.7), black, [0, 4.45, 0]);
    for (let z = -2.3; z <= 2.3; z += 2.3) {
      [-1, 1].forEach(x => add(car, new THREE.BoxGeometry(.08, 1.25, 1.3), glass, [x * 2.12, 2.65, z]));
    }
    [-1, 1].forEach(x => [-2.3, 2.3].forEach(z => wheel(car, x * 1.42, z)));
  }

  const smoke = [];
  for (let i = 0; i < 9; i++) {
    const puff = add(train, new THREE.SphereGeometry(.45 + i * .04, 10, 8), M(0xe8edf2, { transparent: true, opacity: .42, depthWrite: false }), [0, 5, 1.1]);
    puff.castShadow = false; puff.userData.phase = i / 9; smoke.push(puff);
  }
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 84), new THREE.Vector3(55, 1, 70), new THREE.Vector3(112, 4, 18),
    new THREE.Vector3(112, 2, -44), new THREE.Vector3(82, 0, -84), new THREE.Vector3(70, 0, -91),
  ], false, 'catmullrom', .18);
  function setProgress(value) {
    const k = THREE.MathUtils.clamp(value, 0, 1), point = curve.getPointAt(k), tangent = curve.getTangentAt(Math.min(.999, k));
    train.position.copy(point); train.rotation.y = Math.atan2(tangent.x, tangent.z);
  }
  setProgress(0);
  return { group: train, curve, smoke, setProgress };
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
  add(castle, new THREE.CylinderGeometry(34, 41, 10, 10), M(0x454653), [0, 5, 0]);
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
  const gate = add(castle, new THREE.BoxGeometry(6, 8, .3), M(0x241b18), [0, 14, 11.65]);
  add(castle, new THREE.TorusGeometry(3, .55, 10, 24, Math.PI), stone, [0, 18, 11.8]);
  const castleLabel = label('霍格沃茨魔法学校', '#d7b968', 520); castleLabel.position.set(0, 37, 13); castle.add(castleLabel);

  // 通向正门的石桥和火把
  add(scene, new THREE.BoxGeometry(12, 1.1, 42), M(0x67636e), [-42, 3.2, -117]);
  [-1, 1].forEach(side => {
    add(scene, new THREE.BoxGeometry(.65, 1.8, 42), darkStone, [-42 + side * 6, 4.2, -117]);
    for (let z = -98; z >= -136; z -= 8) {
      add(scene, new THREE.CylinderGeometry(.12, .16, 2.5, 8), darkStone, [-42 + side * 5.5, 5.4, z]);
      const flame = add(scene, new THREE.ConeGeometry(.22, .7, 8), M(0xffc14d, { emissive: 0xff7b19, emissiveIntensity: 1.5 }), [-42 + side * 5.5, 7, z]);
      flame.userData.flame = true;
    }
  });
  return { group: castle, gate: new THREE.Vector3(-42, 0, -96) };
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
  add(boat, new THREE.SphereGeometry(2.35, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), wood, [0, .3, 0], null, [1, .55, 1.9]);
  add(boat, new THREE.BoxGeometry(3.4, .2, .4), trim, [0, 1, 0]);
  [-1, 1].forEach(s => add(boat, new THREE.CylinderGeometry(.07, .1, 3.8, 8), trim, [s * 1.6, .8, 0], [0, 0, s * 1.2]));
  const start = new THREE.Vector3(73, .25, -82), end = new THREE.Vector3(-42, .25, -137);
  function setProgress(value) {
    const k = THREE.MathUtils.smoothstep(THREE.MathUtils.clamp(value, 0, 1), 0, 1);
    boat.position.lerpVectors(start, end, k); boat.rotation.y = Math.atan2(end.x - start.x, end.z - start.z);
    boat.position.y = .25 + Math.sin(k * Math.PI * 12) * .06;
  }
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
    if (inLake || nearStation || nearCastle || Math.hypot(x + 92, z + 108) < 14) continue;
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
  // 从车站延伸到湖区的远景道路
  add(scene, new THREE.PlaneGeometry(14, 128), M(0x6a6255), [72, .01, -25], [-Math.PI / 2, 0, -.16]);
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
      p.position.set(Math.sin(i) * phase * .5, 4.7 + phase * 7, 1.1 - phase * 1.5);
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
    station, train, water, castle, boat, willow, forest, stars, update,
    lake: { x: 5, z: -87, rx: 73, rz: 54 },
    points: {
      start: new THREE.Vector3(0, 0, 132), barrier: new THREE.Vector3(0, 0, 114), platform: new THREE.Vector3(0, 0, 100),
      board: new THREE.Vector3(0, 0, 94), arrival: new THREE.Vector3(82, 0, -78), boat: new THREE.Vector3(76, 0, -80),
      castle: new THREE.Vector3(-42, 0, -136), willow: new THREE.Vector3(-88, 0, -104),
    },
  };
}
