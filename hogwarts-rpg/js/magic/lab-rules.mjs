// An isolated, proposed balance model. Campaign saves and rewards are never read here.
export const STAT_LIMITS = {
  level: [1, 60], hp: [50, 5000], power: [1, 500], armor: [0, 2000], ward: [0, 2000],
  crit: [0, 60], haste: [0, 60], focus: [25, 500], regen: [0, 50]
};

const baseHero = { level: 1, hp: 320, power: 31, armor: 45, ward: 45, crit: 12, haste: 6, focus: 100, regen: 7 };
export const HERO_PRESETS = [
  { id: 'harry', name: '哈利·波特', role: '均衡决斗', description: '生命、咒力与两类防御均衡，适合作为对照基线。', color: '#cf665a', stats: { ...baseHero } },
  { id: 'ron', name: '罗恩·韦斯莱', role: '物理守护', description: '较高生命和物理防御，以施法速度换取近身承伤能力。', color: '#dc9c50', stats: { ...baseHero, hp: 380, power: 27, armor: 95, ward: 20, crit: 7, haste: 0, focus: 90, regen: 6 } },
  { id: 'hermione', name: '赫敏·格兰杰', role: '快速施法', description: '咒力、急速和专注较高，生命与物理防御较低。', color: '#b992dc', stats: { ...baseHero, hp: 270, power: 35, armor: 20, ward: 60, crit: 9, haste: 14, focus: 120, regen: 8 } },
  { id: 'neville', name: '纳威·隆巴顿', role: '魔法耐受', description: '较高生命、魔法防御和专注恢复，输出较为温和。', color: '#7eb594', stats: { ...baseHero, hp: 360, power: 27, armor: 40, ward: 85, crit: 6, haste: 4, focus: 110, regen: 9 } },
  { id: 'george', name: '乔治·韦斯莱', role: '暴击突袭', description: '暴击与急速较高，承伤能力较低，结果更受暴击影响。', color: '#e3ba66', stats: { ...baseHero, hp: 290, power: 32, armor: 25, ward: 35, crit: 22, haste: 10, focus: 100, regen: 7 } }
];

export const ENEMY_PRESETS = [
  { id: 'troll', name: '训练巨怪', description: '近身物理重击，用于比较物理防御。', stats: { level: 1, hp: 620, power: 48, armor: 80, ward: 0, interval: 2.3, windup: 0.8, type: 'physical', range: 3 } },
  { id: 'mage', name: '咒术训练偶', description: '远程魔法攻击，用于比较魔法防御。', stats: { level: 1, hp: 560, power: 44, armor: 20, ward: 35, interval: 2.1, windup: 0.8, type: 'magic', range: 12 } },
  { id: 'guardian', name: '混合盔甲守卫', description: '每击一半物理、一半魔法伤害，两类防御分别结算。', stats: { level: 1, hp: 720, power: 56, armor: 60, ward: 20, interval: 2.4, windup: 0.8, type: 'mixed', range: 3 } }
];

export const ACTIONS = {
  bolt: { id: 'bolt', name: '基础咒击', cost: 0, cooldown: 0, coefficient: 1, range: 12, description: '造成 100% 咒力的魔法伤害，不消耗专注。' },
  burst: { id: 'burst', name: '昏昏倒地', cost: 25, cooldown: 4, coefficient: 1.8, range: 12, description: '造成 180% 咒力的魔法伤害；本试炼暂不附带昏迷。' },
  shield: { id: 'shield', name: '盔甲护身', cost: 20, cooldown: 8, duration: 5, description: '吸收 90% 咒力 + 8% 最大生命的伤害，持续 5 秒。' },
  dodge: { id: 'dodge', name: '闪避', cost: 0, cooldown: 3, duration: 0.5, description: '闪避窗口 0.5 秒；可以通过走位离开近战攻击范围。' }
};

const finite = (value, fallback) => Number.isFinite(Number(value)) && value !== null && value !== '' ? Number(value) : fallback;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const round = value => Math.round(value * 1000) / 1000;
const STEP = 0.05;
const EPS = 1e-8;
const validPolicy = value => ['offense', 'balanced', 'evasion'].includes(value) ? value : 'balanced';

export function normalizeHero(stats = {}) {
  const result = {};
  for (const [key, [min, max]] of Object.entries(STAT_LIMITS)) result[key] = clamp(finite(stats?.[key], baseHero[key]), min, max);
  result.level = Math.round(result.level);
  return result;
}

export function normalizeEnemy(stats = {}) {
  const fallback = ENEMY_PRESETS[0].stats;
  const result = {};
  for (const [key, [min, max]] of Object.entries({ level: [1, 60], hp: [50, 10000], power: [1, 500], armor: [0, 2000], ward: [0, 2000], interval: [0.6, 8], range: [1.5, 15] })) {
    result[key] = clamp(finite(stats?.[key], fallback[key]), min, max);
  }
  result.level = Math.round(result.level);
  result.type = ['physical', 'magic', 'mixed'].includes(stats?.type) ? stats.type : fallback.type;
  if (stats?.range === undefined) result.range = result.type === 'magic' ? 12 : 3;
  result.windup = clamp(finite(stats?.windup, 0.8), 0.2, Math.min(2, result.interval * 0.8));
  return result;
}

export function reduction(defense, attackerLevel = 1) {
  const k = 100 + 10 * (clamp(finite(attackerLevel, 1), 1, 60) - 1);
  const value = Math.max(0, finite(defense, 0));
  return Math.min(0.7, value / (value + k));
}

export function deriveStats(stats, enemyLevel) {
  const hero = normalizeHero(stats);
  const attackerLevel = enemyLevel ?? hero.level;
  const physicalReduction = reduction(hero.armor, attackerLevel);
  const magicReduction = reduction(hero.ward, attackerLevel);
  return {
    ...hero, physicalReduction, magicReduction,
    effectivePhysicalHP: hero.hp / (1 - physicalReduction), effectiveMagicHP: hero.hp / (1 - magicReduction),
    globalCooldown: 0.8 / (1 + hero.haste / 100),
    shieldCapacity: hero.power * 0.9 + hero.hp * 0.08,
    expectedBolt: hero.power * (1 + hero.crit / 100 * 0.5),
    defenseConstant: 100 + 10 * (clamp(finite(attackerLevel, 1), 1, 60) - 1)
  };
}

function event(state, type, text, extras = {}) {
  state.events.push({ id: ++state.eventId, time: round(state.elapsed), type, text, ...extras });
  if (state.events.length > 100) state.events.shift();
}

function random(state) {
  state.randomState = (Math.imul(1664525, state.randomState) + 1013904223) >>> 0;
  return state.randomState / 4294967296;
}

export function createBattle(config = {}) {
  const preset = HERO_PRESETS.find(hero => hero.id === config.heroId) || HERO_PRESETS[0];
  const hero = normalizeHero(config.hero ?? preset.stats);
  const enemy = normalizeEnemy(config.enemy);
  const seed = Math.trunc(finite(config.seed, 2026)) >>> 0;
  const state = {
    status: 'active', heroId: preset.id, hero, enemy, derived: deriveStats(hero, enemy.level), seed, randomState: seed,
    mode: config.mode === 'auto' ? 'auto' : 'manual', policy: validPolicy(config.policy),
    elapsed: 0, maxTime: 120, accumulator: 0,
    hp: hero.hp, focus: hero.focus, shield: 0, shieldTime: 0, evadeTime: 0, enemyHp: enemy.hp,
    gcd: 0, cooldowns: { bolt: 0, burst: 0, shield: 0, dodge: 0 },
    enemyPhase: 'waiting', enemyWindup: 0, nextAttack: enemy.interval,
    events: [], eventId: 0,
    metrics: { damageDealt: 0, rawOutgoing: 0, enemyMitigated: 0, outgoingOverkill: 0, rawIncoming: 0, mitigated: 0, absorbed: 0, damageTaken: 0, incomingOverkill: 0, dodges: 0, rangeMisses: 0, hits: 0, crits: 0, incomingHits: 0, attacks: 0, casts: 0, focusSpent: 0, shieldCasts: 0, dodgeCasts: 0 }
  };
  event(state, 'start', '试炼开始');
  return state;
}

function finish(state, status) {
  if (state.status !== 'active') return;
  state.status = status;
  state.enemyPhase = 'waiting';
  state.enemyWindup = 0;
  event(state, 'finish', status === 'won' ? '击败目标' : status === 'lost' ? '角色倒下' : '达到 120 秒试炼上限');
}

export function actBattle(state, action, context = {}) {
  if (state.status !== 'active') return { ok: false, reason: '本次试炼已经结束' };
  if (!Object.hasOwn(ACTIONS, action)) return { ok: false, reason: '未知动作' };
  const skill = ACTIONS[action];
  const distance = Math.max(0, finite(context.distance, 2));
  if (state.cooldowns[action] > EPS) return { ok: false, reason: '技能还在冷却' };
  if (action !== 'dodge' && state.gcd > EPS) return { ok: false, reason: '正在收杖，请稍候' };
  if (state.focus + EPS < skill.cost) return { ok: false, reason: '专注不足' };
  if (skill.range && distance > skill.range) return { ok: false, reason: '目标超出咒语范围' };
  if (action === 'shield' && state.shield > EPS) return { ok: false, reason: '护盾仍然生效' };
  state.focus = Math.max(0, state.focus - skill.cost);
  state.metrics.focusSpent += skill.cost;
  state.metrics.casts++;
  state.cooldowns[action] = skill.cooldown;
  if (action !== 'dodge') state.gcd = state.derived.globalCooldown;
  if (action === 'bolt') state.cooldowns.bolt = state.derived.globalCooldown;
  if (action === 'shield') {
    state.shield = state.derived.shieldCapacity;
    state.shieldTime = skill.duration;
    state.metrics.shieldCasts++;
    event(state, 'shield', `盔甲护身：获得 ${Math.round(state.shield)} 护盾`, { action, amount: state.shield });
  } else if (action === 'dodge') {
    state.evadeTime = skill.duration;
    state.metrics.dodgeCasts++;
    event(state, 'dodge', '进入闪避窗口', { action, amount: 0 });
  } else {
    const crit = random(state) < state.hero.crit / 100;
    const raw = state.hero.power * skill.coefficient * (crit ? 1.5 : 1);
    const mitigated = raw * reduction(state.enemy.ward, state.hero.level);
    const net = raw - mitigated;
    const amount = Math.min(state.enemyHp, net);
    state.enemyHp = Math.max(0, state.enemyHp - amount);
    state.metrics.damageDealt += amount;
    state.metrics.rawOutgoing += raw;
    state.metrics.enemyMitigated += mitigated;
    state.metrics.outgoingOverkill += net - amount;
    state.metrics.hits++;
    if (crit) state.metrics.crits++;
    event(state, 'cast', `${skill.name}${crit ? ' 暴击' : ''}：${Math.round(amount)} 伤害`, { action, amount, raw, mitigated, crit, school: 'magic' });
    if (state.enemyHp <= EPS) finish(state, 'won');
  }
  return { ok: true, reason: '' };
}

function enemyAttack(state, distance) {
  state.metrics.attacks++;
  if (distance > state.enemy.range) {
    state.metrics.rangeMisses++;
    event(state, 'enemy-miss', '走位成功：离开攻击范围', { reason: 'range', amount: 0 });
    return;
  }
  if (state.evadeTime > EPS) {
    state.metrics.dodges++;
    event(state, 'enemy-miss', '闪避成功：避开本次攻击', { reason: 'dodge', amount: 0 });
    return;
  }
  const raw = state.enemy.power;
  const physicalShare = state.enemy.type === 'physical' ? 1 : state.enemy.type === 'mixed' ? 0.5 : 0;
  const mitigated = raw * (physicalShare * state.derived.physicalReduction + (1 - physicalShare) * state.derived.magicReduction);
  const absorbed = Math.min(state.shield, raw - mitigated);
  const net = Math.max(0, raw - mitigated - absorbed);
  const amount = Math.min(state.hp, net);
  state.shield = Math.max(0, state.shield - absorbed);
  state.hp = Math.max(0, state.hp - amount);
  state.metrics.rawIncoming += raw;
  state.metrics.mitigated += mitigated;
  state.metrics.absorbed += absorbed;
  state.metrics.damageTaken += amount;
  state.metrics.incomingOverkill += net - amount;
  state.metrics.incomingHits++;
  event(state, 'enemy-hit', `受到 ${Math.round(amount)} 伤害 · 防御减免 ${Math.round(mitigated)} · 护盾吸收 ${Math.round(absorbed)}`, { amount, raw, mitigated, absorbed, school: state.enemy.type });
  if (state.hp <= EPS) finish(state, 'lost');
}

function autoAction(state, policy, distance) {
  if (policy === 'evasion' && state.enemyPhase === 'windup' && state.enemyWindup <= 0.25 + EPS && state.enemyWindup > 0) actBattle(state, 'dodge', { distance });
  if (policy === 'balanced' && state.enemyPhase === 'windup' && state.shield <= EPS) {
    if (actBattle(state, 'shield', { distance }).ok) return;
  }
  if (!actBattle(state, 'burst', { distance }).ok) actBattle(state, 'bolt', { distance });
}

function tick(state, distance, auto, policy) {
  state.elapsed = round(state.elapsed + STEP);
  state.focus = Math.min(state.hero.focus, state.focus + state.hero.regen * STEP);
  state.gcd = Math.max(0, state.gcd - STEP);
  for (const action of Object.keys(state.cooldowns)) state.cooldowns[action] = Math.max(0, state.cooldowns[action] - STEP);
  state.evadeTime = Math.max(0, state.evadeTime - STEP);
  state.shieldTime = Math.max(0, state.shieldTime - STEP);
  if (state.shieldTime <= EPS && state.shield > 0) {
    state.shield = 0;
    event(state, 'shield-expired', '护盾持续时间结束', { amount: 0 });
  }
  state.nextAttack = Math.max(0, state.nextAttack - STEP);
  if (state.nextAttack <= state.enemy.windup + EPS && state.enemyPhase === 'waiting') {
    state.enemyPhase = 'windup';
    event(state, 'enemy-windup', '敌人正在蓄力', { amount: 0, school: state.enemy.type });
  }
  state.enemyWindup = state.enemyPhase === 'windup' ? state.nextAttack : 0;
  if (auto) autoAction(state, policy, distance);
  if (state.status !== 'active') return;
  if (state.nextAttack <= EPS) {
    enemyAttack(state, distance);
    state.enemyPhase = 'waiting';
    state.enemyWindup = 0;
    state.nextAttack = state.enemy.interval;
  }
  if (state.status === 'active' && state.elapsed + EPS >= state.maxTime) finish(state, 'timeout');
}

export function stepBattle(state, dt, context = {}) {
  if (state.status !== 'active') return state;
  const duration = Math.max(0, finite(dt, 0));
  const distance = Math.max(0, finite(context.distance, 2));
  const auto = context.auto ?? state.mode === 'auto';
  const policy = validPolicy(context.policy ?? state.policy);
  // Fixed ticks keep simulation results independent of rendering frame rate.
  state.accumulator += Math.min(duration, Math.max(0, state.maxTime - state.elapsed));
  while (state.accumulator + EPS >= STEP && state.status === 'active') {
    state.accumulator = Math.max(0, state.accumulator - STEP);
    tick(state, distance, auto, policy);
  }
  return state;
}

export function simulateBattle(config = {}) {
  const state = createBattle({ ...config, mode: 'auto' });
  while (state.status === 'active') stepBattle(state, STEP, { distance: 2, auto: true, policy: config.policy });
  return state;
}

export function summarizeBattle(state) {
  const metrics = Object.fromEntries(Object.entries(state.metrics).map(([key, value]) => [key, round(value)]));
  return {
    status: state.status, heroId: state.heroId, hero: { ...state.hero }, enemy: { ...state.enemy }, seed: state.seed,
    mode: state.mode, policy: state.policy, elapsed: round(state.elapsed), duration: round(state.elapsed),
    hp: round(state.hp), hpPercent: round(state.hp / state.hero.hp * 100), focus: round(state.focus), enemyHp: round(state.enemyHp),
    dps: state.elapsed > 0 ? round(state.metrics.damageDealt / state.elapsed) : 0,
    incomingDps: state.elapsed > 0 ? round(state.metrics.damageTaken / state.elapsed) : 0,
    mitigationPercent: state.metrics.rawIncoming > 0 ? round(state.metrics.mitigated / state.metrics.rawIncoming * 100) : 0,
    ...metrics, metrics
  };
}
