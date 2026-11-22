import { selectHud } from '../quests/journal.mjs';
import { createSound } from './sound.mjs';
import { createActionBar } from './actionbar.mjs';
import { createCharacterPreview } from './character-preview.mjs';
import { renderCharacterSheet, characterSheetParts } from './character-sheet.mjs';
import { renderInventoryPanel, renderMagicPanel, renderMapPanel } from './journal-panels.mjs';
import { iconMarkup } from './ui-icons.mjs';
import { createStoneWorld } from './world.mjs';
import { contentData } from '../data/index.mjs';
import { SELECTABLE_HERO_IDS, isSelectableHero } from '../roster.mjs';
import { getHeroStats, getSkillEligibility } from '../rules/index.mjs';
import { getSceneView, runtimeCatalog, commissionUnlocked } from '../online/catalog.mjs';

const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const heroes={"harry":{"name":"哈利·波特","role":"敏锐的破局者","copy":"敏捷的反应与精准打断，帮助伙伴抓住稍纵即逝的机会。","traits":["精准打断","勇气与反应","冬青木魔杖"],"signature":"H1","showcase":"基础咒击","showcaseCopy":"一道红金咒光击中练习靶，展现果断与准确。"},"ron":{"name":"罗恩·韦斯莱","role":"可靠的战术伙伴","copy":"用佯攻牵制敌人的注意，为同伴创造空间。在朋友需要时站出来。","traits":["佯攻牵制","战术与协作","柳木魔杖"],"signature":"R1","showcase":"佯攻牵制","showcaseCopy":"让训练木偶转向自己，以护身光效迎接挑战。"},"hermione":{"name":"赫敏·格兰杰","role":"专注的魔咒学者","copy":"扎实的知识让每一道咒语更有效，用观察与控制改变战局。","traits":["强化控物","知识与专注","葡萄藤木魔杖"],"signature":"M1","showcase":"漂浮咒","showcaseCopy":"让羽毛升起、旋转，再轻轻落下，展现细致的控物能力。"}};
const labels={hp:'最大生命',spellPower:'咒力',physicalDefense:'物理防御',magicDefense:'魔法防御',focusMax:'专注上限',focusRegenPerSecond:'每秒专注恢复',crit:'暴击率',haste:'急速'};
const slotKey='hogwarts-stone-v1';const randomToken=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),x=>x.toString(16).padStart(2,'0')).join('');
let saved;try{saved=JSON.parse(localStorage.getItem(slotKey));}catch{}if(!/^[a-f0-9]{64}$/i.test(saved?.token??''))saved={token:randomToken()};
let storageWorks=true;function persist(){try{localStorage.setItem(slotKey,JSON.stringify(saved));}catch{storageWorks=false;}}
persist();const sound=createSound({muted:Boolean(saved.muted)});document.addEventListener('pointerdown',()=>sound.unlock(),{passive:true});document.addEventListener('keydown',()=>sound.unlock(),{passive:true});let account={characters:[]},character=null,room=null,encounter=null,view=null,selected='harry',selectionReady=false,entryBusy=false,world=null,playing=false,panel=null,panelContext=null,pending=0,pollBusy=false,moveBusy=false,sequence=Math.floor(Date.now()/10),latestPose=null,lastSentPose=null,lastSentAt=0,epoch=0,notice='',actionbarStamp='',partyStamp='',toastTimer,dialogueTimer,queue=Promise.resolve(),filmTimer,movementPromise=null,movementRetry=null,journeyActive=false,skillTransport=null,abilityBar=null,characterPreview=null,folioStamp='',equipmentBusy=false,returnBusy=false;
const folioState={gearSlot:'top',bagFilter:'all',selectedItemId:null,magicFilter:'all',selectedSkillId:null,mapMode:'world',selectedSceneId:null};
const folioPages=new Set(['character','inventory','skills','map']);
const invitation=new URL(location.href).searchParams.get('party');
function toast(message){$('toast').textContent=message;$('toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').hidden=true,5000);}
function speak(name,message){$('dialogue').querySelector('strong').textContent=name;$('dialogue').querySelector('p').textContent=message;$('dialogue').hidden=false;clearTimeout(dialogueTimer);dialogueTimer=setTimeout(()=>$('dialogue').hidden=true,5000);}
async function api(path,body,token=saved.token){const began=performance.now();let response;try{response=await fetch('/api/stone'+path,{method:body===undefined?'GET':'POST',headers:{Authorization:'Bearer '+token,...(body===undefined?{}:{'Content-Type':'application/json'})},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(12000)});}catch{throw Object.assign(new Error('连接中断，进度保留在服务器。正在尝试重新连接。'),{code:'NETWORK'});}let data;try{data=await response.json();}catch{throw Object.assign(new Error('暂时无法读取游戏服务，正在恢复连接。'),{code:'NETWORK',status:response.status});}if(!response.ok)throw Object.assign(new Error(data.error??'操作未完成'),{code:response.status>=500?'NETWORK':data.code,status:response.status,rejectedSequence:data.rejectedSequence,rejectedPosition:data.rejectedPosition});data.clientTiming={rttMs:performance.now()-began,receivedAt:performance.now()};return data;}
async function accept(data){if(!data.character)return;const acceptEpoch=epoch,acceptToken=saved.token;const c=data.character;sequence=Math.max(sequence,(c.lastAcceptedMoveSequence??-1)+1);if(character&&c.id===character.id&&c.revision<character.revision)return;const old=character;character=c;room=data.room??null;const candidate=data.encounter??room?.encounter;encounter=candidate?.players?.[c.id]?candidate:null;view={...(data.scene??c.scene??getSceneView(c,data.serverTime)),clientTiming:data.clientTiming};character={...c,encounter};if(room)room={...room,encounter};
 $('connection').textContent='已连接 · 云端存档';if(playing){await world.setSnapshot(character,room,view);if(epoch!==acceptEpoch||saved.token!==acceptToken||character?.id!==c.id)return;paintHud();refreshFolio();}
 if(c.notice&&c.notice!==notice){notice=c.notice;if(old&&playing&&!journeyActive)toast(notice);}if(old&&c.level>old.level&&!journeyActive)speak('新的成长',`你升到了 ${c.level} 级。基础属性已提高，打开人物面板查看成长。`);
 if(playing){sound.consume(encounter,c.id);if(old&&c.completedQuestIds.length>old.completedQuestIds.length)sound.cue('reward');}saved.characterId=c.id;persist();
}
function notifySkillRequest(body,status){if(body.type==='skill')world?.setAbilityRequestStatus?.(body.requestId,status);}
function releaseSkillTransport(body){if(skillTransport?.requestId===body.requestId)skillTransport=null;}
function act(payload,{quiet=false,retryId=null}={}){
 const identity=character?.id,requestEpoch=epoch,requestToken=saved.token;if(!identity)return Promise.resolve();
 const body={...payload,requestId:retryId??payload.clientActionId??crypto.randomUUID()};delete body.clientActionId;
 const current=()=>identity===character?.id&&epoch===requestEpoch&&saved.token===requestToken;
 const task=async()=>{
  if(!current())return;pending++;
  try{
   // Check at execution time as well as the input boundary: this task may have
   // queued while the preceding request's commit outcome was still unknown.
   const unresolved=saved.pendingAction;
   if(unresolved&&(unresolved.characterId!==identity||unresolved.body.requestId!==body.requestId))throw Object.assign(new Error(unresolved.characterId===identity?'上一项操作正在确认，请稍候。':'上一个角色还有未确认操作，请返回该角色恢复连接。'),{code:'ACTION_PENDING'});
   const response=await api(`/characters/${identity}/actions`,body,requestToken);if(!current())return;
   if(body.movement)lastSentPose=body.movement.position;
   await accept(response);if(!current())return;
   notifySkillRequest(body,'settled');releaseSkillTransport(body);
   if(saved.pendingAction?.body.requestId===body.requestId){delete saved.pendingAction;persist();}
   return response;
  }catch(error){
   if(!current())return;
   if(error.code==='NETWORK'){
    saved.pendingAction={characterId:identity,body};persist();notifySkillRequest(body,'retrying');
    if(body.type==='skill')skillTransport={requestId:body.requestId,characterId:identity,epoch:requestEpoch};
   }else{
    if(Number.isSafeInteger(error.rejectedSequence)&&error.rejectedPosition)world?.rejectMovement?.(error.rejectedSequence,error.rejectedPosition);
    notifySkillRequest(body,'rejected');releaseSkillTransport(body);
   }
   if(!quiet)toast(error.message);throw error;
  }finally{pending--;}
 };
 const running=queue.then(task,task);queue=running.catch(()=>{});return running;
}
async function sendMove(force=false,{allowPanel=false}={}){
 if(moveBusy){if(!force)return;const waitEpoch=epoch,waitToken=saved.token;await movementPromise;if(epoch!==waitEpoch||saved.token!==waitToken||movementRetry)return;return sendMove(true,{allowPanel});}
 if(!playing||!character||!latestPose||latestPose.riding||panel&&!allowPanel||returnBusy&&!allowPanel||journeyActive||skillTransport?.characterId===character.id&&skillTransport.epoch===epoch||saved.pendingAction?.characterId===character.id&&saved.pendingAction.body.type==='skill')return;
 const now=performance.now(),scope=`${character.id}:${character.sceneId}:${encounter?.id??''}:${character.sceneId==='SC14'?character.currentQuestId:''}`;
 if(movementRetry?.scope!==scope)movementRetry=null;
 const changed=!lastSentPose||Math.hypot(latestPose.x-lastSentPose.x,latestPose.y-lastSentPose.y,latestPose.z-lastSentPose.z)>.012||Math.abs(latestPose.yaw-lastSentPose.yaw)>.04;
 if(!force&&!movementRetry&&!changed&&now-lastSentAt<1200)return;
 const requestEpoch=epoch,requestToken=saved.token,id=character.id;
 const packet=movementRetry??(()=>{const value=typeof world.takeMovementPacket==='function'?world.takeMovementPacket():{position:{x:latestPose.x,y:latestPose.y,z:latestPose.z,yaw:latestPose.yaw},sprint:latestPose.sprint,flying:latestPose.flying};if(!value)return null;return{scope,body:{type:'move',requestId:crypto.randomUUID(),sequence:sequence++,...value}};})();
 if(!packet)return;
 if(!movementRetry)world.noteMovementSent?.(packet.body.sequence,packet.body.position);
 moveBusy=true;lastSentAt=now;
 const current=()=>character?.id===id&&epoch===requestEpoch&&saved.token===requestToken;
 movementPromise=(async()=>{try{
   const data=await api(`/characters/${id}/actions`,packet.body,requestToken);
   if(current()){movementRetry=null;lastSentPose=packet.body.position;await accept(data);}
  }catch(e){if(!current())return;
   if(e.code==='NETWORK'){movementRetry=packet;$('connection').textContent='等待连接 · 进度已保留';}
   else{movementRetry=null;if(Number.isSafeInteger(e.rejectedSequence)&&e.rejectedPosition)world.rejectMovement?.(e.rejectedSequence,e.rejectedPosition);if(!/SPEED|POSITION|MOVE|REVISION/.test(e.code??''))toast(e.message);}
  }finally{moveBusy=false;movementPromise=null;}
 })();return movementPromise;
}

async function onWorldAction(action){
 if(!playing||panel||journeyActive||returnBusy)return;
 const actionEpoch=epoch,actionToken=saved.token,actionCharacterId=character?.id;
 const current=()=>playing&&epoch===actionEpoch&&saved.token===actionToken&&character?.id===actionCharacterId;
 const isSkill=action.type==='skill',requestId=action.clientActionId??crypto.randomUUID();
 if(isSkill){
  if(skillTransport?.characterId===actionCharacterId&&skillTransport.epoch===epoch||saved.pendingAction)throw Object.assign(new Error('上一项操作正在确认，请稍候。'),{code:'ACTION_PENDING'});
  // Reserve the transport before awaiting the existing move so the interval
  // cannot insert a second round trip. Only one combined cast is in flight.
  skillTransport={requestId,characterId:actionCharacterId,epoch:actionEpoch};
 }
 try{
  if(isSkill){if(movementPromise)await movementPromise;}
  else await sendMove(true);
  if(!current()||panel)return;
  if(movementRetry)throw Object.assign(new Error('正在确认移动位置，请稍后施咒。'),{code:'MOVEMENT_PENDING'});
  const target=action.target??view?.targets.find(t=>t.id===action.targetId);
  if(action.type==='service'){showPanel('shop',target);return;}if(action.type==='training'){showPanel('training',target);return;}if(action.type==='travel'||target?.id==='exit'){showPanel('travel');return;}
  if(target?.kind==='puzzle'){showPanel('puzzle',target);return;}
  if(target?.kind==='flight'){world.setFlying(true);if((latestPose?.y??0)<(target.minY??.6)){speak('飞行练习','空格上升，Z 或 Ctrl 下降。飞到金色目标旁按 E；按 X 可自动降落，再靠近落地点按 E。');return;}}
  if(target?.kind==='talk')speak(target.label.includes('：')?target.label.split('：')[0]:(view.quest.npc??'同伴').split(/[、，,]/)[0],target.label);
  if(target?.kind==='collection')return await act({type:'collect',questId:target.questId});
  if(target?.kind==='side'){const result=await act({type:'side',questId:target.questId});if(current())toast('已记录探索邀请，可在任务日志中查看。');return result;}
  const payload={...action,requestId};delete payload.target;
  if(target?.kind==='cast'){payload.type='skill';payload.skillId=target.skillId;}
  if(isSkill){
   const packet=world.takeMovementPacket?.();
   if(packet?.steps?.length){
    payload.movement={...packet,sequence:sequence++};
    world.noteMovementSent?.(payload.movement.sequence,payload.movement.position);
   }
  }
  if(action.type==='skill'&&!action.targetId&&action.skillId==='rescue'&&encounter){const downed=Object.values(encounter.players??{}).find(p=>p.hp<=0&&p.id!==character.id);if(downed)payload.targetId=downed.id;}
  const result=await act(payload,{retryId:requestId});
  if(current()&&target&&['hold','sneak'].includes(target.kind))speak(view.quest.npc??'行动',`保持在目标附近，完成${target.label}。`);
  return result;
 }catch(error){if(isSkill)throw error;}
 finally{if(isSkill&&current()&&saved.pendingAction?.body.requestId!==requestId)releaseSkillTransport({requestId});}
}
async function choose(hero){
 if(!isSelectableHero(hero)||!selectionReady||entryBusy||returnBusy||playing)return;
 selected=hero;paintPicker();
 try{await world.chooseHero(hero,true);}catch(e){toast('人物展示暂未完成：'+e.message);}
}
function paintPicker(){
 if(!isSelectableHero(selected))selected='harry';
 const h=heroes[selected],s=getHeroStats(selected,1);
 $('hero-picker').innerHTML=SELECTABLE_HERO_IDS.map(id=>`<button class="${id===selected?'selected':''}" data-hero="${id}" aria-label="选择${esc(heroes[id].name.split('·')[0])}" aria-pressed="${id===selected}" ${entryBusy||!selectionReady?'disabled':''}><strong>${esc(heroes[id].name.split('·')[0])}</strong><small>${esc(heroes[id].showcase)}</small></button>`).join('');
 $('hero-info').innerHTML=`<small>${esc(h.role)}</small><h2>${esc(h.name)}</h2><p class="hero-copy">${esc(h.copy)}</p><div class="traits">${h.traits.map(t=>`<span>${esc(t)}</span>`).join('')}</div><div class="spell-preview"><span>咒语展示</span><strong>${esc(h.showcase)}</strong><p>${esc(h.showcaseCopy)}</p></div><p class="birth-stats">生命 ${s.hp} · 专注 ${s.focusMax}<br>咒力 ${s.spellPower} · 魔防 ${s.magicDefense}</p>`;
 const slots=account.characters.filter(c=>c.heroId===selected);
 $('character-slots').innerHTML=slots.length?'已有冒险　'+slots.map(c=>`<button data-resume="${esc(c.id)}">${esc(c.name)} · Lv.${c.level} · 继续冒险</button>`).join(''):'每个角色独立成长，退出后可继续。';
 $('enter-game').textContent=slots.length?'继续这段冒险':'开始新的冒险';
 $('enter-game').disabled=!selectionReady||entryBusy;
 if(slots.length)$('player-name').value=slots[0].name;
}
async function enter(id){if(pending||entryBusy||returnBusy||!selectionReady)return;const requestedHero=id?account.characters.find(c=>c.id===id)?.heroId:selected;if(!isSelectableHero(requestedHero))return;entryBusy=true;paintPicker();const entryEpoch=++epoch,entryToken=saved.token;const previousSeen=account.characters.find(c=>id?c.id===id:c.heroId===selected)?.lastSeenAt;sound.unlock();$('enter-game').disabled=true;try{let data;if(id)data=await api('/characters/'+id);else{const prior=account.characters.find(c=>c.heroId===selected);if(prior)data=await api('/characters/'+prior.id);else data=await api('/characters',{requestId:crypto.randomUUID(),heroId:selected,name:$('player-name').value.trim()||heroes[selected].name.split('·')[0]});}
  if(epoch!==entryEpoch||saved.token!==entryToken)return;playing=true;$('selection').hidden=true;$('hud').hidden=false;$('return-selection-shortcut').hidden=false;await accept(data);world.setBlocked(false);if(!saved.sawFilm&&character.currentQuestId==='M01')startFilm();else if(invitation&&!room){showPanel('party');const input=$('join-code');if(input)input.value=invitation.toUpperCase();}
  if(previousSeen&&Date.now()-previousSeen>7*86400000&&$('film').hidden)showPanel('journal');
  if(!storageWorks)toast('浏览器没有保存恢复码，请在设置中复制恢复码以便下次继续。');
 }catch(e){if(epoch!==entryEpoch)return;toast(e.message);playing=false;$('selection').hidden=false;$('hud').hidden=true;$('return-selection-shortcut').hidden=true;}finally{entryBusy=false;$('enter-game').disabled=!selectionReady;if(!playing)paintPicker();}}
async function returnToSelection(){
 if(returnBusy||!playing||!character)return;
 returnBusy=true;const returnToken=saved.token,owner=character.id,startedEpoch=epoch;
 const current=()=>saved.token===returnToken&&character?.id===owner&&epoch===startedEpoch;
 const button=$('return-selection-shortcut');button.disabled=true;button.textContent='正在保存…';world.setBlocked(true);
 try{
  // Resolve outstanding writes before retiring this character's session. A
  // timeout retains its exact request ID for a retry instead of losing a reward.
  await queue;if(!current())return;
  if(movementPromise)await movementPromise;if(!current())return;
  if(saved.pendingAction?.characterId===owner){
   const retry=saved.pendingAction;
   try{await act(retry.body,{retryId:retry.body.requestId,quiet:true});}
   catch(error){if(error.code==='NETWORK')throw error;if(saved.pendingAction?.body.requestId===retry.body.requestId){delete saved.pendingAction;persist();}}
  }
  if(!current())return;
  await sendMove(true,{allowPanel:true});if(!current())return;
  if(movementRetry)throw new Error('最后的位置还在保存，请连接恢复后再返回选角。');
  const leaving=character;selected=leaving.heroId;
  account={...account,characters:[...account.characters.filter(c=>c.id!==owner),leaving]};
  const returnEpoch=++epoch;playing=false;clearTimeout(filmTimer);clearTimeout(dialogueTimer);clearTimeout(toastTimer);
  closePanel();character=null;room=null;encounter=null;view=null;latestPose=null;lastSentPose=null;movementRetry=null;skillTransport=null;notice='';
  for(const id of ['hud','film','dialogue','toast','flight-hud','return-selection-shortcut'])$(id).hidden=true;
  $('selection').hidden=false;$('place').textContent='霍格沃茨 · 魔法石';$('team-button').innerHTML='好友队伍 <kbd>P</kbd>';
  world.selectionStage(selected);returnBusy=false;paintPicker();toast('进度已保留，选择原角色继续，或换一位伙伴。');
  try{const result=await api('/account',undefined,returnToken);if(epoch===returnEpoch&&saved.token===returnToken){account=result.account;paintPicker();}}
  catch(error){if(epoch===returnEpoch)toast('已保留当前存档。人物列表暂未刷新，可稍后重新连接。');}
 }catch(error){if(current())toast(error.message);}
 finally{returnBusy=false;button.disabled=false;button.textContent='更换人物';if(playing&&!panel)world.setBlocked(false);}
}
function paintFlight(state){
 const hud=$('flight-hud');hud.hidden=!playing||journeyActive||!state?.available&&state?.mode==='grounded'||!state;
 if(hud.hidden)return;
 hud.dataset.mode=state.mode;
 $('flight-title').textContent=state.mode==='landing'?'正在自动降落':state.mode==='flying'?'扫帚飞行':'扫帚练习';
 $('flight-height').textContent=`离地 ${Math.max(0,state.height??0).toFixed(1)} 米`;
 $('flight-instruction').textContent=state.mode==='landing'?'缓缓下降中，可用 WASD 调整落点；落地后靠近目标按 E。':state.mode==='flying'?'WASD 移动 · 空格 上升 · Z / Ctrl 下降 · X 自动降落':'X 骑上扫帚 · 空格 上升 · Z / Ctrl 下降 · E 完成目标';
}
function paintAim(state){
 const reticle=$('reticle'),hint=$('aim-hint'),target=$('target-lock');
 reticle.dataset.state=state?.status??'none';reticle.classList.toggle('locked',Boolean(state?.locked));
 hint.hidden=!state||state.busy;hint.textContent=state?.feedback||(state?.targetId?(state.status==='blocked'?'目标被遮挡 · 移动到开阔位置':state.status==='far'?'目标超出射程 · 靠近后施咒':state.locked?'已锁定 · 按住 1 连续咒击 · Tab 换目标':'点击敌人锁定并施咒'):'左键点选敌人并施咒 · Tab 锁定视野内目标');
 target.hidden=!state?.targetId||state.busy;
 if(state?.targetId){target.textContent=`${state.locked?'锁定':'瞄准'} · ${state.name} · ${state.distance.toFixed(1)} 米`;
 const enemy=encounter?.enemies?.[state.targetId];if(enemy){$('enemy-hud').hidden=false;$('enemy-name').textContent=enemy.name;$('enemy-fill').style.width=enemy.hp/enemy.maxHp*100+'%';$('enemy-hp').textContent=`${Math.ceil(enemy.hp)} / ${enemy.maxHp}`;}}
}
function paintJourney(state){
 journeyActive=Boolean(state?.active);$('journey-status').hidden=!journeyActive;
 if(journeyActive){$('flight-hud').hidden=true;$('interact').hidden=true;$('dialogue').hidden=true;$('toast').hidden=true;$('journey-label').textContent=state.label??'沿路前行';$('journey-progress').style.width=`${Math.round((state.progress??0)*100)}%`;latestPose=null;lastSentPose=null;movementRetry=null;skillTransport=null;closePanel();}
 else if(world){latestPose=world.getPose();lastSentPose=null;}
}
function startFilm(){const shots=[['猫头鹰带来一封信','十一岁生日那天，通往魔法世界的大门打开了。'],['你被霍格沃茨录取了','海格带你认识了魔法世界，买齐书本，也选中了属于你的魔杖。'],['九又四分之三站台','九月的伦敦。行李已经备好，特快列车正在等候。']];let index=0;$('film').hidden=false;world.setBlocked(true);const next=()=>{const shot=shots[index++];if(!shot){endFilm();return;}$('film').querySelector('h1').textContent=shot[0];$('film').querySelector('p').textContent=shot[1];filmTimer=setTimeout(next,4200);};next();}
function endFilm(){clearTimeout(filmTimer);$('film').hidden=true;world.setBlocked(false);saved.sawFilm=true;persist();if(invitation&&!room)showPanel('party');}
function paintHud(){const c=character,h=heroes[c.heroId],self=encounter?.players?.[c.id],stats=c.stats;$('place').textContent=(journeyActive?'旅途中 · ':'')+view.name;$('hero-name').textContent=c.name;$('level').textContent='Lv.'+c.level;const hp=self?.hp??c.hp??stats.hp,focus=self?.focus??c.focus??stats.focusMax;$('hp-fill').style.width=(hp/stats.hp*100)+'%';$('hp-label').textContent=`${Math.ceil(hp)} / ${stats.hp}`;$('focus-fill').style.width=(focus/stats.focusMax*100)+'%';$('focus-label').textContent=`${Math.floor(focus)} / ${stats.focusMax}`;const xp=c.xp??{};$('xp-fill').style.width=((xp.requiredThisLevelCents?xp.earnedThisLevelCents/xp.requiredThisLevelCents:xp.atCap?1:0)*100)+'%';$('xp-label').textContent=c.level>=40?'已达到最高等级':`累计经验 ${(c.xpCents/100).toLocaleString('zh-CN',{maximumFractionDigits:2})}`;
 $('quest-title').textContent=c.chapterComplete?'第一学年 · 冒险完成':view.quest.name;const objective=view.targets.find(t=>t.active&&!['service','training','collection'].includes(t.kind));$('quest-objective').textContent=c.chapterComplete?'魔法石已被守护。你可以继续探索校园，或帮助朋友重返副本。':objective?.label??'沿着路标继续冒险';$('quest-distance').textContent=view.escort?view.escort.waitingForPlayer?'同伴正在等你跟上':`同行进度 ${Math.round(view.escort.progress*100)}%`:c.hold?'正在行动，请保持在目标附近':'';
 $('optional-tracking').innerHTML=(c.journal?selectHud(c.journal,c.trackedIds).optional:[]).map(q=>`<p class="note">◇ ${esc(q.name)}</p>`).join('');
 $('team-button').innerHTML=(room?'队伍 '+esc(room.code):'好友队伍')+' <kbd>P</kbd>';$('party-roster').innerHTML=(room?.members??[]).filter(p=>p.id!==c.id).map(p=>`<p>${esc(p.name)}　Lv.${p.level}<br><small>${(view.serverTime-p.lastSeenAt)>30000?'暂时离线':p.sceneId===c.sceneId?'正在同一场景':esc(contentData.scenes.find(s=>s.id===p.sceneId)?.name??'校园中')}</small></p>`).join('');
 const rosterStamp=JSON.stringify(room?.members.map(p=>[p.id,p.level,(view.serverTime-p.lastSeenAt)>30000]));if(panel==='party'&&room&&rosterStamp!==partyStamp){partyStamp=rosterStamp;showPanel('party');}
 const enemy=encounter?.enemies?.[world.getAimState?.()?.targetId]??Object.values(encounter?.enemies??{}).find(e=>e.hp>0);$('enemy-hud').hidden=!enemy;if(enemy){$('enemy-name').textContent=enemy.name;$('enemy-phase').textContent=enemy.attack?enemy.attack.name:'观察敌人，移动寻找机会';$('enemy-fill').style.width=enemy.hp/enemy.maxHp*100+'%';$('enemy-hp').textContent=`${Math.ceil(enemy.hp)} / ${enemy.maxHp}`;}
 paintAbilities();
 if(encounter?.status==='lost'&&panel!=='battle-result')showPanel('battle-result');if(encounter?.status==='won'&&panel!=='battle-result')showPanel('battle-result');
}
function paintAbilities(){
 if(!playing||!character)return;
 abilityBar??=createActionBar({container:$('actionbar'),castContainer:$('castbar')});
 const snapshot=world?.getAbilitySnapshot?.()??{character,combat:encounter,now:view?.serverTime??Date.now(),pending:null,queuedSkillId:null};
 abilityBar.update(snapshot);
}
function closePanel(){characterPreview?.dispose();characterPreview=null;folioStamp='';panel=null;panelContext=null;$('panel-backdrop').hidden=true;world?.setBlocked(false);}
const itemName=id=>contentData.items.find(i=>i.itemId===id)?.name??id;
const effectText=item=>Object.entries(item.effect?.stats??{}).map(([k,v])=>`${labels[k]??k} +${v}`).join(' · ')||'永久物品 / 外观';
function statsRows(stats){return Object.entries(labels).map(([key,name])=>`<div class="row"><span>${name}</span><strong>${['crit','haste'].includes(key)?(stats[key]*100).toFixed(1)+'%':stats[key]}</strong></div>`).join('');}
function showPanel(name,context){if(characterPreview&&name!=='character'){characterPreview.dispose();characterPreview=null;}panelContext=context??(panel===name?panelContext:null);context=panelContext;panel=name;world?.setBlocked(true);$('panel-backdrop').hidden=false;const c=character;let title='',html='';
 if(name==='character'){title='人物';html=renderCharacterSheet({character:c,hero:heroes[c.heroId],selectedSlot:folioState.gearSlot});}
 else if(name==='inventory'){title='背包';html=renderInventoryPanel({character:c,filter:folioState.bagFilter,selectedItemId:folioState.selectedItemId});}
 else if(name==='skills'){title='魔法手册';html=renderMagicPanel({character:c,filter:folioState.magicFilter,selectedSkillId:folioState.selectedSkillId});}
 else if(name==='map'){title='地图集';html=renderMapPanel({character:c,view,room,mode:folioState.mapMode,selectedSceneId:folioState.selectedSceneId});}
 else if(name==='journal'){title='任务日志';const journal=c.journal;html=`<h3>正在进行 · ${esc(view.quest.name)}</h3><p>${esc(view.quest.description)}</p>${view.targets.filter(t=>!['service','training','collection'].includes(t.kind)).map(t=>`<div class="row"><span>${esc(t.label)}</span><span class="${t.completed?'complete':'note'}">${t.completed?'已完成':t.active?'进行中':'待完成'}</span></div>`).join('')}<h3>探索邀请</h3>${contentData.sideQuests.map(q=>{const row=journal?.side.find(s=>s.id===q.id);return `<div class="card"><strong>${esc(q.name??q.title??q.id)}</strong><p>${esc(row?.serverState==='completed'?'已经找到收藏':row?.serverState==='locked'?'随着主线推进开放':'前往'+q.startNpc.name+'所在的'+(contentData.scenes.find(s=>s.id===q.startNpc.sceneId)?.name??'区域')+'领取邀请，再寻找收藏点。')}</p>${['available','active'].includes(row?.serverState)?`<button data-track="${esc(row.key)}">${c.trackedIds.includes(row.key)?'取消追踪':'追踪任务'}</button>`:''}</div>`;}).join('')}<h3>已完成主线 ${c.completedQuestIds.length} / 36</h3>${c.completedQuestIds.map(id=>`<div class="row complete">✓ ${esc(contentData.quests.find(q=>q.id===id)?.name)}</div>`).join('')}<h3>回归接续</h3><p>你上次保存的任务是「${esc(view.quest.name)}」。关闭窗口后沿金色标记前往当前目标，任务和已领取奖励不会重置。</p>`;}
 else if(name==='travel'){title=name==='travel'?'选择出口路线':'霍格沃茨地图';const available=new Set([view.sceneId,...c.completedQuestIds.flatMap(q=>contentData.questSceneMap[q]??[]),contentData.questSceneMap[c.currentQuestId]?.[0]]);html='<p class="note">地图用于查看路线。走到场景出口并按 E，才能选择前往已开放地点。</p><div class="grid">'+contentData.scenes.filter(s=>s.id!=='SC00').map(s=>`<div class="card"><strong>${esc(s.name)} ${s.id===view.sceneId?'· 你在这里':''}</strong><p>${esc(s.zones.join(' · '))}</p>${name==='travel'&&available.has(s.id)?`<button data-travel="${s.id}">沿出口前往</button>`:`<span class="note">${available.has(s.id)?'路线已开放':'随主线开放'}</span>`}</div>`).join('')+'</div>';}
 else if(name==='party'){title='好友队伍';html=room?`<p class="note">把邀请码发给朋友，最多五人同行。每个人的角色、任务和奖励独立保存。</p><div class="room-code">${esc(room.code)}</div><button id="copy-invite">复制邀请链接</button><h3>同行伙伴 ${room.members.length} / 5</h3>${room.members.map(p=>`<div class="row"><span>${esc(p.name)} · ${esc(heroes[p.heroId]?.name)} · Lv.${p.level}</span><span>${(view.serverTime-p.lastSeenAt)>30000?'暂时离线':p.id===room.leaderId?'队长':p.id===c.id?'你':'队友'}</span></div>`).join('')}<p class="note">挑战Boss前，全员走到同一副本入口附近。开始后锁定本轮人数，战斗难度随参与人数调整。</p><button data-action="room-leave">离开队伍</button>`:`<p>独自探索，也可以邀请最多四位朋友同行。</p><button class="primary" data-action="room-create">创建好友队伍</button><h3>加入朋友的队伍</h3><div class="tabs"><input id="join-code" placeholder="8位队伍邀请码" maxlength="8" value="${esc(invitation??'')}" aria-label="队伍邀请码"><button id="join-room">加入队伍</button></div>`;}
 else if(name==='shop'){const localIds=context?.serviceIds??[];title=context?.label??'校园补给与用品';html=`<div class="row"><strong>金币 ${c.wallet.coins}</strong><strong>学习凭证 ${c.wallet.learningCredits}</strong></div>${localIds.some(id=>['SERVICE-SUPPLY','CHECKPOINT'].includes(id))?`<h3>免费恢复与药剂补给</h3><div class="tabs">${[[1,1],[2,0],[0,2]].map(([h,f])=>`<button data-refill="${h},${f}">生命 ${h} · 专注 ${f}</button>`).join('')}</div><p class="note">总计两瓶。每场战斗共享一次药剂使用额度，失败后可回补给点再准备。</p>`:''}`+contentData.services.filter(s=>s.catalog.length&&localIds.includes(s.serviceId)).map(s=>`<h3>${esc(s.name)}</h3><div class="grid">${s.catalog.map(o=>{const i=contentData.items.find(i=>i.itemId===o.itemId);const owned=[...c.inventory,...Object.values(c.equipment),...(c.tools??[]),...(c.appearances??[])].includes(i.itemId);const unlocked=c.level>=(o.unlock.requiredLevel??1)&&o.unlock.requiredQuestIds.every(id=>c.completedQuestIds.includes(id));return `<div class="card"><strong>${esc(i.name)}</strong><p>${esc(effectText(i))}</p><p>${o.price.amount} ${o.price.currencyId==='CUR-COIN'?'金币':'学习凭证'}</p><button data-buy="${esc(o.offerId)}" data-service="${s.serviceId}" ${owned||!unlocked?'disabled':''}>${owned?'已拥有':unlocked?'购买 / 兑换':'尚未开放'}</button></div>`;}).join('')}</div>`).join('');html+='<h3>探索邀请</h3>'+contentData.sideQuests.filter(q=>q.startNpc.sceneId===view.sceneId&&q.prerequisites.completedQuestIds.every(id=>c.completedQuestIds.includes(id))).map(q=>`<button data-side="${q.id}">${esc(q.name??q.title??q.id)}</button>`).join('');}
 else if(name==='training'){title='练习与副本重演';const localIds=context?.cycleIds??[];html='<p class="note">在委托人所在的区域开启挑战。灰色内容不再提供重复经验；已通关的朋友可以协助重打。</p><div class="grid">'+runtimeCatalog.commissions.map(q=>{const open=commissionUnlocked(c,q.cycleId),local=localIds.includes(q.cycleId);const place=contentData.scenes.find(s=>s.id===q.sceneId)?.name??q.sceneId;return `<div class="card"><strong>${esc(q.displayName)}</strong><p>${esc(place)} · ${esc(q.initiator.name)}</p><p>内容等级 ${q.contentLevel} · ${c.level-q.contentLevel>=5?'灰色 · 0经验':'完成后按真实等级结算'}</p>${open&&local?`<button data-cycle="${q.cycleId}">开始挑战</button>`:`<span class="note">${open?'前往该区域的练习委托台':'随主线开放'}</span>`}</div>`;}).join('')+'</div>';}
 else if(name==='puzzle'){title='观察与推理';html=`<p>${esc(context.label)}</p>${context.options.map((o,i)=>`<button class="wide" style="margin:.4rem 0" data-answer="${i}" data-target="${context.id}">${esc(o)}</button>`).join('')}`;}
 else if(name==='battle-result'){const won=encounter?.status==='won';title=won?'挑战完成':'重新整装';html=`<p>${won?'你们完成了这场挑战。参与战斗的伙伴都已获得各自的奖励，进度已保存。':'观察敌人的预备动作，及时离开危险范围。可以回到检查点补给，再次尝试。'}</p><button class="primary" data-action="retry">${won?'返回冒险':'回到检查点'}</button><p class="note">重试不会重复发放已经结算的同次奖励。</p>`;}
 else if(name==='settings'){title='冒险设置';html=`<p>你的角色与进度保存在服务器。此设备使用一份私密恢复码继续访问存档。</p><button id="copy-recovery">复制我的存档恢复码</button><p class="note">请自行保存，勿作为队伍邀请码分享。其他设备可用它恢复同一组角色。</p><h3>在其他设备继续</h3><input type="password" id="restore-token" class="wide" placeholder="粘贴64位恢复码" autocomplete="off"><button id="restore-account">读取存档</button><h3>人物选择</h3><button id="return-selection" data-return-selection="true" class="primary">保存并返回人物选择</button><p class="note">等级、装备和任务进度保留。回到三维选角场景后，可以继续原角色或换另一位伙伴。</p><h3>声音</h3><button id="toggle-sound">${sound.muted?'开启声音':'关闭声音'}</button><h3>操控</h3><p>WASD 移动 · Shift 奔跑 · 空格 跳跃<br>左键点击敌人锁定并施咒 · Tab 切换目标 · Esc 取消锁定<br>右键拖动或方向键调整视角 · 滚轮缩放 · E 交互<br>1–5 魔法 · 按住 1 连续基础咒击 · F 侧闪 · Q/R 药剂<br>扫帚：X 起飞 / 自动降落 · 空格 上升 · Z 或 Ctrl 下降<br>飞到目标旁按 E；降落目标需双脚落地后按 E。</p><p>每个技能圆环内显示剩余冷却，金色外环为技能冷却，蓝色内环为公共调息。药剂显示背包数量；同一场战斗两类药剂合计可成功使用一次。</p><p class="note">联网世界不会因打开窗口暂停。请在安全处管理物品。</p>`;}
 $('panel-title').textContent=title;
 $('panel').dataset.view=folioPages.has(name)?name:'';
 const nav=$('folio-nav');nav.hidden=!folioPages.has(name);nav.innerHTML=folioPages.has(name)?[['character','人物','C'],['inventory','背包','B'],['skills','魔法','K'],['map','地图','M']].map(([id,label,key])=>`<button data-panel="${id}" aria-current="${name===id?'page':'false'}">${iconMarkup(id)}<span>${label}</span><kbd>${key}</kbd></button>`).join(''):'';
 if(name==='character'&&characterPreview&&$('character-preview'))updateCharacterSheet();
 else{
  $('panel-content').innerHTML=html;
  if(name==='character'){
   try{characterPreview=createCharacterPreview({container:$('character-preview'),onError:()=>toast('人物预览暂未加载完成，请重新打开人物面板。')});characterPreview.setCharacter(c).catch(()=>{});}catch(error){toast('人物预览暂不可用，请重新打开人物面板。');}
  }
 }
 folioStamp=currentFolioStamp();
}
function updateCharacterSheet(){
 const parts=characterSheetParts({character,hero:heroes[character.heroId],selectedSlot:folioState.gearSlot});
 for(const [id,key] of [['character-identity','identity'],['character-equipment','equipment'],['character-stats','stats']])if($(id))$(id).innerHTML=parts[key];
 characterPreview?.setCharacter(character).catch(()=>{});
}
function currentFolioStamp(){
 if(!folioPages.has(panel)||!character)return '';
 return JSON.stringify([panel,character.id,character.level,character.hp,character.focus,character.xpCents,character.stats,character.equipment,character.inventory,character.potions,character.bagCapacity,character.tools,character.collectionItems,character.appearances,character.pendingClaims,character.skills,character.completedQuestIds,character.wallet,encounter?.status,panel==='map'?[character.position,view?.sceneId,view?.targets,room?.members]:null]);
}
function refreshFolio(){if(folioPages.has(panel)&&currentFolioStamp()!==folioStamp)showPanel(panel);}
async function changeEquipment(button,payload){
 if(equipmentBusy)return;equipmentBusy=true;button.disabled=true;
 const opened=panel,owner=character?.id;
 try{await act(payload);if(character?.id===owner&&panel===opened&&folioPages.has(panel))showPanel(panel);}
 finally{equipmentBusy=false;if(button.isConnected)button.disabled=false;}
}
document.addEventListener('click',async e=>{const b=e.target.closest('button');if(!b||b.disabled||returnBusy)return;try{
 if(b.dataset.returnSelection){await returnToSelection();return;}
 if(b.dataset.gearSelect){folioState.gearSlot=b.dataset.gearSelect;showPanel('character');return;}
 if(b.dataset.previewRotate){characterPreview?.rotate(Number(b.dataset.previewRotate));return;}
 if(b.dataset.previewReset){characterPreview?.resetView();return;}
 if(b.dataset.bagFilter){folioState.bagFilter=b.dataset.bagFilter;folioState.selectedItemId=null;showPanel('inventory');return;}
 if(b.dataset.itemSelect){folioState.selectedItemId=b.dataset.itemSelect;showPanel('inventory');return;}
 if(b.dataset.magicFilter){folioState.magicFilter=b.dataset.magicFilter;folioState.selectedSkillId=null;showPanel('skills');return;}
 if(b.dataset.skillSelect){folioState.selectedSkillId=b.dataset.skillSelect;showPanel('skills');return;}
 if(b.dataset.mapMode){folioState.mapMode=b.dataset.mapMode;showPanel('map');return;}
 if(b.dataset.sceneSelect){folioState.selectedSceneId=b.dataset.sceneSelect;showPanel('map');return;}
 if(b.dataset.hero){await choose(b.dataset.hero);return;}if(b.dataset.resume){await enter(b.dataset.resume);return;}if(b.dataset.panel&&character){showPanel(b.dataset.panel);return;}if(b.dataset.skill){world.cast(b.dataset.skill);return;}if(b.dataset.track){const ids=selectHud(character.journal,character.trackedIds).trackedIds;const tracked=ids.includes(b.dataset.track);if(!tracked&&ids.length>=2){toast('最多追踪两个可选任务，请先取消一个。');return;}await act({type:'track',trackedIds:tracked?ids.filter(id=>id!==b.dataset.track):[...ids,b.dataset.track]});showPanel('journal');}if(b.dataset.equip){await changeEquipment(b,{type:'equip',itemId:b.dataset.equip});return;}if(b.dataset.unequip){await changeEquipment(b,{type:'unequip',slot:b.dataset.unequip});return;}if(b.dataset.claim){await act({type:'claim',claimId:b.dataset.claim,itemId:b.dataset.item});showPanel('inventory');}if(b.dataset.buy){await act({type:'buy',serviceId:b.dataset.service,offerId:b.dataset.buy});showPanel('shop');}if(b.dataset.refill){const[health,focus]=b.dataset.refill.split(',').map(Number);await act({type:'refill',health,focus});showPanel('shop');}if(b.dataset.cycle){closePanel();await act({type:'encounter',cycleId:b.dataset.cycle});}if(b.dataset.travel){await act({type:'travel',targetId:'exit',sceneId:b.dataset.travel});closePanel();}if(b.dataset.answer){closePanel();await act({type:'interact',targetId:b.dataset.target,choice:Number(b.dataset.answer)});}if(b.dataset.side){await act({type:'side',questId:b.dataset.side});toast('已记录探索邀请，可在任务日志中查看。');}if(b.dataset.action){const action=b.dataset.action;if(action==='retry')closePanel();await act({type:action});if(action.startsWith('room'))showPanel('party');}}
 catch(e){if(e.code!=='NETWORK')toast(e.message);}});
for(const b of $('quick-menu').querySelectorAll('button[data-panel]'))b.insertAdjacentHTML('afterbegin',iconMarkup(b.dataset.panel));
$('enter-game').addEventListener('click',()=>enter());$('skip-film').addEventListener('click',endFilm);$('close-panel').addEventListener('click',closePanel);$('team-button').addEventListener('click',()=>character?showPanel('party'):toast('先选择人物进入冒险，再邀请朋友。'));$('menu-button').addEventListener('click',()=>showPanel('settings'));
document.addEventListener('click',async e=>{try{if(e.target.id==='toggle-sound'){saved.muted=!sound.muted;sound.setMuted(saved.muted);persist();showPanel('settings');}if(e.target.id==='join-room'){await act({type:'room-join',code:$('join-code').value.trim().toUpperCase()});showPanel('party');}if(e.target.id==='copy-invite'){const u=new URL('/stone.html',location.origin);u.searchParams.set('party',room.code);await navigator.clipboard.writeText(u.href);toast('已复制邀请链接。');}if(e.target.id==='copy-recovery'){await navigator.clipboard.writeText(saved.token);toast('恢复码已复制，请保存在自己的安全位置。');}if(e.target.id==='restore-account'){const token=$('restore-token').value.trim();if(!/^[a-f0-9]{64}$/i.test(token))throw new Error('恢复码应为64位字母与数字。');const old=saved,wasPlaying=playing,restoreEpoch=++epoch;playing=false;try{const restored=await api('/account?existing=1',undefined,token);if(epoch!==restoreEpoch)return;saved={token};account=restored.account;persist();character=null;playing=false;closePanel();$('hud').hidden=true;$('return-selection-shortcut').hidden=true;$('selection').hidden=false;world.selectionStage(selected);paintPicker();toast('已读取存档，请选择要继续的角色。');}catch(error){if(epoch===restoreEpoch){saved=old;playing=wasPlaying;}throw error;}}}
 catch(error){toast(error.message);}});
document.addEventListener('keydown',e=>{if(/INPUT|TEXTAREA/.test(e.target.tagName)||e.repeat)return;if(e.code==='Escape'){if(playing&&!panel&&world.clearTarget?.()){e.preventDefault();return;}if(!$('film').hidden)endFilm();else if(panel)closePanel();else showPanel('settings');return;}const keys={KeyJ:'journal',KeyB:'inventory',KeyC:'character',KeyK:'skills',KeyM:'map',KeyP:'party'};if(playing&&keys[e.code]){e.preventDefault();panel===keys[e.code]?closePanel():showPanel(keys[e.code]);}});
async function poll(){if(!playing||!character||pollBusy||returnBusy)return;pollBusy=true;const id=character.id,requestEpoch=epoch,requestToken=saved.token;const current=()=>epoch===requestEpoch&&saved.token===requestToken&&character?.id===id;
 try{const data=await api('/characters/'+id,undefined,requestToken);if(!current())return;await accept(data);if(!current())return;if(saved.pendingAction?.characterId===id){const retry=saved.pendingAction;try{await act(retry.body,{retryId:retry.body.requestId,quiet:true});if(current()&&saved.pendingAction?.body.requestId===retry.body.requestId){delete saved.pendingAction;persist();}}catch(e){if(!current())return;if(e.code!=='NETWORK'&&e.status<500){if(saved.pendingAction?.body.requestId===retry.body.requestId){delete saved.pendingAction;persist();}toast(e.message);}else throw e;}}}
 catch(e){if(current())$('connection').textContent='正在重新连接…';}finally{pollBusy=false;}}
let bootGeneration=0;
async function boot(){
 const attempt=++bootGeneration,bootToken=saved.token,bootEpoch=epoch;
 const current=()=>attempt===bootGeneration&&saved.token===bootToken&&epoch===bootEpoch;
 const loaded=new Set();
 try{
  world??=createStoneWorld($('game'),{onPose:p=>latestPose=p,onAction:onWorldAction,onSelectHero:hero=>choose(hero),onAim:paintAim,onJourney:paintJourney,onFlight:paintFlight,onLoaded:hero=>{if(!selectionReady&&isSelectableHero(hero)){loaded.add(hero);$('load-text').textContent=`三位伙伴正在就位（${loaded.size}/3）…`;}},onHint:target=>{$('interact').hidden=!target;if(target)$('interact').querySelector('span').textContent=target.label;},onError:e=>toast('人物载入暂未完成：'+e.message)});
  // Prepare all three once while the independent account request is running.
  const modelReady=world.prepareSelection('harry');
  const accountReady=api('/account',undefined,bootToken).then(result=>{if(!current())return;account=result.account;$('connection').textContent='已连接 · 云端存档';const preferred=account.characters.find(c=>c.id===saved.characterId)?.heroId;selected=isSelectableHero(preferred)?preferred:'harry';});
  await Promise.all([modelReady,accountReady]);
  if(!current())return;
  selectionReady=true;
  if(selected!=='harry')await world.chooseHero(selected,true);
  if(!current())return;
  paintPicker();$('selection').hidden=false;$('load').hidden=true;
  setInterval(()=>sendMove(),150);setInterval(poll,450);setInterval(paintAbilities,80);
 }catch(e){
  if(!current())return;
  $('load-text').textContent='三位伙伴暂未全部就位：'+e.message;
  const b=document.createElement('button');b.textContent='重新连接';b.onclick=()=>{b.remove();boot();};$('load').append(b);
 }
}
boot();
