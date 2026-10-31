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

// 引擎声：随速度变大变尖
export function engineLevel(power) {
  if (!ensure() || ctx.state !== 'running') return;
  if (!engine) {
    const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o1.type = 'sawtooth'; o2.type = 'sawtooth'; o2.detune.value = 18;
    f.type = 'lowpass'; f.frequency.value = 300; g.gain.value = 0;
    o1.connect(f); o2.connect(f); f.connect(g); g.connect(master); o1.start(); o2.start();
    engine = { o1, o2, f, g };
  }
  const t = ctx.currentTime, p = Math.min(1.5, Math.max(0, power));
  engine.o1.frequency.setTargetAtTime(55 + p * 45, t, .1);
  engine.o2.frequency.setTargetAtTime(55 + p * 45, t, .1);
  engine.f.frequency.setTargetAtTime(250 + p * 700, t, .1);
  engine.g.gain.setTargetAtTime(.025 + p * .05, t, .15);
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
