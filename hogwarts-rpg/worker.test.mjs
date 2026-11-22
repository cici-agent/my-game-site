import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {handleParty} from './worker-api.mjs';
import {normalizeEquipment} from './world/wardrobe.mjs';
const migrations = (await Promise.all(['0000_rpg_parties','0001_rpg_presence','0002_rpg_dungeons','0003_rpg_boats_and_talents'].map(async tag =>
  (await readFile(new URL('./drizzle/' + tag + '.sql',import.meta.url),'utf8')).split('--> statement-breakpoint')
))).flat();
function binding(db) {
  const prepare = sql => ({bind:(...args)=>({first:async()=>db.prepare(sql).get(...args),run:async()=>({meta:db.prepare(sql).run(...args)}),sql,args})});
  return {prepare,batch:async stmts=>{
    db.exec('BEGIN IMMEDIATE');
    try {
      const values = stmts.map(s=> /^SELECT\s/.test(s.sql) ?
        {results:db.prepare(s.sql).all(...s.args)} : {meta:db.prepare(s.sql).run(...s.args)});
      db.exec('COMMIT'); return values;
    } catch (e) { db.exec('ROLLBACK'); throw e; }
  }};
}
test('real SQLite D1 adapter preserves registration, concurrency and progress after reopening',async()=>{
  const tmp=await mkdtemp(join(tmpdir(),'rpg-d1-test-'));
  let conn = new DatabaseSync(join(tmp,'d1.sqlite'));
  const env = {DB:binding(conn)};
  try {
    for(const sql of migrations)conn.exec(sql);
    async function call(path,body,token,origin) {
      const request = new Request('https://test.example'+path,{method:body?'POST':'GET',body:body?JSON.stringify(body):undefined,
        headers:{...(body?{'Content-Type':'application/json'}:{}),...(origin?{Origin:origin}:{}),...(token?{Authorization:'Bearer '+token}:{})}});
      const res=await handleParty(request,env);
      return {status:res.status,...await res.json()};
    }
    const body={name:'甲',clientToken:'a'.repeat(64)};
    const [first,retry]=await Promise.all([call('/api/parties',body),call('/api/parties',body)]);
    assert.equal(first.status,201);assert.equal(retry.status,201);assert.equal(first.memberId,retry.memberId);
    const path='/api/parties/'+first.code;
    const b={name:'乙',clientToken:'b'.repeat(64)};
    const [guest,again]=await Promise.all([call(path+'/join',b),call(path+'/join',b)]);
    assert.equal(guest.status,200);assert.equal(guest.memberId,again.memberId);
    assert.equal(Object.keys(guest.campaign.members).length,2);
    const [x,y]=await Promise.all([first,guest].map(p=>call(path+'/actions',{revision:guest.campaign.revision,choiceIndex:0},p.token)));
    assert.deepEqual([x.status,y.status].sort(),[200,409]);
    const winner=x.status===200?first:guest;
    const duplicate=await call(path+'/actions',{revision:guest.campaign.revision,choiceIndex:0},winner.token);
    assert.equal(duplicate.status,200);assert.equal(duplicate.campaign.history.length,1);
    const joins=await Promise.all(['c','d','e'].map(c=>call(path+'/join',{name:c,clientToken:c.repeat(64)})));
    assert.deepEqual(joins.map(x=>x.status).sort(),[200,200,422]);
    assert.equal((await call(path,null,'0'.repeat(64))).status,401);
    assert.equal((await call(path+'/join',b,null,'https://other.example')).status,403);
    conn.close(); conn=new DatabaseSync(join(tmp,'d1.sqlite'));env.DB=binding(conn);
    const restored=await call(path,null,winner.token);
    assert.equal(restored.memberId,winner.memberId);
    assert.equal(Object.keys(restored.campaign.members).length,4);
    assert.equal(restored.campaign.history.length,1);
    assert.equal((await call(path+'/actions',{revision:restored.campaign.revision,choiceIndex:0},winner.token)).status,200);
    assert.ok(!JSON.stringify(conn.prepare('SELECT * FROM rpg_parties').all()).includes(winner.token));
  } finally {conn.close();await rm(tmp,{recursive:true,force:true});}
});


test('3D presence follows room identity and story scene, exposes jump and cast pulses and expires', async () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const sql of migrations) db.exec(sql);
    const env = {DB:binding(db)};
    async function post(path, body, token) {
      const response = await handleParty(new Request('https://school.example' + path, {method:'POST',
        headers:{'Content-Type':'application/json', ...(token ? {Authorization:'Bearer ' + token} : {})}, body:JSON.stringify(body)}), env);
      return {status:response.status, data:await response.json()};
    }
    const a = (await post('/api/parties',{name:'甲'})).data;
    const path = '/api/parties/' + a.code;
    const b = (await post(path + '/join',{name:'乙'})).data;
    const c = (await post('/api/parties',{name:'其他队伍'})).data;
    const endpoint = path + '/presence';
    const revision = b.campaign.revision;
    const pose = {sceneId:'kings-cross',x:1.3,y:0,z:9.2,yaw:1.2,moving:true,casting:false, stream:'alpha-stream',revision};
    const pulse = {...pose, y:1.1, casting:true, castId:21, castAge:130, jumpId:31, jumpAge:100};
    assert.equal((await post(endpoint,pose,c.token)).status,401);
    assert.equal((await post(endpoint,{...pose,x:'invalid'},a.token)).status,400);
    const first = await post(endpoint,{...pulse,revision:-1},a.token);
    assert.equal(first.status,200);
    assert.deepEqual(first.data.peers,[]);
    assert.equal(first.data.campaign.revision,revision);

    const second = await post(endpoint,{...pose,stream:'beta-stream',memberId:a.memberId},b.token);
    assert.equal(second.status,200);
    assert.equal(second.data.campaign,undefined);
    assert.equal(second.data.peers.length,1);
    const [peer] = second.data.peers;
    assert.equal(peer.id,a.memberId);
    assert.equal(peer.name,'甲');
    assert.equal(peer.y,1.1);
    assert(peer.jumping && peer.casting && peer.moving);
    assert.equal(peer.jumpId,31);
    assert.equal(peer.castId,21);
    assert(!JSON.stringify(second.data).includes(a.token));
    assert(!Object.hasOwn(peer,'stream'));
    const positions=db.prepare('SELECT * FROM rpg_presence').all();
    assert.equal(positions.length,2);
    assert.equal(new Set(positions.map(row=>row.member)).size,2);

    const otherScene=await post(endpoint,{...pose,sceneId:'express'},a.token);
    assert.deepEqual(otherScene.data.peers,[]);
    assert.equal(otherScene.data.campaign.sceneIndex,0);
    assert.equal(db.prepare('SELECT scene FROM rpg_presence WHERE member=?').get(a.memberId).scene,'kings-cross');

    // Refreshing in another tab replaces the stream; the old tab's late leave cannot erase it.
    await post(endpoint,{...pose,stream:'alpha-new'},a.token);
    await post(endpoint,{leave:true,stream:'alpha-stream'},a.token);
    assert.equal((await post(endpoint,{...pose,stream:'beta-stream'},b.token)).data.peers.length,1);
    await post(endpoint,{leave:true,stream:'alpha-new'},a.token);
    assert.equal((await post(endpoint,{...pose,stream:'beta-stream'},b.token)).data.peers.length,0);
    await post(endpoint,pose,a.token);
    db.prepare('UPDATE rpg_presence SET seen_at=0 WHERE member=?').run(a.memberId);
    assert.deepEqual((await post(endpoint,{...pose,stream:'beta-stream'},b.token)).data.peers,[]);

    await post(path+'/actions',{choiceIndex:0,revision},a.token);
    await post(path+'/actions',{choiceIndex:0,revision:revision+1},a.token);
    const advanced = await post(endpoint,pose,b.token);
    assert.equal(advanced.data.campaign.sceneIndex,1);
    assert.deepEqual(advanced.data.peers,[]);
    const platform = await post(endpoint,{...pose,sceneId:'platform',revision:revision+2},a.token);
    assert.equal(platform.status,200);
    assert.deepEqual(platform.data.peers,[]);
  } finally { db.close(); }
});

test('independent runs preserve player progression across heroes, teams, retries and helpers', async t => {
  t.mock.timers.enable({apis:['Date'],now:1_000_000});
  const sql=new DatabaseSync(':memory:');
  t.after(()=>sql.close());
  for(const stmt of migrations) sql.exec(stmt);
  const env={DB:binding(sql)};
  let serial=0;
  const id=()=> 'request-'+ ++serial;
  async function call(key,path,body,expected=200) {
    const response=await handleParty(new Request('https://test.example'+path,{method:body?'POST':'GET',
      headers:{Authorization:'Bearer '+key.repeat(64),...(body?{'Content-Type':'application/json'}:{})},
      body:body&&JSON.stringify(body)}),env);
    const data=await response.json();
    assert.ok([expected].flat().includes(response.status),path+' '+response.status+' '+JSON.stringify(data));
    return data;
  }
  const my=(key,body,status)=>call(key,'/api/profile',body,status);
  const create=(key,kind='troll',requestId=id())=>call(key,'/api/dungeons',{kind,requestId},201);
  const enter=(key,code,status)=>call(key,'/api/dungeons/'+code+'/join',{},status);
  const leave=(key,code)=>call(key,'/api/dungeons/'+code+'/leave',{});
  const act=(key,code,action,requestId=id(),status)=>call(key,'/api/dungeons/'+code+'/actions',{action,requestId},status);
  const count=(profile,id)=>profile.items.find(item=>item.id===id)?.count ?? 0;
  const redeem={action:'exchange',itemId:'practice-crest'};
  const a='a', b='b', c='c', other='d',idle='e';
  await call(a,'/api/profile?existing=1',undefined,404);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM rpg_adventurers').get().n,0);
  for (const [key,heroId] of [[a,'harry'],[b,'hermione'],[c,'ron'],[other,'george'],[idle,'neville']]) {
    const fresh=await my(key); assert.equal(fresh.profile.chapter,1);
    await my(key,{action:'hero',heroId});
    await my(key,{action:'advance'},409);
    await call(key,'/api/dungeons',{kind:'troll',requestId:id()},409);
    await my(key,{action:'learn',skillId:'levitate'},409);
    for(const stage of ['train','lake','classroom','corridor']) await my(key,{action:'stage',stage});
    await Promise.all([my(key,{action:'learn',skillId:'levitate'}),my(key,{action:'learn',skillId:'levitate'})]);
    await my(key,{action:'learn',skillId:'light'});
    const result=await my(key,{action:'learn',skillId:'special'});
    assert.equal(result.profile.xp,80);assert.equal(count(result.profile,'practice-feather'),1);
    await my(key,redeem,409);
  }
  const requestId=id();
  const [host,repeat]=await Promise.all([create(a,'troll',requestId),create(a,'troll',requestId)]);
  assert.equal(host.code,repeat.code);
  const {code}=host, path='/api/dungeons/'+code;
  const isolated=await create(other);
  assert.notEqual(isolated.code,code);
  await my(b,{action:'hero',heroId:'harry'});
  await enter(b,code,409);
  await my(b,{action:'hero',heroId:'hermione'});
  const party=await enter(b,code);
  assert.equal(Object.keys(party.dungeon.players).length,2);
  await enter(idle,code);
  await call(c,path,undefined,403);
  await my(a,{action:'hero',heroId:'ron'},409);
  const pose={x:1,y:0,z:2,yaw:1.2,moving:true,casting:false};
  const fitted={weapon:'harry.weapon.10',top:'harry.top.06'};
  await call(a,path+'/presence',{...pose,equipment:{...fitted,hat:'made-up',extra:'ignored'}});
  const peer=(await call(b,path+'/presence',pose)).peers[0];
  assert.equal(peer.id,host.memberId);
  assert.equal(peer.hero,'harry');
  assert.deepEqual(peer.equipment,normalizeEquipment('harry',fitted));
  // Removing an item must reach peers too. Legacy clients send no equipment at all.
  const others=await call(a,path+'/presence',{...pose,equipment:{weapon:'none'}});
  assert.deepEqual(others.peers[0].equipment,normalizeEquipment('hermione'));
  assert.equal((await call(b,path+'/presence',pose)).peers[0].equipment.weapon,'none');
  assert.deepEqual((await call(other,'/api/dungeons/'+isolated.code+'/presence',pose)).peers,[]);
  const first=id();
  const [one,two]=await Promise.all([act(a,code,'bait',first),act(a,code,'bait',first)]);
  assert.equal(one.dungeon.players[host.memberId].contribution,1);
  assert.equal(two.dungeon.players[host.memberId].contribution,1);
  await act(a,code,'attack',first,409);
  await act(b,code,'levitate');
  async function finish(hostKey,guestKey,arena) {
    let winner;
    for(let i=0;i<90;i++) {
      t.mock.timers.tick(800);
      let {dungeon}=await call(hostKey,'/api/dungeons/'+arena);
      if(dungeon.status==='won') break;
      if(dungeon.phase==='windup') {
        await act(hostKey,arena,'bait');
        await act(guestKey,arena,'levitate');
      } else {
        winner=await act(hostKey,arena,'attack');
        if(winner.dungeon.status==='won') break;
        winner=await act(guestKey,arena,'attack');
        if(winner.dungeon.status==='won') break;
      }
    }
    assert.equal(winner?.dungeon.status,'won');
  }
  await finish(a,b,code);
  const aWon=(await my(a)).profile, bWon=(await my(b)).profile;
  assert.equal(aWon.xp,160); assert.equal(bWon.xp,160);
  assert.equal(aWon.skillPoints,1); assert.deepEqual(aWon.cleared,['troll']);
  assert.equal(bWon.chapter,1);
  const noParticipation=(await leave(idle,code)).profile;
  assert.deepEqual(noParticipation.cleared,[]); assert.equal(noParticipation.xp,80);
  assert.equal(count(noParticipation,'troll-badge'),0);
  assert.equal((await call(other,'/api/dungeons/'+isolated.code)).dungeon.enemy.hp,isolated.dungeon.enemy.maxHp);
  await leave(a,code); await leave(b,code);
  let carried=(await my(a,{action:'advance'})).profile;
  assert.equal(carried.stage,'safe'); assert.equal(carried.chapter,2);
  carried=(await my(a,{action:'talent',heroId:'harry',talentId:'pursuit'})).profile;
  assert.equal(carried.talent,'pursuit'); assert.equal(carried.availablePoints,0);
  await my(a,{action:'talent',heroId:'harry',talentId:'steady-lift'},400);
  await my(b,{action:'talent',heroId:'hermione',talentId:'steady-lift'},409);
  carried=(await my(a,{action:'hero',heroId:'neville'})).profile;
  assert.equal(carried.talent,null); assert.equal(carried.availablePoints,1);
  await my(a,{action:'talent',heroId:'neville',talentId:'recovery'});
  assert.equal(carried.stage,'safe');
  assert.equal(carried.xp,160);
  assert.deepEqual(carried.skills,['light','levitate']);
  const newer=await create(c);
  const helping=await enter(a,newer.code);
  assert.equal(helping.dungeon.players[helping.memberId].talent,'recovery');
  await my(a,{action:'talent',heroId:'neville',talentId:null},409);
  await act(c,newer.code,'bait');
  await act(a,newer.code,'levitate');
  await finish(a,c,newer.code);
  const help=await leave(a,newer.code);
  assert.equal(help.profile.xp,160); assert.equal(count(help.profile,'troll-badge'),1);
  assert.equal(help.profile.stage,'safe');
  assert.equal((await leave(c,newer.code)).profile.xp,160);
  assert.equal((await my(c,{action:'advance'})).profile.chapter,2);
  assert.equal((await my(b)).profile.stage,'corridor');

  await my(a,{action:'hero',heroId:'harry'});
  assert.equal((await my(a)).profile.talent,'pursuit');
  assert.equal((await my(a,{action:'talent',heroId:'harry',talentId:null})).profile.availablePoints,1);
  async function practice(kind) {
    const encounter=await create(a,kind);
    await my(a,redeem,count(encounter.profile,'practice-crest')?200:409);
    for(let i=0;i<12;i++) {
      t.mock.timers.tick(800);
      if((await act(a,encounter.code,'attack')).dungeon.status==='won') return (await leave(a,encounter.code)).profile;
    }
    assert.fail('practice target survived');
  }
  assert.equal((await practice('normal')).xp,180);
  assert.equal(count(await practice('elite'),'training-mark'),2);
  await my(a,redeem,409);
  const third=await practice('normal');
  assert.equal(count(third,'training-mark'),3);
  await Promise.all([my(a,redeem),my(a,redeem)]);
  const after=(await my(a,redeem)).profile;
  assert.equal(count(after,'practice-crest'),1);
  assert.equal(count(after,'training-mark'),0);
  assert.equal(after.xp,240);
  assert.equal(after.skillPoints,1);
  assert.equal(count(await practice('normal'),'training-mark'),1);
  assert.equal(count((await my(b)).profile,'practice-crest'),0);
  assert.equal(count((await my(a,{action:'hero',heroId:'george'})).profile,'practice-crest'),1);
  await my(a,{action:'hero',heroId:'harry'});

  const race=await Promise.all([id(),id()].map(requestId=>call(a,'/api/dungeons',{kind:'troll',requestId},[201,409])));
  assert.equal(race.filter(result=>result.code).length,1);
  const run=race.find(result=>result.code);
  await enter(c,run.code);
  await act(c,run.code,'attack');
  await leave(c,run.code);
  assert.equal((await leave(c,run.code)).profile.activeDungeon,null);
  await enter(c,run.code,409);
  await act(c,run.code,'attack',id(),403);
  await leave(other,isolated.code);
  await enter(other,run.code);
  assert.equal(Object.keys((await call(a,'/api/dungeons/'+run.code)).dungeon.players).length,2);
});

test('chapter peers, shared boat clock and verified old learning follow the correct players', async t => {
  t.mock.timers.enable({apis:['Date'],now:10_000});
  const db=new DatabaseSync(':memory:');
  try {
    for(const stmt of migrations) db.exec(stmt);
    const env={DB:binding(db)};
    async function call(path,body,token) {
      const response=await handleParty(new Request('https://test.example'+path,{method:body?'POST':'GET',
        headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},
        body:body&&JSON.stringify(body)}),env);
      assert.ok(response.ok,await response.clone().text());
      return response.json();
    }
    const A='c'.repeat(64),B='d'.repeat(64);
    const host=await call('/api/parties',{name:'甲',clientToken:A});
    const base='/api/parties/'+host.code;
    const request={name:'甲',clientToken:A,requestId:'fresh-party-1'};
    const [fresh,retry]=await Promise.all([call('/api/parties',request),call('/api/parties',request)]);
    assert.notEqual(fresh.code,host.code);assert.equal(fresh.code,retry.code);
    const guest=await call(base+'/join',{name:'乙',clientToken:B});
    await call('/api/profile',{action:'hero',heroId:'ron'},A);
    await call('/api/profile',{action:'hero',heroId:'george'},B);
    const pose={x:1,y:0,z:0,yaw:0,moving:true,casting:false,sceneId:'chapter-station',stream:'client-pose',revision:guest.campaign.revision};
    await call(base+'/presence',{...pose,hero:'harry',equipment:{hat:'beret',top:'unknown',shoes:'staff',extra:'ignored'}},A);
    const shared=await call(base+'/presence',pose,B);
    assert.equal(shared.peers[0].hero,'ron');
    assert.deepEqual(shared.peers[0].equipment,normalizeEquipment('ron',{hat:'beret'}));
    const legacyHero=await call(base+'/presence',pose,A);
    assert.equal(legacyHero.peers[0].hero,'george');
    assert.deepEqual(legacyHero.peers[0].equipment,normalizeEquipment('george'));
    await call('/api/profile',{action:'stage',stage:'train'},A);
    const newStage=await call(base+'/presence',{...pose,sceneId:'chapter-train'},A);
    assert.deepEqual(newStage.peers,[]);
    const stillStation=await call(base+'/presence',pose,B);
    assert.deepEqual(stillStation.peers,[]);
    const forged=await call(base+'/presence',{...pose,sceneId:'chapter-train'},B);
    assert.deepEqual(forged.peers,[]);
    const recovered=await call('/api/profile',undefined,A);
    assert.equal(recovered.profile.stage,'train');
    assert.equal(recovered.profile.heroId,'ron');

    for(const [token,stages] of [[A,['lake']],[B,['train','lake']]]) {
      for(const stage of stages) await call('/api/profile',{action:'stage',stage},token);
    }
    const [boat,second]=await Promise.all([call(base+'/boat',{},A),call(base+'/boat',{},B)]);
    assert.deepEqual(boat,second);
    assert.equal(boat.boat.departAt-boat.serverNow,4500);
    assert.equal(boat.boat.arriveAt-boat.boat.departAt,6500);
    await call(base+'/presence',{...pose,sceneId:'chapter-lake',escort:0.75},A);
    const lakeView=await call(base+'/presence',{...pose,sceneId:'chapter-lake'},B);
    assert.deepEqual(lakeView.boat,boat.boat); assert.equal(lakeView.peers[0].escort,0.75);
    t.mock.timers.tick(5500);
    assert.deepEqual((await call(base+'/boat',{},B)).boat,boat.boat);
    t.mock.timers.tick(6000);
    const later=await call(base+'/boat',{},B);
    assert.ok(later.boat.departAt>boat.boat.arriveAt);

    // Fixture from a previous online campaign: only the owner's verified skill migrates.
    const row=db.prepare('SELECT campaign FROM rpg_parties WHERE code=?').get(host.code);
    const campaign=JSON.parse(row.campaign);
    campaign.members[host.memberId].skills=['investigate','levitate'];
    db.prepare('UPDATE rpg_parties SET campaign=? WHERE code=?').run(JSON.stringify(campaign),host.code);
    const legacy={action:'import-party',code:host.code};
    assert.equal((await call('/api/profile',legacy,B)).profile.xp,0);
    const imported=(await call('/api/profile',legacy,A)).profile;
    assert.equal(imported.stage,'lake'); assert.deepEqual(imported.cleared,[]);
    assert.deepEqual(imported.skills,['levitate']); assert.equal(imported.xp,40);
    assert.equal((await call('/api/profile',legacy,A)).profile.xp,40);

  } finally {db.close();}
});

test('departing a chapter lobby releases a seat for the next friend without detaching a new seat or a classic save', async () => {
  const db=new DatabaseSync(':memory:');
  try {
    for(const stmt of migrations) db.exec(stmt);
    const env={DB:binding(db)};
    async function call(path,token,body,status=200) {
      const r=await handleParty(new Request('https://school.example'+path,{method:body?'POST':'GET',
        headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},body:body&&JSON.stringify(body)}),env);
      const data=await r.json();assert.equal(r.status,status,path+' '+JSON.stringify(data));return data;
    }
    const [a,b,c,d,e]=['a','b','c','d','e'].map(k=>k.repeat(64));
    const host=await call('/api/parties',a,{name:'甲',clientToken:a,requestId:'travel-party-01'},201);
    const base='/api/parties/'+host.code;
    const join=(k,n,status=200)=>call(base+'/join',k,{name:n,clientToken:k},status);
    const second=await join(b,'乙');await join(c,'丙');await join(d,'丁');
    await join(e,'戊',422);
    await call('/api/profile',b,{action:'hero',heroId:'ron'});
    await call('/api/profile',b,{action:'stage',stage:'train'});
    const pose={x:0,y:0,z:0,yaw:0,moving:true,casting:false,sceneId:'chapter-train',stream:'lobby-stream',revision:0};
    await call(base+'/presence',b,pose);
    assert.equal(db.prepare('SELECT count(*) n FROM rpg_presence WHERE code=?').get(host.code).n,1);
    const results=await Promise.all([1,2].map(()=>call(base+'/depart',b,{memberId:second.memberId})));
    assert.deepEqual(results.map(r=>r.released).sort(),[false,true]);
    assert.equal(db.prepare('SELECT count(*) n FROM rpg_presence WHERE code=?').get(host.code).n,0);
    await call(base+'/presence',b,pose,401);
    const visitor=await join(e,'戊');
    assert.equal(Object.keys(visitor.campaign.members).length,4);
    assert.ok(!visitor.campaign.members[second.memberId]);
    await call(base+'/depart',e,{memberId:visitor.memberId});
    const returned=await join(b,'乙');
    assert.notEqual(returned.memberId,second.memberId);
    const late=await call(base+'/depart',b,{memberId:second.memberId});
    assert.equal(late.released,false);
    assert.equal((await call(base,b)).memberId,returned.memberId);
    assert.equal((await call('/api/profile',b)).profile.stage,'train');

    const classic=await call('/api/parties',a,{name:'原新生',clientToken:a},201);
    const old='/api/parties/'+classic.code;
    const advanced=await call(old+'/actions',a,{choiceIndex:0,revision:classic.campaign.revision});
    assert.equal((await call(old+'/depart',a,{})).released,false);
    assert.deepEqual((await call(old,a)).campaign,advanced.campaign);
  } finally {db.close();}
});

test('a saved first-chapter party can complete seven personal book clears, mentor another player and recover the ending', async t=>{
  const {SAGA}=await import('./js/magic/saga.mjs');
  const {getSagaCue,ENCOUNTER_REWARDS,HEROES}=await import('./js/magic/adventure-rules.mjs');
  t.mock.timers.enable({apis:['Date'],now:2_000_000});
  const db=new DatabaseSync(':memory:');t.after(()=>db.close());
  for(const sql of migrations)db.exec(sql);
  const env={DB:binding(db)};
  let serial=0;
  const reqId=()=> 'chronicle-'+(++serial);
  async function call(token,path,body,expected=200){
    const request=new Request('https://school.example'+path,{method:body?'POST':'GET',
      headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
      body:body?JSON.stringify(body):undefined});
    const res=await handleParty(request,env),data=await res.json();
    assert.ok([expected].flat().includes(res.status),path+' '+JSON.stringify(body)+' '+res.status+' '+(data.error||''));
    return data;
  }
  const profile=async(token,body,status)=>(await call(token,'/api/profile',body,status)).profile;
  const stage=(where)=>({action:'stage',stage:where});
  const A='a'.repeat(64),B='b'.repeat(64),C='c'.repeat(64);
  const action=(token,code,type,status)=>call(token,'/api/dungeons/'+code+'/actions',{requestId:reqId(),action:type},status);
  const leave=(token,code)=>call(token,'/api/dungeons/'+code+'/leave',{});
  const create=(token,kind,status=201)=>call(token,'/api/dungeons',{kind,requestId:reqId()},status);
  const join=(token,code,status)=>call(token,'/api/dungeons/'+code+'/join',{},status);
  const learn=(skillId)=>({action:'learn',skillId});
  // Represent accounts saved before the seven-book release. No later course, encounter or stage is seeded.
  for(const [token,heroId] of [[A,'harry'],[B,'ron'],[C,'hermione']]){
    const saved=await profile(token,{action:'hero',heroId});
    db.prepare("UPDATE rpg_adventurers SET stage='safe' WHERE id=?").run(saved.playerId);
    const insert=db.prepare('INSERT INTO rpg_player_rewards VALUES (?,?,?,?)');
    for(const [ent,xp,points] of [['clear:troll',80,1],['course:light',40,0],['course:levitate',40,0]])insert.run(saved.playerId,ent,xp,points);
  }
  const ids={};
  for(const token of [A,B,C])ids[token]=(await profile(token)).playerId;
  async function win(host,guest,year){
    const opened=await create(host,year.kind),code=opened.code;
    let result=await join(guest,code);
    for(let step=0;step<210;step++){
      t.mock.timers.tick(820);
      result=await call(host,'/api/dungeons/'+code);
      const s=result.dungeon;
      if(s.status==='won')break;
      assert.equal(s.status,'active',year.kind+' failed on '+s.message);
      if(s.phase==='vulnerable'){
        result=await action(host,code,'attack');
        if(result.dungeon.status==='active'&&result.dungeon.phase==='vulnerable')result=await action(guest,code,'attack');
        if(result.dungeon.status==='won')break;
      }else{
        const cue=getSagaCue(s);assert.ok(cue?.action,year.kind+' current objective');
        const who=step%2?guest:host;
        if(cue.late&&s.phaseUntil>Date.now()+2000)t.mock.timers.tick(s.phaseUntil-Date.now()-2000);
        await action(who,code,cue.action);
      }
    }
    assert.equal(result.dungeon.status,'won',year.kind+' '+result.dungeon.message);
    return code;
  }
  await profile(A,stage('year2'),409);
  await profile(A,learn(SAGA[0].spell.id),409);
  await create(A,SAGA[0].kind,409);
  const old=(await profile(A));assert.equal(old.level,2);assert.equal(old.growthPoints,0);
  let expectedPoints=1,expectedXp=160;
  let full;
  for(const [idx,year] of SAGA.entries()){
    const next=SAGA[idx+1]?.stage||'epilogue';
    for(const token of [A,B]){
      await profile(token,stage(year.stage));
      await profile(token,stage(next),409);
      await create(token,year.kind,409);
      const results=await Promise.all([profile(token,learn(year.spell.id)),profile(token,learn(year.spell.id))]);
      assert.equal(results[0].xp,results[1].xp);assert.ok(results[0].skills.includes(year.spell.id));
    }
    if(idx===0){
      const sample=await create(A,year.kind);
      await join(C,sample.code,409);
      await leave(A,sample.code);
    }
    const code=await win(A,B,year);
    expectedPoints+=ENCOUNTER_REWARDS[year.kind].skillPoints;
    expectedXp+=(year.spell.xp??45+10*year.book)+ENCOUNTER_REWARDS[year.kind].xp;
    for(const token of [A,B]){
      const won=(await leave(token,code)).profile;
      assert.equal(won.stage,year.stage);
      assert.ok(won.cleared.includes(year.kind));
      assert.equal(won.items.find(item=>item.id===year.trophy.id).count,1);
      assert.equal(won.xp,expectedXp);assert.equal(won.skillPoints,expectedPoints);
    }
    if(idx===0){
      // Only one shared point remains after reserving the first specialization, even across concurrent tabs.
      const rank=(stat,n=1)=>({action:'growth',stat,rank:n});
      const buys=await Promise.all([rank('vitality'),rank('focus')].map(body=>call(A,'/api/profile',body,[200,409])));
      assert.equal(buys.filter(x=>x.profile).length,1);
      const trained=await profile(A),stat=trained.growth.vitality?'vitality':'focus';
      assert.equal(trained.growthPoints,0);assert.equal(trained.growth[stat],1);
      assert.equal((await profile(A,rank(stat))).growth[stat],1);
      await profile(A,rank(stat,3),409);
      await profile(A,{action:'talent',heroId:'harry',talentId:'pursuit'});
      const check=await create(A,year.kind);
      const fighter=check.dungeon.players[ids[A]];
      assert.equal(fighter.maxHp,HEROES.harry.hp+(fighter.level-1)*2+trained.growth.vitality*6);
      assert.equal(fighter.maxFocus,HEROES.harry.focus+trained.growth.focus*5);
      await leave(A,check.code);
    }
    full=await profile(A,stage(next));
    assert.equal(full.stage,next);assert.equal(full.completed,next==='epilogue');
    await profile(B,stage(next));
  }
  assert.equal(full.book,7);assert.equal(full.cleared.length,8);
  assert.equal((await profile(A,{action:'advance'})).stage,'epilogue');
  await profile(A,{action:'hero',heroId:'neville'});
  await profile(C,stage('year1'));await profile(C,learn(SAGA[0].spell.id));
  const replay=await win(C,A,SAGA[0]);
  const helper=(await leave(A,replay)).profile;
  const first=(await leave(C,replay)).profile;
  assert.equal(helper.stage,'epilogue');assert.equal(helper.xp,expectedXp);assert.equal(helper.skillPoints,expectedPoints);
  assert.equal(first.stage,'year1');assert.ok(first.cleared.includes('quirrell'));assert.ok(!first.cleared.includes('basilisk'));
  assert.equal((await profile(C,stage('year2'))).stage,'year2');
  const recovered=(await call(A,'/api/profile?existing=1')).profile;
  assert.equal(recovered.heroId,'neville');assert.equal(recovered.completed,true);assert.equal(recovered.playerId,ids[A]);
  assert.ok(recovered.skills.includes(SAGA[6].spell.id));
});
