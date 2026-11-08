// ===== 菜鸟家园 · 白天晚上 =====
// 用户定的：一天 40 分钟，其中晚上 15 分钟；晚上植物长得慢。
// 所有人同一个时间：按真实时钟算（1 个游戏小时 = 100 秒）。
//   天亮 6:00~7:48（3 分钟）→ 白天 7:48~19:12（19 分钟）→ 黄昏 19:12~21:00（3 分钟）→ 晚上 21:00~6:00（15 分钟）
import * as THREE from 'three';

export const DAY_SECONDS = 40 * 60, GAME_HOUR = DAY_SECONDS / 24;
const OFFSET_KEY = 'xcn_time_offset';
let offsetH = 0;
try { offsetH = +localStorage.getItem(OFFSET_KEY) || 0; } catch (e) {}
// 现在是游戏里的几点（0~24）
export function gameHour() { return (((Date.now() / 1000) / GAME_HOUR + offsetH) % 24 + 24) % 24; }
// 管理员测试：跳到某个时间（只改自己这台电脑看到的时间）
export function jumpTo(h) { const now = ((Date.now() / 1000) / GAME_HOUR) % 24; offsetH = ((h - now) % 24 + 24) % 24; try { localStorage.setItem(OFFSET_KEY, offsetH); } catch (e) {} }
export function resetTime() { offsetH = 0; try { localStorage.removeItem(OFFSET_KEY); } catch (e) {} }

// 天有多黑：0 白天 → 1 晚上，天亮和黄昏慢慢变
export function darkness(h = gameHour()) {
  if (h >= 21 || h < 6) return 1;
  if (h < 7.8) return 1 - (h - 6) / 1.8;
  if (h < 19.2) return 0;
  return (h - 19.2) / 1.8;
}
// 植物生长的倍数：白天 1，晚上 0.5
export const growLight = (h = gameHour()) => 1 - .5 * darkness(h);
export function phaseOf(h = gameHour()) {
  if (h >= 21 || h < 6) return { name: '晚上', icon: '🌙' };
  if (h < 7.8) return { name: '天亮', icon: '🌅' };
  if (h < 19.2) return { name: '白天', icon: '☀️' };
  return { name: '黄昏', icon: '🌇' };
}
export const clockText = (h = gameHour()) => `${String(Math.floor(h)).padStart(2, '0')}:${String(Math.floor((h % 1) * 60)).padStart(2, '0')}`;

// 一天里几个关键时刻的颜色、亮度，中间慢慢过渡
const C = c => new THREE.Color(c);
const KEYS = [
  { h: 0,    top: C(0x0a1230), bot: C(0x1d2b52), fog: C(0x172241), hemi: .22, sun: 0,   sunC: C(0xffffff), glow: C(0x000000) },
  { h: 5.4,  top: C(0x0a1230), bot: C(0x1d2b52), fog: C(0x172241), hemi: .22, sun: 0,   sunC: C(0xffffff), glow: C(0x000000) },
  { h: 6.9,  top: C(0x6f8fdc), bot: C(0xffb37a), fog: C(0xf0c4a0), hemi: .85, sun: 1.1, sunC: C(0xffb070), glow: C(0xff9a50) },
  { h: 8.2,  top: C(0x5eaefc), bot: C(0xe8f6ff), fog: C(0xd9efff), hemi: 1.4, sun: 2.3, sunC: C(0xfff0d8), glow: C(0xfff4c0) },
  { h: 18.8, top: C(0x5eaefc), bot: C(0xe8f6ff), fog: C(0xd9efff), hemi: 1.4, sun: 2.3, sunC: C(0xfff0d8), glow: C(0xfff4c0) },
  { h: 20.1, top: C(0x4b54a3), bot: C(0xff935a), fog: C(0xe39a78), hemi: .7,  sun: .9,  sunC: C(0xff8a50), glow: C(0xff7a40) },
  { h: 21.2, top: C(0x0a1230), bot: C(0x1d2b52), fog: C(0x172241), hemi: .22, sun: 0,   sunC: C(0xffffff), glow: C(0x000000) },
  { h: 24,   top: C(0x0a1230), bot: C(0x1d2b52), fog: C(0x172241), hemi: .22, sun: 0,   sunC: C(0xffffff), glow: C(0x000000) },
];
function sample(h) {
  let i = 0; while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1], t = THREE.MathUtils.smoothstep(h, a.h, b.h);
  return { top: a.top.clone().lerp(b.top, t), bot: a.bot.clone().lerp(b.bot, t), fog: a.fog.clone().lerp(b.fog, t),
    hemi: THREE.MathUtils.lerp(a.hemi, b.hemi, t), sun: THREE.MathUtils.lerp(a.sun, b.sun, t), sunC: a.sunC.clone().lerp(b.sunC, t), glow: a.glow.clone().lerp(b.glow, t) };
}

export function createSky({ scene, sun, hemi, clouds = [], cloudMat, center = () => new THREE.Vector3() }) {
  // 天空球：上下两种颜色渐变 + 太阳那边的光晕
  const uni = { top: { value: C(0x5eaefc) }, bot: { value: C(0xe8f6ff) }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, glow: { value: C(0xffffff) } };
  const skyMat = new THREE.ShaderMaterial({
    uniforms: uni, side: THREE.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform vec3 top; uniform vec3 bot; uniform vec3 sunDir; uniform vec3 glow; varying vec3 vP;
      void main(){ float h = max(vP.y, 0.0); vec3 c = mix(bot, top, pow(h, 0.55));
        float s = max(dot(vP, normalize(sunDir)), 0.0); c += glow * (pow(s, 6.0) * 0.35 + pow(s, 300.0) * 1.2);
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1400, 32, 16), skyMat); sky.renderOrder = -10; scene.add(sky);

  // 星星：晚上慢慢出现，一闪一闪
  const N = 1400, sp = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const u = Math.random() * Math.PI * 2, v = Math.acos(1 - Math.random() * .95); sp.set([Math.sin(v) * Math.cos(u) * 1300, Math.cos(v) * 1300, Math.sin(v) * Math.sin(u) * 1300], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 2.4, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(sg, starMat); scene.add(stars);
  // 月亮
  const moon = new THREE.Mesh(new THREE.SphereGeometry(34, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff6d8, fog: false, transparent: true }));
  scene.add(moon);
  const moonLight = new THREE.DirectionalLight(0x9db4ff, 0); scene.add(moonLight);
  // 萤火虫：晚上在人附近飘
  const FN = 140, fp = new Float32Array(FN * 3), fcol = new Float32Array(FN * 3), seeds = [];
  for (let i = 0; i < FN; i++) seeds.push({ x: (Math.random() - .5) * 80, z: (Math.random() - .5) * 80, y: .5 + Math.random() * 2, ph: Math.random() * 6.28, sp: .3 + Math.random() * .5 });
  const fg = new THREE.BufferGeometry(); fg.setAttribute('position', new THREE.BufferAttribute(fp, 3)); fg.setAttribute('color', new THREE.BufferAttribute(fcol, 3));
  // 萤火虫是一团圆圆的、中间亮外面淡的光
  const glowC = document.createElement('canvas'); glowC.width = glowC.height = 64; { const g = glowC.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.25, 'rgba(255,255,255,.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const flyMat = new THREE.PointsMaterial({ size: .45, map: new THREE.CanvasTexture(glowC), vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const flies = new THREE.Points(fg, flyMat); scene.add(flies);
  let flyCenter = null;

  let t = 0;
  function update(dt) {
    t += dt;
    const h = gameHour(), d = darkness(h), k = sample(h);
    uni.top.value.copy(k.top); uni.bot.value.copy(k.bot); uni.glow.value.copy(k.glow);
    if (scene.fog) scene.fog.color.copy(k.fog);
    hemi.intensity = k.hemi; hemi.color.copy(k.top).lerp(C(0xffffff), .6);
    // 太阳：6 点从东边升起，21 点落下；晚上在地平线下面
    const a = (h - 6) / 15 * Math.PI, dir = new THREE.Vector3(Math.cos(a) * .85, Math.sin(a), .42).normalize();
    uni.sunDir.value.copy(dir);
    sun.position.copy(dir).multiplyScalar(500); sun.target.position.set(0, 0, 0);
    sun.intensity = dir.y > -.05 ? k.sun : 0; sun.color.copy(k.sunC);
    // 月亮在太阳对面
    const md = dir.clone().multiplyScalar(-1); md.y = Math.abs(md.y) * .8 + .25; md.normalize();
    moon.position.copy(md).multiplyScalar(1150); moon.material.opacity = d; moon.visible = d > .05;
    moonLight.position.copy(md).multiplyScalar(500); moonLight.intensity = .5 * d;
    starMat.opacity = Math.max(0, d * 1.1 - .1) * (.85 + Math.sin(t * 3) * .05);
    stars.rotation.y = t * .002;
    if (cloudMat) cloudMat.color.setRGB(1, 1, 1).lerp(C(0x2a3456), d * .85), cloudMat.emissiveIntensity = .25 * (1 - d);
    // 萤火虫
    flyMat.opacity = d;
    flies.visible = d > .05;
    if (flies.visible) {
      const c = center();
      if (!flyCenter || flyCenter.distanceTo(c) > 30) flyCenter = c.clone();
      for (let i = 0; i < FN; i++) { const s = seeds[i];
        fp[i * 3] = flyCenter.x + s.x + Math.sin(t * s.sp + s.ph) * 2; fp[i * 3 + 1] = s.y + Math.sin(t * s.sp * 1.7 + s.ph) * .4; fp[i * 3 + 2] = flyCenter.z + s.z + Math.cos(t * s.sp * .8 + s.ph) * 2;
        const b = Math.max(0, Math.sin(t * 2.2 + s.ph * 3)); fcol[i * 3] = .85 * b; fcol[i * 3 + 1] = 1 * b; fcol[i * 3 + 2] = .35 * b; }
      fg.attributes.position.needsUpdate = true; fg.attributes.color.needsUpdate = true;
    }
    return { hour: h, dark: d };
  }
  return { update };
}
