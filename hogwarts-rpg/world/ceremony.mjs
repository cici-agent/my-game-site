import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {createAvatar} from './player.mjs';

const tau=Math.PI*2;
const smooth=v=>{const t=THREE.MathUtils.clamp(v,0,1);return t*t*(3-2*t);};

function polygon(points){
  const outline=new THREE.Shape();
  points.forEach(([x,y],i)=>i?outline.lineTo(x,y):outline.moveTo(x,y));
  outline.closePath();
  return outline;
}

// Gold border, enamel, seven sun rays and an open book are struck into one two-sided medal.
function castMedal(){
  const pieces=[],matrix=new THREE.Object3D();
  function relief(geometry,color,x,y,z,scale=1,angle=0){
    const flat=geometry.index?geometry.toNonIndexed():geometry;
    if(flat!==geometry)geometry.dispose();
    matrix.position.set(x,y,z);matrix.scale.setScalar(scale);matrix.rotation.set(0,0,angle);matrix.updateMatrix();
    flat.applyMatrix4(matrix.matrix);
    flat.deleteAttribute('uv');
    const tint=new THREE.Color(color),rgb=new Float32Array(flat.attributes.position.count*3);
    for(let i=0;i<rgb.length;i+=3)tint.toArray(rgb,i);
    flat.setAttribute('color',new THREE.BufferAttribute(rgb,3));pieces.push(flat);
  }
  const stamp=(outline,depth=.036)=>new THREE.ExtrudeGeometry(outline,{depth,bevelEnabled:true,bevelSize:.016,bevelThickness:.012,bevelSegments:1,curveSegments:12});
  const crest=new THREE.Shape();
  crest.moveTo(-.70,.61);crest.quadraticCurveTo(-.30,.60,0,.78);crest.quadraticCurveTo(.30,.60,.70,.61);
  crest.lineTo(.66,-.10);crest.quadraticCurveTo(.62,-.54,0,-.89);crest.quadraticCurveTo(-.62,-.54,-.66,-.10);crest.closePath();
  relief(stamp(crest,.13),'#c89c50',0,0,-.09);
  relief(stamp(crest,.06),'#245a54',0,0,.049,.89);
  const halfSun=new THREE.Shape();
  halfSun.moveTo(-.18,.02);halfSun.absarc(0,.02,.18,Math.PI,0,true);halfSun.closePath();
  relief(stamp(halfSun),'#f2c36e',0,.07,.115);
  for(let i=0;i<7;i++){
    const angle=.20+i*(Math.PI-.40)/6;
    relief(stamp(polygon([[-.022,.0],[.021,.0],[0,.145]]),.018),'#eac16f',Math.cos(angle)*.27,.091+Math.sin(angle)*.27,.125,1,angle-Math.PI/2);
  }
  for(const side of [-1,1]){
    const page=polygon([[0,-.11],[side*.16,-.06],[side*.42,-.004],[side*.40,-.24],[side*.16,-.28],[0,-.34]]);
    relief(stamp(page,.021),'#ead099',0,0,.132);
    const ink=polygon([[side*.071,-.153],[side*.31,-.096],[side*.31,-.123],[side*.071,-.18]]);
    relief(stamp(ink,.006),'#ba965a',0,0,.160);
  }
  const result=mergeGeometries(pieces);
  for(const p of pieces)p.dispose();
  return result;
}

function welcome(w,variant,name,x,z,offset){
  const actor=createAvatar({variant,name});
  w.layers.add(actor.root);w.nested.push(actor);
  const body=actor.root.children[0];
  const hand=body.children.find(node=>node.isGroup&&node.position.x<-.20&&node.position.y>1.1);
  let previous=null;
  w.ticks.push(t=>{
    const dt=previous===null?0:Math.max(0,Math.min(.1,t-previous));previous=t;
    const phase=(t+offset)%13;
    const outbound=phase<2.9,homeward=phase>6.2&&phase<9.1;
    const moving=outbound||homeward;
    const path=outbound?smooth(phase/2.9):phase<6.2?1:homeward?1-smooth((phase-6.2)/2.9):0;
    actor.root.position.set(x,0,z-path*1.55);
    const greetYaw=Math.atan2(x,actor.root.position.z-3.5);
    const facing=moving?(outbound?0:Math.PI):greetYaw;
    if(!dt)actor.root.rotation.y=facing;
    else{
      const difference=facing-actor.root.rotation.y;
      actor.root.rotation.y+=Math.atan2(Math.sin(difference),Math.cos(difference))*(1-Math.exp(-dt*4.4));
    }
    const restTime=phase<6.2?phase-2.9:phase-9.1;
    const salute=moving?0:smooth(restTime/.52)*smooth((3.28-restTime)/.62);
    actor.animate(dt,{moving,speed:1.45,casting:variant==='flitwick'&&salute>.48,time:t});
    if(variant==='hagrid'&&hand){
      hand.rotation.z=THREE.MathUtils.lerp(hand.rotation.z,-2.36+Math.sin(t*6.5)*.23,salute);
      hand.rotation.x+=salute*.38;
    }else body.rotation.x+=salute*(.07+.055*Math.sin(t*2));
  });
}

export function addDawnCeremony(w){
  const gold=w.customMaterial('dawn-medal',{vertexColors:true,metalness:.26,roughness:.53});
  const crest=new THREE.Mesh(w.geo('dawn-medal',castMedal),gold);
  crest.name='黎明勋章';w.layers.add(crest);
  const centerZ=-4.85;
  const waxGeom=w.geo('banquet-wax',()=>new THREE.CylinderGeometry(.047,.052,.38,10));
  const fireGeom=w.geo('banquet-flame',()=>new THREE.SphereGeometry(1,8,6));
  const floating=[];
  for(const side of [-1,1])for(const column of [0,1])for(let row=0;row<6;row++){
    floating.push([side*(column?3.2:1.73)+w.random()*.29,3.48+column*.6+w.random()*.44,-7.6+row*2.86+w.random()*.33,w.random()*tau]);
  }
  const wax=new THREE.InstancedMesh(waxGeom,w.material('#efdaa7'),floating.length);
  const flames=new THREE.InstancedMesh(fireGeom,w.flame,floating.length);
  for(const batch of [wax,flames]){
    batch.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    batch.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,3.9,0),9.8);
    w.layers.add(batch);w.disposables.push(batch);
  }
  const moteCount=46,positions=new Float32Array(moteCount*3);
  const moteGeo=w.geo('dawn-sparks',()=>new THREE.BufferGeometry());
  const attrib=new THREE.BufferAttribute(positions,3);attrib.setUsage(THREE.DynamicDrawUsage);
  moteGeo.setAttribute('position',attrib);moteGeo.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,2.66,centerZ),2.5);
  const sprite=w.texture('dawn glint',32,32,(ctx,W,H)=>{
    const light=ctx.createRadialGradient(16,16,0,16,16,16);
    light.addColorStop(0,'#ffffff');light.addColorStop(.19,'#fff3c9');light.addColorStop(.5,'rgba(255,220,138,.48)');light.addColorStop(1,'rgba(255,218,120,0)');
    ctx.fillStyle=light;ctx.fillRect(0,0,W,H);
  });
  const glints=new THREE.PointsMaterial({map:sprite,color:'#ffdda3',size:.075,transparent:true,opacity:.94,depthWrite:false,toneMapped:false});
  w.materials.set('dawn-glints',glints);w.layers.add(new THREE.Points(moteGeo,glints));
  const m=new THREE.Object3D();
  w.ticks.push(t=>{
    crest.position.set(0,2.88+.12*Math.sin(t*.84),centerZ);crest.rotation.set(.026*Math.cos(t*.83),Math.sin(t*.64)*.38,.032*Math.sin(t*.74));
    for(const [i,[x,y,z,phase]] of floating.entries()){
      const lift=.11*Math.sin(t*.9+phase),Y=y+lift;
      m.position.set(x,Y,z);m.scale.set(1,1,1);m.rotation.set(0,0,.037*Math.sin(t*.71+phase));m.updateMatrix();wax.setMatrixAt(i,m.matrix);
      m.position.y=Y+.26;m.scale.set(.041,.092+.021*Math.sin(t*4.7+phase),.041);m.updateMatrix();flames.setMatrixAt(i,m.matrix);
    }
    wax.instanceMatrix.needsUpdate=true;flames.instanceMatrix.needsUpdate=true;
    for(let i=0;i<moteCount;i++){
      const u=(i/moteCount+t*.115)%1,a=i*2.39996+t*.69;
      const radius=.64+.84*Math.sin(u*Math.PI);
      positions[i*3]=radius*Math.cos(a);positions[i*3+1]=1.11+u*2.84;positions[i*3+2]=centerZ+.68*radius*Math.sin(a);
    }
    attrib.needsUpdate=true;
  });
  welcome(w,'hagrid','海格',-4.04,1.47,3.46);
  welcome(w,'flitwick','弗立维教授',4.10,1.89,7.25);
}
