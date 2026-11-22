import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import * as Three from 'three';
import { applyEquipmentAppearance } from '../chapter-one/presentation/equipment-appearance.mjs';
const source = (await readFile(new URL('../chapter-one/client/character-preview.mjs', import.meta.url), 'utf8')).replace(/^import .*;\s*$/gm, '').replace(/^export /gm, '');
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => { resolve=a;reject=b; }); return { promise, resolve, reject }; };
const flush = () => new Promise(resolve => setImmediate(resolve));
class Node {
  constructor(doc) { this.ownerDocument=doc;this.children=[];this.style={};this.dataset={};this.isConnected=true;this.listeners=new Map(); }
  append(node) { this.children.push(node);node.parent=this; }
  remove() { this.parent.children=this.parent.children.filter(node=>node!==this); }
  setAttribute() {} addEventListener(type, fn) { this.listeners.set(type, fn); } removeEventListener(type) { this.listeners.delete(type); }
  getBoundingClientRect() { return { width: 320, height: 440 }; } setPointerCapture() {}
}
function actor(heroId) {
  const root=new Three.Group(), calls={updates:0,dispose:0};
  return {root,model:root,capabilities:{heroId,appearance:'fake-for-lifecycle'},calls,
    resetPresentation({position,yaw}){root.position.fromArray(position);root.rotation.y=yaw;},setExpressionContext(){},updateTravel(){calls.updates++;},dispose(){calls.dispose++;root.removeFromParent();}};
}
function harness() {
  const doc={hidden:false,createElement(){return new Node(doc);}},container=new Node(doc),loads=[],errors=[],frames=new Map();let serial=0,disposed=0,contextsLost=0,renders=0;
  class Renderer { shadowMap={};setPixelRatio(){}setSize(){}render(){renders++;}dispose(){disposed++;}forceContextLoss(){contextsLost++;} }
  const context=vm.createContext({THREE:{...Three,WebGLRenderer:Renderer},applyEquipmentAppearance,loadPlayableCharacter:heroId=>{const pending=deferred();loads.push({heroId,...pending});return pending.promise;},requestAnimationFrame:fn=>{const id=++serial;frames.set(id,fn);return id;},cancelAnimationFrame:id=>frames.delete(id),devicePixelRatio:1,addEventListener(){},removeEventListener(){},ResizeObserver:class{observe(){}disconnect(){}},console});
  vm.runInContext(source+'\nglobalThis.make=createCharacterPreview;',context);
  const preview=context.make({container,onError:error=>errors.push(error)});
  return {preview,container,doc,loads,errors,frames,get disposed(){return disposed;},get contextsLost(){return contextsLost;},get renders(){return renders;},frame(time){const [id,fn]=frames.entries().next().value;frames.delete(id);fn(time);}};
}

test('preview uses one load for repeated snapshots and supports independent rotation and idle',async()=>{
  const h=harness(), a=h.preview.setCharacter({heroId:'harry'}), b=h.preview.setCharacter({heroId:'harry',equipment:{top:null}});await flush();assert.equal(h.loads.length,1);
  const harry=actor('harry');h.loads[0].resolve(harry);await a;await b;
  assert.equal(h.container.dataset.previewState,'ready');assert.equal(harry.root.visible,true);
  h.preview.rotate(.4);assert.equal(harry.root.rotation.y,Math.PI+.4);h.preview.resetView();assert.equal(harry.root.rotation.y,Math.PI);
  h.frame(100);h.frame(130);assert.equal(harry.calls.updates,2);assert.equal(h.renders,2);
  h.doc.hidden=true;h.frame(160);assert.equal(h.renders,2,'hidden previews never issue GPU draws');
  await h.preview.setCharacter({heroId:'harry',equipment:{top:'new-top'}});assert.equal(h.loads.length,1);
  h.preview.dispose();h.preview.dispose();assert.equal(harry.calls.dispose,1);assert.equal(h.disposed,1);assert.equal(h.contextsLost,1);assert.equal(h.frames.size,0);assert.equal(h.container.children.length,0);
});

test('latest hero wins rapid asynchronous switches and a late close disposes the incoming instance',async()=>{
  const h=harness(), first=h.preview.setCharacter({heroId:'harry'}), second=h.preview.setCharacter({heroId:'ron'});await flush();
  const ron=actor('ron'),harry=actor('harry');h.loads[1].resolve(ron);await second;h.loads[0].resolve(harry);await first;
  assert.equal(ron.root.visible,true);assert.equal(harry.root.visible,false);
  const closing=h.preview.setCharacter({heroId:'hermione'});await flush();h.preview.dispose();
  const hermione=actor('hermione');h.loads[2].resolve(hermione);assert.equal(await closing,null);
  assert.equal(hermione.calls.dispose,1);assert.equal(ron.calls.dispose,1);assert.equal(harry.calls.dispose,1);assert.equal(h.container.children.length,0);assert.equal(h.errors.length,0);
});

test('failed loading can retry without leaking renderers or replacing a newer success',async()=>{
  const h=harness(), first=h.preview.setCharacter({heroId:'harry'});await flush();h.loads[0].reject(new Error('asset unavailable'));await assert.rejects(first,/asset unavailable/);
  assert.equal(h.container.dataset.previewState,'error');assert.equal(h.errors.length,1);
  const retry=h.preview.setCharacter({heroId:'harry'});await flush();const harry=actor('harry');h.loads[1].resolve(harry);await retry;
  assert.equal(h.container.dataset.previewState,'ready');assert.equal(h.disposed,0);h.preview.dispose();assert.equal(h.disposed,1);
});
