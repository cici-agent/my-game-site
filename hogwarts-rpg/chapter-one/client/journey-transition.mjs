import * as THREE from 'three';
import { getSceneNavigation } from './scene-navigation.mjs';
import { canOccupy, moveWithCollisions, boundsArray } from './scene-geometry.mjs';

const outdoor = new Set(['SC03', 'SC08', 'SC09', 'SC11', 'SC12']);
const copy = p => ({ x: p.x, y: p.y ?? 0, z: p.z });
const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const gatewayZ = (id, side) => side === 'exit'
  ? ({ SC01: -11.4, SC02: -10.22, SC00: -12.24, SC04: -12.24 })[id] ?? (outdoor.has(id) ? -14 : -10.69)
  : id === 'SC02' ? 10.9 : id === 'SC01' ? 16.8 : id === 'SC03' ? getSceneNavigation(id).bounds[3] - .2 : outdoor.has(id) ? 11.8 : 14.6;

// Path only within authored navigation; the connector itself is a temporary
// presentation corridor. Its coordinates must never be sent as player moves.
function navigationPath(from, to, navigation) {
  const bounds = boundsArray(navigation.bounds), walls = navigation.walls ?? [];
  const clear = (a, b) => distance(moveWithCollisions(a, b, bounds, walls), b) < .035;
  if (clear(from, to)) return [copy(from), copy(to)];
  const step = .45, key = p => `${Math.round(p.x / step)}:${Math.round(p.z / step)}`;
  const start = copy(from), open = [{ p: start, g: 0, f: distance(start, to) }];
  const costs = new Map([[key(start), 0]]), parents = new Map(), points = new Map([[key(start), start]]);
  for (let visit = 0; open.length && visit < 7000; visit++) {
    open.sort((a, b) => a.f - b.f); const current = open.shift(), currentKey = key(current.p);
    if (current.g > costs.get(currentKey)) continue;
    if (distance(current.p, to) < .8 && clear(current.p, to)) {
      const result = [copy(to)]; let cursor = currentKey;
      while (cursor) { result.unshift(points.get(cursor)); cursor = parents.get(cursor); }
      // Remove grid zigzags only when the actual collision sweep is clear.
      const smooth = [result[0]]; let at = 0;
      while (at < result.length - 1) { let end = result.length - 1; while (end > at + 1 && !clear(result[at], result[end])) end--; smooth.push(result[end]); at = end; }
      return smooth;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1]]) {
      const next = { x: current.p.x + dx * step, y: from.y ?? 0, z: current.p.z + dz * step };
      if (next.x < bounds[0] + .32 || next.x > bounds[1] - .32 || next.z < bounds[2] + .32 || next.z > bounds[3] - .32 || !canOccupy(next, walls) || !clear(current.p, next)) continue;
      const score = current.g + Math.hypot(dx, dz) * step, id = key(next);
      if (score >= (costs.get(id) ?? Infinity)) continue;
      costs.set(id, score); parents.set(id, currentKey); points.set(id, next); open.push({ p: next, g: score, f: score + distance(next, to) });
    }
  }
  return null;
}

export function planJourney({ fromSceneId, toSceneId, fromPosition, toPosition, fromNavigation, toNavigation, routeKey } = {}) {
  if (!fromSceneId || !toSceneId || !fromPosition || !toPosition) return null;
  const oldNav = fromNavigation ?? getSceneNavigation(fromSceneId), nextNav = toNavigation ?? getSceneNavigation(toSceneId);
  const oldBounds = boundsArray(oldNav.bounds), nextBounds = boundsArray(nextNav.bounds);
  // A visit to the lake's original shore must leave along that shore, never
  // turn the presentation route into a walk across the authoritative water.
  const forward = fromSceneId === 'SC03' && fromPosition.z > -.95 ? 1 : -1;
  const fromSide = forward < 0 ? 'exit' : 'entry', toSide = forward < 0 ? 'entry' : 'exit';
  const fromGateway = { x: 0, y: 0, z: gatewayZ(fromSceneId, fromSide), side: fromSide, sceneId: fromSceneId };
  const toGateway = { x: 0, y: 0, z: gatewayZ(toSceneId, toSide), side: toSide, sceneId: toSceneId };
  const kind = fromSceneId === 'SC01' && toSceneId === 'SC02' ? 'boarding' : fromSceneId === 'SC02' && toSceneId === 'SC03' ? 'lakeside' : fromSceneId === 'SC03' && toSceneId === 'SC04' ? 'castle' : outdoor.has(fromSceneId) || outdoor.has(toSceneId) ? 'path' : 'cloister';
  const gap = kind === 'boarding' ? 7 : kind === 'lakeside' ? 9 : 8;
  const destinationOffset = { x: 0, y: 0, z: fromGateway.z + forward * gap - toGateway.z };
  const exitInside = { x: 0, y: fromPosition.y ?? 0, z: forward < 0 ? oldBounds[2] + .65 : oldBounds[3] - .65 };
  const entryInside = { x: 0, y: toPosition.y ?? 0, z: forward < 0 ? nextBounds[3] - .65 : nextBounds[2] + .65 };
  const oldPath = navigationPath(fromPosition, exitInside, oldNav), nextPath = navigationPath(entryInside, toPosition, nextNav);
  if (!oldPath || !nextPath) return null;
  const shift = p => ({ x: p.x, y: p.y, z: p.z + destinationOffset.z });
  const waypoints = [...oldPath, copy(fromGateway), { x: 0, y: 0, z: fromGateway.z + forward * gap / 2 }, shift(toGateway), ...nextPath.map(shift)];
  for (let i = waypoints.length - 1; i > 0; i--) if (distance(waypoints[i], waypoints[i - 1]) < .001) waypoints.splice(i, 1);
  const lengths = waypoints.slice(1).map((p, i) => distance(waypoints[i], p)), length = lengths.reduce((sum, n) => sum + n, 0);
  return { routeKey: routeKey ?? `${fromSceneId}:${toSceneId}`, fromSceneId, toSceneId, kind, fromGateway, toGateway, destinationOffset, waypoints, lengths, length, duration: Math.max(2.4, length / 3.8) };
}

function resources(name) {
  const root = new THREE.Group(); root.name = name; const geometries = new Set(), materials = new Set();
  const material = color => { const m = new THREE.MeshStandardMaterial({ color, roughness: .78 }); materials.add(m); return m; };
  const box = (w, h, d, mat, x, y, z) => { const g = new THREE.BoxGeometry(w, h, d); geometries.add(g); const mesh = new THREE.Mesh(g, mat); mesh.position.set(x, y, z); mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); return mesh; };
  let disposed = false;
  return { root, geometries, materials, material, box, dispose() { if (disposed) return; disposed = true; root.removeFromParent(); geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); root.clear(); } };
}

export function createJourneyTransition({ plan } = {}) {
  if (!plan) throw new Error('JOURNEY_PLAN_REQUIRED');
  const art = resources(`Journey:${plan.routeKey}`), { root, material, box } = art;
  const stone = material(0x8c9488), edge = material(0xbbb39d), wood = material(0x755a42), iron = material(0x3e514b), warm = material(0xeac38a);
  warm.emissive.setHex(0xe4ac60); warm.emissiveIntensity = .75;
  const destinationGateZ = plan.toGateway.z + plan.destinationOffset.z, end = Math.min(destinationGateZ, plan.fromGateway.z), start = Math.max(destinationGateZ, plan.fromGateway.z), length = start - end;
  const path = ['path', 'lakeside'].includes(plan.kind), floor = plan.kind === 'boarding' ? wood : stone;
  box(3.4, .18, length + .6, floor, 0, -.09, (start + end) / 2);
  for (let i = 0; i < Math.ceil(length / .62); i++) {
    const z = start - (i + .5) * length / Math.ceil(length / .62);
    if (!path) box(3.28, .025, .014, edge, 0, .013, z);
    for (const side of [-1, 1]) box(.12, .18, .60, edge, side * 1.63, .045, z);
  }
  for (const side of [-1, 1]) {
    box(.065, .065, length, iron, side * 1.55, .95, (start + end) / 2);
    box(.045, .045, length, iron, side * 1.55, .48, (start + end) / 2);
    for (let i = 0; i <= 4; i++) {
      const z = start - i * length / 4;
      box(.12, 1.05, .12, iron, side * 1.55, .525, z);
      if (i % 2 === 0) {
        box(.12, 2.7, .14, path ? wood : stone, side * 1.77, 1.35, z);
        box(.32, .45, .32, warm, side * 1.77, 2.53, z);
        box(.39, .10, .39, iron, side * 1.77, 2.82, z);
        for (const dx of [-.14, .14]) box(.025, .47, .33, iron, side * 1.77 + dx, 2.53, z);
      }
    }
  }
  if (!path) for (let i = 0; i <= 2; i++) {
    const z = start - i * length / 2;
    for (const side of [-1, 1]) box(.22, 3.4, .28, plan.kind === 'boarding' ? wood : stone, side * 1.78, 1.7, z);
    box(3.8, .23, .32, edge, 0, 3.5, z);
  }
  let elapsed = 0, disposed = false;
  function sample() {
    const progress = clamp(elapsed / plan.duration, 0, 1);
    // A gentle launch and stop preserve distance-driven workshop gait timing.
    const fraction = progress * progress * (3 - 2 * progress), at = fraction * plan.length;
    let walked = 0, index = 0;
    while (index < plan.lengths.length - 1 && walked + plan.lengths[index] < at) walked += plan.lengths[index++];
    const a = plan.waypoints[index], b = plan.waypoints[index + 1], t = clamp((at - walked) / Math.max(.001, plan.lengths[index]), 0, 1);
    return { position: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t }, yaw: Math.atan2(a.x - b.x, a.z - b.z), speed: progress >= 1 ? 0 : 6 * progress * (1 - progress) * plan.length / plan.duration, progress, complete: progress >= 1 };
  }
  return { root, plan, update(dt) { if (!disposed && Number.isFinite(dt)) elapsed = Math.min(plan.duration, elapsed + Math.max(0, dt)); return sample(); }, getState: sample, dispose() { disposed = true; art.dispose(); } };
}

// Remove only the central portion of walls crossed by the route, including
// individual instances. The other instances and original materials stay owned
// by their environment. Restoration is needed when a transition is cancelled.
export function configureGateway(area, side, { sceneId, width = 2.8, height = 3.15 } = {}) {
  const art = resources(`Gateway:${sceneId}:${side}`), z = gatewayZ(sceneId, side), saved = [];
  const inverse = new THREE.Matrix4(); area.updateMatrixWorld(true); inverse.copy(area.matrixWorld).invert();
  const matrix = new THREE.Matrix4(), world = new THREE.Matrix4(), box3 = new THREE.Box3();
  const objects = []; area.traverse(object => { if (object.isMesh && object.visible && !object.userData.dynamic && !object.userData.journeyGateway) objects.push(object); });
  for (const object of objects) {
    if ([].concat(object.material ?? []).some(m => m.transparent) || !object.geometry) continue;
    object.geometry.computeBoundingBox(); const geometryBox = object.geometry.boundingBox;
    for (let i = 0; i < (object.isInstancedMesh ? object.count : 1); i++) {
      if (object.isInstancedMesh) object.getMatrixAt(i, matrix); else matrix.identity();
      world.multiplyMatrices(inverse, object.matrixWorld).multiply(matrix); box3.copy(geometryBox).applyMatrix4(world);
      const lowDais = box3.min.y < .35 && box3.max.y > .16 && box3.max.y <= .6 && box3.max.x - box3.min.x > width && box3.max.z - box3.min.z <= 2.5;
      if (box3.max.x <= -width / 2 || box3.min.x >= width / 2 || box3.max.y <= .16 || box3.min.y >= height || box3.max.z < z - 1.4 || box3.min.z > z + 1.4 || (!lowDais && box3.max.z - box3.min.z > 1.15)) continue;
      if (object.isInstancedMesh) { saved.push({ object, index: i, matrix: matrix.clone() }); object.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0)); object.instanceMatrix.needsUpdate = true; }
      else { saved.push({ object, visible: object.visible }); object.visible = false; }
      const material = object.material, min = box3.min.clone(), max = box3.max.clone(), depth = Math.max(.035, max.z - min.z);
      const patch = (x0, x1, y0, y1) => { if (x1 - x0 <= .01 || y1 - y0 <= .01) return; art.box(x1 - x0, y1 - y0, depth, material, (x0 + x1) / 2, (y0 + y1) / 2, (min.z + max.z) / 2); };
      patch(min.x, Math.min(-width / 2, max.x), min.y, max.y); patch(Math.max(width / 2, min.x), max.x, min.y, max.y);
      patch(Math.max(min.x, -width / 2), Math.min(max.x, width / 2), Math.max(height, min.y), max.y);
    }
  }
  const frame = art.material(sceneId === 'SC02' ? 0x99714a : 0xb2ad98);
  for (const sideSign of [-1, 1]) art.box(.18, height, .38, frame, sideSign * (width / 2 + .09), height / 2, z);
  art.box(width + .54, .20, .43, frame, 0, height + .1, z);
  art.root.userData.journeyGateway = true; area.add(art.root); let disposed = false;
  return { root: art.root, changedCount: saved.length, dispose() { if (disposed) return; disposed = true; for (const item of saved) { if (item.index !== undefined) { item.object.setMatrixAt(item.index, item.matrix); item.object.instanceMatrix.needsUpdate = true; } else item.object.visible = item.visible; } art.dispose(); } };
}

export function createTrainScenery() {
  const art = resources('TrainWindowJourney'), tree = art.material(0x46644e), bark = art.material(0x6b624e), fence = art.material(0x9a9273);
  const moving = [];
  for (const side of [-1, 1]) for (let i = 0; i < 14; i++) {
    const z = -9.5 + i / 14 * 19, x = side * (5.4 + i % 3 * .8), h = 2 + i % 4 * .35;
    const trunk = art.box(.16, h, .18, bark, x, h / 2 - .25, z); moving.push({ mesh: trunk, z, speed: 5.6 });
    const g = new THREE.ConeGeometry(.8 + i % 3 * .15, h * .9, 7); art.geometries.add(g);
    const crown = new THREE.Mesh(g, tree); crown.position.set(x, h * .76, z); art.root.add(crown); moving.push({ mesh: crown, z, speed: 5.6 });
    const post = art.box(.09, .85, .11, fence, side * 4.3, .18, z); moving.push({ mesh: post, z, speed: 7.5 });
  }
  let time = 0, stopped = false;
  return { root: art.root, update(dt) { if (!stopped) time += Math.max(0, Number.isFinite(dt) ? dt : 0); for (const item of moving) item.mesh.position.z = -9.5 + ((item.z + 9.5 + time * item.speed) % 19); }, setStopped(value) { stopped = Boolean(value); }, dispose: art.dispose };
}
