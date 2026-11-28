import * as THREE from 'three';

const points = [
  [-323, -78], [-315, -61], [-305, -43], [-297, -27], [-288, -12],
  [-282, 5], [-294, 24], [-280, 46], [-268, 58], [-275, 78], [-264, 101],
  [-272, 117], [-282, 132], [-295, 149], [-306, 153],
];
const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)));
const SEGMENTS = 160;
const channel = curve.getSpacedPoints(SEGMENTS);
const length = curve.getLength();
const halfWidth = t => {
  const taper = Math.sqrt(THREE.MathUtils.smoothstep(Math.min(t, 1 - t), 0, .065));
  return taper * (3.75 + .66 * Math.sin(t * Math.PI * 6) + .43 * Math.sin(t * Math.PI * 13));
};

function nearestChannel(x, z, margin) {
  if (x < -330 - margin || x > -253 + margin || z < -87 - margin || z > 163 + margin) return null;
  let best = Infinity, hit = null;
  for (let i = 1; i < channel.length; i++) {
    const a = channel[i - 1], b = channel[i], dx = b.x - a.x, dz = b.z - a.z;
    const q = THREE.MathUtils.clamp(((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz), 0, 1);
    const bx = a.x + q * dx, bz = a.z + q * dz;
    const distance = Math.hypot(x - bx, z - bz);
    if (distance < best && distance <= halfWidth((i - 1 + q) / SEGMENTS) + margin) {
      best = distance;
      hit = [bx, bz];
    }
  }
  return hit;
}

export function byStream(x, z, margin = 0) {
  return !!nearestChannel(x, z, margin);
}

export function streamBobber(pos) {
  return nearestChannel(pos.x, pos.z, 3);
}

function streamStrip(scale) {
  const positions = [], indices = [];
  channel.forEach((p, i) => {
    const a = channel[Math.max(0, i - 1)], b = channel[Math.min(SEGMENTS, i + 1)];
    const width = scale * halfWidth(i / SEGMENTS);
    const norm = width / Math.hypot(b.x - a.x, b.z - a.z);
    const x = (b.z - a.z) * norm, z = (a.x - b.x) * norm;
    positions.push(p.x + x, 0, p.z + z, p.x - x, 0, p.z - z);
    if (i < SEGMENTS) {
      const j = i * 2;
      indices.push(j, j + 1, j + 2, j + 1, j + 3, j + 2);
    }
  });
  const mesh = new THREE.BufferGeometry();
  mesh.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  mesh.setIndex(indices);
  mesh.computeVertexNormals();
  return mesh;
}

export const streamAccess = { x: -280, z: 46 };

export function createStream(scene) {
  function surface(scale, color, height) {
    const material = new THREE.MeshStandardMaterial({ color, roughness: .72, side: THREE.DoubleSide });
    const strip = new THREE.Mesh(streamStrip(scale), material);
    strip.position.y = height;
    strip.receiveShadow = true;
    scene.add(strip);
  }
  surface(1.22, 0xa88c61, .025);
  surface(1, 0x64b2ab, .035);
  surface(.72, 0x328f9d, .045);

  const ripples = new THREE.InstancedMesh(new THREE.PlaneGeometry(.065, 1.7),
    new THREE.MeshBasicMaterial({ color: 0xadf0e5, transparent: true, opacity: .65, side: THREE.DoubleSide }), 42);
  ripples.frustumCulled = false; // 实例每帧沿溪流移动
  scene.add(ripples);
  const drop = new THREE.Object3D();
  const forward = new THREE.Vector3(), normal = new THREE.Vector3();
  const point = new THREE.Vector3();
  const stones = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: 0x928b79, roughness: 1 }), 32);
  scene.add(stones);
  channel.filter((_, index) => index % 5 === 2).forEach((p, i) => {
    const along = (i * 5 + 2) / SEGMENTS;
    const t = curve.getTangentAt(along);
    const offset = (i % 2 ? -1 : 1) * (halfWidth(along) + .65 + (i % 3) * .16);
    drop.position.set(p.x + t.z * offset, .12, p.z - t.x * offset);
    drop.rotation.set(0, i * 1.6, .15);
    drop.scale.set(.55 + (i % 4) * .15, .32, .58);
    drop.updateMatrix();
    stones.setMatrixAt(i, drop.matrix);
  });
  return function updateStream(seconds, player, overview) {
    ripples.visible = overview || player.x < -195;
    if (!ripples.visible) return;
    for (let i = 0; i < ripples.count; i++) {
      const t = (i / ripples.count + seconds * 1.5 / length) % 1;
      curve.getPointAt(t, point);
      curve.getTangentAt(t, forward);
      normal.set(forward.z, 0, -forward.x);
      point.addScaledVector(normal, ((i * 7) % 17 - 8) * .08 * halfWidth(t));
      drop.position.set(point.x, .06, point.z);
      drop.rotation.set(-Math.PI / 2, 0, -Math.atan2(forward.x, forward.z));
      drop.scale.set(1, Math.min(1, halfWidth(t) / 3) * (.65 + (i % 4) * .25), 1);
      drop.updateMatrix();
      ripples.setMatrixAt(i, drop.matrix);
    }
    ripples.instanceMatrix.needsUpdate = true;
  };
}
