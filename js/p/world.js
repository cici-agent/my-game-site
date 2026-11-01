// ===== 菜鸟星球游乐园：场景（地面、天空、装饰、商店建筑、星门） =====
import * as THREE from 'three';
import { glowTex, canvasTex, rand, swirlTex } from '../u/tex.js';
import { ferrisWheel, rollerCoaster, carousel, pirateShip } from './rides.js';
import { buildKartIsland, KI } from './kartisland.js';
import { bumperArena } from './bumper.js';
import { hauntedMansion } from './mansion.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .7, ...o });
export const ISLAND_R = 230;

// 天空：顶部 / 中间 / 地平线三种颜色的渐变（白天、日落、夜晚的颜色由 daynight.js 每帧调）
function sky(scene) {
  const uniforms = { top: { value: new THREE.Color('#3d8bfd') }, mid: { value: new THREE.Color('#8fd3ff') }, bot: { value: new THREE.Color('#e3f6ff') } };
  const mat = new THREE.ShaderMaterial({
    uniforms, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 bot; varying vec3 vP;
      void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(mid, top, smoothstep(0.0, 0.55, h)) : mix(mid, bot, smoothstep(0.0, -0.25, h));
        gl_FragColor = vec4(c, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const skyG = new THREE.Group(); scene.add(skyG);                 // 天空跟着相机走（去卡丁车岛也有天空）
  const dome = new THREE.Mesh(new THREE.SphereGeometry(600, 32, 16), mat); dome.renderOrder = -10;
  skyG.add(dome);
  const N = 1400, pos = new Float32Array(N * 3), r = rand(5);
  for (let i = 0; i < N; i++) {
    const th = r() * Math.PI * 2, ph = r() * Math.PI * .45, R = 560;
    pos.set([R * Math.sin(ph) * Math.cos(th), R * Math.cos(ph), R * Math.sin(ph) * Math.sin(th)], i * 3);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const stars = new THREE.Points(geo, new THREE.PointsMaterial({ size: 3, map: glowTex(), color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, fog: false }));
  skyG.add(stars);
  // 天上能看到其他星球（白天淡一点，晚上清楚）
  const planets = [];
  [['#ff6b35', [-260, 230, -330], 38], ['#ffd23f', [300, 180, -260], 26], ['#8b6bff', [-330, 160, 220], 30], ['#2ec4b6', [280, 260, 300], 22]].forEach(([c, p, s]) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(s, 24, 16), new THREE.MeshBasicMaterial({ color: c, fog: false, transparent: true }));
    m.position.set(...p); skyG.add(m);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: c, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
    halo.position.copy(m.position); halo.scale.setScalar(s * 3.5); skyG.add(halo);
    planets.push({ m, halo });
  });
  // 太阳和月亮
  const sun = new THREE.Group();
  sun.add(new THREE.Mesh(new THREE.CircleGeometry(26, 32), new THREE.MeshBasicMaterial({ color: 0xfff3bf, fog: false })));
  const sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffd27a, transparent: true, opacity: .9, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
  sunGlow.scale.setScalar(170); sun.add(sunGlow); scene.add(sun);
  const moonTex = canvasTex(256, 256, (g, w) => {
    g.fillStyle = '#fff9db'; g.beginPath(); g.arc(w / 2, w / 2, w * .42, 0, 7); g.fill();
    g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(w * .64, w * .4, w * .36, 0, 7); g.fill();
  });
  const moon = new THREE.Group();
  moon.add(new THREE.Mesh(new THREE.PlaneGeometry(46, 46), new THREE.MeshBasicMaterial({ map: moonTex, transparent: true, fog: false, depthWrite: false })));
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xc5d6ff, transparent: true, opacity: .5, blending: THREE.AdditiveBlending, fog: false, depthWrite: false }));
  moonGlow.scale.setScalar(110); moon.add(moonGlow); scene.add(moon);
  return { skyG, dome, uniforms, stars, planets, sun, moon };
}

// 传送门（走进去就传送）
function portalGate(scene, x, z, color, label) {
  const pg = new THREE.Group(); pg.position.set(x, 0, z); scene.add(pg);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.4, .3, 12, 48), M(color, { emissive: color, emissiveIntensity: .8 })); ring.position.y = 2.8; pg.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(2.2, 32), new THREE.MeshBasicMaterial({ map: swirlTex(), color, transparent: true, opacity: .7, side: THREE.DoubleSide, depthWrite: false })); disc.position.y = 2.8; pg.add(disc);
  const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, transparent: true, opacity: .6, blending: THREE.AdditiveBlending, depthWrite: false })); gl.position.y = 2.8; gl.scale.setScalar(8); pg.add(gl);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3, .4, 24), M(0xb0b8d0)); base.position.y = .2; pg.add(base);
  const lt = canvasTex(360, 64, (c, w, h) => { c.fillStyle = 'rgba(26,20,70,.88)'; c.beginPath(); c.roundRect(0, 0, w, h, 30); c.fill(); c.fillStyle = '#fff'; c.font = 'bold 34px "PingFang SC","Microsoft YaHei",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(label, w / 2, h / 2 + 2); });
  const lab = new THREE.Sprite(new THREE.SpriteMaterial({ map: lt, transparent: true })); lab.position.y = 6.3; lab.scale.set(6.6, 1.2, 1); pg.add(lab);
  pg.userData.spin = disc; return pg;
}

function ground(scene) {
  const grassTex = canvasTex(512, 512, (g, w) => {
    g.fillStyle = '#7ccf6a'; g.fillRect(0, 0, w, w);
    const r = rand(9);
    for (let i = 0; i < 2600; i++) { g.fillStyle = r() > .5 ? '#6ec25c' : '#8ad877'; g.fillRect(r() * w, r() * w, 3, 6); }
  });
  grassTex.wrapS = grassTex.wrapT = THREE.RepeatWrapping; grassTex.repeat.set(35, 35);
  const top = new THREE.Mesh(new THREE.CircleGeometry(ISLAND_R, 180), M(0xffffff, { map: grassTex }));
  top.rotation.x = -Math.PI / 2; scene.add(top);
  // 浮空岛的岩石底
  const rock = new THREE.Mesh(new THREE.ConeGeometry(ISLAND_R, 80, 64, 6, true), M(0x9c7a5b, { flatShading: true, side: THREE.DoubleSide }));
  rock.rotation.x = Math.PI; rock.position.y = -40.2; scene.add(rock);
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(ISLAND_R, ISLAND_R - 1, 2.4, 96, 1, true), M(0x6b8f3e, { side: THREE.DoubleSide }));
  rim.position.y = -1.2; scene.add(rim);
  // 小路：中心广场 + 通往各处的路
  const path = M(0xf3e1c0);
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(13, 48), path); plaza.rotation.x = -Math.PI / 2; plaza.position.set(0, .03, 10); scene.add(plaza);
  const road = (x1, z1, x2, z2, w = 5) => {
    const len = Math.hypot(x2 - x1, z2 - z1), m = new THREE.Mesh(new THREE.PlaneGeometry(w, len), path);
    m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(x2 - x1, z2 - z1);
    m.position.set((x1 + x2) / 2, .025, (z1 + z2) / 2); scene.add(m);
  };
  road(0, 10, 0, 74); road(-40, -6, -96, 6); road(38, -2, 86, 2); road(0, 10, -40, -6); road(0, 10, 38, -2); road(0, 10, -22, 38); road(0, 10, 0, -52); road(-24, -52, 24, -52, 6); road(-22, 38, -108, 92);
  // 边缘的栏杆
  const postMat = M(0xffffff), railMat = M(0xff9f43);
  for (let k = 0; k < 300; k++) {
    const a = k / 300 * Math.PI * 2, rr = ISLAND_R - 1.2;
    const post = new THREE.Mesh(new THREE.CylinderGeometry(.12, .12, 1.3, 6), postMat); post.position.set(Math.cos(a) * rr, .65, Math.sin(a) * rr); scene.add(post);
  }
  const rail = new THREE.Mesh(new THREE.TorusGeometry(ISLAND_R - 1.2, .08, 6, 240), railMat); rail.rotation.x = Math.PI / 2; rail.position.y = 1.2; scene.add(rail);
}

function tree(x, z, s = 1, kind = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.scale.setScalar(s);
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.3, .4, 2, 8), M(0x8b5a2b)); trunk.position.y = 1; g.add(trunk);
  if (kind === 0) {
    [[0, 2.8, 1.7], [.7, 2.4, 1.1], [-.6, 2.5, 1.2]].forEach(([dx, y, r]) => {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(r, 1), M(0x4caf50, { flatShading: true })); b.position.set(dx, y, 0); g.add(b);
    });
  } else {
    [[2.2, 1.8], [3.3, 1.3], [4.2, .8]].forEach(([y, r]) => {
      const c = new THREE.Mesh(new THREE.ConeGeometry(r, 1.6, 8), M(0x2e8b57, { flatShading: true })); c.position.y = y; g.add(c);
    });
  }
  return g;
}

function lamp(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(.1, .14, 4, 8), M(0x2b2d42)); pole.position.y = 2; g.add(pole);
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(.4, 12, 8), new THREE.MeshBasicMaterial({ color: 0xfff3b0 })); bulb.position.y = 4.2; g.add(bulb);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color: 0xffe08a, transparent: true, opacity: .7, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.position.y = 4.2; glow.scale.setScalar(3); g.add(glow);
  // 晚上路灯照在地上的一圈光
  const pool = new THREE.Mesh(new THREE.CircleGeometry(4.5, 32), new THREE.MeshBasicMaterial({ map: glowTex(), color: 0xffd98a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
  pool.rotation.x = -Math.PI / 2; pool.position.y = .06; g.add(pool);
  g.userData = { glow, pool, bulb };
  return g;
}

function fountain(x, z) {
  // 三层喷泉：水从上面的碗边像帘子一样一圈流下来，落到下面一层，最后流进大水池；水池边还有 8 道弧形水柱往中间喷
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const stone = M(0xf1ece2, { roughness: .55 }), stone2 = M(0xd9cfbf, { roughness: .6 }), gold = M(0xffc94d, { metalness: .5, roughness: .3 });
  // 水的纹理：一条条竖着的亮线（往下流）
  const streakTex = () => { const c = document.createElement('canvas'); c.width = 128; c.height = 256; const x = c.getContext('2d');
    x.fillStyle = 'rgba(160,215,255,.7)'; x.fillRect(0, 0, 128, 256);
    for (let i = 0; i < 70; i++) { const px = Math.random() * 128, w = 1 + Math.random() * 3, y0 = Math.random() * 256, len = 40 + Math.random() * 160;
      const gr = x.createLinearGradient(0, y0, 0, y0 + len); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(.5, `rgba(255,255,255,${.35 + Math.random() * .5})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
      x.fillStyle = gr; x.fillRect(px, y0, w, len); x.fillRect(px, y0 - 256, w, len); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; };
  const rippleTex = () => { const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
    const gr = x.createRadialGradient(128, 128, 10, 128, 128, 128); gr.addColorStop(0, '#5fb8f5'); gr.addColorStop(1, '#2f8fd8'); x.fillStyle = gr; x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(255,255,255,.28)'; for (let i = 0; i < 40; i++) { x.lineWidth = 1 + Math.random() * 2; x.beginPath(); const px = Math.random() * 256, py = Math.random() * 256; x.ellipse(px, py, 10 + Math.random() * 25, 3 + Math.random() * 5, 0, 0, Math.PI * 2); x.stroke(); }
    const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t; };
  const waterMat = (tex, o = .78) => new THREE.MeshStandardMaterial({ map: tex, transparent: true, opacity: o, roughness: .05, metalness: .1, side: THREE.DoubleSide, depthWrite: false });
  const scroll = [];                                     // 要动起来的纹理 [tex, 速度u, 速度v]
  // ---------- 大水池 ----------
  const R0 = 6.6;
  const rimPts = [new THREE.Vector2(R0 - .5, 0), new THREE.Vector2(R0 + .35, 0), new THREE.Vector2(R0 + .35, .7), new THREE.Vector2(R0 + .55, .85), new THREE.Vector2(R0 + .3, 1.0), new THREE.Vector2(R0 - .35, 1.0), new THREE.Vector2(R0 - .35, .2)];
  g.add(new THREE.Mesh(new THREE.LatheGeometry(rimPts, 64), stone));
  const floor = new THREE.Mesh(new THREE.CircleGeometry(R0 - .3, 64), M(0x3b7fb8)); floor.rotation.x = -Math.PI / 2; floor.position.y = .08; g.add(floor);
  // 池底的马赛克花纹
  for (let k = 0; k < 16; k++) { const a = k / 16 * Math.PI * 2, t = new THREE.Mesh(new THREE.CircleGeometry(.35, 6), M(k % 2 ? 0xffd43b : 0xffffff)); t.rotation.x = -Math.PI / 2; t.position.set(Math.cos(a) * 4.6, .1, Math.sin(a) * 4.6); g.add(t); }
  const poolTex = rippleTex(); poolTex.repeat.set(2, 2); scroll.push([poolTex, .02, .015]);
  const pool = new THREE.Mesh(new THREE.CircleGeometry(R0 - .3, 64), waterMat(poolTex, .72)); pool.rotation.x = -Math.PI / 2; pool.position.y = .72; g.add(pool);
  // 水池边的小彩灯（晚上亮）
  for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, b = new THREE.Mesh(new THREE.SphereGeometry(.12, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd9d4c8 }));
    b.position.set(Math.cos(a) * (R0 - .4), .82, Math.sin(a) * (R0 - .4)); b.userData.nightBulb = [0x4dabf7, 0x63e6be, 0xda77f2, 0xffd43b][k % 4]; g.add(b); }
  // ---------- 中间的柱子和两层碗 ----------
  const bowl = (r, y, depth) => { const pts = [new THREE.Vector2(.5, y - depth), new THREE.Vector2(r * .55, y - depth * .7), new THREE.Vector2(r * .9, y - depth * .25), new THREE.Vector2(r, y), new THREE.Vector2(r + .12, y + .1), new THREE.Vector2(r - .12, y + .14), new THREE.Vector2(r * .9, y - depth * .1), new THREE.Vector2(.4, y - depth * .55)];
    g.add(new THREE.Mesh(new THREE.LatheGeometry(pts, 48), stone));
    const wt = rippleTex(); wt.repeat.set(1, 1); scroll.push([wt, .03, .02]);
    const w = new THREE.Mesh(new THREE.CircleGeometry(r - .1, 48), waterMat(wt, .8)); w.rotation.x = -Math.PI / 2; w.position.y = y + .06; g.add(w); };
  const colPts = [[1.1, 0], [1.1, .3], [.75, .45], [.55, .9], [.65, 1.2], [.45, 1.5], [.45, 2.6], [.6, 2.8], [.38, 3.0], [.38, 4.1], [.5, 4.3], [0, 4.4]].map(([a, b]) => new THREE.Vector2(a, b));
  g.add(new THREE.Mesh(new THREE.LatheGeometry(colPts, 32), stone2));
  const B1 = { r: 3.4, y: 2.75 }, B2 = { r: 1.9, y: 4.35 };
  bowl(B1.r, B1.y, .7); bowl(B2.r, B2.y, .5);
  // 碗边的金色装饰
  [B1, B2].forEach(b => { const t = new THREE.Mesh(new THREE.TorusGeometry(b.r + .02, .06, 8, 64), gold); t.rotation.x = Math.PI / 2; t.position.y = b.y + .12; g.add(t); });
  // ---------- 水帘：从碗边一圈流下来（往外鼓一点，再垂下去） ----------
  const curtain = (r, yTop, yBot) => { const pts = []; for (let i = 0; i <= 12; i++) { const u = i / 12; pts.push(new THREE.Vector2(r + .15 + .55 * Math.sqrt(u), yTop - (yTop - yBot) * u * u * .4 - (yTop - yBot) * .6 * u)); }
    const tex = streakTex(); tex.repeat.set(10, 1); scroll.push([tex, 0, .9]);
    const m = new THREE.Mesh(new THREE.LatheGeometry(pts, 64), waterMat(tex, .8)); g.add(m);
    // 落下去的地方：一圈白白的水花
    const ft = new THREE.Mesh(new THREE.RingGeometry(r + .3, r + 1.25, 64), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide }));
    ft.rotation.x = -Math.PI / 2; ft.position.y = yBot + .05; g.add(ft); foam.push(ft); };
  const foam = [];
  curtain(B2.r, B2.y + .1, B1.y + .06);
  curtain(B1.r, B1.y + .1, .74);
  // ---------- 最上面：小黄鸡雕像，头顶一股水往上喷，像小伞一样散开落回上面的碗 ----------
  const chick = new THREE.Group(); chick.position.y = B2.y + .1;
  const cb = new THREE.Mesh(new THREE.SphereGeometry(.62, 18, 14), gold); cb.position.y = .55; chick.add(cb);
  const ch = new THREE.Mesh(new THREE.SphereGeometry(.42, 18, 14), gold); ch.position.set(0, 1.25, .12); chick.add(ch);
  const beak = new THREE.Mesh(new THREE.ConeGeometry(.12, .3, 8), M(0xff8c00)); beak.rotation.x = Math.PI / 2; beak.position.set(0, 1.2, .58); chick.add(beak);
  [-1, 1].forEach(s => { const e = new THREE.Mesh(new THREE.SphereGeometry(.06, 8, 6), M(0x111111)); e.position.set(s * .17, 1.35, .48); chick.add(e); });
  g.add(chick);
  const jetTex = streakTex(); jetTex.repeat.set(2, 1); scroll.push([jetTex, 0, -1.6]);
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(.09, .16, 1.3, 16, 1, true), waterMat(jetTex, .7)); jet.position.y = B2.y + 1.7 + .65; g.add(jet);
  const umbPts = []; for (let i = 0; i <= 14; i++) { const u = i / 14; umbPts.push(new THREE.Vector2(.08 + u * 1.45, B2.y + 3.0 + .3 * Math.sin(u * Math.PI * .6) - u * u * 2.6)); }
  const umbTex = streakTex(); umbTex.repeat.set(8, 1); scroll.push([umbTex, 0, 1.1]);
  g.add(new THREE.Mesh(new THREE.LatheGeometry(umbPts, 48), waterMat(umbTex, .45)));
  // ---------- 水池边 8 道弧形水柱，往中间的大碗喷 ----------
  const arcTex = streakTex(); arcTex.rotation = Math.PI / 2; arcTex.repeat.set(1, 1); scroll.push([arcTex, 0, -1.3]);
  const arcMat = waterMat(arcTex, .7);
  for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2 + Math.PI / 8, ca = Math.cos(a), sa = Math.sin(a), pts = [];
    for (let i = 0; i <= 16; i++) { const u = i / 16, r = (R0 - .6) - u * (R0 - .6 - B1.r - .6), y = .9 + u * 2.6 - u * u * 2.75; pts.push(new THREE.Vector3(ca * r, y, sa * r)); }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, .07, 8, false), arcMat); g.add(tube);
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(.12, .16, .25, 10), gold); noz.position.set(ca * (R0 - .6), .82, sa * (R0 - .6)); g.add(noz); }
  // 雾气 / 小水珠：只在水落下的地方飘一点点
  const mistG = new THREE.BufferGeometry(), MN = 120, mp = new Float32Array(MN * 3), mv = [];
  for (let i = 0; i < MN; i++) { const ring = i % 2 ? B1.r + .7 : (i % 3 ? B2.r + .65 : 0.1); const a = Math.random() * 6.283; mp.set([Math.cos(a) * ring, i % 2 ? .9 : B1.y + .2, Math.sin(a) * ring], i * 3); mv.push({ a, ring, base: i % 2 ? .9 : (ring < .5 ? B2.y + 2.8 : B1.y + .2), t: Math.random() }); }
  mistG.setAttribute('position', new THREE.BufferAttribute(mp, 3));
  const mist = new THREE.Points(mistG, new THREE.PointsMaterial({ color: 0xe7f5ff, size: .12, transparent: true, opacity: .7, depthWrite: false }));
  g.add(mist);
  let T = 0;
  return { group: g, update(dt) {
    T += dt;
    scroll.forEach(([t, u, v]) => { t.offset.x = (t.offset.x + u * dt) % 1; t.offset.y = (t.offset.y + v * dt) % 1; });
    foam.forEach((f, k) => { const s = 1 + Math.sin(T * 6 + k) * .04; f.scale.set(s, s, 1); f.material.opacity = .35 + .15 * Math.sin(T * 9 + k * 2); });
    chick.rotation.y += dt * .35;
    for (let i = 0; i < MN; i++) { const m = mv[i]; m.t = (m.t + dt * 1.4) % 1; const r = m.ring + m.t * .5; mp[i * 3] = Math.cos(m.a) * r; mp[i * 3 + 1] = m.base + Math.sin(m.t * Math.PI) * .45; mp[i * 3 + 2] = Math.sin(m.a) * r; }
    mistG.attributes.position.needsUpdate = true;
  } };
}

function signTexture(icon, text, bg, w = 512) {
  return canvasTex(w, 160, (g, w, h) => {
    g.fillStyle = bg; g.beginPath(); g.roundRect(6, 6, w - 12, h - 12, 40); g.fill();
    g.strokeStyle = '#ffffff'; g.lineWidth = 10; g.stroke();
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    // 字号自动缩小到放得下
    let size = 78; const str = icon + ' ' + text;
    do { g.font = `bold ${size}px "PingFang SC","Microsoft YaHei",sans-serif`; size -= 4; } while (g.measureText(str).width > w - 60 && size > 20);
    g.fillText(str, w / 2, h / 2 + 4);
  });
}

// 商店建筑：x,z 门口朝 +Z（rotY 可调）
function shopBuilding(x, z, rotY, { color, roof, icon, name }) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY;
  const walls = new THREE.Mesh(new THREE.BoxGeometry(12, 8.6, 9), M(0xfff6ec)); walls.position.y = 4.3; g.add(walls);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(12.1, 1.2, 9.1), M(color)); stripe.position.y = .6; g.add(stripe);
  const roofM = new THREE.Mesh(new THREE.ConeGeometry(9, 4, 4), M(roof)); roofM.rotation.y = Math.PI / 4; roofM.scale.set(1, 1, .75); roofM.position.y = 10.6; g.add(roofM);
  // 条纹遮阳篷
  for (let k = 0; k < 8; k++) {
    const aw = new THREE.Mesh(new THREE.BoxGeometry(1.5, .15, 2.4), M(k % 2 ? 0xffffff : color));
    aw.position.set(-5.25 + k * 1.5, 5.3, 5.4); aw.rotation.x = .35; g.add(aw);
  }
  const door = new THREE.Mesh(new THREE.BoxGeometry(3, 4.2, .2), M(0x5a3b22)); door.position.set(0, 2.1, 4.55); g.add(door);
  const knob = new THREE.Mesh(new THREE.SphereGeometry(.15, 8, 6), M(0xffd23f, { metalness: .8 })); knob.position.set(1, 2.1, 4.7); g.add(knob);
  [-1, 1].forEach(s => {
    const win = new THREE.Mesh(new THREE.BoxGeometry(2.4, 2, .2), M(0xbde0fe, { emissive: 0xfff3b0, emissiveIntensity: .35 })); win.position.set(s * 3.8, 3.4, 4.55); g.add(win);
  });
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(8.4, 2.6), new THREE.MeshBasicMaterial({ map: signTexture(icon, name, color), transparent: true }));
  sign.position.set(0, 7.2, 4.62); g.add(sign);
  // 门前的大图标（转圈）
  const iconSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: canvasTex(128, 128, (c, w) => {
    c.font = '96px serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(icon, w / 2, w / 2 + 6); }), transparent: true }));
  iconSprite.position.set(0, 14.5, 0); iconSprite.scale.setScalar(4); g.add(iconSprite);
  const fwd = new THREE.Vector3(Math.sin(rotY), 0, Math.cos(rotY));
  return { group: g, entry: [x + fwd.x * 7.5, z + fwd.z * 7.5], collider: [x, z, 7.2], update(t) { iconSprite.position.y = 14.5 + Math.sin(t * 2 + x) * .4; } };
}

// 到达用的星门（站在旁边按 E / 点"起飞"离开）
function arrivalGate(x, z) {
  const g = new THREE.Group(); g.position.set(x, 0, z);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(5, .5, 16, 64), M(0xdfe6ff, { metalness: .6, roughness: .3, emissive: 0xffb84d, emissiveIntensity: .7 }));
  ring.position.y = 5.5; g.add(ring);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(4.6, 48), new THREE.MeshBasicMaterial({ map: swirlTex(), color: 0xffe0b0, transparent: true, opacity: .55, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  disc.position.y = 5.5; g.add(disc);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(4, 4.6, .6, 24), M(0xb0b8d0, { metalness: .4 })); base.position.y = .3; g.add(base);
  for (let k = 0; k < 9; k++) {
    const a = k / 9 * Math.PI * 2, ch = new THREE.Mesh(new THREE.BoxGeometry(.9, .7, .7), new THREE.MeshBasicMaterial({ color: 0xffc46b }));
    ch.position.set(Math.cos(a) * 5.3, 5.5 + Math.sin(a) * 5.3, 0); ch.rotation.z = a; g.add(ch);
  }
  return { group: g, entry: [x, z - 5], update(dt) { disc.rotation.z -= dt * 2; } };
}

export const SHOPS = [
  { key: 'ship', name: '飞船商店', icon: '🚀', color: '#4dabf7', roof: 0x1c7ed6 },
  { key: 'skin', name: '皮肤商店', icon: '👕', color: '#f783ac', roof: 0xd6336c },
  { key: 'prop', name: '道具商店', icon: '🎒', color: '#ffa94d', roof: 0xe8590c },
];

export function buildWorld(scene) {
  ground(scene);
  const colliders = [], interact = [], updaters = [];
  const skyRefs = sky(scene);
  // 游乐设施
  const rides = [ferrisWheel(-46, -8, Math.PI / 2.6), rollerCoaster(40, -14), carousel(-24, 42), pirateShip(40, 50)];
  // 鬼屋（大迷宫，自己走进去）：在过山车东边，门朝西
  const mansion = hauntedMansion(102, 12, -Math.PI / 2); scene.add(mansion.group);
  interact.push({ type: 'mansion', mansion, pos: mansion.entry, r: mansion.entryR });
  // 卡丁车岛（单独一座大岛，离这里很远）+ 两边的传送门
  const kart = buildKartIsland(scene); colliders.push(...kart.colliders);
  interact.push({ type: 'kart', kart, pos: kart.entry, r: kart.entryR });
  const toKart = portalGate(scene, -100, 6, 0xff922b, '🏎️ 去卡丁车岛');
  updaters.push(dt => toKart.userData.spin.rotation.z += dt);
  const portals = [
    { pos: [-100, 6], r: 2.6, to: { x: kart.arrive.x, z: kart.arrive.z, yaw: -Math.PI / 2 }, label: '🏎️ 欢迎来到卡丁车岛！' },
    { pos: kart.backPortal.pos, r: 2.6, to: { x: -96, z: 6, yaw: Math.PI / 2 }, label: '🎡 回到菜鸟星球乐园' },
  ];
  updaters.push(dt => kart.update(dt));
  rides.forEach(r => { scene.add(r.group); colliders.push(...r.colliders); interact.push({ type: 'ride', ride: r, pos: r.entry, r: r.entryR }); updaters.push((dt, t) => r.update(dt, t)); });
  // 碰碰车场（西南边）
  const bumper = bumperArena(-110, 75); scene.add(bumper.group); colliders.push(...bumper.colliders);
  interact.push({ type: 'bumper', bumper, pos: bumper.entry, r: bumper.entryR });
  updaters.push(dt => { if (!bumper.mine) bumper.update(dt); });
  // 商店一排在北边
  const shopPos = [[-24, -62, 0], [0, -66, 0], [24, -62, 0]];
  SHOPS.forEach((s, i) => {
    const b = shopBuilding(shopPos[i][0], shopPos[i][1], shopPos[i][2], { color: s.color, roof: s.roof, icon: s.icon, name: s.name });
    scene.add(b.group); colliders.push(b.collider); interact.push({ type: 'shop', shop: s, pos: b.entry, r: 4.5 }); updaters.push((dt, t) => b.update(t));
  });
  const f = fountain(0, 10); scene.add(f.group); colliders.push([0, 10, 7.3]); updaters.push(dt => f.update(dt));
  const gate = arrivalGate(0, 80); scene.add(gate.group); interact.push({ type: 'gate', pos: gate.entry, r: 5 }); updaters.push(dt => gate.update(dt));
  // 树、路灯、花
  const r = rand(21), blocked = [[-110, 75, 30], [0, 125, 42], [140, -95, 60], [-130, -100, 18], [0, 10, 16], [-46, -8, 16], [40, -14, 34], [-24, 42, 11], [40, 50, 20], [0, -62, 34], [0, 80, 9], [0, 40, 5]];
  for (let i = 0; i < 240; i++) {
    const a = r() * Math.PI * 2, d = 20 + r() * (ISLAND_R - 28), x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (Math.hypot(x + 100, z - 6) < 6 || mansion.near(x, z)) continue;
    if (blocked.some(([bx, bz, br]) => Math.hypot(x - bx, z - bz) < br)) continue;
    if (Math.abs(Math.hypot(x, z) - 190) < 9) continue;                 // 小火车的轨道
    if (Math.abs(x) < 4 && z > 10) continue; // 主路
    const s = .8 + r() * .6; scene.add(tree(x, z, s, r() > .6 ? 1 : 0)); colliders.push([x, z, .7 * s]);
  }
  const lamps = [];
  [[-5, 25], [5, 25], [-5, 50], [5, 50], [-5, 68], [5, 68], [-14, -50], [14, -50], [16, 2], [-16, 2], [-30, 0], [30, 22], [-16, 30], [24, 34], [-36, -24], [-12, -30]].forEach(([x, z]) => { const l = lamp(x, z); scene.add(l); lamps.push(l); colliders.push([x, z, .4]); });
  // 欢迎牌
  // 入口拱门：牌子挂得高一点，不挡视线
  const welcome = new THREE.Mesh(new THREE.PlaneGeometry(12, 2.4), new THREE.MeshBasicMaterial({ map: signTexture('🐣', '欢迎来到菜鸟星球', '#ff6b35', 800), transparent: true, side: THREE.DoubleSide }));
  welcome.position.set(0, 9.2, 62); scene.add(welcome);
  [-6.2, 6.2].forEach(x => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.28, .28, 10.4, 8), M(0xffffff)); p.position.set(x, 5.2, 62); scene.add(p); colliders.push([x, 62, .5]);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(.55, 12, 8), M(0xffd23f)); ball.position.set(x, 10.6, 62); scene.add(ball); });
  // 晚上会亮的东西：发光材质（白天弱、晚上强）
  const glowMats = [];
  scene.traverse(o => { if (o.isMesh && o.material && o.material.emissive && o.material.emissiveIntensity > 0 && !o.material.userData.night) {
    o.material.userData.night = { day: o.material.emissiveIntensity, night: Math.min(2.2, o.material.emissiveIntensity * 3 + .4) }; glowMats.push(o.material); } });
  // ---------- 彩灯串：岛边一圈 + 大道上的路灯之间，晚上亮，还会一闪一闪地“跑” ----------
  { const spans = [], poles = [];
    const RR = ISLAND_R - 6, NP = 40;
    for (let k = 0; k < NP; k++) { const a0 = k / NP * Math.PI * 2, a1 = (k + 1) / NP * Math.PI * 2; spans.push([[Math.cos(a0) * RR, 5.2, Math.sin(a0) * RR], [Math.cos(a1) * RR, 5.2, Math.sin(a1) * RR], 1.3]); poles.push([Math.cos(a0) * RR, Math.sin(a0) * RR]); }
    [[25, 50], [50, 68]].forEach(([z0, z1]) => { spans.push([[-5, 4.1, z0], [5, 4.1, z1], 1], [[5, 4.1, z0], [-5, 4.1, z1], 1]); });
    [25, 50, 68].forEach(z => spans.push([[-5, 4.1, z], [5, 4.1, z], .9]));
    const pts = [];
    spans.forEach(([A, B, sag]) => { const L = Math.hypot(B[0] - A[0], B[2] - A[2]), n = Math.max(4, Math.round(L / 1.7));
      for (let i = 0; i < n; i++) { const u = (i + .5) / n; pts.push([A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u - sag * 4 * u * (1 - u), A[2] + (B[2] - A[2]) * u]); } });
    const COLS = [0xff6b6b, 0xffd43b, 0x69db7c, 0x4dabf7, 0xda77f2].map(c => new THREE.Color(c));
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const im = new THREE.InstancedMesh(new THREE.SphereGeometry(.17, 8, 6), bulbMat, pts.length), o = new THREE.Object3D();
    pts.forEach((p, i) => { o.position.set(...p); o.updateMatrix(); im.setMatrixAt(i, o.matrix); im.setColorAt(i, COLS[i % 5]); });
    im.userData.nightBulb = 0xffffff; scene.add(im);
    // 电线
    spans.forEach(([A, B, sag]) => { const c = []; for (let i = 0; i <= 10; i++) { const u = i / 10; c.push(new THREE.Vector3(A[0] + (B[0] - A[0]) * u, A[1] + .15 + (B[1] - A[1]) * u - sag * 4 * u * (1 - u), A[2] + (B[2] - A[2]) * u)); }
      scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(c), new THREE.LineBasicMaterial({ color: 0x343a40 }))); });
    const pm = M(0x495057), pi = new THREE.InstancedMesh(new THREE.CylinderGeometry(.09, .12, 5.4, 6), pm, poles.length);
    poles.forEach(([x, z], i) => { o.position.set(x, 2.7, z); o.updateMatrix(); pi.setMatrixAt(i, o.matrix); }); scene.add(pi);
    const tc = new THREE.Color();
    updaters.push((dt, t) => { const ph = (t || performance.now() / 1000) * 3;
      for (let i = 0; i < pts.length; i++) { const k = .45 + .55 * Math.max(0, Math.sin(i * .5 - ph)); im.setColorAt(i, tc.copy(COLS[i % 5]).multiplyScalar(k)); }
      im.instanceColor.needsUpdate = true; }); }
  return { colliders, interact, rides, kart, bumper, mansion, portals, KI, sky: skyRefs, lamps, glowMats, update: (dt, t) => updaters.forEach(u => u(dt, t)) };
}
