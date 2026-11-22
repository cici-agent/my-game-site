import * as THREE from 'three';

const brass='#ab8950',stone='#675e55',wood='#563f32';
const accents=['#bce8ff','#a3edbf','#c4efff','#a7d9ff','#abbeff','#ff9561','#ff9d8e'];

function mesh(parent,geometry,color,x,y,z,lit=false){
  const material=new THREE.MeshStandardMaterial({color,roughness:lit?.23:.7,metalness:lit?.3:.1,
    ...(lit?{emissive:color,emissiveIntensity:.53}:{})});
  const node=new THREE.Mesh(geometry,material);node.position.set(x,y,z);parent.add(node);return node;
}
function box(parent,color,x,y,z,w,h,d){
  return mesh(parent,new THREE.BoxGeometry(w,h,d),color,x,y,z);
}
function orb(parent,color,x,y,z,r,lit=true){
  return mesh(parent,new THREE.SphereGeometry(r,16,12),color,x,y,z,lit);
}
function stem(parent,color,x,y,z,top,bottom,height){
  return mesh(parent,new THREE.CylinderGeometry(top,bottom,height,12),color,x,y,z);
}
function hoop(parent,color,x,y,z,r,tube=.024){
  return mesh(parent,new THREE.TorusGeometry(r,tube,8,32),color,x,y,z,true);
}
function rod(parent,color,a,b,r){
  const from=new THREE.Vector3(...a),to=new THREE.Vector3(...b),d=to.clone().sub(from);
  const part=mesh(parent,new THREE.CylinderGeometry(r,r*.74,d.length(),8),color,0,0,0);
  part.position.copy(from).lerp(to,.5);part.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());return part;
}
function mirror(group,color,broken){
  if(broken){
    const shard=mesh(group,new THREE.OctahedronGeometry(.29),color,0,.1,0,true);
    shard.scale.set(.67,1.34,.14);shard.rotation.z=-.27;return;
  }
  const glass=orb(group,color,0,.14,0,.32);glass.scale.set(.82,1.35,.12);
  const rim=hoop(group,brass,0,.14,.012,.33,.034);rim.scale.set(.82,1.32,1);
  stem(group,brass,0,-.33,0,.032,.077,.28);
}
function stag(group,color){
  const body=orb(group,color,0,0,0,.18);body.scale.set(1.45,.76,.67);
  rod(group,color,[.11,.02,0],[.23,.27,0],.085);
  const head=orb(group,color,.27,.28,0,.095);head.scale.x=1.4;
  for(const side of [-1,1]){
    for(const x of [-.15,.14])rod(group,color,[x,-.02,side*.07],[x-.04,-.29,side*.10],.027);
    rod(group,color,[.24,.31,side*.045],[.17,.62,side*.19],.017);
    rod(group,color,[.21,.45,side*.10],[.07,.54,side*.18],.015);
  }
}
function cup(group,color){
  stem(group,brass,0,-.24,0,.06,.21,.10);stem(group,brass,0,-.12,0,.055,.056,.20);
  stem(group,color,0,.13,0,.23,.075,.32);
  for(const s of [-1,1]){const h=hoop(group,brass,s*.23,.16,0,.109,.023);h.scale.y=1.25;}
}
function relic(group,book,index){
  const color=accents[book-1];
  switch(book){
    case 1:case 2:mirror(group,color,book===2&&index===0);break;
    case 3:
      if(index===0){
        orb(group,color,0,0,0,.15);
        for(let i=0;i<5;i++)orb(group,color,.19*Math.cos(i*2),.13*Math.sin(i*1.5),.19*Math.sin(i*2),.039);
      }else stag(group,color);
      break;
    case 4:cup(group,color);break;
    case 5:{
      orb(group,color,0,.08,0,.235);const band=hoop(group,brass,0,.08,0,.25);band.rotation.x=1.12;
      if(index===1){const ward=hoop(group,color,0,.12,0,.47);ward.scale.y=1.18;}
      break;}
    case 6:
      for(let i=0;i<3;i++){
        const fire=mesh(group,new THREE.OctahedronGeometry(.28),i===1?'#ffce80':color,(i-1)*.16,.09,0,true);
        fire.scale.set(.5,1.45,.62);fire.rotation.z=(i-1)*-.28;
      }break;
    case 7:
      rod(group,wood,[-.23,-.24,0],[.25,.26,0],.035);
      rod(group,brass,[-.24,-.25,0],[-.12,-.115,0],.048);
      orb(group,color,.25,.26,0,.048);break;
  }
}

// The first collectible travels beside its owner until the second trial uses it.
export function makeTrialProp(volume,index,spot){
  const root=new THREE.Group(),item=new THREE.Group(),color=accents[volume.book-1];
  root.name=volume.stage+'-trial-'+(index+1);
  item.name='relic';
  const [x,z]=spot;root.position.set(x,0,z);
  stem(root,stone,0,.105,0,.41,.50,.21);stem(root,brass,0,.25,0,.25,.30,.08);
  root.add(item);relic(item,volume.book,index);
  const ring=hoop(root,color,0,.32,0,.35,.016);ring.rotation.x=-Math.PI/2;
  const baseY=.91;
  return {root,update(t,active,done,carry,effect,pose){
    ring.visible=active||effect>0;
    ring.scale.setScalar(1+(effect>0?effect*1.6:.06*Math.sin(t*4)));
    item.rotation.y=t*.59+index*.8;
    item.position.set(0,baseY+.055*Math.sin(t*2.6+index),0);item.scale.setScalar(1);
    if(carry>0){
      item.position.x=(pose.x+.41*Math.cos(pose.yaw)-x)*carry;
      item.position.z=(pose.z-.41*Math.sin(pose.yaw)-z)*carry;
      item.position.y+=(.44+.12*Math.sin(t*4))*carry;
      item.scale.setScalar(1-.42*carry);
    }else if(effect>0){
      item.position.y+=.38*Math.sin(effect*Math.PI);
      item.rotation.y+=effect*Math.PI*1.5;
      if(volume.book===6&&index===1)item.scale.setScalar(1-effect*.94);
    }
    item.visible=!(done&&volume.trial[index][1]==='collect'&&carry===0)
      &&!(done&&volume.book===6&&index===1);
  }};
}

export function makeJournal(){
  const root=new THREE.Group(),book=new THREE.Group();root.add(book);
  stem(root,stone,0,.42,0,.19,.27,.84);
  const top=box(root,wood,0,.86,0,.86,.09,.53);top.rotation.x=.12;
  book.position.y=1.04;book.rotation.x=.32;
  for(const sign of [-1,1]){
    const g=new THREE.Group();g.rotation.z=sign*.12;g.position.x=sign*.17;book.add(g);
    box(g,'#704e36',0,0,0,.35,.05,.44);
    box(g,'#d8c69e',0,.036,0,.32,.06,.414);
    for(let i=0;i<4;i++)box(g,'#917b61',0,.069,i*.064-.11,.22-i*.019,.004,.009);
  }
  return {root,update(t){book.position.y=1.04+.027*Math.sin(1.7*t);}};
}
