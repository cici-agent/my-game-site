import { createAdventure } from '../../world/adventure.mjs';
import { createPresence } from '../../world/presence.mjs';
import { SAGA, sagaStage, sagaBoss } from './saga.mjs';
import { HEROES, getSagaCombatHint } from './adventure-rules.mjs';
import { makeMenu } from './chapter-menu.mjs';

const get=id=>document.getElementById(id);
const slot='hogwarts-student-v2';
const key=bytes=>Array.from(crypto.getRandomValues(new Uint8Array(bytes)),x=>x.toString(16).padStart(2,'0')).join('');
function readSlot(){
  try {const s=JSON.parse(localStorage.getItem(slot));if(/^[a-f0-9]{64}$/.test(s?.token))return s;}catch{}
  // An existing party recovery credential can also identify the same player in the new chapter.
  try {const b=JSON.parse(localStorage.getItem('hogwarts-new-students-v1'));const prior=b?.sessions?.[b.selected];
    if(/^[a-f0-9]{64}$/.test(prior?.token))return {token:prior.token,legacyRoom:prior.code};
  }catch{}
  return {token:key(32)};
}
let saved=readSlot(),profile=null,room=saved.room||null,code=null,dungeon=null,memberId=null,playing=false;
let world,menu,roomPresence=null,pose,epoch=0,pending=false,polling=false,posing=false,noticeTimer,speechTimer;
let worldStamp='',lastHud='';
const inviteURL=new URL(location.href);
const inviteType=['dungeon','party'].find(t=>/^[A-HJ-NP-Z2-9]{8}$/i.test(inviteURL.searchParams.get(t)||''));
let invitation=inviteType?{type:inviteType,code:inviteURL.searchParams.get(inviteType).toUpperCase()}:null;
const coreStage=kind=>kind==='troll'?'corridor':sagaBoss(kind)?.stage;
const hasDungeonAccess=stage=>['corridor','safe','epilogue'].includes(stage)||Boolean(sagaStage(stage));
function showInvitation(){
  if(!invitation||!playing||code||menu.open())return;
  if(invitation.type==='dungeon'&&!hasDungeonAccess(profile.stage))return;
  const invite=invitation;invitation=null;
  menu.join(invite.type==='dungeon',invite.code);
  const url=new URL(location.href);url.searchParams.delete(invite.type);history.replaceState(null,'',url);
}
async function copyInvite(kind){
  const value=kind==='party'?room?.code:code;if(!value)return;
  const url=new URL(location.pathname,location.origin);url.searchParams.set(kind,value);
  try{await navigator.clipboard.writeText(url.href);notice('已复制邀请链接。');}
  catch{menu.inviteLink(url.href);}
}
function persist(){try{localStorage.setItem(slot,JSON.stringify(saved));}catch{get('save-status').textContent='此设备无法保存恢复码，请从好友队伍抄录。';}}
persist();
function notice(text){const n=get('notice');n.textContent=text;n.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>n.hidden=true,4200);}
function say(who,text,ms=3100){get('speaker').textContent=who;get('spoken').textContent=text;get('speech').hidden=false;clearTimeout(speechTimer);speechTimer=setTimeout(()=>get('speech').hidden=true,ms);}
async function request(path,body,token=saved.token){
  let r;
  try {r=await fetch('/api'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(9000)});}
  catch{throw new Error('与游戏服务器的连接中断，请重试。');}
  let d;try {d=await r.json();}catch{throw new Error('暂时无法读取服务器存档。');}
  if(!r.ok)throw Object.assign(new Error(d.error||'操作未完成，请重试。'),{status:r.status});
  return d;
}
async function mutate(fn){
  if(pending)throw new Error('上一个动作正在保存。');
  pending=true;epoch++;
  try{return await fn();}finally{pending=false;}
}
const changeProfile=async body=>{profile=(await request('/profile',body)).profile;return profile;};
const labels={attack:'点射',bait:'引诱',levitate:'漂浮',dodge:'闪避',special:'专招',light:'荧光',rescue:'救援',counter:'本册咒语'};
const actionKeys=Object.keys(labels);
function checkpoint(travel){
  if(playing&&travel?.mode==='chapter'){
    saved.travel??={};
    const k=code?'instance-'+code:travel.stage;
    saved.travel[k]=travel;persist();
  }
}
function observePose(p){
  pose=p;
  if(!code&&roomPresence&&profile)roomPresence.update({...p,sceneId:'chapter-'+profile.stage});
}
function connectRoom(){
  roomPresence?.dispose();roomPresence=null;
  if(!room||code)return;
  const binding=room;
  roomPresence=createPresence({...room,token:saved.token},{
    onPeers(peers){if(room===binding&&!code)world?.applyPeers(peers);},
    onBoat(packet){if(room===binding&&!code)world?.applyChapterBoat(packet);},
    onStatus(s){if(room===binding&&!code)get('save-status').textContent=s==='online'?'同行队伍已连接 · '+room.code:s==='unauthorized'?'队伍码已失效':'正在重连同行队伍';}
  });
}
function configure(){
  if(!profile||!playing)return;
  const volume=sagaBoss(dungeon?.kind)||sagaStage(profile.stage);
  const chapterStage=code?(sagaBoss(dungeon.kind)?'arena-'+volume.stage:dungeon.kind==='troll'?'dungeon':'corridor'):profile.stage;
  const kind=code?dungeon.kind:volume?.kind||'troll';
  const cleared=profile.cleared.includes(kind),trained=!!volume&&profile.skills.includes(volume.spell.id);
  const helper=Boolean(code&&coreStage(kind)&&(profile.stage!==coreStage(kind)||dungeon.status==='won'&&!cleared));
  const stamp=[chapterStage,profile.heroId,code||'',profile.playerId,room?.code||'',cleared,trained,helper].join('/');
  if(stamp!==worldStamp){
    const k=code?'instance-'+code:chapterStage;
    worldStamp=stamp;
    world.configureChapter({stage:chapterStage,hero:profile.heroId,playerId:memberId||profile.playerId,identity:profile.playerId,party:Boolean(room)&&!code,instanceKey:code||'',
      travel:saved.travel?.[k],instance:dungeon,helper,cleared,trained,knowsMagic:profile.skills.includes('light')||profile.skills.includes('levitate')});
    get('save-status').textContent=code?'独立副本 · '+code:room?'同行队伍 · '+room.code:'已保存至个人冒险';
    connectRoom();
  }
  world.setChapterEncounter(dungeon);
  paintHud();
}
function paintHud(){
  if(!profile)return;
  const self=dungeon?.players?.[memberId],h=HEROES[profile.heroId];
  const stats=get('chapter-stats');stats.hidden=!playing;
  const maxHp=h.hp+2*(profile.level-1)+6*(profile.growth?.vitality||0),maxFocus=h.focus+5*(profile.growth?.focus||0);
  stats.textContent=h.name.split('·')[0]+'　Lv.'+profile.level+'　生命 '+(self?.hp??maxHp)+' / '+(self?.maxHp??maxHp)+'　专注 '+Math.floor(self?.focus??maxFocus);
  document.body.classList.toggle('in-encounter',Boolean(dungeon));get('combat-hud').hidden=!dungeon;
  const bar=get('spellbar');bar.hidden=!dungeon;
  get('team').textContent=code?'副本 · '+code:room?'队伍 · '+room.code:'好友队伍';
  if(!dungeon){lastHud='';bar.replaceChildren();return;}
  const d=dungeon;const {enemy}=d;
  get('combat-title').textContent=enemy.name+'　'+enemy.hp+' / '+enemy.maxHp;
  get('enemy-hp').style.width=Math.max(0,enemy.hp/enemy.maxHp*100)+'%';
  let readout=d.message||'';
  if(d.status==='won')readout=coreStage(d.kind)?(profile.cleared.includes(d.kind)?'挑战成功 · 走向发光的出口。':'战斗结束 · 本次未参与有效行动，可以重新挑战。'):'练习完成 · 返回走廊继续冒险。';
  if(d.status==='lost')readout='全队倒下了。可以离开或重新组队挑战。';
  if(d.kind==='troll'&&d.status==='active'&&d.started){
    const remaining=Math.max(0,(d.phaseUntil-Date.now())/1000);
    const who=d.players[d.target]?.name||'队友';
    const phase=d.phase==='opening'?(d.opener===memberId&&remaining>1.6?'队友现在可以托棒；独自作战请稍候':'现在施放漂浮咒托起木棒'):d.phase==='vulnerable'?'木棒悬空，集中点射':'巨怪瞄准'+who+'，引诱或移动闪避';
    readout=phase+' · '+remaining.toFixed(1)+' 秒';
  }
  if(d.status==='active'&&sagaBoss(d.kind))readout=getSagaCombatHint(d,memberId);
  get('combat-readout').textContent=readout;
  get('combat-team').textContent=Object.values(d.players).map(p=>(HEROES[p.hero]?.name.split('·')[0]||p.name)+' '+p.hp+'/'+p.maxHp).join('　');
  const stamp=[d.status,d.kind,h.id,profile.skills.join(',')].join('/');
  if(stamp!==lastHud){
    lastHud=stamp;bar.replaceChildren();
    if(d.status==='active'){
      actionKeys.forEach((act,i)=>{
        if(act==='counter'&&!sagaBoss(d.kind))return;
        const b=document.createElement('button');b.type='button';b.dataset.combat=act;
        const k=document.createElement('kbd');k.textContent=String(i+1);const title=act==='counter'?sagaBoss(d.kind).spell.name:act==='special'?h.active.name:labels[act];b.append(k,title);
        b.title=act==='counter'?sagaBoss(d.kind).counter:act==='special'?h.active.description:labels[act];b.disabled=['special','light','levitate'].includes(act)&&!profile.skills.includes(act);bar.append(b);
      });
    } else if(d.status==='lost'||!coreStage(d.kind)||!profile.cleared.includes(d.kind)){
      const b=document.createElement('button');b.type='button';b.dataset.combat='leave';b.textContent='返回集合点';bar.append(b);
    }
  }
}
function accept(data){
  if(code&&code!==data.code)return;
  profile=data.profile;code=data.code;memberId=data.memberId;dungeon=data.dungeon;
  configure();
}
async function resume(){
  if(profile.activeDungeon){
    const result=await request('/dungeons/'+profile.activeDungeon);
    accept(result);
  } else configure();
}
async function start(hero,name){
  if(!world)throw new Error('请开启浏览器图形加速后重新载入游戏。');
  if(!profile){
    await mutate(async()=>{
      profile=(await request('/profile')).profile;
      menu.picker();
    });
    return;
  }
  if(!name)throw new Error('请填写玩家昵称。');
  await mutate(async()=>{
    const priorPlay=playing;
    if(saved.legacyRoom){
      try{await changeProfile({action:'import-party',code:saved.legacyRoom});delete saved.legacyRoom;persist();}
      catch(e){if(e.status===403||e.status===404){delete saved.legacyRoom;persist();}else throw e;}
    }
    if(profile.heroId!==hero)await changeProfile({action:'hero',heroId:hero});
    if(profile.name!==name)await changeProfile({action:'name',name});
    if((profile.stage==='classroom'||hasDungeonAccess(profile.stage))&&profile.skills?.includes('levitate')&&!profile.skills.includes('special')&&!profile.activeDungeon){
      await changeProfile({action:'learn',skillId:'special'});
    }
    playing=true;
    try{await resume();}catch(e){playing=priorPlay;throw e;}
    saved.enrolled=true;persist();get('loading3d').hidden=true;
    if(!saved.sawFilm&&profile.stage==='station'&&!code)menu.film();else{menu.close();showInvitation();}
  });
}
function endFilm(){saved.sawFilm=true;persist();menu.close();showInvitation();}
async function syncStage(next){
  if(next==='corridor'&&profile.stage==='classroom'){
    for(const skillId of ['light','levitate','special'])if(!profile.skills.includes(skillId))await changeProfile({action:'learn',skillId});
  }
  if(next==='safe')await changeProfile({action:'advance'});
  else await changeProfile({action:'stage',stage:next});
  configure();
  if(next==='corridor')say('弗立维教授','已经学会的咒语可以在走廊和副本里使用。');
  if(sagaStage(next))say(sagaStage(next).place,sagaStage(next).arrival,6200);
  if(next==='epilogue')say('霍格沃茨的黎明',SAGA.at(-1).ending,7600);
  showInvitation();
}
async function makeParty(){
  await mutate(async()=>{
    const id=saved.partyAttempt||key(16);saved.partyAttempt=id;persist();
    const data=await request('/parties',{name:profile.name,clientToken:saved.token,requestId:id});
    delete saved.partyAttempt;
    saveRoom(data);menu.team();
  });
}
async function departRoom(){
  if(!room)return;
  await request('/parties/'+room.code+'/depart',{memberId:room.memberId});
  room=null;delete saved.room;persist();world.applyPeers([]);configure();
}
function saveRoom(data){
  room={code:data.code,memberId:data.memberId,revision:data.campaign.revision};
  saved.room=room;persist();configure();
}
async function join(codeEntered,dungeonMode){
  if(!/^[A-HJ-NP-Z2-9]{8}$/.test(codeEntered))throw new Error('请核对朋友给你的八位邀请码。');
  await mutate(async()=>{
    if(!dungeonMode){
      const data=await request('/parties/'+codeEntered+'/join',{name:profile.name,clientToken:saved.token});
      if(room&&room.code!==data.code)await departRoom();
      saveRoom(data);menu.team();return;
    }
    if(code)throw new Error('请先退出当前副本。');
    const data=await request('/dungeons/'+codeEntered+'/join',{});
    accept(data);menu.close();notice('已与朋友进入同一副本。');
  });
}
async function openDungeon(kind){
  if(code)throw new Error('你已在副本中。');
  const old=saved.attempt;
  const id=old?.kind===kind?old.id:key(16);saved.attempt={kind,id};persist();
  try{
    const data=await request('/dungeons',{kind,requestId:id});
    delete saved.attempt;persist();accept(data);menu.close();
    notice('副本码 '+code+' · 把它发给朋友，集合后再出手。');
  }catch(e){if(e.status&&e.status<500){delete saved.attempt;persist();}throw e;}
}
async function leave(throughDoor=false){
  if(!code)return;
  const current=code,kind=dungeon.kind,volume=sagaBoss(kind),owner=coreStage(kind);
  const advancing=throughDoor&&owner===profile.stage&&dungeon.status==='won'&&profile.cleared.includes(kind);
  const helping=owner&&owner!==profile.stage;
  profile=(await request('/dungeons/'+code+'/leave',{})).profile;
  delete saved.travel?.['instance-'+current];persist();
  code=null;dungeon=null;memberId=null;pose=null;menu.close();
  if(advancing){
    const next=volume?(SAGA[volume.book]?.stage||'epilogue'):'safe';
    try{await syncStage(next);}finally{configure();}
    if(volume&&next!=='epilogue')say(volume.boss,volume.ending,6100);
    notice(next==='epilogue'?'七册主线通关 · 黎明勋章已存入背包':'已抵达新地点 · 个人进度已保存');
  }else{configure();notice(helping?'陪打结束，已回到自己的章节。':'已回到入场前的地点。');}

}
async function fight(action){
  if(!code||dungeon?.status!=='active')return;
  if(world.playChapterAction?.(action)===false)throw new Error('请走近战斗目标。');
  const id=key(16),path='/dungeons/'+code+'/actions',body={requestId:id,action};
  let data;
  try{data=await request(path,body);}catch(e){if(e.status)throw e;data=await request(path,body);}
  accept(data);
}
async function handleWorld(a){
  if(pending)throw new Error('正在保存上一个动作，请稍候再试。');
  if(a.type==='enterDungeon'){menu.dungeonDoor(a.kind||'troll');return;}
  if(a.type==='ending'){say('霍格沃茨的黎明',SAGA.at(-1).ending,8500);return;}
  if(a.type==='replays'){menu.replays();return;}
  return mutate(async()=>{
    if(a.type==='boardBoat'&&room){const packet=await request('/parties/'+room.code+'/boat',{});world.applyChapterBoat(packet);return;}
    if(a.type==='advance')return syncStage(a.to);
    if(a.type==='learnSaga'){await changeProfile({action:'learn',skillId:a.skillId});configure();}
    if(a.type==='practice')return openDungeon(a.kind);
    if(a.type==='exitDungeon')return leave(true);
    if(a.type==='combat')return fight(a.action==='strike'?'attack':a.action);
  });
}
async function restore(value){
  const m=/^HW2\.([a-f0-9]{64})$/i.exec(value);
  if(!m)throw new Error('请输入完整的 HW2 私密恢复码。');
  const token=m[1].toLowerCase(),data=await request('/profile?existing=1',undefined,token);
  if(!data.profile)throw new Error('无法读取这个存档。');
  roomPresence?.dispose();roomPresence=null;saved={token,enrolled:true,sawFilm:true};room=null;pose=null;
  profile=data.profile;code=null;memberId=null;dungeon=null;playing=false;worldStamp='';persist();menu.picker();notice('已读取恢复码对应的冒险。');
}
async function refreshDungeon(){
  if(!code||pending||polling||document.hidden)return;
  const snapshot=epoch,current=code;polling=true;
  try{
    const d=await request('/dungeons/'+current);
    if(!pending&&epoch===snapshot&&code===current){accept(d);get('save-status').textContent='独立副本 · '+current;}
  }catch(e){if(code===current)get('save-status').textContent='正在重连副本';}
  finally{polling=false;}
}
async function exchangePose(){
  if(!code||!pose||posing||document.hidden)return;
  const current=code,p=pose;posing=true;
  try{
    const out=await request('/dungeons/'+current+'/presence',{x:p.x,y:p.y||0,z:p.z,yaw:p.yaw||0,moving:!!p.moving,casting:!!p.casting,equipment:p.equipment});
    if(code===current)world.applyPeers(out.peers||[]);
  }catch{}finally{posing=false;}
}
function callCombat(act){if(menu.open()||!dungeon||pending)return;mutate(()=>act==='leave'?leave():fight(act)).catch(e=>notice(e.message));}
menu=makeMenu({state:()=>({profile,room,code,dungeon,enrolled:saved.enrolled,playing,token:saved.token,graphicsAvailable:Boolean(world)}),commands:{
  get castScene(){return world?.castScene;},startOpening:(caption,end)=>world.startOpening(caption,end),stopOpening:()=>world?.stopOpening(),enter:start,endFilm,copyInvite,createParty:makeParty,departParty:()=>mutate(async()=>{await departRoom();menu.team();}),join,createDungeon:kind=>mutate(()=>openDungeon(kind)),leave:()=>mutate(()=>leave()),restore,notice,
  exchange:()=>mutate(async()=>{await changeProfile({action:'exchange',itemId:'practice-crest'});menu.journal();}),
  growth:stat=>mutate(async()=>{await changeProfile({action:'growth',stat,rank:(profile.growth[stat]||0)+1});menu.journal();paintHud();}),
  talent:talentId=>mutate(async()=>{await changeProfile({action:'talent',heroId:profile.heroId,talentId});menu.journal();}),
  switchHero(){if(code)throw new Error('请先结束本次副本。');menu.picker();}
}});
get('team').onclick=()=>playing&&menu.team();
get('open-book').onclick=()=>playing&&menu.journal();
get('spellbar').onclick=e=>{const a=e.target.closest('[data-combat]')?.dataset.combat;if(a)callCombat(a);};
addEventListener('keydown',e=>{
  if(!playing||menu.open()||e.repeat||e.ctrlKey||e.altKey||e.metaKey)return;
  if(e.code==='KeyJ'){e.preventDefault();menu.journal();return;}
  if(dungeon&&/^Digit[1-8]$/.test(e.code)){e.preventDefault();callCombat(actionKeys[Number(e.code.slice(-1))-1]);}
});
const firstProfile=request('/profile').catch(error=>{notice(error.message);return null;});
try {
  world=createAdventure({onChoice:()=>{},onPose:()=>{},onCheckpoint:checkpoint,onChapterPose:observePose,
    onChapterAction:handleWorld,say,isPaused:()=>menu.open()||!playing});
} catch(error){
  console.error(error);
  document.body.classList.add('cast-no-3d');
}
profile=(await firstProfile)?.profile??null;
menu.picker();get('loading3d').hidden=true;
if(world){
  setInterval(()=>{if(dungeon?.status==='active'&&dungeon.started&&!document.hidden)paintHud();},300);
  setInterval(refreshDungeon,850);setInterval(exchangePose,850);
}
