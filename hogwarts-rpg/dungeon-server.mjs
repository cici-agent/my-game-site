import {SAGA} from './js/magic/saga.mjs';
import {normalizeEquipment,supportsWardrobe} from './world/wardrobe.mjs';
import {validTalent} from './js/magic/adventure-talents.mjs';
import {
  HEROES, COURSES, ENCOUNTER_REWARDS, levelFromXp, createEncounter,
  joinEncounter, advanceEncounter, actEncounter, leaveEncounter
} from './js/magic/adventure-rules.mjs';

export const chapterStages = ['station', 'train', 'lake', 'classroom', 'corridor', 'safe', ...SAGA.map(year=>year.stage), 'epilogue'];
const byStage = new Map(SAGA.map(year=>[year.stage,year]));
const byBoss = new Map(SAGA.map(year=>[year.kind,year]));
const bySpell = new Map(SAGA.map(year=>[year.spell.id,year]));
function chapterNumber(stage) {
  if (stage==='epilogue') return SAGA.length+2;
  if (stage==='safe') return 2;
  return (byStage.get(stage)?.book??0)+1;
}
const gradeNumber = stage => stage==='epilogue'?SAGA.at(-1).book:(byStage.get(stage)?.book??1);
const afterStage = (stage, minimum) => chapterStages.indexOf(stage)>=chapterStages.indexOf(minimum);
const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const codePath = /^\/api\/dungeons\/([A-HJ-NP-Z2-9]{8})(?:\/(join|leave|actions|presence))?$/i;
const rewardsGate = "FROM rpg_dungeons WHERE code=? AND last_write=?";

export class AdventureError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function fail(status, message) { throw new AdventureError(status, message); }
function rules(fn, ...args) {
  try { return fn(...args); }
  catch (error) {
    if ([400,403,409,422].includes(error.status)) fail(error.status, error.message);
    throw error;
  }
}
const query = (db, sql, ...args) => db.prepare(sql).bind(...args);
const first = (db, sql, ...args) => query(db, sql, ...args).first();
const run = (db, sql, ...args) => query(db, sql, ...args).run();
function validRequestId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,96}$/.test(value)) fail(400,'缺少有效的操作编号。');
  return value;
}
function profileRow(db, key) {
  return first(db,'SELECT id,name,hero,stage,active_code FROM rpg_adventurers WHERE account_key=?',key);
}
async function ensureAccount(db, key) {
  const row = await profileRow(db,key);
  if (row) return row;
  await run(db,"INSERT OR IGNORE INTO rpg_adventurers(account_key,id,name,hero,stage) VALUES (?,?,'新生','harry','station')",key,crypto.randomUUID());
  return profileRow(db,key);
}
export async function chapterIdentity(db, key) {
  return profileRow(db,key);
}
const crestPrice=3;
const crestEntitlement='exchange:practice-crest';
function inventory(entries, battles) {
  const hasCrest=entries.includes(crestEntitlement);
  const marks=battles-(hasCrest?crestPrice:0);
  return [
    {id:'practice-feather',name:'魔咒课羽毛',count:Number(entries.includes('course:levitate')),description:'完成漂浮咒课的纪念教材，记录你第一次让羽毛悬起。'},
    {id:'training-mark',name:'练习徽记',count:marks,description:'每完成一场有贡献的普通或精英训练获得一枚。三枚可在走廊或安全点兑换一枚实战校徽。'},
    {id:'practice-crest',name:'实战练习校徽',count:Number(hasCrest),description:'用三枚练习徽记换取的个人收藏，每位玩家可兑换一次。'},
    {id:'troll-badge',name:'巨怪挑战勋章',count:Number(entries.includes('clear:troll')),description:'首次参与并制服万圣节巨怪的章节纪念品。'},
    ...SAGA.map(year=>({...year.trophy,count:Number(entries.includes('clear:'+year.kind))}))
  ].filter(item=>item.count>0);
}
async function getProfile(db, key) {
  const row = await ensureAccount(db,key);
  const [total, unlocks, talents] = await db.batch([
    query(db,`SELECT coalesce(sum(xp),0) xp, coalesce(sum(skill_points),0) points,
      count(CASE WHEN entitlement LIKE 'battle:%' THEN 1 END) battles FROM rpg_player_rewards WHERE player=?`,row.id),
    query(db,"SELECT entitlement FROM rpg_player_rewards WHERE player=? AND (entitlement LIKE 'course:%' OR entitlement LIKE 'clear:%' OR entitlement LIKE 'growth:%' OR entitlement=?) ORDER BY entitlement",row.id,crestEntitlement),
    query(db,'SELECT talent FROM rpg_player_talents WHERE player=? AND hero=?',row.id,row.hero)
  ]);
  const entries = unlocks.results.map(x => x.entitlement);
  const totalXp = total.results[0].xp;
  const skills = ['light','levitate',...bySpell.keys()].filter(id => entries.includes('course:'+id));
  if (entries.includes('course:special:'+row.hero)) skills.push('special');
  const talent=talents.results[0]?.talent ?? null;
  const skillPoints=total.results[0].points;
  const growth={vitality:0,focus:0};
  for(const entry of entries){
    if(entry.startsWith('growth:vitality:'))growth.vitality++;
    if(entry.startsWith('growth:focus:'))growth.focus++;
  }
  const assigned=growth.vitality+growth.focus;
  return {playerId:row.id,name:row.name,heroId:row.hero,xp:totalXp,level:levelFromXp(totalXp,35),
    skillPoints,talent,growth,availablePoints:Math.max(0,skillPoints-assigned-(talent?1:0)),
    growthPoints:Math.max(0,skillPoints-assigned-1),chapter:chapterNumber(row.stage),book:gradeNumber(row.stage),
    stage:row.stage,completed:row.stage==='epilogue',
    cleared:entries.filter(e=>e.startsWith('clear:')).map(e=>e.slice(6)),skills,activeDungeon:row.active_code,
    items:inventory(entries,total.results[0].battles)};
}
export async function importPartyLearning(db,key,member) {
  const person=await ensureAccount(db,key);
  if (Array.isArray(member?.skills) && member.skills.includes('levitate')) {
    await run(db,"INSERT OR IGNORE INTO rpg_player_rewards(player,entitlement,xp,skill_points) VALUES (?,'course:levitate',?,0)",person.id,COURSES.levitate.xp);
  }
  return {profile:await getProfile(db,key)};
}
async function updateProfile(db, key, body) {
  const profile = await getProfile(db,key);
  const {action} = body;
  if (action==='exchange' && body.itemId==='practice-crest' && profile.items.some(item=>item.id==='practice-crest')) return {profile};
  if (action === 'name') {
    const name = typeof body.name === 'string' ? body.name.trim().normalize('NFC') : '';
    if (!name || [...name].length > 20 || /[\u0000-\u001f\u007f]/u.test(name)) fail(400,'请填写 1 到 20 个字符的名字。');
    await run(db,'UPDATE rpg_adventurers SET name=? WHERE account_key=?',name,key);
  } else {
    if (profile.activeDungeon) fail(409,'请先退出当前副本，再在安全地点操作。');
    if (action === 'hero') {
      if (typeof body.heroId!=='string' || !Object.hasOwn(HEROES,body.heroId)) fail(400,'请选择有效的学生角色。');
      const result=await run(db,'UPDATE rpg_adventurers SET hero=? WHERE account_key=? AND active_code IS NULL',body.heroId,key);
      if (!result.meta.changes) fail(409,'当前正在进入副本，请先退出。');
    } else if (action === 'stage' || action === 'advance') {
      const stage = action === 'advance' ? 'safe' : body.stage;
      const desired=chapterStages.indexOf(stage), current=chapterStages.indexOf(profile.stage);
      if (desired < 0) fail(400,'地点无效。');
      if (desired > current + 1) fail(409,'请先完成前面的旅程和挑战。');
      const requiredBoss=stage==='safe'?'troll':byStage.get(profile.stage)?.kind;
      if (desired>current && requiredBoss && !profile.cleared.includes(requiredBoss)) fail(409,'请先取得本章核心副本的个人首胜。');
      if (desired > current) {
        const changed = await run(db,'UPDATE rpg_adventurers SET stage=? WHERE account_key=? AND stage=? AND active_code IS NULL',stage,key,profile.stage);
        if (!changed.meta.changes) fail(409,'位置已更新，请重新查看。');
      }
    } else if (action === 'exchange') {
      if (body.itemId!=='practice-crest') fail(400,'这个道具无法兑换。');
      if (!afterStage(profile.stage,'corridor')) fail(409,'请前往走廊或安全点兑换实战校徽。');
      // The unique redemption receipt spends three earned marks exactly once, including concurrent retries.
      await run(db,`INSERT OR IGNORE INTO rpg_player_rewards(player,entitlement,xp,skill_points)
        SELECT a.id,?,0,0 FROM rpg_adventurers AS a WHERE a.account_key=? AND a.active_code IS NULL AND a.stage=?
        AND (SELECT count(*) FROM rpg_player_rewards WHERE player=a.id AND entitlement LIKE 'battle:%')>=?`,
        crestEntitlement,key,profile.stage,crestPrice);
      const updated=await getProfile(db,key);
      if (!updated.items.some(item=>item.id==='practice-crest')) {
        if (updated.activeDungeon) fail(409,'请先离开副本，再到走廊或安全点兑换。');
        fail(409,'还需要攒满三枚练习徽记。');
      }
      return {profile:updated};
    } else if (action === 'talent') {
      if (!afterStage(profile.stage,'safe') || profile.skillPoints<1) fail(409,'请先通关并前往第二章安全点分配技能点。');
      if (body.heroId!==profile.heroId) fail(409,'请选择当前角色的专精。');
      const talent=body.talentId;
      if (talent!==null && !validTalent(profile.heroId,talent)) fail(400,'这项专精不属于当前角色。');
      if (talent===null) {
        await run(db,`DELETE FROM rpg_player_talents WHERE player=? AND hero=?
          AND EXISTS(SELECT 1 FROM rpg_adventurers WHERE account_key=? AND active_code IS NULL AND hero=?)`,
          profile.playerId,profile.heroId,key,profile.heroId);
      } else {
        const changed=await run(db,`INSERT INTO rpg_player_talents(player,hero,talent) SELECT id,hero,? FROM rpg_adventurers
          WHERE account_key=? AND hero=? AND stage=? AND active_code IS NULL
          ON CONFLICT(player,hero) DO UPDATE SET talent=excluded.talent`,talent,key,profile.heroId,profile.stage);
        if (!changed.meta.changes) fail(409,'请先退出副本，在安全点重新选择。');
      }
    } else if (action === 'growth') {
      const {stat,rank}=body;
      if (!['vitality','focus'].includes(stat)||!Number.isSafeInteger(rank)||rank<1) fail(400,'请选择有效的成长属性和等级。');
      if (rank<=profile.growth[stat]) return {profile};
      if (!afterStage(profile.stage,'safe')||rank!==profile.growth[stat]+1||profile.growthPoints<1) fail(409,'请在据点使用可用成长点逐级训练。');
      // SQLite serializes the receipt and balance check together, including different stats bought at once.
      await run(db,`INSERT OR IGNORE INTO rpg_player_rewards(player,entitlement,xp,skill_points)
        SELECT a.id,?,0,0 FROM rpg_adventurers AS a WHERE a.account_key=? AND a.stage=? AND a.active_code IS NULL
        AND (SELECT count(*) FROM rpg_player_rewards WHERE player=a.id AND entitlement LIKE ?)=?
        AND (SELECT coalesce(sum(skill_points),0)-count(CASE WHEN entitlement LIKE 'growth:%' THEN 1 END)
             FROM rpg_player_rewards WHERE player=a.id)>1`,
        'growth:'+stat+':'+rank,key,profile.stage,'growth:'+stat+':%',rank-1);
      const updated=await getProfile(db,key);
      if (updated.growth[stat]<rank) fail(409,'可用技能点或所在地点已变更，请查看最新存档。');
      return {profile:updated};
    } else if (action === 'learn') {
      if (chapterStages.indexOf(profile.stage) < chapterStages.indexOf('classroom')) fail(409,'请先跟随海格抵达霍格沃茨教室。');
      const skill=body.skillId;
      const lesson=bySpell.get(skill);
      if (typeof skill!=='string' || (!lesson&&!Object.hasOwn(COURSES,skill)&&skill!=='special')) fail(400,'这门课尚未开放。');
      if (lesson&&!afterStage(profile.stage,lesson.stage)) fail(409,'请先抵达这一册的课程地点。');
      const entitlement = skill === 'special' ? 'course:special:'+profile.heroId : 'course:'+skill;
      const xp = lesson?(lesson.spell.xp??45+10*lesson.book):skill==='special'?0:COURSES[skill].xp;
      await run(db,'INSERT OR IGNORE INTO rpg_player_rewards(player,entitlement,xp,skill_points) SELECT id,?,?,0 FROM rpg_adventurers WHERE account_key=? AND hero=? AND active_code IS NULL',entitlement,xp,key,profile.heroId);
    } else fail(400,'不支持这个角色操作。');
  }
  return {profile:await getProfile(db,key)};
}
async function instanceRow(db,code) {
  const row = await first(db,'SELECT code,founder,create_request,revision,state FROM rpg_dungeons WHERE code=?',code);
  if (!row) fail(404,'找不到这个副本，请核对邀请码。');
  return {...row,state:JSON.parse(row.state)};
}
function checkEntrance(profile,kind,code) {
  if (profile.activeDungeon && profile.activeDungeon!==code) fail(409,'请先离开当前副本。');
  if (!afterStage(profile.stage,'corridor')) fail(409,'请先到达霍格沃茨走廊的副本入口。');
  const book=byBoss.get(kind);
  if (book && (!afterStage(profile.stage,book.stage)||!profile.skills.includes(book.spell.id))) fail(409,'请先抵达本册并学会对应咒语。');
  if (kind==='troll' && !profile.skills.includes('levitate')) fail(409,'请先在魔咒课上学习漂浮咒。');
}
const fighter = p => ({
  id:p.playerId,name:p.name,hero:p.heroId,level:p.level,
  skills:p.skills,talent:p.talent,growth:p.growth
});
function requireMember(row,profile) {
  if (!Object.hasOwn(row.state.players,profile.playerId) || profile.activeDungeon!==row.code) fail(403,'请先接受这个副本的邀请。');
}
const view = (row, profile) => ({code:row.code,memberId:profile.playerId,dungeon:row.state,profile});
async function createRun(db,key,body) {
  const id = validRequestId(body.requestId), kind=body.kind ?? 'troll';
  if (typeof kind!=='string' || !Object.hasOwn(ENCOUNTER_REWARDS,kind)) fail(400,'副本类别无效。');
  // A retry always addresses the same private invitation without revealing the credential.
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('instance:'+key+':'+id)));
  const code = Array.from(hash.slice(0,8),v=>letters[v&31]).join('');
  const profile=await getProfile(db,key);
  checkEntrance(profile,kind,code);
  const now=Date.now(), state=rules(joinEncounter,rules(createEncounter,kind,now),fighter(profile),now);
  const write=crypto.randomUUID();
  await db.batch([
    query(db,`INSERT OR IGNORE INTO rpg_dungeons(code,founder,create_request,revision,last_write,state)
      SELECT ?,?,?,1,?,? FROM rpg_adventurers WHERE account_key=? AND hero=? AND active_code IS NULL`,
      code,profile.playerId,id,write,JSON.stringify(state),key,profile.heroId),
    query(db,`UPDATE rpg_adventurers SET active_code=? WHERE account_key=? AND EXISTS (SELECT 1 ${rewardsGate})`,code,key,code,write)
  ]);
  const owner=await profileRow(db,key);
  if (owner.active_code && owner.active_code!==code) fail(409,'请先离开当前副本。');
  if (owner.hero!==profile.heroId) fail(409,'角色已更换，请再创建一次。');
  const row=await instanceRow(db,code);
  if (row.founder!==profile.playerId || row.create_request!==id || row.state.kind!==kind) fail(409,'副本编号冲突，请创建新的挑战。');
  const current=await getProfile(db,key);
  requireMember(row,current);
  return view(row,current);
}
async function joinRun(db,key,code) {
  for (let attempt=0; attempt<8;attempt++) {
    const [row,profile]=await Promise.all([instanceRow(db,code),getProfile(db,key)]);
    checkEntrance(profile,row.state.kind,code);
    if (profile.activeDungeon===code && Object.hasOwn(row.state.players,profile.playerId)) return view(row,profile);
    if (row.state.status!=='active') fail(409,'本次挑战已经结束，请重新开一个副本。');
    const departed=await first(db,"SELECT action FROM rpg_dungeon_requests WHERE code=? AND player=? AND request_id='@departure'",code,profile.playerId);
    if (departed?.action==='retreated') fail(409,'你已撤离这场战斗，请参加新的副本。');
    const prior=row.state.players[profile.playerId];
    if (prior && prior.hero!==profile.heroId) fail(409,'请切回原角色重新加入这场战斗。');
    const next=rules(joinEncounter,row.state,fighter(profile),Date.now()), write=crypto.randomUUID();
    if (next.status!=='active') fail(409,'本次挑战已经结束，请重新开一个副本。');
    const [result]=await db.batch([
      query(db,`UPDATE rpg_dungeons SET state=?,revision=revision+1,last_write=? WHERE code=? AND revision=?
        AND EXISTS (SELECT id FROM rpg_adventurers WHERE account_key=? AND hero=? AND active_code IS NULL)`,
        JSON.stringify(next),write,code,row.revision,key,profile.heroId),
      query(db,`UPDATE rpg_adventurers SET active_code=? WHERE account_key=? AND EXISTS(SELECT 1 ${rewardsGate})`,code,key,code,write)
    ]);
    if (result.meta.changes) return view({...row,state:next},await getProfile(db,key));
  }
  fail(409,'小队刚刚有变动，请重试加入。');
}
function actionPayload(value) {
  const type=typeof value==='string'?value:value?.type;
  const target=typeof value==='object' && value ? value.target : undefined;
  if (typeof type!=='string'||type.length>24 || (target!==undefined && (typeof target!=='string'||target.length>72))) fail(400,'战斗行动格式无效。');
  return target ? {type,target} : {type};
}
async function processRun(db,key,code,body) {
  const id = body && validRequestId(body.requestId), action=body && actionPayload(body.action);
  for (let attempt=0;attempt<10;attempt++) {
    const row=await instanceRow(db,code);
    // The reward and the winning state commit together. Read the account after the
    // encounter so an observer of a victory always sees the corresponding first clear.
    const profile=await getProfile(db,key);
    requireMember(row,profile);
    if (body) {
      const prior=await first(db,'SELECT action FROM rpg_dungeon_requests WHERE code=? AND player=? AND request_id=?',code,profile.playerId,id);
      if (prior) {
        if (prior.action!==JSON.stringify(action)) fail(409,'这个编号已用于另一项操作。');
        return view(await instanceRow(db,code),await getProfile(db,key));
      }
    }
    const now=Date.now(), next=body?rules(actEncounter,row.state,profile.playerId,action,now):rules(advanceEncounter,row.state,now);
    const encoded=JSON.stringify(next);
    // Polls can project focus/cooldowns locally from the persisted clock. Save a read only
    // when the encounter actually changes (damage, rescue, phase, or the end of a run).
    if (!body) {
      const changed=next.status!==row.state.status || next.phaseUntil!==row.state.phaseUntil ||
        Object.values(next.players).some(p=>p.hp!==row.state.players[p.id].hp || p.contribution!==row.state.players[p.id].contribution);
      if (!changed) return view({...row,state:next},profile);
    }
    const write=crypto.randomUUID();
    const batch=[query(db,`UPDATE rpg_dungeons SET state=?,last_write=?,revision=revision+1 WHERE code=? AND revision=?
      AND EXISTS(SELECT id FROM rpg_adventurers WHERE account_key=? AND active_code=?)`,encoded,write,code,row.revision,key,code)];
    if (body) batch.push(query(db,`INSERT INTO rpg_dungeon_requests(code,player,request_id,action) SELECT code,?,?,? ${rewardsGate}`,
      profile.playerId,id,JSON.stringify(action),code,write));
    if (next.status==='won' && row.state.status!=='won') {
      const reward=ENCOUNTER_REWARDS[next.kind];
      const entitlement=next.kind==='troll'||byBoss.has(next.kind)?'clear:'+next.kind:'battle:'+code;
      for (const person of Object.values(next.players)) {
        if (person.contribution>0) batch.push(query(db,`INSERT OR IGNORE INTO rpg_player_rewards(player,entitlement,xp,skill_points) SELECT ?,?,?,? ${rewardsGate}`,
          person.id,entitlement,reward.xp,reward.skillPoints,code,write));
      }
    }
    const [result]=await db.batch(batch);
    if (result.meta.changes) return view({...row,state:next},await getProfile(db,key));
    if ((await profileRow(db,key)).active_code!==code) fail(403,'你已经离开这个副本。');
  }
  fail(409,'战斗正在更新，请重试。');
}
async function leaveRun(db,key,code) {
  for (let attempt=0;attempt<8;attempt++) {
    const [row,p]=await Promise.all([instanceRow(db,code),getProfile(db,key)]);
    const joined=Object.hasOwn(row.state.players,p.playerId);
    if (p.activeDungeon!==code || !joined) {
      const prior=await first(db,"SELECT action FROM rpg_dungeon_requests WHERE code=? AND player=? AND request_id='@departure'",code,p.playerId);
      if (!joined && !prior) fail(403,'你没有参加这次挑战。');
      return {profile:p};
    }
    const next=rules(leaveEncounter,row.state,p.playerId,Date.now()), write=crypto.randomUUID();
    const result=await db.batch([
      query(db,`UPDATE rpg_dungeons SET state=?,revision=revision+1,last_write=? WHERE code=? AND revision=?
        AND EXISTS(SELECT 1 FROM rpg_adventurers WHERE account_key=? AND active_code=?)`,JSON.stringify(next),write,code,row.revision,key,code),
      query(db,`UPDATE rpg_adventurers SET active_code=NULL WHERE account_key=? AND active_code=? AND EXISTS(SELECT 1 ${rewardsGate})`,key,code,code,write),
      query(db,`DELETE FROM rpg_presence WHERE code=? AND member=? AND EXISTS(SELECT 1 ${rewardsGate})`,'dungeon:'+code,p.playerId,code,write),
      query(db,`INSERT OR REPLACE INTO rpg_dungeon_requests(code,player,request_id,action) SELECT code,?,'@departure',? ${rewardsGate}`,
        p.playerId,row.state.started?'retreated':'returned',code,write)
    ]);
    if (result[0].meta.changes) return {profile:await getProfile(db,key)};
  }
  fail(409,'战斗正在结算，请重试离开。');
}
async function presence(db,key,code,body) {
  const [row,p]=await Promise.all([instanceRow(db,code),profileRow(db,key)]);
  if (!p || p.active_code!==code || !Object.hasOwn(row.state.players,p.id)) fail(403,'请先接受这个副本的邀请。');
  const {x,y=0,z,yaw,moving,casting}=body;
  if (![x,y,z,yaw].every(Number.isFinite) || Math.abs(x)>4096 || Math.abs(z)>4096 || y< -1 || y>30 ||
    typeof moving!=='boolean'||typeof casting!=='boolean') fail(400,'角色位置有误。');
  const safe={id:p.id,name:p.name,hero:p.hero,x,y,z,yaw,moving,casting};
  if(supportsWardrobe(p.hero))safe.equipment=normalizeEquipment(p.hero,body.equipment);
  const now=Date.now(),channel='dungeon:'+code;
  const [,others]=await db.batch([
    query(db,`INSERT INTO rpg_presence(code,member,scene,stream,pose,seen_at)
      SELECT ?,?,?,'dungeon',?,? FROM rpg_adventurers WHERE account_key=? AND active_code=?
      ON CONFLICT(code,member) DO UPDATE SET pose=excluded.pose,seen_at=excluded.seen_at`,
      channel,p.id,code,JSON.stringify(safe),now,key,code),
    query(db,'SELECT pose,seen_at FROM rpg_presence WHERE code=? AND member!=? AND seen_at>? LIMIT 3',channel,p.id,now-15000)
  ]);
  return {peers:others.results.map(entry=>{
    const pose=JSON.parse(entry.pose);
    if(supportsWardrobe(pose.hero))pose.equipment=normalizeEquipment(pose.hero,pose.equipment);
    return now-entry.seen_at>2500 ? {...pose,moving:false,casting:false} : pose;
  })};
}
export async function handleAdventure(db,key,path,method,body) {
  if(path==='/api/profile') {
    if(method==='GET') return {profile:await getProfile(db,key)};
    if(method==='POST') return updateProfile(db,key,body);
  }
  if(path==='/api/dungeons' && method==='POST') return createRun(db,key,body);
  const match=codePath.exec(path);
  if(!match) fail(404,'找不到这个游戏地址。');
  const code=match[1].toUpperCase(), op=match[2];
  if(!op && method==='GET') return processRun(db,key,code,null);
  if(method==='POST') {
    if(op==='join') return joinRun(db,key,code);
    if(op==='actions') return processRun(db,key,code,body);
    if(op==='leave') return leaveRun(db,key,code);
    if(op==='presence') return presence(db,key,code,body);
  }
  fail(405,'不支持这个请求方式。');
}
