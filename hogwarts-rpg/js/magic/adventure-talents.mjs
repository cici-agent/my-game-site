// After the first core boss each hero may equip one first-rank specialization at a safe point.
export const TALENTS = {
  harry: [
    { id: 'early-interrupt', name: '精准 · 抢先破招', description: '精准打断的最佳时机从敌人出手前 0.55 秒放宽到 0.65 秒。' },
    { id: 'pursuit', name: '追击 · 抓住破绽', description: '每次敌人失衡，你的第一发基础咒额外造成 4 点伤害。' }
  ],
  ron: [
    { id: 'long-feint', name: '牵制 · 引开追兵', description: '用佯攻牵制普通或精英敌人时，将它的下一次攻击再延后 0.5 秒。' },
    { id: 'steady-guard', name: '防守 · 稳住阵脚', description: '用引诱或佯攻抵挡下一击时，减伤从 50% 增至 65%。' }
  ],
  hermione: [
    { id: 'steady-lift', name: '控物 · 稳定悬浮', description: '施放基础漂浮咒时，巨怪的破绽再延长 0.5 秒。' },
    { id: 'efficient-control', name: '控物 · 节制施法', description: '强化控物消耗的专注从 35 降至 30。' }
  ],
  neville: [
    { id: 'potent-herbs', name: '草药 · 精选叶片', description: '每包草药四秒内可恢复 22 点生命，原为 20 点。' },
    { id: 'recovery', name: '救援 · 安心起身', description: '由你扶起的队友额外恢复 3 点生命。' }
  ],
  george: [
    { id: 'long-decoy', name: '诱导 · 余响', description: '响豆成功引开敌人后，它的下一次攻击再延后 0.5 秒。' },
    { id: 'refund-decoy', name: '连锁 · 掩护同伴', description: '用响豆成功引开正在袭击队友的敌人，返还 8 点专注。' }
  ]
};

export function validTalent(hero, talentId) {
  return Object.hasOwn(TALENTS, hero) && TALENTS[hero].some(talent => talent.id === talentId);
}
