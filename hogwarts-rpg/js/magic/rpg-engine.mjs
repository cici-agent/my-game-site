import { ITEMS } from './rpg-catalog.mjs';
import { SCENES } from './rpg-story.mjs';

const starterItems = ['letter', 'ticket', 'wand'];
const ownership = new Map(ITEMS.map(item => [item.id, item.ownership]));
const add = (list, id) => { if (!list.includes(id)) list.push(id); };

export function createCampaign() {
  return {
    version: 1, revision: 0, members: {}, teamItems: [], lessons: [],
    supplies: [], sceneIndex: 0, stepIndex: 0, finished: false, history: []
  };
}

export function joinCampaign(current, memberId, displayName) {
  const name = typeof displayName === 'string' ? displayName.trim() : '';
  if (!name || [...name].length > 20) throw new Error('请使用 1 至 20 个字的名字。');
  if (typeof memberId !== 'string' || !/^[\w-]{1,80}$/.test(memberId) || memberId in Object.prototype) throw new Error('角色标记无效。');
  if (Object.hasOwn(current.members, memberId)) return current;
  if (Object.keys(current.members).length >= 4) throw new Error('这支队伍的四个位置已经坐满。');
  const campaign = structuredClone(current);
  campaign.members[memberId] = {
    name, items: [...new Set([...starterItems, ...campaign.supplies])], skills: [...campaign.lessons], bonds: {}
  };
  campaign.revision++;
  return campaign;
}

export function activeStep(campaign) {
  if (!campaign || campaign.finished) return null;
  return SCENES[campaign.sceneIndex]?.steps[campaign.stepIndex] ?? null;
}

export function requirement(campaign, memberId, node) {
  const member = campaign.members[memberId];
  if (!member) return 'member';
  if (node.requiresSkill && !member.skills.includes(node.requiresSkill)) return node.requiresSkill;
  if (node.requiresItem && !member.items.includes(node.requiresItem) && !campaign.teamItems.includes(node.requiresItem)) return node.requiresItem;
  if (node.requiresBond && !(member.bonds[node.requiresBond] > 0)) return node.requiresBond;
  return null;
}

function reward(campaign, memberId, node, shared) {
  const member = campaign.members[memberId];
  const recipients = shared ? Object.values(campaign.members) : [member];
  if (node.skill) {
    for (const person of recipients) add(person.skills, node.skill);
    if (shared) add(campaign.lessons, node.skill);
  }
  if (node.grantItem) {
    if (!ownership.has(node.grantItem)) throw new Error('道具记录缺失。');
    if (ownership.get(node.grantItem) === '队伍') add(campaign.teamItems, node.grantItem);
    else {
      for (const person of recipients) add(person.items, node.grantItem);
      if (shared) add(campaign.supplies, node.grantItem);
    }
  }
  if (node.bond) member.bonds[node.bond] = (member.bonds[node.bond] ?? 0) + 1;
}

function awardPracticeRibbon(campaign, entry) {
  if (SCENES[entry.sceneIndex].id !== 'team-puzzle' || entry.stepIndex !== 1) return;
  // Only completed actions enter history. A friend's failed attempt cannot count as their turn.
  const first = campaign.history.at(-1);
  if (first?.sceneIndex !== entry.sceneIndex || first.stepIndex !== 0 || first.memberId === entry.memberId) return;
  if (!campaign.teamItems.includes('bell-ribbon')) {
    campaign.teamItems.push('bell-ribbon');
    entry.teamReward = 'bell-ribbon';
  }
}

export function advanceCampaign(current, memberId, expectedRevision, choiceIndex) {
  if (!Object.hasOwn(current.members, memberId)) throw new Error('请先加入这支队伍。');
  if (current.revision !== expectedRevision) throw new Error('队友已经翻过这一页，请查看最新进度。');
  const step = activeStep(current);
  if (!step) throw new Error('这一卷已经完成。');
  const choice = Number.isInteger(choiceIndex) ? step.choices[choiceIndex] : null;
  if (!choice) throw new Error('请选择当前场景中的行动。');
  if (requirement(current, memberId, step) || requirement(current, memberId, choice)) throw new Error('尚未满足这项行动的条件。');
  const campaign = structuredClone(current);
  const entry = { sceneIndex: current.sceneIndex, stepIndex: current.stepIndex, memberId, choiceIndex, retry: !!choice.retry };
  if (!choice.retry) {
    reward(campaign, memberId, step, true);
    reward(campaign, memberId, choice, false);
    awardPracticeRibbon(campaign, entry);
    campaign.stepIndex++;
    if (campaign.stepIndex === SCENES[campaign.sceneIndex].steps.length) {
      campaign.stepIndex = 0;
      campaign.sceneIndex++;
      campaign.finished = campaign.sceneIndex === SCENES.length;
    }
    campaign.history.push(entry);
  }
  campaign.lastAction = entry;
  campaign.revision++;
  return campaign;
}
