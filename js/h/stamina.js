// ===== 菜鸟家园 · 体力 =====
// 用户定的：体力用完了走路会非常慢；睡觉、吃东西能回体力；高温天体力掉得很快（天气做好后接上 drainMul）
// 床越高级，睡觉回的体力越多；睡觉时时间照常走，不能一下跳过晚上
// 下面的数字是 Claude 定的（单位：现实里的秒），以后可以改
export const MAX = 100;
const DRAIN = { awake: .02, walk: .03, run: .1, jump: .4, work: .6 };   // 醒着慢慢掉；走路、跑步、跳、干活另外掉
export const BED_RATE = { bedStraw: .06, bedWood: .09, bedSoft: .12, bedDouble: .16, bedCanopy: .2 };   // 睡觉每秒回多少
// 吃东西回多少体力
export const FOOD = { chicken_meat: 15, egg: 8, radish: 4, lettuce: 5, carrot: 6, potato: 8, tomato: 7, corn: 9, strawberry: 6, pumpkin: 20, watermelon: 25, apple: 8, orange: 8, peach: 10, cherry: 6 };

export function createStamina({ save = true } = {}) {
  const KEY = 'xcn_stamina_v1';
  let st = null;
  try { st = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) {}
  if (!st) st = { v: MAX };
  let saveT = 0, sleepRate = 0;
  const S = {
    drainMul: 1,   // 高温天以后改成 2~3
    get value() { return st.v; },
    get empty() { return st.v <= 0; },
    get sleeping() { return sleepRate > 0; },
    get rate() { return sleepRate; },
    set(v) { st.v = Math.max(0, Math.min(MAX, v)); persist(); },
    use(kind, n = 1) { if (!sleepRate) st.v = Math.max(0, st.v - DRAIN[kind] * n * S.drainMul); },
    eat(key) { const n = FOOD[key]; if (!n) return 0; const before = st.v; st.v = Math.min(MAX, st.v + n); persist(); return st.v - before; },
    sleep(rate) { sleepRate = rate; },
    wake() { sleepRate = 0; persist(); },
    // 每一帧：moving 0~1，running 是不是在跑
    update(dt, moving, running) {
      if (sleepRate) st.v = Math.min(MAX, st.v + sleepRate * dt);
      else st.v = Math.max(0, st.v - (DRAIN.awake + (moving > .05 ? (running ? DRAIN.run : DRAIN.walk) * moving : 0)) * dt * S.drainMul);
      saveT += dt; if (saveT > 3) { saveT = 0; persist(); }
    },
  };
  function persist() { if (!save) return; try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  return S;
}
