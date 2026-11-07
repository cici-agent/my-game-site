// World coordinates shared by the fallback station, player and chase camera.
// The editable station uses Blender (x, y, z) -> world (x, z, 112 - y).
import { arrivalWalkingSolids, arrivalCameraSolids } from './lakeside-layout.js';

export const platformHeight = 1.45;
export const platformEdgeZ = 92.25;
const bodyRadius = .72;
export const stationFixtures = [];

function fixture(kind, x, z, width, depth, height) {
  stationFixtures.push({ kind, x, z, width, depth, height });
}

for (const x of [-34, -10, 16, 38]) fixture('bench', x, 101.6, 4.1, .76, 2.12);
for (const x of [-26, 4, 30]) fixture('bench', x, 75.7, 4.1, .76, 2.12);
for (const x of [-37, -5, 28]) fixture('rack', x, 106, 5.1, 1.55, 2.61);
for (const x of [-20, 18]) fixture('rack', x, 73, 5.1, 1.55, 2.61);
for (const [x, z] of [[-10, 121.5], [16, 125], [-30, 107]]) fixture('trolley', x, z, 2.12, 1.16, 2.27);
fixture('trunk', 26, 105.8, 1.7, 1, .9);
fixture('trunk', 28, 105.6, 1.1, .8, .65);
for (const x of [-38, -18, 2, 22, 42]) {
  fixture('lamp', x, 97.2, .62, .62, 5.5);
  fixture('lamp', x + 5, 78, .62, .62, 5.5);
}
for (let x = -48; x <= 48; x += 12) {
  fixture('column', x, 146.6, .96, .96, 9);
  fixture('column', x, 71.4, .96, .96, 9);
}

function box(left, right, front, back, bottom, top) {
  return { left, right, front, back, bottom, top };
}

const solids = [
  box(-52, 52, 111.55, 112.45, 0, 14), // Solid on both sides, including the secret spot.
  box(-52, 52, 147.4, 148.43, 0, 10),
];
for (let x = -48; x <= 48; x += 16) {
  solids.push(box(x - .43, x + .43, 112.4, 112.77, 0, 11.6));
}
for (const x of [-52, 52]) {
  solids.push(box(x - .3, x + .3, 112, 148.4, 0, 10));
  solids.push(box(x - .3, x + .3, platformEdgeZ, 112, 0, platformHeight + 1.1));
  solids.push(box(x - .3, x + .3, 70.25, 83.75, 0, platformHeight + 1.1));
}
for (const { x, z, width, depth, height } of stationFixtures) {
  const ground = z < 112 ? platformHeight : 0;
  solids.push(box(x - width / 2, x + width / 2, z - depth / 2, z + depth / 2, ground, ground + height));
}

// The entire rail bed is out of bounds on foot, including approaches from the ends.
const railBed = box(-52, 52, 83.75, platformEdgeZ, 0, 0);
const islandFace = box(-52, 52, 70.24, 70.25, 0, platformHeight);
const lakesideRailBed = box(85.25, 89.35, -118, -47, 0, 0);
const arrivalRails = [
  box(80.75, 85.25, -115.1, -114.9, 0, 2.55),
  box(80.75, 85.25, -47.1, -46.9, 0, 2.55),
  box(80.65, 80.85, -115, -80.5, 0, 2.55),
  box(80.65, 80.85, -75.5, -47, 0, 2.55),
];
const walkingSolids = [...solids, railBed, islandFace, lakesideRailBed, ...arrivalRails, ...arrivalWalkingSolids];

// Sweep each axis to the nearest face. This preserves sliding and never steps over
// a thin wall, even when a frame spans the entire wall thickness.
function sweep(value, delta, across, horizontal) {
  let end = value + delta;
  for (const b of walkingSolids) {
    const near = (horizontal ? b.front : b.left) - bodyRadius;
    const far = (horizontal ? b.back : b.right) + bodyRadius;
    if (across <= near || across >= far) continue;
    const low = (horizontal ? b.left : b.front) - bodyRadius;
    const high = (horizontal ? b.right : b.back) + bodyRadius;
    if (delta > 0 && value <= low && end > low) end = low;
    if (delta < 0 && value >= high && end < high) end = high;
  }
  return end;
}

export function moveInStation(position, dx, dz) {
  position.x = sweep(position.x, dx, position.z, true);
  position.z = sweep(position.z, dz, position.x, false);
}

export function canCrossBarrier(position, chapter) {
  if (Math.abs(position.x) > 2.25) return false;
  const offset = position.z - 112;
  if (offset > .45 && offset <= 2.7) return chapter === 0 || chapter === 5;
  return chapter === 5 && offset < -.45 && offset >= -2.7;
}

export function canBoardTrain(position, door, chapter) {
  return chapter === 1 && position.z >= platformEdgeZ + bodyRadius &&
    Math.hypot(position.x - door.x, position.z - door.z) <= 2.2;
}

// Clip a segment against an expanded 3D box (the slab method).
function clipBox(start, end, b, limit) {
  let enter = 0, leave = limit;
  function slab(origin, delta, lower, upper) {
    lower -= .22;
    upper += .22;
    if (Math.abs(delta) < 1e-8) return origin >= lower && origin <= upper;
    const a = (lower - origin) / delta, c = (upper - origin) / delta;
    enter = Math.max(enter, Math.min(a, c));
    leave = Math.min(leave, Math.max(a, c));
    return enter <= leave;
  }
  if (slab(start.x, end.x - start.x, b.left, b.right) &&
      slab(start.z, end.z - start.z, b.front, b.back) &&
      slab(start.y, end.y - start.y, b.bottom, b.top)) return enter;
  return limit;
}

const parkedTrain = box(-34.5, 14, 88.35, 92.05, .6, 5.5);
const arrivedTrain = box(85.48, 89.12, -103.5, -54.7, .6, 5.5);
const castleFront = box(-59, -25, -156.5, -133.3, 0, 29);
export function cameraFraction(target, desired, trainAtStation = true) {
  if (target.z < -40) {
    let fraction = clipBox(target, desired, castleFront, 1);
    if (!trainAtStation) fraction = clipBox(target, desired, arrivedTrain, fraction);
    for (const b of arrivalRails) fraction = clipBox(target, desired, b, fraction);
    for (const b of arrivalCameraSolids) fraction = clipBox(target, desired, b, fraction);
    return fraction;
  }
  if (Math.max(target.z, desired.z) < 69 || Math.min(target.z, desired.z) > 150 ||
      Math.min(target.x, desired.x) > 53 || Math.max(target.x, desired.x) < -53) return 1;
  let distance = trainAtStation ? clipBox(target, desired, parkedTrain, 1) : 1;
  for (const b of solids) distance = clipBox(target, desired, b, distance);
  return distance;
}
