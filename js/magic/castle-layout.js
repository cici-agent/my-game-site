// Interior coordinates are local to the castle. Levels follow the British floor numbering.
// The books give landmarks, not a fixed survey: wings and stair flights form a playable plan.
export const CASTLE_ENTRY = Object.freeze({ x: 0, y: 0, z: 15 });
export const FLOOR_HEIGHT = 8;
const radius = .36;
const wallRadius = .15;
const floorIndex = level => level + 2;
const floorHeight = level => level * FLOOR_HEIGHT;

// Each wing runs west to east. The last two fields optionally set room depth and width weight.
const plans = [
  { level: -2, name: '深层地宫', west: [
    ['chamber','密室','chamber','石蛇守着水道尽头的斯莱特林雕像。',34,2],
  ], east: [
    ['chess','巨型巫师棋室','chess','黑白石棋子列阵，等着访客落下第一步。',26],
    ['mirror','厄里斯魔镜室','chamber','石室深处的高镜曾守护魔法石。',22],
  ], south: [
    ['snare','魔鬼网地窖','garden','石隙间伸出喜阴的藤蔓。',20],
    ['keys','飞天钥匙室','chamber','银翼钥匙在高高的拱顶下盘旋。',25],
    ['riddle','魔药谜题室','potions','七只形状各异的药瓶排成一列。',18],
  ] },
  { level: -1, name: '地下层 · 厨房与地牢', west: [
    ['slytherin-common','斯莱特林公共休息室','common','湖底的绿光掠过石墙和低矮的座椅。',24],
    ['potions','魔药课教室','potions','坩埚、量瓶和药材架围着示范台。',23],
    ['deathday','忌辰晚宴地牢','hall','幽灵宴席上的烛光染着幽蓝色。',26],
  ], east: [
    ['kitchen','霍格沃茨厨房','kitchen','礼堂正下方，家养小精灵在炉灶之间准备晚餐。',32],
  ], south: [
    ['slytherin-dorm','斯莱特林寝室','dorm','银绿床帷环绕着石砌的地下寝室。',17],
    ['snape','斯内普的办公室','office','石壁上密密排列着标本瓶。',17],
    ['potions-store','私人魔药储藏室','pantry','稀有配料按大小收在罐子里。',16],
    ['hufflepuff-common','赫奇帕奇公共休息室','common','木桶入口背后是蜂蜜色的温暖角落。',22,1.4],
    ['hufflepuff-dorm','赫奇帕奇寝室','dorm','圆拱门连着低矮而安静的卧室。',18],
  ] },
  { level: 0, name: '地面层 · 门厅与礼堂', west: [
    ['staff-room','教工休息室','common','炉边的靠椅为下课的教授们留着。',20],
    ['sorting','分院前厅','gallery','新生在这里等候麦格教授叫到自己的名字。',16],
  ], east: [
    ['great-hall','大礼堂','hall','四张学院长桌上方浮着烛光，尽头是教工席。',36],
  ], south: [
    ['filch','费尔奇的办公室','office','旧文件柜里存着历届学生的违纪记录。',16],
    ['cup-room','火焰杯候场室','trophies','三强争霸赛的勇士曾在炉边等候。',18],
    ['entrance','城堡门厅','foyer','面朝大理石楼梯可进城堡，身后的橡木门通往黑湖。',21],
    ['brooms','飞天扫帚间','store','扫帚与护理用具分门别类地收在墙边。',17],
    ['classroom-eleven','十一号教室','divination','费伦泽把占卜课搬到了适合马人的地面教室。',23],
  ] },
  { level: 1, name: '一楼 · 教学长廊', west: [
    ['transfiguration','变形术教室','classroom','讲台上留着给一年级学生练习的火柴。',24],
    ['mcgonagall','麦格教授的办公室','office','整齐的卷宗靠着格兰芬多色的扶手椅。',18],
  ], east: [
    ['defense','黑魔法防御术教室','defense','书桌之间留着练习防御咒的空地。',28],
    ['defense-office','卢平的办公室','office','水箱和教材旁留着一块给学生的巧克力。',17],
  ], south: [
    ['history','魔法史教室','classroom','宾斯教授的讲台上堆着旧书。',22],
    ['muggle-studies','麻瓜研究教室','classroom','寻常的麻瓜物品被当成研究样本。',19],
  ] },
  { level: 2, name: '二楼 · 医疗翼', west: [
    ['hospital','校医院','hospital','白色床单与床头药瓶一列列延伸到窗下。',26,1.6],
    ['pomfrey','庞弗雷夫人的办公室','hospital','医药箱和绷带放在护士长伸手可及之处。',16],
  ], east: [
    ['charms','魔咒课教室','classroom','弗立维教授的讲台边垫着几本厚书。',24],
    ['charms-practice','魔咒练习室','classroom','教室里为悬浮咒练习备好了羽毛。',17],
  ], south: [
    ['slughorn','斯拉格霍恩的办公室','office','壁炉、软椅与银杯布置出一间小客厅。',21],
    ['myrtle','桃金娘的盥洗室','bath','寻找带蛇纹的盥洗盆，可以循水管进入密室。',23],
    ['lockhart','洛哈特的办公室','office','镀金相框里的人像比书架还多。',17],
  ] },
  { level: 3, name: '三楼 · 奖杯陈列翼', west: [
    ['trophies','奖品陈列室','trophies','奖杯与魁地奇奖牌在玻璃后面闪光。',23],
    ['armor','盔甲陈列廊','gallery','一排古旧盔甲守在奖品陈列室旁。',20],
  ], east: [
    ['forbidden','三楼禁区与活板门','chamber','曾由三头犬看守的活板门通往魔法石关卡。',25],
    ['one-eyed','独眼女巫秘道口','gallery','石像背后的通道伸入霍格莫德方向的黑暗。',17],
  ], south: [
    ['boggart','博格特练习室','defense','一只封闭的旧衣柜抵住墙角。',21],
    ['ancient-runes','古代如尼文教室','classroom','长桌上摊开的石片刻着古老的符文。',21],
    ['empty','闲置的教室','classroom','曾被搬走课桌的房间很适合悄悄练习。',18],
  ] },
  { level: 4, name: '四楼 · 图书馆翼', west: [
    ['library','霍格沃茨图书馆','library','高书架之间留出供学生穿行的阅览小径。',28],
  ], east: [
    ['restricted','图书馆禁书区','archive','深色书脊收藏着受到特别看管的典籍。',25],
    ['pince','平斯夫人的工作间','office','还书登记簿摊开在书桌上。',15],
  ], south: [
    ['arithmancy','算术占卜教室','classroom','数字方阵在课桌之间组成规律。',21],
    ['mirror-class','藏镜的空教室','gallery','哈利第一次见到厄里斯魔镜的地方。',21],
    ['secret-mirror','镜后密道入口','chamber','长廊尽头的镜子遮住一道旧通廊。',18],
  ] },
  { level: 5, name: '五楼 · 级长浴室', west: [
    ['prefects','级长浴室','bath','彩色龙头环绕浴池，墙上的美人鱼守着秘密。',24],
    ['swamp','韦斯莱沼泽走廊','garden','石廊里特意留了一小片韦斯莱双胞胎的便携沼泽。',17],
  ], east: [
    ['dumbledore','校长办公室','office','历任校长的画像环绕着摆满银器的桌子。',25],
    ['gargoyle','石像鬼守卫的旋梯前厅','gallery','通往校长办公室的楼梯藏在石像鬼后面。',17],
  ], south: [
    ['umbridge','乌姆里奇的办公室','office','粉色软饰和猫咪瓷盘占满每一寸空墙。',20],
    ['exams','普通巫师等级考试准备室','classroom','一张张课桌等待参加实操考试的学生。',24],
  ] },
  { level: 6, name: '六楼 · 塔楼回廊', west: [
    ['ravenclaw-common','拉文克劳公共休息室','common','蓝铜色的休息室以书架和星空为伴。',26],
  ], east: [
    ['ravenclaw-dorm','拉文克劳寝室','dorm','高处的窗户望向远山。',24],
    ['ravenclaw-gallery','鹰首门环前厅','gallery','敲响青铜门环的学生，要解开它提出的谜题。',18],
  ], south: [
    ['boys-bath','六楼男盥洗室','bath','石地面常能听见一滴水的回声。',21],
    ['disused','废弃的盥洗室','bath','角落里积着尘土，窗边却依旧透亮。',18],
    ['portraits','肖像回廊','gallery','画框排满石壁，画像里的人有时会串门。',18],
  ] },
  { level: 7, name: '七楼 · 格兰芬多塔', west: [
    ['gryffindor-common','格兰芬多公共休息室','common','胖夫人守护的洞口后，红金色扶手椅围着火炉。',25],
    ['gryffindor-boys','哈利与同学们的寝室','dorm','深红床帷垂在五张四柱床之间。',23],
  ], east: [
    ['requirement','有求必应屋 · 训练室','requirement','集中精神，房间会显现出另一个模样。',27],
    ['hidden','有求必应屋 · 藏物之室','store','几代学生留下的箱笼与橱柜堆成小巷。',26],
  ], south: [
    ['gryffindor-girls','格兰芬多女生寝室','dorm','寝室里的床边摆着整齐叠好的长袍。',19],
    ['fat-lady','胖夫人画像廊','gallery','等待口令的胖夫人占着宽宽的金画框。',18],
    ['flitwick','弗立维教授的办公室','office','高处这扇窄窗曾是小天狼星等候救援的地方。',16],
  ] },
  { level: 8, name: '塔顶 · 天文与占卜', west: [
    ['astronomy','天文塔观星台','astronomy','黄铜望远镜正对群星，记录星位的地图摊在旁边。',27],
  ], east: [
    ['divination','北塔占卜教室','divination','水晶球和茶杯摆在低矮的圆桌上。',24],
    ['trelawney','特里劳妮的起居室','divination','厚帘后面是教授自己的安静角落。',17],
  ], south: [
    ['owlery','西塔猫头鹰棚屋','owlery','层层栖架让送信的猫头鹰临窗歇脚。',23],
    ['tower-landing','天文塔楼梯平台','gallery','月光从最高的尖拱窗落在台阶上。',18],
  ] },
];

const stair = { west: -6, east: 6, far: -24, turn: -21, foot: -8, entry: -4 };
const lastLevel = plans.at(-1).level;
const secrets = new Set(['chamber', 'hidden']);

function makeWing(definitions, left, right, north, level) {
  const gap = 1;
  const span = right - left - gap * (definitions.length - 1);
  const weight = definitions.reduce((sum, data) => sum + (data[5] || 1), 0);
  let start = left;
  return definitions.map(([id, name, kind, hint, depth, ratio = 1]) => {
    const end = start + span * ratio / weight;
    const room = {
      id, name, kind, hint, level, secret: secrets.has(id),
      x1: start, x2: end, z1: north ? -4 - depth : 4, z2: north ? -4 : 4 + depth,
      doorX: (start + end) / 2, doorZ: north ? -4 : 4,
      doorWidth: kind === 'hall' || kind === 'foyer' ? 6 : 3.6,
    };
    start = end + gap;
    return room;
  });
}

function buildFloor(plan) {
  const level = plan.level, y = floorHeight(level);
  const width = level === 8 ? 38 : level < -1 ? 48 : 57;
  const rooms = [
    ...makeWing(plan.west, -width, -8, true, level),
    ...makeWing(plan.east, 8, width, true, level),
    ...makeWing(plan.south, -width, width, false, level),
  ];
  const surfaces = [], walls = [];
  const slab = (kind, x1, x2, z1, z2, y1 = y, y2 = y1, roomId = null) =>
    surfaces.push({ kind, x1, x2, z1, z2, y1, y2, roomId });
  const wall = (x1, z1, x2, z2) => walls.push({ x1, z1, x2, z2 });
  slab('corridor', -width, width, -4, 4);
  for (const room of rooms) {
    const { x1, x2, z1, z2, doorZ } = room;
    const back = doorZ < 0 ? z1 : z2;
    slab('room', x1, x2, z1, z2, y, y, room.id);
    wall(x1, z1, x1, z2);
    wall(x2, z1, x2, z2);
    wall(x1, back, x2, back);
  }
  for (const z of [-4, 4]) {
    const openings = rooms.filter(room => room.doorZ === z && !room.secret).map(room => {
      const half = room.doorWidth / 2;
      return [room.doorX - half, room.doorX + half];
    });
    if (z < 0) openings.push([stair.west, stair.east]);
    openings.sort((a, b) => a[0] - b[0]);
    let start = -width;
    for (const [left, right] of openings) {
      wall(start, z, left, z);
      start = right;
    }
    wall(start, z, width, z);
  }
  wall(-width, -4, -width, 4);
  wall(width, -4, width, 4);
  slab('landing', stair.west, stair.east, stair.foot, stair.entry);
  // The floor above uses the same two-lane shaft. Leave its centre open to the stairwell.
  if (level < lastLevel) {
    slab('stairs', stair.west, -.22, stair.turn, stair.foot, y + 4, y);
    slab('landing', stair.west, stair.east, stair.far, stair.turn, y + 4);
    slab('stairs', .22, stair.east, stair.turn, stair.foot, y + 4, y + 8);
  }
  wall(stair.west, stair.far, stair.west, stair.entry);
  wall(stair.east, stair.far, stair.east, stair.entry);
  wall(stair.west, stair.far, stair.east, stair.far);
  return { level, name: plan.name, y, rooms, walls, surfaces };
}

export const castleFloors = plans.map(buildFloor);
export const castleRooms = castleFloors.flatMap(floor => floor.rooms);
const roomsById = new Map(castleRooms.map(room => [room.id, room]));

export function roomArrival(room) {
  return { x: room.doorX, y: floorHeight(room.level), z: room.doorZ + 2 * Math.sign(room.doorZ) };
}

function passage(from, to, label) {
  const room = roomsById.get(from), destination = roomsById.get(to);
  const sign = Math.sign(room.doorZ);
  return {
    from, to, level: room.level, label, x: room.doorX,
    z: (sign > 0 ? room.z2 : room.z1) - sign * 4,
    destination: roomArrival(destination),
  };
}

export const castlePassages = [
  passage('myrtle', 'chamber', '打开蛇纹盥洗盆，进入密室'),
  passage('chamber', 'myrtle', '沿水管返回桃金娘的盥洗室'),
  passage('requirement', 'hidden', '让房间显现藏物之室'),
  passage('hidden', 'requirement', '让房间变回训练室'),
  passage('forbidden', 'snare', '穿过活板门，进入魔鬼网地窖'),
  passage('snare', 'forbidden', '沿活板门返回三楼禁区'),
];

export function castlePassageAt(pos) {
  return castlePassages.find(p => Math.abs(pos.y - floorHeight(p.level)) < .5 &&
    Math.hypot(pos.x - p.x, pos.z - p.z) < 2.6) || null;
}

export function nearCastleExit(pos) {
  return Math.abs(pos.y) < .45 && Math.abs(pos.x) < 3 &&
    pos.z >= roomsById.get('entrance').z2 - 3.2 && pos.z < roomsById.get('entrance').z2;
}

function contains(rect, x, z) {
  return x >= rect.x1 && x <= rect.x2 && z >= rect.z1 && z <= rect.z2;
}

function surfaceHeight(surface, z) {
  return surface.y1 + (surface.y2 - surface.y1) * ((z - surface.z1) / (surface.z2 - surface.z1));
}

export function castleLocation(pos) {
  const level = Math.max(plans[0].level, Math.min(lastLevel, Math.round(pos.y / FLOOR_HEIGHT)));
  const floor = castleFloors[floorIndex(level)];
  const room = floor.rooms.find(room => contains(room, pos.x, pos.z)) || null;
  return { level, name: floor.name, room, stairs: !room && pos.z < stair.entry };
}

function meetsWall(wall, x, z) {
  const dx = x - Math.max(wall.x1, Math.min(wall.x2, x));
  const dz = z - Math.max(wall.z1, Math.min(wall.z2, z));
  return dx * dx + dz * dz < (radius + wallRadius) ** 2;
}

function meetsFurniture(furniture, level, x, z) {
  return furniture.some(box => box.level === level &&
    x > box.x1 - radius && x < box.x2 + radius && z > box.z1 - radius && z < box.z2 + radius);
}

function tryStep(pos, x, z, furniture) {
  // Both flights appear above this storey, and the upper piece of the one below
  // meets this storey's landing. Choose only a surface reachable at foot height.
  const index = Math.floor((pos.y + .001) / FLOOR_HEIGHT);
  let floorY = null, smallest = .3;
  for (let n = index - 1; n <= index + 1; n++) {
    const floor = castleFloors[floorIndex(n)];
    if (!floor) continue;
    for (const s of floor.surfaces) {
      if (!contains(s, x, z)) continue;
      const y = surfaceHeight(s, z), delta = Math.abs(y - pos.y);
      if (delta < smallest) { floorY = y; smallest = delta; }
    }
  }
  if (floorY === null) return;
  // Walls enclose each storey from floor to ceiling. A body can span two
  // storeys on the last step; the upper and lower stair walls coincide.
  const level = Math.floor((floorY + .001) / FLOOR_HEIGHT);
  const floor = castleFloors[floorIndex(level)];
  if (floor.walls.some(w => meetsWall(w, x, z)) || meetsFurniture(furniture, level, x, z)) return;
  pos.x = x; pos.y = floorY; pos.z = z;
}

export function moveInCastle(pos, dx, dz, furniture = []) {
  if (dx === 0 && dz === 0) return pos;
  const steps = Math.ceil(Math.hypot(dx, dz) / .2);
  for (let i = 0; i < steps; i++) {
    if (dx) tryStep(pos, pos.x + dx / steps, pos.z, furniture);
    if (dz) tryStep(pos, pos.x, pos.z + dz / steps, furniture);
  }
  return pos;
}

// Clip the camera sight line against walls, furniture and the floor above or
// below. In a switchback only the solid flights clip the view, not the void.
function boxHit(start, end, x1, x2, y1, y2, z1, z2) {
  let near = 0, far = 1;
  for (const [a, b, lo, hi] of [[start.x, end.x, x1, x2], [start.y, end.y, y1, y2], [start.z, end.z, z1, z2]]) {
    const d = b - a;
    if (Math.abs(d) < 1e-8) {
      if (a < lo || a > hi) return 1;
    } else {
      const t1 = (lo - a) / d, t2 = (hi - a) / d;
      near = Math.max(near, Math.min(t1, t2));
      far = Math.min(far, Math.max(t1, t2));
      if (near > far) return 1;
    }
  }
  return near;
}

export function castleCameraFraction(start, end, furniture = []) {
  const minY = Math.min(start.y, end.y), maxY = Math.max(start.y, end.y), pad = .23;
  let closest = 1;
  for (const floor of castleFloors) {
    if (floor.y > maxY + pad || floor.y + FLOOR_HEIGHT < minY - pad) continue;
    for (const w of floor.walls) {
      closest = Math.min(closest, boxHit(start, end, w.x1 - pad, w.x2 + pad,
        floor.y - pad, floor.y + FLOOR_HEIGHT + pad, w.z1 - pad, w.z2 + pad));
    }
    for (const s of floor.surfaces) {
      if ((s.kind === 'room' || s.kind === 'corridor') && end.y > start.y) {
        const ceiling = floor.y + FLOOR_HEIGHT - .28;
        const t = (ceiling - start.y) / (end.y - start.y);
        if (t >= 0 && t < closest && contains(s, start.x + (end.x - start.x) * t, start.z + (end.z - start.z) * t)) closest = t;
      }
      const startHeight = start.y - surfaceHeight(s, start.z);
      const endHeight = end.y - surfaceHeight(s, end.z);
      // Include the stone slab and the clearance for the near plane.
      const below = startHeight < 0;
      const clearance = below ? -.42 : .18;
      if (below ? endHeight < clearance : endHeight > clearance) continue;
      const dy = endHeight - startHeight;
      if (Math.abs(dy) < 1e-8) continue;
      const t = (clearance - startHeight) / dy;
      if (t >= 0 && t < closest && contains(s, start.x + (end.x - start.x) * t, start.z + (end.z - start.z) * t)) closest = t;
    }
    for (const b of furniture) {
      if (b.level !== floor.level) continue;
      closest = Math.min(closest, boxHit(start, end, b.x1 - pad, b.x2 + pad,
        b.y1 ?? floor.y, b.y2 ?? floor.y + 2, b.z1 - pad, b.z2 + pad));
    }
  }
  return closest;
}
