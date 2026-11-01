// ===== 道具效果 + 独角兽飞行 =====
// 只负责“自己”的效果（多人同步在批次 3）。主程序每帧调用 step()，由这里决定速度、跳跃和上下运动。
import * as THREE from 'three';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .5, ...o });
const add = (p, geo, mat, pos = [0, 0, 0], rot = null) => { const m = new THREE.Mesh(geo, mat); m.position.set(...pos); if (rot) m.rotation.set(...rot); p.add(m); return m; };

function tex(draw, n = 64) { const c = document.createElement('canvas'); c.width = c.height = n; draw(c.getContext('2d'), n); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
const TEX = {};
const dotTex = () => TEX.dot || (TEX.dot = tex((g, n) => { const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(.35, 'rgba(255,255,255,.8)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, n, n); }));
const starTex = () => TEX.star || (TEX.star = tex((g, n) => { g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI * 2 - Math.PI / 2, r = i % 2 ? n * .2 : n * .46; g.lineTo(n / 2 + Math.cos(a) * r, n / 2 + Math.sin(a) * r); } g.fill(); }));
const heartTex = () => TEX.heart || (TEX.heart = tex((g, n) => { g.fillStyle = '#fff'; g.beginPath(); g.moveTo(n / 2, n * .85); g.bezierCurveTo(n * .05, n * .5, n * .2, n * .08, n / 2, n * .3); g.bezierCurveTo(n * .8, n * .08, n * .95, n * .5, n / 2, n * .85); g.fill(); }));

// 道具持续时间（秒）
export const DURATION = { jetpack: 30, copter: 10, balloon: 8, spring: 30, skate: 30, grow: 30, shrink: 30, bubble: 10 };
const FLY = ['jetpack', 'copter', 'balloon'];
const UNI_FLY = 8, UNI_CD = 60, UNI_MAX = 14;

// remote=true：别人的效果（只做画面，不管上下移动）；hitTest(pos) 用来判断雪球有没有砸到我
export function createAbilities({ scene, player, getAvatar, sfx, toast, remote = false, hitTest = null }) {
  const A = { timed: {}, fly: null, flyEnd: 0, descend: false, uniCdEnd: 0, lastJump: -9, models: {}, scale: 1, t: 0, slowUntil: 0, snowCap: null };
  if (remote) { sfx = { chime() {}, whoosh() {}, click() {} }; toast = () => {}; }
  const parts = [];      // 粒子 / 投射物

  // ---------- 小工具 ----------
  function burst(pos, colors, n = 40, speed = 6, life = 1.4, size = .5, grav = 6, map = dotTex()) {
    const geo = new THREE.BufferGeometry(), p = new Float32Array(n * 3), c = new Float32Array(n * 3), v = [];
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      p.set([pos.x, pos.y, pos.z], i * 3);
      col.set(colors[i % colors.length]); c.set([col.r, col.g, col.b], i * 3);
      const a = Math.random() * Math.PI * 2, b = Math.acos(Math.random() * 2 - 1), s = speed * (.5 + Math.random() * .5);
      v.push(Math.sin(b) * Math.cos(a) * s, Math.cos(b) * s, Math.sin(b) * Math.sin(a) * s);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(p, 3)); geo.setAttribute('color', new THREE.BufferAttribute(c, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, map, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; scene.add(pts);
    parts.push({ obj: pts, life, max: life, step(dt) {
      const a = geo.attributes.position.array;
      for (let i = 0; i < n; i++) { v[i * 3 + 1] -= grav * dt; a[i * 3] += v[i * 3] * dt; a[i * 3 + 1] += v[i * 3 + 1] * dt; a[i * 3 + 2] += v[i * 3 + 2] * dt; v[i * 3] *= .985; v[i * 3 + 2] *= .985; }
      geo.attributes.position.needsUpdate = true; pts.material.opacity = Math.min(1, this.life / this.max * 1.5);
    } });
  }
  function groundMark(map, color, x, z, rot, size = .55, life = 2.5) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ map, color, transparent: true, depthWrite: false }));
    m.rotation.set(-Math.PI / 2, 0, rot); m.position.set(x, .04, z); scene.add(m);
    parts.push({ obj: m, life, max: life, step() { m.material.opacity = Math.min(1, this.life / this.max * 2); } });
  }
  const fwd = () => new THREE.Vector3(Math.sin(player.face), 0, Math.cos(player.face));
  const handPos = () => { const v = new THREE.Vector3(); getAvatar().rig.handR.getWorldPosition(v); return v; };

  // ---------- 挂在身上的道具模型 ----------
  function attach(key) {
    const av = getAvatar(), rig = av.rig, g = new THREE.Group();
    if (key === 'jetpack') {
      [-1, 1].forEach(s => {
        add(g, new THREE.CapsuleGeometry(.16, .5, 4, 12), M(0xe03131, { metalness: .3 }), [s * .2, -.1, -.08]);
        add(g, new THREE.ConeGeometry(.13, .18, 12), M(0x495057), [s * .2, -.5, -.08], [Math.PI, 0, 0]);
        const f = new THREE.Mesh(new THREE.ConeGeometry(.12, .6, 10), new THREE.MeshBasicMaterial({ color: 0xffa94d, transparent: true, opacity: .85 }));
        f.position.set(s * .2, -.85, -.08); f.rotation.x = Math.PI; g.add(f); (g.userData.fl = g.userData.fl || []).push(f);
      });
      add(g, new THREE.BoxGeometry(.5, .2, .12), M(0x495057), [0, .1, 0]);
      g.position.set(0, -.15, -.12); rig.backMount.add(g);
    } else if (key === 'copter') {
      add(g, new THREE.CylinderGeometry(.04, .04, .35, 8), M(0xffd43b), [0, .17, 0]);
      const blades = new THREE.Group(); blades.position.y = .36; g.add(blades);
      [0, Math.PI / 2].forEach(a => add(blades, new THREE.BoxGeometry(1.5, .03, .14), M(0xff922b), [0, 0, 0], [0, a, .06]));
      add(g, new THREE.SphereGeometry(.07, 10, 8), M(0xe03131), [0, .38, 0]);
      g.userData.spin = blades; rig.headTop.add(g);
    } else if (key === 'balloon') {
      const cols = [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2];
      cols.forEach((c, i) => {
        const a = i / cols.length * Math.PI * 2, x = Math.cos(a) * .35, z = Math.sin(a) * .35, y = 2.3 + (i % 2) * .35;
        add(g, new THREE.SphereGeometry(.38, 16, 12), M(c, { roughness: .2 }), [x, y, z]).scale.set(1, 1.18, 1);
        const pts = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(x, y - .42, z)];
        g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color: 0xffffff })));
      });
      g.rotation.x = -Math.PI / 2 + .3; rig.handMount.add(g);
    } else if (key === 'spring') {
      ['legL', 'legR'].forEach(k => {
        const sp = new THREE.Group(); sp.position.y = -.72;
        for (let i = 0; i < 4; i++) add(sp, new THREE.TorusGeometry(.13, .03, 6, 16), M(0xadb5bd, { metalness: .6 }), [0, -i * .07, .05], [Math.PI / 2, 0, 0]);
        rig[k].add(sp); (g.userData.sub = g.userData.sub || []).push(sp);
      });
    } else if (key === 'skate') {
      add(g, new THREE.BoxGeometry(.7, .07, 1.6), M(0x7048e8), [0, .14, 0]);
      add(g, new THREE.BoxGeometry(.72, .02, 1.5), M(0x212529), [0, .185, 0]);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, z]) => add(g, new THREE.CylinderGeometry(.08, .08, .08, 12), M(0xffd43b), [x * .25, .07, z * .55], [0, 0, Math.PI / 2]));
      av.root.add(g);
    }
    A.models[key] = g;
  }
  function detach(key) {
    const g = A.models[key]; if (!g) return;
    (g.userData.sub || []).forEach(s => s.parent && s.parent.remove(s));
    g.parent && g.parent.remove(g); delete A.models[key];
  }
  // 换皮肤后重新挂上
  function reattach() { Object.keys(A.models).forEach(k => { detach(k); attach(k); }); if (A.snowCap && A.t < A.slowUntil) getAvatar().rig.headTop.add(A.snowCap); }

  // ---------- 一次性道具 ----------
  function throwSnowball(p0, v0) {
    const p = p0 ? new THREE.Vector3(...p0) : handPos();
    const v = v0 ? new THREE.Vector3(...v0) : fwd().multiplyScalar(18).setY(6);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(.22, 12, 10), M(0xffffff, { roughness: .9 }));
    ball.position.copy(p); scene.add(ball);
    parts.push({ obj: ball, life: 3, max: 3, step(dt) {
      v.y -= 18 * dt; ball.position.addScaledVector(v, dt);
      const hit = hitTest && hitTest(ball.position);
      if (hit || ball.position.y < .1) { burst(ball.position.clone().setY(Math.max(.2, ball.position.y)), [0xffffff, 0xd0ebff], 26, 4, .8, .35, 10); this.life = 0; sfx.click && sfx.click(); }
    } });
    return { p: [+p.x.toFixed(2), +p.y.toFixed(2), +p.z.toFixed(2)], v: [+v.x.toFixed(2), +v.y.toFixed(2), +v.z.toFixed(2)] };
  }
  // 被雪球砸中：走路变慢 5 秒，头上一团雪
  function slow(sec = 5) {
    A.slowUntil = A.t + sec;
    const av = getAvatar();
    if (!A.snowCap) {
      const g = new THREE.Group();
      [[0, .1, 0, .32], [.2, 0, .1, .2], [-.22, 0, .05, .22], [0, .05, .25, .18]].forEach(([x, y, z, r]) => add(g, new THREE.SphereGeometry(r, 12, 10), M(0xffffff, { roughness: 1 }), [x, y, z]));
      A.snowCap = g;
    }
    A.snowCap.parent && A.snowCap.parent.remove(A.snowCap);
    av.rig.headTop.add(A.snowCap);
    burst(player.pos.clone().setY(player.pos.y + 2.4), [0xffffff, 0xd0ebff], 30, 3, .9, .4, 6);
  }
  function launchFirework() {
    const start = player.pos.clone().add(fwd().multiplyScalar(1.5)).setY(player.pos.y + 1);
    const rocket = new THREE.Mesh(new THREE.CylinderGeometry(.08, .08, .5, 8), M(0xff6b6b, { emissive: 0xff6b6b, emissiveIntensity: .6 }));
    rocket.position.copy(start); scene.add(rocket);
    const top = 22 + Math.random() * 6; let trailT = 0;
    parts.push({ obj: rocket, life: 4, max: 4, step(dt) {
      rocket.position.y += 24 * dt; trailT += dt;
      if (trailT > .04) { trailT = 0; burst(rocket.position.clone(), [0xffd43b, 0xffa94d], 3, .8, .5, .4, 2); }
      if (rocket.position.y > start.y + top) {
        const sets = [[0xff6b6b, 0xffd43b], [0x4dabf7, 0xda77f2], [0x69db7c, 0xffffff], [0xff922b, 0xff6b9d]];
        const s = sets[Math.floor(Math.random() * sets.length)];
        burst(rocket.position.clone(), s, 140, 13, 2.4, 1.1, 4);
        setTimeout(() => burst(rocket.position.clone().add(new THREE.Vector3(3, 2, 0)), sets[(sets.indexOf(s) + 1) % 4], 90, 9, 2, .9, 4), 250);
        sfx.chime && sfx.chime([1046, 1318, 1568]);
        this.life = 0;
      }
    } });
  }
  function blowBubble() {
    const b = new THREE.Mesh(new THREE.SphereGeometry(.2 + Math.random() * .25, 16, 12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color().setHSL(Math.random(), .9, .6), emissiveIntensity: .7, transparent: true, opacity: .45, roughness: .05, depthWrite: false }));
    b.position.copy(handPos()); scene.add(b);
    const a = Math.random() * Math.PI * 2, v = new THREE.Vector3(Math.cos(a) * (1 + Math.random() * 2), .6 + Math.random(), Math.sin(a) * (1 + Math.random() * 2));
    const life = 2.5 + Math.random() * 2.5;
    parts.push({ obj: b, life, max: life, step(dt, t) {
      b.position.addScaledVector(v, dt); b.position.x += Math.sin(t * 3 + a) * dt * .5; v.multiplyScalar(.995);
      if (this.life < dt * 1.5) burst(b.position.clone(), [0xffffff, 0xd0ebff], 10, 2, .4, .3, 0);
    } });
  }

  // ---------- 使用道具 ----------
  // 返回 false = 现在不能用（不扣数量）
  function canUse(key) {
    if (FLY.includes(key) && (A.fly || A.descend)) return '正在飞行中，落地后再用';
    if (key === 'skate' && A.fly) return '飞行中不能踩滑板';
    return true;
  }
  function start(key, data) {
    sfx.chime && sfx.chime([659, 880, 1175]);
    if (key === 'snowball') return throwSnowball(data && data.p, data && data.v);
    if (key === 'firework') { launchFirework(); return; }
    const now = A.t;
    if (key === 'grow' || key === 'shrink') { delete A.timed[key === 'grow' ? 'shrink' : 'grow']; burst(player.pos.clone().setY(player.pos.y + 1.5), [0xffd43b, 0xffffff, 0xda77f2], 40, 4, 1, .5, 0); }
    if (FLY.includes(key)) { A.fly = key; A.flyEnd = now + DURATION[key]; A.descend = false; if (key !== 'balloon') { player.vy = 0; } }
    A.timed[key] = now + DURATION[key];
    if (['jetpack', 'copter', 'balloon', 'spring', 'skate'].includes(key)) { detach(key); attach(key); }
  }

  // 跳跃键按下（用来识别独角兽的“双击”）
  function onJumpPress() {
    const av = getAvatar(); if (av.skin !== 'unicorn') return;
    const now = A.t, dbl = now - A.lastJump < .35; A.lastJump = now;
    if (!dbl) return;
    A.lastJump = -9;
    if (A.fly === 'unicorn') { A.fly = null; A.descend = false; player.vy = 0; A.uniCdEnd = now + UNI_CD; toast('🦄 降落！休息 1 分钟后可以再飞'); return; }
    if (A.fly || A.descend) return;
    if (now < A.uniCdEnd) { toast(`🦄 独角兽还要休息 ${Math.ceil(A.uniCdEnd - now)} 秒才能再飞`); return; }
    A.fly = 'unicorn'; A.flyEnd = now + UNI_FLY; player.vy = 0; A.hoverY = Math.max(player.pos.y, 1.6);
    burst(player.pos.clone().setY(player.pos.y + .5), [0xff6b6b, 0xffd43b, 0x69db7c, 0x4dabf7, 0xda77f2], 50, 4, 1, .6, 0);
    sfx.chime && sfx.chime([784, 988, 1318, 1568]);
  }

  // ---------- 每帧 ----------
  // in: { up, down, jumpHeld, moving, speed }。返回移动修正
  let markT = 0, bubbleT = 0;
  function step(dt, t, inp) {
    A.t = t;
    const av = getAvatar();
    // 到时间的效果
    Object.entries(A.timed).forEach(([k, end]) => {
      if (t < end) return;
      delete A.timed[k];
      if (k === 'balloon' && A.fly === 'balloon') { const p = player.pos.clone().setY(player.pos.y + 3.2); burst(p, [0xff6b6b, 0xffd43b, 0x4dabf7, 0x69db7c, 0xda77f2], 60, 6, 1, .6, 8); sfx.whoosh && sfx.whoosh(.4, false); A.fly = null; }
      else if (k === 'jetpack' || k === 'copter') { if (A.fly === k) { A.fly = null; A.descend = true; } }
      detach(k);
    });
    if (A.fly === 'unicorn' && t > A.flyEnd) { A.fly = null; A.descend = true; A.uniCdEnd = t + UNI_CD; toast('🦄 飞累了，慢慢落下来'); }

    // 体型
    const wantScale = A.timed.grow ? 2.2 : A.timed.shrink ? .45 : 1;
    A.scale += (wantScale - A.scale) * Math.min(1, dt * 4);
    av.root.scale.setScalar(A.scale);
    const lift = (A.models.spring ? .25 : 0) + (A.models.skate ? .2 : 0);

    // 上下运动
    let gravity = true, pose = null;
    if (A.fly === 'jetpack') {
      gravity = false; pose = 'fly';
      const want = inp.up ? 7 : inp.down ? -7 : 0; player.vy += (want - player.vy) * Math.min(1, dt * 5);
      if (player.pos.y > 40) player.vy = Math.min(player.vy, 0);
      const fl = A.models.jetpack && A.models.jetpack.userData.fl; fl && fl.forEach(f => f.scale.set(1, .7 + Math.random() * .5 + (inp.up ? .6 : 0), 1));
      if (Math.random() < .5) burst(handPos().setY(player.pos.y + .6), [0xffa94d, 0xffd43b], 2, .6, .4, .4, -2);
    } else if (A.fly === 'copter') {
      gravity = false; pose = 'fly';
      player.vy = THREE.MathUtils.clamp((12 - player.pos.y) * 1.2, -4, 3.5);
      A.models.copter && (A.models.copter.userData.spin.rotation.y += dt * 25);
    } else if (A.fly === 'balloon') {
      gravity = false; pose = 'fly'; player.vy = 1.5;
    } else if (A.fly === 'unicorn') {
      gravity = false; pose = 'fly';
      if (inp.jumpHeld && A.t - A.lastJump > .12) A.hoverY = Math.min(UNI_MAX, Math.max(A.hoverY, player.pos.y) + dt * 6);
      player.vy = THREE.MathUtils.clamp((A.hoverY - player.pos.y) * 4, -6, 7);
      if (Math.random() < .7) burst(player.pos.clone().setY(player.pos.y + .3), [0xff6b6b, 0xffa94d, 0xffd43b, 0x69db7c, 0x4dabf7, 0x9775fa], 2, .4, 1.2, .55, -.5);
    } else if (A.descend) {
      gravity = false; pose = 'fly'; player.vy = -3.2;
      if (A.models.copter) A.models.copter.userData.spin.rotation.y += dt * 25;
    }
    if (A.snowCap && A.snowCap.parent && A.t >= A.slowUntil) A.snowCap.parent.remove(A.snowCap);
    if (!gravity && !remote) {
      player.pos.y += player.vy * dt;
      if (player.pos.y <= 0) { player.pos.y = 0; player.vy = 0; player.ground = true; if (A.descend) A.descend = false; }
      else player.ground = false;
    }
    if (A.models.skate && !A.fly && player.ground) pose = 'skate';

    // 泡泡
    if (A.timed.bubble) { bubbleT -= dt; if (bubbleT <= 0) { bubbleT = .12; blowBubble(); } }

    // 脚印 / 彩虹足迹
    markT -= dt;
    if (inp.moving && player.ground && markT <= 0) {
      markT = .28;
      const side = (Math.round(t / .28) % 2 ? 1 : -1) * .25, f = fwd();
      const x = player.pos.x + f.z * side, z = player.pos.z - f.x * side;
      const fx = inp.fx;
      if (fx === 'steps') groundMark(starTex(), new THREE.Color().setHSL(.12 + Math.random() * .05, 1, .6), x, z, player.face);
      if (fx === 'hearts') groundMark(heartTex(), 0xff6b9d, x, z, player.face + Math.PI);
      if (av.skin === 'unicorn') groundMark(dotTex(), new THREE.Color().setHSL((t * .5) % 1, .9, .65), player.pos.x, player.pos.z, 0, .9, 1.6);
    }

    // 粒子
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]; p.step(dt, t); p.life -= dt;
      if (p.life <= 0) { scene.remove(p.obj); p.obj.geometry && p.obj.geometry.dispose(); p.obj.material && p.obj.material.dispose(); parts.splice(i, 1); }
    }

    return {
      speedMul: (t < A.slowUntil ? .4 : 1) * (A.timed.skate ? 1.8 : 1) * (A.timed.grow ? 1.25 : A.timed.shrink ? .85 : 1) * (A.fly === 'jetpack' ? 1.4 : 1),
      jumpMul: (A.timed.spring ? 1.75 : 1) * (A.timed.grow ? 1.2 : 1),
      gravity, pose, lift, scale: A.scale,
    };
  }

  // 正在生效的效果（显示倒计时用）
  function status() {
    const out = Object.entries(A.timed).map(([k, end]) => ({ key: k, left: Math.max(0, end - A.t) }));
    if (A.t < A.slowUntil) out.push({ key: 'snow', left: A.slowUntil - A.t });
    if (A.fly === 'unicorn') out.push({ key: 'unicorn', left: Math.max(0, A.flyEnd - A.t) });
    else if (A.uniCdEnd > A.t) out.push({ key: 'unicorn-cd', left: A.uniCdEnd - A.t });
    return out;
  }
  // 别人的独角兽飞行（画面用）
  function setRemoteFly(on) { A.fly = on ? 'unicorn' : (A.fly === 'unicorn' ? null : A.fly); if (on) A.flyEnd = A.t + 99; }
  return { start, canUse, step, onJumpPress, status, reattach, slow, setRemoteFly, get flying() { return !!A.fly || A.descend; }, get slowed() { return A.t < A.slowUntil; } };
}
