import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import { getPlatformIntro, getPlatformWallAdvice } from '../chapter-one/client/platform-dialogue.mjs';
import {SELECTABLE_HERO_IDS,isSelectableHero} from '../chapter-one/roster.mjs';
import {getHeroStats} from '../chapter-one/rules/index.mjs';
import {resolveAreaId,getWorldArea} from '../chapter-one/world-atlas.mjs';
import {iconMarkup} from '../chapter-one/client/ui-icons.mjs';

// Execute the actual browser session coordinator, replacing only DOM, network
// and renderer boundaries. No regular-expression assertions about its logic.
const source=(await readFile(new URL('../chapter-one/client/app.mjs',import.meta.url),'utf8'))
 .replace(/^import .*;\s*$/gm,'').replace(/^boot\(\);\s*$/m,'');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const tokenA='a'.repeat(64),tokenB='b'.repeat(64);
const character=(id,revision=1)=>({id,heroId:'harry',revision,lastAcceptedMoveSequence:3,level:1,completedQuestIds:[],skills:[],notice:'',currentQuestId:'M01'});
function harness(){
 const nodes=new Map(),storage=new Map([['hogwarts-stone-v1',JSON.stringify({token:tokenA,characterId:'A'})]]),callbacks=new Map(),requests=[],snapshots=[],choices=[],preparations=[],stages=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,hidden:false,textContent:'',innerHTML:'',style:{},dataset:{},classList:{toggle(){}},setAttribute(name,value){this[name]=String(value);},getAttribute(name){return this[name]??null;},focus(){this.focused=true;},value:'',disabled:false,addEventListener(type,fn){callbacks.set(`${id}:${type}`,fn);},querySelector(selector){return node(`${id}:${selector}`);},querySelectorAll(selector){return id==='quick-menu'&&selector==='button[data-panel]'?['character','inventory','skills','map'].map(panel=>{const button=node(`${id}:${panel}`);button.dataset.panel=panel;return button;}):[];},insertAdjacentHTML(where,html){this.innerHTML=where==='afterbegin'?html+this.innerHTML:this.innerHTML+html;},append(){},remove(){}});return nodes.get(id);};
 const context=vm.createContext({getPlatformIntro,getPlatformWallAdvice,resolveAreaId,getWorldArea,SELECTABLE_HERO_IDS,isSelectableHero,getHeroStats,iconMarkup,crypto,URL,AbortSignal,performance,console,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},
  location:{href:'https://game.test/stone.html',origin:'https://game.test'},navigator:{clipboard:{writeText:async()=>{}}},
  document:{getElementById:node,addEventListener(type,fn){const key=`document:${type}`;callbacks.set(key,[...(callbacks.get(key)??[]),fn]);},createElement:tag=>node(tag)},
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
  createSound:()=>({muted:false,mix:{master:.65,music:.45,ambience:.5,effects:.75},status:{state:'locked',muted:false},setScene(){},updateMotion(){},setMix(value){Object.assign(this.mix,value);},unlock(){this.status={state:'running',muted:this.muted};},consume(){},cue(){},setMuted(value){this.muted=value;this.status={state:value?'muted':'running',muted:value};}}),
  fetch:(url,options)=>{const pending=deferred();requests.push({url,options,...pending});return pending.promise;},
  __renderer:{setSnapshot(...args){const pending=deferred();snapshots.push({args,...pending});return pending.promise;},setBlocked(){},selectionStage(hero){stages.push(hero);},chooseHero(hero){choices.push(hero);return Promise.resolve();},prepareSelection(hero){const pending=deferred();preparations.push({hero,...pending});return pending.promise;}},
  __paints:0,
 });
 vm.runInContext(source+`
 world=__renderer; paintHud=()=>{__paints++;};
 globalThis.__session={act,accept,poll,sendMove,onWorldAction,choose,boot,enter,returnToSelection,paintFlight,paintMouseLook,paintJourney,showPanel,closePanel,toggleSound,changeVolume,
  pose(value){latestPose=value;},
  ready(){selectionReady=true;playing=false;$('load').hidden=true;},
  switchIdentity(token,next){epoch++;saved={token,characterId:next?.id};character=next;playing=!!next;persist();},
  pendingAction(body){saved.pendingAction={characterId:character.id,body};persist();},
  state(){return {saved:structuredClone(saved),character:character&&structuredClone(character),pending,epoch,pollBusy,selected,selectionReady,entryBusy,playing,returnBusy,movementRetry,panel};}
 };`,context);
 // Supply structuredClone after context creation to keep browser-shaped values.
 context.structuredClone=structuredClone;context.createStoneWorld=()=>context.__renderer;
 return{context,session:context.__session,requests,snapshots,storage,nodes,choices,preparations,stages,callbacks};
}
const reply=data=>({ok:true,status:200,json:async()=>data});
async function until(predicate){for(let i=0;i<20&&!predicate();i++)await Promise.resolve();assert(predicate(),'asynchronous session operation did not reach the expected boundary');}

test('late action response cannot replace the character or recovery token after identity switch',async()=>{
 const h=harness();h.session.switchIdentity(tokenA,character('A'));
 const running=h.session.act({type:'interact',targetId:'M01-1'});await Promise.resolve();
 assert.equal(h.requests.length,1);assert.equal(h.requests[0].options.headers.Authorization,`Bearer ${tokenA}`);
 h.session.switchIdentity(tokenB,character('B'));
 h.requests[0].resolve(reply({character:character('A',2),scene:{serverTime:1},room:null,encounter:null}));await running;
 const state=h.session.state();assert.equal(state.character.id,'B');assert.equal(state.saved.token,tokenB);assert.equal(state.saved.characterId,'B');assert.equal(state.pending,0);assert.equal(h.snapshots.length,0);
 assert.equal(JSON.parse(h.storage.get('hogwarts-stone-v1')).characterId,'B');
});

test('identity switch during renderer loading cannot persist the old accepted character',async()=>{
 const h=harness();h.session.switchIdentity(tokenA,character('A'));
 const running=h.session.accept({character:character('A',2),scene:{serverTime:1},room:null,encounter:null});
 assert.equal(h.snapshots.length,1);
 h.session.switchIdentity(tokenB,character('B'));
 h.snapshots[0].resolve();await running;
 const state=h.session.state();assert.equal(state.character.id,'B');assert.equal(state.saved.token,tokenB);assert.equal(state.saved.characterId,'B');assert.equal(h.context.__paints,0);
 assert.equal(JSON.parse(h.storage.get('hogwarts-stone-v1')).characterId,'B');
});

test('late poll response cannot repaint or retry actions from the previous identity',async()=>{
 const h=harness();h.session.switchIdentity(tokenA,character('A'));
 const running=h.session.poll();assert.equal(h.requests.length,1);
 h.session.switchIdentity(tokenB,character('B'));
 h.requests[0].resolve(reply({character:character('A',2),scene:{serverTime:1},room:null,encounter:null}));await running;
 assert.equal(h.session.state().character.id,'B');assert.equal(h.session.state().saved.characterId,'B');assert.equal(h.snapshots.length,0);assert.equal(h.requests.length,1);assert.equal(h.session.state().pollBusy,false);
});

test('current-identity response still renders and saves its confirmed revision',async()=>{
 const h=harness();h.session.switchIdentity(tokenA,character('A'));
 const running=h.session.act({type:'interact',targetId:'M01-1'});await until(()=>h.requests.length===1);
 h.requests[0].resolve(reply({character:character('A',2),scene:{serverTime:1},room:null,encounter:null}));await until(()=>h.snapshots.length===1);
 h.snapshots[0].resolve();await running;
 assert.equal(h.session.state().character.revision,2);assert.equal(h.session.state().saved.characterId,'A');assert.equal(h.context.__paints,1);
});

test('a terminal pending-action rejection is cleared instead of retried forever',async()=>{
 const h=harness();h.session.switchIdentity(tokenA,character('A'));h.session.pendingAction({type:'interact',targetId:'old-target',requestId:'retry-terminal-action'});
 const running=h.session.poll();h.requests[0].resolve(reply({character:character('A',2),scene:{serverTime:1},room:null,encounter:null}));await until(()=>h.snapshots.length===1);
 h.snapshots[0].resolve();await until(()=>h.requests.length===2);
 const sent=JSON.parse(h.requests[1].options.body);assert.equal(sent.requestId,'retry-terminal-action');
 h.requests[1].resolve({ok:false,status:409,json:async()=>({code:'INVALID_TARGET',error:'Target no longer current'})});await running;
 assert.equal(h.session.state().saved.pendingAction,undefined);assert.equal(h.session.state().character.id,'A');assert.equal(h.session.state().pollBusy,false);
});

test('another party member battle cannot replace exploration, while a participating battle still renders',async()=>{
 const h=harness();h.session.switchIdentity(tokenA,character('A'));
 const peerBattle={id:'peer-boss',status:'active',players:{B:{id:'B',hp:500}}};
 const explore=h.session.accept({character:character('A',2),scene:{sceneId:'SC04',serverTime:1},room:{code:'PARTY123',encounter:peerBattle},encounter:null});
 assert.equal(h.snapshots.length,1);assert.equal(h.snapshots[0].args[2].sceneId,'SC04');assert.equal(h.snapshots[0].args[1].encounter,null);assert.equal(h.snapshots[0].args[0].encounter,null);
 h.snapshots[0].resolve();await explore;
 const ownBattle={id:'own-boss',status:'active',players:{A:{id:'A',hp:500},B:{id:'B',hp:500}}};
 const fighting=h.session.accept({character:character('A',3),scene:{sceneId:'SC13',serverTime:2},room:{code:'PARTY123',encounter:ownBattle},encounter:ownBattle});
 assert.equal(h.snapshots.length,2);assert.equal(h.snapshots[1].args[2].sceneId,'SC13');assert.equal(h.snapshots[1].args[1].encounter.id,'own-boss');assert.equal(h.snapshots[1].args[1].encounter.players.A.id,'A');
 h.snapshots[1].resolve();await fighting;assert.equal(h.session.state().character.revision,3);assert.equal(h.context.__paints,2);
});


test('ready roster switches never re-open loading, fetch accounts or rebuild the selection scene',async()=>{
 const h=harness();h.session.ready();h.nodes.get('load').hidden=true;
 for(const panel of ['character','inventory','skills','map']){const button=h.nodes.get(`quick-menu:${panel}`);assert.equal(button.dataset.panel,panel);assert.match(button.innerHTML,/<svg/,'real icon initialization executes against the menu DOM boundary');}
 for(const hero of ['ron','hermione','harry','ron','hermione'])await h.session.choose(hero);
 assert.deepEqual(h.choices,['ron','hermione','harry','ron','hermione']);
 assert.equal(h.nodes.get('load').hidden,true);assert.equal(h.requests.length,0);assert.equal(h.preparations.length,0);assert.equal(h.stages.length,0);
 assert.equal(h.session.state().selected,'hermione');assert.match(h.nodes.get('hero-info').innerHTML,/漂浮咒/);
 assert.doesNotMatch(h.nodes.get('hero-picker').innerHTML,/纳威|乔治|neville|george/);
 assert.equal((h.nodes.get('hero-picker').innerHTML.match(/data-hero=/g)??[]).length,3);
});

test('removed templates and a blocked entry cannot change the presented hero',async()=>{
 const h=harness();h.session.ready();await h.session.choose('neville');await h.session.choose('george');
 assert.equal(h.session.state().selected,'harry');assert.equal(h.choices.length,0);
 h.session.switchIdentity(tokenA,character('A'));await h.session.choose('ron');assert.equal(h.choices.length,0);
});

test('startup prepares the three-person stage alongside account loading and ignores retired last selection',async()=>{
 const h=harness(),run=h.session.boot();
 assert.equal(h.preparations.length,1);assert.equal(h.requests.length,1);assert.equal(h.preparations[0].hero,'harry');
 h.requests[0].resolve(reply({account:{characters:[{id:'A',heroId:'neville',name:'Old save',level:18}]}}));
 h.preparations[0].resolve();await run;
 assert.equal(h.session.state().selected,'harry');assert.equal(h.session.state().selectionReady,true);
 assert.equal(h.nodes.get('load').hidden,true);assert.equal(h.nodes.get('enter-game').disabled,false);
 assert.equal(JSON.parse(h.storage.get('hogwarts-stone-v1')).characterId,'A','old save reference is not destroyed');
 assert.doesNotMatch(h.nodes.get('hero-picker').innerHTML,/neville|george/);
});

test('a late account response from a failed startup cannot replace the choice made after retry',async()=>{
 const h=harness(),failed=h.session.boot();
 h.preparations[0].reject(new Error('model transport interrupted'));await failed;
 const retry=h.session.boot();h.preparations[1].resolve();
 h.requests[1].resolve(reply({account:{characters:[]}}));await retry;
 await h.session.choose('ron');
 h.requests[0].resolve(reply({account:{characters:[{id:'A',heroId:'harry',name:'Old account response',level:1}]}}));
 for(let i=0;i<12;i++)await Promise.resolve();
 assert.equal(h.session.state().selected,'ron');assert.equal(h.choices.at(-1),'ron');
 assert.match(h.nodes.get('hero-info').innerHTML,/罗恩·韦斯莱/);
 assert.equal(h.nodes.get('load').hidden,true);assert.equal(h.session.state().selectionReady,true);
});

test('a spell waiting for movement confirmation cannot be sent by the next selected character',async()=>{
 const h=harness();h.session.switchIdentity(tokenA,character('A'));
 h.session.pose({x:0,y:0,z:0,yaw:0});
 const moving=h.session.sendMove();
 const casting=h.session.onWorldAction({type:'skill',skillId:'bolt'});
 assert.equal(h.requests.length,1);assert.match(h.requests[0].url,/characters\/A\/actions$/);
 assert.equal(JSON.parse(h.requests[0].options.body).type,'move');
 h.session.switchIdentity(tokenA,{...character('B'),heroId:'ron'});
 h.requests[0].resolve(reply({character:character('A',2),scene:{serverTime:1}}));await moving;await casting;
 assert.equal(h.requests.length,1,'the old input must not issue a new character action');
 assert.equal(h.snapshots.length,0);assert.equal(h.session.state().character.id,'B');
});


test('return to selection retains the current save, uses the resident stage and allows another hero',async()=>{
 const h=harness();h.session.ready();h.session.switchIdentity(tokenA,{...character('A',9),name:'Saved Harry',level:12});
 const returning=h.session.returnToSelection();await until(()=>h.requests.length===1);
 assert.equal(h.session.state().playing,false);assert.equal(h.session.state().character,null);
 assert.deepEqual(h.stages,['harry']);assert.equal(h.nodes.get('load').hidden,true);
 assert.equal(h.nodes.get('hud').hidden,true);assert.equal(h.nodes.get('return-selection-shortcut').hidden,true);
 assert.match(h.nodes.get('character-slots').innerHTML,/Saved Harry.*Lv.12/);
 assert.equal(h.session.state().saved.token,tokenA);assert.equal(h.session.state().saved.characterId,'A');
 h.requests[0].resolve(reply({account:{characters:[{...character('A',9),name:'Saved Harry',level:12}]}}));await returning;
 await h.session.choose('ron');assert.equal(h.session.state().selected,'ron');assert.deepEqual(h.choices,['ron']);
 assert.equal(h.preparations.length,0);assert.equal(h.requests.length,1,'selecting another model needs no network reload');
});

test('return waits for an outstanding reward write before exposing character selection',async()=>{
 const h=harness();h.session.ready();h.session.switchIdentity(tokenA,character('A'));
 const action=h.session.act({type:'interact',targetId:'reward'});await until(()=>h.requests.length===1);
 const returning=h.session.returnToSelection();await Promise.resolve();assert.equal(h.stages.length,0);
 h.requests[0].resolve(reply({character:{...character('A',2),name:'Reward saved',level:2},scene:{serverTime:1}}));
 await until(()=>h.snapshots.length===1);h.snapshots[0].resolve();await action;
 await until(()=>h.requests.length===2);assert.match(h.nodes.get('character-slots').innerHTML,/Reward saved.*Lv.2/);
 h.requests[1].resolve(reply({account:{characters:[{...character('A',2),name:'Reward saved',level:2}]}}));await returning;
 assert.equal(h.session.state().saved.characterId,'A');assert.equal(h.session.state().saved.pendingAction,undefined);
});

test('a lost final movement response keeps the session and retries the same move before returning',async()=>{
 const h=harness();h.session.ready();h.session.switchIdentity(tokenA,character('A'));h.session.pose({x:2,y:0,z:1,yaw:0});
 const failed=h.session.returnToSelection();await until(()=>h.requests.length===1);
 const firstBody=JSON.parse(h.requests[0].options.body);h.requests[0].reject(new Error('offline'));await failed;
 assert.equal(h.session.state().playing,true);assert.equal(h.session.state().character.id,'A');assert.equal(h.stages.length,0);
 assert.equal(h.session.state().movementRetry.body.requestId,firstBody.requestId);
 const retry=h.session.returnToSelection();await until(()=>h.requests.length===2);
 assert.equal(JSON.parse(h.requests[1].options.body).requestId,firstBody.requestId);
 h.requests[1].resolve(reply({character:{...character('A',2),name:'Saved Harry'},scene:{serverTime:1}}));
 await until(()=>h.snapshots.length===1);h.snapshots[0].resolve();await until(()=>h.requests.length===3);
 h.requests[2].resolve(reply({account:{characters:[{...character('A',2),name:'Saved Harry'}]}}));await retry;
 assert.equal(h.session.state().playing,false);assert.equal(h.session.state().movementRetry,null);assert.deepEqual(h.stages,['harry']);
});

test('flight guidance shows explicit ascent, descent and landing without opening a panel',()=>{
 const h=harness();h.session.switchIdentity(tokenA,character('A'));
 h.session.paintFlight({available:true,mode:'flying',height:2.2});
 assert.equal(h.nodes.get('flight-hud').hidden,false);assert.match(h.nodes.get('flight-instruction').textContent,/空格 上升.*Z \/ Ctrl 下降.*X 自动降落/);
 assert.equal(h.nodes.get('flight-height').textContent,'离地 2.2 米');
 h.session.paintFlight({available:true,mode:'landing',height:.5});assert.match(h.nodes.get('flight-instruction').textContent,/落地.*路点.*自动继续/);assert.doesNotMatch(h.nodes.get('flight-instruction').textContent,/按 E/,'landing checkpoints advance automatically');
 h.session.paintFlight({available:false,mode:'grounded',height:0});assert.equal(h.nodes.get('flight-hud').hidden,true);
});


test('audio preferences persist without changing the character or its save credential',async()=>{
 const h=harness();h.session.switchIdentity(tokenA,character('A',5));
 h.session.changeVolume('music',23);h.session.changeVolume('effects',81);
 let saved=JSON.parse(h.storage.get('hogwarts-stone-v1'));assert.equal(saved.audioMix.music,.23);assert.equal(saved.audioMix.effects,.81);assert.equal(saved.token,tokenA);assert.equal(saved.characterId,'A');
 await h.session.toggleSound();saved=JSON.parse(h.storage.get('hogwarts-stone-v1'));assert.equal(saved.muted,true);
 await h.session.toggleSound();saved=JSON.parse(h.storage.get('hogwarts-stone-v1'));assert.equal(saved.muted,false);assert.equal(saved.audioMix.music,.23);assert.equal(h.session.state().character.revision,5);assert.equal(h.requests.length,0);
});

test('first explicit sound click unlocks audio instead of immediately muting it',async()=>{
 const h=harness();await h.session.toggleSound();const saved=JSON.parse(h.storage.get('hogwarts-stone-v1'));assert.equal(saved.muted,false);assert.equal(h.nodes.get('sound-toggle').textContent,'声音已开');
});

const stationAction={type:'interact',targetId:'M01-1'};
const stationView=(index=0,serverTime=100)=>({sceneId:'SC01',areaId:'SC01',serverTime,quest:{id:'M01',npc:'韦斯莱夫人'},targets:[{id:`M01-${index+1}`,kind:index?'move':'escort',position:{x:0,y:0,z:-11.4},active:true}],escort:index?null:{targetId:'M01-1',npc:'韦斯莱夫人',kind:'escort',awaitingStart:true,startedAt:null,progress:0}});
async function acceptStation(h,c,scene){
 const count=h.snapshots.length,running=h.session.accept({character:c,scene,room:null});
 await until(()=>h.snapshots.length===count+1);h.snapshots.at(-1).resolve();await running;
}
async function stationSession(){
 const h=harness(),c={...character('A'),sceneId:'SC01',areaId:'SC01',objectiveIndex:0,position:{x:0,y:0,z:5,yaw:0}};
 h.session.switchIdentity(tokenA,c);h.context.document.getElementById('film').hidden=true;
 await acceptStation(h,c,stationView());return h;
}
async function clickDocumentButton(h,dataset){
 const button={id:'dialogue-action',tagName:'BUTTON',dataset,disabled:false,closest(selector){return selector==='button'?this:null;}};
 for(const handler of h.callbacks.get('document:click')??[])await handler({target:button});
}
function pressEscape(h){
 const event={code:'Escape',repeat:false,target:{tagName:'CANVAS'},defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};
 for(const handler of h.callbacks.get('document:keydown')??[])handler(event);
 return event;
}

test('the real station UI asks about the ticket before sending one confirmed escort action',async()=>{
 const h=await stationSession(),blocks=[];h.context.__renderer.setBlocked=value=>blocks.push(value);
 await h.session.onWorldAction(stationAction);
 assert.equal(h.requests.length,0,'opening the conversation must not start the server escort');
 assert.equal(h.session.state().panel,'platform-intro');assert.equal(h.nodes.get('panel-backdrop').hidden,false);
 assert.match(h.nodes.get('panel-content').innerHTML,/车票.*九又四分之三/);
 assert.match(h.nodes.get('panel-content').innerHTML,/韦斯莱夫人/);
 assert.equal(h.nodes.get('panel-content:[data-platform-confirm]').focused,true);
 const confirming=clickDocumentButton(h,{platformConfirm:'true'});await until(()=>h.requests.length===1);
 const body=JSON.parse(h.requests[0].options.body);
 assert.equal(body.type,'interact');assert.equal(body.targetId,'M01-1');assert.equal(typeof body.requestId,'string');
 assert.equal('skipIntro' in body,false,'the local recursion guard must never become a server input');
 assert.equal('target' in body,false);assert.equal(h.session.state().panel,null);assert.deepEqual(blocks,[true,false]);
 h.requests[0].resolve(reply({character:{...h.session.state().character,revision:2,escort:{targetId:'M01-1',startedAt:100}},scene:{...stationView(),escort:{...stationView().escort,awaitingStart:false,startedAt:100}}}));
 await until(()=>h.snapshots.length===2);h.snapshots[1].resolve();await confirming;
 assert.equal(h.requests.length,1);assert.equal(h.session.state().saved.pendingAction,undefined);
});

for(const dismissal of ['cancel-button','Escape','close-button'])test(`the real station ${dismissal} cancels without starting and permits asking again`,async()=>{
 const h=await stationSession(),before=h.session.state().character;
 await h.session.onWorldAction(stationAction);assert.equal(h.session.state().panel,'platform-intro');
 if(dismissal==='cancel-button')await clickDocumentButton(h,{platformCancel:'true'});
 else if(dismissal==='Escape')pressEscape(h);
 else h.callbacks.get('close-panel:click')();
 assert.equal(h.session.state().panel,null);assert.equal(h.nodes.get('panel-backdrop').hidden,true);
 assert.equal(h.requests.length,0);assert.deepEqual(h.session.state().character,before);
 await h.session.onWorldAction(stationAction);assert.equal(h.session.state().panel,'platform-intro');assert.equal(h.requests.length,0);
});

for(const ordering of ['keydown-first','pointerlockchange-first'])test(`app Escape consumes ${ordering} mouse release before clearing targets or opening settings`,()=>{
 const h=harness();h.session.switchIdentity(tokenA,character('A'));h.context.document.getElementById('film').hidden=true;
 let released=0,cleared=0;
 h.context.__renderer.getMouseLookState=()=>({mode:ordering==='keydown-first'?'locked':'free',locked:ordering==='keydown-first',canCapture:true});
 // The renderer boundary reports a live lock or its one-shot release receipt.
 // Real browser event-order handling is covered by the mouse-look controller suite.
 h.context.__renderer.releaseMouseLook=()=>{released++;return true;};
 h.context.__renderer.clearTarget=()=>{cleared++;return true;};
 const event=pressEscape(h);assert.equal(event.defaultPrevented,true);assert.equal(released,1);assert.equal(cleared,0);
 assert.equal(h.session.state().panel,null);assert.equal(h.requests.length,0);
});

test('accepted arrival gives the brick-wall advice automatically and ordinary polls do not repeat it',async()=>{
 const h=await stationSession(),paragraph=h.context.document.getElementById('dialogue').querySelector('p');let writes=0,text='';
 Object.defineProperty(paragraph,'textContent',{get:()=>text,set(value){writes++;text=value;},configurable:true});
 const next={...h.session.state().character,objectiveIndex:1,revision:2};
 await acceptStation(h,next,stationView(1,200));assert.equal(h.nodes.get('dialogue').hidden,false);
 assert.equal(h.nodes.get('dialogue:strong').textContent,'韦斯莱夫人');assert.match(text,/9 号.*10 号.*砖墙.*穿过去/);assert.equal(writes,1);
 await acceptStation(h,{...next,revision:3},stationView(1,300));assert.equal(writes,1);assert.equal(h.requests.length,0,'advice is presentation, not an extra interaction');
});

test('the actual mouse-look HUD reflects capture and hides behind the station conversation',async()=>{
 const h=await stationSession();
 h.session.paintMouseLook({mode:'free',locked:false,canCapture:true});assert.equal(h.nodes.get('mouse-look').hidden,false);assert.equal(h.nodes.get('mouse-look-toggle').disabled,false);assert.match(h.nodes.get('mouse-look-hint').textContent,/点击画面或按钮/);
 h.session.paintMouseLook({mode:'locked',locked:true,canCapture:true});assert.equal(h.nodes.get('mouse-look-toggle').getAttribute('aria-pressed'),'true');assert.match(h.nodes.get('mouse-look-hint').textContent,/移动鼠标转向.*Esc/);
 await h.session.onWorldAction(stationAction);assert.equal(h.nodes.get('mouse-look').hidden,true);assert.equal(h.nodes.get('panel').dataset.view,'platform-intro');
});

for(const ending of ['free','panel','film'])test(`a transport wait releases and blocks control, then restores the ${ending} UI state without recapturing`,async()=>{
 const h=await stationSession(),blocks=[];let locked=true,releases=0,captures=0;
 Object.assign(h.context.__renderer,{
  getPose:()=>({x:0,y:0,z:0,yaw:0}),
  setBlocked(value){blocks.push(value);},
  releaseMouseLook(){const owned=locked;locked=false;releases++;return owned;},
  requestMouseLook(){captures++;locked=true;return true;},
  getMouseLookState:()=>({mode:locked?'locked':'free',locked,canCapture:true}),
 });
 h.session.paintMouseLook(h.context.__renderer.getMouseLookState());
 h.session.paintJourney({active:true,label:'返回校园',progress:.15});
 assert.equal(locked,false);assert.equal(releases,1);assert.equal(blocks.at(-1),true);
 assert.equal(h.nodes.get('mouse-look').hidden,true);assert.equal(h.nodes.get('journey-status').hidden,false);
 h.session.closePanel();assert.equal(blocks.at(-1),true,'closing another panel must not unlock an active transport wait');
 if(ending==='panel')h.session.showPanel('settings');
 if(ending==='film')h.nodes.get('film').hidden=false;
 h.session.paintJourney({active:false});
 assert.equal(blocks.at(-1),ending!=='free');assert.equal(captures,0,'transport completion never takes ownership of the mouse');
 assert.equal(h.nodes.get('mouse-look').hidden,ending!=='free');assert.equal(h.nodes.get('journey-status').hidden,true);
 assert.equal(h.requests.length,0);
});
