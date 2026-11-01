// ===== 烟花秀：每天晚上开始 1 分钟后，放 3 分钟 =====
// 按共享时钟和“第几个晚上”生成同一套节目单，所有人看到的一样（谁中途进来就从中间开始看）
// 开场：小菜鸟形状 + 「烟花秀」三个字 → 中间越来越热闹 → 大结局 → 最后再放一个小菜鸟
import { SHOW_START, SHOW_LEN } from './daynight.js';

function seeded(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// 小菜鸟的轮廓（一组 2D 点，大约在 -1..1 范围）
function chickPts() {
  const pts = [], circ = (cx, cy, r, n, a0 = 0, a1 = Math.PI * 2) => { for (let i = 0; i < n; i++) { const a = a0 + (a1 - a0) * i / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
  circ(-.15, -.3, .62, 70);                 // 身体
  circ(.3, .42, .4, 50);                    // 头
  circ(.42, .5, .06, 8);                    // 眼睛
  [[.7, .48], [.95, .4], [.7, .32]].forEach(([x, y], i, a) => { const [x2, y2] = a[(i + 1) % 3]; for (let k = 0; k < 6; k++) pts.push([x + (x2 - x) * k / 6, y + (y2 - y) * k / 6]); });   // 嘴
  circ(-.25, -.25, .3, 18, Math.PI * .1, Math.PI * .9);   // 翅膀
  [[-.35, -.92], [.05, -.92]].forEach(([x, y]) => { for (let k = 0; k < 5; k++) pts.push([x, y + k * .05]); [-1, 0, 1].forEach(d => { for (let k = 1; k < 4; k++) pts.push([x + d * k * .05, y - k * .03]); }); });   // 脚
  [[.22, .85], [.3, .9], [.36, .84]].forEach(([x, y]) => circ(x, y, .05, 6));   // 头上的毛
  return pts;
}
// 文字 → 点
function textPts(text, step = 4) {
  const c = document.createElement('canvas'); c.width = 360; c.height = 120;
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.font = 'bold 100px "PingFang SC","Microsoft YaHei",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 180, 64);
  const d = g.getImageData(0, 0, 360, 120).data, pts = [];
  for (let y = 0; y < 120; y += step) for (let x = 0; x < 360; x += step) if (d[(y * 360 + x) * 4 + 3] > 140) pts.push([(x - 180) / 60, -(y - 60) / 60]);
  return pts;
}

// 颜色：每一发自己挑，有单色、相近两色、撞色、彩虹、金色、银色
function pickColors(r) {
  const hsl = (h, l = .55) => { const c = { r: 0, g: 0, b: 0 }; const a = 1 * Math.min(l, 1 - l), f = n => { const k = (n + h * 12) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
    return (Math.round(f(0) * 255) << 16) | (Math.round(f(8) * 255) << 8) | Math.round(f(4) * 255); };
  const h = r(), k = r();
  if (k < .28) return [hsl(h), hsl(h, .62)];                                   // 单色
  if (k < .5) return [hsl(h), hsl((h + .07 + r() * .06) % 1)];                 // 相近两色（渐变）
  if (k < .66) return [hsl(h), hsl((h + .5) % 1)];                             // 撞色
  if (k < .76) return [0xff4d4d, 0xffd43b, 0x51cf66, 0x4dabf7, 0xcc5de8];       // 彩虹
  if (k < .86) return [0xffd43b, 0xffc078, 0xfff3bf];                          // 金色
  if (k < .93) return [0xf1f3f5, 0xd0ebff, 0xffffff];                          // 银色
  return [hsl(h), 0xffffff];                                                   // 彩色 + 白闪
}
// 大多是普通烟花（爆开的样子不一样），偶尔才有图形
const NORMAL = [['peony', 5], ['chrys', 4], ['palm', 3], ['dahlia', 3], ['crossette', 2], ['glitter', 3], ['double', 2], ['willow', 2], ['crackle', 2], ['saturn', 1.5]];
const SHAPED = ['heart', 'star', 'smile', 'ring'];
function pickType(r) {
  if (r() < .06) return SHAPED[Math.floor(r() * SHAPED.length)];
  const tot = NORMAL.reduce((a, [, w]) => a + w, 0); let x = r() * tot;
  for (const [n, w] of NORMAL) { x -= w; if (x <= 0) return n; } return 'peony';
}

// 生成某一个晚上的节目单：[{ t: 第几秒, d: 发射参数 }]
export function showProgram(nightIndex) {
  const r = seeded(nightIndex * 7919 + 101), ev = [];
  const seed = () => Math.floor(r() * 1e9);
  const at = (x, z) => [x, 1, 10 + z];
  const add = (t, d) => ev.push({ t, d: { scale: 1.7 + r() * .5, top: 38 + r() * 16, ...d } });
  const one = (t, x, z, extra = {}) => add(t, { p: at(x, z), shape: pickType(r), colors: pickColors(r), seed: seed(), ...extra });
  const X = () => (r() - .5) * 56, Z = () => (r() - .5) * 22;
  // 开场
  add(0, { p: at(0, 0), pts2d: chickPts(), colors: [0xffd43b, 0xff922b], top: 42, scale: 2.4, seed: seed() });
  add(3.2, { p: at(0, 0), pts2d: textPts('烟花秀'), colors: [0xff6b9d, 0xffd43b, 0xffffff], top: 55, scale: 2.3, seed: seed() });
  // 第一段（7–50 秒）：一发接一发，常常两发一起
  for (let t = 7; t < 50; t += .7 + r() * .8) { one(t, X(), Z()); if (r() < .35) one(t + .1 + r() * .3, X(), Z()); }
  // 第二段（50–95 秒）：齐射，2–4 发一起（左右对称，同样子同颜色）+ 中间穿插单发
  for (let t = 50; t < 95; t += 2 + r() * 1.2) {
    const n = 2 + Math.floor(r() * 3), shape = pickType(r), colors = pickColors(r), top = 38 + r() * 12, sp = 10 + r() * 10;
    for (let k = 0; k < n; k++) { const x = (k - (n - 1) / 2) * sp; add(t + Math.abs(x) * .004, { p: at(x, (r() - .5) * 6), shape, colors, seed: seed(), top }); }
    if (r() < .7) one(t + 1 + r() * .6, X(), Z());
  }
  // 第三段（95–130 秒）：一排扫过去 + 中间一颗大菊花，空当里也有单发
  for (let t = 95; t < 130; t += 4.6 + r() * 1.2) {
    const dir = r() < .5 ? 1 : -1, shape = pickType(r), colors = pickColors(r);
    for (let k = 0; k < 7; k++) add(t + k * .28, { p: at(dir * (-30 + k * 10), -4), shape, colors, seed: seed(), top: 34 + k * 2.2 });
    add(t + 2.4, { p: at((r() - .5) * 8, 0), shape: r() < .5 ? 'chrys' : 'willow', colors: pickColors(r), seed: seed(), top: 58, scale: 2.4 });
    for (let k = 0; k < 3; k++) one(t + 2.8 + k * .6, X(), Z());
  }
  // 第四段（130–150 秒）：很快的混合
  for (let t = 130; t < 150; t += .35 + r() * .4) one(t, X(), Z());
  // 大结局（150–172 秒）：越来越密，最后一片金色柳枝
  for (let t = 150; t < 168; t += Math.max(.1, .32 - (t - 150) * .012)) one(t, X() * 1.1, Z(), { shape: ['peony', 'crackle', 'glitter', 'chrys', 'dahlia', 'crossette', 'palm'][Math.floor(r() * 7)] });
  for (let k = 0; k < 9; k++) add(168 + k * .12, { p: at(-36 + k * 9, 0), shape: 'willow', colors: [0xffd43b, 0xffc078, 0xfff3bf], seed: seed(), top: 52, scale: 2.3 });
  // 最后一个小菜鸟
  add(SHOW_LEN - 5, { p: at(0, 0), pts2d: chickPts(), colors: [0xffd43b, 0xff922b, 0xffffff], top: 48, scale: 3, seed: seed() });
  return ev.sort((a, b) => a.t - b.t);
}

export function createFireShow({ abil, banner, music }) {
  let night = -1, prog = [], last = null, said = {};
  addEventListener('xcn-time-jump', () => { last = null; said = {}; });     // 管理员跳时间后重新开始算
  function update(I) {
    if (I.phase !== 'night') { last = null; music && music(false); return null; }
    if (I.nightIndex !== night) { night = I.nightIndex; prog = showProgram(night); said = {}; last = null; }
    const st = I.nightT - SHOW_START;                  // 烟花秀开始后的第几秒（负数 = 还没开始）
    // 提示
    if (st < 0 && st > -60 && !said.pre) { said.pre = 1; banner(`🎆 今晚的烟花秀 ${Math.ceil(-st)} 秒后开始！`, 4000); }
    if (st > -10.5 && st < 0 && !said.ten) { said.ten = 1; banner('🎆 烟花秀 10 秒后开始！抬头往乐园中间看～', 6000); }
    if (st >= 0 && st < 3 && !said.go) { said.go = 1; banner('🎆 烟花秀开始啦！', 3000); }
    if (st >= SHOW_LEN && st < SHOW_LEN + 5 && !said.end) { said.end = 1; banner('🐣 烟花秀结束，明天晚上见～', 4000); }
    music && music(st >= 0 && st <= SHOW_LEN);
    if (st < 0 || st > SHOW_LEN) { last = st; return st; }
    // 从上一帧到这一帧之间该放的烟花（中途进来的人，前面的就不补了）
    const from = last == null || last < 0 ? Math.max(0, st - .05) : last;
    prog.forEach(e => { if (e.t > from && e.t <= st) abil.launchFirework(e.d); });
    if (last == null && st > 0) prog.forEach(e => { if (e.t <= st && e.t > st - .05) abil.launchFirework(e.d); });
    last = st;
    return st;
  }
  return { update };
}
