import { contentData } from '../data/index.mjs';

const skills = new Map(contentData.skills.map(skill => [skill.id, skill]));
const potionItems = new Map(['health', 'focus'].map(type => [type, contentData.items.find(item => item.itemId === `ITEM-POTION-${type.toUpperCase()}`)]));
const signature = { harry: 'H1', ron: 'R1', hermione: 'M1', neville: 'N1', george: 'G1' };
const remaining = (deadline, now) => Number.isFinite(deadline) ? Math.max(0, deadline - now) : 0;
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = n => Math.max(0, Math.min(1, n));

export function actionBarSlots(heroId = 'harry') {
  return [['1', 'bolt'], ['2', 'levitate'], ['3', signature[heroId] ?? 'H1'], ['F', 'dodge'], ['4', 'mark'], ['5', 'rescue'], ['Q', 'potion-health'], ['R', 'potion-focus']].map(([key, skillId]) => ({ key, skillId }));
}

function definition(id) {
  if (id?.startsWith('potion-')) {
    const type = id.slice(7), item = potionItems.get(type); if (!item) return null;
    return { id, name: type === 'health' ? '生命药剂' : '专注药剂', role: 'all', focusCost: 0, castSeconds: item.effect.castSeconds, cooldownSeconds: item.effect.sharedCooldownSeconds, gcd: false, potionLimit: item.effect.sharedUsesPerEncounter };
  }
  return skills.get(id) ?? (id === 'interact' ? { id, name: '机关交互', castSeconds: 2, focusCost: 0, cooldownSeconds: 0, gcd: false, role: 'all' } : null);
}

function currentCast(character, self, now, pending) {
  const action = self?.action ?? character?.pendingWorldAction;
  if (action) {
    const skill = definition(action.skillId), startAt = finite(action.startAt, finite(character?.lastAction?.startedAt, action.releaseAt - (skill?.castSeconds ?? 0) * 1000));
    const releaseAt = finite(action.releaseAt), completeAt = finite(action.completeAt ?? action.channelEndAt, releaseAt);
    const phase = action.channelCommitted && now < completeAt ? 'channel' : now < releaseAt ? 'windup' : action.channel && now < completeAt ? 'channel' : null;
    if (phase) {
      const start = phase === 'channel' ? action.channelCommitted ? completeAt - 2000 : releaseAt : startAt, end = phase === 'channel' ? completeAt : releaseAt;
      return { skillId: action.skillId, name: skill?.name ?? '魔法', actionId: action.id ?? null, phase, startedAt: start, deadline: end, remainingMs: Math.max(0, end - now), durationMs: Math.max(1, end - start), progress: clamp((now - start) / Math.max(1, end - start)), authoritative: true };
    }
  }
  const confirmed = action?.id && action.id === pending?.clientActionId;
  if (!confirmed && pending && ['sending', 'retrying'].includes(pending.status)) return { skillId: pending.skillId, name: definition(pending.skillId)?.name ?? '魔法', actionId: pending.clientActionId ?? null, phase: pending.status === 'retrying' ? 'retrying' : 'waiting', startedAt: pending.startedAt, elapsedMs: Math.max(0, now - finite(pending.startedAt, now)), remainingMs: null, durationMs: null, progress: null, authoritative: false };
  return null;
}

/** A view of authority, never a local resource deduction or gameplay timer. */
export function abilityState({ skillId, character, combat = null, now = combat?.now ?? 0, pending = null, queuedSkillId = null } = {}) {
  now = finite(now, finite(combat?.now));
  const id = skillId, skill = definition(id), self = combat?.players?.[character?.id ?? character?.characterId];
  const potionType = id?.startsWith('potion-') ? id.slice(7) : null;
  const count = potionType ? Math.max(0, finite(self?.potions?.[potionType] ?? character?.potions?.[potionType])) : id === 'N1' && self ? self.herbCharges : null;
  const haste = finite(self?.stats?.haste ?? character?.stats?.haste), gcdMs = Math.max(.6, .8 / (1 + haste)) * 1000;
  const cooldownSeconds = skill?.cooldownSeconds ?? 0, cooldownRemainingMs = remaining(self?.cooldowns?.[id] ?? character?.cooldowns?.[id], now);
  const gcdRemainingMs = skill?.gcd ? remaining(self?.gcdUntil ?? character?.gcdUntil, now) : 0;
  const trialIds = character?.courseTrialSkillIds ?? (character?.currentQuestId === 'M04' && !character?.completedQuestIds?.includes('M04') ? ['bolt', 'dodge'] : []);
  const courseTrial = trialIds.includes(id), learned = Boolean(potionType || (self ? self.learnedSkillIds?.includes(id) : character?.skills?.includes(id)) || courseTrial);
  const cast = currentCast(character, self, now, pending), potionLimitReached = Boolean(potionType && self && self.potionUses >= skill?.potionLimit);
  const result = { id, name: skill?.name ?? '未知技能', enabled: true, status: 'ready', reason: courseTrial ? '本课程可试用，完成课程后按等级正式掌握' : '可以使用', remainingMs: 0, durationMs: 0, cooldownRemainingMs, cooldownDurationMs: cooldownSeconds * 1000, gcdRemainingMs, gcdMs, cast, count, focusCost: skill?.focusCost ?? 0, castSeconds: id === 'rescue' && character?.heroId === 'neville' ? 2 : skill?.castSeconds ?? 0, cooldownSeconds, courseTrial, queued: queuedSkillId === id, queueable: false, potionLimitReached };
  function block(status, reason, remainingMs = 0, durationMs = 0) {
    const queueable = ['cooldown', 'gcd'].includes(status) && Math.max(cooldownRemainingMs, gcdRemainingMs) <= 400 && (!cast || cast.authoritative && cast.remainingMs <= 400);
    return { ...result, enabled: false, status, reason, remainingMs, durationMs, queueable };
  }
  if (!character) return block('unavailable', '选择人物后可以使用');
  if (!skill) return block('unknown', '未知技能');
  if (skill.role !== 'all' && skill.role !== character.heroId) return block('wrong-role', '这是其他人物的专属魔法');
  if (!learned) return block('not-learned', `尚未学会 · 完成对应课程后掌握`);
  if (finite(self?.hp ?? character.hp, 1) <= 0) return block('downed', '已经倒地，等待同伴救援');
  if (combat && combat.status !== 'active') return block('encounter-ended', '挑战已结束，离开挑战后继续冒险');
  if (combat && !self) return block('not-participating', '你未参与这场挑战');
  if (combat?.catchupPending) return block('synchronizing', '正在同步战斗，请稍候');
  if (self?.rootedUntil > now && !['mark', 'light'].includes(id)) return block('controlled', '受到控制，暂时不能施法', self.rootedUntil - now, self.rootedUntil - now);
  if (potionType && count < 1) return block('no-stock', '背包中没有这种药剂，请在补给点补充');
  if (potionLimitReached) return block('potion-limit', '本场药剂次数已用完；两种药剂合计只能成功使用 1 次');
  if (id === 'N1' && self && count < 1) return block('no-charges', '本场草药包已用完');
  if (!self && !courseTrial && !['bolt', 'light', 'mark', 'broom', 'dodge'].includes(id)) return block('combat-only', potionType ? '药剂在战斗中使用；安全区域可到补给点恢复' : '需要战斗中的有效目标');
  if (self && id === 'broom') return block('combat-restricted', '战斗场地不能骑乘扫帚');
  if (finite(self?.focus ?? character.focus, Infinity) < result.focusCost) return block('no-focus', `专注不足，需要 ${result.focusCost} 点专注`);
  if (cast && ['waiting', 'retrying'].includes(cast.phase)) return block(cast.phase === 'retrying' ? 'retrying' : 'pending', cast.phase === 'retrying' ? '等待连接恢复后确认施法' : '等待服务器确认施法');
  if (cooldownRemainingMs > 0) return block('cooldown', `技能冷却中`, cooldownRemainingMs, cooldownSeconds * 1000);
  if (gcdRemainingMs > 0) return block('gcd', '公共调息中，稍后可继续施咒', gcdRemainingMs, gcdMs);
  if (cast && id !== 'dodge') return block('casting', cast.phase === 'channel' ? `正在引导${cast.name}` : `正在施放${cast.name}`, cast.remainingMs, cast.durationMs);
  return { ...result, status: courseTrial ? 'course-trial' : 'ready' };
}
