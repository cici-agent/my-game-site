const GUIDE = '韦斯莱夫人';
const HERO_NAMES = { harry: '哈利', ron: '罗恩', hermione: '赫敏' };

function platformStage(character, view) {
  if (!character || !view || character.chapterComplete || character.completedQuestIds?.includes('M01')) return null;
  const characterArea = character.areaId ?? character.visitSceneId ?? character.sceneId;
  const viewArea = view.areaId ?? view.sceneId;
  const questId = character.activity?.questId ?? character.currentQuestId;
  const index = character.activity?.objectiveIndex ?? character.objectiveIndex;
  if (characterArea !== 'SC01' || viewArea !== 'SC01' || questId !== 'M01' || view.quest?.id !== 'M01') return null;
  if (index !== 0 && index !== 1) return null;
  const id = `M01-${index + 1}`;
  return view.targets?.some(target => target.id === id && target.active && !target.completed) ? id : null;
}

// Describing the conversation does not start the escort or remember a dismissal.
// Until the player confirms, the same live interaction can open it again.
export function getPlatformIntro(character, view, action) {
  if (platformStage(character, view) !== 'M01-1'
    || view.escort?.targetId !== 'M01-1' || view.escort.awaitingStart !== true
    || action?.type !== 'interact' || action.targetId !== 'M01-1') return null;
  const isRon = character.heroId === 'ron';
  return {
    title: '寻找九又四分之三站台',
    npc: GUIDE,
    lines: [
      { speaker: HERO_NAMES[character.heroId] ?? character.name ?? '你', text: isRon
        ? '妈妈，我的车票上写着九又四分之三站台，可这里只有 9 号和 10 号站台。我们该怎么过去？'
        : '打扰一下，我的车票上写着九又四分之三站台，可我只找到了 9 号和 10 号站台。请问该怎么过去？' },
      { speaker: GUIDE, text: isRon
        ? '你第一次去霍格沃茨，当然还不熟悉。来，跟我走，我带你去入口。'
        : '第一次来，是不是？别担心，跟我走。我带你去找入口。' },
    ],
    confirmLabel: '跟随韦斯莱夫人',
  };
}

// previous/next are accepted { character, view } snapshots. A null previous
// snapshot also covers resuming a saved adventure already at the brick wall.
export function getPlatformWallAdvice(previous, next) {
  if (platformStage(next?.character, next?.view) !== 'M01-2') return null;
  const sameCharacter = previous?.character && previous.character.id === next.character.id;
  if (sameCharacter && platformStage(previous.character, previous.view) === 'M01-2') return null;
  if (sameCharacter && Number.isFinite(previous.view?.serverTime) && Number.isFinite(next.view?.serverTime)
    && next.view.serverTime < previous.view.serverTime) return null;
  return {
    npc: GUIDE,
    text: '入口就在 9 号和 10 号站台之间的这面砖墙。别害怕，勇敢地往前走，直接穿过去，就到九又四分之三站台了。',
  };
}
