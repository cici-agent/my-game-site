import test from 'node:test';
import assert from 'node:assert/strict';
import { sampleEscort, acceptEscortSnapshot, stepNpcMotion, escortStatusText } from '../chapter-one/client/escort-motion.mjs';
import { visibleTargets } from '../chapter-one/client/scene-geometry.mjs';
import { createBoatMotion } from '../chapter-one/client/scene-landscape.mjs';

const leg=(extra={})=>({npc:'海格',targetId:'M03-1',kind:'escort',origin:{x:0,y:0,z:20},destination:{x:0,y:0,z:0},startedAt:1000,durationSeconds:10,serverTime:1000,position:{x:0,y:0,z:20},progress:0,awaitingStart:false,...extra});
const near=(a,b)=>assert(Math.abs(a-b)<1e-7,`${a} ≠ ${b}`);

test('one sparse snapshot drives smooth walking until the destination even when the player is far away',()=>{
  const route=leg({waitingForPlayer:true}),speeds=[];let p={...route.origin};
  for(let frame=1;frame<=600;frame++) {
    const sample=sampleEscort(route,1000+frame*1000/60),next=stepNpcMotion(p,sample.position,1/60,sample.speed);
    speeds.push(Math.hypot(next.x-p.x,next.z-p.z)*60);p=next;
  }
  near(p.z,0);assert(speeds.every(speed=>Math.abs(speed-2)<1e-7),'no poll-sized sprint or idle pulses');
  near(sampleEscort(route,21000).position.z,0);assert.equal(sampleEscort(route,21000).awaitingPlayer,true);
});

test('delayed same-route packets do not rewind a clock-predicted guide or exceed bounded correction speed',()=>{
  const original=leg({serverTime:3000}),old=leg({serverTime:2000,position:{x:0,y:0,z:18}});
  assert.equal(acceptEscortSnapshot(original,old),original);
  const pose=sampleEscort(original,5000);near(pose.position.z,12);
  const next=stepNpcMotion({x:0,y:0,z:20},pose.position,1/60,pose.speed);
  assert(20-next.z<3.2/60+.00001,'large backlog cannot become a sprint');
});

test('continuous waypoint handoff starts at the previous endpoint and stale previous-step snapshots cannot reverse it',()=>{
  const first=leg(),second=leg({targetId:'M03-2',origin:{x:0,y:0,z:0},destination:{x:8,y:0,z:0},startedAt:11000,durationSeconds:4,serverTime:11100});
  assert.deepEqual(sampleEscort(first,11000).position,sampleEscort(second,11000).position);
  const accepted=acceptEscortSnapshot(first,second);
  assert.equal(acceptEscortSnapshot(accepted,leg({serverTime:11200})),accepted,'older objective cannot replace the new route even with an out-of-order envelope');
  near(sampleEscort(accepted,12000).position.x,2);
  assert.equal(acceptEscortSnapshot(accepted,{...second,startedAt:null,awaitingStart:true,serverTime:11300}),accepted,'already departed guide cannot return to the start prompt');
});

test('only initial meeting and boarding expose an E prompt, never walking, arrival or automatic visits',()=>{
  const route=leg();
  const targets=escort=>visibleTargets({serverTime:escort.serverTime,escort,targets:[{id:escort.targetId,kind:escort.kind,active:true,position:escort.position},{id:'M01-2',kind:'move',active:true,position:{x:0,y:0,z:0}}]},null);
  const awaiting=leg({startedAt:null,awaitingStart:true});assert.equal(targets(awaiting)[0].requiresInteraction,true);assert.match(escortStatusText(awaiting),/按 E/);
  assert.equal(targets(route)[0].requiresInteraction,false);assert.doesNotMatch(escortStatusText(route,4000),/按 E|停下等你/);
  assert.equal(targets({...route,serverTime:12000})[0].requiresInteraction,false);assert.match(escortStatusText(route,12000),/终点/);
  assert.equal(targets(route)[1].requiresInteraction,false);
  assert.match(escortStatusText({...awaiting,kind:'boat'}),/按 E 登船/);
});

test('rejoining a boat midway or after arrival starts at the valid boat location, not the old south bank',()=>{
  for(const [progress,z]of[[.5,21],[1,-4]]) {
    const boat=createBoatMotion();boat.setEscort({kind:'boat',progress,position:{x:0,z}});
    near(boat.getPose().boatPosition.z,z);boat.update(1/60);near(boat.getPose().boatPosition.z,z);
  }
});

test('automatic boat-to-walk handoff completes seated disembarkation without dragging the boat along the walking route',()=>{
  const boat=createBoatMotion();boat.setEscort({kind:'boat',progress:.99,position:{x:-1.47,z:-3.5}});
  for(let i=0;i<60;i++)boat.update(1/60);
  boat.setEscort({kind:'boat',progress:1,position:{x:-1.5,z:-4}});
  assert.equal(boat.getPose().phase,'disembarking');
  for(let i=0;i<180;i++){boat.setEscort({kind:'boat',progress:1,position:{x:-1.5,z:-4}});boat.update(1/60);}
  assert.equal(boat.getPose().phase,'docked');near(boat.getPose().boatPosition.z,-4);
  const walking=sampleEscort(leg({targetId:'M03-4',origin:{x:-1.5,y:0,z:-4},destination:{x:1.5,y:0,z:-10}}),4000);
  assert(walking.position.z<-4);near(boat.getPose().boatPosition.z,-4);
});
