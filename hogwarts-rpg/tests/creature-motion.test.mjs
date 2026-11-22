import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCreature} from '../world/chapter-creature.mjs';

const target={x:0,z:5};
const running={status:'active',started:true,phase:'waiting',moveSpeed:1.7,dt:1/60};
function release(model){const geometry=new Set(),material=new Set();model.root.traverse(node=>{if(node.geometry)geometry.add(node.geometry);if(node.material)material.add(node.material);});for(const item of geometry)item.dispose();for(const item of material)item.dispose();}
test('creature chase bends knees, respects pause and resets its gait',()=>{
  for(const kind of ['normal','elite','troll']){
    const model=buildCreature(kind);try{
      let bent=false;
      for(let i=0;i<40;i++){model.update(running,i/60,target);if(model.root.getObjectByName('CreatureKneeL').rotation.x>.1)bent=true;}
      assert(bent,`${kind} uses a knee rather than rigid leg dragging`);
      const before=[];model.root.traverse(node=>before.push(...node.position,...node.rotation.toArray().slice(0,3)));
      model.update({...running,dt:0},9,target);
      const after=[];model.root.traverse(node=>after.push(...node.position,...node.rotation.toArray().slice(0,3)));
      assert.deepEqual(after,before);
      model.resetMotion();assert.equal(model.root.getObjectByName('CreatureKneeL').rotation.x,0);
    }finally{release(model);}
  }
});
test('club coils then lands at charge completion and holds its follow-through',()=>{
  const model=buildCreature('troll');try{
    const arm=model.root.getObjectByName('CreatureClubArm');
    model.update({...running,phase:'windup',windupProgress:.7},.7,target);
    assert(arm.rotation.x<-1.8);
    model.update({...running,phase:'windup',windupProgress:1},.8,target);
    const impact=arm.rotation.x;assert(impact>.85);
    model.update({...running,phase:'opening',moveSpeed:0},.85,target);
    assert(Math.abs(arm.rotation.x-impact)<.05,'contact must not jump back into the windup');
  }finally{release(model);}
});
test('hit reaction decays and defeat settles over time instead of snapping',()=>{
  const model=buildCreature('troll');try{
    const body=model.root.getObjectByName('CreatureBody'),torso=model.root.getObjectByName('CreatureTorso');
    model.react('hit');model.update({...running,moveSpeed:0},.05,target);
    assert(torso.rotation.x<-.04);
    for(let i=1;i<=120;i++)model.update({...running,moveSpeed:0},.05+i/60,target);
    assert(Math.abs(torso.rotation.x)<.001);
    model.update({...running,status:'won'},3,target);assert(body.rotation.z<.1);
    for(let i=0;i<60;i++)model.update({...running,status:'won'},3+(i+1)/60,target);
    assert(Math.abs(body.rotation.z-1.27)<.001);
    model.resetMotion();assert.equal(body.rotation.z,0);
  }finally{release(model);}
});
