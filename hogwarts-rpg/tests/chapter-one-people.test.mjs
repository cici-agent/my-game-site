import test from 'node:test';
import assert from 'node:assert/strict';
import { moveAmongPeople, personBody, scenePeople } from '../chapter-one/people.mjs';
import { moveWithCollisions, canOccupy } from '../chapter-one/client/scene-geometry.mjs';
import { getWorldArea } from '../chapter-one/world-atlas.mjs';
import { PLAYER_RADIUS } from '../chapter-one/movement.mjs';
import { getTrainSeat } from '../chapter-one/train-layout.mjs';

const bounds=[-20,20,-20,20],body=personBody({id:'npc',appearanceId:'molly',position:{x:0,y:0,z:0}});
const step=(from,to,bodies=[body],options={})=>moveAmongPeople(from,to,bounds,[],bodies,options);
const separation=(position,target=body)=>Math.hypot(position.x-target.x,position.z-target.z);
const close=(a,b)=>assert(Math.abs(a-b)<1e-8,`${a} != ${b}`);

test('the shared scene cast keeps one seated Ron while the story takes his interaction',()=>{
  const view={sceneId:'SC02',quest:{id:'M02',npc:'罗恩、赫敏'},targets:[{id:'M02-3',kind:'talk',active:true,label:'听同伴介绍霍格沃茨',position:{x:-1.5,y:0,z:-4}}]};
  const original=JSON.stringify(view),cast=scenePeople(view,null,['harry']),ron=cast.find(person=>person.appearanceId==='ron');
  assert.equal(new Set(cast.map(person=>person.id)).size,cast.length);assert.equal(cast.filter(person=>person.appearanceId==='ron').length,1);
  assert.equal(ron.targetId,'M02-3');assert.equal(ron.seated,true);assert.deepEqual(ron.position,getTrainSeat('ron').position);assert.deepEqual(ron.seat,getTrainSeat('ron').seat);
  assert(!cast.some(person=>person.appearanceId==='harry'));assert(cast.some(person=>person.appearanceId==='hermione'));
  ron.position.x=99;assert.equal(JSON.stringify(view),original);assert.deepEqual(scenePeople(view,{id:'battle'},[]),[]);
});

test('body dimensions distinguish a standing pupil, seated passenger, giant guide and downed friend',()=>{
  const pupil=personBody({id:'friend',appearanceId:'harry',position:{x:1,y:10,z:2}}),seated=personBody({id:'ron',appearanceId:'ron',position:{x:1,y:.32,z:2},seated:true});
  const giant=personBody({id:'hagrid',appearanceId:'hagrid',position:{x:0,y:0,z:0}}),downed=personBody({id:'friend',position:{x:0,y:0,z:0},downed:true});
  assert.equal(pupil.minY,10);assert(pupil.maxY>11.6);assert(seated.maxY<1.7);assert(giant.radius>.6&&giant.maxY>3);assert(downed.maxY<.5);
  assert(pupil.radius>=.32&&pupil.radius<=.4);
});

test('ambient guides share authority positions and active escort or boat state replaces the same person',()=>{
  const ambient={name:'海格',appearanceId:'hagrid',position:{x:1,y:0,z:56},yaw:Math.PI};
  const view={sceneId:'SC03',quest:{id:'M03',npc:'海格'},targets:[],ambientPeople:[ambient,{name:'韦斯莱夫人',position:{x:2,y:0,z:4}}]};
  const waiting=scenePeople(view,null);assert.equal(waiting.find(person=>person.name==='海格').kind,'ambient');assert.deepEqual(waiting.find(person=>person.name==='海格').position,ambient.position);
  const active=scenePeople({...view,targets:[{id:'boat',kind:'boat',npc:'海格',label:'渡湖',active:true,position:{x:0,y:0,z:21}}],escort:{npc:'海格',kind:'boat',targetId:'boat',progress:.5,position:{x:0,y:0,z:21}}},null);
  assert.equal(active.filter(person=>person.name==='海格').length,1);const hagrid=active.find(person=>person.name==='海格');assert.equal(hagrid.kind,'boat');assert.equal(hagrid.targetId,'boat');assert.equal(hagrid.seated,true);assert.deepEqual(hagrid.position,{x:0,y:0,z:21});
  assert.equal(active.find(person=>person.name==='韦斯莱夫人').kind,'ambient');assert.deepEqual(ambient.position,{x:1,y:0,z:56});
});

test('a frontal approach stops at body clearance even in a single high-speed packet',()=>{
  for(const distance of [.8,4,15]){
    const from={x:-distance,y:0,z:0},to={x:distance,y:0,z:0},result=step(from,to);
    assert(result.x<=-body.radius-PLAYER_RADIUS+1e-8);assert(result.x>-.73,'stopping distance stays close enough for interaction');
    close(result.y,0);close(result.z,0);
  }
});

test('a glancing movement slides along the body without penetration or extra speed',()=>{
  let position={x:-1.4,y:0,z:-.4},travel=0,blockedFrames=0;
  for(let i=0;i<80;i++){
    const requested={x:position.x+.04,y:0,z:position.z+.025},result=step(position,requested),distance=Math.hypot(result.x-position.x,result.z-position.z);
    assert(distance<=Math.hypot(.04,.025)+1e-9);assert(separation(result)>=body.radius+PLAYER_RADIUS-1e-8);
    if(distance<.04)blockedFrames++;travel+=distance;position=result;
  }
  assert(blockedFrames>0,'the route actually contacts the cylinder');assert(position.z>1);assert(travel>2,'contact must permit deliberate sideways escape');
});

test('initial overlap can escape but cannot move deeper or cross through the centre',()=>{
  const embedded={x:-.2,y:0,z:0},out=step(embedded,{x:-1.2,y:0,z:0});assert(out.x<-.9);
  const deeper=step(embedded,{x:.9,y:0,z:0});close(deeper.x,embedded.x);close(deeper.z,embedded.z);
  const tangent=step(embedded,{x:-.2,y:0,z:.8});assert(separation(tangent)>separation(embedded));
  const identical=step({x:0,y:0,z:0},{x:.8,y:0,z:0});assert(identical.x>.6,'an old save at exactly the same centre must not be permanently trapped');
});

test('floors and flight heights separate bodies while overlapping height still blocks',()=>{
  const upper=personBody({id:'upstairs',position:{x:0,y:10,z:0}}),from={x:-2,y:0,z:0},to={x:2,y:0,z:0};
  close(step(from,to,[upper]).x,2);close(step({...from,y:2},{...to,y:2}).x,2);
  assert(step({...from,y:1.5},{...to,y:1.5}).x<-.6);
  const raised=step({...from,y:10},{...to,y:10},[upper]);assert(raised.x<-.6);close(raised.y,10);
});

test('body collision never creates a standing platform or rewrites vertical motion',()=>{
  for(const y of [0,.4,1,2]){const result=step({x:-.9,y:0,z:0},{x:.9,y,z:0});close(result.y,y);}
  const seated=personBody({id:'seated',position:{x:0,y:0,z:0},seated:true});
  close(step({x:-2,y:1.4,z:0},{x:2,y:1.4,z:0},[seated]).x,2);
});

test('static walls and people remain solid together and do not push a player into furniture',()=>{
  const wall={x:0,z:.9,w:5,d:.3,height:3},person={...body,z:0};let position={x:-1.1,y:0,z:.45};
  for(let i=0;i<60;i++){
    const result=moveAmongPeople(position,{x:position.x+.06,y:0,z:position.z+.02},bounds,[wall],[person]);
    assert(canOccupy(result,[wall]));assert(separation(result,person)>=person.radius+PLAYER_RADIUS-1e-8);assert(Math.hypot(result.x-position.x,result.z-position.z)<=Math.hypot(.06,.02)+1e-8);position=result;
  }
  assert(position.x<0,'the blocked gap cannot be squeezed through');
});

test('the real narrow coach aisle permits walking around the trolley witch and leaves seated students clear',()=>{
  const area=getWorldArea('SC02_LONDON'),cast=scenePeople({sceneId:'SC02',quest:{id:'M02'},targets:[]},null,['harry']),bodies=cast.map(personBody);
  let position={x:0,y:0,z:4};
  for(const destination of [{x:-.65,y:0,z:4},{x:-.65,y:0,z:1.2},{x:0,y:0,z:1.2},{x:0,y:0,z:-7}]){
    const result=moveAmongPeople(position,destination,area.navigation.bounds,area.navigation.walls,bodies);
    assert(Math.hypot(result.x-destination.x,result.z-destination.z)<1e-8,'the trolley leaves a usable route through the actual aisle');position=result;
  }
});

test('multiple teammates cannot be tunneled through and inputs stay immutable',()=>{
  const people=[-.7,.7].map((z,i)=>personBody({id:`peer-${i}`,position:{x:0,y:0,z}}));
  const from={x:-4,y:0,z:0},to={x:4,y:0,z:0},before=JSON.stringify({from,to,people});
  const widePlayer=moveAmongPeople(from,to,bounds,[],people,{radius:.4});assert(widePlayer.x<0);assert.equal(JSON.stringify({from,to,people}),before);
  const empty=moveAmongPeople(from,to,bounds,[],[]);assert.deepEqual(empty,moveWithCollisions(from,to,bounds,[]));
});
