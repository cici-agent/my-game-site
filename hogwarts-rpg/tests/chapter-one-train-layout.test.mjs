import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { TRAIN_LAYOUT, TRAIN_SEATS, TRAIN_PICKUPS, TRAIN_FURNITURE_PARTS, getTrainSeat, getTrainNavigation, solidBox, trainVestibuleParts } from '../chapter-one/train-layout.mjs';
import { trainPassengers, trainConversationTargets } from '../chapter-one/client/train-life.mjs';
import { getWorldArea, getAreaLinks } from '../chapter-one/world-atlas.mjs';
import { moveWithCollisions, canOccupy } from '../chapter-one/client/scene-geometry.mjs';
import { moveAmongPeople, personBody, scenePeople } from '../chapter-one/people.mjs';
import { interactionVisibleFrom } from '../chapter-one/client/interaction-presentation.mjs';
import { runtimeQuests } from '../chapter-one/online/catalog.mjs';
import { createSceneEnvironment } from '../chapter-one/client/scene-environment.mjs';
import { openRegionPortals } from '../chapter-one/client/journey-environment.mjs';

const context=new Proxy({measureText:text=>({width:String(text).length*12}),createLinearGradient:()=>({addColorStop(){}}),createRadialGradient:()=>({addColorStop(){}})},{get:(object,key)=>key in object?object[key]:()=>{}});
globalThis.document={createElement:()=>({width:512,height:512,getContext:()=>context})};
const close=(actual,expected,label)=>assert(Math.abs(actual-expected)<1e-6,`${label}: ${actual} vs ${expected}`);
const visible=object=>{for(let p=object;p;p=p.parent)if(!p.visible)return false;return true;};

test('seat local constraints describe the same cushion and back used by the actual coach furniture',()=>{
  for(const slot of TRAIN_SEATS){
    const cushion=slot.parts.find(p=>p.id.endsWith(':cushion')),back=slot.parts.find(p=>p.id.endsWith(':back'));
    close(slot.position.y,TRAIN_LAYOUT.floorY,slot.id+' root remains floor-relative');
    close(slot.seat.surfaceY,solidBox(cushion).height-slot.position.y,slot.id+' surface');
    close(slot.seat.frontZ,-(cushion.z+cushion.d/2-slot.position.z),slot.id+' front');
    close(slot.seat.backZ,-(back.z+back.d/2-slot.position.z),slot.id+' back');
    assert(cushion.z-cushion.d/2>TRAIN_LAYOUT.bounds[2]&&cushion.z+cushion.d/2<10.8,'no seat intersects an end bulkhead');
    assert(Object.isFrozen(slot.seat));
  }
  const one=getTrainNavigation(),two=getTrainNavigation();one.walls[0].x=99;one.bounds[0]=99;
  assert.notEqual(two.walls[0].x,99);assert.notEqual(two.bounds[0],99,'callers cannot mutate the shared source');
});

test('actual furniture blocks walking while the spaces between benches are genuinely usable',()=>{
  const area=getWorldArea('SC02_LONDON'),{bounds,walls}=area.navigation;
  for(const part of TRAIN_FURNITURE_PARTS.filter(p=>p.solid))assert(!canOccupy({x:part.x,y:0,z:part.z},walls),part.id);
  const slot=getTrainSeat('ron'),cushion=slot.parts.find(p=>p.id.endsWith(':cushion'));
  const entry={x:0,y:0,z:cushion.z},blocked=moveWithCollisions(entry,{x:slot.position.x,y:0,z:cushion.z},bounds,walls);
  assert(blocked.x>slot.position.x+cushion.w/2+.29,'seat arm/cushion stops an approach from the aisle');
  const gap={x:-2.15,y:0,z:-3.8},walked=moveWithCollisions({x:0,y:0,z:gap.z},gap,bounds,walls);
  close(walked.x,gap.x,'free seat bay can be entered');
  const side=moveWithCollisions(gap,{x:-5,y:0,z:gap.z},bounds,walls);assert(side.x>-2.67&&side.x<-2.6,'the actual sidewall, not an invisible aisle strip, stops the player');
  assert(!walls.some(w=>w.height===100&&w.d>20&&Math.abs(w.x)<3),'old invisible furniture bands removed');
});

test('shared side-door wall pieces preserve both wide platform apertures and close the opposite side',()=>{
  for(const id of ['SC02_LONDON','SC02_HOGSMEADE']){
    const area=getWorldArea(id),links=getAreaLinks(id),door=links.find(l=>l.kind==='walk'),parts=trainVestibuleParts(links);
    assert(parts.every(part=>area.navigation.walls.some(w=>JSON.stringify(w)===JSON.stringify(solidBox(part)))),'renderer parts are the authoritative vestibule walls');
    for(const lateral of [-1.05,0,1.05]){
      const from={x:door.anchor.x-door.normal.x*.55,y:0,z:door.anchor.z+lateral},to={...from,x:door.anchor.x+door.normal.x*.5};
      const moved=moveWithCollisions(from,to,area.navigation.bounds,area.navigation.walls);close(moved.x,to.x,id+' full doorway');
    }
    const closed=moveWithCollisions({x:0,y:0,z:door.anchor.z},{x:-door.anchor.x,y:0,z:door.anchor.z},area.navigation.bounds,area.navigation.walls);
    assert(Math.abs(closed.x)<2.71,'the opposite carriage wall remains solid');
  }
});

test('passenger interactions remain anchored to the occupied seat instead of an empty point in the aisle',()=>{
  const view={sceneId:'SC02'},people=trainPassengers(view),targets=trainConversationTargets(view);
  for(const person of people){
    const target=targets.find(t=>t.id===person.targetId);assert.deepEqual(target.position,person.position);
    if(person.seated){const slot=getTrainSeat(person.appearanceId);assert.deepEqual(person.position,slot.position);assert.deepEqual(person.seat,slot.seat);}
  }
});

test('M02 pickups rest exactly on a rendered floor or table and have a reachable unobstructed interaction',()=>{
  const area=getWorldArea('SC02_LONDON'),root=new THREE.Group(),env=createSceneEnvironment('SC02',root),opened=openRegionPortals(root,area,{portals:getAreaLinks(area.id)});
  root.updateMatrixWorld(true);
  try{
    const targets=runtimeQuests.find(q=>q.id==='M02').objectives;
    for(const[index,key]of ['toad','card'].entries()){
      const spec=TRAIN_PICKUPS[key],target=targets[index];assert.deepEqual(target.position,spec.position);assert.equal(target.presentation.prop,key);
      const expected=spec.supportId==='floor'?TRAIN_LAYOUT.floorY:solidBox(TRAIN_FURNITURE_PARTS.find(p=>p.id===spec.supportId)).height;
      close(target.position.y,expected,key+' prop root equals support surface');
      const p=target.position,hits=new THREE.Raycaster(new THREE.Vector3(p.x,p.y+.05,p.z),new THREE.Vector3(0,-1,0),0,.1).intersectObject(root,true).filter(hit=>visible(hit.object)&&![].concat(hit.object.material??[]).some(m=>m.transparent));
      assert(hits.length,key+' has visible support');close(hits[0].point.y,p.y,key+' actual surface');
    }
    const view={sceneId:'SC02',quest:{id:'M02',npc:'罗恩、赫敏'},targets:[]},bodies=scenePeople(view,null,['harry']).map(personBody);
    for(const target of [...targets.slice(0,2),...trainConversationTargets(view,['harry'])]){
      const step=.2,start={x:0,y:0,z:6},queue=[start],visited=new Set(['0,0']);let found=false;
      for(let i=0;i<queue.length&&i<10000;i++){
        const p=queue[i];
        if(Math.hypot(p.x-target.position.x,p.z-target.position.z)<target.radius-.1&&interactionVisibleFrom(p,target,area.navigation.walls)){found=true;break;}
        for(const [dx,dz]of[[step,0],[-step,0],[0,step],[0,-step]]){
          const next={x:p.x+dx,y:0,z:p.z+dz},key=`${Math.round(next.x/step)},${Math.round((next.z-start.z)/step)}`;
          if(visited.has(key))continue;visited.add(key);
          const moved=moveAmongPeople(p,next,area.navigation.bounds,area.navigation.walls,bodies);
          if(Math.hypot(moved.x-next.x,moved.z-next.z)<1e-7)queue.push(next);
        }
      }
      assert(found,target.id+' can be reached in the furnished occupied coach with clear line of sight');
    }
  }finally{opened.dispose();env.dispose();}
});
