import * as THREE from 'three';

export const trainStop = { x: 8, y: .51, z: 90.2 };
export const vehicleOffsets = { VEH_Engine: 0, VEH_Tender: 6.65, VEH_Coach_1: 14.7, VEH_Coach_2: 25.7, VEH_Coach_3: 36.7 };
const arrivalTrackX = 87.3;
const lineStartX = -64;
const lineEndZ = -118;
const stationMinX = -52;
const stationMaxX = 52;
export const railOffset = .7925; // 1.435 clear gauge between 0.15-wide heads
// Path Y is the train root datum. Wheel bottoms and rail tops are 0.12 above it.
// The geometry and all moving vehicles use this same centre line.
const p = (x, z) => new THREE.Vector3(x, trainStop.y, z);
const path = new THREE.CurvePath();
path.add(new THREE.LineCurve3(p(lineStartX, trainStop.z), p(85, trainStop.z)));
path.add(new THREE.CubicBezierCurve3(p(85, trainStop.z), p(111, trainStop.z), p(132, 72), p(132, 48)));
path.add(new THREE.CubicBezierCurve3(p(132, 48), p(132, 10), p(arrivalTrackX, -12), p(arrivalTrackX, -54)));
path.add(new THREE.LineCurve3(p(arrivalTrackX, -54), p(arrivalTrackX, lineEndZ)));
const length = path.getLength();
const departure = trainStop.x - lineStartX;
const arrival = length - (-97.4 - lineEndZ);

export function travelledDistance(progress) {
  return (arrival - departure) * progress;
}

// CurvePath.getPoint already uses cumulative distance over its component
// curves. getPointAt would apply a second arc-length remapping.
function sample(distance, target) {
  return path.getPoint(THREE.MathUtils.clamp(distance / length, 0, 1), target);
}
const before = new THREE.Vector3(), after = new THREE.Vector3();
function pose(distance, halfWheelbase, position, tangent) {
  sample(distance - halfWheelbase, before);
  sample(distance + halfWheelbase, after);
  position.addVectors(before, after).multiplyScalar(.5);
  tangent.subVectors(after, before).normalize();
}

export function placeTrainPart(part, progress, offset, halfWheelbase, axleMidpoint = 0) {
  const distance = THREE.MathUtils.lerp(departure, arrival, progress) - offset + axleMidpoint;
  pose(distance, halfWheelbase, part.position, direction);
  // A locomotive has several fixed axles. Split the curve's chord error
  // between the central drivers and the outer axles, as their tread is finite.
  if (axleMidpoint) {
    sample(distance, center);
    part.position.lerp(center, .5).addScaledVector(direction, -axleMidpoint);
  }
  part.rotation.y = Math.atan2(direction.x, direction.z);
}

export function placeBogie(bogie, progress, offset, car) {
  const distance = THREE.MathUtils.lerp(departure, arrival, progress) - offset;
  pose(distance, .5, center, direction);
  // Both the vehicle and the railway live in an identity scene root.
  const dx = center.x - car.position.x, dz = center.z - car.position.z;
  const angle = car.rotation.y, c = Math.cos(angle), s = Math.sin(angle);
  bogie.position.set(c * dx - s * dz, 0, s * dx + c * dz);
  bogie.rotation.y = Math.atan2(direction.x, direction.z) - angle;
}

const samples = Array.from({ length: Math.ceil(length / 2) + 1 }, (_, i) => sample(Math.min(i * 2, length), new THREE.Vector3()));
export function inRailwayClearing(x, z) {
  if (x >= 74 && x <= 88 && z >= -116 && z <= -44) return true;
  return samples.some(point => (point.x - x) ** 2 + (point.z - z) ** 2 < 8 ** 2);
}

export function lakesidePlatformHeight(x, z) {
  if (z >= -115 && z <= -47 && x >= 80.75 && x <= 85.25) return 1.45;
  if (z >= -80.5 && z <= -75.5 && x >= 76.25 && x < 80.75) return (x - 76.25) / 4.5 * 1.45;
  return 0;
}

const center = new THREE.Vector3(), direction = new THREE.Vector3();
function sectionPoint(distance, side, height) {
  sample(distance, center);
  sample(distance - .02, before); sample(distance + .02, after);
  direction.subVectors(after, before).normalize();
  return [center.x + direction.z * side, height, center.z - direction.x * side];
}

// Sweep closed cross-sections along the line. Each external stretch uses one
// draw call per surface, regardless of its length or number of curved spans.
function ribbon(group, from, to, section, mat) {
  const vertices = [], indices = [];
  const steps = Math.ceil((to - from) / .9), n = section.length;
  for (let i = 0; i <= steps; i++) {
    const d = THREE.MathUtils.lerp(from, to, i / steps);
    for (const [s, y] of section) vertices.push(...sectionPoint(d, s, y));
    if (!i) continue;
    for (let j = 0; j < n; j++) {
      const a = (i - 1) * n + j, b = (i - 1) * n + (j + 1) % n;
      indices.push(a, b + n, b, a, a + n, b + n);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices); geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, mat); mesh.receiveShadow = true; group.add(mesh);
}

export function buildRailway(scene) {
  const group = new THREE.Group(); scene.add(group);
  const mat = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: .82, ...options });
  const iron = mat(0x6a6e72, { metalness: .58 }), wood = mat(0x574438), gravel = mat(0x554d46);
  const stone = mat(0x968c79), stripe = mat(0xd6b572), stop = mat(0x8b4439);
  const box = (width, height, depth, material, x, y, z) => {
    const obj = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
    obj.position.set(x, y, z); obj.receiveShadow = true; group.add(obj);
  };
  for (const [from, to] of [[0, stationMinX - lineStartX], [stationMaxX - lineStartX, length]]) {
    ribbon(group, from, to, [[-1.65, -.08], [-1.48, .18], [1.48, .18], [1.65, -.08]], gravel);
    for (const offset of [-railOffset, railOffset]) {
      ribbon(group, from, to, [[offset - .1, .32], [offset - .075, .63], [offset + .075, .63], [offset + .1, .32]], iron);
    }
    const count = Math.ceil((to - from) / 1.2);
    const ties = new THREE.InstancedMesh(new THREE.BoxGeometry(2.6, .18, .27), wood, count);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < count; i++) {
      const d = from + (i + .5) * (to - from) / count;
      pose(d, .15, center, direction);
      matrix.makeRotationY(Math.atan2(direction.x, direction.z));
      matrix.setPosition(center.x, .24, center.z); ties.setMatrixAt(i, matrix);
    }
    ties.receiveShadow = true; group.add(ties);
  }
  // The unused siding terminates in buffers at the ends of the station.
  for (const [x, trackZ] of [[-51, 85.8], [51, 85.8], [lineStartX + .5, trainStop.z]]) {
    for (const offset of [-railOffset, railOffset]) box(.35, 1.4, .32, iron, x, .83, trackZ + offset);
    box(.4, .4, 3.45, stop, x, 1.35, trackZ);
  }
  for (const offset of [-railOffset, railOffset]) box(.32, 1.4, .35, iron, arrivalTrackX + offset, .83, lineEndZ + .5);
  box(3.45, .4, .4, stop, arrivalTrackX, 1.35, lineEndZ + .5);
  box(4.5, 1.45, 68, stone, 83, .725, -81);
  box(.30, .012, 68, stripe, 84.92, 1.456, -81);
  for (const z of [-115, -47]) {
    for (const y of [2, 2.55]) box(4.5, .08, .1, iron, 83, y, z);
    for (const x of [80.8, 83, 85.2]) box(.12, 1.12, .12, iron, x, 2.01, z);
  }
  for (const [start, end] of [[-115, -80.5], [-75.5, -47]]) {
    for (const y of [2, 2.55]) box(.1, .08, end - start, iron, 80.8, y, (start + end) / 2);
    const intervals = Math.ceil((end - start) / 3.5);
    for (let i = 1; i < intervals; i++) box(.12, 1.12, .12, iron, 80.8, 2.01, start + i / intervals * (end - start));
  }
  for (const z of [-80.5, -75.5]) box(.12, 1.12, .12, iron, 80.8, 2.01, z);
  // Leave the small platform towards the boat over a flush, walkable ramp.
  const ramp = new THREE.Shape();
  ramp.moveTo(76.25, 0); ramp.lineTo(80.75, 0); ramp.lineTo(80.75, 1.45); ramp.closePath();
  const mesh = new THREE.Mesh(new THREE.ExtrudeGeometry(ramp, { depth: 5, bevelEnabled: false }), stone);
  mesh.position.z = -80.5; mesh.receiveShadow = true; group.add(mesh);
}
