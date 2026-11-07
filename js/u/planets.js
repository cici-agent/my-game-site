// ===== 星球模型：按功能类型加上标志性装饰，一眼看出是干什么的 =====
import * as THREE from 'three';
import { glowTex, planetTexture, lighten, swirlTex } from './tex.js';

const RADIUS = { plaza: 13, games: 9.5, coins: 9, create: 8.5, home: 8.5, magic: 10.5, homestead: 9.5 };
const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .6, ...o });

// 星球在宇宙里的位置：围成一圈，出生点在圈外，一眼能看到好几颗
export function layoutPlanets(planets) {
  const n = planets.length, R = 120;
  planets.forEach((p, i) => {
    const a = (i / n) * Math.PI * 2;   // 第一颗正对出生点，出生点在两颗星球之间的空隙外
    p.radius = RADIUS[p.kind] || 9;
    p.pos = [Math.sin(a) * R, [2, -3, 4, -1, 3, 0][i % 6], Math.cos(a) * R];
  });
  return planets;
}

function onTop(group, obj, r, lift = 0) { obj.position.y = r * .96 + lift; group.add(obj); return obj; }

function decorPlaza(g, r, p) {
  // 小摩天轮
  const wheel = new THREE.Group();
  const rim = new THREE.Mesh(new THREE.TorusGeometry(3, .18, 8, 40), mat(0xffffff, { emissive: 0xffb84d, emissiveIntensity: .5 }));
  wheel.add(rim);
  const colors = [0xff6b6b, 0x4ecdc4, 0xffd23f, 0x8b6bff, 0x5ad1ff, 0xff8fb1];
  for (let k = 0; k < 6; k++) {
    const a = k / 6 * Math.PI * 2;
    const spoke = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 3, 4), mat(0xffffff));
    spoke.rotation.z = a; spoke.position.set(Math.sin(-a) * 1.5, Math.cos(a) * 1.5, 0); wheel.add(spoke);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(.6, .5, .5), mat(colors[k]));
    cab.position.set(Math.cos(a) * 3, Math.sin(a) * 3, 0); cab.userData.cab = true; wheel.add(cab);
  }
  const stand = new THREE.Group();
  [-1, 1].forEach(s => { const leg = new THREE.Mesh(new THREE.CylinderGeometry(.12, .15, 3.6, 6), mat(0xffffff)); leg.position.set(s * 1, -1.6, 0); leg.rotation.z = s * .3; stand.add(leg); });
  const ferris = new THREE.Group(); ferris.add(stand); wheel.position.y = 0; ferris.add(wheel);
  ferris.position.set(-2.2, 0, 0);
  onTop(g, ferris, r, 3.2);
  // 条纹帐篷
  const tent = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2, 8), mat(0xff5d8f)); cone.position.y = 2.2; tent.add(cone);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 1.4, 8), mat(0xfff3d6)); base.position.y = .7; tent.add(base);
  const flag = new THREE.Mesh(new THREE.ConeGeometry(.3, .7, 3), mat(0xffd23f)); flag.position.y = 3.5; flag.rotation.z = -Math.PI / 2; tent.add(flag);
  tent.position.set(3, 0, 1.2); onTop(g, tent, r, -.3);
  return t => { wheel.rotation.z = t * .5; wheel.children.forEach(c => { if (c.userData.cab) c.rotation.z = -t * .5; }); };
}

function decorGames(g, r, p) {
  const ring = new THREE.Mesh(new THREE.RingGeometry(r * 1.35, r * 1.9, 64),
    new THREE.MeshBasicMaterial({ color: lighten(p.color, .4), side: THREE.DoubleSide, transparent: true, opacity: .5 }));
  ring.rotation.x = -Math.PI / 2.3; g.add(ring);
  // 手柄
  const pad = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(.9, 2.2, 6, 12), mat(0x3a3f5c)); body.rotation.z = Math.PI / 2; pad.add(body);
  const btnCols = [0xff4d6d, 0x4dff88, 0x5ad1ff, 0xffd23f];
  btnCols.forEach((c, k) => { const b = new THREE.Mesh(new THREE.SphereGeometry(.22, 10, 8), mat(c, { emissive: c, emissiveIntensity: .4 }));
    b.position.set(1 + (k % 2 ? .35 : -.35) * (k < 2 ? 1 : 0), .45 + (k === 2 ? .35 : k === 3 ? -.35 : 0), .7); pad.add(b); });
  const dpad = new THREE.Mesh(new THREE.BoxGeometry(.8, .25, .2), mat(0x111111)); dpad.position.set(-1, .45, .75); pad.add(dpad);
  const dpad2 = dpad.clone(); dpad2.rotation.z = Math.PI / 2; pad.add(dpad2);
  onTop(g, pad, r, 2.2);
  return t => { pad.rotation.y = t * .6; pad.position.y = r * .96 + 2.2 + Math.sin(t * 2) * .4; };
}

function decorCoins(g, r, p) {
  const coins = [];
  const coinMat = mat(0xffd23f, { metalness: .8, roughness: .25, emissive: 0x8a5a00, emissiveIntensity: .35 });
  for (let k = 0; k < 9; k++) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, .25, 24), coinMat);
    c.rotation.x = Math.PI / 2; c.userData = { a: k / 9 * Math.PI * 2, rr: r + 3.2 + (k % 2) * 1.2, y: (k % 3 - 1) * 2.2 };
    g.add(c); coins.push(c);
  }
  return t => coins.forEach(c => { const a = c.userData.a + t * .35;
    c.position.set(Math.cos(a) * c.userData.rr, c.userData.y + Math.sin(t + c.userData.a) * .4, Math.sin(a) * c.userData.rr);
    c.rotation.z = t * 2 + c.userData.a; });
}

function decorCreate(g, r, p) {
  // 大画笔 + 闪光
  const brush = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(.25, .3, 4, 10), mat(0xffd23f)); brush.add(handle);
  const ferrule = new THREE.Mesh(new THREE.CylinderGeometry(.35, .3, .7, 10), mat(0xcfd8ff, { metalness: .7 })); ferrule.position.y = -2.3; brush.add(ferrule);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(.38, 1.2, 10), mat(0xff5d8f)); tip.rotation.x = Math.PI; tip.position.y = -3.2; brush.add(tip);
  brush.rotation.z = .7; onTop(g, brush, r, 3.5);
  const sparks = [];
  for (let k = 0; k < 16; k++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: [0xff5d8f, 0x5ad1ff, 0xffd23f, 0x7dff9b][k % 4], blending: THREE.AdditiveBlending, depthWrite: false }));
    s.userData = { a: k / 16 * Math.PI * 2, rr: r * 1.5 + (k % 3), y: Math.sin(k) * r * .5 }; s.scale.setScalar(1.4); g.add(s); sparks.push(s);
  }
  return t => {
    brush.rotation.y = t * .5;
    sparks.forEach(s => { const a = s.userData.a + t * .25; s.position.set(Math.cos(a) * s.userData.rr, s.userData.y, Math.sin(a) * s.userData.rr);
      s.material.opacity = .5 + .5 * Math.sin(t * 3 + s.userData.a * 3); });
  };
}

function decorHome(g, r, p) {
  const house = new THREE.Group();
  const walls = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 2.6), mat(0xfff6ec)); walls.position.y = 1.1; house.add(walls);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.8, 4), mat(0xff6b35)); roof.position.y = 3.1; roof.rotation.y = Math.PI / 4; house.add(roof);
  const door = new THREE.Mesh(new THREE.BoxGeometry(.7, 1.2, .1), mat(0x8b5a2b)); door.position.set(0, .6, 1.31); house.add(door);
  const win = new THREE.Mesh(new THREE.BoxGeometry(.6, .6, .1), mat(0xfff3b0, { emissive: 0xffd23f, emissiveIntensity: .8 })); win.position.set(.95, 1.4, 1.31); house.add(win);
  const chimney = new THREE.Mesh(new THREE.BoxGeometry(.4, .9, .4), mat(0xb5523b)); chimney.position.set(-.8, 3.4, 0); house.add(chimney);
  onTop(g, house, r, -.4);
  const tree = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.18, .22, 1.2, 6), mat(0x8b5a2b)); trunk.position.y = .6; tree.add(trunk);
  const leaves = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), mat(0x4caf50, { flatShading: true })); leaves.position.y = 1.7; tree.add(leaves);
  tree.position.set(2.6, 0, .4); onTop(g, tree, r, -.5);
  return () => {};
}

function decorMagic(g, r, p) {
  // 远处也能认出的城堡剪影、环绕金色轨道与飞翔的猫头鹰。
  const stone = mat(0x4a4564, { roughness: .85 });
  const roof = mat(0x17233f, { roughness: .7, emissive: 0x101a36, emissiveIntensity: .35 });
  const gold = mat(0xf4cf73, { emissive: 0xc98b2b, emissiveIntensity: .7, metalness: .25 });
  const castle = new THREE.Group();
  const hall = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.2, 2.4), stone); hall.position.y = 1.1; castle.add(hall);
  [[-1.65, 0, 3.1], [1.65, 0, 3.1], [0, -.7, 4.1]].forEach(([x, z, h], i) => {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(.62 + i * .05, .72 + i * .05, h, 8), stone);
    tower.position.set(x, h / 2, z); castle.add(tower);
    const spire = new THREE.Mesh(new THREE.ConeGeometry(.9, 1.8, 8), roof); spire.position.set(x, h + .9, z); castle.add(spire);
    const win = new THREE.Mesh(new THREE.BoxGeometry(.2, .5, .05), gold); win.position.set(x, h * .58, z + .73); castle.add(win);
  });
  castle.scale.setScalar(.9); onTop(g, castle, r, -.2);

  const orbit = new THREE.Mesh(new THREE.TorusGeometry(r * 1.45, .12, 8, 96), gold);
  orbit.rotation.x = Math.PI / 2.5; g.add(orbit);
  const owls = [];
  for (let i = 0; i < 3; i++) {
    const owl = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(.45, 10, 8), mat(0xe9dfc8)); body.scale.set(1, 1.25, .8); owl.add(body);
    [-1, 1].forEach(s => {
      const wing = new THREE.Mesh(new THREE.ConeGeometry(.32, .9, 5), mat(0xb9aa8c));
      wing.position.x = s * .45; wing.rotation.z = s * 1.15; wing.userData.side = s; owl.add(wing);
    });
    owl.userData = { a: i / 3 * Math.PI * 2, rr: r + 4 + i * .8 }; g.add(owl); owls.push(owl);
  }
  return t => {
    castle.position.y = r * .96 - .2 + Math.sin(t * 1.2) * .08;
    orbit.rotation.z = t * .08;
    owls.forEach((owl, i) => {
      const a = owl.userData.a + t * (.32 + i * .03);
      owl.position.set(Math.cos(a) * owl.userData.rr, 2 + Math.sin(t * 2 + i) * 1.1, Math.sin(a) * owl.userData.rr);
      owl.rotation.y = -a + Math.PI / 2;
      owl.children.forEach(c => { if (c.userData.side) c.rotation.z = c.userData.side * (1.05 + Math.sin(t * 7 + i) * .35); });
    });
  };
}

function decorHomestead(g, r, p) {
  // 小木屋 + 一排排菜地 + 栅栏 + 小鸡：一看就是"家园"
  const farm = new THREE.Group();
  const cabin = new THREE.Group();
  const wood = mat(0xc98b4e), dark = mat(0x8b5a2b);
  const walls = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.8, 2.2), wood); walls.position.y = .9; cabin.add(walls);
  const roofMat = mat(0xd9534f);
  [-1, 1].forEach(s => { const slab = new THREE.Mesh(new THREE.BoxGeometry(3, .14, 1.55), roofMat); slab.position.set(0, 2.25, s * .55); slab.rotation.x = s * .62; cabin.add(slab); });
  const door = new THREE.Mesh(new THREE.BoxGeometry(.6, 1.05, .08), dark); door.position.set(-.5, .53, 1.11); cabin.add(door);
  const win = new THREE.Mesh(new THREE.BoxGeometry(.55, .5, .08), mat(0xfff3b0, { emissive: 0xffd23f, emissiveIntensity: .8 })); win.position.set(.6, 1.05, 1.11); cabin.add(win);
  cabin.position.set(-1.6, 0, -.6); farm.add(cabin);
  // 菜地：三垄，种着不同颜色的菜
  const soil = mat(0x7a4a2a, { roughness: 1 });
  const veg = [0x5cc04a, 0xff8c2a, 0xe8433a];
  for (let k = 0; k < 3; k++) {
    const row = new THREE.Mesh(new THREE.BoxGeometry(2.4, .25, .45), soil); row.position.set(1.9, .12, -.9 + k * .75); farm.add(row);
    for (let j = 0; j < 4; j++) {
      const v = new THREE.Mesh(new THREE.SphereGeometry(.17, 8, 6), mat(veg[k])); v.position.set(1 + j * .6, .36, -.9 + k * .75); farm.add(v);
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(.1, .3, 5), mat(0x3e9b35)); leaf.position.set(1 + j * .6, .55, -.9 + k * .75); farm.add(leaf);
    }
  }
  // 栅栏
  const fence = mat(0xfff6ec);
  for (let j = 0; j < 7; j++) { const post = new THREE.Mesh(new THREE.BoxGeometry(.12, .6, .12), fence); post.position.set(.6 + j * .45, .3, 1.35); farm.add(post); }
  const rail = new THREE.Mesh(new THREE.BoxGeometry(2.9, .08, .06), fence); rail.position.set(1.95, .42, 1.35); farm.add(rail);
  onTop(g, farm, r, -.35);
  // 小鸡在星球表面绕圈走
  const chicks = [];
  for (let k = 0; k < 3; k++) {
    const c = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(.32, 10, 8), mat(0xfff1a8)); c.add(body);
    const beak = new THREE.Mesh(new THREE.ConeGeometry(.08, .2, 5), mat(0xff8c2a)); beak.rotation.x = Math.PI / 2; beak.position.z = .34; c.add(beak);
    c.userData.a = k / 3 * Math.PI * 2; g.add(c); chicks.push(c);
  }
  return t => {
    chicks.forEach((c, k) => {
      const a = c.userData.a + t * .35;
      const rr = r * 1.0;
      c.position.set(Math.cos(a) * rr * .55, r * .82 + Math.abs(Math.sin(t * 6 + k)) * .15, Math.sin(a) * rr * .55);
      c.rotation.y = -a;
    });
  };
}

const DECOR = { plaza: decorPlaza, games: decorGames, coins: decorCoins, create: decorCreate, home: decorHome, magic: decorMagic, homestead: decorHomestead };

export function buildPlanet(p, i) {
  const r = p.radius, c2 = lighten(p.color, .5);
  const g = new THREE.Group(); g.position.set(...p.pos);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, 48, 32),
    new THREE.MeshStandardMaterial({ map: planetTexture(p.color, c2, 100 + i * 37), roughness: .85, metalness: p.kind === 'coins' ? .35 : 0 }));
  mesh.userData.planet = p; g.add(mesh);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: p.color, blending: THREE.AdditiveBlending, transparent: true, opacity: .55, depthWrite: false }));
  halo.scale.setScalar(r * 3.4); g.add(halo);
  const update = (DECOR[p.kind] || (() => () => {}))(g, r, p) || (() => {});
  p.group = g; p.mesh = mesh; p.updateDecor = update;
  return g;
}

// ===== 星门 =====
export function createGate() {
  const gate = new THREE.Group();
  const ringMat = new THREE.MeshStandardMaterial({ color: 0xdfe6ff, metalness: .6, roughness: .3, emissive: 0xff6b35, emissiveIntensity: .7 });
  gate.add(new THREE.Mesh(new THREE.TorusGeometry(5, .5, 16, 72), ringMat));
  const disc = new THREE.Mesh(new THREE.CircleGeometry(4.6, 48),
    new THREE.MeshBasicMaterial({ map: swirlTex(), transparent: true, opacity: .6, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  gate.add(disc);
  const chevMat = new THREE.MeshBasicMaterial({ color: 0xffb36b });
  for (let k = 0; k < 9; k++) {
    const ch = new THREE.Mesh(new THREE.BoxGeometry(.9, .7, .7), chevMat);
    const a = k / 9 * Math.PI * 2; ch.position.set(Math.cos(a) * 5.3, Math.sin(a) * 5.3, 0); ch.rotation.z = a; gate.add(ch);
  }
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffb36b, blending: THREE.AdditiveBlending, transparent: true, opacity: .35, depthWrite: false }));
  halo.scale.setScalar(17); gate.add(halo);
  gate.visible = false;
  gate.userData.tint = color => {
    const c = new THREE.Color(color);
    ringMat.emissive.copy(c); chevMat.color.copy(c).lerp(new THREE.Color(0xffffff), .3);
    halo.material.color.copy(c); disc.material.color.copy(c).lerp(new THREE.Color(0xffffff), .55);
  };
  gate.userData.spin = dt => { disc.rotation.z -= dt * 3; };
  return gate;
}
