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

const PALETTES = [
  [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2], [0xff8787, 0xffa94d, 0xffe066], [0x74c0fc, 0x9775fa, 0xf783ac],
  [0x63e6be, 0x4dabf7, 0xffffff], [0xffd43b, 0xff922b, 0xffffff], [0xf06595, 0xcc5de8, 0x845ef7],
];

// 生成某一个晚上的节目单：[{ t: 第几秒, d: 发射参数 }]
export function showProgram(nightIndex) {
  const r = seeded(nightIndex * 7919 + 101), ev = [];
  const pal = PALETTES[Math.floor(r() * PALETTES.length)];
  const col = () => { const a = pal[Math.floor(r() * pal.length)], b = pal[Math.floor(r() * pal.length)]; return a === b ? [a, 0xffffff] : [a, b]; };
  const seed = () => Math.floor(r() * 1e9);
  const at = (x, z) => [x, 1, 10 + z];
  const add = (t, d) => ev.push({ t, d: { scale: 1.8, top: 40 + r() * 10, ...d } });
  const shapes = ['ball', 'ring', 'heart', 'star', 'smile', 'double', 'willow', 'crackle'];
  const shp = () => shapes[Math.floor(r() * shapes.length)];
  // 开场
  add(0, { p: at(0, 0), pts2d: chickPts(), colors: [0xffd43b, 0xff922b], top: 42, scale: 2.4, seed: seed() });
  add(3.2, { p: at(0, 0), pts2d: textPts('烟花秀'), colors: [0xff6b9d, 0xffd43b, 0xffffff], top: 55, scale: 2.3, seed: seed() });
  // 第一段（7–60 秒）：一发一发，左右交替
  for (let t = 7.5; t < 60; t += 2.4 + r() * 1.4) add(t, { p: at((r() - .5) * 40, (r() - .5) * 16), shape: shp(), colors: col(), seed: seed() });
  // 第二段（60–110 秒）：左右成对，同样的形状
  for (let t = 60; t < 110; t += 2.6 + r()) { const dx = 12 + r() * 14, s = shp(), c = col(), sd = seed(), top = 42 + r() * 8;
    add(t, { p: at(-dx, 0), shape: s, colors: c, seed: sd, top }); add(t + .15, { p: at(dx, 0), shape: s, colors: c, seed: sd + 1, top }); }
  // 第三段（110–150 秒）：一排扫过去（从左到右或从右到左）+ 柳枝
  for (let t = 110; t < 150; t += 7 + r() * 2) {
    const dir = r() < .5 ? 1 : -1, s = shp(), c = col();
    for (let k = 0; k < 5; k++) add(t + k * .45, { p: at(dir * (-24 + k * 12), -4), shape: s, colors: c, seed: seed(), top: 38 + k * 2 });
    add(t + 3.4, { p: at((r() - .5) * 10, 0), shape: 'willow', colors: [0xffd43b, 0xffc078, 0xfff3bf], seed: seed(), top: 56 });
  }
  // 大结局（150–172 秒）：越来越密
  for (let t = 150; t < 172; t += Math.max(.25, .9 - (t - 150) * .03)) add(t, { p: at((r() - .5) * 50, (r() - .5) * 20), shape: ['ball', 'double', 'crackle', 'ring', 'heart'][Math.floor(r() * 5)], colors: col(), seed: seed(), top: 38 + r() * 18 });
  // 最后一个小菜鸟
  add(SHOW_LEN - 6, { p: at(0, 0), pts2d: chickPts(), colors: [0xffd43b, 0xff922b, 0xffffff], top: 48, scale: 3, seed: seed() });
  return ev.sort((a, b) => a.t - b.t);
}

export function createFireShow({ abil, banner }) {
  let night = -1, prog = [], last = null, said = {};
  function update(I) {
    if (I.phase !== 'night') { last = null; return null; }
    if (I.nightIndex !== night) { night = I.nightIndex; prog = showProgram(night); said = {}; last = null; }
    const st = I.nightT - SHOW_START;                  // 烟花秀开始后的第几秒（负数 = 还没开始）
    // 提示
    if (st < 0 && st > -60 && !said.pre) { said.pre = 1; banner(`🎆 今晚的烟花秀 ${Math.ceil(-st)} 秒后开始！`, 4000); }
    if (st > -10.5 && st < 0 && !said.ten) { said.ten = 1; banner('🎆 烟花秀 10 秒后开始！抬头往乐园中间看～', 6000); }
    if (st >= 0 && st < 3 && !said.go) { said.go = 1; banner('🎆 烟花秀开始啦！', 3000); }
    if (st >= SHOW_LEN && st < SHOW_LEN + 5 && !said.end) { said.end = 1; banner('🐣 烟花秀结束，明天晚上见～', 4000); }
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
