// ===== 乐园里的 NPC 小游客：到处乱逛，有时候去排队玩项目（摩天轮、过山车、旋转木马、海盗船、鬼屋） =====
// 只在自己的屏幕上跑（每个人看到的小游客各不一样），不占用网络
import * as THREE from 'three';
import { nameTag } from '../net.js';
import { dayInfo, mmss, SHOW_START } from './daynight.js';

const NAMES = ['小美', '阿乐', '豆豆', '小虎', '糖糖', '乐乐', '星星', '果果', '小鹿', '团团', '小宇', '朵朵', '毛毛', '天天', '笑笑', '可可', '小雨', '阳阳', '多多', '甜甜', '皮皮', '妞妞', '贝贝', '欢欢', '小树', '月月', '圆圆', '壮壮', '小船', '芊芊', '浩浩', '安安', '琪琪', '牛牛', '晴晴', '宝宝'];
const FAVS = ['过山车', '摩天轮', '旋转木马', '海盗船', '鬼屋', '碰碰车', '卡丁车', '烟花秀', '喷泉', '摩天轮'];
const HOBBY = ['吃冰淇淋', '收集金币', '看星星', '画画', '跑步', '拍照', '唱歌', '搭积木', '养小猫', '讲笑话'];
const SPEED = 3.2;

// ---------- NPC 专用的小人造型：每个人的肤色、发型、衣服、帽子、小东西都不一样 ----------
const SKIN_T = [0xffdbc4, 0xf5c7a1, 0xe8b48a, 0xc68b5e, 0x9c6b45, 0xffe4d0];
const HAIR_C = [0x2b1d14, 0x4a2f1b, 0x8b5a2b, 0xd9a441, 0x111111, 0xb5651d, 0xe8c07a];
const SHIRT_C = [0xff6b6b, 0x4dabf7, 0x69db7c, 0xffd43b, 0xda77f2, 0xff922b, 0x22b8cf, 0xf783ac, 0xffffff, 0x845ef7];
const PANTS_C = [0x364fc7, 0x495057, 0x2b8a3e, 0x862e9c, 0xe8590c, 0x1c7ed6, 0xf1f3f5];
function personRand(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// 把一个小组里的零件合成一个网格（颜色写进顶点），一个人只要画几次，人多也不卡
const NPC_MAT = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: .6, side: THREE.DoubleSide });
function mergeGroup(group) {
  const meshes = group.children.filter(o => o.isMesh); if (meshes.length < 2) return;
  const pos = [], nor = [], col = [], c = new THREE.Color();
  meshes.forEach(m => { m.updateMatrix(); let g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone(); g.applyMatrix4(m.matrix);
    const p = g.attributes.position.array, n = g.attributes.normal.array; c.copy(m.material.color);
    for (let i = 0; i < p.length; i++) { pos.push(p[i]); nor.push(n[i]); } for (let i = 0; i < p.length / 3; i++) col.push(c.r, c.g, c.b);
    group.remove(m); });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  group.add(new THREE.Mesh(geo, NPC_MAT));
}
export function buildPerson(seed) {
  const r = personRand(seed * 9973 + 7), pk = a => a[Math.floor(r() * a.length)];
  const Ms = c => new THREE.MeshStandardMaterial({ color: c, roughness: .65 });
  const skin = Ms(pk(SKIN_T)), hairC = pk(HAIR_C), hair = Ms(hairC), shirtC = pk(SHIRT_C), shirt = Ms(shirtC), pants = Ms(pk(PANTS_C)), shoe = Ms(pk([0x212529, 0xffffff, 0xe03131, 0x1971c2]));
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const S = 1.18 + r() * .3; body.scale.setScalar(S);                        // 有高有矮（和玩家差不多大）
  const girl = r() < .5;
  const add = (par, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); par.add(m); return m; };
  // 腿（从胯部转）
  const legs = [-1, 1].map(s => { const L = new THREE.Group(); L.position.set(s * .15, .86, 0); body.add(L);
    add(L, new THREE.CylinderGeometry(.11, .1, .7, 10), girl && r() < .4 ? skin : pants, 0, -.36, 0);
    const sh = add(L, new THREE.BoxGeometry(.2, .14, .32), shoe, 0, -.76, .05); return L; });
  // 身体
  const torso = add(body, new THREE.CapsuleGeometry(.26, .42, 6, 14), shirt, 0, 1.18, 0); torso.scale.z = .75;
  if (girl && r() < .6) { const skirt = add(body, new THREE.ConeGeometry(.42, .42, 16, 1, true), Ms(new THREE.Color(shirtC).offsetHSL(0, 0, -.12).getHex()), 0, .9, 0); skirt.material.side = THREE.DoubleSide; }
  else add(body, new THREE.CylinderGeometry(.28, .28, .2, 14), pants, 0, .9, 0);
  // 衣服上的小图案
  if (r() < .6) add(body, new THREE.CircleGeometry(.09, 12), Ms(pk([0xffffff, 0xffd43b, 0xff6b6b, 0x212529])), 0, 1.25, .2);
  // 手臂（从肩膀转）
  const arms = [-1, 1].map(s => { const A = new THREE.Group(); A.position.set(s * .34, 1.48, 0); body.add(A);
    add(A, new THREE.CylinderGeometry(.075, .065, .55, 8), r() < .5 ? shirt : skin, 0, -.27, 0); add(A, new THREE.SphereGeometry(.075, 8, 6), skin, 0, -.57, 0); return A; });
  // 头
  const head = new THREE.Group(); head.position.y = 1.95; body.add(head);
  add(head, new THREE.SphereGeometry(.3, 18, 14), skin, 0, 0, 0);
  [-1, 1].forEach(s => { add(head, new THREE.SphereGeometry(.04, 8, 6), Ms(0x212529), s * .1, .03, .27); add(head, new THREE.SphereGeometry(.045, 8, 6), Ms(0xffa8a8), s * .17, -.07, .23); });
  const mouth = add(head, new THREE.TorusGeometry(.06, .015, 6, 12, Math.PI), Ms(0x862e2e), 0, -.09, .28); mouth.rotation.z = Math.PI;
  // 头发
  const cap = add(head, new THREE.SphereGeometry(.315, 18, 10, 0, Math.PI * 2, 0, Math.PI * .55), hair, 0, .02, -.02); cap.rotation.x = -.25;
  const style = Math.floor(r() * 5);
  if (girl && style < 2) { const tail = add(head, new THREE.SphereGeometry(.13, 10, 8), hair, 0, .02, -.33); tail.scale.set(1, 1.6, 1); }   // 马尾
  else if (girl && style < 4) [-1, 1].forEach(s => add(head, new THREE.SphereGeometry(.12, 10, 8), hair, s * .28, .1, -.05));                // 两个丸子
  else if (style === 4) for (let k = 0; k < 5; k++) { const sp = add(head, new THREE.ConeGeometry(.07, .2, 6), hair, (k - 2) * .09, .3, .02); sp.rotation.z = (k - 2) * -.25; }   // 刺刺头
  // 帽子 / 小东西
  const extra = r();
  if (extra < .22) { const hc = Ms(pk([0xff6b6b, 0x1c7ed6, 0xffd43b, 0x2b8a3e])); add(head, new THREE.SphereGeometry(.32, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), hc, 0, .06, 0); const b = add(head, new THREE.BoxGeometry(.3, .03, .25), hc, 0, .07, .3); }   // 棒球帽
  else if (extra < .34) { const hc = Ms(0xf4e3b1); add(head, new THREE.CylinderGeometry(.5, .5, .03, 20), hc, 0, .2, 0); add(head, new THREE.CylinderGeometry(.24, .28, .2, 16), hc, 0, .3, 0); }   // 草帽
  const hold = r();
  let balloon = null;
  if (hold < .25) { balloon = new THREE.Group(); balloon.position.set(0, -.57, 0); arms[1].add(balloon);           // 手里拿气球
    const bc = pk([0xff6b6b, 0xffd43b, 0x4dabf7, 0xda77f2, 0x69db7c]); const ln = new THREE.Mesh(new THREE.CylinderGeometry(.006, .006, 1.4, 4), Ms(0xffffff)); ln.position.y = .7; balloon.add(ln);
    const bb = new THREE.Mesh(new THREE.SphereGeometry(.28, 14, 12), new THREE.MeshStandardMaterial({ color: bc, roughness: .2 })); bb.scale.y = 1.2; bb.position.y = 1.55; balloon.add(bb); }
  else if (hold < .4) { const ic = new THREE.Group(); ic.position.set(0, -.62, .06); arms[0].add(ic);                 // 冰淇淋
    const cone = new THREE.Mesh(new THREE.ConeGeometry(.07, .2, 10), Ms(0xd9a441)); cone.rotation.x = Math.PI; cone.position.y = .02; ic.add(cone);
    const sc = new THREE.Mesh(new THREE.SphereGeometry(.08, 10, 8), Ms(pk([0xffc9de, 0xfff3bf, 0x8b5a2b, 0xb2f2bb]))); sc.position.y = .15; ic.add(sc); }
  else if (hold < .55) { const bp = add(body, new THREE.BoxGeometry(.4, .45, .2), Ms(pk([0xff922b, 0x1c7ed6, 0xe64980])), 0, 1.25, -.28); }   // 小书包
  [body, head, ...legs, ...arms].forEach(mergeGroup); arms.forEach(A => A.children.forEach(ch => ch.isGroup && mergeGroup(ch)));
  let t = r() * 10;
  return { root, skin: 'npc', rig: {}, animate(dt, speed = 0, air = false, sitting = false) {
    t += dt;
    if (sitting) { legs.forEach(L => L.rotation.x = -1.45); arms.forEach((A, i) => A.rotation.x = -.6 + Math.sin(t * 3 + i) * .08); body.position.y = .62 - .86 * S + .06; head.rotation.y = Math.sin(t * .7) * .3; return; }
    body.position.y = 0;
    const sw = Math.sin(t * (6 + speed * 6)) * Math.min(1, speed * 1.4) * .7;
    legs[0].rotation.x = sw; legs[1].rotation.x = -sw; arms[0].rotation.x = -sw * .8; arms[1].rotation.x = balloon ? -.3 : sw * .8;
    body.position.y = Math.abs(Math.cos(t * (6 + speed * 6))) * .04 * Math.min(1, speed * 2);
    head.rotation.y = speed < .05 ? Math.sin(t * .5) * .4 : 0;
    if (balloon) balloon.rotation.z = Math.sin(t * 1.3) * .08;
  } };
}


export function createNPCs({ scene, world, camera, tagsEl, islandR, playerRef, queues, qRides, count = 36 }) {
  const rnd = Math.random;
  const npcs = [];
  const tmp = new THREE.Vector3(), seatPos = new THREE.Vector3(), seatQ = new THREE.Quaternion();
  const mansion = world.mansion;
  // 能去玩的项目：所有有座位的游乐设施 + 鬼屋
  // 能去玩的项目：每个项目的排队区入口（碰碰车的权重大一点，大家都爱玩）+ 鬼屋
  const spots = qRides.map((r, i) => ({ kind: 'ride', ride: r, idx: i, pos: queues.queues[i].entrance, w: r === world.bumper ? 3 : [1.2, 1.5, 1, 2, 1][i] || 1 })).concat(mansion ? [{ kind: 'mansion', pos: mansion.entry, w: .5 }] : []);
  const pickSpot = () => { const tot = spots.reduce((a, s) => a + s.w, 0); let x = rnd() * tot; for (const s of spots) { x -= s.w; if (x <= 0) return s; } return spots[0]; };

  function blocked(x, z, pad = .6) {
    if (Math.hypot(x, z) > islandR - 4) return true;
    if (mansion && mansion.near(x, z)) return true;
    for (const c of world.colliders) {
      if (c.box) { const [bx, bz, hw, hl, yaw] = c.box, co = Math.cos(yaw), si = Math.sin(yaw), dx = x - bx, dz = z - bz, lx = dx * co - dz * si, lz = dx * si + dz * co; if (Math.abs(lx) < hw + pad && Math.abs(lz) < hl + pad) return true; }
      else if (Math.hypot(x - c[0], z - c[1]) < c[2] + pad) return true;
    }
    return false;
  }
  function randomPoint() { for (let k = 0; k < 40; k++) { const a = rnd() * Math.PI * 2, d = 8 + Math.sqrt(rnd()) * (islandR - 20), x = Math.cos(a) * d, z = Math.sin(a) * d; if (!blocked(x, z, 1.5)) return [x, z]; } return [0, 60]; }
  function push(n) {          // 把人推出障碍物
    const p = n.pos;
    for (const c of world.colliders) {
      if (n.state === 'toSeat' && (c.queueArea || (n.ignore && n.ignore.includes(c)))) continue;
      if (c.box) { const [bx, bz, hw, hl, yaw] = c.box, co = Math.cos(yaw), si = Math.sin(yaw), dx = p.x - bx, dz = p.z - bz; let lx = dx * co - dz * si, lz = dx * si + dz * co;
        const ox = hw + .5 - Math.abs(lx), oz = hl + .5 - Math.abs(lz); if (ox > 0 && oz > 0) { if (ox < oz) lx = Math.sign(lx) * (hw + .5); else lz = Math.sign(lz) * (hl + .5); p.x = bx + lx * co + lz * si; p.z = bz - lx * si + lz * co; } }
      else { const dx = p.x - c[0], dz = p.z - c[1], d = Math.hypot(dx, dz), r = c[2] + .5; if (d < r && d > 1e-4) { p.x = c[0] + dx / d * r; p.z = c[1] + dz / d * r; } }
    }
    if (mansion && mansion.near(p.x, p.z) && !n.inMansion) mansion.collide(p, .45);
    const r = Math.hypot(p.x, p.z); if (r > islandR - 3) { p.x *= (islandR - 3) / r; p.z *= (islandR - 3) / r; }
  }

  for (let k = 0; k < count; k++) {
    const av = buildPerson(k + 1 + Math.floor(Math.random() * 1000)); scene.add(av.root);
    const [x, z] = randomPoint();
    const n = { name: NAMES[k % NAMES.length], av, pos: new THREE.Vector3(x, 0, z), face: rnd() * 6.28, speed: 0, state: 'idle', timer: 1 + rnd() * 4,
      fav: FAVS[k % FAVS.length], hobby: HOBBY[k % HOBBY.length], chatT: 0, followT: 0, bubble: null, bubbleT: 0,
      target: null, spot: null, ride: null, wait: 0, stuckT: 0, lastD: 1e9, inMansion: false, tag: nameTag(tagsEl, NAMES[k % NAMES.length], '#a5d8ff') };
    n.tag.classList.add('npc');
    n.release = res => { n.state = 'toSeat'; n.target = res.spot; n.ignore = res.ride.colliders || []; n.seatT = 0; n.stuckT = 0; n.lastD = 1e9; };
    n.bubble = document.createElement('div'); n.bubble.className = 'npc-bubble'; tagsEl.appendChild(n.bubble);
    npcs.push(n);
  }
  // 一开场就有很多人在排队
  setTimeout(() => npcs.forEach(n => { if (rnd() < .6) { const sp = pickSpot(); if (sp.kind !== 'ride') return; n.spot = sp; n.state = 'queue'; n.wait = 0; queues.join(sp.idx, n);
    const q = queues.queues[sp.idx], qi2 = Math.min(q.members.length - 1, q.slots.length - 1), sl = q.slots[qi2]; n.pos.set(sl[0], 0, sl[1]); n.qk = qi2; } }), 0);
  function decide(n) {
    // 烟花秀快开始了：大部分人去乐园中间看烟花
    if (showSoon() && rnd() < .85) { const a = rnd() * Math.PI * 2, d = 12 + rnd() * 26; n.target = [Math.sin(a) * d, 10 + Math.cos(a) * d]; n.state = 'toWatch'; n.stuckT = 0; n.lastD = 1e9; return; }
    if (rnd() < .82) { const s = pickSpot(); n.spot = s; n.target = [s.pos[0], s.pos[1]]; n.state = 'toSpot'; }
    else { n.target = randomPoint(); n.state = 'walk'; }
    n.stuckT = 0; n.lastD = 1e9;
  }
  function walkTo(n, dt) {
    const dx = n.target[0] - n.pos.x, dz = n.target[1] - n.pos.z, d = Math.hypot(dx, dz);
    if (d < 1.2) return true;
    const want = Math.atan2(dx, dz); let df = want - n.face; df = Math.atan2(Math.sin(df), Math.cos(df)); n.face += df * Math.min(1, dt * 5);
    const sp = n.state === 'follow' ? Math.min(8, 3 + d * .5) : SPEED;
    n.pos.x += Math.sin(n.face) * sp * dt; n.pos.z += Math.cos(n.face) * sp * dt; n.speed = sp;
    push(n);
    // 卡住了（绕不过障碍物）：换个地方走
    n.stuckT += dt; if (n.stuckT > 2.5 && n.state !== 'follow') { if (d > n.lastD - 1.5) { n.target = randomPoint(); n.state = 'walk'; n.spot = null; } n.stuckT = 0; n.lastD = d; }
    return false;
  }
  // 排到了：上车（碰碰车会玩 1~2 轮）
  function boardNpc(n, r, taken, want) {
    const prev = r.playerPos; r.playerPos = [n.pos.x, n.pos.z];
    const ride = r === world.bumper ? r.board(taken, 'npc', rnd() < .5 ? 1 : 2, want) : r.board(taken, want); r.playerPos = prev;
    if (!ride) return false;
    ride.rideIdx = n.spot.idx; n.ride = ride; n.state = 'ride'; return true;
  }
  const showSoon = () => { const I = dayInfo(); return I.phase === 'night' && I.nightT > SHOW_START - 45 && I.nightT < SHOW_START + 180; };

  function say(n, text, secs = 6) { n.bubble.textContent = text; n.bubbleT = secs; }
  const pick = a => a[Math.floor(rnd() * a.length)];
  const doing = n => n.state === 'ride' ? `在玩${n.spot.ride.name}` : n.state === 'queue' ? `在排队玩${n.spot.ride.name}` : n.state === 'toSpot' ? `正要去${n.spot.ride ? n.spot.ride.name : '鬼屋'}` : n.state === 'follow' ? '跟着你逛' : '在乐园里随便逛逛';
  // 聊天：看你说了什么，挑一句回答（规则 + 一点随机）
  function reply(n, raw) {
    const q = (raw || '').trim().toLowerCase(), has = (...w) => w.some(x => q.includes(x));
    const I = dayInfo(), showIn = I.phase === 'night' ? SHOW_START - I.nightT : I.toNight + SHOW_START;
    if (!q) return pick(['嗯？你想说什么呀～', '我在听呢！']);
    if (has('你好', '嗨', 'hi', 'hello', '哈喽', '在吗')) return pick([`你好呀！我是${n.name}～`, `嗨嗨！今天乐园人好多呀`, `你好！要不要一起玩？`]);
    if (has('名字', '你是谁', '叫什么')) return `我叫${n.name}，是来乐园玩的小游客！`;
    if (has('再见', '拜拜', 'bye', '走了')) { n.chatT = 1.5; return pick(['拜拜～玩得开心！', '下次见！', '再见啦，记得看烟花秀哦！']); }
    if (has('一起', '跟我', '陪我', '朋友', '跟着')) { n.state = 'follow'; n.followT = 45; return pick(['好呀好呀！我跟着你走～', '走吧走吧，你去哪我就去哪！', '耶！我们是好朋友了！']); }
    if (has('烟花')) return I.phase === 'night' && I.nightT >= SHOW_START && I.nightT < SHOW_START + 180 ? '烟花秀正在放！快抬头看天上！🎆' : `烟花秀还有 ${mmss(showIn)} 开始，到时候在乐园中间看最好！`;
    if (has('几点', '时间', '天黑', '晚上', '白天', '天亮')) return I.phase === 'night' ? `现在是晚上，还有 ${mmss(I.toDay)} 天亮～` : `现在是白天，还有 ${mmss(I.toNight)} 天黑。`;
    if (has('干嘛', '干什么', '在做', '做什么')) return `我${doing(n)}呀！`;
    if (has('喜欢', '最爱', '最好玩')) return `我最喜欢${n.fav}！平时还喜欢${n.hobby}。你呢？`;
    if (has('推荐', '玩什么', '好玩', '无聊')) { const r = pick(['过山车超刺激！', '摩天轮上能看到整个乐园～', '鬼屋……我不敢一个人进去 😱', '碰碰车可以撞来撞去，好好玩！', '去卡丁车岛吧，有地下隧道！', '海盗船荡得好高！', '旋转木马很适合拍照～']); return `我推荐：${r}`; }
    if (has('过山车')) return pick(['过山车冲下去的时候我会大叫！', '坐过山车要排队，等它回站就能上～']);
    if (has('摩天轮')) return pick(['摩天轮转一圈，最高的地方能看到卡丁车岛的传送门！', '晚上坐摩天轮看烟花最美了～']);
    if (has('鬼屋')) return pick(['鬼屋里好黑……听说里面有会动的娃娃 😨', '鬼屋出口只能出不能进哦！']);
    if (has('碰碰车')) return pick(['碰碰车！我最喜欢撞别人了 😆', '碰碰车在乐园西南边～']);
    if (has('卡丁车')) return pick(['卡丁车岛要从传送门过去，跑一圈有两公里多！', '卡丁车的隧道里有小汽车，小心别撞上！']);
    if (has('海盗船')) return '海盗船荡到最高的时候好像要飞出去了！';
    if (has('木马')) return '旋转木马转啊转，我会晕的 😵';
    if (has('金币', '钱', '买')) return pick(['金币可以在商店买皮肤和道具～', '道具商店的烟花很好看！']);
    if (has('喷泉')) return '喷泉上面有一只金色的小菜鸟，晚上池边的灯会亮哦！';
    if (has('谢谢', '感谢')) return pick(['不客气～', '嘿嘿，小事一桩！']);
    if (has('笑话')) return pick(['为什么小菜鸟不怕冷？因为它有“绒”气！😄', '海盗船为什么一直荡？因为它停不下来想你～']);
    if (has('?', '？', '吗', '呢', '什么', '怎么', '为什么')) return pick(['这个我也不太清楚耶……', '嗯……让我想想，你可以去问问别的小游客！', `我不知道诶，不过我知道${n.fav}超好玩！`]);
    return pick(['哈哈，真的吗？', '好有意思！', `嗯嗯！对了，我现在${doing(n)}。`, '你今天玩了什么项目呀？', '我们一起去玩吧？说“一起玩”我就跟着你！', '😄']);
  }
  return {
    near(x, z, r = 3.2) { let best = null, bd = r; npcs.forEach(n => { if (n.state === 'ride' || n.state === 'mansion') return; const d = Math.hypot(n.pos.x - x, n.pos.z - z); if (d < bd) { bd = d; best = n; } }); return best; },
    startChat(n) { if (n.state === 'queue') queues.leave(n); if (n.state !== 'follow') n.state = 'chat'; n.chatT = 60; say(n, pick([`你好呀！我是${n.name}～`, '嗨！找我有事吗？', '嘿嘿，你好！']), 5); return n.bubble.textContent; },
    talk(n, text) { if (n.state === 'queue') queues.leave(n); if (n.state !== 'follow') { n.state = 'chat'; n.chatT = 60; } const r = reply(n, text); say(n, r, 7); return r; },
    endChat(n) { if (n.state === 'chat') { n.state = 'idle'; n.timer = 1.5; } },
    // 玩家要上的座位：把 NPC 坐着的也算进去
    takenSeats(ri) { return npcs.filter(n => n.ride && n.ride.rideIdx === ri).map(n => n.ride.seatIndex); },
    list: npcs,
    update(dt, show = true) {
      for (const n of npcs) {
        if (n.state !== 'queue') n.speed = 0;
        if (n.state === 'chat') {                         // 在聊天：站着不动，看着玩家
          const want = Math.atan2(playerRef.pos.x - n.pos.x, playerRef.pos.z - n.pos.z); let df = want - n.face; df = Math.atan2(Math.sin(df), Math.cos(df)); n.face += df * Math.min(1, dt * 6);
          n.chatT -= dt; if (n.chatT <= 0 || n.pos.distanceTo(playerRef.pos) > 8) { n.state = 'idle'; n.timer = 1; }
        } else if (n.state === 'follow') {                 // 跟着玩家走
          n.followT -= dt; const d = Math.hypot(playerRef.pos.x - n.pos.x, playerRef.pos.z - n.pos.z);
          if (n.followT <= 0 || d > 60 || playerRef.riding || playerRef.kart || playerRef.bumper) { n.state = 'idle'; n.timer = 2; if (n.followT <= 0) say(n, '我去别的地方逛逛啦，拜拜～', 4); }
          else if (d > 3) { n.target = [playerRef.pos.x, playerRef.pos.z]; walkTo(n, dt); }
        } else if (n.state === 'idle') { n.timer -= dt; if (n.timer <= 0) decide(n); }
        else if (n.state === 'walk') { if (walkTo(n, dt)) { n.state = 'idle'; n.timer = 1 + rnd() * 5; } }
        else if (n.state === 'toSpot') {
          if (walkTo(n, dt)) {
            if (n.spot.kind === 'mansion') { n.state = 'mansion'; n.inMansion = true; n.timer = 30 + rnd() * 40; }
            else if (queues.length(n.spot.idx) > (n.spot.ride.capacity || 8) * 2) { n.state = 'idle'; n.timer = 1; n.spot = null; }      // 队太长了，换一个
            else { n.state = 'queue'; n.wait = 0; queues.join(n.spot.idx, n); }
          }
        } else if (n.state === 'queue') {
          n.wait += dt;                                   // 排队区自己会让人往前挪；排到了会调 n.board()
          if (n.wait > 240) { queues.leave(n); n.state = 'idle'; n.timer = 1; n.spot = null; }
        } else if (n.state === 'toSeat') {                 // 排到了：自己走到空位，坐上去
          const res = n.boarding; n.seatT += dt;
          if (!res) { n.state = 'idle'; n.timer = 1; }
          else if (!res.ride.canBoard()) { queues.backToFront(n); n.state = 'queue'; }          // 没赶上这一轮：回到队伍最前面
          else if (Math.hypot(n.target[0] - n.pos.x, n.target[1] - n.pos.z) < 1.35 || n.seatT > 12) {
            if (boardNpc(n, res.ride, queues.taken(res.qi, n), res.k)) queues.done(n); else { queues.backToFront(n); n.state = 'queue'; }
          } else { const sp = SPEED; n.stuckT = 0; walkTo(n, dt); }
        } else if (n.state === 'toWatch') {
          if (walkTo(n, dt) || n.stuckT > 2.4) { n.state = 'watch'; }
        } else if (n.state === 'watch') {                 // 看烟花：面朝乐园中间
          const want = Math.atan2(-n.pos.x, 10 - n.pos.z); let df = want - n.face; df = Math.atan2(Math.sin(df), Math.cos(df)); n.face += df * Math.min(1, dt * 3);
          if (!showSoon()) { n.state = 'idle'; n.timer = rnd() * 4; }
          else if (rnd() < dt * .05) say(n, ['哇——！', '好漂亮！🎆', '这个是爱心形状的！', '好大的烟花！', '还有还有！'][Math.floor(rnd() * 5)], 3);
        } else if (n.state === 'ride') {
          const r = n.ride;
          if (r.done()) { r.release && r.release(); const e = r.exitPos || n.spot.pos; n.pos.set(e[0] + (rnd() - .5) * 2, 0, e[1] + (rnd() - .5) * 2); push(n); n.ride = null; n.av.root.quaternion.identity(); n.state = 'idle'; n.timer = 1 + rnd() * 3; }
          else { r.seat.getWorldPosition(seatPos); r.seat.getWorldQuaternion(seatQ); n.av.root.position.copy(seatPos).y -= .62; n.av.root.quaternion.copy(seatQ); n.av.animate(dt, 0, false, true); }
        } else if (n.state === 'mansion') {
          n.timer -= dt;
          if (n.timer <= 0) { const e = mansion.exitOut || mansion.entry; n.pos.set(e[0], 0, e[1]); n.inMansion = false; n.face = mansion.exitYaw ?? n.face; n.target = randomPoint(); n.state = 'walk'; }
        }
        const visible = show && n.state !== 'mansion';
        n.av.root.visible = visible;
        if (n.state !== 'ride') { n.av.root.position.copy(n.pos); n.av.root.rotation.set(0, n.face, 0); n.av.animate(dt, n.speed / 7.5, false, false); }
        // 名字标签
        tmp.copy(n.av.root.position); tmp.y += 3.1; tmp.project(camera);
        const vis = visible && tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1 && n.av.root.position.distanceTo(playerRef.pos) < 45;
        n.tag.style.opacity = vis ? 1 : 0;
        if (vis) n.tag.style.transform = `translate(${(tmp.x + 1) / 2 * innerWidth}px, ${(1 - tmp.y) / 2 * innerHeight}px) translate(-50%, -100%)`;
        n.bubbleT -= dt; const bv = vis && n.bubbleT > 0;
        n.bubble.style.opacity = bv ? 1 : 0;
        if (bv) n.bubble.style.transform = `translate(${(tmp.x + 1) / 2 * innerWidth}px, ${(1 - tmp.y) / 2 * innerHeight - 26}px) translate(-50%, -100%)`;
      }
    },
  };
}
