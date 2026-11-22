import * as THREE from 'three';

// Small deterministic surface maps are owned by the actor's sculpture kit.
// They add silhouette/material detail without loading assets or touching rigs.
export function creatureSurface(kit, kind = 'fur') {
  const texture = kit.texture('skin', 128), data = texture.image.data;
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const noise = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    const grain = noise - Math.floor(noise);
    let value;
    if (kind === 'scales') {
      const row = Math.floor(y / 12), u = ((x + row % 2 * 6) % 12) / 12, v = (y % 12) / 12;
      const rim = Math.abs(Math.hypot((u - .5) * 1.7, (v - .35) * 1.3) - .65);
      value = 224 + grain * 16 - Math.max(0, 1 - rim / .13) * 38;
    } else if (kind === 'skin') {
      const mottling = Math.sin(x*.047 + Math.sin(y*.061))*Math.cos(y*.05);
      value = 218 + mottling*19 + grain*16 - (grain>.88?15:0);
    } else if (kind === 'leaf') {
      value = 214 + Math.sin(x * .11 + y * .04) * 13 + grain * 13 - Math.max(0, 1 - Math.abs(x - 64) / 3) * 18;
    } else {
      const strandSeed = Math.sin(Math.floor(x + y*.17 + Math.sin(y*.04)*5) * 127.1 + Math.floor(y/22)*311.7)*43758.5453;
      const strand = strandSeed-Math.floor(strandSeed);
      const patches = Math.sin(x * .073 + Math.sin(y * .055) * 1.8) * Math.cos(y * .061);
      value = 226 + patches * 9 + strand * 8 + grain * 7;
    }
    const at = (y * 128 + x) * 4;
    data[at] = data[at + 1] = data[at + 2] = value;
  }
  texture.repeat.set(kind === 'scales' ? 2 : 3, kind === 'scales' ? 1 : 3);
  texture.needsUpdate = true;
  return texture;
}

// Five-sided tapered tufts use ten triangles each, instead of scaled spheres.
export function creatureTufts(kit, parent, material, { name, center, radii, count, length, lower = -.8, comb = null }) {
  const geometry = kit.geometry(new THREE.ConeGeometry(1, 1, 5, 1));
  const transforms = [], normal = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    const y = 1 - (i + .5) / count * 2;
    if (y < lower) continue;
    const angle = i * 2.399963, radial = Math.sqrt(1 - y * y);
    normal.set(Math.cos(angle) * radial, y, Math.sin(angle) * radial);
    dummy.position.set(center[0] + normal.x * radii[0], center[1] + normal.y * radii[1], center[2] + normal.z * radii[2]);
    const direction = comb ? new THREE.Vector3(...comb).addScaledVector(normal, .8).normalize() : normal;
    dummy.quaternion.setFromUnitVectors(up, direction);
    const size = length * (.7 + i % 7 * .065);
    dummy.scale.set(size * .13, size, size * .13); dummy.updateMatrix(); transforms.push(dummy.matrix.clone());
  }
  const mesh = new THREE.InstancedMesh(geometry, material, transforms.length); mesh.name = name;
  kit.trackInstance(mesh);
  transforms.forEach((matrix, i) => mesh.setMatrixAt(i, matrix)); mesh.instanceMatrix.needsUpdate = true;
  // Subpixel fibres should not stamp hard black speckles into shadow maps.
  mesh.castShadow = false; mesh.receiveShadow = true; parent.add(mesh); return mesh;
}

export function leafBladeGeometry(length = .3, width = .12, curvature = .045) {
  const vertices = [], uv = [];
  const point = (t, side) => [Math.sin(Math.PI * t) ** .8 * width * side, Math.sin(Math.PI * t) * curvature * (1 - Math.abs(side) * .65), -t * length];
  for (let i = 0; i < 10; i++) for (const side of [-1, 1]) {
    const a = i / 10, b = (i + 1) / 10;
    const triangle = side > 0 ? [[a, 0], [a, side], [b, 0], [b, 0], [a, side], [b, side]] : [[a, 0], [b, 0], [a, side], [b, 0], [b, side], [a, side]];
    for (const [t, s] of triangle) {
      vertices.push(...point(t, s)); uv.push((s + 1) / 2, t);
    }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.computeVertexNormals(); return geometry;
}

// Continuous anatomical cross sections avoid a chain of intersecting balls.
export function organicLoft(controlRings, segments = 32) {
  const rings = [];
  const cubic = (a, b, c, d, t) => .5 * ((2 * b) + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t * t + (-a + 3 * b - 3 * c + d) * t * t * t);
  for (let i = 0; i < controlRings.length - 1; i++) for (let sub = 0; sub < 4; sub++) {
    const ring = {}, before = controlRings[Math.max(0, i - 1)], a = controlRings[i], b = controlRings[i + 1], after = controlRings[Math.min(controlRings.length - 1, i + 2)];
    for (const key of ['z','y','rx','ry']) ring[key] = cubic(before[key], a[key], b[key], after[key], sub / 4);
    ring.rx = Math.max(.002, ring.rx); ring.ry = Math.max(.002, ring.ry); rings.push(ring);
  }
  rings.push(controlRings.at(-1));
  const positions = [], uv = [], indices = [];
  for (const [row, { z, y, rx, ry }] of rings.entries()) for (let i = 0; i <= segments; i++) {
    const angle = i / segments * Math.PI * 2;
    positions.push(Math.cos(angle) * rx, y + Math.sin(angle) * ry, z);
    uv.push(i / segments, row / (rings.length - 1));
    if (row && i) { const a = row * (segments + 1) + i, b = a - segments - 1; if (rings.at(-1).z > rings[0].z) indices.push(a, a - 1, b, a - 1, b - 1, b); else indices.push(a, b, a - 1, a - 1, b, b - 1); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  const normals=geometry.attributes.normal, joined=new THREE.Vector3();
  for(let row=0;row<rings.length;row++){const first=row*(segments+1),last=first+segments;joined.fromBufferAttribute(normals,first).add(new THREE.Vector3().fromBufferAttribute(normals,last)).normalize();normals.setXYZ(first,joined.x,joined.y,joined.z);normals.setXYZ(last,joined.x,joined.y,joined.z);}
  return geometry;
}

export function blinkAmount(time, offset = 0, period = 4.7) {
  const phase = (time + offset) % period;
  return phase < .16 ? Math.sin(phase / .16 * Math.PI) : 0;
}

export const visualDt = dt => Math.min(.1, Math.max(0, Number.isFinite(dt) ? dt : 0));

// Capture a small support proxy per rigid joint once. Runtime grounding only
// transforms these corners; it never scans vertices or rebuilds mesh bounds.
export function creatureFloorSupport(body, excluded = new Set()) {
  const boxes = new Map(), temporary = new THREE.Box3();
  body.traverse(node => {
    if (!node.geometry || excluded.has(node)) return;
    if (node.isInstancedMesh) { if (!node.boundingBox) node.computeBoundingBox(); temporary.copy(node.boundingBox); }
    else { if (!node.geometry.boundingBox) node.geometry.computeBoundingBox(); temporary.copy(node.geometry.boundingBox); }
    node.updateMatrix(); temporary.applyMatrix4(node.matrix);
    const box = boxes.get(node.parent) ?? new THREE.Box3(); box.union(temporary); boxes.set(node.parent, box);
  });
  const proxies = [...boxes].map(([joint,box]) => {
    const chain = []; for (let node = joint; node && node !== body.parent; node = node.parent) chain.unshift(node);
    const corners = []; for (const x of [box.min.x,box.max.x]) for (const y of [box.min.y,box.max.y]) for (const z of [box.min.z,box.max.z]) corners.push(new THREE.Vector3(x,y,z));
    return { chain, corners, matrix: new THREE.Matrix4() };
  });
  const point = new THREE.Vector3();
  function minimum() {
    let min = Infinity;
    for (const {chain,corners,matrix} of proxies) {
      matrix.identity(); for (const joint of chain) { joint.updateMatrix(); matrix.multiply(joint.matrix); }
      for (const corner of corners) min = Math.min(min, point.copy(corner).applyMatrix4(matrix).y);
    }
    return min;
  }
  return { minimum, count: proxies.length, lift(floor = 0, extraMinimum = Infinity) { const amount = Math.max(0, floor - Math.min(minimum(),extraMinimum)); body.position.y += amount; return amount; } };
}
