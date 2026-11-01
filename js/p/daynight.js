// ===== 菜鸟星球的白天 / 晚上 =====
// 按真实时间算（所有人一样，没人在玩的时候时间也照样走）：一天 30 分钟
//   白天 19 分钟 → 日落 1.5 分钟 → 晚上 8 分钟 → 日出 1.5 分钟
// 晚上开始 1 分钟后放 3 分钟的烟花秀（见 fireshow.js）
import * as THREE from 'three';
import { rideClock } from './rides.js';

export const T_DAY = 1140, T_SUNSET = 90, T_NIGHT = 480, T_SUNRISE = 90;
export const DAY_LEN = T_DAY + T_SUNSET + T_NIGHT + T_SUNRISE;
export const SHOW_START = 60, SHOW_LEN = 180;
// 时间偏移只能由管理员的「测试时间」面板设置（jumpTo），普通玩家改不了
let OFFSET = 0, GLOBAL = 0;
export const now = () => rideClock() + GLOBAL + OFFSET;
// 管理员给“所有人”设置的时间偏移（存在数据库里，大家一起用）
export function setGlobalOffset(sec) { if (sec === GLOBAL) return; GLOBAL = sec || 0; dispatchEvent(new Event('xcn-time-jump')); }
export const globalOffset = () => GLOBAL;
// 要让“现在”变成一天里的第 target 秒，需要的总偏移
export function offsetFor(target) { const c = ((rideClock() % DAY_LEN) + DAY_LEN) % DAY_LEN; return Math.round(((target - c) % DAY_LEN + DAY_LEN) % DAY_LEN); }
// 管理员测试：把“我这边”的时间跳到一天里的某一秒（别人不受影响）；target = null 恢复正常
export function jumpTo(target) {
  if (target == null) OFFSET = 0;
  else { const c = (((rideClock() + GLOBAL) % DAY_LEN) + DAY_LEN) % DAY_LEN; OFFSET = ((target - c) % DAY_LEN + DAY_LEN) % DAY_LEN; }
  dispatchEvent(new Event('xcn-time-jump'));
}
export const isShifted = () => OFFSET !== 0;

export function dayInfo(t = now()) {
  const n = Math.floor(t / DAY_LEN), c = t - n * DAY_LEN;
  let phase, k, night;
  if (c < T_DAY) { phase = 'day'; k = c / T_DAY; night = 0; }
  else if (c < T_DAY + T_SUNSET) { phase = 'sunset'; k = (c - T_DAY) / T_SUNSET; night = k; }
  else if (c < T_DAY + T_SUNSET + T_NIGHT) { phase = 'night'; k = (c - T_DAY - T_SUNSET) / T_NIGHT; night = 1; }
  else { phase = 'sunrise'; k = (c - T_DAY - T_SUNSET - T_NIGHT) / T_SUNRISE; night = 1 - k; }
  const dusk = phase === 'sunset' || phase === 'sunrise' ? Math.sin(Math.PI * k) : 0;
  // 太阳从日出开始到日落结束走完半圈；月亮从日落开始到日出结束
  const sunSpan = T_SUNRISE + T_DAY + T_SUNSET, moonSpan = T_SUNSET + T_NIGHT + T_SUNRISE;
  const sinceRise = phase === 'sunrise' ? c - (T_DAY + T_SUNSET + T_NIGHT) : phase === 'night' ? null : c + T_SUNRISE;
  const sinceSet = phase === 'day' ? null : phase === 'sunrise' ? c - T_DAY : c - T_DAY;
  const nightT = phase === 'night' ? c - T_DAY - T_SUNSET : -1;
  // 离天黑（晚上开始）还有多久 / 离天亮（白天开始）还有多久
  const toNight = phase === 'night' ? 0 : (c < T_DAY + T_SUNSET ? T_DAY + T_SUNSET - c : DAY_LEN - c + T_DAY + T_SUNSET);
  const toDay = phase === 'day' ? 0 : DAY_LEN - c;
  return { t, phase, k, night, dusk, nightIndex: n, nightT, toNight, toDay,
    sunA: sinceRise == null ? -1 : sinceRise / sunSpan * Math.PI, moonA: sinceSet == null ? -1 : sinceSet / moonSpan * Math.PI };
}
export const mmss = s => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };

const C = h => new THREE.Color(h);
const PAL = {
  day: { top: C('#3d8bfd'), mid: C('#8fd3ff'), bot: C('#e3f6ff'), fog: C('#d9efff'), hemiSky: C('#fff4e0'), hemiGround: C('#6b8f3e') },
  dusk: { top: C('#3b2a8c'), mid: C('#ff8a7a'), bot: C('#ffc98a'), fog: C('#ffb89a'), hemiSky: C('#ffc9a8'), hemiGround: C('#5a4a6a') },
  night: { top: C('#03061a'), mid: C('#0f1745'), bot: C('#241f5c'), fog: C('#141a40'), hemiSky: C('#7d8cff'), hemiGround: C('#1a2240') },
};
function mix(key, night, dusk, out) {
  out.copy(PAL.day[key]).lerp(PAL.night[key], night).lerp(PAL.dusk[key], dusk * .85); return out;
}

function seeded(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function createDayNight({ scene, hemi, sun, world }) {
  const sky = world.sky, tmpC = new THREE.Color();
  // 晚上会点亮的小灯泡
  const bulbs = [];
  scene.traverse(o => { if (o.isMesh && o.userData.nightBulb != null) { bulbs.push({ m: o.material, on: new THREE.Color(o.userData.nightBulb) }); } });
  world.lamps.forEach(l => bulbs.push({ m: l.userData.bulb.material, on: new THREE.Color(0xfff3b0) }));
  const offC = new THREE.Color(0xd9d4c8);

  // 萤火虫：很少、很小；有的晚上没有
  const FF = 16, ffPos = new Float32Array(FF * 3), ffGeo = new THREE.BufferGeometry();
  ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const ffMat = new THREE.PointsMaterial({ size: .35, color: 0xfff27a, map: sky.stars.material.map, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending });
  const fireflies = new THREE.Points(ffGeo, ffMat); fireflies.frustumCulled = false; scene.add(fireflies);
  let ffNight = -1, ffCount = 0, ffSeed = [];
  function setupFireflies(n) {
    const r = seeded(n * 977 + 13);
    ffCount = r() < .35 ? 0 : 4 + Math.floor(r() * 9);          // 大约三分之一的晚上没有萤火虫
    ffSeed = Array.from({ length: FF }, () => ({ x: (r() - .5) * 140, z: (r() - .5) * 140, y: .6 + r() * 2.4, p: r() * 10, s: .3 + r() * .5 }));
    ffGeo.setDrawRange(0, ffCount); ffNight = n;
  }

  const sunDir = new THREE.Vector3();
  function update(dt, player) {
    const I = dayInfo();
    const { night, dusk } = I;
    // 天空
    mix('top', night, dusk, sky.uniforms.top.value); mix('mid', night, dusk, sky.uniforms.mid.value); mix('bot', night, dusk, sky.uniforms.bot.value);
    if (scene.fog) mix('fog', night, dusk, scene.fog.color);
    sky.stars.material.opacity = Math.pow(night, 1.5) * .95;
    sky.planets.forEach(p => { p.m.material.opacity = .35 + .65 * night; p.halo.material.opacity = .15 + .4 * night; });
    // 太阳 / 月亮在天上的位置（以玩家为中心，看起来很远）
    const place = (obj, a) => {
      obj.visible = a >= 0 && a <= Math.PI;
      if (!obj.visible) return;
      sunDir.set(-Math.cos(a) * .82, Math.sin(a) * .9 + .02, -.48).normalize();
      obj.position.copy(player).addScaledVector(sunDir, 480); obj.lookAt(player);
    };
    place(sky.sun, I.sunA); place(sky.moon, I.moonA);
    // 灯光：白天亮、晚上暗一些（还是要看得清）
    hemi.color.copy(mix('hemiSky', night, dusk, tmpC)); hemi.groundColor.copy(mix('hemiGround', night, dusk, tmpC));
    hemi.intensity = 1.3 - .7 * night;
    const lit = I.sunA >= 0 ? sky.sun : sky.moon;
    sun.position.copy(lit.visible ? lit.position.clone().sub(player).normalize().multiplyScalar(150) : new THREE.Vector3(60, 120, 40));
    sun.intensity = (1.8 * (1 - night)) + .5 * night;
    sun.color.set(night > .5 ? 0xaabbff : 0xffffff).lerp(PAL.dusk.hemiSky, dusk * .6);
    // 晚上开灯
    const on = THREE.MathUtils.smoothstep(night, .25, .8);
    bulbs.forEach(b => b.m.color.copy(offC).lerp(b.on, .35 + .65 * on));
    world.lamps.forEach(l => { l.userData.glow.material.opacity = .15 + .85 * on; l.userData.glow.scale.setScalar(2.5 + 2.5 * on); l.userData.pool.material.opacity = .55 * on; });
    world.glowMats.forEach(m => { const n = m.userData.night; m.emissiveIntensity = n.day + (n.night - n.day) * on; });
    // 萤火虫
    if (I.nightIndex !== ffNight) setupFireflies(I.nightIndex);
    ffMat.opacity = on * .9;
    if (on > .01) for (let i = 0; i < ffCount; i++) {
      const f = ffSeed[i], tt = I.t * f.s + f.p;
      ffPos[i * 3] = f.x + Math.sin(tt * .7) * 3; ffPos[i * 3 + 1] = f.y + Math.sin(tt * 1.3) * .5; ffPos[i * 3 + 2] = f.z + Math.cos(tt * .5) * 3;
    }
    ffGeo.attributes.position.needsUpdate = true;
    ffMat.size = .25 + Math.abs(Math.sin(I.t * 2.3)) * .15;
    return I;
  }
  return { update };
}
