// ===== 菜鸟家园 · 小镇广场上的小卖部 =====
// 卖：种子、树苗、蜡烛、杀虫剂、狗用的东西；收：背包里除了钥匙的所有东西（换菜币）。价格以后后台可改。
import * as THREE from 'three';
import { CROPS } from './garden.js';

// 种子 / 树苗的价格（菜币）
const SEED_PRICE = { radish: 3, lettuce: 4, carrot: 5, potato: 6, tomato: 10, corn: 12, strawberry: 14, pumpkin: 30, watermelon: 50, apple: 40, orange: 50, peach: 70, cherry: 90 };
export const SHOP_ITEMS = [
  { key: 'spray', price: 15, lv: 1, note: '一次喷 9 块田（周围 3×3）：虫子全赶走，2 小时不来虫' },
  { key: 'candle', price: 5, lv: 1, note: '点在烛台上，能烧半小时' },
  // 动物小铺（用户说：卖动物的店，比如买鸡）
  { key: 'chick', price: 15, lv: 1, note: '一只小黄鸡：放进你的鸡舍，20 分钟长成母鸡，会下蛋', animal: true, once: true, shop: 'animal' },
  { key: 'chickfeed', price: 2, lv: 1, note: '一份鸡饲料：倒进鸡舍的食槽（玉米、种子也能喂鸡）', shop: 'animal' },
  { key: 'cowshed', price: 100, lv: 1, note: '在你家空地后面盖一个小牛棚（带牧场）；能升级', once: true, shop: 'animal', building: true },
  { key: 'calf', price: 60, lv: 1, note: '一头小牛：30 分钟长大，能挤牛奶（要先有牛棚）', once: true, shop: 'animal', animal: true },
  { key: 'sheeppen', price: 80, lv: 1, note: '在你家空地后面盖一个小羊圈（带牧场）；能升级', once: true, shop: 'animal', building: true },
  { key: 'lamb', price: 40, lv: 1, note: '一只小羊：25 分钟长大，毛长满了用剪刀剪（要先有羊圈）', once: true, shop: 'animal', animal: true },
  { key: 'hay', price: 3, lv: 1, note: '一份草料：倒进牛棚、羊圈的食槽（生菜、胡萝卜、玉米也行）', shop: 'animal' },
  { key: 'shears', price: 10, lv: 1, note: '剪羊毛用（不会用完）', once: true, shop: 'animal' },
  // 萌宠小屋（用户说：宠物店，现在只有小狗，以后有更多）
  { key: 'puppy', price: 80, lv: 1, note: '一只呆萌的小狗，买了就跟着你（只能养一只）', once: true, shop: 'pet' },
  { shop: 'pet', key: 'kennel', price: 30, lv: 1, note: '小狗窝：先放进背包，选中按 E 放在地上（放好就不能再挪了）；狗晚上回去睡觉；在狗屋前按 E 能升级', once: true },
  { shop: 'pet', key: 'leash', price: 8, lv: 1, note: '把狗拴在狗屋门口（或者地上的小木桩）上，它就不会乱跑；不会用完', once: true },
  { shop: 'pet', key: 'bowl', price: 10, lv: 1, note: '放在地上，往里面加狗粮，狗饿了自己去吃' },
  { shop: 'pet', key: 'dogfood', price: 3, lv: 1, note: '一份狗粮：放进狗盆，或者直接喂给狗' },
  { shop: 'pet', key: 'frisbee', price: 12, lv: 1, note: '扔出去，狗会去捡回来（不会用完）' },
  { key: 'knife', price: 6, lv: 1, note: '选中菜刀走到鸡旁边，按两次 E 杀鸡，得到鸡肉（不会用完）', once: true },
  { key: 'oil', price: 8, lv: 1, note: '小木屋的油灯用，能亮 2 小时' },
  ...Object.keys(SEED_PRICE).map(k => ({ key: 'seed_' + k, price: SEED_PRICE[k], lv: CROPS[k].lv, note: CROPS[k].kind === 'tree' ? '果树，一块田种一棵' : '' })),
];
// 能卖的价格（用户说：背包里除了钥匙，什么都能卖，但卖的价格比买的低）：菜和水果按原价收；小卖部买来的东西按买价的一半
const BUY = Object.fromEntries(SHOP_ITEMS.map(it => [it.key, it.price]));
const EXTRA_SELL = { egg: 5, goldegg: 60, chicken_meat: 12, milk: 15, wool: 18, beef: 30, mutton: 22 };   // 鸡蛋、金蛋
export const sellPrice = key => key === 'key' ? 0 : EXTRA_SELL[key] ? EXTRA_SELL[key] : CROPS[key] ? CROPS[key].price : BUY[key] ? Math.max(1, Math.floor(BUY[key] / 2)) : 0;

function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

// 三家店：菜鸟小卖部（种子、杂货、狗用品）、萌宠小屋（宠物）、动物小铺（农场动物）
export const SHOPS = {
  general: { name: '菜鸟小卖部', icon: '🏪', a: '#e8473e', b: '#ffffff', keeper: 'chef', desc: '买种子、树苗、蜡烛、杀虫剂、菜刀；把东西卖掉换菜币' },
  pet: { name: '萌宠小屋', icon: '🐾', a: '#ff7aa8', b: '#ffffff', keeper: 'explorer', desc: '买小狗、狗屋、狗盆、狗粮、狗链、飞盘（以后会有更多宠物）' },
  animal: { name: '动物小铺', icon: '🐔', a: '#4caf50', b: '#fff4c2', keeper: 'farmer', desc: '买小鸡、小牛、小羊、牛棚、羊圈、饲料、剪刀（以后还有猪、鸭）' },
};
export const shopOf = it => it.shop || 'general';

export function createShop({ scene, x, z, face, buildAvatar, kind = 'general', decor = null }) {
  const S = SHOPS[kind];
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = face; scene.add(g);
  const M = o => new THREE.MeshStandardMaterial({ roughness: .85, ...o });
  const add = (geo, mat, p, s, r, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); if (s) m.scale.set(...s); if (r) m.rotation.set(...r); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 10), SPH = new THREE.SphereGeometry(1, 12, 8);
  const wood = M({ color: 0xa8713c }), dark = M({ color: 0x7a4f26 });
  // 柜台（朝 +z 的一面对着客人）
  add(BOX, wood, [0, .6, 1], [5, 1.2, 1]);
  add(BOX, dark, [0, 1.24, 1], [5.2, .1, 1.2]);
  for (let k = -2; k <= 2; k++) add(BOX, dark, [k * 1.1, .6, 1.51], [.06, 1.1, .03]);
  // 四根柱子 + 红白条纹的遮阳棚
  [[-2.5, 1.5], [2.5, 1.5], [-2.5, -1.2], [2.5, -1.2]].forEach(([px, pz]) => add(CYL, dark, [px, 1.8, pz], [.09, 3.6, .09]));
  const stripes = tex(256, 64, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? S.b : S.a; c.fillRect(i * w / 8, 0, w / 8, h); } });
  const awn = add(BOX, M({ map: stripes }), [0, 3.7, .2], [5.8, .1, 3.4], [-.18, 0, 0]);
  // 遮阳棚前面一排波浪边
  for (let k = 0; k < 12; k++) add(new THREE.CylinderGeometry(.25, .25, .06, 12, 1, false, 0, Math.PI), M({ color: new THREE.Color(k % 2 ? S.b : S.a), side: THREE.DoubleSide }), [-2.75 + k * .5, 3.42, 1.9], null, [Math.PI / 2, 0, 0]);
  // 招牌
  const signT = tex(512, 128, (c, w, h) => { c.fillStyle = '#fff4dc'; c.fillRect(0, 0, w, h); c.strokeStyle = '#7a4f26'; c.lineWidth = 12; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = '#7a3a12'; c.font = 'bold 72px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(S.name, w / 2, h / 2 + 4); });
  add(BOX, M({ map: signT }), [0, 4.35, 1.6], [3.2, .8, .08]);
  // 柜台上和旁边的一筐筐菜、一排种子袋（小卖部）；另外两家店放自己的摆设
  if (kind === 'general') {
  const crate = (px, pz, color, n) => { add(BOX, wood, [px, 1.45, pz], [.8, .3, .55]); for (let i = 0; i < n; i++) add(SPH, M({ color, roughness: .5 }), [px - .25 + (i % 3) * .25, 1.65, pz - .1 + Math.floor(i / 3) * .2], [.11, .11, .11]); };
  crate(-1.8, 1, 0xe8352b, 6); crate(-.9, 1, 0xff8a1f, 6); crate(1.8, 1, 0x7dbf3a, 6);
  for (let i = 0; i < 5; i++) add(BOX, M({ color: [0xe9d3a0, 0xd9b978][i % 2] }), [.2 + i * .28, 1.47, 1.15], [.22, .34, .04], [-.25, 0, 0]);
  [[-3.2, 2], [3.2, 2.2]].forEach(([px, pz], i) => { add(BOX, wood, [px, .3, pz], [.9, .6, .7]); for (let k = 0; k < 5; k++) add(SPH, M({ color: i ? 0xf28a1c : 0x3f8f3a }), [px - .25 + (k % 3) * .25, .7, pz - .1 + Math.floor(k / 3) * .22], [.18, .16, .18]); });
  } else if (decor) decor(g, { add, M, BOX, CYL, SPH, wood, dark });
  // 老板（小厨师）站在柜台后面
  let keeper = null;
  try { keeper = buildAvatar(S.keeper); keeper.root.position.set(0, 0, -.1); g.add(keeper.root); } catch (e) {}
  const world = (lx, lz) => { const c = Math.cos(face), s = Math.sin(face); return [x + lx * c + lz * s, z - lx * s + lz * c]; };
  const [cx, cz] = world(0, 2.4);
  function near(pos) { return Math.hypot(pos.x - cx, pos.z - cz) < 2.6; }
  // 柜台挡路
  function collide(pos, pr = .45) {
    const dx = pos.x - x, dz = pos.z - z, c = Math.cos(face), s = Math.sin(face);
    let lx = dx * c - dz * s, lz = dx * s + dz * c; const ox = lx, oz = lz;
    const boxes = [[0, .3, 2.7, 1.1]];   // 柜台 + 后面老板站的地方：x 中心、z 中心、半宽、半深
    boxes.forEach(([bx, bz, hx, hz]) => { const ex = hx + pr - Math.abs(lx - bx), ez = hz + pr - Math.abs(lz - bz);
      if (ex > 0 && ez > 0) { if (ex < ez) lx = bx + Math.sign(lx - bx || 1) * (hx + pr); else lz = bz + Math.sign(lz - bz || 1) * (hz + pr); } });
    if (lx !== ox || lz !== oz) { const [wx, wz] = world(lx, lz); pos.x = wx; pos.z = wz; }
  }
  let t = 0;
  function update(dt) { t += dt; if (keeper) { keeper.animate(dt, 0, false, false); keeper.root.rotation.y = Math.sin(t * .5) * .25; } }
  return { kind, name: S.name, near, collide, update, front: () => world(0, 4) };
}

// ---------- 大商店（能走进去）：萌宠小屋、动物小铺 ----------
// 用户说：卖动物、卖宠物的也要是人在那儿卖；有些可以不是小摊，做成大的商店
const STORE_STYLE = {
  pet: { wall: 0xffd6e4, trim: 0xffffff, roof: 0xff7aa8, floor: 0xe9c9a0, keeper: 'explorer', sign: '#ff5a93' },
  animal: { wall: 0xc23626, trim: 0xffffff, roof: 0x5a2a18, floor: 0xb08a5a, keeper: 'farmer', sign: '#2e8b3a' },
};
export function createStore({ scene, x, z, face, buildAvatar, kind, decor = null }) {
  const S = SHOPS[kind], Y = STORE_STYLE[kind];
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = face; scene.add(g);
  const roof = new THREE.Group(); g.add(roof);
  const M = o => new THREE.MeshStandardMaterial({ roughness: .85, ...o });
  const BOX = new THREE.BoxGeometry(1, 1, 1), CYL = new THREE.CylinderGeometry(1, 1, 1, 12), SPH = new THREE.SphereGeometry(1, 12, 8);
  const add = (geo, mat, p, s, r, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); if (s) m.scale.set(...s); if (r) m.rotation.set(...r); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const W = 5, D = 4, H = 3.4, T = .22, DOOR = 1.4, wall = M({ color: Y.wall }), trim = M({ color: Y.trim }), wood = M({ color: 0xa8713c }), dark = M({ color: 0x7a4f26 });
  // 地板
  add(BOX, M({ color: Y.floor }), [0, .04, 0], [W * 2, .08, D * 2]);
  // 墙：后墙、两边；前墙留门和两扇大橱窗
  add(BOX, wall, [0, H / 2, -D], [W * 2, H, T]);
  [-1, 1].forEach(s => add(BOX, wall, [s * W, H / 2, 0], [T, H, D * 2]));
  // 前墙、橱窗、招牌、遮雨棚：人进店以后和屋顶一起变透明，才看得见里面
  const fw = M({ color: Y.wall, transparent: true }), ft = M({ color: Y.trim, transparent: true });
  const WIN = [2.2, 4.2];   // 橱窗从 x=2.2 到 4.2，高 1 到 2.5
  [-1, 1].forEach(s => {
    add(BOX, fw, [s * (DOOR + (WIN[0] - DOOR) / 2), H / 2, D], [WIN[0] - DOOR, H, T], null, roof);
    add(BOX, fw, [s * (WIN[1] + (W - WIN[1]) / 2), H / 2, D], [W - WIN[1], H, T], null, roof);
    add(BOX, fw, [s * (WIN[0] + WIN[1]) / 2, .5, D], [WIN[1] - WIN[0], 1, T], null, roof);
    add(BOX, fw, [s * (WIN[0] + WIN[1]) / 2, (2.5 + H) / 2, D], [WIN[1] - WIN[0], H - 2.5, T], null, roof);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(WIN[1] - WIN[0], 1.5), M({ color: 0xbfe3f7, transparent: true, opacity: .35, roughness: .1 })); glass.position.set(s * (WIN[0] + WIN[1]) / 2, 1.75, D); roof.add(glass);
    add(BOX, ft, [s * (WIN[0] + WIN[1]) / 2, 1, D + .14], [WIN[1] - WIN[0] + .2, .1, .14], null, roof);
    [WIN[0], WIN[1]].forEach(wx => add(BOX, ft, [s * wx, 1.75, D + .12], [.1, 1.6, .1], null, roof));
  });
  add(BOX, fw, [0, (2.7 + H) / 2, D], [DOOR * 2, H - 2.7, T], null, roof);   // 门上面
  [-1, 1].forEach(s => add(BOX, ft, [s * DOOR, 1.35, D + .12], [.12, 2.7, .12], null, roof));
  // 门口的小台阶 + 遮雨棚（条纹）
  add(BOX, M({ color: 0xd8cbb4 }), [0, .06, D + .7], [DOOR * 2 + .6, .12, 1.2]);
  const stripes = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const x2 = c.getContext('2d'); for (let i = 0; i < 8; i++) { x2.fillStyle = i % 2 ? S.b : S.a; x2.fillRect(i * 32, 0, 32, 64); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  add(BOX, M({ map: stripes, transparent: true }), [0, 2.95, D + .6], [DOOR * 2 + 1.2, .08, 1.3], [.35, 0, 0], roof);
  // 招牌
  const signT = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x2 = c.getContext('2d'); x2.fillStyle = '#fffaf0'; x2.fillRect(0, 0, 512, 128); x2.strokeStyle = Y.sign; x2.lineWidth = 14; x2.strokeRect(7, 7, 498, 114);
    x2.fillStyle = Y.sign; x2.font = 'bold 74px sans-serif'; x2.textAlign = 'center'; x2.textBaseline = 'middle'; x2.fillText(S.name, 256, 68); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  add(BOX, M({ map: signT, transparent: true }), [0, H + .55, D + .2], [3.6, .9, .1], null, roof);
  // 屋顶（人进去时变透明）
  const rise = 2, sl = Math.hypot(W + .4, rise), roofMat = M({ color: Y.roof, transparent: true });
  [-1, 1].forEach(s => add(BOX, roofMat, [s * (W + .4) / 2, H + rise / 2, 0], [sl, .2, D * 2 + .6], [0, 0, -s * Math.atan2(rise, W + .4)], roof));
  [-1, 1].forEach(s => { const sh = new THREE.Shape(); sh.moveTo(-W, 0); sh.lineTo(W, 0); sh.lineTo(0, rise); sh.lineTo(-W, 0);
    const gm = new THREE.Mesh(new THREE.ShapeGeometry(sh), M({ color: Y.wall, side: THREE.DoubleSide, transparent: true })); gm.position.set(0, H, s * D); roof.add(gm); });
  if (kind === 'animal') { [-1, 1].forEach(s => add(BOX, trim, [s * W, H / 2, D + .12], [.15, H, .12])); add(BOX, trim, [0, H, D + .12], [W * 2, .15, .12]); }   // 谷仓的白边
  // 柜台 + 后面的货架
  add(BOX, wood, [0, .55, -1.5], [4, 1.1, .9]); add(BOX, dark, [0, 1.13, -1.5], [4.2, .08, 1.05]);
  add(BOX, dark, [0, 1.4, -D + .35], [6, 2.6, .5]);
  [.6, 1.4, 2.2].forEach(y => add(BOX, wood, [0, y, -D + .62], [5.8, .06, .2]));
  // 屋里一盏暖灯
  const lamp = new THREE.PointLight(0xffe2b0, 2.2, 14, 1.4); lamp.position.set(0, H - .4, 0); g.add(lamp);
  add(SPH, M({ color: 0xfff1c8, emissive: 0xffd36b, emissiveIntensity: .8 }), [0, H - .25, 0], [.22, .15, .22]);
  // 老板（是人）站在柜台后面
  let keeper = null;
  try { keeper = buildAvatar(Y.keeper); keeper.root.position.set(0, 0, -2.4); g.add(keeper.root); } catch (e) {}
  const decorBoxes = decor ? decor(g, { add, M, BOX, CYL, SPH, wood, dark, W, D, H }) || [] : [];
  const world = (lx, lz) => { const c = Math.cos(face), s = Math.sin(face); return [x + lx * c + lz * s, z - lx * s + lz * c]; };
  const local = (wx, wz) => { const dx = wx - x, dz = wz - z, c = Math.cos(face), s = Math.sin(face); return [dx * c - dz * s, dx * s + dz * c]; };
  const [cx, cz] = world(0, -.4);
  const near = pos => Math.hypot(pos.x - cx, pos.z - cz) < 2.2;
  const inside = pos => { const [lx, lz] = local(pos.x, pos.z); return Math.abs(lx) < W - .1 && Math.abs(lz) < D - .1; };
  // 墙挡人（门口能进）；柜台、货架挡人
  const segs = [[-W, -D, W, -D], [-W, -D, -W, D], [W, -D, W, D], [-W, D, -DOOR, D], [DOOR, D, W, D]];
  const boxes = [[0, -1.5, 2.1, .55], [0, -D + .35, 3, .3], [0, -2.4, 2.1, .5]];
  function collide(pos, pr = .45) {
    let [lx, lz] = local(pos.x, pos.z); if (Math.abs(lx) > W + 2 || Math.abs(lz) > D + 2) return; const ox = lx, oz = lz;
    segs.forEach(([ax, az, bx, bz]) => { const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, rx = lx - ax, rz = lz - az, t = rx * ux + rz * uz, n = rx * -uz + rz * ux;
      if (t < -pr || t > len + pr || Math.abs(n) > pr) return; const push = (n >= 0 ? pr : -pr) - n; lx += -uz * push; lz += ux * push; });
    boxes.concat(decorBoxes).forEach(([bx, bz, hx, hz]) => { const ex = hx + pr - Math.abs(lx - bx), ez = hz + pr - Math.abs(lz - bz);
      if (ex > 0 && ez > 0) { if (ex < ez) lx = bx + Math.sign(lx - bx || 1) * (hx + pr); else lz = bz + Math.sign(lz - bz || 1) * (hz + pr); } });
    if (lx !== ox || lz !== oz) { const [wx, wz] = world(lx, lz); pos.x = wx; pos.z = wz; }
  }
  let t = 0, fade = 1;
  function update(dt, ppos) {
    t += dt; if (keeper) { keeper.animate(dt, 0, false, false); keeper.root.rotation.y = Math.sin(t * .5) * .25; }
    const ins = ppos && inside(ppos); fade += ((ins ? .08 : 1) - fade) * Math.min(1, dt * 5); roof.visible = fade > .1;
    roof.traverse(o => { if (o.isMesh) { o.material.opacity = fade; o.castShadow = fade > .5; } });
  }
  return { kind, name: S.name, near, collide, update, inside, front: () => world(0, -.4), door: () => world(0, D + 2) };
}
