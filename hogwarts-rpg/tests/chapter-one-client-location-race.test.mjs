import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
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
 const nodes=new Map(),storage=new Map([['hogwarts-stone-v1',JSON.stringify({token:tokenA,characterId:'A'})]]),callbacks=new Map(),requests=[],snapshots=[],choices=[],preparations=[],stages=[],rejections=[];
 const node=id=>{if(!nodes.has(id))nodes.set(id,{id,hidden:false,textContent:'',innerHTML:'',style:{},dataset:{},classList:{toggle(){}},value:'',disabled:false,addEventListener(type,fn){callbacks.set(`${id}:${type}`,fn);},querySelector(selector){return node(`${id}:${selector}`);},querySelectorAll(selector){return id==='quick-menu'&&selector==='button[data-panel]'?['character','inventory','skills','map'].map(panel=>{const button=node(`${id}:${panel}`);button.dataset.panel=panel;return button;}):[];},insertAdjacentHTML(where,html){this.innerHTML=where==='afterbegin'?html+this.innerHTML:this.innerHTML+html;},append(){},remove(){}});return nodes.get(id);};
 const context=vm.createContext({resolveAreaId,getWorldArea,SELECTABLE_HERO_IDS,isSelectableHero,getHeroStats,iconMarkup,crypto,URL,AbortSignal,performance,console,setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},
  location:{href:'https://game.test/stone.html',origin:'https://game.test'},navigator:{clipboard:{writeText:async()=>{}}},
  document:{getElementById:node,addEventListener(type,fn){const key=`document:${type}`;callbacks.set(key,[...(callbacks.get(key)??[]),fn]);},createElement:tag=>node(tag)},
  localStorage:{getItem:key=>storage.get(key)??null,setItem:(key,value)=>storage.set(key,value)},
  createSound:()=>({muted:false,mix:{master:.65,music:.45,ambience:.5,effects:.75},status:{state:'locked',muted:false},setScene(){},updateMotion(){},setMix(value){Object.assign(this.mix,value);},unlock(){this.status={state:'running',muted:this.muted};},consume(){},cue(){},setMuted(value){this.muted=value;this.status={state:value?'muted':'running',muted:value};}}),
  fetch:(url,options)=>{const pending=deferred();requests.push({url,options,...pending});return pending.promise;},
  __renderer:{rejectMovement(...args){rejections.push(args);},setSnapshot(...args){const pending=deferred();snapshots.push({args,...pending});return pending.promise;},setBlocked(){},selectionStage(hero){stages.push(hero);},chooseHero(hero){choices.push(hero);return Promise.resolve();},prepareSelection(hero){const pending=deferred();preparations.push({hero,...pending});return pending.promise;}},
  __paints:0,
 });
 vm.runInContext(source+`
 world=__renderer; paintHud=()=>{__paints++;};
 __renderer.takeMovementPacket=()=>latestPose?{areaId:resolveAreaId(character),locationEpoch:character.locationEpoch??0,position:{...latestPose},steps:[],sprint:false,flying:false}:null;
 globalThis.__session={act,accept,poll,sendMove,onWorldAction,choose,boot,enter,returnToSelection,paintFlight,toggleSound,changeVolume,
  pose(value){latestPose=value;},
  ready(){selectionReady=true;playing=false;$('load').hidden=true;},
  switchIdentity(token,next){epoch++;saved={token,characterId:next?.id};character=next;playing=!!next;persist();},
  pendingAction(body){saved.pendingAction={characterId:character.id,body};persist();},
  state(){return {saved:structuredClone(saved),character:character&&structuredClone(character),pending,epoch,pollBusy,selected,selectionReady,entryBusy,playing,returnBusy,movementRetry};}
 };`,context);
 // Supply structuredClone after context creation to keep browser-shaped values.
 context.structuredClone=structuredClone;context.createStoneWorld=()=>context.__renderer;
 return{context,session:context.__session,requests,snapshots,storage,nodes,choices,preparations,stages,rejections};
}
const reply=data=>({ok:true,status:200,json:async()=>data});
async function until(predicate){for(let i=0;i<20&&!predicate();i++)await Promise.resolve();assert(predicate(),'asynchronous session operation did not reach the expected boundary');}


const locationCharacter=(areaId,locationEpoch,revision=1)=>({...character('A',revision),areaId,sceneId:getWorldArea(areaId).sceneId,locationEpoch,position:{...getWorldArea(areaId).spawn}});
const acceptLocation=async(h,c)=>{const run=h.session.accept({character:c,scene:{sceneId:c.sceneId,serverTime:1},room:null,encounter:null});h.snapshots.at(-1).resolve();await run;};

test('a location rejection never reconciles new-area coordinates inside the previous area',async()=>{
 const h=harness(),old=locationCharacter('SC01',4);h.session.switchIdentity(tokenA,old);h.session.pose({...old.position,z:-10.9});
 const move=h.session.sendMove();await until(()=>h.requests.length===1);const body=JSON.parse(h.requests[0].options.body);
 h.requests[0].resolve({ok:false,status:409,json:async()=>({code:'LOCATION_CHANGED',error:'Location changed',rejectedSequence:body.sequence,rejectedPosition:{x:0,y:0,z:12.6,yaw:0},location:{areaId:'LONDON_PLATFORM',sceneId:'LONDON_PLATFORM',locationEpoch:5,position:{x:0,y:0,z:12.6,yaw:0}}})});
 // A location refresh may start a follow-up GET. It need not finish to establish
 // that the previous controller did not receive a foreign coordinate correction.
 for(let i=0;i<20;i++)await Promise.resolve();
 assert.equal(h.rejections.length,0,'LOCATION_CHANGED must refresh location, not pass the next area position to old movement history');
 await until(()=>h.requests.length===2);assert.equal(h.requests[1].options.method,'GET');
 const next=locationCharacter('LONDON_PLATFORM',5,2);h.requests[1].resolve(reply({character:next,scene:{sceneId:next.sceneId,serverTime:2}}));
 await until(()=>h.snapshots.length===1);h.snapshots[0].resolve();await move;await until(()=>!h.session.state().pollBusy);
 assert.equal(h.session.state().character.areaId,'LONDON_PLATFORM');
});

test('a delayed old-area network failure cannot restore a retry after a newer location was accepted',async()=>{
 const h=harness(),old=locationCharacter('SC01',4);h.session.switchIdentity(tokenA,old);h.session.pose({...old.position,z:-10.9});
 const move=h.session.sendMove();await until(()=>h.requests.length===1);
 await acceptLocation(h,locationCharacter('LONDON_PLATFORM',5,2));
 h.requests[0].reject(new Error('lost previous-area reply'));await move;
 assert.equal(h.session.state().movementRetry,null,'old scope retries were cleared by accept and cannot be resurrected by a late catch');
 assert.equal(h.session.state().character.areaId,'LONDON_PLATFORM');
});

test('an old doorway action waiting on movement cannot be reissued from the next area',async()=>{
 const h=harness(),old=locationCharacter('SC01',4);h.session.switchIdentity(tokenA,old);h.session.pose({...old.position,z:-10.9});
 const move=h.session.sendMove();await until(()=>h.requests.length===1);
 const passage=h.session.onWorldAction({type:'travel',fromAreaId:'SC01',locationEpoch:4,target:{edgeId:'SC01>LONDON_PLATFORM@0,0,-11.4',travelKind:'walk',label:'Platform'}});
 await acceptLocation(h,locationCharacter('LONDON_PLATFORM',5,3));
 h.requests[0].resolve(reply({character:locationCharacter('SC01',4,2),scene:{sceneId:'SC01',serverTime:1}}));await move;
 for(let i=0;i<20;i++)await Promise.resolve();
 assert.equal(h.requests.filter(request=>request.options.method==='POST'&&JSON.parse(request.options.body).type==='travel').length,0,'the original edge input must retain its source location and expire at an area change');
 await passage;
});

const stationDoor={type:'travel',fromAreaId:'SC01',locationEpoch:4,target:{edgeId:'SC01>LONDON_PLATFORM@0,0,-11.4',travelKind:'walk',label:'Platform'}};

test('a successful doorway response settles normally after its own location change',async()=>{
 const h=harness(),old=locationCharacter('SC01',4);h.session.switchIdentity(tokenA,old);h.session.pose({...old.position,z:-11.4});
 const travel=h.session.onWorldAction(stationDoor);await until(()=>h.requests.length===1);
 const body=JSON.parse(h.requests[0].options.body);assert.equal(body.fromAreaId,'SC01');assert.equal(body.locationEpoch,4);
 const next=locationCharacter('LONDON_PLATFORM',5,2);h.requests[0].resolve(reply({character:next,scene:{sceneId:next.sceneId,serverTime:2}}));
 await until(()=>h.snapshots.length===1);h.snapshots[0].resolve();await travel;
 assert.equal(h.session.state().character.areaId,'LONDON_PLATFORM');assert.equal(h.session.state().pending,0);assert.equal(h.session.state().saved.pendingAction,undefined);
 h.session.pose(next.position);const move=h.session.sendMove(true);await until(()=>h.requests.length===2);
 const packet=JSON.parse(h.requests[1].options.body);assert.equal(packet.areaId,next.areaId);assert.equal(packet.locationEpoch,5);
 h.requests[1].resolve(reply({character:{...next,revision:3},scene:{sceneId:next.sceneId,serverTime:3}}));await until(()=>h.snapshots.length===2);h.snapshots[1].resolve();await move;
});

test('a lost doorway response retries its identical receipt after polling the committed destination',async()=>{
 const h=harness(),old=locationCharacter('SC01',4);h.session.switchIdentity(tokenA,old);h.session.pose({...old.position,z:-11.4});
 const travel=h.session.onWorldAction(stationDoor);await until(()=>h.requests.length===1);const sent=JSON.parse(h.requests[0].options.body);
 h.requests[0].reject(new Error('lost committed doorway response'));await travel;
 assert.deepEqual(h.session.state().saved.pendingAction.body,sent);
 const poll=h.session.poll();await until(()=>h.requests.length===2);
 const next=locationCharacter('LONDON_PLATFORM',5,3);h.requests[1].resolve(reply({character:next,scene:{sceneId:next.sceneId,serverTime:3}}));
 await until(()=>h.snapshots.length===1);h.snapshots[0].resolve();await until(()=>h.requests.length===3);
 assert.deepEqual(JSON.parse(h.requests[2].options.body),sent,'receipt lookup must use the original request id, source and epoch rather than rewrite its payload');
 h.requests[2].resolve(reply({character:{...next,revision:2},scene:{sceneId:next.sceneId,serverTime:2},replayed:true}));await poll;
 assert.equal(h.session.state().saved.pendingAction,undefined);assert.equal(h.session.state().character.revision,3);assert.equal(h.session.state().character.areaId,'LONDON_PLATFORM');assert.equal(h.session.state().pending,0);
});
