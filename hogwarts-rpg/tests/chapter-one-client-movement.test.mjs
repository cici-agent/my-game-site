import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { getPlatformIntro, getPlatformWallAdvice } from '../chapter-one/client/platform-dialogue.mjs';
import { resolveAreaId, getWorldArea } from '../chapter-one/world-atlas.mjs';
import { iconMarkup } from '../chapter-one/client/ui-icons.mjs';

const source=(await readFile(new URL('../chapter-one/client/app.mjs',import.meta.url),'utf8')).replace(/^import .*;\s*$/gm,'').replace(/^boot\(\);\s*$/m,'');
const defer=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
const character=(revision=1,sceneId='SC01',sequence=-1)=>({id:'A',heroId:'harry',revision,lastAcceptedMoveSequence:sequence,sceneId,currentQuestId:'M01',level:1,completedQuestIds:[],skills:[],position:{x:0,y:0,z:0,yaw:0}});
const response=data=>({ok:true,status:200,json:async()=>data});
const snapshot=(revision=2,sceneId='SC01',sequence=-1)=>({character:character(revision,sceneId,sequence),scene:{sceneId,serverTime:100,targets:[]},room:null,encounter:null});
async function until(condition){for(let n=0;n<30&&!condition();n++)await Promise.resolve();assert.ok(condition(),'network/render boundary not reached');}
function harness(){
 const nodes=new Map(),requests=[],packets=[],sent=[],rejected=[],snapshots=[],skillStatuses=[];let takes=0,clock=1000;
 const element=id=>{if(!nodes.has(id))nodes.set(id,{hidden:true,textContent:'',innerHTML:'',value:'',style:{},dataset:{},classList:{toggle(){}},setAttribute(name,value){this[name]=String(value);},getAttribute(name){return this[name]??null;},focus(){this.focused=true;},addEventListener(){},querySelector:x=>element(id+':'+x),querySelectorAll(selector){return id==='quick-menu'&&selector==='button[data-panel]'?['character','inventory','skills','map'].map(panel=>{const button=element(`${id}:${panel}`);button.dataset.panel=panel;return button;}):[];},insertAdjacentHTML(where,html){this.innerHTML=where==='afterbegin'?html+this.innerHTML:this.innerHTML+html;},append(){},remove(){}});return nodes.get(id);};
 const renderer={setAbilityRequestStatus(...args){skillStatuses.push(args);},takeMovementPacket(){takes++;return packets.shift()??{position:{x:0,y:0,z:0,yaw:0},steps:[],sprint:false,flying:false};},noteMovementSent(...args){sent.push(structuredClone(args));},rejectMovement(...args){rejected.push(structuredClone(args));},setSnapshot(...args){snapshots.push(structuredClone(args));return Promise.resolve();},setBlocked(){},getPose(){return{x:0,y:0,z:0,yaw:0};}};
 const context=vm.createContext({getPlatformIntro,getPlatformWallAdvice,resolveAreaId,getWorldArea,iconMarkup,crypto,structuredClone,URL,AbortSignal,console,performance:{now:()=>clock},setTimeout:()=>0,clearTimeout(){},setInterval:()=>0,clearInterval(){},
 document:{getElementById:element,addEventListener(){},createElement:element},localStorage:{getItem:()=>JSON.stringify({token:'a'.repeat(64),characterId:'A'}),setItem(){}},location:{href:'https://game.test/stone.html'},
 createSound:()=>({status:{state:'locked'},setScene(){},updateMotion(){},unlock(){},consume(){},cue(){}}),__renderer:renderer,
 fetch:(url,options)=>{const job=defer();requests.push({url,options,...job});return job.promise;},
 });
 vm.runInContext(source+`
 world=__renderer;paintHud=()=>{};playing=true;
 globalThis.__moves={act,sendMove,onWorldAction,accept,paintJourney,poll,
  setCharacter(c){character=c;},pose(p){latestPose=p;},
  state(){return {saved:structuredClone(saved),skillTransport:skillTransport&&structuredClone(skillTransport),movementRetry:movementRetry&&structuredClone(movementRetry),moveBusy,character:character&&structuredClone(character),latestPose,lastSentPose};}
 };`,context);
 const session=context.__moves;session.setCharacter(character());
 function queue(x,{flying=false,sprint=false}={}){const packet={position:{x,y:0,z:0,yaw:0},steps:[{dx:.1,dy:0,dz:0}],sprint,flying};packets.push(packet);session.pose(packet.position);return packet;}
 return{session,requests,packets,sent,rejected,snapshots,skillStatuses,queue,get takes(){return takes;},tick(ms){clock+=ms;}};
}

test('a timed-out move retries the identical sequence, request id and steps without consuming later prediction',async()=>{
 const h=harness();h.queue(.1);const first=h.session.sendMove(true);assert.equal(h.requests.length,1);
 const original=h.requests[0].options.body;h.requests[0].reject(new TypeError('network timeout'));await first;
 assert.ok(h.session.state().movementRetry);h.queue(.2);const retry=h.session.sendMove(true);assert.equal(h.requests.length,2);
 assert.equal(h.requests[1].options.body,original);assert.equal(h.takes,1);assert.equal(h.sent.length,1);assert.equal(h.packets.length,1);
 const seq=JSON.parse(original).sequence;h.requests[1].resolve(response(snapshot(2,'SC01',seq)));await retry;
 assert.equal(h.session.state().movementRetry,null);assert.equal(h.packets.length,1);
});

for(const failure of ['invalid-json','server-503'])test(`an uncertain ${failure} response keeps the exact move for idempotent retry`,async()=>{
 const h=harness();h.queue(.1);const sending=h.session.sendMove(true),original=h.requests[0].options.body;
 h.requests[0].resolve(failure==='invalid-json'?{ok:true,status:200,json:async()=>{throw new SyntaxError('truncated response');}}:{ok:false,status:503,json:async()=>({code:'STORAGE_UNAVAILABLE',error:'temporarily unavailable'})});await sending;
 assert.ok(h.session.state().movementRetry,'unknown commit outcome must not discard the input packet');
 h.queue(.2);const retry=h.session.sendMove(true);assert.equal(h.requests[1].options.body,original);assert.equal(h.takes,1);
 h.requests[1].resolve(response(snapshot(2,'SC01',JSON.parse(original).sequence)));await retry;
});

test('an explicit authority rejection forwards its exact sequence and position to the renderer',async()=>{
 const h=harness();h.queue(.1);const sending=h.session.sendMove(true),seq=JSON.parse(h.requests[0].options.body).sequence;
 const position={x:-.3,y:0,z:2,yaw:.5};h.requests[0].resolve({ok:false,status:409,json:async()=>({code:'MOVE_TOO_FAST',error:'movement rejected',rejectedSequence:seq,rejectedPosition:position})});await sending;
 assert.deepEqual(h.rejected,[[seq,position]]);assert.equal(h.session.state().movementRetry,null);assert.equal(h.session.state().moveBusy,false);
});

test('switching scene retires an old retry before any new scene input is transmitted',async()=>{
 const h=harness();h.queue(.1);const first=h.session.sendMove(true);const previous=JSON.parse(h.requests[0].options.body);h.requests[0].reject(new Error('timeout'));await first;
 await h.session.accept(snapshot(2,'SC02'));h.queue(.7);const next=h.session.sendMove(true);const current=JSON.parse(h.requests[1].options.body);
 assert.notEqual(current.requestId,previous.requestId);assert.ok(current.sequence>previous.sequence);assert.equal(current.position.x,.7);assert.equal(h.takes,2);
 h.requests[1].resolve(response(snapshot(3,'SC02',current.sequence)));await next;assert.equal(h.session.state().character.sceneId,'SC02');
});

test('a poll with an old acknowledgement leaves the timed-out input pending for a same-packet retry',async()=>{
 const h=harness();h.queue(.1);const first=h.session.sendMove(true),original=h.requests[0].options.body;h.requests[0].reject(new Error('timeout'));await first;
 h.queue(.2);await h.session.accept(snapshot(2,'SC01',-1));assert.ok(h.session.state().movementRetry);assert.equal(h.packets.length,1);
 const retry=h.session.sendMove(true);assert.equal(h.requests[1].options.body,original);h.requests[1].resolve(response(snapshot(3,'SC01',JSON.parse(original).sequence)));await retry;
});

test('an interaction waits for the in-flight move and then flushes later approach steps before sending its action',async()=>{
 const h=harness();h.queue(.1);const first=h.session.sendMove(),firstSeq=JSON.parse(h.requests[0].options.body).sequence;
 h.queue(.2);const action=h.session.onWorldAction({type:'interact',targetId:'nearby-npc'});
 h.requests[0].resolve(response(snapshot(2,'SC01',firstSeq)));await first;await until(()=>h.requests.length===2);
 const second=JSON.parse(h.requests[1].options.body);assert.equal(second.type,'move','the more recent approach must be confirmed before the proximity-sensitive action');assert.equal(second.position.x,.2);
 h.requests[1].resolve(response(snapshot(3,'SC01',second.sequence)));await until(()=>h.requests.length===3);assert.equal(JSON.parse(h.requests[2].options.body).type,'interact');
 h.requests[2].resolve(response(snapshot(4,'SC01',second.sequence)));await action;
});

test('an interaction cannot proceed while its preceding movement outcome is still unknown',async()=>{
 const h=harness();h.queue(.1);const action=h.session.onWorldAction({type:'interact',targetId:'nearby-npc'});
 h.requests[0].reject(new Error('network timeout'));await until(()=>h.session.state().movementRetry||h.requests.length>1);
 for(let n=0;n<15;n++)await Promise.resolve();assert.equal(h.requests.length,1,'no action may use a position whose move has not been acknowledged');
 await action;
});


test('stationary cast sends one HTTP request with its visual action id and no empty movement round trip',async()=>{
 const h=harness();h.session.pose({x:0,y:0,z:0,yaw:0});
 const casting=h.session.onWorldAction({type:'skill',skillId:'bolt',clientActionId:'cast-stationary-1'});await until(()=>h.requests.length===1);
 const body=JSON.parse(h.requests[0].options.body);assert.equal(body.type,'skill');assert.equal(body.requestId,'cast-stationary-1');assert.equal(body.movement,undefined);assert.equal(body.clientActionId,undefined);
 h.requests[0].resolve(response(snapshot(2)));await casting;assert.deepEqual(h.skillStatuses,[['cast-stationary-1','settled']]);
});

test('moving cast submits all unsent footsteps and the spell in one atomic request',async()=>{
 const h=harness();h.queue(.3);const casting=h.session.onWorldAction({type:'skill',skillId:'bolt',clientActionId:'cast-with-move-1'});await until(()=>h.requests.length===1);
 const body=JSON.parse(h.requests[0].options.body);assert.equal(body.type,'skill');assert.equal(body.movement.position.x,.3);assert.equal(body.movement.steps.length,1);assert.equal(h.sent.length,1);
 h.queue(.4);await h.session.sendMove();assert.equal(h.requests.length,1,'followup movement must not overtake an unconfirmed cast batch');
 h.requests[0].resolve(response(snapshot(2,'SC01',body.movement.sequence)));await casting;
 assert.equal(h.session.state().skillTransport,null);assert.equal(h.packets.length,1,'new movement is preserved for next batch');
});

test('cast waits only for the existing move, then combines later steps instead of another move round trip',async()=>{
 const h=harness();h.queue(.1);const moving=h.session.sendMove();const first=JSON.parse(h.requests[0].options.body);
 h.queue(.2);const casting=h.session.onWorldAction({type:'skill',skillId:'bolt',clientActionId:'cast-following-move'});
 await h.session.sendMove();assert.equal(h.requests.length,1);
 h.requests[0].resolve(response(snapshot(2,'SC01',first.sequence)));await moving;await until(()=>h.requests.length===2);
 const body=JSON.parse(h.requests[1].options.body);assert.equal(body.type,'skill');assert.equal(body.movement.position.x,.2);
 h.requests[1].resolve(response(snapshot(3,'SC01',body.movement.sequence)));await casting;assert.equal(h.requests.length,2);
});

test('unknown combined cast outcome blocks later moves and retries the exact spell and footsteps',async()=>{
 const h=harness();h.queue(.1);const casting=h.session.onWorldAction({type:'skill',skillId:'bolt',clientActionId:'cast-retry-batch'});await until(()=>h.requests.length===1);
 const body=h.requests[0].options.body,seq=JSON.parse(body).movement.sequence;
 h.requests[0].reject(new Error('network timeout'));await assert.rejects(casting,{code:'NETWORK'});
 h.queue(.2);await h.session.sendMove();assert.equal(h.requests.length,1);assert.equal(h.session.state().saved.pendingAction.body.requestId,'cast-retry-batch');
 assert.deepEqual(h.skillStatuses,[['cast-retry-batch','retrying']]);
 const polling=h.session.poll();h.requests[1].resolve(response(snapshot(2,'SC01',seq)));await until(()=>h.requests.length===3);
 assert.equal(h.requests[2].options.body,body);h.requests[2].resolve(response(snapshot(2,'SC01',seq)));await polling;
 assert.equal(h.session.state().saved.pendingAction,undefined);assert.equal(h.session.state().skillTransport,null);assert.equal(h.packets.length,1);assert.equal(h.skillStatuses.at(-1)[1],'settled');
});

test('terminal combined spell rejection corrects the rolled-back movement and releases the cast gate',async()=>{
 const h=harness();h.queue(.2);const casting=h.session.onWorldAction({type:'skill',skillId:'H1',clientActionId:'cast-rejected-batch'});await until(()=>h.requests.length===1);
 const body=JSON.parse(h.requests[0].options.body),position={x:0,y:0,z:0,yaw:0};
 h.requests[0].resolve({ok:false,status:409,json:async()=>({error:'cooldown',code:'COOLDOWN',rejectedSequence:body.movement.sequence,rejectedPosition:position})});
 await assert.rejects(casting,{code:'COOLDOWN'});assert.deepEqual(h.rejected,[[body.movement.sequence,position]]);assert.equal(h.session.state().skillTransport,null);assert.equal(h.session.state().saved.pendingAction,undefined);assert.equal(h.skillStatuses.at(-1)[1],'rejected');
});

test('an unknown spell cannot be overwritten by a later non-skill mutation and its exact retry remains valid',async()=>{
 const h=harness();h.queue(.1);
 const first=h.session.onWorldAction({type:'skill',skillId:'bolt',clientActionId:'cast-preserve-unknown'});await until(()=>h.requests.length===1);
 const original=h.requests[0].options.body;h.requests[0].reject(new Error('lost response'));await assert.rejects(first,{code:'NETWORK'});
 const pending=h.session.state().saved.pendingAction;
 await assert.rejects(h.session.act({type:'interact',targetId:'nearby-npc'}),{code:'ACTION_PENDING'});
 assert.equal(h.requests.length,1);assert.deepEqual(h.session.state().saved.pendingAction,pending);
 const retry=h.session.act(pending.body,{retryId:pending.body.requestId});await until(()=>h.requests.length===2);
 assert.equal(h.requests[1].options.body,original);
 h.requests[1].resolve(response(snapshot(2,'SC01',JSON.parse(original).movement.sequence)));await retry;
 assert.equal(h.session.state().saved.pendingAction,undefined);assert.equal(h.session.state().skillTransport,null);
});

test('a mutation already queued behind a request is blocked if that earlier result becomes unknown',async()=>{
 const h=harness();
 const first=h.session.act({type:'interact',targetId:'npc-a'},{retryId:'unknown-operation-a'});await until(()=>h.requests.length===1);
 const next=h.session.act({type:'interact',targetId:'npc-b'},{retryId:'blocked-operation-b'});
 const nextRejected=assert.rejects(next,{code:'ACTION_PENDING'});
 h.requests[0].reject(new Error('network timeout'));await assert.rejects(first,{code:'NETWORK'});await nextRejected;
 assert.equal(h.requests.length,1);assert.equal(h.session.state().saved.pendingAction.body.requestId,'unknown-operation-a');
});

test('an unknown non-skill request stops spell input before taking unsent movement',async()=>{
 const h=harness();
 const first=h.session.act({type:'interact',targetId:'npc-a'},{retryId:'pending-conversation'});await until(()=>h.requests.length===1);
 h.requests[0].reject(new Error('network timeout'));await assert.rejects(first,{code:'NETWORK'});
 h.queue(.2);const before=h.takes;
 await assert.rejects(h.session.onWorldAction({type:'skill',skillId:'bolt',clientActionId:'must-not-drain'}),{code:'ACTION_PENDING'});
 assert.equal(h.takes,before);assert.equal(h.packets.length,1);assert.equal(h.requests.length,1);
 assert.equal(h.session.state().saved.pendingAction.body.requestId,'pending-conversation');
});
