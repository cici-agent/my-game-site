import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { createChapterOneApi } from '../chapter-one/online/api.mjs';
import { runtimeQuests, getSceneView, resolveStoryObjective } from '../chapter-one/online/catalog.mjs';
import { getTrainSeat } from '../chapter-one/train-layout.mjs';
import { scenePeople } from '../chapter-one/people.mjs';
import { canOccupy, sceneNpcTargets } from '../chapter-one/client/scene-geometry.mjs';
import { getWorldArea } from '../chapter-one/world-atlas.mjs';
import { interactionVisibleFrom } from '../chapter-one/client/interaction-presentation.mjs';

const migration=await readFile(new URL('../drizzle/0009_stone_runtime.sql',import.meta.url),'utf8');
const objective=runtimeQuests.find(q=>q.id==='M02').objectives[2];
function harness(){
 const sql=new DatabaseSync(':memory:');sql.exec(migration);let now=100000,serial=0;
 const statement=(query,values=[])=>({query,values,bind(...args){return statement(query,args);},first(){return sql.prepare(query).get(...values)??null;},all(){return {results:sql.prepare(query).all(...values)};},run(){return {meta:sql.prepare(query).run(...values)};}});
 const DB={prepare:statement,batch(statements){sql.exec('BEGIN IMMEDIATE');try{const values=statements.map(s=>/^\s*SELECT/.test(s.query)?s.all():s.run());sql.exec('COMMIT');return values;}catch(error){sql.exec('ROLLBACK');throw error;}}};
 const api=createChapterOneApi({clock:()=>now,randomSeed:()=>17});
 async function call(person,path,body){const response=await api(new Request(`https://test.local/api/stone/${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${person.token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined}),{DB});const result={status:response.status,...await response.json()};if(result.character){person.character=result.character;person.scene=result.scene;person.room=result.room;}return result;}
 async function create(heroId){const person={token:String(++serial).repeat(64)},result=await call(person,'characters',{requestId:`train-create-${serial}`,heroId,name:heroId});assert.equal(result.status,201);person.id=result.character.id;return person;}
 function edit(person,change){const row=sql.prepare('SELECT account_id,state FROM stone_accounts').all().find(row=>JSON.parse(row.state).characters.some(c=>c.id===person.id)),state=JSON.parse(row.state);change(state.characters.find(c=>c.id===person.id));sql.prepare('UPDATE stone_accounts SET state=?,revision=revision+1 WHERE account_id=?').run(JSON.stringify(state),row.account_id);}
 const sync=person=>call(person,`characters/${person.id}`),act=(person,body)=>call(person,`characters/${person.id}/actions`,{requestId:`train-action-${++serial}`,...body});
 function prepare(person,position={x:0,y:0,z:6,yaw:0}){edit(person,c=>{c.currentQuestId='M02';c.objectiveIndex=2;c.sceneId='SC02';c.areaId='SC02_LONDON';c.completedQuestIds=['M01'];c.position={...position};c.lastSeenAt=now;});}
 return {create,edit,prepare,sync,act,advance(ms){now+=ms;},close(){sql.close();}};
}
function targetOf(person){return person.scene.targets.find(t=>t.id==='M02-3');}
function approach(heroId){const seat=getTrainSeat(heroId);return {x:Math.sign(seat.position.x)*.8,y:0,z:seat.position.z,yaw:0};}

test('story identity, seat, rendered cast and collision source agree for every occupied trio combination',()=>{
 const before=JSON.stringify(objective);
 for(const [heroId,occupied,expected]of [['harry',[],'ron'],['ron',[],'hermione'],['hermione',[],'ron'],['harry',['ron'],'hermione'],['ron',['hermione'],'harry'],['harry',['ron','hermione'],'neville']]){
  const character={heroId,currentQuestId:'M02',objectiveIndex:2,areaId:'SC02_LONDON',completedQuestIds:['M01'],collectionIds:[]},resolved=resolveStoryObjective(character,objective,occupied),view=getSceneView(character,1000,occupied),target=view.targets.find(t=>t.id==='M02-3');
  assert.equal(target.appearanceId,expected);assert.deepEqual(target.position,getTrainSeat(expected).position);assert.deepEqual(resolved.position,target.position);assert.equal(target.id,objective.id);
  const cast=scenePeople(view,null,[...occupied,heroId,'irrelevant-stale-client-value']),resident=cast.find(n=>n.targetId===target.id);
  assert(resident);assert.equal(resident.appearanceId,expected);assert.deepEqual(resident.position,target.position);assert.equal(cast.filter(n=>n.appearanceId===expected).length,1);
  for(const occupiedId of [heroId,...occupied])assert(!cast.some(n=>n.appearanceId===occupiedId),'no playable identity duplicated as an NPC');
  const standing=approach(expected);assert(canOccupy(standing,getWorldArea('SC02_LONDON').navigation.walls));assert(interactionVisibleFrom(standing,target,getWorldArea('SC02_LONDON').navigation.walls));
  resolved.position.x=99;resolved.seat.surfaceY=99;
 }
 assert.equal(JSON.stringify(objective),before,'runtime reward and objective definitions stay unchanged');
 assert.equal(sceneNpcTargets({sceneId:'SC02',quest:{id:'M02',npc:'罗恩、赫敏'},targets:[{...objective,active:true}]},null,['harry','ron','hermione'])[0].appearanceId,'neville','old views also use the shared fallback');
});

for(const [heroId,companion]of [['harry','ron'],['ron','hermione'],['hermione','ron']])test(`${heroId} completes the authoritative story beside ${companion}'s real seat`,async()=>{
 const h=harness();try{
  const person=await h.create(heroId);h.prepare(person,approach(companion));await h.sync(person);
  assert.equal(targetOf(person).appearanceId,companion);assert.deepEqual(person.character.scene.targets.find(t=>t.id==='M02-3'),targetOf(person));
  if(heroId==='ron'){
   h.edit(person,c=>{c.position=approach('ron');});await h.sync(person);
   const rejected=await h.act(person,{type:'interact',targetId:'M02-3'});assert.equal(rejected.status,409);assert.equal(rejected.code,'TOO_FAR','the empty old Ron seat cannot complete Hermione dialogue');
   h.edit(person,c=>{c.position=approach(companion);});await h.sync(person);
  }
  const position={...person.character.position},out=await h.act(person,{type:'interact',targetId:'M02-3'});assert.equal(out.status,200,JSON.stringify(out));assert.equal(person.character.currentQuestId,'M03');assert.deepEqual(person.character.position,position,'conversation never moves the player into the chair');
  const xp=person.character.xpCents;await h.act(person,{type:'interact',targetId:'M02-3'});assert.equal(person.character.xpCents,xp,'repeated interaction grants no duplicate reward');
 }finally{h.close();}
});

test('three active same-carriage friends share one reachable Neville and complete independently',async()=>{
 const h=harness();try{
  const party=await Promise.all(['harry','ron','hermione'].map(hero=>h.create(hero)));
  await h.act(party[0],{type:'room-create'});for(const person of party.slice(1))await h.act(person,{type:'room-join',code:party[0].room.code});
  for(const [index,person]of party.entries()){const position=approach('neville');position.z+=(index-1)*.75;h.prepare(person,position);}
  for(const person of party){await h.sync(person);const target=targetOf(person);assert.equal(target.appearanceId,'neville');assert.deepEqual(target.position,getTrainSeat('neville').position);assert.deepEqual([...person.scene.occupiedHeroIds].sort(),['harry','hermione','ron']);const cast=scenePeople(person.scene,null,[]);assert.equal(cast.filter(n=>n.appearanceId==='neville').length,1);assert(!cast.some(n=>['harry','ron','hermione'].includes(n.appearanceId)));}
  for(const person of party){const out=await h.act(person,{type:'interact',targetId:'M02-3'});assert.equal(out.status,200);assert.equal(person.character.currentQuestId,'M03');}
 }finally{h.close();}
});

test('offline and other-area teammates cannot reserve the story companion seat',async()=>{
 const h=harness();try{
  const harry=await h.create('harry'),ron=await h.create('ron');await h.act(harry,{type:'room-create'});await h.act(ron,{type:'room-join',code:harry.room.code});h.prepare(harry);h.prepare(ron);await h.sync(harry);assert.equal(targetOf(harry).appearanceId,'hermione');
  h.advance(30001);await h.sync(harry);assert.equal(targetOf(harry).appearanceId,'ron','expired presence releases the seat');
  h.edit(ron,c=>{c.areaId='HOGSMEADE_STATION';c.sceneId='HOGSMEADE_STATION';});await h.sync(ron);await h.sync(harry);assert.equal(targetOf(harry).appearanceId,'ron','a friend elsewhere does not suppress a carriage resident');
  assert.equal(scenePeople(harry.scene,null,['harry','ron']).find(n=>n.targetId==='M02-3').appearanceId,'ron','authoritative active presence wins over a stale client roster');
 }finally{h.close();}
});
