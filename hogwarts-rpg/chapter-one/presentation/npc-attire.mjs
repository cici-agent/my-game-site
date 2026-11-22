import * as THREE from 'three';

function fabricPanel(kit, parent, material, { top = 1.17, bottom = .51, topWidth = .16, width = .23, depth = -.244 } = {}) {
  const vertices = [], uv = [], indices = [], rows = 12, columns = 10;
  for (let row = 0; row <= rows; row++) for (let column = 0; column <= columns; column++) {
    const t = row / rows, u = column / columns * 2 - 1, w = THREE.MathUtils.lerp(topWidth, width, t);
    vertices.push(u * w, THREE.MathUtils.lerp(top, bottom, t), depth + u * u * .035 + Math.sin(u * 12 + t * 2) * .004 * t);
    uv.push(column / columns, t);
  }
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const a = row * (columns + 1) + column, b = a + columns + 1; indices.push(a, a + 1, b, a + 1, b + 1, b);
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return kit.mesh(parent, geometry, material);
}
function collar(kit, body, material, height = .10) {
  kit.lathe(body, material, [[.09, 0], [.093, height], [.084, height + .012]], [0, 1.30, 0], [1, 1, .82]);
}
function mantle(kit, body, material, length = .40, radius = .34) {
  const rings = 10, segments = 44, vertices = [], uv = [], indices = [];
  for (let row = 0; row <= rings; row++) for (let i = 0; i <= segments; i++) {
    const t = row / rings, angle = .42 + i / segments * (Math.PI * 2 - .84), width = THREE.MathUtils.lerp(.10, radius, Math.sin(t * Math.PI / 2));
    const fold = 1 + Math.sin(angle * 13) * .013 * t;
    vertices.push(Math.sin(angle) * width * fold, 1.395 - t * length, -Math.cos(angle) * width * .76 * fold); uv.push(i / segments, t);
  }
  for (let row = 0; row < rings; row++) for (let i = 0; i < segments; i++) { const a = row * (segments + 1) + i, b = a + segments + 1; indices.push(a, b, a + 1, a + 1, b, b + 1); }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); geometry.setIndex(indices); geometry.computeVertexNormals();
  kit.mesh(body, geometry, material);
}

export function addNpcAttire({ kit, body, head, id, design, cloth, edge, leather, ivory, brass, wool }) {
  const accentColor = id === 'draco' ? '#65776b' : id === 'wood' ? '#c1a264' : ['pomfrey', 'pince'].includes(id) ? '#cdc8b6' : ['supply', 'gear', 'sprout'].includes(id) ? '#948066' : '#9c8b73';
  const accent = kit.material({ color: accentColor, roughness: .88, bumpMap: wool, bumpScale: .0011, side: THREE.DoubleSide });
  const lining = kit.material({ color: new THREE.Color(design.cloth).multiplyScalar(1.16), roughness: .85, bumpMap: wool, bumpScale: .0011, side: THREE.DoubleSide });
  const cube = (parent, material, at, size, rotation) => kit.mesh(parent, new THREE.BoxGeometry(...size), material, at, [1, 1, 1], rotation);
  collar(kit, body, id === 'snape' ? edge : ivory, id === 'snape' ? .13 : .065);
  if (['mcgonagall', 'dumbledore', 'snape', 'pince'].includes(id)) {
    mantle(kit, body, lining, id === 'snape' ? .62 : .39, id === 'snape' ? .325 : .345);
    if (id !== 'snape') {
      kit.oval(body, brass, [0, 1.30, -.116], [.025, .029, .009]);
      kit.oval(body, cloth, [0, 1.30, -.124], [.017, .020, .004]);
    }
  }
  if (id === 'snape') {
    fabricPanel(kit, body, edge, { top: 1.28, bottom: .56, topWidth: .035, width: .045, depth: -.246 });
    for (let i = 0; i < 11; i++) kit.oval(body, leather, [0, 1.25 - i * .060, -.250], [.008, .008, .004]);
  }
  if (['sprout', 'pomfrey', 'supply', 'gear'].includes(id)) {
    const panel = fabricPanel(kit, body, accent); panel.name = 'WorkApron';
    for (const side of [-1, 1]) kit.tube(body, accent, [[side * .13, 1.13, -.244], [side * .18, 1.34, -.12], [side * .13, 1.35, .08]], .013);
    fabricPanel(kit, body, lining, { top: .84, bottom: .65, topWidth: .17, width: .17, depth: -.256 });
    for (const x of [-.16, .16]) kit.tube(body, ivory, [[x, .82, -.258], [x, .66, -.258]], .0015);
    kit.tube(body, ivory, [[-.16, .66, -.258], [0, .655, -.260], [.16, .66, -.258]], .0015);
    if (id === 'gear') for (let i = 0; i < 14; i++) cube(body, edge, [.115, 1.17 - i * .033, -.265], [.012, .002, .002]);
  }
  if (id === 'pomfrey') {
    const cap = new THREE.Group(); cap.position.set(0, .17, .01); head.add(cap);
    kit.mesh(cap, new THREE.CylinderGeometry(.17, .185, .10, 40, 1, true), ivory, [0, .015, 0], [1, 1, .77]);
    kit.mesh(cap, new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), ivory, [0, .065, 0], [.17, .04, .131]); kit.bake(cap);
  }
  if (id === 'molly') {
    mantle(kit, body, accent, .35, .37);
    for (const side of [-1, 1]) for (let i = 0; i < 11; i++) kit.tube(body, ivory, [[side * (.07 + i * .020), 1.30 - i * .019, -.13 - i * .008], [side * (.07 + i * .020), 1.27 - i * .019, -.13 - i * .008]], .0018);
  }
  if (design.student) {
    fabricPanel(kit, body, accent, { top: 1.28, bottom: 1.02, topWidth: .020, width: .032, depth: -.243 });
    for (let i = 0; i < 4; i++) cube(body, ivory, [0, 1.23 - i * .050, -.250], [.047, .009, .003], [0, 0, -.28]);
    const crest = new THREE.Shape(); crest.moveTo(-.023, .025); crest.lineTo(.023, .025); crest.lineTo(.021, -.006); crest.lineTo(0, -.030); crest.lineTo(-.021, -.006); crest.closePath();
    kit.mesh(body, new THREE.ShapeGeometry(crest), accent, [-.17, 1.18, -.205], [1, 1, 1], [0, Math.PI, 0]);
    for (const side of [-1, 1]) kit.tube(body, accent, [[side * .11, 1.35, -.08], [side * .25, 1.20, -.16], [side * .095, 1.00, -.214]], .004);
  }
  if (design.flight) {
    mantle(kit, body, leather, .25, .34);
    for (const side of [-1, 1]) {
      kit.mesh(body, new THREE.TorusGeometry(.034, .006, 8, 24), brass, [side * .037, 1.28, -.16]);
      kit.oval(body, edge, [side * .037, 1.28, -.159], [.029, .024, .004]);
    }
    kit.tube(body, leather, [[-.07, 1.28, -.16], [-.15, 1.34, 0], [0, 1.38, .09], [.15, 1.34, 0], [.07, 1.28, -.16]], .006);
  }
  if (id === 'flitwick') {
    for (const side of [-1, 1]) kit.oval(body, accent, [side * .026, 1.32, -.105], [.029, .016, .012], [0, 0, side * .16]);
    kit.oval(body, brass, [0, 1.32, -.117], [.008, .009, .005]);
  }
  if (['post', 'tools', 'filch'].includes(id)) {
    kit.tube(body, leather, [[-.21, 1.32, -.12], [0, 1.05, -.25], [.24, .78, -.19]], .019);
    cube(body, leather, [.26, .76, -.045], [.15, .23, .14], [0, 0, -.10]);
    cube(body, brass, [.26, .81, -.12], [.035, .026, .006]);
  }
  if (id === 'dumbledore') for (const side of [-1, 1]) for (let i = 0; i < 9; i++) {
    const y = .57 + i * .072, x = side * (.10 + (.98 - y) * .08);
    kit.tube(body, brass, [[x - .006, y - .009, -.221], [x, y, -.228], [x + .006, y - .009, -.221]], .0012);
  }
  if (id === 'hagrid') {
    for (const side of [-1, 1]) for (let i = 0; i < 19; i++) kit.tube(body, ivory, [[side * .25, .57 + i * .027, -.159], [side * .256, .573 + i * .027, -.156]], .0012);
  }
  return { accent, lining, cube };
}

export function addNpcOccupationProp({ kit, hand, id, brass, leather, ivory, accent, cube }) {
  const group = new THREE.Group(); group.name = `OccupationProp:${id}`; hand.add(group); group.position.set(0, -.055, -.025);
  if (['pince', 'mcgonagall', 'tools'].includes(id)) {
    cube(group, leather, [0, -.075, 0], [.15, .20, .046]); cube(group, ivory, [0, -.075, -.001], [.142, .184, .043]);
    for (const z of [-.026, .026]) cube(group, accent, [0, -.075, z], [.157, .204, .005]);
    cube(group, brass, [0, -.075, -.031], [.06, .085, .003]);
    for (let i = 0; i < 4; i++) cube(group, leather, [0, -.12 + i * .025, -.034], [.041, .0015, .001]);
  } else if (id === 'filch') {
    kit.mesh(group, new THREE.TorusGeometry(.040, .004, 6, 24), brass, [0, -.02, 0]);
    for (let i = 0; i < 5; i++) { const x = (i - 2) * .013; kit.tube(group, brass, [[x, -.05, 0], [x, -.13 - (i % 2) * .02, 0]], .004); cube(group, brass, [x + .009, -.13 - (i % 2) * .02, 0], [.022, .010, .006]); }
  } else if (id === 'post') {
    cube(group, accent, [0, -.08, 0], [.19, .15, .11]);
    for (const x of [-.045, .045]) cube(group, ivory, [x, -.08, -.057], [.004, .15, .003]);
    cube(group, ivory, [0, -.08, -.059], [.19, .004, .002]);
    kit.oval(group, brass, [.022, -.058, -.061], [.014, .014, .002]);
  } else if (id === 'supply') {
    kit.lathe(group, accent, [[.023, 0], [.033, .015], [.033, .065], [.014, .087], [.014, .11]], [0, -.12, 0]);
    kit.lathe(group, leather, [[.016, 0], [.016, .018]], [0, -.015, 0]);
    cube(group, ivory, [0, -.07, -.033], [.036, .025, .002]);
  } else if (id === 'gear') {
    cube(group, accent, [0, -.1, 0], [.13, .20, .065]);
    for (let i = 0; i < 4; i++) cube(group, ivory, [0, -.18 + i * .05, -.034], [.13, .004, .002]);
  } else if (id === 'hooch') {
    kit.tube(group, leather, [[0, 0, 0], [.022, -.04, 0], [0, -.08, 0]], .003);
    kit.lathe(group, brass, [[.013, 0], [.016, .022], [.009, .045]], [0, -.11, 0]);
  }
  kit.bake(group); return group;
}
