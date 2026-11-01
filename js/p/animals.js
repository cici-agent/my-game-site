// ===== 动物皮肤：四条腿的身体（兔子 / 熊猫 / 柯基 / 小恐龙 / 独角兽）+ 两条腿的小黄鸡 =====
// 和人物皮肤用同一套接口：{ root, rig, animate(dt, speed, air, sitting, pose), setDecor, skin, quad }
// 朝向 +Z。手上拿的东西放在背上；头上的戴在头顶；独角兽有彩虹羽毛翅膀，飞的时候张开扇动。
import * as THREE from 'three';

export const ANIMAL_KEYS = ['bunny', 'panda', 'corgi', 'dino', 'unicorn', 'chick'];
const RAINBOW = [0xff6b6b, 0xffa94d, 0xffd43b, 0x69db7c, 0x4dabf7, 0x748ffc, 0x9775fa];

// 羽毛：压扁的椭球，从根部白色渐变到尖端的颜色
const featherCache = {};
function featherGeo(tip) {
  if (featherCache[tip]) return featherCache[tip];
  const g = new THREE.SphereGeometry(1, 14, 10), p = g.attributes.position, cols = [];
  const w = new THREE.Color(0xffffff), c = new THREE.Color(tip), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) { const k = THREE.MathUtils.smoothstep((-p.getZ(i) + 1) / 2, .25, 1); tmp.copy(w).lerp(c, k); cols.push(tmp.r, tmp.g, tmp.b); }
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  return featherCache[tip] = g;
}
const featherMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, side: THREE.DoubleSide });

// 一只彩虹翅膀：做成“张开”的样子——翅膀骨往外伸（+X），羽毛往后拖（-Z），平放在 XZ 平面
// 张开 / 收起靠旋转：先绕 Z 轴上下扇（翅膀根部的前后方向），再绕 Y 轴往后收
function rainbowWing(H, side) {
  const pivot = new THREE.Group(); pivot.rotation.order = 'YZX';
  const wing = new THREE.Group(); pivot.add(wing);
  const SPAN = 1.7;
  const edge = t => new THREE.Vector3(t * SPAN, Math.sin(t * Math.PI) * .12, -t * t * .25);   // 翅膀骨：微微拱起、稍往后弯
  const feather = (t, b, L, W, tip) => {
    const m = new THREE.Mesh(featherGeo(tip), featherMat);
    m.scale.set(W, .03, L / 2); m.rotation.y = -b;
    const dir = new THREE.Vector3(Math.sin(b), 0, -Math.cos(b));
    m.position.copy(edge(t)).addScaledVector(dir, L / 2 - .06); m.position.y -= .01 * (L);
    wing.add(m);
  };
  // 外侧长飞羽：彩虹色，越往外越长、越往外斜
  RAINBOW.forEach((c, i) => { const k = i / 6; feather(.45 + k * .55, .15 + k * .75, .95 + k * .55, .15, c); });
  // 内侧次级飞羽：浅彩虹
  for (let i = 0; i < 6; i++) { const k = i / 5; feather(.05 + k * .45, .02 + k * .15, .8 + k * .1, .15, new THREE.Color(RAINBOW[i]).lerp(new THREE.Color(0xffffff), .55).getHex()); }
  // 覆羽：白色短羽毛盖在上面
  for (let i = 0; i < 8; i++) { const k = i / 7; const m = feather(.03 + k * .9, .1 + k * .5, .38 + k * .12, .13, 0xffffff); void m; }
  H.add(wing, new THREE.CapsuleGeometry(.07, SPAN * .9, 4, 8), H.M(0xffffff), [SPAN * .48, .08, -.08], null, [0, 0, Math.PI / 2]);
  if (side < 0) wing.scale.x = -1;
  wing.scale.multiplyScalar(.85);
  pivot.userData.side = side;
  return pivot;
}

// 四条腿动物的通用身体
function quadBody(H, o) {
  const root = new THREE.Group();
  const rig = { blink: [], ears: [], tails: [], decor: {}, legs: [], wings: [] };
  const body = new THREE.Group(); body.position.y = o.bodyY; root.add(body); rig.body = body;
  rig.torso = H.add(body, H.sph(1, 28, 20), H.M(o.color), [0, 0, 0], [o.bw, o.bh, o.bl]);
  // 腿：以胯部为轴；从胯部到地面
  const hipY = -o.bh * .35, L = o.bodyY + hipY;
  [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz], i) => {
    const hip = new THREE.Group(); hip.position.set(sx * o.legX, hipY, sz * o.legZ); body.add(hip);
    const lr = sz > 0 ? o.legR : (o.hindR || o.legR);
    H.add(hip, new THREE.CapsuleGeometry(lr, Math.max(.05, L - lr * 2), 4, 12), H.M(o.legColor || o.color), [0, -L / 2, 0]);
    hip.userData.L = L;
    rig.legs.push(hip);
  });
  rig.legL = rig.legs[0]; rig.legR = rig.legs[1]; rig.footY = -L;
  // 头
  const neck = new THREE.Group(); neck.position.set(0, o.headY, o.headZ); root.add(neck); rig.head = neck; rig.headBaseY = o.headY;
  const head = H.add(neck, H.sph(o.headR, 28, 20), H.M(o.headColor || o.color), [0, 0, 0]);
  rig.headTop = new THREE.Group(); rig.headTop.position.y = o.headR * .85; head.add(rig.headTop);
  // 挂东西的点：背上（背包类、手持类都放背上）、嘴边（雪球 / 泡泡从这里出来）
  rig.backMount = new THREE.Group(); rig.backMount.position.set(0, o.bh * .9, -o.bl * .05); body.add(rig.backMount);
  rig.handMount = new THREE.Group(); rig.handMount.position.set(o.bw * .55, o.bh * .85, -o.bl * .35); rig.handMount.rotation.z = -.35; body.add(rig.handMount);
  rig.handR = new THREE.Object3D(); rig.handR.position.set(0, -o.headR * .2, o.headR * 1.1); head.add(rig.handR);
  rig.tail = new THREE.Group(); rig.tail.position.set(0, o.bh * .25, -o.bl * .95); body.add(rig.tail); rig.tails.push(rig.tail);
  // 影子
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .25, depthWrite: false }));
  shadow.scale.set(o.bw * 1.3, o.bl * 1.25, 1); shadow.rotation.x = -Math.PI / 2; shadow.position.y = .02; root.add(shadow); rig.shadow = shadow;
  return { root, rig, body, head, L };
}
// 脚：爪子 / 蹄子 / 白袜子
function paws(H, rig, color, opts = {}) {
  rig.legs.forEach((hip, i) => {
    const L = hip.userData.L, front = i < 2;
    if (opts.hoof) {
      H.add(hip, H.sph(.16, 12, 8), H.M(0xffffff, { roughness: .9 }), [0, -L + .2, 0], [1.15, .6, 1.15]);
      H.add(hip, H.cyl(.15, .17, .16, 14), H.M(color), [0, -L + .08, .02]);
    } else {
      const pw = opts.pawR || .16;
      H.add(hip, H.sph(pw, 12, 10), H.M(color), [0, -L + pw * .55, pw * .35], [1.05, .65, 1.3]);
      if (opts.toes) [-1, 0, 1].forEach(k => H.add(hip, H.sph(pw * .28, 8, 6), H.M(opts.toes), [k * pw * .45, -L + pw * .3, pw * 1.05]));
    }
    if (opts.sock) H.add(hip, H.cyl(opts.legR * 1.08, opts.legR * 1.08, .28, 12), H.M(opts.sock), [0, -L + .3, 0]);
    void front;
  });
}

// ---------------- 各个动物 ----------------
const BUILD = {
  bunny(H) {
    const o = { color: 0xfdfcfd, bodyY: 1.0, bw: .5, bh: .48, bl: .68, legX: .26, legZ: .42, legR: .11, hindR: .12, headR: .5, headY: 1.62, headZ: .66 };
    const q = quadBody(H, o), { rig, body, head } = q, W = H.M(0xfdfcfd), pink = H.M(0xffc9de);
    // 后腿：大腿 + 长脚掌
    rig.legs.slice(2).forEach(hip => { H.add(hip, H.sph(.3, 14, 10), W, [0, -.12, .05], [.8, 1, 1.15]); H.add(hip, H.sph(.16, 12, 8), H.M(0xffdeeb), [0, -hip.userData.L + .07, .18], [1, .45, 2]); });
    rig.legs.slice(0, 2).forEach(hip => H.add(hip, H.sph(.13, 10, 8), W, [0, -hip.userData.L + .07, .06], [1, .6, 1.3]));
    H.add(body, H.sph(.32, 14, 10), H.M(0xffffff), [0, -.05, .5], [1, 1.1, .6]);      // 胸口一撮白毛
    // 耳朵
    [-1, 1].forEach(s => {
      const ear = new THREE.Group(); ear.position.set(s * .2, .38, -.06); ear.rotation.set(-.15, 0, -s * .14); head.add(ear);
      H.add(ear, new THREE.CapsuleGeometry(.12, .7, 4, 12), W, [0, .45, 0], [1, 1, .55]);
      H.add(ear, new THREE.CapsuleGeometry(.065, .55, 4, 10), pink, [0, .47, .045], [1, 1, .3]);
      rig.ears.push(ear);
    });
    H.face(head, .5, { eyeY: .06 });
    H.add(head, H.sph(.06, 10, 8), H.M(0xf06595), [0, -.05, .5], [1.3, .9, .8]);
    H.add(head, new THREE.BoxGeometry(.1, .08, .03), H.M(0xffffff), [0, -.17, .47]);
    // 毛球尾巴
    [[0, 0, 0, .2], [.1, .08, -.05, .13], [-.1, .06, -.04, .13]].forEach(([x, y, z, r]) => H.add(rig.tail, H.sph(r, 12, 10), W, [x, y, z]));
    return q;
  },
  panda(H) {
    const o = { color: 0xfafafa, legColor: 0x25282d, bodyY: 1.12, bw: .66, bh: .6, bl: .84, legX: .4, legZ: .48, legR: .2, headR: .58, headY: 1.82, headZ: .82 };
    const q = quadBody(H, o), { rig, body, head } = q, BL = H.M(0x25282d);
    H.add(body, H.sph(1, 24, 16), BL, [0, .02, .22], [o.bw * 1.02, o.bh * 1.02, .3]);   // 肩上的黑色一圈
    paws(H, rig, 0x25282d, { pawR: .22, toes: 0x495057 });
    [-1, 1].forEach(s => {
      const e = H.add(head, H.sph(.19, 14, 10), BL, [s * .4, .42, -.05]); H.add(e, H.sph(.09, 10, 8), H.M(0x495057), [0, 0, .1]);
      H.add(head, H.sph(.17, 14, 10), BL, [s * .21, .05, .47], [1, 1.3, .5], [0, 0, s * .5]);   // 眼圈
    });
    H.face(head, .58, { sclera: true, cheeks: true, eyeX: .21, eyeY: .05, eyeZ: .55, smileY: -.2, smileZ: .55 });
    H.add(head, H.sph(.24, 14, 10), H.M(0xffffff), [0, -.14, .44], [1.2, .8, .7]);
    H.add(head, H.sph(.08, 10, 8), BL, [0, -.06, .6], [1.4, .9, .8]);
    H.add(rig.tail, H.sph(.13, 10, 8), BL, [0, 0, 0]);
    return q;
  },
  corgi(H) {
    const o = { color: 0xf08c2e, bodyY: .95, bw: .44, bh: .42, bl: .9, legX: .24, legZ: .55, legR: .13, headR: .48, headY: 1.55, headZ: .9 };
    const q = quadBody(H, o), { rig, body, head } = q, cream = H.M(0xfff4e6), OR = H.M(0xf08c2e);
    H.add(body, H.sph(1, 20, 14), cream, [0, -.12, .05], [o.bw * .9, o.bh * .78, o.bl * .92]);    // 白肚子
    paws(H, rig, 0xfff4e6, { pawR: .15, sock: 0xfff4e6, legR: .13 });
    [[0, .05, -.8, .25], [.13, -.05, -.84, .18], [-.13, -.05, -.84, .18]].forEach(([x, y, z, r]) => H.add(body, H.sph(r, 12, 10), cream, [x, y, z]));   // 毛茸茸屁股
    // 项圈 + 骨头牌
    H.add(root(q), new THREE.TorusGeometry(.3, .045, 8, 24), H.M(0x4dabf7), [0, 1.3, .78], null, [Math.PI / 2 - .5, 0, 0]);
    H.add(root(q), H.cyl(.07, .07, .025, 12), H.M(0xffd43b, { metalness: .5 }), [0, 1.08, .98], null, [Math.PI / 2, 0, 0]);
    // 脸：橙色圆脸 + 白嘴套 + 额头一道白纹
    H.add(head, H.sph(.3, 16, 12), cream, [0, -.2, .3], [1.15, .8, 1]);
    H.add(head, H.sph(.1, 10, 8), cream, [0, .2, .4], [.5, 1.6, .5]);
    H.add(head, H.sph(.07, 10, 8), H.M(0x1b1b2a), [0, -.1, .6], [1.3, 1, 1]);
    H.add(head, H.sph(.06, 10, 8), H.M(0xff8787), [0, -.32, .5], [1, .5, 1.2]);
    H.face(head, .48, { eyeY: .08, eyeX: .2, eyeZ: .42, smileY: -.24, smileZ: .55 });
    [-1, 1].forEach(s => { const ear = H.add(head, H.cone(.17, .42, 4), OR, [s * .3, .45, -.02], null, [0, Math.PI / 4, -s * .3]); H.add(ear, H.cone(.1, .28, 4), H.M(0xffc9a3), [0, -.03, .05]); rig.ears.push(ear); });
    H.add(rig.tail, H.sph(.13, 10, 8), OR, [0, .05, 0], [1, 1, 1.3]);
    return q;
  },
  dino(H) {
    const o = { color: 0x51cf66, bodyY: 1.08, bw: .62, bh: .56, bl: .9, legX: .38, legZ: .5, legR: .2, hindR: .23, headR: .5, headY: 1.62, headZ: .98 };
    const q = quadBody(H, o), { rig, body, head } = q, G = H.M(0x51cf66), plate = H.M(0xff922b, { emissive: 0xff6b00, emissiveIntensity: .15 });
    H.add(body, H.sph(1, 20, 14), H.M(0xd8f5a2), [0, -.18, .08], [o.bw * .85, o.bh * .7, o.bl * .9]);
    [[.3, .25, .2, .1], [-.25, .3, -.1, .08], [.15, .38, -.4, .09], [-.35, .1, .35, .07]].forEach(([x, y, z, r]) => H.add(body, H.sph(r, 10, 8), H.M(0x2f9e44), [x * o.bw, y, z], [1, .5, 1]));
    paws(H, rig, 0x40c057, { pawR: .23, toes: 0xfff4e6 });
    // 背上的骨板
    [[.55, .3], [.25, .42], [-.08, .46], [-.4, .4], [-.68, .28]].forEach(([z, h]) => {
      const pl = H.add(body, H.cone(h * .55, h, 4), plate, [0, o.bh * .82 + h * .35, z * o.bl * .9]); pl.scale.set(.3, 1, 1);
    });
    // 尾巴 + 尖刺
    H.add(rig.tail, H.cone(.26, 1.1, 14), G, [0, -.05, -.45], null, [-Math.PI / 2 - .15, 0, 0]);
    [[-.55, .2], [-.8, .16]].forEach(([z, h]) => [-1, 1].forEach(s => H.add(rig.tail, H.cone(.05, h, 6), plate, [s * .12, .1, z], null, [0, 0, s * .8])));
    H.add(head, H.sph(.36, 16, 12), G, [0, -.18, .35], [1.1, .8, 1]);
    [-1, 1].forEach(s => H.add(head, H.sph(.035, 8, 6), H.M(0x1b1b2a), [s * .1, -.1, .7]));
    [-.12, .12].forEach(x => H.add(head, H.cone(.03, .07, 5), H.M(0xffffff), [x, -.36, .6], null, [Math.PI, 0, 0]));
    H.face(head, .5, { eyeY: .14, eyeX: .2, eyeZ: .4, smileY: -.3, smileZ: .62 });
    return q;
  },
  unicorn(H) {
    const o = { color: 0xfff0f6, bodyY: 1.5, bw: .48, bh: .45, bl: .82, legX: .25, legZ: .52, legR: .11, headR: .44, headY: 2.3, headZ: .95 };
    const q = quadBody(H, o), { rig, body, head } = q, PW = H.M(0xfff0f6);
    paws(H, rig, 0xf06595, { hoof: true });
    // 脖子
    H.add(q.root, new THREE.CapsuleGeometry(.27, .5, 4, 12), PW, [0, 1.95, .78], null, [.55, 0, 0]);
    // 头：长一点的马脸 + 粉色口鼻
    H.add(head, H.sph(.27, 16, 12), H.M(0xffdeeb), [0, -.18, .32], [1, .8, 1.1]);
    [-1, 1].forEach(s => H.add(head, H.sph(.035, 8, 6), H.M(0xe64980), [s * .09, -.12, .6]));
    H.face(head, .42, { eyeY: .08, eyeX: .19, eyeZ: .34, smileY: -.3, smileZ: .55 });
    const horn = H.add(head, H.cone(.075, .62, 16), H.M(0xffd43b, { emissive: 0xffc078, emissiveIntensity: .35, metalness: .4, roughness: .3 }), [0, .52, .16], null, [.3, 0, 0]);
    for (let i = 0; i < 4; i++) H.add(horn, new THREE.TorusGeometry(.065 - i * .013, .011, 6, 14), H.M(0xffffff), [0, -.2 + i * .13, 0], null, [Math.PI / 2, 0, 0]);
    [-1, 1].forEach(s => { const e = H.add(head, H.cone(.09, .24, 8), PW, [s * .2, .38, -.05], null, [0, 0, -s * .25]); rig.ears.push(e); });
    // 彩虹鬃毛：顺着脖子一串
    RAINBOW.forEach((c, i) => { const k = i / 6; H.add(q.root, H.sph(.14, 10, 8), H.M(c), [0, 2.42 - k * .62, .74 - k * .42], [.75, 1, 1]); });
    [0xff6b6b, 0xffd43b, 0x4dabf7].forEach((c, i) => H.add(head, H.sph(.1, 10, 8), H.M(c), [-.12 + i * .12, .34, .24]));
    // 彩虹尾巴：一缕一缕垂下来
    RAINBOW.forEach((c, i) => { const a = (i - 3) * .12; H.add(rig.tail, new THREE.CapsuleGeometry(.07, .75, 4, 8), H.M(c), [Math.sin(a) * .2, -.42, -.12 - Math.abs(a) * .2], null, [.35, 0, a]); });
    // 屁股上的星星
    const st = H.star3D(.13, 0xffd43b); st.position.set(o.bw * .92, .12, -.5); st.rotation.y = Math.PI / 2; body.add(st);
    const st2 = st.clone(); st2.position.x *= -1; st2.rotation.y = -Math.PI / 2; body.add(st2);
    // 翅膀
    [-1, 1].forEach(s => { const w = rainbowWing(H, s); w.position.set(s * o.bw * .7, o.bh * .78, o.bl * .32); body.add(w); rig.wings.push(w); });
    return q;
  },
};
const root = q => q.root;

// 小黄鸡：两条腿、圆滚滚
function buildChick(H) {
  const rootG = new THREE.Group(), rig = { blink: [], ears: [], tails: [], decor: {}, legs: [], wings: [] };
  const body = new THREE.Group(); body.position.y = 1.0; rootG.add(body); rig.body = body;
  const Y = H.M(0xffd43b), OR = H.M(0xff922b);
  H.add(body, H.sph(.62, 28, 20), Y, [0, 0, 0], [1, .95, 1.05]);
  H.add(body, H.sph(.4, 16, 12), H.M(0xfff3bf), [0, -.15, .32], [1, 1, .55]);
  [-1, 1].forEach(s => {
    const hip = new THREE.Group(); hip.position.set(s * .2, -.5, 0); body.add(hip);
    H.add(hip, H.cyl(.045, .045, .5, 8), OR, [0, -.25, 0]);
    [-.5, 0, .5].forEach(a => H.add(hip, new THREE.CapsuleGeometry(.03, .14, 3, 6), OR, [Math.sin(a) * .08, -.5, .06 + Math.cos(a) * .06], null, [Math.PI / 2, 0, -a]));
    rig.legs.push(hip);
  });
  rig.legL = rig.legs[0]; rig.legR = rig.legs[1]; rig.footY = -.5;
  // 翅膀（会扇）
  [-1, 1].forEach(s => { const w = new THREE.Group(); w.position.set(s * .58, .08, -.02); body.add(w); H.add(w, H.sph(.26, 14, 10), H.M(0xfcc419), [s * .04, -.12, -.05], [.35, .9, 1.1]); w.userData.side = s; rig.wings.push(w); });
  // 尾羽
  rig.tail = new THREE.Group(); rig.tail.position.set(0, .15, -.6); body.add(rig.tail); rig.tails.push(rig.tail);
  [-1, 0, 1].forEach(k => H.add(rig.tail, H.cone(.08, .3, 6), H.M(0xfcc419), [k * .1, .05, -.08], null, [-Math.PI / 2 - .5, 0, k * .4]));
  // 头
  const neck = new THREE.Group(); neck.position.set(0, 1.72, .22); rootG.add(neck); rig.head = neck; rig.headBaseY = 1.72;
  const head = H.add(neck, H.sph(.45, 24, 18), Y, [0, 0, 0]);
  H.add(head, H.cone(.12, .26, 10), OR, [0, -.04, .48], null, [Math.PI / 2, 0, 0]);
  H.add(head, H.cone(.09, .16, 10), H.M(0xe8590c), [0, -.12, .44], null, [Math.PI / 2 + .3, 0, 0]);
  [[-.06, .25], [.06, -.25]].forEach(([x, rz]) => H.add(head, new THREE.TorusGeometry(.09, .03, 6, 12, Math.PI * 1.4), H.M(0xfcc419), [x, .5, 0], null, [0, Math.PI / 2, rz]));
  H.face(head, .45, { eyeY: .08, eyeX: .2, eyeZ: .38, smile: false });
  rig.headTop = new THREE.Group(); rig.headTop.position.y = .4; head.add(rig.headTop);
  rig.backMount = new THREE.Group(); rig.backMount.position.set(0, .3, -.45); body.add(rig.backMount);
  rig.handMount = new THREE.Group(); rig.handMount.position.set(.5, .35, -.2); rig.handMount.rotation.z = -.4; body.add(rig.handMount);
  rig.handR = new THREE.Object3D(); rig.handR.position.set(0, -.05, .55); head.add(rig.handR);
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.65, 24), new THREE.MeshBasicMaterial({ color: 0, transparent: true, opacity: .25, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .02; rootG.add(shadow); rig.shadow = shadow;
  return { root: rootG, rig, body, head, biped: true };
}

export function buildAnimal(skinKey, decor, H) {
  const q = skinKey === 'chick' ? buildChick(H) : BUILD[skinKey](H);
  const { root: rootG, rig } = q;
  rootG.traverse(m => { if (m.isMesh) m.castShadow = false; });
  const bodyY = rig.body.position.y;

  function setDecor(slot, key) {
    const old = rig.decor[slot]; if (old) old.group.parent && old.group.parent.remove(old.group);
    rig.decor[slot] = null;
    if (!key) return;
    const d = H.buildDecor(key); rig.decor[slot] = d;
    if (slot === 'hand') { d.group.scale.setScalar(.8); rig.handMount.add(d.group); }
    else if (slot === 'head') { if (key === 'catears') d.group.position.y = -.08; rig.headTop.add(d.group); }
    else if (slot === 'back') {
      if (key === 'cape') { d.group.rotation.x = -1.3; d.group.position.set(0, .05, .35); }        // 披风平铺在背上
      if (key === 'wings') { d.group.position.set(0, .05, 0); d.group.scale.setScalar(.85); }
      rig.backMount.add(d.group);
    }
  }
  ['hand', 'head', 'back'].forEach(s => decor[s] && setDecor(s, decor[s]));

  let phase = 0, time = 0, wingOpen = 0;
  function animate(dt, speed, air, sitting, pose) {
    time += dt;
    rig.blink.forEach((b, i) => b.visible = Math.sin(time * 4 + i * 1.7) > -.3);
    rig.ears.forEach((e, i) => e.rotation.x = (e.userData.rx0 ?? (e.userData.rx0 = e.rotation.x)) + Math.sin(time * 3 + i) * .06 - speed * .2);
    rig.tails.forEach(tl => tl.rotation.y = Math.sin(time * (4 + speed * 6)) * .35);
    Object.values(rig.decor).forEach(d => d && d.update && d.update(time, speed));
    const flying = pose === 'fly';
    // 翅膀：飞的时候张开、上下扇；平时收在身体两侧
    wingOpen += ((flying ? 1 : 0) - wingOpen) * Math.min(1, dt * 6);
    rig.wings.forEach(w => {
      const s = w.userData.side;
      if (q.biped) { w.rotation.z = s * (air || flying ? .4 + Math.sin(time * 18) * .6 : Math.sin(time * 2) * .05); return; }
      // 收起：翅膀往后折、平贴在背上；张开：往两边伸开，上下扇
      const flap = Math.sin(time * 8) * .6 + .3;
      const ry = THREE.MathUtils.lerp(1.45, .2, wingOpen), rz = THREE.MathUtils.lerp(.12, flap, wingOpen);
      w.rotation.y = s * ry; w.rotation.z = s * rz;
      w.scale.setScalar(THREE.MathUtils.lerp(.68, 1, wingOpen));        // 收起来时小一点，不会拖到尾巴后面
    });
    let legs = [0, 0, 0, 0], bob = 0;
    if (sitting) { legs = q.biped ? [-1.2, -1.2] : [-1.25, -1.25, 1.25, 1.25]; rig.body.position.y = bodyY * .62; }
    else if (flying) { legs = q.biped ? [.5, .5] : [-.9, -.9, .9, .9]; rig.body.position.y = bodyY; }
    else if (pose === 'skate') { rig.body.position.y = bodyY; }
    else if (air) { legs = q.biped ? [.4, -.3] : [-.6, -.6, .6, .6]; rig.body.position.y = bodyY; }
    else {
      phase += dt * (5 + speed * 9);
      const s = Math.sin(phase) * .7 * speed;
      legs = q.biped ? [s * 1.1, -s * 1.1] : [s, -s, -s, s];          // 对角线两条腿一起迈
      bob = Math.abs(Math.sin(phase)) * .06 * speed;
      rig.body.position.y = bodyY + bob;
    }
    rig.legs.forEach((l, i) => l.rotation.x += (legs[i] - l.rotation.x) * Math.min(1, dt * 14));
    rig.head.position.y = rig.headBaseY + bob + (sitting ? -(bodyY * .38) : 0);
    rig.head.rotation.x = Math.sin(time * 1.5) * .04 + (flying ? -.15 : 0);
  }
  return { root: rootG, rig, animate, setDecor, skin: skinKey, quad: !q.biped, animal: true, height: 2.4 };
}
