import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFile} from 'node:fs/promises';
import {createChapterOneApi} from '../chapter-one/online/api.mjs';
import {getHeroStats} from '../chapter-one/rules/index.mjs';
import {growthData} from '../chapter-one/data/index.mjs';

const migration=await readFile(new URL('../drizzle/0009_stone_runtime.sql',import.meta.url),'utf8');
function harness(){
 const sql=new DatabaseSync(':memory:');sql.exec(migration);let now=100000,request=0;
 const statement=(query,values=[])=>({query,values,bind(...args){return statement(query,args);},first(){return sql.prepare(query).get(...values)??null;},all(){return{results:sql.prepare(query).all(...values)};},run(){return{meta:sql.prepare(query).run(...values)};}});
 const DB={prepare:statement,batch(statements){sql.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>/^\s*SELECT/.test(s.query)?s.all():s.run());sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};
 const handle=createChapterOneApi({clock:()=>now,randomSeed:()=>1827});let id;
 async function call(path,body){const response=await handle(new Request('https://qa.invalid/api/stone/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+'a'.repeat(64),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB});return{status:response.status,...await response.json()};}
 const raw=()=>JSON.parse(sql.prepare('SELECT state FROM stone_accounts').get().state).characters[0];
 function edit(fn){const row=sql.prepare('SELECT account_id,state FROM stone_accounts').get(),state=JSON.parse(row.state);fn(state.characters[0]);sql.prepare('UPDATE stone_accounts SET state=?,revision=revision+1 WHERE account_id=?').run(JSON.stringify(state),row.account_id);}
 const action=body=>call(`characters/${id}/actions`,{requestId:`action-${++request}`, ...body});
 async function start(){const created=await call('characters',{requestId:'create-qa-student',heroId:'harry',name:'Skill transport QA'});assert.equal(created.status,201);id=created.character.id;
  edit(c=>{c.currentQuestId='M04';c.sceneId='SC04';c.objectiveIndex=1;c.completedQuestIds=['M01','M02','M03'];c.position={x:1.5,y:0,z:-.5,yaw:0};c.hp=Math.min(c.hp,100);c.focus=10;});
  const encounter=await action({type:'encounter',targetId:'M04-2'});assert.equal(encounter.status,200,JSON.stringify(encounter));return encounter;
 }
 return{sql,raw,edit,action,start,sync:()=>call(`characters/${id}`),advance(ms){now+=ms;},get now(){return now;},get id(){return id;}};
}
const move=(sequence,x=.3,z=5,steps=[{dx:.3,dy:0,dz:0}])=>({sequence,position:{x,y:0,z,yaw:0},steps,sprint:false,flying:false});

test('authoritative skill rejections explain the actual target condition without spending resources or cooldowns',async()=>{
 for(const scenario of [
  {code:'NOT_INTERRUPTIBLE',skillId:'H1',message:/等待敌人进入可打断的蓄力/},
  {code:'MECHANISM_UNAVAILABLE',skillId:'levitate',message:/可漂浮机关或任务目标/},
  {code:'CONTROL_IMMUNE',skillId:'H1',message:/当前免疫控制/},
  {code:'TARGET_NOT_RESCUABLE',skillId:'rescue',message:/救援时限内.*倒地队友/},
  {code:'OUT_OF_RANGE_OR_BLOCKED',skillId:'H1',message:/超出施法距离或被障碍物挡住/},
 ]){
  const h=harness();await h.start();
  h.edit(c=>{
   c.xpCents=growthData.levels[17].cumulativeXpCents;c.level=18;c.stats={...getHeroStats('harry',18)};
   c.completedQuestIds=Array.from({length:11},(_,i)=>`M${String(i+1).padStart(2,'0')}`);
   c.skills=['bolt','dodge','H1','levitate','rescue'];c.hp=c.stats.hp;c.focus=c.stats.focusMax;
   const p=c.soloEncounter.players[c.id];p.stats={...c.stats};p.level=18;p.hp=p.maxHp=c.hp;p.focus=p.maxFocus=c.focus;p.learnedSkillIds=[...c.skills];
   if(scenario.code==='CONTROL_IMMUNE')c.soloEncounter.enemies['enemy-0'].controlImmuneUntil=h.now+5000;
  });
  if(scenario.code==='OUT_OF_RANGE_OR_BLOCKED'){
   h.advance(2000);assert.equal((await h.sync()).status,200);
   assert.equal(h.raw().soloEncounter.enemies['enemy-0'].attack.interruptible,true,'use a real server-generated interruptible windup');
   h.edit(c=>{c.position={x:13,y:0,z:13,yaw:0};c.soloEncounter.players[c.id].position={x:13,y:0,z:13};});
  }
  const before=h.raw();
  const result=await h.action({type:'skill',skillId:scenario.skillId,targetId:scenario.skillId==='rescue'?h.id:'enemy-0',aim:{x:0,z:-1}});
  assert.equal(result.status,409,JSON.stringify(result));assert.equal(result.code,scenario.code);assert.match(result.error,scenario.message);
  assert.doesNotMatch(result.error,/检查距离、专注或冷却/);assert.deepEqual(h.raw(),before,'failed intent must not change HP, focus, cooldowns or rewards');h.sql.close();
 }
});

test('one skill request moves first and casts from the resulting authoritative position, with an idempotent whole-batch receipt',async()=>{
 const h=harness();await h.start();h.advance(200);
 const body={type:'skill',requestId:'one-batch-bolt',skillId:'bolt',movement:move(1),aim:{x:0,z:-1},aimPoint:{x:0,y:.7,z:-1}};
 const [one,retry]=await Promise.all([h.action(body),h.action(body)]);
 for(const result of [one,retry]){assert.equal(result.status,200,JSON.stringify(result));assert.equal(result.character.lastAcceptedMoveSequence,1);assert.equal(result.character.position.x,.3);}
 const stored=h.raw(),fighter=stored.soloEncounter.players[h.id];assert.equal(fighter.action.id,body.requestId);assert.equal(fighter.action.startPosition.x,.3);assert.equal(fighter.position.x,.3);
 assert.equal(stored.soloEncounter.events.filter(e=>e.type==='action_started'&&e.actionId===body.requestId).length,1);
 assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM stone_receipts WHERE request_id=?').get(body.requestId).n,1);
 const changed=await h.action({...body,movement:move(1,.4,5,[{dx:.4,dy:0,dz:0}])});assert.equal(changed.code,'REQUEST_CONFLICT');assert.deepEqual(h.raw(),stored);h.sql.close();
});

test('a rejected spell rolls its otherwise valid movement back and returns the transaction-start correction',async()=>{
 const h=harness();await h.start();const casting=await h.action({type:'skill',skillId:'bolt',aim:{x:0,z:-1}});assert.equal(casting.status,200);
 const before=h.raw();h.advance(50);
 const rejected=await h.action({type:'skill',requestId:'gcd-batch-reject',skillId:'bolt',movement:move(1,.05,5,[{dx:.05,dy:0,dz:0}]),aim:{x:0,z:-1}});
 assert.equal(rejected.code,'GLOBAL_COOLDOWN');assert.equal(rejected.rejectedSequence,1);assert.deepEqual(rejected.rejectedPosition,before.position);assert.deepEqual(h.raw(),before);
 assert.equal(h.sql.prepare('SELECT COUNT(*) n FROM stone_receipts WHERE request_id=?').get('gcd-batch-reject').n,0);h.sql.close();
});

test('movement speed and closed-loop path checks still protect the bundled spell and cannot be bypassed by another action type',async()=>{
 const h=harness();await h.start();h.advance(100);const before=h.raw();
 const rejected=await h.action({type:'skill',skillId:'bolt',movement:move(1,0,5,[{dx:3,dy:0,dz:0},{dx:-3,dy:0,dz:0}])});
 assert.equal(rejected.code,'MOVE_TOO_FAST');assert.equal(rejected.rejectedSequence,1);assert.deepEqual(rejected.rejectedPosition,before.position);assert.deepEqual(h.raw(),before);
 const spoof=await h.action({type:'skill',skillId:'bolt',movement:{...move(2),type:'retry'}});assert.equal(spoof.code,'INVALID_MOVEMENT_STEPS');assert.deepEqual(h.raw(),before);
 const tooMany=await h.action({type:'skill',skillId:'bolt',movement:move(3,0,5,Array.from({length:97},()=>({dx:0,dy:0,dz:0})))});assert.equal(tooMany.code,'INVALID_MOVEMENT_STEPS');assert.deepEqual(h.raw(),before);h.sql.close();
});

test('bundled movement preserves arena wall collision before the spell is accepted',async()=>{
 const h=harness();await h.start();h.edit(c=>{c.position={x:3,y:0,z:2,yaw:0};c.soloEncounter.players[c.id].position={x:3,y:0,z:2};});h.advance(1000);
 const out=await h.action({type:'skill',skillId:'bolt',movement:{...move(1,5.5,2,[{dx:2.5,dy:0,dz:0}]),sprint:true},aim:{x:0,z:-1}});
 assert.equal(out.status,200,JSON.stringify(out));assert.ok(out.character.position.x<3.91);assert.ok(out.character.position.x>3.7);
 assert.equal(out.encounter.players[h.id].action.startPosition.x,out.character.position.x);h.sql.close();
});

test('network replay never restarts a dodge cooldown or consumes a potion twice',async()=>{
 for(const skillId of ['dodge','potion-focus']){
  const h=harness();await h.start();h.advance(200);
  const body={type:'skill',requestId:`retry-${skillId}-batch`,skillId,movement:move(1),aim:{x:0,z:-1}};
  const first=await h.action(body);assert.equal(first.status,200,JSON.stringify(first));const afterAccept=h.raw();
  const retry=await h.action(body);assert.equal(retry.replayed,true);assert.deepEqual(h.raw(),afterAccept);
  h.advance(1100);await h.sync();const released=h.raw(),player=released.soloEncounter.players[h.id];
  if(skillId==='dodge')assert.equal(player.cooldowns.dodge,h.now-1100+3000);
  else{assert.equal(player.potionUses,1);assert.equal(player.potions.focus,0);assert.equal(released.potions.focus,0);assert.ok(player.cooldowns['potion-focus']>h.now);}
  await h.action(body);assert.deepEqual(h.raw(),released);assert.equal(released.position.x,.3);h.sql.close();
 }
});

test('a legal high-precision 96-step skill payload has bounded extra body space while other requests retain 8KiB',async()=>{
 const h=harness();await h.start();h.advance(1000);
 const amount=.0012345678901234567,steps=Array.from({length:96},(_,i)=>({dx:amount,dy:(i%2?-1:1)*amount,dz:amount}));
 const body={type:'skill',requestId:'precision-96-step-cast',skillId:'bolt',movement:{sequence:1,position:{x:96*amount,y:0,z:5+96*amount,yaw:0},steps},aimPoint:{x:0,y:.7,z:-1},aim:{x:0,z:-1}};
 assert.ok(Buffer.byteLength(JSON.stringify(body))>8192,'test must exercise the expanded streaming envelope');assert.ok(Buffer.byteLength(JSON.stringify(body))<24576);
 const accepted=await h.action(body);assert.equal(accepted.status,200,JSON.stringify(accepted));assert.equal(accepted.character.lastAcceptedMoveSequence,1);
 const baseline=h.raw();
 for(const invalid of [{type:'skill',skillId:'bolt',padding:'x'.repeat(8500)},{type:'interact',targetId:'M04-2',padding:'x'.repeat(8500)},{...body,requestId:'oversized-entire-body',padding:'x'.repeat(25000)}]){const result=await h.action(invalid);assert.equal(result.code,'BODY_TOO_LARGE');assert.equal(result.status,413);assert.deepEqual(h.raw(),baseline);}
 h.sql.close();
});

test('published v13 saves can resume an existing tutorial fight with new appearance while unknown versions remain rejected',async()=>{
 const h=harness();await h.start();const legacy='stone-prd-v2-55cc655e22950524';
 h.edit(c=>{c.contentVersion=legacy;const enemy=c.soloEncounter.enemies['enemy-0'];enemy.name='训练纸偶';enemy.attacks[0].name='练习弹';enemy.collisionHeight=1.4;enemy.collisionBase=0;enemy.hp=123;});
 const before=h.raw(),oldEnemy=before.soloEncounter.enemies['enemy-0'];const resumed=await h.sync();assert.equal(resumed.status,200,JSON.stringify(resumed));
 assert.equal(resumed.character.contentVersion,legacy);assert.equal(h.raw().contentVersion,legacy);assert.equal(resumed.character.xpCents,before.xpCents);assert.deepEqual(resumed.character.stats,before.stats);
 const enemy=resumed.encounter.enemies['enemy-0'];assert.equal(enemy.name,'小蜘蛛');assert.equal(enemy.attacks[0].name,'蛛丝喷吐');assert.equal(enemy.collisionHeight,.65);assert.equal(enemy.collisionBase,0);
 for(const key of ['id','templateId','hp','maxHp','level','tier','physicalDefense','magicDefense','attackCooldowns','nextAttackAt','threat'])assert.deepEqual(enemy[key],oldEnemy[key],key);
 assert.equal(enemy.attacks[0].rawDamage,oldEnemy.attacks[0].rawDamage);assert.deepEqual(h.raw().questReceipts,before.questReceipts);
 const cast=await h.action({type:'skill',skillId:'bolt',aimPoint:{x:0,y:.3,z:-1},aim:{x:0,z:-1}});assert.equal(cast.status,200,JSON.stringify(cast));assert.equal(h.raw().contentVersion,legacy);
 h.edit(c=>{c.contentVersion='stone-prd-v2-unknown-future';});const unknown=h.raw();assert.equal((await h.sync()).code,'CONTENT_VERSION_MISMATCH');assert.deepEqual(h.raw(),unknown);h.sql.close();
});
