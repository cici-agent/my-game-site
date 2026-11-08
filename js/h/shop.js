// ===== 菜鸟家园 · 小镇广场上的小卖部 =====
// 卖：种子、树苗、蜡烛、杀虫剂；收：背包里的菜和水果（换菜币）。价格以后后台可改。
import * as THREE from 'three';
import { CROPS } from './garden.js';

// 种子 / 树苗的价格（菜币）
const SEED_PRICE = { radish: 3, lettuce: 4, carrot: 5, potato: 6, tomato: 10, corn: 12, strawberry: 14, pumpkin: 30, watermelon: 50, apple: 40, orange: 50, peach: 70, cherry: 90 };
export const SHOP_ITEMS = [
  { key: 'spray', price: 15, lv: 1, note: '喷一块田：虫子全赶走，2 小时不来虫' },
  { key: 'candle', price: 5, lv: 1, note: '小木棚里点的蜡烛，烧 3 小时' },
  ...Object.keys(SEED_PRICE).map(k => ({ key: 'seed_' + k, price: SEED_PRICE[k], lv: CROPS[k].lv, note: CROPS[k].kind === 'tree' ? '果树，一块田种一棵' : '' })),
];
export const sellPrice = key => (CROPS[key] ? CROPS[key].price : 0);

function tex(w, h, draw) { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }

export function createShop({ scene, x, z, face, buildAvatar }) {
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
  const stripes = tex(256, 64, (c, w, h) => { for (let i = 0; i < 8; i++) { c.fillStyle = i % 2 ? '#ffffff' : '#e8473e'; c.fillRect(i * w / 8, 0, w / 8, h); } });
  const awn = add(BOX, M({ map: stripes }), [0, 3.7, .2], [5.8, .1, 3.4], [-.18, 0, 0]);
  // 遮阳棚前面一排波浪边
  for (let k = 0; k < 12; k++) add(new THREE.CylinderGeometry(.25, .25, .06, 12, 1, false, 0, Math.PI), M({ color: k % 2 ? 0xffffff : 0xe8473e, side: THREE.DoubleSide }), [-2.75 + k * .5, 3.42, 1.9], null, [Math.PI / 2, 0, 0]);
  // 招牌
  const signT = tex(512, 128, (c, w, h) => { c.fillStyle = '#fff4dc'; c.fillRect(0, 0, w, h); c.strokeStyle = '#7a4f26'; c.lineWidth = 12; c.strokeRect(6, 6, w - 12, h - 12);
    c.fillStyle = '#7a3a12'; c.font = 'bold 72px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('菜鸟小卖部', w / 2, h / 2 + 4); });
  add(BOX, M({ map: signT }), [0, 4.35, 1.6], [3.2, .8, .08]);
  // 柜台上和旁边的一筐筐菜、一排种子袋
  const crate = (px, pz, color, n) => { add(BOX, wood, [px, 1.45, pz], [.8, .3, .55]); for (let i = 0; i < n; i++) add(SPH, M({ color, roughness: .5 }), [px - .25 + (i % 3) * .25, 1.65, pz - .1 + Math.floor(i / 3) * .2], [.11, .11, .11]); };
  crate(-1.8, 1, 0xe8352b, 6); crate(-.9, 1, 0xff8a1f, 6); crate(1.8, 1, 0x7dbf3a, 6);
  for (let i = 0; i < 5; i++) add(BOX, M({ color: [0xe9d3a0, 0xd9b978][i % 2] }), [.2 + i * .28, 1.47, 1.15], [.22, .34, .04], [-.25, 0, 0]);
  [[-3.2, 2], [3.2, 2.2]].forEach(([px, pz], i) => { add(BOX, wood, [px, .3, pz], [.9, .6, .7]); for (let k = 0; k < 5; k++) add(SPH, M({ color: i ? 0xf28a1c : 0x3f8f3a }), [px - .25 + (k % 3) * .25, .7, pz - .1 + Math.floor(k / 3) * .22], [.18, .16, .18]); });
  // 老板（小厨师）站在柜台后面
  let keeper = null;
  try { keeper = buildAvatar('chef'); keeper.root.position.set(0, 0, -.1); g.add(keeper.root); } catch (e) {}
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
  return { near, collide, update, front: () => world(0, 4) };
}
