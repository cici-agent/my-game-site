import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { sagaLayout, buildSagaMap } from './saga-world.mjs';
import { TRAIN_LAYOUT, TRAIN_FURNITURE_PARTS, getTrainNavigation } from '../chapter-one/train-layout.mjs';

const TAU = Math.PI * 2;
const V = (x,y,z) => new THREE.Vector3(x,y,z);
const brass = '#b58b4d', cream = '#e7d5ad', iron = '#27463f', dark = '#243635';
const wood = '#70482e', oak = '#926444', lamp = '#ffe4a3';

const maps = {
  'kings-cross': {spawn:[0,7.5],bounds:[-7.8,7.8,-10,10],npc:[-.9,2.9],inspect:[3.9,-2.4],exit:[0,-9.4],target:[-2.8,-5.7]},
  platform: {spawn:[.1,7.8],bounds:[-3.1,5.2,-12,10],npc:[-.7,3],inspect:[2.7,-2.3],exit:[-2.7,-8.6],target:[.7,-5.4]},
  express: {spawn:TRAIN_LAYOUT.spawn,bounds:TRAIN_LAYOUT.bounds,npc:[-.3,2.6],inspect:[.85,-2.3],exit:[0,-8.6],target:[-.8,-5.1]},
  lake: {spawn:[0,6.7],bounds:[-3.05,3.05,-12.2,8.8],npc:[-.6,2.4],inspect:[1.7,-8.65],exit:[0,-11.4],target:[-2.7,-3.45]},
  sorting: {spawn:[0,7.6],bounds:[-7,7,-10,9.3],npc:[-.7,2.9],inspect:[2.2,-2.8],exit:[0,-9],target:[-1.4,-5.7]},
  charms: {spawn:[0,6.6],bounds:[-6.3,6.3,-8.3,8.4],npc:[-.65,2.1],inspect:[1.75,-1.7],exit:[0,-7.8],target:[-.9,-4.2]},
  'team-puzzle': {spawn:[0,6.6],bounds:[-5.3,5.3,-8.6,8.4],npc:[-.55,2.1],inspect:[2.1,-1.5],exit:[0,-8],target:[-1.45,-4.45]},
  'library-record': {spawn:[0,7.3],bounds:[-6.7,6.7,-9.7,9.2],npc:[-.7,2.4],inspect:[2.3,-2.1],exit:[0,-9],target:[-1.45,-5.3]},
  'trapdoor-return': {spawn:[0,6.8],bounds:[-5.2,5.2,-9,8.8],npc:[-.55,2.1],inspect:[2,-1.9],exit:[0,-8.45],target:[-1.5,-4.8]},
  'troll-washroom': {spawn:[0,6.8],bounds:[-6.3,6.3,-9.7,9],npc:[0,-2],inspect:[2.8,-3.3],exit:[0,-8.65],target:[4.9,4.9]},
  'practice-gallery': {spawn:[0,6.8],bounds:[-6.3,6.3,-9.65,9],npc:[-3.2,0],inspect:[2.8,-3.3],exit:[0,-8.6],target:[4.9,4.9]},
};
const seedRandom = seed => () => {
  seed = (Math.imul(1664525,seed) + 1013904223) >>> 0;
  return seed / 4294967296;
};

class Workshop {
  constructor(group) {
    this.root = group;
    this.layers = new THREE.Group();
    group.add(this.layers);
    this.geometries = new Map();
    this.materials = new Map();
    this.instances = new Map();
    this.textures = [];
    this.ticks = [];
    this.walls = [];
    this.matrix = new THREE.Object3D();
    this.random = seedRandom(19910901);
    this.disposables = [];
    this.nested = [];
  }
  geo(key,make) {
    if (!this.geometries.has(key)) this.geometries.set(key,make());
    return this.geometries.get(key);
  }
  material(tint) {
    if (tint.isMaterial) return tint;
    if (!this.materials.has(tint)) this.materials.set(tint,new THREE.MeshStandardMaterial({color:tint,roughness:.82}));
    return this.materials.get(tint);
  }
  customMaterial(key,properties,unlit=false) {
    if (!this.materials.has(key)) this.materials.set(key,unlit?new THREE.MeshBasicMaterial(properties):new THREE.MeshStandardMaterial(properties));
    return this.materials.get(key);
  }
  place(mesh,material,x,y,z,w,h,d,rx=0,ry=0,rz=0) {
    const mat=this.material(material),key=mesh.uuid+mat.uuid;
    if(!this.instances.has(key)) this.instances.set(key,{mesh,mat,transforms:[]});
    const m=this.matrix;
    m.position.set(x,y,z);m.rotation.set(rx,ry,rz);m.scale.set(w,h,d);m.updateMatrix();
    this.instances.get(key).transforms.push(m.matrix.clone());
  }
  box(x,y,z,w,h,d,mat,rx=0,ry=0,rz=0) {this.place(this.geo('box',()=>new THREE.BoxGeometry()),mat,x,y,z,w,h,d,rx,ry,rz);}
  cylinder(x,y,z,radius,height,mat,rx=0,ry=0,rz=0,ratio=1,sides=16) {
    const shape=this.geo('cyl'+sides+':'+ratio,()=>new THREE.CylinderGeometry(ratio,1,1,sides));
    this.place(shape,mat,x,y,z,radius,height,radius,rx,ry,rz);
  }
  ball(x,y,z,rx,ry,rz,mat) {
    this.place(this.geo('sphere',()=>new THREE.SphereGeometry(1,16,12)),mat,x,y,z,rx,ry,rz);
  }
  beam(a,b,width,mat,depth=width) {
    const p=V(...a),q=V(...b),direction=q.clone().sub(p),length=direction.length();
    const e=new THREE.Euler().setFromQuaternion(new THREE.Quaternion().setFromUnitVectors(V(0,1,0),direction.normalize()));
    p.lerp(q,.5);this.box(p.x,p.y,p.z,width,length,depth,mat,e.x,e.y,e.z);
  }
  arch(x,y,z,rx,ry,width,mat) {
    const points=Array.from({length:19},(_,i)=>[x+rx*Math.cos(i*Math.PI/18),y+ry*Math.sin(i*Math.PI/18),z]);
    for(let i=1;i<points.length;i++) this.beam(points[i-1],points[i],width,mat);
  }
  texture(key,w,h,draw) {
    const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);
    const tx=new THREE.CanvasTexture(c);tx.colorSpace=THREE.SRGBColorSpace;tx.anisotropy=4;
    this.textures.push(tx);return tx;
  }
  tiled(key,w,h,draw,xRepeat,zRepeat) {
    const identity=[key,xRepeat,zRepeat].join('/');
    if(this.materials.has(identity))return this.materials.get(identity);
    const tx=this.texture(key,w,h,draw);
    tx.wrapS=tx.wrapT=THREE.RepeatWrapping;tx.repeat.set(xRepeat,zRepeat);
    return this.customMaterial(identity,{map:tx,roughness:.91,side:THREE.DoubleSide});
  }
  panel(x,y,z,w,h,mat,ry=0,rx=0) {
    this.place(this.geo('panel',()=>new THREE.PlaneGeometry(1,1)),mat,x,y,z,w,h,1,rx,ry);
  }
  sign(x,y,z,w,h,title,options={}) {
    const {sub='',bg='#183b35',fg='#f2e2bc',rotate=0}=options;
    const k='sign:'+title+sub+bg+fg;
    let m=this.materials.get(k);
    if(!m) {
      const tx=this.texture(k,768,Math.max(124,Math.round(768*h/w)),(c,W,H)=>{
        c.fillStyle=bg;c.fillRect(0,0,W,H);c.strokeStyle='#cbac73';c.lineWidth=Math.max(3,H*.024);
        c.strokeRect(9,8,W-18,H-16);c.lineWidth=1.5;c.strokeRect(15,14,W-30,H-28);
        c.fillStyle=fg;c.textAlign='center';c.textBaseline='middle';
        c.font='bold '+Math.floor(H*(sub?.42:.67))+'px Georgia, serif';c.fillText(title,W/2,H*(sub?.40:.515),W*.86);
        if(sub){c.font='600 '+Math.floor(H*.15)+'px Georgia, serif';c.fillText(sub,W/2,H*.74,W*.8);}
      });
      m=this.customMaterial(k,{map:tx,side:THREE.DoubleSide,roughness:.7});
    }
    this.panel(x,y,z,w,h,m,rotate);
  }
  lamp(x,y,z,scale=1,pedestal=false) {
    const s=scale;
    if(pedestal){
      this.cylinder(x,.14*s,z,.25*s,.28*s,iron);
      this.cylinder(x,y*.47,z,.072*s,y*.9,iron);
      this.cylinder(x,y-.42*s,z,.17*s,.13*s,brass);
    }
    this.cylinder(x,y-.15*s,z,.24*s,.15*s,iron,0,0,0,.72,6);
    this.cylinder(x,y+.13*s,z,.19*s,.47*s,this.glow,0,0,0,1.2,6);
    for(let i=0;i<6;i++){
      const a=TAU*i/6;this.cylinder(x+.21*s*Math.cos(a),y+.13*s,z+.21*s*Math.sin(a),.014*s,.47*s,iron,0,0,0,1,5);
    }
    this.cylinder(x,y+.48*s,z,.29*s,.27*s,iron,0,0,0,.15,6);
    this.ball(x,y+.67*s,z,.05*s,.085*s,.05*s,brass);
  }
  shadow(x,z,width,depth,intensity=.45,angle=0){
    const key='contact '+intensity;
    let mat=this.materials.get(key);
    if(!mat){
      const tx=this.texture(key,96,96,(c,W,H)=>{
        const g=c.createRadialGradient(W/2,H/2,0,W/2,H/2,W/2);
        g.addColorStop(0,'rgba(34,28,22,.9)');g.addColorStop(.43,'rgba(40,34,24,.68)');g.addColorStop(1,'rgba(40,34,24,0)');
        c.fillStyle=g;c.fillRect(0,0,W,H);
      });
      mat=this.customMaterial(key,{map:tx,transparent:true,opacity:intensity,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2},true);
    }
    this.place(this.geo('panel',()=>new THREE.PlaneGeometry(1,1)),mat,x,.041,z,width,depth,1,-Math.PI/2,0,angle);
  }
  bench(x,z,angle=0) {
    this.shadow(x,z,2.9,1.28,.5,angle);
    const p=(dx,dz)=>[x+dx*Math.cos(angle)+dz*Math.sin(angle),z-dx*Math.sin(angle)+dz*Math.cos(angle)];
    const part=(dx,y,dz,w,h,d,mat)=>{const [px,pz]=p(dx,dz);this.box(px,y,pz,w,h,d,mat,0,angle);};
    for(const dx of [-.81,.81])for(const dz of [-.21,.21])part(dx,.25,dz,.09,.5,.09,iron);
    for(const dz of [-.22,-.07,.08,.23])part(0,.52,dz,2.08,.1,.12,wood);
    for(const dx of [-.85,.85])part(dx,.82,-.26,.07,.68,.075,iron);
    for(const y of [.8,1.03])part(0,y,-.28,2.06,.16,.075,oak);
  }
  chest(x,y,z,w=1,d=.58,h=.54,tint=wood) {
    if(y===0)this.shadow(x,z,w*1.65,d*1.85,.5);
    this.box(x,y+h/2,z,w,h,d,tint);
    for(const s of [-1,1]){
      this.box(x+s*w*.33,y+h/2,z,w*.055,h+.025,d+.025,brass);
      this.box(x+s*(w*.5-.065),y+.06,z,.14,.12,d+.018,'#b79b68');
      this.box(x+s*(w*.5-.065),y+h-.05,z,.14,.1,d+.018,'#b79b68');
    }
    this.box(x,y+h*.64,z,w+.014,.029,d+.014,'#382b22');
    this.box(x,y+h*.58,z+d*.51,.12,.14,.04,brass);
  }
  bufferWall(x,z,w,d,height=3) {this.walls.push({x,z,w,d,height});}
  finish() {
    for(const {mesh,mat,transforms} of this.instances.values()){
      const batch=new THREE.InstancedMesh(mesh,mat,transforms.length);
      transforms.forEach((m,i)=>batch.setMatrixAt(i,m));batch.computeBoundingSphere();
      batch.receiveShadow=true;
      this.layers.add(batch);this.disposables.push(batch);
    }
  }
  dispose() {
    this.root.remove(this.layers);
    for(const other of this.nested)other.dispose();
    for(const mesh of this.disposables)mesh.dispose();
    for(const geometry of this.geometries.values())geometry.dispose();
    for(const material of this.materials.values())material.dispose();
    for(const texture of this.textures)texture.dispose();
    this.layers.clear();
  }
}

function masonry(c,w,h) {
  const rnd=seedRandom(57);c.fillStyle='#a39a88';c.fillRect(0,0,w,h);
  const hues=['#966a51','#99664d','#a8775c','#a27053','#935d45','#ac7b62','#a4755c'];
  const bw=w/4,bh=h/6;
  for(let row=0;row<6;row++)for(let col=-1;col<5;col++){
    const x=col*bw+(row%2)*bw/2,y=row*bh;
    c.fillStyle=hues[Math.floor(rnd()*hues.length)];c.fillRect(x+1.5,y+1.5,bw-3,bh-3);
    c.fillStyle='#ffffff19';c.fillRect(x+2,y+2,bw-4,2);
    c.fillStyle='#2f1e1233';c.fillRect(x+2,y+bh-4,bw-3,2);
  }
  for(let i=0;i<3500;i++){c.fillStyle=rnd()>.5?'#ffefcb12':'#352d2118';c.fillRect(rnd()*w,rnd()*h,1+rnd()*2,1);}
}
function floorTile(c,w,h) {
  const rnd=seedRandom(249);c.fillStyle='#7c786c';c.fillRect(0,0,w,h);
  for(let y=0;y<4;y++)for(let x=-1;x<4;x++){
    const i=Math.floor(rnd()*5),p=['#bfb49d','#bdb49f','#c4baa6','#b6ae9d','#c8beaa'][i],left=x*w/3+(y%2)*w/6,top=y*h/4;
    c.fillStyle=p;c.fillRect(left+1,top+1,w/3-2,h/4-2);c.fillStyle='#eae3ce';c.fillRect(left+1,top+1,w/3-3,1);
  }
  for(let i=0;i<1200;i++){c.fillStyle=rnd()>.5?'#fff8df24':'#564a3940';c.fillRect(rnd()*w,rnd()*h,1,1);}
}
function brick(w,x,y,z,width,height,angle=0) {
  const m=w.tiled('brick',256,192,masonry,width/3,height/1.5);w.panel(x,y,z,width,height,m,angle);
}
function floor(w,width,depth,x=0,z=0) {
  const m=w.tiled('flagstone',240,240,floorTile,width/4,depth/4);w.panel(x,.004,z,width,depth,m,0,-Math.PI/2);
}
function stationClock(w,x,y,z,r=1) {
  const key='railway-clock';
  let mat=w.materials.get(key);
  if(!mat){
    const tx=w.texture(key,384,384,(c,W)=>{
      const radius=W/2;c.translate(radius,radius);c.fillStyle='#eadfbc';c.beginPath();c.arc(0,0,radius,0,TAU);c.fill();
      for(let n=0;n<60;n++){const a=n*TAU/60;c.save();c.rotate(a);c.strokeStyle='#29392e';c.lineWidth=n%5===0?5:1.6;c.beginPath();c.moveTo(0,-radius*.91);c.lineTo(0,-radius*(n%5===0?.78:.85));c.stroke();c.restore();}
      c.fillStyle='#27372d';c.font='bold 27px Georgia';c.textAlign='center';c.textBaseline='middle';
      for(let n=1;n<=12;n++){const a=n*TAU/12;c.fillText(n,Math.sin(a)*radius*.67,-Math.cos(a)*radius*.67);}
      c.lineWidth=10;c.lineCap='round';c.beginPath();c.moveTo(0,0);c.lineTo(-radius*.39,-radius*.13);c.stroke();
      c.lineWidth=6;c.beginPath();c.moveTo(0,0);c.lineTo(radius*.08,-radius*.76);c.stroke();c.beginPath();c.arc(0,0,9,0,TAU);c.fill();
    });
    mat=w.customMaterial(key,{map:tx,side:THREE.DoubleSide});
  }
  w.cylinder(x,y,z,r*1.08,.16,brass,Math.PI/2);
  w.place(w.geo('clockface',()=>new THREE.CircleGeometry(1,48)),mat,x,y,z+.09,r,r,1);
}
function vault(w,width,start,end,colY,rise,bays) {
  const n=9,pts=[];
  for(let j=0;j<=n*2;j++){const a=Math.PI*j/(n*2);pts.push([width*.5*Math.cos(a),colY+rise*Math.sin(a)]);}
  const metal='#355047',light='#638070';
  for(let i=0;i<=bays;i++){
    const z=start+(end-start)*i/bays;
    for(const x of [-width*.5,width*.5]){
      w.box(x,colY/2,z,.25,colY,.27,metal);w.box(x,.33,z,.58,.66,.55,metal);
      w.box(x,colY-.38,z,.55,.2,.53,brass);
    }
    for(let j=1;j<pts.length;j++){
      const [ax,ay]=pts[j-1],[bx,by]=pts[j];
      w.beam([ax,ay,z],[bx,by,z],.16,metal);
      w.beam([ax,ay-.42,z],[bx,by-.42,z],.09,metal);
      w.beam([ax,ay-.42,z],[bx,by,z],.055,light);
    }
  }
  for(let j=0;j<pts.length;j++){
    const [x,y]=pts[j];w.box(x,y,(start+end)/2,.09,.09,end-start,light);
    if(j===0)continue;
    const [ax,ay]=pts[j-1],length=Math.hypot(x-ax,y-ay);
    w.box((x+ax)/2,(y+ay)/2+.11,(start+end)/2,length,.035,end-start,w.glass,0,0,Math.atan2(y-ay,x-ax));
  }
}
function flowerPot(w,x,z,s=1){
  w.shadow(x,z,s*1.7,s*1.7,.55);
  w.cylinder(x,.32*s,z,.49*s,.64*s,'#925d46',0,0,0,.78,12);
  w.cylinder(x,.61*s,z,.48*s,.12*s,'#a77653');
  for(let i=0;i<9;i++){
    const a=TAU*i/9;w.ball(x+Math.cos(a)*.17*s,.9*s+(i%3)*.12,z+Math.sin(a)*.17*s,.18*s,.42*s,.2*s,i%2?'#41694d':'#61805b');
  }
}
function tracks(w,x,depth=44) {
  w.box(x,-.33,0,3,.38,depth,'#564e43');
  for(let z=-depth/2;z<depth/2;z+=.66)w.box(x,-.12,z,2.6,.15,.21,'#6c5746');
  for(const dx of [-.77,.77]){w.box(x+dx,-.03,0,.13,.19,depth,'#4c504a');w.box(x+dx,.065,0,.17,.045,depth,'#a7a79a');}
}
function archWindow(w,x,y,z,rx,ry) {
  const outline=new THREE.Shape();outline.moveTo(-rx,0);
  for(let n=0;n<=36;n++){const a=Math.PI-n*Math.PI/36;outline.lineTo(rx*Math.cos(a),ry*Math.sin(a));}
  outline.closePath();
  const sky=w.customMaterial('high window',{color:'#c5d5ce',emissive:'#c4c4a0',emissiveIntensity:.27,side:THREE.DoubleSide});
  w.place(w.geo('lunette '+rx+' '+ry,()=>new THREE.ShapeGeometry(outline)),sky,x,y,z,1,1,1);
  w.arch(x,y,z+.05,rx,ry,.12,iron);
  w.arch(x,y,z+.075,rx*.63,ry*.62,.06,iron);
  w.box(x,y,z+.07,rx*2,.12,.13,iron);
  for(let i=1;i<10;i++){
    const a=Math.PI*i/10;w.beam([x,y,z+.085],[x+Math.cos(a)*rx,y+Math.sin(a)*ry,z+.085],.057,iron);
  }
}
function castRoofShadows(w,z,sizeX,sizeZ,centerX=0) {
  const tx=w.texture('vaultshade',512,768,(c,W,H)=>{
    const cast=c.createLinearGradient(0,0,W,H*.18);cast.addColorStop(0,'rgba(41,49,38,.46)');
    cast.addColorStop(.33,'rgba(55,48,36,.11)');cast.addColorStop(.7,'rgba(51,44,37,.02)');cast.addColorStop(1,'rgba(40,44,35,.39)');
    c.fillStyle=cast;c.fillRect(0,0,W,H);
    c.strokeStyle='rgba(41,48,42,.23)';c.lineWidth=5;
    for(let i=-5;i<13;i++){c.beginPath();c.moveTo(0,i*86);c.lineTo(W,i*86+112);c.stroke();}
    c.lineWidth=1.9;c.strokeStyle='rgba(36,42,35,.18)';
    for(let i=-3;i<10;i++){c.beginPath();c.moveTo(i*100,0);c.lineTo(i*100-160,H);c.stroke();}
  });
  w.panel(centerX,.026,z,sizeX,sizeZ,w.customMaterial('vaultshade',{map:tx,transparent:true,depthWrite:false},true),0,-Math.PI/2);
}
function terminal(w) {
  floor(w,19,33,0,.3);castRoofShadows(w,.3,18.9,32.9);w.box(0,-.22,.3,19,.42,33,'#98856a');
  for(const x of [-9.5,9.5]){
    brick(w,x,3.55,-.5,32,7.1,x<0?Math.PI/2:-Math.PI/2);
    for(let z=-12;z<15;z+=4){
      w.box(x*.993,2.9,z,.24,5.8,.27,cream);
      w.lamp(x*.972,3.15,z+.6,.82);
    }
  }
  brick(w,0,3.95,-11.4,19,7.9);
  for(const y of [1,3.35,5.5,7.65])w.box(0,y,-11.33,19,.14,.23,cream);
  for(const x of [-8.7,-6,-1.5,1.5,6,8.7])w.box(x,3.78,-11.29,.29,7.55,.27,cream);
  w.box(0,2.25,-11.03,2.55,4.5,.44,'#8d664c');brick(w,0,2.33,-10.8,2.45,4.46);
  w.arch(0,3.45,-10.69,1.33,1.55,.16,cream);
  for(const x of [-3.7,3.7]){
    w.box(x,2.23,-11.2,3.92,4.46,.33,'#456252');
    w.box(x,2.27,-10.99,3.49,4.2,.1,'#536f5f');
    for(const dx of [-1.36,-.65,0,.65,1.36])w.box(x+dx,2.23,-10.91,.045,4.05,.07,cream);
    for(const yy of [.62,1.45,2.24,3.02,3.83])w.box(x,yy,-10.9,3.43,.042,.065,cream);
    w.arch(x,4.43,-10.92,2,1.12,.18,cream);
  }
  archWindow(w,0,7.8,-11.35,8.4,2.8);
  w.sign(0,6.66,-11.13,5.35,.8,'KING’S CROSS');
  for(const [x,main,sub] of [[-7.45,'YORK','NORTH EASTERN'],[7.45,'EDINBURGH','NORTH BRITISH']]) {
    w.sign(x,2.29,-11.12,1.45,2.15,main,{sub,bg:x<0?'#a46548':'#627c74',fg:'#f9e8b8'});
  }
  stationClock(w,0,4.79,-10.45,.70);
  for(const [x,title] of [[-4.05,'9'],[4.05,'10']]){
    w.box(x,5,-6.55,.045,2,.045,iron);w.sign(x,3.6,-6.55,1.52,1.72,title,{sub:'PLATFORM'});
  }
  vault(w,18.1,-12.1,15,6.4,4.15,7);
  for(const x of [-5.4,5.4]){
    for(const z of [-7.9,4.1]){
      w.bench(x,z);w.bufferWall(x,z,2.12,.6,1.2);
    }
  }
  for(const [x,z] of [[-7.25,-1],[6.75,6],[-6.7,-7.6]]){
    w.chest(x,0,z,1.16,.61,.65);w.chest(x+.07,.65,z,.8,.54,.38,'#6f4438');
    w.bufferWall(x,z,1.18,.65,1.1);
  }
  const sx=5.3,sz=-3.65;
  w.box(sx,.87,sz,.12,1.74,.12,iron);
  w.sign(sx,2.02,sz,2.02,1.23,'DEPARTURES',{sub:'LONDON  •  11:00'});
  for(const x of [-7.35,7.35]){flowerPot(w,x,-9.5);w.lamp(x,2.45,1.25,1,true);}
  for(const x of [-3.5,3.5])w.box(x,.017,.1,.075,.014,28,'#a18c5f');
}
function locomotive(w,x,z) {
  const wine='#9b352a',ruby='#ba4432',black='#303332',edge='#d0a561';
  const axle=(xx,yy,zz,rr,thick,mat)=>w.cylinder(xx,yy,zz,rr,thick,mat,0,0,Math.PI/2,1,20);
  w.box(x,.69,z,2.25,.5,6.35,black);w.box(x,1,z,2.5,.13,6.68,'#a44332');
  w.cylinder(x,1.63,z-.28,.81,4.17,wine,Math.PI/2,0,0,1,28);
  for(const zz of [-2.35,-1.65,-.55,.55,1.72])w.cylinder(x,1.63,z+zz,.83,.07,edge,Math.PI/2,0,0,1,28);
  w.cylinder(x,1.64,z+2.36,.82,1.19,black,Math.PI/2,0,0,1,28);
  w.cylinder(x,1.64,z+2.98,.7,.14,'#525548',Math.PI/2);
  w.cylinder(x,1.64,z+3.07,.16,.12,brass,Math.PI/2);
  w.box(x,.8,z+3.23,2.68,.34,.21,ruby);
  for(const dx of [-.91,.91])w.cylinder(x+dx,.82,z+3.48,.19,.38,black,Math.PI/2);
  w.cylinder(x,2.85,z+2.13,.27,.89,black,0,0,0,1.12);
  w.cylinder(x,3.3,z+2.13,.38,.16,brass);
  w.cylinder(x,2.49,z-.4,.38,.36,edge);w.ball(x,2.68,z-.4,.38,.27,.38,edge);
  for(const dx of [-.99,.99]){
    w.box(x+dx,1.97,z-2.58,.17,1.7,1.16,wine);
    w.box(x+dx,2.38,z-2.58,.2,.54,.73,'#c6b98a');
  }
  w.box(x,2.98,z-2.59,2.42,.23,1.7,black);
  for(const zz of [-2,-.97,.13,1.22,2.37])for(const dx of [-1.12,1.12]){
    const r=zz>1.5?.34:.49;
    axle(x+dx,.5,z+zz,r,.17,black);axle(x+dx*1.07,.5,z+zz,r*.8,.08,wine);
    axle(x+dx*1.12,.5,z+zz,r*.2,.07,brass);
    for(let k=0;k<6;k++)w.box(x+dx*1.12,.5,z+zz,.047,.045,r*1.4,brass,k*Math.PI/6,0,0);
  }
  for(const dx of [-1.24,1.24]){
    w.box(x+dx,.39,z-.16,.09,.11,3.8,'#b7a384');w.box(x+dx,1.63,z-.18,.035,.045,4.89,edge);
  }
  w.box(x,1.08,z-4.75,2.2,1.36,2.73,wine);w.box(x,1.79,z-4.75,2,.14,2.52,black);
  for(let i=0;i<22;i++)w.ball(x+(w.random()-.5)*1.75,1.89+w.random()*.1,z-4.75+(w.random()-.5)*2.1,.18,.14,.21,'#353735');
  for(const zz of [-4.05,-5.49])for(const dx of [-.98,.98])axle(x+dx,.36,z+zz,.35,.21,black);
  // Timber and varnished crimson passenger carriage behind the tender.
  for(let j=0;j<2;j++){
    const cz=z-10.4-j*7.75;
    w.box(x,.62,cz,2.16,.56,7.4,black);
    w.box(x,1.36,cz,2.32,1.04,7.38,wine);
    w.box(x,2.17,cz,2.31,.87,7.39,'#b88e62');
    for(const dx of [-1.17,1.17])for(let k=0;k<7;k++){
      w.box(x+dx,2.13,cz-3+k, .036,.60,.78,'#6d9693');
      w.box(x+dx,1.72,cz-3+k,.052,.042,.87,edge);
    }
    w.box(x,2.76,cz,2.47,.25,7.58,black);
    for(const zz of [-2.55,2.55])for(const dx of [-.99,.99])axle(x+dx,.38,cz+zz,.38,.16,black);
  }
}
function steam(w,x,y,z) {
  const count=26,positions=new Float32Array(count*3),data=[];
  for(let i=0;i<count;i++)data.push([w.random(),w.random()*TAU,w.random()]);
  const geom=new THREE.BufferGeometry();
  geom.setAttribute('position',new THREE.BufferAttribute(positions,3));
  const tex=w.texture('steam',64,64,c=>{const g=c.createRadialGradient(32,32,1,32,32,32);g.addColorStop(0,'rgba(253,249,224,.75)');g.addColorStop(.45,'rgba(223,228,211,.40)');g.addColorStop(1,'rgba(240,240,220,0)');c.fillStyle=g;c.fillRect(0,0,64,64);});
  const mat=new THREE.PointsMaterial({size:1.15,color:'#e7e9d9',map:tex,transparent:true,opacity:.56,depthWrite:false});
  w.geometries.set('smoke-geo',geom);w.materials.set('smoke-mat',mat);
  const particles=new THREE.Points(geom,mat);particles.frustumCulled=false;w.layers.add(particles);
  w.ticks.push(t=>{data.forEach(([start,a,rand],i)=>{const q=(start+t*.15)%1;positions[3*i]=x+q*q*1.7+Math.sin(a+q*5)*q*.44;positions[3*i+1]=y+q*3.2;positions[3*i+2]=z+(rand-.5)*q*1.35;});geom.attributes.position.needsUpdate=true;});
}
function platform(w) {
  floor(w,13,35,2.75,0);castRoofShadows(w,0,12.9,34.8,2.75);w.box(2.75,-.34,0,13,.66,35,'#9c8870');
  w.box(-3.49,.023,0,.20,.03,35,'#c2a259');
  w.box(-10,-.61,-4,20,.4,61,'#68665a');
  tracks(w,-5.55,65);tracks(w,-9.1,65);
  locomotive(w,-5.55,-1.4);steam(w,-5.55,3.25,.73);
  w.box(-4.36,1.67,-8.63,.08,1.89,.86,'#3f4038');
  w.box(-4.30,2.32,-8.63,.045,.48,.63,'#8ba39c');
  for(const z of [-9.09,-8.17])w.cylinder(-4.26,1.40,z,.032,1.55,brass);
  for(const [x,y] of [[-4.26,.65],[-4.05,.4],[-3.86,.2]])w.box(x,y,-8.63,.3,.09,.91,'#5e6556');
  vault(w,19.8,-21,15.8,6.45,3.55,8);
  brick(w,7.43,3.5,-2,39,7,-Math.PI/2);
  // A glazed footbridge and the brick shed enclose the railhead beyond the platform.
  w.box(-3.3,4.3,-16.2,25,.53,2.8,iron);
  for(const x of [-14,-11,-8,-5,-2,1,4,7]){
    w.box(x,5.23,-15.04,.13,1.74,.13,iron);
    w.beam([x,4.48,-15],[x+2.9,6.05,-15],.075,iron);
  }
  w.box(-3.3,6.18,-16.2,25.3,.22,3.0,'#69736b');
  brick(w,-16.4,4.5,-9,46,9,Math.PI/2);
  for(let z=-26;z<=12;z+=5){
    w.box(-16.25,5.65,z,.12,3.25,3.55,'#738982');
    for(const dz of [-1.0,0,1.0])w.box(-16.1,5.64,z+dz,.14,3.26,.07,'#43554f');
    w.box(-16.14,5.6,z,.13,.08,3.5,iron);
  }
  w.box(-8.2,2.9,-26,29.5,6,1.5,'#ac8e73');
  for(let x=-20;x<5;x+=3.3){w.box(x,3.1,-25.17,1.65,2.75,.12,'#678079');}

  for(const z of [-11,-5,2.4,8.7]){w.lamp(5.74,2.7,z,1.05,true);w.bench(4.7,z+1.4,Math.PI/2);w.bufferWall(4.7,z+1.4,.65,2.1,1.2);}
  w.sign(.2,4.15,-9.7,3.4,1.4,'9¾',{sub:'HOGWARTS EXPRESS'});w.box(.2,5.4,-9.7,.08,1.1,.08,iron);
  stationClock(w,4.4,3.35,-3.9,.51);
  w.chest(-2.15,0,1.75,.91,.58,.55);w.bufferWall(-2.15,1.75,.91,.58,.56);
  w.chest(3.8,0,-7.3,1.18,.67,.67);w.chest(3.77,.67,-7.3,.8,.52,.43,'#677457');
  // Boarding step to the coach at the far end.
  for(let i=0;i<3;i++)w.box(-3.6-i*.21,.05+i*.1,-8.6,.25,.12,.85,brass);
}
function coach(w){
  w.walls.push(...getTrainNavigation().walls);
  w.box(0,-.115,0,6.3,.23,28,wood);
  w.box(0,.001,0,2.6,.002,27,'#9a5542');
  for(const dx of [-1.27,1.27])w.box(dx,.03,0,.045,.018,27,'#cfad79');
  const foliage=['#8c9b77','#a7ac84','#71866a'];
  for(const side of [-1,1]){
    const x=side*3.05;
    w.box(x,.57,0,.14,1.15,28,'#8a553d');
    w.box(x,3.25,0,.18,.52,28,'#73452e');
    w.box(x,1.16,0,.24,.14,28,'#c39461');
    for(const z of TRAIN_LAYOUT.bayOrigins){
      w.box(x,2.18,z,.18,2.2,.25,'#785138');
      w.box(x,2.74,z+1.52,.13,.06,3.03,brass);
      w.box(x,1.59,z+1.52,.19,.12,3.03,'#b99160');
      w.box(side*2.03,2.65,z+.55,1.4,.075,1.08,brass);
      for(const dz of [.08,.38,.71,1.0])w.box(side*2.03,2.77,z+dz,1.36,.038,.036,brass);
    }
    // Painted hills are outside the windows and scroll with the train.
    for(let i=0;i<22;i++) {
      const geom=w.geo('hill',()=>new THREE.SphereGeometry(1,12,7));
      const h=new THREE.Mesh(geom,w.material(foliage[i%3]));h.position.set(side*(11+i%3*3),-.8,-28+i*2.9);
      h.scale.set(3.5+i%3,2.8+(i%4)*.75,4.2);w.layers.add(h);
      const initial=h.position.z;w.ticks.push(t=>{h.position.z=-32+((initial+32+t*(i%3*.3+1.2))%68);});
    }
  }
  const palette={upholstery:'#824d45','upholstery-back':'#785048',wood,leather:'#80634a'};
  for(const part of TRAIN_FURNITURE_PARTS){
    const color=palette[part.material],shape=part.rounding?w.geo(`train-rounded:${part.w}:${part.h}:${part.d}:${part.rounding}`,()=>new RoundedBoxGeometry(part.w,part.h,part.d,2,part.rounding)):null;
    if(shape)w.place(shape,color,part.x,part.y,part.z,1,1,1);else w.box(part.x,part.y,part.z,part.w,part.h,part.d,color);
  }
  for(const z of [-10.2,10.9]){
    for(const x of [-2.1,2.1])w.box(x,1.65,z,2,3.3,.19,wood);
    w.box(0,3.13,z,2.4,.46,.21,'#8d623d');
  }
  w.box(0,1.5,-10.22,2.22,3,.18,'#83583d');
  w.box(0,1.98,-10.1,1.12,1.08,.06,'#abc0b0');
  w.box(0,1.99,-10.04,.04,1.06,.03,brass);w.box(0,1.98,-10.035,1.1,.036,.03,brass);
  w.box(.73,1.13,-10.02,.15,.055,.08,brass);
  w.box(0,3.77,0,6.35,.17,28,'#d0bd93');
  for(let z=-12;z<14;z+=3.25){w.box(0,3.59,z,6.12,.13,.16,oak);w.ball(0,3.37,z, .23,.11,.23,w.glow);}
  w.sign(0,2.95,-10.1,2.15,.52,'HOGWARTS EXPRESS');
}
function pine(w,x,z,h) {
  w.cylinder(x,-.28+h*.4,z,h*.048,h*.8,'#473e36',0,0,0,.8,7);
  for(let j=0;j<3;j++)w.cylinder(x,.1+h*(.31+j*.19),z,h*(.22-j*.041),h*.45,j%2?'#243f3c':'#284943',0,0,0,0,8);
}
function turret(w,x,y,z,r,h) {
  w.cylinder(x,y+h/2,z,r,h,'#85897c',0,0,0,.96,14);
  w.cylinder(x,y+h-.25,z,r*1.09,.5,'#abb09e',0,0,0,1,14);
  w.cylinder(x,y+h+r*1.2,z,r*1.26,r*2.65,'#3e5357',0,0,0,0,14);
  w.cylinder(x,y+h+r*2.7,z,.045,.8,brass);
  for(const angle of [0,.8,1.6,2.4,3.2,4,4.8,5.6]){
    for(let k=1;k<=3;k++){
      if((k+Math.round(angle*3))%5===0)continue;
      w.box(x+Math.sin(angle)*r*.985,y+h*(.19*k+.15),z+Math.cos(angle)*r*.985,.28,.85,.065,w.windowLight,0,angle);
    }
  }
}
function castle(w) {
  const z=-52;
  w.ball(1,-2.6,z,17,5.1,9.3,'#465c51');
  w.box(1,4.75,z,14,7.5,5.8,'#929383');
  for(const [xx,zz,r,h] of [[-6,-48,1.45,9],[8,-48,1.6,9.6],[-3,-54,1.6,12.5],[5.5,-54,1.35,11.5],[1,-52,2.2,15.6],[-10,-53,1.6,8.8],[10.4,-55,1.65,8.6]]){
    turret(w,xx,.5,zz,r,h);
  }
  for(let i=-5;i<7;i+=1.3){
    w.box(i,5.9,z+2.94,.43,1.74,.09,w.windowLight);w.arch(i,6.77,z+3.04,.23,.43,.055,'#bfb79e');
    w.box(i,3.4,z+2.96,.27,1,.08,w.windowLight);
  }
  w.box(1,8.8,z,14.2,.4,6.2,'#acaa99');
  for(let i=-6;i<8;i+=1.25)w.box(i,9.23,z+2.87,.68,.78,.51,'#949685');
}
function skiff(w,x,z,scale=1) {
  const s=scale;
  const coords=[[-.36,-1.85],[-.79,-.97],[-.81,.98],[-.25,1.85],[0,2.04],[.35,1.72],[.81,.96],[.78,-.98],[.24,-1.85],[0,-2.04]];
  for(let i=0;i<coords.length;i++) {
    const [x1,z1]=coords[i],[x2,z2]=coords[(i+1)%coords.length];
    const a=[x+x1*s,-.05,z+z1*s],b=[x+x2*s,-.05,z+z2*s];w.beam(a,b,.18*s,wood);
    a[1]=b[1]=.09;w.beam(a,b,.09*s,'#b39168');
  }
  for(const sZ of [-.83,.1,.87])w.box(x,-.04,z+sZ*s,1.36*s,.13*s,.26*s,oak);
}
function ferry(w) {
  const boat=new THREE.Group();w.layers.add(boat);
  const build=new Workshop(boat);w.nested.push(build);
  const stations=[[-1.99,.03],[-1.54,.44],[-.86,.78],[.1,.83],[.94,.70],[1.65,.3],[1.96,.03]];
  const pos=[];
  function triangle(a,b,c){pos.push(...a,...b,...c);}
  for(let i=0;i<stations.length-1;i++){
    const [za,wa]=stations[i],[zb,wb]=stations[i+1];
    for(const side of [-1,1]){
      const topA=[side*wa,.15,za],topB=[side*wb,.15,zb],loA=[side*wa*.56,-.24,za],loB=[side*wb*.56,-.24,zb];
      triangle(topA,topB,loB);triangle(topA,loB,loA);
      triangle(loA,loB,[0,-.37,zb]);triangle(loA,[0,-.37,zb],[0,-.37,za]);
      build.beam(topA,topB,.09,'#bd9970');
      const midA=[side*wa*.87,.03,za],midB=[side*wb*.87,.03,zb];build.beam(midA,midB,.035,'#a07c51');
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.computeVertexNormals();
  build.geometries.set('hull',g);
  const hull=new THREE.Mesh(g,build.customMaterial('timber hull',{color:'#75573b',side:THREE.DoubleSide,roughness:.85}));
  build.layers.add(hull);
  for(const z of [-.89,.14,.85])build.box(0,.08,z,1.32,.11,.24,'#a58358');
  build.box(0,-.035,-.15,.67,.03,2.53,'#8b6949');
  build.glow=w.glow;
  build.cylinder(0,.51,-1.5,.038,.86,'#6d553b');
  build.lamp(0,.84,-1.5,.48);
  for(const side of [-1,1]){
    build.beam([side*.52,.22,.82],[side*.97,.44,-.63],.047,'#aa8659');
    build.box(side*.97,.445,-.72,.13,.058,.4,wood,0,side*.2);
  }
  build.finish();
  const progress=p=>{
    p=THREE.MathUtils.clamp(p,0,1);
    const x=-4.55-4.25*Math.sin(Math.PI*p)**2,z=-3.45-5.9*p;
    const yaw=Math.atan2(4.25*Math.PI*Math.sin(2*Math.PI*p),5.9);
    boat.position.set(x,-.16,z);boat.rotation.y=yaw;
    return {x,y:.08,z,yaw};
  };
  progress(0);return progress;
}
function stars(w) {
  const positions=[];
  for(let i=0;i<175;i++){
    const a=TAU*w.random(),h=.1+w.random()*1.3;
    positions.push(78*Math.cos(h)*Math.cos(a),77*Math.sin(h),78*Math.cos(h)*Math.sin(a));
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  const m=new THREE.PointsMaterial({color:'#f6edd5',size:.16,opacity:.85,transparent:true,fog:false});
  w.geometries.set('starfield',g);w.materials.set('starfield',m);w.layers.add(new THREE.Points(g,m));
}
function blackLake(w) {
  w.box(0,-.82,-10,165,.16,180,'#283f4d');
  for(let i=0;i<410;i++){
    const x=(w.random()-.5)*127,z=(w.random()-.6)*131;
    w.box(x,-.721+w.random()*.016,z,.15+w.random()*1.56,.013,.025+w.random()*.055,i%5?'#34545d':'#596d69');
  }
  for(let i=0;i<17;i++){
    const x=(i-8)*6.7;w.ball(x,-3.4,-61-w.random()*10,9+w.random()*10,4+w.random()*3,5+w.random()*3,'#334b4d');
  }
  for(const side of [-1,1])for(const z of [-42,-20,0]) {
    w.ball(side*28,-2.17,z,16,3.58,17,'#3c534b');
    w.ball(side*26,-1.7,z+3,13,2.9,13,'#485a4c');
  }
  for(let i=0;i<65;i++){
    const a=(w.random()>.5?1:-1);const x=a*(15+w.random()*31),z=-51+w.random()*62;
    if(Math.abs(x)<16&&z>-30)continue;
    pine(w,x,z,3+w.random()*4.3);
  }
  castle(w);stars(w);
  w.ball(-17,18,-69,2.55,2.55,2.55,w.customMaterial('moon',{color:'#efe2b8',fog:false},true));
  // Two separate walkable wharves leave a real water gap between the shores.
  for(const [near,far] of [[-4.85,14],[-14,-7.5]]){
    for(let z=near;z<far;z+=.4){
      w.box(0,-.12,z,6.9,.23,.38,Math.round(z*10)%5?'#9a8266':'#aa9272');
    }
    for(const x of [-3.4,3.4])for(let z=near;z<far;z+=3.7){
      w.cylinder(x,-.12,z,.12,1.72,'#6b5849',0,0,0,.95,9);
      w.cylinder(x,.45,z,.135,.22,'#b6a17b',0,0,0,1,9);
      const boardingSide=x<0&&(z<-.5);
      if(z+3.7<far&&!boardingSide)w.beam([x,.43,z],[x,.36,z+3.7],.047,'#b3a385');
    }
  }
  w.bufferWall(0,-6.22,6.9,2.24,4.4);
  for(const z of [6.4,1.7,-4.65,-8,-13.2]){w.lamp(-3.24,1.75,z,.88,true);w.lamp(3.24,1.75,z,.88,true);}
  skiff(w,4.8,2.3,1.2);skiff(w,4.82,-9.7,1.1);
  for(const x of [-3.3,3.3]){
    w.box(x,1.75,-13.7,.19,3.5,.19,wood);
    w.beam([x,3.48,-13.7],[0,4.95,-13.7],.21,oak);
  }
  w.box(0,3.5,-13.7,6.9,.16,.19,wood);
  w.sign(0,3.24,-13.60,2.5,.55,'BOATHOUSE');
  w.setBoatRide=ferry(w);
}
function desk(w,x,z,width=2.65) {
  w.shadow(x,z,width*1.33,1.85,.48);
  w.box(x,.85,z,width,.16,1.0,oak);
  for(const a of [-1,1])for(const b of [-1,1])w.box(x+a*(width/2-.16),.41,z+b*.34,.14,.81,.14,wood);
  w.bufferWall(x,z,width,1,.94);
}
function candle(w,x,y,z,size=1) {
  w.cylinder(x,y+.17*size,z,.058*size,.34*size,'#e5cf9a',0,0,0,1,8);
  w.ball(x,y+.368*size,z,.033*size,.099*size,.033*size,w.flame);
}
function lancet(w,x,z,bottom,width,height,tint) {
  w.box(x,bottom+height*.46,z,width,height*.91,.18,'#4d5149');
  w.box(x,bottom+height*.45,z+.1,width*.83,height*.83,.075,tint);
  w.arch(x,bottom+height*.85,z+.16,width*.46,height*.19,.115,'#c1b69b');
  w.box(x,bottom+height*.46,z+.18,.072,height*.85,.08,'#455451');
  for(const yy of [.25,.57])w.box(x,bottom+height*yy,z+.18,width*.81,.056,.08,'#455451');
}
function houseBanner(w,x,z,tone,symbol) {
  const key='cloth'+tone+symbol;
  const tx=w.texture(key,128,256,(c,W,H)=>{
    c.fillStyle=tone;c.fillRect(0,0,W,H);c.lineWidth=6;c.strokeStyle='#c4a96c';c.strokeRect(8,6,W-16,H-13);
    c.lineWidth=2;c.strokeRect(14,12,W-28,H-25);c.fillStyle='#dfc780';c.font='bold 71px Georgia';c.textAlign='center';c.fillText(symbol,W/2,H*.54);
  });
  w.panel(x,4.7,z,1.02,2.85,w.customMaterial(key,{map:tx,side:THREE.DoubleSide}));
  w.box(x,6.17,z,1.32,.09,.13,brass);
}
function ashlar(c,W,H){
  const rnd=seedRandom(713),shades=['#a9a38f','#b3ad97','#b7af99','#aca691','#b4ab93','#aba58d'];
  c.fillStyle='#898675';c.fillRect(0,0,W,H);
  for(let row=0;row<5;row++){
    let x=(row%2===0?0:-W*.12);
    while(x<W){
      const width=W*(.16+rnd()*.2),y=row*H/5;
      c.fillStyle=shades[Math.floor(rnd()*shades.length)];c.fillRect(x+1,y+1,width-1.4,H/5-1.7);
      c.fillStyle='#f9eadb2b';c.fillRect(x+2,y+1,width-3,2);x+=width;
    }
  }
  for(let i=0;i<2500;i++){c.fillStyle=rnd()>.5?'#735d4617':'#efeadb30';c.fillRect(rnd()*W,rnd()*H,1+rnd()*3,1);}
}
function schoolRoom(w,kind){
  const great=kind==='sorting',wide=great?8.5:7.3,front=great?-12:-10.45,back=14.5,cap=great?7.2:5.2;
  floor(w,wide*2+1,back-front,0,(front+back)/2);
  const stone='#9d9581',trim='#bcaf91',beam='#534333';
  w.box(0,cap*.52,front-.24,wide*2+.4,cap*1.05,.48,stone);
  for(const side of [-1,1]){
    const x=side*wide;
    w.box(x,cap*.5,(front+back)/2,.38,cap,back-front,stone);
    const pat=w.tiled('ashlar',320,256,ashlar,(back-front)/4,cap/3);
    w.panel(x-side*.195,cap*.5,(front+back)/2,back-front,cap,pat,side<0?Math.PI/2:-Math.PI/2);
    w.box(x*.98,.81,(front+back)/2,.24,1.62,back-front,'#755b43');
    for(let z=front+.6;z<back;z+=4.2){
      w.box(x*.982,cap*.52,z,.5,cap*1.04,.4,trim);
      w.box(x*.966,cap-.44,z,.7,.25,.68,trim);
      w.beam([x*.95,cap-.2,z],[x*.77,cap+1.28,z],.16,beam);
      if(z<back-1){w.lamp(x*.96,2.95,z+1.66,.85);}
    }
  }
  w.panel(0,cap*.52,front+.015,wide*2+.4,cap*1.04,w.tiled('ashlar',320,256,ashlar,wide*.49,cap/3));
  for(let i=-3;i<=3;i++){
    const x=i*(wide*.245);lancet(w,x,front+.02,2.5,wide*.18,cap*.55,i%2?'#a4bbb0':'#b5ba9e');
  }
  for(const z of [front+.4,front+4.5,front+8.6,front+12.7,front+16.8,front+20.9]){
    w.arch(0,cap-.03,z,wide,2,.23,beam);
    w.beam([-wide,cap-.14,z],[0,cap+2.35,z],.16,beam);w.beam([0,cap+2.35,z],[wide,cap-.14,z],.16,beam);
    w.box(0,cap+.41,z,wide*1.87,.12,.14,beam);
  }
  w.box(0,cap+2.51,(front+back)/2,2*wide,.25,back-front,'#435150');
  w.box(0,1.5,front+.09,2.42,3,.16,kind==='trapdoor-return'?'#3f6d78':wood);
  w.arch(0,2.99,front+.22,1.23,.84,.12,trim);w.box(0,1.49,front+.24,.04,2.97,.02,'#443e31');
  for(const x of [-.18,.18])w.ball(x,1.18,front+.28,.06,.06,.05,brass);
}
function hall(w) {
  schoolRoom(w,'sorting');
  for(const [x,c,s] of [[-5.6,'#803d34','G'],[-2.95,'#a88648','H'],[2.95,'#445f78','R'],[5.6,'#436854','S']])houseBanner(w,x,-11.52,c,s);
  for(const x of [-5.3,5.3])for(const z of [-6,-1.4,3.2,7.8]){
    desk(w,x,z,3.8);w.bench(x,z+.95);w.bufferWall(x,z+.95,2.12,.6,1.2);
    for(let i=-1;i<=1;i++){
      w.cylinder(x+i*.9,.961,z,.18,.035,'#ceb57b');
      candle(w,x+i*.94+.33,.955,z-.18,.86);
    }
  }
  for(let i=0;i<34;i++)candle(w,(w.random()-.5)*12,4+w.random()*1.4,(w.random()-.5)*20,.8+w.random()*.6);
  w.box(0,.15,-10.2,5.8,.3,2,wood);
  w.box(-1.7,.68,-7.2,.72,.15,.68,oak);
  for(const x of [-1.94,-1.46])for(const z of [-7.40,-7])w.box(x,.34,z,.11,.6,.11,wood);
  w.cylinder(-1.7,.81,-7.2,.5,.095,'#775537');w.cylinder(-1.7,1.15,-7.2,.31,.66,'#6b4c34',0,0,-.14,0,8);
}
function classroom(w) {
  schoolRoom(w,'charms');
  w.box(0,2.45,-9.96,5.25,2.47,.16,oak);
  w.sign(0,2.46,-9.84,4.94,2.18,'Wingardium',{sub:'LEVITATION   •   CHARMS',bg:'#344c42',fg:'#efe5c8'});
  for(const x of [-4.5,4.5])for(const z of [-5.8,-1.6,2.6,6.8]){
    desk(w,x,z,2.35);
    w.box(x+.42,.963,z,.43,.09,.36,'#875741');w.box(x-.25,.959,z+.04,.46,.026,.38,'#d6c7a4');
    w.cylinder(x-.7,.992,z,.077,.13,'#2c4547',0,0,0,.8,8);
    w.bench(x,z+.9);w.bufferWall(x,z+.9,2.12,.56,1.1);
  }
  flowerPot(w,-5.85,-8.15,1.15);
}
function library(w){
  schoolRoom(w,'library-record');
  const tones=['#614e39','#814c36','#536458','#79534c','#454e59','#9a764d','#5d4540','#74684d'];
  for(const side of [-1,1]){
    for(const z of [-6,-1.3,3.4,8.1]){
      const x=side*5.8;
      w.box(x,2.17,z,.72,4.34,4.02,wood);w.bufferWall(x,z,.87,4.12,4.5);
      for(let j=0;j<5;j++){
        const y=.18+j*.79;
        w.box(x-side*.04,y,z,.97,.12,4.13,oak);
        let zz=z-1.88;
        while(zz<z+1.79){
          const bw=.09+w.random()*.2,h=.4+w.random()*.27;
          w.box(x-side*.41,y+.07+h*.5,zz+bw/2,.26,h,bw,tones[Math.floor(w.random()*tones.length)]);
          if(w.random()>.55)w.box(x-side*.553,y+h*.66,zz+bw/2,.018,.026,bw*.82,brass);
          zz+=bw+.027;
        }
      }
      for(const dz of [-2.02,2.02])w.box(x,2.1,z+dz,1.02,4.3,.12,oak);
      w.box(x,4.29,z,1.05,.22,4.27,'#765337');
    }
  }
  desk(w,3.9,-3.7,2.18);w.box(3.72,.98,-3.76,.67,.11,.56,'#9d6444');
  w.sign(0,4.14,-10.08,3.38,.73,'LIBRARY');
}
function sideHall(w,medical){
  schoolRoom(w,medical?'trapdoor-return':'team-puzzle');
  for(const x of [-4.4,4.4])for(const z of [-6.5,1.25,6.7]){
    if(medical){
      w.box(x,.69,z,1.12,.25,2.02,'#dfd9c1');w.box(x,.84,z+.22,1.13,.095,1.2,'#a4b6a9');
      w.box(x,.88,z-.64,.82,.14,.34,cream);
      for(const dx of [-.48,.48])for(const dz of [-.92,.92])w.cylinder(x+dx,.37,z+dz,.049,.73,brass);
      w.bufferWall(x,z,1.12,2.02,.9);
    }else{w.bench(x,z,Math.PI/2);w.bufferWall(x,z,.65,2.1,1.1);}
  }
  if(medical){
    w.box(0,1.51,-10.12,2.32,3,.19,'#416d7d');w.sign(0,3.48,-10,2.16,.47,'HOSPITAL WING');
    lancet(w,3.1,-10.06,2.32,1.6,1.57,'#b1c8c8');
  }else{
    const x=1.06,z=-4.4;
    for(const dx of [-.6,.6]){w.box(x+dx,.9,z,.11,1.8,.15,wood);w.box(x+dx,.1,z,.23,.14,.73,wood);}
    w.box(x,1.33,z,1.13,.62,.09,'#b69870');w.box(x,.62,z,1.13,.63,.09,'#b69870');
    w.bufferWall(x,z,1.35,.23,1.83);
  }
}
function lights(w,night) {
  const sky=new THREE.HemisphereLight(night?'#b6cde2':'#fff0d8',night?'#58676a':'#9d917a',night?1.65:1.67);w.layers.add(sky);
  const sun=new THREE.DirectionalLight(night?'#b6cde7':'#fff2d6',night?1.45:2.22);
  sun.position.set(-10,17,9);w.layers.add(sun);
  const rim=new THREE.DirectionalLight(night?'#ead1a0':'#d7e6e2',night?.62:.75);rim.position.set(9,6,-11);w.layers.add(rim);
  w.glow=w.customMaterial('lamp glow',{color:lamp,emissive:'#ffc76c',emissiveIntensity:.66});
  w.flame=w.customMaterial('candle glow',{color:'#ffeabc',emissive:'#ffcc75',emissiveIntensity:.94});
  w.windowLight=w.customMaterial('window glow',{color:'#e5c58e',emissive:'#f2be6f',emissiveIntensity:.38});
  w.glass=w.customMaterial('glass',{color:'#b6d1c9',transparent:true,opacity:.21,depthWrite:false,side:THREE.DoubleSide});
}
function chapterRoom(w,practice=false) {
  schoolRoom(w,practice?'gallery':'washroom');
  if(practice) {
    for(const side of [-1,1]){
      w.sign(side*3.5,2.8,-10.15,2.4,.55,side<0?'PRACTICE':'DUELLING');
      for(const z of [-6,2,7]){
        w.box(side*6.65,.74,z,.65,1.48,1.5,oak);
        w.box(side*6.65,1.51,z,.8,.07,1.65,brass);
        candle(w,side*6.65,1.55,z);
      }
    }
    return;
  }
  w.sign(0,4.15,-10.16,3.6,.64,'EAST LAVATORY');
  for(const side of [-1,1])for(const z of [-6,-1.2,4.9]){
    const x=side*6.25;
    w.box(x,1.55,z,.25,2.5,2.36,'#71877e');
    w.box(x-side*.23,1.88,z,.14,1.39,1.07,'#c3d0c4');
    w.ball(x-side*.63,.91,z,.47,.17,.58,'#d7d9c7');
    w.cylinder(x-side*.63,.43,z,.17,.82,'#bec5b4');
    w.bufferWall(x-side*.31,z,1.22,1.44,1.07);
  }
  for(let i=0;i<14;i++){
    const x=(w.random()-.5)*10,z=(w.random()-.5)*12;
    w.box(x,.012,z,.14+w.random()*.38,.018,.12+w.random()*.17,'#b9b9a4',0,w.random()*3);
  }
}
export function createWorld(sceneId,group) {
  const saga=sagaLayout(sceneId);
  const id=(saga||Object.hasOwn(maps,sceneId))?sceneId:'kings-cross';
  const data=saga||maps[id],w=new Workshop(group);
  let scene=group;while(scene.parent && !scene.isScene)scene=scene.parent;
  const night=id==='lake'||(saga&&[2,3,4,5,6].includes(saga.year));
  const backdrop=saga?saga.sky:night?'#334957':id==='express'?'#a3b7a1':(['kings-cross','platform'].includes(id)?'#c6cbbe':'#afa58b');
  if(scene.isScene){scene.background=new THREE.Color(backdrop);scene.fog=new THREE.Fog(backdrop,night?30:32,night?104:88);}
  lights(w,night);
  const builds={'kings-cross':terminal,platform,express:coach,lake:blackLake,sorting:hall,charms:classroom,'team-puzzle':s=>sideHall(s,false),'library-record':library,'trapdoor-return':s=>sideHall(s,true),'troll-washroom':s=>chapterRoom(s),'practice-gallery':s=>chapterRoom(s,true)};
  if(saga)buildSagaMap(w,saga);else builds[id](w);
  w.finish();
  for(const tick of w.ticks)tick(0);
  return {
    spawn:[...data.spawn],bounds:[...data.bounds],walls:w.walls,facing:0,
    ...(w.setBoatRide?{setBoatRide:w.setBoatRide,boatLanding:[-2.65,-9.35]}:{}),
    landmarks:{npc:[...data.npc],inspect:[...data.inspect],exit:[...data.exit],target:[...data.target]},
    update(dt,t){for(const tick of w.ticks)tick(t);},
    dispose(){w.dispose();},
  };
}
