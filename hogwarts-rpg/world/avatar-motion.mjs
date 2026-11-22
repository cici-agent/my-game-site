import * as THREE from 'three';

const clamp=THREE.MathUtils.clamp;
const lerp=THREE.MathUtils.lerp;
const damp=THREE.MathUtils.damp;
const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
const heldAxis=new THREE.Vector3(0,-.88,-.475).normalize();
const grip=new THREE.Vector3(.065,-.405,-.015);
export function orientHeldProp(geometry,tip){
  const endpoint=new THREE.Vector3(...tip);
  const rotation=new THREE.Quaternion().setFromUnitVectors(endpoint.clone().sub(grip).normalize(),heldAxis);
  geometry?.translate(-grip.x,-grip.y,-grip.z).applyQuaternion(rotation).translate(grip.x,grip.y,grip.z);
  return endpoint.sub(grip).applyQuaternion(rotation).add(grip);
}
export const MOTION_TIMINGS=Object.freeze({
  bolt:{duration:.56,release:.14},burst:{duration:.72,release:.24},shield:{duration:.66,release:.21},
  dodge:{duration:.48,release:0},hit:{duration:.32,release:0},block:{duration:.28,release:0}
});

// Every costume mesh keeps its slot/name, but its vertices now bend around actual
// elbow/knee joints. New clothes bind to the same rest matrices, even mid-motion.
export function createLimbRig(parent,kind,side){
  const a=new THREE.Bone(),b=new THREE.Bone(),c=new THREE.Bone();
  a.name=`${kind==='arm'?'Shoulder':'Hip'}${side>0?'R':'L'}`;
  b.name=`${kind==='arm'?'Elbow':'Knee'}${side>0?'R':'L'}`;
  c.name=`${kind==='arm'?'Wrist':'Ankle'}${side>0?'R':'L'}`;
  parent.add(a);a.add(b);b.add(c);
  b.position.set(kind==='arm'?side*.028:0,kind==='arm'?-.205:-.30,0);
  c.position.set(kind==='arm'?side*.035:0,kind==='arm'?-.192:-.25,0);
  parent.updateWorldMatrix(true,true);
  const restMatrix=parent.matrixWorld.clone();
  const skeleton=new THREE.Skeleton([a,b,c]);
  const tipOffset=new THREE.Vector3().addVectors(b.position,c.position);
  function skin(mesh,slot){
    const geometry=mesh.geometry,positions=geometry.attributes.position;
    const indices=[],weights=[];
    for(let i=0;i<positions.count;i++){
      const y=positions.getY(i);let w0=0,w1=0,w2=0;
      if(slot==='weapon'||slot==='gloves'||slot==='shoes')w2=1;
      else if(kind==='arm'){
        const bend=smooth((-y-.145)/.12),hand=slot==='legacy'?smooth((-y-.34)/.05):0;
        w0=1-bend;w1=bend*(1-hand);w2=bend*hand;
      }else{const bend=smooth((-y-.23)/.13),foot=smooth((-y-.48)/.06);w0=1-bend;w1=bend*(1-foot);w2=bend*foot;}
      indices.push(0,1,2,0);weights.push(w0,w1,w2,0);
    }
    geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(indices,4));
    geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute(weights,4));
    const skinned=new THREE.SkinnedMesh(geometry,mesh.material);
    skinned.name=mesh.name;skinned.userData={...mesh.userData};
    skinned.castShadow=mesh.castShadow;skinned.receiveShadow=mesh.receiveShadow;
    skinned.frustumCulled=false;
    mesh.removeFromParent();parent.add(skinned);
    skinned.bind(skeleton,restMatrix);
    return skinned;
  }
  return {root:a,bend:b,tip:c,tipOffset,skin,dispose:()=>skeleton.dispose()};
}

const zeroPose=()=>({x:0,y:0,z:0,rx:0,ry:0,rz:0,headX:0,headY:0,lx:0,ly:0,lz:0,le:0,lw:0,rxA:0,ryA:0,rzA:0,re:0,rw:0,rwy:0,brace:0});
function sampleFrames(frames,at){
  let lo=frames[0],hi=frames[frames.length-1];
  for(let i=1;i<frames.length;i++)if(at<=frames[i][0]){lo=frames[i-1];hi=frames[i];break;}
  const t=smooth((at-lo[0])/Math.max(.0001,hi[0]-lo[0])),p=zeroPose();
  for(const key of Object.keys(p))p[key]=lerp(lo[1][key]||0,hi[1][key]||0,t);
  return p;
}
function clipFrames(action,variant){
  const alternate=variant%2?1:-1;
  if(action==='burst')return [[0,{}],[.16,{y:-.06,rx:.04,ry:-.26,rxA:.18,ryA:-.45,rzA:-.18,re:1.13,rw:.12,lx:.45,le:.65,lz:-.22,brace:.18}],[.24,{z:-.035,rx:-.09,ry:.18,rxA:1.02,ryA:.02,rzA:.02,re:.12,rw:-.48,lx:.72,le:.34,lz:-.28,brace:.24}],[.36,{rx:-.065,ry:.13,rxA:.94,re:.18,rw:-.38,lx:.60,le:.36,brace:.19}],[.72,{}]];
  if(action==='shield')return [[0,{}],[.11,{y:-.035,ry:-.14,rxA:.38,ryA:.30,rzA:.3,re:1.10,rw:-.15,lx:.40,le:.8,lz:-.2,brace:.18}],[.21,{y:-.055,rx:-.035,ry:.13,rxA:.95,ryA:-.15,rzA:-.26,re:.38,rw:-.5,rwy:.3,lx:.85,le:.5,lz:-.18,brace:.25}],[.36,{y:-.04,rxA:.8,ryA:-.14,rzA:-.1,re:.55,rw:-.3,lx:.6,le:.6,brace:.2}],[.66,{}]];
  if(action==='dodge')return [[0,{}],[.07,{y:-.09,rx:-.08,rz:-.10,x:.035,lx:.65,lz:-.36,le:.7,rxA:.55,rzA:.3,re:.8,brace:.36}],[.22,{y:-.075,rz:.14,x:-.05,rxA:.4,re:.65,lx:.45,le:.6,brace:.30}],[.48,{}]];
  return [[0,{}],[.075,{y:-.018,ry:-.10*alternate,rxA:.32,ryA:-.22*alternate,rzA:.08*alternate,re:.94,rw:.08*alternate,lx:.25,le:.3,brace:.05}],[.14,{rx:-.045,ry:.10*alternate,rxA:.88,ryA:.05*alternate,rzA:-.1*alternate,re:.22,rw:-.35,rwy:.18*alternate,lx:.37,le:.32,lz:-.06,brace:.08}],[.22,{rx:-.025,ry:.06*alternate,rxA:.78,ryA:.08*alternate,re:.30,rw:-.25,lx:.28,le:.28,brace:.05}],[.56,{}]];
}

export function createAvatarMotion({body,head,arms,legs,armRigs,legRigs,glow,seed=0}){
  let clock=0,phase=0,gait=0,run=0,airBlend=0,landing=0,lastAir=false,down=0,ready=0,guard=0;
  let clip=null,sequence=0,legacyCasting=false,suppressLegacy=false,impact=0,impactKind='hit';
  let currentPose=zeroPose();
  const neutralHeadY=head.position.y;
  const aimOrientation=new THREE.Quaternion().setFromUnitVectors(heldAxis,new THREE.Vector3(0,0,-1));
  const aimParent=new THREE.Quaternion(),aimWrist=new THREE.Quaternion();
  function playAction(action='bolt'){
    const timing=MOTION_TIMINGS[action]||MOTION_TIMINGS.bolt;
    if(action==='hit'||action==='block'){impact=1;impactKind=action;return {...timing};}
    // Capture the preceding pose so rapid attacks blend rather than snapping to rest.
    clip={action,age:0,frames:clipFrames(action,sequence++),from:{...currentPose},...timing};
    suppressLegacy=true;
    return {...timing};
  }
  function reset(){clock=0;phase=0;gait=0;run=0;airBlend=0;landing=0;lastAir=false;down=0;ready=0;guard=0;clip=null;impact=0;legacyCasting=false;suppressLegacy=false;currentPose=zeroPose();
    body.position.set(0,0,0);body.rotation.set(0,0,0);head.rotation.set(0,0,0);head.position.y=neutralHeadY;
    for(const [i,arm] of arms.entries()){arm.rotation.set(0,0,i? .1:-.1);armRigs[i].bend.rotation.set(0,0,0);armRigs[i].tip.rotation.set(0,0,0);}
    for(const [i,leg] of legs.entries()){leg.rotation.set(0,0,0);legRigs[i].bend.rotation.set(0,0,0);legRigs[i].tip.rotation.set(0,0,0);}
    glow.visible=false;
  }
  function animate(dt,{moving=false,speed=0,jump=0,casting=false,grounded,verticalVelocity=0,combat=false,guarded=false,downed=false}={}){
    dt=clamp(Number(dt)||0,0,.1);clock+=dt;
    if(casting&&!legacyCasting&&!suppressLegacy)playAction('bolt');
    legacyCasting=Boolean(casting);if(!casting)suppressLegacy=false;
    const airborne=typeof grounded==='boolean'?!grounded:typeof jump==='boolean'?jump:Number(jump)>.03;
    if(lastAir&&!airborne)landing=1;
    lastAir=airborne;
    landing=damp(landing,0,12,dt);airBlend=damp(airBlend,airborne?1:0,airborne?16:13,dt);
    const velocity=Number.isFinite(speed)&&speed>0?speed:(moving?3.1:0);
    gait=damp(gait,moving?clamp(velocity/2.1,0,1):0,moving?10:9,dt);
    run=damp(run,clamp((velocity-3.5)/2.1,0,1),8,dt);
    // Cadence is tied to distance traveled; idle never advances the foot cycle.
    const halfStride=.36+.04*run,stanceFraction=.59;
    phase+=velocity*dt*(2*Math.PI)/(2*halfStride/stanceFraction);
    ready=damp(ready,combat?1:0,7,dt);guard=damp(guard,guarded?1:0,9,dt);down=damp(down,downed?1:0,5,dt);
    let pose=zeroPose(),castGlow=0,aimWeight=0;
    if(clip){clip.age=Math.min(clip.duration,clip.age+dt);pose=sampleFrames(clip.frames,clip.age);
      const blend=smooth(clip.age/.075);for(const key of Object.keys(pose))pose[key]=lerp(clip.from[key],pose[key],blend);
      castGlow=clip.action==='dodge'?0:Math.max(0,1-Math.abs(clip.age-clip.release)/.13);
      if(clip.action!=='dodge')aimWeight=smooth(clip.age/clip.release)*(1-smooth((clip.age-clip.release-.045)/.23));
      if(clip.age>=clip.duration)clip=null;
    }
    currentPose=pose;
    const breath=Math.sin(clock*1.85+(seed%7))*.006;
    const onGround=1-airBlend;
    const locomotion=gait*onGround*(1-down);
    const footCycle=(phase/(Math.PI*2))%1;
    const compress=landing*.10+pose.brace*.12;
    const strideLength=halfStride*locomotion;
    let supportZ=0;
    for(let i=0;i<2;i++){const t=(footCycle+i*.5)%1;if(t<.59)supportZ=Math.max(supportZ,Math.abs(lerp(-strideLength,strideLength,t/.59)));}
    const supportDrop=(.55-Math.sqrt(Math.max(.04,.548*.548-supportZ*supportZ)))*onGround;
    const bounce=(Math.cos(phase*2)*.012+.009)*locomotion;
    body.position.set(pose.x+Math.cos(phase)*.014*locomotion,breath*(1-gait)+bounce-supportDrop-compress+pose.y-down*.28,pose.z);
    body.rotation.set(-.045*locomotion-.055*run*locomotion+pose.rx-airBlend*.045+down*.28,
      Math.sin(phase)*.035*locomotion+pose.ry,Math.cos(phase)*.018*locomotion+pose.rz+down*.14);
    head.rotation.set(.015+pose.headX-body.rotation.x*.45+landing*.065+down*.12,-body.rotation.y*.35+pose.headY+Math.sin(clock*.7+seed%4)*.018*(1-gait-ready*.7),-body.rotation.z*.4);
    const swing=Math.sin(phase)*locomotion;
    arms[0].rotation.set(-swing*(.36+.17*run)+.12*ready+.15*guard+pose.lx+.30*airBlend,pose.ly,-.10-.08*airBlend+pose.lz);
    arms[1].rotation.set(swing*(.32+.13*run)+.22*ready+.18*guard+pose.rxA+.26*airBlend,pose.ryA,.10+.07*airBlend+pose.rzA);
    armRigs[0].bend.rotation.x=.10+.40*run*locomotion+.12*ready+pose.le+.38*airBlend;
    armRigs[1].bend.rotation.x=.12+.40*run*locomotion+.35*ready+.2*guard+pose.re+.34*airBlend;
    armRigs[0].tip.rotation.set(pose.lw,0,0);
    armRigs[1].tip.rotation.set(pose.rw,pose.rwy,0);
    if(aimWeight>0){
      aimParent.copy(body.quaternion).multiply(arms[1].quaternion).multiply(armRigs[1].root.quaternion).multiply(armRigs[1].bend.quaternion);
      aimWrist.copy(aimParent).invert().multiply(aimOrientation);
      armRigs[1].tip.quaternion.slerp(aimWrist,aimWeight);
    }
    // Solve two-link legs against a stance/swing path. The planted foot stays level;
    // the returning foot lifts at the knee, then leads with its heel on contact.
    for(let i=0;i<2;i++){
      const t=(footCycle+i*.5)%1,stance=.59;
      let z,y,roll;
      const stride=strideLength;
      if(t<stance){const u=t/stance;z=lerp(-stride,stride,u);y=-.55-body.position.y;roll=lerp(.12,-.13,u)*locomotion;}
      else{const u=(t-stance)/(1-stance),a=smooth(u);z=lerp(stride,-stride,a);y=-.55-body.position.y+Math.sin(Math.PI*u)*(.095+.09*run)*locomotion;roll=Math.sin(Math.PI*u)*-.18*locomotion;}
      z+=ready*(i===0?-.055:.055)*(1-gait);
      y=lerp(y,-.43+Math.max(0,verticalVelocity)*.008,airBlend);
      z=lerp(z,i===0?-.11:.10,airBlend);
      y+=down*.16;z+=down*(i===0?-.11:.06);
      const l1=.30,l2=.25,d=clamp(Math.hypot(y,z),.12,l1+l2-.002);
      const hip=Math.atan2(-z,-y)+Math.acos(clamp((l1*l1+d*d-l2*l2)/(2*l1*d),-1,1));
      const knee=-(Math.PI-Math.acos(clamp((l1*l1+l2*l2-d*d)/(2*l1*l2),-1,1)));
      legs[i].rotation.set(hip,0,(i?1:-1)*(.015*ready+.045*airBlend));
      legRigs[i].bend.rotation.x=knee;
      legRigs[i].tip.rotation.x=-(hip+knee)+roll;
    }
    if(impact>0){const recoil=Math.sin(impact*Math.PI)*(impactKind==='block'?.045:.10);body.rotation.x-=recoil;body.position.z+=recoil*.25;head.rotation.x+=recoil*.8;arms[0].rotation.x+=recoil*2;impact=Math.max(0,impact-dt/(impactKind==='block'?.28:.32));}
    glow.visible=castGlow>.08&&!downed;glow.scale.setScalar(.65+castGlow*.8);
  }
  return {animate,playAction,reset,getState:()=>({phase,gait,airBlend,landing,action:clip?.action||null,progress:clip?clip.age/clip.duration:1})};
}
