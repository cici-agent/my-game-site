import * as THREE from 'three';
import { meshBatch } from './grounds-mesh.js';
import { seeded } from './grounds-layout.js';

const ash = 0x79716c, stone = 0x908982, limestone = 0xa99e85, dark = 0x4e4a4f;
const slate = 0x354554, ridgeColor = 0x53606a, gold = 0xcbad70;

export function buildCastleShell(castle) {
  const batch = meshBatch(castle,'Castle • cliff, hall and towers',new Set([ash,stone,limestone,dark]));
  const {put,beam} = batch, rand = seeded(286);
  // Origin of the keep is the middle of the cliff. The original bridge threshold
  // is (0,10,11.6) in these coordinates, at y=12 in the outdoor world.
  function window(x,y,z,w,h,yaw=0) {
    const nx=Math.sin(yaw), nz=Math.cos(yaw), tx=Math.cos(yaw), tz=-Math.sin(yaw);
    put('arch',x,y,z,w,h,1,limestone,yaw);
    put('arch',x+nx*.035,y+.13,z+nz*.035,w*.78,h*.88,1,0x272a31,yaw);
    const glowing = rand() > .17;
    put('arch',x+nx*.08,y+.23,z+nz*.08,w*.60,h*.77,1,glowing ? [0xffcd78,0xefab5c,0xffdf95][Math.floor(rand()*3)] : 0x566776,yaw,glowing ? 'glow':'matte');
    put('block',x+nx*.115,y+h*.42,z+nz*.115,w*.075,h*.56,.09,dark,yaw);
    put('block',x+nx*.115,y+h*.56,z+nz*.115,w*.62,.11,.10,dark,yaw);
    put('block',x+nx*.14,y,z+nz*.14,w*1.16,.18,.33,limestone,yaw);
    for (const sign of [-1,1]) {
      beam(x+nx*.11+tx*sign*w*.26,y+h*.52,z+nz*.11+tz*sign*w*.26,x+nx*.11,y+h*.74,z+nz*.11,.052,dark);
    }
  }
  function turret(x,base,z,r,h,peak,shade=ash,lantern=false) {
    put('round',x,base+h/2,z,r,h,r,shade);
    for (const t of [.15,.67,.91,.98]) put('round',x,base+h*t,z,r*(t>.9?1.12:1.035),t>.9?.38:.20,r*(t>.9?1.12:1.035),limestone);
    const sides = r>3?8:5;
    for (let i=0;i<sides;i++) {
      const a=i/sides*2*Math.PI, rx=x+Math.sin(a)*(r+.04), rz=z+Math.cos(a)*(r+.04);
      window(rx,base+h*.71,rz,r*.32,h*.14,a);
      if(r>3) window(rx,base+h*.37,rz,r*.26,h*.105,a);
      put('block',x+Math.sin(a)*r*.97,base+h*.93,z+Math.cos(a)*r*.97,.48,.86,.60,dark,a);
    }
    put('spire',x,base+h+peak/2,z,r*1.26,peak,r*1.26,slate);
    for (const t of [.14,.41,.68]) put('round',x,base+h+peak*t,z,r*1.28*(1-t),.13,r*1.28*(1-t),ridgeColor);
    put('round',x,base+h+peak+.65,z,.085,1.7,.085,gold);
    put('sphere',x,base+h+peak+.22,z,.22,.27,.22,gold);
    if(lantern) put('flag',x,base+h+peak+1.38,z,2.65,.86,1,0xa24e42,-.1);
  }
  function hall(x,z,w,d,base,h,roofH,shade) {
    put('block',x,base+h/2,z,w,h,d,shade);
    put('block',x,base+.55,z,w+.6,1.1,d+.7,dark);
    put('block',x,base+h-.35,z,w+.65,.55,d+.8,limestone);
    put('ridge',x,base+h,z,w+1.7,roofH,d+1.3,slate);
    put('block',x,base+h+roofH+.06,z,.45,.34,d+1.8,ridgeColor);
    for (const s of [-1,1]) {
      const front=z+s*(d/2+.025), outward=s>0?0:Math.PI;
      put('ridge',x,base+h,front,w+.25,roofH*.97,.24,shade,outward);
      for (let i=1;i<=3;i++) window(x+(i-2)*w*.23,base+h*.40,front+s*.15,w*.13,h*.45,outward);
      window(x,base+h+.28,front+s*.16,w*.15,roofH*.58,outward);
    }
    for (const side of [-1,1]) {
      const length=Math.max(3,Math.floor(d/4.2));
      for(let i=0;i<length;i++) {
        const zz=z-d/2+(i+.5)*d/length;
        window(x+side*(w/2+.05),base+h*.36,zz,w*.13,h*.48,side*Math.PI/2);
        put('block',x+side*(w/2+.38),base+h*.39,zz+d/length*.46,1.2,h*.78,.70,stone);
        put('spire',x+side*(w/2+.38),base+h*.78+.65,zz+d/length*.46,.63,1.35,.63,ridgeColor);
      }
    }
  }
  function crag(x,z,rx,rz,top) {
    const n=46,tiers=[-.12,.06,.44,.77,1.],vertices=[],colors=[],bands=[];
    const angles=Array.from({length:n},(_,i)=>(i+rand()*.33)/n*Math.PI*2);
    for(let layer=0;layer<tiers.length;layer++) {
      bands.push(angles.map(a=>{
        const r=1.04-layer*.052+(rand()-.5)*.085+.035*Math.sin(a*7+layer*.4);
        return [x+Math.cos(a)*rx*r,top*tiers[layer]+(rand()-.5)*(layer===4?.45:2.4),z+Math.sin(a)*rz*r];
      }));
    }
    function face(a,b,c,colour) {
      vertices.push(...a,...b,...c);const col=new THREE.Color(colour).multiplyScalar(.82+rand()*.29);
      for(let j=0;j<3;j++)colors.push(col.r,col.g,col.b);
    }
    const rockFaces=[0x535962,0x64676a,0x626662,0x777976,0x5d5e60];
    for(let i=0;i<n;i++) {
      const j=(i+1)%n;
      for(let layer=0;layer<4;layer++) {
        face(bands[layer][i],bands[layer+1][i],bands[layer][j],rockFaces[layer]);
        face(bands[layer][j],bands[layer+1][i],bands[layer+1][j],rockFaces[layer]);
      }
      face(bands[4][j],bands[4][i],[x,top,z],0x59654d);
      if(i%3===0) {
        const [xx,yy,zz]=bands[3][i];const scale=.72+rand()*.68;
        put('foliage',xx,yy+.37,zz,scale*2.2,scale,scale*1.4,0x4b5b46,rand()*5);
        if(i%2===0){put('pillar',xx,yy+1.71,zz,.16,3.4,.16,0x594c3e);put('spire',xx,yy+3.1,zz,1.18,3.4,1.18,0x364e45);}
      }
    }
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
    const mesh=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,flatShading:true,side:THREE.DoubleSide,roughness:1}));
    mesh.castShadow=mesh.receiveShadow=true;castle.add(mesh);
  }
  crag(0,-8,40,19,10);crag(41,-22,38,24,11.5);crag(-46,-30,38,20,10);
  // Raised ward, gatehouse, great hall, bell tower and the staggered skyline.
  put('octagon',0,9.15,-8,35,1.65,16.8,stone);
  hall(-13,-6.8,12.2,21,10,15.5,10.2,ash);
  hall(12,-10.5,13,24.8,10,15,8.3,stone);
  hall(-2.3,-18,22,10.8,10,18,9.5,ash);
  put('block',0,17.9,3.1,16.4,15.8,16.8,stone);
  put('ridge',0,25.8,3.0,18,11.3,18.2,slate);
  put('ridge',0,25.6,11.58,16.55,10.7,.24,stone);
  const doorFace=11.64;
  for (const [w,h,out,color] of [[7,10,.10,limestone],[6.45,9.62,.18,dark],[5.95,9.25,.25,ash],[5.35,8.92,.34,0x372822]]) {
    put('arch',0,10,doorFace+out,w,h,1,color);
  }
  for (let x=-2.15;x<=2.16;x+=.53) put('block',x,13.25,doorFace+.36,.042,6.5,.12,0x201d1c);
  for(const side of [-1,1]) {
    for(const y of [12,15]) put('block',side*1.28,y,doorFace+.43,2.2,.16,.12,0x77674f);
    put('ring',side*.46,13.5,doorFace+.55,.19,.24,.20,gold);
    window(side*5.7,17.5,doorFace+.02,1.6,5.8);
  }
  put('ring',0,23,doorFace+.12,2.26,2.26,1,limestone);
  put('sphere',0,23,doorFace,2.12,2.12,.12,0xf5bc64,0,'glow');
  for(let i=0;i<8;i++){const a=i*Math.PI/4;beam(0,23,doorFace+.21,2.05*Math.cos(a),23+2.05*Math.sin(a),doorFace+.21,.10,dark);}
  for (const side of [-1,1]) turret(side*8.25,10,8.8,2.05,18.4,6.8,ash);
  turret(-23,9.8,-4,4.0,22.3,13,stone,true);
  turret(21,9.8,-4.4,3.45,19.2,11,dark);
  turret(-16.4,10,-17,4.05,30.8,14.7,ash);
  turret(13.4,10,-21,5,34,14.8,stone,true);
  turret(-2.2,10,-21,5.6,41.5,19.6,ash,true);
  for (const s of [-1,1]) turret(-2.2+s*4.5,42.2,-19,1.45,6.5,6.2,stone);
  turret(27,8.4,-12.7,2.65,22.5,9.6,ash); turret(-28.5,8.5,-9.7,2.3,14.5,8.1,ash);
  // The long northern wings run broadside to the lake, with unequal rooflines
  // and wider cathedral windows than the narrow lancets of the tower keep.
  function lakeWing(x,z,w,d,base,h,roofH,shade,bays) {
    const front=z+d/2, eaves=base+h;
    put('block',x,base+h/2,z,w,h,d,shade);
    put('ridge',x,eaves,z,d+1.2,roofH,w+1.15,slate,Math.PI/2);
    put('block',x,eaves-.28,z,w+.7,.65,d+.7,limestone);
    put('block',x,eaves+roofH+.08,z,w+1.5,.33,.45,ridgeColor);
    const bay=w/bays;
    for(let j=0;j<bays;j++) {
      const xx=x-w/2+(j+.5)*bay;
      window(xx,base+h*.28,front+.055,bay*.69,h*.64);
      window(xx,base+h*.07,front+.055,bay*.34,h*.14);
      if(j%2===0) {
        put('block',xx,eaves+1.0,front-d*.17,2.8,3.1,3.1,stone);
        put('ridge',xx,eaves+2.5,front-d*.16,3.55,2.5,3.8,slate);
        window(xx,eaves+.67,front-d*.16+1.91,1.2,2.0);
      }
      const bx=xx+bay*.46;
      put('block',bx,base+h*.42,front+.52,.7,h*.85,1.1,stone);
      put('spire',bx,base+h*.85+.86,front+.52,.55,1.72,.55,ridgeColor);
      for(let k=0;k<3;k++) put('block',bx,base+h*(.17+k*.21),front+.55,.90,.20,1.35,limestone);
    }
    for(const side of [-1,1]) {
      const xx=x+side*(w/2+.06),yaw=Math.PI/2*side;
      put('ridge',xx,eaves,z,d+.3,roofH*.98,.30,shade,yaw);
      window(xx+side*.18,base+h*.23,z,d*.46,h*.72,yaw);
      window(xx+side*.18,eaves+.36,z,d*.26,roofH*.56,yaw);
      // Corbie-steps follow the gable rather than a single triangular end cap.
      for(let k=-4;k<=4;k++) {
        const zz=z+k*d/9, high=roofH*(1-Math.abs(k)/4.8);
        put('block',xx,eaves+high/2,zz,.53,high+.15,d/9+.03,shade);
        put('block',xx,eaves+high+.11,zz,.82,.19,d/9+.19,limestone);
      }
      for(const s of [-1,1]) turret(xx,base,z+s*d*.45,1.16,h+1.2,5.3,ash);
    }
    for(const s of [-1,1]) {
      const bx=x+s*w*.27;put('block',bx,eaves+roofH*.84,z-1.4,1.6,6.4,1.12,dark);
      put('block',bx,eaves+roofH*.84+3.2,z-1.4,2.0,.35,1.45,limestone);
    }
  }
  function arcade(x,z,bays,spacing,base,h) {
    const span=bays*spacing;
    put('block',x,base+h+.70,z,span+.55,1.45,3.6,ash);put('ridge',x,base+h+1.39,z,4.4,2.8,span+1.1,slate,Math.PI/2);
    for(let i=0;i<=bays;i++){
      const xx=x-span/2+i*spacing;
      put('block',xx,base+h*.5,z,.8,h,3.2,stone);put('block',xx,base+h*.54,z,1.12,.34,3.5,limestone);
      if(i===bays)break;
      // Repeated arches with real openings; each half rises toward a pointed crown.
      for(const f of [-1,1]){
        const zz=z+f*1.64;
        for(const s of [-1,1]){
          const xm=xx+spacing/2, rise=h*.36;
          beam(xm+s*(spacing*.5-.17),base+h-rise,zz,xm+s*spacing*.32,base+h-rise*.39,zz,.22,limestone);
          beam(xm+s*spacing*.32,base+h-rise*.39,zz,xm,base+h-.05,zz,.22,limestone);
        }
      }
    }
  }
  lakeWing(40,-21.6,42,14,11.5,19.8,11.7,stone,7);
  arcade(37,-7.7,10,4.6,10.9,5.1);
  lakeWing(-43,-30,40,13.6,10,14.4,8.4,ash,8);
  arcade(-35.2,-18,6,4.4,9.6,5.5);
  turret(-67,9,-30.7,4.45,26.8,14,stone,true);
  turret(68,11,-23,3.6,18.2,10.7,ash,true);
  // The astronomy block has a square embattled belfry, distinct from the spires.
  const tx=55,tz=-32,base=11.4,height=32;
  put('block',tx,base+height/2,tz,9.4,height,9.4,ash);
  for(let i=0;i<4;i++) {
    const a=i*Math.PI/2,nx=Math.sin(a),nz=Math.cos(a),xx=tx+4.76*nx,zz=tz+4.76*nz;
    for(const side of [-1,1]) {
      window(xx+Math.cos(a)*side*2.0,base+height*.69,zz-Math.sin(a)*side*2.0,2.35,6.7,a);
      window(xx+Math.cos(a)*side*2.0,base+height*.39,zz-Math.sin(a)*side*2.0,1.9,4.4,a);
    }
    for(let k=-2;k<=2;k++) put('block',xx+Math.cos(a)*k*2.13,base+height+1.2,zz-Math.sin(a)*k*2.13,1.06,1.78,.83,stone,a);
  }
  put('block',tx,base+height-.16,tz,10.65,.75,10.65,limestone);
  put('spire',tx,base+height+2.8,tz,3.3,5.5,3.3,slate);
  batch.finish();
}

export function buildViaduct(scene,start,end,heightAt) {
  const batch=meshBatch(scene,'Viaduct • arches and cutwaters',new Set([ash,stone,limestone,dark]));
  const span=(start-end)/5, material=new THREE.MeshStandardMaterial({color:ash,roughness:.95});
  for(let i=0;i<5;i++) {
    const z=start-i*span,topA=heightAt(z)-.68,topB=heightAt(z-span)-.68;
    const spring=Math.max(-.44,topA-3.52),crown=(topA+topB)/2-.46,r=span/2-.71;
    const outline=new THREE.Shape();outline.moveTo(0,topA);outline.lineTo(span,topB);outline.lineTo(span,-1.3);
    outline.lineTo(span/2+r,-1.3);outline.lineTo(span/2+r,spring);
    for(let j=1;j<=20;j++){const a=j*Math.PI/20;outline.lineTo(span/2+r*Math.cos(a),spring+(crown-spring)*Math.sin(a));}
    outline.lineTo(span/2-r,-1.3);outline.lineTo(0,-1.3);outline.closePath();
    const mesh=new THREE.Mesh(new THREE.ExtrudeGeometry(outline,{depth:10.3,bevelEnabled:false}),material);
    mesh.rotation.y=Math.PI/2;mesh.position.set(-47.15,0,z);mesh.castShadow=mesh.receiveShadow=true;scene.add(mesh);
    for(const side of [-1,1]) {
      const x=-42+side*5.22;
      for(let j=0;j<13;j++) {
        const a=j/13*Math.PI,b=(j+1)/13*Math.PI;
        batch.beam(x,spring+(crown-spring)*Math.sin(a),z-span/2-r*Math.cos(a),
          x,spring+(crown-spring)*Math.sin(b),z-span/2-r*Math.cos(b),.25,j%2?stone:limestone);
      }
      batch.put('pillar',x,topA/2,z,.86,Math.max(.25,topA),.85,ash);
      batch.put('spire',x,topA+.42,z,1.01,.9,1.01,limestone);
    }
  }
  batch.finish();
}

export function buildLakeSkiff(group) {
  const batch=meshBatch(group,'Black Lake • clinker-built skiff'),{beam,put}=batch;
  const N=20,bands=[[.06,-.20],[.47,-.13],[.72,.02],[.92,.30],[1,.57]],positions=[],colors=[];
  function point(k,band,side) {
    const t=k/N,z=(t-.5)*5.9;
    const beam=Math.pow(Math.max(.0008,Math.sin(t*Math.PI)),.79)*1.28;
    const sheer=.29*Math.pow(Math.abs(t*2-1),2.4);
    return [side*beam*band[0],band[1]+sheer,z];
  }
  function triangle(a,b,c,tint) {
    positions.push(...a,...b,...c);const col=new THREE.Color(tint);
    for(let j=0;j<3;j++)colors.push(col.r,col.g,col.b);
  }
  for(let k=0;k<N;k++) {
    for(const side of [-1,1])for(let j=1;j<bands.length;j++){
      const a=point(k,bands[j-1],side),b=point(k+1,bands[j-1],side),c=point(k,bands[j],side),d=point(k+1,bands[j],side);
      const colour=[0x473322,0x72503a,0x664231,0x885d3a][j-1];triangle(a,b,c,colour);triangle(b,d,c,colour);
      beam(...c,...d,j===4?.064:.026,j===4?0xb88a53:0x4c3327);
    }
    const a=point(k,bands[0],-1),b=point(k,bands[0],1),c=point(k+1,bands[0],-1),d=point(k+1,bands[0],1);
    triangle(a,c,b,0x624b35);triangle(b,c,d,0x624b35);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geo.computeVertexNormals();
  const hull=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,side:THREE.DoubleSide,roughness:.88}));hull.castShadow=hull.receiveShadow=true;group.add(hull);
  for(let i=-2;i<=2;i++)put('block',i*.235,-.019,0,.218,.14,3.62-Math.abs(i)*.35,0x785d43);
  for(const z of [-1.30,.96])put('block',0,.37,z,1.89,.14,.48,0xa47d51);
  for(const side of [-1,1]){
    beam(side*.57,.56,-.48,side*2.16,.12,.84,.068,0x936941);
    beam(side*2.10,.12,.81,side*2.51,.025,1.16,.13,0xa47b50);
    put('ring',side*1.20,.59,.04,.12,.15,.12,0xb59a62);
  }
  put('round',0,.91,2.61,.055,.8,.055,0x5a473a);
  put('octagon',0,1.15,2.61,.17,.32,.17,0xffcd79,0,'glow');
  put('spire',0,1.36,2.61,.23,.18,.23,0x695636);
  batch.finish();
}
