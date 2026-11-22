// Metres, relative to an enemy's ground root. Static envelopes include a small
// animation margin; weapon tips and loose leaves do not enlarge the hurt volume.
// Shared by the authoritative engine and presentation, independent of Three.js.
export function creatureCollision(templateId) {
  if (templateId === 'B1-E07') return { collisionBase: 0, collisionHeight: 3.65 };
  if (templateId === 'B1-E15') return { collisionBase: 0, collisionHeight: 2.12 };
  if (templateId === 'PAPER-L1') return { collisionBase: 0, collisionHeight: .65 };
  if (templateId === 'BOX-L6') return { collisionBase: .6, collisionHeight: 1.1 };
  if (templateId.startsWith('BOX')) return { collisionBase: 0, collisionHeight: .85 };
  if (templateId.startsWith('BOOKS')) return { collisionBase: .75, collisionHeight: .90 };
  if (templateId.startsWith('VINE')) return { collisionBase: 0, collisionHeight: 1.65 };
  if (templateId.startsWith('ROOT')) return { collisionBase: 0, collisionHeight: 2.25 };
  return { collisionBase: 0, collisionHeight: 1.40 };
}
export const SPELL_MUZZLE_HEIGHT = 1.2;
