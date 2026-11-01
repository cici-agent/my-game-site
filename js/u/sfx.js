// ===== 音效（WebAudio 现场合成，不需要音频文件） =====
let ctx = null, master = null, engine = null, muted = false;
try { muted = localStorage.getItem('xcn_muted') === '1'; } catch (e) {}

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain(); master.gain.value = muted ? 0 : .5; master.connect(ctx.destination);
  return ctx;
}
// 浏览器要求用户先有一次操作才能出声
export function unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); }
export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m; try { localStorage.setItem('xcn_muted', m ? '1' : '0'); } catch (e) {}
  if (master) master.gain.setTargetAtTime(m ? 0 : .5, ctx.currentTime, .05);
}

function noiseBuffer() {
  const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

// 引擎声：柔和的"呼呼"气流声 + 低沉的嗡鸣，速度越快越亮
function brownNoise() {
  const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < d.length; i++) { const w = Math.random() * 2 - 1; last = (last + .02 * w) / 1.02; d[i] = last * 3.5; }
  return b;
}
export function engineLevel(power) {
  if (!ensure() || ctx.state !== 'running') return;
  if (!engine) {
    // 气流：棕噪声 → 低通（速度越快越亮）
    const air = ctx.createBufferSource(); air.buffer = brownNoise(); air.loop = true;
    const airF = ctx.createBiquadFilter(); airF.type = 'lowpass'; airF.frequency.value = 400; airF.Q.value = .7;
    const airG = ctx.createGain(); airG.gain.value = 0;
    air.connect(airF); airF.connect(airG); airG.connect(master); air.start();
    // 嗡鸣：两个微微错开的正弦波，带一点缓慢起伏
    const h1 = ctx.createOscillator(), h2 = ctx.createOscillator(); h1.type = 'sine'; h2.type = 'sine'; h2.detune.value = 7;
    const humG = ctx.createGain(); humG.gain.value = 0;
    const lfo = ctx.createOscillator(), lfoG = ctx.createGain(); lfo.frequency.value = 3.2; lfoG.gain.value = .006;
    lfo.connect(lfoG); lfoG.connect(humG.gain);
    h1.connect(humG); h2.connect(humG); humG.connect(master); h1.start(); h2.start(); lfo.start();
    engine = { airF, airG, h1, h2, humG };
  }
  const t = ctx.currentTime, p = Math.min(1.5, Math.max(0, power));
  engine.airF.frequency.setTargetAtTime(300 + p * 1500, t, .2);
  engine.airG.gain.setTargetAtTime(p < .02 ? 0 : .04 + p * .11, t, .25);
  engine.h1.frequency.setTargetAtTime(70 + p * 55, t, .2);
  engine.h2.frequency.setTargetAtTime(70 + p * 55, t, .2);
  engine.humG.gain.setTargetAtTime(p < .02 ? .006 : .015 + p * .02, t, .25);
}

// 呼——（星门 / 超空间）
export function whoosh(dur = 1.2, up = true) {
  if (!ensure() || ctx.state !== 'running') return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer();
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
  const g = ctx.createGain(), t = ctx.currentTime;
  f.frequency.setValueAtTime(up ? 300 : 2400, t); f.frequency.exponentialRampToValueAtTime(up ? 2400 : 300, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.35, t + dur * .6); g.gain.linearRampToValueAtTime(0, t + dur);
  src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur + .05);
}

// 叮咚（到达 / 打开）
export function chime(notes = [660, 880, 1320]) {
  if (!ensure() || ctx.state !== 'running') return;
  notes.forEach((hz, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * .09;
    o.type = 'sine'; o.frequency.value = hz;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.18, t + .02); g.gain.exponentialRampToValueAtTime(.001, t + .5);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + .55);
  });
}

export function click() { chime([1200]); }

// 烟花：升空的“咻——”和爆炸的“嘭”（distance 越远越小声、越闷）
export function fwLaunch(vol = 1) {
  if (!ensure() || ctx.state !== 'running' || vol < .03) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer();
  const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 6;
  const g = ctx.createGain(), t = ctx.currentTime;
  f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(3200, t + .9);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.08 * vol, t + .1); g.gain.linearRampToValueAtTime(0, t + .95);
  src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + 1);
}
export function boom(vol = 1, crackle = false) {
  if (!ensure() || ctx.state !== 'running' || vol < .03) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource(); src.buffer = noiseBuffer();
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(900 * (.5 + vol * .5), t); f.frequency.exponentialRampToValueAtTime(120, t + .8);
  const g = ctx.createGain(); g.gain.setValueAtTime(.55 * vol, t); g.gain.exponentialRampToValueAtTime(.001, t + 1.2);
  src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + 1.3);
  const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'sine';
  o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + .4);
  og.gain.setValueAtTime(.35 * vol, t); og.gain.exponentialRampToValueAtTime(.001, t + .5);
  o.connect(og); og.connect(master); o.start(t); o.stop(t + .55);
  if (crackle) for (let i = 0; i < 14; i++) {
    const s2 = ctx.createBufferSource(); s2.buffer = noiseBuffer();
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const g2 = ctx.createGain(), tt = t + .5 + Math.random() * .8;
    g2.gain.setValueAtTime(0, tt); g2.gain.linearRampToValueAtTime(.12 * vol, tt + .005); g2.gain.exponentialRampToValueAtTime(.001, tt + .06);
    s2.connect(hp); hp.connect(g2); g2.connect(master); s2.start(tt, Math.random() * .5); s2.stop(tt + .08);
  }
}

// 鬼屋：呜——（幽灵）、吱吱（蝙蝠）、Boo!
export function woo() {
  if (!ensure() || ctx.state !== 'running') return;
  const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime, v = ctx.createOscillator(), vg = ctx.createGain();
  o.type = 'sine'; o.frequency.setValueAtTime(300, t); o.frequency.linearRampToValueAtTime(520, t + .7); o.frequency.linearRampToValueAtTime(260, t + 1.6);
  v.frequency.value = 6; vg.gain.value = 18; v.connect(vg); vg.connect(o.frequency);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.12, t + .3); g.gain.linearRampToValueAtTime(0, t + 1.7);
  o.connect(g); g.connect(master); o.start(t); v.start(t); o.stop(t + 1.8); v.stop(t + 1.8);
}
export function squeak() {
  if (!ensure() || ctx.state !== 'running') return;
  for (let i = 0; i < 6; i++) {
    const o = ctx.createOscillator(), g = ctx.createGain(), t = ctx.currentTime + i * .13 + Math.random() * .05;
    o.type = 'triangle'; o.frequency.setValueAtTime(2400 + Math.random() * 800, t); o.frequency.exponentialRampToValueAtTime(1500, t + .07);
    g.gain.setValueAtTime(.06, t); g.gain.exponentialRampToValueAtTime(.001, t + .08); o.connect(g); g.connect(master); o.start(t); o.stop(t + .1);
  }
}
export function boo() {
  if (!ensure() || ctx.state !== 'running') return;
  const t = ctx.currentTime, o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain(), f = ctx.createBiquadFilter();
  o.type = 'sawtooth'; o2.type = 'sawtooth'; o2.detune.value = 12; f.type = 'lowpass'; f.frequency.value = 900;
  o.frequency.setValueAtTime(180, t); o.frequency.exponentialRampToValueAtTime(110, t + .8); o2.frequency.setValueAtTime(180, t); o2.frequency.exponentialRampToValueAtTime(110, t + .8);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.2, t + .05); g.gain.linearRampToValueAtTime(0, t + .9);
  o.connect(f); o2.connect(f); f.connect(g); g.connect(master); o.start(t); o2.start(t); o.stop(t + 1); o2.stop(t + 1);
  setTimeout(() => chime([523, 659, 784]), 900);
}

// 脚步声（鬼屋里唯一的声音）：木地板上闷闷的一下
let stepAlt = 0;
export function step() {
  if (!ensure() || ctx.state !== 'running') return;
  const t = ctx.currentTime, src = ctx.createBufferSource(); src.buffer = noiseBuffer();
  const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380 + (stepAlt ^= 1) * 60;
  const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.32, t + .01); g.gain.exponentialRampToValueAtTime(.001, t + .16);
  src.connect(f); f.connect(g); g.connect(master); src.start(t, Math.random() * .5); src.stop(t + .2);
  const o = ctx.createOscillator(), og = ctx.createGain(); o.frequency.setValueAtTime(95, t); o.frequency.exponentialRampToValueAtTime(55, t + .08);
  og.gain.setValueAtTime(.12, t); og.gain.exponentialRampToValueAtTime(.001, t + .1); o.connect(og); og.connect(master); o.start(t); o.stop(t + .12);
}

// ===== 烟花秀背景音乐：用 WebAudio 现场合成的一段欢快小曲（循环），开 / 关时淡入淡出 =====
let music = null;
export function showMusic(on) {
  if (!ensure()) return;
  if (on && ctx.state !== 'running') return;
  if (on && !music) {
    const out = ctx.createGain(); out.gain.value = 0; out.connect(master);
    out.gain.setTargetAtTime(.32, ctx.currentTime, 1.2);
    const BPM = 116, beat = 60 / BPM;
    // C - G - Am - F，每个和弦 2 小节
    const chords = [[60, 64, 67], [55, 59, 62], [57, 60, 64], [53, 57, 60]];
    const mel = [76, 74, 72, 74, 76, 76, 76, -1, 74, 74, 74, -1, 76, 79, 79, -1, 76, 74, 72, 74, 76, 76, 76, 76, 74, 74, 76, 74, 72, -1, -1, -1];
    const hz = m => 440 * Math.pow(2, (m - 69) / 12);
    let step = 0, next = ctx.currentTime + .1;
    const note = (m, t, dur, type, vol, dest = out) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = hz(m);
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + .02); g.gain.exponentialRampToValueAtTime(.0008, t + dur); o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + .05); };
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600; lp.connect(out);
    const timer = setInterval(() => {
      while (next < ctx.currentTime + .3) {
        const s = step % 64, ch = chords[Math.floor(s / 16) % 4];          // 每个和弦 16 个八分音符
        if (s % 4 === 0) note(ch[0] - 12, next, beat * 1.8, 'sine', .22);                                   // 低音
        if (s % 8 === 0) ch.forEach(m => note(m, next, beat * 3.8, 'triangle', .05));                       // 和弦铺底
        note(ch[[0, 1, 2, 1][s % 4]] + 12, next, beat * .45, 'triangle', .045, lp);                           // 琶音
        const mm = mel[s % 32]; if (s % 2 === 0 && mm > 0) note(mm, next, beat * .9, 'square', .035, lp);   // 旋律
        if (s % 16 === 15) note(96 + (s % 3), next, beat * .6, 'sine', .03);                                // 叮
        next += beat / 2; step++;
      }
    }, 80);
    music = { out, timer };
  } else if (!on && music) {
    const m = music; music = null;
    m.out.gain.setTargetAtTime(0, ctx.currentTime, .8);
    setTimeout(() => { clearInterval(m.timer); m.out.disconnect(); }, 3500);
  }
}
