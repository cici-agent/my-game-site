import {SCENES,INTRO} from './rpg-story.mjs';
import {createCampaign,joinCampaign,advanceCampaign} from './rpg-engine.mjs';
import {renderLibrary} from './rpg-library.mjs';
import {paintScene} from './rpg-art.mjs';
import {createAdventure} from '../../world/adventure.mjs';
import {createPresence} from '../../world/presence.mjs';

const byId=id=>document.getElementById(id);
const dialog=byId('room-dialog'),roomContent=byId('room-content'),journal=byId('journal-dialog');
const chars={'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'};
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>chars[c]);
const button=(label,id,cls='quiet')=>'<button type="button" class="'+cls+'" id="'+id+'">'+esc(label)+'</button>';
const storageKey='hogwarts-new-students-v1';
let book={sessions:{},selected:null};
try{const b=JSON.parse(localStorage.getItem(storageKey));if(b?.sessions)book=b;}catch{}
let session=book.sessions[book.selected],campaign,world,presence,sessionSerial=0,busy=false;
let warning='',noticeTimer,talkTimer,openingTimer,artCleanup,storyTimer,activeTab='items';
function saveBook(){try{localStorage.setItem(storageKey,JSON.stringify(book));}catch{warning='本机存储不可用';}}
function randomToken(){return Array.from(crypto.getRandomValues(new Uint8Array(32)),n=>n.toString(16).padStart(2,'0')).join('');}
function newTraveler(name='新生'){
  const key='solo-'+randomToken().slice(0,16);
  return {key,mode:'solo',memberId:'self',name,opening:0,campaign:joinCampaign(createCampaign(),'self',name)};
}
function titleOf(s){return s?.finished?'第一学年已完成':SCENES[s?.sceneIndex??0].title;}
function notice(text){const n=byId('notice');n.textContent=text;n.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>n.hidden=true,4000);}
function say(who,text,ms=3200){byId('speaker').textContent=who;byId('spoken').textContent=text;byId('speech').hidden=false;clearTimeout(talkTimer);talkTimer=setTimeout(()=>byId('speech').hidden=true,ms);}
function stopOpening(){clearTimeout(openingTimer);}
function arrival(){
  if(session.opening==null||campaign.sceneIndex||campaign.stepIndex||campaign.finished)return;
  session.opening=null;saveBook();
  const cues=['女贞路四号，霍格沃茨的来信塞满了壁炉。','海格在海边小屋把录取通知书递给哈利。','从对角巷返回时，哈利已经有了自己的魔杖。','九月一日。你们推着行李，在车站擦肩而过。'];
  let i=0;
  function next(){
    if(dialog.open||journal.open||byId('world').dataset.hasMoved==='true')return;
    say('入学序章',cues[i++],2400);
    if(i<cues.length)openingTimer=setTimeout(next,2600);
  }
  next();
}
function checkpoint(travel){if(!session)return;session.travel=travel;saveBook();}
function paused(){return dialog.open||journal.open;}
function statusText(label){byId('save-status').textContent=warning||label;}
function setState(next){
  if(!session||next.revision<campaign.revision)return;
  campaign=session.campaign=next;saveBook();
  world?.configure(campaign,session.memberId,session.key,session.travel);
  if(journal.open && activeTab!=='prologue')drawBook(activeTab);
}
function enter(record){
  presence?.dispose();presence=null;world?.applyPeers([]);stopOpening();
  const epoch=++sessionSerial;busy=false;
  session=record;campaign=record.campaign;book.sessions[record.key]=record;book.selected=record.key;saveBook();
  world.configure(campaign,record.memberId,record.key,record.travel);
  byId('team').textContent=record.mode==='party'?'好友队伍 · '+record.code:'好友队伍';
  if(record.mode==='party'){
    statusText('正在连接队友');
    presence=createPresence(record,{
      onPeers:peers=>{if(epoch===sessionSerial)world.applyPeers(peers);},
      onCampaign:data=>{if(epoch===sessionSerial)setState(data);},
      onStatus:status=>{if(epoch===sessionSerial)statusText(status==='online'?'队伍云存档已连接':status==='unauthorized'?'请恢复原角色':'正在重连');}
    });
  } else statusText('个人冒险 · 自动存档');
  arrival();
}
async function act(choiceIndex,revision){
  if(busy)return;busy=true;const current=session,epoch=sessionSerial;
  try{
    let next;
    if(current.mode==='solo')next=advanceCampaign(campaign,current.memberId,revision,choiceIndex);
    else next=(await api('/api/parties/'+current.code+'/actions',{token:current.token,body:{revision,choiceIndex}})).campaign;
    if(epoch!==sessionSerial)return;
    const last=next.lastAction;
    setState(next);
    if(last?.teamReward)say('队伍获得','双人练习缎带',4000);
    else if(next.finished)say('学年结束','你们的第一年已写入冒险手记。',4000);
    else if(last && next.sceneIndex!==last.sceneIndex)notice('已到达下一处 · '+SCENES[next.sceneIndex].place);
  }catch(e){if(epoch===sessionSerial){if(e.campaign)setState(e.campaign);throw e;}}
  finally{if(epoch===sessionSerial)busy=false;}
}
function closeAndPlay(s){if(dialog.open)dialog.close();if(journal.open)journal.close();enter(s);byId('world').focus({preventScroll:true});}
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(path, { method:options.body ? 'POST' : 'GET', cache:'no-store',
      headers:{...(options.token ? {Authorization:'Bearer ' + options.token} : {}), ...(options.body ? {'Content-Type':'application/json'} : {})},
      body: options.body ? JSON.stringify(options.body) : undefined, signal: AbortSignal.timeout(10000) });
  } catch { throw new Error('连接中断。重新连上开队时使用的游戏网址后，可以从同一处继续。'); }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('暂时无法读取好友存档，请重试。'); }
  if (!response.ok) {
    const err = new Error(data.error || '这页没有保存，请重试。');
    err.campaign = data.campaign;
    throw err;
  }
  return data;
}
function partySession(code, token, data) {
  const member = data.campaign?.members[data.memberId];
  if (!member) throw new Error('无法确认角色身份，请检查游戏网址与私密迁移码。');
  const previous = Object.values(book.sessions).find(s => s.mode === 'party' && s.code === code && s.memberId === data.memberId);
  return {
    key:previous?.key || 'party-' + code + '-' + data.memberId,
    mode:'party', name:member.name, token, memberId:data.memberId, code, campaign:data.campaign,
    opening:null, travel:previous?.travel
  };
}
function restoreRole() {
  roomContent.innerHTML = '<p>在原设备的「好友队伍 → 换设备续玩」中取得私密迁移码，再到同一个游戏网址恢复角色。</p>' +
    '<form id="restore-form"><div class="fields"><label class="field">私密迁移码<input id="restore-code" type="password" required maxlength="96" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="粘贴你自己的私密迁移码"></label></div>' +
    '<p class="room-error" role="alert" id="restore-error"></p><div class="actionrow"><button class="primary" id="restore-submit" type="submit">恢复角色</button>' + button('返回','back') + '</div></form>';
  byId('back').onclick = () => room('menu');
  const input = byId('restore-code'), form = byId('restore-form'), submit = byId('restore-submit'), error = byId('restore-error');
  input.focus();
  form.onsubmit = async event => {
    event.preventDefault();
    if (submit.disabled) return;
    const match = /^HW1\.([A-HJ-NP-Z2-9]{8})\.([a-f0-9]{64})$/i.exec(input.value.trim());
    if (!match) { error.textContent = '请粘贴完整的私密迁移码。8 位队伍码用于邀请新角色。'; return; }
    const code = match[1].toUpperCase(), token = match[2].toLowerCase();
    submit.disabled = true; error.textContent = '';
    try {
      const data = await api('/api/parties/' + code, {token});
      if (!dialog.open || !form.isConnected) return;
      const restored = partySession(code, token, data);
      input.value = '';
      closeAndPlay(restored);
      notice('已恢复' + restored.name + '的冒险。');
    } catch (err) { if (form.isConnected) error.textContent = err.message; }
    finally { submit.disabled = false; }
  };
}
function room(mode) {
  stopOpening();
  if (!dialog.open) dialog.showModal();
  byId('room-title').textContent = ({menu:'冒险队伍',solo:'登记新生',create:'创建好友队伍',join:'加入好友队伍',restore:'恢复我的角色'})[mode];
  if (mode === 'restore') return restoreRole();
  if (mode === 'menu') {
    const activeParty = session?.mode === 'party';
    let html = activeParty ? '<p>把队伍码告诉朋友，他们可以从同一游戏网址加入。</p><p class="code">' + esc(session.code) + '</p><p>' +
      Object.values(campaign.members).map(p => esc(p.name)).join('、') + '　·　' + Object.keys(campaign.members).length + ' / 4 人</p>' : '';
    if (activeParty) html += '<details id="private-transfer"><summary>换设备续玩</summary>' +
      '<div class="fields"><label class="field">我的私密迁移码<input id="my-transfer-code" readonly autocomplete="off" spellcheck="false"></label></div>' +
      '<p>点选并复制到你自己的设备；持码者可以使用你的角色。在另一台设备打开同一游戏网址，选择「恢复我的角色」。</p></details>';
    const saved = Object.values(book.sessions).filter(s => s.key !== session?.key);
    if (saved.length) html += '<h3>已有冒险</h3>' + saved.map(s => '<div class="saved-row"><span>' + esc(s.name) + ' · ' + esc(s.code || '个人') + '<br><small>' + esc(titleOf(s.campaign)) + '</small></span><button type="button" class="quiet" data-resume="' + esc(s.key) + '">继续</button></div>').join('');
    html += '<div class="room-actions">' + (button('创建好友队伍','new-room','primary') + button('输入队伍码加入','join-room') + button('恢复我的角色','restore-room')) + button('开始新的个人冒险','new-solo') + '</div>';
    roomContent.innerHTML = html;
    const details = byId('private-transfer');
    if (details) {
      const current = session, field = byId('my-transfer-code');
      details.ontoggle = () => { field.value = details.open ? 'HW1.' + current.code + '.' + current.token : ''; };
      field.onclick = () => field.select();
      field.onfocus = () => field.select();
    }
    roomContent.querySelectorAll('[data-resume]').forEach(b => { b.onclick = () => closeAndPlay(book.sessions[b.dataset.resume]); });
    if (byId('new-room')) byId('new-room').onclick = () => room('create');
    if (byId('join-room')) byId('join-room').onclick = () => room('join');
    if (byId('restore-room')) byId('restore-room').onclick = () => room('restore');
    byId('new-solo').onclick = () => room('solo');
    return;
  }
  roomContent.innerHTML = '<form id="registration"><div class="fields"><label class="field">你的名字<input id="name" required maxlength="20" autocomplete="off" placeholder="同学们怎么称呼你"></label>' +
    (mode === 'join' ? '<label class="field">队伍码<input id="code" required maxlength="8" autocapitalize="characters" autocomplete="off" placeholder="朋友给你的 8 位队伍码"></label>' : '') +
    '</div><p class="room-error" role="alert" id="room-error"></p><div class="actionrow"><button id="register" class="primary" type="submit">' + (mode === 'join' ? '加入队伍' : mode === 'create' ? '建立队伍' : '打开录取通知书') + '</button>' + button('返回','back') + '</div></form>';
  byId('back').onclick = () => room('menu');
  byId('name').focus();
  const form = byId('registration');
  form.onsubmit = async event => {
    event.preventDefault();
    const name = byId('name').value.trim(), code = byId('code')?.value.trim().toUpperCase();
    if (!name) { byId('room-error').textContent = '请先给新生起个名字。'; return; }
    const submit = byId('register');
    submit.disabled = true;
    try {
      if (mode === 'solo') {
        const key = 'solo-' + randomToken().slice(0,16);
        closeAndPlay({key,mode:'solo',name,memberId:'self',campaign:joinCampaign(createCampaign(),'self',name),opening:0});
      } else {
        if (mode === 'join' && !/^[A-HJ-NP-Z2-9]{8}$/.test(code)) throw new Error('请核对朋友给你的 8 位队伍码。');
        const request = JSON.stringify([mode,code,name]);
        if (book.pending?.request !== request) { book.pending = {request,token:randomToken()}; saveBook(); }
        const data = await api(mode === 'create' ? '/api/parties' : '/api/parties/' + code + '/join', {body:{name,clientToken:book.pending.token}});
        const s = partySession(data.code, data.token, data);
        delete book.pending;
        closeAndPlay(s);
        if (mode === 'create') room('menu');
      }
    } catch (err) { if (form.isConnected) byId('room-error').textContent = err.message; }
    finally { submit.disabled = false; }
  };
}
function stopArt(){clearTimeout(storyTimer);artCleanup?.();artCleanup=null;}
function drawBook(tab){
  stopArt();activeTab=tab;const page=byId('book-page');
  byId('book-tabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.book===tab)));
  if(tab==='journal'){
    page.innerHTML='<h2>队伍日志</h2>'+(campaign.history.length?'<ol class="book-log">'+[...campaign.history].reverse().map(e=>{
      const s=SCENES[e.sceneIndex],choice=s.steps[e.stepIndex].choices[e.choiceIndex];
      return '<li><b>'+esc(s.place)+' · '+esc(campaign.members[e.memberId]?.name)+'</b><p>'+esc(choice.result)+'</p></li>';
    }).join('')+'</ol>':'<p>走近站台上的哈利，你们的冒险就会从这里开始记录。</p>');return;
  }
  if(tab==='prologue'){
    let i=0;
    function shot(){
      stopArt();const f=INTRO[i];page.innerHTML='<canvas class="prologue-canvas" aria-label="入学前的回忆"></canvas><h3>'+esc(f.title)+'</h3><p>'+esc(f.text)+'</p><div class="actionrow">'+button(i<INTRO.length-1?'下一幕':'回到车站','turn-frame','primary')+'</div>';
      artCleanup=paintScene(page.querySelector('canvas'),'intro-'+i);
      const next=()=>{if(i<INTRO.length-1){i++;shot();}else journal.close();};
      byId('turn-frame').onclick=next;if(i<INTRO.length-1)storyTimer=setTimeout(next,6000);
    }
    shot();return;
  }
  renderLibrary(page,tab,campaign,session.memberId);
}
byId('team').onclick=()=>room('menu');
byId('open-book').onclick=()=>{stopOpening();journal.showModal();drawBook(activeTab);};
byId('book-tabs').onclick=e=>{const tab=e.target.closest('button')?.dataset.book;if(tab)drawBook(tab);};
journal.addEventListener('close',()=>{stopArt();byId('world').focus({preventScroll:true});});
dialog.addEventListener('close',()=>{if(!dialog.open)roomContent.replaceChildren();byId('world').focus({preventScroll:true});});
document.addEventListener('keydown',e=>{
  if(e.code==='KeyJ'&&!paused()&&!e.repeat){e.preventDefault();byId('open-book').click();}
});
window.addEventListener('storage',e=>{
  if(e.key!==storageKey||!session||busy)return;
  try{const other=JSON.parse(e.newValue)?.sessions?.[session.key];if(other?.campaign.revision>campaign.revision)setState(other.campaign);}catch{}
});
try{
  world=createAdventure({onChoice:act,onPose:pose=>presence?.update(pose),onCheckpoint:checkpoint,say,isPaused:paused});
  if(!session?.campaign?.members?.[session.memberId])session=newTraveler();
  enter(session);byId('loading3d').hidden=true;
  byId('world').focus({preventScroll:true});
}catch(error){
  console.error('3D initialization:',error);
  const n=byId('loading3d');n.classList.add('error');
  n.innerHTML='<span>✦</span><h2>暂时无法进入 3D 场景</h2><p>请开启浏览器的图形加速，或使用支持 WebGL 2 的浏览器重新打开。</p><button class="quiet" id="retry-world">重新载入</button>';
  byId('retry-world').onclick=()=>location.reload();
}
