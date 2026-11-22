const HOUR = 3600;
export const HUNGER_RATE = .012, HUNGRY = 40, MEAL = 40;
export const DIRTY_AFTER = 4 * HOUR;

export function freshCare(random = Math.random) {
  return { sinceBath: 0, sick: false, starving: 0, lethalAfter: (48 + 24 * random()) * HOUR,
    riskLeft: illnessThreshold(random) };
}

function illnessThreshold(random) {
  return -Math.log(1 - Math.min(.999999, random())) + .001;
}

export function careLabel(st) {
  if (st.full <= 0) return '极度饥饿 · 请尽快喂食';
  if (st.care.sick) return '生病了 · 去萌宠小屋看病';
  if (st.care.sinceBath >= DIRTY_AFTER) return '身上脏了 · 可以去洗澡';
  return '健康';
}

export function advanceCare(st, seconds) {
  if (!st.has || seconds <= 0) return;
  const care = st.care;
  const cleanSeconds = Math.min(seconds, Math.max(0, DIRTY_AFTER - care.sinceBath));
  care.sinceBath += seconds;
  if (!care.sick) {
    care.riskLeft -= (cleanSeconds + 5 * (seconds - cleanSeconds)) / (72 * HOUR);
    if (care.riskLeft <= 0) care.sick = true;
  }
  const hungrySeconds = Math.max(0, seconds - st.full / HUNGER_RATE);
  if (st.full > 0) care.starving = 0;
  st.full = Math.max(0, st.full - seconds * HUNGER_RATE);
  care.starving += hungrySeconds;
  st.loyal = Math.max(0, st.loyal - hungrySeconds / 600);
  if (care.starving >= care.lethalAfter) {
    st.has = false;
    st.died = true;
  }
}

export function advanceAway(st, seconds) {
  const bowl = st.bowl;
  const reachable = bowl && (!st.chain || Math.hypot(bowl.x - st.chain.x, bowl.z - st.chain.z) <= 4.1);
  while (st.has && seconds > 0 && reachable && bowl.food > 0) {
    const untilMeal = Math.max(0, (st.full - HUNGRY) / HUNGER_RATE);
    if (seconds < untilMeal) break;
    advanceCare(st, untilMeal);
    seconds -= untilMeal;
    bowl.food--;
    st.full = Math.min(100, st.full + MEAL);
    st.care.starving = 0;
  }
  advanceCare(st, seconds);
}

export const services = {
  bath: { price: 5, name: '洗澡', icon: '🛁', available: st => st.has && st.care.sinceBath >= 60,
    apply(st) { st.care.sinceBath = 0; } },
  treat: { price: 12, name: '看病', icon: '🩺', available: st => st.has && st.care.sick,
    apply(st) { st.care.sick = false; st.care.riskLeft = illnessThreshold(Math.random); } },
};
