// World distances are metres; clients and authority use the same locomotion.
export const WALK_SPEED = 2.2;
export const RUN_SPEED = 4.3;
export const FLIGHT_SPEED = 5;
export const PLAYER_RADIUS = .30;
export const JUMP_SPEED = 6.2;
export const GRAVITY = 15.4;
export const MAX_STEP_HEIGHT = 1.2;
export const JUMP_APEX = JUMP_SPEED * JUMP_SPEED / (2 * GRAVITY);
export const MAX_MOVE_STEPS = 96;
export const MAX_MOVE_CREDIT_SECONDS = 2;

/** Relative, collision-resolved frame steps preserve a route around corners.
 * The endpoint remains a prediction acknowledgement, never a speed authority. */
export function movementPath(from, endpoint, steps) {
  let points;
  if (steps === undefined) points = [{ x: endpoint.x, y: endpoint.y ?? 0, z: endpoint.z }];
  else {
    if (!Array.isArray(steps) || steps.length > MAX_MOVE_STEPS || steps.some(s => !s || !['dx', 'dy', 'dz'].every(k => Number.isFinite(s[k])))) {
      const error = new Error('INVALID_MOVEMENT_STEPS'); error.code = 'INVALID_MOVEMENT_STEPS'; throw error;
    }
    let cursor = { x: from.x, y: from.y ?? 0, z: from.z };
    points = steps.map(s => (cursor = { x: cursor.x + s.dx, y: cursor.y + s.dy, z: cursor.z + s.dz }));
  }
  let previous = from, travel = 0, ascent = 0;
  for (const point of points) {
    travel += Math.hypot(point.x - previous.x, point.z - previous.z);
    ascent += Math.max(0, point.y - (previous.y ?? 0)); previous = point;
  }
  return { points, travel, ascent };
}
