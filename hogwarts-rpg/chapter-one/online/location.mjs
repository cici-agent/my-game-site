import { resolveAreaId, getWorldArea, areaFloor } from '../world-atlas.mjs';
import { moveWithCollisions, standingFloor, canOccupy } from '../client/scene-geometry.mjs';

export const locationEpoch = character => Number.isSafeInteger(character.locationEpoch) && character.locationEpoch >= 0 ? character.locationEpoch : 0;
export const currentArea = character => getWorldArea(resolveAreaId(character));
export const locationSnapshot = character => ({ areaId: resolveAreaId(character), sceneId: currentArea(character).sceneId, position: { ...character.position }, locationEpoch: locationEpoch(character) });

export function locationProblem(character, packet, { allowLegacy = true } = {}) {
  const areaId = packet.areaId ?? packet.fromAreaId;
  if (areaId === undefined && packet.locationEpoch === undefined) {
    if (allowLegacy && locationEpoch(character) === 0) return null;
    return { code: 'CLIENT_UPDATE_REQUIRED', message: '区域已更新，请刷新游戏后继续；你的角色进度已经保留。' };
  }
  if (areaId !== resolveAreaId(character) || !Number.isSafeInteger(packet.locationEpoch) || packet.locationEpoch !== locationEpoch(character)) {
    return { code: 'LOCATION_CHANGED', message: '你已进入另一区域，正在同步当前位置，请重新尝试。' };
  }
  return null;
}

// Pin the old save's inferred room before a quest change can alter its fallback.
// Valid legacy positions and all progression fields remain untouched.
export function pinLocation(character) {
  const area = currentArea(character);
  character.areaId = area.id; character.sceneId = area.sceneId;
  character.locationEpoch = locationEpoch(character);
  return area;
}

export function groundHeight(character, point, walls = currentArea(character).navigation.walls) {
  return Math.max(areaFloor(resolveAreaId(character), point), standingFloor(point, point.y ?? 0, walls));
}

export function replayAreaMovement(character, points, navigation, { airborne = false } = {}) {
  let result = { ...character.position }, previous = { ...result };
  for (const point of points) {
    const oldFloor = groundHeight(character, result, navigation.walls);
    const moved = moveWithCollisions(result, { x: result.x + point.x - previous.x, y: result.y, z: result.z + point.z - previous.z }, navigation.bounds, navigation.walls);
    const nextFloor = groundHeight(character, moved, navigation.walls), proposedY = result.y + point.y - previous.y;
    moved.y = Math.max(nextFloor, proposedY);
    // Walk down stairs with the surface; a voluntary jump/flying arc remains free.
    if (!airborne && result.y <= oldFloor + .04 && point.y <= groundHeight(character, point, navigation.walls) + .04) moved.y = nextFloor;
    previous = point; result = moved;
  }
  return result;
}

export function arrivalIsValid(area, position) {
  if (!position || !['x', 'y', 'z'].every(key => Number.isFinite(position[key]))) return false;
  const [minX, maxX, minZ, maxZ] = area.navigation.bounds;
  return position.x >= minX && position.x <= maxX && position.z >= minZ && position.z <= maxZ
    && Math.abs(position.y - areaFloor(area.id, position)) <= .20 && canOccupy(position, area.navigation.walls);
}

export function relocateCharacter(character, areaId, position, now, { checkpoint = false } = {}) {
  const area = getWorldArea(areaId);
  character.areaId = area.id; character.sceneId = area.sceneId; character.visitSceneId = null;
  character.position = { x: position.x, y: position.y ?? 0, z: position.z, yaw: position.yaw ?? 0 };
  character.locationEpoch = locationEpoch(character) + 1;
  character.lastMoveAt = now; character.moveAllowance = .12; character.jumpMotion = null; character.flying = false;
  character.hold = null; character.pendingWorldAction = null; character.pendingObservation = null; character.escort = null;
  if (checkpoint) character.checkpoint = { areaId: area.id, position: { ...character.position } };
}
