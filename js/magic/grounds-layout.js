// All coordinates are on the same outdoor map as the lakeshore and castle bridge.
export const groundPlaces = [
  { id: 'lake', name: '黑湖西码头', x: -42, y: .85, z: -95.9, yaw: 0, radius: 8, description: '新生的小船在石桥下靠岸。沿桥向北进城堡，沿木码头向西可走上校地。' },
  { id: 'willow', name: '打人柳', x: -84, y: 0, z: -103, yaw: .95, radius: 11, description: '粗壮的枝条在空中挥动。站在树冠外，可以看清通向林场的岔路。' },
  { id: 'hagrid', name: '海格的小屋', x: -116, y: 0, z: -83, yaw: .55, radius: 10, description: '南瓜挤在菜畦里，铜壶挂在炉火上。小屋背后就是禁林。' },
  { id: 'forest', name: '禁林入口', x: -136, y: 0, z: -102, yaw: .87, radius: 9, description: '两盏提灯标出小径的起点。循着浅色的泥土路向深处走，可到林间空地。' },
  { id: 'clearing', name: '禁林深处的空地', x: -164, y: 0, z: -141, yaw: .3, radius: 7, description: '树林在此围成一圈，星光从树冠的缝隙照在蕨叶和古老的石头上。' },
  { id: 'pitch', name: '魁地奇球场', x: -132, y: 0, z: -10, yaw: .25, radius: 33, description: '椭圆形草坪两端各立着三只金环，四个学院的旗帜从高高的看台垂下。' },
  { id: 'courtyard', name: '校地石庭', x: -74, y: 0, z: -37, yaw: .75, radius: 8, description: '石庭是校地的十字路口。西侧去球场，东侧去温室，向南沿湖可回到码头。' },
  { id: 'greenhouses', name: '草药学温室', x: -43, y: 0, z: -9, yaw: 0, radius: 12, description: '玻璃暖房的中央留着一条窄道。走进去，可以看到盆栽的曼德拉草和攀缘的藤蔓。' },
  { id: 'owlery', name: '猫头鹰棚屋', x: -103, y: 0, z: -146, yaw: 0, radius: 9, description: '开放的拱门通往塔底。梁上挤着灰色和雪白的猫头鹰，地上散着羽毛。' },
];

export const groundsTrails = [
  [[-72,-95.9],[-80,-94],[-86,-83],[-95,-74]],
  [[-84,-103],[-80,-94]],
  [[-95,-74],[-106,-79],[-116,-83],[-126,-87],[-136,-102],[-148,-112],[-152,-124],[-164,-141]],
  [[-136,-102],[-131,-109],[-121,-113],[-111,-116],[-106,-130],[-103,-146]],
  [[-95,-74],[-99,-57],[-100,-36],[-97,-19],[-97,-10],[-102,-10],[-111,-10],[-116,-10]],
  [[-99,-57],[-87,-47],[-74,-37],[-65,-30],[-65,-13],[-61,-5],[-56,-5],[-43,-5],[-43,-9]],
  [[-56,-5],[-56,-9]],
];

export const hut = { x: -120, z: -93, r: 6.15 };
export const owlery = { x: -103, z: -151, r: 5.25 };
export const greenhouses = [{ x: -43, z: -18 }, { x: -56, z: -18 }];
export const pitch = { x: -132, z: -10, rx: 31, rz: 48 };
export const pitchTowers = [];
for (const angle of [-140,-100,-62,-27,27,62,100,140,180]) {
  const a = angle * Math.PI / 180;
  pitchTowers.push({ x: pitch.x + pitch.rx * Math.cos(a), z: pitch.z + pitch.rz * Math.sin(a), yaw: Math.atan2(Math.cos(a) / pitch.rx, Math.sin(a) / pitch.rz) });
}
export const goalposts = [];
for (const side of [-1,1]) for (const index of [-1,0,1]) {
  goalposts.push({ x: pitch.x + index * 6.1, z: pitch.z + side * (34 - Math.abs(index) * 1.5), h: index === 0 ? 13.2 : index === 1 ? 10.6 : 9.1 });
}

export function seeded(seed) {
  let n = seed >>> 0;
  return () => ((n = Math.imul(n, 1664525) + 1013904223 >>> 0) / 4294967296);
}

export function pathDistance(x, z) {
  let nearest = Infinity;
  for (const trail of groundsTrails) for (let i = 1; i < trail.length; i++) {
    const [ax, az] = trail[i - 1], [bx, bz] = trail[i];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    nearest = Math.min(nearest, Math.hypot(x - ax - t * dx, z - az - t * dz));
  }
  return nearest;
}

// Keep the actual three-dimensional entrances and center aisles open.
export function groundsCollision() {
  const cells = new Map();
  function insert(solid) {
    const {x, z, extent} = solid;
    for (let ix = Math.floor((x - extent) / 10); ix <= Math.floor((x + extent) / 10); ix++) {
      for (let iz = Math.floor((z - extent) / 10); iz <= Math.floor((z + extent) / 10); iz++) {
        const key = `${ix}:${iz}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key).push(solid);
      }
    }
  }
  function circle(x, z, radius, height, base = 0) {
    insert({x,z,extent:radius + .65, radius, height, base});
  }
  function ellipse(x,z,rx,rz,height) {
    insert({x,z,rx,rz,extent:Math.max(rx,rz)+.65,height,base:0});
  }
  function box(x, z, w, d, height, yaw = 0, base = 0) {
    insert({x,z,extent:Math.hypot(w, d)/2 + .65, w: w / 2, d: d / 2, c: Math.cos(yaw), s: Math.sin(yaw), height, base});
  }
  function blocked(x,z,radius,y) {
    const solids = cells.get(`${Math.floor(x / 10)}:${Math.floor(z / 10)}`);
    return solids?.some(s => {
      if (y < s.base || y > s.height) return false;
      const dx = x - s.x, dz = z - s.z;
      if (s.rx) return (dx/(s.rx+radius))**2+(dz/(s.rz+radius))**2 < 1;
      return s.radius !== undefined ? dx*dx + dz*dz < (s.radius + radius)**2 :
        Math.abs(dx * s.c - dz * s.s) < s.w + radius && Math.abs(dx * s.s + dz * s.c) < s.d + radius;
    }) ?? false;
  }
  return {circle, ellipse, box, canWalk: (x,z) => !blocked(x,z,.55,1), cameraFraction(start,end) {
    const dx = end.x - start.x, dy = end.y - start.y, dz = end.z - start.z;
    const steps = Math.ceil(Math.hypot(dx,dy,dz) / .33);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (blocked(start.x + t * dx, start.z + t * dz, .22, start.y + t * dy)) return (i - 1) / steps;
    }
    return 1;
  }};
}
