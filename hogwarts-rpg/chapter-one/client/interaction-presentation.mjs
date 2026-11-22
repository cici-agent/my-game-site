import { sweep } from '../combat/geometry.mjs';
import { targetingObstacles } from './targeting.mjs';

// A logical destination is not a world prop. Navigation lives in the journal,
// while nearby physical objects and people own their contextual interaction.
const navigation = new Set(['move', 'passage', 'escort', 'boat', 'exit', 'ending', 'sneak']);
const people = new Set(['talk', 'conversation', 'service', 'training', 'side']);
export function interactionPresentation(target) {
  const prop = target.presentation?.prop;
  const person = Boolean(target.npc) || people.has(target.kind);
  const route = navigation.has(target.kind);
  return { person, route, prop: prop ?? null, focusHeight: person ? 1.25 : route ? 1 : prop === 'toad' || prop === 'card' ? .18 : .6,
    contextual: !route && target.requiresInteraction !== false };
}

export function interactionVisibleFrom(position, target, walls = []) {
  const policy = interactionPresentation(target);
  // Openings and automatic arrival volumes may sit exactly on their boundary.
  if (policy.route) return true;
  const from = { ...position, y: (position.y ?? 0) + 1.25 };
  const to = { ...target.position, y: (target.position.y ?? 0) + policy.focusHeight };
  return !sweep(from, to, [], targetingObstacles(walls), .015);
}
