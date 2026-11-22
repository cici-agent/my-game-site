import { PLAYER_RADIUS } from './movement.mjs';
import { moveWithCollisions, npcAppearanceId, sceneNpcTargets } from './client/scene-geometry.mjs';
import { trainPassengers } from './client/train-life.mjs';

// Both authority and renderer use the same cast. A main-story conversation may
// take ownership of a passenger's interaction, but never of their bench seat.
export function scenePeople(view, combat, occupiedHeroIds = []) {
  if (combat) return [];
  const cast = new Map((view?.ambientPeople ?? []).filter(person=>person?.name&&person.position).map(person=>[person.name,{...person,kind:'ambient'}]));
  for(const person of trainPassengers(view,occupiedHeroIds))cast.set(person.name,person);
  for (const person of sceneNpcTargets(view, combat, occupiedHeroIds)) {
    const resident = cast.get(person.name),passenger = resident?.kind==='passenger'?resident:null;
    cast.set(person.name, passenger ? { ...passenger, targetId: person.targetId, kind: person.kind } : person);
  }
  return [...cast.values()].map(person => {
    const appearanceId = person.appearanceId ?? npcAppearanceId(person.name);
    return { ...person, id: person.id ?? `npc:${appearanceId}:${person.name}`, appearanceId, position: { ...person.position } };
  });
}

// Cylinders are feet-relative; they are not scene walls or standing surfaces.
// Seated pupils fit their authored coach benches and Hagrid retains his size.
export function personBody({ id, appearanceId, position, seated = false, downed = false }) {
  const large = appearanceId === 'hagrid', base = Number.isFinite(position?.y) ? position.y : 0;
  return {
    id, x: position?.x ?? 0, z: position?.z ?? 0, minY: base,
    maxY: base + (downed ? .45 : seated ? large ? 2.0 : 1.25 : large ? 3.25 : 1.78),
    radius: large ? .62 : downed ? .42 : seated ? .35 : .34,
  };
}

const overlapHeight = (bottom, top, body) => Math.min(top, body.maxY) - Math.max(bottom, body.minY) > .025;

export function moveAmongPeople(from, to, bounds, walls, bodies, { radius = PLAYER_RADIUS, height = 1.65 } = {}) {
  const source = { x: from.x, y: from.y ?? 0, z: from.z }, destination = { x: to.x, y: to.y ?? source.y, z: to.z };
  if (![source.x, source.y, source.z, destination.x, destination.y, destination.z, radius, height].every(Number.isFinite)) return source;
  if (radius < 0 || height <= 0) return source;
  const people = (bodies ?? []).filter(body => body && [body.x, body.z, body.minY, body.maxY, body.radius].every(Number.isFinite) && body.radius > 0 && body.maxY > body.minY);
  if (!people.length) return moveWithCollisions(source, destination, bounds, walls, radius);
  const dx = destination.x - source.x, dy = destination.y - source.y, dz = destination.z - source.z;
  // A step is smaller than either body's radius even for sprint packets. This
  // gives the existing static escape-and-slide solver continuous body contact,
  // with no endpoint-only tunnel and no depenetration impulse adding speed.
  const spacing = Math.min(.08, Math.max(.005, radius || .08), ...people.map(body => Math.max(.005, body.radius)));
  const steps = Math.max(1, Math.ceil(Math.max(Math.hypot(dx, dz), Math.abs(dy)) / spacing));
  let result = source;
  for (let index = 1; index <= steps; index++) {
    const nextY = source.y + dy * index / steps;
    const target = { x: result.x + dx / steps, y: nextY, z: result.z + dz / steps };
    const fixed = moveWithCollisions(result, target, bounds, walls, radius);
    const floor = Math.min(result.y, nextY), ceiling = Math.max(result.y, nextY) + height;
    const contacts = people.filter(body => overlapHeight(floor, ceiling, body)).map(body => ({ shape: 'circle', x: body.x, z: body.z, radius: body.radius, height: Infinity }));
    result = moveWithCollisions(result, fixed, bounds, [...(walls ?? []), ...contacts], radius);
    // Vertical movement belongs to jump, stair and flight authority. Bodies
    // only constrain horizontal travel and can never lift somebody onto a head.
    result.y = nextY;
  }
  return result;
}
