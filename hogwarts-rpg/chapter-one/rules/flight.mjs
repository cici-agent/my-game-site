// Course permissions and permanent training permission share one authority rule.
// An already airborne character may still descend after a permission expires.
export function getFlightPermission(character, {
  questId = character.activity?.questId ?? character.currentQuestId,
  questSceneId,
  objectiveKind,
  inCombat = false,
} = {}) {
  if (inCombat || character.hp <= 0) return { allowed: false, canLand: false, maxHeight: 3 };
  const inStory = character.sceneId === questSceneId
    && (!character.visitSceneId || character.visitSceneId === questSceneId);
  const course = inStory && (questId === 'M06' || objectiveKind === 'flight' && questId !== 'M30');
  const room = character.dungeonRoom;
  const dungeon = inStory && questId === 'M30' && room?.roomId === 'M30'
    && room.status === 'active' && Boolean(room.flyingPlayers?.includes(character.id));
  const training = character.sceneId === 'SC09' && Boolean(character.skills?.includes('broom'));
  return {
    allowed: Boolean(course || dungeon || training),
    canLand: Boolean(character.flying && (character.position?.y ?? 0) > .04),
    maxHeight: 3,
  };
}
