import * as THREE from 'three';

// All dimensions are in the animated right arm's rest-pose space.
// The local Y axis runs from the pommel, through the palm, to the casting tip.
const PALM = new THREE.Vector3(.066, -.405, -.031);
const UP = new THREE.Vector3(0, 1, 0);
const ivory = 0xeee1c1;
const gold = 0xd8ac61;
const silver = 0xc7d2d0;
const amber = 0xecaa50;
const dark = 0x342c31;
const lengthByTier = [.333, .36, .38, .39, .405, .421, .436, .446, .46, .475];

const woods = {
  harry: {axis: [.65,.62,-.44], raw: 0x937351, polished: 0x514343, grip: 0x743f39, cloth: 0xa44948, metal: silver, end: 0x724331, sides: 7},
  ron: {axis: [.76,.50,-.44], raw: 0xab805e, polished: 0x955941, grip: 0x6e4130, cloth: 0xb86043, metal: gold, end: 0x99572e, sides: 4},
  hermione: {axis: [.52,.73,-.44], raw: 0xcbac82, polished: 0x4d5162, grip: 0x77454b, cloth: 0xaa4e58, metal: silver, end: 0xdfcfab, sides: 8},
  neville: {axis: [.58,.62,-.53], raw: 0xb09b6e, polished: 0x8d8054, grip: 0x66774e, cloth: 0xa6865e, metal: gold, end: 0xb9744d, sides: 6},
  george: {axis: [.70,.56,-.45], raw: 0xd2a767, polished: 0xc28e4e, grip: 0x814239, cloth: 0x9b5556, metal: gold, end: 0xd89552, sides: 7},
};

function wandFrame(item) {
  const palette = woods[item.hero] || woods.harry;
  const tier = Math.max(1, Math.min(10, Math.round(Number(item.tier) || 1)));
  const axis = new THREE.Vector3(...palette.axis).normalize();
  return {tier, palette, axis, length: lengthByTier[tier - 1]};
}

export function fittedWandTip(item) {
  const {axis, length} = wandFrame(item);
  return PALM.clone().addScaledVector(axis, length).toArray();
}

// Submit all primitives to the caller's single vertex-colored costume mesh.
function carvingTools(part, axis) {
  const rotation = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, axis));
  function stamp(geometry, color) {
    part.shape(geometry, color, PALM.x, PALM.y, PALM.z, 1, 1, 1, rotation.x, rotation.y, rotation.z);
  }
  function bar(color, start, end, base, tip = base, sides = 8) {
    const a = new THREE.Vector3(...start), b = new THREE.Vector3(...end);
    const step = b.clone().sub(a);
    const tube = new THREE.CylinderGeometry(tip, base, step.length(), sides);
    tube.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, step.normalize()));
    const center = a.lerp(b, .5);
    stamp(tube.translate(center.x, center.y, center.z), color);
  }
  function collar(color, y, r, h, sides = 10) {
    stamp(new THREE.CylinderGeometry(r, r, h, sides).translate(0, y, 0), color);
  }
  function bead(color, x, y, z, rx, ry, rz) {
    stamp(new THREE.SphereGeometry(1, 10, 6).scale(rx, ry, rz).translate(x, y, z), color);
  }
  function gem(color, x, y, z, rx, ry, rz) {
    stamp(new THREE.OctahedronGeometry(1).scale(rx, ry, rz).translate(x, y, z), color);
  }
  function box(color, x, y, z, w, h, d, turn = 0) {
    const block = new THREE.BoxGeometry(w, h, d).rotateZ(turn).translate(x, y, z);
    stamp(block, color);
  }
  function outline(color, points, depth, z = 0) {
    const shape = new THREE.Shape();
    shape.moveTo(...points[0]);
    for (const point of points.slice(1)) shape.lineTo(...point);
    shape.closePath();
    const form = new THREE.ExtrudeGeometry(shape, {depth, bevelEnabled: false, curveSegments: 3});
    stamp(form.translate(0, 0, z - depth/2), color);
  }
  function stroke(color, points, radius) {
    for (let i = 1; i < points.length; i++) bar(color, points[i-1], points[i], radius, radius, 5);
  }
  function wrap(color, low, high, radius, turns, width) {
    let prev = [radius, low, 0];
    const segments = Math.ceil(turns * 7);
    for (let i = 1; i <= segments; i++) {
      const t = i / segments, a = Math.PI*2*turns*t;
      const next = [radius*Math.cos(a), low+(high-low)*t, radius*Math.sin(a)];
      bar(color, prev, next, width, width, 5);
      prev = next;
    }
  }
  function faces(color, vertices) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(),3));
    g.computeVertexNormals();
    stamp(g,color);
  }
  function turned(color,profile,{x=0,y=0,z=0,tilt=0,depth=1,sides=12}={}) {
    const form=new THREE.LatheGeometry(profile.map(([r,h])=>new THREE.Vector2(r,h)),sides);
    stamp(form.scale(1,1,depth).rotateZ(tilt).translate(x,y,z),color);
  }
  return {bar, collar, bead, gem, box, outline, stroke, wrap, faces, turned};
}

// The figured outer staves meet at slight helical planing ridges. All metal
// lines follow the same swept profile as the wood, including its tip taper.
const finish = {
  harry:    {wood:[0x483330,0x61443a,0x553a34,0x6e4c3e], line:0xe6d4a2, fine:0xbfccce, sweep:-.015, angle:.25},
  ron:      {wood:[0x77412f,0x995434,0xa66941,0x8d472d], line:0xe5ba72, fine:0xa9bab1, sweep:.008, angle:-.40},
  hermione: {wood:[0x373947,0x494557,0x55505c,0x3e3d4d], line:0xe4d1a8, fine:0xc6d3da, sweep:-.008, angle:.6},
  neville:  {wood:[0x5b5942,0x777150,0x837951,0x625f44], line:0xd7b575, fine:0xa9b985, sweep:.019, angle:-.15},
  george:   {wood:[0x9a663b,0xbe8850,0xac7340,0x875738], line:0xf3c879, fine:0xadcdc1, sweep:-.018, angle:.95},
};

function polishedShaft(c, hero, palette, tier, length, offset) {
  const f=finish[hero] || finish.harry;
  const sides=hero==='ron' ? 8 : 10;
  // A shouldered ferrule thins into the shaft. The biggest part is concealed
  // by the grip. Every visible radius is smaller than the common lower tiers.
  const stations=[[.087,.027],[.103,.027],[.111,.024],[.125,.0175],[.143,.019],
    [.155,.018],[.18,.0157],[.22,.0144],[.267,.0126],[.313,.0104],[.36,.008],
    [(length+.36)/2,.0045],[length,0]];
  const center=(y)=>{
    const t=THREE.MathUtils.clamp((y-.087)/(length-.087),0,1);
    return [offset*(1-t)+f.sweep*Math.sin(Math.PI*t),y,.005*Math.sin(Math.PI*2*t)];
  };
  const ringPoint=(y,r,a)=>{
    const [x,,z]=center(y);
    return [x+r*Math.cos(a),y,z+r*Math.sin(a)];
  };
  for(let face=0;face<sides;face++) {
    const vertices=[];
    for(let i=1;i<stations.length;i++) {
      const [y0,r0]=stations[i-1], [y1,r1]=stations[i];
      const a0=(face/sides)*2*Math.PI+(y0-.087)*2, a1=(face/sides)*2*Math.PI+(y1-.087)*2;
      const step=2*Math.PI/sides;
      const a=ringPoint(y0,r0,a0), b=ringPoint(y0,r0,a0+step), d=ringPoint(y1,r1,a1);
      vertices.push(a,d,b);
      if(r1>0) vertices.push(b,d,ringPoint(y1,r1,a1+step));
    }
    c.faces(f.wood[face%4],vertices);
  }
  if(tier<9) return;
  const radiusAt=(y)=>{
    const i=stations.findIndex(([h])=>h>=y);
    const [a,ra]=stations[i-1], [b,rb]=stations[i];
    return THREE.MathUtils.lerp(ra,rb,(y-a)/(b-a));
  };
  function trace(angle, tint, narrow, fork=false) {
    const last=tier===10 ? .376 : .347, vertices=[];
    const count=tier===10 ? 19 : 15;
    for(let i=0;i<count;i++) {
      const t=i/(count-1);
      const y=.119+(last-.119)*t;
      const wave=hero==='neville' ? .36*Math.sin(t*8) : .15*Math.sin(t*7);
      const turn=angle+t*(hero==='ron' ? 1.8 : 3.8)+wave;
      // Paired strands split and meet like silver wire inlay. Both edges
      // remain on the wood, so the detail reads as an inlay at close range.
      const forkAngle=fork ? .55*Math.sin(t*Math.PI)**2 : 0;
      const r=radiusAt(y)+.0003;
      const width=narrow ? .085 : .147;
      vertices.push([ringPoint(y,r,turn+forkAngle-width),ringPoint(y,r,turn+forkAngle+width)]);
    }
    const sheet=[];
    for(let i=1;i<vertices.length;i++) {
      const [a,b]=vertices[i-1], [d,e]=vertices[i];
      sheet.push(a,d,b,b,d,e);
    }
    c.faces(tint,sheet);
  }
  // Three faces carry a long inlay so it still shows after freely rotating the hand.
  for(let i=0;i<3;i++) {
    const a=f.angle+i*2*Math.PI/3;
    trace(a,f.line,false);
    if(tier===10) trace(a+.19,f.fine,true,true);
  }
  for(const [y,r] of [[.126,.02],[.151,.021],[.177,.0174]]) {
    const [x,,z]=center(y);
    c.bar(tier===10 ? f.line : palette.metal,[x,y-.002,z],[x,y+.002,z],r,r,12);
  }
}

// Planed shafts retain the same logical tip on every rank. Rough blanks
// terminate in a flat sawn face. More refined pieces have a distinct taper.
function shaft(c, hero, p, tier, length) {
  if (tier === 1) {
    const square = ['ron','hermione','neville','george'].includes(hero);
    c.bar(p.raw, [0,-.106,0], [0,length,0], .022, .017, square ? 4 : 6);
    if (hero === 'harry') {
      c.bar(0x705538, [0,-.076,0], [0,.087,0], .024, .022, 6);
      c.bar(p.raw, [.012,.16,0], [.03,.185,.003], .012, .006);
    } else if (hero === 'george') {
      c.stroke(0x6b634f, [[-.01,.103,-.012],[.01,.108,-.012]], .002);
    }
    return;
  }
  const segments = tier < 4 ? Math.min(p.sides, 6) : p.sides;
  const wood = tier < 4 ? p.raw : p.polished;
  const offset = hero === 'george' && tier >= 5 ? .022 : 0;
  if (tier>=7) {
    c.bar(wood,[0,-.106,0],[offset,.092,0],.025,.025,segments);
    polishedShaft(c,hero,p,tier,length,offset);
  } else {
    c.bar(wood, [0,-.106,0], [offset,.115,0], .025, .024, segments);
    c.bar(wood, [offset,.114,0], [offset*.54,length*.67,0], .024, .014, segments);
    c.bar(wood, [offset*.54,length*.67,0], [0,length,0], .014, 0, segments);
  }
  if (tier === 2) {
    if (hero === 'hermione') c.box(p.raw, 0,-.095,0, .046,.028,.028, -.38);
    if (hero === 'neville') c.gem(p.raw, 0,-.112,0, .022,.029,.018);
    if (hero === 'george') c.bead(p.raw, -.014,-.109,0, .018,.024,.017);
    return;
  }
  if (tier === 3) {
    c.bar(p.cloth, [0,-.077,0], [0,.092,0], .029, .027, 9);
    c.wrap(hero === 'neville' ? 0xc4ab7f : p.grip, -.072,.089,.027, 3.5,.0055);
    if (hero === 'harry' || hero === 'neville') c.bead(p.cloth,.022,-.081,0,.013,.014,.011);
    if (hero === 'hermione') c.box(p.cloth,.012,-.114,0,.019,.047,.008,-.19);
    if (hero === 'george' || hero === 'ron') c.box(p.cloth,.02,-.081,-.008,.026,.034,.012,.23);
    return;
  }
  c.bar(p.grip, [0,-.09,0], [offset,.092,0], .028, .03, p.sides);
  c.collar(p.metal, .105, .029, .009, p.sides);
}

function simpleCap(c, hero, p) {
  switch (hero) {
    case 'ron':
      c.box(0xbb8857,0,-.109,0,.056,.041,.047);
      for (const x of [-.019,.019]) c.box(0xbb8857,x,-.136,0,.014,.018,.046);
      break;
    case 'hermione': c.bead(ivory,0,-.115,0,.03,.03,.026); break;
    case 'neville':
      c.bar(p.end,[0,-.143,0],[0,-.097,0],.021,.034,10);
      c.collar(0xcc9567,-.102,.036,.013);
      break;
    case 'george': c.bead(gold,-.015,-.119,0,.032,.025,.022); break;
    default: c.bead(0x52555a,0,-.116,0,.032,.025,.026);
  }
}

// A compact fret cage has real openings. It is used at the exposed collar,
// where the fingers cannot obscure the negative space at catalogue size.
function gallery(c, p, count, twist = 0) {
  c.collar(p.metal, .116,.043,.012,12);
  c.collar(p.metal, .183,.031,.009,12);
  for (let i = 0; i < count; i++) {
    const a = i*2*Math.PI/count;
    c.bar(p.grip,[.042*Math.cos(a),.12,.042*Math.sin(a)],
      [.03*Math.cos(a+twist),.182,.03*Math.sin(a+twist)],.0065,.005,6);
  }
}

function house(c, x, y, scale, wood) {
  const w = .028*scale, h = .05*scale;
  c.outline(wood,[[x-w,y],[x+w,y],[x+w,y+h*.65],[x,y+h],[x-w,y+h*.65]],w*1.3);
  c.box(amber,x,y+h*.36,-w*.71,w*.54,h*.27,.004);
  c.stroke(gold,[[x-w*1.1,y+h*.62,-w*.71],[x,y+h*1.07,-w*.71],[x+w*1.1,y+h*.62,-w*.71]],.003);
}

function windowFrame(c, y, open) {
  const left=-.032, right=.032;
  if (!open) c.outline(amber,[[left,y],[right,y],[right,y+.043],[0,y+.063],[left,y+.043]],.026);
  for (const z of [-.018,.018]) {
    c.stroke(gold,[[left,y,z],[left,y+.043,z],[0,y+.063,z],[right,y+.043,z],[right,y,z],[left,y,z]],.0048);
    if (!open) c.bar(0x916542,[0,y,z],[0,y+.058,z],.003);
  }
}

// A hollow, all-sided lantern. Slim arched mullions leave clear air around
// the faceted amber. The canopy, projecting eaves and pendant define its silhouette.
function homeLantern(c) {
  const pewter=0x887567, brass=0xdbb36c;
  c.turned(pewter,[[.014,-.118],[.019,-.112],[.013,-.105],[.027,-.098],[.026,-.088]],{sides:8});
  c.turned(pewter,[[.042,-.142],[.037,-.136],[.028,-.13],[.016,-.118],[.012,-.113]],{sides:8});
  c.collar(brass,-.141,.043,.005,8);
  c.turned(pewter,[[.005,-.217],[.014,-.211],[.019,-.205],[.03,-.201],[.032,-.194]],{sides:8});
  c.collar(brass,-.195,.033,.005,8);
  for(let i=0;i<4;i++) {
    const a=Math.PI/4+i*Math.PI/2, b=a+Math.PI/2;
    const point=(t,r,y)=>[r*Math.cos(t),y,r*Math.sin(t)];
    c.stroke(brass,[point(a,.029,-.194),point(a,.037,-.176),point(a,.039,-.141)],.0034);
    c.stroke(brass,[point(a,.038,-.161),point(a+.32,.038,-.153),point((a+b)/2,.036,-.148),
      point(b-.32,.038,-.153),point(b,.038,-.161)],.0027);
    c.bar(brass,point(a,.04,-.139),point(a,.015,-.116),.0021);
  }
  c.gem(0xffbb54,0,-.17,0,.021,.028,.021);
  c.gem(0xffdb83,-.008,-.166,-.011,.008,.015,.01);
  c.gem(amber,0,-.219,0,.007,.011,.007);
}

function harryCarving(c, p, tier) {
  switch (tier) {
    case 5:
      c.outline(p.grip,[[-.023,.028],[.018,.049],[.046,.11],[.023,.115],[-.011,.083],[-.024,.10]],.025);
      c.stroke(p.cloth,[[.032,.10,-.015],[.008,.061,-.015],[-.012,.053,-.015]],.004);
      break;
    case 6:
      c.bar(0xccad77,[0,.109,0],[0,.165,0],.024,.021);
      c.stroke(p.grip,[[-.021,.073,0],[-.042,.104,0],[-.031,.145,0],[0,.163,0]],.01);
      c.stroke(p.metal,[[.017,-.085,0],[.028,-.123,0],[.049,-.13,0]],.007);
      break;
    case 7:
      gallery(c,p,4,.6);
      c.outline(p.grip,[[-.025,-.074],[.025,-.074],[.041,-.141],[0,-.119],[-.041,-.141]],.02);
      break;
    case 8:
      windowFrame(c,-.169,false);
      c.collar(gold,-.109,.034,.012);
      c.collar(p.cloth,.128,.035,.035,8);
      for (const x of [-.023,.023]) c.gem(amber,x,.128,-.025,.008,.014,.006);
      break;
    case 9:
      c.stroke(silver,[[.001,.32,-.011],[.012,.25,-.011],[-.004,.19,-.019],[.018,.138,-.017],[.015,.093,-.026]],.0038);
      c.stroke(silver,[[.015,.093,-.026],[-.012,.037,-.027],[.012,-.043,-.027],[0,-.10,-.024]],.0038);
      windowFrame(c,-.153,true);
      break;
    case 10:
      c.outline(0x703936,[[-.022,-.089],[.018,-.086],[.031,.095],[.012,.13],[-.025,.094],[-.014,.032]],.039);
      homeLantern(c);
      for(const z of [-.023,.023]) {
        c.stroke(silver,[[-.023,.083,z],[-.027,.103,z],[0,.136,z],[.025,.105,z],[.025,.09,z]],.0034);
        c.gem(0xe9b361,0,.105,z,.009,.013,.005);
      }
      break;
  }
}

function ronCarving(c, p, tier) {
  switch (tier) {
    case 5:
      // The cut-out under the muzzle is a characteristic chess knight.
      c.outline(0xaf7948,[[-.03,-.08],[.021,-.082],[.042,-.119],[.035,-.152],[.011,-.157],
        [.015,-.134],[-.014,-.144],[-.037,-.16],[-.041,-.143],[-.029,-.119]],.037);
      c.gem(dark,.019,-.126,-.021,.005,.006,.004);
      break;
    case 6:
      for (const side of [-1,1]) c.box(side<0 ? 0xd9ba84 : 0x703f2d,side*.013,.121,0,.026,.062,.032);
      c.box(p.grip,0,-.11,0,.059,.025,.042);
      c.box(p.metal,0,-.13,0,.043,.014,.034);
      break;
    case 7:
      gallery(c,p,4);
      for (const x of [-.028,.028]) c.box(p.grip,x,-.112,0,.012,.073,.029);
      c.box(p.grip,0,-.147,0,.068,.012,.029);
      c.box(p.metal,.02,-.127,0,.025,.028,.03);
      break;
    case 8:
      c.collar(p.grip,-.112,.046,.049,8);
      c.collar(gold,-.116,.048,.009,8);
      c.box(ivory,-.016,-.139,-.016,.023,.026,.025);
      c.bead(p.cloth,.016,-.136,-.018,.012,.018,.012);
      c.collar(gold,.132,.033,.015,4);
      break;
    case 9:
      c.stroke(gold,[[0,.331,-.012],[0,.269,-.015],[.013,.269,-.015],[.013,.216,-.017],[-.01,.216,-.017],[-.01,.156,-.019],[.012,.156,-.021],[.012,.087,-.024]],.0034);
      c.outline(p.grip,[[-.028,-.082],[.026,-.083],[.037,-.123],[.012,-.156],[-.003,-.149],[.002,-.131],[-.034,-.152]],.04);
      c.collar(gold,-.091,.036,.009,4);
      break;
    case 10:
      house(c,-.021,-.177,1.08,0xb77750);
      house(c,.022,-.159,.88,0x974a3a);
      for (const [x,y] of [[-.021,-.177],[.022,-.159]]) {
        c.box(0x874e39,x+.012,y+.052,0,.01,.025,.014);
        c.stroke(0x52505a,[[x-.029,y+.03,0],[x,y+.059,0],[x+.03,y+.032,0]],.006);
        c.box(gold,x+.002,y+.012,-.02,.012,.014,.003);
      }
      c.collar(0xb08e62,-.093,.033,.009,8);
      for (let i=0;i<3;i++) for (let j=0;j<2;j++) c.box((i+j)%2?0xb46645:0xf1c991,(j-.5)*.023,.086+i*.023,-.026,.023,.023,.008);
      c.collar(gold,.157,.029,.008,4);
      break;
  }
}

function pages(c, y, count, size, edge) {
  for (let i=0;i<count;i++) {
    const x=(i-(count-1)/2)*.014;
    c.box(i%2 ? edge : ivory,x,y+i*.008,0,size,.059,.015+i*.008,(i-(count-1)/2)*.12);
  }
}

function hermioneCarving(c, p, tier) {
  switch (tier) {
    case 5:
      for (let i=0;i<3;i++) c.box(i===1 ? p.cloth : p.polished,-.02+i*.022,.078+i*.019,0,.029,.068,.037);
      break;
    case 6:
      c.box(0xc8aa7a,0,.117,0,.033,.077,.033);
      pages(c,-.118,2,.047,0x9a6a54);
      break;
    case 7:
      gallery(c,p,3,.39);
      for (let i=0;i<3;i++) {
        const y=-.088-i*.022;
        c.stroke(i===1 ? p.cloth : ivory,[[-.026,y,0],[-.044,y-.013,0],[-.025,y-.022,0]],.006);
      }
      break;
    case 8:
      c.bead(gold,0,-.125,0,.048,.049,.014);
      c.bead(0x4d5268,0,-.125,-.01,.039,.041,.009);
      for (let i=0;i<5;i++) {
        const a=(i+.4)*Math.PI/3;
        c.gem(ivory,.03*Math.cos(a),-.125+.03*Math.sin(a),-.017,.004,.005,.003);
      }
      c.stroke(gold,[[-.021,-.145,-.021],[.021,-.104,-.021]],.004);
      break;
    case 9:
      c.stroke(silver,[[0,.341,-.01],[.008,.269,-.012],[-.008,.225,-.017],[.01,.178,-.017],[.012,.114,-.026]],.004);
      pages(c,.10,3,.025,p.cloth);
      for (const s of [-1,1]) c.stroke(silver,[[s*.015,-.096,0],[s*.039,-.11,0],[s*.039,-.145,0],[s*.016,-.156,0]],.005);
      break;
    case 10:
      for (let i=0;i<5;i++) c.box(i%2?0x97545b:p.polished,-.034+i*.014,.077+i*.014,0,.022,.067,.035);
      // A real V-shaped open book, with parchment leaves and contrasting covers.
      for (const s of [-1,1]) {
        c.box(0x693b47,s*.028,-.132,.003,.067,.083,.014,s*.29);
        c.box(ivory,s*.026,-.127,-.009,.052,.07,.019,s*.29);
        c.stroke(silver,[[s*.007,-.093,-.021],[s*.013,-.152,-.021],[s*.044,-.163,-.021]],.0028);
      }
      c.bar(0xaf795a,[0,-.166,0],[0,-.111,0],.007,.009,8);
      c.box(p.cloth,-.012,-.175,-.001,.012,.029,.005,-.2);
      for (const side of [-1,1]) {
        for (const y of [-.123,-.136,-.146]) c.bar(0xa48c70,[side*.018,y,-.022],[side*.039,y-.003,-.022],.0019);
      }
      c.gem(0xae5664,0,.144,-.015,.012,.014,.009);
      break;
  }
}

function leaf(c, x, y, width, height, color, lean = 0, z = 0) {
  const tipX = x+lean, tipY=y+height;
  c.outline(color,[[x,y],[x-width+.28*lean,y+.3*height],[x-width*.62+.55*lean,y+.63*height],
    [tipX,tipY],[x+width*.7+.62*lean,y+.72*height],[x+width+.33*lean,y+.37*height]],.012,z);
  c.bar(0xc5b67b,[x,y,z-.009],[tipX,tipY,z-.009],.0028,.0018,5);
}

function nevilleCarving(c, p, tier) {
  switch (tier) {
    case 5:
      leaf(c,-.013,.071,.023,.086,p.grip,-.026);
      leaf(c,.013,.081,.021,.073,0x829550,.025);
      c.bead(0x75864a,0,-.119,0,.024,.043,.02);
      break;
    case 6:
      c.bar(0xc0ab77,[0,.098,0],[0,.163,0],.026,.021);
      c.wrap(0x79905c,.093,.135,.026,1.6,.0045);
      c.bead(0x87704e,0,-.114,0,.032,.023,.028);
      c.gem(0xbfa66e,.004,-.123,-.022,.014,.012,.008);
      break;
    case 7:
      for (const side of [-1,1]) {
        c.stroke(p.grip,[[0,.096,0],[side*.036,.123,-.007],[side*.042,.148,0],[side*.021,.175,.004],[0,.193,0]],.0055);
        c.bar(gold,[side*.036,.127,-.007],[side*.019,.162,-.004],.003);
      }
      leaf(c,0,-.095,.032,-.059,p.grip);
      break;
    case 8:
      c.collar(gold,-.094,.035,.016);
      c.gem(amber,0,-.131,0,.022,.035,.021);
      leaf(c,-.005,-.086,.017,-.071,p.grip,-.041);
      leaf(c,.005,-.086,.017,-.071,0x85975b,.041);
      break;
    case 9:
      c.stroke(0xd3bb76,[[.005,.336,-.01],[-.005,.276,-.013],[.01,.216,-.014],[-.01,.156,-.019],[.013,.114,-.024],[-.009,.055,-.027]],.0038);
      for (const s of [-1,1]) c.stroke(p.end,[[0,-.083,0],[s*.029,-.111,0],[s*.015,-.138,0],[s*.023,-.158,0]],.008);
      break;
    case 10:
      leaf(c,-.008,.075,.025,.105,0x76814a,-.037);
      leaf(c,.011,.078,.02,.079,0xa3aa70,.029);
      leaf(c,-.004,-.096,.019,-.084,p.grip,-.03,.009);
      leaf(c,.006,-.095,.017,-.077,0x97ab69,.033,.013);
      c.gem(0x8acdbb,0,-.158,-.009,.023,.047,.022);
      c.gem(0xc3eee0,-.006,-.158,-.019,.01,.019,.007);
      c.stroke(gold,[[-.029,-.145,.003],[-.028,-.178,0],[-.013,-.194,-.005]],.0029);
      c.stroke(0xb3bd78,[[.029,-.14,.003],[.033,-.169,0],[.014,-.185,.002]],.003);
      c.bar(gold,[0,-.105,0],[0,-.126,0],.006,.004);
      break;
  }
}

function georgeCarving(c, p, tier) {
  switch (tier) {
    case 5:
      c.bar(p.cloth,[0,.072,0],[.022,.132,0],.035,.028,8);
      c.box(p.metal,.035,.098,-.003,.032,.014,.047,-.25);
      c.bead(p.grip,-.019,-.123,0,.024,.038,.02);
      break;
    case 6:
      c.outline(0xe3be7e,[[-.029,.06],[.012,.062],[.037,.156],[.013,.146]],.038);
      c.outline(p.grip,[[.012,.062],[.038,.085],[.037,.156]],.036);
      c.bead(p.grip,-.011,-.122,0,.024,.03,.025);
      c.bead(0xddac6b,.012,-.12,0,.018,.029,.024);
      break;
    case 7:
      c.stroke(p.grip,[[-.024,.115,0],[-.048,.13,0],[-.042,.152,0],[-.024,.143,0]],.0065);
      c.stroke(p.grip,[[.014,.128,0],[.053,.139,0],[.055,.16,0],[.025,.152,0]],.0065);
      c.stroke(gold,[[-.025,-.113,0],[.004,-.146,0],[.033,-.134,0],[.04,-.114,0]],.008);
      break;
    case 8:
      c.bead(gold,0,-.12,0,.045,.037,.02);
      c.bead(ivory,-.005,-.122,-.013,.033,.022,.012);
      c.bead(dark,.005,-.124,-.023,.013,.015,.007);
      c.collar(gold,.117,.039,.019);
      c.box(p.grip,.045,.118,0,.026,.018,.021,.19);
      break;
    case 9:
      c.stroke(gold,[[.003,.337,-.011],[-.005,.278,-.014],[.019,.219,-.013],[.002,.158,-.02],[.031,.106,-.021]],.0038);
      c.bead(p.grip,0,-.128,0,.043,.041,.02);
      for (const x of [-.015,.018]) c.bead(ivory,x,-.117,-.019,.005,.008,.004);
      c.stroke(gold,[[-.024,-.135,-.017],[0,-.15,-.02],[.027,-.128,-.016]],.004);
      break;
    case 10:
      for (const s of [-1,1]) c.outline(s<0 ? p.grip : 0x593d39,[[s*.003,.058],[s*.04,.108],[s*.052,.15],[s*.014,.13]],.039);
      c.gem(amber,.004,.113,-.023,.012,.014,.008);
      // Tilt the entire top-hat profile, brim and silk band together.
      const tipped={x:-.006,y:-.137,tilt:-.27,depth:.77,sides:14};
      c.turned(0x54434c,[[0,-.062],[.035,-.062],[.036,-.057],[.029,-.034],[.03,-.012],
        [.034,0],[.054,.003],[.058,.008],[.049,.009],[.028,.006],[0,.006]],tipped);
      c.turned(0xe3bc7a,[[.031,-.021],[.032,-.017],[.034,-.007]],tipped);
      c.stroke(0x8fc5b3,[[.029,-.153,-.016],[.04,-.126,-.012],[.04,-.112,-.005]],.0032);
      c.gem(0x7fb0a3,.03,-.15,-.018,.008,.01,.005);
      break;
  }
}

const carvings = {harry: harryCarving, ron: ronCarving, hermione: hermioneCarving, neville: nevilleCarving, george: georgeCarving};

export function drawFittedWand(part, item) {
  const {tier, palette, axis, length} = wandFrame(item);
  const c = carvingTools(part, axis);
  shaft(c, item.hero, palette, tier, length);
  if (tier === 4) simpleCap(c, item.hero, palette);
  if (tier >= 5) (carvings[item.hero] || harryCarving)(c, palette, tier);
}
