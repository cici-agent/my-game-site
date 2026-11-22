import { PLAYER_RADIUS, MAX_STEP_HEIGHT } from '../movement.mjs';
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));
export function boundsArray(bounds) {
  if (Array.isArray(bounds)) return bounds;
  return [bounds?.minX ?? -10, bounds?.maxX ?? 10, bounds?.minZ ?? -14, bounds?.maxZ ?? 12];
}
// Signed horizontal distance also describes an old save slightly embedded in furniture.
function footprintDistance(point, wall) {
  if (wall.shape === 'circle') return Math.hypot(point.x - wall.x, point.z - wall.z) - wall.radius;
  const minX = wall.minX ?? wall.x - wall.w / 2, maxX = wall.maxX ?? wall.x + wall.w / 2;
  const minZ = wall.minZ ?? wall.z - wall.d / 2, maxZ = wall.maxZ ?? wall.z + wall.d / 2;
  const dx = Math.max(minX - point.x, 0, point.x - maxX), dz = Math.max(minZ - point.z, 0, point.z - maxZ);
  return dx || dz ? Math.hypot(dx, dz) : -Math.min(point.x - minX, maxX - point.x, point.z - minZ, maxZ - point.z);
}
function penetration(point, wall, radius) {
  return (point.y ?? 0) >= (wall.height ?? wall.h ?? 8) - .04 ? 0 : Math.max(0, radius - footprintDistance(point, wall));
}
export function canOccupy(point, walls = [], radius = PLAYER_RADIUS) {
  return !walls.some(wall => penetration(point, wall, radius) > 1e-9);
}
function canAdvance(from, to, walls, radius) {
  let escaping = false;
  for (const wall of walls) {
    const before = penetration(from, wall, radius), after = penetration(to, wall, radius);
    if (after > 1e-9 && (before <= 1e-9 || after > before + 1e-9)) return false;
    if (after < before - 1e-9) escaping = true;
  }
  return escaping || canOccupy(to, walls, radius);
}
export function moveWithCollisions(from, to, bounds, walls = [], radius = PLAYER_RADIUS) {
  const [minX, maxX, minZ, maxZ] = boundsArray(bounds);
  const target = { x: clamp(to.x, minX + radius, maxX - radius), y: to.y ?? from.y ?? 0, z: clamp(to.z, minZ + radius, maxZ - radius) };
  const result = { x: from.x, y: target.y, z: from.z };
  const distance = Math.hypot(target.x - from.x, target.z - from.z), steps = Math.max(1, Math.ceil(distance / .12));
  const dx = (target.x - from.x) / steps, dz = (target.z - from.z) / steps;
  for (let i = 0; i < steps; i++) {
    if (canAdvance(result, { ...result, x: result.x + dx }, walls, radius)) result.x += dx;
    if (canAdvance(result, { ...result, z: result.z + dz }, walls, radius)) result.z += dz;
  }
  return result;
}
export function standingFloor(point, previousY, walls = [], radius = PLAYER_RADIUS) {
  let height = 0;
  for (const wall of walls) {
    const top = wall.height ?? wall.h;
    if (wall.water || !Number.isFinite(top) || top > MAX_STEP_HEIGHT || previousY < top - .04) continue;
    if (footprintDistance(point, wall) < radius) height = Math.max(height, top);
  }
  return height;
}
export function replayMovement(from, points, bounds, walls = [], radius = PLAYER_RADIUS) {
  let result = { x: from.x, y: from.y ?? 0, z: from.z }, previous = { ...result };
  for (const point of points) {
    // Match the renderer: horizontal collision first at the existing elevation,
    // then vertical movement/landing. Corrections do not become user input.
    const target = { x: result.x + point.x - previous.x, y: result.y, z: result.z + point.z - previous.z };
    const moved = moveWithCollisions(result, target, bounds, walls, radius);
    const proposedY = result.y + point.y - previous.y;
    moved.y = Math.max(standingFloor(moved, result.y, walls, radius), proposedY, 0);
    previous = point; result = moved;
  }
  return result;
}
export function cameraCollisionFraction(from, to, walls = []) {
  let fraction = 1;
  for (const wall of walls) {
    if (wall.water) continue;
    const halfX = wall.shape === 'circle' ? wall.radius : wall.w / 2;
    const halfZ = wall.shape === 'circle' ? wall.radius : wall.d / 2;
    let enter = 0, leave = 1;
    for (const [axis, low, high] of [['x', wall.x - halfX - .18, wall.x + halfX + .18], ['y', -.2, (wall.height ?? wall.h ?? 8) + .18], ['z', wall.z - halfZ - .18, wall.z + halfZ + .18]]) {
      const delta = to[axis] - from[axis];
      if (Math.abs(delta) < 1e-6) { if (from[axis] < low || from[axis] > high) { enter = 2; break; } }
      else { let a = (low - from[axis]) / delta, b = (high - from[axis]) / delta; if (a > b) [a, b] = [b, a]; enter = Math.max(enter, a); leave = Math.min(leave, b); }
    }
    if (enter <= leave && leave >= 0 && enter <= 1) fraction = Math.min(fraction, Math.max(.08, enter - .025));
  }
  return fraction;
}
export function telegraphDescriptor(attack) {
  if (!attack) return null;
  const origin = attack.origin ?? { x: 0, z: 0 }, direction = attack.direction ?? { x: 0, z: -1 };
  if (attack.shape === 'circle') return { shape: 'circle', x: attack.aim?.x ?? origin.x, z: attack.aim?.z ?? origin.z, radius: attack.radius ?? 1.3, yaw: 0 };
  const range = attack.range ?? 4, yaw = Math.atan2(direction.x, direction.z);
  if (attack.shape === 'line') return { shape: 'line', x: origin.x + direction.x * range / 2, z: origin.z + direction.z * range / 2, width: (attack.radius ?? .24) * 2, length: range, yaw };
  return { shape: 'cone', x: origin.x, z: origin.z, radius: range, arc: 1.6, yaw };
}
export function telegraphDescriptors(attack) {
  if (!attack) return [];
  if (attack.shape === 'circle' && attack.areas?.length) return attack.areas.map(aim => telegraphDescriptor({ ...attack, aim }));
  return [telegraphDescriptor(attack)];
}
export function sceneNpcTargets(view, combat) {
  if (combat) return [];
  const result = new Map();
  for (const target of view?.targets ?? []) {
    if (!target.active || target.completed || !target.npc || !['service', 'side'].includes(target.kind)) continue;
    result.set(target.npc, { name: target.npc, position: target.position, targetId: target.id, kind: target.kind });
  }
  const training = view?.targets?.find(t => t.active && t.kind === 'training'), teacher = view?.commissions?.[0]?.initiator?.name;
  if (training && teacher) result.set(teacher, { name: teacher, position: training.position, targetId: training.id, kind: 'training' });
  const talk = (view?.targets ?? []).find(t => t.active && !t.completed && ['talk', 'escort', 'boat'].includes(t.kind));
  const namedSpeaker = talk?.label?.match(/^([^：:]{1,24})[：:]/)?.[1];
  const knownSpeaker = namedSpeaker?.match(/韦斯莱夫人|麦格教授|弗立维教授|邓布利多(?:教授)?|斯内普(?:教授)?|斯普劳特(?:教授)?|庞弗雷夫人|海格|费伦泽|赫敏|纳威/)?.[0];
  const guide = view?.escort, name = guide?.npc ?? talk?.npc ?? knownSpeaker ?? (talk ? view?.quest?.npc?.split(/[、，,\/|]/)[0].trim() : null);
  if (name && (guide?.position || talk?.position)) result.set(name, { name, position: guide?.position ?? talk.position, targetId: guide?.targetId ?? talk.id, kind: guide?.kind ?? talk.kind, seated: guide?.kind === 'boat' && guide.progress > 0 && guide.progress < 1 });
  return [...result.values()];
}
export function visibleTargets(view, combat) {
  if (combat?.status === 'active') return (combat.mechanismTargets ?? []).filter(target => !target.complete).map(target => ({
    id: target.id, label: target.name, kind: 'mechanism', position: target.position, radius: target.range ?? 2,
    active: Boolean(target.enabled), completed: false, actionType: 'skill', skillId: target.id === 'club' ? 'levitate' : 'interact',
  }));
  if (combat && ['won', 'lost'].includes(combat.status)) return [{ id: 'return-checkpoint', label: combat.status === 'won' ? '离开挑战，继续冒险' : '回到检查点，重新练习', kind: 'exit', position: { x: 0, y: 0, z: 6 }, radius: 2, active: true, actionType: 'retry' }];
  const targets = (view?.targets ?? []).filter(target => target.active && !target.completed).map(target => view.escort?.targetId === target.id ? { ...target, position: view.escort.position, label: view.escort.progress > 0 ? `${view.escort.waitingForPlayer ? view.escort.npc + '停下等你' : '跟上' + view.escort.npc} · ${target.kind === 'boat' ? '渡湖中' : '同行中'}` : `与${view.escort.npc}会合 · ${target.kind === 'boat' ? '准备登船' : '开始带路'}` } : target);
  // The server's target list owns exit eligibility; exitTarget also describes
  // locked travel UI, so it must not create an early clickable world entrance.
  return [...new Map(targets.map(target => [target.id, target])).values()];
}

export function correctionPlan(local, server, previousServer, stalledSnapshots = 0, options = {}) {
  const { acknowledgedSequence: ack, previousAcknowledgedSequence: previousAck, acknowledgedPosition: sent, rejectedMovement = false } = options;
  let base = null;
  if (rejectedMovement && sent) base = sent;
  else if (Number.isSafeInteger(ack) && (!Number.isSafeInteger(previousAck) || ack > previousAck) && sent) base = sent;
  else if (Number.isSafeInteger(ack) && ack === previousAck && previousServer) base = previousServer;
  // Polls with unknown/old acknowledgement cannot distinguish delay from rejection.
  if (!base) return { mode: 'none', target: { ...local }, delta: { x: 0, y: 0, z: 0 }, stalledSnapshots: 0 };
  const delta = { x: server.x - base.x, y: (server.y ?? 0) - (base.y ?? 0), z: server.z - base.z };
  const error = Math.hypot(delta.x, delta.y, delta.z);
  return { mode: error > 2.5 ? 'snap' : error > .015 ? 'smooth' : 'none',
    target: { ...local, x: local.x + delta.x, y: (local.y ?? 0) + delta.y, z: local.z + delta.z }, delta, stalledSnapshots: 0 };
}

export function chaseCameraPose(position, yaw, pitch, distance) {
  const direction = { x: -Math.sin(yaw) * Math.cos(pitch), y: -Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
  const focus = { x: position.x, y: (position.y ?? 0) + 1.38, z: position.z };
  return { focus, direction, eye: {
    x: focus.x - direction.x * distance + Math.cos(yaw) * .62,
    y: Math.max((position.y ?? 0) + .35, focus.y - direction.y * distance),
    z: focus.z - direction.z * distance - Math.sin(yaw) * .62,
  } };
}

export function visiblePartyMembers(room, character, combat, now) {
  const selfId = character?.id ?? character?.characterId;
  const members = Array.isArray(room?.members) ? room.members : Object.values(room?.members ?? {});
  return members.map(member => member.character ?? member).filter(member => {
    const id = member.id ?? member.characterId;
    if (!id || id === selfId) return false;
    if (combat) return Boolean(combat.players?.[id]);
    if (member.sceneId && member.sceneId !== character?.sceneId) return false;
    return !Number.isFinite(member.lastSeenAt) || now - member.lastSeenAt <= 30000;
  });
}

export function nameplateWidth(cameraDistance, verticalFov, aspect, maximumWidth = 1.25, screenFraction = .14) {
  return Math.min(maximumWidth, Math.max(0, cameraDistance) * 2 * Math.tan(verticalFov * Math.PI / 360) * aspect * screenFraction);
}
