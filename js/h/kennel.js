// ===== 菜鸟家园 · 狗屋（三个等级，样子按设计画布《菜鸟家园 · 动物和它们的家》） =====
// 1 级 小狗窝：木头狗窝；2 级 漂亮狗屋：蓝墙、名字牌、软垫子；3 级 狗狗乐园：大一点的狗屋 + 小院子（球、跨栏）
import * as THREE from 'three';

export const KENNEL = {
  1: { name: '小狗窝', price: 30, W: .8, D: .95, H: 1.05, rise: .6, wall: 0xc49766, roof: 0x8a5a2b, trim: 0x6b4423 },
  2: { name: '漂亮狗屋', price: 60, W: .9, D: 1.05, H: 1.15, rise: .65, wall: 0x6fb7ff, roof: 0x3f5fa8, trim: 0xffffff, plate: true, cushion: true },
  3: { name: '狗狗乐园', price: 120, W: 1.05, D: 1.2, H: 1.3, rise: .75, wall: 0x6fb7ff, roof: 0x3f5fa8, trim: 0xffffff, plate: true, cushion: true, yard: true },
};

function plankTex() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#c49766'; g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#b8875a' : '#cfa274'; g.fillRect(0, i * 21.3, 128, 20); g.fillStyle = 'rgba(80,45,15,.5)'; g.fillRect(0, i * 21.3 + 20, 128, 1.3); }
  for (let i = 0; i < 30; i++) { g.strokeStyle = 'rgba(90,55,20,.18)'; g.beginPath(); const y = Math.random() * 128; g.moveTo(0, y); g.lineTo(128, y + (Math.random() - .5) * 4); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
let PLANK = null;
function plateTex(name) {
  const c = document.createElement('canvas'); c.width = 256; c.height = 96; const g = c.getContext('2d');
  g.fillStyle = '#fffaf0'; g.beginPath(); g.roundRect(4, 4, 248, 88, 22); g.fill(); g.lineWidth = 6; g.strokeStyle = '#3f5fa8'; g.stroke();
  g.fillStyle = '#3f5fa8'; g.font = 'bold 50px "ZCOOL KuaiLe", "Noto Sans SC", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name || '我的狗', 128, 52);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t;
}

// 门朝 +z；狗睡觉的地方在里面中间
export function buildKennel(lv, dogName) {
  const K = KENNEL[lv], g = new THREE.Group();
  const M = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: .8, ...o });
  PLANK ||= plankTex();
  const wallMat = lv === 1 ? new THREE.MeshStandardMaterial({ map: PLANK, roughness: .9 }) : M(K.wall), roofMat = M(K.roof), trimMat = M(K.trim);
  const { W, D, H, rise } = K, T = .07;
  const mesh = (geo, mat, p, r) => { const m = new THREE.Mesh(geo, mat); m.position.set(...p); if (r) m.rotation.set(...r); m.castShadow = m.receiveShadow = true; g.add(m); return m; };
  // 前后墙：五边形（带三角屋顶山墙）；前墙挖一个拱形门洞
  const gable = (hole) => {
    const s = new THREE.Shape(); s.moveTo(-W, 0); s.lineTo(W, 0); s.lineTo(W, H); s.lineTo(0, H + rise); s.lineTo(-W, H); s.lineTo(-W, 0);
    if (hole) { const dw = W * .55, dh = H * .78, h = new THREE.Path(); h.moveTo(-dw, 0); h.lineTo(dw, 0); h.lineTo(dw, dh - dw); h.absarc(0, dh - dw, dw, 0, Math.PI, false); h.lineTo(-dw, 0); s.holes.push(h); }
    const geo = new THREE.ExtrudeGeometry(s, { depth: T, bevelEnabled: false });
    // 贴图按米铺
    const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * .9, uv.getY(i) * .9);
    return geo;
  };
  mesh(gable(true), wallMat, [0, 0, D - T]);
  mesh(gable(false), wallMat, [0, 0, -D]);
  [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(T, H, D * 2), wallMat, [s * (W - T / 2), H / 2, 0]));
  // 地板 + 屋顶
  mesh(new THREE.BoxGeometry(W * 2, .06, D * 2), M(0x9a6a3c), [0, .03, 0]);
  const sl = Math.hypot(W + .15, rise);
  [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(sl, .08, D * 2 + .3), roofMat, [s * (W + .15) / 2, H + rise / 2, 0], [0, 0, -s * Math.atan2(rise, W + .15)]));
  mesh(new THREE.CylinderGeometry(.05, .05, D * 2 + .34, 8), trimMat, [0, H + rise + .02, 0], [Math.PI / 2, 0, 0]);
  // 门洞边框
  const dw = W * .55, dh = H * .78;
  const arch = new THREE.Mesh(new THREE.TorusGeometry(dw + .03, .035, 6, 20, Math.PI), trimMat); arch.position.set(0, dh - dw, D + .005); g.add(arch);
  [-1, 1].forEach(s => mesh(new THREE.BoxGeometry(.07, dh - dw, .07), trimMat, [s * (dw + .03), (dh - dw) / 2, D + .005]));
  // 二级起：白色墙角、名字牌、软垫子
  if (lv >= 2) {
    [-1, 1].forEach(sx => [-1, 1].forEach(sz => mesh(new THREE.BoxGeometry(.08, H, .08), trimMat, [sx * W, H / 2, sz * D])));
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(.9, .34), new THREE.MeshBasicMaterial({ map: plateTex(dogName), transparent: true }));
    plate.position.set(0, H + rise * .38, D + .02); g.add(plate);
  } else {
    // 一级：门上一块小骨头
    const bone = new THREE.Group(); bone.position.set(0, H + rise * .35, D + .03); g.add(bone);
    const bm = M(0xfff4e0); bone.add(new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .26, 8), bm).rotateZ(Math.PI / 2));
    [-1, 1].forEach(s => [-1, 1].forEach(t => { const b = new THREE.Mesh(new THREE.SphereGeometry(.04, 8, 6), bm); b.position.set(s * .13, t * .03, 0); bone.add(b); }));
  }
  if (K.cushion) { const c = mesh(new THREE.CylinderGeometry(W * .75, W * .8, .12, 20), M(0xffb3c8, { roughness: 1 }), [0, .1, -.05]); c.scale.z = D / W; }
  else { const s = mesh(new THREE.CylinderGeometry(W * .7, W * .75, .07, 14), M(0xd8b25a, { roughness: 1 }), [0, .07, -.05]); s.scale.z = D / W; }   // 一级：一堆稻草
  // 三级：门前的小院子（白栅栏 + 球 + 跨栏）
  let yard = null;
  if (K.yard) {
    const YW = 2.6, Y0 = D + .2, Y1 = D + 4;   // 院子：x ±YW，z 从 Y0 到 Y1
    yard = { x: 0, z: (Y0 + Y1) / 2, w: YW - .4, d: (Y1 - Y0) / 2 - .4 };
    const white = M(0xffffff), grass = new THREE.Mesh(new THREE.PlaneGeometry(YW * 2, Y1 - Y0), M(0x8fd06a, { roughness: 1 }));
    grass.rotation.x = -Math.PI / 2; grass.position.set(0, .015, (Y0 + Y1) / 2); grass.receiveShadow = true; g.add(grass);
    const post = new THREE.BoxGeometry(.06, .55, .06);
    const fenceLine = (x0, z0, x1, z1, gapMid) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / .3);
      for (let i = 0; i <= n; i++) { const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; if (gapMid && Math.abs(x) < .7) continue; mesh(post, white, [x, .275, z]); }
      [.2, .42].forEach(y => { if (gapMid) { [[-1, x0, -.7], [1, .7, x1]].forEach(([, a, b]) => mesh(new THREE.BoxGeometry(Math.abs(b - a), .04, .03), white, [(a + b) / 2, y, z0])); }
        else mesh(new THREE.BoxGeometry(Math.abs(x1 - x0) || .03, .04, Math.abs(z1 - z0) || .03), white, [(x0 + x1) / 2, y, (z0 + z1) / 2]); });
    };
    fenceLine(-YW, Y1, YW, Y1, true);            // 前面留个口子
    fenceLine(-YW, Y0, -YW, Y1); fenceLine(YW, Y0, YW, Y1);
    fenceLine(-YW, Y0, -W - .1, Y0); fenceLine(W + .1, Y0, YW, Y0);
    // 跨栏
    const orange = M(0xff8c42);
    [-.55, .55].forEach(x => mesh(new THREE.BoxGeometry(.06, .5, .06), orange, [x - 1.2, .25, Y0 + 2]));
    mesh(new THREE.CylinderGeometry(.03, .03, 1.1, 8), M(0xffffff), [-1.2, .38, Y0 + 2], [0, 0, Math.PI / 2]);
    // 球
    const ball = mesh(new THREE.SphereGeometry(.13, 16, 12), M(0xe8352b, { roughness: .5 }), [1.3, .13, Y0 + 2.4]);
    ball.add(new THREE.Mesh(new THREE.TorusGeometry(.131, .025, 6, 20), M(0xffd23f)));
    // 一个小骨头玩具
    mesh(new THREE.CylinderGeometry(.03, .03, .26, 8), M(0xfff4e0), [.4, .04, Y0 + 1.2], [0, .6, Math.PI / 2]);
  }
  return { group: g, half: { w: W + .1, d: D + .1 }, bed: { x: 0, z: -.1 }, yard };
}
