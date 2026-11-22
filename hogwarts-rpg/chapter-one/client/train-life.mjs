import { getTrainSeat, TRAIN_LAYOUT } from '../train-layout.mjs';
// Seats and floor anchors come from the same layout as rendered furniture.
// A party member always takes precedence over a story copy of that hero.
const passengers = [
  { id: 'ron', name: '罗恩', seated: true, lines: ['我带了三明治，不过巧克力蛙听起来更有趣。你想坐这里吗？', '听说霍格沃茨有一副会自己移动的巫师棋。我很想试试。'] },
  { id: 'hermione', name: '赫敏', seated: true, lines: ['我正在复习咒语。到了学校，我们可以一起去上魔咒课。', '窗外已经是山地了。先收好书本，下车时别忘了行李。'] },
  { id: 'harry', name: '哈利', seated: true, lines: ['这是我第一次坐这趟列车。和朋友一起去学校，感觉好多了。', '等到了学校，我们再一起探索吧。'] },
  { id: 'neville', name: '纳威', seated: true, lines: ['你见到我的蟾蜍了吗？它总喜欢从行李旁边溜走。', '希望分院的时候，我不会紧张得忘了自己的名字。'] },
  { id: 'draco', name: '德拉科·马尔福', seated: true, lines: ['很快就能看见霍格沃茨了。你想过自己会去哪个学院吗？', '我要再检查一次行李。下车时可别挤在门口。'] },
  { id: 'trolley', name: '糖果车女巫', seated: false, lines: ['旅途还长，要看看巧克力蛙和比比多味豆吗？糖果车就在旁边。', '列车快到站了，孩子们。收好东西，等停稳后再下车。'] },
];

export function trainPassengers(view, occupiedHeroIds = []) {
  if (view?.sceneId !== 'SC02') return [];
  occupiedHeroIds=view.occupiedHeroIds??occupiedHeroIds;
  return passengers.filter(person => !occupiedHeroIds.includes(person.id)).map((person, index) => {
    const seat=getTrainSeat(person.id);
    return {
      name: person.name, appearanceId: person.id, position: { ...(seat?.position??TRAIN_LAYOUT.trolley.attendant) },
      yaw: seat?.yaw??Math.PI, seated: person.seated, seat:seat?{...seat.seat}:null, kind: 'passenger', targetId: `passenger-${person.id}`, phase: index * 1.7,
      line: person.lines[view.transit?.progress > .7 ? 1 : 0],
    };
  });
}

export function trainConversationTargets(view, occupiedHeroIds = []) {
  return trainPassengers(view, occupiedHeroIds).map(person => ({
    id: person.targetId, npc: person.name, kind: 'conversation', actionType: 'conversation', active: true,
    label: `与${person.name}交谈`, dialogue: person.line, position: { ...person.position }, radius: 2.0,
  }));
}
