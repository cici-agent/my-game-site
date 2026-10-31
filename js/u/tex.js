// ===== 共用的程序贴图 =====
import * as THREE from 'three';

export function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function rand(seed) { return () => (seed = (seed * 16807) % 2147483647) / 2147483647; }
export function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16), f = v => Math.max(0, Math.min(255, v + amt));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
export function lighten(hex, k = .55) {
  return '#' + new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k).getHexString();
}

let _glow;
export function glowTex() {
  if (_glow) return _glow;
  _glow = canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w/2, w/2, 0, w/2, w/2, w/2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(.35, 'rgba(255,255,255,.35)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  return _glow;
}

export function planetTexture(color, c2, seed) {
  const r = rand(seed);
  return canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = color; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 9; i++) {
      g.fillStyle = i % 2 ? c2 : shade(color, -25); g.globalAlpha = .18 + r() * .2;
      g.fillRect(0, r() * h, w, 6 + r() * 26);
    }
    for (let i = 0; i < 40; i++) {
      g.globalAlpha = .15 + r() * .25; g.fillStyle = r() > .5 ? c2 : shade(color, -35);
      const rr = 4 + r() * 22; g.beginPath(); g.ellipse(r() * w, r() * h, rr * 1.6, rr, 0, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  });
}

let _swirl;
export function swirlTex() {
  if (_swirl) return _swirl;
  _swirl = canvasTex(256, 256, (g, w) => {
    const c = w / 2;
    const bg = g.createRadialGradient(c, c, 0, c, c, c);
    bg.addColorStop(0, 'rgba(255,255,255,1)'); bg.addColorStop(.25, 'rgba(200,230,255,.85)');
    bg.addColorStop(.7, 'rgba(120,160,255,.45)'); bg.addColorStop(1, 'rgba(80,60,255,0)');
    g.fillStyle = bg; g.fillRect(0, 0, w, w);
    g.lineCap = 'round';
    for (let arm = 0; arm < 5; arm++) {
      g.beginPath();
      for (let k = 0; k <= 60; k++) {
        const t = k / 60, a = arm / 5 * Math.PI * 2 + t * 5.5, rr = t * c * .95;
        k ? g.lineTo(c + Math.cos(a) * rr, c + Math.sin(a) * rr) : g.moveTo(c, c);
      }
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 7; g.stroke();
    }
  });
  return _swirl;
}
