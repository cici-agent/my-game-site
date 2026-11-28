import * as THREE from 'three';
import { ribbon } from './layout.js';

const points = [[-288, -12], [-282, 5], [-294, 24], [-280, 46], [-268, 58], [-275, 78], [-264, 101]];
const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
const channel = curve.getSpacedPoints(80);
const HALF_WIDTH = 2.2;

export function byStream(x, z, margin = 0) {
  if (x < -303 - margin || x > -257 + margin || z < -16 - margin || z > 106 + margin) return false;
  const reach = HALF_WIDTH + margin;
  return channel.some((a, i) => {
    if (!i) return false;
    const b = channel[i - 1], dx = b.x - a.x, dz = b.z - a.z;
    const t = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
    return Math.hypot(x - a.x - t * dx, z - a.z - t * dz) <= reach;
  });
}

export const streamAccess = { x: -280, z: 46 };

export function createStream(scene) {
  function surface(width, color, height) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .72, side: THREE.DoubleSide });
    const strip = new THREE.Mesh(ribbon(channel, width), material);
    strip.position.y = height;
    strip.receiveShadow = true;
    scene.add(strip);
  }
  surface(6.7, 0xa88c61, .025);
  surface(5.2, 0x64b2ab, .035);
  surface(4.4, 0x328f9d, .045);

  const ripples = new THREE.InstancedMesh(new THREE.PlaneGeometry(.065, 1.7),
    new THREE.MeshBasicMaterial({ color: 0xadf0e5, transparent: true, opacity: .65, side: THREE.DoubleSide }), 26);
  ripples.frustumCulled = false; // 实例每帧沿溪流移动
  scene.add(ripples);
  const drop = new THREE.Object3D();
  const forward = new THREE.Vector3(), normal = new THREE.Vector3();
  const point = new THREE.Vector3();
  const stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x928b79, roughness: 1 }), 16);
  scene.add(stones);
  channel.filter((_, index) => index % 5 === 2).forEach((p, i) => {
    const t = curve.getTangentAt((i * 5 + 2) / 80);
    const offset = (i % 2 ? -1 : 1) * (2.78 + (i % 3) * .16);
    drop.position.set(p.x + t.z * offset, .12, p.z - t.x * offset);
    drop.rotation.set(0, i * 1.6, .15);
    drop.scale.set(.55 + (i % 4) * .15, .32, .58);
    drop.updateMatrix();
    stones.setMatrixAt(i, drop.matrix);
  });
  const length = curve.getLength();
  return function updateStream(seconds, player, overview) {
    ripples.visible = overview || Math.hypot(player.x - streamAccess.x, player.z - streamAccess.z) < 120;
    if (!ripples.visible) return;
    for (let i = 0; i < ripples.count; i++) {
      const t = (i / ripples.count + seconds * 1.5 / length) % 1;
      curve.getPointAt(t, point);
      curve.getTangentAt(t, forward);
      normal.set(forward.z, 0, -forward.x);
      point.addScaledVector(normal, ((i * 7) % 17 - 8) * .19);
      drop.position.set(point.x, .06, point.z);
      drop.rotation.set(-Math.PI / 2, 0, -Math.atan2(forward.x, forward.z));
      drop.scale.set(1, .65 + (i % 4) * .25, 1);
      drop.updateMatrix();
      ripples.setMatrixAt(i, drop.matrix);
    }
    ripples.instanceMatrix.needsUpdate = true;
  };
}
