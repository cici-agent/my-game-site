import { createCastScreen } from './cast-screen.mjs';
import { HEROES } from './adventure-rules.mjs';
import { TALENTS } from './adventure-talents.mjs';
import { SAGA, sagaBoss, sagaStage } from './saga.mjs';
import { openWardrobe } from './wardrobe-studio.mjs';
import { supportsWardrobe } from '../../world/wardrobe.mjs';

const labels={station:'国王十字车站',train:'霍格沃茨特快',lake:'黑湖码头',classroom:'魔咒课教室',corridor:'万圣节走廊',safe:'大礼堂营地',epilogue:'晨光中的大礼堂'};
const el=(s)=>document.querySelector(s);
const esc=x=>String(x??'').replace(/[&<>"']/g,k=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[k]));
const btn=(label,act,cls='quiet')=>'<button type="button" class="'+cls+'" data-action="'+act+'">'+esc(label)+'</button>';
const field=(id,title,opts='')=>'<label class="field">'+title+'<input id="'+id+'" '+opts+'></label>';
const errBox='<p class="ch-error" role="alert" id="ch-error"></p>';
const closeButton=()=>btn('返回游戏','close');
export function makeMenu({state,commands}){
  const panel=el('#chapter-panel');
  let mode='',locked=false;
  const cast=createCastScreen({state,commands,submit:(hero,name)=>commands.enter(hero,name),
    restore:()=>account(true),cancel:()=>close()});
  function stopFilm(){
    if(mode!=='film')return;
    commands.stopOpening();document.body.classList.remove('in-opening');el('#opening-hud').hidden=true;
  }
  function display(page,html){
    if(cast.isOpen())cast.hide();stopFilm();mode=page;panel.innerHTML=html;
    if(!panel.open)panel.showModal();
  }
  function close(){if(cast.isOpen())cast.hide();stopFilm();mode='';if(panel.open)panel.close();el('#world').focus({preventScroll:true});}
  function message(text){const target=el('#ch-error');if(target)target.textContent=text;}
  function picker(){
    stopFilm();mode='picker';if(panel.open)panel.close();cast.show();
  }
  function film(){
    close();mode='film';document.body.classList.add('in-opening');el('#opening-hud').hidden=false;
    el('#opening-skip').onclick=commands.endFilm;el('#opening-skip').focus({preventScroll:true});
    commands.startOpening(caption=>{el('#opening-caption').textContent=caption;},commands.endFilm);
  }
  function team(){
    const {room,code,dungeon,profile}=state();const active=Boolean(code);
    let html='<h2>好友组队</h2>';
    if(room)html+='<p class="ch-invite">同行队伍码　<strong class="code-value">'+esc(room.code)+'</strong></p>'+btn('复制同行邀请','copy-party','ch-link');
    if(active)html+='<p class="ch-invite">本次副本码　<strong class="code-value">'+esc(code)+'</strong></p>'+btn('复制副本邀请','copy-dungeon','ch-link')+'<p>'+esc(Object.values(dungeon?.players||{}).map(m=>m.name||HEROES[m.hero]?.name).join('、'))+'</p>';
    html+='<div class="ch-actions">'+(!active?btn('输入好友的副本码','join-dungeon'):'')+(room?btn('结束同行','depart-party'):btn('创建同行队伍','create-party'))+btn('输入同行队伍码','join-party')+(!active?btn('更换出场学生','switch'):'')+(!active&&profile.cleared.length?btn('副本与训练场','replays'):'')+btn('换设备续玩','account')+(active?btn(dungeon?.status==='active'?'撤离本次战斗（放弃本场奖励）':'返回原章节','leave'):'')+'</div><p>副本最多四人，每人选一名不同的学生。同行队伍用于结伴探索，副本码用于加入指定战斗。</p>'+errBox+'<div class="actionrow">'+closeButton()+'</div>';
    display('team',html);
  }
  function dungeonDoor(kind='troll'){
    const {room}=state(),volume=sagaBoss(kind);
    const title=volume?.boss||'万圣节巨怪';
    const hint=volume?'携带'+volume.spell.name+'入场。'+volume.spell.description:'引它挥棒落空，队友趁机用漂浮咒举起木棒，然后集中攻击。';
    display('door','<h2>'+esc(title)+'</h2><p>'+esc(hint)+'</p><p>推荐三人。开场后把副本码或链接发给朋友，等大家到齐再出手。</p>'+errBox+'<div class="ch-actions">'+btn('开启独立副本','open-'+kind,'primary')+btn('输入好友的副本码','join-dungeon')+(room?btn('查看同行队伍','team'):'')+closeButton()+'</div>');
  }
  function replays(){
    const {profile}=state();
    const doors=[{kind:'troll',boss:'万圣节巨怪'},...SAGA].filter(x=>profile.cleared.includes(x.kind));
    display('replays','<h2>副本与训练场</h2><p>走廊训练每次获胜都能获得经验和印记。结伴重返已通关的副本，可以帮助朋友取得自己的首胜。</p><div class="ch-actions">'+btn('训练场 · 走廊木偶','open-normal')+btn('精英训练 · 盔甲守卫','open-elite')+'</div><h3>已通过的核心副本</h3><div class="ch-actions">'+doors.map(v=>btn(v.boss,'door-'+v.kind)).join('')+closeButton()+'</div>');
  }
  function join(isDungeon,code=''){
    const title=isDungeon?'加入好友的副本':'加入同行队伍';
    display('join','<h2>'+title+'</h2><form id="join-form"><div class="fields">'+field('join-code',isDungeon?'本次副本码':'同行队伍码','maxlength="8" autocomplete="off" autocapitalize="characters" pattern="[A-Za-z2-9]{8}" required')+'</div>'+errBox+'<div class="actionrow"><button class="primary">加入</button>'+btn('返回','team')+'</div></form>');
    el('#join-code').value=code;el('#join-form').onsubmit=e=>{e.preventDefault();run(()=>commands.join(el('#join-code').value.trim().toUpperCase(),isDungeon));};
  }
  function account(restore=false){
    const label=restore?'恢复个人存档':'在另一台设备继续';
    display('account','<h2>'+label+'</h2><p>'+(restore?'粘贴原设备「好友队伍 → 换设备续玩」中的私密恢复码。':'私密恢复码可以找回本人存档。请只在自己的设备上使用；邀请朋友时使用队伍码或副本码。')+'</p><form id="transfer-form"><div class="fields">'+field('transfer-value','私密恢复码','type="password" autocomplete="off" spellcheck="false" '+(restore?'required':'readonly'))+'</div>'+errBox+'<div class="actionrow">'+(restore?'<button class="primary">恢复存档</button>':btn('显示并选中','reveal'))+btn('返回',state().playing?'team':'picker')+'</div></form>');
    if(!restore){el('#transfer-value').value='HW2.'+state().token;el('#transfer-form').onsubmit=e=>e.preventDefault();}
    else el('#transfer-form').onsubmit=e=>{e.preventDefault();run(()=>commands.restore(el('#transfer-value').value.trim()));};
  }
  function journal(){
    const {profile}=state(),h=HEROES[profile.heroId];const skills=profile.skills||[];
    const items=profile.items||[];
    const marks=items.find(item=>item.id==='training-mark')?.count||0;
    const bag='<h3>随身背包</h3>'+(supportsWardrobe(h.id)?btn('打开试衣间','wardrobe'):'')+(items.length?items.map(item=>'<p><b>'+esc(item.name)+' × '+esc(item.count)+'</b>　'+esc(item.description)+'</p>').join(''):'<p>完成魔咒课可获得第一件纪念物。</p>')+
      (marks>=3&&!items.some(item=>item.id==='practice-crest')&&!state().code?btn('用三枚练习印记换取徽章','exchange'):'');
    const options=TALENTS[h.id];
    const bonus=profile.skillPoints>0?'<h3>角色专精</h3><p>'+esc(options.find(x=>x.id===profile.talent)?.name||'尚未分配')+' · 可用 '+esc(profile.availablePoints??profile.skillPoints)+' 点</p>'+
      ((profile.stage==='safe'||profile.stage==='epilogue'||sagaStage(profile.stage))&&!state().code?options.map(x=>'<button class="quiet talent-choice" type="button" data-action="talent" data-talent="'+esc(x.id)+'" aria-pressed="'+String(x.id===profile.talent)+'"><b>'+esc(x.name)+'</b><small>'+esc(x.description)+'</small></button>').join('')+(profile.talent?btn('重置当前角色专精','talent'):''):'<p>走到第二章安全点后可选择专精。</p>'):'';
    const trained=SAGA.filter(v=>skills.includes(v.spell.id)).map(v=>v.spell.name);
    const spells=['基础点射',...(skills.includes('light')?['荧光咒']:[]),...(skills.includes('levitate')?['漂浮咒']:[]),...(skills.includes('special')?[h.active.name]:[]),...trained];
    const records=[{kind:'troll',boss:'万圣节巨怪'},...SAGA].map(v=>'<li>'+esc(v.boss)+'<span>'+(profile.cleared.includes(v.kind)?'已通关':'待挑战')+'</span></li>').join('');
    const training=(profile.growthPoints>0&&!state().code?'<div class="actionrow">'+btn('训练体魄　+6 生命','grow-vitality')+btn('训练专注　+5 专注','grow-focus')+'</div>':'');
    const place=sagaStage(profile.stage)?.place||labels[profile.stage]||'国王十字车站';
    display('journal','<h2>角色与背包</h2><p>'+esc(profile.name)+' · '+esc(h.name)+' · '+esc(place)+'</p><h3>成长</h3><p>等级 '+esc(profile.level)+'　经验 '+esc(profile.xp)+'　技能点 '+esc(profile.skillPoints)+'</p><p>体魄训练 '+esc(profile.growth?.vitality||0)+'　专注训练 '+esc(profile.growth?.focus||0)+'　可用于训练 '+esc(profile.growthPoints||0)+' 点</p>'+training+'<h3>已学技能</h3><p>'+esc(spells.join('、'))+'</p><p>'+esc(h.passive.name)+' · '+esc(h.passive.description)+'</p>'+bonus+bag+'<h3>副本记录</h3><ul class="clears">'+records+'</ul>'+errBox+'<div class="actionrow">'+closeButton()+'</div>');

  }
  async function run(fn){
    if(locked)return;locked=true;message('');
    const old=[...panel.querySelectorAll('button,input')];old.forEach(x=>x.disabled=true);
    try{await fn();}catch(err){message(err.message);if(!panel.open)commands.notice(err.message);}
    finally{locked=false;old.forEach(x=>x.disabled=false);}
  }
  panel.onclick=e=>{
    const act=e.target.closest('[data-action]')?.dataset.action;if(!act||locked)return;
    if(act==='close')close();if(act==='team')team();if(act==='picker')picker();
    if(act==='wardrobe')openWardrobe({variant:state().profile.heroId});
    if(act==='copy-party'||act==='copy-dungeon')run(()=>commands.copyInvite(act==='copy-party'?'party':'dungeon'));
    if(act==='exchange')run(()=>commands.exchange());
    if(act==='talent')run(()=>commands.talent(e.target.closest('button').dataset.talent||null));
    if(act==='switch')run(()=>commands.switchHero());
    if(act==='join-dungeon')join(true);if(act==='join-party')join(false);
    if(act==='create-party')run(()=>commands.createParty());
    if(act==='depart-party')run(()=>commands.departParty());
    if(act.startsWith('open-'))run(()=>commands.createDungeon(act.slice(5)));
    if(act.startsWith('door-'))dungeonDoor(act.slice(5));
    if(act==='replays')replays();
    if(act.startsWith('grow-'))run(()=>commands.growth(act.slice(5)));
    if(act==='leave')run(()=>commands.leave());
    if(act==='account')account();if(act==='restore')account(true);
    if(act==='end-film')commands.endFilm();
    if(act==='reveal'){el('#transfer-value').type='text';el('#transfer-value').select();}
  };
  panel.oncancel=e=>{if(!state().playing||mode==='film')e.preventDefault();};
  panel.addEventListener('close',()=>{if(!panel.open){stopFilm();if(mode==='account')panel.replaceChildren();}});
  function inviteLink(url){
    display('invite','<h2>邀请朋友</h2><div class="fields">'+field('invite-text','复制这个链接','readonly')+'</div>'+btn('返回','team'));
    el('#invite-text').value=url;el('#invite-text').select();
  }
  return {picker,film,close,team,dungeonDoor,join,replays,journal,inviteLink,open:()=>mode==='film'||panel.open||cast.isOpen(),mode:()=>mode,showError:message};
}
