// 关系和背包一起保存在同一份家园存档里。
const SEEDS = ['seed_radish', 'seed_lettuce', 'seed_carrot'];

export function visitMayor({ state, bag, chest, day, gift, takeGift = key => bag.take(key, 1), random = Math.random }) {
  let accepted = false;
  if (gift) {
    if (state.giftDay === day) return { message: '今天已经收过你的心意啦，留些好东西给自己。' };
    if (!takeGift(gift)) return { message: '咦，这件礼物好像没带在身上。' };
    state.giftDay = day;
    accepted = true;
    state.points += 2;
  } else if (state.chatDay !== day) {
    state.chatDay = day;
    state.points++;
  }

  if (!state.pending && state.points >= 3 && state.rollDay !== day) {
    state.rollDay = day;
    if (random() < 0.4) state.pending = SEEDS[Math.floor(random() * SEEDS.length)];
  }
  if (state.pending) {
    const seed = state.pending;
    const destination = bag.add(seed, 2) ? '背包' : chest.add(seed, 2) ? '菜园的箱子' : '';
    if (destination) {
      delete state.pending;
      state.rollDay = day;
      return { accepted, seed, destination };
    }
    return { accepted, message: '我给你留了两包种子。背包和箱子都放不下，腾出地方再来拿吧。' };
  }
  return { accepted };
}
