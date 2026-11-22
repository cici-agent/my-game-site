// Deterministic server geometry. Renderers consume the same arena description.
export const DEFAULT_ARENA = Object.freeze({
  bounds: Object.freeze({ minX: -14, maxX: 14, minZ: -14, maxZ: 14 }),
  obstacles: Object.freeze([-5, 5].flatMap(x => [-2, 2].map(z => Object.freeze({
    id: `pillar:${x}:${z}`, shape: 'circle', x, z, radius: .8, height: 3,
  })))),
});
export const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
export const position = p => ({ x: Number(p?.x ?? 0), y: Number(p?.y ?? 0), z: Number(p?.z ?? 0) });
export function direction(p = { x: 0, z: -1 }) {
  const length = Math.hypot(p.x, p.z);
  return length > 1e-8 ? { x: p.x / length, y: 0, z: p.z / length } : { x: 0, y: 0, z: -1 };
}
export function spellDirection(p = { x: 0, y: 0, z: -1 }) {
  const length = Math.hypot(p.x, p.y ?? 0, p.z);
  return length > 1e-8 ? { x: p.x / length, y: (p.y ?? 0) / length, z: p.z / length } : { x: 0, y: 0, z: -1 };
}
export function circleHit(a, b, circle, padding = 0) {
  const radius = circle.radius + padding;
  const dx = b.x - a.x, dz = b.z - a.z, ox = a.x - circle.x, oz = a.z - circle.z;
  const c = ox * ox + oz * oz - radius * radius;
  if (c <= 0) return 0;
  const aa = dx * dx + dz * dz;
  if (aa < 1e-12) return null;
  const bb = 2 * (ox * dx + oz * dz), discriminant = bb * bb - 4 * aa * c;
  if (discriminant < 0) return null;
  const t = (-bb - Math.sqrt(discriminant)) / (2 * aa);
  return t >= 0 && t <= 1 ? t : null;
}
export function boxHit(a, b, box, padding = 0) {
  let enter = 0, leave = 1;
  for (const [axis, low, high] of [['x', box.minX - padding, box.maxX + padding], ['z', box.minZ - padding, box.maxZ + padding]]) {
    const delta = b[axis] - a[axis];
    if (Math.abs(delta) < 1e-12) { if (a[axis] < low || a[axis] > high) return null; continue; }
    let first = (low - a[axis]) / delta, last = (high - a[axis]) / delta;
    if (first > last) [first, last] = [last, first];
    enter = Math.max(enter, first); leave = Math.min(leave, last);
    if (enter > leave) return null;
  }
  return enter >= 0 && enter <= 1 ? enter : null;
}
export function sweep(a, b, targets, obstacles, radius = 0) {
  const hits = [];
  for (const obstacle of obstacles ?? []) {
    const horizontal = obstacle.shape === 'box' ? boxHit : circleHit;
    const t = volumeHit(a, b, obstacle, radius, horizontal, obstacle.baseY ?? obstacle.y ?? 0, obstacle.height);
    if (t !== null) hits.push({ t, kind: 'wall', id: obstacle.id });
  }
  for (const target of targets ?? []) {
    const t = volumeHit(a, b, { ...target.position, radius: target.radius ?? .45 }, radius, circleHit, (target.position.y ?? 0) + (target.collisionBase ?? 0), target.collisionHeight);
    if (t !== null) hits.push({ t, kind: 'target', id: target.id });
  }
  hits.sort((x, y) => x.t - y.t || (x.kind === y.kind ? x.id.localeCompare(y.id) : x.kind === 'wall' ? -1 : 1));
  return hits[0] ?? null;
}
function volumeHit(a, b, shape, padding, horizontal, bottom, height) {
  const enter = horizontal(a, b, shape, padding);
  if (enter === null) return null;
  if (!Number.isFinite(height)) return enter; // Legacy ground navigation helpers.
  const reverse = horizontal(b, a, shape, padding);
  const leave = reverse === null ? 1 : 1 - reverse;
  const startY = a.y ?? 0, dy = (b.y ?? 0) - startY, low = bottom - padding, high = bottom + height + padding;
  if (Math.abs(dy) < 1e-10) return startY >= low && startY <= high ? enter : null;
  const first = (low - startY) / dy, last = (high - startY) / dy;
  const yEnter = Math.min(first, last), yLeave = Math.max(first, last);
  const hit = Math.max(0, enter, yEnter);
  return hit <= Math.min(1, leave, yLeave) + 1e-10 ? hit : null;
}
export function visible(a, b, arena) { return !sweep(a, b, [], arena.obstacles, 0); }
export function slideMovement(a, b, arena, radius = .28) {
  const bounds = arena.bounds;
  const clipped = { x: Math.max(bounds.minX + radius, Math.min(bounds.maxX - radius, b.x)), y: Math.max(0, Math.min(2, b.y ?? 0)), z: Math.max(bounds.minZ + radius, Math.min(bounds.maxZ - radius, b.z)) };
  const hit = sweep(a, clipped, [], arena.obstacles, radius);
  if (!hit) return clipped;
  const t = Math.max(0, hit.t - .001);
  return { x: a.x + (clipped.x - a.x) * t, y: clipped.y, z: a.z + (clipped.z - a.z) * t };
}

/** Small arena A* used only when direct navigation is blocked. The caller caches
 * its waypoints; dynamic players are not solid walls and cannot block a boss. */
export function findArenaPath(from, to, arena, radius = .28) {
  if (!sweep(from, to, [], arena.obstacles, radius)) return [position(to)];
  const { minX, maxX, minZ, maxZ } = arena.bounds;
  const key = p => `${p.x},${p.z}`;
  const legal = p => p.x > minX + radius && p.x < maxX - radius && p.z > minZ + radius && p.z < maxZ - radius && !sweep(p, p, [], arena.obstacles, radius);
  function nearest(p, requireDirect = true) {
    const center = { x: Math.round(p.x), y: 0, z: Math.round(p.z) };
    const candidates = [];
    for (let x = -2; x <= 2; x++) for (let z = -2; z <= 2; z++) {
      const q = { x: center.x + x, y: 0, z: center.z + z };
      if (legal(q) && (!requireDirect || !sweep(p, q, [], arena.obstacles, radius))) candidates.push(q);
    }
    candidates.sort((a, b) => distance(p, a) - distance(p, b));
    return candidates[0];
  }
  const start = nearest(from), goal = nearest(to, false); if (!start || !goal) return [];
  const open = [{ p: start, g: 0, f: distance(start, goal) }], scores = new Map([[key(start), 0]]), parents = new Map(), points = new Map([[key(start), start]]);
  let visits = 0;
  while (open.length && visits++ < 1800) {
    open.sort((a, b) => a.f - b.f || a.g - b.g);
    const current = open.shift(), currentKey = key(current.p);
    if (current.g > scores.get(currentKey)) continue;
    if (currentKey === key(goal)) {
      const path = sweep(goal, to, [], arena.obstacles, radius) ? [] : [position(to)]; let cursor = currentKey;
      while (cursor) { path.unshift(points.get(cursor)); cursor = parents.get(cursor); }
      return path;
    }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const next = { x: current.p.x + dx, y: 0, z: current.p.z + dz }, nextKey = key(next);
      if (!legal(next) || sweep(current.p, next, [], arena.obstacles, radius)) continue;
      const score = current.g + Math.hypot(dx, dz);
      if (score >= (scores.get(nextKey) ?? Infinity)) continue;
      scores.set(nextKey, score); parents.set(nextKey, currentKey); points.set(nextKey, next);
      open.push({ p: next, g: score, f: score + distance(next, goal) });
    }
  }
  return [];
}
