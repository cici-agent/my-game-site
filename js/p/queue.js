// ===== 排队区：每个项目门口一条弯弯的排队道（栏杆 + 绳子），玩家和 NPC 都要排进去 =====
// 队伍最前面的人：项目能上客、而且还有空位，才能上；坐满了就等下一轮
import * as THREE from 'three';

const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .6, ...o });
const SLOT = 1.15;

// 从上车点 gate 往外（out 方向）做一条 Z 字形的道
function lanePath(gate, out, rows = 4, rowLen = 11, gap = 1.9, lead = 2.4) {
  const o = new THREE.Vector2(out[0], out[1]).normalize(), p = new THREE.Vector2(-o.y, o.x);
  const P = (a, b) => [gate[0] + o.x * a + p.x * b, gate[1] + o.y * a + p.y * b];
  const pts = [P(0, 0), P(lead, 0)]; let dist = lead, side = 1;
  pts.push(P(dist, side * rowLen / 2));
  for (let r = 1; r < rows; r++) { dist += gap; pts.push(P(dist, side * rowLen / 2)); side = -side; pts.push(P(dist, side * rowLen / 2)); }
  pts.push(P(dist + gap * .9, side * rowLen / 2));
  return pts;
}
function sample(pts, step) {
  const out = []; let carry = 0;
  for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
    for (let d = carry; d < L; d += step) out.push([ax + (bx - ax) * d / L, az + (bz - az) * d / L, Math.atan2(ax - bx, az - bz)]);
    carry = (carry - L) % step; if (carry < 0) carry += step; }
  return out;
}

export function createQueues({ scene, list, getTaken, sfx }) {
  const queues = [], postPts = [];
  const postM = M(0xdee2e6, { metalness: .6, roughness: .3 }), ropeM = M(0xe03131), baseM = M(0x495057);
  list.forEach((it, idx) => {
    const pts = lanePath(it.gate, it.out, it.rows || 4, it.rowLen || 11);
    const slots = sample(pts, SLOT);
    // 地面 + 栏杆
    const g = new THREE.Group(); scene.add(g);
    const lane = new THREE.MeshStandardMaterial({ color: 0xd6c7a6, roughness: .9 });
    for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(1.7, L + 1.7), lane); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.atan2(bx - ax, bz - az); m.position.set((ax + bx) / 2, .035, (az + bz) / 2); g.add(m);
      [-1, 1].forEach(s => { const nx = -(bz - az) / L, nz = (bx - ax) / L, ox = nx * s * .95, oz = nz * s * .95;
        const n = Math.max(1, Math.round(L / 2.2));
        for (let k = 0; k <= n; k++) { if ((i === 0 && k === 0)) continue; const x = ax + (bx - ax) * k / n + ox, z = az + (bz - az) * k / n + oz;
          postPts.push([x, z]); }
        const rope = new THREE.Mesh(new THREE.CylinderGeometry(.035, .035, L, 6), ropeM); rope.rotation.x = Math.PI / 2; rope.rotation.order = 'YXZ'; rope.rotation.y = Math.atan2(bx - ax, bz - az);
        rope.position.set((ax + bx) / 2 + ox, .92, (az + bz) / 2 + oz); g.add(rope); }); }
    // 队尾的牌子
    const end = pts[pts.length - 1], prev = pts[pts.length - 2];
    const c = document.createElement('canvas'); c.width = 320; c.height = 96; const x = c.getContext('2d');
    x.fillStyle = '#1c7ed6'; x.beginPath(); x.roundRect(4, 4, 312, 88, 18); x.fill(); x.fillStyle = '#fff'; x.font = 'bold 34px "PingFang SC","Microsoft YaHei",sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(`${it.ride.icon} ${it.ride.name} 排队`, 160, 50);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .78), new THREE.MeshBasicMaterial({ map: t, side: THREE.DoubleSide }));
    const ang = Math.atan2(end[0] - prev[0], end[1] - prev[1]); sg.position.set(end[0] + Math.sin(ang) * .3, 2.3, end[1] + Math.cos(ang) * .3); sg.rotation.y = ang; g.add(sg);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 2.3, 6), postM); pole.position.set(sg.position.x, 1.15, sg.position.z); g.add(pole);
    // 整个排队区当成一个长方形障碍物：不在队伍里的人走不进去（只能从入口排进来）
    const rows = it.rows || 4, rowLen = it.rowLen || 11, depth = 2.4 + (rows - 1) * 1.9 + .95, o = new THREE.Vector2(it.out[0], it.out[1]).normalize();
    const area = { box: [it.gate[0] + o.x * depth / 2, it.gate[1] + o.y * depth / 2, rowLen / 2 + 1.0, depth / 2, Math.atan2(o.x, o.y)], queueArea: true };
    queues.push({ idx, ride: it.ride, slots, members: [], cool: 0, entrance: [end[0], end[1]], area });
  });

  // 所有排队区的柱子一起画（省力气）
  { const o = new THREE.Object3D(), pi = new THREE.InstancedMesh(new THREE.CylinderGeometry(.06, .06, 1, 8), postM, postPts.length), bi = new THREE.InstancedMesh(new THREE.CylinderGeometry(.18, .2, .06, 10), baseM, postPts.length);
    postPts.forEach(([x, z], k) => { o.position.set(x, .5, z); o.updateMatrix(); pi.setMatrixAt(k, o.matrix); o.position.y = .03; o.updateMatrix(); bi.setMatrixAt(k, o.matrix); });
    scene.add(pi, bi); }
  const api = {
    queues,
    // 玩家 / NPC 进队：member = { pos: Vector3, face, speed, kind, board(ride) => bool }
    join(qi, m) { const q = queues[qi]; if (!q || q.members.includes(m)) return; q.members.push(m); m.queue = q; },
    leave(m) { const q = m.queue; if (!q) return; const i = q.members.indexOf(m); if (i >= 0) q.members.splice(i, 1); m.queue = null; },
    nearEntrance(x, z, r = 2.6) { let best = null, bd = r; queues.forEach(q => { const d = Math.hypot(q.entrance[0] - x, q.entrance[1] - z); if (d < bd) { bd = d; best = q; } }); return best; },
    // 已经被别人占了 / 预定了的座位
    taken(qi, except) { const q = queues[qi]; return getTaken(qi).concat((q.reserved || []).filter(r => r.member.boarding === r && r.member !== except).map(r => r.k)); },
    // 这一轮没赶上：回到队伍最前面
    backToFront(m) { const r = m.boarding; if (!r) return; m.boarding = null; const q = queues[r.qi]; q.members.unshift(m); m.queue = q; },
    done(m) { m.boarding = null; },
    position(m) { return m.queue ? m.queue.members.indexOf(m) : -1; },
    length(qi) { return queues[qi] ? queues[qi].members.length : 0; },
    update(dt) {
      queues.forEach(q => {
        q.cool -= dt;
        q.members.forEach((m, i) => {
          const s = q.slots[Math.min(i, q.slots.length - 1)], far = i >= q.slots.length;
          const tx = far ? q.entrance[0] + (i - q.slots.length + 1) * .9 * Math.sin(s[2]) : s[0], tz = far ? q.entrance[1] + (i - q.slots.length + 1) * .9 * Math.cos(s[2]) : s[1];
          const dx = tx - m.pos.x, dz = tz - m.pos.z, d = Math.hypot(dx, dz);
          if (d > .08) { const v = Math.min(d / dt, 3.4); m.pos.x += dx / d * v * dt; m.pos.z += dz / d * v * dt; m.face = Math.atan2(dx, dz); m.speed = v; }
          else { m.speed = 0; m.face = s[2]; }                 // 站着的时候面朝前面（朝着项目）
        });
        // 最前面的人到了门口：能上客、有空位，就放他进去，自己走到一个空位坐上
        q.reserved = (q.reserved || []).filter(r => r.member.boarding === r);
        const f = q.members[0];
        if (f && q.cool <= 0 && Math.hypot(f.pos.x - q.slots[0][0], f.pos.z - q.slots[0][1]) < .6 && q.ride.canBoard && q.ride.canBoard() && (!q.ride.boardTime || q.ride.boardTime() > 5)) {          // 剩的时间太少就不放进去了（走不到座位）
          const taken = api.taken(q.idx);
          const k = q.ride.freeSeat ? q.ride.freeSeat(taken) : (q.ride.seats || []).findIndex((_, i) => !taken.includes(i));
          if (k >= 0 && taken.length < (q.ride.capacity || 99)) {
            const sp = q.ride.boardSpot ? q.ride.boardSpot(k) : (() => { const v = new THREE.Vector3(); q.ride.seats[k].getWorldPosition(v); return [v.x, v.z]; })();
            const res = { member: f, k, spot: sp, ride: q.ride, qi: q.idx };
            q.members.shift(); f.queue = null; f.boarding = res; q.reserved.push(res); q.cool = .7;
            f.release(res);
          }
        }
      });
    },
  };
  return api;
}
