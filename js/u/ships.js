// ===== 飞船模型 =====
// 每艘飞船都朝 +Z 方向，尾部引擎在 -Z。返回 { group, flame, engineLight, tailZ }
import * as THREE from 'three';
import { glowTex } from './tex.js';

const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: .45, metalness: .15, ...o });

function engineFx(group, z, color = 0xffa04d) {
  const flame = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex(), color, blending: THREE.AdditiveBlending, depthWrite: false }));
  flame.position.z = z; group.add(flame);
  const engineLight = new THREE.PointLight(color, 30, 14); engineLight.position.z = z - .1; group.add(engineLight);
  return { flame, engineLight };
}

// 1. 小菜鸟号：白身橙翼（初始飞船，没有武器）
function rookie() {
  const g = new THREE.Group();
  const white = std(0xfff6ec, { roughness: .4, metalness: .2 });
  const orange = std(0xff6b35, { roughness: .5, metalness: .1 });
  const glass = std(0x7fd8ff, { roughness: .1, metalness: .3, emissive: 0x1a5f88, emissiveIntensity: .4 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(1, 3, 8, 16), white); body.rotation.x = Math.PI / 2; g.add(body);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(1, 1.8, 16), orange); nose.rotation.x = Math.PI / 2; nose.position.z = 2.9; g.add(nose);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(.75, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), glass);
  cockpit.position.set(0, .55, .9); cockpit.scale.set(1, .9, 1.5); g.add(cockpit);
  const wingGeo = new THREE.BoxGeometry(3.2, .18, 1.6);
  [-1, 1].forEach(s => {
    const w = new THREE.Mesh(wingGeo, orange); w.position.set(s * 1.9, -.2, -.6); w.rotation.y = s * .35; w.rotation.z = s * -.12; g.add(w);
    const tip = new THREE.Mesh(new THREE.SphereGeometry(.28, 8, 8), new THREE.MeshBasicMaterial({ color: s > 0 ? 0x4dff88 : 0xff4d6d }));
    tip.position.set(s * 3.4, -.32, -1.1); g.add(tip);
  });
  const fin = new THREE.Mesh(new THREE.BoxGeometry(.16, 1.3, 1.3), orange); fin.position.set(0, 1, -1.6); fin.rotation.x = -.4; g.add(fin);
  const engine = new THREE.Mesh(new THREE.CylinderGeometry(.7, .85, .8, 16), std(0x555b77, { metalness: .6, roughness: .4 }));
  engine.rotation.x = Math.PI / 2; engine.position.z = -2.3; g.add(engine);
  return { group: g, ...engineFx(g, -2.9), tailZ: -3 };
}

export const SHIP_BUILDERS = { rookie };
export function buildShip(key) {
  return (SHIP_BUILDERS[key] || rookie)();
}
