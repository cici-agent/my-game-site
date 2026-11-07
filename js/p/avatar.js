// ===== 游乐园里的人物形象：12 款皮肤 + 装饰品 + 宠物 =====
// 统一的 Q 版骨架（大头、短身子），朝向 +Z。皮肤换颜色和身体部件，装饰挂在手 / 头 / 背上。
import * as THREE from 'three';
import { buildAnimal, ANIMAL_KEYS } from './animals.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .55, ...o });
const METAL = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .32, metalness: .35, ...o });
const GLOW = (color, o = {}) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.2, roughness: .4, ...o });
const SKIN_TONE = 0xffd9b8, BLACK = 0x1b1b2a;
const RAINBOW = [0xff6b6b, 0xffa94d, 0xffd43b, 0x69db7c, 0x4dabf7, 0x9775fa];

function add(parent, geo, mat, p = [0, 0, 0], s = null, r = null) {
  const m = new THREE.Mesh(geo, mat); m.position.set(...p);
  if (s) m.scale.set(...s); if (r) m.rotation.set(...r);
  parent.add(m); return m;
}
const sph = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const cone = (r, h, n = 16) => new THREE.ConeGeometry(r, h, n);
const cyl = (a, b, h, n = 16, hs = 1, open = false) => new THREE.CylinderGeometry(a, b, h, n, hs, open);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
let _glowTex;
function glowSprite(color, size) {
  _glowTex = _glowTex || canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.4, 'rgba(255,255,255,.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: _glowTex, color, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  s.scale.setScalar(size); return s;
}
function starShape(R = 1, r = .45, n = 5) {
  const s = new THREE.Shape();
  for (let i = 0; i <= n * 2; i++) { const a = i / (n * 2) * Math.PI * 2 + Math.PI / 2, rr = i % 2 ? r : R; i ? s.lineTo(Math.cos(a) * rr, Math.sin(a) * rr) : s.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); }
  return s;
}
const star3D = (size, color, mat) => { const g = new THREE.ExtrudeGeometry(starShape(size, size * .45), { depth: size * .3, bevelEnabled: true, bevelSize: size * .08, bevelThickness: size * .08, bevelSegments: 1 }); g.center(); return new THREE.Mesh(g, mat || M(color, { emissive: color, emissiveIntensity: .4 })); };

// ---------- 脸 ----------
function face(head, r, o = {}) {
  const white = M(0xffffff, { roughness: .2 }), black = M(o.eyeColor || BLACK, { roughness: .3 });
  const ey = o.eyeY ?? r * .08, ex = o.eyeX ?? r * .36, ez = o.eyeZ ?? r * .9;
  [-1, 1].forEach(s => {
    if (o.sclera) add(head, sph(r * .22, 12, 10), white, [s * ex, ey, ez - r * .04], [1, 1.2, .5]);
    add(head, sph(r * .17, 12, 10), black, [s * ex, ey, ez], [1, 1.25, .6]);
    add(head, sph(r * .06, 8, 6), white, [s * ex + r * .05, ey + r * .07, ez + r * .08]);
    if (o.cheeks !== false) add(head, sph(r * .12, 10, 8), M(0xff9aa2, { transparent: true, opacity: .75 }), [s * r * .58, -r * .18, r * .78], [1, .6, .4]);
  });
  if (o.smile !== false) {
    const sm = add(head, new THREE.TorusGeometry(r * .14, r * .03, 6, 12, Math.PI), black, [0, o.smileY ?? -r * .2, o.smileZ ?? r * .93]);
    sm.rotation.z = Math.PI;
  }
}

// ---------- 皮肤定义 ----------
// 每款：衣服 / 裤子 / 鞋 / 头 / 头发颜色，外加 extra(ctx) 往身上加专属部件
export const SKINS = {
  explorer: { shirt: 0xff6b35, pants: 0xc8a165, shoes: 0x5a3b22, head: SKIN_TONE, hair: 0x4a2e1f, belt: 0x5a3b22, extra: explorerExtra },
  chef:     { shirt: 0xf8f9fa, pants: 0x343a40, shoes: 0x212529, head: SKIN_TONE, hair: 0x6b3e26, belt: 0xe9ecef, extra: chefExtra },
  astro:    { shirt: 0xf1f3f5, pants: 0xe9ecef, shoes: 0x868e96, head: SKIN_TONE, hair: 0x2b1d14, belt: 0xff922b, extra: astroExtra },
  knight:   { shirt: 0xc5ccd6, pants: 0x9aa3ad, shoes: 0x6c757d, head: SKIN_TONE, hair: 0xd9a441, belt: 0xf2c94c, metal: true, extra: knightExtra },
  wizard:   { shirt: 0x6741d9, pants: 0x5f3dc4, shoes: 0x3b2a8c, head: SKIN_TONE, hair: 0xb08968, belt: 0xffd43b, extra: wizardExtra },
  chick:    { shirt: 0xffd43b, pants: 0xff922b, shoes: 0xff922b, head: 0xffd43b, hand: 0xffd43b, belt: null, animal: true, thinLegs: true, extra: chickExtra },
  bunny:    { shirt: 0xfdfcfd, pants: 0xfdfcfd, shoes: 0xffdeeb, head: 0xfdfcfd, hand: 0xfdfcfd, belt: null, animal: true, extra: bunnyExtra },
  panda:    { shirt: 0xfafafa, pants: 0x212529, shoes: 0x212529, head: 0xfafafa, hand: 0x212529, sleeve: 0x212529, belt: null, animal: true, face: { sclera: true }, extra: pandaExtra },
  corgi:    { shirt: 0xf08c2e, pants: 0xf08c2e, shoes: 0xfff4e6, head: 0xf08c2e, hand: 0xfff4e6, belt: null, animal: true, extra: corgiExtra },
  dino:     { shirt: 0x51cf66, pants: 0x40c057, shoes: 0x2f9e44, head: 0x51cf66, hand: 0x51cf66, belt: null, animal: true, extra: dinoExtra },
  robot:    { shirt: 0xadb5bd, pants: 0x868e96, shoes: 0x495057, head: 0xced4da, hand: 0x495057, belt: 0x495057, metal: true, robot: true, extra: robotExtra },
  // 小农民：菜鸟家园里的默认样子（不在商店里卖）
  farmer:   { shirt: 0xd9413a, pants: 0x3b6fb6, shoes: 0x6b4226, head: SKIN_TONE, hair: 0x7a4a26, belt: null, extra: farmerExtra },
  unicorn:  { shirt: 0xfff0f6, pants: 0xfff0f6, shoes: 0xf783ac, head: 0xfff0f6, hand: 0xfff0f6, belt: null, animal: true, extra: unicornExtra },
};

// ---------- 各皮肤专属部件 ----------
function hatGroup(ctx) { const g = new THREE.Group(); ctx.head.add(g); ctx.rig.hat = g; return g; }

function explorerExtra(ctx) {
  const { r } = ctx, h = hatGroup(ctx), tan = M(0xe8c98a);
  add(h, cyl(r * 1.25, r * 1.25, r * .08, 24), tan, [0, r * .55, 0]);
  add(h, new THREE.SphereGeometry(r * .82, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), tan, [0, r * .55, 0]);
  add(h, cyl(r * .83, r * .83, r * .14, 20), M(0x8b5a2b), [0, r * .62, 0]);
  const bp = add(ctx.root, new THREE.BoxGeometry(.55, .6, .28), M(0x3f8f5a), [0, 1.12, -.42]);
  add(bp, new THREE.BoxGeometry(.56, .22, .3), M(0x2f6b43), [0, .2, -.01]);
}
function farmerExtra(ctx) {
  const { r, root, rig, body } = ctx;
  // 红白格子衬衫（身体 + 袖子换成格子布）
  const plaid = canvasTex(64, 64, (g, w) => {
    g.fillStyle = '#d9413a'; g.fillRect(0, 0, w, w);
    g.fillStyle = 'rgba(255,255,255,.55)'; [8, 40].forEach(x => { g.fillRect(x, 0, 8, w); g.fillRect(0, x, w, 8); });
    g.fillStyle = 'rgba(90,10,10,.35)'; [24, 56].forEach(x => { g.fillRect(x, 0, 3, w); g.fillRect(0, x, w, 3); });
  });
  plaid.wrapS = plaid.wrapT = THREE.RepeatWrapping; plaid.repeat.set(3, 2);
  const shirtM = M(0xffffff, { map: plaid, roughness: .8 });
  body.material = shirtM;
  [rig.armL, rig.armR].forEach(a => a.children[0] && (a.children[0].material = shirtM));
  // 牛仔背带裤：下半身裤腰 + 胸前护片 + 两条背带 + 金色扣子
  const denim = M(0x3b6fb6, { roughness: .85 }), stitch = M(0xf2c94c, { roughness: .5 });
  add(root, cyl(.425, .43, .36, 24), denim, [0, .7, 0]);
  add(root, cyl(.418, .418, .44, 24, 1, true), denim, [0, 1.06, 0]).geometry =
    new THREE.CylinderGeometry(.418, .418, .44, 24, 1, true, -1.05, 2.1);
  add(root, new THREE.BoxGeometry(.24, .16, .03), M(0x2f5a96), [0, 1.0, .41]);   // 胸前小口袋
  [-1, 1].forEach(sd => {
    add(root, new THREE.BoxGeometry(.09, .62, .04), denim, [sd * .2, 1.45, .3], null, [-.55, 0, 0]);
    add(root, new THREE.BoxGeometry(.09, .7, .04), denim, [sd * .2, 1.4, -.32], null, [.5, 0, 0]);
    add(root, sph(.05, 10, 8), stitch, [sd * .2, 1.26, .41]);
  });
  // 红色小领巾
  add(root, new THREE.TorusGeometry(.27, .06, 8, 20), M(0xc92a2a), [0, 1.58, .02], null, [Math.PI / 2, 0, 0]);
  // 大草帽：宽帽檐 + 帽顶 + 红色帽带 + 一根小麦穗
  const straw = canvasTex(128, 32, (g, w, h) => {
    g.fillStyle = '#e9c46a'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { g.strokeStyle = i % 2 ? 'rgba(160,110,40,.35)' : 'rgba(255,240,190,.5)'; g.beginPath(); g.moveTo(i * 4, 0); g.lineTo(i * 4 + 6, h); g.stroke(); }
    for (let y = 4; y < h; y += 6) { g.strokeStyle = 'rgba(150,100,30,.3)'; g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
  });
  straw.wrapS = straw.wrapT = THREE.RepeatWrapping; straw.repeat.set(4, 1);
  const strawM = M(0xffffff, { map: straw, roughness: .9 });
  const h = hatGroup(ctx);
  add(h, cyl(r * 1.55, r * 1.6, r * .07, 32), strawM, [0, r * .55, 0]);
  add(h, new THREE.TorusGeometry(r * 1.55, r * .05, 6, 32), strawM, [0, r * .55, 0], null, [Math.PI / 2, 0, 0]);
  add(h, cyl(r * .78, r * .86, r * .55, 24), strawM, [0, r * .85, 0]);
  add(h, sph(r * .78, 20, 8), strawM, [0, r * 1.1, 0], [1, .35, 1]);
  add(h, cyl(r * .87, r * .87, r * .14, 24), M(0xc92a2a), [0, r * .66, 0]);
  const wheat = new THREE.Group(); wheat.position.set(r * .8, r * .75, r * .2); wheat.rotation.z = -.5; h.add(wheat);
  add(wheat, cyl(.012, .012, .35, 4), M(0xd4a73a), [0, .17, 0]);
  for (let i = 0; i < 5; i++) [-1, 1].forEach(sd => add(wheat, sph(.03, 6, 4), M(0xe0b44a), [sd * .025, .26 + i * .035, 0], [1, 1.6, 1]));
}
function chefExtra(ctx) {
  const { r } = ctx, h = hatGroup(ctx), white = M(0xffffff, { roughness: .8 });
  add(h, cyl(r * .72, r * .68, r * .7, 20), white, [0, r * .95, 0]);
  [[0, 0], [.35, .2], [-.35, .2], [.2, -.32], [-.2, -.32], [0, .38]].forEach(([x, z]) => add(h, sph(r * .42), white, [x * r, r * 1.38, z * r]));
  // 红色领巾 + 双排扣
  add(ctx.root, new THREE.TorusGeometry(.3, .07, 8, 20), M(0xe03131), [0, 1.52, .02], null, [Math.PI / 2, 0, 0]);
  add(ctx.root, cone(.12, .22, 4), M(0xe03131), [0, 1.38, .36], null, [Math.PI, 0, 0]);
  [-1, 1].forEach(s => [1.2, 1.02].forEach(y => add(ctx.root, sph(.04), M(0x868e96), [s * .13, y, .4])));
}
function astroExtra(ctx) {
  const { r } = ctx;
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xbfe3ff, transparent: true, opacity: .28, roughness: .05, metalness: .1, depthWrite: false });
  const helm = add(ctx.head, sph(r * 1.32, 28, 20), glass, [0, -r * .05, 0]); helm.renderOrder = 2;
  add(ctx.head, new THREE.TorusGeometry(r * 1.05, r * .12, 10, 28), M(0xdee2e6), [0, -r * .9, 0], null, [Math.PI / 2, 0, 0]);
  add(ctx.head, cyl(r * .05, r * .05, r * .5), M(0x868e96), [r * .9, r * .9, 0], null, [0, 0, -.4]);
  ctx.rig.blink.push(add(ctx.head, sph(r * .09), GLOW(0xff6b6b), [r * 1.0, r * 1.15, 0]));
  const pack = add(ctx.root, new THREE.BoxGeometry(.66, .74, .32), M(0xf8f9fa), [0, 1.14, -.45]);
  [-1, 1].forEach(s => add(pack, cyl(.1, .1, .6, 12), M(0xced4da), [s * .22, 0, -.14]));
  const panel = add(ctx.root, new THREE.BoxGeometry(.36, .26, .06), M(0x495057), [0, 1.13, .41]);
  [[0xff6b6b, -.1], [0x51cf66, 0], [0x4dabf7, .1]].forEach(([c, x]) => add(panel, sph(.035), GLOW(c), [x, .04, .04]));
  add(panel, new THREE.BoxGeometry(.24, .04, .02), GLOW(0xffd43b), [0, -.07, .03]);
  [-1, 1].forEach(s => add(ctx.root, new THREE.BoxGeometry(.18, .12, .02), M(0xff922b), [s * .5, 1.42, 0], null, [0, s * Math.PI / 2, 0]));
}
function knightExtra(ctx) {
  const { r } = ctx, h = hatGroup(ctx), steel = METAL(0xd0d6de);
  ctx.rig.hair && (ctx.rig.hair.visible = false);
  add(h, new THREE.SphereGeometry(r * 1.08, 24, 16, 0, Math.PI * 2, 0, Math.PI * .55), steel, [0, r * .02, 0]);
  add(h, cyl(r * 1.09, r * 1.09, r * .16, 24, 1, true), METAL(0xf2c94c), [0, r * .02, 0]);
  add(h, new THREE.BoxGeometry(r * .1, r * .3, r * .12), steel, [0, r * .5, r * .98]);
  for (let i = 0; i < 5; i++) add(h, sph(r * .2, 10, 8), M(0xe03131), [0, r * (1.15 + Math.sin(i / 4 * Math.PI) * .2), r * (.4 - i * .32)], [1, 1.4, 1.1]);
  // 盾（左手）
  const sh = new THREE.Group(); sh.position.set(-.16, -.4, .14); sh.rotation.y = -.4; ctx.rig.armL.add(sh);
  const shield = new THREE.Shape(); shield.moveTo(-.32, .34); shield.lineTo(.32, .34); shield.lineTo(.32, 0); shield.quadraticCurveTo(.3, -.3, 0, -.45); shield.quadraticCurveTo(-.3, -.3, -.32, 0); shield.closePath();
  const sg = new THREE.ExtrudeGeometry(shield, { depth: .06, bevelEnabled: true, bevelSize: .03, bevelThickness: .03, bevelSegments: 1 });
  add(sh, sg, M(0x1c7ed6), [0, 0, 0], null, [0, -Math.PI / 2, 0]);
  add(sh, new THREE.BoxGeometry(.04, .6, .1), METAL(0xf2c94c), [-.06, 0, 0]);
  add(sh, new THREE.BoxGeometry(.04, .1, .5), METAL(0xf2c94c), [-.06, .1, 0]);
  [-1, 1].forEach(s => add(ctx.root, sph(.2, 14, 10), steel, [s * .5, 1.42, 0], [1.1, .7, 1]));
  add(ctx.root, new THREE.BoxGeometry(.16, .3, .05), M(0xe03131), [0, 1.08, .42]);
}
function wizardExtra(ctx) {
  const { r } = ctx, h = hatGroup(ctx), purple = M(0x5f3dc4), gold = M(0xffd43b, { emissive: 0xffd43b, emissiveIntensity: .35 });
  add(h, cyl(r * 1.35, r * 1.35, r * .08, 28), purple, [0, r * .58, 0]);
  const tip = add(h, cone(r * .8, r * 1.9, 24), purple, [0, r * 1.5, -r * .1], null, [-.18, 0, 0]);
  add(h, cyl(r * .82, r * .82, r * .16, 24), gold, [0, r * .7, 0]);
  [[.3, 1.2, .55], [-.35, 1.6, .4], [.05, 2.0, .3]].forEach(([x, y, z]) => { const s = star3D(r * .14, 0xffd43b, gold); s.position.set(x * r, y * r, z * r); h.add(s); });
  // 长袍下摆
  add(ctx.root, cyl(.42, .62, .7, 24, 1, true), M(0x6741d9, { side: THREE.DoubleSide }), [0, .62, 0]);
  add(ctx.root, new THREE.TorusGeometry(.62, .03, 6, 32), gold, [0, .27, 0], null, [Math.PI / 2, 0, 0]);
  [[.2, 1.15], [-.25, .9], [.28, .55], [-.1, .45]].forEach(([x, y]) => { const s = star3D(.06, 0xffd43b, gold); s.position.set(x, y, Math.sqrt(Math.max(.01, (y > .8 ? .17 : .3) - x * x)) + .02); ctx.root.add(s); });
}
function chickExtra(ctx) {
  const { r, head } = ctx, orange = M(0xff922b), yellow = M(0xffd43b);
  add(head, cone(r * .2, r * .35, 12), orange, [0, -r * .05, r * 1.0], null, [Math.PI / 2, 0, 0]);
  [[-0.15, .3], [0, 0], [.15, -.3]].forEach(([x, rz]) => add(head, cone(r * .1, r * .45, 8), yellow, [x * r, r * 1.05, 0], null, [0, 0, rz]));
  ctx.body.scale.set(1.2, 1, 1.15);
  // 翅膀代替手臂
  ['armL', 'armR'].forEach((k, i) => { ctx.rig[k].children.forEach(c => c.visible = false); add(ctx.rig[k], sph(.2, 12, 10), yellow, [0, -.25, 0], [.45, 1.3, .9]); });
  add(ctx.root, sph(.18, 10, 8), yellow, [0, .95, -.48], [1.2, .7, 1]);
}
function bunnyExtra(ctx) {
  const { r, head } = ctx, white = M(0xfdfcfd), pink = M(0xffc9de);
  [-1, 1].forEach(s => {
    const ear = new THREE.Group(); ear.position.set(s * r * .35, r * .8, -r * .1); ear.rotation.z = -s * .15; head.add(ear);
    add(ear, new THREE.CapsuleGeometry(r * .2, r * 1.1, 4, 12), white, [0, r * .7, 0], [1, 1, .55]);
    add(ear, new THREE.CapsuleGeometry(r * .11, r * .9, 4, 10), pink, [0, r * .72, r * .07], [1, 1, .3]);
    ctx.rig.ears.push(ear);
  });
  add(head, sph(r * .1), M(0xf06595), [0, -r * .05, r * 1.0], [1.2, .9, .8]);
  add(head, new THREE.BoxGeometry(r * .2, r * .14, r * .05), M(0xffffff), [0, -r * .3, r * .94]);
  add(ctx.root, sph(.2, 12, 10), white, [0, .85, -.45]);
  add(ctx.root, sph(.26, 14, 10), M(0xffe3ee), [0, 1.0, .3], [1, 1.2, .45]);
}
function pandaExtra(ctx) {
  const { r, head } = ctx, black = M(0x212529);
  [-1, 1].forEach(s => {
    add(head, sph(r * .28, 14, 10), black, [s * r * .7, r * .78, -r * .05]);
    add(head, sph(r * .25, 14, 10), black, [s * r * .36, r * .06, r * .8], [1, 1.3, .5], [0, 0, s * .5]);
  });
  add(head, sph(r * .12), black, [0, -r * .12, r * .98], [1.3, .9, .8]);
  add(ctx.root, cyl(.43, .43, .3, 20), black, [0, 1.42, 0]);
  add(ctx.root, sph(.12), black, [0, .85, -.44]);
}
function corgiExtra(ctx) {
  const { r, head } = ctx, orange = M(0xf08c2e), cream = M(0xfff4e6);
  [-1, 1].forEach(s => {
    const ear = add(head, cone(r * .3, r * .7, 4), orange, [s * r * .55, r * .95, -r * .05], null, [0, Math.PI / 4, s * .35]);
    add(ear, cone(r * .17, r * .45, 4), M(0xffc9a3), [0, -r * .05, r * .08]);
  });
  add(head, sph(r * .42, 16, 12), cream, [0, -r * .25, r * .62], [1, .75, .9]);
  add(head, sph(r * .12), M(BLACK), [0, -r * .08, r * 1.0]);
  add(head, cone(r * .5, r * .8, 3), cream, [0, r * .35, r * .82], [1, 1, .25], [0, 0, Math.PI]);
  add(ctx.root, sph(.28, 14, 10), cream, [0, 1.0, .3], [1, 1.25, .45]);
  const tail = add(ctx.root, sph(.18, 12, 10), orange, [0, .95, -.48], [1, 1, 1.4]); ctx.rig.tails.push(tail);
}
function dinoExtra(ctx) {
  const { r, head } = ctx, green = M(0x51cf66), belly = M(0xd8f5a2), spike = M(0xff922b);
  add(head, sph(r * .55, 16, 12), green, [0, -r * .25, r * .6], [1.15, .8, 1]);
  [-1, 1].forEach(s => add(head, sph(r * .05), M(BLACK), [s * r * .2, -r * .12, r * 1.12]));
  for (let i = 0; i < 4; i++) add(head, cone(r * .14, r * .35, 6), spike, [0, r * (1 - i * .06), r * (.3 - i * .3)], null, [-.3 - i * .25, 0, 0]);
  add(ctx.root, sph(.28, 14, 10), belly, [0, 1.0, .3], [1, 1.3, .45]);
  for (let i = 0; i < 4; i++) add(ctx.root, cone(.1, .22, 6), spike, [0, 1.4 - i * .2, -.4], null, [-.6, 0, 0]);
  const tail = new THREE.Group(); tail.position.set(0, .82, -.35); ctx.root.add(tail); ctx.rig.tails.push(tail);
  add(tail, cone(.24, 1.0, 14), green, [0, -.1, -.45], null, [-Math.PI / 2 - .35, 0, 0]);
  [0, 1].forEach(i => add(tail, cone(.07, .16, 6), spike, [0, .1 - i * .15, -.25 - i * .35], null, [-.4, 0, 0]));
}
function robotExtra(ctx) {
  const { r, head } = ctx;
  head.geometry.dispose(); head.geometry = new THREE.BoxGeometry(r * 1.8, r * 1.5, r * 1.6, 2, 2, 2);
  add(head, new THREE.BoxGeometry(r * 1.4, r * .85, r * .1), M(0x1b2433, { roughness: .2 }), [0, 0, r * .8]);
  [-1, 1].forEach(s => {
    add(head, new THREE.BoxGeometry(r * .3, r * .2, r * .05), GLOW(0x3ee8ff), [s * r * .33, r * .1, r * .87]);
    add(head, cyl(r * .2, r * .2, r * .2, 14), METAL(0x868e96), [s * r * .95, 0, 0], null, [0, 0, Math.PI / 2]);
  });
  add(head, new THREE.BoxGeometry(r * .5, r * .06, r * .05), GLOW(0x3ee8ff), [0, -r * .2, r * .87]);
  add(head, cyl(r * .04, r * .04, r * .5), METAL(0x868e96), [0, r * 1.0, 0]);
  ctx.rig.blink.push(add(head, sph(r * .12), GLOW(0xff4d4d), [0, r * 1.28, 0]));
  const panel = add(ctx.root, new THREE.BoxGeometry(.42, .3, .06), M(0x343a40), [0, 1.12, .41]);
  [0xff6b6b, 0xffd43b, 0x51cf66].forEach((c, i) => ctx.rig.blink.push(add(panel, sph(.04), GLOW(c), [-.12 + i * .12, .05, .04])));
  add(panel, new THREE.BoxGeometry(.3, .04, .02), GLOW(0x3ee8ff), [0, -.07, .03]);
  [-1, 1].forEach(s => add(ctx.root, sph(.15, 12, 10), METAL(0x6c757d), [s * .5, 1.33, 0]));
}
function unicornExtra(ctx) {
  const { r, head } = ctx;
  const horn = new THREE.Mesh(cone(r * .15, r * .9, 16), M(0xffd43b, { emissive: 0xffc078, emissiveIntensity: .35, metalness: .4, roughness: .3 }));
  horn.position.set(0, r * 1.15, r * .45); horn.rotation.x = .35; head.add(horn);
  for (let i = 0; i < 3; i++) add(horn, new THREE.TorusGeometry(r * (.12 - i * .03), r * .02, 6, 16), M(0xffffff), [0, -r * .25 + i * r * .22, 0], null, [Math.PI / 2, 0, 0]);
  [-1, 1].forEach(s => add(head, cone(r * .18, r * .45, 8), M(0xfff0f6), [s * r * .5, r * .9, -r * .05], null, [0, 0, -s * .3]));
  add(head, sph(r * .4, 16, 12), M(0xffdeeb), [0, -r * .3, r * .62], [1, .7, .8]);
  [-1, 1].forEach(s => add(head, sph(r * .05), M(0xf783ac), [s * r * .14, -r * .26, r * .98]));
  // 彩虹鬃毛 + 尾巴
  RAINBOW.forEach((c, i) => { const th = .35 + i * .36; add(head, sph(r * .27, 12, 10), M(c), [0, Math.cos(th) * r * 1.0, -Math.sin(th) * r * 1.0], [.8, 1, 1]); });
  [0xff6b6b, 0xffd43b, 0x4dabf7].forEach((c, i) => add(head, sph(r * .2, 12, 10), M(c), [r * (-.28 + i * .28), r * .72, r * .55]));
  const tail = new THREE.Group(); tail.position.set(0, .95, -.42); ctx.root.add(tail); ctx.rig.tails.push(tail);
  RAINBOW.forEach((c, i) => add(tail, sph(.13 - i * .008, 10, 8), M(c), [Math.sin(i) * .04, -i * .1, -i * .07]));
}

// ---------- 装饰品：手持 / 头上 / 背上 ----------
export function buildDecor(key) {
  const g = new THREE.Group(); let update = null;
  switch (key) {
    case 'lolly': {
      add(g, cyl(.025, .025, .7, 8), M(0xffffff), [0, .35, 0]);
      const tex = canvasTex(128, 128, (c, w) => { c.fillStyle = '#fff'; c.fillRect(0, 0, w, w); c.lineWidth = 12; const cols = ['#ff6b9d', '#ffd43b', '#4dabf7', '#69db7c']; for (let i = 0; i < 40; i++) { c.strokeStyle = cols[i % 4]; c.beginPath(); c.arc(64, 64, i * 1.6, i * .5, i * .5 + 1.2); c.stroke(); } });
      add(g, cyl(.28, .28, .08, 28), [M(0xff6b9d), new THREE.MeshStandardMaterial({ map: tex, roughness: .3 }), new THREE.MeshStandardMaterial({ map: tex, roughness: .3 })], [0, .9, 0], null, [Math.PI / 2, 0, 0]);
      break;
    }
    case 'icecream': {
      add(g, cone(.16, .45, 16), M(0xd9a35b), [0, .15, 0], null, [Math.PI, 0, 0]);
      add(g, sph(.18), M(0xffc9de), [0, .45, 0]); add(g, sph(.16), M(0xb2f2bb), [0, .68, 0]);
      add(g, sph(.05), M(0xe03131), [0, .85, 0]);
      break;
    }
    case 'wand': {
      add(g, cyl(.03, .035, .8, 8), M(0x3b2a8c), [0, .4, 0]);
      const s = star3D(.15, 0xffd43b); s.position.y = .9; g.add(s);
      const gl = glowSprite(0xffe066, .8); gl.position.y = .9; g.add(gl);
      update = t => { s.rotation.y = t * 3; gl.material.opacity = .6 + Math.sin(t * 6) * .3; };
      break;
    }
    case 'flag': {
      add(g, cyl(.025, .025, 1.1, 8), M(0x8b5a2b), [0, .55, 0]);
      const geo = new THREE.PlaneGeometry(.55, .35, 8, 1);
      const flag = add(g, geo, M(0xff4d4d, { side: THREE.DoubleSide }), [.29, .9, 0]);
      const base = geo.attributes.position.array.slice();
      update = t => { const a = geo.attributes.position.array; for (let i = 0; i < a.length; i += 3) a[i + 2] = Math.sin(t * 6 + (base[i] + .27) * 8) * .05 * (base[i] + .27); geo.attributes.position.needsUpdate = true; };
      add(g, sph(.04), M(0xffd43b), [0, 1.12, 0]);
      break;
    }
    case 'glow': {
      add(g, cyl(.045, .045, .75, 10), GLOW(0x3ee8ff, { transparent: true, opacity: .9 }), [0, .45, 0]);
      const gl = glowSprite(0x3ee8ff, 1.2); gl.position.y = .45; g.add(gl);
      update = t => gl.material.opacity = .55 + Math.sin(t * 4) * .25;
      break;
    }
    case 'partyhat': {
      const tex = canvasTex(128, 128, (c, w) => { for (let i = 0; i < 8; i++) { c.fillStyle = ['#ff6b9d', '#4dabf7', '#ffd43b', '#69db7c'][i % 4]; c.fillRect(0, i * 16, w, 16); } c.fillStyle = '#fff'; for (let i = 0; i < 20; i++) { c.beginPath(); c.arc((i * 37) % 128, (i * 53) % 128, 4, 0, 7); c.fill(); } });
      add(g, cone(.3, .7, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: .5 }), [0, .35, 0]);
      add(g, sph(.09), M(0xffffff), [0, .72, 0]);
      break;
    }
    case 'crown': {
      const gold = METAL(0xf2c94c, { emissive: 0x7a5a00, emissiveIntensity: .25 });
      add(g, cyl(.38, .36, .22, 24, 1, true), gold, [0, .1, 0]);
      for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; add(g, cone(.08, .24, 4), gold, [Math.sin(a) * .36, .32, Math.cos(a) * .36]); add(g, sph(.035), M(0xffffff), [Math.sin(a) * .36, .46, Math.cos(a) * .36]); }
      [[0xe03131, 0], [0x1c7ed6, 2], [0x2f9e44, 4]].forEach(([c, i]) => { const a = i / 6 * Math.PI * 2 + Math.PI / 6; add(g, sph(.055), M(c, { roughness: .1, metalness: .3 }), [Math.sin(a) * .38, .1, Math.cos(a) * .38]); });
      break;
    }
    case 'catears': {
      add(g, new THREE.TorusGeometry(.48, .035, 6, 24, Math.PI), M(0x343a40), [0, -.15, 0], null, [0, 0, 0]);
      [-1, 1].forEach(s => { const e = add(g, cone(.17, .32, 4), M(0x343a40), [s * .3, .28, 0], null, [0, Math.PI / 4, -s * .3]); add(e, cone(.1, .2, 4), M(0xffa8c5), [0, -.02, .05]); });
      break;
    }
    case 'wings': {
      const shape = new THREE.Shape(); shape.moveTo(0, 0); shape.bezierCurveTo(.3, .5, .9, .7, 1.1, .5); shape.bezierCurveTo(.9, .35, 1.0, .2, .8, .1); shape.bezierCurveTo(.85, -.05, .6, -.15, .5, -.1); shape.bezierCurveTo(.4, -.25, .2, -.2, 0, 0);
      const geo = new THREE.ExtrudeGeometry(shape, { depth: .04, bevelEnabled: true, bevelSize: .02, bevelThickness: .02, bevelSegments: 1 });
      const mat = M(0xffffff, { emissive: 0xd0ebff, emissiveIntensity: .25 });
      const L = new THREE.Group(), R = new THREE.Group(); g.add(L, R);
      add(R, geo, mat, [0, 0, 0]); const lm = add(L, geo, mat, [0, 0, 0]); lm.scale.x = -1;
      update = t => { const a = .5 + Math.sin(t * 5) * .25; R.rotation.y = -a; L.rotation.y = a; };
      break;
    }
    case 'cape': {
      const geo = new THREE.PlaneGeometry(.9, 1.2, 4, 8);
      const cape = add(g, geo, M(0xc92a2a, { side: THREE.DoubleSide }), [0, -.55, -.05]);
      add(g, new THREE.BoxGeometry(.95, .08, .1), M(0xf2c94c), [0, 0, 0]);
      const base = geo.attributes.position.array.slice();
      update = (t, speed = 0) => { const a = geo.attributes.position.array; for (let i = 0; i < a.length; i += 3) { const k = (.6 - base[i + 1]) / 1.2; a[i + 2] = -k * k * (.25 + speed * .7) - Math.sin(t * 5 + base[i] * 3 + base[i + 1] * 4) * .04 * k; } geo.attributes.position.needsUpdate = true; };
      break;
    }
  }
  return { group: g, update };
}

// ---------- 宠物：跟在主人身后 ----------
export function buildPet(key) {
  const g = new THREE.Group(), body = new THREE.Group(); g.add(body);
  const eyesOn = (h, r, z) => [-1, 1].forEach(s => { add(h, sph(r * .14, 10, 8), M(BLACK), [s * r * .35, r * .1, z]); add(h, sph(r * .05, 6, 6), M(0xffffff), [s * r * .35 + r * .04, r * .16, z + r * .08]); });
  const legs = [];
  if (key === 'petchick') {
    add(body, sph(.32, 16, 12), M(0xffd43b), [0, .4, 0], [1, .95, 1.05]);
    const h = add(body, sph(.24, 16, 12), M(0xffd43b), [0, .72, .12]); eyesOn(h, .24, .21);
    add(h, cone(.06, .12, 8), M(0xff922b), [0, -.02, .26], null, [Math.PI / 2, 0, 0]);
    [-1, 1].forEach(s => add(body, sph(.12, 10, 8), M(0xffd43b), [s * .3, .42, -.02], [.4, .9, 1]));
    [-1, 1].forEach(s => legs.push(add(body, cyl(.025, .025, .14, 6), M(0xff922b), [s * .1, .07, 0])));
  } else {
    const cat = key === 'petcat', col = cat ? 0xffa94d : 0x9c6644, light = cat ? 0xfff4e6 : 0xe6ccb2;
    add(body, sph(.3, 16, 12), M(col), [0, .45, 0], [.9, .85, 1.4]);
    add(body, sph(.18, 12, 10), M(light), [0, .4, .2], [1, .8, 1]);
    const h = add(body, sph(.27, 16, 12), M(col), [0, .78, .38]); eyesOn(h, .27, .23);
    add(h, sph(.12, 12, 10), M(light), [0, -.08, .2], [1.2, .8, .8]);
    add(h, sph(.035), M(cat ? 0xf06595 : BLACK), [0, -.02, .3]);
    [-1, 1].forEach(s => cat
      ? add(h, cone(.1, .2, 4), M(col), [s * .15, .25, 0], null, [0, Math.PI / 4, -s * .25])
      : add(h, sph(.1, 10, 8), M(0x7f5539), [s * .24, .02, -.02], [.5, 1.3, .9]));
    [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([x, z]) => legs.push(add(body, cyl(.06, .06, .3, 8), M(col), [x * .14, .15, z * .22])));
    const tail = add(body, new THREE.CapsuleGeometry(.04, cat ? .45 : .25, 4, 8), M(col), [0, cat ? .75 : .65, -.45], null, [cat ? -.4 : -.9, 0, 0]);
    legs.tail = tail;
  }
  let phase = 0;
  function update(dt, t, moving) {
    phase += dt * (moving ? 12 : 2);
    body.position.y = moving ? Math.abs(Math.sin(phase)) * .12 : Math.sin(t * 2) * .02;
    legs.forEach((l, i) => l.rotation.x = moving ? Math.sin(phase + i * Math.PI) * .5 : 0);
    if (legs.tail) legs.tail.rotation.z = Math.sin(t * (moving ? 10 : 3)) * .4;
  }
  return { group: g, update };
}

// ---------- 组装人物 ----------
export function buildAvatar(skinKey = 'explorer', decor = {}) {
  // 动物皮肤用四条腿（小黄鸡两条腿）的身体
  if (ANIMAL_KEYS.includes(skinKey)) return buildAnimal(skinKey, decor, { M, METAL, GLOW, add, sph, cone, cyl, face, buildDecor, star3D, canvasTex });
  const S = SKINS[skinKey] || SKINS.explorer;
  const root = new THREE.Group();
  const rig = { blink: [], ears: [], tails: [], decor: {} };
  const mk = S.metal ? METAL : M;

  // 腿（以胯部为轴）
  const legGeo = S.thinLegs ? new THREE.CapsuleGeometry(.06, .45, 4, 8) : new THREE.CapsuleGeometry(.17, .38, 4, 10);
  [-1, 1].forEach(s => {
    const hip = new THREE.Group(); hip.position.set(s * .2, .7, 0); root.add(hip);
    add(hip, legGeo, mk(S.pants), [0, -.3, 0]);
    add(hip, sph(.2, 12, 8), mk(S.shoes), [0, -.6, .06], [1, .6, 1.4]);
    rig[s < 0 ? 'legL' : 'legR'] = hip;
  });
  // 身体
  const body = add(root, new THREE.CapsuleGeometry(.4, .42, 6, 16), mk(S.shirt), [0, 1.08, 0]); rig.body = body;
  if (S.belt) add(root, cyl(.41, .41, .1, 20), mk(S.belt), [0, .8, 0]);
  // 手臂（以肩为轴）
  const armGeo = new THREE.CapsuleGeometry(.12, .4, 4, 10);
  [-1, 1].forEach(s => {
    const sh = new THREE.Group(); sh.position.set(s * .5, 1.33, 0); root.add(sh);
    add(sh, armGeo, mk(S.sleeve || S.shirt), [0, -.25, 0]);
    const hand = add(sh, sph(.13, 10, 8), mk(S.hand || S.head), [0, -.55, 0]);
    sh.rotation.z = s * .12;
    rig[s < 0 ? 'armL' : 'armR'] = sh; rig[s < 0 ? 'handL' : 'handR'] = hand;
  });
  // 头
  const neck = new THREE.Group(); neck.position.y = 1.62; root.add(neck); rig.head = neck;
  const r = .52;
  const head = add(neck, new THREE.SphereGeometry(r, 24, 18), mk(S.head), [0, r * .9, 0]);
  if (S.hair) { rig.hair = add(head, new THREE.SphereGeometry(r * 1.02, 20, 12, 0, Math.PI * 2, 0, Math.PI * .42), M(S.hair), [0, 0, 0], null, [-.25, 0, 0]); }
  if (!S.robot) face(head, r, S.face || {});
  const ctx = { root, rig, head, r, body, S };
  S.extra && S.extra(ctx);

  // 挂装饰的点
  rig.headTop = new THREE.Group(); rig.headTop.position.y = r * .78; head.add(rig.headTop);
  rig.backMount = new THREE.Group(); rig.backMount.position.set(0, 1.42, -.42); root.add(rig.backMount);
  rig.handMount = new THREE.Group(); rig.handMount.position.set(0, -.58, .08); rig.handMount.rotation.x = Math.PI / 2 - .3; rig.armR.add(rig.handMount);

  // 脚下的影子
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(.6, 20), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .25, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = .02; root.add(shadow); rig.shadow = shadow;

  function setDecor(slot, key) {
    const old = rig.decor[slot]; if (old) old.group.parent && old.group.parent.remove(old.group);
    rig.decor[slot] = null;
    if (slot === 'head' && rig.hat) rig.hat.visible = !key || skinKey === 'astro';
    if (!key) return;
    const d = buildDecor(key); rig.decor[slot] = d;
    if (slot === 'hand') rig.handMount.add(d.group);
    else if (slot === 'head') {
      // 戴在原来的帽子上面（宇航员戴在头盔外面）
      d.group.position.y = skinKey === 'astro' ? r * .55 : 0;
      if (key === 'catears') d.group.position.y -= r * .1;
      rig.headTop.add(d.group);
    } else if (slot === 'back') {
      if (key === 'wings') { d.group.position.set(0, -.1, -.12); d.group.scale.setScalar(.9); }
      if (key === 'cape') { d.group.position.set(0, .02, -.05); }
      rig.backMount.add(d.group);
    }
  }
  ['hand', 'head', 'back'].forEach(s => decor[s] && setDecor(s, decor[s]));

  let phase = 0, time = 0;
  // speed: 0~1 走路速度；air: 是否在空中；sitting: 坐着（坐游乐设施）；pose: 'fly' | 'skate' 等特殊姿势
  function animate(dt, speed, air, sitting, pose) {
    time += dt;
    rig.blink.forEach((b, i) => b.visible = Math.sin(time * 4 + i * 1.7) > -.3);
    rig.ears.forEach((e, i) => e.rotation.x = Math.sin(time * 3 + i) * .08 - speed * .3);
    rig.tails.forEach(tl => tl.rotation.y = Math.sin(time * (4 + speed * 6)) * .35);
    Object.values(rig.decor).forEach(d => d && d.update && d.update(time, speed));
    if (sitting) {
      rig.legL.rotation.x = rig.legR.rotation.x = -1.4;
      rig.armL.rotation.x = -.6; rig.armR.rotation.x = rig.decor.hand ? -1.0 : -.6;
      rig.body.position.y = 1.08; rig.head.rotation.x = 0;
      return;
    }
    if (pose === 'fly') {
      rig.legL.rotation.x = .25 + Math.sin(time * 3) * .1; rig.legR.rotation.x = .35 - Math.sin(time * 3) * .1;
      rig.armL.rotation.x = rig.armR.rotation.x = -.3 + Math.sin(time * 3) * .1;
      rig.armL.rotation.z = -.5; rig.armR.rotation.z = .5;
      rig.body.position.y = 1.08; rig.head.position.y = 1.62; return;
    }
    rig.armL.rotation.z = -.12; rig.armR.rotation.z = .12;
    if (pose === 'skate') {
      rig.legL.rotation.x = -.2; rig.legR.rotation.x = .25;
      rig.armL.rotation.x = -.4; rig.armR.rotation.x = .4; rig.armL.rotation.z = -.7; rig.armR.rotation.z = .7;
      rig.body.position.y = 1.0; rig.head.position.y = 1.54; return;
    }
    phase += dt * (4 + speed * 8);
    const swing = air ? .5 : Math.sin(phase) * .75 * speed;
    rig.legL.rotation.x = air ? -.5 : swing; rig.legR.rotation.x = air ? .3 : -swing;
    rig.armL.rotation.x = air ? -2.4 : -swing * .9;
    rig.armR.rotation.x = rig.decor.hand ? -.9 + swing * .2 : (air ? -2.4 : swing * .9);   // 拿着东西时手举在胸前
    const bob = air ? 0 : Math.abs(Math.sin(phase)) * .06 * speed;
    rig.body.position.y = 1.08 + bob; rig.head.position.y = 1.62 + bob;
    rig.head.rotation.x = Math.sin(phase * .5) * .03;
  }
  return { root, rig, animate, setDecor, skin: skinKey, height: 2.6 };
}
