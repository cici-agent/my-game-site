import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const palette = {
  brass:0xc4964c, gilded:0xe5c279, iron:0x404d4b, walnut:0x64402d, oak:0x98633d,
  leather:0x784730, darkLeather:0x483931, paper:0xe8dcba, cream:0xffefd0, ink:0x4a4237,
  teal:0x35645b, plum:0x744151
};

// Keep each rigid prop to a single draw call; movable pieces have their own pivot.
function sculpt(parent, draw) {
  const parts=[], p=new THREE.Vector3(), q=new THREE.Quaternion(), s=new THREE.Vector3();
  const transform=new THREE.Matrix4(), rotation=new THREE.Euler();
  function add(source,color,x,y,z,sx=1,sy=1,sz=1,rx=0,ry=0,rz=0) {
    const g=source.index?source.toNonIndexed():source;
    if (g!==source) source.dispose();
    g.deleteAttribute('uv');
    q.setFromEuler(rotation.set(rx,ry,rz));
    g.applyMatrix4(transform.compose(p.set(x,y,z),q,s.set(sx,sy,sz)));
    const rgb=new THREE.Color(color), colors=new Float32Array(g.attributes.position.count*3);
    for(let i=0;i<colors.length;i+=3)rgb.toArray(colors,i);
    g.setAttribute('color',new THREE.BufferAttribute(colors,3));
    parts.push(g);
  }
  const ops={
    add,
    box(c,x,y,z,w,h,d,rx=0,ry=0,rz=0){add(new THREE.BoxGeometry(1,1,1),c,x,y,z,w,h,d,rx,ry,rz);},
    oval(c,x,y,z,w,h,d,rx=0,ry=0,rz=0){add(new THREE.SphereGeometry(1,14,9),c,x,y,z,w,h,d,rx,ry,rz);},
    tube(c,a,b,r,topRadius=r){
      const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),delta=end.clone().sub(start);
      const middle=start.add(end).multiplyScalar(.5),orientation=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.clone().normalize());
      const e=new THREE.Euler().setFromQuaternion(orientation);
      add(new THREE.CylinderGeometry(topRadius,r,delta.length(),8),c,middle.x,middle.y,middle.z,1,1,1,e.x,e.y,e.z);
    },
    ring(c,x,y,z,rad,thickness,sx=1,sy=1,rx=0,ry=0,rz=0){add(new THREE.TorusGeometry(rad,thickness,7,36),c,x,y,z,sx,sy,1,rx,ry,rz);},
    tri(c,a,b,d){
      const g=new THREE.BufferGeometry();
      g.setAttribute('position',new THREE.Float32BufferAttribute([...a,...b,...d],3));g.computeVertexNormals();add(g,c,0,0,0);
    }
  };
  draw(ops);
  const geometry=mergeGeometries(parts);
  for(const part of parts)part.dispose();
  const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.82,side:THREE.DoubleSide}));
  mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);
}

function caseBody(g,w=.94,h=.48,d=.54) {
  const {walnut,leather,darkLeather,brass}=palette;
  g.box(walnut,0,h*.44,0,w,h*.87,d);
  g.box(leather,0,h*.95,0,w+.012,h*.21,d+.014);
  g.box(darkLeather,0,h*.82,0,w+.024,.027,d+.022);
  for(const sign of [-1,1]) {
    const x=w*.31*sign;
    g.box(darkLeather,x,h*.54,0,.068,h*1.08,d+.031);
    g.box(brass,x,h*.79,-d*.53,.085,.069,.022);
    g.box(leather,x,h*.80,-d*.554,.032,.037,.013);
    for(const edge of [-1,1])g.box(brass,w*.49*sign,.043,d*.47*edge,.065,.08,.065);
  }
  g.ring(darkLeather,0,h*.63,-d*.525,.067,.012,1.5,.58);
  g.box(brass,0,h*.9,-d*.535,.052,.083,.018);
}
function owl(g) {
  caseBody(g,.70,.36,.44);
  const h=.37;
  g.oval(0x9d744a,0,h+.247,.008,.156,.226,.13);
  g.oval(0xd6b880,0,h+.227,-.094,.119,.16,.051);
  for(const side of [-1,1]){
    g.oval(0x795c43,side*.122,h+.24,.028,.064,.171,.095,.19,0,side*.14);
    for(let i=0;i<3;i++)g.oval(i%2?0xccab77:0x986f4a,side*(.133+i*.011),h+.21-i*.025,-.039,.016,.082,.012,.14,0,side*.1);
    g.tube(0xad874f,[side*.077,h+.094,-.029],[side*.077,h+.025,-.044],.015);
    for(let i=-1;i<2;i++)g.tube(0xc5a069,[side*.077,h+.029,-.041],[side*.077+i*.024,h+.02,-.108],.013,.004);
  }
  g.oval(0xab8860,0,h+.451,0,.157,.149,.132);
  for(const side of [-1,1]) {
    g.oval(0xf0dbad,side*.058,h+.451,-.106,.071,.078,.03,0,0,-side*.24);
    g.oval(0xb28236,side*.062,h+.466,-.133,.033,.035,.011);
    g.oval(0x252b27,side*.062,h+.466,-.142,.022,.028,.008);
    g.oval(0xffecc2,side*.062-.006,h+.478,-.148,.007,.008,.004);
  }
  g.add(new THREE.ConeGeometry(.028,.073,5),0xa7864d,0,h+.404,-.145,1,1,1,Math.PI);
}
function toad(g) {
  const olive=0x65764c,moss=0x81905c,belly=0xc1b477;
  g.oval(olive,0,.163,.045,.24,.16,.253);
  g.oval(belly,0,.112,-.1,.202,.087,.132);
  g.oval(moss,0,.229,-.151,.23,.14,.16);
  for(const side of [-1,1]) {
    g.oval(olive,side*.18,.094,.089,.122,.083,.141,0,side*.3);
    g.oval(olive,side*.234,.052,-.076,.103,.042,.122);
    g.tube(moss,[side*.161,.181,-.124],[side*.19,.049,-.235],.032,.021);
    for(let i=-1;i<=1;i++)g.tube(0x858754,[side*.193,.034,-.218],[side*.201+i*.03,.02,-.31],.011,.005);
    g.oval(moss,side*.14,.322,-.183,.061,.073,.048);
    g.oval(0xdebb63,side*.142,.33,-.224,.041,.043,.02);
    g.oval(0x342f24,side*.142,.332,-.242,.027,.009,.006);
    g.oval(0x555a39,side*.103,.238,-.293,.012,.008,.014);
  }
  for(let i=0;i<9;i++) {
    const a=i*2.32;g.oval(0x576b49,.148*Math.sin(a),.297-.024*(i%3),.06+.162*Math.cos(a),.027,.012,.027);
  }
}
function tracks(g) {
  g.box(0x59675f,0,.012,0,.67,.022,1.35);
  for(const side of [-1,1])g.box(0xb49c6b,side*.296,.024,0,.012,.008,1.30);
  for(let i=0;i<4;i++) {
    const x=i%2?.095:-.104,z=-.47+i*.31;
    g.oval(0x9b9c71,x,.032,z,.064,.008,.053);
    for(let toe=0;toe<3;toe++) {
      const xx=x+(toe-1)*.035;
      g.tube(0xa0a079,[x,.033,z+.002],[xx,.034,z-.081+Math.abs(toe-1)*.013],.01,.013);
      g.oval(0xb4b18a,xx,.037,z-.082+Math.abs(toe-1)*.013,.018,.009,.022);
    }
  }
}
function stool(g) {
  g.add(new THREE.CylinderGeometry(.245,.235,.07,16),palette.oak,0,.46,0);
  for(let i=0;i<3;i++) {
    const a=i*Math.PI*2/3;
    g.tube(palette.walnut,[.215*Math.sin(a),.014,.215*Math.cos(a)],[.164*Math.sin(a),.44,.164*Math.cos(a)],.031,.037);
  }
}
function hat(g) {
  stool(g);
  g.oval(0x795638,0,.52,0,.305,.034,.255,-.045,0,-.03);
  const loops=[[.21,.52,0],[.182,.601,-.012],[.126,.772,.015],[.076,.876,-.023],[.034,.983,-.069],[.002,.999,-.16]];
  for(let row=0;row<loops.length-1;row++) {
    const [r,y,cx]=loops[row],[rr,yy,xx]=loops[row+1];
    for(let i=0;i<16;i++) {
      const a=i*Math.PI/8,b=(i+1)*Math.PI/8;
      const p=[cx+r*Math.cos(a),y,r*.92*Math.sin(a)],q=[cx+r*Math.cos(b),y,r*.92*Math.sin(b)];
      const u=[xx+rr*Math.cos(a),yy,rr*.92*Math.sin(a)],v=[xx+rr*Math.cos(b),yy,rr*.92*Math.sin(b)];
      const c=i%4===1?0x876142:0x795a41;g.tri(c,p,u,q);g.tri(c,q,u,v);
    }
  }
  for(const side of [-1,1]) {
    g.oval(0x47392e,side*.075,.667,-.139,.066,.013,.014,0,0,-side*.22);
    g.oval(0xa17a53,side*.075,.69,-.138,.076,.015,.018,0,0,-side*.22);
  }
  g.oval(0x44342c,0,.595,-.168,.079,.014,.012,0,0,-.04);
}
function smallTable(g) {
  for (const x of [-.24,.24])for(const z of [-.145,.145])g.box(palette.walnut,x,.26,z,.045,.52,.045);
  g.box(palette.oak,0,.53,0,.61,.052,.42);
  g.box(palette.brass,0,.50,-.157,.07,.033,.025);
}
function feather(g) {
  // The feather's origin is its centre so the player can aim it through a hoop.
  const h=.49;
  for (let i=0;i<14;i++) {
    const t=i/14,t2=(i+1)/14;
    const y=(t-.43)*h, yy=(t2-.43)*h;
    const bend=.12*t*t;
    const width=.092*Math.pow(Math.sin(Math.PI*t),.75);
    const nextWidth=.092*Math.pow(Math.sin(Math.PI*t2),.75);
    if(t>.06)for(const side of [-1,1]) {
      const tint=side===1?(i%2?0xe9f0db:0xd7e1cb):(i%2?0xbacfc3:0xc7d7cc);
      const outer=[bend+side*width,y+.016,-.009],next=[.12*t2*t2+side*nextWidth,yy+.012,-.008];
      g.tri(tint,[bend,y,0],outer,next);
      g.tri(tint,[bend,y,0],next,[.12*t2*t2,yy,0]);
    }
    g.tube(t<.25?0xc7a56e:0xe3cf9f,[bend,y,0],[.12*t2*t2,yy,0],.007-.003*t,.007-.003*t2);
  }
}
function hoop(g) {
  g.add(new THREE.CylinderGeometry(.26,.33,.065,8),palette.walnut,0,.034,0);
  g.tube(palette.brass,[0,.068,0],[0,1.086,0],.03,.024);
  g.ring(palette.gilded,0,1.4,0,.321,.024);
  g.ring(palette.oak,0,1.4,.003,.35,.008);
  g.oval(palette.brass,0,1.745,0,.039,.041,.029);
  g.oval(palette.gilded,.035,1.80,0,.025,.029,.025);
}
function book(g) {
  smallTable(g);
  const cover=0x5d4037;
  for(const side of [-1,1]) {
    g.box(cover,side*.142,.584,0,.302,.035,.374,0,0,side*.11);
    g.box(palette.paper,side*.138,.615,0,.269,.049,.351,0,0,side*.095);
    for(let i=0;i<5;i++){
      const x=side*.142;
      g.box(i===0?0x8c5842:0xb4a180,x,.644,-.116+i*.049,.153-(i%3)*.012,.004,.006,0,0,side*.095);
    }
  }
  g.box(palette.plum,.088,.649,.114,.024,.006,.139,0,0,.1);
  g.oval(palette.walnut,0,.584,0,.026,.028,.19);
}
function frame(g) {
  const wood=palette.walnut, brass=palette.brass;
  g.box(wood,0,.048,0,.91,.076,.11);
  g.box(wood,0,1.04,0,.91,.076,.11);
  for(const sign of [-1,1])g.box(wood,sign*.414,.551,0,.077,.986,.104);
  for(const sign of [-1,1]){
    g.box(brass,sign*.381,.546,-.059,.013,.937,.014);
    for(const y of [.069,1.027])g.box(brass,sign*.405,y,-.061,.082,.084,.015,0,0,.785);
  }
}
export function createProp(kind) {
  const group=new THREE.Group();
  group.name='prop-'+kind;
  if(kind==='feather' || kind==='ring' || kind==='frame') {
    if(kind==='feather')sculpt(group,smallTable);
    if(kind==='ring')sculpt(group,hoop);
    const moving=new THREE.Group();moving.name='movable';group.add(moving);
    if(kind==='frame') {
      sculpt(moving,frame);moving.rotation.z=.19;moving.position.set(.05,.063,0);
    } else {
      sculpt(moving,feather);
      if(kind==='feather'){moving.position.set(-.01,.703,-.012);moving.rotation.z=-.89;}
      else {moving.position.set(-.31,1.18,.49);moving.rotation.z=-.42;}
    }
  } else {
    const builders={owl,trunk:caseBody,tracks,toad,hat,book};
    if(builders[kind])sculpt(group,builders[kind]);
  }
  return group;
}
