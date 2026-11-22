import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createChapterOneApi } from '../chapter-one/online/api.mjs';
import { runtimeQuests,getSceneView } from '../chapter-one/online/catalog.mjs';
import { contentData,growthData } from '../chapter-one/data/index.mjs';
import { getHeroStats,getLevelFromXpCents,contentVersion } from '../chapter-one/rules/index.mjs';
import { occupiedBagSlots } from '../chapter-one/rules/bag.mjs';
import { SELECTABLE_HERO_IDS,isSelectableHero } from '../chapter-one/roster.mjs';
import { readAccount,commit } from '../chapter-one/online/storage.mjs';

const migration=await readFile(new URL('../drizzle/0009_stone_runtime.sql',import.meta.url),'utf8');
function harness(){
 const sql=new DatabaseSync(':memory:');sql.exec(migration);let now=100000,id=0;
 const statement=(query,values=[])=>({query,values,bind(...args){return statement(query,args);},first(){return sql.prepare(query).get(...values)??null;},all(){return{results:sql.prepare(query).all(...values)};},run(){return{meta:sql.prepare(query).run(...values)};}});
 const DB={prepare:statement,batch(statements){sql.exec('BEGIN IMMEDIATE');try{const out=statements.map(s=>/^\s*SELECT/.test(s.query)?s.all():s.run());sql.exec('COMMIT');return out;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const handler=createChapterOneApi({clock:()=>now,randomSeed:()=>1827});let httpBase=null,httpServer=null;
 async function call(token,path,body){const options={method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined};const response=httpBase?await fetch(`${httpBase}/api/stone/${path}`,options):await handler(new Request(`http://game.test/api/stone/${path}`,options),{DB});return{status:response.status,...await response.json()};}
 async function startHttp(){
  httpServer=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const response=await handler(new Request(`http://127.0.0.1${req.url}`,{method:req.method,headers:req.headers,...(chunks.length?{body:Buffer.concat(chunks)}:{})}),{DB});res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));}catch(error){res.writeHead(500);res.end(JSON.stringify({error:String(error)}));}});
  await new Promise(resolve=>httpServer.listen(0,'127.0.0.1',resolve));httpBase=`http://127.0.0.1:${httpServer.address().port}`;return httpBase;
 }
 async function stopHttp(){if(httpServer){httpServer.closeAllConnections();await new Promise(resolve=>httpServer.close(resolve));}sql.close();}
 async function create(token='a'.repeat(64),heroId='harry'){const result=await call(token,'characters',{requestId:`create-${++id}`,heroId,name:'Test student'});assert.equal(result.status,201,JSON.stringify(result));return {token,id:result.character.id,sequence:0,...result};}
 async function action(p,body){const out=await call(p.token,`characters/${p.id}/actions`,{requestId:`action-${++id}`,...body});if(out.character){p.character=out.character;p.encounter=out.encounter;p.scene=out.scene;p.room=out.room;}return out;}
 async function sync(p){const out=await call(p.token,`characters/${p.id}`);if(out.character){p.character=out.character;p.encounter=out.encounter;p.scene=out.scene;p.room=out.room;}return out;}
 function edit(p,fn){const rows=sql.prepare('SELECT account_id,state FROM stone_accounts').all();const row=rows.find(r=>JSON.parse(r.state).characters.some(c=>c.id===p.id));const state=JSON.parse(row.state),c=state.characters.find(c=>c.id===p.id);fn(c,state);c.level=getLevelFromXpCents(c.xpCents);c.stats=getHeroStats(c.heroId,c.level);sql.prepare('UPDATE stone_accounts SET state=?,revision=revision+1 WHERE account_id=?').run(JSON.stringify(state),row.account_id);}
 async function move(p,point){
  for(let n=0;n<80;n++){
   const from=p.character.position,d=Math.hypot(point.x-from.x,point.z-from.z);if(d<.8&&Math.abs((point.y??0)-from.y)<.01)return;
   now+=500;const amount=Math.min(1,d),ratio=d?amount/d:0;
   const out=await action(p,{type:'move',sequence:++p.sequence,position:{x:from.x+(point.x-from.x)*ratio,z:from.z+(point.z-from.z)*ratio,y:point.y??0,yaw:0},flying:(point.y??0)>.2});
   assert.equal(out.status,200,JSON.stringify(out));
  }throw Error('walk did not finish');
 }
 function raw(p){for(const row of sql.prepare('SELECT state FROM stone_accounts').all()){const c=JSON.parse(row.state).characters.find(c=>c.id===p.id);if(c)return c;}}
 return {sql,DB,call,create,action,sync,edit,move,raw,startHttp,stopHttp,advance(ms){now+=ms;},get now(){return now;}};
}

test('simultaneous identical creation returns one durable character and original receipt',async()=>{
 const h=harness(),token='f'.repeat(64),body={requestId:'parallel-create',heroId:'hermione',name:'Hermione'};
 const [a,b]=await Promise.all([h.call(token,'characters',body),h.call(token,'characters',body)]);
 assert.equal(a.character.id,b.character.id);assert.equal((await h.call(token,'account')).account.characters.length,1);
 assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM stone_receipts').get().n,1);h.sql.close();
});

test('new account selects three templates across five independent slots, with birth equipment and token ownership',async()=>{
 const h=harness();assert.deepEqual((await h.call('a'.repeat(64),'account')).account.characters,[]);
 assert.deepEqual(SELECTABLE_HERO_IDS,['harry','ron','hermione']);
 const players=[];for(const hero of SELECTABLE_HERO_IDS)players.push(await h.create('a'.repeat(64),hero));
 assert.deepEqual((await h.call('a'.repeat(64),'account')).account.characters.map(c=>c.heroId),SELECTABLE_HERO_IDS);
 for(const hero of ['harry','ron'])players.push(await h.create('a'.repeat(64),hero));
 assert.equal(new Set(players.map(p=>p.id)).size,5);assert(players.every(p=>isSelectableHero(p.character.heroId)));
 assert.equal((await h.call('a'.repeat(64),'characters',{requestId:'sixth-character',heroId:'harry',name:'Sixth'})).code,'CHARACTER_LIMIT');
 const c=players[0].character;assert.equal(c.level,1);assert.equal(c.bagCapacity,24);assert.equal(c.inventory.length,0);assert.equal(Object.keys(c.equipment).length,3);assert.deepEqual(c.potions,{health:1,focus:1});
 assert.equal((await h.call('b'.repeat(64),`characters/${c.id}`)).code,'CHARACTER_NOT_FOUND');
 assert.equal((await h.action(players[0],{type:'hero',heroId:'ron'})).code,'UNKNOWN_ACTION');
 h.sql.close();
});

test('new Neville and George characters are rejected without damaging existing legacy saves',async()=>{
 const h=harness(),token='a'.repeat(64),legacy=[];
 for(const [i,heroId]of ['neville','george'].entries()){
  const p=await h.create(token);
  // Persist an old-version save directly; the current creation policy must not migrate it.
  h.edit(p,c=>{c.heroId=heroId;c.xpCents=growthData.levels[9+i].cumulativeXpCents;c.wallet.coins=275+i;c.name=`Legacy ${heroId}`;});
  legacy.push(p);
 }
 const storedBefore=h.sql.prepare('SELECT state,revision FROM stone_accounts').all(),receiptCount=h.sql.prepare('SELECT COUNT(*) n FROM stone_receipts').get().n;
 for(const heroId of ['neville','george']){
  assert.equal(isSelectableHero(heroId),false);
  const denied=await h.call(token,'characters',{requestId:`reject-new-${heroId}`,heroId,name:'New student'});
  assert.equal(denied.status,400);assert.equal(denied.code,'UNKNOWN_HERO');
 }
 assert.deepEqual(h.sql.prepare('SELECT state,revision FROM stone_accounts').all(),storedBefore);
 assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM stone_receipts').get().n,receiptCount);
 const listed=await h.call(token,'account?existing=1');assert.deepEqual(listed.account.characters.map(c=>c.heroId),['neville','george']);
 for(const [i,p]of legacy.entries()){
  const before=h.raw(p),loaded=await h.sync(p);assert.equal(loaded.status,200);
  for(const key of ['id','heroId','name','xpCents','level','wallet','equipment','currentQuestId'])assert.deepEqual(loaded.character[key],before[key]);
  assert.equal(loaded.character.level,10+i);assert.equal(loaded.character.stats.focusMax,getHeroStats(before.heroId,10+i).focusMax);
  assert.equal((await h.call('b'.repeat(64),`characters/${p.id}`)).code,'CHARACTER_NOT_FOUND');
 }
 const current=await h.create(token,'hermione');assert.equal(current.character.level,1);assert.equal(current.character.xpCents,0);
 assert.deepEqual((await h.call(token,'account')).account.characters.map(c=>c.heroId),['neville','george','hermione']);h.sql.close();
});

test('restore probes never create an account for an unknown valid-format recovery code',async()=>{
 const h=harness(),p=await h.create();const before=h.sql.prepare('SELECT COUNT(*) n FROM stone_accounts').get().n;
 assert.equal((await h.call('b'.repeat(64),'account?existing=1')).code,'ACCOUNT_NOT_FOUND');
 assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM stone_accounts').get().n,before);
 const recovered=await h.call(p.token.toUpperCase(),'account?existing=1');assert.equal(recovered.account.characters[0].id,p.id);
 assert.equal((await h.call('invalid','account')).code,'UNAUTHORIZED');assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM stone_accounts').get().n,before);h.sql.close();
});

test('client fields cannot override the character route in an idempotency fingerprint',async()=>{
 const h=harness(),a=await h.create(),b=await h.create(a.token,'ron');
 const body={type:'interact',targetId:'M01-1',characterId:b.id,requestId:'cross-character-receipt'};
 assert.equal((await h.action(a,body)).status,200);
 assert.equal((await h.action(b,body)).code,'REQUEST_CONFLICT');await h.sync(b);assert.equal(b.character.escort,null);h.sql.close();
});

test('requests replay exactly, reject changed payloads and do not share character rewards',async()=>{
 const h=harness(),p=await h.create(),second=await h.create(p.token,'ron');
 const target=p.scene.targets[0];await h.move(p,p.scene.escort?.position??target.position);
 const body={type:'interact',targetId:target.id,requestId:'persisted-objective'};
 const first=await h.action(p,body),again=await h.action(p,body);assert.equal(first.status,200);assert.equal(again.replayed,true);assert.equal(again.character.revision,first.character.revision);
 assert.equal((await h.action(p,{...body,targetId:'M01-2'})).code,'REQUEST_CONFLICT');
 for(let i=0;i<12;i++){h.advance(500);await h.sync(p);await h.move(p,p.scene.escort.position);}
 await h.action(p,{type:'interact',targetId:'M01-1'});
 await h.move(p,{x:1.5,y:0,z:-.5});await h.action(p,{type:'interact',targetId:'M01-2'});
 assert.equal(p.character.currentQuestId,'M02');assert.equal(p.character.xpCents,20000);
 const other=await h.sync(second);assert.equal(other.character.xpCents,0);assert.equal(other.character.currentQuestId,'M01');h.sql.close();
});

test('movement credit prevents repeated latency-tolerance teleports; goals validate proximity',async()=>{
 const h=harness(),p=await h.create();
 h.edit(p,c=>{c.position={x:9,y:0,z:12,yaw:0};});await h.sync(p);
 assert.equal((await h.action(p,{type:'interact',targetId:'M01-1'})).code,'TOO_FAR');
 h.edit(p,c=>{c.position={x:0,y:0,z:6,yaw:0};});await h.sync(p);
 const first=await h.action(p,{type:'move',sequence:1,position:{x:.1,y:0,z:6,yaw:0}});assert.equal(first.status,200);
 assert.equal((await h.action(p,{type:'move',sequence:2,position:{x:.2,y:0,z:6,yaw:0}})).code,'MOVE_TOO_FAST');
 h.advance(500);assert.equal((await h.action(p,{type:'move',sequence:2,position:{x:.2,y:10,z:6,yaw:0}})).code,'OUT_OF_BOUNDS');
 h.sql.close();
});

test('multi-account commit guard rolls all balances and receipt back on one stale revision',async()=>{
 const h=harness();const a=await readAccount(h.DB,'alpha',h.now),b=await readAccount(h.DB,'beta',h.now);
 a.state.testBalance=10;b.state.testBalance=20;h.DB.prepare('UPDATE stone_accounts SET revision=revision+1 WHERE account_id=?').bind('beta').run();
 await assert.rejects(()=>commit(h.DB,[a,b],null,{accountId:'alpha',requestId:'atomic-fail',hash:'hash',response:{}},h.now),/CHECK constraint/);
 assert.equal((await readAccount(h.DB,'alpha',h.now)).state.testBalance,undefined);assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM stone_receipts').get().n,0);h.sql.close();
});

test('five accounts join a room, sixth is refused, disconnect snapshots preserve independent progress',async()=>{
 const h=harness(),players=[];for(let i=0;i<6;i++)players.push(await h.create(String(i+1).repeat(64)));
 const created=await h.action(players[0],{type:'room-create'}),code=created.room.code;
 for(const p of players.slice(1,5))assert.equal((await h.action(p,{type:'room-join',code})).status,200);
 assert.equal((await h.action(players[5],{type:'room-join',code})).code,'ROOM_FULL');
 assert.equal((await h.sync(players[0])).room.members.length,5);
 await h.action(players[1],{type:'room-leave'});assert.equal((await h.sync(players[1])).character.roomCode,null);
 assert.equal((await h.action(players[5],{type:'room-join',code})).status,200);
 assert.equal((await h.sync(players[0])).room.members.length,5);h.sql.close();
});

test('two real accounts see each other unequip and re-equip without exposing private inventory',async()=>{
 const h=harness(),a=await h.create(),b=await h.create('b'.repeat(64),'hermione');
 await h.action(a,{type:'room-create'});assert.equal((await h.action(b,{type:'room-join',code:a.room.code})).status,200);
 const bBefore=h.raw(b),initial={...a.character.equipment};
 for(const slot of ['top','weapon']){
  assert.equal((await h.action(a,{type:'unequip',slot})).status,200);assert.equal((await h.sync(b)).status,200);
  const member=b.room.members.find(m=>m.id===a.id);assert.deepEqual(member.equipment,a.character.equipment);assert.equal(Object.hasOwn(member.equipment,slot),false);
  assert(h.raw(a).inventory.includes(initial[slot]));
  for(const privateField of ['inventory','potions','wallet','accountId','token','recoveryCode','questReceipts','pendingClaims'])assert.equal(Object.hasOwn(member,privateField),false,privateField);
 }
 assert.equal((await h.action(a,{type:'equip',itemId:initial.top})).status,200);await h.sync(b);
 assert.equal(b.room.members.find(m=>m.id===a.id).equipment.top,initial.top);assert.equal(Object.hasOwn(b.room.members.find(m=>m.id===a.id).equipment,'weapon'),false);
 assert.deepEqual(h.raw(b),bBefore,'a teammate polling equipment must not modify their own saved character');h.sql.close();
});

test('party snapshots expose trusted health and flight mode, distinguish jumps and clear flight on travel',async()=>{
 const h=harness(),a=await h.create(),b=await h.create('b'.repeat(64),'hermione');
 await h.action(a,{type:'room-create'});await h.action(b,{type:'room-join',code:a.room.code});
 h.edit(a,c=>{c.currentQuestId='M06';c.completedQuestIds=runtimeQuests.slice(0,5).map(q=>q.id);c.sceneId='SC09';c.position={x:0,y:0,z:5,yaw:0};});await h.sync(a);h.advance(500);
 assert.equal((await h.action(a,{type:'move',sequence:++a.sequence,position:{x:.2,y:.8,z:5,yaw:0},flying:true,hp:999999})).status,200);await h.sync(b);
 let member=b.room.members.find(m=>m.id===a.id);assert.equal(member.flying,true);assert.equal(a.character.flying,true);assert.equal(member.hp,a.character.hp);assert.notEqual(member.hp,999999);
 h.advance(500);assert.equal((await h.action(a,{type:'move',sequence:++a.sequence,position:{x:.2,y:0,z:5,yaw:0},flying:false})).status,200);
 h.advance(500);assert.equal((await h.action(a,{type:'move',sequence:++a.sequence,position:{x:.2,y:1,z:5,yaw:0},flying:false})).status,200);assert.equal(a.character.flying,false,'a real jump after landing is not flight mode');
 h.edit(a,c=>{c.flying=true;c.position={x:0,y:0,z:-7,yaw:0};});await h.sync(a);
 assert.equal((await h.action(a,{type:'travel',targetId:'exit',sceneId:'SC04'})).status,200);assert.equal(a.character.flying,false);await h.sync(b);assert.equal(b.room.members.find(m=>m.id===a.id).flying,false);
 h.advance(500);await h.action(a,{type:'move',sequence:++a.sequence,position:{x:0,y:1,z:6,yaw:0},flying:true});assert.equal(a.character.flying,false,'a flight lesson does not authorize flying in another scene');
 h.advance(500);assert.equal((await h.action(a,{type:'move',sequence:++a.sequence,position:{x:0,y:2,z:6,yaw:0},flying:true})).code,'OUT_OF_BOUNDS');h.sql.close();
});

test('M06 keeps trial flight through both aerial goals and requires a real landing before course completion',async()=>{
 const h=harness(),p=await h.create();h.edit(p,c=>{c.currentQuestId='M06';c.objectiveIndex=0;c.sceneId='SC09';c.completedQuestIds=runtimeQuests.slice(0,5).map(q=>q.id);c.xpCents=growthData.levels[9].cumulativeXpCents;c.skills=[];c.position={x:0,y:0,z:6,yaw:0};});await h.sync(p);
 assert.equal(p.character.skills.includes('broom'),false);assert.equal(p.scene.flight.allowed,true);
 for(const id of ['M06-1','M06-2']){
  const target=p.scene.targets.find(t=>t.id===id);await h.move(p,{...target.position,y:2.4});
  assert.equal(p.character.flying,true);assert.equal((await h.action(p,{type:'interact',targetId:id})).status,200);
 }
 assert.equal(p.character.objectiveIndex,2);assert.equal(p.character.skills.includes('broom'),false);assert.equal(p.scene.flight.allowed,true);
 h.advance(2500);await h.sync(p);const target=p.scene.targets.find(t=>t.id==='M06-3');await h.move(p,{...target.position,y:2.4});
 const airborne=h.raw(p);assert.equal((await h.action(p,{type:'interact',targetId:target.id})).code,'LANDING_REQUIRED');assert.deepEqual(h.raw(p),airborne);
 for(const y of [2,1.5,1,.5,0]){
  h.advance(250);const out=await h.action(p,{type:'move',sequence:++p.sequence,position:{...p.character.position,y},steps:[{dx:0,dy:y-p.character.position.y,dz:0}],flying:true});
  assert.equal(out.status,200,JSON.stringify(out));
 }
 assert.equal(p.character.flying,false,'historical flying samples in the final ground packet must not keep the rider mounted');
 assert.equal(p.character.position.y,0);assert.equal((await h.action(p,{type:'interact',targetId:target.id})).status,200);
 assert.equal(p.character.currentQuestId,'M07');assert(p.character.completedQuestIds.includes('M06'));assert(p.character.skills.includes('broom'));
 assert.equal(p.character.flying,false);assert.equal(p.character.position.y,0);assert.equal(p.scene.flight.allowed,false);h.sql.close();
});

test('flight goals reject ordinary jumping and revoked flight allows descent but never a new ascent',async()=>{
 const h=harness(),p=await h.create();h.edit(p,c=>{c.currentQuestId='M06';c.objectiveIndex=0;c.sceneId='SC09';c.completedQuestIds=runtimeQuests.slice(0,5).map(q=>q.id);c.position={x:-1.5,y:0,z:3,yaw:0};});await h.sync(p);h.advance(500);
 assert.equal((await h.action(p,{type:'move',sequence:++p.sequence,position:{...p.character.position,y:.8},flying:false})).status,200);
 assert.equal((await h.action(p,{type:'interact',targetId:'M06-1'})).code,'FLIGHT_REQUIRED');
 h.edit(p,c=>{c.sceneId='SC04';c.visitSceneId='SC04';c.position={x:0,y:2.4,z:5,yaw:0};c.flying=true;c.jumpMotion=null;});await h.sync(p);
 assert.equal(p.scene.flight.allowed,false);assert.equal(p.scene.flight.canLand,true);h.advance(500);
 assert.equal((await h.action(p,{type:'move',sequence:++p.sequence,position:{...p.character.position,y:2.6},flying:true})).code,'LANDING_REQUIRED');
 for(const y of [1.8,1,.4,0]){h.advance(250);assert.equal((await h.action(p,{type:'move',sequence:++p.sequence,position:{...p.character.position,y},flying:true})).status,200);}
 assert.equal(p.character.flying,false);assert.equal(p.scene.flight.canLand,false);h.advance(500);
 assert.equal((await h.action(p,{type:'move',sequence:++p.sequence,position:{...p.character.position,y:2},flying:true})).code,'OUT_OF_BOUNDS');h.sql.close();
});

test('M30 requires its real broom interaction, retains flight after key capture, and opens the gate only after landing',async()=>{
 const h=harness(),p=await h.create();h.edit(p,c=>{c.currentQuestId='M30';c.objectiveIndex=0;c.sceneId='SC14';c.completedQuestIds=runtimeQuests.slice(0,29).map(q=>q.id);c.xpCents=growthData.levels[23].cumulativeXpCents;c.position={x:0,y:0,z:6,yaw:0};c.skills=['mark','broom'];});await h.sync(p);
 await h.move(p,p.scene.targets.find(t=>t.id==='observe').position);assert.equal((await h.action(p,{type:'interact',targetId:'observe'})).status,200);h.advance(1900);await h.sync(p);
 assert(p.character.dungeonRoom.flags.observe);assert(p.scene.targets.find(t=>t.id==='key').active);assert.equal(p.scene.flight.allowed,false);
 h.advance(500);assert.equal((await h.action(p,{type:'move',sequence:++p.sequence,position:{...p.character.position,y:1.8},flying:true})).code,'OUT_OF_BOUNDS');
 await h.move(p,p.scene.targets.find(t=>t.id==='broom').position);assert.equal((await h.action(p,{type:'interact',targetId:'broom'})).status,200);h.advance(1100);await h.sync(p);
 assert(p.character.dungeonRoom.flyingPlayers.includes(p.id));assert.equal(p.scene.flight.allowed,true);
 await h.move(p,{x:0,y:1.8,z:-3});let found=false;
 for(let i=0;i<40;i++){await h.sync(p);const key=p.scene.targets.find(t=>t.id==='key');if(Math.hypot(key.position.x-p.character.position.x,key.position.z-p.character.position.z)<1.9){found=true;break;}h.advance(200);}
 assert(found);assert.equal((await h.action(p,{type:'interact',targetId:'key'})).status,200);assert(p.character.dungeonRoom.flags.key);assert.equal(p.scene.flight.allowed,true);
 await h.move(p,{x:0,y:1.8,z:-6});assert.equal((await h.action(p,{type:'interact',targetId:'gate'})).code,'LANDING_REQUIRED');
 for(const y of [1.2,.6,0]){h.advance(250);assert.equal((await h.action(p,{type:'move',sequence:++p.sequence,position:{...p.character.position,y},flying:true})).status,200);}
 assert.equal(p.character.flying,false);assert.equal((await h.action(p,{type:'interact',targetId:'gate'})).status,200);h.advance(1100);await h.sync(p);
 assert.equal(p.character.currentQuestId,'M31');assert(p.character.completedQuestIds.includes('M30'));assert.equal(p.character.flying,false);assert.equal(p.scene.flight.allowed,false);h.sql.close();
});

test('Hagrid escort advances over time, waits for distance and cannot be completed by one interaction',async()=>{
 const h=harness(),p=await h.create();h.edit(p,c=>{c.currentQuestId='M03';c.sceneId='SC03';c.completedQuestIds=['M01','M02'];});await h.sync(p);
 assert.deepEqual(p.scene.escort.position,{x:1.8,y:0,z:5.2});assert.notDeepEqual(p.scene.escort.position,p.character.position);
 const start=await h.action(p,{type:'interact',targetId:'M03-1'});assert.equal(start.status,200);assert.equal(start.character.objectiveIndex,0);assert.equal(start.scene.escort.progress,0);
 await h.move(p,{x:0,y:0,z:12});
 for(let i=0;i<10;i++){h.advance(500);await h.sync(p);}
 assert(p.scene.escort.progress>0);assert(p.scene.escort.progress<1,'NPC should wait when too far');
 await h.move(p,p.scene.escort.position);
 for(let i=0;i<12&&p.scene.escort?.progress<1;i++){h.advance(500);await h.sync(p);await h.move(p,p.scene.escort.position);}
 await h.move(p,{x:-1.5,y:0,z:3});await h.action(p,{type:'interact',targetId:'M03-1'});
 assert.equal(p.character.objectiveIndex,1);assert.deepEqual(p.scene.escort.position,{x:-1.5,y:0,z:3});h.sql.close();
});

test('dungeon chess validates real timed commands and safe cells instead of a completion button',async()=>{
 const h=harness(),p=await h.create();h.edit(p,c=>{c.currentQuestId='M31';c.sceneId='SC14';c.position={x:1.5,y:0,z:-.5,yaw:0};});await h.sync(p);
 assert.equal((await h.action(p,{type:'interact',targetId:'piece-2'})).status,200);h.advance(800);await h.sync(p);
 assert.equal(p.character.dungeonRoom.failures,1);assert.equal(p.character.dungeonRoom.chessTurn,0);
 await h.move(p,{x:-1.5,y:0,z:-.5});await h.action(p,{type:'interact',targetId:'piece-0'});
 assert.equal(p.character.dungeonRoom.chessCommandAt,null);h.advance(800);await h.sync(p);assert(p.character.dungeonRoom.chessCommandAt);
 await h.move(p,{x:0,y:0,z:-4});await h.action(p,{type:'interact',targetId:'safe'});assert.equal(p.character.dungeonRoom.chessTurn,1);h.sql.close();
});

test('merchant validates unlocks, currency and unique ownership; refill is free and gear persists',async()=>{
 const h=harness(),p=await h.create();h.edit(p,c=>{c.completedQuestIds=runtimeQuests.slice(0,10).map(q=>q.id);c.currentQuestId='M11';c.sceneId='SC04';c.visitSceneId='SC04';c.xpCents=1000000;c.wallet.learningCredits=10;c.position={x:1.5,y:0,z:1,yaw:0};});await h.sync(p);
 const buy={type:'buy',serviceId:'SERVICE-GEAR',offerId:'OFFER-GEAR-T1-WAND'};
 assert.equal((await h.action(p,buy)).status,200);assert.equal(p.character.wallet.learningCredits,8);
 assert.equal((await h.action(p,buy)).code,'ALREADY_OWNED');
 const old=p.character.stats.spellPower;await h.action(p,{type:'equip',itemId:'ITEM-GEAR-T1-WAND'});assert.equal(p.character.stats.spellPower,old+2);assert(p.character.inventory.includes('ITEM-GEAR-BASE-WAND'));
 await h.move(p,{x:1.5,y:0,z:5});assert.equal((await h.action(p,{type:'refill',health:2,focus:0})).status,200);assert.deepEqual(p.character.potions,{health:2,focus:0});
 assert.equal((await h.action(p,{type:'refill',health:3,focus:0})).code,'INVALID_POTION_ALLOCATION');h.sql.close();
});

test('unequip persists every slot exactly once, retries atomically and preserves other characters',async()=>{
 const h=harness(),p=await h.create(),sameAccount=await h.create(p.token,'ron'),otherAccount=await h.create('b'.repeat(64),'hermione');
 const untouched=[h.raw(sameAccount),h.raw(otherAccount)],initial={...p.character.equipment};
 for(const slot of ['weapon','top','gloves']){
  const body={type:'unequip',slot,requestId:`unequip-retry-${slot}`};
  const replies=await Promise.all([h.action(p,body),h.action(p,body)]);
  for(const reply of replies){assert.equal(reply.status,200,JSON.stringify(reply));assert.equal(Object.hasOwn(reply.character.equipment,slot),false);}
  assert.equal(h.raw(p).inventory.filter(id=>id===initial[slot]).length,1);
  assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM stone_receipts WHERE request_id=?').get(body.requestId).n,1);
  const empty=await h.action(p,{type:'unequip',slot});assert.equal(empty.code,'SLOT_EMPTY');
 }
 await h.sync(p);assert.deepEqual(p.character.equipment,{});assert.deepEqual([...p.character.inventory].sort(),Object.values(initial).sort());
 for(const itemId of Object.values(initial))assert.equal((await h.action(p,{type:'equip',itemId})).status,200);
 await h.sync(p);assert.deepEqual(p.character.equipment,initial);assert.deepEqual(p.character.inventory,[]);
 const denied=await h.call(otherAccount.token,`characters/${p.id}/actions`,{type:'unequip',slot:'top',requestId:'unauthorized-unequip'});
 assert.equal(denied.code,'CHARACTER_NOT_FOUND');assert.deepEqual([h.raw(sameAccount),h.raw(otherAccount)],untouched);h.sql.close();
});

test('unequip respects bag capacity while a full bag can still swap one equipped item',async()=>{
 const h=harness(),p=await h.create();
 h.edit(p,c=>{c.xpCents=growthData.levels[17].cumulativeXpCents;c.completedQuestIds=['M10'];c.inventory=['ITEM-GEAR-T1-TOP',...Array.from({length:c.bagCapacity-3},(_,i)=>`occupied-fixture-slot-${i}`)];});await h.sync(p);
 const original=h.raw(p);assert.equal((await h.action(p,{type:'unequip',slot:'top'})).code,'BAG_FULL');assert.deepEqual(h.raw(p),original);
 assert.equal((await h.action(p,{type:'equip',itemId:'ITEM-GEAR-T1-TOP'})).status,200);
 assert.equal(p.character.bagSlotsUsed,p.character.bagCapacity);assert(p.character.inventory.includes('ITEM-GEAR-BASE-TOP'));
 assert.equal(p.character.inventory.includes('ITEM-GEAR-T1-TOP'),false);assert.equal(p.character.equipment.top,'ITEM-GEAR-T1-TOP');
 const full=h.raw(p);assert.equal((await h.action(p,{type:'unequip',slot:'top'})).code,'BAG_FULL');assert.deepEqual(h.raw(p),full);
 h.edit(p,c=>{c.inventory.pop();});await h.sync(p);
 assert.equal((await h.action(p,{type:'unequip',slot:'top'})).status,200);assert.equal(p.character.bagSlotsUsed,p.character.bagCapacity);
 assert.equal((await h.action(p,{type:'equip',itemId:'ITEM-GEAR-T1-TOP'})).status,200);assert.equal(p.character.bagSlotsUsed,p.character.bagCapacity-1);h.sql.close();
});

test('unified bag counts potion stacks for purchases, claims, unequip and final refill allocation',async()=>{
 const h=harness(),p=await h.create();assert.equal(p.character.bagSlotsUsed,2);
 h.edit(p,c=>{c.xpCents=growthData.levels[17].cumulativeXpCents;c.completedQuestIds=runtimeQuests.slice(0,10).map(q=>q.id);c.currentQuestId='M11';c.sceneId='SC04';c.visitSceneId='SC04';c.position={x:1.5,y:0,z:1,yaw:0};c.wallet.learningCredits=10;});await h.sync(p);
 h.edit(p,c=>{c.potions={health:2,focus:0};c.inventory=Array.from({length:c.bagCapacity-1},(_,i)=>`occupied-fixture-slot-${i}`);c.pendingClaims=[{id:'pending-real-robe',itemId:'ITEM-GEAR-T1-TOP'}];});await h.sync(p);
 const full=h.raw(p);assert.equal(occupiedBagSlots(full),full.bagCapacity);
 for(const action of [{type:'buy',serviceId:'SERVICE-GEAR',offerId:'OFFER-GEAR-T1-WAND'},{type:'claim',claimId:'pending-real-robe'},{type:'unequip',slot:'top'}]){
  const out=await h.action(p,action);assert.equal(out.code,'BAG_FULL');assert.deepEqual(h.raw(p),full,'failed insertion must preserve currency, potion stacks, gear and pending reward');
 }
 h.edit(p,c=>{c.currentQuestId='M04';c.position={x:0,y:0,z:6,yaw:0};c.hp=30;});await h.sync(p);const beforeRefill=h.raw(p);
 assert.equal((await h.action(p,{type:'refill',health:1,focus:1})).code,'BAG_FULL');assert.deepEqual(h.raw(p),beforeRefill);
 const oneStack=await h.action(p,{type:'refill',health:0,focus:2});assert.equal(oneStack.status,200);assert.deepEqual(oneStack.character.potions,{health:0,focus:2});assert.equal(oneStack.character.bagSlotsUsed,oneStack.character.bagCapacity);
 h.edit(p,c=>{c.inventory.pop();});await h.sync(p);
 const twoStacks=await h.action(p,{type:'refill',health:1,focus:1});assert.equal(twoStacks.status,200);assert.equal(twoStacks.character.bagSlotsUsed,twoStacks.character.bagCapacity);h.sql.close();
});

test('legacy overcapacity saves remain intact and can consume potions or equip an empty slot to recover room',async()=>{
 const h=harness(),p=await h.create();
 h.edit(p,c=>{const top=c.equipment.top;delete c.equipment.top;c.inventory=[top,...Array.from({length:c.bagCapacity-1},(_,i)=>`legacy-occupied-slot-${i}`)];c.currentQuestId='M04';c.sceneId='SC04';c.objectiveIndex=1;c.position={x:1.5,y:0,z:-.5,yaw:0};c.focus=10;});
 const beforeRead=h.raw(p),loaded=await h.sync(p);assert.equal(loaded.status,200);assert.equal(loaded.character.bagSlotsUsed,loaded.character.bagCapacity+2);assert.deepEqual(loaded.character.inventory,beforeRead.inventory);assert.deepEqual(loaded.character.potions,beforeRead.potions);
 assert.equal((await h.action(p,{type:'equip',itemId:'ITEM-GEAR-BASE-TOP'})).status,200);assert.equal(p.character.bagSlotsUsed,p.character.bagCapacity+1);
 assert.equal((await h.action(p,{type:'encounter',targetId:'M04-2'})).status,200);
 assert.equal((await h.action(p,{type:'skill',skillId:'potion-focus'})).status,200);h.advance(1100);await h.sync(p);
 assert.deepEqual(p.character.potions,{health:1,focus:0});assert.equal(p.character.bagSlotsUsed,p.character.bagCapacity);assert.equal(p.character.inventory.length,beforeRead.inventory.length-1);
 assert.equal((await h.action(p,{type:'skill',skillId:'potion-health'})).code,'NO_POTION_USES','unified storage must preserve the encounter-wide single-potion limit');h.sql.close();
});

test('unequip preserves low, full and zero resource fractions through repeated real API round trips',async()=>{
 for(const fraction of [.35,1,0]){
  const h=harness(),p=await h.create(),base=getHeroStats('harry',18);
  h.edit(p,c=>{c.xpCents=growthData.levels[17].cumulativeXpCents;c.completedQuestIds=['M10'];c.inventory=['ITEM-GEAR-T1-TOP'];c.hp=base.hp*fraction;c.focus=base.focusMax*.37;});await h.sync(p);
  assert.equal((await h.action(p,{type:'equip',itemId:'ITEM-GEAR-T1-TOP'})).status,200);
  const totalItems=()=>[...h.raw(p).inventory,...Object.values(h.raw(p).equipment)].sort(),items=totalItems();
  for(let i=0;i<5;i++){
   assert.equal((await h.action(p,{type:'unequip',slot:'top'})).status,200);assert.equal(p.character.stats.hp,base.hp);
   assert(Math.abs(p.character.hp-base.hp*fraction)<1e-8);assert.equal(p.character.focus,base.focusMax*.37);
   assert.equal((await h.action(p,{type:'equip',itemId:'ITEM-GEAR-T1-TOP'})).status,200);assert.equal(p.character.stats.hp,base.hp+24);
   assert(Math.abs(p.character.hp-(base.hp+24)*fraction)<1e-8);assert.deepEqual(totalItems(),items);
  }
  await h.sync(p);assert.equal(h.raw(p).stats.hp,base.hp+24);assert.equal(h.raw(p).focus,base.focusMax*.37);h.sql.close();
 }
});

test('unequip rejects invalid slots and inconsistent duplicate ownership without losing an item',async()=>{
 const h=harness(),p=await h.create(),initial=h.raw(p);
 for(const slot of ['hat','__proto__',null,['top']]){assert.equal((await h.action(p,{type:'unequip',slot})).code,'INVALID_EQUIPMENT_SLOT');assert.deepEqual(h.raw(p),initial);}
 h.edit(p,c=>{c.inventory.push(c.equipment.top);});const duplicate=h.raw(p);
 assert.equal((await h.action(p,{type:'unequip',slot:'top'})).code,'CANNOT_UNEQUIP');assert.deepEqual(h.raw(p),duplicate);h.sql.close();
});

test('equipment changes remain forbidden during a live authoritative encounter',async()=>{
 const h=harness(),p=await h.create();h.edit(p,c=>{c.currentQuestId='M04';c.sceneId='SC04';c.objectiveIndex=1;c.position={x:1.5,y:0,z:-.5,yaw:0};c.completedQuestIds=['M01','M02','M03'];});await h.sync(p);
 assert.equal((await h.action(p,{type:'encounter',targetId:'M04-2'})).status,200);const before=h.raw(p);
 for(const action of [{type:'unequip',slot:'weapon'},{type:'unequip',slot:'top'},{type:'equip',itemId:'ITEM-GEAR-BASE-WAND'}]){
  assert.equal((await h.action(p,action)).code,'IN_COMBAT');assert.deepEqual(h.raw(p),before);
 }h.sql.close();
});

test('equipped robe HP reaches the UI and combat, preserving low/full/zero health through repeated swaps',async()=>{
 for(const fraction of [.5,1,0]){
  const h=harness(),p=await h.create(),base=getHeroStats('harry',24);
  h.edit(p,c=>{c.xpCents=growthData.levels[23].cumulativeXpCents;c.completedQuestIds=runtimeQuests.slice(0,24).map(q=>q.id);c.currentQuestId='M25';c.sceneId='SC08';c.visitSceneId='SC08';c.position={x:-1.5,y:0,z:5,yaw:0};c.inventory=['ITEM-GEAR-T1-TOP'];c.hp=base.hp*fraction;c.focus=base.focusMax*.37;});await h.sync(p);
  const initialHp=p.character.hp,initialFocus=p.character.focus;
  for(let n=0;n<20;n++){
   const equipped=await h.action(p,{type:'equip',itemId:'ITEM-GEAR-T1-TOP'});assert.equal(equipped.status,200);
   assert.equal(p.character.stats.hp,base.hp+24);assert.equal(p.character.stats.maxHp,undefined);
   assert(Math.abs(p.character.hp-(base.hp+24)*fraction)<1e-8);assert.equal(p.character.focus,initialFocus);
   assert.equal((await h.action(p,{type:'equip',itemId:'ITEM-GEAR-BASE-TOP'})).status,200);
   assert.equal(p.character.stats.hp,base.hp);assert(Math.abs(p.character.hp-initialHp)<1e-8);assert.equal(p.character.focus,initialFocus);
  }
  await h.action(p,{type:'equip',itemId:'ITEM-GEAR-T1-TOP'});await h.sync(p);
  assert.equal(h.raw(p).stats.hp,base.hp+24);assert(Math.abs(h.raw(p).hp-(base.hp+24)*fraction)<1e-8);
  const start=await h.action(p,{type:'encounter',cycleId:'GREENHOUSE-M14'});
  if(fraction===0){assert.equal(start.code,'RETRY_REQUIRED');assert.equal(h.raw(p).hp,0);}
  else{assert.equal(start.status,200);const fighter=start.encounter.players[p.id];assert.equal(fighter.maxHp,p.character.stats.hp);assert.equal(fighter.stats.hp,base.hp+24);assert.equal(fighter.hp,p.character.hp);assert.equal(fighter.focus,initialFocus);}
  h.sql.close();
 }
});

test('real quest XP preserves health and focus percentages across levels without healing zero resources or replaying',async()=>{
 for(const fraction of [.25,1,0]){
  const h=harness(),p=await h.create(),base=getHeroStats('harry',1);
  h.edit(p,c=>{c.objectiveIndex=1;c.position={x:1.5,y:0,z:-.5,yaw:0};c.hp=base.hp*fraction;c.focus=base.focusMax*fraction;});await h.sync(p);
  const body={type:'interact',targetId:'M01-2',requestId:'level-resource-percent'};
  const first=await h.action(p,body);assert.equal(first.status,200);assert(p.character.level>1);
  const after={hp:p.character.hp,focus:p.character.focus};
  assert(Math.abs(after.hp-p.character.stats.hp*fraction)<1e-8);assert(Math.abs(after.focus-p.character.stats.focusMax*fraction)<1e-8);
  const repeated=await h.action(p,body);assert.equal(repeated.replayed,true);assert.deepEqual({hp:repeated.character.hp,focus:repeated.character.focus},after);
  for(let i=0;i<5;i++)await h.sync(p);
  assert.deepEqual({hp:p.character.hp,focus:p.character.focus},after);assert.equal(h.raw(p).xpCents,20000);h.sql.close();
 }
});

test('real combat API defeats the small spider; spoofed damage and completion cannot award XP',async()=>{
 const h=harness(),p=await h.create();h.edit(p,c=>{c.currentQuestId='M04';c.sceneId='SC04';c.objectiveIndex=1;c.position={x:1.5,y:0,z:-.5,yaw:0};c.completedQuestIds=['M01','M02','M03'];});await h.sync(p);
 assert.equal((await h.action(p,{type:'complete',questId:'M04',xpCents:999999})).code,'UNKNOWN_ACTION');
 assert.equal((await h.action(p,{type:'encounter',targetId:'M04-2'})).status,200);
 for(let i=0;i<30&&p.encounter?.status==='active';i++){
  const enemy=Object.values(p.encounter.enemies).find(e=>e.hp>0),self=p.encounter.players[p.id];
  const dx=enemy.position.x-self.position.x,dz=enemy.position.z-self.position.z;
  await h.action(p,{type:'skill',skillId:'bolt',aim:{x:dx,y:enemy.position.y+enemy.collisionBase+enemy.collisionHeight*.5-self.position.y-1.2,z:dz},damage:999999});
  h.advance(900);await h.sync(p);
 }
 assert.equal(p.encounter.status,'won');assert.equal(p.character.objectiveIndex,2);assert.equal(p.character.xpCents,0,'course XP waits for the whole authored goal');
 const previous=p.character.revision;await h.sync(p);assert.equal(p.character.objectiveIndex,2);assert(p.character.revision>=previous);h.sql.close();
});

test('professor side invites are local and trackable, timed observation interrupts on movement and saves once',async()=>{
 const h=harness(),p=await h.create();h.edit(p,c=>{c.completedQuestIds=runtimeQuests.slice(0,10).map(q=>q.id);c.currentQuestId='M11';c.sceneId='SC05';c.visitSceneId='SC05';c.position={x:1.5,y:0,z:5,yaw:0};});await h.sync(p);
 const invitation=p.scene.targets.find(t=>t.kind==='side'&&t.questId==='SQ01');assert.equal(invitation.npc,'弗立维教授');
 assert.equal(p.scene.services.length,0);assert.equal((await h.action(p,{type:'buy',serviceId:'SERVICE-SUPPLY',offerId:'fake'})).code,'SERVICE_LOCKED');
 await h.action(p,{type:'side',questId:invitation.questId});await h.action(p,{type:'track',trackedIds:['side:SQ01']});
 assert.equal(p.character.journal.side.find(s=>s.id==='SQ01').serverState,'active');assert.deepEqual(p.character.trackedIds,['side:SQ01']);
 await h.move(p,{x:1.5,y:0,z:-6});const beforeXp=p.character.xpCents,beforeCoins=p.character.wallet.coins;
 await h.action(p,{type:'collect',questId:'SQ01'});assert.equal(p.character.collectionIds.length,0);
 h.advance(200);await h.action(p,{type:'move',sequence:++p.sequence,position:{...p.character.position,x:p.character.position.x-.3}});
 h.advance(1000);await h.sync(p);assert.equal(p.character.collectionIds.length,0);
 await h.action(p,{type:'collect',questId:'SQ01'});h.advance(1000);await h.sync(p);
 assert.deepEqual(p.character.collectionIds,['COLLECT-FIELD-01']);assert.equal(p.character.journal.side.find(s=>s.id==='SQ01').serverState,'completed');
 await h.action(p,{type:'collect',questId:'SQ01'});h.advance(1000);await h.sync(p);
 assert.equal(p.character.collectionItems.filter(x=>x==='ITEM-COLLECT-FIELD-01').length,1);assert.equal(p.character.xpCents,beforeXp);assert.equal(p.character.wallet.coins,beforeCoins);
 h.edit(p,c=>{c.currentQuestId='M13';c.sceneId='SC13';c.visitSceneId=null;c.position={x:1.5,y:0,z:5,yaw:0};});await h.sync(p);
 assert(!p.scene.targets.some(t=>t.kind==='side'||t.kind==='collection'));
 assert.equal((await h.action(p,{type:'side',questId:'SQ02'})).code,'SIDE_LOCKED');h.sql.close();
});

test('story fights, teaching and underground actions reject matching coordinates in the wrong scene',async()=>{
 const h=harness(),p=await h.create();
 h.edit(p,c=>{c.currentQuestId='M13';c.completedQuestIds=runtimeQuests.slice(0,12).map(q=>q.id);c.skills=['bolt','dodge','levitate','rescue'];c.sceneId='SC04';c.visitSceneId='SC04';c.position={x:-1.5,y:0,z:3,yaw:0};});await h.sync(p);
 assert.equal((await h.action(p,{type:'encounter',targetId:'M13-1'})).code,'WRONG_STORY_SCENE');assert.equal(p.encounter,null);
 h.edit(p,c=>{c.currentQuestId='M10';c.objectiveIndex=0;c.sceneId='SC04';c.visitSceneId='SC04';});await h.sync(p);
 assert.equal((await h.action(p,{type:'skill',skillId:'levitate',targetId:'M10-1'})).code,'WRONG_STORY_SCENE');assert.equal(p.character.pendingWorldAction,null);
 h.edit(p,c=>{c.currentQuestId='M31';c.sceneId='SC14';c.visitSceneId=null;c.position={x:-1.5,y:0,z:-.5,yaw:0};});await h.sync(p);
 assert.equal((await h.action(p,{type:'interact',targetId:'piece-0'})).status,200);assert(Object.keys(p.character.dungeonRoom.pending).length);
 h.edit(p,c=>{c.sceneId='SC04';c.visitSceneId='SC04';});h.advance(1000);await h.sync(p);
 assert.equal(p.character.dungeonRoom.chessCommandAt,null);assert.equal(Object.keys(p.character.dungeonRoom.pending).length,0);assert.equal(p.scene.dungeon,null);
 assert.equal((await h.action(p,{type:'interact',targetId:'piece-0'})).code,'WRONG_STORY_SCENE');assert.equal(p.character.xpCents,0);
 h.edit(p,c=>{c.currentQuestId='M03';c.dungeonRoom=null;});await h.sync(p);assert.equal(p.scene.escort,null);h.sql.close();
});

test('server movement shares the narrow train carriage walls and cannot walk through the lake',async()=>{
 const h=harness(),p=await h.create();h.edit(p,c=>{c.currentQuestId='M02';c.sceneId='SC02';c.position={x:.8,y:0,z:4,yaw:0};});await h.sync(p);
 h.advance(1000);const move=await h.action(p,{type:'move',sequence:++p.sequence,position:{x:2,y:0,z:4,yaw:0}});assert.equal(move.status,200);assert(p.character.position.x<=.951);
 h.edit(p,c=>{c.currentQuestId='M03';c.sceneId='SC03';c.position={x:0,y:0,z:0,yaw:0};});await h.sync(p);
 const firstZ=p.character.position.z;
 for(let i=0;i<12;i++){h.advance(500);await h.action(p,{type:'move',sequence:++p.sequence,position:{x:0,y:0,z:p.character.position.z-1,yaw:0}});}
 assert(p.character.position.z>=-.651&&p.character.position.z<firstZ,'water collision must stop an ordinary walker before the water strip');h.sql.close();
});

test('first M04 defeat has no supply or skill soft lock: dodge trial, free retry and checkpoint refill',async()=>{
 const h=harness(),p=await h.create();h.edit(p,c=>{c.currentQuestId='M04';c.sceneId='SC04';c.objectiveIndex=2;c.completedQuestIds=['M01','M02','M03'];c.xpCents=120000;c.position={x:-1.5,y:0,z:-4,yaw:0};});await h.sync(p);
 assert.deepEqual(p.character.courseTrialSkillIds,['bolt','dodge']);assert.equal(p.character.skills.length,0);
 await h.action(p,{type:'encounter',targetId:'M04-3'});assert(p.encounter.players[p.id].learnedSkillIds.includes('dodge'));
 assert.equal((await h.action(p,{type:'skill',skillId:'dodge',aim:{x:1,z:0}})).status,200);
 h.advance(120000);await h.sync(p);assert.equal(p.encounter.status,'lost');assert.equal(p.character.hp,0);
 const retry=await h.action(p,{type:'retry'});assert.equal(retry.status,200);assert.equal(p.character.hp,p.character.stats.hp);assert.equal(p.character.focus,p.character.stats.focusMax);assert.equal(p.character.objectiveIndex,2);assert(!p.character.completedQuestIds.includes('M04'));
 assert.equal((await h.action(p,{type:'refill',health:1,focus:1})).status,200);assert.equal(p.character.wallet.coins,0);
 assert.equal(p.character.xpCents,120000);h.sql.close();
});

for(const kind of ['troll','stone'])test(`real full-health solo ${kind} survives 200ms API polling and saves the victory without combat fixtures`,async()=>{
 const h=harness(),p=await h.create(),q=kind==='troll'?'M13':'M34',level=kind==='troll'?18:23;
 h.edit(p,c=>{c.currentQuestId=q;c.sceneId=kind==='troll'?'SC13':'SC14';c.completedQuestIds=runtimeQuests.slice(0,Number(q.slice(1))-1).map(x=>x.id);c.completedDungeonRooms=kind==='stone'?['M28','M29','M30','M31','M32','M33']:[];c.xpCents=growthData.levels[level-1].cumulativeXpCents;c.skills=contentData.skills.filter(s=>s.role==='all'||s.role==='harry').map(s=>s.id);c.position={x:-1.5,y:0,z:3,yaw:0};});await h.sync(p);
 assert.equal((await h.action(p,{type:'encounter',targetId:`${q}-1`})).status,200);const fullHp=p.encounter.enemies['enemy-0'].maxHp;
 assert.equal(p.encounter.enemies['enemy-0'].hp,fullHp);let avoid=null,lastAttack=null;
 for(let frame=0;frame<2400&&p.encounter?.status==='active';frame++){
  h.advance(200);await h.sync(p);if(p.encounter?.status!=='active')break;
  let self=p.encounter.players[p.id],enemy=p.encounter.enemies['enemy-0'];
  const target=p.encounter.mechanismTargets.find(t=>!t.complete&&t.enabled);
  if(enemy.attack&&enemy.attack.id!==lastAttack){
   lastAttack=enemy.attack.id;const a=enemy.attack;
   if(a.shape==='line')avoid={x:self.position.x+a.direction.z*2.3,z:self.position.z-a.direction.x*2.3};
   else{const origin=a.shape==='circle'?a.aim:a.origin;let dx=self.position.x-origin.x,dz=self.position.z-origin.z;const length=Math.hypot(dx,dz)||1;if(dx===0&&dz===0)dx=1;const r=a.shape==='circle'?2.4:5;avoid={x:origin.x+dx/length*r,z:origin.z+dz/length*r};}
  }
  if(!enemy.attack)avoid=null;
  const goal=avoid??target?.position;
  if(goal&&(!self.action||['bolt','H1'].includes(self.action.skillId))){
   const dx=goal.x-self.position.x,dz=goal.z-self.position.z,length=Math.hypot(dx,dz),stop=avoid?.1:Math.min(1.3,(target?.range??2)*.75);
   if(length>stop){const step=Math.min(.60,length-stop);const moved=await h.action(p,{type:'move',sequence:++p.sequence,sprint:true,position:{x:self.position.x+dx/length*step,y:0,z:self.position.z+dz/length*step,yaw:0}});assert.equal(moved.status,200,JSON.stringify(moved));}
  }
  self=p.encounter.players[p.id];enemy=p.encounter.enemies['enemy-0'];
  if(!self.action&&target&&Math.hypot(self.position.x-target.position.x,self.position.z-target.position.z)<=target.range){
   const action=await h.action(p,{type:'skill',skillId:target.id==='club'?'levitate':'interact',targetId:target.id});assert([200,409].includes(action.status));
  }
  self=p.encounter.players[p.id];
  if(!self.action&&!avoid){const action=await h.action(p,{type:'skill',skillId:'bolt',aim:{x:enemy.position.x-self.position.x,z:enemy.position.z-self.position.z}});assert([200,409].includes(action.status));}
 }
 assert.equal(p.encounter.status,'won',`${kind} hp ${p.encounter.players[p.id].hp}, enemy ${p.encounter.enemies['enemy-0'].hp}/${fullHp}`);
 assert.equal(p.encounter.enemies['enemy-0'].hp,0);assert(p.character.completedQuestIds.includes(q));
 assert(p.encounter.players[p.id].hp>0);const xp=p.character.xpCents;await h.sync(p);assert.equal(p.character.xpCents,xp);h.sql.close();
});

test('all 36 runtime quests retain catalog coverage, guard the ending and expose no answer in view',async()=>{
 const h=harness(),p=await h.create();assert.equal(runtimeQuests.length,36);assert.equal(runtimeQuests.filter(q=>q.objectives.some(o=>['battle','boss'].includes(o.kind))).length,7);
 h.edit(p,c=>{c.currentQuestId='M36';c.sceneId='SC04';c.objectiveIndex=1;c.position={x:1.5,y:0,z:-.5,yaw:0};});await h.sync(p);
 assert.equal((await h.action(p,{type:'interact',targetId:'M36-2'})).code,'ENDING_REQUIREMENTS');
 const view=getSceneView({...p.character,currentQuestId:'M31',objectiveIndex:0});assert.equal(view.targets[0].answer,undefined);assert(view.targets[0].options.length===3);h.sql.close();
});

test('five real HTTP clients share a full-health troll, reconnect and preserve helper versus first-clear rewards',async t=>{
 const h=harness();await h.startHttp();
 try{
  const heroes=['harry','ron','hermione','harry','ron'];
  const party=await Promise.all(heroes.map((hero,i)=>h.create(String(i+1).repeat(64),hero)));
  assert.equal(new Set(party.map(p=>p.id)).size,5);assert.equal(new Set(party.map(p=>p.character.heroId)).size,3);
  assert(party.every(p=>isSelectableHero(p.character.heroId)&&p.character.level===1&&p.character.xpCents===0));
  for(const [i,p]of party.entries())h.edit(p,c=>{c.currentQuestId=i===0?'M14':'M13';c.completedQuestIds=runtimeQuests.slice(0,i===0?13:12).map(q=>q.id);c.sceneId='SC13';c.visitSceneId=i===0?'SC13':null;c.xpCents=growthData.levels[17].cumulativeXpCents;c.skills=contentData.skills.filter(s=>s.role==='all'||s.role===c.heroId).map(s=>s.id);c.position={x:(i-2)*.4,y:0,z:3,yaw:0};c.hp=getHeroStats(c.heroId,18).hp;c.focus=getHeroStats(c.heroId,18).focusMax;});
  await Promise.all(party.map(p=>h.sync(p)));await h.action(party[1],{type:'room-create'});const code=party[1].room.code;
  for(const p of party.filter((_,i)=>i!==1))assert.equal((await h.action(p,{type:'room-join',code})).status,200);
  h.advance(1000);
  await Promise.all(party.map((p,i)=>h.action(p,{type:'move',sequence:++p.sequence,position:{x:(i-2)*.4,y:0,z:2.7,yaw:i*.3}})));
  await h.sync(party[1]);assert.equal(party[1].room.members.length,5);
  for(const [i,p]of party.entries()){const member=party[1].room.members.find(m=>m.id===p.id);assert.equal(member.heroId,heroes[i]);assert.equal(member.position.x,(i-2)*.4);assert.equal(member.currentQuestId,i===0?'M14':'M13');}
  assert.equal((await h.action(party[1],{type:'encounter',targetId:'M13-1'})).status,200);
  let state=party[1].encounter;assert.equal(state.enemies['enemy-0'].maxHp,35700);const battleStarted=h.now;
  const controls={},before=party.map(p=>({xp:p.character.xpCents,coins:p.character.wallet.coins}));let reconnected=false;
  for(let frame=0;frame<1800&&state.status==='active';frame++){
   h.advance(200);await h.sync(party[1]);state=party[1].encounter;if(state.status!=='active')break;
   for(let i=0;i<party.length&&state.status==='active';i++){
    let p=party[i];if(i===2&&frame>=20&&frame<40)continue;
    if(i===2&&frame===40){const recovered=await h.call(p.token,`characters/${p.id}`);assert.equal(recovered.room.code,code);assert.equal(recovered.character.id,p.id);party[i]=p={token:p.token,id:p.id,sequence:recovered.character.lastAcceptedMoveSequence,...recovered};reconnected=true;state=p.encounter;}
    let self=state.players[p.id],enemy=state.enemies['enemy-0'];if(self.hp<=0)continue;
    const control=controls[p.id]??={avoid:null,lastAttack:null},target=state.mechanismTargets.find(t=>!t.complete&&t.enabled);
    if(enemy.attack&&enemy.attack.id!==control.lastAttack){
     control.lastAttack=enemy.attack.id;const attack=enemy.attack;
     if(attack.shape==='line')control.avoid={x:self.position.x+attack.direction.z*2.3,z:self.position.z-attack.direction.x*2.3};
     else{const origin=attack.shape==='circle'?[...attack.areas].sort((a,b)=>Math.hypot(a.x-self.position.x,a.z-self.position.z)-Math.hypot(b.x-self.position.x,b.z-self.position.z))[0]:attack.origin;let dx=self.position.x-origin.x,dz=self.position.z-origin.z;const length=Math.hypot(dx,dz)||1;if(dx===0&&dz===0)dx=1;const radius=attack.shape==='circle'?2.4:5;control.avoid={x:origin.x+dx/length*radius,z:origin.z+dz/length*radius};}
    }
    if(!enemy.attack)control.avoid=null;
    const goal=control.avoid??target?.position;
    if(goal&&(!self.action||['bolt','H1'].includes(self.action.skillId))){
     const dx=goal.x-self.position.x,dz=goal.z-self.position.z,length=Math.hypot(dx,dz),stop=control.avoid?.1:Math.min(1.3,(target?.range??2)*.75);
     if(length>stop){const step=Math.min(.6,length-stop),out=await h.action(p,{type:'move',sequence:++p.sequence,sprint:true,position:{x:self.position.x+dx/length*step,y:0,z:self.position.z+dz/length*step,yaw:0}});assert.equal(out.status,200,JSON.stringify(out));state=p.encounter;}
    }
    self=state.players[p.id];enemy=state.enemies['enemy-0'];
    if(!self.action&&target&&Math.hypot(self.position.x-target.position.x,self.position.z-target.position.z)<=target.range){const out=await h.action(p,{type:'skill',skillId:target.id==='club'?'levitate':'interact',targetId:target.id});if(out.status===200)state=p.encounter;else assert.equal(out.status,409);}
    self=state.players[p.id];
    if(!self.action&&!control.avoid){const out=await h.action(p,{type:'skill',skillId:'bolt',aim:{x:enemy.position.x-self.position.x,z:enemy.position.z-self.position.z}});if(out.status===200)state=p.encounter;else assert.equal(out.status,409);}
   }
  }
  assert.equal(state.status,'won',JSON.stringify({enemy:state.enemies['enemy-0'].hp,players:Object.values(state.players).map(p=>({hero:p.heroId,hp:p.hp,damage:p.contribution.damage}))}));assert(reconnected);
  assert.equal(state.enemies['enemy-0'].hp,0);assert(Object.values(state.players).every(p=>p.contribution.damage>0));
  await Promise.all(party.map(p=>h.sync(p)));
  for(const [i,p]of party.entries()){assert.equal(p.character.heroId,heroes[i]);assert(p.character.xpCents>before[i].xp);assert.equal(p.character.currentQuestId,'M14');assert(p.character.completedQuestIds.includes('M13'));if(i===0){assert.equal(p.character.wallet.coins,before[i].coins);assert(!p.character.pendingClaims.length);}else assert(p.character.wallet.coins>before[i].coins);}
  const rewards=party.map(p=>({xp:p.character.xpCents,coins:p.character.wallet.coins}));await Promise.all(party.map(p=>h.sync(p)));assert.deepEqual(party.map(p=>({xp:p.character.xpCents,coins:p.character.wallet.coins})),rewards);
  t.diagnostic(JSON.stringify({simulationSeconds:(h.now-battleStarted)/1000,bossHp:state.enemies['enemy-0'].hp,reconnected,players:party.map((p,i)=>({hero:p.character.heroId,damage:state.players[p.id].contribution.damage,xpGainCents:p.character.xpCents-before[i].xp,coinGain:p.character.wallet.coins-before[i].coins}))}));
 }finally{await h.stopHttp();}
});

test('shared boss settlement is atomic and rewards only participating characters once (trusted victory fixture)',async()=>{
 const h=harness(),a=await h.create('a'.repeat(64)),b=await h.create('b'.repeat(64),'ron');
 for(const p of [a,b]){h.edit(p,c=>{c.currentQuestId='M13';c.sceneId='SC13';c.completedQuestIds=runtimeQuests.slice(0,12).map(q=>q.id);c.xpCents=3000000;c.skills=['bolt','dodge','levitate','rescue'];c.position={x:-1.5,y:0,z:3,yaw:0};});await h.sync(p);}
 const room=await h.action(a,{type:'room-create'});await h.action(b,{type:'room-join',code:room.room.code});
 await h.action(a,{type:'encounter',targetId:'M13-1'});assert.equal(a.encounter.lockedPlayerCount,2);
 assert.equal((await h.action(b,{type:'room-leave'})).code,'ROSTER_LOCKED');
 // Unit-test the storage/orchestration boundary; combat victory itself is tested
 // by the real combat engine suite and the real paper-target API test above.
 const row=h.sql.prepare('SELECT state FROM stone_rooms WHERE code=?').get(room.room.code),state=JSON.parse(row.state);
 state.encounter.status='won';state.encounter.validParticipants=[a.id];for(const e of Object.values(state.encounter.enemies))e.hp=0;
 h.sql.prepare('UPDATE stone_rooms SET state=?,revision=revision+1 WHERE code=?').run(JSON.stringify(state),room.room.code);
 await h.sync(a);await h.sync(b);assert(a.character.completedQuestIds.includes('M13'));assert(!b.character.completedQuestIds.includes('M13'));
 const xp=a.character.xpCents,coins=a.character.wallet.coins;await h.sync(a);await h.sync(b);assert.equal(a.character.xpCents,xp);assert.equal(a.character.wallet.coins,coins);
 assert.equal(a.character.bagCapacity,30);h.sql.close();
});

test('commission run uses configured units, retains progress and gives no gray XP or repeat credits (trusted victory fixture)',async()=>{
 const h=harness(),p=await h.create();h.edit(p,c=>{c.currentQuestId='M25';c.sceneId='SC07';c.visitSceneId='SC07';c.completedQuestIds=runtimeQuests.slice(0,24).map(q=>q.id);c.xpCents=7152711;c.position={x:-1.5,y:0,z:5,yaw:0};});await h.sync(p);
 const xp=p.character.xpCents;
 for(let i=0;i<6;i++){
  await h.move(p,{x:-1.5,y:0,z:5});const started=await h.action(p,{type:'encounter',cycleId:'LIBRARY-M10'});assert.equal(started.status,200,JSON.stringify(started));
  h.edit(p,c=>{c.soloEncounter.status='won';c.soloEncounter.validParticipants=[c.id];for(const e of Object.values(c.soloEncounter.enemies))e.hp=0;});await h.sync(p);
  await h.action(p,{type:'retry'});
 }
 assert.equal(p.character.xpCents,xp);assert.equal(p.character.wallet.learningCredits,0);assert.equal(p.character.commissionRuns[0].serverState,'completed');assert.equal(p.character.commissionRuns[0].completedEnemies,6);h.sql.close();
});

test('level-one character follows all 127 exact reward events through 36 goals and real dungeon mechanisms (trusted victory fixtures)',async()=>{
 const h=harness(),p=await h.create();
 // All XP starts at zero and comes through real game operations. Only battle
 // victory is a trusted fixture; actual combat has separate engine/API tests.
 assert.equal(p.character.xpCents,0);
 const plans=contentData.rewardEvents.filter(e=>e.type==='practice'&&e.id.endsWith('-complete')).map(e=>({id:e.id,after:e.questId,cycleId:e.id.replace(/-\d+-complete$/,'')}));
 const completedPlans=new Set();
 async function travel(sceneId){if(p.character.sceneId===sceneId)return;await h.move(p,{x:0,y:0,z:-7});const out=await h.action(p,{type:'travel',targetId:'exit',sceneId});assert.equal(out.status,200,JSON.stringify(out));}
 let actions=0;
 while(!p.character.chapterComplete&&actions++<400){
  if(p.encounter?.status==='won'){await h.action(p,{type:'retry'});continue;}
  const plan=plans.find(r=>!completedPlans.has(r.id)&&p.character.completedQuestIds.includes(r.after));
  if(plan){
   const entrance=contentData.journalCommissionIndex.find(c=>c.cycleId===plan.cycleId);await travel(entrance.initiator.sceneId);
   let runId;
   for(let k=0;k<20;k++){
    await h.move(p,{x:-1.5,y:0,z:5});const out=await h.action(p,{type:'encounter',cycleId:plan.cycleId});assert.equal(out.status,200,JSON.stringify(out));
    runId=p.encounter.runtimeContext.runId;h.edit(p,c=>{c.soloEncounter.status='won';c.soloEncounter.validParticipants=[c.id];for(const e of Object.values(c.soloEncounter.enemies))e.hp=0;});await h.sync(p);
    const done=p.character.commissionRuns.find(r=>r.runId===runId).serverState==='completed';await h.action(p,{type:'retry'});if(done)break;
   }
   assert.equal(p.character.commissionRuns.find(r=>r.runId===runId).serverState,'completed');completedPlans.add(plan.id);
   await travel(runtimeQuests.find(q=>q.id===p.character.currentQuestId).sceneId);continue;
  }
  const scene=p.scene;
  if(scene.dungeon){
   const d=scene.dungeon;let t;
   if(d.roomId==='M31')t=d.chessCommandAt!==null?scene.targets.find(t=>t.id==='safe'):d.chessTurn<3?scene.targets.find(t=>t.id===`piece-${[0,2,1][d.chessTurn]}`):scene.targets.find(t=>t.id==='gate');
   else if(d.roomId==='M30')t=!d.flags.observe?scene.targets.find(t=>t.id==='observe'):!d.flyingPlayers.includes(p.id)?scene.targets.find(t=>t.id==='broom'):!d.flags.key?scene.targets.find(t=>t.id==='key'):scene.targets.find(t=>t.id==='gate');
   else if(d.roomId==='M33')t=!d.flags['clue-left']?scene.targets.find(t=>t.id==='clue-left'):!d.flags['clue-right']?scene.targets.find(t=>t.id==='clue-right'):!d.flags.potion?scene.targets.find(t=>t.id==='potion-1'):scene.targets.find(t=>t.id==='gate');
   else t=scene.targets.find(t=>t.active&&!['service','training','exit','collection'].includes(t.kind));
   assert(t,`No dungeon target ${d.roomId}`);
   if(t.id==='key'){
    // The key moves while the player travels; stay within its capture radius.
    await h.move(p,{x:0,y:1.8,z:-3});let found=false;
    for(let k=0;k<30;k++){await h.sync(p);const key=p.scene.targets.find(t=>t.id==='key');if(Math.hypot(key.position.x-p.character.position.x,key.position.z-p.character.position.z)<1.9){found=true;break;}h.advance(200);}
    assert(found);
   }else await h.move(p,{...t.position,y:0});
   const out=await h.action(p,{type:'interact',targetId:t.id});assert.equal(out.status,200,`${d.roomId}/${t.id}: ${JSON.stringify(out)}`);
   h.advance(t.durationMs+50);await h.sync(p);continue;
  }
  const t=scene.targets.find(t=>t.active&&!['service','training','exit','collection'].includes(t.kind));assert(t,`No story target ${p.character.currentQuestId}`);
  if(['escort','boat'].includes(t.kind)){
   await h.move(p,scene.escort.position);assert.equal((await h.action(p,{type:'interact',targetId:t.id})).status,200);
   for(let k=0;k<100&&p.scene.escort?.progress<1;k++){h.advance(500);await h.sync(p);if(t.kind!=='boat')await h.move(p,p.scene.escort.position);}
   await h.move(p,t.position);await h.action(p,{type:'interact',targetId:t.id});continue;
  }
  await h.move(p,{...t.position,y:t.kind==='flight'?t.minY??1:0});
  if(t.actionType==='encounter'){
   const out=await h.action(p,{type:'encounter',targetId:t.id});assert.equal(out.status,200,`${t.id}: ${JSON.stringify(out)}`);
   h.edit(p,c=>{c.soloEncounter.status='won';c.soloEncounter.validParticipants=[c.id];for(const e of Object.values(c.soloEncounter.enemies))e.hp=0;});await h.sync(p);
  }else if(t.actionType==='skill'){
   const out=await h.action(p,{type:'skill',skillId:t.skillId,targetId:t.id});assert.equal(out.status,200,JSON.stringify(out));h.advance(2000);await h.sync(p);
  }else{
   const out=await h.action(p,{type:'interact',targetId:t.id,choice:1});assert.equal(out.status,200,JSON.stringify(out));if(t.seconds){h.advance(t.seconds*1000+50);await h.sync(p);}
  }
 }
 assert(p.character.chapterComplete,`Stopped at ${p.character.currentQuestId}`);assert.equal(p.character.completedQuestIds.length,36);assert.equal(p.character.bagCapacity,36);assert.equal(p.character.wallet.coins,440);
 assert.equal(p.character.level,24);assert.equal(p.character.xpCents,7156511);assert.equal(completedPlans.size,plans.length);
 const ledger=h.raw(p).xpLedger;assert.equal(ledger.length,127);
 for(const [i,expected]of contentData.referenceReplay.entries()){
  const actual=ledger[i];for(const key of ['levelBefore','awardedXpCents','cumulativeXpCents','levelAfter'])assert.equal(actual[key],expected[key],`${expected.eventId}: ${key}`);
 }
 assert.deepEqual(p.character.completedDungeonRooms,['M28','M29','M30','M31','M32','M33','M34']);
 const saved=await h.call(p.token,`characters/${p.id}`);assert(saved.character.chapterComplete);assert.equal(saved.character.wallet.coins,440);h.sql.close();
});

test('SQL movement acknowledges sustained walk/run steps without losing routes or accepting reordered movement',async()=>{
 const h=harness(),p=await h.create();
 h.edit(p,c=>{c.position={x:0,y:0,z:4,yaw:0};c.sceneId='SC04';c.visitSceneId='SC04';});await h.sync(p);
 let sequence=0,expected={...p.character.position},direction=-1;
 for(const speed of [2.2,4.3])for(let packet=0;packet<50;packet++){
  const frames=packet%3===0?27:9,steps=[];
  for(let frame=0;frame<frames;frame++){
   if(Math.abs(expected.z)>5)direction=-Math.sign(expected.z);
   const dz=direction*speed/60;steps.push({dx:0,dy:0,dz});expected.z+=dz;
  }
  h.advance(frames/60*1000);
  const payload={type:'move',sequence:++sequence,sprint:speed===4.3,position:expected,steps};
  const out=await h.action(p,payload);assert.equal(out.status,200,JSON.stringify(out));
  assert.ok(Math.abs(out.character.position.z-expected.z)<1e-8);assert.equal(out.character.lastAcceptedMoveSequence,sequence);
  if(packet%10===0){
   const retry=await h.action(p,payload);assert.deepEqual(retry.character.position,out.character.position);
   const older=await h.action(p,{...payload,sequence:sequence-1,position:{x:30,y:0,z:30},steps:[{dx:30,dy:0,dz:30}]});
   assert.deepEqual(older.character.position,out.character.position);assert.equal(older.character.lastAcceptedMoveSequence,sequence);
  }
 }
 assert.equal(h.raw(p).xpCents,0);assert.equal(h.raw(p).level,1);h.sql.close();
});

test('SQL movement rejects closed-loop path speed abuse and preserves a precise rejection position',async()=>{
 const h=harness(),p=await h.create(),from={...p.character.position};h.advance(100);
 const refused=await h.action(p,{type:'move',sequence:1,sprint:true,position:from,steps:[{dx:3,dy:0,dz:0},{dx:-3,dy:0,dz:0}]});
 assert.equal(refused.code,'MOVE_TOO_FAST');assert.equal(refused.rejectedSequence,1);assert.deepEqual(refused.rejectedPosition,from);
 assert.equal(h.raw(p).moveSequence,-1);assert.deepEqual(h.raw(p).position,from);
 const tooMany=await h.action(p,{type:'move',sequence:2,position:from,steps:Array.from({length:97},()=>({dx:0,dy:0,dz:0}))});assert.equal(tooMany.code,'INVALID_MOVEMENT_STEPS');
 const forged=await h.action(p,{type:'move',sequence:3,position:{x:10,y:0,z:10},steps:[]});assert.equal(forged.status,200);assert.deepEqual(forged.character.position,from);
 h.sql.close();
});

test('SQL frame path reproduces actual tree corner sliding and safely escapes a legacy furniture overlap',async()=>{
 const {getSceneNavigation}=await import('../chapter-one/client/scene-navigation.mjs');
 const {moveWithCollisions}=await import('../chapter-one/client/scene-geometry.mjs');
 const h=harness(),p=await h.create(),nav=getSceneNavigation('SC12');
 h.edit(p,c=>{c.sceneId='SC12';c.visitSceneId='SC12';c.position={x:-5.6,y:0,z:-.1,yaw:0};});await h.sync(p);
 let point={...p.character.position};const steps=[];
 for(let frame=0;frame<9;frame++){
  const next=moveWithCollisions(point,{x:point.x-Math.SQRT1_2*4.3/60,y:0,z:point.z+Math.SQRT1_2*4.3/60},nav.bounds,nav.walls);
  steps.push({dx:next.x-point.x,dy:0,dz:next.z-point.z});point=next;
 }
 h.advance(150);const moved=await h.action(p,{type:'move',sequence:1,position:point,steps,sprint:true});assert.equal(moved.status,200,JSON.stringify(moved));
 assert.ok(Math.hypot(moved.character.position.x-point.x,moved.character.position.z-point.z)<1e-9);
 h.edit(p,c=>{c.sceneId='SC01';c.visitSceneId='SC01';c.position={x:-6.41,y:0,z:-1,yaw:0};});await h.sync(p);
 h.advance(150);const escape=await h.action(p,{type:'move',sequence:2,position:{x:-6.21,y:0,z:-1},steps:Array.from({length:10},()=>({dx:.02,dy:0,dz:0}))});
 assert.equal(escape.status,200,JSON.stringify(escape));assert.ok(escape.character.position.x> -6.22);h.sql.close();
});

test('SQL jumping from low furniture preserves its floor and accepts the full natural arc without buying horizontal travel',async()=>{
 const h=harness(),p=await h.create();h.edit(p,c=>{c.position={x:-7.25,y:1.1,z:-1,yaw:0};});await h.sync(p);
 let point={...p.character.position},vy=6.2,peak=point.y,sequence=0;
 for(let packet=0;packet<6;packet++){
  const steps=[];
  for(let frame=0;frame<9;frame++){
   vy-=15.4/60;const nextY=Math.max(1.1,point.y+vy/60);steps.push({dx:0,dy:nextY-point.y,dz:0});point.y=nextY;peak=Math.max(peak,nextY);
  }
  h.advance(150);const out=await h.action(p,{type:'move',sequence:++sequence,position:point,steps});assert.equal(out.status,200,JSON.stringify(out));assert.ok(Math.abs(out.character.position.y-point.y)<1e-8);
 }
 assert.ok(peak>2.2);assert.ok(Math.abs(p.character.position.y-1.1)<1e-8);
 h.advance(150);assert.equal((await h.action(p,{type:'move',sequence:++sequence,position:{...point,y:8},steps:[{dx:0,dy:6.9,dz:0}]})).code,'OUT_OF_BOUNDS');
 h.sql.close();
});

test('a real completed boat crossing releases player movement and polling cannot pull a disembarked player back',async()=>{
 const h=harness(),p=await h.create();h.edit(p,c=>{c.currentQuestId='M03';c.sceneId='SC03';c.completedQuestIds=['M01','M02'];});await h.sync(p);
 async function follow(targetId){
  await h.move(p,p.scene.escort.position);assert.equal((await h.action(p,{type:'interact',targetId})).status,200);
  for(let n=0;n<80&&p.scene.escort.progress<1;n++){h.advance(500);await h.sync(p);await h.move(p,p.scene.escort.position);}
  assert.equal(p.scene.escort.progress,1);assert.equal((await h.action(p,{type:'interact',targetId})).status,200);
 }
 await follow('M03-1');await follow('M03-2');
 assert.equal(p.character.objectiveIndex,2);assert.equal((await h.action(p,{type:'interact',targetId:'M03-3'})).status,200);
 const began=h.now;
 for(let n=0;n<45&&p.scene.escort.progress<1;n++){h.advance(500);await h.sync(p);}
 assert.equal(p.scene.escort.progress,1);assert.ok(h.now-began>=18000);
 const arrival={...p.character.position},arrivalMoveAt=h.raw(p).lastMoveAt;
 for(let n=0;n<3;n++){h.advance(500);await h.sync(p);}
 assert.equal(h.raw(p).lastMoveAt,arrivalMoveAt,'a finished crossing cannot repeatedly reset the walking speed budget');
 const shore={...arrival,z:arrival.z-.7};
 const disembark=await h.action(p,{type:'move',sequence:++p.sequence,position:shore,steps:Array.from({length:14},()=>({dx:0,dy:0,dz:-.05}))});
 assert.equal(disembark.status,200,JSON.stringify(disembark));assert.ok(Math.abs(disembark.character.position.z-shore.z)<1e-8);
 const released={...p.character.position},walkedAt=h.raw(p).lastMoveAt;
 for(let n=0;n<4;n++){h.advance(450);await h.sync(p);assert.deepEqual(p.character.position,released);assert.equal(h.raw(p).lastMoveAt,walkedAt);}
 assert.equal((await h.action(p,{type:'interact',targetId:'M03-3'})).status,200);assert.equal(p.character.objectiveIndex,3);
 await follow('M03-4');assert.equal(p.character.currentQuestId,'M04');assert.ok(p.character.completedQuestIds.includes('M03'));h.sql.close();
});
