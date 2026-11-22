import test from 'node:test';
import assert from 'node:assert/strict';
import { createMouseLook } from '../chapter-one/client/mouse-look.mjs';

class Events {
  listeners=new Map();
  addEventListener(type,handler){if(!this.listeners.has(type))this.listeners.set(type,new Set());this.listeners.get(type).add(handler);}
  removeEventListener(type,handler){this.listeners.get(type)?.delete(handler);}
  emit(type,event={}){for(const handler of [...(this.listeners.get(type)??[])])handler(event);}
  get count(){return [...this.listeners.values()].reduce((total,handlers)=>total+handlers.size,0);}
}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const flush=async()=>{for(let index=0;index<8;index++)await Promise.resolve();};
function harness({supported=true,throwOnRequest=false}={}){
  const canvas=new Events(),doc=new Events(),win=new Events(),requests=[],looks=[],states=[],captures=new Set();
  let enabled=true,time=1000,exitCount=0,exitPending=false,releases=0,casts=0;
  doc.pointerLockElement=null;doc.hidden=false;
  doc.exitPointerLock=()=>{exitCount++;exitPending=true;};
  canvas.setPointerCapture=id=>captures.add(id);canvas.hasPointerCapture=id=>captures.has(id);canvas.releasePointerCapture=id=>{captures.delete(id);canvas.emit('lostpointercapture',{pointerId:id});};
  if(supported)canvas.requestPointerLock=()=>{if(throwOnRequest)throw new Error('Pointer lock denied');const request=deferred();requests.push(request);return request.promise;};
  const helper=createMouseLook(canvas,{document:doc,window:win,enabled:()=>enabled,onLook:(dx,dy)=>looks.push([dx,dy]),onState:state=>states.push({...state}),onRelease:()=>releases++,now:()=>time});
  const pointer=(button=0,extra={})=>({button,pointerId:1,pointerType:'mouse',clientX:200,clientY:150,preventDefault(){this.prevented=true;},...extra});
  return{helper,canvas,doc,win,requests,looks,states,captures,pointer,
    setEnabled(value){enabled=value;},advance(ms){time+=ms;},
    click(extra={}){const event=pointer(0,extra),consumed=helper.pointerDown(event);if(!consumed&&event.button===0)casts++;return consumed;},
    lock(index=requests.length-1){doc.pointerLockElement=canvas;doc.emit('pointerlockchange');requests[index]?.resolve();},
    externalUnlock(){doc.pointerLockElement=null;doc.emit('pointerlockchange');},
    flushExit(){if(exitPending){exitPending=false;doc.pointerLockElement=null;doc.emit('pointerlockchange');}},
    get exits(){return exitCount;},get releases(){return releases;},get casts(){return casts;},
  };
}

test('the first canvas click captures the pointer and is consumed before any spell input',async()=>{
  const h=harness();assert.equal(h.helper.getState().mode,'free');assert(h.click());assert(h.click());assert.equal(h.casts,0);assert.equal(h.requests.length,1);assert(h.helper.getState().pending);
  h.lock();await flush();assert.equal(h.helper.getState().mode,'locked');assert.equal(h.helper.getState().pending,false);
  assert.equal(h.click(),false);assert.equal(h.casts,1,'only an already-controlled click reaches the caller spell action');assert.equal(h.requests.length,1);h.helper.dispose();
});

test('locked mouse movement uses unbounded relative deltas instead of screen edges',()=>{
  const h=harness();h.click();h.lock();
  for(let i=0;i<8;i++)h.doc.emit('mousemove',{movementX:900,movementY:i%2?30:-30,clientX:0,clientY:0});
  assert.equal(h.looks.length,8);assert.equal(h.looks.reduce((total,[dx])=>total+dx,0),7200);
  h.doc.emit('mousemove',{movementX:NaN,movementY:2});h.doc.emit('mousemove',{movementX:2,movementY:Infinity});assert.equal(h.looks.length,8);h.helper.dispose();
});

test('right drag remains usable without capture and cannot double-count locked movement',()=>{
  const h=harness(),down=h.pointer(2);assert(h.helper.pointerDown(down));assert(down.prevented);assert.equal(h.requests.length,0);assert(h.captures.has(1));
  h.canvas.emit('pointermove',{pointerId:1,buttons:2,clientX:245,clientY:130});assert.deepEqual(h.looks,[[45,-20]]);
  h.helper.request();assert.equal(h.captures.size,0);h.lock();
  h.helper.pointerDown(h.pointer(2));h.canvas.emit('pointermove',{pointerId:1,buttons:2,clientX:270,clientY:140});h.doc.emit('mousemove',{movementX:25,movementY:10});
  assert.deepEqual(h.looks,[[45,-20],[25,10]],'only the lock-relative event controls a locked view');h.helper.dispose();
});

for(const failure of ['unsupported','rejected','error-event','throws'])test(`${failure} pointer lock falls back to ordinary targeting and right drag without automatic retries`,async()=>{
  const h=harness({supported:failure!=='unsupported',throwOnRequest:failure==='throws'});
  assert.equal(h.click(),failure!=='unsupported');
  if(failure==='rejected'){h.requests[0].reject(new Error('Permission denied'));await flush();}
  if(failure==='error-event')h.doc.emit('pointerlockerror');
  assert.equal(h.helper.getState().mode,'unavailable');assert.equal(h.click(),false);
  const attempts=h.requests.length;for(let i=0;i<5;i++){h.helper.sync();h.doc.emit('mousemove',{movementX:99,movementY:1});}
  assert.equal(h.requests.length,attempts,'sync and normal cursor clicks cannot repeat a failed capture request');
  h.helper.pointerDown(h.pointer(2));h.canvas.emit('pointermove',{pointerId:1,buttons:2,clientX:230,clientY:170});assert.deepEqual(h.looks,[[30,20]]);
  h.canvas.emit('pointerup',{pointerId:1});assert.equal(h.captures.size,0);assert.equal(h.helper.getState().mode,'unavailable');h.helper.dispose();
});

test('Escape remains consumed once if pointerlockchange arrives before the Escape handler',()=>{
  const h=harness();h.click();h.lock();h.externalUnlock();assert.equal(h.helper.getState().locked,false);
  assert.equal(h.helper.release(),true,'the same browser Escape may not also open the game menu');assert.equal(h.helper.release(),false,'a second Escape is free for normal game navigation');
  assert.equal(h.exits,0,'the browser already unlocked');h.helper.dispose();
});

test('opening a panel releases control and closing it never recaptures the pointer',()=>{
  const h=harness();h.click();h.lock();h.setEnabled(false);h.helper.sync();assert.equal(h.exits,1);assert.equal(h.helper.getState().locked,false);h.flushExit();
  assert.equal(h.helper.getState().canCapture,false);assert.equal(h.click(),false);h.helper.sync();assert.equal(h.requests.length,1);
  h.setEnabled(true);h.helper.sync();assert.equal(h.helper.getState().mode,'free');assert.equal(h.requests.length,1);assert.equal(h.releases,1,'one logical release must deliver one input-reset callback');h.helper.dispose();
});

for(const reason of ['blur','hidden'])test(`${reason} releases pointer ownership and emits one release callback`,()=>{
  const h=harness();h.click();h.lock();
  if(reason==='blur')h.win.emit('blur');else{h.doc.hidden=true;h.doc.emit('visibilitychange');}
  assert.equal(h.exits,1);h.flushExit();assert.equal(h.doc.pointerLockElement,null);assert.equal(h.helper.getState().locked,false);assert.equal(h.releases,1);
  h.doc.emit('mousemove',{movementX:50,movementY:50});assert.equal(h.looks.length,0);h.helper.dispose();
});

test('a delayed capture granted after a panel opened is immediately released',async()=>{
  const h=harness();h.click();h.setEnabled(false);h.helper.sync();assert.equal(h.helper.getState().pending,false);
  h.lock();await flush();assert.equal(h.exits,1);assert.equal(h.helper.getState().locked,false);h.flushExit();
  assert.equal(h.doc.pointerLockElement,null);assert.equal(h.requests.length,1);assert.equal(h.releases,1);h.helper.dispose();
});

test('a cancelled late rejection cannot disable the next explicit capture request',async()=>{
  const h=harness();h.click();h.helper.release();h.click();assert.equal(h.requests.length,2);
  h.requests[0].reject(new Error('old denial'));await flush();assert.equal(h.helper.getState().pending,true);
  h.lock(1);await flush();assert.equal(h.helper.getState().mode,'locked');h.helper.dispose();
});

test('a capture promise arriving after disposal cannot retain pointer ownership',async()=>{
  const h=harness();h.click();h.helper.dispose();assert.equal(h.canvas.count+h.doc.count+h.win.count,0);
  h.lock();await flush();assert.equal(h.exits,1);h.flushExit();assert.equal(h.doc.pointerLockElement,null);assert.equal(h.helper.getState().locked,false);assert.equal(h.requests.length,1);
});

test('dispose exits pointer lock, releases drag capture and removes every event listener',()=>{
  for(const locked of [false,true]){
    const h=harness();if(locked){h.click();h.lock();}else h.helper.pointerDown(h.pointer(2));
    assert(h.canvas.count+h.doc.count+h.win.count>0);h.helper.dispose();h.flushExit();
    assert.equal(h.canvas.count+h.doc.count+h.win.count,0);assert.equal(h.captures.size,0);assert.equal(h.doc.pointerLockElement,null);assert.equal(h.helper.getState().canCapture,false);
    const releases=h.releases;h.helper.dispose();assert.equal(h.releases,releases);
    h.doc.emit('mousemove',{movementX:5,movementY:5});h.canvas.emit('pointermove',{pointerId:1,buttons:2,clientX:300,clientY:400});assert.equal(h.looks.length,0);assert.equal(h.helper.pointerDown(h.pointer()),false);
  }
});
