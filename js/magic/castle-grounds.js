import * as THREE from 'three';
import { meshBatch } from './grounds-mesh.js';
import { groundPlaces, groundsCollision, groundsTrails, hut, owlery, greenhouses, pitch, pitchTowers, goalposts, pathDistance, seeded } from './grounds-layout.js';
import { inRailwayClearing } from './railway.js';

const timber=0x624835, timberLight=0x987a51, iron=0x485653, pale=0xd1ba8d, flame=0xffcd76;
const houseColours=[0xa5443c,0x315c89,0x427057,0xd5a946];

function walkways(parent) {
  const vertices=[], colours=[], rand=seeded(692), colour=new THREE.Color();
  function triangle(a,b,c,tint) {
    vertices.push(...a,...b,...c); colour.set(tint); for(let i=0;i<3;i++) colours.push(colour.r,colour.g,colour.b);
  }
  // Tessellated irregular edges keep crossroads joined without hard rectangular ends.
  for(const trail of groundsTrails) {
    let last=null;
    for(let segment=1;segment<trail.length;segment++) {
      const [ax,az]=trail[segment-1],[bx,bz]=trail[segment];
      const dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz), steps=Math.ceil(len/2.5);
      for(let i=last?1:0;i<=steps;i++) {
        const t=i/steps,x=ax+dx*t,z=az+dz*t,width=(x< -132?1.75:2.2)+rand()*.25;
        const left=[x+dz/len*width,.025,z-dx/len*width], right=[x-dz/len*width,.025,z+dx/len*width];
        if(last) {
          const shade=x< -132?0x5b543e:0x85755c;
          triangle(last[0],last[1],left,shade); triangle(left,last[1],right,shade);
        }
        last=[left,right];
      }
    }
  }
  const geo=new THREE.BufferGeometry(); geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3)); geo.setAttribute('color',new THREE.Float32BufferAttribute(colours,3));geo.computeVertexNormals();
  const material=new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:1,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
  const mesh=new THREE.Mesh(geo,material);mesh.receiveShadow=true;parent.add(mesh);
}

function lamp(batch,x,z,h=3.4) {
  const {put}=batch;
  put('pillar',x,h/2,z,.11,h,.11,timber); put('block',x+.30,h-.06,z,.84,.13,.14,timber);
  put('round',x+.57,h-.28,z,.045,.42,.045,iron);
  put('spire',x+.57,h-.56,z,.35,.28,.35,iron);
  put('octagon',x+.57,h-.89,z,.24,.53,.24,flame,0,'glow');
  put('octagon',x+.57,h-1.19,z,.28,.11,.28,iron);
}

function makePitch(parent,solid) {
  const batch=meshBatch(parent,'Quidditch • oval ground and spectators'); const {put,beam}=batch;
  const {x,z,rx,rz}=pitch;
  // Turf stripes terminate exactly on the ellipse rather than bleeding into the school grounds.
  const coords=[],colors=[];
  for(let i=0;i<60;i++) {
    const v1=i/30-1,v2=(i+1)/30-1;
    const a=rx*Math.sqrt(Math.max(0,1-v1*v1)),b=rx*Math.sqrt(Math.max(0,1-v2*v2));
    const zz=z+v1*rz,ww=z+v2*rz;
    coords.push(x-a,.047,zz,x-b,.047,ww,x+a,.047,zz,x+a,.047,zz,x-b,.047,ww,x+b,.047,ww);
    const c=new THREE.Color(Math.floor(i/5)%2?0x547344:0x47693f);for(let j=0;j<6;j++)colors.push(c.r,c.g,c.b);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(coords,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
  const turf=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));turf.receiveShadow=true;batch.group.add(turf);
  function fieldRing(cx,cz,r1,r2) {
    for(let i=0;i<72;i++) {
      const a=i/72*2*Math.PI,b=(i+1)/72*2*Math.PI;
      beam(cx+r1*Math.cos(a),.082,cz+r2*Math.sin(a),cx+r1*Math.cos(b),.082,cz+r2*Math.sin(b),.13,0xc7c49a);
    }
  }
  fieldRing(x,z,rx-3,rz-4);fieldRing(x,z,6,6);beam(x-rx+3,.082,z,x+rx-3,.082,z,.13,0xc7c49a);
  for(const pole of goalposts) {
    put('pillar',pole.x,pole.h/2,pole.z,.18,pole.h,.18,0xa09568);
    put('ring',pole.x,pole.h+1.55,pole.z,1.62,1.62,1.62,0xe7c575);
    solid.circle(pole.x,pole.z,.22,pole.h+3);
  }
  pitchTowers.forEach(({x:cx,z:cz,yaw},i)=>{
    const c=Math.cos(yaw),s=Math.sin(yaw), col=houseColours[i%4], alternate=i%4===3?0x474536:0xddd3a7;
    function part(shape,xx,yy,zz,w,h,d,color,material='matte') {put(shape,cx+xx*c+zz*s,yy,cz-xx*s+zz*c,w,h,d,color,yaw,material);}
    solid.box(cx,cz,5.8,4.9,12.2,yaw);
    for(const xx of [-2.6,2.6]) for(const zz of [-1.85,1.85]) part('block',xx,5,zz,.32,10,.32,timber);
    part('block',0,2.5,0,5.7,4.85,4.18,col);
    for(let k=0;k<5;k++) for(let j=0;j<3;j++) if((k+j)%2===0) part('block',(k-2)*1.12,1.25+j*1.15,-2.10,1.09,1.10,.08,alternate);
    for(let k=0;k<3;k++) part('block',0,5.3+k*.50,.55+k*.4,5.65,.32,1.6,timberLight);
    part('block',0,5.15,-2.29,5.9,.20,.25,pale);part('block',0,6.25,-2.29,5.9,.16,.15,timber);
    for(let k=-2;k<=2;k++)part('block',k,5.74,-2.29,.12,1.14,.12,timber);
    part('ridge',0,9.0,0,7,3.1,5.7,col);part('block',0,12.14,0,.18,.18,5.9,pale);
    part('round',0,12.95,0,.072,2.5,.072,timber);part('flag',0,14.14,0,2.3,.93,1,col);
  });
  // The main east entrance falls between the two nearest towers.
  for(const s of [-1,1]) {put('pillar',x+rx,3.2,z+s*4.1,.3,6.4,.3,timber);solid.circle(x+rx,z+s*4.1,.3,6.4);}
  put('ridge',x+rx,6.4,z,3.4,1.6,9.7,0x724944);put('block',x+rx,6.3,z,3.4,.28,9.6,timber);
  batch.finish();
}

function openRoundWall(batch,solid,cx,cz,r,h,color) {
  const segments=12, step=2*Math.PI/segments;
  for(let i=1;i<segments;i++) {
    const a=i*step, dist=r*Math.cos(step/2),x=cx+Math.sin(a)*dist,z=cz+Math.cos(a)*dist;
    const width=2*r*Math.sin(step/2)+.11;
    batch.put('block',x,h/2,z,width,h,.42,color,a);solid.box(x,z,width,.42,h,a);
    if(i%2===0 && i!==6) batch.put('arch',cx+Math.sin(a)*(dist+.24),h*.34,cz+Math.cos(a)*(dist+.24),1.23,2.1,1,flame,a,'glow');
  }
}

function makeHut(parent,solid) {
  const batch=meshBatch(parent,'Hagrid • hearth and pumpkin patch');const {put,beam}=batch;
  const {x,z,r}=hut;openRoundWall(batch,solid,x,z,r,5.7,0x80715f);
  put('spire',x,8.25,z,r*1.13,5.2,r*1.13,0x4a4945);solid.circle(x,z,r*1.05,10.4,5.7);
  put('round',x,5.64,z,r*1.08,.4,r*1.08,0x4d4036);
  put('block',x-3.5,8.3,z-1.5,1.55,5.2,1.5,0x726762);put('block',x-3.5,11,z-1.5,1.9,.48,1.9,0x494b49);
  put('round',x+2.6,1.05,z+1.6,1.3,.22,1.3,timberLight);put('pillar',x+2.6,.5,z+1.6,.30,1,.30,timber);solid.circle(x+2.6,z+1.6,1.25,1.18);
  put('block',x-2.5,.62,z-2.65,2.1,1.23,1.8,0x63594d); solid.box(x-2.5,z-2.65,2.1,1.8,1.45);
  for(let i=0;i<4;i++)put('spire',x-3+i*.30,1.55,z-2.55,.25,.75,.25,0xf4a946,0,'glow');
  put('sphere',x-2.44,2.51,z-2.55,.57,.42,.50,iron);beam(x-2.44,2.8,z-2.55,x-2.44,5,z-2.55,.044,iron);
  for(const s of [-1,1]) put('block',x+s*1.65,2.45,z+r-.19,.28,4.9,.65,timber);
  put('block',x,4.95,z+r-.19,3.58,.33,.65,timber);
  lamp(batch,x+3,z+r+.6,3.1);
  const rand=seeded(800); const gx=x+9.4,gz=z-1.4;
  put('block',gx,.04,gz,5.6,.12,8.5,0x4c412f);
  for(let i=0;i<17;i++) {
    const xx=gx+(rand()-.5)*4.9,zz=gz+(rand()-.5)*7.9,rad=.39+rand()*.62;
    for(let j=0;j<5;j++) {const a=j*1.257;put('sphere',xx+.28*rad*Math.cos(a),rad*.58,zz+.28*rad*Math.sin(a),rad*.67,rad*.63,rad*.67,j%2?0xb87036:0xc3833f,a);}
    put('pillar',xx,rad*1.24,zz,.09,.25,.09,0x59603a);solid.circle(xx,zz,rad*.78,rad*1.32);
  }
  batch.finish();
}

function makeOwlery(parent,solid) {
  const batch=meshBatch(parent,'Owlery • perches and belfry');const {put,beam}=batch;const {x,z,r}=owlery;
  openRoundWall(batch,solid,x,z,r,7.4,0x837b69);
  put('round',x,7.6,z,r*1.09,.55,r*1.09,0xa59b86);
  for(let i=0;i<8;i++){const a=i*Math.PI/4;put('pillar',x+Math.sin(a)*4.35,9.65,z+Math.cos(a)*4.35,.31,4.1,.31,0x918a74);}
  put('spire',x,14.3,z,r*1.12,5.8,r*1.12,0x485566);put('round',x,17.7,z,.09,1.5,.09,0xc6aa71);
  solid.circle(x,z,r,17.2,7.35);
  for(let j=0;j<3;j++) {
    const yy=2+j*1.25,zz=z-1.5-j*.55;beam(x-3.5,yy,zz,x+3.5,yy,zz,.14,timber);
    for(let i=0;i<3;i++){
      const xx=x-2.65+i*2.1+j*.28, shade=(i+j)%3===0?0xe5d9bf:0x958579;
      put('sphere',xx,yy+.4,zz,.28,.43,.26,shade);put('sphere',xx,yy+.83,zz,.31,.28,.26,shade);
      for(const s of [-1,1])put('sphere',xx+s*.12,yy+.85,zz+.22,.056,.068,.06,0xd9ac48);
    }
  }
  lamp(batch,x+3.5,z+r+1); batch.finish();
}

function makeGreenhouses(parent,solid) {
  const batch=meshBatch(parent,'Herbology • glasshouses'); const {put,beam}=batch, rand=seeded(882);
  greenhouses.forEach(({x,z},index)=>{
    const width=8.6,d=16;
    put('block',x,.025,z,width,.09,d,0x756950);
    for(const sign of [-1,1]) {
      const xx=x+sign*width/2;put('block',xx,.48,z,.36,.96,d,0x877e67);put('block',xx,2.24,z,.075,2.7,d,0xafcfbe,0,'glass');solid.box(xx,z,.36,d,3.65);
      put('block',xx,3.6,z,.16,.15,d,iron);
      for (let k=0;k<6;k++) {
        const zz=z-d/2+k*d/5;
        put('block',xx,2.28,zz,.19,2.75,.19,iron);beam(xx,3.65,zz,x,5.65,zz,.09,iron);
      }
      const roofWidth=Math.hypot(width/2,2);
      put('block',x+sign*width/4,4.64,z,roofWidth,.065,d,0xadded1,0,'glass',0,-sign*Math.atan2(2,width/2));
      const xxBench=x+sign*2.54;put('block',xxBench,1.18,z,1.6,.25,d-2.5,timberLight);solid.box(xxBench,z,1.6,d-2.5,1.4);
      for(let i=0;i<6;i++) {
        const zz=z-5.75+i*2.24;put('pillar',xxBench,1.53,zz,.36,.5,.36,0xa16849);
        for(let j=0;j<5;j++) {
          const a=j*1.257+rand()*.5,s=.32+rand()*.35;
          put('foliage',xxBench+Math.sin(a)*s*.62,1.95+rand()*.29,zz+Math.cos(a)*s*.62,.24,s,.23,index?0x71954d:0x536f41,a,'matte',.4);
        }
      }
    }
    const back=z-d/2,front=z+d/2;
    put('block',x,1.85,back,width,3.55,.1,0xb5d5ce,0,'glass');solid.box(x,back,width,.16,3.7);
    for(const side of [-1,1]){
      const xx=x+side*(width/4+.7); put('block',xx,1.85,front,width/2-1.4,3.55,.1,0xb5d5ce,0,'glass');solid.box(xx,front,width/2-1.4,.16,3.7);
      put('block',x+side*1.4,1.75,front,.19,3.5,.19,iron);
    }
    put('block',x,3.50,front,width,.16,.17,iron);put('block',x,5.65,z,.19,.13,d+.25,iron);
    solid.box(x,z,width,d,5.65,0,4.1);
  });
  batch.finish();
}

function makeForest(parent,solid) {
  const batch=meshBatch(parent,'Forbidden Forest • canopies and paths');const {put,beam}=batch,rand=seeded(470);
  const shades=[0x22473e,0x335949,0x3d5e4b,0x2a5045,0x3c563e];
  function protectedArea(x,z) {
    if (((x-5)/78)**2+((z+87)/59)**2<1 || ((x+42)/46)**2+((z+153)/23)**2<1) return true;
    if (Math.abs(x)<67&&z>64 || inRailwayClearing(x,z) || pathDistance(x,z)<5.2) return true;
    if (((x-pitch.x)/(pitch.rx+7))**2+((z-pitch.z)/(pitch.rz+6))**2<1.12) return true;
    if (Math.abs(x+49)<19&&Math.abs(z+18)<13 || Math.hypot(x-hut.x,z-hut.z)<18 || Math.hypot(x-owlery.x,z-owlery.z)<10) return true;
    return Math.hypot(x+92,z+108)<16 || Math.hypot(x+74,z+37)<10 || Math.hypot(x+164,z+141)<8;
  }
  function tree(x,z,dense) {
    const h=(dense?11:6)+rand()*(dense?10:7), r=h*.043, a=rand()*6.28;
    const isOak=dense&&rand()>.43;
    put('pillar',x,h*.28,z,r,h*.56,r,0x453e33,a);solid.circle(x,z,r,h*.63);
    if(isOak) {
      for(let i=0;i<4;i++) {
        const angle=a+i*1.57+.16*rand(),xx=x+Math.sin(angle)*h*.17,zz=z+Math.cos(angle)*h*.17;
        beam(x,h*.33,z,xx,h*.70,zz,r*.39,0x514739);
        put('foliage',xx,h*(.72+rand()*.07),zz,h*.26,h*.24,h*.24,shades[Math.floor(rand()*5)],angle);
      }
      put('foliage',x,h*.89,z,h*.20,h*.19,h*.22,shades[Math.floor(rand()*5)],a);
    } else for(let j=0;j<3;j++) put('spire',x,h*(.46+j*.19),z,h*(.248-j*.046),h*.48,h*(.248-j*.046),shades[(j+Math.floor(rand()*3))%5],a);
  }
  for(const dense of [true,false]) {
    const count=dense?235:135;
    for(let i=0,attempt=0;i<count&&attempt<count*12;attempt++) {
      const x=dense?-187+rand()*69:-185+rand()*370,z=dense?-184+rand()*109:-181+rand()*319;
      if(protectedArea(x,z))continue;tree(x,z,dense);i++;
    }
  }
  // Ground ferns, a crescent of lichen-covered rocks and patches of foxgloves.
  for(let i=0;i<420;i++) {
    const x=-186+rand()*65,z=-181+rand()*100;if(protectedArea(x,z))continue;
    for(let j=0;j<3;j++) {const a=rand()*6.28;put('foliage',x+.18*Math.sin(a),.30,z+.18*Math.cos(a),.20,.44+rand()*.42,.21,shades[j+2],a,'matte',.48);}
  }
  for(let i=0;i<8;i++) {
    const a=1.6+i*.53, r=6.5+rand(), x=-164+Math.sin(a)*r,z=-141+Math.cos(a)*r;
    put('foliage',x,.63,z,1.36,.9+rand(),1.06,0x6a6d59,a);solid.circle(x,z,.99,1.62);
  }
  for(const [x,z] of [[-134,-105],[-138,-99],[-150,-116],[-158,-134],[-123,-91]]) lamp(batch,x,z,3.1);
  return batch.finish();
}

function landscaping(parent,solid) {
  const batch=meshBatch(parent,'Campus • stone court and lakeside'); const {put,beam}=batch,rand=seeded(213);
  const cx=-74,cz=-37;put('octagon',cx,.052,cz,8.3,.105,8.3,0x8d8976);
  for(let i=0;i<8;i++) {
    const a=i*Math.PI/4;beam(cx,.12,cz,cx+Math.cos(a)*7.75,.12,cz+Math.sin(a)*7.75,.045,0x726b5c);
  }
  for(const side of [-1,1]) {
    const x=cx+side*4.4,z=cz-side*4.4;
    put('block',x,.73,z,3.35,.28,1.05,0xa29b85,-.72);solid.box(x,z,3.45,1.13,1.25,-.72);
    put('block',x,.30,z,1.13,.59,.85,0x6f7067,-.72);
  }
  for(const [x,z] of [[-82,-91],[-92,-78],[-102,-56],[-101,-27],[-70,-35],[-57,-8],[-122,-102],[-108,-129]]) lamp(batch,x,z);
  solid.circle(-92,-108,3.5,13);
  // Reeds and sedges on the shoreline give the broad lake a visible scale.
  for(let i=0;i<120;i++) {
    const a=rand()*Math.PI*2,c=Math.cos(a),s=Math.sin(a),x=5+c*(73+rand()*2),z=-87+s*(54+rand()*2);
    if(x>72&&z< -44 || x< -34&&x> -77&&Math.abs(z+96)<6 || Math.abs(x+42)<43&&z< -119)continue;
    for(let j=0;j<5;j++) {
      const xx=x+rand()*.9,zz=z+rand()*.9,hh=.4+rand()*.8;
      beam(xx,.03,zz,xx+c*.17,hh,zz+s*.17,.033,0x7b8054);
      if(j%2===0)put('pillar',xx+c*.17,hh,zz+s*.17,.068,.24,.068,0x715037);
    }
  }
  for(let i=0;i<groundsTrails.length;i++) {
    const trail=groundsTrails[i];
    for(let j=1;j<trail.length;j++) {
      const [ax,az]=trail[j-1],[bx,bz]=trail[j],dx=bx-ax,dz=bz-az,len=Math.hypot(dx,dz);
      for(let k=0;k<len*.75;k++){
        const t=rand(),offset=(rand()>.5?1:-1)*(1.68+rand()*.68),x=ax+dx*t+dz/len*offset,z=az+dz*t-dx/len*offset;
        put('foliage',x,.055,z,.12+rand()*.18,.05+.05*rand(),.12,0x918671,rand()*6);
      }
    }
  }
  batch.finish();
}

export function buildGrounds(scene) {
  const group=new THREE.Group();group.name='Hogwarts • school grounds';scene.add(group);
  const solid=groundsCollision();
  solid.ellipse(-1,-167,38.6,24.4,13.5);solid.ellipse(-88,-175,38.6,20.4,12);
  solid.box(-2,-166.6,42,14,42,0,12);solid.box(-85,-175,40,13.6,34,0,10);
  solid.box(13,-177,10.5,10.5,47,0,11);
  walkways(group);makePitch(group,solid);makeHut(group,solid);makeOwlery(group,solid);makeGreenhouses(group,solid);
  const forest=makeForest(group,solid);landscaping(group,solid);
  return {group,forest,places:groundPlaces,canWalk:solid.canWalk,cameraFraction:solid.cameraFraction};
}
