import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createAvatar} from '../world/player.mjs';
import {MOTION_TIMINGS} from '../world/avatar-motion.mjs';

function tick(model,seconds,options={},fps=60){for(let i=0;i<Math.round(seconds*fps);i++)model.animate(1/fps,options);model.root.updateMatrixWorld(true);}
function finite(model){model.root.traverse(node=>{assert(node.matrixWorld.elements.every(Number.isFinite),node.name);});}

test('casts have distinct authored release poses and hit impulses preserve a spell',()=>{
  const model=createAvatar({variant:'harry',isPlayer:true});
  try{
    const states=[];
    for(const action of ['bolt','bolt','burst','shield']){
      const timing=model.playAction(action);assert.equal(timing.release,MOTION_TIMINGS[action].release);
      tick(model,timing.release,{combat:true});
      states.push(model.getWandTip().toArray());
      if(action==='burst'){model.playAction('hit');assert.equal(model.getMotionState().action,'burst');}
      tick(model,1,{combat:true});assert.equal(model.getMotionState().action,null);finite(model);
    }
    assert.notDeepEqual(states[0],states[1]);assert.notDeepEqual(states[0],states[2]);assert.notDeepEqual(states[2],states[3]);
    const initial=model.root.position.clone();model.playAction('dodge');tick(model,.3);assert.deepEqual(model.root.position,initial);
  }finally{model.dispose();}
});

test('feet articulate, idle cadence stops, and jump landing settles without moving physics root',()=>{
  const model=createAvatar({variant:'ron',isPlayer:true});
  try{
    tick(model,.5,{moving:true,speed:3.35,grounded:true});
    const phase=model.getMotionState().phase;
    assert(model.root.getObjectByName('KneeL').rotation.x<-.05);
    tick(model,.3,{grounded:true});assert.equal(model.getMotionState().phase,phase);
    model.root.position.y=1;tick(model,.2,{grounded:false,verticalVelocity:3});
    assert(model.getMotionState().airBlend>.8);assert.equal(model.root.position.y,1);
    model.root.position.y=0;tick(model,1/60,{grounded:true});assert(model.getMotionState().landing>.7);
    tick(model,1,{grounded:true});assert(model.getMotionState().landing<.001);assert.equal(model.root.position.y,0);finite(model);
  }finally{model.dispose();}
});

test('wardrobe weapons stay rigid at the wrist and bind correctly when changed mid-cast',()=>{
  const model=createAvatar({variant:'hermione',isPlayer:true});
  try{
    model.playAction('burst');tick(model,.2,{combat:true});
    for(const weapon of ['holly','willow','vine','staff']){
      model.setEquipment({weapon});const mesh=model.root.getObjectByName(`weapon/${weapon}`);
      assert(mesh.isSkinnedMesh);const w=mesh.geometry.attributes.skinWeight;
      for(let i=0;i<w.count;i++){assert.equal(w.getZ(i),1);assert.equal(w.getX(i)+w.getY(i)+w.getW(i),0);}
      model.root.updateMatrixWorld(true);mesh.skeleton.update();
      const p=mesh.geometry.attributes.position,a=new THREE.Vector3().fromBufferAttribute(p,0),b=new THREE.Vector3().fromBufferAttribute(p,p.count-1);
      const distance=a.distanceTo(b);mesh.applyBoneTransform(0,a);mesh.applyBoneTransform(p.count-1,b);assert(Math.abs(a.distanceTo(b)-distance)<1e-6);
      assert(model.getWandTip().toArray().every(Number.isFinite));
    }
    model.resetMotion();assert.equal(model.getMotionState().action,null);finite(model);
  }finally{model.dispose();}
});

test('legacy boolean casting triggers one clip and all five students have articulated limbs',()=>{
  for(const variant of ['harry','ron','hermione','neville','george']){
    const model=createAvatar({variant});
    try{
      for(const name of ['ElbowL','ElbowR','KneeL','KneeR','WristR','AnkleR'])assert(model.root.getObjectByName(name),variant+' '+name);
      tick(model,1,{casting:true});assert.equal(model.getMotionState().action,null);
      tick(model,.1,{casting:false});tick(model,.1,{casting:true});assert.equal(model.getMotionState().action,'bolt');finite(model);
    }finally{model.dispose();}
  }
});

test('motion converges across rendering frame rates without nonfinite joints',()=>{
  const a=createAvatar({variant:'harry'}),b=createAvatar({variant:'harry'});
  try{
    a.playAction('shield');b.playAction('shield');tick(a,1,{moving:true,speed:3.35,grounded:true},30);tick(b,1,{moving:true,speed:3.35,grounded:true},60);
    assert(Math.abs(a.getMotionState().phase-b.getMotionState().phase)<1e-7);
    assert(Math.abs(a.getWandTip().y-b.getWandTip().y)<.03);finite(a);finite(b);
  }finally{a.dispose();b.dispose();}
});

test('walking and running support feet stay close to the floor',()=>{
  for(const speed of [3.35,5.65]){
    const model=createAvatar({variant:'harry'});
    try{
      for(let frame=0;frame<90;frame++){
        model.animate(1/60,{moving:true,speed,grounded:true});model.root.updateMatrixWorld(true);
        if(frame%5)continue;
        const phase=model.getMotionState().phase/(2*Math.PI);
        for(let side=0;side<2;side++){
          if((phase+side*.5)%1>=.59)continue;
          const mesh=model.root.getObjectByName(side?'LegR':'LegL').children.find(n=>n.name==='shoes/oxfords');
          let sole=Infinity;const point=new THREE.Vector3();
          for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,point);point.applyMatrix4(mesh.matrixWorld);sole=Math.min(sole,point.y);}
          assert(sole>-.04&&sole<.06,`stance foot y ${sole} at speed ${speed}`);
        }
      }
    }finally{model.dispose();}
  }
});

test('support-foot backward stride matches root travel at walking and running speed',()=>{
  for(const speed of [3.35,5.65]){
    const model=createAvatar({variant:'harry'}),previous=[null,null];let sum=0,samples=0;
    try{
      for(let frame=0;frame<150;frame++){
        model.root.position.z-=speed/60;model.animate(1/60,{moving:true,speed,grounded:true});model.root.updateMatrixWorld(true);
        for(let side=0;side<2;side++){
          const t=(model.getMotionState().phase/(2*Math.PI)+side*.5)%1;
          const ankle=model.root.getObjectByName(side?'AnkleR':'AnkleL').getWorldPosition(new THREE.Vector3());
          if(frame>60&&t>.08&&t<.5&&previous[side]){sum+=Math.abs(ankle.z-previous[side].z);samples++;}
          previous[side]=ankle;
        }
      }
      assert(samples>20);assert(sum/samples<(speed/60)*.1,'support-foot sliding exceeds 10% of travel');
    }finally{model.dispose();}
  }
});

test('all five students point the actual wand tip forward at spell release',()=>{
  for(const variant of ['harry','ron','hermione','neville','george']){
    const model=createAvatar({variant});
    try{
      model.root.rotation.y=.7;model.playAction('burst');tick(model,.24,{combat:true},100);
      const wrist=model.root.getObjectByName('WristR');
      const grip=wrist.localToWorld(new THREE.Vector3(.002,-.008,-.015));
      const actual=model.getWandTip().sub(grip).normalize();
      const expected=new THREE.Vector3(0,0,-1).applyQuaternion(model.root.quaternion);
      assert(actual.dot(expected)>.995,`${variant} wand release must aim forward`);
    }finally{model.dispose();}
  }
});
