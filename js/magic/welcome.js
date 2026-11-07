import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { platformHeight } from './station-navigation.js';

export const arrivalGreeting = {
  name: '海格',
  text: '新生们，欢迎来到霍格莫德站！看得见我这盏灯吗？从这边下坡，船就在湖边等你们。',
};

const cast = [
  {
    id: 'hagrid', name: '海格', x: 81.65, z: -74.5, radius: .78, height: 3.38, distance: 4.2,
    lines: [
      '我是海格，替学校照看场地。行李让站务员收着吧。来，顺着这盏灯往坡下走，咱们坐船进学校。',
      '一会儿到了湖心，记得抬头。头一回看见那些亮着灯的塔楼，可千万别错过。',
    ],
  },
  {
    id: 'prefect', name: '赫奇帕奇级长', x: 81.9, z: -84.4, radius: .42, height: 2.2, distance: 3.2,
    lines: [
      '你也在找一年级的队伍吗？认准海格手里那盏灯就行。他会带你们过去，我留下来等最后一节车厢的同学。',
      '要是紧张，就找个人一起坐船。我入学那天，就是在湖上认识第一个朋友的。',
    ],
  },
  {
    id: 'porter', name: '站务员', x: 81.9, z: -88.8, radius: .46, height: 2.34, distance: 3.2,
    lines: [
      '欢迎来到霍格莫德！把名字系牢在箱子上。等你吃过晚饭，它就该到寝室门口啦。',
      '去码头的坡道就在站台中段。站在这儿能听见湖水拍着木桩的声音。',
    ],
  },
];

const cloth = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .86 });
const metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .38, metalness: .58 });
const flame = new THREE.MeshStandardMaterial({ vertexColors: true, emissive: 0xffb442, emissiveIntensity: 2.3 });
const ball = new THREE.SphereGeometry(1, 14, 10);
const cube = new THREE.BoxGeometry(1, 1, 1);
const tube = new THREE.CylinderGeometry(1, 1, 1, 12);
const hoop = new THREE.TorusGeometry(1, .12, 6, 22);
const hairLock = new THREE.LatheGeometry(
  [[.03,-1],[.32,-.82],[.75,-.46],[.91,-.15],[1,.10],[.84,.48],[.54,.76],[.08,.91]]
    .map(([r,h]) => new THREE.Vector2(r,h)), 12);
const tint = new THREE.Color();

// Build each moving limb from local pieces, then bake by material. Crowds cost
// a handful of draw calls per character, even with individual curls and buttons.
function rig() {
  const batches = new Map();
  const root = new THREE.Group();
  const transform = new THREE.Object3D();
  function joint(parent, x, y, z) {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, z);
    parent.add(pivot);
    return pivot;
  }
  function shape(parent, geometry, color, x, y, z, sx, sy, sz, rz = 0, mat = cloth) {
    transform.position.set(x, y, z);
    transform.scale.set(sx, sy, sz);
    transform.rotation.set(0, 0, rz);
    transform.updateMatrix();
    const g = geometry.clone().applyMatrix4(transform.matrix);
    g.deleteAttribute('uv');
    tint.setHex(color);
    const colors = new Float32Array(g.attributes.position.count * 3);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = tint.r;
      colors[i + 1] = tint.g;
      colors[i + 2] = tint.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    if (!batches.has(parent)) batches.set(parent, new Map());
    const materials = batches.get(parent);
    if (!materials.has(mat)) materials.set(mat, []);
    materials.get(mat).push(g);
  }
  function profile(parent, points, color, x, y, z, depth) {
    const geometry = new THREE.LatheGeometry(points.map(([r, h]) => new THREE.Vector2(r, h)), 24);
    shape(parent, geometry, color, x, y, z, 1, 1, depth);
    geometry.dispose();
  }
  function finish() {
    for (const [parent, materials] of batches) {
      for (const [mat, pieces] of materials) {
        const geometry = mergeGeometries(pieces);
        const mesh = new THREE.Mesh(geometry, mat);
        mesh.castShadow = mat !== flame;
        mesh.receiveShadow = true;
        parent.add(mesh);
        for (const g of pieces) g.dispose();
      }
    }
    batches.clear();
  }
  return { root, joint, shape, profile, finish };
}

function face(r, head, skin, hair, width) {
  r.shape(head, ball, skin, 0, .01, 0, width, width * 1.15, width * .88);
  for (const side of [-1, 1]) {
    r.shape(head, ball, skin, side * width * .95, 0, 0, width * .17, width * .27, width * .17);
    r.shape(head, ball, 0x382a29, side * width * .39, width * .17, width * .78, width * .087, width * .10, width * .065);
    r.shape(head, ball, hair, side * width * .41, width * .34, width * .76, width * .23, width * .067, width * .077, side * .14);
  }
  r.shape(head, ball, skin, 0, -.01, width * .84, width * .21, width * .2, width * .21);
}

function keeper() {
  const r = rig(), { root, shape, joint, profile } = r;
  const coat = 0x654632, leather = 0x463025, skin = 0xd69e75, beard = 0x392823, brass = 0xc19952;
  for (const side of [-1, 1]) {
    shape(root, ball, 0x353435, side * .27, .67, 0, .229, .61, .23);
    shape(root, ball, leather, side * .27, .24, .095, .239, .227, .37);
    shape(root, ball, 0x372c28, side * .27, .103, .15, .246, .092, .371);
    shape(root, cube, 0x805f46, side * .27, .284, .354, .19, .027, .036, side * .08);
  }
  profile(root, [[.02,.57],[.65,.58],[.66,.7],[.59,1.22],[.61,1.67],[.69,2.17],[.59,2.38],[.17,2.51]], coat, 0, 0, 0, .71);
  shape(root, ball, 0x5f4237, 0, 2.07, .35, .26, .35, .14);
  for (const side of [-1, 1]) {
    shape(root, cube, 0x815e45, side * .235, 2.1, .423, .142, .54, .046, -side * .47);
    shape(root, cube, 0x78573d, side * .37, 1.13, .337, .245, .18, .047, side * .13);
    shape(root, cube, 0x937151, side * .37, 1.22, .36, .26, .039, .045, side * .13);
  }
  shape(root, tube, leather, 0, 1.51, 0, .638, .115, .453);
  shape(root, cube, brass, 0, 1.51, .466, .18, .13, .042, 0, metal);
  shape(root, cube, leather, 0, 1.51, .493, .12, .075, .03);
  for (const y of [1.69,1.84,1.99]) {
    shape(root, ball, brass, -.042,y,.453,.034,.035,.022,0,metal);
    shape(root, cube, 0x4c3529, .039,y,.456,.095,.018,.022,-.05);
  }
  shape(root, cube, 0x533b2f, 0, 1.02, .443, .026, .78, .019);
  shape(root, hoop, brass, .42, 1.42, .348, .072,.078,.07,.2,metal);
  for (const [i,angle] of [-.26,.16].entries()) {
    const k = joint(root, .424 + i*.055, 1.39, .367);
    k.rotation.z = angle;
    shape(k, hoop, brass, 0,-.023,0,.032,.045,.026,0,metal);
    shape(k, cube, brass, 0,-.10,0,.016,.112,.025,0,metal);
    shape(k, cube, brass, .018,-.149,0,.047,.024,.025,0,metal);
  }
  const head = joint(root, 0, 2.82, .01);
  face(r, head, skin, beard, .365);
  shape(head, ball, beard, 0, .16, -.115, .41, .40, .34);
  shape(head, ball, beard, 0, -.27, .13, .39, .41, .26);
  const curlColors = [0x372721,0x493328,0x543b2a,0x423029,0x634832];
  // Wavy shoulder-length hair frames the face; leave the eyes and nose clear.
  for (let i = 0; i < 19; i++) {
    const t = .96 + i * (Math.PI * 2 - 1.92) / 18;
    const sweep = Math.sin(i * 2.7);
    shape(head, hairLock, curlColors[i % 5], .357 * Math.sin(t), -.025 + sweep * .061,
      .30 * Math.cos(t) - .04, .14, .42 + .06 * sweep, .145, sweep * .22);
  }
  for (let i = 0; i < 9; i++) {
    const s = (i - 4) / 4;
    shape(head, hairLock, curlColors[(i + 1) % 5], s * .30, -.34 + s*s * .14,
      .342 - s*s * .095, .101, .31 - s*s * .06, .092, s * -.21 + .085*Math.cos(i));
  }
  for (let i = 0; i < 8; i++) {
    const s = (i-3.5)/3.5;
    shape(head, hairLock, curlColors[(i+3)%5], s*.27, -.25+s*s*.12,
      .394-.085*s*s, .077, .17-.035*s*s, .058, .17*Math.sin(i*2.5));
  }
  for (const side of [-1, 1]) {
    shape(head, ball, 0x52392a, side * .104, -.109, .355, .143, .060, .060, side * -.21);
    shape(head, ball, 0x4b3227, side * .127, .37, .13, .21, .09, .18, side * -.20);
  }
  const wave = joint(root, .57, 2.24, .03);
  shape(wave, ball, coat, .11, -.24, 0, .235, .42, .22, .27);
  const forearm = joint(wave, .20, -.53, 0);
  shape(forearm, ball, coat, 0, -.20, .02, .19, .31, .18);
  shape(forearm, tube, 0x50382a, 0, -.402,.02,.171,.09,.159);
  shape(forearm, ball, skin, .01, -.518, .04, .128, .154, .102);
  shape(forearm, ball, skin, -.091, -.511, .075, .072, .111, .055, -.62);
  for (let i = 0; i < 4; i++) {
    shape(forearm, ball, skin, -.066+i*.047, -.612, .051, .030,.080-.008*Math.abs(1.5-i),.044,(i-1.5)*.09);
  }
  forearm.rotation.z = 1.67;
  const left = joint(root, -.60, 2.22, 0);
  shape(left, ball, coat, -.13, -.30, 0, .24, .46, .22, -.29);
  shape(left, ball, coat, -.27, -.61, .10, .19, .28, .20, .13);
  shape(left, ball, skin, -.25, -.81, .18, .14, .16, .135);
  const lantern = joint(left, -.25, -.84, .19);
  shape(lantern, hoop, brass, 0, -.091, 0, .125, .14, .12, 0, metal);
  shape(lantern, tube, 0x414444, 0, -.251, 0, .165, .08, .165, 0, metal);
  shape(lantern, ball, 0xffc568, 0, -.39, 0, .117, .149, .117, 0, flame);
  shape(lantern, tube, 0x384043, 0, -.55, 0, .158, .065, .158, 0, metal);
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + .72;
    shape(lantern, tube, brass, .137*Math.cos(a), -.397, .137*Math.sin(a), .015, .27, .015, 0, metal);
  }
  r.finish();
  return { root, animate(time, near) {
    wave.rotation.z = .21 + near * .87 + Math.sin(time * 3.6) * .10 * near;
    forearm.rotation.z = 1.48 + near * .35 + Math.sin(time * 4.5) * .14 * near;
    head.rotation.z = Math.sin(time * 1.6) * .025;
    lantern.rotation.z = Math.sin(time * 2.1) * .085;
  }};
}

function railwayStaff(isPrefect) {
  const r = rig(), { root, shape, joint, profile } = r;
  const jacket = isPrefect ? 0x293137 : 0x394950;
  const trim = isPrefect ? 0xe9b951 : 0xc89857;
  const skin = isPrefect ? 0xa96e50 : 0xc68b6e, hair = isPrefect ? 0x352a2b : 0x5d4c42;
  for (const side of [-1, 1]) {
    shape(root, ball, 0x383637, side * .137, .51, 0, .121, .435, .13);
    shape(root, ball, 0x312927, side * .137, .127, .061, .128, .125, .196);
  }
  profile(root, [[.014,.58],[.323,.59],[.312,1.02],[.287,1.28],[.336,1.55],[.244,1.67],[.09,1.67]], jacket, 0, 0, 0, .66);
  shape(root, ball, 0xe8dfc8, 0, 1.51, .173, .115, .149, .047);
  shape(root, ball, trim, 0, 1.475, .205, .041, .128, .031);
  shape(root, cube, trim, -.163, 1.492, .175, .078, .09, .028);
  const head = joint(root, 0, 1.855, .007);
  face(r, head, skin, hair, .202);
  shape(head, ball, hair, 0, .088, -.034, .213, .191, .181);
  if (isPrefect) {
    for (let i = 0; i < 11; i++) {
      const a = i * Math.PI * 2 / 11;
      shape(head, ball, hair, .151 * Math.sin(a), .14 + .018*Math.cos(a), .12*Math.cos(a) - .015, .089, .093, .088);
    }
    shape(head, ball, hair, .01, .055, -.20, .13, .13, .12);
    shape(root, cube, trim, .102, 1.34, .206, .09, .42, .051, -.16);
    for (let i = 0; i < 3; i++) shape(root, cube, jacket, .091+i*.013, 1.47-i*.096, .235, .092, .03, .018, -.16);
  } else {
    shape(head, tube, 0x2d383c, 0, .181, .005, .234, .09, .221);
    shape(head, ball, jacket, 0, .23, -.013, .25, .103, .22);
    shape(head, ball, 0x292829, 0, .148, .163, .187, .028, .123);
    shape(head, ball, trim, 0, .207, .206, .038, .035, .015, 0, metal);
    for (const side of [-1, 1]) shape(head, ball, hair, side*.050, -.050, .177, .060, .029, .024, side * -.14);
    for (let i = 0; i < 3; i++) shape(root, ball, trim, .085, 1.35-i*.143, .195, .024, .024, .019, 0, metal);
  }
  for (const side of [-1, 1]) {
    shape(root, ball, jacket, side * .295, 1.33, .002, .116, .25, .116, side * .16);
  }
  const arm = joint(root, .33, 1.15, .015);
  shape(arm, ball, jacket, .02, -.125, .07, .095, .18, .106);
  shape(arm, ball, skin, .035, -.289, .13, .074, .095, .071);
  shape(root, ball, jacket, -.287, 1.164, .137, .104, .115, .21);
  shape(root, ball, skin, -.21, 1.16, .296, .077, .083, .073);
  if (isPrefect) {
    shape(root, cube, 0x825b45, -.116, 1.19, .298, .228, .322, .034, -.12);
    shape(root, cube, 0xe9d8af, -.116, 1.19, .319, .197, .282, .012, -.12);
  } else {
    shape(root, hoop, trim, -.20, 1.17, .368, .063, .063, .063, 0, metal);
    shape(root, ball, 0xffe6ae, -.20, 1.17, .369, .052, .052, .011);
  }
  root.scale.setScalar(isPrefect ? 1 : 1.06);
  r.finish();
  return { root, animate(time, near) {
    arm.rotation.x = -.25 - .65 * near;
    arm.rotation.z = .10 + near * (.57 + Math.sin(time * 3.4) * .16);
    head.rotation.z = Math.sin(time * 1.3) * .03;
  }};
}

function nameSign(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 384; canvas.height = 84;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#28312c';
  ctx.beginPath(); ctx.roundRect(3, 3, 378, 78, 30); ctx.fill();
  ctx.strokeStyle = '#d7ba83'; ctx.lineWidth = 3; ctx.stroke();
  ctx.font = '600 40px "PingFang SC", "Microsoft YaHei", sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#fff3d9';
  ctx.fillText(name, 192, 43);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false }));
  sign.scale.set(2.05, .45, 1);
  sign.visible = false;
  return sign;
}

export function buildWelcomeParty(scene) {
  const group = new THREE.Group();
  group.name = 'Hogsmeade_Welcome_Party';
  scene.add(group);
  const people = cast.map((npc, index) => {
    const person = index ? railwayStaff(index === 1) : keeper();
    const { root } = person;
    root.name = 'NPC_' + npc.id;
    root.position.set(npc.x, platformHeight, npc.z);
    root.rotation.y = Math.atan2(82 - npc.x, -78 - npc.z);
    group.add(root);
    const sign = nameSign(npc.name);
    sign.position.set(npc.x, platformHeight + npc.height + .36, npc.z);
    group.add(sign);
    return { ...person, npc, sign, attention: 0, nextLine: 0, restYaw: root.rotation.y };
  });
  function nearest(position) {
    let closest = null, best = Infinity;
    for (const person of people) {
      const { npc } = person;
      const distance = Math.hypot(position.x - npc.x, position.z - npc.z);
      if (distance <= npc.distance && distance < best) { closest = person; best = distance; }
    }
    return closest;
  }
  return {
    group,
    nearby(position) {
      const person = nearest(position);
      return person?.npc ?? null;
    },
    talk(id) {
      const person = people.find(person => person.npc.id === id);
      if (!person) return null;
      const { name, lines } = person.npc;
      return { name, text: lines[person.nextLine++ % lines.length] };
    },
    blocks(x, z) {
      if (x < 80 || x > 84 || z > -72 || z < -91) return false;
      return people.some(({ npc }) => (x - npc.x) ** 2 + (z - npc.z) ** 2 < (npc.radius + .72) ** 2);
    },
    update(dt, time, position) {
      const closest = position ? nearest(position) : null;
      for (const [i, person] of people.entries()) {
        const { npc, root } = person;
        const engaged = person === closest;
        person.sign.visible = engaged;
        person.attention = THREE.MathUtils.damp(person.attention, engaged ? 1 : 0, 4, dt);
        const yaw = engaged ? Math.atan2(position.x - npc.x, position.z - npc.z) : person.restYaw;
        const delta = yaw - root.rotation.y;
        root.rotation.y += Math.atan2(Math.sin(delta), Math.cos(delta)) * (1 - Math.exp(-4 * dt));
        person.animate(time + i * 1.7, person.attention);
      }
    },
    reset() {
      for (const person of people) person.nextLine = 0;
    },
  };
}
