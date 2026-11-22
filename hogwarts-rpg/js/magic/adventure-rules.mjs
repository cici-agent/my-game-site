import { validTalent } from './adventure-talents.mjs';
import { SAGA } from './saga.mjs';

// These rules run on the server and can also be used by an isolated practice room.
const ability = (id, name, description, cost = 0, cooldown = 0) => ({ id, name, description, cost, cooldown });

export const HEROES = {
  harry: {
    id: 'harry', name: '哈利·波特', title: '决斗与打断', hp: 100, focus: 100,
    description: '看准敌人举杖的瞬间，替伙伴抢下先手。',
    active: ability('H1', '精准打断', '打断普通或精英敌人的准备动作，队友可以趁机追击。', 0, 6000),
    passive: ability('harry-instinct', '临危反应', '敌人出手前最后 0.55 秒精准打断，能让敌人多失衡一秒。')
  },
  ron: {
    id: 'ron', name: '罗恩·韦斯莱', title: '牵制与守护', hp: 110, focus: 90,
    description: '让敌人转向自己，给忙着施法或扶人的朋友争取时间。',
    active: ability('R1', '佯攻牵制', '使普通或精英敌人转向自己，延迟其攻击并减轻下一击。', 0, 8000),
    passive: ability('ron-guard', '护友本能', '替被盯上的队友吸引敌人时，牵制从 2 秒延长到 2.5 秒。')
  },
  hermione: {
    id: 'hermione', name: '赫敏·格兰杰', title: '控物与协同', hp: 90, focus: 110,
    description: '让悬空的物件多停留一会儿，帮助队友把握反击机会。',
    active: ability('M1', '强化控物', '将已经举起的木棒多维持两秒。', 35, 10000),
    passive: ability('hermione-control', '精准控物', '施放基础漂浮咒时，巨怪的破绽多保留一秒。')
  },
  neville: {
    id: 'neville', name: '纳威·隆巴顿', title: '草药与救援', hp: 105, focus: 95,
    description: '照料伤员，为受伤的队友备好草药包。',
    active: ability('N1', '草药包', '将草药包交给一名伤员，在四秒内恢复 20 生命。', 15, 14000),
    passive: ability('neville-herbs', '草药亲和', '使用草药救援，扶起队友只需 2 秒，通常为 2.5 秒。')
  },
  george: {
    id: 'george', name: '乔治·韦斯莱', title: '机关与诱导', hp: 95, focus: 105,
    description: '在敌人的路上布置响豆，把它从队友身边引开。',
    active: ability('G1', '响豆诱饵', '在敌人靠近时引开它，令普通或精英敌人的下一击落空。', 10, 12000),
    passive: ability('george-decoy', '机关巧思', '诱饵半径从 1.5 米扩大到 2 米，能更早截住逼近的敌人。')
  }
};

export const COURSES = {
  light: { ...ability('light', '荧光咒', '点亮杖尖，在暗处辨认敌人的目标。', 0, 1000), xp: 40 },
  levitate: { ...ability('levitate', '漂浮咒', '托起羽毛，或举起巨怪砸空后卡住的木棒。', 0, 2000), xp: 40 }
};
export const ENCOUNTER_REWARDS = {
  normal: { xp: 20, skillPoints: 0 }, elite: { xp: 40, skillPoints: 0 }, troll: { xp: 80, skillPoints: 1 },
  quirrell: {xp:150,skillPoints:1}, basilisk:{xp:225,skillPoints:2}, dementor:{xp:300,skillPoints:2},
  graveyard:{xp:375,skillPoints:2}, prophecy:{xp:450,skillPoints:2}, tower:{xp:525,skillPoints:3}, voldemort:{xp:600,skillPoints:4}
};

const enemies = {
  normal: { name: '走廊巡逻木偶', hp: 40, damage: 18, windup: 3800 },
  elite: { name: '失控的盔甲守卫', hp: 76, damage: 23, windup: 3400 },
  troll: { name: '万圣节巨怪', hp: 150, damage: 35, windup: 4200 },
  quirrell:{name:'厄里斯魔镜前的奇洛',hp:182,damage:28,windup:7200},
  basilisk:{name:'密室蛇怪',hp:248,damage:40,windup:7000},
  dementor:{name:'黑湖畔的摄魂怪群',hp:302,damage:33,windup:7200},
  graveyard:{name:'墓地追击者',hp:377,damage:48,windup:6400},
  prophecy:{name:'神秘事务司突袭队',hp:446,damage:41,windup:7100},
  tower:{name:'天文塔的封路火咒',hp:515,damage:55,windup:6800},
  voldemort:{name:'伏地魔',hp:720,damage:62,windup:6400}
};
const sagaBooks = new Map(SAGA.map(book => [book.kind,book]));
// Each successful action opens the next physical/casting opportunity. A sequence is repeated
// when the boss recovers. The final duel changes its sequence at the two health boundaries.
const encounters = {
  quirrell: [[
    {action:'light',cue:'用荧光咒照镜，分清奇洛和倒影。'},
    {action:'counter',relay:true,cue:'真身出现在镜中，对倒影施放镜中辨真。'}
  ]],
  basilisk: [[
    {action:'bait',cue:'引诱蛇怪朝破碎的反光镜扑来。'},
    {action:'dodge',cue:'离开蛇怪扑击的路线，露出镜框。'},
    {action:'counter',relay:true,cue:'用修复咒拼合镜面，让蛇怪看见倒影。'}
  ]],
  dementor: [[
    {action:'counter',cue:'释放第一道守护神，抵住寒雾。'},
    {action:'counter',relay:true,cue:'让第二道守护神回应第一道，驱散包围同伴的寒雾。'}
  ]],
  graveyard: [[
    {action:'bait',cue:'先引开看守奖杯的追兵。'},
    {action:'counter',relay:true,cue:'用飞来咒将门钥匙拉回到小队身边。'},
    {action:'dodge',cue:'门钥匙已经到手，闪开封锁退路的咒光。'}
  ]],
  prophecy: [[
    {action:'levitate',cue:'先施放漂浮咒，接住正从架上跌落的预言球。'},
    {action:'counter',relay:true,cue:'在球体落回架上前，用铁甲咒挡下追兵的齐射。'}
  ]],
  tower: [[
    {action:'counter',late:true,cue:'观察火浪收拢，在它爆发前的最后三秒施放咒立停。'},
    {action:'attack',cue:'符咒已松动，用点射击碎咒痕，打开火墙的缺口。'}
  ]],
  voldemort: [
    [{action:'bait',cue:'引走伏地魔的注意，让同伴获得对咒位置。'},{action:'counter',relay:true,cue:'用缴械咒击散第一层护盾。'}],
    [{action:'dodge',cue:'第二轮决斗，先闪过追踪小队的咒光。'},{action:'counter',late:true,cue:'等伏地魔再次举杖，在最后三秒用缴械咒对咒。'}],
    [{action:'light',cue:'最后一轮，先用荧光咒照出烟尘中的魔杖。'},{action:'counter',relay:true,late:true,cue:'看准最后三秒的杖尖闪光，用缴械咒解除最终护盾。'}]
  ]
};
const windupMessage = {
  normal: '木偶举起木杖。用基础咒点射，也可以闪避或打断它。',
  elite: '守卫正在蓄力。观察目标，掩护朋友或打断它。',
  troll: '巨怪高举木棒！一人引诱它砸空，另一人准备漂浮咒。'
};
const knownActions = new Set(['attack', 'dodge', 'bait', 'levitate', 'special', 'light', 'rescue', 'counter']);
function reject(message, status = 409) {
  throw Object.assign(new Error(message), { status });
}
function time(value) {
  if (!Number.isSafeInteger(value) || value < 0) reject('战斗时间无效。', 400);
  return value;
}

export function levelFromXp(xp, cap = 5) {
  return Math.min(Math.max(1, Math.trunc(cap)), 1 + Math.floor(Math.max(0, Number(xp) || 0) / 100));
}

export function createEncounter(kind, now = Date.now()) {
  if (!Object.hasOwn(enemies, kind)) reject('未知的遭遇。', 400);
  time(now);
  const enemy = enemies[kind];
  return {
    kind, status: 'active', started: false, createdAt: now, updatedAt: now, finishedAt: null,
    enemy: { name: sagaBooks.get(kind)?.boss ?? enemy.name, hp: enemy.hp, maxHp: enemy.hp },
    phase: 'windup', phaseUntil: 0, openedAt: null, opener: null, target: null,
    decoyUntil: 0, players: {}, message: '等待伙伴集合。第一次行动后开始交战。',
    ...(sagaBooks.has(kind) ? {mechanic:{band:0,step:0,actor:null,at:0}} : {})
  };
}

const seats = [0, 1, 2, 3];
function restoreSeats(players) {
  const occupied = new Set();
  const unseated = [];
  for (const player of Object.values(players)) {
    if (seats.includes(player.seat) && !occupied.has(player.seat)) occupied.add(player.seat);
    else unseated.push(player);
  }
  for (const player of unseated) {
    player.seat = seats.find(seat => !occupied.has(seat));
    occupied.add(player.seat);
  }
}

export function joinEncounter(current, member, now = Date.now()) {
  const id = member?.id;
  if (typeof id !== 'string' || !id || id.length > 128 || id in Object.prototype) reject('玩家身份无效。', 400);
  const state = advanceEncounter(current, now);
  if (Object.hasOwn(state.players, id)) return state;
  if (state.status !== 'active') reject('这次挑战已经结束，请另开副本。');
  const hero = member.hero ?? member.heroId;
  if (!Object.hasOwn(HEROES, hero)) reject('请选择一名学生。', 400);
  const members = Object.values(state.players);
  if (members.length >= 4) reject('队伍已满。');
  if (members.some(player => player.hero === hero)) reject('这名学生已被队友选中。');
  // Mentoring an earlier chapter uses that book's ceiling only for this instance.
  const levelCap = (sagaBooks.get(state.kind)?.book ?? 1) * 5;
  const level = Math.max(1, Math.min(levelCap, Math.trunc(Number(member.level) || 1)));
  const rank = stat => Math.max(0,Math.min(levelCap,Math.trunc(Number(member.growth?.[stat]) || 0)));
  const maxHp = HEROES[hero].hp + (level - 1) * 2 + 6 * rank('vitality');
  const maxFocus = HEROES[hero].focus + 5 * rank('focus');
  state.players[id] = {
    id, name: typeof member.name === 'string' ? member.name.slice(0, 48) : HEROES[hero].name,
    hero, level, seat: seats.find(seat => !members.some(player => player.seat === seat)),
    talent: validTalent(hero, member.talent) ? member.talent : null,
    skills: Array.isArray(member.skills) ? [...new Set(member.skills.filter(s => typeof s === 'string'))] : [],
    hp: maxHp, maxHp, focus: maxFocus, maxFocus,
    nextActionAt: 0, cooldowns: {}, focusAt: state.updatedAt, evadeUntil: 0, guardUntil: 0,
    lightUntil: 0, healTicks: 0, healAt: 0, rescuing: null, rescueAt: 0, contribution: 0
  };
  state.target ??= id;
  return state;
}

// A deliberate exit releases the seat. A lost connection never calls this function.
export function leaveEncounter(current, id, now = Date.now()) {
  const state = advanceEncounter(current, now);
  if (state.status !== 'active' || !Object.hasOwn(state.players, id)) return state;
  const departing = state.players[id];
  delete state.players[id];
  if (!living(state).length) {
    finish(state, 'lost', state.updatedAt);
    state.message = '这次挑战已经关闭，可以重新组织副本。';
    return state;
  }
  for (const player of Object.values(state.players)) {
    if (player.rescuing === id) player.rescuing = null;
  }
  if (state.opener === id) state.opener = null;
  if (state.target === id) {
    if (state.started && state.phase === 'windup') windup(state, state.updatedAt);
    else state.target = living(state)[0].id;
  }
  state.message = departing.name + '离开了这次挑战。';
  return state;
}

function living(state) { return Object.values(state.players).filter(player => player.hp > 0); }

export function getSagaCue(state) {
  if (!state?.mechanic || state.status !== 'active' || state.phase === 'vulnerable') return null;
  return encounters[state.kind][state.mechanic.band]?.[state.mechanic.step] ?? null;
}

export function getSagaCombatHint(state, playerId, now = Date.now()) {
  if (!state?.mechanic || state.status !== 'active') return '';
  const remaining = Math.max(0, (state.phaseUntil - now) / 1000);
  const clock = state.started ? '　' + remaining.toFixed(1) + ' 秒' : '';
  const band = state.kind === 'voldemort' ? '决斗 ' + (state.mechanic.band+1) + '/3 · ' : '';
  if (state.phase === 'vulnerable') return band + '屏障已解除！全队集中点射。' + clock;
  const cue = getSagaCue(state);
  if (!cue) return '';
  let advice = cue.cue;
  if (cue.relay && playerId === state.mechanic.actor && now - state.mechanic.at < 1800) {
    advice += ' 队友可立即接手，独自作战稍等片刻。';
  }
  if (!state.started) advice = '集合后开战。' + advice;
  return band + advice + clock;
}

function windup(state, now) {
  const alive = living(state);
  const previous = alive.findIndex(player => player.id === state.target);
  state.target = alive.length ? alive[(previous + 1) % alive.length].id : null;
  state.phase = 'windup';
  state.phaseUntil = now + enemies[state.kind].windup;
  state.opener = null;
  state.openedAt = null;
  if (state.mechanic) {
    Object.assign(state.mechanic,{step:0,actor:null,at:now});
    state.message = getSagaCue(state).cue;
  } else state.message = windupMessage[state.kind];
}
function opening(state, id, now) {
  state.phase = 'opening';
  state.phaseUntil = now + 5200;
  state.openedAt = now;
  state.opener = id;
  state.message = '木棒砸空，卡在地板里了！伙伴现在可以施放漂浮咒。';
}
function vulnerable(state, duration, now) {
  state.phase = 'vulnerable';
  state.phaseUntil = now + duration;
  state.vulnerableAt = now;
}
function finish(state, status, now) {
  state.status = status;
  state.finishedAt = now;
  state.phaseUntil = 0;
  state.message = status === 'won' ? '挑战成功！每位有贡献的伙伴都记录本次胜利。' : '队友都倒下了。回到前室，重新组织一次挑战。';
}
function refreshPlayer(player, now) {
  const ticks = Math.floor((now - player.focusAt) / 1000);
  if (ticks > 0) {
    player.focus = Math.min(player.maxFocus, player.focus + 8 * ticks);
    player.focusAt += ticks * 1000;
  }
  if (player.healTicks && player.hp > 0 && player.healAt <= now) {
    const count = Math.min(player.healTicks, 1 + Math.floor((now - player.healAt) / 1000));
    player.healTicks -= count;
    player.healAt += count * 1000;
    const finalBonus = player.healTicks === 0 ? (player.healBonus || 0) : 0;
    player.hp = Math.min(player.maxHp, player.hp + 5 * count + finalBonus);
  }
}
function finishRescues(state, now) {
  for (const player of living(state)) {
    if (!player.rescuing || player.rescueAt > now) continue;
    const friend = state.players[player.rescuing];
    if (friend?.hp === 0) {
      friend.hp = Math.min(friend.maxHp, Math.ceil(friend.maxHp * 0.35) + (player.talent === 'recovery' ? 3 : 0));
      friend.evadeUntil = player.rescueAt + 1800;
      player.contribution++;
      state.message = player.name + '扶起了' + friend.name + '。';
    }
    player.rescuing = null;
  }
}
function missedOpening(state, now) {
  const opener = state.players[state.opener];
  if (opener?.hp > 0) opener.hp = Math.max(0, opener.hp - 15);
  if (!living(state).length) return finish(state, 'lost', now);
  windup(state, now);
  state.message = '巨怪扯出了木棒，引怪者受到反击。下次趁木棒卡住时用漂浮咒！';
}
function strike(state, due, now) {
  const target = state.players[state.target] ?? living(state)[0];
  if (!target) return;
  if (target.evadeUntil >= due || state.decoyUntil >= due) {
    if (state.kind === 'troll') {
      opening(state, target.id, now);
    } else {
      const inventor = state.decoyUntil >= due ? state.players[state.decoyOwner] : null;
      windup(state, now);
      if (inventor?.talent === 'long-decoy') state.phaseUntil += 500;
      if (inventor?.talent === 'refund-decoy' && target.id !== inventor.id) {
        inventor.focus = Math.min(inventor.maxFocus, inventor.focus + 8);
      }
      state.message = '敌人打空了，重新开始蓄力。';
    }
    if (target.evadeUntil >= due) target.contribution++;
    return;
  }
  const guardedMultiplier = target.talent === 'steady-guard' ? 0.35 : 0.5;
  const amount = Math.ceil(enemies[state.kind].damage * (target.guardUntil >= due ? guardedMultiplier : 1));
  target.hp = Math.max(0, target.hp - amount);
  target.rescuing = null;
  target.healTicks = target.hp ? target.healTicks : 0;
  if (!living(state).length) return finish(state, 'lost', now);
  windup(state, now);
  state.message = target.name + '受到 ' + amount + ' 点伤害。' + windupMessage[state.kind];
}

function sagaTimeout(state, due, now) {
  const target = state.players[state.target] ?? living(state)[0];
  if (!target) return finish(state,'lost',now);
  const escaped = target.evadeUntil >= due;
  const guard = target.guardUntil >= due ? (target.talent==='steady-guard' ? .35 : .5) : 1;
  const damage = escaped ? 0 : Math.ceil(enemies[state.kind].damage * guard);
  target.hp = Math.max(0,target.hp-damage);
  if (damage) {
    target.rescuing = null;
    if (!target.hp) target.healTicks = 0;
  }
  if (state.kind==='dementor') {
    for (const ally of living(state)) ally.focus = Math.max(0,ally.focus-12);
  }
  if (state.kind==='prophecy' && state.mechanic.step>0) {
    state.enemy.hp = Math.min(state.enemy.maxHp,state.enemy.hp+18);
  }
  if (!living(state).length) return finish(state,'lost',now);
  windup(state,now);
  state.message = escaped ? target.name+'闪过了攻击。'+state.message : target.name+'受到 '+damage+' 点伤害。'+state.message;
}

// A long pause produces at most one enemy strike when the room wakes up.
export function advanceEncounter(current, timestamp = Date.now()) {
  const now = Math.max(time(timestamp), current.updatedAt);
  const state = structuredClone(current);
  restoreSeats(state.players);
  if (state.status !== 'active') return state;
  state.updatedAt = now;
  if (!state.started) return state;
  if (state.phaseUntil && state.phaseUntil <= now) {
    const due = state.phaseUntil;
    for (const player of Object.values(state.players)) refreshPlayer(player, due);
    finishRescues(state, due - 1);
    if (state.mechanic && state.phase !== 'vulnerable') sagaTimeout(state,due,now);
    else if (state.phase === 'windup') strike(state, due, now);
    else if (state.phase === 'opening') missedOpening(state, now);
    else windup(state, now);
  }
  if (state.status !== 'active') return state;
  for (const player of Object.values(state.players)) refreshPlayer(player, now);
  finishRescues(state, now);
  return state;
}

function hasCourse(player, id) {
  const alias = id === 'levitate' ? ['S02', '漂浮咒'] : ['S01', '荧光咒'];
  return player.skills.some(skill => skill === id || alias.includes(skill));
}
function assertReady(player, id, now) {
  if (player.cooldowns[id] > now) reject('招式尚在冷却，请观察敌人的动作。');
}
function useAbility(player, skill, now, cost = skill.cost) {
  assertReady(player, skill.id, now);
  if (player.focus < cost) reject('专注不足。基础攻击、闪避和漂浮咒无需专注。');
  player.cooldowns[skill.id] = now + skill.cooldown;
  player.focus -= cost;
  if (cost) player.focusAt = now + 2000;
}
function injuredFriend(state, requested) {
  if (requested) {
    const target = state.players[requested];
    return target?.hp > 0 && target.hp < target.maxHp ? target : null;
  }
  return living(state).filter(x => x.hp < x.maxHp).sort((a, b) => a.hp/a.maxHp - b.hp/b.maxHp)[0];
}
function special(state, player, targetId, now) {
  const skill = HEROES[player.hero].active;
  if (!player.skills.includes('special') && !player.skills.includes(skill.id)) reject('先完成这名角色的专招训练。');
  useAbility(player, skill, now, skill.cost - (player.talent === 'efficient-control' ? 5 : 0));
  switch (player.hero) {
    case 'harry': {
      if (state.mechanic) {
        if (state.phase === 'vulnerable') reject('敌人已经露出破绽，可以点射。');
        state.phaseUntil += 1250;
        state.message = '打断干扰，队伍多争取了片刻施法时间。';
        break;
      }
      if (state.kind === 'troll' || state.phase !== 'windup') reject('这个动作无法打断。巨怪重砸可以引诱或闪避。');
      const precise = state.phaseUntil - now <= (player.talent === 'early-interrupt' ? 650 : 550);
      vulnerable(state, precise ? 3500 : 2500, now);
      state.message = precise ? '精准打断！敌人失衡更久。' : '施法被打断，快追击！';
      break;
    }
    case 'ron': {
      if (state.kind === 'troll' || state.phase !== 'windup') reject('这时无法牵制。可以用引怪动作让巨怪砸空。');
      const duration = state.target !== player.id ? 2500 : 2000;
      state.target = player.id;
      state.phaseUntil += duration + (player.talent === 'long-feint' ? 500 : 0);
      player.guardUntil = state.phaseUntil;
      state.message = '罗恩引开敌人，敌人的下一击将由他掩护。';
      break;
    }
    case 'hermione':
      if (state.kind === 'troll' && state.phase !== 'vulnerable') reject('先用漂浮咒举起卡住的木棒，再延长控物。');
      if ((state.kind !== 'troll' && !state.mechanic) || state.phase !== 'vulnerable') reject('等敌人露出破绽，再用强化控物稳住局面。');
      state.phaseUntil += 2000;
      state.message = state.mechanic ? '赫敏稳住局面，破绽延长两秒。' : '赫敏稳住了木棒，破绽延长两秒。';
      break;
    case 'neville': {
      const friend = injuredFriend(state, targetId);
      if (!friend) reject('附近没有需要草药包的伤员。');
      friend.healTicks = 4;
      friend.healAt = now + 1000;
      friend.healBonus = player.talent === 'potent-herbs' ? 2 : 0;
      state.message = friend.name + '接住草药包，生命将逐步恢复。';
      break;
    }
    case 'george': {
      if (state.kind === 'troll' || state.phase !== 'windup') reject('巨怪或失衡的敌人不会追逐响豆。');
      // The enemy covers one metre per second on its last approach.
      if (state.phaseUntil - now > 2000) reject('再等等，敌人还没有进入两米诱饵范围。');
      state.decoyUntil = state.phaseUntil;
      state.decoyOwner = player.id;
      if (state.mechanic) {
        const target=state.players[state.target];
        if (target) target.evadeUntil=state.phaseUntil;
      }
      state.message = '响豆在敌人脚边炸响，下一击将落空。';
      break;
    }
  }
  player.contribution++;
}

function resolveSagaCue(state, player, action, now) {
  const cue = getSagaCue(state);
  if (!cue || cue.action !== action) {
    if (action === 'counter') reject(cue?.cue || '屏障已解除，现在可以集中点射。');
    return false;
  }
  if (cue.late && state.phaseUntil-now>3000) reject('施法过早。'+cue.cue);
  if (cue.relay && state.mechanic.actor===player.id && now-state.mechanic.at<1800) {
    reject('你还在收束上一招，队友可以接力；单人稍等片刻再施法。');
  }
  if (action==='counter') {
    const spell = sagaBooks.get(state.kind).spell;
    if (!player.skills.includes(spell.id)) reject('请先完成本卷课程，学会'+spell.name+'。');
    useAbility(player,{id:spell.id,cooldown:850,cost:12},now);
  } else if (action==='light' || action==='levitate') {
    if (!hasCourse(player,action)) reject('请先完成相应的魔咒课程。');
    useAbility(player,COURSES[action],now);
    if (action==='light') player.lightUntil=now+5500;
  } else if (action==='bait') {
    state.target=player.id;
    player.guardUntil=state.phaseUntil;
  } else if (action==='dodge') {
    player.evadeUntil=now+1600;
  }
  player.contribution++;
  Object.assign(state.mechanic,{step:state.mechanic.step+1,actor:player.id,at:now});
  if (getSagaCue(state)) {
    state.phase='opening';
    state.phaseUntil=now+6200;
    state.message=getSagaCue(state).cue;
  } else {
    vulnerable(state,4600,now);
    state.message=player.name+'解除了屏障！全队可以集中点射。';
  }
  return true;
}

function applyAction(state, player, action, targetId, now) {
  if (state.mechanic && resolveSagaCue(state,player,action,now)) return;
  switch (action) {
    case 'attack': {
      if (state.mechanic && state.phase !== 'vulnerable') {
        state.message='咒光被屏障挡住了。'+getSagaCue(state).cue;
        return;
      }
      const base = 11 + 2 * (player.level - 1);
      let damage = state.phase === 'vulnerable' ? base * 2 : state.kind === 'troll' ? 2 : base;
      if (state.phase === 'vulnerable' && player.talent === 'pursuit' && player.lastPursuitAt !== state.vulnerableAt) {
        damage += 4;
        player.lastPursuitAt = state.vulnerableAt;
      }
      const band = state.kind === 'voldemort' ? state.mechanic.band : 2;
      const floor = Math.floor(state.enemy.maxHp*(2-band)/3);
      const before = state.enemy.hp;
      state.enemy.hp = Math.max(floor, before-damage);
      player.contribution++;
      state.message = player.name + '的基础咒命中，造成 ' + (before-state.enemy.hp) + ' 点伤害。';
      if (state.enemy.hp === 0) finish(state, 'won', now);
      else if (state.enemy.hp === floor && state.kind === 'voldemort') {
        state.mechanic.band++;
        windup(state,now);
      }
      break;
    }
    case 'bait':
      if (state.phase !== 'windup') reject('等敌人再次举起武器时引开它。');
      if (state.kind === 'troll') {
        opening(state, player.id, now);
      } else {
        state.target = player.id;
        player.guardUntil = state.phaseUntil;
        state.message = '敌人转向了' + player.name + '。';
      }
      player.contribution++;
      break;
    case 'dodge':
      player.evadeUntil = now + 1600;
      state.message = player.name + '侧身闪避。';
      break;
    case 'levitate':
      if (!hasCourse(player, 'levitate')) reject('请先完成漂浮咒课程。');
      if (state.kind !== 'troll' || state.phase !== 'opening') reject('等巨怪砸空，木棒卡进地板时施放。');
      if (state.opener === player.id && now < state.phaseUntil - 1600) reject('刚引过巨怪，正在稳住脚步。伙伴可以立刻举棒；单人可在最后 1.6 秒施放。');
      useAbility(player, COURSES.levitate, now);
      const duration = player.hero === 'hermione' ? 4000 : 3000;
      vulnerable(state, duration + (player.talent === 'steady-lift' ? 500 : 0), now);
      state.message = '木棒悬起！巨怪失去平衡，集中攻击。';
      player.contribution++;
      break;
    case 'light':
      if (!hasCourse(player, 'light')) reject('请先学习荧光咒。');
      useAbility(player, COURSES.light, now);
      player.lightUntil = now + 5500;
      state.message = '杖尖照亮了' + state.enemy.name + '，它正盯着' + (state.players[state.target]?.name || '前方') + '。';
      break;
    case 'rescue': {
      const target = targetId ? state.players[targetId] : Object.values(state.players).find(x => x.hp === 0);
      if (!target || target.hp !== 0) reject('附近没有倒下的队友。');
      player.rescuing = target.id;
      player.rescueAt = now + (player.hero === 'neville' ? 2000 : 2500);
      player.nextActionAt = player.rescueAt;
      state.message = player.name + '正在扶起' + target.name + '，请队友掩护。';
      break;
    }
    case 'special':
      special(state, player, targetId, now);
      break;
    case 'counter':
      reject('本卷应对咒仅用于对应的核心副本。');
      break;
  }
}

export function actEncounter(current, id, action, timestamp = Date.now()) {
  const type = typeof action === 'string' ? action : action?.type;
  if (!knownActions.has(type)) reject('未知的战斗动作。', 400);
  const state = advanceEncounter(current, timestamp);
  const now = state.updatedAt;
  if (state.status !== 'active') reject('这次挑战已经结束。');
  if (!Object.hasOwn(state.players, id)) reject('请先进入这个副本。', 403);
  const player = state.players[id];
  if (player.hp <= 0) reject('你已倒下，等待伙伴救援。');
  if (player.nextActionAt > now) reject('正在收招，请稍后再试。');
  if (!state.started) {
    state.started = true;
    windup(state, now);
    state.target = player.id;
    if (getSagaCue(state)?.late && type === getSagaCue(state).action) return state;
  }
  player.nextActionAt = now + 750;
  applyAction(state, player, type, typeof action === 'object' ? action.target : undefined, now);
  return state;
}
