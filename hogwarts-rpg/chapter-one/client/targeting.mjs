import { sweep, spellDirection } from '../combat/geometry.mjs';
import { SPELL_MUZZLE_HEIGHT } from '../combat/collision-profiles.mjs';

export function targetCenter(target) {
  const p = target.position;
  return { x: p.x, y: (p.y ?? 0) + (target.collisionBase ?? 0) + (target.collisionHeight ?? 1.7) * .52, z: p.z };
}
export function aimFromPlayer(position, aimPoint) {
  return spellDirection({ x: aimPoint.x - position.x, y: (aimPoint.y ?? 0) - (position.y ?? 0) - SPELL_MUZZLE_HEIGHT, z: aimPoint.z - position.z });
}
export function targetingObstacles(walls = []) {
  return walls.filter(w => !w.water).map((w, i) => w.shape === 'circle' ? { ...w, id: w.id ?? `wall-${i}` } : {
    ...w, id: w.id ?? `wall-${i}`, shape: 'box', height: w.height ?? w.h ?? 8,
    minX: w.minX ?? w.x - w.w / 2, maxX: w.maxX ?? w.x + w.w / 2,
    minZ: w.minZ ?? w.z - w.d / 2, maxZ: w.maxZ ?? w.z + w.d / 2,
  });
}
export function isAimEligible(target, { purpose = 'hostile', now } = {}) {
  if (!target || !Number.isFinite(target.hp)) return false;
  if (purpose === 'rescue') return target.hp <= 0 && !target.rescued && !(Number.isFinite(now) && Number.isFinite(target.downedUntil) && target.downedUntil <= now);
  if (purpose === 'hostile' || purpose === 'heal') return target.hp > 0;
  throw new Error(`UNKNOWN_AIM_PURPOSE:${purpose}`);
}
/** Same finite hit volumes and wall ordering used by the authoritative spells. */
export function pickAimTarget(origin, end, targets, obstacles = [], options = {}) {
  const hit = sweep(origin, end, targets.filter(t => isAimEligible(t, options)), obstacles, .06);
  return hit?.kind === 'target' ? targets.find(t => t.id === hit.id) : null;
}
export function targetAvailability(position, target, range = 12, obstacles = [], options = {}) {
  if (!isAimEligible(target, options)) return { status: 'none', distance: 0 };
  const point = targetCenter(target), distance = Math.hypot(point.x - position.x, point.z - position.z);
  const chest = { ...position, y: (position.y ?? 0) + SPELL_MUZZLE_HEIGHT };
  if (distance > range) return { status: 'far', distance, point };
  if (sweep(chest, point, [], obstacles, .08)) return { status: 'blocked', distance, point };
  return { status: 'ready', distance, point };
}
export function cycleAimTarget(targets, currentId, position, obstacles = [], range = 20, options = {}) {
  const candidates = targets.filter(t => t.onScreen !== false && targetAvailability(position, t, range, obstacles, options).status === 'ready');
  candidates.sort((a, b) => (a.screenDistance ?? 0) - (b.screenDistance ?? 0) || a.id.localeCompare(b.id));
  if (!candidates.length) return null;
  return candidates[(candidates.findIndex(t => t.id === currentId) + 1) % candidates.length];
}
