// ===== 乐园里的大钟楼：显示现在是白天还是晚上、离天黑 / 天亮 / 烟花秀还有多久 =====
import * as THREE from 'three';
import { T_DAY, T_SUNSET, T_NIGHT, DAY_LEN, SHOW_START, SHOW_LEN, mmss } from './daynight.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .6, ...o });

// 钟面上要显示的文字（HUD 小标签也用这个）
export function clockText(I) {
  const st = I.phase === 'night' ? I.nightT - SHOW_START : null;
  if (I.phase === 'night' && st < 0) return { icon: '🌙', title: '晚上', line: '烟花秀倒计时', big: mmss(-st), hot: true };
  if (I.phase === 'night' && st <= SHOW_LEN) return { icon: '🎆', title: '烟花秀中', line: '还有', big: mmss(SHOW_LEN - st), hot: true };
  if (I.phase === 'night' || I.phase === 'sunrise') return { icon: '🌙', title: I.phase === 'sunrise' ? '日出' : '晚上', line: '天亮还有', big: mmss(I.toDay) };
  return { icon: I.phase === 'sunset' ? '🌇' : '☀️', title: I.phase === 'sunset' ? '日落' : '白天', line: '天黑还有', big: mmss(I.toNight) };
}

export function clockTower(scene, x, z, rotY = 0) {
  const g = new THREE.Group(); g.position.set(x, 0, z); g.rotation.y = rotY; scene.add(g);
  const brick = M(0xffe3c2), trim = M(0xff922b), roofM = M(0x7048e8);
  const base = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1, 3.4), trim); base.position.y = .5; g.add(base);
  const col = new THREE.Mesh(new THREE.BoxGeometry(2.4, 8, 2.4), brick); col.position.y = 5; g.add(col);
  for (let i = 0; i < 4; i++) { const st = new THREE.Mesh(new THREE.BoxGeometry(2.5, .25, 2.5), trim); st.position.y = 2 + i * 2; g.add(st); }
  const head = new THREE.Mesh(new THREE.BoxGeometry(5.2, 5.2, 2.6), brick); head.position.y = 11.6; g.add(head);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(5.5, 5.5, 2.4), trim); frame.position.y = 11.6; g.add(frame);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(4.1, 3, 4), roofM); roof.rotation.y = Math.PI / 4; roof.position.y = 15.7; g.add(roof);
  const ball = new THREE.Mesh(new THREE.SphereGeometry(.45, 14, 10), M(0xffd43b, { metalness: .5, roughness: .3 })); ball.position.y = 17.5; g.add(ball);

  // 钟面：画在 canvas 上，前后两面都有
  const cv = document.createElement('canvas'); cv.width = cv.height = 512;
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  const faceMat = new THREE.MeshBasicMaterial({ map: tex });
  [1, -1].forEach(s => { const f = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 4.8), faceMat); f.position.set(0, 11.6, s * 1.31); if (s < 0) f.rotation.y = Math.PI; g.add(f); });
  const ctx = cv.getContext('2d');
  let lastSig = '';
  function draw(I) {
    const T = clockText(I);
    const sig = T.big + T.title + Math.floor(I.t / 2);
    if (sig === lastSig) return; lastSig = sig;
    const c = ctx, W = 512, cx = 256, cy = 200, R = 150;
    c.clearRect(0, 0, W, W);
    c.fillStyle = '#1b1446'; c.fillRect(0, 0, W, W);
    c.strokeStyle = '#ffd43b'; c.lineWidth = 12; c.strokeRect(6, 6, W - 12, W - 12);
    // 一圈表示一整天：白天（浅蓝）/ 日落 / 晚上（深蓝）/ 日出
    const seg = [[T_DAY, '#74c0fc'], [T_SUNSET, '#ff922b'], [T_NIGHT, '#273079'], [DAY_LEN - T_DAY - T_SUNSET - T_NIGHT, '#ff8fab']];
    let a0 = -Math.PI / 2;
    seg.forEach(([len, color]) => { const a1 = a0 + len / DAY_LEN * Math.PI * 2; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, R, a0, a1); c.closePath(); c.fillStyle = color; c.fill(); a0 = a1; });
    // 烟花秀那一小段
    const s0 = -Math.PI / 2 + (T_DAY + T_SUNSET + SHOW_START) / DAY_LEN * Math.PI * 2, s1 = s0 + SHOW_LEN / DAY_LEN * Math.PI * 2;
    c.beginPath(); c.arc(cx, cy, R + 10, s0, s1); c.strokeStyle = '#ff6bd5'; c.lineWidth = 10; c.stroke();
    c.beginPath(); c.arc(cx, cy, R * .62, 0, 7); c.fillStyle = '#1b1446'; c.fill();
    c.strokeStyle = '#fff'; c.lineWidth = 6; c.beginPath(); c.arc(cx, cy, R, 0, 7); c.stroke();
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; c.beginPath(); c.moveTo(cx + Math.cos(a) * (R - 14), cy + Math.sin(a) * (R - 14)); c.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); c.stroke(); }
    // 指针：现在在一天里的哪里
    const pos = ((I.t % DAY_LEN) + DAY_LEN) % DAY_LEN, a = -Math.PI / 2 + pos / DAY_LEN * Math.PI * 2;
    c.strokeStyle = '#ffd43b'; c.lineWidth = 9; c.lineCap = 'round';
    c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(a) * (R - 22), cy + Math.sin(a) * (R - 22)); c.stroke();
    c.font = '46px serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(I.phase === 'night' || I.phase === 'sunrise' ? '🌙' : '☀️', cx + Math.cos(a) * (R + 2), cy + Math.sin(a) * (R + 2));
    c.font = '64px serif'; c.fillText(T.icon, cx, cy - 4);
    // 文字
    c.fillStyle = '#fff'; c.font = 'bold 40px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillText(`${T.title} · ${T.line}`, cx, 400);
    c.fillStyle = T.hot ? '#ff8bd8' : '#ffd43b'; c.font = 'bold 76px "PingFang SC","Microsoft YaHei",sans-serif';
    c.fillText(T.big, cx, 462);
    tex.needsUpdate = true;
  }
  return { group: g, collider: [x, z, 1.9], update: draw };
}
