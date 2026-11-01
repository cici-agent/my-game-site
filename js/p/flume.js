// ===== 激流勇进：坐木头船顺着水道漂，爬上 12 米高的坡，再从陡坡冲下去，“哗”地溅起大水花 =====
// 一轮一轮：船在码头停 14 秒上客 → 漂一圈 → 回码头
import * as THREE from 'three';
import { rideClock } from './rides.js';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .6, ...o });
const tex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };

export function logFlume(cx, cz) {
  const g = new THREE.Group(); g.position.set(cx, 0, cz);
  const V = (x, z, y) => new THREE.Vector3(x, y, z);
  // 水道：南边是码头（往东走）→ 东边爬坡往北 → 北边高架往西 → 西边陡坡冲下去 → 水池 → 回码头
  const ctrl = [V(-16, 18, .6), V(0, 18, .6), V(12, 17, .6), V(19, 11, .6), V(21, 3, .7), V(21, -11, 11), V(20, -17, 12), V(12, -21, 12), V(0, -22, 12),
    V(-12, -21, 12), V(-20, -17, 12), V(-22, -11, 11.6), V(-22, -2, 3.2), V(-22, 4, .6), V(-22, 10, .6), V(-20, 15, .6)];
  const curve = new THREE.CatmullRomCurve3(ctrl, true, 'centripetal');
  const L = curve.getLength(), N = Math.round(L * 1.5);
  const P = curve.getSpacedPoints(N), T = [];
  for (let i = 0; i < N; i++) { T.push(new THREE.Vector3().subVectors(P[(i + 1) % N], P[(i - 1 + N) % N]).normalize()); }
  const side = T.map(t => new THREE.Vector3(t.z, 0, -t.x).normalize());
  // 水槽：底 + 两边的墙（木头色），里面一条会流动的水
  const woodT = tex(64, 64, (x) => { x.fillStyle = '#a0703c'; x.fillRect(0, 0, 64, 64); x.fillStyle = '#8b5a2b'; for (let i = 0; i < 8; i++) x.fillRect(0, i * 8, 64, 2); });
  woodT.wrapS = woodT.wrapT = THREE.RepeatWrapping;
  const waterT = tex(64, 128, (x) => { x.fillStyle = '#3d9be9'; x.fillRect(0, 0, 64, 128); x.strokeStyle = 'rgba(255,255,255,.5)'; x.lineWidth = 2; for (let i = 0; i < 14; i++) { x.beginPath(); const y = Math.random() * 128, x0 = Math.random() * 64; x.moveTo(x0, y); x.lineTo(x0 + 4, y + 10); x.stroke(); } });
  waterT.wrapS = waterT.wrapT = THREE.RepeatWrapping;
  const WW = 1.5;
  function strip(f, mat, uvs = 1) {
    const pos = [], uv = [], idx = [];
    for (let i = 0; i <= N; i++) { const k = i % N, p = P[k], s = side[k]; const [a, b] = f(p, s, k); pos.push(...a, ...b); uv.push(0, i / 3 * uvs, 1, i / 3 * uvs); if (i < N) idx.push(i * 2, i * 2 + 1, i * 2 + 2, i * 2 + 1, i * 2 + 3, i * 2 + 2); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geo.setIndex(idx); geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, mat); g.add(m); return m;
  }
  const wood = new THREE.MeshStandardMaterial({ map: woodT, side: THREE.DoubleSide, roughness: .8 });
  strip((p, s) => [[p.x + s.x * WW, p.y - .45, p.z + s.z * WW], [p.x - s.x * WW, p.y - .45, p.z - s.z * WW]], wood);
  [1, -1].forEach(sg => strip((p, s) => [[p.x + s.x * WW * sg, p.y - .45, p.z + s.z * WW * sg], [p.x + s.x * WW * sg, p.y + .55, p.z + s.z * WW * sg]], wood));
  const waterMat = new THREE.MeshStandardMaterial({ map: waterT, transparent: true, opacity: .85, roughness: .1, side: THREE.DoubleSide });
  strip((p, s) => [[p.x + s.x * (WW - .05), p.y - .05, p.z + s.z * (WW - .05)], [p.x - s.x * (WW - .05), p.y - .05, p.z - s.z * (WW - .05)]], waterMat);
  // 柱子：高的地方下面撑着
  { const list = [], o = new THREE.Object3D(); for (let i = 0; i < N; i += 6) { const p = P[i]; if (p.y < 2) continue; [1, -1].forEach(sg => { o.position.set(p.x + side[i].x * (WW - .2) * sg, (p.y - .45) / 2, p.z + side[i].z * (WW - .2) * sg); o.scale.set(1, p.y - .45, 1); o.updateMatrix(); list.push(o.matrix.clone()); }); }
    const im = new THREE.InstancedMesh(new THREE.CylinderGeometry(.18, .22, 1, 8), M(0x6d4c2f), list.length); list.forEach((m, k) => im.setMatrixAt(k, m)); g.add(im); }
  // 爬坡的链条（中间一条黑带）
  const isLift = k => T[k].y > .25;
  { const pos = [], idx = []; let n = 0; for (let i = 0; i < N; i++) { if (!isLift(i)) continue; const p = P[i], s = side[i]; pos.push(p.x + s.x * .3, p.y - .02, p.z + s.z * .3, p.x - s.x * .3, p.y - .02, p.z - s.z * .3); if (n && isLift(i - 1)) idx.push((n - 1) * 2, (n - 1) * 2 + 1, n * 2, (n - 1) * 2 + 1, n * 2 + 1, n * 2); n++; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals(); g.add(new THREE.Mesh(geo, M(0x343a40, { side: THREE.DoubleSide }))); }
  // 冲下去的地方：大水池 + 假山
  const iSplash = (() => { let best = 0, by = 99; for (let i = 0; i < N; i++) { const p = P[i]; if (p.x < -18 && p.z > -4 && p.z < 10 && p.y < by) { by = p.y; best = i; } } return best; })();
  const sp = P[iSplash];
  const poolM = new THREE.Mesh(new THREE.CylinderGeometry(6, 6.4, .6, 32), M(0x8a8f96)); poolM.position.set(sp.x, .3, sp.z + 3); g.add(poolM);
  const poolW = new THREE.Mesh(new THREE.CircleGeometry(5.7, 32), new THREE.MeshStandardMaterial({ map: waterT, transparent: true, opacity: .85, roughness: .1 })); poolW.rotation.x = -Math.PI / 2; poolW.position.set(sp.x, .62, sp.z + 3); g.add(poolW);
  for (let k = 0; k < 7; k++) { const r = 3 + Math.random() * 3, rock = new THREE.Mesh(new THREE.DodecahedronGeometry(r, 0), M(k % 2 ? 0x6b8f3e : 0x8a7a66, { flatShading: true })); const a = -Math.PI / 2 + (k - 3) * .45; rock.position.set(-6 + Math.cos(a) * 9, r * .4, -6 + Math.sin(a) * 9); g.add(rock); }
  // 码头：一块木平台 + 顶棚 + 招牌
  const dock = new THREE.Group(); dock.position.set(-6, 0, 18); g.add(dock);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(16, .6, 3.4), M(0xb08968)); deck.position.set(0, .3, 3.3); dock.add(deck);
  [-7, 0, 7].forEach(x => [1.8, 4.8].forEach(z => { const p = new THREE.Mesh(new THREE.CylinderGeometry(.14, .14, 4, 8), M(0x6d4c2f)); p.position.set(x, 2, z); dock.add(p); }));
  const roof = new THREE.Mesh(new THREE.BoxGeometry(17, .25, 4.2), M(0x2b8a3e)); roof.position.set(0, 4.1, 3.2); dock.add(roof);
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(7, 1.5), new THREE.MeshBasicMaterial({ map: tex(512, 110, (x, w, h) => { x.fillStyle = '#1971c2'; x.beginPath(); x.roundRect(4, 4, w - 8, h - 8, 24); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 60px "PingFang SC","Microsoft YaHei",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('🌊 激流勇进', w / 2, h / 2 + 3); }), side: THREE.DoubleSide }));
  sign.position.set(0, 5.3, 3.2); dock.add(sign);
  for (let i = 0; i < 14; i++) { const b = new THREE.Mesh(new THREE.SphereGeometry(.1, 8, 6), new THREE.MeshBasicMaterial({ color: 0xd9d4c8 })); b.position.set(-8 + i * 1.23, 3.9, 5.25); b.userData.nightBulb = [0x4dabf7, 0x69db7c, 0xffd43b][i % 3]; dock.add(b); }
  // 木头船（4 排 × 2 个座位）
  const boat = new THREE.Group(); g.add(boat);
  const hull = new THREE.Mesh(new THREE.CylinderGeometry(.95, .95, 5, 16, 1, false, Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ map: woodT, side: THREE.DoubleSide, roughness: .8 })); hull.rotation.x = Math.PI / 2; hull.rotation.z = Math.PI; hull.position.y = .5; boat.add(hull);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(.95, 14, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), M(0xa0703c)); nose.position.set(0, .5, 2.5); nose.scale.z = .6; boat.add(nose);
  const tail = nose.clone(); tail.position.z = -2.5; boat.add(tail);
  const seats = [];
  [-1.6, -.55, .5, 1.55].forEach((z, r) => { const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, .2, .45), M(0x8b5a2b)); bench.position.set(0, .45, z - .1); boat.add(bench);
    [-.42, .42].forEach(x => { const s = new THREE.Object3D(); s.position.set(x, .55, z); boat.add(s); seats.push(s); }); });
  const face = new THREE.Mesh(new THREE.SphereGeometry(.3, 12, 10), M(0xffd43b)); face.position.set(0, 1.0, 2.7); boat.add(face);   // 船头上的小黄鸭
  // 水花
  const splashG = new THREE.Group(); g.add(splashG); splashG.position.copy(sp);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xe7f5ff, transparent: true, opacity: 0, roughness: .1, depthWrite: false })); splashG.add(dome);
  const SPN = 160, sPos = new Float32Array(SPN * 3), sVel = new Float32Array(SPN * 3), sGeo = new THREE.BufferGeometry(); sGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3));
  const sPts = new THREE.Points(sGeo, new THREE.PointsMaterial({ color: 0xffffff, size: .35, transparent: true, opacity: 0, depthWrite: false })); splashG.add(sPts);
  let splashT = 9;
  function splash() { splashT = 0; for (let i = 0; i < SPN; i++) { sPos[i * 3] = (Math.random() - .5) * 1.5; sPos[i * 3 + 1] = .5; sPos[i * 3 + 2] = (Math.random() - .5) * 1.5; const a = Math.random() * Math.PI * 2, r = 2 + Math.random() * 5;
    sVel[i * 3] = Math.cos(a) * r; sVel[i * 3 + 1] = 5 + Math.random() * 8; sVel[i * 3 + 2] = Math.sin(a) * r; } }

  // ---- 时刻表：码头 → 漂 → 爬坡 → 高处 → 冲下去 → 水池 → 码头 ----
  const BOARD = 14, uStation = (() => { let best = 0, bd = 1e9; for (let i = 0; i < N; i++) { const d = (P[i].x + 6) ** 2 + (P[i].z - 18) ** 2; if (d < bd) { bd = d; best = i; } } return best; })();
  const iDrop = (() => { for (let i = 0; i < N; i++) { const k = (iSplash - i + N) % N; if (P[k].y > 11.4) return k; } return 0; })();
  const table = [[0, 0]];
  { let s = 0, t = 0; const dt = 1 / 30;
    while (s < N) { const k = (uStation + Math.floor(s)) % N, p = P[k];
      const inDrop = ((k - iDrop + N) % N) <= ((iSplash - iDrop + N) % N);
      let v = isLift(k) ? 2.6 : p.y > 11 ? 3.6 : 3.2;
      if (inDrop) v = Math.max(3.6, Math.sqrt(Math.max(0, 2 * 9.8 * (12.2 - p.y))) * .9);
      const after = (k - iSplash + N) % N; if (after < 30) v = 3.2 + 8 * Math.exp(-after / 6);
      s += v * dt * (N / L); t += dt; table.push([t, Math.min(N, s)]); } }
  const RUN = table[table.length - 1][0], CYCLE = BOARD + RUN;
  const sAt = sec => { let lo = 0, hi = table.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (table[m][0] < sec) lo = m; else hi = m; } const [t0, s0] = table[lo], [t1, s1] = table[hi]; return s0 + (s1 - s0) * ((sec - t0) / Math.max(1e-6, t1 - t0)); };
  let phase = 'board', boardLeft = 0, cycleN = 0, lastK = -1, sNow = 0;
  const tmp = new THREE.Vector3(), look = new THREE.Vector3();
  const api = {
    name: '激流勇进', icon: '🌊', group: g, seats, capacity: seats.length,
    entry: [cx - 6, cz + 24.6], gate: [cx - 6, cz + 24.6], entryR: 3, out: [0, 1],
    colliders: [{ box: [cx, cz - 2, 24, 22, 0] }, { box: [cx - 6, cz + 21.3, 8.2, 1.9, 0] }],
    update(dt) {
      const now = rideClock(), c = now % CYCLE; cycleN = Math.floor(now / CYCLE);
      if (c < BOARD) { phase = 'board'; boardLeft = BOARD - c; sNow = 0; } else { phase = 'run'; sNow = sAt(c - BOARD); }
      const f = (uStation + sNow) % N, k = Math.floor(f), u = f - k, a = P[k], b = P[(k + 1) % N];
      tmp.lerpVectors(a, b, u); boat.position.copy(tmp).y -= .15;
      look.copy(tmp).add(T[k]); boat.lookAt(look);
      if (k !== lastK) { if (lastK >= 0 && ((iSplash - lastK + N) % N) < ((k - lastK + N) % N + 1) && ((iSplash - lastK + N) % N) > 0) { splash(); api.onSplash && api.onSplash(); } lastK = k; }
      waterT.offset.y -= dt * .6;
      // 水花
      splashT += dt; const st = splashT;
      dome.material.opacity = st < 1.2 ? .55 * (1 - st / 1.2) : 0; dome.scale.set(1.5 + st * 4, (st < .5 ? st * 8 : 4 * (1 - (st - .5) / .7)) + .01, 1.5 + st * 4);
      if (st < 2.5) { for (let i = 0; i < SPN; i++) { sVel[i * 3 + 1] -= 14 * dt; sPos[i * 3] += sVel[i * 3] * dt; sPos[i * 3 + 1] = Math.max(.3, sPos[i * 3 + 1] + sVel[i * 3 + 1] * dt); sPos[i * 3 + 2] += sVel[i * 3 + 2] * dt; } sGeo.attributes.position.needsUpdate = true; sPts.material.opacity = Math.max(0, 1 - st / 2.5); }
      else sPts.material.opacity = 0;
    },
    status() { return '按 E 坐激流勇进'; },
    canBoard() { return phase === 'board' && boardLeft > 1; },
    boardTime() { return phase === 'board' ? boardLeft : 0; },
    // 上船：都走到码头边上（船停在码头旁边）
    boardSpot(k) { const v = new THREE.Vector3(); seats[k].getWorldPosition(v); return [v.x, cz + 19.6]; },
    board(taken = [], want = null) {
      const k = want != null && seats[want] && !taken.includes(want) ? want : seats.findIndex((_, i) => !taken.includes(i)); if (k < 0) return null;
      const start = cycleN;
      return { seat: seats[k], seatIndex: k, view: 'follow', camDist: 9, camPitch: .3, exitPos: [cx - 12 + Math.random() * 3, cz + 25], done: () => cycleN > start && phase === 'board', wet: true };
    },
  };
  return api;
}
