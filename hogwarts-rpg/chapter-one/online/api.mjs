import { contentData } from '../data/index.mjs';
import { contentVersion,MAX_XP_CENTS,getHeroStats,getLevelFromXpCents,getXpProgress,getBagCapacity,getSkillEligibility,settleXp,calculateRepeatXpCents } from '../rules/index.mjs';
import { occupiedBagSlots } from '../rules/bag.mjs';
import { getFlightPermission } from '../rules/flight.mjs';
import { isSelectableHero } from '../roster.mjs';
import { buildJournal } from '../quests/journal.mjs';
import { runtimeQuests,questById,getSceneView,commissionUnlocked,SPAWN,ESCORT_START,BOUNDS,SERVICE_POSITION,TRAINING_POSITION,availableServices,dangerQuestIds,isSafeExploration } from './catalog.mjs';
import { readAccount,readRoom,readReceipt,commit } from './storage.mjs';
import { getSceneNavigation } from '../client/scene-navigation.mjs';
import { replayMovement,standingFloor } from '../client/scene-geometry.mjs';
import { WALK_SPEED,RUN_SPEED,FLIGHT_SPEED,JUMP_SPEED,JUMP_APEX,MAX_MOVE_CREDIT_SECONDS,MAX_MOVE_STEPS,movementPath } from '../movement.mjs';
import { createEncounter,advanceEncounter,applyCombatIntent,moveCombatPlayer,getEncounterView,rewardEligibility } from '../combat/engine.mjs';
import { createRoom,advanceRoom,applyRoomIntent } from '../dungeons/stone-route.mjs';

export class StoneError extends Error { constructor(code,message,status=400){super(message);this.code=code;this.status=status;} }
const fail=(code,message,status=400)=>{throw new StoneError(code,message,status);};
const clone=value=>structuredClone(value);
const itemById=new Map(contentData.items.map(x=>[x.itemId,x]));
const skillFailureMessages={
 NOT_INTERRUPTIBLE:'请等待敌人进入可打断的蓄力，再施放打断咒。',
 MECHANISM_UNAVAILABLE:'请对准已开放的可漂浮机关或任务目标，再使用对应动作。',
 CONTROL_IMMUNE:'目标当前免疫控制，请等待免疫结束；首领无法被此技能控制。',
 TARGET_NOT_RESCUABLE:'请对准仍在救援时限内、尚未被救起的倒地队友。',
 OUT_OF_RANGE_OR_BLOCKED:'目标超出施法距离或被障碍物挡住，请靠近并移到视线畅通的位置。',
};
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const near=(c,p,r=2.2)=>distance(c.position,p)<=r;
const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
const digest=async text=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))));
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const questId=c=>c.activity?.questId??c.currentQuestId;
const objectiveIndex=c=>c.activity?.objectiveIndex??c.objectiveIndex;
const activeObjective=c=>questById.get(questId(c))?.objectives[objectiveIndex(c)];
const inStoryScene=c=>c.sceneId===questById.get(questId(c))?.sceneId;
function requireStoryScene(c){if(!inStoryScene(c))fail('WRONG_STORY_SCENE','请通过场景出口回到当前主线所在区域。',409);}
const activeEncounter=(c,room)=>room?.state.encounter?.players?.[c.id]&&room.state.encounter.status==='active'?room.state.encounter:c.soloEncounter??(room?.state.encounter?.players?.[c.id]?room.state.encounter:null);
function setEncounter(c,room,encounter){if(room?.state.encounter?.id===encounter.id)room.state.encounter=encounter;else c.soloEncounter=encounter;}
function unlocked(c,rule={}){return c.level>=(rule.requiredLevel??1)&&(rule.requiredQuestIds??[]).every(q=>c.completedQuestIds.includes(q));}
function recalc(c){
 const previousStats=c.stats;
 c.level=getLevelFromXpCents(c.xpCents);c.stats={...getHeroStats(c.heroId,c.level)};
 for(const id of Object.values(c.equipment))for(const [key,value]of Object.entries(itemById.get(id)?.effect?.stats??{})){const stat=key==='maxHp'?'hp':key;c.stats[stat]=(c.stats[stat]??0)+value;}
 // A stat recalculation changes the resource ceiling, never the filled fraction.
 // Use the prior aggregate (including equipment) so swapping back cannot heal.
 const preserve=(current,oldMax,newMax)=>current==null?newMax:Math.max(0,Math.min(newMax,Number.isFinite(oldMax)&&oldMax>0&&oldMax!==newMax?current/oldMax*newMax:current));
 c.bagCapacity=getBagCapacity(c.completedQuestIds);c.hp=preserve(c.hp,previousStats?.hp,c.stats.hp);c.focus=preserve(c.focus,previousStats?.focusMax,c.stats.focusMax);
 for(const skill of contentData.skills)if(getSkillEligibility({heroTemplateId:c.heroId,level:c.level,skillId:skill.id,completedQuestIds:c.completedQuestIds}).allowed&&!c.skills.includes(skill.id))c.skills.push(skill.id);
}
function createCharacter(heroId,name,now){
 if(!isSelectableHero(heroId))fail('UNKNOWN_HERO','请选择哈利、罗恩或赫敏。');
 if(typeof name!=='string'||!name.trim()||[...name.trim()].length>20||/[\u0000-\u001f\u007f]/u.test(name))fail('INVALID_NAME','玩家名字需为1至20个字符。');
 const id=crypto.randomUUID();
 const c={id,characterId:id,heroId,name:name.trim(),contentVersion,revision:0,createdAt:now,lastSeenAt:now,
  xpCents:0,level:1,stats:{},hp:null,focus:null,flying:false,position:{...SPAWN},lastMoveAt:now,moveSequence:-1,moveAllowance:.12,
  currentQuestId:'M01',sceneId:'SC01',objectiveIndex:0,completedQuestIds:[],skills:[],questReceipts:[],
  inventory:[],equipment:{weapon:'ITEM-GEAR-BASE-WAND',top:'ITEM-GEAR-BASE-TOP',gloves:'ITEM-GEAR-BASE-GLOVES'},
  wallet:{coins:0,learningCredits:0},potions:{health:1,focus:1},potionPreference:{health:1,focus:1},
  tools:[],appearances:[],collectionIds:[],collectionItems:[],acceptedSideQuestIds:[],commissionRuns:[],trackedIds:[],pendingClaims:[],
  roomCode:null,soloEncounter:null,activity:null,completedDungeonRooms:[],chapterComplete:false,escort:null,escortOrigin:{...ESCORT_START},hold:null,notice:'欢迎来到九又四分之三站台。'};
 recalc(c);c.hp=c.stats.hp;c.focus=c.stats.focusMax;return c;
}
function grantXp(c,eventId,key=eventId){
 if(c.questReceipts.includes(key))return;
 const xp=settleXp({totalXpCents:c.xpCents,eventId});c.xpCents=xp.totalXpCents;c.questReceipts.push(key);recalc(c);auditXp(c,{sourceKey:key,eventId,levelBefore:xp.levelBefore,awardedXpCents:xp.awardedXpCents,levelAfter:c.level,cumulativeXpCents:c.xpCents});
}
function auditXp(c,entry){c.xpLedger??=[];c.xpLedger.push(entry);if(c.xpLedger.length>256)c.xpLedger.shift();}
function grantRepeat(c,level,units){const levelBefore=c.level,before=c.xpCents;c.xpCents=Math.min(MAX_XP_CENTS,c.xpCents+calculateRepeatXpCents({characterLevel:c.level,contentLevel:level,units}));recalc(c);auditXp(c,{type:'repeat',contentLevel:level,units,levelBefore,awardedXpCents:c.xpCents-before,levelAfter:c.level,cumulativeXpCents:c.xpCents});}
function owns(c,itemId){return c.inventory.includes(itemId)||Object.values(c.equipment).includes(itemId)||c.pendingClaims.some(x=>x.itemId===itemId)||c.appearances.includes(itemId)||c.tools.includes(itemId)||c.collectionItems.includes(itemId);}
function grantItem(c,itemId,key){
 const item=itemById.get(itemId);if(!item)fail('UNKNOWN_ITEM','物品目录不匹配。',500);
 if(owns(c,itemId))return false;
 if(item.storage==='normalBag'){if(occupiedBagSlots(c)<c.bagCapacity)c.inventory.push(itemId);else c.pendingClaims.push({id:key,itemId});}
 else if(item.storage==='codex')c.collectionItems.push(itemId);
 else if(item.category==='cosmetic')c.appearances.push(itemId);
 else c.tools.push(itemId);
 return true;
}
function completeQuest(c,now){
 const id=questId(c),q=questById.get(id),replay=!!c.activity;
 if(replay){
  for(const event of contentData.rewardEvents.filter(e=>e.questId===id&&e.type==='dungeon'&&!e.id.endsWith('run-clear')))grantXp(c,event.id,`${c.activity.runId}:${event.id}`);
  if(!c.activity.completedRooms.includes(id))c.activity.completedRooms.push(id);
  if(id==='M34'){
   if(['M28','M29','M30','M31','M32','M33'].every(x=>c.activity.completedRooms.includes(x))){
    const creditEligible=c.level<28;
    grantXp(c,'M34run-run-clear',`${c.activity.runId}:run-clear`);
    if(creditEligible)c.wallet.learningCredits+=6;
   }
   c.activity=null;c.visitSceneId=null;c.sceneId=questById.get(c.currentQuestId)?.sceneId??'SC04';c.notice='魔法石完整重演完成，个人奖励已保存。';
  }else{c.activity.questId=q.nextQuestId;c.activity.objectiveIndex=0;c.sceneId=questById.get(q.nextQuestId).sceneId;}
 }else if(!c.completedQuestIds.includes(id)){
  const events=contentData.rewardEvents.filter(e=>e.questId===id&&(e.type==='first_goal'||e.type==='story_enemy'||e.type==='dungeon'));
  let creditLevel=c.level;
  for(const event of events){if(event.id.endsWith('run-clear')){if(!['M28','M29','M30','M31','M32','M33'].every(x=>c.completedDungeonRooms.includes(x)))continue;creditLevel=c.level;}grantXp(c,event.id);}
  c.completedQuestIds.push(id);if(/^M(28|29|30|31|32|33|34)$/.test(id))c.completedDungeonRooms.push(id);
  recalc(c);
  for(const r of contentData.economyRewards.coinFirstClearRewards.filter(r=>r.questId===id))c.wallet.coins+=r.amount;
  for(const r of contentData.economyRewards.guaranteedGearRewards.filter(r=>r.questId===id)){
   const choices=r.itemChoices.filter(i=>!owns(c,i));
   if(!choices.length)c.wallet.learningCredits+=r.duplicateOwnedCompensationCredits;
   else if(choices.length===1)grantItem(c,choices[0],r.rewardKey);
   else c.pendingClaims.push({id:r.rewardKey,choices,quantity:1});
  }
  for(const r of contentData.economyRewards.collectionFirstRewards.filter(r=>r.questId===id))grantItem(c,r.itemId,r.rewardKey);
  if(id==='M13'&&creditLevel<23)c.wallet.learningCredits+=2;
  if(id==='M34'&&creditLevel<28&&['M28','M29','M30','M31','M32','M33'].every(x=>c.completedDungeonRooms.includes(x)))c.wallet.learningCredits+=6;
  for(const item of contentData.items)if(item.storage==='permanentTools'&&unlocked(c,item.unlock))grantItem(c,item.itemId,`unlock:${item.itemId}`);
  if(id==='M36')c.chapterComplete=true;
  else{c.currentQuestId=q.nextQuestId;c.objectiveIndex=0;c.sceneId=questById.get(q.nextQuestId).sceneId;}
  c.notice=`已完成「${q.name}」，奖励与进度已保存。`;
 }
 c.escort=null;c.escortOrigin={...ESCORT_START};c.hold=null;c.dungeonRoom=null;c.flying=false;c.position={...SPAWN};c.lastMoveAt=now;c.visitSceneId=null;
}
function completeObjective(c,now){
 if(questId(c)==='M27')grantXp(c,['M27A','M27B','M27C'][objectiveIndex(c)]);
 c.escortOrigin={...activeObjective(c).position};
 if(c.activity)c.activity.objectiveIndex++;else c.objectiveIndex++;
 c.hold=null;c.escort=null;
 const q=questById.get(questId(c));
 if(objectiveIndex(c)>=q.objectives.length)completeQuest(c,now);
 else c.notice=q.objectives[objectiveIndex(c)].label;
}
function project(c,now){
 const result=clone(c);delete result.soloEncounter;delete result.questReceipts;delete result.lastMoveAt;delete result.moveSequence;delete result.xpLedger;
 result.lastAcceptedMoveSequence=c.moveSequence;
 result.bagSlotsUsed=occupiedBagSlots(c);
 result.flying=Boolean(c.flying);
 result.courseTrialSkillIds=c.currentQuestId==='M04'&&!c.completedQuestIds.includes('M04')?['bolt','dodge']:activeObjective(c)?.kind==='cast'?[activeObjective(c).skillId]:[];
 result.xp=getXpProgress(c.xpCents);result.progressRevision=c.revision;
 result.mainQuestStates=Object.fromEntries(contentData.quests.map(q=>[q.id,{serverState:c.completedQuestIds.includes(q.id)?'completed':q.id===c.currentQuestId?'active':'locked',confirmedObjectives:q.id===c.currentQuestId?questById.get(q.id).objectives.slice(0,c.objectiveIndex).map(o=>o.id):[]}]));
 result.commissionEntryStates=Object.fromEntries(contentData.commissionCycles.map(x=>[x.cycleId,{available:commissionUnlocked(c,x.cycleId)}]));
 result.journal=buildJournal({mainQuests:contentData.quests,sideQuests:contentData.sideQuests,commissions:contentData.journalCommissionIndex,character:result});
 result.scene=getSceneView(c,now);return result;
}
// This explicitly approved presentation-only revision preserves every numeric
// progression, reward and enemy combat value from the published v13 saves.
const compatibleSaveVersions=new Set([contentVersion,'stone-prd-v2-55cc655e22950524']);
function characterIn(account,id){const c=account.state.characters.find(c=>c.id===id);if(!c)fail('CHARACTER_NOT_FOUND','找不到该玩家的角色。',404);if(!compatibleSaveVersions.has(c.contentVersion))fail('CONTENT_VERSION_MISMATCH','存档版本需要兼容更新，请保留恢复码。',409);return c;}
function safe(c,room){if(activeEncounter(c,room)?.status==='active')fail('IN_COMBAT','战斗中暂时不能执行这项操作。',409);}
function safeService(c,room,serviceId='SERVICE-SUPPLY'){safe(c,room);const service=availableServices(c).find(s=>s.serviceId===serviceId);if(!service)fail('SERVICE_LOCKED','请前往该服务所在的已开放安全区域。',409);if(!near(c,service.position))fail('TOO_FAR',`请走到${service.name}的服务台旁。`,409);}
function isCollision(error){return /CHECK constraint|stone_commit_guard|UNIQUE constraint|constraint failed|SQLITE_BUSY|database is locked/i.test(String(error));}
function response(data,status=200){return Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});}
async function bodyOf(req){
 if(!req.headers.get('content-type')?.startsWith('application/json'))fail('JSON_REQUIRED','请提交JSON操作。',415);
 const reader=req.body?.getReader();if(!reader)fail('INVALID_BODY','请求格式错误。');
 const chunks=[];let length=0;
 try{for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>24576){await reader.cancel();fail('BODY_TOO_LARGE','请求太大。',413);}chunks.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 const text=new TextDecoder().decode(bytes);
 let body;try{body=JSON.parse(text);}catch{fail('INVALID_JSON','请求格式错误。');}
 const bundledMove=body?.type==='skill'&&body.movement&&typeof body.movement==='object'&&!Array.isArray(body.movement)&&Array.isArray(body.movement.steps)&&body.movement.steps.length<=MAX_MOVE_STEPS;
 if(length>8192&&body?.type!=='move'&&!bundledMove)fail('BODY_TOO_LARGE','请求太大。',413);
 if(!body||typeof body!=='object'||Array.isArray(body))fail('INVALID_BODY','请求格式错误。');return body;
}
async function actor(req){const token=/^Bearer ([a-f0-9]{64})$/i.exec(req.headers.get('Authorization')??'')?.[1];if(!token)fail('UNAUTHORIZED','请使用原设备或恢复码进入冒险。',401);return digest(`stone-account-v1:${token.toLowerCase()}`);}
function roomPublic(room,accounts,now){if(!room)return null;return {code:room.state.code,leaderId:room.state.leaderId,revision:room.state.revision??0,
 members:room.state.members.map(m=>{const c=accounts.find(a=>a.id===m.accountId)?.state.characters.find(c=>c.id===m.characterId);return c?{id:c.id,heroId:c.heroId,name:c.name,level:c.level,hp:c.hp,flying:Boolean(c.flying),equipment:{...c.equipment},sceneId:c.sceneId,position:c.position,currentQuestId:c.currentQuestId,lastSeenAt:c.lastSeenAt}:null;}).filter(Boolean),
 encounter:room.state.encounter?getEncounterView(room.state.encounter):null,serverTime:now};}

export function createChapterOneApi({clock=Date.now,randomSeed=()=>crypto.getRandomValues(new Uint32Array(1))[0]}={}){
 async function loadContext(db,accountId,characterId,now,roomCode){
  const account=await readAccount(db,accountId,now),c=characterIn(account,characterId);
  const room=await readRoom(db,roomCode??c.roomCode??'');
  const accounts=[account];
  if(room)for(const member of room.state.members)if(!accounts.some(a=>a.id===member.accountId))accounts.push(await readAccount(db,member.accountId,now));
  return {account,c,room,accounts};
 }
 function resultOf(ctx,now){return {character:project(ctx.c,now),room:roomPublic(ctx.room,ctx.accounts,now),encounter:activeEncounter(ctx.c,ctx.room)?getEncounterView(activeEncounter(ctx.c,ctx.room),ctx.c.id):null,scene:getSceneView(ctx.c,now),revision:ctx.c.revision,serverTime:now};}
 async function mutate(db,accountId,id,body,now,{sync=false}={}){
  const persistent=!sync&&body.type!=='move';
  const requestId=body.requestId;
  if(persistent&&(typeof requestId!=='string'||!/^[a-zA-Z0-9_-]{8,96}$/.test(requestId)))fail('REQUEST_ID_REQUIRED','操作需要有效的重试编号。');
  const hash=persistent?await digest(JSON.stringify(canonical({...body,characterId:id}))):null;
  for(let attempt=0;attempt<8;attempt++){
   if(persistent){const previous=await readReceipt(db,accountId,requestId);if(previous){if(previous.payload_hash!==hash)fail('REQUEST_CONFLICT','同一操作编号不能用于另一项操作。',409);return {...JSON.parse(previous.response),replayed:true};}}
   const ctx=await loadContext(db,accountId,id,now,body.type==='room-join'?String(body.code??body.roomCode??'').toUpperCase():undefined);
   now=Math.max(now,ctx.c.lastSeenAt??0,ctx.room?.state.encounter?.now??0,ctx.c.soloEncounter?.now??0);
   const before=ctx.accounts.map(a=>[a.id,new Map(a.state.characters.map(c=>[c.id,JSON.stringify(c)]))]);
   if(body.type==='room-join'&&ctx.c.roomCode&&ctx.c.roomCode!==ctx.room?.id)fail('ALREADY_IN_ROOM','请先离开当前队伍。',409);
   await settleEncounter(ctx,now);
   tickWorld(ctx.c,now);
   if(!sync){
    const rejectedPosition={...ctx.c.position},movement=body.type==='move'?body:body.type==='skill'?body.movement:null;
    try{
     if(body.type==='skill'&&body.movement!==undefined){
      if(!movement||typeof movement!=='object'||Array.isArray(movement)||(movement.type!==undefined&&movement.type!=='move'))fail('INVALID_MOVEMENT_STEPS','随施法提交的移动路径无效。');
      await applyAction(ctx,{...movement,type:'move'},now);
     }
     await applyAction(ctx,body,now);
    }catch(error){
     // Both stages share one CAS/receipt: a spell rejection also rolls back its
     // preceding movement, so the client must reconcile the entire batch.
     if(movement){error.rejectedSequence=movement.sequence;error.rejectedPosition=rejectedPosition;}
     throw error;
    }
   }
   tickWorld(ctx.c,now);
   ctx.c.lastSeenAt=now;
   for(const account of ctx.accounts)for(const c of account.state.characters){const original=before.find(a=>a[0]===account.id)?.[1].get(c.id);if(original!==JSON.stringify(c)){recalc(c);c.revision++;}}
   if(ctx.room&&JSON.stringify(ctx.room.state)!==ctx.room.original)ctx.room.state.revision=(ctx.room.state.revision??0)+1;
   const out=resultOf(ctx,now);
   try{await commit(db,ctx.accounts,ctx.room,persistent?{accountId,requestId,hash,response:out}:null,now);return out;}
   catch(error){if(!isCollision(error))throw error;}
  }
  fail('RETRY_CONFLICT','队伍正在同步，请重试同一操作。',409);
 }
 async function settleEncounter(ctx,now){
  let encounter=activeEncounter(ctx.c,ctx.room);if(!encounter)return;
  if(encounter.runtimeSettled&&encounter.status==='won')return;
  if(encounter.status==='active'){encounter=advanceEncounter(encounter,now);setEncounter(ctx.c,ctx.room,encounter);}
  for(const account of ctx.accounts)for(const c of account.state.characters){
   const member=encounter.players?.[c.id];if(!member)continue;
   if(member.position)c.position={...c.position,...member.position};
   c.hp=Math.max(0,member.hp);c.focus=Math.max(0,member.focus??c.focus);
   if(member.potions)c.potions={health:member.potions.health??c.potions.health,focus:member.potions.focus??c.potions.focus};
  }
  if(encounter.status!=='won'||encounter.runtimeSettled)return;
  const eligible=new Set(rewardEligibility(encounter));
  for(const account of ctx.accounts)for(const c of account.state.characters){
   if(!encounter.players[c.id])continue;
   if(!eligible.has(c.id)){c.notice='本次没有有效参与，不发奖励；可以重新练习或挑战。';continue;}
   const context=encounter.runtimeContext??{};
   if(context.mode==='commission'){
    const run=c.commissionRuns.find(r=>r.runId===context.runId);if(!run||run.serverState!=='active')continue;
    const unit=context.enemyUnits;grantRepeat(c,context.contentLevel,unit);run.completedEnemies++;
    run.confirmedObjectives.push(encounter.id);
    if(run.completedEnemies>=context.enemyCount){const creditEligible=c.level<40&&context.contentLevel>c.level-5;grantRepeat(c,context.contentLevel,context.completeUnits);run.serverState='completed';run.completedAt=now;
     if(creditEligible)c.wallet.learningCredits+=context.credits;
     c.notice='委托完成，个人经验和学习凭证已保存。';
    }else c.notice=`已完成 ${run.completedEnemies}/${context.enemyCount} 个目标，继续下一轮。`;
   }else if(context.mode==='story'){
    if(questId(c)===context.questId&&objectiveIndex(c)===context.objectiveIndex)completeObjective(c,now);
    else if(context.kind==='troll'){const creditEligible=c.level<23;grantRepeat(c,18,20);if(creditEligible)c.wallet.learningCredits+=2;c.notice='协助挑战成功，个人进度保持不变。';}
    else if(context.kind==='stone'){grantRepeat(c,23,20);c.notice='已协助完成奇洛战斗；完整副本凭证需要整条试炼。';}
   }else if(context.mode==='replay-troll'){
    if(questId(c)==='M13'&&!c.completedQuestIds.includes('M13'))completeObjective(c,now);
    else{const creditEligible=c.level<23;grantRepeat(c,18,20);if(creditEligible)c.wallet.learningCredits+=2;}
   }
  }
  encounter.runtimeSettled=true;setEncounter(ctx.c,ctx.room,encounter);
 }
 function startEncounter(ctx,body,now){
  const {c,room}=ctx;safe(c,room);if(c.hp<=0)fail('RETRY_REQUIRED','请先回到检查点恢复，再开始下一次挑战。',409);
  let target=activeObjective(c),kind,enemyId,context;
  if(body.cycleId){
   if(!near(c,TRAINING_POSITION))fail('TOO_FAR','请走到练习委托台旁。',409);
   if(!commissionUnlocked(c,body.cycleId))fail('COMMISSION_LOCKED','请先完成对应的课程或剧情。',409);
   const entrance=contentData.journalCommissionIndex.find(x=>x.cycleId===body.cycleId);if(entrance?.initiator.sceneId!==c.sceneId)fail('WRONG_TRAINING_SCENE','请通过场景出口前往该委托所在区域。',409);
   const cycle=contentData.commissionCycles.find(x=>x.cycleId===body.cycleId);if(!cycle)fail('UNKNOWN_COMMISSION','找不到这个委托。');
   if(cycle.cycleId==='REPLAY-STONE-M23'){c.activity={questId:'M28',objectiveIndex:0,runId:crypto.randomUUID(),completedRooms:[]};c.sceneId='SC14';c.visitSceneId=null;c.flying=false;c.position={...SPAWN};c.notice='开始完整魔法石试炼重演。';return;}
   if(cycle.cycleId==='REPLAY-TROLL-M18'){kind='troll';context={mode:'replay-troll',kind};}
   else{
    let run=c.commissionRuns.find(r=>r.cycleId===cycle.cycleId&&r.serverState==='active');
    if(!run){run={runId:crypto.randomUUID(),cycleId:cycle.cycleId,serverState:'active',completedEnemies:0,confirmedObjectives:[],startedAt:now};c.commissionRuns.push(run);}
    let candidates=cycle.cycleId.startsWith('LIBRARY')?['BOOKS']:cycle.cycleId.startsWith('GREENHOUSE')?['VINE']:['ROOT'];
    let enemyUnits=cycle.contentLevel===22&&cycle.killUnits===16&&run.completedEnemies<8?1:cycle.cycleId.startsWith('ROOTWORK')||cycle.cycleId.startsWith('GROUNDS')||cycle.contentLevel===22?2:1;
    if(cycle.contentLevel===22&&enemyUnits===1)candidates=[run.completedEnemies%2?'VINE':'BOOKS'];
    enemyId=`${candidates[0]}-L${cycle.contentLevel}`;
    const enemyCount=cycle.contentLevel===22?12:cycle.killUnits/enemyUnits;
    context={mode:'commission',runId:run.runId,cycleId:cycle.cycleId,contentLevel:cycle.contentLevel,enemyUnits,enemyCount,completeUnits:cycle.completeUnits,credits:cycle.contentLevel===22?2:1};kind='monster';
   }
  }else{
   requireStoryScene(c);
   if(!target||!['battle','boss'].includes(target.kind)||body.targetId!==target.id)fail('INVALID_TARGET','这不是当前可挑战的目标。',409);
   if(!near(c,target.position))fail('TOO_FAR','请先走到挑战入口。',409);
   kind=target.encounterKind??(target.enemyId==='PAPER-L1'?'trainer':'monster');enemyId=target.enemyId;
   if(kind==='troll'&&!['levitate','rescue'].every(s=>c.skills.includes(s)))fail('COURSE_REQUIRED','巨怪挑战需要完成漂浮与救援课程。',409);
   context={mode:'story',questId:questId(c),objectiveIndex:objectiveIndex(c),kind};
  }
  if(room?.state.encounter?.status==='active'&&(kind==='troll'||kind==='stone'))fail('ROOM_BUSY','队伍已经有一场进行中的副本。',409);
  const eligibleCharacters=[c];
  if(room&&(kind==='troll'||kind==='stone')){
   for(const member of room.state.members){const other=ctx.accounts.find(a=>a.id===member.accountId)?.state.characters.find(x=>x.id===member.characterId);if(!other||other.id===c.id)continue;
    const q=kind==='troll'?'M13':'M34';
    if((questId(other)===q||other.completedQuestIds.includes(q))&&other.sceneId===c.sceneId&&distance(other.position,c.position)<=8&&now-other.lastSeenAt<30000&&other.soloEncounter?.status!=='active')eligibleCharacters.push(other);
   }
  }
  if(eligibleCharacters.length>5)fail('ROOM_FULL','每支队伍最多五名玩家。',409);
  const players=eligibleCharacters.map((p,index)=>({id:p.id,heroId:p.heroId,level:p.level,stats:p.stats,...(!['troll','stone'].includes(kind)?{hp:p.hp,focus:p.focus}:{}),learnedSkillIds:!p.completedQuestIds.includes('M04')?['bolt','dodge']:p.skills,position:{x:(index-(eligibleCharacters.length-1)/2)*1.5,z:5,y:0},potions:p.potions}));
  const encounter=createEncounter({id:crypto.randomUUID(),kind,enemyId,players,now,seed:randomSeed()});encounter.runtimeContext=context;
  if(room&&(kind==='troll'||kind==='stone'))room.state.encounter=encounter;else c.soloEncounter=encounter;
  for(const p of eligibleCharacters){if(room&&(kind==='troll'||kind==='stone'))p.soloEncounter=null;p.pendingObservation=null;p.flying=false;p.position={...p.position,...players.find(x=>x.id===p.id).position};p.lastMoveAt=now;p.moveAllowance=.12;p.notice='挑战开始，观察敌人的蓄力预告并保持移动。';}
 }
 async function applyAction(ctx,b,now){
  const {c,account}=ctx;let room=ctx.room;
  if(b.type==='move'){
   const p=b.position;if(!p||!['x','y','z','yaw'].every(k=>Number.isFinite(p[k]??(k==='yaw'?0:NaN))))fail('INVALID_POSITION','移动位置无效。');
   if(!Number.isSafeInteger(b.sequence)||b.sequence<0)fail('INVALID_SEQUENCE','移动序号无效。');
   if(b.sequence<=c.moveSequence)return;
   const elapsed=Math.max(0,Math.min(MAX_MOVE_CREDIT_SECONDS,(now-c.lastMoveAt)/1000));
   const encounter=activeEncounter(c,room),inCombat=encounter?.status==='active';
   const permission=getFlightPermission(c,{questId:questId(c),questSceneId:questById.get(questId(c))?.sceneId,objectiveKind:activeObjective(c)?.kind,inCombat});
   const flight=Boolean(b.flying)&&permission.allowed;
   // An already-authorized airborne player may finish descending even when a
   // lesson changes objectives or the client has begun dismounting. This never
   // authorizes a new takeoff or further ascent after permission is withdrawn.
   const landing=!flight&&permission.canLand;
   const maxSpeed=flight?FLIGHT_SPEED:(b.sprint??b.run)?RUN_SPEED:WALK_SPEED;
   let path;try{path=movementPath(c.position,p,b.steps);}catch{fail('INVALID_MOVEMENT_STEPS','移动路径无效。');}
   const allowance=Math.min(maxSpeed*MAX_MOVE_CREDIT_SECONDS,(c.moveAllowance??.12)+maxSpeed*elapsed);
   if(path.travel>allowance+.0001)fail('MOVE_TOO_FAST','移动距离过大，已保留服务器位置。',409);
   if([p,...path.points].some(point=>point.x< -40||point.x>40||point.z< -40||point.z>40||point.y<-.15||point.y>(flight||landing?permission.maxHeight:2.65)))fail('OUT_OF_BOUNDS','不能越过场景边界。',409);
   const nav=getSceneNavigation(c.sceneId,{arena:inCombat?encounter.arena:undefined});
   if(landing&&path.ascent>1e-6)fail('LANDING_REQUIRED','请先降到地面，当前不能继续升高。',409);
   if(!flight&&!landing){
    if(path.ascent>JUMP_SPEED*elapsed+.14)fail('MOVE_TOO_FAST','跳跃高度变化过快。',409);
    const motionKey=String(c.sceneId)+':'+(inCombat?encounter.id:'');
    let jump=c.jumpMotion?.key===motionKey?c.jumpMotion:null,previous=c.position;
    for(const point of path.points){
     const floor=standingFloor(point,Math.max(previous.y,point.y),nav.walls);
     if(point.y<=floor+.04){jump=null;previous=point;continue;}
     if(!jump)jump={key:motionKey,origin:standingFloor(previous,previous.y,nav.walls),startedAt:now};
     if(point.y>jump.origin+JUMP_APEX+.16||now-jump.startedAt>1800)fail('OUT_OF_BOUNDS','跳跃必须从地面或可站立的平台开始。',409);
     previous=point;
    }
    c.jumpMotion=jump;
   }else c.jumpMotion=null;
   c.moveAllowance=Math.min(.3,allowance-path.travel);
   if(inCombat){
    const moved=moveCombatPlayer(encounter,{playerId:c.id,position:p,steps:b.steps,yaw:p.yaw??0,sprint:Boolean(b.sprint??b.run),now});
    setEncounter(c,room,moved);c.position={...moved.players[c.id].position,yaw:p.yaw??0};
   }else{
    const moved=replayMovement(c.position,path.points,nav.bounds,nav.walls);
    c.position={...moved,yaw:p.yaw??0};
   }
   c.flying=(flight||landing)&&c.position.y>standingFloor(c.position,c.position.y,nav.walls)+.08;c.lastMoveAt=now;c.moveSequence=b.sequence;
   updateEscort(c,now);return;
  }
  if(b.type==='interact'){
   safe(c,room);requireStoryScene(c);const t=activeObjective(c);
   if(c.dungeonRoom&&c.dungeonRoom.roomId===questId(c)){
    if(c.dungeonRoom.roomId==='M30'&&b.targetId==='gate'&&(c.flying||c.position.y>.12))fail('LANDING_REQUIRED','请先降落并收起扫帚，再用钥匙开门。',409);
    const applied=applyRoomIntent(c.dungeonRoom,{playerId:c.id,actionId:b.requestId,targetId:b.targetId,player:{id:c.id,position:c.position,skills:c.skills,hp:c.hp},now});
    if(!applied.result.ok)fail(applied.result.code,'请观察机关提示，靠近已开放的目标再试。',409);
    c.dungeonRoom=applied.state;c.notice=applied.result.code==='COMPLETED'?'机关已完成。':'正在操作机关，请保持位置。';tickDungeon(c,now);return;
   }
   if(!t||b.targetId!==t.id||c.visitSceneId&&c.visitSceneId!==questById.get(questId(c)).sceneId)fail('INVALID_TARGET','请跟随当前任务目标。',409);
   if(['battle','boss','cast'].includes(t.kind))fail('ACTION_REQUIRED','这个目标需要实际施法或完成战斗。',409);
   if(['escort','boat'].includes(t.kind)){
    if(!c.escort&&objectiveIndex(c)===0&&(!c.escortOrigin||(c.escortOrigin.x===SPAWN.x&&c.escortOrigin.z===SPAWN.z)))c.escortOrigin={...ESCORT_START};
    if(!c.escort){if(distance(c.position,c.escortOrigin??SPAWN)>3.5)fail('TOO_FAR','请先走到引路者身旁。',409);c.escort={targetId:t.id,origin:{...(c.escortOrigin??SPAWN)},lastTick:now,progress:0,near:true};}
    updateEscort(c,now);
    if(c.escort.progress<1){c.notice=t.kind==='boat'?'船正在渡过黑湖。':'跟随引路者移动；离得太远时他会等你。';return;}
   }
   if(!near(c,t.position))fail('TOO_FAR','请走近场景中的目标。',409);
   if(t.kind==='flight'&&(!c.flying||c.position.y<(t.minY??.6)))fail('FLIGHT_REQUIRED','请骑扫帚飞到目标高度。',409);
   if(t.requiresLanding&&(c.flying||c.position.y>standingFloor(c.position,c.position.y,getSceneNavigation(c.sceneId).walls)+.12))fail('LANDING_REQUIRED','请先降落并收起扫帚，再完成这个目标。',409);
   if(['hold','sneak'].includes(t.kind)){
    if(!c.hold||c.hold.targetId!==t.id){c.hold={targetId:t.id,startedAt:now,position:{...c.position}};c.notice=`正在${t.label}，请保持 ${t.seconds} 秒。`;return;}
    if(now-c.hold.startedAt<t.seconds*1000){c.notice='操作还在进行，请稍候。';return;}
   }
   if(t.kind==='puzzle'&&b.choice!==t.answer)fail('WRONG_CHOICE','再观察场景中的线索，这个选择无法安全通过。',409);
   if(t.kind==='ending'&&(c.level<24||!['M13','M34'].every(q=>c.completedQuestIds.includes(q))))fail('ENDING_REQUIREMENTS','完成巨怪和魔法石首通，并达到24级后才能结束第一卷。',409);
   if(questId(c)==='M28'&&objectiveIndex(c)===1)c.musicUntil=now+60000;
   if(t.kind==='music-gate'&&!(c.musicUntil>now)){c.objectiveIndex=1;c.notice='音乐停止了，请重新启动装置。';return;}
   completeObjective(c,now);return;
  }
  if(b.type==='encounter'){startEncounter(ctx,b,now);return;}
  if(b.type==='skill'){
   const encounter=activeEncounter(c,room);
   if(encounter?.status==='active'){
    const applied=applyCombatIntent(encounter,{playerId:c.id,actionId:b.requestId,skillId:b.skillId,targetId:b.targetId,aim:b.aim,aimPoint:b.aimPoint,now});
    if(!applied.result.ok)fail(applied.result.code,skillFailureMessages[applied.result.code]??'当前无法施放该动作，请检查距离、专注或冷却。',409);
    setEncounter(c,room,applied.state);await settleEncounter(ctx,now);return;
   }
   const t=activeObjective(c);
   if(t?.kind==='cast'&&b.targetId===t.id&&b.skillId===t.skillId&&near(c,t.position)){
    requireStoryScene(c);
    const skill=contentData.skills.find(s=>s.id===t.skillId),cost=skill.focusCost;
    if(c.focus<cost)fail('NOT_ENOUGH_FOCUS','专注不足，请在安全补给点恢复。',409);
    if(c.pendingWorldAction)fail('ACTION_PENDING','正在施法，请稍候。',409);
    c.focus-=cost;c.pendingWorldAction={targetId:t.id,skillId:t.skillId,releaseAt:now+skill.castSeconds*1000};c.lastAction={id:b.requestId,skillId:b.skillId,startedAt:now};return;
   }
   if(!c.skills.includes(b.skillId)&&!(c.currentQuestId==='M04'&&['bolt','dodge'].includes(b.skillId)))fail('SKILL_LOCKED','请先完成对应课程。',409);
   if(!['bolt','light','mark','broom','dodge'].includes(b.skillId))fail('NO_VALID_TARGET','这项技能需要战斗中的有效目标。',409);
   c.lastAction={id:b.requestId,skillId:b.skillId,startedAt:now};return;
  }
  if(b.type==='retry'){
   const e=activeEncounter(c,room);if(e?.status==='active')fail('IN_COMBAT','挑战尚未结束。',409);
   if(room?.state.encounter?.players[c.id])room.state.encounter=null;c.soloEncounter=null;c.hp=c.stats.hp;c.focus=c.stats.focusMax;c.flying=false;c.position={...SPAWN};c.lastMoveAt=now;c.notice='已回到当前检查点。';return;
  }
  if(b.type==='room-create'){
   safe(c,room);if(c.roomCode)fail('ALREADY_IN_ROOM','你已经在一支队伍中。',409);
   const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';const code=Array.from(crypto.getRandomValues(new Uint8Array(8)),n=>alphabet[n&31]).join('');
   room=ctx.room={id:code,revision:null,original:null,state:{code,leaderId:c.id,members:[{accountId:account.id,characterId:c.id}],encounter:null,createdAt:now,revision:0}};
   c.roomCode=code;c.notice='队伍已创建，把邀请码发给朋友。';return;
  }
  if(b.type==='room-join'){
   safe(c,room);if(!room)fail('ROOM_NOT_FOUND','找不到这个队伍，请检查邀请码。',404);
   if(room.state.encounter?.status==='active')fail('ROSTER_LOCKED','副本已经开始，请等本轮结束后加入。',409);
   if(room.state.members.some(m=>m.characterId===c.id)){c.roomCode=room.id;return;}
   if(room.state.members.some(m=>m.accountId===account.id))fail('ONE_CHARACTER_PER_ACCOUNT','同一玩家在队伍中只能使用一个角色。',409);
   if(room.state.members.length>=5)fail('ROOM_FULL','队伍最多五人。',409);
   room.state.members.push({accountId:account.id,characterId:c.id});c.roomCode=room.id;c.notice='已加入好友队伍，个人任务进度独立保留。';return;
  }
  if(b.type==='room-leave'){
   if(!room){c.roomCode=null;return;}
   if(room.state.encounter?.status==='active'&&room.state.encounter.players[c.id])fail('ROSTER_LOCKED','战斗名单已锁定，请先完成或重试本场挑战。',409);
   room.state.members=room.state.members.filter(m=>m.characterId!==c.id);if(room.state.leaderId===c.id)room.state.leaderId=room.state.members[0]?.characterId??null;
   c.roomCode=null;ctx.room=room;c.notice='已离开队伍，个人进度已保存。';return;
  }
  if(b.type==='buy'){
   safeService(c,room,b.serviceId);const service=contentData.services.find(s=>s.serviceId===b.serviceId),offer=service?.catalog.find(o=>o.offerId===b.offerId);
   if(!offer||!unlocked(c,offer.unlock))fail('OFFER_LOCKED','该商品尚未开放。',409);
   if(owns(c,offer.itemId))fail('ALREADY_OWNED','已经拥有这件物品。',409);
   if(itemById.get(offer.itemId)?.storage==='normalBag'&&occupiedBagSlots(c)>=c.bagCapacity)fail('BAG_FULL','背包已满，请先腾出一个格子再购买装备。',409);
   const walletKey=offer.price.currencyId==='CUR-COIN'?'coins':'learningCredits';if(c.wallet[walletKey]<offer.price.amount)fail('INSUFFICIENT_FUNDS','余额不足。',409);
   c.wallet[walletKey]-=offer.price.amount;grantItem(c,offer.itemId,`purchase:${offer.offerId}`);c.notice='购买完成，物品已保存。';return;
  }
  if(b.type==='equip'){
   safe(c,room);const item=itemById.get(b.itemId);if(!item?.effect?.slot||!c.inventory.includes(b.itemId)||!unlocked(c,item.unlock))fail('CANNOT_EQUIP','尚未拥有该装备或未达到穿戴条件。',409);
   const slot=item.effect.slot,previous=c.equipment[slot];c.inventory.splice(c.inventory.indexOf(b.itemId),1);if(previous)c.inventory.push(previous);c.equipment[slot]=b.itemId;recalc(c);return;
  }
  if(b.type==='unequip'){
   safe(c,room);
   if(!contentData.equipmentCatalog.statSlots.includes(b.slot))fail('INVALID_EQUIPMENT_SLOT','请选择魔杖、校袍或手套装备栏。');
   const itemId=Object.hasOwn(c.equipment,b.slot)?c.equipment[b.slot]:null;if(!itemId)fail('SLOT_EMPTY','这个装备栏已经空了。',409);
   const item=itemById.get(itemId);if(item?.effect?.slot!==b.slot||c.inventory.includes(itemId))fail('CANNOT_UNEQUIP','装备记录不一致，请保留存档并重试。',409);
   if(occupiedBagSlots(c)>=c.bagCapacity)fail('BAG_FULL','背包已满，请先腾出一个格子再脱下装备。',409);
   c.inventory.push(itemId);delete c.equipment[b.slot];recalc(c);c.notice=`已脱下${item.name}并放入背包。`;return;
  }
  if(b.type==='claim'){
   safe(c,room);const index=c.pendingClaims.findIndex(x=>x.id===b.claimId);if(index<0)fail('CLAIM_NOT_FOUND','没有这个待领取奖励。',404);
   const claim=c.pendingClaims[index];let id=claim.itemId;
   if(claim.choices){const available=claim.choices.filter(i=>!owns(c,i));if(!available.length){c.pendingClaims.splice(index,1);c.wallet.learningCredits++;return;}if(!available.includes(b.itemId))fail('INVALID_REWARD_CHOICE','请选择尚未拥有的奖励。',409);id=b.itemId;}
   if(itemById.get(id)?.storage==='normalBag'&&occupiedBagSlots(c)>=c.bagCapacity)fail('BAG_FULL','背包已满，请先穿戴或整理装备。',409);
   c.pendingClaims.splice(index,1);grantItem(c,id,claim.id);return;
  }
  if(b.type==='refill'){
   safe(c,room);const checkpoint=(c.currentQuestId==='M04'||dangerQuestIds.has(questId(c)))&&near(c,SPAWN);
   if(!checkpoint)safeService(c,room);
   const health=b.health??c.potionPreference.health,focus=b.focus??c.potionPreference.focus;
   if(!Number.isInteger(health)||!Number.isInteger(focus)||health<0||focus<0||health+focus!==2)fail('INVALID_POTION_ALLOCATION','每次补给请选择两瓶药剂。');
   if(occupiedBagSlots({inventory:c.inventory,potions:{health,focus}})>c.bagCapacity)fail('BAG_FULL','背包没有足够空间放入这组药剂，请先腾出格子。',409);
   c.potions={health,focus};c.potionPreference={health,focus};c.hp=c.stats.hp;c.focus=c.stats.focusMax;c.notice='已免费补给并恢复生命与专注。';return;
  }
  if(b.type==='track'){if(!Array.isArray(b.trackedIds)||b.trackedIds.length>2||b.trackedIds.some(x=>typeof x!=='string'||x.length>128))fail('INVALID_TRACKING','最多追踪两个可选任务。');c.trackedIds=[...new Set(b.trackedIds)];return;}
  if(b.type==='side'){
   safe(c,room);const side=contentData.sideQuests.find(x=>x.id===b.questId);if(!side||!isSafeExploration(c)||c.sceneId!==side.startNpc.sceneId||!near(c,SERVICE_POSITION)||!side.prerequisites.completedQuestIds.every(q=>c.completedQuestIds.includes(q)))fail('SIDE_LOCKED','请前往对应教授所在的已开放安全区域接受邀请。',409);
   if(!c.acceptedSideQuestIds.includes(side.id))c.acceptedSideQuestIds.push(side.id);return;
  }
  if(b.type==='collect'){
   safe(c,room);const side=contentData.sideQuests.find(x=>x.id===b.questId);
   if(!side||!isSafeExploration(c)||!side.steps.some(s=>s.sceneId===c.sceneId)||!side.prerequisites.completedQuestIds.every(q=>c.completedQuestIds.includes(q))||!near(c,{x:1.5,z:-6},2))fail('COLLECTION_UNAVAILABLE','请到已开放安全场景中的收藏点观察。',409);
   if(!c.collectionIds.includes(side.reward.collectionId)&&c.pendingObservation?.questId!==side.id)c.pendingObservation={questId:side.id,startedAt:now,sceneId:c.sceneId,position:{...c.position}};
   c.notice='保持站立观察一秒，记录会自动保存。';return;
  }
  if(b.type==='travel'){
   safe(c,room);if(b.targetId!=='exit'||!near(c,{x:0,z:-7}))fail('EXIT_REQUIRED','请走到场景出口后选择前往地点。',409);
   const scenes=new Set([questById.get(c.currentQuestId).sceneId,...c.completedQuestIds.flatMap(q=>contentData.questSceneMap[q]??[])]);
   if(!scenes.has(b.sceneId))fail('SCENE_LOCKED','还没有解锁通往这里的路线。',409);
   c.visitSceneId=b.sceneId;c.sceneId=b.sceneId;c.flying=false;c.position={...SPAWN};c.lastMoveAt=now;c.notice='已通过场景出口抵达目的地。';return;
  }
  if(b.type==='learn'){safeService(c,room,'SERVICE-TOOLS');const eligible=getSkillEligibility({heroTemplateId:c.heroId,level:c.level,skillId:b.skillId,completedQuestIds:c.completedQuestIds});if(!eligible.allowed)fail('SKILL_LOCKED','请先完成课程并达到等级要求。',409);if(!c.skills.includes(b.skillId))c.skills.push(b.skillId);return;}
  fail('UNKNOWN_ACTION','暂不支持这项操作。');
 }
 function updateEscort(c,now){
  const t=activeObjective(c);if(!t||!['escort','boat'].includes(t.kind))return;
  if(!c.escort||c.escort.targetId!==t.id)return;
  const e=c.escort,wasCrossing=e.progress<1;const npc={x:e.origin.x+(t.position.x-e.origin.x)*e.progress,z:e.origin.z+(t.position.z-e.origin.z)*e.progress};
  const delta=Math.max(0,Math.min(.5,(now-e.lastTick)/1000));e.lastTick=now;e.near=distance(c.position,npc)<3.5;
  if(e.near)e.progress=Math.min(1,e.progress+delta/t.seconds);
  if(t.kind==='boat'&&e.near&&wasCrossing){c.position={x:e.origin.x+(t.position.x-e.origin.x)*e.progress,y:0,z:e.origin.z+(t.position.z-e.origin.z)*e.progress,yaw:c.position.yaw};c.lastMoveAt=now;}
 }
 function tickWorld(c,now){
  if(c.pendingObservation){
   const observation=c.pendingObservation;
   if(!isSafeExploration(c)||c.sceneId!==observation.sceneId||distance(c.position,observation.position)>.15||Math.abs(c.position.y-observation.position.y)>.15)c.pendingObservation=null;
   else if(now-observation.startedAt>=1000){
    const side=contentData.sideQuests.find(s=>s.id===observation.questId);c.pendingObservation=null;
    if(side&&!c.collectionIds.includes(side.reward.collectionId)){c.collectionIds.push(side.reward.collectionId);grantItem(c,side.reward.itemId,`collection:${side.id}`);c.notice='观察记录已收入个人收藏。';}
   }
  }
  if(!inStoryScene(c)){
   c.hold=null;c.pendingWorldAction=null;
   if(c.escort)c.escort.lastTick=now;
   if(c.dungeonRoom)c.dungeonRoom=advanceRoom(c.dungeonRoom,{now,players:[]});
   return;
  }
  if(tickDungeon(c,now))return;
  updateEscort(c,now);
  const t=activeObjective(c);if(!t)return;
  if(c.hold){
   if(c.hold.targetId!==t.id||!near(c,t.position)){c.hold=null;return;}
   if(now-c.hold.startedAt>=(t.seconds??2)*1000){if(questId(c)==='M28'&&objectiveIndex(c)===1)c.musicUntil=now+60000;completeObjective(c,now);return;}
  }
  if(c.pendingWorldAction&&now>=c.pendingWorldAction.releaseAt){
   const action=c.pendingWorldAction;c.pendingWorldAction=null;
   if(action.targetId===t.id&&near(c,t.position))completeObjective(c,now);
  }
 }
 function tickDungeon(c,now){
  const id=questId(c);if(!['M28','M29','M30','M31','M32','M33'].includes(id))return false;
  if(!c.dungeonRoom||c.dungeonRoom.roomId!==id)c.dungeonRoom=createRoom({roomId:id,runId:c.activity?.runId??`story:${c.id}`,playerIds:[c.id],now});
  c.dungeonRoom=advanceRoom(c.dungeonRoom,{now,players:[{id:c.id,position:c.position,skills:c.skills,hp:c.hp}]});
  if(c.dungeonRoom.status==='completed'){completeQuest(c,now);return true;}
  return true;
 }
 return async function handle(request,env){
  try{
   const url=new URL(request.url),path=url.pathname.replace(/^\/api\/stone\/?/,'');
   const accountId=await actor(request);if(!env?.DB)fail('STORAGE_UNAVAILABLE','存档服务暂不可用。',503);const db=env.DB,now=clock();
   if(path==='account'&&request.method==='GET'){
    if(url.searchParams.get('existing')==='1'&&!await db.prepare('SELECT account_id FROM stone_accounts WHERE account_id=?').bind(accountId).first())fail('ACCOUNT_NOT_FOUND','没有找到这个恢复码对应的存档，请核对后重试。',404);
    const account=await readAccount(db,accountId,now);return response({account:{characters:account.state.characters.map(c=>({id:c.id,heroId:c.heroId,name:c.name,level:c.level,currentQuestId:c.currentQuestId,chapterComplete:c.chapterComplete,lastSeenAt:c.lastSeenAt}))},contentVersion,serverTime:now});
   }
   if(path==='characters'&&request.method==='POST'){
    const b=await bodyOf(request);if(typeof b.requestId!=='string'||!/^[\w-]{8,96}$/.test(b.requestId))fail('REQUEST_ID_REQUIRED','创建角色需要重试编号。');
    const hash=await digest(JSON.stringify(canonical({...b,route:'characters'})));
    for(let n=0;n<8;n++){
     const prior=await readReceipt(db,accountId,b.requestId);if(prior){if(prior.payload_hash!==hash)fail('REQUEST_CONFLICT','这个编号已用于另一项操作。',409);return response({...JSON.parse(prior.response),replayed:true});}
     const account=await readAccount(db,accountId,now);if(account.state.characters.length>=5)fail('CHARACTER_LIMIT','最多创建五个独立角色。',409);
     const c=createCharacter(b.heroId,b.name,now);account.state.characters.push(c);const out={character:project(c,now),scene:getSceneView(c,now),room:null,encounter:null,revision:c.revision,serverTime:now};
     try{await commit(db,[account],null,{accountId,requestId:b.requestId,hash,response:out},now);return response(out,201);}catch(e){if(!isCollision(e))throw e;}
    }fail('RETRY_CONFLICT','创建角色时发生并发，请重试。',409);
   }
   const m=/^characters\/([a-f0-9-]{36})(?:\/(actions))?$/.exec(path);
   if(m&&request.method==='GET'&&!m[2])return response(await mutate(db,accountId,m[1],{type:'sync'},now,{sync:true}));
   if(m&&request.method==='POST'&&m[2])return response(await mutate(db,accountId,m[1],await bodyOf(request),now));
   fail('NOT_FOUND','找不到这个游戏接口。',404);
  }catch(e){return response({error:e instanceof StoneError?e.message:e.name==='CombatError'?'动作暂时无法执行，请检查位置、速度或目标。':'游戏服务暂时忙，请重试同一操作。',code:e.code??'SERVER_ERROR',...(Number.isSafeInteger(e.rejectedSequence)?{rejectedSequence:e.rejectedSequence,rejectedPosition:e.rejectedPosition}:{})},e.status??(e.name==='CombatError'?409:500));}
 };
}
export const handleChapterOne=createChapterOneApi();
