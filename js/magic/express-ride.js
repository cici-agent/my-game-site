// Stops and shots use distance along the same rail centreline as the coaches.
export const rideSeconds = 72;
export const birchLoch = { x: 348, z: 84 };
export const highlandTarn = { x: 330, z: -155 };
export const rideScenes = [
  { start: 0, title: '离开国王十字', text: '车轮越过站棚最后一道影子。前方的铁轨向郊野伸去。', eye: [-12, 7, -18], look: [0, 2.4, 3] },
  { start: .17, title: '沿湖向北', text: '第一片湖水从车厢旁展开，远岸的山脊映在水面上。', lake: birchLoch },
  { start: .38, title: '穿过针叶林', text: '松林贴近铁轨，树影交替掠过车窗。', eye: [-4.5, 4, -12], look: [2, 3.2, 23] },
  { start: .63, title: '高地湖湾', text: '列车绕过长弯，另一片湖泊出现在山脚下。', lake: highlandTarn },
  { start: .84, title: '驶入霍格莫德', text: '列车开始减速。站灯下，有个高大的身影正提灯等候。', eye: [-11, 8, -18], look: [1, 3, 11] },
];

export function routeProgress(time) {
  const t = Math.max(0, Math.min(1, time));
  const ramp = .10;
  if (t < ramp) return t * t / (2 * ramp * (1 - ramp));
  if (t > 1 - ramp) return 1 - (1 - t) ** 2 / (2 * ramp * (1 - ramp));
  return (t - ramp / 2) / (1 - ramp);
}

export function rideSceneAt(distance) {
  for (let i = rideScenes.length - 1; i > 0; i--) {
    if (distance >= rideScenes[i].start) return rideScenes[i];
  }
  return rideScenes[0];
}
