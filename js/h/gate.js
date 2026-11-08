// ===== 菜鸟家园 · 栅栏门（菜园门口、自家空地门口用） =====
// 用户说：菜园的口子要有栅栏门；自家的空地（农场）也要有一圈栅栏
import * as THREE from 'three';

// 一扇门板：竖着的木条 + 上下两道横杆 + 一根斜撑（画在贴图上，透明的地方是缝）
let leafTex = null;
function pickets() {
  if (leafTex) return leafTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128; const g = c.getContext('2d');
  const wood = (x, y, w, h) => { const gr = g.createLinearGradient(x, 0, x + w, 0); gr.addColorStop(0, '#9b6a3c'); gr.addColorStop(.5, '#c49766'); gr.addColorStop(1, '#8a5a30'); g.fillStyle = gr; g.fillRect(x, y, w, h); };
  for (let k = 0; k < 7; k++) { const x = 6 + k * 35; wood(x, 6, 22, 122); g.fillStyle = '#c49766'; g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 11, 0); g.lineTo(x + 22, 8); g.fill(); }
  g.fillStyle = '#8a5a30'; g.fillRect(0, 26, 256, 14); g.fillRect(0, 96, 256, 14);
  g.save(); g.translate(0, 103); g.rotate(-Math.atan2(70, 256)); g.fillStyle = '#7a4e28'; g.fillRect(0, -6, 266, 12); g.restore();
  leafTex = new THREE.CanvasTexture(c); leafTex.colorSpace = THREE.SRGBColorSpace; leafTex.anisotropy = 4;
  return leafTex;
}
const leafMat = () => new THREE.MeshStandardMaterial({ map: pickets(), alphaTest: .5, transparent: false, side: THREE.DoubleSide, roughness: .9 });
let LM = null;

// parent：放在谁的坐标里（空地/菜园自己的坐标）；x、z：门中间；axis：门沿着 'x' 还是 'z' 方向；
// width：门洞宽；double：两扇；outX/outZ：门往哪边开（朝外）；key：存开关状态用；live：能不能开关
export function createGate({ parent, x, z, axis = 'x', width = 2.4, height = 1.15, double = false, out = 1, key = null, live = true, shadow = true, name = '栅栏门' }) {
  LM ||= leafMat();
  const frame = new THREE.Group(); frame.position.set(x, 0, z); frame.rotation.y = axis === 'z' ? -Math.PI / 2 : 0; parent.add(frame);
  // frame 里：门沿着 frame 的 x；frame 的 +z 在 axis='z' 时是外面的 -x，所以要反一下
  const dir = axis === 'z' ? -out : out;
  const post = new THREE.MeshStandardMaterial({ color: 0x8a5a30, roughness: .9 });
  [-1, 1].forEach(s => { const p = new THREE.Mesh(new THREE.BoxGeometry(.18, height + .25, .18), post); p.position.set(s * (width / 2 + .09), (height + .25) / 2, 0); p.castShadow = shadow; frame.add(p);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(.15, .18, 4), post); cap.position.set(s * (width / 2 + .09), height + .34, 0); cap.rotation.y = Math.PI / 4; frame.add(cap); });
  const leaves = [], n = double ? 2 : 1, lw = width / n - .04;
  for (let i = 0; i < n; i++) {
    const sgn = i === 0 ? 1 : -1, hinge = new THREE.Group(); hinge.position.set(sgn * -width / 2, 0, 0); frame.add(hinge);
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(lw, height, .06), LM); leaf.position.set(sgn * lw / 2, height / 2 + .08, 0); leaf.castShadow = shadow; hinge.add(leaf);
    if (i === 0 || double) { const latch = new THREE.Mesh(new THREE.BoxGeometry(.16, .06, .05), new THREE.MeshStandardMaterial({ color: 0x333333, metalness: .6, roughness: .4 })); latch.position.set(sgn * (lw - .1), height * .62, .06); hinge.add(latch); }
    leaves.push({ hinge, sgn });
  }
  // 锁：锁上时门板上挂一把金色的锁
  const lock = new THREE.Group(); leaves[0].hinge.add(lock); lock.visible = false;
  { const gold = new THREE.MeshStandardMaterial({ color: 0xe0b84a, metalness: .75, roughness: .3 });
    const b = new THREE.Mesh(new THREE.BoxGeometry(.18, .16, .07), gold); b.position.set(lw - .1, height * .5, .1); lock.add(b);
    const sh = new THREE.Mesh(new THREE.TorusGeometry(.06, .016, 6, 14, Math.PI), new THREE.MeshStandardMaterial({ color: 0xbfc5cc, metalness: .8, roughness: .25 })); sh.position.set(lw - .1, height * .5 + .08, .1); lock.add(sh); }
  let open = false, locked = false;
  if (key) try { open = localStorage.getItem(key) === '1'; locked = localStorage.getItem(key + '_lock') === '1'; } catch (e) {}
  if (locked) open = false;
  lock.visible = locked;
  const save = () => { if (key) try { localStorage.setItem(key, open ? '1' : '0'); localStorage.setItem(key + '_lock', locked ? '1' : '0'); } catch (e) {} };
  let ang = open ? 1 : 0;
  const apply = () => leaves.forEach(({ hinge, sgn }) => hinge.rotation.y = sgn * -dir * ang * Math.PI * .5);
  apply();
  const center = new THREE.Vector3();
  return {
    name, get open() { return open; }, setHeight(k) { frame.scale.y = k; },
    get passable() { return ang > .6; },     // 门开到一大半才能走过去
    get locked() { return locked; },
    toggle() { if (locked) return false; open = !open; save(); return open; },
    setLock(v) { locked = v; if (v) open = false; lock.visible = v; save(); },
    // 离门中间多远（世界坐标）
    dist(wx, wz) { frame.getWorldPosition(center); return Math.hypot(wx - center.x, wz - center.z); },
    update(dt) { if (!live) return; const t = open ? 1 : 0; if (Math.abs(t - ang) < 1e-3) return; ang += (t - ang) * Math.min(1, dt * 6); apply(); },
    dispose() { parent.remove(frame); },
  };
}
// 菜园、鸡舍、牧场的栅栏也能升级（用户说的）：越高越难跳，3 级跳不过去
export const PEN_FENCE = { 1: { name: '木栅栏', k: 1, jump: .65 }, 2: { name: '高栅栏', k: 1.6, jump: 1.5 }, 3: { name: '铁栅栏', k: 2.3, jump: 1.9 } };
// 点到一圈栅栏（本地坐标的线段）有多近
export function nearSegs(lx, lz, segs, r = 1.2) { return segs.some(([ax, az, bx, bz]) => { const len = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / len, uz = (bz - az) / len, t = (lx - ax) * ux + (lz - az) * uz; return t > .3 && t < len - .3 && Math.abs((lx - ax) * -uz + (lz - az) * ux) < r; }); }
export const fenceMaterial = () => (LM ||= leafMat());
