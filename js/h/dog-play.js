export const commands = { sit: '坐下', stand: '站起来', paw: '握手' };
export const MASTERY = 20;
export function practice(skills, key, random = Math.random) {
  const level = skills[key] || 0;
  const chance = key === 'fetch' ? .30 + .65 * level / MASTERY : .20 + .80 * level / MASTERY;
  skills[key] = Math.min(MASTERY, level + 1);
  return level === MASTERY && key !== 'fetch' || random() < chance;
}

export const neutralDogPose = { height: 0, pitch: 0, head: 0, legs: [0, 0, 0, 0] };
const commandPoses = {
  sit: { height: -.17, pitch: -.48, head: .27, legs: [.48, .48, -.95, -.95] },
  stand: { height: .41, pitch: -1.06, head: .70, legs: [.10, .10, 1.06, 1.06] },
  paw: { height: 0, pitch: -.22, head: .12, legs: [-1.55, .22, 1.07, 1.07] },
};
export function commandPose(command, elapsed, from = neutralDogPose) {
  const to = commandPoses[command];
  const ease = (seconds, duration) => {
    const t = Math.max(0, Math.min(1, seconds / duration));
    return t * t * (3 - 2 * t);
  };
  const blend = ease(elapsed, command === 'stand' ? .72 : .54);
  const raisedPaw = command === 'paw' ? ease(elapsed - .26, .43) : blend;
  if (blend === 1 && raisedPaw === 1) return to;
  const mix = (a, b, t) => a + (b - a) * t;
  return {
    height: mix(from.height, to.height, blend),
    pitch: mix(from.pitch, to.pitch, blend),
    head: mix(from.head, to.head, blend),
    legs: to.legs.map((angle, i) => mix(from.legs[i], angle, i === 0 ? raisedPaw : blend)),
  };
}

// 带侧倾的滑翔：先升高，滑行减速，最后向低翼一侧弯落。
export function launchDisc(from, yaw, velocity, random = Math.random) {
  const speed = Math.min(12, Math.hypot(velocity.x, velocity.z));
  const side = random() < .5 ? -1 : 1;
  return { x: from.x + Math.sin(yaw) * .7, y: from.y + 1.25, z: from.z + Math.cos(yaw) * .7,
    yaw, side, drift: velocity.x * Math.cos(yaw) - velocity.z * Math.sin(yaw),
    distance: 55 + speed * 2.2 + random() * 4, duration: 3.35 + speed * .075,
    curve: 3.5 + random() * 3, age: 0 };
}
export function discAt(f, age) {
  const t = Math.min(1, age / f.duration);
  const forward = f.distance * t * (1.20 - .20 * t);
  const lateral = f.side * f.curve * t * t * (2 * t - 1) + f.drift * .22 * t;
  return { x: f.x + Math.sin(f.yaw) * forward + Math.cos(f.yaw) * lateral,
    z: f.z + Math.cos(f.yaw) * forward - Math.sin(f.yaw) * lateral,
    y: f.y * (1 - t) + 2.1 * Math.sin(Math.PI * t) + .06 * t,
    bank: f.side * (.06 + .11 * t * t), spin: age * 18 };
}
